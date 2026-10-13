// RESURRECTION SETTINGS API (owner 2026-10-13 21:00: "I need to be able to use 'Scroll of Resurrection' via an action or the Resurrection skill and
// then select a party member that is dead ... Chanter4 should use a scroll of resurrection on the bishop, then the bishop should buff up
// immediately"). Loaded by server.js (one hook, like partyauto_api.js). Also serves /respanel.js (public, no secrets: the Resurrect dialog).
//   GET  /api/resrules   { file, exists, rev, broken, data: { v, default, parties }, defaults, parties: [{ leader, members, eff, src }] }
//   POST /api/resrules   { party, values: { auto, scrolls, raidHealerScrolls, raidAllScrolls, blessedFirst: true|false|null, scrollWho: 'anyone'|'nottank'|'names'|null,
//                          scrollNames: [names]|null, maxWalk: 300..20000|null }, rev?, by? }  — only that party's entry; null = removed (= the
//                          setting for all parties / the built-in default); rev = the sha the caller read (409 + conflict when it changed);
//                          lock + history copy (Scripts/data/history/res_rules_<time>.json, last 50) + atomic write + one line in Logs/dashboard_commands.log.
// File: Scripts/data/res_rules.json (env SWARM_RESRULES_FILE overrides it: the tests use a scratch copy). Missing = the defaults below (automatic
// res ON: it is survival). swarm.js RES-PURE (resRulesFor) reads it live every 5 s — the same rules as resRulesFor below (test_resurrect.js checks both).
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const NAME_RE = /^[A-Za-z0-9_\-]{1,40}$/;
const DEFAULTS = { auto: true, scrolls: true, raidHealerScrolls: true, raidAllScrolls: false, scrollWho: 'anyone', scrollNames: [], maxWalk: 6000, blessedFirst: false };
const WHO = ['anyone', 'nottank', 'names'];
const KEYS = Object.keys(DEFAULTS);
const ABOUT = 'Resurrection settings per party (dashboard -> party card -> Settings -> Resurrection). Missing party / key = the "default" entry, then the built-in defaults: auto true (dead teammates are resurrected by themselves), scrolls true, raidHealerScrolls true (owner 2026-10-13: a dead healer may be scrolled in a raid), raidAllScrolls false (no scrolls on others in a raid), scrollWho anyone | nottank | names (+ scrollNames), maxWalk 6000 (how far a resser walks to a body), blessedFirst false. Your orders (!res, !resall, the Resurrect button) always work. Read live by swarm.js every 5 s.';
let G = null;
function guard(ctx) { if (!G) G = require(path.join(ctx.ROOT || path.join(__dirname, '..'), 'docs', 'plan', 'tools', 'manual_guard.js')); return G; }
const fileOf = (ctx) => process.env.SWARM_RESRULES_FILE || (ctx && ctx.resRulesFile) || path.join(ctx.DATA, 'res_rules.json');
const sha = (t) => t ? crypto.createHash('sha1').update(t).digest('hex').slice(0, 16) : '';
const isoNow = () => new Date().toISOString();
const obj = (x) => x && typeof x === 'object' && !Array.isArray(x) ? x : {};

// ---- the same rules as swarm.js RES-PURE (resRulesNorm / resRulesClean / resRulesFor)
function resRulesNorm(j) { const o = obj(j); return { v: 1, default: obj(o.default), parties: obj(o.parties) }; }
function resRulesClean(p) {
  const out = {}, o = p && typeof p === 'object' ? p : {};
  KEYS.forEach(k => {
    const v = o[k];
    if (typeof DEFAULTS[k] === 'boolean') { if (typeof v === 'boolean') out[k] = v; }
    else if (k === 'scrollWho') { if (WHO.includes(v)) out[k] = v; }
    else if (k === 'scrollNames') { if (Array.isArray(v)) out[k] = v.map(x => String(x || '').trim()).filter(x => NAME_RE.test(x)).slice(0, 30); }
    else if (k === 'maxWalk') { const n = Number(v); if (v !== null && v !== '' && isFinite(n) && n >= 300 && n <= 20000) out[k] = Math.round(n); }
  });
  return out;
}
function resRulesFor(j, leader) {
  const J = resRulesNorm(j), a = resRulesClean(J.default), p = resRulesClean(J.parties[leader]);
  const out = Object.assign({}, DEFAULTS, a, p), src = {};
  KEYS.forEach(k => { src[k] = k in p ? 'party' : k in a ? 'all' : 'default'; });
  out.scrollNames = (out.scrollNames || []).slice();
  return Object.assign(out, { src });
}

function readFile(ctx) {
  const F = fileOf(ctx); let raw = '';
  try { raw = fs.readFileSync(F, 'utf8'); } catch (e) { return { exists: false, raw: '', rev: '', data: resRulesNorm({}) }; }
  try { return { exists: true, raw, rev: sha(raw), data: resRulesNorm(raw.trim() ? JSON.parse(raw.replace(/^﻿/, '')) : {}) }; }
  catch (e) { return { exists: true, raw, rev: sha(raw), data: null, broken: e.message }; }
}
function parties(ctx) {
  try { let K; try { K = require('./kamapage_api'); } catch (e) { K = require(path.join(ctx.ROOT, 'Dashboard', 'kamapage_api')); } return K.partyList(ctx).map(p => ({ leader: p.leader, names: p.names })); }
  catch (e) { return []; }
}
function info(ctx) {
  const R = readFile(ctx), D = R.data || resRulesNorm({});
  const P = parties(ctx).map(({ leader, names }) => { const e = resRulesFor(D, leader), src = e.src; delete e.src; return { leader, members: names, eff: e, src }; });
  return { file: path.basename(fileOf(ctx)), exists: R.exists, rev: R.rev, broken: R.broken || null, data: D, defaults: DEFAULTS, who: WHO, parties: P };
}

/** apply one party's change -> { ok, data } | { ok: false, errors } */
function applyChange(data, b) {
  const errors = [], J = JSON.parse(JSON.stringify(resRulesNorm(data)));
  const party = String((b && b.party) || '').trim();
  if (!NAME_RE.test(party)) return { ok: false, errors: ['party: not a character name'] };
  const vals = obj(b.values), P = Object.assign({}, obj(J.parties[party]));
  Object.keys(vals).forEach(k => {
    const v = vals[k];
    if (!KEYS.includes(k)) { errors.push(`unknown setting "${String(k).slice(0, 30)}"`); return; }
    if (v === null) { delete P[k]; return; }
    if (typeof DEFAULTS[k] === 'boolean') { if (typeof v !== 'boolean') errors.push(`${k}: true, false or null`); else P[k] = v; return; }
    if (k === 'scrollWho') { if (!WHO.includes(v)) errors.push(`scrollWho: ${WHO.join(' | ')} or null`); else P[k] = v; return; }
    if (k === 'scrollNames') {
      if (!Array.isArray(v)) { errors.push('scrollNames: a list of character names or null'); return; }
      const bad = v.filter(x => !NAME_RE.test(String(x || '')));
      if (bad.length) { errors.push(`scrollNames: not character names: ${bad.slice(0, 3).join(', ')}`); return; }
      if (v.length > 30) { errors.push('scrollNames: at most 30'); return; }
      P[k] = [...new Set(v.map(String))]; return;
    }
    if (k === 'maxWalk') { const n = Number(v); if (!isFinite(n) || n < 300 || n > 20000) errors.push('maxWalk: 300 to 20000'); else P[k] = Math.round(n); }
  });
  if (Object.keys(P).length) J.parties[party] = P; else delete J.parties[party];
  if (Object.keys(J.parties).length > 300) errors.push('parties: at most 300');
  return errors.length ? { ok: false, errors } : { ok: true, data: J };
}
function bad(code, error, extra) { return Object.assign({ code, error }, extra || {}); }
function post(ctx, b) {
  if (!b || typeof b !== 'object') return bad(400, 'bad body');
  const F = fileOf(ctx), Gd = guard(ctx), by = String(b.by || 'dashboard').slice(0, 40);
  fs.mkdirSync(path.dirname(F), { recursive: true });
  let result = null;
  try {
    Gd.withLock(F, () => {
      const R = readFile(ctx);
      if (R.broken) { result = bad(500, `${path.basename(F)} does not parse (${R.broken}) — fix or restore it from history/ first`); return; }
      if (b.rev !== undefined && b.rev !== null && String(b.rev) !== R.rev) { result = bad(409, 'the resurrection settings were changed meanwhile (another page or a tool) — reload and try again', { rev: R.rev, conflict: true }); return; }
      const a = applyChange(R.data, b);
      if (!a.ok) { result = bad(400, a.errors.join('; '), { errors: a.errors }); return; }
      const out = Object.assign({ _about: ABOUT }, a.data, { v: 1 });
      out._updated = isoNow();
      const hist = R.exists ? Gd.saveHistory(F, path.dirname(F), 50) : null;
      const txt = JSON.stringify(out, null, 1) + '\n';
      Gd.atomicWrite(F, txt);
      try { fs.appendFileSync(path.join(ctx.LOGS, 'dashboard_commands.log'), `${isoNow()}\tresrules\tsave\t${by}: ${JSON.stringify({ party: b.party, values: b.values || {} }).slice(0, 600)}\r\n`); } catch (e) { }
      result = { code: 200, ok: true, rev: sha(txt), data: resRulesNorm(out), history: hist ? path.basename(hist) : null };
    }, { who: 'resrules save' });
  } catch (e) { return bad(500, e.message); }
  return result;
}

async function handle(req, res, url, ctx) {
  if (url.pathname === '/respanel.js') {   // public: the Resurrect dialog + party card (Dashboard/respanel.js), read from disk on every request
    let body; try { body = fs.readFileSync(path.join(ctx.DIR || __dirname, 'respanel.js')); } catch (e) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('not found'); return true; }
    res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-cache' }); res.end(body); return true;
  }
  if (url.pathname !== '/api/resrules') return false;
  if (!ctx.allowed(req, url)) { ctx.send(res, 401, 'text/plain; charset=utf-8', 'Access denied'); return true; }
  if (req.method === 'GET') { try { ctx.json(res, 200, info(ctx)); } catch (e) { ctx.json(res, 500, { error: e.message }); } return true; }
  if (req.method !== 'POST') { ctx.json(res, 405, { error: 'GET or POST' }); return true; }
  let b = {}; try { let t = ''; for await (const c of req) t += c; b = JSON.parse(t || '{}'); } catch (e) { ctx.json(res, 400, { error: 'bad JSON' }); return true; }
  try { const r = post(ctx, b) || bad(500, 'no result'); const code = r.code || 200; delete r.code; ctx.json(res, code, r); } catch (e) { ctx.json(res, 500, { error: e.message }); }
  return true;
}
module.exports = { handle, info, post, readFile, fileOf, applyChange, resRulesNorm, resRulesClean, resRulesFor, DEFAULTS, WHO, KEYS, ABOUT };
