// OFFLINE TEST of the team-join rules (2026-10-09 11:05, party Tank3 "stuck regrouping for a while"). Runs the TEAMJOIN-PURE block of
// Scripts_dev/swarm.js in node:   node docs/plan/tools/test_team_join.js     (exit code 1 when a check fails)
// Covers: the active pre-teleport hold (call / walk over / town port / field give-up instead of "not coming - porting with the others"),
// skipping teammates that are offline or dead for long, the raid-trip gate (whole online team within 3000, far ones -> hub regroup),
// the member rejoin after a reload / raid end (.townname to the leader's town, else the hub), the double-hold reuse, a replay of the
// 09:00-09:07Z Talakin -> Elf Renoa hold, and wiring checks in the host code.
const fs = require('fs'), path = require('path');
const SRC = path.join(__dirname, '..', '..', '..', 'Scripts_dev', 'swarm.js');
const src = fs.readFileSync(SRC, 'utf8');
const a = src.indexOf('// TEAMJOIN-PURE-BEGIN'), b = src.indexOf('// TEAMJOIN-PURE-END');
if (a < 0 || b < a) { console.error('TEAMJOIN-PURE block not found'); process.exit(1); }
const M = new Function(src.slice(a, b) + '\nreturn { TEAMJOIN, teamJoinSplit, holdFarPlan, tripTeamCheck, tripJoinPlan, rejoinPlan, holdReuseOk, STUCKW, stuckStep, TOWNHOLD, townHoldPlan, huntWithoutReturning };')();
let fails = 0, n = 0;
const check = (ok, what) => { n++; console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails++; };
const T = 10000000, S = 1000;
const rage = (d, extra) => Object.assign({ name: 'Chanter4', d, dead: false, ago: 2000 }, extra || {});

// ---- 1) the hold, one straggler --------------------------------------------------------------------------------------------
let p = M.holdFarPlan({ t: 10 * S, now: T, far: [rage(1215)], destIsTown: true });
check(p.act === 'wait', `10 s: wait (${p.why})`);
p = M.holdFarPlan({ t: 31 * S, now: T, far: [rage(1215)], destIsTown: true });
check(p.act === 'call' && p.names[0] === 'Chanter4', `31 s: CALL the straggler (${p.why})`);
p = M.holdFarPlan({ t: 50 * S, now: T, far: [rage(1215)], destIsTown: true, lastCallAt: T - 19 * S });
check(p.act === 'wait', '50 s, called 19 s ago: wait (no call spam)');
p = M.holdFarPlan({ t: 80 * S, now: T, far: [rage(1215)], destIsTown: true, lastCallAt: T - 49 * S });
check(p.act === 'walk' && p.to === 'Chanter4', `80 s: the leader WALKS over (${p.why})`);
p = M.holdFarPlan({ t: 100 * S, now: T, far: [rage(1215)], destIsTown: true, lastCallAt: T - 10 * S, lastWalkAt: T - 20 * S });
check(p.act === 'wait', '100 s, walked 20 s ago, called 10 s ago: wait');
p = M.holdFarPlan({ t: 181 * S, now: T, far: [rage(1215)], destIsTown: true });
check(p.act === 'port', `3 min, TOWN port: go, the straggler uses .town by himself (${p.why})`);
p = M.holdFarPlan({ t: 181 * S, now: T, far: [rage(1215)], destIsTown: false, lastCallAt: T - 5 * S, lastWalkAt: T - 5 * S });
check(p.act === 'wait', '3 min, FIELD port: still no port (wait / call / walk)');
p = M.holdFarPlan({ t: 301 * S, now: T, far: [rage(1215)], destIsTown: false });
check(p.act === 'giveup', `5 min, FIELD port: give the port up, never leave him behind (${p.why})`);
p = M.holdFarPlan({ t: 80 * S, now: T, far: [rage(12000)], destIsTown: false, lastCallAt: T - 1 * S });
check(p.act === 'wait', '80 s, straggler 12000 away (> walk max 8000): no walk; called a second ago -> wait');
p = M.holdFarPlan({ t: 80 * S, now: T, far: [rage(12000)], destIsTown: false, lastCallAt: T - 50 * S });
check(p.act === 'call', '80 s, straggler 12000 away: call again instead of walking');
p = M.holdFarPlan({ t: 80 * S, now: T, far: [rage(1215), { name: 'Nuker10', d: 5000, dead: false, ago: 1000 }], destIsTown: false });
check(p.act === 'walk' && p.to === 'Nuker10', 'two stragglers: walk to the FARTHEST within 8000');

// ---- 2) skipped teammates ----------------------------------------------------------------------------------------------------
p = M.holdFarPlan({ t: 5 * S, now: T, far: [rage(1215, { ago: 200 * S })], destIsTown: false });
check(p.act === 'go' && p.skipped[0].why === 'offline', `offline (no own report for 200 s): not waited for (${p.why})`);
p = M.holdFarPlan({ t: 5 * S, now: T, far: [rage(1215, { dead: true, deadFor: 6 * 60 * S })], destIsTown: false });
check(p.act === 'go' && p.skipped[0].why === 'dead', 'dead for 6 min: skipped');
p = M.holdFarPlan({ t: 40 * S, now: T, far: [rage(1215, { dead: true, deadFor: 60 * S })], destIsTown: false });
check(p.act === 'wait', 'dead for 1 min: waited for (res / respawn), never "called"');
const sp = M.teamJoinSplit([rage(1, { ago: 1e9 }), rage(2), rage(3, { dead: true, deadFor: 1 })]);
check(sp.keep.length === 2 && sp.skip.length === 1, 'teamJoinSplit: no report at all = offline');

// ---- 3) the raid-trip gate -----------------------------------------------------------------------------------------------------
const team = (over) => ['Destroyer9', 'Nuker11', 'Nuker7', 'Bishop4', 'Chanter4', 'Nuker9', 'Nuker8', 'Nuker10']
  .map(nm => Object.assign({ name: nm, d: 400, dead: false, ago: 2000 }, (over || {})[nm] || {}));
let c = M.tripTeamCheck({ members: team() });
check(c.ok, 'whole team within 3000: the trip may start');
c = M.tripTeamCheck({ members: team({ Chanter4: { d: 1215 } }) });
check(c.ok, 'Chanter4 1215 away: still "with me" for a trip (within 3000; the port hold gathers to 900)');
c = M.tripTeamCheck({ members: team({ Nuker9: { d: 132214 }, Nuker8: { d: 132214 }, Nuker10: { d: 132214 } }) });
check(!c.ok && c.missing.length === 3 && c.far.length === 3, '3 members 132k away: NOT ok, all three in another region');
let tp = M.tripJoinPlan({ t: 5 * S, now: T, members: team({ Nuker9: { d: 132214 } }), check: M.tripTeamCheck({ members: team({ Nuker9: { d: 132214 } }) }) });
check(tp.act === 'wait', '5 s: give the server follow a moment');
tp = M.tripJoinPlan({ t: 25 * S, now: T, members: team({ Nuker9: { d: 132214 } }), check: M.tripTeamCheck({ members: team({ Nuker9: { d: 132214 } }) }) });
check(tp.act === 'hub', `25 s, one teammate 132k away: everyone meets in the hub town (${tp.why})`);
tp = M.tripJoinPlan({ t: 60 * S, now: T, hubTried: true, members: team({ Nuker9: { d: 132214 } }), check: M.tripTeamCheck({ members: team({ Nuker9: { d: 132214 } }) }) });
check(tp.act === 'call', 'after the hub regroup he is still far: call him (no second hub trip)');
tp = M.tripJoinPlan({ t: 601 * S, now: T, hubTried: true, members: team({ Nuker9: { d: 132214 } }), check: M.tripTeamCheck({ members: team({ Nuker9: { d: 132214 } }) }) });
check(tp.act === 'giveup', '10 min: the trip does not start');
c = M.tripTeamCheck({ members: team({ Nuker9: { d: 132214, ago: 300 * S } }) });
check(c.ok && c.skipped[0].name === 'Nuker9', 'a teammate offline for 5 min does not block the trip');
c = M.tripTeamCheck({ members: team({ Nuker7: { d: 300, dead: true, deadFor: 30 * S } }) });
check(!c.ok && c.missing[0] === 'Nuker7' && !c.far.length, 'a teammate dead next to me for 30 s: wait (res first)');

// ---- 4) member rejoin -----------------------------------------------------------------------------------------------------------
let r = M.rejoinPlan({ d: 61926, farFor: 9 * S, now: T, startedAt: T - 20 * S, leaderTown: 'Gludin', myTown: null, hub: 'Giran', lastAt: 0 });
check(r.act === 'town' && r.town === 'Gludin' && !r.report, `right after a reload, leader in Gludin 62k away: .gludin to him (${r.why})`);
r = M.rejoinPlan({ d: 61926, farFor: 9 * S, now: T, startedAt: T - 3600 * S, leaderTown: 'Gludin', myTown: null, hub: 'Giran', lastAt: 0 });
check(r.act === 'wait', 'normal running: 9 s far is not enough yet (30 s)');
r = M.rejoinPlan({ d: 61926, farFor: 31 * S, now: T, startedAt: T - 3600 * S, leaderTown: null, myTown: null, hub: 'Giran', lastAt: 0 });
check(r.act === 'return' && !r.report, `leader in the field: a RETURN TRIP back to the team, no hub regroup (${r.why})`);
r = M.rejoinPlan({ d: 61926, farFor: 31 * S, now: T, startedAt: T - 3600 * S, leaderTown: null, myTown: null, hub: 'Giran', lastAt: 0, returnFailedAt: T - 120 * S, returnWhy: 'no way from Dion to floor 2 of Cruma Tower' });
check(r.act === 'town' && r.town === 'Giran' && r.report && /no way from Dion/.test(r.why), `the return trip failed 2 min ago: hub regroup + report, with the reason (${r.why})`);
r = M.rejoinPlan({ d: 71000, farFor: 9 * S, now: T, startedAt: T - 8 * S, leaderTown: null, myTown: 'Dion', hub: 'Giran', lastAt: 0 });
check(r.act === 'return', 'respawned in town 8 s ago (revivedAt = the fast window): the return trip starts at once');
r = M.rejoinPlan({ d: 61926, farFor: 31 * S, now: T, startedAt: 0, leaderTown: 'Gludin', myTown: null, hub: 'Giran', raidFight: true, lastAt: 0 });
check(r.act === 'none', 'in a real raid fight: never leaves');
r = M.rejoinPlan({ d: 9000, farFor: 300 * S, now: T, startedAt: 0, leaderTown: 'Gludin', hub: 'Giran', lastAt: 0 });
check(r.act === 'none', '9000 away: not "left behind" (the follow / call handles it)');
r = M.rejoinPlan({ d: 61926, farFor: 300 * S, now: T, startedAt: 0, leaderTown: 'Gludin', hub: 'Giran', lastAt: T - 60 * S });
check(r.act === 'wait', 'tried a minute ago: wait (2 min gap)');

// ---- 5) double hold ----------------------------------------------------------------------------------------------------------
check(M.holdReuseOk({ last: { at: T - 4 * S }, now: T, moved: 10, fighting: false }), "'.gludin' 4 s after the 'Gludin' hold, same spot: reuse it (no second 2-3 min wait)");
check(!M.holdReuseOk({ last: { at: T - 4 * S }, now: T, moved: 10, fighting: true }), 'someone fights: a full hold again');
check(!M.holdReuseOk({ last: { at: T - 4 * S }, now: T, moved: 5000, fighting: false }), 'teleported since: a full hold again');
check(!M.holdReuseOk({ last: { at: T - 120 * S }, now: T, moved: 0, fighting: false }), '2 min old: a full hold again');
check(!M.holdReuseOk({ last: null, now: T, moved: 0, fighting: false }), 'no earlier hold: a full hold');

// ---- 6) replay: 2026-10-09 09:00-09:07Z, Chanter4 1215 from the leader, destination Gludin (a town) ---------------------------
// OLD: hold 'Gludin' 2 min -> "not coming", the 11:02 reload restarted it, hold 'Gludin' 2 min + hold '.gludin' 2 min = 7 min, no call, no walk.
// NEW: one hold; call at 30 s, the leader walks over at 75 s; a still-stuck Chanter4: port after 3 min (he .gludin's by himself), the
//      '.gludin' hold reuses the 'Gludin' one.
{
  const acts = []; let callAt = 0, walkAt = 0, portAt = 0;
  for (let t = 0; t <= 200 * S && !portAt; t += S) {
    const q = M.holdFarPlan({ t, now: T + t, far: [rage(1215)], destIsTown: true, lastCallAt: callAt, lastWalkAt: walkAt });
    if (q.act === 'call') { callAt = T + t; acts.push('call@' + t / S); }
    if (q.act === 'walk') { walkAt = T + t; acts.push('walk@' + t / S); }
    if (q.act === 'port') { portAt = t; acts.push('port@' + t / S); }
  }
  console.log('     replay: ' + acts.join(' '));
  check(acts[0] === 'call@30', 'replay: the first call after 30 s');
  check(acts.includes('walk@75'), 'replay: the leader walks over at 75 s');
  check(portAt === 180 * S, 'replay: town port after 3 min (old: 7 min incl. the double hold and the reload)');
  check(M.holdReuseOk({ last: { at: T + portAt + 3 * S }, now: T + portAt + 6 * S, moved: 0, fighting: false }), "replay: the '.gludin' hold right after reuses it");
}

// ---- 7) wiring in the host code ------------------------------------------------------------------------------------------------
check(!/not coming \(far away\) - porting with the others/.test(src), "the old 'not coming - porting with the others' break is gone");
check(/holdFarPlan\(\{ t: now\(\) - t0/.test(src) && /App\.emit\('swarm\.comehere'/.test(src), 'teamRegroupBeforePortInner uses holdFarPlan and emits swarm.comehere');
check(/App\.on\('swarm\.comehere'/.test(src) && /walkToInner\(d\.x, d\.y/.test(src), 'members answer swarm.comehere with the wall-aware walk');
check(/comeHere\.busy \|\| unstickRun\.busy \|\| resBusy/.test(src), "the native-nav script follow pauses while the leader's call / the unstick walks me");
check(/Options\.ActiveFollow \|\| \(leadMode\(\) && !benched\(\)\)\)\) \{ NNAV\.wantFollow = true/.test(src), 'guard on: members always get the script follow (also right after a reload)');
check(/holdLast = \{ at: now\(\), what/.test(src) && /holdReuseOk\(\{ last: holdLast/.test(src), 'the double hold is reused');
const hunt = src.slice(src.indexOf('async function raidHuntLoop'), src.indexOf('async function raidHuntLoop') + 12000);
check(/ensureTeamForTrip\(`raidhunt: /.test(hunt) && hunt.indexOf('ensureTeamForTrip') < hunt.indexOf("await leaderMission('raid'"), 'raidhunt: the team gate runs before every boss (no skip when not together)');
const lm = src.slice(src.indexOf('async function leaderMission'), src.indexOf('async function leaderMission') + 16000);
check(/ensureTeamForTrip\(`raid \$\{boss\.name\}`/.test(lm), 'leaderMission raid (lead mode): the team gate before setting off');
check(/!teamMiss\) raidUnreachable/.test(lm), 'a port dropped for a missing teammate does not count the boss as unreachable');
check(/raidFightNow\(\)\) \{ lb\.since = 0; return; \}/.test(src) && /rejoinPlan\(\{ d, farFor/.test(src), 'left-behind loop: raid/mission state no longer blocks it, rejoinPlan decides');
check(/j\.phase === 'trip'/.test(src) && /raidActiveWrite\(boss\.name, false, 'fight'\)/.test(src), "'raid across a restart' tells a trip target from a fight");

// ---- 8) STUCK MEMBER ESCALATION (user 2026-10-09 13:05: Nuker9 ran uphill 1.4k from the leader before '.giran') ---------------
{
  const run = (o, secsList, dAt) => {   // replays a member at a fixed distance (dAt(t) optional), returns 'act@s' for every action
    let rec = null; const acts = [];
    for (let t = 0; t <= secsList; t++) {
      const r = M.stuckStep(Object.assign({ now: T + t * S, name: 'Nuker9', d: dAt ? dAt(t) : 1400, rec }, o));
      rec = r.rec; if (r.act !== 'none') acts.push(`${r.act}@${t}`);
    }
    return acts;
  };
  let a = run({ canFetch: true, nextTown: 'Giran' }, 250);
  console.log('     stuck replay (fetch + .giran possible): ' + a.join(' '));
  check(a[0] === 'replan@18', 'step 1: not getting closer for 18 s -> re-plan a route');
  check(a[1] === 'fetch@48', 'step 2: 30 s later the leader goes back to fetch it');
  check(a[2] === 'town@78', "step 3: 30 s later it uses the next .townname (.giran) by itself");
  check(a[3] === 'unstick@123' && a[4] === 'unstick@243', 'step 4: 45 s later click free, repeated every 2 min');
  a = run({ canFetch: false, nextTown: 'Giran' }, 130);
  check(a.join() === 'replan@18,town@48,unstick@93', `no fetch (too far / danger): re-plan -> .giran -> unstick (${a.join(' ')})`);
  a = run({ canFetch: true, nextTown: 'Giran', inCombat: true }, 130);
  check(a.join() === 'replan@18,fetch@48,unstick@93', `in combat: never the .town step (${a.join(' ')})`);
  a = run({ canFetch: false, nextTown: 'Giran', inDungeon: true }, 70);
  check(a.join() === 'replan@18,unstick@63', `in a dungeon, nothing to fetch: re-plan -> unstick (${a.join(' ')})`);
  a = run({ canFetch: true, nextTown: '' }, 130);
  check(a.join() === 'replan@18,fetch@48,unstick@93', `no .town next (field port / checkpoint): no town step (${a.join(' ')})`);
  a = run({ canFetch: true, nextTown: 'Giran', routeStuck: true }, 10);
  check(a[0] === 'replan@6', 'its own route reports stuck: re-plan after 6 s');
  a = run({ canFetch: true, nextTown: 'Giran' }, 60, (t) => (t < 25 ? 1400 : 1400 - (t - 24) * 60));
  check(a.join() === 'replan@18', `it moves after the re-plan (150+ closer): the escalation resets, no fetch (${a.join(' ')})`);
  a = run({ canFetch: true, nextTown: 'Giran' }, 40, (t) => 1400 - t * 20);
  check(a.length === 0, 'walking towards the leader steadily (20/s): never escalated');
  let r = M.stuckStep({ now: T + 25 * S, name: 'Nuker9', d: 1400, rec: { best: 1400, progAt: T, stage: 0, stageAt: T } });
  check(/Nuker9 stuck 25 s — re-planning a route/.test(r.label), `wait line: "${r.label}"`);
  r = M.stuckStep({ now: T + 60 * S, name: 'Nuker9', d: 1400, canFetch: true, nextTown: 'Giran', rec: { best: 1400, progAt: T, stage: 1, stageAt: T + 25 * S } });
  check(/going back to fetch Nuker9/.test(r.label), `wait line: "${r.label}"`);
  r = M.stuckStep({ now: T + 95 * S, name: 'Nuker9', d: 1400, canFetch: true, nextTown: 'Giran', rec: { best: 1400, progAt: T, stage: 2, stageAt: T + 60 * S } });
  check(/Nuker9 will \.giran on its own/.test(r.label), `wait line: "${r.label}"`);
}
// ---- 9) stuckTick with MOCKS (the host side: what is sent to whom, the fetch walk, who is no longer waited for) -----------------
(async () => {
  const fn = (name) => { const i = src.indexOf(name), j = src.indexOf('\n}\n', i); return src.slice(i, j + 2); };
  const code = fn('function stuckWatch(') + fn('async function stuckTick(');
  let clock = T; const emits = [], walks = [], notes = [], holds = [];
  const env = {
    livePos: { Nuker9: { Z: -3000, fight: false }, Nuker7: { Z: -3000, fight: true }, Necra: { Z: -3000 } },
    Me: { X: 0, Y: 0, Z: -3000, Name: 'Tankard', IsDead: false },
    dangerAt: (x) => (x > 5000 ? 70 : 20), dungeonAt: () => null, STUCKW: M.STUCKW, teamMaxLevel: () => 32, CONFIG: { danger: { margin: 6 } },
    inst: { on: false }, state: {}, stuckStep: M.stuckStep, now: () => clock, note: (m) => notes.push(m), intent: () => { }, pstHold: (w, m) => holds.push(m),
    App: { emit: (e, d) => emits.push(e + ' ' + (d.names || []).join(',') + (d.town ? ' ' + d.town : '') + (d.replan ? ' replan' : '')) },
    walkToInner: async (x, y) => { walks.push(`${x},${y}`); }, TOWN_CMD: { Giran: 'giran' }, waitWalk: async (p) => p, sleep: async () => { },
  };
  const H = new Function(...Object.keys(env), code + '\nreturn { stuckWatch, stuckTick };')(...Object.values(env));
  const sw = H.stuckWatch('.giran', 'Giran');
  const far = () => [{ name: 'Nuker9', d: 1400, p: { X: 1400, Y: 0 } }, { name: 'Nuker7', d: 1600, p: { X: 0, Y: 1600 } }, { name: 'Necra', d: 6000, p: { X: 6000, Y: 0 } }];
  const at = {};
  for (let t = 0; t <= 100; t++) { clock = T + t * S; const before = emits.length + walks.length; const left = await H.stuckTick(sw, far()); if (emits.length + walks.length > before) at[t] = emits.slice(-3).concat(walks.slice(-1)).join(' | '); if (t === 100) at.left = left.map(m => m.name).join(','); }
  console.log('     mocked host ticks: ' + JSON.stringify(at));
  check(emits.filter(e => /swarm\.comehere Nuker9 replan/.test(e)).length === 1 && emits.some(e => /swarm\.comehere Nuker7 replan/.test(e)), 'step 1 sends swarm.comehere {replan} to each stuck member');
  check(walks.includes('1400,0') && walks.includes('0,1600'), 'step 2: the leader walks back to the ones within 3000 (Nuker9, Nuker7)');
  check(!walks.includes('6000,0'), 'never fetches one 6000 away / next to dangerous monsters');
  check(emits.some(e => /swarm\.jointown Nuker9 Giran/.test(e)) && emits.some(e => /swarm\.jointown Necra Giran/.test(e)), 'step 3: swarm.jointown Giran to the out-of-combat ones');
  check(!emits.some(e => /swarm\.jointown Nuker7/.test(e)) && emits.some(e => /swarm\.unstick Nuker7/.test(e)), 'Nuker7 (in a fight) never gets the .town step — unstick instead');
  check(at.left === 'Nuker7', `the ones sent to Giran by themselves are no longer waited for (left: ${at.left})`);
  check(notes.some(m => /\[gather\] \.giran: Nuker9 stuck \d+ s — re-planning a route/.test(m)) && holds.some(m => /going back to fetch/.test(m)) && holds.some(m => /will \.giran on its own/.test(m)), 'every step is logged ([gather] note) and shown in the wait line (partyStatus hold)');
  check(/hsw = stuckWatch\(what, dTown, \{ noFetch: !!dTown \}\)/.test(src) && /await stuckTick\(hsw, teamToWaitFor\(\)/.test(src), 'wired: the pre-teleport hold (with its .town destination)');
  check(/await stuckTick\(sw, teamToWaitFor\(\)\.filter\(m => !m\.dead && m\.d > g\.checkpointDist\)/.test(src), 'wired: checkpoint waits (waitForTeamHere)');
  check(/const near = await stuckTick\(sw, far0/.test(src), 'wired: gatherTeam');
  check(/await stuckTick\(tsw, members\.filter/.test(src), 'wired: the raid-trip gate (ensureTeamForTrip)');
  check(/App\.on\('swarm\.jointown'/.test(src) && /App\.on\('swarm\.unstick'/.test(src) && /if \(d\.replan\) \{ comeHere\.gen\+\+/.test(src), 'members: jointown (.town by itself), unstick (freeFromTerrain), comehere re-plan drops the old walk');

  // ---- 10) a TOWN port hold (.giran): no fetch walks, the stuck ones .giran by themselves (mocked host) -----------------------------
  { const sw2 = H.stuckWatch('.giran', 'Giran', { noFetch: true }); walks.length = 0; emits.length = 0;
    for (let t = 0; t <= 60; t++) { clock = T + 1000 * S + t * S; await H.stuckTick(sw2, far()); }
    check(walks.length === 0, 'town port: the leader never walks back to fetch (TOWNHOLD)');
    check(emits.some(e => /swarm\.jointown Nuker9 Giran/.test(e)) && emits.some(e => /swarm\.jointown Necra Giran/.test(e)), `town port: re-plan at 18 s, the stuck ones .giran by themselves at 48 s (${emits.filter(e => /jointown/.test(e)).length} sent)`); }

  // ---- 11) TOWN HOLD BUDGET (user 2026-10-09 13:00: a 15-min '.giran' regroup) ---------------------------------------------------
  let p = M.townHoldPlan({ t: 30 * S, fightMs: 0, fighting: false, far: 3 });
  check(p.act === 'gather', `30 s, 3 not here: still gathering (${p.why})`);
  p = M.townHoldPlan({ t: 76 * S, fightMs: 0, fighting: false, far: 3 });
  check(p.act === 'port' && /use the same \.town by themselves/.test(p.why), `75 s: port, the 3 not here .town by themselves (${p.why})`);
  p = M.townHoldPlan({ t: 76 * S, fightMs: 40 * S, fighting: true, far: 1 });
  check(p.act === 'help', 'a real fight: helped first');
  p = M.townHoldPlan({ t: 200 * S, fightMs: 121 * S, fighting: true, far: 1 });
  check(p.act === 'port' && /escape rules/.test(p.why), `fight not over after 2 min: port anyway, the fighters follow the escape rules (${p.why})`);
  // replay 10:47-11:02 UTC: everyone 900-2100 from the leader, Nuker9 + Nuker8 stuck, nobody fighting -> port at 75 s; the stuck
  // ones got swarm.jointown at 48 s; with ~5 s for the .giran casts everyone is in Giran ~80 s after the start (old: 15 min 12 s)
  { let portAt = 0; for (let t = 0; t <= 600 && !portAt; t++) { const q = M.townHoldPlan({ t: t * S, fightMs: 0, fighting: false, far: 2 }); if (q.act === 'port') portAt = t; }
    const regroup = portAt + 3 + 5;                              // announce 3 s + the .giran
    console.log(`     expected Giran regroup: port at ${portAt} s, everyone in Giran ~${regroup} s (target < 120 s; old 912 s)`);
    check(portAt === 75 && regroup < 120, `the whole Giran regroup now takes ~${regroup} s`); }
  check(/if \(dTown\) \{\s*const fightingNow/.test(src) && /townHoldPlan\(\{ t: now\(\) - t0, fightMs: th\.fightMs/.test(src) && /App\.emit\('swarm\.jointown', \{ leader: Me\.Name, names: go, town: dTown/.test(src), 'wired: the hold checks the budget first every tick, then ports; jointown to the ones not here');
  check(/\(dTown && hp\.act === 'walk'\)/.test(src), 'town port: the hold never walks over to a straggler');
  check((src.match(/await waitWalk\(walkToInner\(/g) || []).length >= 4 && /async function waitWalk\(p, ms\)/.test(src), 'every leader walk inside a wait has a hard time limit (the 10:49 walk that never returned)');

  // ---- 12) RETURN TRIP (user 2026-10-09 13:04: Chanter1 respawned, the whole party left Cruma floor 2) -------------------------------
  check(M.huntWithoutReturning({ here: [{ role: 'sk' }, { role: 'bishop' }, { role: 'destroyer' }, { role: 'necromancer' }, { role: 'doomcryer' }], total: 9 }), 'healer + 5 of 9 here: the team keeps hunting while Chanter1 comes back');
  check(!M.huntWithoutReturning({ here: [{ role: 'sk' }, { role: 'destroyer' }, { role: 'necromancer' }, { role: 'doomcryer' }, { role: 'inspector' }], total: 9 }), 'no healer here: the team holds (waits) instead of hunting');
  check(!M.huntWithoutReturning({ here: [{ role: 'sk' }, { role: 'bishop' }, { role: 'destroyer' }], total: 9 }), '3 of 9 here: holds');
  check(!M.huntWithoutReturning({ here: [{ role: 'sk' }, { role: 'bishop', dead: true }, { role: 'destroyer' }, { role: 'necromancer' }, { role: 'doomcryer' }], total: 9 }), 'the healer here is dead: holds');
  check(/async function memberReturnTrip\(why\)/.test(src) && /rescuePlan\(dungeonRooms\(\), \{ x: Me\.X, y: Me\.Y, z: Me\.Z \}, to, \{ name: CONFIG\.leader \}\)/.test(src) && /await buffSelf\('return trip: rebuff before going back', true\)/.test(src), 'member: rebuff in town, then the rescue planner route (.town -> gatekeeper -> floors) back to the leader');
  check(/if \(rj\.act === 'return'\) \{[^\n]*\n\s*memberReturnTrip/.test(src) && /startedAt: Math\.max\(lbStartedAt, state\.revivedAt \|\| 0\)/.test(src), 'member: left-behind loop starts the return trip, at once after a respawn');
  check(/App\.on\('swarm\.backtrip'/.test(src) && /is on its way back \(\$\{d\.route/.test(src), "leader: shows 'X is on its way back (route)' (partyStatus hold + note)");
  check(/const ret = far\.filter\(m => !m\.dead && returningMate\(m\.name\)\)/.test(src) && /!returningMate\(m\.name\) && now\(\) - \(gFarSince\[m\.name\] \|\| now\(\)\) > 60000/.test(src), "gatherTeam: hunts on (or holds) for a returning member; 'everyone meets in Giran' only after 60 s for one NOT on its way back");
  check(/if \(d > 15000 && returningMate\(n\)\) \{ delete splitWatch\.farSince\[n\]; return; \}/.test(src), 'split watchdog: a returning member is no split');
  console.log(`\n${n - fails}/${n} checks passed`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
