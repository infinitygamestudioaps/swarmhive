// OFFLINE TEST of the hunting pairs vs travel rules (PAIRSGATE, bug 2026-10-09 17:55 party Tank3 '!town giran': the leader held
// 'before .giran: fighting first (Destroyer9)' while every member kept reporting 'pair Destroyer9+Nuker11: Singing Wind', 'pair Nuker8+
// Nuker9: back toward Tank3' — the pairs kept pulling new monsters, and all day the 1.5 s pairs tick switched the pairs back ON
// in the middle of autolevel '.giran' holds: 05:32:26, 06:09:22, 14:52:53, 15:12:37 ...).
// Runs the PAIRSGATE-PURE block (+ TEAMJOIN-PURE for townHoldPlan) of Scripts_dev/swarm.js in node:
//   node docs/plan/tools/test_pairs_travel.js      (exit code 1 when a check fails)
const fs = require('fs'), path = require('path');
const SRC = path.join(__dirname, '..', '..', '..', 'Scripts_dev', 'swarm.js');
const src = fs.readFileSync(SRC, 'utf8');
const block = (name) => { const a = src.indexOf(`// ${name}-BEGIN`), b = src.indexOf(`// ${name}-END`); if (a < 0 || b < a) { console.error(`${name} block not found`); process.exit(1); } return src.slice(a, b); };
const P = new Function(block('PAIRSGATE-PURE') + '\nreturn { PAIRSGATE, pairsTravelGate, holdRealFight, holdHitBlockers, pairKeepTargetOnTravel };')();
const TJ = new Function(block('TEAMJOIN-PURE') + '\nreturn { TOWNHOLD, townHoldPlan };')();
let fails = 0, n = 0;
const check = (ok, what) => { n++; console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails++; };
const T = 50000000, S = 1000;

// ---- 1) the gate: pairs only while the leader hunts at a spot, never during / right after a travel ---------------------------------
let g = P.pairsTravelGate({ now: T, huntAt: T - 1 * S, travelAt: T - 60 * S, travelOn: false, inTown: false, atSpot: true });
check(g.ok, 'hunting at the spot, last travel ended a minute ago: pairs allowed');
g = P.pairsTravelGate({ now: T, huntAt: T - 1 * S, travelAt: T - 60 * S, travelOn: true, travelWhy: 'before .giran', inTown: false, atSpot: true });
check(!g.ok && /team travel \(before \.giran\)/.test(g.why), `a hold runs: OFF (${g.why})`);
g = P.pairsTravelGate({ now: T, huntAt: T - 30 * S, travelAt: T - 5 * S, travelOn: false, inTown: false, atSpot: true });
check(!g.ok && /after travel/.test(g.why), `travel ended 5 s ago, last hunt step before it: still OFF (${g.why})`);
g = P.pairsTravelGate({ now: T, huntAt: T - 1 * S, travelAt: T - 5 * S, travelOn: false, inTown: true, atSpot: false });
check(!g.ok && /town/.test(g.why), 'in Giran after the port: OFF');
g = P.pairsTravelGate({ now: T, huntAt: T - 1 * S, travelAt: T - 5 * S, travelOn: false, inTown: false, atSpot: false });
check(!g.ok && /not at the hunting spot/.test(g.why), 'hunt step after the travel but far from the spot (landing): OFF');
g = P.pairsTravelGate({ now: T, huntAt: T - 1 * S, travelAt: T - 5 * S, travelOn: false, inTown: false, atSpot: true });
check(g.ok, 'hunting at the spot again after the travel: ON allowed');
g = P.pairsTravelGate({ now: T, huntAt: T - 200 * S, travelAt: T - 900 * S, travelOn: false, inTown: false, atSpot: true });
check(!g.ok, 'no hunt step for 200 s (the loop is stuck elsewhere): OFF');
g = P.pairsTravelGate({ now: T, huntAt: 0, travelAt: 0, travelOn: false, inTown: false });
check(!g.ok, 'never hunted since the (re)start: OFF');

// ---- 2) real fights in a hold: hits count, fresh pulls never -------------------------------------------------------------------
const F = (o) => P.holdRealFight(Object.assign({ hitAgo: 1e12, hpDropAgo: 1e12, helpingNearAgo: 1e12, stance: false }, o));
check(!F({ stance: true }), 'leader attacking / in combat stance without being hit: NOT a fight (was: "fighting first (me)" for minutes)');
check(F({ hitAgo: 2 * S }), 'hit 2 s ago: a fight');
check(F({ hpDropAgo: 3 * S }), 'HP dropped 3 s ago: a fight');
check(F({ stance: true, hitAgo: 10 * S }), 'combat stance 10 s after a hit: still a fight (.town would be refused)');
check(!F({ stance: true, hitAgo: 20 * S }), 'combat stance 20 s after the last hit: not a fight any more');
check(F({ helpingNearAgo: 1 * S }), 'defending a teammate next to me: a fight');
const mem = (name, o) => Object.assign({ name, at: T - 1 * S, dead: false, same: true }, o);
let b = P.holdHitBlockers([mem('Destroyer9', { fight: true, hit: false }), mem('Nuker8', { fight: true, hit: false }), mem('Nuker10', { fight: false, hit: false })], T);
check(b.length === 0, 'pair members ATTACKING freshly pulled monsters (fight, not hit): nobody blocks the port');
b = P.holdHitBlockers([mem('Destroyer9', { fight: true, hit: true }), mem('Nuker8', { fight: true, hit: false })], T);
check(b.join() === 'Destroyer9', 'Destroyer9 really hit: only he blocks (helped first)');
b = P.holdHitBlockers([mem('Old', { fight: true })], T);
check(b.join() === 'Old', 'a window without the new "hit" field: falls back to "fight"');
b = P.holdHitBlockers([mem('Far', { hit: true, same: false }), mem('Stale', { hit: true, at: T - 20 * S }), mem('Dead', { hit: true, dead: true })], T);
check(b.length === 0, 'another area / stale report / dead: never blocks');

// ---- 3) members drop new pair monsters, finish the ones on us -------------------------------------------------------------------
check(!P.pairKeepTargetOnTravel({ targetId: 7, hitsMe: false, hitsMate: false }), 'pair monster not hitting anyone yet: dropped');
check(P.pairKeepTargetOnTravel({ targetId: 7, hitsMe: true }), 'pair monster hitting me: finished');
check(P.pairKeepTargetOnTravel({ targetId: 7, hitsMate: true }), 'pair monster hitting a teammate: finished');
check(!P.pairKeepTargetOnTravel({ targetId: 0, hitsMe: true }), 'no target: nothing to keep');

// ---- 4) REPLAY 2026-10-09 (party Tank3, '.giran' hold): leader ticks every 1.5 s --------------------------------------------
// Old behaviour: pairs stayed ON into the hold, a busy flag flipped them OFF ~2 min in and the next tick ON again (05:31:46 OFF -> 05:32:26 ON),
// members pulled a new monster every ~20 s -> fight flag always on. New: OFF at the hold start, no ON before hunting at a spot again.
{
  const gate = { travelAt: 0, travelDepth: 0, huntAt: 0, why: '' };
  let on = true, switches = [];
  const tick = (t, o) => {
    const r = P.pairsTravelGate({ now: t, huntAt: gate.huntAt, travelAt: gate.travelAt, travelOn: gate.travelDepth > 0, travelWhy: gate.why, inTown: !!o.town, atSpot: o.atSpot });
    if (r.ok !== on) { on = r.ok; switches.push(`${Math.round((t - T) / 1000)}s ${on ? 'ON' : 'OFF'} ${r.why}`); }
  };
  // hunting at Windy Hill: stamps every 1.5 s
  for (let t = T - 60 * S; t < T; t += 1500) { gate.huntAt = t; tick(t, { atSpot: true }); }
  check(on, 'replay: pairs ON while hunting at Windy Hill');
  // 0 s: '!town giran' -> leadGoGiran (travel) -> townCommand -> hold (travel)
  gate.travelAt = T; gate.travelDepth = 2; gate.why = 'before .giran'; on = false; switches.push('0s OFF pairsTravelStop (immediate)');
  let ports = null, fightMs = 0, last = 0;
  for (let t = T; t < T + 20 * 60 * S; t += 1500) {
    tick(t, { atSpot: true });                                         // the autolevel loop is awaiting the hold: no hunt stamps
    // members: no new pulls after the stop; the monsters that were already on Destroyer9 die within ~25 s
    const team = [mem('Destroyer9', { at: t - S, fight: t - T < 40 * S, hit: t - T < 25 * S }), mem('Nuker8', { at: t - S, fight: false, hit: false })];
    const fighting = P.holdHitBlockers(team, t).length > 0;
    if (fighting && last) fightMs += Math.min(5000, t - last); last = t;
    const tp = TJ.townHoldPlan({ t: t - T, fightMs, fighting, far: 0 });
    if (tp.act === 'port') { ports = t - T; break; }
  }
  check(ports !== null && ports <= TJ.TOWNHOLD.gatherMs + 2 * S, `replay: the leader ports after ${ports / 1000} s (75 s rule, the real fight on Destroyer9 was helped first)`);
  check(switches.filter(s => / ON /.test(s)).length === 0, `replay: no pairs ON during the hold (${switches.join(' | ')})`);
  // landed in Giran (in town), regroup + supply, then the trip to the next spot (travel), landing, walking in
  gate.travelDepth = 1; gate.why = 'trip to Abandoned Camp';
  for (let t = T + 80 * S; t < T + 200 * S; t += 1500) tick(t, { town: t < T + 150 * S, atSpot: false });
  gate.travelDepth = 0; gate.travelAt = T + 200 * S;
  tick(T + 201 * S, { atSpot: true });
  check(!on, 'replay: trip over, but no hunt step yet: still OFF');
  gate.huntAt = T + 203 * S; tick(T + 203 * S, { atSpot: true });
  check(on, `replay: hunting at the new spot -> pairs ON again (${switches[switches.length - 1]})`);
  // the OLD way for comparison: a pull every 20 s by a pair keeps someone "fighting" all the time (fight flag), only the 2-min fight cap ends it
  let oldPort = null; fightMs = 0; last = 0;
  for (let t = T; t < T + 20 * 60 * S; t += 1500) {
    const pulling = true;                                              // pairs ON in the hold: a fresh pull keeps 'fight' set
    const fighting = P.holdHitBlockers([mem('Destroyer9', { at: t - S, fight: pulling })], t).length > 0;   // old windows: no 'hit' field
    if (fighting && last) fightMs += Math.min(5000, t - last); last = t;
    if (TJ.townHoldPlan({ t: t - T, fightMs, fighting, far: 0 }).act === 'port') { oldPort = t - T; break; }
  }
  check(oldPort !== null && oldPort > ports, `(old behaviour for comparison: port only after ${oldPort / 1000} s of "fighting first")`);
}

// ---- 5) wiring in the host code -------------------------------------------------------------------------------------------------
const has = (re, what) => check(re.test(src), `wiring: ${what}`);
has(/function pairsDecide[\s\S]{0,1600}pairsTravelGate\(/, 'pairsDecide asks the travel gate');
has(/teamRegroupBeforePort\(what, destTown\) \{[\s\S]{0,300}pairsTravel\(`before \$\{what\}`/, 'every teleport hold is a travel (pairs OFF at its start)');
has(/pairsTravel\(`regroup in \$\{CONFIG\.lead\.hub\}`/, 'the Giran regroup (!town / !level / left behind) is a travel');
has(/async function travelToSpot\(spot\) \{[\s\S]{0,200}pairsTravel\(/, 'a leveling trip is a travel');
has(/async function gatherTeam\(why\) \{[\s\S]{0,200}pairsTravel\(/, 'a gather is a travel');
has(/async function townCommand\(why, wantTown\) \{\s*\n\s*if \(isLeader\(\)\) pairsTravelStop/, '.town by the leader stops the pairs');
has(/level < PRIO\.LEVEL && name !== 'leveling'\) \{ try \{ pairsTravelStop\(name\)/, 'any order / regroup above leveling (takeControl) stops the pairs');
has(/leadRunBusy = true; try \{ pairsTravelStop\('supply run'\)/, 'the supply run stops the pairs');
has(/pairsTravelStop\(`mission \$\{kind\}`\)/, 'a mission stops the pairs');
has(/pairsTravelStop\('raid hunt'\)/, 'the raid hunt stops the pairs');
has(/pairsGate\.huntAt = now\(\)/, 'the autolevel hunting step stamps huntAt');
has(/if \(d\.travel && myPair\.on\) \{[\s\S]{0,500}pairKeepTargetOnTravel/, 'members leave the pair at once and drop a monster not on us');
has(/hit: !!\(\(now\(\) - lastAttackerOnMe\.at < 6000 && !lastAttackerOnMe\.for\)/, 'swarm.pos reports "hit" (really hit)');
has(/const fighters = \(\) => \{[\s\S]{0,200}holdHitBlockers\(/, 'the hold counts only hit teammates');
has(/const meFighting = \(\) => holdRealFight\(/, 'the hold counts my fight only when hit');
check(!/new Map\(\)/.test(block('PAIRSGATE-PURE')), 'no new Map() in the block');

console.log(`\n${n - fails}/${n} checks passed`);
process.exit(fails ? 1 : 0);
