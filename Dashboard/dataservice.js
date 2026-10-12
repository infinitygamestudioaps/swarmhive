// DATA SERVICE (2026-10-12, user: "start step 1" — one central place for the big data instead of 59 copies, one per script engine).
// A local TCP server (127.0.0.1:8092): one JSON request per line, one JSON answer per line (ASCII only: every non-ASCII char is \u-escaped,
// so the engines can decode any chunk on its own). Step 1a = the transport test (ping / echo) the engines' probe in swarm.js uses; the data
// lookups come next, once the probe shows the round trip is fast and stable with ~60 engines.
// Run: node Dashboard/dataservice.js   (or started by Dashboard/server.js).  Log: Logs/dataservice.log
'use strict';
const net = require('net'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.L2S_DATA_PORT || 8092);
const LOG = path.join(ROOT, 'Logs', 'dataservice.log');
const log = (m) => { try { fs.appendFileSync(LOG, `${new Date().toISOString()} ${m}\r\n`); } catch (e) { } };
const ascii = (s) => s.replace(/[\u0080-￿]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
const stats = { started: Date.now(), conns: 0, reqs: 0, byOp: {}, errors: 0 };

const OPS = {
  ping: (q) => ({ ok: true, t: Date.now(), echo: q.id || null }),
  echo: (q) => ({ ok: true, data: 'x'.repeat(Math.max(0, Math.min(5e6, Number(q.n) || 0))) }),   // bandwidth test
  stats: () => ({ ok: true, stats }),
};

// ------------------------------------------------------------------ SLIM DATA (step 1+2, 2026-10-12)
// The script engines (one per character, ~59) each parsed the same big data files (measured: ~400 MB of JSON text in 5 min). The service
// builds small files ONCE in Scripts/data/slim/ and rebuilds them when the source changes (checked every 60 s); swarm.js reads the slim
// file when it is at least as new as its source, else the original (so a stale / missing slim file never changes behaviour).
const DATA = path.join(ROOT, 'Scripts', 'data'), SLIM = path.join(DATA, 'slim');
const readJ = (f) => JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, ''));
const mtime = (f) => { try { return fs.statSync(f).mtimeMs; } catch (e) { return 0; } };
function writeAtomic(f, obj) { fs.mkdirSync(path.dirname(f), { recursive: true }); const t = f + '.tmp' + process.pid; fs.writeFileSync(t, JSON.stringify(obj)); fs.renameSync(t, f); }
const SLIMS = [
  { name: 'dungeons', src: ['dungeon_rooms.json'], out: 'dungeons/_index.json', build: () => {
    // per dungeon: the header (everything but floors) in the index, the floors in dungeons/<i>.json (loaded by swarm.js on first use)
    const D = readJ(path.join(DATA, 'dungeon_rooms.json')); const arr = Array.isArray(D) ? D : Object.values(D);
    const index = arr.map((d, i) => { const h = Object.assign({}, d); delete h.floors; writeAtomic(path.join(SLIM, 'dungeons', `${i}.json`), d.floors || []); h._floorsFile = `${i}.json`; h._floors = (d.floors || []).length; return h; });
    return index; } },
  { name: 'npc_levels', src: ['npcs_h5.json'], out: 'npc_levels.json', build: () => {
    const j = readJ(path.join(DATA, 'npcs_h5.json')), o = {};
    for (const [k, v] of Object.entries(j)) if (/Monster/.test(v.ty || '')) o[k] = v.l;
    return o; } },
  { name: 'dawn_priests', src: ['npc_atlas.json'], out: 'dawn_priests.json', build: () => {
    const j = readJ(path.join(DATA, 'npc_atlas.json'));
    return (j.npcs || []).filter(n => (n.roles || []).includes('priest of dawn')).map(n => ({ id: n.id, name: n.name, x: n.x, y: n.y, z: n.z, roles: n.roles, place: n.place || null })); } },
];
const slimState = {};
function buildSlims(force) {
  for (const s of SLIMS) {
    try {
      const srcT = Math.max(...s.src.map(f => mtime(path.join(DATA, f)))), outF = path.join(SLIM, s.out);
      if (!srcT) continue;
      if (!force && mtime(outF) >= srcT) continue;
      const t0 = Date.now(), out = s.build(); writeAtomic(outF, out);
      slimState[s.name] = { builtAt: new Date().toISOString(), ms: Date.now() - t0, bytes: fs.statSync(outF).size };
      log(`slim ${s.name}: rebuilt in ${Date.now() - t0} ms -> ${s.out} (${fs.statSync(outF).size} bytes)`);
    } catch (e) { stats.errors++; log(`slim ${s.name}: ${e.message}`); }
  }
}
buildSlims(process.argv.includes('--force'));
setInterval(() => buildSlims(false), 60000);
OPS.slims = () => ({ ok: true, slims: slimState });

const srv = net.createServer((sock) => {
  stats.conns++;
  let buf = '';
  sock.setEncoding('utf8');
  sock.on('data', (chunk) => {
    buf += chunk;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1);
      let out;
      try {
        const q = JSON.parse(line); const op = String(q.op || '');
        stats.reqs++; stats.byOp[op] = (stats.byOp[op] || 0) + 1;
        out = OPS[op] ? OPS[op](q) : { ok: false, error: 'unknown op ' + op };
      } catch (e) { stats.errors++; out = { ok: false, error: String(e.message || e) }; }
      sock.write(ascii(JSON.stringify(out)) + '\n');
    }
  });
  sock.on('error', () => { });
});
srv.on('error', (e) => { log('server error: ' + e.message); if (e.code === 'EADDRINUSE') process.exit(2); });
srv.listen(PORT, '127.0.0.1', () => log(`listening on 127.0.0.1:${PORT} (pid ${process.pid})`));
setInterval(() => log(`stats: ${stats.conns} connections, ${stats.reqs} requests ${JSON.stringify(stats.byOp)}, ${stats.errors} errors`), 600000);
