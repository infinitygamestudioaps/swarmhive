// KAMAELBOW-2026-10-16 (Shadowdkj: "Kamael soldier at lvls 15-20 prefers to auto equip bow, rather than 1h swords"): the weapon watch never puts a
// plain bow on a Kamael, a crossbow only on the Warder line, a melee role falls back to a melee weapon first, the player's own last weapon stays.
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(process.env.SWARM_JS || path.join(__dirname, '..', '..', '..', 'Scripts_dev', 'swarm.js'), 'utf8');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL ' + m); } };
const a = src.indexOf('// ==== WEAPONWATCH-PURE begin'), b = src.indexOf('// ==== WEAPONWATCH-PURE end');
ok(a > 0 && b > a, 'WEAPONWATCH-PURE block present');
const P = new Function(src.slice(a, b) + '\nreturn { wwPick, wwRanged, kamaelTypeOk };')();

// kamaelTypeOk by class id
ok(P.kamaelTypeOk('BOW', 123) === false, 'male Kamael Soldier: no bow');
ok(P.kamaelTypeOk('BOW', 124) === false, 'female Kamael Soldier: no bow');
ok(P.kamaelTypeOk('CROSSBOW', 123) === false, 'male Kamael Soldier: no crossbow');
ok(P.kamaelTypeOk('CROSSBOW', 125) === false, 'Trooper: no crossbow');
ok(P.kamaelTypeOk('CROSSBOW', 126) === true, 'Warder: crossbow');
ok(P.kamaelTypeOk('CROSSBOW', 130) === true, 'Arbalester: crossbow');
ok(P.kamaelTypeOk('CROSSBOW', 134) === true, 'Trickster: crossbow');
ok(P.kamaelTypeOk('BOW', 130) === false, 'Arbalester: still no plain bow');
ok(P.kamaelTypeOk('SWORD', 123) && P.kamaelTypeOk('RAPIER', 124) && P.kamaelTypeOk('ANCIENTSWORD', 127), 'Kamael melee types ok');
ok(P.kamaelTypeOk('BOW', 9) === true && P.kamaelTypeOk('BOW', 0) === true, 'other races: bows untouched (Hawkeye, Human Fighter)');

// the reported bag: Hunting Bow + swords, nothing worn
const bow = { objId: 1, info: { s: 'weapon', t: 'BOW', n: 'Hunting Bow', pa: 50, g: 'NONE' } };
const sword = { objId: 2, info: { s: 'weapon', t: 'SWORD', n: 'Long Sword', pa: 24, g: 'NONE' } };
const sword2 = { objId: 3, info: { s: 'weapon', t: 'SWORD', n: 'Sword of Reflection', pa: 36, g: 'NONE', two: false } };
const staff = { objId: 4, info: { s: 'weapon', t: 'BLUNT', n: 'Apprentice Staff', pa: 6, ma: 7, mw: true, g: 'NONE' } };
const kam = (cls) => ({ stat: 'pa', roleOk: () => false, typeOk: (i) => P.kamaelTypeOk(i.t, cls), preferMelee: true });
const pick1 = P.wwPick([bow, sword, sword2, staff], kam(123));
ok(pick1 && pick1.info.n === 'Sword of Reflection', 'male soldier with nothing role-fit: best sword, not the Hunting Bow (got ' + (pick1 && pick1.info.n) + ')');
ok(P.wwPick([bow], kam(123)) === null, 'only a bow in the bag: a Kamael puts nothing on rather than the bow');
const cb = { objId: 5, info: { s: 'weapon', t: 'CROSSBOW', n: 'Crossbow', pa: 60, g: 'NONE' } };
ok(P.wwPick([cb, sword], { stat: 'pa', roleOk: (i) => i.t === 'CROSSBOW', typeOk: (i) => P.kamaelTypeOk(i.t, 126) }).info.t === 'CROSSBOW', 'Warder whose plan uses a crossbow: the crossbow');
ok(P.wwPick([cb, sword], kam(123)).info.t === 'SWORD', 'male soldier: sword over a crossbow');
// the player's own last weapon is never overruled
ok(P.wwPick([bow, sword], Object.assign(kam(123), { lastObjId: 1 })).objId === 1, 'the bow the player wore last stays (player choice)');
// non-Kamael melee: still melee first in the fallback, archer roles keep bows
ok(P.wwPick([bow, sword], { stat: 'pa', roleOk: () => false, preferMelee: true }).info.t === 'SWORD', 'any melee role: sword before a bow in the fallback');
ok(P.wwPick([bow, sword], { stat: 'pa', roleOk: (i) => i.t === 'BOW' }).info.t === 'BOW', 'archer role: the bow');
ok(P.wwPick([bow], { stat: 'pa', roleOk: () => false, preferMelee: true }).info.t === 'BOW', 'non-Kamael melee with only a bow: the bow (better than bare hands)');

// wiring in the host code
ok(/typeOk: \(i\) => kamaelTypeOk\(i\.t, num\(Me\.ClassId\)\)/.test(src), 'weaponWatch passes the Kamael type rule');
ok(/preferMelee: !\(R\.weapon/.test(src), 'weaponWatch: melee first for roles that do not use bows');
ok(src.includes('wwPutOnByHive(w.info.n)') && src.includes("'] no weapon equipped'"), 'a bow the WATCH put on a Kamael is swapped back (gear_upgrades.log), the player\'s own is not');
ok(/if \(!kamaelTypeOk\(info\.t, num\(Me\.ClassId\)\)\) return `\$\{info\.n\} is no weapon for my Kamael class`/.test(src), 'roleRecFit: a Kamael class recommendation of the wrong type is skipped');
console.log(`kamael weapon: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
