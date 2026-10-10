// OFFLINE TEST of the GEAR GUARD (Mr.P feedback 2026-10-10: "spoiler had Saint Spear equipped, the script started buying C grade equipment
// (Full Plate, shield)"). Runs the GEARGUARD block of Scripts_dev/swarm.js in node + the dashboard API Dashboard/gearauto_api.js on a scratch file.
//   node docs/plan/tools/test_gear_guard.js   (exit 1 on a failure)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const ROOT = path.join(__dirname, '..', '..', '..');
const src = fs.readFileSync(process.env.SWARM_SRC || path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
const a = src.indexOf('// GEARGUARD-BEGIN'), b = src.indexOf('// GEARGUARD-END');
if (a < 0 || b < a) { console.error('GEARGUARD block not found'); process.exit(1); }
const M = new Function(src.slice(a, b) + '\nreturn { GEARGUARD, ggPolicy, ggCheck, ggWeaponFamily, ggTwoHanded };')();
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
if (fs.existsSync(RBF)) check(/'gear_auto\.json'\]\)/.test(fs.readFileSync(RBF, 'utf8')), 'release_build.js never ships the live gear_auto.json');
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
