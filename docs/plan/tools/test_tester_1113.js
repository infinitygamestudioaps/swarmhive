// TESTER FIXES 2026-11-13 (Discord #swarmhive after v1.14.3 / 1.14.4). Nothing live: pure blocks / functions in node + source checks.
//   STAYSHARE    two parties with "stay" on the same chosen zone share it (Vykaax: "2 dwarf duos ... 'stay if occupied' is set on both")
//   RESUMEFIRST  after a restart the saved spot is resumed BEFORE the choice hold (Vykaax: "stand in place after logging in", stale polygon)
//   PARKHOLD     your !park / !stop blocks every automatic task of the party, members too (Vykaax: "Clan leader and town buffers decided to go on a trip")
//   SUPSTUCK     an item a supply run could not refill no longer starts runs for 24 h (LuckyStrikz: "go to town almost every 30mins to an hour")
//   WPEDGE       the end of your waypoints at the zone edge = arrived (Vykaax: "full charge all the way across the hunting zone")
//   ROUTESTALL   a member held by a stale L2Swarm combat flag walks on; stuck members are sent back also on legs / within 3000 (Vykaax: 31 min wait)
//   SAFEWALK     nothing on the team before a port = only a short wall-aware safe walk (Vykaax: "had no aggro but they chose to attack something")
//   VITLEASH     the Gift of Vitality visit is one hard errand (Vykaax: "PurpleTwo keeps leashing between PurpleLeader and Steve Shyagel")
// Usage: node docs/plan/tools/test_tester_1113.js
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m); } };
const block = (name) => { const a = SRC.indexOf(`// ${name}-PURE-BEGIN`), b = SRC.indexOf(`// ${name}-PURE-END`); if (!(a > 0 && b > a)) throw new Error(name + ' block missing'); return SRC.slice(a, b); };
/** one top-level function's source (from "function name(" to the first line that is just "}") */
const fn = (name) => { const a = SRC.indexOf(`\nfunction ${name}(`); if (a < 0) throw new Error(name + ' missing'); const line = SRC.indexOf('\n', a + 1); const first = SRC.slice(a + 1, line);
  if (/\}\s*$/.test(first) && (first.match(/\{/g) || []).length === (first.match(/\}/g) || []).length) return first; const b = SRC.indexOf('\n}\n', a); return SRC.slice(a + 1, b + 2); };
const between = (from, to) => { const a = SRC.indexOf(from); const b = SRC.indexOf(to, a); return a >= 0 && b > a ? SRC.slice(a, b) : ''; };

console.log('STAYSHARE');
{
  const rc = between('function rivalClaim(spot, center) {', '\n}\n');
  ok(/if \(spot\.manualStay\) return null;/.test(rc) && rc.indexOf('spot.manualStay') < rc.indexOf('readClaims()'), 'rivalClaim: a spot you chose with "stay" is never given up to another of our parties');
  ok(/function zoneSpot\(z, level, why, opt\)/.test(SRC) && /const t = opt && opt\.stay \? '' : areaTaken\(base\.center, z\.radius, z\.name\);/.test(SRC), 'zoneSpot: "stay" skips the own-party claim check (shared zone)');
  ok(/zoneSpot\(z, level, why, \{ stay: !!e\.stay \}\)/.test(SRC), 'the dashboard choice passes its "stay" tick to zoneSpot');
  ok(/sel\.stay \? \(\(sel\.ids \|\| \[\]\)\.length > 1 \? areaTaken\(c, a\.radius/.test(SRC) && /sel\.stay \? \(\(sel\.ids \|\| \[\]\)\.length > 1 \? areaTaken\(c, r\.radius/.test(SRC), 'one chosen area / room + stay = shared; several = still the free one first');
  ok(/manualStay: !!e\.stay/.test(SRC), 'the picked spot carries manualStay');
}

console.log('RESUMEFIRST');
{
  const c = { String, Array }; vm.createContext(c);
  vm.runInContext(fn('resumeSameChoice') + '\n;globalThis.__R = resumeSameChoice;', c);
  const R = c.__R;
  ok(R({ name: 'Wall of Argos · EWA 1', manual: true }, { mode: 'manual', kind: 'zone', spot: 'Wall of Argos · EWA 1' }) === true, 'replay FindStuff7: the saved spot is the same dashboard zone');
  ok(R({ name: 'Wall of Argos · EWA 1' }, { mode: 'manual', spot: 'Forge of the Gods' }) === false, 'another choice = not the same');
  ok(R({ name: 'X' }, { mode: 'auto', spot: 'X' }) === false && R(null, { mode: 'manual', spot: 'X' }) === false, 'auto / nothing saved = not the same');
  const loop = between("if (spotRepickDue({ now: now(), lastPick, spot: autoLvl.spot, level: pickLvl })) {", 'manualSpotOnPick(spot);');
  const iRes = loop.indexOf('spotResumeDecide('), iHold = loop.indexOf('choiceOnlyHold(');
  ok(iRes > 0 && iHold > iRes, 'the restart resume runs BEFORE the choice hold (the hold looped and never reached the zone setup)');
  ok(/if \(!resumedSpot\) hold = choiceOnlyHold\(/.test(loop), 'a resumed spot is never held (its zone is set up at once)');
  ok((loop.match(/spotResumeDecide\(/g) || []).length === 1, 'the resume runs once (the old copy after the hold is gone)');
  ok(/resumeSameChoice\(rs\.spot, e0\)/.test(loop), 'an empty pick keeps the saved spot of the SAME dashboard choice');
}

console.log('PARKHOLD');
{
  const c = { String }; vm.createContext(c);
  vm.runInContext(fn('userPauseWhy') + '\n;globalThis.__U = userPauseWhy;', c);
  const U = c.__U;
  ok(U({ why: 'order:park-start', at: 1, auto: false }) === 'order:park-start', 'replay: "Waiting for orders since 00:32 (order:park-start)" = a user pause');
  ok(U({ why: '', at: 1, auto: false }) === 'stop', 'a plain !stop = a user pause');
  ok(U({ why: 'auto:raid-done', auto: true }) === '' && U({ why: 'raid-wipe', auto: false }) === '' && U(null) === '', 'automatic pauses / raid wipes / no file = not paused by the user');
  const ra = between('function runAuto(kind) {', '\n}\n');
  ok(/partyUserPaused\(\)/.test(ra) && ra.indexOf('partyUserPaused') < ra.indexOf('runAutoAllowed('), 'runAuto: a user park / stop blocks every automatic kind (before the run switch, which stays ON on a park)');
  ok(/!RUN_ALWAYS\.test\(String\(kind \|\| ''\)\)\) \{ const pz = typeof partyUserPaused === 'function' \? partyUserPaused\(\) : ''/.test(ra), 'survival / trades / orders (RUN_ALWAYS) still run');
  ok(/pauseInfo\(isLeader\(\) \? Me\.Name : CONFIG\.leader\)/.test(SRC), "members read their leader's pause file");
  ok(/if \(partyUserPaused\(\) && !collectorOn\(\)\) return;/.test(SRC), 'the fund hand-out round waits while parked');
  ok(/const pz = partyUserPaused\(\);[^\n]*\n\s*const why = busy \|\| \(pz \?/.test(SRC), 'the clan item trip waits while parked');
  ok((SRC.match(/if \(typeof partyUserPaused === 'function' && partyUserPaused\(\)\) return;/g) || []).length >= 3, 'party plans do not go on / resume / unblock while parked');
  ok(/var partyPauseCache/.test(SRC), 'the cache is a var (runAuto may run before its line during the start)');
}

console.log('SUPSTUCK');
{
  const c = { Number, Math, Array, String }; vm.createContext(c);
  vm.runInContext(block('SUPHOLY') + '\n;globalThis.__S = { supplyStuckStep, SUPSTUCK };', c);
  const { supplyStuckStep: S, SUPSTUCK: K } = c.__S;
  const H = 3600000, t0 = 1e12;
  let r = S(null, 0, t0 - 2 * H, t0);
  ok(r.skip === false && r.e.lowSince === t0 && r.e.have0 === 0, 'first low report starts counting and still triggers');
  r = S(r.e, 0, t0 + 60000, t0 + 5 * 60000);
  ok(r.skip === false, 'a run that started 4 min ago is still running: not judged yet');
  r = S(r.e, 0, t0 + 60000, t0 + 60000 + K.settleMs);
  ok(r.skip === true && r.mark === true && r.e.until === t0 + 60000 + K.settleMs + 24 * H, 'replay: still 0 after the run that came for it = no runs for 24 h');
  const r2 = S(r.e, 0, t0 + 60000, t0 + 2 * H);
  ok(r2.skip === true && r2.mark === false, 'within the 24 h it stays quiet (said once)');
  ok(S(r.e, 0, t0, r.e.until + 1).skip === false, 'after 24 h it may trigger again');
  let q = S(null, 50, t0 - H, t0); q = S(q.e, 1500, t0 + 60000, t0 + 60000 + K.settleMs);
  ok(q.skip === false && q.mark === false, 'refilled by the run (higher than before) = normal');
  ok(/const low0 = supplyNeeds\(\)\.filter\(supplyTriggers\);/.test(SRC) && /supplyStuckStep\(supStuck\[k\], n\.have, runAt, t\)/.test(SRC), 'the supply watch filters items the last run could not refill');
  ok(/Object\.keys\(supStuck\)\.forEach\(k => \{ if \(!ids\[k\]\) delete supStuck\[k\]; \}\)/.test(SRC), 'an item above its line again counts from scratch');
}

console.log('WPEDGE');
{
  const c = { Math, Number, Array, isFinite }; vm.createContext(c);
  vm.runInContext(fn('inPolygon') + '\n' + fn('nearPolygon') + '\n' + block('WPEDGE') + '\n;globalThis.__W = wpArrived;', c);   // the real polygon helpers
  const W = c.__W;
  const leech = { center: { x: 0, y: 0 }, radius: 3200, poly: [{ x: -3000, y: -2000 }, { x: 3000, y: -2000 }, { x: 3000, y: 2000 }, { x: -3000, y: 2000 }] };
  ok(W({ x: -3300, y: 0 }, leech) === true, 'replay leeches: the last waypoint just outside the zone edge = arrived (no charge to the centre)');
  ok(W({ x: -9000, y: 0 }, leech) === false, 'far outside the zone = not arrived');
  ok(W({ x: 1000, y: 0 }, { center: { x: 0, y: 0 } }) === true && W({ x: 2000, y: 0 }, { center: { x: 0, y: 0 } }) === false, 'a spot without polygon: within 1500 of the centre (old rule kept)');
  const tts = between('if (spot.waypoints && spot.waypoints.length) {', "if (spot.floor && !onFloor(Me.Z))");
  ok(/if \(wpArrived\(\{ x: num\(Me\.X\), y: num\(Me\.Y\) \}, spot\)\) return true;/.test(tts), 'travelToSpot: after the waypoints wpArrived decides (no long walk to the centre)');
}

console.log('ROUTESTALL');
{
  const c = { Math, JSON, Number, String, Object, Array, isFinite, Set }; vm.createContext(c);
  vm.runInContext(block('MOVETOGETHER') + '\n;globalThis.__M = { mtRejoinPick, routeStallFree };', c);
  const { mtRejoinPick: P, routeStallFree: F } = c.__M;
  const base = { now: 1e9, gate: 7, waited: 0, last: {}, floorMs: 180000, allTriesMs: 180000, againMs: 600000 };
  const m = (st, sinceAgo) => ({ name: 'PurpleTwo', online: true, alive: true, benched: false, left: false, reached: 6, stuck: { stage: st, since: 1e9 - sinceAgo }, zgap: 0 });
  ok(P(Object.assign({}, base, { phase: 'gate', members: [m('stuck', 32 * 60000)] })).length === 1, "replay PurpleTwo: 'stuck · not moving' for 32 min at point 7/8 = sent back (was never: only stage 'wait' counted)");
  ok(P(Object.assign({}, base, { phase: 'leg', members: [m('stuck', 32 * 60000)] })).length === 0, 'never during a leg (ROUTEFLOOR rule unchanged)');
  ok(P(Object.assign({}, base, { phase: 'gate', members: [m('stuck', 2 * 60000)] })).length === 0, 'stuck 2 min = the ladder first (not yet)');
  ok(P(Object.assign({}, base, { phase: 'gate', members: [m('wait', 200000)] })).length === 1, "all tries used ('wait') after 3 min = sent back (unchanged)");
  ok(P(Object.assign({}, base, { phase: 'other', members: [m('stuck', 32 * 60000)] })).length === 0, 'other phases: nothing');
  ok(F(6000, 10000) === true && F(3000, 60000) === false && F(60000, 5000) === false, 'L2Swarm combat on, nothing hit me 6 s, flag on 10 s = switched off; a hit / a fresh flag = fight first');
  const mrs = between('function memberRouteStep() {', 'const next = m.my + 1;');
  ok(mrs.indexOf('routeStallFree(') > 0 && mrs.indexOf('routeStallFree(') < mrs.indexOf('if (Me.IsDead || IsInCombat || bfStanceLive()) return;'), 'memberRouteStep: the stale combat flag is cleared before the "fight first" return');
  ok(/force: true \/\* ROUTESTALL/.test(SRC) && /if \(p && d\.force && Math\.hypot\(p\.X - Me\.X, p\.Y - Me\.Y\) < 1500/.test(SRC) && /if \(p && !d\.force && Math\.hypot\(p\.X - Me\.X, p\.Y - Me\.Y\) < 3000/.test(SRC), "the route's stuck call also brings members back from within 3000 (RedFour's members 1.6k away)");
}

console.log('SAFEWALK');
{
  const c = { Number }; vm.createContext(c);
  vm.runInContext(fn('safeWalkShort') + '\n;globalThis.__F = safeWalkShort;', c);
  const F = c.__F;
  ok(F(0, false) === true && F(1, false) === false && F(0, true) === false, 'nothing on the team and not fighting = the short walk only');
  const rg = between('// 2) safe spot: outside the aggro range', '// 3) everyone close');
  const iShort = rg.indexOf('safeWalkShort('), iOld = rg.indexOf('await walkDirect(spot.x, spot.y');
  ok(iShort > 0 && iOld > iShort, 'the short wall-aware walk comes before the old straight 2000 walk');
  ok(/escFleePlan\(\{ maxSafeWalk: 1200 \}\)/.test(rg) && /holdDungeonPlanOk\(fp, \{ x: Me\.X, y: Me\.Y \}, 1200\)/.test(rg), 'it walks at most 1200 on a checked way, none found = no walk');
}

console.log('VITLEASH');
{
  const v = between('async function vitalityMine(why, force) {', '\n}\n');
  ok(/errandStart\('vitality', 300000\);/.test(v) && v.indexOf("errandStart('vitality'") < v.indexOf('await openNpc('), 'the priest visit starts one hard errand before the walk');
  ok(/finally \{[^\n]*errandEnd\('vitality'\); \}/.test(v), 'and ends it in finally');
}

console.log('RUNNERSTAY');
{
  const c = { Number }; vm.createContext(c);
  vm.runInContext(fn('runnerStayDecide') + '\n;globalThis.__R = runnerStayDecide;', c);
  const R = c.__R;
  ok(R({ sinceHere: 10000, sinceRecv: Infinity, receiving: false }) === 'stay', 'the first 45 s the runner always waits (members walk up)');
  ok(R({ sinceHere: 120000, sinceRecv: 0, receiving: true }) === 'stay', 'replay: a member hands me its loot = I stay (was: ported away mid-trade)');
  ok(R({ sinceHere: 120000, sinceRecv: 10000, receiving: false }) === 'stay' && R({ sinceHere: 120000, sinceRecv: 25000, receiving: false }) === 'go', 'quiet 20 s after the last hand-over = go');
  ok(R({ sinceHere: 480000, sinceRecv: 0, receiving: true }) === 'timeout', 'never longer than 8 min');
  const cs = between("const t1 = now(); while (now() - t1 < 120000 && (typeof HOV !== 'undefined' && HOV.busy)) await sleep(3000);", "App.emit('swarm.runner.leftparty'");
  ok(/runnerStayDecide\(/.test(cs) && /tradeState\.role === 'take'/.test(cs) && /HOV\.host\.ctl/.test(cs), 'crunServe waits for hand-overs TO the runner before "left party" and the port to town');
  const hg = between('async function hovGive(o) {', "if (mine.self) ").length ? between('async function hovGive(o) {', 'const items') : '';
  ok(/while \(now\(\) - tw < 600000 && \(\(HOV\.host && HOV\.host\.ctl\) \|\| \(tradeState && tradeState\.role === 'take'\)\)\)/.test(SRC), 'a character never gives while a hand-over to it runs (no colliding windows -> no one-by-one singles)');
}

console.log('PLUSLOCK on the runner / bank path');
{
  const c = { Number, String, RegExp, Set, Math, Object, CRUN_HAND_ALWAYS_RE: /x^/, CRUN_KEEP_RE: /x^/, CRUN_BANK_KEEP_RE: /x^/, ROLE_PACKAGE: { runner: [] } }; vm.createContext(c);
  vm.runInContext(fn('crunHandRows') + '\n' + fn('crunBankRows') + '\n' + fn('rolePackage') + '\n;globalThis.__P = { crunHandRows, crunBankRows, rolePackage };', c);
  const P = c.__P, bag = [{ objId: 1, id: 100, name: 'Sword of Valhalla', count: 1, enchant: 4 }, { objId: 2, id: 200, name: 'Animal Bone', count: 50, enchant: 0 }];
  ok(P.crunHandRows(bag).map(b => b.objId).join() === '2', 'a member never hands a plused piece to the runner (owner: never touch plused gear)');
  ok(P.crunBankRows(bag, null).map(b => b.objId).join() === '2', 'the bank never puts a plused piece into the clan warehouse');
  const rp = P.rolePackage(bag, 'runner'); ok(rp.give.map(b => b.objId).join() === '2' && rp.keep.some(b => b.objId === 1), 'the runner keeps a plused piece (never passed on)');
}

console.log('BANKNEVER');
{
  const bs = between('const rows = crunBankRows(hovBag(), ids)', "const r = await stashDepositAt(npc, put, 'clan');");
  ok(/const nv = stashNever\(r\.name, SR\); if \(nv\) \{ never\.push\(r\.name\); return false; \}/.test(bs), 'the Storage page "Never store" list beats the bank\'s clan-warehouse deposit');
  ok(!/destroyItem|DestroyItem|RequestDestroy|destroy_item/.test(bs), 'nothing is destroyed on this path (owner: never sell or destroy unasked)');
}

console.log('SPRINTSPAM');
{
  const c = { Number, Object }; vm.createContext(c);
  vm.runInContext(fn('speedCastGate') + '\n' + fn('speedCastNote') + '\n;globalThis.__S = { speedCastGate, speedCastNote };', c);
  const { speedCastGate: G, speedCastNote: N } = c.__S;
  let r = G(null, true, 0); ok(r.ok, 'first cast allowed'); let rec = N(r.rec, 0);
  r = G(rec, true, 2500); ok(r.ok, 'second cast allowed'); rec = N(r.rec, 2500);
  r = G(rec, true, 5000); ok(!r.ok, 'a third within 15 s waits (was: every 2.5 s into the wall)');
  r = G(r.rec, true, 16000); ok(!r.ok && r.rec.rest === 76000, 'still not up after 15 s = rests 60 s');
  ok(!G(r.rec, true, 60000).ok && G(r.rec, true, 76001).ok, 'after the rest it may try again');
  ok(G(rec, false, 5000).rec.n === 0, 'the buff landed = counting starts over');
  ok(/speedCastGate\(tr\[num\(k\.Id\)\], low, now\(\)\)/.test(SRC), 'scoutSpeedTick uses the gate');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
