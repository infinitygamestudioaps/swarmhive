// STORAGE PAGE (STORAGE-2026-10-13): headless browser check of #/storage (Edge via CDP) against the SANDBOX server (cmdcenter_testserver.js: mocked
// MCP, nothing reaches the game). The rules file is a SCRATCH copy (env SWARM_STASHRULES_FILE); every uidialog question answers itself
// (uidialog_testhook). iPhone 390x844 + desktop 1366x900. Reads the real Logs/swarm_state_*.json and swarm.config.json (read-only).
//   node docs/plan/tools/test_storagepage_ui.js [screenshot dir]     (default: %TEMP%\storagepage_shots — never the repo)
'use strict';
const path = require('path'), fs = require('fs'), cp = require('child_process'), os = require('os');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const OUT = process.argv[2] || path.join(os.tmpdir(), 'storagepage_shots');
const EDGE = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find(f => fs.existsSync(f));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const results = []; const ok = (name, cond, info) => { results.push({ name, ok: !!cond }); console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${info ? ' — ' + info : ''}`); };

(async () => {
  if (!EDGE) { console.log('no Edge / Chrome — UI test skipped'); process.exit(0); }
  fs.mkdirSync(OUT, { recursive: true });
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'stgui-'));
  const RFILE = path.join(TMP, 'stash_rules.json');
  const LIVE = path.join(ROOT, 'Scripts', 'data', 'stash_rules.json'); const liveSt = () => { try { return fs.readFileSync(LIVE, 'utf8'); } catch (e) { return 'absent'; } }; const LIVE0 = liveSt();
  fs.writeFileSync(RFILE, LIVE0 === 'absent' ? '{}' : LIVE0);
  const srv = cp.spawn(process.execPath, [path.join(__dirname, 'cmdcenter_testserver.js')], { stdio: ['ignore', 'pipe', 'pipe'], env: Object.assign({}, process.env, { SWARM_STASHRULES_FILE: RFILE }) });
  let PORT = 0; const mcpLog = [];
  srv.stdout.on('data', d => String(d).split('\n').forEach(l => { const m = l.match(/^PORT (\d+)/); if (m) PORT = +m[1]; else if (l.startsWith('MCP ')) mcpLog.push(l); }));
  srv.stderr.on('data', d => process.stderr.write('[server] ' + d));
  for (let i = 0; i < 100 && !PORT; i++) await sleep(100);
  if (!PORT) throw new Error('sandbox server did not start');
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'stg-edge-'));
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
  const shot = async (name) => { const r = await cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, `storage_${name}.png`), Buffer.from(r.data, 'base64')); };
  const browserDialogs = [], dialogs = [], errors = [];
  handlers.push((m) => {
    if (m.method === 'Page.javascriptDialogOpening') { browserDialogs.push(m.params.type); cdp('Page.handleJavaScriptDialog', { accept: true }).catch(() => { }); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception ? m.params.exceptionDetails.exception.description : m.params.exceptionDetails.text);
  });
  await cdp('Page.enable'); await cdp('Runtime.enable');
  const UID = await require('./uidialog_testhook')(cdp, handlers, { answer: true, onDialog: (d) => dialogs.push(d) });
  const BASE = `http://127.0.0.1:${PORT}/`;
  const phone = async () => { await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }); await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }); };
  const desktop = async () => { await cdp('Emulation.setDeviceMetricsOverride', { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false }); await cdp('Emulation.setTouchEmulationEnabled', { enabled: false }); };
  const click = (sel) => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; e.click(); return true; })()`);
  const setSel = (sel, v) => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; e.value = ${JSON.stringify(v)}; e.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
  const file = () => JSON.parse(fs.readFileSync(RFILE, 'utf8'));
  const noScroll = () => ev(`document.documentElement.scrollWidth <= innerWidth + 1`);

  // ===================== iPhone =====================
  await phone();
  await cdp('Page.navigate', { url: BASE + '#/parties' });
  ok('nav: a Storage tab', await waitFor(`!!document.querySelector('#tabs [data-tab="storage"]')`, 20000));
  await waitFor(`!!window.StoragePage && typeof document.getElementById('tabs').onclick === 'function'`, 20000); await sleep(500);
  await click('#tabs [data-tab="storage"]');
  ok('#/storage opens: defaults, letters, parties', await waitFor(`/^#\\/storage/.test(location.hash) && !!document.querySelector('#stgDef select[data-stg="defaults|dest"]') && !!document.querySelector('#stgLet input[data-stglet="on"]') && document.querySelectorAll('#stgParties .stg-party').length >= 1`, 15000), await ev('location.hash'));
  ok('the automatic default says "nothing happens until you switch it on"', await ev(`/nothing happens until you switch it on/.test(document.querySelector('#stgDef select[data-stg="defaults|auto"]').textContent)`));
  ok('the clan-warehouse hint (only the clan leader takes items out) is on the page', await ev(`/only the clan leader can take items out/i.test(document.getElementById('tab-storagepage').textContent)`));
  ok('14 letter items as chips', await ev(`document.querySelectorAll('#stgLet [data-stgitem]').length === 14`));
  ok('no horizontal page scroll (iPhone, Storage)', await noScroll(), await ev(`document.documentElement.scrollWidth + ' / ' + innerWidth`));
  await ev('window.scrollTo(0,0)'); await shot('01_iphone_top');
  // open the first party's characters and one character
  await ev(`(() => { const d = document.querySelector('#stgParties details.fnd-mems'); d.open = true; d.dispatchEvent(new Event('toggle')); const c = d.querySelector('details.stg-char'); c.open = true; c.dispatchEvent(new Event('toggle')); return c.dataset.stgchar; })()`);
  const who = await ev(`document.querySelector('#stgParties details.stg-char[open]').dataset.stgchar`);
  ok(`character ${who}: editor + buttons (Plan, Store now, Letters now, preset)`, await waitFor(`!!document.querySelector('details.stg-char[open] select[data-stg="chars|${who}|dest"]') && ['plan','store','letters','preset'].every(a => !!document.querySelector('details.stg-char[open] [data-stgact="' + a + '"]'))`));
  ok('no horizontal page scroll with a character open (iPhone)', await noScroll(), await ev(`document.documentElement.scrollWidth + ' / ' + innerWidth`));
  await ev(`document.querySelector('details.stg-char[open]').scrollIntoView()`); await sleep(300); await shot('02_iphone_char');
  // edit: character -> private, automatic on, weight trigger 55 %; letters receiver = that character's clan leader default; save
  await setSel(`select[data-stg="chars|${who}|dest"]`, 'private');
  await setSel(`select[data-stg="chars|${who}|auto"]`, 'on');
  await setSel(`select[data-stg="chars|${who}|trigger|kind"]`, 'weight');
  await waitFor(`!!document.querySelector('input[data-stg="chars|${who}|trigger|weightPct"]')`, 3000);
  await setSel(`input[data-stg="chars|${who}|trigger|weightPct"]`, '55');
  await ev(`(() => { const c = document.querySelector('#stgLet input[data-stglet="on"]'); c.checked = false; c.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
  await click('#stgLet [data-stgitem="3888"]');
  ok('the bar shows unsaved changes', await waitFor(`/Unsaved changes/.test(document.getElementById('stgBar').textContent)`, 3000));
  await click('[data-stgbar="save"]');
  ok('saved: character private + automatic + weight 55 %; letters off; letter II removed', await waitFor(`/Saved/.test(document.getElementById('stgBar').textContent)`, 8000)
    && (() => { const f = file(), c = (f.chars || {})[who] || {}; return c.dest === 'private' && c.auto === true && c.trigger && c.trigger.kind === 'weight' && c.trigger.weightPct === 55 && f.letters && f.letters.on === false && !f.letters.ids.includes(3888); })(), JSON.stringify((file().chars || {})[who]));
  ok('a confirmation dialog listed the changes (uidialog)', dialogs.some(d => /Save the storage settings/.test(d.title || '')));
  // preset button
  await click(`details.stg-char[open] [data-stgact="preset"]`); await sleep(400);
  await waitFor(`/Unsaved changes/.test(document.getElementById('stgBar').textContent)`, 5000);
  await click('[data-stgbar="save"]');
  for (let i = 0; i < 40; i++) { const c = (file().chars || {})[who] || {}; if (c.mode === 'all') break; await sleep(250); }
  ok('preset "everything -> clan": dest clan, mode all, consumables kept', (() => { const c = (file().chars || {})[who] || {}; return c.dest === 'clan' && c.mode === 'all' && Array.isArray(c.keepNames) && c.keepNames.includes('Scroll of Escape'); })(), JSON.stringify((file().chars || {})[who]) + ' ' + (await ev("document.getElementById('stgBar').textContent")));
  // invalid regex is blocked in the page
  await ev(`(() => { const d = document.querySelector('details.stg-char[open] details.fnd-more'); d.open = true; return true; })()`);
  await setSel(`textarea[data-stglist="chars|${who}|depositNames"]`, '([');
  ok('a broken name pattern is marked and blocks saving', await waitFor(`/not valid/.test(document.getElementById('stgBar').textContent) && document.querySelector('[data-stgbar="save"]').disabled`, 3000));
  await setSel(`textarea[data-stglist="chars|${who}|depositNames"]`, '');
  // COLLECTOR 2026-10-14
  ok('collector: the box with on / who / town', await waitFor(`!!document.querySelector('#stgColl input[data-stgcoll="on"]') && !!document.querySelector('#stgColl select[data-stgcoll="name"]') && !!document.querySelector('#stgColl select[data-stgcoll="town"]')`, 5000));
  const collWas = await ev(`document.querySelector('#stgColl input[data-stgcoll="on"]').checked`);   // the live file may already have it on
  await ev(`(() => { const c = document.querySelector('#stgColl input[data-stgcoll="on"]'); c.checked = !c.checked; c.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`); await sleep(300);
  await click('[data-stgbar="save"]');
  for (let i = 0; i < 40; i++) { if (!!(file().collector || {}).on === !collWas) break; await sleep(250); }
  ok('collector saved (switched to ' + (collWas ? 'off' : 'on') + ')', (() => { const C = file().collector || {}; return !!C.on === !collWas && C.town === 'Giran'; })(), JSON.stringify(file().collector));
  ok('the save confirmation names it', dialogs.some(d => /Collector (ON|off)/.test(JSON.stringify(d))));
  // WHSELL 2026-10-14: never store (Common items, names, sell instead) + the clan warehouse list
  await click('[data-stgbar="undo"]'); await sleep(400);
  ok('never store: the box with Common items / names / sell switches', await waitFor(`!!document.querySelector('#stgNever input[data-stgnv="common"]') && !!document.querySelector('#stgNever input[data-stgnv="sell"]') && !!document.querySelector('#stgNever textarea[data-stgnvnames]')`, 5000));
  await ev(`(() => { const c = document.querySelector('#stgNever input[data-stgnv="common"]'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`); await sleep(200);
  await setSel('#stgNever textarea[data-stgnvnames]', '^Tutorial Guide');
  await ev(`(() => { const c = document.querySelector('#stgNever input[data-stgnv="sell"]'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`); await sleep(200);
  await click('[data-stgbar="save"]');
  for (let i = 0; i < 40; i++) { if ((file().neverStore || {}).common) break; await sleep(250); }
  ok('never store saved: common, names, sell', (() => { const N = file().neverStore || {}; return N.common === true && N.sell === true && (N.names || []).join() === '^Tutorial Guide'; })(), JSON.stringify(file().neverStore));
  ok('the save confirmation names the never-store change', dialogs.some(d => /Never store: Common items/.test(JSON.stringify(d))));
  await setSel('#stgNever textarea[data-stgnvnames]', '([');
  ok('never store: a broken pattern blocks saving', await waitFor(`/not valid/.test(document.getElementById('stgBar').textContent)`, 3000));
  await setSel('#stgNever textarea[data-stgnvnames]', '^Tutorial Guide');
  const hasWh = await ev(`!!(window.StoragePage._state.info && window.StoragePage._state.info.clanWh)`);
  if (hasWh) {
    ok('clan warehouse: the list with tick boxes', await waitFor(`document.querySelectorAll('#stgCwh input[data-cwh]').length > 0`, 5000));
    const n0 = await ev(`document.querySelectorAll('#stgCwh input[data-cwh]').length`);
    await ev(`(() => { const i = document.querySelector('#stgCwh input[data-cwhq]'); i.value = 'zzzz-none'; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`); await sleep(200);
    ok('clan warehouse: the search filters the list', await ev(`document.querySelectorAll('#stgCwh input[data-cwh]').length === 0 && /Nothing matches/.test(document.getElementById('stgCwh').textContent)`));
    await ev(`(() => { const i = document.querySelector('#stgCwh input[data-cwhq]'); i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`); await sleep(200);
    ok('clan warehouse: "Take out and sell" is off until something is ticked', await ev(`document.querySelector('#stgCwh [data-cwhact="sell"]').disabled`));
    await ev(`(() => { const c = document.querySelector('#stgCwh input[data-cwh]'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`); await sleep(200);
    ok('clan warehouse: ticking one enables the buttons and counts it', await ev(`!document.querySelector('#stgCwh [data-cwhact="sell"]').disabled && /1 kind ticked/.test(document.getElementById('stgCwh').textContent)`), `${n0} rows`);
    await click('#stgCwh [data-cwhact="none"]'); await sleep(200);
    ok('clan warehouse: "Untick all"', await ev(`document.querySelector('#stgCwh [data-cwhact="sell"]').disabled`));
    // SELLALL (owner 2026-10-14): "Sell all Crafting parts" / "Sell all Recipes" (answered Cancel: nothing is sent, the ticks come back)
    const sa = await ev(`[...document.querySelectorAll('#stgCwh [data-cwhsellall]')].map(b => b.dataset.cwhsellall + '|' + b.textContent).join(';')`);
    ok('clan warehouse: "Sell all" buttons for crafting parts / recipes (when the warehouse has them)', /part|Sell all Crafting parts|recipe|Sell all Recipes/.test(sa) || !sa, sa);
    if (sa) { await UID.set(ev, false); const before = dialogs.length; await click('#stgCwh [data-cwhsellall]'); await sleep(400); await UID.set(ev, true);
      const d = dialogs.slice(before).find(x => /Take out and sell [0-9]+ kinds?/.test(x.title || ''));
      ok('"Sell all" asks first with the whole group', !!d, d ? d.title : JSON.stringify(dialogs.slice(before)).slice(0, 300));
      ok('"Sell all" cancelled = nothing ticked', await ev(`document.querySelector('#stgCwh [data-cwhact="sell"]').disabled`)); }
    await ev(`document.getElementById('stgCwh').scrollIntoView()`); await sleep(300); await shot('04_iphone_clanwh');
    ok('clan warehouse: no sideways scroll on the phone', await noScroll());
  } else ok('clan warehouse: "not known yet" text without a list', await ev(`/not known yet/.test(document.getElementById('stgCwh').textContent)`));

  // ===================== desktop =====================
  await desktop();
  await cdp('Page.navigate', { url: BASE + '#/storage' });
  ok('desktop: deep link #/storage', await waitFor(`!!document.querySelector('#stgDef select') && !document.getElementById('tab-storagepage').hidden`, 20000));
  await sleep(500); await shot('03_desktop');
  ok('no browser alert / confirm / prompt was used', !browserDialogs.length, browserDialogs.join(','));
  ok('no script errors in the page', !errors.length, errors.slice(0, 3).join(' | '));
  const writes = mcpLog.filter(l => /^MCP (run_account_command|send_game_action|close_account|open_account|manage_)/.test(l));
  ok('no game command reached even the mock MCP', !writes.length, writes.slice(0, 3).join(' | '));
  ok('the live Scripts/data/stash_rules.json was not changed', liveSt() === LIVE0);
  const fails = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - fails} passed, ${fails} failed — screenshots in ${OUT}`);
  try { sock.close(); } catch (e) { } br.kill(); srv.kill();
  try { fs.rmSync(prof, { recursive: true, force: true }); fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { }
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
