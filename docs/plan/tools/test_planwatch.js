// test_planwatch.js - requirement academy.md R5 (owner 2026-10-31 "Fix it so it never happens again"): 6 new academy characters skipped their
// academy plan (supply run first, then the idle watchdog started plain leveling -> left Giran without start adena), and a supply run pulled
// Nuker22 to Giran mid-way to the Orc Village Newbie Guide (the trip then broke on a refused .schuttgart / gatekeeper fallback).
const fs = require('fs'), path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'Scripts_dev', 'swarm.js'), 'utf8');
let ok = 0, bad = 0; const t = (m, c) => { if (c) { ok++; console.log('ok   ' + m); } else { bad++; console.log('FAIL ' + m); } };
const grab = (name) => { const i = SRC.indexOf('function ' + name + '('); if (i < 0) return null; let d = 0, j = SRC.indexOf('{', i); for (let k = j; k < SRC.length; k++) { if (SRC[k] === '{') d++; else if (SRC[k] === '}' && --d === 0) return SRC.slice(i, k + 1); } return null; };
const wp = new Function(grab('watchdogPick') + '\nreturn watchdogPick;')();
const hs = new Function(grab('planHoldsSupply') + '\nreturn planHoldsSupply;')();
t('no plan = the watchdog levels', wp(null) === 'level');
t('a plan switched off = levels', wp({ on: false, left: 5 }) === 'level');
t('a finished plan = levels', wp({ on: true, left: 0 }) === 'level');
t('a plan switched on and not finished = the watchdog runs the PLAN', wp({ on: true, left: 13, status: 'idle', running: false }) === 'plan');
t('a running plan = nothing new', wp({ on: true, left: 3, running: true }) === 'wait');
t('a plan waiting for the owner stays waiting', wp({ on: true, left: 3, status: 'waiting' }) === 'wait');
t('the watchdog uses watchdogPick before leadLevel', /wpick = watchdogPick\(planStartNow\(\)\)[\s\S]{0,400}planRun\('watchdog'\)[\s\S]{0,300}leadLevel\('watchdog'\)/.test(SRC));
t('a running non-leveling plan step holds the supply run', hs(true, null) === true);
t('a plan leveling step lets the supply run work', hs(true, { id: 's1' }) === false);
t('no plan running = supply run as before', hs(false, null) === false);
t('the supply watch checks planHoldsSupply', SRC.includes("planHoldsSupply(PLAN.running, PLAN.levelStep)) return;   // PLANWATCH"));
t('a failed .town hop never falls back to a refused gatekeeper (both route loops)', (SRC.match(/if \(townHopNoGk\(hop\)\) \{ r = false;/g) || []).length === 2);
t('the min-gap refusal of .town says why', SRC.includes("gkFail = `.town used ${Math.round((now() - lastTownCmd) / 1000)} s ago (min gap)`"));
{ const a = SRC.indexOf('// NPCNAV-PURE'), b = SRC.indexOf('// NPCNAV-PURE-END');
  const trip = new Function(SRC.slice(a, b) + '\nreturn npcTripPlan;')();
  const guide = { id: 30602, name: 'Newbie Guide', x: -45032, y: -113598, z: -192, place: { town: 'Orc' } };
  const kinds = (p) => p.steps.map(s => s.do).join(' ');
  t('npc trip: 7.4k outside the Orc Village = walk + talk, no "to Orc Village" teleport', kinds(trip(guide, { x: -39048, y: -109208, town: null }, { townKey: (x) => x })) === 'walk talk');
  t('npc trip: from Giran = town step first', kinds(trip(guide, { x: 83473, y: 148554, town: 'Giran' }, { townKey: (x) => x })) === 'town walk talk'); }
t('a plan start stops leveling that already ran (unless its next step is a leveling step)', /if \(autoLvl\.active && nextKind !== 'level'\) \{ autoLvl\.stop = true;/.test(SRC) && SRC.indexOf("nextKind !== 'level'") > SRC.indexOf('async function planRun(') && SRC.indexOf("nextKind !== 'level'") < SRC.indexOf('async function planRun(') + 1500);
// ACADUNLOAD-2026-11-01: a full academy bag goes to the collector, the hunting things stay
{ const i = SRC.indexOf('const ACAD_KEEP_RE'), j = SRC.indexOf('const ACUL = ');
  const U = new Function(SRC.slice(i, j) + '\nreturn { acadUnloadRows, acadUnloadDecide };')();
  const rows = U.acadUnloadRows(['Recipe: Willow Staff', 'Spiritshot (No Grade)', "Apprentice Adventurer's Weapon Exchange Coupon", 'Scroll: Recovery (No Grade)', 'Mana Potion', 'Animal Bone', 'Shadow Item - Apprentice\'s Staff'].map(name => ({ name })));
  t('ACADUNLOAD: loot goes, shots / coupons / scrolls / potions / shadow gear stay', rows.map(r => r.name).join('|') === 'Recipe: Willow Staff|Animal Bone');
  const T = 1e12, D = (o) => U.acadUnloadDecide(Object.assign({ academy: true, lvl: 'full', lastAt: 0, now: T, busy: false, rows: 40 }, o));
  t('ACADUNLOAD: full or near = go; ok bag / busy / 10 min / nothing to give = no', D({}).go && D({ lvl: 'near' }).go && !D({ lvl: '' }).go && !D({ busy: true }).go && !D({ lastAt: T - 60000 }).go && !D({ rows: 0 }).go);
  t('ACADUNLOAD: the coupon retry waits while an unload runs and while the bag is full of loot', SRC.includes("(typeof ACUL !== 'undefined' && ACUL.busy) || (FULLW.lvl === 'full' && which === 'weapon' && acadBagBlocks()),")); }
// ACADFIGHT-2026-11-01: Nuker22 fled from ONE attacker at 44 % because 4 monsters stood near, and died on the run
{ const sd = grab('soloFleeDecide'), ac = SRC.slice(SRC.indexOf('function acadFleeCfg('), SRC.indexOf('\n', SRC.indexOf('function acadFleeCfg(')));
  const S = new Function(ac + '\n' + sd + '\nreturn { acadFleeCfg, soloFleeDecide };')();
  const C = { hitMs: 6000, againMs: 60000, fleeHp: 50, fleeAttackers: 2, fleeNear: 4, leaveHp: 30, finishAtkHp: 20 };
  const o = { hp: 44, hitAgo: 500, attackers: 1, near: 4, atkHp: 60 };
  t('ACADFIGHT: academy, 1 attacker, 4 near, 44 % = fight on (was: escape)', S.soloFleeDecide(o, S.acadFleeCfg(true, C)).act === '' && S.soloFleeDecide(o, S.acadFleeCfg(false, C)).act === 'escape');
  t('ACADFIGHT: academy still flees from 2 attackers < 50 % and < 30 % still hit', S.soloFleeDecide(Object.assign({}, o, { attackers: 2 }), S.acadFleeCfg(true, C)).act === 'escape' && S.soloFleeDecide(Object.assign({}, o, { hp: 25 }), S.acadFleeCfg(true, C)).act === 'escape');
  t('ACADFIGHT: the solo watch uses acadFleeCfg(isAcademy(), SOLOSAFE)', SRC.includes('acadFleeCfg(isAcademy(), SOLOSAFE));')); }
// UNLOADRESUME-2026-11-01: the unload paused Nuker25's quest (an order) and nothing resumed it
{ const i = SRC.indexOf('function acadResumeAfter('); const R = new Function(SRC.slice(i, SRC.indexOf('\n', i)) + '\nreturn acadResumeAfter;')();
  t('UNLOADRESUME: a plan that ran goes on after the unload (on, not finished, not waiting); not when it ran already / was off', R(true, false, { on: true, left: 5, status: 'paused' }) && !R(false, false, { on: true, left: 5 }) && !R(true, true, { on: true, left: 5 }) && !R(true, false, { on: true, left: 5, status: 'waiting' }) && !R(true, false, { on: true, left: 0 }));
  t('UNLOADRESUME: no ORDER for the trip (plain .giran), a quest step is halted cleanly first, nearly full waits for it', !/async function acadUnload[\s\S]{0,1200}acadToGiran\(\)/.test(SRC) && /if \(PLAN\.running && !PLAN\.levelStep\) \{ PLAN\.stop = true; try \{ planHaltStep\(\);/.test(SRC) && SRC.includes("|| (PLAN.running && !PLAN.levelStep && FULLW.lvl !== 'full') });")); }
// QUESTADOPT-2026-11-01: 19 plans paused after a deploy (the plan's new order replaced the quest the engine had resumed)
{ const i = SRC.indexOf('function planQuestAdopt('); const A = new Function(SRC.slice(i, SRC.indexOf('\n', i)) + '\nreturn planQuestAdopt;')();
  t('QUESTADOPT: the engine runs the same quest = adopt; another quest / none = a new order', A(true, 320, 320) && !A(true, 412, 320) && !A(false, 320, 320) && !A(true, 0, 0));
  t('QUESTADOPT: planStepQuest only begins a new order when it does not adopt', SRC.includes("PLAN.seq = adopt ? orderState.seq : orderBegin(`plan: quest ${id}`);")); }
// VIASPLIT-2026-11-01: quest 412's route start '... > Gludio -> DE Village' became the hop "Gludio -"
{ const i = SRC.indexOf('function viaHops('); const V = new Function(SRC.slice(i, SRC.indexOf('\n', i)) + '\nreturn viaHops;')();
  t('VIASPLIT: ".gludio > Gludio -> DE Village" = 2 hops, the second one whole', JSON.stringify(V('.gludio > Gludio -> DE Village')) === JSON.stringify(['.gludio', 'Gludio -> DE Village']));
  t('VIASPLIT: ".schuttgart > Schuttgart -> Orc Village" and a single hop', JSON.stringify(V('.schuttgart > Schuttgart -> Orc Village')) === JSON.stringify(['.schuttgart', 'Schuttgart -> Orc Village']) && JSON.stringify(V('.oren')) === JSON.stringify(['.oren']) && V('').length === 0);
  t('VIASPLIT: the route start uses viaHops (no plain split on ">")', SRC.includes('const hops = viaHops(st.via);') && !/String\(st\.via\)\.split\('>'\)/.test(SRC)); }
// STARTKEEPSQUEST-2026-11-01: the hive resume's '!start' replaced the plan's quest after every dashboard restart
{ const i = SRC.indexOf('function startKeepsQuest('); const S = new Function(SRC.slice(i, SRC.indexOf('\n', i)) + '\nreturn startKeepsQuest;')();
  t('STARTKEEPSQUEST: plain !start + the engine runs my plan step\'s quest = carry on; other quest / a named !start / another order = new order', S('!start', 1, true, 412, 412) && !S('!start', 1, true, 320, 412) && !S('!start', 2, true, 412, 412) && !S('!town', 1, true, 412, 412) && !S('!start', 1, false, 412, 412));
  t('STARTKEEPSQUEST: the order dispatch checks it before orderBegin', SRC.includes('!startKeepsQuest(String(parts[0] || \'\').toLowerCase(), parts.length, qeS().running')); }
// ACADSELL-2026-11-01 (owner: "academy toons sell junk in town when they are 80% full")
t('ACADSELL: the academy unload sells the junk at Helvetia first (sellAt, the party sell switch), then hands the rest on', /ACADSELL-2026-11-01[\s\S]{0,900}await sellAt\(npc, 'academy bag 80%', supplyJunkGrades\(\)\)[\s\S]{0,1200}const rows = acadUnloadRows\(/.test(SRC));
t('ACADSELL: new academy characters get the sell switch ON', fs.readFileSync(path.join(__dirname, '..', '..', '..', 'Dashboard', 'academy_api.js'), 'utf8').includes('want = { supplyWatch: true, sell: true, storeMagnus'));
console.log(`planwatch:${ok} ok, ${bad} failed`); process.exit(bad ? 1 : 0);
