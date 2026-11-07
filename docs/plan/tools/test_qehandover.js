// QEHANDOVER guard (2026-11-06, owner: "ret de fastlåste hold"): Nuker21's academy group stood in Giran for 16 h - the runner's automatic
// "!handover crun_..." counted as "a newer order replaced it", quest 412 stopped and the plan step paused for good. Only a REAL newer order
// ends a quest run; an internal hand-over only pauses it.
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '../../..');
const SRC = fs.readFileSync(path.join(ROOT, 'Scripts_dev/swarm.js'), 'utf8');
let ok = 0, bad = 0; const t = (m, c, x) => { if (c) { ok++; console.log('ok   ' + m); } else { bad++; console.log('FAIL ' + m + (x === undefined ? '' : ' ' + JSON.stringify(x))); } };
const grab = (a, b) => { const i = SRC.indexOf(a); const j = SRC.indexOf(b, i); return i >= 0 && j > i ? SRC.slice(i, j) : ''; };
// the order machinery + the quest stop check, run for real
const body = [grab('function orderInternalText(', '\n'), grab('function orderReplaced(', '\n'), grab('function qeReplaced(', '\n')].join('\n');
const M = new Function(`const orderState = { seq: 0, text: '', userSeq: 0 };
  function orderBegin(text) { orderState.seq++; orderState.text = String(text || ''); if (!orderInternalText(text)) orderState.userSeq = orderState.seq; return orderState.seq; }
  ${body}
  return { orderState, orderBegin, qeReplaced, orderInternalText };`)();
M.orderBegin('plan: quest 412'); const Q = { orderSeq: M.orderState.seq };
t('a quest run is not replaced at its start', !M.qeReplaced(Q));
M.orderBegin('!handover crun_nuker21_mw3mprja');
t('the runner hand-over (internal) does NOT end the quest run', !M.qeReplaced(Q));
M.orderBegin('!handover letters_x');
t('several internal hand-overs still do not', !M.qeReplaced(Q));
M.orderBegin('!stop');
t('a real newer order (the owner\'s !stop) does end it', M.qeReplaced(Q));
t('qeStopped uses the real-order check, not the raw seq', /function qeStopped\(\) \{ const Q = qeS\(\); return Q\.stop \|\| !state\.running \|\| qeReplaced\(Q\); \}/.test(SRC) && !/orderState\.seq !== Q\.orderSeq/.test(SRC));
t('qeHold waits while a hand-over holds control (never grabs it from the hand-over)', /if \(orderInternalText\(control\.owner\)\) \{[^\n]*the quest waits for it[^\n]*continue; \}/.test(SRC));
t('the "a newer order replaced it" note only for a real order', /if \(result === 'stopped' && !Q\.stop && qeReplaced\(Q\)\) S\.active\.msg/.test(SRC));
t('the plan step already skips internal orders (planInterrupted)', /if \(!orderCmdIs\(w\)\) \{ PLAN\.seq = orderState\.seq; return ''; \}/.test(SRC));
console.log(`qehandover: ${ok} ok, ${bad} failed`); process.exit(bad ? 1 : 0);
