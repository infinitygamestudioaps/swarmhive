// OFFLINE TEST (public tester 1.8.17, 2026-10-23: "Out of Spirit Ore" shown on the healer settings page with 270k Spirit Ore in the bag).
//   node docs/plan/tools/test_ore_have.js        (exit code 1 when a check fails)
'use strict';
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'Scripts_dev', 'swarm.js'), 'utf8');
let fails = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails++; };
const i = src.indexOf('// OREFALSE-PURE-BEGIN'), j = src.indexOf('// OREFALSE-PURE-END');
check(i > 0 && j > i, 'OREFALSE-PURE block exists');
const D = new Function(src.slice(i, j) + '\nreturn oreHaveDecide;')();
check(D({ ic: 270000, bag: 270000, bagKinds: 40 }, 1, 0, 1000).has === true, '270k ore: has it');
check(D({ ic: 0, bag: 270000, bagKinds: 40 }, 4, 0, 1000).has === true, 'ItemCount reads 0 but the bag stacks hold 270k: has it');
check(D({ ic: 270000, bag: 0, bagKinds: 40 }, 4, 0, 1000).has === true, 'bag mirror lags but ItemCount says 270k: has it');
check(D({ ic: 0, bag: 0, bagKinds: 0 }, 1, 0, 1000).has === true, 'bag not loaded (0 entries): unknown, never "out"');
const a = D({ ic: 0, bag: 0, bagKinds: 40 }, 1, 0, 1000);
check(a.has === true && a.firstMiss === 1000, 'a fresh shortage is not reported at once (bag refresh)');
check(D({ ic: 0, bag: 0, bagKinds: 40 }, 1, 1000, 12000).has === false, 'a shortage that holds for 10 s: out of ore');
check(D({ ic: 3, bag: 3, bagKinds: 40 }, 4, 1000, 12000).has === false, '3 ore for Major Group Heal (4): out');
const kn = (() => { const k = src.indexOf('function hsKnownNow('); return src.slice(k, src.indexOf('\n}', k)); })();
check(/oreHave\(item, itemN\)/.test(kn) && !/itemCount\(item\) >= itemN/.test(kn), 'hsKnownNow uses oreHave (no single-source count)');
console.log(fails ? `\n${fails} FAILED` : '\nALL OK');
process.exit(fails ? 1 : 0);
