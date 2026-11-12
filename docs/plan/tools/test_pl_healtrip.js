// PLHEALTRIP-2026-11-11 guard (powerlevel.md R6, owner: "Why is there no healer behind inspector1?").
// Since 2026-11-05 the healer Healer1 stood OUTSIDE Cruma Tower (z -3696) while the leveler Inspector1 hunted in the floor-1 Excuro room (z -12080):
//  1) every minute "power level: Inspector1 is 2554 away - travelling to him" + "travel: stopped (your Stop) before leaving" - the healer's OWN
//     autoLvl.stop (set so it never levels) was read by travelToSpot as the owner's Stop;
//  2) the trip's spot was a plain point without its room, so the 11-05 trip landed at the Cruma gatekeeper and tried to WALK 8400 down.
// Reads Scripts_dev/swarm.js (never the game).
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'Scripts_dev/swarm.js'), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok  ' + m); } else { fail++; console.log('  FAIL ' + m); } };
const between = (a, b) => { const i = SRC.indexOf(a); if (i < 0) return ''; const j = SRC.indexOf(b, i + a.length); return SRC.slice(i, j < 0 ? i + 6000 : j); };

// the healer's travel branch
const trav = between('if (plHealerFar(d, Math.abs(num(lv.z) - Me.Z)))', 'if (PL.travel) return;');
ok(trav.length > 0, 'the healer travel branch exists');
const iClear = trav.indexOf('if (!autoLvl.active) autoLvl.stop = false'), iTrip = trav.indexOf('await travelToSpot(tsp)');
ok(iClear > 0 && iTrip > iClear, 'the healer\'s own leveling stop is cleared (only while its leveling is not running) BEFORE the trip starts');
ok(/plRoomSpot\(ps\)/.test(trav) && /tsp\.plHeal = true/.test(trav), 'the trip uses the pair\'s ROOM spot and is marked plHeal');

// travelToSpot: the stale check ignores the healer's own stop, never the owner's (run switch / lead pause)
const stale = (SRC.match(/const stale = \(where\) => \{[^\n]*/) || [''])[0];
ok(/autoLvl\.stop && !\(spot && spot\.plHeal\)/.test(stale), 'travelToSpot: a plHeal trip is not cancelled by the healer\'s own leveling stop');
ok(/leadPaused\(\)/.test(stale) && /!runOnOrCollector\(\)/.test(stale), 'travelToSpot: the owner\'s Stop (lead pause / run switch OFF) still ends every trip');

// plRoomSpot: the id in the real spot name resolves to a dungeon room
const fn = between('function plRoomSpot(ps)', 'function plHealerFar(');
ok(fn.length > 0, 'plRoomSpot exists');
const rx = (fn.match(/String\(ps\.name \|\| ''\)\.match\((\/.+\/i)\)/) || [])[1];
let re = null; try { re = rx ? eval(rx) : null; } catch (e) { re = null; }
ok(!!re, 'plRoomSpot has a room-id pattern');
const pl = JSON.parse(fs.readFileSync(path.join(ROOT, 'Scripts/data/powerlevel.json'), 'utf8'));
const dr = JSON.parse(fs.readFileSync(path.join(ROOT, 'Scripts/data/dungeon_rooms.json'), 'utf8'));
const D = Array.isArray(dr) ? dr : (dr.dungeons || []);
const ids = new Set(); for (const d of D) for (const f of (d.floors || [])) for (const r of (f.rooms || [])) ids.add(r.id);
const name = 'Cruma Tower 1st floor, left: Excuro room (cruma-1-left-b)';
const got = re ? (name.match(re) || [])[1] : '';
ok(got === 'cruma-1-left-b' && ids.has(got), 'the 11-05 pair spot name resolves to the Cruma floor-1 room cruma-1-left-b');
ok(re && !('Giran town square'.match(re)), 'a spot without a room id stays a plain spot');
for (const p of (pl.pairs || [])) if (p.spot && /\(([a-z0-9-]+)\)\s*$/i.test(p.spot.name || '')) {
  const id = (p.spot.name.match(re) || [])[1];
  ok(id && ids.has(id), `pair ${p.leveler}+${p.healer}: its spot room ${id} exists in dungeon_rooms.json`);
}

// PLOWNERSPOT-2026-11-11: the owner's newer dashboard choice beats the pair's stored spot; the healer follows where the leveler really hunts
{
  const body = between('function plOwnerSpotPick(e, pair)', '/** the leader writes') || between('function plOwnerSpotPick(e, pair)', 'function plPublishSpot(');
  const pick = new Function('num', body.slice(0, body.indexOf('/** the leveler writes')) + '\nreturn plOwnerSpotPick;')(Number);
  const pair = { changedAt: '2026-11-05T19:05:12.153Z' };
  const witch = { mode: 'manual', kind: 'rooms', spot: 'Catacomb of the Witch', at: '2026-11-11T16:18:11.784Z', dungeon: 'Catacomb of the Witch', roomId: 'witch-1-straight-a' };
  const r = pick(witch, pair);
  ok(r && r.roomId === 'witch-1-straight-a' && ids.has(r.roomId), 'the owner\'s 11-11 Catacomb of the Witch choice (after the 11-05 pair) wins, as its room');
  ok(pick(Object.assign({}, witch, { at: '2026-11-01T10:00:00Z' }), pair) === null, 'a choice OLDER than the pair keeps the pair\'s spot');
  ok(pick(Object.assign({}, witch, { mode: 'auto' }), pair) === null, 'an automatic (not manual) choice never beats the pair');
  const lev = between("if (m.role === 'leveler') {", '// the healer: never levels');
  ok(/const own = plOwnerSpot\(m\)/.test(lev) && /autoLvl\.forceSpot && autoLvl\.forceSpot\.pl\) \{ autoLvl\.forceSpot = null/.test(lev), 'the leveler drops the pair\'s forced spot when the owner chose a newer one');
  ok(/if \(!own && sp && /.test(lev), 'the pair\'s spot is only forced when the owner made no newer choice');
  ok(/plPublishSpot\(m, own\)/.test(lev), 'the leveler publishes where it really hunts');
  ok(/const lsp = plLevelerSpot\(m\.pair\.leveler\)/.test(trav) && /const ps = lsp \?/.test(trav), 'the healer travels to the leveler\'s published spot first');
  // Seven Signs: a catacomb room spot goes through travelToSpot, whose Seven Signs gate signs the traveller up for Dawn first
  const tts = between('async function travelToSpot(spot)', '\n}\n');
  ok(/ssSpotKindOf\(spot\)/.test(tts) && /ssGateTrip\(spot\.name, ssKind\)/.test(tts), 'every trip (also the healer\'s) to a catacomb passes the Seven Signs gate (Dawn sign-up first)');
}

console.log(`\ntest_pl_healtrip: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
