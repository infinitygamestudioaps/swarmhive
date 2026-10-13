// PERFMON (2026-10-13, owner: "everything runs insanely slowly on the dashboard, it hardly loads at all"): what blocks the dashboard server.
// Writes Logs/dashboard_perf.log (env SWARM_PERF_LOG = another file, e.g. the bench), buffered, flushed every 10 s, rotated at 5 MB:
//   REQ   <iso> <method> <path> <ms> ms <bytes> B <code>        every request slower than 250 ms
//   SUM   <iso> <path> n=<count> p50=<ms> p95=<ms> max=<ms> avgKB=<kB>   per path, once a minute (only paths that were called)
//   LAG   <iso> p50=<ms> p99=<ms> max=<ms> mean=<ms>             event-loop delay over the last minute (perf_hooks.monitorEventLoopDelay)
//   TIMER <iso> <ms> ms <setInterval|setTimeout> <file:line> <name>   a timer callback that ran (synchronously) longer than 100 ms
// install() wraps the global timers (call it BEFORE the server creates its timers); req(req, res) at the start of every request.
// stats() -> the last minute in memory (GET /api/perf).
'use strict';
const fs = require('fs');
const path = require('path');
const { monitorEventLoopDelay } = require('perf_hooks');

const S = { file: null, buf: [], paths: {}, last: null, lag: null, timers: [], installed: false, reqSlowMs: 250, timerSlowMs: 100 };
const now = () => Number(process.hrtime.bigint()) / 1e6;
const iso = () => new Date().toISOString();
function line(s) { S.buf.push(s); if (S.buf.length > 5000) S.buf.splice(0, S.buf.length - 5000); }
function flush() {
  if (!S.file || !S.buf.length) return;
  const txt = S.buf.join('\r\n') + '\r\n'; S.buf = [];
  fs.stat(S.file, (e, st) => {
    const go = () => fs.appendFile(S.file, txt, () => { });
    if (!e && st.size > 5 * 1048576) fs.rename(S.file, S.file + '.1', go); else go();
  });
}
function q(arr, p) { if (!arr.length) return 0; const a = arr.slice().sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(a.length * p))]; }
function minute() {
  const out = {};
  Object.entries(S.paths).forEach(([p, r]) => {
    out[p] = { n: r.ms.length, p50: Math.round(q(r.ms, 0.5)), p95: Math.round(q(r.ms, 0.95)), max: Math.round(Math.max(...r.ms)), avgKB: Math.round(r.bytes / r.ms.length / 102.4) / 10 };
    line(`SUM ${iso()} ${p} n=${out[p].n} p50=${out[p].p50} p95=${out[p].p95} max=${out[p].max} avgKB=${out[p].avgKB}`);
  });
  S.paths = {};
  let lag = null;
  if (S.h) {
    lag = { p50: +(S.h.percentile(50) / 1e6).toFixed(1), p99: +(S.h.percentile(99) / 1e6).toFixed(1), max: +(S.h.max / 1e6).toFixed(1), mean: +(S.h.mean / 1e6).toFixed(1) };
    line(`LAG ${iso()} p50=${lag.p50} p99=${lag.p99} max=${lag.max} mean=${lag.mean}`);
    S.h.reset();
  }
  S.last = { at: iso(), paths: out, lag, timers: S.timers.slice(-20) };
  S.timers = [];
  flush();
}
function where() {
  const st = String(new Error().stack || '').split('\n');
  for (let i = 3; i < st.length; i++) { const m = st[i].match(/([^\\/()\s]+\.js):(\d+)/); if (m && !/perfmon\.js/.test(m[1])) return m[1] + ':' + m[2]; }
  return '?';
}
function wrapTimer(kind, orig) {
  return function (fn, ms, ...args) {
    if (typeof fn !== 'function') return orig.call(this, fn, ms, ...args);
    const at = where(), name = fn.name || '';
    const w = function (...a) {
      const t = now();
      try { return fn.apply(this, a); } finally {
        const d = now() - t;
        if (d >= S.timerSlowMs) { const r = { at: iso(), ms: Math.round(d), kind, where: at, name }; S.timers.push(r); line(`TIMER ${r.at} ${r.ms} ms ${kind} ${at} ${name}`); }
      }
    };
    return orig.call(this, w, ms, ...args);
  };
}
function install(opt) {
  if (S.installed) return; S.installed = true;
  S.file = (opt && opt.file) || process.env.SWARM_PERF_LOG || null;
  try { S.h = monitorEventLoopDelay({ resolution: 20 }); S.h.enable(); } catch (e) { S.h = null; }
  global.setInterval = wrapTimer('setInterval', global.setInterval);
  global.setTimeout = wrapTimer('setTimeout', global.setTimeout);
  const iv = global.setInterval(minute, 60000); if (iv && iv.unref) iv.unref();
  const fl = global.setInterval(flush, 10000); if (fl && fl.unref) fl.unref();
  line(`START ${iso()} pid ${process.pid} node ${process.version}`);
}
function req(rq, rs) {
  const t = now(); let bytes = 0;
  const oEnd = rs.end;
  rs.end = function (c, enc, cb) { if (c && typeof c !== 'function') bytes += Buffer.isBuffer(c) ? c.length : Buffer.byteLength(String(c), typeof enc === 'string' ? enc : 'utf8'); return oEnd.call(this, c, enc, cb); };
  rs.on('finish', () => {
    const ms = now() - t;
    let p = String(rq.url || '').split('?')[0];
    if (/^\/(icons|maptiles|minitile|_inline)\//.test(p)) p = '/' + p.split('/')[1] + '/*';
    const r = S.paths[p] || (S.paths[p] = { ms: [], bytes: 0 }); if (r.ms.length < 20000) { r.ms.push(ms); r.bytes += bytes; }
    if (ms >= S.reqSlowMs) line(`REQ ${iso()} ${rq.method} ${String(rq.url || '').replace(/([?&]key=)[^&]*/, '$1***').slice(0, 200)} ${Math.round(ms)} ms ${bytes} B ${rs.statusCode}`);
  });
}
function stats() {
  const cur = {};
  Object.entries(S.paths).forEach(([p, r]) => { cur[p] = { n: r.ms.length, p50: Math.round(q(r.ms, 0.5)), max: Math.round(Math.max(...r.ms)) }; });
  const lagNow = S.h ? { p50: +(S.h.percentile(50) / 1e6).toFixed(1), p99: +(S.h.percentile(99) / 1e6).toFixed(1), max: +(S.h.max / 1e6).toFixed(1) } : null;
  return { file: S.file, lastMinute: S.last, thisMinute: { paths: cur, lag: lagNow, timers: S.timers.slice(-20) } };
}
module.exports = { install, req, stats, flush };
