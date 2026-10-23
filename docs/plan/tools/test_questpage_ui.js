// QUESTS PAGE: headless browser smoke test (Edge via CDP) against the SANDBOX server (cmdcenter_testserver.js: mocked MCP, nothing reaches the
// game; the real dashboard is never called). The farm file is a SCRATCH file (env SWARM_QUESTFARM_FILE); every uidialog question answers
// itself (uidialog_testhook). Reads the real Logs/swarm_state_*.json + quest data (read-only). iPhone 390x844 + desktop 1366x900.
//   node docs/plan/tools/test_questpage_ui.js [screenshot dir]     (default: %TEMP%\questpage_shots)
'use strict';
const path = require('path'), fs = require('fs'), cp = require('child_process'), os = require('os');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const OUT = process.argv[2] || path.join(os.tmpdir(), 'questpage_shots');
const EDGE = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find(f => fs.existsSync(f));
if (!EDGE) { console.log('no Edge / Chrome — UI test skipped'); process.exit(0); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const results = []; const ok = (name, cond, info) => { results.push({ name, ok: !!cond }); console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${info ? ' — ' + info : ''}`); };

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'qpui-'));
  const FFILE = path.join(TMP, 'quest_farm.json');
  fs.writeFileSync(FFILE, JSON.stringify({ on: false, collector: '', chars: [], tradeAbove: 200000, keep: 20000, override: {}, meta: { generated: '2026-10-12T12:00:00Z' },
    plan: { quests: [{ id: 265, name: 'Bonds of Slavery', levels: [6, 40], adenaRun: 740, adenaHour: 9000, valueHour: 0, runMin: 5, score: 9000, startNpc: { id: 30357, name: 'Kristin', town: 'Dark Elf Village' }, races: ['DARK_ELF'], why: 'test row' }], byLevel: { 10: [265] } } }));
  const LIVE = path.join(ROOT, 'Scripts', 'data', 'quest_farm.json'); const liveSt = () => { try { const s = fs.statSync(LIVE); return s.size + ':' + s.mtimeMs; } catch (e) { return 'absent'; } }; const LIVE0 = liveSt();
  // QUEST LIVE 2026-10-12: a fixture Logs dir for /api/quests/live (env SWARM_QUESTLIVE_LOGS): Questor hunts quest 258, Talker walks to Lector
  const QLOGS = path.join(TMP, 'Logs'); fs.mkdirSync(QLOGS);
  const isoA = (ms) => new Date(Date.now() - ms).toISOString();
  const questor = (have) => ({ name: 'Questor', at: isoA(1000), level: 12, classId: 0, log: [{ at: isoA(600e3), id: 258, msg: 'Bring Wolf Pelts: starting (solo, one-time)' }, { at: isoA(300e3), id: 258, msg: 'talk (start): quest started' }],
    active: { id: 258, name: 'Bring Wolf Pelts', mode: 'solo', repeat: 1, runs: 0, phase: 'hunt', cond: 1, started: true, step: `Wolf/Elder Wolf — Wolf Pelt ${have}/40 · 5 kills`,
      target: { kind: 'area', name: 'Wolf (Human)', x: -89773, y: 239852, z: -3575 }, need: [{ id: 702, n: 40, have }], kills: 5, killsNeed: 0, startedAt: isoA(600e3), phaseAt: isoA(1000), phaseSince: isoA(240e3), fails: 0 } });
  const swQ = () => ({ name: 'Questor', classId: 0, cls: 'Fighter', level: 12, hp: 80, mp: 40, x: -88000, y: 239000, z: -3600, task: 'quest 258 Bring Wolf Pelts: hunt — Wolf', updated: new Date().toISOString(),
    intent: { action: 'attack', detail: 'Wolf (60% HP)', dist: 300, at: isoA(4000) }, combat: true });
  fs.writeFileSync(path.join(QLOGS, 'quest_state_Questor.json'), JSON.stringify(questor(12)));
  fs.writeFileSync(path.join(QLOGS, 'swarm_state_Questor.json'), JSON.stringify(swQ()));
  fs.writeFileSync(path.join(QLOGS, 'quest_state_Talker.json'), JSON.stringify({ name: 'Talker', at: isoA(1000), level: 3, classId: 10, log: [],
    active: { id: 258, name: 'Bring Wolf Pelts', mode: 'party', leader: 'Talker', phase: 'travel', started: false, step: 'to Lector', target: { kind: 'npc', name: 'Lector' }, startedAt: isoA(60e3), phaseAt: isoA(1000), repeat: 1, runs: 0 } }));
  fs.writeFileSync(path.join(QLOGS, 'swarm_state_Talker.json'), JSON.stringify({ name: 'Talker', classId: 10, level: 3, x: -80000, y: 240000, z: -3600, updated: new Date().toISOString(), intent: { action: 'walk', detail: 'to Lector', to: '-84000,244000,-3700', dist: 5600, at: isoA(30e3) } }));
  fs.writeFileSync(path.join(QLOGS, 'intent_Questor.log'), `${isoA(200e3)} walk: to Wolf (Human) | from 2,2,2 -> -89773,239852,-3575 (2400 away) | task: quest 258\r\n${isoA(10e3)} attack: Wolf (60% HP) | from 3,3,3 | task: quest 258\r\n`);
  const srv = cp.spawn(process.execPath, [path.join(__dirname, 'cmdcenter_testserver.js')], { stdio: ['ignore', 'pipe', 'pipe'], env: Object.assign({}, process.env, { SWARM_QUESTFARM_FILE: FFILE, SWARM_QUESTLIVE_LOGS: QLOGS }) });
  let PORT = 0; const mcpLog = [];
  srv.stdout.on('data', d => String(d).split('\n').forEach(l => { const m = l.match(/^PORT (\d+)/); if (m) PORT = +m[1]; else if (l.startsWith('MCP ')) mcpLog.push(l); }));
  srv.stderr.on('data', d => process.stderr.write('[server] ' + d));
  for (let i = 0; i < 100 && !PORT; i++) await sleep(100);
  if (!PORT) throw new Error('sandbox server did not start');
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'qp-edge-'));
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
  const shot = async (name) => { const r = await cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, `questpage_${name}.png`), Buffer.from(r.data, 'base64')); };
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
  const noHScroll = () => ev(`document.documentElement.scrollWidth <= innerWidth + 1`);

  // ===================== iPhone =====================
  await phone();
  await cdp('Page.navigate', { url: BASE + '#/parties' });
  ok('a Quests tab button', await waitFor(`!!document.querySelector('#tabs [data-tab="quests"]') && !!window.QuestPage`, 30000), await ev(`'QuestPage=' + !!window.QuestPage + ' go=' + typeof go`)); await sleep(1500);
  await click('#tabs [data-tab="quests"]');
  ok('#/quests lists 500+ quests (first 120 shown)', await waitFor(`/^#\\/quests$/.test(location.hash) && document.querySelectorAll('#qpList .qp-row').length >= 100`, 45000), await ev(`document.querySelectorAll('#qpList .qp-row').length + ' rows, ' + (document.getElementById('qpCount') || {}).textContent`));
  ok('no horizontal page scroll (iPhone, list)', await noHScroll(), await ev(`document.documentElement.scrollWidth + ' / ' + innerWidth`));
  ok('"Live quests" box on #/quests: Questor + Talker, linked to #/quests/258', await waitFor(`(() => { const b = document.getElementById('qpLiveAll'); return b && !b.hidden && [...b.querySelectorAll('a.ql-row')].filter(a => a.getAttribute('href') === '#/quests/258').length === 2 && /Questor/.test(b.textContent) && /Talker/.test(b.textContent); })()`, 15000),
    await ev(`(document.getElementById('qpLiveAll') || {}).textContent || 'no box'`).then(t => String(t).slice(0, 160)));
  ok('no horizontal page scroll (iPhone, list with the live box)', await noHScroll(), await ev(`document.documentElement.scrollWidth + ' / ' + innerWidth`));
  await shot('01_iphone_list');
  await ev(`(() => { const i = document.getElementById('qpQ'); i.value = 'slavery'; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  ok('search "slavery" -> Bonds of Slavery', await waitFor(`document.querySelectorAll('#qpList .qp-row').length === 1 && /Bonds of Slavery/.test(document.querySelector('#qpList .qp-row').textContent)`, 5000));
  await ev(`(() => { const i = document.getElementById('qpQ'); i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true })); const t = document.getElementById('qpType'); t.value = 'repeatable'; t.dispatchEvent(new Event('change', { bubbles: true })); const a = document.getElementById('qpAdena'); a.checked = true; a.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
  ok('filters repeatable + gives adena', await waitFor(`(() => { const r = document.querySelectorAll('#qpList .qp-row'); return r.length > 10 && [...r].every(x => /repeat/.test(x.querySelector('.qp-b').textContent) && !!x.querySelector('.qp-ad')); })()`, 5000));
  // farm box
  // COMPACT-2026-10-23: Beginner gear + Adena farm are tabs on the list page (were stacked folding boxes)
  ok('three tabs: All quests / Beginner gear / Adena farm; All quests is on', await ev(`document.querySelectorAll('#qpListView [data-qptab]').length === 3 && !!document.querySelector('[data-qptab="list"].on') && !document.getElementById('qpPanelList').hidden && document.getElementById('qpFarmBox').hidden`));
  await click('[data-qptab="bg"]');
  ok('Beginner gear tab: its panel shows, the quest list hides', await waitFor(`!document.getElementById('qpBgBox').hidden && document.getElementById('qpPanelList').hidden && !/loading/.test(document.getElementById('qpBg').textContent)`, 8000));
  await click('[data-qptab="farm"]');
  ok('quest farm box: plan row + character checkboxes', await waitFor(`!!document.querySelector('#qpFarmPlan .qp-prow') && document.querySelectorAll('[data-qpf]').length > 0`, 8000));
  const two = await ev(`[...document.querySelectorAll('[data-qpf]')].slice(0, 2).map(i => i.dataset.qpf)`);
  await ev(`(() => { const L = [...document.querySelectorAll('[data-qpf]')]; L.slice(0, 2).forEach(i => { i.checked = true; }); document.getElementById('qpfOn').checked = true; document.getElementById('qpfAbove').value = 123000; return true; })()`);
  dialogs.length = 0; await click('[data-qp="farmSave"]');
  await waitFor(`/saved/.test((document.getElementById('qpMsg') || {}).textContent || '')`, 6000);
  const ff = JSON.parse(fs.readFileSync(FFILE, 'utf8'));
  ok('farm Save asks with the shared dialog and writes the scratch file (plan kept)', dialogs.length === 1 && ff.on === true && ff.tradeAbove === 123000 && JSON.stringify(ff.chars) === JSON.stringify(two) && ff.plan && ff.plan.quests[0].id === 265, JSON.stringify({ d: dialogs.length, on: ff.on, c: ff.chars }));
  ok('no horizontal page scroll (iPhone, farm box)', await noHScroll());
  await shot('02_iphone_farm');
  await click('[data-qptab="list"]');
  ok('back on the All quests tab: the list again', await waitFor(`!document.getElementById('qpPanelList').hidden && document.querySelectorAll('#qpList .qp-row').length > 10`, 5000));
  ok('phone: level / race / sort / adena fold behind "More filters" (adena set = 1)', await ev(`getComputedStyle(document.getElementById('qpRace').closest('.qp-f')).display === 'none' && document.querySelector('[data-qp="fmore"]').textContent.includes('More filters (1)') && true`), await ev(`document.querySelector('[data-qp="fmore"]').textContent`));
  await click('[data-qp="fmore"]');
  ok('More filters opens them', await ev(`getComputedStyle(document.getElementById('qpRace').closest('.qp-f')).display !== 'none'`));
  // detail
  await cdp('Page.navigate', { url: BASE + '#/quests/258' });
  ok('#/quests/258 detail: steps, rewards, items, monsters, NPCs', await waitFor(`!!document.querySelector('#qpDetail .qp-steps') && /Bring Wolf Pelts/.test(document.querySelector('#qpDetail h2').textContent) && /Wolf Pelt/.test(document.getElementById('qpDetail').textContent)`, 40000));
  ok('quest item badge on Wolf Pelt', await ev(`!!document.querySelector('#qpDetail .qp-it.qi .qp-qi')`));
  ok('map: SVG with map pieces + start NPC', await waitFor(`!!document.querySelector('#qpMap svg image') && !!document.querySelector('#qpMap svg circle')`, 5000));
  ok('characters box with Start buttons', await waitFor(`document.querySelectorAll('#qpChars [data-qp="start"]').length > 0`, 8000));
  ok('no horizontal page scroll (iPhone, detail)', await noHScroll(), await ev(`document.documentElement.scrollWidth + ' / ' + innerWidth`));
  await shot('03_iphone_detail');
  const who = await ev(`document.querySelector('#qpChars [data-qp="start"]').dataset.name`);
  dialogs.length = 0; mcpLog.length = 0;
  await ev(`(() => { const s = document.querySelector('[data-qpin="rep:${who}"]'); if (s) s.value = 3; return true; })()`);
  await click(`#qpChars [data-qp="start"][data-name="${who}"]`);
  await waitFor(`/Sent to/.test((document.getElementById('qpMsg') || {}).textContent || '')`, 8000);
  ok('Start asks with the shared dialog and sends "!quest 258 repeat 3 solo <name>" through /api/command (mock MCP)', dialogs.length === 1 && /Start quest 258/.test(dialogs[0].msg) && mcpLog.some(l => l.includes(`!quest 258 repeat 3 solo ${who}`)), (dialogs[0] || {}).msg ? dialogs[0].msg.slice(0, 120) + ' | ' + mcpLog.slice(0, 2).join(' | ') : 'no dialog');
  // ---- QUEST LIVE on the detail page
  ok('live section on top of #/quests/258: a card for Questor and Talker', await waitFor(`document.querySelectorAll('#qpLive .ql-card').length === 2`, 10000), await ev(`(document.getElementById('qpLive') || {}).textContent || 'none'`).then(t => String(t).slice(0, 160)));
  ok('Questor card: class icon, step 1/2 + step text, Wolf Pelt 12/40 bar, kills, "Now" attack, "Going to" Wolf (Human), quest events', await ev(`(() => { const c = [...document.querySelectorAll('#qpLive .ql-card')].find(x => /Questor/.test(x.textContent)); if (!c) return false; const t = c.textContent;
    return !!c.querySelector('img.cls') && /Step 1/.test(t) && /\\/2/.test(t) && /Wolf Pelt/.test(t) && /12 \\/ 40/.test(t) && /kills/.test(t) && /fighting/.test(t) && /Going to/.test(t) && /Wolf \\(Human\\)/.test(t) && /quest started/.test(t); })()`),
    await ev(`([...document.querySelectorAll('#qpLive .ql-card')].find(x => /Questor/.test(x.textContent)) || {}).textContent`).then(t => String(t || '').replace(/\s+/g, ' ').slice(0, 300)));
  ok('Talker card: "Accept" step, party leader, going to Lector', await ev(`(() => { const c = [...document.querySelectorAll('#qpLive .ql-card')].find(x => /Talker/.test(x.textContent)); return !!c && /Accept/.test(c.textContent) && /party leader/.test(c.textContent) && /Lector/.test(c.textContent); })()`));
  ok('live map: map pieces, character dots, a destination line, focus buttons', await waitFor(`!!document.querySelector('#qlMap svg image') && document.querySelectorAll('#qlMap svg line').length >= 1 && document.querySelectorAll('#qlMapBtns [data-ql="focus"]').length === 3`, 6000));
  await click('#qlMapBtns [data-f="Talker"]');
  ok('map focus button -> Talker highlighted', await waitFor(`!!document.querySelector('#qlMapBtns [data-f="Talker"].on')`, 3000));
  ok('no horizontal page scroll (iPhone, live section)', await noHScroll(), await ev(`document.documentElement.scrollWidth + ' / ' + innerWidth`));
  await ev(`document.getElementById('qpLive').scrollIntoView()`); await sleep(300); await shot('03b_iphone_live');
  fs.writeFileSync(path.join(QLOGS, 'quest_state_Questor.json'), JSON.stringify(questor(13))); fs.writeFileSync(path.join(QLOGS, 'swarm_state_Questor.json'), JSON.stringify(swQ()));
  ok('auto-refresh (3 s): the bar follows the quest_state file (12 -> 13)', await waitFor(`/13 \\/ 40/.test(document.getElementById('qpLive').textContent)`, 9000));
  // hidden page: no refresh; visible again: refresh at once
  await ev(`(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); return true; })()`);
  await sleep(500);
  fs.writeFileSync(path.join(QLOGS, 'quest_state_Questor.json'), JSON.stringify(questor(14)));
  await sleep(5000);
  ok('hidden page: no refresh (still 13)', await ev(`/13 \\/ 40/.test(document.getElementById('qpLive').textContent) && !/14 \\/ 40/.test(document.getElementById('qpLive').textContent)`));
  await ev(`(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); return document.hidden; })()`);
  ok('visible again: refreshed (14)', await waitFor(`/14 \\/ 40/.test(document.getElementById('qpLive').textContent)`, 4000));
  // ===================== desktop =====================
  await desktop();
  await cdp('Page.navigate', { url: BASE + '#/quests/265' });
  ok('desktop: #/quests/265 detail with turn-in reward (per item + bonus)', await waitFor(`/Hand-ins/.test(document.getElementById('qpDetail').textContent) && /per item/.test(document.getElementById('qpDetail').textContent)`, 40000));
  await sleep(500); await shot('04_desktop_detail');
  await click('[data-qp="back"]');
  ok('Back -> the list again', await waitFor(`location.hash === '#/quests' && !document.getElementById('qpListView').hidden`, 5000));
  ok('no browser alert / confirm / prompt was used', !browserDialogs.length, browserDialogs.join(','));
  ok('no script errors in the page', !errors.length, errors.slice(0, 3).join(' | '));
  ok('the live Scripts/data/quest_farm.json was never created or changed', liveSt() === LIVE0);
  const fails = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - fails} passed, ${fails} failed — screenshots in ${OUT}`);
  try { sock.close(); } catch (e) { } br.kill(); srv.kill();
  try { fs.rmSync(prof, { recursive: true, force: true }); fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { }
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
