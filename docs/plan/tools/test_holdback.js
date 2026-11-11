// HOLDBACK-2026-11-10 guard (owner OK): HOLD = stand still and fight AT the hold point. Destroyer3's party (FoG lower level, hold at
// 178492,-113069,-5840) was pulled ~4.5 km to 181720,-109928 by Blazing Ifrits and then stood there for over an hour, because hold blocked
// the walk back too. Now the leader walks back (same floor, never a teleport) once nobody fights; all other hold guarantees stay.
'use strict';
const fs = require('fs'), path = require('path');
const R = path.join(__dirname, '../../..'), SRC = fs.readFileSync(path.join(R, 'Scripts_dev/swarm.js'), 'utf8');
let ok = 0, bad = 0; const t = (m, c, x) => { if (c) { ok++; console.log('ok   ' + m); } else { bad++; console.log('FAIL ' + m + (x === undefined ? '' : ' ' + JSON.stringify(x))); } };
const cut = (a, b) => { const i = SRC.indexOf(a); return i < 0 ? '' : SRC.slice(i, SRC.indexOf(b, i) + b.length); };
const P = new Function(cut('// HOLDBACK-PURE-BEGIN', '// HOLDBACK-PURE-END') + '\nreturn { holdReturnDecide, HOLDRET };')();
const hold = { x: 178492, y: -113069, z: -5840 };
const base = (o) => Object.assign({ on: true, leader: true, hand: false, busy: false, me: { x: 181720, y: -109928, z: -5824 }, hold, fight: false, quietMs: 60000, fails: 0, sinceTry: 999999 }, o || {});
// 1) the Destroyer3 case
const g = P.holdReturnDecide(base());
t('Destroyer3 2026-11-10: 4.5 km from the hold point, quiet -> walk back', g.go === true && g.dist > 4400 && g.dist < 4600, g);
t('Destroyer3 case while the party fights (Blazing Ifrits) -> fight first, no walk', !P.holdReturnDecide(base({ fight: true })).go);
t('just after the fight (< quietMs) -> still waits', !P.holdReturnDecide(base({ quietMs: 2000 })).go);
// 2) at the point = stand still
t('within the margin of the hold point -> stand still', !P.holdReturnDecide(base({ me: { x: 178700, y: -113000, z: -5840 } })).go);
t('fight positioning close by (500 away) is not a walk back', !P.holdReturnDecide(base({ me: { x: hold.x + 500, y: hold.y, z: hold.z } })).go);
// 3) never a teleport / floor teleport / long trip; members do not walk on their own; hand-played leader untouched
const fl = P.holdReturnDecide(base({ me: { x: 181720, y: -109928, z: -4200 } }));
t('hold point on another floor -> no walk, said once (no floor teleport in hold)', !fl.go && fl.say === true, fl);
const far = P.holdReturnDecide(base({ me: { x: 83000, y: 148000, z: -3400 } }));
t('hold point 280 km away (another region) -> no walk / teleport, said', !far.go && far.say === true, far);
t('a member never runs the walk back (follows the leader)', !P.holdReturnDecide(base({ leader: false })).go);
t('hold off -> nothing', !P.holdReturnDecide(base({ on: false })).go);
t('the owner plays the leader in the client -> hands off', !P.holdReturnDecide(base({ hand: true })).go);
t('a beetle step / !leaveroom / AOE place walk runs -> wait', !P.holdReturnDecide(base({ busy: true })).go);
// 4) repeated failures: back-off, then a pause (no loop spam)
t('1 failed try: waits failGapMs before the next', !P.holdReturnDecide(base({ fails: 1, sinceTry: 10000 })).go && P.holdReturnDecide(base({ fails: 1, sinceTry: 31000 })).go);
t('maxFails reached: 5 min pause, then tries again', !P.holdReturnDecide(base({ fails: 3, sinceTry: 120000 })).go && P.holdReturnDecide(base({ fails: 3, sinceTry: 301000 })).go);
// 5) wiring in swarm.js
const loop = cut('// HOLDBACK-PURE-END', 'setInterval(() => {') + cut('if (HOLDRET.walking) return;', '}, 3000);');
t('holdBlocks lets ONLY the walk kind through while the walk back runs (teleport / auto stay blocked)', /if \(kind === 'walk' && typeof HOLDRET !== 'undefined' && HOLDRET\.walking\) return false;/.test(SRC));
t('the walk back is walkDirect (room route / wall path), never a teleport / .town / gatekeeper / floor teleporter', /walkDirect\(hold\.x, hold\.y, hold\.z/.test(loop) && !/teleport\w*\(|townCommand\(|gkTeleport\(|floorTeleport\(|useEscape\(|unstuckToTown\(/.test(loop));
t('the walk stops when we are hit, on !stop, !hold off or a new hold point', /lastAttackerOnMe\.at/.test(loop) && /state\.stopGen/.test(loop) && /!holdOn\(\)/.test(loop) && /HOLDRET\.at !== at0/.test(loop));
t('failures are said in party chat at most once per 5 min (holdReturnSay)', /function holdReturnSay\(why\) \{\s*if \(now\(\) - \(HOLDRET\.said\[why\] \|\| 0\) < HOLDRET\.pauseMs\) return;/.test(SRC) && /HOLDRET\.fails >= HOLDRET\.maxFails\) holdReturnSay\(/.test(loop));
t('fight sense covers me (attacking / in combat / hit) and every teammate (hit / fight)', /function holdReturnFight\(\)[\s\S]{0,400}lastAttackerOnMe[\s\S]{0,300}lp\.hit \|\| lp\.fight/.test(SRC));
t('heal / res code is still not gated by hold', !/HOLDRET|holdReturn/.test((SRC.match(/function healTick\([\s\S]{0,3000}/) || [''])[0]));
console.log(`holdback: ${ok} ok, ${bad} failed`); process.exit(bad ? 1 : 0);
