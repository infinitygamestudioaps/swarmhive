// ROOM GRAPH (user 2026-10-09 07:30: "You HAVE to use the teleporter and then go through each room one by one to get there. This is the same
// principle for all dungeons, there is no straight path to a room.")
//
// For every dungeon floor in Scripts/data/dungeon_rooms.json: which rooms connect to which, through which doorway, and how long the walk is.
// Built from the L2J geodata walkable mask (room_polys.js buildFloor: flood fill inside the floor's z band):
//   nodes  = rooms (their polygon + z band) and corridors (connected walkable cells outside every room)
//   doors  = where two nodes touch (a cluster of neighbouring cells, one side in each node) -> one vertex per doorway
//   vertices = doors + room centres + the floor entry (landing) + floor link points (teleporter NPC / its landing / stairs) + safe spots
//   edges  = the walking distance INSIDE one node between two of its vertices (geodesic on the cells, walls respected)
// Stored per floor:  floors[fi].graph = { v: [[id, x, y, z, node, kind, ref]], nodes: [{ id, kind, room?, cells, poly?, z }], e: [[a, b, len]], stats }
// (a, b = vertex indices; len = world units). Cross-floor ways are in floors[fi].links (floor_links.js: NPC teleporters; this tool adds the
// geodata stairs / ramps 'walk' links and their vertices: 'la<i>' = where link i of this floor starts, 'lb<from>_<i>' = where link i of floor
// <from> arrives on this floor).
// A route = Dijkstra over all floors' graphs + the links (swarm.js ROOMGRAPH-PURE does the same at run time).
// Also writes: docs/plan/room_polys/graph/<key>_f<n>_meta.json + _overlay.png (rooms, corridors, doors, edges, the Cruma route 1 -> 2 -> 3)
// and docs/plan/room_polys/graph_report.json (per dungeon: nodes, doors, edges, rooms reachable from the entry, unreachable rooms + why).
//   node docs/plan/tools/room_graph.js [--only key,key] [--dry] [--no-images]
'use strict';
const fs = require('fs'), path = require('path');
const geo = require('./geopath');
const RP = require('./room_polys');
const MG = require('./manual_guard');
const ROOT = path.join(__dirname, '..', '..', '..');
const DATA = path.join(ROOT, 'Scripts', 'data');
const FILE = path.join(DATA, 'dungeon_rooms.json');
const OUT = path.join(ROOT, 'docs', 'plan', 'room_polys', 'graph');
const rd = (f) => JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, ''));
const argv = process.argv.slice(2), arg = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
const only = arg('--only') ? arg('--only').split(',') : null, dry = argv.includes('--dry'), images = !argv.includes('--no-images');
const WX0 = -294912, WY0 = -262144, CELL = 16;
const TP_COST = 1500;                                   // a teleporter click ~ 15 s of walking
const CRUMB = 400;
const LEG = 280, DEV = 40, KEEP = 4, SPINE_GAP = 900;                    // waypoint spacing (max straight leg), max distance off the centreline, edges kept per vertex                                      // corridor pieces under 400 cells (~320x320) are merged into their neighbour

// ---------------------------------------------------------------------------------------------------------------- grid helpers
const cellXY = (G, i) => [(G.gx0 + (i % G.w)) * CELL + WX0 + 8, (G.gy0 + ((i / G.w) | 0)) * CELL + WY0 + 8];
const nb = (G, i, k) => RP.nbOpen(G, i, k);
function nb8(G, i, out) {
  let c = 0;
  const e = nb(G, i, 0), w = nb(G, i, 1), s = nb(G, i, 2), n = nb(G, i, 3);
  if (e >= 0) { out[c++] = e; out[c++] = 10; } if (w >= 0) { out[c++] = w; out[c++] = 10; }
  if (s >= 0) { out[c++] = s; out[c++] = 10; } if (n >= 0) { out[c++] = n; out[c++] = 10; }
  const dg = (a, ka, b, kb) => { if (a < 0 || b < 0) return -1; const x = nb(G, a, kb), y = nb(G, b, ka); return x >= 0 && x === y ? x : -1; };
  let d;
  if ((d = dg(e, 0, s, 2)) >= 0) { out[c++] = d; out[c++] = 14; } if ((d = dg(e, 0, n, 3)) >= 0) { out[c++] = d; out[c++] = 14; }
  if ((d = dg(w, 1, s, 2)) >= 0) { out[c++] = d; out[c++] = 14; } if ((d = dg(w, 1, n, 3)) >= 0) { out[c++] = d; out[c++] = 14; }
  return c;
}
class BQ { constructor() { this.b = []; this.cur = 0; this.size = 0; } push(k, v) { (this.b[k] || (this.b[k] = [])).push(v); this.size++; if (k < this.cur) this.cur = k; }
  pop() { while (!this.b[this.cur] || !this.b[this.cur].length) this.cur++; this.size--; return [this.cur, this.b[this.cur].pop()]; } }
class Heap { constructor() { this.k = []; this.v = []; }
  push(key, val) { const k = this.k, v = this.v; let i = k.length; k.push(key); v.push(val); while (i > 0) { const p = (i - 1) >> 1; if (k[p] <= key) break; k[i] = k[p]; v[i] = v[p]; i = p; } k[i] = key; v[i] = val; }
  pop() { const k = this.k, v = this.v, tk = k[0], tv = v[0], lk = k.pop(), lv = v.pop(), n = k.length;
    if (n) { let i = 0; for (;;) { let c = 2 * i + 1; if (c >= n) break; if (c + 1 < n && k[c + 1] < k[c]) c++; if (k[c] >= lk) break; k[i] = k[c]; v[i] = v[c]; i = c; } k[i] = lk; v[i] = lv; }
    return [tk, tv]; }
  get size() { return this.k.length; } }
/** straight walk between two cells on the grid without crossing a closed edge (Bresenham with 4-neighbour moves) */
function segClear(G, i, j) {
  let x = i % G.w, y = (i / G.w) | 0; const x2 = j % G.w, y2 = (j / G.w) | 0;
  const dx = Math.abs(x2 - x), dy = Math.abs(y2 - y), sx = x < x2 ? 1 : -1, sy = y < y2 ? 1 : -1; let err = dx - dy, cur = i;
  const kx = sx > 0 ? 0 : 1, ky = sy > 0 ? 2 : 3;
  while (cur !== j) {
    const e2 = 2 * err, mx = e2 > -dy, my = e2 < dx;
    if (mx && my) {
      // a diagonal step: BOTH ways round the corner must be open (geopath.js diag rule — the server never cuts a wall corner)
      const a1 = nb(G, cur, kx), a2 = a1 >= 0 ? nb(G, a1, ky) : -1, b1 = nb(G, cur, ky), b2 = b1 >= 0 ? nb(G, b1, kx) : -1;
      if (a2 < 0 || b2 < 0 || a2 !== b2) return false;
      err += dx - dy; cur = a2; x += sx; y += sy; continue;
    }
    if (mx) { err -= dy; const n = nb(G, cur, kx); if (n < 0) return false; cur = n; x += sx; }
    else if (my) { err += dx; const n = nb(G, cur, ky); if (n < 0) return false; cur = n; y += sy; }
  }
  return true;
}
/** centreline cells -> waypoints (interior only, flat x,y,z): straight legs <= LEG units, wall-free, never more than DEV off the path */
function legs(G, cells) {
  const out = []; let a = 0;
  const xy = (i) => cellXY(G, cells[i]);
  while (a < cells.length - 1) {
    let best = a + 1;
    for (let b = a + 2; b < cells.length; b++) {
      const [ax, ay] = xy(a), [bx, by] = xy(b), L = Math.hypot(bx - ax, by - ay); if (L > LEG) break;
      let ok = segClear(G, cells[a], cells[b]) && segClear(G, cells[b], cells[a]);   // both ways: the line is rasterised differently per direction and the edge is walked both ways
      for (let m = a + 1; ok && m < b; m++) { const [mx, my] = xy(m); const dd = Math.abs((bx - ax) * (ay - my) - (ax - mx) * (by - ay)) / (L || 1); if (dd > DEV) ok = false; }
      if (ok) best = b;
    }
    a = best;
    if (a < cells.length - 1) { const [x, y] = xy(a); out.push(Math.round(x), Math.round(y), G.H[cells[a]]); }
  }
  return out;
}
/** ONE-WAY GEODATA EDGES (2026-10-09, 21 blocked town legs): an NSWE flag only says a cell may be LEFT in that direction; next to walls
 *  a cell A may step into B while B has no flag back to A. A centreline path found in one direction is walked in both, so keep only the
 *  two-way edges: clear A's bit toward B when B cannot step back to A. Every later search / clearance / leg check then agrees with the
 *  server in both directions. Returns the number of one-way edges cleared. */
function symmetrize(G) {
  const OPP = [1, 0, 3, 2], clr = []; let n = 0;
  for (let i = 0; i < G.n; i++) { if (!G.OK[i]) continue; for (let k = 0; k < 4; k++) { const j = nb(G, i, k); if (j >= 0 && nb(G, j, OPP[k]) !== i) clr.push(i, k); } }
  const BIT = [1, 2, 4, 8];
  for (let q = 0; q < clr.length; q += 2) { G.NS[clr[q]] &= ~BIT[clr[q + 1]]; n++; }
  return n;
}
/** nearest walkable cell to a world point (xy within r cells, |dz| < 400) */
function snapCell(G, p, r = 14, inSet) {
  const cx = Math.floor((p.x - WX0) / CELL) - G.gx0, cy = Math.floor((p.y - WY0) / CELL) - G.gy0;
  let best = -1, bd = 1e9;
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const x = cx + dx, y = cy + dy; if (x < 0 || y < 0 || x >= G.w || y >= G.h) continue;
    const i = y * G.w + x; if (!G.OK[i] || (inSet && !inSet(i))) continue;
    const dz = Math.abs(G.H[i] - p.z); if (dz > 400) continue;
    const d = Math.hypot(dx, dy) * 16 + dz * 0.5; if (d < bd) { bd = d; best = i; }
  }
  return best;
}
/** room polygons -> label per cell (scanline), only cells inside the room's z band (+-150) */
function labelRooms(G, rooms) {
  const lab = new Int32Array(G.n).fill(-1);
  rooms.forEach((r, k) => {
    const P = r.poly, zr = r.zRange || [r.center[2] - 400, r.center[2] + 400];
    const ys = P.map(p => p[1]), y1 = Math.max(0, Math.floor((Math.min(...ys) - WY0) / CELL) - G.gy0), y2 = Math.min(G.h - 1, Math.ceil((Math.max(...ys) - WY0) / CELL) - G.gy0);
    for (let row = y1; row <= y2; row++) {
      const wy = (G.gy0 + row) * CELL + WY0 + 8, xs = [];
      for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b = P[j]; if ((a[1] > wy) !== (b[1] > wy)) xs.push(a[0] + (wy - a[1]) * (b[0] - a[0]) / (b[1] - a[1])); }
      xs.sort((a, b) => a - b);
      for (let q = 0; q + 1 < xs.length; q += 2) {
        const c1 = Math.max(0, Math.ceil((xs[q] - WX0 - 8) / CELL) - G.gx0), c2 = Math.min(G.w - 1, Math.floor((xs[q + 1] - WX0 - 8) / CELL) - G.gx0);
        for (let col = c1; col <= c2; col++) { const i = row * G.w + col; if (G.OK[i] && lab[i] < 0 && G.H[i] >= zr[0] - 150 && G.H[i] <= zr[1] + 150) lab[i] = k; }
      }
    }
  });
  return lab;
}
const zFloorIdx = (d, z) => { let best = -1, bd = 1e9; d.floors.forEach((f, i) => { if (!f.z) return; if (z >= f.z[0] && z <= f.z[1]) { const c = Math.abs(z - (f.z[0] + f.z[1]) / 2); if (c < bd) { bd = c; best = i; } } }); if (best >= 0) return best; d.floors.forEach((f, i) => { if (!f.z) return; if (z >= f.z[0] - 300 && z <= f.z[1] + 300) { const c = Math.min(Math.abs(z - f.z[0]), Math.abs(z - f.z[1])); if (c < bd) { bd = c; best = i; } } }); return best; };
const inBandStrict = (d, fi, z) => { const f = d.floors[fi]; return !!(f && f.z && z >= f.z[0] - 60 && z <= f.z[1] + 60); };
/** a geopath walk from floor a to floor b -> { at (last point on a), land (first point on b), path (flat x,y,z of the stairs between) } */
/** split straight legs longer than LEG into equal parts (geopath legs are counted in cells: a diagonal one is up to 1.41 x longer) */
function resample(pts) {
  const out = []; for (let i = 0; i < pts.length; i++) {
    if (i) { const a = pts[i - 1], b = pts[i], L = Math.hypot(b.x - a.x, b.y - a.y), n = Math.ceil(L / LEG);
      for (let k = 1; k < n; k++) out.push({ x: Math.round(a.x + (b.x - a.x) * k / n), y: Math.round(a.y + (b.y - a.y) * k / n), z: Math.round(a.z + (b.z - a.z) * k / n) }); }
    out.push(pts[i]);
  }
  return out;
}
function stairsOf(d, a, b, pts) {
  pts = resample(pts);
  let ia = 0, ib = pts.length - 1;
  for (let i = 0; i < pts.length; i++) if (inBandStrict(d, a, pts[i].z)) ia = i;
  for (let i = ia; i < pts.length; i++) if (inBandStrict(d, b, pts[i].z)) { ib = i; break; }
  const path = []; pts.slice(ia + 1, ib).forEach(p => path.push(p.x, p.y, p.z));
  const P = (p) => ({ x: p.x, y: p.y, z: p.z });
  return { at: P(pts[ia]), land: P(pts[ib]), path, len: Math.round(pts.slice(ia + 1, ib + 1).reduce((s2, p, k) => s2 + Math.hypot(p.x - pts[ia + k].x, p.y - pts[ia + k].y), 0)) };
}
const P3 = (p) => p ? (Array.isArray(p) ? { x: +p[0], y: +p[1], z: +p[2] } : { x: +p.x, y: +p.y, z: +p.z }) : null;

// ---------------------------------------------------------------------------------------------------------------- one floor
function floorGraph(d, F, fi, extraPts, spawns) {
  const rooms = (F.rooms || []).filter(r => r.poly && r.poly.length >= 3 && r.center && (r.polyInfo || {}).quality !== 'duplicate' && !r.mergedInto);   // ROOMMERGE-2026-10-22: a room combined into another is no node of its own
  const allPts = rooms.map(r => r.center).concat(extraPts.map(p => [p.x, p.y]));
  const xs = allPts.map(p => p[0]), ys = allPts.map(p => p[1]), B = d.bbox;
  const box = [Math.max(B[0] - 2500, Math.min(...xs) - 4000), Math.min(B[1] + 2500, Math.max(...xs) + 4000), Math.max(B[2] - 2500, Math.min(...ys) - 4000), Math.min(B[3] + 2500, Math.max(...ys) + 4000)];
  const zBand = [F.z[0] - 250, F.z[1] + 250];
  const ids = new Set(F.monsterIds || []); rooms.forEach(r => (r.monsters || []).forEach(m => ids.add(m.id)));
  const spF = spawns.filter(s => ids.has(s.id) && s.x >= box[0] && s.x <= box[1] && s.y >= box[2] && s.y <= box[3] && s.z >= F.z[0] - 150 && s.z <= F.z[1] + 150);
  const seeds = rooms.map(r => ({ x: r.center[0], y: r.center[1], z: r.center[2] })).concat(extraPts.filter(p => p.z >= zBand[0] - 200 && p.z <= zBand[1] + 200)).concat(spF.map(s => ({ x: s.x, y: s.y, z: s.z })));
  const G = RP.buildFloor(box, zBand, seeds);
  symmetrize(G);                                         // two-way steps only (one-way NSWE edges, 2026-10-09)
  const lab = labelRooms(G, rooms), R = rooms.length;
  // corridors: 4-connected walkable cells outside every room
  const q = new Int32Array(G.n); const corr = [];
  for (let s = 0; s < G.n; s++) {
    if (!G.OK[s] || lab[s] !== -1) continue;
    const id = R + corr.length; let qh = 0, qt = 0; q[qt++] = s; lab[s] = id;
    while (qh < qt) { const i = q[qh++]; for (let k = 0; k < 4; k++) { const j = nb(G, i, k); if (j >= 0 && lab[j] === -1) { lab[j] = id; q[qt++] = j; } } }
    corr.push({ id, cells: qt, first: s });
  }
  // crumbs: a small corridor piece (slivers between two room outlines, a niche) belongs to the neighbour it shares the most edge with
  {
    const cellsOf = new Map(); corr.forEach(c => cellsOf.set(c.id, []));
    for (let i = 0; i < G.n; i++) if (lab[i] >= R) cellsOf.get(lab[i]).push(i);
    const order = corr.slice().sort((a, b) => a.cells - b.cells);
    for (const c of order) {
      const cells = cellsOf.get(c.id); if (!cells || cells.length >= CRUMB) continue;
      const cnt = new Map(); cells.forEach(i => { for (let k = 0; k < 4; k++) { const j = nb(G, i, k); if (j >= 0 && lab[j] >= 0 && lab[j] !== c.id) cnt.set(lab[j], (cnt.get(lab[j]) || 0) + 1); } });
      let to = -1, bc = 0; cnt.forEach((n, l) => { if (n > bc) { bc = n; to = l; } });
      if (to < 0) continue;
      cells.forEach(i => { lab[i] = to; }); if (to >= R) { const t = cellsOf.get(to); cells.forEach(i => t.push(i)); corr.find(x => x.id === to).cells += cells.length; } cellsOf.set(c.id, []); c.cells = 0;
    }
    corr.forEach(c => { const L = cellsOf.get(c.id); if (L && L.length) c.first = L[0]; });
  }
  const nNodes = R + corr.length;
  const CLR = RP.clearance(G);                            // x10 per cell to the nearest wall / edge
  // doors: boundary pairs between two nodes
  const pairs = new Map();                              // "a,b" -> [[i, j], ...]  (i in a, j in b, a < b)
  for (let i = 0; i < G.n; i++) {
    const a = lab[i]; if (a < 0) continue;
    for (let k = 0; k < 4; k++) { const j = nb(G, i, k); if (j < 0) continue; const b = lab[j]; if (b < 0 || b === a) continue;
      const key = a < b ? a + ',' + b : b + ',' + a; let L = pairs.get(key); if (!L) pairs.set(key, L = []); L.push(a < b ? [i, j] : [j, i]); }
  }
  const doors = [];
  pairs.forEach((L, key) => {
    const [a, b] = key.split(',').map(Number);
    // cluster the boundary cells (side a) by grid distance <= 4 cells
    const pts = L.map(([i, j]) => ({ i, j, x: i % G.w, y: (i / G.w) | 0, c: -1 }));
    let nc = 0;
    for (let s = 0; s < pts.length; s++) {
      if (pts[s].c >= 0) continue; const st = [s]; pts[s].c = nc;
      while (st.length) { const u = pts[st.pop()]; for (let t = 0; t < pts.length; t++) { const v = pts[t]; if (v.c < 0 && Math.abs(v.x - u.x) <= 4 && Math.abs(v.y - u.y) <= 4) { v.c = nc; st.push(t); } } }
      nc++;
    }
    for (let c = 0; c < nc; c++) {
      const P = pts.filter(p => p.c === c); if (P.length < 2) continue;          // a one-cell crack, not a doorway
      const mx = P.reduce((s, p) => s + p.x, 0) / P.length, my = P.reduce((s, p) => s + p.y, 0) / P.length;
      // the middle of the opening: most clearance from the walls, then nearest the cluster centre
      let bp = P[0], bd = -1e9; P.forEach(p => { const sc = Math.min(CLR[p.i], CLR[p.j]) * 10 - Math.hypot(p.x - mx, p.y - my); if (sc > bd) { bd = sc; bp = p; } });
      doors.push({ a, b, ia: bp.i, ib: bp.j, width: P.length * 16 });
    }
  });
  // drop corridor crumbs: < 40 cells and at most one neighbour, no special point
  // vertices
  const V = [];                                           // { id, x, y, z, node, kind, ref, cell, cells: {node: cell} }
  const addV = (id, cellA, nodeA, kind, ref, cellB, nodeB) => {
    const [x, y] = cellXY(G, cellA); const v = { id, x: Math.round(x), y: Math.round(y), z: G.H[cellA], node: nodeA, kind, ref, cells: { [nodeA]: cellA } };
    if (nodeB !== undefined) v.cells[nodeB] = cellB; V.push(v); return v;
  };
  doors.forEach((dr, k) => addV('d' + k, dr.ia, dr.a, 'door', `${dr.a}|${dr.b}|${dr.width}`, dr.ib, dr.b));
  const unplaced = [];
  rooms.forEach((r, k) => {
    let c = snapCell(G, { x: r.center[0], y: r.center[1], z: r.center[2] }, 14, (i) => lab[i] === k);
    if (c < 0) { // the centre is outside the room's own cells (a C-shaped room): its cell nearest the centre
      let bd = 1e9; for (let i = 0; i < G.n; i++) if (lab[i] === k) { const [x, y] = cellXY(G, i); const dd = Math.hypot(x - r.center[0], y - r.center[1]); if (dd < bd) { bd = dd; c = i; } } }
    if (c < 0) { unplaced.push({ id: r.id, why: 'no walkable geodata cell inside its polygon and z band' }); return; }
    addV('r:' + r.id, c, k, 'room', r.id);
  });
  extraPts.forEach(p => {
    // (the caller hands each floor its own points; a stairs landing can lie a little outside the band: snap wider, at the band's edge height)
    let c = snapCell(G, p, 20);
    if (c < 0) c = snapCell(G, { x: p.x, y: p.y, z: Math.max(F.z[0], Math.min(F.z[1], p.z)) }, 60);
    if (c < 0) { unplaced.push({ id: p.id, why: `point ${p.x},${p.y},${p.z} is not on this floor's walkable cells` }); return; }
    addV(p.id, c, lab[c], p.kind, p.ref);
  });
  // spine points: every corridor (and every big room) gets vertices on its middle line where no vertex is near yet — the deepest cell first,
  // then the cell farthest (walking) from every vertex while that is > SPINE_GAP: dead-end hallways and long corridors have a centreline too
  // (a member standing in one finds his way onto it)
  {
    const have = new Map(); V.forEach(v => Object.keys(v.cells).forEach(n => { n = +n; (have.get(n) || have.set(n, []).get(n)).push(v.cells[n]); }));
    const tmp8 = new Int32Array(16);
    for (let n = 0; n < nNodes; n++) {
      if (n < R) continue;                                                    // rooms: their centre + doors are enough
      const c = corr[n - R]; if (!c || !c.cells) continue;
      const cells = []; for (let i = 0; i < G.n; i++) if (lab[i] === n) cells.push(i);
      if (!cells.length) continue;
      const seeds = (have.get(n) || []).slice();
      if (!seeds.length) { let bi = cells[0]; cells.forEach(i => { if (CLR[i] > CLR[bi]) bi = i; }); addV('m' + n + '_0', bi, n, 'mid', null); seeds.push(bi); }
      for (let k = 1; k <= 8; k++) {
        const Dm = new Map(), Q = new Heap(); seeds.forEach(i => { Dm.set(i, 0); Q.push(0, i); });
        while (Q.size) { const [dd, i] = Q.pop(); if (dd > Dm.get(i)) continue; const cc = nb8(G, i, tmp8); for (let t = 0; t < cc; t += 2) { const j = tmp8[t]; if (lab[j] !== n) continue; const nd = dd + tmp8[t + 1], o = Dm.get(j); if (o === undefined || nd < o) { Dm.set(j, nd); Q.push(nd, j); } } }
        let far = -1, fd = 0; Dm.forEach((dd, i) => { if (dd > fd) { fd = dd; far = i; } });
        if (far < 0 || fd / 10 * CELL < SPINE_GAP) break;
        // the spine point: walk back toward the seeds until the cell is on the middle line (most clearance among its neighbours)
        let best = far; for (let step = 0; step < 40; step++) { const cc = nb8(G, best, tmp8); let nb2 = best; for (let t = 0; t < cc; t += 2) { const j = tmp8[t]; if (lab[j] === n && CLR[j] > CLR[nb2]) nb2 = j; } if (nb2 === best) break; best = nb2; }
        addV('m' + n + '_' + k, best, n, 'mid', null); seeds.push(best);
      }
    }
  }
  // edges: inside each node, the CENTRELINE walk between its vertices (user 2026-10-09 09:10: "walk in the middle of these walkways so it
  // does not get stuck"): Dijkstra with a step cost that grows near walls (1 + 200 / (1 + clearance in cells)^2) -> the path runs along the
  // middle of hallways and keeps ~8 cells off room walls; it is cut into straight, wall-checked legs of <= LEG units (the waypoints).
  const byNode = new Map(); V.forEach((v, vi) => Object.keys(v.cells).forEach(n => { n = +n; let L = byNode.get(n); if (!L) byNode.set(n, L = []); L.push({ vi, cell: v.cells[n] }); }));
  const W = new Uint16Array(G.n); for (let i = 0; i < G.n; i++) if (G.OK[i]) { const c = CLR[i] / 10; W[i] = Math.min(60000, Math.round(10 * (1 + 200 / ((1 + c) * (1 + c))))); }
  const E = [], tmp = new Int32Array(16);
  byNode.forEach((L, n) => {
    if (L.length < 2) return;
    const found = [];                                     // [s, t, wcost, cells[]]
    for (let s = 0; s < L.length; s++) {
      const want = new Map(); for (let t = 0; t < L.length; t++) if (t !== s) want.set(L[t].cell, (want.get(L[t].cell) || []).concat([t]));
      const D = new Map(), PR = new Map(), Q = new Heap(); D.set(L[s].cell, 0); Q.push(0, L[s].cell); let left = L.length - 1;
      while (Q.size && left > 0) {
        const [dd, i] = Q.pop(); if (dd > D.get(i)) continue;
        if (want.has(i)) { want.get(i).forEach(t => { if (t > s) { const cells = []; for (let c = i; c !== undefined; c = PR.get(c)) cells.push(c); cells.reverse(); found.push([s, t, dd, cells]); } left--; }); want.delete(i); }
        const c = nb8(G, i, tmp);
        for (let t = 0; t < c; t += 2) { const j = tmp[t]; if (lab[j] !== n) continue; const nd = dd + Math.round(tmp[t + 1] * W[j] / 10), o = D.get(j); if (o === undefined || nd < o) { D.set(j, nd); PR.set(j, i); Q.push(nd, j); } }
      }
    }
    // keep per vertex its KEEP cheapest edges + a spanning tree (Kruskal on the weighted cost) -> the hallway network, not every pair
    const keep = new Set(); const byV = new Map();
    found.forEach((f, fi) => { [f[0], f[1]].forEach(x => { let A = byV.get(x); if (!A) byV.set(x, A = []); A.push(fi); }); });
    byV.forEach(A => A.sort((p, q) => found[p][2] - found[q][2]).slice(0, KEEP).forEach(fi => keep.add(fi)));
    const par = L.map((_, i) => i), root = (x) => { while (par[x] !== x) x = par[x] = par[par[x]]; return x; };
    found.map((f, fi) => fi).sort((p, q) => found[p][2] - found[q][2]).forEach(fi => { const a = root(found[fi][0]), b = root(found[fi][1]); if (a !== b) { par[a] = b; keep.add(fi); } });
    keep.forEach(fi => { const f = found[fi]; E.push({ a: L[f[0]].vi, b: L[f[1]].vi, w: f[2], cells: f[3], n }); });
    if (L.length >= 2 && !found.length) unplaced.push({ id: 'node' + n, why: 'vertices in one node but no walk between them' });
  });
  const edges = E.map(e => {
    let len = 0; for (let i = 1; i < e.cells.length; i++) { const [x1, y1] = cellXY(G, e.cells[i - 1]), [x2, y2] = cellXY(G, e.cells[i]); len += Math.hypot(x2 - x1, y2 - y1); }
    return { a: e.a, b: e.b, len: Math.round(len), w: Math.round(e.w / 10 * CELL), pts: legs(G, e.cells), n: e.n };
  });
  // nodes: rooms + corridors that carry a vertex (corridor outline for "where am I")
  const usedNodes = new Set(); V.forEach(v => Object.keys(v.cells).forEach(n => usedNodes.add(+n)));
  const nodes = [];
  const nodeIdx = new Map();
  for (let n = 0; n < nNodes; n++) {
    if (!usedNodes.has(n)) continue;
    nodeIdx.set(n, nodes.length);
    if (n < R) nodes.push({ id: 'r:' + rooms[n].id, kind: 'room', room: rooms[n].id });
    else {
      const cset = new Set(); let qh = 0, qt = 0; const c0 = corr[n - R].first; q[qt++] = c0; cset.add(c0);
      while (qh < qt) { const i = q[qh++]; for (let k = 0; k < 4; k++) { const j = nb(G, i, k); if (j >= 0 && lab[j] === n && !cset.has(j)) { cset.add(j); q[qt++] = j; } } }
      let poly = null; try { const loop = RP.outline(G, cset); const sl = loop.length > 3 ? RP.simplifyLoop(loop, 40) : null; poly = sl ? sl.pts : null; } catch (e) { poly = null; }
      let zs = [1e9, -1e9]; cset.forEach(i => { zs[0] = Math.min(zs[0], G.H[i]); zs[1] = Math.max(zs[1], G.H[i]); });
      nodes.push({ id: 'c' + (n - R), kind: 'corridor', cells: cset.size, poly: poly ? poly.map(p => [Math.round(p[0]), Math.round(p[1])]) : null, z: zs });
    }
  }
  const vOut = V.map(v => [v.id, v.x, v.y, v.z, nodeIdx.has(v.node) ? nodeIdx.get(v.node) : -1, v.kind, v.ref === undefined ? null : v.ref]);
  // door refs -> node ids
  vOut.forEach(v => { if (v[5] === 'door') { const [a, b, w] = String(v[6]).split('|').map(Number); v[6] = [nodes[nodeIdx.get(a)].id, nodes[nodeIdx.get(b)].id, w]; } });
  // e: [a, b, len (walk units), cost (centreline-weighted), [x,y,z, x,y,z, ...] = the waypoints between a and b (a -> b order)]
  const eOut = edges.map(e => [e.a, e.b, e.len, e.w, e.pts, nodeIdx.has(e.n) ? nodeIdx.get(e.n) : -1]);
  return { G, lab, rooms, R, corr, graph: { v: vOut, nodes, e: eOut }, unplaced, box, spF };
}

/** join the parts of one floor's graph (union-find over its edges) to the part with the most rooms by geopath walks */
function stitchFloor(d, F, fi) {
  const g = F.graph; if (!g || g.v.length < 2) return 0;
  const par = g.v.map((_, i) => i), root = (x) => { while (par[x] !== x) x = par[x] = par[par[x]]; return x; };
  const join = () => g.e.forEach(e => { const a = root(e[0]), b = root(e[1]); if (a !== b) par[a] = b; });
  join();
  let added = 0;
  for (let round = 0; round < 12; round++) {
    const comps = new Map(); g.v.forEach((v, i) => { const r = root(i); (comps.get(r) || comps.set(r, []).get(r)).push(i); });
    if (comps.size < 2) break;
    const score = (L) => L.filter(i => g.v[i][5] === 'room').length * 1000 + L.length;
    const list = [...comps.values()].sort((a, b) => score(b) - score(a)), main = list[0];
    let did = false;
    for (const C of list.slice(1)) {
      // the closest pair (straight) between this part and the main part
      // the 8 closest pairs (straight), each walked with geopath: the shortest real walk wins
      const pairs = []; C.forEach(i => main.forEach(j => { const a = g.v[i], b = g.v[j]; pairs.push({ i, j, dd: Math.hypot(a[1] - b[1], a[2] - b[2]) + Math.abs(a[3] - b[3]) }); }));
      pairs.sort((p, q) => p.dd - q.dd);
      let best = null, r = null;
      for (const p of pairs.slice(0, 8)) {
        if (p.dd > 9000) break;
        const A0 = g.v[p.i], B0 = g.v[p.j];
        const q = geo.findPath({ x: A0[1], y: A0[2], z: A0[3] }, { x: B0[1], y: B0[2], z: B0[3] }, { pad: 3000, maxNodes: 1.5e6, maxMs: 12000, maxLeg: LEG });
        if (q.ok && q.points.length && q.lengthUnits <= Math.max(6000, p.dd * 6) && (!r || q.lengthUnits < r.lengthUnits)) { r = q; best = p; }
      }
      if (!best) continue;
      const A = g.v[best.i], B = g.v[best.j];
      const pts = []; resample([{ x: A[1], y: A[2], z: A[3] }].concat(r.points)).slice(1, -1).forEach(p => pts.push(p.x, p.y, p.z));
      g.e.push([best.i, best.j, r.lengthUnits, Math.round(r.lengthUnits * 1.6), pts, -1]);
      par[root(best.i)] = root(best.j); added++; did = true;
    }
    if (!did) break;
  }
  if (added) { g.stats = Object.assign(g.stats || {}, { stitched: added }); }
  return added;
}
// ---------------------------------------------------------------------------------------------------------------- whole dungeon
/** stairs / ramps between two floors (enter.how walk|stairs from another floor's band): geopath from the source point to the floor's entry */
function walkLinks(d) {
  const out = [];
  d.floors.forEach((F, k) => {
    const en = F.enter || {}; if (en.how === 'teleporter' || en.how === 'ziggurat') return;
    const from = P3(en.from), to = P3(F.entryPoint && F.entryPoint.at) || P3(en.landing) || (() => { const r = (F.rooms || []).find(x => x.center && x.route); return r ? P3(r.center) : null; })();
    if (!from || !to) return;
    let src = zFloorIdx(d, from.z);
    // a point in another floor's band that is far from every room of that floor, and that floor is only reached by a teleporter (Forge: the
    // Goddard landing -2432 vs the Hall of Flames band): it is the outside door, not that floor
    if (src >= 0 && src !== k && (d.floors[src].enter || {}).how === 'teleporter' && !(d.floors[src].rooms || []).some(r => r.center && Math.hypot(r.center[0] - from.x, r.center[1] - from.y) < 3000)) src = -1;
    if (src === k) { out.push({ from: -1, to: k, at: from, land: from, len: 0, kind: 'walk', verified: 'door', evidence: 'walk in from outside (enter.from)' }); return; }
    if (src < 0) { out.push({ from: -1, to: k, at: from, land: to, len: 0, kind: 'walk', verified: 'door', evidence: 'walk in from outside (enter.from)' }); return; }
    const r = geo.findPath(from, to, { pad: 9000, maxNodes: 6e6, maxMs: 60000, maxLeg: LEG });
    if (!r.ok) { out.push({ from: src, to: k, at: from, land: to, len: null, kind: 'walk', verified: false, evidence: `geopath found no walk from ${d.floors[src].name} to ${F.name}: ${r.reason}` }); return; }
    const st = stairsOf(d, src, k, [from].concat(r.points));
    out.push({ from: src, to: k, at: st.at, land: st.land, path: st.path, len: st.len || r.lengthUnits, kind: 'walk', verified: 'geodata', evidence: `geopath ${Math.round(r.lengthUnits)} units from ${d.floors[src].name} (${from.x},${from.y},${from.z}) to ${F.name} (${to.x},${to.y},${to.z})` });
    { const rev = []; for (let q = st.path.length - 3; q >= 0; q -= 3) rev.push(st.path[q], st.path[q + 1], st.path[q + 2]); out.push({ from: k, to: src, at: st.land, land: st.at, path: rev, len: st.len || r.lengthUnits, kind: 'walk', verified: 'geodata', evidence: 'the way back: ' + `geopath from ${F.name} to ${d.floors[src].name}` }); }
  });
  // floors next to each other (by height) with no way between them yet: do the geodata connect them (stairs / ramps / tunnels)?
  const rep = (F) => P3(F.entryPoint && F.entryPoint.at) || P3(F.enter && F.enter.landing) || (() => { const r = (F.rooms || []).find(x => x.center && x.poly); return r ? P3(r.center) : null; })();
  const order = d.floors.map((F, i) => i).filter(i => d.floors[i].z && (d.floors[i].enter || {}).how !== 'ziggurat').sort((a, b) => d.floors[a].z[0] - d.floors[b].z[0]);
  const linked = (a, b) => out.some(l => (l.from === a && l.to === b) || (l.from === b && l.to === a)) || (d.floors[a].links || []).some(l => l.to === b && l.kind !== 'walk') || (d.floors[b].links || []).some(l => l.to === a && l.kind !== 'walk');
  for (let q = 0; q + 1 < order.length; q++) {
    const a = order[q], b = order[q + 1]; if (linked(a, b)) continue;
    const pa = rep(d.floors[a]), pb = rep(d.floors[b]); if (!pa || !pb) continue;
    const r = geo.findPath(pa, pb, { pad: 8000, maxNodes: 4e6, maxMs: 45000, maxLeg: LEG });
    if (!r.ok) { out.push({ from: a, to: b, at: pa, land: pb, len: null, kind: 'walk', verified: false, evidence: `no walk between ${d.floors[a].name} and ${d.floors[b].name} in the geodata (${r.reason})` }); continue; }
    const st = stairsOf(d, a, b, [pa].concat(r.points)), rev = []; for (let i = st.path.length - 3; i >= 0; i -= 3) rev.push(st.path[i], st.path[i + 1], st.path[i + 2]);
    const ev = `geopath ${Math.round(r.lengthUnits)} units between ${d.floors[a].name} and ${d.floors[b].name} (adjacent floors)`;
    out.push({ from: a, to: b, at: st.at, land: st.land, path: st.path, len: st.len || r.lengthUnits, kind: 'walk', verified: 'geodata', evidence: ev });
    out.push({ from: b, to: a, at: st.land, land: st.at, path: rev, len: st.len || r.lengthUnits, kind: 'walk', verified: 'geodata', evidence: ev });
  }
  return out;
}

const PAL = [[255, 80, 80], [80, 200, 255], [255, 210, 60], [120, 255, 120], [255, 120, 255], [255, 160, 60], [160, 140, 255], [60, 255, 210], [255, 255, 255], [200, 255, 80], [255, 100, 160], [100, 160, 255]];
function drawFloor(d, F, fi, res, route, file) {
  const box = res.box, span = Math.max(box[1] - box[0], box[3] - box[2]), scale = Math.max(8, Math.ceil(span / 2400));
  const W = Math.ceil((box[1] - box[0]) / scale), H = Math.ceil((box[3] - box[2]) / scale), img = Buffer.alloc(W * H * 4);
  const px = (x, y, c, a) => { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= W || y >= H) return; const o = (y * W + x) * 4, A = a / 255, B = img[o + 3] / 255, out = A + B * (1 - A);
    for (let k = 0; k < 3; k++) img[o + k] = Math.round((c[k] * A + img[o + k] * B * (1 - A)) / (out || 1)); img[o + 3] = Math.round(out * 255); };
  const toPx = (x, y) => [(x - box[0]) / scale, (y - box[2]) / scale];
  const G = res.G, cp = Math.max(1, CELL / scale);
  for (let i = 0; i < G.n; i++) { if (!G.OK[i]) continue; const [x, y] = cellXY(G, i), [X, Y] = toPx(x - 8, y - 8), l = res.lab[i];
    const c = l >= 0 && l < res.R ? PAL[l % PAL.length] : [150, 150, 150], a = l >= 0 && l < res.R ? 70 : 45; for (let a1 = 0; a1 < cp; a1++) for (let b1 = 0; b1 < cp; b1++) px(X + a1, Y + b1, c, a); }
  const line = (a, b, c, th, al) => { const [x1, y1] = toPx(a[0], a[1]), [x2, y2] = toPx(b[0], b[1]); const n = Math.ceil(Math.hypot(x2 - x1, y2 - y1)) + 1;
    for (let s = 0; s <= n; s++) { const x = x1 + (x2 - x1) * s / n, y = y1 + (y2 - y1) * s / n; for (let dx = -th; dx <= th; dx++) for (let dy = -th; dy <= th; dy++) px(x + dx, y + dy, c, al); } };
  const dot = (p, c, r) => { const [X, Y] = toPx(p[0], p[1]); for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) if (dx * dx + dy * dy <= r * r) px(X + dx, Y + dy, (dx * dx + dy * dy > (r - 1) * (r - 1)) ? [0, 0, 0] : c, 255); };
  res.rooms.forEach((r, k) => r.poly.forEach((p, i) => line(p, r.poly[(i + 1) % r.poly.length], PAL[k % PAL.length], 0, 255)));
  const g = res.graph; g.e.forEach(e => { const P = [[g.v[e[0]][1], g.v[e[0]][2]]]; for (let i = 0; i < (e[4] || []).length; i += 3) P.push([e[4][i], e[4][i + 1]]); P.push([g.v[e[1]][1], g.v[e[1]][2]]); for (let i = 1; i < P.length; i++) line(P[i - 1], P[i], [120, 255, 160], 0, 150); });
  (route || []).forEach((p, i) => { if (i) line([route[i - 1].x, route[i - 1].y], [p.x, p.y], [255, 0, 200], 1, 255); });
  g.v.forEach(v => dot([v[1], v[2]], v[5] === 'door' ? [255, 230, 0] : v[5] === 'room' ? [255, 255, 255] : v[5] === 'safe' ? [40, 200, 80] : [255, 60, 255], v[5] === 'door' ? 3 : 4));
  const ov = RP.png(W, H, img);
  fs.writeFileSync(path.join(OUT, file + '_overlay.png'), ov);
  const regions = [];
  const maps = new Set(fs.readdirSync(path.join(ROOT, 'Maps', 'high')));
  for (let rx = Math.floor(box[0] / 32768) + 20; rx <= Math.floor(box[1] / 32768) + 20; rx++) for (let ry = Math.floor(box[2] / 32768) + 18; ry <= Math.floor(box[3] / 32768) + 18; ry++) {
    const k = rx + '_' + ry; let f = k; const L = [1, 2, 3, 4].filter(n => maps.has(`${k}_${n}.jpg`));
    if (L.length && d.floors.length > 1) f = k + '_' + L[Math.min(fi, L.length - 1)];
    regions.push({ file: f, x0: (rx - 20) * 32768, y0: (ry - 18) * 32768 });
  }
  const labels = res.rooms.map((r, k) => ({ text: r.id.replace(/^[a-z]+-/, ''), x: (r.center[0] - box[0]) / scale, y: (r.center[1] - box[2]) / scale, c: PAL[k % PAL.length] }))
    .concat(g.v.filter(v => /^(entry|link|land)$/.test(v[5])).map(v => ({ text: v[5] === 'entry' ? 'ENTRY' : String(v[6] || v[0]), x: (v[1] - box[0]) / scale, y: (v[2] - box[2]) / scale, c: [255, 120, 255] })));
  const doorsN = g.v.filter(v => v[5] === 'door').length;
  fs.writeFileSync(path.join(OUT, file + '_meta.json'), JSON.stringify({ out: file + '.png', overlay: file + '_overlay.png', box, scale, W, H, regions, labels, safe: [],
    title: `${d.name} — ${F.name}: room graph ${g.nodes.length} nodes, ${doorsN} doors, ${g.e.length} edges${route && route.length ? ' — magenta = planned route' : ''}` }));
}

// ---------------------------------------------------------------------------------------------------------------- planner (same as swarm.js ROOMGRAPH-PURE, for the report)
function loadPure() {
  const src = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
  const a = src.indexOf('// ROOMGRAPH-PURE-BEGIN'), b = src.indexOf('// ROOMGRAPH-PURE-END');
  if (a < 0 || b < a) return null;
  const num = (v) => Number(v) || 0;
  return new Function('num', src.slice(a, b) + '\nreturn { rgBuild, rgPlan, rgLocate, rgRoomVertex };')(num);
}

if (require.main === module) {
  const all = rd(FILE), spawns = rd(path.join(DATA, 'spawns_h5.json'));
  fs.mkdirSync(OUT, { recursive: true });
  const report = { generated: new Date().toISOString(), dungeons: [] };
  const t0 = Date.now();
  all.forEach(d => {
    if (only && !only.includes(d.key)) return;
    const t1 = Date.now();
    // walk links (stairs / ramps / walk-in) from the geodata; NPC links stay as floor_links.js wrote them
    const wl = walkLinks(d);
    d.floors.forEach(F => { F.links = (F.links || []).filter(l => l.kind !== 'walk' || l.source !== 'room_graph'); });
    d.entryLinks = (d.entryLinks || []).filter(l => l.source !== 'room_graph');
    wl.forEach(l => { const L = Object.assign({}, l, { source: 'room_graph' }); if (l.from >= 0) d.floors[l.from].links.push(Object.assign({ }, L)); else d.entryLinks.push(L); });
    // special points per floor
    const pts = d.floors.map(() => []);
    d.floors.forEach((F, fi) => {
      const e = P3(F.entryPoint && F.entryPoint.at) || P3(F.enter && F.enter.landing) || (F.enter && F.enter.how !== 'teleporter' ? P3(F.enter.from) : null);
      if (e) pts[fi].push(Object.assign(e, { id: 'entry', kind: 'entry', ref: F.name }));
      (F.links || []).forEach((l, li) => {
        const at = P3(l.at), land = P3(l.land);
        if (at) pts[fi].push(Object.assign({}, at, { id: 'la' + li, kind: 'link', ref: l.npc ? l.npc.name : 'stairs' }));
        if (land && typeof l.to === 'number' && l.to >= 0 && d.floors[l.to]) pts[l.to].push(Object.assign({}, land, { id: `lb${fi}_${li}`, kind: 'land', ref: `${l.npc ? l.npc.name : 'stairs'} from ${F.name}` }));
      });
      (d.entryLinks || []).forEach((l, li) => { if (l.to === fi && l.land) pts[fi].push(Object.assign({}, P3(l.land), { id: `lbx_${li}`, kind: 'land', ref: 'from outside' })); });
      (F.safeSpots || []).forEach(s => pts[fi].push({ x: s.x, y: s.y, z: s.z, id: 's:' + s.id, kind: 'safe', ref: s.id }));
    });
    const res = d.floors.map((F, fi) => {
      if (!(F.rooms || []).some(r => r.poly)) return null;
      const r = floorGraph(d, F, fi, pts[fi], spawns);
      const doorsN = r.graph.v.filter(v => v[5] === 'door').length;
      F.graph = Object.assign(r.graph, { stats: { nodes: r.graph.nodes.length, rooms: r.graph.nodes.filter(n => n.kind === 'room').length, corridors: r.graph.nodes.filter(n => n.kind === 'corridor').length, doors: doorsN, edges: r.graph.e.length, cells: r.G.cells, built: new Date().toISOString(), unplaced: r.unplaced } });
      return r;
    });
    // POCKETS: parts of a floor's graph that the in-band flood could not join (a stairwell that rises above the band, halls at other heights
    // joined by ramps outside the band): joined to the biggest part by a geodata walk (geopath, any height), as an edge with its waypoints
    res.forEach((r, fi) => { if (r) stitchFloor(d, d.floors[fi], fi); });
    // reachability from the dungeon entry (floor 0's entry, or any 'entry' vertex reachable via links)
    const PURE = loadPure();
    const rep = { name: d.name, key: d.key, floors: [], unreachable: [], ms: 0 };
    if (PURE) {
      const RG = PURE.rgBuild(d);
      d.floors.forEach((F, fi) => {
        const g = F.graph; if (!g) { rep.floors.push({ name: F.name, rooms: (F.rooms || []).length, graph: false }); return; }
        const st = g.stats; let reach = 0;
        (F.rooms || []).forEach(r => {
          if ((r.polyInfo || {}).quality === 'duplicate') return;
          if (!r.poly) { rep.unreachable.push({ room: r.id, floor: F.name, why: 'no polygon' }); return; }
          const tv = PURE.rgRoomVertex(RG, r.id);
          if (tv < 0) { const u = (st.unplaced || []).find(x => x.id === r.id); rep.unreachable.push({ room: r.id, floor: F.name, why: u ? u.why : 'no vertex' }); return; }
          const p = PURE.rgPlan(RG, { start: 'outside' }, { vertex: tv });
          if (p.ok) reach++; else rep.unreachable.push({ room: r.id, floor: F.name, why: p.why });
        });
        rep.floors.push({ name: F.name, rooms: (F.rooms || []).filter(r => (r.polyInfo || {}).quality !== 'duplicate').length, reachable: reach, nodes: st.nodes, corridors: st.corridors, doors: st.doors, edges: st.edges, links: (F.links || []).map(l => `${l.kind}${l.npc ? ' ' + l.npc.name : ''} -> ${typeof l.to === 'number' ? (l.to < 0 ? 'outside' : d.floors[l.to] ? d.floors[l.to].name : l.to) : l.to}${l.verified === true ? ' (live)' : l.verified ? ' (' + l.verified + ')' : ''}`) });
      });
      // images (+ the Cruma route 1 -> 2 -> 3 through the rooms)
      if (images) {
        let routeBy = {};
        if (d.key === 'cruma') {
          const target = (d.floors[2].rooms || [])[0];
          const p = target ? PURE.rgPlan(RG, { start: 'outside' }, { vertex: PURE.rgRoomVertex(RG, target.id) }) : null;
          const p2 = PURE.rgPlan(RG, { start: 'outside' }, { vertex: PURE.rgRoomVertex(RG, 'cruma-2-left-b') });
          rep.crumaRoute = p ? { to: target.id, ok: p.ok, text: p.text, steps: p.steps.map(s => s.label), lengthUnits: p.len } : null;
          rep.crumaRouteLeftB = p2 ? { to: 'cruma-2-left-b', ok: p2.ok, text: p2.text, steps: p2.steps.map(s => s.label), lengthUnits: p2.len } : null;
          if (p && p.ok) p.steps.forEach(s => { if (s.do === 'walk' || s.do === 'stairs') (s.pts || [{ x: s.x, y: s.y }]).forEach(q => (routeBy[s.floor] = routeBy[s.floor] || []).push({ x: q.x, y: q.y })); });
          // the user's case 2026-10-09 09:10: members in the west corridor of floor 2 (~19400,109600) -> cruma-2-left-b
          const p3 = PURE.rgPlan(RG, { x: 19400, y: 109600, z: -9040 }, { room: 'cruma-2-left-b' });
          rep.crumaWestToLeftB = { ok: p3.ok, why: p3.why, text: p3.text, points: p3.ok ? [].concat(...p3.steps.map(s => (s.pts || []).map(q => [q.x, q.y]))) : [] };
          if (p3.ok) routeBy['w1'] = [].concat(...p3.steps.map(s => s.pts || []));
        }
        res.forEach((r, fi) => { if (r) drawFloor(d, d.floors[fi], fi, r, routeBy[fi], `${d.key}_f${fi + 1}`); });
        if (routeBy.w1 && res[1]) drawFloor(d, d.floors[1], 1, res[1], routeBy.w1, `${d.key}_f2_west_to_left-b`);
      }
    }
    rep.ms = Date.now() - t1;
    report.dungeons.push(rep);
    console.log(`${d.name}: ${rep.floors.map(f => `${f.name} ${f.reachable === undefined ? '-' : f.reachable + '/' + f.rooms} rooms reachable, ${f.doors} doors, ${f.corridors} corridors`).join(' | ')}${rep.unreachable.length ? ' — UNREACHABLE ' + rep.unreachable.map(u => u.room).join(', ') : ''} (${Math.round(rep.ms / 1000)} s)`);
  });
  report.ms = Date.now() - t0;
  fs.writeFileSync(path.join(ROOT, 'docs', 'plan', 'room_polys', 'graph_report.json'), JSON.stringify(report, null, 1));
  if (dry) { console.log('dry run: dungeon_rooms.json not written'); process.exit(0); }
  const bak = path.join(ROOT, 'Settings', 'backup', `dungeon_rooms_before_roomgraph_${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.copyFileSync(FILE, bak);
  // the graphs go to one small file per dungeon (Scripts/data/dungeon_graph/<key>.json): every bot window reads dungeon_rooms.json, only the
  // windows walking in that dungeon need its graph (2.5 MB for all 30). dungeon_rooms.json keeps floors[].graphStats + the links.
  const GD = path.join(DATA, 'dungeon_graph'); fs.mkdirSync(GD, { recursive: true });
  all.forEach(d => {
    if (only && !only.includes(d.key)) { d.floors.forEach(F => { if (F.graph) { F.graphStats = F.graph.stats; delete F.graph; } }); return; }
    const gf = { name: d.name, key: d.key, built: new Date().toISOString(), floors: d.floors.map(F => ({ name: F.name, graph: F.graph || null })) };
    if (d.floors.some(F => F.graph)) fs.writeFileSync(path.join(GD, d.key + '.json'), JSON.stringify(gf));
    d.floors.forEach(F => { if (F.graph) { F.graphStats = F.graph.stats; delete F.graph; } });
  });
  MG.writeGuarded(FILE, all, 'room', { who: 'room_graph.js' });
  console.log(`written (backup ${path.relative(ROOT, bak)}); report docs/plan/room_polys/graph_report.json; images docs/plan/room_polys/graph/ (compose: render_room_checks.ps1 -Dir docs\\plan\\room_polys\\graph)`);
}
module.exports = { floorGraph, walkLinks, labelRooms, stitchFloor, resample, legs, segClear, nb8, Heap, snapCell, cellXY, LEG, symmetrize };
