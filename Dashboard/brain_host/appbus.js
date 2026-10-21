// BRAIN HOST — App.on / App.emit / App.emitTo between swarm.js contexts inside the brain (2026-10-12, new engine phase 1).
// Same rules as L2Swarm's App bridge (docs/js-api/app-cross-account.txt): broadcasts skip the sender's own account, data is JSON
// (rebuilt inside the receiver's realm, 64 KiB limit, BigInt / circular -> throws at the sender), delivery is asynchronous and FIFO per
// receiver, only connected accounts emit/receive, the envelope is { id, name, sentAtUtc, source: { accountId, characterName, scriptId,
// scriptName }, data }.
// Phase 2 (2026-10-12, all optional, defaults = phase-1 behaviour):
//   onOut(env, target, fromAccountId): called for every emit AFTER local delivery (broadcast: target null) and for an emitTo whose target is
//     not a local member. The worker pool uses it to reach contexts in other workers, the L2Swarm bridge to re-emit inside L2Swarm.
//   inject(env, only): deliver an envelope that came from elsewhere (another worker / L2Swarm through agent2) to the local members:
//     only = one accountId (emitTo / one bridging agent) or null (broadcast: everybody except env.source.accountId).
'use strict';

class AppBus {
  constructor(opts) {
    this.o = Object.assign({ maxBytes: 65536, schedule: (f) => setImmediate(f), log: null }, opts || {});
    this.members = new Map();            // accountId -> { accountId, name, scriptId, scriptName, connected(), parse(json), subs: Map(token -> {name, cb}), queue: [], busy }
    this.seq = 0; this.st = { emits: 0, delivered: 0, dropped: 0, errors: 0, bytes: 0, out: 0, injected: 0, rekeys: 0 };
    // ACCOUNT ID CHANGES (engine audit #21/#30/#36, 2026-10-12): L2Swarm account ids are runtime ids (a new one after an L2Swarm restart or an
    // account close/open), while a brain context lives on through its agent's reconnect. rekey(old, new) moves the member to the new id and
    // keeps old -> new as an alias: App.self() / envelope sources of that context say the NEW id from then on, and an emitTo(oldId) that
    // another context still holds is delivered to it. The api() closures resolve their id through the aliases on every call.
    this.alias = new Map();              // old accountId -> newer accountId
    this.onOut = this.o.onOut || null;
  }
  join(m) { this.alias.delete(m.accountId); this.members.set(m.accountId, Object.assign({ subs: new Map(), queue: [], busy: false }, m)); }
  leave(accountId) {
    accountId = this.resolve(accountId); this.members.delete(accountId);
    for (const [a] of Array.from(this.alias)) if (this.resolve(a) === accountId || !this.members.has(this.resolve(a))) this.alias.delete(a);
  }
  /** the current id of an account id that may be an old one (alias chain, cycle-safe) */
  resolve(accountId) { let a = String(accountId), n = 0; while (this.alias.has(a) && !this.members.has(a) && n++ < 16) a = this.alias.get(a); return a; }
  /** a member's account id changed (its agent reconnected with a new runtime id): move it, keep the old id as an alias */
  rekey(oldId, newId) {
    oldId = String(oldId); newId = String(newId); const m = this.members.get(this.resolve(oldId)); if (!m || oldId === newId) return false;
    const cur = m.accountId; this.members.delete(cur); m.accountId = newId; this.members.set(newId, m);
    this.alias.delete(newId); if (cur !== newId) this.alias.set(cur, newId); if (oldId !== cur && oldId !== newId) this.alias.set(oldId, newId);
    this.st.rekeys++; return true;
  }
  aliasesOf(accountId) { const cur = this.resolve(accountId), out = []; for (const a of this.alias.keys()) if (a !== cur && this.resolve(a) === cur) out.push(a); return out; }
  api(accountId0) {
    const bus = this;
    const me = () => bus.members.get(bus.resolve(accountId0));
    const idNow = () => { const m = me(); return m ? m.accountId : String(accountId0); };
    const check = (name) => { if (typeof name !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(name)) throw new Error(`App: invalid event name '${name}'`); };
    // SMOOTH-2026-10-20: swarm.pos sends the SAME data object to ~30 targets in one loop (App.emitTo per target, every 3 s per character):
    // the JSON text, its byte check, the clock text and the source block are made once per (name, data object) within the same synchronous
    // turn and reused (cleared in a microtask, so a later emit of a mutated object is serialised again). Each envelope keeps its own id.
    let memo = null;
    const pack = (name, data) => {
      check(name);
      let json, sentAtUtc, source;
      if (memo && memo.name === name && memo.data === data && data !== null && typeof data === 'object') { json = memo.json; sentAtUtc = memo.sentAtUtc; source = memo.source; bus.st.packReused = (bus.st.packReused || 0) + 1; }
      else {
        json = JSON.stringify(data === undefined ? null : data);   // BigInt / circular -> TypeError, as in L2Swarm
        if ((json.length > bus.o.maxBytes / 3 ? Buffer.byteLength(json, 'utf8') : json.length) > bus.o.maxBytes) throw new Error(`App: payload of '${name}' is larger than 64 KiB`);
        const m = me();
        sentAtUtc = new Date().toISOString();
        source = { accountId: idNow(), characterName: m ? m.name : '', scriptId: m ? m.scriptId : '', scriptName: m ? m.scriptName : 'swarm.js' };
        if (data !== null && typeof data === 'object') { const first = !memo; memo = { name, data, json, sentAtUtc, source }; if (first) queueMicrotask(() => { memo = null; }); }
      }
      return { id: `b${Date.now().toString(36)}${(++bus.seq).toString(36)}`, name, sentAtUtc, source, json };
    };
    return {
      on(name, cb) { check(name); if (typeof cb !== 'function') throw new Error('App.on: callback must be a function'); const m = me(); if (!m) return ''; const tok = `app:${accountId0}:${++bus.seq}`; m.subs.set(tok, { name, cb }); return tok; },
      off(token) { const m = me(); return !!(m && m.subs.delete(String(token))); },
      emit(name, data) { const m = me(); if (!m || !m.connected()) return; const accountId = m.accountId; const env = pack(name, data); bus.st.emits++; for (const r of bus.members.values()) if (r.accountId !== accountId) bus.deliver(r, env); bus.out(env, null, accountId); },
      emitTo(target, name, data) {
        const m = me(); if (!m || !m.connected()) return; const accountId = m.accountId; const env = pack(name, data); bus.st.emits++; const r = bus.members.get(bus.resolve(target));
        // a member that is here but NOT connected (its agent is gone: e.g. the character was rolled back to swarm.js inside L2Swarm, same
        // account id) is handed to onOut too, so the brain bridge can reach that account inside L2Swarm (engine audit #22/#31)
        const to = r ? r.accountId : String(target);
        if (r && r.accountId !== accountId && r.connected()) bus.deliver(r, env); else if (bus.onOut && to !== accountId) bus.out(env, to, accountId); else bus.st.dropped++;
      },
      self() { const m = me(); return { accountId: idNow(), characterName: m ? m.name : '', scriptId: m ? m.scriptId : '', scriptName: m ? m.scriptName : 'swarm.js', connected: !!(m && m.connected()) }; },
    };
  }
  out(env, target, from) { if (!this.onOut) return; this.st.out++; try { this.onOut(env, target, from); } catch (e) { this.st.errors++; if (this.o.log) this.o.log(`App out ${env.name}: ${e && e.message}`); } }
  /** an envelope from outside this bus ({ id, name, sentAtUtc, source, json }); only = deliver to that member alone */
  inject(env, only) {
    if (!env || typeof env.name !== 'string' || typeof env.json !== 'string') return 0;
    let n = 0;
    if (only) { const r = this.members.get(this.resolve(only)); if (r && r.accountId !== (env.source && env.source.accountId)) { this.deliver(r, env); n++; } }
    else for (const r of this.members.values()) if (r.accountId !== (env.source && env.source.accountId)) { this.deliver(r, env); n++; }
    this.st.injected += n; return n;
  }
  has(accountId) { return this.members.has(this.resolve(accountId)); }
  member(accountId) { return this.members.get(this.resolve(accountId)) || null; }
  deliver(r, env) {
    if (!r.connected()) { this.st.dropped++; return; }
    let any = false; for (const s of r.subs.values()) if (s.name === env.name) { any = true; break; }
    if (!any) return;
    r.queue.push(env); this.st.bytes += env.json.length;
    if (r.busy) return;
    r.busy = true;
    this.o.schedule(() => this.drain(r));
  }
  // SMOOTH-2026-10-20: the envelope text is built once per event (was: JSON.stringify + regex replace once per subscriber), and one drain
  // runs at most sliceMs before it yields (setImmediate) so a burst of App events cannot hold the thread (heartbeat / brain pings) for seconds.
  drain(r) {
    const t0 = Date.now(), slice = this.o.sliceMs || 20;
    while (r.queue.length) {
      const env = r.queue.shift();
      let subs = null; for (const s of r.subs.values()) if (s.name === env.name) (subs || (subs = [])).push(s);
      if (subs) {
        const text = envText(env);
        for (const s of subs) {
          let e;
          try { e = r.parse(text); }
          catch (er) { this.st.errors++; continue; }
          try { if (r.invoke) r.invoke(s.cb, [e]); else s.cb(e); this.st.delivered++; } catch (er) { this.st.errors++; if (this.o.log) this.o.log(`App ${env.name} -> ${r.name}: ${er && er.message}`); }
        }
      }
      if (r.queue.length && Date.now() - t0 >= slice) { this.st.yields = (this.st.yields || 0) + 1; this.o.schedule(() => this.drain(r)); return; }
    }
    r.busy = false;
  }
}
/** the envelope as JSON text with the payload text spliced in: { id, name, sentAtUtc, source, data } (same order / shape as before) */
function envText(env) {
  let s = '{';
  for (const k of ['id', 'name', 'sentAtUtc', 'source']) { const v = env[k]; if (v === undefined || typeof v === 'function') continue; s += JSON.stringify(k) + ':' + JSON.stringify(v) + ','; }   // undefined fields left out, as JSON.stringify does
  return s + '"data":' + env.json + '}';
}

module.exports = { AppBus };
