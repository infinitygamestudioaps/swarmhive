// ROOM MERGE (owner 2026-10-22: "I also need to be able to combine 2 rooms together OR change the rooms. I see some rooms that have been cut in 2 but
// should be the same."). Pure logic, used by Dashboard/polyedit_api.js (POST /api/polyedit?action=merge) and docs/plan/tools/test_room_merge.js.
//   mergeRooms(data, ids, opts) on the parsed Scripts/data/dungeon_rooms.json (changed in place):
//     - 2..8 rooms of ONE dungeon floor; the outline = the union of their polygons, traced on the 16-unit geodata grid (room_polys.js outline +
//       simplifyLoop, the generator's own tracer); rooms must touch or almost touch (a gap up to 48 units is closed), else a plain refusal;
//     - the FIRST room keeps its id (name editable), levels / party levels / z band / monsters / spawn count merged, manual: true + edited.orig
//       (the generators keep it: docs/plan/tools/manual_guard.js), polyInfo.merged = the ids;
//     - the others stay in the file switched off with mergedInto = the kept id (+ manual, so a generator run never brings them back as rooms);
//       anything that still names an old id finds the combined room (swarm.js roomById follows mergedInto; party_spots / party_plans are remapped
//       by remapIds); rooms that were merged into an absorbed room earlier now point at the kept one.
//   remapIds(obj, alias) -> number of ids changed: every roomId / roomIds in any object (party_spots.json, party_plans.json steps).
'use strict';
const path = require('path');
const RP = require(path.join(__dirname, '..', 'docs', 'plan', 'tools', 'room_polys.js'));
const WX0 = -294912, WY0 = -262144, CELL = 16;
const GAP_CELLS = 3;                                    // 48 units: rooms cut in two by the generator usually leave 0-2 cells between them
const r0 = Math.round;

function polyOf(r) {
  if (Array.isArray(r.poly) && r.poly.length >= 3) return r.poly.map(p => Array.isArray(p) ? [+p[0], +p[1]] : [+p.x, +p.y]);
  if (Array.isArray(r.center) && r.radius > 0) { const out = []; for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2; out.push([r.center[0] + Math.cos(a) * r.radius, r.center[1] + Math.sin(a) * r.radius]); } return out; }
  return null;
}
function inPoly(x, y, P) { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b = P[j]; if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }

/** the rooms' cells on one grid -> { F, masks: [Uint8Array per room], union } */
function raster(polys) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  polys.forEach(P => P.forEach(([x, y]) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }));
  const pad = GAP_CELLS + 3, gx0 = Math.floor((x0 - WX0) / CELL) - pad, gy0 = Math.floor((y0 - WY0) / CELL) - pad;
  const w = Math.ceil((x1 - WX0) / CELL) + pad - gx0 + 1, h = Math.ceil((y1 - WY0) / CELL) + pad - gy0 + 1;
  if (w * h > 6e6) throw new Error('these rooms are too far apart to combine');
  const F = { w, h, gx0, gy0 }, masks = polys.map(() => new Uint8Array(w * h)), union = new Uint8Array(w * h);
  polys.forEach((P, k) => {
    let bx0 = 1e9, by0 = 1e9, bx1 = -1e9, by1 = -1e9; P.forEach(([x, y]) => { bx0 = Math.min(bx0, x); by0 = Math.min(by0, y); bx1 = Math.max(bx1, x); by1 = Math.max(by1, y); });
    const cx0 = Math.max(0, Math.floor((bx0 - WX0) / CELL) - gx0), cx1 = Math.min(w - 1, Math.ceil((bx1 - WX0) / CELL) - gx0), cy0 = Math.max(0, Math.floor((by0 - WY0) / CELL) - gy0), cy1 = Math.min(h - 1, Math.ceil((by1 - WY0) / CELL) - gy0);
    for (let y = cy0; y <= cy1; y++) for (let x = cx0; x <= cx1; x++) { const wx = (gx0 + x) * CELL + WX0 + CELL / 2, wy = (gy0 + y) * CELL + WY0 + CELL / 2; if (inPoly(wx, wy, P)) { masks[k][y * w + x] = 1; union[y * w + x] = 1; } }
  });
  return { F, masks, union };
}
function grow(M, F, n, keep) {                          // n cells, 8-neighbourhood; keep=true: erosion (a cell stays only when all neighbours are set)
  let cur = M;
  for (let s = 0; s < n; s++) {
    const nx = new Uint8Array(cur.length);
    for (let y = 0; y < F.h; y++) for (let x = 0; x < F.w; x++) {
      const i = y * F.w + x;
      if (keep) { let all = cur[i] === 1; for (let dy = -1; dy <= 1 && all; dy++) for (let dx = -1; dx <= 1 && all; dx++) { const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= F.w || Y >= F.h || !cur[Y * F.w + X]) all = false; } nx[i] = all ? 1 : 0; }
      else { let any = cur[i] === 1; for (let dy = -1; dy <= 1 && !any; dy++) for (let dx = -1; dx <= 1 && !any; dx++) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < F.w && Y < F.h && cur[Y * F.w + X]) any = true; } nx[i] = any ? 1 : 0; }
    }
    cur = nx;
  }
  return cur;
}
function comps(M, F) {                                   // 4-connected components -> Int32Array labels (0 = empty), count
  const lab = new Int32Array(M.length); let n = 0; const q = new Int32Array(M.length);
  for (let i = 0; i < M.length; i++) {
    if (!M[i] || lab[i]) continue; n++; let qh = 0, qt = 0; q[qt++] = i; lab[i] = n;
    while (qh < qt) { const j = q[qh++], x = j % F.w, y = (j / F.w) | 0;
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => { const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= F.w || Y >= F.h) return; const k = Y * F.w + X; if (M[k] && !lab[k]) { lab[k] = n; q[qt++] = k; } }); }
  }
  return { lab, n };
}
/** the shortest gap (world units) between two room masks, roughly (cell centres), for the refusal sentence */
function gapOf(A, B, F) {
  const a = [], b = [];
  for (let i = 0; i < A.length; i++) { if (A[i]) a.push(i); if (B[i]) b.push(i); }
  const step = Math.max(1, Math.floor(Math.max(a.length, b.length) / 1500));
  let best = 1e12;
  for (let p = 0; p < a.length; p += step) for (let q = 0; q < b.length; q += step) { const ax = a[p] % F.w, ay = (a[p] / F.w) | 0, bx = b[q] % F.w, by = (b[q] / F.w) | 0; const d = Math.hypot(ax - bx, ay - by); if (d < best) best = d; }
  return Math.max(0, r0((best - 1) * CELL));
}
/** the union outline of the rooms' polygons: { poly: [[x,y]..], area } or throws with a plain sentence */
function unionOutline(polys, names) {
  const { F, masks, union } = raster(polys);
  // connectivity: closed up to GAP_CELLS, every room must end up in ONE piece
  const dil = grow(union, F, GAP_CELLS, false), C = comps(dil, F);
  const labOf = (M) => { for (let i = 0; i < M.length; i++) if (M[i]) return C.lab[i]; return 0; };
  const L0 = labOf(masks[0]);
  for (let k = 1; k < masks.length; k++) if (labOf(masks[k]) !== L0) {
    const g = gapOf(masks[0], masks[k], F);
    throw new Error(`${names[0]} and ${names[k]} do not touch (about ${g} units apart). Only rooms that share an edge or almost do (up to ${GAP_CELLS * CELL} units apart) can be combined — change a room's shape first, or choose rooms that are next to each other.`);
  }
  // closing (grow, then shrink): fills the seam between the rooms without making them bigger elsewhere
  let closed = grow(grow(union, F, GAP_CELLS, false), F, GAP_CELLS, true);
  for (let i = 0; i < closed.length; i++) if (union[i]) closed[i] = 1;
  const C2 = comps(closed, F); let big = 0, cnt = {}; for (let i = 0; i < closed.length; i++) if (C2.lab[i]) { cnt[C2.lab[i]] = (cnt[C2.lab[i]] || 0) + 1; if (!big || cnt[C2.lab[i]] > cnt[big]) big = C2.lab[i]; }
  const cells = new Set(); for (let i = 0; i < closed.length; i++) if (C2.lab[i] === big) cells.add(i);
  const raw = RP.outline({ w: F.w, gx0: F.gx0, gy0: F.gy0 }, cells);
  const s = RP.simplifyLoop(raw, 80);
  const poly = (s && s.pts && s.pts.length >= 3 ? s.pts : raw).map(p => [r0(p[0]), r0(p[1])]);
  return { poly, area: RP.polyArea(poly), cells: cells.size };
}
function find(data, id) {
  for (const d of data || []) for (let fi = 0; fi < (d.floors || []).length; fi++) { const F = d.floors[fi], r = (F.rooms || []).find(x => x.id === id); if (r) return { d, F, fi, r }; }
  return null;
}
const USER = ['name', 'poly', 'center', 'radius', 'zRange', 'area', 'polyInfo', 'levelRange', 'suitsPartyLevel', 'notes', 'enabled', 'monsters', 'spawnCount'];
const pickOrig = (r) => { const o = {}; USER.forEach(k => { if (r[k] !== undefined) o[k] = JSON.parse(JSON.stringify(r[k])); }); return o; };
function mergeMonsters(list) {
  const objs = list.some(m => m && typeof m === 'object'), by = new Map();
  list.forEach(m => { if (!m) return; const n = typeof m === 'string' ? m : m.name; if (!n) return; const o = by.get(n); if (!o) by.set(n, typeof m === 'string' ? (objs ? { name: m, count: 1 } : m) : JSON.parse(JSON.stringify(m))); else if (typeof o === 'object' && typeof m === 'object') { o.count = (o.count || 1) + (m.count || 1); if (m.level !== undefined) o.level = Math.max(o.level || 0, m.level); } });
  return [...by.values()];
}
/** combine rooms (see the header). -> { ok, id, room, absorbed: [ids], alias: { old: new }, dungeon, floor, key } | throws Error(plain sentence) */
function mergeRooms(data, ids, opts) {
  const o = opts || {}, uniq = [...new Set((ids || []).map(String))];
  if (uniq.length < 2) throw new Error('choose at least two rooms to combine');
  if (uniq.length > 8) throw new Error('at most 8 rooms in one go');
  const hits = uniq.map(id => { const h = find(data, id); if (!h) throw new Error('unknown room: ' + id); return h; });
  const h0 = hits[0];
  if (hits.some(h => h.d !== h0.d || h.F !== h0.F)) throw new Error('all rooms must be on the same floor of the same dungeon');
  if (hits.some(h => h.r.mergedInto)) throw new Error('one of these rooms was already combined into another room: ' + hits.filter(h => h.r.mergedInto).map(h => h.r.id + ' -> ' + h.r.mergedInto).join(', '));
  const polys = hits.map(h => polyOf(h.r));
  if (polys.some(p => !p)) throw new Error('a room without an outline or centre cannot be combined');
  const U = unionOutline(polys, hits.map(h => h.r.name || h.r.id));
  const keep = h0.r, at = o.at || new Date().toISOString(), all = hits.map(h => h.r);
  const lv = (k) => { const v = all.map(r => r[k]).filter(a => Array.isArray(a) && a.length >= 2); return v.length ? [Math.min(...v.map(a => +a[0])), Math.max(...v.map(a => +a[1]))] : undefined; };
  if (!keep.edited || !keep.edited.orig) keep.edited = Object.assign({}, keep.edited || {}, { orig: pickOrig(keep) });
  const cx = U.poly.reduce((t, p) => t + p[0], 0) / U.poly.length, cy = U.poly.reduce((t, p) => t + p[1], 0) / U.poly.length;
  const zs = all.map(r => Array.isArray(r.center) ? +r.center[2] : NaN).filter(isFinite);
  const zr = lv('zRange');
  keep.poly = U.poly;
  keep.center = [r0(cx), r0(cy), r0(zs.length ? zs.reduce((a, b) => a + b, 0) / zs.length : (keep.center || [])[2] || 0)];
  keep.radius = r0(Math.max(...U.poly.map(p => Math.hypot(p[0] - cx, p[1] - cy))));
  if (zr) keep.zRange = zr;
  const L = lv('levelRange'), S = lv('suitsPartyLevel'); if (L) keep.levelRange = L; if (S) keep.suitsPartyLevel = S;
  const mons = all.flatMap(r => Array.isArray(r.monsters) ? r.monsters : []); if (mons.length) keep.monsters = mergeMonsters(mons);
  const sc = all.map(r => +r.spawnCount).filter(isFinite); if (sc.length) keep.spawnCount = sc.reduce((a, b) => a + b, 0);
  if (keep.area !== undefined || U.area) keep.area = r0(U.area);
  if (o.name && String(o.name).trim()) keep.name = String(o.name).trim().slice(0, 80);
  keep.polyInfo = Object.assign({}, keep.polyInfo || {}, { quality: 'manual', merged: uniq.slice(), mergedAt: at });
  keep.notes = ((keep.notes ? keep.notes + ' ' : '') + `combined from ${uniq.join(' + ')} on the dashboard ${at.slice(0, 10)}`).slice(0, 400);
  keep.enabled = true; keep.manual = true;
  keep.edited = Object.assign(keep.edited, { by: 'dashboard', at, merged: uniq.slice() });
  const alias = {};
  hits.slice(1).forEach(h => {
    const r = h.r;
    if (!r.edited || !r.edited.orig) r.edited = Object.assign({}, r.edited || {}, { orig: pickOrig(r) });
    r.enabled = false; r.mergedInto = keep.id; r.manual = true; r.edited = Object.assign(r.edited, { by: 'dashboard', at, mergedInto: keep.id });
    alias[r.id] = keep.id;
  });
  // rooms merged earlier into one of the absorbed rooms follow on to the kept one
  (h0.F.rooms || []).forEach(r => { if (r.mergedInto && alias[r.mergedInto]) { alias[r.id] = keep.id; r.mergedInto = keep.id; } });
  return { ok: true, id: keep.id, room: keep, absorbed: Object.keys(alias).filter(k => uniq.includes(k)), alias, dungeon: h0.d.name, key: h0.d.key || '', floor: h0.fi, cells: U.cells };
}
/** every roomId / roomIds in obj (any depth) through alias -> how many changed */
function remapIds(obj, alias) {
  let n = 0; const seen = new Set();
  const walk = (o) => {
    if (!o || typeof o !== 'object' || seen.has(o)) return; seen.add(o);
    if (Array.isArray(o)) { o.forEach(walk); return; }
    if (typeof o.roomId === 'string' && alias[o.roomId]) { o.roomId = alias[o.roomId]; n++; }
    if (Array.isArray(o.roomIds)) { const before = JSON.stringify(o.roomIds); o.roomIds = [...new Set(o.roomIds.map(x => alias[x] || x))]; if (JSON.stringify(o.roomIds) !== before) n++; if (o.roomIds.length === 1 && typeof o.roomId === 'string') { o.roomId = o.roomIds[0]; delete o.roomIds; } }
    Object.keys(o).forEach(k => { if (k !== 'roomIds') walk(o[k]); });
  };
  walk(obj);
  return n;
}
module.exports = { mergeRooms, remapIds, unionOutline, GAP: GAP_CELLS * CELL };
