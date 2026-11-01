// OFFLINE TEST SEALBUY-2026-10-30 (tester Vykaax, 1.12.9: "Bots are buying a-grade armor now! But only the pieces that don't need to be unsealed.
// Gloves / boots are not purchased"): the luxury shop sells A gloves / boots / jewels only SEALED; giranShopIndex now lists each sealed offer under
// every unsealed version (Heavy / Light / Robe) with the Pushkin fee, planUpgrades picks it, buyGearPicks buys the sealed piece + unseals at Pushkin.
// Harness = test_full_armor.js (mocked character) on a copy of swarm.js with sealVariants / unsealData placed next to the shop index.
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const ROOT = path.join(__dirname, '..', '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
const cut = (a, b) => { const i = SRC.indexOf(a), j = SRC.indexOf(b, i + 1); if (i < 0 || j < 0) throw new Error('marker not found: ' + (i < 0 ? a : b)); return SRC.slice(i, j); };
const lifted = cut('let USEAL = null;', 'const GD = {') + cut('/** SEALBUY-2026-10-30: sealed item id', '/** the unseal cost of a sealed piece');
const tmp = path.join(os.tmpdir(), 'sealbuy_swarm.js');
fs.writeFileSync(tmp, SRC.replace('/** Kamael: if I wear a sword', lifted + '\n/** Kamael: if I wear a sword'));
process.env.SWARM_SRC = tmp;
const H = fs.readFileSync(path.join(__dirname, 'test_full_armor.js'), 'utf8').split('// ==== FULLARMOR-2026-10-15')[0];
const T = new Function('require', '__dirname', 'process', H + '\nreturn { plan, check, done: () => ({ oks, fails }) };')(require, __dirname, process);
const { plan, check } = T;
const DATA = path.join(ROOT, 'Scripts', 'data');
const ITEMS = JSON.parse(fs.readFileSync(path.join(DATA, 'gear_items.json'), 'utf8').replace(/^﻿/, '')).items;

console.log('1) the shop index lists the sealed luxury pieces under their unsealed versions');
const { M } = plan({ classId: 5, level: 65, role: 'tank', worn: [] });
const idx = M.planUpgrades ? null : null;   // (planUpgrades ran once: the index is cached inside M's closure)
const lift = new Function('src', 'return src;');
// read the index through a fresh lift of giranShopIndex with the same mocks: the harness exposes only planUpgrades, so check the data path directly
const U = JSON.parse(fs.readFileSync(path.join(DATA, 'unseal_h5.json'), 'utf8').replace(/^﻿/, ''));
const MK = JSON.parse(fs.readFileSync(path.join(DATA, 'giran_market.json'), 'utf8').replace(/^﻿/, ''));
const sealedA = MK.offers.filter(o => /^Sealed /.test(o.name) && U.bySealed[o.id] && o.cost && o.cost.length === 1 && o.cost[0].id === 57);
check(sealedA.length >= 8, `${sealedA.length} sealed A pieces sold for adena at the luxury shop (gloves / boots / jewels)`);
check(/sealed: \{ id: num\(o\.id\), name: String\(o\.name\), buy: adena, unseal: \{ id: v\.id, pay: 57, aa: num\(v\.aa\), label: v\.label \} \}/.test(SRC), 'giranShopIndex: a sealed offer carries the sealed id, its price and the Pushkin unseal (version id, fee, menu link)');

console.log('2) an A-grade heavy fighter: the plan buys the sealed gloves / boots as the HEAVY version');
const dc = ['Dark Crystal Breastplate', 'Dark Crystal Gaiters', 'Dark Crystal Helmet'].filter(n => Object.values(ITEMS).some(v => v.n === n));
let r;
try { r = plan({ classId: 5, level: 65, role: 'tank', worn: dc, budget: 50000000 }).r; } catch (e) { check(false, 'plan ran: ' + e.message); }
if (r) {
  const sb = r.buys.filter(p => p.offer && p.offer.sealed);
  console.log('     buys: ' + r.buys.map(p => `${p.slot}:${p.info.n}${p.offer.sealed ? ' [sealed ' + p.offer.sealed.buy + ' + unseal ' + p.offer.sealed.unseal.aa + ']' : ''}`).join(', '));
  check(sb.length > 0, `sealed pieces are planned now (${sb.map(p => p.info.n).join(', ') || 'none'})`);
  check(sb.every(p => /Heavy Armor/.test(p.info.n) || !/- (Light Armor|Robe)$/.test(p.info.n)), 'a heavy-armor tank gets the Heavy Armor version (never Light / Robe)');
  check(sb.every(p => p.offer.price === p.offer.sealed.buy + p.offer.sealed.unseal.aa), 'the planned price = the shop price + the Pushkin fee (the budget counts both)');
  check(sb.every(p => p.offer.sealed.unseal.id === p.id), 'Pushkin unseals into exactly the planned piece');
}
console.log('3) a mage: the Robe version');
try { const rm = plan({ classId: 27, level: 65, role: 'mage', worn: [], budget: 50000000 }).r;
  const sm = rm.buys.filter(p => p.offer && p.offer.sealed && /(Gloves|Gauntlets|Boots)/.test(p.info.n));
  console.log('     sealed: ' + sm.map(p => p.info.n).join(', '));
  check(sm.every(p => /Robe$/.test(p.info.n)), 'a mage never gets a Heavy / Light glove or boot version');
} catch (e) { check(false, 'mage plan ran: ' + e.message); }

console.log('4) buying: the sealed piece at the luxury shop, then Pushkin, never the unsealed id at the shop');
const bg = cut('async function buyGearPicks(', '    if (!(await giranGo(G.offer.route)))');
check(/ijBuyAt\(p\.offer\.market, S\.id, 1, tag\)/.test(bg), 'buys the SEALED id at the luxury shop');
check(bg.includes("ijBuyAt({ npc: 'Pushkin', x: 77458, y: 148169, path: [S.unseal.label], kind: 'exchange' }, S.unseal.id, 1, tag)"), "unseals at Pushkin with the A-grade armor / accessory link into the planned version");
check(/bagCount\(S\.id\) < 1/.test(bg), 'a sealed piece already in the bag (an earlier failed unseal) is unsealed, not bought again');
check(/itemCount\(57\) < S\.unseal\.aa/.test(bg), 'no Pushkin trip without the fee: the piece stays sealed and it says so');
check(/num\(v\.pay\) !== 57/.test(SRC), 'S-grade seals (Ancient Adena) are never bought this way');
try { fs.unlinkSync(tmp); } catch (e) { }
const { oks, fails } = T.done();
console.log(`\nseal buy: ${oks} ok, ${fails} failed`);
process.exit(fails ? 1 : 0);
