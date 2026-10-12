// QUESTS PAGE API (user 2026-10-12: "a page with all quests with the correct icons, descriptions, locations of all NPCs, enemies, droppers,
// hunting zones, rewards and requirements" + "low-level repeatable quests that give adena: spawn 10 chars to repeat them and trade all adena
// to another character"). Loaded by server.js with one hook BEFORE the key check (like clanranks_api.js); the API checks the key itself,
// the page files are public (no secrets):
//   /questpage.js, /questpage.css
//   GET  /api/quests                 { ok, meta, rows[] }          compact list (one row per quest)
//   GET  /api/quests/detail?id=<id>  { ok, quest, names, icons, areas, chars[] }   the full record + resolved names / icons / area polygons +
//                                     every own character's eligibility and progress for this quest
//   GET  /api/quests/chars           { ok, chars[] }               own characters (level / class / race / party) + their quest_state
//                                     summary + fits[] (ids of every quest they may take now)
//   GET  /api/quests/live[?id=<id>]  { ok, chars[], quest }      live progress per character (Dashboard/questlive_api.js, QUEST LIVE 2026-10-12)
//   GET  /api/quests/beginner        { ok, data, plan }            beginner gear chain (forum 78) + who should do what (2026-10-12)
//   GET  /api/quests/farm            { ok, cfg, meta, plan, stats[], names[] }
//   POST /api/quests/farm            body { on, collector, chars[], tradeAbove, keep, override{} } -> writes ONLY these fields of
//                                     Scripts/data/quest_farm.json (tmp + rename), meta / plan from the planner stay as they are
// Inputs (read-only): Scripts/data/quests_h5.json + quest_items_h5.json (docs/plan/tools/quest_extract.js), Dashboard/data/items.json
// (names + icons: icon = items[id][1], the gear page's lookup), Scripts/data/field_areas.json (area polygons), Logs/swarm_state_<Name>.json
// (level / class), Logs/quest_state_<Name>.json (written by the swarm.js quest engine: active quest, per-quest status, farm stats).
// Env overrides for tests: SWARM_QUESTS_FILE, SWARM_QUESTITEMS_FILE, SWARM_QUESTFARM_FILE, SWARM_FIELDAREAS_FILE.
'use strict';
const fs = require('fs'), path = require('path');
const STATIC = { '/questpage.js': 'application/javascript; charset=utf-8', '/questpage.css': 'text/css; charset=utf-8',
  '/questlive.js': 'application/javascript; charset=utf-8', '/questlive.css': 'text/css; charset=utf-8' };   // QUEST LIVE 2026-10-12 (Dashboard/questlive*.js)

// ---------------------------------------------------------------- class id -> L2J ClassId enum name (requirements.classes use these) + race
const CLASS_ENUM = { 0: 'fighter', 1: 'warrior', 2: 'gladiator', 3: 'warlord', 4: 'knight', 5: 'paladin', 6: 'darkAvenger', 7: 'rogue', 8: 'treasureHunter', 9: 'hawkeye',
  10: 'mage', 11: 'wizard', 12: 'sorceror', 13: 'necromancer', 14: 'warlock', 15: 'cleric', 16: 'bishop', 17: 'prophet', 18: 'elvenFighter', 19: 'elvenKnight',
  20: 'templeKnight', 21: 'swordSinger', 22: 'elvenScout', 23: 'plainsWalker', 24: 'silverRanger', 25: 'elvenMage', 26: 'elvenWizard', 27: 'spellsinger',
  28: 'elementalSummoner', 29: 'oracle', 30: 'elder', 31: 'darkFighter', 32: 'palusKnight', 33: 'shillienKnight', 34: 'bladedancer', 35: 'assassin',
  36: 'abyssWalker', 37: 'phantomRanger', 38: 'darkMage', 39: 'darkWizard', 40: 'spellhowler', 41: 'phantomSummoner', 42: 'shillienOracle', 43: 'shillenElder',
  44: 'orcFighter', 45: 'orcRaider', 46: 'destroyer', 47: 'orcMonk', 48: 'tyrant', 49: 'orcMage', 50: 'orcShaman', 51: 'overlord', 52: 'warcryer',
  53: 'dwarvenFighter', 54: 'scavenger', 55: 'bountyHunter', 56: 'artisan', 57: 'warsmith', 88: 'duelist', 89: 'dreadnought', 90: 'phoenixKnight',
  91: 'hellKnight', 92: 'sagittarius', 93: 'adventurer', 94: 'archmage', 95: 'soultaker', 96: 'arcanaLord', 97: 'cardinal', 98: 'hierophant', 99: 'evaTemplar',
  100: 'swordMuse', 101: 'windRider', 102: 'moonlightSentinel', 103: 'mysticMuse', 104: 'elementalMaster', 105: 'evaSaint', 106: 'shillienTemplar',
  107: 'spectralDancer', 108: 'ghostHunter', 109: 'ghostSentinel', 110: 'stormScreamer', 111: 'spectralMaster', 112: 'shillienSaint', 113: 'titan',
  114: 'grandKhavatari', 115: 'dominator', 116: 'doomcryer', 117: 'fortuneSeeker', 118: 'maestro', 123: 'maleSoldier', 124: 'femaleSoldier', 125: 'trooper',
  126: 'warder', 127: 'berserker', 128: 'maleSoulbreaker', 129: 'femaleSoulbreaker', 130: 'arbalester', 131: 'doombringer', 132: 'maleSoulhound',
  133: 'femaleSoulhound', 134: 'trickster', 135: 'inspector', 136: 'judicator' };
function raceOf(cid) {
  const c = Number(cid);
  if (!isFinite(c)) return '';
  if (c <= 17 || (c >= 88 && c <= 98)) return 'HUMAN';
  if (c <= 30 || (c >= 99 && c <= 105)) return 'ELF';
  if (c <= 43 || (c >= 106 && c <= 112)) return 'DARK_ELF';
  if (c <= 52 || (c >= 113 && c <= 116)) return 'ORC';
  if (c <= 57 || c === 117 || c === 118) return 'DWARF';
  if (c >= 123 && c <= 136) return 'KAMAEL';
  return '';
}

// ---------------------------------------------------------------- cached data
const C = { q: null, qAt: 0, qi: null, qiAt: 0, items: null, itemsAt: 0, areas: null, areasAt: 0, rows: null, statesAt: 0, states: null };
const F = (ctx) => ({
  quests: process.env.SWARM_QUESTS_FILE || path.join(ctx.DATA, 'quests_h5.json'),
  qitems: process.env.SWARM_QUESTITEMS_FILE || path.join(ctx.DATA, 'quest_items_h5.json'),
  farm: process.env.SWARM_QUESTFARM_FILE || path.join(ctx.DATA, 'quest_farm.json'),
  areas: process.env.SWARM_FIELDAREAS_FILE || path.join(ctx.DATA, 'field_areas.json'),
  items: path.join(ctx.DIR || __dirname, 'data', 'items.json'),
});
const mtime = (f) => { try { return fs.statSync(f).mtimeMs; } catch (e) { return 0; } };
const readRaw = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch (e) { return d; } };
function cached(key, file) {
  const m = mtime(file);
  if (!C[key] || C[key + 'At'] !== m) { C[key] = readRaw(file, null); C[key + 'At'] = m; if (key === 'q') C.rows = null; }
  return C[key];
}
const quests = (ctx) => cached('q', F(ctx).quests);
const qItems = (ctx) => cached('qi', F(ctx).qitems);
const itemsDb = (ctx) => cached('items', F(ctx).items) || {};
function areaIndex(ctx) {
  const f = F(ctx).areas, m = mtime(f);
  if (C.areas && C.areasAt === m) return C.areas;
  const j = readRaw(f, null), idx = {};
  const regs = j && j.regions ? (Array.isArray(j.regions) ? j.regions : Object.values(j.regions)) : [];
  regs.forEach(r => (r.areas || []).forEach(a => {
    const P = a.poly || [], step = Math.max(1, Math.ceil(P.length / 60));
    idx[a.id] = { id: a.id, name: a.name, region: r.id, regionName: r.name, center: a.center, levelRange: a.levelRange, poly: P.filter((p, i) => i % step === 0) };
  }));
  C.areas = idx; C.areasAt = m;
  return idx;
}
const itemName = (ctx, id) => { const r = itemsDb(ctx)[id]; return r ? r[0] : null; };
const itemIcon = (ctx, id) => { const r = itemsDb(ctx)[id]; return r && r[1] ? r[1] : null; };

// ---------------------------------------------------------------- reward / adena text
function adenaText(a) {
  if (a == null) return '';
  if (typeof a === 'number') return a > 0 ? fmt(a) : '';
  if (typeof a !== 'object') return String(a);
  const parts = [];
  (a.perItem || []).forEach(p => parts.push(`${fmt(p.each)}/item`));
  if (a.base) parts.push(`+${fmt(a.base)} base`);
  if (a.bonus && a.bonus.adena) parts.push(`+${fmt(a.bonus.adena)} at ${a.bonus.min}+`);
  if (Array.isArray(a.range)) parts.push(`${fmt(a.range[0])}-${fmt(a.range[1])}`);
  if (a.amount) parts.push(`${fmt(a.amount)}${a.chance ? ` (${a.chance}%)` : ''}`);
  return parts.length ? parts.join(' ') : (a.raw ? 'formula' : '');
}
function fmt(n) { n = Number(n) || 0; return n >= 1e6 ? (Math.round(n / 1e5) / 10) + 'M' : n >= 1e4 ? Math.round(n / 1000) + 'k' : String(Math.round(n)); }
/** a number for sorting: a fixed amount, or per-item x 10 + bonus + base */
function adenaValue(a) {
  if (a == null) return 0;
  if (typeof a === 'number') return a;
  if (typeof a !== 'object') return 0;
  let v = 0;
  (a.perItem || []).forEach(p => { v += (Number(p.each) || 0) * 10; });
  if (a.base) v += Number(a.base) || 0;
  if (a.bonus && a.bonus.adena) v += Number(a.bonus.adena) || 0;
  if (Array.isArray(a.range)) v += ((Number(a.range[0]) || 0) + (Number(a.range[1]) || 0)) / 2;
  if (a.amount) v += (Number(a.amount) || 0) * ((Number(a.chance) || 100) / 100);
  return v;
}
function questAdena(q) {
  const R = q.rewards || {}, all = [].concat(R.final || [], R.turnIns || []);
  let best = null, bestV = -1;
  all.forEach(r => { const v = adenaValue(r.adena); if (r.adena != null && v > bestV) { bestV = v; best = r.adena; } });
  return { text: adenaText(best), value: Math.max(0, bestV), turnIn: !!(R.turnIns && R.turnIns.some(r => r.adena != null)) };
}
function rewardItems(ctx, q) {
  const R = q.rewards || {}, out = [], seen = {};
  [].concat(R.final || [], R.turnIns || []).forEach(r => (r.items || []).forEach(it => {
    if (seen[it.id] || out.length >= 4) return; seen[it.id] = 1;
    out.push({ id: it.id, name: it.name || itemName(ctx, it.id), icon: itemIcon(ctx, it.id) });
  }));
  return out;
}

// ---------------------------------------------------------------- list
function reqSummary(q) {
  const r = q.requirements || {}, out = {};
  ['races', 'notRaces', 'classes', 'notClasses', 'categories'].forEach(k => { if (r[k] && r[k].length) out[k] = r[k]; });
  if (r.quests && r.quests.length) out.quests = r.quests.map(x => ({ id: x.id, need: x.need }));
  if (r.items && r.items.length) out.items = r.items.map(x => x.id);
  ['noble', 'clan', 'subclass'].forEach(k => { if (r[k]) out[k] = r[k]; });
  return out;
}
function listRows(ctx) {
  const Q = quests(ctx);
  if (!Q) return null;
  if (C.rows) return C.rows;
  C.rows = Object.values(Q.quests || {}).map(q => {
    const st = (q.startNpcs || [])[0] || {}, ad = questAdena(q);
    return { id: q.id, name: q.name, type: q.type, endless: !!q.endless, lmin: q.level ? q.level.min : null, lmax: q.level ? q.level.max : null,
      req: reqSummary(q), adena: ad.text, adenaV: ad.value, turnIn: ad.turnIn,
      exp: Math.max(0, ...[].concat((q.rewards || {}).final || [], (q.rewards || {}).turnIns || []).map(r => Number(r.exp) || 0)),
      npc: st.name || '', npcId: st.id || null, town: st.town || st.region || '', parse: q.parse ? q.parse.status : '',
      drops: (q.drops || []).length, spawns: (q.spawns || []).length, steps: (q.steps || []).length,
      rewards: rewardItems(ctx, q), clientType: q.clientType || null };
  }).sort((a, b) => (a.lmin || 0) - (b.lmin || 0) || a.id - b.id);
  return C.rows;
}

// ---------------------------------------------------------------- characters + eligibility
function readState(ctx, name) { if (!/^[A-Za-z0-9_-]+$/.test(String(name || ''))) return null; return readRaw(path.join(ctx.LOGS, `quest_state_${name}.json`), null); }
function charList(ctx) {
  if (C.states && Date.now() - C.statesAt < 8000) return C.states;
  let st = [];
  try { st = ctx.readStates ? ctx.readStates() : []; } catch (e) { st = []; }
  const byName = {};
  st.forEach(s => { if (s && s.name) byName[s.name] = { name: s.name, level: Number(s.level) || 0, classId: s.classId != null ? Number(s.classId) : null, cls: s.cls || '', party: s.party || s.leader || '', ageSec: s.ageSec, online: s.ageSec != null && s.ageSec <= 60 }; });
  // characters that only have a quest_state file (e.g. state file missing)
  try { fs.readdirSync(ctx.LOGS).forEach(f => { const m = f.match(/^quest_state_([A-Za-z0-9_-]+)\.json$/); if (m && !byName[m[1]]) { const q = readState(ctx, m[1]) || {}; byName[m[1]] = { name: m[1], level: Number(q.level) || 0, classId: q.classId != null ? Number(q.classId) : null, cls: '', party: '', online: false }; } }); } catch (e) { }
  const out = Object.values(byName).map(c => {
    const q = readState(ctx, c.name) || {};
    if (!c.level && q.level) c.level = Number(q.level);
    if (c.classId == null && q.classId != null) c.classId = Number(q.classId);
    c.race = q.race || raceOf(c.classId);
    c.classEnum = CLASS_ENUM[c.classId] || '';
    c.qstate = q;
    return c;
  }).sort((a, b) => String(a.party).localeCompare(String(b.party)) || a.name.localeCompare(b.name));
  C.states = out; C.statesAt = Date.now();
  return out;
}
const lc = (s) => String(s || '').toLowerCase();
/** -> { ok: 'yes' | 'no' | 'maybe', why } for one quest + one character (c from charList) */
function eligible(q, c) {
  const why = [], maybe = [];
  const lv = Number(c.level) || 0, L = q.level || {};
  if (L.min != null && lv < L.min) why.push(`level ${lv} < ${L.min}`);
  if (L.max != null && lv > L.max) why.push(`level ${lv} > ${L.max}`);
  const r = q.requirements || {}, race = c.race || '';
  if (r.races && r.races.length) { if (!race) maybe.push('race unknown'); else if (!r.races.includes(race)) why.push(`race ${race.toLowerCase()} (needs ${r.races.join('/').toLowerCase()})`); }
  if (r.notRaces && r.notRaces.length && race && r.notRaces.includes(race)) why.push(`not for ${race.toLowerCase()}`);
  const ce = lc(c.classEnum);
  if (r.classes && r.classes.length) { if (!ce) maybe.push('class unknown'); else if (!r.classes.some(x => lc(x) === ce)) why.push(`class (needs ${r.classes.slice(0, 4).join('/')}${r.classes.length > 4 ? '…' : ''})`); }
  if (r.notClasses && r.notClasses.length && ce && r.notClasses.some(x => lc(x) === ce)) why.push('not for this class');
  if (r.categories && r.categories.length) {
    const cid = Number(c.classId), cat = r.categories;
    // the simple ones are decided here, the others are only shown
    const firstJob = [0, 10, 18, 25, 31, 38, 44, 49, 53, 123, 124].includes(cid);
    if (cat.includes('FIRST_CLASS_GROUP') && cat.length === 1 && isFinite(cid) && !firstJob && !(cid >= 1 && cid <= 57) && !(cid >= 125 && cid <= 126)) why.push('needs a 1st class');
    else maybe.push(`class group ${cat.join('/').toLowerCase()}`);
  }
  (r.quests || []).forEach(p => {
    const s = (c.qstate && c.qstate.quests && c.qstate.quests[String(p.id)]) || null;
    if (p.need === 'completed') { if (!s || s.status !== 'done') maybe.push(`quest ${p.id} done first`); }
    else if (p.need === 'started') { if (!s) maybe.push(`quest ${p.id} started`); }
  });
  if (r.items && r.items.length) maybe.push(`item${r.items.length > 1 ? 's' : ''} ${r.items.map(i => i.name || i.id).join(', ')}`);
  if (r.noble) maybe.push('noblesse');
  if (r.clan) maybe.push('clan');
  if (r.subclass) maybe.push('subclass');
  const done = c.qstate && c.qstate.quests && c.qstate.quests[String(q.id)];
  if (done && done.status === 'done' && q.type === 'one-time') why.push('already done');
  if (why.length) return { ok: 'no', why: why.join('; ') };
  if (maybe.length) return { ok: 'maybe', why: maybe.join('; ') };
  return { ok: 'yes', why: '' };
}
function charSummary(c) {
  const q = c.qstate || {}, a = q.active || null, qs = q.quests || {};
  return { name: c.name, level: c.level, classId: c.classId, cls: c.cls, race: c.race, party: c.party, online: !!c.online,
    active: a ? { id: a.id, name: a.name, mode: a.mode, phase: a.phase, runs: a.runs, repeat: a.repeat, step: a.step, msg: a.msg, need: a.need || [], farm: !!a.farm, phaseAt: a.phaseAt, target: a.target || null } : null,
    done: Object.keys(qs).filter(k => qs[k] && qs[k].status === 'done').length, runs: Object.values(qs).reduce((s, x) => s + (Number(x && x.runs) || 0), 0),
    farm: q.farm || null, at: q.at || null };
}
function charsOut(ctx) {
  const Q = quests(ctx), all = Q ? Object.values(Q.quests || {}) : [];
  return charList(ctx).map(c => Object.assign(charSummary(c), { fits: all.filter(q => eligible(q, c).ok !== 'no').map(q => q.id) }));
}

// ---------------------------------------------------------------- detail
function detail(ctx, id) {
  const Q = quests(ctx); if (!Q) return { ok: false, error: 'Scripts/data/quests_h5.json missing — run: node docs/plan/tools/quest_extract.js' };
  const q = (Q.quests || {})[String(id)];
  if (!q) return { ok: false, error: `no quest ${id}` };
  const names = {}, icons = {}, qi = (qItems(ctx) || {}).items || {};
  (q.npcs || []).concat(q.startNpcs || []).forEach(n => { names[n.id] = n.name; });
  (q.monsters || []).forEach(m => { names[m.id] = m.name; });
  (q.spawns || []).forEach(s => { if (s.npc && s.name) names[s.npc] = s.name; });
  const addItem = (iid) => { if (iid == null) return; const k = String(iid); if (icons[k]) return; const rec = (q.items || []).find(i => Number(i.id) === Number(iid));
    icons[k] = { name: (rec && rec.name) || itemName(ctx, iid) || (qi[k] && qi[k].name) || `item ${iid}`, icon: (rec && rec.icon) || itemIcon(ctx, iid) || (qi[k] && qi[k].icon) || null,
      questItem: !!((rec && rec.questItem) || (qi[k] && qi[k].questItem)), otherQuests: qi[k] ? (qi[k].quests || []).filter(x => Number(x.id) !== Number(q.id)).slice(0, 8).map(x => ({ id: x.id, name: x.name })) : [] }; };
  (q.items || []).forEach(i => addItem(i.id));
  (q.drops || []).forEach(d => addItem(d.item));
  (q.transitions || []).forEach(t => { (t.gives || []).forEach(g => addItem(g.id)); (t.takes || []).forEach(g => addItem(g.id)); if (t.trigger && t.trigger.needItems) t.trigger.needItems.forEach(addItem); if (t.trigger && t.trigger.needCounts) t.trigger.needCounts.forEach(n => addItem(n.id)); });
  const R = q.rewards || {};
  [].concat(R.final || [], R.turnIns || [], R.steps || []).forEach(r => { (r.items || []).forEach(i => addItem(i.id)); (r.takes || []).forEach(i => addItem(i.id)); (r.adena && r.adena.perItem || []).forEach(p => (p.items || []).forEach(addItem)); });
  ((q.requirements || {}).items || []).forEach(i => addItem(i.id));
  addItem(57);
  // hunting areas with polygons
  const AI = areaIndex(ctx), areas = {};
  (q.monsters || []).forEach(m => (m.areas || []).forEach(a => { if (a.area && AI[a.area] && !areas[a.area]) areas[a.area] = AI[a.area]; }));
  const chars = charList(ctx).map(c => {
    const e = eligible(q, c), s = (c.qstate && c.qstate.quests && c.qstate.quests[String(q.id)]) || null, a = c.qstate && c.qstate.active;
    return Object.assign(charSummary(c), { elig: e.ok, why: e.why, status: s, activeHere: !!(a && Number(a.id) === Number(q.id)) });
  });
  return { ok: true, quest: q, names, icons, areas, chars, adena: questAdena(q) };
}

// ---------------------------------------------------------------- farm
const FARM_DEF = { on: false, collector: '', chars: [], tradeAbove: 200000, keep: 20000, override: {} };
function farmCfg(j) {
  const o = Object.assign({}, FARM_DEF);
  if (j && typeof j === 'object') ['on', 'collector', 'chars', 'tradeAbove', 'keep', 'override'].forEach(k => { if (j[k] !== undefined) o[k] = j[k]; });
  return o;
}
function farmGet(ctx) {
  const j = readRaw(F(ctx).farm, null) || {};
  const cfg = farmCfg(j), list = charList(ctx);
  const names = list.map(c => c.name);
  const stats = (cfg.chars || []).map(n => {
    const c = list.find(x => x.name === n) || { name: n, qstate: readState(ctx, n) || {} };
    const q = c.qstate || {}, f = q.farm || null, a = q.active || null;
    const since = f && Date.parse(f.since || '') || 0, hrs = since ? Math.max(0.05, (Date.now() - since) / 3600e3) : 0;
    return { name: n, level: c.level || q.level || null, online: !!c.online, quest: f ? f.quest : (a && a.farm ? a.id : null), questName: a && a.farm ? a.name : null,
      phase: a && a.farm ? a.phase : null, msg: a && a.farm ? a.msg : null, since: f ? f.since : null, adena: f ? Number(f.adena) || 0 : 0,
      adenaHour: f && hrs ? Math.round((Number(f.adena) || 0) / hrs) : 0, runs: f ? Number(f.runs) || 0 : 0, traded: f ? Number(f.traded) || 0 : 0, lastTrade: f ? f.lastTrade || null : null, on: f ? !!f.on : false };
  });
  return { ok: true, cfg, meta: j.meta || null, plan: j.plan || null, stats, names, file: path.basename(F(ctx).farm) };
}
const NAME_RE = /^[A-Za-z0-9_-]{1,32}$/;
function farmValidate(b) {
  const o = {};
  if (!b || typeof b !== 'object') return { error: 'body must be an object' };
  if (b.on !== undefined) o.on = !!b.on;
  if (b.collector !== undefined) { const c = String(b.collector || ''); if (c && !NAME_RE.test(c)) return { error: 'collector: bad name' }; o.collector = c; }
  if (b.chars !== undefined) { if (!Array.isArray(b.chars)) return { error: 'chars must be a list' }; const L = [...new Set(b.chars.map(String))]; if (L.some(n => !NAME_RE.test(n))) return { error: 'chars: bad name' }; if (L.length > 60) return { error: 'chars: max 60' }; o.chars = L; }
  for (const k of ['tradeAbove', 'keep']) if (b[k] !== undefined) { const n = Math.round(Number(b[k])); if (!isFinite(n) || n < 0 || n > 2e9) return { error: `${k}: a number 0..2000000000` }; o[k] = n; }
  if (b.override !== undefined) {
    if (!b.override || typeof b.override !== 'object' || Array.isArray(b.override)) return { error: 'override must be an object { Name: questId }' };
    const ov = {}; for (const [k, v] of Object.entries(b.override)) { if (!NAME_RE.test(k)) return { error: 'override: bad name' }; if (v === null || v === '' || v === 0) continue; const n = Number(v); if (!Number.isInteger(n) || n <= 0) return { error: `override ${k}: quest id` }; ov[k] = n; }
    o.override = ov;
  }
  if (o.collector && o.chars && o.chars.includes(o.collector)) return { error: 'the collector cannot also be a farm character' };
  return { ok: o };
}
function farmPost(ctx, b) {
  const v = farmValidate(b); if (v.error) return { code: 400, body: { error: v.error } };
  const file = F(ctx).farm;
  const cur = readRaw(file, null) || {};
  const next = Object.assign({}, cur, v.ok);
  ['on', 'collector', 'chars', 'tradeAbove', 'keep', 'override'].forEach(k => { if (next[k] === undefined) next[k] = FARM_DEF[k]; });
  if (next.collector && (next.chars || []).includes(next.collector)) return { code: 400, body: { error: 'the collector cannot also be a farm character' } };
  next.updated = new Date().toISOString(); next.updatedBy = 'dashboard';
  // field order: user fields first, planner data after
  const order = {}; ['on', 'collector', 'chars', 'tradeAbove', 'keep', 'override', 'updated', 'updatedBy'].forEach(k => { order[k] = next[k]; });
  Object.keys(next).forEach(k => { if (!(k in order)) order[k] = next[k]; });
  const tmp = file + '.tmp' + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(order, null, 1));
  fs.renameSync(tmp, file);
  return { code: 200, body: Object.assign({ saved: true }, farmGet(ctx)) };
}

// ---------------------------------------------------------------- beginner gear (forum topic 78, 2026-10-12)
// GET /api/quests/beginner { ok, data, plan: { rows, summary } }: Scripts/data/beginner_gear.json (docs/plan/tools/beginner_gear.js) + the live plan
// per character (Dashboard/beginnergear_logic.js: level / class / gear from Logs/swarm_state_<Name>.json, quest 174 done from quest_state).
// Env for tests: SWARM_BEGINNER_FILE.
function beginnerGet(ctx) {
  const BL = require('./beginnergear_logic.js');
  const data = cached('bg', process.env.SWARM_BEGINNER_FILE || path.join(ctx.DATA, 'beginner_gear.json'));
  if (!data) return { ok: false, error: 'Scripts/data/beginner_gear.json missing — run: node docs/plan/tools/beginner_gear.js' };
  const ex = cached('exp', path.join(ctx.DATA, 'exp_table.json')) || {}, bar = {};
  (ex.levels || []).forEach(r => { bar[r.level] = r.toNext; });
  const gf = path.join(ctx.DATA, 'dp', 'gear_db.json'), gm = mtime(gf);
  if (!C.gstat || C.gstatAt !== gm) {
    const g = readRaw(gf, null) || {}, by = {};
    (Array.isArray(g.items) ? g.items : Object.values(g.items || {})).forEach(i => { if (i && i.name && !by[i.name]) by[i.name] = i.stats || {}; });
    C.gstat = by; C.gstatAt = gm;
  }
  let st = []; try { st = ctx.readStates ? ctx.readStates() : []; } catch (e) { st = []; }
  const chars = st.filter(s => s && s.name).map(s => { const q = readState(ctx, s.name) || {};
    return { name: s.name, level: Number(s.level) || 0, classId: s.classId, cls: s.cls || '', party: s.party || '', gear: s.gear || {}, quests: q.quests || {}, online: s.ageSec != null && s.ageSec <= 60 }; });
  const plan = BL.planAll(chars, data, { expToNext: (l) => bar[l] || 0, itemStats: (n) => C.gstat[n] || null });
  plan.rows.forEach(r => { const c = chars.find(x => x.name === r.name); r.online = !!(c && c.online); });
  return { ok: true, data, plan };
}

// ---------------------------------------------------------------- server hook
async function readBody(req, ctx) { if (ctx.body) return ctx.body(req); let b = ''; for await (const c of req) b += c; return JSON.parse(b || '{}'); }
async function handle(req, res, url, ctx) {
  const p = url.pathname;
  if (STATIC[p]) {
    try { ctx.send(res, 200, STATIC[p], fs.readFileSync(path.join(ctx.DIR || __dirname, p.slice(1)))); } catch (e) { ctx.send(res, 404, 'text/plain; charset=utf-8', 'not found'); }
    return true;
  }
  if (p !== '/api/quests' && !p.startsWith('/api/quests/')) return false;
  if (!ctx.allowed(req, url)) { ctx.json(res, 401, { error: 'key needed' }); return true; }
  try {
    if (p === '/api/quests') {
      const rows = listRows(ctx);
      if (!rows) return ctx.json(res, 200, { ok: false, error: 'Scripts/data/quests_h5.json missing — run: node docs/plan/tools/quest_extract.js' }), true;
      const Q = quests(ctx);
      ctx.json(res, 200, { ok: true, meta: { generated: Q.meta && Q.meta.generated, coverage: Q.meta && Q.meta.coverage, notes: Q.meta && Q.meta.notes }, rows });
      return true;
    }
    if (p === '/api/quests/detail') { const id = url.searchParams.get('id'); const d = detail(ctx, id); ctx.json(res, d.ok ? 200 : 404, d); return true; }
    if (p === '/api/quests/chars') { ctx.json(res, 200, { ok: true, chars: charsOut(ctx) }); return true; }
    if (p === '/api/quests/beginner') { const d = beginnerGet(ctx); ctx.json(res, d.ok ? 200 : 404, d); return true; }   // BEGINNER GEAR 2026-10-12
    if (p === '/api/quests/live') { const d = require('./questlive_api.js').live(ctx, url.searchParams.get('id')); ctx.json(res, d.ok ? 200 : (d.code || 404), d); return true; }   // QUEST LIVE 2026-10-12
    if (p === '/api/quests/farm') {
      if (req.method === 'POST') { const r = farmPost(ctx, await readBody(req, ctx)); ctx.json(res, r.code, r.body); return true; }
      ctx.json(res, 200, farmGet(ctx)); return true;
    }
    ctx.json(res, 404, { error: 'unknown quests endpoint' });
  } catch (e) { ctx.json(res, 500, { error: e.message }); }
  return true;
}
module.exports = { handle, listRows, detail, charsOut, beginnerGet, farmGet, farmPost, farmValidate, eligible, raceOf, CLASS_ENUM, adenaText, adenaValue,
  _reset: () => { Object.keys(C).forEach(k => { C[k] = k.endsWith('At') ? 0 : null; }); } };
