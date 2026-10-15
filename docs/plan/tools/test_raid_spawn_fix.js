// RAIDSPAWN (2026-10-15): raid boss positions = owner fix (Scripts/data/raid_spawn_fix.json) > seen by a character (Logs/raid_seen_pos.json) > datapack.
// Archon Suscepter: the datapack puts it on Cruma floor 1, it lives on floor 2 -> every visit ended "not at its spawn — it is dead".
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const src = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL ' + m); } };
const a = src.indexOf('function raidSpawnPick'), b = src.indexOf('// every character: a live raid boss far');
ok(a > 0 && b > a, 'RAIDSPAWN block found');
let fix = { '25395': { x: 23000, y: 110000, z: -9044 } }, seen = { '1': { x: 5, y: 6, z: 7 }, '25395': { x: 1, y: 1, z: 1 } };
const stub = (p) => ({ j: /spawn_fix/.test(p) ? fix : /seen_pos/.test(p) ? seen : {} });
const f = new Function('readJsonHeal', '__SCRIPTS__', 'SWARM_ROOT', src.slice(a, b) + ';return { raidSpawnApply };')(stub, 'S', 'R');
const L = [{ id: 25395, x: 15000, y: 119000, z: -11900 }, { id: 1, x: 0, y: 0, z: 0 }, { id: 2, x: 9, y: 9, z: 9 }];
f.raidSpawnApply(L);
ok(L[0].x === 23000 && L[0].z === -9044 && L[0].posSrc === 'owner', 'the owner fix wins over a sighting');
ok(L[1].x === 5 && L[1].posSrc === 'seen', 'a sighting beats the datapack');
ok(L[2].x === 9 && L[2].posSrc === '', 'no fix, no sighting: the datapack spot');
fix = {}; f.raidSpawnApply(L);
ok(L[0].x === 1 && L[0].posSrc === 'seen', 'owner fix removed: the sighting');
seen = {}; f.raidSpawnApply(L);
ok(L[0].x === 15000 && L[0].z === -11900 && L[0].posSrc === '' && L[1].x === 0, 'both removed: back to the datapack spot (kept in dataPos)');
ok(/raidSpawnApply\(raidDbCache\)/.test(src), 'raidDb() applies the fixes (re-read every 60 s)');
ok(/raid_seen_pos/.test(src) && /isRaidBossMob\(m\)/.test(src.slice(b, b + 800)), 'every character records a raid boss seen far from its known spot');
console.log(`raid spawn fix: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
