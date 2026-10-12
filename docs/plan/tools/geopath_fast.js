// GEOPATH FAST (nav_atlas 2026-10-12): the same walk rules as geopath.js (L2J geodata, 16-unit cells, NSWE walls, 48 max step, no cut corners,
// same snap, same smoothing into wall-checked straight legs <= maxLeg) but ~20x faster for the OFFLINE atlas: every region is decoded once into
// typed arrays (no object per cell lookup), the A* keeps its scores in typed arrays over the search box (no Map per node) and skips stale heap
// entries. Used by docs/plan/tools/nav_atlas.js (worker). The live bots keep geopath.js / geopath_service.js.
//   require('./geopath_fast').findPath(a, b, opts) -> same result shape as geopath.findPath: { ok, points:[{x,y,z}], cells, expanded, ms, lengthUnits, reason }
'use strict';
const fs = require('fs'), path = require('path');
const geo = require('./geopath');                       // learnedAvoid (geo_blocked.json) + the raw region parser
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
function clear(a, b, blocked) {
  let [x, y, li] = a; const [x2, y2] = b;
  const dx = Math.abs(x2 - x), dy = Math.abs(y2 - y), sx = x < x2 ? 1 : -1, sy = y < y2 ? 1 : -1; let err = dx - dy;
  while (x !== x2 || y !== y2) {
    const e2 = 2 * err; let mx = 0, my = 0;
    if (e2 > -dy) { err -= dy; mx = sx; } if (e2 < dx) { err += dx; my = sy; }
    const nl = mx && my ? diag(x, y, li, mx, my) : step(x, y, li, mx, my); if (nl < 0) return false;
    x += mx; y += my; li = nl; if (blocked && blocked(x, y)) return false;
  }
  return true;
}
function smooth(cells, maxLeg, blocked) {
  const out = [], maxC = Math.max(4, Math.floor(maxLeg / 16)); let i = 0;
  while (i < cells.length - 1) {
    let j = Math.min(cells.length - 1, i + maxC);
    while (j > i + 1 && !clear(cells[i], cells[j], blocked)) j--;
    const c = cells[j]; out.push({ x: toWorldX(c[0]), y: toWorldY(c[1]), z: hAt(c[0], c[1], c[2]) }); i = j;
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
  const s = snap(a.x, a.y, a.z), g = snap(b.x, b.y, b.z ?? a.z, 10) || snap(b.x, b.y, b.z ?? a.z, 10, true);
  if (!s) return { ok: false, reason: 'start is not on walkable geodata', ms: Date.now() - t0 };
  if (!g) return { ok: false, reason: 'goal is not on walkable geodata', ms: Date.now() - t0 };
  const bx1 = Math.min(s.gx, g.gx) - (pad >> 4), bx2 = Math.max(s.gx, g.gx) + (pad >> 4), by1 = Math.min(s.gy, g.gy) - (pad >> 4), by2 = Math.max(s.gy, g.gy) + (pad >> 4);
  const W = bx2 - bx1 + 1, Hh = by2 - by1 + 1, NC = W * Hh;
  // layer 0 in typed arrays, higher layers in a Map (few cells have several floors)
  const g0 = new Float32Array(NC).fill(Infinity), p0 = new Float64Array(NC).fill(-1), gL = new Map(), pL = new Map();
  const node = (gx, gy, li) => ((gy - by1) * W + (gx - bx1)) * 64 + li;
  const getG = (k) => { const c = Math.floor(k / 64), li = k - c * 64; return li === 0 ? g0[c] : (gL.has(k) ? gL.get(k) : Infinity); };
  const setG = (k, v, par) => { const c = Math.floor(k / 64), li = k - c * 64; if (li === 0) { g0[c] = v; p0[c] = par; } else { gL.set(k, v); pL.set(k, par); } };
  const getP = (k) => { const c = Math.floor(k / 64), li = k - c * 64; return li === 0 ? p0[c] : (pL.has(k) ? pL.get(k) : -1); };
  const h = (gx, gy) => { const dx = Math.abs(gx - g.gx), dy = Math.abs(gy - g.gy); return (dx + dy) + (Math.SQRT2 - 2) * Math.min(dx, dy); };
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
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      if (!dx && !dy) continue;
      const nx = gx + dx, ny = gy + dy;
      if (nx < bx1 || nx > bx2 || ny < by1 || ny > by2) continue;
      if (blocked && blocked(nx, ny)) continue;
      const nl = dx && dy ? diag(gx, gy, li, dx, dy) : step(gx, gy, li, dx, dy);
      if (nl < 0 || nl > 63) continue;
      const nk = node(nx, ny, nl), ng = gc + (dx && dy ? Math.SQRT2 : 1);
      if (getG(nk) <= ng) continue;
      setG(nk, ng, k); open.push(ng + h(nx, ny) * HW, nk);
    }
  }
  if (found < 0) return { ok: false, reason: `no way through (searched ${expanded} cells)`, ms: Date.now() - t0, expanded };
  const cells = [];
  for (let k = found; k >= 0; k = getP(k)) { const c = Math.floor(k / 64), li = k - c * 64; cells.push([(c % W) + bx1, Math.floor(c / W) + by1, li]); }
  cells.reverse();
  const pts = smooth(cells, opts.maxLeg || 1000, blocked);
  return { ok: true, points: pts, cells: cells.length, expanded, ms: Date.now() - t0, lengthUnits: Math.round(getG(found) * 16) };
}
/** cells reachable from (x,y,z) by the walk rules, up to cap (BFS): a small number = a closed pocket (an island, a closed room, a platform) */
function pocket(x, y, z, cap) {
  const s = snap(x, y, z, 10) || snap(x, y, z, 10, true); if (!s) return 0;
  const seen = new Set(), q = [[s.gx, s.gy, s.li]]; seen.add((s.gx * 32768 + s.gy) * 64 + s.li);
  for (let qi = 0; qi < q.length; qi++) {
    if (seen.size >= cap) return cap;
    const [gx, gy, li] = q[qi];
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { if (!dx && !dy || (dx && dy)) continue; const nl = step(gx, gy, li, dx, dy); if (nl < 0) continue; const k = ((gx + dx) * 32768 + gy + dy) * 64 + nl; if (seen.has(k)) continue; seen.add(k); q.push([gx + dx, gy + dy, nl]); }
  }
  return seen.size;
}
module.exports = { findPath, pocket, dropRegions, regionsLoaded: () => RC.size, internals: { reg, cix, layerAt, hAt, step, toGeoX, toGeoY, toWorldX, toWorldY } };   // internals: nav_atlas_longlegs.js (2026-10-12)
