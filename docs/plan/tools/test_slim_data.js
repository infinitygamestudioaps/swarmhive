// CENTRAL DATA step 1+2 test (2026-10-12): the slim files of Dashboard/dataservice.js give the SAME answers as the original data.
//  - dungeon rooms: lazy per-dungeon floors (swarm.js dungeonRooms + dungeonLazy) vs the full dungeon_rooms.json, dzFloor at every room centre
//  - npc levels: slim/npc_levels.json vs npcs_h5.json monsters
//  - dawn priests: slim/dawn_priests.json vs npc_atlas.json
// Run: node docs/plan/tools/test_slim_data.js   (builds the slim files itself into a temp folder with dataservice.js's builders)
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const src = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m); } };
const grab = (a, b) => { const i = src.indexOf(a); if (i < 0) throw new Error('missing ' + a); const j = src.indexOf(b, i + a.length); if (j < 0) throw new Error('missing end ' + b); return src.slice(i, j); };
// the slim files are built HERE into a temp folder with the data service's own builders (Dashboard/dataservice.js SLIMS), so the test
// needs no running dashboard and works on a fresh / public install (Scripts/data/slim is not shipped); reads of Scripts/data/slim go there
const SLIMTMP = fs.mkdtempSync(path.join(require('os').tmpdir(), 'slimtest_'));
{
  const ds = fs.readFileSync(path.join(ROOT, 'Dashboard', 'dataservice.js'), 'utf8'), a = ds.indexOf('const SLIMS = ['), b = ds.indexOf('\nconst slimState', a);
  if (a < 0 || b < 0) throw new Error('Dashboard/dataservice.js: SLIMS block not found');
  const readJ = (f) => JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, ''));
  const writeAtomic = (f, obj) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(obj)); };
  const SLIMS = new Function('path', 'DATA', 'SLIM', 'readJ', 'writeAtomic', ds.slice(a, b) + '\nreturn SLIMS;')(path, path.join(ROOT, 'Scripts', 'data'), SLIMTMP, readJ, writeAtomic);
  for (const s of SLIMS) writeAtomic(path.join(SLIMTMP, s.out), s.build());
}
process.on('exit', () => { try { fs.rmSync(SLIMTMP, { recursive: true, force: true }); } catch (e) { } });
const P = (p) => { const q = p.replace(/\\/g, '/'), m = /\/Scripts\/data\/slim\/(.*)$/i.exec(q); return m ? path.join(SLIMTMP, m[1]).replace(/\\/g, '/') : q; };
global.__DIR__ = ROOT; global.__SCRIPTS__ = path.join(ROOT, 'Scripts'); global.now = () => Date.now();
global.File = { ReadAllText: (p) => fs.readFileSync(P(p), 'utf8'), Exists: (p) => fs.existsSync(P(p)) };
global.fileStamp = (p) => { try { return String(Math.round(fs.statSync(P(p)).mtimeMs * 10000)); } catch (e) { return ''; } };
global.logError = () => { };
const code = grab('let DROOMS = null;', '// IDLE FREE') + grab('function dzFloor(', 'function floorEdges(') + grab('function zFloorIdx(', '\nfunction ');
(0, eval)(code + '\nglobalThis.__t = { dungeonRooms, dzFloor, DLAZY, dungeonNormalize };');
const { dungeonRooms, dzFloor, DLAZY, dungeonNormalize } = global.__t;

console.log('dungeon rooms (lazy floors)');
const lazy = dungeonRooms();
const full = JSON.parse(fs.readFileSync(path.join(ROOT, 'Scripts', 'data', 'dungeon_rooms.json'), 'utf8').replace(/^﻿/, '')).map(dungeonNormalize);   // the same normalisation as the bots (DUNGEON_GK, bbox + entrance)
ok(lazy.length === full.length, `same number of dungeons (${lazy.length})`);
ok(DLAZY.loaded === 0, 'no floors read before anything looks inside a dungeon');
const g = dzFloor(lazy, 83473, 148554, -3408);
ok(!g && DLAZY.loaded === 0, 'a lookup outdoors (Giran) reads no floors');
let same = 0, diff = 0;
full.forEach(d => (d.floors || []).forEach(f => (f.rooms || []).forEach(r => {
  const c = r.center || [0, 0, 0]; const a = dzFloor(lazy, c[0], c[1], c[2]), b = dzFloor(full, c[0], c[1], c[2]);
  if ((!a && !b) || (a && b && a.di === b.di && a.fi === b.fi && JSON.stringify(a.f) === JSON.stringify(b.f))) same++; else diff++;
})));
ok(diff === 0 && same > 100, `dzFloor at every room centre: ${same} same, ${diff} different`);
ok(full.every((d, i) => JSON.stringify(lazy[i]) === JSON.stringify(d)), 'every dungeon serialises exactly like the original');
lazy[0].floors = lazy[0].floors.slice(0, 1); ok(lazy[0].floors.length === 1, 'floors can still be replaced (live safe-spot updates)');

console.log('npc levels');
const lv = JSON.parse(fs.readFileSync(path.join(SLIMTMP, 'npc_levels.json'), 'utf8'));
const npcs = JSON.parse(fs.readFileSync(path.join(ROOT, 'Scripts', 'data', 'npcs_h5.json'), 'utf8').replace(/^﻿/, ''));
const want = {}; for (const [k, v] of Object.entries(npcs)) if (/Monster/.test(v.ty || '')) want[k] = v.l;
ok(JSON.stringify(lv) === JSON.stringify(want), `slim npc levels = the monsters of npcs_h5.json (${Object.keys(want).length})`);

console.log('dawn priests');
const pr = JSON.parse(fs.readFileSync(path.join(SLIMTMP, 'dawn_priests.json'), 'utf8'));
const atlas = JSON.parse(fs.readFileSync(path.join(ROOT, 'Scripts', 'data', 'npc_atlas.json'), 'utf8').replace(/^﻿/, ''));
const wp = (atlas.npcs || []).filter(n => (n.roles || []).includes('priest of dawn'));
ok(pr.length === wp.length && pr.every((p, i) => p.x === wp[i].x && p.y === wp[i].y && p.z === wp[i].z), `the same ${wp.length} priests at the same places`);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
