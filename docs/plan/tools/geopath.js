// GEOPATH — our own path finder on L2J geodata (Geodata/*.l2j), so a walk can "see" walls (user 2026-10-05 21:45).
// The walker in swarm.js only manages short straight hops (L2Swarm's FindPath gives up on long routes), so it ran into Oren's town wall.
// This plans the WHOLE route on the wall map: every 16x16-unit cell has a height and NSWE bits (which way you may walk).
//
// L2J geodata format (one file per region X_Y, 32768 x 32768 world units, 256 x 256 blocks of 8 x 8 cells):
//   blocks in order blockX (outer) x blockY (inner); each block starts with a type byte:
//     0 = FLAT       : int16 height                    (all 64 cells the same, every direction open)
//     1 = COMPLEX    : 64 x int16 cell                  (cellX outer, cellY inner)
//     2 = MULTILAYER : 64 x { uint8 layers, layers x int16 cell }   (bridges, buildings, caves: several floors)
//   cell int16: height = (cell & ~15) >> 1 (keep the sign: int16 -> int32 first), NSWE = cell & 0x0F : EAST 1 (x+), WEST 2 (x-), SOUTH 4 (y+), NORTH 8 (y-)
//   world x = (geoX << 4) - 294912 (region 11 starts there), region X = (geoX >> 11) + 11; same for y with -262144 and region Y + 10.
//
// Use:  node geopath.js x1 y1 z1 x2 y2 z2 [--json out.json] [--noswim]   (prints a summary; --json writes the waypoints)
// SWIMMING (2026-10-13): water zones (Scripts/data/water_zones.json) are crossed by swimming (no geodata checks there, cost x3.5, legs <= 650,
//   waypoints marked swim:true at the swim height); opts.swim === false = the old land-only rules. See water_zones.js.
//       require('./geopath').findPath({x,y,z}, {x,y,z}, opts) -> { ok, points: [{x,y,z}], cells, ms, reason }
const fs = require('fs');
const path = require('path');
const WATER = require('./water_zones');            // SWIMMING (2026-10-13): water zones = no geodata checks for a swimmer (see water_zones.js)
const GEO_DIR = process.env.GEO_DIR || path.join(__dirname, '..', '..', '..', 'Geodata');
const WORLD_X0 = -294912, WORLD_Y0 = -262144;     // world coords of geo (0,0) = region 11_10's corner
const E = 1, W = 2, S = 4, N = 8;

// --- region loading -------------------------------------------------------------------------------------------
const regions = new Map();                        // "rx_ry" -> { buf, type: Uint8Array(65536), off: Int32Array(65536), ml: Map } | null
function region(rx, ry) {
  const key = rx + '_' + ry;
  if (regions.has(key)) return regions.get(key);
  let r = null;
  const f = path.join(GEO_DIR, key + '.l2j');
  if (fs.existsSync(f)) {
    const buf = fs.readFileSync(f);
    const type = new Uint8Array(65536), off = new Int32Array(65536);
    let p = 0;
    for (let b = 0; b < 65536; b++) {
      const t = buf[p]; type[b] = t; off[b] = p + 1;
      if (t === 0) p += 3;
      else if (t === 1) p += 1 + 128;
      else if (t === 2) { p++; for (let c = 0; c < 64; c++) { const n = buf[p]; p += 1 + n * 2; } }
      else throw new Error(`${key}: unknown block type ${t} at byte ${p}`);
    }
    if (p !== buf.length) throw new Error(`${key}: parsed ${p} of ${buf.length} bytes — format mismatch`);
    r = { buf, type, off, ml: new Map() };
  }
  regions.set(key, r);
  return r;
}
/** Layers of one geo cell: [{ h, nswe }] (highest first in the file order); null = no geodata there (outside the world). */
const ONE = [{ h: 0, nswe: 15 }];
function layers(gx, gy) {
  const rx = (gx >> 11) + 11, ry = (gy >> 11) + 10;
  const r = region(rx, ry);
  if (!r) return null;
  const cx = gx & 2047, cy = gy & 2047, b = (cx >> 3) * 256 + (cy >> 3), ci = (cx & 7) * 8 + (cy & 7);
  const t = r.type[b], o = r.off[b], buf = r.buf;
  if (t === 0) return [{ h: buf.readInt16LE(o), nswe: 15 }];
  if (t === 1) { const v = buf.readInt16LE(o + ci * 2); return [{ h: (v & ~15) >> 1, nswe: v & 15 }]; }
  let co = r.ml.get(b);
  if (!co) { co = new Int32Array(64); let p = o; for (let c = 0; c < 64; c++) { co[c] = p; p += 1 + buf[p] * 2; } r.ml.set(b, co); }
  const p = co[ci], n = buf[p], out = [];
  for (let i = 0; i < n; i++) { const v = buf.readInt16LE(p + 1 + i * 2); out.push({ h: (v & ~15) >> 1, nswe: v & 15 }); }
  return out;
}
/** The layer of (gx,gy) that someone standing at height z is on: the closest one at or below z + 64, else the closest at all. */
function layerAt(gx, gy, z) {
  const ls = layers(gx, gy);
  if (!ls || !ls.length) return -1;
  let best = -1, bd = 1e9;
  ls.forEach((l, i) => { const d = l.h <= z + 64 ? z - l.h : 10000 + l.h - z; if (d < bd) { bd = d; best = i; } });
  return best;
}
const toGeoX = (x) => (Math.round(x) - WORLD_X0) >> 4, toGeoY = (y) => (Math.round(y) - WORLD_Y0) >> 4;
const toWorldX = (gx) => (gx << 4) + WORLD_X0 + 8, toWorldY = (gy) => (gy << 4) + WORLD_Y0 + 8;

// --- movement rules -------------------------------------------------------------------------------------------
const MAX_STEP = 48;                              // max height change between neighbour cells (a slope, not a cliff)
const DIRS = [[1, 0, E, W], [-1, 0, W, E], [0, 1, S, N], [0, -1, N, S]];
/** From cell (gx,gy) on layer li, one straight step (dx,dy): the neighbour's layer index, or -1 when a wall / cliff is in the way. */
function step(gx, gy, li, dx, dy) {
  const ls = layers(gx, gy); if (!ls || !ls[li]) return -1;
  const a = ls[li];
  const d = DIRS.find(q => q[0] === dx && q[1] === dy);
  if (!(a.nswe & d[2])) return -1;                // a wall on my side
  const nl = layers(gx + dx, gy + dy); if (!nl || !nl.length) return -1;
  let best = -1, bd = 1e9;
  nl.forEach((l, i) => { const dh = Math.abs(l.h - a.h); if (dh < bd) { bd = dh; best = i; } });
  if (best < 0 || bd > MAX_STEP) return -1;       // a cliff or a different floor
  if (!(nl[best].nswe & d[3]) && nl[best].nswe !== 15) {   // the other side has a wall facing me too: blocked
    if ((nl[best].nswe & 15) === 0) return -1;
  }
  return best;
}
/** Diagonal step only when both straight routes around the corner are open (never cut a wall corner). */
function diag(gx, gy, li, dx, dy) {
  const ax = step(gx, gy, li, dx, 0), ay = step(gx, gy, li, 0, dy);
  if (ax < 0 || ay < 0) return -1;
  const b1 = step(gx + dx, gy, ax, 0, dy), b2 = step(gx, gy + dy, ay, dx, 0);
  if (b1 < 0 || b2 < 0) return -1;
  return b1;
}

// --- A* -------------------------------------------------------------------------------------------------------
class Heap {
  constructor() { this.k = []; this.v = []; }
  push(key, val) { const k = this.k, v = this.v; let i = k.length; k.push(key); v.push(val);
    while (i > 0) { const p = (i - 1) >> 1; if (k[p] <= key) break; k[i] = k[p]; v[i] = v[p]; i = p; } k[i] = key; v[i] = val; }
  pop() { const k = this.k, v = this.v, top = v[0], lk = k.pop(), lv = v.pop(); const n = k.length;
    if (n) { let i = 0; for (;;) { let c = 2 * i + 1; if (c >= n) break; if (c + 1 < n && k[c + 1] < k[c]) c++; if (k[c] >= lk) break; k[i] = k[c]; v[i] = v[c]; i = c; } k[i] = lk; v[i] = lv; }
    return top; }
  get size() { return this.k.length; }
}
// 64 layers per cell (2026-10-07: the Tower of Insolence has up to 18 layers in one cell; with 8 the keys collided and routes jumped floors)
const KEY = (gx, gy, li) => (gx * 32768 + gy) * 64 + li;
/** Nearest walkable cell to (x,y,z) within r cells (a point inside a wall or a tree trunk is moved out). */
function snap(x, y, z, r = 6, anyZ = false) {
  const gx = toGeoX(x), gy = toGeoY(y);
  for (let rr = 0; rr <= r; rr++) for (let dx = -rr; dx <= rr; dx++) for (let dy = -rr; dy <= rr; dy++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== rr) continue;
    const li = layerAt(gx + dx, gy + dy, z); if (li < 0) continue;
    const l = layers(gx + dx, gy + dy)[li];
    if (l.nswe !== 0 && (anyZ || Math.abs(l.h - z) < 400)) return { gx: gx + dx, gy: gy + dy, li };
  }
  return null;
}
/**
 * Plan a route from a to b ({x,y,z}). opts: { maxNodes (default 4e6), pad (search box margin, default 6000 world units), maxMs }.
 * Returns { ok, points: waypoints [{x,y,z}] (start excluded, end included), cells: raw cell count, ms, reason }.
 */
// LEARNED BLOCKED SPOTS (2026-10-09, Scripts/data/geo_blocked.json, swarm.js GEOLEARN-PURE): spots where the server blocks every move although the
// geodata shows open ground (Tank3, Abandoned Camp area 3 north pocket). Active points (manual / 2 episodes, not disabled) are added to
// every route's avoid list unless the start or the goal lies inside (a bot standing in one must still get out). opts.noLearned skips them.
const BLOCKED_FILE = process.env.GEO_BLOCKED || path.join(__dirname, '..', '..', '..', 'Scripts', 'data', 'geo_blocked.json');
const learnedCache = { mtime: -1, points: [], at: 0 };
function learnedBlocked() {
  if (Date.now() - learnedCache.at < 5000) return learnedCache.points;
  learnedCache.at = Date.now();
  try {
    const st = fs.statSync(BLOCKED_FILE);
    if (st.mtimeMs !== learnedCache.mtime) {
      const j = JSON.parse(fs.readFileSync(BLOCKED_FILE, 'utf8').replace(/^﻿/, ''));
      learnedCache.points = (j.points || []).filter(p => p && isFinite(p.x) && isFinite(p.y) && p.disabled !== true && (p.manual === true || p.active === true || (p.episodes || 0) >= 2));
      learnedCache.mtime = st.mtimeMs;
    }
  } catch (e) { learnedCache.points = []; learnedCache.mtime = -1; }
  return learnedCache.points;
}
/** the active learned blocked points for a route a -> b (near the search box, same height band, neither end inside) */
function learnedAvoid(a, b, pad) {
  const x1 = Math.min(a.x, b.x) - pad, x2 = Math.max(a.x, b.x) + pad, y1 = Math.min(a.y, b.y) - pad, y2 = Math.max(a.y, b.y) + pad;
  const zs = [a.z, b.z].filter(v => isFinite(v));
  return learnedBlocked().filter(p => p.x >= x1 && p.x <= x2 && p.y >= y1 && p.y <= y2
    && !(isFinite(p.z) && zs.length && zs.every(z => Math.abs(z - p.z) > 800))
    && Math.hypot(a.x - p.x, a.y - p.y) > (p.r || 250) + 64 && Math.hypot(b.x - p.x, b.y - p.y) > (p.r || 250) + 64)
    .map(p => ({ x: p.x, y: p.y, r: p.r || 250 }));
}
function findPath(a, b, opts = {}) {
  const t0 = Date.now();
  // opts.avoid: [{x, y, r}] — spots a bot got stuck at (an obstacle the geodata does not show): cells inside are treated as walls
  const avoid = (opts.avoid || []).concat(opts.noLearned ? [] : learnedAvoid(a, b, opts.pad || 6000)).map(o => ({ gx: toGeoX(o.x), gy: toGeoY(o.y), r: Math.max(1, Math.round((o.r || 150) / 16)) }));
  const blocked = (gx, gy) => avoid.some(o => Math.hypot(gx - o.gx, gy - o.gy) <= o.r);
  const maxNodes = opts.maxNodes || 4e6, pad = opts.pad || 6000, maxMs = opts.maxMs || 20000;
  const HW = opts.hWeight > 1 ? opts.hWeight : 1.001;   // opts.hWeight (nav_atlas 2026-10-12): weighted A* for long offline walks (faster, at most hWeight x longer)
  // SWIMMING (user 2026-10-13, Tillion behind the Pirate Tunnel water): inside a water zone the server skips geodata checks, so a swimmer
  // crosses water cells freely (cost x SWIM.cost) and climbs out onto a low shore. opts.swim === false / opts.noSwim = land rules only.
  const SW = opts.swim === false || opts.noSwim ? null : WATER.swimGraph(SWACC), swimCost = opts.swimCost > 0 ? opts.swimCost : WATER.SWIM.cost;
  const s = snapSwim(SW, a, 6) || snap(a.x, a.y, a.z), g = snapSwim(SW, b, 10) || snap(b.x, b.y, b.z ?? a.z, 10) || snap(b.x, b.y, b.z ?? a.z, 10, true);   // goal height often unknown: any floor
  if (!s) return { ok: false, reason: 'start is not on walkable geodata', ms: Date.now() - t0 };
  if (!g) return { ok: false, reason: 'goal is not on walkable geodata', ms: Date.now() - t0 };
  const bx1 = Math.min(s.gx, g.gx) - (pad >> 4), bx2 = Math.max(s.gx, g.gx) + (pad >> 4);
  const by1 = Math.min(s.gy, g.gy) - (pad >> 4), by2 = Math.max(s.gy, g.gy) + (pad >> 4);
  const h = (gx, gy) => { const dx = Math.abs(gx - g.gx), dy = Math.abs(gy - g.gy); return (dx + dy) + (Math.SQRT2 - 2) * Math.min(dx, dy); };
  const gScore = new Map(), from = new Map(), open = new Heap();
  const sk = KEY(s.gx, s.gy, s.li);
  gScore.set(sk, 0); open.push(h(s.gx, s.gy), sk);
  let found = -1, expanded = 0;
  const unkey = (k) => { const li = k % 64, c = (k - li) / 64, gy = c % 32768, gx = (c - gy) / 32768; return [gx, gy, li]; };
  while (open.size) {
    const k = open.pop();
    const [gx, gy, li] = unkey(k);
    if (gx === g.gx && gy === g.gy && (b.z == null || g.li === undefined || li === g.li)) { found = k; break; }   // the goal's own FLOOR, not any layer at that x,y
    if (++expanded > maxNodes) return { ok: false, reason: `gave up after ${expanded} cells (too far or no way)`, ms: Date.now() - t0 };
    if ((expanded & 65535) === 0 && Date.now() - t0 > maxMs) return { ok: false, reason: `gave up after ${maxMs} ms`, ms: Date.now() - t0 };
    const gc = gScore.get(k);
    const swimHere = SW ? SW.swimming(gx, gy, li) : false;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      if (!dx && !dy) continue;
      const nx = gx + dx, ny = gy + dy;
      if (nx < bx1 || nx > bx2 || ny < by1 || ny > by2) continue;
      if (avoid.length && blocked(nx, ny)) continue;
      const base = dx && dy ? Math.SQRT2 : 1;
      const relax = (nl, mul) => {
        if (nl < 0 || nl > 63) return;
        const nk = KEY(nx, ny, nl), ng = gc + base * mul;
        const old = gScore.get(nk);
        if (old !== undefined && old <= ng) return;
        gScore.set(nk, ng); from.set(nk, k); open.push(ng + h(nx, ny) * HW, nk);
      };
      if (swimHere) { for (const m of SW.swimMoves(gx, gy, li, dx, dy)) relax(m.nl, m.swim ? swimCost : 1); continue; }
      let nl = dx && dy ? diag(gx, gy, li, dx, dy) : step(gx, gy, li, dx, dy);
      if (nl < 0 && SW) nl = SW.dropIn(gx, gy, li, dx, dy);
      relax(nl, 1);
    }
  }
  if (found < 0) return { ok: false, reason: `no way through (searched ${expanded} cells)`, ms: Date.now() - t0 };
  const cells = [];
  for (let k = found; k !== undefined; k = from.get(k)) cells.push(unkey(k));
  cells.reverse();
  const pts = smooth(cells, opts.maxLeg || 1000, avoid.length ? blocked : null, SW);
  const st = SW ? swimStats(cells, SW) : null;
  // lengthUnits = the real distance (a swim cell counts once); costUnits = what the search weighed (swim x SWIM.cost)
  return Object.assign({ ok: true, points: pts, cells: cells.length, expanded, ms: Date.now() - t0, lengthUnits: st ? st.len : Math.round((gScore.get(found) || 0) * 16) },
    st && st.swim ? { swimUnits: st.swim, maxSwimRun: st.maxRun, costUnits: Math.round((gScore.get(found) || 0) * 16) } : {});
}
// --- swimming helpers (2026-10-13) -------------------------------------------------------------------------------------------------
const SWACC = { heights: (gx, gy) => { const ls = layers(gx, gy); return ls ? ls.map(l => l.h) : null; }, nswe: (gx, gy, li) => { const ls = layers(gx, gy); return ls && ls[li] ? ls[li].nswe : 0; }, toWorldX: (gx) => toWorldX(gx), toWorldY: (gy) => toWorldY(gy) };
/** a point inside a water zone (a swimmer, or a target under water): its cell's water floor, whatever the depth (snap() wants |h - z| < 400) */
function snapSwim(SW, p, r) {
  if (!SW || !p || !isFinite(p.x) || !isFinite(p.y)) return null;
  if (p.z != null && !WATER.zoneAt(p.x, p.y, p.z)) return null;
  const gx = toGeoX(p.x), gy = toGeoY(p.y);
  for (let rr = 0; rr <= (r || 0); rr++) for (let dx = -rr; dx <= rr; dx++) for (let dy = -rr; dy <= rr; dy++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== rr) continue;
    const ws = SW.info(gx + dx, gy + dy); if (!ws) continue;
    let w = null, bd = 1e9; for (const o of ws) { const d = p.z == null ? -o.h : (p.z < o.lo ? o.lo - p.z : p.z > o.hi ? p.z - o.hi : 0); if (d < bd) { bd = d; w = o; } }
    if (w && (p.z == null || bd <= 300)) return { gx: gx + dx, gy: gy + dy, li: w.li };
  }
  return null;
}
/** real length, swim length and the longest unbroken swim of a cell path (breath: 60 s under water, then 1 % HP a second) */
function swimStats(cells, SW) {
  let len = 0, swim = 0, run = 0, maxRun = 0;
  for (let i = 1; i < cells.length; i++) {
    const p = cells[i - 1], c = cells[i], d = (p[0] !== c[0] && p[1] !== c[1] ? Math.SQRT2 : 1) * 16;
    len += d;
    if (SW.swimming(p[0], p[1], p[2]) && SW.swimming(c[0], c[1], c[2])) { swim += d; run += d; if (run > maxRun) maxRun = run; } else run = 0;
  }
  return { len: Math.round(len), swim: Math.round(swim), maxRun: Math.round(maxRun) };
}
/** a swimmer's straight move from cell a to cell b (no geodata check on the server): every cell between is water, b is water or the shore */
function swimClear(a, b, SW, blocked) { return SW.clear(a, b, blocked); }   // the rule lives in water_zones.js (slots)
/** Straight line between two cells (Bresenham, layer-following) without hitting a wall: the walker can go straight there. */
// endLayer (2026-10-13): the walk must end on b's own floor (a leg from a tunnel floor to the water surface above it is no straight walk)
function clear(a, b, blocked, endLayer) {
  let [x, y, li] = a; const [x2, y2] = b;
  const dx = Math.abs(x2 - x), dy = Math.abs(y2 - y), sx = x < x2 ? 1 : -1, sy = y < y2 ? 1 : -1;
  let err = dx - dy;
  while (x !== x2 || y !== y2) {
    const e2 = 2 * err; let mx = 0, my = 0;
    if (e2 > -dy) { err -= dy; mx = sx; }
    if (e2 < dx) { err += dx; my = sy; }
    const nl = mx && my ? diag(x, y, li, mx, my) : step(x, y, li, mx, my);
    if (nl < 0) return false;
    x += mx; y += my; li = nl;
    if (blocked && blocked(x, y)) return false;               // an avoided spot (a bot got stuck there)
  }
  return !endLayer || b[2] === undefined || li === b[2];
}
/** Cells -> few waypoints: the furthest cell still in a clear straight line, legs at most maxLeg world units. */
function smooth(cells, maxLeg, blocked, SW) {
  const out = [], maxC = Math.max(4, Math.floor(maxLeg / 16)), maxSwimC = Math.max(4, Math.floor(Math.min(maxLeg, WATER.SWIM.maxLeg) / 16));
  let i = 0;
  while (i < cells.length - 1) {
    // a leg that STARTS in water is a swim (the server skips geodata, cuts it at 700): all water cells, <= SWIM.maxLeg; else the wall check
    const swim = SW && SW.swimming(cells[i][0], cells[i][1], cells[i][2]);
    let j = Math.min(cells.length - 1, i + (swim ? maxSwimC : maxC));
    const far = (q) => swim && Math.hypot(cells[q][0] - cells[i][0], cells[q][1] - cells[i][1]) * 16 > WATER.SWIM.maxLeg;
    while (j > i + 1 && (far(j) || !(swim ? swimClear(cells[i], cells[j], SW, blocked) : clear(cells[i], cells[j], blocked, !!SW)))) j--;
    const c = cells[j], l = layers(c[0], c[1])[c[2]], w = SW ? SW.slotOf(c[0], c[1], c[2]) : null;
    out.push(w ? { x: toWorldX(c[0]), y: toWorldY(c[1]), z: w.z, swim: true } : { x: toWorldX(c[0]), y: toWorldY(c[1]), z: l.h });
    i = j;
  }
  return out;
}
/** Is the straight walk from a to b ({x,y,z}) free of walls? (for checking a planned leg or a click) */
function lineClear(a, b) {
  const s = snap(a.x, a.y, a.z, 2), g = snap(b.x, b.y, b.z ?? a.z, 2);
  return !!(s && g && clear([s.gx, s.gy, s.li], [g.gx, g.gy, g.li]));
}
/** Is the straight move a -> b allowed on the server? A start inside a water zone on a water cell = a swim (every cell between is water,
 *  b in the water or on a shore <= SWIM.climb above it, <= 700 units: the server's water move cap); else lineClear (walls). */
function legOk(a, b) {
  const SW = WATER.swimGraph(SWACC);
  const s = snapSwim(SW, a, 1);
  if (s) {
    if (Math.hypot(b.x - a.x, b.y - a.y) > 700) return false;
    const gb = [toGeoX(b.x), toGeoY(b.y)], ls = layers(gb[0], gb[1]) || [];
    // every floor of b (nearest to b.z first): a swim slot or a shore floor that the swim line reaches
    const order = ls.map((l, i) => i).sort((p, q) => Math.abs(ls[p].h - (b.z ?? ls[p].h)) - Math.abs(ls[q].h - (b.z ?? ls[q].h)));
    return order.some(i => SW.clear([s.gx, s.gy, s.li], [gb[0], gb[1], i], null));
  }
  return lineClear(a, b);
}
/** Point in polygon (poly = [[x,y],...] or [{x,y},...]), ray casting. */
function inPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const pi = poly[i], pj = poly[j], xi = pi.x ?? pi[0], yi = pi.y ?? pi[1], xj = pj.x ?? pj[0], yj = pj.y ?? pj[1];
    if (((yi > y) !== (yj > y)) && x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-9) + xi) inside = !inside;
  }
  return inside;
}
/**
 * FLEE SPOT (user 2026-10-08 18:05, Bishop1 pinned in a Cruma corner by Catherok): the nearest place I can really WALK to (walls, floors)
 * that is out of every danger circle — a dungeon "safe spot" (corridor point, floor.safeSpots) when one is reachable within opts.maxSafeWalk,
 * else the nearest free cell outside the rooms (opts.polys = room polygons: a hallway), else the cell with the best clearance.
 * dangers: [{x, y, r}] (monster + aggro radius). Dijkstra over the geodata from `a`; cells inside a danger circle cost 4x (walk around them).
 * Returns { ok, flee: true, kind: 'safeSpot'|'hallway'|'free'|'best', spot: {x,y,z}, name, clearance, points (wall-free legs), lengthUnits, ms }.
 */
function fleeSpot(a, dangers, opts = {}) {
  const t0 = Date.now();
  const s = snap(a.x, a.y, a.z);
  if (!s) return { ok: false, flee: true, reason: 'start is not on walkable geodata', ms: Date.now() - t0 };
  const D = (dangers || []).filter(d => d && isFinite(d.x) && isFinite(d.y)).map(d => ({ x: +d.x, y: +d.y, r: +d.r || 750 }));
  const polys = (opts.polys || []).filter(p => Array.isArray(p) && p.length >= 3);
  const margin = opts.margin ?? 150, maxWalk = opts.maxWalk || 3500, maxSafeWalk = opts.maxSafeWalk || 6000, maxNodes = opts.maxNodes || 500000;
  const safe = (opts.safeSpots || []).filter(p => p && isFinite(p.x) && isFinite(p.y) && (p.z == null || Math.abs(p.z - a.z) < 600))
    .map(p => ({ ...p, gx: toGeoX(p.x), gy: toGeoY(p.y) }));
  const clearOf = (x, y) => D.length ? Math.min(...D.map(d => Math.hypot(x - d.x, y - d.y) - d.r)) : 1e9;
  const safeOk = safe.filter(p => clearOf(p.x, p.y) >= margin);              // a safe spot that a monster stands in now is no use
  const limit = Math.max(maxWalk, safeOk.length ? maxSafeWalk : 0) / 16;
  const gScore = new Map(), from = new Map(), open = new Heap();
  const sk = KEY(s.gx, s.gy, s.li);
  gScore.set(sk, 0); open.push(0, sk);
  const unkey = (k) => { const li = k % 64, c = (k - li) / 64, gy = c % 32768, gx = (c - gy) / 32768; return [gx, gy, li]; };
  let free = null, hall = null, best = null, safeHit = null, expanded = 0;
  while (open.size) {
    const k = open.pop(), [gx, gy, li] = unkey(k), gc = gScore.get(k);
    if (gc > limit || ++expanded > maxNodes) break;
    const x = toWorldX(gx), y = toWorldY(gy), c = clearOf(x, y), walk = gc * 16;
    if (!safeHit && safeOk.length) { const sp = safeOk.find(p => Math.abs(p.gx - gx) <= 3 && Math.abs(p.gy - gy) <= 3); if (sp && walk <= maxSafeWalk) { safeHit = { k, sp }; break; } }
    if (walk <= maxWalk) {
      if (c >= margin && walk >= 150) {
        const room = polys.some(p => inPoly(x, y, p));
        if (!room && !hall) hall = k;
        if (!free) free = k;
      }
      const score = Math.min(c, 1500) - walk * 0.25;
      if (!best || score > best.score) best = { k, score, c };
    }
    if (hall && !safeOk.length) break;                                      // nearest hallway cell found and no safe spot to look for
    if (hall && safeOk.length && walk > maxSafeWalk) break;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      if (!dx && !dy) continue;
      const nl = dx && dy ? diag(gx, gy, li, dx, dy) : step(gx, gy, li, dx, dy);
      if (nl < 0) continue;
      const nx = gx + dx, ny = gy + dy, nwx = toWorldX(nx), nwy = toWorldY(ny);
      const inDanger = D.some(d => Math.hypot(nwx - d.x, nwy - d.y) < d.r);
      const nk = KEY(nx, ny, nl), ng = gc + (dx && dy ? Math.SQRT2 : 1) * (inDanger ? 4 : 1);
      const old = gScore.get(nk);
      if (old !== undefined && old <= ng) continue;
      gScore.set(nk, ng); from.set(nk, k); open.push(ng, nk);
    }
  }
  let pick = null, kind = '', name = '';
  if (safeHit) { pick = safeHit.k; kind = 'safeSpot'; name = safeHit.sp.name || safeHit.sp.id || 'safe spot'; }
  else if (hall && polys.length) { pick = hall; kind = 'hallway'; }
  else if (free) { pick = free; kind = 'free'; }
  else if (best && best.k !== sk) { pick = best.k; kind = 'best'; }
  if (pick === null) return { ok: false, flee: true, reason: `no free spot within ${maxWalk} (searched ${expanded} cells)`, ms: Date.now() - t0 };
  const cells = [];
  for (let k = pick; k !== undefined; k = from.get(k)) cells.push(unkey(k));
  cells.reverse();
  const pts = cells.length > 1 ? smooth(cells, opts.maxLeg || 600, null) : [];
  const [ex, ey, el] = cells[cells.length - 1], L = layers(ex, ey)[el];
  const spot = { x: toWorldX(ex), y: toWorldY(ey), z: L.h };
  return { ok: true, flee: true, kind, name, spot, clearance: Math.round(Math.min(clearOf(spot.x, spot.y), 99999)), points: pts.length ? pts : [spot],
    lengthUnits: Math.round((gScore.get(pick) || 0) * 16), expanded, ms: Date.now() - t0 };
}
module.exports = { findPath, learnedBlocked, learnedAvoid, fleeSpot, inPoly, lineClear, legOk, layers, layerAt, step, toGeoX, toGeoY, toWorldX, toWorldY, region };

if (require.main === module) {
  const ji = process.argv.indexOf('--json');
  const a = process.argv.slice(2).filter((v, i) => !v.startsWith('--') && i + 2 !== ji + 1).map(Number);
  if (a.length < 6 || a.some(isNaN)) { console.log('usage: node geopath.js x1 y1 z1 x2 y2 z2 [--json out.json] [--noswim]'); process.exit(1); }
  const r = findPath({ x: a[0], y: a[1], z: a[2] }, { x: a[3], y: a[4], z: a[5] }, { swim: !process.argv.includes('--noswim'), maxNodes: 8e6, maxMs: 120000, pad: 6000 });
  console.log(r.ok ? `OK: ${r.points.length} waypoints, ${r.cells} cells, ~${r.lengthUnits} units walked (straight line ${Math.round(Math.hypot(a[3] - a[0], a[4] - a[1]))}), ${r.expanded} cells searched, ${r.ms} ms${r.swimUnits ? `, swims ${r.swimUnits} units (longest ${r.maxSwimRun})` : ''}`
    : `NO PATH: ${r.reason} (${r.ms} ms)`);
  if (ji > 0) fs.writeFileSync(process.argv[ji + 1], JSON.stringify({ from: { x: a[0], y: a[1], z: a[2] }, to: { x: a[3], y: a[4], z: a[5] }, ...r }));
}
