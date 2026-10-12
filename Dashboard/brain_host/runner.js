// BRAIN HOST RUNNER (2026-10-12, new engine phase 1; docs/plan/new_engine/DESIGN.md): runs the UNCHANGED swarm.js for many characters
// inside ONE Node process — one vm context per character, each wired to that character's Scripts/agent2.js over TCP.
//   - swarm.js is compiled ONCE (vm.Script) and run in every context (bytecode shared).
//   - a context is created on the agent's first hello (character allowed by opts.allow), kept across agent reconnects (IsConnected=false
//     meanwhile, like L2Swarm keeps a script running through a disconnect) and disposed after opts.disposeAfterMs without its agent.
//   - a brain restart = every context starts fresh when the agents reconnect (= a script reload; swarm.js resumes from its Logs files).
// NOT started by anything live. CLI (manual pilot later): node Dashboard/brain_host/runner.js --port 8094 --allow Spoiler6,Healer6
//   [--shared-parse] [--geopath] [--allow-process] [--verbose]
// PHASE 2 additions (2026-10-12), every one OFF by default so a phase-1 pilot started with the old command line behaves exactly as before:
//   --bridge           mixed operation: App events between these contexts and swarm.js engines still running inside L2Swarm (protocol v3:
//                      'bridge' / 'appemit' to the agent, 'ap' from it; agents of v2 are never sent anything new). DESIGN.md §11.
//   --cb-timeout <ms>  per-callback vm timeout (timers, events, App callbacks): a runaway synchronous callback is interrupted and logged,
//                      the context lives on (like L2Swarm's ExecutionWatchdog). Costs ~0.7 ms per callback (Node starts a watchdog thread
//                      for every guarded call), so it is meant for debugging; the always-on guard is the worker pool's heartbeat (pool.js).
//   opts.bus / opts.port=null / opts.invokeMark / opts.onAppOut / opts.brainAccounts: used by the worker pool (pool.js + worker.js).
'use strict';
const net = require('net'), fs = require('fs'), path = require('path'), vm = require('vm');
const { Clock, makeDate } = require('./clock');
const { createVfs } = require('./vfs');
const { AppBus } = require('./appbus');
const { Mirror } = require('./mirror');
const { createHost } = require('./host');
const { AgentLink, NullLink } = require('./link');
const { GeoBridge } = require('./geobridge');

const ROOT = path.resolve(__dirname, '..', '..');

class Runner {
  /**
   * opts: port (8094), host ('127.0.0.1'), script (Scripts_dev/swarm.js), root (C:\L2Swarm as swarm.js sees it), overlay (dir|null),
   *   isolate (['Logs'] with an overlay), allow (array of names | null = everybody), clock (Clock), sharedParse (false), bigint (true),
   *   disposeAfterMs (600000), logFile, verbose, version, onContext(ctx), patch (fn(src) -> src: optional source patch, see DESIGN §6),
   *   geopath (false: answer Logs/geopath requests in a worker thread instead of the dashboard's geopath_service.js),
   *   allowProcess (false: swarm.js's Process.Start, e.g. close_board.ps1, is refused and logged)
   */
  constructor(opts) {
    this.o = Object.assign({ port: 8094, host: '127.0.0.1', script: path.join(ROOT, 'Scripts_dev', 'swarm.js'), root: ROOT, overlay: null, isolate: [],
      allow: null, sharedParse: false, bigint: true, geopath: false, disposeAfterMs: 600000, bridge: false, bridgeNames: null, cbTimeoutMs: 0, invokeMark: null, brainAccounts: null, onAppOut: null, logFile: path.join(ROOT, 'Logs', 'brain_host.log'), verbose: false, version: '3.8.14-brain' }, opts || {});
    this.clock = this.o.clock || new Clock({ virtual: false });
    this.vfs = createVfs({ root: this.o.root, overlay: this.o.overlay, isolate: this.o.isolate, onWrite: (p, t) => { if (this.geo) this.geo.onWrite(p, t); } });
    // geopath: true = answer swarm.js's route requests in-process (worker thread); false = the dashboard's geopath_service.js does it (live today)
    this.geo = this.o.geopath ? new GeoBridge({ vfs: this.vfs, log: (m) => this.log(m) }) : null;
    this.bus = this.o.bus || new AppBus({ log: (m) => this.log(m) });
    this.bus.onOut = (env, target, from) => this.busOut(env, target, from);
    this.ctxs = new Map();            // name -> CharCtx
    this.st = { contexts: 0, created: 0, disposed: 0, hellos: 0, disconnects: 0, events: 0, stateMsgs: 0, stateBytes: 0, errors: 0, unhandled: 0, compileMs: 0, bootErrors: 0,
      bridgeOut: 0, bridgeIn: 0, bridgeLoopDrops: 0, bridgeNoAgent: 0, cbTimeouts: 0 };
    this.errorsByWhere = new Map();
    this.shared = new Map();          // sharedParse: text -> { obj, hash, file }
    this.server = null;
  }
  log(m) { const line = `${new Date(this.clock.now()).toISOString()} ${m}`; if (this.o.verbose) console.log(line); try { if (this.o.logFile) fs.appendFileSync(this.o.logFile, line + '\r\n'); } catch (e) { } }
  noteError(where, e) {
    this.st.errors++;
    const k = `${where}: ${String(e && e.message || e).split('\n')[0].slice(0, 160)}`;
    this.errorsByWhere.set(k, (this.errorsByWhere.get(k) || 0) + 1);
    if (this.errorsByWhere.get(k) <= 2) this.log(`ERROR ${k}${e && e.stack ? '\n   ' + String(e.stack).split('\n').slice(1, 4).join('\n   ') : ''}`);
  }
  compile() {
    if (this.script) return this.script;
    const t0 = Date.now();
    // ONE SOURCE (engine audit #23/#33, 2026-10-12): the worker pool reads + syntax-checks swarm.js ONCE in its main thread and hands every
    // worker the same text (opts.source), so a watchdog / crash restart never compiles whatever the file holds at that moment
    let src = typeof this.o.source === 'string' ? this.o.source : fs.readFileSync(this.o.script, 'utf8');
    if (typeof this.o.patch === 'function') src = this.o.patch(src);
    this.src = src;
    this.srcHash = require('crypto').createHash('sha1').update(src).digest('hex').slice(0, 12);
    this.script = new vm.Script(src, { filename: path.basename(this.o.script) });
    if (!this.o.bridgeNames) this.o.bridgeNames = appEventNames(src);
    this.st.compileMs = Date.now() - t0;
    return this.script;
  }
  sharedParseFn() {
    const runner = this;
    return function (t) {
      let e = runner.shared.get(t);
      if (!e) { e = { obj: JSON.parse(t), len: t.length, hits: 0 }; e.hash = quickHash(e.obj); runner.shared.set(t, e); }
      e.hits++;
      return e.obj;
    };
  }
  /** create (or return) the context of one character */
  context(name, accountId) {
    let C = this.ctxs.get(name);
    if (C) return C;
    const runner = this, mirror = new Mirror(name); mirror.now = () => this.clock.now();
    let link = new NullLink();
    const linkRef = { connected: () => link.connected(), call: (f, a, w, fns) => link.call(f, a, w, fns), set: (p, v) => link.set(p, v), watch: (k, key) => link.watch(k, key) };
    const invoke = this.makeInvoke(name, () => C && C.ctx);
    const timers = this.clock.forOwner(name, (e) => this.noteError(`${name} timer`, e), invoke);
    const host = createHost({ name, accountId: accountId || `brain:${name}`, mirror, link: linkRef, timers, clock: this.clock, Date: makeDate(this.clock), vfs: this.vfs, bus: this.bus,
      root: this.o.root, version: this.o.version, bigint: this.o.bigint, allowProcess: !!this.o.allowProcess, invoke, log: (m) => this.log(m), onError: (w, e) => this.noteError(`${name} ${w}`, e), verbose: this.o.verbose });
    C = { name, accountId: accountId || `brain:${name}`, mirror, host, timers, linkRef, get link() { return link; }, set link(l) { link = l; }, ctx: null, startedAt: this.clock.now(), lostAt: 0, booted: false };
    const ctx = vm.createContext(host.global, { name: `swarm:${name}` });
    C.ctx = ctx;
    host.setRealm({ Promise: vm.runInContext('Promise', ctx), JSON: vm.runInContext('JSON', ctx) });
    if (this.o.sharedParse) {
      vm.runInContext(`(function (sp) { const P = JSON.parse; JSON.parse = function (t, r) { if (typeof t === 'string' && t.length >= 100000 && r === undefined) return sp(t); return P.call(JSON, t, r); }; })`, ctx)(this.sharedParseFn());
    }
    this.bus.join({ accountId: C.accountId, name, scriptId: `brain-${name}`, scriptName: 'swarm.js', connected: () => link.connected() && !!mirror.fl.IsConnected,
      parse: vm.runInContext('JSON.parse', ctx), invoke });
    this.ctxs.set(name, C); this.st.created++; this.st.contexts = this.ctxs.size;
    // run swarm.js
    const t0 = Date.now();
    try { this.compile().runInContext(ctx, { displayErrors: true }); C.booted = true; }
    catch (e) { this.st.bootErrors++; this.noteError(`${name} top-level`, e); }
    C.bootMs = Date.now() - t0;
    this.log(`context ${name} created (${C.bootMs} ms top-level run${C.booted ? '' : ', FAILED'})`);
    if (this.o.onContext) try { this.o.onContext(C); } catch (e) { }
    return C;
  }
  attach(C, sock, hello) {
    const old = C.link;
    const L = new AgentLink(sock, { log: (m) => this.log(`${C.name}: ${m}`) });
    L.rewatch(old);
    if (old && old.connected()) old.close();
    C.link = L; C.lostAt = 0; C.hello = hello;
    // TIMING (audit #10/#11/#27): the agent's capabilities. 'assume' (agent2 with fast edges) = it corrects whatever host.js HOOK_PRE assumes on
    // my own OnMagicSkillUse / OnTargetSelected (it re-sends IsCasting / that skill's readiness / Target after those events), so the brain may
    // pre-update the mirror at the event. An older agent (no 'assume') never corrects them -> host.js assumes nothing.
    C.mirror.agentCaps = Array.isArray(hello.caps) ? hello.caps.map(String) : [];
    if (hello.accountId && String(hello.accountId) !== C.accountId) this.rekey(C, String(hello.accountId));
    C.attachedAt = this.clock.now(); C.awaitSt = true;   // App events for this context wait for its first state report (injectFor)
    try { C.host.onAttach(); } catch (e) { this.noteError(`${C.name} onAttach`, e); }
    L.write({ a: 'resync' });
    this.linkState(C, true);                         // a brain account (again): the pool / every worker's brain list
    if (this.o.bridge) this.bridgeHello();
    return L;
  }
  // ACCOUNT ID CHANGES (engine audit #21/#30/#36, 2026-10-12): L2Swarm account ids are runtime ids; after an L2Swarm restart or an account
  // close/open the agent says hello with a NEW id while its context (kept up to disposeAfterMs) still had the old one. Before, attach() only
  // logged it: App.self(), the bus member, the pool's account map and every agent's bridge.brain list kept the old id, so the context's own
  // broadcasts (re-emitted inside L2Swarm with the NEW id as source) came back to every other brain context a second time, and payloads with
  // App.self().accountId named an id that L2Swarm no longer knows. Now the context is re-keyed: bus member + App.self() move to the new id,
  // the old id stays an alias (an emitTo(oldId) still arrives), the pool and the agents are told at once (linkState / bridgeHello).
  rekey(C, nid) {
    const old = C.accountId, other = this.ctxByAccount(nid);
    if (other && other !== C) { this.log(`${C.name}: agent account id ${nid} is already used by context ${other.name} -> context keeps ${old}`); return false; }
    if (typeof this.bus.rekey === 'function') this.bus.rekey(old, nid);
    C.accountId = nid; C.brainOn = undefined;        // linkState announces the new id set
    this.st.rekeys = (this.st.rekeys || 0) + 1;
    this.log(`${C.name}: agent account id changed ${old} -> ${nid} (L2Swarm restart / account reopen): context re-keyed, old id kept as an alias`);
    return true;
  }
  /** every account id a context answers to: the current one first, then its old ids (aliases) */
  accountIds(C) {
    if (C.disposed && C.goneIds) return C.goneIds.slice();
    return [C.accountId].concat(typeof this.bus.aliasesOf === 'function' ? this.bus.aliasesOf(C.accountId) : []);
  }
  // an App event for one context. Right after an attach the context's mirror may not have its first state report yet (IsConnected false ->
  // the bus would drop it): a worker restart replays buffered agent bytes and queued cross-party events BEFORE the agent answers 'resync'
  // (engine audit #24). Such events wait for that first report (max heldMs, then delivered / dropped by the normal rules).
  injectFor(C, env) {
    if (!C || C.disposed) return 0;
    if (C.awaitSt && this.clock.now() - (C.attachedAt || 0) < (this.o.heldMs || 3000)) { (C.held || (C.held = [])).push(env); if (C.held.length > 500) C.held.shift(); return 0; }
    return this.bus.inject(env, C.accountId);
  }
  flushHeld(C) { const h = C.held || []; C.held = []; C.awaitSt = false; for (const env of h) { try { this.bus.inject(env, C.accountId); } catch (e) { this.noteError(`${C.name} held App event`, e); } } }
  dispose(C, why) {
    if (!C || C.disposed) return;
    C.disposed = true;
    // ORPHAN DISPOSE (engine audit #40, 2026-10-12): without a connected agent every Options write of OnBeforeScriptStop (swarm.js
    // l2sSkillGuard(true) switching L2Swarm's CombatSkillsList back on) is dropped by the NullLink, while the script still clears its
    // persistence record (Logs/castloop_l2s_off_<name>.json). So an orphaned context is disposed like a kill: no OnBeforeScriptStop, the
    // record stays for the next context to undo.
    const linkUp = (() => { try { return !!(C.link && C.link.connected()); } catch (e) { return false; } })();
    if (linkUp) { try { const f = C.ctx && C.host.global.OnBeforeScriptStop; if (typeof f === 'function') f(); } catch (e) { } }
    else this.log(`context ${C.name}: OnBeforeScriptStop skipped (no agent connected: its L2Swarm writes could not arrive)`);
    C.goneIds = this.accountIds(C);
    C.timers.dispose(); this.bus.leave(C.accountId);
    try { C.link.close(); } catch (e) { }
    this.ctxs.delete(C.name); this.st.disposed++; this.st.contexts = this.ctxs.size;
    C.ctx = null; C.host.global = null;
    this.log(`context ${C.name} disposed (${why})`);
    // the account is no brain account any more: tell the pool (pool.accounts / every worker's brain list) and the agents (engine audit #22/#31)
    C.brainOn = false;
    if (this.o.onGone) { try { this.o.onGone(C); } catch (e) { this.noteError('onGone', e); } }
    if (this.o.bridge) this.bridgeHello();
  }
  // BRAIN ACCOUNTS FOLLOW THE AGENT (engine audit #22/#31, 2026-10-12): an account counts as a brain account (its App events inside L2Swarm
  // are our own re-emits; an emitTo to it stays inside the brain) only while its agent is connected or was lost less than linkGraceMs (10 s)
  // ago. After that (the character was rolled back to swarm.js inside L2Swarm, DESIGN §13, or a transfer stopped its agent) the pool
  // (onLink -> every worker's brain list) and every v3 agent (bridgeHello) are told, so that character's swarm.js events reach the brain
  // again and emitTo to it goes through the bridge. Before: the account stayed a brain account until the whole pool restarted.
  linkState(C, quiet) {
    const grace = this.o.linkGraceMs === undefined ? 10000 : Number(this.o.linkGraceMs) || 0;
    let up = false; try { up = !!(C.link && C.link.connected()); } catch (e) { }
    const on = !C.disposed && (up || (!!C.lostAt && this.clock.now() - C.lostAt < grace));
    if (on === C.brainOn) return false;
    const was = C.brainOn; C.brainOn = on;
    if (this.o.onLink) { try { this.o.onLink(C, on); } catch (e) { this.noteError('onLink', e); } }
    const talk = !!(this.o.bridge || this.o.onLink);  // only meaningful with the bridge / the pool
    if (!on && talk) this.log(`${C.name}: agent gone > ${Math.round(grace / 1000)} s -> account ${C.accountId} no longer counts as a brain account (bridged like an L2Swarm account until it reconnects)`);
    else if (was === false && talk) this.log(`${C.name}: agent back -> account ${C.accountId} counts as a brain account again`);
    if (this.o.bridge && !quiet) this.bridgeHello();
    return true;
  }
  sweepLinks() { for (const C of Array.from(this.ctxs.values())) this.linkState(C); }
  handle(sock) {
    sock.setNoDelay(true); sock.setEncoding('utf8');
    let buf = '', C = null, L = null;
    sock.on('data', (chunk) => {
      buf += chunk; let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 1); if (!line.trim()) continue;
        let m; try { m = JSON.parse(line); } catch (e) { this.noteError('bad line', e); continue; }
        try { this.onMsg(m, line.length, sock, () => C, (c, l) => { C = c; L = l; sock.ctxName = c && c.name; }, () => L); } catch (e) { this.noteError(`${C ? C.name : '?'} ${m.t}`, e); }
      }
    });
    sock.on('close', () => { if (C && C.link === L && !C.disposed) { C.lostAt = this.clock.now(); C.mirror.fl.IsConnected = false; C.mirror.agentCaps = []; L.close(); C.link = new NullLink(); C.link.rewatch(L); this.st.disconnects++; this.log(`agent ${C.name} disconnected`); this.linkState(C); } });
    sock.on('error', () => { });
  }
  onMsg(m, bytes, sock, getC, setC, getL) {
    if (m.t === 'hello') {
      this.st.hellos++;
      const name = String(m.name || '');
      if (!name || (this.o.allow && !this.o.allow.includes(name))) { this.log(`hello from ${name || '?'} refused (not in allow list)`); sock.write(JSON.stringify({ a: 'bye', why: 'not allowed' }) + '\n'); return; }
      const C = this.context(name, m.accountId);
      const L = this.attach(C, sock, m);
      setC(C, L);
      this.log(`agent ${name} connected (v${m.v}, ${m.version || '?'})`);
      return;
    }
    const C = getC(); if (!C || C.disposed) return;
    switch (m.t) {
      case 'st': this.st.stateMsgs++; this.st.stateBytes += bytes; C.mirror.apply(m, bytes); if (C.awaitSt) this.flushHeld(C); break;
      case 'ev': this.st.events++; C.host.dispatch(String(m.h), Array.isArray(m.a) ? m.a : [], C.ctx); break;
      case 'ae': C.host.appEvent(String(m.name), m.d); break;
      case 'res': getL() && getL().onResult(m); break;
      case 'cb': getL() && getL().onCallback(m); break;
      case 'ap': this.bridgeIn(C, m); break;
      case 'log': this.log(`${C.name} agent: ${String(m.text || '').slice(0, 300)}`); break;
      case 'pong': break;
    }
  }
  start() {
    this.compile();
    this.onUnhandled = (r) => { this.st.unhandled++; this.noteError('unhandled rejection', r); };
    process.on('unhandledRejection', this.onUnhandled);
    this.sweeper = setInterval(() => {
      for (const C of Array.from(this.ctxs.values())) {
        try { C.link.sweep(); } catch (e) { }
        if (C.lostAt && this.clock.now() - C.lostAt > this.o.disposeAfterMs) this.dispose(C, 'agent gone');
        else if (C.awaitSt && this.clock.now() - (C.attachedAt || 0) >= (this.o.heldMs || 3000)) this.flushHeld(C);
      }
      this.sweepLinks();                               // agent gone > linkGraceMs -> no brain account any more (engine audit #22/#31)
    }, this.o.sweepMs || 5000);
    if (this.sweeper.unref) this.sweeper.unref();
    // BRAIN PING (engine audit #25, 2026-10-12): every connected agent gets { a: 'ping' } every pingMs from THIS thread's event loop. A context
    // that blocks the thread (sync loop) stops the pings, and the agent (agent2.js v3+) then drinks its potions itself after ~3 s of silence
    // (before: its socket lives in the pool's main thread and stays open, so the agent never noticed a stuck brain). 0 = off.
    const pingMs = this.o.pingMs === undefined ? 1000 : Number(this.o.pingMs) || 0;
    if (pingMs > 0) {                                  // on the runner's clock: virtual time in the simulator (agents measure silence on it too)
      this.pingSeq = 0; this.pingT = this.clock.forOwner('runner:ping', (e) => this.noteError('ping', e));
      this.pingT.setInterval(() => { for (const C of this.ctxs.values()) { try { if (C.link.connected()) C.link.write({ a: 'ping', id: ++this.pingSeq }); } catch (e) { } } }, pingMs);
    }
    if (this.o.port === null) { this.log(`brain host (headless, pid ${process.pid}) ready`); return Promise.resolve(this); }   // worker pool: the main thread owns the sockets
    return new Promise((res, rej) => {
      this.server = net.createServer((s) => this.handle(s));
      this.server.on('error', rej);
      this.server.listen(this.o.port, this.o.host, () => { this.log(`brain host listening on ${this.o.host}:${this.o.port} (pid ${process.pid}, ${this.o.script})`); res(this); });
    });
  }
  async stop(why) {
    for (const C of Array.from(this.ctxs.values())) this.dispose(C, why || 'stop');
    if (this.sweeper) clearInterval(this.sweeper);
    if (this.pingT) { this.pingT.dispose(); this.pingT = null; }
    if (this.onUnhandled) process.removeListener('unhandledRejection', this.onUnhandled);
    if (this.server) await new Promise(r => this.server.close(() => r()));
    this.server = null;
    if (this.geo) { this.geo.stop(); this.geo = null; }
  }
  /** work outside the contexts still running (geopath requests): the simulator waits for it before moving virtual time on */
  async idle(maxMs) { if (this.geo) await this.geo.idle(maxMs); }
  // ---------------------------------------------------------------- phase 2: guarded callbacks
  /** -> invoke(fn, args) | null. null = plain calls (phase 1). invokeMark(name, entering): the worker watchdog's marker. */
  makeInvoke(name, getCtx) {
    const to = Number(this.o.cbTimeoutMs) || 0, mark = this.o.invokeMark;
    if (!to && !mark) return null;
    const runner = this;
    if (!this.guardScript && to) this.guardScript = new vm.Script('(function () { const b = globalThis.__bh_cb; globalThis.__bh_cb = null; return b.f.apply(null, b.a); })()', { filename: 'brain_host_guard' });
    return function invoke(fn, args) {
      const ctx = getCtx();
      if (mark) mark(name, true);
      try {
        if (!to || !ctx) return fn.apply(null, args || []);
        ctx.__bh_cb = { f: fn, a: args || [] };
        try { return runner.guardScript.runInContext(ctx, { timeout: to }); }
        catch (e) { if (e && e.code === 'ERR_SCRIPT_EXECUTION_TIMEOUT') { runner.st.cbTimeouts++; runner.log(`WATCHDOG ${name}: a callback ran > ${to} ms and was interrupted (${String(fn && fn.name || 'anonymous')})`); } throw e; }
      } finally { if (mark) mark(name, false); }
    };
  }
  // ---------------------------------------------------------------- phase 2: App bridge (mixed operation, protocol v3; DESIGN.md §11)
  // a local context decides by its agent link (linkState: connected or lost < linkGraceMs); other workers' accounts by the pool's list
  isBrainAccount(acc) { acc = String(acc || ''); if (!acc) return false; const C = this.ctxByAccount(acc); if (C) return C.brainOn !== false; const b = this.o.brainAccounts; return !!(b && (typeof b === 'function' ? b(acc) : b.has(acc))); }
  ctxByAccount(acc) { acc = String(acc || ''); if (typeof this.bus.resolve === 'function') acc = this.bus.resolve(acc); for (const C of this.ctxs.values()) if (C.accountId === acc) return C; return null; }
  /** the bus hands out every emit of a context here (after local delivery) */
  busOut(env, target, from) {
    if (this.o.onAppOut) { try { this.o.onAppOut(env, target, from); } catch (e) { this.noteError('onAppOut', e); } }   // worker pool: other workers
    if (!this.o.bridge) return;
    if (target && this.isBrainAccount(target)) return;                // reached through the brain (local bus or the pool)
    const C = this.ctxByAccount(from);
    if (!C || !C.hello || !(Number(C.hello.v) >= 3) || !C.link.connected()) { this.st.bridgeNoAgent++; return; }
    C.link.write(target ? { a: 'appemit', name: env.name, j: env.json, to: target } : { a: 'appemit', name: env.name, j: env.json });
    this.st.bridgeOut++;
  }
  /** an App event that an agent received inside L2Swarm (from a swarm.js engine there) -> that agent's context only */
  bridgeIn(C, m) {
    if (!this.o.bridge || !m || typeof m.name !== 'string') return;
    const src = m.source || {};
    if (this.isBrainAccount(src.accountId)) { this.st.bridgeLoopDrops++; return; }   // our own emit coming back through another agent: already delivered in the brain
    const json = typeof m.j === 'string' ? m.j : JSON.stringify(m.d === undefined ? null : m.d);
    this.st.bridgeIn++;
    this.injectFor(C, { id: String(m.id || ('l2' + this.st.bridgeIn)), name: m.name, sentAtUtc: m.sentAtUtc || new Date(this.clock.now()).toISOString(),
      source: { accountId: String(src.accountId || ''), characterName: String(src.characterName || ''), scriptId: String(src.scriptId || ''), scriptName: String(src.scriptName || 'swarm.js') }, json });
  }
  /** tell every v3 agent the event names to relay and which accounts live in the brain (their own App events must not come back) */
  bridgeHello() {
    // only contexts whose agent is connected (or lost < linkGraceMs), with their old ids; the pool's list minus my own gone contexts (#22/#31)
    const seen = new Set(), brain = [];
    const add = (a) => { a = String(a || ''); if (a && !seen.has(a)) { seen.add(a); brain.push(a); } };
    for (const C of this.ctxs.values()) if (C.brainOn !== false) this.accountIds(C).forEach(add);
    (this.o.extraBrainAccounts ? this.o.extraBrainAccounts() : []).forEach(a => { const C = this.ctxByAccount(a); if (!C || C.brainOn !== false) add(a); });
    for (const C of this.ctxs.values()) if (C.hello && Number(C.hello.v) >= 3 && C.link.connected()) C.link.write({ a: 'bridge', on: true, names: this.o.bridgeNames || [], brain });
  }
  report() {
    const missing = new Map(), calls = new Map();
    for (const C of this.ctxs.values()) {
      C.host.missing.forEach((n, k) => missing.set(k, (missing.get(k) || 0) + n));
      C.host.calls.forEach((n, k) => calls.set(k, (calls.get(k) || 0) + n));
    }
    return { st: this.st, vfs: this.vfs.st, bus: this.bus.st, geo: this.geo ? this.geo.st : null, missing, calls, errors: this.errorsByWhere,
      contexts: Array.from(this.ctxs.values()).map(C => ({ name: C.name, booted: C.booted, bootMs: C.bootMs, connected: C.link.connected(), timers: C.timers.count(), mirror: C.mirror.summary(), title: C.host.title, errors: C.host.errors })) };
  }
}
/** every App event name swarm.js subscribes to or emits (static scan; names built at run time are caught by the 'swarm.' string scan) */
function appEventNames(src) {
  const set = new Set();
  for (const m of src.matchAll(/App\.(?:on|emit)\(\s*(['"`])([A-Za-z0-9._:-]+)\1/g)) set.add(m[2]);
  for (const m of src.matchAll(/App\.emitTo\(\s*[^,()]+,\s*(['"`])([A-Za-z0-9._:-]+)\1/g)) set.add(m[2]);
  for (const m of src.matchAll(/(['"`])(swarm\.[a-z][A-Za-z0-9._:-]*)\1/g)) set.add(m[2]);   // names held in variables / ternaries (emit(ev, data))
  return Array.from(set).filter(n => !/\.(js|json|log|txt)$/i.test(n)).sort();
}
function quickHash(o) { const s = JSON.stringify(o); let h = 0; for (let i = 0; i < s.length; i += 7) h = (h * 31 + s.charCodeAt(i)) | 0; return h + ':' + s.length; }

module.exports = { Runner, quickHash, appEventNames };

if (require.main === module) {
  const a = process.argv.slice(2), opt = (k, d) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; };
  if (!opt('--allow', '')) { console.error('refusing to start without --allow Name1,Name2 (only the pilot characters may run in the brain host)'); process.exit(2); }
  const r = new Runner({ port: Number(opt('--port', 8094)), allow: opt('--allow', '') ? opt('--allow').split(',') : null, sharedParse: a.includes('--shared-parse'), geopath: a.includes('--geopath'), allowProcess: a.includes('--allow-process'), verbose: a.includes('--verbose'),
    bridge: a.includes('--bridge'), cbTimeoutMs: Number(opt('--cb-timeout', 0)) || 0, script: opt('--script', null) ? path.resolve(opt('--script')) : path.join(ROOT, 'Scripts_dev', 'swarm.js') });   // --script: the dashboard passes the DEPLOYED Scripts/swarm.js (audit #23)
  r.start().catch(e => { console.error(e.message); process.exit(2); });
  process.on('SIGINT', () => r.stop('SIGINT').then(() => process.exit(0)));
}
