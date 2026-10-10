// FIELD AREAS (user 2026-10-08 22:45: "Just like you created zones you can select from dungeons, you should create the same for hunting zones
// outside, and they can be bigger. Make sure you look at the map and take into account the geodata and objects, walls etc. ... It should be
// possible to extend the area with more areas ... on a field select multiple areas to hunt in, and the bots will move between the areas").
//
// Writes Scripts/data/field_areas.json: every OUTDOOR hunting ground ("region", named after the gatekeeper landing it lies next to:
// Abandoned Camp, Windy Hill, Fields of Massacre, Forest of Mirrors, ...) split into AREAS (monster spawn clusters, radius ~1500-3500) with
//   poly [[x,y],...]  (outline from the walkable geodata: flood fill on the ground, stops at walls / cliffs / height steps > 48 / anything
//                      the geodata blocks; an area never spans two pieces of ground that have no walkable connection)
//   zRange, area (units^2), levelRange [p10,p90], levelAll [min,max], suitsPartyLevel, dangerMax, monsters [{id,name,level,count,aggressive,aggro}],
//   spawnCount, aggressiveShare, respawnSec, raidBosses (within 3000), entry { kind gk|town, from, desc, landing, walk, route } (walk on the
//   geodata from the nearest landing), neighbours [{ id, walk, route }] (walking legs to the next areas), safeSpot { id, walk },
//   quality { ownInside, ownNear, foreign, overlap, quality good|check|small|spawn-hull }.
// plus per region: landings, bbox, levelRange, safeSpots [{ id, name, x, y, z, tier, monsterClear, nearAreas }], and
//   zones { "x,y" of a custom zone: { zones:[names], region, areaIds } }   (custom_zones.json plain outdoor zones -> the areas inside their square)
//
// Method (docs/plan/field_areas.md):
//  1. Monster spawns (spawns_h5.json, npcs_h5.json type L2Monster) that are NOT in a dungeon (dungeon_rooms.json bbox + floor z band), not on an
//     underground map layer (map_regions.json), not under a roof (geodata layer > 600 above).
//  2. Regions: every gatekeeper landing (teleports_h5.json "Town -> Field"; town landings = "<Town> outskirts") is a seed; each spawn goes to the
//     nearest seed (<= 22000). Spawns farther from every landing are grouped by distance and named after the nearest named datapack spot.
//  3. Per region: walkable cells of the region box (room_polys.js buildFloor: 16-unit cells, NSWE walls, height steps <= 48, seeds = spawns +
//     landings), connected components (two plateaus without a walkable way between them never share an area).
//  4. Clusters: leader clustering (radius 2300, monster level counts as distance: 1 level = 150) + Lloyd refinement, per component; small
//     clusters (< 8 spawns) merged into a neighbour of the same component, else dropped (< 4).
//  5. Cells: multi-source Dijkstra from every cluster's spawns at once (walking distance, first come first served): a cell belongs to the
//     cluster whose monsters are nearest on foot, up to 1100 from them, or up to 2600 inside the cluster's spawn hull (+300). Pieces of an
//     area that are not connected to its main piece become their own area (>= 6 spawns) or are dropped.
//  6. Outline: room_polys.js outline (holes filled) + simplifyLoop (<= 40 corners, never self-intersecting).
//  7. Check: own spawns inside / within 150 (>= 90 % = good), foreign spawns inside, overlap with other area polygons (sampled 64 units), size.
//  8. Entry: Dijkstra from every landing in the box -> nearest landing on foot, walk + route (gradient descent, wall-checked straight legs).
//     Neighbours: bounded Dijkstra from every area centre (9000) -> the areas reached + their walk + route. Safe spots: cells outside every
//     area (+150), >= 48 from a wall, >= max(1200, aggro + 300) from aggressive and >= 900 from other monsters ('tight' 900 / aggro + 150 / 600).
//  9. Images: docs/plan/field_areas/<region>.png (Maps/high under the overlay, rendered by render_room_checks.ps1) + index.html.
//
// Use:  node field_areas.js [--only abandoned-camp,windy-hill] [--no-images] [--dry] [--stats]
//       (--only + no --dry merges the regions into the existing file; full run ~10-20 min)
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const geo = require('./geopath');
const RP = require('./room_polys');
const ROOT = path.join(__dirname, '..', '..', '..');
const DATA = path.join(ROOT, 'Scripts', 'data');
const OUTDIR = path.join(ROOT, 'docs', 'plan', 'field_areas');
const FILE = path.join(DATA, 'field_areas.json');
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, ''));
const CELL = 16, WX0 = -294912, WY0 = -262144, MAX_STEP = 48;
const argv = process.argv.slice(2);
const arg = (k) => { const i = argv.indexOf(k); return i >= 0 ? (argv[i + 1] || true) : null; };

const P = {
  seedMax: 22000,          // a spawn belongs to the nearest landing within this (straight)
  orphanLink: 4000,        // spawns farther from every landing: grouped with single-link distance
  minRegionSpawns: 12,
  clusterR: 2300,          // leader clustering radius
  lvlWeight: 150,          // 1 monster level = 150 units in the clustering distance
  minArea: 8,              // spawns (weighted) an area needs; smaller clusters are merged into a neighbour
  mergeDist: 3800,         // ... when its centre is this close (straight), else dropped below minKeep
  minKeep: 4,
  pad: 1100,               // walking distance around the monsters that belongs to the area
  hullPad: 2600,           // inside the spawn hull (+300) the area reaches this far from its monsters
  splitR: 3600,            // a cluster whose monsters spread wider (90th pct from the centre) is split in two
  pieceMin: 6,             // a separate piece of an area with this many spawns becomes its own area
  neighbourMax: 9000,      // walking distance for neighbour routes
  // REACHABLE ENTRY (BUG 2026-10-09 16:11, Dagger1: "Ivory Tower area (far)" areas 6/5/4 had walks of 27.5-29.5k from "Oren -> Sea of Spores",
  // reachable was true (<= 30000 = maxUsefulLanding), swarm.js walkTo refuses every walk > travel.maxWalk 25000 -> three teleports in 45 s,
  // the whole region banned). An area is reachable only when a gatekeeper landing (live menus first) lies within walkMax - walkMargin ON FOOT.
  walkMax: 25000,          // CONFIG travel.maxWalk (swarm.js refuses any walk longer than this, straight line)
  walkMargin: 500,         // landing scatter / the last steps to the centre
  entryMax: 24500,         // = walkMax - walkMargin: landing walks above this are 'far' = NOT reachable (was 30000 = maxUsefulLanding)
  entrySearch: 32000,      // walking distance searched from the landings (the nearest far landing up to this is still shown on the dashboard)
  safeNeed: 1200, safeTight: 900, safePassive: 900, safePassiveTight: 600,
  maxCorners: 40,
};

// ---------------------------------------------------------------------------------------------------------------------------------
// data
// ---------------------------------------------------------------------------------------------------------------------------------
function loadAll() {
  const spawns = readJson(path.join(DATA, 'spawns_h5.json'));
  const NPC = readJson(path.join(DATA, 'npcs_h5.json'));
  const AGGRO = readJson(path.join(DATA, 'aggro_h5.json'));
  const D = readJson(path.join(DATA, 'dungeon_rooms.json'));
  const TP = readJson(path.join(DATA, 'teleports_h5.json'));
  const MR = readJson(path.join(DATA, 'map_regions.json'));
  const HS = readJson(path.join(DATA, 'hunting_spots_h5.json'));
  const CZ = readJson(path.join(DATA, 'custom_zones.json'));
  let RB = []; try { RB = readJson(path.join(DATA, 'raidbosses_h5.json')).bosses || []; } catch (e) { }
  // live gatekeeper menus: town -> normalized link texts
  const live = {};
  try {
    const idx = readJson(path.join(DATA, 'gk_live', '_index.json'));
    idx.forEach(n => { try { const j = readJson(path.join(DATA, 'gk_live', n + '.json')); if (!j.town) return; const a = live[j.town] = live[j.town] || []; Object.values(j.pages || {}).forEach(l => l.forEach(t => a.push(norm(t)))); } catch (e) { } });
  } catch (e) { }
  // respawn delays (l2j_spawnlist.sql): "id,x,y" -> seconds
  const RESP = {};
  try {
    const sql = fs.readFileSync(path.join(DATA, 'l2j_spawnlist.sql'), 'utf8');
    const re = /\("[^"]*",\s*\d+,\s*(\d+),\s*(-?\d+),\s*(-?\d+),\s*(-?\d+),\s*-?\d+,\s*-?\d+,\s*-?\d+,\s*(\d+),\s*(\d+)/g; let m;
    while ((m = re.exec(sql))) RESP[`${m[1]},${m[2]},${m[3]}`] = +m[5] + (+m[6]) / 2;
  } catch (e) { }
  return { spawns, NPC, AGGRO, D, TP, MR, HS, CZ, RB, live, RESP };
}
const norm = (t) => String(t || '').toLowerCase().replace(/&#\d+;/g, '').replace(/\s+-\s+\d+.*$/, '').replace(/\bfree\b/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\b(the|town of|entrance to|village of)\b/g, ' ').replace(/\s+/g, ' ').trim();
const slug = (t) => String(t).toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const TOWN_FROM = /^(the )?(town of )?(gludin|gludio|dion|giran|oren|aden|heine|goddard|rune|schuttgart|hunters|floran|talking island|ti( village)?|elven village|de village|dark elf village|orc village|dwarven village|kamael vil+age|village of gludin|rune township|innadril)(?![a-z])/i;
const BIG_TOWN = { gludin: 'Gludin', gludio: 'Gludio', dion: 'Dion', giran: 'Giran', oren: 'Oren', aden: 'Aden', heine: 'Heine', goddard: 'Goddard', rune: 'Rune', schuttgart: 'Schuttgart', hunters: 'Hunters' };
const VILLAGE = /^(talking island( village)?|ti village|elven village|de village|dark elf village|orc village|dwarven village|kamael village|floran( village)?|entrance to floran village|hunters village)( free)?$/i;
const JUNK = /^front of|town square|castle town|^(in|out|inside|outside|hall|artifact|outofcastle)\)?$|coliseum|krateis|fantasy isle|airship|handys|infinity|harbor|village square|gate entrance$|guild$|temple$|ivory tower|olympiad|cruma tower|cruma level|cruma core|tower of insolence|^toi$|giants cave|necropolis|catacomb|ant nest|ant cave|crypts? of disgrace|monastery of silence|pagan|mithril mines|coal mines|cave of trials|forge of the gods|imperial tomb|ice merchant|fortress (north|south|east|west) gate/i;
const townOf = (t) => { const n = norm(t); for (const k of Object.keys(BIG_TOWN)) if (n === k || n === k + ' town' || n === k + ' castle town' || n === k + ' township') return BIG_TOWN[k]; if (n === 'village gludin' || n === 'gludin') return 'Gludin'; return null; };

/** Outdoor monster spawns (not in a dungeon, not on an underground map layer, not under a roof). */
function outdoorSpawns(A) {
  const under = A.MR.filter(m => /_\d\.jpg$/.test(m.file) && m.zmin < m.zmax);
  const inDun = (s) => A.D.some(d => { const b = d.bbox; return b && s.x >= b[0] - 300 && s.x <= b[1] + 300 && s.y >= b[2] - 300 && s.y <= b[3] + 300 && d.floors.some(f => f.z && s.z >= f.z[0] - 300 && s.z <= f.z[1] + 300); });
  const isUnder = (s) => { const tx = Math.floor(s.x / 32768) + 20, ty = Math.floor(s.y / 32768) + 18; return under.some(m => m.tx === tx && m.ty === ty && s.z >= m.zmin && s.z <= m.zmax); };
  const roof = (s) => { const ls = geo.layers(geo.toGeoX(s.x), geo.toGeoY(s.y)); if (!ls || ls.length < 2) return false; let me = null, bd = 1e9; ls.forEach(l => { const d = Math.abs(l.h - s.z); if (d < bd) { bd = d; me = l; } }); return ls.some(l => l.h > me.h + 600); };
  const st = { monsters: 0, dungeon: 0, underground: 0, roof: 0 };
  const out = [];
  A.spawns.forEach(s => {
    const n = A.NPC[s.id]; if (!n || n.ty !== 'L2Monster' || /Treasure Chest/i.test(n.n) || !(n.l > 0)) return;
    st.monsters++;
    if (inDun(s)) { st.dungeon++; return; }
    if (isUnder(s)) { st.underground++; return; }
    if (roof(s)) { st.roof++; return; }
    const ag = n.ag && A.AGGRO[n.n] ? A.AGGRO[n.n] : 0;
    out.push({ id: s.id, name: n.n, level: n.l, x: s.x, y: s.y, z: s.z, w: s.count || 1, aggressive: !!A.AGGRO[n.n], aggro: ag, resp: A.RESP[`${s.id},${s.x},${s.y}`] || 0 });
  });
  st.outdoor = out.length;
  return { list: out, st };
}

/** Region seeds: gatekeeper landings (field landings + town / village outskirts), deduplicated by name and place. */
function landingSeeds(A) {
  const L = [];
  A.TP.forEach(e => {
    const [from, to] = String(e.desc || '').split('->').map(x => x.trim()); if (!to || !TOWN_FROM.test(from) || /castle|fortress|noble|harbor/i.test(from)) return;   // castle / fortress gatekeepers are not ours
    const town = townOf(to), village = VILLAGE.test(to);
    if (!town && !village && JUNK.test(to)) return;
    const fromTown = townOf(from) || from;
    const liveMenu = (A.live[fromTown] || []).some(l => l === norm(to) || l.includes(norm(to)) || (norm(to).length >= 6 && norm(to).includes(l) && l.length >= 6));
    L.push({ from: fromTown, to, desc: e.desc, x: e.x, y: e.y, z: e.z, price: e.price || 0, kind: town ? 'town' : 'gk', town, village, live: liveMenu, key: town ? 'town:' + town : norm(to) });
  });
  // group by key, split far apart places (6000)
  const groups = [];
  L.forEach(l => {
    let g = groups.find(g => g.key === l.key && g.items.some(o => Math.hypot(o.x - l.x, o.y - l.y) < 6000));
    if (!g) { g = { key: l.key, items: [] }; groups.push(g); }
    g.items.push(l);
  });
  return groups.map(g => {
    const it = g.items, best = it.slice().sort((a, b) => (b.live - a.live) || (a.price - b.price))[0];
    const nameCount = {}; it.forEach(l => { const n = l.to.replace(/\s+free$/i, '').replace(/^Entrance to (the )?/i, ''); nameCount[n] = (nameCount[n] || 0) + 1; });
    let name = Object.entries(nameCount).sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)[0][0];
    if (best.town) name = `${best.town} outskirts`; else if (best.village) name = `${name.replace(/^(TI|DE)\b/, m => m === 'TI' ? 'Talking Island' : 'Dark Elf')} outskirts`;
    const cx = it.reduce((t, l) => t + l.x, 0) / it.length, cy = it.reduce((t, l) => t + l.y, 0) / it.length;
    return { name, key: g.key, x: Math.round(cx), y: Math.round(cy), z: best.z, landings: it, best };
  });
}

// ---------------------------------------------------------------------------------------------------------------------------------
// ENTRY LANDINGS (2026-10-09): every gatekeeper destination a town / village gatekeeper offers (not only the region seeds), with its live state
// ---------------------------------------------------------------------------------------------------------------------------------
const FROM_EXACT = /^(?:the )?(?:town of )?(gludin|gludio|dion|giran|oren|aden|heine|goddard|rune|schuttgart|hunters|talking island|ti|elven village|de village|dark elf village|orc village|dwarven village|kamael vil+age|village of gludin|rune township)$/i;
// destinations that are no field landing: town squares, arenas, harbours (ships), instances
const NO_ENTRY = /town square|castle town|coliseum|krateis|fantasy isle|airship|olympiad|handys|infinity|harbor|^front of|arena|monster race|village square|guild$|temple$|^(in|out|inside|outside|hall|artifact|outofcastle)\)?$|kamaloka|pailaka|rift|hellbound|instance/i;
// gk_live town names of the villages (the datapack says "DE Village", the live file "DarkElf")
const LIVE_TOWN = { 'de village': 'DarkElf', 'dark elf village': 'DarkElf', 'elven village': 'Elven', 'orc village': 'Orc', 'dwarven village': 'Dwarven', 'kamael village': 'Kamael', 'kamael vilage': 'Kamael', 'village of gludin': 'Gludin', 'rune township': 'Rune' };
/** 'yes' = the link is on that town's live gatekeeper menu, 'no' = we know the menu and the link is missing, 'unknown' = menu never recorded */
function liveState(A, fromTown, to) {
  const menu = A.live[fromTown]; if (!menu) return 'unknown';
  const t = norm(to);
  return menu.some(l => l === t || l.includes(t) || (t.length >= 6 && t.includes(l) && l.length >= 6)) ? 'yes' : 'no';
}
/** tier: 0 field landing on a live menu, 1 field landing of a town whose menu we never saw, 2 village / town (.townname) landing, 3 not on the
 *  live menu (swarm.js spotReachable refuses it at run time; kept last because the datapack name may differ from the live text) */
function entryLandings(A) {
  const out = [];
  A.TP.forEach(e => {
    const [from, to] = String(e.desc || '').split('->').map(x => x.trim()); if (!to || !FROM_EXACT.test(from)) return;
    const town = townOf(to), village = VILLAGE.test(to);
    if (!town && !village && NO_ENTRY.test(to)) return;
    const fromTown = townOf(from) || LIVE_TOWN[from.toLowerCase()] || from;
    const key = town ? 'town:' + town : village ? 'village:' + norm(to) + ':' + Math.round(e.x / 3000) + ',' + Math.round(e.y / 3000) : e.desc;
    const ls = town ? 'yes' : liveState(A, fromTown, to);
    const tier = town || village ? (ls === 'no' ? 3 : 2) : ls === 'yes' ? 0 : ls === 'unknown' ? 1 : 3;
    const prev = out.find(o => o.key === key);
    if (prev && prev.tier <= tier) return;
    const rec = { key, kind: town ? 'town' : 'gk', from: fromTown, desc: e.desc, to, town: town || null, village, x: e.x, y: e.y, z: e.z, price: e.price || 0, live: ls === 'yes', liveState: ls, tier };
    if (prev) out[out.indexOf(prev)] = rec; else out.push(rec);
  });
  return out;
}
/** Reachable entries for a region's areas (both the full run and --entries). areas: [{ center [x,y,z], zRange }], box [x1,x2,y1,y2] (the region box).
 *  One walkable grid over the region box + every candidate landing (straight <= walkMax + 2000 from an area centre, |dz| < 3500), then one
 *  multi-source Dijkstra per tier: an area takes the FIRST tier that has a landing within entryMax on foot (live menus first), else it is NOT
 *  reachable and keeps the nearest landing on foot (any tier) as a 'far' entry for the dashboard. -> [{ entry, reachable, unreachable }] */
function regionEntries(A, EL, areas, box) {
  const lim = P.walkMax + 2000;
  // (the same landing spot from several towns: only its best tier — Oren / Aden / Hunters -> Ivory Tower)
  const cands = EL.filter(l => areas.some(a => Math.hypot(l.x - a.center[0], l.y - a.center[1]) <= lim && Math.abs(l.z - a.center[2]) < 3500))
    .sort((p, q) => p.tier - q.tier).filter((l, i, arr) => !arr.slice(0, i).some(o => Math.hypot(o.x - l.x, o.y - l.y) < 150 && Math.abs(o.z - l.z) < 200));
  const none = () => areas.map(() => ({ entry: null, reachable: false, unreachable: `no gatekeeper landing within ${P.walkMax / 1000}k (straight line)` }));
  if (!cands.length) return { list: none(), cands: [] };
  let [x1, x2, y1, y2] = box;
  cands.forEach(l => { x1 = Math.min(x1, l.x - 800); x2 = Math.max(x2, l.x + 800); y1 = Math.min(y1, l.y - 800); y2 = Math.max(y2, l.y + 800); });
  const zs = areas.flatMap(a => a.zRange && a.zRange.length === 2 ? a.zRange : [a.center[2]]).concat(cands.map(l => l.z));
  const G = RP.buildFloor([x1, x2, y1, y2], [Math.min(...zs) - 1500, Math.max(...zs) + 1500], areas.map(a => ({ x: a.center[0], y: a.center[1], z: a.center[2] })).concat(cands.map(l => ({ x: l.x, y: l.y, z: l.z }))));
  const aIdx = G.seedIdx.slice(0, areas.length), lIdx = G.seedIdx.slice(areas.length);
  // LEARNED BLOCKED SPOTS (Scripts/data/geo_blocked.json, 2026-10-09): walls for the entry walks + routes (never a seed cell)
  const blockedN = blockCells(G, x1, x2, y1, y2, zs, new Set(G.seedIdx.filter(i => i >= 0)));
  const dl = new Dij(G), maxC = Math.round(P.entrySearch / CELL * 10);
  const ok = areas.map(() => null), best = areas.map(() => null);
  const mk = (l, walk, i) => ({ kind: l.kind, from: l.from, desc: l.desc, to: l.to, town: l.town || null, live: l.live, liveState: l.liveState, tier: l.tier,
    landing: [l.x, l.y, l.z], walk, straight: Math.round(Math.hypot(areas[i].center[0] - l.x, areas[i].center[1] - l.y)), route: smoothRoute(G, dl.back(aIdx[i]).reverse(), 1000) });
  for (let t = 0; t <= 3; t++) {
    const src = cands.map((l, i) => [lIdx[i], i, 0]).filter(s => s[0] >= 0 && cands[s[1]].tier === t);
    if (!src.length || ok.every((o, i) => o || aIdx[i] < 0)) continue;   // every area has its entry already
    dl.run(src, maxC);
    areas.forEach((a, i) => {
      if (aIdx[i] < 0 || ok[i]) return;
      const d = dl.dist(aIdx[i]); if (d < 0) return;
      const walk = Math.round(d / 10 * CELL), l = cands[dl.label(aIdx[i])];
      if (walk <= P.entryMax) { ok[i] = mk(l, walk, i); return; }
      if (!best[i] || walk < best[i].walk) best[i] = mk(l, walk, i);
    });
  }
  const list = areas.map((a, i) => {
    if (ok[i]) {
      const e = Object.assign(ok[i], { far: false });
      // tier 3: the datapack link is not on the live menu (swarm.js spotReachable is the judge at run time)
      return { entry: e, reachable: true, unreachable: null, note: e.tier === 3 ? `the link "${e.to}" was not seen on the live ${e.from} gatekeeper menu` : null };
    }
    if (aIdx[i] < 0) return { entry: null, reachable: false, unreachable: 'the area centre is not on walkable ground' };
    if (best[i]) return { entry: Object.assign(best[i], { far: true }), reachable: false, unreachable: `the nearest gatekeeper landing on foot (${best[i].desc}) is a ${(best[i].walk / 1000).toFixed(1)}k walk — more than the ${P.walkMax / 1000}k walk limit` };
    return { entry: null, reachable: false, unreachable: `no walkable way from any gatekeeper landing (${cands.map(l => l.to).slice(0, 3).join(', ')}${cands.length > 3 ? ' …' : ''} — walls, cliffs or water)` };
  });
  return { list, cands, cells: G.cells, box: [x1, x2, y1, y2] };
}
/** learned blocked spots (geopath.learnedBlocked) inside the box -> their cells are no longer walkable (OK = 0). keep: cells never blocked. */
function blockCells(G, x1, x2, y1, y2, zs, keep) {
  let n = 0;
  const zMin = Math.min(...zs) - 800, zMax = Math.max(...zs) + 800;
  (geo.learnedBlocked ? geo.learnedBlocked() : []).forEach(p => {
    if (p.x < x1 - p.r || p.x > x2 + p.r || p.y < y1 - p.r || p.y > y2 + p.r || (isFinite(p.z) && (p.z < zMin || p.z > zMax))) return;
    const rc = Math.ceil((p.r || 250) / CELL), cx0 = geo.toGeoX(p.x) - G.gx0, cy0 = geo.toGeoY(p.y) - G.gy0;
    for (let dy = -rc; dy <= rc; dy++) for (let dx = -rc; dx <= rc; dx++) {
      if (dx * dx + dy * dy > rc * rc) continue;
      const X = cx0 + dx, Y = cy0 + dy; if (X < 0 || Y < 0 || X >= G.w || Y >= G.h) continue;
      const j = Y * G.w + X; if (!G.OK[j] || keep.has(j) || (isFinite(p.z) && Math.abs(G.H[j] - p.z) > 500)) continue;
      G.OK[j] = 0; n++;
    }
  });
  return n;
}
/** two renamed regions with the same name ("Valley of the Lords" x2): the later ones say where you come in / where they lie */
function dedupeNames(F) {
  const seen = {};
  (F.regions || []).forEach(R => { const k = String(R.name).toLowerCase(); (seen[k] = seen[k] || []).push(R); });
  Object.values(seen).filter(l => l.length > 1).forEach(l => l.filter(R => R.nameOrig).forEach((R, i) => {
    if (i === 0 && l.some(o => !o.nameOrig)) { /* a normal region has the name: every renamed one gets a suffix */ } else if (i === 0) return;
    const old = R.name, via = R.landings && R.landings[0] && R.landings[0].used ? R.landings[0].to : null, c = R.center || [0, 0];
    const tail = old.endsWith(' (unreachable)') ? ' (unreachable)' : '', base = tail ? old.slice(0, -tail.length) : old;
    const useVia = via && !base.includes(' — via ') && !base.toLowerCase().includes(String(via).toLowerCase());
    R.name = `${base}${useVia ? ' — via ' + via : ' @' + Math.round(c[0] / 1000) + 'k,' + Math.round(c[1] / 1000) + 'k'}${tail}`;
    (R.areas || []).forEach(a => { if (a.manual !== true && String(a.name || '').startsWith(old + ' ')) a.name = R.name + ' ' + a.name.slice(old.length + 1); });
  }));
}
/** region name + landings after the entries: "(far)" regions get the name of the place without "(far)" when some area is reachable, else
 *  "(unreachable)"; landings = the ones the areas really use first */
function fixRegion(R, baseName) {
  const base = String(baseName || R.nameOrig || R.name).replace(/\s*\((far|unreachable)\)\s*$/i, '').trim();
  const reach = (R.areas || []).filter(a => a.reachable);
  const used = []; (R.areas || []).forEach(a => { const e = a.reachable && a.entry; if (!e) return; let u = used.find(x => x.desc === e.desc); if (!u) used.push(u = { kind: e.kind, from: e.from, desc: e.desc, to: e.to, x: e.landing[0], y: e.landing[1], z: e.landing[2], live: e.live, liveState: e.liveState, n: 0 }); u.n++; });
  used.sort((p, q) => q.n - p.n);
  const oldName = R.name;
  if (R.kind === 'far' || /\((far|unreachable)\)\s*$/i.test(R.name)) {
    if (!R.nameOrig) R.nameOrig = R.name;
    // a bare town name ("Gludio (far)" = monsters far from Gludio) would read like the town itself: say where you come in
    const townish = !!(townOf(base) || VILLAGE.test(base) || /^Wilds @/.test(base));
    R.name = reach.length ? (townish && used[0] ? `${base} — via ${used[0].to}` : base) : `${base} (unreachable)`;
  }
  const own = (R.landings || []).filter(l => !used.some(u => u.desc === l.desc)).map(l => Object.assign({}, l, { used: false }));
  R.landings = used.map(u => ({ kind: u.kind, from: u.from, desc: u.desc, to: u.to, x: u.x, y: u.y, z: u.z, live: u.live, liveState: u.liveState, used: u.n })).concat(own);
  R.reach = { areas: (R.areas || []).length, reachable: reach.length, via: used.map(u => u.desc) };
  // area names start with the region name (swarm.js logs "<region>: area n")
  if (R.name !== oldName) (R.areas || []).forEach(a => { if (a.manual === true) return; const nm = String(a.name || ''), pre = [oldName, R.nameOrig].find(p => p && nm.startsWith(p + ' ')); if (pre) a.name = `${R.name} ${nm.slice(pre.length + 1)}`; });
  return R;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// grid helpers (same movement rule as geopath.js / room_polys.js)
// ---------------------------------------------------------------------------------------------------------------------------------
const nb = (G, i, k) => RP.nbOpen(G, i, k);
function nb8(G, i, out) {
  let c = 0;
  const e = nb(G, i, 0), w = nb(G, i, 1), s = nb(G, i, 2), n = nb(G, i, 3);
  if (e >= 0) { out[c++] = e; out[c++] = 10; }
  if (w >= 0) { out[c++] = w; out[c++] = 10; }
  if (s >= 0) { out[c++] = s; out[c++] = 10; }
  if (n >= 0) { out[c++] = n; out[c++] = 10; }
  const dg = (a, ka, b, kb) => { if (a < 0 || b < 0) return -1; const x = nb(G, a, kb), y = nb(G, b, ka); return x >= 0 && x === y ? x : -1; };
  let d;
  if ((d = dg(e, 0, s, 2)) >= 0) { out[c++] = d; out[c++] = 14; }
  if ((d = dg(e, 0, n, 3)) >= 0) { out[c++] = d; out[c++] = 14; }
  if ((d = dg(w, 1, s, 2)) >= 0) { out[c++] = d; out[c++] = 14; }
  if ((d = dg(w, 1, n, 3)) >= 0) { out[c++] = d; out[c++] = 14; }
  return c;
}
const cx = (G, i) => (G.gx0 + (i % G.w)) * CELL + WX0 + 8, cy = (G, i) => (G.gy0 + ((i / G.w) | 0)) * CELL + WY0 + 8;
const cellAt = (G, x, y) => { const gx = geo.toGeoX(x) - G.gx0, gy = geo.toGeoY(y) - G.gy0; return gx < 0 || gy < 0 || gx >= G.w || gy >= G.h ? -1 : gy * G.w + gx; };
/** nearest walkable cell to (x,y) within r cells (height within 400 of z) */
function snapCell(G, x, y, z, r) {
  const gx0 = geo.toGeoX(x) - G.gx0, gy0 = geo.toGeoY(y) - G.gy0; let best = -1, bd = 1e9;
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const X = gx0 + dx, Y = gy0 + dy; if (X < 0 || Y < 0 || X >= G.w || Y >= G.h) continue; const j = Y * G.w + X; if (!G.OK[j] || (isFinite(z) && Math.abs(G.H[j] - z) > 400)) continue; const d = dx * dx + dy * dy; if (d < bd) { bd = d; best = j; } }
  return best;
}
// bucket queue Dijkstra with reusable arrays (stamp = this run)
class Dij {
  constructor(G) { this.G = G; this.D = new Int32Array(G.n); this.S = new Int32Array(G.n); this.L = new Int32Array(G.n); this.stamp = 0; this.tmp = new Int32Array(16); }
  /** sources: [[cell, label, startCost]]; limit(cell, label, cost) -> allowed; returns the list of cells reached in order */
  run(sources, maxCost, allowed) {
    const G = this.G, D = this.D, S = this.S, L = this.L, st = ++this.stamp, tmp = this.tmp;
    const buckets = []; let cur = 0, size = 0; const reached = [];
    const push = (k, i) => { (buckets[k] || (buckets[k] = [])).push(i); size++; if (k < cur) cur = k; };
    sources.forEach(([i, l, c]) => { if (i < 0) return; if (S[i] === st && D[i] <= (c || 0)) return; S[i] = st; D[i] = c || 0; L[i] = l; push(c || 0, i); });
    while (size) {
      while (!buckets[cur] || !buckets[cur].length) cur++;
      const i = buckets[cur].pop(); size--;
      if (D[i] !== cur || S[i] !== st) continue;
      reached.push(i);
      const c = nb8(G, i, tmp), l = L[i];
      for (let t = 0; t < c; t += 2) {
        const j = tmp[t], nd = cur + tmp[t + 1];
        if (nd > maxCost) continue;
        if (S[j] === st && D[j] <= nd) continue;
        if (allowed && !allowed(j, l, nd)) continue;
        S[j] = st; D[j] = nd; L[j] = l; push(nd, j);
      }
    }
    return reached;
  }
  dist(i) { return this.S[i] === this.stamp ? this.D[i] : -1; }
  label(i) { return this.S[i] === this.stamp ? this.L[i] : -1; }
  /** gradient descent from cell i back to a source of this run -> cells (i first) */
  back(i) {
    const out = [i], tmp = new Int32Array(16); let cur = i, guard = 0;
    while (this.dist(cur) > 0 && guard++ < 200000) {
      const c = nb8(this.G, cur, tmp); let best = -1, bd = this.dist(cur);
      for (let t = 0; t < c; t += 2) { const j = tmp[t], d = this.dist(j); if (d >= 0 && d < bd) { bd = d; best = j; } }
      if (best < 0) break; cur = best; out.push(cur);
    }
    return out;
  }
}
/** straight walk between two cells along open edges (Bresenham; a diagonal step needs both straight ways round the corner) */
function lineOk(G, a, b) {
  let x = a % G.w, y = (a / G.w) | 0; const x2 = b % G.w, y2 = (b / G.w) | 0;
  const dx = Math.abs(x2 - x), dy = Math.abs(y2 - y), sx = x < x2 ? 1 : -1, sy = y < y2 ? 1 : -1; let err = dx - dy, i = a;
  const K = (mx, my) => mx === 1 ? 0 : mx === -1 ? 1 : my === 1 ? 2 : 3;
  while (x !== x2 || y !== y2) {
    const e2 = 2 * err; let mx = 0, my = 0;
    if (e2 > -dy) { err -= dy; mx = sx; }
    if (e2 < dx) { err += dx; my = sy; }
    let j;
    if (mx && my) { const p = nb(G, i, K(mx, 0)), q = nb(G, i, K(0, my)); if (p < 0 || q < 0) return false; j = nb(G, p, K(0, my)); if (j < 0 || j !== nb(G, q, K(mx, 0))) return false; }
    else j = nb(G, i, K(mx, my));
    if (j < 0) return false;
    i = j; x += mx; y += my;
  }
  return true;
}
/** cells (start..end) -> waypoints [[x,y,z]] with wall-free straight legs <= maxLeg */
function smoothRoute(G, cells, maxLeg) {
  if (!cells.length) return [];
  const out = [[cx(G, cells[0]), cy(G, cells[0]), G.H[cells[0]]]], maxC = Math.max(4, Math.floor((maxLeg || 1000) / CELL));
  let i = 0;
  while (i < cells.length - 1) {
    let j = Math.min(cells.length - 1, i + maxC);
    while (j > i + 1 && !lineOk(G, cells[i], cells[j])) j--;
    out.push([cx(G, cells[j]), cy(G, cells[j]), G.H[cells[j]]]); i = j;
  }
  return out;
}
const polyArea = RP.polyArea, inPoly = RP.inPoly;
const distToSeg = (x, y, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy; let t = L ? ((x - a[0]) * dx + (y - a[1]) * dy) / L : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy); };
const distToPoly = (x, y, P) => inPoly(x, y, P) ? 0 : Math.min(...P.map((p, i) => distToSeg(x, y, p, P[(i + 1) % P.length])));
const COMPASS = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];
const compassOf = (dx, dy) => COMPASS[((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8];   // y grows to the south in L2
const wq = (arr, q) => { const a = arr.slice().sort((x, y) => x.v - y.v), tot = a.reduce((t, x) => t + x.w, 0); let acc = 0; for (const x of a) { acc += x.w; if (acc >= q * tot) return x.v; } return a.length ? a[a.length - 1].v : 0; };

// ---------------------------------------------------------------------------------------------------------------------------------
// clustering (straight distance + level), per connected piece of ground
// ---------------------------------------------------------------------------------------------------------------------------------
function clusterSpawns(S) {
  // S: [{x,y,level,w,comp}] -> cluster index per spawn (array)
  const R = P.clusterR, lw = P.lvlWeight;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) + Math.abs(a.level - b.level) * lw;
  // density for the leader order
  const dens = S.map(a => S.reduce((t, b) => t + (b.comp === a.comp && Math.hypot(a.x - b.x, a.y - b.y) < 1500 ? b.w : 0), 0));
  const order = S.map((_, i) => i).sort((a, b) => dens[b] - dens[a]);
  const lab = new Array(S.length).fill(-1); let C = [];
  order.forEach(i => {
    if (lab[i] >= 0) return;
    const c = { x: S[i].x, y: S[i].y, level: S[i].level, comp: S[i].comp };
    C.push(c); const k = C.length - 1;
    S.forEach((s, j) => { if (lab[j] < 0 && s.comp === c.comp && dist(s, c) < R) lab[j] = k; });
  });
  for (let it = 0; it < 8; it++) {
    // centroids
    C = C.map((c, k) => { const m = S.filter((_, j) => lab[j] === k); if (!m.length) return null; const W = m.reduce((t, s) => t + s.w, 0);
      return { x: m.reduce((t, s) => t + s.x * s.w, 0) / W, y: m.reduce((t, s) => t + s.y * s.w, 0) / W, level: m.reduce((t, s) => t + s.level * s.w, 0) / W, comp: c.comp }; });
    const map = []; const C2 = []; C.forEach((c, k) => { if (c) { map[k] = C2.length; C2.push(c); } }); C = C2;
    S.forEach((s, j) => { let best = -1, bd = 1e18; C.forEach((c, k) => { if (c.comp !== s.comp) return; const d = dist(s, c); if (d < bd) { bd = d; best = k; } }); lab[j] = best; });
    // split clusters that spread too wide
    let split = false;
    C.slice().forEach((c, k) => {
      const m = S.map((s, j) => j).filter(j => lab[j] === k); if (m.length < 2 * P.minArea) return;
      const ds = m.map(j => ({ v: Math.hypot(S[j].x - c.x, S[j].y - c.y), w: S[j].w }));
      if (wq(ds, 0.9) <= P.splitR) return;
      // two seeds: the farthest spawn and the spawn farthest from it
      let a = m[0]; m.forEach(j => { if (Math.hypot(S[j].x - c.x, S[j].y - c.y) > Math.hypot(S[a].x - c.x, S[a].y - c.y)) a = j; });
      let b = m[0]; m.forEach(j => { if (Math.hypot(S[j].x - S[a].x, S[j].y - S[a].y) > Math.hypot(S[b].x - S[a].x, S[b].y - S[a].y)) b = j; });
      C[k] = { x: S[a].x, y: S[a].y, level: S[a].level, comp: c.comp }; C.push({ x: S[b].x, y: S[b].y, level: S[b].level, comp: c.comp }); split = true;
    });
    if (split) S.forEach((s, j) => { let best = -1, bd = 1e18; C.forEach((c, k) => { if (c.comp !== s.comp) return; const d = dist(s, c); if (d < bd) { bd = d; best = k; } }); lab[j] = best; });
  }
  // small clusters: merge into the nearest cluster of the same piece of ground, else drop (< minKeep)
  for (let pass = 0; pass < 3; pass++) {
    const wsum = C.map((_, k) => S.reduce((t, s, j) => t + (lab[j] === k ? s.w : 0), 0));
    C.forEach((c, k) => {
      if (!wsum[k] || wsum[k] >= P.minArea) return;
      let best = -1, bd = P.mergeDist; C.forEach((o, q) => { if (q === k || o.comp !== c.comp || wsum[q] < P.minArea) return; const d = Math.hypot(o.x - c.x, o.y - c.y); if (d < bd) { bd = d; best = q; } });
      if (best >= 0) { S.forEach((s, j) => { if (lab[j] === k) lab[j] = best; }); wsum[best] += wsum[k]; wsum[k] = 0; }
    });
  }
  const wsum = C.map((_, k) => S.reduce((t, s, j) => t + (lab[j] === k ? s.w : 0), 0));
  return lab.map(k => k >= 0 && wsum[k] >= P.minKeep ? k : -1);
}

// ---------------------------------------------------------------------------------------------------------------------------------
// one region
// ---------------------------------------------------------------------------------------------------------------------------------
function buildRegion(reg, A, allLandings, ctx) {
  const t0 = Date.now();
  const S0 = reg.spawns;
  let x1 = Math.min(...S0.map(s => s.x)) - 2500, x2 = Math.max(...S0.map(s => s.x)) + 2500, y1 = Math.min(...S0.map(s => s.y)) - 2500, y2 = Math.max(...S0.map(s => s.y)) + 2500;
  // the region's own landings + every other landing near the box (an area may be nearer on foot to the neighbour's landing)
  const lands = allLandings.filter(l => reg.landings.includes(l) || (l.x > x1 - 4000 && l.x < x2 + 4000 && l.y > y1 - 4000 && l.y < y2 + 4000));
  lands.forEach(l => { x1 = Math.min(x1, l.x - 800); x2 = Math.max(x2, l.x + 800); y1 = Math.min(y1, l.y - 800); y2 = Math.max(y2, l.y + 800); });
  const zs = S0.map(s => s.z).concat(lands.map(l => l.z));
  const zBand = [Math.min(...zs) - 1500, Math.max(...zs) + 1500];
  const G = RP.buildFloor([x1, x2, y1, y2], zBand, S0.map(s => ({ x: s.x, y: s.y, z: s.z })).concat(lands.map(l => ({ x: l.x, y: l.y, z: l.z }))));
  const sIdx = G.seedIdx.slice(0, S0.length), lIdx = G.seedIdx.slice(S0.length);
  // connected pieces of ground
  const comp = new Int32Array(G.n).fill(-1); { let lab = 0; const q = new Int32Array(G.n);
    for (let s = 0; s < G.n; s++) { if (!G.OK[s] || comp[s] >= 0) continue; let qh = 0, qt = 0; q[qt++] = s; comp[s] = lab;
      while (qh < qt) { const i = q[qh++]; for (let k = 0; k < 4; k++) { const j = nb(G, i, k); if (j >= 0 && comp[j] < 0) { comp[j] = lab; q[qt++] = j; } } } lab++; } }
  const S = []; let unsnapped = 0;
  S0.forEach((s, k) => { const i = sIdx[k]; if (i < 0) { unsnapped++; return; } S.push(Object.assign({}, s, { cell: i, comp: comp[i] })); });
  if (S.length < P.minRegionSpawns) return { skip: `only ${S.length} spawns on walkable ground` };
  const lab = clusterSpawns(S);
  const K = Math.max(-1, ...lab) + 1;
  // cluster hulls (+300) for the hull extension
  const hulls = []; for (let k = 0; k < K; k++) { const m = S.filter((_, j) => lab[j] === k); if (m.length < 3) { hulls[k] = null; continue; }
    const h = RP.convexHull(m.map(s => [s.x, s.y])); const mx = h.reduce((t, p) => t + p[0], 0) / h.length, my = h.reduce((t, p) => t + p[1], 0) / h.length;
    hulls[k] = h.map(p => { const d = Math.hypot(p[0] - mx, p[1] - my) || 1; return [p[0] + (p[0] - mx) / d * 300, p[1] + (p[1] - my) / d * 300]; }); }
  // labelled Dijkstra from every cluster's spawns
  const dj = new Dij(G);
  const padC = Math.round(P.pad / CELL * 10), hullC = Math.round(P.hullPad / CELL * 10);
  const inHullCache = new Map();
  const inHull = (j, l) => { const h = hulls[l]; if (!h) return false; const key = j * 64 + (l % 64); let v = inHullCache.get(key); if (v === undefined) { v = inPoly(cx(G, j), cy(G, j), h); inHullCache.set(key, v); } return v; };
  dj.run(S.map((s, j) => [s.cell, lab[j], 0]).filter(x => x[1] >= 0), hullC, (j, l, nd) => nd <= padC || inHull(j, l));
  const cellLab = new Int32Array(G.n).fill(-1);
  for (let i = 0; i < G.n; i++) { const l = dj.label(i); if (l >= 0) cellLab[i] = l; }
  // pieces: an area's cells must be one connected piece
  let areas = [];
  for (let k = 0; k < K; k++) {
    const mine = S.map((s, j) => j).filter(j => lab[j] === k); if (!mine.length) continue;
    const seen = new Map(); const pieces = [];
    mine.forEach(j => {
      const c0 = S[j].cell; if (cellLab[c0] !== k || seen.has(c0)) return;
      const q = [c0]; seen.set(c0, pieces.length); const cells = [];
      for (let h = 0; h < q.length; h++) { const i = q[h]; cells.push(i); for (let t = 0; t < 4; t++) { const n2 = nb(G, i, t); if (n2 >= 0 && cellLab[n2] === k && !seen.has(n2)) { seen.set(n2, pieces.length); q.push(n2); } } }
      pieces.push({ cells, spawns: [] });
    });
    mine.forEach(j => { const p = seen.get(S[j].cell); if (p !== undefined) pieces[p].spawns.push(j); });
    pieces.sort((a, b) => b.spawns.reduce((t, j) => t + S[j].w, 0) - a.spawns.reduce((t, j) => t + S[j].w, 0));
    pieces.forEach((p, pi) => {
      const w = p.spawns.reduce((t, j) => t + S[j].w, 0);
      if (pi === 0 ? w >= P.minKeep : w >= P.pieceMin) areas.push({ cells: p.cells, spawns: p.spawns, split: pi > 0 });
      else p.cells.forEach(i => { cellLab[i] = -1; });
    });
  }
  areas.forEach((a, k) => { a.cells.forEach(i => { cellLab[i] = k; }); a.spawns.forEach(j => { S[j].area = k; }); });
  // outline + numbers
  areas.forEach((a, k) => {
    const loop = RP.outline(G, new Set(a.cells));
    const simp = loop.length >= 3 ? RP.simplifyLoop(loop, P.maxCorners) : null;
    a.poly = simp ? simp.pts.map(p => [Math.round(p[0]), Math.round(p[1])]) : null;
    if (!a.poly || a.poly.length < 3) { // spawn hull fallback
      const h = RP.convexHull(a.spawns.map(j => [S[j].x, S[j].y])); a.poly = h.length >= 3 ? h.map(p => [Math.round(p[0]), Math.round(p[1])]) : null; a.method = 'spawn-hull';
    } else a.method = 'geodata';
    const hs = a.cells.map(i => G.H[i]).sort((x, y) => x - y);
    a.zRange = [hs[Math.floor(hs.length * 0.02)], hs[Math.floor(hs.length * 0.98)]];
    // centre: the own spawn nearest to the spawn centroid (so it stands on the ground of the area)
    const W = a.spawns.reduce((t, j) => t + S[j].w, 0), mx = a.spawns.reduce((t, j) => t + S[j].x * S[j].w, 0) / W, my = a.spawns.reduce((t, j) => t + S[j].y * S[j].w, 0) / W;
    let cj = a.spawns[0]; a.spawns.forEach(j => { if (Math.hypot(S[j].x - mx, S[j].y - my) < Math.hypot(S[cj].x - mx, S[cj].y - my)) cj = j; });
    a.centerCell = S[cj].cell; a.center = [cx(G, S[cj].cell), cy(G, S[cj].cell), G.H[S[cj].cell]];
  });
  areas = areas.filter(a => a.poly);
  areas.forEach((a, k) => { a.k = k; a.spawns.forEach(j => { S[j].area = k; }); });
  // quality
  areas.forEach(a => {
    const own = a.spawns, inside = own.filter(j => inPoly(S[j].x, S[j].y, a.poly)).length, near = own.filter(j => distToPoly(S[j].x, S[j].y, a.poly) <= 150).length;
    const foreign = S.filter((s, j) => s.area !== undefined && s.area !== a.k && inPoly(s.x, s.y, a.poly)).length;
    a.q = { ownSpawns: own.length, ownInside: Math.round(100 * inside / own.length), ownNear: Math.round(100 * near / own.length), foreign };
  });
  // overlap (sampled every 64 units inside the polygon)
  areas.forEach(a => {
    const xs = a.poly.map(p => p[0]), ys = a.poly.map(p => p[1]); let n = 0, o = 0;
    const others = areas.filter(b => b !== a && Math.max(...b.poly.map(p => p[0])) > Math.min(...xs) && Math.min(...b.poly.map(p => p[0])) < Math.max(...xs) && Math.max(...b.poly.map(p => p[1])) > Math.min(...ys) && Math.min(...b.poly.map(p => p[1])) < Math.max(...ys));
    for (let x = Math.min(...xs); x <= Math.max(...xs); x += 64) for (let y = Math.min(...ys); y <= Math.max(...ys); y += 64) { if (!inPoly(x, y, a.poly)) continue; n++; if (others.some(b => inPoly(x, y, b.poly))) o++; }
    a.q.overlap = n ? Math.round(100 * o / n) : 0;
    a.area = Math.round(polyArea(a.poly));
    a.q.quality = a.method === 'spawn-hull' ? 'spawn-hull' : a.area < 1.2e6 ? 'small' : (a.q.ownNear >= 90 && a.q.foreign <= Math.max(2, a.q.ownSpawns * 0.1) && a.q.overlap <= 10) ? 'good' : 'check';
  });
  // entry (REACHABLE ENTRY 2026-10-09): a gatekeeper landing within entryMax ON FOOT, live menus first (regionEntries: its own grid over the
  // region + every candidate landing, not only the landings next to the box); none = not reachable, the nearest landing stays as a 'far' entry
  { const EL = A.EL || (A.EL = entryLandings(A));
    const r = regionEntries(A, EL, areas.map(a => ({ center: a.center, zRange: a.zRange })), [x1, x2, y1, y2]);
    areas.forEach((a, k) => { const e = r.list[k]; a.entry = e.entry; a.entryOk = e.reachable; a.unreachable = e.unreachable; a.entryNote = e.note; }); }
  // safe spot candidates (every 4th cell)
  const D = RP.clearance(G);
  const mobs = A.spawns.filter(s => { const n = A.NPC[s.id]; return n && n.ty === 'L2Monster' && s.x >= x1 - 3000 && s.x <= x2 + 3000 && s.y >= y1 - 3000 && s.y <= y2 + 3000 && s.z >= zBand[0] - 400 && s.z <= zBand[1] + 400; })
    .map(s => { const n = A.NPC[s.id], ag = A.AGGRO[n.n]; return { x: s.x, y: s.y, need: ag ? Math.max(P.safeNeed, ag + 300) : P.safePassive, tight: ag ? Math.max(P.safeTight, ag + 150) : P.safePassiveTight }; });
  const HSZ = 2000, hash = new Map(); mobs.forEach(m => { const k = Math.floor(m.x / HSZ) + ':' + Math.floor(m.y / HSZ); (hash.get(k) || hash.set(k, []).get(k)).push(m); });
  const mobInfo = (x, y) => { let best = 1e9, ok = true, okT = true; const gx = Math.floor(x / HSZ), gy = Math.floor(y / HSZ);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) (hash.get((gx + a) + ':' + (gy + b)) || []).forEach(m => { const dd = Math.hypot(m.x - x, m.y - y); if (dd < best) best = dd; if (dd < m.need) ok = false; if (dd < m.tight) okT = false; });
    return { best, ok, okT }; };
  const cand = new Map();
  for (let y = 0; y < G.h; y += 4) for (let x = 0; x < G.w; x += 4) {
    const i = y * G.w + x; if (!G.OK[i] || D[i] < 30 || cellLab[i] >= 0) continue;
    const wx = cx(G, i), wy = cy(G, i), mi = mobInfo(wx, wy); if (!mi.okT) continue;
    if (areas.some(a => distToPoly(wx, wy, a.poly) < 150)) continue;
    cand.set(i, { tier: mi.ok ? 'safe' : 'tight', mc: Math.round(Math.min(mi.best, 99999)) });
  }
  // neighbours + nearest safe spot: bounded Dijkstra from every area centre
  const dn = new Dij(G), maxC = Math.round(P.neighbourMax / CELL * 10);
  const centreOf = new Map(); areas.forEach(a => centreOf.set(a.centerCell, a.k));
  const picked = new Map();   // cell -> [{ k, walk }]
  areas.forEach(a => {
    const reached = dn.run([[a.centerCell, a.k, 0]], maxC);
    a.neighbours = [];
    // neighbours: areas whose cells touch mine, or whose centre is within the walk limit and nearer than any third area in between
    const touch = new Set(); a.cells.forEach(i => { for (let t = 0; t < 4; t++) { const j = nb(G, i, t); if (j >= 0 && cellLab[j] >= 0 && cellLab[j] !== a.k) touch.add(cellLab[j]); } });
    areas.forEach(b => {
      if (b === a) return; const d = dn.dist(b.centerCell); if (d < 0) return;
      const walk = Math.round(d / 10 * CELL);
      if (!touch.has(b.k) && walk > 6500) return;
      a.neighbours.push({ k: b.k, walk, route: smoothRoute(G, dn.back(b.centerCell).reverse(), 1000), touching: touch.has(b.k) });
    });
    a.neighbours.sort((p, q) => p.walk - q.walk); a.neighbours = a.neighbours.slice(0, 6);
    // nearest safe candidate by walking ('safe' within 4000, else the nearest 'tight' when it is less than half as far)
    let bs = null, bt = null;
    for (const i of reached) { const c = cand.get(i); if (!c) continue; const w = dn.dist(i); if (c.tier === 'safe' && !bs) bs = { i, w }; if (!bt) bt = { i, w }; if (bs && bt) break; }
    const use = bs && (bs.w / 10 * CELL <= 4000 || !bt || bt.w * 2 > bs.w) ? bs : bt;
    if (use) (picked.get(use.i) || picked.set(use.i, []).get(use.i)).push({ k: a.k, walk: Math.round(use.w / 10 * CELL) });
  });
  // merge safe spots closer than 700
  const sl = [...picked.entries()].map(([i, near]) => ({ i, near, ...cand.get(i) })).sort((a, b) => b.mc - a.mc), safe = [];
  sl.forEach(s => { const o = safe.find(t => Math.hypot(cx(G, t.i) - cx(G, s.i), cy(G, t.i) - cy(G, s.i)) < 700); if (o) o.near.push(...s.near); else safe.push(s); });
  return { G, S, areas, safe, lands, comp, cellLab, box: [x1, x2, y1, y2], unsnapped, ms: Date.now() - t0 };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// output records
// ---------------------------------------------------------------------------------------------------------------------------------
function regionRecord(reg, res, A, used) {
  const { S, areas, safe, G } = res, key = reg.key;
  // order: nearest to the region's own landing first
  const own = reg.landings[0];
  areas.sort((a, b) => (a.entry ? a.entry.walk : 1e9) - (b.entry ? b.entry.walk : 1e9) || Math.hypot(a.center[0] - own.x, a.center[1] - own.y) - Math.hypot(b.center[0] - own.x, b.center[1] - own.y));
  areas.forEach((a, n) => { a.id = `${key}-${n + 1}`; a.n = n + 1; });
  const idOf = (k) => (areas.find(a => a.k === k) || {}).id;
  const out = areas.map(a => {
    const mon = {};
    a.spawns.forEach(j => { const s = S[j]; const m = mon[s.id] || (mon[s.id] = { id: s.id, name: s.name, level: s.level, count: 0, aggressive: s.aggressive, aggro: s.aggro || 0 }); m.count += s.w; });
    const ml = Object.values(mon).sort((x, y) => y.count - x.count);
    const lv = a.spawns.map(j => ({ v: S[j].level, w: S[j].w }));
    const p10 = wq(lv, 0.1), p90 = wq(lv, 0.9), mn = Math.min(...lv.map(x => x.v)), mx = Math.max(...lv.map(x => x.v)), med = wq(lv, 0.5);
    let suits = [p90 - 2, p10 + 3], suitNote = null;
    if (suits[0] > suits[1]) { suits = [med - 2, med + 3]; suitNote = 'mixed levels: built on the median monster level ' + med; }
    const W = a.spawns.reduce((t, j) => t + S[j].w, 0), agg = a.spawns.reduce((t, j) => t + (S[j].aggressive ? S[j].w : 0), 0);
    const resp = a.spawns.map(j => S[j].resp).filter(x => x > 0).sort((x, y) => x - y);
    const raids = (A.RB || []).filter(b => isFinite(b.x) && Math.abs((b.z || 0) - a.center[2]) < 1500 && distToPoly(b.x, b.y, a.poly) <= 3000)
      .map(b => ({ name: b.name, level: b.level, x: b.x, y: b.y, z: b.z, dist: Math.round(distToPoly(b.x, b.y, a.poly)) }));
    const dirFrom = a.entry ? a.entry.landing : [own.x, own.y];
    const dir = Math.hypot(a.center[0] - dirFrom[0], a.center[1] - dirFrom[1]) > 1200 ? compassOf(a.center[0] - dirFrom[0], a.center[1] - dirFrom[1]) : 'at the landing';
    const reach = !!(a.entry && a.entryOk && a.entry.walk <= P.entryMax);
    return {
      id: a.id, n: a.n, name: `${reg.name} ${a.n}: ${ml[0] ? ml[0].name : 'monster'} area (${dir})`, side: dir,
      center: a.center.map(Math.round), radius: Math.round(Math.max(600, ...a.poly.map(p => Math.hypot(p[0] - a.center[0], p[1] - a.center[1])))),
      poly: a.poly, zRange: a.zRange, area: a.area, levelRange: [p10, p90], levelAll: [mn, mx], suitsPartyLevel: suits, ...(suitNote ? { suitNote } : {}),
      dangerMax: mx, spawnCount: W, aggressiveShare: Math.round(100 * agg / W) / 100, respawnSec: resp.length ? resp[Math.floor(resp.length / 2)] : null,
      monsters: ml, raidBosses: raids,
      entry: a.entry ? Object.assign({}, a.entry, { far: !reach }) : null, reachable: reach,
      ...(reach ? {} : { unreachable: a.unreachable || 'no gatekeeper landing within the walk limit' }), ...(a.entryNote ? { entryNote: a.entryNote } : {}),
      neighbours: a.neighbours.map(n => ({ id: idOf(n.k), walk: n.walk, touching: n.touching, route: n.route })).filter(n => n.id),
      safeSpot: null, polyInfo: Object.assign({ method: a.method, corners: a.poly.length, split: !!a.split }, a.q),
    };
  });
  const safeOut = safe.map((s, n) => {
    const near = s.near.sort((p, q) => p.walk - q.walk).filter((x, i, arr) => arr.findIndex(y => y.k === x.k) === i).map(x => ({ id: idOf(x.k), walk: x.walk })).filter(x => x.id);
    return { id: `${key}-safe-${n + 1}`, name: near.length > 1 ? `between ${near[0].id.split('-').pop()} and ${near[1].id.split('-').pop()}` : near.length ? `next to area ${near[0].id.split('-').pop()}` : 'safe spot',
      x: cx(G, s.i), y: cy(G, s.i), z: G.H[s.i], tier: s.tier, monsterClear: s.mc, nearAreas: near };
  });
  out.forEach(a => { const s = safeOut.find(x => x.nearAreas.some(y => y.id === a.id)); if (s) a.safeSpot = { id: s.id, walk: s.nearAreas.find(y => y.id === a.id).walk }; });
  const L = out.flatMap(a => a.levelRange);
  return { id: key, name: reg.name, kind: reg.orphan ? 'far' : 'field',
    landings: reg.landings.map(l => ({ kind: l.kind, from: l.from, desc: l.desc, to: l.to, x: l.x, y: l.y, z: l.z, live: l.live, price: l.price })),
    center: [reg.x, reg.y, reg.z], bbox: res.box.map(Math.round), levelRange: L.length ? [Math.min(...L), Math.max(...L)] : null,
    areas: out, safeSpots: safeOut,
    stats: { spawns: reg.spawns.length, unsnapped: res.unsnapped, cells: res.G.cells, ms: res.ms } };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// images (same renderer as the room checks)
// ---------------------------------------------------------------------------------------------------------------------------------
function writeImage(rec, res) {
  const span = Math.max(res.box[1] - res.box[0], res.box[3] - res.box[2]), scale = Math.max(8, Math.ceil(span / 2000));
  const shown = rec.areas.map((a, k) => ({ k, poly: a.poly, cells: res.areas.find(x => x.id === a.id).cells, r: a }));
  const sp = res.S.map(s => ({ x: s.x, y: s.y, room: s.area === undefined ? -1 : shown.findIndex(r => res.areas.find(x => x.id === r.r.id).k === s.area) }));
  const ov = RP.overlay({ G: res.G, box: res.box, result: shown, sp }, scale);
  fs.writeFileSync(path.join(OUTDIR, rec.id + '_overlay.png'), ov.buf);
  const regions = [];
  for (let rx = Math.floor(res.box[0] / 32768) + 20; rx <= Math.floor(res.box[1] / 32768) + 20; rx++) for (let ry = Math.floor(res.box[2] / 32768) + 18; ry <= Math.floor(res.box[3] / 32768) + 18; ry++)
    regions.push({ file: `${rx}_${ry}`, x0: (rx - 20) * 32768, y0: (ry - 18) * 32768 });
  const PAL = [[255, 80, 80], [80, 200, 255], [255, 210, 60], [120, 255, 120], [255, 120, 255], [255, 160, 60], [160, 140, 255], [60, 255, 210], [255, 255, 255], [200, 255, 80], [255, 100, 160], [100, 160, 255]];
  const labels = rec.areas.map((a, k) => ({ text: `${a.n} ${a.levelRange.join('-')}${a.polyInfo.quality !== 'good' ? ' (' + a.polyInfo.quality + ')' : ''}${a.reachable ? '' : ' far'}`, x: (a.center[0] - res.box[0]) / scale, y: (a.center[1] - res.box[2]) / scale, c: PAL[k % PAL.length] }))
    .concat(rec.landings.map(l => ({ text: `◆ ${l.desc}`, x: (l.x - res.box[0]) / scale, y: (l.y - res.box[2]) / scale, c: [255, 255, 255] })));
  const safe = rec.safeSpots.map(s => ({ x: (s.x - res.box[0]) / scale, y: (s.y - res.box[2]) / scale, text: s.id.split('-').pop() + (s.tier === 'tight' ? ' tight' : '') }));
  fs.writeFileSync(path.join(OUTDIR, rec.id + '_meta.json'), JSON.stringify({ out: rec.id + '.jpg', overlay: rec.id + '_overlay.png', box: res.box, scale, W: ov.W, H: ov.H, regions, labels, safe,
    title: `${rec.name} — ${rec.areas.length} areas, lvl ${(rec.levelRange || []).join('-')}, ${rec.safeSpots.length} safe spots` }));
}
function writeIndex(out) {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const rows = out.regions.flatMap(R => R.areas.map(a => `<tr class="q-${esc(a.polyInfo.quality)}"><td>${esc(R.name)}</td><td>${esc(a.id)}</td><td>${esc(a.name.replace(R.name + ' ', ''))}</td><td>${a.levelRange.join('-')}</td><td>${a.suitsPartyLevel.join('-')}</td><td>${a.dangerMax}</td><td>${a.spawnCount}</td><td>${Math.round(a.aggressiveShare * 100)} %</td><td>${esc(a.polyInfo.quality)}</td><td>${a.polyInfo.ownNear} %</td><td>${a.polyInfo.foreign}</td><td>${a.polyInfo.overlap} %</td><td>${(a.area / 1e6).toFixed(1)}</td><td>${a.entry ? esc(a.entry.desc) + ' + ' + a.entry.walk : '<b>none</b>'}</td><td>${a.neighbours.map(n => n.id.split('-').pop() + ':' + n.walk).join(' ')}</td><td>${a.raidBosses.map(b => esc(b.name) + ' ' + b.level).join(', ')}</td></tr>`)).join('\n');
  const files = out.regions.filter(R => fs.existsSync(path.join(OUTDIR, R.id + '.jpg'))).map(R => R.id + '.jpg');
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Field areas</title>
<style>:root{--bg:#10161b;--fg:#e6e6e6;--mut:#9aa;--bd:#2a3640}@media (prefers-color-scheme: light){:root:not([data-theme="dark"]){--bg:#fff;--fg:#111;--mut:#555;--bd:#ccc}}
body{background:var(--bg);color:var(--fg);font:14px system-ui,sans-serif;margin:0;padding:16px}table{border-collapse:collapse;font-size:12px;width:100%}td,th{border:1px solid var(--bd);padding:2px 5px}
.q-check td{background:rgba(255,80,80,.15)}.q-small td,.q-spawn-hull td{background:rgba(255,200,60,.12)}img{max-width:100%;border:1px solid var(--bd)}.wrap{overflow-x:auto}</style></head><body>
<h1>Field areas (Scripts/data/field_areas.json)</h1><p>Generated ${esc(out.generated)} by docs/plan/tools/field_areas.js: ${out.regions.length} regions, ${out.regions.reduce((t, R) => t + R.areas.length, 0)} areas, ${out.regions.reduce((t, R) => t + R.safeSpots.length, 0)} safe spots.
Colours = areas; dots = monster spawns in the colour of their area (grey = in no area); faint cyan = walkable geodata; ◆ = gatekeeper landings; green shields = safe spots. Quality: good = own monsters >= 90 % inside / within 150, few foreign, overlap <= 10 %; check = not; small = under 1.2 km²; far = no landing within ${P.entryMax} on foot.</p>
<div class="wrap"><table><tr><th>Region</th><th>Area</th><th>Name</th><th>Monsters</th><th>Suits party</th><th>Max</th><th>Spawns</th><th>Aggr.</th><th>Quality</th><th>Own near</th><th>Foreign</th><th>Overlap</th><th>km²</th><th>Entry + walk</th><th>Neighbours (walk)</th><th>Raid bosses</th></tr>
${rows}</table></div>
${files.map(f => `<h2>${esc(f)}</h2><img src="${esc(f)}" loading="lazy" alt="${esc(f)}">`).join('\n')}
</body></html>`;
  fs.writeFileSync(path.join(OUTDIR, 'index.html'), html);
}

// ---------------------------------------------------------------------------------------------------------------------------------
// regions
// ---------------------------------------------------------------------------------------------------------------------------------
function makeRegions(A, sp) {
  const seeds = landingSeeds(A);
  const allLandings = seeds.flatMap(s => s.landings);
  const regs = seeds.map(s => Object.assign({}, s, { spawns: [] }));
  const orphans = [];
  sp.forEach(s => {
    let best = null, bd = P.seedMax;
    regs.forEach(r => r.landings.forEach(l => { const d = Math.hypot(l.x - s.x, l.y - s.y); if (d < bd && Math.abs(l.z - s.z) < 3500) { bd = d; best = r; } }));
    if (best) best.spawns.push(s); else orphans.push(s);
  });
  // orphans: single-link groups, named after the nearest named datapack spot
  const lab = new Array(orphans.length).fill(-1); let G = 0;
  orphans.forEach((s, i) => { if (lab[i] >= 0) return; const q = [i]; lab[i] = G; for (let h = 0; h < q.length; h++) { const a = orphans[q[h]]; orphans.forEach((b, j) => { if (lab[j] < 0 && Math.hypot(a.x - b.x, a.y - b.y) < P.orphanLink) { lab[j] = G; q.push(j); } }); } G++; });
  const named = A.HS.filter(h => h.center && !/^Area @/.test(h.name) && !/^(Human|Elf|Dark Elf|Orc|Dwarf|Kamael)\b/.test(h.name));
  for (let g = 0; g < G; g++) {
    const m = orphans.filter((_, i) => lab[i] === g); if (m.length < P.minRegionSpawns) continue;
    const x = Math.round(m.reduce((t, s) => t + s.x, 0) / m.length), y = Math.round(m.reduce((t, s) => t + s.y, 0) / m.length), z = Math.round(m.reduce((t, s) => t + s.z, 0) / m.length);
    let nm = null, bd = 12000; named.forEach(h => { const d = Math.hypot(h.center.x - x, h.center.y - y); if (d < bd) { bd = d; nm = h.name.replace(/\s*\(Lv[^)]*\)\s*$/, ''); } });
    let near = null, nd = 1e9; allLandings.forEach(l => { const d = Math.hypot(l.x - x, l.y - y); if (d < nd) { nd = d; near = l; } });
    regs.push({ name: nm ? `${nm} (far)` : `Wilds @${Math.round(x / 1000)}k,${Math.round(y / 1000)}k`, key: '', x, y, z, landings: near ? [near] : [], spawns: m, orphan: true });
  }
  // keys (unique slugs)
  const used = new Set();
  regs.forEach(r => { let k = slug(r.name) || 'region'; let n = 2; const k0 = k; while (used.has(k)) k = `${k0}-${n++}`; used.add(k); r.key = k; });
  return { regs: regs.filter(r => r.spawns.length >= P.minRegionSpawns), allLandings, orphans: orphans.length };
}
/** custom zones (plain outdoor) -> the areas inside their hunting square (zoneScale 3) on the same height */
function zoneMap(A, regions) {
  const out = {};
  A.CZ.forEach(z => {
    if (!z || !isFinite(z.x) || z.rooms || z.dungeon || z.poly || z.zmap || (z.waypoints && z.waypoints.length) || (z.pulls && z.pulls.length)) return;
    const h = Math.max(+z.radius || 3000, 3000) * 3 / 2 + 500, k = `${Math.round(z.x)},${Math.round(z.y)}`;
    const ids = [];
    let regBest = null, rb = 0;
    regions.forEach(R => { let n = 0; R.areas.forEach(a => { if (Math.abs(a.center[0] - z.x) <= h && Math.abs(a.center[1] - z.y) <= h && !(isFinite(z.z) && Math.abs(a.center[2] - z.z) > 1200)) { ids.push(a.id); n++; } }); if (n > rb) { rb = n; regBest = R.id; } });
    const e = out[k] || (out[k] = { zones: [], center: { x: z.x, y: z.y, z: z.z }, region: regBest, areaIds: ids });
    if (!e.zones.includes(z.name)) e.zones.push(z.name);
  });
  return out;
}

/** --entries (2026-10-09): recompute ONLY entry / reachable / unreachable + region names / landings of the existing file (area ids, outlines,
 *  neighbours, safe spots unchanged: party_spots.json and the claims keep pointing at the same areas). ~ minutes instead of the 60-90 min run. */
function fixEntries(F, A, opt) {
  opt = opt || {};
  const EL = A.EL || (A.EL = entryLandings(A));
  const changes = [];
  (F.regions || []).forEach(R => {
    if (opt.only && !opt.only.includes(R.id)) return;
    const t0 = Date.now();
    const before = (R.areas || []).map(a => ({ id: a.id, reachable: !!a.reachable, desc: a.entry && a.entry.desc, walk: a.entry && a.entry.walk }));
    const nameBefore = R.name;
    const areas = (R.areas || []).filter(a => Array.isArray(a.center) && a.center.length >= 3);
    const box = Array.isArray(R.bbox) && R.bbox.length === 4 ? R.bbox.slice() : [Math.min(...areas.map(a => a.center[0])) - 3000, Math.max(...areas.map(a => a.center[0])) + 3000, Math.min(...areas.map(a => a.center[1])) - 3000, Math.max(...areas.map(a => a.center[1])) + 3000];
    const r = areas.length ? regionEntries(A, EL, areas, box) : { list: [] };
    areas.forEach((a, i) => {
      const e = r.list[i];
      a.entry = e.entry; a.reachable = !!e.reachable;
      if (e.reachable) delete a.unreachable; else a.unreachable = e.unreachable;
      if (e.note) a.entryNote = e.note; else delete a.entryNote;
    });
    fixRegion(R);
    const ch = [];
    (R.areas || []).forEach(a => { const b = before.find(x => x.id === a.id) || {}; const desc = a.entry && a.entry.desc, walk = a.entry && a.entry.walk;
      if (b.reachable !== !!a.reachable || b.desc !== desc) ch.push({ id: a.id, was: `${b.reachable ? 'reachable' : 'far'} via ${b.desc || '-'} ${b.walk || '-'}`, now: `${a.reachable ? 'reachable' : 'NOT reachable'} via ${desc || '-'} ${walk || '-'}`, why: a.unreachable || null }); });
    if (ch.length || nameBefore !== R.name) changes.push({ region: R.id, name: R.name, nameBefore, areas: ch, ms: Date.now() - t0, cells: r.cells });
    if (opt.log) console.log(`${R.id}: ${R.reach.reachable}/${R.reach.areas} reachable${nameBefore !== R.name ? ` (renamed "${nameBefore}" -> "${R.name}")` : ''}, ${ch.length} changed, ${r.cells || 0} cells, ${Date.now() - t0} ms`);
  });
  dedupeNames(F);
  F.params = Object.assign({}, F.params || {}, { walkMax: P.walkMax, walkMargin: P.walkMargin, entryMax: P.entryMax, entrySearch: P.entrySearch });
  F.entriesFixed = { at: new Date().toISOString(), tool: 'docs/plan/tools/field_areas.js --entries', rule: `reachable = a gatekeeper landing (live menus first) within ${P.entryMax} on foot` };
  F.summary = Object.assign({}, F.summary || {}, { reachable: F.regions.reduce((t, R) => t + (R.areas || []).filter(a => a.reachable).length, 0) });
  return changes;
}

if (require.main === module && argv.includes('--names')) {
  const F = readJson(FILE);
  F.regions.forEach(R => { const n0 = R.name; fixRegion(R); if (R.name !== n0) console.log(`${R.id}: "${n0}" -> "${R.name}"`); });
  const before = F.regions.map(R => R.name); dedupeNames(F); F.regions.forEach((R, i) => { if (R.name !== before[i]) console.log(`${R.id}: "${before[i]}" -> "${R.name}" (same name twice)`); });
  if (!argv.includes('--dry')) { require('./manual_guard').writeGuarded(FILE, F, 'area'); console.log('written', FILE); }
} else if (require.main === module && argv.includes('--entries')) {
  const t0 = Date.now();
  const A = loadAll();
  const F = readJson(FILE);
  const only = arg('--only') && arg('--only') !== true ? String(arg('--only')).split(',') : null;
  const changes = fixEntries(F, A, { only, log: true });
  const nCh = changes.reduce((t, c) => t + c.areas.length, 0);
  console.log(`entries: ${changes.length} regions changed, ${nCh} areas changed, reachable now ${F.summary.reachable} of ${F.regions.reduce((t, R) => t + (R.areas || []).length, 0)}, ${Math.round((Date.now() - t0) / 1000)} s`);
  const rep = path.join(ROOT, 'Logs', 'field_areas_entries_' + new Date().toISOString().slice(0, 10) + '.json');
  try { fs.writeFileSync(rep, JSON.stringify({ at: new Date().toISOString(), summary: F.summary, changes }, null, 1)); console.log('report', rep); } catch (e) { }
  if (!argv.includes('--dry')) {
    try { fs.mkdirSync(path.join(ROOT, 'Settings', 'backup'), { recursive: true }); fs.copyFileSync(FILE, path.join(ROOT, 'Settings', 'backup', 'field_areas_before_' + new Date().toISOString().replace(/[:.]/g, '-') + '.json')); } catch (e) { }
    require('./manual_guard').writeGuarded(FILE, F, 'area');
    console.log('written', FILE, Math.round(fs.statSync(FILE).size / 1024), 'KB');
    try { writeIndex(F); } catch (e) { }
  }
} else if (require.main === module) {
  const t0 = Date.now();
  const A = loadAll();
  const sp = outdoorSpawns(A);
  console.log('spawns:', JSON.stringify(sp.st));
  const { regs, allLandings, orphans } = makeRegions(A, sp.list);
  console.log(`regions: ${regs.length} (landing seeds + far groups), orphan spawns ${orphans}`);
  if (argv.includes('--stats')) { regs.sort((a, b) => b.spawns.length - a.spawns.length).forEach(r => console.log(`${r.key}: ${r.spawns.length} spawns, landings ${r.landings.map(l => l.desc).join(' / ')}`)); process.exit(0); }
  const only = arg('--only') && arg('--only') !== true ? String(arg('--only')).split(',') : null;
  const images = !argv.includes('--no-images'), dry = argv.includes('--dry');
  fs.mkdirSync(OUTDIR, { recursive: true });
  let prev = null; try { prev = readJson(FILE); } catch (e) { }
  const out = { generated: new Date().toISOString(), version: 1, tool: 'docs/plan/tools/field_areas.js', params: P, stats: Object.assign({}, sp.st, { orphans }), regions: [] };
  for (const reg of regs) {
    if (only && !only.includes(reg.key)) continue;
    let res;
    try { res = buildRegion(reg, A, allLandings); } catch (e) { console.log(`${reg.key}: FAILED ${e.stack}`); continue; }
    if (res.skip) { console.log(`${reg.key}: skipped (${res.skip})`); continue; }
    const rec = regionRecord(reg, res, A);
    fixRegion(rec, reg.name);                                             // "(far)" names + the landings really used (2026-10-09)
    // NEVER regenerate an area the user edited on the dashboard (manual: true): the stored one replaces the computed one with that id
    const prevR = prev && Array.isArray(prev.regions) ? prev.regions.find(R => R.id === rec.id) : null;
    (prevR ? prevR.areas || [] : []).filter(a => a && (a.manual === true || (a.edited && a.edited.by === 'dashboard'))).forEach(a => {
      const i = rec.areas.findIndex(x => x.id === a.id); if (i >= 0) rec.areas[i] = a; else rec.areas.push(a);
      console.log(`${rec.id}: kept the user's edited area ${a.id}`);
    });
    if (!rec.areas.length) { console.log(`${reg.key}: no areas`); continue; }
    out.regions.push(rec);
    const q = {}; rec.areas.forEach(a => { q[a.polyInfo.quality] = (q[a.polyInfo.quality] || 0) + 1; });
    console.log(`${rec.id}: ${rec.areas.length} areas ${JSON.stringify(q)}, lvl ${(rec.levelRange || []).join('-')}, ${rec.safeSpots.length} safe, ${rec.areas.filter(a => !a.reachable).length} far, ${res.G.cells} cells, ${res.ms} ms`);
    if (images) try { writeImage(rec, res); } catch (e) { console.log('image failed', rec.id, e.message); }
  }
  if (only && prev && Array.isArray(prev.regions)) {   // merge: keep the other regions of the existing file
    const mine = new Set(out.regions.map(R => R.id));
    out.regions = prev.regions.filter(R => !mine.has(R.id)).concat(out.regions);
  }
  out.regions.sort((a, b) => ((a.levelRange || [0])[0] - (b.levelRange || [0])[0]) || a.name.localeCompare(b.name));
  dedupeNames(out);
  out.zones = zoneMap(A, out.regions);
  const nA = out.regions.reduce((t, R) => t + R.areas.length, 0), q = {}; out.regions.forEach(R => R.areas.forEach(a => { q[a.polyInfo.quality] = (q[a.polyInfo.quality] || 0) + 1; }));
  out.summary = { regions: out.regions.length, areas: nA, quality: q, reachable: out.regions.reduce((t, R) => t + R.areas.filter(a => a.reachable).length, 0), safeSpots: out.regions.reduce((t, R) => t + R.safeSpots.length, 0) };
  console.log('summary', JSON.stringify(out.summary), Math.round((Date.now() - t0) / 1000), 's');
  if (!dry) {
    try { fs.mkdirSync(path.join(ROOT, 'Settings', 'backup'), { recursive: true }); if (fs.existsSync(FILE)) fs.copyFileSync(FILE, path.join(ROOT, 'Settings', 'backup', 'field_areas_before_' + new Date().toISOString().replace(/[:.]/g, '-') + '.json')); } catch (e) { }
    // through the manual guard (dashboard shape editor 2026-10-08): areas the user edited (manual: true) keep the user's fields, lock + atomic write
    require('./manual_guard').writeGuarded(FILE, out, 'area');
    console.log('written', FILE, Math.round(fs.statSync(FILE).size / 1024), 'KB');
  }
  if (images) {
    try { cp.execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'render_field_checks.ps1'), '-Dir', OUTDIR], { stdio: 'ignore' }); } catch (e) { console.log('render_field_checks.ps1 failed:', e.message); }
    writeIndex(out);
  }
}
module.exports = { dedupeNames, P, norm, slug, loadAll, outdoorSpawns, landingSeeds, makeRegions, buildRegion, regionRecord, clusterSpawns, lineOk, smoothRoute, entryLandings, regionEntries, fixRegion, fixEntries, liveState };
