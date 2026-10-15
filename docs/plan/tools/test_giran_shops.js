// OFFLINE TEST of GIRANSHOPS (owner 2026-10-15: "Nobody buys common-C jewels, incorrectly determined 'Not sold in Giran'"; the item card
// said "Giran: not sold in Giran" next to "Other shops: Sandra (Giran) 325,800"). Checks:
//  * docs/plan/tools/giran_shop_seed.js: Sandra (30090, end of the recorded 'jewelry' route) is added from the datapack buylists, Ellie as
//    her fallback name, Denkus moved to the 'grocer' route (he stands next to Helvetia), idempotent, a merchant with no recorded route = unreachable;
//  * the dashboard (gearpage_api.js + gear_recommend.js): every class's C-grade neck / earring / ring recommendation is "sold in Giran",
//    Nassen's Earring for a fighter = the Common twin at Sandra; an unreachable merchant never counts as sold (warning instead);
//  * swarm.js: the REAL planUpgrades of a level-40 fighter wearing D Common jewels buys the C Common jewels at Sandra (route 'jewelry');
//    shopLinkLike (exact > same words > the one buy link of the same kind); SHOPSCAN reads Sandra on 'jewelry' + Denkus on 'grocer'.
//   node docs/plan/tools/test_giran_shops.js      (exit 1 on a failure; nothing is written)
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const DATA = path.join(ROOT, 'Scripts', 'data');
const SRC = process.env.SWARM_SRC || path.join(ROOT, 'Scripts_dev', 'swarm.js');
const src = fs.readFileSync(SRC, 'utf8');
const rd = (f) => JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, ''));
const readJson = (f, d) => { try { return rd(f); } catch (e) { return d; } };
let oks = 0, fails = 0;
const check = (ok, what) => { if (ok) oks++; else fails++; console.log((ok ? 'ok   ' : 'FAIL ') + what); };
// the server datapack buylists (Scripts/data/dp/buylists) are not in the public package: the seed-tool checks need them (2026-10-15)
const HAVE_DP = fs.existsSync(path.join(DATA, 'dp', 'buylists')); let skipped = 0;
const checkDp = (ok, what) => { if (HAVE_DP) check(ok, what); else skipped++; };

// ---- 1) the seed tool ----
const SEED = require(path.join(__dirname, 'giran_shop_seed.js'));
const ITEMS = rd(path.join(DATA, 'gear_items.json')).items;
const SCAN = rd(path.join(DATA, 'shopscan_giran.json'));
const live = { at: SCAN.at, by: SCAN.by, shops: SCAN.shops.filter(s => !s.seeded).map(s => s.routeWas ? Object.assign({}, s, { route: s.routeWas, routeWas: undefined }) : s) };   // the scan as !shopscan wrote it
const base = { atlas: rd(path.join(DATA, 'npc_atlas.json')), items: ITEMS, routes: rd(path.join(DATA, 'giran_routes.json')), buylist: SEED.buylistReader(path.join(DATA, 'dp', 'buylists')), now: 'T' };
const s1 = SEED.seed(Object.assign({ scan: live }, base));
const sandra = s1.out.shops.find(s => s.npc === 'Sandra'), denkus = s1.out.shops.find(s => s.npc === 'Denkus');
checkDp(!!sandra && sandra.route === 'jewelry' && !sandra.unreachable && sandra.seeded, `Sandra seeded on the 'jewelry' route (${sandra ? sandra.route : 'missing'})`);
checkDp(!!sandra && sandra.alt.includes('Ellie'), 'Ellie (same spot, same lists) is Sandra\'s fallback name, not a second shop');
check(!s1.out.shops.some(s => s.npc === 'Ellie'), 'no separate Ellie entry');
checkDp(!!denkus && denkus.route === 'grocer' && denkus.routeWas === 'jewelry', `Denkus moved to the 'grocer' route (ends next to him) from 'jewelry' (${denkus && denkus.route})`);
const sComm = sandra && sandra.lists.find(l => l.items.some(i => i.id === 12335));
checkDp(!!sComm && sComm.path.join(' ') === 'Buy basic-type accessory.' && !sComm.pathGuess && sComm.items.every(i => i.est), `Common Nassen's Earring on Sandra's Common list (${sComm && sComm.path.join(' > ')}), prices marked estimated`);
checkDp(Math.abs(s1.tax - 1.155) < 0.01, `Giran tax factor measured on the scan: ${s1.tax}`);
check(!s1.out.shops.some(s => /Clan Hall/.test(s.title || '')), 'clan hall managers (Pledge Shield) are no gear merchants');
const s2 = SEED.seed(Object.assign({ scan: s1.out }, base));
checkDp(JSON.stringify(s2.out) === JSON.stringify(s1.out), 'seeding twice = the same file (idempotent)');
const noJewelRoute = JSON.parse(JSON.stringify(base.routes)); delete noJewelRoute.routes.jewelry;
const s3 = SEED.seed(Object.assign({}, base, { scan: live, routes: noJewelRoute }));
const sU = s3.out.shops.find(s => s.npc === 'Sandra');
checkDp(!!sU && !sU.route && /no recorded Giran route/.test(sU.unreachable || ''), `no recorded route to her = unreachable with a reason ("${sU && String(sU.unreachable).slice(0, 60)}...")`);
check(JSON.stringify(SCAN.shops.filter(s => !s.seeded).map(s => s.npc)) === JSON.stringify(['Graham', 'Stanford', 'Radia', 'Peta', 'Denkus']), 'the live-scanned shops stay in the file');
check(!!SCAN.shops.find(s => s.npc === 'Sandra' && s.route === 'jewelry'), 'Scripts/data/shopscan_giran.json carries the Sandra seed');

// ---- 2) the dashboard ----
const API = require(path.join(ROOT, 'Dashboard', 'gearpage_api.js'))._t;
const C = API.catalog(path.join(ROOT, 'Dashboard'));
const G = API.giranOffers(DATA, readJson);
const fighter = C.byClass[0], kit = C.arch[fighter.arch] || C.arch.fighter;
const nas = API.giranGet(C, G, 855, 'auto', kit);
check(!!nas && nas.id === 12335 && nas.how === 'common' && nas.npc === 'Sandra', `Human Fighter, Nassen's Earring: buys ${nas ? (C.items[nas.id] || {}).n + ' at ' + nas.npc + ' ' + nas.price : 'NOTHING (not sold in Giran)'}`);
check(!/not in the shop scan/.test(API.srcText(C, 855)), `item text no longer says "not in the shop scan": ${API.srcText(C, 855).slice(-60)}`);
const REC = require(path.join(ROOT, 'Dashboard', 'gear_recommend.js')).recommendAll(C, G, { fitOf: API.fitOf, giranGet: API.giranGet, srcText: API.srcText });
const bad = [];
C.classes.forEach(c => { const sl = (REC.byKey[REC.classKey[c.id]] || {}).C || {}; ['neck', 'earring', 'ring'].forEach(s => { const e = sl[s]; if (!e || /not sold in Giran/.test(e.why) || !/sold in Giran/.test(e.why)) bad.push(`${c.name} ${s}: ${e ? e.name + ' - ' + e.why : 'none'}`); }); });
check(!bad.length, `every class (${C.classes.length}): the C neck / earring / ring recommendation is sold in Giran${bad.length ? ' — ' + bad.slice(0, 3).join(' | ') : ''}`);
const recF = REC.byKey[REC.classKey[0]].C.earring;
check(!!recF && /sold in Giran .* as Common/.test(recF.why), `Human Fighter C earring: "${recF && recF.why}"`);
// with the OLD scan (no Sandra) it was "not sold in Giran" (the reported bug)
const Gold = API.giranOffers(DATA, (f, d) => /shopscan_giran/.test(f) ? live : readJson(f, d));
check(!API.giranGet(C, Gold, 855, 'auto', kit), 'regression: the old scan (no Sandra) did not sell Nassen\'s Earring');
// an unreachable merchant never counts as sold, and the item row warns
const Gun = API.giranOffers(DATA, (f, d) => /shopscan_giran/.test(f) ? s3.out : readJson(f, d));
checkDp(!API.giranGet(C, Gun, 855, 'auto', kit) && (Gun.unreach[12335] || []).includes('Sandra'), 'unreachable Sandra: not "sold in Giran" (unreach lists her)');
const pageU = API.classPage(C, {}, Gun, 0, 'C', [], {}, null, null);
const rowU = (pageU.cand.earring || []).find(r => r.id === 855);
checkDp(!!rowU && rowU.gu && rowU.gu.includes('Sandra') && !rowU.gc, 'the item card row carries the unreachable merchant (gu) instead of a Giran price');
API.giranOffers(DATA, readJson);   // LASTG back to the real file
const pageR = API.classPage(C, {}, G, 0, 'C', [], {}, null, null), rowR = (pageR.cand.earring || []).find(r => r.id === 855);
check(!!rowR && rowR.gc && rowR.gc[0] === 'Sandra' && rowR.gc[2] === 1, `item card: "Common about ${rowR && rowR.gc && rowR.gc[1]} at Sandra" (estimated flag)`);
const GP = fs.readFileSync(path.join(ROOT, 'Dashboard', 'gearpage.js'), 'utf8');
check(/r\.gu \?/.test(GP) && /r\.gc\[2\] \? 'about '/.test(GP), 'gearpage.js shows "about" for estimated prices and the unreachable-merchant warning');
check(/filter\(s => !s\.unreachable && s\.route\)/.test(fs.readFileSync(path.join(ROOT, 'Dashboard', 'server.js'), 'utf8')), 'server.js (old role catalog) skips unreachable merchants too');

// ---- 3) swarm.js ----
const a = src.indexOf('// ==== GIRANSHOPS-PURE begin'), b = src.indexOf('// ==== GIRANSHOPS-PURE end');
check(a > 0 && b > a, 'GIRANSHOPS-PURE block present');
const P = new Function(src.slice(a, b) + '\nreturn { shopLinkLike };')();
const L = (...t) => t.map(text => ({ text }));
const denL = L('Buy/Sell/Refund.', 'Buy/Sell/Refund Common Items.', 'Ask about the local lord and tax rate.', 'Quest.');
check(P.shopLinkLike(denL, 'Buy/Sell/Refund.').text === 'Buy/Sell/Refund.' && P.shopLinkLike(denL, 'Buy/Sell/Refund Common Items.').text === 'Buy/Sell/Refund Common Items.', 'exact link text first');
check(P.shopLinkLike(L('Buy / Sell / Refund', 'Quest.'), 'Buy/Sell/Refund.').text === 'Buy / Sell / Refund', 'same words, other punctuation');
check(P.shopLinkLike(L('Purchase', 'Trade Common Items.', 'Trade Accessories.', 'Quest.'), 'Buy/Sell/Refund Common Items.').text === 'Trade Common Items.' && P.shopLinkLike(L('Trade Common Items.', 'Trade Accessories.'), 'Buy/Sell/Refund.').text === 'Trade Accessories.', 'other wording: the one buy / trade link of the same kind (Common <-> Common)');
check(P.shopLinkLike(L('Trade A.', 'Trade B.'), 'Buy/Sell/Refund.') === null && P.shopLinkLike(denL, 'Quest list') === null, 'two candidates / not a shop link: null (never a guess between two)');
const sc = src.slice(src.indexOf('const SHOPSCAN = '), src.indexOf('const SCAN_SKIP'));
check(/\['grocer', 'Denkus'\]/.test(sc) && /\['jewelry', 'Sandra', \['Ellie'\]\]/.test(sc), '!shopscan reads Denkus on the grocer route and Sandra (or Ellie) on the jewelry route');
const scl = src.slice(src.indexOf('async function scanClick('), src.indexOf('async function shopScan('));
check(/shopLinkLike\(npcLinks\(html\), path\[i\]\)/.test(scl), 'scanClick uses shopLinkLike');
const bg = src.slice(src.indexOf('async function buyGearPicks('), src.indexOf('function bagCount('));
check(/G\.offer\.alt/.test(bg), 'buyGearPicks finds the merchant by its name or a fallback name (Sandra / Ellie)');
// the REAL planUpgrades (harness of test_gear_starter.js): a level-40 Warrior wearing D Common jewels
const cut = (x, y) => { const i = src.indexOf(x), j = src.indexOf(y, i + 1); if (i < 0 || j < 0) throw new Error('marker not found: ' + (i < 0 ? x : y)); return src.slice(i, j); };
const code = [cut('const ROLEKIND = {', '// role regexes'), cut('let shopIdxCache = null;', '/** Kamael: if I wear a sword'), cut('const isSaWeapon =', '/** Buy the picks:'),
  cut('let gearDbCache = null', 'const BODY_SLOTS = ['), cut('const BODY_SLOTS = [', 'const badEquip = {};')].join('\n');
const idOf = (n) => { const k = Object.keys(ITEMS).find(x => ITEMS[x].n === n); if (!k) throw new Error('no item ' + n); return Number(k); };
function plan(o) {
  const CONFIG = { gear: { roles: {}, races: {}, gradeLevel: { NONE: 1, D: 20, C: 40, B: 52, A: 61, S: 76, S80: 80, S84: 84 },
    upgrade: { on: true, auto: true, keep: 300000, minGain: 1, order: ['weapon', 'chest', 'legs', 'shield', 'head', 'gloves', 'feet', 'neck', 'earring', 'earring', 'ring', 'ring'],
      casterSets: [{ from: 1, healer: 'Devotion', caster: 'Devotion' }, { from: 40, healer: 'Karmian', caster: "Demon's" }] } }, healer: { roles: ['bishop', 'shilliensaint', 'healer'] } };
  let oid = 100;
  const inv = o.worn.map(n => ({ Id: idOf(n), objId: ++oid, Count: 1, IsEquiped: true, EnchantLvl: 0, Name: n }));
  const files = { 'gear_auto.json': JSON.stringify({ default: true, sameGradeSwap: true, keepArmorType: false }), 'gear_prefs.json': JSON.stringify(o.prefs || {}) };
  const File = { Exists: (f) => path.basename(String(f)) in files || fs.existsSync(String(f).replace(/^__S__/, DATA)),
    ReadAllText: (f) => { const s = String(f), bn = path.basename(s.replace(/\\/g, '/')); if (bn in files) return files[bn]; return fs.readFileSync(s.replace(/^__S__\\data/, DATA).replace(/\\/g, '/'), 'utf8'); },
    GetLastWriteTimeUtc: () => ({ Ticks: 1 }) };
  const fn = new Function('Me', 'state', 'CONFIG', 'File', '__SCRIPTS__', 'Inventory', 'hostSnap', 'now', 'num', 'logError', 'teamOf', 'soulTarget', 'myCrystals', 'soulReady', 'fileStamp', 'isHealerRole', code + '\nreturn { planUpgrades };');
  const num = (v) => typeof v === 'bigint' ? Number(v) : (Number(v) || 0);
  const M = fn({ Name: 'Tester', Level: o.level, ClassId: o.classId, objId: 1 }, { role: o.role }, CONFIG, File, '__S__', { forEach: (f) => inv.forEach(f) }, { inv: () => inv }, () => Date.now(), num,
    (w, e) => { throw new Error(w + ': ' + (e && e.message)); }, () => 'P', () => null, () => [], () => false, () => '1', () => false);
  return M.planUpgrades(o.budget || 5000000);
}
const dJewels = ['Common Item - Necklace of Darkness', "Common Item - Omen Beast's Eye", "Common Item - Omen Beast's Eye", 'Common Item - Mithril Ring', 'Common Item - Mithril Ring'];
[{ classId: 1, role: 'melee', n: 'Warrior' }, { classId: 4, role: 'tank', n: 'Human Knight' }, { classId: 45, role: 'destroyer', n: 'Orc Raider' }, { classId: 11, role: 'nuker', n: 'Wizard' }].forEach(m => {
  const r = plan(Object.assign({ level: 40, worn: dJewels }, m));
  const jb = r.buys.filter(p => ['neck', 'earring', 'ring'].includes(p.slot));
  const okC = jb.length >= 3 && jb.every(p => p.info.g === 'C' && /^Common Item/.test(p.info.n));
  const atSandra = jb.filter(p => /^(earring|neck|ring)$/.test(p.slot)).every(p => p.offer.npc === 'Sandra' ? p.offer.route === 'jewelry' : true) && jb.some(p => p.offer.npc === 'Sandra');
  check(okC && atSandra, `${m.n} lvl 40 with D Common jewels: buys C Common jewels at Sandra -> ${jb.map(p => `${p.info.n} @${p.offer.npc}/${p.offer.route}`).join(', ') || 'NOTHING (' + r.why + '; ' + r.skipped.join('; ') + ')'}`);
});

console.log(`
${oks} ok, ${fails} failed${skipped ? `, ${skipped} skipped (no datapack buylists in this install)` : ""}`);
process.exit(fails ? 1 : 0);
