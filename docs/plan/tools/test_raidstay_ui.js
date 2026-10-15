// RAID STAY INSIDE (2026-10-14): the fight-area editor buttons "Fit to safe ground" + "Stay inside" (sandbox server, mocked MCP; nothing is saved).
//   node docs/plan/tools/test_raidstay_ui.js [screenshot dir]
'use strict';
const path = require('path'), fs = require('fs'), cp = require('child_process'), os = require('os');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const OUT = process.argv[2] || path.join(os.tmpdir(), 'raidstay_shots');
const EDGE = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find(f => fs.existsSync(f));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const results = []; const ok = (name, cond, info) => { results.push({ name, ok: !!cond }); console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${info ? ' — ' + info : ''}`); };

(async () => {
  if (!EDGE) { console.log('no Edge / Chrome — UI test skipped'); process.exit(0); }
  fs.mkdirSync(OUT, { recursive: true });
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'rsui-'));
  const RFILE = path.join(TMP, 'stash_rules.json');
  const LIVE = path.join(ROOT, 'Scripts', 'data', 'stash_rules.json'); const liveSt = () => { try { return fs.readFileSync(LIVE, 'utf8'); } catch (e) { return 'absent'; } }; const LIVE0 = liveSt();
  fs.writeFileSync(RFILE, LIVE0 === 'absent' ? '{}' : LIVE0);
  const srv = cp.spawn(process.execPath, [path.join(__dirname, 'cmdcenter_testserver.js')], { stdio: ['ignore', 'pipe', 'pipe'], env: Object.assign({}, process.env, { SWARM_STASHRULES_FILE: RFILE }) });
  let PORT = 0; const mcpLog = [];
  srv.stdout.on('data', d => String(d).split('\n').forEach(l => { const m = l.match(/^PORT (\d+)/); if (m) PORT = +m[1]; else if (l.startsWith('MCP ')) mcpLog.push(l); }));
  srv.stderr.on('data', d => process.stderr.write('[server] ' + d));
  for (let i = 0; i < 100 && !PORT; i++) await sleep(100);
  if (!PORT) throw new Error('sandbox server did not start');
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'rs-edge-'));
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
  const shot = async (name) => { const r = await cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, `raidstay_${name}.png`), Buffer.from(r.data, 'base64')); };
  const browserDialogs = [], dialogs = [], errors = [];
  handlers.push((m) => {
    if (m.method === 'Page.javascriptDialogOpening') { browserDialogs.push(m.params.type); cdp('Page.handleJavaScriptDialog', { accept: true }).catch(() => { }); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception ? m.params.exceptionDetails.exception.description : m.params.exceptionDetails.text);
  });
  await cdp('Page.enable'); await cdp('Runtime.enable');
  await require('./uidialog_testhook')(cdp, handlers, { answer: true, onDialog: (d) => dialogs.push(d) });
  const BASE = `http://127.0.0.1:${PORT}/`;
  const phone = async () => { await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }); await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }); };
  const desktop = async () => { await cdp('Emulation.setDeviceMetricsOverride', { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false }); await cdp('Emulation.setTouchEmulationEnabled', { enabled: false }); };
  const click = (sel) => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; e.click(); return true; })()`);
  const setSel = (sel, v) => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; e.value = ${JSON.stringify(v)}; e.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
  const file = () => JSON.parse(fs.readFileSync(RFILE, 'utf8'));
  const noScroll = () => ev(`document.documentElement.scrollWidth <= innerWidth + 1`);

  await phone();
  await cdp('Page.navigate', { url: BASE + '#/edit/raidarea/25007' });
  ok('editor opens for Retreat Spider Cletu with the new buttons', await waitFor(`!!document.getElementById('peRaFitG') && !document.getElementById('peRaTools').hidden && /Cletu/.test(document.getElementById('peName').textContent)`, 20000));
  await sleep(1500);
  await ev(`(() => { const i = document.getElementById('peRaN'); i.value = '900'; return true; })()`);
  await click('#peRaFitG');
  ok('"Fit to safe ground" replaces the circle with the trimmed outline', await waitFor(`/safe ground within 900/.test(document.getElementById('peToast').textContent)`, 15000), await ev(`document.getElementById('peToast').textContent`));
  await sleep(800); await shot('01_iphone_fit');
  await click('#peRaStay'); await sleep(600);
  ok('"Stay inside" asks first (uidialog), then shows ON', await waitFor(`/Stay inside: ON/.test(document.getElementById('peRaStay').textContent)`, 5000) && dialogs.some(d => /Stay inside the fight area/.test(d.title || '')));
  await shot('02_iphone_stay');
  ok('no browser alert / confirm / prompt was used', !browserDialogs.length);
  ok('no script errors in the page', !errors.length, errors.slice(0, 3).join(' | '));
  const fails = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - fails} passed, ${fails} failed — screenshots in ${OUT}`);
  try { sock.close(); } catch (e) { } br.kill(); srv.kill();
  try { fs.rmSync(prof, { recursive: true, force: true }); fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { }
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
