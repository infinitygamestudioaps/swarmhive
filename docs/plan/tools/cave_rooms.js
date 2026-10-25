// CAVE ROOMS (owner 2026-10-25: "caves is not mapped correctly?" -> "I want the Devil's Isle cave mapped perfectly"): the cave's rooms were
// clusters of monster spawns with a hull around them (polyInfo "spawn hull", quality "rough": 11 + 2 rooms where the real cave has ~38, rooms
// without spawns missing, outlines over solid rock). This rebuilds a cave dungeon's rooms FROM THE GEODATA, per floor band:
//   1) the walkable floor = flood fill of the geodata inside the band from every datapack spawn of the band (room_polys.buildFloor)
//   2) clearance = distance of every cell to the nearest wall; room CORES = connected cells with clearance >= T (narrow passages drop out)
//   3) every walkable cell goes to the nearest core along the floor (geodesic growth) up to `reach`: the passages between rooms are split
//      in the middle, so the rooms tile the cave without gaps
//   4) outline = the exact wall contour of the room's cells (room_polys.outline + simplify), centre = the most open cell, z range from the cells
//   5) monsters = the datapack spawns standing on the room's cells (levels npcs_h5.json, aggressive aggro_h5.json)
// Room ids: a new room that holds an old room's centre keeps the old id (party spots / claims stay valid); the rest get the next numbers.
// Hand-edited rooms (manual / edited by the dashboard) are left as they are (manual_guard). Then run: room_graph.js --only <key>.
//   node docs/plan/tools/cave_rooms.js [--only devils_isle_caves] [--T 9] [--min 120] [--dry]
'use strict';
const fs = require('fs'), path = require('path');
const RP = require('./room_polys'), MG = require('./manual_guard');
const ROOT = path.join(__dirname, '..', '..', '..'), DATA = path.join(ROOT, 'Scripts', 'data');
const rd = (f) => JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, ''));
const argv = process.argv.slice(2), arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const ONLY = arg('--only', 'devils_isle_caves'), T = Number(arg('--T', 9)), MIN = Number(arg('--min', 120)), DRY = argv.includes('--dry');
const WX0 = -294912, WY0 = -262144, CELL = 16;

const NPC = (() => { try { const j = rd(path.join(DATA, 'npcs_h5.json')); return Array.isArray(j) ? Object.fromEntries(j.map(n => [n.id, n])) : j; } catch (e) { return {}; } })();
const AGG = (() => { try { return rd(path.join(DATA, 'aggro_h5.json')); } catch (e) { return {}; } })();
const BOSSES = (() => { try { const j = rd(path.join(DATA, 'raidbosses_h5.json')); return Array.isArray(j) ? j : (j.bosses || []); } catch (e) { return []; } })();
const nName = (id, fb) => { const n = NPC[id] || {}; return n.n || n.name || fb; };
const nLevel = (id) => { const n = NPC[id] || {}; return Number(n.l || n.level) || null; };

const file = path.join(DATA, 'dungeon_rooms.json');
const D = rd(file);
const d = D.find(x => x.key === ONLY); if (!d) { console.log('no dungeon ' + ONLY); process.exit(1); }
const box = (() => { const b = d.bbox; if (Array.isArray(b) && b.length === 4) return b; const xs = [], ys = []; d.floors.forEach(f => f.rooms.forEach(r => (r.poly || []).forEach(p => { xs.push(p[0]); ys.push(p[1]); }))); return [Math.min(...xs) - 3000, Math.max(...xs) + 3000, Math.min(...ys) - 3000, Math.max(...ys) + 3000]; })();
const bx = box.length === 4 && box[0] < box[1] && box[2] < box[3] ? box : [box[0], box[2], box[1], box[3]];
const spawns = rd(path.join(DATA, 'spawns_h5.json')).filter(s => s.x >= bx[0] && s.x <= bx[1] && s.y >= bx[2] && s.y <= bx[3]);
const cellOf = (F, x, y) => { const gx = Math.floor((x - WX0) / CELL) - F.gx0, gy = Math.floor((y - WY0) / CELL) - F.gy0; return gx < 0 || gy < 0 || gx >= F.w || gy >= F.h ? -1 : gy * F.w + gx; };
const xyOf = (F, i) => [(F.gx0 + (i % F.w)) * CELL + WX0 + 8, (F.gy0 + ((i / F.w) | 0)) * CELL + WY0 + 8];
const COMPASS = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];

const report = [], newFloors = [];
d.floors.forEach((Fl, fi) => {
  const band = Fl.z, inBand = spawns.filter(s => s.z >= band[0] - 150 && s.z <= band[1] + 150);
  const seeds = inBand.map(s => ({ x: s.x, y: s.y, z: s.z })).concat((Fl.rooms || []).filter(r => r.center).map(r => ({ x: r.center[0], y: r.center[1], z: r.center[2] })));
  const F = RP.buildFloor(bx, band, seeds);
  const C = RP.clearance(F);
  const comp = RP.components(F, C, T);
  const cores = new Map(); comp.area.forEach((a, l) => { if (a >= MIN) cores.set(l, []); });
  for (let i = 0; i < F.n; i++) { const l = comp.L[i]; if (l >= 0 && cores.has(l)) cores.get(l).push(i); }
  const limits = {}; cores.forEach((v, l) => { limits[l] = 2147483647; });
  const G = RP.grow ? RP.grow(F, cores, limits) : null;
  if (!G) throw new Error('room_polys.grow is not exported');
  const byRoom = new Map(); for (let i = 0; i < F.n; i++) { const l = G.lab[i]; if (l >= 0 && F.OK[i]) (byRoom.get(l) || byRoom.set(l, []).get(l)).push(i); }
  const rooms = [];
  byRoom.forEach((cells, l) => {
    if (cells.length < MIN) return;
    const set = new Set(cells);
    let poly = RP.outline(F, set); if (!poly || poly.length < 3) return;
    { const sl = RP.simplifyLoop(poly, 60); poly = (sl && sl.pts ? sl.pts : poly).map(p => [Math.round(p[0]), Math.round(p[1])]); }
    let best = cells[0]; cells.forEach(i => { if (C[i] > C[best]) best = i; });
    const [cx, cy] = xyOf(F, best), zs = cells.map(i => F.H[i]);
    const mine = inBand.filter(s => { const i = cellOf(F, s.x, s.y); return i >= 0 && G.lab[i] === l; });
    const mon = {}; mine.forEach(s => { const m = mon[s.id] = mon[s.id] || { name: nName(s.id, s.name), id: s.id, level: nLevel(s.id), count: 0, aggressive: AGG[nName(s.id, s.name)] !== undefined }; m.count += s.count || 1; });
    const ml = Object.values(mon).sort((a, b) => b.count - a.count);
    const lv = ml.map(m => m.level).filter(Boolean);
    const boss = BOSSES.find(b => { const i = cellOf(F, b.x, b.y); return i >= 0 && G.lab[i] === l; });
    rooms.push({ l, cells: cells.length, set, center: [cx, cy, F.H[best]], poly, zRange: [Math.min(...zs), Math.max(...zs)], monsters: ml, spawnCount: ml.reduce((t, m) => t + m.count, 0), levelRange: lv.length ? [Math.min(...lv), Math.max(...lv)] : null, boss: boss ? boss.name : '' });
  });
  // ids: a new room holding an old room's centre keeps that id
  const old = (Fl.rooms || []).filter(r => r.id), used = new Set(), keep = {};
  old.forEach(o => { if (MG.isManual && MG.isManual(o)) return; const i = cellOf(F, o.center[0], o.center[1]); const r = rooms.find(R => !used.has(R.l) && R.set.has(i)) || rooms.filter(R => !used.has(R.l)).sort((a, b) => Math.hypot(a.center[0] - o.center[0], a.center[1] - o.center[1]) - Math.hypot(b.center[0] - o.center[0], b.center[1] - o.center[1]))[0];
    if (r && Math.hypot(r.center[0] - o.center[0], r.center[1] - o.center[1]) < 2500) { used.add(r.l); keep[r.l] = o.id; } });
  const fn = fi + 1; let next = Math.max(0, ...old.map(o => Number(String(o.id).split('-').pop()) || 0)) + 1;
  const cx0 = rooms.reduce((t, r) => t + r.center[0], 0) / Math.max(1, rooms.length), cy0 = rooms.reduce((t, r) => t + r.center[1], 0) / Math.max(1, rooms.length);
  const out = rooms.sort((a, b) => a.center[1] - b.center[1] || a.center[0] - b.center[0]).map(r => {
    const id = keep[r.l] || `${d.key}-${fn}-${next++}`;
    const top = r.monsters.slice(0, 2).map(m => m.name), ang = Math.atan2(r.center[1] - cy0, r.center[0] - cx0), compass = COMPASS[((Math.round(ang / (Math.PI / 4)) % 8) + 8) % 8];
    const name = (r.boss ? r.boss + ' area: ' : '') + (top.length ? top.join(' / ') + ' room' : `empty ${compass} room`);
    const rad = Math.round(Math.max(...r.poly.map(p => Math.hypot(p[0] - r.center[0], p[1] - r.center[1]))));
    const aggr = r.monsters.filter(m => m.aggressive).map(m => m.name);
    return { id, name, side: compass, compass, center: r.center, radius: rad, levelRange: r.levelRange, suitsPartyLevel: r.levelRange ? [r.levelRange[1] - 2, r.levelRange[0] + 3] : null,
      spawnCount: r.spawnCount, monsters: r.monsters, poly: r.poly, zRange: r.zRange, notes: aggr.length ? 'aggressive: ' + aggr.join(', ') : 'no monsters spawn here (a passage / empty room)',
      polyInfo: { method: `geodata rooms (cave_rooms.js, clearance >= ${T} cells, ${r.cells} cells)`, quality: 'exact' } };
  });
  // hand-edited rooms stay
  old.filter(o => MG.isManual && MG.isManual(o)).forEach(o => out.push(o));
  report.push({ floor: Fl.name, band, cells: F.cells, rooms: out.length, keptIds: Object.values(keep), withMonsters: out.filter(r => r.spawnCount).length, empty: out.filter(r => !r.spawnCount).length, spawnsPlaced: rooms.reduce((t, r) => t + r.spawnCount, 0), spawnsInBand: inBand.reduce((t, s) => t + (s.count || 1), 0) });
  newFloors.push(Object.assign({}, Fl, { rooms: out }));
});
console.log(JSON.stringify(report, null, 1));
fs.writeFileSync(path.join(ROOT, 'docs', 'plan', 'augment_src', `..`, `cave_rooms_${ONLY}.json`), JSON.stringify(newFloors.map(f => ({ name: f.name, rooms: f.rooms.map(r => ({ id: r.id, name: r.name, center: r.center, poly: r.poly, spawnCount: r.spawnCount })) }))));
if (!DRY) {
  const D2 = rd(file), i = D2.findIndex(x => x.key === ONLY);
  D2[i] = Object.assign({}, D2[i], { floors: newFloors, roomsBuilt: { by: 'cave_rooms.js', at: new Date().toISOString(), T, MIN } });
  MG.writeGuarded(file, D2);
  console.log('written: ' + file);
}
