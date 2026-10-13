// HEAL SCHEMES (2026-10-13): copies the HEALSCHEME-PURE block (heal skill choice, scheme merge / validation, recharge target, heal order)
// from Scripts_dev/swarm.js into Dashboard/heallogic.js, so the dashboard heal-scheme editor shows "Automatic: <skill>" and validates with
// exactly the code the bots run.
// Run after every change of the block:   node docs/plan/tools/heal_logic_sync.js   (--check: only compare, exit 1 when different)
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const SRC = process.env.SWARM_SRC || path.join(ROOT, 'Scripts_dev', 'swarm.js'), OUT = process.env.HEALLOGIC_OUT || path.join(ROOT, 'Dashboard', 'heallogic.js');
function block(s, name) { const B0 = `// ${name}-BEGIN`, B1 = `// ${name}-END`; const a = s.indexOf(B0), b = s.indexOf(B1); return a >= 0 && b > a ? s.slice(a, b + B1.length) + '\n' : null; }
const HEAD = `// HEAL SCHEME LOGIC (2026-10-13, public tester: "SE uses Self Heal at lvl 80", "no MP recharge from SE/EE", "let me set my own heal / MP
// schemes"). The HEALSCHEME-PURE block below is a TEXT COPY of the block in Scripts_dev/swarm.js (what the bots run), written by
// docs/plan/tools/heal_logic_sync.js; docs/plan/tools/test_heal_schemes.js fails when they differ.
// Used by Dashboard/healschemes_api.js (server: /api/healschemes), Dashboard/healschemes.js (browser: window.HealLogic) and the tests.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.HealLogic = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

`;
const TAIL = `
  return { HS_DEFAULT, HS_SITS, HS_PRIORITIES, HS_WHO, HS_XML, HS_KINDS, HS_CHOOSE, HS_FALLBACK, HS_CASTER_RE, hsClean, hsValidate, hsMergeScheme, hsNorm,
    hsEffective, hsRow, hsPowerAt, hsKnown, hsPick, hsAutoTable, hsOrder, hsRechargeTarget, hsPotionBelow };
});
`;
function build(src) { const a = block(src, 'HEALSCHEME-PURE'); return a ? HEAD + a + TAIL : null; }
if (require.main === module) {
  const want = build(fs.readFileSync(SRC, 'utf8'));
  if (!want) { console.log('HEALSCHEME-PURE block not found in Scripts_dev/swarm.js'); process.exit(1); }
  let cur = ''; try { cur = fs.readFileSync(OUT, 'utf8'); } catch (e) { }
  if (process.argv.includes('--check')) { console.log(path.relative(ROOT, OUT) + (cur === want ? ' is in sync' : ' DIFFERS from the swarm.js block')); process.exit(cur === want ? 0 : 1); }
  if (cur === want) { console.log(path.relative(ROOT, OUT) + ' already in sync'); process.exit(0); }
  fs.writeFileSync(OUT + '.tmp', want, 'utf8'); fs.renameSync(OUT + '.tmp', OUT);
  console.log('wrote ' + path.relative(ROOT, OUT));
}
module.exports = { block, build };
