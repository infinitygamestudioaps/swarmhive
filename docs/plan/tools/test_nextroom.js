// NEXTROOM guard (owner 2026-11-06: "Vælg et rum ved siden af hvis rummet er optaget"): Spoiler16's duo stood in Giran for hours - all three
// chosen Devil's Isle rooms were blocked (raid boss Demon Kuri). Every chosen room taken = the nearest free room next to them (same floor).
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '../../..');
const SRC = fs.readFileSync(path.join(ROOT, 'Scripts_dev/swarm.js'), 'utf8');
let ok = 0, bad = 0; const t = (m, c, x) => { if (c) { ok++; console.log('ok   ' + m); } else { bad++; console.log('FAIL ' + m + (x === undefined ? '' : ' ' + JSON.stringify(x))); } };
const N = new Function(SRC.slice(SRC.indexOf('// NEXTROOM-PURE-BEGIN'), SRC.indexOf('// NEXTROOM-PURE-END')) + '\nreturn { nextRoomPick, NEXTROOM };')();
const chosen = [{ x: 0, y: 0, floor: 0 }, { x: 10000, y: 0, floor: 0 }];
const c = [
  { id: 'a', x: 1200, y: 0, floor: 0, blocked: 'raid boss Demon Kuri lives there' },
  { id: 'b', x: 2600, y: 0, floor: 0, blocked: '' },
  { id: 'c', x: 500, y: 0, floor: 1, blocked: '' },
  { id: 'd', x: 9000, y: 0, floor: 0, blocked: '', enabled: false },
  { id: 'e', x: 7000, y: 0, floor: 0, blocked: '' },
];
t('the nearest FREE room next to a chosen one (a blocked neighbour is skipped)', (N.nextRoomPick(chosen, c) || {}).id === 'b');
t('never another floor, never a switched-off room', !['c', 'd'].includes((N.nextRoomPick(chosen, c) || {}).id) && (N.nextRoomPick([{ x: 500, y: 0, floor: 1 }], c.filter(x => x.id !== 'c')) || null) === null);
t('nothing free within reach = null (stays as before)', N.nextRoomPick(chosen, c.map(x => Object.assign({}, x, { blocked: 'taken' }))) === null && N.nextRoomPick([{ x: 0, y: 0, floor: 0 }], [{ id: 'far', x: 50000, y: 0, floor: 0 }]) === null);
t('distance measured to ANY chosen room', (N.nextRoomPick([{ x: 0, y: 0, floor: 0 }, { x: 7500, y: 0, floor: 0 }], [{ id: 'b', x: 2600, y: 0, floor: 0 }, { id: 'e', x: 7000, y: 0, floor: 0 }]) || {}).id === 'e');
t('multiSpotFor takes the room next to it before giving up', /if \(!t && sel\.kind !== 'field'\) \{\s*const nb = nextRoomFor\(sel, T\);\s*if \(nb\) \{[^\n]*return multiTargetSpot\(sel, nb, level, extra\); \}/.test(SRC));
t('the neighbour is checked like a chosen room (spotBlock: occupied / raid boss / other party)', /blocked: r\.enabled === false \? 'switched off' : \(spotBlock\(key, c, r\.radius \|\| 800\) \|\| ''\)/.test(SRC));
t('the rotation goes back to a chosen room once one is free ("is not one of the chosen ones")', /why: cur \? `is \$\{cur\.blocked\}` : 'is not one of the chosen ones'/.test(SRC));
console.log(`nextroom: ${ok} ok, ${bad} failed`); process.exit(bad ? 1 : 0);
