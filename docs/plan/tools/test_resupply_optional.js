// OFFLINE TEST of RESUPOPT-2026-10-27 (owner, asked whether "Supplies off" should also stop the circuit resupply, the Death Penalty scrolls and
// the mission supplies: "Make the resupply optional"). Three party switches in party_auto.json, DEFAULT ON (= today's behaviour):
//   circuitResupply  the raid circuit's resupply between bosses (rcSupplyAsk, the circuit loop, after a wipe)
//   dpScrolls        the Giran services' Recovery scroll step (giranServices 'dprun') + the "Death Penalty, no scrolls" Giran trip
//   missionSupplies  the mission 'supply' step of an AUTOMATIC mission (daily Kamaloka, raidhunt / circuit boss, quest farm)
// Each: missing = ON, off = nothing bought by itself + a note, your order still buys. Never touches the game, MCP or live files.
//   node docs/plan/tools/test_resupply_optional.js     (exit 1 on a failure; SWARM_JS=<file> tests another copy of swarm.js)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const ROOT = path.join(__dirname, '..', '..', '..');
const src = fs.readFileSync(process.env.SWARM_JS || path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
const D = (f) => fs.readFileSync(path.join(ROOT, 'Dashboard', f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('ok   ' + m); } else { fail++; console.log('FAIL ' + m); } };
const blk = (b, e) => { const i = src.indexOf(b), j = src.indexOf(e, i + 1); if (i < 0 || j < i) throw new Error('block not found: ' + b); return src.slice(i, j); };
const fnSrc = (head) => { const i = src.indexOf(head); if (i < 0) throw new Error(head + ' not found'); const j = src.indexOf('\n}\n', i); return src.slice(i, j + 3); };
const lineOf = (head) => { const i = src.indexOf(head); if (i < 0) throw new Error(head + ' not found'); return src.slice(i, src.indexOf('\n', i)); };
// the circuit switch is owner only (PRIVATE-START in swarm.js + partyauto_api.js): in the public package both lists lack it, which is right
const PUBLIC_PKG = !require(path.join(ROOT, 'Dashboard', 'partyauto_api.js')).KINDS.some(x => x.key === 'circuitResupply');
const KINDS3 = ['circuitResupply', 'dpScrolls', 'missionSupplies'].filter(k => !(PUBLIC_PKG && k === 'circuitResupply'));
const FILE = 'C:\\L2\\Scripts\\data\\party_auto.json';

// ---- 1) the switches: swarm.js = the API, default ON, off works -------------------------------------------------------------------
const PA = new Function(blk('// PARTYAUTO-PURE-BEGIN', '// PARTYAUTO-PURE-END') + '\nreturn { PAUTO_KINDS, pautoEffective };')();
const API = require(path.join(ROOT, 'Dashboard', 'partyauto_api.js'));
KINDS3.forEach(k => {
  const K = PA.PAUTO_KINDS[k], A = API.KINDS.find(x => x.key === k);
  ok(K && K.def === true && K.char === false && A && A.def === true && A.char === false && A.group === undefined, `${k}: a party switch in swarm.js + the API, default ON, Supplies section`);
  ok(A && A.label.length > 10 && /On \(default\)/.test(A.help) && /Off:/.test(A.help) && /order/.test(A.help) && /a note says so/.test(A.help), `${k}: label + help say what it buys, when, off, and that orders still work`);
  ok(PA.pautoEffective({}, k, 'Tank1', 'Tank1').on === true && PA.pautoEffective(null, k, 'X', 'X').on === true, `${k}: no file / no entry = ON (today's behaviour)`);
  ok(PA.pautoEffective({ parties: { Tank1: { [k]: false } } }, k, 'Bishop1', 'Tank1').on === false, `${k}: party switch off = OFF`);
  ok(PA.pautoEffective({ default: { [k]: false } }, k, 'Tank1', 'Tank1').on === false && PA.pautoEffective({ default: { [k]: false }, parties: { Tank1: { [k]: true } } }, k, 'Tank1', 'Tank1').on === true, `${k}: all parties off, the party's own ON wins`);
  ok(PA.pautoEffective({ chars: { Tank1: { [k]: false } } }, k, 'Tank1', 'Tank1').on === true, `${k}: no per-character switch (party only)`);
  ok(API.pautoEffective({ parties: { Tank1: { [k]: false } } }, k, 'Tank1', 'Tank1').on === false && API.pautoEffective({}, k, 'Tank1', 'Tank1').on === true, `${k}: the dashboard reads it the same way`);
});
ok(Object.keys(PA.PAUTO_KINDS).join() === API.KEYS.join(), 'swarm.js and the API know the same switches (same order)');
ok(API.applyChange({}, { party: 'Tank1', values: Object.fromEntries(KINDS3.map(k => [k, false])) }).ok, 'API: the three can be set per party' + (PUBLIC_PKG ? ' (public package: the two that ship)' : ''));

// ---- 2) the host gate: OFF = refused + one note naming the path; ON = no note ------------------------------------------------------
const HOST = blk('// PARTYAUTO-PURE-BEGIN', '// PARTYAUTO-HOST-END');
function world(file) {
  const W = { t: 1760360000000, files: {}, notes: [], said: [], calls: [] };
  if (file) W.files[FILE] = { text: JSON.stringify(file), stamp: 's1' };
  W.env = { File: { Exists: (f) => !!W.files[f], ReadAllText: (f) => { if (!W.files[f]) throw new Error('no file'); return W.files[f].text; } }, __DIR__: 'C:\\L2', now: () => W.t,
    fileStamp: (f) => (W.files[f] ? W.files[f].stamp : ''), Me: { Name: 'Tank1', IsDead: false }, CONFIG: { leader: 'Tank1' }, teamOf: () => 'Tank1',
    note: (m, s) => { W.notes.push(m); if (s) W.said.push(m); } };
  return W;
}
const OFF3 = { parties: { Tank1: { circuitResupply: false, dpScrolls: false, missionSupplies: false } } };
{ const W = world(OFF3), H = new Function('env', 'with (env) {\n' + HOST + '\nreturn { pautoGate, pautoOn };\n}')(W.env);
  KINDS3.forEach(k => { const n0 = W.notes.length; ok(H.pautoGate(k) === false && W.notes.length === n0 + 1 && /switched OFF/.test(W.notes[n0]) && W.notes[n0].includes(PA.PAUTO_KINDS[k].what) && /your order still works/.test(W.notes[n0]), `${k}: gate OFF = refused + a note that names the path`); });
  const W2 = world(null), H2 = new Function('env', 'with (env) {\n' + HOST + '\nreturn { pautoGate };\n}')(W2.env);
  ok(KINDS3.every(k => H2.pautoGate(k) === true) && !W2.notes.length, 'no party_auto.json: all three gates open, no note (default ON)'); }

// ---- 3) circuit resupply ---------------------------------------------------------------------------------------------------------
if (PUBLIC_PKG) console.log('skip circuit resupply checks (public package: the raid circuit is owner only)');
else { const ASK = lineOf('function rcSupplyAsk(low)');
  const run = (file) => { const W = world(file), RC = { supplyWant: null }, ev = [];
    const f = new Function('env', 'RC', 'rcEvent', 'with (env) {\n' + HOST + '\n' + ASK + '\nreturn rcSupplyAsk;\n}')(W.env, RC, (m) => ev.push(m));
    f(['Tank1: SoE 0/5']); return { W, RC, ev }; };
  const on = run(null), onP = run({ parties: { Tank1: { circuitResupply: true, supplyWatch: false } } }), off = run({ parties: { Tank1: { circuitResupply: false } } });
  ok(on.RC.supplyWant && /SoE/.test(on.RC.supplyWant.why) && on.ev.length === 1, 'circuit DEFAULT (no file): running low = the circuit resupplies before the next boss (as before)');
  ok(onP.RC.supplyWant, 'circuit: ON with supply runs OFF = still resupplies (the supply switch does not stop it)');
  ok(!off.RC.supplyWant && !off.ev.length && off.W.notes.some(m => /raid circuit's resupply/.test(m) && /switched OFF/.test(m)), 'circuit OFF: no resupply asked + a note');
  const loop = fnSrc('async function raidCircuitLoop(why) {');
  ok(/if \(RC\.supplyWant && !inRaid\(\)\) \{ if \(pautoGate\('circuitResupply'\)\) \{ await rcSupply\(RC\.supplyWant\.why\);[^\n]*else RC\.supplyWant = null; \}/.test(loop), 'circuit loop: a resupply asked before the switch went off is dropped (gate before rcSupply)');
  ok(/if \(!RC\.supplyWant && pautoGate\('circuitResupply'\)\) RC\.supplyWant = \{ why: 'after a wipe'/.test(loop), 'circuit: the after-a-wipe resupply asks the switch too');
  ok((loop.match(/rcSupply\(/g) || []).length === 1, 'circuit: rcSupply is called only behind the gate'); }

// ---- 4) Death Penalty scrolls -----------------------------------------------------------------------------------------------------
{ const GS = fnSrc('async function giranServices(why, opt) {');
  const run = async (file, opt) => { const W = world(file), steps = [];
    Object.assign(W.env, { leadMode: () => true, isLeader: () => true, soloChar: () => false, currentTownKey: () => 'Giran', lastSupplyAtGet: () => 0, teamNames: () => ['Bishop1'],
      teamStep: async (id, what) => { steps.push(what); return { got: { Bishop1: { name: 'Bishop1', msg: 'bought 3 Scroll of Recovery (D)' } } }; }, DPCOV: { staggerMs: 9000 }, VIT: { staggerMs: 9000 },
      logError: (w, e) => W.calls.push('ERR ' + w + ' ' + e.message), supplyJunkGrades: () => [], storeBuyBuff: async () => ({ why: 'x' }), STORE_COV: {}, STORE_MAGNUS: {},
      soStoreAddOn: async () => { }, SayToParty: (m) => W.said.push(m) });
    const f = new Function('env', 'with (env) {\n' + HOST + '\n' + GS + '\nreturn giranServices;\n}')(W.env);
    const line = await f('at the Giran regroup', opt); return { W, steps, line }; };
  (async () => {
    const def = await run(null), off = await run({ parties: { Tank1: { dpScrolls: false } } }), ord = await run({ parties: { Tank1: { dpScrolls: false } } }, { order: true });
    ok(def.steps.includes('dprun') && /death penalty/.test(def.line), 'DP DEFAULT (no file): the Giran services buy the Recovery scrolls (as before)');
    ok(!off.steps.includes('dprun') && off.W.notes.some(m => /Death Penalty \(Recovery\) scrolls/.test(m) && /switched OFF/.test(m)) && !off.W.calls.some(c => /^ERR/.test(c)), 'DP OFF: no scroll step + a note');
    ok(ord.steps.includes('dprun'), 'DP OFF but your order (!gearup Giran services, opt.order): the scrolls are bought');
    ok(/giranServices\('after the gear purchases', \{ order: true \}\)/.test(src), 'the !gearup order passes order: true');
    ok(/giranServices\('at the Giran regroup'\)/.test(src) && /giranServices\('rebuff trip', \{ force: true \}\)/.test(src), 'the regroup + rebuff-trip calls stay automatic (ask the switch)');
    const KH = fnSrc('async function khSafeRebuffMaybe(solo) {');
    ok(/dpDue = dpTripDue\([^\n]*\) && pautoGate\('dpScrolls'\)/.test(KH), 'DP OFF: a Death Penalty no longer starts the Giran rebuff trip by itself (dpDue asks the switch)');
    // the expression on stubs: due + off = false + note; due + on = true; not due = no note
    { const W = world({ parties: { Tank1: { dpScrolls: false } } }), H = new Function('env', 'with (env) {\n' + HOST + '\nreturn { pautoGate };\n}')(W.env);
      const due = (d) => d && H.pautoGate('dpScrolls');
      ok(due(false) === false && !W.notes.length && due(true) === false && W.notes.length === 1, 'DP trip: not due = no note at all; due + off = no trip + a note'); }
    // ---- 5) mission supplies ---------------------------------------------------------------------------------------------------
    { const MS = lineOf('const missionSupplyOk = ');
      const mk = (file) => { const W = world(file); return { W, f: new Function('env', 'with (env) {\n' + HOST + '\n' + MS + '\nreturn missionSupplyOk;\n}')(W.env) }; };
      const d = mk(null), o = mk({ parties: { Tank1: { missionSupplies: false } } });
      ok(d.f({ auto: true }) === true && d.f() === true && !d.W.notes.length, 'mission DEFAULT (no file): automatic and ordered missions buy their supplies (as before)');
      ok(o.f({ auto: true }) === false && o.W.notes.some(m => /extra mission supplies/.test(m) && /switched OFF/.test(m)), 'mission OFF: an automatic mission skips the grocer step + a note');
      ok(o.f() === true && o.f({}) === true, 'mission OFF: your order (no auto flag) still buys');
      const LM = fnSrc('async function leaderMission(kind, arg, opt) {');
      const sup = LM.match(/[^\n]*teamStep\(runId, 'supply'[^\n]*/g) || [];
      ok(sup.length === 2 && sup.every(l => /if \(missionSupplyOk\(opt\)\) await teamStep\(runId, 'supply'/.test(l)), 'leaderMission: both mission supply steps (raid / Kamaloka) ask missionSupplyOk(opt)');
      ok(/leaderMission\('kamaloka', String\(k\.id\)\.split\('-'\)\.pop\(\), \{ auto: true \}\)/.test(src), 'the daily Kamaloka is automatic');
      ok((src.match(/await leaderMission\('raid', b\.name, \{ auto: true \}\)/g) || []).length === 2, 'raidhunt + circuit bosses are automatic');
      ok(/leaderMission\('kamaloka', a\.level, \{ auto: !!\(Q\.spec && Q\.spec\.farm\) \}\)/.test(src), 'quest Kamaloka: automatic only for the quest farm');
      ok(/await leaderMission\(kind, arg\);/.test(fnSrc('async function missionOrderLoop(kind, arg) {')) && /await leaderMission\('kamaloka', arg\);/.test(fnSrc('async function manualKamaloka(arg) {')) && (src.match(/await leaderMission\('raid', (d\.)?boss\)/g) || []).length === 2, 'your !mission raid / kamaloka and !jointraid orders: no auto flag (always buy)'); }
    // ---- 6) dashboard + release + requirement ----------------------------------------------------------------------------------
    const PSJ = D('partysettings.js'), AC = D('autocatalog.js'), APIJ = D('partyauto_api.js');
    ok(/circuitResupply: 'circuit resupply', dpScrolls: 'DP scrolls', missionSupplies: 'mission supplies'/.test(PSJ) && /circuitResupply\|dpScrolls\|missionSupplies/.test(PSJ) && /nothing is bought here by itself \(a note says so\); your orders still buy/.test(PSJ), 'party Settings -> Supplies: short names + the off text');
    const cat = new Function('window', AC + '\nreturn window.AutoCatalog;')({});
    const ent = (k) => (cat.ENTRIES || cat.entries || cat.E || []).find(e => e.key === k);
    ok(KINDS3.every(k => { const e = ent(k); return e && e.def === 'on' && e.eval === 'pauto' && e.pauto[0] === k && e.where.settings === 'supplies'; }), 'automations catalog: one entry per switch (default on, Supplies settings)');
    const cut = (t) => t.replace(/[ \t]*(?:\/\/|<!--) PRIVATE-START[\s\S]*?PRIVATE-END(?: -->)?[ \t]*\r?\n?/g, '');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'resupopt-')), pub = path.join(tmp, 'partyauto_api.js'); fs.writeFileSync(pub, cut(APIJ));
    let pubApi = null; try { pubApi = require(pub); } catch (e) { }
    ok(pubApi && !pubApi.KEYS.includes('circuitResupply') && pubApi.KEYS.includes('dpScrolls') && pubApi.KEYS.includes('missionSupplies'), 'public package: the circuit switch is cut (owner only), the other two stay');
    ok(!/circuitResupply/.test(cut(AC)), 'public package: no circuit entry in the catalog');
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { }
    const REQF = path.join(ROOT, 'docs', 'requirements', 'optional.md'), REQ = fs.existsSync(REQF) ? fs.readFileSync(REQF, 'utf8') : null;   // docs/requirements is not in the public package
    if (REQ !== null) ok(/## R4/.test(REQ) && /2026-10-27/.test(REQ) && /"Make the resupply optional"/.test(REQ) && KINDS3.every(k => REQ.includes('`' + k + '`')), 'requirement optional.md R4 quotes the owner with the date and names the three switches');
    const GUIDE = fs.readFileSync(path.join(ROOT, 'docs', 'guide', 'pages', 'party-settings.md'), 'utf8');
    ok(/Death Penalty scrolls in Giran/.test(GUIDE) && /Mission supplies before automatic raids and Kamaloka/.test(GUIDE), 'guide: party-settings.md explains the switches');
    console.log(`resupply optional 2026-10-27: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  })().catch(e => { console.log('FAIL crashed: ' + e.stack); process.exit(1); });
}
