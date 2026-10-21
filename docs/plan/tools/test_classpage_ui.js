// CLASS PLANS: headless browser check of the Classes page + badges (Edge via CDP) against the SANDBOX server (cmdcenter_testserver.js:
// mocked MCP, nothing reaches the game). The plans file is a SCRATCH copy seeded from Scripts/data/class_plans.migrated.json (env
// SWARM_CLASSPLANS_FILE); every confirm() is accepted. The character states (class, level, swarm.js plan report) come from the FIXED folder
// fixtures/classpage_states (env SWARM_STATE_DIR, 2026-10-21): the live Logs/swarm_state_*.json change as the characters level. In it the
// Tank2 nukers are Elven Wizards and the Tank3 nukers Dark Wizards at level 38 (both before their 40 change). iPhone 390x844 + desktop 1366x900.
//   node docs/plan/tools/test_classpage_ui.js [screenshot dir]     (default: %TEMP%\classpage_shots — never the repo)
'use strict';
const path = require('path'), fs = require('fs'), cp = require('child_process'), os = require('os');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const OUT = process.argv[2] || path.join(os.tmpdir(), 'classpage_shots');
const EDGE = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find(f => fs.existsSync(f));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const results = []; const ok = (name, cond, info) => { results.push({ name, ok: !!cond }); console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${info ? ' — ' + info : ''}`); };

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'cpui-'));
  const PFILE = path.join(TMP, 'class_plans.json');
  fs.copyFileSync(path.join(__dirname, 'fixtures', 'class_plans_ui_seed.json'), PFILE);   // fixed seed (2026-10-21): the review file changes with the owner's accounts
  const SDIR = path.join(TMP, 'states'); fs.mkdirSync(SDIR);   // fixed states, stamped "now" (a stale heartbeat would show the rows as offline)
  const NOW = new Date().toISOString();
  for (const fn of fs.readdirSync(path.join(__dirname, 'fixtures', 'classpage_states')).filter(x => /^swarm_state_.+.json$/.test(x))) {
    const st = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'classpage_states', fn), 'utf8')); st.updated = NOW; fs.writeFileSync(path.join(SDIR, fn), JSON.stringify(st));
  }
  const LIVE = path.join(ROOT, 'Scripts', 'data', 'class_plans.json'); const liveSt = () => { try { const s = fs.statSync(LIVE); return s.size + ':' + s.mtimeMs; } catch (e) { return 'absent'; } }; const LIVE0 = liveSt();
  const srv = cp.spawn(process.execPath, [path.join(__dirname, 'cmdcenter_testserver.js')], { stdio: ['ignore', 'pipe', 'pipe'], env: Object.assign({}, process.env, { SWARM_CLASSPLANS_FILE: PFILE, SWARM_STATE_DIR: SDIR }) });
  let PORT = 0; const mcpLog = [];
  srv.stdout.on('data', d => String(d).split('\n').forEach(l => { const m = l.match(/^PORT (\d+)/); if (m) PORT = +m[1]; else if (l.startsWith('MCP ')) mcpLog.push(l); }));
  srv.stderr.on('data', d => process.stderr.write('[server] ' + d));
  for (let i = 0; i < 100 && !PORT; i++) await sleep(100);
  if (!PORT) throw new Error('sandbox server did not start');
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-edge-'));
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
  const shot = async (name) => { const r = await cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, `classpage_${name}.png`), Buffer.from(r.data, 'base64')); };
  const dialogs = [], errors = [];
  handlers.push((m) => {
    if (m.method === 'Page.javascriptDialogOpening') { dialogs.push({ type: m.params.type, msg: m.params.message }); cdp('Page.handleJavaScriptDialog', { accept: true, promptText: 'UI test team' }).catch(() => { }); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception ? m.params.exceptionDetails.exception.description : m.params.exceptionDetails.text);
  });
  await cdp('Page.enable'); await cdp('Runtime.enable');
  const UID = await require('./uidialog_testhook')(cdp, handlers, { answer: true, prompt: 'UI test team', onDialog: (d) => dialogs.push({ type: d.type, msg: d.msg, typeToConfirm: d.typeToConfirm }) });   // UIDIALOG 2026-10-10: the shared dialog answers itself
  const BASE = `http://127.0.0.1:${PORT}/`;
  const phone = async () => { await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }); await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }); };
  const desktop = async () => { await cdp('Emulation.setDeviceMetricsOverride', { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false }); await cdp('Emulation.setTouchEmulationEnabled', { enabled: false }); };
  const click = (sel) => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; e.click(); return true; })()`);
  const file = () => JSON.parse(fs.readFileSync(PFILE, 'utf8'));

  // ===================== iPhone: Parties tab badges + banner =====================
  await phone();
  await cdp('Page.navigate', { url: BASE + '#/parties' });
  ok('Parties tab loads', await waitFor(`document.querySelectorAll('.mem2').length > 30`, 25000));
  ok('top banner "N characters without an approved class plan"', await waitFor(`!!document.querySelector('#tab-parties .cpbanner')`, 15000), await ev(`(document.querySelector('.cpbanner') || {}).textContent || ''`).catch(() => ''));
  const rowB = await ev(`[...document.querySelectorAll('.mem2 .cpbadge')].map(b => b.closest('.mem2').dataset.char + ':' + b.querySelector('.lg').textContent.trim())`);
  ok('member rows of the nukers show "No class plan" (text, not only colour)', ['Nuker1', 'Nuker7'].every(n => rowB.some(x => x === n + ':No class plan')), rowB.slice(0, 6).join(', '));
  ok('approved members show no warning badge (Tank1, Inspector1)', !rowB.some(x => /^(Tank1|Inspector1):(No class plan|Plan not approved)/.test(x)));
  ok('party header badge on party Tank2 (6 without approved plan)', await ev(`[...document.querySelectorAll('.whead h2')].some(h => /Party Tank2/.test(h.textContent) && /6 no class plan/.test(h.textContent))`));
  ok('phone rows show the short text (No plan) with the full text as aria-label', await ev(`(() => { const b = document.querySelector('.mem2[data-char="Nuker1"] .cpbadge'); return getComputedStyle(b.querySelector('.sh')).display !== 'none' && b.querySelector('.sh').textContent === 'No plan' && /^No class plan: /.test(b.getAttribute('aria-label')); })()`));
  // 2D check (the badge sits in the 3rd row under exp / adena since NOJUMP-2026-10-13): it never overlaps the exp or adena cell, and its text is never clipped
  ok('the row badge never covers the exp column (phone) and is shown whole', await ev(`[...document.querySelectorAll('.mem2 .cpbadge')].every(b => { const r = b.getBoundingClientRect(), row = b.closest('.mem2'); const hit = (e) => { if (!e) return false; const q = e.getBoundingClientRect(); return r.left < q.right - 1 && q.left < r.right - 1 && r.top < q.bottom - 1 && q.top < r.bottom - 1; }; return !hit(row.querySelector('.xp')) && !hit(row.querySelector('.ad')) && b.scrollWidth <= b.clientWidth + 1 && r.right <= row.getBoundingClientRect().right + 1; })`), await ev(`(() => { const b = [...document.querySelectorAll('.mem2 .cpbadge')].find(b => b.scrollWidth > b.clientWidth + 1); return b ? b.closest('.mem2').dataset.char + ' clipped ' + b.clientWidth + '/' + b.scrollWidth : ''; })()`));
  ok('the badge is animated', await ev(`getComputedStyle(document.querySelector('.mem2 .cpbadge.cpb-miss')).animationName !== 'none'`));
  ok('no horizontal page scroll (iPhone, Parties)', await ev(`document.documentElement.scrollWidth <= innerWidth + 1`), await ev(`document.documentElement.scrollWidth + ' / ' + innerWidth`));
  await ev(`window.scrollTo(0, 0)`); await sleep(500); await shot('01_iphone_parties_banner');
  await ev(`(() => { const r = document.querySelector('.mem2[data-char="Nuker1"]'); if (r) r.scrollIntoView({ block: 'center' }); })()`); await sleep(400); await shot('02_iphone_member_badges');
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }); await sleep(200);
  ok('prefers-reduced-motion: no animation, badge text still there', await ev(`(() => { const b = document.querySelector('.mem2 .cpbadge.cpb-miss'); return getComputedStyle(b).animationName === 'none' && /No class plan/.test(b.textContent); })()`));
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });

  // ===================== iPhone: Classes page =====================
  await click('[data-tab="classes"]');
  ok('Classes tab opens #/classes with a party list', await waitFor(`/^#\\/classes/.test(location.hash) && document.querySelectorAll('.cpl-ptab').length >= 5`, 10000), await ev('location.hash'));
  await click('[data-cpparty="Tank2"]');
  ok('party Tank2: 9 member rows, 6 warned', await waitFor(`document.querySelectorAll('.cpl-mrow[data-cpname]').length === 9 && document.querySelectorAll('.cpl-mrow.warn').length === 6`), await ev(`document.querySelectorAll('.cpl-mrow.warn').length + ' warned'`));
  ok('no horizontal page scroll (iPhone, Classes)', await ev(`document.documentElement.scrollWidth <= innerWidth + 1`), await ev(`document.documentElement.scrollWidth + ' / ' + innerWidth`));
  ok('a suggestion is shown for the nukers (not saved)', await ev(`/suggested: Elven Wizard › Spellsinger › Mystic Muse/.test(document.querySelector('.cpl-mrow[data-cpname="Nuker1"]').textContent)`));
  await ev(`window.scrollTo(0, 0)`); await shot('03_iphone_classes_party');
  // picker
  await click('.cpl-mrow[data-cpname="Nuker1"] [data-cpact="pick"]');
  ok('picker opens as a bottom sheet with 3 steps, step 1 fixed (taken)', await waitFor(`!document.getElementById('cpSheet').hidden && document.querySelectorAll('.cpl-col').length === 3 && !!document.querySelector('.cpl-opt.fixed.on')`));
  ok('step 2 offers exactly the professions of Elven Wizard (Spellsinger, Elemental Summoner)', await ev(`(() => { const c = document.querySelectorAll('.cpl-col')[1]; return [...c.querySelectorAll('.cpl-opt b')].map(b => b.textContent).sort().join() === 'Elemental Summoner,Spellsinger'; })()`));
  await waitFor(`[...document.querySelectorAll('#cpPanel img')].every(i => i.complete && i.naturalWidth > 0)`, 6000);
  await shot('04_iphone_picker');
  await click('.cpl-opt[data-cpstep="2"][data-cpid="28"]'); await sleep(250);
  ok('choosing Elemental Summoner fills step 3 with Elemental Master (single child)', await ev(`/Elemental Summoner.*Elemental Master/.test(document.querySelector('.cpl-sum').textContent)`), await ev(`document.querySelector('.cpl-sum').textContent.replace(/\\s+/g, ' ')`));
  await click('.cpl-opt[data-cpstep="2"][data-cpid="27"]'); await sleep(250);
  ok('back to Spellsinger: step 3 = Mystic Muse', await ev(`/Spellsinger.*Mystic Muse/.test(document.querySelector('.cpl-sum').textContent)`));
  await waitFor(`[...document.querySelectorAll('#cpPanel img')].every(i => i.complete && i.naturalWidth > 0)`, 6000);
  await shot('05_iphone_picker_chosen');
  dialogs.length = 0;
  await click('[data-cpact="saveApprove"]');
  ok('Save & approve asks first, the text says what happens and when', await waitFor(`!document.getElementById('cpSheet') || document.getElementById('cpSheet').hidden`, 8000) && dialogs.length === 1 && /Approve the class plan of Nuker1/.test(dialogs[0].msg) && /at level 40: Spellsinger/.test(dialogs[0].msg) && /at level 76: Mystic Muse/.test(dialogs[0].msg) && /cannot be undone/.test(dialogs[0].msg), (dialogs[0] || {}).msg ? dialogs[0].msg.split('\n').slice(0, 6).join(' / ') : 'no dialog');
  const f1 = file().parties.Tank2.members.Nuker1;
  ok('saved to the scratch file as approved [26, 27, 103] by dashboard', f1 && JSON.stringify(f1.plan) === '[26,27,103]' && f1.approved === true && f1.approvedBy === 'dashboard', JSON.stringify(f1));
  ok('the row now shows "Approved" + next Spellsinger at 40', await waitFor(`/next: Spellsinger at 40/.test(document.querySelector('.cpl-mrow[data-cpname="Nuker1"]').textContent) && !document.querySelector('.cpl-mrow[data-cpname="Nuker1"]').classList.contains('warn')`, 8000));
  await shot('06_iphone_after_approve');
  // copy to the same class (the other Elven Wizards)
  dialogs.length = 0;
  await click('.cpl-mrow[data-cpname="Nuker1"] [data-cpact="copy"]');
  await waitFor(`document.querySelectorAll('.cpl-mrow.warn').length <= 1`, 8000);
  const vor = file().parties.Tank2.members;
  ok('copy to same class + approve: every other Elven Wizard got the plan, approved (2 confirms max)', ['Nuker2', 'Nuker3', 'Nuker4', 'Nuker5', 'Nuker6'].every(n => vor[n] && vor[n].approved === true && JSON.stringify(vor[n].plan) === '[26,27,103]') && dialogs.length >= 1 && /Copy Nuker1's plan/.test(dialogs[0].msg), dialogs.map(d => d.msg.split('\n')[0]).join(' | '));
  await shot('07_iphone_copied');
  // template preview on Tank3
  await click('[data-cpparty="Tank3"]'); await sleep(400);
  await ev(`(() => { const s = document.getElementById('cpTplSel'); s.value = 'example-dark-mages'; s.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
  await click('[data-cpact="applyTpl"]');
  ok('apply template shows the match first (nothing saved yet)', await waitFor(`!document.getElementById('cpSheet').hidden && document.querySelectorAll('.cpl-tm').length >= 8`, 8000), await ev(`document.querySelectorAll('.cpl-tm').length + ' rows'`));
  ok('the dark mage template matches the 5 Dark Elven Wizards to Spellhowler › Storm Screamer', await ev(`['Nuker7','Nuker8','Nuker9','Nuker10','Nuker11'].every(n => [...document.querySelectorAll('.cpl-tm')].some(r => r.textContent.includes(n) && /Spellhowler › Storm Screamer/.test(r.textContent)))`));
  await shot('08_iphone_template_preview');
  await ev(`(() => { [...document.querySelectorAll('input[data-cptm]')].forEach(c => { c.checked = ['Nuker7', 'Nuker8'].includes(c.dataset.cptm); }); return true; })()`);
  dialogs.length = 0;
  await click('[data-cpact="tplGo"]');
  await waitFor(`document.getElementById('cpSheet').hidden`, 8000);
  const dusk = file().parties.Tank3.members;
  ok('only the ticked rows are written, NOT approved (approve box unticked)', dusk.Nuker7 && dusk.Nuker7.approved === false && dusk.Nuker8 && !dusk.Nuker9 && dialogs.length === 1 && /NOT approved/.test(dialogs[0].msg), JSON.stringify(Object.keys(dusk)));
  ok('those two now show "Plan not approved" (animated, amber)', await waitFor(`['Nuker7','Nuker8'].every(n => /Plan not approved/.test(document.querySelector('.cpl-mrow[data-cpname="' + n + '"]').textContent))`, 8000));
  await shot('09_iphone_not_approved');
  dialogs.length = 0;
  await click('[data-cpact="approveAll"]');
  await waitFor(`!document.querySelector('[data-cpact="approveAll"]')`, 8000);
  ok('"Approve 2 plans…" lists both with their next step, then approves', dialogs.length === 1 && /Nuker7/.test(dialogs[0].msg) && /next: Spellhowler at 40/.test(dialogs[0].msg) && file().parties.Tank3.members.Nuker7.approved === true, (dialogs[0] || {}).msg ? dialogs[0].msg.split('\n').slice(0, 3).join(' / ') : '');

  // ===================== character page badge =====================
  await cdp('Page.navigate', { url: BASE + '#/char/Nuker9' });
  ok('character page shows the "No class plan" badge (Nuker9)', await waitFor(`/No class plan/.test((document.querySelector('.cp-sub') || {}).textContent || '')`, 20000));
  await sleep(600); await shot('10_iphone_charpage_badge');

  // ===================== desktop =====================
  await desktop();
  await cdp('Page.navigate', { url: BASE + '#/classes/Tank1' });
  ok('desktop: party Tank1, all approved, plan paths with taken / next steps', await waitFor(`document.querySelectorAll('.cpl-mrow[data-cpname]').length === 9 && document.querySelectorAll('.cpl-step.next').length >= 8`, 20000), await ev(`document.querySelectorAll('.cpl-step.next').length + ' next steps'`).catch(() => ''));
  await sleep(500); await shot('11_desktop_classes_shaded');
  await click('.cpl-mrow[data-cpname="Inspector1"] [data-cpact="pick"]'); await sleep(400);
  ok('desktop picker: Inspector1 (male Soul Breaker) — steps 1 and 2 fixed, step 3 = Soul Hound only', await ev(`document.querySelectorAll('.cpl-opt.fixed').length === 2 && [...document.querySelectorAll('.cpl-col')[2].querySelectorAll('.cpl-opt b')].map(b => b.textContent).join() === 'Soul Hound'`));
  await waitFor(`[...document.querySelectorAll('#cpPanel img')].every(i => i.complete && i.naturalWidth > 0)`, 6000);
  ok('every class icon in the picker loaded', await ev(`[...document.querySelectorAll('#cpPanel img')].every(i => i.complete && i.naturalWidth > 0)`));
  await shot('12_desktop_picker_inspector1');
  await ev(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`); await sleep(200);
  ok('Escape closes the picker', await ev(`document.getElementById('cpSheet').hidden`));
  await ev(`document.querySelector('.cpl-tpls').scrollIntoView()`); await sleep(300); await shot('13_desktop_templates');

  ok('no script errors in the page', !errors.length, errors.slice(0, 3).join(' | '));
  const writes = mcpLog.filter(l => /^MCP (run_account_command|send_game_action|close_account|open_account|manage_)/.test(l));
  ok('no game command reached even the mock MCP', !writes.length, writes.slice(0, 3).join(' | '));
  ok('the live Scripts/data/class_plans.json was never created or changed', liveSt() === LIVE0);
  const fails = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - fails} passed, ${fails} failed — screenshots in ${OUT}`);
  try { sock.close(); } catch (e) { } br.kill(); srv.kill();
  try { fs.rmSync(prof, { recursive: true, force: true }); fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { }
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
