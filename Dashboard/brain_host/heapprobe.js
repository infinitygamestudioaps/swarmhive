// BRAIN HOST — opt-in heap probe for one party worker (LEAK-2026-10-15). Nothing runs unless the owner asks for it:
//   Logs/brain_heap_probe.flag  (any content, or JSON { "party": "Tank1" | "*", "snapshot": true, "sizes": true })
//   Each worker checks the flag's write time every 30 s; a NEW write time = one probe per worker (party filter: only that party, "*" / missing
//   = every worker). The probe appends one JSON line per worker to Logs/brain_heap_probe.log: v8 heap statistics + heap spaces, and with
//   "sizes" (default true) per context the 25 biggest top-level containers of swarm.js (entries reachable, see sizer below) — the same
//   measure test_brain_leak.js uses, so a live line can be compared with the next one an hour later to see what keeps growing.
//   "snapshot": true -> also v8.writeHeapSnapshot to Logs/heap_<party>_<yyyymmdd-hhmmss>.heapsnapshot (blocks that worker for seconds: only
//   when the pool tells the worker it pauses its watchdog for it (workerData.busyOk, pool.js LEAK-2026-10-15), otherwise refused + logged).
// Also: heapLine() = the 5-minute HEAP line each worker writes to brain_host.log.
'use strict';
const fs = require('fs'), path = require('path'), v8 = require('v8');

/** top-level bindings of a script: const / let / var at column 0 (all declarators on the line) + top-level function names */
function topNames(src) {
  const out = new Set();
  for (const line of String(src).split('\n')) {
    let m = /^(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/.exec(line);
    if (m) {
      out.add(m[1]);
      let d = 0; const s = line.slice(m[0].length);
      for (let i = 0; i < s.length; i++) {
        const ch = s[i];
        if ('([{'.includes(ch)) d++; else if (')]}'.includes(ch)) d--;
        else if (ch === ',' && d === 0) { const mm = /^,\s*([A-Za-z_$][\w$]*)\s*=/.exec(s.slice(i)); if (mm) out.add(mm[1]); }
        else if (ch === "'" || ch === '"' || ch === '`') { const j = s.indexOf(ch, i + 1); if (j < 0) break; i = j; }
        else if (ch === '/' && s[i + 1] === '/') break;
      }
      continue;
    }
    m = /^(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/.exec(line); if (m) out.add(m[1]);
  }
  return Array.from(out);
}
/** source of a function that runs INSIDE a context: (names, cap) -> JSON { name: entries } (keys / elements / Map + Set entries reachable,
 *  strings count 1 per 64 chars, depth <= 5, at most `cap` per name); functions without own properties are skipped */
const SIZER = `(function (names, cap) {
  cap = cap || 300000; const out = {};
  const sz = (root) => {
    const seen = new Set(); let n = 0; const st = [[root, 0]];
    while (st.length && n < cap) {
      const it = st.pop(), v = it[0], d = it[1]; if (v === null || v === undefined) continue;
      const t = typeof v;
      if (t === 'string') { n += 1 + (v.length >> 6); continue; }
      if (t !== 'object' && t !== 'function') { n++; continue; }
      if (seen.has(v)) continue; seen.add(v); n++;
      if (d >= 5) continue;
      if (t === 'function') { for (const k of Object.keys(v)) st.push([v[k], d + 1]); continue; }
      if (v instanceof Set) { v.forEach(x => st.push([x, d + 1])); continue; }
      if (typeof v.forEach === 'function' && typeof v.get === 'function' && typeof v.has === 'function' && !Array.isArray(v)) { try { v.forEach((x, k) => { st.push([k, d + 1]); st.push([x, d + 1]); }); } catch (e) { } continue; }
      if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) st.push([v[i], d + 1]); continue; }
      let ks; try { ks = Object.keys(v); } catch (e) { continue; }
      for (const k of ks) { let x; try { x = v[k]; } catch (e) { continue; } n += 1 + (k.length >> 6); st.push([x, d + 1]); }
    }
    return n;
  };
  for (const nm of names) { let v; try { v = eval(nm); } catch (e) { continue; } if (typeof v === 'function' && !Object.keys(v).length) continue; try { out[nm] = sz(v); } catch (e) { } }
  return JSON.stringify(out);
})`;

const stamp = (t) => new Date(t).toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
const mb = (b) => +(Number(b || 0) / 1048576).toFixed(1);

/** one line for brain_host.log: heap used / total, contexts, MB per context */
function heapLine(nCtx) {
  const h = v8.getHeapStatistics();
  return `HEAP used ${mb(h.used_heap_size)} MB / total ${mb(h.total_heap_size)} MB, external ${mb(h.external_memory)} MB, ${nCtx} contexts (${nCtx ? mb(h.used_heap_size / nCtx) : 0} MB each), native contexts ${h.number_of_native_contexts}, detached ${h.number_of_detached_contexts}`;
}

/**
 * start the flag watcher in a worker.
 * o: { party, root, runner (Runner), log(line), busy(ms) -> bool (the pool pauses its watchdog), every (30000), vm }
 * returns { stop(), probeNow(req) } (probeNow for tests)
 */
function startProbe(o) {
  const vm = o.vm || require('vm');
  const flag = path.join(o.root, 'Logs', 'brain_heap_probe.flag'), out = path.join(o.root, 'Logs', 'brain_heap_probe.log');
  let lastM = 0; try { lastM = fs.statSync(flag).mtimeMs; } catch (e) { }   // an old flag does not fire at worker start
  let names = null, busy = false;
  const sizesOf = (C, cap) => {
    if (!names) { try { names = topNames(fs.readFileSync(o.runner.o.script, 'utf8')); } catch (e) { names = []; } }
    try { const j = JSON.parse(vm.runInContext(SIZER, C.ctx)(names, cap || 100000)); return Object.entries(j).sort((a, b) => b[1] - a[1]).slice(0, 25); } catch (e) { return [['(error) ' + e.message, 0]]; }
  };
  async function probeNow(req) {
    if (busy) return null; busy = true;
    try {
      const t = Date.now(), h = v8.getHeapStatistics();
      const rec = { at: new Date(t).toISOString(), party: o.party, heap: { used: mb(h.used_heap_size), total: mb(h.total_heap_size), limit: mb(h.heap_size_limit), external: mb(h.external_memory), malloced: mb(h.malloced_memory), nativeContexts: h.number_of_native_contexts, detachedContexts: h.number_of_detached_contexts },
        spaces: v8.getHeapSpaceStatistics().map(s => ({ n: s.space_name, used: mb(s.space_used_size) })), contexts: [] };
      const ctxs = Array.from(o.runner.ctxs.values());
      for (const C of ctxs) {
        const c = { name: C.name, timers: C.timers && C.timers.count ? C.timers.count() : null, pending: C.link && C.link.pending ? C.link.pending.size : 0, appSubs: 0 };
        try { const m = o.runner.bus.members.get(C.accountId); c.appSubs = m && m.subs ? m.subs.size : 0; } catch (e) { }
        try { c.aeSubs = C.host && C.host.appEvents ? C.host.appEvents.size : undefined; } catch (e) { }
        if (req.sizes !== false) { const t1 = Date.now(); c.top = sizesOf(C, req.cap); c.ms = Date.now() - t1; await new Promise(r => setImmediate(r)); }   // one context per turn: the heartbeat keeps going
        rec.contexts.push(c);
      }
      rec.ms = Date.now() - t;
      if (req.snapshot) {
        if (o.busy && o.busy(180000)) {
          await new Promise(r => setTimeout(r, 300));                   // let the 'busy' message reach main before the thread blocks
          const f = path.join(o.root, 'Logs', `heap_${o.party}_${stamp(Date.now())}.heapsnapshot`);
          const t1 = Date.now(); try { rec.snapshot = v8.writeHeapSnapshot(f); rec.snapshotMs = Date.now() - t1; } catch (e) { rec.snapshot = 'failed: ' + e.message; }
          o.busy(0);
        } else rec.snapshot = 'refused: this pool does not pause its watchdog for a snapshot yet (needs the pool restart that loads pool.js LEAK-2026-10-15)';
      }
      try { fs.appendFileSync(out, JSON.stringify(rec) + '\n'); } catch (e) { }
      if (o.log) o.log(`heap probe: used ${rec.heap.used} MB, ${ctxs.length} contexts, ${rec.ms} ms${rec.snapshot ? ', snapshot ' + rec.snapshot : ''} -> Logs/brain_heap_probe.log`);
      return rec;
    } finally { busy = false; }
  }
  const iv = setInterval(() => {
    let m = 0; try { m = fs.statSync(flag).mtimeMs; } catch (e) { return; }
    if (m === lastM) return; lastM = m;
    let req = {}; try { const s = fs.readFileSync(flag, 'utf8').trim(); if (s.startsWith('{')) req = JSON.parse(s); } catch (e) { }
    if (req.party && req.party !== '*' && String(req.party).toLowerCase() !== String(o.party).toLowerCase()) return;
    probeNow(req).catch(e => { if (o.log) o.log('heap probe failed: ' + (e && e.message)); });
  }, o.every || 30000);
  if (iv.unref) iv.unref();
  return { stop: () => clearInterval(iv), probeNow };
}

module.exports = { topNames, SIZER, heapLine, startProbe };
