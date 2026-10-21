// BRAIN HOST — one PARTY in a worker thread (2026-10-12, new engine phase 2; docs/plan/new_engine/DESIGN.md §10).
// The main thread (pool.js) owns the TCP sockets of the agents and forwards their bytes here; this worker runs a headless Runner (runner.js
// with port null) whose contexts read those bytes through pseudo sockets, exactly as the single-process runner reads real ones. So every
// context of one party lives in one isolate: in-party App events stay local (the worker's own AppBus), everything else goes through main.
// Messages main -> worker: open {cid} · data {cid, chunk} · close {cid} · appin {env, only} · brain {accounts} · eval {id, name, code} (tests)
//                          · stats {id} · stop
// Messages worker -> main: hb · write {cid, data} · end {cid} · app {env, target, from} · acc {accountId, name, ids?} · gone {accountId, name, ids}
//                          · names {list} · geo {p, text}
//                          · log {line} · stats {id, ...} · evalres {id, ok, v}
// Watchdog marker: a SharedArrayBuffer (workerData.sab) Int32Array [ctxIndex+1 while inside a guarded callback, depth] + Float64Array [entered ms];
// main reads it when the heartbeat stalls to name the context that blocked the worker.
// LAST CONTEXT (engine audit #37, 2026-10-12): code after an await runs in the microtask checkpoint AFTER the guarded callback returned (marker
// already 0), which is most of swarm.js. With a 32-byte buffer the marker also keeps [2] = index+1 of the context whose callback ran last, set when
// the outermost callback leaves and cleared in the next setImmediate: a stall inside that callback's promise continuations never lets the
// setImmediate run, so main can still name the context. Socket data from the agents (results, events: they resolve the contexts' promises) is
// marked with the context of that connection too. Layout: Int32 [cur, depth, last, 0] + Float64 [entered ms, last left ms].
'use strict';
const { parentPort, workerData } = require('worker_threads');
const { EventEmitter } = require('events');
const vm = require('vm'), v8 = require('v8'), { performance, monitorEventLoopDelay } = require('perf_hooks');
// ENGINELAT-2026-10-13: event-loop delay of this party's thread (every timer / event / order of its contexts waits this long), per stats window
const eld = (() => { try { const h = monitorEventLoopDelay({ resolution: 10 }); h.enable(); return h; } catch (e) { return null; } })();
const eldMs = () => { if (!eld) return null; const r = { p50: +(eld.percentile(50) / 1e6).toFixed(1), p99: +(eld.percentile(99) / 1e6).toFixed(1), max: +(eld.max / 1e6).toFixed(1) }; eld.reset(); return r; };
const { Runner } = require('./runner');

const W = workerData || {};
const post = (m) => { try { parentPort.postMessage(m); } catch (e) { } };
const WIDE = !!(W.sab && W.sab.byteLength >= 32);
const mark = W.sab ? new Int32Array(W.sab, 0, WIDE ? 4 : 2) : null, markT = W.sab ? new Float64Array(W.sab, WIDE ? 16 : 8, WIDE ? 2 : 1) : null;
let lastClearQueued = false;
const clearLast = () => { lastClearQueued = false; if (WIDE && Atomics.load(mark, 1) === 0) Atomics.store(mark, 2, 0); };
const names = [], nameIdx = new Map();
const stack = [];
function invokeMark(name, entering) {
  if (!mark) return;
  if (entering) {
    let i = nameIdx.get(name); if (i === undefined) { i = names.length; names.push(name); nameIdx.set(name, i); post({ k: 'names', list: names.slice() }); }
    stack.push(Atomics.load(mark, 0)); Atomics.store(mark, 0, i + 1); Atomics.store(mark, 1, stack.length); markT[0] = Date.now();
  } else {
    const was = Atomics.load(mark, 0);
    Atomics.store(mark, 0, stack.length ? stack.pop() : 0); Atomics.store(mark, 1, stack.length);
    if (WIDE && stack.length === 0 && was) { Atomics.store(mark, 2, was); markT[1] = Date.now(); if (!lastClearQueued) { lastClearQueued = true; setImmediate(clearLast); } }
    if (WIDE && stack.length === 0) Atomics.add(mark, 3, 1);   // SMOOTH-2026-10-20 progress counter: a callback finished (main's watchdog: busy != stuck)
  }
}
// SMOOTH-2026-10-20 (Archon Suscepter wipe 22:24: the watchdog killed party Tank2 10 s into the pull and quarantined its leader for 30 min,
// although no callback had run longer than ~200 ms): main used to post every TCP chunk and every App event as its own message, and the port
// handed this thread hundreds of them in one go, so the heartbeat timer (and the 1 s brain pings to the agents) could not run for seconds.
// Now main sends ONE 'batch' per tick; the items go into an ordered queue that is worked off in slices of SLICE_MS, and the rest continues
// in a setImmediate, so timers get their turn between slices. 'stats' / 'eval' are answered at once (order does not matter for them).
const SLICE_MS = W.sliceMs || 25;
const inq = []; let inqHead = 0, inqScheduled = false;
function inqRun() {
  inqScheduled = false;
  const t0 = performance.now();
  while (inqHead < inq.length) {
    const m = inq[inqHead]; inq[inqHead++] = undefined;
    try { handleMsg(m); } catch (e) { try { runner.log('worker message ' + (m && m.k) + ': ' + (e && e.message)); } catch (e2) { } }
    if (WIDE) Atomics.add(mark, 3, 1);
    if (performance.now() - t0 >= SLICE_MS) break;
  }
  if (inqHead >= inq.length) { inq.length = 0; inqHead = 0; }
  else if (inqHead > 4096) { inq.splice(0, inqHead); inqHead = 0; }
  if (inqHead < inq.length && !inqScheduled) { inqScheduled = true; setImmediate(inqRun); }
}
function inqPush(m) {
  if (m.k === 'stats' || m.k === 'eval') { handleMsg(m); return; }
  inq.push(m);
  if (!inqScheduled) { inqScheduled = true; setImmediate(inqRun); }
}

let brain = new Set();
const DIRECT = Array.isArray(W.directNames) && W.directNames.length ? new Set(W.directNames) : null, peers = new Map(); let slots = {}, directSent = 0, directGot = 0;   // FARMPERF-2026-10-20
const opts = Object.assign({}, W.runner || {}, {
  port: null, invokeMark,
  partyOf: W.partyMap ? ((n) => W.partyMap[n] || n) : undefined,   // FARMPERF-2026-10-20: several parties in one worker (pool "workers")
  logFile: W.runner && W.runner.logFile,
  brainAccounts: (acc) => brain.has(acc),
  extraBrainAccounts: () => Array.from(brain),
  onAppOut: (env, target, from) => {               // FARMPERF-2026-10-20: loss-tolerant names to a worker we have a port to: direct
    if (target && DIRECT && DIRECT.has(env.name)) { const key = slots[String(target)], p = key && peers.get(key); if (p) { try { p.postMessage({ k: 'appin', env, only: String(target) }); directSent++; return; } catch (e) { peers.delete(key); } } }
    post({ k: 'app', env, target, from });
  },
  onContext: (C) => post({ k: 'acc', accountId: C.accountId, name: C.name }),
  // BRAIN ACCOUNTS FOLLOW THE AGENT (engine audit #21/#22/#31, 2026-10-12): a context whose agent connects (again, maybe with a new runtime
  // account id) -> 'acc' with every id it answers to; its agent gone > linkGraceMs or the context disposed -> 'gone' (main drops the ids from
  // pool.accounts and sends every worker the new brain list)
  onLink: (C, on) => post(on ? { k: 'acc', accountId: C.accountId, name: C.name, ids: runner.accountIds(C) } : { k: 'gone', accountId: C.accountId, name: C.name, ids: runner.accountIds(C) }),
  onGone: (C) => post({ k: 'gone', accountId: C.accountId, name: C.name, ids: runner.accountIds(C) }),
});
if (opts.clockVirtual) { const { Clock } = require('./clock'); opts.clock = new Clock({ virtual: true, start: opts.clockStart || Date.now() }); }
const runner = new Runner(opts);
// geopath requests go to the ONE geopath worker of the main thread (pool.js), not one per party
if (W.geoToMain) { const vfsOnWrite = (p, t) => { if (/[\\/]Logs[\\/]geopath[\\/]req_.+\.json$/i.test(String(p))) post({ k: 'geo', p: String(p), text: String(t) }); }; runner.vfs = require('./vfs').createVfs({ root: runner.o.root, overlay: runner.o.overlay, isolate: runner.o.isolate, onWrite: vfsOnWrite }); }
const origLog = runner.log.bind(runner);
runner.log = (m) => { origLog(`[${W.party}] ${m}`); };

class PSock extends EventEmitter {
  constructor(cid) { super(); this.cid = cid; this.destroyed = false; }
  setNoDelay() { } setEncoding() { }
  write(d) { if (this.destroyed) return false; post({ k: 'write', cid: this.cid, data: String(d) }); return true; }
  destroy() { if (this.destroyed) return; this.destroyed = true; post({ k: 'end', cid: this.cid }); this.emit('close'); }
}
const conns = new Map();

parentPort.on('message', (m) => {
  if (!m) return;
  if (m.k === 'batch') { const it = m.items || []; for (let i = 0; i < it.length; i++) inqPush(it[i]); return; }
  inqPush(m);
});
function handleMsg(m) {
  switch (m.k) {
    case 'open': { const s = new PSock(m.cid); conns.set(m.cid, s); runner.handle(s); break; }
    case 'data': {
      const s = conns.get(m.cid); if (!s || s.destroyed) break;
      // the context of this connection (set by the runner after the hello; the hello chunk itself creates the context = swarm.js's top-level run)
      let nm = s.ctxName; if (!nm && !s.helloSeen) { s.helloSeen = true; try { nm = String(JSON.parse(String(m.chunk).split('\n')[0]).name || ''); } catch (e) { nm = ''; } }
      if (nm) invokeMark(nm, true);
      try { s.emit('data', m.chunk); } finally { if (nm) invokeMark(nm, false); }
      break;
    }
    case 'close': { const s = conns.get(m.cid); if (s) { conns.delete(m.cid); if (!s.destroyed) { s.destroyed = true; s.emit('close'); } } break; }
    case 'appin': {                                // through runner.injectFor: a context right after its (re)attach gets it after its first state report (audit #24)
      const env = m.env; if (!env) break;
      if (m.only) { const C = runner.ctxByAccount(m.only); if (C) runner.injectFor(C, env); else runner.bus.inject(env, m.only); }
      else for (const C of Array.from(runner.ctxs.values())) if (C.accountId !== (env.source && env.source.accountId)) runner.injectFor(C, env);
      break;
    }
    case 'brain': brain = new Set(m.accounts || []); if (m.slots) slots = m.slots; if (runner.o.bridge) runner.bridgeHello(); break;
    case 'peer': { const old = peers.get(m.key); if (old) { try { old.close(); } catch (e) { } } const p = m.port; peers.set(m.key, p); p.on('message', (x) => { if (x && x.k === 'appin') { directGot++; inqPush(x); } }); break; }   // FARMPERF direct ports
    case 'peerdown': { const p = peers.get(m.key); if (p) { try { p.close(); } catch (e) { } peers.delete(m.key); } break; }
    case 'eval': {                                 // tests only (pool option allowEval): run code inside one context
      if (!W.allowEval) { post({ k: 'evalres', id: m.id, ok: false, v: 'eval not allowed' }); break; }
      const C = runner.ctxs.get(m.name);
      try { const v = C ? vm.runInContext(String(m.code), C.ctx) : undefined; Promise.resolve(v).then(x => post({ k: 'evalres', id: m.id, ok: true, v: safe(x) }), e => post({ k: 'evalres', id: m.id, ok: false, v: String(e && e.message || e) })); }
      catch (e) { post({ k: 'evalres', id: m.id, ok: false, v: String(e && e.message || e) }); }
      break;
    }
    case 'stats': {
      const r = runner.report(), h = v8.getHeapStatistics(), elu = performance.eventLoopUtilization(lastElu); lastElu = performance.eventLoopUtilization();
      post({ k: 'stats', id: m.id, party: W.party, heapUsed: h.used_heap_size, heapTotal: h.total_heap_size, elu: elu.utilization, lag: eldMs(), hot: r.st.hot || 0, st: r.st, bus: r.bus, vfsMb: +((runner.vfs.st.bytesCached || 0) / 1048576).toFixed(1), direct: { sent: directSent, got: directGot, peers: peers.size }, shared: { files: runner.shared ? runner.shared.size : 0, hits: r.st.sharedHits || 0, parses: r.st.sharedParses || 0 },   /* PERF-2026-10-15 */
        contexts: r.contexts.map(c => ({ name: c.name, booted: c.booted, connected: c.connected, timers: c.timers, title: c.title })), missing: Array.from(r.missing.entries()), errors: Array.from(r.errors.entries()) });
      break;
    }
    case 'agentcfg': if (m.agentPush !== undefined) runner.setAgentPush(m.agentPush); if (m.partyHot !== undefined) runner.o.partyHot = m.partyHot; if (m.agentSlim !== undefined) runner.setAgentSlim(m.agentSlim); break;   // ENGINELAT live switches (+ SLIM-2026-10-20)
    case 'stop': runner.stop('pool stop').then(() => post({ k: 'stopped' })); break;
    case 'drop': {                                 // live allow list (audit #26/#35): this character leaves the brain; its agent is still connected,
      const C = runner.ctxs.get(m.name);           // so OnBeforeScriptStop's L2Swarm writes (combat skills back on) reach it before main says 'bye'
      if (C) { try { runner.dispose(C, m.why || 'removed from the allow list'); } catch (e) { } }
      post({ k: 'dropped', name: m.name, ok: !!C, why: C ? '' : 'no context' });
      break;
    }
  }
}
let lastElu = performance.eventLoopUtilization();
function safe(x) { try { return JSON.parse(JSON.stringify(x, (k, v) => typeof v === 'bigint' ? Number(v) : v)); } catch (e) { return String(x); } }
// LEAK-2026-10-15 heap probe (opt-in): Logs/brain_heap_probe.flag -> one JSON line per worker in Logs/brain_heap_probe.log (heap + the biggest
// top-level containers of each context); { "snapshot": true } also writes Logs/heap_<party>_<time>.heapsnapshot (only with a pool that pauses
// its watchdog for it: workerData.busyOk). Sim / overlay runs read the flag from the overlay, never the live Logs.
try {
  require('./heapprobe').startProbe({ party: W.party, root: runner.o.overlay || runner.o.root, runner, log: (m) => runner.log(m),
    busy: (ms) => { if (!W.busyOk) return false; post({ k: 'busy', ms }); return true; } });
} catch (e) { try { runner.log('heap probe not started: ' + (e && e.message)); } catch (e2) { } }
// heartbeat: only sent when the event loop is free, so a context stuck in synchronous code stops it (main's watchdog then terminates us)
setInterval(() => post({ k: 'hb', t: Date.now() }), W.hbMs || 250);
// a script that does not compile (engine audit #33, 2026-10-12): Runner.start() threw synchronously -> uncaught -> exit 1 -> the pool restarted
// the worker after 200 ms, which compiled the same broken file again, forever. Now: report 'fatal' and stay idle; the pool decides (backoff).
try { runner.start().then(() => post({ k: 'ready', hash: runner.srcHash || '' }), (e) => post({ k: 'fatal', why: String(e && e.stack || e).slice(0, 2000) })); }
catch (e) { post({ k: 'fatal', why: String(e && e.stack || e).slice(0, 2000) }); }
