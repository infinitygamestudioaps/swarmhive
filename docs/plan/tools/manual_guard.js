// MANUAL GUARD (2026-10-08, dashboard shape editor "POLYEDIT", user 22:50: "Under /rooms, /spots and /zones it should be possible for me to
// edit each thing, so I can drag or change the zone to my fitting").
//
// Items the user edited on the dashboard carry  manual: true  +  edited: { by: 'dashboard', at, orig }. The generator tools
// (room_polys.js, room_refine.js, safe_spots.js, spots.js, zone_subareas.js, field_areas.js) must never overwrite them. Two layers:
//   1. in memory: the tools skip manual items where they recompute a shape (isManual);
//   2. at WRITE time (the safety net, also covers an edit made while a tool was running): writeGuarded() takes the lock, re-reads the file
//      on disk and copies the user-owned fields of every manual item from disk into the data the tool is about to write.
// Writes are atomic (tmp + rename), the lock is a  <file>.lock  created with 'wx' (stale after 15 s).
//
// Used by Dashboard/polyedit_api.js (the editor's API) and the tools above. No dependencies.
'use strict';
const fs = require('fs'), path = require('path');

/** fields the dashboard editor owns per kind (restored from disk at write time) */
const USER_FIELDS = {
  room: ['name', 'poly', 'center', 'radius', 'zRange', 'area', 'polyInfo', 'levelRange', 'suitsPartyLevel', 'notes', 'enabled', 'monsters', 'spawnCount', 'mergedInto', 'edited', 'manual'],   // mergedInto: ROOMMERGE-2026-10-22
  spot: ['name', 'center', 'radius', 'poly', 'levelMin', 'levelMax', 'enabled', 'note', 'edited', 'manual'],
  zone: ['name', 'x', 'y', 'z', 'radius', 'poly', 'zmap', 'levelMin', 'levelMax', 'enabled', 'note', 'edited', 'manual'],
  area: ['name', 'poly', 'center', 'x', 'y', 'z', 'radius', 'zRange', 'levelRange', 'levelMin', 'levelMax', 'suitsPartyLevel', 'polyInfo', 'enabled', 'notes', 'note', 'area', 'edited', 'manual'],
  subarea: ['areas', 'center', 'radius', 'edited', 'manual'],
};
const isManual = (o) => !!(o && (o.manual === true || (o.edited && o.edited.by === 'dashboard')));

const sleepSync = (ms) => { try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch (e) { const t = Date.now() + ms; while (Date.now() < t) { /* spin */ } } };

/** text + format of a JSON file: BOM, indent (null = compact), line ending */
function readText(file) {
  const raw = fs.readFileSync(file, 'utf8');
  return { raw, text: raw.replace(/^﻿/, ''), fmt: formatOf(raw) };
}
function formatOf(raw) {
  const bom = raw.charCodeAt(0) === 0xFEFF, t = bom ? raw.slice(1) : raw;
  const nl = t.indexOf('\n');
  if (nl < 0 || nl > 4000) return { bom, indent: null, eol: '\n' };
  const eol = t[nl - 1] === '\r' ? '\r\n' : '\n';
  const m = t.slice(nl + 1).match(/^([ \t]+)\S/);
  return { bom, indent: m ? (m[1][0] === '\t' ? '\t' : m[1].length) : null, eol };
}
function stringifyLike(obj, fmt) {
  fmt = fmt || { bom: false, indent: null, eol: '\n' };
  let s = fmt.indent ? JSON.stringify(obj, null, fmt.indent) : JSON.stringify(obj);
  if (fmt.indent && fmt.eol === '\r\n') s = s.replace(/\n/g, '\r\n');
  return (fmt.bom ? '﻿' : '') + s;
}
const readJson = (file, fb) => { try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')); } catch (e) { return fb; } };

/** atomic replace: write <file>.<pid>.tmp, parse it back, rename over the file (retries while a reader holds it on Windows) */
function atomicWrite(file, text) {
  const tmp = `${file}.${process.pid}.${Date.now() % 100000}.tmp`;
  fs.writeFileSync(tmp, text, 'utf8');
  if (/\.json$/i.test(file)) JSON.parse(text.replace(/^﻿/, ''));          // never replace the live file with broken JSON
  let err = null;
  for (let i = 0; i < 40; i++) {
    try { fs.renameSync(tmp, file); return; } catch (e) { err = e; if (!/EPERM|EBUSY|EACCES/.test(e.code || '')) break; sleepSync(50); }
  }
  try { fs.unlinkSync(tmp); } catch (e) { }
  throw err;
}

/** run fn() holding <file>.lock (sync). Stale lock (older than staleMs) is removed. */
function withLock(file, fn, opt = {}) {
  const lock = file + '.lock', staleMs = opt.staleMs || 15000, waitMs = opt.waitMs || 12000, t0 = Date.now();
  for (;;) {
    try { const fd = fs.openSync(lock, 'wx'); fs.writeSync(fd, `${process.pid} ${new Date().toISOString()} ${opt.who || ''}`); fs.closeSync(fd); break; }
    catch (e) {
      if (e.code !== 'EEXIST') throw e;
      try { if (Date.now() - fs.statSync(lock).mtimeMs > staleMs) { fs.unlinkSync(lock); continue; } } catch (e2) { continue; }
      if (Date.now() - t0 > waitMs) throw new Error('file is locked by another writer: ' + path.basename(lock));
      sleepSync(40);
    }
  }
  try { return fn(); } finally { try { fs.unlinkSync(lock); } catch (e) { } }
}

/** copy the history of a data file: <dataDir>/history/<base>_<stamp>.json, keep the last `keep` per file */
function saveHistory(file, dataDir, keep = 50) {
  if (!fs.existsSync(file)) return null;
  const H = path.join(dataDir || path.dirname(file), 'history'); fs.mkdirSync(H, { recursive: true });
  const base = path.basename(file).replace(/\.json$/i, '');
  const out = path.join(H, `${base}_${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.copyFileSync(file, out);
  const mine = fs.readdirSync(H).filter(n => n.startsWith(base + '_') && /^\d{4}-/.test(n.slice(base.length + 1)) && n.endsWith('.json')).sort();
  mine.slice(0, Math.max(0, mine.length - keep)).forEach(n => { try { fs.unlinkSync(path.join(H, n)); } catch (e) { } });
  return out;
}

function copyFields(dst, src, fields) {
  fields.forEach(k => { if (src[k] === undefined) delete dst[k]; else dst[k] = JSON.parse(JSON.stringify(src[k])); });
}

// ---------------------------------------------------------------------------------------------- per-file merges (disk -> data to write)
/** dungeon_rooms.json: rooms by id; a manual room the tool dropped is put back into its floor (same dungeon + floor name) */
function mergeRooms(all, disk) {
  if (!Array.isArray(all) || !Array.isArray(disk)) return 0;
  const idx = new Map(); all.forEach(d => (d.floors || []).forEach(F => (F.rooms || []).forEach(r => idx.set(r.id, r))));
  let n = 0;
  disk.forEach(dd => (dd.floors || []).forEach(FF => (FF.rooms || []).forEach(rr => {
    if (!isManual(rr)) return;
    const r = idx.get(rr.id);
    if (r) { copyFields(r, rr, USER_FIELDS.room); n++; return; }
    const d = all.find(x => x.name === dd.name), F = d && (d.floors || []).find(x => x.name === FF.name);
    if (F) { (F.rooms = F.rooms || []).push(JSON.parse(JSON.stringify(rr))); n++; }
  })));
  return n;
}
/** hunting_spots_h5.json: names are not unique -> match a manual spot by name + its ORIGINAL centre (edited.key "x,y") within 2500 */
function spotKey(s) { const c = (s.edited && s.edited.key) || (s.center ? `${Math.round(s.center.x)},${Math.round(s.center.y)}` : ''); return c; }
function mergeSpots(list, disk) {
  if (!Array.isArray(list) || !Array.isArray(disk)) return 0;
  let n = 0;
  disk.filter(isManual).forEach(ms => {
    const [kx, ky] = spotKey(ms).split(',').map(Number);
    const hit = list.find(s => (s.name === ms.name || (ms.edited && ms.edited.origName === s.name)) && s.center && Math.hypot(s.center.x - kx, s.center.y - ky) < 2500);
    if (hit) copyFields(hit, ms, USER_FIELDS.spot); else list.push(JSON.parse(JSON.stringify(ms)));
    n++;
  });
  return n;
}
/** zone_subareas.json { zones: { "x,y": {...} } }: manual entries are kept as they are on disk */
function mergeSubareas(obj, disk) {
  if (!obj || !disk || !obj.zones || !disk.zones) return 0;
  let n = 0; Object.keys(disk.zones).forEach(k => { if (isManual(disk.zones[k])) { obj.zones[k] = disk.zones[k]; n++; } });
  return n;
}
/** field_areas.json { regions: [{ id, areas: [...] }] } (field_areas.js 2026-10-08), or [...] / { areas: [...] }: areas by id (or name).
 *  A manual area the tool no longer has is put back into its region (same region id), or dropped with a warning when the region is gone. */
function mergeAreas(data, disk) {
  const flat = (o) => Array.isArray(o) ? [{ R: null, L: o }] : o && Array.isArray(o.areas) ? [{ R: null, L: o.areas }] : o && Array.isArray(o.regions) ? o.regions.map(R => ({ R, L: (R.areas = R.areas || []) })) : [];
  const out = flat(data), dk = flat(disk);
  if (!out.length || !dk.length) return 0;
  const key = (a) => a.id !== undefined ? 'id:' + a.id : 'name:' + a.name;
  const idx = new Map(); out.forEach(g => g.L.forEach(a => idx.set(key(a), a)));
  let n = 0;
  dk.forEach(g => g.L.filter(isManual).forEach(ma => {
    const hit = idx.get(key(ma));
    if (hit) { copyFields(hit, ma, USER_FIELDS.area); n++; return; }
    const home = g.R ? out.find(o => o.R && o.R.id === g.R.id) : out[0];
    if (home) { home.L.push(JSON.parse(JSON.stringify(ma))); n++; } else console.log(`manual_guard: manual area ${ma.id || ma.name} dropped — its region ${g.R && g.R.id} is gone`);
  }));
  return n;
}
const MERGE = { room: mergeRooms, spot: mergeSpots, subarea: mergeSubareas, area: mergeAreas };

/**
 * For the generator tools: write `data` to `file` (format of the file on disk kept: BOM, indent, compact) under the lock, after copying
 * every manual item from the CURRENT file on disk into it. kind: 'room' (dungeon_rooms.json) | 'spot' | 'subarea' | 'area'.
 * Returns the number of manual items kept.
 */
function writeGuarded(file, data, kind, opt = {}) {
  return withLock(file, () => {
    let kept = 0, fmt = opt.fmt || null;
    if (fs.existsSync(file)) {
      const t = readText(file); fmt = fmt || t.fmt;
      let disk = null; try { disk = JSON.parse(t.text); } catch (e) { disk = null; }
      if (disk && MERGE[kind]) kept = MERGE[kind](data, disk);
    }
    atomicWrite(file, stringifyLike(data, fmt || { bom: false, indent: opt.indent === undefined ? null : opt.indent, eol: '\n' }));
    if (kept && !opt.quiet) console.log(`manual_guard: kept ${kept} item(s) edited on the dashboard (${path.basename(file)})`);
    return kept;
  }, { who: opt.who || path.basename(process.argv[1] || 'tool') });
}

module.exports = { USER_FIELDS, isManual, readText, formatOf, stringifyLike, readJson, atomicWrite, withLock, saveHistory, copyFields,
  mergeRooms, mergeSpots, mergeSubareas, mergeAreas, writeGuarded, sleepSync };
