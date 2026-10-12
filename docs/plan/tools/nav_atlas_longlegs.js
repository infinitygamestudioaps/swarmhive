// NAV ATLAS LONG LEGS (2026-10-12 unreachable research, docs/plan/unreachable_research.md): some walks are real on the geodata but too long /
// winding for the atlas worker's A* node cap ("gave up after N cells"): the Hellbound Warpgate landing -> Deltuva at the Steel Citadel (23 km,
// a 2.25 M cell flood) and Rune -> the Dungeon Gatekeeper in the inner Rune Castle (52 km of walking). This tool floods the geodata from the
// start (BFS, same step rule as geopath_fast: NSWE + 48 step), takes waypoints every ~250 cells along the found way, joins them with short
// A* searches (geopath_fast.findPath, smoothed, wall-checked legs <= 1000) and writes the result into the atlas walk cache
// (Scripts/data/nav_atlas/_walks.json, same key + shape as the nav_atlas.js worker), so the next nav_atlas.js run uses it.
// Legs: Scripts/data/nav_atlas_extra.json longLegs[] = { a: [x,y,z], b: [x,y,z], box: [xMin, xMax, yMin, yMax], why }.
// Run (L2Swarm may run; ~1 GB peak, low priority, one leg at a time):  node --max-old-space-size=1400 docs/plan/tools/nav_atlas_longlegs.js [--force]
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
try { os.setPriority(process.pid, os.constants.priority.PRIORITY_LOW); } catch (e) { }
const ROOT = path.resolve(__dirname, '..', '..', '..'), DATA = path.join(ROOT, 'Scripts', 'data');
const CACHE = path.join(DATA, 'nav_atlas', '_walks.json');
const geo = require('./geopath_fast'), G = geo.internals;
const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, ''));
const kq = (v) => Math.round(v / 32);
const walkKey = (a, b) => `${kq(a.x)},${kq(a.y)},${kq(a.z || 0)}>${kq(b.x)},${kq(b.y)},${kq(b.z || 0)}`;   // = nav_atlas.js walkKey
const legs = (J(path.join(DATA, 'nav_atlas_extra.json')).longLegs || []);
const force = process.argv.includes('--force');
const cache = (() => { try { return J(CACHE); } catch (e) { return { walks: {} }; } })(); cache.walks = cache.walks || {};
let wrote = 0;
for (const L of legs) {
  const a = { x: L.a[0], y: L.a[1], z: L.a[2] }, b = { x: L.b[0], y: L.b[1], z: L.b[2] }, k = walkKey(a, b);
  if (cache.walks[k] && cache.walks[k].ok && !force) { console.log(`${L.why}: cached`); continue; }
  const t0 = Date.now();
  { const r0 = geo.findPath(a, b, { maxNodes: L.maxNodes || 7000000, maxMs: 120000, maxLeg: 1000, hWeight: 2, pad: L.pad || 6000, noLearned: false });   // a big A* first
    geo.dropRegions();
    if (r0.ok) { const pts = [].concat(...r0.points.map(p => [p.x, p.y, p.z])); cache.walks[k] = { ok: true, pts, len: r0.lengthUnits || 0, ms: r0.ms, at: Date.now(), by: 'nav_atlas_longlegs', note: 'A* with a raised node cap' }; wrote++; console.log(`${L.why}: A* ${r0.lengthUnits} units, ${r0.points.length} points`); continue; }
    console.log(`${L.why}: A* gave up (${r0.reason}) — flooding`); }
  const sx = G.toGeoX(a.x), sy = G.toGeoY(a.y), tx = G.toGeoX(b.x), ty = G.toGeoY(b.y), sl = G.layerAt(sx, sy, a.z);
  const [x0, x1] = [G.toGeoX(L.box[0]), G.toGeoX(L.box[1])], [y0, y1] = [G.toGeoY(L.box[2]), G.toGeoY(L.box[3])];
  if (sl < 0) { console.log(`${L.why}: start not on the geodata`); continue; }
  const prev = new Map(), key = (x, y, l) => (x * 32768 + y) * 64 + l;
  const q = [[sx, sy, sl]]; prev.set(key(sx, sy, sl), -1); let end = null;
  for (let qi = 0; qi < q.length && !end; qi++) {
    const [x, y, l] = q[qi];
    if (Math.abs(x - tx) <= 1 && Math.abs(y - ty) <= 1 && Math.abs(G.hAt(x, y, l) - b.z) < 120) { end = [x, y, l]; break; }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy; if (nx < x0 || nx > x1 || ny < y0 || ny > y1) continue;
      const nl = G.step(x, y, l, dx, dy); if (nl < 0) continue;
      const nk = key(nx, ny, nl); if (prev.has(nk)) continue; prev.set(nk, key(x, y, l)); q.push([nx, ny, nl]);
    }
  }
  if (!end) { console.log(`${L.why}: no way inside the box (${prev.size} cells flooded)`); continue; }
  const cells = []; for (let c = key(...end); c !== -1; c = prev.get(c)) { const xy = Math.floor(c / 64), l = c - xy * 64, x = Math.floor(xy / 32768), y = xy - x * 32768; cells.push([x, y, l]); }
  cells.reverse(); prev.clear(); q.length = 0;
  const wp = cells.filter((c, i) => i === 0 || i === cells.length - 1 || i % 250 === 0).map(c => ({ x: G.toWorldX(c[0]), y: G.toWorldY(c[1]), z: G.hAt(c[0], c[1], c[2]) }));
  const pts = []; let ok = true, len = 0;
  for (let i = 1; i < wp.length; i++) {
    const r = geo.findPath(wp[i - 1], wp[i], { maxNodes: 400000, maxMs: 20000, maxLeg: 1000, hWeight: 2, pad: 2000, noLearned: false });
    if (!r.ok) { ok = false; console.log(`${L.why}: segment ${i} failed: ${r.reason}`); break; }
    r.points.forEach(p => pts.push(p.x, p.y, p.z)); len += r.lengthUnits || 0;
  }
  if (!ok) continue;
  pts.push(b.x, b.y, b.z);
  cache.walks[k] = { ok: true, pts, len, ms: Date.now() - t0, at: Date.now(), by: 'nav_atlas_longlegs', note: `BFS waypoints + A* segments (${cells.length} cells)` };
  wrote++; console.log(`${L.why}: ${Math.round(len)} units, ${pts.length / 3} points, ${Math.round((Date.now() - t0) / 1000)} s`);
  geo.dropRegions();
}
if (wrote) { const disk = (() => { try { return J(CACHE); } catch (e) { return { walks: {} }; } })(); disk.walks = disk.walks || {}; Object.keys(cache.walks).forEach(k => { if (cache.walks[k].by === 'nav_atlas_longlegs') disk.walks[k] = cache.walks[k]; }); disk.updated = new Date().toISOString(); const t = CACHE + '.tmp' + process.pid; fs.writeFileSync(t, JSON.stringify(disk)); fs.renameSync(t, CACHE); }
console.log(`nav_atlas_longlegs: ${wrote} leg(s) written`);
