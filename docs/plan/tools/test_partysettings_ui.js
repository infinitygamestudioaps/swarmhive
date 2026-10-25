// PARTY SETTINGS popup (2026-10-13, Dashboard/partysettings.js): headless browser check (Edge via CDP) against the SANDBOX server
// (cmdcenter_testserver.js: mocked MCP, nothing reaches the game). Every settings file the popup writes is a SCRATCH copy (env overrides);
// the live files are compared before / after. Every uidialog question answers itself (uidialog_testhook).
//   Phase A — the owner's values (scratch copies of the live files): the popup shows them unchanged; one edit per section, Save, and
//             exactly those keys change in exactly those files (everything else equal); Undo; conflict detection (a file changed meanwhile);
//             the character page button; iPhone 390x844 + desktop screenshots.
//   Phase A2 (2026-10-13 PARTYAUTO / FUNDGIVERS): Supplies shows the owner's party_auto.json (ON), switching the supply watch + one member's
//             selling writes exactly those keys; Money "Who gives to party X" = Only chosen + a ticked leader writes parties.<X>.givers only;
//             a Supplies change made meanwhile is detected.
//   Phase B — a fresh install (public-package defaults, empty / missing files): every automation of a party shows OFF, and an unknown
//             party (not in swarm.config.json) opens without errors, everything OFF.
//   node docs/plan/tools/test_partysettings_ui.js [screenshot dir]     (default: %TEMP%\partysettings_shots)
'use strict';
const path = require('path'), fs = require('fs'), cp = require('child_process'), os = require('os');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const OUT = process.argv[2] || path.join(os.tmpdir(), 'partysettings_shots');
const EDGE = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'].find(f => fs.existsSync(f));   // NEVER Microsoft Edge (owner 2026-10-24): Chrome only
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const results = []; const ok = (name, cond, info) => { results.push({ name, ok: !!cond }); console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${info ? ' — ' + info : ''}`); };
const DATA = path.join(ROOT, 'Scripts', 'data'), LOGS = path.join(ROOT, 'Logs');
// env name -> live file (copied to scratch in phase A)
const FILES = {
  SWARM_FUNDRULES_FILE: path.join(DATA, 'fund_rules.json'), SWARM_GEARAUTO_FILE: path.join(DATA, 'gear_auto.json'), SWARM_STASHRULES_FILE: path.join(DATA, 'stash_rules.json'),
  SWARM_TACTICS_FILE: path.join(DATA, 'party_tactics.json'), SWARM_ROUTERULES_FILE: path.join(DATA, 'route_rules.json'), SWARM_SEVENSIGNS_FILE: path.join(DATA, 'seven_signs.json'),
  SWARM_CLANQUESTS_FILE: path.join(DATA, 'clan_quests.json'), SWARM_RUNSTATE_FILE: path.join(DATA, 'run_state.json'), SWARM_DAILY_FILE: path.join(LOGS, 'daily_enabled.json'),
  SWARM_CLANAUTO_FILE: path.join(LOGS, 'clan_auto.json'), SWARM_FUNDLOG_FILE: path.join(LOGS, 'fund_log.json'),
  SWARM_PARTYAUTO_FILE: path.join(DATA, 'party_auto.json'),   // PARTYAUTO 2026-10-13: Supplies section
  SWARM_RESRULES_FILE: path.join(DATA, 'res_rules.json'),     // RESURRECTION 2026-10-13: Resurrection section (missing = automatic res ON)
  SWARM_LOOTRULES_FILE: path.join(DATA, 'loot_rules.json'),   // LOOT RULES 2026-10-13: Loot section (missing = OFF; details: test_loot_ui.js)
  SWARM_SERVEROPTS_FILE: path.join(DATA, 'server_options.json'),   // SRVOPT-2026-10-21: Server section (missing = today's behaviour; details: test_server_options.js)
};
const rd = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch (e) { return null; } };
const LIVE0 = Object.fromEntries(Object.values(FILES).map(f => [f, rd(f)]));
const strip = (o) => { const c = JSON.parse(JSON.stringify(o)); delete c._updated; return c; };
const same = (a, b) => JSON.stringify(strip(a)) === JSON.stringify(strip(b));

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
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'psui-'));
  const backupDir = path.join(ROOT, 'Settings', 'backup'); const bk0 = new Set((() => { try { return fs.readdirSync(backupDir); } catch (e) { return []; } })());
  // ---- phase A scratch: copies of the owner's live files
  const A = {}; fs.mkdirSync(path.join(TMP, 'a'));
  Object.entries(FILES).forEach(([k, f]) => { const p = path.join(TMP, 'a', path.basename(f)); const t = rd(f); if (t != null) fs.writeFileSync(p, t); A[k] = p; });
  const fileA = (k) => { const t = rd(A[k]); return t == null ? null : JSON.parse(t.replace(/^\uFEFF/, '')); };
  const A0 = Object.fromEntries(Object.keys(A).map(k => [k, rd(A[k])]));

  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-edge-'));
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
  const shot = async (name) => { const r = await cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, `ps_${name}.png`), Buffer.from(r.data, 'base64')); };
  const browserDialogs = [], dialogs = [], errors = [];
  handlers.push((m) => {
    if (m.method === 'Page.javascriptDialogOpening') { browserDialogs.push(m.params.type); cdp('Page.handleJavaScriptDialog', { accept: true }).catch(() => { }); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception ? m.params.exceptionDetails.exception.description : m.params.exceptionDetails.text);
  });
  await cdp('Page.enable'); await cdp('Runtime.enable');
  const UID = await require('./uidialog_testhook')(cdp, handlers, { answer: true, uiMode: 'simple', onDialog: (d) => dialogs.push(d) });
  const phone = async () => { await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }); await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }); };
  const desktop = async () => { await cdp('Emulation.setDeviceMetricsOverride', { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false }); await cdp('Emulation.setTouchEmulationEnabled', { enabled: false }); };
  const click = (sel) => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; e.click(); return true; })()`);
  const setVal = (sel, v, evn = 'change') => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; e.value = ${JSON.stringify(v)}; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event(${JSON.stringify(evn)}, { bubbles: true })); return true; })()`);
  const openSec = (k) => ev(`(() => { const d = document.querySelector('#psBody details[data-pssec="${k}"]'); if (!d) return false; d.open = true; d.scrollIntoView(); return true; })()`);
  const swState = (p) => ev(`(() => { const e = document.querySelector('#psBody [data-psw="${p}"]'); return e ? e.getAttribute('aria-checked') : null; })()`);
  const barText = () => ev(`document.getElementById('psBar').textContent`);
  const noScroll = () => ev(`document.documentElement.scrollWidth <= innerWidth + 1 && (() => { const s = document.getElementById('psScroll'); return !s || s.scrollWidth <= s.clientWidth + 1; })()`);

  // ===================================================================== PHASE A: the owner's values
  let S = await startServer(A);
  let BASE = `http://127.0.0.1:${S.port}/`;
  await phone();
  await cdp('Page.navigate', { url: BASE + '#/parties' });
  ok('A: party cards have a ⚙ Settings button', await waitFor(`document.querySelectorAll('[data-psopen]').length > 0`, 25000));
  const L = await ev(`(() => { const b = [...document.querySelectorAll('#tab-parties [data-psopen]')]; const s = b.find(x => x.dataset.psopen === 'Tank1') || b[0]; return s.dataset.psopen; })()`);
  ok(`A: the button sits right after Start / Stop on party ${L}'s card`, await ev(`(() => { const b = document.querySelector('#tab-parties [data-psopen="${L}"]'); const p = b && b.previousElementSibling; return !!p && p.matches('[data-runsw]'); })()`));
  await click(`#tab-parties [data-psopen="${L}"]`);
  ok('A: the popup opens and loads every section', await waitFor(`!document.getElementById('psOv').hidden && !!window.PartySettings._state.W && document.querySelectorAll('#psBody details.ps-sec').length >= 8`, 20000),
    await ev(`[...document.querySelectorAll('#psBody details.ps-sec')].map(d => d.dataset.pssec).join(',')`));
  ok('A: full screen on the iPhone, no horizontal scroll', await ev(`(() => { const r = document.querySelector('.ps-dlg').getBoundingClientRect(); return r.width >= 389 && r.height >= 800; })()`) && await noScroll());
  ok('A: Save is off until something changes ("All saved")', /All saved/.test(await barText()) && await ev(`document.querySelector('[data-psact="save"]').disabled`));
  const unavailable = await ev(`[...document.querySelectorAll('#psBody .ps-note.bad')].map(n => n.closest('details').dataset.pssec + ': ' + n.textContent.slice(0, 80))`);
  ok('A: every source answered (no "Not available")', !unavailable.length, unavailable.join(' | '));
  await shot('01_iphone_top');

  // the owner's values are shown as they are
  const fund = fileA('SWARM_FUNDRULES_FILE') || {}, gear = fileA('SWARM_GEARAUTO_FILE') || {}, tact = fileA('SWARM_TACTICS_FILE') || {}, stash = fileA('SWARM_STASHRULES_FILE') || {};
  const W = await ev('JSON.stringify(window.PartySettings._state.W)').then(JSON.parse);
  ok('A: money shows the file (hand-outs on/off, receive)', W.money && W.money.on === (fund.on !== false) && (fund.parties && fund.parties[L] ? W.money.receive === (fund.parties[L].receive !== false) : W.money.receive === null), JSON.stringify({ on: W.money && W.money.on, receive: W.money && W.money.receive }));
  const gearEff = typeof ((gear.parties || {})[L] || {}).auto === 'boolean' ? gear.parties[L].auto : gear.default === true;
  ok(`A: gear switch = the file (${gearEff ? 'on' : 'off'}, ${typeof ((gear.parties || {})[L] || {}).auto === 'boolean' ? 'party' : 'all parties'})`, (await swState('gear.party')) === String(gearEff));
  const tMode = Object.assign({ mode: 'off' }, tact._defaults || {}, tact[L] || {}).mode;
  ok(`A: hunting groups = the file (${tMode})`, W.tactics && W.tactics.mode === tMode);
  ok('A: storage letters + party auto read from the file', W.storage && typeof W.storage.letters === 'boolean' && (W.storage.party.auto === (typeof ((stash.parties || {})[L] || {}).auto === 'boolean' ? stash.parties[L].auto : null)));
  ok('A: opening the popup wrote nothing', Object.keys(A).every(k => rd(A[k]) === A0[k]));
  // owner-only circuit link is in the page here (PRIVATE block), Advanced details hidden in Simple
  await openSec('run');
  ok('A: Start / Stop section: the state + what Start will do', await ev(`/Start will:/.test(document.querySelector('#psBody [data-pssec="run"]').textContent)`));
  ok('A: Simple view hides the technical details (file names)', await ev(`(() => { const a = document.querySelector('#psBody .ps-adv'); return !!a && getComputedStyle(a).display === 'none'; })()`));

  // ---- one edit per section
  await openSec('money'); await sleep(150);
  await shot('02_iphone_money');
  await setVal('#psBody input[data-psin="money.lt"]', '9m');
  ok('A: "9m" is accepted and shown as 9,000,000', await waitFor(`document.querySelector('#psBody input[data-psin="money.lt"]').value === '9,000,000'`, 3000));
  await setVal('#psBody input[data-psin="money.mt"]', 'abc', 'input');
  ok('A: a bad amount is marked and blocks Save', await waitFor(`/not valid/.test(document.getElementById('psBar').textContent) && document.querySelector('[data-psact="save"]').disabled`, 3000));
  await setVal('#psBody input[data-psin="money.mt"]', '');
  await openSec('gear'); await click('#psBody [data-psw="gear.party"]');
  const gearNew = !gearEff;
  await openSec('storage'); await setVal('#psBody select[data-pssel="storage.party.dest"]', 'private');
  const lettersOn = !!(stash.letters && stash.letters.on);
  if (lettersOn) await click('#psBody [data-psw="storage.letters"]');
  await openSec('fight'); await click(`#psBody [data-psseg="tactics.mode"][data-v="${tMode === 'auto' ? 'on' : 'auto'}"]`);
  const tNew = tMode === 'auto' ? 'on' : 'auto';
  await openSec('routes'); const rr0 = await swState('routes.buyKeys'); await click('#psBody [data-psw="routes.buyKeys"]');
  // MOVETOGETHER step 2: the walking-together numbers (plain label, default + range in the hint, validated)
  ok('A: Routes shows the walking-together numbers with their defaults', await ev(`(() => { const e = document.querySelector('#psBody input[data-psin="routes.mtLeaveSec"]'), f = e && e.closest('.ps-field'); return !!(e && e.placeholder === '90' && /default 90 s · 20 to 1800 s/.test(f.textContent) && /go on without a stuck member after/.test(f.textContent) && document.querySelector('#psBody input[data-psin="routes.mtMaxWaitSec"]') && document.querySelector('#psBody input[data-psin="routes.mtPaceGap"]') && document.querySelector('#psBody input[data-psin="routes.mtStuckSec"]')); })()`));
  await setVal('#psBody input[data-psin="routes.mtLeaveSec"]', '5', 'input');
  ok('A: 5 s (below 20) is refused right away and blocks Save', await waitFor(`document.querySelector('#psBody input[data-psin="routes.mtLeaveSec"]').hasAttribute('aria-invalid') && document.querySelector('[data-psact="save"]').disabled`, 3000));
  await setVal('#psBody input[data-psin="routes.mtLeaveSec"]', '150', 'input');
  await openSec('daily'); const k0 = await swState('daily.kamaloka'); await click('#psBody [data-psw="daily.kamaloka"]');
  const ss0 = await swState('ss.enrolled'); await click('#psBody [data-psw="ss.enrolled"]');
  const hasClan = await ev(`!!document.querySelector('#psBody [data-psw="clan.invite"]')`);
  let ci0 = null; if (hasClan) { await openSec('clan'); ci0 = await swState('clan.invite'); await click('#psBody [data-psw="clan.invite"]'); }
  ok('A: the bar lists the unsaved sections', await waitFor(`/Unsaved changes/.test(document.getElementById('psBar').textContent) && !document.querySelector('[data-psact="save"]').disabled`, 3000), await barText());
  await shot('03_iphone_unsaved');
  dialogs.length = 0;
  await click('#psBar [data-psact="save"]');
  ok('A: saved ("All saved" again)', await waitFor(`/All saved/.test(document.getElementById('psBar').textContent)`, 60000), await barText());
  ok('A: one confirmation listing the changes (uidialog)', dialogs.some(d => d.type === 'confirm' && /Save the settings of party/.test(d.title) && /Leader top-up: 9,000,000/.test(d.msg)), dialogs.map(d => d.title).join(' | '));
  ok('A: turning gear upgrades on warns about spending adena', !gearNew || dialogs.some(d => /spend adena on gear/.test(d.msg)));

  // ---- exactly the right keys in exactly the right files
  const exp = (k, mut) => { const o = JSON.parse(A0[k].replace(/^\uFEFF/, '')); mut(o); return o; };
  const fundNow = fileA('SWARM_FUNDRULES_FILE');
  ok('A: fund_rules.json: only parties.' + L + ' changed (leader target 9,000,000)', same(fundNow, exp('SWARM_FUNDRULES_FILE', o => { o.parties = o.parties || {}; o.parties[L] = Object.assign({ receive: true }, o.parties[L] ? { receive: o.parties[L].receive !== false } : {}, (o.parties[L] && o.parties[L].memberTarget != null) ? { memberTarget: o.parties[L].memberTarget } : {}, { leaderTarget: 9000000 }); })),
    JSON.stringify((fundNow.parties || {})[L]));
  const gearNow = fileA('SWARM_GEARAUTO_FILE');
  ok(`A: gear_auto.json: only parties.${L}.auto = ${gearNew}`, gearNow && gearNow.parties && gearNow.parties[L] && gearNow.parties[L].auto === gearNew &&
    same(Object.assign({}, gearNow, { parties: Object.assign({}, gearNow.parties, { [L]: undefined }) }), Object.assign({}, A0.SWARM_GEARAUTO_FILE ? JSON.parse(A0.SWARM_GEARAUTO_FILE) : {}, { version: 1, parties: Object.assign({}, (JSON.parse(A0.SWARM_GEARAUTO_FILE || '{}').parties || {}), { [L]: undefined }) })), JSON.stringify(gearNow && gearNow.parties));
  const stNow = fileA('SWARM_STASHRULES_FILE');
  const M = await ev('JSON.stringify(window.PartySettings._state.M)').then(JSON.parse);
  const SAN = require(path.join(ROOT, 'Dashboard', 'storagepage_api.js')).storageSanitize, san = (o) => SAN(o, o).rules;   // the API normalizes the whole file on every save
  ok(`A: stash_rules.json: parties.${L}.dest = private${lettersOn ? ' + the party\'s members in letters.except' : ''}, nothing else`, same(san(stNow), san(exp('SWARM_STASHRULES_FILE', o => {
    o.parties = o.parties || {}; o.parties[L] = Object.assign({}, o.parties[L], { dest: 'private' });
    if (lettersOn) o.letters.except = [...new Set((o.letters.except || []).concat(M))].sort();
  }))), JSON.stringify({ p: (stNow.parties || {})[L], ex: stNow.letters && stNow.letters.except }));
  const tNow = fileA('SWARM_TACTICS_FILE');
  ok(`A: party_tactics.json: only ${L}.mode = ${tNew}`, tNow[L] && tNow[L].mode === tNew && Object.keys(tNow).filter(k => k !== L && k !== '_updated').every(k => JSON.stringify(tNow[k]) === JSON.stringify(JSON.parse(A0.SWARM_TACTICS_FILE)[k])), JSON.stringify(tNow[L]));
  const rNow = fileA('SWARM_ROUTERULES_FILE');
  ok(`A: route_rules.json: only parties.${L}.buyKeys = ${rr0 !== 'true'} + mtLeaveSec = 150`, rNow.parties[L] && rNow.parties[L].buyKeys === (rr0 !== 'true') && rNow.parties[L].mtLeaveSec === 150 && same(Object.assign({}, rNow, { parties: Object.assign({}, rNow.parties, { [L]: undefined }) }), Object.assign({}, JSON.parse(A0.SWARM_ROUTERULES_FILE), { parties: Object.assign({}, JSON.parse(A0.SWARM_ROUTERULES_FILE).parties, { [L]: undefined }) })), JSON.stringify(rNow.parties));
  const dNow = fileA('SWARM_DAILY_FILE');
  ok(`A: daily_enabled.json: ${L}.kamaloka = ${k0 !== 'true'}`, dNow && dNow[L] && dNow[L].kamaloka === (k0 !== 'true'), JSON.stringify(dNow && dNow[L]));
  const sNow = fileA('SWARM_SEVENSIGNS_FILE');
  ok(`A: seven_signs.json: ${L} ${ss0 === 'true' ? 'removed from' : 'added to'} parties, nothing else`, (sNow.parties || []).includes(L) === (ss0 !== 'true') && same(Object.assign({}, sNow, { parties: null }), Object.assign({}, JSON.parse(A0.SWARM_SEVENSIGNS_FILE), { parties: null })), JSON.stringify(sNow.parties));
  if (hasClan) { const cNow = fileA('SWARM_CLANQUESTS_FILE'); ok(`A: clan_quests.json: ${L} ${ci0 === 'true' ? 'out of' : 'in'} clan.inviteParties, nothing else`, ((cNow.clan || {}).inviteParties || []).includes(L) === (ci0 !== 'true') && same(Object.assign({}, cNow, { clan: Object.assign({}, cNow.clan, { inviteParties: null }) }), Object.assign({}, JSON.parse(A0.SWARM_CLANQUESTS_FILE), { clan: Object.assign({}, JSON.parse(A0.SWARM_CLANQUESTS_FILE).clan, { inviteParties: null }) }))); }
  else ok('A: no clan section (no clan in the clan file)', true);
  ok('A: run_state.json was not touched (Start / Stop are not part of Save)', rd(A.SWARM_RUNSTATE_FILE) === A0.SWARM_RUNSTATE_FILE);
  ok('A: party_auto.json was not touched by the first save (Supplies unchanged)', rd(A.SWARM_PARTYAUTO_FILE) === A0.SWARM_PARTYAUTO_FILE);

  // ---- A2: Supplies (party_auto.json) + who gives to this party (fund_rules.json parties.<L>.givers)
  const pa0 = fileA('SWARM_PARTYAUTO_FILE') || {}, paP = ((pa0.parties || {})[L]) || {};
  const paEff = (k) => (typeof paP[k] === 'boolean' ? paP[k] : (pa0.default || {})[k] === true);
  await openSec('supplies'); await sleep(150);
  ok('A2: Supplies shows the file (supply watch / selling / symbols)', (await swState('supplies.party.supplyWatch')) === String(paEff('supplyWatch')) && (await swState('supplies.party.sell')) === String(paEff('sell')) && (await swState('supplies.party.dyes')) === String(paEff('dyes')),
    JSON.stringify(paP));
  ok('A2: Supplies says your orders still work', await ev(`/Your orders always work/.test(document.querySelector('#psBody [data-pssec="supplies"]').textContent)`));
  await shot('07_iphone_supplies');
  await click('#psBody [data-psw="supplies.party.supplyWatch"]');
  const memberS = M.find(n => n !== L) || L;
  await ev(`(() => { const d = document.querySelector('#psBody [data-pssec="supplies"] details.ps-more'); if (d) d.open = true; return true; })()`);
  await setVal(`#psBody select[data-pssel="supplies.chars.${memberS}.sell"]`, 'off');
  await openSec('money'); await sleep(100);
  await click('#psBody [data-psseg="money.pg"][data-v="list"]');
  const giverPick = await ev(`(() => { const b = document.querySelector('#psBody [data-psgiverp]'); return b ? b.dataset.psgiverp : ''; })()`);
  if (giverPick) await click(`#psBody [data-psgiverp="${giverPick}"]`);
  ok('A2: "Who gives to party" shows the chosen giver in its state line', !!giverPick && await ev(`/only ${giverPick} may give to this party/.test(document.querySelector('#psBody .ps-pgstate').textContent)`), giverPick);
  await shot('08_iphone_money_givers');
  const fund1 = fileA('SWARM_FUNDRULES_FILE'), pauto1 = rd(A.SWARM_PARTYAUTO_FILE);
  dialogs.length = 0;
  await click('#psBar [data-psact="save"]');
  ok('A2: saved', await waitFor(`/All saved/.test(document.getElementById('psBar').textContent)`, 60000), await barText());
  ok('A2: the confirmation lists the supply watch, the member\'s selling and who gives', dialogs.some(d => d.type === 'confirm' && /Supply runs when someone runs low/.test(d.msg) && new RegExp(memberS + ': selling off').test(d.msg) && /Who gives to party/.test(d.msg)), dialogs.map(d => d.msg).join(' | ').slice(0, 400));
  const pa1 = fileA('SWARM_PARTYAUTO_FILE');
  const paExp = JSON.parse(pa0 && A0.SWARM_PARTYAUTO_FILE ? A0.SWARM_PARTYAUTO_FILE : '{}'); paExp.parties = paExp.parties || {}; paExp.chars = paExp.chars || {};
  paExp.parties[L] = Object.assign({}, paExp.parties[L], { supplyWatch: !paEff('supplyWatch') }); paExp.chars[memberS] = Object.assign({}, paExp.chars[memberS], { sell: false });
  const noAbout = (o) => { const c = strip(o); delete c._about; if (!A0.SWARM_PARTYAUTO_FILE) delete c.default; delete c.v; return c; };
  ok(`A2: party_auto.json: only parties.${L}.supplyWatch + chars.${memberS}.sell changed`, pa1 && same(noAbout(pa1), noAbout(paExp)), JSON.stringify({ p: pa1 && pa1.parties[L], c: pa1 && pa1.chars }).slice(0, 300));
  const fund2 = fileA('SWARM_FUNDRULES_FILE');
  ok(`A2: fund_rules.json: only parties.${L}.givers = { list: [${giverPick}] } added`, fund2.parties[L].givers && fund2.parties[L].givers.mode === 'list' && JSON.stringify(fund2.parties[L].givers.list) === JSON.stringify([giverPick])
    && same(Object.assign({}, fund2, { parties: Object.assign({}, fund2.parties, { [L]: Object.assign({}, fund2.parties[L], { givers: undefined }) }) }), Object.assign({}, fund1, { parties: Object.assign({}, fund1.parties, { [L]: Object.assign({}, fund1.parties[L], { givers: undefined }) }) })),
    JSON.stringify(fund2.parties[L]));
  ok('A2: the shared "who gives" is unchanged', JSON.stringify(fund2.givers) === JSON.stringify(fund1.givers));
  // a Supplies change made meanwhile (another page) is detected
  await openSec('supplies'); await click('#psBody [data-psw="supplies.party.dyes"]');
  const paM = fileA('SWARM_PARTYAUTO_FILE'); paM.parties[L] = Object.assign({}, paM.parties[L], { sell: !paEff('sell') }); fs.writeFileSync(A.SWARM_PARTYAUTO_FILE, JSON.stringify(paM, null, 1));
  dialogs.length = 0;
  await click('#psBar [data-psact="save"]');
  ok('A2: a Supplies change made meanwhile is detected (Changed meanwhile -> Reload keeps it)', await waitFor(`/All saved/.test(document.getElementById('psBar').textContent)`, 60000) && dialogs.some(d => d.type === 'choice' && /Changed meanwhile/.test(d.title) && /Supplies/.test(d.msg))
    && fileA('SWARM_PARTYAUTO_FILE').parties[L].sell === !paEff('sell') && fileA('SWARM_PARTYAUTO_FILE').parties[L].dyes === paM.parties[L].dyes, dialogs.map(d => d.type + ':' + d.title + ':' + (d.msg || '').slice(0, 80)).join(' | '));
  void pauto1;

  // ---- A2b (SUPPLYAMT 2026-10-14): how much each character carries — suggested amounts, a bad number, save, clear
  { const SUG = require(path.join(ROOT, 'Dashboard', 'partyauto_api.js')).SUGGEST;
    await openSec('supplies'); await sleep(100);
    await ev(`(() => { document.querySelectorAll('#psBody [data-pssec="supplies"] details.ps-more').forEach(d => d.open = true); return true; })()`);
    ok('A2b: the amounts table has 6 level rows x 7 items (+ Spirit Ore), the standard amounts in grey', await ev(`document.querySelectorAll('#psBody .ps-amtband').length === 6 && document.querySelectorAll('#psBody [data-psin^="supplies.amt."]').length === 42 && document.querySelector('#psBody [data-psin="supplies.amt.76.soulshots"]').placeholder !== ''`));
    await click('#psBody [data-psact="amtSuggest"]'); await sleep(100);
    ok('A2b: "Fill in suggested amounts" fills the table', await ev(`document.querySelector('#psBody [data-psin="supplies.amt.1.soulshots"]').value === '${SUG[1].soulshots}' && document.querySelector('#psBody [data-psin="supplies.amt.40.mana"]').value === '${SUG[40].mana}'`));
    await ev(`(() => { document.querySelectorAll('#psBody [data-pssec="supplies"] details.ps-more').forEach(d => d.open = true); return true; })()`);
    await setVal('#psBody [data-psin="supplies.amt.1.mana"]', '-3');
    ok('A2b: a negative amount is refused (Save off)', await ev(`/not valid/.test(document.getElementById('psBar').textContent) && document.querySelector('#psBar [data-psact="save"]').disabled`), await barText());
    await setVal('#psBody [data-psin="supplies.amt.1.mana"]', '40');
    await ev(`(() => { const e = document.querySelector('#psBody .ps-amtband'); if (e) e.scrollIntoView({ block: 'start' }); return true; })()`); await sleep(150);
    await shot('07b_iphone_supply_amounts');
    dialogs.length = 0;
    await click('#psBar [data-psact="save"]');
    ok('A2b: saved', await waitFor(`/All saved/.test(document.getElementById('psBar').textContent)`, 60000), await barText());
    const am = (fileA('SWARM_PARTYAUTO_FILE').parties[L] || {}).amounts || {};
    ok(`A2b: party_auto.json parties.${L}.amounts = the suggested table (mana at level 1-19 = 40)`, am['1'] && am['1'].mana === 40 && am['1'].soulshots === SUG[1].soulshots && am['76'] && am['76'].soulshots === SUG[76].soulshots && !(fileA('SWARM_PARTYAUTO_FILE').default || {}).amounts, JSON.stringify(am).slice(0, 300));
    ok('A2b: the confirmation names the supply amounts', dialogs.some(d => d.type === 'confirm' && /Supply amounts [(]party/.test(d.msg)), dialogs.map(d => d.msg).join(' | ').slice(0, 300));
    await openSec('supplies'); await sleep(100);
    await ev(`(() => { document.querySelectorAll('#psBody [data-pssec="supplies"] details.ps-more').forEach(d => d.open = true); return true; })()`);
    await click('#psBody [data-psact="amtClear"]'); await sleep(100);
    await click('#psBar [data-psact="save"]');
    ok('A2b: "Clear" + Save removes the party amounts (back to the standard ones)', await waitFor(`/All saved/.test(document.getElementById('psBar').textContent)`, 60000) && !(fileA('SWARM_PARTYAUTO_FILE').parties[L] || {}).amounts, JSON.stringify(fileA('SWARM_PARTYAUTO_FILE').parties[L]));
  }
  // ---- A2c (PSHOP-2026-10-15, "Shots step 2"): buy B / A / S shots from player shops — off by default, max prices, money limits, save, remove
  { await openSec('supplies'); await sleep(100);
    await ev(`(() => { document.querySelectorAll('#psBody [data-pssec="supplies"] details.ps-more').forEach(d => d.open = true); return true; })()`);
    ok('A2c: the player-shop block shows OFF with 3 kinds x 3 grades of max prices + money limits', await ev(`!!document.querySelector('#psBody [data-psw="supplies.pshop.on"][data-eff="0"]') && document.querySelectorAll('#psBody [data-psin^="supplies.pshop.max."]').length === 9 && !!document.querySelector('#psBody [data-psin="supplies.pshop.budget"]') && !!document.querySelector('#psBody [data-psin="supplies.pshop.keep"]') && !!document.querySelector('#psBody [data-pschk="supplies.pshop.scan"]')`));
    await click('#psBody [data-psw="supplies.pshop.on"]'); await sleep(100);
    await ev(`(() => { document.querySelectorAll('#psBody [data-pssec="supplies"] details.ps-more').forEach(d => d.open = true); return true; })()`);
    ok('A2c: switched on without a price = a plain warning (nothing would be bought)', await ev(`/no max price is filled in/.test(document.querySelector('#psBody [data-pshop]').textContent)`));
    await setVal('#psBody [data-psin="supplies.pshop.max.soulshot.B"]', 'abc');
    ok('A2c: a bad price is refused (Save off)', await ev(`/not valid/.test(document.getElementById('psBar').textContent) && document.querySelector('#psBar [data-psact="save"]').disabled`), await barText());
    await setVal('#psBody [data-psin="supplies.pshop.max.soulshot.B"]', '12');
    await setVal('#psBody [data-psin="supplies.pshop.max.blessed.S"]', '1,500');
    await setVal('#psBody [data-psin="supplies.pshop.budget"]', '2m');
    await ev(`(() => { const e = document.querySelector('#psBody [data-pshop]'); if (e) e.scrollIntoView({ block: 'start' }); return true; })()`); await sleep(150);
    await shot('07c_iphone_pshop_shots');
    dialogs.length = 0;
    await click('#psBar [data-psact="save"]');
    ok('A2c: saved', await waitFor(`/All saved/.test(document.getElementById('psBar').textContent)`, 60000), await barText());
    const ps = (fileA('SWARM_PARTYAUTO_FILE').parties[L] || {}).pshop || {};
    ok(`A2c: party_auto.json parties.${L}.pshop = on, soulshot B 12, blessed S 1500, budget 2,000,000`, ps.on === true && ps.max && ps.max.soulshot && ps.max.soulshot.B === 12 && ps.max.blessed && ps.max.blessed.S === 1500 && ps.budget === 2000000 && !ps.keep, JSON.stringify(ps));
    ok('A2c: the confirmation names the player shops in plain words', dialogs.some(d => d.type === 'confirm' && /Buy shots from player shops [(]party/.test(d.msg) && /1,500/.test(d.msg)), dialogs.map(d => d.msg).join(' | ').slice(0, 300));
    await openSec('supplies'); await sleep(100);
    await ev(`(() => { document.querySelectorAll('#psBody [data-pssec="supplies"] details.ps-more').forEach(d => d.open = true); return true; })()`);
    ok('A2c: reopened: switch on + prices with thousands separators', await ev(`!!document.querySelector('#psBody [data-psw="supplies.pshop.on"][data-eff="1"]') && document.querySelector('#psBody [data-psin="supplies.pshop.max.blessed.S"]').value === '1,500' && document.querySelector('#psBody [data-psin="supplies.pshop.budget"]').value === '2,000,000'`));
    await click('#psBody [data-psw="supplies.pshop.on"]'); await sleep(100);
    await ev(`(() => { document.querySelectorAll('#psBody [data-pssec="supplies"] details.ps-more').forEach(d => d.open = true); return true; })()`);
    for (const p of ['max.soulshot.B', 'max.blessed.S', 'budget']) await setVal(`#psBody [data-psin="supplies.pshop.${p}"]`, '');
    await click('#psBar [data-psact="save"]');
    ok('A2c: off + empty boxes + Save removes the party table (back to OFF)', await waitFor(`/All saved/.test(document.getElementById('psBar').textContent)`, 60000) && !(fileA('SWARM_PARTYAUTO_FILE').parties[L] || {}).pshop, JSON.stringify(fileA('SWARM_PARTYAUTO_FILE').parties[L]));
  }

  // ---- A3 (RESURRECTION 2026-10-13): the Resurrection section — the file's values (missing = automatic ON), one save writes only parties.<L>
  const rs0 = fileA('SWARM_RESRULES_FILE') || {}, rsP = ((rs0.parties || {})[L]) || {}, rsDef = Object.assign({ auto: true, scrolls: true, raidHealerScrolls: true, raidAllScrolls: false }, rs0.default || {});
  const rsEff = (k) => (typeof rsP[k] === 'boolean' ? rsP[k] : rsDef[k]);
  await openSec('res'); await sleep(150);
  ok('A3: Resurrection shows the file / the defaults (automatic ON = survival, healer scrolls in raids ON)', (await swState('res.auto')) === String(rsEff('auto')) && (await swState('res.scrolls')) === String(rsEff('scrolls')) && (await swState('res.raidHealerScrolls')) === String(rsEff('raidHealerScrolls')) && (await swState('res.raidAllScrolls')) === String(rsEff('raidAllScrolls')), JSON.stringify(rsP));
  ok('A3: Resurrection says your orders always work + has Res all dead now', await ev(`(() => { const t = document.querySelector('#psBody [data-pssec="res"]').textContent; return /Your orders always work/.test(t) && /Res all dead now/.test(t); })()`));
  await shot('09_iphone_resurrection');
  await click('#psBody [data-psw="res.raidAllScrolls"]');
  await click('#psBody [data-psseg="res.scrollWho"][data-v="names"]');
  const resPick = M.find(n => n !== L) || L;
  ok('A3: "Only chosen" shows the members as chips', await waitFor(`!!document.querySelector('#psBody [data-psresname="${resPick}"]')`, 3000));
  await click(`#psBody [data-psresname="${resPick}"]`);
  await setVal('#psBody select[data-pssel="res.maxWalk"]', '10000');
  dialogs.length = 0;
  await click('#psBar [data-psact="save"]');
  ok('A3: saved', await waitFor(`/All saved/.test(document.getElementById('psBar').textContent)`, 60000), await barText());
  ok('A3: the confirmation lists the Resurrection changes', dialogs.some(d => d.type === 'confirm' && /In raids: scroll anyone/.test(d.msg) && /Who may read scrolls: Only chosen/.test(d.msg) && /walks at most: 10,000/.test(d.msg)), dialogs.map(d => d.msg).join(' | ').slice(0, 400));
  const rs1 = fileA('SWARM_RESRULES_FILE');
  const rsWant = Object.assign({}, rsP, { raidAllScrolls: !rsEff('raidAllScrolls'), scrollWho: 'names', scrollNames: [resPick], maxWalk: 10000 });
  ok(`A3: res_rules.json: only parties.${L} changed`, rs1 && JSON.stringify(rs1.parties[L]) === JSON.stringify(rsWant) && Object.keys(rs1.parties).filter(k => k !== L).every(k => JSON.stringify(rs1.parties[k]) === JSON.stringify((rs0.parties || {})[k])) && JSON.stringify(rs1.default || {}) === JSON.stringify(rs0.default || {}), JSON.stringify(rs1 && rs1.parties));
  ok('A3: the summary follows (Automatic ...)', await ev(`/Automatic/.test(document.querySelector('#psBody [data-pssec="res"] .ps-sum').textContent)`));

  // ---- Undo
  await openSec('fight'); await click('#psBody [data-psseg="tactics.mode"][data-v="off"]');
  ok('A: a change shows "Unsaved changes"', /Unsaved changes/.test(await barText()));
  await click('#psBar [data-psact="undo"]');
  ok('A: Undo puts it back, nothing written', await waitFor(`/All saved/.test(document.getElementById('psBar').textContent)`, 3000) && fileA('SWARM_TACTICS_FILE')[L].mode === tNew);

  // ---- conflict: another page changes the same party meanwhile
  await click('#psBody [data-psseg="tactics.mode"][data-v="off"]');
  const tf = fileA('SWARM_TACTICS_FILE'); tf[L] = Object.assign({}, tf[L], { maxPairs: 5 }); fs.writeFileSync(A.SWARM_TACTICS_FILE, JSON.stringify(tf, null, 1));
  dialogs.length = 0;
  await click('#psBar [data-psact="save"]');
  ok('A: the change made meanwhile is detected ("Changed meanwhile", Overwrite / Reload)', await waitFor(`/All saved/.test(document.getElementById('psBar').textContent)`, 60000) && dialogs.some(d => d.type === 'choice' && /Changed meanwhile/.test(d.title) && d.buttons.includes('Overwrite')), dialogs.map(d => d.type + ':' + d.title).join(' | '));
  ok('A: Reload kept the other change (maxPairs 5) and did not overwrite it', fileA('SWARM_TACTICS_FILE')[L].maxPairs === 5 && fileA('SWARM_TACTICS_FILE')[L].mode === tNew);

  // ---- close, character page button
  await click('#psOv [data-psact="close"]');
  ok('A: ✕ closes the popup', await waitFor(`document.getElementById('psOv').hidden`, 3000));
  const member = M.find(n => n !== L) || L;
  await cdp('Page.navigate', { url: BASE + '#/char/' + encodeURIComponent(member) });
  ok(`A: the character page (${member}) has "⚙ Party settings"`, await waitFor(`!!document.querySelector('#cpHead [data-psopen="${L}"]') && /Party settings/.test(document.querySelector('#cpHead [data-psopen="${L}"]').textContent)`, 20000));
  await click(`#cpHead [data-psopen="${L}"]`);
  ok('A: it opens the popup of its party', await waitFor(`!document.getElementById('psOv').hidden && window.PartySettings._state.leader === ${JSON.stringify(L)} && !!window.PartySettings._state.W`, 15000));
  await openSec('storage'); await sleep(200); await shot('04_iphone_storage');
  await click('#psOv [data-psact="close"]');
  // ---- desktop + Advanced
  await desktop(); await UID.set(ev, true); await ev(`localStorage.setItem('swarm.uimode', 'advanced')`);
  await cdp('Page.navigate', { url: BASE + '#/parties' });
  await waitFor(`document.querySelectorAll('#tab-parties [data-psopen]').length > 0`, 25000);
  await ev(`window.UIKit && UIKit.setMode('advanced'), true`);   // the dialog test hook starts every page in Simple
  await click(`#tab-parties [data-psopen="${L}"]`);
  await waitFor(`!!window.PartySettings._state.W`, 15000); await openSec('money'); await sleep(200);
  ok('A: desktop: a centred card, Advanced shows the file names', await ev(`(() => { const r = document.querySelector('.ps-dlg').getBoundingClientRect(); const a = document.querySelector('#psBody [data-pssec="money"] .ps-adv'); return r.width <= 720 && r.left > 100 && !!a && getComputedStyle(a).display !== 'none' && /fund_rules\\.json/.test(a.textContent); })()`));
  await shot('05_desktop_money');
  S.srv.kill();
  const writesA = S.mcp.filter(l => /^MCP (run_account_command|send_game_action|close_account|open_account|manage_)/.test(l));
  ok('A: no game command reached even the mock MCP', !writesA.length, writesA.slice(0, 3).join(' | '));

  // ===================================================================== PHASE B: a fresh install (public defaults)
  const B = {}; fs.mkdirSync(path.join(TMP, 'b'));
  Object.keys(FILES).forEach(k => { B[k] = path.join(TMP, 'b', path.basename(FILES[k])); });
  const rr = JSON.parse(A0.SWARM_ROUTERULES_FILE); rr.parties = {}; rr.defaults = {};
  const seed = {
    SWARM_FUNDRULES_FILE: { on: false, town: 'Giran', everyMin: 30, minGive: 200000, slack: 500000, brokeBelow: 500000, givers: { mode: 'auto', list: [], keepAtLeast: 30000000 }, defaults: { leaderTarget: 8000000, memberTarget: 3000000, clanLeaderTarget: 12000000 }, parties: {}, chars: {} },
    SWARM_STASHRULES_FILE: { defaults: { auto: false }, parties: {}, chars: {} },
    SWARM_TACTICS_FILE: { _defaults: { mode: 'off' } }, SWARM_ROUTERULES_FILE: rr, SWARM_SEVENSIGNS_FILE: { parties: [], chars: [], contributeStones: true },
    SWARM_CLANQUESTS_FILE: { clan: {} }, SWARM_RUNSTATE_FILE: { v: 1, default: false, parties: {}, chars: {} },
  };   // gear_auto.json, daily_enabled.json, clan_auto.json, fund_log.json: missing (= a new install)
  Object.entries(seed).forEach(([k, o]) => fs.writeFileSync(B[k], JSON.stringify(o, null, 1)));
  const B0 = Object.fromEntries(Object.keys(B).map(k => [k, rd(B[k])]));
  S = await startServer(B); BASE = `http://127.0.0.1:${S.port}/`;
  await phone(); await ev(`localStorage.setItem('swarm.uimode', 'simple')`);
  await cdp('Page.navigate', { url: BASE + '#/parties' });
  await waitFor(`document.querySelectorAll('#tab-parties [data-psopen]').length > 0 && !!window.PartySettings`, 25000);
  const OFFS = ['money.on', 'money.receive', 'gear.party', 'storage.party.auto', 'daily.kamaloka', 'ss.enrolled', 'supplies.party.supplyWatch', 'supplies.party.sell', 'supplies.party.dyes', 'loot.on'];   // party_auto.json / loot_rules.json missing = OFF
  for (const who of [L, 'Zzunknownparty']) {
    await ev(`window.PartySettings.open(${JSON.stringify(who)})`);
    await waitFor(`!!window.PartySettings._state.W && window.PartySettings._state.leader === ${JSON.stringify(who)}`, 15000); await sleep(200);
    const st = {}; for (const p of OFFS) st[p] = await swState(p);
    const ci = await swState('clan.invite');   // the clan exists in the game (the bots' clan report): its invite switch must be off
    const run = await ev(`document.querySelector('#psBody [data-pssec="run"] .ps-sum').textContent`);
    const tm = await ev(`(window.PartySettings._state.W.tactics || {}).mode`);
    ok(`B: ${who === L ? 'party ' + L : 'an unknown party'} on a fresh install: every automation OFF`, OFFS.every(p => st[p] === 'false') && (ci === null || ci === 'false') && /Stopped/.test(run) && tm === 'off', JSON.stringify(st) + ' clan=' + ci + ' run=' + run + ' tactics=' + tm);
    ok(`B: ${who === L ? L : 'unknown party'}: the off sentence "nothing happens until you switch it on"`, await ev(`/nothing happens until you switch it on/.test(document.getElementById('psBody').textContent)`));
    ok(`B: ${who === L ? L : 'unknown party'}: nothing to save after opening`, await ev(`/All saved/.test(document.getElementById('psBar').textContent)`));
    ok(`B: ${who === L ? L : 'unknown party'}: givers "like all parties", Supplies summary "Off"`, await ev(`window.PartySettings._state.W.money.pg === 'all' && /Off/.test(document.querySelector('#psBody [data-pssec="supplies"] .ps-sum').textContent)`));
    if (who === L) { await openSec('money'); await sleep(150); await shot('06_iphone_fresh_install'); }
    await click('#psOv [data-psact="close"]'); await waitFor(`document.getElementById('psOv').hidden`, 3000);
  }
  // RESURRECTION 2026-10-13: survival is ON on a fresh install (res_rules.json missing)
  await ev(`window.PartySettings.open(${JSON.stringify(L)})`); await waitFor(`!!window.PartySettings._state.W && !!window.PartySettings._state.W.res`, 15000); await sleep(200);
  ok('B: Resurrection on a fresh install: automatic ON, scrolls ON, healer scrolls in raids ON, anyone in raids OFF', (await swState('res.auto')) === 'true' && (await swState('res.scrolls')) === 'true' && (await swState('res.raidHealerScrolls')) === 'true' && (await swState('res.raidAllScrolls')) === 'false');
  await click('#psOv [data-psact="close"]'); await waitFor(`document.getElementById('psOv').hidden`, 3000);
  ok('B: opening wrote nothing (no file created or changed)', Object.keys(B).every(k => rd(B[k]) === B0[k]));
  // HIVESW-2026-10-15: Combat section — fresh install = Hive does skills / heals / potions (ON); switching the party's skills OFF + one member's
  // heals to "My L2Swarm profile" together with a Supplies change writes exactly those keys (two sections, one file: the 2nd re-reads the rev)
  {
    await ev(`window.PartySettings.open(${JSON.stringify(L)})`); await waitFor(`!!window.PartySettings._state.W && !!window.PartySettings._state.W.combat`, 15000); await sleep(200);
    await openSec('combat'); await sleep(150);
    ok('B: Combat on a fresh install: Hive picks skills, heals, uses potions (all ON)', (await swState('combat.party.skills')) === 'true' && (await swState('combat.party.heals')) === 'true' && (await swState('combat.party.potions')) === 'true');
    ok('B: Combat is its own section (the three are not in Supplies)', await ev(`!document.querySelector('#psBody [data-pssec="supplies"] [data-psw^="supplies.party.skills"]') && !!document.querySelector('#psBody [data-pssec="combat"]')`));
    await click('#psBody [data-psw="combat.party.skills"]');
    const mC = M.find(n => n !== L) || L;
    await ev(`(() => { const d = document.querySelector('#psBody [data-pssec="combat"] details.ps-more'); if (d) d.open = true; return true; })()`);
    await setVal(`#psBody select[data-pssel="combat.chars.${mC}.heals"]`, 'off');
    await ev(`document.querySelector('#psBody [data-pssec="combat"]').scrollIntoView()`); await sleep(150); await shot('10_iphone_combat');
    await openSec('supplies'); await click('#psBody [data-psw="supplies.party.dyes"]');
    dialogs.length = 0;
    await click('#psBar [data-psact="save"]');
    ok('B: Combat + Supplies saved', await waitFor(`/All saved/.test(document.getElementById('psBar').textContent)`, 60000), await barText());
    ok('B: the confirmation names the Combat change in plain words', dialogs.some(d => d.type === 'confirm' && /Hive picks my skills \(party/.test(d.msg) && /your L2Swarm profile/.test(d.msg)), dialogs.map(d => d.msg).join(' | ').slice(0, 400));
    let pc = null; try { pc = JSON.parse(rd(B.SWARM_PARTYAUTO_FILE)); } catch (e) { }
    ok('B: party_auto.json: parties.' + L + '.skills false + dyes true, chars.' + mC + '.heals false, nothing else', !!pc && pc.parties[L].skills === false && pc.parties[L].dyes === true && Object.keys(pc.parties[L]).sort().join() === 'dyes,skills'
      && pc.chars[mC] && pc.chars[mC].heals === false && Object.keys(pc.chars).join() === mC, JSON.stringify(pc && { p: pc.parties, c: pc.chars }));
    await click('#psOv [data-psact="close"]'); await waitFor(`document.getElementById('psOv').hidden`, 3000);
  }
  S.srv.kill();
  const writesB = S.mcp.filter(l => /^MCP (run_account_command|send_game_action|close_account|open_account|manage_)/.test(l));
  ok('B: no game command reached even the mock MCP', !writesB.length);

  // ===================================================================== global checks
  ok('no browser alert / confirm / prompt was used', !browserDialogs.length, browserDialogs.join(','));
  ok('no script errors in the page', !errors.length, errors.slice(0, 3).join(' | '));
  ok('the live settings files were not changed', Object.entries(LIVE0).every(([f, t]) => rd(f) === t), Object.entries(LIVE0).filter(([f, t]) => rd(f) !== t).map(([f]) => path.basename(f)).join(', '));
  // clanauto_api.js copies the (scratch) clan file into Settings/backup before writing: remove the copies this test made
  try { fs.readdirSync(backupDir).filter(n => !bk0.has(n) && /^clan_quests_\d+_/.test(n)).forEach(n => fs.unlinkSync(path.join(backupDir, n))); } catch (e) { }
  const fails = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - fails} passed, ${fails} failed — screenshots in ${OUT}`);
  try { sock.close(); } catch (e) { } br.kill();
  try { fs.rmSync(prof, { recursive: true, force: true }); fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { }
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
