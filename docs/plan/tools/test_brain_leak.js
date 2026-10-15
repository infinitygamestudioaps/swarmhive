// BRAIN LEAK TEST (2026-10-15, LEAK-2026-10-15). Nothing live: fake world -> Scripts_dev/agent2.js -> TCP -> runner -> Scripts_dev/swarm.js
// (the test_brain_host.js chain, virtual clock). Party Tank1 (9 characters, the real roster) stands in a field and replays the failing loops
// the live party ran on 2026-10-15 08:08-12:07: the leader cannot move at all (every move ignored, never teleported, every '.town' answered
// with the usage message), members walk back to him, monsters around, orders retried (!raidhunt, !supply, !town giran, !level, !stop, ...)
// every 7 simulated minutes -> regroup / gather team / supply / raid travel fail over and over.
// 1. STATIC checks (fast): no clearInterval/clearTimeout on a scheduler job (SCHED handles), the per-run / per-objId maps fixed on
//    2026-10-15 prune themselves, pruneKeys works, the virtual clock drops fired one-shot timers, the heap probe module works.
// 2. DYNAMIC: worker heap after GC every simulated hour + per context the size of every top-level container of swarm.js (heapprobe.js
//    sizer). Lazy data loads (dungeon rooms, soul data, ...) happen in the first 2 hours, so growth is judged from hour 2 to the end.
// Usage: node docs/plan/tools/test_brain_leak.js [--long] [--scenario stuck|hunt|both] [--hours 4] [--names 9] [--static] [--explore] [--snap] [--script <swarm.js copy>]
//        default: static + hunt, 2 characters, 3 simulated hours (~5 min)   --long: both scenarios, 9 characters, 4 hours (~45 min)
//        --static: only part 1   --explore: print the top growers per hour   --snap: heap snapshots at hour 2 and the last hour (temp dir;
//        compare them with docs/plan/tools/heap_diff.js)          exit 1 on failure. Results: docs/plan/new_engine/sim_leak_last_run.json
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), v8 = require('v8');
const arg = (k, d) => process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d;
const LONG = process.argv.includes('--long');   // the full 9-character runs (~5 min wall per simulated hour); default = a short run (< 10 min)
const HOURS = Math.max(3, Number(arg('--hours', LONG ? 4 : 3))), NAMES = Number(arg('--names', LONG ? 9 : 2)), EXPLORE = process.argv.includes('--explore'), STATIC_ONLY = process.argv.includes('--static');
if (typeof global.gc !== 'function' && !STATIC_ONLY) { const cp = require('child_process'); const r = cp.spawnSync(process.execPath, ['--expose-gc', '--max-old-space-size=8192', __filename].concat(process.argv.slice(2)), { stdio: 'inherit' }); process.exit(r.status == null ? 1 : r.status); }
const T1 = require('./test_brain_host.js');
const { World, Clock, Runner, run, realTurn, mkTmp, ROOT } = T1;
const HP = require(path.join(ROOT, 'Dashboard', 'brain_host', 'heapprobe.js'));
const AGENT3 = path.join(ROOT, 'Scripts_dev', 'agent2.js');
const SCRIPT = process.argv.includes('--script') ? path.resolve(arg('--script')) : path.join(ROOT, 'Scripts_dev', 'swarm.js');

let pass = 0, fail = 0; const RESULTS = []; let HGROW = {};
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (c) pass++; else fail++; };

// ================================================================== 1. static
async function staticChecks() {
  console.log('STATIC');
  const src = fs.readFileSync(SCRIPT, 'utf8'), L = src.split('\n');
  // a) every interval handle created inside a function is cleared with SCHED.clear (clearInterval / clearTimeout never stop a scheduler job)
  const esc = (s) => s.replace(/[.$]/g, (m) => '\\' + m), bad = [];
  let n = 0;
  L.forEach((l, i) => {
    const m = /([A-Za-z_$][\w$.]*)\s*=\s*setInterval\(/.exec(l); if (!m || !/^\s/.test(l)) return; n++;
    const re = new RegExp('\\b(clearInterval|clearTimeout)\\(\\s*' + esc(m[1]) + '\\s*\\)');
    for (let j = i; j < Math.min(L.length, i + 400); j++) if (re.test(L[j])) bad.push(`${m[1]} (set line ${i + 1}, cleared with ${re.exec(L[j])[1]} line ${j + 1})`);
  });
  ok(n > 10 && bad.length === 0, `${n} interval handles inside functions, none cleared with clearInterval/clearTimeout (scout holdFlee + speedTimer, epic iv ran forever): ${bad.join('; ') || 'ok'}`);
  // b) the maps fixed on 2026-10-15 prune
  const has = (re, what) => ok(re.test(src), what);
  has(/function pruneKeys\(o, max, old\)/, 'pruneKeys helper present');
  has(/function recordAck\(key, data\) \{\n[^\n]*\n\s*teamAckAt\[key\] = now\(\); pruneKeys\(teamAckAt, 40,/, 'recordAck prunes teamAcks (one entry per run:action, +1300 entries per hour in the failing loops)');
  has(/castBadTgt\[tid\] = now\(\) \+ 10000; pruneKeys\(castBadTgt,/, 'castBadTgt (per monster objId) prunes');
  has(/pruneKeys\(minionOnMate, 200,/, 'minionOnMate (per attacker objId) prunes');
  has(/badEquip\[best\.objId\] = now\(\); pruneKeys\(badEquip,/, 'badEquip (per item objId) prunes');
  has(/SCHED\.clear\(holdFlee\); SCHED\.clear\(speedTimer\);/, 'scout trip stops both of its jobs');
  // c) pruneKeys semantics (source evaluated in a fresh context)
  const fsrc = /function pruneKeys\(o, max, old\) \{[^\n]*\}/.exec(src);
  if (fsrc) {
    const c = vm.createContext({}); vm.runInContext(fsrc[0], c);
    const o = {}; for (let i = 0; i < 300; i++) o['k' + i] = i;
    c.pruneKeys(o, 500, (v) => v < 100); const kept1 = Object.keys(o).length;
    c.pruneKeys(o, 200, (v) => v < 100); const kept2 = Object.keys(o).length;
    c.pruneKeys(o, 10, () => { throw new Error('x'); }); const kept3 = Object.keys(o).length;
    ok(kept1 === 300 && kept2 === 200 && kept3 === 0, `pruneKeys: below max nothing (${kept1}), above max the old ones (${kept2} left), a throwing test drops the entry (${kept3})`);
  } else ok(false, 'pruneKeys source not found');
  // c2) WALKDELTA: the walk recorder keeps only the cells since the last write; the file ends up exactly as the old whole-in-memory writer made it
  {
    const a = src.indexOf('const WALK = {'), b = src.indexOf('setInterval(() => { if (myWalk.dirty && now() - myWalk.lastFlush >= WALK.flushMs) walkFlush(); }, 30000);');
    if (a < 0 || b < 0) ok(false, 'walk recorder block not found');
    else {
      const files = {}, ivs = []; let t = 1e6, broken = false;
      const W = vm.createContext({ SWARM_ROOT: 'C:\\R', Me: { Name: 'Tester', X: 0, Y: 0, Z: 0, IsDead: false }, state: { role: 'sk' }, IsCharacterReady: () => true, now: () => t, Math, JSON, String, Number, Object,
        File: { ReadAllText: (f) => { if (broken) throw new Error('locked'); if (!(f in files)) throw new Error('missing'); return files[f]; }, Exists: (f) => f in files, WriteAllText: (f, x) => { files[f] = String(x); } },
        setInterval: (fn, ms) => { ivs.push(fn); return ivs.length; } });
      vm.runInContext(src.slice(a, src.indexOf('\n', b)), W);
      const F = 'C:\\R\\Logs\\walkpaths\\walk_Tester.json';
      files[F] = JSON.stringify({ nodes: { '0_0': [1, 2, 3] }, edges: {} });                       // the old file: cell 0_0 first seen at (1,2,3)
      const tick = ivs[0], flushIv = ivs[1];
      const walk = (x) => { W.Me.X = x; tick(); };
      [0, 150, 300, 450, 300, 150, 0].forEach(walk);
      const resident = Object.keys(vm.runInContext('myWalk.nodes', W)).length;
      t += 200000; flushIv();
      const j1 = JSON.parse(files[F]);
      const deltaAfter = Object.keys(vm.runInContext('myWalk.nodes', W)).length;
      const keep = JSON.stringify(j1.nodes['0_0']) === '[1,2,3]', cells = Object.keys(j1.nodes).sort().join(','), e1 = (j1.edges['1_0'] || []).slice().sort().join(',');
      broken = true; [600, 750].forEach(walk); t += 200000; flushIv(); const kept = Object.keys(vm.runInContext('myWalk.nodes', W)).length; const same = files[F] === JSON.stringify(j1);
      broken = false; t += 200000; flushIv(); const j2 = JSON.parse(files[F]);
      const mine = vm.runInContext('walkMine()', W);
      ok(resident <= 4 && deltaAfter === 0 && keep && cells === '0_0,1_0,2_0,3_0' && e1 === '0_0,2_0' && kept === 2 && same && Object.keys(j2.nodes).length === 6 && Object.keys(mine.nodes).length === 6,
        `walk recorder: ${resident} cells in memory before the write, ${deltaAfter} after (was: the whole file), first position kept ${keep}, cells ${cells}, edges of 1_0 ${e1}; unreadable file -> not overwritten (${same}), delta kept (${kept}), written later (${Object.keys(j2.nodes).length} cells)`);
    }
  }
  // d) virtual clock: fired one-shot timers leave the owner's set (count stays small)
  const clk = new Clock({ virtual: true, start: 0 }), T = clk.forOwner('t');
  for (let i = 0; i < 5000; i++) T.setTimeout(() => { }, i % 50);
  const iv = T.setInterval(() => { }, 1000);
  await clk.advance(2000);
  ok(T.count() === 1, `virtual clock: 5000 fired setTimeouts leave the owner's timer set (count ${T.count()}, was 5001 before the fix)`);
  T.clearInterval(iv); T.dispose();
  // e) heap probe module: names, sizer, probe line
  const names = HP.topNames("const a = {}, b = [1, 2], c = 'x,y';\nlet d = new Set();\nfunction f() {}\n  const inner = 1;\nasync function g() {}\nvar h = 2, i = { x: 1 };");
  ok(['a', 'b', 'c', 'd', 'f', 'g', 'h', 'i'].every(x => names.includes(x)) && !names.includes('inner'), `heapprobe.topNames: ${names.join(',')}`);
  const ctx = vm.createContext({}); vm.runInContext("const big = {}; for (let i = 0; i < 1000; i++) big['k' + i] = { v: i }; const small = [1, 2]; function fn() {} fn.cache = { a: 1 };", ctx);
  const sz = JSON.parse(vm.runInContext(HP.SIZER, ctx)(['big', 'small', 'fn', 'nope'], 100000));
  ok(sz.big > 2000 && sz.small >= 3 && sz.fn >= 2 && !('nope' in sz), `heapprobe.SIZER: big ${sz.big}, small ${sz.small}, fn.cache ${sz.fn}`);
  const tmp = mkTmp(); fs.mkdirSync(path.join(tmp, 'Logs'));
  const fakeRunner = { o: { script: SCRIPT }, ctxs: new Map([['X', { name: 'X', ctx, timers: { count: () => 3 }, link: { pending: new Map() }, accountId: 'a', host: { appEvents: new Map() } }]]), bus: { members: new Map() } };
  const pr = HP.startProbe({ party: 'P', root: tmp, runner: fakeRunner, every: 600000, busy: () => false });
  const rec = await pr.probeNow({ snapshot: true }); pr.stop();
  const line = fs.readFileSync(path.join(tmp, 'Logs', 'brain_heap_probe.log'), 'utf8').trim().split('\n').map(x => JSON.parse(x))[0];
  ok(rec && line && line.party === 'P' && line.heap.used > 0 && line.contexts[0].timers === 3 && /refused/.test(line.snapshot || ''), `heap probe writes Logs/brain_heap_probe.log (used ${line && line.heap.used} MB, ${line && line.ms} ms, snapshot without a pausing pool: ${line && line.snapshot ? 'refused' : '?'})`);
  ok(/^HEAP used [\d.]+ MB/.test(HP.heapLine(3)), 'heapLine: ' + HP.heapLine(3));
  // f) worker.js starts the probe; pool.js pauses its watchdog for a 'busy' worker, logs HEAP every 5 min, judges memory per character
  const wsrc = fs.readFileSync(path.join(ROOT, 'Dashboard', 'brain_host', 'worker.js'), 'utf8'), psrc = fs.readFileSync(path.join(ROOT, 'Dashboard', 'brain_host', 'pool.js'), 'utf8');
  ok(/require\('\.\/heapprobe'\)\.startProbe\(/.test(wsrc) && /k: 'busy'/.test(wsrc), 'worker.js starts the heap probe (flag Logs/brain_heap_probe.flag)');
  ok(/case 'busy':/.test(psrc) && /W\.busyUntil && t < W\.busyUntil/.test(psrc) && /busyOk: true/.test(psrc), 'pool.js: busy worker skipped by the watchdog (heap snapshot)');
  ok(/heapLog\(out\)/.test(psrc) && /out\.heapHist = /.test(psrc), 'pool.js: HEAP line every 5 min + heapHist in the stats file');
  ok(/const per = \(w\) =>/.test(psrc), 'pool.js: memory guard compares heap per character');
}

// ================================================================== 2. dynamic
class LeakWorld extends World {
  constructor(clock, frozen) {
    super(clock); this.frozen = new Set(frozen || []);
    this.onSend = (c, k, a) => {
      if (k === 'Say2' && Number(a[0]) === 0 && /^\.[a-z]+/.test(String(a[1]))) { this.timers.setTimeout(() => this.emit(c, 'OnSystemMessage', 1983, 'Usage: .town ...'), 400); return null; }   // .town refused
      if (k === 'Action' && this.frozen.has(c.name)) { c.target = Number(a[0]) || 0; return null; }
      return undefined;
    };
  }
  moveTo(c, x, y, z, cb) { if (this.frozen.has(c.name)) { c.me.IsMoving = false; return; } super.moveTo(c, x, y, z, cb); }
}
// SCENARIOS: 'stuck' = the leader frozen, .town refused, orders retried (the 2026-10-15 08:08-12:07 loops); 'hunt' = the party levels in a
// field (the 12:20 Fields of Massacre hunt): 14 monsters, every kill respawns as a NEW monster (new objId, like the game), the leader re-orders
// '!hunthere' now and then — per-objId state (targets, casts, blacklists, positional hits) must not pile up.
async function dynamic(SCEN) {
  HGROW = {};
  console.log(`DYNAMIC '${SCEN}' (${NAMES} characters, ${HOURS} simulated hours; ~5 min wall per hour)`);
  const tmp = mkTmp(), overlay = path.join(tmp, 'overlay'); fs.mkdirSync(overlay);
  const port = 20100 + Math.floor(Math.random() * 600);
  const clock = new Clock({ virtual: true, start: Date.now() });
  const roster = ['Tank1', 'Bishop1', 'Destroyer1', 'Destroyer2', 'Doombringer1', 'Necro1', 'Inspector1', 'Chanter1', 'Saint1'].slice(0, NAMES);
  const runner = new Runner({ port, clock, overlay, isolate: ['Logs'], allow: roster, logFile: path.join(tmp, 'brain_host.log'), root: ROOT.replace(/\//g, '\\'), geopath: true, script: SCRIPT, sharedParse: true });
  T1.setCur(runner);
  await runner.start();
  const world = new LeakWorld(clock, SCEN === 'stuck' ? ['Tank1'] : []); world.sockets = new Set();
  const F = { x: -19061, y: 136763, z: -3800 };   // Ruins of Despair landing (the 2026-10-04 trap spot)
  const spots = SCEN === 'stuck' ? [[600, 300], [-500, 450], [300, -700], [1100, -200], [-900, -800], [1500, 900]] : Array.from({ length: 14 }, (_, i) => [Math.round(Math.cos(i) * (400 + 90 * i)), Math.round(Math.sin(i) * (400 + 90 * i))]);
  spots.forEach(([dx, dy], i) => world.addMob(i % 2 ? 'Ruin Zombie' : 'Ruin Spartoi', 20000 + i, 20, F.x + dx, F.y + dy, F.z));
  if (SCEN === 'hunt') {   // a dead monster disappears after 8 s and a NEW one (new objId) spawns at its place 20 s later
    world.mobs.forEach(m => { m.noRespawn = true; m.home = [m.X, m.Y]; });
    world.timers.setInterval(() => { const t = clock.now(); world.mobs.slice().forEach(m => { if (!m.IsDead) return; m.deadAt = m.deadAt || t; if (!m.gone && t - m.deadAt > 8000) { m.gone = true; world.mobs.splice(world.mobs.indexOf(m), 1); world.timers.setTimeout(() => { world.addMob(m.Name, m.Id, 20, m.home[0], m.home[1], F.z); const n = world.mobs[world.mobs.length - 1]; n.noRespawn = true; n.home = m.home; }, 20000); } }); }, 2000);
  }
  world.addNpc('Gatekeeper Ziggurat', 31095, F.x + 3000, F.y + 3000, F.z, 'Gatekeeper');
  const SK = [[1216, 'Self Heal', 1, 'SELF'], [28, 'Aggression', 10, 'ENEMY'], [18, 'Aura of Hate', 5, 'ENEMY']], HEAL = [[1011, 'Heal', 18, 'ONE'], [1015, 'Battle Heal', 15, 'ONE'], [1016, 'Resurrection', 3, 'ONE']];
  roster.forEach((nm, i) => { const c = world.addChar(nm, i === 0 ? 33 : (i === 1 || i === 8) ? 16 : 57, 40, F.x + (i % 3) * 300, F.y + Math.floor(i / 3) * 300, { leader: i === 0, skills: i === 0 ? SK : (i === 1 || i === 8) ? HEAL : [[255, 'Power Smash', 10, 'ENEMY']] }); c.flags.CurrentZone = 'GENERALZONE'; c.me.Z = F.z; });
  const asrc = fs.readFileSync(AGENT3, 'utf8');
  for (const c of world.chars.values()) world.startAgent(c, port, asrc);
  const names = HP.topNames(fs.readFileSync(SCRIPT, 'utf8'));
  const sizes = (nm) => { const C = runner.ctxs.get(nm); if (!C) return {}; try { return JSON.parse(vm.runInContext(HP.SIZER, C.ctx)(names, 300000)); } catch (e) { console.log('sizer', e.message); return {}; } };
  const heap = async () => { for (let i = 0; i < 4; i++) { global.gc(); await realTurn(5); } return process.memoryUsage().heapUsed; };
  const ORDERS = SCEN === 'stuck' ? ['!raidhunt', '!supply', '!town giran', '!level', '!stop', '!raidhunt', '!town dion', '!supply'] : ['!hunthere 2500'];
  let oi = 0, lastOrder = 0;
  const t0 = Date.now();
  await run(clock, world, 60000, 500);
  const watch = roster.slice(0, Math.min(3, roster.length)), rows = [];
  let prevSizes = Object.fromEntries(watch.map(n => [n, sizes(n)])), baseSizes = null, baseHeap = 0;
  const h0 = await heap(); rows.push({ h: 0, heapMb: +(h0 / 1048576).toFixed(1) });
  console.log(`boot: heap ${(h0 / 1048576).toFixed(1)} MB, ${runner.ctxs.size} contexts, ${names.length} top-level names`);
  const snapDir = path.join(tmp, 'snap');
  for (let h = 1; h <= HOURS; h++) {
    for (let m = 0; m < 60; m++) {
      if (clock.now() - lastOrder > (SCEN === 'stuck' ? 7 : 30) * 60000) { lastOrder = clock.now(); world.partyChat('Tank1', ORDERS[oi++ % ORDERS.length]); }
      await run(clock, world, 60000, 2000);
    }
    const hb = await heap();
    const cur = Object.fromEntries(watch.map(n => [n, sizes(n)]));
    const grow = [];
    for (const n of watch) for (const k of Object.keys(cur[n])) { const d = cur[n][k] - ((prevSizes[n] || {})[k] || 0); if (d > 50) grow.push([n + '.' + k, d, cur[n][k]]); }
    grow.sort((a, b) => b[1] - a[1]);
    const rep = runner.report();
    const timers = rep.contexts.map(c => c.timers).reduce((a, b) => a + (b || 0), 0);
    rows.push({ h, heapMb: +(hb / 1048576).toFixed(1), timers, errors: rep.st.errors, top: grow.slice(0, 12) });
    console.log(`hour ${h}: heap ${(hb / 1048576).toFixed(1)} MB (+${((hb - h0) / 1048576).toFixed(1)} since boot), timers ${timers}, errors ${rep.st.errors}, wall ${Math.round((Date.now() - t0) / 1000)} s`);
    if (EXPLORE && grow.length) console.log('   growing: ' + grow.slice(0, 15).map(([k, d, v]) => `${k} +${d} (${v})`).join(' | '));
    if (h === 2) { baseSizes = cur; baseHeap = hb; }
    if (h >= 2) for (const n of watch) for (const k of Object.keys(cur[n])) { const d = cur[n][k] - ((prevSizes[n] || {})[k] || 0); (HGROW[n + '.' + k] = HGROW[n + '.' + k] || []).push(d); }
    if (process.argv.includes('--snap') && (h === 2 || h === HOURS)) { fs.mkdirSync(snapDir, { recursive: true }); console.log('   snapshot ' + v8.writeHeapSnapshot(path.join(snapDir, `h${h}.heapsnapshot`))); }
    prevSizes = cur;
  }
  // the live probe on these 9 real contexts: one context per event-loop turn, each well below the pool's 8 s stall limit
  const pr = HP.startProbe({ party: 'Tank1', root: overlay, runner, every: 3600000, busy: () => false }); const prec = await pr.probeNow({}); pr.stop();
  const maxMs = Math.max(...prec.contexts.map(c => c.ms || 0));
  ok(prec.contexts.length === NAMES && maxMs < 3000, `heap probe on ${prec.contexts.length} live contexts: slowest context ${maxMs} ms (stall limit 8000), top of ${prec.contexts[0].name}: ${prec.contexts[0].top.slice(0, 4).map(([k, v]) => k + ' ' + v).join(', ')}`);
  const last = rows[rows.length - 1], perHour = (last.heapMb - baseHeap / 1048576) / (HOURS - 2);
  // a LEAK grows in every hour (myWalk before the fix: +3000 / +2000 / +4400 entries per hour); a lazy cache (town graphs, dungeon rooms) jumps once
  const grew = Object.keys(HGROW).filter(k => HGROW[k].length >= 2 && HGROW[k].every(d => d > 300)).map(k => `${k} +${HGROW[k].join(' / +')} per hour`);
  // V8 compiles code paths the first time they run (bytecode: +4.8 of the +6.8 MB between the hour-2 and hour-5 snapshots of the 9-character
  // stuck run, heap_diff.js 'code:'); that is growth bounded by the script size, not a leak. The leak signal is the container check below.
  const bound = 0.45 * NAMES + 1.0;
  console.log(`\nheap growth from hour 2 to hour ${HOURS}: ${perHour.toFixed(2)} MB per simulated hour (${NAMES} contexts)`);
  if (SCEN === 'hunt') ok((world.kills || 0) >= 5 * HOURS, `the party really hunted: ${world.kills || 0} kills, every one a new objId`);
  // a 1-hour window (the short default run) is dominated by lazy loads (danger grid, town graphs appear in hour 3): the heap number is a
  // verdict only in --long; the container check below is the leak signal in both
  if (LONG) ok(perHour < bound, `worker heap growth after GC ${perHour.toFixed(2)} MB per simulated hour from hour 2 on (bound ${bound.toFixed(1)})`);
  ok(grew.length === 0, `no top-level container of swarm.js grows by > 300 entries in every hour from hour 1 on: ${grew.slice(0, 10).join('; ') || 'none'}`);
  ok(last.timers < 200, `timers stay bounded (${last.timers})`);
  RESULTS.push({ scenario: SCEN, kills: world.kills || 0, perHourMbFromHour2: +perHour.toFixed(2), rows, grew });
  fs.writeFileSync(path.join(ROOT, 'docs', 'plan', 'new_engine', 'sim_leak_last_run.json'), JSON.stringify({ at: new Date().toISOString(), script: path.relative(ROOT, SCRIPT), results: RESULTS, hours: HOURS, names: NAMES, perHourMbFromHour2: +perHour.toFixed(2), rows, grew }, null, 1));
  await runner.stop('end');
  for (const s of world.sockets) try { s.destroy(); } catch (e) { }
  for (const c of world.chars.values()) c.T.dispose();
  world.timers.dispose();
}

(async () => {
  await staticChecks();
  const scen = arg('--scenario', LONG ? 'both' : 'hunt');
  if (!STATIC_ONLY) for (const s of (scen === 'both' ? ['stuck', 'hunt'] : [scen])) await dynamic(s);
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('ERR', e && e.stack || e); process.exit(1); });
