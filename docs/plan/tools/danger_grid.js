// Builds Scripts/data/danger_grid.json: the highest MONSTER level in every 2000 x 2000 square of the world, per HEIGHT BAND of 500
// (from the datapack spawns), so swarm.js can refuse a teleport/walk into an area far above the team (user 2026-10-05 21:52, after the
// Dragon Valley wipe). Height bands since 2026-10-05 23:17: the Cruma Tower landing (ground) was refused because of level-50 monsters on
// the tower's upper floors. Raid bosses and their minions are left out (the raid rules handle them).
// Format: { x0, y0, size, w, h, band, data: { "<cell index>": [[band, maxLevel], ...] } }   band = floor(z / 500)
// Run: node docs/plan/tools/danger_grid.js
const fs = require('fs');
const path = require('path');
const DATA = path.join(__dirname, '..', '..', '..', 'Scripts', 'data');
const read = (f) => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8').replace(/^﻿/, ''));
const npcs = read('npcs_h5.json'), spawns = read('spawns_h5.json');
const rb = read('raidbosses_h5.json').bosses;
const skip = new Set(); rb.forEach(b => { skip.add(b.name); (b.minions || []).forEach(m => skip.add(m)); });
const size = 2000, x0 = -330000, y0 = -300000, w = Math.ceil(660000 / size), h = Math.ceil(600000 / size), band = 500;
const cells = {};
let n = 0;
for (const s of spawns) {
  const npc = npcs[s.id];
  if (!npc || npc.ty !== 'L2Monster' || !npc.l || skip.has(npc.n)) continue;
  const cx = Math.floor((s.x - x0) / size), cy = Math.floor((s.y - y0) / size);
  if (cx < 0 || cy < 0 || cx >= w || cy >= h) continue;
  const i = cy * w + cx, b = Math.floor(s.z / band);
  const c = cells[i] = cells[i] || {};
  if (!(c[b] >= npc.l)) c[b] = npc.l;
  n++;
}
const data = {};
Object.keys(cells).forEach(i => { data[i] = Object.entries(cells[i]).map(([b, l]) => [+b, l]); });
fs.writeFileSync(path.join(DATA, 'danger_grid.json'), JSON.stringify({ generated: new Date().toISOString(), note: 'max monster level per square and 500-height band; docs/plan/tools/danger_grid.js', x0, y0, size, w, h, band, data }));
/** same lookup as swarm.js dangerAt: monsters within r (x/y) and within zr of z (z null = any height) */
const at = (x, y, r, z, zr = 700) => { let m = 0; for (let cx = Math.floor((x - r - x0) / size); cx <= Math.floor((x + r - x0) / size); cx++) for (let cy = Math.floor((y - r - y0) / size); cy <= Math.floor((y + r - y0) / size); cy++) { const l = data[cy * w + cx]; if (l) l.forEach(([b, lv]) => { if (z == null || Math.abs(b * band + band / 2 - z) <= zr + band / 2) m = Math.max(m, lv); }); } return m; };
console.log(`${n} monster spawns in ${Object.keys(data).length} squares`);
console.log('Antharas Lair landing:', at(131557, 114509, 3000, -3712), '| Cruma Tower landing:', at(17192, 114178, 3000, -3439), '| any height:', at(17192, 114178, 3000, null));
console.log('Giran:', at(83473, 148554, 3000, -3400), ' Abandoned Camp:', at(-49853, 147089, 3000, -3000));
