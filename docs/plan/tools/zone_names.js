// zone_names.js — the place name of a world position (x, y, z) for the raid boss list (raidbosses.js zoneName) and other tools.
// 2026-10-13 fix: the old raidbosses.js zoneOf() took the Maps tile caption (map_regions.json) and, when the boss's own height layer had no
// caption, fell back to ANY named layer of the same tile — so surface bosses next to Giran Castle (Nakondas, Sejarr's Servitor, ...) got the
// UNDERGROUND layer's name "Matyrdom Necropolis (Mobs 60-70)". Details: docs/plan/raid_zone_names_fix.md.
//
// Method (first rule that answers wins):
//   1. layer    a client zone (client_zones.json zones) of the tile whose NARROW height band (< 15000, i.e. a dungeon layer: catacomb, necropolis,
//               tower floor, nest, mine) holds z -> the narrowest one ("Tower of Insolence: 3rd Floor", "Catacomb of the Witch").
//   2. evidence the tile's surface zone names (band holds z) that have a position in the client hunting-zone guide (client_zones.json
//               huntingZones). Kinds: hunting ground / landmark always; a dungeon when its entrance is within 6000 (or within 12000 and the
//               position is 1000+ below the entrance = inside it); a town / castle / fortress / harbor / clan hall / arena only within 3000 (a field
//               boss 14 km from Giran Castle is not "Giran Castle"). Evidence: 3 = within 5000; 2 = the same monsters (spawns_h5 x npcs_h5
//               L2Monster, within 3000 / 4000) live at the boss and at the place; 1 = one chain of those monsters' spawns (links <= 3000) runs from
//               the boss to within 5000 of the place (<= 25000 away), or no monsters around and within 12000. Best evidence, then hunting
//               ground > landmark > dungeon, then distance. (Nakondas: Gorgon Flower Garden 15 km, Medusa / Wyrm / Turak Bugbear Warrior at both.)
//   3. tile     exactly one non-territory zone name for this tile + height -> that one.
//   4. caption  the Maps tile caption (map_regions.json) of the boss's OWN height layer (never another layer's caption — the old bug).
//   5. far      the nearest positioned candidate of the tile (hunting grounds first): its plain name within 8000, beyond that
//               "<Territory> (<direction> of <place>)" (e.g. "Giran Territory (south of Gorgon Flower Garden)" for the sea bosses).
//   6. guide    the nearest hunting ground / dungeon of the whole guide within 20000, else ''.
// Without client_zones.json (public package) rules 1-3 and 5 have no data; rule 4 + 6 (map_regions only) still never take another layer's name.
'use strict';
const fs = require('fs'), path = require('path');
const rd = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch (e) { return d; } };
const norm = (s) => String(s || '').toLowerCase().replace(/[’`']/g, '').replace(/\b(the|of|s)\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
const tileOf = (x, y) => ({ tx: Math.floor(x / 32768) + 20, ty: Math.floor(y / 32768) + 18 });
const LAYER_MAX = 15000, NEAR_MAX = 12000, SURE_NEAR = 5000, SAME_MOBS_MAX = 35000, CHAIN_MAX = 25000, MOB_R = 3000, DUNGEON_NEAR = 6000, TOWN_NEAR = 3000, GUIDE_MAX = 20000, ZTOL = 50;
const FIELD_TYPES = new Set([1, 7]), DUNGEON_TYPES = new Set([2]), TOWN_TYPES = new Set([3, 4, 5, 6]);

function makeZoneNamer(opt = {}) {
  const DATA = opt.dataDir || path.join(__dirname, '..', '..', '..', 'Scripts', 'data');
  const CZ = opt.clientZones !== undefined ? opt.clientZones : rd(path.join(DATA, 'client_zones.json'), null);
  const MR = (opt.mapRegions || rd(path.join(DATA, 'map_regions.json'), [])).filter(r => r && r.name);
  const zones = (CZ && CZ.zones) || [], guide = ((CZ && CZ.huntingZones) || []).filter(h => h.x || h.y);
  const anchors = new globalThis.Map();
  guide.forEach(h => { const k = norm(h.name); if (!anchors.has(k)) anchors.set(k, []); anchors.get(k).push(h); });
  const isTerritory = (name) => /\bterritory\b/i.test(name) || (anchors.get(norm(name)) || []).some(h => h.type === 0);
  const terrName = {}; guide.concat(((CZ && CZ.huntingZones) || []).filter(h => h.type === 0)).forEach(h => { if (h.type === 0) terrName[h.id] = h.name; });
  // monster population (spawns_h5.json x npcs_h5.json L2Monster): two places with the same monsters are the same hunting ground
  const SP = opt.spawns || rd(path.join(DATA, 'spawns_h5.json'), []), NPC = opt.npcs || rd(path.join(DATA, 'npcs_h5.json'), {});
  const mobs = SP.filter(s => s && NPC[s.id] && NPC[s.id].ty === 'L2Monster');
  function mobsNear(px, py, pz, r) {
    const out = new Set();
    mobs.forEach(s => { if (Math.abs(s.x - px) <= r && Math.abs(s.y - py) <= r && Math.abs(s.z - pz) <= 1000 && Math.hypot(s.x - px, s.y - py) <= r) out.add(NPC[s.id].n); });
    return out;
  }
  // same hunting ground: the boss's monsters also live around the place's position, or their spawns form one chain (links <= 3000)
  // from the boss to within 5000 of it (a big marsh / valley whose landing is far from the boss)
  function sameGround(mine, x, y, z, a) {
    if (!mine.size || !a) return null;
    const theirs = mobsNear(a.x, a.y, a.z, MOB_R + 1000), shared = [...mine].filter(n => theirs.has(n));
    if (shared.length && shared.length >= Math.min(2, mine.size)) return { text: shared.slice(0, 3).join(', ') };
    const pts = mobs.filter(s => mine.has(NPC[s.id].n) && Math.hypot(s.x - x, s.y - y) <= SAME_MOBS_MAX + 5000);
    const seen = new Uint8Array(pts.length), queue = [];
    pts.forEach((p, i) => { if (Math.hypot(p.x - x, p.y - y) <= MOB_R && Math.abs(p.z - z) <= 1000) { seen[i] = 1; queue.push(i); } });
    while (queue.length) {
      const p = pts[queue.pop()];
      if (Math.hypot(p.x - a.x, p.y - a.y) <= 5000) return { text: `${NPC[p.id].n} spawns reach it`, chain: true };
      pts.forEach((q, j) => { if (!seen[j] && Math.abs(q.x - p.x) <= 3000 && Math.abs(q.y - p.y) <= 3000 && Math.hypot(q.x - p.x, q.y - p.y) <= 3000) { seen[j] = 1; queue.push(j); } });
    }
    return null;
  }
  const dirOf = (dx, dy) => { const a = Math.atan2(-dy, dx) * 180 / Math.PI; return ['east', 'north-east', 'north', 'north-west', 'west', 'south-west', 'south', 'south-east'][Math.round(((a + 360) % 360) / 45) % 8]; };

  function zoneOf(x, y, z) {
    if (!isFinite(x) || !isFinite(y)) return { name: '', how: 'no position' };
    z = isFinite(z) ? z : 0;
    const { tx, ty } = tileOf(x, y);
    // the tile's zone names for this height (dedupe by name, keep the narrowest band per name)
    const byName = new globalThis.Map();
    zones.filter(c => c.gx === tx && c.gy === ty && z <= c.top + ZTOL && z >= c.bottom - ZTOL && c.name).forEach(c => {
      const o = byName.get(c.name); if (!o || (c.top - c.bottom) < (o.top - o.bottom)) byName.set(c.name, c); });
    const cands = [...byName.values()];
    // 1. dungeon layer
    const layer = cands.filter(c => c.top - c.bottom < LAYER_MAX && !isTerritory(c.name)).sort((a, b) => (a.top - a.bottom) - (b.top - b.bottom));
    if (layer.length) return { name: layer[0].name, how: 'layer' };
    const named = cands.filter(c => !isTerritory(c.name));
    const scored = named.map(c => {
      let best = null;
      (anchors.get(norm(c.name)) || []).forEach(h => { const d = Math.hypot(h.x - x, h.y - y); if (!best || d < best.d) best = { d, type: h.type, h }; });
      return { name: c.name, d: best ? best.d : Infinity, type: best ? best.type : -1, anchor: best ? best.h : null };
    }).sort((a, b) => a.d - b.d);
    // 2. nearest positioned name, by kind; beyond 5000 the monsters must match (same hunting ground), up to 35000
    const kindOk = (s) => FIELD_TYPES.has(s.type) || (TOWN_TYPES.has(s.type) && s.d <= TOWN_NEAR)
      || (DUNGEON_TYPES.has(s.type) && (s.d <= DUNGEON_NEAR || (s.d <= NEAR_MAX && z < s.anchor.z - 1000)));   // below its entrance = inside it
    // evidence: 3 = within 5000, 2 = the same monsters live at both places, 1 = one chain of the same monsters links them
    // (or no monsters around and within 12000); best evidence wins, then hunting ground > landmark > dungeon, then distance
    const mine = mobsNear(x, y, z, MOB_R), typeRank = (t) => (t === 1 ? 0 : t === 7 ? 1 : 2);
    const ev = scored.filter(s => isFinite(s.d) && s.d <= SAME_MOBS_MAX && kindOk(s)).map(s => {
      if (s.d <= SURE_NEAR) return { s, e: 3, why: `nearest ${Math.round(s.d)}` };
      const same = sameGround(mine, x, y, z, s.anchor);
      if (same && !(same.chain && s.d > CHAIN_MAX)) return { s, e: same.chain ? 1 : 2, why: `same monsters ${Math.round(s.d)} (${same.text})` };
      if (!mine.size && s.d <= NEAR_MAX) return { s, e: 1, why: `nearest ${Math.round(s.d)} (no monsters around)` };
      return null;
    }).filter(Boolean).sort((a, b) => b.e - a.e || (a.e === 3 ? a.s.d - b.s.d : typeRank(a.s.type) - typeRank(b.s.type) || a.s.d - b.s.d));
    if (ev.length) return { name: ev[0].s.name, how: ev[0].why };
    // 3. the only name of this tile + height
    if (named.length === 1) return { name: named[0].name, how: 'tile' };
    // 4. Maps caption of the OWN height layer only
    const cap = MR.filter(r => r.tx === tx && r.ty === ty && z >= r.zmin && z <= r.zmax).sort((a, b) => (a.zmax - a.zmin) - (b.zmax - b.zmin))[0];
    if (cap) return { name: cap.name.trim(), how: 'caption' };
    // 5. farther candidates of the tile: "<Territory> (<direction> of <place>)" — honest when nothing closer is known
    const far = scored.find(s => isFinite(s.d) && FIELD_TYPES.has(s.type)) || scored.find(s => isFinite(s.d)) || scored[0];
    if (far && far.anchor && far.d <= 8000) return { name: far.name, how: `nearest ${Math.round(far.d)} (other monsters)` };
    if (far && far.anchor) {
      const t = terrName[far.anchor.territory];
      return { name: `${t ? t + ' (' : ''}${dirOf(x - far.anchor.x, y - far.anchor.y)} of ${far.name}${t ? ')' : ''}`, how: `far ${Math.round(far.d)}` };
    }
    if (far) return { name: far.name, how: 'tile (no position)' };
    // 6. nearest guide entry
    let g = null; guide.filter(h => FIELD_TYPES.has(h.type) || DUNGEON_TYPES.has(h.type)).forEach(h => { const d = Math.hypot(h.x - x, h.y - y); if (!g || d < g.d) g = { d, name: h.name }; });
    if (g && g.d <= GUIDE_MAX) return { name: g.name.trim(), how: `guide ${Math.round(g.d)}` };
    return { name: '', how: 'none' };
  }
  return { zoneOf, hasClientData: !!zones.length };
}
module.exports = { makeZoneNamer, norm, tileOf };
