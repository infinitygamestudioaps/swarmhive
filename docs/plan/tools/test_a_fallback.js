// OFFLINE TEST AFALLBACK-2026-10-30 (tester Vykaax 21:22: "77-78 ... S grade eligible. They are still wearing c-grade ... I want them to buy a-grade";
// "I turned off s-grade in the Gear Plan hoping they would then fallback to consider a-grade the best they can get, but no luck"): from B grade up the
// gear-up buys the luxury shop's armor as ONE WHOLE SET of the role's armor type (sealed gloves / boots via Pushkin), plus normal B / A weapons /
// jewelry (no Common twin exists there). Below B nothing changes (Common items, owner 2026-10-07). Harness = test_seal_buy.js's (swarm.js copy).
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const ROOT = path.join(__dirname, '..', '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
const cut = (a, b) => { const i = SRC.indexOf(a), j = SRC.indexOf(b, i + 1); if (i < 0 || j < 0) throw new Error('marker not found: ' + (i < 0 ? a : b)); return SRC.slice(i, j); };
const lifted = cut('let USEAL = null;', 'const GD = {') + cut('/** SEALBUY-2026-10-30: sealed item id', '/** the unseal cost of a sealed piece');
const tmp = path.join(os.tmpdir(), 'afallback_swarm.js');
fs.writeFileSync(tmp, SRC.replace('/** Kamael: if I wear a sword', lifted + '\n/** Kamael: if I wear a sword'));
process.env.SWARM_SRC = tmp;
const H = fs.readFileSync(path.join(__dirname, 'test_full_armor.js'), 'utf8').split('// ==== FULLARMOR-2026-10-15')[0];
const T = new Function('require', '__dirname', 'process', H + '\nreturn { plan, check, done: () => ({ oks, fails }) };')(require, __dirname, process);
const { plan, check } = T;
const G = JSON.parse(fs.readFileSync(path.join(ROOT, 'Scripts', 'data', 'gear_items.json'), 'utf8').replace(/^﻿/, ''));
const ARM = ['chest', 'legs', 'head', 'gloves', 'feet'];
const setOf = (id) => G.sets.find(s => Object.values(s.pieces).some(v => v.map(Number).includes(Number(id))));
const wholeSet = (r) => { const a = r.buys.filter(p => ARM.includes(p.slot)); if (!a.length) return { ok: false, why: 'no armor' };
  const ch = a.find(p => p.slot === 'chest') || a[0], S = setOf(ch.id); if (!S) return { ok: false, why: a[0].info.n + ' is in no set' };
  const need = Object.keys(S.pieces).filter(s => s !== 'shield'), got = a.map(p => p.slot);
  const inS = (id) => Object.values(S.pieces).some(v => v.map(Number).includes(Number(id)));
  return { ok: a.every(p => inS(p.id)) && need.every(s => got.includes(s)), S, why: `${S.name}: ${got.join(',')} of ${need.join(',')}` }; };
const cases = [
  { what: 'tank lvl 77 in C (Common Full Plate)', classId: 90, level: 77, role: 'tank', worn: ['Common Item - Full Plate Armor', 'Common Item - Full Plate Helmet', 'Common Item - Full Plate Shield', 'Common Item - Yaksa Mace'], type: 'HEAVY' },
  { what: 'duelist lvl 78 in a one-piece Common Full Plate', classId: 88, level: 78, role: 'melee', worn: ['Common Item - Full Plate Armor', 'Common Item - Full Plate Helmet'], type: 'HEAVY' },
  { what: 'archmage lvl 78 in Demon\'s robe (C)', classId: 94, level: 78, role: 'mage', worn: ["Demon's Tunic", "Demon's Stockings", "Demon's Gloves"], type: 'MAGIC' },
];
console.log('1) S-eligible characters in C get a WHOLE A set of their armor type');
for (const c of cases) {
  const r = plan(Object.assign({ budget: 80000000 }, c)).r, w = wholeSet(r), ch = r.buys.find(p => p.slot === 'chest');
  check(w.ok && ch && ch.info.g === 'A' && ch.info.t === c.type, `${c.what}: ${w.why} (${ch ? ch.info.n + ' ' + ch.info.g + ' ' + ch.info.t : 'no chest'}; set ok ${w.ok})`);
  check(r.buys.filter(p => ['gloves', 'feet'].includes(p.slot)).every(p => p.offer.sealed && p.offer.sealed.unseal.id === p.id), `${c.what}: gloves / boots bought sealed + unsealed at Pushkin`);
  check(r.buys.filter(p => ['neck', 'earring', 'ring'].includes(p.slot)).every(p => ['A', 'B'].includes(p.info.g)), `${c.what}: B / A jewelry (no C Common any more)`);
}
console.log('2) never half a set: too little adena for the whole set = no armor piece at all');
{ const r = plan(Object.assign({ budget: 3000000 }, cases[0])).r;
  check(!r.buys.some(p => ARM.includes(p.slot) && p.info.g === 'A'), `tank with 3M: no loose A armor piece (${r.buys.map(p => p.info.n).join(', ') || 'nothing'})`);
  check(r.skipped.some(s => /set: saving up|saving up for the armor/.test(s)), 'it says it saves up for the set'); }
console.log('3) below B nothing changes: Common items');
{ const r = plan({ classId: 5, level: 45, role: 'tank', worn: [], budget: 80000000 }).r;
  check(r.buys.length && r.buys.every(p => !['B', 'A', 'S'].includes(p.info.g)), `tank lvl 45: C / Common only (${r.buys.map(p => p.info.n).slice(0, 4).join(', ')} ...)`); }
console.log('4) a worn A chest of another set is not replaced by a same-grade set');
{ const r = plan(Object.assign({}, cases[0], { worn: ['Dark Crystal Breastplate', 'Dark Crystal Gaiters'], budget: 80000000 })).r;
  check(!r.buys.some(p => p.slot === 'chest') && ['head', 'gloves', 'feet'].every(s => r.buys.some(p => p.slot === s && /Dark Crystal/.test(p.info.n))), `tank in Dark Crystal (A): no other A chest, its own set completed (${r.buys.filter(p => ARM.includes(p.slot)).map(p => p.info.n).join(', ') || 'no armor buys'})`); }
try { fs.unlinkSync(tmp); } catch (e) { }
const { oks, fails } = T.done();
console.log(`\nA fallback: ${oks} ok, ${fails} failed`);
process.exit(fails ? 1 : 0);
