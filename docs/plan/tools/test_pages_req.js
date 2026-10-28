// PAGEREQ-2026-10-28 (owner: "Lav kravspecifikationer for hver side som du skal overholde"): every dashboard page has a requirement
// section in docs/requirements/pages.md. This guard fails when a page route has no section, a section misses its parts, or names a
// page file that does not exist.   node docs/plan/tools/test_pages_req.js
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const MDF = path.join(ROOT, 'docs', 'requirements', 'pages.md');
if (!fs.existsSync(MDF)) { console.log('skipped: needs docs/requirements/pages.md (the public package ships without docs/requirements)'); process.exit(0); }
const html = fs.readFileSync(path.join(ROOT, 'Dashboard', 'index.html'), 'utf8');
const md = fs.readFileSync(MDF, 'utf8');
let ok = 0, fail = 0;
const t = (good, msg) => { if (good) { ok++; console.log('ok   ' + msg); } else { fail++; console.log('FAIL ' + msg); } };

// the routes the router knows: the comments "#/<kind>" in route() + kind === '<kind>' branches
const body = (() => { const i = html.indexOf('function route()'); return i < 0 ? '' : html.slice(i, i + 12000); })();
t(!!body, 'index.html has the route() function');
const kinds = new Set();
(body.match(/#\/[a-z0-9]+/g) || []).forEach(k => kinds.add(k.slice(2)));
(body.match(/kind === '([a-z0-9]+)'/g) || []).forEach(k => kinds.add(k.replace(/kind === '|'/g, '')));
t(kinds.size >= 30, `the router lists ${kinds.size} page routes`);

// the sections: "## #/<kind>..." headings (one heading may name several routes)
const secs = md.split(/\n(?=## )/).filter(s => s.startsWith('## ') && !s.startsWith('## Global rules'));
t(/## Global rules/.test(md) && /\*\*G1\./.test(md), 'pages.md has the global rules (G1 ...)');
const covered = new Set();
secs.forEach(s => { const head = s.split('\n')[0]; (head.match(/#\/[a-z0-9]+/g) || []).forEach(k => covered.add(k.slice(2))); });
[...kinds].sort().forEach(k => t(covered.has(k), `#/${k} has a requirement section in pages.md`));

secs.forEach(s => {
  const head = s.split('\n')[0].slice(3).trim();
  t(/\*\*Purpose:\*\*/.test(s), `${head.slice(0, 60)}: Purpose`);
  t(/\*\*Must show:\*\*/.test(s), `${head.slice(0, 60)}: Must show`);
  t(/\*\*Must do/.test(s), `${head.slice(0, 60)}: Must do / must never do`);
  (head.match(/Dashboard\/[A-Za-z0-9_.]+\.(?:js|html)/g) || []).forEach(f => t(fs.existsSync(path.join(ROOT, f)), `${f} exists`));
});
console.log(`\n${ok} ok, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
