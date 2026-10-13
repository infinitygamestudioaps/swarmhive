// SWIMMING (2026-10-13): water zones are crossed by swimming like geopath.js (water_zones.js); opts.swim === false = land only.
// RAID ROUTES (2026-10-13 15:15, owner: "precompute all routes to all raid bosses ... go around obstacles and navigate the centre (do not graze
// obstacles) ... do not choose positions where we must swim if it can be avoided ... Garden of Eva: you have to go down and there are doors"):
// optional, all OFF unless asked for (every other caller keeps the old rules, same results):
//   opts.drops   true = one-way DROP edges: a straight move off a ledge whose NSWE flag is open (L2J GeoData.canMove only checks the NSWE flag
//                of the cell you leave; a fall is allowed, a climb is not) onto the highest floor below (<= opts.maxDrop, default 3000). Cost
//                opts.dropCost cells (default 40) + 2 per 16 units above the safe fall height (333: no damage; above it the server takes
//                fall damage = maxHP x height / 1000, capped at current HP - 1: never lethal). Waypoints after a drop carry  drop: <height>.
//   opts.clear   R cells (e.g. 4 = 64 units): CLEARANCE cost (a cell closer than R cells to a wall / cliff / blocked NSWE costs up to
//                1 + opts.clearW (default 1.5) times more: the path keeps to the middle of corridors and away from rocks in the open), and the
//                smoothing only makes a straight leg when every cell on it keeps min(opts.clearNeed (3), the path's own clearance there).
//   opts.danger  [{ x, y, r, w }] circles (aggressive monsters far above the team): every cell inside costs 1 + w more.
//   opts.swimCost (geopath default x3.5) for the raid policy x12.
//   opts.wet     'block' | number: a WET floor = a floor inside a water zone (standing there the server makes you swim: the Garden of Eva sea
//                floor, a flooded tunnel). 'block' = never (the truly DRY search of the raid policy); a number = its cost per cell (x12: a swim).
// Result extra: drops [{ i (waypoint index), fall }], maxDrop, clr { need, legs, open, minOpen } (clearance of the straight legs in cells).
// GEOPATH FAST (nav_atlas 2026-10-12): the same walk rules as geopath.js (L2J geodata, 16-unit cells, NSWE walls, 48 max step, no cut corners,
// same snap, same smoothing into wall-checked straight legs <= maxLeg) but ~20x faster for the OFFLINE atlas: every region is decoded once into
// typed arrays (no object per cell lookup), the A* keeps its scores in typed arrays over the search box (no Map per node) and skips stale heap
// entries. Used by docs/plan/tools/nav_atlas.js (worker). The live bots keep geopath.js / geopath_service.js.
//   require('./geopath_fast').findPath(a, b, opts) -> same result shape as geopath.findPath: { ok, points:[{x,y,z}], cells, expanded, ms, lengthUnits, reason }
'use strict';
const fs = require('fs'), path = require('path');
const geo = require('./geopath');                       // learnedAvoid (geo_blocked.json) + the raw region parser
const WATER = require('./water_zones');                // SWIMMING (2026-10-13): same swim rules as geopath.js (water_zones.js)
const GEO_DIR = process.env.GEO_DIR || path.join(__dirname, '..', '..', '..', 'Geodata');
const WORLD_X0 = -294912, WORLD_Y0 = -262144, MAX_STEP = 48;
const toGeoX = (x) => (Math.round(x) - WORLD_X0) >> 4, toGeoY = (y) => (Math.round(y) - WORLD_Y0) >> 4;
const toWorldX = (gx) => (gx << 4) + WORLD_X0 + 8, toWorldY = (gy) => (gy << 4) + WORLD_Y0 + 8;

// ---------- regions decoded into typed arrays: first[cell] -> index into H/N, cnt[cell] = layers (0 = none) ----------
const RC = new Map();
function decode(rx, ry) {
  const f = path.join(GEO_DIR, rx + '_' + ry + '.l2j');
  if (!fs.existsSync(f)) return null;
  const buf = fs.readFileSync(f);
  const first = new Int32Array(4194304), cnt = new Uint8Array(4194304);
  let cap = 4194304 + 65536, H = new Int16Array(cap), N = new Uint8Array(cap), used = 0;
  const grow = (need) => { if (used + need <= cap) return; cap = Math.max(cap * 2, used + need); const h2 = new Int16Array(cap); h2.set(H); H = h2; const n2 = new Uint8Array(cap); n2.set(N); N = n2; };
  let p = 0;
  for (let b = 0; b < 65536; b++) {
    const t = buf[p++], bx = b >> 8, by = b & 255;
    if (t === 0) {
      const h = buf.readInt16LE(p); p += 2; grow(1); H[used] = h; N[used] = 15;
      for (let c = 0; c < 64; c++) { const idx = (((bx << 3) + (c >> 3)) << 11) | ((by << 3) + (c & 7)); first[idx] = used; cnt[idx] = 1; }
      used++;
    } else if (t === 1) {
      grow(64);
      for (let c = 0; c < 64; c++) { const v = buf.readInt16LE(p); p += 2; const idx = (((bx << 3) + (c >> 3)) << 11) | ((by << 3) + (c & 7)); H[used] = (v & ~15) >> 1; N[used] = v & 15; first[idx] = used; cnt[idx] = 1; used++; }
    } else if (t === 2) {
      for (let c = 0; c < 64; c++) {
        const n = buf[p++]; grow(n); const idx = (((bx << 3) + (c >> 3)) << 11) | ((by << 3) + (c & 7)); first[idx] = used; cnt[idx] = n;
        for (let i = 0; i < n; i++) { const v = buf.readInt16LE(p); p += 2; H[used] = (v & ~15) >> 1; N[used] = v & 15; used++; }
      }
    } else throw new Error(`${rx}_${ry}: unknown block type ${t}`);
  }
  return { first, cnt, H: H.subarray(0, used), N: N.subarray(0, used) };
}
function reg(gx, gy) { const k = ((gx >> 11) + 11) * 64 + ((gy >> 11) + 10); let r = RC.get(k); if (r === undefined) { r = decode((gx >> 11) + 11, (gy >> 11) + 10); RC.set(k, r); } return r; }
function dropRegions() { RC.clear(); }
const cix = (gx, gy) => ((gx & 2047) << 11) | (gy & 2047);
/** layer index at (gx,gy) for height z: the closest at or below z + 64, else the closest at all (geopath.layerAt) */
function layerAt(gx, gy, z) {
  const r = reg(gx, gy); if (!r) return -1; const i = cix(gx, gy), n = r.cnt[i]; if (!n) return -1;
  let best = -1, bd = 1e9; for (let l = 0; l < n; l++) { const h = r.H[r.first[i] + l]; const d = h <= z + 64 ? z - h : 10000 + h - z; if (d < bd) { bd = d; best = l; } }
  return best;
}
function hAt(gx, gy, li) { const r = reg(gx, gy); return r.H[r.first[cix(gx, gy)] + li]; }
const BIT = (dx, dy) => dx === 1 ? 1 : dx === -1 ? 2 : dy === 1 ? 4 : 8;
function step(gx, gy, li, dx, dy) {
  const r = reg(gx, gy); if (!r) return -1; const i = cix(gx, gy); if (li >= r.cnt[i]) return -1;
  const a = r.first[i] + li; if (!(r.N[a] & BIT(dx, dy))) return -1;
  const ah = r.H[a], nx = gx + dx, ny = gy + dy, r2 = (nx >> 11) === (gx >> 11) && (ny >> 11) === (gy >> 11) ? r : reg(nx, ny); if (!r2) return -1;
  const j = cix(nx, ny), n = r2.cnt[j]; if (!n) return -1;
  let best = -1, bd = 1e9; const f = r2.first[j];
  for (let l = 0; l < n; l++) { const d = Math.abs(r2.H[f + l] - ah); if (d < bd) { bd = d; best = l; } }
  if (best < 0 || bd > MAX_STEP) return -1;
  if (r2.N[f + best] === 0) return -1;
  return best;
}
function diag(gx, gy, li, dx, dy) {
  const ax = step(gx, gy, li, dx, 0), ay = step(gx, gy, li, 0, dy); if (ax < 0 || ay < 0) return -1;
  const b1 = step(gx + dx, gy, ax, 0, dy), b2 = step(gx, gy + dy, ay, dx, 0); if (b1 < 0 || b2 < 0) return -1;
  return b1;
}
// --- RAID ROUTES 2026-10-13: drops + clearance ---
const SAFE_FALL = 333;                                   // L2J PcTemplate safe fall height (no damage below it)
/** a one-way drop off a ledge: straight move, NSWE open that way at (gx,gy,li), no floor within the 48 step in the next cell, the highest floor
 *  below (<= maxDrop under me, walkable) -> its layer, else -1 */
function dropTo(gx, gy, li, dx, dy, maxDrop) {
  if (dx && dy) return -1;
  const r = reg(gx, gy); if (!r) return -1; const i = cix(gx, gy); if (li >= r.cnt[i]) return -1;
  const a = r.first[i] + li; if (!(r.N[a] & BIT(dx, dy))) return -1;
  const h = r.H[a], nx = gx + dx, ny = gy + dy, r2 = (nx >> 11) === (gx >> 11) && (ny >> 11) === (gy >> 11) ? r : reg(nx, ny); if (!r2) return -1;
  const j = cix(nx, ny), n = r2.cnt[j]; if (!n) return -1; const f = r2.first[j];
  let best = -1, bh = -1e9;
  for (let l = 0; l < n; l++) { const hh = r2.H[f + l]; if (Math.abs(hh - h) <= MAX_STEP) return -1; if (hh < h - MAX_STEP && h - hh <= (maxDrop || 3000) && hh > bh && r2.N[f + l] !== 0) { bh = hh; best = l; } }
  return best;
}
const DIRS8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
/** CLEARANCE of node (gx,gy,li) in cells (0..R): how far a walker can go in each of 8 directions (walk rules), the minimum, capped at R
 *  (a diagonal step counts 1.414 cells). 0 = next to a wall / cliff edge / blocked NSWE. */
function clearanceOf(gx, gy, li, R) {
  let m = R * 16;
  for (let d = 0; d < 8; d++) {
    const dx = DIRS8[d][0], dy = DIRS8[d][1], diagonal = dx && dy, sl = diagonal ? 22.627 : 16, kmax = Math.ceil(m / sl);
    let x = gx, y = gy, l = li, k = 0;
    for (; k < kmax; k++) { const nl = diagonal ? diag(x, y, l, dx, dy) : step(x, y, l, dx, dy); if (nl < 0) break; x += dx; y += dy; l = nl; }
    const u = k * sl; if (u < m) { m = u; if (m < 16) return 0; }
  }
  return Math.min(R, Math.floor(m / 16));
}
// --- swimming (2026-10-13, same rules as geopath.js: water_zones.swimGraph) ---
const SWACC = { heights: (gx, gy) => { const r = reg(gx, gy); if (!r) return null; const i = cix(gx, gy), n = r.cnt[i]; if (!n) return null; const f = r.first[i], out = new Array(n); for (let l = 0; l < n; l++) out[l] = r.H[f + l]; return out; },
  nswe: (gx, gy, li) => { const r = reg(gx, gy); if (!r) return 0; const i = cix(gx, gy); return li < r.cnt[i] ? r.N[r.first[i] + li] : 0; }, toWorldX, toWorldY };
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
function swimClear(a, b, SW, blocked) { return SW.clear(a, b, blocked); }   // the rule lives in water_zones.js (slots)
function snap(x, y, z, r = 6, anyZ = false) {
  const gx = toGeoX(x), gy = toGeoY(y);
  for (let rr = 0; rr <= r; rr++) for (let dx = -rr; dx <= rr; dx++) for (let dy = -rr; dy <= rr; dy++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== rr) continue;
    const li = layerAt(gx + dx, gy + dy, z); if (li < 0) continue;
    const R = reg(gx + dx, gy + dy), k = R.first[cix(gx + dx, gy + dy)] + li;
    if (R.N[k] !== 0 && (anyZ || Math.abs(R.H[k] - z) < 400)) return { gx: gx + dx, gy: gy + dy, li };
  }
  return null;
}
// endLayer (2026-10-13): the walk must end on b's own floor (a leg from a tunnel floor to the water surface above it is no straight walk)
function clear(a, b, blocked, endLayer) {
  let [x, y, li] = a; const [x2, y2] = b;
  const dx = Math.abs(x2 - x), dy = Math.abs(y2 - y), sx = x < x2 ? 1 : -1, sy = y < y2 ? 1 : -1; let err = dx - dy;
  while (x !== x2 || y !== y2) {
    const e2 = 2 * err; let mx = 0, my = 0;
    if (e2 > -dy) { err -= dy; mx = sx; } if (e2 < dx) { err += dx; my = sy; }
    const nl = mx && my ? diag(x, y, li, mx, my) : step(x, y, li, mx, my); if (nl < 0) return false;
    x += mx; y += my; li = nl; if (blocked && blocked(x, y)) return false;
  }
  return !endLayer || b[2] === undefined || li === b[2];
}
/** clear() + every cell on the line keeps a clearance >= need (RAID ROUTES 2026-10-13: legs through the middle, not along the rock) */
function clearKeep(a, b, blocked, endLayer, need, clrF) {
  let [x, y, li] = a; const [x2, y2] = b;
  const dx = Math.abs(x2 - x), dy = Math.abs(y2 - y), sx = x < x2 ? 1 : -1, sy = y < y2 ? 1 : -1; let err = dx - dy;
  while (x !== x2 || y !== y2) {
    const e2 = 2 * err; let mx = 0, my = 0;
    if (e2 > -dy) { err -= dy; mx = sx; } if (e2 < dx) { err += dx; my = sy; }
    const nl = mx && my ? diag(x, y, li, mx, my) : step(x, y, li, mx, my); if (nl < 0) return false;
    x += mx; y += my; li = nl; if (blocked && blocked(x, y)) return false;
    if (need > 0 && clrF(x, y, li) < need) return false;
  }
  return !endLayer || b[2] === undefined || li === b[2];
}
// ck (RAID ROUTES 2026-10-13, optional): { clrF(gx,gy,li), need (cells), isDrop[k] (cells[k] -> cells[k+1] is a drop) }
function smooth(cells, maxLeg, blocked, SW, ck) {
  const out = [], maxC = Math.max(4, Math.floor(maxLeg / 16)), maxSwimC = Math.max(4, Math.floor(Math.min(maxLeg, WATER.SWIM.maxLeg) / 16)); let i = 0;
  const pc = ck && ck.clrF ? cells.map(c => ck.clrF(c[0], c[1], c[2])) : null;
  while (i < cells.length - 1) {
    if (ck && ck.isDrop && ck.isDrop[i]) {                                  // a drop: its own leg, the waypoint below carries the height
      const c = cells[i + 1], fall = hAt(cells[i][0], cells[i][1], cells[i][2]) - hAt(c[0], c[1], c[2]);
      out.push({ x: toWorldX(c[0]), y: toWorldY(c[1]), z: hAt(c[0], c[1], c[2]), drop: Math.round(fall) }); i = i + 1; continue;
    }
    const swim = SW && SW.swimming(cells[i][0], cells[i][1], cells[i][2]);     // a leg that starts in water is a swim (no geodata check, <= 650)
    let j = Math.min(cells.length - 1, i + (swim ? maxSwimC : maxC));
    if (ck && ck.isDrop) for (let q = i + 1; q < j; q++) if (ck.isDrop[q]) { j = q; break; }   // never across a drop
    const far = (q) => swim && Math.hypot(cells[q][0] - cells[i][0], cells[q][1] - cells[i][1]) * 16 > WATER.SWIM.maxLeg;
    const needOf = (q) => { if (!pc || swim) return 0; let m = ck.need; for (let k = i; k <= q && m > 0; k++) if (pc[k] < m) m = pc[k]; return m; };
    while (j > i + 1 && (far(j) || !(swim ? swimClear(cells[i], cells[j], SW, blocked) : (pc ? clearKeep(cells[i], cells[j], blocked, !!SW, needOf(j), ck.clrF) : clear(cells[i], cells[j], blocked, !!SW))))) j--;
    const c = cells[j], w = SW ? SW.slotOf(c[0], c[1], c[2]) : null;
    const o = w ? { x: toWorldX(c[0]), y: toWorldY(c[1]), z: w.z, swim: true } : { x: toWorldX(c[0]), y: toWorldY(c[1]), z: hAt(c[0], c[1], c[2]) };
    if (pc && !swim) o.need = needOf(j);                                    // the clearance this leg keeps (cells)
    out.push(o); i = j;
  }
  return out;
}
// ---------- binary heap on typed arrays ----------
function Heap() { let cap = 1 << 16, K = new Float64Array(cap), V = new Float64Array(cap), n = 0;
  return { get size() { return n; },
    push(k, v) { if (n === cap) { cap *= 2; const k2 = new Float64Array(cap); k2.set(K); K = k2; const v2 = new Float64Array(cap); v2.set(V); V = v2; }
      let i = n++; while (i > 0) { const p = (i - 1) >> 1; if (K[p] <= k) break; K[i] = K[p]; V[i] = V[p]; i = p; } K[i] = k; V[i] = v; },
    popKey() { return K[0]; },
    pop() { const top = V[0], lk = K[--n], lv = V[n]; if (n) { let i = 0; for (;;) { let c = 2 * i + 1; if (c >= n) break; if (c + 1 < n && K[c + 1] < K[c]) c++; if (K[c] >= lk) break; K[i] = K[c]; V[i] = V[c]; i = c; } K[i] = lk; V[i] = lv; } return top; } };
}
function findPath(a, b, opts = {}) {
  const t0 = Date.now();
  const avoid = (opts.avoid || []).concat(opts.noLearned ? [] : geo.learnedAvoid(a, b, opts.pad || 6000)).map(o => ({ gx: toGeoX(o.x), gy: toGeoY(o.y), r: Math.max(1, Math.round((o.r || 150) / 16)) }));
  const blocked = avoid.length ? (gx, gy) => avoid.some(o => Math.hypot(gx - o.gx, gy - o.gy) <= o.r) : null;
  const maxNodes = opts.maxNodes || 4e6, pad = opts.pad || 6000, maxMs = opts.maxMs || 20000, HW = opts.hWeight > 1 ? opts.hWeight : 1.001;
  const SW = opts.swim === false || opts.noSwim ? null : WATER.swimGraph(SWACC), swimCost = opts.swimCost > 0 ? opts.swimCost : WATER.SWIM.cost;
  // RAID ROUTES 2026-10-13: drops / clearance / danger (all off by default)
  const DROPS = !!opts.drops, maxDrop = opts.maxDrop || 3000, dropCost = opts.dropCost > 0 ? opts.dropCost : 40;
  const CR = opts.clear > 0 ? Math.min(8, Math.round(opts.clear)) : 0, clearW = opts.clearW >= 0 ? opts.clearW : 1.5, clearNeed = Math.min(CR, opts.clearNeed > 0 ? opts.clearNeed : 3);
  const s = snapSwim(SW, a, 6) || snap(a.x, a.y, a.z), g = snapSwim(SW, b, 10) || snap(b.x, b.y, b.z ?? a.z, 10) || snap(b.x, b.y, b.z ?? a.z, 10, true);
  if (!s) return { ok: false, reason: 'start is not on walkable geodata', ms: Date.now() - t0 };
  if (!g) return { ok: false, reason: 'goal is not on walkable geodata', ms: Date.now() - t0 };
  const WET = opts.wet === 'block' ? -1 : opts.wet > 0 ? opts.wet : 0, wetMemo = WET ? new Map() : null;
  const wetAt = (gx, gy, li) => { const k = (gx * 32768 + gy) * 64 + li; let v = wetMemo.get(k); if (v === undefined) { v = !!WATER.zoneAt(toWorldX(gx), toWorldY(gy), hAt(gx, gy, li)); wetMemo.set(k, v); } return v; };
  const bx1 = Math.min(s.gx, g.gx) - (pad >> 4), bx2 = Math.max(s.gx, g.gx) + (pad >> 4), by1 = Math.min(s.gy, g.gy) - (pad >> 4), by2 = Math.max(s.gy, g.gy) + (pad >> 4);
  const W = bx2 - bx1 + 1, Hh = by2 - by1 + 1, NC = W * Hh;
  // layer 0 in typed arrays, higher layers in a Map (few cells have several floors)
  const g0 = new Float32Array(NC).fill(Infinity), p0 = new Float64Array(NC).fill(-1), gL = new Map(), pL = new Map();
  const node = (gx, gy, li) => ((gy - by1) * W + (gx - bx1)) * 64 + li;
  const getG = (k) => { const c = Math.floor(k / 64), li = k - c * 64; return li === 0 ? g0[c] : (gL.has(k) ? gL.get(k) : Infinity); };
  const setG = (k, v, par) => { const c = Math.floor(k / 64), li = k - c * 64; if (li === 0) { g0[c] = v; p0[c] = par; } else { gL.set(k, v); pL.set(k, par); } };
  const getP = (k) => { const c = Math.floor(k / 64), li = k - c * 64; return li === 0 ? p0[c] : (pL.has(k) ? pL.get(k) : -1); };
  const h = (gx, gy) => { const dx = Math.abs(gx - g.gx), dy = Math.abs(gy - g.gy); return (dx + dy) + (Math.SQRT2 - 2) * Math.min(dx, dy); };
  // clearance memo (layer 0 typed, others in a Map) and the danger grid (4 cells = 64 units a square over the search box)
  const c0 = CR ? new Uint8Array(NC) : null, cL = CR ? new Map() : null;
  const clrF = CR ? (gx, gy, li) => { if (gx < bx1 || gx > bx2 || gy < by1 || gy > by2) return clearanceOf(gx, gy, li, CR); const c = (gy - by1) * W + (gx - bx1);
    if (li === 0) { let v = c0[c]; if (!v) { v = clearanceOf(gx, gy, 0, CR) + 1; c0[c] = v; } return v - 1; }
    const k = c * 64 + li; let v = cL.get(k); if (v === undefined) { v = clearanceOf(gx, gy, li, CR); cL.set(k, v); } return v; } : null;
  const DW = Math.ceil(W / 4), DH = Math.ceil(Hh / 4);
  let DG = null;
  if (Array.isArray(opts.danger) && opts.danger.length) {
    DG = new Float32Array(DW * DH);
    for (const o of opts.danger) {
      const cx = toGeoX(o.x) - bx1, cy = toGeoY(o.y) - by1, rr = Math.max(1, (o.r || 300) / 16), w = o.w > 0 ? o.w : 1;
      for (let qx = Math.max(0, Math.floor((cx - rr) / 4)); qx <= Math.min(DW - 1, Math.floor((cx + rr) / 4)); qx++) for (let qy = Math.max(0, Math.floor((cy - rr) / 4)); qy <= Math.min(DH - 1, Math.floor((cy + rr) / 4)); qy++) {
        if (Math.hypot(qx * 4 + 2 - cx, qy * 4 + 2 - cy) <= rr) { const q = qy * DW + qx; if (DG[q] < w) DG[q] = w; }
      }
    }
  }
  const extra = (nx, ny, nl, swimNode) => { let m = 1; if (CR && !swimNode) { const c = clrF(nx, ny, nl); if (c < CR) m += clearW * (CR - c) / CR; } if (DG) m += DG[((ny - by1) >> 2) * DW + ((nx - bx1) >> 2)]; return m; };
  const open = Heap(), sk = node(s.gx, s.gy, s.li);
  setG(sk, 0, -1); open.push(h(s.gx, s.gy) * HW, sk);
  let found = -1, expanded = 0;
  while (open.size) {
    const pk = open.popKey(), k = open.pop();
    const c = Math.floor(k / 64), li = k - c * 64, gy = Math.floor(c / W) + by1, gx = (c % W) + bx1;
    const gc = getG(k);
    if (pk > gc + h(gx, gy) * HW + 1e-2) continue;                       // stale entry (a cheaper way to this cell was found later)
    if (gx === g.gx && gy === g.gy && (b.z == null || li === g.li)) { found = k; break; }
    if (++expanded > maxNodes) return { ok: false, reason: `gave up after ${expanded} cells (too far or no way)`, ms: Date.now() - t0, expanded };
    if ((expanded & 65535) === 0 && Date.now() - t0 > maxMs) return { ok: false, reason: `gave up after ${maxMs} ms`, ms: Date.now() - t0, expanded };
    const swimHere = SW ? SW.swimming(gx, gy, li) : false;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      if (!dx && !dy) continue;
      const nx = gx + dx, ny = gy + dy;
      if (nx < bx1 || nx > bx2 || ny < by1 || ny > by2) continue;
      if (blocked && blocked(nx, ny)) continue;
      const base = dx && dy ? Math.SQRT2 : 1;
      if (swimHere) {
        for (const m of SW.swimMoves(gx, gy, li, dx, dy)) { if (m.nl > 63) continue; const nk = node(nx, ny, m.nl), ng = gc + base * (m.swim ? swimCost : (CR || DG ? extra(nx, ny, m.nl, false) : 1)); if (getG(nk) <= ng) continue; setG(nk, ng, k); open.push(ng + h(nx, ny) * HW, nk); }
        continue;
      }
      let nl = dx && dy ? diag(gx, gy, li, dx, dy) : step(gx, gy, li, dx, dy), add = 0;
      if (nl < 0 && SW) nl = SW.dropIn(gx, gy, li, dx, dy);
      if (nl < 0 && DROPS) { nl = dropTo(gx, gy, li, dx, dy, maxDrop); if (nl >= 0) { const fall = hAt(gx, gy, li) - hAt(nx, ny, nl); add = dropCost + (fall > SAFE_FALL ? 2 * (fall - SAFE_FALL) / 16 : 0); } }
      if (nl < 0 || nl > 63) continue;
      let wm = 1; if (WET && !(SW && SW.swimming(nx, ny, nl)) && wetAt(nx, ny, nl)) { if (WET < 0 && !(nx === g.gx && ny === g.gy)) continue; wm = WET > 0 ? WET : 1; }   // a wet floor: blocked (dry search) or a swim
      const nk = node(nx, ny, nl), ng = gc + base * wm * (CR || DG ? extra(nx, ny, nl, SW ? SW.swimming(nx, ny, nl) : false) : 1) + add;
      if (getG(nk) <= ng) continue;
      setG(nk, ng, k); open.push(ng + h(nx, ny) * HW, nk);
    }
  }
  if (found < 0) return { ok: false, reason: `no way through (searched ${expanded} cells)`, ms: Date.now() - t0, expanded };
  const cells = [];
  for (let k = found; k >= 0; k = getP(k)) { const c = Math.floor(k / 64), li = k - c * 64; cells.push([(c % W) + bx1, Math.floor(c / W) + by1, li]); }
  cells.reverse();
  // RAID ROUTES 2026-10-13: drop transitions (a walk move > 48 down that is no swim) + clearance for the smoothing
  let ck = null;
  if (DROPS || CR) {
    const isDrop = DROPS ? cells.map((c, k) => { if (k === cells.length - 1) return false; const n = cells[k + 1]; if (SW && (SW.swimming(c[0], c[1], c[2]) || SW.swimming(n[0], n[1], n[2]))) return false; return hAt(c[0], c[1], c[2]) - hAt(n[0], n[1], n[2]) > MAX_STEP; }) : null;
    ck = { clrF: CR ? clrF : null, need: clearNeed, isDrop };
  }
  const pts = smooth(cells, opts.maxLeg || 1000, blocked, SW, ck);
  const rx = {};
  if (ck) {
    const drops = []; pts.forEach((p, i) => { if (p.drop) drops.push({ i, fall: p.drop }); });
    if (DROPS) { rx.drops = drops; rx.maxDrop = drops.reduce((m, d) => Math.max(m, d.fall), 0); }
    if (CR) { const legs = pts.filter(p => p.need !== undefined); rx.clr = { need: clearNeed, legs: legs.length, open: legs.filter(p => p.need >= clearNeed).length, minAll: legs.length ? Math.min(...legs.map(p => p.need)) : null }; pts.forEach(p => { delete p.need; }); }
  }
  if (!SW) return Object.assign({ ok: true, points: pts, cells: cells.length, expanded, ms: Date.now() - t0, lengthUnits: Math.round(cellLen(cells)) }, rx);
  let len = 0, swim = 0, run = 0, maxRun = 0;                         // real length (a swim cell counts once), swim length, longest unbroken swim
  for (let i = 1; i < cells.length; i++) { const p = cells[i - 1], c = cells[i], d = (p[0] !== c[0] && p[1] !== c[1] ? Math.SQRT2 : 1) * 16; len += d;
    if (SW.swimming(p[0], p[1], p[2]) && SW.swimming(c[0], c[1], c[2])) { swim += d; run += d; if (run > maxRun) maxRun = run; } else run = 0; }
  return Object.assign({ ok: true, points: pts, cells: cells.length, expanded, ms: Date.now() - t0, lengthUnits: Math.round(len) },
    swim ? { swimUnits: Math.round(swim), maxSwimRun: Math.round(maxRun), costUnits: Math.round(getG(found) * 16) } : {}, rx);
}
/** the real length of a cell path (16 a straight step, 22.6 a diagonal one) — the A* cost is no length once clearance / danger weigh in */
function cellLen(cells) { let len = 0; for (let i = 1; i < cells.length; i++) len += (cells[i - 1][0] !== cells[i][0] && cells[i - 1][1] !== cells[i][1] ? Math.SQRT2 : 1) * 16; return len; }
/** RAID ROUTES 2026-10-13 (verification / tests): the clearance in units at a world point (snapped), and along a straight leg (min over its cells) */
function clearanceAt(x, y, z, R) { const s = snap(x, y, z, 2); return s ? clearanceOf(s.gx, s.gy, s.li, R || 4) * 16 : -1; }
function legClearance(a, b, R) {
  const s = snap(a.x, a.y, a.z, 2), e = snap(b.x, b.y, b.z, 2); if (!s || !e) return -1;
  let x = s.gx, y = s.gy, li = s.li, m = clearanceOf(x, y, li, R || 4); const x2 = e.gx, y2 = e.gy;
  const dx = Math.abs(x2 - x), dy = Math.abs(y2 - y), sx = x < x2 ? 1 : -1, sy = y < y2 ? 1 : -1; let err = dx - dy;
  while (x !== x2 || y !== y2) { const e2 = 2 * err; let mx = 0, my = 0; if (e2 > -dy) { err -= dy; mx = sx; } if (e2 < dx) { err += dx; my = sy; }
    const nl = mx && my ? diag(x, y, li, mx, my) : step(x, y, li, mx, my); if (nl < 0) return -1; x += mx; y += my; li = nl; const c = clearanceOf(x, y, li, R || 4); if (c < m) m = c; }
  return m * 16;
}
/**
 * FLOOD + JOIN (RAID ROUTES 2026-10-13, the nav_atlas_longlegs idea for every hard leg): when the A* gives up (node / time cap: long winding
 * ways, the Garden of Eva descent with its ledges), flood the geodata from a (BFS over the same moves: walk, swim when allowed, drops when
 * opts.drops) until b is reached, take a waypoint every opts.joinCells (150) cells along the found way (and both ends of every drop), and join
 * them with short A* searches with the same opts (clearance / danger / swim cost); a join that fails keeps the flood cells (smoothed).
 * opts.floodCap (5,000,000 cells), opts.floodPad (box around a and b, 24000). -> findPath's result shape + flood: { cells, joins, rawJoins }
 */
function findPathFlood(a, b, opts = {}) {
  const t0 = Date.now(), SW = opts.swim === false || opts.noSwim ? null : WATER.swimGraph(SWACC), drops = !!opts.drops;
  const s = snapSwim(SW, a, 6) || snap(a.x, a.y, a.z), g = snapSwim(SW, b, 10) || snap(b.x, b.y, b.z ?? a.z, 10) || snap(b.x, b.y, b.z ?? a.z, 10, true);
  if (!s) return { ok: false, reason: 'start is not on walkable geodata', ms: Date.now() - t0 };
  if (!g) return { ok: false, reason: 'goal is not on walkable geodata', ms: Date.now() - t0 };
  const pad = (opts.floodPad || 24000) >> 4, bx1 = Math.min(s.gx, g.gx) - pad, bx2 = Math.max(s.gx, g.gx) + pad, by1 = Math.min(s.gy, g.gy) - pad, by2 = Math.max(s.gy, g.gy) + pad;
  // BIDIRECTIONAL (2026-10-13: the open sea around the Garden of Eva floods millions of cells from the landing side): a forward flood from a
  // and a backward flood from b (the cells that can walk INTO the visited ones: same moves reversed), the smaller frontier grows first; they
  // stop where they meet. Either side running empty = a definite "no way" (a closed pocket / a dry search that needs the water).
  const cap = opts.floodCap || 5000000, KEY = (gx, gy, li) => (gx * 32768 + gy) * 64 + li;
  const DEC = (k) => { const li = k % 64, c = (k - li) / 64, gy = c % 32768; return [(c - gy) / 32768, gy, li]; };
  const inBox = (x, y) => x >= bx1 && x <= bx2 && y >= by1 && y <= by2;
  const wetBlock = opts.wet === 'block', wetMemo = wetBlock ? new Map() : null;
  const wetAt = (gx, gy, li) => { const k = (gx * 32768 + gy) * 64 + li; let v = wetMemo.get(k); if (v === undefined) { v = !!WATER.zoneAt(toWorldX(gx), toWorldY(gy), hAt(gx, gy, li)); wetMemo.set(k, v); } return v; };
  const AV = (opts.avoid || []).map(o => ({ gx: toGeoX(o.x), gy: toGeoY(o.y), r: Math.max(1, Math.round((o.r || 150) / 16)) }));   // the avoid circles (closed doors) count for the flood too
  const okCell = (x, y, l) => (!AV.length || !AV.some(o => Math.hypot(x - o.gx, y - o.gy) <= o.r)) && (!wetBlock || (x === g.gx && y === g.gy) || !wetAt(x, y, l));
  const parF = new Map(), parR = new Map(); let qF = [KEY(s.gx, s.gy, s.li)], qR = [];
  parF.set(qF[0], -1);
  if (b.z == null) { const hs = SWACC.heights(g.gx, g.gy) || []; for (let l = 0; l < hs.length && l < 64; l++) { const k = KEY(g.gx, g.gy, l); parR.set(k, -1); qR.push(k); } }
  else { const k = KEY(g.gx, g.gy, g.li); parR.set(k, -1); qR.push(k); }
  let meet = parR.has(qF[0]) ? qF[0] : -1, rounds = 0;
  while (meet < 0) {
    if (!qF.length || !qR.length) return { ok: false, reason: `no way through (flooded ${parF.size + parR.size} cells, the ${!qF.length ? 'start' : 'goal'} side ran out)`, ms: Date.now() - t0, expanded: parF.size + parR.size };
    if (parF.size + parR.size > cap) return { ok: false, reason: `flood gave up after ${parF.size + parR.size} cells`, ms: Date.now() - t0 };
    if ((++rounds & 15) === 0 && Date.now() - t0 > (opts.floodMs || 180000)) return { ok: false, reason: `flood gave up after ${opts.floodMs || 180000} ms`, ms: Date.now() - t0 };
    if (qF.length <= qR.length) {                                     // one BFS layer forward
      const nq = [];
      for (const k of qF) { const [gx, gy, li] = DEC(k);
        for (let d = 0; d < 4 && meet < 0; d++) { const dx = DIRS8[d][0], dy = DIRS8[d][1], nx = gx + dx, ny = gy + dy; if (!inBox(nx, ny)) continue;
          for (const nl of fwd(SW, gx, gy, li, dx, dy, drops)) { if (nl > 63) continue; const nk = KEY(nx, ny, nl); if (parF.has(nk) || !okCell(nx, ny, nl)) continue; parF.set(nk, k); nq.push(nk); if (parR.has(nk)) { meet = nk; break; } } }
        if (meet >= 0) break; }
      qF = nq;
    } else {                                                          // one BFS layer backward: u -> v with v already reached from the goal side
      const nq = [];
      for (const k of qR) { const [vx, vy, vl] = DEC(k);
        for (let d = 0; d < 4 && meet < 0; d++) { const dx = DIRS8[d][0], dy = DIRS8[d][1], ux = vx - dx, uy = vy - dy; if (!inBox(ux, uy)) continue;
          const hs = SWACC.heights(ux, uy); if (!hs) continue;
          for (let ui = 0; ui < hs.length && ui < 64; ui++) { const uk = KEY(ux, uy, ui); if (parR.has(uk) || !okCell(ux, uy, ui)) continue; if (!fwd(SW, ux, uy, ui, dx, dy, drops).includes(vl)) continue; parR.set(uk, k); nq.push(uk); if (parF.has(uk)) { meet = uk; break; } } }
        if (meet >= 0) break; }
      qR = nq;
    }
  }
  const floodCells = parF.size + parR.size; qF = qR = null;
  const cells = []; for (let k = meet; k >= 0; k = parF.get(k)) cells.push(DEC(k));
  cells.reverse(); for (let k = parR.get(meet); k !== undefined && k >= 0; k = parR.get(k)) cells.push(DEC(k));
  parF.clear(); parR.clear();

  // waypoints: every joinCells, and both ends of every drop (a drop is its own leg)
  const isDrop = cells.map((c, k) => { if (k === cells.length - 1) return false; const n = cells[k + 1]; if (SW && (SW.swimming(c[0], c[1], c[2]) || SW.swimming(n[0], n[1], n[2]))) return false; return hAt(c[0], c[1], c[2]) - hAt(n[0], n[1], n[2]) > MAX_STEP; });
  const J = opts.joinCells || 150, wp = [0];
  for (let k = 1; k < cells.length; k++) { if (isDrop[k - 1]) { if (wp[wp.length - 1] !== k - 1) wp.push(k - 1); wp.push(k); continue; } if (k - wp[wp.length - 1] >= J || k === cells.length - 1) wp.push(k); }
  const wpt = (k) => { const c = cells[k], w = SW ? SW.slotOf(c[0], c[1], c[2]) : null; return { x: toWorldX(c[0]), y: toWorldY(c[1]), z: w ? w.z : hAt(c[0], c[1], c[2]) }; };
  const out = [wpt(0)]; let joins = 0, raw = 0; const clr = opts.clear > 0 ? { need: Math.min(Math.round(opts.clear), opts.clearNeed > 0 ? opts.clearNeed : 3), legs: 0, open: 0, minAll: null } : null;
  const sub = Object.assign({}, opts, { maxNodes: opts.joinNodes || 600000, maxMs: opts.joinMs || 20000, pad: 1200 });
  for (let w = 1; w < wp.length; w++) {
    const k0 = wp[w - 1], k1 = wp[w];
    if (k1 === k0 + 1 && isDrop[k0]) { const p = wpt(k1); p.drop = Math.round(hAt(cells[k0][0], cells[k0][1], cells[k0][2]) - p.z); out.push(p); continue; }
    const A = out[out.length - 1], B = wpt(k1);
    const r = findPath(A, B, sub); joins++;
    if (r.ok && r.points.length) { r.points.forEach(p => out.push(p)); if (clr && r.clr) { clr.legs += r.clr.legs; clr.open += r.clr.open; if (r.clr.minAll != null) clr.minAll = clr.minAll == null ? r.clr.minAll : Math.min(clr.minAll, r.clr.minAll); } continue; }
    raw++; smooth(cells.slice(k0, k1 + 1), opts.maxLeg || 1000, null, SW, null).forEach(p => out.push(p));
  }
  // real length + swim stats from the points (a leg between two swim points is swum)
  let len = 0, swim = 0, run = 0, maxRun = 0;
  for (let i = 1; i < out.length; i++) { const d = Math.hypot(out[i].x - out[i - 1].x, out[i].y - out[i - 1].y); len += d; if (out[i].swim && out[i - 1].swim) { swim += d; run += d; if (run > maxRun) maxRun = run; } else run = 0; }
  const dr = []; out.forEach((p, i) => { if (p.drop) dr.push({ i, fall: p.drop }); });
  return Object.assign({ ok: true, points: out, cells: cells.length, expanded: floodCells, ms: Date.now() - t0, lengthUnits: Math.round(len), flood: { cells: floodCells, joins, rawJoins: raw } }, clr ? { clr } : {},
    swim ? { swimUnits: Math.round(swim), maxSwimRun: Math.round(maxRun) } : {}, drops ? { drops: dr, maxDrop: dr.reduce((m, d) => Math.max(m, d.fall), 0) } : {});
}
/** cells reachable from (x,y,z) by the walk rules, up to cap (BFS): a small number = a closed pocket (an island, a closed room, a platform) */
/** the straight (non-diagonal) moves out of node (gx,gy,li) one cell in (dx,dy): walk step, swim moves, drop into water -> [next layer] */
function fwd(SW, gx, gy, li, dx, dy, drops) {
  if (SW && SW.swimming(gx, gy, li)) return SW.swimMoves(gx, gy, li, dx, dy).map(m => m.nl);
  let nl = step(gx, gy, li, dx, dy); if (nl < 0 && SW) nl = SW.dropIn(gx, gy, li, dx, dy);
  if (nl < 0 && drops) nl = dropTo(gx, gy, li, dx, dy, 3000);       // RAID ROUTES 2026-10-13: opts.drops
  return nl < 0 ? [] : [nl];
}
/** cells reachable from (x,y,z) by the walk rules, up to cap (BFS): a small number = a closed pocket (an island, a closed room, a platform) */
function pocket(x, y, z, cap, opts = {}) {
  const SW = opts.swim === false || opts.noSwim ? null : WATER.swimGraph(SWACC);   // swim edges too: a beach next to the sea is no closed pocket
  const s = snapSwim(SW, { x, y, z }, 10) || snap(x, y, z, 10) || snap(x, y, z, 10, true); if (!s) return 0;
  const seen = new Set(), q = [[s.gx, s.gy, s.li]]; seen.add((s.gx * 32768 + s.gy) * 64 + s.li);
  for (let qi = 0; qi < q.length; qi++) {
    if (seen.size >= cap) return cap;
    const [gx, gy, li] = q[qi];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (const nl of fwd(SW, gx, gy, li, dx, dy, opts.drops)) { const k = ((gx + dx) * 32768 + gy + dy) * 64 + nl; if (seen.has(k)) continue; seen.add(k); q.push([gx + dx, gy + dy, nl]); }
  }
  return seen.size;
}
/**
 * POCKET IN (2026-10-13): the cells that can walk INTO (x,y,z), up to cap (reverse BFS over the same moves). pocket() only says whether a
 * goal can be LEFT: a pit with one-way edges in (a drop down from the rim, a beach you swim onto) looked closed although it can be entered.
 * A small number = nothing outside leads in (the atlas skips the search: "the goal is a closed pocket").
 */
function pocketIn(x, y, z, cap, opts = {}) {
  const SW = opts.swim === false || opts.noSwim ? null : WATER.swimGraph(SWACC);
  const s = snapSwim(SW, { x, y, z }, 10) || snap(x, y, z, 10) || snap(x, y, z, 10, true); if (!s) return 0;
  const seen = new Set(), q = [[s.gx, s.gy, s.li]]; seen.add((s.gx * 32768 + s.gy) * 64 + s.li);
  for (let qi = 0; qi < q.length; qi++) {
    if (seen.size >= cap) return cap;
    const [vx, vy, vl] = q[qi];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ux = vx - dx, uy = vy - dy, hs = SWACC.heights(ux, uy); if (!hs) continue;
      for (let ui = 0; ui < hs.length && ui < 64; ui++) {
        const k = (ux * 32768 + uy) * 64 + ui; if (seen.has(k)) continue;
        if (fwd(SW, ux, uy, ui, dx, dy, opts.drops).includes(vl)) { seen.add(k); q.push([ux, uy, ui]); }
      }
    }
  }
  return seen.size;
}
module.exports = { findPath, findPathFlood, pocket, pocketIn, dropRegions, clearanceAt, legClearance, SAFE_FALL, regionsLoaded: () => RC.size, internals: { reg, cix, layerAt, hAt, step, diag, dropTo, clearanceOf, snap, toGeoX, toGeoY, toWorldX, toWorldY, SWACC } };   // internals: nav_atlas_longlegs.js (2026-10-12)
