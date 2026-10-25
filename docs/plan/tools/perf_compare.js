// PERF COMPARE (user 2026-10-12: "How can you compare if you have no monitoring running?!"): compares L2Swarm runs side by side by MINUTES
// SINCE START, from the logs that are always written: Logs/memwatch.log (every 2 min: L2Swarm private memory, PC free), Logs/LOG.log
// (L2Swarm ExecutionWatchdog "ran JS for N ms" = a blocked script engine), Logs/perf_samples.jsonl (Dashboard/server.js every 2 min:
// characters reporting, timer lag median / p90 / max, data parsed per 5 min).
// Run: node docs/plan/tools/perf_compare.js "2026-10-12 08:22" "2026-10-12 10:24" [minutes=60]  -> table + docs/plan/perf_compare.md
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const starts = process.argv.slice(2).filter(a => /^\d{4}-\d\d-\d\d/.test(a)).map(s => new Date(s.replace(' ', 'T')).getTime());
const span = Number(process.argv.slice(2).find(a => /^\d+$/.test(a))) || 60;
if (starts.length < 1) { console.log('usage: perf_compare.js "<start 1>" "<start 2>" ... [minutes]'); process.exit(1); }
const lines = (f) => { try { return fs.readFileSync(path.join(ROOT, 'Logs', f), 'utf8').split(/\r?\n/); } catch (e) { return []; } };
const mem = lines('memwatch.log').map(l => { const m = /^(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d) \w+\s+L2Swarm private=(\d+)MB.*pcFree=(\d+)MB/.exec(l); return m ? { t: new Date(m[1].replace(' ', 'T')).getTime(), mb: +m[2], free: +m[3] } : null; }).filter(Boolean);
const wd = lines('LOG.log').map(l => { const m = /^(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d)\.\d+(?:[+-]\d\d:\d\d)? .*ran JS for (\d+) ms/.exec(l); return m ? { t: new Date(m[1].replace(' ', 'T')).getTime(), ms: +m[2] } : null; }).filter(Boolean);
const smp = lines('perf_samples.jsonl').map(l => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean).map(s => Object.assign(s, { t: Date.parse(s.at) }));
const buckets = [5, 10, 15, 20, 30, 45, 60, 90, 120].filter(m => m <= span);
const near = (arr, t) => { let b = null, bd = 6 * 60000; for (const x of arr) { const d = Math.abs(x.t - t); if (d < bd) { bd = d; b = x; } } return b; };
const L = ['# L2Swarm runs compared by minutes since start', '', `Generated ${new Date().toISOString()} by docs/plan/tools/perf_compare.js`, ''];
const head = ['min'].concat(starts.map(s => new Date(s).toTimeString().slice(0, 5)));
const rows = { mem: [], free: [], wd: [], lag: [], rep: [], parsed: [] };
for (const m of buckets) {
  const r = (k, f) => rows[k].push([m].concat(starts.map(s => { const t = s + m * 60000; if (t > Date.now()) return '-'; return f(t, s); })));
  r('mem', (t) => { const x = near(mem, t); return x ? x.mb + ' MB' : '?'; });
  r('free', (t) => { const x = near(mem, t); return x ? x.free + ' MB' : '?'; });
  r('wd', (t, s) => { const n = wd.filter(x => x.t > s + 2 * 60000 && x.t <= t).length; return String(n); });   // the first 2 min = shutdown of the old run
  r('lag', (t) => { const x = near(smp, t); return x ? `${x.lagMed}/${x.lagP90}/${x.lagMax}` : '?'; });
  r('rep', (t) => { const x = near(smp, t); return x ? `${x.reporting}/${x.chars}` : '?'; });
  r('parsed', (t) => { const x = near(smp, t); return x && x.parsedMB !== null ? x.parsedMB + ' MB' : '?'; });
}
const tbl = (title, k) => { L.push(`## ${title}`, '', '| ' + head.join(' | ') + ' |', '|' + head.map(() => '---').join('|') + '|'); rows[k].forEach(r => L.push('| ' + r.join(' | ') + ' |')); L.push(''); };
tbl('L2Swarm private memory', 'mem'); tbl('PC free memory', 'free'); tbl('Blocked script engines (watchdog, cumulative)', 'wd');
tbl('Timer lag ms (median / p90 / max)', 'lag'); tbl('Characters reporting', 'rep'); tbl('Big data parsed (all characters, last 5 min)', 'parsed');
fs.writeFileSync(path.join(ROOT, 'docs', 'plan', 'perf_compare.md'), L.join('\n'));
console.log(L.join('\n'));
