// OFFLINE TEST: public tester reports v1.8.17 (2026-10-23) about gear up (planUpgrades, the supply-run gear step, the leader's purse, equip after
// buying, the gear planner's slots). Runs the REAL planUpgrades of Scripts_dev/swarm.js in node (same harness as test_gear_starter.js, plus the
// class-plan gate from Dashboard/classlogic.js) + source checks for the host parts that need the game.
//   node docs/plan/tools/test_gear_testers3.js   (-v prints every plan; exit 1 on a failure)
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = process.env.TEST_ROOT || path.join(__dirname, '..', '..', '..');
const SRC = process.env.SWARM_SRC || path.join(ROOT, 'Scripts_dev', 'swarm.js');
const src = fs.readFileSync(SRC, 'utf8');
const VERBOSE = process.argv.includes('-v');
let fails = 0, oks = 0;
const check = (ok, what) => { if (ok) oks++; else fails++; console.log((ok ? 'ok   ' : 'FAIL ') + what); };
const cut = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i + 1); if (i < 0 || j < 0) throw new Error('marker not found: ' + (i < 0 ? a : b)); return src.slice(i, j); };
const code = [
  cut('const ROLEKIND = {', '// role regexes'),
  cut('function rkNum(v)', '/** which raid routine'),
  cut('let shopIdxCache = null;', '/** Kamael: if I wear a sword'),
  cut('const isSaWeapon =', '/** Buy the picks:'),
  cut('let gearDbCache = null', 'const BODY_SLOTS = ['),
  cut('const BODY_SLOTS = [', 'const badEquip = {};'),
].join('\n');
const DATA = path.join(ROOT, 'Scripts', 'data');
const ITEMS = JSON.parse(fs.readFileSync(path.join(DATA, 'gear_items.json'), 'utf8')).items;
const TREE = JSON.parse(fs.readFileSync(path.join(DATA, 'class_tree.json'), 'utf8'));
const CL = require(path.join(ROOT, 'Dashboard', 'classlogic.js'));
const idOf = (n) => { const k = Object.keys(ITEMS).find(x => ITEMS[x].n === n && !/^Sealed /.test(x.n)); if (!k) throw new Error('no item ' + n); return Number(k); };
/** o: { classId, level, role, worn: [names], budget, prefs, policy, plan: [class ids] (approved class plan), roleSrc: 'class' | 'kind' } */
function plan(o) {
  const env = {
    Me: { Name: 'Tester', Level: o.level || 20, ClassId: o.classId, objId: 1 },
    state: { role: o.role },
    CONFIG: { gear: { roles: {}, races: {}, gradeLevel: { NONE: 1, D: 20, C: 40, B: 52, A: 61, S: 76, S80: 80, S84: 84 },
      upgrade: { on: true, auto: true, keep: 5000, minGain: 1, order: ['weapon', 'chest', 'legs', 'shield', 'head', 'gloves', 'feet', 'neck', 'earring', 'earring', 'ring', 'ring'],
        casterSets: [{ from: 1, healer: 'Devotion', caster: 'Devotion' }, { from: 40, healer: 'Karmian', caster: "Demon's" }] } },
      healer: { roles: ['bishop', 'shilliensaint', 'healer'] } },
  };
  let oid = 100;
  const inv = (o.worn || []).map(n => ({ Id: idOf(n), objId: ++oid, Count: 1, IsEquiped: true, EnchantLvl: (o.enchant || {})[n] || 0, Name: n }));
  const files = { 'gear_auto.json': JSON.stringify(o.policy || { default: true, sameGradeSwap: false, keepArmorType: true }), 'gear_prefs.json': JSON.stringify(o.prefs || {}) };
  Object.assign(files, o.files || {});   // GEARFIX-2026-10-24: extra files (gear_upgrades.log)
  const File = {
    Exists: (f) => { const b = path.basename(String(f)); return b in files || fs.existsSync(String(f).replace(/^__S__/, DATA)); },
    ReadAllText: (f) => { const s = String(f), b = path.basename(s.replace(/\\/g, '/')); if (b in files) return files[b]; return fs.readFileSync(s.replace(/^__S__\\data/, DATA).replace(/\\/g, '/'), 'utf8'); },
    GetLastWriteTimeUtc: () => ({ Ticks: 1 }),
  };
  const plans = o.plan ? { parties: { P: { members: { Tester: { plan: o.plan, approved: true } } } } } : { parties: {} };
  const fn = new Function('Me', 'state', 'CONFIG', 'File', '__SCRIPTS__', 'Inventory', 'hostSnap', 'now', 'num', 'logError', 'teamOf', 'soulTarget', 'myCrystals', 'soulReady', 'fileStamp', 'isHealerRole',
    'classPlans', 'classTree', 'cpEntry', 'cpValidate', 'cpFits', 'RKH',
    code + '\nreturn { planUpgrades, gearRole, gearClassId, canUse, upgradeGain, myGear, ggCheck };');
  const num = (v) => typeof v === 'bigint' ? Number(v) : (Number(v) || 0);
  const M = fn(env.Me, env.state, env.CONFIG, File, '__S__', { forEach: (f) => inv.forEach(f) }, { inv: () => inv }, () => Date.now(), num,
    (w, e) => { throw new Error(w + ': ' + (e && e.message)); }, () => 'P', () => null, () => [], () => false, () => '1',
    () => /bishop|shilliensaint|healer/.test(o.role), () => plans, () => TREE, CL.cpEntry, CL.cpValidate, CL.cpFits, { src: o.roleSrc || 'kind' });
  const r = M.planUpgrades(o.budget === undefined ? 5000000 : o.budget);
  if (VERBOSE) console.log(`     [${o.label || o.classId}] role ${M.gearRole()} class ${M.gearClassId()} | buys: ${r.buys.map(p => p.slot + '=' + p.info.n + ' ' + p.offer.price).join(', ')} | notes: ${(r.notes || []).join('; ')} | skipped: ${r.skipped.join('; ')} | why: ${r.why}`);
  return { r, M };
}
const slotBuy = (r, s) => r.buys.find(p => p.slot === s);
const FIGHTER = ["Squire's Sword", "Squire's Shirt", "Squire's Pants"], MYSTIC = ["Apprentice's Wand", "Apprentice's Tunic", "Apprentice's Stockings"], DWARF = ["Guild Member's Club", "Squire's Shirt", "Squire's Pants"];

// ---- 1) "the healer didn't buy anything at all" after "FindStuff5 paid FindHelper5 348,614 for gear" ----
{
  const sup = cut('async function leadSupply(why, opts)', '// 2b. PSHOP-2026-10-15');
  const iPay = sup.indexOf('await purseStep(runId, gp.got'), iRe = sup.indexOf("teamStep(runId, 'gearplan2'", iPay);
  check(iPay > 0 && iRe > iPay && (sup.match(/teamStep\(runId, 'gearplan'/g) || []).length === 1,
    "GEARFUND: the re-plan after the leader paid is its own step 'gearplan2' (the same key 'gearplan' returned the OLD answers at once)");
  check(/action === 'gearplan' \|\| action === 'gearplan2'/.test(src) && /'gearplan2'\) \{ try \{ await bagSync\(\)/.test(src), "GEARFUND: members answer 'gearplan2' (bag synced first: the new adena)");
  const wa = cut('async function waitAcks(', '/** Én handling');
  check(/const key = `\$\{runId\}:\$\{action\}`/.test(wa), 'waitAcks keys acks by runId:action (why a repeated action name re-used the old answers)');
  const gu = cut('async function gearUpgrade(', '// --- FRENZY KIT BUY');
  check(gu.indexOf('await bagSync(2000)') > 0 && gu.indexOf('await bagSync(2000)') < gu.indexOf('const plan = planUpgrades('), 'GEARFUND: gearUpgrade syncs the bag before planning (adena from the purse trade)');
  check(/gearplan2: 'checking the shops again/.test(fs.readFileSync(path.join(ROOT, 'Dashboard', 'activity.js'), 'utf8')), 'dashboard activity names the gearplan2 step');
  const { r: poor } = plan({ label: 'healer lvl 10, 100 adena', classId: 25, level: 10, role: 'healer', worn: MYSTIC, budget: 100 - 5000 });
  const { r: paid } = plan({ label: 'healer lvl 10 after 348,614', classId: 25, level: 10, role: 'healer', worn: MYSTIC, budget: 348714 - 5000 });
  check(!poor.buys.length && poor.short && poor.short.missing > 0, 'healer with 100 adena: nothing, short says what is missing (the purse pays that)');
  check(['chest', 'legs', 'head', 'gloves', 'feet', 'neck', 'earring', 'ring'].every(s => slotBuy(paid, s)), `same healer after the money: armor + jewels planned (${paid.buys.map(p => p.info.n).join(', ')})`);
  check(slotBuy(paid, 'chest').info.n === 'Tunic of Devotion' && slotBuy(paid, 'legs').info.n === 'Stockings of Devotion', 'R1 holds: the Devotion set for a level-10 healer');
  // a short budget: the set (whole) + the cheap pieces, the 217k staff skipped (not "the whole plan skipped")
  const { r: part } = plan({ label: 'healer 120k', classId: 25, level: 10, role: 'healer', worn: MYSTIC, budget: 120000 });
  check(!slotBuy(part, 'weapon') && slotBuy(part, 'chest') && slotBuy(part, 'legs') && part.buys.length >= 6, `120k: buys what it can afford (${part.buys.map(p => p.info.n).join(', ')}), skips the staff`);
}
// ---- 2) "new bots (lvl 1-19) still don't get rid of squire armor" ----
for (const m of [{ c: 53, n: 'Dwarven Fighter (spoiler)', role: 'spoiler', worn: DWARF }, { c: 0, n: 'Human Fighter', role: 'melee', worn: FIGHTER }, { c: 18, n: 'Elven Fighter (dagger)', role: 'dagger', worn: FIGHTER }]) {
  const { r } = plan({ label: m.n + ' lvl 12', classId: m.c, level: 12, role: m.role, worn: m.worn, budget: 2000000 });
  const ch = slotBuy(r, 'chest'), lg = slotBuy(r, 'legs');
  check(!!ch && !!lg && ch.info.g === 'NONE' && lg.info.g === 'NONE', `NOGRADEARMOR: ${m.n} lvl 12 with Squire's Shirt / Pants: buys a No-Grade top + legs (${ch ? ch.info.n : '-'} / ${lg ? lg.info.n : '-'})`);
}
{ const { r } = plan({ label: 'Human Fighter lvl 12 in a Cotton Shirt', classId: 0, level: 12, role: 'melee', worn: ["Squire's Sword", 'Cotton Shirt', 'Cotton Pants'], budget: 2000000 });
  check(!slotBuy(r, 'chest') || /^Common/.test(slotBuy(r, 'chest').info.n), 'a REAL No-Grade top the player put on is not replaced by another normal piece (only starter pieces)'); }
// ---- 4) "human rogue with class plan Hawkeye -> Sagittarius bought a mace" ----
{
  const { r, M } = plan({ label: 'Rogue lvl 25, plan Rogue>Hawkeye>Sagittarius, role auto', classId: 7, level: 25, role: 'dagger', roleSrc: 'class', plan: [7, 9, 92], worn: FIGHTER, budget: 3000000 });
  const w = slotBuy(r, 'weapon');
  check(M.gearClassId() === 92 && M.gearRole() === 'archer', `GEARCLASS: gear follows the class plan's last step (class ${M.gearClassId()}, gear role ${M.gearRole()})`);
  check(!!w && w.info.t === 'BOW', `GEARCLASS: Rogue planned as Hawkeye buys a BOW (${w ? w.info.n : 'nothing'})`);
  const { r: r2 } = plan({ label: 'Rogue lvl 25, plan Rogue>Treasure Hunter', classId: 7, level: 25, role: 'dagger', roleSrc: 'class', plan: [7, 8, 93], worn: FIGHTER, budget: 3000000 });
  check((slotBuy(r2, 'weapon') || { info: {} }).info.t === 'DAGGER', `Rogue planned as Treasure Hunter: a dagger (${(slotBuy(r2, 'weapon') || { info: { n: 'nothing' } }).info.n})`);
  const { r: r3, M: M3 } = plan({ label: 'Rogue lvl 25, no plan', classId: 7, level: 25, role: 'dagger', roleSrc: 'class', worn: FIGHTER, budget: 3000000 });
  check(M3.gearClassId() === 7 && (slotBuy(r3, 'weapon') || { info: {} }).info.t === 'DAGGER', 'no class plan: the current class (Rogue: dagger)');
  const { M: M4 } = plan({ label: 'Human Fighter lvl 15, plan Rogue>Hawkeye', classId: 0, level: 15, role: 'melee', roleSrc: 'class', plan: [7, 9, 92], worn: FIGHTER });
  check(M4.gearClassId() === 0 && M4.gearRole() === 'melee', 'a base class keeps its own gear until the first profession (GEARDOC base-class rule)');
  const { M: M5 } = plan({ label: 'Rogue, explicit role dagger', classId: 7, level: 25, role: 'dagger', roleSrc: 'kind', plan: [7, 9, 92], worn: FIGHTER });
  check(M5.gearRole() === 'dagger', 'a role written in swarm.config.json (not "auto") keeps its gear role');
  const { r: r6 } = plan({ label: 'Hawkeye, plan off-line (Treasure Hunter)', classId: 9, level: 45, role: 'archer', roleSrc: 'class', plan: [7, 8, 93], worn: ['Light Crossbow'], budget: 9000000 });
  check(!slotBuy(r6, 'weapon') || slotBuy(r6, 'weapon').info.t === 'BOW', 'a plan that does not fit the class (off-plan) is ignored');
  // no mace for any human melee / knight / rogue D config
  for (const m of [{ c: 1, role: 'melee' }, { c: 4, role: 'tank' }, { c: 7, role: 'dagger' }, { c: 7, role: 'archer' }]) {
    const { r: rr } = plan({ classId: m.c, level: 25, role: m.role, worn: FIGHTER, budget: 5000000 }); const ww = slotBuy(rr, 'weapon');
    check(!ww || !/Mace|Bonebreaker|Hammer/.test(ww.info.n), `class ${m.c} (${m.role}) lvl 25: no mace / hammer (${ww ? ww.info.n : 'none'})`);
  }
  check(/weapon: w => !w\.mw && \(w\.t === 'BOW' \? myRace\(\) !== 'KAMAEL' : w\.t === 'CROSSBOW' && myRace\(\) === 'KAMAEL'\)/.test(src), 'archer gear rule: bows for every race except Kamael, crossbows only for Kamael');
}
// ---- 3) "gear up doesn't work when chars have better items (after switching subclass)" ----
{
  const { r } = plan({ label: 'lvl 42 nuker in A gear (subclass)', classId: 12, level: 42, role: 'nuker', worn: ["Dasparion's Staff", 'Tallum Tunic', 'Tallum Stockings'], budget: 9000000 });
  check(slotBuy(r, 'chest') && slotBuy(r, 'chest').info.g === 'C' && slotBuy(r, 'legs'), `OVERGRADE: a level-42 caster wearing A gear (grade penalty) gets the C set (${r.buys.map(p => p.info.n).join(', ') || r.why})`);
  const { r: t } = plan({ label: 'lvl 45 tank in A gear (subclass)', classId: 5, level: 45, role: 'tank', worn: ['Tallum Blade', 'Dark Crystal Breastplate', 'Dark Crystal Gaiters'], enchant: { 'Tallum Blade': 4 }, budget: 9000000 });
  check(slotBuy(t, 'weapon') && slotBuy(t, 'weapon').info.g === 'C' && slotBuy(t, 'chest'), `OVERGRADE: a level-45 tank in A gear (even an enchanted +4 A weapon) gets C gear (${t.buys.map(p => p.info.n).join(', ') || t.why})`);
  const { r: k } = plan({ label: 'lvl 65 tank in A gear (usable)', classId: 5, level: 65, role: 'tank', worn: ['Tallum Blade', 'Dark Crystal Breastplate', 'Dark Crystal Gaiters'], budget: 9000000 });
  check(!slotBuy(k, 'weapon') && !slotBuy(k, 'chest'), 'usable A gear at 65 is never swapped for C');
  const { r: sp } = plan({ label: 'lvl 40 spoiler, only an S spear (powerleveling, Mr.P)', classId: 54, level: 40, role: 'spoiler', worn: ['Saint Spear'], budget: 9000000 });
  check(!slotBuy(sp, 'weapon'), `ONE over-grade weapon stays the player's choice (Mr.P's Saint Spear): ${slotBuy(sp, 'weapon') ? slotBuy(sp, 'weapon').info.n : 'kept'}`);
  check(/OVERGRADE-2026-10-23[\s\S]{0,400}if \(over\) return '';/.test(src) && /maxGrade: gearOverKit\(\) \? ggGrade\(myGearGrade\(\)\) : null/.test(src), 'GEARGUARD: a whole kit above my grade holds no slot (gearGuard passes maxGrade only then)');
}
// ---- 5) "none of my other parties EVER bought A-grade" ----
{
  const shops = JSON.parse(fs.readFileSync(path.join(DATA, 'shopscan_giran.json'), 'utf8')).shops;
  const top = new Set(); shops.forEach(s => (s.lists || []).forEach(l => (l.items || []).forEach(i => { const x = ITEMS[i.id]; if (x) top.add(x.g); })));
  check(!top.has('B') && !top.has('A') && !top.has('S'), `Giran's shop scan has no B / A / S gear (grades sold: ${[...top].join(', ')})`);
  const { r } = plan({ label: 'lvl 71 tank in C', classId: 5, level: 71, role: 'tank', worn: ['Common Item - Samurai Long Sword', 'Composite Armor'], budget: 130000000 });
  check((r.notes || []).some(n => /^A-grade: no NPC shop sells A gear \(Giran stops at C\)/.test(n)), `NPCGRADE: a level-71 character is told why no A gear is bought: "${(r.notes || []).find(n => /grade/.test(n)) || r.why}"`);
  const { r: low } = plan({ classId: 5, level: 45, role: 'tank', worn: FIGHTER, budget: 9000000 });
  check(!(low.notes || []).some(n => /no NPC shop sells/.test(n)), 'no such note below B (C is sold)');
}
// ---- 2b) bought but not equipped / jewels missing: the host part ----
{
  const bg = cut('async function buyGearPicks(', '/** How many copies of an item');
  check(/GEARBAG-2026-10-23[\s\S]*buyPacket\(sh0\.shopId, ids\.map\(id => \(\{ id, count: want\[id\] \}\)\)\)/.test(bg) && /want\[p\.id\] = 1;/.test(bg), 'GEARBAG: one merchant list = one buy packet, ONE of each id (never a count above 1 of a non-stackable item)');
  check(/if \(p\.bought\) continue;/.test(bg) && /for \(let w = 0; w < 14 && bagCount\(p\.id\) <= before; w\+\+\)/.test(bg), 'GEARBAG: the rest one by one, each waits up to ~7 s for the bag (was one look after 1.5 s)');
  const eb = cut('async function equipBought(', '/** Common pieces already in the bag');
  check(/await bagSync\(2000\)/.test(eb) && /x\.late = true/.test(eb), 'GEARBAG: equipBought syncs the bag and puts on pieces the buy check missed');
  const ec = cut('async function equipCommonFromBag(', '/** The whole upgrade');
  check(/setIdsB\.has\(num\(b\.id\)\) \|\| hbB\.has\(b\.info\.n\)/.test(ec), 'GEARBAG: real caster-set pieces and hive-bought pieces in the bag go on later too (not only Common items)');
}
// ---- 3b) the shirt slot on the gear planner ----
{
  const api = require(path.join(ROOT, 'Dashboard', 'gearpage_api.js'));
  check(api._t.SLOTS.includes('shirt'), 'SHIRTSLOT: the planner API has a shirt slot');
  const C = api._t.catalog(path.join(ROOT, 'Dashboard'));
  const shirts = Object.values(C.items).filter(i => i.s === 'shirt');
  check(!fs.existsSync(path.join(DATA, 'dp', 'gear_db.json')) || shirts.length > 20, `SHIRTSLOT: shirts from the datapack (${shirts.length})`);
  const pg = api._t.classPage(C, {}, { idx: {} }, 5, 'B', [], false, null, null);
  check(pg.cand && Array.isArray(pg.cand.shirt) && pg.cand.shirt.length > 0, `SHIRTSLOT: B-grade shirts listed for a Paladin (${pg.cand && pg.cand.shirt ? pg.cand.shirt.length : 0})`);
  const GP = fs.readFileSync(path.join(ROOT, 'Dashboard', 'gearpage.js'), 'utf8');
  check(/\['shirt', 'talisman', null\]/.test(GP) && /shirt: 'Shirt'/.test(GP) && /'ring2', 'shirt', 'belt'/.test(GP), 'SHIRTSLOT: the paper doll shows the shirt');
  check(/const GEARPREF_SLOTS = \[[^\]]*'shirt'/.test(src) && !/const GEARPREF_BOT = \[[^\]]*'shirt'/.test(src), 'SHIRTSLOT: swarm.js knows the slot, the bots never buy it (manual)');
}
// ---- 6) GEARFIX-2026-10-24: Hawkeye kept "the dagger type you chose", Elder kept Devotion, follow pulled the gear run back, Giran learned walls ----
{
  // a) Hawkeye at 41 wearing the Rogue's D dagger: the plan's bow (gear_rec/9.json Eminence Bow), not a Crystal Dagger
  const { r } = plan({ label: 'Hawkeye 41 in a Mithril Dagger', classId: 9, level: 41, role: 'archer', roleSrc: 'class', worn: ['Mithril Dagger'], budget: 9000000 });
  const w = slotBuy(r, 'weapon');
  check(!!w && w.info.t === 'BOW', `GEARFIX: a Hawkeye wearing his Rogue days' dagger buys a BOW (${w ? w.info.n : 'nothing'}; notes: ${(r.notes || []).join('; ').slice(0, 160)})`);
  check(!(r.notes || []).some(n => /kept the dagger type you chose/.test(n)), 'GEARFIX: no "kept the dagger type you chose" for the previous profession\'s weapon');
  // b) the hive bought the dagger itself (gear_upgrades.log) on a Sagittarius (parent Hawkeye: daggers are no parent weapon) -> bow; not bought by the hive -> the player's choice stays
  const log = '2026-10-20T10:00:00.000Z [Tester] lvl 30 dagger (supply run): Common Item - Crystal Dagger 322707: bought | Common Item - Crystal Dagger: equipped\r\n';
  const { r: hb } = plan({ label: 'Sagittarius, hive-bought dagger', classId: 92, level: 45, role: 'archer', roleSrc: 'class', worn: ['Common Item - Crystal Dagger'], budget: 9000000, files: { 'gear_upgrades.log': log } });
  check((slotBuy(hb, 'weapon') || { info: {} }).info.t === 'BOW', `GEARFIX: a dagger the HIVE bought is no player choice: bow (${(slotBuy(hb, 'weapon') || { info: { n: 'nothing' } }).info.n})`);
  const { r: pc } = plan({ label: 'Sagittarius, dagger from the player', classId: 92, level: 45, role: 'archer', roleSrc: 'class', worn: ['Common Item - Crystal Dagger'], budget: 9000000 });
  const pw = slotBuy(pc, 'weapon');
  check(!pw || pw.info.t === 'DAGGER', `GEARFIX: a dagger the player put on stays his choice (never overruled): ${pw ? pw.info.n : 'kept'}`);
  // c) knight with a bow a player gave: OWNTYPE unchanged
  const { r: kn } = plan({ label: 'Human Knight lvl 30 with a Composite Bow', classId: 4, level: 30, role: 'tank', worn: ['Composite Bow'], budget: 9000000 });
  const kw = slotBuy(kn, 'weapon');
  check(!kw || kw.info.t === 'BOW', `OWNTYPE holds: a knight's own bow stays a bow (${kw ? kw.info.n : 'kept'})`);
  // d) Elven Elder at 40 in the complete Devotion set: Karmian Tunic + Stockings (were "as good as" because of the worn set's +1000)
  const { r: el } = plan({ label: 'Elven Elder 40 in Devotion', classId: 30, level: 40, role: 'healer', worn: ['Tunic of Devotion', 'Stockings of Devotion', 'Leather Helmet'], budget: 9000000 });
  check(/Karmian/.test((slotBuy(el, 'chest') || { info: {} }).info.n || '') && /Karmian/.test((slotBuy(el, 'legs') || { info: {} }).info.n || ''), `GEARFIX: an Elder in the whole Devotion set buys Karmian Tunic + Stockings (${el.buys.map(p => p.info.n).join(', ')})`);
  const { M: MM } = plan({ classId: 30, level: 40, role: 'healer', worn: ['Karmian Tunic', 'Karmian Stockings'], budget: 0 });
  check(typeof MM.ggCheck === 'function', 'harness exposes ggCheck');
  // e) ggCheck: hiveWeapon + roleWeapon (pure)
  const dag = { s: 'weapon', t: 'DAGGER', g: 'D', n: 'Mithril Dagger' }, bowC = { s: 'weapon', t: 'BOW', g: 'C', n: 'Eminence Bow' }, bowNG = { s: 'weapon', t: 'BOW', g: 'NONE', n: 'Composite Bow' };
  const P0 = { auto: true, sameGradeSwap: false, keepArmorType: true }, isBow = (x) => x.t === 'BOW';
  check(/different weapon type/.test(MM.ggCheck({ slot: 'weapon', cand: bowC, worn: [dag], policy: P0 })), 'ggCheck: a player\'s dagger is never swapped for a bow');
  check(MM.ggCheck({ slot: 'weapon', cand: bowC, worn: [dag], policy: P0, hiveWeapon: true, roleWeapon: isBow }) === '', 'ggCheck: the hive\'s dagger -> the role\'s bow is fine');
  check(/lower grade/.test(MM.ggCheck({ slot: 'weapon', cand: bowNG, worn: [dag], policy: P0, hiveWeapon: true, roleWeapon: isBow })), 'ggCheck: never a lower grade, also then');
  check(/different weapon type/.test(MM.ggCheck({ slot: 'weapon', cand: { s: 'weapon', t: 'POLE', g: 'C' }, worn: [dag], policy: P0, hiveWeapon: true, roleWeapon: isBow })), 'ggCheck: only toward the ROLE weapon');
  // f) host parts (source)
  const gu = cut('async function gearUpgrade(', '// --- FRENZY KIT BUY');
  check(/const gfErrand = !state\.errand; if \(gfErrand\) \{ try \{ errandStart\('buy'/.test(gu) && /if \(gfErrand\) \{ try \{ errandEnd\('buy'\)/.test(gu), 'GEARFIX: every gear run (also the supply run / plan step) is an errand: follow keepers never pull the buyer back');
  const eq = cut('async function equipPiece(', '/** Put on what was bought');
  check(/for \(let w = 0; w < 12 && !on; w\+\+\)/.test(eq) && (eq.match(/Send\.UseItem\(oid\)/g) || []).length === 1, 'GEARFIX: equipPiece waits up to ~6 s for the equip (one UseItem only)');
  const eb = cut('async function equipBought(', '/** Common pieces already in the bag');
  check(/GEARFIX-2026-10-24: after a bag sync/.test(eb), 'GEARFIX: equipBought tries a piece once more after a bag sync');
  const gl = cut('function geoBlockLearn(', '/** NO-EXPERIENCE ZONE');
  check(/if \(currentTownKey\(\)\) return null;/.test(gl), 'GEARFIX: no learned blocked spots inside a town');
  // g) geopath: learned (non-manual) points inside a town box are ignored, manual ones and field ones stay
  const os = require('os'), Mod = require('module');
  const gpSrc = fs.readFileSync(process.env.GEOPATH_SRC || path.join(ROOT, 'docs', 'plan', 'tools', 'geopath.js'), 'utf8');
  const tmp = path.join(os.tmpdir(), 'geo_blocked_test_' + process.pid + '.json');
  fs.writeFileSync(tmp, JSON.stringify({ points: [
    { id: 'giran-learned', x: 83336, y: 148696, z: -3408, r: 250, learned: true, episodes: 247, active: true },
    { id: 'giran-manual', x: 81000, y: 148000, z: -3472, r: 250, manual: true },
    { id: 'camp-learned', x: -53976, y: 146072, z: -2800, r: 250, learned: true, episodes: 3, active: true }] }));
  const old = process.env.GEO_BLOCKED; process.env.GEO_BLOCKED = tmp;
  const m = new Mod(path.join(ROOT, 'docs', 'plan', 'tools', 'geopath_under_test.js'), module); m.filename = m.id; m.paths = Mod._nodeModulePaths(path.dirname(m.id));
  m._compile(gpSrc, m.id);
  const ids = m.exports.learnedBlocked().map(p => p.id).sort().join(',');
  if (old === undefined) delete process.env.GEO_BLOCKED; else process.env.GEO_BLOCKED = old; try { fs.unlinkSync(tmp); } catch (e) { }
  check(ids === 'camp-learned,giran-manual', `GEARFIX: geopath ignores LEARNED points inside a town (Giran start square), keeps manual + field ones (${ids})`);
}
console.log(`\n${oks} ok, ${fails} failed`);
process.exit(fails ? 1 : 0);
