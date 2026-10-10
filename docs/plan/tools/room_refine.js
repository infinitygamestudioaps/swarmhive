// ROOM REFINE (user 2026-10-08 19:25: "Fix: 66 of the room outlines in open caves are marked 'check' and may be rough").
// Second pass over Scripts/data/dungeon_rooms.json after room_polys.js. Only the PROBLEM rooms are touched (quality 'check' / 'none',
// plus rooms without a walk route); every other polygon stays exactly as it is and is treated as fixed. Room ids never change.
//
// 1. SPAWN OWNERSHIP (the validation rule, used before and after): a monster spawn of the floor belongs to a room that lists its monster
//    id. If it stands inside a fixed room's polygon (and its z band) it is that room's; otherwise the nearest room centre (3D, z x2) among
//    the rooms that list the id (too far = nobody's). This replaces room_polys.js' "nearest centre of any room" (which gave a room the
//    spawns of a different monster standing in the corridor next door).
// 2. PARTITION (geodesic Voronoi with chokepoint cost) of the walkable cells of the floor (same grid as room_polys.js: flood over the L2J
//    geodata in the floor's z band). Cells inside fixed polygons are taken. Every problem room grows from its own spawns (snapped to the
//    nearest walkable cell of the floor layer nearest the spawn's z) and its centre; the fixed rooms' spawns that lie OUTSIDE their
//    polygon grow too (300) so a problem room never swallows them. Step cost = distance x (1 + 3 x max(0, 1 - clearance / 8 cells)):
//    open ground is cheap, narrow passages are dear, so two rooms meet in the doorway / the narrow part between them. Growth limit 700
//    (cost units) from the own spawns, and max(1600, 2.4 x radius) straight from the centre.
// 3. OUTLINE: the component holding most own spawns, holes filled, traced along the cell edges, Douglas-Peucker with the SMALLEST
//    tolerance that gives <= 40 corners without losing an own spawn or taking a neighbour's (48, then 64 corners when 40 cannot;
//    else the best-scoring one).
// 4. CHECK: own spawns inside >= 90 %, other rooms' spawns inside <= 5 % of own (normally 0), overlap with every other polygon of the floor
//    (overlapping z bands) < 5 % of the area, area >= 100,000 and <= pi x cap^2. Passed = quality 'good' (method 'partition'); the old
//    polygon is kept when it scores better. Rooms whose monsters are really on another floor (datapack z wrong; the geodata has no ground
//    there) become quality 'duplicate' with duplicateOf (no polygon, no route: never picked).
// 5. ROUTES for rooms without one: geopath from the floor's entry (landing / dungeon entrance), then via the floor entry point, then via the
//    nearest point of another room's route (junction). Centre z snapped to the geodata layer when the datapack height is off the ground.
// 6. SAFE SPOTS recomputed (safe_spots.js) for every floor whose polygons changed; a spot within 200 of an old one keeps the old id.
// Writes atomically (tmp + rename), backup Settings/backup/dungeon_rooms_before_refine_<time>.json, compact JSON, no BOM.
//
// Use: node room_refine.js [--only antharas,pagan] [--dry]       then: node room_polys.js --images-only
const fs = require('fs'), path = require('path');
const geo = require('./geopath');
const RP = require('./room_polys');
const SS = require('./safe_spots');
const ROOT = path.join(__dirname, '..', '..', '..');
const DATA = path.join(ROOT, 'Scripts', 'data');
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, ''));
const CELL = 16, WX0 = -294912, WY0 = -262144;
const argv = process.argv.slice(2);
const oi = argv.indexOf('--only'), ONLY = oi >= 0 ? String(argv[oi + 1]).split(',') : null, DRY = argv.includes('--dry');
const TODAY = '2026-10-08';
// ownInside: share of the room's own spawns inside the outline or within 100 of it = the bots' hunting rule (huntTarget: room + 100)
const GATE = { ownInside: 0.9, foreignShare: 0.05, overlap: 0.05, minArea: 100000 };
const GROW = { limit: 700, compLimit: 300, Tc: 8, K: 3 };

// ------------------------------------------------------------------------------------------------------------------------------
// geometry helpers
// ------------------------------------------------------------------------------------------------------------------------------
const inPoly = RP.inPoly, polyArea = RP.polyArea;
const distToSeg = (x, y, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy; let t = L ? ((x - a[0]) * dx + (y - a[1]) * dy) / L : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy); };
const distToPoly = (x, y, P) => inPoly(x, y, P) ? 0 : Math.min(...P.map((p, i) => distToSeg(x, y, p, P[(i + 1) % P.length])));
function segX(a, b, c, d) { const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])); return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0; }
function selfIntersects(P) { const n = P.length; for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) { if (i === 0 && j === n - 1) continue; if (segX(P[i], P[(i + 1) % n], P[j], P[(j + 1) % n])) return true; } return false; }
function dp(pts, eps) {
  if (pts.length < 3) return pts.slice();
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1; const st = [[0, pts.length - 1]];
  while (st.length) { const [a, b] = st.pop(); let md = -1, mi = -1; const A = pts[a], B = pts[b], L = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1e-9;
    for (let i = a + 1; i < b; i++) { const d = Math.abs((B[0] - A[0]) * (A[1] - pts[i][1]) - (A[0] - pts[i][0]) * (B[1] - A[1])) / L; if (d > md) { md = d; mi = i; } }
    if (md > eps) { keep[mi] = 1; st.push([a, mi], [mi, b]); } }
  return pts.filter((_, i) => keep[i]);
}
function simplifyAt(P, eps) {
  let far = 0; P.forEach((p, i) => { if (Math.hypot(p[0] - P[0][0], p[1] - P[0][1]) > Math.hypot(P[far][0] - P[0][0], P[far][1] - P[0][1])) far = i; });
  const a = dp(P.slice(0, far + 1), eps), b = dp(P.slice(far).concat([P[0]]), eps);
  const Q = a.concat(b.slice(1, -1));
  return Q.length >= 3 && !selfIntersects(Q) ? Q : null;
}
const bboxOf = (P) => [Math.min(...P.map(p => p[0])), Math.max(...P.map(p => p[0])), Math.min(...P.map(p => p[1])), Math.max(...P.map(p => p[1]))];
/** overlap area of two polygons (raster, 32 units) */
function overlapArea(A, B) {
  const a = bboxOf(A), b = bboxOf(B), x1 = Math.max(a[0], b[0]), x2 = Math.min(a[1], b[1]), y1 = Math.max(a[2], b[2]), y2 = Math.min(a[3], b[3]);
  if (x1 >= x2 || y1 >= y2) return 0;
  let n = 0; for (let y = y1 + 16; y < y2; y += 32) for (let x = x1 + 16; x < x2; x += 32) if (inPoly(x, y, A) && inPoly(x, y, B)) n++;
  return n * 1024;
}
const zOverlap = (r, o) => { const a = r.zRange || [r.center[2] - 300, r.center[2] + 300], b = o.zRange || [o.center[2] - 300, o.center[2] + 300]; return a[0] <= b[1] && b[0] <= a[1]; };
class BQ { constructor() { this.b = []; this.cur = 0; this.size = 0; } push(k, v) { (this.b[k] || (this.b[k] = [])).push(v); this.size++; if (k < this.cur) this.cur = k; } pop() { while (!this.b[this.cur] || !this.b[this.cur].length) this.cur++; this.size--; return [this.cur, this.b[this.cur].pop()]; } }

// ------------------------------------------------------------------------------------------------------------------------------
// one floor: grid + spawn ownership + metrics
// ------------------------------------------------------------------------------------------------------------------------------
const MG = require('./manual_guard');   // POLYEDIT 2026-10-08: rooms edited on the dashboard (manual: true) are never touched
const isProblem = (r) => { if (MG.isManual(r)) return false; const q = (r.polyInfo || {}).quality; return q === 'check' || q === 'none'; };
function floorCtx(d, F, spawns, build) {
  const rooms = F.rooms || [];
  const zBand = [F.z[0] - 250, F.z[1] + 250], B = d.bbox;
  const xs = rooms.map(r => r.center[0]), ys = rooms.map(r => r.center[1]);
  const box = [Math.max(B[0] - 1500, Math.min(...xs) - 4000), Math.min(B[1] + 1500, Math.max(...xs) + 4000), Math.max(B[2] - 1500, Math.min(...ys) - 4000), Math.min(B[3] + 1500, Math.max(...ys) + 4000)];
  const ids = new Set(F.monsterIds || []); rooms.forEach(r => (r.monsters || []).forEach(m => ids.add(m.id)));
  const spF = spawns.filter(s => ids.has(s.id) && s.x >= box[0] && s.x <= box[1] && s.y >= box[2] && s.y <= box[3] && s.z >= F.z[0] - 150 && s.z <= F.z[1] + 150);
  const entry = (F.entryPoint && F.entryPoint.at) || (F.enter && (F.enter.landing || F.enter.from)) || null;
  let G = null, D = null;
  if (build) {
    G = RP.buildFloor(box, zBand, rooms.map(r => ({ x: r.center[0], y: r.center[1], z: r.center[2] })).concat(spF.map(s => ({ x: s.x, y: s.y, z: s.z })))
      .concat(entry && entry[2] >= zBand[0] && entry[2] <= zBand[1] ? [{ x: entry[0], y: entry[1], z: entry[2] }] : []));
    D = RP.clearance(G);
  }
  return { d, F, rooms, box, zBand, spF, G, D };
}
/** spawn -> room index (rule 1). fixed(k) = the room's polygon is kept. */
function assignSpawns(ctx, fixed) {
  const { rooms, spF } = ctx;
  const live = rooms.map((r, k) => k).filter(k => (rooms[k].polyInfo || {}).quality !== 'duplicate');
  // spawns a room cannot hold (a separate piece of ground, fewer than 3: room_refine.js split rule) belong to nobody
  const strays = new Set(); rooms.forEach(r => ((r.polyInfo || {}).strays || []).forEach(p => strays.add(p[0] + ',' + p[1])));
  return spF.map(s => {
    if (strays.has(s.x + ',' + s.y)) return { ...s, room: -1, stray: true };
    // standing inside a kept polygon = that room's, whatever the 2026-10-07 monster list says (it was built from spawn clusters)
    const inF = live.filter(k => fixed(k) && rooms[k].poly && inPoly(s.x, s.y, rooms[k].poly) && (!rooms[k].zRange || (s.z >= rooms[k].zRange[0] - 150 && s.z <= rooms[k].zRange[1] + 150)));
    if (inF.length === 1) return { ...s, room: inF[0] };
    // else the nearest centre of a room that lists this monster, within the room's radius + 900 (the 2026-10-07 clustering joined spawns
    // within ~900); farther = a stray nobody owns (wanderers in the corridors)
    const cand = live.filter(k => (rooms[k].monsters || []).some(m => m.id === s.id));
    let bi = -1, bd = 1e9; cand.forEach(k => { const c = rooms[k].center; const dd = Math.hypot(s.x - c[0], s.y - c[1], (s.z - c[2]) * 2); if (dd < bd) { bd = dd; bi = k; } });
    if (bi >= 0 && bd > Math.max(1200, (rooms[bi].radius || 0) + 900)) bi = -1;
    return { ...s, room: bi };
  });
}
function metrics(ctx, sp, k, P, zR) {
  const r = ctx.rooms[k], mine = sp.filter(s => s.room === k);
  if (!P || P.length < 3) return { own: mine.length, inside: 0, within150: 0, foreign: 0, overlap: 0, area: 0, pass: false, why: 'no polygon' };
  const inside = mine.filter(s => inPoly(s.x, s.y, P)).length, d100 = mine.filter(s => distToPoly(s.x, s.y, P) <= 100).length, near = mine.filter(s => distToPoly(s.x, s.y, P) <= 150).length;
  const cz = r.center[2];
  const foreign = sp.filter(s => s.room >= 0 && s.room !== k && inPoly(s.x, s.y, P) && Math.abs(s.z - cz) < 400).length;
  const area = polyArea(P);
  let ov = 0, ovWith = [];
  const me = { center: r.center, zRange: zR || r.zRange };
  ctx.rooms.forEach((o, j) => { if (j === k || !o.poly || (o.polyInfo || {}).quality === 'duplicate' || !zOverlap(me, o)) return; const a = overlapArea(P, o.poly); if (a > 0) { ov += a; ovWith.push(o.id + ' ' + Math.round(a / Math.max(1, area) * 100) + '%'); } });
  const cap = Math.max(1600, (r.radius || 800) * 2.4);
  const m = { own: mine.length, strict: mine.length ? inside / mine.length : 1, inside: mine.length ? d100 / mine.length : 1, within150: mine.length ? near / mine.length : 1, foreign, overlap: ov / Math.max(1, area), ovWith, area };
  const why = [];
  if (!mine.length) why.push('no spawns of its own (all belong to other rooms)');
  if (m.inside < GATE.ownInside) why.push(`own spawns inside (+100) ${Math.round(m.inside * 100)}%`);
  if (foreign > Math.floor(mine.length * GATE.foreignShare)) why.push(`other rooms' spawns inside: ${foreign}`);
  if (m.overlap >= GATE.overlap) why.push(`overlaps ${ovWith.join(', ')}`);
  if (area < GATE.minArea) why.push(`area ${Math.round(area)} too small`);
  if (area > Math.PI * cap * cap * 1.05) why.push(`area ${Math.round(area / 1e4) / 100} M larger than the cap`);
  m.pass = !why.length; m.why = why.join('; ');
  return m;
}
const score = (m) => (m.pass ? 1000 : 0) + m.inside * 100 - m.foreign * 8 - Math.min(50, m.overlap * 200) + Math.min(10, m.within150 * 10);

// ------------------------------------------------------------------------------------------------------------------------------
// partition
// ------------------------------------------------------------------------------------------------------------------------------
function nb8(G, i, out) {
  let c = 0; const nb = RP.nbOpen;
  const e = nb(G, i, 0), w = nb(G, i, 1), s = nb(G, i, 2), n = nb(G, i, 3);
  if (e >= 0) { out[c++] = e; out[c++] = 10; } if (w >= 0) { out[c++] = w; out[c++] = 10; } if (s >= 0) { out[c++] = s; out[c++] = 10; } if (n >= 0) { out[c++] = n; out[c++] = 10; }
  const dg = (a, ka, b, kb) => { if (a < 0 || b < 0) return -1; const x = nb(G, a, kb), y = nb(G, b, ka); return x >= 0 && x === y ? x : -1; };
  let d;
  if ((d = dg(e, 0, s, 2)) >= 0) { out[c++] = d; out[c++] = 14; } if ((d = dg(e, 0, n, 3)) >= 0) { out[c++] = d; out[c++] = 14; }
  if ((d = dg(w, 1, s, 2)) >= 0) { out[c++] = d; out[c++] = 14; } if ((d = dg(w, 1, n, 3)) >= 0) { out[c++] = d; out[c++] = 14; }
  return c;
}
function partition(ctx, sp, problem, fixedK) {
  const { G, D, rooms } = ctx;
  const cx = (i) => (G.gx0 + (i % G.w)) * CELL + WX0 + 8, cy = (i) => (G.gy0 + ((i / G.w) | 0)) * CELL + WY0 + 8;
  const cellOf = (x, y) => { const gx = geo.toGeoX(x) - G.gx0, gy = geo.toGeoY(y) - G.gy0; return gx < 0 || gy < 0 || gx >= G.w || gy >= G.h ? -1 : gy * G.w + gx; };
  // fixed cells
  const taken = new Int16Array(G.n).fill(-1);
  fixedK.forEach(k => {
    const r = rooms[k]; if (!r.poly) return; const b = bboxOf(r.poly), zr = r.zRange || [-1e9, 1e9];
    for (let gy = Math.max(0, geo.toGeoY(b[2]) - G.gy0); gy <= Math.min(G.h - 1, geo.toGeoY(b[3]) - G.gy0); gy++)
      for (let gx = Math.max(0, geo.toGeoX(b[0]) - G.gx0); gx <= Math.min(G.w - 1, geo.toGeoX(b[1]) - G.gx0); gx++) {
        const i = gy * G.w + gx; if (!G.OK[i] || G.H[i] < zr[0] - 100 || G.H[i] > zr[1] + 100) continue;
        if (inPoly(cx(i), cy(i), r.poly)) taken[i] = k;
      }
  });
  // snap a point to the nearest free walkable cell (the floor layer nearest its z)
  const snap = (x, y, z, R = 10) => { const c0 = cellOf(x, y); if (c0 < 0) return -1; const x0 = c0 % G.w, y0 = (c0 / G.w) | 0; let best = -1, bd = 1e9;
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) { const xx = x0 + dx, yy = y0 + dy; if (xx < 0 || yy < 0 || xx >= G.w || yy >= G.h) continue; const j = yy * G.w + xx;
      if (!G.OK[j] || taken[j] >= 0) continue; const dz = Math.abs(G.H[j] - z); if (dz > 300) continue; const dd = Math.hypot(dx, dy) * 16 + dz * 0.5; if (dd < bd) { bd = dd; best = j; } }
    return best; };
  const lab = new Int32Array(G.n).fill(-1), dist = new Int32Array(G.n).fill(2147483647), Q = new BQ(), tmp = new Int32Array(16);
  const limit = {}, isProb = new Set(problem);
  const src = (i, k) => { if (i < 0) return; if (dist[i] > 0) { dist[i] = 0; lab[i] = k; Q.push(0, i); } };
  // fixed rooms' spawns outside their polygon first (they win a tie), then the problem rooms
  fixedK.forEach(k => { limit[k] = Math.round(GROW.compLimit / CELL * 10); sp.forEach(s => { if (s.room === k && !(rooms[k].poly && inPoly(s.x, s.y, rooms[k].poly))) src(snap(s.x, s.y, s.z, 6), k); }); });
  // spawns nobody owns stay where they are (nobody grows over them)
  sp.forEach(s => { if (s.room < 0) src(snap(s.x, s.y, s.z, 4), 30000); }); limit[30000] = Math.round(150 / CELL * 10);
  const seedOf = {};
  problem.forEach(k => { limit[k] = Math.round(GROW.limit / CELL * 10); seedOf[k] = []; sp.forEach(s => { if (s.room === k) { const i = snap(s.x, s.y, s.z); if (i >= 0) { seedOf[k].push(i); src(i, k); } } });
    const c = rooms[k].center, i = snap(c[0], c[1], c[2], 6); if (i >= 0 && seedOf[k].length) { seedOf[k].push(i); src(i, k); } });
  const capOf = {}; problem.forEach(k => { capOf[k] = Math.max(1600, (rooms[k].radius || 800) * 2.4); });
  const mult = (j) => 1 + GROW.K * Math.max(0, 1 - D[j] / (10 * GROW.Tc));
  while (Q.size) {
    const [dd, i] = Q.pop(); if (dd > dist[i]) continue;
    const k = lab[i], c = nb8(G, i, tmp);
    for (let t = 0; t < c; t += 2) {
      const j = tmp[t]; if (taken[j] >= 0) continue;
      const nd = dd + Math.round(tmp[t + 1] * mult(j)); if (nd > limit[k] || nd >= dist[j]) continue;
      if (isProb.has(k)) { const cc = rooms[k].center; if (Math.hypot(cx(j) - cc[0], cy(j) - cc[1]) > capOf[k]) continue; }
      dist[j] = nd; lab[j] = k; Q.push(nd, j);
    }
  }
  // cells per problem room: the 4-connected component holding most own spawns (comps: all of them, for the split into new rooms)
  const out = {}, comps = {};
  problem.forEach(k => {
    const own = new Set(seedOf[k]); const seen = new Uint8Array(G.n); const list = [];
    for (const s0 of seedOf[k]) { if (seen[s0] || lab[s0] !== k) continue;
      const comp = [s0]; seen[s0] = 1; for (let h = 0; h < comp.length; h++) for (let kk = 0; kk < 4; kk++) { const j = RP.nbOpen(G, comp[h], kk); if (j >= 0 && !seen[j] && lab[j] === k) { seen[j] = 1; comp.push(j); } }
      list.push({ n: comp.filter(i => own.has(i)).length, cells: comp, set: new Set(comp) }); }
    list.sort((a, b) => b.n - a.n || b.cells.length - a.cells.length);
    comps[k] = list; out[k] = list.length ? list[0].cells : [];
  });
  return { cells: out, comps, taken, cx, cy, snap };
}
/** cells -> polygon: smallest DP tolerance with <= 40 (else 48) corners that keeps the raw outline's own/foreign/overlap numbers. */
function cellsToPoly(ctx, sp, k, cells) {
  if (cells.length <= 20) return null;
  const raw = RP.outline(ctx.G, cells); if (raw.length < 4) return null;
  const rawM = metrics(ctx, sp, k, raw);
  let best = null;
  for (const maxPts of [40, 48, 64]) {
    for (let eps = 12; eps <= 260; eps *= 1.2) {
      const Q = simplifyAt(raw, eps); if (!Q || Q.length > maxPts) continue;
      const P = Q.map(p => [Math.round(p[0]), Math.round(p[1])]);
      const m = metrics(ctx, sp, k, P);
      if (m.inside >= rawM.inside - 1e-9 && m.foreign <= rawM.foreign && m.overlap <= Math.max(rawM.overlap, 0.02)) return { P, eps: Math.round(eps), m };
      const sc = score(m) - P.length * 0.01;
      if (!best || sc > best.sc) best = { P, eps, m, sc };
    }
  }
  return best ? { P: best.P, eps: Math.round(best.eps), m: best.m } : null;
}

// ------------------------------------------------------------------------------------------------------------------------------
// routes
// ------------------------------------------------------------------------------------------------------------------------------
const plen = (pts) => { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]); return Math.round(L); };
function tryPath(a, b, pad = 12000, maxMs = 60000) {
  const r = geo.findPath({ x: a[0], y: a[1], z: a[2] }, { x: b[0], y: b[1], z: b[2] }, { pad, maxMs, maxNodes: 8e6 });
  if (!r.ok) return { ok: false, reason: r.reason };
  const end = r.points[r.points.length - 1];
  if (Math.abs(end.z - b[2]) > 250) return { ok: false, reason: `path ends on another floor (z ${end.z} vs ${b[2]})` };
  return { ok: true, pts: r.points.map(p => [p.x, p.y, p.z]) };
}
function makeRouteFor(d, F, r) {
  const entry = (F.enter && (F.enter.landing || F.enter.from)) || (F.entryPoint && F.entryPoint.at) || null;
  const ep = F.entryPoint && F.entryPoint.at;
  const c = r.center, tried = [];
  if (!entry) return { route: null, why: 'the floor has no entry / landing point' };
  let p = tryPath(entry, c); tried.push('entry: ' + (p.ok ? 'ok' : p.reason));
  if (p.ok) return { route: [entry.slice(), ...p.pts], how: 'geopath from the floor entry' };
  if (ep && Math.hypot(ep[0] - entry[0], ep[1] - entry[1]) > 300) {
    const a = tryPath(entry, ep); tried.push('entry->entryPoint: ' + (a.ok ? 'ok' : a.reason));
    if (a.ok) { const b = tryPath(ep, c); tried.push('entryPoint->room: ' + (b.ok ? 'ok' : b.reason)); if (b.ok) return { route: [entry.slice(), ...a.pts, ...b.pts], how: 'geopath floor entry -> floor entry point -> room' }; }
  }
  // junction: a point of another room's route on this floor
  const pts = [];
  (F.rooms || []).forEach(o => { if (o === r || !Array.isArray(o.route)) return; o.route.forEach((q, i) => { if (q[2] >= F.z[0] - 300 && q[2] <= F.z[1] + 300) pts.push({ o, i, q, d: Math.hypot(q[0] - c[0], q[1] - c[1]) }); }); });
  pts.sort((a, b) => a.d - b.d);
  const picked = []; for (const x of pts) { if (picked.length >= 6) break; if (picked.every(y => Math.hypot(y.q[0] - x.q[0], y.q[1] - x.q[1]) > 400)) picked.push(x); }
  for (const j of picked) {
    const b = tryPath(j.q, c, 8000, 30000); tried.push(`junction ${j.o.id}#${j.i}: ` + (b.ok ? 'ok' : b.reason));
    if (b.ok) return { route: [...j.o.route.slice(0, j.i + 1).map(q => q.slice()), ...b.pts], how: `route of ${j.o.id} to its point ${j.i + 1}, then geopath to the room` };
  }
  return { route: null, why: tried.join('; ') };
}
function walkFrom(F, route) {
  const door = (F.entryPoint && F.entryPoint.at) || null;
  if (!route) return null;
  if (!door || !F.enter || F.enter.how === 'teleporter' || F.enter.how === 'ziggurat') return plen(route);
  const j = route.findIndex(p => Math.hypot(p[0] - door[0], p[1] - door[1]) < 500 && Math.abs(p[2] - door[2]) < 300);
  return j >= 0 ? plen(route.slice(j)) : null;
}

// ------------------------------------------------------------------------------------------------------------------------------
// main
// ------------------------------------------------------------------------------------------------------------------------------
if (require.main === module) {
  const FILE = path.join(DATA, 'dungeon_rooms.json');
  const all = readJson(FILE);
  const spawns = readJson(path.join(DATA, 'spawns_h5.json')), NPC = readJson(path.join(DATA, 'npcs_h5.json')), AGGRO = readJson(path.join(DATA, 'aggro_h5.json'));
  const log = [], out = (s) => { console.log(s); log.push(s); };
  const t0 = Date.now();
  const before = {}, after = {};
  const count = (tab, d) => { const t = tab[d.key] = { name: d.name }; d.floors.forEach(F => (F.rooms || []).forEach(r => { const q = (r.polyInfo || {}).quality || 'none'; t[q] = (t[q] || 0) + 1; if ((!Array.isArray(r.route) || !r.route.length) && q !== 'duplicate') t.noRoute = (t.noRoute || 0) + 1; })); };
  all.forEach(d => count(before, d));
  const changes = [];

  // --- A. fixes that need no geometry: Forge Hall of Flames landing (GrandBossTeleporters.java ENTER_HALL_OF_FLAMES), Antharas ghost rooms ---
  const forge = all.find(d => d.key === 'forge');
  if (forge && forge.floors[2] && !forge.floors[2].enter.landing) {
    const F = forge.floors[2]; F.enter.landing = [183813, -115157, -3303];
    F.entryPoint = { at: [183813, -115157, -3303], how: "Klein's teleport landing (Scripts/data/dp/npcs/ai/GrandBossTeleporters.java ENTER_HALL_OF_FLAMES); walks on into the Hall of Flames" };
    F.enter.note = (F.enter.note || '') + ' Landing 183813,-115157,-3303 (GrandBossTeleporters.java), behind the gate Klein guards; the Hall of Flames is walkable from there (geopath 2026-10-08).';
    changes.push('forge f3: landing set from GrandBossTeleporters.java');
  }
  const antharas = all.find(d => d.key === 'antharas');
  if (antharas) {
    const F1 = antharas.floors[0], F2 = antharas.floors[1];
    F1.rooms.filter(r => /straight-[opq]$/.test(r.id) && (r.polyInfo || {}).quality === 'none').forEach(r => {
      // the geodata under the spawns has only the mountain top (z 160) and the lower dens (-4864..-5472): which floor-2 room holds them?
      const ids = new Set(r.monsters.map(m => m.id));
      const sps = spawns.filter(s => ids.has(s.id) && Math.hypot(s.x - r.center[0], s.y - r.center[1]) <= Math.max(600, r.radius + 300) && Math.abs(s.z - r.center[2]) < 400);
      const hit = {}; sps.forEach(s => { const ls = geo.layers(geo.toGeoX(s.x), geo.toGeoY(s.y)) || []; const low = ls.filter(l => l.h <= s.z + 20).sort((a, b) => b.h - a.h)[0];
        const z = low ? low.h : null; const o = F2.rooms.find(o2 => o2.poly && inPoly(s.x, s.y, o2.poly)); if (o) hit[o.id] = { n: ((hit[o.id] || {}).n || 0) + 1, z }; });
      const dup = Object.keys(hit).sort((a, b) => hit[b].n - hit[a].n)[0];
      if (!dup) return;
      r.polyInfo = { quality: 'duplicate', method: 'none', duplicateOf: dup, refined: TODAY, before: { quality: 'none', method: null },
        why: `datapack spawn height wrong: ${sps.length} spawn(s) at z ${[...new Set(sps.map(s => s.z))].join('/')} where the geodata has only the mountain top (z 160) and the lower dens; L2J puts them on the ground below (z ${hit[dup].z}) = inside ${dup} (floor 2), which already holds them` };
      r.duplicateOf = dup;
      r.notes = (r.notes || '') + `; ${TODAY} refine: DUPLICATE of ${dup} (its monsters stand in the lower dens, the datapack z is wrong) — never picked`;
      changes.push(`${r.id}: duplicate of ${dup}`);
    });
  }

  // --- B. polygons of the problem rooms (up to 3 passes: a pass changes the neighbours, so the gates are checked again) ---
  for (let pass = 1; pass <= 3; pass++) {
  let touched = 0;
  for (const d of all) {
    if (ONLY && !ONLY.includes(d.key)) continue;
    d.floors.forEach((F, fi) => {
      const rooms = F.rooms || [];
      if (!rooms.length) return;
      // problem = marked check/none by room_polys.js, OR failing the gates under the ownership rule above (all polygons kept)
      const gctx = floorCtx(d, F, spawns, false), gsp = assignSpawns(gctx, (k) => !!rooms[k].poly);
      const gm = rooms.map((r, k) => (r.poly && (r.polyInfo || {}).quality !== 'duplicate') ? metrics(gctx, gsp, k, r.poly) : null);
      const gateFail = new Set(rooms.map((r, k) => k).filter(k => gm[k] && !gm[k].pass && !MG.isManual(rooms[k])));
      // a NEW room (2026-10-08) left with 1-2 spawns of its own next to a room with the same monsters is merged into that room
      rooms.forEach((n, k) => {
        if (!n.added || !gateFail.has(k) || gm[k].own > 2) return;
        const ids = new Set(n.monsters.map(m => m.id));
        const into = rooms.filter(o => o !== n && o.poly && (o.polyInfo || {}).quality !== 'duplicate' && (o.monsters || []).some(m => ids.has(m.id)) && Math.abs(o.center[2] - n.center[2]) < 400)
          .map(o => ({ o, dd: distToPoly(n.center[0], n.center[1], o.poly) })).filter(x => x.dd < 800).sort((a, b) => a.dd - b.dd)[0];
        if (!into) return;
        const p = into.o;
        n.polyInfo = { quality: 'duplicate', method: 'none', duplicateOf: p.id, refined: TODAY, why: `only ${gm[k].own} spawn(s) of its own left (the others stand in ${p.id}); merged into ${p.id}, ${Math.round(into.dd)} from its outline`, before: { quality: (n.polyInfo || {}).quality, method: (n.polyInfo || {}).method } };
        n.duplicateOf = p.id; delete n.poly; delete n.zRange; delete n.area; n.route = null; n.routeLength = null; n.walkFromFloorEntry = null;
        n.notes = (n.notes || '') + `; ${TODAY} refine: MERGED into ${p.id} (only ${gm[k].own} spawn(s) of its own) — polygon and route removed, never picked`;
        gateFail.delete(k); out(`  ${n.id}: merged into ${p.id}`); changes.push(`${n.id}: merged into ${p.id}`);
      });
      const probs = rooms.map((r, k) => k).filter(k => (pass === 1 && isProblem(rooms[k])) || gateFail.has(k));
      if (!probs.length) return;
      touched += probs.length;
      const t1 = Date.now();
      // a NEW room (2026-10-08 stage B) at the same place with the same monsters as a problem room is the same room twice: the older id stays
      rooms.forEach(n => {
        if (!n.added || MG.isManual(n) || isProblem(n) || (n.polyInfo || {}).quality === 'duplicate') return;
        const ids = (x) => x.monsters.map(m => m.id).sort().join(',');
        const p = probs.map(k => rooms[k]).find(o => !o.added && Math.hypot(o.center[0] - n.center[0], o.center[1] - n.center[1], o.center[2] - n.center[2]) < 400 && ids(o) === ids(n) && Math.abs(o.spawnCount - n.spawnCount) <= 1);
        if (!p) return;
        n.polyInfo = { quality: 'duplicate', method: 'none', duplicateOf: p.id, refined: TODAY, why: `same ${n.spawnCount} spawns (${n.monsters.map(m => m.name).join(', ')}) as the older room ${p.id}, ${Math.round(Math.hypot(p.center[0] - n.center[0], p.center[1] - n.center[1]))} apart; ${p.id} keeps them`, before: { quality: (n.polyInfo || {}).quality, method: (n.polyInfo || {}).method } };
        n.duplicateOf = p.id; delete n.poly; delete n.zRange; delete n.area; n.route = null; n.routeLength = null; n.walkFromFloorEntry = null;
        n.notes = (n.notes || '') + `; ${TODAY} refine: DUPLICATE of ${p.id} (same monsters, same place) — polygon and route removed, never picked`;
        out(`  ${n.id}: duplicate of ${p.id}`); changes.push(`${n.id}: duplicate of ${p.id}`);
      });
      const ctx = floorCtx(d, F, spawns, true);
      const fixed = (k) => !probs.includes(k) && (rooms[k].polyInfo || {}).quality !== 'duplicate';
      const fixedK = rooms.map((r, k) => k).filter(fixed);
      const sp = assignSpawns(ctx, fixed);
      const P = partition(ctx, sp, probs, fixedK);
      out(`== pass ${pass} ${d.key} f${fi + 1} ${F.name}: ${probs.length} problem rooms, ${ctx.G.cells} walkable cells, ${sp.length} spawns`);
      // SPLIT: own spawns in a second, separate piece of walkable ground (walls / another room between them): >= 3 monsters = a new room,
      // fewer = strays the room cannot hold (counted as separatedSpawns, owned by nobody)
      const newRooms = [], sepOf = {};
      probs.slice().forEach(k => {
        (P.comps[k] || []).slice(1).forEach(c => {
          const mineS = sp.filter(s => s.room === k && c.set.has(P.snap(s.x, s.y, s.z)));
          const n = mineS.reduce((t, s) => t + (s.count || 1), 0);
          if (!mineS.length) return;
          if (n >= 3 && c.cells.length > 20) {
            const mx = mineS.reduce((t, s) => t + s.x, 0) / mineS.length, my = mineS.reduce((t, s) => t + s.y, 0) / mineS.length;
            let ci = c.cells[0], bd = 1e9; c.cells.forEach(i => { const dd = Math.hypot(P.cx(i) - mx, P.cy(i) - my) - ctx.D[i] * 0.3; if (dd < bd) { bd = dd; ci = i; } });
            const center = [P.cx(ci), P.cy(ci), ctx.G.H[ci]], idx = rooms.length;
            rooms.push({ id: '__split' + idx, added: TODAY, center, radius: Math.round(Math.max(400, ...mineS.map(s => Math.hypot(s.x - center[0], s.y - center[1])))), monsters: [] });
            mineS.forEach(s => { s.room = idx; }); probs.push(idx); P.cells[idx] = c.cells; newRooms.push({ idx, mine: mineS, parent: k });
          } else { mineS.forEach(s => { s.room = -1; s.separatedFrom = k; }); sepOf[k] = (sepOf[k] || []).concat(mineS.map(s => [s.x, s.y, s.z])); }
        });
      });
      // candidates first, then every problem room is judged with the other problem rooms' candidates in place (overlap, foreign)
      const oldPoly = {}, cand = {};
      probs.forEach(k => { oldPoly[k] = rooms[k].poly || null; const cells = P.cells[k] || []; const res = cellsToPoly(ctx, sp, k, cells); if (!res) return;
        let zmin = 1e9, zmax = -1e9; cells.forEach(i => { if (ctx.G.H[i] < zmin) zmin = ctx.G.H[i]; if (ctx.G.H[i] > zmax) zmax = ctx.G.H[i]; });
        sp.filter(s => s.room === k).forEach(s => { zmin = Math.min(zmin, s.z - 50); zmax = Math.max(zmax, s.z + 50); }); res.zr = [Math.round(zmin - 100), Math.round(zmax + 150)]; cand[k] = res; });
      // ENCLOSED: a kept room's spawn that stands outside its own polygon but in a hole of a new outline (walled in by this room on every
      // side) belongs to this room
      const enclosed = {};
      probs.forEach(k => { if (!cand[k]) return; const set = new Set(P.cells[k] || []); const cz = rooms[k].center[2];
        const op = (j) => fixed(j) ? rooms[j].poly : (cand[j] ? cand[j].P : null);
        enclosed[k] = sp.filter(s => s.room >= 0 && s.room !== k && !(op(s.room) && inPoly(s.x, s.y, op(s.room))) && inPoly(s.x, s.y, cand[k].P) && Math.abs(s.z - cz) < 400 && !set.has(P.snap(s.x, s.y, s.z, 4)))
          .map(s => ({ s, was: s.room })); });
      const setAll = (pick) => probs.forEach(k => { const p = pick(k); if (p) rooms[k].poly = p; else delete rooms[k].poly; });
      const mOldOf = {}; setAll(k => oldPoly[k]); probs.forEach(k => { mOldOf[k] = metrics(ctx, sp, k, oldPoly[k]); });
      Object.keys(enclosed).forEach(k => enclosed[k].forEach(e => { e.s.room = +k; }));
      const mNewOf = {}; setAll(k => (cand[k] ? cand[k].P : oldPoly[k])); probs.forEach(k => { if (cand[k]) mNewOf[k] = metrics(ctx, sp, k, cand[k].P, cand[k].zr); });
      const useNewOf = {}; probs.forEach(k => { useNewOf[k] = !!cand[k] && (!oldPoly[k] || score(mNewOf[k]) > score(mOldOf[k]) + 0.5); });
      // a kept old outline must not overlap a neighbour's new one: then both take the partition (made disjoint)
      for (let it = 0; it < 3; it++) probs.forEach(j => { if (useNewOf[j] || !cand[j] || !oldPoly[j]) return;
        if (probs.some(k => useNewOf[k] && overlapArea(cand[k].P, oldPoly[j]) >= 0.03 * Math.min(polyArea(cand[k].P), polyArea(oldPoly[j])))) useNewOf[j] = true; });
      Object.keys(enclosed).forEach(k => { if (!useNewOf[k]) enclosed[k].forEach(e => { e.s.room = e.was; }); });
      setAll(k => (useNewOf[k] ? cand[k].P : oldPoly[k]));
      const strayList = (k) => ((rooms[k].polyInfo || {}).strays || []).concat(sepOf[k] || []);
      probs.forEach(k => {
        const r = rooms[k], old = r.polyInfo || {};
        const mOld = mOldOf[k], res = cand[k] ? { ...cand[k], m: mNewOf[k] } : null, useNew = useNewOf[k];
        const zr = res ? res.zr : null;
        const m = useNew ? metrics(ctx, sp, k, res.P, zr) : metrics(ctx, sp, k, oldPoly[k]);    // final, with the final neighbours
        const tag = (x) => x ? `own ${x.own}, inside ${Math.round(x.inside * 100)}%, foreign ${x.foreign}, overlap ${Math.round(x.overlap * 100)}%, area ${Math.round(x.area / 1e4) / 100} M` : '-';
        if (useNew) {
          r.poly = res.P; r.zRange = zr; r.area = Math.round(res.m.area);
          const circleA = Math.round(Math.PI * Math.pow(Math.max(500, r.radius || 700), 2));
          r.polyInfo = { method: 'partition', T: null, doorwayCut: null, isolated: true, sharedWith: [], capped: false, neckCutT: null, corners: res.P.length, simplifyEps: res.eps,
            ownSpawns: m.own, ownInside: Math.round(m.inside * 100), ownWithin150: Math.round(m.within150 * 100), foreignInside: m.foreign, overlapPct: Math.round(m.overlap * 1000) / 10,
            area: r.area, circleArea: circleA, ...(old.newRoom ? { newRoom: true } : {}), refined: TODAY, ...(old.splitFrom ? { splitFrom: old.splitFrom } : { before: old.before || { quality: old.quality, method: old.method || null, ownWithin150: old.ownWithin150 ?? null, foreignInside: old.foreignInside ?? null } }),
            ...(strayList(k).length ? { strays: strayList(k) } : {}), ...(enclosed[k] && enclosed[k].length ? { enclosedSpawns: enclosed[k].length } : {}),
            quality: m.pass ? 'good' : 'check', ...(m.pass ? {} : { why: m.why }) };
        } else if (r.poly) {
          r.polyInfo = { ...old, ownSpawns: m.own, ownInside: Math.round(m.inside * 100), ownWithin150: Math.round(m.within150 * 100), foreignInside: m.foreign, overlapPct: Math.round(m.overlap * 1000) / 10,
            ...(strayList(k).length ? { strays: strayList(k) } : {}), refined: TODAY, before: old.before || { quality: old.quality, method: old.method || null },
            quality: m.pass ? (old.method === 'spawn-hull' ? 'spawn-hull' : 'good') : 'check' };
          if (m.pass) delete r.polyInfo.why; else r.polyInfo.why = m.why;
        }
        // the monster list = what really stands in the room now (the 2026-10-07 list also counted spawns that other rooms' outlines hold)
        if (r.poly && m.own && !String(r.id).startsWith('__split')) {
          const mine = sp.filter(s => s.room === k), mon = {};
          const known = (id) => (r.monsters || []).find(x => x.id === id) || rooms.flatMap(o => (o && o.monsters) || []).find(x => x.id === id) || {};
          mine.forEach(s => { const n = NPC[s.id] || {}, kn = known(s.id); mon[s.id] = mon[s.id] || { name: n.n || kn.name || s.name, id: s.id, level: n.l || kn.level || null, count: 0, aggressive: kn.aggressive ?? null }; mon[s.id].count += (s.count || 1); });
          const ml = Object.values(mon).sort((a, b) => b.count - a.count), before = r.spawnCount;
          const sig = (l) => l.map(x => x.id + ':' + x.count).sort().join(',');
          if (sig(ml) !== sig(r.monsters || [])) {
            r.monsters = ml; r.spawnCount = ml.reduce((t, x) => t + x.count, 0);
            const lv = ml.map(x => x.level).filter(x => x);
            if (lv.length) { const minL = Math.min(...lv), maxL = Math.max(...lv); const lr = [minL, maxL];
              if (!r.levelRange || lr[0] !== r.levelRange[0] || lr[1] !== r.levelRange[1]) {
                r.levelRange = lr; const levels = []; ml.forEach(x => { for (let i = 0; i < x.count; i++) if (x.level) levels.push(x.level); }); levels.sort((a, b) => a - b);
                let suits = [maxL - 2, minL + 3]; if (suits[0] > suits[1]) { const med = levels[Math.floor(levels.length / 2)]; suits = [med - 2, med + 3]; r.suitNote = 'mixed levels: suggestion built on the median monster level ' + med; } else delete r.suitNote;
                r.suitsPartyLevel = suits; } }
            r.polyInfo.listedBefore = (old.listedBefore ?? before);
            r.notes = String(r.notes || '').replace(/; d{4}-dd-dd refine: monster list = [^;]*/, '') + `; ${TODAY} refine: monster list = the ${r.spawnCount} spawns inside the outline (was ${before}; the rest stand in the neighbouring rooms)`;
          }
        }
        if (!m.pass && argv.includes('--debug') && r.poly) {
          sp.filter(s => s.room === k && !inPoly(s.x, s.y, r.poly)).forEach(s => out(`     own outside: ${s.name} ${s.x},${s.y},${s.z} in ${rooms.filter(o => o.poly && o !== r && inPoly(s.x, s.y, o.poly)).map(o => o.id).join(',') || '-'} dist ${Math.round(distToPoly(s.x, s.y, r.poly))}`));
          sp.filter(s => s.room >= 0 && s.room !== k && inPoly(s.x, s.y, r.poly) && Math.abs(s.z - r.center[2]) < 400).forEach(s => out(`     foreign inside: ${s.name} ${s.x},${s.y},${s.z} of ${rooms[s.room].id}`));
        }
        out(`  ${r.id}: ${old.quality} -> ${r.polyInfo.quality} (${useNew ? 'partition' : 'kept'}) | before: ${tag(mOld)} | partition: ${res ? tag(res.m) : 'none'}${m.pass ? '' : ' | WHY: ' + m.why}`);
        changes.push(`${r.id}: ${old.quality} -> ${r.polyInfo.quality}`);
      });
      // split-off pieces -> real rooms in the room_polys.js format (id, name, monsters, levels, walk route)
      newRooms.forEach(N => {
        const prov = rooms[N.idx], parent = rooms[N.parent];
        if (!prov.poly) { N.mine.forEach(s => { s.room = -1; }); rooms.splice(N.idx, 1, null); out(`  split of ${parent.id}: no outline, dropped`); return; }
        const rec = RP.makeRoom(d, F, fi, { isNew: { center: prov.center }, mine: N.mine }, NPC);
        Object.assign(rec, { poly: prov.poly, zRange: prov.zRange, area: prov.area, polyInfo: { ...prov.polyInfo, newRoom: true, splitFrom: parent.id, before: undefined } });
        rec.notes = `added ${TODAY} by room_refine.js: monsters of ${parent.id} that stand in a separate piece of the cave (walls or another room between)` + (rec.route ? '' : '; NO walk route found from the floor entry (never picked automatically)');
        rooms[N.idx] = rec;
        // (the parent's monster list was rebuilt above from the spawns it still holds)
        parent.notes = (parent.notes || '') + `; ${TODAY} refine: ${N.mine.length} spawns split off into ${rec.id}`;
        out(`  NEW ${rec.id} split from ${parent.id}: ${N.mine.length} spawns, ${rec.polyInfo.quality}, route ${rec.route ? rec.routeLength : 'NONE'}`);
        changes.push(`${rec.id}: new (split from ${parent.id})`);
      });
      for (let i = rooms.length - 1; i >= 0; i--) if (rooms[i] === null) rooms.splice(i, 1);
      F._refined = true;
      F._ctx = ctx;
      out(`  ${Date.now() - t1} ms`);
    });
  }
  out(`-- pass ${pass}: ${touched} problem rooms worked on`);
  if (!touched) break;
  }

  // --- C. routes for rooms without one (+ centre z snapped to the ground) ---
  for (const d of all) {
    if ((ONLY && !ONLY.includes(d.key)) || argv.includes('--no-routes')) continue;
    d.floors.forEach((F, fi) => (F.rooms || []).forEach(r => {
      if (Array.isArray(r.route) && r.route.length) return;
      if ((r.polyInfo || {}).quality === 'duplicate') { out(`route ${r.id}: none (duplicate of ${r.duplicateOf})`); return; }
      const ls = geo.layers(geo.toGeoX(r.center[0]), geo.toGeoY(r.center[1])) || [];
      const near = ls.filter(l => l.h >= F.z[0] - 300 && l.h <= F.z[1] + 300).sort((a, b) => Math.abs(a.h - r.center[2]) - Math.abs(b.h - r.center[2]))[0];
      if (near && Math.abs(near.h - r.center[2]) > 150 && !MG.isManual(r)) { out(`  ${r.id}: centre z ${r.center[2]} -> ${near.h} (the geodata ground there)`); r.centerZDatapack = r.center[2]; r.center = [r.center[0], r.center[1], near.h]; }
      const t1 = Date.now(), R = makeRouteFor(d, F, r);
      if (R.route) {
        r.route = R.route.map(p => p.map(v => Math.round(v))); r.routeLength = plen(r.route); r.walkFromFloorEntry = walkFrom(F, r.route);
        r.notes = String(r.notes || '').replace(/; ?NO walk route found from the floor entry \(never picked automatically\)|no geodata route found from the floor entry \(check by hand\);? ?/g, '') + `; ${TODAY} refine: walk route ${R.how} (${r.routeLength})`;
        out(`route ${r.id}: OK ${r.routeLength} (${R.how}) ${Date.now() - t1} ms`); changes.push(`${r.id}: route ${r.routeLength}`);
      } else {
        r.routeWhy = R.why;
        out(`route ${r.id}: NONE — ${R.why}`);
      }
    }));
  }

  // --- D. safe spots of the changed floors (same walkable grid as room_polys.js), old ids kept where the spot stayed ---
  const ssCtx = { spawns, NPC, AGGRO };
  for (const d of all) d.floors.forEach((F, fi) => {
    if (!F._refined) return;
    const ctx = F._ctx;
    const old = F.safeSpots || [];
    const ss = SS.floorSafeSpots(d, F, fi, { ...ssCtx, G: ctx.G, D: ctx.D });
    const used = new Set(); const pre = (old[0] && old[0].id.replace(/-\d+$/, '')) || (ss[0] && ss[0].id.replace(/-\d+$/, ''));
    ss.forEach(s => { const o = old.find(o2 => !used.has(o2.id) && Math.hypot(o2.x - s.x, o2.y - s.y) < 200 && Math.abs(o2.z - s.z) < 200); if (o) { s.id = o.id; used.add(o.id); s._keep = true; } });
    let n = Math.max(0, ...old.map(o => +o.id.split('-').pop() || 0));
    ss.forEach(s => { if (!s._keep) { s.id = `${pre}-${++n}`; } delete s._keep; });
    ss.sort((a, b) => (+a.id.split('-').pop()) - (+b.id.split('-').pop()));
    out(`safe spots ${d.key} f${fi + 1}: ${old.length} -> ${ss.length} (${ss.filter(s => old.some(o => o.id === s.id)).length} kept their id)`);
    F.safeSpots = ss;
  });

  // --- E. validation of the whole file ---
  let bad = 0; const valid = [];
  for (const d of all) d.floors.forEach((F, fi) => {
    const polys = (F.rooms || []).filter(r => r.poly);
    (F.safeSpots || []).forEach(s => { const r = polys.find(r2 => distToPoly(s.x, s.y, r2.poly) < 150 && (!r2.zRange || (s.z >= r2.zRange[0] - 300 && s.z <= r2.zRange[1] + 300))); if (r) { bad++; valid.push(`safe spot ${s.id} within 150 of ${r.id}`); } });
    // polygon overlap on the floor (refined rooms vs everything)
    (F.rooms || []).forEach(r => { if (!r.poly || !(r.polyInfo || {}).refined) return; polys.forEach(o => { if (o === r || !zOverlap(r, o)) return; const a = overlapArea(r.poly, o.poly); if (a / Math.max(1, polyArea(r.poly)) >= GATE.overlap) valid.push(`overlap ${r.id} / ${o.id}: ${Math.round(a / polyArea(r.poly) * 100)}%`); }); });
  });
  out(`validation: ${valid.length ? valid.join('\n  ') : 'safe spots outside every room, no refined polygon overlaps >= 5 %'}`);
  // every room of every floor against the gates (rule 1 ownership, all polygons kept)
  const gateFails = [];
  for (const d of all) d.floors.forEach((F, fi) => {
    if (!(F.rooms || []).length) return;
    const ctx = floorCtx(d, F, spawns, false), sp = assignSpawns(ctx, (k) => !!F.rooms[k].poly);
    F.rooms.forEach((r, k) => { if ((r.polyInfo || {}).quality === 'duplicate') return; const m = metrics(ctx, sp, k, r.poly || null); if (!m.pass) gateFails.push(`${r.id} [${(r.polyInfo || {}).quality}]: ${m.why}`); });
  });
  out(`gates on all ${all.reduce((t, d) => t + d.floors.reduce((u, F) => u + (F.rooms || []).length, 0), 0)} rooms: ${gateFails.length} fail\n  ${gateFails.join('\n  ')}`);

  all.forEach(d => d.floors.forEach(F => { delete F._refined; delete F._ctx; }));
  all.forEach(d => count(after, d));
  const keys = ['good', 'open-capped', 'shared-hall', 'spawn-hull', 'check', 'none', 'duplicate', 'noRoute'];
  out('\nper dungeon (before -> after): ' + keys.join(' / '));
  Object.keys(after).forEach(k => { const b = before[k], a = after[k]; const diff = keys.some(q => (b[q] || 0) !== (a[q] || 0)); if (diff) out(`  ${a.name}: ${keys.map(q => (b[q] || 0) + '->' + (a[q] || 0)).join(' / ')}`); });
  fs.writeFileSync(path.join(ROOT, 'docs', 'plan', 'room_polys', 'refine_report.json'), JSON.stringify({ at: new Date().toISOString(), before, after, changes, log }, null, 1));
  if (!DRY) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    fs.mkdirSync(path.join(ROOT, 'Settings', 'backup'), { recursive: true });
    fs.copyFileSync(FILE, path.join(ROOT, 'Settings', 'backup', `dungeon_rooms_before_refine_${stamp}.json`));
    // POLYEDIT 2026-10-08: locked + atomic, and every room edited on the dashboard meanwhile is copied back from disk (manual_guard.js)
    MG.writeGuarded(FILE, all, 'room');
    out('written ' + FILE + ' (backup dungeon_rooms_before_refine_' + stamp + '.json)');
  }
  out(`${Math.round((Date.now() - t0) / 1000)} s`);
}
module.exports = { assignSpawns, metrics, floorCtx };
