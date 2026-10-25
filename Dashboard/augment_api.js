// LIFE STONES & AUGMENTATIONS (AUGTABLE-2026-10-25, owner: "Show me all life stones and all augmentation you can get from each level life stone
// and quality grade. I wanna see everything I can get and all the life stones that we have"). READ-ONLY. Hooked in server.js before the key check:
//   /augmentpage.js                 public page script (#/augments)
//   GET /api/augments               the stone list + what we hold of each (bag / warehouse / clan warehouse per character)  (key checked here)
//   GET /api/augments/stone?id=&type=warrior|mage|accessory   both lines of one stone: every option with its text, kind and chance
// Data: Scripts/data/augment_table.json (docs/plan/tools/augment_table.js). Holdings: itemspage_api.findItems (the hive-wide Find an item).
'use strict';
const fs = require('fs'), path = require('path');
let TAB = null, TAB_AT = 0;
function table(ctx) {
  const f = path.join(ctx.DATA, 'augment_table.json');
  try { const m = fs.statSync(f).mtimeMs; if (!TAB || m !== TAB_AT) { TAB = JSON.parse(fs.readFileSync(f, 'utf8')); TAB_AT = m; } } catch (e) { TAB = null; }
  return TAB;
}
const KIND = (id, T) => (T.kinds && T.kinds[id]) || (T.skills[id] ? 'skill' : 'stat');
function stock(ctx) {
  const out = {};
  try {
    const IP = require('./itemspage_api');
    for (const q of ['life stone']) {
      const r = IP.findItems(ctx, q);
      for (const g of (r && r.items) || []) {
        const h = g.holders.map(x => ({ name: x.name, kind: x.kind || 'char', total: x.total, where: [...new Set((x.rows || []).map(r2 => r2.where))] }));
        out[g.id] = { total: h.reduce((t, x) => t + x.total, 0), holders: h };
      }
    }
  } catch (e) { out._error = e.message; }
  return out;
}
async function handle(req, res, url, ctx) {
  if (url.pathname === '/augmentpage.js') {
    res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(fs.readFileSync(path.join(ctx.DIR, 'augmentpage.js'))); return true;
  }
  if (!url.pathname.startsWith('/api/augments')) return false;
  if (ctx.allowed && !ctx.allowed(req, url)) { ctx.json(res, 401, { error: 'key' }); return true; }
  const T = table(ctx); if (!T) { ctx.json(res, 200, { error: 'no Scripts/data/augment_table.json yet (node docs/plan/tools/augment_table.js)' }); return true; }
  if (url.pathname === '/api/augments') {
    const S = stock(ctx);
    ctx.json(res, 200, { ok: true, note: T.note, source: T.source, generated: T.generated, stockError: S._error || null,
      stones: T.stones.map(s => ({ id: s.id, name: s.name, level: s.level, grade: s.grade, kind: s.kind, types: Object.keys(s.types),
        skillPct: Object.fromEntries(Object.entries(s.types).map(([t, v]) => [t, Math.round((v.lines[1] || []).reduce((a, c) => a + c.opts.filter(o => T.skills[o[0]]).reduce((b, o) => b + o[1], 0), 0) * 100) / 100])),
        have: S[s.id] || { total: 0, holders: [] } })) });
    return true;
  }
  if (url.pathname === '/api/augments/stone') {
    const s = T.stones.find(x => x.id === Number(url.searchParams.get('id')));
    if (!s) { ctx.json(res, 404, { error: 'no such life stone' }); return true; }
    const type = s.types[url.searchParams.get('type')] ? url.searchParams.get('type') : Object.keys(s.types)[0];
    const lines = s.types[type].lines.map((cats, i) => ({ line: i + 1, cats: (cats || []).map(c => ({ p: c.p, opts: c.opts.map(o => ({ id: o[0], pct: o[1], text: T.text[o[0]] || ('option ' + o[0]), kind: KIND(o[0], T) })).sort((a, b) => b.pct - a.pct) })) }));
    ctx.json(res, 200, { ok: true, stone: { id: s.id, name: s.name, level: s.level, grade: s.grade, kind: s.kind }, type, types: Object.keys(s.types), lines, note: T.note });
    return true;
  }
  return false;
}
module.exports = { handle, table, stock };
