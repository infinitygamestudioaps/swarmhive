// OFFLINE TEST: level-20 parties with STARTER weapons (tester Vykaax 2026-10-12: "they all bought D grade jewels and armor ... only the
// leader bought a D weapon, the others are stuck on the squire weapon"). Runs the REAL planUpgrades of Scripts_dev/swarm.js in node with a
// mocked character (class, level 20, starter gear worn) against the shipped Giran shop scan + gear_rec recommendations, and checks:
//  * every class of a fresh level-20 party gets a D weapon planned (the starter weapon is no user choice: GEARGUARD must not keep it);
//  * the Mr.P rule still holds for REAL weapons (a worn spear / bow is never swapped for another type);
//  * the starter-gear clean-up helpers (STARTERGEAR block: which pieces, sell / destroy / keep).
//   node docs/plan/tools/test_gear_starter.js        (exit 1 on a failure; SWARM_SRC=<file> tests another copy; -v prints every plan)
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const SRC = process.env.SWARM_SRC || path.join(ROOT, 'Scripts_dev', 'swarm.js');
const src = fs.readFileSync(SRC, 'utf8');
const VERBOSE = process.argv.includes('-v');
let fails = 0, oks = 0;
const check = (ok, what) => { if (ok) oks++; else fails++; console.log((ok ? 'ok   ' : 'FAIL ') + what); };
const cut = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i + 1); if (i < 0 || j < 0) throw new Error('marker not found: ' + (i < 0 ? a : b)); return src.slice(i, j); };
const code = [
  cut('const ROLEKIND = {', '// role regexes'),
  cut('let shopIdxCache = null;', '/** Kamael: if I wear a sword'),
  cut('const isSaWeapon =', '/** Buy the picks:'),
  cut('let gearDbCache = null', 'const BODY_SLOTS = ['),
  cut('const BODY_SLOTS = [', 'const badEquip = {};'),
].join('\n');
const DATA = path.join(ROOT, 'Scripts', 'data');
const ITEMS = JSON.parse(fs.readFileSync(path.join(DATA, 'gear_items.json'), 'utf8')).items;
const idOf = (n) => { const k = Object.keys(ITEMS).find(x => ITEMS[x].n === n); if (!k) throw new Error('no item ' + n); return Number(k); };

/** one mocked character -> the planUpgrades() result. o: { classId, level, role, worn: [names], prefs: object|null, policy } */
function plan(o) {
  const env = {
    Me: { Name: 'Tester', Level: o.level || 20, ClassId: o.classId, objId: 1 },
    state: { role: o.role },
    CONFIG: { gear: { roles: {}, races: {}, gradeLevel: { NONE: 1, D: 20, C: 40, B: 52, A: 61, S: 76, S80: 80, S84: 84 },
      upgrade: { on: true, auto: true, keep: 300000, minGain: 1, order: ['weapon', 'chest', 'legs', 'shield', 'head', 'gloves', 'feet', 'neck', 'earring', 'earring', 'ring', 'ring'],
        casterSets: [{ from: 1, healer: 'Devotion', caster: 'Devotion' }, { from: 40, healer: 'Karmian', caster: "Demon's" }] } },
      healer: { roles: ['bishop', 'shilliensaint', 'healer'] } },
  };
  let oid = 100;
  const inv = (o.worn || []).map(n => ({ Id: idOf(n), objId: ++oid, Count: 1, IsEquiped: true, EnchantLvl: (o.enchant || {})[n] || 0, Name: n }));
  const files = {
    'gear_auto.json': JSON.stringify(o.policy || { default: true, sameGradeSwap: false, keepArmorType: true }),
    'gear_prefs.json': JSON.stringify(o.prefs || {}),
  };
  const File = {
    Exists: (f) => { const b = path.basename(String(f)); return b in files || fs.existsSync(String(f).replace(/^__S__/, DATA)); },
    ReadAllText: (f) => { const s = String(f), b = path.basename(s.replace(/\\/g, '/')); if (b in files) return files[b]; return fs.readFileSync(s.replace(/^__S__\\data/, DATA).replace(/\\/g, '/'), 'utf8'); },
    GetLastWriteTimeUtc: () => ({ Ticks: 1 }),
  };
  const fn = new Function('Me', 'state', 'CONFIG', 'File', '__SCRIPTS__', 'Inventory', 'hostSnap', 'now', 'num', 'logError', 'teamOf', 'soulTarget', 'myCrystals', 'soulReady', 'fileStamp', 'isHealerRole',
    code + '\nreturn { planUpgrades, ggCheck: typeof ggCheck === "function" ? ggCheck : null, S: typeof STARTERGEAR === "object" ? STARTERGEAR : null, sgIsStarter: typeof sgIsStarter === "function" ? sgIsStarter : null, sgMode: typeof sgMode === "function" ? sgMode : null, sgPick: typeof sgPick === "function" ? sgPick : null };');
  const num = (v) => typeof v === 'bigint' ? Number(v) : (Number(v) || 0);
  const M = fn(env.Me, env.state, env.CONFIG, File, '__S__', { forEach: (f) => inv.forEach(f) }, { inv: () => inv }, () => Date.now(), num,
    (w, e) => { throw new Error(w + ': ' + (e && e.message)); }, () => 'P', () => null, () => [], () => false, () => '1',
    () => /bishop|shilliensaint|healer/.test(o.role));
  return { M, r: M.planUpgrades(o.budget === undefined ? 5000000 : o.budget) };
}
const weaponBuy = (r) => r.buys.find(p => p.slot === 'weapon');

// ---- 1) a fresh level-20 party, every first class + the base classes, starter gear on (the Vykaax case) ----
const FIGHTER = ["Squire's Sword", "Squire's Shirt", "Squire's Pants"], MYSTIC = ["Apprentice's Wand", "Apprentice's Tunic", "Apprentice's Stockings"];
const ORC = ['Training Gloves', "Squire's Shirt", "Squire's Pants"], DWARF = ["Guild Member's Club", "Squire's Shirt", "Squire's Pants"];
const party = [
  { c: 1, n: 'Warrior', role: 'melee', worn: FIGHTER }, { c: 4, n: 'Human Knight', role: 'tank', worn: FIGHTER }, { c: 7, n: 'Rogue', role: 'dagger', worn: FIGHTER },
  { c: 11, n: 'Wizard', role: 'nuker', worn: MYSTIC }, { c: 15, n: 'Cleric', role: 'healer', worn: MYSTIC }, { c: 19, n: 'Elven Knight', role: 'tank', worn: FIGHTER },
  { c: 26, n: 'Elven Wizard', role: 'nuker', worn: MYSTIC }, { c: 29, n: 'Elven Oracle', role: 'healer', worn: MYSTIC }, { c: 32, n: 'Palus Knight', role: 'sk', worn: FIGHTER },
  { c: 35, n: 'Assassin', role: 'dagger', worn: FIGHTER }, { c: 39, n: 'Dark Wizard', role: 'nuker', worn: MYSTIC }, { c: 42, n: 'Shillien Oracle', role: 'healer', worn: MYSTIC },
  { c: 45, n: 'Orc Raider', role: 'destroyer', worn: ORC }, { c: 47, n: 'Orc Monk', role: 'melee', worn: ORC }, { c: 50, n: 'Orc Shaman', role: 'buffer', worn: MYSTIC },
  { c: 54, n: 'Scavenger', role: 'spoiler', worn: DWARF }, { c: 56, n: 'Artisan', role: 'crafter', worn: DWARF },
  { c: 0, n: 'Human Fighter (no class change)', role: 'melee', worn: FIGHTER }, { c: 10, n: 'Human Mystic (no class change)', role: 'nuker', worn: MYSTIC },
  { c: 31, n: 'Dark Fighter (no class change)', role: 'melee', worn: FIGHTER },
];
party.forEach(m => {
  const { r } = plan({ classId: m.c, role: m.role, worn: m.worn });
  const w = weaponBuy(r);
  if (VERBOSE) console.log(`     ${m.n}: ${r.buys.map(p => p.info.n).join(', ')} | skipped: ${r.skipped.join('; ')}`);
  check(!!w && w.info.g === 'D', `${m.n} (${m.role}) with ${m.worn[0]}: buys a D weapon -> ${w ? w.info.n + ' (' + w.info.t + (w.info.two ? ' 2h' : '') + ')' : 'NOTHING (' + (r.skipped.filter(s => /weapon/.test(s)).join('; ') || r.why) + ')'}`);
  if (w && !/^(nuker|healer|buffer)$/.test(m.role)) check(!/^(BOW|CROSSBOW)$/.test(w.info.t) || m.role === 'archer', `${m.n}: a melee role never gets a bow for its starter sword (${w.info.n})`);
});
// Kamael (no Common rapier / ancient sword in Giran: bought as a sword + Change Weapon)
{ const { r } = plan({ classId: 125, role: 'doombringer', worn: ["Squire's Sword", "Squire's Shirt", "Squire's Pants"] }); const w = weaponBuy(r);
  check(!!w && w.info.g === 'D', `Kamael Trooper (doombringer) with a Squire's Sword: buys a D weapon -> ${w ? w.info.n + (w.change ? ' (Change Weapon)' : '') : 'NOTHING (' + r.skipped.join('; ') + ')'}`); }

// ---- 2) the Mr.P rule stays for REAL (non-starter) weapons ----
{ const { r } = plan({ classId: 54, role: 'spoiler', level: 40, worn: ['Saint Spear'] }); const w = weaponBuy(r);
  check(!w || w.info.t === 'POLE', `spoiler with Saint Spear at 40: never another weapon type (${w ? w.info.n : 'nothing'})`); }
{ const { r } = plan({ classId: 1, role: 'melee', worn: ['Composite Bow'] }); const w = weaponBuy(r);
  check(!w || /^(BOW|CROSSBOW)$/.test(w.info.t), `Warrior who chose a no-grade Composite Bow (not a starter piece): kept as a bow (${w ? w.info.n : 'nothing'})`); }
{ const { r } = plan({ classId: 1, role: 'melee', worn: ["Squire's Sword", "Squire's Shirt", "Squire's Pants"], policy: { default: true, chars: { Tester: { lock: true } } } });
  check(!r.buys.length, 'equipment lock: nothing bought even with starter gear'); }
{ const { r } = plan({ classId: 1, role: 'melee', worn: ["Squire's Sword"], policy: { default: false } });
  check(!!weaponBuy(r), 'planUpgrades itself is not gated by the auto switch (gearUpgrade is): a !upgrade still plans'); }

// ---- 3) STARTERGEAR helpers ----
const { M } = plan({ classId: 1, role: 'melee', worn: [] });
check(!!M.S && !!M.sgIsStarter && !!M.sgMode && !!M.sgPick, 'STARTERGEAR block present (sgIsStarter, sgMode, sgPick)');
if (M.sgIsStarter) {
  const I = (n) => ITEMS[idOf(n)];
  check(["Squire's Sword", "Squire's Shirt", "Squire's Pants", "Apprentice's Wand", "Apprentice's Tunic", "Apprentice's Stockings", "Guild Member's Club", 'Training Gloves', "Apprentice Adventurer's Long Sword"].every(n => M.sgIsStarter(I(n))), 'starter pieces are recognised (fighter / mystic / orc / dwarf / newbie-guide weapons)');
  check(!M.sgIsStarter(I('Composite Bow')) && !M.sgIsStarter(I('Long Sword')) && !M.sgIsStarter(I('Tunic')) && !M.sgIsStarter(null), 'bought / looted no-grade gear is NOT starter gear');
  check(!M.sgIsStarter(Object.assign({}, I("Squire's Sword"), { g: 'D' })), 'only no-grade pieces');
  check(M.sgMode({}) === 'sell' && M.sgMode({ starterGear: 'destroy' }) === 'destroy' && M.sgMode({ starterGear: 'keep' }) === 'keep' && M.sgMode({ starterGear: 'junk' }) === 'sell' && M.sgMode(null) === 'sell', 'gear_prefs.json starterGear: sell (default) | destroy | keep');
  const before = [{ objId: 11, id: idOf("Squire's Sword"), info: I("Squire's Sword") }, { objId: 12, id: idOf("Squire's Shirt"), info: I("Squire's Shirt") }, { objId: 13, id: idOf('Composite Bow'), info: I('Composite Bow') }];
  const bag = [
    { objId: 11, Id: idOf("Squire's Sword"), IsEquiped: false, IsQuestItem: false, EnchantLvl: 0, Name: "Squire's Sword", Count: 1 },
    { objId: 12, Id: idOf("Squire's Shirt"), IsEquiped: true, IsQuestItem: false, EnchantLvl: 0, Name: "Squire's Shirt", Count: 1 },
    { objId: 13, Id: idOf('Composite Bow'), IsEquiped: false, IsQuestItem: false, EnchantLvl: 0, Name: 'Composite Bow', Count: 1 },
    { objId: 14, Id: idOf("Squire's Pants"), IsEquiped: false, IsQuestItem: false, EnchantLvl: 0, Name: "Squire's Pants", Count: 1 },
  ];
  const picked = M.sgPick(before, bag, () => false);
  check(picked.length === 1 && picked[0].objId === 11, `only the REPLACED starter piece (was worn, now in the bag) goes: ${picked.map(p => p.name).join(', ')} (shirt still worn, bow not starter, pants were never worn)`);
  check(M.sgPick(before, bag.map(b => b.objId === 11 ? Object.assign({}, b, { EnchantLvl: 1 }) : b), () => false).length === 0, 'an enchanted piece is never touched');
  check(M.sgPick(before, bag.map(b => b.objId === 11 ? Object.assign({}, b, { IsQuestItem: true }) : b), () => false).length === 0, 'a quest item is never touched');
  check(M.sgPick(before, bag, (id) => id === idOf("Squire's Sword")).length === 0, 'a quest-protected id (qeProtected) is never touched');
}
// ---- 3b) the dashboard switch (Gear page -> /api/gearauto -> gear_auto.json "starterGear") on a scratch file ----
{
  const os = require('os'), TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'gearstarter-'));
  process.env.SWARM_GEARAUTO_FILE = path.join(TMP, 'gear_auto.json');
  const API = require(path.join(ROOT, 'Dashboard', 'gearauto_api.js')), ctx = { DATA: TMP, ROOT };
  check(API.info(ctx).starterGear === 'sell', 'API: no file -> starterGear "sell" (default)');
  check(API.post(ctx, { scope: 'policy', starterGear: 'destroy' }).starterGear === 'destroy' && JSON.parse(fs.readFileSync(process.env.SWARM_GEARAUTO_FILE, 'utf8')).starterGear === 'destroy', 'API: policy starterGear "destroy" is written to gear_auto.json');
  check(API.post(ctx, { scope: 'policy', starterGear: 'burn' }).code === 400, 'API: an unknown starterGear value is refused');
  if (M.sgMode) check(['sell', 'destroy', 'keep', 'x', ''].every(v => API.starterOf({ starterGear: v }) === M.sgMode({ starterGear: v })), 'dashboard resolution = bot resolution (sgMode)');
  const ex = JSON.parse(fs.readFileSync(path.join(DATA, 'gear_auto.example.json'), 'utf8'));
  check(ex.starterGear === 'sell' && /starter/i.test(ex['//starterGear'] || ''), 'gear_auto.example.json documents starterGear (sell)');
  const GPJ = fs.readFileSync(path.join(ROOT, 'Dashboard', 'gearpage.js'), 'utf8');
  check(/data-gpautostarter/.test(GPJ) && /starterGear: v/.test(GPJ) && /uiConfirm\(\{ title: 'Destroy replaced starter gear\?'/.test(GPJ) && !/\b(alert|confirm|prompt)\(/.test(GPJ.replace(/uiConfirm\(|uiAlert\(|uiPrompt\(/g, '')), 'Gear page: the select saves starterGear; "destroy" asks with the styled dialog (no browser dialogs)');
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { }
}
// ---- 5) OWNTYPE (public tester 2026-10-13, party Yellow lvl 20: "I gave them all Composite Bows because Zweihander can't be purchased,
//         and now they won't change weapon type"): upgrades stay WITHIN the type the player chose; gear_prefs.json still wins ----
{
  const BOWKIT = ['Composite Bow', 'Hard Leather Shirt', 'Hard Leather Gaiters'];
  const dump = (n, r) => { if (VERBOSE) console.log(`     ${n}: ${r.buys.map(p => p.slot + '=' + p.info.n).join(', ')} | notes: ${(r.notes || []).join('; ')} | skipped: ${r.skipped.join('; ')}`); };
  for (const m of [{ c: 4, n: 'Human Knight', role: 'tank' }, { c: 45, n: 'Orc Raider', role: 'destroyer' }]) {
    const { r } = plan({ classId: m.c, role: m.role, worn: BOWKIT }); dump(m.n, r);
    const w = weaponBuy(r), ch = r.buys.find(p => p.slot === 'chest');
    check(!!w && w.info.t === 'BOW' && w.info.g === 'D', `${m.n} (${m.role}) lvl 20 with a Composite Bow: buys a D BOW -> ${w ? w.info.n + ' ' + w.offer.price : 'NOTHING (' + r.skipped.join('; ') + ')'}`);
    check(!!ch && ch.info.t === 'LIGHT', `${m.n}: light armor worn -> a LIGHT chest upgrade (${ch ? ch.info.n : 'none'})`);
    check(!r.skipped.some(s => /different weapon type|different armor type|no shield/.test(s)), `${m.n}: no "different weapon/armor type" / "no shield" blockers in the note (${r.skipped.join('; ') || 'none'})`);
    check((r.notes || []).some(t => /^weapon: kept the bow type you chose -> buying /.test(t)), `${m.n}: the decision is written plainly: "${(r.notes || []).find(t => /^weapon/.test(t)) || 'no weapon note'}"`);
    check(!ch || !ch.info.full || (r.notes || []).some(t => /^legs: covered by .+ \(full armor\)/.test(t)), `${m.n}: a full light armor covers the legs (no "legs kept")`);
  }
  // budget order: the weapon is bought before the jewelry (a short budget used to go to earrings first)
  { const { r } = plan({ classId: 4, role: 'tank', worn: BOWKIT, budget: 90000 }); const w = weaponBuy(r);
    check(!!w && w.info.t === 'BOW', `short budget (90k): the bow comes first (${w ? w.info.n : 'not bought: ' + r.skipped.join('; ')})`); }
  // nothing better of the own type: said plainly, never a blocker
  { const { r } = plan({ classId: 4, role: 'tank', worn: ['Common Item - Light Crossbow', 'Hard Leather Shirt'] }); dump('own type, best D bow worn', r);
    check(!weaponBuy(r) && (r.notes || []).some(t => /^weapon: kept the bow type you chose \(Common Item - Light Crossbow\); no better bow in the shops for grade D$/.test(t)), `best D bow already worn: "${(r.notes || []).join('; ')}"`); }
  // gear_prefs.json says otherwise: the class plan names a sword -> the sword is bought (explicit, the user's choice)
  { const prefs = { _class: { 4: { D: { weapon: { id: idOf('Elven Long Sword'), buy: 'auto' } } } } };
    const { r } = plan({ classId: 4, role: 'tank', worn: BOWKIT, prefs }); const w = weaponBuy(r); dump('class plan sword', r);
    check(!!w && w.info.t === 'SWORD', `gear_prefs.json class plan (Elven Long Sword) beats the worn bow type: ${w ? w.info.n : 'nothing'}`);
    check((r.notes || []).some(t => /^weapon: your gear plan \(gear_prefs\.json\) names .+ -> buying it instead of the bow$/.test(t)), `... and the note says so: "${(r.notes || []).find(t => /^weapon/.test(t)) || 'no weapon note'}"`); }
  // the role's _weapon rule in gear_prefs.json (destroyers: 2h sword) also beats the worn bow type
  { const prefs = { destroyer: { D: { _weapon: { type: 'SWORD', two: true } } } };
    const { r } = plan({ classId: 45, role: 'destroyer', worn: BOWKIT, prefs }); const w = weaponBuy(r);
    check(!!w && w.info.t === 'SWORD' && !!w.info.two, `gear_prefs.json _weapon rule (2h sword) beats the worn bow type: ${w ? w.info.n : 'nothing (' + r.skipped.join('; ') + ')'}`); }
  // unsold planned item -> the best SOLD item of that type: the No-Grade 2h sword (only the normal Zweihander 217,140; no Common one)
  { const { r } = plan({ classId: 44, level: 19, role: 'destroyer', worn: ['Training Gloves', "Squire's Shirt", "Squire's Pants"] }); const w = weaponBuy(r); dump('Orc Fighter 19', r);
    check(!!w && w.info.n === 'Zweihander' && w.offer.price === 217140, `Orc Fighter lvl 19 (destroyer) with Training Gloves: buys the sold normal Zweihander (${w ? w.info.n + ' ' + w.offer.price : 'nothing (' + r.skipped.join('; ') + ')'})`); }
  { const prefs = { _class: { 45: { D: { weapon: { id: idOf('Sword of Valakas (2-Handed)'), buy: 'auto' } } } } };
    const { r } = plan({ classId: 45, role: 'destroyer', worn: ['Training Gloves', "Squire's Shirt", "Squire's Pants"], prefs }); const w = weaponBuy(r);
    check(!!w && w.info.t === 'SWORD' && w.info.two && w.info.g === 'D' && r.skipped.some(s => /needs manual: Sword of Valakas/.test(s)), `class plan item never sold (Sword of Valakas): the best SOLD D 2h sword meanwhile (${w ? w.info.n : 'nothing'}) + "needs manual"`); }
  // a Common piece still wins over the normal-piece fallback (COMMON ONLY rule, user 2026-10-07)
  { const { r } = plan({ classId: 45, role: 'destroyer', worn: ['Training Gloves'] }); const w = weaponBuy(r);
    check(!!w && /^Common Item/.test(w.info.n), `D grade: still a Common weapon (${w ? w.info.n : 'nothing'})`); }
  // existing rules stay: an enchanted / S.A. weapon of the same grade is never replaced
  { const { r } = plan({ classId: 4, role: 'tank', worn: ['Long Bow'], enchant: { 'Long Bow': 3 } });
    check(!weaponBuy(r), `enchanted D Long Bow +3: never replaced by another D bow (${(weaponBuy(r) || {}).info ? weaponBuy(r).info.n : 'kept'})`); }
  { const { r } = plan({ classId: 4, role: 'tank', level: 45, worn: ['Crystallized Ice Bow - Guidance'], policy: { default: true, sameGradeSwap: true, keepArmorType: true } });
    check(!weaponBuy(r), `S.A. C bow at 45: never replaced by a C bow, also with sameGradeSwap (${weaponBuy(r) ? weaponBuy(r).info.n : 'kept'})`); }
  // ADENA SHORT (tester 2026-10-13: "a few bots only had 40k adena"): the reason in plain words
  { const { r } = plan({ classId: 45, role: 'destroyer', worn: BOWKIT, budget: 42369 - 300000 });
    check(!r.buys.length && /^needs 375,744 adena for Common Item - Light Crossbow \(75,744 \+ 300,000 kept for supplies\), has 42,369 — upgrade skipped \(all \d+ planned pieces: [\d,]+\)$/.test(r.why) && r.short && r.short.missing > 0,
      `YellowNine with 42,369 adena: "${r.why}" (missing ${r.short && r.short.missing})`); }
  { const { r } = plan({ classId: 45, role: 'destroyer', worn: BOWKIT, budget: 80000 });
    check(r.buys.some(p => p.slot === 'weapon') && (r.notes || []).some(t => /^adena: needs [\d,]+ more for .+ — those skipped$/.test(t)), `some bought, the rest skipped: "${(r.notes || []).find(t => /^adena/.test(t)) || 'no adena note'}"`); }
  // the gear upgrade message carries the decisions and the buy problems
  const gu2 = src.slice(src.indexOf('async function gearUpgrade('), src.indexOf('// --- DYES / SYMBOLS'));
  check(/plan\.notes/.test(gu2) && /not bought: /.test(gu2), 'gearUpgrade: the note says the decisions (plan.notes) and why a piece was NOT bought');
  const ecb = src.slice(src.indexOf('async function equipCommonFromBag('), src.indexOf('async function gearUpgrade('));
  check(/gearOwnTypes\(/.test(ecb) && /gearOwnOk\(/.test(ecb), 'equipCommonFromBag: a bought bow of the player\'s own type goes on from the bag too');
}
// ---- 4) the host part is wired into gearUpgrade ----
const gu = src.slice(src.indexOf('async function gearUpgrade('), src.indexOf('// --- DYES / SYMBOLS'));
check(/sgBefore\(\)/.test(gu) && /starterCleanup\(/.test(gu), 'gearUpgrade snapshots the worn starter pieces and cleans the replaced ones up after the buy');
const sc = src.slice(src.indexOf('function sellCandidates('), src.indexOf('// TOWN SELL'));
check(/sgKeepId\(/.test(sc), "starterGear 'keep': the junk sale leaves starter pieces alone too");
console.log(`\n${oks} ok, ${fails} failed`);
process.exit(fails ? 1 : 0);
