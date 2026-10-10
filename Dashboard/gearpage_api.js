// GEAR PLANNER API (user 2026-10-09 12:45: pick the wanted gear for EVERY class and EVERY grade, also items no shop in town sells).
// Loaded by server.js (one hook); data: Dashboard/data/gear_catalog.json (docs/plan/tools/gear_catalog.js), live Giran prices from
// Scripts/data/shopscan_giran.json, our characters from Logs/swarm_state_*.json. Saves into Scripts/data/gear_prefs.json (read live by swarm.js):
//   "_class": { "<classId>": { "<grade>": { "<slot>": { id, name, alt: [ids], buy: 'auto'|'real'|'common', src }, "_fallback": 'auto'|'keep' } } }
//   "_parents": { "<classId>": parentClassId }   (a class without a plan for a grade uses its parent's plan, then the old role preference)
// Slots: weapon shield head chest legs gloves feet neck earring earring2 ring ring2 belt bracelet talisman cloak. The old per-role entries
// ({ role: { grade: { slot: id } } }, dashboard Gear tab 2026-10-06) stay untouched and keep working.
// Every save: the old file is copied to Scripts/data/gear_prefs_history/ (last 200 kept), the new one is written to a .tmp and renamed.
'use strict';
const fs = require('fs'), path = require('path');

const SLOTS = ['weapon', 'shield', 'head', 'chest', 'legs', 'gloves', 'feet', 'neck', 'earring', 'earring2', 'ring', 'ring2', 'belt', 'bracelet', 'talisman', 'cloak'];
const BASE_SLOT = (s) => s.replace(/2$/, '');
const GRADES = ['NONE', 'D', 'C', 'B', 'A', 'S', 'S80', 'S84'];
const GRADE_LVL = { NONE: 1, D: 20, C: 40, B: 52, A: 61, S: 76, S80: 80, S84: 84 };
const BOT_SLOTS = ['weapon', 'shield', 'head', 'chest', 'legs', 'gloves', 'feet', 'neck', 'earring', 'earring2', 'ring', 'ring2'];   // what swarm.js can buy

let CAT = null, CATM = 0;
function catalog(DIR) {
  const f = path.join(DIR, 'data', 'gear_catalog.json');
  let m = 0; try { m = fs.statSync(f).mtimeMs; } catch (e) { return null; }
  if (!CAT || m !== CATM) {
    CAT = JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); CATM = m;
    CAT.byClass = {}; CAT.classes.forEach(c => { CAT.byClass[c.id] = c; });
  }
  return CAT;
}
/** Giran offers per item id from the live shop scan: [{ npc, price, common }] */
function giranOffers(DATA, readJson) {
  const sc = readJson(path.join(DATA, 'shopscan_giran.json'), { shops: [] }) || { shops: [] }, idx = {};
  (sc.shops || []).forEach(s => (s.lists || []).forEach(l => (l.items || []).forEach(i => {
    (idx[i.id] = idx[i.id] || []).push({ npc: s.npc, price: Number(i.price) || 0, common: /^Common Item/.test(i.name) });
  })));
  Object.values(idx).forEach(L => L.sort((a, b) => a.price - b.price));
  return { idx, at: sc.at || '' };
}
const kitOf = (C, c) => C.arch[c.arch] || C.arch.fighter;
/** Does item `it` (catalog row) go in `slot` for class `c` — fit = what the class line uses, ok = it can wear it at all. */
function fitOf(C, c, it, slot) {
  const K = kitOf(C, c), kam = c.race === 'KAMAEL';
  if (it.r && !it.r.split(',').includes(c.race)) return { ok: false };
  const S = BASE_SLOT(slot);
  if (it.s !== S) return { ok: false };
  if (S === 'weapon') {
    const viaChange = !!(K.change && it.t !== K.change && it.cw && (C.items[it.cw] || {}).t === K.change);
    if (kam && !['RAPIER', 'ANCIENTSWORD', 'CROSSBOW'].includes(it.t) && !viaChange) return { ok: false };
    if (!kam && ['RAPIER', 'ANCIENTSWORD', 'CROSSBOW'].includes(it.t)) return { ok: false };
    let fit = K.w.includes('MAGIC') ? !!it.mw : (!it.mw && K.w.includes(it.t)) || viaChange;
    if (fit && K.one && it.two) fit = false;
    if (fit && K.two && !it.two && !viaChange) fit = false;
    return { ok: true, fit, viaChange };
  }
  if (S === 'shield') {
    if (kam) return { ok: false };
    const sig = it.t === 'SIGIL';
    return { ok: true, fit: sig ? !!K.sig : !!K.sh };
  }
  if (S === 'chest' || S === 'legs') {
    if (kam && it.t === 'HEAVY') return { ok: false };
    return { ok: true, fit: !it.t || K.a.includes(it.t) };
  }
  return { ok: true, fit: true };
}
/** The grade rule per slot: talismans have no grade; belts / bracelets / cloaks fall back to lower grades when the grade has none. */
function gradeMatch(C, slot, it, grade, any) {
  const S = BASE_SLOT(slot);
  if (S === 'talisman') return true;
  if (it.g === grade) return true;
  if (['belt', 'bracelet', 'cloak'].includes(S) && !any[S]) return GRADES.indexOf(it.g) < GRADES.indexOf(grade);
  return false;
}
const nf = (n) => Math.round(Number(n) || 0).toLocaleString('en-US');
/** Short text of where an item comes from (no Giran: the live scan is added separately). */
function srcText(C, id) {
  const it = C.items[id]; if (!it) return '';
  const s = it.src || {}, out = [];
  if (s.cr) out.push(`craft: ${s.cr.rn} (lvl ${s.cr.lv}, ${s.cr.rate}%)`);
  if (s.ms) out.push('exchange at ' + s.ms[0][0]);
  if (s.dr) out.push('drop ' + s.dr.slice(0, 2).map(d => `${d[0]} L${d[1]} ${d[2]}%`).join(', '));
  if (s.sp) out.push('spoil ' + s.sp.slice(0, 2).map(d => `${d[0]} L${d[1]} ${d[2]}%`).join(', '));
  if (it.saHow) out.push('S.A.: ' + it.saHow);
  // datapack shops last: L2Toggle's Giran merchants are known from the live scan, a datapack "Giran" shop may not sell it there
  if (s.sh) out.push('datapack shop ' + s.sh.map(x => (x[1] || x[0]) === 'Giran' ? 'Giran (not in the shop scan)' : (x[1] || x[0])).join(', '));
  if (!out.length && it.base) out.push('S.A. on ' + (C.items[it.base] || {}).n);
  return out.join(' · ') || 'quest / event (no source in the datapack)';
}
/** How the bots would get item `id` in Giran: { how: 'real'|'common'|'change', npc, price, id (what is bought) } or null. */
function giranGet(C, G, id, buy, kit) {
  const it = C.items[id]; if (!it) return null;
  const cand = [];
  const add = (iid, how) => (G.idx[iid] || []).forEach(o => cand.push({ id: +iid, how, npc: o.npc, price: o.price, common: o.common }));
  const realId = it.common ? it.tw : +id, comId = it.common ? +id : it.tw;
  if (buy !== 'common' && realId) add(realId, 'real');
  if (buy !== 'real' && comId) add(comId, 'common');
  // Kamael: the sword twin is bought and turned with Change Weapon (skill 1473)
  if (kit && kit.change && it.cw) { const sw = C.items[it.cw]; if (sw && sw.t !== kit.change) { if (buy !== 'common') add(it.cw, 'change'); if (buy !== 'real' && sw.tw) add(sw.tw, 'change'); } }
  if (!cand.length) return null;
  // auto (same rule as swarm.js): the Common twin first (same stats, ~1/20 price) — a caster's armor the REAL piece first (set bonus)
  const casterArmor = !!(kit && kit.w && kit.w.includes('MAGIC') && ['chest', 'legs', 'head', 'gloves', 'feet'].includes(it.s));
  const rank = (x) => buy !== 'auto' ? 0 : (x.common !== casterArmor ? 0 : 1);
  cand.sort((a, b) => rank(a) - rank(b) || a.price - b.price);
  return cand[0];
}
function readPrefs(DATA, readJson) { return readJson(path.join(DATA, 'gear_prefs.json'), {}) || {}; }
const entryOf = (v) => (typeof v === 'number' || typeof v === 'string') && +v ? { id: +v, alt: [], buy: 'auto' } : v && typeof v === 'object' && +v.id ? { id: +v.id, alt: (v.alt || []).map(Number).filter(Boolean), buy: v.buy || 'auto', name: v.name, src: v.src } : null;
/** The plan a class uses at a grade: its own slots, else its parent's (up the line), else the old role preference. */
function resolvePlan(C, P, classId, grade) {
  const out = {}, chain = [];
  let c = +classId;
  for (let i = 0; i < 6 && c != null && !isNaN(c); i++) { chain.push(c); c = (C.byClass[c] || {}).parent; }
  chain.forEach(cid => {
    const g = (((P._class || {})[cid] || {})[grade]) || {};
    Object.keys(g).forEach(s => { if (SLOTS.includes(s) && !out[s]) { const e = entryOf(g[s]); if (e) out[s] = Object.assign(e, { from: cid }); } });
  });
  const role = (C.byClass[classId] || {}).role;
  const rp = role ? (((P[role] || {})[grade]) || {}) : {};
  Object.keys(rp).forEach(s => { if (SLOTS.includes(s) && !out[s] && s.charAt(0) !== '_') { const e = entryOf(rp[s]); if (e) out[s] = Object.assign(e, { from: 'role:' + role }); } });
  let fallback = 'auto';
  for (const cid of chain) { const g = ((P._class || {})[cid] || {})[grade]; if (g && g._fallback) { fallback = g._fallback; break; } }
  return { plan: out, chain, fallback };
}
const gnorm = (n) => String(n || '').toLowerCase().replace(/^common item - /, '').replace(/[^a-z0-9]/g, '').replace(/(earring|necklace|ring)$/, '').replace(/s$/, '');
/** Our characters: class, level, what they wear (swarm_state gear = names per slot). */
function ours(readStates) {
  return (readStates() || []).filter(s => s && s.name && s.ageSec < 7 * 86400).map(s => ({ name: s.name, classId: s.classId != null ? +s.classId : null, cls: s.cls || '', level: s.level || 0, role: s.role || '', party: s.party || s.leader || '', gear: s.gear || {}, online: s.ageSec <= 120 }));
}
function gradeForLevel(l) { let g = 'NONE'; GRADES.forEach(x => { if (l >= GRADE_LVL[x] && x !== 'NONE') g = x; }); return g; }
/** What a character wears in a slot (ids by name; earring / ring = two names joined with ' + '). */
function wornIds(C, nameIdx, ch, slot) {
  const S = BASE_SLOT(slot), raw = String(ch.gear[S] || ''), names = raw ? raw.split(' + ') : [];
  return names.map(n => ({ n, id: nameIdx[S + ':' + n.toLowerCase()] || null }));
}
let NAMEIDX = null, NAMEIDXM = 0;
function nameIndex(C) {
  if (NAMEIDX && NAMEIDXM === CATM) return NAMEIDX;
  NAMEIDX = {}; NAMEIDXM = CATM;
  Object.entries(C.items).forEach(([id, it]) => { const k = it.s + ':' + it.n.toLowerCase(); if (!NAMEIDX[k]) NAMEIDX[k] = +id; });
  return NAMEIDX;
}
/** Status of one planned slot for one character: has | buy | manual | none (+ text). */
function slotStatus(C, G, kit, e, worn, S) {
  if (!e) return { st: 'none', t: 'no choice: automatic pick' };
  const ids = [e.id].concat(e.alt || []);
  const want = new Set();
  ids.forEach(i => { const it = C.items[i]; if (!it) return; want.add(gnorm(it.n)); if (it.cw && C.items[it.cw]) want.add(gnorm(C.items[it.cw].n)); });
  const w = worn.find(x => want.has(gnorm(x.n)));
  if (w) return { st: 'has', t: 'wears ' + w.n };
  if (!BOT_SLOTS.includes(S)) return { st: 'manual', t: 'the bots do not buy ' + BASE_SLOT(S) + 's: get it by hand' };
  for (const i of ids) { const g = giranGet(C, G, i, e.buy, kit); if (g) return { st: 'buy', t: `will buy ${(C.items[g.id] || {}).n} ${nf(g.price)} at ${g.npc}${g.how === 'change' ? ' (+ Change Weapon)' : ''}`, price: g.price }; }
  return { st: 'manual', t: 'not sold in Giran: ' + srcText(C, e.id) };
}
function rowOf(C, G, c, kit, id, it, f, extra) {
  const gg = giranGet(C, G, id, 'auto', kit), real = it.common ? null : (G.idx[id] || []).find(o => !o.common);
  const tw = it.tw ? C.items[it.tw] : null, com = it.common ? null : (it.tw ? (G.idx[it.tw] || []).find(o => o.common) : null);
  const r = { id: +id, n: it.n, s: it.s, g: it.g, t: it.t || '', fit: !!f.fit };
  ['two', 'mw', 'full', 'pa', 'ma', 'pd', 'md', 'sd', 'mp', 'cr', 'spd', 'rs', 'p', 'common', 'sa', 'base', 'saHow', 'r'].forEach(k => { if (it[k] != null) r[k] = it[k]; });
  if (it.set != null && C.sets[it.set]) r.set = it.set;
  if (tw) r.tw = it.tw;
  if (f.viaChange) r.change = C.items[it.cw] ? C.items[it.cw].n : '';
  if (real) r.gr = [real.npc, real.price];
  if (com) r.gc = [com.npc, com.price];
  if (!real && !com && gg) r.gx = [gg.npc, gg.price, gg.how, (C.items[gg.id] || {}).n];
  if (it.src) r.src = it.src;
  return Object.assign(r, extra || {});
}
function classPage(C, P, G, classId, grade, states, autoPick, REC) {
  const c = C.byClass[classId]; if (!c) return { error: 'unknown class ' + classId };
  if (!GRADES.includes(grade)) return { error: 'unknown grade ' + grade };
  const kit = kitOf(C, c), R = resolvePlan(C, P, classId, grade);
  // candidates per base slot
  const cand = {}, any = {};
  Object.values(C.items).forEach(it => { if (it.g === grade) any[it.s] = true; });
  ['weapon', 'shield', 'head', 'chest', 'legs', 'gloves', 'feet', 'neck', 'earring', 'ring', 'belt', 'bracelet', 'talisman', 'cloak'].forEach(s => { cand[s] = []; });
  Object.entries(C.items).forEach(([id, it]) => {
    if (!cand[it.s] || !gradeMatch(C, it.s, it, grade, any)) return;
    const f = fitOf(C, c, it, it.s); if (!f.ok) return;
    if (it.common && it.tw) return;                         // a Common item is shown on its real twin's row
    cand[it.s].push(rowOf(C, G, c, kit, id, it, f));
  });
  // RECOMMENDED plan (gear_recommend.js): used for every slot without a choice (user's class line > old role choice > recommended)
  const recG = (REC && REC.byKey && REC.byKey[REC.classKey[c.id]] && REC.byKey[REC.classKey[c.id]][grade]) || {};
  const rec = {};
  Object.entries(recG).forEach(([s, e]) => { rec[s] = Object.assign({}, e, { from: 'rec', get: giranGet(C, G, e.id, e.buy, kit) }); });
  const eff = (S) => R.plan[S] || rec[S] || null;
  // planned + recommended items always in the list (also from another grade / an old role preference)
  Object.entries(Object.assign({}, rec, R.plan)).forEach(([s, e]) => [e.id].concat(e.alt || []).forEach(i => {
    const S = BASE_SLOT(s), it = C.items[i]; if (!it || cand[S].some(x => x.id === +i)) return;
    cand[S].push(rowOf(C, G, c, kit, i, it, { fit: false, ok: true }, { odd: it.g !== grade ? 'grade ' + it.g : 'not for this class' }));
  }));
  const plan = {};
  Object.entries(R.plan).forEach(([s, e]) => { plan[s] = Object.assign({}, e, { name: (C.items[e.id] || {}).n || ('item ' + e.id), src: srcText(C, e.id), get: giranGet(C, G, e.id, e.buy, kit), altNames: (e.alt || []).map(i => (C.items[i] || {}).n || ('item ' + i)) }); });
  // our characters of this class (and of its line)
  const line = new Set(), down = (id) => { C.classes.filter(x => x.parent === id).forEach(x => { line.add(x.id); down(x.id); }); };
  R.chain.forEach(x => line.add(x)); down(+classId);
  const idx = nameIndex(C);
  const chars = (states || []).filter(s => s.classId === +classId || line.has(s.classId)).map(s => {
    const own = s.classId === +classId, slots = {};
    SLOTS.forEach(S => { const worn = wornIds(C, idx, s, S); const ix = /2$/.test(S) ? 1 : 0; const w = worn[ix] || null;
      slots[S] = Object.assign({ worn: w }, own ? slotStatus(C, G, kit, eff(S) || (S.endsWith('2') ? eff(BASE_SLOT(S)) : null), worn, S) : {}); });
    return { name: s.name, level: s.level, classId: s.classId, cls: (C.byClass[s.classId] || {}).name || s.cls, own, online: s.online, party: s.party, grade: gradeForLevel(s.level), slots };
  }).sort((a, b) => (b.own - a.own) || b.level - a.level);
  const setIds = new Set(); Object.values(cand).flat().forEach(r => { if (r.set != null) setIds.add(r.set); });
  const sets = {}; setIds.forEach(i => { sets[i] = C.sets[i]; });
  return { class: c, kit, grade, plan, fallback: R.fallback, chain: R.chain.map(i => ({ id: i, name: (C.byClass[i] || {}).name })), cand, sets, chars, rec, recAt: REC ? REC.at : '', auto: autoPick || {}, giranAt: G.at,
    archClasses: C.classes.filter(x => x.arch === c.arch).map(x => ({ id: x.id, name: x.name })) };
}
function summary(C, P, states) {
  const plans = {};
  Object.entries(P._class || {}).forEach(([cid, gs]) => Object.entries(gs || {}).forEach(([g, sl]) => { const n = Object.keys(sl || {}).filter(s => SLOTS.includes(s)).length; if (n) (plans[cid] = plans[cid] || {})[g] = n; }));
  return { classes: C.classes, arch: Object.fromEntries(Object.entries(C.arch).map(([k, v]) => [k, { label: v.label }])), grades: GRADES, gradeLvl: GRADE_LVL, slots: SLOTS, plans,
    roles: Object.keys(P).filter(k => k.charAt(0) !== '_'),
    ours: (states || []).map(s => ({ name: s.name, classId: s.classId, level: s.level, party: s.party, online: s.online })) };
}
function atomicSave(DATA, ROOT, P) {
  const F = path.join(DATA, 'gear_prefs.json'), H = path.join(DATA, 'gear_prefs_history');
  try { fs.mkdirSync(H, { recursive: true }); if (fs.existsSync(F)) fs.copyFileSync(F, path.join(H, 'gear_prefs_' + new Date().toISOString().replace(/[:.]/g, '-') + '.json')); } catch (e) { }
  try { const L = fs.readdirSync(H).filter(n => /^gear_prefs_.*\.json$/.test(n)).sort(); L.slice(0, Math.max(0, L.length - 200)).forEach(n => { try { fs.unlinkSync(path.join(H, n)); } catch (e) { } }); } catch (e) { }
  const tmp = F + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(P, null, 1));
  fs.renameSync(tmp, F);
}
function mutate(C, P, b, G) {
  const cid = String(+b.class), grade = String(b.grade || '').toUpperCase();
  if (!C.byClass[cid]) return 'unknown class';
  if (!GRADES.includes(grade)) return 'unknown grade';
  P._class = P._class || {};
  P._parents = {}; C.classes.forEach(c => { if (c.parent != null) P._parents[c.id] = c.parent; });
  P._classNote = 'Gear planner (dashboard #/gear, 2026-10-09): _class[classId][grade][slot] = { id, alt: [ids in order], buy: auto|real|common, name, src }; _fallback auto = buy the automatic pick while a chosen item cannot be bought, keep = keep what is worn. A class without a plan for a grade uses its parent class (_parents), then the old role entries above.';
  const c = C.byClass[cid], kit = kitOf(C, c);
  const node = () => { P._class[cid] = P._class[cid] || {}; return (P._class[cid][grade] = P._class[cid][grade] || {}); };
  const clean = () => { const g = P._class[cid] && P._class[cid][grade]; if (g && !Object.keys(g).some(k => SLOTS.includes(k)) && !g._fallback) delete P._class[cid][grade]; if (P._class[cid] && !Object.keys(P._class[cid]).length) delete P._class[cid]; };
  const entry = (slot, id, alt, buy) => {
    const it = C.items[id]; if (!it) return 'unknown item ' + id;
    if (it.s !== BASE_SLOT(slot)) return `${it.n} does not go in the ${slot} slot`;
    const f = fitOf(C, c, it, slot); if (!f.ok) return `${c.name} cannot wear ${it.n}`;
    const A = (alt || []).map(Number).filter(i => C.items[i] && C.items[i].s === it.s && i !== +id).slice(0, 5);
    return { id: +id, name: it.n, alt: A, buy: ['auto', 'real', 'common'].includes(buy) ? buy : 'auto', src: srcText(C, id) };
  };
  if (b.action === 'set') {
    const slot = String(b.slot || ''); if (!SLOTS.includes(slot)) return 'unknown slot';
    if (!b.id) { const g = node(); delete g[slot]; clean(); return null; }
    const e = entry(slot, b.id, b.alt, b.buy); if (typeof e === 'string') return e;
    node()[slot] = e; return null;
  }
  if (b.action === 'fallback') { const g = node(); if (b.fallback === 'keep') g._fallback = 'keep'; else delete g._fallback; clean(); return null; }
  if (b.action === 'clear') { if (P._class[cid]) delete P._class[cid][grade]; clean(); return null; }
  // back to the RECOMMENDED plan: every own choice of this class (all grades) / of every class goes (the old role entries stay)
  if (b.action === 'reset' && b.scope === 'class') { const n = Object.keys(P._class[cid] || {}).length; delete P._class[cid]; return { n }; }
  if (b.action === 'reset' && b.scope === 'all') { const n = Object.keys(P._class).length; P._class = {}; return { n }; }
  if (b.action === 'copy') {
    // copy this class + grade plan (incl. inherited slots) to other classes (same archetype); a slot a target cannot wear is skipped
    const R = resolvePlan(C, P, cid, grade), to = (b.to || []).map(String).filter(t => C.byClass[t] && t !== cid), skipped = [];
    to.forEach(t => {
      const tc = C.byClass[t];
      P._class[t] = P._class[t] || {}; const g = (P._class[t][grade] = P._class[t][grade] || {});
      Object.entries(R.plan).forEach(([s, e]) => {
        const it = C.items[e.id]; if (!it) return;
        if (!fitOf(C, tc, it, s).ok) { skipped.push(`${tc.name}: ${it.n}`); return; }
        g[s] = { id: e.id, name: it.n, alt: (e.alt || []).filter(i => C.items[i] && fitOf(C, tc, C.items[i], s).ok), buy: e.buy || 'auto', src: srcText(C, e.id) };
      });
      if (R.fallback === 'keep') g._fallback = 'keep';
    });
    return { skipped, n: to.length };
  }
  return 'unknown action';
}
// ---- recommended plans: recomputed when the catalog or the Giran shop scan changes; written for the bots as Scripts/data/gear_rec/<classId>.json
//      ({ at, key, grades: { <grade>: { <slot>: { id, alt, buy, name, src, why } } } }, read live by swarm.js GEARPREF)
let REC = null, RECK = '';
function recs(ctx, C, G) {
  let sm = 0; try { sm = fs.statSync(path.join(ctx.DATA, 'shopscan_giran.json')).mtimeMs; } catch (e) { }
  const k = CATM + ':' + sm;
  if (REC && RECK === k) return REC;
  REC = require('./gear_recommend').recommendAll(C, G, { fitOf, giranGet, srcText }); RECK = k;
  try { writeRecFiles(ctx.DATA, C, REC); } catch (e) { }
  return REC;
}
function writeRecFiles(DATA, C, R) {
  const D = path.join(DATA, 'gear_rec'); fs.mkdirSync(D, { recursive: true });
  C.classes.forEach(c => {
    const key = R.classKey[c.id], grades = {};
    Object.entries(R.byKey[key] || {}).forEach(([g, sl]) => { grades[g] = {}; Object.entries(sl).forEach(([s, e]) => { grades[g][s] = { id: e.id, alt: e.alt, buy: e.buy, name: e.name, src: String(e.src || '').slice(0, 160), why: e.why }; }); });
    const txt = JSON.stringify({ about: 'Recommended gear for ' + c.name + ' (Dashboard/gear_recommend.js). Used by swarm.js when neither the gear planner nor the old role entries chose a slot.', key, grades });
    const f = path.join(D, c.id + '.json');
    let old = ''; try { old = fs.readFileSync(f, 'utf8'); } catch (e) { }
    if (old.replace(/"at":"[^"]*",/, '') !== txt) { fs.writeFileSync(f + '.tmp', txt); fs.renameSync(f + '.tmp', f); }
  });
}
/** server.js hook: returns true when the request was answered. */
async function handle(req, res, url, ctx) {
  const p = url.pathname;
  if (p === '/gearpage.js' || p === '/gearpage.css' || p === '/mapguard.js' || p === '/readability.css') {
    res.writeHead(200, { 'Content-Type': p.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/css; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(fs.readFileSync(path.join(ctx.DIR, path.basename(p)))); return true;
  }
  if (p === '/api/gearauto') return require('./gearauto_api').handle(req, res, url, ctx);   // Mr.P 2026-10-10: auto gear upgrades on/off + lock
  if (!/^\/api\/gearplanner(\/|$)/.test(p)) return false;
  if (!ctx.allowed(req, url)) { ctx.send(res, 401, 'text/plain; charset=utf-8', 'Access denied'); return true; }
  const C = catalog(ctx.DIR);
  if (!C) { ctx.json(res, 500, { error: 'Dashboard/data/gear_catalog.json missing: run node docs/plan/tools/gear_catalog.js' }); return true; }
  const P = readPrefs(ctx.DATA, ctx.readJson), states = ours(ctx.readStates);
  if (p === '/api/gearplanner/classes' && req.method === 'GET') { ctx.json(res, 200, summary(C, P, states)); return true; }
  if (p === '/api/gearplanner' && req.method === 'GET') {
    const cid = url.searchParams.get('class'), grade = String(url.searchParams.get('grade') || 'C').toUpperCase();
    const G = giranOffers(ctx.DATA, ctx.readJson);
    let auto = {};
    try {   // what the bots pick when nothing is chosen (the old per-role catalog, for classes we play)
      const role = (C.byClass[cid] || {}).role;
      if (role && ctx.gearCatalog) { const gc = ctx.gearCatalog(role, grade, false); Object.entries(gc.slots || {}).forEach(([s, L]) => { const a = (L || []).find(x => x.auto); if (a) auto[s] = { id: a.id, name: a.name }; }); }
    } catch (e) { auto = {}; }
    ctx.json(res, 200, classPage(C, P, G, cid, grade, states, auto, recs(ctx, C, G))); return true;
  }
  if (p === '/api/gearplanner' && req.method === 'POST') {
    const b = await ctx.body(req), P2 = readPrefs(ctx.DATA, ctx.readJson);
    const r = mutate(C, P2, b, giranOffers(ctx.DATA, ctx.readJson));
    if (typeof r === 'string') { ctx.json(res, 400, { error: r }); return true; }
    P2._updated = new Date().toISOString();
    atomicSave(ctx.DATA, ctx.ROOT, P2);
    ctx.json(res, 200, Object.assign({ ok: true }, r || {})); return true;
  }
  ctx.json(res, 404, { error: 'unknown gear planner call' }); return true;
}
module.exports = { handle, _t: { fitOf, resolvePlan, giranGet, slotStatus, mutate, entryOf, catalog, srcText, giranOffers, writeRecFiles, classPage, SLOTS } };
