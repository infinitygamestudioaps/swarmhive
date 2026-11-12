// TESTER FIXES 2026-11-12 (Discord #swarmhive after v1.14.2; owner decisions 2026-11-12). Nothing live: pure blocks in node + source checks.
//   SUPHOLY       Holy Water / symbols / Spirit Ore never START a supply run (Vykaax: back to town every 20 min, "Einhasad's Holy Water 0")
//   PACE400       the leader pauses on a leg only beyond 400 behind (owner: "Stop only beyond 400"; testers: "5 steps, then 5-10 s pause")
//   LEGFIGHT      on a leg the team also fights at 3+ monsters on us / someone below 40 % (owner: "Also fight at 3+ attackers"; leech pack wipe)
//   ROUTECOMBAT   a member's L2Swarm combat is paused for the route walk, back on after it (owner: "Pause it for the walk"; "fight mobs 3k away")
//   FOGENTRYPKG   the locked FoG entry route (routes/dungeons/forge.json) is in the tester package ("died 80 times" in the pool)
// Usage: node docs/plan/tools/test_tester_1112.js
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m); } };
const block = (name) => { const a = SRC.indexOf(`// ${name}-PURE-BEGIN`), b = SRC.indexOf(`// ${name}-PURE-END`); if (!(a > 0 && b > a)) throw new Error(name + ' block missing'); return SRC.slice(a, b); };

console.log('SUPHOLY');
{
  const c = { Number, Math }; vm.createContext(c);
  vm.runInContext(block('SUPHOLY') + '\n;globalThis.__T = supplyTriggers;', c);
  const T = c.__T;
  ok(T({ id: 8874, name: "Einhasad's Holy Water", have: 0, need: 100 }) === false, "replay GreenTwo: Einhasad's Holy Water 0 (no shop sells it) never starts a supply run");
  ok(T({ id: 8875, have: 0, need: 50 }) === false && T({ id: 8876, have: 0, need: 50 }) === false, 'Battle / Magic Symbols never start a run');
  ok(T({ id: 3031, have: 0, need: 2500 }) === false, 'Spirit Ore never starts a run (ORE 2026-10-14, unchanged)');
  ok(T({ id: 8595, have: 0, need: 2 }) === false, 'recovery scrolls never start a run (unchanged)');
  ok(T({ id: 736, have: 1, need: 4 }) === true && T({ id: 736, have: 2, need: 3 }) === false, 'Scroll of Escape: below 2 starts a run (unchanged)');
  ok(T({ id: 737, have: 0, need: 3 }) === true && T({ id: 728, have: 99, need: 1901 }) === true && T({ id: 1061, have: 4, need: 26 }) === true, 'SoR < 1 / Mana Potion < 100 / Healing Potion < 5 start a run (unchanged)');
  ok(T({ id: 1467, have: 150, need: 49850 }) === true && T({ id: 1467, have: 250, need: 49750 }) === false, 'shots below 200 start a run, 250 do not (unchanged)');
  ok(T({ id: 1467, have: 0, need: 0 }) === false, 'nothing needed = no run');
  ok(/const low = supplyNeeds\(\)\.filter\(supplyTriggers\);/.test(SRC), 'the supply watch uses this one rule');
}

console.log('PACE400');
{
  const c = { Math, JSON, Number, String, Object, Array, isFinite, Set }; vm.createContext(c);
  vm.runInContext(block('MOVETOGETHER') + '\n;globalThis.__M = { MT, mtCfg, mtDecide };', c);
  const M = c.__M;
  ok(M.MT.paceGap === 400 && M.mtCfg({}).paceGap === 400, 'the default pace gap is 400 (owner 2026-11-12)');
  ok(M.mtCfg({ mtPaceGap: 150 }).paceGap === 150, "a party's own route rule still wins");
  ok(M.MT.behind < M.mtCfg({}).paceGap, 'members still hold right behind the leader (below the pace gap)');
  ok(M.MT.gateNear === 200 && /<= Math\.min\(L\.cfg\.paceGap, MT\.gateNear\)/.test(SRC), "the waypoint's \"with me\" safety net stays at 200 (the wider gap is for legs only)");
  const mm = (o) => Object.assign({ name: 'A', online: true, alive: true, benched: false, left: false, reached: 3, prog: 3000, d: 50, stuck: null, fight: false }, o);
  const D = (o) => M.mtDecide(Object.assign({ now: 1e5, phase: 'leg', gate: 4, n: 10, since: 1e5, leaderProg: 3000, cfg: M.mtCfg({}), trail: [], fight: false, members: [] }, o));
  ok(D({ leaderProg: 3390, members: [mm({}), mm({ name: 'B', prog: 3100 }), mm({ name: 'C', prog: 3250 })] }).act === 'go', 'replay: 9 members 100-390 behind -> the leader keeps walking (was: a stop every few steps)');
  ok(D({ leaderProg: 3450, members: [mm({})] }).act === 'pace', 'a member 450 behind -> the leader slows down');
  ok(D({ phase: 'gate', members: [mm({ reached: 2, d: 300 })] }).act === 'wait', 'at the waypoint he still waits for everyone (one dot, never leave anyone)');
  const rr = JSON.parse(fs.readFileSync(path.join(ROOT, 'Scripts', 'data', 'route_rules.json'), 'utf8').replace(/^﻿/, ''));
  ok((rr.rules.find(r => r.key === 'mtPaceGap') || {}).default === 400, 'route_rules.json shows the new default (dashboard Route rules)');
  ok(/mtPaceGap: 400/.test(fs.readFileSync(path.join(ROOT, 'Dashboard', 'routeview_api.js'), 'utf8')), 'dashboard RR_BUILTIN = 400');
  ok(/`mtPaceGap` \(default 400/.test(fs.readFileSync(path.join(ROOT, 'docs', 'requirements', 'team.md'), 'utf8')), 'team.md R1 says 400 (owner 2026-11-12)');

  console.log('LEGFIGHT');
  const mem = (o) => [mm(Object.assign({ low: false, crit: false }, o))];
  ok(D({ fight: true, attackers: 2, members: mem({}) }).act !== 'fight', 'a leg with 2 monsters on us and nobody low: run on (RUNON kept)');
  const f3 = D({ fight: true, attackers: 3, members: mem({}) });
  ok(f3.act === 'fight' && /3 monsters on us/.test(f3.line), `replay leech pack: 3+ monsters on us on a leg -> the team stops and fights ("${f3.line}")`);
  ok(D({ fight: true, attackers: 0, members: mem({ low: true }) }).act === 'fight', 'a member below 40 % on a leg -> fight');
  ok(D({ fight: true, attackers: 5, legFightDone: true, members: mem({}) }).act !== 'fight', 'the leg fight budget is used up (a respawning hallway) -> run on to the point');
  ok(D({ fight: true, attackers: 5, legFightDone: true, members: mem({ crit: true, low: true }) }).act === 'fight', '... but a member below 20 % still stops the team');
  ok(D({ fight: false, attackers: 4, members: mem({}) }).act !== 'fight', 'nobody of us is in a fight -> no fight stop (monsters only near)');
  ok(D({ phase: 'gate', fight: true, attackers: 0, fightDone: true, members: mem({}) }).act !== 'fight', 'the waypoint rule is unchanged (its own budget)');
  ok(M.MT.legPack === 3 && M.MT.lowHp === 40 && M.MT.legFightMaxMs === 60000, 'numbers: 3 monsters, 40 % HP, 60 s per leg');
  ok(/attackers: phase === 'leg' \? mtTeamAttackers\(\) : 0, legFightDone: L\.legFightIdx === g/.test(SRC), "mtView gives the leader's decision the monsters on the team + the leg budget");
  ok(/await mtFight\(abort, 'leg'\)/.test(SRC) && /if \(leg\) \{[\s\S]{0,400}L\.legFightMs = \(L\.legFightMs \|\| 0\) \+ \(now\(\) - t0\)/.test(SRC), "a leg fight counts on the leg's own budget, never the waypoint's");
  ok(/leg \? \(now\(\) - t0 >= MT\.fightMinMs && mtTeamAttackers\(\) === 0\)/.test(SRC), 'a leg fight ends when nothing is on us any more');
  ok(/if \(now\(\) < \(memberRoute\.hold \|\| 0\)\) return false;\s+\/\/ LEGFIGHT/.test(SRC), 'members held for the fight defend themselves (no "keep running" while the leader stopped the team)');
}

console.log('ROUTECOMBAT');
{
  const c = {}; vm.createContext(c);
  vm.runInContext(block('ROUTECOMBAT') + '\n;globalThis.__R = { routeCombatPauseAct, routeCombatBackAct };', c);
  const R = c.__R;
  ok(R.routeCombatPauseAct({ inCombat: true }) === 'pause', "replay Vykaax: a member's L2Swarm combat ON at the start of a route walk -> paused (back on after the walk)");
  ok(R.routeCombatPauseAct({ inCombat: true, hiveFight: true }) === 'stop', "Hive's own short self-defence fight -> stopped, never switched back on later");
  ok(R.routeCombatPauseAct({ inCombat: true, handsOff: true }) === '' && R.routeCombatPauseAct({ inCombat: false }) === '' && R.routeCombatPauseAct({ inCombat: true, dead: true }) === '', 'hands off / combat off / dead -> untouched');
  ok(R.routeCombatBackAct({ was: true }) === 'now', 'the walk ended in the field -> combat back on');
  ok(R.routeCombatBackAct({ was: true, town: true }) === 'later' && R.routeCombatBackAct({ was: true, dead: true }) === 'later' && R.routeCombatBackAct({ was: true, onRoute: true }) === 'later', 'in a town / dead / a new walk running -> later');
  ok(R.routeCombatBackAct({ was: true, inCombat: true }) === 'drop' && R.routeCombatBackAct({ was: true, handsOff: true }) === 'drop' && R.routeCombatBackAct({ was: false }) === 'drop', 'already on / hands off / never paused -> nothing to give back');
  ok(/if \(fresh\) routeCombatPause\(\);/.test(SRC), 'a new route walk pauses it (member side)');
  ok(/function memberRouteStop\(\) \{[^\n]*routeCombatBack\(\); \}/.test(SRC), 'every end of a member route walk gives it back');
  ok(/if \(memberRoute\.combatWas && !memberRoute\.id\) routeCombatBack\(\);/.test(SRC), "'later' is retried every 10 s");
  ok(/routeCombatPauseAct\(\{ inCombat: !!IsInCombat, handsOff: ho, dead: !!Me\.IsDead, hiveFight: now\(\) - selfDefAt < 20000 \}\)/.test(SRC) && /const selfDefAt = typeof selfDef !== 'undefined' \? \(selfDef\.started \|\| 0\) : 0;/.test(SRC), 'the host passes the live L2Swarm combat flag, hands off and the Hive-fight time');
}

console.log('SFBUFF');
{
  const line = (head) => { const i = SRC.indexOf(head); return SRC.slice(i, SRC.indexOf('\n', i)); };
  const a = SRC.indexOf('function swarmKeepDecide(o) {'), b = SRC.indexOf('\nfunction swarmEscapeBlocked', a);
  const K = new Function(line('const SWKEEP_ERRAND') + '\n' + SRC.slice(a, b) + '\nreturn swarmKeepDecide;')();
  ok(K({ sfNow: true, why: 'rebuff turn' }).stop === true, "replay Vykaax PurpleFive: Fight with L2Swarm in its fight phase - Hive may pause the member's combat for its rebuff turn");
  ok(K({ sfNow: true, why: 'back to the middle' }).stop === false && K({ handsOff: true, why: 'rebuff turn' }).stop === false, 'everything else stays the player\'s (SWARMKEEP), hands off is never touched');
  ok(/const calm = \(\) => \{ try \{ stopCombatG\('rebuff turn'\); \}/.test(SRC), "the buff turn stops combat with the reason 'rebuff turn'");
  ok(/if \(wasFa \|\| Options\.FollowAtk\) Options\.FollowAtk = false;/.test(SRC), 'Follow Attack is off for the turn (also when another loop switched it on meanwhile)');
  ok(/if \(state\.buffTurn\) return;\s+\/\/ SFBUFF-2026-11-12/.test(SRC), 'the Fight-with-L2Swarm member loop restarts no combat / Follow Attack during the turn');
  ok(/if \(sf && !isLeader\(\)\) SF\.hiveStopAt = now\(\);/.test(SRC), "the stop is stamped as Hive's, so the SF loop gives the combat back after the turn");
}

console.log('FOGENTRYPKG');
{
  const RB = fs.readFileSync(path.join(ROOT, 'docs', 'plan', 'tools', 'release_build.js'), 'utf8');
  ok(/\(top\[1\] === 'raid' \|\| top\[1\] === 'dungeons'\) && top\.length === 3/.test(RB), 'the package ships Scripts/data/routes/dungeons/*.json');
  const fj = JSON.parse(fs.readFileSync(path.join(ROOT, 'Scripts', 'data', 'routes', 'dungeons', 'forge.json'), 'utf8'));
  ok(fj.manual === true && Array.isArray(fj.points) && fj.points.length >= 50 && (fj.traps || []).some(t => t && t.name === '25_14_water1'),'the locked FoG entry route is there (manual, the pool marked as a trap)');
}

console.log(`\ntest_tester_1112: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
