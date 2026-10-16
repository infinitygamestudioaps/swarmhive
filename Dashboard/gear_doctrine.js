// GEAR DOCTRINE (owner 2026-10-16: "Here is every single information you need about armor, weapon, jewelry, epics for all classes and grades.
// Make sure we follow this"). Pure helpers over Scripts/data/gear_doctrine.json for Dashboard/gear_recommend.js:
//   load(dataDir)                    -> the doctrine (cached by mtime) or null
//   resolveName(C, name, slot)       -> catalog item id of the plain item (no S.A. / Common twin) or 0
//   planFor(D, C, classId, grade)    -> { line, col, weapon: { ids, sa }, sigil: [ids], sets: [chest names], jewel: { neck|earring|ring: [ids] },
//                                         epics: { slot: [ids] } } or null when the class is not in the doctrine
'use strict';
const fs = require('fs'), path = require('path');
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9*]/g, '');
let cache = null, cacheKey = '';
function load(dataDir) {
  const f = path.join(dataDir, 'gear_doctrine.json');
  let st; try { st = fs.statSync(f); } catch (e) { return null; }
  const k = f + ':' + st.mtimeMs;
  if (cache && cacheKey === k) return cache;
  try { cache = JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); cacheKey = k; } catch (e) { cache = null; }
  return cache;
}
const idxCache = new WeakMap();
function nameIndex(C) {
  let I = idxCache.get(C); if (I) return I;
  I = {};
  Object.entries(C.items).forEach(([id, it]) => { if (it.common || it.sa || it.base) return; (I[norm(it.n)] = I[norm(it.n)] || []).push(+id); });
  idxCache.set(C, I); return I;
}
function resolveName(C, name, slot) {
  const L = nameIndex(C)[norm(name)] || [];
  const ok = L.filter(id => !slot || C.items[id].s === slot);
  return ok.length ? Math.min(...ok) : 0;
}
function row(D, line, grade, depth) {
  const r = ((D.weapons || {})[line] || {})[grade];
  if (r && r.like && (depth || 0) < 4) return row(D, r.like, grade, (depth || 0) + 1);
  return r || null;
}
function planFor(D, C, classId, grade) {
  if (!D || !D.classes) return null;
  const cl = D.classes[String(classId)]; if (!Array.isArray(cl)) return null;
  const [line, col] = cl;
  const r = row(D, line, grade) || {};
  const ids = (L, slot) => (L || []).map(n => resolveName(C, n, slot)).filter(Boolean);
  const J = (D.jewelry || {})[grade] || {}, E = (D.epics || {})[grade] || {};
  return {
    line, col,
    weapon: { ids: ids(r.w, 'weapon'), sa: (r.sa || []).slice() },
    sigil: ids(r.sigil, 'shield'),
    sets: (((D.armor || {})[col] || {})[grade] || []).slice(),
    jewel: { neck: ids(J.neck, 'neck'), earring: ids(J.earring, 'earring'), ring: ids(J.ring, 'ring') },
    epics: { neck: ids(E.neck, 'neck'), earring: ids(E.earring, 'earring'), ring: ids(E.ring, 'ring') },
  };
}
module.exports = { load, resolveName, planFor, norm };
