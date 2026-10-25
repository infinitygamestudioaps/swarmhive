// ADENA PAGE API (user 2026-10-12: "the adena from another party should be 100% customizable, not something we can assume").
// Loaded by server.js (one hook, BEFORE the key check like buffpage_api.js / tradepage_api.js). Public (no secrets): /fundpage.js, /fundpage.css.
//   GET  /api/fundrules              { rules, rev, exists, towns, clanLeader, parties: [{ leader, members: [{ name, adena, online, level, cls, town, ageSec }] }],
//                                      log: [{ name, at, party }] (Logs/fund_log.json: name -> last hand-out ms, newest first) }
//   POST /api/fundrules { rules, rev? }   sanitized (fundSanitize: numbers >= 0, "8m" / "300k" / "8,000,000" accepted, town one of the 11,
//                                      givers.mode auto | list | none (also parties.<leader>.givers = that party's own givers, 2026-10-13); unknown parties / characters are KEPT, target 0 is kept = never receives;
//                                      blank = removed = the party / default value), _readme kept, _updated set; lock + rev check (409 when the
//                                      file changed since the page loaded it), a history copy (Scripts/data/history/fund_rules_<time>.json, last 50),
//                                      atomic tmp + rename (manual_guard.js), one line in Logs/dashboard_commands.log.
// File: Scripts/data/fund_rules.json (env SWARM_FUNDRULES_FILE overrides it; SWARM_FUNDLOG_FILE the log: the tests use scratch copies).
// The bots (swarm.js CROSS-TEAM FUNDING, fundRules()) re-read the file every 30 s.
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const STATIC = { '/fundpage.js': 'application/javascript; charset=utf-8', '/fundpage.css': 'text/css; charset=utf-8' };
const TOWN_KEYS = ['Gludin', 'Gludio', 'Dion', 'Giran', 'Oren', 'Aden', 'Hunters', 'Heine', 'Goddard', 'Rune', 'Schuttgart'];   // = swarm.js TOWNS keys with a .townname
const TOWN_POS = { Giran: [83473, 148554], Gludin: [-80786, 150251], Gludio: [-12712, 122776], Dion: [15619, 143132], Oren: [82760, 53578], Aden: [147448, 25816],
  Hunters: [116589, 76268], Heine: [111381, 218981], Goddard: [147732, -56554], Rune: [43835, -47749], Schuttgart: [87126, -143520] };   // same table as tradepage_api.js
const README = 'Cross-party adena (dashboard -> Adena). Read by every bot every 30 s. target 0 = never receives; empty = the party / default value.';
const NAME_RE = /^[A-Za-z0-9_\-]{1,40}$/;

let G = null;
function guard(ctx) { if (!G) G = require(path.join(ctx.ROOT, 'docs', 'plan', 'tools', 'manual_guard.js')); return G; }
const rulesFile = (ctx) => process.env.SWARM_FUNDRULES_FILE || ctx.fundRulesFile || path.join(ctx.DATA, 'fund_rules.json');
const logFile = (ctx) => process.env.SWARM_FUNDLOG_FILE || ctx.fundLogFile || path.join(ctx.LOGS, 'fund_log.json');
const sha = (t) => t ? crypto.createHash('sha1').update(t).digest('hex').slice(0, 16) : '';
const isoNow = () => new Date().toISOString();

function readRules(ctx) {
  const F = rulesFile(ctx);
  let raw = ''; try { raw = fs.readFileSync(F, 'utf8'); } catch (e) { }
  let data = null; try { data = raw ? JSON.parse(raw.replace(/^﻿/, '')) : {}; } catch (e) { return { raw, rev: sha(raw), data: null, broken: e.message, exists: true }; }
  if (!data || typeof data !== 'object' || Array.isArray(data)) data = {};
  return { raw, rev: sha(raw), data, exists: !!raw };
}
function townNear(x, y) { let best = '', bd = 6000; Object.keys(TOWN_POS).forEach(t => { const d = Math.hypot(TOWN_POS[t][0] - x, TOWN_POS[t][1] - y); if (d < bd) { bd = d; best = t; } }); return best; }
function cfgFresh(ctx) {
  try { return JSON.parse(fs.readFileSync(path.join(ctx.ROOT, 'swarm.config.json'), 'utf8').replace(/^﻿/, '')); } catch (e) { }
  try { return ctx.reloadCfg() || {}; } catch (e) { return {}; }
}
function clanLeader(ctx, cfg) {
  const cq = ctx.readJson(path.join(ctx.DATA, 'clan_quests.json'), null);
  return (cq && cq.clan && cq.clan.leader) || (cfg && cfg.clanLeader) || '';
}
function parties(ctx) { let K; try { K = require('./kamapage_api'); } catch (e) { K = require(path.join(ctx.ROOT, 'Dashboard', 'kamapage_api')); } return K.partyList(ctx); }

// ------------------------------------------------------------------------------------------------------------------- sanitize
/** "8m" | "300k" | "8,000,000" | 8000000 -> number; '' / null / undefined -> null; anything else -> NaN */
function parseAmount(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  const s = String(v).trim().toLowerCase().replace(/[\s,_']/g, '');
  if (!s) return null;
  const m = s.match(/^(-?\d+(?:\.\d+)?)([kmb]?)$/); if (!m) return NaN;
  return Math.round(Number(m[1]) * ({ '': 1, k: 1e3, m: 1e6, b: 1e9 })[m[2]]);
}
/** the posted rules -> { ok, rules } | { ok: false, errors: [...] } (unknown parties / characters kept, 0 kept, blank = removed) */
function fundSanitize(input, prev) {
  const errors = [], r = input && typeof input === 'object' && !Array.isArray(input) ? input : null;
  if (!r) return { ok: false, errors: ['rules must be an object'] };
  const old = prev && typeof prev === 'object' ? prev : {};
  const amt = (v, label, opt = {}) => {
    const n = parseAmount(v);
    if (n === null) { if (opt.blank) return null; errors.push(`${label}: missing`); return 0; }
    if (Number.isNaN(n)) { errors.push(`${label}: "${String(v).slice(0, 20)}" is not a number`); return 0; }
    if (n < 0) { errors.push(`${label}: must be 0 or more`); return 0; }
    if (opt.max !== undefined && n > opt.max) { errors.push(`${label}: at most ${opt.max}`); return 0; }
    return Math.round(n);
  };
  const out = {};
  // unknown top-level keys travel along (future fields), the known ones are rebuilt below
  Object.keys(r).forEach(k => { if (!/^(on|town|everyMin|minGive|slack|brokeBelow|givers|defaults|parties|chars|memberKeep|_readme|_updated)$/.test(k) && k.length <= 40) out[k] = r[k]; });
  out._readme = typeof old._readme === 'string' && old._readme ? old._readme : typeof r._readme === 'string' && r._readme ? r._readme.slice(0, 1000) : README;
  out.on = r.on === undefined ? true : !!r.on;
  const tw = String(r.town || 'Giran').trim(), town = TOWN_KEYS.find(t => t.toLowerCase() === tw.toLowerCase());
  if (!town) errors.push(`town: "${tw.slice(0, 20)}" is not one of ${TOWN_KEYS.join(', ')}`);
  out.town = town || 'Giran';
  out.everyMin = amt(r.everyMin, 'every (min)', { max: 100000 });
  out.minGive = amt(r.minGive, 'minimum hand-out');
  out.slack = amt(r.slack, 'top-up slack');
  out.brokeBelow = amt(r.brokeBelow, 'broke below');
  const g = r.givers && typeof r.givers === 'object' ? r.givers : {};
  const mode = String(g.mode || 'collector');   // FUNDCOLLECTOR-2026-10-25: the collector is the default giver (owner: not auto selected)
  if (!['auto', 'list', 'none', 'collector'].includes(mode)) errors.push(`givers mode: "${mode.slice(0, 20)}" (collector | list | none | auto)`);
  const list = [];
  (Array.isArray(g.list) ? g.list : []).forEach(n => { n = String(n || '').trim(); if (!n) return; if (!NAME_RE.test(n)) { errors.push(`givers: "${n.slice(0, 40)}" is not a character name`); return; } if (!list.includes(n)) list.push(n); });
  if (list.length > 300) errors.push('givers: at most 300 names');
  out.givers = { mode: ['auto', 'list', 'none', 'collector'].includes(mode) ? mode : 'collector', list, keepAtLeast: amt(g.keepAtLeast, 'always keeps at least') };
  const d = r.defaults && typeof r.defaults === 'object' ? r.defaults : {};
  out.defaults = { leaderTarget: amt(d.leaderTarget, 'default leader target'), memberTarget: amt(d.memberTarget, 'default member target'), clanLeaderTarget: amt(d.clanLeaderTarget, 'default clan leader target') };
  out.parties = {};
  const P = r.parties && typeof r.parties === 'object' && !Array.isArray(r.parties) ? r.parties : {};
  if (Object.keys(P).length > 300) errors.push('parties: at most 300');
  Object.keys(P).forEach(k => {
    if (!NAME_RE.test(k)) { errors.push(`party "${k.slice(0, 40)}": not a character name`); return; }
    const p = P[k] && typeof P[k] === 'object' ? P[k] : {}, o = { receive: p.receive === undefined ? true : !!p.receive };
    const lt = amt(p.leaderTarget, `party ${k} leader target`, { blank: true }), mt = amt(p.memberTarget, `party ${k} member target`, { blank: true });
    if (lt !== null) o.leaderTarget = lt; if (mt !== null) o.memberTarget = mt;
    // FUNDGIVERS 2026-10-13: the party's OWN givers (who may give to THIS party); missing = the shared givers rule (old files unchanged)
    if (p.givers !== undefined && p.givers !== null) {
      const pg = p.givers && typeof p.givers === 'object' ? p.givers : {}, pm = String(pg.mode || '');
      if (!['auto', 'list', 'none', 'collector'].includes(pm)) errors.push(`party ${k} givers mode: "${pm.slice(0, 20)}" (collector | list | none | auto)`);
      else {
        const pl = []; (Array.isArray(pg.list) ? pg.list : []).forEach(n => { n = String(n || '').trim(); if (!n) return; if (!NAME_RE.test(n)) { errors.push(`party ${k} givers: "${n.slice(0, 40)}" is not a character name`); return; } if (!pl.includes(n)) pl.push(n); });
        if (pl.length > 300) errors.push(`party ${k} givers: at most 300 names`);
        o.givers = { mode: pm, list: pm === 'list' ? pl : [] };
      }
    }
    // PURSE 2026-10-13: "Leader pays his members' gear & supplies" = parties.<leader>.purse { on, leaderKeep, memberCap (0 = no cap), budget (0 = no limit) };
    // missing = OFF (the bots' default). Amounts blank = the bots' defaults (2,000,000 / 5,000,000 / no limit).
    if (p.purse !== undefined && p.purse !== null) {
      const q = p.purse && typeof p.purse === 'object' && !Array.isArray(p.purse) ? p.purse : null;
      if (!q) errors.push(`party ${k} purse: must be an object`);
      else {
        const pu = { on: q.on === true };
        const lk = amt(q.leaderKeep, `party ${k} leader keeps at least`, { blank: true }), mc = amt(q.memberCap, `party ${k} at most per member`, { blank: true }), bu = amt(q.budget, `party ${k} at most per run`, { blank: true });
        if (lk !== null) pu.leaderKeep = lk; if (mc !== null) pu.memberCap = mc; if (bu !== null) pu.budget = bu;
        o.purse = pu;
      }
    }
    // FUNDCOLLECTOR-2026-10-25: the party's own surplus rule for the collector { above, keep } (blank = the shared deposit values)
    if (p.deposit && typeof p.deposit === 'object') { const da = amt(p.deposit.above, `party ${k} surplus above`, { blank: true }), dk = amt(p.deposit.keep, `party ${k} surplus keeps`, { blank: true }); const od = {}; if (da !== null) od.above = da; if (dk !== null) od.keep = dk; if (Object.keys(od).length) o.deposit = od; }
    out.parties[k] = o;
  });
  // FUNDCOLLECTOR-2026-10-25: surplus to the collector { on, above, keep, againMin }
  if (r.deposit !== undefined && r.deposit !== null) { const D = r.deposit && typeof r.deposit === 'object' ? r.deposit : {}; out.deposit = { on: D.on === true, above: amt(D.above, 'surplus above'), keep: amt(D.keep, 'surplus keeps'), againMin: amt(D.againMin === undefined ? 120 : D.againMin, 'surplus again after (min)', { max: 100000 }) }; if (out.deposit.keep > out.deposit.above) errors.push('surplus: keeps must not be more than the limit'); }
  // PURSE 2026-10-13: the pocket money each character keeps when it buys gear, by level: [[below level, keep], ...] (missing = the bots' default
  // 5k <20, 50k <40, 150k <60, 300k after). Rows sorted by level; the last row covers every higher level.
  if (r.memberKeep !== undefined && r.memberKeep !== null) {
    if (!Array.isArray(r.memberKeep) || !r.memberKeep.length || r.memberKeep.length > 20) errors.push('pocket money by level: 1 to 20 rows');
    else {
      const rows = [];
      r.memberKeep.forEach((x, i) => {
        if (!Array.isArray(x) || x.length !== 2) { errors.push(`pocket money row ${i + 1}: [below level, keep]`); return; }
        const lv = Number(x[0]); if (!Number.isInteger(lv) || lv < 2 || lv > 999) { errors.push(`pocket money row ${i + 1}: level "${String(x[0]).slice(0, 10)}" (2 to 999)`); return; }
        const kp = amt(x[1], `pocket money below level ${lv}`); rows.push([lv, kp]);
      });
      rows.sort((a, b) => a[0] - b[0]);
      if (rows.some((x, i) => i && x[0] === rows[i - 1][0])) errors.push('pocket money: the same level twice');
      out.memberKeep = rows;
    }
  }
  out.chars = {};
  const C = r.chars && typeof r.chars === 'object' && !Array.isArray(r.chars) ? r.chars : {};
  if (Object.keys(C).length > 1000) errors.push('characters: at most 1000');
  Object.keys(C).forEach(k => {
    if (!NAME_RE.test(k)) { errors.push(`character "${k.slice(0, 40)}": not a character name`); return; }
    const c = C[k], v = c && typeof c === 'object' ? c.target : c;
    const t = amt(v, `${k} own target`, { blank: true });
    if (t !== null) out.chars[k] = { target: t };   // 0 kept = never receives; blank = no entry = party / default
  });
  out._updated = isoNow();
  return errors.length ? { ok: false, errors } : { ok: true, rules: out };
}

// ------------------------------------------------------------------------------------------------------------------- read
function info(ctx) {
  const R = readRules(ctx), cfg = cfgFresh(ctx);
  const states = {}; (ctx.readStates() || []).forEach(s => { states[s.name] = s; });
  const member = (n) => {
    const s = states[n] || {}, x = Number(s.x), y = Number(s.y);
    return { name: n, adena: s.adena != null && isFinite(Number(s.adena)) ? Number(s.adena) : null, online: s.ageSec != null && s.ageSec <= 90, ageSec: s.ageSec != null ? s.ageSec : null,
      level: s.level != null ? Number(s.level) : null, cls: s.cls || '', town: Number.isFinite(x) && Number.isFinite(y) && (x || y) ? townNear(x, y) : '',
      // PURSE 2026-10-13 (swarm_state.purse): what its planned gear upgrades miss + its pocket money; the leader's copy carries the party rule as the bot reads it
      purse: s.purse && typeof s.purse === 'object' ? { need: Number(s.purse.need) || 0, want: Number(s.purse.want) || 0, keep: Number(s.purse.keep) || 0, grade: String(s.purse.grade || ''), lock: !!s.purse.lock, auto: s.purse.auto !== false, rule: s.purse.rule || null } : null };
  };
  const P = parties(ctx).map(({ leader, names }) => ({ leader, members: names.map(member) }));
  const CL = clanLeader(ctx, cfg);
  const partyOf = {}; P.forEach(p => p.members.forEach(m => { partyOf[m.name] = p.leader; }));
  const raw = ctx.readJson(logFile(ctx), {}) || {};
  const log = Object.keys(raw).filter(n => isFinite(Number(raw[n])) && Number(raw[n]) > 0).map(n => ({ name: n, at: Number(raw[n]), party: partyOf[n] || '' })).sort((a, b) => b.at - a.at).slice(0, 40);
  const SC = (ctx.readJson(path.join(ctx.DATA, 'stash_rules.json'), {}) || {}).collector, collector = SC && SC.on === true ? String(SC.name || CL || '') : '';   // FUNDCOLLECTOR
  return { file: path.basename(rulesFile(ctx)), exists: !!R.exists, rev: R.rev, broken: R.broken || null, rules: R.data || {}, towns: TOWN_KEYS, clanLeader: CL, collector, parties: P, log };
}

// ------------------------------------------------------------------------------------------------------------------- write
function bad(code, error, extra) { return Object.assign({ code, error }, extra || {}); }
function summary(a, b) {
  const ch = [], f = (v) => v === undefined ? '-' : JSON.stringify(v);
  ['on', 'town', 'everyMin', 'minGive', 'slack', 'brokeBelow'].forEach(k => { if (f(a[k]) !== f(b[k])) ch.push(`${k} ${f(a[k])}->${f(b[k])}`); });
  ['givers', 'defaults', 'memberKeep', 'deposit'].forEach(k => { if (f(a[k]) !== f(b[k])) ch.push(`${k} ${f(b[k])}`); });
  const keys = (o) => Object.keys(o || {});
  new Set(keys(a.parties).concat(keys(b.parties))).forEach(k => { if (f((a.parties || {})[k]) !== f((b.parties || {})[k])) ch.push(`party ${k} ${f((b.parties || {})[k])}`); });
  new Set(keys(a.chars).concat(keys(b.chars))).forEach(k => { if (f((a.chars || {})[k]) !== f((b.chars || {})[k])) ch.push(`${k} ${f(((b.chars || {})[k] || {}).target)}`); });
  return ch.join('; ').slice(0, 1500) || 'no change';
}
function post(ctx, b) {
  if (!b || typeof b !== 'object') return bad(400, 'bad body');
  const F = rulesFile(ctx), Gd = guard(ctx), by = String(b.by || 'dashboard').slice(0, 40);
  fs.mkdirSync(path.dirname(F), { recursive: true });
  let result = null;
  try {
    Gd.withLock(F, () => {
      const R = readRules(ctx);
      if (R.broken) { result = bad(500, `${path.basename(F)} does not parse (${R.broken}) — fix or restore it from history/ first`); return; }
      if (b.rev !== undefined && b.rev !== null && String(b.rev) !== R.rev) { result = bad(409, 'the adena rules were changed meanwhile (another page or a tool) — reload and try again', { rev: R.rev, conflict: true }); return; }
      const s = fundSanitize(b.rules, R.data);
      if (!s.ok) { result = bad(400, s.errors.join('; '), { errors: s.errors }); return; }
      const hist = R.exists ? Gd.saveHistory(F, path.dirname(F), 50) : null;
      const txt = JSON.stringify(s.rules, null, 1) + '\n';
      Gd.atomicWrite(F, txt);
      try { fs.appendFileSync(path.join(ctx.LOGS, 'dashboard_commands.log'), `${isoNow()}\tfundrules\tsave\t${by}: ${summary(R.data || {}, s.rules)}\r\n`); } catch (e) { }
      result = { code: 200, ok: true, rev: sha(txt), rules: s.rules, history: hist ? path.basename(hist) : null };
    }, { who: 'fundrules save' });
  } catch (e) { return bad(500, e.message); }
  return result;
}

async function handle(req, res, url, ctx) {
  const p = url.pathname;
  if (STATIC[p]) {
    res.writeHead(200, { 'Content-Type': STATIC[p], 'Cache-Control': 'no-cache' });
    res.end(fs.readFileSync(path.join(ctx.DIR || __dirname, path.basename(p))));
    return true;
  }
  if (p !== '/api/fundrules') return false;
  if (!ctx.allowed(req, url)) { ctx.send(res, 401, 'text/plain; charset=utf-8', 'Access denied'); return true; }
  if (req.method === 'GET') { try { ctx.json(res, 200, info(ctx)); } catch (e) { ctx.json(res, 500, { error: e.message }); } return true; }
  if (req.method !== 'POST') { ctx.json(res, 405, { error: 'GET or POST' }); return true; }
  let b = {}; try { let t = ''; for await (const c of req) t += c; b = JSON.parse(t || '{}'); } catch (e) { ctx.json(res, 400, { error: 'bad JSON' }); return true; }
  try { const r = post(ctx, b) || bad(500, 'no result'); const code = r.code || 200; delete r.code; ctx.json(res, code, r); } catch (e) { ctx.json(res, 500, { error: e.message }); }
  return true;
}
module.exports = { handle, info, post, readRules, rulesFile, fundSanitize, parseAmount, TOWN_KEYS };
