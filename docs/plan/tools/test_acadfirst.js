// ACADFIRST guard (owner 2026-11-04: "NEVER EVER START HUNTING A SINGLE MONSTER BEFORE YOU ARE IN ACADEMY EVER EVER"; groups 2-4 hunted at 7-15
// while the clan list had only 7 of 20 academy characters in the Academy)
'use strict';
const fs = require('fs'), path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '../../../Scripts_dev/swarm.js'), 'utf8');
let ok = 0, bad = 0; const t = (m, c, x) => { if (c) { ok++; console.log('ok   ' + m); } else { bad++; console.log('FAIL ' + m + (x === undefined ? '' : ' ' + JSON.stringify(x))); } };
const F = new Function(SRC.slice(SRC.indexOf('// ACADFIRST-PURE-BEGIN'), SRC.indexOf('// ACADFIRST-PURE-END')) + '\nreturn { acadFirstCheck };')();
const N = 1e9, M = [{ name: 'Nuker21', unit: -1 }, { name: 'Nuker24', unit: -1 }, { name: 'Nuker36', unit: 0 }];
t('everyone in the Academy (unit -1) = may hunt', F.acadFirstCheck(M, N - 60000, N, ['Nuker21', 'Nuker24']).ok === true);
t('in the clan but not the Academy (unit 0) = no hunting', F.acadFirstCheck(M, N - 60000, N, ['Nuker36']).ok === false);
t('not in the clan list at all = no hunting', F.acadFirstCheck(M, N - 60000, N, ['Nuker35']).ok === false);
t('one member of the group outside = the whole group waits', F.acadFirstCheck(M, N - 60000, N, ['Nuker21', 'Nuker35']).out.join() === 'Nuker35');
t('an old (> 3 h) or missing clan list = no hunting', F.acadFirstCheck(M, N - 4 * 3600000, N, ['Nuker21']).ok === false && F.acadFirstCheck(M, 0, N, ['Nuker21']).ok === false);
t('the join step needs the clan list (a clan alone is not enough)', /if \(myClanName\(\) && acadFirstNow\(\[Me\.Name\]\)\.ok\) \{ acadState\('in-academy'/.test(SRC) && !/if \(myClanName\(\)\) \{ acadState\('in-academy', `in \$\{myClanName\(\)\}`\)/.test(SRC));
t('leadLevel, autoLevelLoop and the plan level step all check it', (SRC.match(/const ab = acadHuntBlock\(\); if \(ab\)/g) || []).length === 2 && /const ab = acadHuntBlock\(\); if \(!ab\) break;/.test(SRC));
t('the group leader checks every academy mate', /const names = \[Me\.Name\]\.concat\(isLeader\(\) \? acadTeamMates\(\) : \[\]\);/.test(SRC));
console.log(`acadfirst: ${ok} ok, ${bad} failed`); process.exit(bad ? 1 : 0);
