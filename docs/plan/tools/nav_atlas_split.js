// NAV ATLAS SPLIT (2026-10-12): the bots (swarm.js, up to 59 V8 engines) must never load the multi-MB atlas type files. This writes
//   Scripts/data/nav_atlas/t/<key>.json        one route per target (the state machine of steps, needs, alt), ~1-10 KB each
//   Scripts/data/nav_atlas/grid/<gx>_<gy>.json  targets per 16384 x 16384 square: [key, type, name, x, y, z, status, id] (position lookup)
//   Scripts/data/nav_atlas/npcid/<id>.json      [key, x, y, z, status] for every spawn of that NPC id (id lookup)
// Only changed files are rewritten (the bots' file reads stay cheap). Run after nav_atlas.js (it calls this at the end):
//   node docs/plan/tools/nav_atlas_split.js
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
try { os.setPriority(process.pid, os.constants.priority.PRIORITY_LOW); } catch (e) { }
const ROOT = path.resolve(__dirname, '..', '..', '..'), DIR = path.join(ROOT, 'Scripts', 'data', 'nav_atlas');
const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, ''));
const GS = 16384;
const fileKey = (k) => String(k).replace(/[^A-Za-z0-9@,._-]+/g, '_');
const writeIfChanged = (f, s) => { try { if (fs.readFileSync(f, 'utf8') === s) return false; } catch (e) { } const t = f + '.tmp' + process.pid; fs.writeFileSync(t, s); fs.renameSync(t, f); return true; };
function main() {
  const ix = J(path.join(DIR, 'index.json'));
  const files = [...new Set(Object.values(ix.files || {}))];
  for (const d of ['t', 'grid', 'npcid']) fs.mkdirSync(path.join(DIR, d), { recursive: true });
  const keep = new Set(), grid = {}, npcid = {}; let written = 0, n = 0;
  for (const f of files) {
    let R; try { R = J(path.join(DIR, f)).routes || {}; } catch (e) { console.log('nav_atlas_split: cannot read ' + f + ': ' + e.message); continue; }
    for (const [k, r] of Object.entries(R)) {
      n++;
      const fk = fileKey(k) + '.json'; keep.add(fk);
      if (writeIfChanged(path.join(DIR, 't', fk), JSON.stringify(Object.assign({ file: 't/' + fk, atlas: ix.generated }, r)))) written++;
      const T = r.target || {}; if (!isFinite(T.x) || !isFinite(T.y)) continue;
      const g = Math.floor(T.x / GS) + '_' + Math.floor(T.y / GS);
      (grid[g] = grid[g] || []).push([k, r.type, r.name, Math.round(T.x), Math.round(T.y), Math.round(T.z || 0), r.status, T.id != null ? T.id : null]);
      if (r.type === 'npc' && T.id) (npcid[T.id] = npcid[T.id] || []).push([k, Math.round(T.x), Math.round(T.y), Math.round(T.z || 0), r.status]);
    }
  }
  // stale per-target files (a target that is gone)
  let removed = 0;
  for (const f of fs.readdirSync(path.join(DIR, 't'))) if (/\.json$/.test(f) && !keep.has(f)) { try { fs.unlinkSync(path.join(DIR, 't', f)); removed++; } catch (e) { } }
  const gk = new Set(Object.keys(grid).map(g => g + '.json')), nk = new Set(Object.keys(npcid).map(g => g + '.json'));
  for (const [d, S, M] of [['grid', gk, grid], ['npcid', nk, npcid]]) {
    for (const f of fs.readdirSync(path.join(DIR, d))) if (/\.json$/.test(f) && !S.has(f)) { try { fs.unlinkSync(path.join(DIR, d, f)); } catch (e) { } }
    for (const [k, rows] of Object.entries(M)) writeIfChanged(path.join(DIR, d, k + '.json'), JSON.stringify(rows));
  }
  writeIfChanged(path.join(DIR, 'split.json'), JSON.stringify({ generated: new Date().toISOString(), atlas: ix.generated, targets: n, gridSize: GS, fileKey: "key.replace(/[^A-Za-z0-9@,._-]+/g, '_') + '.json'", dirs: { t: 'one route per target', grid: '<floor(x/16384)>_<floor(y/16384)>.json rows [key,type,name,x,y,z,status,id]', npcid: '<npc id>.json rows [key,x,y,z,status]' } }, null, 1));
  console.log(`nav_atlas_split: ${n} targets, ${written} route files written, ${removed} removed, ${Object.keys(grid).length} grid squares, ${Object.keys(npcid).length} npc ids`);
}
if (require.main === module) main();
module.exports = { main, fileKey, GS };
