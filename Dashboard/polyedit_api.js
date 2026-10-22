// POLYEDIT API (user 2026-10-08 22:50: "Under /rooms, /spots and /zones it should be possible for me to edit each thing, so I can drag or
// change the zone to my fitting"). Server half of the shape editor (Dashboard/polyedit.js). Mounted by server.js (block marked POLYEDIT):
//   GET  /api/polyedit?list=room|zone|spot|area            -> pickers: [{ id, name, group, levels, shape, manual }]
//   GET  /api/polyedit?kind=room|zone|spot|area&id=...       -> { item (normalised), rev, context (neighbours, safe spots, spawns, ...), live }
//   POST /api/polyedit?kind=..&id=..  { rev, item, applyMonsters }        -> validate + write (atomic, lock, history) -> { ok, item, rev, warnings, jobs }
//   POST /api/polyedit?action=reset&kind=..&id=..  { rev }                 -> back to the generated shape (edited.orig), manual flag removed
//   POST /api/polyedit?action=geocheck { points:[[x,y]], band:[zLo,zHi] }  -> per point walkable + snap point, per edge wall-free (geopath.js)
//   GET  /api/polyedit?action=jobs                          -> background recomputes (safe spots of a floor, zone sub-areas, the room graph)
//   POST /api/polyedit?action=merge { ids:[room ids, one floor], name? } -> ROOMMERGE-2026-10-22: one room (Dashboard/roommerge.js), the others
//        switched off with mergedInto; party_spots.json + party_plans.json room ids remapped; room graph rebuilt in the background (room_graph.js)
// Files (kept in their own format: dungeon_rooms.json compact, the others as on disk):
//   room -> Scripts/data/dungeon_rooms.json (rooms by id)   zone -> custom_zones.json (by name)   spot -> hunting_spots_h5.json (by index)
//   area -> field_areas.json (by id/name, only when the file exists)
//   raidarea -> raid_areas.json (by raid boss npc id; created on the first save; RAID FIGHT AREAS block below, 2026-10-09)
// Every save: item.manual = true + edited { by:'dashboard', at, orig (first time: the generated values) } so the generator tools keep it
// (docs/plan/tools/manual_guard.js), a history copy Scripts/data/history/<file>_<time>.json (last 50 kept).
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto'), cp = require('child_process');

module.exports = function polyEdit(opts) {
  const DATA = opts.DATA, ROOT = opts.ROOT, REF = opts.REF || DATA;
  const LOGS = opts.LOGS || path.join(ROOT, 'Logs'), SETTINGS = opts.SETTINGS || path.join(ROOT, 'Settings');
  const TOOLS = opts.TOOLS || path.join(ROOT, 'docs', 'plan', 'tools');
  const G = require(path.resolve(TOOLS, 'manual_guard.js'));
  const FILES = { room: 'dungeon_rooms.json', zone: 'custom_zones.json', spot: 'hunting_spots_h5.json', area: 'field_areas.json' };
  const KINDS = Object.keys(FILES);
  const fileOf = (k) => path.join(DATA, FILES[k]);
  const r0 = Math.round, num = (v) => (v === null || v === undefined || v === '' ? NaN : Number(v));
  const clone = (o) => o === undefined ? undefined : JSON.parse(JSON.stringify(o));
  const log = (t) => { try { fs.appendFileSync(path.join(LOGS, 'polyedit.log'), `${new Date().toISOString()} ${t}\r\n`); } catch (e) { } };

  // ------------------------------------------------------------------------------------------------------------- geometry
  const area = (P) => { let a = 0; for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length]; a += p[0] * q[1] - q[0] * p[1]; } return Math.abs(a) / 2; };
  const centroid = (P) => [P.reduce((t, p) => t + p[0], 0) / P.length, P.reduce((t, p) => t + p[1], 0) / P.length];
  function inPoly(x, y, P) { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b = P[j]; if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }
  function distToPoly(x, y, P) { let best = Infinity; for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length], dx = q[0] - p[0], dy = q[1] - p[1], L = dx * dx + dy * dy; let t = L ? ((x - p[0]) * dx + (y - p[1]) * dy) / L : 0; t = Math.max(0, Math.min(1, t)); best = Math.min(best, Math.hypot(x - p[0] - t * dx, y - p[1] - t * dy)); } return best; }
  const orient = (a, b, c) => Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
  const onSeg = (a, b, c) => Math.min(a[0], b[0]) <= c[0] && c[0] <= Math.max(a[0], b[0]) && Math.min(a[1], b[1]) <= c[1] && c[1] <= Math.max(a[1], b[1]);
  function segX(a, b, c, d) {
    const o1 = orient(a, b, c), o2 = orient(a, b, d), o3 = orient(c, d, a), o4 = orient(c, d, b);
    if (o1 !== o2 && o3 !== o4) return true;
    return (o1 === 0 && onSeg(a, b, c)) || (o2 === 0 && onSeg(a, b, d)) || (o3 === 0 && onSeg(c, d, a)) || (o4 === 0 && onSeg(c, d, b));
  }
  /** pairs of crossing edges [[i,j]] (adjacent edges ignored) */
  function selfX(P) {
    const n = P.length, out = [];
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      if (segX(P[i], P[(i + 1) % n], P[j], P[(j + 1) % n])) { out.push([i, j]); if (out.length > 20) return out; }
    }
    return out;
  }
  const bboxOf = (P) => { const xs = P.map(p => p[0]), ys = P.map(p => p[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; };
  const toArr = (P) => (Array.isArray(P) ? P : []).map(p => Array.isArray(p) ? [r0(+p[0]), r0(+p[1])] : [r0(+p.x), r0(+p.y)]).filter(p => isFinite(p[0]) && isFinite(p[1]));
  const sha = (o) => crypto.createHash('sha1').update(JSON.stringify(o === undefined ? null : o)).digest('hex').slice(0, 12);
  /** today's hunting square of a circle-type zone / spot (swarm.js: side = max(radius x zoneScale 3, 3000 x 3)) */
  const effSide = (radius) => Math.max((num(radius) || 3000) * 3, 9000);

  // ------------------------------------------------------------------------------------------------------------- files (cached by mtime)
  const cache = {};
  function load(kind) {
    const f = fileOf(kind);
    if (!fs.existsSync(f)) return null;
    const st = fs.statSync(f), c = cache[kind];
    if (c && c.mtime === st.mtimeMs && c.size === st.size) return c;
    const t = G.readText(f);
    return (cache[kind] = { file: f, data: JSON.parse(t.text), fmt: t.fmt, mtime: st.mtimeMs, size: st.size });
  }
  // field_areas.json (docs/plan/tools/field_areas.js, 2026-10-08): { regions: [{ id, name, safeSpots, landings, areas: [...] }], zones }; older / test files: [...] or { areas }
  const areaList = (data) => Array.isArray(data) ? data : data && Array.isArray(data.areas) ? data.areas : data && Array.isArray(data.regions) ? data.regions.flatMap(R => R.areas || []) : [];

  /** the raw item + where it lives */
  function find(kind, data, id) {
    id = String(id);
    if (kind === 'room') {
      for (const d of data || []) for (let fi = 0; fi < (d.floors || []).length; fi++) { const F = d.floors[fi]; const r = (F.rooms || []).find(x => x.id === id); if (r) return { raw: r, d, F, fi }; }
      return null;
    }
    if (kind === 'zone') { const z = (data || []).find(x => x.name === id); return z ? { raw: z } : null; }
    if (kind === 'spot') { const i = +id; const s = Number.isInteger(i) && i >= 0 ? (data || [])[i] : null; return s ? { raw: s, idx: i } : null; }
    if (kind === 'area') {
      if (data && Array.isArray(data.regions)) { for (const R of data.regions) { const a = (R.areas || []).find(x => String(x.id) === id); if (a) return { raw: a, R }; } return null; }
      const a = areaList(data).find(x => String(x.id) === id || (x.id === undefined && x.name === id)); return a ? { raw: a } : null;
    }
    return null;
  }
  const idOf = (kind, raw, idx) => kind === 'room' ? raw.id : kind === 'zone' ? raw.name : kind === 'spot' ? String(idx) : String(raw.id !== undefined ? raw.id : raw.name);

  // ------------------------------------------------------------------------------------------------------------- raw <-> item
  const lv = (a) => Array.isArray(a) && a.length >= 2 ? [+a[0], +a[1]] : [NaN, NaN];
  function areaFields(a) {
    const c = Array.isArray(a.center) ? a.center : a.center && typeof a.center === 'object' ? [a.center.x, a.center.y, a.center.z] : [a.x, a.y, a.z];
    const L = Array.isArray(a.levelRange) ? a.levelRange : Array.isArray(a.lvl) ? a.lvl : [a.levelMin, a.levelMax];
    return { c, L };
  }
  function toItem(kind, hit) {
    const raw = hit.raw;
    const base = { kind, id: idOf(kind, raw, hit.idx), manual: G.isManual(raw), edited: raw.edited ? { by: raw.edited.by, at: raw.edited.at, hasOrig: !!raw.edited.orig } : null };
    if (kind === 'room') {
      const P = toArr(raw.poly), L = lv(raw.levelRange), S = lv(raw.suitsPartyLevel), Z = lv(raw.zRange);
      return { ...base, name: raw.name, shape: P.length >= 3 ? 'poly' : 'circle', poly: P.length >= 3 ? P : null, center: (raw.center || []).map(v => r0(+v)), radius: r0(+raw.radius || 800),
        levelMin: L[0], levelMax: L[1], suitsMin: S[0], suitsMax: S[1], zMin: Z[0], zMax: Z[1], enabled: raw.enabled !== false, notes: raw.notes || '',
        quality: (raw.polyInfo || {}).quality || null, noRoute: !(Array.isArray(raw.route) && raw.route.length), duplicateOf: raw.duplicateOf || null };
    }
    if (kind === 'zone') {
      const P = toArr(raw.poly);
      return { ...base, name: raw.name, shape: P.length >= 3 ? 'poly' : 'circle', poly: P.length >= 3 ? P : null, center: [r0(+raw.x), r0(+raw.y), r0(+raw.z || 0)], radius: r0(+raw.radius || 3000),
        levelMin: +raw.levelMin, levelMax: +raw.levelMax, enabled: raw.enabled !== false, notes: raw.note || '', team: raw.teams ? raw.teams.join(',') : (raw.team || 'all'),
        roomsZone: raw.rooms || raw.dungeon || null };
    }
    if (kind === 'spot') {
      const P = toArr(raw.poly), c = raw.center || {};
      return { ...base, name: raw.name, shape: P.length >= 3 ? 'poly' : 'circle', poly: P.length >= 3 ? P : null, center: [r0(+c.x), r0(+c.y), r0(+c.z || 0)], radius: r0(+raw.radius || 3000),
        levelMin: +raw.levelMin, levelMax: +raw.levelMax, enabled: raw.enabled !== false, notes: raw.note || '', region: raw.region || '' };
    }
    const P = toArr(raw.poly), { c, L } = areaFields(raw), S2 = lv(raw.suitsPartyLevel), Z2 = lv(raw.zRange);
    return { ...base, name: raw.name || String(raw.id), shape: P.length >= 3 ? 'poly' : 'circle', poly: P.length >= 3 ? P : null, center: [r0(+c[0]), r0(+c[1]), r0(+c[2] || 0)],
      radius: r0(+raw.radius || 3000), levelMin: +L[0], levelMax: +L[1], enabled: raw.enabled !== false, notes: raw.notes || raw.note || '',
      ...(Array.isArray(raw.suitsPartyLevel) ? { suitsMin: S2[0], suitsMax: S2[1] } : {}), ...(Array.isArray(raw.zRange) ? { zMin: Z2[0], zMax: Z2[1] } : {}),
      quality: (raw.polyInfo || {}).quality || null, region: hit.R ? hit.R.name : '' };
  }
  /** the original (generated) values, kept the first time an item is edited */
  const pick = (raw, fields) => { const o = {}; fields.forEach(k => { if (raw[k] !== undefined && k !== 'edited' && k !== 'manual') o[k] = clone(raw[k]); }); return o; };

  // ------------------------------------------------------------------------------------------------------------- spawns (reference data)
  let SPAWN = null;
  function spawnIndex() {
    if (SPAWN) return SPAWN;
    const rd = (f, fb) => G.readJson(path.join(REF, f), fb);
    const sp = rd('spawns_h5.json', []), np = rd('npcs_h5.json', {}), ag = rd('aggro_h5.json', {});
    const rb = rd('raidbosses_h5.json', { bosses: [] }), rbn = new Map(((rb && rb.bosses) || (Array.isArray(rb) ? rb : [])).map(b => [b.name, +b.level]));   // name -> level (minions share the name, not the level)
    SPAWN = { aggro: ag, list: (Array.isArray(sp) ? sp : []).map(s => { const n = np[String(s.id)]; const boss = rbn.has(n && n.n) && (!isFinite(rbn.get(n.n)) || rbn.get(n.n) === n.l); if (!n || (n.ty !== 'L2Monster' && !boss)) return null;
      return { x: s.x, y: s.y, z: s.z, id: s.id, l: n.l, n: n.n, c: s.count || 1, a: ag[n.n] ? 1 : 0, b: boss ? 1 : 0 }; }).filter(Boolean) };
    return SPAWN;
  }
  function spawnsIn(bb, band, cap = 4000) {
    const out = spawnIndex().list.filter(s => s.x >= bb[0] && s.x <= bb[2] && s.y >= bb[1] && s.y <= bb[3] && (!band || (s.z >= band[0] && s.z <= band[1])));
    return out.length > cap ? out.filter((s, i) => s.b || i % Math.ceil(out.length / cap) === 0) : out;
  }
  /** height band whose monsters belong to this item */
  function bandOf(kind, hit) {
    const raw = hit.raw;
    if (kind === 'area' && Array.isArray(raw.zRange)) return [raw.zRange[0] - 300, raw.zRange[1] + 300];
    if (kind === 'room') { const Z = Array.isArray(raw.zRange) ? raw.zRange : hit.F && Array.isArray(hit.F.z) ? hit.F.z : [raw.center[2] - 300, raw.center[2] + 300]; return [Z[0] - 300, Z[1] + 300]; }
    if (kind === 'zone' && raw.floor && isFinite(raw.floor.zMin)) return [raw.floor.zMin - 200, raw.floor.zMax + 200];
    const it = toItem(kind, hit), z = it.center[2];
    return isFinite(z) && z !== 0 ? [z - 1000, z + 1000] : null;
  }
  /** the shape a circle-type item hunts in today (polygon of the square, for "inside" counts) */
  function shapeOf(it) {
    if (it.poly && it.poly.length >= 3) return it.poly;
    const [x, y] = it.center;
    if (it.kind === 'room') { const R = it.radius || 800; return Array.from({ length: 16 }, (_, k) => [r0(x + R * Math.cos(k * Math.PI / 8)), r0(y + R * Math.sin(k * Math.PI / 8))]); }
    const h = effSide(it.radius) / 2; return [[x - h, y - h], [x + h, y - h], [x + h, y + h], [x - h, y + h]];
  }
  /** "own" monsters: a room's own monster kinds near its original outline; for zones/spots/areas the monsters of its level range inside its shape */
  function ownFilter(kind, hit, it) {
    if (kind === 'room' || (kind === 'area' && Array.isArray(hit.raw.monsters) && hit.raw.monsters.length)) {
      const ids = new Set((hit.raw.monsters || []).map(m => m.id)), P = it.poly, R = Math.max(800, it.radius || 0) + 400, c = it.center;
      return (s) => ids.has(s.id) && ((P && (inPoly(s.x, s.y, P) || distToPoly(s.x, s.y, P) < 200)) || Math.hypot(s.x - c[0], s.y - c[1]) < R);
    }
    const S = shapeOf(it), lo = (isFinite(it.levelMin) ? it.levelMin : 1) - 3, hi = (isFinite(it.levelMax) ? it.levelMax : 99) + 3;
    return (s) => s.l >= lo && s.l <= hi && inPoly(s.x, s.y, S);
  }
  function statsFor(P, spawns, ownIds) {
    const inside = spawns.filter(s => inPoly(s.x, s.y, P)), byLevel = {};
    inside.forEach(s => { byLevel[s.l] = (byLevel[s.l] || 0) + s.c; });
    const own = spawns.filter(s => ownIds.has(s.k)), ownIn = own.filter(s => inPoly(s.x, s.y, P));
    const sum = (L) => L.reduce((t, s) => t + s.c, 0);
    return { inside: sum(inside), byLevel, own: sum(own), ownInside: sum(ownIn), ownPct: own.length ? Math.round(sum(ownIn) / sum(own) * 100) : null, foreign: sum(inside.filter(s => !ownIds.has(s.k))), area: r0(area(P)) };
  }

  // ------------------------------------------------------------------------------------------------------------- context for the map
  function context(kind, hit, data) {
    const it = toItem(kind, hit), S = shapeOf(it), bb0 = bboxOf(S.concat(it.poly || []));
    const pad = kind === 'room' ? 3500 : 6000, bb = [bb0[0] - pad, bb0[1] - pad, bb0[2] + pad, bb0[3] + pad];
    const band = bandOf(kind, hit), ctx = { band, neighbours: [], safeSpots: [], holes: [], circles: [], lines: [], subareas: [], points: [] };
    const near = (P) => { if (!P || P.length < 3) return false; const b = bboxOf(P); return b[2] >= bb[0] - 20000 && b[0] <= bb[2] + 20000 && b[3] >= bb[1] - 20000 && b[1] <= bb[3] + 20000; };
    const circ = (x, y, R) => Array.from({ length: 20 }, (_, k) => [r0(x + R * Math.cos(k * Math.PI / 10)), r0(y + R * Math.sin(k * Math.PI / 10))]);
    if (kind === 'room') {
      const F = hit.F;
      ctx.title = `${hit.d.name} · ${F.name}`; ctx.dungeon = hit.d.name; ctx.floor = F.name; ctx.fi = hit.fi; ctx.floorZ = F.z || null;
      ctx.mapZ = Array.isArray(hit.raw.zRange) ? r0((hit.raw.zRange[0] + hit.raw.zRange[1]) / 2) : Array.isArray(F.z) ? r0((F.z[0] + F.z[1]) / 2) : it.center[2];
      (F.rooms || []).forEach(r => { if (r.id === hit.raw.id) return; const P = toArr(r.poly);
        ctx.neighbours.push({ kind: 'room', id: r.id, name: String(r.name || r.id).replace(/^.*?:\s*/, ''), short: r.id.split('-').slice(2).join('-'), poly: P.length >= 3 ? P : circ(r.center[0], r.center[1], r.radius || 500), circle: P.length < 3, levels: r.levelRange || null, manual: G.isManual(r) }); });
      ctx.safeSpots = (F.safeSpots || []).map(s => ({ id: s.id, name: s.name, x: s.x, y: s.y, z: s.z, tier: s.tier }));
      ctx.safeStale = F.safeSpotsStale || null;
      if (Array.isArray(hit.raw.route) && hit.raw.route.length > 1) ctx.lines.push({ name: 'walk-in route', color: '#aaaaaa', pts: hit.raw.route.map(p => [p[0], p[1]]) });
      const L = F.enter && F.enter.landing; if (Array.isArray(L)) ctx.points.push({ name: 'floor entry', x: L[0], y: L[1], color: '#5aa9ff' });
    } else {
      ctx.mapZ = it.center[2];
      ctx.title = kind === 'zone' ? 'Hunting zone (custom_zones.json)' : kind === 'spot' ? `Datapack spot${it.region ? ' · ' + it.region : ''} (hunting_spots_h5.json)` : 'Field area (field_areas.json)';
      if (kind !== 'room') { const h = effSide(it.radius) / 2, [x, y] = it.center; ctx.effSquare = it.shape === 'circle' && !it.roomsZone ? [[x - h, y - h], [x + h, y - h], [x + h, y + h], [x - h, y + h]] : null; }
      const zl = load('zone'); (zl ? zl.data : []).forEach(z => {
        if (kind === 'zone' && z.name === hit.raw.name) return;
        if (z.rooms || z.dungeon) return;
        const P = toArr(z.poly), poly = P.length >= 3 ? P : (isFinite(z.x) ? circ(+z.x, +z.y, +z.radius || 3000) : null);
        if (near(poly)) ctx.neighbours.push({ kind: 'zone', id: z.name, name: z.name, poly, circle: P.length < 3, levels: [z.levelMin, z.levelMax], manual: G.isManual(z) });
      });
      const sl = load('spot'); (sl ? sl.data : []).forEach((s, i) => {
        if (kind === 'spot' && i === hit.idx) return;
        const P = toArr(s.poly).length >= 3 ? toArr(s.poly) : toArr(s.hull);
        if (near(P) && P.length >= 3) ctx.neighbours.push({ kind: 'spot', id: String(i), name: s.name, poly: P, circle: false, levels: [s.levelMin, s.levelMax], manual: G.isManual(s), hull: toArr(s.poly).length < 3 });
      });
      const al = load('area'); if (al) areaList(al.data).forEach(a => {
        if (kind === 'area' && a === hit.raw) return;
        const P = toArr(a.poly); if (near(P)) ctx.neighbours.push({ kind: 'area', id: String(a.id !== undefined ? a.id : a.name), name: a.name || String(a.id), poly: P, levels: areaFields(a).L, manual: G.isManual(a) });
      });
      if (kind === 'spot' && toArr(hit.raw.hull).length >= 3) ctx.hull = toArr(hit.raw.hull);
      if (kind === 'area') {
        const R = hit.R;
        if (R) { ctx.title = `Field area · ${R.name}`; ctx.safeSpots = (R.safeSpots || []).map(s => ({ id: s.id, name: s.name, x: s.x, y: s.y, z: s.z, tier: s.tier })); ctx.safeStale = R.safeSpotsStale || null;
          (R.landings || []).forEach(l => { const x = Array.isArray(l) ? l[0] : l.x, y = Array.isArray(l) ? l[1] : l.y; if (isFinite(x)) ctx.points.push({ name: (l && (l.desc || l.name)) || 'landing', x, y, color: '#5aa9ff' }); }); }
        const e = hit.raw.entry; if (e && Array.isArray(e.route) && e.route.length > 1) ctx.lines.push({ name: 'walk from ' + (e.desc || 'the landing'), color: '#aaaaaa', pts: toArr(e.route) });
        if (Array.isArray(hit.raw.zRange)) ctx.mapZ = r0((hit.raw.zRange[0] + hit.raw.zRange[1]) / 2);
      }
      if (kind === 'zone') {
        const z = hit.raw;
        ctx.holes = (z.holes || []).map(toArr).filter(P => P.length >= 3);
        ctx.circles = (z.circles || []).filter(c => isFinite(c.x)).map(c => ({ x: c.x, y: c.y, r: c.r }));
        (z.pulls || []).forEach(r => ctx.lines.push({ name: r.name || 'pull', color: '#ffd34d', pts: toArr(r.points) }));
        if (Array.isArray(z.waypoints) && z.waypoints.length) ctx.lines.push({ name: 'waypoints', color: '#5ad1ff', pts: toArr(z.waypoints) });
        const sub = G.readJson(path.join(DATA, 'zone_subareas.json'), null), key = `${r0(z.x)},${r0(z.y)}`;
        if (sub && sub.zones && sub.zones[key]) ctx.subareas = sub.zones[key].areas.map(a => ({ x: a.x, y: a.y, r: sub.zones[key].radius || sub.clusterRadius || 1500, mobs: a.mobs, lvl: a.lvl }));
      }
    }
    // monsters around (datapack spawns) + which of them are this item's own
    const own = ownFilter(kind, hit, it), sp = spawnsIn(bb, band).map((s, k) => ({ ...s, k, own: own(s) ? 1 : 0 }));
    ctx.spawns = sp;
    ctx.stats = statsFor(S, sp, new Set(sp.filter(s => s.own).map(s => s.k)));
    return ctx;
  }

  const LIVE = {
    room: 'Bots: a party leader loads dungeon_rooms.json once per swarm.js (re)load (dungeonRooms() cache) — he hunts in the new outline after the next reload / deploy. The escape map of members (safe spots, room outlines) re-reads it every 5 min. swarm.js does not check a room\'s "enabled" flag yet.',
    zone: 'Bots: custom_zones.json is read at every spot pick — the new shape is used at the next pick; a party hunting there now keeps the old shape until it picks again (re-check every few minutes).',
    spot: 'Bots: hunting_spots_h5.json is loaded once per swarm.js (re)load — the new shape is used after the next reload / deploy. swarm.js does not check "enabled" on datapack spots yet.',
    area: 'Bots: leaders re-read field_areas.json when the file changed (checked every 10 min, swarm.js with field areas). swarm.js does not check an area "enabled" flag yet. The safe spots of the region are recomputed by: node docs/plan/tools/field_areas.js --only <region>.',
  };

  // ------------------------------------------------------------------------------------------------------------- validation
  function validate(kind, it, raw) {
    const errors = [], warnings = [];
    const name = String(it.name || '').trim();
    if (!name || name.length > 100 || /[\u0000-\u001f]/.test(name)) errors.push('name: 1-100 characters');
    const lo = num(it.levelMin), hi = num(it.levelMax);
    if (!(lo >= 1 && lo <= 99 && hi >= 1 && hi <= 99 && lo <= hi)) errors.push('levels: 1-99, min <= max');
    if ((kind === 'room' || kind === 'area') && (isFinite(num(it.suitsMin)) || isFinite(num(it.suitsMax)))) { const a = num(it.suitsMin), b = num(it.suitsMax); if (!(a >= 1 && b <= 99 && a <= b)) errors.push('suits party level: 1-99, min <= max'); }
    const c = Array.isArray(it.center) ? it.center.map(num) : [];
    if (!(isFinite(c[0]) && isFinite(c[1]) && Math.abs(c[0]) < 400000 && Math.abs(c[1]) < 400000)) errors.push('centre x, y must be numbers inside the world');
    const R = num(it.radius); if (!(R >= 100 && R <= 20000)) errors.push('radius: 100-20000');
    if ((kind === 'room' || kind === 'area') && (isFinite(num(it.zMin)) || isFinite(num(it.zMax)))) { const a = num(it.zMin), b = num(it.zMax); if (!(a < b && b - a <= 4000)) errors.push('height band: zMin < zMax, at most 4000 apart'); }
    if (it.shape === 'poly') {
      const P = Array.isArray(it.poly) ? it.poly : [];
      if (P.length < 3) errors.push('a shape needs at least 3 points');
      else if (P.length > 400) errors.push('at most 400 points');
      else if (!P.every(p => Array.isArray(p) && isFinite(p[0]) && isFinite(p[1]) && Math.abs(p[0]) < 400000 && Math.abs(p[1]) < 400000)) errors.push('every point needs numeric x, y inside the world');
      else {
        if (P.some((p, i) => { const q = P[(i + 1) % P.length]; return p[0] === q[0] && p[1] === q[1]; })) errors.push('two neighbouring points are on top of each other');
        const X = selfX(P); if (X.length) errors.push(`the outline crosses itself (edges ${X.slice(0, 3).map(([i, j]) => `${i + 1}-${(i + 1) % P.length + 1} / ${j + 1}-${(j + 1) % P.length + 1}`).join(', ')})`);
        const A = area(P), b = bboxOf(P), span = Math.max(b[2] - b[0], b[3] - b[1]);
        if (A < 40000) errors.push(`too small (${r0(A)} units², at least 200 x 200)`);
        const maxSpan = kind === 'room' ? 40000 : 80000;
        if (span > maxSpan) errors.push(`too big (${r0(span)} wide, max ${maxSpan})`);
        if (kind === 'room' && isFinite(c[0]) && !inPoly(c[0], c[1], P) && distToPoly(c[0], c[1], P) > 300) warnings.push('the room centre is outside the outline — the leader walks to the centre first');
        if (kind === 'room' && raw.center && Math.hypot(centroid(P)[0] - raw.center[0], centroid(P)[1] - raw.center[1]) > 6000) warnings.push('the outline moved more than 6000 from the old room centre — the saved walk-in route still ends at the old place');
      }
    }
    if (kind === 'zone' && it.shape === 'poly' && raw.rooms) errors.push('this spot hunts inside dungeon rooms — edit the rooms on the Rooms tab instead');
    return { errors, warnings, name };
  }

  // ------------------------------------------------------------------------------------------------------------- apply an item onto the raw entry
  function apply(kind, hit, it, b) {
    const raw = hit.raw, now = new Date().toISOString(), changed = {};
    const first = !G.isManual(raw) || !(raw.edited && raw.edited.orig);
    const orig = first ? pick(raw, G.USER_FIELDS[kind]) : raw.edited.orig;
    const P = it.shape === 'poly' ? it.poly.map(p => [r0(+p[0]), r0(+p[1])]) : null;
    const setIf = (k, v, dflt) => { const old = JSON.stringify(raw[k]); if (v === dflt && raw[k] === undefined) return; if (JSON.stringify(v) !== old) { changed[k] = true; raw[k] = v; } };
    const name = String(it.name).trim();
    if (kind === 'room') {
      setIf('name', name);
      if (P) { if (JSON.stringify(P) !== JSON.stringify(raw.poly)) { changed.poly = true; raw.poly = P; } raw.area = r0(area(P)); }
      const c = [r0(+it.center[0]), r0(+it.center[1]), r0(isFinite(num(it.center[2])) ? +it.center[2] : (raw.center || [])[2] || 0)];
      setIf('center', c); setIf('radius', r0(+it.radius));
      setIf('levelRange', [+it.levelMin, +it.levelMax]);
      if (isFinite(num(it.suitsMin))) setIf('suitsPartyLevel', [+it.suitsMin, +it.suitsMax]);
      if (isFinite(num(it.zMin))) setIf('zRange', [r0(+it.zMin), r0(+it.zMax)]);
      setIf('notes', String(it.notes || ''), '');
      if (it.enabled === false) setIf('enabled', false); else if (raw.enabled === false) { delete raw.enabled; changed.enabled = true; }
      const sp = spawnIndex().list, band = bandOf('room', hit);
      if (P) {
        const ownF = ownFilter('room', { raw: { ...raw, poly: orig.poly || raw.poly, center: orig.center || raw.center, radius: orig.radius || raw.radius } }, { ...toItem('room', { raw: { ...raw, poly: orig.poly || raw.poly } }) });
        const bb = bboxOf(P), pad = 4000, near = sp.filter(s => s.x >= bb[0] - pad && s.x <= bb[2] + pad && s.y >= bb[1] - pad && s.y <= bb[3] + pad && (!band || (s.z >= band[0] && s.z <= band[1]))).map((s, k) => ({ ...s, k }));
        const st = statsFor(P, near, new Set(near.filter(ownF).map(s => s.k)));
        const pi = raw.polyInfo || {};
        raw.polyInfo = { ...pi, method: 'manual', quality: 'manual', corners: P.length, area: raw.area, ownInside: st.ownPct, foreignInside: st.foreign, insideSpawns: st.inside, manualAt: now,
          before: pi.before || (pi.quality !== 'manual' ? { quality: pi.quality || null, method: pi.method || null } : null) };
        if (b.applyMonsters) {
          const inside = near.filter(s => inPoly(s.x, s.y, P)), by = {};
          inside.forEach(s => { const m = by[s.id] = by[s.id] || { name: s.n, id: s.id, level: s.l, count: 0, aggressive: !!s.a }; m.count += s.c; });
          const ms = Object.values(by).sort((a, b2) => b2.count - a.count);
          if (ms.length) { raw.monsters = ms; raw.spawnCount = ms.reduce((t, m) => t + m.count, 0); changed.monsters = true; }
        }
      }
    } else if (kind === 'zone') {
      setIf('name', name);
      if (P) {
        const ps = P.map(([x, y]) => ({ x, y }));
        if (JSON.stringify(ps) !== JSON.stringify(raw.poly)) { changed.poly = true; raw.poly = ps; }
        const cx = P.reduce((t, p) => t + p[0], 0) / P.length, cy = P.reduce((t, p) => t + p[1], 0) / P.length;   // same as POST /api/zones
        raw.x = r0(cx); raw.y = r0(cy); raw.radius = r0(Math.max(...P.map(p => Math.hypot(p[0] - cx, p[1] - cy))));
        const zid = name.replace(/[^A-Za-z0-9]+/g, '_').slice(0, 40);
        fs.mkdirSync(path.join(SETTINGS, 'zones'), { recursive: true });
        fs.writeFileSync(path.join(SETTINGS, 'zones', zid + '.zmap'), zmapXml(P));
        raw.zmap = 'zones\\' + zid + '.zmap';
      } else {
        setIf('x', r0(+it.center[0])); setIf('y', r0(+it.center[1])); if (isFinite(num(it.center[2]))) setIf('z', r0(+it.center[2]));
        setIf('radius', r0(+it.radius));
      }
      setIf('levelMin', +it.levelMin); setIf('levelMax', +it.levelMax);
      setIf('note', String(it.notes || ''), '');
      if (it.enabled === false) setIf('enabled', false); else if (raw.enabled === false) { raw.enabled = true; changed.enabled = true; }
      raw.updated = now;
    } else if (kind === 'spot') {
      setIf('name', name);
      if (P) {
        const ps = P.map(([x, y]) => ({ x, y }));
        if (JSON.stringify(ps) !== JSON.stringify(raw.poly)) { changed.poly = true; raw.poly = ps; }
        const cx = P.reduce((t, p) => t + p[0], 0) / P.length, cy = P.reduce((t, p) => t + p[1], 0) / P.length;
        raw.center = { x: r0(cx), y: r0(cy), z: (raw.center && raw.center.z) || r0(+it.center[2] || 0) };
        raw.radius = r0(Math.max(...P.map(p => Math.hypot(p[0] - cx, p[1] - cy))));
      } else {
        setIf('center', { x: r0(+it.center[0]), y: r0(+it.center[1]), z: isFinite(num(it.center[2])) ? r0(+it.center[2]) : (raw.center || {}).z });
        setIf('radius', r0(+it.radius), 3000);
      }
      setIf('levelMin', +it.levelMin); setIf('levelMax', +it.levelMax);
      setIf('note', String(it.notes || ''), '');
      if (it.enabled === false) setIf('enabled', false); else if (raw.enabled === false) { delete raw.enabled; changed.enabled = true; }
    } else {   // area: keep the file's own field formats
      setIf('name', name);
      if (P) {
        const objFmt = Array.isArray(raw.poly) && raw.poly.length && !Array.isArray(raw.poly[0]);
        const np = objFmt ? P.map(([x, y]) => ({ x, y })) : P;
        if (JSON.stringify(np) !== JSON.stringify(raw.poly)) { changed.poly = true; raw.poly = np; }
        if (raw.area !== undefined) raw.area = r0(area(P));
        const cx = r0(P.reduce((t, p) => t + p[0], 0) / P.length), cy = r0(P.reduce((t, p) => t + p[1], 0) / P.length);
        if (Array.isArray(raw.center)) raw.center = [cx, cy].concat(raw.center.slice(2)); else if (raw.center && typeof raw.center === 'object') raw.center = { ...raw.center, x: cx, y: cy };
        else if (raw.x !== undefined) { raw.x = cx; raw.y = cy; }
        if (raw.radius !== undefined) raw.radius = r0(Math.max(...P.map(p => Math.hypot(p[0] - cx, p[1] - cy))));
      } else {
        const c = it.center.map(v => r0(+v));
        if (Array.isArray(raw.center)) setIf('center', [c[0], c[1]].concat(raw.center.slice(2))); else if (raw.center && typeof raw.center === 'object') setIf('center', { ...raw.center, x: c[0], y: c[1] }); else { setIf('x', c[0]); setIf('y', c[1]); }
        setIf('radius', r0(+it.radius));
      }
      if (Array.isArray(raw.suitsPartyLevel) && isFinite(num(it.suitsMin))) setIf('suitsPartyLevel', [+it.suitsMin, +it.suitsMax]);
      if (Array.isArray(raw.zRange) && isFinite(num(it.zMin))) setIf('zRange', [r0(+it.zMin), r0(+it.zMax)]);
      if (P && raw.polyInfo) { const pi = raw.polyInfo; raw.polyInfo = { ...pi, method: 'manual', quality: 'manual', corners: P.length, manualAt: now, before: pi.before || (pi.quality !== 'manual' ? { quality: pi.quality || null, method: pi.method || null } : null) }; }
      if (Array.isArray(raw.levelRange)) setIf('levelRange', [+it.levelMin, +it.levelMax]); else if (Array.isArray(raw.lvl)) setIf('lvl', [+it.levelMin, +it.levelMax]); else { setIf('levelMin', +it.levelMin); setIf('levelMax', +it.levelMax); }
      if (raw.note !== undefined && raw.notes === undefined) setIf('note', String(it.notes || ''), ''); else setIf('notes', String(it.notes || ''), '');
      if (it.enabled === false) setIf('enabled', false); else if (raw.enabled === false) { delete raw.enabled; changed.enabled = true; }
    }
    raw.manual = true;
    raw.edited = { by: 'dashboard', at: now, orig, ...(kind === 'spot' ? { key: (raw.edited && raw.edited.key) || (orig.center ? `${r0(orig.center.x)},${r0(orig.center.y)}` : ''), origName: (raw.edited && raw.edited.origName) || orig.name } : {}) };
    return changed;
  }
  function zmapXml(P) {
    const pts = P.map(q => `      <point x="${r0(q[0])}" y="${r0(q[1])}" />`).join('\r\n');
    return ['<?xml version="1.0" encoding="utf-8"?>', '<zone>', '  <ExternalPoly>', '    <points>', pts, '    </points>', '  </ExternalPoly>', '  <InternalPolies />', '</zone>', ''].join('\r\n');
  }

  // ------------------------------------------------------------------------------------------------------------- background jobs
  const JOBS = new Map(); let jobSeq = 0;
  function startJob(type, key, script, args) {
    if (opts.noJobs) return { type, key, skipped: 'jobs off (sandbox)' };
    const k = type + ':' + key, cur = [...JOBS.values()].find(j => j.k === k && !j.done);
    if (cur) { cur.again = true; return view(cur); }
    const j = { id: ++jobSeq, k, type, key, started: Date.now(), done: false, out: '' };
    try {
      const p = cp.fork(script, args, { silent: true, env: { ...process.env, POLYEDIT_DATA: DATA, POLYEDIT_REF: REF } });
      const grab = (d) => { j.out = (j.out + String(d)).slice(-3000); };
      p.stdout.on('data', grab); p.stderr.on('data', grab);
      const kill = setTimeout(() => { try { p.kill(); } catch (e) { } j.out += '\n(killed after 5 min)'; }, 300000);
      p.on('exit', (code) => { clearTimeout(kill); j.done = true; j.code = code; j.ended = Date.now(); log(`job ${type} ${key}: exit ${code} ${j.out.trim().split(/\r?\n/).pop()}`); if (j.again) startJob(type, key, script, args); });
    } catch (e) { j.done = true; j.code = -1; j.out = e.message; }
    JOBS.set(j.id, j);
    [...JOBS.keys()].slice(0, Math.max(0, JOBS.size - 30)).forEach(id => JOBS.delete(id));
    log(`job ${type} ${key} started`);
    return view(j);
  }
  const view = (j) => ({ id: j.id, type: j.type, key: j.key, started: j.started, done: j.done, code: j.code, ended: j.ended, last: String(j.out || '').trim().split(/\r?\n/).slice(-2).join(' | ') });

  // ------------------------------------------------------------------------------------------------------------- geodata check
  let GP = null;
  function geocheck(b) {
    GP = GP || require(path.resolve(TOOLS, 'geopath.js'));
    const P = toArr(b.points).slice(0, 400), band = Array.isArray(b.band) && b.band.length === 2 && b.band.every(v => isFinite(v)) ? b.band.map(Number) : null;
    const mid = band ? (band[0] + band[1]) / 2 : num(b.z);
    const cell = (x, y) => {
      const ls = GP.layers(GP.toGeoX(x), GP.toGeoY(y)); if (!ls) return null;
      const ok = ls.filter(l => l.nswe !== 0 && (!band || (l.h >= band[0] && l.h <= band[1])));
      if (!ok.length) return null;
      return ok.reduce((a, l) => (!isFinite(mid) || Math.abs(l.h - mid) < Math.abs(a.h - mid)) ? l : a, ok[0]);
    };
    // a point is fine on a walkable cell of the band or within 48 of one (generated outlines hug the walls)
    const NEAR = [[16, 0], [-16, 0], [0, 16], [0, -16], [32, 0], [-32, 0], [0, 32], [0, -32], [24, 24], [-24, 24], [24, -24], [-24, -24], [48, 0], [-48, 0], [0, 48], [0, -48]];
    const near = (x, y) => cell(x, y) || NEAR.reduce((f, [dx, dy]) => f || cell(x + dx, y + dy), null);
    const hasGeo = (x, y) => !!GP.layers(GP.toGeoX(x), GP.toGeoY(y));
    const pts = P.map(([x, y]) => {
      const c = near(x, y); if (c) return { ok: true, z: c.h };
      if (!hasGeo(x, y)) return { ok: null };                                   // no geodata there
      for (let rr = 4; rr <= 20; rr++) for (let dx = -rr; dx <= rr; dx++) for (let dy = -rr; dy <= rr; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== rr) continue;
        const sx = x + dx * 16, sy = y + dy * 16, c2 = cell(sx, sy); if (c2) return { ok: false, snap: [GP.toWorldX(GP.toGeoX(sx)), GP.toWorldY(GP.toGeoY(sy))], z: c2.h };
      }
      return { ok: false };
    });
    // an edge "goes through rock / a wall" when >= 128 units of it in a row have no walkable ground of the band within 48
    // (touching a wall is normal for an outline; cutting through solid rock into the next corridor is not)
    const edges = P.map((p, i) => {
      if (b.open && i === P.length - 1) return null;
      const q = P[(i + 1) % P.length], L = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (L > 20000) return null;
      const n = Math.max(1, Math.ceil(L / 32)); let run = 0, worst = 0, geo = 0;
      for (let k = 0; k <= n; k++) { const x = p[0] + (q[0] - p[0]) * k / n, y = p[1] + (q[1] - p[1]) * k / n; if (!hasGeo(x, y)) { run = 0; continue; } geo++; if (near(x, y)) run = 0; else { run++; worst = Math.max(worst, run); } }
      if (!geo) return null;
      return worst * (L / n) < 128;
    });
    return { points: pts, edges };
  }

  // ------------------------------------------------------------------------------------------------------------- list
  function list(kind) {
    const L = load(kind); if (!L) return [];
    if (kind === 'room') return L.data.flatMap(d => (d.floors || []).flatMap((F, fi) => (F.rooms || []).map(r => ({ id: r.id, name: r.name, group: `${d.name} · ${F.name}`, dungeon: d.name, fi,
      levels: r.levelRange || null, shape: toArr(r.poly).length >= 3 ? 'poly' : 'circle', manual: G.isManual(r), quality: (r.polyInfo || {}).quality || null }))));
    if (kind === 'zone') return L.data.map(z => ({ id: z.name, name: z.name, group: z.rooms ? 'rooms in ' + z.rooms : z.dungeon ? 'inside ' + z.dungeon : (z.teams || [z.team || 'all']).join(','),
      levels: [z.levelMin, z.levelMax], shape: z.rooms || z.dungeon ? 'rooms' : toArr(z.poly).length >= 3 ? 'poly' : 'circle', enabled: z.enabled !== false, manual: G.isManual(z) }));
    if (kind === 'spot') return L.data.map((s, i) => ({ id: String(i), name: s.name, group: s.region || '', levels: [s.levelMin, s.levelMax], shape: toArr(s.poly).length >= 3 ? 'poly' : 'circle', count: s.count, manual: G.isManual(s), enabled: s.enabled !== false }));
    if (L.data && Array.isArray(L.data.regions)) return L.data.regions.flatMap(R => (R.areas || []).map(a => ({ id: String(a.id), name: a.name || String(a.id), group: R.name, levels: a.levelRange || null,
      shape: toArr(a.poly).length >= 3 ? 'poly' : 'circle', manual: G.isManual(a), enabled: a.enabled !== false, quality: (a.polyInfo || {}).quality || null })));
    return areaList(L.data).map(a => ({ id: String(a.id !== undefined ? a.id : a.name), name: a.name || String(a.id), group: a.region || a.zone || '', levels: areaFields(a).L, shape: toArr(a.poly).length >= 3 ? 'poly' : 'circle', manual: G.isManual(a) }));
  }

  // ------------------------------------------------------------------------------------------------------------- save / reset
  function save(kind, id, b, reset) {
    const file = fileOf(kind); if (!fs.existsSync(file)) return { code: 404, body: { error: FILES[kind] + ' does not exist' } };
    let result = null;
    try {
      G.withLock(file, () => {
        const t = G.readText(file), data = JSON.parse(t.text), hit = find(kind, data, id);
        if (!hit) { result = { code: 404, body: { error: 'not found: ' + id } }; return; }
        const rev = sha(hit.raw);
        if (b.rev && b.rev !== rev && !b.force) { result = { code: 409, body: { error: 'changed on disk since you opened it (a tool or another editor) — reload and edit again', rev, item: toItem(kind, hit) } }; return; }
        let changed = {}, warnings = [];
        if (reset) {
          const o = hit.raw.edited && hit.raw.edited.orig;
          if (!o) { result = { code: 400, body: { error: 'nothing to reset: this item was never edited on the dashboard (or has no saved original)' } }; return; }
          G.copyFields(hit.raw, o, G.USER_FIELDS[kind].filter(k => k !== 'edited' && k !== 'manual'));
          delete hit.raw.manual; delete hit.raw.edited; changed = { reset: true, poly: true };
        } else {
          const it = b.item || {};
          const v = validate(kind, it, hit.raw); warnings = v.warnings;
          if (v.errors.length) { result = { code: 400, body: { error: v.errors.join('; '), errors: v.errors, warnings } }; return; }
          if (kind === 'zone' && v.name !== hit.raw.name && data.some(z => z !== hit.raw && z.name === v.name)) { result = { code: 400, body: { error: 'another zone already has this name' } }; return; }
          if (kind === 'zone' && v.name !== hit.raw.name) warnings.push('renamed: a party whose hunting spot was chosen by the old name (Parties tab) has to choose it again');
          changed = apply(kind, hit, it, b);
        }
        const jobs = [];
        if (kind === 'room' && (changed.poly || changed.center || changed.zRange)) { hit.F.safeSpotsStale = { at: new Date().toISOString(), room: hit.raw.id }; jobs.push(['safespots', `${hit.d.name}#${hit.fi}`, path.join(TOOLS, 'polyedit_safespots.js'), ['--dungeon', hit.d.name, '--floor', String(hit.fi)]]);
          if (hit.d.key) jobs.push(['roomgraph', hit.d.key, path.join(TOOLS, 'room_graph.js'), ['--only', hit.d.key, '--no-images']]); }   // ROOMMERGE-2026-10-22: doors / corridors follow the new outline
        if (kind === 'area' && hit.R && (changed.poly || reset)) hit.R.safeSpotsStale = { at: new Date().toISOString(), area: hit.raw.id };   // field_areas.js --only <region> recomputes them
        if (kind === 'zone' && (changed.poly || changed.x || changed.y || changed.radius || reset) && !hit.raw.rooms && !hit.raw.dungeon) jobs.push(['subareas', 'all', path.join(TOOLS, 'zone_subareas.js'), []]);
        const hist = G.saveHistory(file, DATA, 50);
        G.atomicWrite(file, G.stringifyLike(data, t.fmt));
        delete cache[kind];
        const nid = idOf(kind, hit.raw, hit.idx);
        log(`${reset ? 'reset' : 'save'} ${kind} ${nid} (${Object.keys(changed).join(',') || 'no change'}) history ${hist ? path.basename(hist) : '-'}`);
        result = { code: 200, body: { ok: true, id: nid, rev: sha(hit.raw), item: toItem(kind, hit), changed: Object.keys(changed), warnings, history: hist ? path.relative(ROOT, hist) : null, live: LIVE[kind], _jobs: jobs } };
      }, { who: 'polyedit ' + kind });
    } catch (e) { return { code: 500, body: { error: e.message } }; }
    if (result && result.body && result.body._jobs) { result.body.jobs = result.body._jobs.map(j => startJob(...j)); delete result.body._jobs; }
    return result;
  }

  // ------------------------------------------------------------------------------------------------------------- RAID FIGHT AREAS (2026-10-09)
  // User 2026-10-09 10:40: "Under 'Raid clearing' it is clearing a HUGE area before the raid actually starts. I want to be able to select the
  // raid 'area' where they should fight." Kind 'raidarea', id = the boss's npc id, shared by every party. Own file Scripts/data/raid_areas.json
  // (NOT the route files routes/raid/<id>.json: swarm.js saveRaidRoute rewrites those with route fields only and raidRouteFailed deletes them):
  //   { about, areas: { "<npc id>": { id, boss, fight: [[x,y]..], clear: [[x,y]..] | null (= fight + clearMargin), clearMargin, clearPassive,
  //                                   stage: [x,y,z] | null (= ~1500 from the boss on the way in), enabled, notes, manual, edited, updated } } }
  // swarm.js (RAIDAREA) re-reads the file when its write time changes: clear only inside the clear area, stage at the stage point, the tank pulls
  // the boss into the fight area and keeps it there, casters / healers stand inside it.
  const RA = { FILE: 'raid_areas.json', DEF_R: 900, MARGIN: 600, STAGE: 1500, CLEAR_R: 1200,
    ABOUT: 'Raid fight areas per boss npc id. Edited on the dashboard (Raids -> boss -> Fight area, shape editor #/edit/raidarea/<id>). fight = where the team fights the boss (the tank pulls it in and keeps it there); clear = what is cleared before the pull (null = fight + clearMargin); stage = where the team waits during the clear + countdown (null = ~1500 from the boss on the way in). Read live by swarm.js (RAIDAREA).' };
  const raFile = () => path.join(DATA, RA.FILE);
  let RBOSS = null, NPCN = null;
  function raBoss(id) {
    if (!RBOSS) { const j = G.readJson(path.join(REF, 'raidbosses_h5.json'), { bosses: [] }); RBOSS = new Map(((j && j.bosses) || (Array.isArray(j) ? j : [])).map(b => [String(b.id), b])); }
    return RBOSS.get(String(id)) || null;
  }
  /** name -> { l: level, a: aggro range } for minion facts */
  function npcByName(n) {
    if (!NPCN) { NPCN = new Map(); const np = G.readJson(path.join(REF, 'npcs_h5.json'), {}); Object.keys(np || {}).forEach(k => { const v = np[k]; if (v && v.n && !NPCN.has(v.n)) NPCN.set(v.n, { l: v.l, id: +k }); }); }
    return NPCN.get(n) || null;
  }
  const raCircle = (x, y, R, n = 12) => Array.from({ length: n }, (_, k) => [r0(x + R * Math.cos(-Math.PI / 2 + k * 2 * Math.PI / n)), r0(y + R * Math.sin(-Math.PI / 2 + k * 2 * Math.PI / n))]);
  function raLoad() {
    const f = raFile(); if (!fs.existsSync(f)) return { data: { about: RA.ABOUT, areas: {} }, fmt: null };
    const t = G.readText(f), data = JSON.parse(t.text); if (!data.areas || typeof data.areas !== 'object') data.areas = {};
    return { data, fmt: t.fmt };
  }
  function raItem(id, raw, b) {
    const fight = raw && toArr(raw.fight).length >= 3 ? toArr(raw.fight) : raCircle(b.x, b.y, RA.DEF_R);
    const c = centroid(fight);
    return { kind: 'raidarea', id: String(id), name: b.name, shape: 'poly', poly: fight, center: [r0(b.x), r0(b.y), r0(b.z)], radius: r0(Math.max(...fight.map(p => Math.hypot(p[0] - c[0], p[1] - c[1])))),
      levelMin: +b.level, levelMax: +b.level, enabled: raw ? raw.enabled !== false : true, notes: (raw && raw.notes) || '', layer: 'fight',
      clearPoly: raw && toArr(raw.clear).length >= 3 ? toArr(raw.clear) : null, clearMargin: raw && isFinite(num(raw.clearMargin)) ? +raw.clearMargin : RA.MARGIN,
      clearPassive: !!(raw && raw.clearPassive), stay: !!(raw && raw.stay), stage: raw && Array.isArray(raw.stage) && raw.stage.length >= 2 ? raw.stage.slice(0, 3).map(v => r0(+v)) : null,
      isNew: !raw, manual: !!raw, edited: raw && raw.edited ? { by: raw.edited.by, at: raw.edited.at, hasOrig: false } : null,
      boss: { name: b.name, level: +b.level, x: r0(b.x), y: r0(b.y), z: r0(b.z) } };
  }
  function raRoute(id) { const j = G.readJson(path.join(DATA, 'routes', 'raid', String(id) + '.json'), null); return j && Array.isArray(j.points) && j.points.length > 1 ? j : null; }
  /** the default stage (what swarm.js does without one): ~1500 from the boss where the walk in comes from (route, else the landing) */
  function raDefaultStage(b, route) {
    const pts = route ? route.points.map(p => [+p.x, +p.y]) : [];
    for (let i = pts.length - 1; i >= 0; i--) { const d = Math.hypot(pts[i][0] - b.x, pts[i][1] - b.y); if (d >= RA.STAGE) { const k = RA.STAGE / d; return [r0(b.x + (pts[i][0] - b.x) * k), r0(b.y + (pts[i][1] - b.y) * k), r0(b.z)]; } }
    const L = b.nearestTeleport; if (L && isFinite(L.x)) { const d = Math.hypot(L.x - b.x, L.y - b.y) || 1, k = Math.min(1, RA.STAGE / d); return [r0(b.x + (L.x - b.x) * k), r0(b.y + (L.y - b.y) * k), r0(b.z)]; }
    return [r0(b.x), r0(b.y + RA.STAGE), r0(b.z)];
  }
  function raContext(id, b, it) {
    const route = raRoute(id), stage = it.stage || raDefaultStage(b, route);
    const pts = it.poly.concat(it.clearPoly || [], [[stage[0], stage[1]], [b.x, b.y]]), bb0 = bboxOf(pts), pad = 3500, bb = [bb0[0] - pad, bb0[1] - pad, bb0[2] + pad, bb0[3] + pad];
    const band = [r0(b.z) - 1000, r0(b.z) + 1000];
    const ag = spawnIndex().aggro || {};
    const sp = spawnsIn(bb, band).map((s, k) => ({ ...s, k, own: s.b && s.n === b.name ? 1 : 0, ar: ag[s.n] || 0 }));
    const ctx = { band, neighbours: [], safeSpots: [], holes: [], circles: [], lines: [], subareas: [], points: [], mapZ: r0(b.z), spawns: sp };
    ctx.title = `Raid boss lvl ${b.level}${b.zoneName ? ' · ' + b.zoneName : ''}`;
    if (route) ctx.lines.push({ name: route.manual ? 'locked route' : 'recorded route', color: '#e8e8e8', pts: route.points.map(p => [r0(+p.x), r0(+p.y)]) });
    const L = b.nearestTeleport; if (L && isFinite(L.x) && Math.hypot(L.x - b.x, L.y - b.y) < 12000) ctx.points.push({ name: 'landing (' + (L.to || L.desc || '') + ')', x: r0(L.x), y: r0(L.y), color: '#5aa9ff' });
    const mins = (b.minions || []).map(s => { const m = /^(.*?)(?:\s*x(\d+))?$/.exec(String(s)) || []; const n = (m[1] || String(s)).trim(), f = npcByName(n); return { name: n, count: +(m[2] || 1), level: f ? f.l : null, aggro: ag[n] || 0 }; });
    ctx.raid = { boss: { name: b.name, level: +b.level, x: r0(b.x), y: r0(b.y), z: r0(b.z), curseLevel: b.curseLevel || null }, minions: mins, defaultStage: raDefaultStage(b, route),
      stageDist: RA.STAGE, defaultClearR: RA.CLEAR_R, defaultFightR: RA.DEF_R, route: route ? { landing: route.landing || '', manual: !!route.manual, points: route.points.length } : null };
    ctx.stats = statsFor(it.poly, sp, new Set());
    return ctx;
  }
  /** checks of one polygon (fight or clear) */
  function raPolyErrors(P, what, maxSpan) {
    const e = [];
    if (!Array.isArray(P) || P.length < 3) return [`${what}: at least 3 points`];
    if (P.length > 200) return [`${what}: at most 200 points`];
    if (!P.every(p => Array.isArray(p) && isFinite(p[0]) && isFinite(p[1]) && Math.abs(p[0]) < 400000 && Math.abs(p[1]) < 400000)) return [`${what}: every point needs numeric x, y inside the world`];
    if (P.some((p, i) => { const q = P[(i + 1) % P.length]; return p[0] === q[0] && p[1] === q[1]; })) e.push(`${what}: two neighbouring points are on top of each other`);
    if (selfX(P).length) e.push(`${what}: the outline crosses itself`);
    const A = area(P), bb = bboxOf(P), span = Math.max(bb[2] - bb[0], bb[3] - bb[1]);
    if (A < 40000) e.push(`${what}: too small (at least 200 x 200)`);
    if (span > maxSpan) e.push(`${what}: too big (${r0(span)} wide, max ${maxSpan})`);
    return e;
  }
  function raValidate(it, b) {
    const errors = [], warnings = [];
    const F = toArr(it.fight || it.poly), C = it.clear ? toArr(it.clear) : null;
    errors.push(...raPolyErrors(F, 'fight area', 10000));
    if (C) errors.push(...raPolyErrors(C, 'clear area', 14000));
    const m = num(it.clearMargin); if (!(m >= 0 && m <= 3000)) errors.push('clear margin: 0-3000');
    let st = null;
    if (it.stage) {
      st = Array.isArray(it.stage) ? it.stage.map(num) : [];
      if (!(isFinite(st[0]) && isFinite(st[1]) && Math.abs(st[0]) < 400000 && Math.abs(st[1]) < 400000)) errors.push('stage: x, y must be numbers inside the world');
      else {
        const d = Math.hypot(st[0] - b.x, st[1] - b.y);
        if (d > 3800) errors.push(`stage: ${r0(d)} from the boss — the leader must see the boss from there (max ~3400, the client's view range)`);
        else if (d > 3000) warnings.push(`stage is ${r0(d)} from the boss: near the edge of what the leader can see`);
        if (!errors.length && F.length >= 3 && inPoly(st[0], st[1], F)) warnings.push('stage is inside the fight area: the team waits where the fight will be');
        if (d < 400) warnings.push('stage is right next to the boss');
      }
    }
    if (!errors.length) {
      if (!inPoly(b.x, b.y, F) && distToPoly(b.x, b.y, F) > 300) warnings.push(`the boss spawn is ${r0(distToPoly(b.x, b.y, F))} outside the fight area: the tank pulls it in after the aggro — raid bosses walk back to their spawn when pulled too far, keep the area near the spawn`);
      if (C && F.some(p => !inPoly(p[0], p[1], C) && distToPoly(p[0], p[1], C) > 50)) warnings.push('parts of the fight area are outside the clear area: monsters there are not cleared before the pull');
      const bb = bboxOf(F); if (Math.max(bb[2] - bb[0], bb[3] - bb[1]) > 4000) warnings.push('a big fight area (> 4000 wide): casters and healers may stand far apart');
    }
    return { errors, warnings };
  }
  function raSave(id, b, body, reset) {
    const file = raFile(); let result = null;
    try {
      G.withLock(file, () => {
        const L = raLoad(), data = L.data, raw = data.areas[String(id)] || null, rev = sha(raw);
        if (body.rev !== undefined && body.rev !== rev && !body.force) { result = { code: 409, body: { error: 'changed on disk since you opened it (another editor) — reload and edit again', rev, item: raItem(id, raw, b) } }; return; }
        let changed = [], warnings = [];
        if (reset) {
          if (!raw) { result = { code: 400, body: { error: 'no fight area saved for this boss — nothing to remove' } }; return; }
          delete data.areas[String(id)]; changed = ['removed'];
        } else {
          const it = body.item || {};
          const fight = toArr(it.layer === 'clear' && it.fightPoly ? it.fightPoly : it.poly), clear = it.layer === 'clear' ? toArr(it.poly) : (it.clearPoly ? toArr(it.clearPoly) : null);
          const nv = { fight, clear: clear && clear.length >= 3 ? clear : null, clearMargin: r0(num(it.clearMargin)), stage: Array.isArray(it.stage) && it.stage.length >= 2 ? it.stage.slice(0, 3).map(v => r0(+v)) : null };
          if (nv.stage && nv.stage.length === 2) nv.stage.push(r0(b.z));
          const v = raValidate(nv, b); warnings = v.warnings;
          if (v.errors.length) { result = { code: 400, body: { error: v.errors.join('; '), errors: v.errors, warnings } }; return; }
          const now = new Date().toISOString();
          const out = { id: +id, boss: b.name, fight: nv.fight, clear: nv.clear, clearMargin: nv.clearMargin, clearPassive: !!it.clearPassive, stay: it.stay === true, stage: nv.stage,
            enabled: it.enabled !== false, notes: String(it.notes || '').slice(0, 2000), manual: true, edited: { by: 'dashboard', at: now }, created: (raw && raw.created) || now, updated: now };
          ['fight', 'clear', 'clearMargin', 'clearPassive', 'stay', 'stage', 'enabled', 'notes'].forEach(k => { if (JSON.stringify(out[k]) !== JSON.stringify(raw ? raw[k] : undefined)) changed.push(k); });
          data.areas[String(id)] = out;
          if (!data.about) data.about = RA.ABOUT;
        }
        const hist = fs.existsSync(file) ? G.saveHistory(file, DATA, 50) : null;
        G.atomicWrite(file, G.stringifyLike(data, L.fmt && L.fmt.indent ? L.fmt : { bom: false, indent: 1, eol: '\n' }));
        const nraw = data.areas[String(id)] || null;
        log(`${reset ? 'remove' : 'save'} raidarea ${id} ${b.name} (${changed.join(',') || 'no change'}) history ${hist ? path.basename(hist) : '-'}`);
        result = { code: 200, body: { ok: true, id: String(id), rev: sha(nraw), item: raItem(id, nraw, b), changed, warnings, history: hist ? path.relative(ROOT, hist) : null, live: LIVE.raidarea, jobs: [] } };
      }, { who: 'polyedit raidarea' });
    } catch (e) { return { code: 500, body: { error: e.message } }; }
    return result;
  }
  function raList() {
    let L; try { L = raLoad(); } catch (e) { return []; }
    return Object.keys(L.data.areas).map(k => { const a = L.data.areas[k], b = raBoss(k);
      return { id: String(k), name: a.boss || (b && b.name) || k, group: 'raid bosses', levels: b ? [b.level, b.level] : null, shape: 'poly', manual: true, enabled: a.enabled !== false,
        clear: toArr(a.clear).length >= 3, stage: Array.isArray(a.stage), points: toArr(a.fight).length, updated: a.updated || null }; });
  }
  function raHandle(method, id, body, action) {
    const b = raBoss(id); if (!b) return { code: 404, body: { error: 'unknown raid boss id: ' + id } };
    // FIT TO SAFE GROUND (2026-10-14): a circle trimmed at cliff edges / water / walls from the geodata (Dashboard/raidfit.js); nothing is saved
    if (action === 'fit') { const B = body || {}; const r = require('./raidfit').fitSafeGround(ROOT, { x: isFinite(+B.x) ? +B.x : b.x, y: isFinite(+B.y) ? +B.y : b.y, z: isFinite(+B.z) ? +B.z : b.z, r: +B.r || RA.DEF_R }); return { code: r.ok ? 200 : 400, body: r }; }
    if (method === 'POST') return raSave(id, b, body || {}, action === 'reset');
    const L = raLoad(), raw = L.data.areas[String(id)] || null, it = raItem(id, raw, b);
    return { code: 200, body: { kind: 'raidarea', id: String(id), file: 'Scripts/data/' + RA.FILE, rev: sha(raw), item: it, orig: !!raw, context: raContext(id, b, it), live: LIVE.raidarea } };
  }
  LIVE.raidarea = 'Bots: swarm.js (RAIDAREA, after the next deploy) re-reads raid_areas.json when its write time changes (checked at most every 10 s): the leader stages at the stage point, clears only inside the clear area, the tank pulls the boss into the fight area and keeps it there, casters and healers stand inside it. A raid already past its clear keeps the old area for the clear but uses the new one for positions.';

  // ------------------------------------------------------------------------------------------------------------- ROOM MERGE (2026-10-22)
  /** remap room ids in another data file (party_spots.json / party_plans.json): lock, history copy, atomic write; -> changed count */
  function remapFile(name, alias) {
    const f = path.join(DATA, name); if (!fs.existsSync(f)) return 0;
    let n = 0;
    G.withLock(f, () => { const t = G.readText(f), j = JSON.parse(t.text); n = require('./roommerge').remapIds(j, alias); if (!n) return; G.saveHistory(f, DATA, 50); G.atomicWrite(f, G.stringifyLike(j, t.fmt)); }, { who: 'polyedit merge' });
    return n;
  }
  function merge(b) {
    const file = fileOf('room'); if (!fs.existsSync(file)) return { code: 404, body: { error: FILES.room + ' does not exist' } };
    let result = null, R = null;
    try {
      G.withLock(file, () => {
        const t = G.readText(file), data = JSON.parse(t.text);
        try { R = require('./roommerge').mergeRooms(data, b.ids, { name: b.name }); } catch (e) { result = { code: 400, body: { error: e.message } }; return; }
        const hist = G.saveHistory(file, DATA, 50);
        G.atomicWrite(file, G.stringifyLike(data, t.fmt));
        delete cache.room;
        log(`merge rooms ${(b.ids || []).join('+')} -> ${R.id} (${R.dungeon} floor ${R.floor + 1}) history ${hist ? path.basename(hist) : '-'}`);
        result = { code: 200, body: { ok: true, id: R.id, absorbed: R.absorbed, alias: R.alias, dungeon: R.dungeon, floor: R.floor, room: R.room, history: hist ? path.relative(ROOT, hist) : null } };
      }, { who: 'polyedit merge' });
    } catch (e) { return { code: 500, body: { error: e.message } }; }
    if (!result || result.code !== 200) return result || { code: 500, body: { error: 'not merged' } };
    const remapped = {}; ['party_spots.json', 'party_plans.json'].forEach(f => { try { remapped[f] = remapFile(f, R.alias); } catch (e) { remapped[f] = 'failed: ' + e.message; } });
    result.body.remapped = remapped;
    result.body.jobs = R.key ? [startJob('roomgraph', R.key, path.join(TOOLS, 'room_graph.js'), ['--only', R.key, '--no-images'])] : [];
    return result;
  }

  // ------------------------------------------------------------------------------------------------------------- entry point
  function handle(method, q, body) {
    try {
      const action = q.get('action') || '';
      if (action === 'jobs') return { code: 200, body: { jobs: [...JOBS.values()].map(view).reverse() } };
      if (action === 'geocheck') return { code: 200, body: geocheck(body || {}) };
      if (action === 'merge') return method === 'POST' ? merge(body || {}) : { code: 405, body: { error: 'POST' } };   // ROOMMERGE-2026-10-22
      const lk = q.get('list');
      if (lk) { const out = {}; lk.split(',').filter(k => KINDS.includes(k)).forEach(k => { out[k] = list(k); }); if (lk.split(',').includes('raidarea')) out.raidarea = raList(); out.areaFile = fs.existsSync(fileOf('area')); return { code: 200, body: out }; }
      const kind = q.get('kind') || '', id = q.get('id');
      if (kind === 'raidarea' && id) return raHandle(method, id, body, action);
      if (!KINDS.includes(kind) || id === null || id === '') return { code: 400, body: { error: 'kind (room|zone|spot|area|raidarea) and id required' } };
      if (method === 'POST') return save(kind, id, body || {}, action === 'reset');
      const L = load(kind); if (!L) return { code: 404, body: { error: FILES[kind] + ' does not exist yet' } };
      const hit = find(kind, L.data, id); if (!hit) return { code: 404, body: { error: 'not found: ' + id } };
      return { code: 200, body: { kind, id: idOf(kind, hit.raw, hit.idx), file: 'Scripts/data/' + FILES[kind], rev: sha(hit.raw), item: toItem(kind, hit), orig: hit.raw.edited && hit.raw.edited.orig ? true : false,
        context: context(kind, hit, L.data), live: LIVE[kind] } };
    } catch (e) { return { code: 500, body: { error: e.message } }; }
  }
  return { handle, merge, _t: { validate, selfX, area, inPoly, toItem, find, load, geocheck, list, JOBS, raValidate, raItem, raList, raDefaultStage } };
};
