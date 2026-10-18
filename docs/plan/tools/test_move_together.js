// TEST MOVE TOGETHER (2026-10-13, owner 20:35: "It's annoying that when running to a raid boss you are ALWAYS far from each other. It should run
// together and wait at each waypoint. Otherwise characters get stuck."). Nothing live: no L2Swarm, no game, no MCP.
//   1) MOVETOGETHER-PURE (vm): settings, 3D "at the waypoint", progress, the leader's decision matrix (wait / go / max wait / stuck -> leave /
//      dead, offline, benched ignored / fight / pace), the unstick ladder order, the progress watch, resume after a reload, cutting at a stop circle
//   2) a simulated team on a waypoint list: the REAL leader walk (mtLeadRouteWalk) and the REAL member code (swarm.routewalk handler + the member
//      interval + ladder + catch-up) of swarm.js in separate vm "windows", connected by a fake App bus, on a virtual clock with a tiny movement world:
//      waits at every waypoint, nobody runs ahead, stuck ladder (side-step -> re-plan works), catch-up after the limit (party chat + .town),
//      a fight pauses everyone and the walk resumes at the same waypoint, a slow walker (max wait -> trails, waited for again), a late member asks
//      for the waypoints, resume after a reload, the rule switched off = the old walk.
//   3) source checks: leadTeamWalk / navAtlasWalk / rsWalkPoints / userRouteTrip go through leadRouteWalk; rules default ON in swarm.js + dashboard.
// Usage: node docs/plan/tools/test_move_together.js [--swarm <file>]
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const ai = process.argv.indexOf('--swarm');
const SWARM = ai > 0 ? path.resolve(process.argv[ai + 1]) : path.join(ROOT, 'Scripts_dev', 'swarm.js');
const SRC = fs.readFileSync(SWARM, 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m); } };

// ------------------------------------------------------------------------------------------------ 1) pure
console.log('1) MOVETOGETHER-PURE');
const pa = SRC.indexOf('// MOVETOGETHER-PURE-BEGIN'), pb = SRC.indexOf('// MOVETOGETHER-PURE-END');
ok(pa > 0 && pb > pa, 'pure block found');
const pc = { Math, JSON, Number, String, Object, Array, isFinite, Set };
vm.createContext(pc);
vm.runInContext(SRC.slice(pa, pb) + '\n;globalThis.__M = { MT, mtCfg, mtCum, mtAt, mtProg, mtSig, mtNearest, mtFlat, mtSideStep, mtLadderNext, mtStuckTick, mtResume, mtCut, mtDecide, mtBreath, mtGateLimit, mtSwimDist, mtPullGate, mtCorners };', pc);
const M = pc.__M;
{
  const c = M.mtCfg({}); ok(c.on && c.maxWaitMs === 60000 && c.leaveMs === 90000 && c.paceGap === 600, 'defaults: ON, 60 s max wait per waypoint, 90 s stuck -> catch-up, pace gap 600');
  ok(!M.mtCfg({ moveTogether: false }).on, 'moveTogether false = off');
  const c2 = M.mtCfg({ mtMaxWaitSec: 5, mtLeaveSec: 99999 }); ok(c2.maxWaitMs === 10000 && c2.leaveMs === 1800000, 'numbers clamped (10..600 s, 20..1800 s)');
  const p = { x: 0, y: 0, z: -3000 };
  ok(M.mtAt(p, { x: 150, y: 100, z: -3100 }) && !M.mtAt(p, { x: 150, y: 150, z: -3000 }) && !M.mtAt(p, { x: 10, y: 0, z: -3500 }), 'at a waypoint = within 200 in x,y AND within 300 in height (another floor is not "there")');
  const pts = [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 2000, y: 0 }], cum = M.mtCum(pts);
  ok(cum[2] === 2000 && M.mtProg(pts, cum, 0, { x: 400, y: 0 }) === 400 && M.mtProg(pts, cum, 2, { x: 0, y: 0 }) === 2000 && M.mtProg(pts, cum, -1, { x: -300, y: 0 }) === -300, 'route progress along the waypoints');
  ok(M.mtLadderNext({ stage: 0 }, { flat: true }) === 'sidestep' && M.mtLadderNext({ stage: 1 }, { flat: true }) === 'replan' && M.mtLadderNext({ stage: 2 }, { flat: true }) === 'back' && M.mtLadderNext({ stage: 3 }, { flat: true }) === 'around' && M.mtLadderNext({ stage: 4 }, { flat: true }) === 'wait', 'ladder: side-step -> re-plan -> back one waypoint -> detours -> wait');
  ok(M.mtLadderNext({ stage: 0 }, { flat: false }) === 'replan' && M.mtLadderNext({ stage: 0 }, { flat: true, special: true }) === 'replan', 'no side-step on a slope / ledge / swim / drop leg (the Cletu ravine fall)');
  let r = M.mtStuckTick(null, { now: 0, idx: 3, d: 1000 }); r = M.mtStuckTick(r.tr, { now: 4000, idx: 3, d: 950 }); r = M.mtStuckTick(r.tr, { now: 8100, idx: 3, d: 960 });
  ok(r.stuck, 'no progress (< 100 closer) for 8 s = stuck');
  let r2 = M.mtStuckTick(null, { now: 0, idx: 3, d: 1000 }); r2 = M.mtStuckTick(r2.tr, { now: 5000, idx: 3, d: 800 }); r2 = M.mtStuckTick(r2.tr, { now: 9000, idx: 3, d: 790 });
  ok(!r2.stuck, 'progress resets the watch');
  let r3 = M.mtStuckTick(null, { now: 0, idx: 3, d: 1000 }); r3 = M.mtStuckTick(r3.tr, { now: 9000, idx: 3, d: 1000, pause: true });
  ok(!r3.stuck, 'a fight / planning / a ladder step never counts as stuck');
  const P5 = [0, 1, 2, 3, 4].map(k => ({ x: k * 1000, y: 0, z: -3000 })), sig = M.mtSig(P5);
  ok(M.mtResume({ sig, gate: 3, at: 0 }, sig, { x: 2900, y: 50 }, 1000, P5) === 2 && M.mtResume({ sig, gate: 3, at: 0, done: true }, sig, { x: 2900, y: 50 }, 1000, P5) === -2 && M.mtResume({ sig: 'x', gate: 3, at: 0 }, sig, { x: 2900, y: 50 }, 1000, P5) === -2 && M.mtResume({ sig, gate: 3, at: 0 }, sig, { x: 9e4, y: 0 }, 1000, P5) === -2, 'resume after a reload: the same route, not finished, near the saved waypoint -> from that waypoint');
  const cut = M.mtCut(P5, { x: 4000, y: 0, dist: 1500 }); ok(cut.length === 4 && Math.abs(cut[3].x - 2500) <= 2, 'a planned walk is cut where it enters the stop circle (raid stage: never onto the boss)');
  const s1 = M.mtSideStep({ x: 0, y: 0, z: 5 }, { x: 1000, y: 0 }, 0), s2 = M.mtSideStep({ x: 0, y: 0, z: 5 }, { x: 1000, y: 0 }, 1); ok(Math.abs(s1.y) === 250 && s1.y === -s2.y && s1.x === 0, 'side-step 250 to the left / right of the way');
  // the decision
  const mm = (o) => Object.assign({ name: 'A', online: true, alive: true, benched: false, left: false, reached: 3, prog: 3000, d: 50, stuck: null, fight: false }, o);
  const D = (o) => M.mtDecide(Object.assign({ now: 100000, phase: 'gate', gate: 3, n: 10, since: 100000, leaderProg: 3000, cfg: M.mtCfg({}), trail: [], fight: false, members: [] }, o));
  { const mem = (crit) => [{ name: 'A', online: true, alive: true, reached: 3, prog: 3000, low: crit, crit }];   // RUNON-2026-10-18
    ok(D({ phase: 'leg', fight: true, members: mem(false) }).act !== 'fight', 'runon: a fight on a leg -> the team runs on');
    ok(D({ phase: 'leg', fight: true, members: mem(true) }).act === 'fight', 'runon: someone below 20 % on a leg -> fight here');
    ok(D({ phase: 'gate', fight: true, fightDone: true, members: mem(false) }).act !== 'fight', 'runon: a waypoint fight already done (60 s) -> run on');
    ok(D({ phase: 'gate', fight: true, members: mem(false) }).act === 'fight' && /grouped up/.test(D({ phase: 'gate', fight: true, members: mem(false) }).line), 'runon: at the waypoint -> group up and kill what followed'); }
  ok(D({ members: [mm({}), mm({ name: 'B' })] }).act === 'go', 'gate: everyone at the waypoint -> go');
  const w = D({ members: [mm({}), mm({ name: 'B', reached: 2, d: 700 })] });
  ok(w.act === 'wait' && /point 4\/10 · waiting for B \(700 away\)/.test(w.line), `gate: one still walking -> wait ("${w.line}")`);
  ok(D({ members: [mm({ name: 'X', alive: false, reached: 0 }), mm({ name: 'Y', online: false, reached: 0 }), mm({ name: 'Z', benched: true, reached: 0 })] }).act === 'go', 'dead / offline / benched members are not waited for');
  const mw = D({ since: 100000 - 61000, members: [mm({ name: 'B', reached: 2, d: 900 })] });
  ok(mw.act === 'go' && mw.trail.includes('B') && /still walking/.test(mw.line), 'max wait (60 s) ran out for a member that IS walking: go on, it trails on the same points');
  const st = D({ since: 100000 - 61000, members: [mm({ name: 'B', reached: 2, stuck: { stage: 'sidestep', since: 100000 - 30000 } })] });
  ok(st.act === 'wait' && /B \(stuck 30 s: trying a side-step\)/.test(st.line), `stuck member: the leader keeps waiting while the ladder runs ("${st.line}")`);
  const lv = D({ members: [mm({ name: 'B', reached: 2, stuck: { stage: 'around', since: 100000 - 91000 } }), mm({ name: 'C' })] });
  ok(lv.act === 'go' && lv.leave.join() === 'B' && /going on without B/.test(lv.line), 'stuck longer than 90 s: the team goes on, B gets the catch-up (said in the line)');
  ok(D({ fight: true, members: [mm({})] }).act === 'fight', 'a fight on the way: fight first');
  const pc1 = D({ phase: 'leg', gate: 4, leaderProg: 3700, members: [mm({ name: 'B', reached: 3, prog: 3000 })] });
  ok(pc1.act === 'pace', 'pace: a member 700 behind the leader along the route -> the leader pauses');
  ok(D({ phase: 'leg', gate: 4, leaderProg: 3500, members: [mm({ name: 'B', reached: 3, prog: 3000 })] }).act === 'go', 'pace: 500 behind is fine');
  ok(D({ phase: 'leg', gate: 4, leaderProg: 3900, trail: ['B'], members: [mm({ name: 'B', reached: 2, prog: 2500 })] }).act === 'go', 'a trailing member does not stop the pace (it is waited for at the next waypoint)');
  ok(D({ members: [mm({ name: 'B', reached: 2, left: true })] }).act === 'go', 'a member that is catching up by itself is not waited for');
  // SWIM (Tillion 2026-10-13): never left in the water, swimmers always waited for at the shore, no long wait IN the water, back first when stuck
  const wl = D({ members: [mm({ name: 'L', reached: 2, wet: true, stuck: { stage: 'back', since: 100000 - 200000 } })] });
  ok(wl.act === 'wait' && !wl.leave.length && /in the water, stuck 200 s/.test(wl.line), `a member stuck IN the water is never left behind ("${wl.line}")`);
  ok(D({ since: 100000 - 120000, members: [mm({ name: 'L', reached: 2, wet: true, d: 800 })] }).act === 'wait', 'a swimmer is always waited for (no max wait at the shore)');
  const sg = D({ swimGate: true, since: 100000 - 9000, members: [mm({ name: 'L', reached: 2, wet: true })] });
  ok(sg.act === 'go' && sg.trail.includes('L') && /in the water — swimming on to the shore/.test(sg.line), 'a waypoint IN the water: the leader swims on after 8 s, the team gathers at the shore');
  ok(D({ swimGate: true, since: 100000 - 3000, members: [mm({ name: 'L', reached: 2, wet: true })] }).act === 'wait', '... but waits those first 8 s');
  ok(M.mtLadderNext({ stage: 0 }, { flat: true, wet: true }) === 'back' && M.mtLadderNext({ stage: 1 }, { wet: true }) === 'replan', 'stuck in the water: swim back to the previous point first, then re-plan');
  const SW = [{ x: 0, y: 0 }, { x: 500, y: 0, swim: true }, { x: 1500, y: 0, swim: true }, { x: 2500, y: 0, swim: true }, { x: 3000, y: 0 }];
  ok(M.mtGateLimit(SW, 1) === 4 && M.mtGateLimit(SW, 0) === 0 && M.mtGateLimit(SW, 4) === 4, 'a member may swim on past a water waypoint to the shore (nobody stops in the water), never past a dry gate');
  const sd = M.mtSwimDist(SW, 1, { x: 800, y: 0 }); ok(Math.round(sd.toNext) === 2200 && sd.next === 4 && Math.round(sd.toPrev) === 800 && sd.prev === 0, `swim distances to the shore ahead / behind (${Math.round(sd.toNext)} / ${Math.round(sd.toPrev)})`);
  ok(M.mtBreath({ swimMs: 10000, toNext: 2000, toPrev: 500 }) === 'on', 'breath: enough for the shore ahead -> on');
  ok(M.mtBreath({ swimMs: 40000, toNext: 2000, toPrev: 500 }) === 'back', 'breath: not enough for the shore ahead, the one behind is near -> swim back');
  ok(M.mtBreath({ swimMs: 55000, toNext: 400, toPrev: 1500 }) === 'nearest-next', 'breath: neither in time -> the nearer shore');
  ok(M.mtBreath({ swimMs: 0, toNext: 2700, toPrev: 0 }) === 'on' && M.mtBreath({ swimMs: 0, toNext: 3200, toPrev: 0 }) === 'back', 'breath at the water\'s edge: a swim within one breath (2,800) is started, a longer one is not');
  // RAID PULL GATE
  const pm = (o) => Object.assign({ name: 'A', healer: false, online: true, alive: true, d: 300, benched: false }, o);
  const G = (members, waited) => M.mtPullGate({ waited: waited || 0, members });
  ok(G([pm({}), pm({ name: 'Lumi', healer: true })]).act === 'pull', 'pull gate: everyone here -> pull');
  const g1 = G([pm({}), pm({ name: 'Bishop4', healer: true, d: 3200 })], 20000);
  ok(g1.act === 'wait' && /waiting for Bishop4 \(healer\) 3200 away before the pull/.test(g1.line), `healer missing -> wait ("${g1.line}")`);
  const g2 = G([pm({}), pm({ name: 'Bishop4', healer: true, d: 3200 })], 181000);
  ok(g2.act === 'skip' && /not pulling without heals, next boss instead/.test(g2.line), `healer still missing after 3 min -> next boss ("${g2.line}")`);
  ok(G([pm({ name: 'Rage', d: 81000 }), pm({ name: 'Lumi', healer: true })]).act === 'pull', 'one non-healer missing (81 km away) -> pull without him (said)');
  ok(G([pm({ name: 'Rage', d: 81000 }), pm({ name: 'Necro', d: 2000 })], 10000).act === 'wait', 'two missing -> wait');
  ok(G([pm({ name: 'Rage', online: false }), pm({ name: 'Necro', d: 2000 })], 200000).act === 'skip', 'two missing for 3 min -> next boss');
  ok(G([pm({ name: 'Lumi', healer: true, d: 5000, benched: true })]).act === 'pull', 'a benched member does not count');
  ok(G([pm({ name: 'Lumi', healer: true, online: false })], 10000).act === 'wait', 'an offline healer is missing too');
}

// ------------------------------------------------------------------------------------------------ 2) simulated team
console.log('2) simulated team (real leader + member code)');
const sa = SRC.indexOf('// MOVETOGETHER-PURE-BEGIN'), sb = SRC.indexOf('/** ROUTE TEST (user 2026-10-06 21:55');
ok(sa > 0 && sb > sa, 'leader + member block found');
const BLOCK = SRC.slice(sa, sb);

function sim(opts) {
  opts = opts || {};
  const S = { t: 1e9, timers: [], wins: {}, said: [], errs: [], files: {}, events: [], townCmds: [], log: [] };
  const sleep = (ms) => new Promise(r => S.timers.push({ at: S.t + Math.max(1, ms), r }));
  const PTS = opts.pts;
  function win(name, o) {
    const W = { name, me: Object.assign({ X: 0, Y: 0, Z: -3000, Name: name, IsDead: false, IsSitting: false, IsInCombat: false }, o.pos || {}), goal: null, speed: o.speed || 200, handlers: {}, intervals: [], notes: [], tasks: [], acc: 'acc-' + name, block: o.block || (() => false), geo: o.geo || null };
    const isL = name === opts.leader;
    const moveTo = (x, y, z) => { W.goal = { x, y, z: isFinite(z) ? z : W.me.Z }; };
    const walk = async (p, dist, ms, abort) => {
      moveTo(p.x, p.y, p.z); const t0 = S.t;
      for (;;) {
        await sleep(250);
        if (abort && abort()) { W.goal = null; return false; }
        if (Math.hypot(p.x - W.me.X, p.y - W.me.Y) <= Math.max(dist || 0, 100)) { W.goal = null; return true; }
        if (S.t - t0 > (ms || 30000)) { W.goal = null; return false; }
        if (!W.goal) moveTo(p.x, p.y, p.z);
      }
    };
    const ctx = {
      console, Math, JSON, Number, String, Object, Array, isFinite, Promise, Set, Map, RegExp, Date,
      Me: W.me, CONFIG: { leader: opts.leader, together: Object.assign({}, opts.together || {}), travel: {} }, state: {}, control: { gen: 1 },
      now: () => S.t, sleep, num: (v) => Number(v) || 0, P: (x, y) => `${Math.round(x)},${Math.round(y)}`,
      note: (m) => { W.notes.push(m); S.log.push(`${name}: ${m}`); }, setTask: (t) => { W.task = t; }, intent: () => { }, intentDone: () => { }, pstHold: () => { },
      logError: (w, e) => { S.errs.push(`${name} ${w}: ${e && e.stack || e}`); }, SayToParty: (m) => S.said.push(m), appendShared: () => { },
      App: { on: (n, f) => { W.handlers[n] = f; }, emit: (n, d) => bus(name, n, d, null), emitTo: (id, n, d) => bus(name, n, d, id) },
      Send: { StopMove: () => { W.goal = null; }, MoveBackwardToLocation: (x, y, z) => moveTo(x, y, z) },
      Options: { ActiveFollow: false, FollowName: '' }, followOk: () => false,
      isLeader: () => isL, teamNames: () => isL ? Object.keys(S.wins).filter(n => n !== name && !(opts.absent || []).includes(n)) : [],
      livePos: {}, posAcct: { [opts.leader]: 'acc-' + opts.leader }, benched: () => false, mateMsg: () => true, runHeld: () => false, IsCharacterReady: () => true, IsInCombat: false,
      rest: { sitting: false }, geoCache: { key: '' }, rsLegMs: (d) => Math.max(30000, d * 10), castRunSpeed: () => 200,
      nearestRouteIdx: (pts) => { let bi = 0, bd = 1e12; pts.forEach((p, i) => { const d = Math.hypot(p.x - W.me.X, p.y - W.me.Y); if (d < bd) { bd = d; bi = i; } }); return bi; },
      routeRulesNow: () => Object.assign({ moveTogether: true }, opts.rules || {}),
      rcTravelFighting: () => S.t < (S.fightUntil || 0), rcOn: () => false, rcEvent: () => { }, rcRouteHop: (p, a) => walk(p, 120, 30000, a),
      TOWN_CMD: { Giran: 'giran' }, TOWN_LAND: { Giran: [0, 0] }, townCommand: async (why, town) => { S.townCmds.push(name + ' ' + town); return true; }, lastTownCmd: 0,
      SCHED: { clear: (h) => { W.intervals = W.intervals.filter(x => x !== h); } },
      setInterval: (f, ms) => { const h = { f, ms, next: S.t + ms }; W.intervals.push(h); return h; }, setTimeout: (f, ms) => { S.timers.push({ at: S.t + ms, r: f }); },
      File: { ReadAllText: (p) => { if (S.files[p] === undefined) throw new Error('no file'); return S.files[p]; }, WriteAllText: (p, t) => { S.files[p] = String(t); }, Exists: (p) => S.files[p] !== undefined },
      SWARM_ROOT: 'X:', loadRaidRoute: () => null, raidRouteFile: () => '', currentTownKey: () => null, townKeyFor: () => null, gkTeleport: async () => true,
      routeHop: async (p, abort) => walk(p, 120, 30000, abort),
      walkDirect: async (x, y, z, dist, ms, abort) => walk({ x, y, z }, dist, ms, abort),
      geoRoute: async (x, y, z) => { await sleep(500); return W.geo ? W.geo({ x, y, z }, { x: W.me.X, y: W.me.Y }) : { ok: false, reason: 'none' }; },
      inRaid: () => false, standUp: () => { },
    };
    W.ctx = ctx;
    vm.createContext(ctx);
    vm.runInContext(BLOCK + '\n;globalThis.__H = { leadRouteWalk, mtLeadRouteWalk, memberRoute, mtOn };', ctx);
    W.H = ctx.__H;
    S.wins[name] = W;
    return W;
  }
  function bus(from, n, d, to) {
    S.events.push({ t: S.t, from, n, d });
    Object.values(S.wins).forEach(W => {
      if (W.name === from || (to && W.acc !== to)) return;
      const h = W.handlers[n]; if (!h) return;
      try { h({ source: { characterName: from, accountId: 'acc-' + from }, data: JSON.parse(JSON.stringify(d || {})) }); } catch (e) { S.errs.push(`${W.name} handler ${n}: ${e.stack}`); }
    });
  }
  // the world: every 250 ms each character moves toward its goal (unless its wall blocks the step); positions are reported (swarm.pos -> livePos)
  function step() {
    Object.values(S.wins).forEach(W => {
      if (!W.goal || W.frozen) return;
      const dx = W.goal.x - W.me.X, dy = W.goal.y - W.me.Y, d = Math.hypot(dx, dy); if (d < 1) { W.goal = null; return; }
      const k = Math.min(1, W.speed * 0.25 / d), nx = W.me.X + dx * k, ny = W.me.Y + dy * k;
      if (W.block({ x: W.me.X, y: W.me.Y }, { x: nx, y: ny })) return;
      W.me.X = nx; W.me.Y = ny; W.me.Z = W.goal.z;
      S.maxIdx = S.maxIdx || {};
    });
    Object.values(S.wins).forEach(W => Object.values(S.wins).forEach(V => { if (V !== W) W.ctx.livePos[V.name] = { X: V.me.X, Y: V.me.Y, Z: V.me.Z, IsDead: V.me.IsDead, at: S.t, hit: S.t < (S.fightUntil || 0) && V.name === S.fighter, fight: false }; }));
  }
  async function flush() { for (let k = 0; k < 30; k++) await new Promise(r => setImmediate(r)); }
  async function run(maxMs, until) {
    const end = S.t + maxMs;
    while (S.t < end && !(until && until())) {
      S.t += 250;
      for (const W of Object.values(S.wins)) for (const iv of W.intervals.slice()) if (S.t >= iv.next) { iv.next += iv.ms; try { iv.f(); } catch (e) { S.errs.push(`${W.name} interval: ${e.stack}`); } }
      const due = S.timers.filter(x => x.at <= S.t); S.timers = S.timers.filter(x => x.at > S.t); due.forEach(x => { try { x.r(); } catch (e) { S.errs.push('timer ' + e.stack); } });
      step();
      if (S.watch) S.watch();
      await flush();
    }
  }
  return { S, win, run };
}
const line = (n, y) => Array.from({ length: n }, (_, k) => ({ x: k * 1000, y: y || 0, z: -3000 }));

(async () => {
  // A) a plain walk: 3 members, the leader waits at every waypoint, nobody runs ahead
  {
    const pts = line(7);
    const { S, win, run } = sim({ leader: 'Lead', pts });
    const L = win('Lead', { pos: { X: 0, Y: 0 } }); win('A', { pos: { X: -100, Y: 50 } }); win('B', { pos: { X: -150, Y: -50 }, speed: 120 }); win('C', { pos: { X: -50, Y: 0 }, speed: 160 });
    let ahead = 0, early = [];
    let lastGate = -1;
    S.watch = () => {
      const g = L.ctx.state.mt ? L.ctx.state.mt.i : -1;
      ['A', 'B', 'C'].forEach(n => { const m = S.wins[n].H.memberRoute; if (m.id && m.mt && m.my > m.gate) ahead++; });
      if (g !== lastGate && lastGate >= 1 && L.ctx.state.mt && L.ctx.state.mt.phase === 'leg') {   // the leader just left waypoint lastGate: everyone must have been there
        ['A', 'B', 'C'].forEach(n => { const W = S.wins[n]; const P0 = pts[lastGate]; if (W.H.memberRoute.my < lastGate && Math.hypot(W.me.X - P0.x, W.me.Y - P0.y) > 210) early.push(`${n}@${lastGate}(my ${W.H.memberRoute.my})`); });
      }
      lastGate = g;
    };
    let res = null; L.H.leadRouteWalk(pts, 'Test Boss', () => false, '', null, null).then(r => { res = r; });
    await run(400000, () => res !== null);
    ok(res === true, 'plain walk: arrived');
    ok(S.events.some(e => e.n === 'swarm.routewalk' && e.d.points && e.d.mt), 'the members got the SAME waypoint list (mt on)');
    ok(early.length === 0, `the leader left a waypoint only when everyone had reached it${early.length ? ' — ' + early.slice(0, 5).join(', ') : ''}`);
    ok(ahead === 0, 'nobody walked past the leader\'s current waypoint');
    const far = ['A', 'B', 'C'].map(n => Math.hypot(S.wins[n].me.X - 6000, S.wins[n].me.Y)); ok(far.every(d => d < 250), `everyone at the end (${far.map(Math.round).join(', ')})`);
    ok(S.events.some(e => e.n === 'swarm.mt.rep'), 'members report their waypoint to the leader');
    ok(!S.errs.length, 'no errors' + (S.errs.length ? ': ' + S.errs[0] : ''));
    ok(L.ctx.state.mt && L.ctx.state.mt.act === 'done' && /whole team arrived together/.test(L.ctx.state.mt.line), 'live line at the end');
  }
  // B) a stuck member: side-step does not help, the re-plan does; the leader waits and says so
  {
    const pts = line(6);
    const wall = (a, b) => (a.x < 2000 && b.x >= 2000 || a.x > 2000 && b.x <= 2000) && Math.abs(b.y) < 300;   // a wall across the way at x 2000 (|y| < 300)
    const { S, win, run } = sim({ leader: 'Lead', pts });
    const L = win('Lead', { pos: { X: 0, Y: 0 } }); win('A', { pos: { X: -100, Y: 0 } });
    win('B', { pos: { X: -100, Y: 80 }, block: wall, geo: (to, me) => ({ ok: true, points: [{ x: 1800, y: 600, z: -3000 }, { x: 2200, y: 600, z: -3000 }, { x: to.x, y: to.y, z: to.z }] }) });
    let lines = [];
    S.watch = () => { const m = L.ctx.state.mt; if (m && m.waiting && m.waiting.length) lines.push(m.line); };
    let res = null; L.H.leadRouteWalk(pts, 'Test Boss', () => false, '', null, null).then(r => { res = r; });
    await run(600000, () => res !== null);
    ok(res === true, 'stuck member: the walk still arrives');
    const bn = S.wins.B.notes.join('\n');
    ok(/trying a side-step/.test(bn) && /re-planning a way around/.test(bn) && bn.indexOf('trying a side-step') < bn.indexOf('re-planning a way around'), 'B: side-step first, then the re-plan');
    ok(/re-planning a way around worked|at point 4\/6/.test(bn) || S.wins.B.H.memberRoute.my >= 3 || Math.hypot(S.wins.B.me.X - 5000, S.wins.B.me.Y) < 300, 'B got past the wall');
    ok(lines.some(l => /waiting for B \(stuck \d+ s: (trying a side-step|re-planning a way around|not moving)\)/.test(l)), `the leader waited and said why ("${(lines.find(l => /stuck/.test(l)) || '').slice(0, 90)}")`);
    ok(!S.said.some(m => /going on without/.test(m)), 'nobody was left behind (the ladder worked within the limit)');
    ok(Math.hypot(S.wins.B.me.X - 5000, S.wins.B.me.Y) < 300, 'B at the end with the team');
    ok(!S.errs.length, 'no errors' + (S.errs.length ? ': ' + S.errs[0] : ''));
  }
  // C) a member that never gets past: after the limit the team goes on, said in party chat; it catches up (.town)
  {
    const pts = line(6);
    const { S, win, run } = sim({ leader: 'Lead', pts, rules: { mtLeaveSec: 90 } });
    const L = win('Lead', { pos: { X: 0, Y: 0 } }); win('A', { pos: { X: -100, Y: 0 } });
    win('C', { pos: { X: -100, Y: 80 }, block: (a, b) => b.x > 1500 });
    let t0 = S.t, res = null; L.H.leadRouteWalk(pts, 'Test Boss', () => false, '', null, null).then(r => { res = r; });
    await run(900000, () => res !== null && S.townCmds.length > 0);
    ok(res === true, 'a member that never gets past: the rest of the team arrives');
    const sayAt = S.events.find(e => e.n === 'swarm.mt.leave');
    ok(!!sayAt && S.said.some(m => /going on without C/.test(m) && /catching up by itself/.test(m)), `party chat: "${(S.said.find(m => /going on without/.test(m)) || '').slice(0, 120)}"`);
    const cStuck = S.wins.C.notes.findIndex(n => /no progress toward point/.test(n));
    ok(sayAt && sayAt.t - t0 >= 90000, `the leader waited the stuck limit before going on (${sayAt ? Math.round((sayAt.t - t0) / 1000) : '?'} s after the start)`);
    ok(S.townCmds.includes('C Giran') && S.wins.C.notes.some(n => /catching up by myself/.test(n)), 'C: catch-up (no own way -> .town)');
    ok(cStuck >= 0, 'C noticed it was stuck');
    ok(!S.errs.length, 'no errors' + (S.errs.length ? ': ' + S.errs[0] : ''));
  }
  // D) RUNON-2026-10-18 (owner: run to the waypoint, group up, kill what followed, move on): a fight on a LEG does not stop the team; at the
  //    next waypoint it groups up and fights; the walk then goes on to the end
  {
    const pts = line(6);
    const { S, win, run } = sim({ leader: 'Lead', pts });
    const L = win('Lead', { pos: { X: 0, Y: 0 } }); win('A', { pos: { X: -100, Y: 0 } }); win('B', { pos: { X: -100, Y: 80 } });
    let res = null; L.H.leadRouteWalk(pts, 'Test Boss', () => false, '', null, null).then(r => { res = r; });
    await run(12000);
    S.fightUntil = S.t + 20000; S.fighter = 'A';
    const g0 = L.ctx.state.mt.i, pos0 = { x: L.me.X, y: L.me.Y };
    let sawGateFight = false, sawLegFight = false;
    for (let k = 0; k < 30; k++) { await run(500); const ln = L.ctx.state.mt.line || ''; if (/grouped up/.test(ln)) sawGateFight = true; if (/fighting on the way/.test(ln)) sawLegFight = true; }
    ok(L.ctx.state.mt.i > g0 || Math.hypot(L.me.X - pos0.x, L.me.Y - pos0.y) > 60, 'run on: a fight on the leg does not stop the leader (it walks on to the next waypoint)');
    ok(!sawLegFight, 'run on: no "fighting on the way" stop on a leg');
    ok(sawGateFight || L.notes.some(n => /grouped up|killing everything/.test(n)), 'at the waypoint: grouped up, killing what followed');
    await run(400000, () => res !== null);
    ok(res === true && L.ctx.state.mt.act === 'done', 'after the fight at the waypoint: on to the end');
    ok(!S.errs.length, 'no errors' + (S.errs.length ? ': ' + S.errs[0] : ''));
  }
  // E) a slow walker: the max wait (here 20 s) runs out while it is still walking -> the team goes on, it trails on the same points and is waited
  //    for again at the next waypoint
  {
    const pts = line(5).map(p => ({ x: p.x * 3, y: 0, z: -3000 }));
    const { S, win, run } = sim({ leader: 'Lead', pts, rules: { mtMaxWaitSec: 20 } });
    const L = win('Lead', { pos: { X: 0, Y: 0 } }); win('S', { pos: { X: -2000, Y: 0 }, speed: 60 });
    let res = null; L.H.leadRouteWalk(pts, 'Slow', () => false, '', null, null).then(r => { res = r; });
    await run(900000, () => res !== null);
    ok(res === true, 'slow walker: arrived');
    ok(L.notes.some(n => /going on, S still walking the same points behind us/.test(n)), 'max wait ran out: going on, S trails on the same points (said)');
    ok(!S.said.some(m => /going on without S/.test(m)), 'a slow (moving) member is never "left behind"');
  }
  // F) a member that did not hear the start (reload / late login) asks for the waypoints
  {
    const pts = line(5);
    const { S, win, run } = sim({ leader: 'Lead', pts });
    const L = win('Lead', { pos: { X: 0, Y: 0 } }); const A = win('A', { pos: { X: -100, Y: 0 } });
    A.handlers['swarm.routewalk_'] = A.handlers['swarm.routewalk']; const real = A.handlers['swarm.routewalk']; let dropFirst = true;
    A.handlers['swarm.routewalk'] = (ev) => { if (dropFirst && ev.data.points) { dropFirst = false; return; } real(ev); };
    let res = null; L.H.leadRouteWalk(pts, 'Late', () => false, '', null, null).then(r => { res = r; });
    await run(400000, () => res !== null);
    ok(S.events.some(e => e.n === 'swarm.mt.need' && e.from === 'A') && res === true && Math.hypot(A.me.X - 4000, A.me.Y) < 250, 'a member that missed the start asked (swarm.mt.need), got the waypoints and walked them');
  }
  // G) resume after a reload: the leader's walk stops at waypoint 3 (reload), a fresh leader window picks it up AT that waypoint
  {
    const pts = line(8);
    const { S, win, run } = sim({ leader: 'Lead', pts });
    const L = win('Lead', { pos: { X: 0, Y: 0 } }); win('A', { pos: { X: -100, Y: 0 } });
    let stop = false, res = null; L.H.leadRouteWalk(pts, 'Reload', () => stop, '', null, null).then(r => { res = r; });
    await run(300000, () => L.ctx.state.mt && L.ctx.state.mt.i >= 4 && L.ctx.state.mt.phase === 'leg');
    const g = L.ctx.state.mt.i; stop = true; await run(3000, () => res !== null);
    const saved = JSON.parse(S.files['X:\\Logs\\movetogether_Lead.json'] || 'null');
    ok(res === false && saved && saved.gate === g && !saved.done, `the stop saved the current waypoint (${saved && saved.gate + 1})`);
    const S2 = sim({ leader: 'Lead', pts }); S2.S.files = S.files;
    const L2 = S2.win('Lead', { pos: { X: L.me.X, Y: L.me.Y } }); S2.win('A', { pos: { X: S.wins.A.me.X, Y: S.wins.A.me.Y } });
    let res2 = null; L2.H.leadRouteWalk(pts, 'Reload', () => false, '', null, null).then(r => { res2 = r; });
    await S2.run(400000, () => res2 !== null);
    ok(L2.notes.some(n => new RegExp(`resuming the team walk at point ${g + 1}/8`).test(n)) && res2 === true, `after the reload: resumed at point ${g + 1}/8 and arrived`);
  }
  // I) a swim leg: a member stuck IN the water gets the ladder at once (swim back first), is never left; the leader does not wait in the water
  {
    const pts = line(7).map((p, k) => (k === 2 || k === 3) ? Object.assign(p, { swim: true }) : p);
    const { S, win, run } = sim({ leader: 'Lead', pts });
    const L = win('Lead', { pos: { X: 0, Y: 0 } }); win('A', { pos: { X: -100, Y: 0 } });
    let freeAt = 0; const W = win('W', { pos: { X: -100, Y: 80 }, block: (a, b) => S.t < freeAt && a.x < 2500 && b.x >= 2500 });
    let res = null; L.H.leadRouteWalk(pts, 'Swim', () => false, '', null, null).then(r => { res = r; });
    freeAt = S.t + 150000;
    let stuckAt = 0, backAt = 0, leftWet = false, leaderWaitedInWater = 0;
    S.watch = () => {
      const m = W.H.memberRoute; if (m.stuckNow && !stuckAt) stuckAt = S.t;
      if (!backAt && W.notes.some(n => /stuck before point \d\/7 — back to the last point/.test(n))) backAt = S.t;
      if (S.events.some(e => e.n === 'swarm.mt.leave' && e.d.names.includes('W')) && m.wet) leftWet = true;
      const mt = L.ctx.state.mt; if (mt && mt.phase === 'gate' && pts[mt.i] && pts[mt.i].swim) leaderWaitedInWater += 250;
    };
    await run(400000, () => res !== null && Math.hypot(W.me.X - 6000, W.me.Y) < 250);
    if (process.env.DBG) { console.log(res, W.me, JSON.stringify(W.H.memberRoute).slice(0, 600)); console.log(W.notes.slice(-15).join('\n')); console.log(L.notes.slice(-6).join('\n'), L.ctx.state.mt); }
    ok(res === true && Math.hypot(W.me.X - 6000, W.me.Y) < 250, 'swim: the whole team got through, the stuck swimmer too');
    ok(stuckAt && backAt && backAt - stuckAt < 8000, `stuck in the water: "swim back to the last point" within ${Math.round((backAt - stuckAt) / 1000)} s (the ladder at once)`);
    ok(!leftWet && !S.said.some(m => /going on without W/.test(m)), 'a member in the water is never left behind (150 s blocked, limit 90 s)');
    ok(leaderWaitedInWater <= 2 * (8000 + 1500), `the leader never treads water long (${leaderWaitedInWater / 1000} s at water waypoints)`);
    ok(!S.errs.length, 'no errors' + (S.errs.length ? ': ' + S.errs[0] : ''));
  }
  // J) a swim longer than one breath: the member does not start it / turns back to dry ground (said), never drowns out there
  {
    const pts = line(8).map((p, k) => (k >= 2 && k <= 5) ? Object.assign(p, { swim: true }) : p);
    const { S, win, run } = sim({ leader: 'Lead', pts });
    const L = win('Lead', { pos: { X: 0, Y: 0 } }); const W = win('W', { pos: { X: -100, Y: 0 } });
    let res = null; L.H.leadRouteWalk(pts, 'Long swim', () => false, '', null, null).then(r => { res = r; });
    let maxOut = 0; S.watch = () => { if (W.H.memberRoute.wet && W.H.memberRoute.swimSince) maxOut = Math.max(maxOut, S.t - W.H.memberRoute.swimSince); };
    await run(600000, () => res !== null);
    ok(W.notes.some(n => /the breath will not last to the shore/.test(n)), 'breath watch: "the breath will not last to the shore ... swimming back"');
    ok(maxOut < 60000, `the member never stayed in the water longer than one breath (${Math.round(maxOut / 1000)} s)`);
    ok(!S.errs.length, 'no errors' + (S.errs.length ? ': ' + S.errs[0] : ''));
  }
  // K) the raid pull gate in raidCountdown (the real function): waits for the healer, calls her, pulls once she is there / next boss after 3 min
  {
    const a = SRC.indexOf('async function raidCountdown(b, runId) {'), z = SRC.indexOf('\n}\n', a);
    const FN = SRC.slice(a, z + 2);
    const mk = (healerD) => {
      const C = { t: 1e9, said: [], tasks: [], emits: [], fails: [], lp: { Bishop4: { X: healerD, Y: 0, Z: -3000, at: 0, healer: true, IsDead: false }, Necro: { X: 100, Y: 0, Z: -3000, at: 0, healer: false } } };
      const ctx = { console, Math, String, Number, JSON, isFinite, Promise, Me: { X: 0, Y: 0, Z: -3000 }, CONFIG: { roster: { Bishop4: 'bishop', Necro: 'necromancer' }, mission: { countdownS: 3 } },
        now: () => C.t, sleep: async (ms) => { C.t += ms; Object.values(C.lp).forEach(l => { l.at = C.t; }); if (C.onSleep) C.onSleep(); }, num: (v) => Number(v) || 0,
        waitForTeamHere: async () => true, jointGate: async () => true, raidCursed: () => false, regroupAlive: () => true, teamNames: () => Object.keys(C.lp), rkWaitTeamBuffers: async () => true,
        rcCountdownS: () => null, rcOn: () => true, rcPhase: () => { }, rcFail: (b, why, x) => C.fails.push(why), rcEvent: () => { }, raidEvent: (e) => C.emits.push('event ' + e), SayToParty: (m) => C.said.push(m),
        note: () => { }, setTask: (t) => C.tasks.push(t), pstHold: () => { }, App: { emit: (n, d) => C.emits.push(n + ' ' + JSON.stringify(d.names || '')) }, benched: () => false, gkFail: '',
        HEALER_ROLES: /healer|bishop|shilliensaint/, livePos: C.lp };
      Object.values(C.lp).forEach(l => { l.at = C.t; });
      vm.createContext(ctx); vm.runInContext(SRC.slice(pa, pb) + '\n' + FN + '\n;globalThis.__rc = raidCountdown;', ctx);
      C.run = () => ctx.__rc({ name: 'Water Couatle Ateka', id: 25000 }, 'r1'); return C;
    };
    const C1 = mk(3200); C1.onSleep = () => { if (C1.t - 1e9 > 40000) C1.lp.Bishop4.X = 400; };   // she swims over after 40 s
    const r1 = await C1.run();
    ok(r1 === true && C1.said.some(m => /waiting for Bishop4 \(healer\) 3200 away before the pull/.test(m)) && C1.emits.some(e => /swarm\.comehere \["Bishop4"\]/.test(e)), 'raid: no countdown while the healer is 3.2 km away — said, she is called (come here), then the pull');
    ok(C1.said.findIndex(m => /in 3/.test(m)) > C1.said.findIndex(m => /waiting for Bishop4/.test(m)), 'the countdown starts only after she arrived');
    const C2 = mk(3200); const r2 = await C2.run();
    ok(r2 === false && C2.said.some(m => /not pulling without heals, next boss instead/.test(m)) && !C2.said.some(m => /GO!/.test(m)) && C2.fails.length === 1, 'healer never comes: no pull, said, the circuit benches the boss briefly (next boss)');
  }
  // L) STEP 2: the party's "stuck after N seconds" reaches the members (20 s: no unstick step at 8 s)
  {
    const pts = line(5);
    const { S, win, run } = sim({ leader: 'Lead', pts, rules: { mtStuckSec: 20 } });
    const L = win('Lead', { pos: { X: 0, Y: 0 } }); const W = win('W', { pos: { X: -100, Y: 0 }, block: (a, b) => b.x > 1500 });
    let res = null; L.H.leadRouteWalk(pts, 'Stuck20', () => false, '', null, null).then(r => { res = r; });
    let firstStuck = 0, blockedAt = 0;
    S.watch = () => { if (!blockedAt && W.me.X > 1400) blockedAt = S.t; if (!firstStuck && W.H.memberRoute.stuckNow) firstStuck = S.t; };
    await run(120000, () => firstStuck > 0);
    ok(firstStuck && blockedAt && firstStuck - blockedAt >= 19000 && W.notes.some(n => /for 20 s — unstick steps/.test(n)), `stuck seconds per party: the unstick steps start after 20 s (${Math.round((firstStuck - blockedAt) / 1000)} s)`);
  }
  // M) STEP 2: dungeon team walks (rgWalk) = the move-together walk per floor; floor teleports stay group steps; members adopt a floor walk only on that floor
  {
    const a = SRC.indexOf('async function rgWalk(d, target, o) {'), z = SRC.indexOf('\n/** walkToInner\'s first choice inside a dungeon', a);
    ok(a > 0 && z > a, 'rgWalk found');
    const FN = SRC.slice(a, z);
    const mk = (mtOnV) => {
      const C = { calls: [], me: { X: 0, Y: 0, Z: -100, IsDead: false } };
      const F1 = [{ x: 0, y: 0, z: -100 }, { x: 300, y: 0, z: -100 }, { x: 600, y: 0, z: -100 }, { x: 900, y: 0, z: -100 }, { x: 900, y: 300, z: -100 }, { x: 900, y: 600, z: -100 }];
      const steps = [{ do: 'walk', pts: F1.slice(0, 4), x: 900, y: 0, z: -100, floor: 0, kind: 'door', label: 'door A' }, { do: 'walk', pts: F1.slice(3), x: 900, y: 600, z: -100, floor: 0, kind: 'room', label: 'room B' },
        { do: 'npc', npc: { name: 'Penelope' }, floor: 1, floorName: '2nd floor', z: [400, 900], x: 900, y: 600, z0: -100, label: 'teleporter' },
        { do: 'walk', pts: [{ x: 5000, y: 0, z: 500 }, { x: 5600, y: 0, z: 500 }], x: 5600, y: 0, z: 500, floor: 1, kind: 'point', label: 'target', final: true }];
      let planN = 0;
      const ctx = { console, Math, JSON, Number, String, Object, Array, isFinite, Promise, Me: C.me, now: () => 1e9, sleep: async () => { }, P: (x, y) => `${x},${y}`,
        rgFor: () => ({}), rgPlan: () => { planN++; return planN === 1 ? { ok: true, steps, len: 1, text: 'plan' } : { ok: true, steps: steps.slice(3), len: 1, text: 'plan2' }; },
        rgGraphNear: () => true, dzFloor: () => ({ d: { name: 'Cruma Tower' }, fi: 0 }), dungeonRooms: () => [], rgTargetPoint: () => ({ x: 5600, y: 0, z: 500 }), rgProgress: () => 'prog', rgRoutePublish: () => { },
        rgPlanPoints: () => F1, dungeonLog: () => { }, setTask: () => { }, intent: () => { }, isLeader: () => true, teamNames: () => ['A', 'B'], state: {},
        mtOn: () => mtOnV, mtCorners: M.mtCorners,
        leadRouteWalk: async (pts, label, ab, t, st, b, opt) => { C.calls.push(['lrw', pts.length, opt && opt.floor, pts[pts.length - 1].x]); const p = pts[pts.length - 1]; Object.assign(C.me, { X: p.x, Y: p.y, Z: p.z }); return true; },
        teamRegroupBeforePort: async (w) => { C.calls.push(['regroup', w]); return true; },
        floorTeleport: async (F) => { C.calls.push(['floortp', F.name]); Object.assign(C.me, { X: 5000, Y: 0, Z: 500 }); return true; }, lastFloorNpc: null,
        App: { emit: (n, d) => C.calls.push(['emit', n, d && d.floor]) },
        walkDirect: async (x, y, z) => { C.calls.push(['direct', x, y]); Object.assign(C.me, { X: x, Y: y, Z: z }); return true; }, waitForTeamHere: async (w) => { C.calls.push(['wait', w]); return true; } };
      vm.createContext(ctx); vm.runInContext(FN + '\n;globalThis.__w = rgWalk;', ctx);
      C.run = () => ctx.__w({ name: 'Cruma Tower', floors: [{}, {}] }, { room: 'x' }, { team: true, allowNpc: true, label: 'Boss room' }); return C;
    };
    const C1 = mk(true), r1 = await C1.run();
    const lr = C1.calls.filter(c => c[0] === 'lrw');
    ok(r1.ok && lr.length === 2 && lr[0][2] === 0 && lr[0][3] === 900 && lr[1][2] === 1 && lr[1][3] === 5600, `dungeon team walk: one move-together walk per floor (floor 1 to the teleporter, floor 2 to the target): ${JSON.stringify(lr)}`);
    ok(!C1.calls.some(c => c[1] === 'swarm.roomroute') && !C1.calls.some(c => c[0] === 'direct') && !C1.calls.some(c => c[0] === 'wait'), 'no swarm.roomroute / lone leader walk / door-only checkpoints: every waypoint is a checkpoint');
    const iR = C1.calls.findIndex(c => c[0] === 'regroup'), iT = C1.calls.findIndex(c => c[0] === 'floortp'), iE = C1.calls.findIndex(c => c[1] === 'swarm.floortp');
    ok(iR > C1.calls.indexOf(lr[0]) && iT > iR && iE > iT && C1.calls.indexOf(lr[1]) > iE, 'the floor teleport is a group step: walk together -> regroup -> teleport -> swarm.floortp (members follow) -> walk together on the new floor');
    const C2 = mk(false); await C2.run();
    ok(C2.calls.some(c => c[1] === 'swarm.roomroute') && !C2.calls.some(c => c[0] === 'lrw'), 'move together off: the old dungeon walk (swarm.roomroute + door checkpoints)');
    // a member on another floor does not take the floor walk yet (it asks again later)
    const pts = line(3);
    const { S, win, run } = sim({ leader: 'Lead', pts });
    const L = win('Lead', { pos: { X: 0, Y: 0 } }); const A = win('A', { pos: { X: -50, Y: 0 } });
    let onFloor = false; A.ctx.dzFloor = () => ({ d: { name: 'Cruma Tower' }, fi: onFloor ? 1 : 0 }); A.ctx.dungeonRooms = () => [];
    let res = null; L.H.leadRouteWalk(pts, 'Floor 2', () => false, '', null, null, { dungeon: 'Cruma Tower', floor: 1 }).then(r => { res = r; });
    await run(6000);
    ok(!A.H.memberRoute.id, 'a member still on floor 1 does not take the floor-2 walk');
    onFloor = true; await run(300000, () => res !== null);
    ok(A.H.memberRoute.id === null && res === true && S.events.some(e => e.n === 'swarm.mt.need' && e.from === 'A') && Math.hypot(A.me.X - 2000, A.me.Y) < 250, 'once on floor 2 it asked for the walk, got it and walked it with the team');
  }
  // H) the party switched move together off: the old walk (no waiting on the way, no mt flag)
  {
    const pts = line(4);
    const { S, win, run } = sim({ leader: 'Lead', pts, rules: { moveTogether: false } });
    const L = win('Lead', { pos: { X: 0, Y: 0 } }); win('A', { pos: { X: -100, Y: 0 } });
    let res = null; L.H.leadRouteWalk(pts, 'Off', () => false, '', null, null).then(r => { res = r; });
    await run(400000, () => res !== null);
    ok(res === true && !S.events.some(e => e.n === 'swarm.routewalk' && e.d.mt), 'rule off: the old route walk (members at their own pace)');
  }

  // ------------------------------------------------------------------------------------------------ 3) source checks
  console.log('3) source checks');
  ok(/if \(mtOn\(\) && teamNames\(\)\.length && pts && pts\.length\) return await mtLeadRouteWalk/.test(SRC), 'leadRouteWalk = the move-together walk when the party rule is on');
  ok(/MOVETOGETHER-2026-10-13: the wall-aware route as ONE waypoint list[\s\S]{0,2200}await leadRouteWalk\(pts/.test(SRC), 'leadTeamWalk (landing -> spot, raid stage walks) walks the planned route as one waypoint list');
  ok(/async function navAtlasWalk[\s\S]{0,200}return await leadRouteWalk\(/.test(SRC) && /async function rsWalkPoints[\s\S]{0,400}return await leadRouteWalk\(/.test(SRC) && /return await leadRouteWalk\(r\.points, boss\.name/.test(SRC), 'atlas routes (ROUTESM), custom trips and own raid routes all go through leadRouteWalk');
  ok(/moveTogether: true[,}]/.test(SRC.slice(SRC.indexOf('const RSM_RULES'), SRC.indexOf('const RSM_RULES') + 400)), 'swarm.js RSM_RULES: moveTogether default ON');
  // STEP 2: the number rules (swarm.js rsmRules / mtCfg, the dashboard API, route_rules.json)
  {
    const ra = SRC.indexOf('// ROUTESM-PURE-BEGIN'), rb = SRC.indexOf('// ROUTESM-PURE-END');
    const rc = { Math, JSON, String, Number, Object, Array, isFinite, console }; vm.createContext(rc);
    vm.runInContext(SRC.slice(ra, rb) + '\n;globalThis.__Q = { RSM_RULES, RSM_LIMITS, rsmRules };', rc);
    const Q = rc.__Q;
    ok(Q.RSM_RULES.mtMaxWaitSec === 60 && Q.RSM_RULES.mtLeaveSec === 90 && Q.RSM_RULES.mtPaceGap === 600 && Q.RSM_RULES.mtStuckSec === 8, 'RSM_RULES: number defaults 60 s / 90 s / 600 / 8 s');
    ok(JSON.stringify(Q.RSM_LIMITS) === JSON.stringify(M.MT.limits), 'RSM_LIMITS = MT.limits');
    const eff = Q.rsmRules({ rules: [], parties: { P: { mtMaxWaitSec: 30, mtLeaveSec: 99999, mtPaceGap: 'x', mtStuckSec: true } } }, 'P');
    ok(eff.mtMaxWaitSec === 30 && eff.mtLeaveSec === 1800 && eff.mtPaceGap === 600 && eff.mtStuckSec === 8, 'rsmRules: a party number is used, clamped to its limits; a wrong type is ignored');
    const c = M.mtCfg(Q.rsmRules({ rules: [], parties: { P: { mtMaxWaitSec: 30, mtLeaveSec: 120, mtPaceGap: 900, mtStuckSec: 15 } } }, 'P'));
    ok(c.maxWaitMs === 30000 && c.leaveMs === 120000 && c.paceGap === 900 && c.stuckMs === 15000, 'mtCfg: the party numbers reach the walk (max wait, leave, pace gap, stuck seconds)');
    const RVA2 = require(path.join(ROOT, 'Dashboard', 'routeview_api.js'));
    ok(JSON.stringify(RVA2.RR_BUILTIN) === JSON.stringify(Q.RSM_RULES) && JSON.stringify(RVA2.RR_LIMITS) === JSON.stringify(Q.RSM_LIMITS), 'dashboard RR_BUILTIN / RR_LIMITS = swarm.js RSM_RULES / RSM_LIMITS');
    const rrf = JSON.parse(fs.readFileSync(path.join(ROOT, 'Scripts', 'data', 'route_rules.json'), 'utf8').replace(/^﻿/, ''));
    ok(['mtMaxWaitSec', 'mtLeaveSec', 'mtPaceGap', 'mtStuckSec'].every(k => { const r = rrf.rules.find(x => x.key === k); return r && r.type === 'number' && r.default === Q.RSM_RULES[k] && r.min === Q.RSM_LIMITS[k][0] && r.max === Q.RSM_LIMITS[k][1] && r.label && r.help; }), 'route_rules.json: the 4 number rules with plain labels, help, default and range');
    // the API on a scratch data folder: numbers in range saved, out of range / text refused, null = back to the default
    const os = require('os'), SD = fs.mkdtempSync(path.join(os.tmpdir(), 'mt_rr_')); fs.mkdirSync(path.join(SD, 'Scripts', 'data'), { recursive: true });
    fs.copyFileSync(path.join(ROOT, 'Scripts', 'data', 'route_rules.json'), path.join(SD, 'Scripts', 'data', 'route_rules.json'));
    fs.writeFileSync(path.join(SD, 'swarm.config.json'), JSON.stringify({ accounts: [{ character: 'A', party: 'PartyA' }] }));
    const call = (method, body) => new Promise((resolve) => { const req = { method, on: (ev, cb) => { if (ev === 'data' && body) cb(JSON.stringify(body)); if (ev === 'end') cb(); }, destroy: () => { } }; RVA2.handle(req, {}, new URL('http://x/api/routerules'), { DATA: path.join(SD, 'Scripts', 'data'), DIR: path.join(ROOT, 'Dashboard'), allowed: () => true, json: (r, code, v) => resolve({ code, v }), send: (r, code) => resolve({ code }) }); });
    const g = await call('GET'); const rl = g.v.rules.find(r => r.key === 'mtLeaveSec');
    ok(g.code === 200 && rl && rl.type === 'number' && rl.min === 20 && rl.max === 1800 && g.v.values.PartyA.mtLeaveSec === 90, 'GET /api/routerules: number rule with type, range and the default value');
    const p1 = await call('POST', { party: 'PartyA', key: 'mtLeaveSec', value: 150 }); ok(p1.code === 200 && p1.v.values.PartyA.mtLeaveSec === 150, 'POST 150 s: saved');
    const p2 = await call('POST', { party: 'PartyA', key: 'mtLeaveSec', value: 5 }); ok(p2.code === 400 && /20 to 1800/.test(p2.v.error), 'POST 5 s (below the range): refused with the range');
    const p3 = await call('POST', { party: 'PartyA', key: 'mtPaceGap', value: true }); ok(p3.code === 400, 'POST a switch value for a number rule: refused');
    const p4 = await call('POST', { party: 'PartyA', key: 'moveTogether', value: 12 }); ok(p4.code === 400, 'POST a number for a switch: refused');
    const p5 = await call('POST', { party: 'PartyA', key: 'mtLeaveSec', value: null }); ok(p5.code === 200 && p5.v.values.PartyA.mtLeaveSec === 90, 'POST null: back to the default');
    try { fs.rmSync(SD, { recursive: true, force: true }); } catch (e) { }
    const ps = fs.readFileSync(path.join(ROOT, 'Dashboard', 'partysettings.js'), 'utf8'), rv = fs.readFileSync(path.join(ROOT, 'Dashboard', 'routeview.js'), 'utf8');
    ok(/r\.type === 'number'/.test(ps) && /a whole number from \$\{r\.min\} to \$\{r\.max\}/.test(ps) && /Walking together/.test(ps), 'party settings Routes: number fields (plain labels, default + range in the hint, validated)');
    ok(/data-rvnum=/.test(rv) && /data-rv="rulenum"/.test(rv), 'route view Route rules: number fields + save');
    for (const f of ['partysettings.js', 'routeview.js', 'routeview_api.js', 'partystatus.js', 'circuitpage_live.js'].filter(f => fs.existsSync(path.join(ROOT, 'Dashboard', f)))) { /* PKGSKIP: circuitpage_live.js is owner-only */ try { new vm.Script(fs.readFileSync(path.join(ROOT, 'Dashboard', f), 'utf8')); ok(true, f + ' compiles'); } catch (e) { ok(false, f + ': ' + e.message); } }
  }
  const RVA = require(path.join(ROOT, 'Dashboard', 'routeview_api.js')); ok(RVA.RR_BUILTIN.moveTogether === true, 'dashboard RR_BUILTIN: moveTogether default ON');
  const rr = JSON.parse(fs.readFileSync(path.join(ROOT, 'Scripts', 'data', 'route_rules.json'), 'utf8').replace(/^\uFEFF/, ''));
  ok(rr.rules.some(r => r.key === 'moveTogether' && r.default === true && /Move together/.test(r.label)), 'route_rules.json: the "Move together" rule (default on, shown in the route rules / party settings)');
  ok(/moveTogether: \(\(\) => \{ try \{ return isLeader\(\) \? mtPublic\(\)/.test(SRC) && /out\.mt = \{/.test(SRC), 'live line published: swarm_state moveTogether + circuit live');
  ok(/state\.geoWaitN = \(state\.geoWaitN \|\| 0\) \+ 1/.test(SRC), 'planning a route (geopath service) never counts as stuck');
  console.log(`\n${pass} ok, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
