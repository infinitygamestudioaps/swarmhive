// BUFF PLANS (2026-10-10): copies the ROLEKIND-PURE block (role kinds + buff classification) and the BUFFPLAN-PURE block (buff plans,
// targets, overlaps, song/dance turns) from Scripts_dev/swarm.js into Dashboard/bufflogic.js, so the dashboard Buffs page decides
// "suggested / ok / overlap" with exactly the code the bots use.
// Run after every change of either block:   node docs/plan/tools/buff_logic_sync.js   (--check: only compare, exit 1 when different)
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const SRC = process.env.SWARM_SRC || path.join(ROOT, 'Scripts_dev', 'swarm.js'), OUT = process.env.BUFFLOGIC_OUT || path.join(ROOT, 'Dashboard', 'bufflogic.js');   // PHASE 1: staged (no Dashboard files until the Buffs page ships; then Dashboard/bufflogic.js)
function block(s, name) { const B0 = `// ${name}-BEGIN`, B1 = `// ${name}-END`; const a = s.indexOf(B0), b = s.indexOf(B1); return a >= 0 && b > a ? s.slice(a, b + B1.length) + '\n' : null; }
const HEAD = `// BUFF PLAN LOGIC (2026-10-10, user: buffers must work for every class, without community-board buffs, with plans the user chooses per
// party). The ROLEKIND-PURE and BUFFPLAN-PURE blocks below are TEXT COPIES of the blocks in Scripts_dev/swarm.js (what the bots run), written by
// docs/plan/tools/buff_logic_sync.js; docs/plan/tools/test_buff_plans.js fails when they differ.
// Used by Dashboard/buffpage_api.js (server: /api/buffplans), Dashboard/buffpage.js (browser: window.BuffLogic) and the tests.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BuffLogic = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

`;
const TAIL = `
  return { ROLEKIND, ROLE_RE, BUFFPLAN, rkNum, rkClassRow, rkKindOfClass, rkStyleOfClass, rkKindOf, rkResolve, rkIsLegacy, rkBehaviour, rkSkill,
    rkClassifyBuffs, rkIsSongDance, rkBuffNeed, rkBufferPick, rkBoardBuffs, rkUpkeepRole,
    bpNorm, bpSettings, bpEntry, bpTargets, bpValidate, bpBenefit, bpSuggest, bpEffective, bpRuns, bpPlanSkills, bpOwners, bpGathered,
    bpMissing, bpTemplateFromParty, bpTemplateApply, bpRotName, bpRotEntries, bpCycleSeq, bpCycleDue, bpCycleMp, bpCycleStep };
});
`;
function build(src) {
  const a = block(src, 'ROLEKIND-PURE'), b = block(src, 'BUFFPLAN-PURE');
  if (!a || !b) return null;
  return HEAD + a + '\n' + b + TAIL;
}
if (require.main === module) {
  const want = build(fs.readFileSync(SRC, 'utf8'));
  if (!want) { console.log('ROLEKIND-PURE / BUFFPLAN-PURE block not found in Scripts_dev/swarm.js'); process.exit(1); }
  let cur = ''; try { cur = fs.readFileSync(OUT, 'utf8'); } catch (e) { }
  if (process.argv.includes('--check')) { console.log(path.relative(ROOT, OUT) + (cur === want ? ' is in sync' : ' DIFFERS from the swarm.js blocks')); process.exit(cur === want ? 0 : 1); }
  if (cur === want) { console.log(path.relative(ROOT, OUT) + ' already in sync'); process.exit(0); }
  fs.writeFileSync(OUT + '.tmp', want, 'utf8'); fs.renameSync(OUT + '.tmp', OUT);
  console.log('wrote ' + path.relative(ROOT, OUT));
}
module.exports = { block, build };
