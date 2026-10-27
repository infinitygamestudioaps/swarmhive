// OFFLINE TEST of the three OPTIONAL switches of 2026-10-26 (owner: "Add the last 3 as optional i dont want them to affect the system").
// Each switch: the DEFAULT changes nothing, and the switch does what it says. Never touches the game, MCP or the live files (scratch files).
//   node docs/plan/tools/test_optional_1026.js     (exit 1 on a failure; SWARM_JS=<file> tests another copy of swarm.js)
//  F1 SHOTSOUTOPT  party_auto.json shotsOutRun (default ON = the SHOTSOUT-2026-10-22 run as today; OFF + supply watch off = no shots-out run)
//  F2 OLDGEAR      gear_auto.json oldGear per grade / enchanted / special = keep (default, KEEPOLD) | collector; never 'sell'
//  F3 HANDSOFF     run_state.json handsOff.<name> (default OFF): Hive leaves the character alone, its party does not count it
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const ROOT = path.join(__dirname, '..', '..', '..');
const src = fs.readFileSync(process.env.SWARM_JS || path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
const D = (f) => fs.readFileSync(path.join(ROOT, 'Dashboard', f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('ok   ' + m); } else { fail++; console.log('FAIL ' + m); } };
const blk = (b, e) => { const i = src.indexOf(b), j = src.indexOf(e, i + 1); if (i < 0 || j < i) throw new Error('block not found: ' + b); return src.slice(i, j); };
const fnSrc = (head) => { const i = src.indexOf(head); if (i < 0) throw new Error(head + ' not found'); const j = src.indexOf('\n}\n', i); return src.slice(i, j + 3); };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'opt1026-'));

// =================================================================================================================== F1 SHOTSOUTOPT
{
  const PA = new Function(blk('// PARTYAUTO-PURE-BEGIN', '// PARTYAUTO-PURE-END') + '\nreturn { PAUTO_KINDS, pautoEffective };')();
  const API = require(path.join(ROOT, 'Dashboard', 'partyauto_api.js'));
  ok(PA.PAUTO_KINDS.shotsOutRun && PA.PAUTO_KINDS.shotsOutRun.def === true && PA.PAUTO_KINDS.shotsOutRun.char === false, 'F1 swarm.js: shotsOutRun is a party switch, default ON');
  const K = API.KINDS.find(k => k.key === 'shotsOutRun');
  ok(K && K.def === true && !K.char && !K.group, 'F1 API: shotsOutRun in the Supplies section, default ON');
  ok(Object.keys(PA.PAUTO_KINDS).join() === API.KEYS.join(), 'F1 swarm.js and the API know the same switches (same order)');
  ok(PA.pautoEffective({}, 'shotsOutRun', 'Tank1', 'Tank1').on === true && API.pautoEffective({ default: { supplyWatch: false, sell: false, dyes: false } }, 'shotsOutRun', 'Tank1', 'Tank1').on === true, 'F1 DEFAULT: no file / the public seed = ON (today\'s shots-out run)');
  ok(PA.pautoEffective({ parties: { Tank1: { shotsOutRun: false } } }, 'shotsOutRun', 'Tank1', 'Tank1').on === false && PA.pautoEffective({ default: { shotsOutRun: false } }, 'shotsOutRun', 'X', 'X').on === false, 'F1 a party / all-parties OFF is read');
  const a1 = API.applyChange({}, { party: 'Tank1', values: { shotsOutRun: false } }), a2 = API.applyChange({}, { party: 'Tank1', chars: { Bishop1: { shotsOutRun: false } } }), a3 = API.applyChange({}, { party: 'Tank1', values: { shotsOutRun: 'no' } });
  ok(a1.ok && a1.data.parties.Tank1.shotsOutRun === false && !a2.ok && !a3.ok, 'F1 API validation: party true / false / null only, no character switch');
  // the real supply watch on stubs (the interval of swarm.js) with critical / non-critical shortages
  const HOST = blk('// PARTYAUTO-PURE-BEGIN', '// PARTYAUTO-HOST-END');
  const WATCH = blk('/** SHOTSOUTOPT-2026-10-26: shots really ran out', '// Leader: someone reached a class-change level');
  const HT = blk('// HUNTTIMER-PURE-BEGIN', '// HUNTTIMER-PURE-END');
  const run = (file, low) => {
    const W = { t: 1760360000000, notes: [], said: [], calls: [], files: {} };
    if (file) W.files['C:\\L2\\Scripts\\data\\party_auto.json'] = { text: JSON.stringify(file), stamp: 's1' };
    const intervals = [];
    const env = { File: { Exists: (f) => !!W.files[f], ReadAllText: (f) => W.files[f].text }, __DIR__: 'C:\\L2', now: () => W.t, fileStamp: (f) => (W.files[f] ? W.files[f].stamp : ''),
      Me: { Name: 'Tank1', IsDead: false }, CONFIG: { leader: 'Tank1', lead: { unload: { above: 70 } }, stash: { on: false, auto: false, above: 100 } }, teamOf: (x) => 'Tank1',
      note: (m, s) => { W.notes.push(m); if (s) W.said.push(m); }, setInterval: (fn) => intervals.push(fn), leadMode: () => true, state: { role: 'sk', mode: 'level' }, isLeader: () => true,
      IsCharacterReady: () => true, leadPaused: () => false, nonstopOn: () => false, htHolds: () => false, rcHolds: () => false, supplyDue: () => true, lastSupplyAtGet: () => 0, leadRunBusy: false,
      regroupRun: null, inRaid: () => false, scoutCtl: { on: false }, outranked: () => false, PRIO: { ORDER: 4 }, supplyLow: { what: low }, teamNames: () => [], livePos: {}, num: Number,
      Inventory: { Count: 10 }, globalThis: {}, runAuto: () => true, rcSupplyAsk: () => W.calls.push('rcSupplyAsk'), leadSupply: (why) => { W.calls.push('leadSupply ' + why); return Promise.resolve(); },
      logError: (w, e) => W.calls.push('ERR ' + w + ' ' + e.message), SayToParty: (m) => W.said.push(m), PartyList: { forEach() { }, Count: 0 }, classPlanOf: () => ({}), CP_STATUS: {} };
    new Function('env', 'with (env) {\n' + HT + '\n' + HOST + '\n' + WATCH + '\n}')(env);
    intervals[0]();
    return W;
  };
  const out = 'Soulshot (No Grade) 5', lowOnly = 'SoE 0/5';
  const d0 = run({ parties: { Tank1: { supplyWatch: false } } }, out), d1 = run({ parties: { Tank1: { supplyWatch: false, shotsOutRun: true } } }, out);
  ok(d0.calls.some(c => /^leadSupply/.test(c)) && d0.notes.some(m => /although the party's supply switch is off/.test(m)), 'F1 DEFAULT (no shotsOutRun key): shots out + supply watch off = the supply run goes (SHOTSOUT as today)');
  ok(JSON.stringify(d0.calls) === JSON.stringify(d1.calls) && JSON.stringify(d0.notes) === JSON.stringify(d1.notes), 'F1 DEFAULT = shotsOutRun true exactly (same calls, same notes)');
  ok(run(null, out).calls.some(c => /^leadSupply/.test(c)), 'F1 DEFAULT: no party_auto.json at all = the shots-out run goes (as today)');
  const off = run({ parties: { Tank1: { supplyWatch: false, shotsOutRun: false } } }, out);
  ok(!off.calls.some(c => /leadSupply/.test(c)) && off.notes.some(m => /NO supply run/.test(m)) && off.said.some(m => /Supply run when shots run out/.test(m)), 'F1 switch OFF + supply watch off: NO supply run, said why (note + party chat)');
  const k = off.notes.length; off.calls.length = 0;
  ok(run({ default: { shotsOutRun: false }, parties: { Tank1: { supplyWatch: false } } }, out).calls.every(c => !/leadSupply/.test(c)), 'F1 the all-parties OFF counts too');
  ok(run({ parties: { Tank1: { supplyWatch: true, shotsOutRun: false } } }, out).calls.some(c => /^leadSupply/.test(c)), 'F1 switch OFF but supply watch ON: the normal supply run still goes');
  ok(!run({ parties: { Tank1: { supplyWatch: false, shotsOutRun: true } } }, lowOnly).calls.some(c => /leadSupply/.test(c)), 'F1 not critical (SoE only) + supply watch off: no run (unchanged)');
  ok(k > 0, 'F1 (said once)');
  // the party settings page
  const PS = D('partysettings.js');
  ok(/key: 'shotsOutRun', char: false, def: true/.test(PS) && /k\.key !== 'shotsOutRun' && paParty\(k\.key\)/.test(PS) && /Only shots that really ran out still start a run/.test(PS), 'F1 UI: Supplies card switch (default on, not in the summary), the supply-watch line says what still happens');
}

// =================================================================================================================== F2 OLDGEAR
{
  const GG = new Function(blk('// GEARGUARD-BEGIN', '// GEARGUARD-END') + '\nreturn { OLDGEAR, ogNorm, ogAllKeep, ogDecide, ogIsSpecial, ogGradeKey, ggPolicy, sgIsStarter };')();
  const API = require(path.join(ROOT, 'Dashboard', 'gearauto_api.js'));
  ok(GG.OLDGEAR.keys.join() === API.OLDGEAR_KEYS.join() && GG.OLDGEAR.modes.join() === 'keep,collector' && API.OLDGEAR_MODES.join() === 'keep,collector', 'F2 keys NONE D C B A S enchanted special, modes keep | collector (no sell) — bot = API');
  const n0 = GG.ogNorm(null);
  ok(GG.ogAllKeep(n0) && GG.OLDGEAR.keys.every(k => n0[k] === 'keep') && GG.ggPolicy({}, 'X', 'X').oldGear && GG.ogAllKeep(GG.ggPolicy({}, 'X', 'X').oldGear), 'F2 DEFAULT: no oldGear = every key keep (= KEEPOLD today)');
  const live = JSON.parse(fs.readFileSync(path.join(ROOT, 'Scripts', 'data', 'gear_auto.json'), 'utf8').replace(/^\uFEFF/, ''));
  ok(GG.ogAllKeep(GG.ogNorm(live)) && API.oldGearOf(live).C === 'keep', 'F2 DEFAULT: the owner\'s gear_auto.json keeps everything');
  ok(GG.ogNorm({ oldGear: { C: 'sell', D: 'destroy', B: 'collector' } }).C === 'keep' && GG.ogNorm({ oldGear: { C: 'sell' } }).D === 'keep' && GG.ogNorm({ oldGear: { B: 'collector' } }).B === 'collector', 'F2 a "sell" / unknown value in the file = keep (never sold)');
  const cfg = GG.ogNorm({ oldGear: { C: 'collector', enchanted: 'collector' } });
  const C1 = { n: 'Sword of Revolution', g: 'C', s: 'weapon' }, Csa = { n: 'Sword of Revolution - Guidance', g: 'C', s: 'weapon' }, D1 = { n: 'Brigandine', g: 'D', s: 'chest' }, sq = { n: "Squire's Sword", g: 'NONE', s: 'weapon' }, S80 = { n: 'Dynasty Sword', g: 'S80', s: 'weapon' };
  ok(GG.ogDecide(cfg, { info: C1 }).to === 'collector' && GG.ogDecide(cfg, { info: D1 }).to === 'keep', 'F2 per grade: C collector, D keep');
  ok(GG.ogDecide(cfg, { info: C1, enchant: 3 }).to === 'collector' && GG.ogDecide(GG.ogNorm({ oldGear: { C: 'collector' } }), { info: C1, enchant: 3 }).to === 'keep', 'F2 an enchanted piece follows "enchanted" (not its grade)');
  ok(GG.ogDecide(cfg, { info: Csa }).to === 'keep' && GG.ogDecide(GG.ogNorm({ oldGear: { special: 'collector' } }), { info: Csa }).to === 'collector', 'F2 an S.A. piece follows "special" (SAJUNK name check)');
  ok(GG.ogDecide(GG.ogNorm({ oldGear: { special: 'collector' } }), { info: Csa, enchant: 2 }).to === 'keep' && GG.ogDecide(GG.ogNorm({ oldGear: { special: 'collector', enchanted: 'collector' } }), { info: Csa, enchant: 2 }).to === 'collector', 'F2 enchanted + S.A. = both must say collector');
  ok(GG.ogDecide(GG.ogNorm({ oldGear: { NONE: 'collector' } }), { info: sq }).to === 'keep', 'F2 a starter piece follows "replaced starter gear", never this');
  ok(GG.ogDecide(cfg, { info: C1, quest: true }).to === 'keep' && GG.ogDecide(cfg, { info: C1, prot: true }).to === 'keep' && GG.ogDecide(cfg, { info: null }).to === 'keep', 'F2 quest / protected / unknown items stay');
  ok(GG.ogGradeKey(S80) === 'S' && !GG.ogIsSpecial({ n: 'Common Item - Sword of Revolution' }), 'F2 S80 / S84 = S; a Common Item is no S.A.');
  // the host part: oldGearGive with stubs (the hand-over machinery is stubbed: it moves the pieces out of the bag)
  const GIVE = fnSrc('async function oldGearGive(');
  const host = (o) => {
    const W = Object.assign({ cfg: n0, col: 'Dagger1', rv: { name: 'Dagger1', town: 'Giran', busy: '', dead: false }, town: 'Giran', files: {}, hov: [], said: [] }, o || {});
    W.bag = [{ objId: 11, Id: 1, Name: 'Sword of Revolution', IsEquiped: false }, { objId: 12, Id: 2, Name: 'Brigandine', IsEquiped: false }, { objId: 13, Id: 3, Name: "Squire's Sword", IsEquiped: false }];
    const env = { gearPolicy: () => ({ oldGear: W.cfg }), ogAllKeep: GG.ogAllKeep, ogDecide: GG.ogDecide, gearDb: () => ({ items: { 1: C1, 2: D1, 3: sq } }), stashJobKeep: () => new Set(),
      Inventory: { forEach: (f) => W.bag.slice().forEach(f) }, enchLevelOf: () => 0, qeProtected: () => false, num: Number, fundCollectorName: () => W.col, Me: { Name: 'Bishop1' },
      hovWhere: async () => W.rv, currentTownKey: () => W.town, File: { WriteAllText: (f, t) => { W.files[f] = t; } }, HOV_DIR: 'H', HOV_CFG: { batch: 8 }, App: { emit: () => { } },
      hovCommand: (p) => { W.hov.push(p[1]); const o = JSON.parse(W.files['H\\' + p[1] + '.json']); const ids = o.givers.Bishop1.items.map(r => r.objId); W.bag = W.bag.filter(b => !ids.includes(b.objId)); },
      hovBag: () => W.bag.map(b => ({ objId: b.objId })), now: () => 0, sleep: async () => { }, logError: () => { }, appendShared: () => { }, SWARM_ROOT: 'R' };
    const names = Object.keys(env);
    W.fn = new Function(...names, GIVE + '\nreturn oldGearGive;')(...names.map(k => env[k]));
    return W;
  };
  const rows = [{ objId: 11, id: 1, name: 'Sword of Revolution', count: 1, stack: false }, { objId: 12, id: 2, name: 'Brigandine', count: 1, stack: false }, { objId: 13, id: 3, name: "Squire's Sword", count: 1, stack: false }];
  (async () => {
    const W0 = host(), r0 = await W0.fn(rows, 'upgrade x', (m) => W0.said.push(m), 1000);
    ok(r0.given.length === 0 && r0.kept.length === 3 && r0.msg === '' && !W0.hov.length && !W0.said.length && W0.bag.length === 3, 'F2 DEFAULT host: every piece stays, no hand-over, no note');
    const W1 = host({ cfg: GG.ogNorm({ oldGear: { C: 'collector', NONE: 'collector' } }) }), r1 = await W1.fn(rows, 'upgrade x', (m) => W1.said.push(m), 1000);
    ok(r1.given.map(r => r.objId).join() === '11' && W1.hov.length === 1 && /^ogr_dagger1_/.test(W1.hov[0]) && W1.bag.map(b => b.objId).join() === '12,13' && /given to the collector Dagger1/.test(r1.msg), 'F2 C = collector: the C piece is handed to the collector (D and the starter piece stay)');
    const order = JSON.parse(W1.files['H\\' + W1.hov[0] + '.json']);
    ok(order.receiver === 'Dagger1' && order.givers.Bishop1.items.length === 1 && order.givers.Bishop1.adena === 0, 'F2 the hand-over order: receiver = the collector, only that piece, no adena');
    for (const [o, why] of [[{ col: '' }, 'no collector'], [{ rv: null }, 'does not answer'], [{ rv: { name: 'Dagger1', town: 'Giran', busy: 'in a raid' } }, 'busy'], [{ rv: { name: 'Dagger1', town: 'Dion', busy: '' } }, 'not in my town'], [{ col: 'Bishop1' }, 'I am the collector']]) {
      const W = host(Object.assign({ cfg: GG.ogNorm({ oldGear: { C: 'collector' } }) }, o)), r = await W.fn(rows, 'x', (m) => W.said.push(m), 1000);
      ok(!r.given.length && r.kept.length === 3 && !W.hov.length && W.said.some(m => new RegExp(why).test(m)), `F2 collector ${why}: kept in the bag, said why`);
    }
    // the call sites
    ok(/const UPGRADE_GIVE_REPLACED = false;/.test(src) && /if \(replaced\.length && col && col !== me && UPGRADE_GIVE_REPLACED\) \{/.test(src), 'F2 KEEPOLD owner rule untouched (UPGRADE_GIVE_REPLACED false)');
    const up = fnSrc('async function upgradeRun(');
    ok(/oldGearGive\(replaced, 'upgrade ' \+ id/.test(up) && /\$\{stayR\.length\} replaced piece\(s\) stay in my bag: \$\{stayR\.map\(r => r\.name\)/.test(up), 'F2 upgradeRun: the old-gear choice, else the same "stay in my bag" line as before');
    const gu = fnSrc('async function gearUpgrade(');
    ok(/const ogWorn0 = ijWornNow\(\);/.test(gu) && (gu.match(/oldGearAfter\(ogWorn0, why\)/g) || []).length === 2 && /if \(!GP\.auto && !\/\^!\/\.test/.test(gu), 'F2 gearUpgrade: the same choice after a gear-up (auto gear upgrades stay OFF)');
    const ga = fnSrc('async function oldGearAfter(');
    ok(/if \(!cfg \|\| ogAllKeep\(cfg\) \|\| !worn0 \|\| !worn0\.size\) return '';/.test(ga) && !/sellAt|sellPacket|destroy/i.test(GIVE + ga), 'F2 default = nothing at all; no sell / destroy call in the old-gear code');
    // the API on a scratch file
    const F = path.join(tmp, 'gear_auto.json'); fs.writeFileSync(F, JSON.stringify({ default: false, starterGear: 'keep' }));
    process.env.SWARM_GEARAUTO_FILE = F;
    const ctx = { DATA: tmp, ROOT, LOGS: tmp };
    ok(API.info(ctx).oldGear && GG.ogAllKeep(API.info(ctx).oldGear), 'F2 API DEFAULT: info says every key keep');
    const p1 = API.post(ctx, { scope: 'policy', oldGear: { C: 'collector' } }), f1 = JSON.parse(fs.readFileSync(F, 'utf8'));
    ok(p1.code === 200 && f1.oldGear && f1.oldGear.C === 'collector' && Object.keys(f1.oldGear).length === 1 && f1.starterGear === 'keep', 'F2 API: C = collector saved (only the non-keep keys), starterGear untouched');
    ok(API.post(ctx, { scope: 'policy', oldGear: { C: 'sell' } }).code === 400 && /never sell/.test(API.post(ctx, { scope: 'policy', oldGear: { C: 'sell' } }).error), 'F2 API: "sell" is refused (never sell)');
    ok(API.post(ctx, { scope: 'policy', oldGear: { X: 'keep' } }).code === 400 && API.post(ctx, { scope: 'policy', oldGear: 'collector' }).code === 400, 'F2 API: unknown key / not a table refused');
    API.post(ctx, { scope: 'policy', oldGear: { C: 'keep' } });
    ok(JSON.parse(fs.readFileSync(F, 'utf8')).oldGear === undefined, 'F2 API: back to all keep = no oldGear in the file (as before)');
    delete process.env.SWARM_GEARAUTO_FILE;
    const GP = D('gearpage.js');
    ok(/data-gpoldgear=/.test(GP) && /A\.oldGear \?/.test(GP) && /scope: 'policy', oldGear: \{ \[k\]: v \}/.test(GP) && /never sold/.test(GP), 'F2 UI: Gear page selects next to "replaced starter gear" (only with a server that sends oldGear), keep | collector');
    f3();
  })().catch(e => { fail++; console.log('FAIL F2 host test crashed: ' + e.stack); f3(); });
}

// =================================================================================================================== F3 HANDSOFF
function f3() {
  const P = new Function(blk('// RUNSTATE-PURE-BEGIN', '// RUNSTATE-PURE-END') + '\nreturn { runNorm, runEffective, runHandsOff };')();
  // the runEffective of before 2026-10-26 (copied): without a handsOff entry the new one must give exactly the same answers
  function origEffective(j, me, leader) {
    const J = P.runNorm(j), p = J.parties[leader], c = me !== leader ? J.chars[me] : null;
    const pOn = p && typeof p.on === 'boolean' ? p.on : J.default;
    if (c && typeof c.on === 'boolean') return { on: c.on, held: c.on === false, partyOn: pOn, src: 'char', at: c.at || null, by: c.by || '', why: c.why || '' };
    return { on: pOn, held: false, partyOn: pOn, src: p && typeof p.on === 'boolean' ? 'party' : 'default', at: p ? p.at || null : null, by: p ? p.by || '' : '', why: p ? p.why || '' : '' };
  }
  const files = [{}, null, { parties: { Tank1: { on: true } } }, { parties: { Tank1: { on: true } }, chars: { Bishop1: { on: false } } }, { default: true, chars: { Solo: { on: true } } }, { handsOff: {} }, { handsOff: { Other: { on: false } } }];
  let same = true; files.forEach(f => ['Tank1', 'Bishop1', 'Solo', 'Necro1'].forEach(me => { if (JSON.stringify(P.runEffective(f, me, 'Tank1')) !== JSON.stringify(origEffective(f, me, 'Tank1'))) same = false; }));
  ok(same, 'F3 DEFAULT: without a hands-off entry runEffective answers exactly as before (matrix)');
  const J = { parties: { Tank1: { on: true } }, handsOff: { Bishop1: { on: true, at: 'x', by: 'dashboard' }, Tank1: { on: true } } };
  const b = P.runEffective(J, 'Bishop1', 'Tank1'), l = P.runEffective(J, 'Tank1', 'Tank1');
  ok(b.on === false && b.held === true && b.handsOff === true && l.on === false && l.held === false && l.handsOff === true, 'F3 hands off: OFF for itself; a member counts as held (benched), a leader is never "held"');
  ok(!P.runHandsOff({ handsOff: { Bishop1: { on: 'yes' } } }, 'Bishop1') && !P.runHandsOff({ handsOff: [] }, 'Bishop1'), 'F3 only a literal on: true counts');
  const RA = require(path.join(ROOT, 'Dashboard', 'runstate_api.js'));
  let sameApi = true; files.concat([J]).forEach(f => ['Tank1', 'Bishop1', 'Necro1'].forEach(me => { if (JSON.stringify(P.runEffective(f, me, 'Tank1')) !== JSON.stringify(RA.runEffective(f, me, 'Tank1'))) sameApi = false; }));
  ok(sameApi, 'F3 the dashboard API gives the bot\'s answers (matrix incl. hands off)');
  // the host part (RUNSTATE block) on an in-memory file + virtual clock
  const HOST = blk('// RUNSTATE-PURE-BEGIN', '\n// ---------------------------------------------------------------------------\n// LEADER CONTROL');
  const world = (o) => {
    const W = Object.assign({ t: 1760360000000, files: {}, notes: [], said: [], calls: [], intervals: [], me: 'Bishop1', leader: 'Tank1' }, o || {});
    const File = { Exists: (f) => !!W.files[f], ReadAllText: (f) => W.files[f].text, WriteAllText: (f, t) => { W.files[f] = { text: String(t), stamp: String(++W.t) }; } };
    const env = { HOFF: { at: 0, on: false }, File, __DIR__: 'C:\\L2', now: () => W.t, fileStamp: (f) => (W.files[f] ? W.files[f].stamp : ''), Me: { Name: W.me }, CONFIG: { leader: W.leader, roster: {} },
      isLeader: () => W.me === W.leader, teamNames: () => [], teamOf: () => W.leader, note: (m, s) => { W.notes.push(m); if (s) W.said.push(m); }, logError: (w, e) => W.notes.push('ERR ' + e.message),
      setInterval: (fn) => { W.intervals.push(fn); }, state: { role: 'x' }, IsCharacterReady: () => true, inRaid: () => false, autoLvl: { active: !!W.leveling, stop: false }, raidHunt: { active: false, stop: false },
      daily: {}, RC: {}, rcOn: () => false, rcConfigOf: () => null, rcData: () => ({}), rcRunRead: () => ({}), rcRun: () => null, rcRunSave: () => { }, raidCircuitLoop: () => Promise.resolve(), sleep: () => Promise.resolve(),
      partySpotEntry: () => null, setLeadPaused: () => { }, leadLevel: () => Promise.resolve(), autoLevelLoop: () => Promise.resolve(), PartyList: { Count: 1 },
      Options: { ActiveFollow: true, FollowAtk: true, FollowName: '' }, followOk: () => true, memberRoute: { id: null }, IsEnabled: true, EnableBot: () => { },
      abortRegroup: (w) => W.calls.push('abortRegroup ' + w), stopCombatG: () => W.calls.push('stopCombat'), Send: { StopMove: () => W.calls.push('StopMove') }, isHealerRole: () => false, noMelee: () => false,
      pauseInfo: () => null, stashRules: () => (W.stash || {}), clanLeaderName: () => 'Dagger1', TOWN_CMD: { Giran: 'giran' }, leadPaused: () => false, takeControl: () => true, releaseControl: () => { }, PRIO: { ORDER: 4 } };
    const names = Object.keys(env);
    W.env = env;
    W.api = new Function(...names, HOST + '\nreturn { runData, runMine, runOn, runOnOrCollector, runAuto, runHeld, handsOffOf, handsOffMe, collectorOn, RUN_FILE, RUNST };')(...names.map(k => env[k]));
    W.put = (j) => { W.files[W.api.RUN_FILE()] = { text: JSON.stringify(j), stamp: String(++W.t) }; W.t += 3000; };
    W.tick = () => { W.t += 3000; W.intervals.forEach(f => f()); };
    return W;
  };
  { const W = world(); W.put({ parties: { Tank1: { on: true } } });
    ok(W.api.handsOffMe() === false && W.api.runAuto('leveling') === true && W.api.runOnOrCollector() === true, 'F3 DEFAULT host: no hands-off entry = the party switch decides (ON here)');
    W.tick(); ok(W.env.Options.ActiveFollow === true && W.env.Options.FollowAtk === true && !W.calls.length && !W.notes.some(m => /hands off/.test(m)), 'F3 DEFAULT host: the 3 s watch changes nothing'); }
  { const W = world({ leveling: true }); W.put({ parties: { Tank1: { on: true } }, handsOff: { Bishop1: { on: true } } });
    ok(W.api.handsOffMe() === true && W.api.runHeld('Bishop1') === true && W.api.runAuto('leveling') === false && W.api.runAuto('supply run') === false && W.api.runOnOrCollector() === false, 'F3 hands off: every automatic kind refused, held (benched) for its party');
    ok(W.notes.some(m => /hands off: no automatic leveling/.test(m)) && W.api.runAuto('order') === true, 'F3 ... said once; an order still passes');
    W.tick();
    ok(W.env.autoLvl.stop === true && W.env.Options.ActiveFollow === false && W.env.Options.FollowAtk === false && W.said.some(m => /leaves Bishop1 alone/.test(m)), 'F3 switched on: Hive lets go once (its leveling stops, its follow / assist off, said)');
    W.env.Options.ActiveFollow = true; W.calls.length = 0; W.tick();
    ok(W.env.Options.ActiveFollow === true && !W.calls.length, 'F3 ... then touches nothing (the player\'s own follow stays)');
    W.put({ parties: { Tank1: { on: true } } }); W.env.Options.ActiveFollow = false; W.tick();
    ok(W.api.handsOffMe() === false && W.env.Options.FollowAtk === true && W.env.Options.ActiveFollow === true && W.said.some(m => /hands off ended/.test(m)), 'F3 switched off: back with the party (follow + assist again)'); }
  { const W = world({ me: 'Dagger1', leader: 'Dagger1', stash: { collector: { on: true, name: 'Dagger1' } } }); W.put({ handsOff: { Dagger1: { on: true } } });
    ok(W.api.collectorOn() === false && W.api.runAuto('warehouse stash') === false, 'F3 a hands-off collector does no chores'); }
  // source checks of the central gates
  const g = (re, what) => ok(re.test(src), 'F3 gate: ' + what);
  g(/function benched\(n\) \{ return runHeld\(n\) \|\| handsOffOf\(n\) \|\|/, 'benched() = hands off too (not waited for)');
  g(/function teamNames\(\) \{[\s\S]{0,1200}HANDSOFF-2026-10-26: a teammate switched to hands off is not counted[\s\S]{0,400}\n  return names;\n\}/, 'teamNames() leaves hands-off teammates out (after both sources)');
  g(/function hiveSw\(\) \{\n  if \(handsOffMe\(\)\) return \{ skills: false, heals: false, potions: false \};/, 'hiveSw: no Hive skills / heals / potions');
  g(/function hiveOwnCombat\(\) \{ try \{ return !handsOffMe\(\) && /, 'hiveOwnCombat: Hive never starts L2Swarm combat for it');
  g(/if \(charName !== CONFIG\.leader && charName !== Me\.Name\) return;\n[\s\S]{0,500}if \(charName !== Me\.Name && cmd\.startsWith\('!'\) && handsOffMe\(\)\)/, 'handleSay: only orders sent to itself run');
  g(/if \(handsOffWatch\(\)\) return;/, 'the run-switch watch lets go once');
  g(/function requestBuffTurn\(reason, priority\) \{\n  if \(reason !== '!buff' && handsOffMe\(\)\) return;/, 'no automatic rebuff turn');
  g(/if \(handsOffMe\(\) && !\(HOV\.busy && HOV\.id === id\)\) return 'hands off \(dashboard\)';/, 'hand-overs: busy');
  g(/function reportAttacked\(atkId\) \{[\s\S]{0,200}if \(handsOffMe\(\)\) return;/, 'the party is not called to it');
  ok((src.match(/if \(handsOffMe\(\)\) return;/g) || []).length >= 6, 'F3 gate: self-defence / stop-calm / help / rest / watchdog / buff loops');
  // the App event gate (top of swarm.js): run the real block on a stub App
  const AG = blk('var HOFF = { at: 0', '\n// LEAK-2026-10-15');
  const appWorld = (opts) => {
    const subs = []; let ho = false; const T = { tradeState: null };
    const App = { on: (n, cb) => { if (opts && opts.throws) throw new Error('host'); subs.push({ n, cb }); return 'tok' + subs.length; }, off: () => true };
    const rawOn = App.on;
    const env = new Function('App', 'handsOffMe', 'T', 'with (T) {\n' + AG + '\nreturn { HOFF };\n}')(App, () => ho, T);
    return { App, rawOn, env, subs, set: (v) => { ho = v; }, T, emit: (n, d) => subs.filter(s => s.n === n).forEach(s => s.cb({ data: d })) };
  };
  { const A = appWorld(); const got = [];
    A.App.on('swarm.focus', (e) => got.push('focus')); A.App.on('swarm.pos', () => got.push('pos')); A.App.on('swarm.trade.added', () => got.push('trade'));
    ok(A.env.HOFF.gate === true && A.App.on !== A.rawOn, 'F3 App gate installed (the wrapped subscribe works)');
    A.emit('swarm.focus', {}); A.emit('swarm.pos', {}); A.emit('swarm.trade.added', {});
    ok(got.join() === 'focus,pos,trade', 'F3 DEFAULT: every event reaches its handler unchanged');
    A.set(true); got.length = 0; A.emit('swarm.focus', {}); A.emit('swarm.pos', {}); A.emit('swarm.trade.added', {});
    ok(got.join() === 'pos' && A.env.HOFF.dropped === 2, 'F3 hands off: party events dropped (focus, a trade call), positions still read');
    A.T.tradeState = { role: 'give' }; got.length = 0; A.emit('swarm.trade.added', {}); ok(got.join() === 'trade', 'F3 hands off: a trade it runs itself (your order) still gets its answers'); }
  { const A = appWorld({ throws: true }); ok(A.env.HOFF.gate === false && A.App.on === A.rawOn, 'F3 an engine where the wrapped subscribe fails keeps the raw App.on (no change)'); }
  // the API on a scratch file: the switch, never reset by Start / Stop / Start all
  const F = path.join(tmp, 'run_state.json'); fs.writeFileSync(F, JSON.stringify({ v: 1, default: false, parties: {}, chars: {} }));
  process.env.SWARM_RUNSTATE_FILE = F;
  const ctx = { DATA: tmp, ROOT, LOGS: tmp, readStates: () => [{ name: 'Tank1', party: 'Tank1' }, { name: 'Bishop1', party: 'Tank1' }], partyOf: (c) => c.party };
  (async () => {
    ok(JSON.stringify(RA.summary(ctx, ctx.readStates()).handsOff) === '{}', 'F3 API DEFAULT: nobody is hands off');
    const r1 = await RA.post(ctx, { char: 'Bishop1', handsOff: true, send: false });
    ok(r1.code === 200 && JSON.parse(fs.readFileSync(F, 'utf8')).handsOff.Bishop1.on === true && r1.state.handsOff.Bishop1 && !(r1.state.parties[0].held || []).includes('Bishop1'), 'F3 API: hands off ON written, shown apart from "stopped on its own"');
    await RA.post(ctx, { party: 'Tank1', on: true, send: false }); await RA.post(ctx, { all: true, on: false, send: false });
    ok(JSON.parse(fs.readFileSync(F, 'utf8')).handsOff.Bishop1.on === true, 'F3 API: a party Start / Stop all never resets it');
    ok((await RA.post(ctx, { char: 'Bishop1', handsOff: 'yes', send: false })).code === 400, 'F3 API: handsOff must be true / false');
    await RA.post(ctx, { char: 'Bishop1', handsOff: false, send: false });
    ok(JSON.parse(fs.readFileSync(F, 'utf8')).handsOff === undefined, 'F3 API: OFF removes the entry (the file is as before)');
    delete process.env.SWARM_RUNSTATE_FILE;
    const RS = D('runswitch.js');
    ok(/data-runsw="handsoff"/.test(RS) && /if \(!d \|\| !d\.handsOff/.test(RS) && /handsOff: !!on/.test(RS) && /your own orders still run/.test(RS), 'F3 UI: character page toggle + one-line explanation (only with a server that sends handsOff)');
    done();
  })().catch(e => { fail++; console.log('FAIL F3 API test crashed: ' + e.stack); done(); });
}
function done() {
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { }
  console.log(`optional switches 2026-10-26: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
