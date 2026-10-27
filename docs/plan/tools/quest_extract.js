// QUEST EXTRACT (2026-10-12, user: "a complete quest overview with rewards and all steps ... mark all quest items ... where you get the
// quest items, where to hunt, what to kill to spawn what quest monsters ... rewards ... requirements").
//
// Reads EVERY quest script of the L2J High Five datapack (Java + html) and writes
//   Scripts/data/quests_h5.json       one record per quest (schema below)
//   Scripts/data/quest_items_h5.json  every item a quest touches -> the quests and what they do with it
// and prints a coverage report (also stored in quests_h5.json meta.coverage).
//
// Run:  node docs/plan/tools/quest_extract.js [<datapack root>]
//   <datapack root> = a clone of github.com/Shagooh/l2j-server-datapack (sparse is fine) with at least
//     src/main/java/com/l2jserver/datapack/quests/**  src/main/resources/data/stats/npcs/*.xml  src/main/resources/data/stats/items/*.xml
//   default: env L2J_DP, then Scripts/data/dp/l2j-server-datapack, then the last scratchpad clone.
//   git clone --filter=blob:none --sparse https://github.com/Shagooh/l2j-server-datapack dp
//   cd dp && git sparse-checkout set src/main/java/com/l2jserver/datapack/quests src/main/resources/data/stats/npcs src/main/resources/data/stats/items
//
// Other inputs (all optional except the datapack): Dashboard/data/items.json (names + icons, same lookup as the gear page:
// itemIcon(id) = iconUrl(items[id][1])), Scripts/data/{npcs_h5,spawns_h5,spawns_npc_h5,npc_atlas,field_areas,teleports_h5,
// dungeon_rooms,map_regions,npc_strings}.json, Data/base.db (client ZIP: entries Quests = official step titles, QuestNpcs).
//
// HOW IT PARSES: a small Java "block walker" (no full parser): every statement is seen together with the stack of blocks around it
// (method, if / else conditions, switch subjects + case labels). From that stack it knows the trigger (onTalk / onAdvEvent / onKill ...),
// the NPC (switch npc.getId(), npc.getId() == X), the event, the cond / memo state, the quest state (CREATED / STARTED) and random chances.
// Statements give facts: startQuest, setCond, setMemoState, exitQuest, giveItems / rewardItems / giveItemRandomly / takeItems,
// giveAdena, addExpAndSp, addSpawn, startQuestTimer, item count checks. Constants (ints, arrays, ItemHolder, QuestItemChanceHolder,
// Location, maps filled in static blocks, Map.of, QuestDroplist builders) are evaluated. Saga quests (AbstractSagaQuest) are parsed by
// substituting each saga's _npc / _items / _mob arrays into the template source.
//
// ===== quests_h5.json schema =====
// { meta: { generated, tool, source, notes[], coverage{...}, schema },
//   quests: { "<id>": QUEST } }
// QUEST = {
//   id, name (in-game title), className, file (datapack path),
//   type: 'one-time' | 'repeatable' | 'daily' | 'unknown',   typeWhy: text,  endless: true when it never ends (turn in again and again)
//   clientType: 1 normal | 2 repeatable | 3 epic/item | 4 class | 5 story (from the client data, hint only)
//   level: { min, max },  levelWhy,
//   requirements: { races[], notRaces[], classes[], notClasses[], categories[], quests[{id,name,need:'completed'|'started'|'not-started'}],
//                   items[{id,name}], noble, clan, subclass, other[] (raw Java conditions on the start path) },
//   description: text of the offer page (html that links to the start event),
//   startNpcs[NPC], npcs[NPC] (every NPC the quest talks to),   NPC = { id, name, title, town, region, spawns[[x,y,z]] (max 5),
//                   spawnCount, clientPos [x,y,z] (client QuestNpcs), spawnedByQuest: true when only the script spawns it }
//   monsters[MOB]: { id, name, level, type, aggressive, raid, spawnCount, roles['kill','attack','spawned','drop'],
//                    areas[{region, area, name, levels:[a,b], landing:{desc,x,y,z}}] (Scripts/data/field_areas.json, max 4),
//                    clusters[{at:[x,y,z], count, place, landing:{desc,x,y,z,dist}}] (max 3, from spawns_h5.json) }
//   items[ITEM]: { id, name, icon, questItem (registerQuestItems or is_questitem), roles[], limit (max count found), givenBy[], takenBy[],
//                  dropsFrom[{npc, chance}] (quest drops), normalDrops[{npc, name, chance, spoil}] (npc xml, for hand-ins that are NOT quest items) }
//   steps[STEP]: STEP = { cond, title (official client step text), talk[{npc, ...}], leave[TRANSITION], drops[DROP], kills[KILL], spawns[SPAWN] }
//   transitions[TRANSITION]: { from: [cond..] | null, fromMemo, to: cond | 'start' | 'end', memo, trigger: TRIGGER, gives[{id,count,chance?}],
//                    takes[{id,count}], adena: ADENA, exp, sp, spawns[SPAWN], end: 'one-time'|'repeatable'|'daily'|null, random: true }
//   TRIGGER = { type: 'talk'|'event'|'kill'|'attack'|'skill'|'spawn'|'firstTalk'|'item'|'timer'|'zone'|'other', npcs[ids], events[names],
//               links[link text to click], timer, state, raw[] (Java conditions) }
//   drops[DROP]: { item, monsters[ids], chance (percent, number) | chanceByNpc{npcId: percent}, amount [min,max], limit, conds[], memos[],
//                  needItems[ids], party (any party member may get it), src: 'droplist'|'holder'|'script' }
//   kills[KILL]: { monsters[ids], count (target, when a counter is used), conds[], to }        (kill quests without an item)
//   spawns[SPAWN]: { npc, by: TRIGGER, at: {x,y,z} | 'killed monster' | 'player' | 'npc' | null, despawnMs }
//   timers[{name, ms, by}]
//   rewards: { final[REWARD] (quest end), choices: true when the player picks one of several, turnIns[REWARD] (repeat hand-ins while the
//              quest stays open), steps[REWARD] (rewards given on the way) }
//   REWARD = { trigger: TRIGGER, adena: ADENA, exp, sp, items[{id, name, count, chance?}], takes[{id,count}] }
//   ADENA = number | { perItem[{items[ids], each}], bonus{min, adena}, base, range[a,b], raw }
//   parse: { status: 'full'|'partial'|'manual', reasons[] }
// }
// quest_items_h5.json: { meta, items: { "<itemId>": { name, icon, questItem, quests[{ id, name, roles[], limit }] } } }
'use strict';
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const DATA = path.join(ROOT, 'Scripts', 'data');
const rd = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, '')); } catch (e) { return d; } };

// ---------------------------------------------------------------------------------------------------------------------------------
// datapack location
function findDp() {
  const cands = [process.argv.slice(2).find(a => !a.startsWith('--')), process.env.L2J_DP, path.join(DATA, 'dp', 'l2j-server-datapack'),
    '%TEMP%/scratch'].filter(Boolean);
  for (const c of cands) if (fs.existsSync(path.join(c, 'src/main/java/com/l2jserver/datapack/quests'))) return c;
  console.error('datapack not found; pass its root: node quest_extract.js <dp root> (see the header for the sparse clone)'); process.exit(1);
}
// required as a module (tests: docs/plan/tools/test_quest_extract.js) = no datapack needed, nothing runs or is written
const IS_MAIN = require.main === module;
const DP = IS_MAIN ? findDp() : (process.env.L2J_DP || '');
const ONLY = (process.argv.find(a => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean).map(Number);
const QDIR = path.join(DP, 'src/main/java/com/l2jserver/datapack/quests');
const NPCXML = path.join(DP, 'src/main/resources/data/stats/npcs');
const ITEMXML = path.join(DP, 'src/main/resources/data/stats/items');

// ---------------------------------------------------------------------------------------------------------------------------------
// reference data
const ITEMS = rd(path.join(ROOT, 'Dashboard', 'data', 'items.json'), {});
const NPCS = rd(path.join(DATA, 'npcs_h5.json'), {});
const SPAWNS = rd(path.join(DATA, 'spawns_h5.json'), []).concat(rd(path.join(DATA, 'spawns_npc_h5.json'), []));
const ATLAS = rd(path.join(DATA, 'npc_atlas.json'), { npcs: [] });
const FA = rd(path.join(DATA, 'field_areas.json'), { regions: [] });
const TPS = (() => { const t = rd(path.join(DATA, 'teleports_h5.json'), []); return Array.isArray(t) ? t : (t.teleports || []); })();
const DR = rd(path.join(DATA, 'dungeon_rooms.json'), []);
const MAPREG = rd(path.join(DATA, 'map_regions.json'), []);
const NPCSTR = rd(path.join(DATA, 'npc_strings.json'), {});

const spawnsById = new globalThis.Map();
{ const seen = new Set(); for (const s of SPAWNS) { const k = s.id + ':' + s.x + ':' + s.y + ':' + s.z; if (seen.has(k)) continue; seen.add(k);
  if (!spawnsById.has(s.id)) spawnsById.set(s.id, []); spawnsById.get(s.id).push([s.x, s.y, s.z, s.count || 1]); } }
const atlasById = new globalThis.Map(); for (const a of (ATLAS.npcs || [])) atlasById.set(a.id, a);
const rooms = []; (Array.isArray(DR) ? DR : (DR.dungeons || [])).forEach(d => (d.floors || []).forEach(fl => (fl.rooms || []).forEach(r => { if (r.center) rooms.push({ d: d.name || d.key, fl: fl.name, r: r.name, c: r.center, z: fl.z }); })));
const regionName = (x, y, z) => { const tx = Math.floor(x / 32768) + 20, ty = Math.floor(y / 32768) + 18;
  const L = MAPREG.filter(m => m.tx === tx && m.ty === ty && m.name); const m = L.find(m => z >= m.zmin && z <= m.zmax); return m ? m.name : null; };   // own height layer only (2026-10-13: "|| L[0]" named surface places after the underground layer, docs/plan/raid_zone_names_fix.md)
const nearestLanding = (x, y) => { let b = null; for (const t of TPS) { const d = Math.hypot(t.x - x, t.y - y); if (!b || d < b.dist) b = { desc: t.desc || t.name || '', x: t.x, y: t.y, z: t.z, dist: Math.round(d) }; } return b; };
const placeOf = (x, y, z) => {
  let best = null; rooms.forEach(o => { if (o.z && (z < o.z[0] - 200 || z > o.z[1] + 200)) return; const dd = Math.hypot(o.c[0] - x, o.c[1] - y); if (dd < 2500 && (!best || dd < best.dd)) best = Object.assign({ dd }, o); });
  if (best) return `${best.d}${best.fl ? ' ' + best.fl : ''}: ${best.r}`;
  return regionName(x, y, z);
};
// monster -> field areas
const areasByMob = new globalThis.Map();
for (const g of (FA.regions || [])) for (const a of (g.areas || [])) for (const m of (a.monsters || [])) {
  if (!areasByMob.has(m.id)) areasByMob.set(m.id, []);
  const e = a.entry || {}; const L = e.landing || (g.landings && g.landings[0] ? [g.landings[0].x, g.landings[0].y, g.landings[0].z] : null);
  areasByMob.get(m.id).push({ region: g.id, area: a.id, name: a.name, levels: a.levelRange || null, count: m.count || 0,
    landing: L ? { desc: e.desc || (g.landings && g.landings[0] && g.landings[0].desc) || '', x: L[0], y: L[1], z: L[2] } : null });
}

// client data (Data/base.db is a ZIP)
function zipEntries(file) {
  const out = {}; let b; try { b = fs.readFileSync(file); } catch (e) { return out; }
  let eocd = -1; for (let i = b.length - 22; i >= Math.max(0, b.length - 70000); i--) if (b.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) return out;
  const n = b.readUInt16LE(eocd + 10); let p = b.readUInt32LE(eocd + 16);
  for (let k = 0; k < n; k++) {
    if (b.readUInt32LE(p) !== 0x02014b50) break;
    const method = b.readUInt16LE(p + 10), csize = b.readUInt32LE(p + 20), nl = b.readUInt16LE(p + 28), el = b.readUInt16LE(p + 30), cl = b.readUInt16LE(p + 32), off = b.readUInt32LE(p + 42);
    const name = b.toString('utf8', p + 46, p + 46 + nl);
    out[name] = () => { const ln = b.readUInt16LE(off + 26), le = b.readUInt16LE(off + 28); const d = b.subarray(off + 30 + ln + le, off + 30 + ln + le + csize);
      return (method === 8 ? zlib.inflateRawSync(d) : d).toString('utf8'); };
    p += 46 + nl + el + cl;
  }
  return out;
}
const Z = zipEntries(path.join(ROOT, 'Data', 'base.db'));
const CLIENT = {}; const CLIENT_NPCS = {};
if (Z.Quests) for (const line of Z.Quests().split(/\r?\n/)) { const m = /^(\d+)=([^|]*)\|(\d+)(?:\|(\d+))?(?:\|(.*))?$/.exec(line); if (!m) continue;
  const steps = m[5] ? m[5].split('|').map(s => s.replace(/ \? /g, ' – ').replace(/^\? /, '').trim()) : [];
  CLIENT[+m[1]] = { key: m[2], type: +m[3], steps }; }
if (Z.QuestNpcs) for (const line of Z.QuestNpcs().split(/\r?\n/)) { const m = /^(\d+)=(.*)$/.exec(line); if (!m) continue;
  CLIENT_NPCS[+m[1]] = m[2].split('|').map(s => { const p = s.split(','); return { name: p[0], at: p.slice(1, 4).map(Number) }; }).filter(x => x.name); }

// datapack item xml: quest item flags + names
const ITEMX = {};
if (fs.existsSync(ITEMXML)) for (const f of fs.readdirSync(ITEMXML).filter(f => f.endsWith('.xml'))) {
  const x = fs.readFileSync(path.join(ITEMXML, f), 'utf8'); const re = /<item id="(\d+)"[^>]*name="([^"]*)"[^>]*>([\s\S]*?)<\/item>/g; let m;
  while ((m = re.exec(x))) ITEMX[m[1]] = { name: m[2].replace(/&apos;/g, "'").replace(/&amp;/g, '&'), quest: /name="is_questitem" val="true"/.test(m[3]) };
}
// datapack npc xml: level, type, aggressive, drops (death groups and spoil)
const NPCX = {};
if (fs.existsSync(NPCXML)) for (const f of fs.readdirSync(NPCXML).filter(f => f.endsWith('.xml'))) {
  const x = fs.readFileSync(path.join(NPCXML, f), 'utf8'); const re = /<npc id="(\d+)"([^>]*)>([\s\S]*?)<\/npc>/g; let m;
  while ((m = re.exec(x))) {
    const at = (k) => (new RegExp(k + '="([^"]*)"').exec(m[2]) || [])[1];
    const body = m[3]; const r = { level: +at('level') || 0, type: at('type') || '', name: (at('name') || '').replace(/&apos;/g, "'"), title: at('title') || '',
      aggressive: /isAggressive="true"/.test(body), drops: [] };
    const dd = /<death>([\s\S]*?)<\/death>/.exec(body);
    if (dd) { const dg = /<group chance="([\d.]+)">([\s\S]*?)<\/group>/g; let g; while ((g = dg.exec(dd[1]))) { const gi = /<item id="(\d+)" min="(\d+)" max="(\d+)" chance="([\d.]+)"/g; let k;
      while ((k = gi.exec(g[2]))) r.drops.push([+k[1], Math.round((+g[1]) * (+k[4]) / 100 * 1000) / 1000, 0]); } }
    const c = /<corpse>([\s\S]*?)<\/corpse>/.exec(body);
    if (c) { const ci = /<item id="(\d+)" min="(\d+)" max="(\d+)" chance="([\d.]+)"/g; let k; while ((k = ci.exec(c[1]))) r.drops.push([+k[1], +k[4], 1]); }
    NPCX[m[1]] = r;
  }
}
const droppersOf = (() => { let idx = null; return (itemId) => {
  if (!idx) { idx = {}; for (const [nid, r] of Object.entries(NPCX)) for (const [iid, ch, sp] of r.drops) (idx[iid] = idx[iid] || []).push({ npc: +nid, name: r.name, level: r.level, chance: ch, spoil: !!sp }); }
  return (idx[itemId] || []).filter(d => spawnsById.has(d.npc)).sort((a, b) => b.chance - a.chance).slice(0, 8);
}; })();

const itemName = (id) => (ITEMS[id] && ITEMS[id][0]) || (ITEMX[id] && ITEMX[id].name) || `Item ${id}`;
const itemIcon = (id) => (ITEMS[id] && ITEMS[id][1]) || null;
const npcName = (id) => (NPCS[id] && NPCS[id].n) || (NPCX[id] && NPCX[id].name) || `NPC ${id}`;

// ---------------------------------------------------------------------------------------------------------------------------------
// Java helpers
function stripComments(src) {
  let out = '', i = 0; const n = src.length;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '"' && src.startsWith('"""', i)) { const j = src.indexOf('"""', i + 3); const e = j < 0 ? n : j + 3; out += JSON.stringify(src.slice(i + 3, e - 3)); i = e; continue; }
    if (c === '"' || c === "'") { let j = i + 1; while (j < n && src[j] !== c) { if (src[j] === '\\') j++; j++; } out += src.slice(i, j + 1); i = j + 1; continue; }
    if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') { const j = src.indexOf('*/', i + 2); i = j < 0 ? n : j + 2; out += ' '; continue; }
    out += c; i++;
  }
  return out;
}
function matchClose(s, i, open, close) { // s[i] === open
  let d = 0; for (let j = i; j < s.length; j++) { const c = s[j];
    if (c === '"' || c === "'") { j++; while (j < s.length && s[j] !== c) { if (s[j] === '\\') j++; j++; } continue; }
    if (c === open) d++; else if (c === close) { d--; if (!d) return j; } }
  return s.length - 1;
}
const stripGenerics = (s) => { let p; do { p = s; s = s.replace(/<\s*>/g, '').replace(/(\w)\s*<\s*[A-Z?][\w.?]*(?:\[\])*(?:\s*,\s*[A-Z?][\w.?]*(?:\[\])*)*\s*>/g, '$1'); } while (s !== p); return s; };
function splitTop(s, sep = ',') {
  const out = []; let d = 0, cur = '';
  for (let i = 0; i < s.length; i++) { const c = s[i];
    if (c === '"' || c === "'") { let j = i + 1; while (j < s.length && s[j] !== c) { if (s[j] === '\\') j++; j++; } cur += s.slice(i, j + 1); i = j; continue; }
    if ('([{'.includes(c)) d++; else if (')]}'.includes(c)) d--;
    if (d === 0 && s.startsWith(sep, i)) { out.push(cur.trim()); cur = ''; i += sep.length - 1; continue; }
    cur += c; }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
const unparen = (s) => { s = s.trim(); while (s.startsWith('(') && matchClose(s, 0, '(', ')') === s.length - 1) s = s.slice(1, -1).trim(); return s; };
// every call of `name(` in s -> { args[], qualified (preceded by '.'), qual (the object), at }
function calls(s, name) {
  const out = []; if (s.indexOf(name) < 0) return out;
  const re = new RegExp('\\b' + name + '\\s*\\(', 'g'); let m;
  while ((m = re.exec(s))) { const o = m.index + m[0].length - 1; const e = matchClose(s, o, '(', ')');
    let j = m.index - 1; while (j >= 0 && s[j] === ' ') j--; let qualified = false, qual = '';
    if (j >= 0 && s[j] === '.') { qualified = true; let k = j - 1; let d = 0; while (k >= 0) { const c = s[k]; if (c === ')') d++; else if (c === '(') { if (!d) break; d--; } else if (!d && !/[\w.]/.test(c)) break; k--; } qual = s.slice(k + 1, j); }
    out.push({ args: splitTop(s.slice(o + 1, e)), qualified, qual, at: qualified ? m.index - qual.length - 1 : m.index, end: e }); }
  return out;
}
function takeLabels(s) {
  let labels = null, m, arrow = false; const re = /^\s*(?:case\s+((?:"[^"]*"|[^:"\-]|-(?!>))+?)\s*(?::(?!:)|->)|default\s*(?::|->))/;
  while ((m = re.exec(s))) { labels = labels || []; if (m[1]) labels.push(...splitTop(m[1])); else labels.push('default'); if (/->$/.test(m[0])) arrow = true; s = s.slice(m[0].length); }
  return { labels, rest: s.trim(), arrow };
}
// a statement that leaves its case block (no fall-through into the next case)
const isTerminator = (s) => /^(break|continue)\b|^return\b|^throw\b/.test(String(s).trim());
const isInit = (h) => /(=|\[\s*\]|,|\{|\breturn)\s*$/.test(h) || /^\s*$/.test(h) && false;

// block walker: cb(stmt, frames[], labels)
// CASE BLOCKS (2026-10-27, verifier quest_verify.md finding 1): every `case X:` of a switch opens its OWN pseudo frame (header '<case>',
// labels = its case labels), so the statements of braceless cases are no longer one frame (buildQuest groups facts into actions BY FRAME:
// Q6 `case "30006-03.htm": st.startQuest(); break; case "30006-06.html": ... st.exitQuest(...)` used to become ONE action start -> end).
// Fall-through: a case whose block did not end with break / return / throw / continue runs on into the next case, so the next segment
// carries both label sets (`case A: x(); case B: y(); break;` -> x under A, y under A and B). Arrow cases (`case X ->`) never fall through.
function walk(src, cb, cbHead) {
  let fid = 0; const root = { id: fid++, header: '<root>', labels: null, curLabels: null, lastIf: null };
  const stack = [root]; let cur = '', paren = 0, i = 0; const n = src.length;
  const top = () => stack[stack.length - 1];
  const isSwitchF = (f) => f && /^switch\s*\(/.test(f.header || '');
  // a case label seen at the top of a switch (or of the current case segment): open the case segment frame
  const openCase = (labels, arrow) => {
    let t = top();
    if (t.isCase) { stack.pop(); const prevOpen = !t.ended && !t.arrow && t.stmts > 0; const prevEmpty = !t.stmts && !t.ended; const inherit = (prevOpen || prevEmpty) ? t.labels : [];
      labels = [...new Set(inherit.concat(labels))]; t = top(); }
    if (!isSwitchF(t)) return null;
    const f = { id: fid++, header: '<case>', labels, curLabels: null, lastIf: null, isCase: true, arrow: !!arrow, ended: false, stmts: 0 };
    t.curLabels = labels; stack.push(f); return f;
  };
  const noteStmt = (s, pseudoLen) => { const t = top(); if (!t.isCase) { t.lastTerm = !pseudoLen && isTerminator(s); return; } t.stmts++; if (!pseudoLen && isTerminator(s)) t.ended = true; };
  const peel = (s, frames, labels) => { // braceless if / else prefixes become pseudo frames
    const pseudo = [];
    for (;;) {
      let m = /^(else\s+)?if\s*\(/.exec(s);
      if (m) { const o = s.indexOf('(', m[0].length - 1); const e = matchClose(s, o, '(', ')');
        if (cbHead) cbHead(s.slice(o + 1, e), stack.concat(pseudo), labels);
        pseudo.push({ id: fid++, header: (m[1] ? 'else if ' : 'if ') + s.slice(o, e + 1), labels, prevIf: m[1] ? (top().lastIf || []) : null, pseudo: true });
        s = s.slice(e + 1).trim(); continue; }
      m = /^else\b\s*/.exec(s);
      if (m) { pseudo.push({ id: fid++, header: 'else', labels, prevIf: top().lastIf || [], pseudo: true }); s = s.slice(m[0].length); continue; }
      break;
    }
    if (pseudo.length) { const f = pseudo[pseudo.length - 1]; top().lastIf = /^if|^else if/.test(f.header) ? (f.prevIf || []).concat([f]) : null; }
    else top().lastIf = null;
    return { s, pseudo };
  };
  while (i < n) {
    const c = src[i];
    if (c === '"' || c === "'") { let j = i + 1; while (j < n && src[j] !== c) { if (src[j] === '\\') j++; j++; } cur += src.slice(i, j + 1); i = j + 1; continue; }
    if (c === '(') { paren++; cur += c; i++; continue; }
    if (c === ')') { paren--; cur += c; i++; continue; }
    if (paren > 0) { cur += c; i++; continue; }
    if (c === '{') {
      const h = cur.trim();
      if (isInit(h)) { const j = matchClose(src, i, '{', '}'); cur += src.slice(i, j + 1); i = j + 1; continue; }
      cur = ''; let t = top(); const { labels, rest, arrow } = takeLabels(h); if (labels) { if (openCase(labels, arrow)) t = top(); else t.curLabels = labels; }
      if (t.isCase) t.stmts++;
      let header = rest, pseudo = [];
      if (!/^(if|else|switch|for|while|do|try|catch|finally|synchronized|static)\b/.test(header) && /^(else\s+)?if\s*\(|^else\b/.test(header) === false) { /* method / class / plain */ }
      // "if (a) x(); else {" style: the header may hold a braceless part; keep simple
      if (cbHead) { const hm = /^(?:else\s+)?(?:if|while|switch)\s*\(/.exec(header); if (hm) { const o = header.indexOf('(', hm[0].length - 1); cbHead(header.slice(o + 1, matchClose(header, o, '(', ')')), stack.slice(), t.curLabels); } }
      const f = { id: fid++, header, labels: t.curLabels || null, curLabels: null, lastIf: null };
      if (/^else\b/.test(header)) f.prevIf = t.lastIf || [];
      stack.push(f); i++; continue;
    }
    if (c === '}') {
      if (top().isCase && stack.length > 2) stack.pop();   // the switch closes: its last case segment ends with it
      const f = stack.length > 1 ? stack.pop() : root; const t = top();
      if (t.isCase && f.header === '' && f.lastTerm) t.ended = true;   // `case X: { ...; break; }`
      if (/^if\s*\(/.test(f.header)) t.lastIf = [f];
      else if (/^else\s+if\b/.test(f.header)) t.lastIf = (f.prevIf || []).concat([f]);
      else t.lastIf = null;
      cur = ''; i++; continue;
    }
    if (c === ';') {
      const s0 = cur.trim(); cur = ''; i++;
      let t = top(); const { labels, rest, arrow } = takeLabels(s0); if (labels) { if (openCase(labels, arrow)) t = top(); else t.curLabels = labels; }
      if (!rest) continue;
      const { s, pseudo } = peel(rest, stack, t.curLabels);
      noteStmt(s, pseudo.length);
      cb(s, stack.concat(pseudo), t.curLabels, pseudo.length ? pseudo[0].labels : t.curLabels);
      continue;
    }
    cur += c; i++;
  }
}

// ---------------------------------------------------------------------------------------------------------------------------------
// constants
function makeEnv() { return { consts: {}, raw: {}, maps: {}, locals: null, unresolved: new Set(), questClasses: {} }; }
const num = (s) => { s = String(s).trim().replace(/_/g, ''); let m;
  if ((m = /^-?0x[0-9a-f]+L?$/i.exec(s))) return parseInt(s.replace(/L$/i, ''), 16);
  if ((m = /^-?\d+(\.\d+)?(?:[eE][-+]?\d+)?[LlDdFf]?$/.exec(s))) return Number(s.replace(/[LlDdFf]$/, ''));
  if ((m = /^-?\.\d+[dDfF]?$/.exec(s))) return Number(s.replace(/[dDfF]$/, ''));
  return null; };
const isDbl = (s) => /^-?\d*\.\d+|[dDfF]$|^-?\d+(\.\d+)?[eE]/.test(String(s).trim().replace(/_/g, ''));
const KNOWN = { 'Inventory.ADENA_ID': 57, 'ADENA_ID': 57, 'Integer.MAX_VALUE': 2147483647, 'Long.MAX_VALUE': 9e18 };

function evalExpr(env, s, depth = 0) {
  if (s == null) return null; s = unparen(stripGenerics(String(s).trim()));
  if (depth > 20) return { raw: s };
  let v = num(s); if (v !== null) return v;
  if (/^"(?:[^"\\]|\\.)*"$/.test(s)) return JSON.parse(s);
  if (/^(true|false)$/.test(s)) return s === 'true';
  if (KNOWN[s] !== undefined) return KNOWN[s];
  let m;
  if ((m = /^[A-Za-z_]\w*$/.exec(s))) { if (env.consts[s] !== undefined) return env.consts[s];
    if (env.raw[s] !== undefined) { const r = env.raw[s]; delete env.raw[s]; env.consts[s] = { raw: s }; const val = evalExpr(env, r, depth + 1); env.consts[s] = val; return val; }
    if (env.locals && env.locals[s] !== undefined) return env.locals[s];
    return { ref: s }; }
  if ((m = /^([A-Z_][\w]*)\.getId\(\)$/.exec(s))) { const h = evalExpr(env, m[1], depth + 1); if (h && h.id !== undefined) return h.id; return { raw: s }; }
  if ((m = /^([A-Z_][\w]*)\.getNpcIds\(\)$/.exec(s))) { const h = evalExpr(env, m[1], depth + 1); if (h && h.droplist) return [...new Set(h.droplist.flatMap(e => e.npcs))]; return { raw: s }; }
  if ((m = /^([A-Z_][\w]*)\.length$/.exec(s))) { const h = evalExpr(env, m[1], depth + 1); if (Array.isArray(h)) return h.length; }
  if ((m = /^([A-Z_][\w]*)\.(keySet|values)\(\)$/.exec(s))) { const h = evalExpr(env, m[1], depth + 1); if (h && h.map) return m[2] === 'keySet' ? h.map.map(e => e[0]) : h.map.map(e => e[1]); return { raw: s }; }
  if ((m = /^([A-Z_][\w]*)\s*\[\s*([^\]]+)\]((?:\s*\[[^\]]+\])*)$/.exec(s))) { let a = evalExpr(env, m[1], depth + 1); const ix = evalExpr(env, m[2], depth + 1);
    if (Array.isArray(a) && typeof ix === 'number') { a = a[ix]; const rest = m[3].match(/\[([^\]]+)\]/g) || []; for (const r of rest) { const k = evalExpr(env, r.slice(1, -1), depth + 1); if (Array.isArray(a) && typeof k === 'number') a = a[k]; else return { raw: s }; } return a; } return { raw: s }; }
  if ((m = /^new\s+[\w.]+\s*(?:\[\s*\]\s*)+\{([\s\S]*)\}$/.exec(s)) || (m = /^\{([\s\S]*)\}$/.exec(s))) return splitTop(m[1]).filter(x => x !== '').map(x => evalExpr(env, x, depth + 1));
  if ((m = /^(?:Arrays\.asList|List\.of|Set\.of|Collections\.unmodifiableList)\s*\(([\s\S]*)\)$/.exec(s))) return splitTop(m[1]).map(x => evalExpr(env, x, depth + 1));
  if ((m = /^Map\.(?:of|ofEntries)\s*\(([\s\S]*)\)$/.exec(s))) { const a = splitTop(m[1]); const map = [];
    if (a.length && /^Map\.entry\(/.test(a[0])) { for (const x of a) { const e = calls(x, 'entry')[0]; if (e) map.push([evalExpr(env, e.args[0], depth + 1), evalExpr(env, e.args[1], depth + 1)]); } }
    else for (let k = 0; k + 1 < a.length; k += 2) map.push([evalExpr(env, a[k], depth + 1), evalExpr(env, a[k + 1], depth + 1)]);
    return { map }; }
  if (/^new\s+(Hash|Concurrent|Linked|Tree|Enum)?Map\s*\(/.test(s) || /^new\s+\w*Map\b/.test(s)) return { map: [] };
  if (/^new\s+(Array|Linked)?List\s*\(|^new\s+\w*(List|Set)\s*\(/.test(s)) return [];
  if (/^QuestDroplist\.builder\(\)/.test(s)) return parseDroplist(env, s);
  if ((m = /^(?:QuestDroplist\.)?groupedDropItem\(([\s\S]*)\)$/.exec(s))) { const a = splitTop(m[1]); return { _t: 'group', chance: evalExpr(env, a[0], depth + 1), items: a.slice(1).map(x => { const v = evalExpr(env, x, depth + 1); return v && v.id !== undefined ? v.id : v; }) }; }
  if ((m = /^(?:QuestDroplist\.)?singleDropItem\(([\s\S]*)\)$/.exec(s))) { const a = splitTop(m[1]); const it = evalExpr(env, a[0], depth + 1); const h = Object.assign({ _t: 'qchance', chance: 100, count: 1, limit: 0 }, it && typeof it === 'object' ? it : { id: it }); if (a[1] !== undefined) { if (isDbl(a[1])) h.chance = evalExpr(env, a[1], depth + 1); else h.count = evalExpr(env, a[1], depth + 1); } return h; }
  if ((m = /^new\s+([\w.]+)\s*\(([\s\S]*)\)$/.exec(s)) && matchClose(s, s.indexOf('('), '(', ')') === s.length - 1) {
    const cls = m[1].split('.').pop(); const rawArgs = splitTop(m[2]); const a = rawArgs.map(x => evalExpr(env, x, depth + 1));
    if (cls === 'ItemHolder') return { _t: 'item', id: a[0], count: a[1] };
    if (cls === 'ItemChanceHolder') return { _t: 'chance', id: a[0], chance: a[1], count: a.length > 2 ? a[2] : 1 };
    if (cls === 'QuestItemChanceHolder') { const h = { _t: 'qchance', id: a[0], chance: 100, count: 1, limit: 0 };
      if (a.length === 2) { if (isDbl(rawArgs[1])) h.chance = a[1]; else h.limit = a[1]; }
      else if (a.length === 3) { if (isDbl(rawArgs[1])) { h.chance = a[1]; h.limit = a[2]; } else { h.count = a[1]; h.limit = a[2]; } }
      else if (a.length >= 4) { h.chance = a[1]; h.count = a[2]; h.limit = a[3]; }
      return h; }
    if (cls === 'Location') return { _t: 'loc', x: a[0], y: a[1], z: a[2] };
    if (cls === 'SkillHolder') return { _t: 'skill', id: a[0], lvl: a[1] };
    return { _t: 'obj', cls, args: a };
  }
  if ((m = /^ClassId\.(\w+)(?:\.getId\(\))?$/.exec(s))) return { cls: m[1] };
  if ((m = /^(Race|CategoryType|QuestType|State|NpcStringId|Sound|ClassId)\.(\w+)$/.exec(s))) return { enum: m[1], v: m[2] };
  // arithmetic over constants
  const sub = s.replace(/\b[A-Z_][A-Z0-9_]*\b/g, (k) => { const val = evalExpr(env, k, depth + 1); return typeof val === 'number' ? String(val) : k; }).replace(/(\d)_(\d)/g, '$1$2').replace(/(\d)[LlDdFf]\b/g, '$1');
  if (/^[\d\s+\-*\/().%]+$/.test(sub) && /\d/.test(sub)) { try { const r = Function('"use strict";return (' + sub + ')')(); if (typeof r === 'number' && isFinite(r)) return r; } catch (e) { } }
  return { raw: s };
}
// QuestDroplist.builder()...build()
function parseDroplist(env, s) {
  const out = []; const re = /\.(\w+)\s*\(/g; let m; let pend = null;
  const itemOf = (x) => { const v = evalExpr(env, x); if (v && typeof v === 'object' && v.id !== undefined) return v; return { id: v, chance: 100, count: 1, limit: 0 }; };
  const close = () => { if (pend) { out.push(...pend.out()); pend = null; } };
  while ((m = re.exec(s))) {
    const o = m.index + m[0].length - 1, e = matchClose(s, o, '(', ')'); const a = splitTop(s.slice(o + 1, e)); re.lastIndex = e + 1;
    const name = m[1];
    if (name === 'addSingleDrop') { close(); const it = itemOf(a[1]); const d = { npcs: [evalExpr(env, a[0])], item: it.id, chance: it.chance, amount: [it.count || 1, it.count || 1], limit: it.limit || 0, req: [] };
      if (a.length === 3) { if (isDbl(a[2])) d.chance = evalExpr(env, a[2]); else { const n = evalExpr(env, a[2]); d.amount = [n, n]; } }
      if (a.length === 4) { const n = evalExpr(env, a[2]); d.amount = [n, n]; d.chance = evalExpr(env, a[3]); }
      if (a.length === 5) { d.amount = [evalExpr(env, a[2]), evalExpr(env, a[3])]; d.chance = evalExpr(env, a[4]); }
      out.push(d); pend = null; out._last = d; }
    else if (name === 'bulkAddSingleDrop') { close(); const it = itemOf(a[0]); const d = { npcs: [], item: it.id, chance: a.length > 1 ? evalExpr(env, a[1]) : it.chance, amount: [it.count || 1, it.count || 1], limit: it.limit || 0, req: [] };
      pend = { d, out: () => [d] }; out._last = d; }
    else if (name === 'withNpcs' && pend) { pend.d.npcs = a.flatMap(x => { const v = evalExpr(env, x); return Array.isArray(v) ? v : [v]; }); }
    else if (name === 'withRequiredItems') { const tgt = pend ? (pend.d || null) : out._last; const ids = a.map(x => { const v = evalExpr(env, x); return v && v.id !== undefined ? v.id : v; });
      if (pend && pend.group) pend.group.req = ids; else if (tgt) tgt.req = ids; }
    else if (name === 'addGroupedDrop') { close(); const g = { npc: evalExpr(env, a[0]), chance: evalExpr(env, a[1]), items: [], req: [] };
      pend = { group: g, out: () => g.items.map(it => ({ npcs: [g.npc], item: it.id, chance: Math.round(g.chance * it.c) / 100, amount: [it.count || 1, it.count || 1], limit: it.limit || 0, req: g.req, group: true })) }; }
    else if (name === 'withDropItem' && pend && pend.group) { const it = itemOf(a[0]); pend.group.items.push(Object.assign({}, it, { c: evalExpr(env, a[1]) })); }
    else if (name === 'addGroupedDropForSingleItem') { close(); const it = itemOf(a[1]); const d = { npcs: [evalExpr(env, a[0])], item: it.id, chance: evalExpr(env, a[2]), amount: [1, 1], limit: it.limit || 0, req: [], amounts: [] };
      pend = { d, out: () => [d] }; out._last = d; }
    else if (name === 'withAmount' && pend && pend.d) { pend.d.amounts.push([evalExpr(env, a[0]), evalExpr(env, a[1])]); }
    else if (name === 'orElse' && pend && pend.d) { pend.d.amounts.push([evalExpr(env, a[0]), null]);
      const ns = pend.d.amounts.map(x => x[0]).filter(x => typeof x === 'number'); if (ns.length) pend.d.amount = [Math.min(...ns), Math.max(...ns)]; }
    else if (name === 'build') { close(); }
  }
  close(); delete out._last;
  return { droplist: out };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// one quest
const METHOD_TYPE = { onTalk: 'talk', onAdvEvent: 'event', onEvent: 'event', onKill: 'kill', onAttack: 'attack', onSkillSee: 'skill', onSpawn: 'spawn',
  onFirstTalk: 'firstTalk', onItemTalk: 'item', onAggroRangeEnter: 'aggro', onSeeCreature: 'see', onEnterZone: 'zone', onExitZone: 'zone',
  onEventReceived: 'other', onMoveFinished: 'other', onOlympiadMatchFinish: 'olympiad', onRouteFinished: 'other', onDeath: 'other' };
const CTRL = /^(if|else|switch|for|while|do|try|catch|finally|synchronized|static|return|new)\b/;
function methodNameOf(header) {
  if (!header || CTRL.test(header)) return null;
  const m = /(\w+)\s*\([^()]*(?:\([^()]*\)[^()]*)*\)\s*(?:throws\s+[\w\s,.]+)?$/.exec(header);
  if (!m || /^(if|for|while|switch|catch|synchronized)$/.test(m[1])) return null;
  if (!/\b(public|private|protected|static|void|String|boolean|int|long|final|L2\w+|Quest\w*|\w+)\s+\w+\s*\(/.test(header) && !/^\w+\s*\(/.test(header)) return null;
  return m[1];
}

function parseQuest(src, meta) {
  const env = makeEnv();
  src = stripComments(src);
  const facts = []; const frameInfo = new globalThis.Map();
  // pass 1: class level constants + static blocks
  walk(src, (s, frames) => {
    const depthClass = frames.filter(f => /\bclass\b|\binterface\b|\benum\b/.test(f.header)).length;
    const inMethod = frames.some(f => methodNameOf(f.header) && !/^static$/.test(f.header));
    const inStatic = frames.some(f => f.header === 'static');
    if (depthClass && !inMethod && !inStatic) {
      const m = /^(?:(?:public|private|protected|static|final|volatile|transient)\s+)*([\w.<>\[\], ?]+?)\s+([A-Za-z_]\w*)\s*=\s*([\s\S]+)$/.exec(s);
      if (m && /\b(static|final)\b/.test(s.slice(0, s.indexOf(m[2])))) env.raw[m[2]] = m[3];
      else if (m && /^[A-Z_][A-Z0-9_]*$/.test(m[2])) env.raw[m[2]] = m[3];
    }
  });
  { let m; const r1 = /\bint\s*\[\s*\]\s+(\w+)\s*=\s*(\{[^{}]*\})/g; while ((m = r1.exec(src))) if (env.raw[m[1]] === undefined) env.raw[m[1]] = m[2];
    const r2 = /for\s*\(\s*int\s+(\w+)\s*=\s*(\d+)\s*;\s*\1\s*(<=?)\s*(\d+)\s*;\s*\1\+\+\s*\)/g; while ((m = r2.exec(src))) if (env.raw[m[1]] === undefined) { const a = +m[2], b = +m[4] + (m[3] === '<=' ? 1 : 0); if (b - a > 0 && b - a < 200) env.raw[m[1]] = '{' + Array.from({ length: b - a }, (_, i) => a + i).join(',') + '}'; } }
  for (const k of Object.keys(env.raw)) if (env.raw[k] !== undefined) evalExpr(env, k);
  // static blocks / constructors: map puts, list adds, array element sets
  walk(src, (s, frames) => {
    const inMethod = frames.some(f => methodNameOf(f.header));
    if (inMethod && !frames.some(f => f.header === 'static' || /^(public|protected|private)?\s*Q\d+\w*\s*\(/.test(f.header))) return;
    let m;
    if ((m = /^([A-Z_][A-Z0-9_]*)\.put\s*\(([\s\S]*)\)$/.exec(s))) { const t = env.consts[m[1]]; const a = splitTop(m[2]);
      if (t && t.map && a.length >= 2) t.map.push([evalExpr(env, a[0]), evalExpr(env, a.slice(1).join(','))]); }
    else if ((m = /^([A-Z_][A-Z0-9_]*)\.add\s*\(([\s\S]*)\)$/.exec(s))) { const t = env.consts[m[1]]; if (Array.isArray(t)) t.push(evalExpr(env, m[2])); }
  });
  // pass 2: facts
  const helperNames = new Set(); { const re = /(?:private|protected|public|static|final|synchronized|\s)+[\w<>\[\],.]+\s+(\w+)\s*\([^()]*\)\s*(?:throws[\w\s,.]+)?\{/g; let m; while ((m = re.exec(src))) if (!/^(on[A-Z]\w*|if|for|while|switch|catch|main)$/.test(m[1]) && !/^Q\d/.test(m[1])) helperNames.add(m[1]); }
  const scoped = {};
  const onStmt = (s, frames, labels, head) => {
    const ctxFrames = frames.slice(1);
    let mi = -1; for (let k = ctxFrames.length - 1; k >= 0; k--) if (methodNameOf(ctxFrames[k].header)) { mi = k; break; }
    const method = mi >= 0 ? methodNameOf(ctxFrames[mi].header) : null;
    if (!method) return;
    const inner = ctxFrames.slice(mi);
    // per-method local variables
    const mkey = ctxFrames[mi].id; if (!frameInfo.has(mkey)) frameInfo.set(mkey, { locals: {}, name: method });
    const loc = frameInfo.get(mkey).locals;
    let m;
    const sc = /getRandomPartyMemberState\(\s*\w+\s*,\s*(-?\d+)\s*,/.exec(s) || /getRandomPartyMember\(\s*\w+\s*,\s*(\d+)\s*\)/.exec(s) || /getRandomPartyMember\(\s*\w+\s*,\s*"cond"\s*,\s*"(\d+)"\s*\)/.exec(s);
    if (sc && +sc[1] > 0) scoped[ctxFrames[ctxFrames.length - 1].id] = [+sc[1]];
    // random locals are SCOPED (2026-10-27): Q330 declares `final int i0 = getRandom(100)` and `getRandom(10)` in different case blocks of
    // one method; a method-wide binding gave 700 / -820 "percent". Each binding lives in its frame; a fact sees the nearest one on its path.
    const fi = frameInfo.get(mkey); fi.rands = fi.rands || [];
    let rm; if (!head && (rm = /^(?:final\s+)?(?:int|long|double|var)\s+(\w+)\s*=\s*getRandom\(\s*([\w.]+)\s*\)$/.exec(s))) { const N = evalExpr(env, rm[2]); if (typeof N === 'number') fi.rands.push({ name: rm[1], N, frame: ctxFrames[ctxFrames.length - 1].id }); }
    else if (!head && (m = /^(?:final\s+)?(?:long|int|var)\s+(\w+)\s*=\s*([\s\S]+)$/.exec(s))) {
      const rhs = m[2]; const c = calls(rhs, 'getQuestItemsCount')[0];
      if (c && unparen(rhs).startsWith(rhs.slice(c.at).trim().slice(0, 5)) && c.end >= rhs.trim().length - 2) { const ids = c.args.map(a => evalExpr(env, a)).filter(v => typeof v === 'number' && v > 50 || (v && v.id)); loc[m[1]] = { items: ids.map(v => v.id || v) }; }
      else { const v = evalExpr(env, rhs); if (typeof v === 'number') loc[m[1]] = v; else loc[m[1]] = { expr: rhs }; }
    }
    const lab = labels;
    const ctx = inner.map((f, k) => ({ header: f.header, labels: f.labels, prevIf: f.prevIf, id: f.id }));
    // labels of the innermost switch for this statement
    const path = inner.map(f => f.id);
    let sco = null; for (let k = path.length - 1; k >= 0 && !sco; k--) if (scoped[path[k]]) sco = scoped[path[k]];
    let factLoc = loc;
    if (fi.rands.length) { const vis = {}; for (const r of fi.rands) if (path.includes(r.frame)) vis[r.name] = { rand: r.N }; if (Object.keys(vis).length) factLoc = Object.assign({}, loc, vis); }
    const callFacts = []; for (const h of helperNames) if (s.indexOf(h) >= 0 && new RegExp('(^|[^.\\w])' + h + '\\s*\\(').test(s)) callFacts.push({ t: 'call', name: h });
    if (/executeForEachPlayer\s*\(/.test(s) && helperNames.has('actionForEachPlayer')) callFacts.push({ t: 'call', name: 'actionForEachPlayer' });
    for (const fact of factsOf(env, s, loc).concat(callFacts)) { if (head && !/^(drop|give|take|adena|exp|spawn|count|timer|call)$/.test(fact.t)) continue; fact.method = method; fact.path = path; fact.ctx = ctx; fact.stmtLabels = lab; fact.loc = factLoc; if (sco) fact.scoped = sco; if (head) fact.inHeader = true; fact.stmt = s.length > 240 ? s.slice(0, 240) + "…" : s; if (fact.t === "html") fact.full = s; facts.push(fact); }
  };
  walk(src, (s, frames, labels) => onStmt(s, frames, labels, false), (s, frames, labels) => onStmt(s, frames, labels, true));
  // inline helper methods at their call sites (two rounds: helpers calling helpers)
  for (let round = 0; round < 3; round++) {
    const calls_ = facts.filter(f => f.t === 'call' && !f.done && f.method !== f.name);
    if (!calls_.length) break;
    for (const c of calls_) { c.done = true;
      const hf = facts.filter(f => f.method === c.name && f !== c && !(f.t === 'call' && f.name === c.method));
      if (facts.length > 30000) { env.unresolved.add('helper inlining stopped (too many facts)'); break; }
      for (const f of hf) { if (f.t === 'call' && ((f.via || '').split('<').includes(f.name) || f.name === c.name)) continue; const pseudo = { header: '', labels: c.stmtLabels, prevIf: null, id: -1 - facts.length };
        facts.push(Object.assign({}, f, { method: c.method, via: (f.via ? f.via + '<' : '') + c.name, path: c.path.concat([pseudo.id], f.path.slice(1)), ctx: c.ctx.concat([pseudo], f.ctx.slice(1)), scoped: f.scoped || c.scoped, done: false })); }
    }
  }
  const inlined = new Set(facts.filter(f => f.t === 'call' && f.done).map(f => f.name));
  for (let i = facts.length - 1; i >= 0; i--) if (inlined.has(facts[i].method) || facts[i].t === 'call') facts.splice(i, 1);
  return { env, facts, src };
}

// facts from one statement
function idsOf(env, x) { const v = evalExpr(env, x); if (Array.isArray(v)) return v.flatMap(e => (e && e.id !== undefined) ? [e.id] : [e]); if (v && v.map) return v.map.map(e => e[0]); if (v && v.id !== undefined) return [v.id]; return [v]; }
let LOC = null;
function itemArg(env, x, loc) {
  loc = loc || LOC; x = String(x).trim();
  if (loc && /^[a-z]\w*$/.test(x) && loc[x] && loc[x].expr) x = String(loc[x].expr).trim();
  const m = /^([A-Z_]\w*)\.get\(\s*(?:npc\.getId\(\)|npcId|npc\.getTemplate\(\)\.getId\(\))\s*\)(?:\[(\d+)\]|\.(\w+)\(\))?$/.exec(x);
  if (m) { const map = evalExpr(env, m[1]); if (map && map.map) { const by = {};
    for (const [k, v] of map.map) { let val = v; if (m[2] !== undefined && Array.isArray(v)) val = v[+m[2]]; else if (m[3] && v && typeof v === 'object') val = v.id !== undefined ? v.id : (v.args ? v.args[0] : null);
      if (val && typeof val === 'object' && val.id !== undefined) val = val.id; if (Array.isArray(val)) val = val[0]; if (typeof val === 'number' && typeof k === 'number') by[k] = val; }
    if (Object.keys(by).length) return { byNpc: by }; } }
  const v = evalExpr(env, x); if (v && typeof v === 'object' && (v.id !== undefined || v._t === 'group')) return v; return { id: v };
}
const playerish = (s) => /\b(player|pc|talker|killer|attacker|caster|partyMember|member|leader|activeChar|pl|p|character|winner|target|qs\.getPlayer\(\)|st\.getPlayer\(\)|getPlayer\(\)|\w*[Pp]layer\w*|\w*[Mm]ember\w*|c)\b/.test(s) && !/^[A-Z_\d]/.test(s.trim());
function factsOf(env, s, loc) {
  const out = []; let m; LOC = loc;
  for (const c of calls(s, 'startQuest')) out.push({ t: 'start' });
  for (const c of calls(s, 'setCond')) { const v = evalExpr(env, c.args[0]); out.push({ t: 'cond', v: typeof v === 'number' ? v : null, raw: typeof v === 'number' ? null : c.args[0] }); }
  for (const c of calls(s, 'setMemoState')) { const v = evalExpr(env, c.args[0]); out.push({ t: 'memo', v: typeof v === 'number' ? v : null, raw: typeof v === 'number' ? null : c.args[0] }); }
  for (const c of calls(s, 'exitQuest')) { const a = (c.args[0] || '').trim(); let type = null;
    if (/^true$|REPEATABLE/.test(a)) type = 'repeatable'; else if (/^false$|ONE_TIME/.test(a)) type = 'one-time'; else if (/DAILY/.test(a)) type = 'daily';
    out.push({ t: 'exit', type, raw: a }); }
  for (const name of ['giveItems', 'rewardItems']) for (const c of calls(s, name)) {
    let a = c.args.slice(); if (!c.qualified || /player|getPlayer/.test(c.qual)) { if (!c.qualified) a = a.slice(1); }
    if (!a.length) continue;
    const it = itemArg(env, a[0]); let count = a.length > 1 ? evalExpr(env, a[1]) : (it.count !== undefined ? it.count : 1);
    if (a.length === 1 && it.count !== undefined) count = it.count;
    if (it.byNpc) { out.push({ t: 'give', itemByNpc: it.byNpc, count: typeof count === 'number' ? count : 1, fn: name }); continue; }
    if (it.id === 57) out.push({ t: 'adena', v: typeof count === 'number' ? count : adenaFormula(env, a[1] || '', loc) });
    else out.push({ t: 'give', item: it.id, count: typeof count === 'number' ? count : (a[1] ? { raw: a[1] } : 1), fn: name });
  }
  for (const c of calls(s, 'giveItemRandomly')) {
    let a = c.args.slice(); if (!c.qualified) a = a.slice(1); // drop player
    a = a.slice(1); // drop npc
    const f = { t: 'drop', src: 'script' };
    const first = a[0] || '';
    if ((m = /^([A-Z_]\w*)\.get\(\s*npc(?:\s*,\s*([\w.()]+))?\s*\)(?:\.drop\(\))?$/.exec(first))) { f.src = 'droplist'; f.list = m[1]; if (m[2]) { const v = evalExpr(env, m[2]); f.item = v && v.id !== undefined ? v.id : v; } }
    else if ((m = /^singleDropItem\(([\s\S]*)\)$/.exec(first))) { const sa = splitTop(m[1]); const it = itemArg(env, sa[0]); f.item = it.id; f.chance = it.chance !== undefined ? it.chance : 100; f.limit = it.limit || 0; f.amount = it.count || 1;
      if (sa[1] !== undefined) { if (isDbl(sa[1])) f.chance = evalExpr(env, sa[1]); else f.amount = evalExpr(env, sa[1]); }
      if (a.length >= 3) { const l = evalExpr(env, a[1]); if (typeof l === 'number') f.limit = l; else if (/getLimit/.test(a[1])) { /* holder limit */ } } }
    else if (a.length >= 5) { const it = itemArg(env, first); f.item = it.id; f.amount = evalExpr(env, a[1]); f.limit = evalExpr(env, a[2]); const ch = evalExpr(env, a[3]); f.chance = typeof ch === 'number' ? Math.round(ch * 100 * 1000) / 1000 : { raw: a[3] }; }
    else if (itemArg(env, first)._t === 'group') { const g = itemArg(env, first); f.groupItems = g.items; f.chance = g.chance; f.amount = 1; }
    else if (itemArg(env, first).byNpc) { f.itemByNpc = itemArg(env, first).byNpc; f.chance = 100; }
    else { const it = itemArg(env, first); f.item = it.id; f.chance = it.chance !== undefined ? it.chance : null; f.limit = it.limit || 0; f.amount = it.count || 1; if (it.chance === undefined && (it.id === undefined || typeof it.id !== 'number')) f.chance = { raw: first };
      if (a.length >= 3) { const l = evalExpr(env, a[1]); if (typeof l === 'number') f.limit = l; } }
    out.push(f);
  }
  for (const c of calls(s, 'takeItems')) { let a = c.args.slice(); if (!c.qualified) a = a.slice(1);
    if (!a.length) continue;
    const a0 = evalExpr(env, a[0]);
    if (a.length >= 3 || (a.length === 2 && a0 === -1)) { const cnt = evalExpr(env, a[0]); for (const x of a.slice(1)) for (const id of idsOf(env, x)) out.push({ t: 'take', item: id, count: cnt }); }
    else { const it = itemArg(env, a[0]); const cnt = a.length > 1 ? evalExpr(env, a[1]) : (it.count !== undefined ? it.count : -1); if (Array.isArray(a0)) { for (const id of idsOf(env, a[0])) out.push({ t: 'take', item: id, count: cnt }); } else out.push({ t: 'take', item: it.id, count: typeof cnt === 'number' ? cnt : { raw: a[1] } }); }
  }
  for (const c of calls(s, 'takeItem')) { const a = c.args.slice(c.qualified ? 0 : 1); if (!a.length) continue; const it = itemArg(env, a[0]); out.push({ t: 'take', item: it.id, count: it.count !== undefined ? it.count : -1 }); }
  for (const c of calls(s, 'takeAllItems')) { const a = c.args.slice(c.qualified ? 0 : 1); for (const x of a) for (const id of idsOf(env, x)) out.push({ t: 'take', item: id, count: -1 }); }
  for (const c of calls(s, 'giveAdena')) { const a = c.args.slice(c.qualified ? 0 : 1); const v = evalExpr(env, a[0]); out.push({ t: 'adena', v: typeof v === 'number' ? v : adenaFormula(env, a[0] || '', loc) }); }
  for (const c of calls(s, 'addExpAndSp')) { const a = c.args.slice(c.qualified ? 0 : 1); const e = evalExpr(env, a[0]), p = evalExpr(env, a[1]);
    out.push({ t: 'exp', exp: typeof e === 'number' ? e : { raw: a[0] }, sp: typeof p === 'number' ? p : { raw: a[1] } }); }
  for (const c of calls(s, 'addSpawn')) { if (c.qualified && !/^(super|this)$/.test(c.qual)) continue; const a = c.args; let at = null; const ids = idsOf(env, a[0]);
    const nums = a.slice(1).map(x => evalExpr(env, x));
    if (a[1] !== undefined) { const v = nums[0];
      if (v && v._t === 'loc') at = { x: v.x, y: v.y, z: v.z };
      else if (typeof v === 'number' && typeof nums[1] === 'number' && typeof nums[2] === 'number') at = { x: v, y: nums[1], z: nums[2] };
      else if (/^npc\b/.test(a[1].trim())) at = 'npc';
      else if (/player|getPlayer|talker|killer|getLocation|pc\b/.test(a[1])) at = 'player';
      else if (Array.isArray(v) && v.length && v[0] && v[0]._t === 'loc') at = { x: v[0].x, y: v[0].y, z: v[0].z, more: v.length - 1 };
      else at = { raw: a[1] }; }
    const desp = a.map(x => evalExpr(env, x)).filter(x => typeof x === 'number' && x >= 1000 && x <= 36000000).pop();
    for (const id of ids) out.push({ t: 'spawn', npc: typeof id === 'number' ? id : null, raw: typeof id === 'number' ? null : a[0], at, despawnMs: desp || null }); }
  for (const c of calls(s, 'startQuestTimer')) { const n = evalExpr(env, c.args[0]); const ms = evalExpr(env, c.args[1]); out.push({ t: 'timer', name: typeof n === 'string' ? n : c.args[0], ms: typeof ms === 'number' ? ms : null }); }
  // item count checks
  for (const c of calls(s, 'getQuestItemsCount')) { const tail = s.slice(c.end + 1); const mm = /^\s*(>=|==|>|<=|<)\s*([\w.]+)/.exec(tail); if (!mm) continue; const n = evalExpr(env, mm[2]); if (typeof n !== 'number') continue;
    const ids = c.args.map(x => evalExpr(env, x)).map(v => v && v.id !== undefined ? v.id : v).filter(v => typeof v === 'number' && v > 50);
    for (const id of ids) out.push({ t: 'count', item: id, op: mm[1], n }); }
  for (const c of calls(s, 'hasItemsAtLimit')) for (const x of c.args.slice(1)) { const v = evalExpr(env, x); if (v && v.id) out.push({ t: 'count', item: v.id, op: '>=', n: v.limit || null }); }
  // htmls
  const htm = s.match(/"[\w.-]+\.html?"/g); if (htm) for (const h of new Set(htm)) out.push({ t: 'html', file: h.slice(1, -1) });
  return out;
}
// adena / count formula
function adenaFormula(env, expr, loc) {
  expr = String(expr).trim(); const out = { raw: expr };
  let e = expr.replace(/(?:st|qs)\.getQuestItemsCount\(([^()]*)\)|getQuestItemsCount\(\s*[\w.()]+\s*,([^()]*)\)/g, (m0, a1, a2) => { const ids = splitTop(a1 || a2).map(x => evalExpr(env, x)).map(v => v && v.id !== undefined ? v.id : v).filter(v => typeof v === 'number'); return '@[' + ids.join('+') + ']'; });
  const varItems = (v) => { const L = loc && loc[v]; return L && L.items ? L.items : null; };
  const per = []; let mm; const re = /(@\[[\d+]*\]|\b[a-z]\w*\b|\b[A-Z_][A-Z0-9_]*\b|\d[\d_]*)\s*\*\s*(@\[[\d+]*\]|\b[a-z]\w*\b|\b[A-Z_][A-Z0-9_]*\b|\d[\d_]*)/g;
  while ((mm = re.exec(e))) { const side = (x) => x.startsWith('@[') ? { items: x.slice(2, -1).split('+').filter(Boolean).map(Number) } : (varItems(x) ? { items: varItems(x) } : (typeof evalExpr(env, x) === 'number' ? { n: evalExpr(env, x) } : null));
    const A = side(mm[1]), B = side(mm[2]); const it = (A && A.items) ? A : (B && B.items ? B : null); const n = (A && A.n !== undefined) ? A.n : (B && B.n !== undefined ? B.n : null);
    if (it && n !== null) per.push({ items: it.items, each: n }); }
  if (per.length) out.perItem = per;
  if ((mm = />=?\s*([\w]+)\s*\)?\s*\?\s*\(?\s*([\w]+)\s*\)?\s*:\s*0/.exec(e))) { const a = evalExpr(env, mm[1]), b = evalExpr(env, mm[2]); if (typeof a === 'number' && typeof b === 'number') out.bonus = { min: a, adena: b }; }
  if ((mm = /getRandom\((\d+)\)\s*\+\s*([\d_]+)/.exec(e))) { const a = +mm[1], b = +mm[2].replace(/_/g, ''); out.range = [b, b + a - 1]; }
  if ((mm = /\+\s*([\d_]+)\s*\)*\s*$/.exec(e)) && !out.range) out.base = +mm[1].replace(/_/g, '');
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// context interpretation
const condAtoms = (c) => { c = unparen(c); if (splitTop(c, '||').length > 1) return { or: splitTop(c, '||').map(unparen) }; return { and: splitTop(c, '&&').map(unparen) }; };
function readAtom(env, a, R, neg) {
  let m; const resolve = (x) => { if (R.bind && R.bind[x]) return R.bind[x]; const v = evalExpr(env, x); return v && v.id !== undefined ? v.id : v; };
  if (/^!/.test(a)) { neg = !neg; a = unparen(a.slice(1)); }
  if ((m = /^(?:"([^"]*)"|([A-Z_]\w*))\.equals(?:IgnoreCase)?\(\s*event\s*\)$/.exec(a)) || (m = /^event\.equals(?:IgnoreCase)?\(\s*(?:"([^"]*)"|([A-Z_]\w*))\s*\)$/.exec(a))) { if (!neg) R.events.add(m[1] !== undefined ? m[1] : resolve(m[2])); return; }
  if ((m = /^event\.startsWith\(\s*"([^"]*)"\s*\)$/.exec(a))) { if (!neg) R.events.add(m[1] + '*'); return; }
  if ((m = /^(?:npc\.getId\(\)|npcId|npc_id|npcid)\s*==\s*([\w.\[\]]+)$/.exec(a)) || (m = /^([\w.\[\]]+)\s*==\s*(?:npc\.getId\(\)|npcId)$/.exec(a))) { if (!neg) { const v = resolve(m[1]); if (typeof v === 'number') R.npcs.add(v); else if (Array.isArray(v)) v.forEach(x => typeof x === 'number' && R.npcs.add(x)); } return; }
  if ((m = /contains\(\s*([A-Z_]\w*)\s*,\s*(?:npc\.getId\(\)|npcId)\s*\)/.exec(a)) || (m = /^([A-Z_]\w*)\.contains(?:Key)?\(\s*(?:npc\.getId\(\)|npcId)\s*\)$/.exec(a))) { if (!neg) for (const v of idsOf(env, m[1])) if (typeof v === 'number') R.npcs.add(v); return; }
  if ((m = /isCond\(\s*(\d+)\s*\)/.exec(a)) || (m = /(?:getCond\(\)|\bcond)\s*==\s*(\d+)/.exec(a))) { if (!neg) R.conds.add(+m[1]); return; }
  if ((m = /(?:getCond\(\)|\bcond)\s*(>=|>|<=|<)\s*(\d+)/.exec(a))) { if (!neg) R.condRanges.push(m[1] + m[2]); return; }
  if ((m = /isMemoState\(\s*(\d+)\s*\)/.exec(a)) || (m = /(?:getMemoState\(\)|\bmemoState|\bmemo)\s*==\s*(\d+)/.exec(a))) { if (!neg) R.memos.add(+m[1]); return; }
  if ((m = /is(Created|Started|Completed)\(\)/.exec(a))) { if (!neg) R.states.add(m[1].toUpperCase()); return; }
  if ((m = /getState\(\)\s*==\s*State\.(\w+)/.exec(a))) { if (!neg) R.states.add(m[1]); return; }
  if ((m = /^(\w+)\s*(<|<=)\s*([\w.]+)$/.exec(a)) && R.loc && R.loc[m[1]] && R.loc[m[1]].rand) { const N = R.loc[m[1]].rand; const X = evalExpr(env, m[3]); if (typeof X !== 'number') return; const hi = X + (m[2] === '<=' ? 1 : 0);
    if (neg) { R.randLow[m[1]] = Math.max(R.randLow[m[1]] || 0, hi); return; } R.chance = Math.round((hi - (R.randLow[m[1]] || 0)) / N * 100 * 1000) / 1000; R.randVar = true; return; }
  if ((m = /getQuestItemsCount\(([^()]*)\)\s*(>=|==|>)\s*([\w.]+)/.exec(a)) && !neg) { const n = evalExpr(env, m[3]); const ids = splitTop(m[1]).map(x => evalExpr(env, x)).map(v => v && v.id !== undefined ? v.id : v).filter(v => typeof v === 'number' && v > 50); if (typeof n === 'number') for (const i of ids) R.itemCounts.push({ id: i, n: n + (m[2] === '>' ? 1 : 0) }); return; }
  // RANDOM CHANCES (2026-10-27): getRandom(N) < | <= | == X, X > | >= getRandom(N), per-mille (N = 1000) and other bases, X a constant, a map
  // by npc id, or an array indexed by npc id (CHANCES[npc.getId() - FIRST]); `<=` counts X itself (X + 1 of N). Results are always percent.
  const pct = (hits, N) => Math.round(hits / N * 100 * 1000) / 1000;
  let rv = /getRandom\(\s*([\w.]+)\s*\)\s*(<=|<|==)\s*([\s\S]+)$/.exec(a);
  if (!rv) { const r2 = /^([\s\S]+?)\s*(>=|>|==)\s*getRandom\(\s*([\w.]+)\s*\)$/.exec(a); if (r2) rv = [r2[0], r2[3], r2[2] === '>=' ? '<=' : r2[2] === '==' ? '==' : '<', r2[1]]; }
  if ((m = rv)) {
    const N = evalExpr(env, m[1]); const X = unparen(m[3].trim());
    const xv = evalExpr(env, X), plus = m[2] === '<=' ? 1 : 0;
    const hitsOf = (x) => m[2] === '==' ? ((typeof x === 'number' && x >= 0 && x < N) ? 1 : 0) : Math.max(0, Math.min(N, x + plus));
    if (neg && typeof N === 'number' && N > 0 && typeof xv === 'number') { R.negChance = pct(hitsOf(xv), N); return; }
    const byNpc = (t) => { if (neg) R.negChanceByNpc = t; else R.chanceByNpc = t; };   // else-branch of a per-npc roll = 100 - chance
    if (typeof N === 'number' && N > 0 && typeof xv === 'number') { R.chance = pct(hitsOf(xv), N); return; }
    let mm;
    if ((mm = /^([A-Z_]\w*)\.get\(\s*(?:npc\.getId\(\)|npcId)\s*\)(?:\[(\d+)\]|\.(\w+)\(\))?$/.exec(X)) && typeof N === 'number') { const map = evalExpr(env, mm[1]); if (map && map.map && map.map.length) { const t = {};
      for (const [k, v] of map.map) { let val = v; if (mm[2] !== undefined && Array.isArray(v)) val = v[+mm[2]]; if (mm[3] && v && typeof v === 'object') val = /chance/i.test(mm[3]) ? v.chance : v[mm[3]]; if (typeof val === 'number') t[k] = pct(hitsOf(val), N); }
      byNpc(t); return; } }
    if ((mm = /^([A-Z_]\w*)\s*\[\s*(?:npc\.getId\(\)|npcId)\s*-\s*([\w.]+)\s*\]$/.exec(X)) && typeof N === 'number') { const arr = evalExpr(env, mm[1]), base = evalExpr(env, mm[2]);
      if (Array.isArray(arr) && typeof base === 'number') { const t = {}; arr.forEach((v, i) => { if (typeof v === 'number') t[base + i] = pct(hitsOf(v), N); }); byNpc(t); return; } }
    if (!neg) R.chanceRaw = a;
    return; }
  if (/getRandomBoolean\(\)/.test(a)) { if (!neg) R.chance = 50; else R.negChance = 50; return; }
  if ((m = /getLevel\(\)\s*(>=|>|<=|<|==)\s*([\w.]+)/.exec(a))) { const v = evalExpr(env, m[2]); R.level.push({ op: m[1], v, name: m[2], neg }); return; }
  if ((m = /(?:hasQuestItems|hasItem|hasAtLeastOneQuestItem|hasAllItems)\(([^()]*(?:\([^()]*\))?[^()]*)\)/.exec(a))) { const ids = splitTop(m[1]).slice(1).map(resolve).flat().filter(v => typeof v === 'number' && v > 50); (neg ? R.notItems : R.items).push(...ids); return; }
  R.raw.push((neg ? '!' : '') + a);
}
function interp(env, fact) {
  const R = { events: new Set(), npcs: new Set(), conds: new Set(), memos: new Set(), states: new Set(), condRanges: [], level: [], items: [], notItems: [], itemCounts: [], raw: [], chance: null, chanceByNpc: null, chanceRaw: null, randomDepth: -1, loc: fact.loc || {}, randLow: {}, negChance: null, bind: {} };
  const ctx = fact.ctx;
  for (let k = 0; k < ctx.length; k++) {
    const f = ctx[k]; const h = f.header; let m;
    const labels = k === ctx.length - 1 ? fact.stmtLabels : ctx[k + 1].labels;
    if ((m = /^switch\s*\(([\s\S]*)\)$/.exec(h)) && labels) {
      const subj = m[1].trim(); const vals = labels.filter(l => l !== 'default').map(l => { const v = evalExpr(env, l); return v && v.enum ? v.v : (v && v.id !== undefined ? v.id : v); });
      if (/getId\(\)|^npcId$|^npc_id$|^id$/i.test(subj)) vals.forEach(v => typeof v === 'number' && R.npcs.add(v));
      else if (/^event$|getEvent/.test(subj)) vals.forEach(v => R.events.add(v));
      else if (/getCond\(\)|^cond$/i.test(subj)) vals.forEach(v => typeof v === 'number' && R.conds.add(v));
      else if (/getMemoState\(\)|^memo/i.test(subj)) vals.forEach(v => typeof v === 'number' && R.memos.add(v));
      else if (/getState\(\)/.test(subj)) vals.forEach(v => R.states.add(String(v)));
      else if (/getRandom/.test(subj)) R.random = true;
      else R.raw.push(`switch(${subj}) case ${labels.join(',')}`);
      continue;
    }
    if ((m = /^for\s*\(\s*(?:final\s+)?[\w<>\[\]]+\s+(\w+)\s*:\s*([\s\S]+)\)$/.exec(h))) { const v = evalExpr(env, m[2]); if (Array.isArray(v)) R.bind[m[1]] = v; else if (v && v.map) R.bind[m[1]] = v.map.map(e => e[0]); continue; }
    const negPrev = (f.prevIf || []).map(p => (/^(?:else\s+)?if\s*(\([\s\S]*\))$/.exec(p.header) || [])[1]).filter(Boolean);
    if ((m = /^(?:else\s+)?if\s*(\([\s\S]*\))$/.exec(h))) {
      for (const p of negPrev) negAtoms(env, p, R);
      const A = condAtoms(m[1]);
      if (A.and) for (const a of A.and) readAtom(env, a, R, false);
      else { const sub = A.or.map(o => { const r = { events: new Set(), npcs: new Set(), conds: new Set(), memos: new Set(), states: new Set(), condRanges: [], level: [], items: [], notItems: [], itemCounts: [], raw: [], loc: R.loc, randLow: {}, negChance: null }; for (const a of splitTop(o, '&&').map(unparen)) readAtom(env, a, r, false); return r; });
        for (const r of sub) { r.events.forEach(v => R.events.add(v)); r.npcs.forEach(v => R.npcs.add(v)); r.conds.forEach(v => R.conds.add(v)); r.memos.forEach(v => R.memos.add(v)); }
        R.raw.push(m[1]); }
      if ((/getRandom/.test(m[1]) || R.randVar || Object.keys(R.randLow).length) && R.randomDepth < 0) R.randomDepth = k;
      continue;
    }
    if (/^else$/.test(h)) { for (const p of negPrev) negAtoms(env, p, R); if ((negPrev.some(p => /getRandom/.test(p)) || Object.keys(R.randLow).length) && R.randomDepth < 0) R.randomDepth = k;
      if (R.chance === null && Object.keys(R.randLow).length) { const v = Object.keys(R.randLow)[0]; const N = R.loc[v] && R.loc[v].rand; if (N) R.chance = Math.round((N - R.randLow[v]) / N * 100 * 1000) / 1000; } continue; }
  }
  if (R.chance === null && !R.chanceByNpc && R.negChanceByNpc && R.randomDepth >= 0) R.chanceByNpc = Object.fromEntries(Object.entries(R.negChanceByNpc).map(([k, v]) => [k, Math.round((100 - v) * 1000) / 1000]));
  if (R.chance === null && R.negChance !== null && R.randomDepth >= 0) R.chance = Math.round((100 - R.negChance) * 1000) / 1000;
  return R;
}
function negAtoms(env, c, R) { const A = condAtoms(c); if (A.and && A.and.length === 1) readAtom(env, A.and[0], R, true); else R.raw.push('!' + c); }

// ---------------------------------------------------------------------------------------------------------------------------------
// build one quest record
function folderFiles(dir) { const o = { java: null, htmls: {} }; for (const f of fs.readdirSync(dir)) { if (f.endsWith('.java')) o.java = path.join(dir, f); else if (/\.html?$/.test(f)) o.htmls[f] = fs.readFileSync(path.join(dir, f), 'utf8'); } return o; }
const decode = s => String(s)
  .replace(/<fstring>\s*(\d+)\s*<\/fstring>/gi, (_, id) => NPCSTR[id] || id)
  .replace(/&\$(\d+);/g, (_, id) => NPCSTR[id] || '')
  .replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
  .replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').replace(/\n{2,}/g, '\n').trim();
function htmlLinks(html) {
  const out = []; const re = /<a\b[^>]*action="bypass\s+(?:-h\s+)?([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi; let m;
  while ((m = re.exec(html))) out.push({ action: m[1].trim(), text: decode(m[2]).replace(/\n/g, ' ') });
  const btn = /<button\b[^>]*>/gi; while ((m = btn.exec(html))) { const v = /value="([^"]*)"/i.exec(m[0]), a = /action="bypass\s+(?:-h\s+)?([^"]+)"/i.exec(m[0]); if (v && a) out.push({ action: a[1].trim(), text: decode(v[1]) }); }
  return out;
}

function npcInfo(id, quest) {
  const sp = spawnsById.get(id) || []; const a = atlasById.get(id); const x = NPCX[id];
  const cl = (CLIENT_NPCS[quest] || []).find(c => c.name && npcName(id) && (c.name === npcName(id) || c.name.endsWith(' ' + npcName(id))));
  const r = { id, name: npcName(id), title: (NPCS[id] && NPCS[id].t) || (x && x.title) || '', spawnCount: sp.length, spawns: sp.slice(0, 5).map(p => p.slice(0, 3)) };
  if (a && a.place) { if (a.place.town) { r.town = a.place.town; r.inTown = true; } else if (a.place.nearTown) { r.town = a.place.nearTown.name; r.townDist = a.place.nearTown.dist; } if (a.place.region) r.region = a.place.region; }
  else if (sp.length) { r.region = regionName(sp[0][0], sp[0][1], sp[0][2]); }
  if (cl && cl.at.length === 3 && cl.at.every(n => !isNaN(n))) r.clientPos = cl.at;
  if (!sp.length && !r.clientPos) r.noSpawn = true;
  return r;
}
function mobInfo(id) {
  const n = NPCS[id] || {}; const x = NPCX[id] || {}; const sp = spawnsById.get(id) || [];
  const r = { id, name: n.n || x.name || `NPC ${id}`, level: n.l || x.level || null, type: n.ty || x.type || null, aggressive: !!x.aggressive, raid: /Raid|GrandBoss/.test(n.ty || x.type || ''), spawnCount: sp.length, roles: [] };
  const ar = areasByMob.get(id) || []; if (ar.length) r.areas = ar.slice().sort((a, b) => b.count - a.count).slice(0, 4).map(a => ({ region: a.region, area: a.area, name: a.name, levels: a.levels, landing: a.landing }));
  if (sp.length) { // clusters on a 6000 grid
    const cells = {}; for (const p of sp) { const k = Math.round(p[0] / 6000) + ':' + Math.round(p[1] / 6000) + ':' + Math.round(p[2] / 1500); (cells[k] = cells[k] || []).push(p); }
    r.clusters = Object.values(cells).sort((a, b) => b.length - a.length).slice(0, 3).map(L => { const c = [0, 1, 2].map(i => Math.round(L.reduce((s, p) => s + p[i], 0) / L.length));
      return { at: c, count: L.length, place: placeOf(c[0], c[1], c[2]), landing: nearestLanding(c[0], c[1]) }; });
  }
  return r;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// race / class rules from the OFFER path (2026-10-27)
// L2J ClassId enum names -> client class names (Dashboard/data/classes.json spelling; swarm.js qeEligible compares them without spaces)
const CLASSID_ENUM = ['fighter', 'warrior', 'gladiator', 'warlord', 'knight', 'paladin', 'darkAvenger', 'rogue', 'treasureHunter', 'hawkeye', 'mage', 'wizard',
  'sorceror', 'necromancer', 'warlock', 'cleric', 'bishop', 'prophet', 'elvenFighter', 'elvenKnight', 'templeKnight', 'swordSinger', 'elvenScout', 'plainsWalker',
  'silverRanger', 'elvenMage', 'elvenWizard', 'spellsinger', 'elementalSummoner', 'oracle', 'elder', 'darkFighter', 'palusKnight', 'shillienKnight', 'bladedancer',
  'assassin', 'abyssWalker', 'phantomRanger', 'darkMage', 'darkWizard', 'spellhowler', 'phantomSummoner', 'shillienOracle', 'shillenElder', 'orcFighter', 'orcRaider',
  'destroyer', 'orcMonk', 'tyrant', 'orcMage', 'orcShaman', 'overlord', 'warcryer', 'dwarvenFighter', 'scavenger', 'bountyHunter', 'artisan', 'warsmith'];
const CLASSID_ENUM2 = { 88: ['duelist', 'dreadnought', 'phoenixKnight', 'hellKnight', 'sagittarius', 'adventurer', 'archmage', 'soultaker', 'arcanaLord', 'cardinal', 'hierophant',
  'evaTemplar', 'swordMuse', 'windRider', 'moonlightSentinel', 'mysticMuse', 'elementalMaster', 'evaSaint', 'shillienTemplar', 'spectralDancer', 'ghostHunter',
  'ghostSentinel', 'stormScreamer', 'spectralMaster', 'shillienSaint', 'titan', 'grandKhavatari', 'dominator', 'doomcryer', 'fortuneSeeker', 'maestro'],
  123: ['maleSoldier', 'femaleSoldier', 'trooper', 'warder', 'berserker', 'maleSoulbreaker', 'femaleSoulbreaker', 'arbalester', 'doombringer', 'maleSoulhound', 'femaleSoulhound',
    'trickster', 'inspector', 'judicator'] };
const CLASS_NAMES = rd(path.join(ROOT, 'Dashboard', 'data', 'classes.json'), {});
const classIdOfEnum = (e) => { let i = CLASSID_ENUM.indexOf(e); if (i >= 0) return i; for (const [b, L] of Object.entries(CLASSID_ENUM2)) { i = L.indexOf(e); if (i >= 0) return +b + i; } return null; };
/** ClassId enum name / class id -> the client class name ("fighter" -> "Human Fighter"); unknown stays as it is */
function classDisplay(c) { const id = typeof c === 'number' ? c : classIdOfEnum(String(c)); return (id != null && CLASS_NAMES[id]) ? CLASS_NAMES[id] : c; }
/** top-level ternary split: "c ? a : b" -> [c, a, b] (null when expr is no ternary) */
function splitTernary(expr) {
  let d = 0, q = -1;
  for (let i = 0; i < expr.length; i++) { const c = expr[i];
    if (c === '"' || c === "'") { let j = i + 1; while (j < expr.length && expr[j] !== c) { if (expr[j] === '\\') j++; j++; } i = j; continue; }
    if ('([{'.includes(c)) d++; else if (')]}'.includes(c)) d--;
    else if (!d && c === '?') { q = i; break; } }
  if (q < 0) return null;
  let n = 0; d = 0;
  for (let i = q + 1; i < expr.length; i++) { const c = expr[i];
    if (c === '"' || c === "'") { let j = i + 1; while (j < expr.length && expr[j] !== c) { if (expr[j] === '\\') j++; j++; } i = j; continue; }
    if ('([{'.includes(c)) d++; else if (')]}'.includes(c)) d--;
    else if (!d && c === '?') n++;
    else if (!d && c === ':' && expr[i + 1] !== ':' && expr[i - 1] !== ':') { if (!n) return [expr.slice(0, q).trim(), expr.slice(q + 1, i).trim(), expr.slice(i + 1).trim()]; n--; } }
  return null;
}
/** every condition path [{c, pos}] through the (nested) ternary expr to a leaf for which isLeaf(leafText) is true */
function ternaryPaths(expr, isLeaf, depth = 0) {
  expr = unparen(String(expr).trim()); if (depth > 12) return [];
  const t = splitTernary(expr); if (!t) return isLeaf(expr) ? [[]] : [];
  return ternaryPaths(t[1], isLeaf, depth + 1).map(p => [{ c: t[0], pos: true }].concat(p)).concat(ternaryPaths(t[2], isLeaf, depth + 1).map(p => [{ c: t[0], pos: false }].concat(p)));
}
/** conditions of the frames around a fact (if = true, else / later else-if = the earlier ifs false) */
function framePath(fact) {
  const out = [];
  for (const f of fact.ctx || []) {
    const cond = (h) => (/^(?:else\s+)?if\s*(\([\s\S]*\))$/.exec(h || '') || [])[1];
    (f.prevIf || []).forEach(p => { const c = cond(p.header); if (c) out.push({ c, pos: false }); });
    const c = cond(f.header); if (c) out.push({ c, pos: true });
  }
  return out;
}
/** race / class / category facts of one condition with polarity -> R { races:Set, notRaces:Set, classes:Set, notClasses:Set, cats:Set } */
function ruleAtoms(env, c, pos, R, depth = 0) {
  c = unparen(String(c).trim()); if (depth > 8) return;
  if (/^!/.test(c) && unparen(c.slice(1)) !== c.slice(1).trim() || /^!\s*[\w.]+\([^()]*\)$/.test(c)) { ruleAtoms(env, c.slice(1), !pos, R, depth + 1); return; }
  const or = splitTop(c, '||'), and = splitTop(c, '&&');
  const atom = (a) => { let m; a = unparen(a);
    if ((m = /getRace\(\)\s*(==|!=)\s*Race\.(\w+)$/.exec(a))) return { k: 'race', v: m[2], eq: m[1] === '==' };
    if ((m = /getClassId\(\)(?:\.getId\(\))?\s*(==|!=)\s*(?:ClassId\.)?([\w.()]+)$/.exec(a))) { const v = evalExpr(env, m[2].replace(/\.getId\(\)$/, '')); const cv = v && v.cls ? v.cls : (typeof v === 'number' ? v : m[2]); return { k: 'class', v: classDisplay(cv), eq: m[1] === '==' }; }
    if ((m = /^(!?)\s*\w+\.isInCategory\(\s*CategoryType\.(\w+)\s*\)$/.exec(a))) return { k: 'cat', v: m[2], eq: !m[1] };
    if ((m = /^(!?)\s*(?:\w+\.)?(?:hasQuestItems|hasItem|hasAllItems)\(([^()]*)\)$/.exec(a))) { const ids = splitTop(m[2]).flatMap(x => idsOf(env, x)).filter(v => typeof v === 'number' && v > 50); if (ids.length) return { k: 'item', v: ids, eq: !m[1] }; }
    return null; };
  if (or.length > 1) {
    const at = or.map(atom);
    if (pos) { // A || B: only a rule when every alternative is a race == (or class ==)
      if (at.every(x => x && x.k === 'race' && x.eq)) at.forEach(x => R.races.add(x.v));
      else if (at.every(x => x && x.k === 'class' && x.eq)) at.forEach(x => R.classes.add(x.v));
      else if (at.every(x => x && x.k === 'cat' && x.eq)) at.forEach(x => R.cats.add(x.v));
    } else or.forEach(o => ruleAtoms(env, o, false, R, depth + 1));   // !(A || B) = !A && !B
    return;
  }
  if (and.length > 1) {
    if (pos) { and.forEach(a => ruleAtoms(env, a, true, R, depth + 1)); return; }
    const at = and.map(atom);   // !(A && B) = !A || !B: a rule only when every part is a race != / class !=  -> race is one of them
    if (at.every(x => x && x.k === 'race' && !x.eq)) at.forEach(x => R.races.add(x.v));
    else if (at.every(x => x && x.k === 'class' && !x.eq)) at.forEach(x => R.classes.add(x.v));
    return;
  }
  const a = atom(c); if (!a) return;
  const eq = pos ? a.eq : !a.eq;
  if (a.k === 'race') (eq ? R.races : R.notRaces).add(a.v);
  else if (a.k === 'class') (eq ? R.classes : R.notClasses).add(a.v);
  else if (a.k === 'cat' && eq) R.cats.add(a.v);
  else if (a.k === 'item' && eq) a.v.forEach(v => R.items.add(v));   // start items (Mark of Traveler 7570 for 45-49 ...)
}
/** the race / class rule of a quest from the conditions on the way to its offer page(s); null = no offer page found */
function offerPathRules(env, facts, htmls, startFacts) {
  const startEvents = new Set(startFacts.flatMap(f => [...f.I.events]));
  const linksOf = {}; for (const [file, html] of Object.entries(htmls)) linksOf[file] = htmlLinks(html).map(l => (/^Quest\s+\S+\s+([\s\S]+)$/i.exec(l.action) || [])[1]).filter(Boolean).map(s => s.trim());
  // offer pages: link to a start event; then pages that link to an offer page (event name = file name), 4 rounds
  const offer = new Set(); for (const [f, L] of Object.entries(linksOf)) if (L.some(e => startEvents.has(e))) offer.add(f);
  for (let r = 0; r < 4; r++) for (const [f, L] of Object.entries(linksOf)) if (!offer.has(f) && L.some(e => offer.has(e) && !startEvents.has(f))) offer.add(f);
  const paths = [];
  const notStarted = (f) => !f.I.states.has('STARTED') && !f.I.states.has('COMPLETED') && !(f.I.conds && f.I.conds.size);
  for (const f of facts) {
    if (f.t !== 'html' || !offer.has(f.file) || !notStarted(f) || startEvents.has(f.file) && f.I.events.has(f.file)) continue;
    const base = framePath(f);
    const m = /^(?:return\s+|[\w.]+\s*=(?!=)\s*)([\s\S]+)$/.exec(f.full || f.stmt || '');
    const lit = '"' + f.file + '"';
    const tp = m ? ternaryPaths(m[1], (leaf) => leaf.indexOf(lit) >= 0) : [[]];
    (tp.length ? tp : [[]]).forEach(p => paths.push(base.concat(p)));
  }
  if (!paths.length) for (const f of startFacts) paths.push(framePath(f));   // no offer page: the start statement's own conditions
  if (!paths.length) return null;
  const Rs = paths.map(p => { const R = { races: new Set(), notRaces: new Set(), classes: new Set(), notClasses: new Set(), cats: new Set(), items: new Set() }; p.forEach(x => ruleAtoms(env, x.c, x.pos, R)); return R; });
  const unionIfAll = (k) => Rs.every(R => R[k].size) ? [...new Set(Rs.flatMap(R => [...R[k]]))] : [];
  const inter = (k) => { const [a, ...rest] = Rs; return [...a[k]].filter(v => rest.every(R => R[k].has(v))); };
  const races = unionIfAll('races');
  return { races, notRaces: races.length ? [] : inter('notRaces'), classes: unionIfAll('classes'), notClasses: inter('notClasses'), categories: unionIfAll('cats'), items: inter('items') };
}

function buildQuest(dirName, javaFile, htmls, opts = {}) {
  let src = fs.readFileSync(javaFile, 'utf8');
  const reasons = [];
  let saga = null;
  if (/extends\s+AbstractSagaQuest/.test(src)) { saga = sagaSource(src); src = saga.src; reasons.push('saga template (AbstractSagaQuest): arrays substituted'); }
  const sup = /super\(\s*(-?\d+)\s*,\s*([^,]+?)\s*,\s*"([^"]*)"\s*\)/.exec(saga ? saga.sup : src) || /super\(\s*(-?\d+)\s*,/.exec(src);
  if (!sup) return null;
  const id = +sup[1]; const title = sup[3] || null;
  const className = (/class\s+(\w+)/.exec(saga ? saga.sub : src) || [])[1] || dirName;
  const P = parseQuest(src, { id }); const env = P.env;
  const allIds = (name) => { const L = []; for (const c of calls(P.src, name)) for (const x of c.args) for (const v of idsOf(env, x)) if (typeof v === 'number') L.push(v); else env.unresolved.add(name + '(' + x + ')'); return [...new Set(L)]; };
  const reg = { start: allIds('addStartNpc'), talk: allIds('addTalkId'), kill: allIds('addKillId'), attack: allIds('addAttackId'), spawn: allIds('addSpawnId'), skill: allIds('addSkillSeeId'),
    firstTalk: allIds('addFirstTalkId'), aggro: allIds('addAggroRangeEnterId'), see: allIds('addSeeCreatureId'), itemTalk: allIds('addItemTalkId'), qitems: allIds('registerQuestItems') };
  const facts = P.facts; facts.forEach(f => { f.I = interp(env, f); });
  // events -> NPC + link text, from the html files
  const qcls = className; const evNpc = {}, evText = {}, htmlByEvent = {};
  for (const [file, html] of Object.entries(htmls)) { const npc = +((/^(\d{5,})/.exec(file) || [])[1] || 0);
    for (const l of htmlLinks(html)) { const mm = /^Quest\s+(\S+)\s+([\s\S]+)$/i.exec(l.action); if (!mm) continue; const ev = mm[2].trim();
      if (npc) (evNpc[ev] = evNpc[ev] || new Set()).add(npc); if (l.text && !evText[ev]) evText[ev] = l.text; (htmlByEvent[ev] = htmlByEvent[ev] || new Set()).add(file); } }
  const npcOfEvent = (ev) => { const s = new Set(); const p = /^(\d{5,})-/.exec(ev || ''); if (p) s.add(+p[1]); (evNpc[ev] || []).forEach(n => s.add(n)); return [...s]; };
  const timerNames = new Set(facts.filter(f => f.t === 'timer' && typeof f.name === 'string').map(f => f.name));
  const methodDefault = {}; // default conds for a method from getRandomPartyMember(player, N)
  { const re = /(?:public|private|protected)[^;{}]*?\b(on\w+)\s*\([^)]*\)\s*\{/g; let m; while ((m = re.exec(P.src))) { const body = P.src.slice(m.index, matchClose(P.src, P.src.indexOf('{', m.index + m[0].length - 1), '{', '}'));
    const conds = new Set(); let k; const r1 = /getRandomPartyMember\(\s*\w+\s*,\s*(\d+)\s*\)/g; while ((k = r1.exec(body))) conds.add(+k[1]);
    const r2 = /getRandomPartyMember\(\s*\w+\s*,\s*"cond"\s*,\s*"(\d+)"\s*\)/g; while ((k = r2.exec(body))) conds.add(+k[1]);
    if (conds.size) methodDefault[m[1]] = [...conds]; } }
  const trig = (f) => { const I = f.I; let type = METHOD_TYPE[f.method] || 'other';
    if (type === 'event' && [...I.events].some(e => timerNames.has(e))) type = 'timer';
    const t = { type };
    let npcs = [...I.npcs]; let events = [...I.events];
    if (type === 'event' || type === 'timer') { if (!npcs.length) for (const e of events) npcOfEvent(e).forEach(n => npcs.push(n)); }
    if (!npcs.length) { if (type === 'talk') npcs = reg.talk.length === 1 ? reg.talk.slice() : []; else if (type === 'kill') npcs = reg.kill.slice(); else if (type === 'attack') npcs = reg.attack.slice(); else if (type === 'firstTalk') npcs = reg.firstTalk.slice(); else if (type === 'skill') npcs = reg.skill.slice(); else if (type === 'spawn') npcs = reg.spawn.slice(); }
    t.npcs = [...new Set(npcs)]; if (events.length) { t.events = events; const L = events.map(e => evText[e]).filter(Boolean); if (L.length) t.links = [...new Set(L)]; }
    if (type === 'timer') t.timer = events[0];
    if (I.states.size) t.state = [...I.states].join(',');
    if (I.raw.length) t.raw = I.raw.slice(0, 6);
    if (I.items.length) t.needItems = [...new Set(I.items)];
    if (I.itemCounts.length) t.needCounts = I.itemCounts;
    return t; };
  const condsOf = (f) => { const c = [...f.I.conds]; if (!c.length && f.scoped) return f.scoped.slice(); if (!c.length && methodDefault[f.method] && f.method === 'onKill') return methodDefault[f.method].slice(); if (!c.length && methodDefault[f.method] && /onAttack|onSkillSee/.test(f.method)) return methodDefault[f.method].slice(); return c; };
  // ---- group facts into actions by frame
  const KEY = new Set(['start', 'cond', 'memo', 'exit']);
  const byFrame = new globalThis.Map(); for (const f of facts) { const k = f.path[f.path.length - 1]; if (!byFrame.has(k)) byFrame.set(k, []); byFrame.get(k).push(f); }
  const keyFrames = new Set(); for (const f of facts) if (KEY.has(f.t)) keyFrames.add(f.path[f.path.length - 1]);
  const actions = []; const owned = new Set();
  for (const kf of keyFrames) {
    const keys = byFrame.get(kf).filter(f => KEY.has(f.t)); const k0 = keys[0];
    const members = facts.filter(f => { const ix = f.path.indexOf(kf); if (ix < 0) return false; for (let j = ix + 1; j < f.path.length; j++) if (keyFrames.has(f.path[j])) return false; return true; });
    members.forEach(f => owned.add(f));
    actions.push({ frame: kf, keys, members, k0 });
  }
  // loose reward actions (no key in their frame chain)
  const loose = facts.filter(f => !owned.has(f) && /^(give|adena|exp|take|spawn)$/.test(f.t) && f.method !== 'onKill');
  const looseByFrame = new globalThis.Map(); for (const f of loose) { const k = f.path[f.path.length - 1]; if (!looseByFrame.has(k)) looseByFrame.set(k, []); looseByFrame.get(k).push(f); }
  const qitemSet = new Set(reg.qitems);
  const isQuestItem = (id) => qitemSet.has(id) || (ITEMX[id] && ITEMX[id].quest);
  const itemsOut = (L, kind) => L.filter(f => f.t === kind && typeof f.item === 'number').map(f => { const o = { id: f.item, count: f.count }; if (f.I.randomDepth >= 0 && f.I.chance != null) o.chance = f.I.chance; else if (f.I.randomDepth >= 0) o.random = true; return o; });
  const rnd = (f, v) => (f.I.randomDepth >= 0 && f.I.chance != null && typeof v === 'number') ? { amount: v, chance: f.I.chance } : v;
  const sumAdena = (L) => { const A = L.filter(f => f.t === 'adena').map(f => rnd(f, f.v)); if (!A.length) return null; if (A.every(v => typeof v === 'number')) return A.reduce((a, b) => a + b, 0); return A.length === 1 ? A[0] : A; };
  const sumExp = (L, k) => { const A = L.filter(f => f.t === 'exp').map(f => f[k]); if (!A.length) return null; if (A.every(v => typeof v === 'number')) return A.reduce((a, b) => a + b, 0); return A[0]; };
  const transitions = [];
  for (const a of actions) {
    const f = a.k0; const t = { from: null, to: null };
    const conds = condsOf(f); if (conds.length) t.from = conds.sort((x, y) => x - y); if (f.I.memos.size) t.fromMemo = [...f.I.memos];
    if (f.I.condRanges.length) t.fromRange = f.I.condRanges;
    const kc = a.keys.find(k => k.t === 'cond'), km = a.keys.find(k => k.t === 'memo'), ks = a.keys.find(k => k.t === 'start'), ke = a.keys.find(k => k.t === 'exit');
    if (ke) { t.to = 'end'; t.end = ke.type; } else if (ks) { t.to = kc && kc.v ? kc.v : 1; t.start = true; } else if (kc) t.to = kc.v !== null ? kc.v : { raw: kc.raw }; else if (km) t.to = null;
    if (km) t.memo = km.v !== null ? km.v : { raw: km.raw };
    t.trigger = trig(f);
    const gives = itemsOut(a.members, 'give'); if (gives.length) t.gives = gives; const takes = itemsOut(a.members, 'take'); if (takes.length) t.takes = takes;
    const ad = sumAdena(a.members); if (ad !== null) t.adena = ad; const ex = sumExp(a.members, 'exp'); if (ex !== null) { t.exp = ex; t.sp = sumExp(a.members, 'sp'); }
    const sps = a.members.filter(x => x.t === 'spawn'); if (sps.length) t.spawns = sps.map(x => ({ npc: x.npc, at: x.at }));
    if (a.members.some(x => x.I.randomDepth >= 0)) t.random = true;
    { const rk = a.keys.concat([f]).find(x => x.I.randomDepth >= 0 && (x.I.chance != null || x.I.chanceByNpc)); if (rk) { t.random = true; if (rk.I.chanceByNpc) t.chanceByNpc = rk.I.chanceByNpc; else t.chance = rk.I.chance; } else if (a.keys.some(x => x.I.randomDepth >= 0 && x.I.chanceRaw)) { t.random = true; t.chanceRaw = a.keys.find(x => x.I.chanceRaw).I.chanceRaw; } }   // a stage reached on a random roll (Q151: 20 % per kill)
    if (f.I.level.length) t.level = f.I.level.map(l => `${l.neg ? 'not ' : ''}level ${l.op} ${l.v}`);
    transitions.push(t);
  }
  // dedupe identical transitions
  const tkey = (t) => JSON.stringify([t.from, t.fromMemo, t.to, t.memo, t.end, t.trigger.type, t.trigger.npcs, t.trigger.events, t.gives, t.takes, t.adena, t.exp]);
  const T = []; { const seen = new Set(); for (const t of transitions) { const k = tkey(t); if (seen.has(k)) continue; seen.add(k); T.push(t); } }
  const looseActs = [...looseByFrame.values()].map(L => { const f = L[0]; const r = { trigger: trig(f) }; const c = condsOf(f); if (c.length) r.conds = c; if (f.I.memos.size) r.memos = [...f.I.memos];
    const g = itemsOut(L, 'give'); if (g.length) r.items = g; const tk = itemsOut(L, 'take'); if (tk.length) r.takes = tk; const ad = sumAdena(L); if (ad !== null) r.adena = ad; const ex = sumExp(L, 'exp'); if (ex !== null) { r.exp = ex; r.sp = sumExp(L, 'sp'); }
    const sps = L.filter(x => x.t === 'spawn'); if (sps.length) r.spawns = sps.map(x => ({ npc: x.npc, at: x.at })); return r; });

  // ---- drops
  const drops = [];
  const lists = Object.entries(env.consts).filter(([k, v]) => v && v.droplist);
  const usedLists = new globalThis.Map(); // list name -> context conds
  for (const f of facts.filter(f => f.t === 'drop')) {
    const conds = condsOf(f); const base = { conds, memos: [...f.I.memos], needItems: [...new Set(f.I.items)], src: f.src };
    if (f.src === 'droplist') { const L = env.consts[f.list]; if (L && L.droplist) { if (!usedLists.has(f.list)) usedLists.set(f.list, []); usedLists.get(f.list).push(Object.assign({ item: f.item, npcs: [...f.I.npcs] }, base)); } else reasons.push('drop list ' + f.list + ' not resolved'); continue; }
    const d = Object.assign({ item: f.item, monsters: f.I.npcs.size ? [...f.I.npcs] : (f.method === 'onKill' ? reg.kill.slice() : (f.method === 'onAttack' ? reg.attack.slice() : [])), _f: f }, base);
    if (f.I.chanceByNpc) d.chanceByNpc = f.I.chanceByNpc; else if (typeof f.chance === 'number') d.chance = f.I.chance != null ? Math.round(f.chance * f.I.chance) / 100 : f.chance; else if (f.chance && f.chance.raw) { d.chanceRaw = f.chance.raw; }
    if (f.amount !== undefined) d.amount = f.amount; if (f.limit) d.limit = f.limit;
    drops.push(d);
  }
  for (const [name, ctxs] of usedLists) { const L = env.consts[name].droplist; const conds = [...new Set(ctxs.flatMap(c => c.conds))]; const memos = [...new Set(ctxs.flatMap(c => c.memos))]; const need = [...new Set(ctxs.flatMap(c => c.needItems))];
    for (const e of L) { if (ctxs.every(c => c.item !== undefined && c.item !== e.item)) continue;
      drops.push({ item: e.item, monsters: e.npcs.filter(n => typeof n === 'number'), chance: e.chance, amount: e.amount, limit: e.limit || undefined, conds, memos, needItems: (e.req || []).length ? e.req : need, src: 'droplist', group: e.group || undefined }); } }
  for (const [name, v] of lists) if (!usedLists.has(name)) for (const e of v.droplist) drops.push({ item: e.item, monsters: e.npcs.filter(n => typeof n === 'number'), chance: e.chance, amount: e.amount, limit: e.limit || undefined, conds: [], memos: [], needItems: e.req || [], src: 'droplist', note: 'list not referenced directly in onKill' });
  // give in onKill (script drops)
  for (const f of facts.filter(f => f.t === 'give' && /onKill|onAttack|onSkillSee|onSpawn/.test(f.method) && !owned.has(f) || (f.t === 'give' && f.method === 'onKill' && owned.has(f)))) {
    const conds = condsOf(f); const d = { _f: f, item: f.item, monsters: f.I.npcs.size ? [...f.I.npcs] : (f.method === 'onKill' ? reg.kill.slice() : reg.attack.slice()), conds, memos: [...f.I.memos], needItems: [...new Set(f.I.items)], src: 'script', amount: typeof f.count === 'number' ? f.count : undefined };
    if (f.I.chanceByNpc) d.chanceByNpc = f.I.chanceByNpc; else if (f.I.chance != null) d.chance = f.I.chance; else if (f.I.chanceRaw) d.chanceRaw = f.I.chanceRaw; else d.chance = 100;
    if (f.method !== 'onKill') d.on = f.method;
    drops.push(d);
  }
  // limits from count checks
  const limits = {};
  { const re = /getQuestItemsCount\(([^()]*)\)\s*(>=|==|>)\s*([\w.]+)/g; let mm; while ((mm = re.exec(P.src))) { const n = evalExpr(env, mm[3]); if (typeof n !== 'number' || n <= 1) continue; for (const x of splitTop(mm[1])) { const v = evalExpr(env, x); const iid = v && v.id !== undefined ? v.id : v; if (typeof iid === 'number' && iid > 50) limits[iid] = Math.max(limits[iid] || 0, n + (mm[2] === '>' ? 1 : 0)); } } }
  // counts kept in a local (324: `long sacs = st.getQuestItemsCount(VENOM_SAC); if (sacs < REQUIRED_COUNT)`)
  { const re = /\b(?:long|int|var)\s+(\w+)\s*=\s*(?:\w+\.)?getQuestItemsCount\(([^()]*)\)\s*;/g; let mm; while ((mm = re.exec(P.src))) {
      const ids = splitTop(mm[2]).map(x => evalExpr(env, x)).map(v => v && v.id !== undefined ? v.id : v).filter(v => typeof v === 'number' && v > 50); if (!ids.length) continue;
      const rc = new RegExp('\\b' + mm[1] + '\\b\\s*(<|>=|==)\\s*([\\w.]+)', 'g'); let c2; while ((c2 = rc.exec(P.src))) { const n = evalExpr(env, c2[2]); if (typeof n === 'number' && n > 1) ids.forEach(i => { limits[i] = Math.max(limits[i] || 0, n); }); } } }
  for (const f of facts.filter(f => f.t === 'count')) { if (/>=|==/.test(f.op) && typeof f.n === 'number' && f.n > 0) limits[f.item] = Math.max(limits[f.item] || 0, f.n); if (f.op === '<' && f.n > 0) limits[f.item] = Math.max(limits[f.item] || 0, f.n); if (f.op === '>' && f.n >= 0) limits[f.item] = Math.max(limits[f.item] || 0, f.n + 1); }
  { const ex = []; for (let i = drops.length - 1; i >= 0; i--) { const d = drops[i]; const src = d._f;
      if (src && src.itemByNpc) { drops.splice(i, 1); const by = {}; for (const [n, it] of Object.entries(src.itemByNpc)) { if (d.monsters.length && !d.monsters.includes(+n)) continue; (by[it] = by[it] || []).push(+n); }
        for (const [it, ns] of Object.entries(by)) ex.push(Object.assign({}, d, { item: +it, monsters: ns, chanceByNpc: d.chanceByNpc ? Object.fromEntries(ns.filter(n => d.chanceByNpc[n] != null).map(n => [n, d.chanceByNpc[n]])) : undefined })); }
      else if (src && src.groupItems) { drops.splice(i, 1); const n = src.groupItems.length; for (const it of src.groupItems) ex.push(Object.assign({}, d, { item: it, chance: typeof src.chance === 'number' ? Math.round(src.chance / n * 1000) / 1000 : null, chanceRaw: undefined, group: true })); } }
    drops.push(...ex); drops.forEach(d => { delete d._f; }); }
  for (const d of drops) { if (!d.limit && limits[d.item]) d.limit = limits[d.item]; if (typeof d.item !== 'number') reasons.push('drop item not resolved'); if (d.chance === undefined && !d.chanceByNpc) { if (!d.chanceRaw) d.chance = null; } }
  // merge drops (same item / conds / chance)
  const DM = []; { const by = {}; for (const d of drops) { const k = JSON.stringify([d.item, d.conds, d.memos, d.chance, d.chanceByNpc, d.amount, d.limit, d.needItems, d.on]); if (by[k]) { by[k].monsters = [...new Set(by[k].monsters.concat(d.monsters))]; continue; } by[k] = d; DM.push(d); } }
  // kills without items (counters): onKill transitions
  const kills = T.filter(t => t.trigger.type === 'kill').map(t => { const k = { monsters: t.trigger.npcs, conds: t.from || [], to: t.to }; if (t.random) { k.random = true; if (t.chance != null) k.chance = t.chance; if (t.chanceByNpc) k.chanceByNpc = t.chanceByNpc; if (t.chanceRaw) k.chanceRaw = t.chanceRaw;
      // the engine hunts kills[].count monsters for a kill stage: a stage reached on a random roll gets the count that reaches it 95 % of the time (Q151: 20 % -> 14)
      const ps = [].concat(t.chance != null ? [t.chance] : [], t.chanceByNpc ? Object.values(t.chanceByNpc) : []).map(Number).filter(v => v > 0 && v < 100); if (ps.length) { const p = Math.min(...ps) / 100;
        // the roll gives an item and the stage moves at L items (324: 10 Venom Sacs at 26-30 %): 95 % of the negative binomial, else one hit
        const L = Math.max(0, ...DM.filter(d => d.limit > 1 && (d.monsters || []).some(m => k.monsters.includes(m)) && (!(d.conds || []).length || (d.conds || []).some(c => k.conds.includes(c)))).map(d => Number(d.limit) || 0));
        k.count = L > 1 ? Math.ceil((L + 1.645 * Math.sqrt(L * (1 - p))) / p) : Math.ceil(Math.log(0.05) / Math.log(1 - p));
        k.countWhy = 'random stage: ' + Math.round(p * 1000) / 10 + ' % per kill' + (L > 1 ? ', ' + L + ' items' : '') + ', ' + k.count + ' kills = 95 %'; } } return k; });
  for (const f of facts.filter(f => f.method === 'onKill' && f.t === 'count')) { /* item counts handled as limits */ }
  { const cnt = facts.filter(f => f.method === 'onKill' && /set\(\s*"|setMemoStateEx|getInt\(|incrementKill|KILL_COUNT|kills?\b/i.test(f.stmt || '')); if (cnt.length) { const nums = []; for (const f of facts.filter(f => f.method === 'onKill')) for (const r of f.I.raw) { const mm = /(?:>=|==)\s*(\d+)/.exec(r); if (mm && +mm[1] > 1) nums.push(+mm[1]); } if (nums.length && kills.length) kills.forEach(k => { k.count = Math.max(...nums); }); } }
  // spawns
  const spawns = facts.filter(f => f.t === 'spawn').map(f => ({ npc: f.npc, raw: f.raw || undefined, by: trig(f), conds: condsOf(f), at: f.at, despawnMs: f.despawnMs || undefined }));
  const timers = facts.filter(f => f.t === 'timer').map(f => ({ name: f.name, ms: f.ms, by: trig(f).type }));
  const timersU = []; { const seen = new Set(); for (const t of timers) { const k = t.name + t.ms; if (!seen.has(k)) { seen.add(k); timersU.push(t); } } }

  // ---- type
  const exits = facts.filter(f => f.t === 'exit');
  const hasOne = exits.some(e => e.type === 'one-time'), hasRep = exits.some(e => e.type === 'repeatable'), hasDaily = exits.some(e => e.type === 'daily');
  let type = 'unknown', typeWhy = '';
  if (hasDaily) { type = 'daily'; typeWhy = 'exitQuest(QuestType.DAILY)'; }
  else if (hasOne) { type = 'one-time'; typeWhy = 'exitQuest(false / ONE_TIME) on completion'; }
  else if (hasRep) { type = 'repeatable'; typeWhy = 'only exitQuest(true / REPEATABLE): the quest can be taken again'; }
  else if (looseActs.some(a => a.adena != null || (a.items || []).length)) { type = 'repeatable'; typeWhy = 'never ends: rewards are handed out on every turn-in'; }
  const endless = !exits.length && looseActs.some(a => a.adena != null || (a.items || []).length);
  const cl = CLIENT[id];
  if (type === 'unknown' && cl) { if (cl.type === 2) { type = 'repeatable'; typeWhy = 'client marks it repeatable'; } }

  // ---- requirements + level
  const startFacts = facts.filter(f => f.t === 'start');
  const startFrames = new Set(startFacts.flatMap(f => f.path));
  const createdFacts = facts.filter(f => f.I.states.has('CREATED') || (f.method === 'onTalk' && f.ctx.some(c => /isCreated\(\)/.test(c.header))));
  const reqFacts = [...startFacts, ...createdFacts];
  const level = { min: null, max: null }; let levelWhy = '';
  const constLevel = (re) => { for (const [k, v] of Object.entries(env.consts)) if (re.test(k) && typeof v === 'number') return { k, v }; return null; };
  const minC = constLevel(/^MIN_(?:LEVEL|LVL|PLAYER_LEVEL|LV)$|^MIN_LEVEL_?\w*|^LEVEL_MIN$/), maxC = constLevel(/^MAX_(?:LEVEL|LVL|LV)$|^MAX_LEVEL_?\w*|^LEVEL_MAX$/);
  if (minC) { level.min = minC.v; levelWhy = minC.k; } if (maxC) { level.max = maxC.v; levelWhy += (levelWhy ? ', ' : '') + maxC.k; }
  if (level.min === null) { // comparisons on the start path / CREATED
    const cmp = []; for (const f of reqFacts) for (const l of f.I.level) cmp.push(l);
    const re = /getLevel\(\)\s*(>=|>|<=|<)\s*([\w.]+)/g; let mm; const txt = P.src;
    if (!cmp.length) while ((mm = re.exec(txt))) { const v = evalExpr(env, mm[2]); cmp.push({ op: mm[1], v, name: mm[2], neg: false, loose: true }); }
    for (const c of cmp) { if (typeof c.v !== 'number') continue; const isMax = /MAX/i.test(c.name);
      let op = c.op; if (c.neg) op = { '>=': '<', '>': '<=', '<': '>=', '<=': '>' }[op];
      if (isMax) { if (/</.test(op) || op === '<=') level.max = c.v; continue; }
      if (op === '>=') level.min = Math.max(level.min || 0, c.v); else if (op === '>') level.min = Math.max(level.min || 0, c.v + 1);
      else if (op === '<' && level.min === null) level.min = c.v; else if (op === '<=' && c.v >= 60 && level.max === null && c.loose) { /* ambiguous */ } }
    if (level.min !== null) levelWhy = 'level check in the script';
  }
  const requirements = { races: [], notRaces: [], classes: [], notClasses: [], categories: [], quests: [], items: [], noble: false, clan: null, subclass: false, other: [] };
  {
    const conds = []; for (const f of reqFacts) for (const c of f.ctx) { const m = /^(?:else\s+)?if\s*(\([\s\S]*\))$/.exec(c.header); if (m) conds.push(m[1]); }
    // ternaries in the CREATED branch
    for (const f of createdFacts) { const m = /=\s*\(?([^?]+)\)?\s*\?/.exec(f.stmt || ''); if (m) conds.push(m[1]); }
    const txt = [...new Set(conds)].join(' && ');
    let m; const re1 = /getRace\(\)\s*(==|!=)\s*Race\.(\w+)/g; while ((m = re1.exec(txt))) (m[1] === '==' ? requirements.races : requirements.notRaces).push(m[2]);
    const re2 = /getClassId\(\)(?:\.getId\(\))?\s*(==|!=)\s*(?:ClassId\.)?(\w+)/g; while ((m = re2.exec(txt))) { const v = evalExpr(env, m[2]); (m[1] === '==' ? requirements.classes : requirements.notClasses).push(v && v.cls ? v.cls : (typeof v === 'number' ? v : m[2])); }
    const re3 = /isInCategory\(\s*CategoryType\.(\w+)/g; while ((m = re3.exec(txt))) requirements.categories.push(m[1]);
    if (/isNoble\(\)/.test(txt)) requirements.noble = true;
    if (/isSubClassActive\(\)/.test(txt)) requirements.subclass = true;
    if (/getClan\(\)|isClanLeader\(\)/.test(txt)) { const cm = /getClan\(\)\.getLevel\(\)\s*(>=|>)\s*(\d+)/.exec(txt); requirements.clan = { leader: /isClanLeader\(\)/.test(txt), minLevel: cm ? +cm[2] + (cm[1] === '>' ? 1 : 0) : null }; }
    const re4 = /(?:hasQuestCompleted|getQuestState)\(\s*(?:\w+\s*,\s*)?(Q(\d{5})_\w+)\.class\.getSimpleName\(\)\s*(?:,\s*\w+\s*)?\)(\s*(?:!=\s*null\s*\)?\s*&&\s*\w+\.)?is(Completed|Started)\(\))?/g;
    while ((m = re4.exec(txt))) requirements.quests.push({ id: +m[2], name: m[1], need: /hasQuestCompleted/.test(m[0]) ? 'completed' : (m[4] === 'Started' ? 'started' : 'completed') });
    const re5 = /(?:hasQuestItems|hasItem|hasAtLeastOneQuestItem)\(\s*\w+\s*,\s*([^()]+)\)/g; while ((m = re5.exec(txt))) for (const x of splitTop(m[1])) for (const v of idsOf(env, x)) if (typeof v === 'number' && v > 50) requirements.items.push(v);
    for (const c of new Set(conds)) if (!/getLevel|getRace|getClassId|isInCategory|isNoble|getClan|isClanLeader|QuestCompleted|getQuestState|hasQuestItems|hasItem|isCreated|isStarted|event\.equals|equals\(event|getId\(\)|isCond|getCond|isMemoState|getRandom|st\s*[!=]=\s*null|qs\s*[!=]=\s*null/.test(c)) requirements.other.push(c.length > 160 ? c.slice(0, 160) + '…' : c);
    // the quest file also checks other quests anywhere near the start (constructor-level helpers)
    const re6 = /hasQuestCompleted\(\s*(Q(\d{5})_\w+)\.class/g; while ((m = re6.exec(P.src))) if (!requirements.quests.some(q => q.id === +m[2])) requirements.quests.push({ id: +m[2], name: m[1], need: 'completed', where: 'somewhere in the script' });
    requirements.items = [...new Set(requirements.items)].map(i => ({ id: i, name: itemName(i) }));
    // OFFER PATH (2026-10-27): race / class rules from the conditions that lead to the OFFER page (polarity-aware, incl. nested ternaries);
    // replaces the ternary guess above, which read only the first condition and kept refusal branches unflipped (Q2, Q9, 401-418).
    const op = offerPathRules(env, facts, htmls, startFacts);
    if (op) { requirements.races = op.races; requirements.notRaces = op.notRaces; requirements.classes = op.classes; requirements.notClasses = op.notClasses; requirements.categories = op.categories; (op.items || []).forEach(v => { if (!requirements.items.some(x => x.id === v)) requirements.items.push({ id: v, name: itemName(v) }); }); }
    else requirements.classes = requirements.classes.map(classDisplay);
    for (const k of ['races', 'notRaces', 'classes', 'notClasses', 'categories']) requirements[k] = [...new Set(requirements[k])];
    const seenQ = new Set(); requirements.quests = requirements.quests.filter(q => { if (seenQ.has(q.id) || q.id === id) return false; seenQ.add(q.id); return true; });
    requirements.other = [...new Set(requirements.other)].slice(0, 8);
  }
  for (const k of Object.keys(requirements)) { const v = requirements[k]; if (v === false || v === null || (Array.isArray(v) && !v.length)) delete requirements[k]; }

  // ---- description: the page that links to the start event
  const startEvents = new Set(startFacts.flatMap(f => [...f.I.events]));
  let description = null, offerPage = null;
  for (const ev of startEvents) for (const file of (htmlByEvent[ev] || [])) { if (!offerPage) offerPage = file; }
  if (!offerPage) { const cr = createdFacts.filter(f => f.t === 'html').map(f => f.file).filter(f => htmls[f]); offerPage = cr.find(f => !/low|level|-0?2\.htm/i.test(f)) || cr[0] || null; }
  if (offerPage && htmls[offerPage]) description = decode(htmls[offerPage]).replace(/^[^\n]*\n/, (l) => /^\s*[\w' .,-]{1,60}:?\s*$/.test(l) ? l : l).slice(0, 900);
  let acceptText = null; for (const ev of startEvents) if (htmls[ev]) { acceptText = decode(htmls[ev]).slice(0, 600); break; }

  // ---- NPCs / monsters
  const talkIds = [...new Set([...reg.start, ...reg.talk, ...reg.firstTalk])];
  const spawnedIds = [...new Set(spawns.map(s => s.npc).filter(n => typeof n === 'number'))];
  const isMob = (n) => { const t = (NPCS[n] && NPCS[n].ty) || (NPCX[n] && NPCX[n].type) || ''; return /Monster|Raid|Boss|Minion|Chest|Guard|L2Attackable|Defender/i.test(t); };
  const mobIds = set_(reg.kill, reg.attack, reg.skill, reg.aggro, reg.see, DM.flatMap(d => d.monsters), spawnedIds.filter(isMob));
  const npcIds = set_(talkIds, spawnedIds.filter(n => !isMob(n)));
  const startNpcs = reg.start.map(n => npcInfo(n, id));
  const npcs = [...npcIds].map(n => { const r = npcInfo(n, id); if (spawnedIds.includes(n) && !spawnsById.has(n)) r.spawnedByQuest = true; return r; });
  const monsters = [...mobIds].filter(n => typeof n === 'number').map(n => { const r = mobInfo(n); if (reg.kill.includes(n)) r.roles.push('kill'); if (reg.attack.includes(n)) r.roles.push('attack'); if (spawnedIds.includes(n)) r.roles.push('spawned'); if (DM.some(d => d.monsters.includes(n))) r.roles.push('drop'); if (spawnedIds.includes(n) && !spawnsById.has(n)) r.spawnedByQuest = true; return r; });

  // ---- steps
  const useMemo = !facts.some(f => f.t === 'cond') && facts.some(f => f.t === 'memo' && f.v !== null);
  if (useMemo) { for (const t of T) { if (t.fromMemo && !t.from) t.from = t.fromMemo.slice(); if (typeof t.memo === 'number' && (t.to === null || t.to === undefined)) t.to = t.memo; }
    for (const d of DM) if (!d.conds.length && d.memos && d.memos.length) d.conds = d.memos.slice(); }
  const condVals = new Set(); T.forEach(t => { (t.from || []).forEach(c => condVals.add(c)); if (typeof t.to === 'number') condVals.add(t.to); }); DM.forEach(d => d.conds.forEach(c => condVals.add(c)));
  const memoVals = new Set(); T.forEach(t => { (t.fromMemo || []).forEach(c => memoVals.add(c)); if (typeof t.memo === 'number') memoVals.add(t.memo); });
  const htmlFacts = facts.filter(f => f.t === 'html' && f.method === 'onTalk');
  const clientAligned = !!(cl && cl.steps.length && cl.steps.length - 1 === Math.max(0, ...condVals));
  const steps = [...condVals].sort((a, b) => a - b).map(c => {
    const st = useMemo ? { cond: c, memo: true } : { cond: c };
    if (cl && clientAligned && cl.steps[c]) st.title = cl.steps[c];
    const talkN = new Set(); for (const f of htmlFacts) if (condsOf(f).includes(c)) { const p = /^(\d{5,})-/.exec(f.file); if (p) talkN.add(+p[1]); else f.I.npcs.forEach(n => talkN.add(n)); }
    if (talkN.size) st.talk = [...talkN];
    const lv = T.filter(t => (t.from || []).includes(c)); if (lv.length) st.leave = lv.map(t => T.indexOf(t));
    const dr = DM.filter(d => d.conds.includes(c)); if (dr.length) st.drops = dr.map(d => DM.indexOf(d));
    const sp = spawns.filter(s => s.conds.includes(c)); if (sp.length) st.spawns = sp.map(s => spawns.indexOf(s));
    const reach = T.filter(t => t.to === c); if (reach.length) st.reachedBy = reach.map(t => T.indexOf(t));
    return st;
  });
  steps.unshift({ cond: 0, title: (cl && cl.steps[0]) || 'Talk to ' + reg.start.map(npcName).join(' / ') + ' – accept the quest', talk: reg.start.slice() });

  // ---- rewards
  const isRewardish = (x) => (x.adena != null || x.exp != null || (x.gives || x.items || []).some(g => !isQuestItem(g.id)));
  const rw = (t) => { const r = { trigger: t.trigger }; if (t.from) r.conds = t.from; if (t.adena != null) r.adena = t.adena; if (t.exp != null) { r.exp = t.exp; r.sp = t.sp; }
    const it = (t.gives || t.items || []).filter(g => !isQuestItem(g.id)).map(g => Object.assign({ name: itemName(g.id) }, g)); if (it.length) r.items = it; if ((t.takes || []).length) r.takes = t.takes; if (t.random) r.random = true; return r; };
  const finals = T.filter(t => t.to === 'end' && t.end !== null && isRewardish(t)).map(rw);
  const stepRw = T.filter(t => t.to !== 'end' && isRewardish(t)).map(rw);
  const turnIns = looseActs.filter(a => isRewardish(a) && /talk|event/.test(a.trigger.type)).map(rw);
  const choiceEvents = new Set(finals.flatMap(f => f.trigger.events || []));
  const choices = finals.length > 1 && choiceEvents.size > 1 && new Set(finals.map(f => JSON.stringify(f.items || []))).size > 1;

  // ---- items
  const itemRoles = {};
  const addRole = (iid, role, extra) => { if (typeof iid !== 'number') return; const r = itemRoles[iid] = itemRoles[iid] || { id: iid, roles: new Set(), givenBy: [], takenBy: [] }; r.roles.add(role); if (extra) Object.assign(r, extra); };
  reg.qitems.forEach(i => addRole(i, 'registered'));
  DM.forEach(d => addRole(d.item, 'drop'));
  T.forEach((t, ix) => { (t.gives || []).forEach(g => { addRole(g.id, isQuestItem(g.id) ? 'given' : 'reward'); itemRoles[g.id].givenBy.push(ix); }); (t.takes || []).forEach(g => { addRole(g.id, 'taken'); itemRoles[g.id].takenBy.push(ix); }); });
  looseActs.forEach(a => { (a.items || []).forEach(g => addRole(g.id, isQuestItem(g.id) ? 'given' : 'reward')); (a.takes || []).forEach(g => addRole(g.id, 'taken')); });
  (requirements.items || []).forEach(i => addRole(i.id, 'required'));
  facts.filter(f => f.t === 'count').forEach(f => addRole(f.item, 'counted'));
  const items = Object.values(itemRoles).map(r => { const o = { id: r.id, name: itemName(r.id), icon: itemIcon(r.id), questItem: !!isQuestItem(r.id), roles: [...r.roles] };
    if (limits[r.id]) o.limit = limits[r.id];
    const df = DM.filter(d => d.item === r.id); if (df.length) o.dropsFrom = df.flatMap(d => d.monsters.map(n => ({ npc: n, name: npcName(n), chance: d.chanceByNpc ? d.chanceByNpc[n] : d.chance }))).slice(0, 30);
    if (r.givenBy.length) o.givenBy = [...new Set(r.givenBy)]; if (r.takenBy.length) o.takenBy = [...new Set(r.takenBy)];
    if (!o.questItem && (o.roles.includes('taken') || o.roles.includes('required') || o.roles.includes('counted')) && !o.roles.includes('drop') && !o.roles.includes('given')) { const dd = droppersOf(r.id); if (dd.length) o.normalDrops = dd; }
    return o; });

  // ---- parse quality
  if (!title) reasons.push('no title');
  if (!reg.start.length) reasons.push('no start NPC registered');
  if (level.min === null) reasons.push('minimum level not found');
  if (type === 'unknown') reasons.push('quest type not found (no exitQuest)');
  if (facts.some(f => f.t === 'cond' && f.v === null)) reasons.push('setCond with a runtime value: ' + facts.filter(f => f.t === 'cond' && f.v === null).map(f => f.raw).slice(0, 3).join(' | '));
  if (facts.some(f => f.t === 'memo' && f.v === null)) reasons.push('memo state computed at runtime (bit flags / counters)');
  const condTs = T.filter(t => typeof t.to === 'number' || t.to === 'end');
  if (!condTs.length) reasons.push('no state transitions found');
  if (!facts.some(f => f.t === 'cond') && facts.some(f => f.t === 'memo')) reasons.push('memo-state machine (no setCond): steps listed by memo state');
  // 2026-10-27 (verifier finding 2): setCond AND setMemoState = hidden sub-stages the engine cannot see (61, 65, 418 were "full")
  else if (facts.some(f => f.t === 'memo') && T.some(t => t.to === null || t.to === undefined || (t.fromMemo && t.fromMemo.length && !(t.from || []).length))) reasons.push('memo-state sub-stages besides setCond: ' + facts.filter(f => f.t === 'memo').length + ' setMemoState calls, stages the engine cannot see');
  // a dummy script: no start, no stage, only exitQuest (646)
  if (!facts.some(f => f.t === 'start' || f.t === 'cond' || f.t === 'memo') && facts.some(f => f.t === 'exit')) reasons.push('dummy script: only exits the quest (no start, no stage)');  const maxCond = Math.max(0, ...[...condVals]);
  for (const c of condVals) { if (c === maxCond) continue; if (!T.some(t => (t.from || []).includes(c)) && !DM.some(d => d.conds.includes(c)) && !T.some(t => !t.from && t.trigger.type !== 'talk')) { reasons.push(`cond ${c}: no way forward found`); break; } }
  if (DM.some(d => d.chance === null && !d.chanceByNpc)) reasons.push('drop chance not resolved: ' + DM.filter(d => d.chance === null && !d.chanceByNpc).map(d => d.chanceRaw || itemName(d.item)).slice(0, 3).join(' | '));
  if (reg.kill.length && !DM.length && !kills.length && !T.some(t => t.trigger.type === 'kill')) reasons.push('kill NPCs registered but no drop / kill step parsed');
  const unres = [...env.unresolved].filter(u => !/\(\s*[a-z]\w*(\[\d+\])?\s*\)$/.test(u)); const notes = [...env.unresolved].filter(u => !unres.includes(u));
  if (unres.length) reasons.push('unresolved: ' + unres.slice(0, 3).join(' | '));
  const status = reasons.filter(r => !/^saga template/.test(r)).length ? 'partial' : 'full';

  const q = { id, name: title, className, file: path.relative(DP, javaFile).replace(/\\/g, '/'), type, typeWhy };
  if (endless) q.endless = true;
  if (cl) { q.clientType = cl.type; if (cl.steps.length) q.clientSteps = cl.steps; q.clientStepsMatchConds = clientAligned; }
  q.level = level; if (levelWhy) q.levelWhy = levelWhy;
  q.requirements = requirements; q.description = description; if (acceptText) q.acceptText = acceptText;
  q.startNpcs = startNpcs; q.npcs = npcs; q.monsters = monsters; q.items = items;
  q.steps = steps; q.transitions = T.map(t => compactT(t)); q.drops = DM.map(d => compactD(d)); if (kills.length) q.kills = kills;
  if (spawns.length) q.spawns = spawns.map(s => { const o = { npc: s.npc, name: s.npc ? npcName(s.npc) : null, by: s.by, at: s.at }; if (s.conds.length) o.conds = s.conds; if (s.raw) o.raw = s.raw; if (s.despawnMs) o.despawnMs = s.despawnMs; return o; });
  if (timersU.length) q.timers = timersU;
  if (memoVals.size) q.memoStates = [...memoVals].sort((a, b) => a - b);
  q.rewards = { final: finals }; if (choices) q.rewards.choices = true; if (turnIns.length) q.rewards.turnIns = turnIns; if (stepRw.length) q.rewards.steps = stepRw;
  q.registered = { start: reg.start, talk: reg.talk, kill: reg.kill, attack: reg.attack, spawn: reg.spawn, skill: reg.skill, firstTalk: reg.firstTalk, questItems: reg.qitems };
  for (const k of Object.keys(q.registered)) if (!q.registered[k].length) delete q.registered[k];
  q.parse = { status, reasons: [...new Set(reasons)] }; if (notes.length) q.parse.notes = notes.map(n => 'registration through a local variable: ' + n);
  if (useMemo) q.stepsBy = 'memo';
  return q;
}
function set_(...lists) { const s = new Set(); for (const L of lists) for (const v of (L || [])) s.add(v); return s; }
function compactT(t) { const o = {}; for (const [k, v] of Object.entries(t)) { if (v === null || v === undefined) continue; if (Array.isArray(v) && !v.length) continue; o[k] = v; } return o; }
function compactD(d) { const o = {}; for (const [k, v] of Object.entries(d)) { if (v === null && k !== 'chance') continue; if (v === undefined) continue; if (Array.isArray(v) && !v.length && k !== 'monsters') continue; o[k] = v; } return o; }

// saga quests: substitute the arrays into AbstractSagaQuest.java
let SAGA_SRC = null;
function sagaSource(sub) {
  if (!SAGA_SRC) SAGA_SRC = stripComments(fs.readFileSync(path.join(QDIR, 'AbstractSagaQuest.java'), 'utf8'));
  const s = stripComments(sub); const arr = {};
  const re = /(_\w+)\s*=\s*new\s+[\w.]+\s*\[\s*\]\s*\{/g; let m;
  while ((m = re.exec(s))) { const o = s.indexOf('{', m.index + m[0].length - 1); const e = matchClose(s, o, '{', '}'); arr[m[1]] = splitTop(s.slice(o + 1, e)); }
  let a = SAGA_SRC;
  for (const [k, L] of Object.entries(arr)) {
    a = a.replace(new RegExp(k.replace(/[$]/g, '\\$') + '\\s*\\[\\s*(\\d+)\\s*\\]', 'g'), (m0, i) => L[+i] !== undefined ? L[+i] : m0);
    a = a.replace(new RegExp('\\b' + k + '\\b(?!\\s*\\[)', 'g'), 'new int[] {' + L.join(', ') + '}');
  }
  const sup = (/super\(([^;]*)\);/.exec(s) || [])[0] || '';
  return { src: a, sup, sub: s };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// main
if (IS_MAIN) (function main() {
  const out = {}; const fails = [];
  const dirs = fs.readdirSync(QDIR);
  const files = [];
  for (const d of dirs) { const p = path.join(QDIR, d); if (!fs.statSync(p).isDirectory()) continue;
    if (/^Q\d+_/.test(d)) { const F = folderFiles(p); if (F.java) files.push({ dir: d, java: F.java, htmls: F.htmls }); }
    else { for (const f of fs.readdirSync(p)) if (/^Q\d+_\w+\.java$/.test(f)) files.push({ dir: d + '/' + f.replace(/\.java$/, ''), java: path.join(p, f), htmls: {}, special: d }); }
  }
  for (const F of files) {
    if (ONLY.length && !ONLY.includes(+((/Q(\d+)_/.exec(F.dir) || [])[1]))) continue;
    let q = null; try { q = buildQuest(F.dir, F.java, F.htmls); } catch (e) { fails.push({ dir: F.dir, err: String(e && e.stack || e).split('\n').slice(0, 3).join(' | ') }); }
    if (!q) continue;
    if (F.special) { q.parse.status = 'manual'; q.parse.reasons.unshift(F.special === 'Dummy' ? 'dummy script (tutorial / coupon placeholder)' : 'territory war quest (only during Territory Wars)'); q.special = F.special; }
    if (out[q.id] && !F.special) { /* prefer the real folder */ }
    if (!out[q.id] || !F.special) out[q.id] = q;
  }
  // client-only quests (no script in the datapack)
  for (const [qid, c] of Object.entries(CLIENT)) if (!out[qid]) out[qid] = { id: +qid, name: c.key.replace(/([a-z])([A-Z])/g, '$1 $2'), className: null, type: c.type === 2 ? 'repeatable' : 'unknown', clientType: c.type,
    steps: c.steps.map((t, i) => ({ cond: i, title: t })), startNpcs: [], npcs: (CLIENT_NPCS[qid] || []).map(n => ({ name: n.name, clientPos: n.at })), monsters: [], items: [], transitions: [], drops: [], rewards: { final: [] }, parse: { status: 'manual', reasons: ['no script in the datapack (client data only)'] } };

  // quest_items_h5.json
  const QI = {};
  for (const q of Object.values(out)) for (const it of (q.items || [])) { const r = QI[it.id] = QI[it.id] || { name: it.name, icon: it.icon, questItem: false, quests: [] }; r.questItem = r.questItem || it.questItem;
    r.quests.push(Object.assign({ id: q.id, name: q.name, roles: it.roles }, it.limit ? { limit: it.limit } : {}, it.dropsFrom ? { dropsFrom: it.dropsFrom.slice(0, 12).map(d => ({ npc: d.npc, name: d.name, chance: d.chance })) } : {})); }

  // coverage
  const L = Object.values(out); const cnt = (f) => L.filter(f).length;
  const coverage = { quests: L.length, scripts: cnt(q => q.className), full: cnt(q => q.parse.status === 'full'), partial: cnt(q => q.parse.status === 'partial'), manual: cnt(q => q.parse.status === 'manual'),
    oneTime: cnt(q => q.type === 'one-time'), repeatable: cnt(q => q.type === 'repeatable'), daily: cnt(q => q.type === 'daily'), unknownType: cnt(q => q.type === 'unknown'),
    withDrops: cnt(q => (q.drops || []).length), withSpawns: cnt(q => (q.spawns || []).length), questItems: Object.values(QI).filter(i => i.questItem).length, items: Object.keys(QI).length, errors: fails.length };
  const reasonCount = {}; for (const q of L) for (const r of (q.parse.reasons || [])) { const k = r.replace(/:.*$/, ''); reasonCount[k] = (reasonCount[k] || 0) + 1; }
  coverage.reasons = Object.fromEntries(Object.entries(reasonCount).sort((a, b) => b[1] - a[1]));
  coverage.partialList = L.filter(q => q.parse.status === 'partial').map(q => `${q.id} ${q.name}: ${q.parse.reasons.join('; ')}`);
  coverage.manualList = L.filter(q => q.parse.status === 'manual').map(q => `${q.id} ${q.name}: ${q.parse.reasons.join('; ')}`);
  if (fails.length) coverage.failed = fails;
  const meta = { generated: new Date().toISOString(), tool: 'docs/plan/tools/quest_extract.js', source: 'L2J High Five datapack (github.com/Shagooh/l2j-server-datapack) quest Java + html, npc/item xml; client Data/base.db Quests/QuestNpcs; Scripts/data spawns/field areas/teleports',
    notes: ['Retail datapack values: L2Toggle may change rates, rewards and levels — verify the first run.', 'chance = percent per kill (before server rate multipliers).', 'Schema: see the header of docs/plan/tools/quest_extract.js and docs/plan/quests.md.'],
    coverage };
  const write = (f, o) => { const tmp = f + '.tmp'; if (fs.existsSync(f)) { try { fs.copyFileSync(f, f + '.bak'); } catch (e) { } } fs.writeFileSync(tmp, JSON.stringify(o)); fs.renameSync(tmp, f); };
  if (ONLY.length) { fs.writeFileSync(path.join(require('os').tmpdir(), 'quests_only.json'), JSON.stringify(Object.fromEntries(ONLY.map(i => [i, out[i]])), null, 1)); console.log('fails', JSON.stringify(fails)); console.log('ONLY mode: wrote', path.join(require('os').tmpdir(), 'quests_only.json')); return; }
  write(path.join(DATA, 'quests_h5.json'), { meta, quests: out });
  write(path.join(DATA, 'quest_items_h5.json'), { meta: { generated: meta.generated, tool: meta.tool, count: Object.keys(QI).length, questItems: coverage.questItems }, items: QI });
  const show = Object.assign({}, coverage); delete show.partialList; delete show.manualList; delete show.failed;
  console.log(JSON.stringify(show, null, 1));
  if (fails.length) console.log('FAILED:', fails.slice(0, 10));
})();
module.exports = { walk, takeLabels, parseQuest, interp, buildQuest, splitTernary, ternaryPaths, offerPathRules, classDisplay, readAtom, makeEnv, evalExpr, stripComments };
