// SIEGE DATA ENRICHMENT (2026-10-08): adds to Scripts/data/fortresses.json + castles.json (made from the L2J datapack, see
// docs/plan/sieges_research.md) what the bots and the dashboard need on top of the datapack:
//   staging        {x,y,z,why,walk}  the regroup point OUTSIDE the siege zone, on the side of the nearest teleport landing, on walkable
//                                    geodata (Geodata/*.l2j via geopath.js), with the walk from the landing checked by the path finder
//   nearestTeleport {from,to,desc,x,y,z}  same shape as raidbosses_h5.json (swarm.js / dashboard teleport helpers)
// Idempotent: run again after the data files are regenerated.   node docs/plan/tools/sieges_data.js
'use strict';
const fs = require('fs');
const path = require('path');
const G = require('./geopath');
const DATA = path.join(__dirname, '..', '..', '..', 'Scripts', 'data');

function inPoly(x, y, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) c = !c;
  }
  return c;
}
/** Ground height near (x,y): the geodata layer closest to the reference height; null = no walkable cell. */
function ground(x, y, zRef) {
  const gx = G.toGeoX(x), gy = G.toGeoY(y), ls = G.layers(gx, gy);
  if (!ls || !ls.length) return null;
  let best = null; ls.forEach(l => { if (l.nswe === 0) return; if (!best || Math.abs(l.h - zRef) < Math.abs(best.h - zRef)) best = l; });
  return best ? best.h : null;
}
function stagingFor(t) {
  const P = t.pos, L = t.nearestLanding, poly = t.siegeZone && t.siegeZone.polygon;
  if (!P || !isFinite(P.x)) return null;
  const base = L && isFinite(L.x) ? Math.atan2(L.y - P.y, L.x - P.x) : 0;
  const tries = [0, 25, -25, 50, -50, 80, -80, 120, -120, 180].map(d => base + d * Math.PI / 180);
  let fallback = null;
  for (const a of tries) {
    let d = 600;
    while (d < 9000 && poly && inPoly(P.x + Math.cos(a) * d, P.y + Math.sin(a) * d, poly)) d += 150;
    d += 900;                                                     // well outside the zone (combat there flags you)
    const x = Math.round(P.x + Math.cos(a) * d), y = Math.round(P.y + Math.sin(a) * d);
    const z = ground(x, y, L && isFinite(L.z) ? L.z : P.z);
    if (z === null) continue;
    const cand = { x, y, z, why: `outside the siege zone, ${Math.round(d)} from the centre${a === base ? ', toward the landing' : ''}` };
    if (!fallback) fallback = cand;
    if (L && isFinite(L.x)) {
      const r = G.findPath({ x: L.x, y: L.y, z: L.z }, cand, { maxMs: 12000, pad: 4000 });
      if (r.ok) { cand.walk = { from: L.name, units: r.lengthUnits }; return cand; }
    } else return cand;
  }
  if (fallback) fallback.why += ' (no checked walk from the landing)';
  return fallback;
}
function nearestTeleport(t) {
  const L = t.nearestLanding; if (!L || !L.name) return null;
  const from = String(L.fromTown || '').replace(/ Village$/, '');
  return { from, to: L.name, desc: `${L.fromTown} -> ${L.name}`, x: L.x, y: L.y, z: L.z, price: L.price ?? null, dist: L.dist ?? null };
}
for (const [file, key] of [['fortresses.json', 'forts'], ['castles.json', 'castles']]) {
  const f = path.join(DATA, file);
  const j = JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, ''));
  (j[key] || []).forEach(t => {
    const t0 = Date.now();
    t.staging = stagingFor(t);
    t.nearestTeleport = nearestTeleport(t);
    console.log(`${t.id} ${t.name}: staging ${t.staging ? `${t.staging.x},${t.staging.y},${t.staging.z} (${t.staging.walk ? 'walk ' + t.staging.walk.units : 'unchecked'})` : 'NONE'} ${Date.now() - t0} ms`);
  });
  j._enriched = { at: new Date().toISOString(), by: 'docs/plan/tools/sieges_data.js', fields: ['staging', 'nearestTeleport'] };
  fs.writeFileSync(f, JSON.stringify(j, null, 2));
}
