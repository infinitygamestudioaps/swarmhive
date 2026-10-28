// OFFLINE TEST of the PARTY AUTOMATIONS switches + the per-party adena givers (owner 2026-10-13: "everything configurable by hand, nothing
// automatic unless the player switches it on"; "if someone should give them adena, it must also configure the player you set up (the giver)").
// Never touches the game, MCP or the live data (scratch files in os.tmpdir()).
//   node docs/plan/tools/test_party_auto.js        (exit code 1 when a check fails; SWARM_JS=<file> tests another copy of swarm.js)
// 1) PARTYAUTO-PURE of Scripts_dev/swarm.js (pautoEffective: character > party > default, missing = OFF) = Dashboard/partyauto_api.js (matrix).
// 2) the host part (pautoData / pautoOn / pautoGate) on an in-memory file system + virtual clock.
// 3) the REAL automatic paths run on stubs: the supply watch (setInterval), the town sell (setInterval), the supply-run steps of
//    leadTeamAction (supplyneed / sellrun / dyerun) and dyePlanStep REFUSE while switched off and run while on; source checks that the
//    leader's own sale + the dye step of leadSupply ask the switch, and that the ORDERS (!supply, !sell, !dyes / dyeMine, sellAt) do not.
// 4) FUNDGIVERS-PURE (per receiving party givers; old files = the shared rule) + fundNeedy / fundRound use it; the adena API keeps
//    parties.<leader>.givers and refuses a bad one.
// 5) Dashboard/partyauto_api.js on a scratch file: one party's slice, null removes, rev conflict (409), bad values (400), lock + history,
//    GET info; the owner's live party_auto.json keeps today's behaviour (every party of swarm.config.json ON); release_build seeds it OFF.
// 6) SUPPLYAMT 2026-10-14: supply amounts per level band (party > all parties > built-in), the bot = the API, supplyWants uses them,
//    the API keeps / validates / removes the tables.
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const ROOT = path.join(__dirname, '..', '..', '..');
const SRCF = process.env.SWARM_JS || path.join(ROOT, 'Scripts_dev', 'swarm.js');
const src = fs.readFileSync(SRCF, 'utf8');
let fails = 0, n = 0;
const check = (ok, what, info) => { n++; console.log((ok ? 'ok   ' : 'FAIL ') + what + (!ok && info ? ' — ' + info : '')); if (!ok) fails++; };
const blk = (b, e) => { const i = src.indexOf(b), j = src.indexOf(e, i + 1); if (i < 0 || j < i) { console.error(b + ' block not found'); process.exit(1); } return src.slice(i, j); };
const fnSrc = (head) => { const i = src.indexOf(head); if (i < 0) { console.error(head + ' not found'); process.exit(1); } const j = src.indexOf('\n}\n', i); return src.slice(i, j + 3); };
const caseSrc = (label) => { const i = src.indexOf(`    case '${label}'`); const j = src.indexOf('\n    case \'', i + 10); return src.slice(i, j); };

// ---- 1) pure + the API's copy ---------------------------------------------------------------------------------------------------
const PURE = blk('// PARTYAUTO-PURE-BEGIN', '// PARTYAUTO-PURE-END');
const P = new Function(PURE + '\nreturn { PAUTO_KINDS, pautoNorm, pautoEffective, pautoAmounts, PAUTO_BANDS, PAUTO_AMT_KEYS };')();
const API = require(path.join(ROOT, 'Dashboard', 'partyauto_api.js'));
const E = P.pautoEffective;
check(E({}, 'supplyWatch', 'Tank1', 'Tank1').on === false && E({}, 'sell', 'Bishop1', 'Tank1').on === false && E(null, 'dyes', 'X', 'X').on === false, 'no file / empty / broken: everything OFF');
check(E({ default: { sell: 'yes' } }, 'sell', 'A', 'A').on === false && E({ default: { sell: true } }, 'sell', 'A', 'A').on === true, 'default must be literally true');
const J1 = { parties: { Tank1: { supplyWatch: true, sell: true, dyes: true } } };
['supplyWatch', 'sell', 'dyes'].forEach(k => check(E(J1, k, 'Bishop1', 'Tank1').on === true && E(J1, k, 'Bishop1', 'Tank1').src === 'party', `party ON: ${k} on for a member`));
check(E(J1, 'sell', 'Destroyer3', 'Destroyer3').on === false, 'a party without an entry: OFF');
const J2 = { parties: { Tank1: { sell: true, dyes: false } }, chars: { Bishop1: { sell: false, dyes: true, supplyWatch: true } } };
check(E(J2, 'sell', 'Bishop1', 'Tank1').on === false && E(J2, 'sell', 'Bishop1', 'Tank1').src === 'char', 'a character switch wins over the party (sell off)');
check(E(J2, 'dyes', 'Bishop1', 'Tank1').on === true, '... and the other way round (symbols on in a party with them off)');
check(E(J2, 'supplyWatch', 'Bishop1', 'Tank1').on === false && E(J2, 'supplyWatch', 'Bishop1', 'Tank1').src !== 'char', 'supplyWatch has NO character switch (party only)');
check(E({ parties: { Tank1: { sell: true } }, chars: { Tank1: { sell: false } } }, 'sell', 'Tank1', 'Tank1').on === false, 'the leader as a character may have its own sell switch');
check(E(J1, 'nonsense', 'Tank1', 'Tank1').on === false, 'unknown kind: OFF');
check(Object.keys(P.PAUTO_KINDS).join() === API.KEYS.join() && Object.keys(P.PAUTO_KINDS).filter(k => P.PAUTO_KINDS[k].char).join() === API.CHAR_KEYS.join(), 'swarm.js and the API know the same switches');
{ const files = [{}, J1, J2, { default: { supplyWatch: true, sell: true, dyes: true }, parties: { Tank1: { sell: false } }, chars: { Bishop1: { dyes: false } } }, { parties: [], chars: 'x' }];
  let same = true; files.forEach(f => ['Tank1', 'Bishop1', 'Destroyer3'].forEach(me => ['supplyWatch', 'sell', 'dyes', 'zz'].forEach(k => { const a = E(f, k, me, me === 'Destroyer3' ? 'Destroyer3' : 'Tank1'), b = API.pautoEffective(f, k, me, me === 'Destroyer3' ? 'Destroyer3' : 'Tank1'); if (a.on !== b.on || a.src !== b.src) same = false; })));
  check(same, 'the bot and the dashboard give the same answer (matrix of files x characters x switches)'); }

// ---- 2) host part ---------------------------------------------------------------------------------------------------------------
const HOST = blk('// PARTYAUTO-PURE-BEGIN', '// PARTYAUTO-HOST-END');
function world(o) {
  const W = Object.assign({ t: 1760360000000, files: {}, notes: [], me: 'Tank1', leader: 'Tank1', team: {} }, o || {});
  W.File = { Exists: (f) => !!W.files[f], ReadAllText: (f) => { if (!W.files[f]) throw new Error('no file'); return W.files[f].text; } };
  W.put = (o2) => { W.files['C:\\L2\\Scripts\\data\\party_auto.json'] = { text: typeof o2 === 'string' ? o2 : JSON.stringify(o2), stamp: String(++W.t) }; };
  W.env = { File: W.File, __DIR__: 'C:\\L2', now: () => W.t, fileStamp: (f) => (W.files[f] ? W.files[f].stamp : ''), Me: { get Name() { return W.me; } }, CONFIG: { get leader() { return W.leader; } },
    teamOf: (x) => W.team[x] || x, note: (m) => W.notes.push(m) };
  return W;
}
const hostFns = (W, extra) => new Function('env', 'with (env) {\n' + HOST + '\n' + (extra || '') + '\nreturn { pautoData, pautoOn, pautoGate, PAUTO }; }')(W.env);
{ const W = world({ me: 'Bishop1', leader: 'Tank1', team: { Bishop1: 'Tank1', Necro1: 'Tank1' } }), H = hostFns(W);
  check(H.pautoOn('supplyWatch') === false && H.pautoOn('sell') === false && H.pautoOn('dyes') === false, 'host: no file = everything OFF');
  W.put({ parties: { Tank1: { sell: true } }, chars: { Necro1: { sell: false } } }); W.t += 6000;
  check(H.pautoOn('sell') === true && H.pautoOn('sell', 'Necro1') === false, 'host: the file is read again (5 s), a teammate is asked by name (its own switch)');
  W.put('{"parties": {"Tank1": {'); W.t += 6000;
  check(H.pautoOn('sell') === true, 'host: a half-written file keeps the last good state');
  W.put({}); W.t += 6000;
  check(H.pautoGate('sell') === false && W.notes.length === 1 && /switched OFF/.test(W.notes[0]), 'host: gate OFF = refused + one note');
  check(H.pautoGate('sell') === false && W.notes.length === 1, 'host: ... not repeated within 10 min');
  W.t += 600001; H.pautoGate('sell');
  check(W.notes.length === 2, 'host: ... said again after 10 min'); }

// ---- 3) the real automatic paths on stubs ----------------------------------------------------------------------------------------
const WATCH = blk('// Leader: someone is running low -> supply run', '// Leader: someone reached a class-change level');
function supplyWatchRun(on, opts) {
  const o = opts || {}, W = world(), calls = [];
  if (on !== null) W.put({ parties: { Tank1: { supplyWatch: on } } });
  const intervals = [];
  Object.assign(W.env, {
    setInterval: (fn) => intervals.push(fn), leadMode: () => true, state: { role: 'sk', mode: 'level' }, isLeader: () => true, IsCharacterReady: () => true, leadPaused: () => false,
    nonstopOn: () => false, htHolds: () => false /* HUNTTIMER-2026-10-15: no hunt timer here (test_hunt_timer.js tests it) */, rcHolds: () => !!o.circuit, supplyDue: () => true, lastSupplyAtGet: () => 0, leadRunBusy: false, regroupRun: null, inRaid: () => false,
    scoutCtl: { on: false }, outranked: () => false, PRIO: { ORDER: 4, UPKEEP: 6 }, supplyLow: { what: o.low === false ? '' : 'SoE 0/5' }, teamNames: () => [], livePos: {}, num: Number, Inventory: { Count: 10 },
    CONFIG: { leader: 'Tank1', lead: { unload: { above: 70 } }, stash: { on: false, auto: false, above: 100 } }, globalThis: {},
    runAuto: () => o.run !== false, rcSupplyAsk: () => calls.push('rcSupplyAsk'), leadSupply: (why) => { calls.push('leadSupply ' + why); return Promise.resolve(); },
    logError: (w, e) => calls.push('ERR ' + w + ' ' + e.message), PartyList: { forEach() { }, Count: 0 }, classPlanOf: () => ({}), CP_STATUS: {}, classAsked: {}, SayToParty: () => { },
  });
  new Function('env', 'with (env) {\n' + HOST + '\n' + WATCH + '\n}')(W.env);
  intervals[0]();
  return calls;
}
check(supplyWatchRun(true).some(c => /^leadSupply automatic/.test(c)), 'supply watch ON + someone low: a supply run starts');
check(!supplyWatchRun(false).some(c => /leadSupply/.test(c)), 'supply watch OFF (party entry false): NO supply run');
check(!supplyWatchRun(null).some(c => /leadSupply/.test(c)), 'supply watch with no entry (fresh install): NO supply run');
check(!supplyWatchRun(true, { run: false }).some(c => /leadSupply/.test(c)), 'supply watch ON but the party stopped (Start / Stop): NO supply run');
check(!supplyWatchRun(true, { low: false }).some(c => /leadSupply/.test(c)), 'supply watch ON, nobody low: nothing');
check(supplyWatchRun(false, { circuit: true }).includes('rcSupplyAsk'), 'the raid circuit\'s own resupply between bosses is not this switch (it has its own: circuitResupply)');
// RESUPOPT-2026-10-27 (owner: "Make the resupply optional"): the circuit's resupply = its own party switch circuitResupply, default ON
// the raid circuit + its switch are owner only (PRIVATE-START): in the public package they are cut, so these checks only run where they exist
if (!/circuitResupply: {/.test(src)) console.log('skip circuit resupply checks (public package: the raid circuit is owner only)');
else { const ASK = (() => { const i = src.indexOf('function rcSupplyAsk(low)'); return src.slice(i, src.indexOf('\n', i)); })();
  const ask = (cfg) => { const W = world(), RC = { supplyWant: null }; if (cfg) W.put(cfg); new Function('env', 'RC', 'rcEvent', 'with (env) {\n' + HOST + '\n' + ASK + '\nrcSupplyAsk(["Tank1: SoE 0/5"]);\n}')(W.env, RC, () => { }); return { RC, W }; };
  check(!!ask(null).RC.supplyWant && !!ask({ parties: { Tank1: { supplyWatch: false } } }).RC.supplyWant, 'circuit resupply: DEFAULT ON (no entry; also with supply runs off) = resupplies between bosses as before');
  const off = ask({ parties: { Tank1: { circuitResupply: false } } });
  check(!off.RC.supplyWant && off.W.notes.some(m => /raid circuit's resupply/.test(m)), 'circuit resupply switched OFF: nothing asked, a note says so');
  const loop = fnSrc('async function raidCircuitLoop(why) {');
  check(/if \(pautoGate\('circuitResupply'\)\) \{ await rcSupply\(/.test(loop) && /!RC\.supplyWant && pautoGate\('circuitResupply'\)/.test(loop), 'circuit loop + after-a-wipe resupply ask the switch'); }

const TSELL_SRC = blk('const TSELL = { since: 0', '// NODESTROY-2026-10-13 (tester');
async function townSellRun(cfg, me) {
  const W = world({ me: me || 'Bishop1', leader: 'Tank1', team: { Bishop1: 'Tank1' } }), calls = [];
  if (cfg) W.put(cfg);
  const intervals = [];
  Object.assign(W.env, {
    setInterval: (fn) => intervals.push(fn), CONFIG: { leader: 'Tank1', sell: { enabled: true }, restock: { npcMatch: /Grocer/, skipNpcs: [] } }, state: { role: 'bishop' }, IsCharacterReady: () => true,
    currentTownKey: () => 'Dion', IsInCombat: false, tradeState: null, regroupRun: null, leadRunBusy: false, inRaid: () => false, questRun: { active: false }, outranked: () => false, PRIO: { UPKEEP: 6 },
    sellCandidates: () => [{ why: 'marked', name: 'Old Sword', count: 1 }], runAuto: () => true, takeControl: () => true, releaseControl: () => { },
    SayToParty: (m) => calls.push('say ' + m), intent: () => { }, intentDone: () => { }, giranGo: async () => { }, snapNpcs: () => [], grocerSpawns: () => [],
    findNpcOrWalk: async () => ({ Name: 'Grocer' }), itemCount: () => 0, sellAt: async () => { calls.push('sellAt'); return { sold: [1] }; }, logError: (w, e) => calls.push('ERR ' + e.message),
  });
  W.env.Me.IsDead = false;
  new Function('env', 'with (env) {\n' + HOST + '\n' + TSELL_SRC + '\n}')(W.env);
  intervals[0](); W.t += 21000; intervals[0]();
  await new Promise(r => setTimeout(r, 30));
  return calls;
}

// ---- leadTeamAction + dyePlanStep
const LTA = fnSrc('async function leadTeamAction(action, data) {'), DPS = fnSrc('async function dyePlanStep() {');
function ltaEnv(cfg, me) {
  const W = world({ me: me || 'Bishop1', leader: 'Tank1', team: { Bishop1: 'Tank1' } }), calls = [];
  if (cfg) W.put(cfg);
  Object.assign(W.env, {
    supplyJunkGrades: () => ['none'], sellCandidatesEx: () => ({ list: [{ id: 1 }, { id: 2 }], why: '' }), supplyNeeds: () => ({}), enchantNeeds: () => ({}), num: Number,
    CONFIG: { leader: 'Tank1', gear: { enchant: { auto: false }, dyes: { on: true, slots: 3 } }, restock: { npcMatch: /Grocer/, skipNpcs: [] } }, App: { self: () => ({ accountId: 'x' }) },
    Inventory: { Count: 5 }, stashWanted: () => 0, bagSync: async () => { }, sellCandidates: () => [{ id: 1 }], state: {}, Options: {}, Send: { StopMove() { } }, standUp: () => { },
    giranGo: async () => { }, snapNpcs: () => [{ Name: 'Helvetia', ref: { Name: 'Helvetia' } }], findNpcOrWalk: async () => null, grocerSpawns: () => [],
    sellAt: async () => { calls.push('sellAt'); return { sold: [1], msg: '' }; }, note: () => { }, sleep: async () => { },
    myDyePlan: () => ({ key: 'x', list: [{ symbolId: 1, name: 'Symbol of STR', minLevel: 1 }] }), dyeMine: async (why) => { calls.push('dyeMine ' + why); return { ok: true, msg: 'drawn' }; },
    Me: { Name: me || 'Bishop1', Level: 40, ClassId: 16 }, readMySymbols: async () => { calls.push('readMySymbols'); return { known: true, ids: [] }; }, dyeUnavail: () => ({}), unavailActive: () => false, dyeUnavailWhen: () => '',
    bagCount: () => 0, itemCount: () => 1e9, enchantMine: async () => ({}), gearPlanStep: async () => ({}), gearUpgrade: async () => ({}),
  });
  W.env.Me.Name = me || 'Bishop1';
  const F = new Function('env', 'with (env) {\n' + HOST + '\n' + LTA + '\n' + DPS + '\nreturn { leadTeamAction, dyePlanStep }; }')(W.env);
  return { F, calls };
}
(async () => {
  // town sell
  const tsOn = await townSellRun({ parties: { Tank1: { sell: true } } }), tsOff = await townSellRun({ parties: { Tank1: { sell: false } } }), tsNone = await townSellRun(null);
  const tsChar = await townSellRun({ parties: { Tank1: { sell: true } }, chars: { Bishop1: { sell: false } } }), tsCharOn = await townSellRun({ parties: { Tank1: { sell: false } }, chars: { Bishop1: { sell: true } } });
  check(tsOn.includes('sellAt'), 'town sell ON: sells the marked items');
  check(!tsOff.includes('sellAt') && !tsOff.some(c => /^say/.test(c)), 'town sell OFF (party): nothing sold, nothing said');
  check(!tsNone.includes('sellAt'), 'town sell, no file (fresh install): nothing sold');
  check(!tsChar.includes('sellAt'), 'town sell: the character switched OFF in a party with selling ON sells nothing');
  check(tsCharOn.includes('sellAt'), 'town sell: the character switched ON in a party with selling OFF sells');

  // supply-run steps
  { const { F } = ltaEnv({ parties: { Tank1: { sell: true } } }); const r = await F.leadTeamAction('supplyneed'); check(r.sell === 2, 'supplyneed, selling ON: reports its 2 kinds to sell'); }
  { const { F } = ltaEnv({ parties: { Tank1: { sell: false } } }); const r = await F.leadTeamAction('supplyneed'); check(r.sell === 0 && /switched off/.test(r.sellWhy), 'supplyneed, selling OFF: reports nothing to sell (it is left out of the sale step)'); }
  { const { F, calls } = ltaEnv({ parties: { Tank1: { sell: true } } }); await F.leadTeamAction('sellrun', { order: ['Bishop1'] }); check(calls.includes('sellAt'), 'sale step, selling ON: sells at Helvetia'); }
  { const { F, calls } = ltaEnv({}); const r = await F.leadTeamAction('sellrun', { order: ['Bishop1'] }); check(!calls.includes('sellAt') && /switched off/.test(r.msg), 'sale step, selling OFF: sells nothing'); }
  { const { F, calls } = ltaEnv({ parties: { Tank1: { dyes: true } } }); await F.leadTeamAction('dyerun', { order: ['Bishop1'] }); check(calls.includes('dyeMine supply run'), 'dye step, symbols ON: draws its symbol'); }
  { const { F, calls } = ltaEnv({ parties: { Tank1: { dyes: true } }, chars: { Bishop1: { dyes: false } } }); const r = await F.leadTeamAction('dyerun', { order: ['Bishop1'] }); check(!calls.some(c => /dyeMine/.test(c)) && /switched off/.test(r.msg), 'dye step, the character switched OFF: draws nothing'); }
  { const { F, calls } = ltaEnv({ parties: { Tank1: { dyes: true } } }); const r = await F.dyePlanStep(); check(r.need === true && calls.includes('readMySymbols'), 'dye plan step, symbols ON: needs a symbol'); }
  { const { F, calls } = ltaEnv({}); const r = await F.dyePlanStep(); check(r.need === false && /switched off/.test(r.msg) && !calls.includes('readMySymbols'), 'dye plan step, symbols OFF: no need, the game is not even asked'); }

  // source checks: leadSupply asks the switch for the leader's own sale + the dye step; orders never ask
  const LS = fnSrc('async function leadSupply(why, opts) {');
  check(/junk = pautoOn\('sell'\) \? sellCandidates\(junkGrades\) : \[\]/.test(LS), 'leadSupply: the leader\'s own sale at Helvetia asks the sell switch');
  check(/state\.supplyLean\.dyes\) && \[Me\.Name\]\.concat\(members\.map\(a => a\.name\)\)\.some\(n => pautoOn\('dyes', n\)\)/.test(LS), 'leadSupply: no dye step unless someone of the party has symbols ON');
  check(!/pauto/.test(LS.slice(0, LS.indexOf('pstRun('))), 'leadSupply itself (your !supply) is never refused by these switches');
  check(!/pauto/.test(caseSrc('!supply')) && !/pauto/.test(fnSrc('async function orderSupply(')), 'order !supply: no party-settings gate');
  check(!/pauto/.test(caseSrc('!sell')), 'order !sell: no party-settings gate');
  check(!/pauto/.test(caseSrc('!dyes')) && !/pauto/.test(fnSrc('async function dyeMine(why, dry) {')), 'order !dyes (dyeMine): no party-settings gate');
  // NOAUTOSELL 2026-10-26 (owner: "automatic selling should be default OFF ... I never want that to happen again"): sellAt now carries the ONE gate every
  // automatic sale passes; an order (why '!...') or the dashboard's chosen items (only) always pass it
  check(fnSrc('async function sellAt(npc, why, grades, only) {').includes("if (!only && !/^!/.test(String(why || '')) && !pautoOn('sell')) {"), 'sellAt: the NOAUTOSELL gate (orders and chosen items pass, automatic sales need the sell switch)');
  check(/CONFIG\.sell\.enabled && pautoOn\('sell'\) && sellCandidates\(\)\.length/.test(src) && /toSell = CONFIG\.sell\.enabled && pautoOn\('sell'\)/.test(src), 'the old town-restock / Giran shopping sale paths ask the sell switch too');

  // ---- 4) FUNDGIVERS
  const FG = new Function(blk('// FUNDGIVERS-PURE-BEGIN', '// FUNDGIVERS-PURE-END') + '\nreturn { fundGiversFor, fundGiverAllowed, fundGiverAny };')();
  const R0 = { givers: { mode: 'list', list: ['Tank1'] }, parties: { Destroyer3: { receive: true } } };
  check(FG.fundGiverAllowed(R0, 'Tank1', 'Destroyer3') && !FG.fundGiverAllowed(R0, 'Dagger1', 'Destroyer3') && FG.fundGiversFor(R0, 'Destroyer3').src === 'all', 'old file (no party givers): the shared list decides, as before');
  // FUNDCOLLECTOR-2026-10-25 (owner: "not auto selected ... only the collector role should hand them out, or selectable"): no setting = the collector
  check(!FG.fundGiverAllowed({}, 'Anyone', 'X') && FG.fundGiverAllowed({ _collector: 'Dagger1' }, 'Dagger1', 'X') && !FG.fundGiverAllowed({ _collector: 'Dagger1' }, 'Tank1', 'X'), 'no givers setting: ONLY the collector gives (nobody when no collector is set)');
  check(FG.fundGiverAllowed({ givers: { mode: 'collector' }, _collector: 'Dagger1' }, 'Dagger1', 'X') && !FG.fundGiverAllowed({ givers: { mode: 'collector' }, _collector: 'Dagger1' }, 'Destroyer3', 'X'), 'mode collector: the collector only');
  check(FG.fundGiverAllowed({ givers: { mode: 'auto' } }, 'Anyone', 'X'), 'an old file with mode auto: any rich leader (unchanged until the owner picks)');
  { const AF = require(path.join(ROOT, 'Dashboard', 'autofund.js'));
    const st = [{ name: 'Tank1', adena: 63e6, ageSec: 5, party: 'Tank1' }, { name: 'Dagger1', adena: 30e6, ageSec: 5, party: 'Dagger1' }, { name: 'Bishop1', adena: 5e6, ageSec: 5, party: 'Tank1' }];
    const d1 = AF.depositDecide({ on: true, above: 20e6, keep: 10e6, againMin: 120 }, st, 'Dagger1', new Set(), {}, { dep: {} }, Date.now());
    check(d1 && d1.giver === 'Tank1' && d1.amount === 53e6, 'surplus: above the limit -> everything above "keep" to the collector', d1);
    check(!AF.depositDecide({ on: false, above: 1, keep: 0, againMin: 1 }, st, 'Dagger1', new Set(), {}, { dep: {} }, Date.now()) && !AF.depositDecide({ on: true, above: 20e6, keep: 10e6, againMin: 120 }, st, '', new Set(), {}, { dep: {} }, Date.now()), 'surplus: off / no collector = nothing');
    check(!AF.depositDecide({ on: true, above: 20e6, keep: 10e6, againMin: 120 }, st, 'Dagger1', new Set(), { Tank1: { above: 70e6 } }, { dep: {} }, Date.now()), 'surplus: a party\'s own higher limit wins');
    check(/sameTown: true, note: `adena to the collector/.test(fs.readFileSync(path.join(ROOT, 'Dashboard', 'autofund.js'), 'utf8')) && /sameTown: !!giverRule\(ctx\)/.test(fs.readFileSync(path.join(ROOT, 'Dashboard', 'autofund.js'), 'utf8')), 'surplus + share orders wait for the same town (nobody travels for adena)'); }
  const R1 = { givers: { mode: 'list', list: ['Tank1'] }, parties: { Destroyer3: { receive: true, givers: { mode: 'list', list: ['Dagger1'] } }, Crafter1: { givers: { mode: 'none', list: [] } }, Tank2: { givers: { mode: 'auto' } } } };
  check(FG.fundGiverAllowed(R1, 'Dagger1', 'Destroyer3') && !FG.fundGiverAllowed(R1, 'Tank1', 'Destroyer3'), 'party Destroyer3\'s own list: only Dagger1 gives to it (not the shared Tank1)');
  check(!FG.fundGiverAllowed(R1, 'Tank1', 'Crafter1') && !FG.fundGiverAllowed(R1, 'Dagger1', 'Crafter1'), 'party Crafter1 "nobody": nobody gives to it');
  check(FG.fundGiverAllowed(R1, 'Spoiler6', 'Tank2'), 'party Tank2 "any rich leader": everybody may give to it');
  check(FG.fundGiverAllowed(R1, 'Tank1', 'Tank3') && !FG.fundGiverAllowed(R1, 'Dagger1', 'Tank3'), 'a party without its own choice: the shared list');
  check(FG.fundGiverAny(R1, 'Dagger1') && FG.fundGiverAny(R1, 'Tank1') && FG.fundGiverAny(R1, 'Spoiler6'), 'fundGiverAny: shared list or any party\'s own rule lets a giver start a round');
  check(!FG.fundGiverAny({ givers: { mode: 'none' }, parties: { A: { givers: { mode: 'list', list: ['B'] } } } }, 'C'), 'fundGiverAny: nobody lets C = no round at all');
  check(FG.fundGiversFor({ parties: { A: { givers: { mode: 'weird' } } } }, 'A').src === 'all', 'a broken party rule falls back to the shared rule');
  check(/fundMayGive\(Me\.Name, n\)/.test(fnSrc('function fundNeedy() {')) && /!fundMayGive\(Me\.Name\)/.test(fnSrc('async function fundRound(why, inline) {')), 'fundNeedy asks the receiver\'s party rule; fundRound starts when any rule lets me give');
  check(/fundInTown\(n\) && !fundSkip\(n\)/.test(fnSrc('function fundNeedy() {')), 'fundNeedy still checks town + skip (the filter was not cut short)');
  const FA = require(path.join(ROOT, 'Dashboard', 'fundpage_api.js'));
  const base = { on: true, town: 'Giran', everyMin: 30, minGive: 200000, slack: 500000, brokeBelow: 500000, givers: { mode: 'auto', list: [], keepAtLeast: 30000000 }, defaults: { leaderTarget: 8000000, memberTarget: 3000000, clanLeaderTarget: 12000000 }, chars: {} };
  const s1 = FA.fundSanitize(Object.assign({}, base, { parties: { Destroyer3: { receive: true, givers: { mode: 'list', list: ['Dagger1', 'Dagger1', ' Tank1 '] } }, Crafter1: { receive: false } } }), {});
  check(s1.ok && JSON.stringify(s1.rules.parties.Destroyer3.givers) === JSON.stringify({ mode: 'list', list: ['Dagger1', 'Tank1'] }) && s1.rules.parties.Crafter1.givers === undefined, 'adena API: keeps a party\'s own givers (deduplicated), none = no entry');
  check(FA.fundSanitize(Object.assign({}, base, { parties: { Destroyer3: { givers: { mode: 'auto', list: ['X'] } } } }), {}).rules.parties.Destroyer3.givers.list.length === 0, 'adena API: auto / none keep no names');
  check(!FA.fundSanitize(Object.assign({}, base, { parties: { Destroyer3: { givers: { mode: 'sometimes' } } } }), {}).ok && !FA.fundSanitize(Object.assign({}, base, { parties: { Destroyer3: { givers: { mode: 'list', list: ['bad name!'] } } } }), {}).ok, 'adena API: a bad mode / name is refused');

  // ---- 5) the party automations API
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'partyauto-')), DATA = path.join(TMP, 'data'), LOGS = path.join(TMP, 'Logs');
  fs.mkdirSync(DATA, { recursive: true }); fs.mkdirSync(LOGS, { recursive: true });
  const F = path.join(DATA, 'party_auto.json'); process.env.SWARM_PARTYAUTO_FILE = F;
  const ctx = { DIR: path.join(ROOT, 'Dashboard'), DATA, LOGS, ROOT, readJson: (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }, readStates: () => [],
    teamMap: () => ({ Tank1: 'Tank1', Bishop1: 'Tank1', Destroyer3: 'Destroyer3' }), reloadCfg: () => ({ accounts: [] }), mainLeader: 'Tank1', allowed: () => true };
  const i0 = API.info(ctx);
  check(!i0.exists && i0.parties.length === 2 && i0.parties.every(p => ['supplyWatch', 'sell', 'dyes'].every(k => p.eff[k].on === false)), 'API GET with no file: every party + automation switch OFF');
  check(i0.parties.every(p => ['skills', 'heals', 'potions'].every(k => p.eff[k].on === true)), 'API GET with no file: the HIVESW combat switches (skills / heals / potions) ON = the autopilot as before');   // HIVESW-2026-10-15
  const r1 = API.post(ctx, { party: 'Tank1', values: { supplyWatch: true, sell: true }, chars: { Bishop1: { sell: false } } });
  const f1 = JSON.parse(fs.readFileSync(F, 'utf8'));
  check(r1.ok && f1.parties.Tank1.supplyWatch === true && f1.parties.Tank1.sell === true && f1.chars.Bishop1.sell === false && f1.default.sell === false && !f1.parties.Destroyer3, 'API POST: this party + its member written, defaults OFF in a new file');
  const i1 = API.info(ctx), sh = i1.parties.find(p => p.leader === 'Tank1');
  check(sh.eff.supplyWatch.on && sh.eff.dyes.on === false && sh.chars.Bishop1.sell.on === false && sh.chars.Bishop1.sell.src === 'char', 'API GET: effective values per party + character');
  const r2 = API.post(ctx, { party: 'Tank1', values: { sell: null }, chars: { Bishop1: { sell: null } }, rev: i1.rev });
  const f2 = JSON.parse(fs.readFileSync(F, 'utf8'));
  check(r2.ok && f2.parties.Tank1.sell === undefined && f2.parties.Tank1.supplyWatch === true && !f2.chars.Bishop1, 'API: null removes (back to the setting for all parties / like the party)');
  check(API.post(ctx, { party: 'Tank1', values: { sell: true }, rev: i1.rev }).code === 409, 'API: an old rev = 409 (changed meanwhile), nothing written');
  check(API.post(ctx, { party: 'Tank1', values: { sell: 'yes' } }).code === 400 && API.post(ctx, { party: 'Tank1', values: { fly: true } }).code === 400
    && API.post(ctx, { party: 'Tank1', chars: { Bishop1: { supplyWatch: true } } }).code === 400 && API.post(ctx, { party: 'bad name!' }).code === 400, 'API: bad value / unknown switch / supplyWatch per character / bad name = 400');
  check(fs.existsSync(path.join(DATA, 'history')) && fs.readdirSync(path.join(DATA, 'history')).some(f => /^party_auto_/.test(f)), 'API: a history copy before each overwrite');
  check(!fs.existsSync(F + '.lock'), 'API: the lock is released');
  check(/partyauto\tsave/.test(fs.readFileSync(path.join(LOGS, 'dashboard_commands.log'), 'utf8')), 'API: one line per save in dashboard_commands.log');
  delete process.env.SWARM_PARTYAUTO_FILE;
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { }

  // ---- 6) SUPPLYAMT 2026-10-14 ----------------------------------------------------------------------------------------------
  { const A = P.pautoAmounts, B = API.BUILTIN;
    const J = { default: { amounts: { 20: { soulshots: 4000 } } }, parties: { Tank1: { amounts: { 1: { soulshots: 800, mana: 0 }, 20: { mana: 300, soe: '' } } } } };
    const a1 = A(J, 'Tank1', 12, B), a2 = A(J, 'Tank1', 25, B), a3 = A(J, 'Destroyer3', 25, B), a4 = A({}, 'Tank1', 80, B);
    check(a1.band === 1 && a1.soulshots === 800 && a1.mana === 0 && a1.src.mana === 'party' && a1.spiritshots === B.spiritshots && a1.src.spiritshots === 'builtin', 'amounts: the party row of my level; 0 = buy none; empty = built-in');
    check(a2.band === 20 && a2.mana === 300 && a2.soulshots === 4000 && a2.src.soulshots === 'default' && a2.soe === B.soe, 'amounts: party > all parties > built-in, "" = not set');
    check(a3.soulshots === 4000 && a3.mana === B.mana && a4.band === 76 && a4.soulshots === 10000 && a4.mana === 2000, 'amounts: a party without its own uses all parties / built-in; no file = today\'s amounts');
    check(P.PAUTO_BANDS.join() === API.BANDS.join() && P.PAUTO_AMT_KEYS.join() === API.AMT_KEYS.join(), 'amounts: swarm.js and the API know the same bands and items');
    let same = true; [{}, J, { parties: { Tank1: { amounts: 'x' } } }, { default: { amounts: { 40: { sor: -1, soe: 'a' } } } }].forEach(f => ['Tank1', 'Destroyer3'].forEach(L => [1, 19, 20, 39, 40, 52, 61, 75, 76, 85].forEach(lv => { if (JSON.stringify(A(f, L, lv, B)) !== JSON.stringify(API.pautoAmounts(f, L, lv, B))) same = false; })));
    check(same, 'amounts: the bot and the dashboard give the same answer (matrix)');
    const cfgB = src.match(/supply: \{[\s\S]*?shotsFighter: (\d+), shotsMage: (\d+)[\s\S]*?soe: (\d+), sor: (\d+)|soe: (\d+), sor: (\d+),[\s\S]*?shotsFighter: (\d+), shotsMage: (\d+)[\s\S]*?manaPotions: (\d+)/);
    check(cfgB && Number(cfgB[5]) === B.soe && Number(cfgB[6]) === B.sor && Number(cfgB[7]) === B.soulshots && Number(cfgB[8]) === B.spiritshots && Number(cfgB[9]) === B.mana, 'amounts: the dashboard\'s "standard" numbers = swarm.js CONFIG.lead.supply');
    const sw = fnSrc('function supplyWants()');
    check(/A = supplyAmounts\(\)/.test(sw) && /want: A\.soe/.test(sw) && /want: A\.sor/.test(sw) && /A\.spiritshots : A\.soulshots/.test(sw) && /want: A\.mana/.test(sw) && /A\.healing/.test(sw) && !/S\.shotsFighter|S\.manaPotions \|\|/.test(sw), 'supplyWants takes every amount from the party settings');
    const L586 = src.slice(src.indexOf('keep my own scrolls') - 400, src.indexOf('keep my own scrolls') + 400);
    check(/supplyAmounts\(\)\.soe/.test(L586) && !/CONFIG\.lead\.supply\.soe/.test(L586), 'the leader keeps his own amounts when he gives from stock');
    // supplyWants on stubs: a level-12 fighter with a party table
    const W = world({ me: 'Bishop1', leader: 'Tank1' }); W.put({ parties: { Tank1: { amounts: { 1: { soulshots: 800, mana: 50, healing: 20, soe: 2, sor: 0 } } } } }); W.t += 6000;
    Object.assign(W.env, { num: Number, Me: { Name: 'Bishop1', Level: 12 }, CONFIG: { leader: 'Tank1', lead: { supply: { soe: 5, sor: 3, shotsFighter: 10000, shotsMage: 5000, shotsBelow: 2000, manaPotions: 2000, manaPotionsBelow: 500 } } },
      PSHOP_ALT: { 3947: 2509, 3948: 2510, 3949: 2511, 3950: 2512, 3951: 2513, 3952: 2514 },   // PSHOP-2026-10-15 (supplyWants counts plain spiritshots)
      shotId: () => 1835, shotKind: () => 'fighter', weaponGrade: () => 'NG', myAmmo: () => null, OWNTYPE: { helvetia: [] }, teamNames: () => ['Tank1'],
      deathPenaltyLevel: () => 0, recoveryScroll: () => ({ id: 8594, name: 'Scroll: Recovery (No Grade)' }), state: { role: 'bishop' }, itemCount: (id) => ({ 1835: 100, 728: 0 })[id] || 0 });
    const H2 = new Function('env', 'with (env) {\n' + HOST + '\n' + sw + '\n' + fnSrc('function supplyNeeds()') + '\nreturn { supplyWants, supplyNeeds }; }')(W.env);
    const ws = H2.supplyNeeds(), g = (id) => ws.find(w => w.id === id) || {};
    check(g(1835).want === 800 && g(1835).need === 700 && g(728).want === 50 && g(728).need === 50 && g(1061).want === 20 && g(736).want === 2 && g(737).need === 0, 'supplyWants (stubs): a level-12 member asks for the party\'s low-level amounts (800 shots, 50 mana pots, no res scrolls)',
      JSON.stringify(ws.map(w => [w.id, w.want, w.need])));
    // ORE 2026-10-14: a character whose skills eat Spirit Ore buys it (built-in 300 or the table); one without such a skill does not
    check(!g(3031).id, 'Spirit Ore: a character without a skill that eats it buys none');
    W.env.isHealerRole = () => true;   // OREUSE-2026-10-15: only a healer's heals count
    W.env.SkillsList = { forEach: (f) => [{ Id: 1401, Name: 'Major Heal', ItemConsumeId: 3031, ItemConsumeCount: 1, IsActive: true }].forEach(f) };
    const ws2 = H2.supplyNeeds(), o2 = ws2.find(w => w.id === 3031) || {};
    check(o2.want === 300 && o2.need === 300, 'Spirit Ore: a bishop with Major Heal asks for the built-in 300', JSON.stringify(o2));
    W.put({ parties: { Tank1: { amounts: { 1: { ore: 40 } } } } }); W.t += 6000;
    const o3 = (H2.supplyNeeds().find(w => w.id === 3031) || {});
    check(o3.want === 40, 'Spirit Ore: the party table wins (40)', JSON.stringify(o3));
    { const hk = src.slice(src.indexOf('function hsKnownNow()'), src.indexOf('function hsKnownNow()') + 1500);
      check((hk.includes('hasItem = !item || itemCount(item) >= itemN') || hk.includes('hasItem = !item || oreHave(item, itemN)')) && hk.includes('ready: !!sk.IsReady && num(Me.MP) >= mp && hasItem'), 'heals: a heal without its Spirit Ore is not ready -> the next best heal is picked'); }
    // API
    const TMP2 = fs.mkdtempSync(path.join(os.tmpdir(), 'pamt_')), F2 = path.join(TMP2, 'party_auto.json'); process.env.SWARM_PARTYAUTO_FILE = F2;
    const ctx2 = { DATA: TMP2, LOGS: TMP2, ROOT, readJson: () => null, readStates: () => ({}), teamMap: () => ({}), mainLeader: 'Tank1' };
    fs.writeFileSync(F2, JSON.stringify({ v: 1, default: { sell: false }, parties: { Tank1: { sell: true } } }));
    const p1 = API.post(ctx2, { party: 'Tank1', values: {}, amounts: { 1: { soulshots: 800, mana: 0, healing: '' }, 20: { soe: null } } });
    const g1 = JSON.parse(fs.readFileSync(F2, 'utf8'));
    check(p1.ok && g1.parties.Tank1.sell === true && JSON.stringify(g1.parties.Tank1.amounts) === '{"1":{"soulshots":800,"mana":0}}', 'API: the party table is saved (empty cells dropped), its switches kept');
    check(API.post(ctx2, { party: 'Tank1', amounts: { 1: { soulshots: -5 } } }).code === 400 && API.post(ctx2, { party: 'Tank1', amounts: { 7: { soe: 1 } } }).code === 400
      && API.post(ctx2, { party: 'Tank1', amounts: { 1: { unicorns: 1 } } }).code === 400 && API.post(ctx2, { party: 'Tank1', amounts: { 1: { soe: 2.5 } } }).code === 400 && API.post(ctx2, { party: 'Tank1', amounts: { 1: { soe: 1e9 } } }).code === 400 && API.post(ctx2, { party: 'Tank1', amounts: { 1: { soulshots: 1e9 } } }).code !== 400, 'API: negative / unknown band / unknown item / not whole / too big = 400; shots have no limit (owner 2026-10-22)');
    const p2 = API.post(ctx2, { party: 'Tank1', defaultAmounts: { 40: { mana: 1000 } } }), g2 = JSON.parse(fs.readFileSync(F2, 'utf8'));
    check(p2.ok && g2.default.amounts['40'].mana === 1000 && g2.default.sell === false && g2.parties.Tank1.amounts, 'API: "also for every party" writes default.amounts, keeps the rest');
    const p3 = API.post(ctx2, { party: 'Tank1', amounts: null }), g3 = JSON.parse(fs.readFileSync(F2, 'utf8'));
    check(p3.ok && !g3.parties.Tank1.amounts && g3.parties.Tank1.sell === true, 'API: null removes the party table (back to all parties / standard)');
    const inf = API.info(ctx2);
    check(inf.amounts && inf.amounts.bands.length === 6 && inf.amounts.keys.length === 8 && inf.amounts.builtin.soulshots === 10000 && inf.amounts.builtin.ore === 300 && inf.amounts.builtin.arrows === 5000   /* ARROWS-2026-10-25 */ && inf.amounts.suggest[1].soulshots < inf.amounts.suggest[76].soulshots, 'API GET: bands, items, standard + suggested amounts for the page');
    delete process.env.SWARM_PARTYAUTO_FILE; try { fs.rmSync(TMP2, { recursive: true, force: true }); } catch (e) { }
  }

  // owner's live file + release seed
  const LIVEF = path.join(ROOT, 'Scripts', 'data', 'party_auto.json');
  if (fs.existsSync(LIVEF)) {
    const live = JSON.parse(fs.readFileSync(LIVEF, 'utf8')), cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'swarm.config.json'), 'utf8').replace(/^\uFEFF/, ''));
    const leaders = [...new Set((cfg.accounts || []).filter(a => a && a.character && a.party).map(a => a.party))];
    // owner 2026-10-21: parties with supply watch / selling / symbols OFF are ON PURPOSE (they survive without supplies and level fast),
    // so this checks the owner's file is valid (every party resolves every switch to on/off), not that the switches are ON
    const bad = leaders.filter(L => !Object.keys(P.PAUTO_KINDS).every(k => typeof E(live, k, L, L).on === 'boolean'));
    check(!bad.length, `owner install: the live party_auto.json resolves every switch for all ${leaders.length} parties of swarm.config.json`, bad.join(', '));
  } else check(true, 'owner live file not present (public install): everything OFF');
  const RBF = path.join(ROOT, 'docs', 'plan', 'tools', 'release_build.js'), RB = fs.existsSync(RBF) ? fs.readFileSync(RBF, 'utf8') : null;   // PKGSKIP: the public package has no release_build.js
  if (RB === null) check(true, 'release seed: skipped (no release_build.js in a public install)'); else check(/'party_auto\.json'\]/.test(RB) && /case 'party_auto\.json': \{ const out = \{ _about: o\._about, v: 1, default: \{ supplyWatch: false, sell: false, dyes: false \}, parties: \{\}, chars: \{\} \}/.test(RB), 'release_build: party_auto.json ships as an example with everything OFF (no parties / characters)');

  console.log(`\n${n - fails} passed, ${fails} failed`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
