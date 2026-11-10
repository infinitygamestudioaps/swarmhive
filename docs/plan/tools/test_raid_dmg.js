// test_raid_dmg.js - requirement pages.md (#/live damage meter + damage log; RAIDDMG-2026-11-10, tester Vykaax #23: "Damage meter and damage
// in the log is reported incorrectly. Reported numbers are extremely low").
// Cause: the system message arrives flattened as "<type> <Name> has done 1352 points of damage to Verfa. <npcId> 1352 <Name>" and the LAST
// number was taken - a character name ending in digits ("Dravwen5047", "Vyk2") made every hit 5047 / 2.
//   A  swarm.js RAIDDMG-PURE raidDmgNum on the real message shapes of Logs/raid_dmg_raw.log + names with digits
//   B  the wiring: OnSystemMessage passes the message's num field, the leader counts every roster teammate's hits
//   node docs/plan/tools/test_raid_dmg.js
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const src = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
let ok = 0, bad = 0; const t = (m, c, x) => { if (c) { ok++; console.log('ok   ' + m); } else { bad++; console.log('FAIL ' + m + (x !== undefined ? ' -- got ' + x : '')); } };
const blk = (b, e) => { const i = src.indexOf(b), j = src.indexOf(e, i + 1); if (i < 0 || j < i) { console.error(b + ' block not found'); process.exit(1); } return src.slice(i, j); };
const { raidDmgNum } = new Function(blk('// RAIDDMG-PURE-BEGIN', '// RAIDDMG-PURE-END') + '\nreturn { raidDmgNum };')();
const old = (t0) => { const nums = String(t0).match(/\d[\d,.]*/g); return nums ? Number(String(nums[nums.length - 1]).replace(/[,.]/g, '')) : 0; };   // the code before the fix

// A: message shapes seen in Logs/raid_dmg_raw.log ([messageType/text/npcId/num/rawText] etc.)
const cases = [
  ['dealt, plain name', '1 Nuker7 has done 1352 points of damage to Verfa. 1025050 1352 Nuker7', undefined, 1352],
  ['dealt, name ending in digits (the bug)', '1 Dravwen5047 has done 1352 points of damage to Verfa. 1025050 1352 Dravwen5047', undefined, 1352],
  ['dealt, short name with one digit', '1 Vyk2 has done 2481 points of damage to Queen Ant. 1029001 2481 Vyk2', undefined, 2481],
  ['taken, name ending in digits', '6 Healer3 has received 69 damage from Ossiud. 1021037 69 Healer3', undefined, 69],
  ['thousands separator', '1 Nuker1 has done 12,345 points of damage to Antharas. 1029068 12345 Nuker1', undefined, 12345],
  ['no sentence: type, name, npcId, num', '1 Doombringer1 1022488 59', undefined, 59],
  ['no sentence, digits in the name, num field given', '1 Mage7 1022488 59 Mage7', 59, 59],
  ['"You hit for" (msg 35)', 'You hit for 1,234 damage.', undefined, 1234],
  ['the sentence wins over a wrong num field', '1 Nuker7 has done 1352 points of damage to Verfa.', 7, 1352],
  ['only the message type: no damage', '1 Nuker7', undefined, 0],
];
cases.forEach(([what, text, nf, want]) => { const got = raidDmgNum(text, nf); t(`A ${what}: ${want}`, got === want, got); });
t('A the old "last number" rule really was the bug (5047 instead of 1352)', old(cases[1][1]) === 5047 && old(cases[2][1]) === 2);

// B wiring
t('B raidDamageMsg uses raidDmgNum (never the last number in the text again)', /function raidDamageMsg\(id, text, keys, numField\)[\s\S]{0,700}const dmg = raidDmgNum\(t, numField\)/.test(src) && !/const nums = t\.match\(\/\\d\[\\d,\.\]\*\/g\); if \(!nums\) return;/.test(src));
t('B OnSystemMessage passes the message object\'s num field', /nf = text && typeof text === 'object' \? text\.num : undefined;[^\n]*raidDamageMsg\(Number\(id\), flat\(text, 0\), keys, nf\)/.test(src));
t('B the leader counts a roster teammate\'s hits even when its party list lags', /App\.on\('swarm\.dmg'[^\n]*mateMsg\(e\) \|\| \(n && CONFIG\.roster\[n\] && teamOf\(n\) === teamOf\(Me\.Name\)\)/.test(src));
const RL = fs.readFileSync(path.join(ROOT, 'Dashboard', 'raidlive.js'), 'utf8');
t('B the raid view still shows the meter (dealt per member) and the log (per hit)', /function dmgMeter\(L\)/.test(RL) && /function dmgLog\(L\)/.test(RL));
console.log(`raid damage: ${ok} ok, ${bad} failed`); process.exit(bad ? 1 : 0);
