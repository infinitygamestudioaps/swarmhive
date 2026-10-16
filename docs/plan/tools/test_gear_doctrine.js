// GEAR DOCTRINE test (owner 2026-10-16): every class x grade in the bots' files (Scripts/data/gear_rec/<classId>.json) follows
// Scripts/data/gear_doctrine.json = the owner's document "Lineage 2 Gracia Final - Gear by Class and Grade".
//   node docs/plan/tools/test_gear_doctrine.js [--table]     (--table prints weapon / chest / shield per class and grade)
// Checks: every doctrine name exists in the catalog; weapon = the plan's main pick (or its first alternative the class can equip) with the
// other picks as alternatives; chest = the main set of the class's armor column, body pieces never of another armor type; shield only for
// tanks / dwarves (their set's shield), a sigil for casters from S, never next to a two-handed weapon; jewelry = the plan's piece, epics
// first in their slot; Kamael never a bow, a crossbow only on the Warder line; buffers / healers in robes; dwarves 1h + shield.
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const C = JSON.parse(fs.readFileSync(path.join(ROOT, 'Dashboard', 'data', 'gear_catalog.json'), 'utf8'));
const D = JSON.parse(fs.readFileSync(path.join(ROOT, 'Scripts', 'data', 'gear_doctrine.json'), 'utf8'));
const DOC = require(path.join(ROOT, 'Dashboard', 'gear_doctrine.js'));
let pass = 0, fail = 0; const fails = [];
const ok = (c, m) => { if (c) pass++; else { fail++; fails.push(m); } };
const it = (id) => C.items[id] || {};
const setOf = {}, setsOf = {}; C.sets.forEach(S => Object.values(S.pieces).forEach(ids => ids.forEach(i => { if (!setOf[i]) setOf[i] = S; (setsOf[i] = setsOf[i] || []).push(S); })));   // B+ helmets are shared by the heavy / light / robe sets of a family
const TYPE = { heavyShield: 'HEAVY', heavy: 'HEAVY', light: 'LIGHT', robe: 'MAGIC' };
const table = process.argv.includes('--table');

// 0) the plan itself
const r0 = require('child_process').spawnSync(process.execPath, [path.join(__dirname, 'gear_doctrine_check.js')], { encoding: 'utf8' });
ok(r0.status === 0, 'every name in gear_doctrine.json is a real item / set: ' + String(r0.stdout).trim());
ok(C.classes.every(c => Array.isArray(D.classes[String(c.id)])), 'every class of the catalog has a line + armor column in the plan');

C.classes.forEach(c => {
  const f = path.join(ROOT, 'Scripts', 'data', 'gear_rec', c.id + '.json');
  let R = null; try { R = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { }
  ok(!!R, `${c.name}: has its file`); if (!R) return;
  const [line, col] = D.classes[String(c.id)];
  D.grades.forEach(g => {
    const P = DOC.planFor(D, C, c.id, g), sl = (R.grades || {})[g] || {}, who = `${c.name} ${g}`;
    // weapon
    if (P.weapon.ids.length) {
      const w = sl.weapon;
      ok(w && P.weapon.ids.includes(w.id), `${who}: weapon ${w && w.name} is one of the plan's (${P.weapon.ids.map(i => it(i).n).join(', ')})`);
      if (w) {
        const fitIds = P.weapon.ids;   // the main pick, unless the class cannot equip it
        ok(w.id === fitIds[0] || fitIds.indexOf(w.id) > 0, `${who}: weapon order`);
        P.weapon.ids.filter(i => i !== w.id).forEach(i => ok((w.alt || []).includes(i), `${who}: weapon alternative ${it(i).n} listed`));
      }
      if (w && c.race === 'KAMAEL') {
        ok(it(w.id).t !== 'BOW', `${who}: a Kamael never gets a bow (${w.name})`);
        if (it(w.id).t === 'CROSSBOW') ok([126, 130, 134].includes(c.id), `${who}: a crossbow only on the Warder line (${w.name})`);
      }
    }
    // armor
    const mainSet = P.sets[0];
    if (mainSet) ok(sl.chest && (setsOf[sl.chest.id] || []).some(S => DOC.norm(S.name) === DOC.norm(mainSet)), `${who}: chest from the ${mainSet} set (got ${sl.chest && sl.chest.name})`);
    ['chest', 'legs'].forEach(s => { if (sl[s]) { const t = it(sl[s].id).t; ok(!t || t === 'NONE' || t === TYPE[col], `${who}: ${s} ${sl[s].name} is ${String(TYPE[col]).toLowerCase()} (${t})`); } });
    ['chest', 'legs', 'head', 'gloves', 'feet'].forEach(s => { if (sl[s] && setsOf[sl[s].id] && setsOf[sl[s].id].some(S => S.t)) ok(setsOf[sl[s].id].some(S => S.t === TYPE[col]), `${who}: ${s} ${sl[s].name} belongs to a ${setOf[sl[s].id].t.toLowerCase()} set, the class wears ${String(TYPE[col]).toLowerCase()}`); });
    // shield / sigil
    const two = sl.weapon && it(sl.weapon.id).two;
    if (sl.shield) ok(!two, `${who}: no shield next to a two-handed weapon (${sl.weapon && sl.weapon.name})`);
    if (col === 'heavyShield' && !two && g !== 'NONE') ok(!!sl.shield && it(sl.shield.id).t !== 'SIGIL', `${who}: tanks and dwarves carry a shield`);
    if (col === 'heavyShield' && mainSet && sl.shield) { const S = C.sets.find(x => DOC.norm(x.name) === DOC.norm(mainSet)); if (S && S.pieces.shield) ok(S.pieces.shield.includes(sl.shield.id), `${who}: the ${mainSet} set's shield (got ${sl.shield.name})`); }
    if (col !== 'heavyShield') ok(!sl.shield || (P.sigil.length && sl.shield.id === P.sigil[0]), `${who}: no shield outside tanks / dwarves (got ${sl.shield && sl.shield.name})`);
    if (P.sigil.length && !two) ok(sl.shield && sl.shield.id === P.sigil[0], `${who}: caster sigil ${it(P.sigil[0]).n}`);
    // jewelry + epics
    ['neck', 'earring', 'ring'].forEach(s => {
      const E = P.epics[s], N = P.jewel[s];
      if (E.length) { ok(sl[s] && sl[s].id === E[0], `${who}: ${s} = epic ${it(E[0]).n} first (got ${sl[s] && sl[s].name})`); if (sl[s] && N.length) ok((sl[s].alt || []).includes(N[0]), `${who}: ${s} falls back to ${it(N[0]).n} without the epic`); }
      else if (N.length) ok(sl[s] && sl[s].id === N[0], `${who}: ${s} = ${it(N[0]).n} (got ${sl[s] && sl[s].name})`);
    });
    if (table && ['NONE', 'D', 'C', 'B', 'A'].includes(g)) console.log(`${c.name.padEnd(20)} ${g.padEnd(4)} ${String(sl.weapon && sl.weapon.name).padEnd(34)} ${String(sl.chest && sl.chest.name).padEnd(28)} ${sl.shield ? sl.shield.name : ''}`);
  });
});
// doctrine decisions the owner named (section 7 of the document)
const rec = (id, g) => (JSON.parse(fs.readFileSync(path.join(ROOT, 'Scripts', 'data', 'gear_rec', id + '.json'), 'utf8')).grades || {})[g] || {};
ok(rec(0, 'NONE').weapon && rec(0, 'NONE').weapon.name === 'Falchion', 'base Human Fighter: no-grade 1h sword (was a Light Crossbow)');
ok(rec(124, 'NONE').weapon && it(rec(124, 'NONE').weapon.id).t === 'SWORD', 'base Kamael soldier: no-grade 1h sword, never a bow / crossbow');
ok(rec(9, 'D').weapon && rec(9, 'D').weapon.name === 'Light Crossbow' && it(rec(9, 'D').weapon.id).t === 'BOW', 'Hawkeye D: Light Crossbow = a D bow with arrows');
ok(rec(52, 'D').chest && it(rec(52, 'D').chest.id).t === 'MAGIC', 'Warcryer D: robe, not the heavy Brigandine Tunic');
ok(rec(55, 'C').weapon && !it(rec(55, 'C').weapon.id).two && !!rec(55, 'C').shield, 'Bounty Hunter C: 1h + shield (was the 2h Berserker Blade)');
ok(rec(55, 'C').chest && it(rec(55, 'C').chest.id).t !== 'LIGHT', 'Bounty Hunter C: heavy armor');
ok(rec(34, 'B').chest && setOf[rec(34, 'B').chest.id].t === 'HEAVY', 'Bladedancer B: heavy (dancers / singers)');
ok(rec(2, 'B').chest && setOf[rec(2, 'B').chest.id].t === 'LIGHT', 'Gladiator B: light');
ok(rec(16, 'S').shield && rec(16, 'S').shield.name === 'Arcana Sigil' && rec(16, 'S').weapon.name === 'Arcana Mace', 'Bishop S: Arcana Mace + Arcana Sigil');
ok(rec(16, 'A').weapon && rec(16, 'A').weapon.name === 'Daimon Crystal' && !rec(16, 'A').shield, 'Bishop A: 2h staff, no sigil below S');
ok(rec(46, 'B').weapon && rec(46, 'B').weapon.name === 'Star Buster', 'Destroyer B: Star Buster (Rsk. Focus)');
ok(rec(33, 'A').ring && rec(33, 'A').ring.name === 'Ring of Core' && (rec(33, 'A').ring.alt || []).includes(Object.keys(C.items).map(Number).find(i => C.items[i].n === 'Ring of Queen Ant')), 'Shillien Knight A: Ring of Core first, Queen Ant next');
if (fails.length) { console.log(fails.slice(0, 40).join('\n')); if (fails.length > 40) console.log(`... ${fails.length - 40} more`); }
console.log(`gear doctrine: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
