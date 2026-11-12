// FOGENTRY-2026-11-12 (owner: "fix the trip to FOG for final"): the LOCKED way into Forge of the Gods.
// Before: the leader walked from the Goddard landing (169018,-116303,-2432) to the Top level with the live path finder; it took a line NORTH of the
// bridge, down into the pool under it (water zone 25_14_water1, z -4643..-4033, x 170908..173748, y -116845..-113952), the members copied his
// breadcrumbs and stuck / drowned there for an hour (2026-11-12 03:29-05:30: "in water before point 12 (drowning)", the whole team died at
// 172700,-115000,-4100). This tool plans the DRY walk (water blocked, no ledge drops, clearance cost) landing -> the Top-level entry point
// (177800,-116696,-3672) over the slope + the bridge, cuts it into short legs (<= LEG) with the real ground height, and writes it as the locked
// dungeon entry route Scripts/data/routes/dungeons/forge.json (swarm.js dungeonEntryTrip: every member walks every point, move together).
// Refuses to write when any point lies in a water zone or the walk has a drop.   Usage: node docs/plan/tools/fog_entry_route.js [--dry]
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const geo = require('./geopath_fast'), W = require('./water_zones');
const LANDING = { x: 169018, y: -116303, z: -2432 }, ENTRY = { x: 177800, y: -116696, z: -3672 }, LEG = 250;
W.load();

function plan() {
  const r = geo.findPath(LANDING, ENTRY, { maxLeg: 1000, hWeight: 1.6, drops: false, clear: 5, clearW: 6, clearNeed: 3, swim: false, wet: 'block', maxNodes: 1500000, maxMs: 60000, pad: 5000 });
  if (!r.ok) throw new Error('no dry walk: ' + r.reason);
  if (r.points.some(p => p.drop || p.swim)) throw new Error('the walk has a drop / swim');
  return r;
}
/** ground height at x,y nearest to the guess z (the geodata layer), else the guess */
function ground(x, y, z) {
  const I = geo.internals, gx = I.toGeoX(x), gy = I.toGeoY(y), li = I.layerAt(gx, gy, z);
  if (li < 0) return z;
  const h = I.hAt(gx, gy, li);
  return Math.abs(h - z) < 400 ? h : z;
}
function densify(pts) {
  const out = [{ x: LANDING.x, y: LANDING.y, z: LANDING.z }];
  for (const p of pts) {
    const a = out[out.length - 1], d = Math.hypot(p.x - a.x, p.y - a.y), n = Math.max(1, Math.ceil(d / LEG));
    for (let k = 1; k <= n; k++) {
      const t = k / n, x = Math.round(a.x + (p.x - a.x) * t), y = Math.round(a.y + (p.y - a.y) * t), zg = a.z + (p.z - a.z) * t;
      out.push({ x, y, z: k === n ? p.z : ground(x, y, zg) });
    }
  }
  return out.filter((p, i, A) => i === 0 || Math.hypot(p.x - A[i - 1].x, p.y - A[i - 1].y) > 20);
}

const r = plan();
const pts = densify(r.points);
const wet = pts.filter(p => W.zoneAt(p.x, p.y, p.z));
if (wet.length) { console.error('REFUSED: points in water:', JSON.stringify(wet.slice(0, 5))); process.exit(2); }
let maxLeg = 0, maxDz = 0; for (let i = 1; i < pts.length; i++) { maxLeg = Math.max(maxLeg, Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)); maxDz = Math.max(maxDz, Math.abs(pts[i].z - pts[i - 1].z)); }
let len = 0; for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
// TRAPS: the water zones the team got stuck / died in on 2026-11-12 (Destroyer3's party) - standing inside one = take the route from its start
const TRAP_PROBES = [[172952, -115384, -4158], [173048, -114600, -4150], [172264, -115432, -4050], [172700, -115000, -4100], [173224, -115864, -4158]];
const traps = []; for (const p of TRAP_PROBES) { const z = W.zoneAt(...p); if (z && !traps.some(t => t.name === z.name)) traps.push({ name: z.name, x1: z.x1, x2: z.x2, y1: z.y1, y2: z.y2, minZ: z.minZ, maxZ: z.maxZ }); }
if (!traps.length) { console.error('REFUSED: the pool under the bridge was not found in the water zones'); process.exit(3); }
const out = {
  dungeon: 'Forge of the Gods + Valakas approach (Hall of Flames)', key: 'forge', kind: 'dungeon-entry',
  start: { kind: 'gk', from: 'Goddard', desc: 'Goddard -> Forge of the Gods' },
  landing: 'Goddard -> Forge of the Gods', landingAt: [LANDING.x, LANDING.y, LANDING.z], to: [ENTRY.x, ENTRY.y, ENTRY.z],
  length: Math.round(len), points: pts, traps, manual: true, locked: true, use: 'custom', dry: true, maxLeg: Math.round(maxLeg), maxDz: Math.round(maxDz),
  source: 'docs/plan/tools/fog_entry_route.js (geopath_fast: water blocked, no drops, clearance cost) — the slope 171224,-114808 then the bridge 173080,-116328 -> 173608,-115592 over the pool (water zone 25_14_water1); the owner\'s safe spot "start of the way in, before the bridge" (173032,-116248) lies on it',
  note: 'FOGENTRY-2026-11-12: the ONLY way into FoG from the Goddard landing. swarm.js enterRoom -> dungeonEntryTrip walks it with the whole team (leadRouteWalk), then the room graph takes over from the Top-level entry point.',
  savedAt: new Date().toISOString(), uses: 0, lastOk: null, fails: 0
};
console.log(`FoG entry route: ${pts.length} points, ${Math.round(len)} long, max leg ${Math.round(maxLeg)}, max height step ${Math.round(maxDz)}, dry, no drops`);
if (process.argv.includes('--dry')) process.exit(0);
const f = path.join(ROOT, 'Scripts', 'data', 'routes', 'dungeons', 'forge.json');
fs.writeFileSync(f + '.tmp', JSON.stringify(out, null, 1)); fs.renameSync(f + '.tmp', f);
console.log('written', f);
