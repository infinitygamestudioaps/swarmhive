// SPOIL PAGE API (SPOIL-2026-10-19, owner: "I would like to select WHAT monsters to spoil based on their drops ... some monsters are just waste
// for me. Make it possible to see the drops for monsters in the area and select which to spoil"). Loaded by server.js (one hook).
// Public (no secrets): /spoilpage.js, /spoilpage.css.
//   GET  /api/spoil                      { file, exists, rev, broken, rules, defaults, parties: [{ leader, members, spoilers, pos }], stats: [spoil_stats_*] }
//   GET  /api/spoil/area?leader=<name>   monsters around that party: { leader, pos, monsters: [ monsterInfo + { live: n seen now, spawns: n datapack spawns near,
//                                        wanted: { on, src } } ] } (live = the MCP mobs list of the leader / its spoiler; datapack = spawns within 4000)
//   GET  /api/spoil/search?q=<text>[&leader=]  any monster by name / id (max 60)
//   POST /api/spoil  { party: '' (= all parties) | leader, set: { npcId: true|false|null }, default?: true|false|null,
//                      settings?: { festival, festivalMin, sweepFestivalMin, mpReserve, maxTries } (all parties only), rev?, by? }
//                    lock + history (Scripts/data/history/spoil_rules_<time>.json, last 50) + atomic write + one line in Logs/dashboard_commands.log
// File: Scripts/data/spoil_rules.json (env SWARM_SPOILRULES_FILE overrides it). Read live by swarm.js SPOIL (every 10 s): the same rules as spoilWanted
// below (a text copy of the SPOIL-PURE block, checked by docs/plan/tools/test_spoil_page.js). Missing file = spoil every monster (as before).
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const STATIC = { '/spoilpage.js': 'application/javascript; charset=utf-8', '/spoilpage.css': 'text/css; charset=utf-8' };
const NAME_RE = /^[A-Za-z0-9_\-]{1,40}$/;
const sha = (t) => t ? crypto.createHash('sha1').update(t).digest('hex').slice(0, 16) : '';
const isoNow = () => new Date().toISOString();
const obj = (x) => x && typeof x === 'object' && !Array.isArray(x) ? x : {};
let G = null;
function guard(ctx) { if (!G) G = require(path.join(ctx.ROOT || path.join(__dirname, '..'), 'docs', 'plan', 'tools', 'manual_guard.js')); return G; }
const fileOf = (ctx) => process.env.SWARM_SPOILRULES_FILE || path.join(ctx.DATA, 'spoil_rules.json');

// ---- SPOIL-PURE (text copy of Scripts_dev/swarm.js; test_spoil_page.js fails when they differ)
// SPOIL-PURE-BEGIN
const SPOIL_DEF = { default: true, festival: true, festivalMin: 2, sweepFestivalMin: 2, mpReserve: 20, maxTries: 6, festivalRadius: 200, sweepRadius: 200 };
function spObj(x) { return x && typeof x === 'object' && !Array.isArray(x) ? x : {}; }
function spBool(v) { return v === true || v === false ? v : undefined; }
function spInt(v, lo, hi) { const n = Number(v); return v !== null && v !== '' && typeof v !== 'boolean' && Number.isFinite(n) && n >= lo && n <= hi ? Math.round(n) : undefined; }
/** the file -> { v, default, monsters: { npcId: bool }, parties: { leader: { default, monsters } }, settings } (invalid parts dropped) */
function spoilRulesNorm(j) {
  const o = spObj(j), mons = (m) => { const out = {}; Object.keys(spObj(m)).forEach(k => { const b = spBool(spObj(m)[k]); if (/^\d{1,7}$/.test(k) && b !== undefined) out[k] = b; }); return out; };
  const parties = {}; Object.keys(spObj(o.parties)).forEach(l => { const p = spObj(o.parties[l]); const e = {}; if (spBool(p.default) !== undefined) e.default = p.default; const m = mons(p.monsters); if (Object.keys(m).length) e.monsters = m; if (Object.keys(e).length) parties[l] = e; });
  return { v: 1, default: spBool(o.default), monsters: mons(o.monsters), parties, festival: spBool(o.festival), festivalMin: spInt(o.festivalMin, 2, 9), sweepFestivalMin: spInt(o.sweepFestivalMin, 2, 9), mpReserve: spInt(o.mpReserve, 0, 90), maxTries: spInt(o.maxTries, 1, 20) };
}
/** the settings that apply (file values over SPOIL_DEF) */
function spoilCfg(j) {
  const R = spoilRulesNorm(j), out = Object.assign({}, SPOIL_DEF);
  ['festival', 'festivalMin', 'sweepFestivalMin', 'mpReserve', 'maxTries'].forEach(k => { if (R[k] !== undefined) out[k] = R[k]; });
  return out;
}
/** spoil this monster? party's own tick > the all-parties tick > party default > all-parties default > true. { on, src } */
function spoilWanted(j, leader, npcId) {
  const R = spoilRulesNorm(j), k = String(Number(npcId) || 0), P = spObj(R.parties[leader]);
  if (P.monsters && P.monsters[k] !== undefined) return { on: P.monsters[k], src: 'party' };
  if (R.monsters[k] !== undefined) return { on: R.monsters[k], src: 'all' };
  if (P.default !== undefined) return { on: P.default, src: 'party default' };
  if (R.default !== undefined) return { on: R.default, src: 'default' };
  return { on: true, src: 'built-in' };
}
// SPOIL-PURE-END (spoilPick / sweepPick live only in swarm.js)

// ---- data (cached by file time)
const CACHE = {};
function cached(file, build) {
  let mt = 0; try { mt = fs.statSync(file).mtimeMs; } catch (e) { return build(null); }
  const c = CACHE[file]; if (c && c.mt === mt) return c.v;
  let j = null; try { j = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')); } catch (e) { j = null; }
  const v = build(j); CACHE[file] = { mt, v }; return v;
}
function items(ctx) { return cached(path.join(ctx.DIR || __dirname, 'data', 'items.json'), j => j || {}); }
/** spoil_h5.json -> { byId: { id: m }, byName: { lower name: [m] } } */
function spoilDb(ctx) {
  return cached(path.join(ctx.DATA, 'spoil_h5.json'), j => {
    const byId = {}, byName = {};
    ((j && j.monsters) || []).forEach(m => { byId[m.id] = m; const k = String(m.name || '').toLowerCase(); (byName[k] = byName[k] || []).push(m); });
    return { byId, byName };
  });
}
function spawns(ctx) { return cached(path.join(ctx.DATA, 'spawns_h5.json'), j => Array.isArray(j) ? j : []); }
function itemInfo(ctx, id, name) { const I = items(ctx)[id]; return { id, name: (I && I[0]) || name || `item ${id}`, icon: (I && I[1]) || null, kind: (I && I[2]) || '', grade: (I && I[3]) || '' }; }
function monsterInfo(ctx, m) {
  if (!m) return null;
  const corpse = (m.corpse || []).map(c => Object.assign(itemInfo(ctx, c.id, c.name), { min: c.min, max: c.max, chance: c.chance })).sort((a, b) => b.chance - a.chance);
  return { id: m.id, name: m.name, level: m.level, corpse, spoilable: corpse.length > 0 };
}

// ---- rules file
function readFile(ctx) {
  const F = fileOf(ctx); let raw = '';
  try { raw = fs.readFileSync(F, 'utf8'); } catch (e) { return { exists: false, raw: '', rev: '', data: {} }; }
  try { return { exists: true, raw, rev: sha(raw), data: raw.trim() ? JSON.parse(raw.replace(/^﻿/, '')) : {} }; }
  catch (e) { return { exists: true, raw, rev: sha(raw), data: null, broken: e.message }; }
}
function parties(ctx) {
  let P = [];
  try { let K; try { K = require('./kamapage_api'); } catch (e) { K = require(path.join(ctx.ROOT, 'Dashboard', 'kamapage_api')); } P = K.partyList(ctx).map(p => ({ leader: p.leader, members: p.names || [] })); } catch (e) { P = []; }
  P.forEach(p => { p.spoilers = p.members.filter(n => roleOf(ctx, n) === 'spoiler'); });
  return P.filter(p => p.spoilers.length);
}
/** role from Logs/swarm_alive_<name>.txt ("role=spoiler class=Bounty Hunter") */
function roleOf(ctx, name) { if (!NAME_RE.test(name)) return ''; try { const t = fs.readFileSync(path.join(ctx.LOGS, `swarm_alive_${name}.txt`), 'utf8'); const m = t.match(/role=(\S+)/); return m ? m[1] : ''; } catch (e) { return ''; } }
function stats(ctx) {
  const out = [];
  try { fs.readdirSync(ctx.LOGS).filter(f => /^spoil_stats_[A-Za-z0-9_\-]+\.json$/.test(f)).forEach(f => { try { out.push(JSON.parse(fs.readFileSync(path.join(ctx.LOGS, f), 'utf8'))); } catch (e) { } }); } catch (e) { }
  return out.sort((a, b) => String(a.name).localeCompare(String(b.name)));
}
function info(ctx) {
  const R = readFile(ctx), P = parties(ctx);
  P.forEach(p => { try { p.pos = ctx.viewerPos ? ctx.viewerPos(p.leader) : null; } catch (e) { p.pos = null; } });
  return { file: path.basename(fileOf(ctx)), exists: R.exists, rev: R.rev, broken: R.broken || null, rules: spoilRulesNorm(R.data || {}), settings: spoilCfg(R.data || {}), defaults: SPOIL_DEF, parties: P, stats: stats(ctx) };
}

// ---- monsters around a party
const lvlOfTitle = (t) => +((String(t || '').match(/LvL:\s*(\d+)/i) || [])[1]) || 0;
/** a live mob (name + title level) -> the datapack monster: same name, nearest level */
function matchLive(db, name, lvl) {
  const L = db.byName[String(name || '').toLowerCase()]; if (!L || !L.length) return null;
  return L.slice().sort((a, b) => Math.abs((a.level || 0) - lvl) - Math.abs((b.level || 0) - lvl))[0];
}
async function area(ctx, leader) {
  if (!NAME_RE.test(leader || '')) return { code: 400, error: 'leader?' };
  const R = readFile(ctx), rules = R.data || {}, db = spoilDb(ctx);
  const P = parties(ctx).find(p => p.leader === leader);
  const who = [leader].concat(P ? P.spoilers : []);
  let pos = null; for (const n of who) { try { pos = ctx.viewerPos ? ctx.viewerPos(n) : null; } catch (e) { pos = null; } if (pos) break; }
  const found = {};
  const add = (m, k) => { if (!m) return; const e = found[m.id] || (found[m.id] = { m, live: 0, spawns: 0 }); e[k]++; };
  // live: what the leader / its spoiler sees now
  for (const n of who) {
    if (!ctx.mcpCallChar) break;
    let list = [];
    try { const t = await ctx.mcpCallChar('get_account_data', n, { type: 'mobs', range: 4000 }); const j = JSON.parse(t); list = Array.isArray(j) ? j : (j.mobs || []); } catch (e) { list = []; }
    list.forEach(x => add(matchLive(db, x.name, lvlOfTitle(x.title) || +x.level || 0), 'live'));
    if (list.length) break;
  }
  // datapack spawns near the party
  if (pos && isFinite(pos.x)) spawns(ctx).forEach(s => { if (Math.hypot(s.x - pos.x, s.y - pos.y) <= 4000 && (!isFinite(pos.z) || Math.abs((s.z || 0) - pos.z) <= 800)) add(db.byId[s.id], 'spawns'); });
  const monsters = Object.values(found).map(e => Object.assign(monsterInfo(ctx, e.m), { live: e.live, spawns: e.spawns, wanted: spoilWanted(rules, leader, e.m.id) }))
    .sort((a, b) => (b.live > 0) - (a.live > 0) || b.spoilable - a.spoilable || (a.level || 0) - (b.level || 0) || a.name.localeCompare(b.name));
  return { code: 200, leader, pos, monsters };
}
function search(ctx, q, leader) {
  const s = String(q || '').trim().toLowerCase(); if (s.length < 2) return { code: 200, monsters: [] };
  const R = readFile(ctx), db = spoilDb(ctx), out = [];
  const byId = /^\d+$/.test(s) ? db.byId[s] : null;
  if (byId) out.push(byId);
  else Object.keys(db.byName).forEach(k => { if (out.length < 60 && k.includes(s)) db.byName[k].forEach(m => out.push(m)); });
  return { code: 200, monsters: out.slice(0, 60).map(m => Object.assign(monsterInfo(ctx, m), { wanted: spoilWanted(R.data || {}, NAME_RE.test(leader || '') ? leader : '', m.id) })) };
}

// ---- save
function bad(code, error) { return { code, error }; }
function post(ctx, b) {
  b = obj(b);
  const party = String(b.party || '');
  if (party && !NAME_RE.test(party)) return bad(400, 'party?');
  const F = fileOf(ctx);
  return guard(ctx).withLock(F, () => {
    const R = readFile(ctx);
    if (R.broken) return bad(409, `spoil_rules.json does not parse (${R.broken})`);
    if (b.rev && R.rev && b.rev !== R.rev) return Object.assign(bad(409, 'changed meanwhile'), { conflict: true, rev: R.rev });
    const o = R.data && typeof R.data === 'object' ? R.data : {};
    const tgt = party ? ((o.parties = obj(o.parties))[party] = obj(o.parties[party])) : o;
    const changes = [];
    Object.keys(obj(b.set)).forEach(k => {
      if (!/^\d{1,7}$/.test(k)) return;
      const v = b.set[k]; tgt.monsters = obj(tgt.monsters);
      if (v === null) { delete tgt.monsters[k]; changes.push(`${k}=clear`); } else if (v === true || v === false) { tgt.monsters[k] = v; changes.push(`${k}=${v ? 'spoil' : 'skip'}`); }
    });
    if ('default' in b) { if (b.default === null) delete tgt.default; else if (b.default === true || b.default === false) tgt.default = b.default; changes.push(`default=${b.default}`); }
    if (!party && b.settings) {
      const S = obj(b.settings), lim = { festivalMin: [2, 9], sweepFestivalMin: [2, 9], mpReserve: [0, 90], maxTries: [1, 20] };
      if (S.festival === true || S.festival === false) { o.festival = S.festival; changes.push(`festival=${S.festival}`); }
      Object.keys(lim).forEach(k => { if (k in S) { const n = Number(S[k]); if (S[k] === null) delete o[k]; else if (isFinite(n) && n >= lim[k][0] && n <= lim[k][1]) { o[k] = Math.round(n); changes.push(`${k}=${o[k]}`); } } });
    }
    if (tgt.monsters && !Object.keys(tgt.monsters).length) delete tgt.monsters;
    if (party && !Object.keys(tgt).length) delete o.parties[party];
    if (o.parties && !Object.keys(o.parties).length) delete o.parties;
    o._readme = 'Which monsters the Bounty Hunters / Scavengers spoil (dashboard Spoil page #/spoil). monsters: { npcId: true = spoil, false = skip }; default = unlisted monsters (missing = spoil); parties.<leader> beats the all-parties lists; festival / festivalMin / sweepFestivalMin / mpReserve / maxTries = how they spoil. Read live by swarm.js every 10 s.';
    o._updated = { at: isoNow(), by: NAME_RE.test(b.by || '') ? b.by : 'dashboard' };
    const text = JSON.stringify(o, null, 1);
    try { if (R.exists) guard(ctx).saveHistory(F, path.dirname(F), 50); } catch (e) { }
    try { guard(ctx).atomicWrite(F, text); } catch (e) { try { fs.writeFileSync(F, text); } catch (e2) { return bad(500, e2.message); } }
    try { fs.appendFileSync(path.join(ctx.LOGS, 'dashboard_commands.log'), `${isoNow()}\tspoil\t${party || 'all parties'}\t${changes.join(', ').slice(0, 800)}\r\n`); } catch (e) { }
    return { code: 200, ok: true, rev: sha(text), changes };
  });
}

async function handle(req, res, url, ctx) {
  const p = url.pathname;
  if (STATIC[p]) { res.writeHead(200, { 'Content-Type': STATIC[p], 'Cache-Control': 'no-cache' }); res.end(fs.readFileSync(path.join(ctx.DIR || __dirname, path.basename(p)))); return true; }
  if (!/^\/api\/spoil(\/area|\/search)?$/.test(p)) return false;
  if (!ctx.allowed(req, url)) { ctx.send(res, 401, 'text/plain; charset=utf-8', 'Access denied'); return true; }
  const out = (r) => { const code = r.code || 200; delete r.code; ctx.json(res, code, r); };
  try {
    if (p === '/api/spoil/area') { out(await area(ctx, url.searchParams.get('leader'))); return true; }
    if (p === '/api/spoil/search') { out(search(ctx, url.searchParams.get('q'), url.searchParams.get('leader'))); return true; }
    if (req.method === 'GET') { ctx.json(res, 200, info(ctx)); return true; }
    if (req.method !== 'POST') { ctx.json(res, 405, { error: 'GET or POST' }); return true; }
    let b = {}; try { let t = ''; for await (const c of req) t += c; b = JSON.parse(t || '{}'); } catch (e) { ctx.json(res, 400, { error: 'bad JSON' }); return true; }
    out(post(ctx, b) || bad(500, 'no result'));
  } catch (e) { ctx.json(res, 500, { error: e.message }); }
  return true;
}
module.exports = { handle, info, area, search, post, spoilRulesNorm, spoilCfg, spoilWanted, SPOIL_DEF, matchLive };
