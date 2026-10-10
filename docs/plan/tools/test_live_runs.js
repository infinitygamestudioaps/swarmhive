// LIVE PER PARTY 2026-10-09: Dashboard/live_runs.js reads every party's Logs/kamaloka_live_<leader>.json / raid_live_<leader>.json
// (+ the old shared file) and never flips the default between parties. Sandbox dir only, never the real Logs.
// Run: node docs/plan/tools/test_live_runs.js
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const LR = require('../../../Dashboard/live_runs');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'liveruns-'));
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
let pass = 0, fail = 0;
const ok = (name, c, info) => { if (c) pass++; else fail++; console.log((c ? '  ok   ' : '  FAIL ') + name + (c ? '' : '  ' + (info || ''))); };
const iso = (ms) => new Date(ms).toISOString(), now = Date.now();
const w = (n, o) => fs.writeFileSync(path.join(dir, n), JSON.stringify(o));
w('kamaloka_live_Destroyer3.json', { leader: 'Destroyer3', id: 'kamaloka-36', name: 'Hall 36', phase: 'fighting', startedMs: now - 300000, updatedAt: iso(now - 2000), party: [{ name: 'Destroyer3' }, { name: 'X', dead: true }], loot: [{ who: 'Destroyer3', id: 57, name: 'Adena', count: 5 }] });
w('kamaloka_live_Tank2.json', { leader: 'Tank2', id: 'kamaloka-26', name: 'Hall 26', phase: 'inside', startedMs: now - 100000, updatedAt: iso(now - 1000), party: [{ name: 'Tank2' }] });
w('kamaloka_live_Old.json', { leader: 'Old', id: 'kamaloka-23', phase: 'done', startedMs: now - 9e6, endedMs: now - 8e6, updatedAt: iso(now - 8e6), party: [] });
w('kamaloka_live.json', { leader: 'Destroyer3', id: 'kamaloka-33', phase: 'fighting', startedMs: now - 9e5, updatedAt: iso(now - 600000) });   // the old shared file, older
w('raid_live_Tank1.json', { leader: 'Tank1', boss: { name: 'Turek', hp: 40 }, startedMs: now - 60000, updatedAt: iso(now - 1000), party: [{ name: 'Tank1' }] });
w('raid_live_Destroyer3.json', { leader: 'Destroyer3', boss: { name: 'Kutus', hp: 90 }, startedMs: now - 30000, updatedAt: iso(now - 1000), party: [] });

const runs = LR.readRuns(dir, 'kamaloka_live', readJson);
ok('one run per leader (newest file wins over the old shared one)', runs.length === 3 && runs.find(r => r.leader === 'Destroyer3').d.id === 'kamaloka-36', JSON.stringify(runs.map(r => [r.leader, r.d.id])));
const all = LR.live(dir, 'kamaloka_live', 'kama', readJson, '', now);
ok('runs[] lists both running parties (stale one left out)', all.runs.length === 2 && all.runs.every(r => r.running), JSON.stringify(all.runs.map(r => r.leader)));
ok('default = the OLDEST running run (stable, no jumping)', all.leader === 'Destroyer3' && all.id === 'kamaloka-36', all.leader);
for (let i = 0; i < 5; i++) { w('kamaloka_live_Tank2.json', { leader: 'Tank2', id: 'kamaloka-26', phase: 'inside', startedMs: now - 100000, updatedAt: iso(now - i * 10), party: [] }); }
ok('a newer write by another party does not change the default', LR.live(dir, 'kamaloka_live', 'kama', readJson, '', now).leader === 'Destroyer3');
const v = LR.live(dir, 'kamaloka_live', 'kama', readJson, 'Tank2', now);
ok('?leader=Tank2 gives that party\'s own run', v.leader === 'Tank2' && v.id === 'kamaloka-26' && v.running && v.forLeader === 'Tank2');
const none = LR.live(dir, 'kamaloka_live', 'kama', readJson, 'Nobody', now);
ok('an unknown leader = not running, runs[] still listed', !none.running && none.runs.length === 2);
const g = all.runs.find(r => r.leader === 'Destroyer3');
ok('summary carries alive/size/loot', g.alive === 1 && g.size === 2 && g.loot.length === 1, JSON.stringify(g));
const rd = LR.live(dir, 'raid_live', 'raid', readJson, '', now);
ok('raids: two parties listed, default = the oldest (Tank1)', rd.runs.length === 2 && rd.leader === 'Tank1' && rd.boss.name === 'Turek');
ok('raids: ?leader=Destroyer3 gives Kutus', LR.live(dir, 'raid_live', 'raid', readJson, 'Destroyer3', now).boss.name === 'Kutus');
// finished runs stay listed 15 min
w('kamaloka_live_Tank2.json', { leader: 'Tank2', id: 'kamaloka-26', phase: 'done', result: 'cleared', startedMs: now - 100000, endedMs: now - 5000, updatedAt: iso(now - 5000), party: [] });
const f = LR.live(dir, 'kamaloka_live', 'kama', readJson, '', now);
ok('a finished run stays listed (finished) and the running one stays the default', f.leader === 'Destroyer3' && f.runs.some(r => r.leader === 'Tank2' && r.finished && !r.running));
ok('fileOf strips odd characters', path.basename(LR.fileOf(dir, 'kamaloka_live', 'Ab c/de')) === 'kamaloka_live_Abcde.json');
fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
