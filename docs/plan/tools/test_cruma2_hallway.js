// GUARD TEST (tester Vykaax 2026-11-10, #13: "a party stuck in that hallway top right 2nd floor" of Cruma Tower; requirement docs/requirements/walls.md R6):
// the room routes walk the hallway CENTRELINE of the room graph, never along its walls. The north-east hallway of floor 2 (Validus room -> Ossiud room
// left-b: y ~108500-108700 east, then the turn south at x ~23080-23280) was walked on y 108712 (the south wall) and x 23096 (the west wall of the turn).
//   node docs/plan/tools/test_cruma2_hallway.js   (exit 1 on a failure)
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const geo = require('./geopath');
const RRG = require('./room_routes_graph');
const rd = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/^﻿/, ''));
let fails = 0; const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails++; };

const C = rd('Scripts/data/dungeon_rooms.json').find(d => d.key === 'cruma'), F = C.floors[1];
const inHall = (p) => p[0] > 20800 && p[0] < 23400 && p[1] > 108400 && p[1] < 109340;      // the NE hallway (east run + the turn south)
const hallRooms = ['cruma-2-left-b', 'cruma-2-left-c', 'cruma-2-left-d', 'cruma-2-left-e', 'cruma-2-straight-d'];
// 1) the hallway path exists in the graph: floor entry -> Ossiud room (left-b) through the NE hallway
const M = RRG.planner(), D = RRG.withGraph(C), RG = M.rgBuild(D);
const lb = F.rooms.find(r => r.id === 'cruma-2-left-b');
const g = RRG.graphRoute(M, RG, D, 1, lb);
check(!!g.route && g.route.filter(inHall).length >= 8, `graph: floor entry -> left-b goes through the NE hallway (${g.route ? g.route.filter(inHall).length : 0} hallway points)`);
// 2) every room route through the hallway: in the middle (east run y 108560-108660, turn x 23140-23240), never on the old wall lines
hallRooms.forEach(id => {
  const r = F.rooms.find(x => x.id === id), h = (r.route || []).filter(inHall);
  const east = h.filter(p => p[0] < 23050), turn = h.filter(p => p[0] >= 23150 && p[1] > 108700);
  const midEast = east.every(p => p[1] >= 108540 && p[1] <= 108680), midTurn = turn.every(p => p[0] >= 23130 && p[0] <= 23250);
  const wall = h.some(p => p[1] === 108712 || p[0] === 23096);
  let maxLeg = 0, bad = 0; for (let i = 1; i < r.route.length; i++) { const a = r.route[i - 1], b = r.route[i]; maxLeg = Math.max(maxLeg, Math.hypot(b[0] - a[0], b[1] - a[1])); if (!geo.lineClear({ x: a[0], y: a[1], z: a[2] }, { x: b[0], y: b[1], z: b[2] })) bad++; }
  check(h.length >= 6 && midEast && midTurn && !wall && maxLeg <= 300 && bad === 0, `${id}: ${h.length} hallway points on the centreline (east run ${east.length}, turn ${turn.length}), max leg ${Math.round(maxLeg)}, through a wall ${bad}`);
});
// 3) the nav atlas room targets carry the same route (what a room trip walks)
hallRooms.forEach(id => {
  const T = rd(`Scripts/data/nav_atlas/t/room_${id}.json`), s = T.steps.find(x => x.do === 'walk' && x.how === 'dungeon-rooms'), r = F.rooms.find(x => x.id === id);
  check(!!s && s.points.length === r.route.length * 3 && s.points[s.points.length - 2] === r.route[r.route.length - 1][1], `nav atlas room:${id} walks the centreline route (${s ? s.points.length / 3 : 0} points)`);
});
// 4) no hallway waypoint inside an ACTIVE learned blocked spot (geo_blocked.json)
const gb = rd('Scripts/data/geo_blocked.json').points.filter(p => p.active && !p.disabled && p.z < -8800 && p.z > -9400);
const inBlock = []; hallRooms.forEach(id => F.rooms.find(x => x.id === id).route.filter(inHall).forEach(p => gb.forEach(b => { if (Math.hypot(b.x - p[0], b.y - p[1]) < (b.r || 150)) inBlock.push(id + '@' + p.join(',')); })));
check(!inBlock.length, 'no hallway waypoint inside an active learned blocked spot' + (inBlock.length ? ': ' + inBlock.slice(0, 3).join(' ') : ''));
console.log(fails ? `${fails} FAILED` : 'all ok');
process.exit(fails ? 1 : 0);
