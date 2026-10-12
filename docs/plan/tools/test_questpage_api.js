// QUESTS PAGE API test (2026-10-12): runs Dashboard/questpage_api.js in node against the REAL quest data (Scripts/data/quests_h5.json,
// quest_items_h5.json, field_areas.json, Dashboard/data/items.json — read-only) with a SANDBOX Logs dir (fake swarm states + quest_state files)
// and a TEMP copy of quest_farm.json (env SWARM_QUESTFARM_FILE). The live Scripts/data/quest_farm.json is never written (checked).
//   node docs/plan/tools/test_questpage_api.js
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'qpapi-'));
const LOGS = path.join(TMP, 'Logs'); fs.mkdirSync(LOGS);
const FARM = path.join(TMP, 'quest_farm.json');
process.env.SWARM_QUESTFARM_FILE = FARM;
const LIVE = path.join(ROOT, 'Scripts', 'data', 'quest_farm.json');
const liveSt = () => { try { const s = fs.statSync(LIVE); return s.size + ':' + s.mtimeMs; } catch (e) { return 'absent'; } };
const LIVE0 = liveSt();
const A = require(path.join(ROOT, 'Dashboard', 'questpage_api.js'));
let pass = 0, fail = 0;
const ok = (name, cond, info) => { if (cond) pass++; else fail++; console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${info && !cond ? ' — ' + info : ''}`); };

// fake characters: a level 10 dark elf mystic (38), a level 58 human bishop (16), a level 20 kamael trooper (125)
const states = [{ name: 'Nuker7', level: 10, classId: 38, ageSec: 3, party: 'Nuker7' }, { name: 'Bishop1', level: 58, classId: 16, ageSec: 3, party: 'Tank1' }, { name: 'Doombringer1', level: 20, classId: 125, ageSec: 400, party: 'Tank1' }];
const now = Date.now();
fs.writeFileSync(path.join(LOGS, 'quest_state_Nuker7.json'), JSON.stringify({ name: 'Nuker7', at: new Date().toISOString(), level: 10, classId: 38,
  active: { id: 265, name: 'Bonds of Slavery', mode: 'solo', leader: 'Nuker7', repeat: 0, runs: 3, phase: 'hunt', cond: 1, step: 'hunt imps', msg: 'Imp Shackles 7/20',
    target: { kind: 'area', name: 'imps', x: 1, y: 2, z: 3 }, need: [{ id: 1368, name: 'Imp Shackles', have: 7, n: 20 }], startedAt: new Date(now - 7200e3).toISOString(), phaseAt: new Date().toISOString(), fails: 0, farm: true },
  quests: { 265: { name: 'Bonds of Slavery', status: 'running', runs: 3, adena: 3000 }, 258: { name: 'Bring Wolf Pelts', status: 'done', runs: 1 } },
  farm: { on: true, quest: 265, since: new Date(now - 2 * 3600e3).toISOString(), adena: 50000, traded: 30000, runs: 3, lastTrade: new Date().toISOString() }, log: [] }));
fs.writeFileSync(path.join(LOGS, 'quest_state_Ghost.json'), '{ broken json');
// a planner file with meta + plan + user fields
const PLAN = { quests: [{ id: 265, name: 'Bonds of Slavery', levels: [6, 40], adenaRun: 740, adenaHour: 9000, runMin: 5, score: 9000 }], byLevel: { 10: [265] } };
fs.writeFileSync(FARM, JSON.stringify({ on: false, collector: '', chars: [], tradeAbove: 200000, keep: 20000, override: {}, meta: { generated: 'x', tool: 'quest_farm_plan.js' }, plan: PLAN }, null, 1));

const ctx = { DIR: path.join(ROOT, 'Dashboard'), DATA: path.join(ROOT, 'Scripts', 'data'), LOGS, ROOT, readStates: () => states.map(s => Object.assign({}, s)),
  allowed: (req) => req.headers['x-key'] === 'k', send: (res, code, type, body) => { res.code = code; res.type = type; res.body = body; },
  json: (res, code, o) => { res.code = code; res.obj = o; }, body: async (req) => req._body || {} };
async function call(method, url, b, key) {
  const u = new URL('http://x' + url), res = {};
  const handled = await A.handle({ method, headers: { 'x-key': key === undefined ? 'k' : key }, _body: b }, res, u, ctx);
  return Object.assign(res, { handled });
}

(async () => {
  console.log('QUESTS PAGE API');
  // ---- static + routing + key
  let r = await call('GET', '/questpage.js', null, '');
  ok('/questpage.js served without a key', r.handled && r.code === 200 && String(r.body).includes('QuestPage'));
  r = await call('GET', '/questpage.css', null, '');
  ok('/questpage.css served', r.code === 200 && /qp-row/.test(String(r.body)));
  r = await call('GET', '/api/other', null);
  ok('other paths are not taken', r.handled === false);
  r = await call('GET', '/api/quests', null, 'bad');
  ok('/api/quests needs the key', r.code === 401);

  // ---- list
  r = await call('GET', '/api/quests');
  const rows = r.obj && r.obj.rows || [];
  ok('list: every quest (500+)', r.code === 200 && r.obj.ok && rows.length >= 500, rows.length);
  const r265 = rows.find(x => x.id === 265);
  ok('list row 265 Bonds of Slavery: repeatable, dark elf only, per-item adena text, turn-in', r265 && r265.type === 'repeatable' && r265.req.races && r265.req.races[0] === 'DARK_ELF' && /12\/item/.test(r265.adena) && r265.turnIn && r265.npc === 'Kristin', JSON.stringify(r265));
  const r2 = rows.find(x => x.id === 2);
  ok('list row 2: one-time, reward icons resolved (Mystic\'s Earring)', r2 && r2.type === 'one-time' && r2.rewards.some(i => i.id === 113 && (i.icon || !fs.existsSync(path.join(ROOT, 'Dashboard', 'data', 'items.json')))), JSON.stringify(r2 && r2.rewards));   // reward icons come from the generated item table (SETUP -Images)
  ok('list rows are sorted by level', rows.every((x, i) => !i || (rows[i - 1].lmin || 0) <= (x.lmin || 0)));
  ok('meta coverage passed through', r.obj.meta && r.obj.meta.coverage && r.obj.meta.coverage.quests >= 500);

  // ---- detail
  r = await call('GET', '/api/quests/detail?id=258');
  const d = r.obj;
  ok('detail 258: ok + the full record', r.code === 200 && d.ok && d.quest.id === 258 && d.quest.steps.length >= 2);
  ok('detail: names for NPCs and monsters', d.names[30001] === 'Lector' && d.names[20120] === 'Wolf', JSON.stringify(d.names));
  ok('detail: item icons + quest item flag (Wolf Pelt 702)', d.icons['702'] && d.icons['702'].questItem === true && /^icon\//.test(d.icons['702'].icon || ''), JSON.stringify(d.icons['702']));
  ok('detail: hunting areas with polygons from field_areas.json', Object.keys(d.areas).length > 0 && Object.values(d.areas).every(a => Array.isArray(a.poly) && a.poly.length > 2 && a.poly.length <= 70), Object.keys(d.areas).join(','));
  const vel = d.chars.find(c => c.name === 'Nuker7'), bis = d.chars.find(c => c.name === 'Bishop1');
  ok('detail chars: Nuker7 (lvl 10) eligible for 258 (lvl 3+), status done x1 from quest_state', vel && vel.elig === 'yes' && vel.status && vel.status.status === 'done', JSON.stringify(vel && { e: vel.elig, w: vel.why, s: vel.status }));
  ok('detail chars: Bishop1 offline flag false (age 3 s), Doombringer1 offline', bis && bis.online === true && d.chars.find(c => c.name === 'Doombringer1').online === false);
  r = await call('GET', '/api/quests/detail?id=265');
  const v265 = r.obj.chars.find(c => c.name === 'Nuker7'), b265 = r.obj.chars.find(c => c.name === 'Bishop1');
  ok('265 (dark elf only): Nuker7 (dark mystic) eligible + active here with need 7/20; Bishop1 (human) not', v265.elig === 'yes' && v265.activeHere && v265.active.need[0].have === 7 && b265.elig === 'no' && /race/.test(b265.why), JSON.stringify({ v: v265.elig, b: b265.why }));
  r = await call('GET', '/api/quests/detail?id=21');
  ok('detail 21 (quest spawns): spawns listed, spawned monster named', r.obj.ok && (r.obj.quest.spawns || []).length > 0 && r.obj.names[31525]);
  r = await call('GET', '/api/quests/detail?id=999999');
  ok('unknown quest -> 404 with an error', r.code === 404 && r.obj.error);

  // ---- eligibility unit checks
  const Q = JSON.parse(fs.readFileSync(path.join(ROOT, 'Scripts', 'data', 'quests_h5.json'), 'utf8')).quests;
  const kam = { name: 'K', level: 20, classId: 125, race: 'KAMAEL', classEnum: 'trooper', qstate: {} };
  const kamOnly = Object.values(Q).find(q => (q.requirements || {}).races && q.requirements.races.length === 1 && q.requirements.races[0] === 'KAMAEL' && (q.level || {}).min <= 20 && !(q.requirements.classes || []).length);
  if (kamOnly) ok(`eligible(): kamael-only quest ${kamOnly.id} fits a kamael trooper, not a human`, A.eligible(kamOnly, kam).ok !== 'no' && A.eligible(kamOnly, { level: 20, classId: 0, race: 'HUMAN', classEnum: 'fighter', qstate: {} }).ok === 'no');
  ok('eligible(): level too low -> no', A.eligible(Q['300'], { level: 10, classId: 0, race: 'HUMAN', classEnum: 'fighter', qstate: {} }).ok === 'no');
  ok('raceOf(): human 16, dark elf 38, orc 46, dwarf 57, kamael 125, elf 30', ['HUMAN', 'DARK_ELF', 'ORC', 'DWARF', 'KAMAEL', 'ELF'].join() === [16, 38, 46, 57, 125, 30].map(A.raceOf).join());

  // ---- chars
  r = await call('GET', '/api/quests/chars');
  const cs = r.obj.chars || [];
  ok('chars: the 3 states + no crash on a broken quest_state file', r.obj.ok && ['Nuker7', 'Bishop1', 'Doombringer1'].every(n => cs.some(c => c.name === n)), cs.map(c => c.name).join(','));
  const cv = cs.find(c => c.name === 'Nuker7');
  ok('chars: Nuker7 race DARK_ELF, active 265 hunt, fits includes 265 and not 300 (lvl 34)', cv.race === 'DARK_ELF' && cv.active && cv.active.phase === 'hunt' && cv.fits.includes(265) && !cv.fits.includes(300));

  // ---- farm GET / POST
  r = await call('GET', '/api/quests/farm');
  ok('farm GET: cfg defaults + the planner plan', r.obj.ok && r.obj.cfg.on === false && r.obj.plan && r.obj.plan.quests[0].id === 265 && r.obj.names.includes('Nuker7'));
  r = await call('POST', '/api/quests/farm', { on: true, collector: 'Bishop1', chars: ['Nuker7', 'Doombringer1'], tradeAbove: 100000, keep: 5000, override: { Nuker7: 265 } });
  const saved = JSON.parse(fs.readFileSync(FARM, 'utf8'));
  ok('farm POST: user fields written', r.code === 200 && saved.on === true && saved.collector === 'Bishop1' && saved.chars.join() === 'Nuker7,Doombringer1' && saved.tradeAbove === 100000 && saved.keep === 5000 && saved.override.Nuker7 === 265, JSON.stringify(r.obj && r.obj.error));
  ok('farm POST: planner meta + plan preserved', saved.meta && saved.meta.tool === 'quest_farm_plan.js' && JSON.stringify(saved.plan) === JSON.stringify(PLAN));
  ok('farm POST: no temp file left behind', !fs.readdirSync(TMP).some(f => /\.tmp/.test(f)));
  const st = (r.obj.stats || []).find(s => s.name === 'Nuker7');
  ok('farm stats: Nuker7 50000 adena in ~2 h -> ~25000/h, 3 runs, 30000 traded', st && Math.abs(st.adenaHour - 25000) < 600 && st.runs === 3 && st.traded === 30000 && st.quest === 265, JSON.stringify(st));
  r = await call('POST', '/api/quests/farm', { chars: ['Nuker7', 'Bishop1'] });
  ok('farm POST: collector cannot also farm -> 400', r.code === 400 && /collector/.test(r.obj.error));
  r = await call('POST', '/api/quests/farm', { chars: ['bad name!'] });
  ok('farm POST: bad names refused', r.code === 400);
  r = await call('POST', '/api/quests/farm', { tradeAbove: -5 });
  ok('farm POST: negative numbers refused', r.code === 400);
  r = await call('POST', '/api/quests/farm', { on: false });
  ok('farm POST: partial update keeps the other fields', r.code === 200 && JSON.parse(fs.readFileSync(FARM, 'utf8')).collector === 'Bishop1' && JSON.parse(fs.readFileSync(FARM, 'utf8')).on === false);
  // no plan file at all
  fs.unlinkSync(FARM);
  r = await call('GET', '/api/quests/farm');
  ok('farm GET without a file: defaults, plan null', r.obj.ok && r.obj.plan === null && r.obj.cfg.tradeAbove === 200000);
  r = await call('POST', '/api/quests/farm', { chars: ['Doombringer1'] });
  ok('farm POST without a file creates it with defaults', r.code === 200 && JSON.parse(fs.readFileSync(FARM, 'utf8')).chars[0] === 'Doombringer1');

  // ---- QUEST LIVE 2026-10-12: GET /api/quests/live[?id=] (Dashboard/questlive_api.js) with fixture files in the sandbox Logs dir
  console.log('QUEST LIVE');
  const QL = require(path.join(ROOT, 'Dashboard', 'questlive_api.js'));
  process.env.SWARM_QUESTLIVE_LOGS = LOGS;                                    // swarm_state_* / quest_state_* / intent_* from the sandbox
  const iso = (msAgo) => new Date(Date.now() - msAgo).toISOString();
  const W = (f, o) => fs.writeFileSync(path.join(LOGS, f), typeof o === 'string' ? o : JSON.stringify(o));
  const qlog = [{ at: iso(900e3), id: 258, msg: 'Bring Wolf Pelts: starting (solo, one-time)' }, { at: iso(800e3), id: 258, msg: 'talk (start): quest started' }, { at: iso(700e3), id: 999, msg: 'other quest line' },
    { at: iso(600e3), id: 258, msg: 'hunt: e1' }, { at: iso(500e3), id: 258, msg: 'hunt: e2' }, { at: iso(400e3), id: 258, msg: 'hunt: e3' }, { at: iso(300e3), id: 258, msg: 'hunt: e4 newest' }];
  W('quest_state_Questor.json', { name: 'Questor', at: iso(2000), level: 12, classId: 0, log: qlog, quests: { 258: { name: 'Bring Wolf Pelts', status: 'running', runs: 0 } },
    active: { id: 258, name: 'Bring Wolf Pelts', mode: 'solo', leader: null, repeat: 1, runs: 0, phase: 'hunt', cond: 1, started: true, step: 'Wolf/Elder Wolf — Wolf Pelt 12/40 · 5 kills',
      target: { kind: 'area', name: 'Wolf (Human)', x: -89773, y: 239852, z: -3575 }, need: [{ id: 702, n: 40, have: 12 }], kills: 5, killsNeed: 10, mobs: [20120, 20442],
      startedAt: iso(900e3), phaseAt: iso(3000), phaseSince: iso(600e3), fails: 1, msg: '', lastMsg: 'hunt: e4 newest', repeatable: false } });
  W('swarm_state_Questor.json', { name: 'Questor', classId: 0, cls: 'Fighter', level: 12, hp: 80, mp: 40, x: -88000, y: 239000, z: -3600, task: 'quest 258 Bring Wolf Pelts: hunt — Wolf', updated: iso(5000),
    intent: { action: 'attack', detail: 'Wolf (60% HP)', to: null, dist: 300, at: iso(4000) }, route: null, combat: true });
  W('quest_state_Finisher.json', { name: 'Finisher', at: iso(3600e3), level: 15, classId: 18, log: [{ at: iso(3600e3), id: 258, msg: 'run ended: done (1 runs)' }],
    quests: { 258: { name: 'Bring Wolf Pelts', status: 'done', runs: 1, lastDone: iso(3600e3) } }, active: { id: 258, name: 'Bring Wolf Pelts', mode: 'solo', phase: 'done', phaseAt: iso(3600e3), runs: 1, startedAt: iso(5000e3) } });
  W('quest_state_Oldie.json', { name: 'Oldie', at: iso(10 * 3600e3), level: 15, classId: 18, quests: { 258: { status: 'done', runs: 1, lastDone: iso(10 * 3600e3) } }, active: { id: 258, name: 'Bring Wolf Pelts', phase: 'done', phaseAt: iso(10 * 3600e3) } });
  W('quest_state_Talker.json', { name: 'Talker', at: iso(1000), level: 3, classId: 10, log: [], active: { id: 258, name: 'Bring Wolf Pelts', mode: 'party', leader: 'Talker', phase: 'travel', started: false, step: 'to Lector', target: { kind: 'npc', name: 'Lector' }, startedAt: iso(60e3), phaseAt: iso(1000), repeat: 1, runs: 0 } });
  W('swarm_state_Talker.json', { name: 'Talker', classId: 10, level: 3, x: -80000, y: 240000, z: -3600, updated: iso(400e3), intent: { action: 'walk', detail: 'to Lector', to: '-84000,244000,-3700', dist: 5600, at: iso(30e3) } });
  // a 300 KB intent log: only the end may be read; the old start line must not show up, the new ones (after startedAt) must
  const oldLine = `${iso(3 * 3600e3)} walk: OLD LINE FROM THE START OF THE FILE | from 0,0,0 | task: -\r\n`;
  W('intent_Questor.log', oldLine + 'x'.repeat(300000) + '\r\n' + `${iso(2000e3)} walk: before the quest started | from 1,1,1 | task: -\r\n` +
    `${iso(400e3)} town: .gludio (Gludio, 9k away) | from 1,1,1 | task: quest 258\r\n${iso(390e3)}   -> town OK | now at 2,2,2\r\n` +
    `${iso(200e3)} walk: to Wolf (Human) | from 2,2,2 -> -89773,239852,-3575 (2400 away) | task: quest 258\r\n${iso(10e3)} attack: Wolf (60% HP) | from 3,3,3 | task: quest 258\r\n`);
  QL._reset();
  r = await call('GET', '/api/quests/live?id=258', null, 'bad');
  ok('live: needs the key', r.code === 401);
  r = await call('GET', '/api/quests/live?id=abc');
  ok('live: bad id -> 400', r.code === 400 && r.obj.error);
  r = await call('GET', '/api/quests/live?id=258');
  const LV = r.obj || {}, qc = (LV.chars || []).find(c => c.name === 'Questor'), fin = (LV.chars || []).find(c => c.name === 'Finisher'), tk = (LV.chars || []).find(c => c.name === 'Talker');
  ok('live 258: Questor + Talker running, Finisher ended (6 h window), Oldie (10 h) left out, Nuker7 (other quest) left out', r.code === 200 && LV.ok && qc && tk && fin && fin.ended && !LV.chars.some(c => c.name === 'Oldie' || c.name === 'Nuker7'), (LV.chars || []).map(c => c.name).join(','));
  ok('live: running ones first, the ended one last', LV.chars[LV.chars.length - 1].name === 'Finisher');
  ok('live: step 1 of 2 + step text from the quest data (collect Wolf Pelt from Wolf … then talk to Lector)', qc.stepNo === 1 && qc.stepTotal === 2 && /Wolf Pelt/.test(qc.stepText) && /Lector/.test(qc.stepText), qc.stepNo + '/' + qc.stepTotal + ' ' + qc.stepText);
  ok('live: item bar Wolf Pelt 12/40 with name + icon from the quest file', qc.need.length === 1 && qc.need[0].name === 'Wolf Pelt' && qc.need[0].have === 12 && qc.need[0].n === 40 && /^icon\//.test(qc.need[0].icon || ''), JSON.stringify(qc.need));
  ok('live: kills 5/10 from the engine fields (patch)', qc.kills && qc.kills.have === 5 && qc.kills.n === 10, JSON.stringify(qc.kills));
  ok('live: online (state 5 s old), position, hp, phase text, fails, mode', qc.online && qc.x === -88000 && qc.hp === 80 && qc.phaseText === 'hunting' && qc.fails === 1 && qc.mode === 'solo');
  ok('live: destination = the hunting area with its distance', qc.dest && qc.dest.kind === 'area' && qc.dest.x === -89773 && Math.abs(qc.dest.dist - Math.round(Math.hypot(1773, 852))) <= 1, JSON.stringify(qc.dest));
  ok('live: doing now = the intent (attack Wolf) + task', qc.doing && qc.doing.action === 'attack' && /Wolf/.test(qc.doing.detail) && /quest 258/.test(qc.doing.task));
  ok('live: last 5 quest events of THIS quest, newest first', qc.events.length === 5 && qc.events[0].msg === 'hunt: e4 newest' && !qc.events.some(e => /other quest/.test(e.msg)), qc.events.map(e => e.msg).join(' | '));
  ok('live: recent moves from the END of a 300 KB intent log, only since the run started, with results', qc.moves.length === 3 && qc.moves[0].action === 'attack' && qc.moves.some(m => m.action === 'town' && m.result === 'OK') && !qc.moves.some(m => /OLD LINE|before the quest/.test(m.detail)), JSON.stringify(qc.moves.map(m => m.action + ':' + m.result)));
  ok('live: Talker (not taken yet) = "accept" step 0, destination = the quest NPC Lector by name -> its spawn, offline (state 400 s old)', tk.stepNo === 0 && tk.dest && tk.dest.kind === 'npc' && /Lector/.test(tk.dest.name) && tk.dest.x != null && tk.online === false && tk.mode === 'party', JSON.stringify({ s: tk.stepNo, d: tk.dest, o: tk.online }));
  ok('live: Finisher ended = done, no destination / doing', fin.status === 'done' && !fin.dest && !fin.doing && fin.endedAt);
  ok('live: quest block with NPC spawns (Lector = start) + hunting clusters', LV.quest && LV.quest.name === 'Bring Wolf Pelts' && LV.quest.npcs.some(n => n.name === 'Lector' && n.start && n.x != null) && LV.quest.hunts.length > 0 && LV.quest.total === 2);
  r = await call('GET', '/api/quests/live');
  const LA = r.obj || {};
  ok('live (all quests): Questor (258), Nuker7 (265), Talker; compact rows (no events / moves)', LA.ok && LA.id === null && ['Questor', 'Nuker7', 'Talker'].every(n => LA.chars.some(c => c.name === n)) && LA.chars.every(c => c.events === undefined && c.moves === undefined) && !LA.chars.some(c => c.name === 'Oldie'), (LA.chars || []).map(c => c.name + ':' + c.quest.id).join(','));
  ok('live (all): Nuker7 265 hunt with its 7/20 bar', (() => { const v = LA.chars.find(c => c.name === 'Nuker7'); return v && v.quest.id === 265 && v.need[0].have === 7 && v.running; })());
  ok('killsOf(): parses "kills 3/10" and "· 7 kills" when the engine has no kill fields', JSON.stringify(QL.killsOf({ step: 'X — kills 3/10' })) === '{"have":3,"n":10}' && JSON.stringify(QL.killsOf({ step: 'Wolf — Pelt 1/40 · 7 kills' })) === '{"have":7,"n":0}' && QL.killsOf({ step: 'to Lector' }) === null);
  delete process.env.SWARM_QUESTLIVE_LOGS;

  ok('the live Scripts/data/quest_farm.json was never written', liveSt() === LIVE0);
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
