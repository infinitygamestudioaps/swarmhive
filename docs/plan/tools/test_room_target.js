// test_room_target.js - requirement walls.md R3 + hunting.md R5 (tester Vykaax 2026-11-01, Catacomb of the Forbidden Path: the party "is still
// trying to fight through the wall even though they are already in the correct polygon" + "Slow Hunting ... Stop, move the leader a few feet,
// Start -> Level ... worst case ... back to town and run the path again"). Pure decisions + source checks (no game, no live files).
const fs = require('fs'), path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'Scripts_dev', 'swarm.js'), 'utf8');
let ok = 0, bad = 0; const t = (m, c) => { if (c) { ok++; console.log('ok   ' + m); } else { bad++; console.log('FAIL ' + m); } };
const grab = (name) => { const i = SRC.indexOf('function ' + name + '('); let d = 0; for (let k = SRC.indexOf('{', i); k < SRC.length; k++) { if (SRC[k] === '{') d++; else if (SRC[k] === '}' && --d === 0) return SRC.slice(i, k + 1); } return ''; };
const RT = new Function(grab('roomTargetDecide') + '\nreturn roomTargetDecide;')();
t('ROOMTARGET: a visible target = attack', RT({ visible: true, inPoly: false }) === 'attack' && RT({ visible: true, inPoly: null }) === 'attack');
t('ROOMTARGET: behind a wall and OUTSIDE the hunting room = drop (never walked to)', RT({ visible: false, inPoly: false }) === 'drop');
t('ROOMTARGET: behind a wall inside the room / no hunt polygon (open field corner) = the old approach', RT({ visible: false, inPoly: true }) === 'approach' && RT({ visible: false, inPoly: null }) === 'approach');
t('ROOMTARGET: srvAttack drops instead of wallApproach for that case', /if \(roomTargetDecide\(\{ visible: false, inPoly: huntPolyHas\(m\) \}\) === 'drop'\) roomTargetDrop\(o, m\); else wallApproach\(o, m\);/.test(SRC));
t('ROOMTARGET: attack-first never takes an unseen monster outside the room', SRC.includes('if (huntPolyHas(m) === false && !canSee(m)) return;'));
t('ROOMTARGET: a dropped target is blacklisted 10 min and the target cancelled', /function roomTargetDrop\(o, m\) \{\s*huntBlack\[o\] = now\(\) \+ 600000;/.test(SRC));
t('ROOMTARGET: the hunt polygon = the leader\'s room / zone, a member\'s room from swarm.room, none in raids / instances', /function huntPolyNow\(\)[\s\S]{0,200}if \(inRaid\(\) \|\| inst\.on\) return null;/.test(SRC) && SRC.includes('return MROOM.poly && now() - MROOM.at < 60000 ? MROOM.poly : null;'));
const i = SRC.indexOf('// LEVELHEALTH-PURE-BEGIN'), j = SRC.indexOf('// LEVELHEALTH-PURE-END');
const P = new Function(SRC.slice(i, j) + '\nreturn { slowHuntStep, SLOWHUNT };')();
t('SLOWHUNT: the first repair = drop the targets', P.slowHuntStep({ kills20: 3, atSpotMs: 600000, streak: 0 }) === 'drop');
t('SLOWHUNT: the next repair in a row without a kill = step aside', P.slowHuntStep({ kills20: 1, atSpotMs: 600000, streak: 1 }) === 'step');
t('SLOWHUNT: no kill for 20 min at the spot = town and the route back', P.slowHuntStep({ kills20: 0, atSpotMs: 1300000, streak: 3 }) === 'town');
t('SLOWHUNT: the town trip at most once per hour', P.slowHuntStep({ kills20: 0, atSpotMs: 1300000, streak: 3, lastTownAgo: 1800000 }) === 'step');
t('SLOWHUNT: the town trip fights off first (FIGHTOFF waitCombatClear) and goes via leadGoGiran + leadLevel', /SLOWHUNT\)`, true\);[\s\S]{0,300}await waitCombatClear\(120000, 2000\);[\s\S]{0,200}await leadGoGiran\(/.test(SRC));
t('SLOWHUNT: the step spot stays inside the room, no wall between, not a blocked spot', /function slowHuntSpot\(\)[\s\S]{0,400}if \(P && !inPolygon\(p\.x, p\.y, P\)\) continue;[\s\S]{0,120}geoBlockedAt\(p\.x, p\.y, p\.z, 120\)[\s\S]{0,40}!canSee\(p\)/.test(SRC));
t('SLOWHUNT: the repair drops the whole party\'s targets (swarm.levelfix drop)', SRC.includes("App.emit('swarm.levelfix', { leader: Me.Name, drop: true })") && SRC.includes("levelFixMine('asked by ' + CONFIG.leader, !!(e.data && e.data.drop))"));
console.log(`room target: ${ok} ok, ${bad} failed`); process.exit(bad ? 1 : 0);
