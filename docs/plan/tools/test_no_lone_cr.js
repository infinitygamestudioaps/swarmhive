// LONECR 2026-10-26 (tester Vykaax: Windows Script Host 'Loading script "...\docs\plan\tools<CR>un_hidden_ps.vbs" failed (The filename, directory
// name, or volume label syntax is incorrect)' every 3 min): an edit had turned the text "\r" of "$PSScriptRoot\run_hidden_ps.vbs" in
// pc_alwayson.ps1 into a real carriage return, so the "L2Swarm Dashboard" task was registered with a broken path.
// This test fails on any carriage return that is not part of a CRLF line end in the scripts / pages we ship.
//   node docs/plan/tools/test_no_lone_cr.js
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const SKIP = /^(node_modules|vendor|icons|maptiles|minitiles|\.git|mobile_check)$/;
const hits = [];
function scan(p) {
  let st; try { st = fs.statSync(p); } catch (e) { return; }
  if (st.isDirectory()) { for (const f of fs.readdirSync(p)) if (!SKIP.test(f)) scan(path.join(p, f)); return; }
  if (!/\.(ps1|js|mjs|cmd|vbs|html|css)$/i.test(p)) return;
  const t = fs.readFileSync(p, 'latin1'), m = t.match(/\r(?!\n)/g);
  if (m) { const i = t.search(/\r(?!\n)/); hits.push(`${path.relative(ROOT, p)}: ${m.length} lone CR, line ${t.slice(0, i).split('\n').length}`); }
}
['SETUP.ps1', 'SETUP.cmd', 'SETUP_PC_ALWAYS_ON.cmd', 'docs/plan/tools', 'Dashboard', 'Scripts_dev'].forEach(x => scan(path.join(ROOT, x)));
hits.forEach(h => console.log('  FAIL ' + h));
console.log(`test_no_lone_cr: ${hits.length ? hits.length + ' file(s) with a stray carriage return' : 'ALL OK'}`);
process.exit(hits.length ? 1 : 0);
