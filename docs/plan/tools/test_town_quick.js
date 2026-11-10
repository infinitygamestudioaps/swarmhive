// TOWNQUICK-2026-11-10 guard (public tester LuckyStrikz: "the dashboard spends a lot of time 'regrouping' in town even after you have already
// told the dashboard the server has the .town commands. It doesn't need to regroup or have any toons missing, it should just be able to hit
// .nameoftown and all members regrouped").
// Root cause: teamRegroupBeforePort ran the same hold in a town as in the field: up to 75 s gathering (TOWNHOLD) for anyone > 900 away + 10 s
// "all out of combat" before every .townname - although on L2Toggle the server takes the party along on the leader's .town (CLAUDE.md 2d) and
// the members it cannot take use the same .town by themselves after the leader's port (TOWNFIRST). After the landing the wait counted members
// from their own reports (up to 3 s old = still at the old place).
// Kept (team.md / CLAUDE.md safety): never port while someone of us fights in my area (fight first); out of combat first; nobody leaves before
// the leader's own .town worked; a FIELD port (gatekeeper to a hunting ground) still gathers everyone.
//   1) pure townQuickPort
//   2) the switches: townServerTakes (the party's "server takes the party along"), townCmdFirst (.townname is the party's way to town)
//   3) source wiring in the hold + the landing wait
// Nothing live. Usage: node docs/plan/tools/test_town_quick.js
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const SRC = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'Scripts_dev', 'swarm.js'), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m); } };
const fnSrc = (head) => { const i = SRC.indexOf(head); if (i < 0) return ''; const a = SRC.indexOf('\nfunction ', i + 10), b = SRC.indexOf('\nasync function ', i + 10), c = SRC.indexOf('\n/**', i + 10); return SRC.slice(i, Math.min(...[a, b, c].filter(x => x > 0))); };

console.log('1) pure townQuickPort');
const tq = fnSrc('function townQuickPort(');
ok(!!tq, 'townQuickPort exists');
const pa = SRC.indexOf('TEAMJOIN-PURE-END'), at = SRC.indexOf('function townQuickPort(');
ok(at > 0 && at < pa, 'it lives in the TEAMJOIN-PURE block (no host calls)');
const Q = new Function(tq + '\nreturn townQuickPort;')();
const base = { inTown: true, destTown: 'Dion', serverTakes: true, townCmd: true, fighting: false, combat: false };
ok(Q(base) === true, 'in a town, the server takes the party, .townname, nobody fights, out of combat: port at once (no gathering)');
ok(Q(Object.assign({}, base, { fighting: true })) === false, 'someone of us fighting: the normal hold (fight first, never port while someone fights)');
ok(Q(Object.assign({}, base, { combat: true })) === false, 'my combat stance on: wait (out of combat first)');
ok(Q(Object.assign({}, base, { inTown: false })) === false, 'in the field: the normal hold (safe spot, gather, out of combat)');
ok(Q(Object.assign({}, base, { serverTakes: false })) === false, 'the party said the server does NOT take it along: the normal gathering');
ok(Q(Object.assign({}, base, { townCmd: false })) === false, 'the party does not use .townname (gatekeeper / SoE / walk): the normal gathering');
ok(Q(Object.assign({}, base, { destTown: '' })) === false, 'not a town port (gatekeeper to a field): the normal gathering');

console.log('2) the switches');
{
  const C = { mode: 'command', ways: ['auto'], sf: true };
  const ctx = { tcMode: () => C.mode, soMine: () => ({ townWays: C.ways }), gkServerFollow: () => C.sf, soTownWays: new Function(fnSrc('function soList(') + '\n' + fnSrc('function soTownWays(') + '\nreturn soTownWays;')() };
  ctx.SRVOPT = { ways: ['auto', 'townCmd', 'returnSkill', 'soe', 'gatekeeper', 'walk'] };
  vm.createContext(ctx);
  vm.runInContext(fnSrc('function soList(') + '\n' + fnSrc('function soTownWays(') + '\n' + fnSrc('function townServerTakes(') + '\n' + fnSrc('function townCmdFirst(') + '\n;globalThis.__T = { townServerTakes, townCmdFirst };', ctx);
  const T = ctx.__T;
  ok(T.townCmdFirst() === true, "way to town 'auto' with a server that knows .townname: yes");
  C.ways = ['townCmd', 'gatekeeper']; ok(T.townCmdFirst() === true, "'.townname command' first in the party's list: yes");
  C.ways = ['soe', 'townCmd']; ok(T.townCmdFirst() === false, 'Scroll of Escape first: no');
  C.ways = ['auto']; C.mode = 'gatekeeper'; ok(T.townCmdFirst() === false, 'the server has no .townname (learned gatekeeper mode): no');
  C.sf = false; ok(T.townServerTakes() === false, 'the party switched "server takes the party along" off: no'); C.sf = true; ok(T.townServerTakes() === true, 'switched on (the default): yes');
}

console.log('3) source wiring');
const hold = SRC.slice(SRC.indexOf('async function teamRegroupBeforePortInner('), SRC.indexOf('/** Follower: the leader announced !town'));
const iq = hold.indexOf('if (townQuickPort({'), it = hold.indexOf('const tp = townHoldPlan(');
ok(iq > 0 && it > iq && hold.indexOf('if (dTown) {') < iq, 'the quick port is decided inside the .townname hold, before the 75 s gathering');
ok(/townQuickPort\(\{ inTown: !!currentTownKey\(\), destTown: dTown, serverTakes: townServerTakes\(\), townCmd: townCmdFirst\(\), fighting: fightingNow, combat: !!Me\.IsInCombat \}\)/.test(hold), 'it gets the town, the party switches, the fight state (me + teammates hit in my area) and my combat stance');
const qb = hold.slice(iq, it);
ok(/queueJoinTown\(go, dTown, what\)/.test(qb) && /farT\.filter\(m => !\(livePos\[m\.name\] \|\| \{\}\)\.fight\)/.test(qb), 'members out of the server\'s range (not fighting) use the same .town by themselves - queued until my port worked (TOWNFIRST)');
ok(/all = true; break;/.test(qb), 'then straight to the announce + port (no gathering, no 10 s calm)');
ok(hold.indexOf("SayToParty(`[hold] teleporting:") > it, 'the "teleporting in 3 s" announce + swarm.calm still run');
ok(/if \(!\(await waitWholeTeam\(what\)\)\) return 'interrupted';/.test(hold) && hold.indexOf('waitWholeTeam(what)') < iq, 'the whole team must still be online + in the party first');
ok(/if \(ok && P\.town === town\) \{ App\.emit\('swarm\.jointown'/.test(fnSrc('function flushJoinTown(')), 'TOWNFIRST: the members are sent only after the leader\'s .town really moved him');
const wt = fnSrc('async function waitForTeamHereInner(');
ok(/const seen = mtSeenChars\(\), seenNear = \(n\) =>/.test(wt) && /\.filter\(m => !seenNear\(m\.name\)\)/.test(wt), 'after the landing: a member the leader SEES next to him counts as here (no wait for 3 s old reports)');
ok(/teamToWaitFor\(\)\.filter\(m => !m\.dead && m\.d > g\.checkpointDist\)/.test(wt), 'members not here are still waited for (the whole team after every .town - agreed rule)');
console.log(`\ntown quick: ${pass} ok, ${fail} failed`);
process.exit(fail ? 1 : 0);
