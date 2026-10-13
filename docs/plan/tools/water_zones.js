// WATER ZONES (user 2026-10-13: "the way to Tillion goes through the Pirate Tunnel and several WATER areas where the character swims").
// L2J High Five: a character inside a WaterZone (cuboid x/y box, minZ <= z <= maxZ) SWIMS, and the server does NOT check geodata for a
// swimming character's moves (L2Character.moveToLocation: "swimming also not checked unless in siege zone"; each move is capped at 700
// units; z follows the destination). So under water every geodata wall / cliff / NSWE flag is irrelevant: a swimmer moves freely in 3D
// inside the zone and can climb out onto any shore cell it reaches. The path finders (geopath.js, geopath_fast.js) use this module to add
// SWIM edges between water cells (cost x swimCost: swimming is ~3x slower than running) and shore edges out of the water.
//
// Data: Scripts/data/water_zones.json, made from the L2J datapack data/zones/water.xml (raw copy: Scripts/data/dp/zones/water.xml,
// github.com/Shagooh/l2j-server-datapack) by  node docs/plan/tools/water_zones.js --build
//
//   require('./water_zones') -> { zonesAt(x, y), zoneAt(x, y, z), cellWater(x, y, heights), swimZ(zone, floorH), SWIM, ... }
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const FILE = process.env.WATER_ZONES || path.join(ROOT, 'Scripts', 'data', 'water_zones.json');
const XML = path.join(ROOT, 'Scripts', 'data', 'dp', 'zones', 'water.xml');

// swim rules (shared by both path finders, the walker hints and the tests)
const SWIM = {
  cost: 3.5,          // a swim cell costs 3.5 run cells (H5 swim speed 50 vs run 115 = x2.3 slower; the extra weight keeps swims short: breath lasts ~60 s)
  maxLeg: 650,        // the server cuts every move inside water to 700 units: keep swim legs below that
  climb: 96,          // a swimmer can climb out onto a shore cell at most this far above the water surface
  surfaceGap: 40,     // swim this far below the surface (stays inside the zone's maxZ)
  floorGap: 60,       // ... but never closer than this to the floor below
  ceiling: 150,       // a cell counts as open water when no other floor lies between its water floor and surface + this
  roofSpan: 250,      // under a roof (flooded tunnel, jetty) a swimmer stays within this above the floor (the rock above is not in the geodata)
  slotTol: 64,        // two swim height ranges in neighbour cells must meet within this
  maxDry: 6,          // a straight swim move may cross at most this many low shore cells in a row (a sand bar), never an island
};

function parseXml(xml) {
  const out = [], re = /<zone([^>]*)>([\s\S]*?)<\/zone>/g; let m;
  while ((m = re.exec(xml))) {
    const at = (k) => { const r = new RegExp(k + '="([^"]*)"').exec(m[1]); return r ? r[1] : null; };
    if (at('type') !== 'WaterZone') continue;
    const nodes = [...m[2].matchAll(/X="(-?\d+)"\s+Y="(-?\d+)"/g)].map(q => [+q[1], +q[2]]);
    const shape = at('shape');
    if (!nodes.length) continue;
    const z = { name: at('name'), shape, minZ: +at('minZ'), maxZ: +at('maxZ') };
    if (shape === 'Cuboid') { const xs = nodes.map(n => n[0]), ys = nodes.map(n => n[1]); Object.assign(z, { x1: Math.min(...xs), x2: Math.max(...xs), y1: Math.min(...ys), y2: Math.max(...ys) }); }
    else { z.poly = nodes; const xs = nodes.map(n => n[0]), ys = nodes.map(n => n[1]); Object.assign(z, { x1: Math.min(...xs), x2: Math.max(...xs), y1: Math.min(...ys), y2: Math.max(...ys) }); }
    out.push(z);
  }
  return out;
}
function inPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (((yi > y) !== (yj > y)) && x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-9) + xi) inside = !inside;
  }
  return inside;
}

let ZONES = null; const BUCKET = new Map();          // 16384-unit buckets -> zones overlapping it
const bk = (x, y) => (Math.floor(x / 16384) + 64) * 1024 + (Math.floor(y / 16384) + 64);
function load() {
  if (ZONES) return ZONES;
  ZONES = [];
  try { ZONES = JSON.parse(fs.readFileSync(FILE, 'utf8').replace(/^﻿/, '')).zones || []; }
  catch (e) { try { ZONES = parseXml(fs.readFileSync(XML, 'utf8')); } catch (e2) { ZONES = []; } }
  for (const z of ZONES) for (let bx = Math.floor(z.x1 / 16384); bx <= Math.floor(z.x2 / 16384); bx++) for (let by = Math.floor(z.y1 / 16384); by <= Math.floor(z.y2 / 16384); by++) {
    const k = (bx + 64) * 1024 + (by + 64); (BUCKET.get(k) || BUCKET.set(k, []).get(k)).push(z);
  }
  return ZONES;
}
/** every water zone whose x/y box contains (x,y) */
function zonesAt(x, y) {
  load(); const b = BUCKET.get(bk(x, y)); if (!b) return [];
  return b.filter(z => x >= z.x1 && x <= z.x2 && y >= z.y1 && y <= z.y2 && (!z.poly || inPoly(x, y, z.poly)));
}
/** the water zone a character standing at (x,y,z) is in (the server's zone check), or null */
function zoneAt(x, y, z) { return zonesAt(x, y).find(w => z >= w.minZ && z <= w.maxZ) || null; }
/**
 * The WATER SLOTS of a geodata cell at (x,y) with floors `hs` (heights, any order): every floor a character standing on would be inside a
 * water zone (minZ <= h < maxZ), plus a floor below minZ with open water above it (deep sea). For each: the height RANGE a swimmer over
 * that floor can be in: open water (no other floor between it and surface + SWIM.ceiling) = floor + floorGap .. surface - surfaceGap;
 * roofed (a flooded tunnel / under a jetty: another floor above it) = floor + floorGap .. min(next floor - 30, floor + roofSpan).
 * Returns [{ li, h, lo, hi, z, open, zone }] (z = the swim height used for waypoints) or null. Layered columns (the Pirate Tunnel below the
 * sea floor) give several slots: a swimmer only moves between slots whose ranges meet (never through the rock between a tunnel and the sea).
 */
function cellWater(x, y, hs) {
  const zs = zonesAt(x, y); if (!zs.length || !hs || !hs.length) return null;
  let out = null;
  for (let i = 0; i < hs.length; i++) {
    const h = hs[i];
    for (const w of zs) {
      if (h >= w.maxZ - 2) continue;                                  // standing there = above the zone: dry
      let above = Infinity;
      for (let k = 0; k < hs.length; k++) if (k !== i && hs[k] > h && hs[k] < above) above = hs[k];
      const open = !(above <= w.maxZ + SWIM.ceiling);
      // ONLY OPEN WATER is swum: a floor under another floor (a tunnel / cave below sea level, under a jetty) may be dry in the game even
      // where the zone box covers it (the Pirate Tunnel at -4600 lies inside the -4780..-3780 box and is walked); it keeps the plain geodata
      // walk rules (which the server allows in either case), and a walker reaches open water from there by stepping / dropping in
      if (!open) continue;
      if (h < w.minZ && !open) continue;                               // a dry floor below the zone (a dungeon under the sea floor)
      let lo = Math.max(h + SWIM.floorGap, w.minZ + 8), hi;
      if (open) hi = w.maxZ - SWIM.surfaceGap;
      else hi = Math.min(above - 30, h + SWIM.roofSpan, w.maxZ - 8);
      if (hi < lo) { const mid = Math.round(Math.min(w.maxZ - 8, Math.max(w.minZ + 8, (h + Math.min(w.maxZ, above)) / 2))); lo = hi = Math.max(mid, h + 8); if (lo > w.maxZ - 8) continue; }
      (out = out || []).push({ li: i, h, lo, hi, z: Math.round(open ? hi : lo), open, zone: w });
      break;
    }
  }
  return out;
}
/** the height a swimmer keeps over a water floor (open water): just under the surface, never into the floor, always inside the zone */
function swimZ(w, floorH) {
  let z = w.maxZ - SWIM.surfaceGap;
  if (z < floorH + SWIM.floorGap) z = Math.min(w.maxZ - 8, floorH + SWIM.floorGap);
  if (z < w.minZ + 8) z = w.minZ + 8;
  return Math.round(z);
}
/** can a swimmer go from slot a to slot b in the next cell? (their height ranges meet, give or take SWIM.slotTol) */
const slotsMeet = (a, b) => a.lo - SWIM.slotTol <= b.hi && b.lo - SWIM.slotTol <= a.hi;

/**
 * The swim moves for one path search, on any geodata accessor (geopath.js objects or geopath_fast.js typed arrays):
 *   acc = { heights(gx, gy) -> [h, ...] | null, nswe(gx, gy, li) -> NSWE bits, toWorldX(gx), toWorldY(gy) }
 * Returns {
 *   info(gx, gy)              -> the cell's water slots (cached for this search) | null
 *   slotOf(gx, gy, li)        -> the slot of that node | null;  swimming(gx, gy, li) -> !!slotOf (a swimmer: the server skips geodata)
 *   swimMoves(gx, gy, li, dx, dy) -> [{ nl, swim }]  a SWIMMER's moves: into every slot of the next cell its height range meets
 *                                   (swim: true; diagonals only when both side cells have such a slot: no corner cutting past rock),
 *                                   or out onto a floor of a cell without water at most SWIM.climb above its range (straight moves only)
 *   dropIn(gx, gy, li, dx, dy)   -> nl | -1   a walker steps off a floor (NSWE open that way) into water next to it: the floor lies at most
 *                                             64 below / 400 above the swim range (a beach, a jetty, a flooded tunnel floor further down)
 *   clear(a, b, blocked)         -> a swimmer's straight move from node a to cell b ([gx, gy, li]): every cell on the line has a slot
 *                                   meeting the previous one, b is that slot or a shore floor (the server: no geodata check, <= 700 a move)
 * }
 */
function swimGraph(acc) {
  const cache = new Map();
  const info = (gx, gy) => {
    const ck = gx * 32768 + gy; let v = cache.get(ck);
    if (v === undefined) { const hs = acc.heights(gx, gy); v = hs && hs.length ? cellWater(acc.toWorldX(gx), acc.toWorldY(gy), hs) : null; cache.set(ck, v); }
    return v;
  };
  const slotOf = (gx, gy, li) => { const s = info(gx, gy); if (!s) return null; for (const o of s) if (o.li === li) return o; return null; };
  const swimming = (gx, gy, li) => !!slotOf(gx, gy, li);
  const BIT = (dx, dy) => dx === 1 ? 1 : dx === -1 ? 2 : dy === 1 ? 4 : 8;
  const meetsAny = (gx, gy, a) => { const s = info(gx, gy); return !!s && s.some(o => slotsMeet(a, o)); };
  /** a floor of cell (gx,gy) a swimmer in slot a can climb out onto: not part of a slot, walkable, within [a.lo - 200, a.hi + climb] */
  function shoreOf(gx, gy, a, wantLi) {
    const hs = acc.heights(gx, gy); if (!hs) return -1;
    const s = info(gx, gy);
    let best = -1, bd = 1e9;
    for (let i = 0; i < hs.length; i++) {
      if (wantLi !== undefined && i !== wantLi) continue;
      if (s && s.some(o => o.li === i)) continue;
      if (hs[i] > a.hi + SWIM.climb || hs[i] < a.lo - 200) continue;
      if (acc.nswe(gx, gy, i) === 0) continue;
      const d = Math.abs(hs[i] - a.z); if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  function swimMoves(gx, gy, li, dx, dy) {
    const a = slotOf(gx, gy, li); if (!a) return [];
    const out = [], ns = info(gx + dx, gy + dy);
    if (ns) for (const b of ns) {
      if (!slotsMeet(a, b)) continue;
      if (dx && dy && !(meetsAny(gx + dx, gy, a) && meetsAny(gx, gy + dy, a))) continue;
      out.push({ nl: b.li, swim: true });
    }
    if (!dx || !dy) { const sh = shoreOf(gx + dx, gy + dy, a); if (sh >= 0) out.push({ nl: sh, swim: false }); }
    return out;
  }
  function dropIn(gx, gy, li, dx, dy) {
    if (dx && dy) return -1;
    const ns = info(gx + dx, gy + dy); if (!ns) return -1;
    const hs = acc.heights(gx, gy); if (!hs || li >= hs.length) return -1;
    if (!(acc.nswe(gx, gy, li) & BIT(dx, dy))) return -1;
    const h = hs[li];
    let best = -1, bd = 1e9;
    for (const b of ns) { if (h < b.lo - 64 - SWIM.floorGap || h > b.hi + 400) continue; const d = Math.abs(h - b.z); if (d < bd) { bd = d; best = b.li; } }
    return best;
  }
  function clear(a, b, blocked) {
    let cur = slotOf(a[0], a[1], a[2]), dryRun = 0; if (!cur) return false;
    let [x, y] = a; const [x2, y2] = b;
    const dx = Math.abs(x2 - x), dy = Math.abs(y2 - y), sx = x < x2 ? 1 : -1, sy = y < y2 ? 1 : -1;
    let err = dx - dy;
    while (x !== x2 || y !== y2) {
      const e2 = 2 * err; let mx = 0, my = 0;
      if (e2 > -dy) { err -= dy; mx = sx; }
      if (e2 < dx) { err += dx; my = sy; }
      const last = x + mx === x2 && y + my === y2;
      if (mx && my && !(meetsAny(x + mx, y, cur) && meetsAny(x, y + my, cur))) return false;
      x += mx; y += my;
      if (blocked && blocked(x, y)) return false;
      const ns = info(x, y);
      let next = null, bd = 1e9;
      if (ns) for (const o of ns) { if (!slotsMeet(cur, o) || (last && o.li !== b[2])) continue; const d = Math.abs(o.z - cur.z); if (d < bd) { bd = d; next = o; } }
      if (!next) {
        if (last) return !!((!mx || !my) && shoreOf(x, y, cur, b[2]) >= 0);   // the end cell may be the shore (a straight step out)
        if (shoreOf(x, y, cur) < 0 || ++dryRun > SWIM.maxDry) return false;   // a low sand bar / shallow edge on the way: the server does not check it
        continue;
      }
      dryRun = 0; cur = next;
    }
    return true;
  }
  return { info, slotOf, swimming, swimMoves, dropIn, clear };
}

module.exports = { SWIM, load, zonesAt, zoneAt, cellWater, swimZ, slotsMeet, swimGraph, parseXml, FILE };

if (require.main === module) {
  if (process.argv.includes('--build')) {
    const zones = parseXml(fs.readFileSync(XML, 'utf8'));
    const out = { generated: new Date().toISOString(), source: 'L2J datapack data/zones/water.xml (github.com/Shagooh/l2j-server-datapack, raw copy Scripts/data/dp/zones/water.xml)',
      note: 'type WaterZone only; a character inside a zone box (x1..x2, y1..y2, minZ..maxZ) swims and the server skips geodata checks for its moves (700 units per move). Used by docs/plan/tools/water_zones.js',
      count: zones.length, zones };
    const tmp = FILE + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(out, null, 0).replace(/\},\{/g, '},\n{')); fs.renameSync(tmp, FILE);
    console.log(`water_zones.json: ${zones.length} water zones`);
  } else {
    const a = process.argv.slice(2).map(Number);
    if (a.length >= 2) console.log(JSON.stringify({ zones: zonesAt(a[0], a[1]), inside: a.length >= 3 ? zoneAt(a[0], a[1], a[2]) : undefined }, null, 1));
    else console.log('usage: node water_zones.js --build | x y [z]');
  }
}
