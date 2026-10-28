// CAVE DUNGEONS (owner 2026-10-14: "the area around Zaken's Butcher Krantz is still not showing as the dungeon it actually is. Also the team is
// completely separated"): underground places that the 2026-10-07 dungeon list never had (Devil's Isle caves: Tillion, Magus Kenishee, Krantz)
// were treated as open field - no floor map, no floor bands, members walking on different levels. This builds a dungeon_rooms.json entry for
// such a cave FROM THE GEODATA + the datapack spawns:
//   1) flood fill the walkable geodata from the seed points (the raid bosses), only cells below `below` and inside `box` -> the cave floor
//   2) floors = height bands of those cells (a gap of >= floorGap with no cells splits two floors)
//   3) rooms = the datapack monster spawns standing on a flooded cell, clustered (link 700) per floor; a room = centre, radius, hull polygon,
//      monsters with level / count / aggressive (npcs_h5.json + aggro_h5.json), level range
// The entry goes through manual_guard writeGuarded (hand edits on the dashboard are kept). Afterwards: room_polys / room_graph / floor_maps with
// --only <key> refine the polygons, build the room graph and draw the floor maps.
// Use: node docs/plan/tools/cave_dungeon.js [--dry] [--only <key>]
'use strict';
const fs = require('fs'), path = require('path');
const GP = require('./geopath');
const ROOT = path.join(__dirname, '..', '..', '..'), DATA = path.join(ROOT, 'Scripts', 'data');
const rd = (f) => JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, ''));

const CAVES = [
  { key: 'devils_isle_caves', name: "Devil's Isle Caves (Zaken's pirates)", town: 'Heine', box: [34000, 60000, 190000, 226000], below: -2300,
    openBelow: 0, splits: [-3300], floorNames: ['Lower caves (Krantz, Kenishee)', 'Upper caves (pirate tunnels)'], seedBosses: ["Zaken's Chief Mate Tillion", 'Magus Kenishee', "Zaken's Butcher Krantz"], seeds: [[50984, 206200, -4000]],
    notes: 'Underground caves of Devil\'s Isle (Zaken\'s pirates). The island surface is ~2,500-3,000 above. Generated from the geodata + datapack spawns (cave_dungeon.js, 2026-10-14).' },
  // FORGOTTEN TEMPLE (tester Vykaax 2026-10-27: "Dungeon mapping for Forgotten Temple"): the sunken temple south-west of the Gludin gatekeeper
  // landing (client zone 28/152 "Forgotten Temple", region 18_23, z -3760..-5632). Walk-in: Gludin gatekeeper Richlin "Forgotten Temple" (2000)
  // lands at -53001,191425,-3568; the ramp south of the landing (x ~-52900) goes down to the upper temple (-4512) and on to the water halls (-4808).
  { key: 'forgotten_temple', name: 'Forgotten Temple', town: 'Gludin', box: [-66000, -48000, 176000, 196000], below: -3700,
    openBelow: 0, splits: [-4720], topFirst: true, floorNames: ['Upper temple (entrance level, Unrequited Kael)', 'Lower temple (water halls, Tirak)'], seedBosses: ['Unrequited Kael', 'Tirak'],
    seeds: [[-57037, 186821, -4556], [-60000, 181000, -4811], [-55000, 183000, -4550], [-52952, 188840, -4552]],
    extra: {
      gatekeeperRoute: { town: 'Gludin', gatekeeper: 'Richlin', destination: 'Forgotten Temple', price: 2000, landing: [-53001, 191425, -3568], liveMenu: true,
        note: "Live text 'Forgotten Temple - 2000' (gk_live/Richlin.json). Datapack 'Gludin -> Forgotten Temple' (2000) lands at -53001,191425,-3568 on the surface, north of the temple ramp." },
      entrance: { x: -53001, y: 191425, z: -3568, desc: 'Gludin gatekeeper landing on the surface. Walk south down the ramp (x ~-52900, y 190400 -> 188400) into the upper temple (z -4512); the water halls (z -4808) lie below to the west.' },
      otherTeleports: [], mapLayers: ['18_23'],
      sources: ['datapack l2j_teleport.sql', 'gk_live/Richlin.json', 'client_zones.json (zone 28/152)', 'spawns_h5.json', 'npcs_h5.json', 'aggro_h5.json', 'raidbosses_h5.json', 'geopath.js'] },
    floorEnter: { how: 'walk', from: [-53001, 191425, -3568], npc: null, landing: null, note: 'Walk in from the Gludin gatekeeper landing (ramp south of it).' },
    notes: 'Sunken temple near Gludin (Gludio territory), walk-in from the Gludin gatekeeper landing. Two levels: the upper temple (z ~-4512: Lafi lizardmen, Ritmal, Undines, Kanil Succubus, raid boss Unrequited Kael 24) and the lower water halls (z ~-4808: Kuran kobolds, Patin, salamanders, Sentinel of Water, Dre Vanul, Death Fire; raid boss Tirak 28 in the pit at -4968). Every temple monster is aggressive (aggro_h5.json), levels 27-35 (Lava Salamander 35). Outside on the surface: Patriarch Kuroboros 26 / Kuroboros\' Priest 23 (west), Tracker Leader Sharuk 23. Generated from the geodata + datapack spawns (cave_dungeon.js + cave_rooms.js, 2026-10-27).' },
];
const MAX_STEP = 48, LINK = 700, MAXCELLS = 2500000, FLOOR_GAP = 250, PAD = 250;
const E = 1, W = 2, S = 4, N = 8, DIRS = [[1, 0, E, W], [-1, 0, W, E], [0, 1, S, N], [0, -1, N, S]];

function step(gx, gy, li, d) {
  const ls = GP.layers(gx, gy); if (!ls || !ls[li]) return -1;
  const a = ls[li]; if (!(a.nswe & d[2])) return -1;
  const nl = GP.layers(gx + d[0], gy + d[1]); if (!nl || !nl.length) return -1;
  let best = -1, bd = 1e9; nl.forEach((l, i) => { const dh = Math.abs(l.h - a.h); if (dh < bd) { bd = dh; best = i; } });
  if (best < 0 || bd > MAX_STEP) return -1;
  if (!(nl[best].nswe & d[3]) && nl[best].nswe !== 15 && (nl[best].nswe & 15) === 0) return -1;
  return best;
}
function snapLayer(x, y, z) {
  const gx = GP.toGeoX(x), gy = GP.toGeoY(y), ls = GP.layers(gx, gy); if (!ls) return null;
  let li = -1, bd = 1e9; ls.forEach((l, i) => { const d = Math.abs(l.h - z); if (d < bd) { bd = d; li = i; } });
  return li >= 0 && bd < 400 ? { gx, gy, li } : null;
}
function flood(C, seeds) {
  const gx0 = GP.toGeoX(C.box[0]), gx1 = GP.toGeoX(C.box[1]), gy0 = GP.toGeoY(C.box[2]), gy1 = GP.toGeoY(C.box[3]);
  const seen = new Map(), q = [];
  const key = (gx, gy, li) => (gx * 65536 + gy) * 8 + li;
  seeds.forEach(s => { const c = snapLayer(s[0], s[1], s[2]); if (c) { const k = key(c.gx, c.gy, c.li); if (!seen.has(k)) { seen.set(k, GP.layers(c.gx, c.gy)[c.li].h); q.push([c.gx, c.gy, c.li]); } } });
  for (let i = 0; i < q.length && seen.size < MAXCELLS; i++) {
    const [gx, gy, li] = q[i];
    for (const d of DIRS) {
      const nx = gx + d[0], ny = gy + d[1]; if (nx < gx0 || nx > gx1 || ny < gy0 || ny > gy1) continue;
      const nl = step(gx, gy, li, d); if (nl < 0) continue;
      const h = GP.layers(nx, ny)[nl].h; if (h > C.below) continue;
      if (nl === 0 && !(C.openBelow && h < C.openBelow)) continue;     // a cave cell has a layer ABOVE it (the roof); open ground only when deeper than openBelow (else the flood leaks onto the sea floor)
      const k = key(nx, ny, nl); if (seen.has(k)) continue;
      seen.set(k, h); q.push([nx, ny, nl]);
    }
  }
  return { cells: q, heights: seen, capped: seen.size >= MAXCELLS };
}
function bands(hs) {
  const bins = new Map(); hs.forEach(h => { const b = Math.floor(h / 32); bins.set(b, (bins.get(b) || 0) + 1); });
  const ks = [...bins.keys()].sort((a, b) => a - b), out = [];
  let lo = ks[0], prev = ks[0];
  for (const k of ks.slice(1)) { if ((k - prev) * 32 >= FLOOR_GAP) { out.push([lo * 32, prev * 32 + 32]); lo = k; } prev = k; }
  out.push([lo * 32, prev * 32 + 32]);
  return out;
}
function hull(pts) {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]); if (p.length < 3) return p;
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.slice().reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
const compassOf = (dx, dy) => { const a = Math.atan2(-dy, dx) * 180 / Math.PI; const names = ['east', 'north-east', 'north', 'north-west', 'west', 'south-west', 'south', 'south-east']; return names[((Math.round(a / 45) % 8) + 8) % 8]; };

function build(C) {
  const spawns = rd(path.join(DATA, 'spawns_h5.json')), npcsRaw = rd(path.join(DATA, 'npcs_h5.json'));
  const npcs = {}; Object.keys(npcsRaw).forEach(id => { const n = npcsRaw[id]; if (n) npcs[id] = { name: n.n, level: n.l, type: n.ty }; });
  let aggro = {}; try { aggro = rd(path.join(DATA, 'aggro_h5.json')); } catch (e) { }
  const rb = rd(path.join(DATA, 'raidbosses_h5.json')).bosses || [];
  const bosses = rb.filter(b => C.seedBosses.includes(b.name));
  const seeds = bosses.map(b => [b.x, b.y, b.z]).concat(C.seeds || []);
  const F = flood(C, seeds);
  console.log(`${C.name}: ${F.heights.size} cave cells from ${seeds.length} seeds${F.capped ? ' (CAPPED)' : ''}`);
  // cell lookup: "gx,gy" -> [heights]
  const at = new Map(); F.cells.forEach(([gx, gy, li]) => { const k = gx + ',' + gy; const h = GP.layers(gx, gy)[li].h; (at.get(k) || at.set(k, []).get(k)).push(h); });
  const onCave = (x, y, z) => { const gx = GP.toGeoX(x), gy = GP.toGeoY(y);
    for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) { const hs = at.get((gx + dx) + ',' + (gy + dy)); if (hs && hs.some(h => Math.abs(h - z) < 160)) return true; } return false; };
  // floors: fixed split heights (stacked cave levels overlap in height, so a gap search finds one band) or the gaps in the heights
  let fb = bands([...F.heights.values()]);
  if (C.splits && C.splits.length) { let lo = 1e9, hi = -1e9; F.heights.forEach(h => { if (h < lo) lo = h; if (h > hi) hi = h; }); const cut = [lo - 32].concat(C.splits.slice().sort((a, b) => a - b), [hi + 32]); fb = []; for (let i = 0; i + 1 < cut.length; i++) fb.push([cut[i], cut[i + 1]]); }
  // topFirst (Forgotten Temple 2026-10-27): floors[] in the order you walk in (floor 1 = the entrance level, like Giant's Cave), not by height
  if (C.topFirst) fb.sort((a, b) => b[0] - a[0]);
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, roofed = 0; F.cells.forEach(([gx, gy, li]) => { const x = GP.toWorldX(gx), y = GP.toWorldY(gy); if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (li > 0) roofed++; });
  const bbox = [x0 - 200, x1 + 200, y0 - 200, y1 + 200];
  console.log(`  bbox ${bbox.join(',')}, cells with a layer above (roof): ${roofed}`);
  const mine = spawns.filter(s => s.x >= bbox[0] && s.x <= bbox[1] && s.y >= bbox[2] && s.y <= bbox[3] && s.z <= C.below + 200 && onCave(s.x, s.y, s.z)
    && npcs[s.id] && /Monster|Raid|Minion/i.test(String(npcs[s.id].type || '')));
  console.log(`  ${mine.length} monster spawns on the cave floor, floors: ${fb.map(b => b.join('..')).join(' | ')}`);
  const floors = fb.map((z, fi) => Object.assign({ name: (C.floorNames && C.floorNames[fi]) || (fb.length > 1 ? `Level ${fi + 1} (${z[0]}..${z[1]})` : 'Caves'), z },
    C.floorEnter ? { enter: Object.assign({}, C.floorEnter) } : {}, { rooms: [], links: [], safeSpots: [],
    notes: 'Generated from the geodata (cave_dungeon.js).' }));
  const floorOf = (z) => floors.findIndex(f => z >= f.z[0] && z < f.z[1]);
  floors.forEach((Fl, fi) => {
    const pts = mine.filter(s => floorOf(s.z) === fi);
    const par = pts.map((_, i) => i), find = (i) => par[i] === i ? i : (par[i] = find(par[i]));
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) if (Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y) < LINK && Math.abs(pts[i].z - pts[j].z) < 300) par[find(i)] = find(j);
    const groups = {}; pts.forEach((p, i) => (groups[find(i)] = groups[find(i)] || []).push(p));
    const list = Object.values(groups).filter(g => g.length >= 3).sort((a, b) => b.length - a.length);
    const all = list.flat(), mx = all.reduce((s, p) => s + p.x, 0) / Math.max(1, all.length), my = all.reduce((s, p) => s + p.y, 0) / Math.max(1, all.length);
    list.forEach((g, ri) => {
      const cx = Math.round(g.reduce((s, p) => s + p.x, 0) / g.length), cy = Math.round(g.reduce((s, p) => s + p.y, 0) / g.length);
      const zsrt = g.map(p => p.z).sort((a, b) => a - b), cz = zsrt[Math.floor(zsrt.length / 2)];
      const radius = Math.round(Math.max(...g.map(p => Math.hypot(p.x - cx, p.y - cy))) + PAD);
      const ring = []; g.forEach(p => { for (let k = 0; k < 8; k++) ring.push([Math.round(p.x + Math.cos(k * Math.PI / 4) * PAD), Math.round(p.y + Math.sin(k * Math.PI / 4) * PAD)]); });
      const mons = {}; g.forEach(p => { const n = npcs[p.id] || {}; const m = mons[p.id] = mons[p.id] || { name: p.name, id: p.id, level: Number(n.level) || 0, count: 0, aggressive: aggro[p.name] !== undefined }; m.count += p.count || 1; });
      const ml = Object.values(mons).sort((a, b) => b.count - a.count), lv = ml.map(m => m.level).filter(Boolean);
      const top = ml.slice(0, 2).map(m => m.name).join(' / ');
      const boss = bosses.find(b => Math.hypot(b.x - cx, b.y - cy) < radius + 1500 && Math.abs(b.z - cz) < 400);
      Fl.rooms.push({ id: `${C.key}-${fi + 1}-${ri + 1}`, name: `${boss ? boss.name + ' area: ' : ''}${top} room`, side: compassOf(cx - mx, cy - my), compass: compassOf(cx - mx, cy - my),
        center: [cx, cy, cz], radius, levelRange: lv.length ? [Math.min(...lv), Math.max(...lv)] : null,
        suitsPartyLevel: lv.length ? [Math.min(...lv), Math.max(...lv) + 3] : null, spawnCount: g.reduce((s, p) => s + (p.count || 1), 0), monsters: ml,
        poly: hull(ring), zRange: [zsrt[0] - 150, zsrt[zsrt.length - 1] + 150],
        notes: `${boss ? 'raid boss ' + boss.name + ' (lvl ' + boss.level + ') here; ' : ''}aggressive: ${ml.filter(m => m.aggressive).map(m => m.name).join(', ') || 'none'}`,
        polyInfo: { method: 'spawn hull (cave_dungeon.js)', quality: 'rough' } });
    });
    const lvA = Fl.rooms.map(r => r.levelRange).filter(Boolean); Fl.levelRange = lvA.length ? [Math.min(...lvA.map(r => r[0])), Math.max(...lvA.map(r => r[1]))] : null;
  });
  const lvAll = floors.map(f => f.levelRange).filter(Boolean);
  return Object.assign({ name: C.name, key: C.key, levelRange: lvAll.length ? [Math.min(...lvAll.map(r => r[0])), Math.max(...lvAll.map(r => r[1]))] : null, town: C.town,
    entrance: null, bbox, floors: floors.filter(f => f.rooms.length || f.z[1] - f.z[0] > 200), raidBosses: bosses.map(b => ({ name: b.name, id: b.id, level: b.level, x: b.x, y: b.y, z: b.z })),
    cave: true, generated: { by: 'cave_dungeon.js', at: new Date().toISOString(), cells: F.heights.size }, notes: C.notes }, C.extra || {});
}
function main() {
  const dry = process.argv.includes('--dry'), oi = process.argv.indexOf('--only'), only = oi > 0 ? process.argv[oi + 1] : '';
  const f = path.join(DATA, 'dungeon_rooms.json'), D = rd(f);
  CAVES.filter(C => !only || C.key === only).forEach(C => {
    const e = build(C);
    e.floors.forEach(Fl => console.log(`  floor ${Fl.name}: ${Fl.rooms.length} rooms, lvl ${Fl.levelRange ? Fl.levelRange.join('-') : '?'}`));
    const i = D.findIndex(d => d.key === C.key);
    if (i >= 0 && D[i].manual) { console.log(`  ${C.key}: edited by hand (manual) - kept`); return; }
    if (i >= 0) D[i] = e; else D.push(e);
  });
  if (dry) { console.log('(dry run - nothing written)'); return; }
  const bak = path.join(ROOT, 'Settings', 'backup', `dungeon_rooms_before_caves_${Date.now()}.json`); fs.copyFileSync(f, bak);
  let wrote = false;
  try { const MG = require('./manual_guard'); if (MG && typeof MG.writeGuarded === 'function') { MG.writeGuarded(f, D); wrote = true; } } catch (e) { console.log('manual_guard: ' + e.message); }
  if (!wrote) fs.writeFileSync(f, JSON.stringify(D, null, 1));
  console.log(`written ${f} (backup ${path.basename(bak)})`);
}
if (require.main === module) main();
module.exports = { build, CAVES };
