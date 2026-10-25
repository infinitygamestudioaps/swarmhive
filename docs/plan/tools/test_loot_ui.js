// LOOT RULES (2026-10-13, Dashboard/partysettings.js section "Loot" + the Storage page line): headless browser check (Edge via CDP) against the SANDBOX
// server (cmdcenter_testserver.js: mocked MCP, nothing reaches the game). Every settings file is a SCRATCH copy (env overrides); the live files are
// compared before / after. Every uidialog question answers itself (uidialog_testhook).
//   Phase A — the owner's values (scratch copy of Scripts/data/loot_rules.json): the Loot section shows the rule in plain words ("valuable gear stays"),
//             the examples (Sealed Moirai Helmet stays, a material goes); ticking grade A + a never-list entry (Enter) + Save writes exactly those keys
//             of exactly that party ("note" stays); a change made meanwhile is detected; the Storage page line "⚙ Loot settings" opens the popup at
//             Loot; iPhone 390x844 without horizontal scroll + screenshots.
//   Phase B — a fresh install (no loot_rules.json): Off ("everyone keeps what it finds"), every example stays; opening writes nothing; switching on +
//             "Only non-gear" + Save creates the file with only that party.
//   node docs/plan/tools/test_loot_ui.js [screenshot dir]     (default: %TEMP%\loot_ui_shots)
'use strict';
const path = require('path'), fs = require('fs'), cp = require('child_process'), os = require('os');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const OUT = process.argv[2] || path.join(os.tmpdir(), 'loot_ui_shots');
const EDGE = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'].find(f => fs.existsSync(f));   // NEVER Microsoft Edge (owner 2026-10-24): Chrome only
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const results = []; const ok = (name, cond, info) => { results.push({ name, ok: !!cond }); console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${info ? ' — ' + info : ''}`); };
const DATA = path.join(ROOT, 'Scripts', 'data'), LOGS = path.join(ROOT, 'Logs');
const FILES = {
  SWARM_FUNDRULES_FILE: path.join(DATA, 'fund_rules.json'), SWARM_GEARAUTO_FILE: path.join(DATA, 'gear_auto.json'), SWARM_STASHRULES_FILE: path.join(DATA, 'stash_rules.json'),
  SWARM_TACTICS_FILE: path.join(DATA, 'party_tactics.json'), SWARM_ROUTERULES_FILE: path.join(DATA, 'route_rules.json'), SWARM_SEVENSIGNS_FILE: path.join(DATA, 'seven_signs.json'),
  SWARM_CLANQUESTS_FILE: path.join(DATA, 'clan_quests.json'), SWARM_RUNSTATE_FILE: path.join(DATA, 'run_state.json'), SWARM_DAILY_FILE: path.join(LOGS, 'daily_enabled.json'),
  SWARM_CLANAUTO_FILE: path.join(LOGS, 'clan_auto.json'), SWARM_FUNDLOG_FILE: path.join(LOGS, 'fund_log.json'), SWARM_PARTYAUTO_FILE: path.join(DATA, 'party_auto.json'),
  SWARM_RESRULES_FILE: path.join(DATA, 'res_rules.json'), SWARM_LOOTRULES_FILE: path.join(DATA, 'loot_rules.json'),
};
const rd = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch (e) { return null; } };
const LIVE0 = Object.fromEntries(Object.values(FILES).map(f => [f, rd(f)]));

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
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'lootui-'));
  const A = {}; fs.mkdirSync(path.join(TMP, 'a'));
  Object.entries(FILES).forEach(([k, f]) => { const p = path.join(TMP, 'a', path.basename(f)); const t = rd(f); if (t != null) fs.writeFileSync(p, t); A[k] = p; });
  const fileA = (k) => { const t = rd(A[k]); return t == null ? null : JSON.parse(t.replace(/^\uFEFF/, '')); };
  const A0 = Object.fromEntries(Object.keys(A).map(k => [k, rd(A[k])]));

  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'loot-edge-'));
  const DBG = 9800 + Math.floor(Math.random() * 150);
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
  const shot = async (name) => { const r = await cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, `loot_${name}.png`), Buffer.from(r.data, 'base64')); };
  const browserDialogs = [], dialogs = [], errors = [];
  handlers.push((m) => {
    if (m.method === 'Page.javascriptDialogOpening') { browserDialogs.push(m.params.type); cdp('Page.handleJavaScriptDialog', { accept: true }).catch(() => { }); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception ? m.params.exceptionDetails.exception.description : m.params.exceptionDetails.text);
  });
  await cdp('Page.enable'); await cdp('Runtime.enable');
  await require('./uidialog_testhook')(cdp, handlers, { answer: true, uiMode: 'simple', onDialog: (d) => dialogs.push(d) });
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }); await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  const click = (sel) => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; e.click(); return true; })()`);
  const openSec = (k) => ev(`(() => { const d = document.querySelector('#psBody details[data-pssec="${k}"]'); if (!d) return false; d.open = true; d.scrollIntoView(); return true; })()`);
  const secText = (k) => ev(`(() => { const d = document.querySelector('#psBody details[data-pssec="${k}"]'); return d ? d.textContent.replace(/\\s+/g, ' ') : ''; })()`);
  const sumText = (k) => ev(`(() => { const d = document.querySelector('#psBody details[data-pssec="${k}"] .ps-sum'); return d ? d.textContent : ''; })()`);
  const swState = (p) => ev(`(() => { const e = document.querySelector('#psBody [data-psw="${p}"]'); return e ? e.getAttribute('aria-checked') : null; })()`);
  const barText = () => ev(`document.getElementById('psBar').textContent`);
  const noScroll = () => ev(`document.documentElement.scrollWidth <= innerWidth + 1 && (() => { const s = document.getElementById('psScroll'); return !s || s.scrollWidth <= s.clientWidth + 1; })()`);
  const exRow = (name) => ev(`(() => { const r = [...document.querySelectorAll('#psBody [data-pssec="loot"] .ps-lootrow')].find(x => x.textContent.includes(${JSON.stringify(name)})); return r ? (r.classList.contains('give') ? 'give' : 'keep') : null; })()`);
  const typeIn = (sel, v) => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; e.focus(); e.value = ${JSON.stringify(v)}; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return true; })()`);

  // ===================================================================== PHASE A: the owner's values
  let S = await startServer(A), BASE = `http://127.0.0.1:${S.port}/`;
  await cdp('Page.navigate', { url: BASE + '#/parties' });
  ok('A: party cards have ⚙ Settings', await waitFor(`document.querySelectorAll('#tab-parties [data-psopen]').length > 0 && !!window.PartySettings && !!window.LootLogic`, 25000));
  const lr0 = fileA('SWARM_LOOTRULES_FILE') || { parties: {} };
  const L = await ev(`(() => { const b = [...document.querySelectorAll('#tab-parties [data-psopen]')].map(x => x.dataset.psopen); const want = ${JSON.stringify(Object.keys(lr0.parties || {}))}; return want.find(n => b.includes(n)) || b[0]; })()`);
  const hasRule = !!(lr0.parties || {})[L];
  await ev(`window.PartySettings.open(${JSON.stringify(L)})`);
  ok(`A: the popup of party ${L} has a Loot section`, await waitFor(`!!window.PartySettings._state.W && !!document.querySelector('#psBody details[data-pssec="loot"]')`, 20000));
  await openSec('loot'); await sleep(200);
  const W0 = await ev('JSON.stringify(window.PartySettings._state.W.loot)').then(JSON.parse);
  if (hasRule) {
    const R = lr0.parties[L];
    ok('A: Loot shows the file (on, mode, grades)', W0.on === (R.on !== false) && W0.mode === (R.mode || 'all') && JSON.stringify(W0.keepGrades) === JSON.stringify(R.keepGrades || ['S', 'S80', 'S84']), JSON.stringify(W0));
    ok('A: the summary says it in plain words', R.mode === 'grade' ? /valuable gear stays with the finder/.test(await sumText('loot')) : (await sumText('loot')).length > 5, await sumText('loot'));
    if (R.mode === 'grade' && (R.keepGrades || []).includes('S80')) {
      ok('A: example — the Sealed Moirai Helmet stays with the finder, a material goes', (await exRow('Sealed Moirai Helmet')) === 'keep' && (await exRow('Stem')) === 'give');
      ok('A: the switch sentence: "Everything goes to … except S-grade gear"', /Everything goes to \S+, except S-grade gear/.test(await secText('loot')), (await secText('loot')).slice(0, 200));
    }
  } else ok('A: (no owner rule for this party) Loot shows Off', W0.on === false && /^Off/.test(await sumText('loot')));
  ok('A: "Your own hand-overs always work" + Trade page link', /Your own hand-overs always work/.test(await secText('loot')) && await ev(`!!document.querySelector('#psBody [data-pssec="loot"] [data-psgo="#/trade"]')`));
  ok('A: Simple view hides the file name', await ev(`(() => { const a = document.querySelector('#psBody [data-pssec="loot"] .ps-adv'); return !!a && getComputedStyle(a).display === 'none'; })()`));
  ok('A: iPhone width: no horizontal scroll', await noScroll());
  await shot('01_iphone_loot');
  ok('A: opening wrote nothing', Object.keys(A).every(k => rd(A[k]) === A0[k]));
  // ---- edit: on (if off) + grade mode + tick A + never "Moirai" (Enter)
  if (!W0.on) await click('#psBody [data-psw="loot.on"]');
  await click('#psBody [data-psseg="loot.mode"][data-v="grade"]');
  const hadA = W0.mode === 'grade' && W0.keepGrades.includes('A');
  await click('#psBody [data-pslootgrade="A"]');
  ok('A: ticking grade A changes the example (Dark Crystal Breastplate stays / goes)', (await exRow('Dark Crystal Breastplate')) === (hadA ? 'give' : 'keep'));
  await ev(`(() => { const d = document.querySelector('#psBody [data-pssec="loot"] details.ps-more'); if (d) d.open = true; return true; })()`);
  await typeIn('#psBody [data-pslootin="never"]', 'Moirai, 6372');
  ok('A: "Moirai, 6372" + Enter adds two never-list chips', await waitFor(`(() => { const t = [...document.querySelectorAll('#psBody [data-pslootlist="never"] .ps-lootchip')].map(x => x.textContent); return t.some(x => /Moirai/.test(x)) && t.some(x => /6372/.test(x)); })()`, 3000));
  await click('#psBody [data-pslootdel="never|1"]');
  ok('A: ✕ removes a chip', await waitFor(`document.querySelectorAll('#psBody [data-pslootlist="never"] .ps-lootchip').length === ${(W0.never || []).length + 1}`, 3000));
  await shot('02_iphone_loot_edit');
  ok('A: the bar says Loot is unsaved', /Unsaved changes.*Loot/.test(await barText()), await barText());
  dialogs.length = 0;
  await click('#psBar [data-psact="save"]');
  ok('A: saved', await waitFor(`/All saved/.test(document.getElementById('psBar').textContent)`, 60000), await barText());
  ok('A: the confirmation says the rule in plain words + the never list', dialogs.some(d => d.type === 'confirm' && /Loot of party/.test(d.msg) && /Never give: .*Moirai/.test(d.msg)), dialogs.map(d => d.msg).join(' | ').slice(0, 400));
  const lr1 = fileA('SWARM_LOOTRULES_FILE');
  const want = Object.assign({}, (lr0.parties || {})[L] || {}, { mode: 'grade', keepGrades: ['NONE', 'D', 'C', 'B', 'A', 'S', 'S80', 'S84'].filter(g => (hadA ? (W0.keepGrades || []).filter(x => x !== 'A') : (W0.keepGrades || []).concat('A')).includes(g)), never: (W0.never || []).concat('Moirai') });
  if (!W0.on) Object.assign(want, { on: true });
  const strip = (o) => { const c = Object.assign({}, o); return JSON.stringify(Object.keys(c).sort().reduce((a, k) => (a[k] = c[k], a), {})); };
  const gotP = lr1 && lr1.parties && lr1.parties[L];
  ok(`A: loot_rules.json: only parties.${L} changed (grade A ${hadA ? 'off' : 'on'}, never Moirai)${hasRule && lr0.parties[L].note ? ', "note" kept' : ''}`, gotP && gotP.mode === 'grade' && JSON.stringify(gotP.keepGrades) === JSON.stringify(want.keepGrades) && JSON.stringify(gotP.never) === JSON.stringify(want.never)
    && (!hasRule || !lr0.parties[L].note || gotP.note === lr0.parties[L].note) && Object.keys(lr1.parties).filter(k => k !== L).every(k => JSON.stringify(lr1.parties[k]) === JSON.stringify(lr0.parties[k])), JSON.stringify(gotP));
  ok('A: no other settings file was touched', Object.keys(A).filter(k => k !== 'SWARM_LOOTRULES_FILE').every(k => rd(A[k]) === A0[k]));
  // ---- a change made meanwhile is detected
  await openSec('loot'); await click('#psBody [data-psseg="loot.mode"][data-v="nongear"]');
  const m = fileA('SWARM_LOOTRULES_FILE'); m.parties[L] = Object.assign({}, m.parties[L], { adenaAbove: 7000000 }); fs.writeFileSync(A.SWARM_LOOTRULES_FILE, JSON.stringify(m, null, 1));
  dialogs.length = 0;
  await click('#psBar [data-psact="save"]');
  ok('A: a Loot change made meanwhile is detected ("Changed meanwhile" -> Reload keeps it)', await waitFor(`/All saved/.test(document.getElementById('psBar').textContent)`, 60000) && dialogs.some(d => d.type === 'choice' && /Changed meanwhile/.test(d.title) && /Loot/.test(d.msg))
    && fileA('SWARM_LOOTRULES_FILE').parties[L].adenaAbove === 7000000 && fileA('SWARM_LOOTRULES_FILE').parties[L].mode === 'grade', dialogs.map(d => d.type + ':' + d.title).join(' | '));
  await click('#psOv [data-psact="close"]'); await waitFor(`document.getElementById('psOv').hidden`, 3000);
  // ---- the Storage page line
  await cdp('Page.navigate', { url: BASE + '#/storage' });
  ok('A: Storage page: "Loot from hunting" with one line per party', await waitFor(`!!document.querySelector('#stgLoot [data-psopensec="loot"]') && /Loot settings/.test(document.getElementById('stgLoot').textContent)`, 25000));
  ok(`A: Storage page: party ${L}'s line says the rule`, await ev(`(() => { const r = [...document.querySelectorAll('#stgLoot .stg-lootrow')].find(x => x.textContent.includes('Party ${L}')); return !!r && /stays with the finder|goes to|Off/.test(r.textContent); })()`));
  await ev(`(() => { const b = document.querySelector('#stgLoot [data-psopen="${L}"]'); b.scrollIntoView(); return true; })()`); await sleep(200);
  await shot('03_iphone_storage_line');
  await click(`#stgLoot [data-psopen="${L}"]`);
  ok('A: "⚙ Loot settings" opens the popup with the Loot section unfolded', await waitFor(`!document.getElementById('psOv').hidden && window.PartySettings._state.leader === ${JSON.stringify(L)} && !!document.querySelector('#psBody details[data-pssec="loot"][open]')`, 15000));
  ok('A: Storage page on the iPhone: no horizontal scroll', await ev(`document.documentElement.scrollWidth <= innerWidth + 1`));
  await click('#psOv [data-psact="close"]');
  S.srv.kill();
  const writesA = S.mcp.filter(l => /^MCP (run_account_command|send_game_action|close_account|open_account|manage_)/.test(l));
  ok('A: no game command reached even the mock MCP', !writesA.length, writesA.slice(0, 3).join(' | '));

  // ===================================================================== PHASE B: a fresh install (no loot_rules.json)
  const B = Object.assign({}, A, { SWARM_LOOTRULES_FILE: path.join(TMP, 'b_loot_rules.json') });
  S = await startServer(B); BASE = `http://127.0.0.1:${S.port}/`;
  await cdp('Page.navigate', { url: BASE + '#/parties' });
  await waitFor(`document.querySelectorAll('#tab-parties [data-psopen]').length > 0 && !!window.PartySettings`, 25000);
  await ev(`window.PartySettings.open(${JSON.stringify(L)}, 'loot')`);
  ok('B: fresh install: Loot is Off ("everyone keeps what it finds")', await waitFor(`!!window.PartySettings._state.W && !!document.querySelector('#psBody details[data-pssec="loot"][open]')`, 15000) && (await swState('loot.on')) === 'false' && /^Off — everyone keeps what it finds/.test(await sumText('loot')));
  ok('B: every example stays with the finder; nothing to save', await ev(`[...document.querySelectorAll('#psBody [data-pssec="loot"] .ps-lootrow')].length >= 6 && [...document.querySelectorAll('#psBody [data-pssec="loot"] .ps-lootrow')].every(r => r.classList.contains('keep'))`) && /All saved/.test(await barText()));
  ok('B: opening wrote nothing (no loot_rules.json created)', !fs.existsSync(B.SWARM_LOOTRULES_FILE));
  await shot('04_iphone_fresh_off');
  await click('#psBody [data-psw="loot.on"]');
  ok('B: switching on shows the collector (clan leader) and "Everything" with the examples moving', (await swState('loot.on')) === 'true' && await ev(`!!document.querySelector('#psBody [data-pslootto="clanleader"][aria-checked="true"]') && !!document.querySelector('#psBody [data-psseg="loot.mode"][data-v="all"][aria-checked="true"]')`) && (await exRow('Stem')) === 'give');
  await click('#psBody [data-psseg="loot.mode"][data-v="nongear"]');
  ok('B: "Only non-gear": the helmet stays, the Stem goes', (await exRow('Sealed Moirai Helmet')) === 'keep' && (await exRow('Stem')) === 'give');
  await click('#psBody [data-pslootto="name"]');
  ok('B: "A chosen character" without a name blocks Save', await waitFor(`/not valid/.test(document.getElementById('psBar').textContent) && document.querySelector('[data-psact="save"]').disabled`, 3000), await barText());
  await click('#psBody [data-pslootto="clanleader"]');
  await shot('05_iphone_fresh_on');
  dialogs.length = 0;
  await click('#psBar [data-psact="save"]');
  ok('B: saved, with the warning "Loot hand-over switched on"', await waitFor(`/All saved/.test(document.getElementById('psBar').textContent)`, 60000) && dialogs.some(d => d.type === 'confirm' && /Loot hand-over switched on/.test(d.msg)), dialogs.map(d => d.msg).join(' | ').slice(0, 300));
  const lb = (() => { try { return JSON.parse(fs.readFileSync(B.SWARM_LOOTRULES_FILE, 'utf8')); } catch (e) { return null; } })();
  ok(`B: loot_rules.json created with only party ${L} (on, nongear, clan leader)`, lb && Object.keys(lb.parties).length === 1 && lb.parties[L].on === true && lb.parties[L].mode === 'nongear' && lb.parties[L].to === 'clanleader', JSON.stringify(lb && lb.parties));
  S.srv.kill();

  // ===================================================================== global checks
  ok('no browser alert / confirm / prompt was used', !browserDialogs.length, browserDialogs.join(','));
  ok('no script errors in the page', !errors.length, errors.slice(0, 3).join(' | '));
  ok('the live settings files were not changed', Object.entries(LIVE0).every(([f, t]) => rd(f) === t), Object.entries(LIVE0).filter(([f, t]) => rd(f) !== t).map(([f]) => path.basename(f)).join(', '));
  try { const backupDir = path.join(ROOT, 'Settings', 'backup'); fs.readdirSync(backupDir).filter(n => /^clan_quests_\d+_/.test(n) && fs.statSync(path.join(backupDir, n)).mtimeMs > Date.now() - 15 * 60000).forEach(n => fs.unlinkSync(path.join(backupDir, n))); } catch (e) { }
  try { sock.close(); } catch (e) { } try { br.kill(); } catch (e) { }
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { }
  const bad = results.filter(r => !r.ok);
  console.log(`\n${results.length - bad.length}/${results.length} passed${bad.length ? ' — FAILED: ' + bad.map(b => b.name).join(' | ') : ''}; screenshots: ${OUT}`);
  process.exit(bad.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
