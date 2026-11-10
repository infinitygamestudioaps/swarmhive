// CHOICEONLY + ROUTELATE + HTRESTART guard (owner 2026-11-05):
//  - "Nej, du skal bruge den path der er lavet med room pathing" (a failed trip to the chosen FoG room sent the team to Pavel Ruins)
//  - FoG Chandra 16:10: the members landed after the leader's room route was sent -> nobody walked for 25 min
//  - "Skal 12-timers timeren starte forfra, når du trykker Start?" -> "Ja tak"
'use strict';
const fs = require('fs'), path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '../../../Scripts_dev/swarm.js'), 'utf8');
let ok = 0, bad = 0; const t = (m, c, x) => { if (c) { ok++; console.log('ok   ' + m); } else { bad++; console.log('FAIL ' + m + (x === undefined ? '' : ' ' + JSON.stringify(x))); } };
const cut = (a, b) => SRC.slice(SRC.indexOf(a), SRC.indexOf(b));
const C = new Function(cut('// CHOICEONLY-PURE-BEGIN', '// CHOICEONLY-PURE-END') + '\nreturn choiceOnlyHold;')();
const R = new Function(cut('// ROUTELATE-PURE-BEGIN', '// ROUTELATE-PURE-END') + '\nreturn roomRouteMine;')();
const man = { mode: 'manual', kind: 'rooms' }, fail = { kind: 'fallback-auto', detail: 'could not get there', retryAt: 1000 + 300000 };
t('CHOICEONLY: a failed chosen spot = wait for its retry, no automatic spot', typeof C({ name: 'Pavel Ruins' }, man, fail, 1000) === 'string');
t('CHOICEONLY: the chosen spot itself goes on', C({ name: 'FoG room', manual: true }, man, fail, 1000) === null);
t('CHOICEONLY: Auto mode / Seven Signs / occupied keep the automatic spot', C({}, { mode: 'auto' }, fail, 1000) === null && C({}, man, { kind: 'blocked' }, 1000) === null && C({}, man, { kind: 'occupied' }, 1000) === null);
t('CHOICEONLY: the autolevel loop waits instead of travelling elsewhere', /hold = choiceOnlyHold\(spot, partySpotEntry\(\), manualSw\.nullWhy, now\(\), [^;]*\);[\s\S]{0,700}await sleep\(15000\); continue;/.test(SRC));
const d = { name: 'FoG' };
t('ROUTELATE: the route is mine only on the leader\'s floor', R({ d, fi: 1 }, { dungeon: 'FoG', floor: 1 }) && !R({ d, fi: 0 }, { dungeon: 'FoG', floor: 1 }) && !R(null, { dungeon: 'FoG', floor: 1 }));
t('ROUTELATE: a member not on that floor yet waits up to 30 s for its landing', /while \(now\(\) - t0 < 30000 && memberRG\.id === id\) \{ const D = dungeonRooms\(\); w = dzFloor\(D, Me\.X, Me\.Y, Me\.Z\); if \(roomRouteMine\(w, data\)\) break;/.test(SRC));
t('HTRESTART: your !start starts a new 12 h session', /runSetMine\(true, 'your order !start'\);[\s\S]{0,400}lhSessionReset\('your order !start'\)/.test(SRC) && /function lhSessionReset\(why\) \{[^\n]*\n\s*const had = !!LH\.sess; LH\.sess = null;/.test(SRC));
t('the timer that never runs out exists ("Until I stop it" = untilStop)', /function htUntilStop\(j, key\)/.test(SRC) && /if \(htUntilStop\(htData\(\), key\)\) return null;/.test(SRC));
console.log(`choiceonly: ${ok} ok, ${bad} failed`); process.exit(bad ? 1 : 0);
