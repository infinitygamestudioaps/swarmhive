// HEAP SNAPSHOT DIFF (LEAK-2026-10-15): compares two V8 .heapsnapshot files (v8.writeHeapSnapshot: the brain heap probe, test_brain_leak.js
// --snap, or Chrome DevTools) by constructor / node type: count and self size per group, biggest growth first. No dependencies.
// Usage: node --max-old-space-size=8192 docs/plan/tools/heap_diff.js <before.heapsnapshot> <after.heapsnapshot> [--top 40] [--json out.json]
//        node docs/plan/tools/heap_diff.js <one.heapsnapshot>          (summary of one snapshot)
'use strict';
const fs = require('fs');

/** -> Map(key -> { n, size }) ; key = "<type>:<name>" (objects by constructor name, closures by function name, strings / arrays / code by type) */
function groups(file) {
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  const meta = j.snapshot.meta, F = meta.node_fields, NF = F.length, types = meta.node_types[0];
  const iT = F.indexOf('type'), iN = F.indexOf('name'), iS = F.indexOf('self_size');
  const nodes = j.nodes, strings = j.strings, out = new Map();
  for (let i = 0; i < nodes.length; i += NF) {
    const type = types[nodes[i + iT]], size = nodes[i + iS];
    let name;
    if (type === 'object' || type === 'closure' || type === 'native') name = strings[nodes[i + iN]];
    else if (type === 'hidden' || type === 'synthetic') name = String(strings[nodes[i + iN]]).replace(/\d+/g, '#').slice(0, 60);
    else name = '';
    const k = type + ':' + String(name).slice(0, 80);
    const g = out.get(k); if (g) { g.n++; g.size += size; } else out.set(k, { n: 1, size });
  }
  return out;
}
const top = Number(process.argv.includes('--top') ? process.argv[process.argv.indexOf('--top') + 1] : 40);
const files = process.argv.slice(2).filter(a => !a.startsWith('--') && !/^\d+$/.test(a) && !/\.json$/.test(a));
if (!files.length) { console.log('usage: heap_diff.js <before.heapsnapshot> [<after.heapsnapshot>] [--top 40] [--json out.json]'); process.exit(1); }
const kb = (b) => (b / 1024).toFixed(0) + ' KB';
const A = groups(files[0]);
if (files.length === 1) {
  const rows = Array.from(A.entries()).sort((a, b) => b[1].size - a[1].size).slice(0, top);
  rows.forEach(([k, g]) => console.log(`${kb(g.size).padStart(10)} ${String(g.n).padStart(8)}  ${k}`));
  process.exit(0);
}
const B = groups(files[1]);
const keys = new Set([...A.keys(), ...B.keys()]);
const rows = Array.from(keys).map(k => { const a = A.get(k) || { n: 0, size: 0 }, b = B.get(k) || { n: 0, size: 0 }; return { k, dn: b.n - a.n, ds: b.size - a.size, n: b.n, size: b.size }; });
const tot = (M) => Array.from(M.values()).reduce((s, g) => s + g.size, 0);
console.log(`total self size: ${kb(tot(A))} -> ${kb(tot(B))} (${kb(tot(B) - tot(A))})`);
console.log('by growth of self size:');
rows.sort((a, b) => b.ds - a.ds).slice(0, top).forEach(r => console.log(`${('+' + kb(r.ds)).padStart(11)} ${('+' + r.dn).padStart(9)}  (${r.n} now)  ${r.k}`));
console.log('by growth of count:');
rows.sort((a, b) => b.dn - a.dn).slice(0, Math.min(20, top)).forEach(r => console.log(`${('+' + r.dn).padStart(9)} ${('+' + kb(r.ds)).padStart(11)}  (${r.n} now)  ${r.k}`));
if (process.argv.includes('--json')) fs.writeFileSync(process.argv[process.argv.indexOf('--json') + 1], JSON.stringify(rows.sort((a, b) => b.ds - a.ds).slice(0, 500), null, 1));
