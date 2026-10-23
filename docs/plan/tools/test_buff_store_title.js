// BUFF FIXES 2026-10-23 (public v1.8.17 tester Raltru: "they don't buff", "COV/Zerk not working", "Buff not working... is it well set?")
//  1) STORETITLE-PURE: a buff store seller is found by the party's title words OR the wanted buff's own words / short name (COV, Zerk)
//  2) STORE_LOG is defined (it was used but never declared: every store buy threw after buying)
//  3) BUFFSCHEME: every role token gets a board scheme (warcryer / unknown tokens had none -> buffSelf false -> back-off)
//  4) BUFFORDER: !buff with the party's own buffers says so and lifts the buffers' rests
//   node docs/plan/tools/test_buff_store_title.js
'use strict';
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'Scripts_dev', 'swarm.js'), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m + (x !== undefined ? ' — ' + x : '')); } };
const a = src.indexOf('// STORETITLE-PURE-BEGIN'), b = src.indexOf('// STORETITLE-PURE-END');
ok(a > 0 && b > a, 'STORETITLE-PURE block present');
const K = new Function(src.slice(a, b) + '\nreturn { storeTitleWords, storeTitleRe };')();
const re = (t, n) => K.storeTitleRe(t, n);
ok(re(['buff'], 'Chant of Victory').test('COV +15 1a'), 'default title words: "COV +15 1a" sells Chant of Victory');
ok(re(['buff'], 'Chant of Victory').test('+15 COV'), '"+15 COV" too');
ok(re(['buff'], 'Berserker Spirit').test('Zerk 1a'), '"Zerk 1a" sells Berserker Spirit');
ok(re(['buff'], 'Dance of Berserker').test('dance zerk'), 'Dance of Berserker found by "zerk"');
ok(re(['buff'], 'Chant of Victory').test('Buffs 1a'), "the party's own word 'buff' still matches");
ok(!re(['buff'], 'Chant of Victory').test('Selling Mats'), 'an unrelated shop title is not matched');
ok(!K.storeTitleWords([], 'Chant of Victory').includes('chant') && !K.storeTitleWords([], 'Chant of Victory').includes('of'), 'filler words (chant, of) are no title words');
ok(re([], "Magnus' Chant").test('Magus +15'), "Magnus' Chant by magus");
ok(/^function STORE_LOG\(\)/m.test(src), 'STORE_LOG is defined (store buys no longer throw after buying)');
ok(/titleRe: storeTitleRe\(st\.titles, name\)/.test(src) && /titleRe: storeTitleRe\(e\.store\.titles, name\)/.test(src), 'soStoreBuff + soStoreAddOn use the per-buff title words');
// 3) schemes for every role
const s1 = src.indexOf('function bbSchemesFor('), s2 = src.indexOf('async function buffSelf(');
ok(s1 > 0 && s2 > s1, 'bbSchemesFor present right before buffSelf');
const S = new Function('CONFIG', 'ROLEKIND', src.slice(s1, s2) + '\nreturn bbSchemesFor;')(
  { buffs: { schemes: { sk: ['Defender'], destroyer: ['Warrior'], bishop: ['Mystic'] } } },
  { scheme: { tank: 'Defender', melee: 'Warrior', buffer: 'Mystic' } });
ok(S('sk', '').join() === 'Defender', 'a listed role keeps its scheme');
ok(S('warcryer', 'buffer').join() === 'Mystic', 'warcryer (not listed) -> its kind buffer -> Mystic');
ok(S('weirdtank', 'tank').join() === 'Defender', 'unknown token with kind tank -> Defender');
ok(S('', '').join() === 'Warrior' && S('auto', '').join() === 'Warrior', 'no role -> Warrior (never empty)');
ok(S('elder', '').join() === 'Mystic', 'caster-like token -> Mystic');
ok(/bbSchemesFor\(state\.role, state\.roleKind\)/.test(src), 'buffSelf uses bbSchemesFor');
// 4) the !buff order with the party's own buffers
const rq = src.slice(src.indexOf('function requestBuffTurn('), src.indexOf('function requestBuffTurn(') + 1800);
ok(/BUFFORDER-2026-10-23/.test(rq) && /src === 'party'/.test(rq) && /BUFFUP\.skipped/.test(rq), '!buff with own buffers: told + the buffers recast at once');
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
