// FSCACHE (2026-10-13, owner: "everything runs insanely slowly on the dashboard, it hardly loads at all"): file reads of the dashboard keyed
// by the file's modification time + size. An unchanged file is NOT read again (a stat instead of open + read + decode): Scripts/swarm.js
// (2.8 MB) was read on EVERY readStates() / teamMap() call = several times per request, ~70 % of the server's CPU (CPU profile 2026-10-13).
//   readText(file)            -> the file's text (utf8, BOM kept like fs.readFileSync) or throws like fs.readFileSync
//   readJson(file, fallback)  -> JSON.parse of the text (a NEW object every call: callers may change it), fallback when missing / broken
//   memo(key, ms, fn)         -> fn() at most once per ms (short TTL cache for computed values; the caller gets the SAME object)
// LRU, at most 96 MB of text; files above 16 MB are read directly (never cached).
'use strict';
const fs = require('fs');
const MAX_TOTAL = 96 * 1048576, MAX_ONE = 16 * 1048576;
const C = new Map();   // file -> { m, s, text }
let total = 0;
const stats = { hit: 0, miss: 0 };

function readText(file) {
  const st = fs.statSync(file);
  const e = C.get(file);
  if (e && e.m === st.mtimeMs && e.s === st.size) { C.delete(file); C.set(file, e); stats.hit++; return e.text; }
  stats.miss++;
  const text = fs.readFileSync(file, 'utf8');
  if (e) { total -= e.text.length; C.delete(file); }
  if (st.size <= MAX_ONE) {
    // a file being written right now (size changed between stat and read) is not cached: next call reads it again
    let st2 = null; try { st2 = fs.statSync(file); } catch (x) { }
    if (st2 && st2.mtimeMs === st.mtimeMs && st2.size === st.size) {
      C.set(file, { m: st.mtimeMs, s: st.size, text }); total += text.length;
      while (total > MAX_TOTAL && C.size) { const [k, v] = C.entries().next().value; C.delete(k); total -= v.text.length; }
    }
  }
  return text;
}
function readJson(file, fallback) {
  try { return JSON.parse(readText(file).replace(/^﻿/, '')); } catch (e) { return fallback; }
}
/** READ-ONLY parsed copy, shared by every caller (NEVER change the returned object): for big data files that handlers only read
 *  (dungeon_rooms.json 2.3 MB, raidbosses_h5.json, the room / town graphs). Parsed again only when the file changed; at most 16 kept. */
const P = new Map();
function readJsonShared(file, fallback) {
  try {
    const st = fs.statSync(file), e = P.get(file);
    if (e && e.m === st.mtimeMs && e.s === st.size) { P.delete(file); P.set(file, e); return e.v; }
    const v = JSON.parse(readText(file).replace(/^﻿/, ''));
    P.delete(file); P.set(file, { m: st.mtimeMs, s: st.size, v });
    while (P.size > 16) P.delete(P.keys().next().value);
    return v;
  } catch (e) { return fallback; }
}
const M = new Map();
function memo(key, ms, fn) {
  const e = M.get(key), now = Date.now();
  if (e && now - e.at < ms) return e.v;
  const v = fn(); M.set(key, { at: now, v }); return v;
}
/** a folder's file names, listed at most once per ms (Logs holds ~2100 files: a listing per /api/raidlive poll was ~10-20 ms) */
const D = new Map();
function listDir(dir, ms) {
  const e = D.get(dir), now = Date.now();
  if (e && now - e.at < (ms || 2000)) return e.names;
  const names = fs.readdirSync(dir); D.set(dir, { at: now, names }); return names;
}
function info() { return { files: C.size, mb: Math.round(total / 1048576 * 10) / 10, hit: stats.hit, miss: stats.miss }; }
module.exports = { readText, readJson, readJsonShared, memo, listDir, info };
