// PARTY AUTOMATIONS API (owner 2026-10-13: "everything configurable by hand, nothing automatic unless the player switches it on"; the
// party settings popup had no switch for these three, they only followed Start / Stop). Loaded by server.js (one hook, like fundpage_api.js).
//   GET  /api/partyauto     { file, exists, rev, broken, data: { v, default, parties, chars }, kinds: [{ key, label, help, char }],
//                             parties: [{ leader, members, eff: { <kind>: { on, src } }, chars: { <name>: { <kind>: { on, src } } } }] }
//   POST /api/partyauto     { party, values: { <kind>: true | false | null }, chars: { <name>: { <kind>: true | false | null } }, rev?, by? }
//                           only that party's entry (+ the named characters) is changed; null = removed (= the setting for all parties);
//                           rev = the file's sha the caller read (409 + conflict: true when it changed meanwhile); lock + history copy
//                           (Scripts/data/history/party_auto_<time>.json, last 50) + atomic tmp + rename (manual_guard.js) + one line in
//                           Logs/dashboard_commands.log.
// File: Scripts/data/party_auto.json (env SWARM_PARTYAUTO_FILE overrides it: the tests use a scratch copy). Missing = everything OFF.
//   { v: 1, default: { supplyWatch: false, sell: false, dyes: false }, parties: { <leader>: { supplyWatch, sell, dyes } },
//     chars: { <name>: { sell, dyes } } }
// swarm.js PARTYAUTO-PURE (pautoEffective) reads it live every 5 s — the same rules as pautoEffective below (test_party_auto.js checks both).
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const NAME_RE = /^[A-Za-z0-9_\-]{1,40}$/;
const KINDS = [
  { key: 'supplyWatch', char: false, label: 'Supply runs when someone runs low',
    help: 'The leader goes to Giran by himself when a character is low on escape / resurrection scrolls, shots, potions or arrows (or the bag is full), buys for everyone and hands it out.' },
  { key: 'sell', char: true, label: 'Sell junk on town visits',
    help: 'Items you marked "sell" are sold whenever a character idles in a town, and old gear + marked items are sold during supply runs (also the ones you order).' },
  { key: 'dyes', char: true, label: 'Draw symbols (dyes) in supply runs',
    help: 'During supply runs each character with a symbol plan buys the dyes and draws its next planned symbol at the Symbol Maker in Giran (also in the supply runs you order).' },
];
const KEYS = KINDS.map(k => k.key), CHAR_KEYS = KINDS.filter(k => k.char).map(k => k.key);
const ABOUT = 'Party automations (dashboard -> party card -> Settings -> Supplies). Missing party / character = the "default" values; the public package ships every one OFF. supplyWatch = automatic supply runs when someone is low; sell = selling on town visits + in supply runs; dyes = drawing planned symbols in supply runs. Your orders (!supply, !sell, !dyes) always work. Read live by swarm.js every 5 s.';
let G = null;
function guard(ctx) { if (!G) G = require(path.join(ctx.ROOT || path.join(__dirname, '..'), 'docs', 'plan', 'tools', 'manual_guard.js')); return G; }
const fileOf = (ctx) => process.env.SWARM_PARTYAUTO_FILE || (ctx && ctx.partyAutoFile) || path.join(ctx.DATA, 'party_auto.json');
const sha = (t) => t ? crypto.createHash('sha1').update(t).digest('hex').slice(0, 16) : '';
const isoNow = () => new Date().toISOString();
const obj = (x) => x && typeof x === 'object' && !Array.isArray(x) ? x : {};

// ---- the same rules as swarm.js PARTYAUTO-PURE
function pautoNorm(j) {
  const o = obj(j);
  return Object.assign({}, o, { v: 1, default: obj(o.default), parties: obj(o.parties), chars: obj(o.chars) });
}
function pautoEffective(j, kind, me, leader) {
  const K = KINDS.find(k => k.key === kind); if (!K) return { on: false, src: 'unknown' };
  const J = pautoNorm(j), c = obj(J.chars[me]), p = obj(J.parties[leader]);
  if (K.char && typeof c[kind] === 'boolean') return { on: c[kind], src: 'char' };
  if (typeof p[kind] === 'boolean') return { on: p[kind], src: 'party' };
  return { on: J.default[kind] === true, src: 'default' };
}

function readFile(ctx) {
  const F = fileOf(ctx); let raw = '';
  try { raw = fs.readFileSync(F, 'utf8'); } catch (e) { return { exists: false, raw: '', rev: '', data: pautoNorm({}) }; }
  try { return { exists: true, raw, rev: sha(raw), data: pautoNorm(raw.trim() ? JSON.parse(raw.replace(/^﻿/, '')) : {}) }; }
  catch (e) { return { exists: true, raw, rev: sha(raw), data: null, broken: e.message }; }
}
function parties(ctx) {
  try { let K; try { K = require('./kamapage_api'); } catch (e) { K = require(path.join(ctx.ROOT, 'Dashboard', 'kamapage_api')); } return K.partyList(ctx).map(p => ({ leader: p.leader, names: p.names })); }
  catch (e) { return []; }
}
function info(ctx) {
  const R = readFile(ctx), D = R.data || pautoNorm({});
  const P = parties(ctx).map(({ leader, names }) => {
    const eff = {}, chars = {};
    KEYS.forEach(k => { eff[k] = pautoEffective(D, k, leader, leader); });
    names.forEach(n => { chars[n] = {}; CHAR_KEYS.forEach(k => { chars[n][k] = pautoEffective(D, k, n, leader); }); });
    return { leader, members: names, eff, chars };
  });
  return { file: path.basename(fileOf(ctx)), exists: R.exists, rev: R.rev, broken: R.broken || null, data: D, kinds: KINDS, parties: P };
}

/** apply one party's change to the file's data -> { ok, data } | { ok: false, errors } */
function applyChange(data, b) {
  const errors = [], J = JSON.parse(JSON.stringify(pautoNorm(data)));
  const party = String((b && b.party) || '').trim();
  if (!NAME_RE.test(party)) return { ok: false, errors: ['party: not a character name'] };
  const vals = obj(b.values), chars = obj(b.chars);
  const bad = (v) => !(v === true || v === false || v === null);
  if (Object.keys(vals).length) {
    const P = Object.assign({}, obj(J.parties[party]));
    Object.keys(vals).forEach(k => {
      if (!KEYS.includes(k)) { errors.push(`unknown setting "${String(k).slice(0, 30)}"`); return; }
      if (bad(vals[k])) { errors.push(`${k}: true, false or null`); return; }
      if (vals[k] === null) delete P[k]; else P[k] = vals[k];
    });
    if (Object.keys(P).length) J.parties[party] = P; else delete J.parties[party];
  }
  if (Object.keys(chars).length > 60) errors.push('characters: at most 60 per save');
  Object.keys(chars).forEach(n => {
    if (!NAME_RE.test(n)) { errors.push(`character "${String(n).slice(0, 40)}": not a character name`); return; }
    const C = Object.assign({}, obj(J.chars[n])), cv = obj(chars[n]);
    Object.keys(cv).forEach(k => {
      if (!CHAR_KEYS.includes(k)) { errors.push(`${n}: "${String(k).slice(0, 30)}" has no per-character setting`); return; }
      if (bad(cv[k])) { errors.push(`${n} ${k}: true, false or null`); return; }
      if (cv[k] === null) delete C[k]; else C[k] = cv[k];
    });
    if (Object.keys(C).length) J.chars[n] = C; else delete J.chars[n];
  });
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
      if (b.rev !== undefined && b.rev !== null && String(b.rev) !== R.rev) { result = bad(409, 'the party automations were changed meanwhile (another page or a tool) — reload and try again', { rev: R.rev, conflict: true }); return; }
      const a = applyChange(R.data, b);
      if (!a.ok) { result = bad(400, a.errors.join('; '), { errors: a.errors }); return; }
      const out = Object.assign({ _about: ABOUT }, a.data, { v: 1 });
      if (!R.exists) out.default = Object.assign({ supplyWatch: false, sell: false, dyes: false }, out.default);
      out._updated = isoNow();
      const hist = R.exists ? Gd.saveHistory(F, path.dirname(F), 50) : null;
      const txt = JSON.stringify(out, null, 1) + '\n';
      Gd.atomicWrite(F, txt);
      const what = JSON.stringify({ party: b.party, values: b.values || {}, chars: b.chars || {} }).slice(0, 600);
      try { fs.appendFileSync(path.join(ctx.LOGS, 'dashboard_commands.log'), `${isoNow()}\tpartyauto\tsave\t${by}: ${what}\r\n`); } catch (e) { }
      result = { code: 200, ok: true, rev: sha(txt), data: pautoNorm(out), history: hist ? path.basename(hist) : null };
    }, { who: 'partyauto save' });
  } catch (e) { return bad(500, e.message); }
  return result;
}

async function handle(req, res, url, ctx) {
  if (url.pathname !== '/api/partyauto') return false;
  if (!ctx.allowed(req, url)) { ctx.send(res, 401, 'text/plain; charset=utf-8', 'Access denied'); return true; }
  if (req.method === 'GET') { try { ctx.json(res, 200, info(ctx)); } catch (e) { ctx.json(res, 500, { error: e.message }); } return true; }
  if (req.method !== 'POST') { ctx.json(res, 405, { error: 'GET or POST' }); return true; }
  let b = {}; try { let t = ''; for await (const c of req) t += c; b = JSON.parse(t || '{}'); } catch (e) { ctx.json(res, 400, { error: 'bad JSON' }); return true; }
  try { const r = post(ctx, b) || bad(500, 'no result'); const code = r.code || 200; delete r.code; ctx.json(res, code, r); } catch (e) { ctx.json(res, 500, { error: e.message }); }
  return true;
}
module.exports = { handle, info, post, readFile, fileOf, applyChange, pautoNorm, pautoEffective, KINDS, KEYS, CHAR_KEYS, ABOUT };
