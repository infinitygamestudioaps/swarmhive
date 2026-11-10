// TOWNERRAND2-2026-11-10 guard (public testers Vykaax + Raltru "happens to me always": "bots appear to be permanently leashed to the leader now?
// these followers are trying to go to the grocer but get pulled back"). Owner rules: team.md R5 (a member's own errand is never pulled back to its
// leader), CLAUDE.md ERRAND-2026-10-23 / TOWNERRAND-2026-10-28.
// Root cause: the 'npc' errand covered only openNpc's own walk (and only from > 300 away). A member's walk along the Giran route to the grocer /
// warehouse (giranGo), buyAt's / sellAt's walk to the merchant and the steps between two shop openings had NO errand, so the follow keepers
// switched L2Swarm Follow back on and pulled the member back to its leader, again and again.
//   1) pure ERRANDSOFT: a soft errand starts when none runs, every next step extends it, it ends graceMs after the last step; a hard errand
//      (sell / buy / itemjob / npcmap) is never changed
//   2) the host helpers on a stubbed state: follow held while the soft errand lives, follow back after the grace, the leader never gets one,
//      the 'npc' errand of openNpc does not end it
//   3) source wiring: giranGo (not 'start'), buyAt, sellAt keep the soft errand alive and end it softly; followOk / the follow keeper honour it
// Nothing live. Usage: node docs/plan/tools/test_town_errand.js
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const SRC = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'Scripts_dev', 'swarm.js'), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m); } };
const fnSrc = (head) => { const i = SRC.indexOf(head); if (i < 0) return ''; const a = SRC.indexOf('\nfunction ', i + 10), b = SRC.indexOf('\nasync function ', i + 10), c = SRC.indexOf('\n// ', i + 10); return SRC.slice(i, Math.min(...[a, b, c].filter(x => x > 0))); };

console.log('1) pure ERRANDSOFT');
const pa = SRC.indexOf('// ERRANDSOFT-PURE-BEGIN'), pb = SRC.indexOf('// ERRANDSOFT-PURE-END');
ok(pa > 0 && pb > pa, 'ERRANDSOFT-PURE block found');
const pc = { Math, Object, String, Number };
vm.createContext(pc);
vm.runInContext(SRC.slice(pa, pb) + '\n;globalThis.__E = { ERRANDSOFT, errandSoftCalc, errandSoftEndCalc };', pc);
const E = pc.__E;
{
  const r0 = E.errandSoftCalc(null, 1000, 60000, 'town');
  ok(r0.start && r0.e.soft && r0.e.kind === 'town' && r0.e.until === 61000, 'no errand: a soft one starts');
  const r1 = E.errandSoftCalc(r0.e, 30000, 60000, 'town');
  ok(!r1.start && r1.e.until === 90000, 'a soft errand is extended by the next step');
  const r2 = E.errandSoftCalc({ kind: 'town', soft: true, until: 90000 }, 31000, 10000, 'town');
  ok(r2.e.until === 90000, 'a touch never shortens it');
  const hard = { kind: 'sell', until: 500000 };
  const r3 = E.errandSoftCalc(hard, 1000, 60000, 'town');
  ok(r3.hard && r3.e === hard && !r3.start, 'a hard errand (sell / buy / itemjob) is left alone');
  ok(E.errandSoftCalc({ kind: 'town', soft: true, until: 500 }, 1000, 60000, 'town').start, 'an expired errand: a new soft one starts');
  ok(E.errandSoftEndCalc({ kind: 'town', soft: true, until: 90000 }, 31000, 20000).until === 51000, 'the soft end: it runs out graceMs after the last step');
  ok(E.errandSoftEndCalc({ kind: 'town', soft: true, until: 40000 }, 31000, 20000).until === 40000, 'the soft end never lengthens it');
  ok(E.errandSoftEndCalc(hard, 31000, 20000) === hard, 'the soft end never touches a hard errand');
  ok(E.ERRANDSOFT.graceMs > 0 && E.ERRANDSOFT.graceMs <= 30000, `follow comes back soon after the errand (grace ${E.ERRANDSOFT.graceMs / 1000} s)`);
}

console.log('2) host helpers on a stubbed state');
{
  const H = { t: 1e6, leader: false, follow: true, stops: 0 };
  const ctx = { Math, Object, String, Number, now: () => H.t, isLeader: () => H.leader, state: {}, Options: { get ActiveFollow() { return H.follow; }, set ActiveFollow(v) { H.follow = v; } }, Send: { StopMove: () => { H.stops++; } } };
  vm.createContext(ctx);
  const code = [fnSrc('function followHold('), fnSrc('function errandBlocks('), fnSrc('function errandStart('), fnSrc('function errandEnd('), fnSrc('function errandNow('), SRC.slice(pa, pb), fnSrc('function errandTouch('), fnSrc('function errandSoftEnd(')].join('\n');
  vm.runInContext(code + '\n;globalThis.__F = { errandTouch, errandSoftEnd, errandNow, errandStart, errandEnd };', ctx);
  const F = ctx.__F, S = ctx.state;
  F.errandTouch('town', 60000);
  ok(F.errandNow() === 'town' && S.errand.soft && H.follow === false && S.followHoldUntil >= H.t + 60000, 'a member walking to the grocer: soft errand, follow OFF and held');
  H.t += 50000; F.errandTouch('town', 60000);
  ok(F.errandNow() === 'town' && S.followHoldUntil >= H.t + 60000, 'the next step (shop opening) keeps it alive and the follow hold with it');
  // openNpc's own 'npc' errand does not start (an errand runs) and its end does not end ours
  F.errandEnd('npc');
  ok(F.errandNow() === 'town', "openNpc's errandEnd('npc') does not end the town errand");
  F.errandSoftEnd();
  ok(F.errandNow() === 'town' && S.errand.until === H.t + 20000 && S.followHoldUntil === H.t + 20000, 'after the last step: it ends in 20 s (follow hold too)');
  H.t += 21000;
  ok(F.errandNow() === '' && S.followHoldUntil < H.t, 'then it is over: nothing holds follow any more (the follow check turns it on again)');
  F.errandStart('sell', 900000); const u = S.errand.until;
  F.errandTouch('town', 60000); F.errandSoftEnd();
  ok(S.errand.kind === 'sell' && S.errand.until === u && !S.errand.soft, 'a running !sell (hard) errand is neither replaced nor shortened');
  F.errandEnd();
  H.leader = true; F.errandTouch('town', 60000);
  ok(F.errandNow() === '', 'the leader never gets one (he is followed, he follows nobody)');
}

console.log('3) source wiring');
const gg = SRC.slice(SRC.indexOf('async function giranGo(place) {'), SRC.indexOf('// RESTOCK FLOW (the user'));
ok(/const ownWalk = place !== 'start';/.test(gg) && /if \(ownWalk\) errandTouch\('town', 60000\);/.test(gg), "giranGo: a member's walk to a shop / the warehouse (not 'start') starts the soft errand");
ok(/if \(ownWalk\) errandTouch\('town', 40000\);[^\n]*\n\s*await walkDirect\(p\[0\], p\[1\]/.test(gg), 'giranGo: kept alive leg by leg');
ok(/if \(ownWalk\) errandSoftEnd\(30000\);/.test(gg), 'giranGo: soft end at the end of the walk (the shop step after it extends it)');
const ba = SRC.slice(SRC.indexOf('async function buyAt('), SRC.indexOf('// SHOP SCAN (user 2026-10-06'));
ok(ba.indexOf("errandTouch('town'") > 0 && ba.indexOf("errandTouch('town'") < ba.indexOf('await walkTo(npc.X'), 'buyAt: the soft errand starts before the walk to the merchant');
ok(/errandTouch\('town', 60000\);[^\n]*\n\s*const sh = await openShop\(npc\);/.test(ba), 'buyAt: every shop opening extends it');
ok(/\} finally \{ errandSoftEnd\(\); \}/.test(ba), 'buyAt: ends softly whatever happens (finally)');
const sa = SRC.slice(SRC.indexOf('async function sellAt(npc, why, grades, only) {'), SRC.indexOf('async function sellAt(npc, why, grades, only) {') + 12000);
ok(sa.indexOf("errandTouch('town', 180000)") > 0 && sa.indexOf("errandTouch('town', 180000)") < sa.indexOf('await openShop(npc)'), 'sellAt: the soft errand covers the walk + the sale');
ok(/\} finally \{ errandSoftEnd\(\); \}/.test(sa), 'sellAt: ends softly whatever happens (finally)');
ok(/if \(!isLeader\(\) && typeof errandNow === 'function' && errandNow\(\)\) return false;/.test(fnSrc('function followOk(')), 'followOk: a member on an errand gets no follow');
ok(/errand: !!errandNow\(\)/.test(SRC) && /function ijFollowOffNow\(o\) \{ return !!\(o && !o\.leader && \(o\.errand/.test(SRC), 'the 500 ms keeper turns L2Swarm Follow OFF during any errand');
ok(/if \(errandNow\(\)\) \{ stuckFollow\.since = 0; return; \}/.test(SRC), 'back-to-the-middle / stuck follow wait for the errand');
console.log(`\ntown errand: ${pass} ok, ${fail} failed`);
process.exit(fail ? 1 : 0);
