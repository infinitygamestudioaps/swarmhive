// QCIRCUIT-2026-10-25 test (owner: "repeat quest infinite times like circuit page but with quests"): the circuit's pure part (next quest,
// wrap-around + rounds, a quest that cannot be taken is skipped) and the wiring (needs Start, waits for a running quest, the leader drives).
//   node docs/plan/tools/test_qcircuit.js
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..', '..', '..');
const SW = fs.readFileSync(path.join(ROOT, fs.existsSync(path.join(ROOT, 'Scripts_dev', 'swarm.js')) ? 'Scripts_dev/swarm.js' : 'Scripts/swarm.js'), 'utf8');
let fails = 0; const t = (c, m, x) => { if (c) console.log('ok   ' + m); else { fails++; console.log('FAIL ' + m + (x !== undefined ? ' — ' + JSON.stringify(x) : '')); } };
const a = SW.indexOf('// ==== QCIRCUIT-PURE begin'), b = SW.indexOf('// ==== QCIRCUIT-PURE end');
t(a > 0 && b > a, 'QCIRCUIT-PURE block found');
const sb = {}; vm.createContext(sb); vm.runInContext(SW.slice(a, b), sb);
const L = [{ id: 101, times: 3 }, { id: 202 }, { id: 303, times: 2 }];
let st = {};
let n = sb.qcNext(L, st); t(n.id === 101 && n.times === 3 && n.i === 0, 'first: quest 101, 3 runs', n);
st = sb.qcAfter(st, n, { status: 'done' }, L.length); n = sb.qcNext(L, st); t(n.id === 202 && n.times === 1, 'then 202 (1 run by default)', n);
st = sb.qcAfter(st, n, { status: 'done' }, L.length); n = sb.qcNext(L, st); t(n.id === 303, 'then 303', n);
st = sb.qcAfter(st, n, { status: 'done' }, L.length); n = sb.qcNext(L, st);
t(n.id === 101 && st.round === 1, 'after the last one: back to the first, round 1 counted (forever)', st);
st = sb.qcAfter(st, n, { status: 'cannot', lastMsg: 'one-time quest already done' }, L.length);
t(st.skip[101] && /already done/.test(st.skip[101]), 'a quest that cannot be taken is marked skipped', st.skip);
n = sb.qcNext(L, st); st = sb.qcAfter(st, n, { status: 'done' }, L.length); st = sb.qcAfter(st, sb.qcNext(L, st), { status: 'done' }, L.length);
n = sb.qcNext(L, st); t(n.id === 202, 'the skipped quest is passed over in the next round', n);
t(sb.qcNext([{ id: 5 }], { skip: { 5: 'x' } }) === null, 'everything skipped -> nothing to start');
t(sb.qcNext([], {}) === null, 'an empty list -> nothing to start');
t(st.runs === 6, 'runs are counted (6 ended above)', st.runs);
// wiring
const blk = SW.slice(SW.indexOf('// ---- QUEST CIRCUIT'), SW.indexOf('/** !questfarm [status] */', SW.indexOf('// ---- QUEST CIRCUIT')));
t(/if \(!runOn\(\)\) return;/.test(blk), 'it needs the party\'s Start (RUNSTATE)');
t(/if \(Q\.running\) return;/.test(blk) && blk.indexOf('if (Q.running) return;') < blk.indexOf('qeStart('), 'never while a quest runs');
t(/if \(teamNames\(\)\.length && !isLeader\(\)\) return;/.test(blk), 'the party leader drives it');
t(/inRaid\(\) \|\| state\.mode === 'mission'/.test(blk) && /orderState\.at && now\(\) - orderState\.at < QE_CFG\.farmAfterOrderMs/.test(blk), 'never in a raid / mission, your own order wins');
t(/qeStart\(\{ id: n\.id, repeat: n\.times, mode, qcircuit: true \}\)/.test(blk), 'it runs the quest engine with repeat = times');
console.log(fails ? `\n${fails} FAILED` : '\nall checks passed');
process.exit(fails ? 1 : 0);
