// DEATHSTOP BANNER API (owner 2026-11-22: "Yes, but announce it with a banner that can be resolved manually"): a party whose leader died 3 times within
// an hour at the spot you chose waits in town (swarm.js DEATHSTOP, at most 1 h). Loaded by server.js (one hook). Also serves /deathstop.js (public).
//   GET  /api/deathstop                   { rows: [{ leader, spot, at, until, deaths, ended, waiting }] } - not resolved yet
//   POST /api/deathstop { party }         Resolve: the banner goes away; a party that still waits hunts again at its spot (swarm.js reads the ack within 15 s)
// Files: Logs/deathstop_<leader>.json (written by swarm.js), Logs/deathstop_ack_<leader>.json { of, at, by } (written here only).
'use strict';
const fs = require('fs'), path = require('path');
const NAME_RE = /^[A-Za-z0-9_]{2,32}$/;
const KEEP_MS = 24 * 3600e3;                           // an old record nobody resolved leaves the page after a day
const readJ = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch (e) { return null; } };
/** pure: a record + its ack -> a banner row | null */
function rowOf(J, ack, nowMs) {
  if (!J || !J.hold || !NAME_RE.test(String(J.leader || ''))) return null;
  const at = Number(J.hold.at) || 0, until = Number(J.hold.until) || 0;
  if (!at || nowMs - at > KEEP_MS || (ack && Number(ack.of) === at)) return null;
  const ended = J.ended && J.ended.at ? { at: Number(J.ended.at), why: String(J.ended.why || '').slice(0, 120) } : null;
  return { leader: J.leader, spot: String(J.hold.name || '').slice(0, 120), at, until, deaths: (Array.isArray(J.deaths) ? J.deaths : []).map(Number).filter(Boolean).slice(-10), ended, waiting: !ended && nowMs < until };
}
function rows(LOGS, nowMs) {
  let names = []; try { names = fs.readdirSync(LOGS).filter(f => /^deathstop_(?!ack_)[A-Za-z0-9_]+\.json$/.test(f)); } catch (e) { }
  return names.map(f => { const n = f.slice(10, -5); return rowOf(readJ(path.join(LOGS, f)), readJ(path.join(LOGS, `deathstop_ack_${n}.json`)), nowMs); }).filter(Boolean).sort((a, b) => b.at - a.at);
}
function resolve(LOGS, party, nowMs) {
  if (!NAME_RE.test(party)) return { code: 400, error: 'party (leader name) required' };
  const J = readJ(path.join(LOGS, `deathstop_${party}.json`));
  if (!J || !J.hold || !J.hold.at) return { code: 404, error: `${party} has no death stop` };
  const f = path.join(LOGS, `deathstop_ack_${party}.json`), tmp = f + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify({ of: J.hold.at, at: new Date(nowMs).toISOString(), by: 'dashboard' })); fs.renameSync(tmp, f);
  return { ok: true, rows: rows(LOGS, nowMs) };
}
async function handle(req, res, url, ctx) {
  if (url.pathname === '/deathstop.js') {
    res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(fs.readFileSync(path.join(__dirname, 'deathstop.js'))); return true;
  }
  if (url.pathname !== '/api/deathstop') return false;
  if (!ctx.allowed(req, url)) { ctx.send(res, 401, 'text/plain; charset=utf-8', 'Access denied'); return true; }
  if (req.method === 'GET') { ctx.json(res, 200, { rows: rows(ctx.LOGS, Date.now()) }); return true; }
  if (req.method !== 'POST') { ctx.json(res, 405, { error: 'GET or POST' }); return true; }
  let b = {}; try { let t = ''; for await (const c of req) { t += c; if (t.length > 4000) break; } b = JSON.parse(t || '{}'); } catch (e) { ctx.json(res, 400, { error: 'bad JSON' }); return true; }
  try { const r = resolve(ctx.LOGS, String(b.party || '').trim(), Date.now()), code = r.code || 200; delete r.code; ctx.json(res, code, r); } catch (e) { ctx.json(res, 500, { error: e.message }); }
  return true;
}
module.exports = { handle, rows, rowOf, resolve };
