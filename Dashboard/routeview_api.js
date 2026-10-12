// ROUTE VIEW API (user 2026-10-12: "This must apply to ALL routes, do it properly, same with all quests" + "All NPCs"). ONE shared route
// description for every target the dashboard shows (raid bosses, NPCs, hunting areas, dungeon rooms, dungeons, quest steps). Loaded by server.js
// (one hook, like navatlas_api.js). Public: /routeview.js + /routeview.css (the shared component Dashboard/routeview.js, no secrets).
//   GET /api/routeview?target=<t>[&party=<leader>][&from=x,y,z]          (key checked here)
//     t = raid:<id> | npc:<id> | npc:<id>@x,y | area:<id> | room:<id> | dungeon:<key> | quest:<id>[:<step index>] | any nav atlas key
//     -> { target, quest?, atlas (the nav atlas route: town > gk > walk > door / floor / enter / need > arrive), summary,
//          custom (the saved route: raid routes today), use ('atlas' | 'custom'), useSet, useDefault, canChoose,
//          obstacles [{ kind, title, text, at, blocked, onPath, door?, items? }], items [{ id, name, consumed, why, have, partyHas, sources }],
//          from { x, y, z, toStart, toTarget } }
//   The 'use' choice itself is written by POST /api/route { id, action: 'use', use } (server.js routeApi, raid routes; history kept).
// Sources (all read on demand, re-read when they change): Scripts/data/nav_atlas (index + t/<key>.json + npcid), nav_doors.json (doors: kind,
// keys, Unlock, timers, owners, conditions), quest_items_h5.json (drops / quest rewards), quests_h5.json (steps, monsters + their field areas,
// start NPCs), npcs_h5.json, spawns_h5.json, dp/buylists (who sells an item), Dashboard/data/items.json (names), Logs/bag_<name>.json (who has it),
// swarm.config.json (party members), Scripts/data/routes/raid/<id>.json (saved routes).
// Test: docs/plan/tools/test_route_atlas.js (API part).
'use strict';
const fs = require('fs'), path = require('path');
const STATIC = { '/routeview.js': 'text/javascript; charset=utf-8', '/routeview.css': 'text/css; charset=utf-8' };
const C = {};
const mtime = (f) => { try { return fs.statSync(f).mtimeMs; } catch (e) { return 0; } };
/** JSON file cached until it changes (null when missing / broken) */
function J(f) {
  const st = mtime(f); if (!st) return null;
  const c = C[f]; if (c && c.st === st) return c.v;
  let v = null; try { v = JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch (e) { v = null; }
  C[f] = { st, v }; return v;
}
/** derived data cached on the source files' change times */
function derived(name, files, build) {
  const k = files.map(mtime).join(':'), c = C['@' + name];
  if (c && c.k === k) return c.v;
  const v = build(); C['@' + name] = { k, v }; return v;
}
const fileKey = (k) => String(k).replace(/[^A-Za-z0-9@,._-]+/g, '_');
const d2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const xyz = (a) => Array.isArray(a) && a.length >= 2 ? { x: +a[0], y: +a[1], z: +(a[2] || 0) } : null;

// ------------------------------------------------------------------------------------------------ lookups
function atlasRoute(DATA, key) { return key ? J(path.join(DATA, 'nav_atlas', 't', fileKey(key) + '.json')) : null; }
function atlasIndex(DATA) { return J(path.join(DATA, 'nav_atlas', 'index.json')); }
function npcRows(DATA, id) { return J(path.join(DATA, 'nav_atlas', 'npcid', Number(id) + '.json')) || []; }
function nearestRow(rows, from) {
  if (!rows.length) return null;
  if (!from) return rows.slice().sort((a, b) => (a[4] === 'ok' ? 0 : 1) - (b[4] === 'ok' ? 0 : 1))[0];
  return rows.slice().sort((a, b) => Math.hypot(a[1] - from.x, a[2] - from.y) - Math.hypot(b[1] - from.x, b[2] - from.y))[0];
}
function quests(DATA) { const q = J(path.join(DATA, 'quests_h5.json')); return (q && q.quests) || {}; }
function qitems(DATA) { const q = J(path.join(DATA, 'quest_items_h5.json')); return (q && q.items) || {}; }
function npcs(DATA) { return J(path.join(DATA, 'npcs_h5.json')) || {}; }
function itemName(ctx, id) {
  const it = J(path.join(ctx.DIR, 'data', 'items.json')) || {}, q = qitems(ctx.DATA)[id], D = J(path.join(ctx.DATA, 'nav_doors.json')) || {};
  return (it[id] && it[id][0]) || (q && q.name) || ((D.itemNames || {})[id]) || ('item ' + id);
}
/** spawns by npc id: { n, x, y, z (the spawn nearest the centroid) } */
function spawnIdx(DATA) {
  const f = path.join(DATA, 'spawns_h5.json');
  return derived('spawns', [f], () => {
    const S = J(f) || [], by = {};
    S.forEach(s => { const o = by[s.id] = by[s.id] || { n: 0, sx: 0, sy: 0, pts: [] }; o.n += s.count || 1; o.sx += s.x; o.sy += s.y; if (o.pts.length < 400) o.pts.push([s.x, s.y, s.z]); });
    Object.values(by).forEach(o => { const cx = o.sx / o.pts.length, cy = o.sy / o.pts.length; let b = o.pts[0]; o.pts.forEach(p => { if (Math.hypot(p[0] - cx, p[1] - cy) < Math.hypot(b[0] - cx, b[1] - cy)) b = p; }); o.x = b[0]; o.y = b[1]; o.z = b[2]; delete o.pts; delete o.sx; delete o.sy; });
    return by;
  });
}
/** monster id -> its field areas (from the quests' monster lists: region, area id, name, levels, landing) */
function monsterAreas(DATA) {
  const f = path.join(DATA, 'quests_h5.json');
  return derived('monAreas', [f], () => {
    const by = {};
    Object.values(quests(DATA)).forEach(q => (q.monsters || []).forEach(m => { if (m.areas && m.areas.length && !by[m.id]) by[m.id] = m.areas.slice(0, 4); }));
    return by;
  });
}
/** item id -> [{ npc, name, price }] (the datapack buylists; the NPC name from the comment) */
function sellers(DATA) {
  const dir = path.join(DATA, 'dp', 'buylists');
  return derived('sellers', [dir], () => {
    const by = {}; let files = []; try { files = fs.readdirSync(dir).filter(f => /\.xml$/.test(f)); } catch (e) { return by; }
    files.forEach(f => {
      let t = ''; try { t = fs.readFileSync(path.join(dir, f), 'utf8'); } catch (e) { return; }
      const ns = []; t.replace(/<npc>(\d+)<\/npc>\s*(?:<!--\s*([^-]*?)\s*-->)?/g, (m, id, nm) => { ns.push({ id: +id, name: (nm || '').trim() }); return m; });
      t.replace(/<item id="(\d+)"(?:\s+price="(\d+)")?[^>]*\/>/g, (m, id, pr) => { (by[id] = by[id] || []).push(...ns.map(n => ({ npc: n.id, name: n.name, price: pr ? +pr : null }))); return m; });
    });
    return by;
  });
}
// ------------------------------------------------------------------------------------------------ target resolution
/** quest:<id>[:<step>] -> the quest's steps with a target each (talk NPC / hunting area of its monsters), the chosen one */
function questTargets(ctx, qid, stepArg, from) {
  const q = quests(ctx.DATA)[String(qid)]; if (!q) return { error: 'unknown quest ' + qid };
  const N = npcs(ctx.DATA), npcName = (id) => { const n = N[id]; return n ? n.n : 'npc ' + id; };
  const monById = {}; (q.monsters || []).forEach(m => { monById[m.id] = m; });
  const steps = (q.steps || []).map((s, i) => {
    const hunt = [];
    (s.drops || []).forEach(di => { const d = (q.drops || [])[di]; if (d) (d.monsters || []).forEach(m => hunt.push({ id: m, item: d.item, chance: d.chance })); });
    (q.kills || []).forEach(k => { if ((k.conds || []).includes(s.cond)) (k.monsters || []).forEach(m => { if (!hunt.some(h => h.id === m)) hunt.push({ id: m }); }); });
    const out = { i, cond: s.cond, title: s.title || '', talk: (s.talk || []).map(id => ({ id, name: npcName(id) })), hunt: hunt.map(h => ({ id: h.id, name: (monById[h.id] && monById[h.id].name) || npcName(h.id), item: h.item || null, itemName: h.item ? itemName(ctx, h.item) : '', chance: h.chance == null ? null : h.chance })) };
    // the target: hunting first when the step has monsters (the talk is then the hand-in), else the NPC to talk to
    let key = null, what = '';
    if (out.hunt.length) {
      const areas = []; out.hunt.forEach(h => ((monById[h.id] || {}).areas || []).forEach(a => areas.push(a)));
      const idx = atlasIndex(ctx.DATA), pos = {}; if (idx) idx.targets.forEach(t => { if (t[1] === 'area') pos[t[0]] = t; });
      const cand = areas.map(a => ({ a, row: pos['area:' + a.area] })).filter(c => c.row);
      cand.sort((x, y) => from ? Math.hypot(x.row[3] - from.x, x.row[4] - from.y) - Math.hypot(y.row[3] - from.x, y.row[4] - from.y) : 0);
      if (cand.length) { key = cand[0].row[0]; what = 'hunt ' + out.hunt.map(h => h.name).join(', ') + ' at ' + cand[0].a.name; }
    }
    if (!key && out.talk.length) { const r = nearestRow(npcRows(ctx.DATA, out.talk[0].id), from); if (r) { key = r[0]; what = 'talk to ' + out.talk[0].name; } }
    if (!out.title) out.title = what || (out.talk.length ? 'talk to ' + out.talk.map(t => t.name).join(', ') : 'step ' + (i + 1));
    out.target = key; out.what = what;
    return out;
  });
  let sel = stepArg != null && stepArg !== '' ? Math.max(0, Math.min(steps.length - 1, Number(stepArg) || 0)) : 0;
  if (!steps[sel] || !steps[sel].target) { const k = steps.findIndex(s => s.target); if (k >= 0 && (stepArg == null || stepArg === '')) sel = k; }
  return { quest: { id: q.id, name: q.name, level: q.level, type: q.type, start: (q.startNpcs || []).map(n => ({ id: n.id, name: n.name, town: n.town || n.region || '' })), steps, sel }, key: steps[sel] && steps[sel].target };
}
function resolve(ctx, t, from) {
  t = String(t || '').trim();
  let m;
  if ((m = t.match(/^quest:(\d+)(?::(\d+))?$/))) { const r = questTargets(ctx, m[1], m[2], from); return r.error ? r : { key: r.key, quest: r.quest }; }
  if ((m = t.match(/^npc:(\d+)$/))) { const r = nearestRow(npcRows(ctx.DATA, m[1]), from); return r ? { key: r[0], spawns: npcRows(ctx.DATA, m[1]).length } : { error: 'npc ' + m[1] + ' is not in the nav atlas' }; }
  if ((m = t.match(/^(?:raid|epic|boss):(\d+)$/))) return { key: 'raid:' + m[1] };
  if (/^(npc|area|room|dungeon|raid):/.test(t)) return { key: t };
  return { error: 'target like raid:29014, npc:30177, area:<id>, room:<id>, dungeon:<key>, quest:<id>[:<step>]' };
}
// ------------------------------------------------------------------------------------------------ obstacles + items
function doorById(DATA) {
  const f = path.join(DATA, 'nav_doors.json');
  return derived('doors', [f], () => { const D = J(f) || {}, by = {}; (D.doors || []).forEach(d => { by[d.id] = d; }); return by; });
}
const placeTxt = (p) => !p ? '' : p.dungeon ? p.dungeon + (p.floor ? ' · ' + p.floor : '') : p.town || p.region || (p.nearTown ? 'near ' + p.nearTown.name : '');
/** one door in words: what it is, what opens it, the items it needs */
function doorWords(ctx, d, step) {
  const need = (step && step.need) || {}, items = [], kinds = d.kinds || [d.kind];
  let how = '', blocked = !!need.blocked;
  if (d.timed || need.wait) { const w = d.timed || need.wait; how = `timed: open ${(w.openFor || []).join('-')} s, closed ${(w.closedFor || []).join('-')} s (cycle ${w.periodMin || '?'}-${w.periodMax || '?'} s) — the bots wait at it${w.maxWait ? ' (max ~' + w.maxWait + ' s)' : ''}`; }
  else if (d.keys && d.keys.length) { how = 'key: ' + d.keys.map(k => `${k.itemName || itemName(ctx, k.itemId)} (${k.itemId}${k.consumed ? ', used up' : ''}${k.skill ? ', via ' + k.skill : ''})`).join(' or '); d.keys.forEach(k => k.itemId && items.push({ id: k.itemId, name: k.itemName || itemName(ctx, k.itemId), consumed: !!k.consumed, why: 'door ' + (d.name || d.id) })); }
  else if (d.unlock || need.unlock) { const u = Object.assign({}, d.unlock || {}, need.unlock || {}); how = `Unlock (skill 27, dagger classes)${u.sureFromSkillLevel ? ', sure from skill level ' + u.sureFromSkillLevel : ''}${u.consumes ? ', uses ' + u.consumes.name : ''}${step && step.fallback ? ' — else ' + step.fallback : ''}`; if (u.consumes && u.consumes.id) items.push({ id: u.consumes.id, name: u.consumes.name, consumed: true, why: 'Unlock on door ' + (d.name || d.id) }); }
  else if (kinds.includes('castle') || kinds.includes('fortress')) { how = 'castle / fortress door: only the owner clan (or a siege) opens it'; blocked = blocked || d.blocks !== false; }
  else if (kinds.includes('clanhall')) { how = 'clan hall door: only the owner clan'; blocked = blocked || d.blocks !== false; }
  else if (kinds.includes('npc') || (d.openBy || []).includes('npc')) { const sc = (d.scripts || [])[0]; how = 'opened by an NPC / script' + (sc && sc.npc ? ': ' + sc.npc : '') + (sc && sc.event ? ' (' + sc.event + ')' : ''); }
  else if (kinds.includes('cycle')) how = 'opens on a server cycle (' + (d.group || '') + ')';
  else if (kinds.includes('closed-no-opener')) { how = 'never opens for players' + (d.noOpenerWhy ? ': ' + d.noOpenerWhy : ''); blocked = true; }
  else if (kinds.includes('script') || kinds.includes('instance')) how = 'opened by a script / instance' + ((d.instances || []).length ? ' (' + d.instances.join(', ') + ')' : '');
  else if (d.defaultOpen || kinds.includes('open')) how = 'open';
  else how = 'click to open';
  if (/water/i.test(d.name || '')) how = 'water door — ' + how;
  return { how, items, blocked };
}
function obstaclesOf(ctx, r) {
  const out = [], items = [], seen = {};
  if (!r) return { out, items };
  const DB = doorById(ctx.DATA), D = J(path.join(ctx.DATA, 'nav_doors.json')) || {};
  const condBy = {}; (D.conditions || []).forEach(c => { (c.doors || []).forEach(id => { (condBy[id] = condBy[id] || []).push(c); }); });
  const addItems = (list) => list.forEach(i => { if (i && i.id && !items.some(x => x.id === i.id)) items.push(i); });
  (r.steps || []).forEach((s, si) => {
    if (s.do === 'door') {
      const d = DB[s.doorId] || { id: s.doorId, name: s.name, kind: s.kind, kinds: [s.kind] }, w = doorWords(ctx, d, s);
      seen[s.doorId] = 1;
      const conds = condBy[s.doorId] || [];
      conds.forEach(c => { const n = c.need || {}; addItems((n.anyItem || n.items || []).map(i => ({ id: i.id, name: i.name || itemName(ctx, i.id), consumed: !!i.consumed, why: c.area || c.key, any: !!n.anyItem }))); });
      addItems(w.items);
      out.push({ kind: 'door', sub: d.kind || s.kind, step: si, title: `door ${d.name || s.doorId}`, text: w.how + (conds.length ? ' · ' + conds.map(c => c.text).join(' ') : ''), at: xyz(s.at) || { x: d.x, y: d.y, z: d.z }, blocked: w.blocked, onPath: 'step', place: placeTxt(s.place || d.place), timed: d.timed || (s.need && s.need.wait) || null });
    } else if (s.do === 'need') {
      out.push({ kind: 'need', step: si, title: 'by hand', text: String(s.text || s.condition || ''), at: xyz(s.landing) || xyz(s.at), blocked: false, onPath: 'step' });
    } else if (s.do === 'enter') {
      out.push({ kind: 'enter', step: si, title: 'entry: ' + ((s.npc && s.npc.name) || s.how || ''), text: `${s.how || ''}${s.link ? ' → "' + s.link + '"' : ''}${s.sevenSigns ? ' · Seven Signs registration needed (' + s.sevenSigns + ')' : ''}${s.condition ? ' · ' + s.condition : ''}`, at: s.npc ? { x: s.npc.x, y: s.npc.y, z: s.npc.z } : null, blocked: false, onPath: 'step' });
    } else if (s.do === 'floor') {
      out.push({ kind: 'floor', step: si, title: 'floor teleporter ' + ((s.npc && s.npc.name) || ''), text: `${s.link ? '"' + s.link + '"' : 'link not known'}${s.floorName ? ' → ' + s.floorName : ''}${s.verified === false ? ' (not verified live)' : ''}`, at: s.npc ? { x: s.npc.x, y: s.npc.y, z: s.npc.z } : null, blocked: false, onPath: 'step' });
    } else if (s.do === 'gk' && s.price) {
      out.push({ kind: 'gk', step: si, title: 'teleport ' + (s.desc || ''), text: `${s.price} adena${s.live ? '' : ' (link not seen on the live menu)'}`, at: xyz(s.landing), blocked: false, onPath: 'step' });
    }
  });
  // blocking doors right on the walk that the atlas did not list as a step
  const pts = []; (r.steps || []).forEach(s => { if (s.do === 'walk') for (let i = 0; i + 2 < (s.points || []).length; i += 3) pts.push({ x: s.points[i], y: s.points[i + 1], z: s.points[i + 2] }); });
  if (pts.length > 1) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity; pts.forEach(p => { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); });
    Object.values(DB).forEach(d => {
      if (seen[d.id] || d.blocks === false || d.defaultOpen || d.x < x0 - 200 || d.x > x1 + 200 || d.y < y0 - 200 || d.y > y1 + 200) return;
      if ((d.kinds || []).length === 1 && d.kinds[0] === 'instance') return;
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i], vx = b.x - a.x, vy = b.y - a.y, L2 = vx * vx + vy * vy || 1, t = Math.max(0, Math.min(1, ((d.x - a.x) * vx + (d.y - a.y) * vy) / L2));
        const px = a.x + t * vx, py = a.y + t * vy, pz = a.z + t * (b.z - a.z);
        if (Math.hypot(d.x - px, d.y - py) < 120 && Math.abs((d.z || 0) - pz) < 400) {
          const w = doorWords(ctx, d, null); addItems(w.items); seen[d.id] = 1;
          out.push({ kind: 'door', sub: d.kind, title: `door ${d.name || d.id} (on the walk)`, text: w.how, at: { x: d.x, y: d.y, z: d.z }, blocked: w.blocked, onPath: 'near', place: placeTxt(d.place), timed: d.timed || null });
          break;
        }
      }
    });
  }
  // the route's needs + conditions
  const nd = r.needs || {};
  if (nd.level && nd.level.min) out.push({ kind: 'level', title: 'level ' + nd.level.min + '+', text: 'every member needs level ' + nd.level.min + ' or more', onPath: 'need' });
  (nd.skills || []).forEach(k => out.push({ kind: 'skill', title: 'skill ' + k.name, text: `${k.why || ''}${(k.classIds || []).length ? ' — a member who is ' + (() => { const CL = J(path.join(ctx.DIR, 'data', 'classes.json')) || {}; return k.classIds.map(c => CL[c] || c).join(', '); })() : ''}${k.orWait ? ' (or wait)' : ''}`, onPath: 'need' }));
  addItems((nd.items || []).map(i => ({ id: i.id, name: i.name || itemName(ctx, i.id), consumed: !!i.consumed, why: i.why || 'entry' })));
  (nd.other || []).forEach(o => out.push({ kind: 'other', title: o.why || 'condition', text: o.sevenSigns ? 'Seven Signs: registered (Dawn) — ' + (o.sevenSigns.validation || '') : o.window ? o.window.schedule : o.adena ? o.adena + ' adena' : JSON.stringify(o).slice(0, 200), onPath: 'need' }));
  (r.conditions || []).forEach(c => out.push({ kind: 'condition', title: c.key || 'condition', text: String(c.text || ''), src: c.src || '', onPath: 'need' }));
  return { out, items };
}
/** who has the item (bags) + where to get it */
function itemInfo(ctx, it, party) {
  const cfg = J(path.join(ctx.ROOT, 'swarm.config.json')) || { accounts: [] };
  const members = party ? (cfg.accounts || []).filter(a => a.party === party).map(a => a.character) : null;
  const have = [];
  let bags = []; try { bags = fs.readdirSync(ctx.LOGS).filter(f => /^bag_.+\.json$/.test(f)); } catch (e) { }
  bags.forEach(f => { const b = J(path.join(ctx.LOGS, f)); if (!b || !Array.isArray(b.items)) return; const n = b.items.filter(x => +x.id === +it.id).reduce((t, x) => t + (+x.count || 0), 0); if (n > 0) have.push({ name: b.name, count: n, inParty: !members || members.includes(b.name), at: b.at }); });
  const q = qitems(ctx.DATA)[it.id], N = npcs(ctx.DATA), SP = spawnIdx(ctx.DATA), MA = monsterAreas(ctx.DATA), Q = quests(ctx.DATA);
  const idx = atlasIndex(ctx.DATA), areaRows = idx ? idx.targets.filter(t => t[1] === 'area' || t[1] === 'room') : [];
  const areaNear = (p) => { if (!p) return []; let b = null, bd = 3000; areaRows.forEach(t => { const d = Math.hypot(t[3] - p.x, t[4] - p.y); if (d < bd && Math.abs((t[5] || 0) - p.z) < 1500) { bd = d; b = t; } }); return b ? [{ key: b[0], name: b[2], levels: null, landing: null }] : []; };
  const drops = [], givers = [];
  if (q) q.quests.forEach(qq => {
    (qq.dropsFrom || []).forEach(d => { if (drops.some(x => x.npc === d.npc)) return; const n = N[d.npc] || {}, sp = SP[d.npc]; drops.push({ npc: d.npc, name: d.name || n.n, level: n.l || null, chance: d.chance, quest: { id: qq.id, name: qq.name }, spawns: sp ? sp.n : 0, at: sp ? { x: sp.x, y: sp.y, z: sp.z } : null, areas: MA[d.npc] ? MA[d.npc].map(a => ({ key: 'area:' + a.area, name: a.name, levels: a.levels, landing: a.landing && a.landing.desc })) : areaNear(sp ? { x: sp.x, y: sp.y, z: sp.z } : null) }); });
    if ((qq.roles || []).some(r => /given|reward/.test(r))) { const Qd = Q[qq.id] || {}; givers.push({ quest: { id: qq.id, name: qq.name }, level: Qd.level || null, start: (Qd.startNpcs || []).map(n => ({ id: n.id, name: n.name, town: n.town || n.region || '' })) }); }
  });
  const sold = (sellers(ctx.DATA)[it.id] || []).slice(0, 6);
  return Object.assign({}, it, { have, partyHas: have.some(h => h.inParty), members: members || null, sources: { drops: drops.slice(0, 8), quests: givers.slice(0, 6), shops: sold } });
}
// ------------------------------------------------------------------------------------------------ the view
function customOf(ctx, key) {
  const m = String(key || '').match(/^raid:(\d+)$/); if (!m) return null;
  const r = J(path.join(ctx.DATA, 'routes', 'raid', m[1] + '.json')); if (!r || !Array.isArray(r.points)) return null;
  return { kind: 'raid', id: m[1], points: r.points, start: r.start || null, landing: r.landing || '', manual: !!r.manual, use: r.use || '', uses: r.uses || 0, fails: r.fails || 0, length: r.length || 0, editedAt: r.editedAt || r.savedAt || null };
}
function view(ctx, q) {
  const fromP = (() => { const v = String(q.get('from') || ''); const n = v.split(/[ ,]+/).map(Number); return n.length >= 2 && n.every(isFinite) ? { x: n[0], y: n[1], z: n[2] || 0 } : null; })();
  const R = resolve(ctx, q.get('target'), fromP);
  if (R.error) return { error: R.error };
  const atlas = R.key ? atlasRoute(ctx.DATA, R.key) : null;
  const custom = customOf(ctx, R.key);
  const useDefault = custom ? (custom.manual ? 'custom' : 'atlas') : 'atlas';
  const use = custom && (custom.use === 'atlas' || custom.use === 'custom') ? custom.use : useDefault;
  const ob = obstaclesOf(ctx, atlas);
  const party = String(q.get('party') || '') || null;
  const items = ob.items.map(i => itemInfo(ctx, i, party));
  let start = null, tgt = atlas && atlas.target ? atlas.target : null;
  if (atlas) for (const s of atlas.steps || []) { if (s.do === 'walk' && s.points && s.points.length >= 3) { start = { x: s.points[0], y: s.points[1], z: s.points[2] }; break; } }
  return {
    target: { key: R.key, type: atlas ? atlas.type : String(R.key || '').split(':')[0], name: atlas ? atlas.name : (R.quest ? R.quest.name : R.key), x: tgt && tgt.x, y: tgt && tgt.y, z: tgt && tgt.z, spawns: R.spawns || null },
    quest: R.quest || null, atlas, custom, use, useSet: !!(custom && custom.use), useDefault, canChoose: !!(custom && atlas),
    obstacles: ob.out, items,
    from: fromP ? { x: fromP.x, y: fromP.y, z: fromP.z, toStart: start ? Math.round(d2(fromP, start)) : null, toTarget: tgt ? Math.round(d2(fromP, tgt)) : null } : null,
    generated: (atlasIndex(ctx.DATA) || {}).generated || null,
  };
}
async function handle(req, res, url, ctx) {
  const p = url.pathname;
  if (STATIC[p]) { try { const b = fs.readFileSync(path.join(ctx.DIR, path.basename(p))); res.writeHead(200, { 'Content-Type': STATIC[p], 'Cache-Control': 'no-cache' }); res.end(b); } catch (e) { res.writeHead(404); res.end(); } return true; }
  if (p !== '/api/routeview') return false;
  if (!ctx.allowed(req, url)) { ctx.send(res, 401, 'text/plain; charset=utf-8', 'Access denied'); return true; }
  try { const v = view(Object.assign({ ROOT: path.resolve(ctx.DATA, '..', '..'), LOGS: path.resolve(ctx.DATA, '..', '..', 'Logs') }, ctx), url.searchParams); ctx.json(res, v.error ? 404 : 200, v); }
  catch (e) { ctx.json(res, 500, { error: 'routeview: ' + e.message }); }
  return true;
}
module.exports = { handle, view, resolve, obstaclesOf, itemInfo, questTargets };
