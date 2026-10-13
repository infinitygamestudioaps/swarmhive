// OFFLINE TEST of the GEAR GUARD (Mr.P feedback 2026-10-10: "spoiler had Saint Spear equipped, the script started buying C grade equipment
// (Full Plate, shield)"). Runs the GEARGUARD block of Scripts_dev/swarm.js in node + the dashboard API Dashboard/gearauto_api.js on a scratch file.
//   node docs/plan/tools/test_gear_guard.js   (exit 1 on a failure)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const ROOT = path.join(__dirname, '..', '..', '..');
const src = fs.readFileSync(process.env.SWARM_SRC || path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
const a = src.indexOf('// GEARGUARD-BEGIN'), b = src.indexOf('// GEARGUARD-END');
if (a < 0 || b < a) { console.error('GEARGUARD block not found'); process.exit(1); }
const M = new Function(src.slice(a, b) + '\nreturn { GEARGUARD, ggPolicy, ggCheck, ggWeaponFamily, ggTwoHanded, OWNTYPE: typeof OWNTYPE === "object" ? OWNTYPE : null, ggSameType: typeof ggSameType === "function" ? ggSameType : null, ggTypeWord: typeof ggTypeWord === "function" ? ggTypeWord : null, ammoFor: typeof ammoFor === "function" ? ammoFor : null };')();
let oks = 0, fails = 0;
const check = (ok, what) => { if (ok) oks++; else fails++; console.log((ok ? 'ok   ' : 'FAIL ') + what); };
const I = JSON.parse(fs.readFileSync(path.join(ROOT, 'Scripts', 'data', 'gear_items.json'), 'utf8')).items;
const find = (n) => { const k = Object.keys(I).find(x => I[x].n === n); if (!k) throw new Error('no item ' + n); return I[k]; };
const ON = { auto: true, lock: false, sameGradeSwap: false, keepArmorType: true }, LIVE = { auto: true, lock: false, sameGradeSwap: true, keepArmorType: false };
const spear = find('Saint Spear'), fullPlate = find('Full Plate Armor'), fpShield = find('Full Plate Shield');
const sword1 = Object.values(I).find(x => x.s === 'weapon' && x.t === 'SWORD' && !x.two && x.g === 'C'), blunt1 = Object.values(I).find(x => x.s === 'weapon' && x.t === 'BLUNT' && !x.two && x.g === 'B');
const bow = Object.values(I).find(x => x.s === 'weapon' && x.t === 'BOW' && x.g === 'D'), bowC = Object.values(I).find(x => x.s === 'weapon' && x.t === 'BOW' && x.g === 'C');
const duals = Object.values(I).find(x => x.s === 'weapon' && x.t === 'DUAL' && x.g === 'C'), twoH = Object.values(I).find(x => x.s === 'weapon' && x.t === 'SWORD' && x.two && x.g === 'B');
const lightD = Object.values(I).find(x => x.s === 'chest' && x.t === 'LIGHT' && x.g === 'D'), heavyD = Object.values(I).find(x => x.s === 'chest' && x.t === 'HEAVY' && x.g === 'D');
// ---- the Mr.P case: a spoiler with Saint Spear ----
check(/different weapon type/.test(M.ggCheck({ slot: 'weapon', cand: sword1, worn: [spear], policy: ON })), `Saint Spear (POLE) is never replaced by a sword: "${M.ggCheck({ slot: 'weapon', cand: sword1, worn: [spear], policy: ON })}"`);
check(/two-handed/.test(M.ggCheck({ slot: 'shield', cand: fpShield, worn: [], weapon: spear, policy: ON })), 'no shield next to a polearm');
check(/two-handed/.test(M.ggCheck({ slot: 'shield', cand: fpShield, worn: [], weapon: bow, policy: LIVE })) && /two-handed/.test(M.ggCheck({ slot: 'shield', cand: fpShield, worn: [], weapon: duals, policy: LIVE })) && /two-handed/.test(M.ggCheck({ slot: 'shield', cand: fpShield, worn: [], weapon: twoH, policy: LIVE })), 'no shield next to a bow / duals / a two-handed sword (also with the live policy: pure bug fix)');
check(M.ggCheck({ slot: 'shield', cand: fpShield, worn: [], weapon: sword1, policy: ON }) === '', 'a shield next to a one-handed sword is fine');
check(/different armor type/.test(M.ggCheck({ slot: 'chest', cand: fullPlate, worn: [lightD], policy: ON })), 'Full Plate (heavy) does not replace a light armor (keepArmorType)');
check(M.ggCheck({ slot: 'chest', cand: fullPlate, worn: [heavyD], policy: ON }) === '', 'Full Plate (C heavy) may replace a D heavy armor (higher grade, same type)');
check(M.ggCheck({ slot: 'chest', cand: fullPlate, worn: [lightD], policy: LIVE }) === '', 'the live policy (keepArmorType false) keeps today\'s armor picks');
// ---- weapon type rules ----
check(/different weapon type/.test(M.ggCheck({ slot: 'weapon', cand: sword1, worn: [bow], policy: LIVE })) && /different weapon type/.test(M.ggCheck({ slot: 'weapon', cand: sword1, worn: [duals], policy: LIVE })), 'bow -> sword, duals -> sword: never (all policies)');
check(M.ggCheck({ slot: 'weapon', cand: bowC, worn: [bow], policy: ON }) === '', 'bow D -> bow C: ok');
check(M.ggCheck({ slot: 'weapon', cand: blunt1, worn: [sword1], policy: ON }) === '', 'sword <-> blunt of the same hand count = one family (tank: 1h)');
check(/different weapon type/.test(M.ggCheck({ slot: 'weapon', cand: sword1, worn: [twoH], policy: LIVE })), '2h sword -> 1h sword: a different family');
check(M.ggCheck({ slot: 'weapon', cand: sword1, worn: [spear], policy: ON, explicit: true }) === '', "the user's own gear plan (explicit) may change the type");
check(M.ggWeaponFamily({ t: 'RAPIER' }) === 'MELEE1H' && M.ggWeaponFamily({ t: 'ANCIENTSWORD', two: 1 }) === 'MELEE2H', 'Kamael rapier / ancient sword = the Change Weapon sword families');
// ---- grades ----
check(/lower grade/.test(M.ggCheck({ slot: 'weapon', cand: bow, worn: [bowC], policy: LIVE })), 'never a lower grade (C -> D), also with the live policy');
check(/same grade/.test(M.ggCheck({ slot: 'weapon', cand: bowC, worn: [bowC], policy: ON })), 'same grade: kept for new users (sameGradeSwap false)');
check(M.ggCheck({ slot: 'weapon', cand: bowC, worn: [bowC], policy: LIVE }) === '', 'same grade allowed with the live policy (sameGradeSwap true = today)');
check(/lower grade/.test(M.ggCheck({ slot: 'weapon', cand: Object.assign({}, spear, { g: 'C' }), worn: [spear], policy: ON })), 'Saint Spear S is never replaced by a C spear');
check(M.ggCheck({ slot: 'ring', cand: { s: 'ring', g: 'D' }, worn: [{ s: 'ring', g: 'C' }], policy: ON }) === '', 'ring: one slot free -> fine');
check(/lower grade/.test(M.ggCheck({ slot: 'ring', cand: { s: 'ring', g: 'D' }, worn: [{ s: 'ring', g: 'C' }, { s: 'ring', g: 'B' }], policy: ON })), 'ring: both full -> judged against the weaker one (C): D is lower');
check(M.ggCheck({ slot: 'head', cand: { s: 'head', g: 'C' }, worn: [], policy: ON }) === '', 'an empty slot can always be filled');
// ---- OWNTYPE (public tester 2026-10-13, party Yellow: bows given by hand) ----
check(!!M.OWNTYPE && !!M.ggSameType && !!M.ggTypeWord && !!M.ammoFor, 'OWNTYPE block present (ggSameType, ggTypeWord, ammoFor)');
if (M.ammoFor) {
  const cbow = find('Composite Bow'), ldbow = find('Long Bow'), xbowD = Object.values(I).find(x => x.s === 'weapon' && x.t === 'CROSSBOW' && x.g === 'D');
  check(M.ggSameType('weapon', bow, cbow) && !M.ggSameType('weapon', sword1, cbow) && M.ggSameType('weapon', blunt1, sword1), 'same type: bow = bow, sword != bow, 1h sword = 1h blunt (one family)');
  check(!M.ggSameType('weapon', Object.assign({}, twoH, { mw: 1 }), twoH), 'same type: a magic 2h blunt is not a fighter 2h sword');
  check(M.ggSameType('chest', lightD, find('Hard Leather Shirt')) && !M.ggSameType('chest', heavyD, lightD), 'same type: light = light, heavy != light');
  check(M.ggTypeWord(cbow) === 'bow' && M.ggTypeWord(twoH) === 'two-handed sword' && M.ggTypeWord(lightD) === 'light armor' && M.ggTypeWord(spear) === 'polearm', `type words: ${[cbow, twoH, lightD, spear].map(M.ggTypeWord).join(', ')}`);
  check(M.ammoFor(cbow).id === 17 && M.ammoFor(ldbow).id === 1341 && M.ammoFor(bowC).id === 1342 && M.ammoFor({ t: 'BOW', g: 'S84' }).id === 1345, 'arrows by bow grade: NG Wooden 17, D Bone 1341, C Steel 1342, S84 Shining 1345');
  check(!xbowD || M.ammoFor(xbowD).id === 9633, `bolts for a D crossbow: Bone Bolt 9633 (${xbowD ? xbowD.n : 'no D crossbow in the table'})`);
  check(M.ammoFor(sword1) === null && M.ammoFor(null) === null, 'no ammunition for a sword / no weapon');
  // the ammunition the supply run buys must be on Helvetia's list (datapack buylist 3008100 = Giran grocer), dev install only
  const BL = path.join(ROOT, 'Scripts', 'data', 'dp', 'buylists', '3008100.xml');
  if (fs.existsSync(BL)) { const x = fs.readFileSync(BL, 'utf8'); check(M.OWNTYPE.helvetia.every(id => new RegExp(`id="${id}"`).test(x)) && !/id="1345"/.test(x), 'every arrow / bolt in OWNTYPE.helvetia is on Helvetia\'s buylist (Shining Arrow is not)'); }
  // a starter piece never holds its slot on "same grade" (a level-19 destroyer with Training Gloves never got the No-Grade Zweihander)
  const zwei = find('Zweihander'), tg = find('Training Gloves');
  check(M.ggCheck({ slot: 'weapon', cand: zwei, worn: [tg], policy: ON }) === '', `starter Training Gloves -> No-Grade Zweihander with sameGradeSwap false: "${M.ggCheck({ slot: 'weapon', cand: zwei, worn: [tg], policy: ON })}"`);
  check(/same grade/.test(M.ggCheck({ slot: 'weapon', cand: find('Forest Bow'), worn: [cbow], policy: ON })), 'a real No-Grade bow still holds on same grade (sameGradeSwap false)');
}
// supply: bows get arrows (static checks on the host code)
{
  const sw = src.slice(src.indexOf('function supplyWants('), src.indexOf('function deathPenaltyLevel('));
  check(/myAmmo\(\)/.test(sw) && /OWNTYPE\.helvetia\.includes/.test(sw) && /S\.arrows/.test(sw), 'supplyWants: arrows / bolts of the worn bow\'s grade (only what Helvetia sells)');
  check(/arrows: \d+, arrowsBelow: \d+/.test(src), 'CONFIG.lead.supply.arrows / arrowsBelow');
  const ho = src.slice(src.indexOf('// 3. hand out: one trade per member'), src.indexOf('// 3b. ENCHANTING'));
  check(/myAmmo\(\)/.test(ho) && /arrowsBelow/.test(ho), 'hand-out: the leader keeps his own arrows');
  const ul = src.slice(src.indexOf('function unloadItems('), src.indexOf('async function leadUnload('));
  check(/Arrow\|Bolt/.test(ul), 'unload: arrows / bolts are never given away as spare loot');
}
// ---- SHOPLIST (2026-10-13: "Common Item - Brigandine Helmet: not in Radia's list any more" x172 since the brain engine went live) ----
{
  const a2 = src.indexOf('// ==== SHOPLIST-PURE begin'), b2 = src.indexOf('// ==== SHOPLIST-PURE end');
  check(a2 > 0 && b2 > a2, 'SHOPLIST-PURE block present');
  if (a2 > 0 && b2 > a2) {
    const S = new Function(src.slice(a2, b2) + '\nreturn { slIsSellPart };')();
    const sc = JSON.parse(fs.readFileSync(path.join(ROOT, 'Scripts', 'data', 'shopscan_giran.json'), 'utf8'));
    const radiaCommon = []; (sc.shops || []).filter(s => s.npc === 'Radia').forEach(s => (s.lists || []).forEach(l => { if (/Common/i.test((l.path || []).join(' '))) (l.items || []).forEach(i => radiaCommon.push(i.id)); }));
    // a realistic level-20 bag (the sell-part dump of a live character: own items with sell prices)
    const SP = path.join(ROOT, 'Logs', 'shop_Spoiler5.txt');
    const sellIds = fs.existsSync(SP) ? fs.readFileSync(SP, 'utf8').split(/\r?\n/).slice(1).map(l => Number(l.split(' ')[0])).filter(x => x > 0) : [1831, 2010, 18, 1865, 728, 737, 2136, 1791, 1788, 3, 1061, 1835, 42, 1868];
    const bag = sellIds.concat([57, 12020, 12021]);                                  // + adena and two Common pieces
    check(S.slIsSellPart(sellIds, bag) === true, `the OnShopList list of a live character (${sellIds.length} rows, all from my bag) = the SELL part`);
    check(radiaCommon.length > 10 && S.slIsSellPart(radiaCommon, bag) === false, `Radia's Common Items list (${radiaCommon.length} ids) is a real buy list, also with 2 of its pieces in my bag`);
    check(S.slIsSellPart([736], [736]) === false && S.slIsSellPart([], [1, 2]) === false, 'tiny / empty lists are never called a sell part');
  }
  const bgp = src.slice(src.indexOf('async function buyGearPicks('), src.indexOf('function bagCount('));
  check(/slIsSellPart\(/.test(bgp) && /&& !sellPart\)/.test(bgp) && (bgp.match(/scanClick\(/g) || []).length >= 2, 'gear buys: my own bag is no "not in the list"; a page instead of the list is retried once');
  const osh = src.slice(src.indexOf('async function openShop('), src.indexOf('async function openShop(') + 3000);
  check(/listUnknown: true/.test(osh), 'openShop: a list that is my own bag -> listUnknown (buyAt buys anyway, bag-checked)');
  const AG2 = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'agent2.js'), 'utf8'), HJ = fs.readFileSync(path.join(ROOT, 'Dashboard', 'brain_host', 'host.js'), 'utf8');
  check(/function OnShopList\(shopId, list\) \{[^\n]*(items\(BuyList\)|buyRows\(\))[^\n]*ev\('OnShopList', \[num\(shopId\), items\(list\), b\]\)/.test(AG2) && /section\('buy'/.test(AG2), 'agent2.js: L2Swarm\'s real BuyList goes along with OnShopList + in the 1 s report');
  check(/OnShopList: \(a\) => \{ if \(Array\.isArray\(a\[2\]\) && a\[2\]\.length\) mirror\.buy = a\[2\]/.test(HJ), 'brain host: BuyList = the agent\'s real BuyList (old agents: as before)');
}
// ---- lock + policy ----
check(/locked/.test(M.ggCheck({ slot: 'head', cand: { s: 'head', g: 'S' }, worn: [], policy: Object.assign({}, ON, { lock: true }) })), 'locked: nothing at all');
const P0 = M.ggPolicy(null, 'X', 'P');
check(P0.auto === false && P0.sameGradeSwap === false && P0.keepArmorType === true, 'no gear_auto.json = auto upgrades OFF (new installs / imported accounts)');
const F = { default: true, parties: { P: { auto: false } }, chars: { Y: { auto: true }, Z: { lock: true } } };
check(M.ggPolicy(F, 'X', 'Q').auto === true && M.ggPolicy(F, 'X', 'P').auto === false && M.ggPolicy(F, 'Y', 'P').auto === true && M.ggPolicy(F, 'Z', 'Q').lock === true, 'character > party > file default');
const LIVEF = path.join(ROOT, 'Scripts', 'data', 'gear_auto.json'), HAS_LIVE = fs.existsSync(LIVEF);   // dev install only (never shipped)
const LIVE0 = HAS_LIVE ? fs.readFileSync(LIVEF, "utf8") : null;
const liveF = HAS_LIVE ? JSON.parse(fs.readFileSync(LIVEF, 'utf8')) : { default: true, sameGradeSwap: true };
if (HAS_LIVE && liveF.default === true) check(M.ggPolicy(liveF, 'Tank1', 'Tank1').auto === true && M.ggPolicy(liveF, 'Tank1', 'Tank1').sameGradeSwap === true, 'this install keeps today\'s behaviour (Scripts/data/gear_auto.json default true)');
const ex = JSON.parse(fs.readFileSync(path.join(ROOT, 'Scripts', 'data', 'gear_auto.example.json'), 'utf8'));
check(ex.default === false && ex.keepArmorType === true, 'the shipped example says OFF');
const RBF = path.join(__dirname, 'release_build.js');
if (fs.existsSync(RBF)) check(/DATA_EXCLUDE = new Set\(\[[^\]]*'gear_auto\.json'/.test(fs.readFileSync(RBF, 'utf8')), 'release_build.js never ships the live gear_auto.json');
// ---- the dashboard API on a scratch file ----
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'gearauto-')); process.env.SWARM_GEARAUTO_FILE = path.join(TMP, 'gear_auto.json');
const API = require(path.join(ROOT, 'Dashboard', 'gearauto_api.js'));
check(JSON.stringify(API.DEF) === JSON.stringify(M.GEARGUARD.defaults), 'dashboard defaults = swarm.js GEARGUARD.defaults');
[[null, 'A', 'B'], [F, 'X', 'Q'], [F, 'X', 'P'], [F, 'Y', 'P'], [F, 'Z', 'Q']].forEach(([f, n, p]) => { const x = API.policy(f, n, p), y = M.ggPolicy(f, n, p); check(x.auto === y.auto && x.lock === y.lock, `dashboard resolution = bot resolution (${n}/${p})`); });
const ctx = { DATA: TMP, ROOT };
const i0 = API.info(ctx); check(i0.exists === false && i0.default === false && (i0.parties.length >= 1 || !fs.existsSync(path.join(ROOT, "swarm.config.json"))), `GET: no file -> everyone OFF (${i0.parties.length} parties from swarm.config.json)`);
check(API.post(ctx, { scope: 'default', auto: true }).code === 400, 'turning ON needs confirm');
if (!i0.parties.length) console.log("skipped: party switch / lock API checks need a swarm.config.json with parties (your install)");
else {
const leader = i0.parties[0].leader, mem = i0.parties[0].members[1] || i0.parties[0].members[0];
check(API.post(ctx, { scope: 'party', name: leader, auto: true, confirm: true }).code === 200, 'party ON (confirmed)');
check(API.post(ctx, { scope: 'char', name: mem.name, lock: true }).code === 200 && API.post(ctx, { scope: 'char', name: 'NoSuchChar', auto: false }).code === 400, 'lock a character; unknown character -> 400');
const i1 = API.info(ctx), pm = i1.parties[0].members.find(m => m.name === mem.name);
check(i1.exists && pm.lock === true && i1.parties[0].auto === true, 'the file holds the party switch + the lock');
}
check(!fs.readdirSync(TMP).some(x => /\.tmp$/.test(x)), 'atomic write (no tmp left)');
check(!HAS_LIVE ? !fs.existsSync(LIVEF) : fs.readFileSync(LIVEF, "utf8") === LIVE0, 'the live gear_auto.json was not touched');
try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { }
console.log(`\n${oks} ok, ${fails} failed`);
process.exit(fails ? 1 : 0);
