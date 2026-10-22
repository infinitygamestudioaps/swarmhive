// OFFLINE TEST of KEEPHUNT-2026-10-21 (owner: "if I send them to farm ... no limit and keep hunting they should KEEP hunting"; "rebuff at a safe
// spot 1 hour before buffs run out, then straight back"). Runs the KEEPHUNT-PURE block of Scripts_dev/swarm.js in node + checks the hooks.
//   node docs/plan/tools/test_keephunt.js       (exit code 1 when a check fails)
'use strict';
const fs = require('fs'), path = require('path');
const SRC = fs.readFileSync(process.env.SWARM_JS || path.join(__dirname, '..', '..', '..', 'Scripts_dev', 'swarm.js'), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (c) pass++; else fail++; };
const a = SRC.indexOf('// KEEPHUNT-PURE-START'), b = SRC.indexOf('// KEEPHUNT-PURE-END');
ok(a > 0 && b > a, 'the KEEPHUNT-PURE block exists');
const K = new Function('num', SRC.slice(a, b) + '\nreturn { KEEPHUNT, khHunting, khClaimHunting, khYield, khWalkChange, khDeathPlan, khRouteEnd };')((v) => Number(v) || 0);
const T = 10_000_000;

console.log('1) hunting + yield');
ok(K.khHunting([T - 60000], T) === true, 'a kill 1 min ago = hunting');
ok(K.khHunting([T - 11 * 60000], T) === false, 'the last kill 11 min ago = not hunting');
ok(K.khHunting([], T, { keepHunt: true }) === true, 'a no-limit hunt timer counts as hunting');
ok(K.khClaimHunting({ hunt: T - 120000 }, T) === true && K.khClaimHunting({ hunt: 0 }, T) === false && K.khClaimHunting(null, T) === false, 'a claim carries its hunting flag (hunt = last kill)');
ok(K.khYield({ meHunting: true, themHunting: false, mySince: T, theirSince: T - 999999, me: 'Tank1', them: 'Destroyer3' }) === false, 'Tank1 hunting, Destroyer3 arrives with an OLDER claim: Tank1 never yields (the 2026-10-21 16:08 case)');
ok(K.khYield({ meHunting: false, themHunting: true, mySince: T - 999999, theirSince: T, me: 'Destroyer3', them: 'Tank1' }) === true, 'the arriving party yields to the hunting one, whatever the claim age');
ok(K.khYield({ meHunting: true, themHunting: true, mySince: T, theirSince: T - 5, me: 'A', them: 'B' }) === false, 'both hunting: nobody leaves on its own');
ok(K.khYield({ meHunting: false, themHunting: false, mySince: T, theirSince: T - 5, me: 'A', them: 'B' }) === true && K.khYield({ meHunting: false, themHunting: false, mySince: T - 5, theirSince: T, me: 'A', them: 'B' }) === false, 'nobody hunting: the old first-claim-wins rule');

console.log('2) deaths');
ok(K.khDeathPlan({ hunting: true, alive: 5 }) === 'keep', 'a member died while the team hunts: the team keeps hunting (the dead walks back)');
ok(K.khDeathPlan({ hunting: true, alive: 0 }) === 'return', 'the whole team died: straight back to the same spot');
ok(K.khDeathPlan({ hunting: false, alive: 3 }) === 'old', 'not hunting: unchanged behaviour');

console.log('3) spot changes');
ok(K.khWalkChange({ x: 113480, y: 16328, z: 928, dungeon: 'Tower of Insolence' }, { x: 115176, y: 16024, z: 928, dungeon: 'Tower of Insolence' }) === true, 'the next room on the same ToI floor: walk (no Giran)');
ok(K.khWalkChange({ x: 147448, y: 25816, z: -2016, dungeon: null }, { x: 115176, y: 16024, z: 928, dungeon: 'Tower of Insolence' }) === false, 'Aden town -> a ToI room: not a walk');
ok(K.khWalkChange({ x: 0, y: 0, z: 0 }, { x: 9000, y: 9000, z: 200 }) === true && K.khWalkChange({ x: 0, y: 0, z: 0 }, { x: 20000, y: 0, z: 0 }) === false, 'outdoors: within 15k walks, farther does not');
ok(K.khWalkChange({ x: 0, y: 0, z: 0, dungeon: 'A' }, { x: 100, y: 0, z: 0, dungeon: 'B' }) === false, 'another dungeon: not a walk');

console.log('4) the end of a route');
ok(K.khRouteEnd(8, 10, 5000, 0) === true && K.khRouteEnd(9, 10, 5000, 0) === true, 'the last 2 points of a route = the destination');
ok(K.khRouteEnd(3, 10, 1200, 50) === true, 'within 1500 of the last point on its floor = the destination');
ok(K.khRouteEnd(3, 10, 1200, 900) === false, 'within 1500 but another floor: not yet');
ok(K.khRouteEnd(3, 10, 4000, 0) === false, 'the middle of a hallway: not the destination (MTFIX run-on stays)');

console.log('5) hooks in swarm.js');
const has = (re, m) => ok(re.test(SRC), m);
has(/hunt: khMeHunting\(\) \? khLastKill\(\) : 0/, 'claims carry the hunting flag');
has(/khYield\(\{ meHunting: khMeHunting\(\), themHunting: khClaimHunting\(c, now\(\)\)/, 'rivalClaim decides with khYield');
has(/if \(occ && khMeHunting\(\)\)[\s\S]{0,400}we keep hunting here/, "the 'occupied' check only notes while the party hunts");
has(/leftBehind\.size && khMeHunting\(\)\)[\s\S]{0,800}khAskReturn\(who/, 'autolevel: left behind while hunting = they come back on their own (no Giran)');
has(/if \(khMeHunting\(\)\) \{ khAskReturn\(who, 'not with the team'\); leftBehind\.clear\(\); return; \}/, 'the split watchdog never takes a hunting team to Giran');
has(/khMeHunting\(\) && far\.some\(m => m\.dead \|\| m\.d > 15000\)\)/, "gatherTeam: no 'team split' Giran regroup while hunting");
has(/App\.on\('swarm\.khreturn'[\s\S]{0,900}memberReturnTrip\(/, 'members answer the return request with their own return trip');
has(/const khHub = [\s\S]{0,700}supplyDue\(lastSupplyAtGet\(\), now\(\)\) && pautoOn\('supplyWatch'\)/, 'travel: the Giran regroup only when a supply run is due (party switch respected)');
has(/if \(khHub && leadMode\(\)/, 'the hub regroup is gated by khHub');
has(/b === 'fight'\) \{ if \(khEnd\(j\)\) \{ L\.khArrived = true; break; \}/, 'route walk: a fight at the destination = arrived');
has(/!\(L\.khEnd && L\.khEnd\(L\.gate\)\)/, 'MTFIX run-on never at the destination');
has(/re-planning from here to the destination/, 'a stuck leg on the destination floor re-plans from here');

console.log('6) safe-spot rebuff (owner add-on)');
has(/d\.bl = khBoardLeftSec\(\)/, 'every window reports its board-buff time left (swarm.pos bl)');
has(/function khRebuffCfg\(\)[\s\S]{0,300}server_options\.json[\s\S]{0,500}let on = true, min = 60|let on = true, min = 60[\s\S]{0,300}server_options\.json/, 'setting safeRebuff in server_options.json, missing = ON at 60 min');
has(/buffDue = cfg\.on && left >= 0 && left < cfg\.minLeftMin \* 60[\s\S]{0,900}if \(!buffDue\) return false;/, 'only below the threshold (DPCOV-2026-10-21: buffDue; a DP trip may start without it)');
has(/khSafePoint\(1200, avoid\)/, 'a safe spot = no live monster within 1200 on this floor');
has(/App\.emit\('swarm\.khrebuff'[\s\S]{0,600}waitOutOfCombat\(45000, 3000\)/, 'the leader calls the team, rebuffs after the out-of-combat wait');
has(/tries < 2 \? 'trying another safe spot' : 'falling back to the normal rebuff rotation'/, 'board refused: one more safe spot, then the old rotation (said in party chat)');
has(/straight back to where we hunted \(never a town\)/, 'then straight back to the spot (never a town)');
has(/autoLvl\.khRbChkAt[\s\S]{0,200}khSafeRebuffMaybe\(solo\)/, 'the autolevel loop checks every 60 s');
// pure check of the safe point finder (stubbed host)
{
  const i0 = SRC.indexOf('function khSafePoint('), i1 = SRC.indexOf('\n}\n', i0) + 2;
  const mk = (mobs, me) => new Function('snapMobs', 'safeSpot', 'Me', 'num', SRC.slice(i0, i1) + '\nreturn khSafePoint;')(() => mobs, () => null, me, (v) => Number(v) || 0);
  const me = { X: 0, Y: 0, Z: 0 };
  ok(mk([], me)(1200).here === true, 'no monster near: rebuff right here');
  const p = mk([{ X: 300, Y: 0, Z: 0, IsDead: false }], me)(1200);
  ok(p && !p.here && Math.hypot(p.x - 300, p.y) > 1200, `a monster 300 away: a point clear of it (${p && Math.round(Math.hypot(p.x - 300, p.y))} from it)`);
  ok(mk([{ X: 300, Y: 0, Z: 2000, IsDead: false }], me)(1200).here === true, 'a monster on another floor does not count');
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
