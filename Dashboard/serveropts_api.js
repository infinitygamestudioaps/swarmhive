// SERVER OPTIONS API (SRVOPT-2026-10-21; public tester Hero: "is it possible to modularize these? ... choose between 4 types of buffers ...
// return options ... 'follow party leader's dialogue' in a tick box"; owner: "Fix 3 and 4"). Loaded by server.js (one hook, like partyauto_api.js).
// The server-dependent features of a party: where its buffs come from, how it gets back to town, and whether the server takes the party along
// at gatekeepers. EVERY default = today's behaviour (the bots work exactly as before while nothing is set).
//   GET  /api/serveropts   { file, exists, rev, broken, data: { v, default, parties }, sources, ways, defaults, all, towns, parties: [{ leader, members, eff }] }
//   POST /api/serveropts   { party, values: { buffSources | townWays | serverFollow | returnSkills | walkMax | store | station | newbie : value | null }, rev?, by? }
//                          only that party's entry is changed; null = removed (= the setting for all parties / the built-in default);
//                          { all: true } instead of party = the "default" entry (every party without its own). rev = the file's sha the caller read
//                          (409 + conflict when it changed meanwhile); lock + history (Scripts/data/history/server_options_<time>.json, last 50) +
//                          atomic write (docs/plan/tools/manual_guard.js) + one line in Logs/dashboard_commands.log.
// File: Scripts/data/server_options.json (env SWARM_SERVEROPTS_FILE overrides it: the tests use a scratch copy). Missing = today's behaviour.
// swarm.js SRVOPT-PURE reads it live every 5 s; the block below is a TEXT COPY of it (docs/plan/tools/test_server_options.js checks they are equal).
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const NAME_RE = /^[A-Za-z0-9_\-]{1,40}$/;
// SRVOPT-PURE-BEGIN (no host calls in here: docs/plan/tools/test_server_options.js runs this block in node; Dashboard/serveropts_api.js = text copy)
const SRVOPT = {
  sources: ['board', 'party', 'store', 'station', 'newbie'],
  ways: ['auto', 'townCmd', 'returnSkill', 'soe', 'gatekeeper', 'walk'],
  def: { buffSources: ['board', 'party'], townWays: ['auto'], serverFollow: true, returnSkills: [], walkMax: 40000,
    store: { buffs: [], maxPrice: 5000, titles: ['buff'], minLeftMin: 60 },
    station: { town: 'Giran', x: 0, y: 0, z: 0, buffers: [], minBuffs: 5 },
    newbie: { npc: "Newbie Helper|Newbie Guide|Adventurers' Guide", maxLevel: 62, minBuffs: 4 } },
  returnRe: /^(Return|Escape|Blessed Return|Party Recall|Mass Return)$/i,
  newbieWant: /buff|magic|support|blessing|assist|power/i,
  newbieAvoid: /quest|teleport|shop|buy|sell|exchange|coupon|soulshot|spiritshot|weapon|armor|tutorial|back|close|cancel/i,
};
function soObj(x) { return x && typeof x === 'object' && !Array.isArray(x) ? x : {}; }
function soList(v, allowed) { if (!Array.isArray(v)) return null; const out = []; v.forEach(x => { const s = String(x); if (allowed.indexOf(s) >= 0 && out.indexOf(s) < 0) out.push(s); }); return out.length ? out : null; }
function soNum(v, d, lo, hi) { const n = Number(v); return v === null || v === undefined || v === '' || typeof v === 'boolean' || !isFinite(n) ? d : Math.max(lo, Math.min(hi, Math.round(n))); }
function soNames(v, max) { return Array.isArray(v) ? v.map(x => String(x == null ? '' : x).trim()).filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).slice(0, max || 20) : []; }
function soNorm(j) { const o = soObj(j); return { v: 1, default: soObj(o.default), parties: soObj(o.parties) }; }
/** the options of party `leader`: party > default (all parties) > swarm.config.json (serverFollow) > built-in. src.<key> = where it came from */
function soEffective(j, leader, cfg) {
  const J = soNorm(j), P = soObj(J.parties[leader]), D = J.default, C = soObj(cfg), S = SRVOPT.def, out = { src: {} };
  const pick = (k) => (P[k] !== undefined && P[k] !== null ? { v: P[k], src: 'party' } : D[k] !== undefined && D[k] !== null ? { v: D[k], src: 'default' } : { v: undefined, src: 'builtin' });
  { const p = pick('buffSources'), l = soList(p.v, SRVOPT.sources); out.buffSources = l || S.buffSources.slice(); out.src.buffSources = l ? p.src : 'builtin'; }
  { const p = pick('townWays'), l = soList(p.v, SRVOPT.ways); out.townWays = l && l.indexOf('auto') < 0 ? l : ['auto']; out.src.townWays = l ? p.src : 'builtin'; }
  { const p = pick('serverFollow'); if (typeof p.v === 'boolean') { out.serverFollow = p.v; out.src.serverFollow = p.src; } else if (typeof C.serverFollow === 'boolean') { out.serverFollow = C.serverFollow; out.src.serverFollow = 'config'; } else { out.serverFollow = S.serverFollow; out.src.serverFollow = 'builtin'; } }
  { const p = pick('returnSkills'); out.returnSkills = Array.isArray(p.v) ? p.v.map(Number).filter(n => n > 0 && n < 100000 && Math.round(n) === n).slice(0, 10) : []; }
  out.walkMax = soNum(pick('walkMax').v, S.walkMax, 2000, 200000);
  { const s = soObj(pick('store').v); out.store = { buffs: soNames(s.buffs, 30), maxPrice: soNum(s.maxPrice, S.store.maxPrice, 0, 100000000), titles: soNames(s.titles, 10).length ? soNames(s.titles, 10) : S.store.titles.slice(), minLeftMin: soNum(s.minLeftMin, S.store.minLeftMin, 1, 720) }; }
  { const s = soObj(pick('station').v); out.station = { town: String(s.town || S.station.town), x: soNum(s.x, 0, -400000, 400000), y: soNum(s.y, 0, -400000, 400000), z: soNum(s.z, 0, -30000, 30000), buffers: soNames(s.buffers, 9), minBuffs: soNum(s.minBuffs, S.station.minBuffs, 1, 40) }; }
  { const s = soObj(pick('newbie').v); out.newbie = { npc: String(s.npc || S.newbie.npc).slice(0, 120), maxLevel: soNum(s.maxLevel, S.newbie.maxLevel, 1, 99), minBuffs: soNum(s.minBuffs, S.newbie.minBuffs, 1, 40) }; }
  return out;
}
/** the first buff source in `order` that works now; avail[src] = true or the reason it does not -> { src, skipped: [{ src, why }] } ('party' when none) */
function soBuffPick(order, avail) {
  const skipped = [];
  for (const s of (order && order.length ? order : SRVOPT.def.buffSources)) {
    const a = avail ? avail[s] : undefined;
    if (a === true) return { src: s, skipped };
    skipped.push({ src: s, why: typeof a === 'string' ? a : 'not available' });
  }
  return { src: 'party', skipped };
}
/** the town ways to try, in order; null = 'auto' (today's code path untouched) */
function soTownWays(order) { const l = soList(order, SRVOPT.ways); return !l || l.indexOf('auto') >= 0 ? null : l; }
/** the dialog link to click: wanted text, never an avoided one; links = [{ cmd, text }] */
function soPickLink(links, wantRe, avoidRe) {
  const ok = (links || []).filter(l => l && l.cmd && wantRe.test(String(l.text || '')) && !(avoidRe && avoidRe.test(String(l.text || ''))));
  return ok.length ? ok.sort((a, b) => String(a.text).length - String(b.text).length)[0] : null;
}
/** a station buffer that still has to buff me: in list order, not done, online */
function soStationNext(buffers, done, online) { for (const n of (buffers || [])) { if ((done || []).indexOf(n) >= 0) continue; if (online && !online(n)) continue; return n; } return null; }
/** the wanted store buffs I should buy now: have = { name: secondsLeft } */
function soStoreWanted(names, have, minLeftSec) { return (names || []).filter(n => !((have || {})[n] > minLeftSec)); }
/** a buff store seller's title matches one of the keywords (whole words, case-insensitive) */
function soTitleRe(titles) { const w = soNames(titles, 10).map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')); return new RegExp(w.length ? '(' + w.join('|') + ')' : 'buff', 'i'); }
/** does a non-board source want a turn? s = source, count = long buffs on me, wanted = store buffs still to buy */
function soNeedsOther(s, eff, count, wanted) {
  if (s === 'store') return (wanted || []).length > 0;
  if (s === 'station') return count < eff.station.minBuffs;
  if (s === 'newbie') return count < eff.newbie.minBuffs;
  return false;
}
// SRVOPT-PURE-END
const SOURCE_INFO = {
  board: { label: 'Community Board (Alt+B)', help: 'The free buffer of the server board (Alt+B, Buffs, a scheme, Buff Me). Used only when the board works on this server.' },
  party: { label: "The party's own buffers", help: 'Buffers in the party (prophets, songs and dances ...) keep everyone buffed by their buff plan. Nobody leaves the party for buffs.' },
  store: { label: 'Buy from player buff stores', help: 'In a town, buy the buffs you list from player buff stores (sellers found by their title), at most your price per buff.' },
  station: { label: 'Own buffers waiting in a town', help: "Your own buffer characters stand at one spot in a town. A character that needs buffs walks there, joins each buffer's party one by one, gets buffed, leaves, and its own leader invites it back." },
  newbie: { label: 'Newbie Helper', help: 'The Newbie Helper NPC in a town or village buffs low-level characters (up to the level you set).' },
};
const WAY_INFO = {
  auto: { label: 'Automatic (as before)', help: '.townname when the server knows it, else the gatekeepers (learned by itself). A Scroll of Escape only when running from a fight alone.' },
  townCmd: { label: '.townname command', help: 'The free server command (.giran, .dion ...).' },
  returnSkill: { label: 'Return skill', help: 'A class skill that takes the character to town (Return, Escape ...): only characters that have one.' },
  soe: { label: 'Scroll of Escape', help: 'Reads a Scroll of Escape (any kind) from the bag.' },
  gatekeeper: { label: 'Gatekeeper', help: 'Walks to the nearest gatekeeper and teleports (inside a dungeon a Scroll of Escape first).' },
  walk: { label: 'Walk back', help: 'Walks to the nearest town along the wall-checked path (only when the town is not too far).' },
};
const TOWNS = ['Gludin', 'Gludio', 'Dion', 'Giran', 'Oren', 'Aden', 'Hunters', 'Heine', 'Goddard', 'Rune', 'Schuttgart'];
let G = null;
function guard(ctx) { if (!G) G = require(path.join(ctx.ROOT || path.join(__dirname, '..'), 'docs', 'plan', 'tools', 'manual_guard.js')); return G; }
const fileOf = (ctx) => process.env.SWARM_SERVEROPTS_FILE || (ctx && ctx.serverOptsFile) || path.join(ctx.DATA, 'server_options.json');
const sha = (t) => t ? crypto.createHash('sha1').update(t).digest('hex').slice(0, 16) : '';
const isoNow = () => new Date().toISOString();
const ABOUT = "Server options per party (dashboard -> party card -> Settings -> Server). Missing = today's behaviour: buffs from the Community Board when it works, else the party's own buffers; the way to town 'auto'; the server takes the party along at gatekeepers.";

function readFile(ctx) {
  const F = fileOf(ctx); let raw = '';
  try { raw = fs.readFileSync(F, 'utf8'); } catch (e) { return { exists: false, raw: '', rev: '', data: soNorm({}) }; }
  try { return { exists: true, raw, rev: sha(raw), data: soNorm(raw.trim() ? JSON.parse(raw.replace(/^﻿/, '')) : {}) }; }
  catch (e) { return { exists: true, raw, rev: sha(raw), data: null, broken: e.message }; }
}
function parties(ctx) {
  try { let K; try { K = require('./kamapage_api'); } catch (e) { K = require(path.join(ctx.ROOT, 'Dashboard', 'kamapage_api')); } return K.partyList(ctx).map(p => ({ leader: p.leader, names: p.names })); }
  catch (e) { return []; }
}
function cfgOf(ctx) { try { return JSON.parse(fs.readFileSync(path.join(ctx.ROOT, 'swarm.config.json'), 'utf8').replace(/^﻿/, '')); } catch (e) { return null; } }
function info(ctx) {
  const R = readFile(ctx), D = R.data || soNorm({}), cfg = cfgOf(ctx);
  const P = parties(ctx).map(({ leader, names }) => ({ leader, members: names, eff: soEffective(D, leader, cfg) }));
  return { file: path.basename(fileOf(ctx)), exists: R.exists, rev: R.rev, broken: R.broken || null, data: D,
    sources: SRVOPT.sources.map(k => Object.assign({ key: k }, SOURCE_INFO[k])), ways: SRVOPT.ways.map(k => Object.assign({ key: k }, WAY_INFO[k])),
    defaults: SRVOPT.def, all: soEffective(D, '', cfg), towns: TOWNS, parties: P };
}

/** one value from a POST -> the cleaned value | null (remove) | undefined (an error was pushed) */
function cleanValue(k, v, errors) {
  if (v === null) return null;
  const whole = (x, lo, hi, what) => { const n = Number(x); if (x === '' || x === null || x === undefined || typeof x === 'boolean' || !Number.isFinite(n) || Math.round(n) !== n || n < lo || n > hi) { errors.push(`${what} must be a whole number from ${lo} to ${hi}`); return undefined; } return n; };
  const names = (x, max, what, re) => { if (!Array.isArray(x) || x.length > max) { errors.push(`${what}: a list of at most ${max}`); return undefined; } const out = []; for (const s0 of x) { const s = String(s0 == null ? '' : s0).trim(); if (!s) continue; if (s.length > 60 || (re && !re.test(s))) { errors.push(`${what}: "${s.slice(0, 40)}" is not valid`); return undefined; } if (!out.includes(s)) out.push(s); } return out; };
  const tbl = (x, what, keys) => { if (!x || typeof x !== 'object' || Array.isArray(x)) { errors.push(`${what}: a table of settings`); return null; } const badK = Object.keys(x).filter(q => !keys.includes(q)); if (badK.length) { errors.push(`${what}: unknown setting "${badK[0].slice(0, 20)}"`); return null; } return x; };
  const list = (x, allowed, max, what) => {
    if (!Array.isArray(x) || !x.length || x.length > max) { errors.push(`${what}: a list of 1 to ${max}`); return undefined; }
    const out = []; for (const s of x) { if (!allowed.includes(String(s))) { errors.push(`${what}: unknown "${String(s).slice(0, 20)}"`); return undefined; } if (!out.includes(String(s))) out.push(String(s)); }
    return out;
  };
  if (k === 'buffSources') return list(v, SRVOPT.sources, SRVOPT.sources.length, 'buff sources');
  if (k === 'townWays') { const out = list(v, SRVOPT.ways, SRVOPT.ways.length, 'ways to town'); if (out && out.includes('auto') && out.length > 1) { errors.push('ways to town: "auto" stands alone (it is the old behaviour)'); return undefined; } return out; }
  if (k === 'serverFollow') { if (typeof v !== 'boolean') { errors.push('follow the leader at gatekeepers: true or false'); return undefined; } return v; }
  if (k === 'returnSkills') { if (!Array.isArray(v) || v.length > 10) { errors.push('return skills: a list of at most 10 skill ids'); return undefined; } const out = []; for (const x of v) { const n = whole(x, 1, 99999, 'a return skill id'); if (n === undefined) return undefined; if (!out.includes(n)) out.push(n); } return out; }
  if (k === 'walkMax') return whole(v, 2000, 200000, 'walk back at most');
  if (k === 'store') {
    const o = tbl(v, 'buff stores', ['buffs', 'maxPrice', 'titles', 'minLeftMin']); if (!o) return undefined;
    const out = {}, b0 = errors.length;
    if (o.buffs !== undefined) { const l = names(o.buffs, 30, 'store buffs', /^[A-Za-z0-9][A-Za-z0-9 '\-:.]{0,59}$/); if (l) out.buffs = l; }
    if (o.titles !== undefined) { const l = names(o.titles, 10, 'store title words', /^[^<>"]{1,30}$/); if (l) out.titles = l; }
    if (o.maxPrice !== undefined) { const n = whole(o.maxPrice, 0, 100000000, 'the max price per buff'); if (n !== undefined) out.maxPrice = n; }
    if (o.minLeftMin !== undefined) { const n = whole(o.minLeftMin, 1, 720, 'buy again when less than (minutes)'); if (n !== undefined) out.minLeftMin = n; }
    return errors.length > b0 ? undefined : out;
  }
  if (k === 'station') {
    const o = tbl(v, 'buffer station', ['town', 'x', 'y', 'z', 'buffers', 'minBuffs']); if (!o) return undefined;
    const out = {}, b0 = errors.length;
    if (o.town !== undefined) { if (!/^[A-Za-z][A-Za-z ']{1,29}$/.test(String(o.town))) errors.push('buffer station: the town name is not valid'); else out.town = String(o.town); }
    ['x', 'y', 'z'].forEach(q => { if (o[q] !== undefined) { const n = whole(o[q], q === 'z' ? -30000 : -400000, q === 'z' ? 30000 : 400000, `the station ${q}`); if (n !== undefined) out[q] = n; } });
    if (o.buffers !== undefined) { const l = names(o.buffers, 9, 'station buffers', NAME_RE); if (l) out.buffers = l; }
    if (o.minBuffs !== undefined) { const n = whole(o.minBuffs, 1, 40, 'go to the station below (buffs)'); if (n !== undefined) out.minBuffs = n; }
    return errors.length > b0 ? undefined : out;
  }
  if (k === 'newbie') {
    const o = tbl(v, 'Newbie Helper', ['npc', 'maxLevel', 'minBuffs']); if (!o) return undefined;
    const out = {}, b0 = errors.length;
    if (o.npc !== undefined) { const s = String(o.npc || '').trim(); let okRe = s.length > 0 && s.length <= 120; try { new RegExp(s, 'i'); } catch (e) { okRe = false; } if (!okRe) errors.push('Newbie Helper: the NPC name is not valid'); else out.npc = s; }
    if (o.maxLevel !== undefined) { const n = whole(o.maxLevel, 1, 99, 'the Newbie Helper level limit'); if (n !== undefined) out.maxLevel = n; }
    if (o.minBuffs !== undefined) { const n = whole(o.minBuffs, 1, 40, 'go to the Newbie Helper below (buffs)'); if (n !== undefined) out.minBuffs = n; }
    return errors.length > b0 ? undefined : out;
  }
  errors.push(`unknown setting "${String(k).slice(0, 30)}"`); return undefined;
}
const KEYS = ['buffSources', 'townWays', 'serverFollow', 'returnSkills', 'walkMax', 'store', 'station', 'newbie'];
/** apply one party's (or the all-parties) change -> { ok, data } | { ok: false, errors } */
function applyChange(data, b) {
  const errors = [], J = JSON.parse(JSON.stringify(soNorm(data))), all = !!(b && b.all === true);
  const party = String((b && b.party) || '').trim();
  if (!all && !NAME_RE.test(party)) return { ok: false, errors: ['party: not a character name'] };
  const vals = b && b.values && typeof b.values === 'object' && !Array.isArray(b.values) ? b.values : {};
  const P = Object.assign({}, all ? J.default : soObj(J.parties[party]));
  Object.keys(vals).forEach(k => {
    if (!KEYS.includes(k)) { errors.push(`unknown setting "${String(k).slice(0, 30)}"`); return; }
    const v = cleanValue(k, vals[k], errors);
    if (v === undefined) return;
    if (v === null) delete P[k]; else P[k] = v;
  });
  if (all) J.default = P; else if (Object.keys(P).length) J.parties[party] = P; else delete J.parties[party];
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
      if (R.broken) { result = bad(500, `${path.basename(F)} does not parse (${R.broken}): fix or restore it from history/ first`); return; }
      if (b.rev !== undefined && b.rev !== null && String(b.rev) !== R.rev) { result = bad(409, 'the server options were changed meanwhile (another page or a tool): reload and try again', { rev: R.rev, conflict: true }); return; }
      const a = applyChange(R.data, b);
      if (!a.ok) { result = bad(400, a.errors.join('; '), { errors: a.errors }); return; }
      const out = Object.assign({ _about: ABOUT }, a.data, { v: 1, _updated: isoNow() });
      const hist = R.exists ? Gd.saveHistory(F, path.dirname(F), 50) : null;
      const txt = JSON.stringify(out, null, 1) + '\n';
      Gd.atomicWrite(F, txt);
      try { fs.appendFileSync(path.join(ctx.LOGS, 'dashboard_commands.log'), `${isoNow()}\tserveropts\tsave\t${by}: ${JSON.stringify({ party: b.all ? '(all parties)' : b.party, values: b.values || {} }).slice(0, 900)}\r\n`); } catch (e) { }
      result = { code: 200, ok: true, rev: sha(txt), data: soNorm(out), history: hist ? path.basename(hist) : null };
    }, { who: 'serveropts save' });
  } catch (e) { return bad(500, e.message); }
  return result;
}
async function handle(req, res, url, ctx) {
  if (url.pathname !== '/api/serveropts') return false;
  if (!ctx.allowed(req, url)) { ctx.send(res, 401, 'text/plain; charset=utf-8', 'Access denied'); return true; }
  if (req.method === 'GET') { try { ctx.json(res, 200, info(ctx)); } catch (e) { ctx.json(res, 500, { error: e.message }); } return true; }
  if (req.method !== 'POST') { ctx.json(res, 405, { error: 'GET or POST' }); return true; }
  let b = {}; try { let t = ''; for await (const c of req) t += c; b = JSON.parse(t || '{}'); } catch (e) { ctx.json(res, 400, { error: 'bad JSON' }); return true; }
  try { const r = post(ctx, b) || bad(500, 'no result'); const code = r.code || 200; delete r.code; ctx.json(res, code, r); } catch (e) { ctx.json(res, 500, { error: e.message }); }
  return true;
}
module.exports = { handle, info, post, readFile, fileOf, applyChange, cleanValue, soNorm, soEffective, soBuffPick, soTownWays, soPickLink, soStationNext, soStoreWanted, soTitleRe, soNeedsOther, SRVOPT, SOURCE_INFO, WAY_INFO, TOWNS, KEYS };
