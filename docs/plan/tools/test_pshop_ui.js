// PSHOP (2026-10-15, "Shots step 2") — Market page "Shots B/A/S" view: headless Edge via CDP against the SANDBOX server
// (cmdcenter_testserver.js: mocked MCP, nothing reaches the game). party_auto.json is a SCRATCH copy (SWARM_PARTYAUTO_FILE) with one party's
// player-shop max prices; Logs/market_giran.json is only READ. Checks: 9 shot rows (soulshot / blessed / plain x B / A / S), the party's max
// price chips, no browser alert / confirm / prompt, no page errors, no horizontal scroll on an iPhone, the live file unchanged.
//   node docs/plan/tools/test_pshop_ui.js [screenshot dir]   (default: %TEMP%\pshop_shots)
'use strict';
const path = require('path'), fs = require('fs'), cp = require('child_process'), os = require('os');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const OUT = process.argv[2] || path.join(os.tmpdir(), 'pshop_shots');
const EDGE = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find(f => fs.existsSync(f));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let fails = 0; const ok = (name, cond, info) => { console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${info ? ' — ' + info : ''}`); if (!cond) fails++; };
const LIVE = path.join(ROOT, 'Scripts', 'data', 'party_auto.json'), live0 = (() => { try { return fs.readFileSync(LIVE, 'utf8'); } catch (e) { return null; } })();

(async () => {
  if (!EDGE) { console.log('no Edge / Chrome — UI test skipped'); process.exit(0); }
  fs.mkdirSync(OUT, { recursive: true });
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'pshopui-')), PA = path.join(TMP, 'party_auto.json');
  fs.writeFileSync(PA, JSON.stringify({ v: 1, default: {}, parties: { TestLeader: { pshop: { on: true, max: { soulshot: { B: 12, S: 9999999 }, blessed: { A: 40 } } } }, OffParty: { pshop: { on: false, max: { soulshot: { B: 5 } } } } }, chars: {} }));
  const srv = cp.spawn(process.execPath, [path.join(__dirname, 'cmdcenter_testserver.js')], { stdio: ['ignore', 'pipe', 'pipe'], env: Object.assign({}, process.env, { SWARM_PARTYAUTO_FILE: PA }) });
  let port = 0; srv.stdout.on('data', d => String(d).split('\n').forEach(l => { const m = l.match(/^PORT (\d+)/); if (m) port = +m[1]; }));
  srv.stderr.on('data', d => process.stderr.write('[server] ' + d));
  for (let i = 0; i < 150 && !port; i++) await sleep(100);
  if (!port) throw new Error('sandbox server did not start');
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'pshop-edge-')), DBG = 9850 + Math.floor(Math.random() * 100);
  const br = cp.spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', `--remote-debugging-port=${DBG}`, `--user-data-dir=${prof}`, 'about:blank'], { stdio: 'ignore' });
  let ws = null;
  for (let i = 0; i < 60 && !ws; i++) { await sleep(250); try { const l = await (await fetch(`http://127.0.0.1:${DBG}/json/list`)).json(); const p = l.find(x => x.type === 'page'); if (p) ws = p.webSocketDebuggerUrl; } catch (e) { } }
  if (!ws) throw new Error('no browser');
  const sock = new WebSocket(ws); await new Promise((r, j) => { sock.onopen = r; sock.onerror = j; });
  let id = 0; const pend = {}, handlers = [];
  sock.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend[m.id]) { pend[m.id](m); delete pend[m.id]; } else handlers.forEach(h => h(m)); };
  const cdp = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend[i] = (m) => m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result); sock.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.text); return r.result.value; };
  const waitFor = async (expr, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await ev(expr)) return true; } catch (e) { } await sleep(150); } return false; };
  const browserDialogs = [], errors = [];
  handlers.push((m) => {
    if (m.method === 'Page.javascriptDialogOpening') { browserDialogs.push(m.params.type); cdp('Page.handleJavaScriptDialog', { accept: true }).catch(() => { }); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception ? m.params.exceptionDetails.exception.description : m.params.exceptionDetails.text);
  });
  try {
    await cdp('Page.enable'); await cdp('Runtime.enable');
    await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await cdp('Page.navigate', { url: `http://127.0.0.1:${port}/#/market` });
    ok('the Market page opens with a "Shots B/A/S" choice', await waitFor(`!!document.querySelector('[data-mkkind="shots"]')`, 25000));
    const api = await ev(`fetch('/api/market').then(r => r.json()).then(d => d.shots)`);
    ok('/api/market sends the shots summary (9 items, the scratch parties)', api && api.items.length === 9 && api.parties.length === 2 && api.parties.find(p => p.leader === 'TestLeader').max[1465] === 12, JSON.stringify(api && api.parties));
    await ev(`document.querySelector('[data-mkkind="shots"]').click()`);
    ok('Shots: 9 rows (soulshot, blessed, plain spiritshot x B / A / S)', await waitFor(`document.querySelectorAll('#mkList .mkt-shot').length === 9`));
    const chips = await ev(`[...document.querySelectorAll('#mkList .mkt-chip')].map(c => c.className + '|' + c.textContent)`);
    ok('the party max prices show with thousands separators; a switched-off party is marked (off)', chips.some(c => /TestLeader: max 12/.test(c)) && chips.some(c => /TestLeader: max 9,999,999/.test(c)) && chips.some(c => /TestLeader: max 40/.test(c)) && chips.some(c => /off\|OffParty: max 5 \(off\)/.test(c)), chips.join(' / '));
    const best = api.items.filter(i => i.offers.length);
    const wantOk = api.items.reduce((n, it) => n + api.parties.filter(p => p.on && p.max[it.id] > 0 && it.offers[0] && it.offers[0].price <= p.max[it.id]).length, 0);
    ok(`✓ chips = (party on, cheapest at or below its max): ${wantOk} expected; ${best.length ? best.length + ' shot kinds on offer' : 'nothing on offer in the live scan -> "not on offer"'}`,
      (await ev(`document.querySelectorAll('#mkList .mkt-chip.ok').length`)) === wantOk && (best.length === 9 || /not on offer in the last scan/.test(await ev(`document.getElementById('mkList').textContent`))));
    ok('iPhone: no horizontal scroll', await ev(`document.documentElement.scrollWidth <= innerWidth + 1`));
    await ev(`(() => { const e = document.querySelector('#mkList'); if (e) e.scrollIntoView({ block: 'start' }); return true; })()`); await sleep(250);
    const r = await cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, 'market_shots_iphone.png'), Buffer.from(r.data, 'base64'));
    ok('no browser alert / confirm / prompt', !browserDialogs.length, browserDialogs.join());
    ok('no script errors in the page', !errors.length, errors.join(' | ').slice(0, 300));
    ok('the live party_auto.json was not changed', (() => { try { return fs.readFileSync(LIVE, 'utf8') === live0; } catch (e) { return live0 === null; } })());
  } catch (e) { ok('no exception', false, e.message); }
  finally { try { sock.close(); } catch (e) { } try { br.kill(); } catch (e) { } try { srv.kill(); } catch (e) { } }
  console.log(fails ? `\n${fails} FAILED` : `\nall market shots UI checks passed — screenshot in ${OUT}`); process.exit(fails ? 1 : 0);
})();
