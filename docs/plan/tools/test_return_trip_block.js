// OFFLINE TEST of the 2026-10-13 brain-host freeze fix (party Tank2: the watchdog killed the worker 6x in 7 min, "context Chanter3 /
// Nuker6 after an await ... 7.8 s"). Nuker6 + Chanter3 were on a RETURN TRIP from Schuttgart (87355,-142095) to their leader inside a
// Kamaloka (-81973,-206189,-8096, 181k): the 'travel' step's walker got no answer from the path finder (20 s), and its recorded-route fallback
// merged all 61 walk files (69 MB) synchronously (~10 s). Every kill restarted the worker, which forgot the failed trip -> same trip again.
//   node docs/plan/tools/test_return_trip_block.js        (exit code 1 when a check fails)
// Covers: WALKREC block (recorded routes: region graph, grid nearest, heap A*, every slice short — measured with a heartbeat like the brain
// host's watchdog, on the REAL Logs/walkpaths files), ESCPURE rescuePlan (leader inside an instance = no plan, < 1 s; dungeon floors as before),
// TEAMJOIN rejoinPlan (leader in an instance = wait; return backoff 10/20/40/60 min; retry count over 2 h), and source checks of the host glue.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const src = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
let fails = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails++; };
const block = (name) => { const a = src.indexOf(`// ${name}-BEGIN`), b = src.indexOf(`// ${name}-END`); if (a < 0 || b < a) { console.error(name + ' block not found'); process.exit(1); } return src.slice(a, b); };
const W = new Function(block('WALKREC-PURE') + '\nreturn { WALKREC, recBox, recBoxHas, recIn, recGraphBuild, recNearest, recAStar };')();
const E = new Function(block('ESCPURE') + '\nreturn { rescuePlan, dzFloor };')();
const J = new Function(block('TEAMJOIN-PURE') + '\nreturn { TEAMJOIN, rejoinPlan, returnBackoffMs, returnFailCount, leaderInsideInstance };')();
const D = JSON.parse(fs.readFileSync(path.join(ROOT, 'Scripts', 'data', 'dungeon_rooms.json'), 'utf8').replace(/^﻿/, ''));

const SCHUTT = { x: 87355, y: -142095, z: -1344 }, LEADER = { x: -81973, y: -206189, z: -8096 };
const S = 1000, MIN = 60000;

(async () => {
  // ---- 1) ESCPURE: the incident plan --------------------------------------------------------------------------------------------------
  let t0 = Date.now();
  let p = E.rescuePlan(D, SCHUTT, LEADER, { name: 'Tank2' });
  const ms = Date.now() - t0;
  check(p && !p.ok && p.instance === true && /inside an instance/.test(p.why || ''), `Schuttgart -> Tank2 in the Kamaloka (181k, z -8096): no plan, instance (${p && p.why})`);
  check(ms < 1000, `rescuePlan for that case finishes in ${ms} ms (< 1000)`);
  p = E.rescuePlan(D, { x: 83473, y: 148554, z: -3408 }, { x: 16952, y: 110248, z: -9312 }, { name: 'Bishop1' });
  check(p.ok && p.kind === 'floors', `Giran -> Cruma 2nd floor (z -9312, a known floor) still plans the floors (${p.route})`);
  p = E.rescuePlan(D, { x: -88429, y: -220629, z: -7903 }, { x: -88998, y: -220077, z: -7892 }, { name: 'Tank2' });
  check(p.ok && p.kind === 'walk', `both inside the same Kamaloka Hall: a walk (${p.kind})`);
  p = E.rescuePlan(D, SCHUTT, { x: -84744, y: 81384, z: -3216 }, { name: 'Destroyer6' });
  check(p.ok && p.kind === 'travel', `open world far away (normal height): travel as before (${p.kind})`);

  // ---- 2) TEAMJOIN: wait while the leader is in an instance, back off failed return trips ------------------------------------------------
  check(J.leaderInsideInstance(-8096, false) && !J.leaderInsideInstance(-9312, true) && !J.leaderInsideInstance(-3400, false) && !J.leaderInsideInstance(null, false),
    'leaderInsideInstance: z -8096 on no floor = instance; Cruma floor / normal height / unknown z = not');
  const T = 1e12, base = { d: 181053, farFor: 60 * S, now: T, startedAt: 0, leaderTown: null, myTown: 'Schuttgart', hub: 'Giran', lastAt: 0 };
  let r = J.rejoinPlan(Object.assign({}, base, { leaderInInstance: true }));
  check(r.act === 'wait' && r.instance, `leader in an instance: wait (${r.why})`);
  r = J.rejoinPlan(Object.assign({}, base));
  check(r.act === 'return', 'leader in the field, no failure yet: return trip');
  check(J.returnBackoffMs(1) === 10 * MIN && J.returnBackoffMs(2) === 20 * MIN && J.returnBackoffMs(3) === 40 * MIN && J.returnBackoffMs(4) === 60 * MIN && J.returnBackoffMs(9) === 60 * MIN,
    'backoff: 10, 20, 40, 60 (cap) min');
  r = J.rejoinPlan(Object.assign({}, base, { returnFailedAt: T - 15 * MIN, returnBackoffMs: J.returnBackoffMs(2) }));
  check(r.act === 'town' && r.report, `2nd failure 15 min ago (backoff 20 min): hub regroup, no new trip (${r.act})`);
  r = J.rejoinPlan(Object.assign({}, base, { returnFailedAt: T - 25 * MIN, returnBackoffMs: J.returnBackoffMs(2) }));
  check(r.act === 'return', '2nd failure 25 min ago: try again');
  r = J.rejoinPlan(Object.assign({}, base, { returnFailedAt: T - 5 * MIN }));
  check(r.act === 'town', 'no backoff given = the old 10 min window');
  check(J.returnFailCount(null, LEADER, T) === 1 && J.returnFailCount({ fails: 2, failedAt: T - 30 * MIN, x: LEADER.x, y: LEADER.y }, LEADER, T) === 3
    && J.returnFailCount({ fails: 2, failedAt: T - 30 * MIN, x: 0, y: 0 }, LEADER, T) === 1 && J.returnFailCount({ fails: 5, failedAt: T - 3 * 3600 * S, x: LEADER.x, y: LEADER.y }, LEADER, T) === 1,
    'fail count: +1 for the same place, 1 again for another place (> 20k) or after 2 h');
  // simulation: the left-behind loop every 10 s for 2 h, every return trip fails at once (old: a worker restart forgot the failure)
  const sim = (instance, persist) => {
    let st = { failedAt: 0, fails: 0, x: null, y: null }, lastAt = 0, trips = 0;
    for (let t = T; t < T + 120 * MIN; t += 10 * S) {
      const q = J.rejoinPlan(Object.assign({}, base, { now: t, lastAt, returnFailedAt: st.failedAt, returnBackoffMs: persist ? J.returnBackoffMs(st.fails) : undefined, leaderInInstance: instance }));
      if (q.act !== 'return' && q.act !== 'town') continue;
      lastAt = t;
      if (q.act === 'return') { trips++; const f = J.returnFailCount(st.failedAt ? st : null, LEADER, t); st = { failedAt: t, fails: f, x: LEADER.x, y: LEADER.y }; }
    }
    return trips;
  };
  const nOld = sim(false, false), nNew = sim(false, true), nInst = sim(true, true);
  check(nNew <= 5 && nNew < nOld, `2 h of failing return trips: ${nNew} trips with the backoff (fixed 10 min window: ${nOld})`);
  check(nInst === 0, `leader inside an instance for 2 h: ${nInst} trips`);

  // ---- 3) WALKREC on the real walk files: no slice near the 8 s watchdog -------------------------------------------------------------------
  const dir = path.join(ROOT, 'Logs', 'walkpaths');
  const names = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => /^walk_.+\.json$/.test(f) && f !== 'walk_null.json').map(f => f.slice(5, -5)) : [];
  const read = (n) => { try { return JSON.parse(fs.readFileSync(path.join(dir, `walk_${n}.json`), 'utf8')); } catch (e) { return null; } };
  // heartbeat like the brain host's watchdog (pool.js: every 250 ms from the event loop): the longest gap = the longest synchronous slice
  const hb = { last: Date.now(), max: 0 };
  const beat = setInterval(() => { const t = Date.now(); hb.max = Math.max(hb.max, t - hb.last); hb.last = t; }, 5);
  const io = { names, read, yield: () => new Promise(res => setTimeout(res, 0)), clock: () => Date.now() };
  const run = async (what, fn) => { hb.last = Date.now(); hb.max = 0; const t1 = Date.now(); const v = await fn(); const gap = Math.max(hb.max, Date.now() - hb.last); return { v, ms: Date.now() - t1, gap, what }; };
  if (!names.length) console.log('skip WALKREC real-data checks: no Logs/walkpaths files');
  else {
    // the incident box (the host glue: recBox(me, target, 3000) + margin)
    const b0 = W.recBox(SCHUTT.x, SCHUTT.y, LEADER.x, LEADER.y, 3000), big = [b0[0] - W.WALKREC.margin, b0[1] + W.WALKREC.margin, b0[2] - W.WALKREC.margin, b0[3] + W.WALKREC.margin];
    let q = await run('incident graph', () => W.recGraphBuild(big, io));
    const g = q.v;
    check(q.gap < 1000, `incident box: graph of ${g.cells} cells from ${g.files} files in ${q.ms} ms, longest synchronous slice ${q.gap} ms (< 1000; watchdog 8000)`);
    const s = W.recNearest(g, SCHUTT.x, SCHUTT.y, 500), t = W.recNearest(g, LEADER.x, LEADER.y, 700);
    q = await run('incident A*', async () => (s && t && s !== t) ? W.recAStar(g, s, t, io) : { path: null, why: 'no cells', iter: 0 });
    check(q.gap < 1000 && q.ms < 6000, `incident A* (${s} -> ${t}): ${q.v.path ? q.v.path.length + ' cells' : 'no route (' + q.v.why + ')'} in ${q.ms} ms, longest slice ${q.gap} ms`);
    // a normal short walk in a busy area (Giran) with a route that exists: start cell -> a cell 40 edges further
    const G = [83473 - 3000, 83473 + 3000, 148554 - 3000, 148554 + 3000], gb = [G[0] - W.WALKREC.margin, G[1] + W.WALKREC.margin, G[2] - W.WALKREC.margin, G[3] + W.WALKREC.margin];
    q = await run('giran graph', () => W.recGraphBuild(gb, io));
    const gg = q.v;
    check(q.gap < 1000, `Giran box: ${gg.cells} cells in ${q.ms} ms, longest slice ${q.gap} ms`);
    const startK = W.recNearest(gg, 83473, 148554, 3000);
    if (startK) {
      let k = startK; const seen = new Set([k]);
      for (let i = 0; i < 40; i++) { const nb = [...(gg.edges[k] || [])].find(x => !seen.has(x)); if (!nb) break; seen.add(nb); k = nb; }
      q = await run('giran A*', () => W.recAStar(gg, startK, k, io));
      check(q.v.path && q.v.path[0] === startK && q.v.path[q.v.path.length - 1] === k && q.gap < 1000, `Giran: route ${startK} -> ${k} found (${q.v.path ? q.v.path.length : 0} cells, ${q.ms} ms, slice ${q.gap} ms)`);
    } else console.log('skip Giran route check: no recorded cell near the Giran start');
  }
  clearInterval(beat);

  // ---- 4) WALKREC correctness on a small graph -----------------------------------------------------------------------------------------
  // grid 10x10 cells, 150 apart, a wall at column 5 except row 9
  const mk = () => { const nodes = {}, edges = {}; for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) nodes[`${i}_${j}`] = [i * 150, j * 150, 0];
    const add = (a, b) => { (edges[a] = edges[a] || []).push(b); };
    for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) { if (i < 9 && !((i === 4 || i === 5) && j < 9) ) add(`${i}_${j}`, `${i + 1}_${j}`); if (j < 9) add(`${i}_${j}`, `${i}_${j + 1}`); }
    return { nodes, edges }; };
  const small = await W.recGraphBuild([-1e6, 1e6, -1e6, 1e6], { names: ['a'], read: () => mk(), yield: async () => { }, clock: () => Date.now() });
  check(W.recNearest(small, 160, 10, 500) === '1_0', 'recNearest: the nearest connected cell');
  const ar = await W.recAStar(small, '0_0', '9_0', { yield: async () => { }, clock: () => Date.now() });
  check(ar.path && ar.path.length === 28 && ar.path[0] === '0_0' && ar.path[27] === '9_0', `A* goes round the wall through row 9 (${ar.path ? ar.path.length : 0} cells, shortest 28)`);
  const capped = await W.recAStar(small, '0_0', '9_0', { yield: async () => { }, clock: () => Date.now(), maxIter: 10 });
  check(!capped.path && /gave up/.test(capped.why), `A* iteration cap: ${capped.why}`);
  const clipped = await W.recGraphBuild([0, 600, 0, 600], { names: ['a'], read: () => mk(), yield: async () => { }, clock: () => Date.now() });
  check(clipped.cells === 25 && !clipped.nodes['5_5'], `region box keeps only the cells inside (${clipped.cells} of 100)`);

  // ---- 5) host glue (source) --------------------------------------------------------------------------------------------------------------
  const fnBody = (name) => { const i = src.indexOf(name); return i < 0 ? '' : src.slice(i, i + 5000); };
  check(/async function walkToInner\([^)]*\) \{\s*const until = now\(\) \+ timeoutMs;[\s\S]{0,700}if \(distTo\(x, y\) > CONFIG\.travel\.maxWalk\) \{[^\n]*return false; \}/.test(src), 'walkToInner refuses a target farther than travel.maxWalk before any path search');
  check(/async function walkRecorded[^\n]*\n\s*if \(distTo\(x, y\) > CONFIG\.travel\.maxWalk\) return false;[^\n]*\n\s*const route = await recordedRoute\(x, y\);/.test(src), 'walkRecorded: maxWalk guard + awaits the async recordedRoute');
  check(!/function teamWalkGraph\(\)/.test(src) && !/function nearestNode\(/.test(src), 'the old synchronous teamWalkGraph / nearestNode are gone');
  const rt = fnBody('async function memberReturnTrip(');
  check(/backTripSave\(\)/.test(rt) && /returnFailCount\(/.test(rt) && /plan && plan\.instance/.test(rt), 'memberReturnTrip: failure count persisted, instance = wait (no backoff)');
  check(/returnBackoffMs: returnBackoffMs\(backTrip\.fails\), leaderInInstance: inInst/.test(src), 'left-behind loop passes the backoff + leader-in-instance to rejoinPlan');
  check(/setTimeout\(\(\) => \{ try \{\s*const j = JSON\.parse\(String\(File\.ReadAllText\(backTripFile\(\)\)\)/.test(src), 'the last failure is read back after a reload / worker restart');

  console.log(fails ? `\n${fails} check(s) FAILED` : '\nall checks passed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
