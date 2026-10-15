// SEVEN SIGNS PAGE API (user 2026-10-12: "Priest of Dawn should not be a given; it must be something you sign up for. Make a tab called
// '7 Signs' where you can enroll groups or single accounts so they sign up automatically. And at the same time respect other commands").
// Loaded by server.js (one hook, BEFORE the key check like fundpage_api.js). Public (no secrets): /sevensigns.js, /sevensigns.css.
//   GET  /api/sevensigns   { file, exists, rev, broken, cfg: { parties, chars, contributeStones }, state (Logs/sevensigns_state.json),
//                            cur: { period, winner, cycle, stale, nextChange } (the bots' own period math, carried over the Monday change),
//                            parties: [{ leader, enrolled, members: [{ name, level, cls, online, ageSec, enrolled, via, registered,
//                            status, tries, at, signedAt, skipped, skipAt, denied, allowed, why, stones: { blue, green, red, total } | null }] }],
//                            log: the last lines of Logs/dawn.log }
//   POST /api/sevensigns { cfg, rev? }   sanitized (names A-Z 0-9 _ -, max 40 chars, no duplicates, any case kept), _readme kept,
//                            _updated set; lock + rev check (409 when the file changed since the page read it), a history copy
//                            (Scripts/data/history/seven_signs_<time>.json, last 50), atomic tmp + rename (manual_guard.js), one line in
//                            Logs/dashboard_commands.log.
// File: Scripts/data/seven_signs.json (env SWARM_SEVENSIGNS_FILE overrides it: the tests use a scratch copy). swarm.js SSOPTIN re-reads it
// every 30 s (no deploy): only enrolled characters / parties walk to the Priest of Dawn by themselves; '!dawn [name]' stays manual.
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const STATIC = { '/sevensigns.js': 'application/javascript; charset=utf-8', '/sevensigns.css': 'text/css; charset=utf-8' };
const README = 'Seven Signs opt-in (dashboard -> 7 Signs). parties = party leader names (the whole party), chars = single characters. Only these sign up with the Lords of Dawn / hand in seal stones by themselves; !dawn [name] is always manual. Read by every bot every 30 s.';
const NAME_RE = /^[A-Za-z0-9_\-]{1,40}$/;
const SEAL = { 6360: 'blue', 6361: 'green', 6362: 'red' };
const CHANGE_UTC_HOUR = 18, CHECK_EVERY_MS = 6 * 3600e3;   // = swarm.js CONFIG.sevenSigns.changeUtcHour / checkEveryMs

const SSL = require('./sslogic');   // SSREASON-2026-10-15: the bots' gate + its one-sentence reason
let G = null;
function guard(ctx) { if (!G) G = require(path.join(ctx.ROOT, 'docs', 'plan', 'tools', 'manual_guard.js')); return G; }
const cfgFile = (ctx) => process.env.SWARM_SEVENSIGNS_FILE || ctx.sevenSignsFile || path.join(ctx.DATA, 'seven_signs.json');
const sha = (t) => t ? crypto.createHash('sha1').update(t).digest('hex').slice(0, 16) : '';
const isoNow = () => new Date().toISOString();

// ------------------------------------------------------------------------------------------- the bots' period math (swarm.js SSGATE-PURE)
function ssgWeek(t, h) { return Math.floor((t - 4 * 864e5 - h * 3600e3) / (7 * 864e5)); }
function ssgCycleOf(period, t, h) { const w = ssgWeek(t, h) - (period === 'validation' || period === 'results' ? 1 : 0); return new Date(w * 7 * 864e5 + 4 * 864e5).toISOString().slice(0, 10); }
function ssgNextChange(t, h) { return (ssgWeek(t, h) + 1) * 7 * 864e5 + 4 * 864e5 + h * 3600e3; }
function ssgNow(s, t, h, everyMs) {
  s = s || {};
  if (!s.checkedAt || !/^(competition|validation)$/.test(s.period || '')) return { period: s.period || 'unknown', winner: 'unknown', cycle: s.period && s.period !== 'unknown' ? ssgCycleOf(s.period, t, h) : null, stale: true, nextChange: ssgNextChange(t, h) };
  const k = ssgWeek(t, h) - ssgWeek(s.checkedAt, h);
  let period = s.period, winner = s.winner || 'unknown';
  if (Math.abs(k) % 2 === 1) { period = s.period === 'competition' ? 'validation' : 'competition'; winner = 'unknown'; }
  else if (k > 0) winner = 'unknown';
  return { period, winner: period === 'validation' ? winner : '', cycle: ssgCycleOf(period, t, h), stale: k > 0 || t - s.checkedAt > everyMs, nextChange: ssgNextChange(t, h) };
}
/** what a character record says for this cycle: 'dawn' | 'dusk' | '' (= swarm.js ssgSide) */
function sideOf(r, cycle) { r = r || {}; return r.cycle && r.cycle === cycle ? (/^(signed|member)$/.test(r.status || '') ? 'dawn' : r.status === 'dusk' ? 'dusk' : '') : ''; }

// ------------------------------------------------------------------------------------------- file
function readCfg(ctx) {
  const F = cfgFile(ctx);
  let raw = ''; try { raw = fs.readFileSync(F, 'utf8'); } catch (e) { }
  let data = null; try { data = raw ? JSON.parse(raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw) : {}; } catch (e) { return { raw, rev: sha(raw), data: null, broken: e.message, exists: true }; }
  if (!data || typeof data !== 'object' || Array.isArray(data)) data = {};
  return { raw, rev: sha(raw), data, exists: !!raw };
}
/** the posted settings -> { ok, cfg } | { ok: false, errors } */
function ssSanitize(input, prev) {
  const errors = [], r = input && typeof input === 'object' && !Array.isArray(input) ? input : null;
  if (!r) return { ok: false, errors: ['settings must be an object'] };
  const old = prev && typeof prev === 'object' ? prev : {};
  const names = (v, label, max) => {
    const out = [];
    if (v !== undefined && !Array.isArray(v)) { errors.push(`${label}: must be a list of names`); return out; }
    (v || []).forEach(n => { n = String(n == null ? '' : n).trim(); if (!n) return; if (!NAME_RE.test(n)) { errors.push(`${label}: "${n.slice(0, 40)}" is not a character name`); return; } if (!out.some(x => x.toLowerCase() === n.toLowerCase())) out.push(n); });
    if (out.length > max) errors.push(`${label}: at most ${max}`);
    return out;
  };
  const out = {};
  out._readme = typeof old._readme === 'string' && old._readme ? old._readme : README;
  out.parties = names(r.parties, 'parties', 300);
  out.chars = names(r.chars, 'characters', 1000);
  out.contributeStones = r.contributeStones === undefined ? (old.contributeStones === undefined ? true : !!old.contributeStones) : !!r.contributeStones;
  Object.keys(r).forEach(k => { if (!/^(parties|chars|contributeStones|_readme|_updated)$/.test(k) && k.length <= 40 && !(k in out)) out[k] = r[k]; });   // future fields travel along
  Object.keys(old || {}).forEach(k => { if (!/^(parties|chars|contributeStones|_readme|_updated)$/.test(k) && k.length <= 40 && !(k in out)) out[k] = old[k]; });   // SSGATE2-2026-10-13: and the file's own (gate, notes) stay
  out._updated = isoNow();
  return errors.length ? { ok: false, errors } : { ok: true, cfg: out };
}
function enrolledVia(cfg, name, party) {
  const lc = (s) => String(s || '').toLowerCase();
  if ((cfg.chars || []).some(x => lc(x) === lc(name))) return 'char';
  if (party && (cfg.parties || []).some(x => lc(x) === lc(party))) return 'party';
  return '';
}

// ------------------------------------------------------------------------------------------- read
function parties(ctx) { let K; try { K = require('./kamapage_api'); } catch (e) { K = require(path.join(ctx.ROOT, 'Dashboard', 'kamapage_api')); } return K.partyList(ctx); }
function logTail(file, lines) {
  try { const st = fs.statSync(file), n = Math.min(st.size, 65536), fd = fs.openSync(file, 'r'), b = Buffer.alloc(n); fs.readSync(fd, b, 0, n, st.size - n); fs.closeSync(fd);
    return b.toString('utf8').split(/\r?\n/).filter(Boolean).slice(n < st.size ? 1 : 0).slice(-lines); } catch (e) { return []; }
}
function info(ctx, tNow) {
  const t = tNow || Date.now();
  const R = readCfg(ctx), cfg = R.data || {};
  const state = ctx.readJson(path.join(ctx.LOGS, 'sevensigns_state.json'), null);
  const cur = ssgNow(state || {}, t, CHANGE_UTC_HOUR, CHECK_EVERY_MS);
  const states = {}; (ctx.readStates() || []).forEach(s => { states[s.name] = s; });
  const member = (n, party) => {
    const s = states[n] || {}, r = (NAME_RE.test(n) && ctx.readJson(path.join(ctx.LOGS, `sevensigns_${n}.json`), null)) || {}, v = r.view || {};
    let stones = null;
    const inv = s.ov && Array.isArray(s.ov.inv) ? s.ov.inv : null;
    if (inv) { stones = { blue: 0, green: 0, red: 0, total: 0 }; inv.forEach(i => { const k = SEAL[Number(i.id)]; if (k) { stones[k] += Number(i.n) || 0; stones.total += Number(i.n) || 0; } }); }
    const via = enrolledVia(cfg, n, party);
    return { name: n, level: s.level != null ? Number(s.level) : null, cls: s.cls || '', classId: s.classId != null ? Number(s.classId) : null, online: s.ageSec != null && s.ageSec <= 90, ageSec: s.ageSec != null ? s.ageSec : null,
      enrolled: !!via, via, registered: sideOf(r, cur.cycle), status: r.cycle === cur.cycle ? (r.status || '') : '', recCycle: r.cycle || '', tries: r.cycle === cur.cycle ? (r.tries || 0) : 0,
      at: r.at || 0, signedAt: r.signedAt || 0, skipped: r.skipped || '', skipAt: r.skipAt || 0, denied: r.denied || null, stonesGiven: r.stonesGiven || 0,
      allowed: v.ok === undefined ? null : !!v.ok, why: v.why || '', reason: v.reason || '', viewAt: v.at || 0, stones, _rec: r, _classId: s.classId != null ? Number(s.classId) : (r.classId != null ? Number(r.classId) : null) };
  };
  // SSREASON-2026-10-15: the party's catacomb / necropolis gate in the bot's own words (Dashboard/sslogic.js = swarm.js SSGATE-PURE + ssTeamAllowed)
  const spots = (ctx.readJson(path.join(ctx.DATA, 'party_spots.json'), null) || {}).spots || {};
  const gateOf = (leader, mem) => {
    const e = spots[leader], consent = !!(e && e.mode === 'manual' && /necropolis|catacomb/i.test(String(e.dungeon || e.spot || e.rooms || '')));   // = swarm.js ssChosenDungeon
    const one = (kind) => { const g = SSL.partyGate({ state: state || {}, members: mem.map(m => ({ name: m.name, rec: m._rec, classId: m._classId })), party: leader, kind, optin: cfg, consent, t }); return { state: g.state, ok: !!g.ok, reason: g.reason, until: g.until ? new Date(g.until).toISOString() : '' }; };
    const c = one('catacomb'), n = one('necropolis');
    return { catacomb: c, necropolis: n, same: c.reason === n.reason, consent };
  };
  const P = parties(ctx).map(({ leader, names }) => { const mem = names.map(n => member(n, leader)), gate = gateOf(leader, mem); mem.forEach(m => { delete m._rec; delete m._classId; });
    return { leader, enrolled: (cfg.parties || []).some(x => String(x).toLowerCase() === String(leader).toLowerCase()), members: mem, gate }; });
  return { file: path.basename(cfgFile(ctx)), exists: !!R.exists, rev: R.rev, broken: R.broken || null,
    cfg: { parties: Array.isArray(cfg.parties) ? cfg.parties : [], chars: Array.isArray(cfg.chars) ? cfg.chars : [], contributeStones: cfg.contributeStones === undefined ? true : !!cfg.contributeStones },
    state, cur: Object.assign({}, cur, { nextChange: new Date(cur.nextChange).toISOString() }), parties: P, log: logTail(path.join(ctx.LOGS, 'dawn.log'), 40) };
}

// ------------------------------------------------------------------------------------------- write
function bad(code, error, extra) { return Object.assign({ code, error }, extra || {}); }
function summary(a, b) {
  const ch = [], L = (x) => (Array.isArray(x) ? x : []).map(String);
  const diff = (k, label) => { const A = L(a[k]), B = L(b[k]); B.filter(n => !A.includes(n)).forEach(n => ch.push(`+${label} ${n}`)); A.filter(n => !B.includes(n)).forEach(n => ch.push(`-${label} ${n}`)); };
  diff('parties', 'party'); diff('chars', 'char');
  if (!!a.contributeStones !== !!b.contributeStones) ch.push(`seal stones ${b.contributeStones ? 'on' : 'off'}`);
  return ch.join('; ').slice(0, 1500) || 'no change';
}
function post(ctx, b) {
  if (!b || typeof b !== 'object') return bad(400, 'bad body');
  const F = cfgFile(ctx), Gd = guard(ctx), by = String(b.by || 'dashboard').slice(0, 40);
  fs.mkdirSync(path.dirname(F), { recursive: true });
  let result = null;
  try {
    Gd.withLock(F, () => {
      const R = readCfg(ctx);
      if (R.broken) { result = bad(500, `${path.basename(F)} does not parse (${R.broken}) — fix or restore it from history/ first`); return; }
      if (b.rev !== undefined && b.rev !== null && String(b.rev) !== R.rev) { result = bad(409, 'the Seven Signs settings were changed meanwhile (another page or a tool) — reloaded, try again', { rev: R.rev, conflict: true }); return; }
      const s = ssSanitize(b.cfg, R.data);
      if (!s.ok) { result = bad(400, s.errors.join('; '), { errors: s.errors }); return; }
      const hist = R.exists ? Gd.saveHistory(F, path.dirname(F), 50) : null;
      const txt = JSON.stringify(s.cfg, null, 1) + '\n';
      Gd.atomicWrite(F, txt);
      try { fs.appendFileSync(path.join(ctx.LOGS, 'dashboard_commands.log'), `${isoNow()}\tsevensigns\tsave\t${by}: ${summary(R.data || {}, s.cfg)}\r\n`); } catch (e) { }
      result = { code: 200, ok: true, rev: sha(txt), cfg: s.cfg, history: hist ? path.basename(hist) : null };
    }, { who: 'sevensigns save' });
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
  if (p !== '/api/sevensigns') return false;
  if (!ctx.allowed(req, url)) { ctx.send(res, 401, 'text/plain; charset=utf-8', 'Access denied'); return true; }
  if (req.method === 'GET') { try { ctx.json(res, 200, info(ctx)); } catch (e) { ctx.json(res, 500, { error: e.message }); } return true; }
  if (req.method !== 'POST') { ctx.json(res, 405, { error: 'GET or POST' }); return true; }
  let b = {}; try { let t = ''; for await (const c of req) t += c; b = JSON.parse(t || '{}'); } catch (e) { ctx.json(res, 400, { error: 'bad JSON' }); return true; }
  try { const r = post(ctx, b) || bad(500, 'no result'); const code = r.code || 200; delete r.code; ctx.json(res, code, r); } catch (e) { ctx.json(res, 500, { error: e.message }); }
  return true;
}
module.exports = { handle, info, post, readCfg, cfgFile, ssSanitize, enrolledVia, ssgNow, sideOf };
