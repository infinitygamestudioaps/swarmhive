// BRAIN HOST — one agent connection (Scripts/agent2.js) seen from the brain (2026-10-12, new engine phase 1; protocol: DESIGN.md §2).
// brain -> agent (one JSON object per line):
//   { a: 'call', id, fn: 'Send.Action' | 'GoToPoint' | 'SayToParty' | ..., args: [...], want?: 1 }   args may hold { $p3: [x,y,z] } (Point3D),
//        { $p2: [x,y] } (Point), { $ent: 'item'|'mob'|'npc'|'char'|'party'|'me'|..., objId, id } (a host object), { $fn: n } (a callback:
//        the agent answers { t: 'cb', id, n, args } when L2Swarm calls it). want=1 -> the agent answers { t: 'res', id, ok, v | err }
//        (a promise result is awaited first: GoToPoint resolves on arrival).
//   { a: 'set', path: 'Options.FollowName', v }       { a: 'watch', kind: 'opt'|'quest'|'appevent'|'packets', key }
//   { a: 'resync' }  (next state report is full)       { a: 'ping', id }
// agent -> brain: hello, st (mirror.js), ev { h: 'OnSay', a: [...] }, ae { name, d }, res, cb, log, pong
'use strict';

// CALL IDS (engine audit #39, 2026-10-12): ids used to restart at 1 on every AgentLink, while the agent keeps answering the ids of the
// previous link (its GoToPoint / FindPath promises and MoveToPoint / UseItem callbacks outlive a reconnect or a pool worker restart), so a
// late answer could resolve or fire a NEWER call with the same small id. Now one counter per module load (= per process / pool worker),
// started at Date.now() * 1000: a new link, a new worker or a new process always hands out ids above every id issued before (as long as
// fewer than 1000 calls are made per millisecond), and a stale answer finds no pending call (counted in st.stale). Still plain numbers, so
// every agent version echoes them unchanged.
let CALL_SEQ = Date.now() * 1000;

class AgentLink {
  constructor(sock, opts) {
    this.o = Object.assign({ log: null, callTimeoutMs: 180000 }, opts || {});
    this.sock = sock; this.pending = new Map(); this.st = { sent: 0, bytesOut: 0, calls: 0, results: 0, cbs: 0, timeouts: 0, dropped: 0, stale: 0 };
    this.watched = { opt: new Set(), quest: new Set(), appevent: new Set(), packets: false };
    this.closed = false;
  }
  connected() { return !this.closed && this.sock && !this.sock.destroyed; }
  write(o) {
    if (!this.connected()) { this.st.dropped++; return false; }
    const line = JSON.stringify(o) + '\n'; this.st.sent++; this.st.bytesOut += line.length;
    this.sock.write(line); return true;
  }
  call(fn, args, want, fns, ack) {
    const id = ++CALL_SEQ; this.st.calls++;
    const hasFns = fns && Object.keys(fns).length > 0;
    const m = { a: 'call', id, fn, args, ts: Date.now() }; if (want) m.want = 1;   // ENGINELAT-2026-10-13: ts = sent (the agent measures brain -> run)
    if (!want && !hasFns) { this.write(m); return undefined; }
    let res, rej; const p = want ? new Promise((a, b) => { res = a; rej = b; }) : null;
    this.pending.set(id, { fn, res, rej, fns: fns || {}, at: Date.now(), want: !!want, ack: !!ack });
    this.write(m);
    return p || undefined;
  }
  set(path, v) { this.write({ a: 'set', path, v }); }
  /** ENGINELAT: an order whose answer says WHEN the agent ran it -> promise { sent, xt, got } (castNow's start window counts from xt) */
  callAck(fn, args) { return this.call(fn, args, true, null, true); }
  watch(kind, key) {
    if (kind === 'packets') { this.watched.packets = !!key; this.write({ a: 'watch', kind, key: !!key }); return; }
    const s = this.watched[kind]; if (!s || s.has(key)) return; s.add(key); this.write({ a: 'watch', kind, key });
  }
  /** after a reconnect: tell the new agent everything the context asked to watch */
  rewatch(from) {
    for (const k of ['opt', 'quest', 'appevent']) from.watched[k].forEach(key => this.watch(k, key));
    if (from.watched.packets) this.watch('packets', true);
  }
  onResult(m) {
    const p = this.pending.get(m.id); if (!p) { this.st.stale++; return; }
    this.st.results++;
    // ENGINELAT ack: { sent (brain), xt (when the agent ran it; an older agent: when its answer came), got (answer here) }
    if (p.want) { if (p.ack) { const got = Date.now(); if (m.ok) p.res({ sent: p.at, xt: Number(m.xt) > 0 ? Number(m.xt) : got, got }); else p.rej(new Error(String(m.err || p.fn + ' failed'))); } else if (m.ok) p.res(m.v); else p.rej(new Error(String(m.err || p.fn + ' failed'))); }
    if (!Object.keys(p.fns).length) this.pending.delete(m.id); else p.answered = true;
  }
  onCallback(m) {
    const p = this.pending.get(m.id); if (!p) { this.st.stale++; return; }
    const f = p.fns[m.n]; this.st.cbs++;
    this.pending.delete(m.id);                     // L2Swarm calls exactly one of success / fail
    if (typeof f === 'function') { try { f.apply(null, m.args || []); } catch (e) { if (this.o.log) this.o.log(`callback of ${p.fn}: ${e && e.message}`); } }
  }
  sweep() {
    const t = Date.now();
    for (const [id, p] of this.pending) if (t - p.at > this.o.callTimeoutMs) { this.pending.delete(id); this.st.timeouts++; if (p.want && !p.answered) p.rej(new Error(p.fn + ': no answer from the agent')); }
  }
  close() {
    this.closed = true;
    for (const p of this.pending.values()) if (p.want && !p.answered) { try { p.rej(new Error('agent disconnected')); } catch (e) { } }
    this.pending.clear();
    try { this.sock.destroy(); } catch (e) { }
  }
}

/** a link that is not connected (context waiting for its agent); remembers watches for the next real link */
class NullLink extends AgentLink {
  constructor() { super(null, {}); this.closed = true; }
  connected() { return false; }
  write() { this.st.dropped++; return false; }
  watch(kind, key) { if (kind === 'packets') this.watched.packets = !!key; else if (this.watched[kind]) this.watched[kind].add(key); }
}

module.exports = { AgentLink, NullLink };
