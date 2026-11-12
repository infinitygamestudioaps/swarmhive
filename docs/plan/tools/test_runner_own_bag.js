// RUNNEROWNBAG + ROLEPACKAGE-2026-11-03 (owner: "Why is dagger1 not selling items marked for sale? Makes no sense" + "They should always
// empty their bags and sell what is not part of the 'package' for them"): the runner keeps only its package and gives everything else to the
// bank; the bank sweeps its whole bag when nearly full; recipes always go to the bank
const fs = require('fs'), path = require('path');
const SRC = fs.readFileSync(process.env.SWARM_JS || path.join(__dirname, '../../../Scripts_dev/swarm.js'), 'utf8');
let ok = 0, bad = 0; const t = (m, c) => { if (c) { ok++; console.log('ok   ' + m); } else { bad++; console.log('FAIL ' + m); } };
const cut = (a, b) => { const i = SRC.indexOf(a); return SRC.slice(i, SRC.indexOf(b, i)); };
const pkgSrc = cut('const ROLE_PACKAGE = {', '/** pure: o = { role:');
const P = new Function(pkgSrc + '\nreturn { rolePackage, crunSweepDue: ' + cut('function crunSweepDue(o) {', 'const CRSW').replace(/^function crunSweepDue/, 'function') + ' };')();
const bag = [
  { objId: 1, id: 57, name: 'Adena', count: 5e6 }, { objId: 2, id: 100, name: 'Common Item - Staff of Life', count: 1, equipped: true },
  { objId: 3, id: 3948, name: 'Blessed Spiritshot (D-Grade)', count: 25000 }, { objId: 4, id: 1061, name: 'Healing Potion', count: 80 },
  { objId: 5, id: 736, name: 'Scroll of Escape', count: 12 }, { objId: 6, id: 1864, name: 'Stem', count: 300 },
  { objId: 7, id: 951, name: 'Scroll: Enchant Weapon (C)', count: 3 }, { objId: 8, id: 9000, name: 'Recipe: Soulshot (S) Compressed Package (100%)', count: 1 },
  { objId: 9, id: 1458, name: 'Crystal: D-Grade', count: 900 }, { objId: 10, id: 3875, name: 'L2Day - A', count: 4 }, { objId: 11, id: 5000, name: 'Tutorial Guide', count: 1, notrade: true },
  { objId: 12, id: 4629, name: 'Red Soul Crystal - Stage 8', count: 1 }, { objId: 13, id: 1060, name: 'Lesser Healing Potion', count: 900 }];
const r = P.rolePackage(bag, 'runner'), gave = (id) => r.give.find(g => g.id === id), kept = (id) => r.keep.find(k => k.id === id);
t('the runner keeps adena, worn gear, untradeable items', kept(57) && kept(100) && kept(5000) && !gave(57) && !gave(100) && !gave(5000));
t('loot, materials, EWC, crystals, letters and recipes go to the bank', [1864, 951, 1458, 3875, 9000].every(id => gave(id)));
t('its package stays: potions / escape scrolls under the caps, a soul crystal', kept(1061) && kept(736) && kept(4629) && !gave(1061) && !gave(736));
t('above the cap the rest of the stack goes to the bank (shots 25000 -> 15000 given, potions 900 -> 600 given)', gave(3948) && gave(3948).count === 15000 && gave(1060) && gave(1060).count === 600);
t('sweep: the runner empties its bag only idle in Giran, not mid-trip, every 10 min at most',
  P.crunSweepDue({ role: 'runner', inGiran: true, busy: false, kinds: 30, lastAt: 0, now: 1e9 }) && !P.crunSweepDue({ role: 'runner', inGiran: true, busy: true, kinds: 30, lastAt: 0, now: 1e9 }) &&
  !P.crunSweepDue({ role: 'runner', inGiran: false, busy: false, kinds: 30, lastAt: 0, now: 1e9 }) && !P.crunSweepDue({ role: 'runner', inGiran: true, busy: false, kinds: 30, lastAt: 1e9 - 60000, now: 1e9 }));
t('sweep: the bank sweeps its whole bag when nearly full (Crafter1 199 kinds)', P.crunSweepDue({ role: 'bank', inGiran: true, busy: false, kinds: 199, lvl: '', lastAt: 0, now: 1e9 }) && P.crunSweepDue({ role: 'bank', inGiran: true, busy: false, kinds: 20, lvl: 'near', lastAt: 0, now: 1e9 }) && !P.crunSweepDue({ role: 'bank', inGiran: true, busy: false, kinds: 20, lvl: '', lastAt: 0, now: 1e9 }));
t('source: the trip end and the idle sweep give rolePackage(..., "runner").give; the bank sweep stores its whole bag (ids null)',
  SRC.split("'runner').give").length - 1 >= 2 && SRC.includes("crunBankStore(null, 'bank sweep (my whole bag)')") && SRC.includes('(ids === null || S.has(Number(b.id)))') && SRC.includes('ids !== null && !S.has(Number(it.id))'));
{ const H0 = new Function(cut('const CRUN_KEEP_RE', '// RUNNERMODE-2026-11-03') + '\nreturn crunHandRows;')();
  t('source: a recipe is never kept by the member take rule either', H0([{ objId: 1, id: 9000, name: 'Recipe: Soulshot (S) Compressed Package (100%)', count: 1 }]).length === 1 && /CRUN_HAND_ALWAYS_RE = \/\^Recipe:/.test(SRC)); }
// replay: Dagger1's real bag of 2026-11-03 14:53Z (181 kinds) - what would go to the bank now
try { const j = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../Logs/bag_Dagger1.json'), 'utf8')); const L = (j.items || j.bag || j).map(b => ({ objId: b.objId, id: b.id, name: b.name || b.n, count: b.count || b.c || 1, equipped: b.equipped || b.eq }));
  // RECREATE2-2026-11-03: the live bag is a replay only while it is still the overfull one (it empties to the bank since the fix is live)
  const q = P.rolePackage(L, 'runner');
  if (L.length >= 100) t(`replay Dagger1 14:53Z: ${q.give.length} of ${L.length} kinds go to the bank (most of the bag)`, q.give.length >= L.length * 0.6);
  else console.log(`skip replay (the live bag holds only ${L.length} kinds now - emptied to the bank)`); } catch (e) { console.log('skip replay (no Logs/bag_Dagger1.json)'); }
// RUNNERSCROLL-2026-11-12 (owner: "Why is the runner not collecting?"): a party member hands its enchant scrolls to the runner (the 'Scroll' keep
// word was meant for Scroll of Escape / Resurrection and kept 1,048 EWC + 510 EAC in the EWC duos' bags)
{ const hs = cut('const CRUN_KEEP_RE', '// RUNNERMODE-2026-11-03');
  const H = new Function(hs + '\nreturn crunHandRows;')();
  const mb = [{ objId: 1, id: 951, name: 'Scroll: Enchant Weapon (C-Grade)', count: 232 }, { objId: 2, id: 952, name: 'Scroll: Enchant Armor (C-Grade)', count: 111 },
    { objId: 3, id: 6575, name: 'Blessed Scroll: Enchant Weapon (C-Grade)', count: 1 }, { objId: 4, id: 736, name: 'Scroll of Escape', count: 20 },
    { objId: 5, id: 737, name: 'Scroll of Resurrection', count: 5 }, { objId: 6, id: 10650, name: "Adventurer's Scroll of Escape", count: 5 },
    { objId: 7, id: 12753, name: 'Kamael Village Teleportation Scroll', count: 10 }, { objId: 8, id: 1868, name: 'Thread', count: 160 }, { objId: 9, id: 1463, name: 'Soulshot (C-Grade)', count: 5000 }];
  const g = new Set(H(mb).map(b => b.id));
  t('replay Spoiler3 05:27: EWC (951), EAC (952) and blessed enchant scrolls go to the runner', g.has(951) && g.has(952) && g.has(6575));
  t('Scroll of Escape / Resurrection / teleport scrolls and shots stay with the character', !g.has(736) && !g.has(737) && !g.has(10650) && !g.has(12753) && !g.has(1463));
  t('materials still go (Thread)', g.has(1868)); }
console.log(`runner own bag: ${ok} ok, ${bad} failed`); process.exit(bad ? 1 : 0);
