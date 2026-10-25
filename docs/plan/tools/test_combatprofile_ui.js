// COMBAT PROFILE page (COMBATPROFILE-2026-10-17, Dashboard/combatprofile.js): headless browser check (Edge via CDP) against the SANDBOX server
// (cmdcenter_testserver.js: mocked MCP, nothing reaches the game). Settings = a SCRATCH copy of one character's profile (SWARM_COMBATPROFILE_SETTINGS);
// the live Settings/*.xml are compared before / after. Every uidialog question answers itself.
//   1. #/combat/<name> on an iPhone (390x844): tabs, the attack list, no sideways scroll
//   2. edits: a condition set added, an attack skill added from the picker, a heal added, combat range changed -> "Unsaved changes" bar
//   3. Save -> the job runs ("not open in L2Swarm" in the sandbox: the scratch file is written) -> the file has exactly those changes
//   4. the character page shows the "Combat profile" box; desktop screenshot; no browser dialogs, no page errors
//   node docs/plan/tools/test_combatprofile_ui.js [screenshot dir]     (default: %TEMP%\combatprofile_shots)
'use strict';
const path = require('path'), fs = require('fs'), cp = require('child_process'), os = require('os');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const OUT = process.argv[2] || path.join(os.tmpdir(), 'combatprofile_shots');
const EDGE = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'].find(f => fs.existsSync(f));   // NEVER Microsoft Edge (owner 2026-10-24): Chrome only
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const results = []; const ok = (name, cond, info) => { results.push({ name, ok: !!cond }); console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${info !== undefined && !cond ? ' — ' + (typeof info === 'string' ? info : JSON.stringify(info)) : ''}`); };
const X = require(path.join(ROOT, 'Dashboard', 'combatxml.js'));
const SET = path.join(ROOT, 'Settings'), LOGS = path.join(ROOT, 'Logs');

(async () => {
  if (!EDGE) { console.log('no Edge / Chrome — UI test skipped'); process.exit(0); }
  fs.mkdirSync(OUT, { recursive: true });
  // the character under test: an account of swarm.config.json with a profile file and a bot state that lists its skills
  const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, 'swarm.config.json'), 'utf8'));
  const acc = (CFG.accounts || []).find(a => { try { const s = JSON.parse(fs.readFileSync(path.join(LOGS, `swarm_state_${a.character}.json`), 'utf8')); return a.config && fs.existsSync(path.join(SET, a.config)) && s.ov && (s.ov.skills || []).length > 5; } catch (e) { return false; } });
  if (!acc) { console.log('no character with a profile + bot state — UI test skipped'); process.exit(0); }
  const NAME = acc.character;
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'cpfui-'));
  fs.copyFileSync(path.join(SET, acc.config), path.join(TMP, acc.config));
  const LIVE0 = fs.readdirSync(SET).filter(f => /\.xml$/i.test(f)).map(f => [f, fs.statSync(path.join(SET, f)).mtimeMs]);
  const before = X.readProfile(fs.readFileSync(path.join(TMP, acc.config), 'utf8'));
  console.log(`character under test: ${NAME} (${acc.config}: ${before.combatSkills.length} attack skills, ${before.autoSkills.length} auto skills)`);

  const srv = cp.spawn(process.execPath, [path.join(__dirname, 'cmdcenter_testserver.js')], { stdio: ['ignore', 'pipe', 'pipe'], env: Object.assign({}, process.env, { SWARM_COMBATPROFILE_SETTINGS: TMP }) });
  let port = 0; const mcp = []; srv.stdout.on('data', d => String(d).split('\n').forEach(l => { const m = l.match(/^PORT (\d+)/); if (m) port = +m[1]; if (/^MCP /.test(l)) mcp.push(l); }));
  srv.stderr.on('data', d => process.stderr.write('[server] ' + d));
  for (let i = 0; i < 150 && !port; i++) await sleep(100);
  if (!port) throw new Error('sandbox server did not start');
  const BASE = `http://127.0.0.1:${port}/`;
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'cpf-edge-'));
  const DBG = 9600 + Math.floor(Math.random() * 150);
  const br = cp.spawn(EDGE, ['--headless=new', '--use-angle=d3d11', '--ignore-gpu-blocklist', '--no-first-run', '--no-default-browser-check', `--remote-debugging-port=${DBG}`, `--user-data-dir=${prof}`, 'about:blank'], { stdio: 'ignore' });
  let ws = null;
  for (let i = 0; i < 60 && !ws; i++) { await sleep(250); try { const l = await (await fetch(`http://127.0.0.1:${DBG}/json/list`)).json(); const p = l.find(x => x.type === 'page'); if (p) ws = p.webSocketDebuggerUrl; } catch (e) { } }
  if (!ws) throw new Error('no browser');
  const sock = new WebSocket(ws); await new Promise((r, j) => { sock.onopen = r; sock.onerror = j; });
  let id = 0; const pend = {}, handlers = [];
  sock.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pend[m.id]) { pend[m.id](m); delete pend[m.id]; } else handlers.forEach(h => h(m)); };
  const cdp = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend[i] = (m) => m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result); sock.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception ? r.exceptionDetails.exception.description : r.exceptionDetails.text); return r.result.value; };
  const waitFor = async (expr, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await ev(expr)) return true; } catch (e) { } await sleep(150); } return false; };
  const shot = async (name) => { await ev(`(() => { const b = document.getElementById('cpfBody'); if (b && !b.closest('section').hidden) b.scrollIntoView({ block: 'start' }); return true; })()`).catch(() => { }); await sleep(150); const r = await cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, `cpf_${name}.png`), Buffer.from(r.data, 'base64')); };
  const browserDialogs = [], dialogs = [], errors = [];
  handlers.push((m) => {
    if (m.method === 'Page.javascriptDialogOpening') { browserDialogs.push(m.params.type); cdp('Page.handleJavaScriptDialog', { accept: true }).catch(() => { }); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception ? m.params.exceptionDetails.exception.description : m.params.exceptionDetails.text);
  });
  await cdp('Page.enable'); await cdp('Runtime.enable');
  await require('./uidialog_testhook')(cdp, handlers, { answer: true, uiMode: 'simple', onDialog: (d) => dialogs.push(d) });
  const click = (sel) => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; e.click(); return true; })()`);
  const noScroll = () => ev(`document.documentElement.scrollWidth <= innerWidth + 1`);
  try {
    await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await cdp('Page.navigate', { url: BASE + '#/parties' });
    ok('0: page + modules load', await waitFor(`!!window.CombatProfilePage && !!window.CombatXml`, 30000));
    await ev(`(location.hash = '#/combat/' + encodeURIComponent(${JSON.stringify(NAME)}), true)`);
    ok('1: the profile loads', await waitFor(`!!(CombatProfilePage._state.d && CombatProfilePage._state.cur)`, 20000), await ev(`document.getElementById('cpfMsg') && document.getElementById('cpfMsg').textContent`));
    ok('1: six tabs', (await ev(`document.querySelectorAll('#cpfTabs button').length`)) === 6);
    ok('1: one card per attack skill', (await ev(`document.querySelectorAll('#cpfBody .cpf-card').length`)) === before.combatSkills.length);
    ok('1: no sideways scroll on the iPhone', await noScroll());
    ok('1: the page scrolls itself into view on a phone', await waitFor(`document.getElementById('tab-combatprofile').getBoundingClientRect().top < 60`, 3000), await ev(`document.getElementById('tab-combatprofile').getBoundingClientRect().top`));
    await shot('1_attacks_phone');
    // 2. edits
    await click('[data-cpfpick="combatSkills|new"]');
    ok('2: the skill picker lists the character\'s skills', await waitFor(`document.querySelectorAll('.cpf-pick [data-cpfpickid]').length > 3`));
    await shot('2_picker');
    const pickedId = await ev(`(() => { const b = document.querySelector('.cpf-pick [data-cpfpickid]'); b.click(); return Number(b.dataset.cpfpickid); })()`);
    ok('2: the picked skill becomes a new card', (await ev(`document.querySelectorAll('#cpfBody .cpf-card').length`)) === before.combatSkills.length + 1);
    const last = before.combatSkills.length;
    await click(`[data-cpfgadd="combatSkills|${last}"]`);
    await ev(`(() => { const s = document.querySelector('[data-cpfc="combatSkills|${last}|1|0|trigger"]'); s.value = 'MpPercentMore'; s.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
    await ev(`(() => { const s = document.querySelector('[data-cpfc="combatSkills|${last}|1|0|value"]'); s.value = '40'; s.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
    ok('2: "or" set with "my MP is above 40 %"', (await ev(`JSON.stringify(CombatProfilePage._state.cur.combatSkills[${last}].groups)`)).includes('"trigger":"MpPercentMore","value":40'));
    await click('[data-cpftab="auto"]');
    await click('[data-cpfpick="autoSkills|new"]');
    const healId = await ev(`(() => { const b = [...document.querySelectorAll('.cpf-pick [data-cpfpickid]')].find(x => /heal/i.test(x.textContent)) || document.querySelector('.cpf-pick [data-cpfpickid]'); b.click(); return Number(b.dataset.cpfpickid); })()`);
    ok('2: a heal / buff entry added', (await ev(`CombatProfilePage._state.cur.autoSkills.length`)) === before.autoSkills.length + 1);
    await shot('3_auto_phone');
    await click('[data-cpftab="follow"]');
    const hasRange = await ev(`!!document.querySelector('[data-cpfsc="CombatRange|int"]')`);
    if (hasRange) await ev(`(() => { const s = document.querySelector('[data-cpfsc="CombatRange|int"]'); s.value = '1777'; s.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
    ok('2: the "Unsaved changes" bar shows', await ev(`!document.getElementById('cpfBar').hidden && /Unsaved/.test(document.getElementById('cpfBar').textContent)`));
    ok('2: still no sideways scroll', await noScroll());
    await shot('4_follow_phone');
    // 3. save
    await click('[data-cpfsave]');
    ok('3: the save job finishes', await waitFor(`!!(CombatProfilePage._state.d.job && CombatProfilePage._state.d.job.done && CombatProfilePage._state.d.job.ok)`, 30000), await ev(`JSON.stringify(CombatProfilePage._state.d.job)`));
    const after = X.readProfile(fs.readFileSync(path.join(TMP, acc.config), 'utf8'));
    ok('3: the file has the new attack skill + its or-set', after.combatSkills.length === before.combatSkills.length + 1 && after.combatSkills[last].id === pickedId && JSON.stringify(after.combatSkills[last].groups).includes('"MpPercentMore","value":40'), { n: after.combatSkills.length, want: before.combatSkills.length + 1, picked: pickedId, got: after.combatSkills.map(s => s.id), groups: after.combatSkills[last] && after.combatSkills[last].groups, job: await ev(`JSON.stringify(CombatProfilePage._state.d.job.steps)`) });
    ok('3: the file has the new heal / buff', after.autoSkills.length === before.autoSkills.length + 1 && after.autoSkills[after.autoSkills.length - 1].id === healId);
    ok('3: combat range written', !hasRange || after.scalars.CombatRange === 1777);
    ok('3: nothing else in the file changed', X.untouchedSame(fs.readFileSync(path.join(SET, acc.config), 'utf8'), fs.readFileSync(path.join(TMP, acc.config), 'utf8')));
    ok('3: the save asked first (styled dialog)', dialogs.length >= 1);
    await shot('5_saved_phone');
    // 4. character page box + desktop
    await ev(`(location.hash = '#/char/' + encodeURIComponent(${JSON.stringify(NAME)}), true)`);
    ok('4: the character page links the combat profile', await waitFor(`!!document.querySelector('#cpfCharBox a[href^="#/combat/"]')`, 20000) || 'no .cp-orders in the sandbox' === 'x');
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
    await ev(`(location.hash = '#/combat/' + encodeURIComponent(${JSON.stringify(NAME)}), true)`); await sleep(1200);
    await shot('6_desktop');
    ok('4: no browser alert / confirm / prompt', browserDialogs.length === 0, browserDialogs);
    ok('4: no page errors', errors.length === 0, errors.slice(0, 3));
    ok('4: no L2Swarm account was closed / opened (sandbox)', !mcp.some(l => /close_account|open_account/.test(l)), mcp.slice(-3));
    ok('4: the live Settings files are unchanged', LIVE0.every(([f, t]) => { try { return fs.statSync(path.join(SET, f)).mtimeMs === t; } catch (e) { return false; } }));
  } finally {
    try { sock.close(); } catch (e) { } try { br.kill(); } catch (e) { } try { srv.kill(); } catch (e) { }
    try { cp.execSync(`taskkill /F /T /PID ${br.pid}`, { stdio: 'ignore' }); } catch (e) { }
  }
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - failed} passed, ${failed} failed — screenshots in ${OUT}`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
