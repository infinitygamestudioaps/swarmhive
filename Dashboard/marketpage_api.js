// MARKET PAGE API (owner 2026-10-14: "There are plenty of shops in Giran, can we see everything they are selling?").
//   GET /api/market  -> { towns: [{ town, at, by, ms, shops: [{ owner, objId, x, y, type, msg, read, seenAt, items: [{ id, name, icon, count, price,
//                        enchant }], recipes: [{ recipeId, cost }] }] }] }  from Logs/market_<town>.json (written by swarm.js "!market": MARKET block)
// Public static: /marketpage.js, /marketpage.css. Read only.
'use strict';
const fs = require('fs'), path = require('path');
const STATIC = { '/marketpage.js': 'application/javascript; charset=utf-8', '/marketpage.css': 'text/css; charset=utf-8' };
let ITEMS = null;
function items(ctx) { if (!ITEMS) { try { ITEMS = JSON.parse(fs.readFileSync(path.join(ctx.DIR || __dirname, 'data', 'items.json'), 'utf8')); } catch (e) { ITEMS = {}; } } return ITEMS; }
function info(ctx) {
  const I = items(ctx), towns = [];
  let files = []; try { files = fs.readdirSync(ctx.LOGS).filter(f => /^market_[a-z ]+\.json$/i.test(f)); } catch (e) { }
  files.forEach(f => {
    const j = ctx.readJson(path.join(ctx.LOGS, f), null); if (!j || !Array.isArray(j.shops)) return;
    j.shops.forEach(s => { (s.items || []).forEach(it => { const r = I[it.id]; it.name = (r && r[0]) || ('item ' + it.id); it.icon = (r && r[1]) || ''; it.grade = (r && r[3]) || ''; }); });
    towns.push({ town: j.town || f.replace(/^market_|\.json$/g, ''), at: j.at || null, by: j.by || '', ms: j.ms || 0, shops: j.shops });
  });
  towns.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  return { towns };
}
async function handle(req, res, url, ctx) {
  const p = url.pathname;
  if (STATIC[p]) { res.writeHead(200, { 'Content-Type': STATIC[p], 'Cache-Control': 'no-cache' }); res.end(fs.readFileSync(path.join(ctx.DIR || __dirname, path.basename(p)))); return true; }
  if (p !== '/api/market') return false;
  if (!ctx.allowed(req, url)) { ctx.send(res, 401, 'text/plain; charset=utf-8', 'Access denied'); return true; }
  try { ctx.json(res, 200, info(ctx)); } catch (e) { ctx.json(res, 500, { error: e.message }); }
  return true;
}
module.exports = { handle, info };
