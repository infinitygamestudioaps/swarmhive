// ROOM ROUTES FROM THE ROOM GRAPH (tester Vykaax 2026-11-10, Discord #swarmhive #13: "One of the Cruma paths is not quite right. There's a party
// stuck in that hallway top right 2nd floor, and one of my groups got stuck there yesterday as well.")
//
// Root cause: the room routes in Scripts/data/dungeon_rooms.json (rooms[].route, made by room_refine.js with geopath legs <= 1000) were never
// redrawn after the room graph (room_graph.js: doors in the middle of each opening, hallway CENTRELINES cut into wall-checked legs <= 280).
// Cruma floor 2's north-east hallway (Validus room -> Ossiud room, the "top right" of the floor map) was walked along y 108712 = ON its south
// wall and down x 23096 = on the west wall of the turn; 20+ learned blocked spots (geo_blocked.json) and our own Spoiler6 party ("waiting for
// Healer6, stuck 96 s" at point 9/22) sat exactly on those points. nav_atlas.js copies these routes into its room targets (how 'dungeon-rooms'),
// so every room trip walked them.
//
// This tool redraws the room routes of the chosen dungeon floors from the room graph: floor entry (the route's first point) -> room centre with
// the ROOMGRAPH-PURE planner of Scripts_dev/swarm.js (rgBuild / rgPlan / rgPlanPoints = what rgWalk walks), every leg checked on the geodata
// (geopath.lineClear). A room whose graph route has a leg through a wall keeps its old route (reported). Writes:
//   Scripts/data/dungeon_rooms.json  through manual_guard.writeGuarded (rooms edited on the dashboard keep their shape fields)
//   Scripts/data/nav_atlas/room.json + t/room_<id>.json + index.json: the 'dungeon-rooms' walk step of those rooms (points, len) + length / sec
//   node docs/plan/tools/room_routes_graph.js --only cruma --floors 2 [--dry]
// Test: docs/plan/tools/test_cruma2_hallway.js
'use strict';
const fs = require('fs'), path = require('path');
const geo = require('./geopath');
const MG = require('./manual_guard');
const ROOT = path.join(__dirname, '..', '..', '..');
const DATA = path.join(ROOT, 'Scripts', 'data');
const FILE = path.join(DATA, 'dungeon_rooms.json');
const ATLAS = path.join(DATA, 'nav_atlas');
const argv = process.argv.slice(2), arg = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
const rd = (f) => JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, ''));
const plen = (pts) => { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]); return Math.round(L); };

/** the ROOMGRAPH-PURE planner of Scripts_dev/swarm.js (the same code the bots run) */
function planner() {
  const src = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
  const a = src.indexOf('// ROOMGRAPH-PURE-BEGIN'), b = src.indexOf('// ROOMGRAPH-PURE-END', a + 1);
  if (a < 0 || b < a) throw new Error('ROOMGRAPH-PURE block not found in Scripts_dev/swarm.js');
  const num = (v) => typeof v === 'bigint' ? Number(v) : (Number(v) || 0);
  return new Function('num', src.slice(a, b) + '\nreturn { rgBuild, rgPlan, rgPlanPoints };')(num);
}
/** a dungeon of dungeon_rooms.json with its floors' graphs (Scripts/data/dungeon_graph/<key>.json) */
function withGraph(d) {
  const f = path.join(DATA, 'dungeon_graph', d.key + '.json'); if (!fs.existsSync(f)) return null;
  const G = rd(f);
  return Object.assign({}, d, { floors: d.floors.map((F, i) => Object.assign({}, F, { graph: G.floors[i] && G.floors[i].graph })) });
}
/** the graph route of one room: [[x,y,z], ...] from the old route's first point (floor entry) to the room centre, or { why } */
function graphRoute(M, RG, d, fi, room) {
  const e = room.route && room.route[0]; if (!e) return { why: 'no old route (no floor entry point)' };
  const p = M.rgPlan(RG, { x: e[0], y: e[1], z: e[2] }, { room: room.id });
  if (!p.ok) return { why: p.why };
  if (p.steps.some(s => s.do === 'npc' || s.do === 'enter' || s.do === 'stairs')) return { why: 'the graph route leaves the floor' };
  const out = [[e[0], e[1], e[2]]];
  M.rgPlanPoints(p, fi).forEach(q => { const l = out[out.length - 1]; if (Math.hypot(q.x - l[0], q.y - l[1]) >= 8) out.push([q.x, q.y, q.z]); });
  let bad = 0; for (let i = 1; i < out.length; i++) if (!geo.lineClear({ x: out[i - 1][0], y: out[i - 1][1], z: out[i - 1][2] }, { x: out[i][0], y: out[i][1], z: out[i][2] })) bad++;
  if (bad) return { why: `${bad} leg(s) of the graph route cross a wall` };
  return { route: out, text: p.text };
}

function main() {
  const only = (arg('--only') || 'cruma').split(','), floors = arg('--floors') ? arg('--floors').split(',').map(n => Number(n) - 1) : null, dry = argv.includes('--dry');
  const M = planner(), all = rd(FILE), changed = {};
  for (const d0 of all) {
    if (!only.includes(d0.key)) continue;
    const d = withGraph(d0); if (!d) { console.log(`${d0.key}: no room graph - skipped`); continue; }
    const RG = M.rgBuild(d);
    d0.floors.forEach((F, fi) => {
      if (floors && !floors.includes(fi)) return;
      (F.rooms || []).forEach(r => {
        if (!Array.isArray(r.route) || r.route.length < 2 || r.routeManual) return;
        const g = graphRoute(M, RG, d, fi, r);
        if (!g.route) { console.log(`${r.id}: kept the old route (${g.why})`); return; }
        const old = r.routeLength;
        r.route = g.route; r.routeLength = plen(g.route); r.walkFromFloorEntry = r.routeLength; r.routeFrom = 'room_graph centreline (room_routes_graph.js ' + new Date().toISOString().slice(0, 10) + ')';
        changed[r.id] = { dungeon: d0.key, route: g.route, len: r.routeLength };
        console.log(`${r.id}: ${g.route.length} points, ${old} -> ${r.routeLength} units (${g.text})`);
      });
    });
  }
  const ids = Object.keys(changed);
  if (!ids.length) { console.log('nothing changed'); return; }
  if (dry) { console.log(`--dry: ${ids.length} room route(s) not written`); return; }
  MG.writeGuarded(FILE, all, 'room', { who: 'room_routes_graph.js' });
  // the nav atlas room targets: their 'dungeon-rooms' walk step carries the room route
  const fix = (R, id) => {
    if (!R || !Array.isArray(R.steps)) return false;
    const s = R.steps.find(x => x.do === 'walk' && x.how === 'dungeon-rooms' && (x.room === id || !x.room)); if (!s) return false;
    const pts = [].concat(...changed[id].route), oldLen = Number(s.len) || 0;
    s.points = pts; s.len = changed[id].len; s.centreline = true;
    R.length = Math.max(0, Math.round((Number(R.length) || 0) - oldLen + s.len)); R.sec = Math.max(0, Math.round((Number(R.sec) || 0) + (s.len - oldLen) / 120));
    return true;
  };
  const roomFile = path.join(ATLAS, 'room.json'), RJ = rd(roomFile), idxFile = path.join(ATLAS, 'index.json'), IX = rd(idxFile);
  let n = 0;
  ids.forEach(id => {
    const key = 'room:' + id;
    if (fix(RJ.routes && RJ.routes[key], id)) n++;
    const tf = path.join(ATLAS, 't', 'room_' + id + '.json');
    if (fs.existsSync(tf)) { const T = rd(tf); if (fix(T, id)) MG.atomicWrite(tf, JSON.stringify(T)); }
    const row = (IX.targets || []).find(w => w[0] === key), R = RJ.routes && RJ.routes[key];
    if (row && R) { row[7] = R.length; row[8] = R.sec; }
  });
  MG.atomicWrite(roomFile, JSON.stringify(RJ));
  MG.atomicWrite(idxFile, JSON.stringify(IX));
  console.log(`written: ${ids.length} room route(s) in dungeon_rooms.json, ${n} nav atlas room target(s)`);
}
if (require.main === module) main();
module.exports = { planner, withGraph, graphRoute };
