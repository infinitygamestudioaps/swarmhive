// MARKET PAGE API (owner 2026-10-14: "There are plenty of shops in Giran, can we see everything they are selling?").
//   GET /api/market  -> { towns: [{ town, at, by, ms, shops: [{ owner, objId, x, y, type, msg, read, seenAt, items: [{ id, name, icon, count, price,
//                        enchant }], recipes: [{ recipeId, cost }] }] }], shots }  from Logs/market_<town>.json (written by swarm.js "!market": MARKET block)
//   shots (PSHOP-2026-10-15, "Shots step 2"): { town, at, items: [{ id, kind, g, name, icon, offers: [{ owner, price, count }] (cheapest 3) }],
//                        parties: [{ leader, on, max: { <id>: price } }] (parties with a player-shop table in party_auto.json),
//                        last: [{ leader, at, text, warn: [], spent }] (Logs/pshop_last_<leader>.json, the last supply-run purchase) }
// Public static: /marketpage.js, /marketpage.css. Read only.
'use strict';
const fs = require('fs'), path = require('path');
const STATIC = { '/marketpage.js': 'application/javascript; charset=utf-8', '/marketpage.css': 'text/css; charset=utf-8' };
let ITEMS = null;
function items(ctx) { if (!ITEMS) { try { ITEMS = JSON.parse(fs.readFileSync(path.join(ctx.DIR || __dirname, 'data', 'items.json'), 'utf8')); } catch (e) { ITEMS = {}; } } return ITEMS; }
/** PSHOP: the cheapest shot offers of the newest scan vs every party's max prices + the last purchases */
function shots(ctx, towns) {
  let PA = null; try { PA = require('./partyauto_api'); } catch (e) { return null; }
  const I = items(ctx), t = towns.find(x => /giran/i.test(x.town)) || null;
  const list = [];
  PA.PSHOP_KINDS.forEach(k => PA.PSHOP_GRADES.forEach(g => {
    const id = k.ids[g], r = I[id], offers = [];
    if (t) t.shops.forEach(s => { if (s.type !== 'sell' || !s.read) return; (s.items || []).forEach(it => { if (Number(it.id) === id && Number(it.count) > 0 && Number(it.price) > 0) offers.push({ owner: s.owner, price: Number(it.price), count: Number(it.count) }); }); });
    offers.sort((a, b) => a.price - b.price || b.count - a.count);
    list.push({ id, kind: k.key, g, name: (r && r[0]) || `${k.label.split(' (')[0]} (${g})`, icon: (r && r[1]) || '', offers: offers.slice(0, 3), shops: offers.length });
  }));
  let data = {}; try { const F = process.env.SWARM_PARTYAUTO_FILE || path.join(ctx.DATA || path.join(ctx.DIR || __dirname, '..', 'Scripts', 'data'), 'party_auto.json'); data = JSON.parse(fs.readFileSync(F, 'utf8').replace(/^﻿/, '')); } catch (e) { }
  const parties = Object.keys((data && data.parties) || {}).filter(L => data.parties[L] && data.parties[L].pshop).map(L => {
    const c = PA.pshopCfg(data, L), max = {};
    PA.PSHOP_KINDS.forEach(k => PA.PSHOP_GRADES.forEach(g => { if (c.max[k.key][g] > 0) max[k.ids[g]] = c.max[k.key][g]; }));
    return { leader: L, on: c.on, max };
  }).sort((a, b) => a.leader.localeCompare(b.leader));
  const last = [];
  try { fs.readdirSync(ctx.LOGS).filter(f => /^pshop_last_[A-Za-z0-9_\-]+\.json$/.test(f)).forEach(f => { const j = ctx.readJson(path.join(ctx.LOGS, f), null); if (j && j.at) last.push({ leader: j.leader || f.slice(11, -5), at: j.at, text: String(j.text || ''), warn: Array.isArray(j.warn) ? j.warn.slice(0, 6) : [], spent: Number(j.spent) || 0 }); }); } catch (e) { }
  last.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  return { town: t ? t.town : null, at: t ? t.at : null, items: list, parties, last: last.slice(0, 8) };
}
function info(ctx) {
  const I = items(ctx), towns = [];
  let files = []; try { files = fs.readdirSync(ctx.LOGS).filter(f => /^market_[a-z ]+\.json$/i.test(f)); } catch (e) { }
  files.forEach(f => {
    const j = ctx.readJson(path.join(ctx.LOGS, f), null); if (!j || !Array.isArray(j.shops)) return;
    j.shops.forEach(s => { (s.items || []).forEach(it => { const r = I[it.id]; it.name = (r && r[0]) || ('item ' + it.id); it.icon = (r && r[1]) || ''; it.grade = (r && r[3]) || ''; }); });
    towns.push({ town: j.town || f.replace(/^market_|\.json$/g, ''), at: j.at || null, by: j.by || '', ms: j.ms || 0, shops: j.shops });
  });
  towns.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  let sh = null; try { sh = shots(ctx, towns); } catch (e) { sh = null; }
  return { towns, shots: sh };
}
async function handle(req, res, url, ctx) {
  const p = url.pathname;
  if (STATIC[p]) { res.writeHead(200, { 'Content-Type': STATIC[p], 'Cache-Control': 'no-cache' }); res.end(fs.readFileSync(path.join(ctx.DIR || __dirname, path.basename(p)))); return true; }
  if (p !== '/api/market') return false;
  if (!ctx.allowed(req, url)) { ctx.send(res, 401, 'text/plain; charset=utf-8', 'Access denied'); return true; }
  try { ctx.json(res, 200, info(ctx)); } catch (e) { ctx.json(res, 500, { error: e.message }); }
  return true;
}
module.exports = { handle, info, shots };
