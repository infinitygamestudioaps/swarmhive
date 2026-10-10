// ZONE SUB-AREAS (2026-10-08, coordinator after the first spot-claim deploy: Destroyer3, Tank2 and Tank3 share the route zone
// "Abandoned Camp 20-40" (same centre); with spot claims the 2nd and 3rd party were sent to a far datapack spot with 12 monsters).
// A big custom zone is split into sub-areas = monster clusters (L2J spawnlist) that lie >= MIN_SEP apart, so 2-3 parties hunt the same
// zone without overlapping. swarm.js pickSpot uses them (Scripts/data/zone_subareas.json, key "x,y" of the zone centre) before any
// datapack spot. Re-run after adding / moving a custom zone on the dashboard:   node docs/plan/tools/zone_subareas.js
// Only plain outdoor zones are split: rooms / dungeon / drawn polygon / zmap / waypoints / pull-route zones keep their own logic.
// Every cluster must be reachable on foot from the zone centre (our geodata path finder, <= 2.5x the straight distance).
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const DATA = process.env.POLYEDIT_DATA || path.join(ROOT, 'Scripts', 'data');   // env: the dashboard shape editor's sandbox tests (POLYEDIT 2026-10-08)
const rd = (f) => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8').replace(/^﻿/, ''));
const geo = require('./geopath');
const ZONE_SCALE = 3;          // CONFIG.lead.zoneScale: a zone hunts in a square of max(radius, 3000) x 3 around its centre
const CLUSTER_R = 1500;        // monsters within this of a cluster centre belong to it (= the sub-area hunting radius)
const MIN_SEP = 3500;          // sub-area centres at least this far apart (hunting squares 3600 wide do not overlap)
const MIN_MOBS = 8, MAX_AREAS = 4;

const REF = process.env.POLYEDIT_REF || DATA;   // read-only datapack files (sandbox tests read them from the live folder)
const rdRef = (f) => JSON.parse(fs.readFileSync(path.join(REF, f), 'utf8').replace(/^﻿/, ''));
const spawns = rdRef('spawns_h5.json'), npcs = rdRef('npcs_h5.json'), zones = rd('custom_zones.json');
const out = {};
const done = new Set();
for (const z of zones) {
  if (!isFinite(z.x) || !isFinite(z.y) || z.rooms || z.dungeon || (z.poly && z.poly.length) || z.zmap || (z.waypoints && z.waypoints.length) || (z.pulls && z.pulls.length)) continue;
  const key = `${Math.round(z.x)},${Math.round(z.y)}`;
  if (done.has(key)) { out[key].zones.push(z.name); continue; }
  done.add(key);
  const half = Math.max(num(z.radius) || 3000, 3000) * ZONE_SCALE / 2 + 3000;   // a bit beyond the hunting square: neighbouring camps a short walk away
  const lmin = num(z.levelMin) - 6, lmax = num(z.levelMax) + 6;
  const mobs = spawns.filter(s => {
    const n = npcs[String(s.id)]; if (!n || n.ty !== 'L2Monster') return false;
    if (n.l < lmin || n.l > lmax) return false;
    if (Math.abs(s.x - z.x) > half || Math.abs(s.y - z.y) > half) return false;
    return !isFinite(z.z) || Math.abs(s.z - z.z) < 1000;          // not the cave / tower floor below
  }).map(s => ({ x: s.x, y: s.y, z: s.z, c: s.count || 1, l: npcs[String(s.id)].l, n: npcs[String(s.id)].n }));
  const areas = [];
  let left = mobs.slice();
  while (areas.length < MAX_AREAS && left.length) {
    let best = null;
    for (const p of left) {
      if (areas.some(a => Math.hypot(a.x - p.x, a.y - p.y) < MIN_SEP)) continue;
      let d = 0; for (const q of left) if (Math.abs(q.x - p.x) < CLUSTER_R && Math.abs(q.y - p.y) < CLUSTER_R && Math.hypot(q.x - p.x, q.y - p.y) < CLUSTER_R) d += q.c;
      if (!best || d > best.d) best = { p, d };
    }
    if (!best || best.d < MIN_MOBS) break;
    const mem = left.filter(q => Math.hypot(q.x - best.p.x, q.y - best.p.y) < CLUSTER_R);
    const W = mem.reduce((a, q) => a + q.c, 0);
    let cx = Math.round(mem.reduce((a, q) => a + q.x * q.c, 0) / W), cy = Math.round(mem.reduce((a, q) => a + q.y * q.c, 0) / W);
    const zs = mem.map(q => q.z).sort((a, b) => a - b), cz = zs[zs.length >> 1];
    left = left.filter(q => !mem.includes(q));
    if (areas.some(a => Math.hypot(a.x - cx, a.y - cy) < MIN_SEP)) { cx = best.p.x; cy = best.p.y; }   // centroid drifted toward another area
    if (areas.some(a => Math.hypot(a.x - cx, a.y - cy) < MIN_SEP)) continue;
    // reachable on foot from the zone centre (where the landing walk ends)?
    const straight = Math.hypot(cx - z.x, cy - z.y);
    let walk = null;
    try { const r = geo.findPath({ x: z.x, y: z.y, z: startZ(z, cz) }, { x: cx, y: cy, z: cz }, { maxMs: 8000, pad: 4000 }); walk = r.ok ? r.lengthUnits : null; } catch (e) { walk = null; }
    if (straight > 300 && (walk === null || walk > Math.max(2.5 * straight, straight + 2000))) { console.log(`  skip ${z.name} cluster @${cx},${cy}: ${walk === null ? 'no walk from the centre' : 'walk ' + walk + ' vs straight ' + Math.round(straight)}`); continue; }
    const names = {}; mem.forEach(q => { names[q.n] = (names[q.n] || 0) + q.c; });
    areas.push({ x: cx, y: cy, z: cz, mobs: W, lvl: [Math.min(...mem.map(q => q.l)), Math.max(...mem.map(q => q.l))],
      top: Object.keys(names).sort((a, b) => names[b] - names[a]).slice(0, 3), walk: walk === null ? 0 : walk });
  }
  out[key] = { zones: [z.name], center: { x: z.x, y: z.y, z: z.z }, radius: CLUSTER_R, areas };
}
function num(v) { return Number(v) || 0; }
/** The zone centre's height on the geodata (a dashboard zone z can be 500 off the ground: the path finder needs the real floor). */
function startZ(z, fallback) { try { const L = geo.layers(geo.toGeoX(z.x), geo.toGeoY(z.y)) || []; const want = isFinite(z.z) ? z.z : fallback; let b = null; L.forEach(l => { if (!b || Math.abs(l.h - want) < Math.abs(b.h - want)) b = l; }); return b ? b.h : want; } catch (e) { return isFinite(z.z) ? z.z : fallback; } }
const usable = {}; Object.keys(out).forEach(k => { if (out[k].areas.length >= 2) usable[k] = out[k]; });   // one cluster = nothing to split
const file = path.join(DATA, 'zone_subareas.json');
// POLYEDIT 2026-10-08: locked + atomic write; entries marked manual (edited by hand) are kept as they are on disk (manual_guard.js)
require('./manual_guard').writeGuarded(file, { generated: new Date().toISOString(), clusterRadius: CLUSTER_R, minSeparation: MIN_SEP, zones: usable }, 'subarea', { indent: 1 });
Object.keys(usable).forEach(k => console.log(`${usable[k].zones[0]}${usable[k].zones.length > 1 ? ' (+' + (usable[k].zones.length - 1) + ' same centre)' : ''}: ` +
  usable[k].areas.map(a => `@${a.x},${a.y} ${a.mobs} mobs lvl ${a.lvl.join('-')} walk ${a.walk}`).join(' | ')));
console.log(`${Object.keys(usable).length} zones split -> ${file}`);
