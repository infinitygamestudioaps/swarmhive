// Test of the H5 experience table (2026-10-12): Scripts/data/exp_table.json, its builder docs/plan/tools/exp_table.js and the table use in
// Dashboard/levelEta.js (level size, exp to go, %/h, raw exp -> level).
//   node docs/plan/tools/test_exptable.js
// No server, no game. Reads L2Swarm.Core.dll and Logs/levellock_*.json read-only when they are there (skipped otherwise).
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const ROOT = path.join(__dirname, '..', '..', '..');
const T = require('./exp_table.js');
const LE = require(path.join(ROOT, 'Dashboard', 'levelEta.js'));
let fails = 0, skips = 0;
const ok = (name, cond, info) => { if (!cond) fails++; console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${info != null && info !== '' ? ' - ' + info : ''}`); };
const skip = (name, why) => { skips++; console.log(`  skip ${name} - ${why}`); };
const near = (a, b, tol) => a != null && Math.abs(a - b) <= (tol != null ? tol : Math.abs(b) * 1e-6 + 1e-9);

console.log('--- Scripts/data/exp_table.json');
const J = JSON.parse(fs.readFileSync(T.OUT, 'utf8'));
const tot = T.normTotals(J.total);
ok('totals for levels 1-87', Object.keys(tot).length === 87 && tot[1] === 0 && tot[87] === 21138534249);
ok('85 level rows, max level 85', J.levels.length === 85 && J.maxLevel === 85 && J.levels[84].level === 85);
ok('totals strictly increasing', Object.keys(tot).map(Number).sort((a, b) => a - b).every((k, i, a) => i === 0 || tot[k] > tot[a[i - 1]]));
ok('every row: next = total of the next level, toNext = next - total', J.levels.every(r => r.total === tot[r.level] && r.next === tot[r.level + 1] && r.toNext === r.next - r.total));
// values from the forum post (topic 214) as extracted on 2026-10-12, a spot check independent of the csv
const FORUM = { 2: 68, 10: 48229, 20: 835862, 40: 15422929, 52: 51262490, 61: 146308200, 76: 931275828, 80: 3075966164, 85: 13180481103 };
ok('forum spot values (GUIDE)', Object.keys(FORUM).every(l => tot[l] === FORUM[l]), JSON.stringify(Object.keys(FORUM).filter(l => tot[l] !== FORUM[l])));
ok('level bar 76 = 220,000,006 and 77 = 360,000,000', J.levels[75].toNext === 220000006 && J.levels[76].toNext === 360000000);
ok('level 85 bar ends at datapack row 86 = 16,890,558,728', J.levels[84].next === 16890558728 && J.levels[84].toNext === 3710077625);
ok('checks: forum 85 rows equal', J.checks.forum && J.checks.forum.equal && J.checks.forum.rows === 85, JSON.stringify(J.checks.forum && J.checks.forum.mismatches));
ok('checks: L2Swarm.Core.dll 87 rows equal', J.checks.l2swarm && J.checks.l2swarm.equal && J.checks.l2swarm.rows === 87);
ok('checks: datapack source recorded', J.checks.datapack && J.checks.datapack.rows === 87);
ok('differences + tags documented', Array.isArray(J.differences) && J.differences.length >= 3 && J.tags.GUIDE && J.tags.DATAPACK && J.tags.L2SWARM);

console.log('--- builder (exp_table.js)');
{
  const a = { 1: 0, 2: 68, 3: 363 }, c1 = T.compare(a, { 1: 0, 2: 68 }), c2 = T.compare(a, { 1: 0, 2: 69, 3: 363 });
  ok('compare: scope difference is not a mismatch', c1.mismatches.length === 0 && c1.onlyA.join() === '3');
  ok('compare: a changed value is a mismatch', c2.mismatches.length === 1 && c2.mismatches[0].level === 2);
  const tmp = path.join(require('os').tmpdir(), 'exptable_test_' + process.pid + '.csv');
  fs.writeFileSync(tmp, '1,0\n2,68\n3,"1,168"\nfoo\n85,13180481103\n');
  const f = T.readForum(tmp); fs.unlinkSync(tmp);
  ok('forum csv reader (thousands separators, junk lines)', f && f[1] === 0 && f[2] === 68 && f[85] === 13180481103 && f[3] === 1168 && Object.keys(f).length === 4, JSON.stringify(f));
  // a fake IL blob: ldc.r8 v; ret ... default 0
  const ent = (v) => { const q = Buffer.alloc(10); q[0] = 0x23; q.writeDoubleLE(v, 1); q[9] = 0x2a; return q; };
  const blob = Buffer.concat([Buffer.from([1, 2, 3, 0x45]), ...[0, 68, 363, 1168, 0].map(ent), Buffer.from([0x00, 0x13])]);
  const ftmp = path.join(require('os').tmpdir(), 'exptable_test_' + process.pid + '.bin'); fs.writeFileSync(ftmp, blob);
  const d = T.readDll(ftmp); fs.unlinkSync(ftmp);
  ok('dll reader: switch run 0,68,363,1168 (+ default 0 dropped) -> levels 1-4', d && Object.keys(d).length === 4 && d[1] === 0 && d[4] === 1168, JSON.stringify(d));
  const r = cp.spawnSync(process.execPath, [path.join(__dirname, 'exp_table.js'), '--check'], { encoding: 'utf8' });
  ok('exp_table.js --check: all sources that are present agree (exit 0)', r.status === 0, (r.stdout || '').trim().split('\n').pop());
}
const DLL = path.join(ROOT, 'L2Swarm.Core.dll');
if (fs.existsSync(DLL)) {
  const d = T.readDll(DLL), c = d && T.compare(tot, d);
  ok('live L2Swarm.Core.dll table (what Me.ExpPercent uses) = exp_table.json', c && c.rows === 87 && !c.mismatches.length && !c.onlyA.length, c ? `${c.rows} rows` : 'not found');
} else skip('live L2Swarm.Core.dll', 'file not there');

console.log('--- Dashboard/levelEta.js table');
LE._reset();
ok('EXP_TOTAL copy = exp_table.json (87 levels)', LE.EXP_TOTAL.length === 87 && LE.EXP_TOTAL.every((v, i) => v === tot[i + 1]));
ok('levelSize(36) = 1,215,906 from the table (no learning needed)', LE.levelSize(36) === 1215906 && LE.tableSize(36) === 1215906);
ok('levelSize(85) = 3,710,077,625; levelSize(86) has no next row -> null', LE.levelSize(85) === 3710077625 && LE.tableSize(87) === null);
ok('ptsLeft(36, 40 %) = 60 % of the bar', LE.ptsLeft(36, 40) === Math.round(0.6 * 1215906), LE.ptsLeft(36, 40));
ok('ptsToLevel(36, 40 %, 40) = total(40) - (total(36) + 40 % bar)', LE.ptsToLevel(36, 40, 40) === Math.round(15422929 - (9850166 + 0.4 * 1215906)), LE.ptsToLevel(36, 40, 40));
ok('ptsToLevel to a lower level = 0', LE.ptsToLevel(36, 40, 30) === 0);
// L2Swarm CalculateExpPercents: (Exp - A(Level-1)) * 100 / (A(Level) - A(Level-1)), A(n) = total(n+1)
const calcPct = (exp, lvl) => (exp - tot[lvl]) * 100 / (tot[lvl + 1] - tot[lvl]);
{
  const a = LE.levelOfExp(63907910), b = LE.levelOfExp(63907911), c = LE.levelOfExp(377780), z = LE.levelOfExp(0), top = LE.levelOfExp(2e10);
  ok('levelOfExp(63,907,910) = level 53 at 99.99999 % (a level-locked character one point below 54)', a.level === 53 && a.pct > 99.9999 && a.pct < 100 && near(a.pct, calcPct(63907910, 53)), JSON.stringify(a));
  ok('levelOfExp(63,907,911) = level 54 at 0 %', b.level === 54 && b.pct === 0);
  ok('levelOfExp(377,780) = level 16 (same % as L2Swarm CalculateExpPercents)', c.level === 16 && near(c.pct, calcPct(377780, 16)), JSON.stringify(c));
  ok('levelOfExp(0) = level 1, 0 %', z.level === 1 && z.pct === 0);
  ok('levelOfExp above the cap = 85, capped at 100 %', top.level === 85 && top.pct === 100);
}
const NOW = Date.parse('2026-10-12T12:00:00Z'), MIN = 60000;
const opt = { now: NOW, smooth: false };
LE._reset();
{
  // a level-up 10 min ago inside a 30-min window, nothing learned in this browser yet: before the table this had no hour estimate
  const S37 = 1329143;
  const log = [{ amt: 5000, pct: 0.3762, at: NOW - 10 * MIN, why: 'kill Wolf', lvl: 37, up: 1 }, ...Array.from({ length: 5 }, (_, i) => ({ amt: 6000, pct: 0.4514, at: NOW - (8 - i) * MIN, why: 'kill Wolf', lvl: 37, up: 0 }))];
  const c = { name: 'Tbl1', level: 37, exp: 3, ageSec: 3, expHour: { pct: 1.5, amt: 180000, n: 30, mins: 30 }, expLog: log };
  const e = LE.calc(c, opt);
  ok('level-up inside the hour window: hour source kept (table size)', e.status === 'ok' && e.src === 'hour' && e.size === S37 && e.sizeSrc === 'table', `${e.status} ${e.src} ${e.size}`);
  ok('rate = 360k exp/h / 1,329,143 = 27.09 %/h', near(e.pctH, 360000 / S37 * 100, 1e-6) && e.ptsH === 360000, e.pctH && e.pctH.toFixed(3));
  ok('ETA = 97 % / 27.09 %/h = 3h35', near(e.etaMs / 3600000, 97 / (360000 / S37 * 100), 1e-6), LE.dur(e.etaMs));
  ok('ptsLeft in the result + tooltip shows the raw exp to go', e.ptsLeft === Math.round(0.97 * S37) && /\(1,289,269 of 1,329,143 exp\)/.test(LE.title(e)), LE.title(e).split('\n')[1]);
  ok('hourPct (net, for the chips / character page) = points / level size', near(LE.hourPct(c), 360000 / S37 * 100, 1e-6) && LE.hourPct({ level: 37, expHour: { amt: 1, mins: 2 } }) === null);
  ok('hourPct counts deaths (net): -24,320 in 30 min at 36 = -4.0 %/h', near(LE.hourPct({ level: 36, expHour: { amt: -24320, pct: -2, mins: 30, n: 0 } }), -24320 / 1215906 * 200, 1e-6));
}
{
  LE.CFG.useTable = false; LE._reset();
  const e = LE.calc({ name: 'Tbl2', level: 36, exp: 40, ageSec: 3, expHour: { pct: 5, amt: 60000, n: 100, mins: 30 }, expLog: [] }, opt);
  ok('useTable=false: back to the learned size (none yet -> % sum, 10 %/h)', e.status === 'ok' && near(e.pctH, 10) && e.sizeSrc === '', `${e.pctH} ${e.sizeSrc}`);
  LE.CFG.useTable = true; LE._reset();
}

console.log('--- live data (read-only)');
const LOGS = path.join(ROOT, 'Logs');
let files = []; try { files = fs.readdirSync(LOGS).filter(f => /^levellock_.+\.json$/.test(f)); } catch (e) { }
if (files.length) {
  const bad = [];
  let n = 0;
  files.forEach(f => {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(LOGS, f), 'utf8').replace(/^﻿/, ''));
      if (!(j.level > 0) || !(Number(j.exp) >= 0)) return;
      n++;
      const r = LE.levelOfExp(Number(j.exp));
      if (r.level !== j.level) bad.push(`${j.name}: level ${j.level}, exp ${j.exp} -> table level ${r.level}`);
    } catch (e) { }
  });
  ok(`Logs/levellock_*.json: every character's raw exp (Me.Exp) falls inside its level in the table (${n} characters)`, n > 0 && !bad.length, bad.slice(0, 3).join('; '));
} else skip('Logs/levellock_*.json', 'no files');

console.log(fails ? `${fails} FAILED` : `ALL OK${skips ? ` (${skips} skipped)` : ''}`);
process.exit(fails ? 1 : 0);
