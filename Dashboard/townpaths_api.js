// TOWN PATHS API (user 2026-10-12: "On the map there is a blue line showing all the paths they can run to reach their target - why not in
// Giran? It works in Heine." + "I want to be able to see ALL computed paths in ALL towns on the maps.").
// Loaded by server.js (one hook, like navatlas_api.js). Read-only; never writes anything.
// Public: /townpaths.js (the map layer module, no secrets). GET /api/townpaths (key checked here):
//   ?list=1                    -> { towns: [{ key, town, box:[x0,x1,y0,y1], z:[z0,z1], center:[x,y], npcs, edges }] }   (small: for "is a town in view?")
//   ?town=<key | name>         -> one town (below)
//   ?x=&y=[&z=]                -> the town whose box holds the point, else the nearest one within 8000 (404 when none)
// One town: { key, town, box, z, built, lines: [[x,y, x,y, ...] per street edge, simplified], doors: [[x,y]], arrive: [[x,y,label]],
//   npcs: [{ id, n, t, role, x, y, fx, fy }] (fx/fy = the walkable spot in front of it), stats, giran?: { start:[x,y], routes:[{ name, npc, from, pts:[[x,y]..] }] } }
// Sources: Scripts/data/town_graph/<key>.json (docs/plan/tools/town_graph.js: every street the bots can walk = the "blue" network),
// Scripts/data/giran_routes.json (Giran: the bots walk ONLY these recorded routes, so its street graph is never published as a route),
// Scripts/data/npc_atlas.json (titles / roles). Cached by file mtime; gzipped by Dashboard/compress.js like every JSON answer.
'use strict';
const fs = require('fs'), path = require('path');
const STATIC = { '/townpaths.js': 'text/javascript; charset=utf-8' };
const C = { idx: null, idxStamp: 0, towns: {}, atlas: null, atlasStamp: 0 };
const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, ''));
const mtime = (f) => { try { return fs.statSync(f).mtimeMs; } catch (e) { return 0; } };

/** Douglas-Peucker on [[x,y]..] (tolerance in game units) */
function simplify(P, tol) {
  if (P.length <= 2) return P;
  const a = P[0], b = P[P.length - 1], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
  let md = 0, mi = 0;
  for (let i = 1; i < P.length - 1; i++) { const d = Math.abs(dy * P[i][0] - dx * P[i][1] + b[0] * a[1] - b[1] * a[0]) / L; if (d > md) { md = d; mi = i; } }
  if (md <= tol) return [a, b];
  return simplify(P.slice(0, mi + 1), tol).slice(0, -1).concat(simplify(P.slice(mi), tol));
}
function index(DATA) {
  const f = path.join(DATA, 'town_graph', 'index.json'), st = mtime(f);
  if (!st) return null;
  if (st !== C.idxStamp) { try { C.idx = J(f); C.idxStamp = st; } catch (e) { C.idx = null; } }
  return C.idx;
}
function atlasById(DATA) {
  const f = path.join(DATA, 'npc_atlas.json'), st = mtime(f);
  if (st && st !== C.atlasStamp) {
    try { const A = J(f), m = {}; (A.npcs || []).forEach(n => { m[n.id + '@' + n.x + ',' + n.y] = n; if (!m[n.id]) m[n.id] = n; }); C.atlas = m; C.atlasStamp = st; } catch (e) { C.atlas = {}; }
  }
  return C.atlas || {};
}
const ROLE = (n) => {
  const r = ((n && n.roles) || []).join(' ') + ' ' + ((n && n.title) || '');
  return /gatekeeper|teleporter/i.test(r) ? 'gk' : /merchant|grocer|trader|warehouse|blacksmith|seller|auctioneer/i.test(r) ? 'shop' : /guard/i.test(r) ? 'guard' : 'npc';
};
function findTown(DATA, q) {
  const I = (index(DATA) || {}).towns || [];
  if (q.town != null) {
    const n = String(q.town).toLowerCase().replace(/^town-/, '').trim();
    return I.find(t => t.key === n || String(t.town).toLowerCase() === n) || I.find(t => String(t.town).toLowerCase().startsWith(n) && n.length >= 3) || null;
  }
  const x = +q.x, y = +q.y, z = q.z != null && q.z !== '' ? +q.z : NaN;
  if (!isFinite(x) || !isFinite(y)) return null;
  let best = null, bd = 8000;
  I.forEach(t => {
    const b = t.box; if (!b) return;
    const dx = Math.max(b[0] - x, 0, x - b[1]), dy = Math.max(b[2] - y, 0, y - b[3]);
    let d = Math.hypot(dx, dy);
    if (isFinite(z) && t.z && (z < t.z[0] - 1500 || z > t.z[1] + 1500)) d += 6000;   // another floor / far below (a cave under the town)
    if (d < bd || (d === 0 && bd === 0 && best && Math.hypot((b[0] + b[1]) / 2 - x, (b[2] + b[3]) / 2 - y) < Math.hypot((best.box[0] + best.box[1]) / 2 - x, (best.box[2] + best.box[3]) / 2 - y))) { bd = d; best = t; }
  });
  return best;
}
function townData(DATA, ti) {
  const f = path.join(DATA, 'town_graph', ti.key + '.json'), gf = path.join(DATA, 'giran_routes.json');
  const stamp = mtime(f) + ':' + (ti.key === 'giran' ? mtime(gf) : 0) + ':' + C.atlasStamp;
  const c = C.towns[ti.key]; if (c && c.stamp === stamp) return c.d;
  let T; try { T = J(f); } catch (e) { return null; }
  const A = atlasById(DATA), V = T.v || [], seen = new Set(), lines = [];
  (T.e || []).forEach(e => {
    const a = V[e[0]], b = V[e[1]]; if (!a || !b) return;
    const k = Math.min(e[0], e[1]) + '-' + Math.max(e[0], e[1]); if (seen.has(k)) return; seen.add(k);
    const P = [[a[1], a[2]]]; const w = e[4] || [];
    for (let i = 0; i + 1 < w.length; i += 3) P.push([w[i], w[i + 1]]);
    P.push([b[1], b[2]]);
    const S = simplify(P, 16), flat = [];
    S.forEach(p => flat.push(Math.round(p[0]), Math.round(p[1])));
    lines.push(flat);
  });
  const npcs = [];
  Object.keys(T.npcs || {}).forEach(k => {
    const v = V[T.npcs[k]], m = k.match(/^(\d+)@(-?\d+),(-?\d+)$/); if (!m) return;
    const at = A[k] || A[+m[1]] || null;
    npcs.push({ id: +m[1], n: (at && at.name) || (v && v[6]) || ('#' + m[1]), t: (at && at.title) || '', role: ROLE(at), x: +m[2], y: +m[3], fx: v ? v[1] : +m[2], fy: v ? v[2] : +m[3] });
  });
  const d = { key: T.key || ti.key, town: T.town || ti.town, box: T.box || ti.box, z: T.z || ti.z, built: T.built || null, lines, npcs,
    doors: V.filter(v => v[5] === 'door').map(v => [v[1], v[2]]), arrive: V.filter(v => v[5] === 'arrive').map(v => [v[1], v[2], v[6] || v[0]]),
    unreachable: (T.unreachable || []).length, stats: ti.stats || T.stats || null };
  if (ti.key === 'giran') {
    // Giran: the bots walk ONLY the recorded routes (user rule), so these are the paths they really run there
    try {
      const G = J(gf), R = G.routes || {};
      d.giran = { start: G.start ? [G.start[0], G.start[1]] : null,
        routes: Object.keys(R).map(name => ({ name, npc: R[name].npc || '', npc2: R[name].npc2 || '', from: R[name].from || 'start', pts: (R[name].points || []).filter(p => Array.isArray(p) && isFinite(p[0])).map(p => [Math.round(p[0]), Math.round(p[1])]) })).filter(r => r.pts.length >= 2) };
    } catch (e) { d.giran = { start: null, routes: [], error: 'giran_routes.json unreadable' }; }
  }
  C.towns[ti.key] = { stamp, d };
  return d;
}
async function handle(req, res, url, ctx) {
  const p = url.pathname;
  if (STATIC[p]) { try { const b = fs.readFileSync(path.join(ctx.DIR, path.basename(p))); res.writeHead(200, { 'Content-Type': STATIC[p], 'Cache-Control': 'no-cache' }); res.end(b); } catch (e) { res.writeHead(404); res.end(); } return true; }
  if (p !== '/api/townpaths') return false;
  if (!ctx.allowed(req, url)) { ctx.send(res, 401, 'text/plain; charset=utf-8', 'Access denied'); return true; }
  const I = index(ctx.DATA);
  if (!I) { ctx.json(res, 200, { error: 'no town graphs yet: run node docs/plan/tools/town_graph.js', towns: [] }); return true; }
  const q = url.searchParams;
  if (q.get('list')) {
    ctx.json(res, 200, { built: I.built || null, towns: (I.towns || []).map(t => ({ key: t.key, town: t.town, box: t.box, z: t.z, center: t.box ? [Math.round((t.box[0] + t.box[1]) / 2), Math.round((t.box[2] + t.box[3]) / 2)] : null,
      npcs: (t.stats || {}).npcs || 0, edges: (t.stats || {}).edges || 0, giran: t.key === 'giran' })) });
    return true;
  }
  const ti = findTown(ctx.DATA, { town: q.has('town') ? q.get('town') : null, x: q.get('x'), y: q.get('y'), z: q.get('z') });
  if (!ti) { ctx.json(res, 404, { error: q.has('town') ? 'unknown town ' + q.get('town') : 'no town near that point' }); return true; }
  atlasById(ctx.DATA);
  const d = townData(ctx.DATA, ti);
  if (!d) { ctx.json(res, 404, { error: 'town graph unreadable: ' + ti.key }); return true; }
  ctx.json(res, 200, d);
  return true;
}
module.exports = { handle, townData, findTown, simplify };
