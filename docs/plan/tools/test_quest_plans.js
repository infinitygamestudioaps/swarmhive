// TEST QUEST PLANS (QUESTPLAN-2026-10-27, requirement docs/requirements/quests.md). Never touches the game or the live plan folder for writes.
//   node docs/plan/tools/test_quest_plans.js
// 1. format: every quest has Scripts/data/quest_plans/<id>.json with the plan fields; status ready | fixable | not-for-bots; reasons explain every
//    non-ready plan; unique step keys; travel / place per step; quest_status.json + docs/plan/quest_status.md agree with the plans
// 2. overrides are kept when the builder runs again (scratch plan folder SWARM_QUESTPLAN_DIR) and they win (override area / route / npcAt clear the
//    reasons they fix; quest skip = not-for-bots)
// 3. the engine uses the plan: QENGINE-PURE qePlanMatch / qePlanSpot / qePlanRoute against real plans (override > plan), and the host code calls them
//    (qeGoNpc walks the plan route, qeDoHunt hunts at the plan place, qeRun honours skip / manual, the live line reaches quest_state + swarm_state)
// 4. the API (Dashboard/questplan_api.js): validation, locked + atomic save with history, conflict, unknown step; live rows from fixture logs
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
try { os.setPriority(process.pid, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch (e) { }
const ROOT = path.resolve(__dirname, '..', '..', '..'), DATA = path.join(ROOT, 'Scripts', 'data');
const PDIR = path.join(DATA, 'quest_plans'), QDIR = path.join(DATA, 'quests');
let fails = 0, oks = 0;
const ok = (c, m) => { if (c) { oks++; console.log('  ok   ' + m); } else { fails++; console.log('  FAIL ' + m); } };
const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, ''));

// ---------------------------------------------------------------- 1. format
console.log('1. plan format');
const qids = fs.readdirSync(QDIR).filter(f => /^\d+\.json$/.test(f)).map(f => Number(f.slice(0, -5)));
const plans = {}; qids.forEach(id => { try { plans[id] = J(path.join(PDIR, id + '.json')); } catch (e) { } });
ok(Object.keys(plans).length === qids.length, `a plan for every quest (${Object.keys(plans).length}/${qids.length})`);
const ST = new Set(['ready', 'fixable', 'not-for-bots']), KINDS = new Set(['start', 'talk', 'deliver', 'hunt', 'spawn', 'special']);
let bad = [];
Object.values(plans).forEach(p => {
  const e = [];
  ['id', 'name', 'version', 'generated', 'status', 'reasons', 'restrictions', 'steps', 'override', 'expectedMin'].forEach(k => { if (p[k] === undefined) e.push('no ' + k); });
  if (!ST.has(p.status)) e.push('status ' + p.status);
  if (p.status !== 'ready' && !(p.reasons || []).length) e.push('not ready without a reason');
  if (p.status === 'ready' && (p.reasons || []).length) e.push('ready with reasons');
  const keys = new Set();
  (p.steps || []).forEach((s, i) => {
    if (s.i !== i) e.push('step index ' + i); if (!s.key || keys.has(s.key)) e.push('step key ' + s.key); keys.add(s.key);
    if (!KINDS.has(s.kind)) e.push('kind ' + s.kind); if (!Array.isArray(s.reasons)) e.push('step reasons');
    if (p.status === 'ready') { if ((s.kind === 'talk' || s.kind === 'start' || s.kind === 'deliver') && !(s.npc && Array.isArray(s.npc.at) && s.travel)) e.push('ready step ' + s.key + ' without NPC place / travel');
      if (s.kind === 'hunt' && !(s.area && Array.isArray(s.area.at) && s.travel)) e.push('ready hunt ' + s.key + ' without place / travel'); }
    if (s.travel && !/^(atlas|computed|none)$/.test(s.travel.src)) e.push('travel src ' + s.travel.src);
    if (s.travel && s.travel.src === 'computed' && s.travel.status === 'ok' && !(Array.isArray(s.travel.points) && s.travel.points.length && s.travel.start)) e.push('computed route without points / start ' + s.key);
  });
  if (p.status === 'ready' && !(p.steps || []).length) e.push('ready without steps');
  if (e.length) bad.push(p.id + ': ' + e.slice(0, 3).join('; '));
});
ok(!bad.length, 'every plan well formed' + (bad.length ? ' — ' + bad.slice(0, 5).join(' | ') : ''));
const SJ = J(path.join(DATA, 'quest_status.json'));
const cnt = { ready: 0, fixable: 0, 'not-for-bots': 0 }; Object.values(plans).forEach(p => { cnt[p.status]++; });
ok(SJ.counts && SJ.counts.ready === cnt.ready && SJ.counts.fixable === cnt.fixable && SJ.counts['not-for-bots'] === cnt['not-for-bots'], `quest_status.json counts = the plans (${JSON.stringify(cnt)})`);
ok(Object.keys(SJ.quests || {}).length === qids.length, 'quest_status.json lists every quest');
// the report is our planning doc: docs/plan/*.md is not in the public package (the machine-readable quest_status.json is, and is checked above)
{ const md = path.join(ROOT, 'docs', 'plan', 'quest_status.md');
  if (fs.existsSync(md) || fs.existsSync(path.join(ROOT, 'docs', 'plan', 'AUTOMATION_LOG.md'))) ok(fs.existsSync(md) && /\| ready \| \d+ \|/.test(fs.readFileSync(md, 'utf8')), 'docs/plan/quest_status.md written');
  else console.log('skip docs/plan/quest_status.md (not shipped in the package)'); }
ok(plans[717] && plans[717].status === 'not-for-bots' && plans[201] && plans[201].status === 'not-for-bots', 'territory war (717) and tutorial dummy (201) are not for bots');
ok(plans[258] && plans[258].steps.some(s => s.kind === 'hunt' && s.area && /Wolf/.test(s.area.name)), '258 Bring Wolf Pelts: the hunt step has the Wolf area');
ok(Object.values(plans).filter(p => p.status === 'ready').length >= 50, 'at least 50 quests ready (' + cnt.ready + ')');

// ---------------------------------------------------------------- 2. overrides kept + win
console.log('2. overrides survive the builder and win');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'qplan-'));
const runB = (ids) => cp.spawnSync(process.execPath, [path.join(__dirname, 'quest_plan_build.js'), '--plan', '--only', ids], { env: Object.assign({}, process.env, { SWARM_QUESTPLAN_DIR: TMP, SWARM_QUESTPLAN_NOREPORT: '1' }), encoding: 'utf8' });
let r = runB('258,1,201');
ok(r.status === 0 && fs.existsSync(path.join(TMP, '258.json')), 'builder writes into the scratch folder' + (r.status ? ' ' + r.stderr : ''));
const API = require(path.join(ROOT, 'Dashboard', 'questplan_api.js'));
const ctx = { DATA, ROOT, LOGS: TMP };
process.env.SWARM_QUESTPLAN_DIR = TMP;
const p258 = J(path.join(TMP, '258.json')), hunt = p258.steps.find(s => s.kind === 'hunt'), talk = p258.steps.find(s => s.kind === 'start');
let sv = API.save(ctx, { id: 258, key: hunt.key, override: { area: { at: [-90000, 240000, -3600], radius: 2000, name: 'my wolves' }, route: [[-84000, 244000, -3700], [-88000, 241000, -3650], [-90000, 240000, -3600]], start: { kind: 'town', town: 'Gludin' }, note: 'test' } });
ok(sv.code === 200 && sv.body.ok, 'API save of a step override' + (sv.code !== 200 ? ' ' + JSON.stringify(sv.body) : ''));
ok(fs.readdirSync(path.join(TMP, 'history')).some(f => /^258_/.test(f)), 'history copy written before the save');
sv = API.save(ctx, { id: 258, key: talk.key, override: { npcAt: [-86385, 243300, -3717], manual: true } }); ok(sv.code === 200, 'API save of an NPC place + manual');
r = runB('258,1,201');
const p2 = J(path.join(TMP, '258.json')), h2 = p2.steps.find(s => s.key === hunt.key), t2 = p2.steps.find(s => s.key === talk.key);
ok(p2.override && p2.override.steps && p2.override.steps[hunt.key] && p2.override.steps[hunt.key].note === 'test', 'the override section is kept by a new builder run');
ok(h2.area && h2.area.kind === 'override' && h2.area.at[0] === -90000 && h2.travelOverride && h2.travelOverride.src === 'override', 'the override area + route win in the regenerated plan');
ok(t2.npc.at[1] === 243300 && t2.reasons.includes('owner-manual') && p2.status === 'fixable', 'override npcAt used; manual step = fixable (owner-manual)');
sv = API.save(ctx, { id: 1, quest: { skip: true, note: 'not now' } }); r = runB('1');
ok(J(path.join(TMP, '1.json')).status === 'not-for-bots' && J(path.join(TMP, '1.json')).reasons.some(x => x.code === 'owner-skip'), 'quest skip = not-for-bots (owner-skip) after the next run');
// writeGuarded safety net: an override written while the builder ran wins at write time
{ const mg = require('./manual_guard'), f = path.join(TMP, '201.json'), data = J(f); const disk = J(f); disk.override = { steps: {}, note: 'late edit' }; fs.writeFileSync(f, JSON.stringify(disk)); mg.writeGuarded(f, data, 'questplan', { quiet: true }); ok(J(f).override.note === 'late edit', 'manual_guard questplan merge keeps an override written meanwhile'); }

// ---------------------------------------------------------------- 3. engine
console.log('3. the engine uses the plan');
const SRC = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
const a0 = SRC.indexOf('// QENGINE-PURE-BEGIN'), b0 = SRC.indexOf('// QENGINE-PURE-END');
let E = null; try { E = new Function(SRC.slice(a0, b0) + '\nreturn { qePlanMatch, qePlanSpot, qePlanRoute, qePlanLiveOf, qeDecide };')(); } catch (e) { E = null; }
ok(!!E, 'QENGINE-PURE has qePlanMatch / qePlanSpot / qePlanRoute / qePlanLiveOf');
if (E) {
  const P = plans[258], q = J(path.join(QDIR, '258.json'));
  const aStart = E.qeDecide(q, { started: false, have: {} }), mS = E.qePlanMatch(P, aStart, null);
  ok(mS && mS.step.kind === 'start' && mS.i === 0, 'start talk -> plan step 1');
  const aHunt = E.qeDecide(q, { started: true, cond: 1, condKnown: true, have: {} }), mH = E.qePlanMatch(P, aHunt, 1);
  ok(aHunt.act === 'hunt' && mH && mH.step.kind === 'hunt', 'hunt at cond 1 -> the plan hunt step');
  const sp = E.qePlanSpot(mH); ok(sp && sp.src === 'plan' && Math.round(sp.x) === P.steps[mH.i].area.at[0], 'hunt spot = the plan place');
  const mO = Object.assign({}, mH, { ov: { area: { at: [1, 2, 3], name: 'x' } } }); ok(E.qePlanSpot(mO).src === 'override' && E.qePlanSpot(mO).x === 1, 'override area wins');
  ok(E.qePlanRoute(Object.assign({}, mH, { ov: { route: [[1, 2, 3], [4, 5, 6]], start: { kind: 'town', town: 'Gludin' } } })).src === 'override', 'override route wins');
  ok(E.qePlanRoute(Object.assign({}, mH, { ov: { area: { at: [1, 2, 3] } } })) === null, 'own place without own route: no stale plan route');
  const comp = Object.values(plans).find(p => p.steps.some(s => s.travel && s.travel.src === 'computed' && s.travel.status === 'ok' && s.npc));
  if (comp) { const st = comp.steps.find(s => s.travel && s.travel.src === 'computed' && s.travel.status === 'ok' && s.npc); const rr = E.qePlanRoute({ step: st, ov: null, place: null, i: st.i, n: comp.steps.length }); ok(rr && rr.src === 'plan' && rr.points.length >= 1 && rr.start, `computed route of quest ${comp.id} step ${st.i + 1} is walked as a route`); }
  const lv = E.qePlanLiveOf(P, mH); ok(lv && lv.i === mH.i && lv.n === P.steps.length && lv.text && lv.status === P.status, 'live line: step i / n + text + plan status');
}
const fnBody = (name) => { const i = SRC.indexOf('async function ' + name + '(') >= 0 ? SRC.indexOf('async function ' + name + '(') : SRC.indexOf('function ' + name + '('); if (i < 0) return ''; const j = SRC.indexOf('\n}\n', i); return SRC.slice(i, j); };
ok(/qePlanWalk\(/.test(fnBody('qeGoNpc')) && /qePlanNpcAt\(/.test(fnBody('qeGoNpc')), 'qeGoNpc walks the plan route + uses the plan NPC place');
ok(/qePlanSpot\(/.test(fnBody('qeDoHunt')) && /qePlanWalk\(/.test(fnBody('qeDoHunt')), 'qeDoHunt hunts at the plan place and walks its route');
ok(/qePlanMark\(/.test(fnBody('qeRun')) && /override[\s\S]{0,40}skip|po\.skip/.test(fnBody('qeRun')) && /ov\.manual/.test(fnBody('qeRun')), 'qeRun: plan step each round, quest skip, step manual');
ok(/S\.active\.plan = Q\.planLive/.test(fnBody('qePhase')), 'qePhase writes the live plan line into quest_state');
ok(/plan: qePlanLiveNow\(\)/.test(SRC) && /function qePlanLiveNow\(/.test(SRC), 'swarm_state doing.quest.plan (route point i / n)');
ok(/rsCustomTrip\(/.test(fnBody('qePlanWalk')), 'a plan / override route is walked as an own route (team walk, start .town / gatekeeper)');

// ---------------------------------------------------------------- 4. API
console.log('4. API + live');
ok(API.cleanStep({ route: [[1, 2, 3]] }).error, 'one route point refused');
ok(API.cleanStep({ route: [[1, 'x', 3], [4, 5, 6]] }).error, 'non-number route point refused');
ok(API.cleanStep({ area: { at: [1, 2, 3], radius: 50 } }).error, 'tiny radius refused');
ok(!API.cleanStep({ route: [[1, 2, 3], [4, 5, 6]], manual: true }).error, 'good override accepted');
ok(API.save(ctx, { id: 258, key: 'c99:hunt', override: { manual: true } }).code === 404, 'unknown step = 404');
ok(API.save(ctx, { id: 258, key: '../x', override: {} }).code === 400, 'bad key = 400');
ok(API.save(ctx, { id: 258, key: hunt.key, override: { manual: true }, base: '2000-01-01T00:00:00Z' }).code === 409, 'stale base = 409 (changed meanwhile)');
ok(API.save(ctx, { id: 258, key: hunt.key, override: null }).code === 200 && !J(path.join(TMP, '258.json')).override.steps[hunt.key], 'override null removes it');
{ fs.writeFileSync(path.join(TMP, '258.json.lock'), 'x'); const t0 = Date.now(); const rr = API.save(ctx, { id: 258, key: talk.key, override: { note: 'n' } }); fs.unlinkSync(path.join(TMP, '258.json.lock')); ok(rr.code === 423 || rr.code === 200, 'a held lock is waited for / refused (' + rr.code + ', ' + (Date.now() - t0) + ' ms)'); }
const LG = fs.mkdtempSync(path.join(os.tmpdir(), 'qplanlogs-')); process.env.SWARM_QUESTLIVE_LOGS = LG;
fs.writeFileSync(path.join(LG, 'quest_state_Questor.json'), JSON.stringify({ name: 'Questor', active: { id: 258, phase: 'travel', cond: 1, step: 'to Wolf', plan: { status: 'ready', i: 1, n: 3, key: hunt.key, text: 'Hunt Wolf', src: 'plan' }, phaseAt: new Date().toISOString() } }));
fs.writeFileSync(path.join(LG, 'swarm_state_Questor.json'), JSON.stringify({ name: 'Questor', x: -88000, y: 240000, z: -3600, updated: new Date().toISOString(), doing: { quest: { id: 258, plan: { i: 1, n: 3, routeI: 7, routeN: 20, src: 'plan' } } } }));
const L = API.liveOf(ctx, 258);
ok(L.length === 1 && L[0].stepI === 1 && L[0].routeI === 7 && L[0].routeN === 20 && L[0].x === -88000 && L[0].online, 'live row: step, route point i / n (swarm_state is fresher), position');
const QL = require(path.join(ROOT, 'Dashboard', 'questlive_api.js'));
const d = QL.live({ DATA, LOGS: LG }, 258); ok(d.ok && d.chars[0] && d.chars[0].plan && d.chars[0].plan.routeI === 7, '/api/quests/live carries the plan line');
delete process.env.SWARM_QUESTLIVE_LOGS; delete process.env.SWARM_QUESTPLAN_DIR;
try { fs.rmSync(TMP, { recursive: true, force: true }); fs.rmSync(LG, { recursive: true, force: true }); } catch (e) { }
console.log(`\n${oks} ok, ${fails} failed`);
process.exit(fails ? 1 : 0);
