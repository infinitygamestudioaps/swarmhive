// OFFLINE TEST of CRUMAHOLD-2026-10-24 (public tester, party FindStuff8 / BowShooter2 / FindHelper8, Cruma Tower 1st floor, plan step
// "Go to Giran and buy better gear"): node docs/plan/tools/test_cruma_hold.js  (exit code 1 when a check fails)
//  A) the team hold never walks a dungeon team into the next room (no straight safeSpot(), no long flee route)
//  B) a member alone in a fight runs back to a teammate in reach instead of escaping (healer -> non-healer)
//  C) a member far from a fighting / dead leader never regroups in Giran (team.md R2)
//  D) the plan's own order runs in the leader's window when the party-chat echo does not come back
//  E) res by scroll: the body is targeted with the bot + combat off; no escape while raising a teammate
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(process.env.SWARM_JS || path.join(__dirname, '..', '..', '..', 'Scripts_dev', 'swarm.js'), 'utf8');
let fails = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails++; };
const blk = (b, e) => { const a = src.indexOf(b), z = src.indexOf(e); if (a < 0 || z < a) throw new Error(b + ' not found'); return src.slice(a, z); };
const E = new Function(blk('// ESCPURE-BEGIN', '// ESCPURE-END') + '\nreturn { holdDungeonPlanOk, aloneFightPlan };')();
const J = new Function(blk('// TEAMJOIN-PURE-BEGIN', '// TEAMJOIN-PURE-END') + '\nreturn { rejoinPlan };')();

// ---- A) hold inside a dungeon -------------------------------------------------------------------------------------------------
const lead = { x: 23224, y: 120248 };                              // the leader's corner in the Porta room (cruma-1-right-c)
const longRoute = { src: 'geodata', kind: 'safeSpot', label: 'safe spot "corridor between right-a and behind-a"', points: [{ x: 22400, y: 118300 }, { x: 21000, y: 118200 }, { x: 20500, y: 116000 }, { x: 19064, y: 117064 }] };
check(!E.holdDungeonPlanOk(longRoute, lead, 2500), 'A1 the 8.7k-style hallway run to "corridor between right-a and behind-a" is refused for the team hold');
check(E.holdDungeonPlanOk({ src: 'geodata', kind: 'hallway', points: [{ x: 22900, y: 119400 }, { x: 22300, y: 118700 }] }, lead, 2500), 'A2 a short wall-aware hallway step (< 2500) is walked');
check(!E.holdDungeonPlanOk({ src: 'safeSpot()', kind: 'free', points: [{ x: 23900, y: 120900 }] }, lead, 2500), 'A3 the straight safeSpot() fallback is never walked inside a dungeon');
check(!E.holdDungeonPlanOk({ src: 'away', points: [{ x: 24000, y: 121000 }] }, lead, 2500) && !E.holdDungeonPlanOk(null, lead, 2500), 'A4 "away" fallback / no plan = no walk');
check(/let inDun = ''; try \{ inDun = spot \? tcInDungeon\(\) : ''; \}/.test(src) && /if \(spot && inDun\) \{[\s\S]{0,400}escFleePlan\(\{ maxSafeWalk: 2500 \}\)[\s\S]{0,200}holdDungeonPlanOk\(fp/.test(src), 'A5 hold step 2: dungeon = escFleePlan({ maxSafeWalk: 2500 }) + holdDungeonPlanOk, never the straight walk');
check(/if \(pbDun && !holdDungeonPlanOk\(plan0, \{ x: Me\.X, y: Me\.Y \}, 2500\)\) \{ disengaged = 99; if \(state\.holdPull\) state\.holdPull\.n = HOLD_PULLBACK\.max;/.test(src), 'A6 hold pull-back: inside a dungeon only a short wall-aware way, else fight it out (no more pull-backs)');
check(/maxSafeWalk: \(lim && lim\.maxSafeWalk\) \|\| 6000/.test(src) && /const r = await geoFlee\(dangers, fl, 7000, lim\);/.test(src), 'A7 geoFlee takes the walk limit (default 6000 kept for the lone escape)');

// ---- B) alone in a fight: back to the team ------------------------------------------------------------------------------------
const helper = { x: 16400, y: 117100, z: -12160, healer: true };
const mates = [{ n: 'FindStuff8', x: 23224, y: 120248, z: -12130, dead: false, healer: false }, { n: 'BowShooter2', x: 22900, y: 120000, z: -12130, dead: false, healer: false }];
let r = E.aloneFightPlan(helper, mates, 0);
check(r.act === 'back' && r.to === 'BowShooter2' && r.d < 8000, `B1 the Elder 7.3k from her fighting team runs back (to ${r.to}, ${Math.round(r.d || 0)}), no Scroll of Escape`);
r = E.aloneFightPlan(helper, mates, 3);
check(r.act === 'escape' && /3 run-backs/.test(r.why), 'B2 three run-backs that did not get her there = the escape (rule 6f stays)');
r = E.aloneFightPlan(helper, [{ n: 'FindStuff8', x: 23224, y: 120248, z: -12130, dead: true }], 0);
check(r.act === 'escape', 'B3 only a dead teammate in reach = alone (the escape is allowed)');
r = E.aloneFightPlan(helper, [{ n: 'Healer2', x: 17000, y: 117000, z: -12160, healer: true }], 0);
check(r.act === 'escape', 'B4 a healer never counts another healer as the team to run to');
r = E.aloneFightPlan({ x: 16400, y: 117100, z: -12160 }, [{ n: 'X', x: 17000, y: 117000, z: -9000 }], 0);
check(r.act === 'escape', 'B5 a teammate on another floor (|dz| >= 800) is not in reach');
check(/if \(!isLeader\(\)\) \{\s*const mates = teamNames\(\)[\s\S]{0,600}aloneFightPlan\(/.test(src) && /walkToInner\(ap\.x, ap\.y, ap\.z, 300, 45000/.test(src), 'B6 the watch: members use aloneFightPlan + the wall-aware walk (walkToInner = hallways in a dungeon)');
check(/if \(mate\) \{ aloneFight\.since = 0; aloneFight\.backFails = 0; return; \}/.test(src), 'B7 back with the team = the run-back count starts again');

// ---- C) rejoinPlan: never Giran away from a fighting / dead leader ----------------------------------------------------------------
const T = 1e12, S = 1000;
const base = { d: 25000, farFor: 300 * S, now: T, startedAt: T - 3600 * S, leaderTown: null, myTown: null, hub: 'Giran', lastAt: 0, returnFailedAt: T - 60 * S, returnWhy: 'step 5/5 failed: to FindStuff8' };
r = J.rejoinPlan(base);
check(r.act === 'town' && r.report, 'C1 unchanged: return failed + a calm leader = hub regroup');
r = J.rejoinPlan(Object.assign({}, base, { leaderNeedsMe: 'FindStuff8 is in a fight' }));
check(r.act === 'return' && !r.report && /no Giran regroup/.test(r.why), `C2 the leader fights: the way back again, never Giran (${r.why})`);
r = J.rejoinPlan(Object.assign({}, base, { leaderNeedsMe: 'FindStuff8 is dead (waiting for a res)' }));
check(r.act === 'return', 'C3 the leader is dead in the field: back to him (res), never Giran');
r = J.rejoinPlan(Object.assign({}, base, { leaderNeedsMe: 'x', leaderTown: 'Giran' }));
check(r.act === 'town' && r.town === 'Giran' && !r.report, 'C4 the leader stands in a town: join him there (unchanged)');
check(/leaderNeedsMe: \(\(\) => \{ try \{ const q = livePos\[CONFIG\.leader\];/.test(src), 'C5 the left-behind loop passes leaderNeedsMe');

// ---- D) the plan's order ------------------------------------------------------------------------------------------------------
check(/function planSendLocal\(text\) \{[\s\S]{0,300}handleSay\(Me\.Name, text, 3\);[\s\S]{0,200}oq\.ran\.push\(\{ key: oqKey\(text\), from: Me\.Name/.test(src), 'D1 planSendLocal runs the order in my window, then marks the chat copy as already run (never twice)');
check(/if \(!\(await planAdopt\(text, 20000\)\)\) \{ note\([^\n]{0,160}planSendLocal\(text\); if \(!\(await planAdopt\(text, 20000\)\)\)/.test(src), 'D2 planStepOrder: no echo in 20 s = run it here, not a second party-chat line');
// the chat gate really skips the late echo: run oqChatGate's logic on a tiny copy
{ const oq = { running: null, ran: [{ key: '!gearup', from: 'FindStuff8', at: 1000, used: false }], chat: [] }, OQ = { chatMs: 120000 };
  const gate = new Function('oq', 'OQ', 'now', 'oqKey', 'note', src.slice(src.indexOf('function oqChatGate(from, text) {'), src.indexOf('function oqTick() {')) + '\nreturn oqChatGate;')(oq, OQ, () => 30000, (t) => String(t).trim().toLowerCase(), () => { });
  check(gate('FindStuff8', '!gearup') === true && gate('FindStuff8', '!gearup') === false, 'D3 the late party-chat echo is skipped once (the order ran from planSendLocal)'); }

// ---- E) res by scroll ---------------------------------------------------------------------------------------------------------
check(/try \{ if \(IsEnabled\) \{ botWas = true; DisableBot\(\); \} stopCombatG\(\); \} catch \(e\) \{ \}\s*for \(let i = 0; i < 3 && tgt !== oid; i\+\+\)/.test(src), 'E1 resRun: bot + combat off before targeting the body (finally turns the bot back on)');
check(/inRaid\(\) \|\| inst\.on \|\| resBusy \|\|/.test(src), 'E2 no alone-in-a-fight escape while I walk to / raise a teammate');

console.log(fails ? `\n${fails} check(s) FAILED` : '\nall checks passed');
process.exit(fails ? 1 : 0);
