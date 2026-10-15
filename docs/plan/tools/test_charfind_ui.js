// CHARACTER FINDER (2026-10-14): headless check of the header 'Find character' sheet (Edge via CDP) against the SANDBOX server (mocked MCP).
//   node docs/plan/tools/test_charfind_ui.js [screenshot dir]
'use strict';
const path = require('path'), fs = require('fs'), cp = require('child_process'), os = require('os');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const OUT = process.argv[2] || path.join(os.tmpdir(), 'charfind_shots');
const EDGE = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find(f => fs.existsSync(f));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const results = []; const ok = (name, cond, info) => { results.push({ name, ok: !!cond }); console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${info ? ' — ' + info : ''}`); };

(async () => {
  if (!EDGE) { console.log('no Edge / Chrome — UI test skipped'); process.exit(0); }
  fs.mkdirSync(OUT, { recursive: true });
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'cfui-'));
  const RFILE = path.join(TMP, 'stash_rules.json');
  const LIVE = path.join(ROOT, 'Scripts', 'data', 'stash_rules.json'); const liveSt = () => { try { return fs.readFileSync(LIVE, 'utf8'); } catch (e) { return 'absent'; } }; const LIVE0 = liveSt();
  fs.writeFileSync(RFILE, LIVE0 === 'absent' ? '{}' : LIVE0);
  const srv = cp.spawn(process.execPath, [path.join(__dirname, 'cmdcenter_testserver.js')], { stdio: ['ignore', 'pipe', 'pipe'], env: Object.assign({}, process.env, { SWARM_STASHRULES_FILE: RFILE }) });
  let PORT = 0; const mcpLog = [];
  srv.stdout.on('data', d => String(d).split('\n').forEach(l => { const m = l.match(/^PORT (\d+)/); if (m) PORT = +m[1]; else if (l.startsWith('MCP ')) mcpLog.push(l); }));
  srv.stderr.on('data', d => process.stderr.write('[server] ' + d));
  for (let i = 0; i < 100 && !PORT; i++) await sleep(100);
  if (!PORT) throw new Error('sandbox server did not start');
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-edge-'));
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
  const shot = async (name) => { const r = await cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, `charfind_${name}.png`), Buffer.from(r.data, 'base64')); };
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
  await cdp('Page.navigate', { url: BASE + '#/parties' });
  ok('header: a Find character button', await waitFor(`!!document.getElementById('cfBtn')`, 20000));
  await waitFor(`window.STATE && STATE.chars && STATE.chars.length > 0`, 20000);
  const n = await ev(`STATE.chars.length`);
  await click('#cfBtn');
  ok('the sheet opens with a search box and every character', await waitFor(`!!document.getElementById('cfQ') && document.querySelectorAll('#cfList [data-cfname]').length >= ${n}`, 5000), n + ' characters');
  await shot('01_iphone_open');
  const pick = await ev(`STATE.chars.slice().sort((a, b) => a.name.localeCompare(b.name))[Math.floor(STATE.chars.length / 2)].name`);
  const typeQ = (v) => ev(`(() => { const q = document.getElementById('cfQ'); q.value = ${JSON.stringify(v)}; q.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  await typeQ(pick.slice(0, 4).toLowerCase()); await sleep(200); await shot('02_iphone_search');
  ok('typing filters the list (part of the name, any case)', await ev(`(() => { const L = [...document.querySelectorAll('#cfList [data-cfname]')].map(b => b.dataset.cfname); return L.length >= 1 && L.length < ${n} && L.includes(${JSON.stringify(pick)}); })()`));
  ok('no sideways scroll with the sheet open', await noScroll());
  await click(`#cfList [data-cfname="${pick}"]`);
  ok('tap = the character page, sheet closed', await waitFor(`location.hash === '#/char/' + encodeURIComponent(${JSON.stringify(pick)}) && !document.getElementById('cfOv')`, 5000));
  await click('#cfBtn'); await sleep(300);
  ok('the last opened character is on top', await ev(`/Opened lately/.test(document.getElementById('cfList').textContent) && document.querySelector('#cfList [data-cfname]').dataset.cfname === ${JSON.stringify(pick)}`));
  await typeQ('zzqq'); await sleep(150);
  ok('no match = a plain sentence', await ev(`/No character matches/.test(document.getElementById('cfList').textContent)`));
  await ev(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`); await sleep(150);
  ok('Esc closes it', await ev(`!document.getElementById('cfOv')`));
  await desktop(); await cdp('Page.navigate', { url: BASE + '#/parties' }); await waitFor(`!!document.getElementById('cfBtn') && window.STATE && STATE.chars`, 20000); await sleep(300);
  await ev(`document.body.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true }))`); await sleep(200);
  ok('desktop: "/" opens it', await ev(`!!document.getElementById('cfOv')`)); await shot('03_desktop');
  ok('no browser alert / confirm / prompt was used', !browserDialogs.length);
  ok('no script errors in the page', !errors.length, errors.slice(0, 3).join(' | '));
  const fails = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - fails} passed, ${fails} failed — screenshots in ${OUT}`);
  try { sock.close(); } catch (e) { } br.kill(); srv.kill();
  try { fs.rmSync(prof, { recursive: true, force: true }); fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { }
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
