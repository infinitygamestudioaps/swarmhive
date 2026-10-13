// OFFLINE TEST: Forge of the Gods hunting from the Goddard landing (public tester 2026-10-13 20:40: "Still can't reach FoG farming zones -
// after the teleport to the entrance of Forge of the Gods (Goddard gatekeeper), the bot teleports back to Giran: 'no path to farming zone'").
//   node docs/plan/tools/test_fog_reach.js [--quick]      (exit code 1 when a check fails; --quick = 6 rooms on the geodata instead of all 29)
// Runs Scripts_dev/swarm.js blocks in node on the REAL data (dungeon_rooms.json, dungeon_graph/forge.json, the nav atlas room files,
// custom_zones.json + the public example, Geodata):
//   1) the route zone "Forge of the Gods (route 74-80)" is hunted as the dungeon's rooms (zoneDungeonOf), no other zone changes
//   2) which rooms the leveling may pick (roomTripWhy + the Hall of Flames stone rule): all 29 Top-level rooms, never Lower level / Hall of Flames
//   3) the landing on the geodata: walk-in point + every offered room reachable with the bots' path finder (geopath.js), arrival on the right floor (3D)
//   4) the old failure reproduced: the landing sits in the Hall of Flames height band -> rgLocate put it there -> "no walkable way"; now rgGraphNear
//      says "not inside" and the plan starts outside
//   5) rgRoomTrip / rgWalk (host code, mocks + real geodata for the walk-in) from the landing into a Top-level room
//   6) pickRoom / zoneSpot (host code, stubs) for team levels 74-79: a reachable Top-level room; with Top-level rooms skipped: nothing (no landing hunt)
//   7) no Giran loop: failures at the landing ban the room only, the zone after FOGREACH.landFailMax; atLandingNow skips the Giran regroup (source)
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const QUICK = process.argv.includes('--quick');
const src = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
const cut = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i + 1); if (i < 0 || j < i) throw new Error('block not found: ' + a); return src.slice(i, j); };
const num = (v) => typeof v === 'bigint' ? Number(v) : (Number(v) || 0);
const rd = (f) => JSON.parse(fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, ''));
let fails = 0, n = 0;
const check = (ok, what) => { n++; console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails++; };

const RGP = cut('// ROOMGRAPH-PURE-BEGIN', '// ROOMGRAPH-PURE-END');
const FRP = cut('// FOGREACH-PURE-BEGIN', '// FOGREACH-PURE-END');
const ESC = cut('// ESCPURE-BEGIN', '// ESCPURE-END');
const NEEDS = cut('const DUNGEON_GK = ', 'const DUNGEON_KEY_ITEMS');
const NEEDFN = cut('function roomNeedsWhy(d, r) {', 'const roomNeedsSaid');
const NORM = cut('function dungeonNormalize(d) {', 'const DLAZY');
const M = new Function('num', RGP + '\n' + FRP + '\nreturn { rgBuild, rgPlan, rgLocate, rgRoomVertex, rgProgress, rgPlanPoints, rgZf, FOGREACH, zoneDungeonOf, roomTripWhy, spotAtLanding, landFailDecide, rgGraphNear, fogWaysIn };')(num);
const EP = new Function(ESC + '\nreturn { dzFloor };')();
let held = [];
const NZ = new Function('dungeonKeysHeld', 'teamNames', 'livePos', 'now', NEEDS + '\n' + NEEDFN + '\n' + NORM + '\nreturn { DUNGEON_NEEDS, roomNeedsWhy, dungeonNormalize };')(() => held, () => [], {}, () => Date.now());

const DATA = path.join(ROOT, 'Scripts', 'data');
const D0 = rd(path.join(DATA, 'dungeon_rooms.json')).map(d => NZ.dungeonNormalize(d));
const fogRaw = D0.find(d => d.key === 'forge');
const G = rd(path.join(DATA, 'dungeon_graph', 'forge.json'));
const FOG = Object.assign({}, fogRaw, { floors: fogRaw.floors.map((F, i) => Object.assign({}, F, { graph: G.floors[i] && G.floors[i].graph })) });
const RG = M.rgBuild(FOG);
const LAND = { x: 169018, y: -116303, z: -2432 };
const atlasRoom = (id) => { try { return rd(path.join(DATA, 'nav_atlas', 't', `room_${id}.json`)); } catch (e) { return null; } };
const TOP = FOG.floors[0].rooms, LOW = FOG.floors[1].rooms, HOF = FOG.floors[2].rooms;

// ---- 1) the route zone -> the dungeon's rooms ---------------------------------------------------------------------------------------------
console.log('-- 1) route zone');
const zones = rd(path.join(DATA, 'custom_zones.json'));
let example = []; try { example = rd(path.join(ROOT, 'release', 'package', 'Scripts', 'data', 'custom_zones.example.json')); } catch (e) { }
const fogZones = zones.concat(example).filter(z => /forge of the gods/i.test(z.name || ''));
check(fogZones.length >= 1 && fogZones.every(z => M.zoneDungeonOf(D0, z) === fogRaw.name), `every FoG route zone (${fogZones.length}, owner + public example) = the rooms of "${fogRaw.name}"`);
const other = zones.concat(example).filter(z => !/forge of the gods/i.test(z.name || '') && M.zoneDungeonOf(D0, z));
check(other.length === 0, `no other zone is turned into a dungeon (${other.map(z => z.name).join(', ') || 'none'})`);
check(M.zoneDungeonOf(D0, Object.assign({}, fogZones[0], { rooms: 'Cruma Tower' })) === '' && M.zoneDungeonOf(D0, Object.assign({}, fogZones[0], { poly: [{ x: 1, y: 1 }] })) === '', 'a zone with rooms / a drawn area keeps its own way');
{ const fr = rd(path.join(DATA, 'field_areas.json')), m = fr.zones && fr.zones['169018,-116303'];
  check(!!m && !m.region && !(m.areaIds || []).length, 'field_areas.json has no FoG region (zones["169018,-116303"]: region null, no areas) = the old landing-square hunt'); }
{ const S = rd(path.join(DATA, 'spawns_h5.json')); const L = Array.isArray(S) ? S : (S.spawns || []);
  const nearLanding = L.filter(s => Math.abs(s.x - LAND.x) <= 4500 && Math.abs(s.y - LAND.y) <= 4500 && /Destruction|Stakato|Lavasillisk|Ifrit|Beetle|Scorpion/.test(s.name)).length;
  check(nearLanding === 0, `no FoG monster inside the old 9000 hunting square around the landing (${nearLanding}) — the cause of "nothing to hunt"`); }

// ---- 2) which rooms the leveling may pick --------------------------------------------------------------------------------------------------
console.log('-- 2) rooms offered');
const floorOf = (r) => FOG.floors.find(F => (F.rooms || []).includes(r));
const why = (r) => M.roomTripWhy(atlasRoom(r.id), { maxRoomWalk: M.FOGREACH.maxRoomWalk, walkIn: (floorOf(r).enter || {}).how === 'walk', deep: FOG.floors.indexOf(floorOf(r)) > 0 }) || NZ.roomNeedsWhy(Object.assign({}, FOG, { entryNeeds: NZ.DUNGEON_NEEDS['forge of the gods'] }), r);
const topOk = TOP.filter(r => !why(r));
check(topOk.length === TOP.length, `all ${TOP.length} Top-level rooms are offered (${TOP.filter(r => why(r)).map(r => r.id + ': ' + why(r)).join('; ') || 'none refused'})`);
check(LOW.every(r => why(r)), `no Lower-level room is offered (${LOW.length}): "${why(LOW[0])}"`);
check(HOF.every(r => why(r)), `no Hall of Flames room is offered (${HOF.length}): "${why(HOF[0])}"` + ' (its floor is a teleporter floor: the stone rule decides)');
{ const d2 = Object.assign({}, FOG, { entryNeeds: NZ.DUNGEON_NEEDS['forge of the gods'] }); held = [];
  check(/Vacualite Floating Stone/.test(NZ.roomNeedsWhy(d2, HOF[0])) && !NZ.roomNeedsWhy(d2, TOP[0]), 'Hall of Flames rooms need the Vacualite Floating Stone 7267 (Klein), Top-level rooms need nothing');
  held = [7267]; check(!NZ.roomNeedsWhy(d2, HOF[0]), 'with the stone in a bag the Hall of Flames rule lets it through'); held = []; }
check(M.roomTripWhy(null, {}) === '' && M.roomTripWhy({ status: 'ok', length: 12430 }, { maxRoomWalk: 60000 }) === '', 'no atlas entry / an ok route = offered (unchanged behaviour)');
check(/km walk/.test(M.roomTripWhy({ status: 'ok', length: 72430, from: '.goddard' }, { maxRoomWalk: 60000, walkIn: true, deep: true })) && M.roomTripWhy({ status: 'ok', length: 72430 }, { maxRoomWalk: 60000, walkIn: true, deep: false }) === '' && M.roomTripWhy({ status: 'ok', length: 72430 }, { maxRoomWalk: 60000 }) === '', 'longer than maxRoomWalk refuses only a deeper floor entered on foot (FoG Lower level after a re-plan), with the length in plain words; first floors / stairs floors stay');
check(/blocked/.test(M.roomTripWhy({ status: 'blocked', why: ['door 1 closed'] }, {})) && M.roomTripWhy({ status: 'unverified', why: ['link not on the live menu'] }, { walkIn: true }) === '' && M.roomTripWhy({ status: 'conditional' }, {}) === '', 'blocked = refused; unverified only for a missing geodata walk (a live-menu link alone is fine); conditional = fine');
check(M.roomTripWhy({ status: 'unverified', why: ['walk not on the geodata from 1,2 (gave up)'] }, { walkIn: false }) === '' && !!M.roomTripWhy({ status: 'unverified', why: ['walk not on the geodata from 1,2 (gave up)'] }, { walkIn: true }), 'a missing geodata walk refuses only rooms on floors entered on foot from outside (stairs / teleporter floors: the room graph walk decides)');
{ const R = rd(path.join(DATA, 'nav_atlas', 'room.json')).routes; let other = 0; const list = [];
  rd(path.join(DATA, 'dungeon_rooms.json')).forEach(d => d.key !== 'forge' && (d.floors || []).forEach(F => (F.rooms || []).forEach(r => { if (M.roomTripWhy(R['room:' + r.id], { walkIn: (F.enter || {}).how === 'walk', deep: d.floors.indexOf(F) > 0 })) { other++; if (list.length < 4) list.push(d.key + ':' + r.id); } })));
  console.log(`     (other dungeons: ${other} rooms are no longer offered for the same reason, fx ${list.join(', ')})`); }

// ---- 3) the geodata: landing -> walk-in point -> rooms (bots' path finder) -------------------------------------------------------------
console.log('-- 3) geodata');
const geo = require('./geopath');
const enter = M.rgPlan(RG, { start: 'outside' }, { room: TOP[0].id }).steps[0];
check(enter && enter.do === 'enter' && enter.floor === 0, `the room graph's way in to the Top level: ${enter && enter.x},${enter && enter.y},${enter && enter.z}`);
{ const r = geo.findPath(LAND, { x: enter.x, y: enter.y, z: enter.z }, { maxLeg: 1000, maxMs: 15000 });
  const last = r.points && r.points[r.points.length - 1];
  check(r.ok && r.lengthUnits < 25000 && last && Math.abs(last.z - enter.z) < 300, `landing -> walk-in point on the geodata (the geopath service): ${r.ok ? r.lengthUnits + ' units, ' + r.points.length + ' waypoints, ends at z ' + (last && last.z) : 'NO PATH ' + r.reason}`); }
const EP0 = { x: enter.x, y: enter.y, z: enter.z };
let geoOk = 0, worst = 0, legsAll = 0; const bad = [];
for (const r of TOP) {
  const c = { x: r.center[0], y: r.center[1], z: r.center[2] }, F = FOG.floors[0];
  const inBand = c.z >= F.z[0] && c.z <= F.z[1] && (!r.zRange || (c.z >= r.zRange[0] - 50 && c.z <= r.zRange[1] + 50));
  const p = M.rgPlan(RG, EP0, { room: r.id }), pts = p.ok ? M.rgPlanPoints(p) : [];
  let prev = EP0, blocked = 0, len = 0; for (const q of (QUICK ? pts : pts)) { if (!geo.lineClear(prev, q)) blocked++; len += Math.hypot(q.x - prev.x, q.y - prev.y); prev = q; }
  const last = pts[pts.length - 1], onFloor = last && Math.abs(last.z - c.z) < 300 && Math.hypot(last.x - c.x, last.y - c.y) < 600 && pts.every(q => q.z >= F.z[0] - 300 && q.z <= F.z[1] + 300);
  legsAll += pts.length;
  const ok = inBand && p.ok && !blocked && onFloor;
  if (ok) { geoOk++; worst = Math.max(worst, Math.round(len)); } else bad.push(`${r.id} (${!inBand ? 'centre off its floor band' : !p.ok ? p.why : blocked ? blocked + ' legs through a wall' : 'ends off the room / floor'})`);
}
check(geoOk === TOP.length, `${geoOk}/${TOP.length} offered Top-level rooms: walk-in point -> room by room on the graph, ${legsAll} legs all wall-free on the geodata, every point on the Top-level band, arrival in the room (3D); longest ${worst} units${bad.length ? ' — ' + bad.join('; ') : ''}`);
{ const sample = TOP.slice().sort((a, b) => (a.routeLength || 0) - (b.routeLength || 0)).slice(0, QUICK ? 3 : 8); let ok = 0;
  for (const r of sample) { const p = geo.findPath(LAND, { x: r.center[0], y: r.center[1], z: r.center[2] }, { maxLeg: 1000, maxMs: 15000 }); const l = p.points && p.points[p.points.length - 1]; if (p.ok && l && Math.abs(l.z - r.center[2]) < 300) ok++; }
  console.log(`     (info: ${ok}/${sample.length} nearest Top-level rooms also found straight from the landing by geopath.js within the service's 15 s budget — not the bots' way in, which is the walk-in point + the room graph above; the budget depends on the PC load)`); }
check(11543 + worst <= M.FOGREACH.maxRoomWalk, `walk-in (~11.5k) + the longest room-by-room walk (${worst}) is within maxRoomWalk ${M.FOGREACH.maxRoomWalk}`);
{ const lowPt = { x: 180260, y: -111913, z: -5851 };   // the datapack 'Forge of the Gods - Lower Level' landing
  const p = geo.findPath(LAND, lowPt, { maxLeg: 1000, maxMs: 15000 });
  check(!p.ok || p.lengthUnits > M.FOGREACH.maxRoomWalk, `the Lower level is out of reach for a hunting trip: ${p.ok ? p.lengthUnits + ' units' : 'NO PATH (' + p.reason + ')'} (geopath_fast with drops 2026-10-13: 59-64 km incl. falls of 680-1,400 = fall damage)`); }

// ---- 4) the old failure: the landing in the Hall of Flames band --------------------------------------------------------------------------
console.log('-- 4) old failure');
{ const w = EP.dzFloor(D0, LAND.x, LAND.y, LAND.z);
  check(!!(w && w.d && w.d.key === 'forge' && w.fi === 2), `the landing counts as "inside FoG, ${w && w.f ? w.f.name : '?'}" by bbox + height (the normalized bbox holds the entrance, z -2432 is within 300 of the Hall of Flames band)`);
  const old = M.rgPlan(RG, LAND, { room: TOP[0].id });
  check(!old.ok && /Hall of Flames/.test(old.why), `the old plan from the landing: "${old.why}" = the tester's "no path"`);
  check(!M.rgGraphNear(RG, LAND) && M.rgGraphNear(RG, { x: enter.x, y: enter.y, z: enter.z }), `rgGraphNear: the landing is NOT inside (nearest hallway ${Math.round((M.rgLocate(RG, LAND)[0] || {}).near)} away), the walk-in point is`);
  const nw = M.rgPlan(RG, { start: 'outside' }, { room: TOP[0].id });
  check(nw.ok, `planned from outside instead: ${nw.text}`); }

// ---- 5) rgRoomTrip / rgWalk host code from the landing --------------------------------------------------------------------------------------
console.log('-- 5) host trip');
const HOST = cut('// ===== ROOM GRAPH WALK (host side of ROOMGRAPH-PURE', "/** Leader: entrance -> floor teleporters -> the room's route.");
async function runTrip(start, room, opt) {
  const W = Object.assign({ log: [], walkTo: [], tps: [], walked: 0 }, opt || {});
  const me = { X: start.x, Y: start.y, Z: start.z, IsDead: false, Name: 'Tank1' };
  const state = { route: null, walkOnly: false }, CONFIG = { leader: 'Tank1' };
  const env = {
    num, Me: me, state, CONFIG, __DIR__: 'C:\\X', ESC: { on: false }, Options: { ActiveFollow: true, FollowName: '' }, IsCharacterReady: () => true, IsInCombat: false, Target: null, tradeState: null, inst: { on: false }, rest: { sitting: false }, resBusy: false, stuckFollow: { busy: false },
    File: { ReadAllText: () => { throw new Error('nf'); }, WriteAllText: () => { } }, fileStamp: () => '', dungeonRooms: () => D0, dzFloor: (Dx, x, y, z) => EP.dzFloor(Dx, x, y, z),
    floorLiveRead: () => ({}), floorLiveKey: (a, b) => a + '|' + b, rgBuild: M.rgBuild, rgPlan: M.rgPlan, rgRoomVertex: M.rgRoomVertex, rgPlanPoints: M.rgPlanPoints, rgProgress: M.rgProgress, rgLocate: M.rgLocate,
    rgGraphNear: M.rgGraphNear, rgGraphNearD: (d, p) => M.rgGraphNear(RG, p),
    isRaidBossMob: () => false, snapMobs: () => [], mobById: () => null, now: () => Date.now(), setTask: () => { }, intent: () => { }, intentDone: () => { }, dungeonLog: (m) => W.log.push(m), logError: (m, e) => W.log.push('ERR ' + m + ' ' + e),
    teamRegroupBeforePort: async () => true, teamNames: () => ['Tank1'], isLeader: () => true, App: { emit: () => { }, on: () => { } },
    sleep: async () => { }, P: (x, y, z) => `${Math.round(x)},${Math.round(y)},${Math.round(z)}`, waitForTeamHere: async () => true, partyMember: () => null, followHold: () => { }, followOk: (w) => w, nnMove: () => { }, standUp: () => { },
    control: { gen: 1 }, interrupted: () => false, autoLvl: { stop: false }, levelTripCancelled: () => false, gkFail: '', lastFloorNpc: null, setInterval: () => { },
    floorTeleport: async (F) => { W.tps.push(F.enter.npc.name); return false; },
    walkDirect: async (x, y, z) => { me.X = x; me.Y = y; me.Z = z; W.walked++; return true; },
    // walkTo = the geopath service walk: the REAL path finder; arrives only when it finds a way
    walkTo: async (x, y, z) => { W.walkTo.push([x, y, z, state.walkOnly]); const p = geo.findPath({ x: me.X, y: me.Y, z: me.Z }, { x, y, z }, { maxLeg: 1000, maxMs: 15000 }); if (!p.ok) return false; const l = p.points[p.points.length - 1]; me.X = l.x; me.Y = l.y; me.Z = l.z; return true; },
  };
  const names = Object.keys(env);
  const api = new Function(...names, HOST + '\nreturn { rgWalk, rgRoomTrip, rgHas, rgD };')(...names.map(k => env[k]));
  const res = await api.rgRoomTrip(FOG, FOG.floors[0], room, room.name);
  return { res, W, me, state };
}
(async () => {
  const room = TOP.slice().sort((a, b) => (a.routeLength || 0) - (b.routeLength || 0))[0];
  const t = await runTrip(LAND, room);
  const inRoom = Math.hypot(t.me.X - room.center[0], t.me.Y - room.center[1]) < 800 && Math.abs(t.me.Z - room.center[2]) < 300;
  check(t.res === true && inRoom, `rgRoomTrip from the landing -> ${room.id}: ${t.res} at ${Math.round(t.me.X)},${Math.round(t.me.Y)},${Math.round(t.me.Z)} (${t.W.walked} centreline waypoints)`);
  check(t.W.walkTo.length === 1 && Math.hypot(t.W.walkTo[0][0] - enter.x, t.W.walkTo[0][1] - enter.y) < 5 && t.W.walkTo[0][3] === true, 'the walk-in (onEnter) walked to the way in on the geodata with walkOnly set (no teleportNear / Giran)');
  check(!t.W.tps.length && t.W.log.some(l => /walk-in to .* done/.test(l)) && !t.W.log.some(l => /Hall of Flames/.test(l) && /no walkable/.test(l)), `no floor teleporter, no "no walkable way from Hall of Flames" (log: ${t.W.log.filter(l => /walk-in|route:/.test(l)).slice(0, 2).join(' | ')})`);
  // a Lower-level room is never walked in from outside (onEnter refuses floor 1): the trip fails with a plain reason, no 60 km walk
  const t2 = await runTrip(LAND, LOW[0]);
  check(t2.res === false && t2.W.walkTo.length === 0 && t2.W.log.some(l => /not entered on foot from outside/.test(l)), 'a Lower-level room: no walk-in attempt, a plain "not entered on foot from outside" line');

  // ---- 6) pickRoom / zoneSpot for team levels 74-79 ---------------------------------------------------------------------------------------
  console.log('-- 6) the leveling pick');
  const PICK = cut('function pickRoom(dName, lvl) {', 'const onFloorZ = ');
  const ZS = cut('function zoneSpot(z, level, why) {', '/** Why a zone/spot cannot be used now');
  const bad = {};
  const Dn = D0.map(d => d.key === 'forge' ? Object.assign({}, d, { entryNeeds: NZ.DUNGEON_NEEDS['forge of the gods'] }) : d);
  const env = {
    dungeonRooms: () => Dn, gkNorm: (s) => String(s || '').toLowerCase().trim(), livePos: {}, teamOf: () => 'Tank1', Me: { Name: 'Tank1', X: LAND.x, Y: LAND.y, Z: LAND.z }, now: () => Date.now(), autoLvl: { spot: null },
    roomNeedsWhy: (d, r) => NZ.roomNeedsWhy(d, r), roomNeedsNote: () => { }, roomTripWhyHost: (r, f, fi) => M.roomTripWhy(atlasRoom(r.id), { maxRoomWalk: M.FOGREACH.maxRoomWalk, walkIn: !!(f && f.enter && f.enter.how === 'walk'), deep: fi > 0 }), roomTripNote: () => { },
    spotBlock: (k) => bad[k] ? 'skipped (bad)' : '', roomPolyPts: (r) => r.poly ? r.poly.map(p => ({ x: p[0], y: p[1] })) : null, zoneDungeonOf: M.zoneDungeonOf,
    zoneAreaSpot: () => { throw new Error('zoneAreaSpot must not run for the FoG zone'); }, zoneSubAreas: () => { throw new Error('sub-areas must not run'); }, areaTaken: () => '', zoneShared: () => [], spotBad: () => false,
  };
  const names = Object.keys(env);
  const api = new Function(...names, PICK + '\n' + ZS + '\nreturn { pickRoom, roomSpot, zoneSpot };')(...names.map(k => env[k]));
  const z = fogZones[0];
  for (const lvl of [74, 76, 78, 79]) {
    const s = api.zoneSpot(z, lvl, []);
    check(!!(s && s.room && s.room.floor === 0 && TOP.some(r => r.id === s.room.id) && s.zoneName === z.name), `team lvl ${lvl}: "${z.name}" -> ${s ? s.name : 'nothing'} (a reachable Top-level room, never the landing square)`);
  }
  TOP.forEach(r => { bad['room:' + r.id] = 1; });
  const wy = []; const s0 = api.zoneSpot(z, 76, wy);
  check(s0 === null && /no reachable room/.test(wy[0] || ''), `every Top-level room skipped -> the zone is passed over ("${wy[0]}"), no Lower level / Hall of Flames / landing hunt`);
  TOP.forEach(r => { delete bad['room:' + r.id]; });

  // ---- 7) no Giran loop -----------------------------------------------------------------------------------------------------------------
  console.log('-- 7) no Giran loop');
  const atLand = (spot, me) => M.spotAtLanding(spot, me, D0, false);
  const sp1 = api.zoneSpot(z, 76, []);
  check(atLand(sp1, LAND) && !atLand(sp1, { x: 83400, y: 148600, z: -3400 }), 'spotAtLanding: true at the FoG landing, false in Giran');
  check(M.spotAtLanding({ area: { landing: { x: 1000, y: 1000, z: 0 } } }, { x: 1500, y: 1200, z: 50 }, D0, false) && !M.spotAtLanding({ area: { landing: { x: 1000, y: 1000, z: 0 } } }, { x: 9000, y: 1000, z: 0 }, D0, false), 'spotAtLanding for a field area: its landing (3000)');
  // the failure sequence the autolevel loop runs: room fails at the landing -> room skipped, zone kept -> next room from the landing
  let list = [], t0 = 1e9, giranTrips = 0, picks = [];
  for (let k = 0; k < 4; k++) {
    const s = api.zoneSpot(z, 76, []); if (!s) break;
    picks.push(s.room.id);
    const hubTrip = !atLand(s, LAND);                        // travelToSpot: the Giran regroup only when NOT at the way in (atLandingNow)
    if (hubTrip) giranTrips++;
    bad['room:' + s.room.id] = 1;                            // the trip failed: the room is skipped (autoLvl.bad[room key])
    const d = M.landFailDecide(list, t0 + k * 60000, z.name, 'room:' + s.room.id); list = d.list;
    if (d.banZone) { picks.push('ZONE BANNED after ' + d.n); break; }
  }
  check(giranTrips === 0 && picks.length === 4 && new Set(picks.slice(0, 3)).size === 3 && /ZONE BANNED after 3/.test(picks[3]), `3 failed rooms at the landing: ${picks.join(' -> ')}; Giran trips between them: ${giranTrips}`);
  { const d = M.landFailDecide([{ at: 0, zone: z.name, key: 'a' }, { at: 0, zone: z.name, key: 'b' }], M.FOGREACH.landFailMs + 1, z.name, 'c'); check(!d.banZone && d.n === 1, 'old landing failures (> landFailMs) are forgotten'); }
  // source: the guards really sit where the decisions are made
  check(/!sameFloorRoom && !atLandingNow && !viaGiran/.test(src) && /if \(gk && !inDun && !atLandingNow/.test(src), 'travelToSpot: no Giran regroup and no town / gatekeeper teleport while atLandingNow');
  check(/landFailDecide\(autoLvl\.landFails, now\(\), spot\.zoneName/.test(src) && /spot\.room && spot\.zoneName && !\(lfd && !lfd\.banZone\)/.test(src), 'autoLevelLoop: a failure at the way in bans only the room until landFailMax');
  check(/insideG = \(\) => inside\(\) && \(d\.isTown \|\| typeof rgGraphNear !== 'function' \|\| rgGraphNear\(RG, here\(\)\)\)/.test(src) && /if \(insideG\(\)\) continue;/.test(src), 'rgWalk: "inside" = height band AND near the floor\'s hallways');
  check(/allowNpc: true, onEnter, label/.test(src) && /w\.fi >= 0 && \(!graph \|\| rgGraphNearD\(d,/.test(src), 'rgRoomTrip walks in on the geodata (onEnter); enterRoom\'s inDun needs the hallways too');
  check(/const rs = roomSpot\(Object\.assign\(\{\}, z, \{ rooms: dn \}\), level\)/.test(src) && /roomTripWhyHost\(r, f, fi\); if \(tw\)/.test(src), 'zoneSpot uses zoneDungeonOf; pickRoom uses roomTripWhy');
  console.log(fails ? `${fails} of ${n} checks FAILED` : `all ${n} checks passed`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
