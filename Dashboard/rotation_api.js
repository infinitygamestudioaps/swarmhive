// SPOT ROTATION API (SPOTROT-2026-11-05; owner: "Byg spot rotation ... først" - Hunter's "change of spots with custom conditions").
//   /rotationpage.js            the page script (public, like the other page scripts)
//   GET  /api/rotation          -> { parties: [{ leader, members, cfg, live }], zones: [{ name, levelMin, levelMax, exper, enabled }] }
//   POST /api/rotation { leader, cfg: { on, spots: [zone names], order: 'next'|'random', everyMin, noMobsMin, afterDeaths, levelOut } }
// File: Scripts/data/spot_rotation.json { v: 1, parties: { <leader>: cfg } } (atomic write). swarm.js SPOTROT block reads it live (the party leader).
'use strict';
const fs = require('fs'), path = require('path');
const rj = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch (e) { return d; } };
const file = (ctx) => process.env.SWARM_ROTATION_FILE || path.join(ctx.DATA, 'spot_rotation.json');
const NAME_RE = /^[A-Za-z0-9_-]{2,40}$/;
/** a cleaned cfg (the owner's input) -> cfg | { error } */
function cleanCfg(c, zoneNames) {
  const o = c && typeof c === 'object' ? c : {};
  const n = (v, max) => Math.max(0, Math.min(max, Math.round(Number(v) || 0)));
  const spots = (Array.isArray(o.spots) ? o.spots : []).map(String).filter((s, i, a) => s && a.indexOf(s) === i && (!zoneNames || zoneNames.has(s))).slice(0, 40);
  if (o.on === true && spots.length < 2) return { error: 'pick at least 2 spots' };
  return { on: o.on === true, spots, order: o.order === 'random' ? 'random' : 'next', everyMin: n(o.everyMin, 1440), noMobsMin: n(o.noMobsMin, 120), afterDeaths: n(o.afterDeaths, 50), levelOut: o.levelOut === true, at: new Date().toISOString() };
}
function zones(ctx) {
  const z = rj(path.join(ctx.DATA, 'custom_zones.json'), []), L = Array.isArray(z) ? z : (z.zones || []);
  return L.filter(x => x && x.name && !/^KEEPOUT\b/.test(String(x.note || ''))).map(x => ({ name: x.name, levelMin: x.levelMin || 0, levelMax: x.levelMax || 0, exper: x.source === 'exper', enabled: x.enabled !== false }))
    .sort((a, b) => (a.levelMin - b.levelMin) || a.name.localeCompare(b.name));
}
function info(ctx) {
  const j = rj(file(ctx), { v: 1, parties: {} }) || { parties: {} }, st = {};
  try { (ctx.readStates ? ctx.readStates() : []).forEach(s => { st[s.name] = s; }); } catch (e) { }
  const leaders = [...new Set(Object.values(st).map(s => s.party).filter(Boolean))].sort();
  return { parties: leaders.map(l => ({ leader: l, members: Object.values(st).filter(s => s.party === l).map(s => s.name), cfg: (j.parties || {})[l] || null, level: (st[l] || {}).level || 0, task: String((st[l] || {}).task || '').slice(0, 120) })), zones: zones(ctx) };
}
function post(ctx, b) {
  const lv = String((b && b.leader) || ''); if (!NAME_RE.test(lv)) return { code: 400, error: 'leader required' };
  const names = new Set(zones(ctx).map(z => z.name)), c = cleanCfg(b.cfg, names); if (c.error) return { code: 400, error: c.error };
  const F = file(ctx), j = rj(F, { v: 1, parties: {} }) || { v: 1, parties: {} }; j.parties = j.parties || {}; j.parties[lv] = c; j.v = 1;
  const tmp = F + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(j, null, 1)); fs.renameSync(tmp, F);
  try { fs.appendFileSync(path.join(ctx.LOGS, 'dashboard_commands.log'), `${new Date().toISOString()} spot rotation ${lv}: ${c.on ? 'ON' : 'off'} ${c.spots.length} spots\r\n`); } catch (e) { }
  return { code: 200, ok: true, cfg: c };
}
const STATIC = { '/rotationpage.js': 'text/javascript; charset=utf-8' };
async function handle(req, res, url, ctx) {
  if (STATIC[url.pathname]) {
    let body; try { body = fs.readFileSync(path.join(ctx.DIR || __dirname, url.pathname.slice(1))); } catch (e) { res.writeHead(404); res.end('not found'); return true; }
    res.writeHead(200, { 'Content-Type': STATIC[url.pathname], 'Cache-Control': 'no-cache' }); res.end(body); return true;
  }
  if (url.pathname !== '/api/rotation') return false;
  if (!ctx.allowed(req, url)) { ctx.send(res, 401, 'text/plain; charset=utf-8', 'Access denied'); return true; }
  if (req.method === 'GET') { try { ctx.json(res, 200, info(ctx)); } catch (e) { ctx.json(res, 500, { error: e.message }); } return true; }
  if (req.method !== 'POST') { ctx.json(res, 405, { error: 'GET or POST' }); return true; }
  let b = {}; try { let t = ''; for await (const c of req) t += c; b = JSON.parse(t || '{}'); } catch (e) { ctx.json(res, 400, { error: 'bad JSON' }); return true; }
  try { const r = post(ctx, b); const code = r.code || 200; delete r.code; ctx.json(res, code, r); } catch (e) { ctx.json(res, 500, { error: e.message }); }
  return true;
}
module.exports = { handle, info, post, cleanCfg };
