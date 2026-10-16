// Checks that every name in Scripts/data/gear_doctrine.json is a real item / armor set in Dashboard/data/gear_catalog.json.
//   node docs/plan/tools/gear_doctrine_check.js        exit 1 + the list when something does not resolve
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const C = JSON.parse(fs.readFileSync(path.join(ROOT, 'Dashboard', 'data', 'gear_catalog.json'), 'utf8'));
const D = JSON.parse(fs.readFileSync(path.join(ROOT, 'Scripts', 'data', 'gear_doctrine.json'), 'utf8'));
const { resolveName } = require(path.join(ROOT, 'Dashboard', 'gear_doctrine.js'));
const miss = [];
const chk = (n, slot, where) => { if (!resolveName(C, n, slot)) miss.push(`${where}: ${n} (${slot})`); };
Object.entries(D.weapons).forEach(([line, G]) => { if (line[0] === '_') return; Object.entries(G).forEach(([g, r]) => { if (!r || g[0] === '_') return; (r.w || []).forEach(n => chk(n, 'weapon', line + ' ' + g)); (r.sigil || []).forEach(n => chk(n, 'shield', line + ' ' + g + ' sigil')); }); });
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9*]/g, '');
const chests = new Set(C.sets.map(s => norm(s.name)));
Object.entries(D.armor).forEach(([col, G]) => { if (col[0] === '_') return; Object.entries(G).forEach(([g, L]) => (L || []).forEach(n => { if (!chests.has(norm(n))) miss.push(`armor ${col} ${g}: set ${n}`); })); });
['jewelry', 'epics'].forEach(k => Object.entries(D[k]).forEach(([g, S]) => { if (g[0] === '_') return; Object.entries(S).forEach(([s, L]) => L.forEach(n => chk(n, s, k + ' ' + g))); }));
console.log(`gear doctrine: ${miss.length} name(s) not found in the catalog`);
miss.forEach(m => console.log('  ' + m));
process.exit(miss.length ? 1 : 0);
