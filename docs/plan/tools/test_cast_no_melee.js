// test_cast_no_melee.js (2026-11-15): guards CASTNOMELEE in Scripts_dev/swarm.js.
// Owner (Char1's sorcerers, hand-played leader): "Now they are melee hiting a Death Knight????" / "ALWAYS CAST SPELL" / "They are still melee hitting".
// Root: the help-a-teammate handler sent Send.Action on the monster even when it was already my target, then a second Send.Action for casters:
// a second Action on the selected monster = the server's ATTACK (melee walk-in). And every srvAttack path swung for a mage member.
'use strict';
const fs = require('fs'), path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'Scripts_dev', 'swarm.js'), 'utf8');
let fails = 0, n = 0;
const ok = (c, m) => { n++; if (!c) { fails++; console.log('FAIL ' + m); } };

// 1. srvAttackPre: a mage member only selects (once) and never attacks
const pre = SRC.indexOf('function srvAttackPre(o)');
const preBody = SRC.slice(pre, pre + 900);
ok(pre > 0, 'srvAttackPre exists');
ok(/CASTNOMELEE-2026-11-15/.test(preBody), 'srvAttackPre carries the CASTNOMELEE gate');
ok(/function mageMember\(\) \{ try \{ return !isLeader\(\) && \/MAGE\/i\.test\(String\(Me\.ClassType\)\); \}/.test(SRC), 'mageMember = a mage-class member, never the leader');
ok(/if \(mageMember\(\)\) \{ if \(!Target/.test(preBody), 'the gate is for mage members');
// self-defence + help never start L2Swarm combat for a mage member (its skills are off there = melee)
ok(/const how0 = mageMember\(\) && !hiveOwnCombat\(\) \? 'script' : defendHow\(/.test(SRC) && /const how = memberDefendHow\(\{ member: memberNoCombat\(\)/.test(SRC), 'self-defence: a mage member always takes the script way (select, cast loop; MEMBERNOCOMBAT on top)');
ok(/else if \(\(mageMember\(\) && !hiveOwnCombat\(\)\) \|\| memberNoCombat\(\) \|\| defendHow\(\{ stopped: stopCalmStopped\(\), ownCombat: hiveOwnCombat\(\), recHold: recHold\(\), dist: 0 \}\) === 'script'\)/.test(SRC), 'help: a mage member always takes the script way (+ MEMBERNOCOMBAT 2026-11-17)');
ok(/num\(Target\.objId\) !== num\(o\)\) Send\.Action\(o\); return false;/.test(preBody), 'the gate selects only when not selected yet and returns false (no Send.Attack)');
const sa = SRC.indexOf('function srvAttack(id)');
ok(sa > 0 && /if \(!srvAttackPre\(o\)\) return;/.test(SRC.slice(sa, sa + 200)), 'srvAttack stops when srvAttackPre says no');

// 2. the help handler: no Action on a monster that is already my target, no second Action for casters
const h = SRC.indexOf("App.on('swarm.attacked'");
const hb = SRC.slice(h, SRC.indexOf('\n// ASSIST-2026-10-15 (public tester', h));
ok(h > 0, 'help handler found');
ok(/const T0 = Target; if \(!T0 \|\| num\(T0\.objId\) !== num\(mob\.objId\)\) Send\.Action\(mob\.objId\);/.test(hb), 'help selects only when the monster is not my target yet');
ok(!/if \(casterOwnsAttacks\(\)\) \{ try \{ Send\.Action\(mob\.objId\); \} catch \(e\) \{ \} \}/.test(hb), 'the casters\' second Send.Action (= melee) is gone');
const bare = hb.split('\n').filter(l => /^\s*try \{ Send\.Action\(mob\.objId\); \} catch \(e\) \{ \}\s*$/.test(l));
ok(bare.length === 0, 'no unconditional Send.Action(mob) line left in the help handler');

// 3. CASTCHAIN (owner: "the delay between cast is long" / "fix the delay between casts now"): the next request goes out one start latency early
const vm = require('vm');
const cc = SRC.indexOf('function castChainLead(');
ok(cc > 0, 'castChainLead exists');
const ctx = {}; vm.createContext(ctx); vm.runInContext(SRC.slice(cc, SRC.indexOf('\n}\n', cc) + 2), ctx);
ok(ctx.castChainLead(700, 3000) === 600, 'lead capped at 600 ms (latency 700, cast 3 s)');
ok(ctx.castChainLead(400, 3000) === 350, 'lead = latency - 50 (400 -> 350)');
ok(ctx.castChainLead(700, 800) === 400, 'never more than half the cast (0.8 s cast -> 400)');
ok(ctx.castChainLead(0, 3000) === 0 && ctx.castChainLead(500, 0) === 0, 'no latency or no measured cast time = wait for the end');
const cn = SRC.indexOf('async function castNow(info, opts)');
const cnb = SRC.slice(cn, SRC.indexOf('\n/** Mana Potion', cn));
ok(/const lead = castChainLead\(castLat\.v, castLearn\[id\]\);/.test(cnb), 'castNow uses the learned latency and measured cast time');
ok(/if \(chainAt && now\(\) >= chainAt\) \{ ended = now\(\); early = true; break; \}/.test(cnb), 'castNow returns early (chain) at the lead');
ok(/if \(!early && sawCasting && ms > 150/.test(cnb), 'an early (chained) end never teaches a shorter cast time');
ok(/if \(castEnd\.id === id \|\| castEvt\.id === id\) \{/.test(cnb), 'the same skill again still waits for the real end (same-skill gate kept)');

console.log(fails ?`${fails}/${n} FAILED` : `ALL ${n} CHECKS PASS`);
process.exit(fails ? 1 : 0);
