// WALKFIGHT + TOWNNEAR (tester Hero 2026-10-27, solo Human Fighter Rakata lvl 8, quest "Head for the Hills!", Kamael Village):
//  "still runs away from mob in combat and then returns and then runs away" / "ran into whole bunch of aggressive mobs ... got himself killed" /
//  "pathing in kamael village is super weird be it inside the village or outside".
//  node docs/plan/tools/test_quest_walk_fight.js
//  A  walkFightDecide: a fight pauses a quest walk; escapes / flee / raids / team legs / healers / user routes keep walking; 3 min cap
//  B  stubbed host + virtual clock: walking, an aggressive monster comes and hits -> NO walk orders while fighting, the walk resumes after
//  C  walkAvoidPick: live aggressive monsters as avoid circles (never one that holds me / the target, never the one I fight)
//  D  TOWNNEAR against the real town graphs: every NPC front / arrival is on the streets, the Kamael outskirts below the cliff are not
//  E  wiring in swarm.js (walkDirect / walkDirectRun / geoWalk / rgWalk / self-defence / town walks)
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const src = fs.readFileSync(process.env.SWARM_JS || path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL ' + m); } };
const block = (name) => { const a = src.indexOf('// ' + name + '-BEGIN'), b = src.indexOf('// ' + name + '-END'); if (a < 0 || b < a) throw new Error(name + ' block missing'); return src.slice(a, b); };
const WF = new Function(block('WALKFIGHT-PURE') + '\nreturn { WALKFIGHT, walkFightDecide, walkAvoidPick, walkFightHold };')();
const TN = new Function(block('TOWNNEAR-PURE') + '\nreturn { TOWNNEAR, tgCentrePts, tgNearPts };')();

(async () => {
  // ---- A: the decision
  const base = { ctx: true, hitAgo: 800, atk: { alive: true, dist: 120, skip: false } };
  const D = (o) => WF.walkFightDecide(Object.assign({}, base, o));
  ok(D({}).act === 'pause' && D({}).kind === 'hit', 'A: a monster hitting me on a quest walk pauses the walk');
  ok(D({ ctx: false }).act === 'walk', 'A: not a quest / own-combat walk = the old behaviour');
  ok(D({ escaping: true }).act === 'walk', 'A: an escape (escapeFight / useEscape) keeps running');
  ok(D({ fleeing: true }).act === 'walk', 'A: flee / pull-back / pre-teleport safe spot keeps running');
  ok(D({ raid: true }).act === 'walk' && D({ inst: true }).act === 'walk', 'A: raids / instances keep their own fight code');
  ok(D({ teamLeg: true }).act === 'walk', 'A: a team walk leg keeps the RUNON rule (fight at the waypoint)');
  ok(D({ healer: true }).act === 'walk', 'A: healers only heal: they never stop to fight');
  ok(D({ userRoute: true }).act === 'walk' && D({ swim: true }).act === 'walk', 'A: user route hops / swims are not paused');
  ok(D({ pausedMs: WF.WALKFIGHT.maxMs }).act === 'walk', 'A: never more than maxMs in fights on one walk');
  ok(D({ hitAgo: 9000 }).act === 'walk', 'A: an old hit does not pause');
  ok(D({ atk: { alive: false, dist: 100 } }).act === 'walk', 'A: the attacker died = walk on');
  ok(D({ atk: { alive: true, dist: 100, skip: true } }).act === 'walk', 'A: a Treasure Chest / blacklisted / someone else\'s quest mob does not pause');
  ok(D({ atk: { alive: true, dist: 5000 } }).act === 'walk', 'A: an attacker far away does not pause');
  ok(D({ hitAgo: 1e9, atk: null, ownFight: true }).kind === 'fight', 'A: my own fight (L2Swarm combat / ForceCloseCombat, Hive off) pauses the walk');
  ok(D({ hitAgo: 1e9, atk: null, comes: true, comeMs: 1000 }).kind === 'comes', 'A: an aggressive monster coming at me pauses the walk (it is fought, not dragged along)');
  ok(D({ hitAgo: 1e9, atk: null, comes: true, comeMs: 9000 }).act === 'walk', 'A: a monster that "comes" but never reaches me does not hold the walk for ever');

  // ---- B: stubbed host + virtual clock. World: walking from t=0; at 3 s a Kamael aggressive monster targets me, at 4.5 s it hits (every 1.5 s),
  // it dies at 20 s. The walker issues a move every 250 ms when not held (the worst case of walkDirectRun's re-issue).
  const sim = async (world, endMs, cfg) => {
    let vt = 0; const orders = [], stops = [];
    const H = { now: () => vt, sleep: async (ms) => { vt += ms; }, sense: () => world(vt), stop: (k) => stops.push({ t: vt, k }), say: () => { }, abort: () => false };
    let paused = 0;
    while (vt < endMs) {
      const pm = await WF.walkFightHold(Object.assign({}, H, { pausedBefore: paused }), cfg);
      if (pm > 0) { paused += pm; continue; }
      orders.push(vt); vt += 250;
    }
    return { orders, stops, paused };
  };
  const kamael = (extra) => (t) => {
    const alive = t < 20000, comes = alive && t >= 3000, hit = alive && t >= 4500, lastHit = hit ? 4500 + Math.floor((t - 4500) / 1500) * 1500 : -1e9;
    return Object.assign({ ctx: true, comes, hitAgo: t - lastHit, atk: t >= 4500 ? { alive, dist: 60, skip: false } : null, ownFight: alive && t >= 4600 }, extra || {});
  };
  {
    const r = await sim(kamael(), 30000);
    const during = r.orders.filter(t => t >= 3000 && t < 20000);
    ok(during.length === 0, `B: no walk orders while the monster comes / fights (got ${during.length})`);
    ok(r.orders.some(t => t < 3000) && r.orders.some(t => t >= 20000), 'B: walking before, walking again after the kill');
    ok(r.stops.length === 1 && r.stops[0].t >= 3000 && r.stops[0].t < 3500, 'B: the walker is stopped ONCE when the fight starts (no stop / start flapping)');
    const after = r.orders.filter(t => t >= 20000); ok(after.length && after[0] - 20000 <= 500, 'B: the walk resumes within half a second of the kill');
  }
  {
    // the old behaviour (no hold): orders run on during the whole fight = the "runs away, comes back, runs away" loop
    const r = await sim(kamael({ ctx: false }), 30000);
    ok(r.orders.filter(t => t >= 3000 && t < 20000).length > 50, 'B: without the quest context the walker keeps issuing (control case)');
  }
  {
    const r = await sim(kamael({ escaping: true }), 30000);
    ok(r.orders.filter(t => t >= 3000 && t < 20000).length > 50, 'B: an escape run is never held by a fight');
  }
  {
    // endless fight (a monster that never dies): the walk goes on after maxMs (the solo escape rules then decide)
    const endless = (t) => ({ ctx: true, hitAgo: 500, atk: { alive: true, dist: 50 }, ownFight: true });
    const r = await sim(endless, 200000, Object.assign({}, WF.WALKFIGHT, { maxMs: 60000 }));
    ok(r.orders.length > 0 && r.orders[0] >= 60000 && r.orders[0] < 61000, 'B: an endless fight releases the walk after maxMs');
  }
  {
    // two monsters in a row: pause, resume, pause again, resume - never orders during either fight
    const w = (t) => { const f1 = t >= 2000 && t < 8000, f2 = t >= 12000 && t < 16000; return { ctx: true, hitAgo: f1 || f2 ? 300 : 1e9, atk: f1 || f2 ? { alive: true, dist: 80 } : null }; };
    const r = await sim(w, 20000);
    ok(!r.orders.some(t => (t >= 2000 && t < 8000) || (t >= 12000 && t < 16000)) && r.orders.some(t => t >= 8000 && t < 12000) && r.orders.some(t => t >= 16000), 'B: fight -> walk -> fight -> walk, no orders inside a fight');
    ok(r.stops.length === 2, 'B: one stop per fight');
  }

  // ---- C: avoid circles
  {
    const me = { x: 0, y: 0 }, tgt = { x: 4000, y: 0 };
    const dangers = [{ id: 1, x: 2000, y: 300, r: 450 }, { id: 2, x: 100, y: 0, r: 450 }, { id: 3, x: 3900, y: 0, r: 450 }, { id: 4, x: 1000, y: 900, r: 450 }, { id: 5, x: 9000, y: 0, r: 450 }];
    const av = WF.walkAvoidPick(dangers, me, tgt, [4]);
    ok(av.length === 1 && av[0].x === 2000, 'C: avoids the pack on the way; not the one I stand in, not the one at the target, not the one I fight, not far ones');
    ok(WF.walkAvoidPick(Array.from({ length: 40 }, (_, i) => ({ id: i, x: 800 + i * 50, y: 600, r: 300 })), me, tgt, []).length === WF.WALKFIGHT.avoidMax, 'C: at most avoidMax circles (path finder cost)');
  }

  // ---- D: TOWNNEAR on the real town graphs
  {
    const dir = path.join(ROOT, 'Scripts', 'data', 'town_graph'), I = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'));
    let bad = [];
    for (const t of I.towns) {
      const o = JSON.parse(fs.readFileSync(path.join(dir, t.key + '.json'), 'utf8')), pts = TN.tgCentrePts(o);
      Object.keys(o.npcs || {}).forEach(k => { const v = o.v[o.npcs[k]]; if (v && !TN.tgNearPts(pts, { x: v[1], y: v[2], z: v[3] })) bad.push(t.key + ' ' + k); });
      (o.arrive || []).forEach(id => { const v = o.v.find(q => q[0] === id); if (v && !TN.tgNearPts(pts, { x: v[1], y: v[2], z: v[3] })) bad.push(t.key + ' arrive ' + id); });
    }
    ok(bad.length === 0, 'D: every NPC front + arrival point of all 18 towns is on its street graph' + (bad.length ? ' (' + bad.slice(0, 5).join(', ') + ')' : ''));
    const K = JSON.parse(fs.readFileSync(path.join(dir, 'kamael.json'), 'utf8')), kp = TN.tgCentrePts(K);
    const mk = Object.keys(K.npcs).find(k => /^32173@/.test(k)), mv = mk ? K.v[K.npcs[mk]] : null;   // Marcela, the "Head for the Hills!" NPC
    ok(mv && TN.tgNearPts(kp, { x: mv[1], y: mv[2], z: mv[3] }), 'D: Marcela (Head for the Hills!) is reached over the Kamael streets');
    ok(!TN.tgNearPts(kp, { x: -122206, y: 46484, z: 1272 }), 'D: a Kamael box point 2,400 from any street is NOT forced onto the street graph (wall-aware path finder instead)');
    // a point on the Kamael plateau street, moved 450 lower (the outskirts under the cliff): not "on the street"
    const sv = K.v.find(v => v[3] > 300); ok(sv && TN.tgNearPts(kp, { x: sv[1], y: sv[2], z: sv[3] }) && !TN.tgNearPts(kp, { x: sv[1], y: sv[2], z: sv[3] - 450 }), 'D: the height check separates the plateau streets from the ground below the cliff');
  }

  // ---- E: wiring
  {
    const wd = src.slice(src.indexOf('async function walkDirect('), src.indexOf('async function walkDirectRun('));
    ok(/const wf = typeof walkFightOn === 'function' && walkFightOn\(forceDirect\);/.test(wd) && /walkDirectRun\(x, y, z, dist, timeoutMs, abort, forceDirect, myMove, wf\)/.test(wd) && /if \(wf\) WFP\.live = Math\.max\(0, WFP\.live - 1\)/.test(wd), 'E: walkDirect marks a quest / own-combat walk (WFP.live) and passes wf');
    const wr = src.slice(src.indexOf('async function walkDirectRun('), src.indexOf('// RESTOCK  —'));
    const h = wr.indexOf('await walkFightHoldH(myMove, abort, wfPaused)'), iss = wr.indexOf('if (!lastIssue || (now() - lastIssue > 10000');
    ok(h > 0 && iss > h, 'E: walkDirectRun holds for a fight BEFORE it (re-)issues a move');
    ok(/if \(pm > 0\) \{ wfPaused \+= pm; until \+= pm; lastIssue = 0; stuckCount = 0;/.test(wr), 'E: a fight pause is not counted as stuck / timeout');
    const gw = src.slice(src.indexOf('async function geoWalk('), src.indexOf('async function walkToInner('));
    ok(/walkAvoidNow\(x, y\)/.test(gw) && /fought on the way — new route from here/.test(gw) && /wfLeft\(\)/.test(gw), 'E: geoWalk plans around aggressive monsters, re-plans after a fight, fight time does not eat its limit');
    ok(/abort = \(\) => !!\(\(o\.abort && o\.abort\(\)\) \|\| Me\.IsDead \|\| now\(\) > until \+ \(wfTot\(\) - wfp0\)\)/.test(src), 'E: rgWalk (street / room walks) adds fight pauses to its limit');
    ok(/defendHow\(\{ stopped: stopCalmStopped\(\) \|\| walkFightWalking\(\)/.test(src), 'E: self-defence on a quest walk fights ONLY the monster on me (no 1200 combat square)');
    ok(/const wk = walkFightWalking\(\); try \{ if \(!wk\) Send\.StopMove\(\); \}/.test(src), 'E: the end of a self-defence fight does not stop the resumed walk');
    const ri = src.slice(src.indexOf('async function rgWalkInside('), src.indexOf('async function rgWalkInside(') + 2500);
    ok(/if \(!tgOnStreets\(TD, \{ x: Me\.X, y: Me\.Y, z: Me\.Z \}\) \|\| !tgOnStreets\(TD, \{ x, y, z:/.test(ri), 'E: walkToInner uses a town street graph only when both ends are on it');
    const tw = src.slice(src.indexOf('async function townWalkToNpc('), src.indexOf('async function townWalkToNpc(') + 2500);
    ok(/!tgOnStreets\(TD, \{ x: Me\.X, y: Me\.Y, z: Me\.Z \}\)[^\n]*\n\s*try \{ if \(await walkToInner\(f\.x, f\.y, f\.z/.test(tw), 'E: an NPC walk from off the streets uses the wall-aware path finder (alone)');
    ok(/walkFightOn\(forceDirect\) \{[\s\S]{0,200}questRun\.active[\s\S]{0,120}soloChar\(\) && state\.mode === 'autolevel' && hiveOwnCombat\(\)/.test(src), 'E: context = quest walks + solo own-combat (Hive off) autolevel walks');
    ok(src.includes("if (forceDirect === 'route') return false;"), 'E: user route hops never pause');
  }
  console.log(`quest walk fight: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL crashed: ' + (e && e.stack || e)); process.exit(1); });
