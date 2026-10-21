// REQUIREMENTS GUARDRAIL (owner 2026-10-20: "make sure the system uses the guardrails"). Runs the tests of every requirement in
// docs/requirements/index.json and fails when one fails, or when a requirement file has no entry or no tests.
//   node docs/plan/tools/requirements_check.js     (exit 0 = every requirement holds, 1 = a requirement is broken / not guarded)
// deploy_swarm.ps1 runs this before EVERY deploy (also with -Force): a broken requirement never reaches the bots.
'use strict';
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..', '..', '..');
const DIR = path.join(ROOT, 'docs', 'requirements');
const problems = [];
let idx = null;
try { idx = JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'), 'utf8')); } catch (e) { console.log('FAIL docs/requirements/index.json unreadable: ' + e.message); process.exit(1); }
const reqs = Array.isArray(idx.requirements) ? idx.requirements : [];
// every requirement file is registered, every registered file exists and has at least one test
const mds = fs.readdirSync(DIR).filter(f => /\.md$/i.test(f) && !/^readme\.md$/i.test(f));
mds.forEach(f => { if (!reqs.some(r => r.file === f)) problems.push(`${f} is not in index.json (a requirement nobody checks)`); });
reqs.forEach(r => {
  if (!fs.existsSync(path.join(DIR, r.file))) problems.push(`index.json lists ${r.file}, which does not exist`);
  if (!Array.isArray(r.tests) || !r.tests.length) problems.push(`${r.file} has no tests`);
});
// run each test once (several requirements may share one)
const tests = [...new Set(reqs.flatMap(r => r.tests || []))];
const result = {};
for (const t of tests) {
  const f = path.join(ROOT, t);
  if (!fs.existsSync(f)) { result[t] = 'missing'; continue; }
  const t0 = Date.now();
  let p = spawnSync(process.execPath, [f], { cwd: ROOT, encoding: 'utf8', timeout: 300000 });
  if (p.status !== 0) p = spawnSync(process.execPath, [f], { cwd: ROOT, encoding: 'utf8', timeout: 300000 });   // one re-run: timing-sensitive suites flake on a busy PC (publish.ps1 does the same)
  result[t] = p.status === 0 ? 'ok' : 'FAIL';
  const fails = String(p.stdout || '').split(/\r?\n/).filter(l => /^FAIL/.test(l)).slice(0, 5);
  console.log(`${result[t] === 'ok' ? 'ok  ' : 'FAIL'} ${t} (${Math.round((Date.now() - t0) / 1000)} s)${fails.length ? '\n       ' + fails.join('\n       ') : ''}`);
}
reqs.forEach(r => { const bad = (r.tests || []).filter(t => result[t] !== 'ok'); if (bad.length) problems.push(`${r.file} (${r.title || ''}) is BROKEN: ${bad.map(t => `${path.basename(t)} ${result[t]}`).join(', ')}`); });
if (problems.length) { console.log('\nREQUIREMENTS NOT MET:\n  ' + problems.join('\n  ')); process.exit(1); }
console.log(`\nALL REQUIREMENTS HOLD (${reqs.length} file${reqs.length === 1 ? '' : 's'}, ${tests.length} tests)`);
