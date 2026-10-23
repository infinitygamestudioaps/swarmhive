// RECOMMEND-2026-10-23 (public tester: "just a toggle per party to recommend each other and keep it at 255"):
//  pure pick (RECOMMEND-PURE), the party switch in swarm.js PAUTO_KINDS + Dashboard/partyauto_api.js (default OFF, same order), the host wiring
//   node docs/plan/tools/test_recommend.js
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const src = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m + (x !== undefined ? ' — ' + x : '')); } };
const a = src.indexOf('// RECOMMEND-PURE-BEGIN'), b = src.indexOf('// RECOMMEND-PURE-END');
ok(a > 0 && b > a, 'RECOMMEND-PURE block present');
const K = new Function(src.slice(a, b) + '\nreturn { RECOM, recomPick };')();
const M = (name, have, d, extra) => Object.assign({ name, objId: name.length * 7, have, d: d == null ? 100 : d, dead: false }, extra || {});
ok(K.recomPick(3, 50, [M('Aa', 10), M('Bbb', 2), M('Cccc', 255)], 'Me').name === 'Bbb', 'the teammate with the fewest gets it');
ok(K.recomPick(3, 50, [M('Aa', 255), M('Bbb', 300)], 'Me') === null, 'nobody at / above 255 gets one');
ok(K.recomPick(0, 50, [M('Aa', 1)], 'Me') === null, 'no recommendations left = nothing');
ok(K.recomPick(3, 9, [M('Aa', 1)], 'Me') === null, 'below level 10 = nothing');
ok(K.recomPick(3, 50, [M('Aa', 1, 2000)], 'Me') === null, 'too far (> 900) = nothing');
ok(K.recomPick(3, 50, [M('Aa', 1, 100, { dead: true })], 'Me') === null, 'dead = nothing');
ok(K.recomPick(3, 50, [M('Me', 0), M('Aa', 5)], 'Me').name === 'Aa', 'never myself');
ok(K.recomPick(3, 50, [M('Aa', 5), M('Bbb', null)], 'Me').name === 'Bbb', 'unknown count first (it never reported)');
// the switch
const ps = src.indexOf('// PARTYAUTO-PURE'), kinds = src.slice(src.indexOf('const PAUTO_KINDS = {'), src.indexOf('function pautoNorm('));
ok(/recommend: \{ char: false/.test(kinds), 'swarm.js PAUTO_KINDS has recommend (party switch)');
const API = require(path.join(ROOT, 'Dashboard', 'partyauto_api.js'));
const PK = new Function(kinds + '\nreturn PAUTO_KINDS;')();
ok(Object.keys(PK).join() === (API.KEYS || []).join(), 'swarm.js and Dashboard/partyauto_api.js know the same switches in the same order', Object.keys(PK).join() + ' | ' + (API.KEYS || []).join());
ok(API.pautoEffective({}, 'recommend', 'A', 'A').on === false, 'default OFF');
// host wiring
ok(/pautoOn\('recommend'\)/.test(src) && /Send\.RequestVoteNew\(pick\.objId\)/.test(src) && /Send\.Action\(pick\.objId\)/.test(src), 'host: switch gate, select the teammate, RequestVoteNew');
ok(/App\.emit\('swarm\.recom', \{ name: Me\.Name, have \}\)/.test(src), 'every window reports its own RecommHave');
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
