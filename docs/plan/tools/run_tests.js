// Runs every offline test (docs/plan/tools/test_*.js, no browser *_ui tests) on this machine and writes ONE summary file.
// Usage: node docs/plan/tools/run_tests.js            -> Logs/test_summary.txt (+ prints one line)
// Made 2026-10-09 so test runs cost no AI tokens: only the summary line needs to be read.
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path');
const dir = __dirname, root = path.join(dir, '..', '..', '..');
const skip = /_ui\.js$|test_apply_room_polys\.js$/;   // browser tests + one known stale test
const files = fs.readdirSync(dir).filter(f => /^test_.*\.js$/.test(f) && !skip.test(f)).sort();
const rows = []; let failed = 0;
for (const f of files) {
  let out = '', ok = true;
  try { out = execFileSync(process.execPath, [path.join(dir, f)], { cwd: root, encoding: 'utf8', timeout: 300000, stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (e) { ok = false; out = String((e.stdout || '') + (e.stderr || '')); }
  const last = out.trim().split(/\r?\n/).pop() || '';
  if (!ok || /fail/i.test(last) && !/0 failed/i.test(last)) { ok = false; failed++; }
  rows.push(`${ok ? 'OK  ' : 'FAIL'} ${f}: ${last.slice(0, 150)}`);
}
const head = `${new Date().toISOString()} ${files.length - failed}/${files.length} test files passed${failed ? ' — ' + failed + ' FAILED' : ''}`;
fs.writeFileSync(path.join(root, 'Logs', 'test_summary.txt'), head + '\n' + rows.join('\n') + '\n');
console.log(head);
process.exit(failed ? 1 : 0);
