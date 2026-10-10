// Generates the dashboard's game images + lookup tables from YOUR OWN L2Swarm install (release package 2026-10-09: the package ships
// no game art; SETUP.cmd -Images runs this). Read-only on Data\; writes only into Dashboard\.
//   Data\icons.db (a ZIP of ~9,400 PNG: item/skill icons, L2UI_* window art, class/ marks)  ->  Dashboard\icons\<same path>
//   Data\base.db  (a ZIP of "key=value" tables: Items, Skills, Classes)                     ->  Dashboard\data\items.json, skills.json, classes.json
//   then docs\plan\tools\crop_menu_icons.js (cut the menu sprite sheets to the visible icon).
// Map tiles are made by make_maptiles.ps1 (Maps\*.jpg -> Dashboard\maptiles); the character mini-map pieces are cut on demand by the
// dashboard (make_minitiles.ps1 -> Dashboard\minitiles).
// Usage: node docs/plan/tools/extract_game_assets.js [--root <install>] [--icons-only | --data-only] [--force]
//   --root   install folder (default: three folders above this file)    --force  rewrite files that already exist
// Pure node (zlib), no unzip/Python needed. Exit code 1 when Data\icons.db / base.db is missing or unreadable.
'use strict';
const fs = require('fs'), path = require('path'), zlib = require('zlib'), cp = require('child_process');

const argv = process.argv.slice(2);
const opt = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
const ROOT = path.resolve(opt('--root') || path.join(__dirname, '..', '..', '..'));
const FORCE = argv.includes('--force'), ICONS = !argv.includes('--data-only'), DATA = !argv.includes('--icons-only');
const DASH = path.join(ROOT, 'Dashboard');

/** minimal ZIP reader (central directory; stored + deflate; no ZIP64 - the L2Swarm .db files are far below 4 GB / 65k entries) */
function openZip(file) {
  const fd = fs.openSync(file, 'r'), size = fs.fstatSync(fd).size;
  const tailLen = Math.min(size, 65557), tail = Buffer.alloc(tailLen);
  fs.readSync(fd, tail, 0, tailLen, size - tailLen);
  let eocd = -1;
  for (let i = tailLen - 22; i >= 0; i--) if (tail.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error(`${file}: not a ZIP (no end of central directory)`);
  const count = tail.readUInt16LE(eocd + 10), cdSize = tail.readUInt32LE(eocd + 12), cdOff = tail.readUInt32LE(eocd + 16);
  const cd = Buffer.alloc(cdSize); fs.readSync(fd, cd, 0, cdSize, cdOff);
  const entries = [];
  for (let p = 0, n = 0; n < count; n++) {
    if (cd.readUInt32LE(p) !== 0x02014b50) throw new Error(`${file}: bad central directory entry ${n}`);
    const method = cd.readUInt16LE(p + 10), csize = cd.readUInt32LE(p + 20), usize = cd.readUInt32LE(p + 24);
    const nlen = cd.readUInt16LE(p + 28), xlen = cd.readUInt16LE(p + 30), clen = cd.readUInt16LE(p + 32), loff = cd.readUInt32LE(p + 42);
    const name = cd.toString('utf8', p + 46, p + 46 + nlen).replace(/\\/g, '/');
    entries.push({ name, method, csize, usize, loff });
    p += 46 + nlen + xlen + clen;
  }
  const read = (e) => {
    const lh = Buffer.alloc(30); fs.readSync(fd, lh, 0, 30, e.loff);
    if (lh.readUInt32LE(0) !== 0x04034b50) throw new Error(`${file}: bad local header for ${e.name}`);
    const start = e.loff + 30 + lh.readUInt16LE(26) + lh.readUInt16LE(28);
    const data = Buffer.alloc(e.csize); fs.readSync(fd, data, 0, e.csize, start);
    if (e.method === 0) return data;
    if (e.method === 8) return zlib.inflateRawSync(data);
    throw new Error(`${file}: ${e.name} uses compression method ${e.method}`);
  };
  return { entries, read, close: () => fs.closeSync(fd) };
}

function extractIcons() {
  const src = path.join(ROOT, 'Data', 'icons.db');
  if (!fs.existsSync(src)) { console.log(`missing ${src} - is this an L2Swarm folder?`); return false; }
  const z = openZip(src); let made = 0, kept = 0, skipped = 0;
  const out = path.join(DASH, 'icons');
  for (const e of z.entries) {
    if (e.name.endsWith('/')) continue;
    const rel = path.normalize(e.name);
    if (rel.startsWith('..') || path.isAbsolute(rel)) { skipped++; continue; }   // never write outside Dashboard\icons
    const dst = path.join(out, rel);
    if (!FORCE && fs.existsSync(dst) && fs.statSync(dst).size === e.usize) { kept++; continue; }
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.writeFileSync(dst, z.read(e)); made++;
  }
  z.close();
  console.log(`icons: ${made} written, ${kept} already there${skipped ? `, ${skipped} unsafe names skipped` : ''} -> ${out}`);
  return true;
}

const NPC_STRINGS_OUT = (() => { const i = process.argv.indexOf('--npc-strings-out'); return i > 0 ? path.resolve(process.argv[i + 1]) : null; })();
function buildTables() {
  const src = path.join(ROOT, 'Data', 'base.db');
  if (!fs.existsSync(src)) { console.log(`missing ${src} - is this an L2Swarm folder?`); return false; }
  const z = openZip(src);
  const table = (name) => { const e = z.entries.find(x => x.name === name); if (!e) throw new Error(`base.db has no "${name}" table`); return z.read(e).toString('utf8').split(/\r?\n/); };
  const iconFile = (ic) => { if (!ic) return null; const p = ic.replace(/^icon\./i, 'icon/').replace(/\./g, '/'); return fs.existsSync(path.join(DASH, 'icons', p + '.png')) ? p : null; };
  const items = {}; let miss = 0;
  table('Items').slice(1).forEach(l => { const c = l.split('='); if (c.length < 4) return; const ic = iconFile(c[2]); if (!ic) miss++; items[c[0]] = [c[3], ic, c[1], c[10]]; });
  const skills = {};
  table('Skills').slice(1).forEach(l => {
    const c = l.split('='); if (c.length < 9) return;
    const key = +c[0], id = Math.floor(key / 65536), lvl = key % 65536;
    if (!skills[id] || lvl === 1) skills[id] = [c[5], iconFile(c[6]), c[4] === '1' ? 1 : 0, c[1]];
  });
  const classes = {}; table('Classes').slice(1).forEach(l => { const c = l.split('='); if (c.length === 2) classes[c[0]] = c[1]; });
  // client NpcStrings (gatekeeper / quest link texts) -> Scripts\data\npc_strings.json: generated here, never shipped (public repo, 2026-10-10)
  const npcStrings = {};
  table('NpcStrings').forEach(l => { const i = l.indexOf('='); if (i > 0 && /^\d+$/.test(l.slice(0, i))) npcStrings[l.slice(0, i)] = l.slice(i + 1); });
  z.close();
  const sd = path.join(ROOT, 'Scripts', 'data'); fs.mkdirSync(sd, { recursive: true });
  fs.writeFileSync(path.join(NPC_STRINGS_OUT || path.join(sd, 'npc_strings.json')), JSON.stringify(npcStrings));
  console.log(`npc strings: ${Object.keys(npcStrings).length} -> ${NPC_STRINGS_OUT || path.join(sd, 'npc_strings.json')}`);
  const dd = path.join(DASH, 'data'); fs.mkdirSync(dd, { recursive: true });
  fs.writeFileSync(path.join(dd, 'items.json'), JSON.stringify(items));
  fs.writeFileSync(path.join(dd, 'skills.json'), JSON.stringify(skills));
  fs.writeFileSync(path.join(dd, 'classes.json'), JSON.stringify(classes));
  console.log(`tables: items ${Object.keys(items).length} (no icon ${miss}), skills ${Object.keys(skills).length}, classes ${Object.keys(classes).length} -> ${dd}`);
  return true;
}

let ok = true;
try {
  if (ICONS) ok = extractIcons() && ok;
  if (DATA) ok = buildTables() && ok;
  const crop = path.join(ROOT, 'docs', 'plan', 'tools', 'crop_menu_icons.js');
  if (ICONS && ok && fs.existsSync(crop)) { cp.execFileSync(process.execPath, [crop], { stdio: 'inherit' }); }
} catch (e) { console.log('extract_game_assets failed: ' + e.message); ok = false; }
process.exit(ok ? 0 : 1);
