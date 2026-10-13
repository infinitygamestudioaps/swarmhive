// DOORS H5 (RAID ROUTES 2026-10-13, owner 15:15: "whether there are doors that must be opened or waited for, or whether a dagger (Unlock skill) is
// needed to open a door, or a key from the grocery store"). One readable record per datapack door: WHERE it is and HOW it opens, with where to get
// what it needs. Built from Scripts/data/nav_doors.json (docs/plan/tools/nav_doors.js: datapack doors.xml + every door script + key skills +
// timers) + the datapack buylists (Scripts/data/dp/buylists: who sells a key) + quest_items_h5.json (who drops a key / which quest gives it) +
// npc_atlas.json (the town of a seller). The route planner (nav_atlas.js) turns a door on a path into a { do: 'door', doorId, need } step; the bots
// run it as DOOR_WAIT / DOOR_OPEN_NPC / DOOR_OPEN_SKILL / DOOR_OPEN_ITEM (swarm.js ROUTESM) and buy Thief Keys first (BUY_KEY) for Unlock.
//   how: open | timer | npc | item | skill | item-or-skill | owner (castle / fortress / clan hall) | instance | script (quest / event / boss
//        script) | hellbound (server-wide Hellbound level) | never (closed, nothing in the datapack opens it)
// Run: node docs/plan/tools/doors_h5.js   -> Scripts/data/doors_h5.json + a summary line
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..'), DATA = path.join(ROOT, 'Scripts', 'data');
const J = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch (e) { return d; } };
const ND = J(path.join(DATA, 'nav_doors.json'), { doors: [] });
const QI = (J(path.join(DATA, 'quest_items_h5.json'), { items: {} }).items) || {};
const ATLAS = (J(path.join(DATA, 'npc_atlas.json'), { npcs: [] }).npcs) || [];
const ITEMN = Object.assign({}, ND.itemNames || {});
try { const it = J(path.join(ROOT, 'Dashboard', 'data', 'items.json'), {}); Object.entries(it).forEach(([k, v]) => { if (!ITEMN[k]) ITEMN[k] = typeof v === 'string' ? v : (v && (v.n || v.name)) || ''; }); } catch (e) { }
// sellers: item id -> [{ npc, name, town, x, y, z, price }]
const npcTown = {}; ATLAS.forEach(n => { if (!npcTown[n.id]) npcTown[n.id] = { town: (n.place && (n.place.town || (n.place.nearTown && n.place.nearTown.name))) || '', x: n.x, y: n.y, z: n.z }; });
const SELL = {};
try {
  const dir = path.join(DATA, 'dp', 'buylists');
  for (const f of fs.readdirSync(dir).filter(f => /\.xml$/.test(f))) {
    const t = fs.readFileSync(path.join(dir, f), 'utf8'), ns = [];
    t.replace(/<npc>(\d+)<\/npc>\s*(?:<!--\s*([^-]*?)\s*-->)?/g, (m, id, nm) => { ns.push({ id: +id, name: (nm || '').trim() }); return m; });
    t.replace(/<item id="(\d+)"(?:\s+price="(\d+)")?[^>]*\/>/g, (m, id, pr) => { (SELL[id] = SELL[id] || []).push(...ns.map(n => Object.assign({ npc: n.id, name: n.name, price: pr ? +pr : null }, npcTown[n.id] || {}))); return m; });
  }
} catch (e) { }
const CLASSN = { 7: 'Rogue', 8: 'Treasure Hunter', 22: 'Elven Scout', 23: 'Plains Walker', 35: 'Assassin', 36: 'Abyss Walker', 93: 'Adventurer', 101: 'Wind Rider', 108: 'Ghost Hunter' };
function itemSource(id) {
  const out = { id, name: ITEMN[id] || '' };
  const s = (SELL[id] || []); if (s.length) out.sold = s.slice(0, 12).map(x => ({ npc: x.npc, name: x.name, town: x.town || '', price: x.price }));
  const q = QI[id]; if (q) { out.name = out.name || q.name; const drops = [], quests = []; (q.quests || []).forEach(qq => { (qq.dropsFrom || []).forEach(d => drops.push({ npc: d.npc, name: d.name, chance: d.chance, quest: qq.id })); if ((qq.roles || []).some(r => /reward|given/.test(r))) quests.push({ id: qq.id, name: qq.name }); }); if (drops.length) out.drops = drops.slice(0, 8); if (quests.length) out.quests = quests.slice(0, 6); }
  return out;
}
function howOf(d) {
  if (!d.blocks || d.kind === 'open' || d.defaultOpen) return 'open';
  if (d.timed) return d.unlock ? 'timer' : 'timer';
  if (d.npcOpen && d.npcOpen.length) return 'npc';
  if (d.hellboundLevel || d.kind === 'hellbound') return 'hellbound';
  if (d.keys && d.keys.length) return d.unlock ? 'item-or-skill' : (d.instances && d.instances.length ? 'instance' : 'item');
  if (d.unlock) return 'skill';
  if (d.clanhallId || ['castle', 'fortress', 'clanhall', 'click'].includes(d.kind)) return 'owner';
  if (d.kind === 'instance' || (d.instances && d.instances.length && !d.scripts)) return 'instance';
  if (d.scripts && d.scripts.length) return 'script';
  return 'never';
}
const doors = ND.doors.map(d => {
  const how = howOf(d);
  const o = { id: d.id, name: d.name, x: d.x, y: d.y, z: d.z, poly: d.poly, zMin: d.zMin, zMax: d.zMax, defaultOpen: !!d.defaultOpen || !d.blocks, how,
    place: d.place || null, area: d.area || null, travel: d.travel !== false };
  if (d.timed) o.timer = { openSec: d.timed.openFor, closedSec: d.timed.closedFor, randomSec: d.timed.random, maxWaitSec: d.timed.maxWait, rule: d.timed.rule };
  if (d.npcOpen && d.npcOpen.length) o.npc = d.npcOpen.map(n => ({ id: n.npcId, name: n.npc, x: n.x, y: n.y, z: n.z })).concat([]), o.npcLink = d.npcLink || null, o.npcItems = (d.npcItems || []).map(itemSource), o.closesAfterSec = d.closesAfterSec || d.autoCloseSec || null;
  if (d.keys && d.keys.length) o.items = d.keys.filter(k => k.itemId).map(k => Object.assign(itemSource(k.itemId), { skill: k.skill || null, consumed: !!k.consumed, noEffect: (ND.keySkills || []).some(x => x.skillId === k.skillId && x.noEffect) || undefined }));
  if (d.unlock) o.skill = { id: 27, name: 'Unlock', classes: (d.unlock.classIds || []).map(c => CLASSN[c] || String(c)), classIds: d.unlock.classIds, minCharLevel: 20, chanceBySkillLevel: d.unlock.chanceByLevel, sureFromSkillLevel: d.unlock.sureFromSkillLevel, consumes: itemSource(1661), note: 'Unlock 27 (dagger classes): skill level 1-3 can fail (30/50/75 %), from level 4 (char level 32 Rogue / Elven Scout / Assassin) it always works; it uses Thief Keys (1661) sold by every grocer' };
  if (how === 'owner') o.owner = d.clanhallId ? `clan hall ${d.clanhallId}` : d.kind;
  if (d.instances && d.instances.length) o.instances = d.instances;
  if (d.scripts && d.scripts.length) o.scripts = d.scripts.map(s => ({ file: String(s.file).split('/').pop(), op: s.op, event: s.event || undefined, npc: s.npc || undefined, npcId: s.npcId || undefined }));
  if (d.hellboundLevel) o.hellboundLevel = d.hellboundLevel;
  if (d.note) o.note = d.note;
  if (d.noOpenerWhy) o.why = d.noOpenerWhy;
  return o;
});
const byHow = {}; doors.forEach(d => { byHow[d.how] = (byHow[d.how] || 0) + 1; });
const out = { generated: new Date().toISOString(), tool: 'docs/plan/tools/doors_h5.js', source: 'Scripts/data/nav_doors.json (datapack doors.xml + door scripts + key skills + timers), dp/buylists, quest_items_h5.json, npc_atlas.json',
  howMeaning: { open: 'open by default (or no collision): walk through', timer: 'opens and closes by itself (L2DoorInstance.TimerOpen): wait for the open phase', npc: 'an NPC opens it (talk / a link; some want an item)', item: 'a key item opens it (use the item on the door)', skill: 'Unlock 27 (dagger classes) opens it', 'item-or-skill': 'a key item or Unlock', owner: 'castle / fortress / clan hall owner only', instance: 'inside an instance (opened by the instance script / its own key)', script: 'a quest / event / boss script opens it (not by us)', hellbound: 'the server-wide Hellbound level opens it', never: 'closed and nothing in the datapack opens it' },
  thiefKey: itemSource(1661), counts: byHow, doors };
const f = path.join(DATA, 'doors_h5.json'), t = f + '.tmp' + process.pid; fs.writeFileSync(t, JSON.stringify(out)); fs.renameSync(t, f);
console.log(`doors_h5.json: ${doors.length} doors ${JSON.stringify(byHow)}; Thief Key sold by ${(out.thiefKey.sold || []).length}+ grocers`);
