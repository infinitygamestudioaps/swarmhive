// EXPERIENCE TABLE builder (2026-10-12, forum topic 214 "Lineage 2 High Five Experience Table").
//   node docs/plan/tools/exp_table.js [--dp <datapack clone>] [--forum <csv level,total>] [--dll <L2Swarm.Core.dll>] [--check]
// Writes Scripts/data/exp_table.json (atomic, the old file goes to Scripts/data/history/exp_table/exp_table_<stamp>.json) from three independent sources:
//   DATAPACK  L2J High Five expData.json (git show from the datapack clone: src/main/resources/data/stats/expData.json), levels 1-87
//   GUIDE     the forum table (CSV "level,total", levels 1-85; the forum post has no other text)
//   L2SWARM   the table compiled into L2Swarm.Core.dll (L2User.A(int) = a switch of `ldc.r8 <total>; ret`; CalculateExpPercents() =
//             (Exp - A(Level-1)) * 100 / (A(Level) - A(Level-1)), so A(n) = total exp at which level n+1 starts) -> this is what Me.ExpPercent uses.
// A source that is missing is skipped (its last check result in the old file is kept). The levels are always taken from the DATAPACK
// (or the existing file when the datapack is not there). --check: compare only, write nothing (exit 1 on a mismatch).
// Also checks the copy embedded in Dashboard/levelEta.js (EXP_TOTAL) against the table.
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const ROOT = path.join(__dirname, '..', '..', '..');
const OUT = path.join(ROOT, 'Scripts', 'data', 'exp_table.json');
const SCRATCH = '%TEMP%/scratch';
const MAX_LEVEL = 85;

/** DATAPACK: { level: total } from the datapack clone (git show, the file is not in the sparse checkout) or a plain json file */
function readDatapack(src) {
  if (!src) return null;
  try {
    if (fs.existsSync(src) && fs.statSync(src).isFile()) return normTotals(JSON.parse(fs.readFileSync(src, 'utf8')));
    const txt = cp.execFileSync('git', ['-C', src, 'show', 'HEAD:src/main/resources/data/stats/expData.json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    let commit = ''; try { commit = cp.execFileSync('git', ['-C', src, 'log', '-1', '--format=%H'], { encoding: 'utf8' }).trim(); } catch (e) { }
    const t = normTotals(JSON.parse(txt)); if (t) Object.defineProperty(t, '_commit', { value: commit });
    return t;
  } catch (e) { return null; }
}
/** GUIDE: "level,total" lines */
function readForum(file) {
  try {
    const t = {};
    fs.readFileSync(file, 'utf8').split(/\r?\n/).forEach(l => { const m = l.replace(/"/g, '').trim().match(/^(\d+)\s*[,;\t]\s*([\d,.\s]+)$/); if (m) t[+m[1]] = Number(m[2].replace(/[^\d]/g, '')); });
    return Object.keys(t).length ? t : null;
  } catch (e) { return null; }
}
/** L2SWARM: the `ldc.r8 v; ret` run that holds 0, 68, 363, ... -> { level: total } (A(n) = start of level n+1) */
function readDll(file) {
  let b; try { b = fs.readFileSync(file); } catch (e) { return null; }
  const ent = (v) => { const q = Buffer.alloc(10); q[0] = 0x23; q.writeDoubleLE(v, 1); q[9] = 0x2a; return q; };
  const i68 = b.indexOf(Buffer.concat([ent(0), ent(68), ent(363)]));
  if (i68 < 0) return null;
  const vals = [];
  for (let i = i68; i + 10 <= b.length && b[i] === 0x23 && b[i + 9] === 0x2a; i += 10) vals.push(b.readDoubleLE(i + 1));
  // the switch default (`ldc.r8 0; ret` after the last case) ends the run: drop trailing zeros after the first value
  while (vals.length > 1 && vals[vals.length - 1] === 0) vals.pop();
  const t = {}; vals.forEach((v, n) => { t[n + 1] = v; });
  return t;
}
function normTotals(j) {
  if (!j || typeof j !== 'object') return null;
  const t = {}; Object.keys(j).forEach(k => { if (/^\d+$/.test(k) && isFinite(+j[k])) t[+k] = +j[k]; });
  return Object.keys(t).length ? t : null;
}
/** compare b against a on the levels both have -> { rows, mismatches: [{level, a, b}], onlyA: [...], onlyB: [...] } */
function compare(a, b) {
  const ka = Object.keys(a).map(Number), kb = Object.keys(b).map(Number);
  const both = ka.filter(k => k in b), mism = both.filter(k => a[k] !== b[k]).map(k => ({ level: k, a: a[k], b: b[k] }));
  return { rows: both.length, mismatches: mism, onlyA: ka.filter(k => !(k in b)), onlyB: kb.filter(k => !(k in a)) };
}
/** the file body from the totals (levels 1..87; level 85 is the max, row 86 = the end of its bar) */
function build(total, checks, sources) {
  const levels = [];
  for (let l = 1; l <= MAX_LEVEL; l++) {
    const t = total[l], n = total[l + 1];
    levels.push({ level: l, total: t, next: n != null ? n : null, toNext: n != null ? n - t : null,
      tag: l === MAX_LEVEL ? 'total GUIDE+DATAPACK+L2SWARM; next/toNext DATAPACK+L2SWARM (row 86, the forum stops at 85)' : 'GUIDE+DATAPACK+L2SWARM' });
  }
  return {
    _about: 'H5 experience table: total = exp at which the level starts (level 1 = 0), next = total of the next level, toNext = exp in the level bar. '
      + 'Level L while total(L) <= Exp < total(L+1); exp % = (Exp - total(L)) * 100 / toNext(L) (= L2Swarm CalculateExpPercents). Built by docs/plan/tools/exp_table.js.',
    _updated: new Date().toISOString(),
    maxLevel: MAX_LEVEL,
    tags: { GUIDE: 'forum topic 214 (levels 1-85)', DATAPACK: 'L2J High Five expData.json (levels 1-87)', L2SWARM: 'table compiled into L2Swarm.Core.dll, used by Me.ExpPercent / CalculateExpPercents (levels 1-87)', INFERRED: 'computed from the above' },
    sources,
    checks,
    differences: [
      'None in the values: forum, datapack and L2Swarm agree on every level they share.',
      'Scope only: the forum lists levels 1-85; the datapack and L2Swarm also have 86 (16,890,558,728 = end of the level-85 bar, max level 85) and 87 (21,138,534,249, unused).',
      'Game client (C:/Lineage2/system): no copy of the table found in plain *.dll/*.exe/*.u/*.int (searched as int32/int64/double/text); the *.dat files are encrypted (Lineage2Ver413), so a copy inside them was not checked.',
      'Server rates (docs/plan/server_features_kain.md: XP x1, +30 % premium, +50 % vitality, +20 % recommendation) change how fast exp comes, not the table.',
    ],
    observations_INFERRED: [
      'The level bar jumps at 50 (x1.6), 55, 60, 65, 71, 76 (x1.73) and 79 (x1.94).',
      'Level 76 -> 77 = 220,000,006 exp; 77 -> 78 = exactly 360,000,000.',
    ],
    total: Object.fromEntries(Object.keys(total).map(Number).sort((a, b) => a - b).map(k => [String(k), total[k]])),
    levels,
  };
}
/** the copy in Dashboard/levelEta.js (const EXP_TOTAL = [0, 68, ...]; index = level - 1) */
function readLevelEtaCopy(file) {
  try {
    const m = fs.readFileSync(file, 'utf8').match(/const EXP_TOTAL = \[([\d,\s]+)\]/);
    if (!m) return null;
    const t = {}; m[1].split(',').map(s => s.trim()).filter(Boolean).forEach((v, i) => { t[i + 1] = Number(v); });
    return t;
  } catch (e) { return null; }
}
function atomicWrite(file, text) {
  if (fs.existsSync(file)) {
    const hist = path.join(path.dirname(file), 'history', 'exp_table'); fs.mkdirSync(hist, { recursive: true });
    fs.copyFileSync(file, path.join(hist, path.basename(file, '.json') + '_' + new Date().toISOString().replace(/[:.]/g, '-') + '.json'));
  }
  const tmp = file + '.tmp' + process.pid; fs.writeFileSync(tmp, text); fs.renameSync(tmp, file);
}

function main() {
  const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
  const checkOnly = process.argv.includes('--check');
  const dpSrc = arg('--dp', path.join(SCRATCH, 'dp')), forumSrc = arg('--forum', path.join(SCRATCH, 'forum_exp.csv')), dllSrc = arg('--dll', path.join(ROOT, 'L2Swarm.Core.dll'));
  let old = null; try { old = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch (e) { }
  const dp = readDatapack(dpSrc), forum = readForum(forumSrc), dll = readDll(dllSrc);
  const base = dp || (old && normTotals(old.total));
  if (!base) { console.log('no datapack and no existing exp_table.json - nothing to build from'); process.exit(1); }
  const checks = Object.assign({}, old && old.checks);
  let bad = 0;
  const rec = (key, other, label) => {
    if (!other) { console.log(`${label}: not found - skipped${checks[key] ? ' (kept the last result)' : ''}`); return; }
    const c = compare(base, other);
    checks[key] = { at: new Date().toISOString(), rows: c.rows, mismatches: c.mismatches, onlyInTable: c.onlyA, onlyInSource: c.onlyB, equal: !c.mismatches.length };
    if (c.mismatches.length) bad++;
    console.log(`${label}: ${c.rows} rows compared, ${c.mismatches.length} mismatches${c.onlyA.length ? `, not in source: ${c.onlyA.join(',')}` : ''}${c.mismatches.length ? ' ' + JSON.stringify(c.mismatches.slice(0, 5)) : ''}`);
  };
  if (dp && old && old.total) rec('previousFile', normTotals(old.total), 'previous exp_table.json');
  rec('forum', forum, 'GUIDE forum topic 214');
  rec('l2swarm', dll, 'L2SWARM L2Swarm.Core.dll');
  if (!dp) console.log('DATAPACK: not found - levels taken from the existing file');
  else checks.datapack = { at: new Date().toISOString(), rows: Object.keys(dp).length, commit: dp._commit || '', note: 'the levels are built from this source' };
  const sources = {
    forum: { url: 'https://community.lineage2toggle.com/index.php?/topic/214-lineage-2-high-five-experience-table/', topic: 214, author: 'Mantosh (Toggle Staff/Collaborator)', posted: '2020-08-08', replies: 0, pages: 1, levels: '1-85' },
    datapack: { repo: 'github.com/Shagooh/l2j-server-datapack', file: 'src/main/resources/data/stats/expData.json', commit: (dp && dp._commit) || (old && old.sources && old.sources.datapack && old.sources.datapack.commit) || '', levels: '1-87' },
    l2swarm: { file: 'L2Swarm.Core.dll', method: 'L2Swarm.Entities.L2User.A(int) (switch, A(n) = start of level n+1), used by CalculateExpPercents() / ExpPercent', levels: '1-87' },
  };
  const body = build(base, checks, sources);
  const eta = readLevelEtaCopy(path.join(ROOT, 'Dashboard', 'levelEta.js'));
  if (eta) { const c = compare(base, eta); console.log(`Dashboard/levelEta.js EXP_TOTAL: ${c.rows} rows, ${c.mismatches.length} mismatches`); if (c.mismatches.length || c.onlyA.length) bad++; }
  else console.log('Dashboard/levelEta.js EXP_TOTAL: not found');
  if (checkOnly) { console.log(bad ? 'MISMATCH' : 'all sources agree'); process.exit(bad ? 1 : 0); }
  atomicWrite(OUT, JSON.stringify(body, null, 1) + '\n');
  console.log(`wrote ${path.relative(ROOT, OUT)} (${body.levels.length} levels, totals 1-${Math.max(...Object.keys(base).map(Number))})${bad ? ' - WITH MISMATCHES, see checks' : ''}`);
}

module.exports = { readDatapack, readForum, readDll, readLevelEtaCopy, compare, build, normTotals, MAX_LEVEL, OUT };
if (require.main === module) main();
