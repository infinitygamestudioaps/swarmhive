// OFFLINE TEST of the room graph + centreline routing (user 2026-10-09: "go through each room one by one ... walk in the middle of these
// walkways ... routes always follow those centerlines, in points 150-300 units apart ... never a straight line").
//   node docs/plan/tools/test_room_graph.js      (exit code 1 when a check fails)
// Runs the ROOMGRAPH-PURE block (rgBuild / rgPlan / rgLocate / rgProgress) on the REAL data (Scripts/data/dungeon_rooms.json + the per-dungeon
// graphs Scripts/data/dungeon_graph/<key>.json), checks every waypoint leg against the geodata walls (geopath.lineClear), and runs the host
// side (rgWalk / rgFollowTick / memberRouteFollow) with mocks: walking, a floor teleporter, getting stuck + re-planning, state.route.
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const geo = require('./geopath');
const src = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
const cut = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i + 1); if (i < 0 || j < i) throw new Error('block not found: ' + a); return src.slice(i, j); };
const num = (v) => typeof v === 'bigint' ? Number(v) : (Number(v) || 0);
const PURE = cut('// ROOMGRAPH-PURE-BEGIN', '// ROOMGRAPH-PURE-END');
const ESC = cut('// ESCPURE-BEGIN', '// ESCPURE-END');
const FLP = cut('// FLOORLINK-PURE-BEGIN', '// FLOORLINK-PURE-END');
const M = new Function('num', PURE + '\nreturn { rgBuild, rgPlan, rgLocate, rgRoomVertex, rgProgress, rgPlanPoints, rgZf };')(num);
const rd = (f) => JSON.parse(fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, ''));
const D0 = rd(path.join(ROOT, 'Scripts', 'data', 'dungeon_rooms.json'));
const merged = (d) => { const f = path.join(ROOT, 'Scripts', 'data', 'dungeon_graph', d.key + '.json'); if (!fs.existsSync(f)) return d; const G = rd(f); return Object.assign({}, d, { floors: d.floors.map((F, i) => Object.assign({}, F, { graph: G.floors[i] && G.floors[i].graph })) }); };
const D = D0.map(merged);
let fails = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails++; };
const C = D.find(d => d.key === 'cruma'), RG = M.rgBuild(C);
const inPoly = (x, y, P) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b = P[j]; if (((a[1] > y) !== (b[1] > y)) && (x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0])) c = !c; } return c; };
const legsOk = (pts, from) => { let maxGap = 0, bad = 0; let prev = from; pts.forEach(p => { if (prev) { maxGap = Math.max(maxGap, Math.hypot(p.x - prev.x, p.y - prev.y)); if (!geo.lineClear(prev, p)) bad++; } prev = p; }); return { maxGap, bad }; };

// ---- 1) data --------------------------------------------------------------------------------------------------------------------
check(C.floors.every(F => F.graph && F.graph.v.length && F.graph.e.length), `Cruma: every floor has a graph (${C.floors.map(F => F.graph.v.length + 'v/' + F.graph.e.length + 'e').join(', ')})`);
check(!D0.some(d => d.floors.some(F => F.graph)), 'dungeon_rooms.json itself carries no graphs (only graphStats; graphs in dungeon_graph/<key>.json)');
{ let maxGap = 0; D.forEach(d => d.floors.forEach(F => { const g = F.graph; if (!g) return; g.e.forEach(e => { const P = [[g.v[e[0]][1], g.v[e[0]][2]]]; for (let i = 0; i < (e[4] || []).length; i += 3) P.push([e[4][i], e[4][i + 1]]); P.push([g.v[e[1]][1], g.v[e[1]][2]]); for (let i = 1; i < P.length; i++) maxGap = Math.max(maxGap, Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1])); }); }));
  check(maxGap <= 300, `every centreline waypoint leg in all ${D.length} dungeons is <= 300 units (max ${Math.round(maxGap)})`); }

// ---- 2) Cruma: outside -> 2nd floor left-b, room by room ----------------------------------------------------------------------------
let p = M.rgPlan(RG, { start: 'outside' }, { room: 'cruma-2-left-b' });
const kinds = p.steps.map(s => s.do + (s.npc ? ':' + s.npc.name : '')).join(' ');
check(p.ok && /^enter .*npc:Penelope/.test(kinds) && !/Ponti/.test(kinds), `outside -> cruma-2-left-b: in, walk to Penelope, Penelope -> 2nd floor, then the rooms (${p.text})`);
check(p.steps.some(s => s.kind === 'door') && p.steps[p.steps.length - 1].kind === 'room', 'the walk goes door by door and ends at the room centre');
{ const pts = M.rgPlanPoints(p, 1); const L = legsOk(pts); check(pts.length > 10 && L.maxGap <= 300 && L.bad === 0, `floor 2 part: ${pts.length} waypoints, max leg ${Math.round(L.maxGap)}, legs through a wall: ${L.bad}`); }
// ---- 3) the user's case 2026-10-09 09:10: members in the west corridor of floor 2 -> left-b along the TOP hallway (green line) -----------
const west = { x: 18700, y: 109300, z: -9050 };                 // the corridor stub where the members stood (3200 west of the leader at 21752,108712)
p = M.rgPlan(RG, west, { room: 'cruma-2-left-b' });
const W = M.rgPlanPoints(p);
const leftD = C.floors[1].rooms.find(r => r.id === 'cruma-2-left-d');
check(p.ok && W.length > 8, `west corridor -> left-b: ${W.length} waypoints (${p.text})`);
check(W.some(q => q.y < 108800 && q.x > 21000 && q.x < 23000), 'it runs east along the top hallway (y ~108600, x 21000-23000) like the green line');
check(!W.some(q => leftD && inPoly(q.x, q.y, leftD.poly)), 'it never cuts through the narrow monster room 2-left-d');
{ const L = legsOk(W, west); check(L.bad === 0, `every leg from the start is wall-free on the geodata (${L.bad} blocked, max leg ${Math.round(L.maxGap)})`); }
// ---- 4) floors 1 -> 2 -> 3 ----------------------------------------------------------------------------------------------------------
const r3 = C.floors[2].rooms[0];
p = M.rgPlan(RG, { x: 17847, y: 113962, z: -11680 }, { room: r3.id });
check(p.ok && /npc:Penelope.*npc:Hanna/.test(p.steps.map(s => s.do + (s.npc ? ':' + s.npc.name : '')).join(' ')), `floor 1 landing -> 3rd floor: Penelope, room by room across floor 2 to Hanna, Hanna -> 3rd floor (${p.text})`);
check(p.steps.filter(s => s.do === 'walk' && s.floor === 1).length >= 3, `floor 2 is crossed door by door (${p.steps.filter(s => s.floor === 1 && s.kind === 'door').length} doors)`);
check(/room \d+\/\d+ · step \d+\/\d+ · next: /.test(M.rgProgress(p, 3)), `progress line: "${M.rgProgress(p, 3)}"`);
// ---- 5) raid boss avoidance + locate ------------------------------------------------------------------------------------------------
{ const mid = W[Math.floor(W.length / 2)];
  const RGa = M.rgBuild(C, { avoid: [{ x: mid.x, y: mid.y, z: mid.z, r: 700 }] });
  const pa = M.rgPlan(RGa, west, { room: 'cruma-2-left-b' }), Wa = M.rgPlanPoints(pa);
  const near = Wa.some(q => Math.hypot(q.x - mid.x, q.y - mid.y) < 500);
  check(pa.ok && (!near || pa.avoided), `a raid boss on the hallway (${mid.x},${mid.y}): ${!near ? 'the route goes around it' : 'no other way: used and flagged avoided'} (${pa.text})`); }
{ const L = M.rgLocate(RG, { x: 18650, y: 109500, z: -9050 });
  check(L.length > 0 && L[0].near < 600, `a member behind a wall is put onto the nearest centreline point (${Math.round(L[0] && L[0].near)} away)`); }
// ---- 6) every dungeon: rooms reachable from the entry --------------------------------------------------------------------------------
{ const rep = []; D.forEach(d => { const R = M.rgBuild(d); let ok = 0, all = 0; d.floors.forEach(F => (F.rooms || []).forEach(r => { if (!r.poly || (r.polyInfo || {}).quality === 'duplicate') return; all++; if (M.rgPlan(R, { start: 'outside' }, { room: r.id }).ok) ok++; })); rep.push(`${d.key} ${ok}/${all}`); });
  console.log('     reachable from outside: ' + rep.join(', ')); }

// ---- 6b) Forgotten Temple (tester Vykaax 2026-10-27: "Dungeon mapping for Forgotten Temple"; cave_dungeon.js + cave_rooms.js + room_graph.js)
{ const FT = D.find(d => d.key === 'forgotten_temple');
  check(!!FT && FT.floors.length === 2 && FT.name === 'Forgotten Temple', `Forgotten Temple is a dungeon with 2 floors (${FT ? FT.floors.map(F => F.name + ' ' + F.z.join('..')).join(' | ') : 'missing'})`);
  if (FT) {
    const rooms = FT.floors.flatMap(F => F.rooms || []), hunt = rooms.filter(r => r.spawnCount > 0);
    check(rooms.length >= 30 && rooms.every(r => Array.isArray(r.poly) && r.poly.length >= 3 && Array.isArray(r.zRange)), `${rooms.length} rooms, every one with a geodata outline + z range`);
    check(hunt.length >= 25 && hunt.every(r => r.levelRange && r.levelRange[0] >= 27 && r.levelRange[1] <= 35 && r.monsters.every(m => m.level && m.aggressive)), `${hunt.length} rooms with monsters, levels 27-35, all aggressive (aggro_h5.json)`);
    const g = FT.gatekeeperRoute || {};
    check(g.town === 'Gludin' && g.destination === 'Forgotten Temple' && g.price === 2000 && FT.entrance && FT.entrance.x === -53001, 'way in: Gludin gatekeeper -> "Forgotten Temple" (2000), landing -53001,191425,-3568');
    check(rooms.every(r => Array.isArray(r.route) && r.route.length > 1 && r.routeLength > 0), 'every room has a walk route from the landing (pickRoom offers it)');
    check(FT.floors.every(F => F.graph && F.graph.v.length && F.graph.e.length) && FT.floors.every(F => (F.safeSpots || []).length), `room graph + safe spots on both floors (${FT.floors.map(F => (F.graph ? F.graph.v.length + 'v/' + F.graph.e.length + 'e' : 'no graph') + ', ' + (F.safeSpots || []).length + ' safe').join(' | ')})`);
    const R = M.rgBuild(FT); let ok = 0; const miss = []; rooms.forEach(r => { if (M.rgPlan(R, { start: 'outside' }, { room: r.id }).ok) ok++; else miss.push(r.id); });
    check(ok === rooms.length, `every room is reachable from outside through the graph (${ok}/${rooms.length}${miss.length ? ', missing ' + miss.join(' ') : ''})`);
    const land = { x: -53001, y: 191425, z: -3568 }, kob = rooms.find(r => /Kuran Kobold/.test(r.name) && r.center[2] < -4720), up = rooms.find(r => /Lafi Lizardman/.test(r.name) && r.center[2] > -4720);
    [kob, up].forEach(t => { if (!t) { check(false, 'kobold / lizardman room found'); return; }
      const p2 = M.rgPlan(R, land, { room: t.id }), pts = M.rgPlanPoints(p2), L = legsOk(pts, null);
      check(p2.ok && pts.length > 5 && L.bad === 0 && L.maxGap <= 300, `landing -> ${t.id} (${t.name}, floor ${t.center[2] < -4720 ? 'lower' : 'upper'}): ${pts.length} centreline points, legs through a wall ${L.bad}, max leg ${Math.round(L.maxGap)}`); });
  }
}
// ---- 7) host: rgWalk with mocks -----------------------------------------------------------------------------------------------------
const HOST = cut('// ===== ROOM GRAPH WALK (host side of ROOMGRAPH-PURE', "/** Leader: entrance -> floor teleporters -> the room's route.");
async function runWalk(start, target, opt) {
  const Wd = Object.assign({ log: [], intents: [], emits: [], tps: [], stuckAt: null, stuckLeft: 0, routes: [] }, opt || {});
  const me = { X: start.x, Y: start.y, Z: start.z, IsDead: false, Name: 'Tank1' };
  const state = { route: null }, CONFIG = { leader: 'Tank1' };
  const intervals = [];
  const env = {
    num, Me: me, state, CONFIG, __DIR__: 'C:\\X', ESC: { on: false }, Options: { ActiveFollow: true, FollowName: '' }, IsCharacterReady: () => true, IsInCombat: false, Target: null, tradeState: null, inst: { on: false }, rest: { sitting: false }, resBusy: false, stuckFollow: { busy: false },
    File: { ReadAllText: () => { throw new Error('nf'); }, WriteAllText: () => { } }, fileStamp: () => '', dungeonRooms: () => D0, dzFloor: (Dx, x, y, z) => EP.dzFloor(Dx, x, y, z),
    floorLiveRead: () => ({}), floorLiveKey: FL.floorLiveKey, rgBuild: M.rgBuild, rgPlan: M.rgPlan, rgRoomVertex: M.rgRoomVertex, rgPlanPoints: M.rgPlanPoints, rgProgress: M.rgProgress,
    isRaidBossMob: () => false, snapMobs: () => [], mobById: () => null, now: () => Date.now(), setTask: () => { }, intent: (a, b) => Wd.intents.push(b), dungeonLog: (m) => Wd.log.push(m), logError: (m, e) => Wd.log.push('ERR ' + m + ' ' + e),
    teamRegroupBeforePort: async () => true, teamNames: () => Wd.team || ['Tank1'], isLeader: () => true, App: { emit: (n, d) => Wd.emits.push([n, d]), on: () => { } },
    sleep: async () => { }, P: (x, y, z) => `${Math.round(x)},${Math.round(y)}`, waitForTeamHere: async () => true, partyMember: () => null, followHold: () => { }, followOk: (w) => w, nnMove: () => { }, standUp: () => { },
    control: { gen: 1 }, interrupted: () => false, autoLvl: { stop: false }, levelTripCancelled: () => false, gkFail: '', lastFloorNpc: null, setInterval: (f) => intervals.push(f),
    floorTeleport: async (F) => { Wd.tps.push(F.enter.npc.name); const L = (C.floors.find(x => x.name === F.name) || {}).entryPoint; if (L) { me.X = L.at[0]; me.Y = L.at[1]; me.Z = L.at[2]; } return true; },
    walkDirect: async (x, y, z) => { if (Wd.stuckLeft > 0 && Wd.stuckAt && Math.hypot(x - Wd.stuckAt.x, y - Wd.stuckAt.y) < 1) { Wd.stuckLeft--; return false; } Wd.routes.push(state.route ? JSON.parse(JSON.stringify(state.route)) : null); me.X = x; me.Y = y; me.Z = z; Wd.walked = (Wd.walked || 0) + 1; return true; },
  };
  const names = Object.keys(env);
  const api = new Function(...names, HOST + '\nreturn { rgWalk, rgWalkInside, rgFollowTick, rgHas, rgD };')(...names.map(k => env[k]));
  const res = await api.rgWalk(C, target, Object.assign({ team: !!Wd.team, allowNpc: true, label: 'test' }, Wd.o || {}));
  return { res, Wd, me, state, api };
}
const EP = new Function(ESC + '\nreturn { dzFloor };')();
const FL = new Function('num', FLP + '\nreturn { floorLiveKey };')(num);
(async () => {
  let r = await runWalk({ x: 17847, y: 113962, z: -11680 }, { room: 'cruma-2-left-b' });
  check(r.res.ok && r.Wd.tps.join() === 'Penelope' && Math.hypot(r.me.X - 23768, r.me.Y - 110184) < 400, `rgWalk floor 1 landing -> left-b: Penelope, then ${r.Wd.walked} centreline waypoints, ends in the room (${Math.round(r.me.X)},${Math.round(r.me.Y)})`);
  const rr = r.Wd.routes.filter(Boolean);
  check(rr.length > 5 && rr.every(x => x.pts.length <= 80 && x.i >= 0 && x.i < x.pts.length && x.target && x.dungeon === 'Cruma Tower'), 'state.route while walking: { pts (<= 80), i, target, dungeon, floor, ... }');
  check(r.state.route === null, 'state.route is cleared after the walk');
  // stuck at a waypoint twice -> re-plan from where I stand, still arrives
  const p2 = M.rgPlan(RG, west, { room: 'cruma-2-left-b' }), mid = M.rgPlanPoints(p2)[6];
  r = await runWalk(west, { room: 'cruma-2-left-b' }, { stuckAt: mid, stuckLeft: 2 });
  check(r.res.ok && r.Wd.log.some(l => /re-planning from here/.test(l)), `stuck before a waypoint (twice): re-planned onto the nearest hallway and arrived (${r.Wd.log.filter(l => /stuck/.test(l)).length} re-plans)`);
  check(r.Wd.routes.some(x => x && x.stuck === true && x.stuckSince && x.replans >= 1), 'state.route shows stuck + stuckSince + replans while re-planning');
  // leader with a team: the members get the route (swarm.roomroute) and the floor teleport (swarm.floortp)
  r = await runWalk({ x: 17847, y: 113962, z: -11680 }, { room: 'cruma-2-left-b' }, { team: ['Tank1', 'Bishop1', 'Necro1'] });
  const rrE = r.Wd.emits.find(e => e[0] === 'swarm.roomroute'), ftE = r.Wd.emits.find(e => e[0] === 'swarm.floortp');
  check(!!ftE && ftE[1].floor === 1 && !!rrE && rrE[1].floor === 1 && rrE[1].pts.length > 10, `team: swarm.floortp to floor 2 + swarm.roomroute with ${rrE ? rrE[1].pts.length : 0} centreline points for the members`);
  // walkToInner inside the dungeon: same floor -> the centreline (not a beeline)
  r = await runWalk({ x: 17847, y: 113962, z: -11680 }, { room: 'cruma-1-left-b' });
  check(r.res.ok && r.Wd.tps.length === 0 && r.Wd.walked > 10, `same floor (floor 1 landing -> 1-left-b): no teleport, ${r.Wd.walked} waypoints`);
  const iw = await (async () => { const x = await runWalk(west, { x: 23700, y: 110100, z: -9040 }); return x; })();
  check(iw.res.ok && iw.Wd.walked > 5, `to a point (not a room) on the same floor: ${iw.Wd.walked} waypoints`);
  console.log(fails ? `${fails} check(s) FAILED` : 'all checks passed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
