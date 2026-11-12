// BEHINDLEAD-2026-11-10 guard (public tester Vykaax, video: "Party members run in front of the party leader when running waypoints" / "the party
// run 1 point ahead of the leader all of the time, which causes chaos if they run into mobs" / "Party is leading the leader").
// Owner rule docs/requirements/team.md R1: the leader leads; on the way the team runs as ONE dot close BEHIND him; nobody runs ahead.
// Root cause: a member's only limit on a move-together route walk was the waypoint INDEX (mtGateLimit): the moment the leader set off for
// waypoint g, every member ran straight to g at its own speed, so closer / faster members got there first, every leg.
//   1) pure: mtBehindHold (MOVETOGETHER-PURE) - hold on a leg while level with / ahead of the leader's route progress, close up to him at the
//      waypoint (inside reachR: the gate wait can never deadlock), never in the water / while catching up / with an unknown leader position
//   2) a simulated team (the REAL leader + member code of swarm.js in vm windows, virtual clock): faster members starting AHEAD of the leader
//      never get ahead of him along the route, the walk still arrives, nobody is flagged stuck while holding; the same run with the hold
//      switched off shows the bug (members ahead) - so this test really detects it
//   3) source: the member step + its hop abort + the stuck watch use the hold; the leader's view uses live positions
// Nothing live. Usage: node docs/plan/tools/test_behind_leader.js
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m); } };

console.log('1) pure mtBehindHold');
const pa = SRC.indexOf('// MOVETOGETHER-PURE-BEGIN'), pb = SRC.indexOf('// MOVETOGETHER-PURE-END');
ok(pa > 0 && pb > pa, 'MOVETOGETHER-PURE block found');
const pc = { Math, JSON, Number, String, Object, Array, isFinite, Set };
vm.createContext(pc);
vm.runInContext(SRC.slice(pa, pb) + '\n;globalThis.__M = { MT, mtBehindHold, mtCum, mtCfg };', pc);
const M = pc.__M;
ok(typeof M.mtBehindHold === 'function', 'mtBehindHold exists');
{
  const pts = [{ x: 0, y: 0, z: -3000 }, { x: 1000, y: 0, z: -3000 }, { x: 2000, y: 0, z: -3000 }], cum = M.mtCum(pts);
  const H = (o) => M.mtBehindHold(Object.assign({ pts, cum, gate: 1, my: 0, wet: false, left: false }, o));
  ok(M.MT.behind < M.mtCfg({}).paceGap && M.MT.behind < M.MT.limits.mtPaceGap[0], `the hold gap (${M.MT.behind}) is below every pace gap (the leader and a member never wait for each other)`);
  ok(M.MT.behindAt < M.MT.reachR, `at the waypoint a member closes up to max ${M.MT.behindAt} (< reachR ${M.MT.reachR}: it counts as there, the gate wait cannot deadlock)`);
  ok(H({ me: { x: 400, y: 0 }, lead: { x: 400, y: 0, z: -3000 } }) === true, 'level with the leader on a leg: hold');
  ok(H({ me: { x: 600, y: 0 }, lead: { x: 400, y: 0, z: -3000 } }) === true, 'ahead of the leader on a leg: hold');
  ok(H({ me: { x: 300, y: 0 }, lead: { x: 400, y: 0, z: -3000 } }) === false, '100 behind the leader: walk on (right behind him)');
  ok(H({ me: { x: 360, y: 0 }, lead: { x: 400, y: 0, z: -3000 } }) === true, '40 behind (closer than the gap): hold');
  ok(H({ my: 1, me: { x: 1000, y: 0 }, lead: { x: 200, y: 0, z: -3000 } }) === true, 'standing at the waypoint while the leader is still on the way to it: hold (wait for him)');
  ok(H({ me: { x: 900, y: 0 }, lead: { x: 900, y: 0, z: -3000 } }) === false, 'leader AT the waypoint (100 short): a member 100 short closes up');
  ok(H({ me: { x: 950, y: 0 }, lead: { x: 880, y: 0, z: -3000 } }) === true, 'leader at the waypoint 120 short: a member never goes past his distance (50 short = hold)');
  ok(H({ me: { x: 820, y: 0 }, lead: { x: 820, y: 0, z: -3000 } }) === false && H({ me: { x: 851, y: 0 }, lead: { x: 820, y: 0, z: -3000 } }) === true, 'leader 180 short of the point: a member stops level with him');
  ok(H({ me: { x: 805, y: 0 }, lead: { x: 805, y: 0, z: -3000 } }) === false && H({ me: { x: 812, y: 0 }, lead: { x: 805, y: 0, z: -3000 } }) === true, `leader 195 short: members close up to ${M.MT.behindAt} short (inside reachR ${M.MT.reachR}: counted as there, the gate wait never deadlocks)`);
  ok(H({ me: { x: 900, y: 150 }, lead: { x: 850, y: 0, z: -3000 } }) === false, 'off to the side 180 from the point: still walks closer (the hold works on the distance to the point, so a member always gets inside reachR)');
  ok(H({ me: { x: 400, y: 0 }, lead: null }) === false, 'leader position unknown: no hold (the waypoint limit still applies)');
  ok(H({ me: { x: 400, y: 0 }, lead: { x: 400, y: 0, z: -3000 }, left: true }) === false, 'catching up after being left: no hold');
  ok(H({ me: { x: 400, y: 0 }, lead: { x: 400, y: 0, z: -3000 }, wet: true }) === false, 'in the water: never hold (nobody stops swimming)');
  const sw = [{ x: 0, y: 0 }, { x: 1000, y: 0, swim: true }, { x: 2000, y: 0 }];
  ok(M.mtBehindHold({ pts: sw, gate: 1, my: 0, me: { x: 400, y: 0 }, lead: { x: 400, y: 0 } }) === false, 'a swim leg: never hold');
}

console.log('2) simulated team (real leader + member code)');
const sa = SRC.indexOf('// MOVETOGETHER-PURE-BEGIN'), sb = SRC.indexOf('/** ROUTE TEST (user 2026-10-06 21:55');
const ka = SRC.indexOf('// KEEPHUNT-PURE-START'), kb = SRC.indexOf('// KEEPHUNT-PURE-END');
ok(sa > 0 && sb > sa, 'leader + member block found');
const BLOCK = (ka > 0 && kb > ka ? SRC.slice(ka, kb) + '\n' : '') + SRC.slice(sa, sb);
function sim(opts) {
  const S = { t: 1e9, timers: [], wins: {}, said: [], errs: [], files: {}, events: [] };
  const sleep = (ms) => new Promise(r => S.timers.push({ at: S.t + Math.max(1, ms), r }));
  function win(name, o) {
    const W = { name, me: Object.assign({ X: 0, Y: 0, Z: -3000, Name: name, IsDead: false, IsSitting: false, IsInCombat: false }, o.pos || {}), goal: null, speed: o.speed || 200, handlers: {}, intervals: [], notes: [], acc: 'acc-' + name };
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
      Me: W.me, CONFIG: { leader: opts.leader, mainLeader: opts.leader, together: {}, travel: {} }, state: {}, control: { gen: 1 },
      now: () => S.t, sleep, num: (v) => Number(v) || 0, P: (x, y) => `${Math.round(x)},${Math.round(y)}`,
      note: (m) => { W.notes.push(m); }, setTask: (t) => { W.task = t; }, intent: () => { }, intentDone: () => { }, pstHold: () => { },
      logError: (w, e) => { S.errs.push(`${name} ${w}: ${e && e.stack || e}`); }, SayToParty: (m) => S.said.push(m), appendShared: () => { },
      App: { on: (n, f) => { W.handlers[n] = f; }, emit: (n, d) => bus(name, n, d, null), emitTo: (id, n, d) => bus(name, n, d, id) },
      Send: { StopMove: () => { W.goal = null; }, MoveBackwardToLocation: (x, y, z) => moveTo(x, y, z) },
      Options: { ActiveFollow: false, FollowName: '' }, followOk: () => false,
      isLeader: () => isL, teamNames: () => isL ? Object.keys(S.wins).filter(n => n !== name) : [],
      livePos: {}, posAcct: { [opts.leader]: 'acc-' + opts.leader }, benched: () => false, mateMsg: () => true, runHeld: () => false, IsCharacterReady: () => true, IsInCombat: false,
      bfStanceLive: () => false, rest: { sitting: false }, geoCache: { key: '' }, rsLegMs: (d) => Math.max(30000, d * 10), castRunSpeed: () => 200,
      nearestRouteIdx: (pts) => { let bi = 0, bd = 1e12; pts.forEach((p, i) => { const d = Math.hypot(p.x - W.me.X, p.y - W.me.Y); if (d < bd) { bd = d; bi = i; } }); return bi; },
      routeRulesNow: () => ({ moveTogether: true }),
      rcTravelFighting: () => false, rcOn: () => false, rcEvent: () => { }, rcRouteHop: (p, a) => walk(p, 120, 30000, a),
      TOWN_CMD: { Giran: 'giran' }, TOWN_LAND: { Giran: [0, 0] }, townCommand: async () => true, lastTownCmd: 0,
      SCHED: { clear: (h) => { W.intervals = W.intervals.filter(x => x !== h); } },
      setInterval: (f, ms) => { const h = { f, ms, next: S.t + ms }; W.intervals.push(h); return h; }, setTimeout: (f, ms) => { S.timers.push({ at: S.t + ms, r: f }); },
      File: { ReadAllText: (p) => { if (S.files[p] === undefined) throw new Error('no file'); return S.files[p]; }, WriteAllText: (p, t) => { S.files[p] = String(t); }, Exists: (p) => S.files[p] !== undefined },
      SWARM_ROOT: 'X:', loadRaidRoute: () => null, raidRouteFile: () => '', currentTownKey: () => null, townKeyFor: () => null, gkTeleport: async () => true,
      routeHop: async (p, abort) => walk(p, o.hopDist || 200, 30000, abort),   // the real routeHop counts ~200 before a point as reached (live: the leader up to ~300)
      walkDirect: async (x, y, z, dist, ms, abort) => walk({ x, y, z }, dist, ms, abort),
      geoRoute: async () => { await sleep(500); return { ok: false }; }, inRaid: () => false, standUp: () => { },
    };
    W.ctx = ctx;
    vm.createContext(ctx);
    vm.runInContext(BLOCK + '\n;globalThis.__H = { leadRouteWalk, memberRoute, mtCum, mtProg };', ctx);
    if (o.noHold) vm.runInContext('mtBehindHold = function () { return false; };', ctx);   // the code before the fix
    if (o.noGateFlag) vm.runInContext('(function () { const f = mtBehindHold; mtBehindHold = function (q) { return f(Object.assign({}, q, { leaderAtGate: false })); }; })();', ctx);   // the 22:08 deploy (member side of BEHINDFIX off)
    W.H = ctx.__H; S.wins[name] = W; return W;
  }
  function bus(from, n, d, to) {
    S.events.push({ t: S.t, from, n, d });
    Object.values(S.wins).forEach(W => {
      if (W.name === from || (to && W.acc !== to)) return;
      const h = W.handlers[n]; if (!h) return;
      try { h({ source: { characterName: from, accountId: 'acc-' + from }, data: JSON.parse(JSON.stringify(d || {})) }); } catch (e) { S.errs.push(`${W.name} handler ${n}: ${e.stack}`); }
    });
  }
  function step() {
    Object.values(S.wins).forEach(W => {
      if (!W.goal) return;
      const dx = W.goal.x - W.me.X, dy = W.goal.y - W.me.Y, d = Math.hypot(dx, dy); if (d < 1) { W.goal = null; return; }
      const k = Math.min(1, W.speed * 0.25 / d); W.me.X += dx * k; W.me.Y += dy * k; W.me.Z = W.goal.z;
    });
    Object.values(S.wins).forEach(W => Object.values(S.wins).forEach(V => { if (V !== W) W.ctx.livePos[V.name] = { X: V.me.X, Y: V.me.Y, Z: V.me.Z, IsDead: false, at: S.t, hit: false, fight: false }; }));
  }
  async function flush() { for (let k = 0; k < 30; k++) await new Promise(r => setImmediate(r)); }
  async function run(maxMs, until) {
    const end = S.t + maxMs;
    while (S.t < end && !(until && until())) {
      S.t += 250;
      for (const W of Object.values(S.wins)) for (const iv of W.intervals.slice()) if (S.t >= iv.next) { iv.next += iv.ms; try { iv.f(); } catch (e) { S.errs.push(`${W.name} interval: ${e.stack}`); } }
      const due = S.timers.filter(x => x.at <= S.t); S.timers = S.timers.filter(x => x.at > S.t); due.forEach(x => { try { x.r(); } catch (e) { S.errs.push('timer ' + e.stack); } });
      step(); if (S.watch) S.watch(); await flush();
    }
  }
  return { S, win, run };
}
const line = (n) => Array.from({ length: n }, (_, k) => ({ x: k * 1000, y: 0, z: -3000 }));
async function scenario(noHold, xo) {
  xo = xo || {};
  const pts = line(6);
  const { S, win, run } = sim({ leader: 'Lead' });
  const L = win('Lead', { pos: { X: 0, Y: 0 }, speed: 180, hopDist: xo.leadHop });
  // faster members, two of them standing a little AHEAD of the leader at the start
  const mo = { noHold, noGateFlag: !!xo.noGateFlag };
  win('A', Object.assign({ pos: { X: 150, Y: 40 }, speed: 260 }, mo)); win('B', Object.assign({ pos: { X: 80, Y: -40 }, speed: 220 }, mo)); win('C', Object.assign({ pos: { X: -120, Y: 0 }, speed: 200 }, mo));
  S.maxGateMs = 0; let gSince = 0, gIdx = -1;
  const cum = L.H.mtCum(pts);
  let maxAhead = 0, aheadTicks = 0, stuckNotes = 0, legTicks = 0;
  S.watch = () => {
    const mt0 = L.ctx.state.mt;
    if (mt0 && mt0.phase === 'gate' && mt0.act !== 'done') { if (gIdx !== mt0.i) { gIdx = mt0.i; gSince = S.t; } S.maxGateMs = Math.max(S.maxGateMs, S.t - gSince); } else gIdx = -1;
    const mt = mt0; if (!mt || mt.phase !== 'leg' || mt.act === 'done') return;
    legTicks++;
    const g = mt.i, lp = L.H.mtProg(pts, cum, g - 1, { x: L.me.X, y: L.me.Y });
    ['A', 'B', 'C'].forEach(n => { const W = S.wins[n], m = W.H.memberRoute; if (!m.id) return; const mp = L.H.mtProg(pts, cum, Math.min(m.my, g - 1), { x: W.me.X, y: W.me.Y }); const a = mp - lp; if (a > maxAhead) maxAhead = a; if (a > 60) aheadTicks++; });   // > 60 ahead = ahead (BEHINDFIX: at the waypoint members walk into its reach circle, one step of slack; < L2 close range 80-100)
  };
  let res = null; L.H.leadRouteWalk(pts, 'Behind Test', () => false, '', null, null).then(r => { res = r; });
  await run(400000, () => res !== null);
  ['A', 'B', 'C'].forEach(n => { stuckNotes += S.wins[n].notes.filter(x => /no progress toward point|unstick steps/.test(x)).length; });
  const end = ['A', 'B', 'C'].map(n => Math.hypot(S.wins[n].me.X - L.me.X, S.wins[n].me.Y - L.me.Y));   // at the end: next to the leader (one dot)
  return { res, maxAhead, aheadTicks, legTicks, stuckNotes, end, errs: S.errs, paces: S.events.length, maxGateMs: S.maxGateMs };
}
(async () => {
  const fixed = await scenario(false);
  ok(fixed.res === true, 'with the fix: the team walk arrives');
  ok(fixed.aheadTicks === 0, `with the fix: no member ever got ahead of the leader along the route on a leg (max ${Math.round(fixed.maxAhead)} ahead incl. step size, ${fixed.legTicks} leg ticks)`);
  ok(fixed.end.every(d => d < 200), `with the fix: everyone at the end, right next to the leader (${fixed.end.map(Math.round).join(', ')} from him)`);
  ok(fixed.stuckNotes === 0, 'holding behind the leader never counts as stuck (no unstick ladder)');
  ok(!fixed.errs.length, 'no errors' + (fixed.errs.length ? ': ' + fixed.errs[0] : ''));
  const old = await scenario(true);
  ok(old.aheadTicks > 0, `control - the code before the fix: members ran ahead of the leader (max ${Math.round(old.maxAhead)} ahead, ${old.aheadTicks} ticks) = the bug the testers saw`);
  // BEHINDFIX-2026-11-10 regression (live 22:08 deadlock, 4 parties): the leader's walk counts a waypoint reached ~300 short (outside reachR), he
  // waits at the gate for members "208-378 away" while they hold "right behind" him. Must finish.
  const dl = await scenario(false, { leadHop: 320 });
  ok(dl.res === true, `deadlock case (leader stops 320 short of every waypoint): the walk finishes`);
  ok(dl.maxGateMs <= 15000, `deadlock case: no gate wait longer than 15 s (longest ${Math.round(dl.maxGateMs / 1000)} s)`);
  ok(!dl.errs.length, 'deadlock case: no errors' + (dl.errs.length ? ': ' + dl.errs[0] : ''));
  const net = await scenario(false, { leadHop: 320, noGateFlag: true });
  ok(net.res === true && net.maxGateMs <= 20000, `the leader's safety net alone (members ignore the 'gate' flag, as on the 22:08 deploy): still finishes (longest gate wait ${Math.round(net.maxGateMs / 1000)} s)`);
  ok(/if \(o && o\.leaderAtGate\) return false;/.test(SRC) && /L\.ph = 'gate'; L\.emit\(false\);/.test(SRC) && /memberRoute\.ph = d\.ph === 'gate'/.test(SRC), "the leader announces 'at the waypoint' and members never hold then");
  ok(/phase === 'gate' && pos && reached < g && t - \(L\.gateSince \|\| t\) >= 5000 && Math\.hypot\(pos\.x - me\.x, pos\.y - me\.y\) <= Math\.min\(L\.cfg\.paceGap, MT\.gateNear\)/.test(SRC), 'safety net: after 5 s at the gate a member within min(pace gap, 200) of the leader (live) counts as arrived (PACE400: the wider leg gap never loosens the gate)');

  console.log('3) source wiring');
  const step = SRC.slice(SRC.indexOf('function memberRouteStep() {'), SRC.indexOf('setInterval(memberRouteStep, 1000);'));
  ok(step.length > 1000 && /if \(mtBehindNow\(m\)\) \{ setTask\(/.test(step), 'the member step holds behind the leader before starting a hop');
  ok(/now\(\) < \(m\.hold \|\| 0\) \|\| mtBehindNow\(m\)\)\)\)/.test(step), 'a running hop stops when it caught up with the leader (abort)');
  ok(/now\(\) < \(m\.hold \|\| 0\) \|\| m\.behind\)\) \{ try \{ Send\.StopMove\(\)/.test(step), 'a hop stopped behind the leader is not a failed hop (no fell-off / stuck path)');
  ok(/const held = \(!m\.left && next > mtGateLimit\(m\.pts, m\.gate\)\) \|\| mtBehindNow\(m\);/.test(SRC), 'the stuck watch counts holding behind the leader as waiting');
  ok(/setInterval\(\(\) => \{ try \{ const m = memberRoute; if \(!m\.id \|\| !m\.mt \|\| m\.busy \|\| !m\.behind/.test(SRC), 'released from the hold = walk on at once (250 ms check, no stop-and-go)');
  ok(/const pos = seen\[n\] \|\| \(lp \?/.test(SRC) && /function mtSeenChars\(\)/.test(SRC), 'the leader judges the pace from live positions (CharList) before the 3 s reports');
  ok(/function mtLeadPos\(\)[\s\S]{0,300}CharList\.GetItemByName\(String\(CONFIG\.leader\)\)/.test(SRC) && /function mtLeadPos\(\)[\s\S]{0,700}now\(\) - \(lp\.at \|\| 0\) < 5000/.test(SRC), 'members read the leader live from CharList (one host call; report fallback < 5 s)');  console.log(`\nbehind leader: ${pass} ok, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FAIL crashed: ' + e.stack); process.exit(1); });
