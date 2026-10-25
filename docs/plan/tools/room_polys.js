// ROOM POLYGONS (user 2026-10-08 17:35: "In Cruma Tower there are multiple rooms; ideally it should take a room and stay there, so the square
// should fit the room ... set them up based on the maps. Same for all other dungeons, catacombs, necropolis, Antharas Lair, Monastery").
//
// For every room of Scripts/data/dungeon_rooms.json this computes the room's real outline from the L2J geodata (Geodata/*.l2j, reader
// geopath.js) and writes  room.poly [[x,y],...]  room.zRange [zMin,zMax]  room.area (game units^2)  room.polyInfo {method, quality, ...}.
//
// Method per floor (z band of the floor):
//  1. WALKABLE: flood fill from every room centre over the geodata cells (16x16 units) of that z band, 4 neighbours, NSWE walls and
//     height steps <= 48 respected (the same movement rule as geopath.js). Cells not reachable from any room are ignored.
//  2. CLEARANCE: distance (in cells) from every walkable cell to the nearest wall / cliff / edge, walking only through open edges
//     (multi-source Dijkstra, 8 neighbours) — so a thin wall between two rooms counts as a wall.
//  3. CUT THE DOORWAYS: for T = 4..28 cells the "core" = cells with clearance >= T; a corridor or doorway narrower than 2T disappears from
//     the core, so rooms fall apart into separate core components. Each room takes the SMALLEST T at which its core component holds no
//     other room centre and is not larger than a capped area (open caves) -> the biggest shape that is still only this room.
//     Rooms that never separate (two spawn groups in one hall) split the shared core by geodesic distance (nearest room centre wins).
//  4. GROW BACK: each core grows back by its own T (geodesic, through open edges; first come first served), so the room gets its walls
//     back but only a stub (<= T) of every corridor. Cells farther than the cap from the room centre are cut (open caves).
//  5. OUTLINE: holes filled, outer boundary traced along the cell edges, Douglas-Peucker simplified (tolerance raised until <= 40 corners,
//     never self-intersecting).
//  6. CHECK: the floor's monster spawns (spawns_h5.json, the room's monster ids) are assigned to the nearest room centre (as when the rooms
//     were made); own = share of the room's own spawns inside its polygon; foreign = spawns of other rooms inside it.
//     Fallback when the geodata gives no clean room (own < 50 %, centre not walkable, tiny/huge area): the convex hull of the room's own
//     spawns + 250, clipped to the walkable cells connected to the centre (method 'spawn-hull').
//  7. IMAGES: docs/plan/room_polys/<dungeon>_f<n>.png — the floor's map layer (Maps/high) with the walkable cells, every polygon and the
//     spawns on top (rendered by render_room_checks.ps1), plus index.html with the quality table.
//
// Use:  node room_polys.js [--only cruma,giants] [--no-images] [--dry]       (writes dungeon_rooms.json, backup in Settings/backup/)
//       node room_polys.js --catacombs     first adds the 14 catacombs/necropolises (catacomb_rooms.js) — done by default when missing
const fs = require('fs'), path = require('path'), zlib = require('zlib'), cp = require('child_process');
const geo = require('./geopath');
const ROOT = path.join(__dirname, '..', '..', '..');
const DATA = path.join(ROOT, 'Scripts', 'data');
const OUTDIR = path.join(ROOT, 'docs', 'plan', 'room_polys');
const MG = require('./manual_guard');      // POLYEDIT 2026-10-08: dashboard-edited rooms are kept
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, ''));
const WX0 = -294912, WY0 = -262144, CELL = 16;
const DIRS4 = [[1, 0, 1], [-1, 0, 2], [0, 1, 4], [0, -1, 8]];          // dx, dy, NSWE bit (E W S N)
const MAX_STEP = 48;
const argv = process.argv.slice(2);
const arg = (k) => { const i = argv.indexOf(k); return i >= 0 ? (argv[i + 1] || true) : null; };

// ---------------------------------------------------------------------------------------------------------------------------------
// floor grid
// ---------------------------------------------------------------------------------------------------------------------------------
/** Walkable cells of one floor: flood from the seeds inside bbox [x1,x2,y1,y2] and z band. */
function buildFloor(bbox, zBand, seeds) {
  const gx0 = geo.toGeoX(bbox[0]), gx1 = geo.toGeoX(bbox[1]), gy0 = geo.toGeoY(bbox[2]), gy1 = geo.toGeoY(bbox[3]);
  const w = gx1 - gx0 + 1, h = gy1 - gy0 + 1, n = w * h;
  const H = new Int16Array(n), NS = new Uint8Array(n), OK = new Uint8Array(n);
  const q = new Int32Array(n); let qh = 0, qt = 0;
  const inBand = (z) => z >= zBand[0] && z <= zBand[1];
  const seedIdx = seeds.map(s => {
    const sx = geo.toGeoX(s.x), sy = geo.toGeoY(s.y);
    let best = null, bd = 1e9;
    for (let r = 0; r <= 10 && !best; r++) for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const gx = sx + dx, gy = sy + dy; if (gx < gx0 || gx > gx1 || gy < gy0 || gy > gy1) continue;
      const ls = geo.layers(gx, gy); if (!ls) continue;
      ls.forEach(l => { if (!l.nswe || !inBand(l.h)) return; const d = Math.abs(l.h - s.z) + r * 20; if (Math.abs(l.h - s.z) < 400 && d < bd) { bd = d; best = { gx, gy, l }; } });
    }
    if (!best) return -1;
    const i = (best.gy - gy0) * w + (best.gx - gx0);
    if (!OK[i]) { OK[i] = 1; H[i] = best.l.h; NS[i] = best.l.nswe; q[qt++] = i; }
    return i;
  });
  while (qh < qt) {
    const i = q[qh++], gx = gx0 + (i % w), gy = gy0 + ((i / w) | 0);
    for (const [dx, dy, bit] of DIRS4) {
      if (!(NS[i] & bit)) continue;
      const nx = gx + dx, ny = gy + dy; if (nx < gx0 || nx > gx1 || ny < gy0 || ny > gy1) continue;
      const j = (ny - gy0) * w + (nx - gx0); if (OK[j]) continue;
      const nl = geo.layers(nx, ny); if (!nl || !nl.length) continue;
      let best = null, bd = 1e9; nl.forEach(l => { const d = Math.abs(l.h - H[i]); if (d < bd) { bd = d; best = l; } });
      if (!best || bd > MAX_STEP || !best.nswe || !inBand(best.h)) continue;
      OK[j] = 1; H[j] = best.h; NS[j] = best.nswe; q[qt++] = j;
    }
  }
  return { gx0, gy0, w, h, n, H, NS, OK, seedIdx, cells: qt };
}
/** Neighbour index through an OPEN edge, or -1. */
function nb(F, i, k) {
  const [dx, dy, bit] = DIRS4[k];
  if (!(F.NS[i] & bit)) return -1;
  const x = i % F.w, y = (i / F.w) | 0, nx = x + dx, ny = y + dy;
  if (nx < 0 || ny < 0 || nx >= F.w || ny >= F.h) return -1;
  const j = ny * F.w + nx;
  if (!F.OK[j] || Math.abs(F.H[j] - F.H[i]) > MAX_STEP) return -1;
  return j;
}
/** 8 neighbours with costs (diagonal only when both straight ways round the corner are open). */
function nb8(F, i, out) {
  let c = 0;
  const e = nb(F, i, 0), wv = nb(F, i, 1), s = nb(F, i, 2), nn = nb(F, i, 3);
  if (e >= 0) { out[c++] = e; out[c++] = 10; }
  if (wv >= 0) { out[c++] = wv; out[c++] = 10; }
  if (s >= 0) { out[c++] = s; out[c++] = 10; }
  if (nn >= 0) { out[c++] = nn; out[c++] = 10; }
  const dg = (a, ka, b, kb) => { if (a < 0 || b < 0) return -1; const x = nb(F, a, kb), y = nb(F, b, ka); return x >= 0 && x === y ? x : -1; };
  let d;
  if ((d = dg(e, 0, s, 2)) >= 0) { out[c++] = d; out[c++] = 14; }
  if ((d = dg(e, 0, nn, 3)) >= 0) { out[c++] = d; out[c++] = 14; }
  if ((d = dg(wv, 1, s, 2)) >= 0) { out[c++] = d; out[c++] = 14; }
  if ((d = dg(wv, 1, nn, 3)) >= 0) { out[c++] = d; out[c++] = 14; }
  return c;
}
// bucket queue for integer costs (10 = one cell)
class BQ {
  constructor() { this.b = []; this.cur = 0; this.size = 0; }
  push(k, v) { (this.b[k] || (this.b[k] = [])).push(v); this.size++; if (k < this.cur) this.cur = k; }
  pop() { while (!this.b[this.cur] || !this.b[this.cur].length) this.cur++; this.size--; return [this.cur, this.b[this.cur].pop()]; }
}
/** Clearance: cost (x10 per cell) from every walkable cell to the nearest blocked edge. */
function clearance(F) {
  const D = new Int32Array(F.n).fill(2147483647), Q = new BQ(), tmp = new Int32Array(16);
  for (let i = 0; i < F.n; i++) {
    if (!F.OK[i]) continue;
    let edge = false; for (let k = 0; k < 4; k++) if (nb(F, i, k) < 0) { edge = true; break; }
    if (edge) { D[i] = 10; Q.push(10, i); }
  }
  while (Q.size) {
    const [d, i] = Q.pop(); if (d > D[i]) continue;
    const c = nb8(F, i, tmp);
    for (let t = 0; t < c; t += 2) { const j = tmp[t], nd = d + tmp[t + 1]; if (nd < D[j]) { D[j] = nd; Q.push(nd, j); } }
  }
  return D;
}
/** Connected components (4-neighbour, open edges) of the cells with D >= T*10. */
function components(F, D, T) {
  const L = new Int32Array(F.n).fill(-1), q = new Int32Array(F.n), area = [];
  let lab = 0;
  for (let s = 0; s < F.n; s++) {
    if (!F.OK[s] || D[s] < T * 10 || L[s] >= 0) continue;
    let qh = 0, qt = 0; q[qt++] = s; L[s] = lab;
    while (qh < qt) { const i = q[qh++]; for (let k = 0; k < 4; k++) { const j = nb(F, i, k); if (j >= 0 && L[j] < 0 && D[j] >= T * 10) { L[j] = lab; q[qt++] = j; } } }
    area.push(qt); lab++;
  }
  return { L, area };
}
/** Geodesic multi-source growth. sources: Map label -> [cells]; limit per label (cost x10); allowed(i) filter. Returns label per cell. */
function grow(F, sources, limits, allowed) {
  const lab = new Int32Array(F.n).fill(-1), D = new Int32Array(F.n).fill(2147483647), Q = new BQ(), tmp = new Int32Array(16);
  sources.forEach((cells, l) => cells.forEach(i => { if (lab[i] < 0) { D[i] = 0; lab[i] = l; Q.push(0, i); } }));
  while (Q.size) {
    const [d, i] = Q.pop(); if (d > D[i]) continue;
    const l = lab[i], c = nb8(F, i, tmp);
    for (let t = 0; t < c; t += 2) {
      const j = tmp[t], nd = d + tmp[t + 1];
      if (nd > limits[l] || nd >= D[j] || (allowed && !allowed(j, l))) continue;
      D[j] = nd; lab[j] = l; Q.push(nd, j);
    }
  }
  return { lab, D };
}
/** Geodesic distance (x10) from one cell inside a cell set. */
function geodesic(F, start, inSet, limit) {
  const D = new Map(), Q = new BQ(), tmp = new Int32Array(16);
  (Array.isArray(start) ? start : [start]).forEach(i => { D.set(i, 0); Q.push(0, i); });
  while (Q.size) {
    const [d, i] = Q.pop(); if (d > D.get(i)) continue;
    const c = nb8(F, i, tmp);
    for (let t = 0; t < c; t += 2) { const j = tmp[t], nd = d + tmp[t + 1]; if (nd > limit || (inSet && !inSet(j))) continue; const o = D.get(j); if (o === undefined || nd < o) { D.set(j, nd); Q.push(nd, j); } }
  }
  return D;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// outline: cells -> polygon
// ---------------------------------------------------------------------------------------------------------------------------------
/** cells (Set of grid idx) -> outer boundary as corner points [x,y] in grid-corner units (holes filled). */
function outline(F, cells) {
  let x1 = 1e9, y1 = 1e9, x2 = -1, y2 = -1;
  cells.forEach(i => { const x = i % F.w, y = (i / F.w) | 0; if (x < x1) x1 = x; if (x > x2) x2 = x; if (y < y1) y1 = y; if (y > y2) y2 = y; });
  const bw = x2 - x1 + 3, bh = y2 - y1 + 3, M = new Uint8Array(bw * bh);       // 1-cell empty frame
  cells.forEach(i => { const x = i % F.w - x1 + 1, y = ((i / F.w) | 0) - y1 + 1; M[y * bw + x] = 1; });
  // fill holes: flood the outside from the frame
  const out = new Uint8Array(bw * bh), q = new Int32Array(bw * bh); let qh = 0, qt = 0;
  q[qt++] = 0; out[0] = 1;
  while (qh < qt) { const i = q[qh++], x = i % bw, y = (i / bw) | 0;
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= bw || ny >= bh) return; const j = ny * bw + nx; if (!out[j] && !M[j]) { out[j] = 1; q[qt++] = j; } }); }
  const IN = (x, y) => x >= 0 && y >= 0 && x < bw && y < bh && !out[y * bw + x];
  // directed boundary edges, region on the left when walking (y down): store from-corner -> list of to-corners
  const edges = new Map(); const key = (x, y) => y * (bw + 1) + x;
  const add = (ax, ay, bx, by) => { const k = key(ax, ay); (edges.get(k) || edges.set(k, []).get(k)).push([bx, by]); };
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
    if (!IN(x, y)) continue;
    if (!IN(x, y - 1)) add(x + 1, y, x, y);          // top edge, walking west
    if (!IN(x, y + 1)) add(x, y + 1, x + 1, y + 1);  // bottom edge, walking east
    if (!IN(x - 1, y)) add(x, y, x, y + 1);          // left edge, walking south
    if (!IN(x + 1, y)) add(x + 1, y + 1, x + 1, y);  // right edge, walking north
  }
  // trace loops; at a corner with two choices take the sharpest turn consistently (keeps loops simple)
  const loops = [];
  while (edges.size) {
    const [k0, l0] = edges.entries().next().value; const sx = k0 % (bw + 1), sy = (k0 / (bw + 1)) | 0;
    let cx = sx, cy = sy, px = null, py = null; const loop = [];
    for (let guard = 0; guard < 1e7; guard++) {
      const k = key(cx, cy), list = edges.get(k); if (!list || !list.length) break;
      let pick = 0;
      if (list.length > 1 && px !== null) {
        const dx = cx - px, dy = cy - py; let bestS = -9;
        list.forEach((t, ti) => { const ex = t[0] - cx, ey = t[1] - cy; const cr = dx * ey - dy * ex, dt = dx * ex + dy * ey; const s = cr > 0 ? 2 : dt > 0 ? 1 : 0; if (s > bestS) { bestS = s; pick = ti; } });
      }
      const [nx, ny] = list.splice(pick, 1)[0]; if (!list.length) edges.delete(k);
      loop.push([cx, cy]); px = cx; py = cy; cx = nx; cy = ny;
      if (cx === sx && cy === sy && !(edges.get(key(sx, sy)) || []).length) break;
    }
    loops.push(loop);
  }
  loops.sort((a, b) => b.length - a.length);
  const L = loops[0] || [];
  // grid corner -> world
  return L.map(([x, y]) => [(F.gx0 + x1 - 1 + x) * CELL + WX0, (F.gy0 + y1 - 1 + y) * CELL + WY0]);
}
const polyArea = (P) => { let a = 0; for (let i = 0, j = P.length - 1; i < P.length; j = i++) a += (P[j][0] + P[i][0]) * (P[j][1] - P[i][1]); return Math.abs(a / 2); };
function inPoly(x, y, P) { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b = P[j]; if (((a[1] > y) !== (b[1] > y)) && (x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0])) c = !c; } return c; }
function segX(a, b, c, d) {
  const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
}
function selfIntersects(P) {
  const n = P.length;
  for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) { if (i === 0 && j === n - 1) continue; if (segX(P[i], P[(i + 1) % n], P[j], P[(j + 1) % n])) return true; }
  return false;
}
function dp(pts, eps) {           // open polyline Douglas-Peucker
  if (pts.length < 3) return pts.slice();
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const st = [[0, pts.length - 1]];
  while (st.length) {
    const [a, b] = st.pop(); let md = -1, mi = -1;
    const A = pts[a], B = pts[b], L = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1e-9;
    for (let i = a + 1; i < b; i++) { const d = Math.abs((B[0] - A[0]) * (A[1] - pts[i][1]) - (A[0] - pts[i][0]) * (B[1] - A[1])) / L; if (d > md) { md = d; mi = i; } }
    if (md > eps) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
function simplifyLoop(P, maxPts) {
  // drop collinear corner points, split the loop at two far apart points, DP both halves; raise eps until <= maxPts, never self-intersecting
  let far = 0; P.forEach((p, i) => { if (Math.hypot(p[0] - P[0][0], p[1] - P[0][1]) > Math.hypot(P[far][0] - P[0][0], P[far][1] - P[0][1])) far = i; });
  let best = null;
  for (let eps = 20; eps <= 400; eps *= 1.25) {
    const a = dp(P.slice(0, far + 1), eps), b = dp(P.slice(far).concat([P[0]]), eps);
    const Q = a.concat(b.slice(1, -1));
    if (Q.length < 3) break;
    if (selfIntersects(Q)) continue;
    best = { pts: Q, eps: Math.round(eps) };
    if (Q.length <= maxPts) break;
  }
  return best;
}
function convexHull(pts) {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]); if (p.length < 3) return p;
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  p.forEach(q => { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); });
  p.slice().reverse().forEach(q => { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); });
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
const distToSeg = (x, y, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy; let t = L ? ((x - a[0]) * dx + (y - a[1]) * dy) / L : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy); };
const distToPoly = (x, y, P) => inPoly(x, y, P) ? 0 : Math.min(...P.map((p, i) => distToSeg(x, y, p, P[(i + 1) % P.length])));

// ---------------------------------------------------------------------------------------------------------------------------------
// one floor
// ---------------------------------------------------------------------------------------------------------------------------------
const TMIN = 4, TMAX = 28;
function floorPolys(d, F, fi, spawnsAll, ctx) {
  const rooms = F.rooms || (F.rooms = []);
  const t0 = Date.now();
  const zBand = [F.z[0] - 250, F.z[1] + 250];
  // floor box: room centres +- 4000 (a floor without rooms yet: its own box), inside the dungeon box + 1500
  const B = d.bbox;
  let box;
  if (rooms.length) {
    const xs = rooms.map(r => r.center[0]), ys = rooms.map(r => r.center[1]);
    box = [Math.max(B[0] - 1500, Math.min(...xs) - 4000), Math.min(B[1] + 1500, Math.max(...xs) + 4000), Math.max(B[2] - 1500, Math.min(...ys) - 4000), Math.min(B[3] + 1500, Math.max(...ys) + 4000)];
  } else box = [B[0] - 1500, B[1] + 1500, B[2] - 1500, B[3] + 1500];
  // the floor's monsters: every room's monster ids (+ F.monsterIds for a dungeon without rooms yet, the catacombs)
  const ids = new Set(F.monsterIds || []); rooms.forEach(r => (r.monsters || []).forEach(m => ids.add(m.id)));
  const spF = spawnsAll.filter(s => ids.has(s.id) && s.x >= box[0] && s.x <= box[1] && s.y >= box[2] && s.y <= box[3] && s.z >= F.z[0] - 150 && s.z <= F.z[1] + 150);
  // walkable: flood from the room centres, the floor entry and every monster spawn of the floor
  const entry = (F.entryPoint && F.entryPoint.at) || (F.enter && (F.enter.landing || F.enter.from)) || null;
  const floodSeeds = rooms.map(r => ({ x: r.center[0], y: r.center[1], z: r.center[2] }))
    .concat(spF.map(s => ({ x: s.x, y: s.y, z: s.z })))
    .concat(entry && entry[2] >= zBand[0] && entry[2] <= zBand[1] ? [{ x: entry[0], y: entry[1], z: entry[2] }] : []);
  const G = buildFloor(box, zBand, floodSeeds);
  const D = clearance(G);
  const cx = (i) => (G.gx0 + (i % G.w)) * CELL + WX0 + 8, cy = (i) => (G.gy0 + ((i / G.w) | 0)) * CELL + WY0 + 8;
  const cellOf = (x, y) => { const gx = geo.toGeoX(x) - G.gx0, gy = geo.toGeoY(y) - G.gy0; return gx < 0 || gy < 0 || gx >= G.w || gy >= G.h ? -1 : gy * G.w + gx; };
  // spawns assigned to the nearest room centre (as when the rooms were made); too far from any room = unassigned (-1)
  const sp = spF.map(s => { let bi = -1, bd = 1e9; rooms.forEach((r, k) => { const dd = Math.hypot(s.x - r.center[0], s.y - r.center[1], (s.z - r.center[2]) * 2); if (dd < bd) { bd = dd; bi = k; } });
    if (bi >= 0 && bd > Math.max(2500, (rooms[bi].radius || 800) * 2.2)) bi = -1; return { ...s, room: bi, dist: bd }; });
  // seeds: the cell with the most clearance within 400 of the centre (reachable ones only)
  const seeds = rooms.map((r, k) => {
    const s0 = G.seedIdx[k]; if (s0 < 0) return -1;
    let best = s0;
    const near = geodesic(G, s0, (j) => G.OK[j] === 1, 400 / CELL * 10);
    near.forEach((dd, j) => { if (D[j] > D[best]) best = j; });
    return best;
  });
  // components for every T (only kept as the label of each seed + area + which seeds share it)
  const compAt = {};
  for (let T = TMIN; T <= TMAX; T++) {
    const C = components(G, D, T);
    compAt[T] = seeds.map(s => (s >= 0 && D[s] >= T * 10) ? { lab: C.L[s], area: C.area[C.L[s]], with: seeds.map((o, k) => (o >= 0 && C.L[o] === C.L[s] ? k : -1)).filter(k => k >= 0) } : null);
    compAt[T].L = C.L; compAt[T].area = C.area;
  }
  const choice = rooms.map((r, k) => {
    if (seeds[k] < 0) return { k, why: 'centre not on walkable geodata of this floor' };
    const Rcap = Math.max(1600, (r.radius || 800) * 2.4), Amax = Math.PI * Rcap * Rcap / (CELL * CELL);
    let firstSmall = null;
    for (let T = TMIN; T <= TMAX; T++) {
      const c = compAt[T][k]; if (!c) break;
      if (c.area <= Amax * 1.5 && !firstSmall) firstSmall = T;
      if (c.with.length === 1) return { k, T, isolated: true, area: c.area, Rcap, capped: c.area > Amax };
    }
    const T = firstSmall || TMIN; const c = compAt[T][k] || compAt[TMIN][k];
    return { k, T, isolated: false, shared: c ? c.with : [k], Rcap, capped: true };
  });
  // core cells per room (shared cores: nearest seed by geodesic distance inside the core)
  const cores = new Map();
  const byT = {}; choice.forEach(c => { if (c.T) (byT[c.T] = byT[c.T] || []).push(c); });
  Object.keys(byT).forEach(Ts => {
    const T = +Ts, L = compAt[T].L;
    byT[T].forEach(c => {
      const lab = L[seeds[c.k]]; if (lab < 0) return;
      const cells = []; for (let i = 0; i < G.n; i++) if (L[i] === lab) cells.push(i);
      if (c.isolated) { cores.set(c.k, cells); return; }
      const inCore = new Uint8Array(G.n); cells.forEach(i => { inCore[i] = 1; });
      const srcs = new Map(); c.shared.forEach(o => { if (seeds[o] >= 0 && inCore[seeds[o]]) srcs.set(o, [seeds[o]]); });
      const lim = []; srcs.forEach((_, o) => { lim[o] = 1e9; });
      const gg = grow(G, srcs, lim, (j) => inCore[j] === 1);
      cores.set(c.k, cells.filter(i => gg.lab[i] === c.k));
    });
  });
  // grow back by T (first come first served), cap by geodesic distance from the seed
  const limits = []; choice.forEach(c => { limits[c.k] = ((c.T || TMIN) + 1.5) * 10; });
  const g = grow(G, cores, limits, null);
  const neckT = {};
  const near5 = (set, s) => { const c0 = cellOf(s.x, s.y); if (c0 < 0) return false; const x = c0 % G.w, y = (c0 / G.w) | 0; for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) if (set.has((y + dy) * G.w + x + dx)) return true; return false; };
  const result = rooms.map((r, k) => {
    const c = choice[k]; let cells = [];
    if (cores.has(k)) { for (let i = 0; i < G.n; i++) if (g.lab[i] === k) cells.push(i); }
    let capped = false;
    if (cells.length && seeds[k] >= 0) {
      const set = new Uint8Array(G.n); cells.forEach(i => { set[i] = 1; });
      const gd = geodesic(G, seeds[k], (j) => set[j] === 1, c.Rcap / CELL * 10);
      const kept = cells.filter(i => gd.has(i)); capped = kept.length < cells.length * 0.98; cells = kept;
    }
    // NECK CUT (wide corridors that lead nowhere stay attached at the isolating T, e.g. the Cruma 2nd floor alcoves): for every bigger T
    // (up to +12) take the room body = the core at T, and keep only the cells within T*16+100 of that body's convex hull. The smallest
    // result that still holds (almost) all the room's own spawns AND only loses a real protrusion wins (see protrudes()).
    if (cells.length > 20 && c.isolated && seeds[k] >= 0) {
      const mine = sp.filter(s => s.room === k);
      const cellSet = new Set(cells);
      const cands = [{ T: c.T, cells, cov: mine.length ? mine.filter(s => near5(cellSet, s)).length / mine.length : 1 }];
      for (let T = c.T + 1; T <= Math.min(TMAX, c.T + 12); T++) {
        if (D[seeds[k]] < T * 10) break;
        const core = [seeds[k]], seen = new Set(core);
        for (let h = 0; h < core.length; h++) for (let kk = 0; kk < 4; kk++) { const j = nb(G, core[h], kk); if (j >= 0 && !seen.has(j) && D[j] >= T * 10 && cellSet.has(j)) { seen.add(j); core.push(j); } }
        const hull = convexHull(core.map(i => [cx(i), cy(i)])); if (hull.length < 3) continue;
        const m = T * CELL + 100;
        const sub = cells.filter(i => distToPoly(cx(i), cy(i), hull) <= m);
        const set = new Uint8Array(G.n); sub.forEach(i => { set[i] = 1; }); if (!set[seeds[k]]) continue;
        const gd2 = geodesic(G, seeds[k], (j) => set[j] === 1, 1e9); const sub2 = sub.filter(i => gd2.has(i)); const ss = new Set(sub2);
        cands.push({ T, cells: sub2, cov: mine.length ? mine.filter(s => near5(ss, s)).length / mine.length : 1 });
      }
      const top = Math.max(...cands.map(x => x.cov));
      // only a real protrusion is cut: most of what goes (>= 55 %) must lie > 300 outside the convex hull of what stays (a hall whose
      // high-T body misses its corners/ring walkways is NOT cut — its corners lie just outside; a corridor stub sticks out far)
      const protrudes = (x) => {
        if (x.cells.length >= cells.length * 0.92) return false;
        const ph = convexHull(x.cells.map(i => [cx(i), cy(i)])), ps = new Set(x.cells);
        const gone = cells.filter(i => !ps.has(i)).filter((i, n) => n % 3 === 0), far = gone.filter(i => distToPoly(cx(i), cy(i), ph) > 300).length;
        return far >= gone.length * 0.55;
      };
      const pick = cands.filter(x => x !== cands[0] && x.cov >= top - 0.04).sort((a, b) => a.cells.length - b.cells.length).find(protrudes);
      if (pick) { neckT[k] = pick.T; cells = pick.cells; capped = false; }
    }
    return { r, k, c, cells, capped };
  });
  // owner of every cell (a fallback room may not take a cell another room already holds)
  const owner = new Int16Array(G.n).fill(-1);
  result.forEach(R => R.cells.forEach(i => { owner[i] = R.k; }));
  // --- stage A: outlines (+ spawn-hull fallback) for the existing rooms ---
  const mkPoly = (cells) => { if (cells.length <= 20) return null; const s = simplifyLoop(outline(G, cells), 40); return s ? { pts: s.pts, eps: s.eps } : null; };
  const quick = (P, k) => { const mine = sp.filter(s => s.room === k); return mine.length ? mine.filter(s => distToPoly(s.x, s.y, P) <= 150).length / mine.length : 1; };
  result.forEach(R => {
    const r = R.r, circleA = Math.PI * Math.pow(Math.max(500, r.radius || 700), 2);
    R.method = 'geodata'; let s = mkPoly(R.cells);
    let cov = s ? quick(s.pts, R.k) : 0;
    const bad = !s || cov < 0.5 || polyArea(s.pts) < circleA * 0.15 || (!inPoly(r.center[0], r.center[1], s.pts) && distToPoly(r.center[0], r.center[1], s.pts) > 300);
    const mine = sp.filter(x => x.room === R.k);
    if (bad && mine.length >= 2 && seeds[R.k] >= 0) {
      // fallback: convex hull of the own spawns + 250, clipped to walkable cells connected to the centre that no other room holds
      const hull = convexHull(mine.map(x => [x.x, x.y]).concat([[r.center[0], r.center[1]]]));
      const inside = (i) => { const x = cx(i), y = cy(i); return hull.length >= 3 ? distToPoly(x, y, hull) <= 250 : Math.hypot(x - r.center[0], y - r.center[1]) <= 400; };
      const gd = geodesic(G, seeds[R.k], (j) => G.OK[j] === 1 && (owner[j] < 0 || owner[j] === R.k) && inside(j), 4000 / CELL * 10);
      const cells = [...gd.keys()], s2 = mkPoly(cells);
      if (s2) { const cov2 = quick(s2.pts, R.k); if (!s || cov2 > cov) { R.cells.forEach(i => { if (owner[i] === R.k) owner[i] = -1; }); cells.forEach(i => { owner[i] = R.k; }); s = s2; cov = cov2; R.method = 'spawn-hull'; R.cells = cells; } }
    }
    if (!s) { R.fail = R.c.why || 'no outline'; return; }
    R.poly = s.pts.map(p => [Math.round(p[0]), Math.round(p[1])]); R.eps = s.eps;
  });
  // --- stage B: NEW rooms for monster groups no polygon covers (rooms the spawn clustering merged away, corridors with monsters, and every
  // room of a dungeon that had none: the catacombs/necropolises). Spawns grouped by the geodata room (core component at the floor's
  // typical T) they stand in; big open components are split by distance (900). Each group -> the component grown back (or the spawn hull
  // clipped to walkable cells), never taking cells another room holds. ---
  const added = [];
  const Ts = choice.filter(c => c.isolated).map(c => c.T).sort((a, b) => a - b);
  const Tf = Ts.length ? Ts[Math.floor(Ts.length / 2)] : 8;
  const L = compAt[Tf].L, Aarea = compAt[Tf].area;
  const covered = (s) => result.some(R => R.poly && inPoly(s.x, s.y, R.poly) && Math.abs(s.z - R.r.center[2]) < 600);
  const unc = sp.filter(s => !covered(s) && cellOf(s.x, s.y) >= 0 && G.OK[cellOf(s.x, s.y)]);
  const labOf = (s) => { const c0 = cellOf(s.x, s.y); const x = c0 % G.w, y = (c0 / G.w) | 0; let best = -1, bd = 1e9;
    for (let dy = -8; dy <= 8; dy++) for (let dx = -8; dx <= 8; dx++) { const j = (y + dy) * G.w + x + dx; if (j < 0 || j >= G.n || L[j] < 0) continue; const dd = dx * dx + dy * dy; if (dd < bd) { bd = dd; best = L[j]; } } return best; };
  const AmaxDefault = Math.PI * 2200 * 2200 / (CELL * CELL);
  const groups = new Map();
  unc.forEach(s => { const l = labOf(s); const key = l >= 0 && Aarea[l] <= AmaxDefault ? 'c' + l : 'open' + (l >= 0 ? l : 'x'); (groups.get(key) || groups.set(key, []).get(key)).push(s); });
  const clusters = [];
  groups.forEach((list, key) => {
    if (key.startsWith('c')) { clusters.push({ list, lab: +key.slice(1) }); return; }
    // open area: single-link 900, big groups split to <= 2000 across
    const parent = list.map((_, i) => i), find = (i) => parent[i] === i ? i : (parent[i] = find(parent[i]));
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) if (Math.hypot(list[i].x - list[j].x, list[i].y - list[j].y) < 900) parent[find(i)] = find(j);
    const m = new Map(); list.forEach((s, i) => { const r0 = find(i); (m.get(r0) || m.set(r0, []).get(r0)).push(s); });
    m.forEach(l2 => splitGroup(l2, 2000).forEach(l3 => clusters.push({ list: l3, lab: -1 })));
  });
  clusters.sort((a, b) => b.list.length - a.list.length);
  clusters.forEach(cl => {
    const n = cl.list.reduce((t, s) => t + (s.count || 1), 0);
    if (n < 3) return;
    const mx = cl.list.reduce((t, s) => t + s.x, 0) / cl.list.length, my = cl.list.reduce((t, s) => t + s.y, 0) / cl.list.length;
    const rad = Math.max(400, ...cl.list.map(s => Math.hypot(s.x - mx, s.y - my)));
    // seed: the free cell with the most clearance within 600 of the group centre (or of its spawn nearest to it)
    let seed = -1; const c0s = [cellOf(mx, my)].concat(cl.list.slice().sort((a, b) => Math.hypot(a.x - mx, a.y - my) - Math.hypot(b.x - mx, b.y - my)).slice(0, 3).map(s => cellOf(s.x, s.y)));
    for (const c0 of c0s) { if (c0 < 0) continue; const x0 = c0 % G.w, y0 = (c0 / G.w) | 0; const R0 = Math.round(600 / CELL);
      for (let dy = -R0; dy <= R0; dy++) for (let dx = -R0; dx <= R0; dx++) { if (dx * dx + dy * dy > R0 * R0) continue; const j = (y0 + dy) * G.w + x0 + dx; if (j < 0 || j >= G.n || !G.OK[j] || owner[j] >= 0) continue; if (seed < 0 || D[j] > D[seed]) seed = j; }
      if (seed >= 0) break; }
    if (seed < 0) return;
    const Rcap = Math.max(1600, rad * 2.4);
    let cells = null, method = 'geodata';
    if (cl.lab >= 0) {
      const core = []; for (let i = 0; i < G.n; i++) if (L[i] === cl.lab && owner[i] < 0) core.push(i);
      if (core.length) {
        const gr = geodesic(G, core, (j) => owner[j] < 0, (Tf + 1.5) * 10);
        const set = new Uint8Array(G.n); gr.forEach((_, i) => { set[i] = 1; });
        const st = set[seed] ? seed : core[0];
        const gd = geodesic(G, st, (j) => set[j] === 1, Rcap / CELL * 10); cells = [...gd.keys()];
      }
    }
    if (!cells || cells.length <= 20 || cl.list.filter(s => { const c = cellOf(s.x, s.y); return c >= 0 && cells.includes(c); }).length < cl.list.length * 0.5) {
      const hull = convexHull(cl.list.map(s => [s.x, s.y]));
      const inside = (i) => { const x = cx(i), y = cy(i); return hull.length >= 3 ? distToPoly(x, y, hull) <= 250 : Math.hypot(x - mx, y - my) <= Math.max(400, rad + 250); };
      const gd = geodesic(G, seed, (j) => G.OK[j] === 1 && owner[j] < 0 && inside(j), 4000 / CELL * 10); cells = [...gd.keys()]; method = 'spawn-hull';
    }
    const s = mkPoly(cells); if (!s) return;
    const k = rooms.length + added.length;
    cells.forEach(i => { owner[i] = k; });
    const poly = s.pts.map(p => [Math.round(p[0]), Math.round(p[1])]);
    // the group's spawns + any other uncovered spawn inside the new polygon belong to it
    unc.forEach(x => { if (x.room !== k && (cl.list.includes(x) || (inPoly(x.x, x.y, poly) && !covered(x)))) { x.room = k; x.newRoom = true; } });
    added.push({ k, seed, cells, poly, eps: s.eps, method, Tf, center: [cx(seed), cy(seed), G.H[seed]] });
  });
  // --- stage C: checks + quality for every polygon ---
  const all = result.concat(added.map(a => ({ r: null, k: a.k, c: { T: a.Tf, isolated: true }, cells: a.cells, poly: a.poly, eps: a.eps, method: a.method, isNew: a, capped: false })));
  all.forEach(R => {
    if (!R.poly) return;
    const mine = sp.filter(s => s.room === R.k), P = R.poly;
    const cz = R.r ? R.r.center[2] : R.isNew.center[2];
    const inside = mine.filter(s => inPoly(s.x, s.y, P)).length, near = mine.filter(s => distToPoly(s.x, s.y, P) <= 150).length;
    const foreign = sp.filter(s => s.room !== R.k && inPoly(s.x, s.y, P) && Math.abs(s.z - cz) < 400).length;
    const q = { own: mine.length ? inside / mine.length : 1, ownNear: mine.length ? near / mine.length : 1, foreign, area: polyArea(P) };
    let zmin = 1e9, zmax = -1e9; R.cells.forEach(i => { if (G.H[i] < zmin) zmin = G.H[i]; if (G.H[i] > zmax) zmax = G.H[i]; });
    mine.forEach(s => { zmin = Math.min(zmin, s.z - 50); zmax = Math.max(zmax, s.z + 50); });
    R.zRange = [Math.round(zmin - 100), Math.round(zmax + 150)];
    const radius = R.r ? R.r.radius : 700, circleA = Math.PI * Math.pow(Math.max(500, radius || 700), 2);
    R.info = { method: R.method, T: R.c.T || null, doorwayCut: R.c.T ? R.c.T * 2 * CELL : null, isolated: !!R.c.isolated,
      sharedWith: R.c.isolated ? [] : (R.c.shared || []).filter(o => o !== R.k).map(o => rooms[o].id),
      capped: !!R.capped, neckCutT: neckT[R.k] || null, corners: P.length, simplifyEps: R.eps || null, ownSpawns: mine.length, ownInside: Math.round(q.own * 100),
      ownWithin150: Math.round(q.ownNear * 100), foreignInside: q.foreign, area: Math.round(q.area), circleArea: Math.round(circleA) };
    let quality = 'good';
    if (R.method !== 'geodata') quality = 'spawn-hull';
    else if (!R.c.isolated) quality = 'shared-hall';
    else if (R.capped) quality = 'open-capped';
    if (q.ownNear < 0.7 || q.foreign > Math.max(1, mine.length * 0.2)) quality = 'check';
    R.info.quality = quality;
    R.mine = mine;
  });
  return { G, D, sp, seeds, result, added: all.filter(R => R.isNew), box, ms: Date.now() - t0 };
}
function splitGroup(a, maxR) {
  const c = (l) => ({ x: l.reduce((t, s) => t + s.x, 0) / l.length, y: l.reduce((t, s) => t + s.y, 0) / l.length });
  const rad = (l) => { const m = c(l); return Math.max(...l.map(s => Math.hypot(s.x - m.x, s.y - m.y))); };
  if (a.length < 8 || rad(a) <= maxR / 2) return [a];
  let p = a[0], q = a[0];
  a.forEach(s => { if (Math.hypot(s.x - a[0].x, s.y - a[0].y) > Math.hypot(p.x - a[0].x, p.y - a[0].y)) p = s; });
  a.forEach(s => { if (Math.hypot(s.x - p.x, s.y - p.y) > Math.hypot(q.x - p.x, q.y - p.y)) q = s; });
  let c1 = { x: p.x, y: p.y }, c2 = { x: q.x, y: q.y }, A = [], B = [];
  for (let it = 0; it < 12; it++) {
    A = []; B = [];
    a.forEach(s => (Math.hypot(s.x - c1.x, s.y - c1.y) <= Math.hypot(s.x - c2.x, s.y - c2.y) ? A : B).push(s));
    if (!A.length || !B.length) return [a];
    c1 = c(A); c2 = c(B);
  }
  return [...splitGroup(A, maxR), ...splitGroup(B, maxR)];
}

// ---------------------------------------------------------------------------------------------------------------------------------
// PNG (overlay) — tiny encoder, RGBA
// ---------------------------------------------------------------------------------------------------------------------------------
const CRC = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
const crc32 = (b) => { let c = -1; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function png(w, h, rgba) {
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 6; ih[10] = ih[11] = ih[12] = 0;
  const raw = Buffer.alloc((w * 4 + 1) * h); for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0))]);
}
const PAL = [[255, 80, 80], [80, 200, 255], [255, 210, 60], [120, 255, 120], [255, 120, 255], [255, 160, 60], [160, 140, 255], [60, 255, 210], [255, 255, 255], [200, 255, 80], [255, 100, 160], [100, 160, 255]];
function overlay(res, scale) {
  // scale = world units per pixel
  const { box } = res, W = Math.ceil((box[1] - box[0]) / scale), Hh = Math.ceil((box[3] - box[2]) / scale);
  const img = Buffer.alloc(W * Hh * 4);
  const px = (x, y, c, a) => { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= W || y >= Hh) return; const o = (y * W + x) * 4; const A = a / 255, B = img[o + 3] / 255, out = A + B * (1 - A);
    for (let k = 0; k < 3; k++) img[o + k] = Math.round((c[k] * A + img[o + k] * B * (1 - A)) / (out || 1)); img[o + 3] = Math.round(out * 255); };
  const toPx = (x, y) => [(x - box[0]) / scale, (y - box[2]) / scale];
  // walkable cells (faint cyan) + room cells (room colour, faint)
  const G = res.G, cellPx = CELL / scale;
  const roomOf = new Int16Array(G.n).fill(-1); res.result.forEach(R => (R.cells || []).forEach(i => { roomOf[i] = R.k; }));
  for (let i = 0; i < G.n; i++) {
    if (!G.OK[i]) continue;
    const [X, Y] = toPx((G.gx0 + (i % G.w)) * CELL + WX0, (G.gy0 + ((i / G.w) | 0)) * CELL + WY0);
    const c = roomOf[i] >= 0 ? PAL[roomOf[i] % PAL.length] : [0, 255, 255], a = roomOf[i] >= 0 ? 70 : 40;
    for (let a1 = 0; a1 < Math.max(1, cellPx); a1++) for (let b1 = 0; b1 < Math.max(1, cellPx); b1++) px(X + a1, Y + b1, c, a);
  }
  // rooms given only as polygons (render from the data file): scanline fill
  res.result.forEach(R => {
    if ((R.cells && R.cells.length) || !R.poly || R.poly.length < 3) return;
    const P = R.poly.map(p => toPx(p[0], p[1])), c = PAL[R.k % PAL.length];
    const y1 = Math.max(0, Math.floor(Math.min(...P.map(p => p[1])))), y2 = Math.min(Hh - 1, Math.ceil(Math.max(...P.map(p => p[1]))));
    for (let y = y1; y <= y2; y++) {
      const xsI = []; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b = P[j]; if ((a[1] > y) !== (b[1] > y)) xsI.push(a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1])); }
      xsI.sort((a, b) => a - b);
      for (let q = 0; q + 1 < xsI.length; q += 2) for (let x = Math.max(0, Math.ceil(xsI[q])); x <= Math.min(W - 1, Math.floor(xsI[q + 1])); x++) px(x, y, c, 60);
    }
  });
  const line = (a, b, c, th) => { const [x1, y1] = toPx(a[0], a[1]), [x2, y2] = toPx(b[0], b[1]); const n = Math.ceil(Math.hypot(x2 - x1, y2 - y1)) + 1;
    for (let s = 0; s <= n; s++) { const x = x1 + (x2 - x1) * s / n, y = y1 + (y2 - y1) * s / n; for (let dx = -th; dx <= th; dx++) for (let dy = -th; dy <= th; dy++) px(x + dx, y + dy, c, 255); } };
  res.result.forEach(R => { if (!R.poly) return; const c = PAL[R.k % PAL.length]; R.poly.forEach((p, i) => line(p, R.poly[(i + 1) % R.poly.length], c, 1)); });
  res.sp.forEach(s => { const [X, Y] = toPx(s.x, s.y); const c = s.room >= 0 ? PAL[s.room % PAL.length] : [150, 150, 150]; for (let dx = -3; dx <= 3; dx++) for (let dy = -3; dy <= 3; dy++) if (dx * dx + dy * dy <= 9) px(X + dx, Y + dy, Math.abs(dx) === 3 || Math.abs(dy) === 3 ? [0, 0, 0] : c, 255); });
  return { W, H: Hh, buf: png(W, Hh, img) };
}

const nbOpen = (F, i, k) => nb(F, i, k);
module.exports = { nbOpen, buildFloor, clearance, components, grow, floorPolys, outline, simplifyLoop, inPoly, polyArea, convexHull, overlay, png, CELL, makeRoom };   // makeRoom: room_refine.js

// ---------------------------------------------------------------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------------------------------------------------------------
const COMPASS = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];
const compassOf = (dx, dy) => COMPASS[((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8];   // y grows to the south in L2
const compassVec = (c) => { const i = COMPASS.indexOf(c); if (i < 0) return null; const a = i * Math.PI / 4; return [Math.cos(a), Math.sin(a)]; };
function sideOf(h, v) {
  const lh = Math.hypot(h[0], h[1]), lv = Math.hypot(v[0], v[1]);
  if (lv < 600) return 'at entry';
  const cos = (h[0] * v[0] + h[1] * v[1]) / lh / lv, cross = h[0] * v[1] - h[1] * v[0];
  const ang = Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI;
  if (ang <= 25) return 'straight';
  if (ang >= 155) return 'behind';
  return cross > 0 ? 'right' : 'left';
}
// datapack aggressive flag (<ai isAggressive> + aggroRange), as the room builder of 2026-10-07 did
let AGG = null;
function aggOf(id) {
  if (!AGG) {
    AGG = {};
    try {
      for (const f of fs.readdirSync(path.join(DATA, 'npcstats'))) {
        const txt = fs.readFileSync(path.join(DATA, 'npcstats', f), 'utf8');
        for (const m of txt.matchAll(/<npc id="(\d+)"[^>]*>([\s\S]*?)<\/npc>/g)) { const ai = (m[2].match(/<ai [^>]*>/) || [''])[0]; const ar = +((ai.match(/aggroRange="(\d+)"/) || [0, 0])[1]); AGG[+m[1]] = ar > 0 && !/isAggressive="false"/.test(ai); }
      }
    } catch (e) { }
  }
  return AGG[id] === undefined ? null : AGG[id];
}
const ORD = 'abcdefghijklmnopqrstuvwxyz';
/** A new room (stage B) in the same format as the rooms of 2026-10-07. */
function makeRoom(d, F, fi, A, NPC) {
  const anyId = (d.floors.flatMap(f => f.rooms || []).find(r => r.id) || {}).id;
  const prefix = d.idPrefix || (anyId ? anyId.split('-')[0] : d.key);
  const fr = (F.rooms || []).find(r => r.id && !r.added);
  const fn = fr ? fr.id.split('-')[1] : String(fi + 1);
  const entry = (F.enter && (F.enter.landing || F.enter.from)) || (F.entryPoint && F.entryPoint.at) || null;
  const door = (F.entryPoint && F.entryPoint.at) || entry;
  let h = F.facing && compassVec(F.facing.compass);
  if (!h && door) { const sx = A.mine.reduce((t, s) => t + s.x, 0) / A.mine.length, sy = A.mine.reduce((t, s) => t + s.y, 0) / A.mine.length; h = [sx - door[0], sy - door[1]]; }
  const c = A.isNew.center, side = door ? sideOf(h || [0, -1], [c[0] - door[0], c[1] - door[1]]) : 'straight', sk = side.replace(/ /g, '');
  const used = new Set((F.rooms || []).map(r => r.id));
  let id = null;
  for (let n = 0; n < 26 * 27 && !id; n++) { const L = n < 26 ? ORD[n] : ORD[Math.floor(n / 26) - 1] + ORD[n % 26]; const cand = `${prefix}-${fn}-${sk}-${L}`; if (!used.has(cand)) id = cand; }
  const mon = {};
  A.mine.forEach(s => { const n = NPC[s.id] || {}; mon[s.id] = mon[s.id] || { name: n.n || s.name, id: s.id, level: n.l || null, count: 0, aggressive: aggOf(s.id) }; mon[s.id].count += (s.count || 1); });
  const ml = Object.values(mon).sort((a, b) => b.count - a.count);
  const lv = ml.map(x => x.level).filter(x => x);
  const minL = Math.min(...lv), maxL = Math.max(...lv);
  const levels = []; ml.forEach(x => { for (let i = 0; i < x.count; i++) if (x.level) levels.push(x.level); }); levels.sort((a, b) => a - b);
  const med = levels[Math.floor(levels.length / 2)];
  let suits = [maxL - 2, minL + 3], suitNote = null;
  if (suits[0] > suits[1]) { suits = [med - 2, med + 3]; suitNote = 'mixed levels: suggestion built on the median monster level ' + med; }
  let route = null, routeLength = null;
  if (entry) {
    const r = geo.findPath({ x: entry[0], y: entry[1], z: entry[2] }, { x: c[0], y: c[1], z: c[2] }, { pad: 12000, maxMs: 40000, maxNodes: 6e6 });
    if (r.ok && Math.abs(r.points[r.points.length - 1].z - c[2]) <= 250) { route = [[entry[0], entry[1], entry[2]], ...r.points.map(p => [p.x, p.y, p.z])]; routeLength = r.lengthUnits; }
  }
  let walk = routeLength;
  if (route && door && F.enter && F.enter.how !== 'teleporter' && F.enter.how !== 'ziggurat') {
    const j = route.findIndex(p => Math.hypot(p[0] - door[0], p[1] - door[1]) < 500 && Math.abs(p[2] - door[2]) < 300);
    if (j >= 0) { walk = 0; for (let i = j + 1; i < route.length; i++) walk += Math.hypot(route[i][0] - route[i - 1][0], route[i][1] - route[i - 1][1], route[i][2] - route[i - 1][2]); walk = Math.round(walk); } else walk = null;
  }
  const radius = Math.round(Math.max(400, ...A.mine.map(s => Math.hypot(s.x - c[0], s.y - c[1]))));
  return { id, name: `${F.name}, ${side}: ${ml[0] ? ml[0].name : 'monster'} room`, side, compass: door ? compassOf(c[0] - door[0], c[1] - door[1]) : null,
    center: [Math.round(c[0]), Math.round(c[1]), Math.round(c[2])], radius, levelRange: [minL, maxL], suitsPartyLevel: suits, ...(suitNote ? { suitNote } : {}),
    spawnCount: ml.reduce((t, x) => t + x.count, 0), monsters: ml, route, routeLength, walkFromFloorEntry: walk,
    notes: `added 2026-10-08 from the geodata room shapes (room_polys.js): monsters no room polygon covered${route ? '' : '; NO walk route found from the floor entry (never picked automatically)'}`,
    added: '2026-10-08' };
}
// --- catacombs + necropolises (catacombs.json) as rooms dungeons: one floor "Inside", rooms from stage B ---
const CATA_KEYS = { 'Necropolis of Sacrifice': 'sacrifice', 'Catacomb of the Heretic': 'heretic', "Pilgrim's Necropolis": 'pilgrims', 'Catacomb of the Branded': 'branded',
  'Necropolis of Worship': 'worship', 'Catacomb of the Apostate': 'apostate', "Patriot's Necropolis": 'patriots', 'Catacomb of the Witch': 'witch',
  'Necropolis of Devotion': 'devotion', 'Necropolis of Martyrdom': 'martyrdom', 'Catacomb of Dark Omens': 'darkomens', 'Catacomb of the Forbidden Path': 'forbidden',
  "Saint's Necropolis": 'saints', "Disciple's Necropolis": 'disciples' };
function catacombDungeon(c, spawns, haveMaps) {
  const ib = c.inside.bbox, bbox = [ib[0], ib[2], ib[1], ib[3]];
  const ids = new Set((c.monsters || []).map(m => m.id));
  const sp = spawns.filter(s => ids.has(s.id) && s.x >= bbox[0] - 500 && s.x <= bbox[1] + 500 && s.y >= bbox[2] - 500 && s.y <= bbox[3] + 500);
  const zs = sp.map(s => s.z).concat([c.inside.landing[2]]);
  const z = [Math.min(...zs) - 300, Math.max(...zs) + 300];
  const L = c.inside.landing, mx = sp.reduce((t, s) => t + s.x, 0) / sp.length, my = sp.reduce((t, s) => t + s.y, 0) / sp.length;
  let h = [mx - L[0], my - L[1]], how = 'inside landing -> centre of the monster spawns';
  if (Math.hypot(h[0], h[1]) < 1500) { h = [0, -1]; how = 'landing is in the middle: facing north (left = west, right = east)'; }
  const layers = [];
  for (let rx = Math.floor(bbox[0] / 32768) + 20; rx <= Math.floor(bbox[1] / 32768) + 20; rx++) for (let ry = Math.floor(bbox[2] / 32768) + 18; ry <= Math.floor(bbox[3] / 32768) + 18; ry++)
    haveMaps.filter(f => new RegExp(`^${rx}_${ry}(_\\d+)?\\.jpg$`).test(f)).forEach(f => layers.push(f.replace('.jpg', '')));
  const key = CATA_KEYS[c.name] || c.name.toLowerCase().replace(/[^a-z]+/g, '');
  return { name: c.name, key, idPrefix: key, type: c.type, catacomb: c.name, levelRange: c.lvl, town: c.town, townCommand: c.townCommand || null,
    gatekeeperRoute: c.gatekeeperRoute || null, entrance: c.entrance ? { x: c.entrance.x, y: c.entrance.y, z: c.entrance.z, desc: c.entrance.desc } : null,
    otherTeleports: (c.fieldTeleports || []).map(t => ({ desc: t.desc, landing: [t.x, t.y, t.z] })), bbox, mapLayers: layers,
    floors: [{ name: 'Inside', z,
      enter: { how: 'ziggurat', catacomb: c.name, npc: c.entranceNpc ? { id: c.entranceNpc.id, name: c.entranceNpc.name, x: c.entranceNpc.x, y: c.entranceNpc.y, z: c.entranceNpc.z, link: c.entranceNpc.link || null } : null,
        landing: L, note: 'Seven Signs dungeon: swarm.js enterDungeon() (walk in through the entry hall, else the Gatekeeper Ziggurat; sign up with the Priest of Dawn first). Rooms are walked to from the inside landing.' },
      facing: { compass: compassOf(h[0], h[1]), how }, entryPoint: { at: L, how: 'inside landing (Ziggurat teleport / walk-in target)' }, levelRange: c.lvl,
      notes: 'One flat floor. Rooms made 2026-10-08 from the monster spawns grouped by the geodata room they stand in (room_polys.js).', monsterIds: [...ids], rooms: [] }],
    raidBosses: c.raidBosses || [], notes: c.notes || '', sources: ['catacombs.json', 'spawns_h5.json', 'npcs_h5.json', 'npcstats', 'geopath.js', 'room_polys.js'] };
}

/** Check image of one floor: overlay PNG + meta (rendered by render_room_checks.ps1). shown = [{k, r, poly, cells?, info?}] */
function writeFloorImage(d, F, fi, res, shown, haveLayers, nNew) {
  const bandsByRegion = {};
  d.floors.forEach(F2 => (F2.rooms || []).forEach(r => { const k = (Math.floor(r.center[0] / 32768) + 20) + '_' + (Math.floor(r.center[1] / 32768) + 18); (bandsByRegion[k] = bandsByRegion[k] || {})[F2.z.join(',')] = F2.z; }));
  const span = Math.max(res.box[1] - res.box[0], res.box[3] - res.box[2]), scale = Math.max(8, Math.ceil(span / 2400));
  const ov = overlay({ ...res, result: shown }, scale), base = `${d.key}_f${fi + 1}`;
  fs.writeFileSync(path.join(OUTDIR, base + '_overlay.png'), ov.buf);
  const regions = [];
  for (let rx = Math.floor(res.box[0] / 32768) + 20; rx <= Math.floor(res.box[1] / 32768) + 20; rx++) for (let ry = Math.floor(res.box[2] / 32768) + 18; ry <= Math.floor(res.box[3] / 32768) + 18; ry++) {
    // map layer: this dungeon's floor bands in that region sorted deepest first = layer 1, 2, ... (Dashboard /api/maplayersz rule;
    // more floors than layers: the last layer repeats)
    const k = rx + '_' + ry, L = (haveLayers[k] || []).slice().sort((a, b) => a - b), bands = Object.values(bandsByRegion[k] || {}).sort((a, b) => a[0] - b[0]);
    let file = k; const bi = bands.findIndex(z => z[0] === F.z[0] && z[1] === F.z[1]);
    if (L.length && bi >= 0) file = k + '_' + L[Math.min(bi, L.length - 1)];
    regions.push({ file, x0: (rx - 20) * 32768, y0: (ry - 18) * 32768 });
  }
  const labels = shown.filter(R => R.poly && R.r).map(R => { const pi = R.r.polyInfo || {}; return { text: R.r.id.replace(/^[a-z]+-/, '') + (pi.newRoom ? ' NEW' : '') + (pi.quality && pi.quality !== 'good' ? ' (' + pi.quality + ')' : '') + (R.r.levelRange ? ' ' + R.r.levelRange.join('-') : ''),
    x: (R.r.center[0] - res.box[0]) / scale, y: (R.r.center[1] - res.box[2]) / scale, c: PAL[R.k % PAL.length] }; });
  const safe = (F.safeSpots || []).map(s => ({ x: (s.x - res.box[0]) / scale, y: (s.y - res.box[2]) / scale, text: s.id.split('-').pop() + (s.tier === 'tight' ? ' tight' : '') }));
  const nPoly = shown.filter(R => R.poly).length;
  fs.writeFileSync(path.join(OUTDIR, base + '_meta.json'), JSON.stringify({ out: base + '.png', overlay: base + '_overlay.png', box: res.box, scale, W: ov.W, H: ov.H, regions, labels, safe,
    title: `${d.name} — ${F.name} (z ${F.z.join('..')}) — ${nPoly} room polygons${nNew ? ', ' + nNew + ' new rooms' : ''}, ${(F.safeSpots || []).length} safe spots` }));
}
/** Render a floor from the data file only (no recomputation): walkable cells + stored polygons + spawns (+ safe spots). */
function floorFromData(d, F, spawns) {
  const rooms = (F.rooms || []).filter(r => r.center);
  const B = d.bbox, xs = rooms.map(r => r.center[0]), ys = rooms.map(r => r.center[1]);
  const box = [Math.max(B[0] - 1500, Math.min(...xs) - 4000), Math.min(B[1] + 1500, Math.max(...xs) + 4000), Math.max(B[2] - 1500, Math.min(...ys) - 4000), Math.min(B[3] + 1500, Math.max(...ys) + 4000)];
  const zBand = [F.z[0] - 250, F.z[1] + 250];
  const ids = new Set(F.monsterIds || []); rooms.forEach(r => (r.monsters || []).forEach(m => ids.add(m.id)));
  const spF = spawns.filter(s => ids.has(s.id) && s.x >= box[0] && s.x <= box[1] && s.y >= box[2] && s.y <= box[3] && s.z >= F.z[0] - 150 && s.z <= F.z[1] + 150);
  const entry = (F.entryPoint && F.entryPoint.at) || (F.enter && (F.enter.landing || F.enter.from)) || null;
  const G = buildFloor(box, zBand, rooms.map(r => ({ x: r.center[0], y: r.center[1], z: r.center[2] })).concat(spF.map(s => ({ x: s.x, y: s.y, z: s.z })))
    .concat(entry && entry[2] >= zBand[0] && entry[2] <= zBand[1] ? [{ x: entry[0], y: entry[1], z: entry[2] }] : []));
  const sp = spF.map(s => { let k = rooms.findIndex(r => r.poly && inPoly(s.x, s.y, r.poly) && Math.abs(s.z - r.center[2]) < 600); return { ...s, room: k }; });
  return { G, sp, box, shown: rooms.map((r, k) => ({ k, r, poly: r.poly || null })) };
}

if (require.main === module) {
  const FILE = path.join(DATA, 'dungeon_rooms.json');
  const all = readJson(FILE);
  const spawns = readJson(path.join(DATA, 'spawns_h5.json'));
  const NPC = readJson(path.join(DATA, 'npcs_h5.json'));
  const only = arg('--only') && arg('--only') !== true ? String(arg('--only')).split(',') : null;
  const images = !argv.includes('--no-images'), dry = argv.includes('--dry'), noNew = argv.includes('--no-new-rooms'), imagesOnly = argv.includes('--images-only');
  fs.mkdirSync(OUTDIR, { recursive: true });
  const maps = fs.readdirSync(path.join(ROOT, 'Maps', 'high'));
  const haveLayers = {}; maps.forEach(n => { const m = n.match(/^(\d+_\d+)_(\d)\.jpg$/); if (m) (haveLayers[m[1]] = haveLayers[m[1]] || []).push(+m[2]); });
  const SS = require('./safe_spots');
  const ssCtx = { spawns, NPC, AGGRO: readJson(path.join(DATA, 'aggro_h5.json')) };
  if (imagesOnly) {
    // re-draw every check image from the data file (polygons + safe spots as stored), nothing is written to dungeon_rooms.json
    const report = [];
    for (const d of all) {
      if (only && !only.includes(d.key)) continue;
      d.floors.forEach((F, fi) => {
        if (!(F.rooms || []).length) return;
        const fd = floorFromData(d, F, spawns);
        writeFloorImage(d, F, fi, { G: fd.G, sp: fd.sp, box: fd.box }, fd.shown, haveLayers, (F.rooms || []).filter(r => r.added).length);
        F.rooms.forEach(r => report.push({ dungeon: d.name, key: d.key, floor: F.name, fi, id: r.id, name: r.name, levelRange: r.levelRange, ...(r.polyInfo || { quality: 'none' }) }));
        console.log(`image ${d.key} f${fi + 1}`);
      });
    }
    if (!only) fs.writeFileSync(path.join(OUTDIR, 'report.json'), JSON.stringify(report, null, 1));
    try { cp.execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'render_room_checks.ps1'), '-Dir', OUTDIR], { stdio: 'ignore' }); } catch (e) { console.log('render_room_checks.ps1 failed:', e.message); }
    writeIndex(readJson(path.join(OUTDIR, 'report.json')), all);
    process.exit(0);
  }
  // add the catacombs + necropolises that are not in the file yet (existing entries and ids are kept)
  if (!argv.includes('--no-catacombs')) {
    readJson(path.join(DATA, 'catacombs.json')).forEach(c => { if (!all.some(d => d.name === c.name)) { all.push(catacombDungeon(c, spawns, maps)); console.log('added dungeon', c.name); } });
  }
  const report = [];
  for (const d of all) {
    if (only && !only.includes(d.key)) continue;
    d.floors.forEach((F, fi) => {
      if (!(F.rooms || []).length && !(F.monsterIds || []).length) return;
      const res = floorPolys(d, F, fi, spawns);
      res.result.forEach(R => {
        if (MG.isManual(R.r)) return;   // POLYEDIT 2026-10-08: an outline drawn on the dashboard is never replaced
        if (R.poly && R.info) { R.r.poly = R.poly; R.r.zRange = R.zRange; R.r.area = R.info.area; R.r.polyInfo = R.info; }
        else { delete R.r.poly; delete R.r.zRange; delete R.r.area; R.r.polyInfo = { quality: 'none', why: R.fail || 'no outline' }; }
      });
      if (!noNew) res.added.forEach(A => {
        if (!A.info || !A.mine || !A.mine.length) return;
        const room = makeRoom(d, F, fi, A, NPC);
        room.poly = A.poly; room.zRange = A.zRange; room.area = A.info.area; room.polyInfo = { ...A.info, newRoom: true };
        F.rooms.push(room); A.r = room;
      });
      // safe spots in the corridors (safe_spots.js), on the same walkable grid
      try { F.safeSpots = SS.floorSafeSpots(d, F, fi, { ...ssCtx, G: res.G, D: res.D }); } catch (e) { console.log('safe spots failed', d.key, fi, e.message); }
      const shown = res.result.concat(res.added.filter(A => A.r));
      shown.forEach(R => report.push({ dungeon: d.name, key: d.key, floor: F.name, fi, id: R.r.id, name: R.r.name, levelRange: R.r.levelRange, ...(R.r.polyInfo) }));
      const ok = shown.filter(R => R.poly && R.info).length, nNew = res.added.filter(A => A.r).length;
      console.log(`${d.key} f${fi + 1} ${F.name}: ${ok}/${shown.length} polygons (${nNew} new rooms), ${(F.safeSpots || []).length} safe spots, ${res.G.cells} walkable cells, ${res.sp.length} spawns, ${res.ms} ms`);
      if (images) writeFloorImage(d, F, fi, res, shown, haveLayers, nNew);
    });
  }
  fs.writeFileSync(path.join(OUTDIR, 'report.json'), JSON.stringify(report, null, 1));
  if (!dry) {
    try { fs.mkdirSync(path.join(ROOT, 'Settings', 'backup'), { recursive: true }); fs.copyFileSync(FILE, path.join(ROOT, 'Settings', 'backup', 'dungeon_rooms_before_polys_' + new Date().toISOString().replace(/[:.]/g, '-') + '.json')); } catch (e) { }
    // compact: swarm.js leaders parse it (2.2 MB instead of 5 MB pretty). POLYEDIT 2026-10-08: locked + atomic, rooms edited on the
    // dashboard (manual: true, also ones edited while this ran) are copied back from disk (manual_guard.js)
    MG.writeGuarded(FILE, all, 'room');
    console.log('written', FILE);
  }
  if (images) {
    try { cp.execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'render_room_checks.ps1'), '-Dir', OUTDIR], { stdio: 'inherit' }); }
    catch (e) { console.log('render_room_checks.ps1 failed:', e.message); }
    writeIndex(report, all);
  }
}
function writeIndex(report, all) {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const files = fs.readdirSync(OUTDIR).filter(f => /_f\d+\.png$/.test(f)).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  const rows = report.map(r => `<tr class="q-${esc(r.quality)}"><td>${esc(r.dungeon)}</td><td>${esc(r.floor)}</td><td>${esc(r.id)}${r.newRoom ? ' <b>NEW</b>' : ''}</td><td>${esc((r.levelRange || []).join('-'))}</td><td>${esc(r.quality)}</td><td>${esc(r.method || '')}</td><td>${r.corners || ''}</td><td>${r.area ? Math.round(r.area / 1e4) / 100 + ' M' : ''}</td><td>${r.ownSpawns ?? ''}</td><td>${r.ownWithin150 ?? ''}%</td><td>${r.foreignInside ?? ''}</td><td>${esc(r.why || '')}</td></tr>`).join('\n');
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Room polygons</title>
<style>:root{--bg:#10161b;--fg:#e6e6e6;--mut:#9aa;--bd:#2a3640}@media (prefers-color-scheme: light){:root:not([data-theme="dark"]){--bg:#fff;--fg:#111;--mut:#555;--bd:#ccc}}
body{background:var(--bg);color:var(--fg);font:14px system-ui,sans-serif;margin:0;padding:16px}table{border-collapse:collapse;font-size:12px;width:100%}td,th{border:1px solid var(--bd);padding:2px 5px}
.q-check td,.q-none td{background:rgba(255,80,80,.15)}.q-spawn-hull td{background:rgba(255,200,60,.12)}img{max-width:100%;border:1px solid var(--bd)}.wrap{overflow-x:auto}</style></head><body>
<h1>Room polygons (dungeon_rooms.json)</h1><p>Generated ${new Date().toISOString()} by docs/plan/tools/room_polys.js. Colours = rooms; dots = monster spawns in the colour of the room they belong to; faint cyan = walkable geodata of the floor; NEW = room added from monsters no room covered. Quality: good = closed room from the geodata; open-capped = open cave cut at a distance; shared-hall = two rooms in one hall split by distance; spawn-hull = no clean room in the geodata, outline of the spawn group clipped to walkable cells; check = look at it (own monsters outside or other rooms' monsters inside).</p>
<div class="wrap"><table><tr><th>Dungeon</th><th>Floor</th><th>Room</th><th>Lvl</th><th>Quality</th><th>Method</th><th>Corners</th><th>Area</th><th>Own spawns</th><th>Own inside</th><th>Foreign</th><th>Why</th></tr>
${rows}</table></div>
${all ? `<h2>Safe spots (corridors without monsters)</h2><div class="wrap"><table><tr><th>Dungeon</th><th>Floor</th><th>Spot</th><th>x, y, z</th><th>Tier</th><th>Monster clear</th><th>Near rooms</th></tr>${all.flatMap(d => d.floors.flatMap(F => (F.safeSpots || []).map(sp => `<tr><td>${esc(d.name)}</td><td>${esc(F.name)}</td><td>${esc(sp.id)} ${esc(sp.name)}</td><td>${sp.x}, ${sp.y}, ${sp.z}</td><td>${esc(sp.tier)}</td><td>${sp.monsterClear}</td><td>${esc(sp.nearRooms.map(r => r.id + " (" + r.walk + ")").join(", "))}</td></tr>`))).join("")}</table></div>` : ""}
${files.map(f => `<h2>${esc(f)}</h2><img src="${esc(f)}" loading="lazy" alt="${esc(f)}">`).join('\n')}
</body></html>`;
  fs.writeFileSync(path.join(OUTDIR, 'index.html'), html);
}
