// BOSS SCENE (owner 2026-10-17: "this 3D render under raid bosses so I can see all raid bosses and their minions where they are, with attack
// range, skills etc."; "select Core -> render Core in its throne room with all its minions"). /api/view3d/scene?boss=<npc id> ->
// { center, boss: { id, name, level, x, y, z, aggroRange, aggressive, atkRange, radius, height, skills[], respawn }, minions[], room[] }
//   minions = the boss's own guards: the grand boss script layouts (L2J datapack ai/individual, Scripts/data/dp/bossai) or the NPC data's
//             <minions> (placed in a ring around the boss); room = every datapack spawn within 2500 and 600 height of the boss
'use strict';
const fs = require('fs'), path = require('path');
const C = { stats: {}, npcs: null, spawns: null, bosses: null };
function readJson(f, d) { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch (e) { return d; } }
/** the <npc id="..."> block of Scripts/data/npcstats/<range>.xml */
function npcBlock(DATA, id) {
  if (C.stats[id] !== undefined) return C.stats[id];
  const lo = Math.floor(id / 100) * 100, f = path.join(DATA, 'npcstats', `${String(lo).padStart(5, '0')}-${String(lo + 99).padStart(5, '0')}.xml`);
  let x = ''; try { x = fs.readFileSync(f, 'utf8'); } catch (e) { }
  const i = x.indexOf(`<npc id="${id}"`); const blk = i < 0 ? '' : x.slice(i, x.indexOf('</npc>', i) + 6);
  return (C.stats[id] = blk);
}
function stats(DATA, id) {
  const b = npcBlock(DATA, id), a = (re) => { const m = b.match(re); return m ? m[1] : null; };
  const skills = []; (b.match(/<skill id="\d+" level="\d+"\s*\/>\s*<!--[^>]*-->/g) || []).forEach(s => { const m = s.match(/id="(\d+)" level="(\d+)"\s*\/>\s*<!--\s*([^-]*?)\s*-->/); if (m) skills.push({ id: +m[1], level: +m[2], name: m[3] }); });
  const minions = []; const mb = (b.match(/<minions[^>]*>([\s\S]*?)<\/minions>/) || [])[1] || '';
  (mb.match(/<npc id="\d+" count="\d+"[^>]*>(\s*<!--[^>]*-->)?/g) || []).forEach(s => { const m = s.match(/id="(\d+)" count="(\d+)"[^>]*>\s*(?:<!--\s*([^-]*?)\s*-->)?/); if (m) minions.push({ id: +m[1], count: +m[2], name: m[3] || '' }); });
  return { aggroRange: +a(/aggroRange="(\d+)"/) || 0, aggressive: a(/isAggressive="(\w+)"/) === 'true', atkRange: +a(/<attack [^>]*range="(\d+)"/) || 40,
    radius: +a(/<radius normal="([\d.]+)"/) || 0, height: +a(/<height normal="([\d.]+)"/) || 0, level: +a(/level="(\d+)"/) || 0, name: a(/name="([^"]+)"/) || '', skills, minions };
}
/** grand boss guard layouts from their scripts (L2J High Five: Core.java spawnBoss, QueenAnt.java larva) */
function scriptMinions(id, boss) {
  const out = [], z = boss.z;
  if (id === 29006) {   // Core: 5 x (2 Death Knights + 1 Doom Wraith), 4 Susceptors
    for (let i = 0; i < 5; i++) { const x = 16800 + i * 360; out.push({ id: 29007, x, y: 110000, z }, { id: 29007, x, y: 109000, z }, { id: 29008, x: 16800 + i * 600, y: 109300, z }); }
    for (let i = 0; i < 4; i++) out.push({ id: 29011, x: 16800 + i * 450, y: 110300, z });
  }
  if (id === 29001) out.push({ id: 29002, x: -21600, y: 179482, z: -5846 });   // Queen Ant's larva
  // EPICS (owner 2026-10-17: "Antharas has mini Antharas minions"; "the minion layouts of the other epic bosses' scripts")
  if (id === 29068) {   // Antharas.java: Behemoth Dragons + Tarask Dragons in pairs next to him through the fight, Dragon Bombers
    const ring = (n, r, idd, off) => { for (let i = 0; i < n; i++) { const a = off + (i / n) * Math.PI * 2; out.push({ id: idd, x: Math.round(boss.x + Math.cos(a) * r), y: Math.round(boss.y + Math.sin(a) * r), z: boss.z }); } };
    ring(3, 900, 29069, 0); ring(3, 900, 29190, Math.PI / 3); ring(2, 1400, 29070, Math.PI / 4);
  }
  if (id === 29020) [[115792, 16608], [115168, 17200], [115780, 15564], [114880, 16236], [114239, 17168]].forEach(([x, y]) => out.push({ id: 29021, x, y, z: 10136 }));   // Baium.java ARCHANGEL_LOC
  if (id === 29045) {   // FinalEmperialTomb.java: Scarlet van Halisha, 4 portraits (29048 / 29049) with a demon each (29050 / 29051)
    out.push({ id: 29046, x: -87789, y: -153295, z: -9176 });
    [[29048, -89381, -153981, -89378, -153968], [29048, -86234, -152467, -86261, -152492], [29049, -89342, -152479, -89311, -152491], [29049, -86189, -153968, -86217, -153956]]
      .forEach(([p, x, y, dx, dy]) => { out.push({ id: p, x, y, z: -9168 }, { id: p + 2, x: dx + Math.round((-87780 - dx) * 0.15), y: dy + Math.round((-153300 - dy) * 0.15), z: -9168 }); });
  }
  return out;
}
/** bosses that live in instances have no spawn point in the boss list: their scripts' (Frintezza) or classic (Zaken's ship) positions */
// the boss's heading from its script (L2 heading units, 65536 = a full turn; Baium sleeps facing into his room)
const BOSS_HEADING = { 29020: -25348, 29045: 16384, 29046: 16384 };
const BOSS_POS = { 29045: { x: -87780, y: -155086, z: -9080, zone: 'Final Imperial Tomb (instance)' }, 29022: { x: 55312, y: 219168, z: -3223, zone: "Zaken's ship, Devil's Isle (no guard script in the datapack)" } };
function scene(ctx, bossId) {
  const DATA = ctx.DATA;
  if (!C.bosses) { const d = readJson(path.join(DATA, 'raidbosses_h5.json'), { bosses: [] }); C.bosses = d.bosses || d; }
  if (!C.npcs) C.npcs = readJson(path.join(DATA, 'npcs_h5.json'), {});
  if (!C.spawns) { const d = readJson(path.join(DATA, 'spawns_h5.json'), []); C.spawns = Array.isArray(d) ? d : (d.spawns || []); }
  const b0 = C.bosses.find(x => +x.id === +bossId); if (!b0) return { error: 'unknown boss ' + bossId };
  const b = b0.x == null && BOSS_POS[+b0.id] ? Object.assign({}, b0, BOSS_POS[+b0.id], { zoneName: BOSS_POS[+b0.id].zone }) : b0;
  if (b.x == null) return { error: b0.name + ' has no known position (an instance boss)' };
  const st = stats(DATA, +b.id);
  const npc = (id) => C.npcs[id] || C.npcs[String(id)] || {};
  const boss = { heading: BOSS_HEADING[+b.id] != null ? BOSS_HEADING[+b.id] : null, id: +b.id, name: b.name, level: b.level, type: b.type, x: b.x, y: b.y, z: b.z, zone: b.zoneName || '', respawn: b.respawnMinH ? `${b.respawnMinH}-${b.respawnMaxH} h` : '',
    aggroRange: st.aggroRange, aggressive: st.aggressive, atkRange: st.atkRange, radius: st.radius, height: st.height, skills: st.skills, hp: b.hp };
  let minions = scriptMinions(+b.id, b).map(m => ({ ...m, name: npc(m.id).n || '', lvl: npc(m.id).l || 0 }));
  if (!minions.length && st.minions.length) {
    const all = []; st.minions.forEach(m => { for (let k = 0; k < m.count; k++) all.push(m); });
    all.forEach((m, i) => { const a = (i / all.length) * Math.PI * 2, r = Math.max(180, (st.radius || 40) * 2 + 120); minions.push({ id: m.id, name: m.name || npc(m.id).n || '', lvl: npc(m.id).l || 0, x: Math.round(b.x + Math.cos(a) * r), y: Math.round(b.y + Math.sin(a) * r), z: b.z }); });
  }
  const room = C.spawns.filter(s => s.id !== +b.id && Math.hypot(s.x - b.x, s.y - b.y) < 2500 && Math.abs(s.z - b.z) < 600)
    .map(s => { const n = npc(s.id); return { id: s.id, name: s.name || n.n || '', lvl: n.l || 0, x: s.x, y: s.y, z: s.z, aggressive: (n.ag || 0) > 0 && /Monster/.test(n.ty || '') }; });
  return { center: { x: b.x, y: b.y, z: b.z }, boss, minions, room };
}
module.exports = { scene, stats };
