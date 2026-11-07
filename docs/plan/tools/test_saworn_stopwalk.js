// SAWORN + STOPWALK 2026-11-04 guard
// SAWORN: Bishop2's Acumen job got Pushkin's SA list EMPTY (multisell hex 1700d0a00f00 01000000 01000000 28000000 00000000 = list 4000, 0
//         entries): the blacksmith lists only weapons in the bag - the worn weapon comes off first, the SA (or old) weapon goes back on.
// STOPWALK: the owner's !stop at 14:04 did not stop Destroyer3's supply walk to Helvetia for > 1 min.
'use strict';
const fs = require('fs'), path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '../../../Scripts_dev/swarm.js'), 'utf8');
let ok = 0, bad = 0; const t = (m, c) => { if (c) { ok++; console.log('ok   ' + m); } else { bad++; console.log('FAIL ' + m); } };
// the live packet: an empty multisell list really decodes as 0 entries
const hex = '1700d0a00f000001000000010000002800000000000000', b = Buffer.from(hex, 'hex');
t('the live answer was list 4000, page 1, finished, 0 entries (an empty list, not a parser / wait problem)', b[2] === 0xd0 && b.readInt32LE(3) === 4000 && b.readInt32LE(7) === 1 && b.readInt32LE(11) === 1 && b.readInt32LE(19) === 0);
const sa = SRC.slice(SRC.indexOf('async function ijSA('), SRC.indexOf('async function ijEnchant('));
// EXCHOFF (owner 14:20): the take-off / put-back is the shared helper now - its behaviour is tested in test_exchoff.js
t('ijSA takes a worn weapon off before talking to the blacksmith (shared exchOff)', /const saOff = await exchOff\(\[wid\], jid\);/.test(sa) && sa.indexOf('exchOff(') < sa.indexOf('openNpc(npc)'));
t('the SA weapon goes on after the exchange, the old one when it failed (also in the finally)', /await saRewear\(got \|\| weaponObjId\);\s*\/\/ SAWORN/.test(sa) && /finally \{[^\n]*await saRewear\(got \|\| weaponObjId\)/.test(sa));
t('it wears only once (saRewore) through the shared exchBackOn', /const saRewear = async \(\) => \{ if \(saRewore\) return; saRewore = true; await exchBackOn\(saOff\.worn/.test(sa));
t('an empty list says so (the weapon must be in the bag)', /list came back EMPTY \(0 entries: the weapon must be in the bag, not worn\)/.test(sa));
// STOPWALK
const sc = SRC.slice(SRC.indexOf("case '!stop':"), SRC.indexOf("case '!stop':") + 900);
t('!stop bumps the stop generation and breaks the supply run\'s control hold', /state\.stopGen = \(state\.stopGen \|\| 0\) \+ 1;/.test(sc) && /regroupRun\.reason === 'supply'\) \{ control\.gen\+\+; \}/.test(sc));
const gg = SRC.slice(SRC.indexOf('async function giranGo('), SRC.indexOf('async function giranGo(') + 4500);
t('every Giran route walk checks the stop at each point AND inside the leg (walkDirect abort)', /const stopped = \(\) => interrupted\(g0\) \|\| \(state\.stopGen \|\| 0\) !== s0;/.test(gg) && /await walkDirect\(p\[0\], p\[1\], p\[2\], 120, 25000, stopped, true\)/.test(gg) && /if \(stopped\(\)\) \{ try \{ Send\.StopMove\(\); \}/.test(gg));
t('the supply run stops right after the grocer walk (no purchase after your Stop)', /await giranGo\('grocer'\);\s*if \(supStopped\('on the way to the grocer'\)\) return 'stopped';/.test(SRC));
console.log(`saworn + stopwalk: ${ok} ok, ${bad} failed`); process.exit(bad ? 1 : 0);
