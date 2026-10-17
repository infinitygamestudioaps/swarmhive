// 3D VIEW (owner 2026-10-17: "show a live view of the game from the game data, geodata and map art, generated in the browser ... see if someone
// goes off a cliff ... command a character to move by clicking the world"). This module only serves the GROUND: the geodata heights around a
// point (docs/plan/tools/geopath.js reads Geodata/*.l2j), the layer chosen by following the ground outward from the character (stacked dungeon
// floors / bridges: never a jump to the floor above), plus the walk bits (walls). The page (Dashboard/view3d.js) draws it with three.js and puts
// the live characters / monsters / NPCs on it from the APIs the dashboard already has.
//   GET /api/view3d/terrain?x=&y=&z=&r=&step=  ->  { x0, y0, step, n, z, h: base64 Int16 (n*n, row = y), w: base64 Uint8 nswe, ms }
//   h = -32768 = no ground there (outside the world / no floor near this one)
const path = require('path');
let GP = null;
function geo(ctx) { if (!GP) GP = require(path.join(ctx.ROOT, 'docs', 'plan', 'tools', 'geopath.js')); return GP; }
const HOLE = -32768;
const fs = require('fs');
// the page + its 3D library (public, no secrets); the vendor files are cached (they never change)
const STATIC = { '/view3d.js': ['view3d.js', 'application/javascript; charset=utf-8', 'no-cache'], '/view3d.css': ['view3d.css', 'text/css; charset=utf-8', 'no-cache'], '/l2model.js': ['l2model.js', 'application/javascript; charset=utf-8', 'no-cache'],
  '/vendor/three.module.min.js': ['vendor/three.module.min.js', 'application/javascript; charset=utf-8', 'public, max-age=604800'], '/vendor/OrbitControls.js': ['vendor/OrbitControls.js', 'application/javascript; charset=utf-8', 'public, max-age=604800'] };
/** the ground grid: n x n cells of `step` units around (x, y), following the layers outward from height z (breadth first, each cell takes the
 *  layer nearest its parent's height, a step up / down of more than `maxJump` = no link) */
function terrain(G, x, y, z, r, step, opts) {
  const n = Math.max(8, Math.min(320, Math.round((2 * r) / step)));
  const x0 = Math.round(x - (n * step) / 2), y0 = Math.round(y - (n * step) / 2);
  const h = new Int16Array(n * n).fill(HOLE), w = new Uint8Array(n * n), seen = new Uint8Array(n * n);
  const maxJump = Math.max(200, step * 6);
  const pick = (i, j, refZ) => {
    const ls = G.layers(G.toGeoX(x0 + i * step), G.toGeoY(y0 + j * step));
    if (!ls || !ls.length) return null;
    let best = null, bd = 1e9;
    ls.forEach(l => { const d = Math.abs(l.h - refZ); if (d < bd) { bd = d; best = l; } });
    return best && bd <= maxJump ? best : null;
  };
  const c = Math.floor(n / 2), q = [c * n + c];
  // underground (z < -5000: catacombs, Cruma, caves) or standing on stacked floors (ToI, buildings): never the surface / another floor
  const under = z < -5000 || ((G.layers(G.toGeoX(x), G.toGeoY(y)) || []).length > 1);
  let first = pick(c, c, z);
  if (!first) { const ls = G.layers(G.toGeoX(x0 + c * step), G.toGeoY(y0 + c * step)); if (ls && ls.length) first = ls.reduce((a, b) => Math.abs(b.h - z) < Math.abs(a.h - z) ? b : a); }
  if (!first) return { x0, y0, step, n, h, w };
  h[q[0]] = first.h; w[q[0]] = first.nswe; seen[q[0]] = 1;
  for (let qi = 0; qi < q.length; qi++) {
    const k = q[qi], i = k % n, j = (k - i) / n, ref = h[k];
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= n || b >= n) continue;
      const kk = b * n + a; if (seen[kk]) continue;
      const l = pick(a, b, ref); if (!l) continue;
      // STACKED FLOORS (owner 2026-10-17, ToI screenshot: stairs + walls looked wrong): never follow stairs into the floor above / below
      if (under && Math.abs(l.h - z) > 400) continue;
      seen[kk] = 1; h[kk] = l.h; w[kk] = l.nswe; q.push(kk);
    }
  }
  // cells no path reached (other side of a wall / a gap): the layer nearest the character's height, when it is close to it
  // (one layer only = open ground: a cliff, take it; several = stacked floors: only the one near the character's height)
  for (let k = 0; k < n * n; k++) if (!seen[k]) {
    const i = k % n, j = (k - i) / n, ls = G.layers(G.toGeoX(x0 + i * step), G.toGeoY(y0 + j * step));
    if (!ls || !ls.length) continue;
    const l = ls.length === 1 ? ls[0] : ls.reduce((p, q2) => Math.abs(q2.h - z) < Math.abs(p.h - z) ? q2 : p);
    if ((ls.length === 1 && !under) || Math.abs(l.h - z) < (under ? 250 : 800)) { h[k] = l.h; w[k] = l.nswe; }
  }
  // TREES / POSTS (owner 2026-10-17: "trees are not rendered with correct models"): the walk data stores a tree trunk as a tall pillar of
  // ground; outdoors a cell far above most of its 5x5 neighbours is flattened to their middle height (the real trees come with the buildings)
  if (!under) {
    const src = Int16Array.from(h), win = [];
    for (let j = 2; j < n - 2; j++) for (let i = 2; i < n - 2; i++) {
      const k = j * n + i; if (src[k] === HOLE) continue;
      win.length = 0;
      for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) { const v = src[k + dj * n + di]; if (v !== HOLE) win.push(v); }
      if (win.length < 12) continue;
      win.sort((a, b) => a - b);
      const med = win[win.length >> 1], high = win.filter(v => v - med > 100).length;
      if (src[k] - med > 100 && high <= 9) h[k] = med;
    }
  }
  // TOWNS WITH REAL BUILDINGS (owner 2026-10-17, Giran: "walls that do not exist in the game ... pillars of the church"): the walk data stores
  // building walls / pillars as raised ground; where the real building models are drawn (flat=1) every cell more than 120 above the low ground
  // of its 9x9 neighbourhood (its 20 % height) is lowered to it - the buildings themselves show the shapes
  if (!under && opts && opts.flat) {
    const src = Int16Array.from(h), win = [];
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const k = j * n + i; if (src[k] === HOLE) continue;
      win.length = 0;
      for (let dj = -8; dj <= 8; dj += 2) for (let di = -8; di <= 8; di += 2) { const a = i + di, b2 = j + dj; if (a < 0 || b2 < 0 || a >= n || b2 >= n) continue; const v = src[b2 * n + a]; if (v !== HOLE) win.push(v); }
      if (win.length < 12) continue;
      win.sort((p, q) => p - q);
      const low = win[Math.floor(win.length * 0.1)];
      if (src[k] - low > 120) h[k] = low;
    }
  }
  return { x0, y0, step, n, h, w };
}
// REPLAY (step 2): every 2 s one frame of every character (position, HP / MP, dead, the current cast, the target position, party), the last
// 10 min in memory (~59 characters x 300 frames, compact arrays). GET /api/view3d/history?since=<ms> -> { frames: [{ t, c: [[...]] }] }
//   c row = [name, x, y, z, hp, mp, dead 0/1, cast name | '', cast target | '', cast ms, cast start ms, target x | null, target y | null, party, level, class]
const HIST = { frames: [], timer: null, keepMs: 600000 };
const LIVE = {};
function startRecorder(readStates) {
  if (HIST.timer) return;
  HIST.timer = setInterval(() => {
    try {
      const t = Date.now(), c = [];
      (readStates() || []).forEach(s => {
        if (s.x == null || s.ageSec > 120) return;
        const k = s.cast && !s.cast.ended ? s.cast : null, st = k ? Date.parse(k.start) || 0 : 0;
        c.push([s.name, Math.round(s.x), Math.round(s.y), Math.round(s.z || 0), s.hp == null ? null : Math.round(s.hp), s.mp == null ? null : Math.round(s.mp), s.dead ? 1 : 0,
          k && t - st < (Number(k.ms) || 0) + 1500 ? String(k.name || '') : '', k ? String(k.target || '') : '', k ? Number(k.ms) || 0 : 0, st,
          s.tpos && s.tpos.x != null ? Math.round(s.tpos.x) : null, s.tpos && s.tpos.y != null ? Math.round(s.tpos.y) : null, s.party || '', s.level || null, s.cls || '']);
      });
      HIST.frames.push({ t, c });
      while (HIST.frames.length && t - HIST.frames[0].t > HIST.keepMs) HIST.frames.shift();
    } catch (e) { }
  }, 2000);
  if (HIST.timer.unref) HIST.timer.unref();
}
async function handle(req, res, url, ctx) {
  const st = STATIC[url.pathname];
  if (st) { res.writeHead(200, { 'Content-Type': st[1], 'Cache-Control': st[2] }); res.end(fs.readFileSync(path.join(ctx.DIR || __dirname, st[0]))); return true; }
  if (!url.pathname.startsWith('/api/view3d/')) return false;
  if (!ctx.allowed(req, url)) { ctx.send(res, 401, 'text/plain; charset=utf-8', 'Access denied'); return true; }
  if (url.pathname === '/api/view3d/terrain') {
    const q = (k, d) => { const v = Number(url.searchParams.get(k)); return isFinite(v) && url.searchParams.get(k) !== null ? v : d; };
    const x = q('x', NaN), y = q('y', NaN), z = q('z', 0);
    if (!isFinite(x) || !isFinite(y)) { ctx.json(res, 400, { error: 'x and y needed' }); return true; }
    const r = Math.max(500, Math.min(6000, q('r', 3000))), step = Math.max(16, Math.min(128, Math.round(q('step', 32) / 16) * 16));
    const t0 = Date.now();
    try {
      const T = terrain(geo(ctx), x, y, z, r, step, { flat: url.searchParams.get('flat') === '1' });
      ctx.json(res, 200, { x0: T.x0, y0: T.y0, step: T.step, n: T.n, z, h: Buffer.from(T.h.buffer).toString('base64'), w: Buffer.from(T.w.buffer).toString('base64'), ms: Date.now() - t0 });
    } catch (e) { ctx.json(res, 500, { error: e.message }); }
    return true;
  }
  // LIVE (owner 2026-10-17: "can it update faster when in live 3D?"): the state files are written every 2 s; L2Swarm knows the party and the
  // monsters around NOW: one MCP read of each per character per 0.5 s, shared by every viewer (?name=<character>)
  if (url.pathname === '/api/view3d/live') {
    const name = String(url.searchParams.get('name') || '');
    if (!name || !ctx.mcpCallChar) { ctx.json(res, 400, { error: 'name needed' }); return true; }
    const L = LIVE[name] || (LIVE[name] = { at: 0, d: null, p: null });
    if (Date.now() - L.at > 500 && !L.p) {
      const parse = (t) => { try { return JSON.parse(t); } catch (e) { return null; } };
      L.p = Promise.all([ctx.mcpCallChar('get_account_data', name, { type: 'party' }).catch(() => ''), ctx.mcpCallChar('get_account_data', name, { type: 'mobs', range: 4000 }).catch(() => '')])
        .then(([p, m]) => {
          const pj = parse(p), mj = parse(m);
          const party = (pj && pj.members ? pj.members : []).map(x => ({ name: x.name, x: x.x, y: x.y, z: x.z, hp: x.hp_percent, mp: x.mp_percent, dead: !!x.is_dead, lvl: x.level, cls: x.class_name, fight: !!x.is_in_combat, sit: !!x.is_sitting }));
          const mobs = (Array.isArray(mj) ? mj : []).map(x => ({ id: x.obj_id, n: x.name, x: x.x, y: x.y, z: x.z, hp: x.max_hp > 0 ? x.hp_percent : null, dead: !!x.is_dead, lvl: x.level || +((String(x.title || '').match(/LvL:\s*(\d+)/) || [])[1]) || null, agg: / A$/.test(String(x.title || '')) }));
          L.d = { at: Date.now(), party, mobs }; L.at = Date.now(); L.p = null;
        }).catch(() => { L.p = null; L.at = Date.now(); });
    }
    if (!L.d && L.p) await L.p;
    ctx.json(res, 200, L.d || { at: 0, party: [], mobs: [] });
    return true;
  }
  if (url.pathname === '/api/view3d/scene') {   // BOSS SCENE 2026-10-17 (Dashboard/bossscene.js)
    try { ctx.json(res, 200, require('./bossscene').scene({ DATA: path.join(ctx.ROOT, 'Scripts', 'data') }, +url.searchParams.get('boss'))); } catch (e) { ctx.json(res, 500, { error: e.message }); }
    return true;
  }
  if (url.pathname === '/api/view3d/history') {
    const since = Number(url.searchParams.get('since')) || 0;
    ctx.json(res, 200, { now: Date.now(), keepMs: HIST.keepMs, frames: HIST.frames.filter(f => f.t > since) });
    return true;
  }
  ctx.json(res, 404, { error: 'unknown view3d call' });
  return true;
}
module.exports = { handle, terrain, HOLE, startRecorder, HIST };
