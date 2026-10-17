// RAID HEALING PER BOSS API (RAIDHEAL-2026-10-17; owner: "we need to be able to set a healing for a raidboss" — Iron Giant Totem). Loaded by server.js.
//   GET  /api/raidheal                       { file, exists, rev, presets, custom (limits), bosses: { <id>: entry + resolved + sentence } }
//   POST /api/raidheal { action: 'set', id, name, level, custom, rev, by }   level normal|heavy|extreme, custom = own numbers (optional)
//        { action: 'clear', id, rev, by }                                       = normal healing again
//   every write: lock + rev check (409), history copy (Scripts/data/history/), atomic write (manual_guard.js), Logs/dashboard_commands.log
// File Scripts/data/raid_heal.json (env SWARM_RAIDHEAL_FILE for the tests); swarm.js re-reads it within ~3 s (RAIDHEAL host). Rules: Dashboard/raidheallogic.js.
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const RL = require('./raidheallogic');
const STATIC = { '/raidheallogic.js': 'application/javascript; charset=utf-8' };
const isoNow = () => new Date().toISOString();
const sha = (t) => (t ? crypto.createHash('sha1').update(t).digest('hex').slice(0, 16) : '');
const bad = (code, error, extra) => Object.assign({ code, error }, extra || {});
let G = null;
function guard(ctx) { if (!G) G = require(path.join(ctx.ROOT || path.join(__dirname, '..'), 'docs', 'plan', 'tools', 'manual_guard.js')); return G; }
const fileOf = (ctx) => process.env.SWARM_RAIDHEAL_FILE || path.join(ctx.DATA, 'raid_heal.json');
function readFile(ctx) {
  const F = fileOf(ctx); let raw = '';
  try { raw = fs.readFileSync(F, 'utf8'); } catch (e) { return { raw: '', rev: '', exists: false, data: { version: 1, bosses: {} } }; }
  try { const j = raw.trim() ? JSON.parse(raw.replace(/^﻿/, '')) : {}; return { raw, rev: sha(raw), exists: true, data: { version: 1, bosses: j && j.bosses && typeof j.bosses === 'object' ? j.bosses : {} } }; }
  catch (e) { return { raw, rev: sha(raw), exists: true, data: null, broken: e.message }; }
}
function summary(ctx) {
  const R = readFile(ctx), bosses = {};
  Object.keys((R.data || {}).bosses || {}).forEach(id => { const e = R.data.bosses[id], r = RL.rhResolve(e); bosses[id] = Object.assign({}, e, { resolved: r, sentence: RL.rhSentence(r) }); });
  return { ok: true, file: path.basename(fileOf(ctx)), exists: R.exists, rev: R.rev, broken: R.broken || null, presets: RL.RH_PRESETS, custom: RL.RH_CUSTOM, bosses,
    normal: RL.rhSentence(RL.rhResolve(null)) };
}
function post(ctx, b) {
  if (!b || typeof b !== 'object') return bad(400, 'bad body');
  const action = String(b.action || ''), id = String(b.id || '');
  if (!['set', 'clear'].includes(action)) return bad(400, 'action: set or clear');
  if (!/^\d{3,7}$/.test(id)) return bad(400, 'id (the boss npc id) required');
  let clean = null;
  if (action === 'set') {
    if (RL.RH_LEVELS.indexOf(String(b.level)) < 0) return bad(400, 'level: normal, heavy or extreme');
    clean = RL.rhClean({ level: b.level, custom: b.custom, name: b.name });
  }
  const F = fileOf(ctx), Gd = guard(ctx); let result = null;
  fs.mkdirSync(path.dirname(F), { recursive: true });
  try {
    Gd.withLock(F, () => {
      const R = readFile(ctx);
      if (R.broken) { result = bad(500, `${path.basename(F)} does not parse (${R.broken}) — fix it or restore it from Scripts/data/history/ first`); return; }
      if (b.rev !== undefined && b.rev !== null && String(b.rev) !== String(R.rev)) { result = bad(409, 'The raid healing was changed meanwhile (another page or person). Reload and try again.', { rev: R.rev }); return; }
      const J = R.data;
      if (!clean) delete J.bosses[id]; else J.bosses[id] = Object.assign(clean, { at: isoNow(), by: String(b.by || 'dashboard').slice(0, 60) });
      J._about = 'RAID HEALING PER BOSS — edited on the dashboard (Raids -> boss -> Healing). bosses.<npc id>: level normal | heavy | extreme (+ custom numbers). Missing = normal. Read live by swarm.js (RAIDHEAL).';
      J._updated = isoNow();
      const hist = R.exists ? Gd.saveHistory(F, path.dirname(F), 50) : null;
      const txt = JSON.stringify(J, null, 1) + '\n';
      Gd.atomicWrite(F, txt);
      try { fs.appendFileSync(path.join(ctx.LOGS, 'dashboard_commands.log'), `${isoNow()}\traidheal\t${action} ${id} ${clean ? JSON.stringify(clean) : ''}\t${String(b.by || 'dashboard').slice(0, 40)}\r\n`); } catch (e) { }
      result = { code: 200, ok: true, rev: sha(txt), history: hist ? path.basename(hist) : null };
    }, { who: 'raidheal ' + id });
  } catch (e) { return bad(500, e.message); }
  if (result && result.code === 200) result.state = summary(ctx);
  return result;
}
async function handle(req, res, url, ctx) {
  const p = url.pathname;
  if (STATIC[p]) { res.writeHead(200, { 'Content-Type': STATIC[p], 'Cache-Control': 'no-cache' }); res.end(fs.readFileSync(path.join(ctx.DIR || __dirname, path.basename(p)))); return true; }
  if (p !== '/api/raidheal') return false;
  if (!ctx.allowed(req, url)) { ctx.send(res, 401, 'text/plain; charset=utf-8', 'Access denied'); return true; }
  if (req.method === 'GET') { try { ctx.json(res, 200, summary(ctx)); } catch (e) { ctx.json(res, 500, { error: e.message }); } return true; }
  if (req.method !== 'POST') { ctx.json(res, 405, { error: 'GET or POST' }); return true; }
  let b = {}; try { let t = ''; for await (const c of req) t += c; b = JSON.parse(t || '{}'); } catch (e) { ctx.json(res, 400, { error: 'bad JSON' }); return true; }
  try { const r = post(ctx, b) || bad(500, 'no result'); const code = r.code || 200; delete r.code; ctx.json(res, code, r); } catch (e) { ctx.json(res, 500, { error: e.message }); }
  return true;
}
module.exports = { handle, summary, post, readFile, fileOf, STATIC };
