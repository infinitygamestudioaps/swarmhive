// DISPATCH page (DISPATCH-2026-10-17, Dashboard/dispatchpage.js): headless Edge against the SANDBOX server (mocked MCP). Builds a tour, never presses
// Go (no tour file, no order). iPhone 390x844.
//   node docs/plan/tools/test_dispatch_ui.js [screenshot dir]     (default: %TEMP%\dispatch_shots)
'use strict';
const path = require('path'), fs = require('fs'), cp = require('child_process'), os = require('os');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const OUT = process.argv[2] || path.join(os.tmpdir(), 'dispatch_shots');
const EDGE = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find(f => fs.existsSync(f));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const results = []; const ok = (name, cond, info) => { results.push({ name, ok: !!cond }); console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${info !== undefined && !cond ? ' — ' + (typeof info === 'string' ? info : JSON.stringify(info)) : ''}`); };
const LOGS = path.join(ROOT, 'Logs');
const dirList = (d) => { try { return fs.readdirSync(d).sort().join('|'); } catch (e) { return ''; } };

(async () => {
  if (!EDGE) { console.log('no Edge / Chrome — UI test skipped'); process.exit(0); }
  fs.mkdirSync(OUT, { recursive: true });
  const JOBS0 = dirList(path.join(LOGS, 'dispatch')), OQ0 = dirList(path.join(LOGS, 'orders'));
  const srv = cp.spawn(process.execPath, [path.join(__dirname, 'cmdcenter_testserver.js')], { stdio: ['ignore', 'pipe', 'pipe'] });
  let port = 0; const mcp = []; srv.stdout.on('data', d => String(d).split('\n').forEach(l => { const m = l.match(/^PORT (\d+)/); if (m) port = +m[1]; if (/^MCP /.test(l)) mcp.push(l); }));
  srv.stderr.on('data', d => process.stderr.write('[server] ' + d));
  for (let i = 0; i < 150 && !port; i++) await sleep(100);
  if (!port) throw new Error('sandbox server did not start');
  const BASE = `http://127.0.0.1:${port}/`;
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'itp-edge-'));
  const DBG = 9450 + Math.floor(Math.random() * 140);
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
  const shot = async (name, sel) => { if (sel) await ev(`(() => { const b = document.querySelector(${JSON.stringify(sel)}); if (b) b.scrollIntoView({ block: 'start' }); return true; })()`).catch(() => { }); await sleep(250); const r = await cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, `dispatch_${name}.png`), Buffer.from(r.data, 'base64')); };
  const browserDialogs = [], errors = [];
  handlers.push((m) => {
    if (m.method === 'Page.javascriptDialogOpening') { browserDialogs.push(m.params.type); cdp('Page.handleJavaScriptDialog', { accept: true }).catch(() => { }); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception ? m.params.exceptionDetails.exception.description : m.params.exceptionDetails.text);
  });
  await cdp('Page.enable'); await cdp('Runtime.enable');
  await require('./uidialog_testhook')(cdp, handlers, { answer: false, uiMode: 'simple' });
  const click = (sel) => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; e.click(); return true; })()`);
  const noScroll = () => ev(`document.documentElement.scrollWidth <= innerWidth + 1`);
  try {
    await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await cdp('Page.navigate', { url: BASE + '#/parties' });
    ok('0: page loads', await waitFor(`!!window.DispatchPage`, 30000));
    await ev(`(location.hash = '#/dispatch', true)`);
    ok('1: party buttons', await waitFor(`document.querySelectorAll('[data-dspparty]').length > 3`, 20000));
    ok('1: epic quick buttons (Baium, Antharas, Core ...)', await waitFor(`document.querySelectorAll('.dsp-q').length >= 6 && /Baium/.test(document.querySelector('.dsp-quick').textContent)`, 15000));
    await shot('1_who', '#tab-dispatch');
    await ev(`(document.querySelector('[data-dspparty]').click(), true)`);
    await ev(`(document.querySelector('.dsp-q[data-dspadd]').click(), true)`);
    await ev(`(() => { const q = document.getElementById('dspQ'); q.value = 'iron giant'; q.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
    ok('2: search shows Iron Giant Totem first', await waitFor(`/Iron Giant Totem/.test((document.querySelector('.dsp-row') || {}).textContent || '')`, 8000));
    await ev(`(document.querySelector('.dsp-row [data-dspadd]').click(), true)`);
    await shot('2_where', '#dspWhere');
    ok('3: the tour has 2 stops and Go is on', await waitFor(`DispatchPage._state.stops.length === 2 && !document.querySelector('[data-dspgo]').disabled`, 5000));
    await ev(`(document.querySelector('[data-dspmv="0|1"]').click(), true)`);
    ok('3: reorder works', await ev(`/Iron Giant/.test(DispatchPage._state.stops[0].name)`), await ev(`JSON.stringify(DispatchPage._state.stops.map(x => x.name))`));
    // COMPACT-2026-10-23: phone = the tour box above the place list + a sticky 'N stops · Go' bar
    ok('3: phone: the tour box sits above the place list and the sticky bar shows the stops + Go', await ev(`!!document.querySelector('#dspTourSlotPhone .dsp-tourbox') && !document.getElementById('dspBar').hidden && /2 stops/.test(document.getElementById('dspBar').textContent) && !!document.querySelector('#dspBar [data-dspgo]')`));
    ok('3: the added place shows Added in the list', await ev(`/Added/.test((document.querySelector('.dsp-row .dsp-add.in') || {}).textContent || '')`));
    await ev(`(document.querySelector('[data-dspmode="char"]').click(), true)`);
    ok('4: one character mode with the sneak option', await waitFor(`document.querySelectorAll('[data-dspchar]').length > 10 && !!document.querySelector('[data-dspsneak]')`, 5000));
    ok('4: no sideways scroll', await noScroll());
    await shot('3_tour', '#dspTour');
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false }); await sleep(600);
    ok('6: PC: two columns, the tour box in the right column, no sticky bar', await ev(`!!document.querySelector('#tab-dispatch .dsp-side .dsp-tourbox') && getComputedStyle(document.getElementById('dspBar')).display === 'none' && document.querySelector('.dsp-side').getBoundingClientRect().left > document.querySelector('.dsp-left').getBoundingClientRect().right - 2`));
    ok('6: PC: no sideways scroll', await noScroll());
    await shot('4_desktop', '#tab-dispatch');
    ok('5: no browser alert / confirm / prompt', browserDialogs.length === 0, browserDialogs);
    ok('5: no page errors', errors.length === 0, errors.slice(0, 3));
    ok('5: no tour file and no order written', dirList(path.join(LOGS, 'dispatch')) === JOBS0);
    ok('5: no MCP call that changes anything', !mcp.some(l => /run_account_command|close_account|open_account|send_game_action/.test(l)), mcp.slice(-3));
  } finally {
    try { sock.close(); } catch (e) { } try { br.kill(); } catch (e) { } try { srv.kill(); } catch (e) { }
    try { cp.execSync(`taskkill /F /T /PID ${br.pid}`, { stdio: 'ignore' }); } catch (e) { }
  }
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - failed} passed, ${failed} failed — screenshots in ${OUT}`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
