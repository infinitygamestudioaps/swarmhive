// test_boost_level.js (2026-11-15): guards BOOSTLEVEL + HOFFRESUME in Scripts_dev/swarm.js.
// BOOSTLEVEL (owner: "take all of them to +1, then all to +2 then all to +3 and so on NOT 1 at the time"): boostNext picks the lowest level
// among every covered piece; a piece above the rule's range (the owner's existing +8) is never picked; the log names THIS piece.
// HOFFRESUME (owner, playing Crafter1 by hand: "STOP MOVING HIM!!!!!"): a hands-off character resumes nothing after a reload.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const SRC = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'Scripts_dev', 'swarm.js'), 'utf8');
let fails = 0, n = 0;
const ok = (c, m) => { n++; if (!c) { fails++; console.log('FAIL ' + m); } };
function block(tag) { const a = SRC.indexOf(`// ${tag}-PURE-BEGIN`), b = SRC.indexOf(`// ${tag}-PURE-END`); if (a < 0 || b < 0) throw new Error('no block ' + tag); return SRC.slice(a, b); }
const ctx = {}; vm.createContext(ctx); vm.runInContext(block('BOOST'), ctx);
const { boostNext, boostParseRules } = ctx;

// five kinds 0 -> 8, all copies, one piece already +8 (must stay untouched)
const rules = boostParseRules('472:1:952:0:8;441:10:952:0:8;2462:20:952:0:8');
ok(rules.length === 3, 'three rules parsed');
let bag = [
  { objId: 99, id: 472, lvl: 8 },                       // the owner's +8 stockings
  { objId: 1, id: 472, lvl: 0 }, { objId: 2, id: 472, lvl: 0 },
  { objId: 10, id: 441, lvl: 0 }, { objId: 11, id: 441, lvl: 0 },
  { objId: 20, id: 2462, lvl: 1 }, { objId: 21, id: 2462, lvl: 0 }
];
const counts = { 952: 1000 };
// simulate: every try succeeds -> the order must be level by level (all +0 -> +1 before any +1 -> +2)
const order = [];
for (let i = 0; i < 200; i++) {
  const nx = boostNext(rules, bag, counts, true); if (nx.done) break;
  order.push(nx.lvl); ok(nx.objId !== 99, 'the existing +8 piece is never picked');
  bag.find(b => b.objId === nx.objId).lvl++;
}
let sorted = true; for (let i = 1; i < order.length; i++) if (order[i] < order[i - 1]) sorted = false;
ok(sorted, 'levels are taken lowest first (all to +1, then all to +2 ...): ' + order.join(','));
ok(order.filter(l => l === 0).length === 5, 'every +0 piece got its first step before any went on (5 at +0)');
ok(bag.filter(b => b.objId !== 99).every(b => b.lvl === 8), 'every covered piece ends at +8');
ok(bag.find(b => b.objId === 99).lvl === 8, 'the +8 piece stays +8');
ok(boostNext(rules, bag, counts, true).done, 'done when all are at the top');
// a broken piece leaves the bag: the rest go on, still lowest first
bag = [{ objId: 1, id: 472, lvl: 4 }, { objId: 2, id: 472, lvl: 5 }, { objId: 10, id: 441, lvl: 3 }];
ok(boostNext(rules, bag, counts, true).objId === 10, 'lowest level across kinds first (+3 tunic before +4 stockings)');
// no scrolls -> done with the reason
ok(/no scroll/.test(boostNext(rules, bag, { 952: 0 }, true).done || ''), 'no scroll left -> done with the reason');
// without "all" only the listed objIds
bag = [{ objId: 1, id: 472, lvl: 2 }, { objId: 2, id: 472, lvl: 0 }];
ok(boostNext(rules, bag, counts, false).objId === 1, 'without enchant-all only the listed piece');

// source guards
ok(/BOOSTLEVEL-2026-11-15: the name of THIS piece/.test(SRC) && /num\(i\.objId\) === nx\.objId/.test(SRC), 'the boost log names the enchanted piece by objId');
const ra = SRC.indexOf('async function resumeActivity()');
ok(ra > 0 && /handsOffMe\(\)\) \{ note\('resume: hands off/.test(SRC.slice(ra, ra + 900)), 'resumeActivity returns at once on a hands-off character (before the raid resume)');
const ro = SRC.indexOf('function resumeOrder()');
ok(ro > 0 && /handsOffMe\(\)\) return;/.test(SRC.slice(ro, ro + 300)), 'resumeOrder never replays a saved order on a hands-off character');

console.log(fails ? `${fails}/${n} FAILED` : `ALL ${n} CHECKS PASS`);
process.exit(fails ? 1 : 0);
