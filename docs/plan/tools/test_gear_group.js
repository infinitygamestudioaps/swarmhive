// OFFLINE TEST GEARGROUP-2026-10-30 (tester Raltru, C grade 4x party: "the gear up option not working well... randomly my chars buy things or not.
// One sword and not clothes, or clothes and not weapon"): planUpgrades buys weapon -> armor -> jewelry, each group whole or not at all;
// owner 2026-10-30 "Skip a group that doesn't fit": a skipped group never blocks a later one. Harness = test_full_armor.js (its mocked character), run before its own cases.
'use strict';
const fs = require('fs'), path = require('path');
const H = fs.readFileSync(path.join(__dirname, 'test_full_armor.js'), 'utf8').split('// ==== FULLARMOR-2026-10-15')[0];
const T = new Function('require', '__dirname', H + '\nreturn { plan, check, done: () => ({ oks, fails }) };')(require, __dirname);
const { plan, check } = T;
const GRP = (p) => p.slot === 'weapon' ? 0 : ['chest', 'legs', 'head', 'gloves', 'feet', 'shield'].includes(p.slot) ? 1 : 2;
const chars = [
  { what: 'tank lvl 42 (D gear)', classId: 5, level: 42, role: 'tank', worn: ['Common Item - Mace of Prayer'] },
  { what: 'mage lvl 42 (nothing worn)', classId: 27, level: 42, role: 'mage', worn: [] },
  { what: 'destroyer lvl 44 (nothing worn)', classId: 46, level: 44, role: 'destroyer', worn: [] },
];
for (const c of chars) {
  let full;
  try { full = plan(Object.assign({}, c, { budget: 50000000 })).r; } catch (e) { check(false, `${c.what}: plan ran (${e.message})`); continue; }
  const groups = [0, 1, 2].map(g => full.buys.filter(p => GRP(p) === g));
  const cost = groups.map(g => g.reduce((a, p) => a + p.offer.price, 0));
  check(full.buys.length > 0, `${c.what}: plans ${full.buys.length} pieces with plenty of adena (weapon ${cost[0]}, armor ${cost[1]}, jewelry ${cost[2]})`);
  // budgets around every group edge: just below / at each cumulative cost
  const edges = [0, cost[0], cost[0] + cost[1], cost[0] + cost[1] + cost[2]];
  const budgets = [];
  edges.forEach(e => { if (e > 0) budgets.push(e - 1); budgets.push(e); });
  budgets.push(Math.round(cost[0] / 2), cost[0] + Math.round(cost[1] / 2));
  for (const b of budgets.filter(x => x >= 0)) {
    const r = plan(Object.assign({}, c, { budget: b })).r;
    const got = [0, 1, 2].map(g => r.buys.filter(p => GRP(p) === g).length);
    // every group is complete or empty; a group is skipped only when it does not fit next to the earlier ones bought (owner: skip, never block)
    const whole = [0, 1, 2].every(g => got[g] === 0 || got[g] === groups[g].length);
    let sp = 0; const prefix = [0, 1, 2].every(g => { const fits = sp + cost[g] <= b; if (got[g]) sp += cost[g]; return got[g] ? fits : (!groups[g].length || !fits); });
    const spend = r.buys.reduce((a, p) => a + p.offer.price, 0);
    check(whole && prefix && spend <= b, `${c.what} with ${b} adena: weapon ${got[0]}/${groups[0].length}, armor ${got[1]}/${groups[1].length}, jewelry ${got[2]}/${groups[2].length}${r.buys.length < full.buys.length ? ' — ' + (r.skipped.filter(s => /saving up/.test(s)).join(" / ") || '(no saving note)') : ''}`);
    if (r.buys.length < full.buys.length && full.buys.length) check(r.skipped.some(s => /saving up for the (weapon|armor|jewelry)/.test(s)), `${c.what} with ${b}: says what it saves up for`);
  }
}
const { oks, fails } = T.done();
console.log(`\ngear groups: ${oks} ok, ${fails} failed`);
process.exit(fails ? 1 : 0);
