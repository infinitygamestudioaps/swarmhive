// NPC ATLAS (user 2026-10-09 08:10: "Research ALL NPCs, where they are and what they can do, cross-reference location and menus, find the
// solution — not only Cruma, the entire game." + 08:15: "I want all the bots to understand where all NPCs are and how to get to them.")
//
// Every non-monster NPC spawn of the world (Scripts/data/spawns_h5.json + npcs_h5.json): where it stands (town / field region / dungeon + floor +
// room), what it is (role from its L2J type + title), and WHAT IT CAN DO: its datapack menu (teleports with landing + price from the teleporter
// html / AI scripts + l2j_teleport.sql, shop lists from dp/buylists, quests from quest_dialogs / reward / class quest data, Seven Signs priest,
// class master, warehouse, ...) cross-checked with what L2Toggle REALLY showed: Scripts/data/gk_live/*.json (gatekeeper menus clicked live),
// Logs/floor_<npc>_<char>.html + Logs/npc_<char>.html (saved dialog pages), Logs/floor_links_live.json, Scripts/data/shopscan_giran.json.
// Mismatches (datapack says X, live menu says Y) are listed per NPC and in the report.
//   node docs/plan/tools/npc_atlas.js           -> Scripts/data/npc_atlas.json + docs/plan/npc_atlas.md
// swarm.js (NPC NAVIGATION) reads npc_atlas.json: npcFind / npcRoute / goToNpc / !goto npc.
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const DATA = path.join(ROOT, 'Scripts', 'data'), LOGS = path.join(ROOT, 'Logs');
const MENUS = require('./npc_menus.js');
const rd = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch (e) { return d; } };
const SP = rd(path.join(DATA, 'spawns_h5.json'), []), NPCS = rd(path.join(DATA, 'npcs_h5.json'), {});
const D = rd(path.join(DATA, 'dungeon_rooms.json'), []), GK = rd(path.join(DATA, 'gatekeepers_h5.json'), { towns: {} });
const FA = rd(path.join(DATA, 'field_areas.json'), { regions: [] }), MAPR = rd(path.join(DATA, 'map_regions.json'), []);
const norm = (s) => String(s || '').toLowerCase().replace(/<[^>]+>/g, '').replace(/\s*-\s*\d[\d,.]*\s*(adena|a)?\b.*$/i, '').replace(/\b(free|the|town of|village of|of)\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();

// ---------------------------------------------------------------------------------------------------------------- what kind of NPC
const SKIP_TYPE = /Monster|RaidBoss|GrandBoss|Minion|Chest|L2Pet|FeedableBeast|TamedBeast|L2Defender|L2Decoy|L2Trap|L2FlyMonster|L2FriendlyMob|TerrainObject|L2Artefact|L2ControlTower|L2FortSiegeGuard|L2SiegeGuard/i;
function rolesOf(t, id) {
  const ty = String(t.ty || ''), ti = String(t.t || ''), n = String(t.n || ''), R = [];
  if (/L2Teleporter/.test(ty)) R.push(/gatekeeper/i.test(ti) || /gatekeeper/i.test(n) ? 'gatekeeper' : 'teleporter');
  if (/L2DungeonGatekeeper/.test(ty)) R.push('ziggurat gatekeeper', 'teleporter');
  if (/L2Warehouse/.test(ty)) R.push('warehouse');
  if (/L2Merchant/.test(ty) || /Merchant|Grocer|Trader|Seller|Blacksmith/i.test(ti)) {
    if (/grocer/i.test(ti)) R.push('grocer');
    else if (/weapon/i.test(ti)) R.push('weapon merchant');
    else if (/armor/i.test(ti)) R.push('armor merchant');
    else if (/accessor|jewel|amulet/i.test(ti)) R.push('accessory merchant');
    else if (/blacksmith/i.test(ti)) R.push('blacksmith');
    else if (/spellbook|magic trader/i.test(ti)) R.push('spellbook seller');
    else if (/recipe|blueprint/i.test(ti)) R.push('recipe merchant');
    else if (/mineral|dye|symbol/i.test(ti)) R.push(/symbol/i.test(ti) ? 'symbol maker' : 'trader');
    R.push('merchant');
  }
  if (/L2Trainer/.test(ty)) R.push('skill trainer');
  if (/L2VillageMaster/.test(ty)) R.push('village master', 'class master');
  if (/L2DawnPriest/.test(ty)) R.push('priest of dawn', 'seven signs');
  if (/L2DuskPriest/.test(ty)) R.push('priest of dusk', 'seven signs');
  if (/L2SignsPriest/.test(ty)) R.push('seven signs');
  if (/L2FestivalGuide/.test(ty)) R.push('festival guide');
  if (/L2Guard/.test(ty)) R.push('guard');
  if (/L2Adventurer/.test(ty)) R.push('adventurer guildsman');
  if (/L2OlympiadManager/.test(ty)) R.push('olympiad manager');
  if (/L2ClanHall/.test(ty)) R.push('clan hall');
  if (/L2CastleDoormen|L2Doormen/.test(ty)) R.push('doorman');
  if (/L2Auctioneer/.test(ty)) R.push('auctioneer');
  if (/L2Observation/.test(ty)) R.push('observation');
  if (/L2RaceManager/.test(ty)) R.push('race manager');
  if (/L2SepulcherNpc/.test(ty)) R.push('sepulcher');
  if (/fish/i.test(ti)) R.push('fisherman');
  if (/wyvern/i.test(ti)) R.push('wyvern manager');
  if (/priest/i.test(ti) && !R.includes('seven signs')) R.push('priest');
  if (/warehouse/i.test(ti) && !R.includes('warehouse')) R.push('warehouse');
  if (/clan trader|reputation/i.test(ti)) R.push('clan trader');
  if (/mercenary manager/i.test(ti)) R.push('mercenary manager');
  if (!R.length) R.push('npc');
  return [...new Set(R)];
}
// ---------------------------------------------------------------------------------------------------------------- where it stands
// the 18 towns / villages (their gatekeeper landing; the names swarm.js uses: townKeyFor / CONFIG.lead.hub)
const TOWNS = [['Talking Island', -84318, 244579], ['Elven Village', 46951, 51550], ['Dark Elf Village', 9745, 15606], ['Orc Village', -45158, -112583], ['Dwarven Village', 115120, -178224],
  ['Kamael Village', -117251, 46771], ['Gludin', -80684, 149770], ['Gludio', -12787, 122779], ['Dion', 15472, 142880], ['Giran', 83551, 147945], ['Oren', 82956, 53162], ['Aden', 146331, 25762],
  ['Hunters Village', 116819, 76994], ['Heine', 111455, 219400], ['Goddard', 148024, -55281], ['Rune', 43835, -47749], ['Schuttgart', 87126, -143520], ['Floran', 17838, 170274]].map(([name, x, y]) => ({ name, x, y }));
const zf = (d, z) => { let best = -1, bd = 1e9; d.floors.forEach((f, i) => { if (!f.z) return; if (z >= f.z[0] && z <= f.z[1]) { const c = Math.abs(z - (f.z[0] + f.z[1]) / 2); if (c < bd) { bd = c; best = i; } } }); if (best >= 0) return best;
  d.floors.forEach((f, i) => { if (!f.z) return; if (z >= f.z[0] - 300 && z <= f.z[1] + 300) { const c = Math.min(Math.abs(z - f.z[0]), Math.abs(z - f.z[1])); if (c < bd) { bd = c; best = i; } } }); return best; };
const inPoly = (x, y, P) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b = P[j]; if (((a[1] > y) !== (b[1] > y)) && (x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0])) c = !c; } return c; };
function placeOf(s) {
  const out = {};
  let bt = null, bd = 1e9; TOWNS.forEach(t => { const d = Math.hypot(t.x - s.x, t.y - s.y); if (d < bd) { bd = d; bt = t; } });
  if (bt && bd < 5500) out.town = bt.name; else if (bt) out.nearTown = { name: bt.name, dist: Math.round(bd) };
  for (const d of D) {
    const b = d.bbox; if (!b || s.x < b[0] - 300 || s.x > b[1] + 300 || s.y < b[2] - 300 || s.y > b[3] + 300) continue;
    const fi = zf(d, s.z); if (fi < 0) continue;
    out.dungeon = d.name; out.floor = d.floors[fi].name; out.floorIdx = fi;
    const r = (d.floors[fi].rooms || []).find(r2 => r2.poly && inPoly(s.x, s.y, r2.poly) && (!r2.zRange || (s.z >= r2.zRange[0] - 200 && s.z <= r2.zRange[1] + 200)));
    if (r) out.room = r.id;
    break;
  }
  if (!out.dungeon) {
    const R = (FA.regions || []).find(r => r.bbox && s.x >= r.bbox[0] && s.x <= r.bbox[1] && s.y >= r.bbox[2] && s.y <= r.bbox[3]);   // bbox = [x0, x1, y0, y1]
    if (R) out.region = R.name;
    else { const tx = Math.floor(s.x / 32768) + 20, ty = Math.floor(s.y / 32768) + 18, m = MAPR.find(q => q.tx === tx && q.ty === ty && q.name && s.z >= q.zmin && s.z <= q.zmax); if (m) out.region = m.name; }
  }
  return out;
}
// ---------------------------------------------------------------------------------------------------------------- quests per NPC
const QUESTS = {};
const addQ = (id, q) => { if (!id) return; const L = QUESTS[id] = QUESTS[id] || []; if (!L.includes(q)) L.push(q); };
{ const qd = rd(path.join(DATA, 'quest_dialogs_h5.json'), { legs: [] }); (Array.isArray(qd.legs) ? qd.legs : Object.values(qd.legs || {}).flat()).forEach(l => { if (l && l.npcId) addQ(l.npcId, l.questTitle || l.questName); });
  const rq = rd(path.join(DATA, 'reward_quests_h5.json'), { quests: [] }); (rq.quests || []).forEach(q => { if (q.startNpc) addQ(q.startNpc.id, q.name + ' (start)'); });
  const cq = rd(path.join(DATA, 'class_quests_h5.json'), { quests: {} }); (Array.isArray(cq.quests) ? cq.quests : Object.values(cq.quests || {})).forEach(q => (q.steps || []).forEach(st => addQ(st.npcId, q.name))); }
// ---------------------------------------------------------------------------------------------------------------- live evidence
const LIVE = {};                                          // npc name -> { source: [...], links: Set, pages }
const liveAdd = (name, src, links, extra) => { if (!name) return; const L = LIVE[name] = LIVE[name] || { source: [], links: new Set(), extra: {} }; if (!L.source.includes(src)) L.source.push(src); (links || []).forEach(t => L.links.add(t)); Object.assign(L.extra, extra || {}); };
{ // gatekeeper menus clicked live
  const dir = path.join(DATA, 'gk_live');
  (fs.existsSync(dir) ? fs.readdirSync(dir) : []).filter(f => /\.json$/.test(f) && f[0] !== '_').forEach(f => { const j = rd(path.join(dir, f), null); if (!j) return;
    const links = []; Object.values(j.pages || {}).forEach(L => (L || []).forEach(t => links.push(t)));
    liveAdd(j.name, `gk_live/${f} (${j.updated || ''}, ${j.by || ''})`, links, { at: { x: j.x, y: j.y, z: j.z }, town: j.town }); });
  // saved dialog pages
  (fs.existsSync(LOGS) ? fs.readdirSync(LOGS) : []).filter(f => /^(floor|npc)_.+\.html$/i.test(f)).forEach(f => {
    const html = fs.readFileSync(path.join(LOGS, f), 'utf8');
    let name = /^floor_/.test(f) ? f.replace(/^floor_/, '').replace(/_[^_]+\.html$/i, '') : null;
    if (!name) { const m = MENUS.htmlText(html).match(/^(?:Gatekeeper|Grocer|Priest|Magister|Warehouse Keeper|Trader|Merchant|Blacksmith|Captain|Master|Guard)?\s*([A-Z][A-Za-z' ]{2,30}):/); if (m) name = m[1].trim().split(' ').pop(); }
    if (!name) return;
    liveAdd(name, `Logs/${f}`, MENUS.pageLinks(html).map(l => l.text).filter(Boolean));
  });
  const fl = rd(path.join(LOGS, 'floor_links_live.json'), {});
  Object.entries(fl).forEach(([k, v]) => { if (!v || !v.npcs) return; Object.entries(v.npcs).forEach(([n, r]) => liveAdd(n, `Logs/floor_links_live.json ${k}: ${r.last}`, r.text ? [r.text] : [], { floorLink: Object.assign({ key: k }, r) })); });
  const shops = rd(path.join(DATA, 'shopscan_giran.json'), { shops: [] });
  (shops.shops || []).forEach(s => liveAdd(s.npc || s.name, 'shopscan_giran.json', (s.links || []).concat(s.lists ? Object.keys(s.lists) : []), { shop: true }));
}
// ---------------------------------------------------------------------------------------------------------------- build
const BL = MENUS.buylists();
const atlas = [], stats = { npcs: 0, byRole: {}, withTeleports: 0, liveSeen: 0, mismatches: 0 }, mismatches = [];
const seenSpawn = new Set();
SP.forEach(s => {
  const t = NPCS[s.id]; if (!t || SKIP_TYPE.test(t.ty || '')) return;
  if (s.id >= 18000 && s.id < 30000 && !/L2Teleporter|L2Merchant|L2Warehouse/.test(t.ty || '')) return;    // decoration / event objects
  const key = `${s.id}@${s.x},${s.y}`; if (seenSpawn.has(key)) return; seenSpawn.add(key);
  const name = t.n || s.name, roles = rolesOf(t, s.id), m = MENUS.menuOf(s.id);
  const e = { id: s.id, name, title: t.t || '', type: t.ty, x: s.x, y: s.y, z: s.z, roles, place: placeOf(s) };
  if (s.name && s.name !== name) e.spawnName = s.name;
  const tps = m.teleports.map(tp => ({ text: tp.text, dest: tp.dest, desc: tp.desc, price: tp.price, tpId: tp.tpId || undefined, ev: tp.ev || undefined, needs: tp.needs || undefined }))
    .concat(m.scripted.filter(x => x.dest).map(x => ({ text: x.text, dest: { x: x.dest.x, y: x.dest.y, z: x.dest.z }, desc: x.script, price: 0, needs: x.needs || undefined, scripted: true })));
  if (tps.length) { e.teleports = tps; stats.withTeleports++; if (!roles.includes('teleporter') && !roles.includes('gatekeeper')) roles.push('teleporter'); }
  if (BL[s.id]) e.shop = BL[s.id].map(b => ({ list: b.list, items: b.items }));
  if (QUESTS[s.id]) e.quests = QUESTS[s.id].slice(0, 30);
  if (m.scripts.length) e.scripts = m.scripts;
  // live cross-check
  const L = LIVE[name] || (e.spawnName && LIVE[e.spawnName]);
  if (L && (!L.extra.at || Math.hypot(L.extra.at.x - s.x, L.extra.at.y - s.y) < 3000)) {
    e.live = { source: L.source.slice(0, 4), links: [...L.links].slice(0, 60) }; stats.liveSeen++;
    if (L.extra.floorLink) e.live.floorLink = L.extra.floorLink;
    const liveN = new Set([...L.links].map(norm)), mm = [];
    (e.teleports || []).forEach(tp => { const n = norm(tp.text), n2 = norm(tp.desc ? String(tp.desc).split('->').pop() : ''); if (!liveN.has(n) && !(n2 && liveN.has(n2)) && ![...liveN].some(x => x && (x.includes(n) || (n2 && x.includes(n2))))) mm.push(`datapack link "${tp.text}" not in the live menu`); });
    if (/gk_live/.test(L.source.join()) && (e.teleports || []).length) {
      const dpN = new Set((e.teleports || []).flatMap(tp => [norm(tp.text), norm(tp.desc ? String(tp.desc).split('->').pop() : '')]));
      [...L.links].filter(t => !/^(quest|teleport|exchange|call|back|\(nobless)/i.test(t) && !/free\)?$/i.test(t)).forEach(t => { const n = norm(t); if (n && !dpN.has(n) && ![...dpN].some(x => x && (x.includes(n) || n.includes(x)))) mm.push(`live link "${t}" not in the datapack menu`); });
    }
    if (mm.length) { e.live.mismatch = mm.slice(0, 20); stats.mismatches++; mismatches.push({ id: s.id, name, place: e.place, mismatch: mm }); }
  }
  roles.forEach(r => { stats.byRole[r] = (stats.byRole[r] || 0) + 1; });
  atlas.push(e); stats.npcs++;
});
// ---------------------------------------------------------------------------------------------------------------- validation
// (a) every dungeon floor link + floor enter NPC: does the atlas know an NPC there that offers that link?
const doubtful = [], checked = [];
const near = (id, p, r) => atlas.filter(a => a.id === id && Math.hypot(a.x - p.x, a.y - p.y) < (r || 600));
D.forEach(d => (d.floors || []).forEach((F, fi) => {
  (F.links || []).concat(F.enter && F.enter.npc ? [{ npc: F.enter.npc, to: fi, linkText: F.enter.npc.link, enter: true, at: { x: F.enter.npc.x, y: F.enter.npc.y } }] : []).forEach(l => {
    if (!l.npc || !l.npc.id) return;
    const what = `${d.name}: ${l.enter ? 'enter ' + F.name : F.name + ' -> ' + (typeof l.to === 'number' ? (l.to < 0 ? 'outside' : (d.floors[l.to] || {}).name) : l.to)} via ${l.npc.name} (${l.npc.id})`;
    const A = near(l.npc.id, l.at || l.npc, 800);
    if (!A.length) { doubtful.push({ what, why: 'no such NPC spawn there in the datapack' }); return; }
    const a = A[0], txt = norm(l.linkText || ''), offers = (a.teleports || []).some(tp => !txt || norm(tp.text) === txt) || (a.scripts || []).length;
    const live = a.live && (a.live.links || []).some(t => norm(t) === txt);
    if (!offers) doubtful.push({ what, why: `the datapack menu of ${a.name} has no "${l.linkText}"` });
    else checked.push({ what, live: !!live || l.verified === true });
    if (offers && !live && l.verified !== true) doubtful.push({ what, why: 'datapack only — not seen live yet', soft: true });
  });
}));
// (b) every town -> field teleport we use (dungeon gatekeeper routes): the town's gatekeeper offers it (live menu first)
D.forEach(d => { const g = d.gatekeeperRoute; if (!g || !g.town || !g.destination) return;
  const gks = atlas.filter(a => a.roles.includes('gatekeeper') && a.place.town === g.town);
  const live = gks.some(a => a.live && (a.live.links || []).some(t => norm(t) === norm(g.destination)));
  const dp = gks.some(a => (a.teleports || []).some(tp => norm(tp.text) === norm(g.destination) || norm(String(tp.desc || '').split('->').pop()) === norm(g.destination)));
  const what = `${g.town} -> ${g.destination} (${d.name})`;
  if (live) checked.push({ what, live: true }); else if (dp) { checked.push({ what, live: false }); doubtful.push({ what, why: 'in the datapack menu, not seen live', soft: true }); } else doubtful.push({ what, why: `no gatekeeper in ${g.town} offers it (datapack or live)` });
});
const out = { generated: new Date().toISOString(), tool: 'docs/plan/tools/npc_atlas.js', sources: ['spawns_h5.json', 'npcs_h5.json', 'dp/html_teleporter', 'dp/ai_teleports', 'l2j_teleport.sql', 'dp/buylists', 'quest_dialogs_h5.json', 'reward_quests_h5.json', 'class_quests_h5.json', 'gk_live/*.json', 'Logs/floor_*.html', 'Logs/npc_*.html', 'Logs/floor_links_live.json', 'shopscan_giran.json'],
  stats, validation: { checked: checked.length, doubtful }, mismatches, npcs: atlas };
fs.writeFileSync(path.join(DATA, 'npc_atlas.json'), JSON.stringify(out));
// ---------------------------------------------------------------------------------------------------------------- docs/plan/npc_atlas.md
const md = [];
md.push('# NPC atlas (every NPC: where it is, what it can do)', '', `Generated ${out.generated} by \`node docs/plan/tools/npc_atlas.js\` -> \`Scripts/data/npc_atlas.json\`. User 2026-10-09: "Research ALL NPCs, where they are and what they can do, cross-reference location and menus ... I want all the bots to understand where all NPCs are and how to get to them."`, '',
  '**Sources** (trust order): live pages L2Toggle showed (gk_live menus, Logs/floor_*.html, Logs/npc_*.html, floor_links_live.json, shopscan) > datapack menus (data/html/teleporter + ai/npc/Teleports pages + Java Location tables, l2j_teleport.sql landings, buylists, quest data) > spawn list. NPC names are the CLIENT names (npcs_h5.json), the spawn list name is kept as `spawnName` (Cruma: Janssen = Ponti, Rombel = Penelope, Belkadhi = Capella, Ian = Hanna, Carsus = Mozella).', '',
  `**Totals:** ${stats.npcs} NPC spawns, ${stats.withTeleports} with teleports, ${stats.liveSeen} seen live, ${stats.mismatches} with a datapack/live mismatch.`, '',
  '| Role | Spawns |', '|---|---|', ...Object.entries(stats.byRole).sort((a, b) => b[1] - a[1]).map(([r, n]) => `| ${r} | ${n} |`), '',
  '## How the bots use it (swarm.js NPC NAVIGATION, 2026-10-09)',
  '- `!goto npc <query> [character]` (dashboard: Commands -> Move / Travel -> "Go to an NPC (anywhere)…", or Teleports tab -> "Find an NPC" -> "Send party"). Query: `#30487` / `30487` (id), `Penelope` (name), a role (`grocer`, `gatekeeper`, `warehouse`, `priest of dawn`, `class master`, `blacksmith`, `weapons`, `armor`, `jewelry`, `trainer`, `ziggurat` …) with an optional town (`grocer dion`, `warehouse in Giran`), or what it offers (`teleport:Cruma Tower 2nd floor`). Without a character name the party leader takes the party; with one, that character goes alone.',
  '- `npcFind` ranks the candidates by travel cost from where the bot stands (same dungeon floor / same town first, seen-live first; for `teleport:` a link seen live wins). `npcTripPlan` -> steps: `town` (team .townname / gatekeeper) | `dungeon` (the dungeon way in: gatekeeper route + floor entry teleporter, or the Ziggurat) | `room-walk` (room by room along the hallway centrelines, floor teleporters on the way) | `travel` (teleport near + walk) | `walk` (in a town: the town street graph to the spot in front of the NPC, in through the house door; Giran: the recorded route first) | `talk` (open the dialog, optional link by text). Progress: intent "npc trip", swarm_state `npcTrip`.',
  '- Floor teleporters pick the NPC by what it OFFERS (floorTeleport): every NPC within 700 is a candidate; Logs/floor_links_live.json remembers which one worked. dawnPriestSpot falls back to the atlas.',
  '- Town street graphs: `Scripts/data/town_graph/<key>.json` (docs/plan/tools/town_graph.js, check images docs/plan/town_graphs/index.html).', '',
  '## Fields of an entry', '`{ id, name, spawnName?, title, type, x, y, z, roles: [...], place: { town | nearTown, region, dungeon, floor, floorIdx, room }, teleports: [{ text, dest {x,y,z}, desc, price, tpId | ev, needs, scripted }], shop: [{ list, items }], quests: [...], scripts: [...], live: { source, links, mismatch, floorLink } }`', '',
  '## Validation: floor links and town -> field teleports', `${checked.length} checked. Doubtful (hard = the atlas does not back it; soft = datapack only, not seen live yet):`, '',
  '| What | Why | Kind |', '|---|---|---|', ...doubtful.map(x => `| ${x.what} | ${x.why} | ${x.soft ? 'soft' : '**hard**'} |`), '',
  '## Datapack vs live mismatches', ...(mismatches.length ? mismatches.map(m2 => `- **${m2.name}** (${m2.id}, ${m2.place.town || m2.place.dungeon || m2.place.region || ''}): ${m2.mismatch.slice(0, 6).join('; ')}`) : ['none']), '');
// dungeon NPCs
md.push('## NPCs inside the dungeons (floor + room)', '', '| Dungeon | Floor | NPC | Roles | Teleports (datapack) | Live |', '|---|---|---|---|---|---|');
atlas.filter(a => a.place.dungeon).sort((a, b) => (a.place.dungeon + a.place.floorIdx).localeCompare(b.place.dungeon + b.place.floorIdx)).forEach(a => {
  md.push(`| ${a.place.dungeon} | ${a.place.floor}${a.place.room ? ' (' + a.place.room + ')' : ''} | ${a.name}${a.spawnName ? ' (' + a.spawnName + ')' : ''} ${a.id} @ ${a.x},${a.y},${a.z} | ${a.roles.join(', ')} | ${(a.teleports || []).map(t => `"${t.text}" -> ${t.dest.x},${t.dest.y},${t.dest.z}${t.needs ? ' (needs ' + t.needs + ')' : ''}`).join('; ').slice(0, 300)} | ${a.live ? (a.live.links || []).slice(0, 4).join(' / ') : ''} |`);
});
// towns: key services
md.push('', '## Towns: key services', '', '| Town | Gatekeeper | Grocer | Warehouse | Priest of Dawn | Class / village masters | Blacksmith |', '|---|---|---|---|---|---|---|');
TOWNS.forEach(t => { const A = atlas.filter(a => a.place.town === t.name); const L = (r) => A.filter(a => a.roles.includes(r)).map(a => a.name).slice(0, 4).join(', ');
  md.push(`| ${t.name} | ${L('gatekeeper')} | ${L('grocer')} | ${L('warehouse')} | ${L('priest of dawn')} | ${L('class master')} | ${L('blacksmith')} |`); });
fs.writeFileSync(path.join(ROOT, 'docs', 'plan', 'npc_atlas.md'), md.join('\n') + '\n');
console.log(`npc_atlas.json: ${stats.npcs} NPCs, ${stats.withTeleports} with teleports, ${stats.liveSeen} seen live, ${stats.mismatches} mismatches; validation ${checked.length} checked, ${doubtful.filter(x => !x.soft).length} hard + ${doubtful.filter(x => x.soft).length} soft doubtful`);
