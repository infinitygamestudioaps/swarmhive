// RESURRECT dialog UI test (2026-10-13, Dashboard/respanel.js): headless Edge via CDP against the SANDBOX server (cmdcenter_testserver.js:
// mocked MCP, nothing reaches the game). The page's /api/state answer is changed in the browser (one member of a party is dead, two others
// carry a Scroll of Resurrection / the Resurrection skill) and every /api/command POST is caught in the page (never sent). Checks:
//   the dead member's row has "Resurrect" (and tapping it does not open the character page) · the party card lists the dead + "Res all dead" ·
//   the dialog (uidialog choice) lists who can raise it and how, with counts · a choice sends '!ov <who> res <dead> scroll' to that character ·
//   "Best one near" sends '!res <dead>' to the party · "Res all dead" (confirm) sends '!resall' · the character page has the button ·
//   iPhone 390x844 without horizontal scroll · no browser alert / confirm / prompt · no script errors.
//   node docs/plan/tools/test_resurrect_ui.js [screenshot dir]     (default: %TEMP%\resurrect_shots)
'use strict';
const path = require('path'), fs = require('fs'), cp = require('child_process'), os = require('os');
const OUT = process.argv[2] || path.join(os.tmpdir(), 'resurrect_shots');
const EDGE = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find(f => fs.existsSync(f));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const results = []; const ok = (name, cond, info) => { results.push({ name, ok: !!cond }); console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${info ? ' — ' + info : ''}`); };

// runs in the page before its own scripts: catch /api/command, make one member dead and give two others a res kit
const INIT = `(() => {
  const of = window.fetch.bind(window); window.__CMDS = [];
  const J = (o) => new Response(JSON.stringify(o), { headers: { 'Content-Type': 'application/json' } });
  window.__RES_MUT = (j) => {
    const by = {}; (j.chars || []).forEach(c => { (by[c.party] = by[c.party] || []).push(c); });
    const P = Object.keys(by).find(k => by[k].length >= 3); if (!P) return;
    const L = by[P].sort((a, b) => (b.name === P) - (a.name === P) || a.name.localeCompare(b.name));
    const dead = L.find(c => c.name !== P && /bishop|healer|shilliensaint/.test(c.role || '')) || L.find(c => c.name !== P);
    const others = L.filter(c => c !== dead);
    L.forEach(c => { c.ageSec = 1; c.x = 43000 + Math.round(Math.random() * 10); c.y = 218000; c.z = -3700; c.resKit = { sk: '', skReady: false, mass: '', sor: 0, bsor: 0 }; c.dead = false; c.hp = 90; });
    Object.assign(dead, { dead: true, hp: 0, x: 43500, y: 218700 });
    Object.assign(others[0].resKit, { sor: 3, bsor: 1 });                       // the scroll carrier (Chanter4 at Tillion)
    if (others[1]) Object.assign(others[1].resKit, { sk: 'Resurrection', skReady: true });
    window.__RES_PICK = { party: P, dead: dead.name, scroller: others[0].name, skiller: others[1] ? others[1].name : '' };
  };
  window.fetch = async (u, o) => {
    const url = String(u && u.url || u);
    if (/\\/api\\/command/.test(url) && o && /POST/i.test(o.method || '')) { const b = JSON.parse(o.body || '{}'); window.__CMDS.push(b); return J({ ok: true, command: b.cmd, target: b.target, sends: [{ ok: true }] }); }
    const r = await of(u, o);
    if (/\\/api\\/state(\\?|$)/.test(url)) { try { const j = await r.clone().json(); window.__RES_MUT(j); return J(j); } catch (e) { return r; } }
    return r;
  };
})();`;

async function startServer(env) {
  const srv = cp.spawn(process.execPath, [path.join(__dirname, 'cmdcenter_testserver.js')], { stdio: ['ignore', 'pipe', 'pipe'], env: Object.assign({}, process.env, env) });
  const s = { srv, port: 0, mcp: [] };
  srv.stdout.on('data', d => String(d).split('\n').forEach(l => { const m = l.match(/^PORT (\d+)/); if (m) s.port = +m[1]; else if (l.startsWith('MCP ')) s.mcp.push(l); }));
  srv.stderr.on('data', d => process.stderr.write('[server] ' + d));
  for (let i = 0; i < 150 && !s.port; i++) await sleep(100);
  if (!s.port) throw new Error('sandbox server did not start');
  return s;
}

(async () => {
  if (!EDGE) { console.log('no Edge / Chrome — UI test skipped'); process.exit(0); }
  fs.mkdirSync(OUT, { recursive: true });
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'resui-'));
  const S = await startServer({ SWARM_RESRULES_FILE: path.join(TMP, 'res_rules.json'), SWARM_PARTYAUTO_FILE: path.join(TMP, 'party_auto.json') });
  const BASE = `http://127.0.0.1:${S.port}/`;
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'res-edge-'));
  const DBG = 9800 + Math.floor(Math.random() * 150);
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
  const shot = async (name) => { const r = await cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, `res_${name}.png`), Buffer.from(r.data, 'base64')); };
  const browserDialogs = [], dialogs = [], errors = [];
  handlers.push((m) => {
    if (m.method === 'Page.javascriptDialogOpening') { browserDialogs.push(m.params.type); cdp('Page.handleJavaScriptDialog', { accept: true }).catch(() => { }); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception ? m.params.exceptionDetails.exception.description : m.params.exceptionDetails.text);
  });
  await cdp('Page.enable'); await cdp('Runtime.enable');
  await require('./uidialog_testhook')(cdp, handlers, { answer: true, uiMode: 'simple', onDialog: (d) => dialogs.push(d) });
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: INIT });
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await cdp('Page.navigate', { url: BASE + '#/parties' });
  ok('the Resurrect module is loaded (served by resrules_api.js)', await waitFor(`!!window.ResPanel && typeof ResPanel.open === 'function'`, 20000));
  ok('a party with a dead member (page data changed in the browser)', await waitFor(`!!window.__RES_PICK && !!document.querySelector('#tab-parties .mem2.dead')`, 25000));
  const PK = await ev('JSON.stringify(window.__RES_PICK)').then(JSON.parse);
  const D = PK.dead, P = PK.party;
  ok(`the dead member's row (${D}) has "Resurrect"`, await waitFor(`!!document.querySelector('#tab-parties .mem2[data-char="${D}"] [data-resopen="${D}"]')`, 8000));
  ok(`the party card lists the dead + "Res all dead (1)"`, await ev(`(() => { const c = document.querySelector('#tab-parties .rz-card'); return !!c && new RegExp('${D}').test(c.textContent) && !!c.querySelector('[data-resall="${P}"]') && /Res all dead \\(1\\)/.test(c.textContent); })()`));
  ok('iPhone: no horizontal scroll', await ev(`document.documentElement.scrollWidth <= innerWidth + 1`));
  await ev(`(document.querySelector('#tab-parties .rz-card') || document.body).scrollIntoView(), true`);
  await shot('01_iphone_party_card');
  // 1) a choice: the scroll carrier, scroll
  dialogs.length = 0;
  await ev(`(window.UIDIALOG_TEST = { answer: (i) => i.type === 'choice' ? i.buttons.findIndex(l => l.indexOf(${JSON.stringify(PK.scroller + ' — Scroll of Resurrection (3)')}) === 0) : true }, true)`);
  const hash0 = await ev('location.hash');
  await ev(`document.querySelector('#tab-parties .mem2[data-char="${D}"] [data-resopen="${D}"]').click(), true`);
  ok('one tap sends "!ov <scroll carrier> res <dead> scroll" to that character', await waitFor(`(window.__CMDS || []).some(c => c.target === 'char:${PK.scroller}' && c.cmd === '!ov ${PK.scroller} res ${D} scroll')`, 8000), await ev('JSON.stringify(window.__CMDS)'));
  const dlg = dialogs.find(d => d.type === 'choice');
  ok(`the dialog: "Resurrect ${D}", who + how with counts, "Best one near (automatic)"`, !!dlg && dlg.title === `Resurrect ${D}` && dlg.buttons.some(l => l.startsWith(`${PK.scroller} — Scroll of Resurrection (3)`)) && dlg.buttons.some(l => l.startsWith(`${PK.scroller} — Blessed Scroll of Resurrection (1)`))
    && (!PK.skiller || dlg.buttons.some(l => l.startsWith(`${PK.skiller} — Resurrection`))) && dlg.buttons.includes('Best one near (automatic)'), dlg ? dlg.buttons.join(' | ') : 'no dialog');
  ok('the dialog explains what happens (walks over, rebuffs first)', !!dlg && /walks to the body/.test(dlg.msg) && /rebuffs first/.test(dlg.msg));
  ok('tapping the row button did not open the character page', (await ev('location.hash')) === hash0);
  // 2) best one near
  await ev(`(window.UIDIALOG_TEST = { answer: true }, true)`);
  await ev(`document.querySelector('#tab-parties [data-resopen="${D}"]').click(), true`);
  ok('"Best one near (automatic)" sends "!res <dead>" to the party', await waitFor(`(window.__CMDS || []).some(c => c.target === 'party:${P}' && c.cmd === '!res ${D}')`, 8000));
  // 3) res all dead
  dialogs.length = 0;
  await ev(`document.querySelector('#tab-parties [data-resall="${P}"]').click(), true`);
  ok('"Res all dead" asks once (uidialog) and sends "!resall" to the party', await waitFor(`(window.__CMDS || []).some(c => c.target === 'party:${P}' && c.cmd === '!resall')`, 8000) && dialogs.some(d => d.type === 'confirm' && /Res all dead/.test(d.title)));
  // 4) the character page
  await cdp('Page.navigate', { url: BASE + '#/char/' + encodeURIComponent(D) });
  ok(`the character page of ${D} has "Resurrect…"`, await waitFor(`!!document.querySelector('.cp-acts [data-resopen="${D}"]')`, 20000));
  await shot('02_iphone_charpage');
  // 5) desktop look
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.navigate', { url: BASE + '#/parties' });
  await waitFor(`!!document.querySelector('#tab-parties .rz-card')`, 25000);
  await ev(`document.querySelector('#tab-parties .rz-card').scrollIntoView(), true`);
  await shot('03_desktop_party_card');
  S.srv.kill();
  const writes = S.mcp.filter(l => /^MCP (run_account_command|send_game_action|close_account|open_account|manage_)/.test(l));
  ok('no game command reached even the mock MCP', !writes.length, writes.slice(0, 3).join(' | '));
  ok('no browser alert / confirm / prompt was used', !browserDialogs.length, browserDialogs.join(','));
  ok('no script errors in the page', !errors.length, errors.slice(0, 3).join(' | '));
  const fails = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - fails} passed, ${fails} failed — screenshots in ${OUT}`);
  try { sock.close(); } catch (e) { } br.kill();
  try { fs.rmSync(prof, { recursive: true, force: true }); fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { }
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
