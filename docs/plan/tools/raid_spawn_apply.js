// RAIDSPAWN APPLY (2026-10-15, owner: Archon Suscepter lives on Cruma floor 2, the datapack says floor 1): writes the owner's boss positions
// (Scripts/data/raid_spawn_fix.json  { "<boss id>": { x, y, z, note } }) into Scripts/data/raidbosses_h5.json, so EVERY reader (nav atlas, raid
// routes, safe fight areas, dashboard maps, swarm.js) uses the same spot. The datapack spot is kept in b.dataPos; b.spawnFix says who moved it.
// A GENERATED fight area (raid_areas.json, notes 'generated...') around the old spot is removed so raid_safe_areas.js --write makes a new one;
// a fight area drawn on the dashboard (manual) is never touched — it is only reported.
//   node docs/plan/tools/raid_spawn_apply.js            dry run
//   node docs/plan/tools/raid_spawn_apply.js --write    write (backups in Settings/backup/raid_spawn_apply_<date>/)
// Afterwards: node docs/plan/tools/raid_safe_areas.js --write --only <id>   and   node docs/plan/tools/nav_atlas.js --keys raid:<id> --tag spawnfix
// Run this again after any tool regenerates raidbosses_h5.json.
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..'), DATA = path.join(ROOT, 'Scripts', 'data');
const WRITE = process.argv.includes('--write');
const rd = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch (e) { return d; } };
const FIX = path.join(DATA, 'raid_spawn_fix.json'), RB = path.join(DATA, 'raidbosses_h5.json'), AREAS = path.join(DATA, 'raid_areas.json');
const fix = rd(FIX, {}), rbRaw = fs.readFileSync(RB, 'utf8'), rb = JSON.parse(rbRaw.replace(/^﻿/, '')), areas = rd(AREAS, {});
const list = Array.isArray(rb) ? rb : (rb.bosses || []);
const areaMap = areas.areas && typeof areas.areas === 'object' ? areas.areas : areas;
const out = []; let changedRb = false, changedAreas = false;
Object.keys(fix).filter(k => /^\d+$/.test(k)).forEach(id => {
  const f = fix[id], b = list.find(x => String(x.id) === id);
  if (!b) { out.push(`${id}: not in raidbosses_h5.json — skipped`); return; }
  if (![f.x, f.y, f.z].every(v => isFinite(Number(v)))) { out.push(`${id} ${b.name}: x / y / z missing — skipped`); return; }
  if (!b.dataPos) b.dataPos = { x: b.x, y: b.y, z: b.z };
  const same = b.x === Number(f.x) && b.y === Number(f.y) && b.z === Number(f.z);
  b.x = Number(f.x); b.y = Number(f.y); b.z = Number(f.z); b.spawnFix = { note: f.note || '', by: f.by || 'owner', at: f.at || '' };
  if (!same) { changedRb = true; out.push(`${id} ${b.name}: ${b.dataPos.x},${b.dataPos.y},${b.dataPos.z} (datapack) -> ${b.x},${b.y},${b.z}`); }
  else out.push(`${id} ${b.name}: already at ${b.x},${b.y},${b.z}`);
  const a = areaMap[id];
  if (a) {
    const pts = a.fight || []; const cx = pts.length ? pts.reduce((s, p) => s + p[0], 0) / pts.length : b.x, cy = pts.length ? pts.reduce((s, p) => s + p[1], 0) / pts.length : b.y;
    const far = Math.hypot(cx - b.x, cy - b.y) > 1500;
    if (far && /^generated/i.test(String(a.notes || '')) && !a.manual) { delete areaMap[id]; changedAreas = true; out.push(`   generated fight area around the old spot removed (run raid_safe_areas.js --write --only ${id})`); }
    else if (far) out.push(`   ⚠ its fight area (drawn on the dashboard) is ${Math.round(Math.hypot(cx - b.x, cy - b.y))} away from the new spot — move it on the dashboard`);
  }
});
console.log(out.join('\n') || 'no fixes in raid_spawn_fix.json');
if (!WRITE) { console.log('(dry run — add --write)'); process.exit(0); }
if (changedRb || changedAreas) {
  const bk = path.join(ROOT, 'Settings', 'backup', 'raid_spawn_apply_' + new Date().toISOString().slice(0, 10)); fs.mkdirSync(bk, { recursive: true });
  if (changedRb) { fs.copyFileSync(RB, path.join(bk, 'raidbosses_h5.json')); fs.writeFileSync(RB, (rbRaw.charCodeAt(0) === 0xFEFF ? '﻿' : '') + JSON.stringify(rb, null, 1)); }
  if (changedAreas) { fs.copyFileSync(AREAS, path.join(bk, 'raid_areas.json')); fs.writeFileSync(AREAS, JSON.stringify(areas, null, 1)); }
  console.log('written; backups in ' + bk);
} else console.log('nothing to write');
