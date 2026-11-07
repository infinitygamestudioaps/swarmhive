// RAIDHEAL guard (owner 2026-11-06: "Investigate WHY we keep dying to raidbosses" -> "Do 2"): 26 raid deaths on 11-06 vs 1 on 11-05.
// Cletu: the healer stood against a wall, the stay-inside leash sent her to the same blocked point 986 times (12 heals in 13 min, wipe).
// Archon: the raid spacing walked the healer away from a minion every 700 ms and cancelled every heal; the tank died 20 s after her last heal.
'use strict';
const fs = require('fs'), path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '../../../Scripts_dev/swarm.js'), 'utf8');
let ok = 0, bad = 0; const t = (m, c, x) => { if (c) { ok++; console.log('ok   ' + m); } else { bad++; console.log('FAIL ' + m + (x === undefined ? '' : ' ' + JSON.stringify(x))); } };
const cut = (a, b) => SRC.slice(SRC.indexOf(a), SRC.indexOf(b));
const P = new Function(cut('// RAIDHOLD-PURE-BEGIN', '// RAIDHOLD-PURE-END') + '\nreturn { leashStuckStep, healerHoldStill, RAIDHOLD };')();

// ---- HEALHOLD ----
const H = (o) => P.healerHoldStill(Object.assign({ healer: true, casting: false, myHp: 100, teamLow: 100 }, o));
t('a healer casting a heal is never walked away (the Archon death)', H({ casting: true }) === true);
t('a teammate below 60 % = the healer stands and heals', H({ teamLow: 45 }) === true);
t('nobody hurt and no cast = the spacing may move her', H({}) === false);
t('her own life first: below 35 % she may run', H({ casting: true, myHp: 30 }) === false);
t('only healers hold still', P.healerHoldStill({ healer: false, casting: true, myHp: 100, teamLow: 10 }) === false);

// ---- LEASHSTUCK ----
let r = P.leashStuckStep({}, { now: 0, x: 0, y: 0, hasTank: true });
t('first tick: walk back to the area edge as before', r.act === 'edge');
r = P.leashStuckStep(r.st, { now: 1500, x: 10, y: 0, hasTank: true });
t('under 3 s without progress: still the edge', r.act === 'edge');
r = P.leashStuckStep(r.st, { now: 3200, x: 12, y: 0, hasTank: true });
t('stuck 3 s at a wall: walk toward the tank instead (the Cletu wall)', r.act === 'tank');
const moving = P.leashStuckStep(r.st, { now: 4000, x: 300, y: 0, hasTank: true });
t('progress toward the tank keeps that way', moving.act === 'tank');
r = P.leashStuckStep(r.st, { now: 6500, x: 14, y: 0, hasTank: true });
t('stuck again: stop pushing (no 986x loop)', r.act === 'pause');
t('the pause lasts 20 s', P.leashStuckStep(r.st, { now: 6500 + 19000, x: 14, y: 0 }).act === 'pause' && P.leashStuckStep(r.st, { now: 6500 + 20001, x: 14, y: 0 }).act === 'edge');
let n = P.leashStuckStep({}, { now: 0, x: 0, y: 0, hasTank: false }); n = P.leashStuckStep(n.st, { now: 3100, x: 0, y: 0, hasTank: false });
t('no tank to walk to (I am the tank): stuck = pause', n.act === 'pause');

// ---- host wiring ----
t('the leash: a healer who must heal is not moved', /if \(healHoldNow\(\)\) return;\s+\/\/ HEALHOLD/.test(SRC));
t('the leash uses the stuck step', /leashStuckStep\(LEASH\.st, \{ now: now\(\), x: num\(Me\.X\), y: num\(Me\.Y\), hasTank \}\)/.test(SRC));
t('the raid spacing: a healer who must heal is not moved', /if \(healer && healHoldNow\(\)\) return;\s+\/\/ HEALHOLD/.test(SRC));
const sp = SRC.indexOf('if (healer && healHoldNow()) return;'), run = SRC.indexOf('is on me — running to ${T.Name} so he can take it');
t('the hold comes before the "run to the tank" walk', sp > 0 && run > sp);
console.log(`raidheal: ${ok} ok, ${bad} failed`); process.exit(bad ? 1 : 0);
