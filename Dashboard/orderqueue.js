// ORDER QUEUE (user 2026-10-13 12:20: "make sure the state machine runs as it should in the system - it is annoying that the commands we
// send keep not working"). The dashboard side of the durable order queue; the bot side is the ORDERQ block in Scripts_dev/swarm.js.
//
// Why: /api/command answered ok as soon as MCP accepted a party-chat 'say' - not when a bot got it. 2026-10-13 12:09 "!dawn" to 13 parties
// right after a brain pool restart (12:06): only 10 characters logged "received", the other leaders were not connected yet, the order was
// lost and the dashboard said ok. Orders were also lost during swarm.js reloads / pool restarts / agent reconnects / headless relogins.
//
// How (one writer per file, plain files: the same path works for swarm.js inside the brain host AND inside L2Swarm):
//   Logs/orders/<Name>.json        written ONLY by the dashboard (atomic tmp + rename): { v, name, rev, at, orders: [entry] }
//       entry = { id, cmd ('!dawn', no '#'), from (the sayer: its party leader or itself), at (ms), ttlMs, order (a new order for this
//                 character = swarm.js orderNewFor), stop, target (label), via, state: 'queued' | 'cancelled' | 'superseded' | 'expired' |
//                 'done' (legacy: sent by party chat to an old swarm.js), why, stateAt, nudges, lastNudge }
//   Logs/orders/<Name>.state.json  written ONLY by that character's swarm.js: heartbeat (at / atMs every 15 s) + { orders: { id: { state:
//                 'delivered' | 'acknowledged' | 'running' | 'done' | 'failed' | 'superseded' | 'expired' | 'cancelled', why, how, at,
//                 deliveredAt, ackAt, startAt, endAt, seq } } }. An id in there is NEVER run again (exactly once, also after a reload).
//   Logs/orders/_orders.json       the dashboard's index (what was ordered, to whom, the original targets for "Re-send")
//   Logs/orders/orders.log         every state change (one line each)
// Life of an order per character: queued -> delivered (the window read it, not ready yet) -> acknowledged (accepted, written BEFORE it
// runs) -> running (an order that holds control: !town, !park, !level, ... until done / failed / replaced) -> done | failed | superseded |
// expired | cancelled. Re-delivery: an un-acked entry is "nudged" (file rewritten, rev+1) after 5 s, 15 s, 45 s, 135 s, 405 s while its
// window is up; swarm.js also re-reads the file every 10 s and on every start. Expiry: ttlMs (default 10 min, catalog 'ttl' seconds).
// A window that never wrote a state file runs the OLD swarm.js: it gets the order by party chat as before (MCP), its entry is 'done'
// (legacy, no confirmation possible) so a later swarm.js deploy never runs it a second time.
'use strict';
const fs = require('fs'), path = require('path');

const OQD = { ttlMs: 600000, safeTtlMs: 120000, stopTtlMs: 300000, freshMs: 45000, backoff: [5000, 15000, 45000, 135000, 405000],
  keepDoneMs: 2 * 3600e3, keepMaxMs: 24 * 3600e3, maxPerFile: 60, maxIndex: 300, scanMs: 30000 };
// = ORDER_CMDS in Scripts_dev/swarm.js (docs/plan/tools/test_order_queue.js checks they are the same)
const ORDER_RE = /^!(stop|start|park|safespot|town|level|autolevel|supply|restock|collect|mission|raidhunt|goto|gk|soe|regroup|return|gearup|assist|dungeon|jointraid|siege|routetest|escort|career|farm|go|raid|hunthere|formation|dawn)$/;
const TERMINAL = new Set(['done', 'skipped', 'failed', 'superseded', 'expired', 'cancelled']);   // skipped = HOFFRACE-2026-10-27 (hands off)
const TAKEN = new Set(['acknowledged', 'running', 'done', 'skipped', 'failed', 'superseded', 'expired', 'cancelled']);
const lc = (s) => String(s == null ? '' : s).trim().toLowerCase();
const clean = (t) => String(t || '').trim().replace(/^#(?=!)/, '');
const firstWord = (t) => clean(t).split(/\s+/)[0].toLowerCase();
const hm = (ms) => { const d = new Date(ms); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };

/** = swarm.js orderNewFor: does this command start a NEW order in <name>'s window (it replaces the order running there)? */
function isOrderFor(text, name, known) {
  const parts = clean(text).split(/\s+/), cmd = String(parts[0] || '').toLowerCase();
  if (!ORDER_RE.test(cmd)) return false;
  if (cmd === '!goto' && lc(parts[1]) === 'npc' && parts.length > 3) {
    const last = lc(parts[parts.length - 1]);
    if (known && known.some(k => lc(k) === last) && last !== lc(name)) return false;
  }
  if ((cmd === '!dawn' || cmd === '!start') && parts.length > 1) return lc(parts[1]) === lc(name);   // RUNSTATE: '!start <name>' = that character only
  return true;
}
/** catalog entry + command -> { stop, ttlMs }: !stop 5 min, report-only ('safe') 2 min, else 10 min; catalog 'ttl' (seconds) wins */
function policy(spec, text) {
  const stop = firstWord(text) === '!stop';
  let ttlMs = stop ? OQD.stopTtlMs : (spec && spec.safety === 'safe') ? OQD.safeTtlMs : OQD.ttlMs;
  if (spec && Number(spec.ttl) > 0) ttlMs = Math.round(Number(spec.ttl) * 1000);
  return { stop, ttlMs };
}
let idSeq = 0;
function newId(now) { return 'o' + Number(now || Date.now()).toString(36) + (++idSeq).toString(36) + Math.random().toString(36).slice(2, 6); }

/** the window of a character from its state file: { seen (ever wrote one = runs the queue-aware swarm.js), fresh (heartbeat <= 45 s), ready, why } */
function windowOf(st, now) {
  if (!st || typeof st !== 'object' || !st.atMs) return { seen: false, fresh: false, ready: false, why: 'no order-queue heartbeat (old swarm.js)' };
  const age = now - Number(st.atMs);
  const fresh = age <= OQD.freshMs;
  return { seen: true, fresh, ready: fresh && !!st.ready, atMs: Number(st.atMs), why: fresh ? (st.ready ? '' : (st.notReady || 'logging in')) : `not connected (last heartbeat ${hm(Number(st.atMs))})` };
}
/** merged state of one queue entry for <name>: the bot's record wins once it took the order */
function merge(name, q, b, win, now) {
  if (b && b.state === 'done' && b.skipped) return { state: 'skipped', why: b.why || 'skipped (hands off)', how: b.how || 'skipped (hands off)', at: b.at || q.at, by: 'bot' };   // HOFFRACE-2026-10-27: a party order a hands-off character did not run
  if (b && b.state && b.state !== 'delivered') return { state: b.state, why: b.why || '', how: b.how || '', at: b.at || q.at, by: 'bot' };
  if (q.state && q.state !== 'queued') return { state: q.state, why: q.why || '', how: q.how || '', at: q.stateAt || q.at, by: 'dashboard' };
  const until = q.at + (q.ttlMs || OQD.ttlMs);
  if (now > until) return { state: 'expired', why: `${name} did not pick it up within ${Math.round((q.ttlMs || OQD.ttlMs) / 60000)} min (${win.seen ? win.why || 'window up but not reading' : 'old swarm.js'})`, at: until, by: 'dashboard', fresh: true };
  if (b && b.state === 'delivered') return { state: 'delivered', why: b.why || `${name}'s window has it - waiting until the character is ready`, at: b.at || q.at, by: 'bot', pending: true };
  if (!win.fresh) return { state: 'queued', why: `${name} not connected yet - will be delivered when its swarm.js starts (until ${hm(until)})`, at: q.at, by: 'dashboard', pending: true, waiting: true };
  if (!win.ready) return { state: 'queued', why: `${name} is ${win.why || 'not ready'} - will run once it is ready (until ${hm(until)})`, at: q.at, by: 'dashboard', pending: true, waiting: true };
  return { state: 'queued', why: q.nudges ? `${name}'s window is up but did not pick it up yet (re-delivered ${q.nudges}x)` : `${name}'s window reads it within a second`, at: q.at, by: 'dashboard', pending: true };
}
/** add one entry to a character's queue; earlier entries the bot did not take yet are superseded (a !stop: all of them; a new order:
 *  earlier orders). Taken ones belong to the bot (its swarm.js ends its running order itself). -> { queue, superseded: [ids] } */
function enqueueInto(queue, entry, mergedOf, now) {
  const q = queue && Array.isArray(queue.orders) ? queue : { v: 1, name: entry.to, rev: 0, orders: [] };
  const superseded = [];
  q.orders.forEach(e => {
    const m = mergedOf(e);
    if (TAKEN.has(m.state) || m.state === 'expired') return;
    if (entry.stop || (entry.order && e.order)) { Object.assign(e, { state: 'superseded', why: `replaced by ${entry.cmd} (${entry.id}) before ${q.name} picked it up${entry.stop ? ' - !stop clears the pending orders' : ''}`, stateAt: now }); superseded.push(e.id); }
  });
  q.orders.push(entry);
  prune(q, mergedOf, now);
  q.rev = (Number(q.rev) || 0) + 1; q.at = new Date(now).toISOString();
  return { queue: q, superseded };
}
function prune(q, mergedOf, now) {
  q.orders = q.orders.filter(e => {
    if (now - e.at > OQD.keepMaxMs) return false;
    const m = mergedOf(e);
    return !(TERMINAL.has(m.state) && now - (m.at || e.at) > OQD.keepDoneMs);
  });
  if (q.orders.length > OQD.maxPerFile) q.orders = q.orders.slice(-OQD.maxPerFile);
  return q;
}
/** re-delivery: is a nudge (rewrite the file so the window reads it again) due for this pending entry? */
function nudgeDue(e, m, win, now) {
  if (!m.pending || !win.fresh || m.state === 'delivered') return false;
  const n = Number(e.nudges) || 0, gap = OQD.backoff[Math.min(n, OQD.backoff.length - 1)];
  return now - (Number(e.lastNudge) || e.at) >= gap;
}

// ---- file side ----------------------------------------------------------------------------------------------------------------
let FSC = null; try { FSC = require("./fscache"); } catch (e) { }   // DASHPERF 2026-10-13: unchanged queue files are not read again (mtime + size)
function readJson(f) { try { let t = FSC ? FSC.readText(f) : fs.readFileSync(f, "utf8"); if (t.charCodeAt(0) === 0xFEFF) t = t.slice(1); return JSON.parse(t); } catch (e) { return null; } }
function writeAtomic(f, obj) { const tmp = f + '.' + process.pid + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(obj, null, 1)); fs.renameSync(tmp, f); }
const safeName = (n) => /^[A-Za-z0-9_-]{1,32}$/.test(String(n || '')) ? String(n) : null;

/**
 * o = { dir: () => folder or null (null = queue off: tests / a sandbox without a temp folder), log?: (line) }
 */
function create(o) {
  const S = { pending: new Set(), scanAt: 0, logged: new Map(), beats: new Map() };
  const dir = () => { try { return o.dir(); } catch (e) { return null; } };
  const enabled = () => !!dir();
  const qFile = (n) => path.join(dir(), n + '.json'), sFile = (n) => path.join(dir(), n + '.state.json'), iFile = () => path.join(dir(), '_orders.json');
  const ensure = () => { const d = dir(); if (d) fs.mkdirSync(d, { recursive: true }); return d; };
  function botState(n) {
    const f = sFile(n); let mt = 0; try { mt = fs.statSync(f).mtimeMs; } catch (e) { return null; }
    const c = S.beats.get(n); if (c && c.mt === mt) return c.st;
    const st = readJson(f); if (st) S.beats.set(n, { mt, st });
    return st || (c ? c.st : null);
  }
  const win = (n, now) => windowOf(botState(n), now || Date.now());
  // DASHPERF 2026-10-13: list() asked status() for every order x recipient = ~600 queue-file reads per GET /api/orders (0.7-4.6 s live):
  // inside one list() call each character's queue file is read once (list / status only read it)
  const readQ = (n) => { if (S.qmemo && S.qmemo.has(n)) return S.qmemo.get(n); const v = readJson(qFile(n)); if (S.qmemo) S.qmemo.set(n, v); return v; };
  function mergedFor(n, now) { const st = botState(n), w = windowOf(st, now), bo = (st && st.orders) || {}; return (e) => merge(n, e, bo[e.id], w, now); }
  function logLine(t) { try { fs.appendFileSync(path.join(dir(), 'orders.log'), new Date().toISOString() + ' ' + t + '\r\n'); } catch (e) { } if (o.log) { try { o.log(t); } catch (e) { } } }
  function noteState(n, e, m) {
    const k = e.id + '|' + n, was = S.logged.get(k);
    if (was === m.state) return;
    S.logged.set(k, m.state);
    if (S.logged.size > 5000) S.logged.delete(S.logged.keys().next().value);
    logLine(`${e.id} ${n} ${e.cmd}: ${was || 'new'} -> ${m.state}${m.why ? ' (' + m.why + ')' : ''}${m.how ? ' [' + m.how + ']' : ''}`);
  }
  function index() { const j = readJson(iFile()); return Array.isArray(j) ? j : []; }
  /**
   * Queue one dashboard order. order = { id, cmd (full command, no '#'), at, label, targets, safety, specId, kind, ttlMs, stop, sends:
   * [{ from, text, via, recipients: [names] }] }, known = roster names. Returns { id, recipients: [{ name, from, window, legacy, state, why }] }.
   * legacy recipients (no state file ever) get an entry already 'done' (party chat, the caller sends it by MCP as before).
   */
  function add(order, known) {
    if (!ensure()) return null;
    const now = order.at || Date.now(), out = [], seenR = new Set();
    order.sends.forEach(s => {
      (s.recipients || []).forEach(n => {
        if (!safeName(n) || seenR.has(n)) return;              // one entry per character and order (the first send that reaches it)
        seenR.add(n);
        const w = win(n, now), legacy = !w.seen;
        const entry = { id: order.id, to: n, cmd: clean(s.text), from: s.from, at: now, ttlMs: order.ttlMs || OQD.ttlMs, order: isOrderFor(s.text, n, known), stop: !!order.stop,
          target: order.label || '', via: s.via || 'party', state: legacy ? 'done' : 'queued' };
        if (legacy) Object.assign(entry, { why: 'sent by party chat: this window runs the old swarm.js (no order queue, no confirmation)', how: 'party chat (legacy)', stateAt: now, legacy: true });
        const r = enqueueInto(readQ(n), entry, mergedFor(n, now), now);
        writeAtomic(qFile(n), r.queue);
        r.superseded.forEach(id => logLine(`${id} ${n}: -> superseded (by ${entry.cmd} ${order.id})`));
        if (!legacy) S.pending.add(n);
        const m = merge(n, entry, null, w, now);
        noteState(n, entry, m);
        out.push({ name: n, from: s.from, legacy, window: legacy ? 'legacy' : w.fresh ? 'up' : 'down', state: m.state, why: m.why });
      });
    });
    const idx = index().filter(x => x && x.id !== order.id);
    idx.push({ id: order.id, cmd: order.cmd, at: now, label: order.label, targets: order.targets, safety: order.safety, specId: order.specId || '', ttlMs: order.ttlMs, stop: !!order.stop,
      sends: order.sends.map(s => ({ from: s.from, text: clean(s.text), via: s.via, recipients: s.recipients })), recipients: out.map(r => r.name), legacy: out.filter(r => r.legacy).map(r => r.name) });
    writeAtomic(iFile(), idx.slice(-OQD.maxIndex));
    return { id: order.id, recipients: out };
  }
  /** per recipient of an order id: merged states */
  function status(id, names, now) {
    now = now || Date.now();
    return names.map(n => { const q = readQ(n), e = q && (q.orders || []).find(x => x.id === id); if (!e) return { name: n, state: 'unknown', why: 'not in its queue (pruned?)' }; const st = botState(n), m = merge(n, e, ((st && st.orders) || {})[id], windowOf(st, now), now); return Object.assign({ name: n }, m, { from: e.from, cmd: e.cmd }); });
  }
  async function waitAcks(id, names, ms) {
    const t0 = Date.now(); let r = status(id, names);
    while (Date.now() - t0 < ms && r.some(x => x.pending && !x.waiting)) { await new Promise(res => setTimeout(res, 200)); r = status(id, names); }
    return r;
  }
  /** every 2 s: re-delivery nudges, dashboard-side expiry, state-change log */
  function tick(nowArg) {
    if (!enabled()) return;
    const now = nowArg || Date.now();
    if (now - S.scanAt > OQD.scanMs) { S.scanAt = now; try { fs.readdirSync(dir()).forEach(f => { const m = /^([A-Za-z0-9_-]+)\.json$/.exec(f); if (m && m[1] !== '_orders') S.pending.add(m[1]); }); } catch (e) { } }
    for (const n of [...S.pending]) {
      const q = readQ(n); if (!q || !Array.isArray(q.orders)) { S.pending.delete(n); continue; }
      const st = botState(n), w = windowOf(st, now), bo = (st && st.orders) || {};
      let dirty = false, open = 0;
      q.orders.forEach(e => {
        const m = merge(n, e, bo[e.id], w, now);
        noteState(n, e, m);
        if (m.state === 'expired' && m.by === 'dashboard' && (!e.state || e.state === 'queued')) { Object.assign(e, { state: 'expired', why: m.why, stateAt: now }); dirty = true; return; }
        if (m.pending) { open++; if (nudgeDue(e, m, w, now)) { e.nudges = (Number(e.nudges) || 0) + 1; e.lastNudge = now; dirty = true; } }
        if (m.state === 'acknowledged' || m.state === 'running') open++;
      });
      if (dirty) { const mo = (e) => merge(n, e, bo[e.id], w, now); prune(q, mo, now); q.rev = (Number(q.rev) || 0) + 1; q.at = new Date(now).toISOString(); try { writeAtomic(qFile(n), q); } catch (e) { } }
      if (!open) S.pending.delete(n);
    }
  }
  /** cancel: entries not taken yet -> 'cancelled'; a running one -> 'cancelled' in the queue too (its window ends the order's retry loop) */
  function cancel(id, names, why, now) {
    now = now || Date.now(); const done = [];
    (names || []).forEach(n => {
      if (!safeName(n)) return;
      const q = readQ(n), e = q && (q.orders || []).find(x => x.id === id); if (!e) return;
      const st = botState(n), m = merge(n, e, ((st && st.orders) || {})[id], windowOf(st, now), now);
      if (TERMINAL.has(m.state)) return;
      Object.assign(e, { state: 'cancelled', why: why || 'cancelled on the dashboard', stateAt: now });
      q.rev = (Number(q.rev) || 0) + 1; writeAtomic(qFile(n), q); S.pending.add(n); done.push({ name: n, was: m.state });
      logLine(`${id} ${n} ${e.cmd}: ${m.state} -> cancel requested`);
    });
    return done;
  }
  /** the Orders view: newest first; filter = { names: Set | null } */
  function list(filter, limit, now) { S.qmemo = new Map(); try { return listFresh(filter, limit, now); } finally { S.qmemo = null; } }
  function listFresh(filter, limit, now) {
    now = now || Date.now();
    const idx = index().slice().reverse(), out = [];
    for (const x of idx) {
      const names = (x.recipients || []).filter(n => !filter || !filter.names || filter.names.has(n));
      if (!names.length) continue;
      const rs = status(x.id, names, now);
      const agg = rs.some(r => r.pending) ? 'pending' : rs.some(r => r.state === 'running' || r.state === 'acknowledged') ? 'running' : rs.some(r => r.state === 'failed') ? 'failed' : rs.every(r => r.state === 'superseded') ? 'superseded' : rs.every(r => r.state === 'expired') ? 'expired' : rs.every(r => r.state === 'cancelled') ? 'cancelled' : rs.every(r => r.state === 'skipped') ? 'skipped' : 'done';
      out.push({ id: x.id, cmd: x.cmd, at: x.at, label: x.label, targets: x.targets, safety: x.safety, ttlMs: x.ttlMs, until: x.at + (x.ttlMs || OQD.ttlMs), state: agg, recipients: rs });
      if (out.length >= (limit || 50)) break;
    }
    return out;
  }
  function find(id) { return index().find(x => x && x.id === id) || null; }
  return { enabled, add, status, waitAcks, tick, cancel, list, find, win, ensure };
}

module.exports = { OQD, ORDER_RE, TERMINAL, TAKEN, isOrderFor, policy, newId, windowOf, merge, enqueueInto, prune, nudgeDue, create, hm };
