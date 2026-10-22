// OFFLINE TEST of DPCOV-2026-10-21 (owner: "Most of the small chars have death penalty and no COV?"). Nothing live.
//   node docs/plan/tools/test_dpcov.js        (exit code 1 when a check fails)
//   A  pure decisions (DPCOV-PURE of Scripts_dev/swarm.js): scrolls to buy, the DP trip, safe spot vs Giran trip, deadly spot rule
//   B  hooks: Giran regroup, !gearup, KEEPHUNT rebuff -> Giran trip, team step 'dprun', swarm.pos dp/dps, the loop re-picks after the trip,
//      the deadly-spot skip only for hive-picked spots, storeCov ON for the 10 Flyt parties (owner file, when present)
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const SRC = fs.readFileSync(process.env.SWARM_JS || path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
let pass = 0, fail = 0;
const check = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (c) pass++; else fail++; };
const cut = (a, b) => { const i = SRC.indexOf(a), j = SRC.indexOf(b); if (i < 0 || j < 0) throw new Error('markers missing: ' + a); return SRC.slice(i, j); };

console.log('A) pure decisions');
const P = new Function(cut('// DPCOV-PURE-BEGIN', '// DPCOV-PURE-END') + '\nreturn { DPCOV, dpScrollNeed, dpTripDue, khRebuffMode, spotDeathsTooMany };')();
check(P.dpScrollNeed(11, 0, 3) === 14, 'DP 11, no scrolls -> 14 (one per level + reserve 3)');
check(P.dpScrollNeed(0, 1, 3) === 2 && P.dpScrollNeed(0, 5, 3) === 0, 'no penalty: tops the reserve up to 3, nothing when carrying 5');
check(P.dpScrollNeed(2, 9, 3) === 0, 'carrying enough for the penalty + reserve -> nothing to buy (the field loop reads them)');
check(P.dpTripDue([{ name: 'Spoiler8', dp: 11, scrolls: 0 }, { name: 'Healer8', dp: 0, scrolls: 0 }], 4, 2) === true, 'duo: one member at DP >= 4 without scrolls -> the trip is due');
check(P.dpTripDue([{ name: 'A', dp: 6, scrolls: 2 }], 4, 2) === false, 'a member carrying scrolls reads them in the field -> no trip');
check(P.dpTripDue([{ name: 'A', dp: 5, scrolls: 0 }, { name: 'B', dp: 1, scrolls: 0 }], 4, 6) === false, 'party of 6: one member at the threshold is not enough');
check(P.dpTripDue([{ name: 'A', dp: 5, scrolls: 0 }, { name: 'B', dp: 4, scrolls: 0 }], 4, 6) === true, 'party of 6: two members at the threshold -> due');
check(P.dpTripDue([{ name: 'A', dp: 3, scrolls: 0 }], 0, 1) === false && P.dpTripDue([{ name: 'A', dp: 4, scrolls: 0 }], 0, 1) === true, 'threshold missing -> the default 4');
check(P.khRebuffMode(true, false) === 'giran' && P.khRebuffMode(false, true) === 'giran' && P.khRebuffMode(false, false) === 'safe', 'storeCov on or DP due -> Giran trip, else the safe spot');
const t = 10 * 3600000;
check(P.spotDeathsTooMany([t - 50 * 60000, t - 20 * 60000, t], t) === true, '3 deaths within an hour -> too dangerous');
check(P.spotDeathsTooMany([t - 90 * 60000, t - 20 * 60000, t], t) === false, 'one of them older than an hour -> not yet');

console.log('B) hooks');
check(/if \(action === 'dprun'\)[\s\S]{0,700}dpBuyMine\(/.test(SRC), "team step 'dprun': members buy + read their scrolls (staggered)");
check(/async function dpBuyMine[\s\S]{0,900}giranGo\('grocer'\)[\s\S]{0,400}Helvetia[\s\S]{0,300}buyAt\(/.test(SRC), 'dpBuyMine walks to Helvetia (her recorded route) and buys there');
check(/async function dpBuyMine[\s\S]{0,1800}UseItem\(r\.id\)/.test(SRC), 'the bought scrolls are read at once');
check(/d\.dp = deathPenaltyLevel\(\); d\.dps = itemCount\(recoveryScroll\(\)\.id\)/.test(SRC), 'swarm.pos carries DP level + scroll count');
check(/giranServices\('at the Giran regroup'\)/.test(SRC), 'Giran regroup runs the services');
check(/giranServices\('after the gear purchases'\)/.test(SRC), '!gearup (the plan gear step) runs the services');
check(/async function giranServices[\s\S]{0,1600}pautoOn\('storeCov'\)[\s\S]{0,200}storeBuyBuff\(STORE_COV\.id, 'Party'/.test(SRC), 'services: COV for the party when storeCov is on');
check(/async function giranServices[\s\S]{0,2400}pautoOn\('vitality'\)/.test(SRC), 'services: Gift of Vitality when its switch is on');
check(/async function giranServices[\s\S]{0,400}lastSupplyAtGet\(\)/.test(SRC), 'services skipped right after a supply run (it did them)');
check(/khRebuffMode\(buffDue && pautoOn\('storeCov'\), dpDue \|\| bagFull\.length > 0\) === 'giran'/.test(SRC) && /khGiranRebuffTrip\(why, solo\)\) return 'giran'/.test(SRC), 'KEEPHUNT rebuff -> Giran trip when storeCov / DP due');
check(/rb === 'giran'\) \{ lastPick = 0; autoLvl\.spot = null; continue; \}/.test(SRC), 'after the Giran trip the hunting loop picks its spot again (= travels straight back)');
check(/else if \(autoLvl\.spot && !autoLvl\.spot\.manual\) \{[\s\S]{0,400}spotDeathsTooMany/.test(SRC), 'deadly-spot skip only for hive-picked spots (your dashboard choice is never skipped)');
const PA = path.join(ROOT, 'Scripts', 'data', 'party_auto.json');
if (fs.existsSync(PA) && fs.existsSync(path.join(ROOT, 'swarm.config.json')) && /flyt/i.test(fs.readFileSync(path.join(ROOT, 'swarm.config.json'), 'utf8'))) {
  const j = JSON.parse(fs.readFileSync(PA, 'utf8').replace(/^﻿/, ''));
  const L = ['Spoiler7', 'Spoiler8', 'Spoiler9', 'Spoiler10', 'Spoiler11', 'Spoiler12', 'Spoiler13', 'Spoiler14', 'Spoiler15', 'Spoiler16'];
  check(L.every(n => j.parties && j.parties[n] && j.parties[n].storeCov === true), 'owner install: storeCov ON for the 10 Flyt parties');
} else check(true, 'owner file not present (public install): nothing to check');
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
