// OFFLINE TEST of the STOP / PARK / STUCK-HIT / ROTATION fixes (public testers 2026-10-23, package v1.8.17). Never touches the game, MCP or Logs.
//   node docs/plan/tools/test_stop_fight_1023.js      (exit code 1 when a check fails; SWARM_JS=<file> tests another copy of swarm.js)
// Reports:
//  1) Raltru: "I stop them ... 'AUTOLEVEL Stopped (7 kills)' but they don't stop killing and don't go for buffs"
//  2) Vykaax: "5 minutes before he stopped ACTIVELY pulling mobs" (Giant's Cave) / "park them back to town, they keep fighting 5-10 min" /
//     "they just keep running the path anyway"
//  3) "the archer duo stood in place for 6 hours getting shot by a skeleton archer" (stopped party, ranged attacker)
//  4) "0 kills in 5 minutes, 3 rotation zones but they don't move" (Fields of Massacre area 2, monsters just outside it)
// Parts: A) STOPCALM-PURE (defendHow / defendKeep / stopCalmDecide / nohitStepDist), B) MULTISPOT-PURE (multiFightNow / multiBlockKeep /
// multiDecide repick + a replay of report 4), C) source wiring (self-defence, help, the stop guard, the autolevel loop, !stop, the run watch, multiTick).
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const SRCF = process.env.SWARM_JS || path.join(ROOT, 'Scripts_dev', 'swarm.js');
const src = fs.readFileSync(SRCF, 'utf8');
let fails = 0, n = 0;
const check = (ok, what) => { n++; console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails++; };
const blk = (b, e) => { const i = src.indexOf(b), j = src.indexOf(e, i + 1); if (i < 0 || j < i) { console.error(b + ' block not found'); process.exit(1); } return src.slice(i, j); };

// ---- A) STOPCALM-PURE --------------------------------------------------------------------------------------------------------
const S = new Function(blk('// STOPCALM-PURE-BEGIN', '// STOPCALM-PURE-END') + '\nreturn { STOPCALM, defendHow, defendKeep, stopCalmDecide, nohitStepDist };')();
check(S.defendHow({ stopped: true, ownCombat: false, dist: 100 }) === 'script', 'stopped party, monster on me close by: hit THIS monster only (no L2Swarm combat square)');
check(S.defendHow({ stopped: false, ownCombat: false, dist: 100 }) === 'square', 'party ON (travel / quest walk), monster close: the old 1200 square stays');
check(S.defendHow({ stopped: false, ownCombat: false, dist: 900 }) === 'script', 'a ranged attacker 900 away: hit it myself (it is outside any small square)');
check(S.defendHow({ stopped: true, ownCombat: true, dist: 100 }) === 'tight', 'Hive skills OFF + stopped: L2Swarm combat in a tight square around that monster (the player\'s Combat Skills)');
check(S.defendHow({ stopped: false, ownCombat: true, dist: 100 }) === 'square', 'Hive skills OFF + ON + close: the old square');
check(S.defendHow({ recHold: true, ownCombat: true }) === 'script', 'recording hold: always script attacks');
check(S.STOPCALM.tightSquare < 1200, 'the tight square is smaller than the old 1200 square');
// the archer duo: my target, combat ON, nothing swings at it
check(S.defendKeep({ sameTarget: true, attacking: true }) === true, 'self-defence: already swinging at it -> leave it');
check(S.defendKeep({ sameTarget: true, casting: true }) === true, 'self-defence: casting at it -> leave it');
check(S.defendKeep({ sameTarget: true, inCombat: true, idleMs: 2000 }) === true, 'combat on, idle 2 s -> give L2Swarm a moment');
check(S.defendKeep({ sameTarget: true, inCombat: true, idleMs: 6000 }) === false, 'REPORT 3: combat on but idle 6 s (ranged attacker outside the square) -> act again (was: return for ever)');
check(S.defendKeep({ sameTarget: true, inCombat: true, idleMs: 6 * 3600e3 }) === false, 'REPORT 3: 6 h idle -> act again');
check(S.defendKeep({ sameTarget: false, inCombat: true, attacking: true }) === false, 'another target -> act (target the attacker)');
// the stop guard
check(S.stopCalmDecide({ stopped: false, inCombat: true }) === 'none', 'guard: a party that runs is left alone');
check(S.stopCalmDecide({ stopped: true, busy: true, inCombat: true }) === 'none', 'guard: a raid / quest / mission / hold is left alone');
check(S.stopCalmDecide({ stopped: true, inCombat: false }) === 'none', 'guard: no L2Swarm combat -> nothing');
check(S.stopCalmDecide({ stopped: true, inCombat: true, attackerFresh: false }) === 'stop', 'REPORT 1/2: stopped + L2Swarm combat on + nothing hits us -> combat OFF (it kept picking new monsters)');
check(S.stopCalmDecide({ stopped: true, inCombat: true, attackerFresh: true, targetId: 5, attackerId: 7 }) === 'retarget', 'REPORT 2: stopped, L2Swarm picked another monster while one hits us -> combat off, hit the one on us');
check(S.stopCalmDecide({ stopped: true, inCombat: true, attackerFresh: true, targetId: 7, attackerId: 7, ownCombat: false }) === 'retarget', 'Hive skills ON: even on the right target no L2Swarm combat while stopped (script fight)');
check(S.stopCalmDecide({ stopped: true, inCombat: true, attackerFresh: true, targetId: 7, attackerId: 7, ownCombat: true }) === 'none', 'Hive skills OFF: its tight combat on the monster on us stays');
check(S.nohitStepDist(0, 100) === 300 && S.nohitStepDist(2, 100) === S.STOPCALM.nohitFarStep, 'a melee stalemate: 300 first, out of reach from the 3rd step');
check(S.nohitStepDist(0, 900) === S.STOPCALM.nohitFarStep && S.STOPCALM.nohitFarStep >= 1000, 'REPORT 3: a ranged stalemate (900 away): step out of its reach at once');

// ---- B) MULTISPOT-PURE --------------------------------------------------------------------------------------------------------
const M = new Function(blk('// MULTISPOT-PURE-BEGIN', '// MULTISPOT-PURE-END') + '\nreturn { MULTI, multiDecide, multiFightNow, multiBlockKeep };')();
const t0 = 10e6;
check(M.multiFightNow({ now: t0, hitAt: t0 - 2000 }) === true, 'rotation: hit 2 s ago = fighting');
check(M.multiFightNow({ now: t0, hitAt: 0, targetAlive: true, targetInside: false, swinging: false }) === false, 'REPORT 4: a selected live monster OUTSIDE the area that I do not hit is no fight (it froze the rotation)');
check(M.multiFightNow({ now: t0, hitAt: 0, targetAlive: true, targetInside: true }) === true, 'a live target inside the area = fighting');
check(M.multiFightNow({ now: t0, hitAt: 0, targetAlive: true, swinging: true }) === true, 'a target I swing at (just outside) = fighting');
check(M.multiFightNow({ now: t0, hitAt: t0 - 1000, fightSince: t0 - M.MULTI.staleMs, lastKillAt: t0 - M.MULTI.staleMs - 1 }) === false, 'REPORT 3/4: hit for 5 min with no kill (a ranged monster from outside) = no fight, the rotation goes on');
check(M.multiFightNow({ now: t0, hitAt: t0 - 1000, fightSince: t0 - M.MULTI.staleMs, lastKillAt: t0 - 60000 }) === true, 'a long fight WITH kills stays a fight');
check(M.multiBlockKeep('skipped (bad)', { auto: false }) === '', 'REPORT 4: the player\'s own areas are never taken out of the rotation by our own skip marks');
check(M.multiBlockKeep('skipped (bad)', { auto: true }) === 'skipped (bad)', 'an automatic pool keeps the skip');
check(/^occupied/.test(M.multiBlockKeep('occupied by players', { auto: false })), 'occupied by other players still blocks');
check(M.multiBlockKeep('', { auto: false }) === '', 'free stays free');
// replay of report 4: 3 chosen areas, now area 2, 0 here; areas 1 + 3 had been marked 'skipped (bad)' by the rotation itself
const A = (k, n, x, blocked) => ({ key: 'area:' + k, name: 'area ' + n, n, x, y: 0, floor: null, spawns: 12, respawnSec: 60, blocked });
const before = [A('f1', 1, 0, 'skipped (bad)'), A('f2', 2, 3000, ''), A('f3', 3, 6000, 'skipped (bad)')];
const st = { 'area:f2': { visitedAt: t0 - 900000, emptySince: t0 - 600000, kills: [] } };
const dOld = M.multiDecide({ now: t0, cur: 'area:f2', targets: before, st, live: 0, fighting: false, order: 'nearest' });
check(dOld.action === 'stay', 'replay (old marks kept): "no other chosen one is free" - stuck in the empty area (the reported state)');
const after = before.map(x => Object.assign({}, x, { blocked: M.multiBlockKeep(x.blocked, { auto: false }) }));
const dNew = M.multiDecide({ now: t0, cur: 'area:f2', targets: after, st, live: 0, fighting: false, order: 'nearest' });
check(dNew.action === 'move' && /area:f[13]/.test(dNew.to), 'REPORT 4 fixed: 10 min empty -> moves on to area 1 / 3');
const dFight = M.multiDecide({ now: t0, cur: 'area:f2', targets: after, st: { 'area:f2': { visitedAt: t0 - 900000, emptySince: 0, kills: [] } }, live: 0,
  fighting: M.multiFightNow({ now: t0, hitAt: 0, targetAlive: true, targetInside: false }), order: 'nearest' });
check(dFight.action !== 'stay' || dFight.why !== 'fighting', 'a target outside the area no longer makes the rotation say "fighting"');
const auto = [A('a1', 1, 0, 'skipped (bad)'), A('a2', 2, 3000, ''), A('a3', 3, 6000, 'occupied by players')], stA = { 'area:a2': { visitedAt: t0 - 900000, emptySince: t0 - 600000, kills: [] } };
check(M.multiDecide({ now: t0, cur: 'area:a2', targets: auto, st: stA, live: 0, fighting: false, order: 'nearest', auto: true }).action === 'repick', 'automatic pool, everything else taken + empty 10 min -> repick another place');
check(M.multiDecide({ now: t0, cur: 'area:a2', targets: auto, st: { 'area:a2': { emptySince: t0 - 60000 } }, live: 0, fighting: false, order: 'nearest', auto: true }).action !== 'repick', '... not before staleMs');
check(M.multiDecide({ now: t0, cur: 'area:a2', targets: auto, st: stA, live: 0, fighting: false, order: 'nearest' }).action === 'stay', 'the player\'s own choice with everything occupied: stays (the player decides)');

// ---- C) wiring ----------------------------------------------------------------------------------------------------------------
const fnBody = (startRe, len) => { const m = src.search(startRe); return m < 0 ? '' : src.slice(m, m + (len || 6000)); };
const sdi = src.indexOf('let lastDefend = 0, nohitStepAt = 0'), sdj = src.indexOf('}, 1500);', sdi), SD = sdi > 0 && sdj > sdi ? src.slice(sdi, sdj) : '';
check(!!SD, 'self-defence interval found');
check(/defendKeep\(\{ sameTarget: same/.test(SD), 'self-defence asks defendKeep (no endless "my target + combat on" return)');
check(!/if \(Target && Target\.objId === mob\.objId && \(IsInCombat \|\| Me\.IsAttacking\)\) return;/.test(SD), 'the old endless return is gone from self-defence');
check(/defendHow\(\{ stopped: stopCalmStopped\(\)/.test(SD) && /how === 'script'/.test(SD) && /srvAttack\(mob\.objId\)/.test(SD), 'self-defence of a non-hunting window: defendHow -> script attack on THIS monster');
check(/combatSquare\(STOPCALM\.tightSquare/.test(SD), 'skills OFF + stopped: tight square around the monster');
check(/nohitStepDist\(nohitSteps\.n\+\+/.test(SD), 'stalemate step uses nohitStepDist');
const HP = fnBody(/App\.on\('swarm\.attacked', \(event\) => \{\s*\n\s*const d = event\.data;/, 9000);
check(/defendHow\(\{ stopped: stopCalmStopped\(\)/.test(HP), 'helping a teammate: a stopped party hits only that monster');
const G = src.slice(src.indexOf('// STOPCALM-PURE-END'), src.indexOf('let lastDefend = 0'));
check(/stopCalmDecide\(\{ stopped: stopCalmStopped\(\), busy: stopCalmBusy\(\)/.test(G) && /stopCombatG\(\)/.test(G) && /\}, 1000\);/.test(G), 'the stop guard runs every second and switches L2Swarm combat off');
check(/inRaid\(\)/.test(G) && /questRun\.active/.test(G) && /state\.portPrep/.test(G) && /raidclear/.test(G), 'the guard leaves raids / quests / teleport holds alone');
const AL = fnBody(/async function autoLevelLoop\(solo\)/, 60000);
check(/const lvlStopNow = \(\) => !!autoLvl\.stop/.test(AL), 'autolevel: lvlStopNow');
check((AL.match(/lvlStopNow\)/g) || []).length >= 5, 'autolevel: every walk of the loop ends on Stop (walkTo / walkDirect / leadTeamWalk get lvlStopNow)');
check(/if \(lvlStopNow\(\)\) break;\s*\/\/[^\n]*\n\s*if \(!IsEnabled\) EnableBot\(\);\s*\n\s*if \(!IsInCombat\) startCombatG\(\);/.test(AL), 'autolevel: a Stop during a wait never switches combat back on');
const ST = fnBody(/case '!stop':/, 2500);
check(/Send\.StopMove\(\)/.test(ST) && /memberRouteStop\(\)/.test(ST) && /stopCombatG\(\)/.test(ST) && /takeControl\('!stop'/.test(ST), '!stop: walk ends now (StopMove + member route), combat off, control taken');
const W = fnBody(/THE WATCH \(every 3 s\)/, 2500);
check(/takeControl\('run switch OFF', PRIO\.ORDER\)/.test(W) && /Send\.StopMove\(\)/.test(W), 'run switch OFF on the dashboard (no !stop): the watch also ends the running walk');
const MT = fnBody(/function multiTick\(spot, solo\)/, 5000);
check(/multiFightNow\(\{/.test(MT), 'multiTick: fighting = multiFightNow');
check(!/if \(!fighting && Target && Target\.objId && !Target\.IsDead && mobById\(Target\.objId\)\) fighting = true;/.test(MT), 'multiTick: the old "any live target = fighting" is gone');
check(/if \(sel\.auto && !ts\.seenAt/.test(MT), 'multiTick: the 12 h no-experience mark only for automatic pools');
check(/d\.action === 'repick'/.test(MT), 'multiTick: repick handled');
const MTG = fnBody(/function multiTargets\(sel\)/, 3000);
check((MTG.match(/multiBlockKeep\(spotBlock\(/g) || []).length === 2, 'multiTargets: areas + rooms use multiBlockKeep');
const PC = fnBody(/async function pullCycle\(spot\)/, 4000);
check(/!interrupted\(gen\) && !autoLvl\.stop\)/.test(PC), 'pull routes: the fight after a pull ends on Stop');

console.log(`\n${n - fails}/${n} checks passed`);
process.exit(fails ? 1 : 0);
