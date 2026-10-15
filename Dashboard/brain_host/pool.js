// BRAIN HOST WORKER POOL (2026-10-12, new engine phase 2; docs/plan/new_engine/DESIGN.md §10). OPTIONAL: the phase-1 runner.js keeps working
// unchanged; this is the multi-party front end that the pilot does NOT use.
//   main thread = network + routing: accepts the agents (Scripts/agent2.js) on one TCP port, reads only their first line (hello) to learn
//     the character, and hands the connection to the worker of that character's PARTY (swarm.config.json accounts[].party; a character
//     without a party gets a worker of its own). After that main just copies bytes both ways (no JSON parsing on the hot path).
//   one worker thread per party (worker.js: a headless Runner): all characters of a party share one isolate, so their App events stay local
//     and fast; App events to other parties are relayed by main (AppBus onOut / inject), App events to swarm.js engines still inside L2Swarm
//     go through the agents (--bridge, protocol v3).
//   WATCHDOG: each worker posts a heartbeat every 250 ms from its event loop. A context that runs synchronous JS for longer than stallMs
//     (default 8 s; L2Swarm's own ExecutionWatchdog cuts at a similar scale) stops the heartbeat; main then TERMINATES that worker (this
//     interrupts even an endless loop), logs which context was inside a callback (shared marker), and starts a fresh worker for the party.
//     The agents never notice: their sockets live in main; the new worker gets their hello replayed, attaches, asks for a full state
//     ('resync') and swarm.js boots again in each context (= an L2Swarm script reload, resumes from its Logs files). A context that blocks
//     its worker 3 times within 10 minutes is quarantined: its agent is told 'bye' (= reflex-only mode, like a brain outage) and the rest of
//     the party restarts without it. The other parties' workers keep running the whole time.
//   ONE DEPLOYED SOURCE (engine audit #23/#33, 2026-10-12): the pool runs the DEPLOYED Scripts/swarm.js (was Scripts_dev = the editing copy).
//     Main reads it ONCE, syntax-checks it (vm.Script) and hands that text to every worker (workerData runner.source), so a watchdog / crash
//     restart or a newly connecting party never compiles whatever the file holds at that moment: every party runs the same version.
//     A file that does not compile is refused LOUDLY ("SCRIPT ... does NOT compile") and the last good version keeps running.
//     --watch-script [ms]: like L2Swarm's FileSystemWatcher, a changed + stable + compiling file (= a deploy) is reloaded: the workers restart
//     party by party (reloadGapMs apart) on the new text. IPC {k:'reload'} does the same at once.
//   RESTART BACKOFF (audit #33): a worker that exits or reports 'fatal' (worker.js) is restarted after 200 ms the first 2 times within 2 min,
//     then 5 s, 10 s, 20 s ... max 5 min (was: every 200 ms forever).
//   IPC for the dashboard supervisor (audit #32): {k:'health'} (source, workers, quarantined, connections) and {k:'revive', name} (restart the
//     worker of that character's party unless it is quarantined) — the supervisor never starts swarm.js inside L2Swarm for a brain character.
//   RESILIENCE (engine audit #25/#26/#35/#37/#38, 2026-10-12):
//   - WHO STALLED: the marker also keeps the context whose callback ran LAST (worker.js, 32-byte buffer), so a stall in a promise continuation
//     (code after an await: most of swarm.js) is still attributed and counted for the quarantine ("after an await of <name>"). Unattributed
//     stalls / repeated restarts back off (audit #33 backoff) and raise an ALERT (stats file / dashboard).
//   - QUARANTINE IN A FIGHT: when the stalling context's party has a live raid / Kamaloka / epic (Logs/{raid,kamaloka,epic}_live_<party>.json
//     written in the last 30 s) ONE stall quarantines it (its agent gets 'bye' = potion reflex), so it cannot take the party down twice in a
//     fight. A quarantine ends after quarantineMs (30 min): the agent's next hello is accepted again.
//   - LIVE ALLOW LIST (--config Scripts/data/brain_host.json): re-read every 5 s; a character added is accepted at its next hello, a character
//     removed gets its context disposed (OnBeforeScriptStop while its agent is still connected) and 'bye' — the other parties keep running.
//     An unreadable / half-written file changes nothing. (Before: the dashboard restarted the whole pool for every list change.)
//     "allowAll": true (ENGINE DEFAULT 2026-10-13) = every character of the roster (--roster, default <root>/swarm.config.json) + "allow" -
//     "except" (Dashboard/brain_host/supervise.js effectiveAllow); the roster file is watched too (an account added joins at its hello).
//   - STATS FILE (--stats-file Logs/brain_host_stats.json): every 10 s pid, RSS, counters, per-worker heap / ELU / contexts, quarantined,
//     restart history, alerts (the dashboard's /api/brainhost; readable without IPC).
//   - MEMORY GUARD (--max-rss-mb N [--mem-restart]): above N MB an ALERT; with --mem-restart the worker with the biggest heap is restarted,
//     never a party with a live fight (at most once per 10 min), and only when it stands out (heap >= 2x the median of the other workers or
//     >= N/2: a leak). A pool that is big because of its real load only gets the alert (restarting would free nothing). (review 2026-10-12)
// CLI: node Dashboard/brain_host/pool.js --port 8095 --allow A,B,C | --allow-all  [--bridge] [--no-shared-parse (shared parse is ON by default since 2026-10-15)] [--geopath] [--stall-ms 8000]
//      [--cb-timeout ms] [--verbose] [--script Scripts/swarm.js] [--watch-script [5000]] [--config file] [--roster swarm.config.json] [--stats-file file] [--max-rss-mb N] [--mem-restart]
//      (as a child process with IPC: answers {k:'stats'} / {k:'st'} / {k:'health'} / {k:'reload'} / {k:'revive'} / {k:'eval'} (with --test-eval))
'use strict';
const net = require('net'), fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto');
const { Worker } = require('worker_threads');
const { monitorEventLoopDelay } = require('perf_hooks');
const SUP = require('./supervise');
const ROOT = path.resolve(__dirname, '..', '..');

function partyMap(root, file) {
  const m = new Map();
  try {
    const cfg = JSON.parse(fs.readFileSync(file || path.join(root, 'swarm.config.json'), 'utf8').replace(/^﻿/, ''));
    (cfg.accounts || []).forEach(a => { if (a.character) m.set(a.character, a.party || a.character); });
  } catch (e) { }
  return m;
}

class Pool {
  /** opts: port, host, allow (array|null), root, script, overlay, isolate, logFile, stallMs (8000), hbMs (250), partyOf (fn name -> party),
   *  runner (extra Runner options for every worker: sharedParse, bridge, cbTimeoutMs, version, ...), geopath (main-thread geopath worker),
   *  allowEval (tests), quarantineAfter (3), quarantineWindowMs (600000) */
  constructor(opts) {
    this.o = Object.assign({ port: 8095, host: '127.0.0.1', allow: null, root: ROOT, script: path.join(ROOT, 'Scripts', 'swarm.js'), overlay: null, isolate: [],
      logFile: path.join(ROOT, 'Logs', 'brain_host.log'), stallMs: 8000, hbMs: 250, runner: {}, geopath: false, allowEval: false, quarantineAfter: 3, quarantineWindowMs: 600000, verbose: false,
      watchScriptMs: 0, reloadGapMs: 3000, backoffBaseMs: 5000, backoffMaxMs: 300000,
      // RESILIENCE (audit #25/#26/#35/#37/#38): quarantine end, quarantine in a live fight, live allow list, stats file, memory guard
      quarantineMs: 1800000, fightQuarantineAfter: 1, liveFightMs: 30000, liveFight: null, configFile: null, configPollMs: 5000,
      statsFile: null, statsMs: 10000, maxRssMb: 0, memRestart: false, memRestartGapMs: 600000, dropWaitMs: 5000,
      // IDENTITY (audit #24): agent bytes / cross-party App events for a party whose worker is restarting are kept this long / this much
      bufMaxAgeMs: 15000, bufMaxBytes: 4194304, appQueueMax: 2000 }, opts || {});
    this.appQ = new Map();           // party -> [{ env, only, at }] App events for a party without a live worker (restart gap / backoff)
    this.src = null; this.srcHash = ''; this.srcAt = 0; this.srcSeen = null; this.srcPending = null; this.srcBad = null;
    this.fails = new Map();          // party -> [restart times] (backoff)
    this.timers = new Set();
    // ENGINE DEFAULT (2026-10-13): the roster file (swarm.config.json) is re-read when it changes: the party map for NEW connections and
    // the allow list of "allowAll" (pollConfig) follow it live
    this.rosterFile = this.o.rosterFile || path.join(this.o.root, 'swarm.config.json');
    this.pm = this.o.partyOf ? null : partyMap(this.o.root, this.rosterFile);
    this.partyOf = this.o.partyOf || ((n) => (this.pm && this.pm.get(n)) || n);
    this.workers = new Map();        // party -> W { party, w, sab, lastHb, names, ready, restarts, gen }
    this.conns = new Map();          // cid -> { sock, name, party, hello (line), refused }
    this.accounts = new Map();       // accountId -> party
    this.stalls = new Map();         // name -> [times]
    this.quarantined = new Set();
    this.quarUntil = new Map();      // name -> quarantine end (ms)
    this.alerts = [];                // last 50 { at, kind, party, name, text } (stats file / dashboard)
    this.drops = new Map();          // name -> { at, timer } (allow-list removal waiting for the worker's 'dropped')
    this.seq = 0; this.evals = new Map(); this.statsReq = new Map();
    this.st = { conns: 0, bytesIn: 0, bytesOut: 0, appRelayed: 0, workerRestarts: 0, watchdogKills: 0, quarantined: 0, fatal: 0, reloads: 0, badScripts: 0 };
    this.geo = null;
    if (this.o.geopath) {
      const { createVfs } = require('./vfs'); const { GeoBridge } = require('./geobridge');
      this.vfs = createVfs({ root: this.o.root, overlay: this.o.overlay, isolate: this.o.isolate });
      this.geo = new GeoBridge({ vfs: this.vfs, log: (m) => this.log(m) });
    }
  }
  log(m) { const line = `${new Date().toISOString()} [pool] ${m}`; if (this.o.verbose) console.log(line); try { if (this.o.logFile) fs.appendFileSync(this.o.logFile, line + '\r\n'); } catch (e) { } }
  later(fn, ms) { const t = setTimeout(() => { this.timers.delete(t); fn(); }, ms); this.timers.add(t); return t; }
  /** read + syntax-check the script ONCE (audit #23/#33). -> true (new version loaded) | 'same' | false (unreadable / does not compile: the last good one stays) */
  loadSource(why) {
    let src, s;
    try { s = fs.statSync(this.o.script); src = fs.readFileSync(this.o.script, 'utf8'); }
    catch (e) { this.log(`SCRIPT ${this.o.script} unreadable (${why}): ${e.message}${this.src ? ` — keeping the running version ${this.srcHash}` : ' — no brain until it can be read'}`); return false; }
    this.srcSeen = { mtimeMs: s.mtimeMs, size: s.size };
    const hash = crypto.createHash('sha1').update(src).digest('hex').slice(0, 12);
    if (this.src !== null && hash === this.srcHash) return 'same';
    if (this.srcBad && this.srcBad.hash === hash) return false;                    // reported already
    try { new vm.Script(src, { filename: path.basename(this.o.script) }); }
    catch (e) {
      this.st.badScripts++; this.srcBad = { hash, at: Date.now(), why: String(e && e.message || e).split('\n')[0].slice(0, 300) };
      this.log(`SCRIPT ${this.o.script} does NOT compile (${why}): ${this.srcBad.why}${e && e.stack ? ' | ' + String(e.stack).split('\n').slice(0, 3).join(' | ').slice(0, 400) : ''} — ${this.src ? `keeping the running version ${this.srcHash}` : 'NO BRAIN until it compiles'}`);
      return false;
    }
    const old = this.srcHash;
    this.src = src; this.srcHash = hash; this.srcAt = Date.now(); this.srcBad = null;
    this.log(`script ${this.o.script} loaded (${why}): ${hash}${old ? ' (was ' + old + ')' : ''}, ${src.length} chars`);
    return true;
  }
  /** a new deployed version: every worker restarts on it, party by party (= L2Swarm's script reload). -> { ok, changed, hash, why } */
  reload(why) {
    const r = this.loadSource(why || 'reload');
    if (r === false) return { ok: false, changed: false, hash: this.srcHash, why: this.srcBad ? this.srcBad.why : 'unreadable' };
    if (r === 'same') return { ok: true, changed: false, hash: this.srcHash };
    this.st.reloads++;
    if (this.quarantined.size) { this.log(`script reload: quarantine of ${Array.from(this.quarantined).join(', ')} lifted (new code)`); this.quarantined.clear(); this.quarUntil.clear(); for (const c of this.conns.values()) c.refused = false; }
    const parties = new Set(Array.from(this.workers.keys()));
    for (const c of this.conns.values()) if (!c.refused) parties.add(c.party);
    let i = 0;
    for (const party of parties) {
      const delay = (i++) * this.o.reloadGapMs;
      this.later(() => {
        if (this.stopping) return;
        const W = this.workers.get(party);
        if (W) this.restart(W, 'script reload ' + this.srcHash, 0);
        else this.worker(party);
      }, delay);
    }
    return { ok: true, changed: true, hash: this.srcHash, parties: parties.size };
  }
  /** --watch-script: reload when the file changed and stayed the same for one interval (a deploy copy finished) */
  checkScript() {
    let s; try { s = fs.statSync(this.o.script); } catch (e) { return; }
    const k = s.mtimeMs + ':' + s.size;
    if (this.srcSeen && k === this.srcSeen.mtimeMs + ':' + this.srcSeen.size) { this.srcPending = null; return; }
    if (!this.srcPending || this.srcPending !== k) { this.srcPending = k; return; }   // changed: wait one more interval (copy in progress)
    this.srcPending = null;
    this.reload('file changed');
  }
  /** restart delay: 200 ms the first 2 times within 2 min, then backoffBaseMs doubling up to backoffMaxMs (audit #33: no 200 ms crash loop) */
  backoff(party) {
    const t = Date.now(), arr = (this.fails.get(party) || []).filter(x => t - x < 120000); arr.push(t); this.fails.set(party, arr);
    return arr.length <= 2 ? 200 : Math.min(this.o.backoffMaxMs, this.o.backoffBaseMs * Math.pow(2, arr.length - 3));
  }
  worker(party) {
    let W = this.workers.get(party);
    if (W) return W;
    if (this.src === null && !this.loadSource('first worker')) { this.log(`worker for party ${party} NOT started: no compiling script (${this.o.script})`); return null; }
    const sab = new SharedArrayBuffer(32);           // Int32 [cur, depth, last, 0] + Float64 [entered ms, last left ms] (worker.js, audit #37)
    const runnerOpts = Object.assign({ script: this.o.script, root: this.o.root, overlay: this.o.overlay, isolate: this.o.isolate, logFile: this.o.logFile, verbose: this.o.verbose }, this.o.runner || {}, { source: this.src });
    const w = new Worker(path.join(__dirname, 'worker.js'), { workerData: { party, sab, hbMs: this.o.hbMs, runner: runnerOpts, allowEval: !!this.o.allowEval, geoToMain: !!this.geo }, resourceLimits: this.o.resourceLimits });
    W = { party, w, sab, mark: new Int32Array(sab, 0, 4), markT: new Float64Array(sab, 16, 2), lastHb: Date.now(), names: [], ready: false, gen: (this.genSeq = (this.genSeq || 0) + 1), dead: false, hash: this.srcHash, startedAt: Date.now() };
    this.workers.set(party, W);
    w.on('message', (m) => this.fromWorker(W, m));
    w.on('error', (e) => { this.log(`worker ${party} error: ${e && e.stack || e}`); });
    w.on('exit', (code) => { W.dead = true; if (this.workers.get(party) === W && !this.stopping) { this.log(`worker ${party} exited (${code}); restarting`); this.restart(W, 'exit ' + code); } });
    this.log(`worker for party ${party} started`);
    // existing connections of this party (a restart): replay their hello
    for (const [cid, c] of this.conns) if (c.party === party && !c.refused) this.openIn(W, cid, c);
    this.pushBrain();
    this.flushApp(W);
    return W;
  }
  // LINE-ALIGNED REPLAY (engine audit #24, 2026-10-12): main copies raw TCP chunks, which are not line-aligned. A restarted worker used to get
  // the hello and then whatever chunk came next (often the middle of a line -> 'bad line', that message lost), and every chunk that arrived
  // while the party had no live worker (restart gap, backoff) was thrown away: 'ap' App events from L2Swarm engines, results, callbacks.
  // Now main keeps the start of the current partial line (c.tail) and the chunks of the gap (max bufMaxAgeMs / bufMaxBytes) and replays them
  // after the hello, so the new worker reads whole lines.
  openIn(W, cid, c) {
    W.w.postMessage({ k: 'open', cid }); W.w.postMessage({ k: 'data', cid, chunk: c.hello + '\n' });
    let pend = (c.tail || '') + (c.q ? c.q.join('') : ''); const pendAt = c.q && c.qAt ? c.qAt : Date.now();
    if (c.q && c.qAt && Date.now() - c.qAt > this.o.bufMaxAgeMs) { const i = pend.lastIndexOf('\n'); this.st.bufDropped = (this.st.bufDropped || 0) + (i + 1); pend = pend.slice(i + 1); }
    c.q = null; c.qAt = 0; c.qBytes = 0; c.tail = '';
    if (pend) { this.noteSent(c, pend, pendAt); W.w.postMessage({ k: 'data', cid, chunk: pend }); this.noteTail(c, pend); this.st.bufReplayed = (this.st.bufReplayed || 0) + pend.length; }
  }
  /** an agent chunk: to the party's live worker, or kept until it has one again */
  forward(cid, c, chunk) {
    const W = this.workers.get(c.party);
    if (W && !W.dead) { this.noteSent(c, chunk); W.w.postMessage({ k: 'data', cid, chunk }); this.noteTail(c, chunk); return; }
    if (!c.q) { c.q = []; c.qAt = Date.now(); c.qBytes = 0; }
    c.q.push(chunk); c.qBytes += chunk.length;
    if (c.qBytes > this.o.bufMaxBytes) {             // too much: drop whole lines, keep the start of the current partial line (alignment)
      const all = (c.tail || '') + c.q.join(''), i = all.lastIndexOf('\n');
      this.st.bufDropped = (this.st.bufDropped || 0) + (i + 1); c.tail = all.slice(i + 1); c.q = []; c.qBytes = 0;
    }
  }
  // STALL WINDOW (identity review 2026-10-12, audit #24 family): a worker that stopped its heartbeat (watchdog) or died (exit) never read
  // what main posted to it after its last heartbeat — up to stallMs (8 s) of agent bytes and cross-party App events. Main keeps what it posted
  // for stallMs + 2 s (with the partial-line start before each chunk, so a replay starts line-aligned); restart() puts the part posted at or
  // after the last heartbeat back into the gap buffers (c.q / appQ) for the new worker. Healthy restarts (reload, memory guard, revive) do not
  // replay it: their worker read everything.
  keepMs() { return (Number(this.o.stallMs) || 8000) + 2000; }
  // at: when the bytes first arrived (a replay keeps its age: a worker that stalls / dies again on it gets it at most once, bufMaxAgeMs)
  noteSent(c, chunk, at) {
    const t = Date.now(), s = c.sent || (c.sent = []); s.push({ at: at || t, chunk, tail: c.tail || '' }); c.sentBytes = (c.sentBytes || 0) + chunk.length;
    while (s.length > 1 && (t - s[0].at > this.keepMs() || c.sentBytes > this.o.bufMaxBytes)) c.sentBytes -= s.shift().chunk.length;
  }
  noteAppSent(T, env, only, at) {
    const t = Date.now(), s = T.appSent || (T.appSent = []); s.push({ env, only, at: at || t });
    while (s.length && (t - s[0].at > this.keepMs() || s.length > this.o.appQueueMax)) s.shift();
  }
  /** restart() of a stalled / dead worker: what it was sent since its last heartbeat goes back into the gap buffers */
  requeueUnread(W) {
    const cut = W.lastHb; let bytes = 0, apps = 0;
    for (const c of this.conns.values()) {
      if (c.party !== W.party || c.refused || !c.sent || !c.sent.length) continue;
      const i = c.sent.findIndex(e => e.at >= cut); const s = c.sent; c.sent = []; c.sentBytes = 0;
      if (i < 0) continue;
      const back = s.slice(i), prev = c.q || [];
      c.tail = back[0].tail; c.q = back.map(e => e.chunk).concat(prev); c.qAt = back[0].at; c.qBytes = c.q.reduce((n, x) => n + x.length, 0);
      bytes += back.reduce((n, e) => n + e.chunk.length, 0);
    }
    const sent = (W.appSent || []).filter(e => e.at >= cut); W.appSent = [];
    if (sent.length) { const q = this.appQ.get(W.party) || []; this.appQ.set(W.party, sent.concat(q).slice(-this.o.appQueueMax)); apps = sent.length; }
    if (bytes || apps) { this.st.stallReplayBytes = (this.st.stallReplayBytes || 0) + bytes; this.st.stallReplayApps = (this.st.stallReplayApps || 0) + apps; this.log(`party ${W.party}: ${bytes} agent byte(s) + ${apps} App event(s) sent to the stopped worker after its last heartbeat kept for the new worker`); }
  }
  noteTail(c, d) { const i = d.lastIndexOf('\n'); c.tail = i >= 0 ? d.slice(i + 1) : (c.tail || '') + d; if (c.tail.length > 8388608) c.tail = ''; }
  /** App events queued for a party while it had no live worker (audit #24): after the replayed hellos (the worker holds them until each
   *  context's first state report, runner.injectFor) */
  flushApp(W) {
    const q = this.appQ.get(W.party); if (!q || !q.length) return; this.appQ.delete(W.party);
    const t = Date.now(); let n = 0;
    for (const e of q) if (t - e.at <= this.o.bufMaxAgeMs) { this.noteAppSent(W, e.env, e.only, e.at); W.w.postMessage({ k: 'appin', env: e.env, only: e.only }); n++; }
    if (n) this.log(`party ${W.party}: ${n} App event(s) that arrived during its worker restart delivered`);
  }
  appTo(party, env, only) {
    const T = this.workers.get(party);
    if (T && !T.dead) { this.noteAppSent(T, env, only); T.w.postMessage({ k: 'appin', env, only }); return; }
    let q = this.appQ.get(party); if (!q) this.appQ.set(party, q = []);
    q.push({ env, only, at: Date.now() }); if (q.length > this.o.appQueueMax) q.shift();
    this.st.appQueued = (this.st.appQueued || 0) + 1;
  }
  /** parties that exist (a worker, or a connection waiting for one) */
  livePartiesExcept(party) { const set = new Set(); for (const T of this.workers.values()) if (!T.dead) set.add(T.party); for (const c of this.conns.values()) if (!c.refused) set.add(c.party); set.delete(party); return set; }
  fromWorker(W, m) {
    if (this.workers.get(W.party) !== W) {                    // a terminated generation: only what its contexts emitted before it stopped (audit #24)
      if (m.k === 'app') { this.relayApp(W, m, true); return; }
      if (m.k === 'write' && typeof m.data === 'string' && m.data.startsWith('{"a":"appemit"')) { const c = this.conns.get(m.cid); if (c && !c.sock.destroyed) c.sock.write(m.data); }
      return;
    }
    switch (m.k) {
      case 'hb': W.lastHb = Date.now(); break;
      case 'ready': W.ready = true; W.runHash = m.hash || ''; break;
      case 'fatal': {                                          // worker.js: the Runner could not start (audit #33): restart with backoff, never a 200 ms loop
        this.st.fatal++; W.fatal = String(m.why || '').split('\n')[0].slice(0, 300);
        this.log(`FATAL party ${W.party} (generation ${W.gen}, script ${W.hash}): ${String(m.why || '').split('\n').slice(0, 4).join(' | ').slice(0, 600)}`);
        this.restart(W, 'fatal');
        break;
      }
      case 'write': { const c = this.conns.get(m.cid); if (c && !c.sock.destroyed) { this.st.bytesOut += m.data.length; c.sock.write(m.data); } break; }
      case 'end': { const c = this.conns.get(m.cid); if (c) { this.conns.delete(m.cid); if (c.dropping) { c.refused = true; try { c.sock.write(JSON.stringify({ a: 'bye', why: 'not allowed' }) + '\n'); c.sock.end(); } catch (e) { } } else try { c.sock.destroy(); } catch (e) { } } break; }   // dropping (live allow list): the last writes + 'bye' are flushed
      case 'names': W.names = m.list; break;
      // IDENTITY (engine audit #21/#22/#31): 'acc' = a context's agent is connected (ids = its current account id + old ids after a re-key),
      // 'gone' = its agent is gone > linkGraceMs or the context was disposed -> no brain account any more (before: only a whole worker
      // restart ever removed an account, so a character rolled back to swarm.js stayed invisible to every brain character)
      case 'acc': { const ids = Array.isArray(m.ids) && m.ids.length ? m.ids : [m.accountId]; for (const a of ids) if (a) this.accounts.set(String(a), W.party); this.pushBrain(); break; }
      case 'gone': { let n = 0; for (const a of (Array.isArray(m.ids) && m.ids.length ? m.ids : [m.accountId])) if (this.accounts.get(String(a)) === W.party) { this.accounts.delete(String(a)); n++; } if (n) this.pushBrain(); break; }
      case 'app': this.relayApp(W, m, false); break;
      case 'geo': if (this.geo) this.geo.onWrite(m.p, m.text); break;
      case 'log': this.log(m.line); break;
      case 'evalres': { const f = this.evals.get(m.id); if (f) { this.evals.delete(m.id); f(m); } break; }
      case 'stats': { const f = this.statsReq.get(m.id); if (f) f(m); break; }
      case 'dropped': this.dropDone(String(m.name || ''), m.ok ? 'context disposed' : (m.why || 'no context')); break;   // live allow list (audit #26/#35)
    }
  }
  /** an App event of a context in W: deliver to the other workers; a party in a restart gap gets it queued (audit #24) */
  relayApp(W, m, stale) {
    this.st.appRelayed++;
    const env = m.env;
    if (m.target) { const p = this.accounts.get(String(m.target)); if (p && p !== W.party) this.appTo(p, env, String(m.target)); }
    else for (const p of this.livePartiesExcept(W.party)) this.appTo(p, env, null);
    if (stale) this.st.appFromDeadGen = (this.st.appFromDeadGen || 0) + 1;
  }
  pushBrain() { const accounts = Array.from(this.accounts.keys()); for (const W of this.workers.values()) if (!W.dead) W.w.postMessage({ k: 'brain', accounts }); }
  /** the watchdog: a worker whose heartbeat stopped is terminated and started again */
  watch() {
    const t = Date.now();
    for (const W of Array.from(this.workers.values())) {
      if (W.dead || t - W.lastHb < this.o.stallMs) continue;
      // WHO (audit #37): inside a guarded callback (mark[0]) or, when that is 0, the context whose callback ran last (mark[2]; its promise
      // continuations run after the callback returned and keep the worker from reaching the setImmediate that clears it)
      const att = stallWho(W, t);
      const name = att.name, fight = name ? this.liveFight(W.party) : '';
      this.st.watchdogKills++;
      this.log(`WATCHDOG party ${W.party}: no heartbeat for ${t - W.lastHb} ms — ${name ? `context ${name} ${att.how} for ${att.since} ms` : 'no context could be named (no callback ran since the last idle turn)'}${fight ? ` — the party has a live ${fight}` : ''}; terminating the worker`);
      if (name) {
        const arr = (this.stalls.get(name) || []).filter(x => t - x < this.o.quarantineWindowMs); arr.push(t); this.stalls.set(name, arr);
        const need = fight ? Math.max(1, this.o.fightQuarantineAfter) : this.o.quarantineAfter;
        if (arr.length >= need && !this.quarantined.has(name)) this.quarantine(name, fight ? `blocked its worker during a live ${fight} (party ${W.party})` : `blocked its worker ${arr.length} times in ${Math.round(this.o.quarantineWindowMs / 60000)} min`);
      } else this.alert('stall', W.party, '', `party ${W.party}: watchdog stall that no context could be named for`);
      this.restart(W, 'watchdog');
    }
  }
  restart(W, why, delayMs) {
    if (this.workers.get(W.party) === W) this.workers.delete(W.party);
    W.dead = true; try { W.w.terminate(); } catch (e) { }
    if (/^(watchdog|exit)/.test(String(why || ''))) { try { this.requeueUnread(W); } catch (e) { this.log('requeue after ' + why + ': ' + e.message); } }   // stall window (identity review)
    // the accounts of the party's connections that are still open stay brain accounts through the restart (their agents keep their bridge
    // lists; other parties' emitTo to them is queued, audit #24); only accounts without a live connection are dropped
    const live = new Set(); for (const c of this.conns.values()) if (c.party === W.party && !c.refused && c.accountId) live.add(c.accountId);
    let dropped = 0; for (const [acc, p] of Array.from(this.accounts)) if (p === W.party && !live.has(acc)) { this.accounts.delete(acc); dropped++; }
    if (dropped) this.pushBrain();
    this.st.workerRestarts++;
    if (this.stopping) return;
    const party = W.party;
    const ms = typeof delayMs === 'number' ? delayMs : this.backoff(party);
    if (ms > 200) { this.log(`worker for party ${party}: restart #${(this.fails.get(party) || []).length} within 2 min — backing off ${Math.round(ms / 1000)} s (${why})`); this.alert('backoff', party, '', `party ${party} restarted ${(this.fails.get(party) || []).length} times within 2 min (${why}) — next start in ${Math.round(ms / 1000)} s`); }
    this.later(() => { if (!this.workers.has(party) && !this.stopping) { const N = this.worker(party); this.log(`worker for party ${party} ${N ? `restarted (${why}, generation ${N.gen}, script ${N.hash})` : `NOT restarted (${why}): no compiling script`}`); } }, ms);
  }
  handle(sock) {
    sock.setNoDelay(true); sock.setEncoding('utf8');
    const cid = ++this.seq; let buf = '', c = null;
    this.st.conns++;
    sock.on('data', (chunk) => {
      this.st.bytesIn += chunk.length;
      if (c) { if (c.refused) return; this.forward(cid, c, chunk); return; }
      buf += chunk; const i = buf.indexOf('\n'); if (i < 0) { if (buf.length > 65536) sock.destroy(); return; }
      const line = buf.slice(0, i), rest = buf.slice(i + 1); buf = '';
      let hello = null; try { hello = JSON.parse(line); } catch (e) { }
      const name = hello && hello.t === 'hello' ? String(hello.name || '') : '';
      this.quarExpire();
      if (!name || (this.o.allow && !this.o.allow.includes(name)) || this.quarantined.has(name)) {
        this.log(`hello from ${name || '?'} refused (${this.quarantined.has(name) ? 'quarantined' : 'not in allow list'})`);
        sock.write(JSON.stringify({ a: 'bye', why: this.quarantined.has(name) ? 'quarantined' : 'not allowed' }) + '\n'); sock.end(); return;
      }
      c = { sock, name, party: this.partyOf(name), hello: line, accountId: String(hello.accountId || '') };
      const W = this.worker(c.party);              // before conns.set: a NEW worker replays only the connections it already has
      this.conns.set(cid, c);
      // no compiling script yet: the connection waits; a reload starts the worker and replays the hello. The rest of the first chunk (lines
      // after the hello) is kept for that replay (review 2026-10-12: it was dropped here)
      if (!W) { if (rest) this.forward(cid, c, rest); return; }
      this.openIn(W, cid, c);
      if (rest) this.forward(cid, c, rest);
    });
    sock.on('close', () => {
      if (!c) return; this.conns.delete(cid); const W = this.workers.get(c.party);
      if (W && !W.dead) { W.w.postMessage({ k: 'close', cid }); return; }
      // closed while the party had no live worker: nobody will say 'gone' for it (audit #22/#24)
      if (c.accountId && this.accounts.get(c.accountId) === c.party && !Array.from(this.conns.values()).some(o => o.accountId === c.accountId)) { this.accounts.delete(c.accountId); this.pushBrain(); }
    });
    sock.on('error', () => { });
  }
  // ---------------------------------------------------------------- RESILIENCE (engine audit #25/#26/#35/#37/#38, 2026-10-12)
  /** an event for the stats file / dashboard (+ the log) */
  alert(kind, party, name, text) {
    const a = { at: new Date().toISOString(), kind, party: party || '', name: name || '', text: String(text || '') };
    this.alerts.push(a); if (this.alerts.length > 50) this.alerts.splice(0, this.alerts.length - 50);
    this.st.alerts = (this.st.alerts || 0) + 1;
    this.log(`ALERT ${kind}${party ? ' party ' + party : ''}${name ? ' ' + name : ''}: ${a.text}`);
  }
  /** the Logs folder as swarm.js sees it (the overlay in tests) */
  logsDir() { return this.o.overlay ? path.join(this.o.overlay, 'Logs') : path.join(this.o.root, 'Logs'); }
  /** a raid / Kamaloka / epic of this party written in the last liveFightMs -> its kind, else '' (swarm.js writes these files every 1-2 s) */
  liveFight(party) {
    if (typeof this.o.liveFight === 'function') { try { return this.o.liveFight(party) || ''; } catch (e) { return ''; } }
    // the party key (swarm.config.json party = its leader) and every character of that worker: swarm.js names the file after the WRITER
    // (liveFileName() = Me.Name of the party leader), which is not the config party key when the leader changed (review 2026-10-12)
    const W = this.workers.get(party), keys = [party].concat(W && Array.isArray(W.names) ? W.names : []);
    for (const k of Array.from(new Set(keys))) { const f = liveFightOf(this.logsDir(), k, Date.now(), this.o.liveFightMs); if (f) return f; }
    return '';
  }
  /** quarantine one character: its agent gets 'bye' (potion reflex only), its hellos are refused until quarantineMs ran out */
  quarantine(name, why) {
    this.quarantined.add(name); this.quarUntil.set(name, Date.now() + this.o.quarantineMs); this.st.quarantined++;
    this.log(`WATCHDOG: ${name} ${why} -> QUARANTINED for ${Math.round(this.o.quarantineMs / 60000)} min (agent told bye: potion reflex only)`);
    this.alert('quarantine', this.partyOf(name), name, `${why} — quarantined for ${Math.round(this.o.quarantineMs / 60000)} min`);
    for (const c of this.conns.values()) if (c.name === name) { c.refused = true; try { c.sock.write(JSON.stringify({ a: 'bye', why: 'quarantined by the brain watchdog' }) + '\n'); c.sock.end(); } catch (e) { } }
  }
  quarExpire() {
    const t = Date.now();
    for (const [n, u] of this.quarUntil) if (t >= u) { this.quarUntil.delete(n); this.quarantined.delete(n); this.stalls.delete(n); this.log(`quarantine of ${n} ended (${Math.round(this.o.quarantineMs / 60000)} min): its next hello is accepted`); }
  }
  /** LIVE ALLOW LIST: brain_host.json changed -> accept the new names, drop the removed ones (no pool restart). -> { added, removed } | null */
  pollConfig(force) {
    const f = this.o.configFile; if (!f) return null;
    let s; try { s = fs.statSync(f); } catch (e) { return null; }
    // ENGINE DEFAULT (2026-10-13): "allowAll": true = every character of the roster file (swarm.config.json, see supervise.js effectiveAllow),
    // so a change of THAT file counts too (an account added on the dashboard is accepted at its next hello, no restart)
    let rs = null; try { rs = fs.statSync(this.rosterFile); } catch (e) { }
    const k = s.mtimeMs + ':' + s.size + '|' + (rs ? rs.mtimeMs + ':' + rs.size : '-'); if (!force && k === this.cfgKey) return null;
    let j; try { j = JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch (e) { if (this.cfgBad !== k) { this.cfgBad = k; this.log(`config ${f} unreadable (${e.message.slice(0, 120)}) — the allow list stays as it is`); } return null; }
    if (!j || typeof j !== 'object') { this.cfgKey = k; return null; }
    try { this.applyAgentCfg(j); } catch (e) { this.log('agent config: ' + e.message); }
    let next;
    if (j.allowAll === true) {
      const acc = SUP.readRoster(this.rosterFile);
      if (!acc) { if (this.rosterBad !== k) { this.rosterBad = k; this.log(`roster ${this.rosterFile} unreadable — "allowAll": the allow list stays as it is`); } return null; }   // cfgKey not set: retried next poll
      this.rosterBad = null;
      if (!this.o.partyOf) { const pm = partyMap(this.o.root, this.rosterFile); if (pm.size) this.pm = pm; }
      next = SUP.effectiveAllow(j, acc);
    } else {
      if (!Array.isArray(j.allow)) { this.cfgKey = k; return null; }      // no list in the file: keep ours
      next = SUP.effectiveAllow(j, null);
      if (!this.o.partyOf && rs) { const pm = partyMap(this.o.root, this.rosterFile); if (pm.size) this.pm = pm; }
    }
    this.cfgKey = k; this.cfgBad = null;
    const cur = this.o.allow || [];
    const d = allowDiff(cur, next);
    if (!d.added.length && !d.removed.length) return d;
    this.o.allow = next; this.cfgAt = Date.now();
    this.log(`allow list changed (live, no restart): +[${d.added.join(', ')}] -[${d.removed.join(', ')}]`);
    d.removed.forEach(n => this.drop(n, 'removed from the allow list'));
    return d;
  }
  /** a character leaves the brain: its context is disposed in its worker (OnBeforeScriptStop while the agent is still connected, so its
   *  L2Swarm writes arrive), then its agent gets 'bye'. The rest of its party keeps running. */
  drop(name, why) {
    const cs = Array.from(this.conns.values()).filter(c => c.name === name);
    if (!cs.length) return;
    cs.forEach(c => { c.dropping = true; });
    const W = this.workers.get(cs[0].party);
    const d = { why, timer: null }; this.drops.set(name, d);
    d.timer = this.later(() => this.dropDone(name, 'worker did not answer'), this.o.dropWaitMs);
    if (W && !W.dead) W.w.postMessage({ k: 'drop', name, why }); else this.dropDone(name, 'no worker');
  }
  dropDone(name, how) {
    const d = this.drops.get(name); if (!d) return;
    this.drops.delete(name); if (d.timer) { clearTimeout(d.timer); this.timers.delete(d.timer); }
    for (const [cid, c] of Array.from(this.conns)) {
      if (c.name !== name) continue;
      c.refused = true; this.conns.delete(cid);
      try { c.sock.write(JSON.stringify({ a: 'bye', why: 'not allowed' }) + '\n'); c.sock.end(); } catch (e) { }
      const W = this.workers.get(c.party); if (W && !W.dead) W.w.postMessage({ k: 'close', cid });
    }
    this.log(`${name} left the brain (${d.why}; ${how})`);
  }
  /** the stats file: every statsMs (main thread; workers that do not answer within 3 s are just missing) */
  async writeStats() {
    if (this.statsBusy) return; this.statsBusy = true;
    try {
      const s = await this.stats(), t = Date.now();
      const rssMb = Math.round(s.mem.rss / 1048576);
      const out = { at: new Date(t).toISOString(), pid: s.pid, port: this.o.port, rssMb, heapMb: Math.round(s.mem.heapUsed / 1048576), st: s.st, script: this.srcHash || '',
        allow: this.o.allow, quarantined: Array.from(this.quarantined).map(n => ({ name: n, until: this.quarUntil.has(n) ? new Date(this.quarUntil.get(n)).toISOString() : null })),
        alerts: this.alerts.slice(-20), restarts: Array.from(this.fails.entries()).map(([p, a]) => ({ party: p, last2min: a.filter(x => t - x < 120000).length })),
        mainLag: this.mainLag(), workers: s.workers.map(w => ({ party: w.party, heapMb: Math.round((w.heapUsed || 0) / 1048576), elu: +(Number(w.elu || 0) * 100).toFixed(1), lag: w.lag || null, hot: w.hot || 0, vfsMb: w.vfsMb, shared: w.shared, contexts: (w.contexts || []).map(c => ({ name: c.name, booted: c.booted, connected: c.connected })) })),
        missingWorkers: Array.from(this.workers.values()).filter(W => !W.dead && !s.workers.some(w => w.party === W.party)).map(W => W.party) };
      this.memGuard(rssMb, out); this.lagLog(out);
      if (this.o.statsFile) { const tmp = this.o.statsFile + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(out)); fs.renameSync(tmp, this.o.statsFile); }
      this.lastStats = out;
    } catch (e) { this.log('stats file: ' + e.message); }
    finally { this.statsBusy = false; }
  }
  // ENGINELAT-2026-10-13: event-loop delay of the main thread (it copies every agent byte) and of each party worker (stats file "mainLag" /
  // workers[].lag, ms p50 / p99 / max over the last stats window) + one LAG line in brain_host.log every 5 min (the worst window seen)
  mainLag() {
    if (!this.eld) { try { this.eld = monitorEventLoopDelay({ resolution: 10 }); this.eld.enable(); } catch (e) { this.eld = false; } return null; }
    const h = this.eld; const r = { p50: +(h.percentile(50) / 1e6).toFixed(1), p99: +(h.percentile(99) / 1e6).toFixed(1), max: +(h.max / 1e6).toFixed(1) }; h.reset(); return r;
  }
  lagLog(out) {
    const t = Date.now(), W = this.lagWorst || (this.lagWorst = {});
    const keep = (k, l, elu) => { if (!l) return; const o = W[k]; if (!o || l.p99 > o.p99) W[k] = Object.assign({ elu }, l); };
    keep('main', out.mainLag, null); (out.workers || []).forEach(w => keep(w.party, w.lag, w.elu));
    if (!this.lagAt) { this.lagAt = t; return; } if (t - this.lagAt < (this.o.lagLogMs || 300000)) return; this.lagAt = t;
    const parts = Object.keys(W).sort((a, b) => W[b].p99 - W[a].p99).map(k => `${k} p50/p99/max=${W[k].p50}/${W[k].p99}/${W[k].max}${W[k].elu != null ? ' elu=' + W[k].elu + '%' : ''}`);
    this.lagWorst = {}; if (parts.length) this.log('LAG (worst 10 s window, ms) ' + parts.join(' | '));
  }
  /** ENGINELAT live switches from brain_host.json: "agentPush": true | [names] (orders pushed to the agent by its async read), "partyHot": false
   *  turns the fight hint off. Sent to every worker now; new workers get them in their runner options. */
  applyAgentCfg(j) {
    // PERF-2026-10-15 kill switch: "sharedParse": false in brain_host.json = workers started from now on (restart / reload / new party) parse
    // their own copies again (the old way); the running ones keep what they have until they restart
    if (typeof j.sharedParse === 'boolean' && this.o.runner && this.o.runner.sharedParse !== j.sharedParse) { this.o.runner = Object.assign({}, this.o.runner, { sharedParse: j.sharedParse }); this.log(`shared parse ${j.sharedParse ? 'ON' : 'OFF'} for workers started from now on (brain_host.json "sharedParse")`); }
    const push = j.agentPush === true ? true : Array.isArray(j.agentPush) ? j.agentPush.map(String) : false, hot = j.partyHot !== false;
    const sig = JSON.stringify([push, hot]); if (sig === this.agentCfgSig) return; this.agentCfgSig = sig;
    this.o.runner = Object.assign({}, this.o.runner || {}, { agentPush: push, partyHot: hot });
    for (const W of this.workers.values()) if (!W.dead) W.w.postMessage({ k: 'agentcfg', agentPush: push, partyHot: hot });
    this.log(`agent config: push ${push === true ? 'ALL' : push.length ? push.join(', ') : 'off'}, party fight hint ${hot ? 'on' : 'off'}`);
  }
  /** MEMORY GUARD: above maxRssMb an ALERT; with memRestart the worker with the biggest heap (never a party with a live fight) restarts */
  memGuard(rssMb, out) {
    if (!(this.o.maxRssMb > 0) || rssMb <= this.o.maxRssMb) return;
    const t = Date.now();
    if (!this.memAlertAt || t - this.memAlertAt > 600000) { this.memAlertAt = t; this.alert('memory', '', '', `pool RSS ${rssMb} MB > ${this.o.maxRssMb} MB`); }
    if (!this.o.memRestart || (this.memRestartAt && t - this.memRestartAt < this.o.memRestartGapMs)) return;
    const all = out.workers || [];
    const cand = all.filter(w => !this.liveFight(w.party)).sort((a, b) => b.heapMb - a.heapMb)[0];
    const W = cand && this.workers.get(cand.party);
    if (!W) { this.log(`memory guard: every big worker has a live fight — not restarting anything`); return; }
    // ONLY A WORKER THAT STANDS OUT (review 2026-10-12): with many parties the pool is above the limit because of its real load (~90 MB per
    // character live); restarting the biggest worker then frees nothing (it boots back to the same size) and reboots one party every 10 min
    // forever. A restart needs a worker that looks like a leak: heap >= memOutlier x the median of the other workers, or >= half the limit.
    const others = all.filter(w => w !== cand).map(w => Number(w.heapMb) || 0).sort((a, b) => a - b);
    const med = others.length ? others[Math.floor(others.length / 2)] : 0;
    const outlier = Number(cand.heapMb) >= this.o.maxRssMb / 2 || (others.length > 0 && Number(cand.heapMb) >= (this.o.memOutlier || 2) * Math.max(med, 1));
    if (!outlier) {
      if (!this.memNoteAt || t - this.memNoteAt > 600000) { this.memNoteAt = t; this.alert('memory', '', '', `pool RSS ${rssMb} MB > ${this.o.maxRssMb} MB but no worker stands out (biggest ${cand.party} ${cand.heapMb} MB, median of the others ${med} MB): the load is real — raise maxRssMb in brain_host.json; nothing restarted`); }
      return;
    }
    this.memRestartAt = t; this.alert('memrestart', W.party, '', `restarting party ${W.party} (heap ${cand.heapMb} MB) to free memory`);
    this.restart(W, 'memory guard', 200);
  }
  start() {
    this.wd = setInterval(() => this.watch(), Math.max(100, Math.round(this.o.hbMs)));
    if (this.o.configFile) { this.pollConfig(true); this.cfgIv = setInterval(() => { try { this.pollConfig(); } catch (e) { this.log('config poll: ' + e.message); } }, this.o.configPollMs); }
    if (this.o.statsFile || this.o.maxRssMb > 0) this.statsIv = setInterval(() => { this.writeStats(); }, this.o.statsMs);
    this.qIv = setInterval(() => this.quarExpire(), 30000);
    this.loadSource('start');
    if (this.o.watchScriptMs > 0) this.sw = setInterval(() => { try { this.checkScript(); } catch (e) { this.log('script watch: ' + e.message); } }, this.o.watchScriptMs);
    return new Promise((res, rej) => {
      this.server = net.createServer((s) => this.handle(s));
      this.server.on('error', rej);
      this.server.listen(this.o.port, this.o.host, () => { this.log(`brain host pool listening on ${this.o.host}:${this.o.port} (pid ${process.pid}, stall ${this.o.stallMs} ms)`); res(this); });
    });
  }
  async stop() {
    this.stopping = true; clearInterval(this.wd); if (this.sw) clearInterval(this.sw); [this.cfgIv, this.statsIv, this.qIv].forEach(i => { if (i) clearInterval(i); }); for (const t of this.timers) clearTimeout(t); this.timers.clear();
    for (const c of this.conns.values()) try { c.sock.destroy(); } catch (e) { }
    await Promise.all(Array.from(this.workers.values()).map(W => W.w.terminate().catch(() => { })));
    this.workers.clear();
    if (this.server) await new Promise(r => this.server.close(() => r()));
    if (this.geo) this.geo.stop();
  }
  /** dashboard supervisor (audit #32): source, workers, quarantine, connections — main thread only, answers even while a worker is stuck */
  health() {
    const t = Date.now();
    return { pid: process.pid, script: this.o.script, hash: this.srcHash, loadedAt: this.srcAt, bad: this.srcBad, quarantined: Array.from(this.quarantined),
      workers: Array.from(this.workers.values()).map(W => ({ party: W.party, gen: W.gen, ready: W.ready, dead: W.dead, hash: W.hash, runHash: W.runHash || '', hbAgeMs: t - W.lastHb, fatal: W.fatal || null })),
      conns: Array.from(this.conns.values()).map(c => ({ name: c.name, party: c.party, refused: !!c.refused })), st: Object.assign({}, this.st),
      quarUntil: Array.from(this.quarUntil.entries()).map(([n, u]) => ({ name: n, until: new Date(u).toISOString() })), alerts: this.alerts.slice(-20), allow: this.o.allow };
  }
  /** dashboard supervisor (audit #32): a brain character's state file went stale -> restart its party's worker (never while quarantined) */
  revive(name, why) {
    name = String(name || '');
    if (this.quarantined.has(name)) return { ok: false, why: 'quarantined' };
    const conn = Array.from(this.conns.values()).find(c => c.name === name);
    const party = conn ? conn.party : this.partyOf(name);
    if (!conn) return { ok: false, why: 'agent not connected', party };
    const W = this.workers.get(party), t = Date.now();
    // review 2026-10-12: the supervisor asks once per stale CHARACTER, so a party of 5 with a stuck worker gave 5 restarts in a row (each one
    // boots swarm.js in every context again), and a party waiting out its restart backoff (crash loop) was started at once, past the backoff.
    // One worker start per party per reviveGapMs (default 2 min) is enough; a pending backoff restart is left alone.
    if (!W) {
      if (this.src === null) return { ok: false, why: 'no compiling script', party };
      if (!this.stopping) { this.log(`revive ${name} (party ${party}): a restart of its worker is already pending (backoff) — not starting it early`); return { ok: true, party, why: 'restart already pending' }; }
      return { ok: false, why: 'pool stopping', party };
    }
    const gap = this.o.reviveGapMs != null ? this.o.reviveGapMs : 120000;
    if (t - (W.startedAt || 0) < gap) { this.log(`revive ${name} (party ${party}): its worker started ${Math.round((t - W.startedAt) / 1000)} s ago — not restarting it again`); return { ok: true, party, why: `worker started ${Math.round((t - W.startedAt) / 1000)} s ago` }; }
    this.log(`revive ${name} (party ${party}): ${why || 'requested'}`);
    this.restart(W, 'revive ' + name + (why ? ': ' + why : ''), 200);
    return { ok: true, party };
  }
  /** tests: run code in one context (needs allowEval) */
  eval(name, code) {
    const party = this.partyOf(name), W = this.workers.get(party); if (!W) return Promise.resolve({ ok: false, v: 'no worker' });
    const id = ++this.seq; return new Promise(r => { this.evals.set(id, r); W.w.postMessage({ k: 'eval', id, name, code }); setTimeout(() => { if (this.evals.has(id)) { this.evals.delete(id); r({ ok: false, v: 'timeout' }); } }, 10000); });
  }
  async stats() {
    const id = ++this.seq, out = []; const ws = Array.from(this.workers.values()).filter(W => !W.dead);
    await new Promise(r => { let n = ws.length; if (!n) return r(); this.statsReq.set(id, (m) => { out.push(m); if (--n === 0) r(); }); ws.forEach(W => W.w.postMessage({ k: 'stats', id })); setTimeout(r, 3000); });
    this.statsReq.delete(id);
    return { pid: process.pid, mem: process.memoryUsage(), cpu: process.cpuUsage(), st: this.st, workers: out, quarantined: Array.from(this.quarantined) };
  }
}

/** who blocked the worker (audit #37): W.mark Int32 [cur, depth, last, 0], W.markT Float64 [entered, last left].
 *  -> { name, how, since } (name null = nobody can be named) */
function stallWho(W, t) {
  const cur = Atomics.load(W.mark, 0);
  if (cur) return { name: W.names[cur - 1] || null, how: 'inside a callback', since: Math.round(t - W.markT[0]) };
  const last = W.mark.length >= 3 ? Atomics.load(W.mark, 2) : 0;
  if (last) return { name: W.names[last - 1] || null, how: 'after an await (a promise continuation of its last callback)', since: W.markT.length >= 2 ? Math.round(t - W.markT[1]) : 0 };
  return { name: null, how: '', since: 0 };
}
/** a live fight of a party: Logs/{raid,kamaloka,epic}_live_<party>.json written in the last ms -> 'raid' | 'kamaloka' | 'epic' | '' */
function liveFightOf(logsDir, party, t, ms) {
  for (const k of ['raid', 'kamaloka', 'epic']) {
    try { const s = fs.statSync(path.join(logsDir, `${k}_live_${party}.json`)); if (t - s.mtimeMs < (ms || 30000)) return k; } catch (e) { }
  }
  return '';
}
/** allow-list change -> { added, removed } */
function allowDiff(cur, next) {
  const a = new Set(cur || []), b = new Set(next || []);
  return { added: Array.from(b).filter(n => !a.has(n)), removed: Array.from(a).filter(n => !b.has(n)) };
}

module.exports = { Pool, partyMap, stallWho, liveFightOf, allowDiff };

if (require.main === module) {
  const a = process.argv.slice(2), opt = (k, d) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; };
  if (!opt('--allow', '') && !a.includes('--allow-all')) { console.error('refusing to start without --allow Name1,Name2 (or --allow-all)'); process.exit(2); }
  const pool = new Pool({ port: Number(opt('--port', 8095)), allow: a.includes('--allow-all') ? null : opt('--allow').split(','), stallMs: Number(opt('--stall-ms', 8000)),
    overlay: opt('--overlay', null), isolate: opt('--overlay', null) ? ['Logs'] : [], logFile: opt('--log', path.join(ROOT, 'Logs', 'brain_host.log')), geopath: a.includes('--geopath'),
    allowEval: a.includes('--test-eval'), verbose: a.includes('--verbose'), script: path.resolve(opt('--script', path.join(ROOT, 'Scripts', 'swarm.js'))),
    watchScriptMs: a.includes('--watch-script') ? (Number(opt('--watch-script', '')) || 5000) : 0,
    configFile: opt('--config', null) ? path.resolve(opt('--config')) : null, rosterFile: opt('--roster', null) ? path.resolve(opt('--roster')) : null, statsFile: opt('--stats-file', null) ? path.resolve(opt('--stats-file')) : null,
    maxRssMb: Number(opt('--max-rss-mb', 0)) || 0, memRestart: a.includes('--mem-restart'),
    runner: { sharedParse: !a.includes('--no-shared-parse'),   /* PERF-2026-10-15: on by default (big Scripts\data datasets parsed once per party worker; --no-shared-parse = the old private copies) */ bridge: a.includes('--bridge'), cbTimeoutMs: Number(opt('--cb-timeout', 0)) || 0, allowProcess: a.includes('--allow-process') } });
  pool.start().then(() => { if (process.send) process.send({ k: 'listening', port: pool.o.port }); }).catch(e => { console.error(e.message); process.exit(2); });
  if (process.send) process.on('message', async (m) => {
    if (m.k === 'stats') process.send({ k: 'stats', id: m.id, v: await pool.stats() });
    else if (m.k === 'st') process.send({ k: 'st', id: m.id, v: Object.assign({}, pool.st) });   // main-thread counters only (answers even while a worker is stuck)
    else if (m.k === 'eval') process.send({ k: 'evalres', id: m.id, v: await pool.eval(m.name, m.code) });
    else if (m.k === 'health') process.send({ k: 'health', id: m.id, v: pool.health() });
    else if (m.k === 'reload') process.send({ k: 'reload', id: m.id, v: pool.reload(m.why || 'IPC reload') });
    else if (m.k === 'revive') process.send({ k: 'revive', id: m.id, v: pool.revive(m.name, m.why) });
    else if (m.k === 'stop') { await pool.stop(); process.exit(0); }
  });
  process.on('SIGINT', () => pool.stop().then(() => process.exit(0)));
}
