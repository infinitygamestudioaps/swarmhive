// L2DAT (3D VIEW models, owner 2026-10-17: "character models and enemies"; the files come from the player's OWN installed official client and
// stay on that PC, never in a release): reads Lineage 2 client .dat files of the "Lineage2Ver413" format (RSA blocks of 128 bytes over zlib;
// the two public keys the community tools use) and turns npcgrp.dat into { npcId: { cls, mesh, tex[] } } (mesh = "Package.object").
//   node docs/plan/tools/l2dat.js decode <file.dat> <out.bin>
//   node docs/plan/tools/l2dat.js npcgrp [<client system folder>] [<out.json>]
'use strict';
const fs = require('fs'), zlib = require('zlib'), path = require('path');
const KEYS = [
  [BigInt('0x75b4d6de5c016544068a1acf125869f43d2e09fc55b8b1e289556daf9b8757635593446288b3653da1ce91c87bb1a5c18f16323495c55d7d72c0890a83f69bfd1fd9434eb1c02f3e4679edfa43309319070129c267c85604d87bb65bae205de3707af1d2108881abb567c3b3d069ae67c3a4c6a3aa93d26413d4c66094ae2039'), 0x1dn],
  [BigInt('0x97df398472ddf737ef0a0cd17e8d172f0fef1661a38a8ae1d6e829bc1c6e4c3cfc19292dda9ef90175e46e7394a18850b6417d03be6eea274d3ed1dde5b5d7bde72cc0a0b71d03608655633881793a02c9a67d9ef2b45eb7c08d4be329083ce450e68f7867b6749314d40511d09bc5744551baa86a89dc38123dc1668fd72d83'), 0x35n]];
function modpow(b, e, m) { let r = 1n; b %= m; while (e > 0n) { if (e & 1n) r = r * b % m; e >>= 1n; b = b * b % m; } return r; }
/** a Ver413 .dat file -> its plain bytes */
function decode(buf) {
  const head = buf.slice(0, 28).toString('utf16le');
  if (head !== 'Lineage2Ver413') throw new Error('not a Lineage2Ver413 file: ' + head);
  const body = buf.slice(28, buf.length - 20);
  const blockOf = (o, N, E) => Buffer.from(modpow(BigInt('0x' + body.slice(o, o + 128).toString('hex')), E, N).toString(16).padStart(256, '0'), 'hex');
  const key = KEYS.find(([N, E]) => blockOf(0, N, E).readUInt32BE(0) <= 124);
  if (!key) throw new Error('no known key decrypts this file');
  const parts = [];
  for (let o = 0; o + 128 <= body.length; o += 128) {
    const d = blockOf(o, key[0], key[1]), size = d.readUInt32BE(0);
    if (size > 124) throw new Error('bad block at ' + o);
    const p = 128 - size - ((124 - size) % 4);
    parts.push(d.slice(p, p + size));
  }
  const all = Buffer.concat(parts), len = all.readUInt32LE(0), out = zlib.inflateSync(all.slice(4));
  if (out.length !== len) throw new Error(`size ${out.length} != ${len}`);
  return out;
}
/** decoded npcgrp -> { id: { cls, mesh, tex[] } }: each record starts with id, class name, mesh name, texture count + names (UTF-16, int32 byte length) */
function npcgrp(b) {
  const strAt = (o) => {
    if (o + 4 > b.length) return null; const n = b.readInt32LE(o); if (n < 4 || n > 300 || n % 2 || o + 4 + n > b.length) return null;
    const t = b.slice(o + 4, o + 4 + n).toString('utf16le').replace(/\0$/, ''); return /^[A-Za-z0-9_.\- ]+$/.test(t) ? { s: t, end: o + 4 + n } : null;
  };
  const out = {};
  for (let o = 4; o < b.length - 12; o++) {
    const id = b.readUInt32LE(o); if (id < 1 || id > 70000) continue;
    const c = strAt(o + 4); if (!c || c.s.indexOf('.') < 0) continue;
    const m = strAt(c.end); if (!m || m.s.indexOf('.') < 0) continue;
    let p = m.end; const nt = b.readUInt32LE(p); p += 4; if (nt > 12) continue;
    const tex = []; let ok = true;
    for (let i = 0; i < nt; i++) { const t = strAt(p); if (!t) { ok = false; break; } tex.push(t.s); p = t.end; }
    if (!ok) continue;
    out[id] = { cls: c.s, mesh: m.s, tex };
    o = p - 1;
  }
  return out;
}
// ---- characters (armorgrp.dat + chargrp.dat) ------------------------------------------------------------------------------------------------
// A character = body parts of its race + gender ("rg": MFighter, FMagic, MElf, FDarkElf, MOrc, FShaman, MDwarf, FKamael ...): every worn armour
// piece has a mesh per rg in armorgrp ("Elf.FElf_m005_u" + texture "FElf.FElf_m005_t53_u"); faces, hair and the plain clothes for empty slots
// come from chargrp. Mesh = package of the race ("Fighter", "Magic", "Elf", "DarkElf", "Orc", "Shaman", "Dwarf", "Kamael"); texture package = rg.
const RACE_PKG = /^(fighter|magic|elf|darkelf|orc|shaman|dwarf|kamael)$/i;
const RG_RE = /^([MF](?:Fighter|Magic|Elf|DarkElf|Orc|Shaman|Dwarf|Kamael))_/i;
const normRg = (s) => { const m = String(s).match(/^([MF])(fighter|magic|elf|darkelf|orc|shaman|dwarf|kamael)$/i); return m ? m[1].toUpperCase() + ({ fighter: 'Fighter', magic: 'Magic', elf: 'Elf', darkelf: 'DarkElf', orc: 'Orc', shaman: 'Shaman', dwarf: 'Dwarf', kamael: 'Kamael' })[m[2].toLowerCase()] : null; };
/** every "Package.object" UTF-16 string of a decoded .dat with its byte offset */
function strings(b) {
  const out = [];
  for (let o = 0; o < b.length - 4; o++) {
    const n = b.readInt32LE(o);
    if (n >= 6 && n < 300 && n % 2 === 0 && o + 4 + n <= b.length) {
      const t = b.slice(o + 4, o + 4 + n).toString('utf16le').replace(/\0$/, '');
      if (/^[A-Za-z][A-Za-z0-9_]*\.[A-Za-z0-9_.]+$/.test(t)) { out.push([o, t]); o += 3 + n; }
    }
  }
  return out;
}
/** strings -> { rg: [{ mesh, tex[] }] } (a texture belongs to the mesh of the same rg before it) */
function partsOf(list) {
  const out = {}; let last = {};
  list.forEach(t => {
    const i = t.indexOf('.'), pkg = t.slice(0, i), obj = t.slice(i + 1);
    const m = obj.match(RG_RE); if (!m) return;
    const rg = normRg(m[1]); if (!rg) return;
    if (RACE_PKG.test(pkg)) { const p = { mesh: t, tex: [] }; (out[rg] = out[rg] || []).push(p); last[rg] = p; }
    else if (normRg(pkg) === rg && last[rg]) last[rg].tex.push(t);
  });
  return out;
}
/** decoded armorgrp -> { itemId: { rg: [{ mesh, tex[] }] } } (the record's item id sits 24 bytes before its drop model "dropitems.*") */
function armorgrp(b) {
  const S = strings(b), out = {};
  const starts = []; S.forEach(([o, t], i) => { if (/^dropitems\./i.test(t) && o >= 24) starts.push([i, b.readUInt32LE(o - 24)]); });
  starts.forEach(([i, id], k) => { const to = k + 1 < starts.length ? starts[k + 1][0] : S.length; const p = partsOf(S.slice(i, to).map(s => s[1])); if (Object.keys(p).length) out[id] = p; });
  return out;
}
/** decoded chargrp -> { rg: { face[], hair[], u, l, g, b } } (the plain clothes = the first mesh of each slot) */
function chargrp(b) {
  const p = partsOf(strings(b).map(s => s[1])), out = {};
  Object.entries(p).forEach(([rg, L]) => {
    const o = out[rg] = { face: [], hair: [], u: null, l: null, g: null, b: null };
    L.forEach(x => {
      const obj = x.mesh.slice(x.mesh.indexOf('.') + 1);
      if (/_f$/i.test(obj)) o.face.push(x); else if (/_ah$/i.test(obj)) o.hair.push(x);
      else { const s = (obj.match(/_([ulgb])$/i) || [])[1]; if (s && !o[s.toLowerCase()]) o[s.toLowerCase()] = x; }
    });
    // the face models come first and their textures after the last one: every face gets the textures of the group
    const ft = [].concat(...o.face.map(f => f.tex)); o.face = o.face.map(f => ({ mesh: f.mesh, tex: f.tex.length ? f.tex : ft }));
  });
  return out;
}
/** WEAPONS (owner 2026-10-17: "weapons in the characters' hands"): decoded weapongrp -> { itemId: { mesh[], tex[] } } (LineageWeapons* models,
 *  LineageWeaponsTex* textures; a record starts at a drop model with the item id 24 bytes before it). Also shields from armorgrp (wpOf). */
function weapongrp(b) {
  const S = strings(b), out = {};
  // a record starts with its first model string (the weapon's own model, or a drop model) and the item id 24 bytes before it; ids rise
  const starts = []; let last = 0;
  S.forEach(([o, t], i) => {
    if (o < 24 || !/^(LineageWeapons\d*|dropitems)\./i.test(t)) return;
    const id = b.readUInt32LE(o - 24);
    if (id > last && id - last < 5000 && b.readUInt32LE(o - 4) === 0) { starts.push([i, id]); last = id; }
  });
  starts.forEach(([i, id], k) => { const to = k + 1 < starts.length ? starts[k + 1][0] : S.length; const w = wpOf(S.slice(i, to).map(s => s[1])); if (w.mesh.length) out[id] = { mesh: [...new Set(w.mesh)], tex: [...new Set(w.tex)] }; });
  return out;
}
function wpOf(list) {
  const w = { mesh: [], tex: [] };
  list.forEach(t => { const pkg = t.slice(0, t.indexOf('.')); if (/^LineageWeapons\d*Tex$/i.test(pkg)) w.tex.push(t); else if (/^LineageWeapons\d*$/i.test(pkg) && !/rangesample/i.test(t)) w.mesh.push(t); });
  return w;
}
/** decoded armorgrp -> { itemId: { mesh[], tex[] } } for the pieces held in a hand (shields, sigils) */
function shieldgrp(b) {
  const S = strings(b), out = {};
  const starts = []; S.forEach(([o, t], i) => { if (/^dropitems\./i.test(t) && o >= 24) starts.push([i, b.readUInt32LE(o - 24)]); });
  starts.forEach(([i, id], k) => { const to = k + 1 < starts.length ? starts[k + 1][0] : S.length; const w = wpOf(S.slice(i, to).map(s => s[1])); if (w.mesh.length) out[id] = w; });
  return out;
}
/** class id -> race package base (H5 class ids) */
function raceOfClass(id) {
  id = +id;
  if (id <= 9 || (id >= 88 && id <= 93)) return 'Fighter';
  if (id <= 17 || (id >= 94 && id <= 98)) return 'Magic';
  if (id <= 30 || (id >= 99 && id <= 105)) return 'Elf';
  if (id <= 43 || (id >= 106 && id <= 112)) return 'DarkElf';
  if (id <= 48 || id === 113 || id === 114) return 'Orc';
  if (id <= 52 || id === 115 || id === 116) return 'Shaman';
  if (id <= 57 || id === 117 || id === 118) return 'Dwarf';
  if (id >= 123 && id <= 136) return 'Kamael';
  return 'Fighter';
}
module.exports = { decode, npcgrp, armorgrp, chargrp, weapongrp, shieldgrp, raceOfClass, strings, partsOf };
if (require.main === module) {
  const [cmd, a, b] = process.argv.slice(2);
  if (cmd === 'decode') { const out = decode(fs.readFileSync(a)); fs.writeFileSync(b, out); console.log('decoded', out.length, 'bytes'); }
  else if (cmd === 'npcgrp') {
    const sys = a || 'C:\\Lineage2\\system', f = ['npcgrp.dat', 'Npcgrp.dat'].map(x => path.join(sys, x)).find(x => fs.existsSync(x));
    const m = npcgrp(decode(fs.readFileSync(f)));
    fs.writeFileSync(b || 'npc_models.json', JSON.stringify(m)); console.log(Object.keys(m).length, 'NPCs with a model');
  } else console.log('usage: node l2dat.js decode <file.dat> <out.bin> | npcgrp [<system folder>] [<out.json>]');
}
