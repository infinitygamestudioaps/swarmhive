// KAMAEL2H (2026-10-14, tester: "Kamael Berserker ... bought a 1h SLS instead of a 2h berserker sword"): the class decides the Kamael weapon before the
// swarm role; canUse accepts a Kamael's own weapon type or the sword that Change Weapon turns into it (2h for ancient sword / crossbow); the shop pick
// never buys a 1h sword for an ancient sword.   node docs/plan/tools/test_kamael_weapon.js
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const src = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
let fails = 0; const check = (c, n, info) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${n}${!c && info ? ' — ' + info : ''}`); if (!c) fails++; };
const G = JSON.parse(fs.readFileSync(path.join(ROOT, 'Scripts', 'data', 'gear_items.json'), 'utf8')), IT = G.items || G;
// the functions on stubs
const kwSrc = src.slice(src.indexOf('const KAMAEL_WEAPON = '), src.indexOf('const CHANGE_WEAPON_SKILL'));
const cuSrc = src.slice(src.indexOf('function canUse(info) {'), src.indexOf('\n}\n', src.indexOf('function canUse(info) {')) + 3);
const mk = (classId, role) => new Function('Me', 'num', 'gearRole', 'gearDb', 'ROLE_RULES', 'gradeOk', 'myRace', 'BODY_SLOTS', 'recWeaponType', 'CLASSREC_BASE',
  kwSrc + '\n' + cuSrc + '\nreturn { kamaelWeaponFor, canUse };')({ ClassId: classId }, Number, () => role, () => ({ items: IT }), { melee: { weapon: w => w.t === 'BLUNT', armor: [] }, inspector: { weapon: () => true, armor: [] }, kamaelRapier: { weapon: () => true, armor: [] } }, () => true, () => 'KAMAEL', [], () => null, []);
const B = mk(127, 'inspector');
check(B.kamaelWeaponFor('inspector') === 'ANCIENTSWORD', 'Berserker (127) with swarm role inspector wants the ANCIENT SWORD (the class decides)');
const find = (re) => Object.keys(IT).find(k => re.test(IT[k].n || ''));
const sls = find(/^Common Item - Samurai Long Sword$/), bb = find(/^Berserker Blade$/), saber = find(/^Saber Tooth$/);
check(sls && !mk(127, 'melee').canUse(IT[sls]), 'canUse: a Berserker refuses the 1h Samurai Longsword (twin = rapier)', sls);
check(bb && mk(127, 'melee').canUse(IT[bb]) && saber && mk(127, 'melee').canUse(IT[saber]), 'canUse: a Berserker on role melee accepts the Berserker Blade (2h, turns into Saber Tooth) and Saber Tooth', `${bb} ${saber}`);
check(mk(128, 'melee').kamaelWeaponFor('melee') === 'RAPIER' && mk(128, 'melee').canUse(IT[sls]), 'Soul Breaker (128) wants the rapier: the 1h sword that turns into one is fine');
check(mk(88, 'melee').kamaelWeaponFor('melee') === null && mk(88, 'melee').canUse({ s: 'weapon', t: 'BLUNT' }), 'a non-Kamael keeps its role rules');
check(/if \(want && want !== 'RAPIER' && !info\.two\) continue;/.test(src) && /w\.t === 'SWORD' && !!w\.two && !w\.mw/.test(src), 'shop pick + kamaelAS rule: only 2h swords for an ancient sword');
// CLASSREC (tester: "this Warlord bought a Dwarven Hammer ... not even in the recommended list")
{ const mkW = (cls, rec) => new Function('Me', 'num', 'gearRole', 'gearDb', 'ROLE_RULES', 'gradeOk', 'myRace', 'BODY_SLOTS', 'recWeaponType', 'CLASSREC_BASE', kwSrc + '\n' + cuSrc + '\nreturn { canUse };')({ ClassId: cls }, Number, () => 'melee', () => ({ items: IT }), { melee: { weapon: (w) => w.t === 'BLUNT', armor: [] } }, () => true, () => 'HUMAN', [], () => rec, [0, 10, 18, 25, 31, 38, 44, 49, 53, 123, 124]);
  const ham = find(/^Common Item - Dwarven Hammer$/), pole = find(/^Orcish Poleaxe$/);
  const W = mkW(57, { t: 'POLE', two: true });
  check(ham && pole && W.canUse(IT[pole]) && !W.canUse(IT[ham]), 'Warlord (generic melee): the recommended Orcish Poleaxe yes, the Dwarven Hammer no', ham + ' ' + pole);
  check(mkW(57, null).canUse(IT[ham]), 'no recommendation file = the old melee rule');
  check(mkW(0, { t: 'BOW', two: true }).canUse(IT[ham]), 'a base class (Human Fighter) keeps the old rule (its D recommendation is a bow)');
}
check(/if \(gearRole\(\) === 'melee' && !CLASSREC_BASE\.includes\(num\(Me\.ClassId\)\)\) \{ const rt = recWeaponType\(\);/.test(src), 'canUse: the class recommendation decides the weapon type of the generic melee role');
console.log(fails ? `\n${fails} FAILED` : '\nall kamael weapon checks passed'); process.exit(fails ? 1 : 0);
