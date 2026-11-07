// UNSEALPATH-2026-11-04 guard: Pushkin unseals A-grade for normal adena through the owner's two links
// owner: "it does not cost Ancient adena to break seals on A grade equipment ONLY normal adena. You can do it with "Pushkin"
// "Unseal armor and accessories." -> "Break the seal on the armor A-Grade" or "Break the seal on accessories A-Grade""
'use strict';
const fs = require('fs'), path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '../../../Scripts_dev/swarm.js'), 'utf8');
let ok = 0, bad = 0; const t = (m, c, x) => { if (c) { ok++; console.log('ok   ' + m); } else { bad++; console.log('FAIL ' + m + (x === undefined ? '' : ' ' + JSON.stringify(x))); } };
const a = SRC.indexOf('function unsealPath('), b = SRC.indexOf('\nasync function ijBuyAt(', a);
const unsealPath = new Function(SRC.slice(a, b) + '\nreturn unsealPath;')();
t('A armor: "Unseal armor and accessories" -> "Break the seal on the armor A-Grade"', JSON.stringify(unsealPath(['Release the A-grade armor seal'])) === JSON.stringify(['Unseal armor and accessories', 'Break the seal on the armor A-Grade']), unsealPath(['Release the A-grade armor seal']));
t('A accessory: -> "Break the seal on accessories A-Grade"', JSON.stringify(unsealPath(['Release the A-grade accessory seal'])) === JSON.stringify(['Unseal armor and accessories', 'Break the seal on accessories A-Grade']));
t('another path is left alone', JSON.stringify(unsealPath(['Buy', 'Something'])) === JSON.stringify(['Buy', 'Something']) && JSON.stringify(unsealPath(['Trade'])) === JSON.stringify(['Trade']));
const f = SRC.slice(b, b + 1200);
t('ijBuyAt translates every Pushkin path', /if \(o && o\.npc === 'Pushkin' && o\.path\) o = Object\.assign\(\{\}, o, \{ path: unsealPath\(o\.path\) \}\);/.test(f));
const g = SRC.slice(SRC.indexOf('async function gscanClick('), SRC.indexOf('async function gscanClick(') + 1500);
t('links match without the trailing "." and case ("Unseal armor and accessories.")', /lnorm = \(s\) => String\(s \|\| ''\)\.trim\(\)\.replace\(\/\\\.\\s\*\$\/, ''\)\.toLowerCase\(\)/.test(g) && /L\.find\(x => lnorm\(x\.text\) === lnorm\(path\[i\]\)\)/.test(g));
const U = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../Scripts/data/unseal_h5.json'), 'utf8'));
const A = Object.values(U.byUnsealed || {}).filter(r => r.list === 311262506 || r.list === 311262507);
t(`every A-grade unseal is paid in normal adena (57), never Ancient Adena (${A.length} pieces)`, A.length > 0 && A.every(r => r.pay === 57));
console.log(`unseal path: ${ok} ok, ${bad} failed`); process.exit(bad ? 1 : 0);
