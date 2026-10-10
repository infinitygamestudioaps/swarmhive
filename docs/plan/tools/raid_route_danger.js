// Adds `routeMaxMobLevel` + `routeDanger` to every raid boss in Scripts/data/raidbosses_h5.json: the highest-level MONSTER near the
// teleport landing and along the walk from the landing to the boss (sampled every 400 units, 1500 to each side), plus around the boss.
// Why (user 2026-10-05 21:50, "WHY ARE YOU IN DRAGON VALLEY! It's lvl 84 monsters"): raidhunt took Skyla (lvl 32) whose nearest
// teleport is the Antharas Lair landing + an 18 km walk through Dragon Valley; only the BOSS level was checked, never the way there.
// Run: node docs/plan/tools/raid_route_danger.js   (swarm.js raidhunt skips bosses whose route has monsters far above the team)
const fs = require('fs');
const path = require('path');
const DATA = path.join(__dirname, '..', '..', '..', 'Scripts', 'data');
const read = (f) => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8').replace(/^﻿/, ''));
const npcs = read('npcs_h5.json');
const spawns = read('spawns_h5.json');
const file = path.join(DATA, 'raidbosses_h5.json');
const rb = read('raidbosses_h5.json');
// monsters only (no raid bosses themselves, no NPCs), bucketed in 2000-unit cells for fast lookups
const B = 2000, grid = new Map();
for (const s of spawns) {
  const n = npcs[s.id]; if (!n || n.ty !== 'L2Monster' || !n.l) continue;
  const k = Math.floor(s.x / B) + ',' + Math.floor(s.y / B);
  (grid.get(k) || grid.set(k, []).get(k)).push({ x: s.x, y: s.y, z: s.z, l: n.l, name: n.n });
}
function near(x, y, z, r) {
  const out = [];
  for (let gx = Math.floor((x - r) / B); gx <= Math.floor((x + r) / B); gx++) for (let gy = Math.floor((y - r) / B); gy <= Math.floor((y + r) / B); gy++)
    for (const m of grid.get(gx + ',' + gy) || []) if (Math.hypot(m.x - x, m.y - y) <= r && (z == null || Math.abs(m.z - z) < 600)) out.push(m);   // 600: same floor / terrain level
  return out;
}
let n = 0;
for (const b of rb.bosses) {
  const tp = b.nearestTeleport || {};
  const pts = [{ x: b.x, y: b.y, z: b.z, r: 2500 }];
  if (tp.x != null) {
    const d = Math.hypot(b.x - tp.x, b.y - tp.y), steps = Math.max(1, Math.ceil(d / 400));
    // height too (2026-10-05: Hellion's walk "passed" level-50 Death Knights that live INSIDE Cruma Tower, floors above the walk)
    const z0 = tp.z != null ? tp.z : b.z;
    for (let i = 0; i <= steps; i++) pts.push({ x: tp.x + (b.x - tp.x) * i / steps, y: tp.y + (b.y - tp.y) * i / steps, z: z0 + (b.z - z0) * i / steps, r: 1500 });
  }
  let max = 0, worst = null;
  for (const p of pts) for (const m of near(p.x, p.y, p.z, p.r)) if (m.l > max && m.name !== b.name && !(b.minions || []).includes(m.name)) { max = m.l; worst = m; }
  b.routeMaxMobLevel = max;
  b.routeDanger = worst ? `${worst.name} lvl ${worst.l} at ${Math.round(worst.x)},${Math.round(worst.y)}` : '';
  n++;
}
rb.routeDangerNote = 'routeMaxMobLevel = strongest monster within 1500 of the teleport landing -> boss walk line (and 2500 around the boss); see docs/plan/tools/raid_route_danger.js';
fs.writeFileSync(file, JSON.stringify(rb, null, 1));
console.log(`${n} bosses updated`);
for (const b of rb.bosses.filter(b => b.level <= 45).sort((a, c) => a.level - c.level))
  console.log(`${String(b.level).padStart(2)} ${b.name.padEnd(32)} route max ${String(b.routeMaxMobLevel).padStart(2)}  ${b.routeMaxMobLevel > b.level + 10 ? 'DANGER ' + b.routeDanger : ''}`);
