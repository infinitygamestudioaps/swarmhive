// LOOT page API (LOOTLOG-2026-10-23; public tester Vykaax: "A loot tracking tab with filters would be nice, to see all recently looted items
// (filter by grade, type (weapon / armor) etc with time and date and who looted it"). Reads Logs/loot_<yyyy-mm-dd>.log, written by every bot
// window (swarm.js LOOTLOG: TSV time, character, party leader, count, item name, how loot|spoil, place).
//   GET /api/loot?hours=24&who=<name or party>&grade=NONE|D|C|B|A|S&type=weapon|armor|jewel|other&how=loot|spoil&q=<text>
//     -> { rows: [{ at, who, party, count, name, id, icon, grade, type, how, place }], summary: { total, byGrade, byType, byWho, top }, from, to }
// Page: Dashboard/lootpage.js (#/loot). Read only.
'use strict';
const fs = require('fs'), path = require('path');
const STATIC = { '/lootpage.js': 'application/javascript; charset=utf-8' };
const GRADES = ['NONE', 'D', 'C', 'B', 'A', 'S', 'S80', 'S84'];
let NAMES = null, NAMES_AT = 0;
/** item name -> { id, icon, grade, type } from Dashboard/data/items.json (the player's own client data); Common Items keep their own name */
function nameIndex(ctx) {
  const f = path.join(ctx.DIR || __dirname, 'data', 'items.json');
  let st = 0; try { st = fs.statSync(f).mtimeMs; } catch (e) { return NAMES || {}; }
  if (NAMES && st === NAMES_AT) return NAMES;
  const out = {};
  try {
    const D = JSON.parse(fs.readFileSync(f, 'utf8'));
    for (const id of Object.keys(D)) {
      const v = D[id]; if (!Array.isArray(v) || !v[0]) continue;
      const k = String(v[0]).toLowerCase(); if (out[k]) continue;
      out[k] = { id: Number(id), icon: v[1] || '', grade: GRADES[Number(v[3])] || 'NONE', kind: String(v[2] || '') };
    }
  } catch (e) { }
  NAMES = out; NAMES_AT = st; return out;
}
const JEWEL = /earring|necklace|ring\b|ring of|circlet/i;
function typeOf(name, kind) { if (kind === 'Weapon') return 'weapon'; if (kind === 'Armor') return JEWEL.test(name) && !/ringmail|ring mail/i.test(name) ? 'jewel' : 'armor'; return 'other'; }
// PRICES (2026-10-24, owner: "show total loot"): Dashboard/data/item_prices.json (datapack shop price; an NPC buys at half) from
// docs/plan/tools/item_prices.js -> value = what the loot sells for at a shop
let PRICES = null, PRICES_AT = 0;
function prices(ctx) {
  const f = path.join(ctx.DIR || __dirname, 'data', 'item_prices.json');
  let st = 0; try { st = fs.statSync(f).mtimeMs; } catch (e) { return PRICES || {}; }
  if (PRICES && st === PRICES_AT) return PRICES;
  try { PRICES = JSON.parse(fs.readFileSync(f, 'utf8')); PRICES_AT = st; } catch (e) { PRICES = PRICES || {}; }
  return PRICES;
}
const CACHE = {};
function readDay(ctx, day) {
  const f = path.join(ctx.LOGS, `loot_${day}.log`);
  let st; try { st = fs.statSync(f); } catch (e) { return []; }
  const c = CACHE[day]; if (c && c.size === st.size && c.mtime === st.mtimeMs) return c.rows;
  const rows = [];
  try {
    for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
      const p = line.split('\t'); if (p.length < 6) continue;
      if (/^EXP\b|\bSP \(Bonus:|\bexperience\b/i.test(p[4] || '')) continue;   // LOOTLOG-EXP-2026-10-24: experience lines written before the fix are not loot
      rows.push({ at: p[0], who: p[1], party: p[2] || '', count: Number(p[3]) || 1, name: p[4], how: p[5] === 'spoil' ? 'spoil' : 'loot', place: p[6] || '' });
    }
  } catch (e) { }
  CACHE[day] = { size: st.size, mtime: st.mtimeMs, rows };
  return rows;
}
function query(ctx, q) {
  const hours = Math.max(1, Math.min(24 * 7, Number(q.hours) || 24)), to = Date.now(), from = to - hours * 3600000;
  const idx = nameIndex(ctx), PR = prices(ctx), days = [];
  for (let t = from - 86400000; t <= to + 86400000; t += 86400000) { const d = new Date(t).toISOString().slice(0, 10); if (!days.includes(d)) days.push(d); }
  const who = String(q.who || '').toLowerCase(), grade = String(q.grade || '').toUpperCase(), type = String(q.type || ''), how = String(q.how || ''), text = String(q.q || '').toLowerCase();
  const all = [];
  for (const d of days) for (const r of readDay(ctx, d)) {
    const t = Date.parse(r.at); if (!(t >= from && t <= to)) continue;
    const m = idx[String(r.name).toLowerCase()] || {};
    const each = Math.floor((PR[m.id] || 0) / 2);
    const row = Object.assign({}, r, { id: m.id || 0, icon: m.icon || '', grade: m.grade || 'NONE', type: typeOf(r.name, m.kind), value: each * r.count });
    all.push(row);
  }
  const rows = all.filter(r => (!who || r.who.toLowerCase() === who || r.party.toLowerCase() === who)
    && (!grade || (grade === 'S' ? /^S/.test(r.grade) : r.grade === grade)) && (!type || r.type === type) && (!how || r.how === how) && (!text || r.name.toLowerCase().includes(text)));
  rows.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  const sum = { total: 0, value: 0, pickups: rows.length, spoiled: 0, byGrade: {}, byType: {}, byWho: {}, byParty: {}, top: [], items: [] }, topMap = {};
  for (const r of rows) {
    sum.total += r.count; sum.byGrade[r.grade] = (sum.byGrade[r.grade] || 0) + r.count; sum.byType[r.type] = (sum.byType[r.type] || 0) + r.count;
    sum.byWho[r.who] = (sum.byWho[r.who] || 0) + r.count;
    sum.value += r.value || 0; if (r.how === 'spoil') sum.spoiled += r.count;
    { const pk = r.party || r.who, P = sum.byParty[pk] || (sum.byParty[pk] = { party: pk, count: 0, value: 0, pickups: 0 }); P.count += r.count; P.value += r.value || 0; P.pickups++; }
    const k = r.name, T = (topMap[k] = topMap[k] || { name: r.name, id: r.id, icon: r.icon, grade: r.grade, type: r.type, count: 0, value: 0, pickups: 0, spoiled: 0, last: r.at, who: {} });
    T.count += r.count; T.value += r.value || 0; T.pickups++; if (r.how === 'spoil') T.spoiled += r.count; T.who[r.who] = (T.who[r.who] || 0) + r.count;
  }
  sum.top = Object.values(topMap).sort((a, b) => b.count - a.count).slice(0, 12).map(t => Object.assign({}, t, { who: undefined }));
  // every item kind once, with its totals (the page's "Totals" view): best grade first, then value, then count
  const GO = { S84: 0, S80: 1, S: 2, A: 3, B: 4, C: 5, D: 6, NONE: 7 };
  sum.items = Object.values(topMap).map(t => { const ws = Object.entries(t.who).sort((a, b) => b[1] - a[1]); return Object.assign({}, t, { who: undefined, people: ws.length, topWho: ws[0] ? ws[0][0] : '' }); })
    .sort((a, b) => (GO[a.grade] - GO[b.grade]) || (b.value - a.value) || (b.count - a.count)).slice(0, 600);
  sum.byParty = Object.values(sum.byParty).sort((a, b) => b.value - a.value || b.count - a.count);
  // who + parties seen, for the filter
  const people = [...new Set(all.map(r => r.who))].sort(), parties = [...new Set(all.map(r => r.party).filter(Boolean))].sort();
  return { ok: true, hours, from: new Date(from).toISOString(), to: new Date(to).toISOString(), rows: rows.slice(0, 1500), more: Math.max(0, rows.length - 1500), summary: sum, people, parties, recording: days.some(d => fs.existsSync(path.join(ctx.LOGS, `loot_${d}.log`))) };
}
async function handle(req, res, url, ctx) {
  const p = url.pathname;
  if (STATIC[p]) { res.writeHead(200, { 'Content-Type': STATIC[p], 'Cache-Control': 'no-cache' }); res.end(fs.readFileSync(path.join(ctx.DIR || __dirname, path.basename(p)))); return true; }
  if (p !== '/api/loot') return false;
  if (!ctx.allowed(req, url)) { ctx.send(res, 401, 'text/plain; charset=utf-8', 'Access denied'); return true; }
  try { const q = {}; url.searchParams.forEach((v, k) => { q[k] = v; }); ctx.json(res, 200, query(ctx, q)); }
  catch (e) { ctx.json(res, 500, { error: e.message }); }
  return true;
}
module.exports = { handle, query, nameIndex, typeOf, STATIC };
