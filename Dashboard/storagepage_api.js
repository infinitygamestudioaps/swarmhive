// STORAGE PAGE API (STORAGE-2026-10-13, owner: "Dagger1 must store EVERYTHING in the clan warehouse ... selectable", "everyone may give him all
// letters", "configure them to store things in their OWN warehouse if they are not in the clan", "everything must be configurable"; owner rule
// 17:0x: "nothing happens automatically unless you ask for it" = every automatic part is OFF until switched on).
// Loaded by server.js (one hook, BEFORE the key check like fundpage_api.js). Public (no secrets): /storagepage.js, /storagepage.css.
//   GET  /api/storage            { rules, rev, exists, broken, towns, clanLeader, letterItems: [{ id, name, icon }], parties: [{ leader, members: [{ name,
//                                  online, level, cls, town, clan, bag, bagAt, wh: swarm_state.stash, letters: Logs/letters_<name>.json, plan: summary,
//                                  eff: effective settings (same rules as swarm.js stashSettings) }] }] }
//   GET  /api/storage/plan?name= the last dry run Logs/stash_plan_<name>.json (deposit / keep / sell rows, summary, settings)
//   POST /api/storage { rules, rev? }   sanitized (storageSanitize: dest auto|clan|private, mode rules|all|off, auto boolean, trigger kind bag|weight|
//                                  supply|town + numbers, town one of the 11, item rules: id lists + regex lists that compile; letters); every other
//                                  key of the file (keep / deposit / keepNames / depositNames / _notes / _keepWhy) is KEPT; lock + rev check (409),
//                                  history copy (Scripts/data/history/stash_rules_<time>.json, last 50), atomic write (manual_guard.js), one line in
//                                  Logs/dashboard_commands.log.
// File: Scripts/data/stash_rules.json (env SWARM_STASHRULES_FILE overrides it: the tests use a scratch copy). The bots read it live at every check.
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const STATIC = { '/storagepage.js': 'application/javascript; charset=utf-8', '/storagepage.css': 'text/css; charset=utf-8' };
const TOWN_KEYS = ['Gludin', 'Gludio', 'Dion', 'Giran', 'Oren', 'Aden', 'Hunters', 'Heine', 'Goddard', 'Rune', 'Schuttgart'];
const TOWN_POS = { Giran: [83473, 148554], Gludin: [-80786, 150251], Gludio: [-12712, 122776], Dion: [15619, 143132], Oren: [82760, 53578], Aden: [147448, 25816],
  Hunters: [116589, 76268], Heine: [111381, 218981], Goddard: [147732, -56554], Rune: [43835, -47749], Schuttgart: [87126, -143520] };
const DESTS = ['auto', 'clan', 'private'], MODES = ['rules', 'all', 'off'], TRIGGERS = ['bag', 'weight', 'supply', 'town'];
const LETTER_IDS = [3875, 3876, 3877, 3878, 3879, 3880, 3881, 3882, 3883, 3884, 3885, 3886, 3887, 3888];   // = swarm.js STASH_LETTER_IDS
const TRIG_DEF = { kind: 'bag', above: 120, weightPct: 70, gapMin: 30 };                                   // = swarm.js STASH_TRIG_DEF (CONFIG.stash.above 120)
const BASE = { dest: 'private', auto: false, above: 120 };                                                 // = swarm.js CONFIG.stash (dest, auto, above)
const NAME_RE = /^[A-Za-z0-9_\-]{1,40}$/;

let G = null;
function guard(ctx) { if (!G) G = require(path.join(ctx.ROOT, 'docs', 'plan', 'tools', 'manual_guard.js')); return G; }
const rulesFile = (ctx) => process.env.SWARM_STASHRULES_FILE || ctx.stashRulesFile || path.join(ctx.DATA, 'stash_rules.json');
const sha = (t) => t ? crypto.createHash('sha1').update(t).digest('hex').slice(0, 16) : '';
const isoNow = () => new Date().toISOString();
const obj = (o) => (o && typeof o === 'object' && !Array.isArray(o) ? o : {});
const set = (v) => v !== undefined && v !== null && v !== '';

function readRules(ctx) {
  const F = rulesFile(ctx);
  let raw = ''; try { raw = fs.readFileSync(F, 'utf8'); } catch (e) { }
  let data = null; try { data = raw ? JSON.parse(raw.replace(/^﻿/, '')) : {}; } catch (e) { return { raw, rev: sha(raw), data: null, broken: e.message, exists: true }; }
  if (!data || typeof data !== 'object' || Array.isArray(data)) data = {};
  return { raw, rev: sha(raw), data, exists: !!raw };
}

// ------------------------------------------------------------------------------------------------------------------- effective settings
/** the same precedence as swarm.js stashSettings (STASH-PURE): chars.<name> > parties.<party> > defaults > old top-level dest > built-in */
function effective(rules, name, party, base) {
  const R = obj(rules), B = Object.assign({}, BASE, obj(base)), Df = obj(R.defaults), P = obj(obj(R.parties)[party]), C = obj(obj(R.chars)[name]);
  const L = [['character', C], ['party', P], ['default', Df]];
  const pick = (k, ok) => { for (const [src, o] of L) if (set(o[k]) && ok(o[k])) return { v: o[k], src }; return null; };
  const okDest = (v) => DESTS.includes(String(v).toLowerCase());
  const dest = pick('dest', okDest) || (set(R.dest) && okDest(R.dest) ? { v: R.dest, src: 'file default (old "dest")' } : { v: okDest(B.dest || '') ? B.dest : 'private', src: 'built-in' });
  const mode = pick('mode', v => MODES.includes(String(v))) || { v: 'rules', src: 'built-in' };
  const auto = pick('auto', v => typeof v === 'boolean') || { v: B.auto === true, src: 'built-in' };
  const town = pick('town', v => /^[A-Za-z][A-Za-z ]{1,19}$/.test(String(v))) || { v: 'Giran', src: 'built-in' };
  const trig = Object.assign({}, TRIG_DEF, Number(B.above) > 0 ? { above: Number(B.above) } : {}); let tsrc = 'built-in';
  L.slice().reverse().forEach(([src, o]) => {
    const t = obj(o.trigger);
    if (TRIGGERS.includes(t.kind)) { trig.kind = t.kind; tsrc = src; }
    ['above', 'weightPct', 'gapMin'].forEach(k => { const n = Number(t[k]); if (set(t[k]) && Number.isFinite(n) && n >= 0) trig[k] = k === 'weightPct' ? Math.min(100, Math.max(1, n)) : n; });
  });
  return { dest: String(dest.v).toLowerCase(), mode: String(mode.v), auto: !!auto.v, trigger: trig, town: String(town.v), src: { dest: dest.src, mode: mode.src, auto: auto.src, trigger: tsrc, town: town.src } };
}
/** clan only for clan members, everyone else its private warehouse (= swarm.js stashKindFor) */
function kindFor(dest, inClan) { const d = String(dest || 'private'); return d === 'private' ? 'private' : inClan ? 'clan' : 'private'; }

// ------------------------------------------------------------------------------------------------------------------- sanitize
/** the posted rules -> { ok, rules } | { ok: false, errors }. Unknown keys are kept (the item rules, notes); blank = removed = the next level decides. */
function storageSanitize(input, prev) {
  const errors = [], r = input && typeof input === 'object' && !Array.isArray(input) ? input : null;
  if (!r) return { ok: false, errors: ['rules must be an object'] };
  const out = JSON.parse(JSON.stringify(r));
  const ids = (v, where) => {
    if (!set(v)) return undefined;
    if (!Array.isArray(v)) { errors.push(`${where}: a list of item ids`); return undefined; }
    if (v.length > 500) { errors.push(`${where}: at most 500 ids`); return undefined; }
    const o = []; v.forEach(x => { const n = Number(x); if (Number.isInteger(n) && n > 0 && n < 1e7) { if (!o.includes(n)) o.push(n); } else errors.push(`${where}: "${String(x).slice(0, 20)}" is not an item id`); });
    return o;
  };
  const res = (v, where) => {
    if (!set(v)) return undefined;
    if (!Array.isArray(v)) { errors.push(`${where}: a list of names / patterns`); return undefined; }
    if (v.length > 200) { errors.push(`${where}: at most 200 patterns`); return undefined; }
    const o = [];
    v.forEach(x => { const s = String(x == null ? '' : x).trim(); if (!s) return; if (s.length > 120) { errors.push(`${where}: "${s.slice(0, 30)}…" longer than 120 characters`); return; } try { new RegExp(s, 'i'); } catch (e) { errors.push(`${where}: "${s.slice(0, 40)}" is not a valid pattern (${e.message})`); return; } if (!o.includes(s)) o.push(s); });
    return o;
  };
  /** one settings level (defaults / a party / a character) in place */
  const level = (o, where) => {
    if (!o || typeof o !== 'object' || Array.isArray(o)) { errors.push(`${where}: must be an object`); return {}; }
    if (set(o.dest)) { const d = String(o.dest).toLowerCase(); if (!DESTS.includes(d)) errors.push(`${where} destination: auto, clan or private`); else o.dest = d; } else delete o.dest;
    if (set(o.mode)) { if (!MODES.includes(String(o.mode))) errors.push(`${where} mode: rules, all or off`); } else delete o.mode;
    if (set(o.auto)) { if (typeof o.auto !== 'boolean') errors.push(`${where} automatic: true or false`); } else delete o.auto;
    if (set(o.town)) { if (!TOWN_KEYS.includes(String(o.town))) errors.push(`${where} town: one of ${TOWN_KEYS.join(', ')}`); } else delete o.town;
    if (set(o.trigger)) {
      const t = obj(o.trigger), nt = {};
      if (set(t.kind)) { if (TRIGGERS.includes(String(t.kind))) nt.kind = String(t.kind); else errors.push(`${where} trigger: bag, weight, supply or town`); }
      [['above', 1, 500], ['weightPct', 1, 100], ['gapMin', 0, 1440]].forEach(([k, lo, hi]) => {
        if (!set(t[k])) return; const n = Number(t[k]);
        if (!Number.isFinite(n) || n < lo || n > hi) errors.push(`${where} trigger ${k}: ${lo} to ${hi}`); else nt[k] = Math.round(n);
      });
      if (Object.keys(nt).length) o.trigger = nt; else delete o.trigger;
    } else delete o.trigger;
    ['keep', 'deposit'].forEach(k => { const v = ids(o[k], `${where} ${k}`); if (v === undefined) delete o[k]; else o[k] = v; });
    ['keepNames', 'depositNames'].forEach(k => { const v = res(o[k], `${where} ${k}`); if (v === undefined) delete o[k]; else o[k] = v; });
    return o;
  };
  if (set(out.dest)) { const d = String(out.dest).toLowerCase(); if (!DESTS.includes(d)) errors.push('old default destination "dest": auto, clan or private'); else out.dest = d; } else delete out.dest;
  ['keep', 'deposit'].forEach(k => { const v = ids(out[k], `global ${k}`); if (v === undefined) delete out[k]; else out[k] = v; });
  ['keepNames', 'depositNames'].forEach(k => { const v = res(out[k], `global ${k}`); if (v === undefined) delete out[k]; else out[k] = v; });
  out.defaults = level(obj(out.defaults) === out.defaults ? out.defaults : {}, 'defaults');
  ['parties', 'chars'].forEach(sec => {
    const S = obj(out[sec]); out[sec] = {};
    if (Object.keys(S).length > 1000) { errors.push(`${sec}: at most 1000`); return; }
    Object.keys(S).forEach(k => {
      if (!NAME_RE.test(k)) { errors.push(`${sec === 'chars' ? 'character' : 'party'} "${k.slice(0, 40)}": not a character name`); return; }
      const lv = level(S[k], `${sec === 'chars' ? '' : 'party '}${k}`);
      if (Object.keys(lv).length) out[sec][k] = lv;                       // an empty entry = the next level decides
    });
  });
  if (set(out.letters)) {
    const L = obj(out.letters), nl = {};
    Object.keys(L).filter(k => k.startsWith('_')).forEach(k => { nl[k] = L[k]; });
    nl.on = L.on === true;
    const to = String(L.to || 'clanleader');
    if (to === 'clanleader' || NAME_RE.test(to)) nl.to = to; else errors.push('letters receiver: "clanleader" or a character name');
    const li = ids(L.ids, 'letters items'); nl.ids = li && li.length ? li : LETTER_IDS.slice();
    nl.keep = L.keep === true;
    nl.except = Array.isArray(L.except) ? L.except.map(String).filter(n => { if (NAME_RE.test(n)) return true; errors.push(`letters never-list: "${n.slice(0, 30)}" is not a name`); return false; }) : [];
    if (set(L.gapMin)) { const n = Number(L.gapMin); if (!Number.isFinite(n) || n < 0 || n > 1440) errors.push('letters every (min): 0 to 1440'); else nl.gapMin = Math.round(n); }
    out.letters = nl;
  } else delete out.letters;
  // COLLECTOR 2026-10-14: { on, name ('' = the clan leader), town } (= swarm.js collectorMine)
  if (set(out.collector)) {
    const C = obj(out.collector), nc = { on: C.on === true, name: String(C.name || '').trim(), town: String(C.town || 'Giran') };
    if (nc.name && !NAME_RE.test(nc.name)) errors.push('collector: not a character name');
    if (!TOWN_KEYS.includes(nc.town)) errors.push('collector town: one of ' + TOWN_KEYS.join(', '));
    out.collector = nc;
  } else delete out.collector;
  // WHSELL 2026-10-14: never store (= swarm.js STASH-PURE stashNever): common = every "Common Item - ...", names = patterns, sell = sell them instead
  if (set(out.neverStore)) {
    const N = obj(out.neverStore), nn = {};
    nn.common = N.common === true; nn.sell = N.sell === true;
    const nm = res(N.names, 'never store'); nn.names = nm || [];
    out.neverStore = nn;
  } else delete out.neverStore;
  out._updated = isoNow();
  return errors.length ? { ok: false, errors: [...new Set(errors)] } : { ok: true, rules: out };
}

// ------------------------------------------------------------------------------------------------------------------- read
function townNear(x, y) { let best = '', bd = 6000; Object.keys(TOWN_POS).forEach(t => { const d = Math.hypot(TOWN_POS[t][0] - x, TOWN_POS[t][1] - y); if (d < bd) { bd = d; best = t; } }); return best; }
function cfgFresh(ctx) {
  try { return JSON.parse(fs.readFileSync(path.join(ctx.ROOT, 'swarm.config.json'), 'utf8').replace(/^﻿/, '')); } catch (e) { }
  try { return ctx.reloadCfg() || {}; } catch (e) { return {}; }
}
function clanLeader(ctx, cfg) {
  const cq = ctx.readJson(path.join(ctx.DATA, 'clan_quests.json'), null);
  return (cq && cq.clan && cq.clan.leader) || (cfg && cfg.clanLeader) || '';
}
function parties(ctx) { let K; try { K = require('./kamapage_api'); } catch (e) { K = require(path.join(ctx.ROOT, 'Dashboard', 'kamapage_api')); } return K.partyList(ctx); }
let itemNames = null;
function letterItems(ctx) {
  if (!itemNames) { itemNames = ctx.readJson(path.join(ctx.DIR || __dirname, 'data', 'items.json'), {}) || {}; }
  return LETTER_IDS.map(id => { const it = itemNames[id]; return { id, name: (it && it[0]) || `item ${id}`, icon: (it && it[1]) || '' }; });
}
function bagOf(ctx, name) {
  const b = ctx.readJson(path.join(ctx.LOGS, 'bag_' + name + '.json'), null);
  if (!b || !Array.isArray(b.items)) return { n: null, at: null, letters: 0 };
  const L = new Set(LETTER_IDS); let letters = 0; b.items.forEach(i => { if (L.has(Number(i.id))) letters += Math.max(1, Number(i.count) || 1); });
  return { n: b.items.length, at: b.at || null, letters };
}
function planSummary(ctx, name) {
  const p = ctx.readJson(path.join(ctx.LOGS, 'stash_plan_' + name + '.json'), null);
  return p ? { at: p.at, summary: p.summary || '', n: (p.deposit || []).length, bag: p.bag } : null;
}
function info(ctx) {
  const R = readRules(ctx), cfg = cfgFresh(ctx), rules = R.data || {};
  const states = {}; (ctx.readStates() || []).forEach(s => { states[s.name] = s; });
  const member = (n, party) => {
    const s = states[n] || {}, x = Number(s.x), y = Number(s.y), bag = bagOf(ctx, n);
    const clan = typeof s.clan === 'string' ? s.clan : (s.clan && s.clan.name) || '';
    const eff = effective(rules, n, party);
    return { name: n, online: s.ageSec != null && s.ageSec <= 90, ageSec: s.ageSec != null ? s.ageSec : null, level: s.level != null ? Number(s.level) : null, cls: s.cls || '',
      town: Number.isFinite(x) && Number.isFinite(y) && (x || y) ? townNear(x, y) : '', clan, bag: bag.n, bagAt: bag.at, letters: bag.letters, wh: s.stash || null,
      lettersState: ctx.readJson(path.join(ctx.LOGS, 'letters_' + n + '.json'), null), plan: planSummary(ctx, n), eff, kind: kindFor(eff.dest, !!clan) };
  };
  const P = parties(ctx).map(({ leader, names }) => ({ leader, members: names.map(n => member(n, leader)) }));
  return { file: path.basename(rulesFile(ctx)), exists: !!R.exists, rev: R.rev, broken: R.broken || null, rules, towns: TOWN_KEYS, clanLeader: clanLeader(ctx, cfg),
    letterItems: letterItems(ctx), parties: P, base: BASE, clanWh: clanWh(ctx, rules) };
}
const COMMON_RE = /^Common Item - /i;   // = swarm.js STASH_COMMON_RE
// CWHGROUPS 2026-10-14 (owner: "sort the clan warehouse: materials, crafting parts, weapons, armors, accessories, what grade, scrolls, event letters")
const GRADE_OF = ['NONE', 'D', 'C', 'B', 'A', 'S', 'S80', 'S84'];
const PART_RE = /(Part|Pattern|Fragment|Edge|Blade|Head|Design|Texture|Lining|Material|Gemstone|Chain|Wire|Shaft|Temper|Fabric|Stock|Piece|Guard|Hilt|Ornament|Lining|Cloth|Molding|Frame)s?$/i;
const ACC_SLOTS = ['neck', 'earring', 'ring', 'hair', 'hair2', 'hairall', 'bracelet', 'talisman', 'belt'];
let STASHI = null, GEARI = null;
function itemCat(ctx, id, name, it) {
  if (!STASHI) { try { STASHI = JSON.parse(fs.readFileSync(path.join(ctx.ROOT || path.join(__dirname, '..'), 'Scripts', 'data', 'stash_items.json'), 'utf8')); } catch (e) { STASHI = { materials: {} }; } }
  if (!GEARI) { try { const g = JSON.parse(fs.readFileSync(path.join(ctx.ROOT || path.join(__dirname, '..'), 'Scripts', 'data', 'gear_items.json'), 'utf8')); GEARI = g.items || g; } catch (e) { GEARI = {}; } }
  const n = String(name || ''), type = it && it[2], gi = GEARI[id];
  if ((id >= 3875 && id <= 3888) || /^L2Day - /i.test(n)) return 'letter';
  if (/^Recipe/i.test(n)) return 'recipe';
  if (type === 'Weapon') return (gi && gi.s === 'shield') || /Shield$|Buckler$|Sigil$/i.test(n) ? 'armor' : 'weapon';   // shields are 'Weapon' in the client data
  if (type === 'Armor') return (gi && ACC_SLOTS.includes(gi.s)) || /Necklace|Earring|Ring$|Bracelet|Talisman|Belt$/i.test(n) ? 'accessory' : 'armor';
  if (/Scroll|Blessed Scroll/i.test(n)) return 'scroll';
  if (/Potion|Soulshot|Spiritshot|Elixir|Herb|Arrow$|Bolt$|Tonic|Juice|Spirit Ore|Antidote|Bandage|Dressing|Remedy|Cure/i.test(n)) return 'use';
  if (/Life Stone|Seal Stone|Ancient Adena|Unrefined Jewel|Unrefinhed Ore/i.test(n)) return 'stone';
  if (STASHI.materials && STASHI.materials[id] !== undefined) return PART_RE.test(n) ? 'part' : 'material';
  if (PART_RE.test(n)) return 'part';
  return 'other';
}
/** WHSELL 2026-10-14: the clan warehouse as the clan leader last saw it (Logs/clan_state.json warehouse), one row per item id + enchant:
 *  { seenAt, seenBy, items: [{ id, name, icon, count, enchant, pieces, common, never }] } | null */
function clanWh(ctx, rules) {
  const st = ctx.readJson(path.join(ctx.LOGS, 'clan_state.json'), null), w = st && st.warehouse;
  if (!w || !Array.isArray(w.items)) return null;
  if (!itemNames) { itemNames = ctx.readJson(path.join(ctx.DIR || __dirname, 'data', 'items.json'), {}) || {}; }
  const N = obj(obj(rules).neverStore), pats = (Array.isArray(N.names) ? N.names : []).map(s => { try { return new RegExp(s, 'i'); } catch (e) { return null; } }).filter(Boolean);
  const by = {};
  w.items.forEach(i => {
    const id = Number(i.id), en = Number(i.enchant) || 0, k = id + '+' + en; if (!id) return;
    const nm = String(i.name || (itemNames[id] && itemNames[id][0]) || 'item ' + id);
    let gc = itemNames[id] && itemNames[id][3];
    if (/^Recipe/i.test(nm)) { const rc = STASHI && STASHI.recipes && STASHI.recipes[id]; const pg = rc && itemNames[rc[2]] && itemNames[rc[2]][3]; if (pg !== undefined && pg !== '') gc = pg; }   // SORT: a recipe has the grade of what it makes
    const r = by[k] = by[k] || { id, name: nm, icon: (itemNames[id] && itemNames[id][1]) || '', count: 0, enchant: en, pieces: 0, cat: itemCat(ctx, id, nm, itemNames[id]), grade: gc !== undefined && gc !== '' && GRADE_OF[Number(gc)] ? GRADE_OF[Number(gc)] : '' };
    r.count += Math.max(1, Number(i.count) || 1); r.pieces++;
  });
  const items = Object.keys(by).map(k => by[k]).map(r => Object.assign(r, { common: COMMON_RE.test(r.name), never: (N.common === true && COMMON_RE.test(r.name)) || pats.some(p => p.test(r.name)) }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.enchant - b.enchant);
  const pend = ctx.readJson(path.join(ctx.LOGS, 'whsell_pending.json'), null);   // WHSELL-FIX: taken out but not sold yet ("!whsell pending")
  return { seenAt: w.seenAt || null, seenBy: w.seenBy || '', items, pending: pend && pend.ids ? Object.keys(pend.ids).length : 0, pendingAt: (pend && pend.at) || null };
}
function plan(ctx, name) {
  if (!NAME_RE.test(String(name || ''))) return { code: 400, error: 'name?' };
  const p = ctx.readJson(path.join(ctx.LOGS, 'stash_plan_' + name + '.json'), null);
  if (!p) return { code: 404, error: `no dry run for ${name} yet (Logs/stash_plan_${name}.json) — press "Plan" first` };
  const row = (r) => ({ id: r.id, name: r.name, count: r.count, why: r.why, cat: r.cat });
  return { code: 200, ok: true, name, at: p.at, why: p.why, bag: p.bag, dest: p.dest, inClan: p.inClan, settings: p.settings || null, summary: p.summary,
    deposit: (p.deposit || []).map(row), keep: (p.keep || []).map(row), sell: (p.sell || []).map(row) };
}

// ------------------------------------------------------------------------------------------------------------------- write
function bad(code, error, extra) { return Object.assign({ code, error }, extra || {}); }
function summary(a, b) {
  const ch = [], f = (v) => v === undefined ? '-' : JSON.stringify(v);
  ['dest', 'defaults', 'letters'].forEach(k => { if (f(a[k]) !== f(b[k])) ch.push(`${k} ${f(b[k])}`); });
  const keys = (o) => Object.keys(o || {});
  ['parties', 'chars'].forEach(sec => new Set(keys(a[sec]).concat(keys(b[sec]))).forEach(k => { if (f((a[sec] || {})[k]) !== f((b[sec] || {})[k])) ch.push(`${sec === 'chars' ? '' : 'party '}${k} ${f((b[sec] || {})[k])}`); }));
  return ch.join('; ').slice(0, 1500) || 'no change';
}
function post(ctx, b) {
  if (!b || typeof b !== 'object') return bad(400, 'bad body');
  const F = rulesFile(ctx), Gd = guard(ctx), by = String(b.by || 'dashboard').slice(0, 40);
  fs.mkdirSync(path.dirname(F), { recursive: true });
  let result = null;
  try {
    Gd.withLock(F, () => {
      const R = readRules(ctx);
      if (R.broken) { result = bad(500, `${path.basename(F)} does not parse (${R.broken}) — fix or restore it from history/ first`); return; }
      if (b.rev !== undefined && b.rev !== null && String(b.rev) !== R.rev) { result = bad(409, 'the storage settings were changed meanwhile (another page or a tool) — reload and try again', { rev: R.rev, conflict: true }); return; }
      const s = storageSanitize(b.rules, R.data);
      if (!s.ok) { result = bad(400, s.errors.join('; '), { errors: s.errors }); return; }
      const hist = R.exists ? Gd.saveHistory(F, path.dirname(F), 50) : null;
      const txt = JSON.stringify(s.rules, null, 1) + '\n';
      Gd.atomicWrite(F, txt);
      try { fs.appendFileSync(path.join(ctx.LOGS, 'dashboard_commands.log'), `${isoNow()}\tstorage\tsave\t${by}: ${summary(R.data || {}, s.rules)}\r\n`); } catch (e) { }
      result = { code: 200, ok: true, rev: sha(txt), rules: s.rules, history: hist ? path.basename(hist) : null };
    }, { who: 'storage save' });
  } catch (e) { return bad(500, e.message); }
  return result;
}

/** WHSELL 2026-10-14: the Storage page's clan warehouse selection -> Logs/whsell_order.json (the clan leader runs it on "!whsell order";
 *  an order line holds only ~30 items). b = { items: [{ id, count: n | 'all' }], sell: true|false, by } */
function whsellOrder(ctx, b) {
  const L = Array.isArray(b && b.items) ? b.items : null;
  if (!L || !L.length) return bad(400, 'no items chosen');
  if (L.length > 500) return bad(400, 'at most 500 kinds at once');
  const items = [], errs = [];
  L.forEach(i => {
    const id = Number(i && i.id), c = i && i.count;
    if (!Number.isInteger(id) || id <= 0 || id >= 1e7) { errs.push(`"${String(i && i.id).slice(0, 20)}" is not an item id`); return; }
    if (c !== 'all' && !(Number.isInteger(Number(c)) && Number(c) > 0)) { errs.push(`item ${id}: count must be a whole number or "all"`); return; }
    const e = items.find(x => x.id === id);
    if (e) { e.count = e.count === 'all' || c === 'all' ? 'all' : e.count + Number(c); } else items.push({ id, count: c === 'all' ? 'all' : Number(c) });
  });
  if (errs.length) return bad(400, errs.slice(0, 5).join('; '), { errors: errs });
  const o = { at: isoNow(), by: String(b.by || 'dashboard').slice(0, 40), sell: b.sell !== false, items };
  const F = process.env.SWARM_WHSELL_FILE || path.join(ctx.LOGS, 'whsell_order.json');   // tests: a scratch file
  try { guard(ctx).atomicWrite(F, JSON.stringify(o, null, 1)); } catch (e) { try { fs.writeFileSync(F, JSON.stringify(o, null, 1)); } catch (e2) { return bad(500, e2.message); } }
  try { fs.appendFileSync(path.join(ctx.LOGS, 'dashboard_commands.log'), `${isoNow()}\tstorage\twhsell\t${o.by}: ${o.sell ? 'take out + sell' : 'take out'} ${items.length} kinds: ${items.map(i => i.id + ':' + i.count).join(',').slice(0, 800)}\r\n`); } catch (e) { }
  return { code: 200, ok: true, n: items.length, sell: o.sell, cmd: '!whsell order' };
}
async function handle(req, res, url, ctx) {
  const p = url.pathname;
  if (STATIC[p]) {
    res.writeHead(200, { 'Content-Type': STATIC[p], 'Cache-Control': 'no-cache' });
    res.end(fs.readFileSync(path.join(ctx.DIR || __dirname, path.basename(p))));
    return true;
  }
  if (p !== '/api/storage' && p !== '/api/storage/plan' && p !== '/api/storage/whsell') return false;
  if (!ctx.allowed(req, url)) { ctx.send(res, 401, 'text/plain; charset=utf-8', 'Access denied'); return true; }
  if (p === '/api/storage/whsell') {
    if (req.method !== 'POST') { ctx.json(res, 405, { error: 'POST' }); return true; }
    let b = {}; try { let t = ''; for await (const c of req) t += c; b = JSON.parse(t || '{}'); } catch (e) { ctx.json(res, 400, { error: 'bad JSON' }); return true; }
    const r = whsellOrder(ctx, b); const code = r.code; delete r.code; ctx.json(res, code, r); return true;
  }
  if (p === '/api/storage/plan') { const r = plan(ctx, url.searchParams.get('name')); const code = r.code; delete r.code; ctx.json(res, code, r); return true; }
  if (req.method === 'GET') { try { ctx.json(res, 200, info(ctx)); } catch (e) { ctx.json(res, 500, { error: e.message }); } return true; }
  if (req.method !== 'POST') { ctx.json(res, 405, { error: 'GET or POST' }); return true; }
  let b = {}; try { let t = ''; for await (const c of req) t += c; b = JSON.parse(t || '{}'); } catch (e) { ctx.json(res, 400, { error: 'bad JSON' }); return true; }
  try { const r = post(ctx, b) || bad(500, 'no result'); const code = r.code || 200; delete r.code; ctx.json(res, code, r); } catch (e) { ctx.json(res, 500, { error: e.message }); }
  return true;
}
module.exports = { handle, info, post, plan, whsellOrder, clanWh, readRules, rulesFile, storageSanitize, effective, kindFor, TOWN_KEYS, LETTER_IDS, DESTS, MODES, TRIGGERS };
