// OFFLINE TEST of the GEAR PLANNER preferences (2026-10-09): the GEARPREF block of Scripts_dev/swarm.js (how a bot reads its class's
// choices) against what Dashboard/gearpage_api.js writes. No game, no server, no browser, nothing is written.
//   node docs/plan/tools/test_gear_prefs.js        (exit code 1 when a check fails; SWARM_SRC=<file> tests another copy)
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const SRC = process.env.SWARM_SRC || path.join(ROOT, 'Scripts_dev', 'swarm.js');
const src = fs.readFileSync(SRC, 'utf8');
const a = src.indexOf('// GEARPREF-BEGIN'), b = src.indexOf('// GEARPREF-END');
if (a < 0 || b < a) { console.error('GEARPREF block not found'); process.exit(1); }
const M = new Function(src.slice(a, b) + '\nreturn { GEARPREF_SLOTS, GEARPREF_BOT, gearPrefEntry, gearPrefResolve, gearPrefWant, gearPrefChoose };')();
const API = require(path.join(ROOT, 'Dashboard', 'gearpage_api.js'))._t;
let fails = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails++; };

// ---- 1) entries: the old format (an item id) and the new one
check(JSON.stringify(M.gearPrefEntry(5286, 'role')) === JSON.stringify({ id: 5286, alt: [], buy: 'auto', name: '', src: '', from: 'role' }), 'old format: an item id');
const e = M.gearPrefEntry({ id: '60', alt: [61, 'x', 0, '62'], buy: 'real', name: 'Composite Armor', src: 'craft' }, 'class 46');
check(e.id === 60 && e.alt.join() === '61,62' && e.buy === 'real' && e.from === 'class 46', 'new format: id, alternatives (junk dropped), buy rule');
check(M.gearPrefEntry({ id: 5, buy: 'weird' }).buy === 'auto', 'an unknown buy rule = auto');
check(M.gearPrefEntry(null) === null && M.gearPrefEntry({ x: 1 }) === null && M.gearPrefEntry(0) === null, 'nothing / junk = no entry');

// ---- 2) resolve: class, parent line, role, _weapon, _fallback
const P = {
  destroyer: { C: { weapon: 5286, _weapon: { type: 'SWORD', two: true, real: 'crystal' } }, B: { weapon: 7901 } },
  _parents: { 113: 46, 46: 45, 45: 44 },
  _class: { 46: { C: { chest: { id: 60, alt: [61], buy: 'auto' }, belt: { id: 13894 }, _fallback: 'keep' } }, 113: { B: { head: { id: 500 } } } },
};
let r = M.gearPrefResolve(P, 'destroyer', 46, 'C');
check(r.chest && r.chest.id === 60 && r.chest.from === 'class 46', 'own class choice');
check(r.weapon && r.weapon.id === 5286 && r.weapon.from === 'role', 'slot without a class choice -> the role choice (old format keeps working)');
check(r._weapon && r._weapon.type === 'SWORD', 'the destroyer _weapon rule is kept');
check(r._fallback === 'keep', '_fallback from the class');
check(r.belt && r.belt.id === 13894, 'extra slots (belt) are read');
r = M.gearPrefResolve(P, 'destroyer', 113, 'C');
check(r.chest && r.chest.id === 60 && r.chest.from === 'class 46', 'Titan without a C plan uses its parent Destroyer');
r = M.gearPrefResolve(P, 'destroyer', 113, 'B');
check(r.head && r.head.id === 500 && r.weapon && r.weapon.id === 7901, 'Titan B: own head + the role weapon');
r = M.gearPrefResolve(P, 'sk', 33, 'C');
check(Object.keys(r).length === 0, 'a class / role with nothing chosen = nothing');
check(Object.keys(M.gearPrefResolve(null, 'x', 1, 'C')).length === 0 && Object.keys(M.gearPrefResolve({}, '', null, 'C')).length === 0, 'no file / no class id = nothing');
const loop = { _parents: { 1: 2, 2: 1 }, _class: { 2: { C: { head: 7 } } } };
check(M.gearPrefResolve(loop, '', 1, 'C').head.id === 7, 'a parent loop in the file cannot hang the bot (max 6 steps)');

// ---- 2b) RECOMMENDED (gear_rec/<classId>.json): only where neither the class line nor the role chose
const REC = { grades: { C: { chest: { id: 999, alt: [998], buy: 'real', name: 'Rec Chest', src: 'shop' }, weapon: { id: 777 }, head: { id: 555 } } } };
r = M.gearPrefResolve(P, 'destroyer', 46, 'C', REC);
check(r.chest.id === 60 && r.chest.from === 'class 46', 'user class choice beats the recommendation');
check(r.weapon.id === 5286 && r.weapon.from === 'role', 'the old role choice beats the recommendation');
check(r.head && r.head.id === 555 && r.head.from === 'recommended', 'an empty slot takes the recommendation');
r = M.gearPrefResolve({}, '', 33, 'C', REC);
check(r.chest.id === 999 && r.chest.buy === 'real' && r.chest.alt[0] === 998 && r.chest.from === 'recommended', 'no prefs file entries: the full recommended plan (buy rule + alternative)');
check(Object.keys(M.gearPrefResolve({}, '', 33, 'B', REC)).length === 0, 'no recommendation for that grade = nothing');

// ---- 3) earrings / rings: two slots
check(M.gearPrefWant({ earring: { id: 1 } }, 'earring') === 2, 'one earring choice = wear two of it');
check(M.gearPrefWant({ earring: { id: 1 }, earring2: { id: 2 } }, 'earring') === 1 && M.gearPrefWant({ earring: { id: 1 }, earring2: { id: 2 } }, 'earring2') === 1, 'two different earrings = one of each');
check(M.gearPrefWant({ earring: { id: 1 }, earring2: { id: 1 } }, 'earring2') === 0 && M.gearPrefWant({ earring: { id: 1 }, earring2: { id: 1 } }, 'earring') === 2, 'the same earring twice = the first entry wants 2');
check(M.gearPrefWant({ weapon: { id: 1 } }, 'weapon') === 1, 'other slots: one');

// ---- 4) which offer is bought
const O = [{ id: 60, price: 1417185, common: false, npc: 'Radia' }, { id: 12100, price: 78193, common: true, npc: 'Radia' }];
check(M.gearPrefChoose(O, 'auto', false, false).id === 12100, 'auto, fighter: the Common twin (1/20 price)');
check(M.gearPrefChoose(O, 'auto', true, false).id === 60, 'auto, caster armor: the real piece (set bonus)');
check(M.gearPrefChoose(O, 'real', false, false).id === 60, 'real only');
check(M.gearPrefChoose(O, 'common', true, false).id === 12100, 'Common only (also for a caster)');
check(M.gearPrefChoose(O, 'common', false, true).id === 60, 'the weapon rule wants the real weapon (soul crystal ready) -> real');
check(M.gearPrefChoose([O[1]], 'auto', true, false).id === 12100, 'auto, caster: no real piece sold -> the Common one');
check(M.gearPrefChoose([O[1]], 'real', false, false) === null, 'real only but only the Common one is sold -> nothing (manual)');
check(M.gearPrefChoose([], 'auto', false, false) === null, 'not sold at all -> nothing (manual)');

// ---- 5) what the dashboard writes is what the bot reads
const C = API.catalog(path.join(ROOT, 'Dashboard'));
if (C) {
  const P2 = JSON.parse(JSON.stringify(P));
  check(API.mutate(C, P2, { action: 'set', class: 46, grade: 'C', slot: 'neck', id: 916, alt: [917], buy: 'auto' }) === null, 'dashboard: set a necklace for Destroyer C');
  const err = API.mutate(C, P2, { action: 'set', class: 131, grade: 'C', slot: 'chest', id: 2382 });
  check(typeof err === 'string' && /cannot wear/.test(err), 'dashboard refuses heavy armor for a Kamael: ' + err);
  const cp = API.mutate(C, P2, { action: 'copy', class: 46, grade: 'C', to: [45, 113] });
  check(cp && cp.n === 2 && P2._class[45].C.neck.id === 916, 'dashboard: copy to the archetype');
  r = M.gearPrefResolve(P2, 'destroyer', 113, 'C');
  check(r.neck && r.neck.id === 916 && r.neck.alt[0] === 917 && /Necklace/.test(r.neck.name) && r.neck.src.length > 3 && r.neck.from === 'class 113', 'bot reads the copied plan of its own class (name + where it comes from for the manual note)');
  check(P2._parents['113'] === 46 && P2._parents['106'] === 33, 'dashboard writes _parents for the bots');
  check(P2.destroyer.C.weapon === 5286 && P2.destroyer.C._weapon.type === 'SWORD', 'dashboard leaves the old role entries alone');
  API.mutate(C, P2, { action: 'set', class: 46, grade: 'C', slot: 'neck', id: null });
  check(!P2._class[46].C.neck, 'dashboard: remove a choice');
  API.mutate(C, P2, { action: 'clear', class: 45, grade: 'C' });
  check(!P2._class[45], 'dashboard: clear a grade (the empty class is removed)');
} else check(false, 'Dashboard/data/gear_catalog.json missing (node docs/plan/tools/gear_catalog.js)');

// ---- 5b) the recommendation engine (Dashboard/gear_recommend.js) on the real catalog + shop scan
if (C) {
  const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch (e) { return d; } };
  const G = API.giranOffers(path.join(ROOT, 'Scripts', 'data'), readJson);
  const RA = require(path.join(ROOT, 'Dashboard', 'gear_recommend.js')).recommendAll(C, G, { fitOf: API.fitOf, giranGet: API.giranGet, srcText: API.srcText });
  const rec = (cid, g) => RA.byKey[RA.classKey[cid]][g] || {};
  const nm = (e) => e ? (C.items[e.id] || {}).n : '';
  check(C.classes.every(c => ['NONE', 'D', 'C', 'B', 'A', 'S', 'S80', 'S84'].every(g => rec(c.id, g).weapon)), 'every class x grade has a recommended weapon');
  check(C.classes.every(c => ['D', 'C', 'B', 'A', 'S'].every(g => rec(c.id, g).chest)), 'every class has a recommended upper armor D..S');
  const ok1 = (cid, g, slot, f, what) => { const e = rec(cid, g)[slot]; check(!!e && f(C.items[e.id] || {}, e), `${what}: ${nm(e)} — ${e ? e.why.slice(0, 110) : 'none'}`); };
  ok1(46, 'C', 'weapon', it => it.two && /SWORD|BLUNT/.test(it.t), 'Destroyer C: a two-handed sword / blunt');
  ok1(33, 'C', 'weapon', it => !it.two && /SWORD|BLUNT/.test(it.t), 'Shillien Knight C: one-handed');
  ok1(33, 'C', 'shield', it => it.s === 'shield', 'Shillien Knight C: a shield');
  ok1(33, 'C', 'chest', it => it.t === 'HEAVY', 'Shillien Knight C: heavy armor');
  ok1(93, 'C', 'weapon', it => /DAGGER/.test(it.t), 'Adventurer: a dagger');
  ok1(92, 'C', 'weapon', it => it.t === 'BOW', 'Sagittarius: a bow');
  ok1(131, 'C', 'weapon', it => it.t === 'ANCIENTSWORD', 'Doombringer: an ancient sword (bought as its sword + Change Weapon)');
  ok1(132, 'C', 'weapon', it => it.t === 'RAPIER', 'Soul Hound: a rapier');
  ok1(131, 'C', 'chest', it => it.t !== 'HEAVY', 'Kamael: never heavy armor');
  ok1(16, 'C', 'chest', (it, e) => /Karmian/.test(it.n) && e.buy === 'real', 'Bishop C: the real Karmian set (cast speed)');
  ok1(13, 'C', 'chest', (it, e) => /Demon/.test(it.n) && e.buy === 'real', "Necromancer C: the real Demon's set (owner 2026-10-23: nukers Demon's set at 40, healers Karmian; was Karmian from the 2026-10-16 document)");
  ok1(16, 'C', 'chest', (it, e) => /Karmian/.test(it.n) && e.buy === 'real', 'Bishop C: the real Karmian set (owner 2026-10-23: healers Karmian)');
  ok1(16, 'C', 'weapon', it => it.mw, 'Bishop: a magic weapon');
  ok1(46, 'D', 'chest', (it, e) => e.buy === 'auto' && /sold in Giran/.test(e.why), 'Destroyer D: a set sold in Giran, bought as Common (No-grade / D rule)');
  ok1(46, 'B', 'ring', (it, e) => /Queen Ant/.test(it.n), 'D11 2026-10-12 (Discord user): the epic boss jewel of the grade IS the recommendation (Ring of Queen Ant for B)');
  ok1(33, 'C', 'belt', it => /Belt/.test(it.n), 'belts: a real belt');
  check(Object.values(RA.byKey).every(k => Object.values(k).every(sl => Object.values(sl).every(e => e.why && e.why.length > 10))), 'every recommendation has a one-line WHY');
  // a sold set wins over a better unsold one, the better one becomes the first alternative
  const anyAlt = Object.values(RA.byKey).some(k => Object.values(k).some(sl => Object.values(sl).some(e => e.alt.length && /better if you craft \/ drop it/.test(e.why))));
  check(anyAlt, 'a sold piece is the plan and a better unsold one the first alternative ("better if you craft / drop it")');
}

// ---- 6) the planner code uses the block (static checks)
const pu = src.slice(src.indexOf('function planUpgrades('), src.indexOf('function buyGearPicks('));
check(/gearPrefWant\(prefs, s\)/.test(pu) && /gearPrefChoose\(offers, E\.buy/.test(pu) && /needs manual:/.test(pu) && /keepWhenManual/.test(pu), 'planUpgrades: want count, buy rule, "needs manual", keep-fallback');
check(/fromRec && wearing < want/.test(pu) && /upgradeGain\(jid, jinfo, g(, [^)]*\))?\) < U\.minGain/.test(pu) && /if \(fromRec\) return;/.test(pu), 'planUpgrades: a recommended piece is bought only when it beats what I wear; unsold recommendations stay quiet');
check(/gear_rec\\\\\$\{cls\}\.json/.test(src) || /gear_rec/.test(src.slice(src.indexOf('function gearPrefsFor('), src.indexOf('function gearPrefsFor(') + 1200)), 'gearPrefsFor reads Scripts/data/gear_rec/<classId>.json');
check(/planned: plan\.prefs/.test(src), '!gearplan writes the planned slots (wearing / buy / manual) to Logs/gear_plan_<name>.json');
check(!/new Map\(/.test(src.slice(a, b)), 'no new Map() in the block (the host Map type)');

console.log(fails ? `${fails} FAILED` : 'ALL OK');
process.exit(fails ? 1 : 0);
