'use strict';
// SHOTRECIPES-2026-11-04 guard (owner: "Crafter1 should learn to create soulshots and blessed spiritshots"): swarm.js craftRecipeBuyPlan + !craft recipes
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const src = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
const cut = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b); if (i < 0 || j < i) throw new Error('block missing: ' + a); return src.slice(i, j); };
const P = new Function(cut('// CRAFT-PURE-BEGIN', '// CRAFT-PURE-END') + '\nreturn { craftRecipeBuyPlan };')();
let fails = 0; const check = (c, n, info) => { console.log((c ? 'ok   ' : 'FAIL ') + n + (!c && info !== undefined ? ' - ' + JSON.stringify(info) : '')); if (!c) fails++; };
// SHOTRECIPES-2026-11-04 (owner: "Crafter1 should learn to create soulshots and blessed spiritshots"): which recipe scrolls to buy at Plani
{ const offers = require(path.join(ROOT, 'Scripts', 'data', 'giran_market.json')).offers;
  const p = P.craftRecipeBuyPlan({ kinds: ['soulshot', 'blessed'], createLvl: 9, known: [], bag: {}, offers, adena: 334e6, keep: 0 });
  const keys = p.buy.map(b => b.key).sort().join(',');
  check(keys === 'blessed:A,blessed:B,blessed:C,blessed:D,soulshot:A,soulshot:B,soulshot:C,soulshot:D', 'Create Item 9, nothing known: buys soulshot + blessed D/C/B/A at Plani', keys);
  check(p.buy.every(b => b.offer.npc === 'Plani') && p.cost === 756000, 'all at Plani, 756,000 adena', p.cost);
  check(p.skip.some(s => s.key === 'soulshot:S' && /no NPC/.test(s.why)) && !p.buy.some(b => /spiritshot:/.test(b.key)), 'S recipes are not sold (skipped with a reason); plain spiritshots are not asked for');
  const p2 = P.craftRecipeBuyPlan({ kinds: ['soulshot'], createLvl: 9, known: [20, 21], bag: { 1806: 1 }, offers, adena: 334e6 });
  check(!p2.buy.some(b => /soulshot:[DC]/.test(b.key)) && p2.learn.includes(1806) && !p2.buy.some(b => b.key === 'soulshot:B'), 'known recipes are never bought again; a scroll in the bag is learned, not bought');
  const p3 = P.craftRecipeBuyPlan({ kinds: ['soulshot'], createLvl: 5, known: [], bag: {}, offers, adena: 334e6 });
  check(!p3.buy.some(b => /soulshot:[BAS]/.test(b.key)) && p3.skip.some(s => s.key === 'soulshot:A' && /Create Item 7/.test(s.why)), 'a recipe above my Create Item level is never bought');
  check(P.craftRecipeBuyPlan({ kinds: ['soulshot'], createLvl: 9, known: null, offers, adena: 334e6 }).buy.length === 0, 'recipe book not read = nothing bought');
  check(P.craftRecipeBuyPlan({ kinds: ['soulshot'], createLvl: 9, known: [], offers, adena: 100000 }).buy.every(b => b.price * 1.25 <= 100000), 'never buys more than the adena allows');
  const fn = src.slice(src.indexOf('async function craftBuyRecipes('), src.indexOf('// --- hand-in orders that wait for the same town'));
  check(/ijInGiran\(\)/.test(fn) && /IsInCombat/.test(fn) && /ijBuyAt\(/.test(fn) && /rcpLearn\(/.test(fn) && /craftReadBook\(true\)/.test(fn), 'only in Giran, never in a fight; buys in front of Plani (ijBuyAt) and verifies the learn in the recipe book');
  check(src.includes("a === 'recipes'") && /!craft recipes/.test(src), '!craft recipes order exists (owner order only, nothing automatic)'); }

// live 2026-11-04 09:31-09:41: the bank's other jobs pulled him away between the buys - the order holds control (P4) for the visit
{ const fn = src.slice(src.indexOf('async function craftBuyRecipes('), src.indexOf('// --- hand-in orders that wait for the same town'));
  check(/takeControl\('craftrecipes', PRIO\.ORDER\)/.test(fn) && /releaseControl\('craftrecipes'\)/.test(fn) && /finally/.test(fn), 'the recipe visit holds control (P4 ORDER) and always gives it back'); }
// live 2026-11-04 10:24: "Plani not in sight" in 0.2 s - the Giran walk had no route for Plani (outskirts, next to Pushkin): the blacksmith route names him
{ const R = require(path.join(ROOT, 'Scripts', 'data', 'giran_routes.json')).routes || {};
  check(Object.keys(R).some(k => R[k].npc === 'Plani' || R[k].npc2 === 'Plani'), 'a recorded Giran route leads to Plani (the recipe merchant)'); }
console.log(fails ? fails + ' FAILED' : 'shot recipes: all passed'); process.exit(fails ? 1 : 0);
