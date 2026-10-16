// HUNT TIMER API (owner 2026-10-15: "I asked Tank1's team to go to the catacomb but I did not get asked how many hours etc."). Loaded by
// server.js (one hook, like resrules_api.js). Also serves /huntlogic.js and /hunttimer.js (public, no secrets).
//   GET  /api/hunttimer   { file, exists, rev, data: { v, parties }, status: { <leader>: Logs/hunt_timer_<leader>.json }, now }
//   POST /api/hunttimer   { party, act: 'set' | 'extend' | 'end' | 'clear', hours (set: 0.25..48), endAction ('town'|'resupply'|'keep'),
//                           from ('arrival' default | 'now'), spot (label), addMin (extend: 15..720), by? }
//        set    = a new timer (new id) for the party's hunting spot choice        clear = no timer ("until I stop it")
//        extend = more time (a timer that is already over: a new one from now)     end   = "End now" (the leader runs the end action within 15 s)
//   lock + atomic write + one line in Logs/dashboard_commands.log.
// File: Scripts/data/hunt_timers.json (env SWARM_HUNTTIMER_FILE overrides it: the tests use a scratch copy). Missing = no timers (today's
// behaviour). Read live by swarm.js HUNTTIMER (htData, every 5 s); the leader's clock: Logs/hunt_timer_<leader>.json (swarm.js writes it).
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const NAME_RE = /^[A-Za-z0-9_]{2,32}$/;
const ACTIONS = ['town', 'resupply', 'keep'];
const ABOUT = 'Hunting timers per party (dashboard -> spot picker popup "How long?"). { parties: { <leader>: { id, hours, endAction town|resupply|keep, from arrival|now, at, endNow, spot, by } } }. No entry = hunt until you stop it. Written only by Dashboard/hunttimer_api.js; read by swarm.js HUNTTIMER every 5 s; the clock (start on arrival, end) is in Logs/hunt_timer_<leader>.json.';
let G = null;
function guard(ctx) { if (!G) G = require(path.join(ctx.ROOT || path.join(__dirname, '..'), 'docs', 'plan', 'tools', 'manual_guard.js')); return G; }
const fileOf = (ctx) => process.env.SWARM_HUNTTIMER_FILE || (ctx && ctx.huntTimerFile) || path.join(ctx.DATA, 'hunt_timers.json');
const logsOf = (ctx) => process.env.SWARM_HUNTTIMER_LOGS || (ctx && ctx.LOGS);
const sha = (t) => t ? crypto.createHash('sha1').update(t).digest('hex').slice(0, 16) : '';
const obj = (x) => x && typeof x === 'object' && !Array.isArray(x) ? x : {};
const norm = (j) => { const o = obj(j); return { v: 1, parties: obj(o.parties) }; };
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

function readFile(ctx) {
  const F = fileOf(ctx); let raw = '';
  try { raw = fs.readFileSync(F, 'utf8'); } catch (e) { return { exists: false, rev: '', data: norm({}) }; }
  try { return { exists: true, rev: sha(raw), data: norm(raw.trim() ? JSON.parse(raw.replace(/^﻿/, '')) : {}) }; }
  catch (e) { return { exists: true, rev: sha(raw), data: null, broken: e.message }; }
}
function statusOf(ctx, leaders) {
  const out = {}, L = logsOf(ctx); if (!L) return out;
  leaders.forEach(k => { try { const t = fs.readFileSync(path.join(L, 'hunt_timer_' + k.replace(/[^A-Za-z0-9_]/g, '') + '.json'), 'utf8'); out[k] = JSON.parse(t.replace(/^﻿/, '')); } catch (e) { } });
  return out;
}
function info(ctx) {
  const R = readFile(ctx), D = R.data || norm({});
  return { file: path.basename(fileOf(ctx)), exists: R.exists, rev: R.rev, broken: R.broken || null, data: D, status: statusOf(ctx, Object.keys(D.parties)), now: new Date().toISOString() };
}
/** one change -> { ok, data, entry } | { ok: false, error } (pure: nowMs + id given for the tests) */
function applyChange(data, b, nowMs, idFn) {
  const J = JSON.parse(JSON.stringify(norm(data))), party = String((b && b.party) || '').trim(), act = String((b && b.act) || '');
  const iso = new Date(nowMs).toISOString(), id = () => (idFn || newId)();
  if (!NAME_RE.test(party)) return { ok: false, error: 'party (leader name) required' };
  const cur = J.parties[party];
  if (act === 'clear') { delete J.parties[party]; return { ok: true, data: J, entry: null }; }
  if (act === 'set') {
    const h = Number(b.hours);
    if (!isFinite(h) || h < 0.25 || h > 48) return { ok: false, error: 'hours: 0.25 to 48 (no timer = act clear)' };
    const endAction = ACTIONS.includes(b.endAction) ? b.endAction : 'town';
    J.parties[party] = { id: id(), hours: Math.round(h * 100) / 100, endAction, from: b.from === 'now' ? 'now' : 'arrival', at: iso, endNow: null, spot: String(b.spot || '').slice(0, 120), by: String(b.by || 'dashboard').slice(0, 40) };
    if (b.arrivalOnly === true) J.parties[party].arrivalOnly = true;   // HTREPEAT-2026-10-15: the clock starts only on arrival at this spot (no 45-min fallback)
    if (b.repeat === true) J.parties[party].repeat = true;             // HTREPEAT-2026-10-15: after the end action, the next arrival starts a new run
    return { ok: true, data: J, entry: J.parties[party] };
  }
  if (!cur || typeof cur !== 'object') return { ok: false, error: 'this party has no hunting timer' };
  if (act === 'extend') {
    const m = Number(b.addMin);
    if (!isFinite(m) || m < 15 || m > 720) return { ok: false, error: 'addMin: 15 to 720' };
    const HL = require('./huntlogic'), st = b._status || null, c = HL.clock(HL.entry(J, party), st, nowMs);
    if (c.ended || cur.endNow) {   // already over (or "End now" pressed): a new timer from now, same end action and spot
      J.parties[party] = { id: id(), hours: Math.round(m / 60 * 100) / 100, endAction: cur.endAction || 'town', from: 'now', at: iso, endNow: null, spot: cur.spot || '', by: String(b.by || 'dashboard').slice(0, 40), extendedFrom: cur.id };
    } else J.parties[party] = Object.assign({}, cur, { hours: Math.round((Number(cur.hours) + m / 60) * 100) / 100, extendedAt: iso });
    return { ok: true, data: J, entry: J.parties[party] };
  }
  if (act === 'end') { J.parties[party] = Object.assign({}, cur, { endNow: iso }); return { ok: true, data: J, entry: J.parties[party] }; }
  return { ok: false, error: 'act must be set, extend, end or clear' };
}
function post(ctx, b) {
  if (!b || typeof b !== 'object') return { code: 400, error: 'bad body' };
  const F = fileOf(ctx), Gd = guard(ctx);
  fs.mkdirSync(path.dirname(F), { recursive: true });
  let result = null;
  try {
    Gd.withLock(F, () => {
      const R = readFile(ctx);
      if (R.broken) { result = { code: 500, error: `${path.basename(F)} does not parse (${R.broken}) — fix or delete it first` }; return; }
      const party = String(b.party || '').trim();
      const st = NAME_RE.test(party) ? statusOf(ctx, [party])[party] || null : null;
      const a = applyChange(R.data, Object.assign({}, b, { _status: st }), Date.now());
      if (!a.ok) { result = { code: 400, error: a.error }; return; }
      const out = Object.assign({ _about: ABOUT }, a.data, { v: 1, _updated: new Date().toISOString() });
      const txt = JSON.stringify(out, null, 1) + '\n';
      Gd.atomicWrite(F, txt);
      try { if (ctx.LOGS) fs.appendFileSync(path.join(ctx.LOGS, 'dashboard_commands.log'), `${new Date().toISOString()}\thunttimer\t${b.act}\t${String(b.by || 'dashboard').slice(0, 40)}: ${JSON.stringify({ party, hours: b.hours, endAction: b.endAction, addMin: b.addMin, spot: b.spot }).slice(0, 400)}\r\n`); } catch (e) { }
      result = { code: 200, ok: true, rev: sha(txt), entry: a.entry, data: norm(out) };
    }, { who: 'hunttimer save' });
  } catch (e) { return { code: 500, error: e.message }; }
  return result || { code: 500, error: 'no result' };
}
function serveFile(res, ctx, name) {
  let body; try { body = fs.readFileSync(path.join(ctx.DIR || __dirname, name)); } catch (e) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('not found'); return true; }
  res.writeHead(200, { 'Content-Type': (name.endsWith('.css') ? 'text/css' : 'text/javascript') + '; charset=utf-8', 'Cache-Control': 'no-cache' }); res.end(body); return true;
}
async function handle(req, res, url, ctx) {
  if (url.pathname === '/huntlogic.js' || url.pathname === '/hunttimer.js' || url.pathname === '/hunttimer.css') return serveFile(res, ctx, url.pathname.slice(1));   // public: no secrets
  if (url.pathname !== '/api/hunttimer') return false;
  if (!ctx.allowed(req, url)) { ctx.send(res, 401, 'text/plain; charset=utf-8', 'Access denied'); return true; }
  if (req.method === 'GET') { try { ctx.json(res, 200, info(ctx)); } catch (e) { ctx.json(res, 500, { error: e.message }); } return true; }
  if (req.method !== 'POST') { ctx.json(res, 405, { error: 'GET or POST' }); return true; }
  let b = {}; try { let t = ''; for await (const c of req) t += c; b = JSON.parse(t || '{}'); } catch (e) { ctx.json(res, 400, { error: 'bad JSON' }); return true; }
  try { const r = post(ctx, b); const code = r.code || 200; delete r.code; ctx.json(res, code, r); } catch (e) { ctx.json(res, 500, { error: e.message }); }
  return true;
}
module.exports = { handle, info, post, applyChange, readFile, fileOf, ACTIONS, ABOUT };
