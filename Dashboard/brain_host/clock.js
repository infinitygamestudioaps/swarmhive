// BRAIN HOST — clock + timers for swarm.js contexts (2026-10-12, new engine phase 1).
// Real mode (live): Node timers, tracked per context so a context can be disposed without leaking callbacks.
// Virtual mode (simulator): one shared virtual clock; timers fire in due order when the test calls clock.advance(ms). Each fired callback is
// followed by a macrotask turn (setImmediate) so promise chains, async functions and socket I/O of every context run in between.
// L2Swarm semantics kept: setTimeout/setInterval return NUMBERS (L2Timer ids; swarm.js's SCHED wraps setInterval and hands out 'sj<n>'
// strings itself), clearTimeout/clearInterval ignore unknown ids, callbacks get the extra arguments.
'use strict';

class Clock {
  constructor(opts) {
    const o = Object.assign({ virtual: false, start: Date.now() }, opts || {});
    this.virtual = !!o.virtual;
    this.t = o.start;
    this.seq = 0;
    this.q = [];                 // virtual: [{ id, due, fn, args, every, owner, dead }]
    this.byId = new Map();
    this.fired = 0;
  }
  now() { return this.virtual ? this.t : Date.now(); }
  /** a timer API bound to one owner (context); owner.dispose() clears all of its timers */
  forOwner(name, onError, invoke) {
    const clock = this, mine = new Set();
    // invoke (phase 2, optional): the runner's guarded call (per-callback vm timeout / watchdog marker); without it = a plain call
    const wrap = (fn, args) => invoke ? () => { try { invoke(fn, args); } catch (e) { if (onError) onError(e); } } : () => { try { fn.apply(null, args); } catch (e) { if (onError) onError(e); } };
    const add = (fn, ms, args, every) => {
      if (typeof fn !== 'function') return 0;
      const id = ++clock.seq; ms = Math.max(every ? 1 : 0, Number(ms) || 0);
      if (clock.virtual) {
        const tm = { id, due: clock.t + ms, fn: wrap(fn, args), every: every ? ms : 0, owner: name, dead: false, ms };
        clock.q.push(tm); clock.byId.set(id, tm);
      } else {
        const h = every ? setInterval(wrap(fn, args), ms) : setTimeout(() => { mine.delete(id); clock.byId.delete(id); wrap(fn, args)(); }, ms);
        if (h && h.unref && clock.unref) h.unref();
        clock.byId.set(id, { h, every });
      }
      mine.add(id); return id;
    };
    const clear = (id) => {
      const n = typeof id === 'number' ? id : Number(id);
      if (!mine.has(n)) return;
      mine.delete(n);
      const tm = clock.byId.get(n); clock.byId.delete(n);
      if (!tm) return;
      if (clock.virtual) tm.dead = true; else (tm.every ? clearInterval : clearTimeout)(tm.h);
    };
    return {
      setTimeout: (fn, ms, ...args) => add(fn, ms, args, false),
      setInterval: (fn, ms, ...args) => add(fn, ms, args, true),
      clearTimeout: clear, clearInterval: clear,
      count: () => mine.size,
      dispose: () => { Array.from(mine).forEach(clear); },
    };
  }
  /** virtual: run every timer due within the next `ms`, in order; yields a macrotask turn after each callback */
  async advance(ms, opts) {
    if (!this.virtual) { await new Promise(r => setTimeout(r, ms)); return; }
    const until = this.t + ms, turn = () => new Promise(r => setImmediate(r));
    const maxPerTurn = (opts && opts.maxPerTurn) || 1e9;
    let n = 0;
    for (;;) {
      let best = null;
      for (let i = 0; i < this.q.length; i++) { const tm = this.q[i]; if (!tm.dead && tm.due <= until && (!best || tm.due < best.due || (tm.due === best.due && tm.id < best.id))) best = tm; }
      if (!best) break;
      if (best.due > this.t) this.t = best.due;
      if (best.every) best.due += best.every; else { best.dead = true; this.byId.delete(best.id); }
      this.fired++; n++;
      best.fn();
      if (n % 20 === 0 || n >= maxPerTurn) { await turn(); }
      if (this.q.length > 5000) this.q = this.q.filter(t => !t.dead);
    }
    this.t = until;
    await turn(); await turn();
    this.q = this.q.filter(t => !t.dead);
  }
}

/** a Date class whose now() / new Date() follow the clock (virtual mode); real mode = the plain Date */
function makeDate(clock) {
  if (!clock.virtual) return Date;
  const RD = Date;
  function D(...a) {
    if (!new.target) return new RD(clock.now()).toString();
    return a.length === 0 ? new RD(clock.now()) : new RD(...a);
  }
  D.now = () => clock.now();
  D.parse = RD.parse; D.UTC = RD.UTC;
  D.prototype = RD.prototype;
  return D;
}

module.exports = { Clock, makeDate };
