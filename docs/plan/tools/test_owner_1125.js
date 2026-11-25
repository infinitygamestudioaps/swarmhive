// OFFLINE TEST: the owner's three fixes of 2026-11-25 ("fix these"):
//   WHHOFF      the automatic clan warehouse clean-up / default sale never runs for a worker on Hands off (dashboard + swarm.js)
//   WHSTOP      the owner's !stop ENDS a running clan warehouse sale (no pause-and-continue, no resume after a restart, no walk afterwards)
//   STANDGROUP  an AOE group (owner: "they all stand in on place and AOE all the monsters") helps only near the group and pulls a far member back
//   LOGINPARTY  whole parties log in as one block (leader first), every login at least the login gap apart (owner rule: 5 s)
// Never touches the game, MCP or live data (scratch files in os.tmpdir()).   node docs/plan/tools/test_owner_1125.js
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const rd = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const SRC = rd('Scripts_dev', 'swarm.js'), SRV = rd('Dashboard', 'server.js'), CTL = rd('docs', 'plan', 'tools', 'l2swarm_ctl.ps1');
let pass = 0, fails = 0;
const t = (name, ok, x) => { if (ok) { pass++; console.log('ok   ' + name); } else { fails++; console.log('FAIL ' + name + (x === undefined ? '' : ' ' + JSON.stringify(x).slice(0, 300))); } };
/** the source of a top-level function (up to its closing brace in column 0) */
const fn = (name) => { const i = SRC.search(new RegExp('^(async )?function ' + name + '\\(', 'm')); if (i < 0) throw new Error('no function ' + name); const j = SRC.indexOf('\n}', i); return SRC.slice(i, j + 2); };
const line = (start) => { const i = SRC.indexOf(start); if (i < 0) throw new Error('no line ' + start); return SRC.slice(i, SRC.indexOf('\n', i)); };

// ==== WHHOFF: the dashboard side (whauto_api.js) ===========================================================================================
const W = require(path.join(ROOT, 'Dashboard', 'whauto_api.js'));
t('WHHOFF: Hands off blocks the worker', W.handsOffBlock({ handsOff: { Crafter1: { on: true } } }, 'Crafter1') && W.handsOffBlock({ handsOff: { Crafter1: { on: true } } }, 'Crafter1').ok === false);
t('WHHOFF: no Hands off (or another character on it) lets it go on', W.handsOffBlock({ handsOff: { Crafter1: { on: false }, Destroyer3: { on: true } } }, 'Crafter1') === null && W.handsOffBlock({}, 'Crafter1') === null && W.handsOffBlock(null, 'Crafter1') === null);
// the real tick with a FULL clan warehouse (the 2026-11-22 case): no "!whsell order" while the worker is on Hands off, one without it
async function tickWith(handsOn) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'whhoff_')), DATA = path.join(tmp, 'data'), LOGS = path.join(tmp, 'logs');
  fs.mkdirSync(DATA); fs.mkdirSync(LOGS);
  const nowIso = new Date().toISOString();
  fs.writeFileSync(path.join(DATA, 'crafter.json'), JSON.stringify({ crafter: 'Crafter1' }));
  fs.writeFileSync(path.join(DATA, 'run_state.json'), JSON.stringify({ handsOff: { Crafter1: { on: handsOn } } }));
  fs.writeFileSync(path.join(LOGS, 'clan_state.json'), JSON.stringify({ warehouse: { seenAt: nowIso, items: [{ id: 1878, name: 'Braided Hemp', count: 40, enchant: 0 }] } }));
  fs.writeFileSync(path.join(LOGS, 'wh_full.json'), JSON.stringify({ clan: { full: true, at: nowIso } }));
  process.env.SWARM_WHAUTO_FILE = path.join(DATA, 'wh_auto.json'); process.env.SWARM_WHAUTO_STATE = path.join(LOGS, 'whauto_state.json'); process.env.SWARM_WHSELL_FILE = path.join(LOGS, 'whsell_order.json');
  fs.writeFileSync(process.env.SWARM_WHAUTO_FILE, JSON.stringify({ on: true, cleanup: true, items: { 1878: { act: 'sell', name: 'Braided Hemp' } } }));
  const sent = [];
  const ctx = { DATA, LOGS, readStates: () => [{ name: 'Crafter1', updated: nowIso, mode: 'idle', task: 'waiting for orders', x: 83480, y: 148552, dead: false }], commandRun: async (b) => { sent.push(b.cmd); return { ok: true }; } };
  const r = await W.tick(ctx, true);
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { }
  return { sent, r };
}

// ==== WHHOFF + WHSTOP: the swarm.js side =================================================================================================
const ws = fn('whSell');
t('WHHOFF: swarm.js refuses an order the automatic clean-up / default sale wrote while I am on Hands off', /if \(\/\^whauto\/i\.test\(WHS_BY\.v\) && handsOffMe\(\)\) \{[^\n]*return; \}/.test(ws));
t('WHHOFF: ... and checks it before the order is marked done (it is not used up)', ws.indexOf('handsOffMe()') < ws.indexOf('o.done = new Date()'));
{ const i = SRC.indexOf('setTimeout(function whsResumeCheck()'), body = SRC.slice(i, SRC.indexOf('}, 45000);', i));
  t('WHHOFF: an unfinished sale is never resumed after a restart while I am on Hands off', /if \(handsOffMe\(\)\) \{[^\n]*NOT resumed: I am on Hands off[^\n]*return; \}/.test(body) && body.indexOf('handsOffMe()') < body.indexOf('whSellLoop(items')); }
const whsStopped = new Function(fn('whsStopped') + '\nreturn whsStopped;')();
t('WHSTOP: a !stop since the start is seen, none is not', whsStopped(3, 4) === true && whsStopped(3, 3) === false && whsStopped(undefined, 0) === false && whsStopped(0, 1) === true);
// whsYield with the real code: a !stop ends it at once - also while it waits for another task (it never says "my turn again")
async function yieldRun(stopAfterMs, interruptedNow) {
  const notes = [], st = { stopGen: 5, running: true }, ctl = { owner: interruptedNow ? '!stop' : '' };
  let clock = 0;
  const f = new Function('state', 'interrupted', 'control', 'note', 'setTask', 'sleep', 'takeControl', 'now', 'Me', 'whsStopped',
    line('const WHS_STOPWHY') + '\n' + fn('whsYield') + '\nreturn whsYield;')(st, () => interruptedNow, ctl, (m) => notes.push(m), () => { }, async (ms) => { clock += ms; if (stopAfterMs !== null && clock >= stopAfterMs) st.stopGen = 6; }, () => 99, () => clock, { IsDead: false }, whsStopped);
  if (stopAfterMs === 0) st.stopGen = 6;
  const g = await f(7, '!whsell', 5);
  return { g, notes, clock };
}
// ==== STANDGROUP ===========================================================================================================================
const pureI = SRC.indexOf('// STANDGROUP-PURE-BEGIN'), pureJ = SRC.indexOf('// STANDGROUP-PURE-END');
const SG = new Function(SRC.slice(pureI, pureJ) + '\nreturn { standGroupWant, STANDG_CFG };')();
t('STANDGROUP: the owner set up an AOE team for my leader = stand together', SG.standGroupWant({ aoeTeam: true }) === true);
// owner 2026-11-25 "Begræns AOE-reglen": only a party with an AOE team stands together - a polearm alone (the testers' Titans) keeps the normal help rule
t('STANDGROUP: a polearm alone does NOT make a group stand (testers keep their normal help rule)', SG.standGroupWant({ myPole: true }) === false && !/myPole: myWeaponType\(\)/.test(SRC));
t('STANDGROUP: neither = the normal help rule', SG.standGroupWant({}) === false);
t('STANDGROUP: never a healer, a puller on an active route, a raid or an instance', [{ healer: true }, { puller: true }, { raid: true }, { inst: true }].every(x => SG.standGroupWant(Object.assign({ aoeTeam: true, myPole: true }, x)) === false));
const tightHelpOk = new Function('num', 'TIGHT', fn('tightHelpOk') + '\nreturn tightHelpOk;')(Number, { helpRange: 600 });
const G = { x: 88568, y: 112504 };
t('STANDGROUP: the 2026-11-22 leech case - a monster 549 from Destroyer3 is NOT helped (the caster ball would)', tightHelpOk({ x: G.x + 549, y: G.y }, G, SG.STANDG_CFG) === false && tightHelpOk({ x: G.x + 549, y: G.y }, G) === true);
t('STANDGROUP: a monster at the group (350) is helped', tightHelpOk({ x: G.x + 350, y: G.y }, G, SG.STANDG_CFG) === true);
{ const i = SRC.indexOf("App.on('swarm.attacked'"), h = SRC.slice(i, SRC.indexOf("intent('help'", i));
  t('STANDGROUP: the help rule uses the AOE group (help distance + the 400 near the leader)', /standH = !tightB && standGroup\(\)/.test(h) && /tightH = tightB \|\| standH/.test(h) && /tightHelpOk\(\{ x: mob\.X, y: mob\.Y \}, \{ x: lp\.X, y: lp\.Y \}, standH \? STANDG_CFG : undefined\)/.test(h)); }
{ const i = SRC.indexOf('const stuckFollow = {'), f = SRC.slice(i, SRC.indexOf('}, 5000);', i));
  t('STANDGROUP: a member fighting far out is pulled back (tightFar knows the AOE group)', /if \(!tightGroup\(\) && !standGroup\(\)\) return false;/.test(f));
  t('STANDGROUP: it comes back from > 1350, never from 350 (the walk goes to within 900: from 350-900 it would count as stuck and end in .town)', /d < \(tight \? TIGHT\.follow : stand \? TIGHT\.zone \* 1\.5 :/.test(f) && TIGHTZONE() * 1.5 > 900 + 100);
  t('STANDGROUP: out of the far fight first, then the walk back', /if \(\(tight \|\| stand\) && \(Me\.IsAttacking \|\| IsInCombat\)\) \{ try \{ stopCombatG\(\);/.test(f) && /if \(!\(tight \|\| stand\) \|\| d < TIGHT\.zone\)/.test(f)); }
function TIGHTZONE() { const m = SRC.match(/const TIGHT = \{[^\n]*zone: (\d+)/); return m ? Number(m[1]) : 0; }
t('STANDGROUP: the AOE team file is read for my leader, on or off', /team = !!\(\(j\.teams \|\| \{\}\)\[CONFIG\.leader\]\)/.test(fn('standGroup')));

// ==== BUFFPAID (owner 2026-11-25: "some are NOT selling for 10 adena BUT 10 million ADENA! So we are gettin ripped off") ===================
{ const i = SRC.indexOf('// PRICEREAD-PURE-BEGIN'), j = SRC.indexOf('// PRICEREAD-PURE-END');
  const P = new Function(SRC.slice(i, j) + '\nreturn { storePaidCheck, storeBarred, storePriceOf };')();
  t('BUFFPAID: 10 a paid with a 5000 limit = fine', P.storePaidCheck(10, 5000, 1).bad === false);
  t('BUFFPAID: 10,000,000 paid = a cheating store', P.storePaidCheck(10000000, 5000, 1).bad === true);
  t('BUFFPAID: Party mode allows the limit per character (9 x 5000), not more', P.storePaidCheck(45000, 5000, 9).bad === false && P.storePaidCheck(45001, 5000, 9).bad === true);
  t('BUFFPAID: a barred seller stays barred 30 days, then may be tried again', P.storeBarred({ omgWC: { at: '2026-11-25T08:00:00Z' } }, 'omgWC', Date.parse('2026-12-20T08:00:00Z')) && !P.storeBarred({ omgWC: { at: '2026-11-25T08:00:00Z' } }, 'omgWC', Date.parse('2026-12-26T08:00:00Z')) && !P.storeBarred({}, 'Tullock', Date.now()));
  t('BUFFPAID: the 10m page price is still read and refused before any click', P.storePriceOf('Price: 10,000,000') === 10000000 && P.storePriceOf('Price: 10kk') === 10000000 && P.storePriceOf('Price: 10m') === 10000000);
  const f = fn('storeBuyBuff');
  t('BUFFPAID: adena counted right before the click, measured after the buff came', /adena0 = itemCount\(57\); DLG\.click\(/.test(f) && /const paid = Math\.max\(0, adena0 - itemCount\(57\)\)/.test(f) && f.indexOf('const paid') > f.indexOf('storeBuffLeft(skillId) <= left'));
  t('BUFFPAID: an overcharge bars the seller, is logged + said in party chat, and is no success', /if \(pc\.bad\) \{\s*storeBadAdd\(sl\.Name,[\s\S]*?SayToParty\([\s\S]*?return \{ ok: false, why: m \};/.test(f));
  t('BUFFPAID: barred sellers are skipped before their page is opened', f.indexOf('storeBarred(barred, sl.Name') > -1 && f.indexOf('storeBarred(barred, sl.Name') < f.indexOf('DLG.open(sl'));
  t('BUFFPAID: every buy line says what was really paid', /paid \$\{paid\} a, \$\{Math\.round\(now2 \/ 3600\)\} h/.test(f));
  // STORESOLO (Vykaax 2026-11-22 20:58: a solo character pressed "Party" -> "You don't have a party") + Vykaax 2026-11-23 13:10 "Price: 1kk"
  const M = new Function(SRC.slice(i, j) + '\nreturn storeModeFor;')();
  t('STORESOLO: nobody else in my party = buy for me (no Party button)', M('Party', 0) === null && M('Party', undefined) === null);
  t('STORESOLO: with party members it stays Party; a Player buy stays Player', M('Party', 3) === 'Party' && M(null, 0) === null && M('Player', 0) === 'Player');
  t('STORESOLO: the mode is decided before anything is clicked; the paid limit counts the real party', /const others = storePartyOthers\(\); mode = storeModeFor\(mode, others\);/.test(f) && f.indexOf('storeModeFor(mode') < f.indexOf('DLG.open(sl') && /forN = mode && \/party\/i\.test\(mode\) \? 1 \+ others : 1/.test(f));
  t('PRICEREAD: "Price: 1kk" (Vykaax\'s store page) = 1,000,000 = refused with the 5000 max', P.storePriceOf('<font color="LEVEL">Price: 1kk</font>') === 1000000 && P.storePriceOf('Price:1kk') === 1000000); }

// ==== AUTODEATH (owner 2026-11-25: "Ja, lav rettelsen til Nuker19"; 7 deaths in escapes at a hive-picked spot, none counted) ==========
{ const w = SRC.slice(SRC.indexOf('// AUTODEATH watcher'), SRC.indexOf('}, 1000);', SRC.indexOf('// AUTODEATH watcher')));
  t('AUTODEATH: a 1 s watcher counts every death of the leader / a solo character while leveling has a spot (also in an escape)', /const d = !!Me\.IsDead;/.test(w) && /if \(d && !DEATHCNT\.wasDead && deathSpotPick\(autoLvl\.spot, autoLvl\.lastSpot, autoLvl\.lastSpotAt, now\(\)\) && \(autoLvl\.active \|\| autoLvl\.solo \|\| now\(\) - \(autoLvl\.lastSpotAt \|\| 0\) < 600000\) && \(autoLvl\.solo \|\| isLeader\(\) \|\| soloChar\(\)\)\) \{ autoDeathCount/.test(w));
  // DEATHSPOT2 (Nuker19 13:16: killed on the 13 km walk from the landing to the picked spot - not counted)
  t('DEATHSPOT2: the spot is remembered the moment it is picked, before the walk there', /note\(`autolevel: spot \$\{spot\.name\} \(lvl \$\{spot\.levelMin\}-\$\{spot\.levelMax\}\)`, !solo\);\s*autoLvl\.lastSpot = spot; autoLvl\.lastSpotAt = now\(\);[^\n]*\n\s*if \(!\(await travelToSpot\(spot\)\)\)/.test(SRC));
  const f = fn('autoDeathCount');
  t('AUTODEATH: one death is counted once (loop + watcher)', /if \(now\(\) - \(DEATHCNT\.countedAt \|\| 0\) < 60000\) return;[^\n]*\n\s*DEATHCNT\.countedAt = now\(\);/.test(f));
  t('AUTODEATH: the autolevel loop uses the same count (no second copy of the rule)', /note\('autolevel: dead', !solo\);\s*autoDeathCount\(solo\);/.test(SRC) && (SRC.match(/spotDeathsTooMany\(D\[k\]/g) || []).length === 1);
  t('AUTODEATH: a chosen spot keeps DEATHSTOP (3 / 1 h, banner); a solo character keeps the 24 h solo area rule', /deathStopWrite\(DEATHSTOP\.hold/.test(f) && /if \(soloNow\) \{ soloDeathLearn\(\);/.test(f));
  t('AUTODEATH: a solo character at a hive-picked ZONE spot also gets the 2 / 30 min -> 24 h rule (Nuker19: Fields of Massacre is no field area)', /if \(soloNow\) \{ soloDeathLearn\(\); if \(!\(sp && !sp\.manual\)\) \{[^\n]*return; \} \}/.test(f) && f.indexOf('soloDeathLearn()') < f.indexOf('autoSpotDeathsTooMany(D[k]'));
  // DEATHSPOT (owner 2026-11-25: "Aquiline keeps dying?" - 12:49 + 12:57 in escapes, not counted: the escape had cleared autoLvl.spot)
  const pick = new Function(SRC.slice(SRC.indexOf('// DPCOV-PURE-BEGIN'), SRC.indexOf('// DPCOV-PURE-END')) + '\nreturn deathSpotPick;')();
  t('DEATHSPOT: no current spot (cleared by an escape) = the spot hunted < 10 min ago; older or none = no spot', pick(null, { name: 'A' }, 1000, 1000 + 60000).name === 'A' && pick(null, { name: 'A' }, 1000, 1000 + 11 * 60000) === null && pick({ name: 'B' }, { name: 'A' }, 1000, 2000).name === 'B');
  t('DEATHSPOT: the hunting loop remembers the spot it really hunts', /if \(autoLvl\.spot\) \{ autoLvl\.lastSpot = autoLvl\.spot; autoLvl\.lastSpotAt = now\(\); \}/.test(SRC));
  // the REAL count function, run through Nuker19's case: solo, spot cleared by the escape, deaths 12:49:48 + 12:57:07
  { let clock = Date.parse('2026-11-25T11:49:48Z'); const notes = [];
    const AL = { spot: null, lastSpot: { name: 'Cemetery / The Forbidden Gateway — Seal of Shilen (Lv54-55)' }, lastSpotAt: clock - 30000, bad: {}, spotDeaths: {} };
    const C = { countedAt: 0 };
    const run = new Function('now', 'DEATHCNT', 'soloChar', 'soloDeathLearn', 'autoLvl', 'writeClaim', 'spotKeyOf', 'note', 'intent', 'dungeonLog', 'SayToParty', 'DEATHSTOP', 'orderState', 'deathStopWrite', 'partySpotSig', 'partySpotEntry',
      SRC.slice(SRC.indexOf('// DPCOV-PURE-BEGIN'), SRC.indexOf('// DPCOV-PURE-END')) + '\n' + f + '\nreturn autoDeathCount;')(
      () => clock, C, () => true, () => { }, AL, () => { }, (s) => s.name, (m) => notes.push(m), () => { }, () => { }, () => { }, { hold: null }, { seq: 0 }, () => { }, () => '', () => null);
    run(true); const after1 = Object.keys(AL.bad).length;
    clock += 7 * 60000 + 19000; AL.lastSpotAt = clock - 60000; run(true);
    t('DEATHSPOT: Nuker19\'s two escape deaths 7 min apart now skip the spot for 24 h (ran the real autoDeathCount)', after1 === 0 && AL.bad['Cemetery / The Forbidden Gateway — Seal of Shilen (Lv54-55)'] === clock + 24 * 3600000 && notes.some(n => /2 deaths within 30 min .* skipped for 24 h/.test(n)), { bad: AL.bad, notes }); } }

// ==== DEATHKEEP (owner 2026-11-25: "Spoiler11 keeps dying" - the death counts were lost at every script restart / deploy) ====================
{ const i = SRC.indexOf('function deathKeepTrim('), body = SRC.slice(i, SRC.indexOf('\n', i));
  const trim = new Function(body + '\nreturn deathKeepTrim;')(), T = Date.parse('2026-11-25T11:24:43Z');
  const r = trim({ 'manual:room:devils_isle_caves-1-43': [T - 17 * 60000, T - 15 * 60000, T - 75 * 60000, 'x'], old: [T - 2 * 3600000] }, T);
  t('DEATHKEEP: only the last hour is kept per spot, an empty spot is dropped', JSON.stringify(r) === JSON.stringify({ 'manual:room:devils_isle_caves-1-43': [T - 17 * 60000, T - 15 * 60000] }), r);
  t('DEATHKEEP: saved after every counted death (loop + watcher), read back at the start and merged', /autoDeathCount\(solo\); deathKeepSave\(\);/.test(SRC) && /\{ autoDeathCount\(!!autoLvl\.solo\); deathKeepSave\(\); \}/.test(SRC) && /setTimeout\(\(\) => \{ try \{ if \(!File\.Exists\(DEATHKEEP_F\(\)\)\) return;[^\n]*D\[k\] = \[\.\.\.new Set\(\(D\[k\] \|\| \[\]\)\.concat\(j\[k\]\)\)\]/.test(SRC));
  t('DEATHKEEP: Spoiler11\'s case - 2 deaths saved before a restart + 1 after = 3 within an hour = DEATHSTOP', SG && new Function(SRC.slice(SRC.indexOf('// DPCOV-PURE-BEGIN'), SRC.indexOf('// DPCOV-PURE-END')) + '\nreturn spotDeathsTooMany;')()(trim({ k: [T - 17 * 60000, T - 15 * 60000] }, T).k.concat([T]), T) === true); }

// ==== SEEHIT3 (owner 2026-11-25: "Ja, lav undtagelsen til væg-reglen"; Spoiler11: 139 refusals while a Death Flyer hit him) =================
{ const seeHitMe = new Function(fn('seeHitMe') + '\nreturn seeHitMe;')();
  const T = 1e12, cs = fn('canSee');
  const mk = (hitme, last) => new Function('Me', 'num', 'now', 'lastAttackerOnMe', 'HITME', 'seeHitMe', 'GeoSight', 'SEE', 'SEE_FAR', 'SEE_BUDGET', cs + '\nreturn canSee;')(
    { X: 45352, Y: 217448, Z: -3865 }, Number, () => T, last, hitme, seeHitMe, () => false /* the map says: wall */, { c: {}, sec: 0, n: 0, over: 0, cn: 0 }, 5000, 100);
  const flyer = { objId: 777, X: 45352 + 300, Y: 217448, Z: -3855 }, other = { objId: 888, X: 45352 + 300, Y: 217448, Z: -3855 };
  t('SEEHIT3: a monster that hit ME 2 s ago is in sight although the slot says "for Healer11" (Spoiler11\'s case)', mk({ 777: T - 2000 }, { id: 999, at: T - 1000, for: 'Healer11' })(flyer) === true);
  t('SEEHIT3: the wall still holds for a monster that did NOT hit me (owner: walls block everything)', mk({ 777: T - 2000 }, { id: 999, at: T - 1000, for: 'Healer11' })(other) === false);
  t('SEEHIT3: a hit older than 5 s, or farther than bow range (1200), does not count', mk({ 777: T - 6000 }, {})(flyer) === false && mk({ 777: T - 1000 }, {})(Object.assign({}, flyer, { X: 45352 + 1300 })) === false);
  t('SEEHIT3: every hit on me is written to HITME, helping a teammate never touches it', /lastAttackerOnMe = \{ id: atkId, at: now\(\) \}; reportAttacked\(atkId\);\s*try \{ HITME\[num\(atkId\)\] = now\(\); \}/.test(SRC) && !/HITME\[[^\]]*\] = now\(\)/.test(SRC.slice(SRC.indexOf("App.on('swarm.attacked'"), SRC.indexOf("App.on('swarm.attacked'") + 6000))); }

// ==== SOLOTOP (owner 2026-11-25: "Ja, lav solo-reglen"; Nuker19 lvl 60 alone got Fields of Massacre + Valley of Saints, both Lv60-65) =====
{ const fit = new Function(fn('soloTopFits') + '\nreturn soloTopFits;')();
  t('SOLOTOP: lvl 60 alone never takes a 60-65 spot (Fields of Massacre, Valley of Saints)', fit(65, 60) === false);
  t('SOLOTOP: lvl 60 alone may take 54-55 or 58-60; a spot without a top level is not filtered', fit(55, 60) === true && fit(60, 60) === true && fit(undefined, 60) === true);
  const p = fn('pickSpot');
  t('SOLOTOP: every automatic source is filtered for a solo character: our zones, other parties\' zones, field areas, datapack spots', /ssSpotOk\(z\) && soloTopOk\(z\.levelMax\)\);/.test(p) && /level <= z\.levelMax && soloTopOk\(z\.levelMax\)/.test(p) && /if \(fa && !soloTopOk\(fa\.levelMax\)\)/.test(p) && /!soloTopOk\(s\.levelMax\) \|\| \(solo && s\.dungeon\)/.test(p));
  t('SOLOTOP: only solo characters, by their REAL level; your dashboard choice / a forced spot come first and are never filtered', /const realLevel = num\(level\);/.test(p) && /const soloTopOk = \(top\) => !soloLow \|\| soloTopFits\(top, realLevel\);/.test(p) && p.indexOf('manualSpot(level, solo)') < p.indexOf('const zones = customZones()')); }

// ==== SOLOWALK (owner 2026-11-25: "Ja, lav 4 km-reglen"; Nuker19 killed 4.3k into the 13.4k walk from the Seal of Shilen landing) ========
{ const i = SRC.indexOf('const FA_WALK_MARGIN'), j = SRC.indexOf('\n', SRC.indexOf('function soloWalkLimit'));
  const L = new Function(SRC.slice(i, j) + '\n' + fn('spotLandingWhy') + '\nreturn { soloWalkLimit, spotLandingWhy };')();
  const land = { x: 184785, y: 19833 }, far = { name: 'Seal of Shilen spot', center: { x: 171429, y: 19190 }, gk: { desc: 'Aden -> Seal of Shilen' } }, near = { name: 'near', center: { x: 182000, y: 19833 }, gk: far.gk };
  t('SOLOWALK: Nuker19\'s 13.4k walk from the landing is refused before the teleport', /^REFUSED: /.test(L.spotLandingWhy(far, land, L.soloWalkLimit(25000, true, false))));
  t('SOLOWALK: a spot 2.8k from the landing is fine for a solo character', L.spotLandingWhy(near, land, L.soloWalkLimit(25000, true, false)) === '');
  t('SOLOWALK: parties keep the normal 25k; your own choice is never limited', L.spotLandingWhy(far, land, L.soloWalkLimit(25000, false, false)) === '' && L.soloWalkLimit(25000, true, true) === 25000);
  t('SOLOWALK: the trip uses it before any teleport', /const why = spotLandingWhy\(spot, land, soloWalkLimit\(CONFIG\.travel\.maxWalk, soloChar\(\), !!spot\.manual\)\);\s*if \(why\) \{ gkFail = why;/.test(SRC)); }

// ==== HEALREACH (owner 2026-11-25: "Looks like the healer is behind a wall. so healer needs to be closer to the figther") ================
{ const i = SRC.indexOf('// HEALREACH-PURE-BEGIN'), j = SRC.indexOf('// HEALREACH-PURE-END');
  const H = new Function(SRC.slice(i, j) + '\nreturn { HEALREACH, healReachPick };')();
  const me = { x: 45736, y: 217800 };
  t('HEALREACH: Spoiler11 at 6 % behind the rock (not seen, 900 away) = Healer11 walks to him', (H.healReachPick(me, [{ name: 'Spoiler11', x: 44984, y: 218184, hp: 6, seen: false }]) || {}).name === 'Spoiler11');
  t('HEALREACH: a hurt teammate she can see = no walk (she heals from where she stands)', H.healReachPick(me, [{ name: 'Spoiler11', x: 44984, y: 218184, hp: 6, seen: true }]) === null);
  t('HEALREACH: healthy (>= 70 %), dead, or farther than 2500 = no walk', H.healReachPick(me, [{ name: 'A', x: me.x + 100, y: me.y, hp: 80, seen: false }, { name: 'B', x: me.x + 100, y: me.y, hp: 0, seen: false }, { name: 'C', x: me.x + 3000, y: me.y, hp: 10, seen: false }]) === null);
  t('HEALREACH: two hurt ones out of sight = the most hurt first', H.healReachPick(me, [{ name: 'A', x: me.x + 500, y: me.y, hp: 50, seen: false }, { name: 'B', x: me.x + 800, y: me.y, hp: 20, seen: false }]).name === 'B');
  const w = SRC.slice(SRC.indexOf('const HEALRCH = {'), SRC.indexOf('let lastHealPot = 0;'));
  t('HEALREACH: only healers, never in town / raid / instance / hands off / escape / trade, under the control slot, walk to within 250', /!isHealerRole\(\)/.test(w) && /handsOffMe\(\) \|\| currentTownKey\(\) \|\| inRaid\(\) \|\| inst\.on \|\| state\.escaping/.test(w) && /takeControl\('heal: reach '/.test(w) && /walkTo\(t\.x, t\.y, t\.z, HEALREACH\.near, 15000\)/.test(w) && /releaseControl\('heal: reach '/.test(w)); }

// ==== HEALFOLLOW (owner 2026-11-25: "Healer needs to follow the tanks ASS ... cant heal through a wall") ==================================
{ const i = SRC.indexOf('// HEALREACH-PURE-BEGIN'), j = SRC.indexOf('// HEALREACH-PURE-END');
  const H = new Function(SRC.slice(i, j) + '\nreturn { HEALFOLLOW, healFollowDue };')();
  t('HEALFOLLOW: more than 400 from the leader for 3 s = walk up behind him', H.healFollowDue(450, true, 3000) === true && H.healFollowDue(450, true, 2000) === false);
  t('HEALFOLLOW: out of sight (behind the rock) and more than 150 away = walk up, even when close in a straight line', H.healFollowDue(200, false, 3000) === true);
  t('HEALFOLLOW: in sight and within 400 = stay (no walking in circles)', H.healFollowDue(300, true, 10000) === false && H.healFollowDue(120, false, 10000) === false);
  const w = SRC.slice(SRC.indexOf('const HEALFOL = {'), SRC.indexOf('const HEALRCH = {'));
  t('HEALFOLLOW: only healer members, also in a fight and in "Fight with L2Swarm" mode (no swarmFightNow / combat skip), never town / raid / instance / hands off / escape', /!isHealerRole\(\) \|\| isLeader\(\)/.test(w) && !/swarmFightNow|IsInCombat/.test(w) && /handsOffMe\(\) \|\| currentTownKey\(\) \|\| inRaid\(\) \|\| inst\.on \|\| state\.escaping/.test(w) && /walkTo\(num\(p\.X\), num\(p\.Y\), lz, HEALFOLLOW\.near, 10000\)/.test(w)); }
// ==== ESCDRY (owner 2026-11-25: escape never into water - "Yes please"; the screenshot: "escape: out of aggro range" straight into the sea) ====
{ const i = SRC.indexOf('// ESCDRY-PURE-BEGIN'), j = SRC.indexOf('// ESCDRY-PURE-END');
  const E = new Function(SRC.slice(i, j) + '\nreturn { ESCDRY, lineNearSpot, escDryPoint };')();
  const me = { x: 44984, y: 217368 }, water = [{ x: 45200, y: 217900 }], south = Math.atan2(217900 - me.y, 45200 - me.x);
  t('ESCDRY: Spoiler11\'s straight run south passes the water he drowned in', E.lineNearSpot(me, { x: me.x + Math.cos(south) * 1200, y: me.y + Math.sin(south) * 1200 }, water, E.ESCDRY.r) === true);
  const p = E.escDryPoint(me, south, 1200, water, E.ESCDRY.r);
  t('ESCDRY: the escape takes another direction whose line stays clear of it', !!p && !E.lineNearSpot(me, p, water, E.ESCDRY.r));
  t('ESCDRY: no water known = the preferred direction, unchanged', JSON.stringify(E.escDryPoint(me, 0, 1200, [], 350)) === JSON.stringify({ x: me.x + 1200, y: me.y }));
  t('ESCDRY: water all around = no straight run at all', E.escDryPoint(me, 0, 1200, [0, 1, 2, 3, 4, 5, 6, 7].map(k => ({ x: me.x + Math.cos(k * Math.PI / 4) * 600, y: me.y + Math.sin(k * Math.PI / 4) * 600 })), 350) === null);
  const plan = fn('escFleePlan');
  t('ESCDRY: drowning spots are dangers for the map search, and both straight fallbacks go through escDryPoint', /dry\.forEach\(s => dangers\.push\(\{ x: s\.x, y: s\.y, r: ESCDRY\.r \}\)\)/.test(plan) && /if \(!lineNearSpot\(mp, sp, dry, ESCDRY\.r\)\) return mk\('safeSpot\(\)'/.test(plan) && /const p = escDryPoint\(mp, a, 1200, dry, ESCDRY\.r\);/.test(plan));
  t('ESCDRY: every #297 "unable to breathe" (not a planned swim) is remembered', /state\.drownAt = now\(\); try \{ drownSpotAdd\(Me\.X, Me\.Y, Me\.Z\); \}/.test(SRC)); }

// ==== WALLASIDE (owner 2026-11-25: "Ja, lav det"; Spoiler11: 326 wall refusals in 7 min, 4 kills - each archer behind a rock set aside 10 s) ====
{ const i = SRC.indexOf('// UNREACHLOOP-PURE-BEGIN'), j = SRC.indexOf('// UNREACHLOOP-PURE-END');
  const W = new Function(SRC.slice(i, j) + '\nreturn huntWallAsideMs;')();
  t('WALLASIDE: behind a wall 1st time 10 s, 2nd time 2 min, then 10 min', W(1) === 10000 && W(2) === 120000 && W(3) === 600000 && W(7) === 600000);
  t('WALLASIDE: both refusals (the hunt\'s engage + srvAttack) count it, the walk round the wall (WALLWALK) stays', /if \(!canSee\(t\)\) \{ huntWallAside\(t\.objId\); return wallRefused\('attacking', t\); \}/.test(SRC) && /wallRefused\('attacking', m\); huntWallAside\(o\); if \(roomTargetDecide/.test(SRC) && /huntBlack\[id\] = now\(\) \+ huntWallAsideMs\(huntWallN\[id\]\)/.test(SRC)); }

// ==== DEPLOYFIGHT (owner 2026-11-25: "Ja, ret deploy-scriptet"; the 15:16:32 deploy reloaded Spoiler11 mid-fight at 65 % HP, dead 17 s later) ====
function psFight() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'depfight_')), cf = path.join(tmp, 'c.json');
  fs.writeFileSync(cf, JSON.stringify([{ name: 'Spoiler11', hp: 65, combat: true, dead: false }, { name: 'Full', hp: 100, combat: true, dead: false }, { name: 'Town', hp: 40, combat: false, dead: false },
    { name: 'Dead', hp: 0, combat: true, dead: true }, { name: 'Edge', hp: 70, combat: true, dead: false }]));
  const ps = `. '${path.join(__dirname, 'deploy_fight.ps1')}'; $c = Get-Content '${cf}' -Raw | ConvertFrom-Json; ($c | ForEach-Object { $_.name + '=' + (DeployFightWhy $_) }) -join ';'`;
  const p = cp.spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], { encoding: 'utf8', timeout: 60000, windowsHide: true });
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { }
  return String(p.stdout || '').trim() + (p.stderr ? ' ERR ' + p.stderr : '');
}
{ const DS = rd('docs', 'plan', 'tools', 'deploy_swarm.ps1');
  t('DEPLOYFIGHT: the deploy reads the rule and adds a fight below 70 % to its "busy" list (no -Force)', /\. "\$PSScriptRoot\\deploy_fight\.ps1"/.test(DS) && /elseif \(Get-Command DeployFightWhy -ErrorAction SilentlyContinue\) \{ \$why = DeployFightWhy \$s \}/.test(DS) && DS.indexOf('DeployFightWhy $s') < DS.indexOf('ABORT: busy (live state)')); }

// ==== SHOTHOUR + SUPWHY (owner 2026-11-25: "Find ud af hvorfor indkøbsturene ikke startede selv" -> "Ja, lav begge") =========================
{ const i = SRC.indexOf('var HT_SHOT_CRIT'), j = SRC.indexOf('\n', SRC.indexOf('function shotHourCrit'));
  const S = new Function(SRC.slice(i, j) + '\nreturn shotHourCrit;')();
  const crit = new Function('HT_SHOT_CRIT', fn('htSupplyCritical') + '\nreturn htSupplyCritical;')(30);
  t('SHOTHOUR: Destroyer3 uses ~853 S shots an hour = "ran out" below 853 (was 30)', S({ 1467: 853 }, 1467) === 853);
  t('SHOTHOUR: no known use = the old 30; a huge use is capped at 3000', S({}, 1467) === 30 && S({ 1467: 9000 }, 1467) === 3000);
  t('SHOTHOUR: with it the long-hunt hold lets the run go at 700 shots (not only at 29)', crit(['Destroyer3: Soulshot (S) 700'], 853).length === 1 && crit(['Destroyer3: Soulshot (S) 700']).length === 0);
  const w = SRC.slice(SRC.indexOf('// SUPWHY-2026-11-25 (owner'), SRC.indexOf("leadSupply('automatic: '"));
  t('SHOTHOUR: the hunt timer and the once-a-day mode both get the one-hour line', /htHolds\('supply run', \{ low, crit: shotCrit \}\)/.test(w) && /htSupplyCritical\(low, shotCrit\)/.test(w));
  t('SUPWHY: every silent stop of the supply watch now says why (paused, 24/7, busy, the 30 min after a spot trip, run switch, plan) - only when someone is low, max every 10 min', /return wait\('the party is paused/.test(w) && /return wait\('"Hunt here 24\/7"/.test(w) && /a trip to the hunting spot started \$\{Math\.round\(tripAgo \/ 60000\)\} min ago \(waits 30 min\)/.test(w) && /if \(busyWhy\) return wait\(busyWhy\)/.test(w) && /return wait\('the party\\'s run switch is off/.test(w) && /return wait\('the party plan holds supply runs/.test(w) && /if \(anyLow && typeof SUPWHY !== 'undefined' && now\(\) - \(SUPWHY\.at\[why\] \|\| 0\) > SUPWHY\.everyMs\)/.test(w)); }

// ==== LOGINPARTY ===========================================================================================================================
const LO = require(path.join(ROOT, 'Dashboard', 'login_order.js'));
const roster = { Destroyer3: 'Destroyer3', Destroyer4: 'Destroyer3', Destroyer8: 'Destroyer3', Spoiler6: 'Spoiler6', Healer6: 'Spoiler6', Solo: '' };
const ord = LO.partyOrder(['Destroyer4', 'Spoiler6', 'Solo', 'Destroyer8', 'Healer6', 'Destroyer3'], n => roster[n], n => roster[n] === n);
t('LOGINPARTY: each party one block, leader first, parties in first-seen order, no party keeps its place', ord.join() === 'Destroyer3,Destroyer4,Destroyer8,Spoiler6,Healer6,Solo', ord);
t('LOGINPARTY: nothing lost or doubled', LO.partyOrder([1, 2, 3, 4], x => x % 2 ? 'a' : '', () => false).join() === '1,3,2,4');
t('LOGINPARTY: the gap is never under 5 s (8 s by default)', LO.gapMs(5) === 5000 && LO.gapMs(12) === 12000 && LO.gapMs(3) === 8000 && LO.gapMs(undefined) === 8000);
t('LOGINPARTY: the dashboard opens @login one at a time, sorted party by party', /pmap\(p\.sends, p\.command === '@login' \? 1 : 4,/.test(SRV) && /if \(raw === '@login'\) \{ const ord = LOGINORD\.partyOrder\(sends,/.test(SRV));
{ const opens = SRV.split('\n').filter(l => /mcpCallT?\('open_account'/.test(l)); const gapped = SRV.split('\n').map((l, i, A) => /mcpCallT?\('open_account'/.test(l) ? /loginSlot\(\)/.test(l) || /await loginSlot\(\);/.test(A[i - 1] || '') : null).filter(x => x !== null);
  t('LOGINPARTY: every dashboard login waits for its turn (loginSlot)', opens.length >= 4 && gapped.every(Boolean), { opens: opens.length, gapped }); }
t('LOGINPARTY: the startup / reopen run orders by party inside Open-Configs', /\. "\$PSScriptRoot\\login_order\.ps1"/.test(CTL) && /function Open-Configs\(\$configs\) \{\s*\r?\n\s*# LOGINPARTY[^\n]*\r?\n\s*try \{ if \(Get-Command LoginOrderByParty[^\n]*\$configs = \$ord/.test(CTL));
t('LOGINPARTY: the login gap in Open-Configs is unchanged (Start-Sleep $loginGapSec after every open)', /Log \$ctlLog "start: opened \$\(Split-Path \$c -Leaf\)"[^\n]*\r?\n[^\n]*\r?\n\s*Start-Sleep \$loginGapSec/.test(CTL));
function psOrder() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'loginord_')), acc = path.join(tmp, 'acc.json'), cfgs = path.join(tmp, 'cfg.json');
  fs.writeFileSync(acc, JSON.stringify([{ character: 'Destroyer3', config: 'Destroyer3.xml', party: 'Destroyer3' }, { character: 'Destroyer4', config: 'Destroyer4.xml', party: 'Destroyer3' }, { character: 'Spoiler6', config: 'Spoiler6.xml', party: 'Spoiler6' }, { character: 'Healer6', config: 'Healer6.xml', party: 'Spoiler6' }, { character: 'Lone', config: 'Lone.xml' }]));
  fs.writeFileSync(cfgs, JSON.stringify(['C:\\L2Swarm\\Settings\\Destroyer4.xml', 'C:\\L2Swarm\\Settings\\Healer6.xml', 'C:\\L2Swarm\\Settings\\Lone.xml', 'C:\\L2Swarm\\Settings\\Other.xml', 'C:\\L2Swarm\\Settings\\Destroyer3.xml', 'C:\\L2Swarm\\Settings\\Spoiler6.xml']));
  const ps = `. '${path.join(__dirname, 'login_order.ps1')}'; $a = Get-Content '${acc}' -Raw | ConvertFrom-Json; $c = Get-Content '${cfgs}' -Raw | ConvertFrom-Json; $o = @(LoginOrderByParty $c $a); ($o | ForEach-Object { [IO.Path]::GetFileName($_) }) -join ','`;
  const p = cp.spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], { encoding: 'utf8', timeout: 60000, windowsHide: true });
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { }
  return String(p.stdout || '').trim() + (p.stderr ? ' ERR ' + p.stderr : '');
}

(async () => {
  let r = await tickWith(true);
  t('WHHOFF: FULL clan warehouse + worker on Hands off = no "!whsell order" sent', r.sent.length === 0 && /Hands off/.test(String(r.r.why || '')), r);
  r = await tickWith(false);
  t('WHHOFF: the same without Hands off sends the clean-up (the test reaches the real path)', r.sent.length === 1 && r.sent[0] === '!whsell order' && r.r.act === 'clean', r);
  let y = await yieldRun(0, false);
  t('WHSTOP: a !stop before the next step ends the sale at once', y.g === false && y.notes.some(n => /ended by your !stop/.test(n)) && y.clock === 0, y);
  y = await yieldRun(6000, true);
  t('WHSTOP: a !stop while it waits for another task ends it - no "my turn again"', y.g === false && !y.notes.some(n => /my turn again/.test(n)) && y.clock <= 8000, y);
  y = await yieldRun(null, false);
  t('WHSTOP: no !stop and not interrupted = the sale goes on', y.g === 7, y);
  const inner = fn('whSellLoopInner');
  t('WHSTOP: every step of the sale passes the stop counter', (inner.match(/whsYield\(gen, ctlName, sg0\)/g) || []).length === 3 && !/whsYield\(gen, ctlName\)/.test(inner));
  t('WHSTOP: the stop is the reason, the record is closed (no resume), nothing walks and no leveling starts after it', /why = stopWhy\(\) \|\|/.test(inner) && /if \(finished \|\| why\) whsRunWrite\(\{ active: false/.test(inner) && /if \(!byStop && \/giran\/i\.test/.test(inner) && /if \(!byStop && wasLvl/.test(inner));
  t('WHSTOP: a !stop while waiting for the first turn ends it too, the record closed', /!stopWhy\(\)\) \{ setTask\(`clan warehouse sale: waiting for/.test(inner) && /if \(stopWhy\(\)\) \{ if \(gen !== false\) releaseControl\(ctlName\); whsRunWrite\(\{ active: false/.test(inner));
  t('WHSTOP: the .giran tries stop on a !stop', /if \(stopWhy\(\)\) \{ why = stopWhy\(\); return; \}/.test(inner));
  const fr = psFight();
  t('DEPLOYFIGHT: the real rule - Spoiler11 at 65 % in a fight blocks; full HP, out of combat, dead or at 70 % do not', fr === 'Spoiler11=fighting at 65 % HP;Full=;Town=;Dead=;Edge=', fr);
  const ps = psOrder();
  t('LOGINPARTY: the real PowerShell order (startup run) = party blocks, leader first', ps === 'Destroyer3.xml,Destroyer4.xml,Spoiler6.xml,Healer6.xml,Lone.xml,Other.xml', ps);
  console.log(`\n${pass} passed, ${fails} failed`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('FAIL crashed: ' + e.stack); process.exit(1); });
