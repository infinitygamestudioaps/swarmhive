// FLOORSTUCK-2026-11-02: a member that cannot reach a waiting leader (another floor / every escalation step tried) takes its OWN way back
// (RETURN TRIP: .town -> route to the leader) while the leader keeps waiting (team.md R1/R2: never a team regroup in town).
// Replay: academy group 1 at Windawood Manor - Nyxara05 waited 30+ min at z -2000 for Velyn8584 / Myron860 / Xilael90 at z -3936.
const fs = require('fs'), path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '../../../Scripts_dev/swarm.js'), 'utf8');
let ok = 0, bad = 0; const check = (c, m) => { if (c) { ok++; console.log('ok   ' + m); } else { bad++; console.log('FAIL ' + m); } };
const a = SRC.indexOf('var STUCKW = {'), b = SRC.indexOf('\n// TOWN HOLD BUDGET', a);
const { STUCKW, stuckStep } = new Function(SRC.slice(a, b) + '\nreturn { STUCKW, stuckStep };')();
function run(o, ms) { let rec, t0 = 1e9, acts = []; for (let t = 0; t <= ms; t += 2000) { const r = stuckStep(Object.assign({ now: t0 + t, name: 'Velyn8584', d: 2600, rec }, o)); rec = r.rec; if (r.act !== 'none') acts.push({ t, act: r.act }); } return acts; }
// 1) the Windawood replay: another floor (gap 1900), field wait (no next town), no fetch
{ const acts = run({ canFetch: false, nextTown: '', floorGap: true, regroupOk: true }, 40 * 60000), rj = acts.filter(x => x.act === 'rejoin');
  check(rj.length && rj[0].t >= STUCKW.floorMs && rj[0].t < STUCKW.floorMs + 5000, `Windawood replay: another floor -> its own way back after ${STUCKW.floorMs / 1000} s (got ${rj.length ? rj[0].t / 1000 + ' s' : 'never'})`);
  check(rj.length >= 2 && rj[1].t - rj[0].t >= STUCKW.rejoinAgainMs, `sent again only after ${STUCKW.rejoinAgainMs / 60000} min while still stuck (not every tick)`);
  check(!acts.some(x => x.act === 'regroup' || x.act === 'town'), 'team.md R2: never a team regroup in town, the leader keeps waiting'); }
// 2) same floor, every step tried, still stuck -> own way back after regroupMs
{ const acts = run({ canFetch: true, nextTown: '', floorGap: false, regroupOk: true }, 20 * 60000), rj = acts.find(x => x.act === 'rejoin');
  check(acts.some(x => x.act === 'replan') && acts.some(x => x.act === 'fetch') && acts.some(x => x.act === 'unstick'), 'the old steps still come first (re-plan, fetch, click free)');
  check(!!rj && rj.t >= STUCKW.regroupMs, `same floor: own way back only after ${STUCKW.regroupMs / 1000} s without progress (got ${rj ? rj.t / 1000 + ' s' : 'never'})`); }
// 3) a hold before a .townname keeps its own 'town' step; raids / instances / gatekeeper never
check(!run({ canFetch: false, nextTown: 'Giran', floorGap: true, regroupOk: true }, 30 * 60000).some(x => x.act === 'rejoin'), 'a hold with a next .town keeps the old town step');
check(!run({ canFetch: false, nextTown: '', floorGap: true, regroupOk: false }, 30 * 60000).some(x => x.act === 'rejoin'), 'regroupOk off (raid / instance / gatekeeper) = never');
// 4) a member that keeps getting closer is never sent away
{ let rec, t0 = 1e9, d = 600000, hit = false; for (let t = 0; t <= 20 * 60000; t += 2000) { d -= 200; const r = stuckStep({ now: t0 + t, name: 'x', d, rec, canFetch: false, nextTown: '', floorGap: true, regroupOk: true }); rec = r.rec; if (r.act === 'rejoin') hit = true; }
  check(!hit, 'a member that keeps getting closer is never sent on a return trip'); }
// 5) wiring
check(/else if \(r\.act === 'rejoin'\) App\.emit\('swarm\.khreturn', \{ leader: Me\.Name, to: m\.name, floor: floorGap/.test(SRC), 'stuckTick sends the member its return trip (swarm.khreturn -> memberReturnTrip)');
check(/Math\.hypot\(p\.X - Me\.X, p\.Y - Me\.Y\) < 3000 && !\(d\.floor && Math\.abs\(num\(p\.Z\) - Me\.Z\) > 600\)\) return;/.test(SRC), 'the member does not skip the trip when the leader is near on the map but on another floor');
check(!/sw\.regroup/.test(SRC), 'no team regroup in town anywhere in the wait');
// ROUTEFLOOR-2026-11-02: the same inside a MOVE TOGETHER route walk (2nd Windawood case, 22:20-23:10: 50 min at a waypoint, members inside the walk)
{ const i = SRC.indexOf('function mtRejoinPick('), j = SRC.indexOf('\n/** BREATH on a swim leg', i);
  const { mtRejoinPick, mtFloorDropVerdict } = new Function('num', SRC.slice(i, j) + '\nreturn { mtRejoinPick, mtFloorDropVerdict };')(v => Number(v) || 0);
  const t0 = 1e9, mem = (n, zgap, stuck) => ({ name: n, online: true, alive: true, benched: false, left: false, reached: 0, zgap, stuck });
  const base = { phase: 'gate', gate: 1, floorMs: STUCKW.floorMs, allTriesMs: STUCKW.floorMs, againMs: STUCKW.rejoinAgainMs, last: {} };
  const live = [mem('Velyn8584', 2080, { stage: 'wait', since: t0 }), mem('Myron860', 2080, { stage: 'wait', since: t0 }), mem('Xilael90', 2080, { stage: 'wait', since: t0 }), mem('Dravon7827', 208, null)];
  const at = (ms, last) => mtRejoinPick(Object.assign({}, base, { now: t0 + ms, waited: ms, members: live, last: last || {} })).map(p => p.name).join(',');
  check(at(60000) === '', 'route walk replay: not after 1 min (the climbing ladder first)');
  check(at(STUCKW.floorMs) === 'Velyn8584,Myron860,Xilael90', `route walk replay: the 3 on the floor below take their own way back after ${STUCKW.floorMs / 1000} s (got "${at(STUCKW.floorMs)}"), Dravon7827 (same floor, walking) not`);
  check(at(STUCKW.floorMs + 60000, { Velyn8584: t0 + STUCKW.floorMs, Myron860: t0 + STUCKW.floorMs, Xilael90: t0 + STUCKW.floorMs }) === '', 'not resent every tick (only after rejoinAgainMs)');
  check(mtRejoinPick(Object.assign({}, base, { phase: 'leg', now: t0 + 3600e3, waited: 3600e3, members: live })).length === 0, 'only at a waypoint, never during a leg');
  check(mtRejoinPick(Object.assign({}, base, { now: t0 + STUCKW.floorMs, waited: 0, members: [mem('A', 0, { stage: 'wait', since: t0 })] })).length === 1, 'same floor, all tries used for 3 min -> its own way back too');
  check(mtFloorDropVerdict(1, false) === '' && mtFloorDropVerdict(2, false) === 'bad' && mtFloorDropVerdict(2, true) === 'warn', 'two floor drops on an automatic area = bad 24 h; your chosen spot only warns');
  check(/if \(L\.giveUp\) \{ note\(`route to \$\{label\}: giving up this spot/.test(SRC) && /autoLvl\.bad\[key\] = now\(\) \+ 24 \* 3600e3/.test(SRC), 'the walk gives up and the area is skipped for 24 h (the hunt goes on elsewhere)');
  check(/mtRejoinRun\(phase, members, t\)/.test(SRC) && /App\.emit\('swarm\.khreturn', \{ leader: Me\.Name, to: p\.name, floor: p\.floor/.test(SRC), 'mtView sends the return trip through the FLOORSTUCK machinery (swarm.khreturn); the leader keeps waiting'); }
console.log(`floor stuck: ${ok} ok, ${bad} failed`); process.exit(bad ? 1 : 0);
