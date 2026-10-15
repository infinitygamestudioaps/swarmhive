// MAP FLOORS (user 2026-10-13 09:37, phone screenshots: "Looks like it's still showing monsters from different levels in a dungeon and shows
// areas from the dungeon on outside hunting zones"). Every dashboard map shows only what is on the SAME floor / level as the map's viewer
// (party leader, character, escaping character):
//   - inside a dungeon (Scripts/data/dungeon_rooms.json: bbox + floors[].z bands + rooms) the floor is decided like swarm.js dzFloor():
//     inside the dungeon's bbox, z within a floor band +-300 (nearest band centre wins), and - new here - within that floor's own area (its room
//     centres +-2500, the same area /api/maplayersz uses to pick the map layer, so the surface next to a tower is not taken for a floor);
//   - a point on no floor = "surface": a surface viewer never gets dungeon floor rooms, characters or monsters; a floor viewer never gets surface
//     ones or other floors' ones; a point between two floor bands of the same dungeon (stairs) counts as the floor when |dz| <= 300;
//   - surface vs surface (no floor data at all) keeps the old |dz| rule (monsters 600, characters 1500).
// Shared, one file (UMD): Dashboard/server.js + liveparty_api.js (require: MapFloors.load(file) caches the compact model by the file's mtime)
// and the browser maps (window.MapFloors, model from GET /api/mapfloors, public, loaded once with retries).
// Test: node docs/plan/tools/test_map_floors.js
(function (root, factory) {
  const M = factory();
  if (typeof module === 'object' && module.exports) module.exports = M; else root.MapFloors = M;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const BAND = 300;          // a floor band's margin (swarm.js zFloorIdx)
  const AREA = 2500;         // a floor's x/y area = its room centres +- AREA (server.js /api/maplayersz)
  const GAP_DZ = 300;        // between two floor bands of the same dungeon (stairs): same level only this close in height
  const MOB_DZ = 600;        // surface fallback for monsters / NPCs (the old rule, 2026-10-12)
  const CHAR_DZ = 1500;      // surface fallback for characters (underground places that are not in dungeon_rooms.json)
  const fin = (v) => v !== null && v !== undefined && v !== '' && isFinite(+v);

  /** dungeon_rooms.json -> { v, dungeons: [{ key, name, bbox:[x0,x1,y0,y1], floors: [{ n, z:[lo,hi]|null, box:[x0,y0,x1,y1]|null }] }], rooms: { id: { k, d, fi, n } } } */
  function build(D) {
    const out = { v: 1, dungeons: [], rooms: {} };
    (Array.isArray(D) ? D : []).forEach(d => {
      if (!d || !Array.isArray(d.bbox) || d.bbox.length < 4 || !d.bbox.every(fin)) return;
      const key = String(d.key || d.name || '');
      const floors = [];
      let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
      (d.floors || []).forEach((F, fi) => {
        const z = Array.isArray(F.z) && F.z.length >= 2 && fin(F.z[0]) && fin(F.z[1]) ? [Math.min(+F.z[0], +F.z[1]), Math.max(+F.z[0], +F.z[1])] : null;
        // the floor's own area: room centres + outlines, its landing / entry point, safe spots, teleporter devices (only points of this band)
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        const add = (p) => {
          const q = Array.isArray(p) ? { x: p[0], y: p[1], z: p[2] } : p;
          if (!q || !fin(q.x) || !fin(q.y)) return;
          if (z && fin(q.z) && (+q.z < z[0] - BAND || +q.z > z[1] + BAND)) return;
          x0 = Math.min(x0, +q.x); y0 = Math.min(y0, +q.y); x1 = Math.max(x1, +q.x); y1 = Math.max(y1, +q.y);
        };
        (F.rooms || []).forEach(r => {
          if (!r) return;
          if (Array.isArray(r.center)) add(r.center);
          (Array.isArray(r.poly) ? r.poly : []).forEach(q => add([q[0], q[1]]));
          if (r.id) out.rooms[r.id] = { k: key + '#' + fi, d: key, fi, n: F.name || ('floor ' + (fi + 1)) };
        });
        if (F.enter && F.enter.landing) add(F.enter.landing);
        if (F.entryPoint && F.entryPoint.at) add(F.entryPoint.at);
        (F.safeSpots || []).forEach(add);
        (F.links || []).forEach(l => { if (l && l.at) add(l.at); });
        const box = isFinite(x0) ? [x0 - AREA, y0 - AREA, x1 + AREA, y1 + AREA] : null;
        if (box) { bx0 = Math.min(bx0, box[0]); by0 = Math.min(by0, box[1]); bx1 = Math.max(bx1, box[2]); by1 = Math.max(by1, box[3]); }
        floors.push({ n: F.name || ('floor ' + (fi + 1)), z, box });
      });
      // the dungeon's box grows to hold every floor's area (a few rooms of Antharas' Lair / Elven Fortress lie just outside the data bbox)
      const bb = d.bbox.map(Number), bbox = [Math.min(bb[0], bx0), Math.max(bb[1], bx1), Math.min(bb[2], by0), Math.max(bb[3], by1)];
      out.dungeons.push({ key, name: d.name || key, bbox, floors });
    });
    return out;
  }

  /** where a point is: null = no dungeon around it (surface); { k, d, dn, fi, n } = on floor fi of dungeon d (k = 'key#fi');
   *  { k: null, d, dn, fi: -1 } = inside a dungeon's bbox but on no floor (its door / the surface above it / stairs between floors) */
  function floorOf(M, x, y, z) {
    if (!M || !fin(x) || !fin(y) || !fin(z)) return null;
    x = +x; y = +y; z = +z;
    let door = null;
    for (const d of M.dungeons || []) {
      const b = d.bbox; if (x < b[0] || x > b[1] || y < b[2] || y > b[3]) continue;
      let best = -1, bd = Infinity;
      d.floors.forEach((f, i) => {
        if (!f.z || z < f.z[0] - BAND || z > f.z[1] + BAND) return;
        if (f.box && (x < f.box[0] || x > f.box[2] || y < f.box[1] || y > f.box[3])) return;
        const c = Math.abs(z - (f.z[0] + f.z[1]) / 2); if (c < bd) { bd = c; best = i; }
      });
      if (best >= 0) return { k: d.key + '#' + best, d: d.key, dn: d.name, fi: best, n: d.floors[best].n };
      if (!door) door = { k: null, d: d.key, dn: d.name, fi: -1, n: '' };
    }
    return door;
  }
  const P = (p) => p && fin(p.x) && fin(p.y) && fin(p.z) ? p : null;
  /** 'surface' | 'cruma#1' (null when the height is unknown) */
  function levelKey(M, p) { if (!P(p)) return null; const f = floorOf(M, p.x, p.y, p.z); return f && f.k ? f.k : 'surface'; }
  /** a readable name: 'surface' | 'Cruma Tower, 2nd floor' | '' (unknown) */
  function levelName(M, p) { if (!P(p)) return ''; const f = floorOf(M, p.x, p.y, p.z); return f && f.k ? f.dn + ', ' + f.n : 'surface'; }

  /** are a and b ({x,y,z}) on the same floor / level? Unknown height = true (nothing to decide on). tol = the |dz| rule when neither is on a
   *  dungeon floor (default MOB_DZ; Infinity = no height rule outside dungeons). Without a model: the |dz| rule only. */
  function sameLevel(M, a, b, tol) {
    if (!P(a) || !P(b)) return true;
    const t = tol == null ? MOB_DZ : tol, dz = Math.abs(+a.z - +b.z);
    if (!M) return dz <= t;
    const fa = floorOf(M, a.x, a.y, a.z), fb = floorOf(M, b.x, b.y, b.z), ka = fa && fa.k, kb = fb && fb.k;
    if (ka && kb) return ka === kb;
    if (ka || kb) {
      const fl = ka ? fa : fb, other = ka ? fb : fa;
      return !!(other && other.d === fl.d) && dz <= GAP_DZ;        // stairs between two floor bands of the same dungeon
    }
    return dz <= t;
  }
  /** the level of a dungeon room by its id: { k, d, fi, n } | null (not a dungeon room) */
  function roomLevel(M, roomId) { return M && roomId && M.rooms ? M.rooms[roomId] || null : null; }
  /** may a dungeon room's outline be drawn on the viewer's map? true / false; null = not a known room (caller decides) */
  function roomOnLevel(M, viewer, roomId) {
    const r = roomLevel(M, roomId); if (!r) return null;
    const k = levelKey(M, viewer); return k == null ? true : k === r.k;
  }
  /** a hunting zone / chosen spot ({ x, y, room?, zr?:[lo,hi], z? }): dungeon room = its floor; field area / square = its height band's level;
   *  nothing known = true. Areas only compare the LEVEL (no |dz| rule: a field area spans hills). */
  function zoneOnLevel(M, viewer, zone) {
    if (!zone) return false;
    const vk = levelKey(M, viewer); if (vk == null || !M) return true;
    const r = roomLevel(M, zone.room); if (r) return vk === r.k;
    const zr = Array.isArray(zone.zr) && fin(zone.zr[0]) && fin(zone.zr[1]) ? (+zone.zr[0] + +zone.zr[1]) / 2 : fin(zone.z) ? +zone.z : null;
    if (zr == null || !fin(zone.x) || !fin(zone.y)) return true;
    return levelKey(M, { x: zone.x, y: zone.y, z: zr }) === vk;
  }

  // ---- node: compact model cached by the file's mtime + size (stat at most every 2 s; the 2.3 MB file is parsed only when it changes) ----
  const C = { file: null, mtime: 0, size: 0, model: null, checked: 0 };
  function load(file) {
    const now = Date.now();
    if (C.file === file && C.model && now - C.checked < 2000) return C.model;
    try {
      const fs = require('fs'), st = fs.statSync(file);
      C.checked = now;
      if (C.file === file && C.model && st.mtimeMs === C.mtime && st.size === C.size) return C.model;
      const model = build(JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')));
      Object.assign(C, { file, mtime: st.mtimeMs, size: st.size, model });
      return model;
    } catch (e) { C.checked = now; return C.file === file ? C.model : null; }
  }

  // ---- MAP ART follows the viewer's floor (user 2026-10-13 10:25: "when you teleport into a catacomb or another dungeon, the map must switch by
  // itself"). trackLevel() keeps ONE stable level per map viewer: a teleport (x/y jump >= 2500 or |dz| >= 800 since the last look) switches at
  // once; walking (stairs, a slope) switches only after the new level was seen on 2 looks >= 1 s apart (one look per data refresh), and a
  // point between two floor bands of the same dungeon (stairs) keeps the floor. tileSuffix() then picks each map piece: surface -> the world art,
  // a dungeon floor -> that floor's underground layer (/api/maplayersz table) or null = NO art for this floor here (the caller draws the floor's
  // room outlines on a dark background instead; never the surface art under an underground position).
  const JUMP_XY = 2500, JUMP_Z = 800, LOOK_MS = 1000;
  function lvlOf(M, k) {
    if (!k || k === 'surface') return { k: 'surface', d: null, dn: '', fi: -1, n: 'surface', z: null };
    const [dk, fs] = k.split('#'), d = M && (M.dungeons || []).find(x => x.key === dk), fi = +fs, f = d && d.floors[fi];
    return { k, d: dk, dn: d ? d.name : dk, fi, n: f ? f.n : '', z: f ? f.z : null };
  }
  /** the level a position would get on its own: a floor key, 'surface', or 'door:<dungeon>' (inside a dungeon box, on no floor band) */
  function rawLevel(M, p) {
    const f = floorOf(M, p.x, p.y, p.z);
    return f && f.k ? f.k : f ? 'door:' + f.d : 'surface';
  }
  /** a 'door:' point (inside a dungeon's box, on no floor band / outside the floor areas). FIX 2026-10-13 13:52 (party Char1 OUTDOORS at
   *  6120,-107059,-2336 got 'caveoftrials#0' = the dark Cave of Trials layer, because a door point took any floor within 800 of its band):
   *  only a point in the GAP between two floor bands of that dungeon (stairs between floors, x/y inside one of their floor areas) counts as a
   *  floor — the current one when it is one of the two, else the nearer one. Anything else (above / below every band, in a band but outside
   *  the floor's area, a one-floor dungeon) is the SURFACE, exactly like floorOf() / levelKey(). */
  function doorLevel(M, raw, p, cur) {
    const dk = raw.slice(5), d = M && (M.dungeons || []).find(x => x.key === dk); if (!d) return 'surface';
    const x = +p.x, y = +p.y, z = +p.z;
    const inBox = (f) => !f.box || (x >= f.box[0] && x <= f.box[2] && y >= f.box[1] && y <= f.box[3]);
    const fl = d.floors.map((f, i) => ({ f, i })).filter(o => o.f.z).sort((a, b) => a.f.z[0] - b.f.z[0]);
    for (let k = 0; k + 1 < fl.length; k++) {
      const lo = fl[k], hi = fl[k + 1];
      if (!(z > lo.f.z[1] + BAND && z < hi.f.z[0] - BAND) || !(inBox(lo.f) || inBox(hi.f))) continue;
      const kl = dk + '#' + lo.i, kh = dk + '#' + hi.i;
      if (cur === kl || cur === kh) return cur;
      return z - lo.f.z[1] <= hi.f.z[0] - z ? kl : kh;
    }
    return 'surface';
  }
  /** S = this viewer's state object (kept by the caller), p = {x,y,z}, now = ms. Returns the stable level + changed (switched on this look). */
  function trackLevel(M, S, p, now) {
    S = S || {};
    if (!P(p)) { const L0 = lvlOf(M, S.k || 'surface'); L0.changed = false; return L0; }
    let raw = rawLevel(M, p);
    if (!S.k) {                                            // first look: a door point goes to the nearest floor (stairs) or the surface
      S.k = raw.startsWith('door:') ? doorLevel(M, raw, p, null) : raw;
      Object.assign(S, { px: +p.x, py: +p.y, pz: +p.z, cand: null, n: 0, lookAt: now });
      const L1 = lvlOf(M, S.k); L1.changed = true; return L1;
    }
    if (raw.startsWith('door:')) raw = doorLevel(M, raw, p, S.k);   // stairs between two floors keep my floor; anything else = surface
    const jump = Math.hypot(+p.x - S.px, +p.y - S.py) >= JUMP_XY || Math.abs(+p.z - S.pz) >= JUMP_Z;
    let changed = false;
    if (raw === S.k) { S.cand = null; S.n = 0; }
    else if (jump) { S.k = raw; S.cand = null; S.n = 0; changed = true; }
    else {
      if (S.cand !== raw) { S.cand = raw; S.n = 1; S.lookAt = now; }
      else if (now - S.lookAt >= LOOK_MS) { S.n++; S.lookAt = now; }
      if (S.n >= 2) { S.k = raw; S.cand = null; S.n = 0; changed = true; }
    }
    S.px = +p.x; S.py = +p.y; S.pz = +p.z;
    const L = lvlOf(M, S.k); L.changed = changed; return L;
  }
  /** the map piece suffix for region rx_ry: '' = world art, '_L<n>' = underground layer, null = no art for this floor (draw outlines).
   *  zmap = /api/maplayersz ({ 'X_Y': [[zlo, zhi, layer, bx0, by0, bx1, by1], ...] }), layers = /api/maplayers ({ 'X_Y': [1, 2] }), p = the viewer */
  function tileSuffix(lvl, rx, ry, p, zmap, layers) {
    const key = rx + '_' + ry;
    if (!lvl || lvl.k === 'surface') return '';   // a surface viewer ALWAYS gets the world art (fix 2026-10-13 13:52: no layer guess from the height)
    if (!lvl.z) return null;
    const mid = (lvl.z[0] + lvl.z[1]) / 2, Z = (zmap || {})[key];
    if (!Z) return null;
    const x = P(p) ? +p.x : null, y = P(p) ? +p.y : null;
    const e = Z.find(t => mid >= t[0] && mid <= t[1] && (x == null || t.length < 7 || (x >= t[3] && y >= t[4] && x <= t[5] && y <= t[6])));
    return e ? '_L' + e[2] : null;
  }

  // ---- browser: the model from /api/mapfloors (public), retried until it arrives; maps re-render on 'mapfloors:ready' ----
  const B = { model: null, tries: 0, pending: false };
  function fetchModel() {
    if (typeof fetch !== 'function' || B.model || B.pending) return;
    B.pending = true;
    fetch('/api/mapfloors?t=' + Date.now(), { cache: 'no-store' }).then(r => { /* never the browser's copy: a new dungeon must show up (2026-10-14) */ if (!r.ok) throw new Error(r.status); return r.json(); }).then(m => {
      B.pending = false;
      if (!m || !Array.isArray(m.dungeons)) throw new Error('bad model');
      B.model = m;
      try { window.dispatchEvent(new Event('mapfloors:ready')); } catch (e) { }
    }).catch(() => { B.pending = false; B.tries++; setTimeout(fetchModel, Math.min(30000, 2000 * B.tries)); });
  }
  if (typeof window !== 'undefined' && typeof document !== 'undefined') fetchModel();
  // CAVES 2026-10-14: the dungeon list and the floor-map index are fetched again every 10 min (a new dungeon / map without a page reload)
  if (typeof window !== 'undefined' && typeof document !== 'undefined') setInterval(() => { try { if (typeof fetch !== 'function') return; fetch('/api/mapfloors?t=' + Date.now(), { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(m => { if (m && Array.isArray(m.dungeons)) { B.model = m; try { window.dispatchEvent(new Event('mapfloors:ready')); } catch (e) { } } }).catch(() => { }); if (typeof FM !== 'undefined' && !FM.pending) { FM.tries = 0; fetch('/icons/floormaps/index.json?t=' + Date.now(), { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(j => { if (j) FM.idx = j; }).catch(() => { }); } } catch (e) { } }, 600000);   // the old model stays until the new one is here (no flicker)
  const get = () => B.model;
  // one stable level per map viewer id ('pmap:<leader>', 'cp:<name>', 'lp:<name>', 'esc:<name>', 'mini:<name>')
  const VIEW = {};
  // no tracking before the model arrives (a first look without floor data would pin the viewer to the surface until 2 more looks)
  function view(id, p) { if (!B.model) return null; const S = VIEW[id] || (VIEW[id] = {}); return trackLevel(B.model, S, p, Date.now()); }
  function tile(lvl, rx, ry, p) {
    const W = typeof window !== 'undefined' ? window : {};
    if (!B.model) return P(p) && +p.z < -4500 && W.MAP_LAYERS && W.MAP_LAYERS[rx + '_' + ry] ? '_L1' : '';   // model not loaded yet: old rule
    return tileSuffix(lvl, rx, ry, p, W.MAP_ZMAP, W.MAP_LAYERS);
  }
  // FLOOR MAPS 2026-10-14 (docs/plan/tools/floor_maps.js -> Dashboard/floormaps): { dungeon name: { floor index: { f, x, y, w, h } } }, fetched once
  const FM = { idx: null, pending: false, tries: 0 };
  function floorPic(lvl) {
    if (!FM.idx) {
      if (!FM.pending && typeof fetch === 'function' && FM.tries < 5) { FM.pending = true; fetch('/icons/floormaps/index.json?t=' + Date.now(), { cache: 'no-store' }).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }).then(j => { FM.idx = j || {}; FM.pending = false; try { window.dispatchEvent(new Event('mapfloors:ready')); } catch (e) { } }).catch(() => { FM.pending = false; FM.tries++; }); }
      return '';
    }
    const e = (FM.idx[lvl.dn] || {})[lvl.fi]; if (!e) return '';
    return `<image href="/icons/floormaps/${e.f}${e.v ? '?v=' + e.v : ''}" x="${e.x}" y="${e.y}" width="${e.w}" height="${e.h}" preserveAspectRatio="none" pointer-events="none" style="image-rendering:pixelated"/>`;
  }
  // room outlines of a floor without map art (/api/dungeonmap through index.html's api(), cached per dungeon; maps re-render on mapfloors:ready)
  const DM = {};
  function plainLayer(lvl, u) {
    if (!lvl || lvl.k === 'surface' || !lvl.dn) return '';
    const c = DM[lvl.dn];
    if (!c) {
      DM[lvl.dn] = { at: Date.now(), m: null };
      try {
        const get2 = typeof api === 'function' ? api('/api/dungeonmap?name=' + encodeURIComponent(lvl.dn)) : Promise.reject(new Error('no api'));   // eslint-disable-line no-undef
        get2.then(m => { if (m && !m.error) { DM[lvl.dn].m = m; try { window.dispatchEvent(new Event('mapfloors:ready')); } catch (e) { } } }).catch(() => { });
      } catch (e) { }
      return '';
    }
    if (!c.m) { if (Date.now() - c.at > 60000) delete DM[lvl.dn]; return ''; }
    const F = (c.m.floors || [])[lvl.fi]; if (!F) return '';
    let s = floorPic(lvl);   // FLOOR MAPS 2026-10-14: the floor drawn from the geodata under the room outlines
    (F.rooms || []).forEach(r => {
      if (!Array.isArray(r.poly) || r.poly.length < 3) return;
      s += `<polygon points="${r.poly.map(q => q[0] + ',' + q[1]).join(' ')}" fill="rgba(120,150,160,.16)" stroke="#7d9aa5" stroke-width="${1.2 * u}" pointer-events="none"/>`;
    });
    return s;
  }

  return {
    BAND, AREA, GAP_DZ, MOB_DZ, CHAR_DZ,
    build, floorOf, levelKey, levelName, sameLevel, roomLevel, roomOnLevel, zoneOnLevel, load,
    // browser shortcuts on the loaded model (before it arrives: the plain |dz| rule)
    get, fetchModel,
    same: (a, b, tol) => sameLevel(B.model, a, b, tol),
    key: (p) => levelKey(B.model, p),
    name: (p) => levelName(B.model, p),
    room: (viewer, roomId) => roomOnLevel(B.model, viewer, roomId),
    zone: (viewer, zone) => zoneOnLevel(B.model, viewer, zone),
    // map art per floor (2026-10-13 10:25)
    trackLevel, tileSuffix, lvlOf, view, tile, plainLayer,
    version: '2026-10-13',
  };
});
