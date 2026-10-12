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
  const inv = (o.worn || []).map(n => ({ Id: idOf(n), objId: ++oid, Count: 1, IsEquiped: true, EnchantLvl: 0, Name: n }));
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
// ---- 4) the host part is wired into gearUpgrade ----
const gu = src.slice(src.indexOf('async function gearUpgrade('), src.indexOf('// --- DYES / SYMBOLS'));
check(/sgBefore\(\)/.test(gu) && /starterCleanup\(/.test(gu), 'gearUpgrade snapshots the worn starter pieces and cleans the replaced ones up after the buy');
const sc = src.slice(src.indexOf('function sellCandidates('), src.indexOf('// TOWN SELL'));
check(/sgKeepId\(/.test(sc), "starterGear 'keep': the junk sale leaves starter pieces alone too");
console.log(`\n${oks} ok, ${fails} failed`);
process.exit(fails ? 1 : 0);
