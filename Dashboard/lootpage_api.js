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
const CACHE = {};
function readDay(ctx, day) {
  const f = path.join(ctx.LOGS, `loot_${day}.log`);
  let st; try { st = fs.statSync(f); } catch (e) { return []; }
  const c = CACHE[day]; if (c && c.size === st.size && c.mtime === st.mtimeMs) return c.rows;
  const rows = [];
  try {
    for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
      const p = line.split('\t'); if (p.length < 6) continue;
      rows.push({ at: p[0], who: p[1], party: p[2] || '', count: Number(p[3]) || 1, name: p[4], how: p[5] === 'spoil' ? 'spoil' : 'loot', place: p[6] || '' });
    }
  } catch (e) { }
  CACHE[day] = { size: st.size, mtime: st.mtimeMs, rows };
  return rows;
}
function query(ctx, q) {
  const hours = Math.max(1, Math.min(24 * 7, Number(q.hours) || 24)), to = Date.now(), from = to - hours * 3600000;
  const idx = nameIndex(ctx), days = [];
  for (let t = from - 86400000; t <= to + 86400000; t += 86400000) { const d = new Date(t).toISOString().slice(0, 10); if (!days.includes(d)) days.push(d); }
  const who = String(q.who || '').toLowerCase(), grade = String(q.grade || '').toUpperCase(), type = String(q.type || ''), how = String(q.how || ''), text = String(q.q || '').toLowerCase();
  const all = [];
  for (const d of days) for (const r of readDay(ctx, d)) {
    const t = Date.parse(r.at); if (!(t >= from && t <= to)) continue;
    const m = idx[String(r.name).toLowerCase()] || {};
    const row = Object.assign({}, r, { id: m.id || 0, icon: m.icon || '', grade: m.grade || 'NONE', type: typeOf(r.name, m.kind) });
    all.push(row);
  }
  const rows = all.filter(r => (!who || r.who.toLowerCase() === who || r.party.toLowerCase() === who)
    && (!grade || (grade === 'S' ? /^S/.test(r.grade) : r.grade === grade)) && (!type || r.type === type) && (!how || r.how === how) && (!text || r.name.toLowerCase().includes(text)));
  rows.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  const sum = { total: 0, byGrade: {}, byType: {}, byWho: {}, top: [] }, topMap = {};
  for (const r of rows) {
    sum.total += r.count; sum.byGrade[r.grade] = (sum.byGrade[r.grade] || 0) + r.count; sum.byType[r.type] = (sum.byType[r.type] || 0) + r.count;
    sum.byWho[r.who] = (sum.byWho[r.who] || 0) + r.count;
    const k = r.name; (topMap[k] = topMap[k] || { name: r.name, icon: r.icon, grade: r.grade, type: r.type, count: 0 }).count += r.count;
  }
  sum.top = Object.values(topMap).sort((a, b) => b.count - a.count).slice(0, 12);
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
