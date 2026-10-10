// CLASS PLANS (2026-10-10): copies the CLASSPLAN-PURE block (the class-change gate) from Scripts_dev/swarm.js into Dashboard/classlogic.js,
// so the dashboard decides "missing / needs approval / ready <class>" with exactly the code the bots use.
// Run after every change of the block in swarm.js:   node docs/plan/tools/class_logic_sync.js   (--check: only compare, exit 1 when different)
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const SRC = path.join(ROOT, 'Scripts_dev', 'swarm.js'), OUT = path.join(ROOT, 'Dashboard', 'classlogic.js');
const B0 = '// CLASSPLAN-PURE-BEGIN', B1 = '// CLASSPLAN-PURE-END';
function block(s) { const a = s.indexOf(B0), b = s.indexOf(B1); return a >= 0 && b > a ? s.slice(a, b + B1.length) + '\n' : null; }
const HEAD = `// CLASS PLAN LOGIC (2026-10-10, user: "Every single class should have a plan, and it should be configurable from the user per party! It should
// never upgrade without asking"). The ONE place where the dashboard decides a character's class plan status, validates a plan against the
// class tree and matches group templates. The CLASSPLAN-PURE block below is a TEXT COPY of the block in Scripts_dev/swarm.js (the gate the
// bots use), written by docs/plan/tools/class_logic_sync.js; docs/plan/tools/test_class_plans.js fails when they differ.
// Used by Dashboard/classpage_api.js (server: /api/classplans, /api/classtree), Dashboard/classpage.js (browser: window.ClassLogic) and the tests.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ClassLogic = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

`;
const TAIL = `
  return { CP_STATUS, cpNorm, cpClass, cpName, cpChain, cpValidate, cpFits, cpEntry, cpDecide, cpPickButton, cpNameIs, cpIdOf, cpPlanFromNames, cpPathsFrom,
    cpTemplateMatch, cpTemplateFromParty };
});
`;
const b = block(fs.readFileSync(SRC, 'utf8'));
if (!b) { console.log('CLASSPLAN-PURE block not found in Scripts_dev/swarm.js'); process.exit(1); }
const want = HEAD + b + TAIL;
let cur = ''; try { cur = fs.readFileSync(OUT, 'utf8'); } catch (e) { }
if (process.argv.includes('--check')) { console.log(cur === want ? 'Dashboard/classlogic.js is in sync' : 'Dashboard/classlogic.js DIFFERS from the swarm.js block'); process.exit(cur === want ? 0 : 1); }
if (cur === want) { console.log('Dashboard/classlogic.js already in sync'); process.exit(0); }
fs.writeFileSync(OUT + '.tmp', want, 'utf8'); fs.renameSync(OUT + '.tmp', OUT);
console.log('wrote Dashboard/classlogic.js (' + b.split('\n').length + ' block lines)');
module.exports = { block };
