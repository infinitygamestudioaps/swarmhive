// SAFE SPOTS in dungeon corridors (user 2026-10-08 18:12: "It should also add 'safe' spots in corridors where there are no monsters").
// For every floor of Scripts/data/dungeon_rooms.json this writes
//   floor.safeSpots = [{ id, name, x, y, z, clearance, monsterClear, roomClear, nearRooms: [{ id, walk }], tier }]
// = walkable geodata points OUTSIDE every room polygon, far from every monster spawn of that height band (>= 1200 and >= the monster's
// aggro range + 300 for aggressive ones, Scripts/data/aggro_h5.json), with some room to stand (>= 48 from a wall), reachable on foot
// from the rooms. A few per floor: every room gets the safe spot nearest to it (walking distance, max 12000); spots closer than 700 to each
// other are merged. When a room has no spot that clears 1200 within reach, a 'tight' spot (>= 900, still outside aggro + 150) is used.
// Used by swarm.js (escape: a lone character CCs the monster, runs to the nearest safe spot, then .townname / Scroll of Escape) — the
// field name `safeSpots` is fixed. Drawn as green shields on the room check images (docs/plan/room_polys) and the dashboard room maps.
//
// Use: node safe_spots.js [--only cruma,sacrifice] [--dry]     (also called by room_polys.js after the polygons)
const fs = require('fs'), path = require('path'), cp = require('child_process');
const geo = require('./geopath');
const RP = require('./room_polys');
const ROOT = path.join(__dirname, '..', '..', '..');
const DATA = path.join(ROOT, 'Scripts', 'data');
const OUTDIR = path.join(ROOT, 'docs', 'plan', 'room_polys');
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, ''));
const CELL = 16, WX0 = -294912, WY0 = -262144;

function floorSafeSpots(d, F, fi, ctx) {
  const rooms = (F.rooms || []).filter(r => r.center);
  if (!rooms.length) return [];
  const { spawns, NPC, AGGRO } = ctx;
  const zBand = [F.z[0] - 250, F.z[1] + 250];
  const B = d.bbox, xs = rooms.map(r => r.center[0]), ys = rooms.map(r => r.center[1]);
  const box = [Math.max(B[0] - 1500, Math.min(...xs) - 4000), Math.min(B[1] + 1500, Math.max(...xs) + 4000), Math.max(B[2] - 1500, Math.min(...ys) - 4000), Math.min(B[3] + 1500, Math.max(...ys) + 4000)];
  // every monster of this height band (not only the rooms' ones: raid bosses, wanderers)
  const mobs = spawns.filter(s => { const n = NPC[s.id]; return n && n.ty === 'L2Monster' && s.x >= box[0] - 3000 && s.x <= box[1] + 3000 && s.y >= box[2] - 3000 && s.y <= box[3] + 3000 && s.z >= F.z[0] - 400 && s.z <= F.z[1] + 400; })
    .map(s => { const ag = AGGRO[(NPC[s.id] || {}).n]; return { x: s.x, y: s.y, z: s.z, need: Math.max(1200, ag ? ag + 300 : 0), tight: Math.max(900, ag ? ag + 150 : 0) }; });
  const entry = (F.entryPoint && F.entryPoint.at) || (F.enter && (F.enter.landing || F.enter.from)) || null;
  const seeds = rooms.map(r => ({ x: r.center[0], y: r.center[1], z: r.center[2] }))
    .concat(entry && entry[2] >= zBand[0] && entry[2] <= zBand[1] ? [{ x: entry[0], y: entry[1], z: entry[2] }] : []);
  const G = ctx.G || RP.buildFloor(box, zBand, seeds);
  const D = ctx.D || RP.clearance(G);
  const cx = (i) => (G.gx0 + (i % G.w)) * CELL + WX0 + 8, cy = (i) => (G.gy0 + ((i / G.w) | 0)) * CELL + WY0 + 8;
  // spatial hash of the monsters
  const HS = 2000, hash = new Map();
  mobs.forEach(m => { const k = Math.floor(m.x / HS) + ':' + Math.floor(m.y / HS); (hash.get(k) || hash.set(k, []).get(k)).push(m); });
  const mobInfo = (x, y) => { let best = 1e9, ok = true, okT = true; const gx = Math.floor(x / HS), gy = Math.floor(y / HS);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) (hash.get((gx + a) + ':' + (gy + b)) || []).forEach(m => { const dd = Math.hypot(m.x - x, m.y - y); if (dd < best) best = dd; if (dd < m.need) ok = false; if (dd < m.tight) okT = false; });
    return { best, ok, okT }; };
  const polys = rooms.filter(r => r.poly && r.poly.length >= 3);
  const roomDist = (x, y) => Math.min(1e9, ...polys.map(r => RP.inPoly(x, y, r.poly) ? -1 : Math.min(...r.poly.map((p, i) => { const q = r.poly[(i + 1) % r.poly.length]; const dx = q[0] - p[0], dy = q[1] - p[1], L = dx * dx + dy * dy; let t = L ? ((x - p[0]) * dx + (y - p[1]) * dy) / L : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(x - p[0] - t * dx, y - p[1] - t * dy); }))));
  // candidates: every 4th cell (64 units), standing room >= 3 cells from a wall, outside the rooms (+150), clear of the monsters
  const cand = new Map();     // cell -> { tier, mc, rc }
  for (let y = 0; y < G.h; y += 4) for (let x = 0; x < G.w; x += 4) {
    const i = y * G.w + x; if (!G.OK[i] || D[i] < 30) continue;
    const wx = cx(i), wy = cy(i); const mi = mobInfo(wx, wy); if (!mi.okT) continue;
    const rc = roomDist(wx, wy); if (rc < 150) continue;
    cand.set(i, { tier: mi.ok ? 'safe' : 'tight', mc: Math.round(mi.best), rc: Math.round(rc), wall: D[i] / 10 * CELL });
  }
  if (!cand.size) return [];
  // for every room: the nearest candidate by walking distance (first 'safe', else 'tight'), max 6000
  const pick = (tier) => {
    const src = []; cand.forEach((v, i) => { if (tier === 'any' || v.tier === tier) src.push(i); });
    if (!src.length) return null;
    // labelled Dijkstra from all candidates at once: every cell learns its nearest candidate
    const lab = new Int32Array(G.n).fill(-1), dist = new Float64Array(G.n).fill(Infinity), q = [];
    src.forEach(i => { lab[i] = i; dist[i] = 0; q.push(i); });
    // BFS-ish (4 neighbours, unit cost) is enough for "nearest" (cap 12000 / 16 = 750 cells)
    for (let h = 0; h < q.length; h++) { const i = q[h]; if (dist[i] >= 750) continue;
      for (let k = 0; k < 4; k++) { const j = RP.nbOpen(G, i, k); if (j >= 0 && dist[j] === Infinity) { dist[j] = dist[i] + 1; lab[j] = lab[i]; q.push(j); } } }
    return { lab, dist };
  };
  const P1 = pick('safe'), P2 = pick('any');
  const chosen = new Map();   // cell -> [{ id, walk }]
  rooms.forEach((r, k) => {
    // the room centre (may sit in a pillar): the nearest walkable cell of this floor within 160
    let si = -1, bd = 1e9; const gx0 = geo.toGeoX(r.center[0]) - G.gx0, gy0 = geo.toGeoY(r.center[1]) - G.gy0;
    for (let dy = -10; dy <= 10; dy++) for (let dx = -10; dx <= 10; dx++) { const x = gx0 + dx, y = gy0 + dy; if (x < 0 || y < 0 || x >= G.w || y >= G.h) continue; const j = y * G.w + x; if (!G.OK[j] || Math.abs(G.H[j] - r.center[2]) > 400) continue; const dd = dx * dx + dy * dy; if (dd < bd) { bd = dd; si = j; } }
    if (si < 0) return;
    // a fully safe spot unless it is more than 4000 away AND a 'tight' one is less than half as far
    const dS = P1 && P1.lab[si] >= 0 ? P1.dist[si] * CELL : Infinity, dA = P2 && P2.lab[si] >= 0 ? P2.dist[si] * CELL : Infinity;
    const use = dS === Infinity && dA === Infinity ? null : (dS <= 4000 || dA * 2 > dS) && dS !== Infinity ? P1 : P2;
    if (!use) return;
    const c = use.lab[si]; (chosen.get(c) || chosen.set(c, []).get(c)).push({ id: r.id, walk: Math.round(use.dist[si] * CELL) });
  });
  // merge spots closer than 700 (keep the one farther from the monsters)
  const list = [...chosen.entries()].map(([i, near]) => ({ i, near, ...cand.get(i) })).sort((a, b) => b.mc - a.mc);
  const out = [];
  list.forEach(s => { const o = out.find(t => Math.hypot(cx(t.i) - cx(s.i), cy(t.i) - cy(s.i)) < 700); if (o) o.near.push(...s.near); else out.push(s); });
  const prefix = (rooms[0].id || d.key).split('-').slice(0, 2).join('-');
  return out.map((s, n) => {
    const near = s.near.sort((a, b) => a.walk - b.walk);
    const names = [...new Set(near.map(x => x.id))];
    const short = (id) => id.split('-').slice(2).join('-');
    return { id: `${prefix}-safe-${n + 1}`, name: names.length > 1 ? `corridor between ${short(names[0])} and ${short(names[1])}` : `corridor next to ${short(names[0])}`,
      x: cx(s.i), y: cy(s.i), z: G.H[s.i], clearance: Math.min(s.mc, s.rc), monsterClear: s.mc, roomClear: s.rc, wallClear: Math.round(s.wall), tier: s.tier,
      nearRooms: near.filter((x, k2, a) => a.findIndex(y => y.id === x.id) === k2) };
  });
}

module.exports = { floorSafeSpots };

if (require.main === module) {
  const argv = process.argv.slice(2), oi = argv.indexOf('--only');
  const only = oi >= 0 ? String(argv[oi + 1]).split(',') : null, dry = argv.includes('--dry');
  const FILE = path.join(DATA, 'dungeon_rooms.json');
  const all = readJson(FILE);
  const ctx = { spawns: readJson(path.join(DATA, 'spawns_h5.json')), NPC: readJson(path.join(DATA, 'npcs_h5.json')), AGGRO: readJson(path.join(DATA, 'aggro_h5.json')) };
  let total = 0, rooms = 0, covered = 0;
  const t0 = Date.now();
  for (const d of all) {
    if (only && !only.includes(d.key)) continue;
    d.floors.forEach((F, fi) => {
      const ss = floorSafeSpots(d, F, fi, ctx);
      F.safeSpots = ss;
      total += ss.length; rooms += (F.rooms || []).length;
      const cov = new Set(ss.flatMap(s => s.nearRooms.map(x => x.id))); covered += cov.size;
      console.log(`${d.key} f${fi + 1} ${F.name}: ${ss.length} safe spots (${ss.filter(s => s.tier === 'tight').length} tight), rooms with one within 12000: ${cov.size}/${(F.rooms || []).length}`);
      // check image: add the shields to the meta file and re-render
      const mf = path.join(OUTDIR, `${d.key}_f${fi + 1}_meta.json`);
      if (fs.existsSync(mf)) { const m = readJson(mf); m.safe = ss.map(s => ({ x: (s.x - m.box[0]) / m.scale, y: (s.y - m.box[2]) / m.scale, text: s.id.split('-').pop() + (s.tier === 'tight' ? ' tight' : '') })); fs.writeFileSync(mf, JSON.stringify(m)); }
    });
  }
  console.log(`${total} safe spots, ${covered}/${rooms} rooms covered, ${Math.round((Date.now() - t0) / 1000)} s`);
  if (!dry) {
    try { fs.copyFileSync(FILE, path.join(ROOT, 'Settings', 'backup', 'dungeon_rooms_before_safespots_' + new Date().toISOString().replace(/[:.]/g, '-') + '.json')); } catch (e) { }
    // compact: swarm.js leaders parse it (2.2 MB instead of 5 MB pretty). POLYEDIT 2026-10-08: locked + atomic, rooms edited on the
    // dashboard meanwhile are copied back from disk (manual_guard.js); this tool only writes floor.safeSpots
    all.forEach(d => (d.floors || []).forEach(F => { if (!only || only.includes(d.key)) delete F.safeSpotsStale; }));
    require('./manual_guard').writeGuarded(FILE, all, 'room');
    console.log('written', FILE);
    try { cp.execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'render_room_checks.ps1'), '-Dir', OUTDIR], { stdio: 'ignore' }); } catch (e) { console.log('render failed', e.message); }
  }
}
