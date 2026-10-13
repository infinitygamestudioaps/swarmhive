// ROUTE STORE (ROUTESWITCH-2026-10-13; user 2026-10-12/13: "if a custom path has been created it should be possible to lock in on either ... it must
// apply to all routes ... same with all quests ... all NPCs" + 2026-10-13 "the route choice exists only for raid bosses ... must be fixed so everything
// runs perfectly"). ONE saved-route store for every target type, same file format + history as the raid routes:
//   Scripts/data/routes/<folder>/<id>.json   { type, id, name, target {x,y,z}, start { kind 'town', town } | { kind 'gk', desc, from } | null, landing,
//     points [{ x, y, z[, swim][, layer] }], length, manual (true = locked), use ('atlas' | 'custom'; absent = 'auto'), savedAt, editedAt, uses, fails,
//     lastOk, lastFail, lastBy, ... }      old versions: <folder>/history/<id>_<ms>.json
//   type -> folder: raid + epic -> raid (one file per boss; known raid bosses keep going through server.js routeApi, unchanged), npc -> npc (<npc id>),
//   quest -> quest (<quest id>_<cond> = one quest step), area -> area (<field area id>), room -> room (<room id>), dungeon -> dungeons (<key>, the
//   dungeon entry routes swarm.js already walks).
// The choice (choice()): 'atlas' = the computed nav atlas path, 'custom' = the saved route, 'auto' = custom when the saved route is LOCKED, else atlas;
// a missing / too short route is always atlas. The SAME logic is in Scripts_dev/swarm.js ROUTESWITCH-PURE (docs/plan/tools/test_route_switch.js
// checks both agree). Used by server.js (/api/route?type=&id=, /api/routes?type=) and Dashboard/routeview_api.js (the route view switch).
'use strict';
const fs = require('fs'), path = require('path');
const FOLDER = { raid: 'raid', epic: 'raid', npc: 'npc', quest: 'quest', area: 'area', room: 'room', dungeon: 'dungeons' };
const TYPE_NAME = { raid: 'raid boss', epic: 'epic boss', npc: 'NPC', quest: 'quest step', area: 'field area', room: 'dungeon room', dungeon: 'dungeon entrance' };
function cleanId(type, id) {
  const s = String(id == null ? '' : id).trim();
  if (type === 'raid' || type === 'epic' || type === 'npc') return s.replace(/[^0-9]/g, '');
  if (type === 'quest') { const m = s.match(/^(\d+)[_:](\d+)$/); return m ? m[1] + '_' + m[2] : ''; }
  if (!FOLDER[type]) return '';
  return s.replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 120);
}
const dirOf = (DATA, type) => path.join(DATA, 'routes', FOLDER[type]);
function fileOf(DATA, type, id) { const k = cleanId(type, id); return FOLDER[type] && k ? path.join(dirOf(DATA, type), k + '.json') : ''; }
function readJ(f) { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch (e) { return null; } }
function points(r) {
  if (!r || !Array.isArray(r.points)) return [];
  return r.points.filter(p => p && isFinite(p.x) && isFinite(p.y)).map(p => { const o = { x: Math.round(+p.x), y: Math.round(+p.y), z: Math.round(isFinite(p.z) ? +p.z : 0) }; if (p.swim || p.water) o.swim = true; if (+p.layer > 0) o.layer = +p.layer; return o; });
}
const stored = (r) => r && (r.use === 'atlas' || r.use === 'custom') ? r.use : 'auto';
// DUNGEON STEPS (2026-10-13, user: "Archon Suscepter is on floor 1 of Cruma Tower. But our road is showing a path outside"): a route may hold
// { do: 'floor', dungeon, dungeonKey, floor, floorName, npc, link, landing } between its points (the nav atlas 'floor' step: into the dungeon /
// to another floor by its teleporter NPC). Same rules as swarm.js ROUTESWITCH-PURE rsSegments / rsFloorCheck (the test checks they agree).
const MAX_DZ = 1500;
const isStep = (e) => !!(e && (e.do === 'floor' || e.do === 'dungeon'));
function segments(r) {
  const out = []; let cur = [];
  (r && Array.isArray(r.points) ? r.points : []).forEach(e => {
    if (isStep(e)) { if (cur.length) out.push({ pts: cur }); cur = []; out.push({ step: e }); return; }
    const q = points({ points: [e] })[0]; if (q) { if (e.drop) q.drop = true; cur.push(q); }
  });
  if (cur.length) out.push({ pts: cur });
  return out;
}
/** -> { ok, at, why }: two points in a row more than 1500 apart in height with no dungeon step between them = the route jumps floors */
function floorCheck(r) {
  if (!r || !Array.isArray(r.points) || r.floorOk) return { ok: true };
  let prev = null, n = 0;
  for (const e of r.points) {
    if (isStep(e)) { prev = null; continue; }
    if (!e || !isFinite(e.x) || !isFinite(e.y)) continue;
    n++;
    if (prev && isFinite(e.z) && isFinite(prev.z) && Math.abs(e.z - prev.z) > MAX_DZ && !e.drop) return { ok: false, at: n, why: `point ${n - 1} -> ${n} jumps ${Math.round(Math.abs(e.z - prev.z))} in height (z ${Math.round(prev.z)} -> ${Math.round(e.z)}) with no dungeon / floor step between them` };
    prev = e;
  }
  return { ok: true };
}
/** the dungeons with their floors (dungeon_rooms.json): what the editor offers as a dungeon step */
function dungeonList(DATA) {
  let D = []; try { D = readJ(path.join(DATA, 'dungeon_rooms.json')) || []; } catch (e) { D = []; }
  return (Array.isArray(D) ? D : []).map(d => ({ key: d.key, name: d.name, bbox: d.bbox || null, floors: (d.floors || []).map((F, i) => { const E = F.enter || {}, N = E.npc || null;
    return { i, name: F.name, z: F.z || null, how: E.how || null, npc: N ? { id: N.id, name: N.name, x: N.x, y: N.y, z: N.z } : null, link: (N && N.link) || null, landing: Array.isArray(E.landing) ? E.landing : null, from: Array.isArray(E.from) ? E.from : null }; }) }));
}
/** a dungeon step from the editor -> the stored step (filled from dungeon_rooms.json) | { error } */
function sanitizeStep(DATA, e) {
  const L = dungeonList(DATA), d = L.find(x => x.key === e.dungeonKey || x.name === e.dungeon);
  if (!d) return { error: 'unknown dungeon ' + (e.dungeonKey || e.dungeon || '?') };
  const F = d.floors[Number(e.floor)];
  if (!F) return { error: `${d.name} has no floor ${e.floor}` };
  if (F.how !== 'teleporter' || !F.npc) return { error: `${d.name} ${F.name} is walked into (no teleporter NPC): no dungeon step needed there — add the points of the walk` };
  return { do: 'floor', dungeon: d.name, dungeonKey: d.key, floor: F.i, floorName: F.name, npc: F.npc, link: F.link || null, landing: F.landing || null };
}
/** editor points (plain + dungeon steps) -> { pts (stored list), plain (the plain points) } | { error } */
function cleanPoints(DATA, list) {
  const out = [], plain = []; let steps = 0;
  for (const p of Array.isArray(list) ? list : []) {
    if (isStep(p)) { const st = sanitizeStep(DATA, p); if (st.error) return { error: st.error }; if (++steps > 10) return { error: 'at most 10 dungeon steps' }; out.push(st); continue; }
    const o = { x: Math.round(+p.x), y: Math.round(+p.y), z: Math.round(+p.z) }; if (+p.layer > 0 && +p.layer < 10) o.layer = Math.round(+p.layer); if (p.swim || p.water) o.swim = true; if (p.drop) o.drop = true;
    out.push(o); plain.push(o);
  }
  if (plain.length < 2 || plain.length > 500 || plain.some(p => ![p.x, p.y, p.z].every(Number.isFinite) || Math.abs(p.x) > 400000 || Math.abs(p.y) > 400000 || Math.abs(p.z) > 30000)) return { error: 'need 2-500 points with numeric x, y, z' };
  return { pts: out, plain };
}
/** -> { use: 'atlas'|'custom', stored, why, has, locked } (same as swarm.js rsChoice) */
function choice(r, force) {
  const pts = points(r), has = pts.length >= 2, locked = !!(r && r.manual);
  const st = force === 'atlas' || force === 'custom' || force === 'auto' ? force : stored(r);
  let out = (use, why) => ({ use, stored: st, why, has, locked });
  if (!has) return out('atlas', !r ? 'no saved route' : st === 'custom' ? 'own route chosen, but it has fewer than 2 points — computed path' : 'the saved route has fewer than 2 points');
  const fc = floorCheck(r);                          // DUNGEON STEPS 2026-10-13: a route that jumps floors is never walked (warn, computed path instead)
  if (!fc.ok) return Object.assign(out('atlas', `your own route is not walkable: ${fc.why} — computed path until it is fixed (add the dungeon step, or mark the jump as a real drop)`), { invalid: fc.why });
  // RAID ROUTES 2026-10-13: a LOCKED route that failed the geodata check (docs/plan/tools/raid_routes.js: a leg with no way around) is only a WARNING (owner: nothing automatic unless asked) — the choice stays yours
  const out0 = out; const ckWarn = r && r.check && r.check.ok === false && !r.checkIgnore ? `your own route failed the geodata check (${r.check.why}) — check it in the route editor` : '';
  out = (use, why) => Object.assign(out0(use, why), ckWarn ? { warn: ckWarn } : {});
  if (st === 'atlas') return out('atlas', 'your choice: computed path');
  if (st === 'custom') return out('custom', 'your choice: own route' + (locked ? '' : ' (not locked)'));
  return locked ? out('custom', 'auto: your own route is locked') : out('atlas', 'auto: your own route is not locked');
}
function routeLen(pts) { let l = 0; for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); return Math.round(l); }
/** the target store key of a nav atlas / route view key: 'npc:30177@x,y' -> { type: 'npc', id: '30177' } */
function storeOfKey(key) {
  const k = String(key || ''); let m;
  if ((m = k.match(/^(?:raid|epic|boss):(\d+)$/))) return { type: 'raid', id: m[1] };
  if ((m = k.match(/^npc:(\d+)/))) return { type: 'npc', id: m[1] };
  if ((m = k.match(/^(area|room|dungeon):(.+)$/))) return { type: m[1], id: cleanId(m[1], m[2]) };
  return null;
}
/** the editor href of a target */
const editHref = (type, id) => `#/routeedit/${encodeURIComponent(type)}/${encodeURIComponent(cleanId(type, id))}`;
// ------------------------------------------------------------------------------------------------ target info (via the nav atlas)
/** { key, name, x, y, z, atlas: { status, length, start, landing, prefill [{x,y,z}] } } — ctx.RV = routeview_api (resolve, atlasRoute, quests) */
function targetInfo(ctx, type, id) {
  const RV = ctx.RV, k = cleanId(type, id);
  if (!RV || !k) return null;
  let t = null, quest = null;
  if (type === 'quest') {
    const [qid, cond] = k.split('_'), Q = (RV.quests(ctx.DATA) || {})[qid];
    if (!Q) return { key: null, name: 'quest ' + qid + ' (unknown)' };
    const si = (Q.steps || []).findIndex(s => String(s.cond) === String(cond));
    const R = RV.resolve(ctx, `quest:${qid}:${si < 0 ? 0 : si}`, null);
    quest = { id: Q.id, name: Q.name, cond: +cond, step: si, title: si >= 0 ? (R.quest && R.quest.steps[si] && (R.quest.steps[si].title || R.quest.steps[si].what)) || '' : 'cond ' + cond + ' is not a step of this quest' };
    t = R.error ? null : R.key;
  } else {
    const R = RV.resolve(ctx, type === 'epic' ? 'raid:' + k : type === 'dungeon' ? 'dungeon:' + k : `${type}:${k}`, null);
    t = R.error ? null : R.key;
  }
  const a = t ? RV.atlasRoute(ctx.DATA, t) : null;
  const out = { key: t, name: quest ? `${quest.name} — step ${quest.step + 1}: ${quest.title}` : a ? a.name : `${TYPE_NAME[type] || type} ${k}`, quest };
  if (a && a.target) Object.assign(out, { x: a.target.x, y: a.target.y, z: a.target.z });
  if (a) {
    const steps = a.steps || [];
    let lastT = -1; steps.forEach((s, i) => { if (['town', 'gk', 'enter'].includes(s.do)) lastT = i; });   // DUNGEON STEPS: floor steps go into the prefill
    const gk = steps.filter(s => s.do === 'gk').pop(), town = steps.filter(s => s.do === 'town').pop();
    const start = gk ? { kind: 'gk', desc: gk.desc || `${gk.from} -> ${gk.link}`, from: gk.from } : town ? { kind: 'town', town: town.town } : null;
    const landing = gk && Array.isArray(gk.landing) ? { desc: gk.desc, x: gk.landing[0], y: gk.landing[1], z: gk.landing[2] } : town && Array.isArray(town.at) ? { desc: town.cmd, x: town.at[0], y: town.at[1], z: town.at[2] } : null;
    const pre = [];
    steps.forEach((s, i) => {
      if (i <= lastT) return;
      if (s.do === 'floor' && (s.dungeonKey || s.dungeon)) { pre.push({ do: 'floor', dungeon: s.dungeon, dungeonKey: s.dungeonKey || null, floor: s.floor, floorName: s.floorName || null, npc: s.npc || null, link: s.link || null, landing: s.landing || null }); return; }
      if (s.do !== 'walk' || !Array.isArray(s.points)) return;
      for (let j = 0; j + 2 < s.points.length; j += 3) { const p = { x: Math.round(s.points[j]), y: Math.round(s.points[j + 1]), z: Math.round(s.points[j + 2]) }; const l = pre[pre.length - 1]; if (!l || isStep(l) || Math.hypot(l.x - p.x, l.y - p.y) > 60) pre.push(p); }
    });
    const transports = steps.filter((s, i) => i < lastT && (s.do === 'enter' || s.do === 'floor')).length;
    out.atlas = { key: a.key, status: a.status, length: a.length || 0, sec: a.sec || 0, start, landing, prefill: pre.length > 400 ? pre.filter((p, i) => isStep(p) || i % Math.ceil(pre.length / 400) === 0 || i === pre.length - 1) : pre,
      note: transports ? 'the computed path has NPC / floor teleports before its last walk: an own route of plain points starts after them' : '' };
  }
  return out;
}
// ------------------------------------------------------------------------------------------------ API
/** GET (b = null) / POST. ctx: { DATA, RV, towns, gkStarts(), gkLand(), layers() } */
function api(ctx, typeIn, idIn, b) {
  const type = String(typeIn || ''), id = cleanId(type, (b && b.id != null ? b.id : idIn));
  if (!FOLDER[type]) return { error: 'unknown route type ' + type + ' (raid, epic, npc, quest, area, room, dungeon)' };
  if (!id) return { error: type === 'quest' ? 'quest step id like 101_2 (quest id _ cond)' : 'missing id' };
  const file = fileOf(ctx.DATA, type, id), cur = readJ(file);
  let tgt = null; try { tgt = targetInfo(ctx, type, id); } catch (e) { tgt = { error: e.message }; }
  const info = () => ({ type, id, typeName: TYPE_NAME[type], target: tgt, route: readJ(file), choice: choice(readJ(file)), floorCheck: floorCheck(readJ(file)), dungeons: dungeonList(ctx.DATA), editHref: editHref(type, id),
    towns: ctx.towns || {}, gkStarts: ctx.gkStarts ? ctx.gkStarts() : [], gkLand: ctx.gkLand ? ctx.gkLand() : {}, layers: ctx.layers ? ctx.layers() : {} });
  if (!b) return info();
  const hist = () => { const h = path.join(dirOf(ctx.DATA, type), 'history'); fs.mkdirSync(h, { recursive: true }); return h; };   // folders only when something is written
  const keep = () => { if (cur) fs.copyFileSync(file, path.join(hist(), `${id}_${Date.now()}.json`)); };
  const write = (o) => { hist(); const tmp = file + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(o), 'utf8'); fs.renameSync(tmp, file); };
  const nowIso = new Date().toISOString();
  if (b.action === 'delete') { if (cur) { keep(); fs.unlinkSync(file); } return Object.assign(info(), { msg: 'deleted — the bots use the computed path' }); }
  if (b.action === 'use') {
    if (!cur) return { error: 'no saved route for this target yet: the bots use the computed path. Record or draw your own route first.' };
    keep();
    if (b.use === 'atlas' || b.use === 'custom') cur.use = b.use; else delete cur.use;
    cur.editedAt = nowIso; write(cur);
    const c = choice(cur);
    return Object.assign(info(), { msg: cur.use ? `the bots now use the ${cur.use === 'atlas' ? 'computed path (nav atlas)' : 'saved route'}` : `auto: ${c.use === 'custom' ? 'the saved route (locked)' : 'the computed path (the saved route is not locked)'}` });
  }
  if (b.action === 'lock' || b.action === 'unlock') { if (!cur) return { error: 'no route saved for this target' }; keep(); cur.manual = b.action === 'lock'; cur.editedAt = nowIso; write(cur); return Object.assign(info(), { msg: cur.manual ? 'locked' : 'unlocked' }); }
  // save
  const cp = cleanPoints(ctx.DATA, b.points); if (cp.error) return { error: cp.error };   // DUNGEON STEPS 2026-10-13: plain points + dungeon steps
  const pts = cp.pts;
  let start = b.start === undefined ? (cur && cur.start) || null : b.start;
  if (start) {
    if (start.kind === 'town') { if (!(ctx.towns || {})[start.town]) return { error: 'unknown town ' + start.town }; start = { kind: 'town', town: start.town }; }
    else if (start.kind === 'gk') { const d = String(start.desc || '').trim(); if (!/->/.test(d)) return { error: 'gatekeeper start like "Dion -> Plains of Dion"' }; start = { kind: 'gk', desc: d.slice(0, 120), from: d.split('->')[0].trim() }; }
    else start = null;
  }
  keep();
  const o = { type, id, name: (tgt && tgt.name) || (cur && cur.name) || `${type} ${id}`, target: tgt && isFinite(tgt.x) ? { x: tgt.x, y: tgt.y, z: tgt.z } : (cur && cur.target) || null,
    start, landing: start ? (start.kind === 'town' ? '.' + start.town.toLowerCase() : start.desc) : '', length: routeLen(cp.plain), points: pts,
    savedAt: (cur && cur.savedAt) || nowIso, editedAt: nowIso, uses: (cur && cur.uses) || 0, lastOk: (cur && cur.lastOk) || null, fails: 0, manual: b.manual !== false };
  if (type === 'raid' || type === 'epic') { o.boss = o.name; o.id = +id || id; }     // the raid-folder format (swarm.js loadRaidRoute / userRouteTrip)
  { const u = b.use !== undefined ? b.use : cur && cur.use; if (u === 'atlas' || u === 'custom') o.use = u; }
  if (b.floorOk === true) o.floorOk = true;   // DUNGEON STEPS: the user accepted the height jumps (real drops)
  write(o);
  const fcs = floorCheck(o);
  if (!fcs.ok) return Object.assign(info(), { msg: 'saved — but NOT walkable: ' + fcs.why + '. The bots use the computed path until you add the dungeon step (or mark the jump as a real drop).' });
  return Object.assign(info(), { msg: o.manual ? 'saved and locked — ' + (o.use === 'atlas' ? 'but the bots use the computed path (your choice)' : 'the bots use exactly this route') : 'saved (not locked: on auto the bots keep the computed path)' });
}
/** every saved route of one type (or all types): [{ type, id, name, points, length, manual, use, choice, uses, fails, editedAt, editHref }] */
function list(ctx, typeIn) {
  const types = typeIn && FOLDER[typeIn] ? [typeIn] : Object.keys(FOLDER).filter(t => t !== 'epic');
  const out = [];
  types.forEach(t => {
    let files = []; try { files = fs.readdirSync(dirOf(ctx.DATA, t)).filter(f => /\.json$/.test(f) && !/^_|^index\.json$/.test(f)); } catch (e) { }
    files.forEach(f => {
      const r = readJ(path.join(dirOf(ctx.DATA, t), f)); if (!r || !Array.isArray(r.points)) return;
      const id = f.slice(0, -5), c = choice(r);
      const fcl = floorCheck(r);
      out.push({ type: t, id, name: r.name || r.boss || id, points: r.points.length, invalid: fcl.ok ? null : fcl.why, steps: r.points.filter(isStep).length, length: r.length || 0, manual: !!r.manual, use: r.use || 'auto', choice: c.use, why: c.why, start: r.start || null,
        uses: r.uses || 0, fails: r.fails || 0, lastOk: r.lastOk || null, lastFail: r.lastFail || null, editedAt: r.editedAt || r.savedAt || null, editHref: editHref(t, id) });
    });
  });
  return out;
}
module.exports = { FOLDER, TYPE_NAME, cleanId, fileOf, points, choice, stored, storeOfKey, editHref, targetInfo, api, list, routeLen, isStep, segments, floorCheck, dungeonList, sanitizeStep, cleanPoints, MAX_DZ };
