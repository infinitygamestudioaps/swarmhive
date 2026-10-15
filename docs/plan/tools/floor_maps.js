// FLOOR MAPS (owner 2026-10-14: "multiple maps don't have the map" — Catacomb of the Heretic / Apostate / Forbidden Path, Tower of Insolence,
// Giant's Cave, Pagan Temple, Crypts of Disgrace have no map art in Maps\high). Draws every dungeon floor of Scripts/data/dungeon_rooms.json from
// the L2J geodata: ground walkable at the floor's height = stone (lighter = higher), cells next to a wall / a drop = dark wall line, the rest
// transparent. Output: Dashboard/floormaps/<key>_<floor>.png + Dashboard/floormaps/index.json { "<dungeon name>": { "<floor index>": { f, x, y, w, h } } }
// (world units, top-left corner). The dashboard (mapfloors.js plainLayer) puts the picture under the room outlines on a floor without map art.
// Use: node docs/plan/tools/floor_maps.js [--only <dungeon words>]      (no dependencies: PNG written with zlib)
'use strict';
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const GP = require('./geopath');
const ROOT = path.join(__dirname, '..', '..', '..');
const OUT = path.join(ROOT, 'Dashboard', 'icons', 'floormaps');   // served by the existing /icons/ route (no server restart needed)
const PAD = 900, MAXCELLS = 2600;                // world margin around the rooms; a floor wider than 2600 cells (41.6k) is clipped

function crcTable() { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; }
const CRC = crcTable();
function crc32(buf) { let c = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, 'ascii'), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, c]); }
function png(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 6; ih[10] = 0; ih[11] = 0; ih[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
/** one floor -> { w, h, rgba, x, y, cells } ; z = [lo, hi] */
function drawFloor(box, z, opts) {
  const roofOnly = !!(opts && opts.roofOnly);                           // CAVES (2026-10-14): only ground with a layer ABOVE it (the cave, not the sea floor around it)
  const gx0 = GP.toGeoX(box[0]), gy0 = GP.toGeoY(box[1]);
  const W = Math.min(MAXCELLS, GP.toGeoX(box[2]) - gx0 + 1), H = Math.min(MAXCELLS, GP.toGeoY(box[3]) - gy0 + 1);
  const lo = z[0] - 64, hi = z[1] + 64;
  const hgt = new Float32Array(W * H).fill(NaN), nswe = new Uint8Array(W * H);
  let cells = 0, hmin = 1e9, hmax = -1e9;
  for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) {
    const ls = GP.layers(gx0 + x, gy0 + y); if (!ls) continue;
    let best = null; ls.forEach((l, li) => { if (roofOnly && li === 0) return; if (l.h >= lo && l.h <= hi && (!best || l.h > best.h)) best = l; });
    if (!best) continue;
    const i = y * W + x; hgt[i] = best.h; nswe[i] = best.nswe; cells++;
    if (best.h < hmin) hmin = best.h; if (best.h > hmax) hmax = best.h;
  }
  const rgba = Buffer.alloc(W * H * 4), span = Math.max(1, hmax - hmin);
  const walk = (x, y) => x >= 0 && y >= 0 && x < W && y < H && !isNaN(hgt[y * W + x]);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, o = i * 4;
    if (walk(x, y)) {
      const edge = nswe[i] !== 15 || !walk(x + 1, y) || !walk(x - 1, y) || !walk(x, y + 1) || !walk(x, y - 1);
      if (edge) { rgba[o] = 46; rgba[o + 1] = 42; rgba[o + 2] = 36; rgba[o + 3] = 255; continue; }
      const t = (hgt[i] - hmin) / span, n = ((x * 7 + y * 13) % 5) - 2;        // relief + a little stone grain
      const v = Math.round(92 + t * 46 + n * 2);
      rgba[o] = v; rgba[o + 1] = Math.round(v * 0.95); rgba[o + 2] = Math.round(v * 0.86); rgba[o + 3] = 255;
    } else if (walk(x + 1, y) || walk(x - 1, y) || walk(x, y + 1) || walk(x, y - 1)) {
      rgba[o] = 22; rgba[o + 1] = 20; rgba[o + 2] = 17; rgba[o + 3] = 255;   // the wall itself
    }
  }
  return { w: W, h: H, rgba, x: GP.toWorldX(gx0) - 8, y: GP.toWorldY(gy0) - 8, cells };
}
function main() {
  const oi = process.argv.indexOf('--only'), only = oi > 0 ? String(process.argv[oi + 1] || '').toLowerCase() : '';
  const D = JSON.parse(fs.readFileSync(path.join(ROOT, 'Scripts', 'data', 'dungeon_rooms.json'), 'utf8').replace(/^﻿/, ''));
  fs.mkdirSync(OUT, { recursive: true });
  const idxFile = path.join(OUT, 'index.json');
  let idx = {}; try { idx = JSON.parse(fs.readFileSync(idxFile, 'utf8')); } catch (e) { }
  let n = 0;
  D.forEach(d => {
    if (only && !String(d.name).toLowerCase().includes(only)) return;
    (d.floors || []).forEach((F, fi) => {
      if (!Array.isArray(F.z) || F.z.length < 2) return;
      const rs = (F.rooms || []).filter(r => Array.isArray(r.center));
      if (!rs.length) return;
      const pts = [];
      rs.forEach(r => { const R = (Number(r.radius) || 600) + PAD; pts.push([r.center[0] - R, r.center[1] - R], [r.center[0] + R, r.center[1] + R]); (r.poly || []).forEach(p => pts.push([p[0] - PAD, p[1] - PAD], [p[0] + PAD, p[1] + PAD])); });
      const box = [Math.min(...pts.map(p => p[0])), Math.min(...pts.map(p => p[1])), Math.max(...pts.map(p => p[0])), Math.max(...pts.map(p => p[1]))];
      const t0 = Date.now(), m = drawFloor(box, F.z, { roofOnly: !!d.cave });
      if (!m.cells) { console.log(`${d.name} floor ${fi}: no geodata cells at z ${F.z.join('..')} - skipped`); return; }
      const key = String(d.key || d.idPrefix || d.name).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
      const f = `${key}_${fi}.png`;
      fs.writeFileSync(path.join(OUT, f), png(m.w, m.h, m.rgba));
      (idx[d.name] = idx[d.name] || {})[fi] = { f, x: m.x, y: m.y, w: m.w * 16, h: m.h * 16, v: Date.now() };   // v: cache stamp (the /icons/ route is cached for a year)
      n++; console.log(`${d.name} floor ${fi} (${F.name || ''}): ${m.w}x${m.h} cells, ${m.cells} walkable, ${Date.now() - t0} ms -> ${f}`);
    });
  });
  fs.writeFileSync(idxFile, JSON.stringify(idx, null, 1));
  console.log(`${n} floor maps written to ${OUT}`);
}
if (require.main === module) main();
module.exports = { drawFloor, png };
