// PARTY PLAN builder (2026-10-13, Dashboard/partyplan.js): headless browser check (Edge via CDP) against the SANDBOX server
// (cmdcenter_testserver.js: mocked MCP, nothing reaches the game). The plans file + progress folder + run switch are SCRATCH copies (env
// overrides); the live files are compared before / after. Every uidialog question answers itself (uidialog_testhook).
//   build (level step with a chosen place, a quest picked from the list with its reward, wait) -> reorder (▼ on the phone, drag and drop on a
//   desktop) -> Save ("Save and use it on Start") -> the file holds exactly that; Suggest a plan + Undo; save as a template; give it to another
//   party; the party card shows "📋 Plan" + the fixed-height plan line; ⚙ Settings has the Plan section; the progress box + Continue sends
//   "!plan next" (to the mock MCP / queue). iPhone 390x844 + desktop screenshots (docs/guide/img/party_plan_*.png with --guide).
//   node docs/plan/tools/test_party_plan_ui.js [screenshot dir] [--guide]
'use strict';
const path = require('path'), fs = require('fs'), cp = require('child_process'), os = require('os');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const ARGS = process.argv.slice(2), GUIDE = ARGS.includes('--guide');
const OUT = ARGS.filter(a => !/^--/.test(a))[0] || path.join(os.tmpdir(), 'partyplan_shots');
const EDGE = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'].find(f => fs.existsSync(f));   // NEVER Microsoft Edge (owner 2026-10-24): Chrome only
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const results = []; const ok = (name, cond, info) => { results.push({ name, ok: !!cond }); console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${info ? ' — ' + info : ''}`); };
const DATA = path.join(ROOT, 'Scripts', 'data'), LOGS = path.join(ROOT, 'Logs');
const rd = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch (e) { return null; } };
const LIVE = [path.join(DATA, 'party_plans.json'), path.join(DATA, 'run_state.json'), path.join(DATA, 'party_spots.json'), path.join(DATA, 'class_plans.json')];
const LIVE0 = Object.fromEntries(LIVE.map(f => [f, rd(f)]));

(async () => {
  if (!EDGE) { console.log('no Edge / Chrome — UI test skipped'); process.exit(0); }
  fs.mkdirSync(OUT, { recursive: true });
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ppui-'));
  const PLANS = path.join(TMP, 'data', 'party_plans.json'), PROG = path.join(TMP, 'logs'); fs.mkdirSync(path.dirname(PLANS), { recursive: true }); fs.mkdirSync(PROG, { recursive: true });
  const RUNF = path.join(TMP, 'run_state.json'); if (LIVE0[path.join(DATA, 'run_state.json')] != null) fs.writeFileSync(RUNF, LIVE0[path.join(DATA, 'run_state.json')]);
  const env = { SWARM_PARTYPLANS_FILE: PLANS, SWARM_PLANPROGRESS_DIR: PROG, SWARM_RUNSTATE_FILE: RUNF };
  const srv = cp.spawn(process.execPath, [path.join(__dirname, 'cmdcenter_testserver.js')], { stdio: ['ignore', 'pipe', 'pipe'], env: Object.assign({}, process.env, env) });
  const S = { port: 0, mcp: [] };
  srv.stdout.on('data', d => String(d).split('\n').forEach(l => { const m = l.match(/^PORT (\d+)/); if (m) S.port = +m[1]; else if (l.startsWith('MCP ')) S.mcp.push(l); }));
  srv.stderr.on('data', d => process.stderr.write('[server] ' + d));
  for (let i = 0; i < 150 && !S.port; i++) await sleep(100);
  if (!S.port) throw new Error('sandbox server did not start');
  const BASE = `http://127.0.0.1:${S.port}/`;

  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-edge-'));
  const DBG = 9300 + Math.floor(Math.random() * 500);
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
  const shot = async (name) => { try { await ev(`(document.querySelectorAll('#ukToasts .uk-toast').forEach(t => t.remove()), true)`); } catch (e) { } const r = await cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, `pp_${name}.png`), Buffer.from(r.data, 'base64')); if (GUIDE) fs.writeFileSync(path.join(ROOT, 'docs', 'guide', 'img', `party_plan_${name}.png`), Buffer.from(r.data, 'base64')); };
  const browserDialogs = [], dialogs = [], errors = [];
  handlers.push((m) => {
    if (m.method === 'Page.javascriptDialogOpening') { browserDialogs.push(m.params.type); cdp('Page.handleJavaScriptDialog', { accept: true }).catch(() => { }); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception ? m.params.exceptionDetails.exception.description : m.params.exceptionDetails.text);
  });
  await cdp('Page.enable'); await cdp('Runtime.enable');
  const UID = await require('./uidialog_testhook')(cdp, handlers, { answer: true, prompt: 'UI test template', uiMode: 'simple', onDialog: (d) => dialogs.push(d) });
  const phone = async () => { await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }); await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }); };
  const desktop = async () => { await cdp('Emulation.setDeviceMetricsOverride', { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false }); await cdp('Emulation.setTouchEmulationEnabled', { enabled: false }); };
  const click = (sel) => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; e.scrollIntoView({ block: 'center' }); e.click(); return true; })()`);
  const setVal = (sel, v) => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; e.value = ${JSON.stringify(v)}; e.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  const kinds = () => ev(`window.PartyPlan._state.W.steps.map(s => s.kind).join(',')`);
  const file = () => { const t = rd(PLANS); return t ? JSON.parse(t) : null; };
  const noScroll = () => ev(`document.documentElement.scrollWidth <= innerWidth + 1 && (() => { const s = document.getElementById('ppScroll'); return !s || s.scrollWidth <= s.clientWidth + 1; })()`);

  await phone();
  await cdp('Page.navigate', { url: BASE + '#/parties' });
  ok('party cards have a 📋 Plan button', await waitFor(`document.querySelectorAll('#tab-parties [data-ppopen]').length > 0`, 25000));
  const L = await ev(`(() => { const b = [...document.querySelectorAll('#tab-parties .ppbtn[data-ppopen]')]; const s = b.find(x => x.dataset.ppopen === 'Tank1') || b[0]; return s.dataset.ppopen; })()`);
  const OTHER = await ev(`[...document.querySelectorAll('#tab-parties .ppbtn[data-ppopen]')].map(b => b.dataset.ppopen).find(x => x !== ${JSON.stringify(L)}) || ''`);
  ok(`the Plan button sits right after ⚙ Settings on party ${L}'s card`, await ev(`(() => { const b = document.querySelector('#tab-parties .ppbtn[data-ppopen="${L}"]'); const p = b && b.previousElementSibling; return !!p && p.matches('[data-psopen]'); })()`));
  ok('no plan yet = no plan line on the card', await ev(`!document.querySelector('#tab-parties .ppline')`));
  await click(`#tab-parties .ppbtn[data-ppopen="${L}"]`);
  ok('the plan sheet opens (empty: "No steps yet")', await waitFor(`!document.getElementById('ppOv').hidden && !!window.PartyPlan._state.W && /No steps yet/.test(document.getElementById('ppBody').textContent)`, 20000));
  ok('full screen on the iPhone, no horizontal scroll', await ev(`(() => { const r = document.querySelector('.pp-dlg').getBoundingClientRect(); return r.width >= 389 && r.height >= 800; })()`) && await noScroll());
  ok('nothing to save after opening', /All saved/.test(await ev(`document.getElementById('ppBar').textContent`)));
  await shot('01_empty_phone');

  // ---- build: level step with a chosen place
  await click('#ppBody [data-ppact="add"]');
  ok('add: the 8 step kinds', await waitFor(`document.querySelectorAll('#ppBody [data-ppkind]').length === 8`, 5000));
  await shot('02_kinds_phone');
  await click('#ppBody [data-ppkind="level"]');
  await setVal('#ppBody [data-ppf="to"]', '20');
  await click('#ppBody [data-ppseg="spot.mode"][data-v="manual"]');
  ok('level: the place list (levels shown)', await waitFor(`document.querySelectorAll('#ppBody [data-ppspot]').length > 0`, 15000), await ev(`[...document.querySelectorAll('#ppBody [data-ppspot] b')].slice(0, 3).map(b => b.textContent).join(' | ')`));
  await click('#ppBody [data-ppspot="0"]');
  const lvlSent = await ev(`document.querySelector('#ppBody .pp-sent').textContent.trim()`);
  ok('level: the plain sentence follows the choice', /^⚔️ Level in .+ until level 20$/.test(lvlSent), lvlSent);
  await shot('03_level_editor_phone');
  await click('#ppBar [data-ppact="useStep"]');
  ok('level step added', await waitFor(`window.PartyPlan._state.view === 'list' && window.PartyPlan._state.W.steps.length === 1`, 5000));
  // ---- quest picked from the list (rewards + who can take it)
  await click('#ppBody [data-ppact="add"]'); await click('#ppBody [data-ppkind="quest"]');
  ok('quest: the list loads (fits the party)', await waitFor(`document.querySelectorAll('#ppBody [data-ppquest]').length > 0`, 20000));
  ok('quest: rewards and who can take it are shown', await ev(`!!document.querySelector('#ppBody [data-ppquest] .pp-rew') && !!document.querySelector('#ppBody [data-ppquest] .pp-el i')`));
  await setVal('#ppBody [data-ppq="quest"]', 'Special Order');
  await ev(`(() => { const c = document.querySelector('#ppBody [data-ppqfit]'); if (c && c.checked) { c.checked = false; c.dispatchEvent(new Event('change', { bubbles: true })); } return true; })()`);
  await waitFor(`[...document.querySelectorAll('#ppBody [data-ppquest] b')].some(b => b.textContent === 'A Special Order')`, 5000);
  await ev(`[...document.querySelectorAll('#ppBody [data-ppquest]')].find(b => b.querySelector('b').textContent === 'A Special Order').click()`);
  ok('quest: picked "A Special Order" — who does it + if it fails', await waitFor(`window.PartyPlan._state.edit.step.quest === 40 && !!document.querySelector('#ppBody [data-ppseg="mode"]') && !!document.querySelector('#ppBody [data-ppseg="onFail"]')`, 5000));
  await shot('04_quest_editor_phone');
  await click('#ppBar [data-ppact="useStep"]');
  await waitFor(`window.PartyPlan._state.W.steps.length === 2`, 5000);
  const s2 = await ev(`document.querySelectorAll('#ppBody li[data-ppidx]')[1].querySelector('.pp-txt b').textContent`);
  ok('quest step sentence names the town + reward', /^Do "A Special Order" \(Giran\)/.test(s2), s2);
  { const lo = await ev(`Math.min(...window.PartyPlan._state.party.members.map(m => m.level || 99))`);
    ok(`quest step: the level hint (party about ${Math.max(lo, 20)} here)`, await ev(`/party ≈ level [0-9]+ here/.test(document.querySelectorAll('#ppBody li[data-ppidx]')[1].textContent)`) && (lo >= 40 || await ev(`/needs level 40/.test(document.querySelectorAll('#ppBody li[data-ppidx]')[1].textContent)`))); }
  // ---- wait
  await click('#ppBody [data-ppact="add"]'); await click('#ppBody [data-ppkind="wait"]'); await click('#ppBar [data-ppact="useStep"]');
  ok('three steps: level, quest, wait', (await kinds()) === 'level,quest,wait');
  // ---- reorder on the phone
  await click('#ppBody [data-ppmove="1"][data-d="-1"]');
  ok('▲ on the phone: the quest moves up', (await kinds()) === 'quest,level,wait');
  await click('#ppBody [data-ppmove="0"][data-d="1"]');
  ok('▼ on the phone: back down', (await kinds()) === 'level,quest,wait');
  ok('unsaved changes are shown (Save on)', await ev(`/Unsaved changes/.test(document.getElementById('ppBar').textContent) && !document.querySelector('#ppBar [data-ppact="save"]').disabled`));
  await shot('05_timeline_phone');
  // ---- drag and drop on a desktop
  await desktop(); await ev(`window.PartyPlan.open && (window.PartyPlan._state.view = 'list', true)`); await ev(`(() => { window.dispatchEvent(new Event('resize')); return true; })()`);
  await ev(`(() => { const P = window.PartyPlan; return P._state; })() && true`);
  await click('#ppBody [data-ppmove="0"][data-d="1"]'); await click('#ppBody [data-ppmove="1"][data-d="-1"]');   // re-render on the desktop (draggable)
  ok('desktop: the steps are draggable', await ev(`document.querySelector('#ppBody li[data-ppidx="0"]').getAttribute('draggable') === 'true'`));
  await ev(`(() => { const from = document.querySelector('#ppBody li[data-ppidx="2"]'), to = document.querySelector('#ppBody li[data-ppidx="0"]'), dt = new DataTransfer();
    const r = to.getBoundingClientRect(), y = r.top + 3;
    from.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
    to.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt, clientY: y }));
    to.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, clientY: y }));
    from.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt })); return true; })()`);
  ok('desktop drag and drop: "wait" dragged to the top', (await kinds()) === 'wait,level,quest');
  await shot('06_timeline_desktop');
  await ev(`(() => { const S = window.PartyPlan._state.W.steps; S.push(S.shift()); return true; })()`);   // back: level, quest, wait
  await ev(`(() => { document.querySelector('#ppBody [data-ppmove="0"][data-d="1"]').click(); document.querySelector('#ppBody [data-ppmove="1"][data-d="-1"]').click(); return true; })()`);
  await phone();
  // ---- save ("Save and use it on Start")
  dialogs.length = 0;
  await click('#ppBar [data-ppact="save"]');
  ok('save asks "Save and use it on Start?" (uidialog)', await waitFor(`/All saved/.test(document.getElementById('ppBar').textContent)`, 10000) && dialogs.some(d => d.type === 'choice' && /Save and use it on Start/.test(d.buttons.join('|'))));
  let F = file(), P = F && F.parties && F.parties[L];
  ok('the file holds exactly the built plan (3 steps, in order, used on Start)', !!P && P.on === true && P.steps.map(s => s.kind).join() === 'level,quest,wait' && P.steps[0].to === 20 && P.steps[0].spot.mode === 'manual' && P.steps[1].quest === 40, JSON.stringify(P && P.steps.map(s => s.kind)));
  ok('only this party is in the file', F && Object.keys(F.parties).join() === L);
  ok('the progress box: "ready — Start begins at step 1/3"', await waitFor(`/Start begins at step 1\\/3/.test(document.querySelector('#ppBody .pp-prog').textContent) || /Plan step 1\\/3/.test(document.querySelector('#ppBody .pp-prog').textContent)`, 8000), await ev(`document.querySelector('#ppBody .pp-prog').textContent`));
  await shot('07_saved_phone');
  // ---- suggest + undo
  dialogs.length = 0;
  await click('#ppBody [data-ppact="suggest"]');
  ok('Suggest a plan: asks the target level, then replace / add (uidialog)', await waitFor(`window.PartyPlan._state.W.steps.length >= 2 && window.PartyPlan._state.W.steps[0].kind !== 'level' || window.PartyPlan._state.W.steps.map(s => s.kind).join() !== 'level,quest,wait'`, 15000) && dialogs.filter(d => d.type === 'choice').length >= 2, `${await ev(`window.PartyPlan._state.W.steps.length`)} steps`);
  ok('the suggestion ends with "wait for my order"', await ev(`(() => { const S = window.PartyPlan._state.W.steps; return S[S.length - 1].kind === 'wait'; })()`));
  await shot('08_suggest_phone');
  await click('#ppBar [data-ppact="undo"]');
  ok('Undo: back to the saved plan', await waitFor(`/All saved/.test(document.getElementById('ppBar').textContent)`, 5000) && (await kinds()) === 'level,quest,wait');
  // ---- template
  await click('#ppBody [data-ppact="templates"]'); await click('#ppBody [data-ppact="saveTpl"]');
  ok('template saved by name (uiPrompt)', await waitFor(`!!(window.PartyPlan._state.D.templates || []).find(t => t.name === 'UI test template')`, 8000) && !!(file().templates || {})['ui-test-template']);
  await shot('09_templates_phone');
  await click('#ppOv [data-ppact="back"]');
  // ---- give it to another party
  if (OTHER) {
    await click('#ppBody [data-ppact="apply"]');
    await ev(`(() => { const c = document.querySelector('#ppBody [data-ppapply="${OTHER}"]'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
    await click('#ppBar [data-ppact="doApply"]');
    await waitFor(`window.PartyPlan._state.view === 'list'`, 8000);
    const F2 = file();
    ok(`given to party ${OTHER} (not used on Start: its switch stays off)`, F2.parties[OTHER] && F2.parties[OTHER].on === false && F2.parties[OTHER].steps.length >= 2 && F2.parties[L].steps.length === 3);
  } else ok('another party to give the plan to (skipped: only one party)', true);
  // ---- control: Continue / Skip send "!plan ..." to the party (mock MCP / queue)
  fs.writeFileSync(path.join(PROG, `plan_progress_${L}.json`), JSON.stringify({ stepId: file().parties[L].steps[2].id, status: 'waiting', done: { [file().parties[L].steps[0].id]: {}, [file().parties[L].steps[1].id]: {} } }));
  await ev(`window.PartyPlan.close()`); await ev(`window.PartyPlan.open(${JSON.stringify(L)})`);
  ok('waiting at step 3: the box says so + "▶ Continue"', await waitFor(`/waits for you at step 3\\/3/.test(document.querySelector('#ppBody .pp-prog').textContent) && !!document.querySelector('#ppBody [data-ppctl="next"]')`, 10000));
  ok('done steps are ticked, the current step is marked', await ev(`document.querySelectorAll('#ppBody li.done').length === 2 && !!document.querySelector('#ppBody li.cur[data-ppidx="2"]')`));
  await shot('10_waiting_phone');
  const before = S.mcp.length;
  await click('#ppBody [data-ppctl="next"]');
  await sleep(1500);
  ok('Continue sends "!plan next" to the party', S.mcp.slice(before).some(l => /!plan next/.test(l)) || await ev(`fetch('/api/orders?party=${L}').then(r => r.ok ? r.text() : '').then(t => /!plan next/.test(t)).catch(() => false)`) || dialogs.some(d => /Continue the plan/.test(d.title)));
  await ev(`window.PartyPlan.close()`);
  // ---- party card line + ⚙ Settings section
  ok('the party card shows the plan line (fixed height)', await waitFor(`(() => { const e = document.querySelector('#tab-parties .ppline[data-ppopen="${L}"]'), r = document.querySelector('#tab-parties .runline'); return !!e && /Plan/.test(e.textContent) && (!r || Math.abs(e.getBoundingClientRect().height - r.getBoundingClientRect().height) <= 2); })()`, 20000), await ev(`(document.querySelector('#tab-parties .ppline') || {}).textContent || ''`));
  await shot('11_party_card_phone');
  await ev(`window.PartySettings.open(${JSON.stringify(L)})`);
  ok('⚙ Settings has a Plan section that opens the plan', await waitFor(`!!document.querySelector('#psBody details[data-pssec="plan"] [data-psplan]')`, 15000));
  await ev(`(() => { const d = document.querySelector('#psBody details[data-pssec="plan"]'); d.open = true; d.querySelector('[data-psplan]').click(); return true; })()`);
  ok('... and it does (settings closed, plan open)', await waitFor(`document.getElementById('psOv').hidden && !document.getElementById('ppOv').hidden`, 8000));
  await ev(`window.PartyPlan.close()`);

  // ---- global checks
  ok('no browser alert / confirm / prompt was used', !browserDialogs.length, browserDialogs.join(','));
  ok('no script errors in the page', !errors.length, errors.slice(0, 3).join(' | '));
  ok('the live files were not changed', Object.entries(LIVE0).every(([f, t]) => rd(f) === t), Object.entries(LIVE0).filter(([f, t]) => rd(f) !== t).map(([f]) => path.basename(f)).join(', '));
  const writes = S.mcp.filter(l => /^MCP (send_game_action|close_account|open_account|manage_)/.test(l));
  ok('no game action (only the party-chat order "!plan next")', !writes.length, writes.join(' | '));
  srv.kill();
  const fails = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - fails} passed, ${fails} failed — screenshots in ${OUT}`);
  try { sock.close(); } catch (e) { } br.kill();
  try { fs.rmSync(prof, { recursive: true, force: true }); fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { }
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
