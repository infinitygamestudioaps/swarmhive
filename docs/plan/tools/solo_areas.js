// SOLO AREA STATS (2026-10-09, incident: Dagger1, solo Treasure Hunter lvl 45 without a healer, died in "Sea of Spores 7": 23 spawns, ALL
// aggressive with aggro range 1000, and the raid boss Rotting Tree Repiro (lvl 44) with its 4 minions (Fighter / Spirit of Sea of Spores, lvl 43)
// standing INSIDE the area). field_areas.json knows the level window and the monster list of every area, but not how crowded the aggressive
// monsters stand, whether they come in packs, or how dangerous the walk from the landing is. This tool adds that, for solo characters.
//
// Writes Scripts/data/solo_areas.json { generated, tool, params, areas: { "<area id>": stats } } with per field area:
//   aggr        aggressive spawns inside the area (field_areas monster list, aggro_h5.json)
//   dens        aggressive spawns per 1,000,000 units^2 (a 1000 x 1000 square)
//   cov         aggro coverage: sum of the aggressive spawns' aggro circles (min(range, 1000)) / area (1 = the area is covered once)
//   maxPack     the largest group of aggressive spawns within PACK_R (500) of one spawn (spawn 'count' included): 3+ = a pack
//   packs       how many aggressive spawns stand in such a pack (3+)
//   landingAggr aggressive spawns whose aggro circle (+300) covers the entry landing
//   routeAggr   distinct aggressive spawns whose aggro circle (+100) the entry walk (landing -> area centre) crosses
//   routeMax    the most aggressive aggro circles that cover one point of that walk
//   raidNear    raid bosses within 2000 of the area polygon [{ name, level, dist }] (raidbosses_h5.json + the area's own list)
//   maxLvl, avgLvl  monster levels (spawn-weighted)
// swarm.js (SOLOSAFE soloAreaWhy) reads it live: a solo character without a healer only takes areas that pass (level, density, packs, landing,
// raid bosses). Without this file the check falls back to the field_areas.json numbers (no packs / landing / route).
//
// Use:  node docs/plan/tools/solo_areas.js [--dry] [--only <area id substring>]
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const DATA = path.join(ROOT, 'Scripts', 'data');
const rd = (f) => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8').replace(/^﻿/, ''));
const args = process.argv.slice(2), dry = args.includes('--dry'), only = (() => { const i = args.indexOf('--only'); return i >= 0 ? args[i + 1] : ''; })();
const PACK_R = 500, AGGRO_CAP = 1000, Z_BAND = 600, RAID_NEAR = 2000;

const FA = rd('field_areas.json'), SP = rd('spawns_h5.json'), AG = rd('aggro_h5.json');
let RB = []; try { const r = rd('raidbosses_h5.json'); RB = Array.isArray(r) ? r : (r.bosses || Object.values(r)); } catch (e) { }
const aggroOf = (name) => Math.min(Number(AG[name]) || 0, AGGRO_CAP);

function inPoly(x, y, P) {
  let inside = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const xi = P[i][0], yi = P[i][1], xj = P[j][0], yj = P[j][1]; if (((yi > y) !== (yj > y)) && x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-9) + xi) inside = !inside; }
  return inside;
}
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy; let t = L ? ((px - ax) * dx + (py - ay) * dy) / L : 0; t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
function polyDist(x, y, P) {
  if (inPoly(x, y, P)) return 0;
  let d = Infinity; for (let i = 0, j = P.length - 1; i < P.length; j = i++) d = Math.min(d, segDist(x, y, P[j][0], P[j][1], P[i][0], P[i][1]));
  return d;
}
// aggressive spawns as points (each with its count) — grid index 4000
const aggSpawns = SP.filter(s => aggroOf(s.name) > 0).map(s => ({ x: s.x, y: s.y, z: s.z, n: Number(s.count) || 1, r: aggroOf(s.name), name: s.name }));
const G = 4000, grid = {};
aggSpawns.forEach(s => { const k = `${Math.floor(s.x / G)},${Math.floor(s.y / G)}`; (grid[k] = grid[k] || []).push(s); });
function near(x, y, R) {
  const out = [], x0 = Math.floor((x - R) / G), x1 = Math.floor((x + R) / G), y0 = Math.floor((y - R) / G), y1 = Math.floor((y + R) / G);
  for (let gx = x0; gx <= x1; gx++) for (let gy = y0; gy <= y1; gy++) (grid[`${gx},${gy}`] || []).forEach(s => out.push(s));
  return out;
}
const zOk = (s, zr) => !zr || (s.z >= zr[0] - Z_BAND && s.z <= zr[1] + Z_BAND);

const out = {};
let n = 0;
(FA.regions || []).forEach(R => (R.areas || []).forEach(a => {
  if (only && !a.id.includes(only)) return;
  if (!a.poly || a.poly.length < 3) return;
  const mons = a.monsters || [], tot = mons.reduce((t, m) => t + (m.count || 0), 0);
  const aggr = mons.filter(m => m.aggressive).reduce((t, m) => t + (m.count || 0), 0);
  const area = Number(a.area) || 1;
  const cov = mons.filter(m => m.aggressive).reduce((t, m) => t + (m.count || 0) * Math.PI * Math.pow(Math.min(m.aggro || 600, AGGRO_CAP), 2), 0) / area;
  const maxLvl = mons.reduce((t, m) => Math.max(t, m.level || 0), 0), avgLvl = tot ? mons.reduce((t, m) => t + (m.count || 0) * (m.level || 0), 0) / tot : 0;
  // packs: aggressive spawns inside the polygon (+200) and its height band
  const xs = a.poly.map(p => p[0]), ys = a.poly.map(p => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2, half = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / 2 + 300;
  const inside = near(cx, cy, half).filter(s => zOk(s, a.zRange) && polyDist(s.x, s.y, a.poly) <= 200);
  let maxPack = 0; const inPack = new Set();
  inside.forEach(s => {
    const grp = inside.filter(t => Math.hypot(t.x - s.x, t.y - s.y) <= PACK_R);
    const cnt = grp.reduce((t, g) => t + g.n, 0);
    if (cnt > maxPack) maxPack = cnt;
    if (cnt >= 3) grp.forEach(g => inPack.add(g));
  });
  const packs = [...inPack].reduce((t, g) => t + g.n, 0);
  // landing + entry walk
  const e = a.entry || {}, L = Array.isArray(e.landing) ? e.landing : null;
  let landingAggr = 0, routeAggr = 0, routeMax = 0;
  if (L) {
    near(L[0], L[1], AGGRO_CAP + 300).forEach(s => { if (Math.abs(s.z - L[2]) < Z_BAND && Math.hypot(s.x - L[0], s.y - L[1]) <= s.r + 300) landingAggr += s.n; });
    const pts = [L].concat(Array.isArray(e.route) ? e.route : []).concat([a.center]);
    const hit = new Set();
    for (let i = 1; i < pts.length; i++) {
      const A = pts[i - 1], B = pts[i], len = Math.hypot(B[0] - A[0], B[1] - A[1]), steps = Math.max(1, Math.ceil(len / 250));
      for (let k = 0; k <= steps; k++) {
        const x = A[0] + (B[0] - A[0]) * k / steps, y = A[1] + (B[1] - A[1]) * k / steps, z = (A[2] || 0) + ((B[2] || 0) - (A[2] || 0)) * k / steps;
        let here = 0;
        near(x, y, AGGRO_CAP + 100).forEach(s => { if (Math.abs(s.z - z) < Z_BAND && Math.hypot(s.x - x, s.y - y) <= s.r + 100) { here += s.n; hit.add(s); } });
        if (here > routeMax) routeMax = here;
      }
    }
    routeAggr = [...hit].reduce((t, s) => t + s.n, 0);
  }
  // raid bosses near the polygon
  const raid = {};
  (a.raidBosses || []).forEach(b => { if ((b.dist || 0) <= RAID_NEAR) raid[b.name] = { name: b.name, level: b.level, dist: Math.round(b.dist || 0) }; });
  RB.forEach(b => { if (!isFinite(b.x) || raid[b.name]) return; if (a.zRange && isFinite(b.z) && (b.z < a.zRange[0] - 1000 || b.z > a.zRange[1] + 1000)) return; const d = polyDist(b.x, b.y, a.poly); if (d <= RAID_NEAR) raid[b.name] = { name: b.name, level: b.level, dist: Math.round(d) }; });
  out[a.id] = { aggr, total: tot, dens: Math.round(aggr / (area / 1e6) * 100) / 100, cov: Math.round(cov * 100) / 100, maxPack, packs,
    landingAggr, routeAggr, routeMax, raidNear: Object.values(raid), maxLvl, avgLvl: Math.round(avgLvl * 10) / 10 };
  n++;
}));
const doc = { generated: new Date().toISOString(), tool: 'docs/plan/tools/solo_areas.js', params: { PACK_R, AGGRO_CAP, Z_BAND, RAID_NEAR, densUnit: 'aggressive spawns per 1,000,000 units^2' }, areas: out };
if (dry) { console.log(JSON.stringify(Object.entries(out).slice(0, 5), null, 1)); console.log(`${n} areas (dry run, nothing written)`); }
else {
  const f = path.join(DATA, 'solo_areas.json'), tmp = f + '.tmp';
  if (only && fs.existsSync(f)) { try { const old = JSON.parse(fs.readFileSync(f, 'utf8')); doc.areas = Object.assign(old.areas || {}, out); } catch (e) { } }
  fs.writeFileSync(tmp, JSON.stringify(doc)); fs.renameSync(tmp, f);
  console.log(`${n} areas -> ${f}`);
}
