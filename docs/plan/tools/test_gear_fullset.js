// test_gear_fullset.js - requirement gear.md R7 (owner 2026-10-30): only full armor sets, A grade and up only with the owner's OK, caster
// weapons only an Acumen weapon of a higher grade, fighter A+ weapons with the owner's OK. Pure checks on Scripts_dev/swarm.js + the set data.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..'), SRC = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
let ok = 0, bad = 0; const check = (c, m) => { if (c) { ok++; console.log('ok   ' + m); } else { bad++; console.log('FAIL ' + m); } };

// the helper, run for real against the set data
const i = SRC.indexOf('let FSCACHE = null;'), j = SRC.indexOf('\n}\n', SRC.indexOf('function fullSetRules()')) + 3;
check(i > 0 && j > i, 'fullSetRules() exists');
const num = Number, now = () => Date.now(), SWARM_ROOT = ROOT;
const File = { ReadAllText: (p) => fs.readFileSync(p.replace(/\\/g, '/'), 'utf8') };
const FSR = new Function('num', 'now', 'SWARM_ROOT', 'File', SRC.slice(i, j) + '; return fullSetRules;')(num, now, SWARM_ROOT, File);
const R = FSR(), C = JSON.parse(fs.readFileSync(path.join(ROOT, 'Dashboard', 'data', 'gear_catalog.json'), 'utf8'));
const S = (n) => C.sets.find(s => s.name === n), P = (n, sl) => ({ id: S(n).pieces[sl][0], info: { full: sl === 'chest' && !S(n).pieces.legs } });
const dcHeavy = { chest: P('Dark Crystal Breastplate', 'chest'), legs: P('Dark Crystal Breastplate', 'legs'), head: P('Dark Crystal Breastplate', 'head'), gloves: P('Dark Crystal Breastplate', 'gloves'), feet: P('Dark Crystal Breastplate', 'feet') };
check(R.complete(dcHeavy).ok, 'Dark Crystal heavy: chest + legs + head + gloves + feet = full set');
const shaded = Object.assign({}, dcHeavy, { chest: { id: S('Armor of Nightmare').pieces.chest[0], info: { full: true } } }); delete shaded.legs;
const r1 = R.complete(shaded);
check(!r1.ok && r1.set && r1.set.name === 'Armor of Nightmare', "Tank1's Nightmare chest + Dark Crystal head / gloves / boots = NOT a full set");
const saint = { chest: P('Tallum Tunic', 'chest'), legs: P('Tallum Tunic', 'legs'), head: P('Dark Crystal Robe', 'head'), gloves: { id: 2454, info: {} }, feet: { id: 0, info: {} } };
const r2 = R.complete(saint);
check(!r2.ok && r2.missing.includes('head') && r2.missing.includes('gloves'), "Saint1's Tallum Tunic + Stockings + DC Helmet + Karmian Gloves = NOT a full set (head, gloves missing)");
const dcRobe = { chest: { id: S('Dark Crystal Robe').pieces.chest[0], info: { full: true } }, head: P('Dark Crystal Robe', 'head'), gloves: P('Dark Crystal Robe', 'gloves'), feet: P('Dark Crystal Robe', 'feet') };
check(R.complete(dcRobe).ok, 'Dark Crystal Robe (one-piece robe, no legs) + helmet + gloves + boots = full set');
check(R.setOf(S('Karmian Tunic').pieces.chest[0]).name === 'Karmian Tunic' && !R.setOf(999999), 'setOf finds the set of a chest; unknown ids have none');

// the planner + the bag equip obey R7
const pu = SRC.slice(SRC.indexOf('function planUpgrades('), SRC.indexOf('// c) budget: in slot order'));
check(/FULLSET-2026-10-30/.test(pu) && /\['A', 'S', 'S80', 'S84'\]/.test(pu) && /approved\.has\(num\(p\.id\)\)/.test(pu), 'planner: A grade and up only when the owner approved the item');
check(/!\/acumen\/i\.test\(wp\.info\.n\)/.test(pu) && /gi\(wp\.info\.g\) <= gi\(ww\.g\)/.test(pu), 'planner: a caster weapon only an Acumen weapon of a higher grade');
check(/R7\.complete\(fin\)/.test(pu) && /ap\.forEach\(p => picks\.splice/.test(pu), 'planner: armor picks only when the result is one full set, else all dropped');
check(/skipped = \[\]\.concat\(setKeepSkip, fullSetSkip\)/.test(SRC), 'planner: the plan says why (waits for your OK / armor kept)');
const eb = SRC.slice(SRC.indexOf('async function equipCommonFromBag('), SRC.indexOf('async function equipCommonFromBag(') + 9000);
check(/full ' \+ S\.name \+ ' set/.test(eb) && /R7\.approvedFor\(Me\.Name\)\.has\(num\(b\.id\)\)/.test(eb) && /n1\.ok \|\| \(!n0\.ok/.test(eb), 'from the bag: a whole set goes on together; single pieces / A+ / non-Acumen caster weapons do not');
console.log(`gear full set: ${ok} ok, ${bad} failed`);
process.exit(bad ? 1 : 0);
