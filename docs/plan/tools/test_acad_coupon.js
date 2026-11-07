// test_acad_coupon.js - requirement gear.md R9 (owner 2026-10-31: "Have You added the shadow item coupons for academy toons" -> "Option 1"):
// academy characters take the two FREE Newbie Guide coupons by themselves (weapon coupons at level 6-19 base class -> ONE shadow weapon, the rest
// kept; jewelry coupon at 1st class < 40 -> D shadow jewelry), worn only when better, never a +10 piece, never armor, nothing sold / bought /
// dropped, only academy characters, only as the academy plan's own steps (onFail skip) + an idle swap next to a guide (no trip).
// Runs the ACADCOUPON-PURE block of Scripts_dev/swarm.js in node and compares it with Dashboard/beginnergear_logic.js.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
let ok = 0, bad = 0; const check = (c, m) => { if (c) { ok++; console.log('ok   ' + m); } else { bad++; console.log('FAIL ' + m); } };
const cut = (start, end) => { const i = SRC.indexOf(start); return i < 0 ? '' : SRC.slice(i, SRC.indexOf(end, i) + end.length); };

const pure = cut('// ACADCOUPON-PURE-BEGIN', '// ACADCOUPON-PURE-END');
check(pure.length > 0 && !/\b(Me|Inventory|Send|File|App|note|sleep)\./.test(pure.replace(/\/\/.*$/gm, '')), 'the pure block has no host calls');
const P = new Function(pure + '\nreturn { acTier, acMystic, acWeaponId, acWindow, acWeaponBetter, acJewelDo, acPickLink, acEntry, acSwapDecide, AC_ITEM, AC_JEWEL, AC_LINK };')();
const BL = require(path.join(ROOT, 'Dashboard', 'beginnergear_logic.js'));
const BG = JSON.parse(fs.readFileSync(path.join(ROOT, 'Scripts', 'data', 'beginner_gear.json'), 'utf8'));

// same class tiers / weapons as the Beginner gear plan, for every class id
let same = true, sameW = true;
for (let c = 0; c <= 136; c++) {
  if (P.acTier(c) !== BL.classTier(c)) same = false;
  const w = BL.shadowWeaponFor(c, BG.steps.weaponCoupon.weapons); if ((w ? w.id : null) !== P.acWeaponId(c)) sameW = false;
}
check(same, 'class tiers = beginnergear_logic classTier (0..136)');
check(sameW, 'shadow weapon per class = beginnergear_logic shadowWeaponFor (Kamael none)');
check(P.AC_ITEM.weapon === BG.steps.weaponCoupon.item.id && P.AC_ITEM.jewelry === BG.steps.accessoryCoupon.item.id, 'coupon ids = beginner_gear.json (7832 / 7833)');
check([].concat(P.AC_LINK.weapon.coupon)[0] === BG.steps.weaponCoupon.links.coupon && [].concat(P.AC_LINK.weapon.exchange)[0] === BG.steps.weaponCoupon.links.exchange
  && P.AC_LINK.jewelry.coupon === BG.steps.accessoryCoupon.links.coupon && P.AC_LINK.jewelry.exchange === BG.steps.accessoryCoupon.links.exchange, 'link texts = beginner_gear.json (datapack) first, the live L2Toggle wording next to them (COUPONLIVE)');
check(P.AC_JEWEL.box === BG.steps.accessoryCoupon.box.id && P.AC_JEWEL.setMd === 112, 'jewelry box 10473, set M.Def 112');

// windows (the server's limits)
check(P.acWindow('weapon', 5, 38).ok === false && P.acWindow('weapon', 6, 38).ok && P.acWindow('weapon', 19, 38).ok && !P.acWindow('weapon', 20, 38).ok, 'weapon coupons: level 6-19');
check(!P.acWindow('weapon', 12, 39).ok && /1st class/.test(P.acWindow('weapon', 12, 39).why), 'weapon coupons: never after the 1st class change');
check(!P.acWindow('weapon', 10, 123).ok, 'Kamael: no shadow weapon fits -> skipped');
check(!P.acWindow('jewelry', 15, 38).ok && P.acWindow('jewelry', 20, 39).ok && !P.acWindow('jewelry', 40, 39).ok && !P.acWindow('jewelry', 30, 40).ok, 'jewelry coupon: 1st class, below 40');

// worn only when better
check(P.acWeaponBetter(null, { pa: 23, ma: 24 }, true), 'no weapon worn -> the shadow staff goes on');
check(!P.acWeaponBetter({ pa: 30, ma: 40 }, { pa: 23, ma: 24 }, true) && P.acWeaponBetter({ pa: 6, ma: 5 }, { pa: 23, ma: 24 }, true), 'mystic compares M.Atk: a better worn staff stays');
check(P.acJewelDo([18, 11]).go && P.acJewelDo([24, 24, 16, 16, 32]).go === false && P.acJewelDo([11, 11, 8, 8, 18]).go, 'jewelry: fewer than 5 worn or a gain > 20');

// dialog: live link texts, max 2 hops, never a teleport / buy / quest link
const L1 = [{ text: 'Teleport' }, { text: 'Quest' }, { text: 'Receive newbie items' }, { text: 'Buy' }];
check(P.acPickLink(L1, P.AC_LINK.weapon.coupon, 0).final === false && P.acPickLink(L1, P.AC_LINK.weapon.coupon, 0).link.text === 'Receive newbie items', 'a menu hop is taken only through a newbie-item link');
check(P.acPickLink([{ text: 'Teleport' }, { text: 'Buy weapons' }], P.AC_LINK.weapon.coupon, 0) === null, 'never a teleport / buy link');
check(P.acPickLink([{ text: "Receive the Apprentice Adventurer's Weapon Exchange Coupon." }], P.AC_LINK.weapon.coupon, 2).final === true, 'the wanted link is found');
check(P.acPickLink([{ text: 'Receive newbie items' }], P.AC_LINK.weapon.coupon, 2) === null, 'no more than 2 hops');
check(P.acEntry([{ entry: 3, products: [{ id: 10479 }], ings: [{ id: 7832, count: 1 }] }, { entry: 1, products: [{ id: 10474 }], ings: [{ id: 7832, count: 1 }] }], 7832, 10474).entry === 1, 'the multisell entry is picked by coupon + product, not by number');
check(P.acEntry([{ entry: 1, products: [{ id: 10474 }], ings: [{ id: 57, count: 100 }] }], 7832, 10474) === null, 'an entry that costs adena is never used');

// the idle swap: no trip, never busy
const base = { academy: true, on: true, win: true, coupons: 4, shadowWorn: false, shadowBag: false, guideDist: 300, idle: true };
check(P.acSwapDecide(base).go, 'weapon gone + coupon left + idle next to a guide -> the next exchange');
check(!P.acSwapDecide(Object.assign({}, base, { guideDist: 5000 })).go, 'no guide near -> no trip, it waits');
check(!P.acSwapDecide(Object.assign({}, base, { idle: false })).go && !P.acSwapDecide(Object.assign({}, base, { academy: false })).go && !P.acSwapDecide(Object.assign({}, base, { on: false })).go, 'busy / not academy / switched off -> nothing');
check(!P.acSwapDecide(Object.assign({}, base, { shadowWorn: true })).go && !P.acSwapDecide(Object.assign({}, base, { coupons: 0 })).go, 'still worn / no coupon -> nothing');

// host rules (static)
const host = cut('const ACC = { busy: false', '}, 30000);');
check(/if \(!isAcademy\(\)\)/.test(host) && /isAcademy\(\)/.test(cut('setInterval(() => {\n  try {\n    if (ACC.busy', '}, 30000);')), 'only academy characters');
check(!/sellAt|townSellMarked|buyPacket|BuyItem|DestroyItem|DropItem|RequestDestroy|RequestDrop/.test(host), 'nothing sold, bought, destroyed or dropped');
check(/wornEnch = num\(i\.EnchantLvl\)[\s\S]*wornEnch >= 10\) return/.test(cut('async function acWearWeapon', '\n}\n')) && /EnchantLvl\) >= 10\) plus10 = true[\s\S]*if \(plus10\) return/.test(cut('async function acWearJewels', '\n}\n')), 'a worn +10 weapon / jewel is never replaced');
check(!/'chest'|'legs'|'head'|'gloves'|'feet'/.test(host), 'armor is never touched');
check(/Send\.MultiSellChoose\(r\.listId, e\.entry, 1\)/.test(host), 'ONE coupon per exchange (the rest stays in the bag)');
check(/if \(!C\.coupons\)/.test(host) && /coupons: o\.coupons !== false/.test(SRC), 'switch academy.json coupons (default ON)');
check(/'join', 'funds', 'buy', 'graduate', 'coupon'\]\.indexOf\(s\.act\)/.test(SRC), 'swarm.js keeps the coupon plan steps');

// the academy plan + plan validation
const AL = require(path.join(ROOT, 'Dashboard', 'academy_logic.js')), PL = require(path.join(ROOT, 'Dashboard', 'planlogic.js'));
const st = AL.academyPlanSteps({}), ids = st.map(s => s.id);
check(ids.indexOf('aclv6') > ids.indexOf('acbuy1') && ids.indexOf('accpw') === ids.indexOf('aclv6') + 1 && ids.indexOf('accpw') < ids.indexOf('aclv20'), 'plan: level 6 -> weapon coupon -> level 20');
check(ids.indexOf('accpj') === ids.indexOf('accls1') + 1 && st.find(s => s.id === 'accpj').which === 'armor', 'plan: ARMOR coupon right after the 1st class change (ACADROUTE: L2Toggle gives shadow armor at 20-39)');
check(st.filter(s => s.act === 'coupon').every(s => s.onFail === 'skip'), 'plan: a coupon step that fails is skipped (never blocks)');
check(!AL.academyPlanSteps({ coupons: false }).some(s => s.act === 'coupon' || s.id === 'aclv6'), 'plan: coupons off -> no extra steps');
const nsteps = PL.normPlan({ name: 'x', on: true, steps: st }).steps;
check(nsteps.length === st.length && nsteps.filter(s => s.act === 'coupon' && s.onFail === 'skip').length === 2 && nsteps.some(s => s.act === 'coupon' && s.which === 'armor'), 'planlogic keeps every academy step (both coupon steps incl. which armor, skip on fail)');
// ACADROUTE-2026-11-01: the armor coupon (L2Toggle live page: "At level 20, you can borrow Shadow Armor with the Adventurer's Magic Armor Exchange Coupon")
{ const A = new Function(pure + '\nreturn { acWindow, acArmorPick, AC_LINK, AC_ARMOR_COUPON_RE };')();
  check(!A.acWindow('armor', 19, 39).ok && !A.acWindow('armor', 22, 38).ok && A.acWindow('armor', 20, 39).ok && A.acWindow('armor', 39, 39).ok && !A.acWindow('armor', 40, 39).ok && !A.acWindow('armor', 30, 40).ok, 'ACADROUTE armor window: 1st class, level 20-39');
  const p1 = ["Get the Apprentice Adventurer's Weapon Exchange Coupon", 'Use the weapon warehouse for apprentice adventurers', "Get the Adventurer's Magic Armor Exchange Coupon", 'Use the Magic Armor warehouse for travellers'].map(text => ({ text }));
  const c = P.acPickLink(p1, A.AC_LINK.armor.coupon, 1), e = P.acPickLink(p1, A.AC_LINK.armor.exchange, 1);
  check(c && c.final && /Magic Armor Exchange Coupon/.test(c.link.text) && e && e.final && /Magic Armor warehouse/.test(e.link.text), 'ACADROUTE armor links: the live coupon + warehouse links (not the weapon ones)');
  check(A.AC_ARMOR_COUPON_RE.test("Adventurer's Magic Armor Exchange Coupon") && !A.AC_ARMOR_COUPON_RE.test("Apprentice Adventurer's Weapon Exchange Coupon"), 'ACADROUTE: the armor coupon is found in the bag by its name');
  const GDB = JSON.parse(fs.readFileSync(path.join(ROOT, 'Scripts', 'data', 'gear_items.json'), 'utf8')).items, CP = 99001;
  const ent = (entry, id, cost) => ({ entry, products: [{ id, count: 1 }], ings: [{ id: CP, count: cost }] });
  const fake = [ent(1, 9045, 1) /* fighter shirt */, ent(2, 9049, 1) /* Tunic of Knowledge D */, ent(3, 9034, 1) /* Tunic of Magic NG */, ent(4, 9050, 1), ent(5, 9051, 1), ent(6, 9052, 1), ent(7, 9053, 1), ent(8, 9042, 1) /* Gauntlet */, { entry: 9, products: [{ id: 9049, count: 1 }], ings: [{ id: 57, count: 1000 }] }];
  const pick = A.acArmorPick(fake, CP, GDB, 10), got = pick.map(x => x.ids[0]).sort();
  check(JSON.stringify(got) === JSON.stringify([9049, 9050, 9051, 9052, 9053].sort()), 'ACADROUTE armor pick: the whole D Knowledge robe set + helmet (best per slot), never fighter pieces or entries that do not take the coupon: ' + JSON.stringify(got));
  check(A.acArmorPick(fake, CP, GDB, 2).length === 2 && A.acArmorPick(fake, CP, GDB, 0).length === 0, 'ACADROUTE armor pick: only as many pieces as the coupons pay for');
  check(A.acArmorPick(fake, 12345, GDB, 10).length === 0, 'ACADROUTE armor pick: nothing when the list does not take my coupon'); }
// COUPONRETRY-2026-11-01 (owner: "every single academy toon JUST works ... 24/7"): a failed coupon is retried, never in a fight
{ const R = new Function(pure + '\nreturn acRetryDecide;')(), T = 1e12, base = { academy: true, on: true, win: true, status: 'failed', lastAt: T - 16 * 60000, now: T, fightFreeMs: 60000, busy: false, planOther: false };
  check(R(base).go, 'COUPONRETRY: failed 16 min ago, out of a fight, in the window = retry');
  check(!R(Object.assign({}, base, { lastAt: T - 10000 })).go && R(Object.assign({}, base, { lastAt: T - 40000 })).go, 'COUPONNOW: again 30 s after a failure (owner: "15 minutes is insane")');
  check(R(Object.assign({}, base, { lastAt: T - 40000, fightFreeMs: 0 })).go && !R(Object.assign({}, base, { busy: true })).go, 'COUPONNOW: also out of a hunt (the trip breaks off the fight itself), never while busy (trade / NPC / raid)');
  check(!R(Object.assign({}, base, { win: false })).go && !R(Object.assign({}, base, { status: 'done' })).go && !R(Object.assign({}, base, { status: 'skipped' })).go, 'COUPONRETRY: not outside the window, not when done / skipped');
  check(R(Object.assign({}, base, { status: 'running', lastAt: T - 25 * 60000 })).go && !R(Object.assign({}, base, { status: 'running', lastAt: T - 5 * 60000 })).go, 'COUPONRETRY: a cut-off "running" (> 20 min) counts as failed');
  check(!R(Object.assign({}, base, { planOther: true })).go, 'COUPONRETRY: waits while a plan step other than leveling runs');
  const csA = SRC.indexOf('async function acCouponStep('), cs = SRC.slice(csA, SRC.indexOf('\n}\n', csA) + 3);
  check(/takeControl\('academy coupon', PRIO\.ORDER\)/.test(cs) && /releaseControl\('academy coupon'\)/.test(cs) && /await acBreakOff\(60000\)/.test(cs), 'COUPONRETRY: the coupon run holds the control slot (leveling cannot stop the trip) and breaks off the fight before the trip');
  check(/function acBreakOff\(maxMs\)[\s\S]{0,400}autoLvl\.stop = true; stopCombatG\([\s\S]{0,500}escapeFight\(/.test(SRC), 'COUPONRETRY: break off = stop leveling + combat, wait for the combat flag, escape when still attacked');
  check(/acRetryDecide\(\{ academy: true, on: C\.coupons, win: acWindow\(which, lvl, cid\)\.ok/.test(SRC) && /for \(const which of \['weapon', 'armor'\]\)/.test(SRC), 'COUPONRETRY: the retry tick covers the weapon and the armor coupon'); }
// ACADROUTE-2026-11-01: the level-20 kit skips a piece when the worn one is as good (the shadow robe set); the weapon is compared by M.Atk
{ const a = SRC.indexOf('function acadBuyNeed('), need = new Function(SRC.slice(a, SRC.indexOf('\n}\n', a) + 3) + '\nreturn acadBuyNeed;')();
  const dev = { s: 'chest', pd: 30, ma: 0 }, staff = { s: 'weapon', pd: 0, ma: 30 };
  check(need({ id: 1101, count: 1, equip: true }, {}, { chest: { pd: 49, ma: 0 } }, dev).act === 'have', 'ACADROUTE: Tunic of Devotion not bought over a worn shadow Tunic of Knowledge');
  check(need({ id: 1101, count: 1, equip: true }, {}, { chest: { pd: 20, ma: 0 } }, dev).act === 'buy' && need({ id: 1101, count: 1, equip: true }, {}, {}, dev).act === 'buy', 'ACADROUTE: bought when the worn piece is worse or nothing is worn');
  check(need({ id: 11729, count: 1, equip: true }, {}, { weapon: { pd: 0, ma: 9 } }, staff).act === 'buy', 'ACADROUTE: the Common Staff of Life is still bought over the shadow staff (M.Atk)');
  check(need({ id: 3948, count: 10000, shots: true }, { 3948: 0 }, { chest: { pd: 99 } }, null).act === 'buy', 'ACADROUTE: D spiritshots are always topped up'); }
check(nsteps.find(s => s.id === 'acbuy2').set === 'level20' && nsteps.find(s => s.id === 'acgrad').act === 'graduate', 'planlogic still keeps the buy set / graduate steps');
check(/'join', 'funds', 'buy', 'graduate', 'coupon'\]\.includes\(s\.act\)/.test(fs.readFileSync(path.join(ROOT, 'Dashboard', 'planlogic.js'), 'utf8')), 'planlogic accepts act coupon');

// COUPONHOP-2026-11-01: the LIVE L2Toggle first page (Zarith0669 2026-10-31) - the coupons are behind "Ask for help with a newbie item."
{ const live = ['Ask for advice.', 'Find NPC.', 'Recive blessing of protection.', 'Teleport to another village.', 'Give me some support magic.', 'Tell me about novice characters.', 'Ask for help with a newbie item.'].map(text => ({ text }));
  const p = P.acPickLink(live, P.AC_LINK.weapon.coupon, 0);
  check(p && !p.final && p.link.text === 'Ask for help with a newbie item.', 'COUPONHOP: the live first page hops through "Ask for help with a newbie item." (not given up)');
  check(P.acPickLink(live, P.AC_LINK.weapon.coupon, 2) === null, 'COUPONHOP: still at most 2 hops'); }
// COUPONLIVE-2026-11-01: the LIVE 2nd page (Logs/acadcoupon_Nyxwen334_page1.html)
{ const p1 = ["Get the Apprentice Adventurer's Weapon Exchange Coupon", 'Use the weapon warehouse for apprentice adventurers', "Get the Adventurer's Magic Armor Exchange Coupon", 'Use the Magic Armor warehouse for travellers'].map(text => ({ text }));
  const c = P.acPickLink(p1, P.AC_LINK.weapon.coupon, 1), e = P.acPickLink(p1, P.AC_LINK.weapon.exchange, 1);
  check(c && c.final && /^Get the Apprentice/.test(c.link.text), 'COUPONLIVE: "Get the Apprentice Adventurer\'s Weapon Exchange Coupon" is the coupon link (final, not a hop)');
  check(e && e.final && /weapon warehouse/.test(e.link.text), 'COUPONLIVE: "Use the weapon warehouse for apprentice adventurers" is the exchange link');
  const G = new Function(pure + '\nreturn acGuideQuery;')();
  check(G(-39048, -109208) === '30602', 'COUPONLIVE: 7k from the Orc Village guide = that guide');
  check(G(-95416, 53475) === '31077' && G(83473, 148554) === '31077', 'COUPONLIVE: far from every guide (Kamael fields, Giran) = the Gludio guide 31077'); }
// DPANYTIME-2026-11-01: Recovery scroll also in a fight (HP >= 50 %)
{ const i = SRC.indexOf('function dpScrollNow('), dp = i > 0 ? new Function(SRC.slice(i, SRC.indexOf('\n', i)) + '\nreturn dpScrollNow;')() : null;
  check(dp && dp(false, false, 10) && dp(false, true, 80) && !dp(false, true, 40) && !dp(true, false, 100), 'DPANYTIME: Recovery scroll out of a fight always, in a fight at HP >= 50 %, never dead');
  check(/if \(!IsCharacterReady\(\) \|\| !dpScrollNow\(Me\.IsDead,/.test(SRC), 'DPANYTIME: the scroll loop uses dpScrollNow'); }

// COUPONFINAL-2026-11-01: L2Toggle's armor coupon answers "Your already got your newbie weapon!" = final, no 30 s retry loop
{ const i = SRC.indexOf('function acCouponFinal('); const F = new Function(SRC.slice(i, SRC.indexOf('\n', i)) + '\nreturn acCouponFinal;')();
  check(F('Your already got your newbie weapon!') && !F('') && !F('Come back at level 20'), 'COUPONFINAL: the guide\'s "already got" answer is final');
  check(SRC.includes("acSet(which, got.final ? 'unavailable' : 'failed', got.why)") && !new Function(pure + '\nreturn acRetryDecide;')()({ academy: true, on: true, win: true, status: 'unavailable', lastAt: 0, now: 1e12, fightFreeMs: 1e9 }).go, 'COUPONFINAL: an unavailable coupon is stored as such and never retried'); }
// ARMORNEVER-2026-11-02: no armor coupon after the weapon coupon on L2Toggle - skipped at once, no trip, no retry loop
{ const i = SRC.indexOf('function acArmorNever('); const A = new Function(SRC.slice(i, SRC.indexOf('\n', i)) + '\nreturn acArmorNever;')();
  check(A('armor', { weapon: { status: 'done' } }) && !A('armor', { weapon: { status: 'failed', text: 'trip: stopped' } }) && !A('weapon', { weapon: { status: 'done' } }) && !A('armor', {}), 'ARMORNEVER: armor coupon impossible once the weapon coupon is done; otherwise tried');
  check(/if \(acArmorNever\(which, acRead\(\)\)\) \{ acSet\(which, 'unavailable'/.test(SRC), 'ARMORNEVER: the coupon step stores it as unavailable before any trip'); }
check(SRC.includes("acadBuyNeed(r.equip && !r.shots ? Object.assign({}, r, { count: 1 }) : r, holds, null, (gearDb().items || {})[num(r.id)], num(Me.Level)).act; return a !== 'have' && a !== 'skip'"), "ACADPAIRS: a worn pair of earrings / rings counts as there after the kit buy (ACADGRADE: a too-high-grade row is skipped, never 'missing')");
console.log(`acad coupon: ${ok} ok, ${bad} failed`);
process.exit(bad ? 1 : 0);
