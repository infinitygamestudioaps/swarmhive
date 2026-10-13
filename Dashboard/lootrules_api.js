// LOOT RULES API (owner 2026-10-13 22:10: an S80 "Sealed Moirai Helmet" Spoiler6's party looted was handed to Dagger1 by itself — "an OPTIONAL LOOT
// RULE per party: what happens to loot the party picks up"). Loaded by server.js (one hook, like resrules_api.js). Also serves /lootlogic.js (public,
// no secrets: the decision logic the party settings popup uses for its examples).
//   GET  /api/lootrules  { file, exists, rev, broken, data: { parties }, defaults, modes, grades, clanLeader, chars: [names],
//                          parties: [{ leader, members, has, eff, summary, receiver }], kept: [{ at, name, party, item, why }] (the last kept items, newest first) }
//   POST /api/lootrules  { party, values: { on, mode, to, enchant, adenaAbove, keepGrades, keepEnchanted, keepSpecial, never, always } | null, rev?, by? }
//                          — only that party's entry; a key set to null is removed (= the built-in default); values: null removes the whole entry
//                          (= off: everyone keeps what it finds); rev = the sha the caller read (409 + conflict when it changed); other keys of the
//                          entry (e.g. "note") and of the file stay. Lock + history copy (Scripts/data/history/loot_rules_<time>.json, last 50) +
//                          atomic write + one line in Logs/dashboard_commands.log.
// File: Scripts/data/loot_rules.json (env SWARM_LOOTRULES_FILE overrides it: the tests use a scratch copy). Missing = every party OFF (the public
// package ships no file). swarm.js lootRule / lootRowsMine / hovLootGate read it live (LOOTRULE-PURE = Dashboard/lootlogic.js).
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const LL = require('./lootlogic.js');
const NAME_RE = /^[A-Za-z0-9_\-]{1,40}$/;
const KEYS = ['on', 'mode', 'to', 'enchant', 'adenaAbove', 'keepGrades', 'keepEnchanted', 'keepSpecial', 'never', 'always'];
const ABOUT = 'LOOT RULES per party (dashboard -> party card -> Settings -> Loot). parties.<leader> = { on, mode: all | grade | nongear | list, to: "clanleader" | <name>, enchant (hand enchant scrolls too), adenaAbove (0 = keep all adena), keepGrades [S, S80, S84 ...] + keepEnchanted + keepSpecial (mode grade: that gear stays with the finder), never [ids / names] (never handed by itself), always [ids / names] (always handed) }. A party without an entry: OFF = everyone keeps what it finds. Only the automatic hand-overs are filtered (supply-run loot step, !lootgive, letters / clan items / unload: never-list + gear rules); your own hand-overs (Trade page) are not. Read live by swarm.js.';
let G = null;
function guard(ctx) { if (!G) G = require(path.join(ctx.ROOT || path.join(__dirname, '..'), 'docs', 'plan', 'tools', 'manual_guard.js')); return G; }
const fileOf = (ctx) => process.env.SWARM_LOOTRULES_FILE || (ctx && ctx.lootRulesFile) || path.join(ctx.DATA, 'loot_rules.json');
const sha = (t) => t ? crypto.createHash('sha1').update(t).digest('hex').slice(0, 16) : '';
const isoNow = () => new Date().toISOString();
const obj = (x) => x && typeof x === 'object' && !Array.isArray(x) ? x : {};

function readFile(ctx) {
  const F = fileOf(ctx); let raw = '';
  try { raw = fs.readFileSync(F, 'utf8'); } catch (e) { return { exists: false, raw: '', rev: '', data: { parties: {} } }; }
  try { const j = raw.trim() ? JSON.parse(raw.replace(/^﻿/, '')) : {}; return { exists: true, raw, rev: sha(raw), data: Object.assign({}, obj(j), { parties: obj(obj(j).parties) }) }; }
  catch (e) { return { exists: true, raw, rev: sha(raw), data: null, broken: e.message }; }
}
function parties(ctx) {
  try { let K; try { K = require('./kamapage_api'); } catch (e) { K = require(path.join(ctx.ROOT, 'Dashboard', 'kamapage_api')); } return K.partyList(ctx).map(p => ({ leader: p.leader, names: p.names })); }
  catch (e) { return []; }
}
function clanLeader(ctx) {
  try { const f = process.env.SWARM_CLANQUESTS_FILE || path.join(ctx.DATA, 'clan_quests.json'); const cq = JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); if (cq && cq.clan && cq.clan.leader) return String(cq.clan.leader); } catch (e) { }
  try { const c = JSON.parse(fs.readFileSync(path.join(ctx.ROOT, 'swarm.config.json'), 'utf8').replace(/^﻿/, '')); return String(c.clanLeader || ''); } catch (e) { return ''; }
}
/** the last kept items (Logs/loot_kept.log, written by swarm.js: time \t character \t party \t item \t why \t where) */
function keptLog(ctx, max) {
  let t = ''; try { t = fs.readFileSync(path.join(ctx.LOGS, 'loot_kept.log'), 'utf8'); } catch (e) { return []; }
  const lines = t.split(/\r?\n/).filter(Boolean).slice(-400), out = [];
  for (let i = lines.length - 1; i >= 0 && out.length < (max || 60); i--) {
    const p = lines[i].split('\t'); if (p.length < 5) continue;
    out.push({ at: p[0], name: p[1], party: p[2], item: p[3], why: p[4], where: p[5] || '' });
  }
  return out;
}
function info(ctx) {
  const R = readFile(ctx), D = R.data || { parties: {} }, CL = clanLeader(ctx);
  const P = parties(ctx).map(({ leader, names }) => {
    const e = D.parties[leader], has = !!(e && typeof e === 'object');
    return { leader, members: names, has, eff: has ? LL.lootNorm(e) : null, summary: LL.lootSummary(has ? e : null, CL), receiver: has ? LL.lootReceiver(e, CL) : '' };
  });
  const chars = [...new Set(P.flatMap(p => p.members))];
  return { file: path.basename(fileOf(ctx)), exists: R.exists, rev: R.rev, broken: R.broken || null, data: D, defaults: LL.LOOT_DEF, modes: LL.LOOT_MODES, grades: LL.LOOT_GRADES,
    clanLeader: CL, chars, parties: P, kept: keptLog(ctx, 60) };
}

/** apply one party's change -> { ok, data } | { ok: false, errors } */
function applyChange(data, b) {
  const errors = [], J = JSON.parse(JSON.stringify(Object.assign({}, obj(data), { parties: obj(obj(data).parties) })));
  const party = String((b && b.party) || '').trim();
  if (!NAME_RE.test(party)) return { ok: false, errors: ['party: not a character name'] };
  if (b.values === null) { delete J.parties[party]; return { ok: true, data: J }; }
  const vals = obj(b.values), P = Object.assign({}, obj(J.parties[party]));
  Object.keys(vals).forEach(k => {
    const v = vals[k];
    if (!KEYS.includes(k)) { errors.push(`unknown setting "${String(k).slice(0, 30)}"`); return; }
    if (v === null) { delete P[k]; return; }
    if (['on', 'enchant', 'keepEnchanted', 'keepSpecial'].includes(k)) { if (typeof v !== 'boolean') errors.push(`${k}: true, false or null`); else P[k] = v; return; }
    if (k === 'mode') { if (!LL.LOOT_MODES.includes(v)) errors.push(`mode: ${LL.LOOT_MODES.join(' | ')}`); else P[k] = v; return; }
    if (k === 'to') { const s = String(v || '').trim(); if (!(s === 'clanleader' || NAME_RE.test(s))) errors.push('to: "clanleader" or a character name'); else P[k] = s; return; }
    if (k === 'adenaAbove') { const n = Number(v); if (!Number.isFinite(n) || n < 0 || n > 1e11) errors.push('adenaAbove: 0 or more'); else P[k] = Math.round(n); return; }
    if (k === 'keepGrades') {
      if (!Array.isArray(v)) { errors.push('keepGrades: a list of grades'); return; }
      const bad = v.filter(x => !LL.LOOT_GRADES.includes(String(x || '').toUpperCase())); if (bad.length) { errors.push(`keepGrades: unknown grade ${String(bad[0]).slice(0, 10)}`); return; }
      P[k] = LL.LOOT_GRADES.filter(g => v.map(x => String(x).toUpperCase()).includes(g)); return;
    }
    if (k === 'never' || k === 'always') {
      if (!Array.isArray(v)) { errors.push(`${k}: a list of item ids or names`); return; }
      const bad = v.filter(x => LL.lootEntry(x) === null); if (bad.length) { errors.push(`${k}: "${String(bad[0]).slice(0, 30)}" is not an item id or a name (1-60 letters)`); return; }
      if (v.length > 100) { errors.push(`${k}: at most 100`); return; }
      P[k] = LL.lootList(v); return;
    }
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
      if (b.rev !== undefined && b.rev !== null && String(b.rev) !== R.rev) { result = bad(409, 'the loot rules were changed meanwhile (another page or a tool) — reload and try again', { rev: R.rev, conflict: true }); return; }
      const a = applyChange(R.data, b);
      if (!a.ok) { result = bad(400, a.errors.join('; '), { errors: a.errors }); return; }
      const out = Object.assign({ _about: ABOUT }, a.data);
      if (out.version === undefined) out.version = 1;
      out._updated = isoNow();
      const hist = R.exists ? Gd.saveHistory(F, path.dirname(F), 50) : null;
      const txt = JSON.stringify(out, null, 1) + '\n';
      Gd.atomicWrite(F, txt);
      try { fs.appendFileSync(path.join(ctx.LOGS, 'dashboard_commands.log'), `${isoNow()}\tlootrules\tsave\t${by}: ${JSON.stringify({ party: b.party, values: b.values === null ? null : (b.values || {}) }).slice(0, 600)}\r\n`); } catch (e) { }
      result = { code: 200, ok: true, rev: sha(txt), data: { parties: out.parties }, history: hist ? path.basename(hist) : null };
    }, { who: 'lootrules save' });
  } catch (e) { return bad(500, e.message); }
  return result;
}

async function handle(req, res, url, ctx) {
  if (url.pathname === '/lootlogic.js') {   // public: the decision logic (Dashboard/lootlogic.js), read from disk on every request
    let body; try { body = fs.readFileSync(path.join(ctx.DIR || __dirname, 'lootlogic.js')); } catch (e) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('not found'); return true; }
    res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-cache' }); res.end(body); return true;
  }
  if (url.pathname !== '/api/lootrules') return false;
  if (!ctx.allowed(req, url)) { ctx.send(res, 401, 'text/plain; charset=utf-8', 'Access denied'); return true; }
  if (req.method === 'GET') { try { ctx.json(res, 200, info(ctx)); } catch (e) { ctx.json(res, 500, { error: e.message }); } return true; }
  if (req.method !== 'POST') { ctx.json(res, 405, { error: 'GET or POST' }); return true; }
  let b = {}; try { let t = ''; for await (const c of req) t += c; b = JSON.parse(t || '{}'); } catch (e) { ctx.json(res, 400, { error: 'bad JSON' }); return true; }
  try { const r = post(ctx, b) || bad(500, 'no result'); const code = r.code || 200; delete r.code; ctx.json(res, code, r); } catch (e) { ctx.json(res, 500, { error: e.message }); }
  return true;
}
module.exports = { handle, info, post, readFile, fileOf, applyChange, keptLog, KEYS, ABOUT };
