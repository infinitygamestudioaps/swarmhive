// NAV ATLAS PAGE API (2026-10-12, docs/plan/tools/nav_atlas.js). Loaded by server.js (one hook, like kamapage_api.js).
// Public: /navatlas.js + /navatlas.css (the page, no secrets). GET /api/navatlas (key checked here):
//   ?q=<text>[&type=raid|epic|npc|area|room|dungeon][&status=..]  -> { counts, walks, rows: [index rows] (max 80) }
//   ?key=<target key>                                              -> { route }   (the full state machine)
//   ?list=unreachable|blocked                                      -> { rows: [index row + why] }
//   ?doors=1                                                       -> { byKind, timed: [groups with period], blocking: [doors by targets they block],
//                                                                       onRoutes: [doors on most routes], conditions, stats }
//   ?runs=1                                                        -> { runs: the last bot runs (Logs/nav_atlas_runs.log) }
// Reads Scripts/data/nav_atlas (index.json + the type files) and nav_doors.json on demand, re-read when they change.
'use strict';
const fs = require('fs'), path = require('path');
const STATIC = { '/navatlas.js': 'text/javascript; charset=utf-8', '/navatlas.css': 'text/css; charset=utf-8' };
const C = { stamp: 0, idx: null, files: {}, doors: null, doorsStamp: 0, doorSum: null, doorSumKey: '' };
const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, ''));
const mtime = (f) => { try { return fs.statSync(f).mtimeMs; } catch (e) { return 0; } };
function load(DATA) {
  const f = path.join(DATA, 'nav_atlas', 'index.json'), st = mtime(f);
  if (!st) return null;
  if (st !== C.stamp) { try { C.idx = J(f); C.stamp = st; C.files = {}; C.doorSum = null; } catch (e) { C.idx = null; } }
  return C.idx;
}
function typeFile(DATA, f) { if (!C.files[f]) { try { C.files[f] = J(path.join(DATA, 'nav_atlas', f)).routes || {}; } catch (e) { C.files[f] = {}; } } return C.files[f]; }
function routeOf(DATA, key) {
  const idx = load(DATA); if (!idx) return null;
  const row = idx.targets.find(t => t[0] === key); if (!row) return null;
  return typeFile(DATA, row[9])[key] || null;
}
function doorsOf(DATA) {
  const f = path.join(DATA, 'nav_doors.json'), st = mtime(f);
  if (st && st !== C.doorsStamp) { try { C.doors = J(f); C.doorsStamp = st; C.doorSum = null; } catch (e) { C.doors = null; } }
  return C.doors;
}
/** door summary: kinds, timed doors grouped by area/name with their cycle, the doors that block the most atlas targets */
function doorSummary(DATA) {
  const idx = load(DATA), D = doorsOf(DATA); if (!idx || !D) return null;
  const k = C.stamp + ':' + C.doorsStamp; if (C.doorSum && C.doorSumKey === k) return C.doorSum;
  const byId = {}; D.doors.forEach(d => { byId[d.id] = d; });
  const grp = (n) => String(n || '').replace(/[_]?\d+.*$/, '') || String(n);
  const timed = {};
  D.doors.filter(d => d.timed).forEach(d => {
    const g = (d.place && (d.place.dungeon || d.place.region || d.place.town)) || d.area || ('near ' + ((d.place && d.place.nearTown && d.place.nearTown.name) || '?'));
    const key = g + '|' + grp(d.name) + '|' + d.timed.openFor.join('-') + '|' + d.timed.closedFor.join('-');
    const t = timed[key] = timed[key] || { place: g, name: grp(d.name), openFor: d.timed.openFor, closedFor: d.timed.closedFor, periodMin: d.timed.periodMin, periodMax: d.timed.periodMax, doors: [], x: d.x, y: d.y, z: d.z };
    t.doors.push(d.id);
  });
  const block = {}, onRoute = {};
  for (const f of [...new Set(Object.values(idx.files || {}))]) {
    const R = typeFile(DATA, f);
    for (const r of Object.values(R)) {
      const seen = new Set();
      (r.steps || []).filter(s => s.do === 'door').forEach(s => {
        if (seen.has(s.doorId)) return; seen.add(s.doorId);
        const o = onRoute[s.doorId] = onRoute[s.doorId] || { id: s.doorId, name: s.name, kind: s.kind, need: s.need, at: s.at, place: s.place || (byId[s.doorId] || {}).place, n: 0, blocked: 0, examples: [] };
        o.n++; if (s.need && s.need.blocked) o.blocked++; if (o.examples.length < 4) o.examples.push(r.key);
      });
    }
  }
  Object.values(onRoute).filter(o => o.blocked).forEach(o => { block[o.id] = o; });
  const sum = {
    stats: D.stats, byKind: D.stats && D.stats.byKind,
    timed: Object.values(timed).sort((a, b) => b.doors.length - a.doors.length),
    blocking: Object.values(block).sort((a, b) => b.blocked - a.blocked).slice(0, 40),
    onRoutes: Object.values(onRoute).sort((a, b) => b.n - a.n).slice(0, 40),
    conditions: (D.conditions || []).map(c => ({ key: c.key, area: c.area, kind: c.kind, text: c.text, src: c.src, read: c.read, need: c.need })),
    unlock: D.unlock ? { learnedBy: D.unlock.learnedBy, chance: D.unlock.chance, rule: D.unlock.rule } : null,
  };
  C.doorSum = sum; C.doorSumKey = k; return sum;
}
function lastRuns(ROOT) {
  const f = path.join(ROOT, 'Logs', 'nav_atlas_runs.log'); let txt = '';
  try { const st = fs.statSync(f), n = Math.min(st.size, 60000), fd = fs.openSync(f, 'r'), b = Buffer.alloc(n); fs.readSync(fd, b, 0, n, st.size - n); fs.closeSync(fd); txt = b.toString('utf8'); } catch (e) { return []; }
  return txt.split(/\r?\n/).filter(Boolean).slice(-60).reverse().map(l => { const m = l.match(/^(\S+) \[([^\]]+)\] (.*)$/); return m ? { at: m[1], who: m[2], msg: m[3] } : { at: '', who: '', msg: l }; });
}
async function handle(req, res, url, ctx) {
  const p = url.pathname;
  if (STATIC[p]) { try { const b = fs.readFileSync(path.join(ctx.DIR, path.basename(p))); res.writeHead(200, { 'Content-Type': STATIC[p], 'Cache-Control': 'no-cache' }); res.end(b); } catch (e) { res.writeHead(404); res.end(); } return true; }
  if (p !== '/api/navatlas') return false;
  if (!ctx.allowed(req, url)) { ctx.send(res, 401, 'text/plain; charset=utf-8', 'Access denied'); return true; }
  const idx = load(ctx.DATA);
  if (!idx) { ctx.json(res, 200, { error: 'no atlas yet: run node docs/plan/tools/nav_atlas.js' }); return true; }
  const q = url.searchParams;
  if (q.get('key')) { const r = routeOf(ctx.DATA, q.get('key')); ctx.json(res, r ? 200 : 404, r ? { route: r } : { error: 'no route ' + q.get('key') }); return true; }
  if (q.get('doors')) { ctx.json(res, 200, doorSummary(ctx.DATA) || { error: 'no nav_doors.json yet: run node docs/plan/tools/nav_doors.js' }); return true; }
  if (q.get('runs')) { ctx.json(res, 200, { runs: lastRuns(ctx.ROOT || path.resolve(ctx.DATA, '..', '..')) }); return true; }
  if (q.get('list')) {
    const st = q.get('list');
    const rows = idx.targets.filter(t => t[6] === st).slice(0, 2000).map(t => { const r = typeFile(ctx.DATA, t[9])[t[0]]; return t.concat([r ? (r.why || []).join(' · ').slice(0, 400) : '']); });
    ctx.json(res, 200, { rows, cols: idx.cols.concat(['why']) }); return true;
  }
  const text = String(q.get('q') || '').trim().toLowerCase(), type = q.get('type') || '', status = q.get('status') || '';
  const words = text.split(/\s+/).filter(Boolean);
  const rows = idx.targets.filter(t => (!type || t[1] === type) && (!status || t[6] === status) && words.every(w => String(t[2]).toLowerCase().includes(w) || String(t[0]).toLowerCase().includes(w) || String(t[10]) === w)).slice(0, 80);
  ctx.json(res, 200, { generated: idx.generated, counts: idx.counts, walks: idx.walks, cols: idx.cols, rows });
  return true;
}
module.exports = { handle, doorSummary };
