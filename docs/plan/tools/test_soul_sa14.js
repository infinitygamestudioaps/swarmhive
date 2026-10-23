// OFFLINE TEST (public tester 1.8.17, 2026-10-23: "soul crystals tab: 'Working towards' is missing most of lvl14+ special abilities").
//   node docs/plan/tools/test_soul_sa14.js        (exit code 1 when a check fails)
// The Crystals tab table (Dashboard/server.js soulTable) = the user's soul_sa.txt (stops at S-grade) + every datapack SA-recipe weapon it lacks.
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const src = fs.readFileSync(path.join(ROOT, 'Dashboard', 'server.js'), 'utf8');
let fails = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails++; };
const i = src.indexOf('const SOUL_WTYPE'), j = src.indexOf('const CASTER_RE');
check(i > 0 && j > i, 'soulTableMerge block exists in server.js');
const merge = new Function(src.slice(i, j) + ';return soulTableMerge;')();
const rec = { recipes: [
  { w: 1, wn: 'Icarus Hall', g: 'S80', sa: 'Acumen', color: 'blue', stage: 14 },
  { w: 1, wn: 'Icarus Hall', g: 'S80', sa: 'Mana Up', color: 'red', stage: 14 },
  { w: 1, wn: 'Icarus Hall', g: 'S80', sa: 'Conversion', color: 'green', stage: 14 },
  { w: 2, wn: 'Arcana Mace', g: 'S', sa: 'Something else', color: 'red', stage: 13 },
  { w: 3, wn: 'Vesper Caster - Acumen', g: 'S80', sa: 'Mana Up', color: 'red', stage: 16 }] };
const gear = { items: { 1: { t: 'BLUNT', two: 0, g: 'S80' }, 2: { t: 'BLUNT', two: 0 }, 3: { t: 'BLUNT', two: 0 } } };
const user = [{ grade: 'S', type: 'blunt', name: 'Arcana Mace', stage: 13, sa: { red: 'Acumen', green: 'MP Regeneration', blue: 'Mana Up' } }];
const out = merge(user.slice(), rec, gear);
const ic = out.find(r => r.name === 'Icarus Hall');
check(!!ic && ic.stage === 14 && ic.grade === 'S80' && ic.type === 'blunt', 'an S80 weapon (stage 14) the user table lacks is added');
check(ic && ic.sa.red === 'Mana Up' && ic.sa.green === 'Conversion' && ic.sa.blue === 'Acumen', '... with all three colours');
check(out.filter(r => r.name === 'Arcana Mace').length === 1 && out.find(r => r.name === 'Arcana Mace').sa.red === 'Acumen', 'the user table wins for a weapon it already has');
check(!out.some(r => /Vesper Caster - /.test(r.name)), 'SA-swap recipes (a weapon that already has an ability) are not added');
// the live data: stage 14+ rows really appear
const live = merge([], JSON.parse(fs.readFileSync(path.join(ROOT, 'Scripts', 'data', 'soul_sa_recipes.json'), 'utf8')), JSON.parse(fs.readFileSync(path.join(ROOT, 'Scripts', 'data', 'gear_items.json'), 'utf8')));
const hi = live.filter(r => r.stage >= 14);
check(hi.length >= 40, `live data: ${hi.length} weapons at crystal stage 14+ (was 1 in soul_sa.txt)`);
check(hi.some(r => r.grade === 'S84') && hi.some(r => r.grade === 'S80'), 'live data: S80 and S84 weapons are in the table');
check(/soulTableMerge\(out, readJson\(path\.join\(DATA, 'soul_sa_recipes\.json'\)/.test(src), 'soulTableFresh merges soul_sa_recipes.json');
check(/GRADES\.concat\(\['S80', 'S84'\]\)/.test(src), 'soulPick walks on into S80 / S84');
console.log(fails ? `\n${fails} FAILED` : '\nALL OK');
process.exit(fails ? 1 : 0);
