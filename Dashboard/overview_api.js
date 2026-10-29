// OVERVIEW 2026-10-24 (owner: "a complete overview, compact with animation, icons and most important of all statistics for all parties and
// characters, experience, adena, everything so we can see when they level up, what they make per hour, what their cost is"): GET /api/overview
// Read only, except its own recorder:
//   - every 60 s one line per character -> Logs/overview_<yyyy-mm-dd>.tsv  (at sec, name, party, level, total exp, adena, dead, online, kills/h)
//     kept in memory for 26 h and read back after a dashboard restart, so the rates survive restarts (the bots' own expHour is 60 min, in memory).
//   - deaths = a sample that turns dead after one that was alive (60 s grain; a death + res inside one minute is missed).
// Sources joined in: live state (level, exp %, adena, activity, expHour), Dashboard/levelEta.js (next level-up), lootpage_api.query (loot worth),
// Logs/supply_use_<Name>.json x data/item_prices.json (shots / potions / ore used), Logs/gear_upgrades.log + Logs/pshop_buys.log (gear / shop buys).
// Profit = wallet change + loot worth (items count at shop value until sold); costs are already inside the wallet change and shown for info.
// OVDRILL-2026-10-29 (owner: "19 deaths in the last hour. But I don't know who keeps dying I need a report ... click the gold button and SEE what
// all of these values comes from"): GET /api/overview?hours=1|24&detail=deaths|adena|loot|costs = the rows behind a tile, from the SAME build
// as the cached tile (R.det), so they add up to it. Deaths = merged (one death = same character within 90 s, a revive closes it):
//   recorder dead edges + Logs/swarm_buffs.log "[Name] died — buffs ..." + Logs/intent_<Name>.log "-> escape FAIL: died" / "revived: alive again"
//   (the 60 s samples alone missed most: a res inside a minute). Killer = the last "self-defence: X is hitting me" / "RAID BOSS X attacks us"
//   line before the death. Logs are read as tails, incrementally (offset per file), memo 30 s.
'use strict';
const fs = require('fs'), path = require('path');
const LE = require('./levelEta.js');

const KEEP_MS = 26 * 3600000, EVERY_MS = 60000;
const R = { ctx: null, ring: new Map(), deaths: new Map(), started: 0, cache: new Map(), costCache: { key: '', v: null },
  dinfo: new Map(), tails: new Map(), dev: new Map(), hits: new Map(), dscanAt: 0, det: new Map() };   // OVDRILL-2026-10-29
const day = (t) => new Date(t).toISOString().slice(0, 10);
const num = (v) => (v == null || v === '' || isNaN(+v) ? null : +v);

function totalExp(level, pct) {
  level = num(level); pct = num(pct); if (!(level > 0) || pct == null) return null;
  const a = LE.expTotal(level), b = LE.expTotal(level + 1);
  return a == null ? null : Math.round(a + (b != null ? (b - a) * pct / 100 : 0));
}
function push(name, s) {
  let a = R.ring.get(name); if (!a) R.ring.set(name, a = []);
  const prev = a[a.length - 1];
  if (prev && prev.dead === 0 && s.dead === 1) { let d = R.deaths.get(name); if (!d) R.deaths.set(name, d = []); d.push(s.at); }
  a.push(s);
  const cut = Date.now() - KEEP_MS; while (a.length && a[0].at < cut) a.shift();
  const d = R.deaths.get(name); if (d) while (d.length && d[0] < cut) d.shift();
}
function loadBack(ctx) {
  for (const t of [Date.now() - 86400000 - 3600000, Date.now() - 86400000, Date.now()]) {
    const f = path.join(ctx.LOGS, 'overview_' + day(t) + '.tsv');
    if (R._loaded && R._loaded.has(f)) continue; (R._loaded = R._loaded || new Set()).add(f);
    let txt = ''; try { txt = fs.readFileSync(f, 'utf8'); } catch (e) { continue; }
    for (const ln of txt.split('\n')) {
      const p = ln.split('\t'); if (p.length < 9) continue;
      const at = +p[0] * 1000; if (!(at > Date.now() - KEEP_MS)) continue;
      push(p[1], { at, party: p[2], level: num(p[3]), exp: num(p[4]), adena: num(p[5]), dead: +p[6] ? 1 : 0, on: +p[7] ? 1 : 0, kh: num(p[8]) });
    }
  }
  for (const a of R.ring.values()) a.sort((x, y) => x.at - y.at);
}
function sample() {
  const ctx = R.ctx; if (!ctx) return;
  try {
    const now = Date.now(), lines = [];
    for (const c of ctx.readStates()) {
      if (!c || !c.name) continue;
      const on = num(c.ageSec) != null && c.ageSec < 30 ? 1 : 0;
      const h = c.expHour, kh = h && num(h.mins) >= 3 ? Math.round(num(h.n) / h.mins * 60) : null;
      const s = { at: now, party: String(c.party || c.name), level: num(c.level), exp: totalExp(c.level, c.exp), adena: num(c.adena), dead: c.dead ? 1 : 0, on, kh };
      if (!on) { const a = R.ring.get(c.name), last = a && a[a.length - 1]; if (last && !last.on && now - last.at < 10 * 60000) continue; }   // offline: one line per 10 min is enough
      push(c.name, s);
      { const d = R.deaths.get(c.name); if (d && d[d.length - 1] === now) R.dinfo.set(c.name + '@' + now, { x: num(c.x), y: num(c.y), z: num(c.z), task: String(c.task || '').slice(0, 160),   // OVDRILL: where a dead edge was seen
        target: (c.doing && c.doing.target && c.doing.target.name) || '' }); }
      lines.push([Math.round(now / 1000), c.name, s.party, s.level ?? '', s.exp ?? '', s.adena ?? '', s.dead, s.on, s.kh ?? ''].join('\t'));
    }
    if (lines.length) fs.appendFileSync(path.join(ctx.LOGS, 'overview_' + day(now) + '.tsv'), lines.join('\n') + '\n');
  } catch (e) { }
}
function start(ctx) {
  if (R.started) return; R.started = Date.now(); R.ctx = ctx;
  try { loadBack(ctx); } catch (e) { }
  setTimeout(sample, 5000); setInterval(sample, EVERY_MS);
}

// --- costs: consumables used (supply_use) + gear and player-shop buys (logs), per character inside [from, to] ---
function prices(ctx) {
  if (!R.prices || Date.now() - R.pricesAt > 600000) { try { R.prices = JSON.parse(fs.readFileSync(path.join(ctx.DIR, 'data', 'item_prices.json'), 'utf8')); } catch (e) { R.prices = R.prices || {}; } R.pricesAt = Date.now(); }
  return R.prices;
}
function tailLines(f, bytes) {
  try { const st = fs.statSync(f), fd = fs.openSync(f, 'r'), n = Math.min(st.size, bytes), b = Buffer.alloc(n); fs.readSync(fd, b, 0, n, st.size - n); fs.closeSync(fd); return b.toString('utf8').split('\n'); } catch (e) { return []; }
}
function costs(ctx, names, from, to) {
  const key = Math.round(from / 60000) + ':' + names.length;
  if (R.costCache.key === key && Date.now() - R.costCache.at < 60000) return R.costCache.v;
  const PR = prices(ctx), out = {};
  const C = (n) => out[n] || (out[n] = { use: 0, gear: 0, shop: 0, huntMs: 0, it: {}, buys: [] });   // OVDRILL: it = consumables { id: { k, v } }, buys = gear / shop rows
  for (const n of names) {
    let j = null; try { j = JSON.parse(fs.readFileSync(path.join(ctx.LOGS, 'supply_use_' + n + '.json'), 'utf8')); } catch (e) { continue; }
    for (const b of (j && j.b) || []) {
      if (!(b.h + 3600000 > from && b.h < to)) continue;
      const part = Math.max(0, Math.min(1, (Math.min(to, b.h + 3600000) - Math.max(from, b.h)) / 3600000));   // only the part of the hour inside the window
      const c = C(n); c.huntMs += (b.ms || 0) * part;
      for (const [id, k] of Object.entries(b.u || {})) { const v = (Number(PR[id]) || 0) * k * part; c.use += v; const I = c.it[id] || (c.it[id] = { k: 0, v: 0 }); I.k += k * part; I.v += v; }
    }
  }
  const inWin = (ln) => { const t = Date.parse(ln.slice(0, 24)); return t >= from && t <= to; };
  for (const ln of tailLines(path.join(ctx.LOGS, 'gear_upgrades.log'), 3 << 20)) {
    if (!inWin(ln)) continue; const m = /\[([A-Za-z0-9]+)\]/.exec(ln); if (!m) continue;
    // "...(supply run): A 336105: bought; B 210325: bought | ..."
    const re = /[:;] ([^:;|]+?) (\d+): bought/g; let g; while ((g = re.exec(ln))) { C(m[1]).gear += +g[2]; C(m[1]).buys.push({ at: Date.parse(ln.slice(0, 24)), kind: 'gear', name: g[1].trim(), v: +g[2] }); }
  }
  for (const ln of tailLines(path.join(ctx.LOGS, 'pshop_buys.log'), 2 << 20)) {
    if (!inWin(ln) || / run: /.test(ln)) continue; const m = /\[([A-Za-z0-9]+)\] bought (.*?)(?: at [\d,]+ from .*?)? = ([\d,]+) adena/.exec(ln);
    if (m) { const v = +m[3].replace(/,/g, ''); C(m[1]).shop += v; C(m[1]).buys.push({ at: Date.parse(ln.slice(0, 24)), kind: 'player shop', name: m[2].trim(), v }); }
  }
  R.costCache = { key, at: Date.now(), v: out };
  return out;
}

// --- OVDRILL-2026-10-29: deaths from the logs (incremental tails) ---
/** new complete lines of f since the last call; the first call starts `first` bytes before the end (a partial first line is dropped) */
function tailNew(f, first, cap) {
  let st; try { st = fs.statSync(f); } catch (e) { return []; }
  let t = R.tails.get(f);
  if (!t || st.size < t.pos) { t = { pos: Math.max(0, st.size - first), rest: '', cut: st.size > first }; R.tails.set(f, t); }
  if (st.size <= t.pos) return [];
  const at = Math.max(t.pos, st.size - cap), n = st.size - at, b = Buffer.alloc(n);
  try { const fd = fs.openSync(f, 'r'); try { fs.readSync(fd, b, 0, n, at); } finally { fs.closeSync(fd); } } catch (e) { return []; }
  const cut = t.cut || at !== t.pos, lines = ((at === t.pos ? t.rest : '') + b.toString('utf8')).split('\n');
  t.rest = lines.pop(); if (cut && lines.length) lines.shift(); t.cut = false; t.pos = st.size;
  return lines;
}
const POS = /\| (?:from|now at) (-?\d+),(-?\d+),(-?\d+)/, TASK = /\| task: (.*?)\s*$/;
function addEv(map, name, e) { let a = map.get(name); if (!a) map.set(name, a = []); a.push(e); }
function scanDeaths(ctx, names) {
  if (Date.now() - R.dscanAt < 30000) return; R.dscanAt = Date.now();
  const cut = Date.now() - KEEP_MS, iso = (s) => Date.parse(s.slice(0, 24));
  try {   // swarm_buffs.log (every window's notes): exact death times + who was hitting us
    for (const ln of tailNew(path.join(ctx.LOGS, 'swarm_buffs.log'), 24 << 20, 32 << 20)) {
      if (ln.indexOf('died — buffs') < 0 && ln.indexOf('is hitting me') < 0 && ln.indexOf('RAID BOSS') < 0) continue;
      const m = /^(\S{24}) \[([^\]]+)\] (.*)$/.exec(ln); if (!m) continue; const t = iso(m[1]); if (!(t > cut)) continue;
      if (/^died — buffs/.test(m[3])) { addEv(R.dev, m[2], { at: t, kind: 'log' }); continue; }
      const k = /self-defence: (.+?) is hitting me/.exec(m[3]) || /RAID BOSS (.+?) attacks us/.exec(m[3]); if (k) addEv(R.hits, m[2], { at: t, who: k[1] });
    }
  } catch (e) { }
  const t0 = Date.now() - KEEP_MS;
  for (const n of names) {   // intent_<Name>.log: revives (place + what it was doing) and escape deaths; only files written inside the window
    const f = path.join(ctx.LOGS, 'intent_' + n + '.log'); let st; try { st = fs.statSync(f); } catch (e) { continue; } if (st.mtimeMs < t0) continue;
    const L = tailNew(f, 3 << 20, 8 << 20);
    for (let i = 0; i < L.length; i++) {
      const ln = L[i], rv = ln.indexOf(' revived: alive again') === 24, es = !rv && ln.indexOf('-> escape FAIL: died') > 0; if (!rv && !es) continue;
      const t = iso(ln); if (!(t > cut)) continue;
      let p = POS.exec(ln), task = (TASK.exec(ln) || [])[1] || '';
      const by = rv ? (/\(([^()]+?) resurrected me\)/.exec(ln) || [])[1] || '' : '';
      let moved = false;
      if ((rv && !by) || es) for (let j = i - 1; j >= Math.max(0, i - 6); j--) {   // a town respawn: the last place before it; an escape: the task before it
        const q = POS.exec(L[j]), tk = (TASK.exec(L[j]) || [])[1];
        if (rv && q && !moved) { p = q; moved = true; } if (!task && tk) task = tk; if ((es || moved) && task) break;
      }
      addEv(R.dev, n, { at: t, kind: rv ? 'revive' : 'escape', x: p ? +p[1] : null, y: p ? +p[2] : null, z: p ? +p[3] : null, task: task.slice(0, 160), by, town: rv && !by });
    }
  }
  for (const m of [R.dev, R.hits]) for (const a of m.values()) { a.sort((x, y) => x.at - y.at); while (a.length && a[0].at < cut) a.shift(); }
  for (const k of R.dinfo.keys()) if (+k.split('@').pop() < cut) R.dinfo.delete(k);
}
/** one character's deaths after `from`: markers (recorder edge / log line / escape death) within 90 s = one death; a revive closes the death
 *  before it (no marker = a death the samples and the notes missed, known from its revive) */
function deathsOf(name, from) {
  const mk = [], rv = [];
  for (const t of R.deaths.get(name) || []) mk.push(Object.assign({ at: t, kind: 'sample' }, R.dinfo.get(name + '@' + t) || {}));
  for (const e of R.dev.get(name) || []) (e.kind === 'revive' ? rv : mk).push(e);
  mk.sort((a, b) => a.at - b.at);
  const D = [];
  for (const m of mk) { const l = D[D.length - 1]; if (l && m.at - l.first < 90000) { l.src.push(m); if (m.kind !== 'sample' && l.approx) { l.at = m.at; l.approx = false; } } else D.push({ at: m.kind === 'sample' ? m.at - 30000 : m.at, first: m.at, approx: m.kind === 'sample', src: [m] }); }
  let last = -Infinity;
  for (const r of rv.sort((a, b) => a.at - b.at)) {
    let d = null; for (let i = D.length - 1; i >= 0; i--) { if (D[i].first > r.at) continue; if (D[i].first > last && !D[i].rev) d = D[i]; break; }
    if (d) d.rev = r; else D.push({ at: r.at, first: r.at, approx: true, onlyRevive: true, src: [], rev: r });
    last = r.at;
  }
  return D.filter(d => d.at >= from || (d.onlyRevive && d.rev.at >= from)).sort((a, b) => a.at - b.at);
}
function killerOf(name, d) {
  const lo = d.onlyRevive ? d.at - 300000 : d.at - 120000, hi = d.at + 5000; let k = null;
  for (const h of R.hits.get(name) || []) { if (h.at > hi) break; if (h.at >= lo) k = h.who; }
  return k || (d.src.find(s => s.target) || {}).target || '';
}
function levelAt(name, t) { const a = R.ring.get(name) || []; let l = null; for (const s of a) { if (s.at > t) break; l = s.level; } return l; }
let ITEMS = null, ITEMS_AT = 0;
function itemById(ctx) {
  const f = path.join(ctx.DIR || __dirname, 'data', 'items.json'); let st = 0; try { st = fs.statSync(f).mtimeMs; } catch (e) { return ITEMS || {}; }
  if (!ITEMS || st !== ITEMS_AT) { try { ITEMS = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { ITEMS = ITEMS || {}; } ITEMS_AT = st; }
  return ITEMS;
}
// --- OVBAG-2026-10-29 (owner: "I wanna see what the value is from each inventory and what it is that i can sell from inventory"): one bag
// (Logs/bag_<Name>.json, the bot's last bag read) priced like the loot tile (half the shop price = what an NPC shop pays), every item marked
// worn / quest / adena / kept / no shop buys / can sell, plus where it stands on Scripts/data/sell_list.json (read only; marking stays on the
// character page). Kept = sell_list "keep", Scripts/data/stash_rules.json keep / keepNames (global + this character), or a supply the bots use
// (Scripts/data/trade_items.json cat "consumable"). No shop = data/nosell_items.json or Logs/unsellable.json (sure / 2+ strikes), like /api/sell.
// The bag file has no enchant level: gear is "can sell" only when its enchant is known 0 or absent (then flagged enU = check +N first).
const JM = new Map(), NONE = Object.freeze({});   // NONE = one shared "missing file" value, so the memo compare holds   // file -> { mt, v } (parsed once per mtime)
function jsonM(f, dflt) {
  let mt = 0; try { mt = fs.statSync(f).mtimeMs; } catch (e) { JM.delete(f); return dflt; }
  const c = JM.get(f); if (c && c.mt === mt) return c.v;
  let v = dflt; try { v = JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch (e) { if (c) return c.v; }
  JM.set(f, { mt, v }); return v;
}
const dataDir = (ctx) => ctx.DATA || path.join(ctx.DIR || __dirname, '..', 'Scripts', 'data');
const GEAR = /^(Weapon|Armor|Accessory|Jewel)/i, BAGNAME = /^[A-Za-z0-9_]{2,32}$/;
function bagRefs(ctx) {   // the static lists as Sets, rebuilt only when one of their files changes
  const D = dataDir(ctx), fs_ = [path.join(D, 'nosell_items.json'), path.join(ctx.LOGS, 'unsellable.json'), path.join(D, 'trade_items.json'), path.join(ctx.DIR || __dirname, 'data', 'questitems.json')];
  const ns = jsonM(fs_[0], NONE), us = jsonM(fs_[1], NONE), tr = jsonM(fs_[2], NONE), qi = jsonM(fs_[3], NONE);
  if (R.bagRefs && R.bagRefs.k[0] === ns && R.bagRefs.k[1] === us && R.bagRefs.k[2] === tr && R.bagRefs.k[3] === qi) return R.bagRefs;
  const noShop = new Set(((ns && ns.ids) || []).map(Number));
  for (const [k, e] of Object.entries(us || {})) if (e && typeof e === 'object' && (e.sure || (+e.strikes || 0) >= 2)) noShop.add(+k);
  const sup = new Set(); for (const [k, c] of Object.entries((tr && tr.cat) || {})) if (c === 'consumable') sup.add(+k);
  return (R.bagRefs = { k: [ns, us, tr, qi], noShop, notrade: new Set(((tr && tr.notrade) || []).map(Number)), sup, quest: new Set((Array.isArray(qi) ? qi : []).map(Number)) });
}
const reList = (a) => (a || []).map(s => { try { return new RegExp(s, 'i'); } catch (e) { return null; } }).filter(Boolean);
/** one character's bag, priced and marked; null = no bag file. Memo by the bag / sell list / stash rules / prices mtimes. */
function bagOf(ctx, name) {
  const f = path.join(ctx.LOGS, 'bag_' + name + '.json'), D = dataDir(ctx), SL = path.join(D, 'sell_list.json'), SR = path.join(D, 'stash_rules.json');
  const PR = prices(ctx), I = itemById(ctx), RF = bagRefs(ctx), b = jsonM(f, null); if (!b || !Array.isArray(b.items)) return null;
  const sl = jsonM(SL, NONE) || NONE, sr = jsonM(SR, NONE) || NONE, me = (sr.chars || {})[name] || {};
  const m = (R.bagM || (R.bagM = new Map())).get(name);
  if (m && m.b === b && m.sl === sl && m.sr === sr && m.PR === PR && m.I === I && m.RF === RF) return m.v;
  const keepIds = new Set([].concat(sl.keep || [], sr.keep || [], me.keep || []).map(Number)), keepRe = reList([].concat(sr.keepNames || [], me.keepNames || []));
  const slKeep = new Set((sl.keep || []).map(Number)), all = new Set((sl.all || []).map(Number)), mine = new Set((sl[name] || []).map(Number));
  // OVBAG-INBAG-2026-10-29 (owner: "you also show things that are Worn? ... should only be what is inside the bag"): worn gear is left out (and out of the worth)
  const rows = b.items.filter(i => !i.eq && !i.equipped).map(i => {
    const id = +i.id, cnt = Math.max(0, Number(i.count) || 0), nm = String(i.name || (I[id] || [])[0] || 'item ' + id), en = num(i.enchant ?? i.en ?? i.enchant_level);
    const gear = GEAR.test(String(i.type || (I[id] || [])[2] || '')), adena = id === 57, worn = !!i.eq, quest = !!i.q || RF.quest.has(id);
    const each = adena ? 1 : Math.floor((Number(PR[id]) || 0) / 2), noShop = !adena && (RF.noShop.has(id) || each <= 0), notrade = RF.notrade.has(id);
    const kept = !adena && (keepIds.has(id) || keepRe.some(r => r.test(nm)) || RF.sup.has(id));
    const list = slKeep.has(id) ? 'keep' : all.has(id) ? 'all' : mine.has(id) ? 'char' : '';
    const why = adena ? 'adena' : worn ? 'worn' : quest ? 'quest item' : en != null && en >= 1 ? 'enchanted +' + en : noShop ? 'no shop buys it' : notrade ? 'untradeable' : kept ? 'kept' : '';
    return { id, objId: i.objId || null, name: nm, icon: (I[id] || [])[1] || '', type: String(i.type || ''), count: cnt, each, value: noShop ? 0 : each * cnt, worn, quest, adena, kept, gear,
      enchant: en, enU: gear && en == null, noShop, notrade, sell: !why, why, list };
  }).sort((a, b2) => b2.value - a.value || a.name.localeCompare(b2.name));
  const sum = (fn) => rows.reduce((t, r) => t + (fn(r) ? r.value : 0), 0);
  const v = { name, at: Date.parse(b.at) || null, rows, total: sum(() => true), items: sum(r => !r.adena), sellable: sum(r => r.sell), adena: sum(r => r.adena),
    nSell: rows.filter(r => r.sell).length, marked: rows.filter(r => r.list === 'all' || r.list === 'char').length };
  R.bagM.set(name, { b, sl, sr, PR, I, RF, v }); return v;
}
function bagDetail(ctx, name) {
  name = String(name || ''); if (!BAGNAME.test(name)) return { ok: false, error: 'bad name' };
  const v = bagOf(ctx, name); if (!v) return { ok: false, error: 'no bag read for ' + name };
  return Object.assign({ ok: true, kind: 'bag' }, v, {
    source: 'Unit value = what an NPC shop pays you: half the datapack shop price (Dashboard/data/item_prices.json), the same price as the loot tile. Adena counts 1 each; an item no shop buys counts 0 (its list price is shown).',
    rule: 'Can sell = not worn, not a quest item, not adena, a shop buys it, tradeable, not enchanted (+1 or more), not kept (keep list, stash keep rules, supplies the bots use).' });
}

/** the rows behind one tile, from the stash of the build that made the cached tile (same numbers) */
function detail(ctx, kind, hours, q) {
  if (kind === 'bag') return bagDetail(ctx, q && q.name);   // OVBAG-2026-10-29 (no window: the bag as last read)
  let c = R.cache.get(hours); if (!c || Date.now() - c.at > 20000) { c = { at: Date.now(), v: build(ctx, hours) }; R.cache.set(hours, c); }
  const v = c.v, X = R.det.get(hours) || {}, T = v.total, round = 'every row is rounded on its own; totals are summed before rounding';
  const pty = {}; v.chars.forEach(ch => { pty[ch.name] = ch.party; });
  if (kind === 'deaths') {
    const rows = (X.deaths || []).map(d => Object.assign({}, d, { party: pty[d.name] || '' }));
    const per = {}; rows.forEach(r => { per[r.name] = (per[r.name] || 0) + 1; });
    return { ok: true, kind, hours, at: v.at, total: T.deaths, rows: rows.sort((a, b) => b.at - a.at),
      byChar: Object.entries(per).map(([name, n]) => ({ name, party: pty[name] || '', n })).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name)),
      note: 'One death = the same character within 90 s (recorder dead flag, the bots\' "died" note, an escape death); a revive closes it. Time ~ = only known to the minute.' };
  }
  if (kind === 'adena') {
    const rows = v.chars.map(ch => { let g = null; try { g = BAGNAME.test(ch.name) ? bagOf(ctx, ch.name) : null; } catch (e) { }   // OVBAG: bag worth per character (memo by mtime)
      return { name: ch.name, party: ch.party, adena: Number(ch.adena) || 0, change: ch.adenaD, perH: ch.adenaH, bag: g ? { value: g.total, items: g.items, sell: g.sellable, n: g.nSell, at: g.at } : null }; }).sort((a, b) => b.adena - a.adena);
    return { ok: true, kind, hours, at: v.at, total: T.adena, sum: rows.reduce((t, r) => t + r.adena, 0), rows, note: 'Coins in the bags only (not item worth). Change = first to last recorder sample inside the window.' };
  }
  if (kind === 'loot') {
    const L = X.loot || { items: [], who: {} }, names = new Set(v.chars.map(ch => ch.name));
    const mine = Object.entries(L.who).filter(([n]) => names.has(n)).reduce((t, [, x]) => t + x, 0), all = L.items.reduce((t, i) => t + (i.value || 0), 0);
    const rows = L.items.map(i => ({ name: i.name, id: i.id, icon: i.icon, grade: i.grade, count: i.count, each: i.count ? Math.round(i.value / i.count) : 0, value: i.value || 0, spoiled: i.spoiled || 0 })).sort((a, b) => b.value - a.value || b.count - a.count);
    return { ok: true, kind, hours, at: v.at, totalH: T.lootH, worth: mine, others: all - mine, rows, round,
      source: 'Unit price = what an NPC shop pays you: half the datapack shop price (Dashboard/data/item_prices.json), the same price the tile uses. 0 = no shop buys it.' };
  }
  if (kind === 'costs') {
    const K = X.cost || {}, PR = prices(ctx), I = itemById(ctx), it = {}, buys = [], per = [];
    for (const ch of v.chars) {
      const k = K[ch.name]; if (!k) continue;
      for (const [id, x] of Object.entries(k.it || {})) { const r = it[id] || (it[id] = { id: +id, name: (I[id] || [])[0] || 'item ' + id, icon: (I[id] || [])[1] || '', each: Number(PR[id]) || 0, count: 0, value: 0 }); r.count += x.k; r.value += x.v; }
      for (const b of k.buys || []) buys.push(Object.assign({ who: ch.name, party: ch.party }, b));
      per.push({ name: ch.name, party: ch.party, use: k.use, gear: k.gear + k.shop });
    }
    return { ok: true, kind, hours, at: v.at, totalH: T.costH, useH: T.useH, gearH: T.gearH, items: Object.values(it).sort((a, b) => b.value - a.value), buys: buys.sort((a, b) => b.v - a.v),
      byChar: per.filter(p => p.use + p.gear > 0).sort((a, b) => (b.use + b.gear) - (a.use + a.gear)), round,
      source: 'Shots / potions / ore = Logs/supply_use_<name>.json counts x the shop price (Dashboard/data/item_prices.json); gear = Logs/gear_upgrades.log; player shops = Logs/pshop_buys.log.' };
  }
  return { ok: false, error: 'unknown detail' };
}

// --- one character over the window ---
function rate(a, from) {
  const w = (a || []).filter(s => s.at >= from); if (w.length < 2) return null;
  const f = w[0], l = w[w.length - 1], hrs = (l.at - f.at) / 3600000; if (hrs < 0.05) return null;
  const on = w.filter(s => s.on).length / w.length, ks = w.filter(s => s.kh != null && s.on);
  // exp: sum of the rises only while online and the level did not drop (a delevel / a death penalty counts as the loss it is)
  return { hrs, levels: (l.level || 0) - (f.level || 0), expH: f.exp != null && l.exp != null ? (l.exp - f.exp) / hrs : null,
    adenaH: f.adena != null && l.adena != null ? (l.adena - f.adena) / hrs : null, adenaD: f.adena != null && l.adena != null ? l.adena - f.adena : null, online: on, killsH: ks.length ? ks.reduce((t, s) => t + s.kh, 0) / ks.length : null,
    spark: spark(w, 24) };
}
function spark(w, n) {   // total exp at n even steps (for the little line on the card)
  if (w.length < 2) return [];
  const f = w[0].at, l = w[w.length - 1].at, out = []; let j = 0;
  for (let i = 0; i < n; i++) { const t = f + (l - f) * i / (n - 1); while (j < w.length - 1 && w[j + 1].at <= t) j++; out.push(w[j].exp); }
  return out;
}

function build(ctx, hours) {
  const now = Date.now(), from = now - hours * 3600000;
  const states = ctx.readStates(), names = states.map(c => c.name);
  let lootWho = {}, lootItems = []; try { const ls = require('./lootpage_api').query(ctx, { hours }).summary; lootWho = ls.valueByWho || {}; lootItems = ls.items || []; } catch (e) { }
  const cost = costs(ctx, names, from, now);
  try { scanDeaths(ctx, names); } catch (e) { }   // OVDRILL-2026-10-29
  const DL = {}; for (const n of names) { try { DL[n] = deathsOf(n, from); } catch (e) { DL[n] = []; } }
  // OVLOCK 2026-10-25 (owner: "a lot of teams show 'no estimate yet' even though they are clearly farming"): the EWC spoil pairs / epic team hunt with
  // "Block experience" ON (Scripts/data/level_control.json lockOn + level >= lock) = no exp to measure; the card says so instead of "no estimate yet"
  let LC = {}; try { LC = (JSON.parse(require('fs').readFileSync(require('path').join(ctx.DATA, 'level_control.json'), 'utf8').replace(/^﻿/, '')) || {}).chars || {}; } catch (e) { }
  const lockOf = (c) => { const l = LC[c.name]; return l && l.lockOn && num(l.lock) && num(c.level) >= num(l.lock) ? num(l.lock) : null; };
  const chars = states.map(c => {
    const a = R.ring.get(c.name), r = rate(a, from), e = (() => { try { return LE.calc(c, { now }); } catch (er) { return null; } })();
    const k = cost[c.name] || { use: 0, gear: 0, shop: 0, huntMs: 0 }, hrs = hours;   // loot + costs come from logs over the whole window (the recorder rates use their own span)
    const lootV = lootWho[c.name] || 0, costT = k.use + k.gear + k.shop;
    const deaths = (DL[c.name] || []).length;   // OVDRILL: merged deaths (was the recorder's dead edges only)
    const live = c.expHour && num(c.expHour.mins) >= 3 ? c.expHour : null;
    return {
      name: c.name, party: String(c.party || c.name), leader: !!c.leader, role: c.role || '', cls: c.cls || '', classId: num(c.classId),
      level: num(c.level), exp: num(c.exp), adena: num(c.adena), hp: num(c.hp), mp: num(c.mp), dead: !!c.dead, online: num(c.ageSec) != null && c.ageSec < 30,
      activity: (c.doing && c.doing.activity) || c.mode || '', task: String(c.task || '').slice(0, 140), where: (c.doing && c.doing.autolevel && c.doing.autolevel.spot) || (c.doing && c.doing.zone) || '',
      eta: e ? { status: e.status, at: e.at, etaMs: e.etaMs, pctH: e.pctH, days: e.days, why: e.why || '' } : null, locked: lockOf(c),
      lastUp: (() => { const l = (c.expLog || []).filter(x => x.up).pop(); return l ? l.at : null; })(),
      expH: r && r.expH != null ? Math.round(r.expH) : live ? Math.round(num(live.amt) / live.mins * 60) : null,
      pctH: e && e.pctH != null ? +e.pctH.toFixed(2) : null,
      levels: r ? r.levels : 0, adenaH: r && r.adenaH != null ? Math.round(r.adenaH) : null, adenaD: r ? r.adenaD : null,
      lootH: Math.round(lootV / hrs), costH: Math.round(costT / hrs), useH: Math.round(k.use / hrs), gearH: Math.round((k.gear + k.shop) / hrs),
      profitH: r && r.adenaH != null ? Math.round(r.adenaH + lootV / hrs) : Math.round(lootV / hrs),
      killsH: r && r.killsH != null ? Math.round(r.killsH) : live ? Math.round(num(live.n) / live.mins * 60) : null,
      deaths, online24: r ? +r.online.toFixed(2) : null, huntShare: hrs ? +Math.min(1, k.huntMs / 3600000 / hrs).toFixed(2) : null, spark: r ? r.spark : [], hrs: r ? +r.hrs.toFixed(2) : 0
    };
  });
  const parties = new Map();
  for (const c of chars) { let p = parties.get(c.party); if (!p) parties.set(c.party, p = { leader: c.party, members: [] }); p.members.push(c); }
  const sum = (list, k) => list.reduce((t, c) => t + (Number(c[k]) || 0), 0);
  const agg = (list) => ({ n: list.length, online: list.filter(c => c.online).length, dead: list.filter(c => c.dead).length,
    adena: sum(list, 'adena'), expH: sum(list, 'expH'), adenaH: sum(list, 'adenaH'), lootH: sum(list, 'lootH'), costH: sum(list, 'costH'), useH: sum(list, 'useH'), gearH: sum(list, 'gearH'),
    profitH: sum(list, 'profitH'), killsH: sum(list, 'killsH'), deaths: sum(list, 'deaths'), levels: sum(list, 'levels'),
    minLevel: Math.min(...list.map(c => c.level || 99)), avgLevel: +(list.reduce((t, c) => t + (c.level || 0), 0) / Math.max(1, list.length)).toFixed(1) });
  const P = [...parties.values()].map(p => {
    p.members.sort((a, b) => (b.leader - a.leader) || a.name.localeCompare(b.name));
    let next = null; try { next = LE.party(states.filter(c => String(c.party || c.name) === p.leader), { now }); } catch (e) { }
    const L = p.members.find(m => m.leader) || p.members[0];
    return Object.assign(p, agg(p.members), { activity: L.activity, task: L.task, where: L.where, next: next ? { level: next.level, next: next.next, at: next.at, who: next.who, status: next.status, days: next.days } : null });
  }).sort((a, b) => b.profitH - a.profitH);
  const soon = chars.filter(c => c.eta && c.eta.status === 'ok' && c.eta.at).sort((a, b) => a.eta.at - b.eta.at).slice(0, 8).map(c => ({ name: c.name, party: c.party, level: c.level, at: c.eta.at, classId: c.classId }));
  const ups = chars.filter(c => c.lastUp && now - c.lastUp < 6 * 3600000).sort((a, b) => b.lastUp - a.lastUp).slice(0, 8).map(c => ({ name: c.name, level: c.level, at: c.lastUp, classId: c.classId }));
  const firstAt = Math.min(...[...R.ring.values()].map(a => (a[0] || {}).at || now));
  // OVDRILL-2026-10-29: the rows behind the tiles, kept next to this build (not in the payload; GET ...&detail=<kind>)
  const dRows = []; for (const n of names) for (const d of DL[n] || []) { const s = d.src.find(x => x.x != null) || {}, rv = d.rev || {}, P = rv.by && rv.x != null ? rv : s.x != null ? s : rv;
    dRows.push({ name: n, at: d.at, approx: !!d.approx, level: levelAt(n, d.at) ?? (states.find(c => c.name === n) || {}).level ?? null, x: P.x ?? null, y: P.y ?? null, z: P.z ?? null,
      task: rv.task || (d.src.find(x => x.task) || {}).task || '', killer: killerOf(n, d), resBy: rv.by || '', revivedAt: rv.at || null, town: !!rv.town, how: [...new Set(d.src.map(x => x.kind).concat(d.rev ? ['revive'] : []))] }); }
  R.det.set(hours, { deaths: dRows, loot: { items: lootItems, who: lootWho }, cost });
  return { ok: true, at: now, hours, recordingSince: firstAt, total: agg(chars), parties: P, chars, soon, ups };
}

async function handle(req, res, url, ctx) {
  if (url.pathname === '/overview.js') {   // the page script (public, no secrets; like /lootpage.js)
    res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-cache' }); res.end(fs.readFileSync(path.join(ctx.DIR || __dirname, 'overview.js'))); return true;
  }
  if (url.pathname !== '/api/overview') return false;
  if (ctx.allowed && !ctx.allowed(req, url)) { ctx.send(res, 401, 'text/plain; charset=utf-8', 'Access denied'); return true; }   // the key, like every other API
  start(ctx);
  const hours = url.searchParams.get('hours') === '24' ? 24 : 1;
  const dk = url.searchParams.get('detail');   // OVDRILL-2026-10-29: deaths | adena | loot | costs (read only)
  if (dk) { let v; try { v = detail(ctx, dk, hours, { name: url.searchParams.get('name') }); } catch (e) { v = { ok: false, error: String(e.message || e) }; } ctx.json(res, v.ok ? 200 : 400, v); return true; }
  const c = R.cache.get(hours);
  if (c && Date.now() - c.at < 20000) { ctx.json(res, 200, c.v); return true; }
  let v; try { v = build(ctx, hours); } catch (e) { ctx.json(res, 500, { error: String(e.message || e) }); return true; }
  R.cache.set(hours, { at: Date.now(), v });
  ctx.json(res, 200, v); return true;
}
module.exports = { handle, start, build, detail, bagOf, deathsOf, totalExp, _R: R };
