// WORLD LAYERS (owner 2026-10-25: "Why can't I see the /map like the combat zones so I can see all available zones / dungeons etc?"): one compact
// answer for the world map's switchable layers (Dashboard/maplayers.js): every hunting place we know, in world coordinates.
//   zones    Scripts/data/custom_zones.json      our own hunting zones (circle or polygon, level band, team, enabled)
//   fields   Scripts/data/field_areas.json       every outdoor hunting area (geodata polygon, levels, top monsters, region)
//   spots    Scripts/data/hunting_spots_h5.json  datapack hunting spots (centre, levels, way there)
//   dungeons Scripts/data/dungeon_rooms.json     every dungeon: entrance, levels, floors, rooms
//   raids    Scripts/data/raidbosses_h5.json     raid bosses (level, where)
// GET /api/worldlayers (key) -> { at, zones[], spots[], dungeons[], raids[], fieldCount }; ?part=fields -> { fields[] } (poly = flat x,y,...);
// rebuilt only when one of the files changed.
'use strict';
const fs = require('fs'), path = require('path');
let CACHE = { sig: '', body: null, fields: null };
const rj = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch (e) { return d; } };
const r10 = (v) => Math.round(Number(v) / 10) * 10;
const pts = (P) => (Array.isArray(P) ? P : []).map(p => Array.isArray(p) ? [r10(p[0]), r10(p[1])] : [r10(p.x), r10(p.y)]).filter(p => isFinite(p[0]) && isFinite(p[1]));
// outlines for the world map: Douglas-Peucker at 60 units (a field area is thousands of units wide; the dashboard's area pages keep the exact ones)
function simp(P, eps) {
  if (P.length <= 8) return P;
  const keep = new Uint8Array(P.length); keep[0] = keep[P.length - 1] = 1; const st = [[0, P.length - 1]];
  while (st.length) { const [a, b] = st.pop(); let md = -1, mi = -1; const A = P[a], B = P[b], L = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1e-9;
    for (let i = a + 1; i < b; i++) { const d = Math.abs((B[0] - A[0]) * (A[1] - P[i][1]) - (A[0] - P[i][0]) * (B[1] - A[1])) / L; if (d > md) { md = d; mi = i; } }
    if (md > eps) { keep[mi] = 1; st.push([a, mi], [mi, b]); } }
  return P.filter((_, i) => keep[i]);
}
const lv = (a) => Array.isArray(a) && a.length ? [Number(a[0]) || null, Number(a[a.length - 1]) || null] : null;
const top = (ms, n) => (ms || []).slice().sort((a, b) => (b.count || 0) - (a.count || 0)).slice(0, n).map(m => `${m.name} ${m.level || ''}${m.aggressive ? ' A' : ''}`.trim());

function build(ctx) {
  const D = ctx.DATA, files = ['custom_zones.json', 'field_areas.json', 'hunting_spots_h5.json', 'dungeon_rooms.json', 'raidbosses_h5.json'].map(f => path.join(D, f));
  const sig = files.map(f => { try { return fs.statSync(f).mtimeMs; } catch (e) { return 0; } }).join('|');
  if (CACHE.sig === sig && CACHE.body) return CACHE;
  const out = { at: new Date().toISOString(), zones: [], fields: [], spots: [], dungeons: [], raids: [] };
  // own zones
  const cz = rj(files[0], {}), zl = Array.isArray(cz) ? cz : (cz.zones || []);
  zl.forEach(z => { if (!z || !isFinite(Number(z.x))) return; out.zones.push({ name: z.name, x: r10(z.x), y: r10(z.y), r: Number(z.radius) || 0, poly: z.poly ? pts(z.poly) : null, lv: [z.levelMin || null, z.levelMax || null], team: z.team || '', on: z.enabled !== false, way: z.gkDesc || '' }); });
  // field areas (poly = flat x,y,x,y: half the bytes)
  const fa = rj(files[1], {}), regions = Array.isArray(fa) ? fa : (fa.regions || Object.values(fa));
  (regions || []).forEach(R => (R && R.areas || []).forEach(a => { const p = simp(pts(a.poly), 60); if (p.length < 3) return;
    out.fields.push({ id: a.id, region: R.name, name: a.name || R.name, poly: [].concat(...p), c: a.center ? [r10(a.center[0] != null ? a.center[0] : a.center.x), r10(a.center[1] != null ? a.center[1] : a.center.y)] : null, lv: lv(a.levelRange), n: a.spawnCount || 0, mobs: top(a.monsters, 3), boss: (a.raidBosses || []).map(b => b.name || b).slice(0, 2) }); }));
  // datapack spots
  const hs = rj(files[2], []), sl = Array.isArray(hs) ? hs : (hs.spots || Object.values(hs));
  (sl || []).forEach(s => { const c = s && s.center; if (!c || !isFinite(Number(c.x))) return; out.spots.push({ name: s.name, x: r10(c.x), y: r10(c.y), lv: [s.levelMin || null, s.levelMax || null], way: (s.gk && s.gk.desc) || '', mobs: top(s.mobs, 3) }); });
  // dungeons: the entrance (else the middle of the first floor's rooms)
  (rj(files[3], []) || []).forEach(d => { if (!d) return; const rooms = [].concat(...(d.floors || []).map(f => f.rooms || []));
    let e = d.entrance && (Array.isArray(d.entrance) ? d.entrance : d.entrance.at || (isFinite(Number(d.entrance.x)) ? [d.entrance.x, d.entrance.y] : null));
    if (!e && d.gatekeeperRoute && Array.isArray(d.gatekeeperRoute.landing)) e = d.gatekeeperRoute.landing;
    if (!e && rooms.length) { const c = rooms.filter(r => r.center); if (c.length) e = [c.reduce((t, r) => t + r.center[0], 0) / c.length, c.reduce((t, r) => t + r.center[1], 0) / c.length]; }
    if (!e) return;
    out.dungeons.push({ key: d.key, name: d.name, x: r10(e[0]), y: r10(e[1]), lv: lv(d.levelRange), floors: (d.floors || []).length, rooms: rooms.length, town: d.town || '', way: typeof d.gatekeeperRoute === 'string' ? d.gatekeeperRoute : d.gatekeeperRoute && d.gatekeeperRoute.town ? `${d.gatekeeperRoute.town} -> ${d.gatekeeperRoute.destination || d.name}` : '' }); });
  // raid bosses
  const rb = rj(files[4], {}), bl = Array.isArray(rb) ? rb : (rb.bosses || []);
  bl.forEach(b => { if (!b || !isFinite(Number(b.x))) return; out.raids.push({ id: b.id, name: b.name, lv: b.level, x: r10(b.x), y: r10(b.y), zone: b.zoneName || b.zone || '', type: b.type || 'raid' }); });
  const fields = out.fields; out.fields = []; out.fieldCount = fields.length;
  CACHE = { sig, body: JSON.stringify(out), fields: JSON.stringify({ at: out.at, fields }) };
  return CACHE;
}
// ---- ZONEINFO-2026-10-25 (owner: "click a room or hunting zone under /map and see monsters and drops from the specific zone") ----
// GET /api/zoneinfo?kind=field|room|dungeon|spot|zone&id=<area id | room id | dungeon key | spot name | zone name>
//   -> { name, kind, lv, monsters: [{ id, name, level, count, aggressive, hp, kill: [[item, name, min, max, %]], spoil: [...] }], best: [...] }
// best = the zone's items ranked by expected drops per hour-ish weight: sum over its monsters of count x chance (kill and spoil apart)
let DROPS = { mt: 0, j: null }, NPCS = { mt: 0, j: null }, ITEMS = null;
const cached = (C, f) => { try { const mt = fs.statSync(f).mtimeMs; if (C.mt !== mt) { C.mt = mt; C.j = rj(f, null); } } catch (e) { } return C.j; };
function itemName(ctx, id) { if (!ITEMS) ITEMS = rj(path.join(ctx.DIR, 'data', 'items.json'), {}) || {}; const r = ITEMS[id]; return r ? r[0] : 'item ' + id; }
function monstersOf(ctx, kind, id) {
  const D = ctx.DATA;
  if (kind === 'field') { for (const R of (rj(path.join(D, 'field_areas.json'), {}).regions || [])) { const a = (R.areas || []).find(x => x.id === id); if (a) return { name: a.name, lv: a.levelRange, region: R.id, regionName: R.name, list: a.monsters || [] }; } return null; }
  const DR = rj(path.join(D, 'dungeon_rooms.json'), []) || [];
  if (kind === 'room') { for (const d of DR) for (const F of d.floors || []) { const r = (F.rooms || []).find(x => x.id === id); if (r) return { name: r.name, lv: r.levelRange, dungeon: d.name, dungeonKey: d.key, floor: F.name, list: r.monsters || [] }; } return null; }
  if (kind === 'dungeon') { const d = DR.find(x => x.key === id); if (!d) return null; const by = {};
    (d.floors || []).forEach(F => (F.rooms || []).forEach(r => (r.monsters || []).forEach(m => { const e = by[m.id] = by[m.id] || Object.assign({}, m, { count: 0 }); e.count += m.count || 0; })));
    return { name: d.name, lv: d.levelRange, dungeon: d.name, dungeonKey: d.key, rooms: [].concat(...(d.floors || []).map(F => (F.rooms || []).map(r => ({ id: r.id, name: r.name, floor: F.name, lv: r.levelRange, n: r.spawnCount || 0 })))), list: Object.values(by) }; }
  if (kind === 'spot') { const H = rj(path.join(D, 'hunting_spots_h5.json'), []), sp = (Array.isArray(H) ? H : (H.spots || [])).find(x => x.name === id); return sp ? { name: sp.name, lv: [sp.levelMin, sp.levelMax], way: sp.gk && sp.gk.desc, list: sp.mobs || [] } : null; }
  if (kind === 'zone') { const Z = rj(path.join(D, 'custom_zones.json'), {}), z = (Array.isArray(Z) ? Z : (Z.zones || [])).find(x => x.name === id); if (!z) return null;
    const N = cached(NPCS, path.join(D, 'npcs_h5.json')) || {}, by = {};
    (rj(path.join(D, 'spawns_h5.json'), []) || []).forEach(p => { if (Math.hypot(p.x - z.x, p.y - z.y) > (z.radius || 3000) || Math.abs(p.z - (z.z || p.z)) > 600) return; const n = N[p.id]; if (!n || !/Monster/.test(n.ty || '')) return;
      const e = by[p.id] = by[p.id] || { id: p.id, name: n.n, level: n.l, count: 0, aggressive: (n.ag || 0) > 0 }; e.count += p.count || 1; });
    return { name: z.name, lv: [z.levelMin, z.levelMax], list: Object.values(by) }; }
  return null;
}
function zoneInfo(ctx, kind, id) {
  const Z = monstersOf(ctx, kind, id); if (!Z) return { code: 404, error: 'unknown place' };
  const DR = (cached(DROPS, path.join(ctx.DATA, 'drops_h5.json')) || {}).monsters || {}, N = cached(NPCS, path.join(ctx.DATA, 'npcs_h5.json')) || {};
  const best = { kill: {}, spoil: {} };
  const monsters = Z.list.filter(m => m && m.id).map(m => { const d = DR[m.id] || { k: [], s: [] }, n = N[m.id] || {}, cnt = Number(m.count) || 1;
    const fmt = (L) => L.map(x => [x[0], itemName(ctx, x[0]), x[1], x[2], x[3]]);
    d.k.forEach(x => { if (x[0] !== 57) best.kill[x[0]] = (best.kill[x[0]] || 0) + cnt * x[3] / 100 * (x[1] + x[2]) / 2; });
    d.s.forEach(x => { best.spoil[x[0]] = (best.spoil[x[0]] || 0) + cnt * x[3] / 100 * (x[1] + x[2]) / 2; });
    const ad = d.k.find(x => x[0] === 57);
    return { id: m.id, name: m.name || n.n, level: m.level || n.l, count: cnt, aggressive: !!m.aggressive, hp: n.hp || null, adena: ad ? [ad[1], ad[2], ad[3]] : null, kill: fmt(d.k.filter(x => x[0] !== 57).slice(0, 12)), spoil: fmt(d.s.slice(0, 8)) }; })
    .sort((a, b) => b.count - a.count);
  const rank = (o) => Object.entries(o).filter(([id]) => !/Herb of /.test(itemName(ctx, id))).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([id, v]) => [Number(id), itemName(ctx, id), Math.round(v * 1000) / 1000]);
  return Object.assign({ ok: true, kind, id, monsters, bestKill: rank(best.kill), bestSpoil: rank(best.spoil) }, Z, { list: undefined });
}
// ---- HUNTSETS-2026-10-25 (owner: "create my own zones by combining different zones to 1 and saving them so I can use them with the team and
// assign it to a group or character to hunt there"): Scripts/data/hunt_sets.json { sets: [{ id, name, kind field|rooms, region|dungeon, ids[], order, note, at }] }.
// The bots rotate inside ONE outdoor region or ONE dungeon (party_spots.json kind field / rooms), so a set holds areas of one region or rooms of
// one dungeon. Assigning = the normal party spot (POST /api/partyspot) from the page; this file only keeps the owner's named sets.
const HSF = (ctx) => path.join(ctx.DATA, 'hunt_sets.json');
function setsSave(ctx, b) {
  const all = rj(HSF(ctx), { sets: [] }) || { sets: [] }; all.sets = all.sets || [];
  try { if (fs.existsSync(HSF(ctx))) { const bk = path.join(ctx.ROOT, 'Settings', 'backup'); fs.mkdirSync(bk, { recursive: true }); fs.copyFileSync(HSF(ctx), path.join(bk, 'hunt_sets_' + Date.now() + '.json')); } } catch (e) { }
  if (b.action === 'delete') { all.sets = all.sets.filter(x => x.id !== String(b.id || '')); }
  else {
    const S = b.set || {}, kind = S.kind === 'rooms' ? 'rooms' : S.kind === 'field' ? 'field' : null; if (!kind) return { code: 400, error: 'kind field or rooms' };
    const name = String(S.name || '').replace(/[<>\r\n]/g, '').trim().slice(0, 60); if (!name) return { code: 400, error: 'name required' };
    const ids = [...new Set((S.ids || []).map(String))].slice(0, 40); if (!ids.length) return { code: 400, error: 'pick at least one area / room' };
    let where = '';
    if (kind === 'field') { const R = (rj(path.join(ctx.DATA, 'field_areas.json'), {}).regions || []).find(r => ids.every(id => (r.areas || []).some(a => a.id === id))); if (!R) return { code: 400, error: 'all areas of one set must be in the same region (the bots rotate inside one region)' }; where = R.id; }
    else { const d = (rj(path.join(ctx.DATA, 'dungeon_rooms.json'), []) || []).find(x => ids.every(id => (x.floors || []).some(F => (F.rooms || []).some(r => r.id === id)))); if (!d) return { code: 400, error: 'all rooms of one set must be in the same dungeon' }; where = d.name; }
    const id = String(S.id || '') || 'hs_' + Date.now().toString(36);
    const e = { id, name, kind, [kind === 'field' ? 'region' : 'dungeon']: where, ids, order: S.order === 'rotate' ? 'rotate' : 'nearest', note: String(S.note || '').slice(0, 200), at: new Date().toISOString() };
    const i = all.sets.findIndex(x => x.id === id); if (i >= 0) all.sets[i] = e; else all.sets.push(e);
  }
  const tmp = HSF(ctx) + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(all, null, 1)); fs.renameSync(tmp, HSF(ctx));
  return { ok: true, sets: all.sets };
}
async function handle(req, res, url, ctx) {
  if (url.pathname === '/maplayers.js') { res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-cache' }); res.end(fs.readFileSync(path.join(ctx.DIR, 'maplayers.js'))); return true; }
  if (url.pathname === '/api/zoneinfo' || url.pathname === '/api/huntsets') {
    if (!ctx.allowed(req, url)) { ctx.json(res, 401, { error: 'key' }); return true; }
    const out = (r) => { const code = (r && r.code) || 200; if (r) delete r.code; ctx.json(res, code, r); };
    try {
      if (url.pathname === '/api/zoneinfo') { out(zoneInfo(ctx, String(url.searchParams.get('kind') || ''), String(url.searchParams.get('id') || ''))); return true; }
      if (req.method === 'POST') { let t = ''; for await (const c of req) t += c; let b; try { b = JSON.parse(t || '{}'); } catch (e) { out({ code: 400, error: 'bad JSON' }); return true; } out(setsSave(ctx, b)); return true; }
      out({ ok: true, sets: (rj(HSF(ctx), { sets: [] }) || {}).sets || [] }); return true;
    } catch (e) { out({ code: 500, error: e.message }); return true; }
  }
  if (url.pathname !== '/api/worldlayers') return false;
  if (!ctx.allowed(req, url)) { ctx.json(res, 401, { error: 'key' }); return true; }
  // the 1 MB field outlines only when that layer is switched on (?part=fields)
  try { const C = build(ctx), body = url.searchParams.get('part') === 'fields' ? C.fields : C.body; res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' }); res.end(body); }
  catch (e) { ctx.json(res, 500, { error: e.message }); }
  return true;
}
module.exports = { handle, build, zoneInfo, setsSave, monstersOf };
