// RCTOWN-2026-11-03 (owner: "Tank3 has still not delivered his items to crafter1 or sold crap in town. Should be able to put in town visit
// between the circuit"): a raid circuit goes to town between two bosses (bag % or N kills), every member hands its loot to the BANK, the bank
// sells / crystallizes / stores at once, then the supply top-up; the clan warehouse stays the fallback (no bank / bank offline / a member failed)
const fs = require('fs'), path = require('path'), R = path.join(__dirname, '../../..');
const SRC = fs.readFileSync(path.join(R, 'Scripts_dev/swarm.js'), 'utf8');
let ok = 0, bad = 0; const t = (m, c) => { if (c) { ok++; console.log('ok   ' + m); } else { bad++; console.log('FAIL ' + m); } };
const i = SRC.indexOf('function rcTownVisitDue('), e = SRC.indexOf('\n/** the fullest bag % of the circuit team', i);
const D = new Function(SRC.slice(i, e) + '\nreturn rcTownVisitDue;')();
const N = 1e12;
// the Tank3 case: bag 90 %, no kill since the last visit (every boss trip failed / was skipped) -> a town visit
t('Tank3 replay: bag 90 %, no kills -> town visit', D({ on: true, sinceStash: 0, stashEvery: 1, bagPct: 90, townBagPct: 80, lastAt: 0, nowMs: N }).go === true);
t('a kill since the last visit (stashEvery 1) -> town visit', D({ on: true, sinceStash: 1, stashEvery: 1, bagPct: 20, townBagPct: 80, lastAt: 0, nowMs: N }).go === true);
t('bags low and no kill -> no visit', D({ on: true, sinceStash: 0, stashEvery: 1, bagPct: 40, townBagPct: 80, lastAt: 0, nowMs: N }).go === false);
t('at most one visit per 15 min (a bag that cannot be emptied never loops)', D({ on: true, sinceStash: 3, stashEvery: 1, bagPct: 95, townBagPct: 80, lastAt: N - 5 * 60000, nowMs: N }).go === false);
t('switched off on the Circuit tab -> no visit', D({ on: false, sinceStash: 3, stashEvery: 1, bagPct: 95, townBagPct: 80, lastAt: 0, nowMs: N }).go === false);
t('townBagPct missing -> 80 % default', D({ on: true, sinceStash: 0, stashEvery: 0, bagPct: 80, lastAt: 0, nowMs: N }).go === true && D({ on: true, sinceStash: 0, stashEvery: 0, bagPct: 79, lastAt: 0, nowMs: N }).go === false);
// source checks
const loopAt = SRC.indexOf("// RCTOWN-2026-11-03 (owner: \"Tank3 has still not delivered"), choose = SRC.indexOf("rcPhase('choosing', 'choosing the next boss');", loopAt);
t('checked at the TOP of every circuit round (between bosses, before choosing the next), never in a raid', loopAt > 0 && choose > loopAt && choose - loopAt < 900 && SRC.slice(loopAt, choose).includes('if (!inRaid()) { const due = rcTownVisitDue('));
t('the town visit hands the loot to the bank first (team event + own hand-over), the clan warehouse only as fallback',
  SRC.includes("rcPhase('stash', `town visit - handing loot to ${S.bank} (${why})`);") && SRC.includes("App.emit('swarm.rc.tobank', { leader: Me.Name, why });") && SRC.includes("return 'ok (bank)';"));
t('every member hands over with the runner take rules and tells the bank (swarm.runner.delivered -> sell / crystallize / store)',
  /async function rcBankHandMe\(why\)[\s\S]{0,400}crunHandRows\(hovBag\(\)\)[\s\S]{0,700}App\.emit\('swarm\.runner\.delivered'/.test(SRC) && SRC.includes("App.on('swarm.rc.tobank', (e) =>"));
t('defaults: town visit ON, 80 %', SRC.includes('townVisit: true, townBagPct: 80,'));
const API = fs.readFileSync(path.join(R, 'Dashboard/circuitpage_api.js'), 'utf8'), UI = fs.readFileSync(path.join(R, 'Dashboard/circuitpage.js'), 'utf8');
t('the Circuit tab shows and saves the switch + the bag %', API.includes('o.townVisit = e.townVisit !== false;') && API.includes('townBagPct: [0, 100]') && UI.includes('data-rcset="townVisit"') && UI.includes("numf('townBagPct'"));
console.log(`rc town: ${ok} ok, ${bad} failed`); process.exit(bad ? 1 : 0);
