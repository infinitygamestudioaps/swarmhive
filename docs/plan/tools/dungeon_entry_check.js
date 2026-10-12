// DUNGEON ENTRY CHECK (user 2026-10-12: "every outdoor area should be patched so all paths we have generated match with all dungeons and vice
// versa, also height should be taken into account"). For every dungeon of Scripts/data/dungeon_rooms.json, with the SAME normalisation the bots
// use (swarm.js DUNGEON_GK + dungeonNormalize: gatekeeper link, bbox grown to the entrance):
//   1. the town -> dungeon gatekeeper link: on the town's LIVE menu (Scripts/data/gk_live) / "unverified" when that town's live menu was never
//      recorded (the datapack link is used; swarm.js recordGkMenu records the menu the first time any bot opens that gatekeeper) / missing.
//      No link but a SAVED ENTRY ROUTE (Scripts/data/routes/dungeons/<key>.json: start teleport + staged walk, swarm.js dungeonEntryTrip) = ok;
//      a teleporter entry from a town (Pagan Temple: .rune + Triol's Mirror) = the walk town landing -> teleporter NPC.
//   2. the landing -> door walk on the geodata (docs/plan/tools/geopath.js, heights included): ok + length, or why not (a saved entry route is
//      walked point by point, so its length is not held against the 25k walk limit)
//   3. door and landing inside the dungeon box (the bots' "am I at the dungeon" test); for a teleporter entry the TELEPORT LANDING is tested
//   4. height confusion: a town whose landing lies in the box with the height of a floor band (the old Giran = Frozen floor bug)
//   5. inside -> outside: from the door back to the landing (the way out, for escapes / returns)
//   + entry items (swarm.js DUNGEON_NEEDS: rooms are never auto-picked without them) are listed, not counted as issues
// Writes docs/plan/dungeon_entry_check.md + Logs/dungeon_entry_check.json.  Run: node docs/plan/tools/dungeon_entry_check.js
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, ''));
const geo = require('./geopath');
const src = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
const grabObj = (name) => { const i = src.indexOf(`const ${name} = {`); if (i < 0) return {}; let d = 0, j = src.indexOf('{', i); const s = j; for (; j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}') { d--; if (!d) break; } } return (0, eval)('(' + src.slice(s, j + 1) + ')'); };
const DUNGEON_GK = grabObj('DUNGEON_GK'), TOWN_LAND = grabObj('TOWN_LAND'), GK_ALIAS = grabObj('GK_ALIAS'), DUNGEON_NEEDS = grabObj('DUNGEON_NEEDS');
const norm = (s) => String(s || '').toLowerCase().replace(/&#\d+;/g, '').replace(/\s*-\s*\d+\s*(adena)?\s*$/, '').replace(/^the\s+|town of\s+/g, '').replace(/[^a-z0-9' ]/g, '').trim();
const MAXWALK = 25000;
const plen = (pts) => Math.round(pts.reduce((s, q, i, a) => s + (i ? Math.hypot(q.x - a[i - 1].x, q.y - a[i - 1].y) : 0), 0));

// live menus: { gatekeeper file -> link texts } + the towns whose gatekeeper menu was recorded
const live = {}, liveTowns = new Set(); const gkDir = path.join(ROOT, 'Scripts', 'data', 'gk_live');
for (const f of fs.readdirSync(gkDir)) {
  if (!/\.json$/.test(f) || f.startsWith('_')) continue;
  try { const j = J(path.join(gkDir, f)); live[f.replace(/\.json$/, '')] = (JSON.stringify(j.pages || j).match(/"[^"]{3,80}"/g) || []).map(x => norm(x.slice(1, -1))); if (j.town) liveTowns.add(String(j.town).toLowerCase()); } catch (e) { }
}
const TP = (() => { const t = J(path.join(ROOT, 'Scripts', 'data', 'teleports_h5.json')); return Array.isArray(t) ? t : (t.teleports || Object.values(t)); })();
// the town gatekeepers of the datapack (npc atlas: gatekeeper + town) — who to open to record a missing live menu
const ATLAS = (() => { try { return J(path.join(ROOT, 'Scripts', 'data', 'npc_atlas.json')).npcs || []; } catch (e) { return []; } })();
const townGk = (town) => ATLAS.filter(n => (n.roles || []).includes('gatekeeper') && n.place && String(n.place.town || '').toLowerCase() === String(town).toLowerCase() && (n.teleports || []).length > 3)
  .map(n => ({ name: n.name, id: n.id, links: (n.teleports || []).map(t => t.text) }));
/** the .town landing with its height (TOWN_LAND has x,y only): the datapack teleport into that town nearest its landing */
function townLanding(town) {
  const p = TOWN_LAND[town]; if (!p) return null;
  const t = TP.filter(x => isFinite(x.z) && Math.hypot(x.x - p[0], x.y - p[1]) < 1500).sort((a, b) => Math.hypot(a.x - p[0], a.y - p[1]) - Math.hypot(b.x - p[0], b.y - p[1]))[0];
  return { x: p[0], y: p[1], z: t ? t.z : (p[2] || 0) };
}
const entryRoute = (d) => { try { const r = J(path.join(ROOT, 'Scripts', 'data', 'routes', 'dungeons', String(d.key || d.name).replace(/[^A-Za-z0-9_-]+/g, '_') + '.json')); return r && Array.isArray(r.points) && r.points.length > 1 ? r : null; } catch (e) { return null; } };
const walk = (a, b) => { try { const p = geo.findPath(a, b, { maxMs: 8000 }); return { ok: !!p.ok, len: p.ok ? plen(p.points) : 0, why: p.ok ? '' : String(p.reason || '') }; } catch (er) { return { ok: false, why: er.message }; } };

const D = J(path.join(ROOT, 'Scripts', 'data', 'dungeon_rooms.json'));
const out = [];
for (const d of D) {
  const r = { name: d.name, issues: [], notes: [] };
  // normalise like swarm.js
  const g = Object.assign({}, d.gatekeeperRoute || {});
  if (!g.destination) { const k = Object.keys(DUNGEON_GK).find(n => String(d.name).toLowerCase().startsWith(n)); if (k) { g.town = g.town || DUNGEON_GK[k][0]; g.destination = DUNGEON_GK[k][1]; r.derived = true; } }
  const needK = Object.keys(DUNGEON_NEEDS).find(n => String(d.name).toLowerCase().startsWith(n)); r.needs = needK ? DUNGEON_NEEDS[needK].map(n => n.label + (n.yBelow !== undefined ? ` (rooms south of y ${n.yBelow})` : '')) : [];
  const e = d.entrance || {}; let b = d.bbox;
  if (Array.isArray(b) && isFinite(e.x)) b = [Math.min(b[0], e.x - 600), Math.max(b[1], e.x + 600), Math.min(b[2], e.y - 600), Math.max(b[3], e.y + 600)];
  const inBox = (x, y, m) => Array.isArray(b) && x >= b[0] - (m || 0) && x <= b[1] + (m || 0) && y >= b[2] - (m || 0) && y <= b[3] + (m || 0);
  const f0 = (d.floors || [])[0] || {}, en = f0.enter || {};
  const door = en.from ? { x: en.from[0], y: en.from[1], z: en.from[2] } : (isFinite(e.x) ? { x: e.x, y: e.y, z: e.z } : null);
  const tpLand = en.how === 'teleporter' && Array.isArray(en.landing) ? { x: en.landing[0], y: en.landing[1], z: en.landing[2] } : null;
  r.enter = en.how || '?'; r.town = g.town || ''; r.dest = g.destination || '';
  const er = entryRoute(d);
  let land = null, viaRoute = false;
  // 1. link
  if (r.enter === 'ziggurat') r.link = 'Ziggurat (catacomb rule)';
  else if (g.town && g.destination) {
    const want = norm(GK_ALIAS[norm(g.destination)] || g.destination);
    const onLive = Object.entries(live).filter(([, L]) => L.some(t => t === want || t.startsWith(want) || t.endsWith(' ' + want))).map(([k]) => k);
    if (onLive.length) r.link = `live (${onLive.join(', ')})`;
    else if (!liveTowns.has(String(g.town).toLowerCase())) {
      const gks = townGk(g.town), dp = gks.filter(x => x.links.some(t => norm(t).includes(want)));
      const txt = dp.length ? dp.map(x => `${x.name} ${x.id}: "${x.links.find(t => norm(t).includes(want))}"`).join(', ') : TP.filter(x => norm(String(x.desc).split('->')[0]).startsWith(norm(g.town)) && norm(String(x.desc).split('->').pop()) === want).map(x => `"${x.desc}"`).join(', ');
      if (txt) { r.link = `unverified (datapack link: ${txt})`; r.notes.push(`${g.town}'s live menu is not recorded yet — swarm.js recordGkMenu writes Scripts/data/gk_live/${(dp[0] || gks[0] || {}).name || '<gatekeeper>'}.json the first time any bot opens that gatekeeper (the first party that travels to ${g.town})`); }
      else { r.link = 'MISSING'; r.issues.push(`"${g.destination}" is neither on a live menu nor in ${g.town}'s datapack menu`); }
    } else { r.link = 'NOT on the live menu'; r.issues.push(`"${g.destination}" is not on ${g.town}'s recorded live menu`); }
  } else if (er) {
    const st = er.start || {};
    r.link = `saved entry route: ${st.kind === 'town' ? '.' + String(st.town || '').toLowerCase() : st.desc || '?'} + ${er.points.length} points`;
    viaRoute = true;
    if (Array.isArray(er.landingAt)) land = { x: er.landingAt[0], y: er.landingAt[1], z: er.landingAt[2] };
    else if (st.kind === 'gk') { const t = TP.find(x => String(x.desc).trim() === String(st.desc).trim()); if (t) land = { x: t.x, y: t.y, z: t.z }; }
    else if (st.kind === 'town') land = townLanding(st.town);
    if (!land) land = er.points[0];
  } else if (en.how === 'teleporter' && g.town && TOWN_LAND[g.town] && door) {
    land = townLanding(g.town);
    r.link = `.${String(g.town).toLowerCase()} + walk to ${(en.npc && en.npc.name) || 'the teleporter'}`;
  } else { r.link = 'MISSING'; r.issues.push('no town -> dungeon gatekeeper link known'); }
  // landing of a gatekeeper link
  if (!land && g.destination) {
    if (Array.isArray(g.landing)) land = { x: g.landing[0], y: g.landing[1], z: g.landing[2] };
    else { const t = TP.find(x => norm(String(x.desc || x.name || '').split('->').pop()) === norm(g.destination)); if (t) land = { x: t.x, y: t.y, z: t.z }; }
  }
  r.landing = land; r.door = door;
  // 2 + 5. walks
  if (land && door) {
    const dist = Math.hypot(land.x - door.x, land.y - door.y);
    r.landDoor = Math.round(dist);
    if (viaRoute) {
      const last = er.points[er.points.length - 1], miss = Math.round(Math.hypot(last.x - door.x, last.y - door.y)), first = er.points[0], gap = Math.round(Math.hypot(first.x - land.x, first.y - land.y));
      r.walkIn = { ok: miss <= 600 && gap <= 3000, len: er.length || plen(er.points), route: true, why: miss > 600 ? `the route ends ${miss} from the door` : gap > 3000 ? `the route starts ${gap} from the landing` : '' };
      r.walkOut = { ok: r.walkIn.ok, route: true, why: r.walkIn.why };
      r.notes.push(`staged walk ${Math.round(r.walkIn.len / 1000)}k along the saved route (straight ${Math.round(dist / 1000)}k; no 25k limit on a saved route)${er.manual ? ', locked' : ''}`);
    } else if (dist < 150) r.walkIn = { ok: true, len: 0 };
    else { r.walkIn = walk(land, door); r.walkOut = walk(door, land); }
    if (r.walkIn && !r.walkIn.ok) r.issues.push(`landing -> ${en.how === 'teleporter' ? 'teleporter' : 'door'}: no walk on the geodata (${r.walkIn.why})`);
    if (r.walkOut && !r.walkOut.ok && !viaRoute) r.issues.push(`${en.how === 'teleporter' ? 'teleporter' : 'door'} -> landing (the way out): no walk (${r.walkOut.why})`);
    if (dist > MAXWALK && !viaRoute) r.issues.push(`landing is ${Math.round(dist)} from the door (> 25k walk limit, no saved entry route)`);
  } else if (r.enter !== 'ziggurat' && !r.issues.length) r.issues.push(!door ? 'no door / entrance point' : 'no landing for the link');
  // 3. box: the door, or for a teleporter entry the teleport landing (the teleporter itself stands outside, e.g. in Rune)
  if (tpLand) { if (!inBox(tpLand.x, tpLand.y, 0)) r.issues.push('the teleporter landing lies outside the dungeon box'); }
  else if (door && !inBox(door.x, door.y, 0)) r.issues.push('the door lies outside the dungeon box');
  // 4. towns at a floor height inside the box
  for (const [t, p] of Object.entries(TOWN_LAND)) {
    if (!inBox(p[0], p[1], 1500)) continue;
    const zf = (d.floors || []).find(F => Array.isArray(F.z) && p[2] >= F.z[0] - 300 && p[2] <= F.z[1] + 300);
    if (zf) r.issues.push(`town ${t} lies in the box at the height of ${zf.name} — "on the floor" needs more than height`);
  }
  r.floors = (d.floors || []).length; r.rooms = (d.floors || []).reduce((s, F) => s + (F.rooms || []).length, 0);
  const lv = (d.floors || []).flatMap(F => (F.rooms || []).map(x => x.levelRange || [])).filter(x => x.length); r.levels = lv.length ? `${Math.min(...lv.map(x => x[0]))}-${Math.max(...lv.map(x => x[1]))}` : '';
  out.push(r);
}
fs.writeFileSync(path.join(ROOT, 'Logs', 'dungeon_entry_check.json'), JSON.stringify(out, null, 1));
const L = ['# Dungeon entry check', '', `Generated ${new Date().toISOString()} by docs/plan/tools/dungeon_entry_check.js (same normalisation as swarm.js).`, '',
  '"unverified" = the town\'s gatekeeper menu was never recorded live: the bots use the datapack link text, and recordGkMenu (swarm.js) saves the live menu to Scripts/data/gk_live the first time any bot opens that gatekeeper. "saved entry route" = Scripts/data/routes/dungeons/<key>.json (staged walk, swarm.js dungeonEntryTrip). Entry items = swarm.js DUNGEON_NEEDS (rooms are never auto-picked without them).', '',
  '| Dungeon | Levels | Way in | Link | Landing -> door | Way out | Entry items | Issues | Notes |', '|---|---|---|---|---|---|---|---|---|'];
for (const r of out) L.push(`| ${r.name} | ${r.levels} | ${r.enter}${r.town ? ' via ' + r.town + (r.dest ? ' -> ' + r.dest : '') : ''}${r.derived ? ' (derived)' : ''} | ${r.link} | ${r.walkIn ? (r.walkIn.ok ? 'ok ' + (r.walkIn.len || 0) + (r.walkIn.route ? ' (saved route)' : '') : 'NO') : '-'} | ${r.walkOut ? (r.walkOut.ok ? 'ok' : 'NO') : '-'} | ${r.needs.join('; ') || '-'} | ${r.issues.join('; ') || 'none'} | ${r.notes.join('; ') || ''} |`);
fs.writeFileSync(path.join(ROOT, 'docs', 'plan', 'dungeon_entry_check.md'), L.join('\n') + '\n');
const bad = out.filter(r => r.issues.length), unv = out.filter(r => /^unverified/.test(r.link));
console.log(`${out.length} dungeons, ${out.length - bad.length} clean (${unv.length} of them with an unverified datapack link), ${bad.length} with issues`);
unv.forEach(r => console.log(`~ ${r.name}: ${r.link}`));
out.filter(r => r.needs.length).forEach(r => console.log(`* ${r.name}: entry items ${r.needs.join(' | ')}`));
bad.forEach(r => console.log(`- ${r.name}: ${r.issues.join(' | ')}`));
