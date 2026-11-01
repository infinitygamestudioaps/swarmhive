// test_owner_first.js - requirement orders.md (owner 2026-10-30 "if i cast a order it should take precedence over your decicion"): an internal
// hand-over step (letters / loot / clan items: orderBegin('!handover <id>')) never ends the owner's running order and never makes a retry loop of
// the owner's order step aside. Lifts orderBegin / orderReplaced from Scripts_dev/swarm.js and runs them.
const fs = require('fs'), path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'Scripts_dev', 'swarm.js'), 'utf8');
let ok = 0, bad = 0; const check = (c, m) => { if (c) { ok++; console.log('ok   ' + m); } else { bad++; console.log('FAIL ' + m); } };
const i = SRC.indexOf('function orderInternalText('), j = SRC.indexOf('function orderSave(');
check(i > 0 && j > i, 'orderInternalText / orderReplaced / orderBegin found');
let ended = 0;
const F = new Function('now', 'userOrderEnd', 'FORM', 'state', 'File', 'orderFile', 'num',
  'const orderState = { seq: 0, text: "", at: 0, userSeq: 0 };\n' + SRC.slice(i, j).replace(/^\s*\/\/.*$/gm, '') + '\nreturn { orderBegin, orderReplaced, orderState };');
const O = F(() => 1, () => { ended++; }, { until: 0 }, {}, { Exists: () => false, Delete: () => { } }, () => '', Number);
const start = O.orderBegin('!start');
check(ended === 1, 'a real order (!start) ends the previous owner order once');
O.orderBegin('!handover letters_shaded_1');
check(ended === 1, "an internal hand-over (!handover) does NOT end the owner's !start");
check(O.orderReplaced(start) === false, "the owner's !start is not 'replaced' by the hand-over (its retry loop keeps going)");
O.orderBegin('!park');
check(ended === 2 && O.orderReplaced(start) === true, 'a real newer order (!park) still replaces it');
const rt = SRC.slice(SRC.indexOf('const d = orderRetryDecide({'), SRC.indexOf('const d = orderRetryDecide({') + 200);
check(/superseded: orderReplaced\(seq\)/.test(rt), "the order retry loop asks orderReplaced(seq), not 'any order came'");
console.log(`owner first: ${ok} ok, ${bad} failed`);
process.exit(bad ? 1 : 0);
