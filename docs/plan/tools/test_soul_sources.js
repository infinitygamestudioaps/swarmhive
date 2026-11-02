// SOULSRC-2026-11-02 (tester Vykaax): "Get crystals" takes owned crystals first (distributors / collector / clan warehouse), then buys stage 7-10 at
// the Giran luxury shop with crystals from the bag, the free stage-0 crystal from Gideon last; never a crystal another character levels.
const fs = require('fs'), path = require('path');
const R = path.join(__dirname, '../../..'), SRC = fs.readFileSync(path.join(R, 'Scripts_dev/swarm.js'), 'utf8');
let ok = 0, bad = 0; const check = (c, m) => { if (c) { ok++; console.log('ok   ' + m); } else { bad++; console.log('FAIL ' + m); } };
const a = SRC.indexOf('// SOULSRC-PURE-BEGIN'), b = SRC.indexOf('// SOULSRC-PURE-END');
const P = new Function('num', SRC.slice(a, b) + '\nreturn { soulSrcCfg, soulWantIds, soulBuyPick, soulGiverOk };')(v => Number(v) || 0);
const i0 = SRC.indexOf('const SOUL_IDS = {'), SOUL_IDS = new Function(SRC.slice(i0, SRC.indexOf('};', i0) + 2) + '\nreturn SOUL_IDS;')();
// settings
const d = P.soulSrcCfg(null); check(d.own && d.buy && d.free, 'no setting = all three sources ON (the new order)');
const o = P.soulSrcCfg({ sources: { free: false } }); check(o.own && o.buy && !o.free, 'a source switched off on the Crystals page stays off');
// highest stage first
const ids = P.soulWantIds(SOUL_IDS, 'red', 10);
check(ids[0] === 4639 && ids[1] === 4638 && ids.length === 10 && !ids.includes(4629), 'owned: red stage 10, 9, ... 1 asked for (stage 0 never asked)');
check(P.soulWantIds(SOUL_IDS, 'green', 8)[0] === 4648, 'a target stage 8 caps the ask at stage 8');
// luxury shop: only what the bag can pay, highest stage first
const offers = [
  { id: 4636, name: 'Red Soul Crystal - Stage 7', cost: [{ id: 1458, count: 500 }, { id: 1459, count: 100 }] },
  { id: 4637, name: 'Red Soul Crystal - Stage 8', cost: [{ id: 1458, count: 567 }, { id: 1459, count: 120 }] },
  { id: 4639, name: 'Red Soul Crystal - Stage 10', cost: [{ id: 1459, count: 150 }, { id: 1460, count: 50 }] }];
check(P.soulBuyPick(offers, ids, { 1458: 600, 1459: 130 }).id === 4637, 'luxury: stage 8 when the bag pays 567 D + 120 C (not stage 10 without B crystals)');
check(P.soulBuyPick(offers, ids, { 1459: 200, 1460: 60 }).id === 4639, 'luxury: stage 10 with C + B crystals');
check(P.soulBuyPick(offers, ids, { 1458: 100 }) === null, 'luxury: nothing bought without the crystals in the bag');
// givers
check(!P.soulGiverOk(true, 'bag', false, false), 'a plain character never gives its soul crystal (it levels it)');
check(P.soulGiverOk(true, 'bag', true, false) && P.soulGiverOk(true, 'bag', false, true) && P.soulGiverOk(true, 'clan', false, false), 'distributor, collector and clan warehouse give crystals');
check(P.soulGiverOk(false, 'bag', false, false), 'gear pieces keep the old bag rule');
// wiring
check(/if \(SS\.own\) \{ try \{ got = await soulFromOwned\(col\);[\s\S]{0,200}if \(!got && SS\.buy\) \{ try \{ got = await soulBuyLuxury\(col\);/.test(SRC), 'soulGetCrystal: owned, then the luxury shop, before Gideon');
check(/if \(!okGive\(isCr\(id\), src\)\) continue;/.test(SRC) && /return soulGiverOk\(cr, s, dist, isColl\)/.test(SRC), 'the gear-up giver side applies the crystal rule');
const HTML = fs.readFileSync(path.join(R, 'Dashboard/index.html'), 'utf8');
check(HTML.includes('data-scsrc="own"') && HTML.includes('data-scsrc="buy"') && HTML.includes('data-scsrc="free"'), 'the Crystals page has the three source switches');
console.log(`soul sources: ${ok} ok, ${bad} failed`); process.exit(bad ? 1 : 0);
