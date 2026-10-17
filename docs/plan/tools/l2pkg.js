// L2PKG (3D view sizes, owner 2026-10-17: "you did not add the right size for the characters or the enemies, Queen Ant / Core / Orfen /
// Antharas / Valakas are HUGE"): the in-game size of a monster is the DrawScale default of its class (System/LineageMonster*.u, LineageNpc*.u),
// which UE Viewer does not read. This reads Unreal 2 packages of the player's own client ("Lineage2Ver111" = every byte XOR 0xAC) far enough
// to find each class's default DrawScale / DrawScale3D (tagged property list).
//   node docs/plan/tools/l2pkg.js scales <file.u> [more.u ...]   -> { className: scale }
'use strict';
const fs = require('fs');
function plain(buf) {
  const head = buf.slice(0, 28).toString('utf16le');
  if (!/^Lineage2Ver/.test(head)) return buf;
  const ver = head.slice(11);
  if (ver !== '111') throw new Error('unsupported package encryption Ver' + ver);
  const out = Buffer.allocUnsafe(buf.length - 28);
  for (let i = 28; i < buf.length; i++) out[i - 28] = buf[i] ^ 0xAC;
  return out;
}
function reader(b, o) {
  const r = { o };
  r.u8 = () => b[r.o++];
  r.u16 = () => { const v = b.readUInt16LE(r.o); r.o += 2; return v; };
  r.u32 = () => { const v = b.readUInt32LE(r.o); r.o += 4; return v; };
  r.i32 = () => { const v = b.readInt32LE(r.o); r.o += 4; return v; };
  r.f32 = () => { const v = b.readFloatLE(r.o); r.o += 4; return v; };
  // Unreal compact index: sign bit 0x80 + 6 bits, then 7 bits per byte while 0x40 / 0x80 is set
  r.ci = () => { let x = b[r.o++]; const neg = x & 0x80; let v = x & 0x3f; if (x & 0x40) { let s = 6; do { x = b[r.o++]; v |= (x & 0x7f) << s; s += 7; } while (x & 0x80); } return neg ? -v : v; };
  return r;
}
/** package -> { names[], exports[{ cls, name, size, off }], imports[{ cls, name }] } */
function parse(buf) {
  const b = plain(buf), r = reader(b, 0);
  if (r.u32() !== 0x9E2A83C1) throw new Error('not an Unreal package');
  const ver = r.u16(); r.u16(); r.u32();
  const nameCount = r.u32(), nameOff = r.u32(), expCount = r.u32(), expOff = r.u32(), impCount = r.u32(), impOff = r.u32();
  const names = []; r.o = nameOff;
  for (let i = 0; i < nameCount; i++) { const n = ver >= 64 ? r.ci() : 0; let s; if (ver >= 64) { s = b.slice(r.o, r.o + n - 1).toString('latin1'); r.o += n; } else { const st = r.o; while (b[r.o]) r.o++; s = b.slice(st, r.o).toString('latin1'); r.o++; } r.u32(); names.push(s); }
  const imports = []; r.o = impOff;
  for (let i = 0; i < impCount; i++) { const pkg = r.ci(), cls = r.ci(), outer = r.i32(); const name = r.ci(); imports.push({ pkg: names[pkg], cls: names[cls], name: names[name], outer }); }
  const exports = []; r.o = expOff;
  for (let i = 0; i < expCount; i++) { const cls = r.ci(), sup = r.ci(), outer = r.i32(), name = r.ci(); r.u32(); const size = r.ci(), off = size > 0 ? r.ci() : 0; exports.push({ cls, sup, outer, name: names[name], size, off }); }
  return { b, ver, names, imports, exports };
}
/** every class export -> its default DrawScale (x DrawScale3D.Z when present) found in the tagged default properties */
function scales(buf) {
  const P = parse(buf), { b, names } = P, out = {};
  const idx = (n) => names.findIndex(x => x.toLowerCase() === n.toLowerCase());
  const iDS = idx('DrawScale'), iDS3 = idx('DrawScale3D'), iNone = idx('None');
  if (iDS < 0 && iDS3 < 0) return out;
  // a class export: its class index is 0 (UClass objects are written with class index 0 in UE2 packages)
  P.exports.forEach(e => {
    if (e.cls !== 0 || !e.size) return;
    const end = e.off + e.size;
    let ds = null, ds3z = null;
    // scan for a property tag "DrawScale" + FloatProperty (info byte: type 4, size code 2 = 4 bytes -> 0x24) + float
    for (let o = e.off; o < end - 6; o++) {
      const r = reader(b, o); const n = r.ci();
      if (n === iDS && iDS >= 0) { const info = b[r.o]; if ((info & 0x0f) === 4) { const v = b.readFloatLE(r.o + 1); if (v > 0.01 && v < 100) { ds = v; } } }
      else if (n === iDS3 && iDS3 >= 0) { const info = b[r.o]; if ((info & 0x0f) === 10) { // struct: name of the struct, then 12 bytes (x, y, z)
          const r2 = reader(b, r.o + 1); r2.ci(); if ((info & 0x70) === 0x50) r2.u8(); const x = b.readFloatLE(r2.o), y = b.readFloatLE(r2.o + 4), z = b.readFloatLE(r2.o + 8); if (z > 0.01 && z < 100 && x > 0.01 && x < 100) ds3z = Math.max(x, y, z); } }
    }
    if (ds != null || ds3z != null) out[e.name] = +((ds || 1) * (ds3z || 1)).toFixed(4);
  });
  // a class without its own value takes its parent's (super index: > 0 = export of this package, < 0 = import, looked up by name later)
  const parentOf = {};
  P.exports.forEach(e => { if (e.cls !== 0) return; const s = e.sup; parentOf[e.name] = s > 0 ? (P.exports[s - 1] || {}).name : s < 0 ? (P.imports[-s - 1] || {}).name : null; });
  Object.defineProperty(out, '__parents', { value: parentOf, enumerable: false });
  return out;
}
/** several packages -> { className: scale } with inheritance across them (no value anywhere up the chain = 1) */
function allScales(bufs) {
  const own = {}, parent = {};
  bufs.forEach(buf => { const s = scales(buf); Object.assign(own, s); Object.assign(parent, s.__parents); });
  const out = {};
  Object.keys(parent).forEach(n => { let c = n, k = 0; while (c && own[c] == null && k++ < 20) c = parent[c]; out[n] = c && own[c] != null ? own[c] : 1; });
  return out;
}
// ---- BUILDINGS (owner 2026-10-17: "I miss all the buildings in all towns"): every StaticMeshActor of a map (MAPS/<x>_<y>.unr) ----
// The tagged properties are found by their tags: Location (Vector struct), Rotation (Rotator struct), StaticMesh (object), DrawScale (float),
// DrawScale3D (Vector struct). Values stay in Unreal units / axes; the 3D view converts them.
function objPath(P, i) {
  const parts = []; let k = i, n = 0;
  while (k && n++ < 8) { if (k < 0) { const im = P.imports[-k - 1]; if (!im) break; parts.unshift(im.name); k = im.outer; } else { const ex = P.exports[k - 1]; if (!ex) break; parts.unshift(ex.name); k = ex.outer; } }
  return parts;   // [package, (group,) object]
}
function placements(buf) {
  const P = parse(buf), { b, names } = P;
  const N = (n) => names.indexOf(n);
  const iLoc = N('Location'), iRot = N('Rotation'), iSM = N('StaticMesh'), iDS = N('DrawScale'), iDS3 = N('DrawScale3D');
  const cn = (i) => i < 0 ? (P.imports[-i - 1] || {}).name : i > 0 ? (P.exports[i - 1] || {}).name : 'Class';
  const out = [];
  P.exports.forEach(e => {
    if (!/^(StaticMeshActor|MovableStaticMeshActor|L2MovableStaticMeshActor)$/i.test(cn(e.cls) || '') || !e.size) return;
    const end = e.off + e.size; const a = { mesh: null, loc: null, rot: [0, 0, 0], ds: 1, ds3: [1, 1, 1] };
    for (let o = e.off; o < end - 3; o++) {
      const r = reader(b, o), n = r.ci(); if (r.o >= end) break;
      const info = b[r.o], type = info & 0x0f, sc = (info >> 4) & 7;
      if (n === iLoc && type === 10 && sc === 3) { const r2 = reader(b, r.o + 1); r2.ci(); a.loc = [b.readFloatLE(r2.o), b.readFloatLE(r2.o + 4), b.readFloatLE(r2.o + 8)]; }
      else if (n === iRot && type === 10 && sc === 3) { const r2 = reader(b, r.o + 1); r2.ci(); a.rot = [b.readInt32LE(r2.o), b.readInt32LE(r2.o + 4), b.readInt32LE(r2.o + 8)]; }   // pitch, yaw, roll
      else if (n === iDS3 && iDS3 >= 0 && type === 10 && sc === 3) { const r2 = reader(b, r.o + 1); r2.ci(); a.ds3 = [b.readFloatLE(r2.o), b.readFloatLE(r2.o + 4), b.readFloatLE(r2.o + 8)]; }
      else if (n === iDS && type === 4 && sc === 2) { const v = b.readFloatLE(r.o + 1); if (v > 0.001 && v < 1000) a.ds = v; }
      else if (n === iSM && type === 5 && !a.mesh) { const r2 = reader(b, r.o + 1); const ref = r2.ci(); const p = objPath(P, ref); if (p.length >= 2) a.mesh = p[0] + '.' + p[p.length - 1]; }
    }
    if (a.mesh && a.loc) out.push(a);
  });
  return out;
}
module.exports = { parse, scales, allScales, plain, placements };
if (require.main === module) {
  const [cmd, ...files] = process.argv.slice(2);
  if (cmd === 'scales') console.log(JSON.stringify(allScales(files.map(f => fs.readFileSync(f)))));
  else console.log('usage: node l2pkg.js scales <file.u> ...');
}
