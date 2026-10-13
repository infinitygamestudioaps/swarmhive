// DASHBOARD PERF BENCH (2026-10-13, owner: "everything runs insanely slowly on the dashboard"): loads Dashboard/server.js IN-PROCESS like
// test_cmdcenter_server.js (mock MCP, no timers / child processes, random local port, real Logs + Scripts/data read-only) and times the
// endpoints the page polls. Never touches the game or the live dashboard (8090).
//   node docs/plan/tools/bench_dashboard.js [rounds=5] [--gzip] [--paths=/api/state,/]
// Prints per path: first (cold) ms, median warm ms, bytes. Use it before / after a server.js change.
'use strict';
const path = require('path');
const fs = require('fs');
const http = require('http');
const cp = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const args = process.argv.slice(2);
const ROUNDS = +(args.find(a => /^\d+$/.test(a)) || 5);
const GZ = args.includes('--gzip');
const PATHS = ((args.find(a => a.startsWith('--paths=')) || '').slice(8) || '/,/api/state,/api/runstate,/api/circuit/live,/api/live?party=Tank1,/api/raidhunt,/api/system,/api/intent?name=Tank1,/ui_kit.js,/charpage.js').split(',');

process.env.SWARM_CMD_DIR = fs.mkdtempSync(path.join(require('os').tmpdir(), 'swarm_bench_'));
process.env.SWARM_PERF_LOG = path.join(process.env.SWARM_CMD_DIR, 'dashboard_perf.log');   // never the live Logs/dashboard_perf.log
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opt = {}) => {
  const u = String(url);
  if (/:8083\b/.test(u)) {
    const b = JSON.parse(opt.body || '{}');
    const result = b.method === 'initialize' ? { protocolVersion: '2025-03-26', capabilities: {} } : { content: [{ type: 'text', text: b.params && b.params.name === 'get_accounts_status' ? '[]' : '{"success":true,"mock":true}' }] };
    const txt = JSON.stringify({ jsonrpc: '2.0', id: b.id, result });
    return { headers: { get: () => null }, text: async () => txt, json: async () => JSON.parse(txt) };
  }
  if (/:809\d\b/.test(u)) throw new Error('bench: no live dashboard / brain calls: ' + u);
  return realFetch(url, opt);
};
const timers = { setInterval: global.setInterval, setTimeout: global.setTimeout };
global.setInterval = () => ({ unref() { }, ref() { } }); global.setTimeout = () => ({ unref() { }, ref() { } });
cp.fork = () => ({ on() { }, kill() { }, send() { }, connected: false });
cp.spawn = () => ({ on() { }, kill() { }, send() { }, removeAllListeners() { }, connected: false, pid: 0 });
cp.execFile = (cmd, a, opt, cb) => { const f = typeof opt === 'function' ? opt : cb; if (f) process.nextTick(() => f(null, '', '')); return { on() { } }; };
const realAppend = fs.appendFileSync;
fs.appendFileSync = (f, d, o) => { if (/[\\/]Logs[\\/]/.test(String(f))) return; return realAppend(f, d, o); };   // no writes into the live Logs
let PORT = 0;
const realCreate = http.createServer;
http.createServer = (h) => { const s = realCreate(h); const L = s.listen.bind(s); s.listen = (p, host, cb) => L(0, '127.0.0.1', () => { PORT = s.address().port; if (typeof host === 'function') host(); else if (cb) cb(); }); return s; };
const realLog = console.log; console.log = () => { };
const t0 = Date.now();
require(path.join(ROOT, 'Dashboard', 'server.js'));
const loadMs = Date.now() - t0;
console.log = realLog;
global.setInterval = timers.setInterval; global.setTimeout = timers.setTimeout;

const get = (p) => new Promise((resolve, reject) => {
  const st = process.hrtime.bigint();
  const r = http.request({ host: '127.0.0.1', port: PORT, path: p, method: 'GET', headers: GZ ? { 'accept-encoding': 'gzip' } : {} }, (res) => {
    let n = 0; res.on('data', c => n += c.length); res.on('end', () => resolve({ code: res.statusCode, ms: Number(process.hrtime.bigint() - st) / 1e6, bytes: n }));
  });
  r.on('error', reject); r.end();
});
(async () => {
  for (let i = 0; i < 100 && !PORT; i++) await new Promise(r => timers.setTimeout(r, 50));
  console.log(`bench: server.js loaded in ${loadMs} ms, port ${PORT}, ${ROUNDS} rounds${GZ ? ', gzip' : ''}`);
  for (const p of PATHS) {
    const runs = [];
    for (let i = 0; i < ROUNDS; i++) runs.push(await get(p));
    const warm = runs.slice(1).map(r => r.ms).sort((a, b) => a - b);
    const med = warm.length ? warm[Math.floor(warm.length / 2)] : runs[0].ms;
    console.log(`${p.padEnd(32)} ${String(runs[0].code).padEnd(4)} cold ${runs[0].ms.toFixed(0).padStart(6)} ms   warm median ${med.toFixed(0).padStart(6)} ms   ${runs[runs.length - 1].bytes} B`);
  }
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
