// POWERLEVEL-2026-11-03 (owner: "I want a way to have a healer OUT of party healing a character that is power leveling ... There should not be any
// level restrictions for a solo char with healer, it should be up to the person controlling hive to determine").
//   GET  /api/powerlevel   the pairs (Scripts/data/powerlevel.json) + the roster (who can level / heal) + live per pair (both characters' HP / MP,
//                          distance, the healer's last cast, the leveler's exp per hour) from Logs/swarm_state_<name>.json + Logs/pl_<leveler>.json
//   POST /api/powerlevel   { op: 'set', pair: { leveler, healer, on, spot?, aoe, healAt, keepDist } } | { op: 'onoff', leveler, on } |
//                          { op: 'delete', leveler } | { op: 'herespot', leveler } (the spot = where the leveler stands now)
//   /powerlevelpage.js     the page (#/powerlevel)
// swarm.js POWERLEVEL reads the file every 5 s. Default: no pairs = nothing changes for any party.
const fs = require('fs'), path = require('path');
const rj = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch (e) { return d; } };
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const NAME_RE = /^[A-Za-z0-9_.-]{1,40}$/;
const obj = (o) => (o && typeof o === 'object' && !Array.isArray(o)) ? o : {};
const HEALER_RE = /bishop|cardinal|elder|eva's saint|shillien (elder|saint)|cleric|oracle|prophet|hierophant|doomcryer|warcryer|overlord|dominator/i;

function file(ctx) { return process.env.SWARM_POWERLEVEL_FILE || path.join(ctx.DATA, 'powerlevel.json'); }
function load(ctx) { const j = obj(rj(file(ctx), {})); if (!Array.isArray(j.pairs)) j.pairs = []; return j; }
function save(ctx, j) { const F = file(ctx); fs.writeFileSync(F + '.tmp', JSON.stringify(j, null, 2)); fs.renameSync(F + '.tmp', F); }

/** pure: check + normalise a pair; pairs = the other pairs (a character is in one pair at most). -> { pair } | { error } */
function cleanPair(p, pairs, roster) {
  p = obj(p); const lv = String(p.leveler || ''), hl = String(p.healer || '');
  if (!NAME_RE.test(lv)) return { error: 'leveler (character name) required' };
  if (!NAME_RE.test(hl)) return { error: 'healer (character name) required' };
  if (lv === hl) return { error: 'the leveler and the healer must be two different characters' };
  if (roster && roster.length && (!roster.includes(lv) || !roster.includes(hl))) return { error: 'both must be characters of this install' };
  const clash = (pairs || []).find(x => x && x.leveler !== lv && (x.leveler === hl || x.healer === hl || x.leveler === lv || x.healer === lv));
  if (clash) return { error: `${clash.leveler === hl || clash.healer === hl ? hl : lv} is already in the pair of ${clash.leveler}` };
  const out = { leveler: lv, healer: hl, on: p.on === true, aoe: p.aoe === true, buffs: p.buffs !== false,   // PLBUFF-2026-11-03: the healer's own buffs (default ON)
    healAt: Math.max(20, Math.min(95, num(p.healAt) || 70)), keepDist: Math.max(200, Math.min(1500, num(p.keepDist) || 700)) };
  const s = obj(p.spot); if (num(s.x) || num(s.y)) out.spot = { name: String(s.name || '').slice(0, 60), x: Math.round(num(s.x)), y: Math.round(num(s.y)), z: Math.round(num(s.z)), radius: Math.max(500, Math.min(6000, num(s.radius) || 2500)) };
  return { pair: out };
}
function roster(ctx) { const c = rj(path.join(ctx.ROOT || path.join(ctx.DIR, '..'), 'swarm.config.json'), {}) || {}; return (c.accounts || []).filter(a => a && a.character && a.enabled !== false).map(a => ({ name: a.character, party: a.party || a.character })); }
function info(ctx) {
  const j = load(ctx), R = roster(ctx), st = {};
  try { (ctx.readStates ? ctx.readStates() : []).forEach(s => { st[s.name] = s; }); } catch (e) { }
  const who = R.map(r => { const s = st[r.name] || {}; return { name: r.name, party: r.party, level: s.level || null, cls: s.cls || '', healer: HEALER_RE.test(String(s.cls || '')), online: num(s.ageSec) < 60 }; });
  const pairs = j.pairs.map(p => {
    const a = st[p.leveler] || {}, b = st[p.healer] || {}, live = obj(rj(path.join(ctx.LOGS, `pl_${p.leveler}.json`), {}));
    const dist = (num(a.x) || num(a.y)) && (num(b.x) || num(b.y)) ? Math.round(Math.hypot(num(a.x) - num(b.x), num(a.y) - num(b.y))) : null;
    const sameParty = (R.find(r => r.name === p.leveler) || {}).party === (R.find(r => r.name === p.healer) || {}).party;
    return Object.assign({}, p, { live: {
      leveler: { hp: a.hp, mp: a.mp, level: a.level, dead: !!a.dead, task: String(a.task || '').slice(0, 90), expHour: a.expHour != null ? a.expHour : null, online: num(a.ageSec) < 60 },
      healer: { hp: b.hp, mp: b.mp, level: b.level, dead: !!b.dead, task: String(b.task || '').slice(0, 90), online: num(b.ageSec) < 60, healerClass: HEALER_RE.test(String(b.cls || '')) },
      dist, lastCast: live.lastCast || null, lastBuff: live.lastBuff || null, act: live.act || '', why: live.why || '', at: live.at || null },
      warn: sameParty ? 'the healer is in the leveler\'s party - the exp is shared; give the leveler its own party (Move to party)' : '' });
  });
  return { ok: true, at: new Date().toISOString(), pairs, roster: who };
}
function post(ctx, b) {
  b = obj(b); const op = String(b.op || ''), j = load(ctx), names = roster(ctx).map(r => r.name);
  if (op === 'set') {
    const lv = String(obj(b.pair).leveler || ''); const others = j.pairs.filter(x => x.leveler !== lv);
    const r = cleanPair(b.pair, others, names); if (r.error) return { code: 400, error: r.error };
    const old = j.pairs.find(x => x.leveler === lv); if (old && old.spot && !r.pair.spot && !obj(b.pair).clearSpot) r.pair.spot = old.spot;
    j.pairs = others.concat([r.pair]); save(ctx, j); return { code: 200, ok: true, pair: r.pair };
  }
  const lv = String(b.leveler || ''); if (!NAME_RE.test(lv)) return { code: 400, error: 'leveler required' };
  const p = j.pairs.find(x => x.leveler === lv); if (!p) return { code: 404, error: `no pair with ${lv} as the leveler` };
  if (op === 'onoff') { if (typeof b.on !== 'boolean') return { code: 400, error: 'on: true / false' }; p.on = b.on; p.changedAt = new Date().toISOString(); p.changedBy = 'dashboard'; save(ctx, j); return { code: 200, ok: true, pair: p }; }
  if (op === 'delete') { j.pairs = j.pairs.filter(x => x.leveler !== lv); save(ctx, j); return { code: 200, ok: true }; }
  if (op === 'herespot') {
    const s = {}; try { (ctx.readStates ? ctx.readStates() : []).forEach(x => { if (x.name === lv) Object.assign(s, x); }); } catch (e) { }
    if (!num(s.x) && !num(s.y)) return { code: 409, error: `${lv}'s position is not known` };
    p.spot = { name: `where ${lv} stood ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`, x: Math.round(num(s.x)), y: Math.round(num(s.y)), z: Math.round(num(s.z)), radius: Math.max(500, num(b.radius) || 2500) };
    save(ctx, j); return { code: 200, ok: true, pair: p };
  }
  return { code: 400, error: 'op: set | onoff | delete | herespot' };
}
const STATIC = { '/powerlevelpage.js': 'text/javascript; charset=utf-8' };
async function handle(req, res, url, ctx) {
  if (STATIC[url.pathname]) {
    let body; try { body = fs.readFileSync(path.join(ctx.DIR || __dirname, url.pathname.slice(1))); } catch (e) { res.writeHead(404); res.end('not found'); return true; }
    res.writeHead(200, { 'Content-Type': STATIC[url.pathname], 'Cache-Control': 'no-cache' }); res.end(body); return true;
  }
  if (url.pathname !== '/api/powerlevel') return false;
  if (!ctx.allowed(req, url)) { ctx.send(res, 401, 'text/plain; charset=utf-8', 'Access denied'); return true; }
  if (req.method === 'GET') { try { ctx.json(res, 200, info(ctx)); } catch (e) { ctx.json(res, 500, { error: e.message }); } return true; }
  if (req.method !== 'POST') { ctx.json(res, 405, { error: 'GET or POST' }); return true; }
  let b = {}; try { let t = ''; for await (const c of req) t += c; b = JSON.parse(t || '{}'); } catch (e) { ctx.json(res, 400, { error: 'bad JSON' }); return true; }
  try { const r = post(ctx, b); const code = r.code || 200; delete r.code; ctx.json(res, code, r); } catch (e) { ctx.json(res, 500, { error: e.message }); }
  return true;
}
module.exports = { handle, info, post, cleanPair, HEALER_RE };
