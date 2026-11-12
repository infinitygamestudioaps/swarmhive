// FOGENTRY-2026-11-12 guard (hunting.md FOGENTRY, owner: "fix the trip to FOG for final ... should not be that hard").
// 2026-11-12 03:29-05:30 Destroyer3's party: the leader walked from the Goddard landing with the live path finder, his line went down into the pool
// UNDER the bridge (water zone 25_14_water1), the members copied it ("in water before point 12 (drowning)"), four stayed behind in Goddard
// ("no way from here to Top level") and the rest died at 172700,-115000,-4100. Now ONE locked dry route (routes/dungeons/forge.json, made by
// fog_entry_route.js) is the way in for the team, a member going back, and a team standing in the pool.
// Reads files only (never the game).
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'Scripts_dev/swarm.js'), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok  ' + m); } else { fail++; console.log('  FAIL ' + m); } };
const between = (a, b) => { const i = SRC.indexOf(a); if (i < 0) return ''; const j = SRC.indexOf(b, i + a.length); return SRC.slice(i, j < 0 ? i + 8000 : j); };

// 1) the route file itself
const R = JSON.parse(fs.readFileSync(path.join(ROOT, 'Scripts/data/routes/dungeons/forge.json'), 'utf8'));
const DR = JSON.parse(fs.readFileSync(path.join(ROOT, 'Scripts/data/dungeon_rooms.json'), 'utf8'));
const D = (Array.isArray(DR) ? DR : DR.dungeons).find(d => d.key === 'forge');
const F0 = D.floors[0], landing = F0.enter.from, entry = F0.entryPoint.at, safe = (F0.safeSpots || []).find(s => s.id === 'forge-1-safe-start');
const pts = R.points;
ok(R.manual === true && R.use === 'custom' && R.key === 'forge', 'the FoG entry route is locked (manual) and chosen (use custom), key forge');
ok(R.start && R.start.kind === 'gk' && /Goddard/.test(R.start.from) && /Forge of the Gods/.test(R.start.desc), 'it starts with the Goddard gatekeeper -> Forge of the Gods');
ok(Math.hypot(pts[0].x - landing[0], pts[0].y - landing[1]) < 100, 'its first point is the gatekeeper landing');
ok(Math.hypot(pts[pts.length - 1].x - entry[0], pts[pts.length - 1].y - entry[1]) < 300, 'its last point is the Top-level entry point (inside the room graph)');
let W = null; try { W = require('./water_zones'); W.load(); } catch (e) { W = null; }
ok(!!W, 'water zones load');
ok(W && pts.every(p => !W.zoneAt(p.x, p.y, p.z)), 'DRY: no point lies in a water zone (the pool under the bridge)');
let maxLeg = 0, maxDz = 0; for (let i = 1; i < pts.length; i++) { maxLeg = Math.max(maxLeg, Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)); maxDz = Math.max(maxDz, Math.abs(pts[i].z - pts[i - 1].z)); }
ok(maxLeg <= 300, `short legs (max ${Math.round(maxLeg)} <= 300): nobody cuts a corner off the bridge`);
ok(maxDz <= 400, `no ledge drop (max height step ${Math.round(maxDz)} <= 400)`);
ok(pts.every(p => !p.drop && !p.swim), 'no point is marked drop / swim');
ok(safe && pts.some(p => Math.hypot(p.x - safe.x, p.y - safe.y) < 300 && Math.abs(p.z - safe.z) < 200), 'it passes the owner\'s safe spot "start of the way in, before the bridge"');
ok(pts.some(p => Math.hypot(p.x - 173608, p.y - -115592) < 300) && pts.some(p => Math.hypot(p.x - 173080, p.y - -116328) < 300), 'it crosses the bridge (173080,-116328 -> 173608,-115592)');
ok(Array.isArray(R.traps) && R.traps.some(t => t.name === '25_14_water1'), 'the pool under the bridge is recorded as a trap');

// 2) the pure block
const blk = between('// FOGENTRY-PURE-BEGIN', '// FOGENTRY-PURE-END');
ok(blk.length > 0, 'FOGENTRY-PURE block exists');
const M = new Function(blk + '\nreturn { entryRouteLeadsIn, entryRouteTrapAt, entryRouteApproachAt };')();
// FOGAPPROACH-2026-11-12 (live 06:02Z): the leader west of the bridge at 172872,-115272,-3408 counted as "inside" and the room graph led into the pool
ok(M.entryRouteApproachAt(R, { x: 172872, y: -115272, z: -3408 }, landing) === true, 'replay 06:02Z: standing west of the bridge = on the way in (the rest of the locked route, not the room graph)');
ok(M.entryRouteApproachAt(R, { x: landing[0] + 300, y: landing[1], z: landing[2] }, landing) === true, 'at the landing = on the way in');
ok(M.entryRouteApproachAt(R, { x: entry[0], y: entry[1], z: entry[2] }, landing) === false, 'at the end (the Top-level entry point) = inside, the room graph takes over');
const rooms1 = F0.rooms || [];
ok(rooms1.length > 0 && rooms1.every(r => !M.entryRouteApproachAt(R, { x: r.center[0], y: r.center[1], z: r.center[2] }, landing)), 'no Top-level room counts as "on the way in" (hunting there is never sent back onto the route)');
ok(M.entryRouteApproachAt(R, { x: 178490, y: -112971, z: -5838 }, landing) === false, 'the Lower-level target room is not on the way in');
ok(M.entryRouteLeadsIn(R, landing) === true, 'the FoG route leads PAST the landing into the dungeon');
ok(M.entryRouteLeadsIn(Object.assign({}, R, { points: [pts[0], { x: landing[0] + 200, y: landing[1], z: landing[2] }] }), landing) === false, 'a route that ends at the landing (Imperial Tomb style: ends at the door) is not an inside route');
ok(M.entryRouteLeadsIn(Object.assign({}, R, { manual: false }), landing) === false, 'an unlocked route is never forced');
ok(M.entryRouteLeadsIn(Object.assign({}, R, { use: 'atlas' }), landing) === false, 'the owner\'s "computed path" choice wins over the locked route');
const deaths = [[172700, -115000, -4100], [172952, -115384, -4158], [173048, -114600, -4150], [172264, -115432, -4050], [173224, -115864, -4158]];
ok(deaths.every(p => !!M.entryRouteTrapAt(R, { x: p[0], y: p[1], z: p[2] })), 'every 2026-11-12 stuck / death spot is inside the trap');
ok(!M.entryRouteTrapAt(R, { x: 173080, y: -116328, z: -3448 }) && !M.entryRouteTrapAt(R, { x: 173608, y: -115592, z: -3768 }), 'the bridge above the pool is not the trap');
// "on the route" needs the height: the pool spots are NOT on the route (they take it from the start)
const onRoute = (me) => !M.entryRouteTrapAt(R, me) && pts.some((p, k) => k > 0 && Math.hypot(p.x - me.x, p.y - me.y) < 1500 && Math.abs(p.z - me.z) < 250);
ok(pts.slice(1).every(p => onRoute(p)), 'every point of the route itself counts as "on the route"');
ok(deaths.every(p => !onRoute({ x: p[0], y: p[1], z: p[2] })), 'a character in the pool is NOT "on the route" (height) - it goes back to the landing first');

// 3) the wiring in swarm.js
const det = between('async function dungeonEntryTrip(d, er)', '\n}\n');
ok(/const onRoute = !entryRouteTrapAt\(er, \{ x: Me\.X, y: Me\.Y, z: Me\.Z \}\) && pts\.some\([^\n]*Math\.abs\(p\.z - Me\.Z\) < 250/.test(det), 'dungeonEntryTrip: on the route = not in its trap, near a point AND at its height');
ok(/Math\.abs\(first\.z - Me\.Z\) > 1000/.test(det), 'dungeonEntryTrip: far below the start (the pool) = to the start by gatekeeper first');
const er = between('async function enterRoom(spot)', 'async function ');
const iTrap = er.indexOf('trap = er && entryRouteTrapAt(er, me0)'), iGraph = er.indexOf('const graph = rgHas(d)');
ok(iTrap > 0 && iTrap < iGraph, 'enterRoom: a team standing in the trap takes the locked route from its start BEFORE the room walk');
const iApp = er.indexOf('entryRouteApproachAt(er, me0, fr0)');
ok(iApp > iTrap && iApp < iGraph, 'enterRoom: a team on the way in (west of the bridge) walks the rest of the locked route BEFORE the room walk');
ok(/!entryRouteApproachAt\(er, me, F0/.test(between('async function memberEntryRouteBack(to)', '\nfunction backTripEmit(')), 'a member on the way in walks the locked route too (never the room planner through the pool)');
const iIn = er.indexOf('const erIn = i === 0 ? entryRouteInside(d, fr)'), iFar = er.indexOf('WALK-IN DUNGEON, far away');
ok(iIn > 0 && iIn < iFar && /if \(erIn\) \{[\s\S]{0,260}continue;/.test(er), 'enterRoom: the locked inside route is THE way in (from far or near) and nobody walks back to the landing after it');
const rt = between('async function rgRoomTrip(d, target, r, label)', '\n}\n');
const iRt = rt.indexOf('entryRouteInside(d, F0'), iGeo = rt.indexOf('on the geodata: ${P(Me.X');
ok(iRt > 0 && iRt < iGeo, 'rgRoomTrip walk-in: the locked route, never the live path finder (its line went into the pool)');
const ne = between('async function npcEnterDungeon(dName, k)', '\n}\n');
ok(/entryRouteInside\(d, E\.enter && E\.enter\.from\)/.test(ne) && ne.indexOf('entryRouteInside') < ne.indexOf('DUNGEON ENTRY ROUTES 2026-10-12'), 'npcEnterDungeon: the locked route first, no walk back to the landing');
const mr = between('async function memberReturnTrip(why)', '\n}\n');
ok(mr.indexOf('memberEntryRouteBack(to)') > 0 && mr.indexOf('memberEntryRouteBack(to)') < mr.indexOf('rescuePlan('), 'a member going back to a team inside FoG uses the locked route (rescuePlan said "no way from here to Top level")');
const mb = between('async function memberEntryRouteBack(to)', '\nfunction backTripEmit(');
ok(/townCommand\(/.test(mb) && /gkTeleport\(\{ text: dest \}/.test(mb) && /walkDirect\(p\.x, p\.y, p\.z/.test(mb) && /rgWalk\(d, L/.test(mb), 'the member way back: .goddard -> gatekeeper -> every route point -> room by room to the leader');

console.log(`\ntest_fog_entry: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
