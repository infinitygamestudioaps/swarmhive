// OFFLINE TEST (public tester reports v1.8.17, 2026-10-23) for the dashboard fixes. Reads the page sources only; never the game / server.
//   node docs/plan/tools/test_tester_1817_ui.js        (exit code 1 when a check fails)
//   3 "custom mark which item is selected as junk to sell, maybe the item icon but crossed out"      Dashboard/charpage.js + .css
//   5 "storage tab - can't delete crafter1 char"                                                    Dashboard/storagepage.js, crafterpanel.js
//   6 "storage crafting part filters (by grade)"                                                     Dashboard/crafterpanel.js
//   7 "Items > Warehouse tab item names overflow other items"                                        Dashboard/itemspage.css
'use strict';
const fs = require('fs'), path = require('path');
const D = path.join(__dirname, '..', '..', '..', 'Dashboard');
const rd = (f) => fs.readFileSync(path.join(D, f), 'utf8');
let fails = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails++; };
const noAlerts = (s) => !/(^|[^.\w])(alert|confirm|prompt)\(/m.test(s.replace(/\/\/[^\n]*/g, '').replace(/ui(Alert|Confirm|Prompt)\(/g, ''));   // comments do not count

// 3 junk marks
const cp = rd('charpage.js'), cpc = rd('charpage.css');
check(/data-cpjunk="mode"/.test(cp) && /async function junkPick\(/.test(cp), '3: inventory has a "Mark junk" mode and a tap handler');
check(/junkPick[\s\S]{0,900}api\('\/api\/sell', \{ method: 'POST'[\s\S]{0,120}scope: CP\.name, on \}/.test(cp), '3: a tap writes the sell list for this character (on / off)');
check(/it\.equipped \|\| it\.quest \|\| it\.id === 57/.test(cp.slice(cp.indexOf('async function junkPick('), cp.indexOf('async function junkPick(') + 600)), '3: worn / quest items / adena are never marked');
check(/\.cp-it\.selling::after[\s\S]{0,300}linear-gradient\(to top right/.test(cpc) && /\.cp-it\.selling img \{[^}]*opacity/.test(cpc), '3: a sell-marked item shows its icon crossed out');
check(noAlerts(cp), '3: charpage.js uses no browser alert / confirm / prompt');

// 5 delete
const sp = rd('storagepage.js'), cr = rd('crafterpanel.js');
check(/Characters in no party/.test(sp) && /data-stgact="forget"/.test(sp) && /act === 'forget'/.test(sp), '5: Storage lists saved settings of characters in no party, with Delete');
check(/act === 'forget'[\s\S]{0,400}delete SP\.cur\.chars\[n\]/.test(sp), '5: Delete removes that character entry');
check(/Everything \(item rules too\)/.test(sp) && /pick === 'all'/.test(sp), '5: "Use party / default" can remove the item rules too (it looked like it did nothing)');
check(/data-crfact="remove"/.test(cr) && /a === 'remove'[\s\S]{0,700}remove: true/.test(cr), '5: a crafter card has "Remove this crafter" (POST remove: true)');
check(/a === 'remove'[\s\S]{0,200}uiConfirm\(/.test(cr), '5: removing a crafter asks first (uidialog)');
check(noAlerts(sp) && noAlerts(cr), '5: no browser alert / confirm / prompt');

// 6 grade filter
check(/function gradeBar\(/.test(cr) && /function gradeOf\(/.test(cr) && /data-crfact="grade"/.test(cr), '6: a grade filter over the crafter item lists');
const filtered = (cr.match(/\.filter\(r => gradeShow\(n, r\)\)/g) || []).length;
check(filtered >= 4, `6: the filter applies to crystallize, recipes, bag and clan warehouse lists (${filtered})`);
const G = new Function('GD', 'h', 'CI', (() => { const a = cr.indexOf('  const GIDX'), b = cr.indexOf('  function gradeBar('); return cr.slice(a, b) + 'return { gradeOf, gradeShow };'; })());
const T = G({ items: { 159: ['Bonebreaker', 'i', 'Weapon', '1'], 6579: ['Arcana Mace', 'i', 'Weapon', '5'] } }, (s) => s, { grade: { X: 'S' } });
check(T.gradeOf({ id: 159, name: 'Bonebreaker' }) === 'D', '6: grade from the client item data (Bonebreaker = D)');
check(T.gradeOf({ name: 'Recipe: Arcana Mace (60%)' }) === 'S', '6: a recipe has the grade of what it makes');
check(T.gradeOf({ grade: 'C', name: 'x' }) === 'C', '6: the row\'s own grade wins');
check(T.gradeShow('X', { grade: 'S' }) === true && T.gradeShow('X', { grade: 'D' }) === false, '6: the filter shows only the chosen grade');

// 7 overflow
const ic = rd('itemspage.css');
check(/\.itp-grid > \.itp-tile \{[^}]*min-width: 0/.test(ic), '7: an item tile never grows past its grid column');
check(/\.itp-nm \{[^}]*overflow-wrap: anywhere/.test(ic) && /-webkit-line-clamp: 3/.test(ic), '7: long names wrap inside the tile (3 lines)');

console.log(fails ? `\n${fails} FAILED` : '\nALL OK');
process.exit(fails ? 1 : 0);
