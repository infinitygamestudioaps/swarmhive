// Crop L2UI_CT1/Icon_DF_MenuWnd_*.png (64x64 sprite sheets; the normal-state icon sits in the top-left ~36x36) to the
// visible icon, so the dashboard menu shows it at full size. Output: Dashboard/icons/L2UI_CT1/crop/<same name>.png
// (user 2026-10-08 22:55: "the icons are very small for some of the menu items"). Run: node docs/plan/tools/crop_menu_icons.js
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const dir = path.join(__dirname, '..', '..', '..', 'Dashboard', 'icons', 'L2UI_CT1'), out = path.join(dir, 'crop');
fs.mkdirSync(out, { recursive: true });

function decode(buf) {
  let p = 8, w, h, ct, bd, idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), t = buf.toString('ascii', p + 4, p + 8);
    if (t === 'IHDR') { w = buf.readUInt32BE(p + 8); h = buf.readUInt32BE(p + 12); bd = buf[p + 16]; ct = buf[p + 17]; }
    if (t === 'IDAT') idat.push(buf.slice(p + 8, p + 8 + len));
    p += 12 + len;
  }
  if (ct !== 6 || bd !== 8) return null;                          // only 8-bit RGBA
  const raw = zlib.inflateSync(Buffer.concat(idat)), bpp = 4, st = w * bpp, px = Buffer.alloc(h * st);
  let prev = Buffer.alloc(st);
  for (let y = 0; y < h; y++) {
    const ft = raw[y * (st + 1)], line = raw.slice(y * (st + 1) + 1, (y + 1) * (st + 1)), cur = Buffer.alloc(st);
    for (let x = 0; x < st; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0, u = prev[x], c = x >= bpp ? prev[x - bpp] : 0;
      let v = line[x];
      if (ft === 1) v += a; else if (ft === 2) v += u; else if (ft === 3) v += Math.floor((a + u) / 2);
      else if (ft === 4) { const q = a + u - c, pa = Math.abs(q - a), pb = Math.abs(q - u), pc = Math.abs(q - c); v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? u : c); }
      cur[x] = v & 255;
    }
    cur.copy(px, y * st); prev = cur;
  }
  return { w, h, px };
}
const crcTable = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]), c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
}
function encode(w, h, px) {
  const st = w * 4, raw = Buffer.alloc(h * (st + 1));
  for (let y = 0; y < h; y++) { raw[y * (st + 1)] = 0; px.copy(raw, y * (st + 1) + 1, y * st, (y + 1) * st); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

let n = 0;
for (const f of fs.readdirSync(dir).filter(f => /^Icon_DF_MenuWnd_.*\.png$/i.test(f))) {
  const img = decode(fs.readFileSync(path.join(dir, f)));
  if (!img) { console.log('skip (not RGBA8)', f); continue; }
  // visible box inside the top-left quadrant (the normal state); square, at least 32
  const q = Math.min(img.w, img.h) / 2 + 8; let x0 = q, y0 = q, x1 = 0, y1 = 0;
  for (let y = 0; y < q; y++) for (let x = 0; x < q; x++) if (img.px[(y * img.w + x) * 4 + 3] > 40) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  if (x1 < x0) { console.log('empty', f); continue; }
  const s = Math.max(x1 - x0 + 1, y1 - y0 + 1), ox = x0, oy = y0, cp = Buffer.alloc(s * s * 4);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const sx = ox + x, sy = oy + y; if (sx >= img.w || sy >= img.h) continue;
    img.px.copy(cp, (y * s + x) * 4, (sy * img.w + sx) * 4, (sy * img.w + sx) * 4 + 4);
  }
  fs.writeFileSync(path.join(out, f), encode(s, s, cp)); n++;
}
console.log('cropped', n, 'icons ->', out);
