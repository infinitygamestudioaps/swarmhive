// ACADGRADE-2026-11-04 guard (owner: "Why is Dravwen5047 wearing c grade jewels? It cant use them and WILL have penalty for wearing high
// level accessories?"): an academy buy / equip never takes a grade above what the character's level allows. Sandbox only (no game, no files written).
'use strict';
const fs = require('fs'), path = require('path');
const R = path.join(__dirname, '../../..'), SRC = fs.readFileSync(path.join(R, 'Scripts_dev', 'swarm.js'), 'utf8');
let ok = 0, bad = 0; const check = (c, m) => { if (c) { ok++; console.log('ok   ' + m); } else { bad++; console.log('FAIL ' + m); } };
const cut = (a, b) => { const i = SRC.indexOf(a); return i < 0 ? '' : SRC.slice(i, SRC.indexOf(b, i)); };
const pure = cut('var ACAD_GRADE_LEVEL', '/** graduate step');
check(pure.length > 0, 'ACADGRADE pure part (grade table, acadGradeOk, acadBuyNeed) exists');
const P = new Function(pure + '\nreturn { ACAD_GRADE_LEVEL, acadGradeOk, acadBuyNeed };')();
const G = JSON.parse(fs.readFileSync(path.join(R, 'Scripts', 'data', 'gear_items.json'), 'utf8')).items;

// 1) the grade table
check(P.acadGradeOk('D', 20) && !P.acadGradeOk('D', 19) && P.acadGradeOk('C', 40) && !P.acadGradeOk('C', 38) && P.acadGradeOk('NONE', 1) && !P.acadGradeOk('A', 60), 'grade levels: D 20, C 40, A 61, no grade always');
// 2) the live case: C jewels for a level 38 academy character
const c = P.acadBuyNeed({ id: 12331, count: 2, equip: true }, {}, {}, G[12331], 38);
check(c.act === 'skip' && /C-grade needs level 40/.test(c.why), 'Dravwen5047 case: a C-grade Common Ring of Protection at level 38 = skip (never bought / worn)');
check(P.acadBuyNeed({ id: 12321, count: 2, equip: true }, {}, {}, G[12321], 38).act === 'buy', 'the D Elven Ring at level 38 is bought');
// 3) jewelry: a worn piece blocks only when its M.Def is really as good (jewelry has no P.Def; the old 0 >= 0 check blocked every buy)
check(P.acadBuyNeed({ id: 12321, count: 2, equip: true }, {}, { ring: { pd: 0, ma: 0, md: 0 } }, G[12321], 38).act === 'buy', 'jewelry: an empty / unknown worn slot never blocks the buy');
check(P.acadBuyNeed({ id: 12321, count: 2, equip: true }, {}, { ring: { pd: 0, ma: 0, md: 30 } }, G[12321], 38).act === 'have', 'jewelry: a worn right-grade ring with more M.Def counts as as good');
// 4) acadWorn ignores a too-high worn piece (it has the penalty) so the right-grade piece is bought over it
check(/function acadWorn\(\)[^\n]*acadGradeOk\(f\.g, lv\)/.test(SRC), 'acadWorn: a worn piece above my grade never counts as "as good"');
// 5) the buy + the wear loop use the level; pairs are worn until both are on
check(SRC.includes("acadBuyNeed(row, acadHolds(), acadWorn(), (gearDb().items || {})[num(row.id)], num(Me.Level))") && SRC.includes("if (nd.act === 'skip') { res.push("), 'the kit buy passes my level and skips a too-high grade');
check(/if \(f && !acadGradeOk\(f\.g, num\(Me\.Level\)\)\) continue;/.test(SRC) && /if \(worn >= want \|\| !item\) break;/.test(SRC), 'the wear loop never wears a too-high grade and wears BOTH earrings / rings');
// 5b) ACADGRADE2: a too-high worn jewel = both slots of that kind taken off first (else the 2nd D piece replaced the 1st and a C piece stayed on)
check(/tooHigh\) \{ const masks = f\.s === 'earring' \? \[0x02, 0x04\] : f\.s === 'ring' \? \[0x10, 0x20\] : \[0x08\];/.test(SRC) && /Send\.SendHex\('16' \+ cryLe\(m, 4\)\)/.test(SRC), 'a worn too-high earring / ring / necklace: both slots are taken off before the D pair goes on');
// 6) the data: every academy buy set holds no grade above the level its step runs at
const A = JSON.parse(fs.readFileSync(path.join(R, 'Scripts', 'data', 'academy.json'), 'utf8').replace(/^﻿/, ''));
const AT = { start: 1, level18: 18, level20: 20, jewels: 20 };   // jewels are bought before Cruma Tower (level 20-30): D at most
const badRows = [];
for (const set in AT) (A.buy[set] || []).forEach(r => { const f = G[r.id]; if (f && !P.acadGradeOk(f.g, AT[set])) badRows.push(`${set}: ${r.name} (${f.g})`); });
check(!badRows.length, 'academy.json: no buy row above the grade of its step level' + (badRows.length ? ' - ' + badRows.join(', ') : ''));
check((A.buy.jewels || []).map(r => r.id).join(',') === '12322,12320,12321', 'jewels = 2x Elven Earring, Elven Necklace, 2x Elven Ring (D Common)');
console.log(`acad grade: ${ok} ok, ${bad} failed`); process.exit(bad ? 1 : 0);
