// AOE TEAM (AOETEAM-2026-10-30, owner: "I also want to be able to create a AOE team ... HERE WE ALL STAND, HERE STANDS THE HEALERS, HERE ARE ALL THE
// DAMAGE DEALERS, THIS IS THE ROUTE THE 'pullers' run ... I wanna a page dedicated for this"; then: "It should be like a hunting Ground you setup, then
// you can select which team should go there. If melee team then they should get polearms etc" -> AskUserQuestion: sending a team = the ground becomes
// its hunting spot; melee members without a polearm: owned first, else bought in Giran; the mode belongs to the team, suggested from who is in it).
//   GET  /api/aoeteam  -> { file, rev, exists, broken, grounds: { <id>: ground }, teams: { <leader>: team }, parties: [{ leader, members }],
//                           spots: { <id>: { body, label } | null } (the hunting spot each ground's camp lies in: a dungeon room / a field area) }
//   POST /api/aoeteam { ground: { id?, ... } | groundDelete: id | party + team: { ... } | null, rev?, by? }
//   ground = { id, name, camp {x,y,z}, healers, dealers, route [{x,y,z}] (2..60), standMaxSec 1..20, clearMaxSec 20..300, speedBuffs, tag }
//   team   = { on, ground (id), mode 'tank' | 'polearm', pullers [names] 1..4 }
// Scripts/data/aoe_teams.json v2 { grounds, teams } (v1 teams with their own places are read as a ground "<leader>'s ground"). Read live by swarm.js
// AOETEAM every 5 s. Lock + history (Scripts/data/history/, last 50) + atomic write + a line in Logs/dashboard_commands.log. Public: /aoepage.js|css.
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const STATIC = { '/aoepage.js': 'application/javascript; charset=utf-8', '/aoepage.css': 'text/css; charset=utf-8' };
const NAME_RE = /^[A-Za-z0-9]{2,16}$/, ID_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
let G = null;
function guard(ctx) { if (!G) G = require(path.join(ctx.ROOT || path.join(__dirname, '..'), 'docs', 'plan', 'tools', 'manual_guard.js')); return G; }
const fileOf = (ctx) => path.join(ctx.DATA, 'aoe_teams.json');
const sha = (t) => crypto.createHash('sha1').update(String(t)).digest('hex').slice(0, 16);
const obj = (o) => (o && typeof o === 'object' && !Array.isArray(o) ? o : {});
const isoNow = () => new Date().toISOString();
const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'aoe';
// AOEROLES-2026-10-30 (owner: "Under /aoe you should be able to create multiple Pullers' routes and assign each character to a class. So Who is
// healer, who is standing still, who is a puller etc."): ground.routes [{ id, name, points }] (ground.route = routes[0].points, kept for old
// readers); team.roles { <char>: { role: tank|healer|dealer|puller, route } } (team.pullers = the pullers, kept). Old files migrate in norm().
const ROLES = ['tank', 'healer', 'dealer', 'puller'];
const HEAL_RE = /heal|bishop|elder|saint|oracle|cardinal|prophet|evas|shillien/i, TANK_RE = /^(sk|tank|pk|dk|paladin|knight|templar|phoenix|hell|shield|evas templar)/i;
const rid = (i) => 'r' + (i + 1);
function groundRoutes(g) {
  const G = obj(g);
  if (Array.isArray(G.routes) && G.routes.length) return G.routes.map((r, i) => ({ id: String((r && r.id) || rid(i)), name: String((r && r.name) || `Route ${i + 1}`), points: Array.isArray(r && r.points) ? r.points : [] }));
  return Array.isArray(G.route) && G.route.length ? [{ id: 'r1', name: 'Route 1', points: G.route }] : [];
}
/** the roles suggested from the classes: the tank pulls (route 1) in Tank AOE, healers heal, everyone else deals damage */
function suggestRoles(members, ground) {
  const R = groundRoutes(ground), out = {}; let tank = null;
  (members || []).forEach(m => { if (!tank && TANK_RE.test(String(m.role || ''))) tank = m.name; });
  (members || []).forEach(m => {
    const r = String(m.role || '');
    if (m.name === tank) out[m.name] = { role: 'puller', route: R.length ? R[0].id : 'r1' };
    else out[m.name] = { role: HEAL_RE.test(r) ? 'healer' : 'dealer' };
  });
  return out;
}
/** a team's roles: its own, else built from the old pullers list (+ the classes) */
function teamRoles(t, members, ground) {
  const T = obj(t);
  if (T.roles && typeof T.roles === 'object' && Object.keys(T.roles).length) return T.roles;
  const s = suggestRoles(members || [], ground), R = groundRoutes(ground), P = Array.isArray(T.pullers) ? T.pullers : [];
  if (P.length) { Object.keys(s).forEach(n => { if (s[n].role === 'puller' && !P.includes(n)) s[n] = { role: 'tank' }; }); P.forEach(n => { s[n] = { role: 'puller', route: R.length ? R[0].id : 'r1' }; }); }
  return s;
}
/** v1 (teams.<leader> with its own places) -> v2 { grounds, teams } */
function norm(d) {
  const grounds = {}, teams = {};
  Object.keys(obj(d.grounds)).forEach(id => { const g = Object.assign({}, d.grounds[id]); g.routes = groundRoutes(g); g.route = g.routes.length ? g.routes[0].points : []; grounds[id] = g; });
  Object.keys(obj(d.teams)).forEach(L => {
    const t = obj(d.teams[L]);
    if (t.camp && !t.ground) { const id = slug(L + '-ground'); if (!grounds[id]) { const R = Array.isArray(t.route) ? t.route : []; grounds[id] = { id, name: `${L}'s ground`, camp: t.camp, healers: t.healers || null, dealers: t.dealers || null, route: R, routes: R.length ? [{ id: 'r1', name: 'Route 1', points: R }] : [], standMaxSec: t.standMaxSec, clearMaxSec: t.clearMaxSec, speedBuffs: t.speedBuffs, tag: t.tag }; }
      teams[L] = { on: t.on === true, ground: id, mode: t.mode === 'polearm' ? 'polearm' : 'tank', pullers: t.pullers || [], roles: t.roles || null }; }
    else teams[L] = { on: t.on === true, ground: String(t.ground || ''), mode: t.mode === 'polearm' ? 'polearm' : 'tank', pullers: Array.isArray(t.pullers) ? t.pullers : [], roles: t.roles && typeof t.roles === 'object' ? t.roles : null, at: t.at, by: t.by };
  });
  return { v: 2, grounds, teams };
}
function readFile(ctx) {
  const F = fileOf(ctx);
  if (!fs.existsSync(F)) return { exists: false, data: { v: 2, grounds: {}, teams: {} }, rev: '', broken: null };
  const raw = fs.readFileSync(F, 'utf8');
  try { return { exists: true, data: norm(JSON.parse(raw.replace(/^﻿/, ''))), rev: sha(raw), broken: null }; }
  catch (e) { return { exists: true, data: { v: 2, grounds: {}, teams: {} }, rev: sha(raw), broken: e.message }; }
}
function pt(p, what, errors, need) {
  if (p === null || p === undefined) { if (need) errors.push(`${what}: not set`); return null; }
  const o = obj(p), x = Number(o.x), y = Number(o.y), z = o.z === undefined || o.z === null || o.z === '' ? null : Number(o.z);
  if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 400000 || Math.abs(y) > 400000 || (z !== null && (!Number.isFinite(z) || Math.abs(z) > 30000))) { errors.push(`${what}: not a game position`); return null; }
  return z === null ? { x: Math.round(x), y: Math.round(y) } : { x: Math.round(x), y: Math.round(y), z: Math.round(z) };
}
const intIn = (v, d, lo, hi, what, errors) => { if (v === undefined || v === null || v === '') return d; const n = Number(v); if (!Number.isInteger(n) || n < lo || n > hi) { errors.push(`${what}: a whole number ${lo}-${hi}`); return d; } return n; };
function cleanGround(g) {
  const errors = [], T = obj(g), out = {};
  out.name = String(T.name || '').trim().slice(0, 60); if (!out.name) errors.push('give the AOE ground a name');
  out.id = ID_RE.test(String(T.id || '')) ? String(T.id) : slug(out.name);
  out.camp = pt(T.camp, 'Here we all stand', errors, true);
  out.healers = pt(T.healers, 'Here stand the healers', errors, false);
  out.dealers = pt(T.dealers, 'Here stand the damage dealers', errors, false);
  // AOEROLES: several pullers' routes (routes[]), the old single route = Route 1
  const RS = groundRoutes(T);
  if (!RS.length) errors.push('the pullers\' route needs at least 2 points');
  if (RS.length > 6) errors.push('at most 6 pullers\' routes');
  const seen = new Set();
  out.routes = RS.slice(0, 6).map((r, i) => {
    let id = /^[a-z0-9-]{1,20}$/.test(r.id) ? r.id : rid(i); while (seen.has(id)) id = id + 'x'; seen.add(id);
    const name = String(r.name || `Route ${i + 1}`).trim().slice(0, 30) || `Route ${i + 1}`, P = Array.isArray(r.points) ? r.points : [];
    if (P.length < 2) errors.push(`${name}: at least 2 points`);
    if (P.length > 60) errors.push(`${name}: at most 60 points`);
    return { id, name, points: P.slice(0, 60).map((p, k) => pt(p, `${name} point ${k + 1}`, errors, true)).filter(Boolean) };
  });
  out.route = out.routes.length ? out.routes[0].points : [];
  // AOEROOMS-2026-10-30 (owner: "it should be possible to select more rooms"): the ground's rooms (one dungeon) or field areas; the team hunts the set
  const RM = Array.isArray(T.rooms) ? T.rooms : [];
  out.rooms = RM.slice(0, 20).map(r => obj(r)).filter(r => r.roomId && r.dungeon).map(r => ({ dungeon: String(r.dungeon).slice(0, 80), roomId: String(r.roomId).slice(0, 80), name: String(r.name || r.roomId).slice(0, 60) }));
  if (out.rooms.length && out.rooms.some(r => r.dungeon !== out.rooms[0].dungeon)) errors.push('the rooms of one AOE ground must be in one dungeon');
  out.areaIds = (Array.isArray(T.areaIds) ? T.areaIds : []).map(String).filter(Boolean).slice(0, 20);
  if (out.rooms.length && out.areaIds.length) errors.push('choose rooms OR field areas, not both');
  out.standMaxSec = intIn(T.standMaxSec, 4, 1, 20, 'Pullers stand at most (s)', errors);
  out.clearMaxSec = intIn(T.clearMaxSec, 120, 20, 300, 'The tank waits for the kill at most (s)', errors);
  out.speedBuffs = T.speedBuffs !== false; out.tag = T.tag !== false;
  // PULLROOM-2026-11-04 (owner: "if you combine more rooms then the runner can run into that room fast and back"): extra dungeon rooms a puller
  // may run into (the camp room is always allowed); room ids from dungeon_rooms.json
  out.pullRooms = (Array.isArray(T.pullRooms) ? T.pullRooms : []).map(String).filter(r => /^[a-z0-9][a-z0-9-]{1,60}$/.test(r)).slice(0, 12);
  return errors.length ? { ok: false, errors } : { ok: true, cfg: out };
}
function cleanTeam(t, members, grounds) {
  const errors = [], T = obj(t), out = {};
  out.on = T.on === true; out.mode = T.mode === 'polearm' ? 'polearm' : 'tank';
  out.ground = String(T.ground || ''); const G = grounds[out.ground]; if (!G) errors.push('choose an AOE ground');
  const routeIds = groundRoutes(G).map(r => r.id);
  // AOEROLES: roles per character (the old pullers list still works: those pull on route 1)
  let roles = T.roles && typeof T.roles === 'object' && !Array.isArray(T.roles) ? T.roles : null;
  if (!roles) { roles = {}; (Array.isArray(T.pullers) ? T.pullers : []).map(String).forEach(n => { roles[n] = { role: 'puller', route: routeIds[0] || 'r1' }; }); }
  out.roles = {};
  Object.keys(roles).forEach(n => {
    const r = obj(roles[n]), role = String(r.role || '');
    if (!NAME_RE.test(n)) { errors.push(`"${String(n).slice(0, 20)}": not a character name`); return; }
    if (members && !members.includes(n)) { errors.push(`${n} is not in this party`); return; }
    if (!ROLES.includes(role)) { errors.push(`${n}: role must be tank, healer, damage dealer or puller`); return; }
    if (role === 'puller') { const route = String(r.route || routeIds[0] || ''); if (G && !routeIds.includes(route)) errors.push(`${n}: choose one of the ground's routes`); out.roles[n] = { role, route }; }
    else out.roles[n] = { role };
  });
  const P = Object.keys(out.roles).filter(n => out.roles[n].role === 'puller');
  if (!P.length) errors.push('choose who pulls'); if (P.length > 6) errors.push('at most 6 pullers');
  if (members && members.length > 1 && !Object.keys(out.roles).some(n => out.roles[n].role !== 'puller') && Object.keys(out.roles).length >= members.length) errors.push('someone must stay at the camp (not everyone can pull)');
  out.pullers = P;
  return errors.length ? { ok: false, errors } : { ok: true, cfg: out };
}
function partiesOf(ctx) {
  let states = []; try { states = ctx.readStates() || []; } catch (e) { }
  let tm = {}; try { tm = (ctx.teamMap && ctx.teamMap()) || {}; } catch (e) { }
  const by = {};
  states.forEach(s => { if (!s || !s.name) return; const L = tm[s.name] || s.party || s.name; (by[L] = by[L] || []).push({ name: s.name, role: s.role || '', cls: s.cls || '', level: Number(s.level) || 0, x: Math.round(Number(s.x) || 0), y: Math.round(Number(s.y) || 0), z: Math.round(Number(s.z) || 0), leader: L === s.name, pole: s.pole === undefined ? null : !!s.pole }); });
  return Object.keys(by).filter(L => by[L].some(m => m.name === L)).sort().map(L => ({ leader: L, members: by[L].sort((a, b) => (b.leader ? 1 : 0) - (a.leader ? 1 : 0) || a.name.localeCompare(b.name)) }));
}
// ---- the hunting spot a ground's camp lies in (a dungeon room, else a field area): what "Send team" puts on the party card
const inPoly = (x, y, P) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b = P[j]; if (((a[1] > y) !== (b[1] > y)) && (x < (b[0] - a[0]) * (y - a[1]) / ((b[1] - a[1]) || 1e-9) + a[0])) c = !c; } return c; };
let SPOTDATA = null;
function spotData(ctx) {
  if (SPOTDATA && Date.now() - SPOTDATA.at < 300000) return SPOTDATA;
  const rd = (f) => { try { return JSON.parse(fs.readFileSync(path.join(ctx.DATA, f), 'utf8').replace(/^﻿/, '')); } catch (e) { return null; } };
  SPOTDATA = { at: Date.now(), rooms: rd('dungeon_rooms.json') || [], fields: rd('field_areas.json') || { regions: [] } };
  return SPOTDATA;
}
function spotFor(ctx, g) {
  const c = g && g.camp; if (!c) return null;
  const S = spotData(ctx), z = Number.isFinite(Number(c.z)) ? Number(c.z) : null;
  // AOEROOMS: the ground's own rooms / field areas (the camp's room first = the anchor); without them the room / area the camp lies in (below)
  const own = spotForSet(S, g); if (own) return own;
  let best = null, bd = 1e12;
  (S.rooms || []).forEach(d => (d.floors || []).forEach(F => (F.rooms || []).forEach(r => {
    if (!Array.isArray(r.poly) || r.poly.length < 3) return;
    if (z !== null && Array.isArray(r.zRange) && (z < r.zRange[0] - 400 || z > r.zRange[1] + 400)) return;
    const inside = inPoly(c.x, c.y, r.poly), dd = inside ? 0 : Math.hypot((r.center ? r.center[0] : r.poly[0][0]) - c.x, (r.center ? r.center[1] : r.poly[0][1]) - c.y);
    if (dd < bd && dd < 1500) { bd = dd; best = { body: { mode: 'manual', kind: 'rooms', dungeon: d.name, roomId: r.id, stay: true }, label: `${d.name} · ${r.name || r.id} (AOE ground ${g.name})` }; }
  })));
  if (best && bd === 0) return best;
  (obj(S.fields).regions || []).forEach(R => (R.areas || []).forEach(a => {
    if (!Array.isArray(a.poly) || a.poly.length < 3) return;
    if (z !== null && Array.isArray(a.zRange) && (z < a.zRange[0] - 400 || z > a.zRange[1] + 400)) return;   // a dungeon floor above / below is no field area
    const inside = inPoly(c.x, c.y, a.poly), dd = inside ? 0 : Math.hypot((a.center ? a.center[0] : a.poly[0][0]) - c.x, (a.center ? a.center[1] : a.poly[0][1]) - c.y);
    if (dd < bd && dd < 1500) { bd = dd; best = { body: { mode: 'manual', kind: 'field', region: R.id, spot: R.name, areaIds: [a.id], order: 'nearest', stay: true }, label: `${R.name} · area ${a.n || a.id} (AOE ground ${g.name})` }; }
  }));
  return best;
}
/** AOEROOMS: party_spots body for a ground with several rooms ({ kind:'rooms', roomId: <camp room>, roomIds }) or field areas ({ kind:'field', areaIds }) */
function spotForSet(S, g) {
  const c = g.camp, rooms = Array.isArray(g.rooms) ? g.rooms.filter(r => r && r.roomId && r.dungeon) : [], areas = Array.isArray(g.areaIds) ? g.areaIds.filter(Boolean) : [];
  if (rooms.length) {
    const D = rooms[0].dungeon, ids = [...new Set(rooms.filter(r => r.dungeon === D).map(r => r.roomId))];
    let campRoom = null; (S.rooms || []).filter(d => d.name === D).forEach(d => (d.floors || []).forEach(F => (F.rooms || []).forEach(r => { if (!campRoom && ids.includes(r.id) && Array.isArray(r.poly) && r.poly.length > 2 && inPoly(c.x, c.y, r.poly)) campRoom = r.id; })));
    const first = campRoom || ids[0], order = [first].concat(ids.filter(x => x !== first));
    return { body: Object.assign({ mode: 'manual', kind: 'rooms', dungeon: D, roomId: first, stay: true }, order.length > 1 ? { roomIds: order, order: 'nearest' } : {}), label: `${D} · ${order.length} room${order.length === 1 ? '' : 's'} (AOE ground ${g.name})` };
  }
  if (areas.length) {
    let reg = null; (obj(S.fields).regions || []).forEach(R => { if (!reg && (R.areas || []).some(a => String(a.id) === String(areas[0]))) reg = R; });
    if (!reg) return null;
    return { body: { mode: 'manual', kind: 'field', region: reg.id, spot: reg.name, areaIds: areas, order: 'nearest', stay: true }, label: `${reg.name} · ${areas.length} area${areas.length === 1 ? '' : 's'} (AOE ground ${g.name})` };
  }
  return null;
}
function info(ctx) {
  const R = readFile(ctx), spots = {}, parties = partiesOf(ctx);
  Object.keys(R.data.grounds).forEach(id => { try { spots[id] = spotFor(ctx, R.data.grounds[id]); } catch (e) { spots[id] = null; } });
  // AOEROLES: per party the roles in use (the team's own, else from the old pullers list) and the suggestion from the classes
  const roles = {}, suggested = {};
  parties.forEach(P => { const t = R.data.teams[P.leader], g = t ? R.data.grounds[t.ground] : null; suggested[P.leader] = suggestRoles(P.members, g); if (t) roles[P.leader] = teamRoles(t, P.members, g); });
  return { file: path.basename(fileOf(ctx)), exists: R.exists, rev: R.rev, broken: R.broken, grounds: R.data.grounds, teams: R.data.teams, parties, spots, roles, suggested };
}
const bad = (code, error, extra) => Object.assign({ code, error }, extra || {});
function post(ctx, b) {
  if (!b || typeof b !== 'object') return bad(400, 'bad body');
  const by = String(b.by || 'dashboard').slice(0, 40), F = fileOf(ctx); fs.mkdirSync(path.dirname(F), { recursive: true });
  let result = null;
  guard(ctx).withLock(F, () => {
    const R = readFile(ctx);
    if (R.broken) { result = bad(500, `${path.basename(F)} does not parse (${R.broken}) — fix or restore it from history/ first`); return; }
    if (b.rev !== undefined && b.rev !== null && b.rev !== '' && String(b.rev) !== R.rev) { result = bad(409, 'the AOE teams were changed meanwhile — reload and try again', { rev: R.rev, conflict: true }); return; }
    const D = { grounds: Object.assign({}, R.data.grounds), teams: Object.assign({}, R.data.teams) }; let what = '';
    if (b.ground !== undefined) {
      const c = cleanGround(b.ground); if (!c.ok) { result = bad(400, c.errors.join('; '), { errors: c.errors }); return; }
      let id = c.cfg.id; if (!b.ground.id) { let k = 2; while (D.grounds[id]) id = `${c.cfg.id}-${k++}`; }
      D.grounds[id] = Object.assign(c.cfg, { id, at: isoNow(), by }); what = `ground ${id} saved (${c.cfg.routes.length} route(s): ${c.cfg.routes.map(r => r.name + ' ' + r.points.length).join(', ')})`; result = { id };
    } else if (b.groundDelete !== undefined) {
      const id = String(b.groundDelete || ''); if (!D.grounds[id]) { result = bad(404, 'no such AOE ground'); return; }
      const used = Object.keys(D.teams).filter(L => D.teams[L].ground === id); if (used.length) { result = bad(409, `party ${used.join(', ')} still uses it — choose another ground for them first`); return; }
      delete D.grounds[id]; what = `ground ${id} removed`; result = {};
    } else {
      const party = String(b.party || '').trim(); if (!NAME_RE.test(party)) { result = bad(400, 'party: not a character name'); return; }
      if (b.team === null) { delete D.teams[party]; what = `team ${party} removed`; result = {}; }
      else { const P = partiesOf(ctx).find(p => p.leader === party), c = cleanTeam(b.team, P ? P.members.map(m => m.name) : null, D.grounds); if (!c.ok) { result = bad(400, c.errors.join('; '), { errors: c.errors }); return; }
        D.teams[party] = Object.assign(c.cfg, { at: isoNow(), by }); what = `team ${party} ${c.cfg.on ? 'ON' : 'off'} at ${c.cfg.ground} (${c.cfg.mode}, ${Object.keys(c.cfg.roles).map(n => n + ' ' + c.cfg.roles[n].role + (c.cfg.roles[n].route ? '@' + c.cfg.roles[n].route : '')).join(', ')})`; result = {}; }
    }
    const out = { _about: 'AOE grounds + teams (dashboard #/aoe, Dashboard/aoeteam_api.js); read live by swarm.js AOETEAM. grounds.<id> = { name, camp, healers, dealers, routes[{ id, name, points }] (route = routes[0].points), standMaxSec, clearMaxSec, speedBuffs, tag }; teams.<leader> = { on, ground, mode tank|polearm, roles { <char>: { role tank|healer|dealer|puller, route } }, pullers[] }', v: 2, grounds: D.grounds, teams: D.teams, _updated: isoNow() };
    const txt = JSON.stringify(out, null, 1) + '\n';
    try { if (R.exists) guard(ctx).saveHistory(F, path.dirname(F), 50); } catch (e) { }
    guard(ctx).atomicWrite(F, txt);
    try { fs.appendFileSync(path.join(ctx.LOGS, 'dashboard_commands.log'), `${isoNow()}\taoeteam\t${by}: ${what}\r\n`); } catch (e) { }
    Object.assign(result, { code: 200, ok: true, rev: sha(txt), grounds: D.grounds, teams: D.teams });
  }, { who: 'aoeteam save' });
  return result || bad(500, 'not saved');
}
async function handle(req, res, url, ctx) {
  if (STATIC[url.pathname]) {
    try { res.writeHead(200, { 'Content-Type': STATIC[url.pathname], 'Cache-Control': 'no-cache' }); res.end(fs.readFileSync(path.join(__dirname, url.pathname.slice(1)))); }
    catch (e) { res.writeHead(404); res.end(); }
    return true;
  }
  if (url.pathname !== '/api/aoeteam') return false;
  if (!ctx.allowed(req, url)) { ctx.send(res, 401, 'text/plain; charset=utf-8', 'Access denied'); return true; }
  if (req.method === 'GET') { try { ctx.json(res, 200, info(ctx)); } catch (e) { ctx.json(res, 500, { error: e.message }); } return true; }
  if (req.method !== 'POST') { ctx.json(res, 405, { error: 'GET or POST' }); return true; }
  let b = {}; try { let t = ''; for await (const c of req) t += c; b = JSON.parse(t || '{}'); } catch (e) { ctx.json(res, 400, { error: 'bad JSON' }); return true; }
  try { const r = post(ctx, b); const code = r.code || 200; delete r.code; ctx.json(res, code, r); } catch (e) { ctx.json(res, 500, { error: e.message }); }
  return true;
}
module.exports = { handle, info, post, cleanGround, cleanTeam, readFile, fileOf, norm, spotFor, suggestRoles, teamRoles, groundRoutes };
