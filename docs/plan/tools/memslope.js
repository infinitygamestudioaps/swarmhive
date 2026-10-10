// memslope.js - read-only memory slope report (memory investigation 2026-10-09).
// node docs/plan/tools/memslope.js [sinceLocal "2026-10-09 14:30"] [bucketMin 10]
// Prints per bucket: managed heap MIN/MAX (threadpool.log heap=, Tank1's window, ~ live set at the min), private/working set (memsample CSV),
// census headers (l2swarm_mem.log), runtime_flags changes (flags log if present), and a least-squares slope of the managed minima + private.
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..'), LOGS = path.join(ROOT, 'Logs');
const since = process.argv[2] ? Date.parse(process.argv[2].replace(' ', 'T')) : Date.now() - 3 * 3600e3;
const until = process.argv[4] ? Date.parse(process.argv[4].replace(' ', 'T')) : Date.now() + 60e3;
const bucket = (Number(process.argv[3]) || 10) * 60e3;
const local = (t) => { const d = new Date(t); const p = (n) => String(n).padStart(2, '0'); return `${p(d.getHours())}:${p(d.getMinutes())}`; };
const B = {};
const b = (t) => { const k = Math.floor(t / bucket) * bucket; return B[k] || (B[k] = { t: k, hmin: Infinity, hmax: 0, priv: [], ws: [], gc2: null, notes: [] }); };
try {
  for (const l of fs.readFileSync(path.join(LOGS, 'threadpool.log'), 'utf8').split('\n')) {
    const m = l.match(/^(\S+Z) \[Tank1\].*gc0\/1\/2=(\d+)\/(\d+)\/(\d+).*heap=(\d+)MB/); if (!m) continue;
    const t = Date.parse(m[1]); if (t < since || t > until) continue;
    const x = b(t), h = +m[5]; x.hmin = Math.min(x.hmin, h); x.hmax = Math.max(x.hmax, h); x.gc2 = +m[4];
  }
} catch (e) { }
try {
  for (const f of fs.readdirSync(LOGS).filter(n => /^memsample_.*\.csv$/.test(n))) for (const l of fs.readFileSync(path.join(LOGS, f), 'utf8').split('\n')) {
    const c = l.split(','); if (c.length < 9 || !/^\d{4}-/.test(c[0])) continue;
    const t = Date.parse(c[0].replace(' ', 'T')); if (t < since || t > until || !c[2]) continue;
    const x = b(t); x.priv.push(+c[2]); x.ws.push(+c[3]);
  }
} catch (e) { }
try {
  for (const l of fs.readFileSync(path.join(LOGS, 'l2swarm_mem.log'), 'utf8').split('\n')) {
    const m = l.match(/^(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d)\.\d+ census (#\d+): private (\d+) MB, managed (\d+) MB.*timers (\d+)/); if (!m) continue;
    const t = Date.parse(m[1].replace(' ', 'T')); if (t < since || t > until) continue;
    b(t).notes.push(`census${m[2]} priv ${m[3]} man ${m[4]} timers ${m[5]}`);
  }
} catch (e) { }
try {
  for (const l of fs.readFileSync(path.join(LOGS, 'memflags.log'), 'utf8').split('\n')) {
    const m = l.match(/^(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d) (.*)$/); if (!m) continue;
    const t = Date.parse(m[1].replace(' ', 'T')); if (t < since || t > until) continue; b(t).notes.push('FLAG ' + m[2]);
  }
} catch (e) { }
const rows = Object.values(B).sort((a, c) => a.t - c.t);
const med = (a) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
console.log('time   managedMin managedMax  privMed  wsMed  gen2  notes');
for (const r of rows) console.log(`${local(r.t)}  ${String(isFinite(r.hmin) ? r.hmin : '-').padStart(9)} ${String(r.hmax || '-').padStart(10)}  ${String(med(r.priv) || '-').padStart(7)} ${String(med(r.ws) || '-').padStart(6)}  ${String(r.gc2 ?? '-').padStart(4)}  ${r.notes.join(' | ')}`);
const fit = (pts) => { if (pts.length < 3) return NaN; const n = pts.length, mx = pts.reduce((s, p) => s + p[0], 0) / n, my = pts.reduce((s, p) => s + p[1], 0) / n;
  let sxy = 0, sxx = 0; pts.forEach(p => { sxy += (p[0] - mx) * (p[1] - my); sxx += (p[0] - mx) ** 2; }); return sxx ? sxy / sxx * 3600e3 : NaN; };
const ms = fit(rows.filter(r => isFinite(r.hmin)).map(r => [r.t, r.hmin])), ps = fit(rows.filter(r => r.priv.length).map(r => [r.t, med(r.priv)]));
console.log(`slope (least squares over ${rows.length} buckets): managed min ${Math.round(ms)} MB/h, private ${Math.round(ps)} MB/h`);
