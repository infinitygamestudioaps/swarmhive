// Headless check of the "What runs by itself" page #/auto (Discord player Roketta 2026-10-15). Edge via CDP against the SANDBOX server
// (cmdcenter_testserver.js: the real Dashboard/server.js with MCP mocked, nothing reaches the game; the page is read-only, every POST is
// intercepted in the browser anyway). iPhone 390x844:
//   the tab button -> party chips -> one row per catalog entry with a state pill, the why line and "Switch: …" -> filters (Running / Off /
//   Waits for Start) -> "Change" on a Supplies row opens the party settings popup with the Supplies section unfolded -> a page link
//   (Storage) changes the route -> no horizontal scroll, no page errors.
// Screenshots: %TEMP%\autooverview_shots (or the dir given)
//   node docs/plan/tools/test_auto_overview_ui.js [screenshot dir]
'use strict';
const path = require('path'), fs = require('fs'), cp = require('child_process'), os = require('os');
const OUT = process.argv[2] || path.join(os.tmpdir(), 'autooverview_shots');
const EDGE = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find(f => fs.existsSync(f));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let fails = 0; const ok = (name, cond, info) => { if (!cond) fails++; console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${info ? ' — ' + info : ''}`); };
const CAT = require(path.join(__dirname, '..', '..', '..', 'Dashboard', 'autocatalog.js'));

(async () => {
  if (!EDGE) { console.log('no Edge / Chrome found — skipped'); process.exit(0); }
  fs.mkdirSync(OUT, { recursive: true });
  const srv = cp.spawn(process.execPath, [path.join(__dirname, 'cmdcenter_testserver.js')], { stdio: ['ignore', 'pipe', 'pipe'] });
  let PORT = 0; const mcp = [];
  srv.stdout.on('data', d => String(d).split('\n').forEach(l => { const m = l.match(/^PORT (\d+)/); if (m) PORT = +m[1]; else if (l.startsWith('MCP ')) mcp.push(l); }));
  srv.stderr.on('data', d => process.stderr.write('[server] ' + d));
  for (let i = 0; i < 100 && !PORT; i++) await sleep(100);
  if (!PORT) throw new Error('sandbox server did not start');
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'au-edge-'));
  const DBG = 9300 + Math.floor(Math.random() * 500);
  const br = cp.spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', `--remote-debugging-port=${DBG}`, `--user-data-dir=${prof}`, 'about:blank'], { stdio: 'ignore' });
  let ws = null;
  for (let i = 0; i < 60 && !ws; i++) { await sleep(250); try { const l = await (await fetch(`http://127.0.0.1:${DBG}/json/list`)).json(); const p = l.find(x => x.type === 'page'); if (p) ws = p.webSocketDebuggerUrl; } catch (e) { } }
  if (!ws) throw new Error('no browser');
  const sock = new WebSocket(ws); await new Promise((r, j) => { sock.onopen = r; sock.onerror = j; });
  let id = 0; const pend = {}, handlers = [];
  sock.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pend[m.id]) { pend[m.id](m); delete pend[m.id]; } else handlers.forEach(h => h(m)); };
  const cdp = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend[i] = (m) => m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result); sock.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception ? r.exceptionDetails.exception.description : r.exceptionDetails.text); return r.result.value; };
  const waitFor = async (expr, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await ev(expr)) return true; } catch (e) { } await sleep(150); } return false; };
  const posts = [], errors = [];
  handlers.push(async (m) => {
    if (m.method === 'Runtime.exceptionThrown') errors.push(JSON.stringify(m.params.exceptionDetails).slice(0, 300));
    if (m.method !== 'Fetch.requestPaused') return;
    const rq = m.params.request, rid = m.params.requestId;
    if (rq.method === 'POST') { posts.push(rq.url); return cdp('Fetch.fulfillRequest', { requestId: rid, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }], body: Buffer.from(JSON.stringify({ ok: true, intercepted: true })).toString('base64') }).catch(() => { }); }
    cdp('Fetch.continueRequest', { requestId: rid }).catch(() => { });
  });
  await cdp('Page.enable'); await cdp('Runtime.enable');
  await require('./uidialog_testhook')(cdp, handlers, { answer: false });
  await cdp('Fetch.enable', { patterns: [{ urlPattern: '*/api/*', requestStage: 'Request' }] });
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  const shot = async (name) => { await sleep(400); const r = await cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, `auto_${name}.png`), Buffer.from(r.data, 'base64')); };
  const click = (sel) => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; e.click(); return true; })()`);

  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/#/parties` });
  ok('dashboard loads with the Automations tab button', await waitFor(`!!document.querySelector('#tabs [data-tab="auto"]')`, 30000));
  await waitFor(`!!(window.AutoPage && window.AutoCatalog && window.PartySettings)`, 20000);   // the page scripts load at the end of index.html
  await click('#tabs [data-tab="auto"]');
  ok('#/auto opens the page', await waitFor(`location.hash === '#/auto' && !!document.getElementById('tab-auto') && !document.getElementById('tab-auto').hidden`, 8000));
  ok('party chips + rows load from /api/autooverview', await waitFor(`document.querySelectorAll('#auParties [data-auparty]').length > 0 && document.querySelectorAll('#auBody .au-row').length > 10`, 20000));
  const v = await ev(`(() => { const rows = [...document.querySelectorAll('#auBody .au-row')]; return { n: rows.length, keys: rows.map(r => r.dataset.aukey),
    pills: rows.map(r => r.querySelector('.au-pill').textContent), whys: rows.map(r => r.querySelector('.au-why').textContent), sw: rows.every(r => /^Switch: /.test(r.querySelector('.au-sw').textContent.trim())),
    parties: [...document.querySelectorAll('#auParties [data-auparty]')].map(b => b.dataset.auparty), over: document.documentElement.scrollWidth > innerWidth + 1,
    minBtn: Math.min(...[...document.querySelectorAll('#auBody .au-go, #auParties button')].map(b => b.getBoundingClientRect().height)) }; })()`);
  ok(`one row per catalog entry (${v.n} of ${CAT.ENTRIES.length})`, v.n === CAT.ENTRIES.length, v.keys.filter(k => !CAT.byKey[k]).join(','));
  ok('every row: a state pill + a why sentence + "Switch: …"', v.pills.every(p => /^(ON|OFF|WAITS FOR START|ALWAYS ON|YOUR ORDER|NEVER BY ITSELF)$/.test(p)) && v.whys.every(w => w.length > 5 && !/undefined/.test(w)) && v.sw, [...new Set(v.pills)].join(' | '));
  ok('no horizontal scroll at 390 px', !v.over);
  ok('big tap targets (>= 44 px)', v.minBtn >= 43.5, String(v.minBtn));
  await shot('phone_all');
  await ev(`(document.querySelectorAll('#auBody .au-grp')[4].scrollIntoView(), true)`); await shot('phone_rows'); await ev('(window.scrollTo(0, 0), true)');
  // filters
  for (const [f, re] of [['on', /^(ON|ALWAYS ON)$/], ['off', /^OFF$/], ['paused', /^WAITS FOR START$/]]) {
    await click(`[data-aufilter="${f}"]`); await sleep(150);
    const p = await ev(`[...document.querySelectorAll('#auBody .au-pill')].map(x => x.textContent)`);
    ok(`filter "${f}": only matching rows (${p.length})`, p.every(x => re.test(x)));
  }
  await click('[data-aufilter="all"]');
  // a second party
  if (v.parties.length > 1) { await click(`[data-auparty="${v.parties[1]}"]`); await sleep(200);
    ok(`party chip switches the party (${v.parties[1]})`, await ev(`/Party ${v.parties[1]}/.test(document.querySelector('#auBody .au-sum').textContent) && location.hash === '#/auto/${encodeURIComponent(v.parties[1])}'`)); }
  // Change -> party settings popup with Supplies open
  await click('[data-auwhere="supplyWatch"]');
  ok('"Change" on Supply runs opens the party settings popup at Supplies', await waitFor(`!!document.querySelector('#psBody details[data-pssec="supplies"][open]')`, 10000));
  await shot('phone_settings');
  await ev(`(window.PartySettings && PartySettings.close(), true)`); await sleep(300);
  await click('[data-auwhere="letters"]');
  ok('a page target (Storage) changes the route', await waitFor(`location.hash === '#/storage'`, 5000));
  await ev(`(location.hash = '#/auto', true)`);
  ok('back on #/auto the page shows again', await waitFor(`!document.getElementById('tab-auto').hidden && document.querySelectorAll('#auBody .au-row').length > 10`, 8000));
  ok('read-only: no POST sent', !posts.length, posts.slice(0, 3).join(' ; '));
  ok('no page errors', !errors.length, errors.slice(0, 2).join(' ; '));
  ok('no MCP call that changes anything', !mcp.some(l => !/get_accounts_status|get_account_status|get_account_data/.test(l)));
  try { sock.close(); } catch (e) { } br.kill(); srv.kill();
  console.log(fails ? `\n${fails} check(s) FAILED — screenshots in ${OUT}` : `\nall checks passed — screenshots in ${OUT}`); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
