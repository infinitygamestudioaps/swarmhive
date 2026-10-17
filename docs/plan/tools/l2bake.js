// L2BAKE (owner 2026-10-17: "cache it all and make it load instant without using too much memory ... 1-2 draw calls"): every 8192-unit map tile
// is baked ONCE into one merged model + one texture atlas, from the building pieces UE Viewer exported from the player's own client
// (Dashboard/l2cache). Output (Dashboard/l2cache/baked/<rx>_<ry>_<c>_<r>.bin + .png, never shipped):
//   .bin = header { magic 'L2BK', version 1, vertexCount, indexCount, originX, originY } then
//          positions Float32 x3 (scene axes: x, height, y; relative to originX / originY), uv Float32 x2 (the texture's own repeating uv),
//          rect Uint16 x4 per vertex (atlas cell x, y, w, h in pixels: the shader repeats the uv inside it), indices Uint32
//   .png = the atlas (every texture used by the tile, downscaled to <= 128 px, packed in rows)
// The 3D view draws a tile with ONE mesh and ONE material.
'use strict';
const fs = require('fs'), path = require('path'), zlib = require('zlib');

// ---- PNG (8-bit RGB / RGBA / gray / palette, non-interlaced: what UE Viewer writes) ----
function pngDecode(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a png');
  let o = 8, w = 0, h = 0, depth = 0, ctype = 0, inter = 0; const idat = []; let pal = null, trns = null;
  while (o < buf.length) {
    const len = buf.readUInt32BE(o), type = buf.toString('latin1', o + 4, o + 8), data = buf.slice(o + 8, o + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; ctype = data[9]; inter = data[12]; }
    else if (type === 'PLTE') pal = data; else if (type === 'tRNS') trns = data; else if (type === 'IDAT') idat.push(data); else if (type === 'IEND') break;
    o += 12 + len;
  }
  if (depth !== 8 || inter) throw new Error('png: only 8-bit, non-interlaced');
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ctype]; if (!ch) throw new Error('png colour type ' + ctype);
  const raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * ch, out = Buffer.alloc(w * h * 4), cur = Buffer.alloc(stride), prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], row = raw.slice(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? cur[i - ch] : 0, b = prev[i], c = i >= ch ? prev[i - ch] : 0; let v = row[i];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      cur[i] = v & 255;
    }
    for (let x = 0; x < w; x++) {
      const d = (y * w + x) * 4, s = x * ch;
      if (ctype === 6) { out[d] = cur[s]; out[d + 1] = cur[s + 1]; out[d + 2] = cur[s + 2]; out[d + 3] = cur[s + 3]; }
      else if (ctype === 2) { out[d] = cur[s]; out[d + 1] = cur[s + 1]; out[d + 2] = cur[s + 2]; out[d + 3] = 255; }
      else if (ctype === 0) { out[d] = out[d + 1] = out[d + 2] = cur[s]; out[d + 3] = 255; }
      else if (ctype === 4) { out[d] = out[d + 1] = out[d + 2] = cur[s]; out[d + 3] = cur[s + 1]; }
      else { const k = cur[s]; out[d] = pal[k * 3]; out[d + 1] = pal[k * 3 + 1]; out[d + 2] = pal[k * 3 + 2]; out[d + 3] = trns && k < trns.length ? trns[k] : 255; }
    }
    cur.copy(prev);
  }
  return { w, h, rgba: out };
}
const CRC = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
function crc32(b) { let c = -1; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; }
function pngEncode(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  const chunk = (type, data) => { const l = Buffer.alloc(4); l.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, 'latin1'), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0))]);
}
/** nearest-neighbour downscale to fit max px */
function shrink(img, max) {
  if (img.w <= max && img.h <= max) return img;
  const s = Math.max(img.w, img.h) / max, w = Math.max(1, Math.round(img.w / s)), h = Math.max(1, Math.round(img.h / s)), out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const sx = Math.min(img.w - 1, Math.floor(x * s)), sy = Math.min(img.h - 1, Math.floor(y * s)); img.rgba.copy(out, (y * w + x) * 4, (sy * img.w + sx) * 4, (sy * img.w + sx) * 4 + 4); }
  return { w, h, rgba: out };
}

// ---- ActorX .pskx (same chunk format as the browser loader) ----
function readPsk(buf) {
  const out = {}; let o = 0;
  while (o + 32 <= buf.length) { const id = buf.toString('latin1', o, o + 20).replace(/\0.*$/, ''), size = buf.readInt32LE(o + 24), count = buf.readInt32LE(o + 28); out[id] = { off: o + 32, size, count }; o += 32 + size * count; }
  const P = out.PNTS0000, W = out.VTXW0000, F = out.FACE0000 || out.FACE3200, M = out.MATT0000;
  if (!P || !W || !F) throw new Error('bad pskx');
  const pts = new Float32Array(P.count * 3); for (let i = 0; i < P.count; i++) { const q = P.off + i * P.size; pts[i * 3] = buf.readFloatLE(q); pts[i * 3 + 1] = buf.readFloatLE(q + 4); pts[i * 3 + 2] = buf.readFloatLE(q + 8); }
  const big = P.count > 65536, wp = new Uint32Array(W.count), wu = new Float32Array(W.count * 2), wm = new Uint8Array(W.count);
  for (let i = 0; i < W.count; i++) { const q = W.off + i * W.size; wp[i] = big ? buf.readUInt32LE(q) : buf.readUInt16LE(q); wu[i * 2] = buf.readFloatLE(q + 4); wu[i * 2 + 1] = buf.readFloatLE(q + 8); wm[i] = buf[q + 12]; }
  const f32 = F.size >= 18, faces = new Uint32Array(F.count * 3), fm = new Uint8Array(F.count);
  for (let i = 0; i < F.count; i++) { const q = F.off + i * F.size; faces[i * 3] = f32 ? buf.readUInt32LE(q) : buf.readUInt16LE(q); faces[i * 3 + 1] = f32 ? buf.readUInt32LE(q + 4) : buf.readUInt16LE(q + 2); faces[i * 3 + 2] = f32 ? buf.readUInt32LE(q + 8) : buf.readUInt16LE(q + 4); fm[i] = buf[q + (f32 ? 12 : 6)]; }
  const mats = []; if (M) for (let i = 0; i < M.count; i++) mats.push(buf.toString('latin1', M.off + i * M.size, M.off + i * M.size + 64).replace(/\0.*$/, ''));
  return { pts, wp, wu, wm, faces, fm, mats };
}
/** Unreal placement [mesh, x, y, z, pitch, yaw, roll, sx, sy, sz] -> 3x4 matrix that takes a mesh point (Unreal axes) to scene axes (x, height, y) */
function placeMat(a) {
  const U = Math.PI * 2 / 65536, P = a[4] * U, Y = a[5] * U, R = a[6] * U;
  const SP = Math.sin(P), CP = Math.cos(P), SY = Math.sin(Y), CY = Math.cos(Y), SR = Math.sin(R), CR = Math.cos(R);
  const X = [CP * CY * a[7], CP * SY * a[7], SP * a[7]], Yv = [(SR * SP * CY - CR * SY) * a[8], (SR * SP * SY + CR * CY) * a[8], -SR * CP * a[8]], Z = [-(CR * SP * CY + SR * SY) * a[9], (CY * SR - CR * SP * SY) * a[9], CR * CP * a[9]];
  // world (Unreal) = px*X + py*Y + pz*Z + loc ; scene = (wx, wz, wy)
  return (px, py, pz) => [px * X[0] + py * Yv[0] + pz * Z[0] + a[1], px * X[2] + py * Yv[2] + pz * Z[2] + a[3], px * X[1] + py * Yv[1] + pz * Z[1] + a[2]];
}
/**
 * bake one tile. rows = placements inside it; meshFile(mesh) -> .pskx path | null; texFile(name) -> .png path | null
 * returns { bin: Buffer, png: Buffer, stats }
 */
function bakeTile(rows, meshFile, texFile, originX, originY, opts = {}) {
  const maxTex = opts.maxTex || 128, atlasW = opts.atlasW || 2048;
  const meshCache = new Map(), texCells = new Map(), texList = [];
  const cellOf = (name) => {
    const k = String(name || '').toLowerCase(); if (texCells.has(k)) return texCells.get(k);
    let img = null; const f = texFile(k); if (f) { try { img = shrink(pngDecode(fs.readFileSync(f)), maxTex); } catch (e) { img = null; } }
    if (!img) img = { w: 4, h: 4, rgba: Buffer.alloc(64, 150) };
    const cell = { img, x: 0, y: 0, cut: /tree|leaf|leav|grass|bush|branch|plant|flower|fence|ivy|vine|fern|weed|net|web|chain|rope|grill|grate|bars/i.test(k) }; texCells.set(k, cell); texList.push(cell); return cell;
  };
  const pos = [], uv = [], rect = [], idx = []; let vbase = 0;
  for (const a of rows) {
    let m = meshCache.get(a[0]);
    if (m === undefined) { const f = meshFile(a[0]); try { m = f ? readPsk(fs.readFileSync(f)) : null; } catch (e) { m = null; } meshCache.set(a[0], m); }
    if (!m) continue;
    const T = placeMat(a), cells = m.mats.map(cellOf);
    // one vertex per wedge (its own uv + the atlas cell of its material)
    for (let i = 0; i < m.wp.length; i++) {
      const p = m.wp[i], q = T(m.pts[p * 3], m.pts[p * 3 + 1], m.pts[p * 3 + 2]);
      pos.push(q[0] - originX, q[1], q[2] - originY); uv.push(m.wu[i * 2], m.wu[i * 2 + 1]);
      rect.push(cells[m.wm[i]] || cells[0] || cellOf(''));
    }
    // the placement mirrors the axes (Unreal is left-handed): flip the triangle order unless the scale itself mirrors
    const flip = (a[7] * a[8] * a[9]) > 0;
    for (let i = 0; i < m.faces.length; i += 3) { if (flip) idx.push(vbase + m.faces[i], vbase + m.faces[i + 2], vbase + m.faces[i + 1]); else idx.push(vbase + m.faces[i], vbase + m.faces[i + 1], vbase + m.faces[i + 2]); }
    vbase += m.wp.length;
  }
  // pack the atlas in rows (tallest first), 1 px gutter
  texList.sort((p, q) => q.img.h - p.img.h);
  let x = 0, y = 0, rowH = 0;
  texList.forEach(c => { if (x + c.img.w + 2 > atlasW) { x = 0; y += rowH + 2; rowH = 0; } c.x = x + 1; c.y = y + 1; x += c.img.w + 2; rowH = Math.max(rowH, c.img.h); });
  const atlasH = Math.max(4, 1 << Math.ceil(Math.log2(y + rowH + 2)));
  const atlas = Buffer.alloc(atlasW * atlasH * 4);
  texList.forEach(c => { for (let r = 0; r < c.img.h; r++) c.img.rgba.copy(atlas, ((c.y + r) * atlasW + c.x) * 4, r * c.img.w * 4, (r + 1) * c.img.w * 4); });
  // binary
  const vc = pos.length / 3, ic = idx.length, head = Buffer.alloc(32);
  head.write('L2BK', 0, 'latin1'); head.writeUInt32LE(1, 4); head.writeUInt32LE(vc, 8); head.writeUInt32LE(ic, 12); head.writeFloatLE(originX, 16); head.writeFloatLE(originY, 20); head.writeUInt32LE(atlasW, 24); head.writeUInt32LE(atlasH, 28);
  const P = Buffer.from(new Float32Array(pos).buffer), UV = Buffer.from(new Float32Array(uv).buffer);
  const RC = new Uint16Array(vc * 4); rect.forEach((c, i) => { RC[i * 4] = c.x; RC[i * 4 + 1] = c.y; RC[i * 4 + 2] = c.img.w; RC[i * 4 + 3] = c.img.h | (c.cut ? 0x8000 : 0); });   // high bit of h = cut-out material (foliage): alpha test only there
  const I = Buffer.from(new Uint32Array(idx).buffer);
  return { bin: Buffer.concat([head, P, UV, Buffer.from(RC.buffer), I]), png: pngEncode(atlasW, atlasH, atlas), stats: { pieces: rows.length, meshes: meshCache.size, textures: texList.length, vertices: vc, triangles: ic / 3, atlas: atlasW + 'x' + atlasH } };
}
module.exports = { bakeTile, pngDecode, pngEncode, readPsk };
