// CHANTPICK-2026-11-02: Chant of Victory and Magnus' Chant replace each other on L2Toggle - only ONE of the two is ever bought
// (19 of 20 academy nukers ended up without Magnus' Chant: every Giran visit bought CoV, Magnus, CoV ... and the last buy won)
const fs = require('fs'), path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '../../../Scripts_dev/swarm.js'), 'utf8');
let ok = 0, bad = 0; const check = (c, m) => { if (c) { ok++; console.log('ok   ' + m); } else { bad++; console.log('FAIL ' + m); } };
const i = SRC.indexOf('function storeChantPick('); const P = new Function(SRC.slice(i, SRC.indexOf('\n', i)) + '\nreturn storeChantPick;')();
check(P(true, true) === 'magnus', 'both wanted (academy casters, party switches storeCov + storeMagnus) = Magnus\' Chant only');
check(P(true, false) === 'cov' && P(false, true) === 'magnus' && P(false, false) === null, 'one wanted = that one; none = nothing');
const acad = SRC.slice(SRC.indexOf('async function acadStoreBuffs('), SRC.indexOf('async function planStepAcademy('));
check(/const pick = storeChantPick\(!!B\.cov, !!B\.magnus\)/.test(acad) && /if \(pick === 'magnus'\)/.test(acad) && /if \(pick === 'cov'\)/.test(acad), 'academy store buffs buy only the picked chant');
check((SRC.match(/storeChantPick\(pautoOn\('storeCov'\), pautoOn\('storeMagnus'\)\)/g) || []).length === 2, 'the rebuff trip and the supply run use the pick too');
check(!/if \(pautoOn\('storeCov'\)( && currentTownKey\(\) === 'Giran' && !hurry\(\))?\) \{/.test(SRC), 'no store-buff path buys Chant of Victory on its switch alone anymore');
console.log(`chantpick: ${ok} ok, ${bad} failed`); process.exit(bad ? 1 : 0);
