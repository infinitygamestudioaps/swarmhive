// Builds Scripts/data/raidbosses_h5.json and docs/plan/raidbosses.md (High Five raid/grand bosses).
const __ROOT = require('path').resolve(__dirname, '..', '..', '..').replace(/\\/g, '/');   // install folder (portable, 2026-10-07)
// Sources: datapack raidboss_spawnlist.sql + grandboss_data.sql + grandboss.properties (Scripts/data/dp/sys),
// npc XML (Scripts/data/npcstats), npcs_h5.json, teleports_h5.json, map_regions.json.
// Run: node raidbosses.js
const fs = require('fs');
const D = __ROOT + '/Scripts/data';
const read = (f) => fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, '');
const npcs = JSON.parse(read(`${D}/npcs_h5.json`));
const teleports = JSON.parse(read(`${D}/teleports_h5.json`));
const regions = JSON.parse(read(`${D}/map_regions.json`));

// --- spawns -----------------------------------------------------------------
const spawns = [];
for (const m of read(`${D}/dp/sys/raidboss_spawnlist.sql`).matchAll(/^\((\d+),(-?\d+),(-?\d+),(-?\d+),-?\d+,(\d+),(\d+),[^)]*\)/gm)) {
  const delay = +m[5], rnd = +m[6];
  spawns.push({ id: +m[1], x: +m[2], y: +m[3], z: +m[4], respawnMinH: Math.max(0, (delay - rnd) / 3600), respawnMaxH: (delay + rnd) / 3600, kind: 'raid' });
}
const gbProps = {};
for (const m of read(`${D}/dp/sys/grandboss.properties`).matchAll(/^\s*(\w+)\s*=\s*(\S+)/gm)) gbProps[m[1]] = +m[2];
const gbRule = {
  29001: ['QueenAnt'], 29006: ['Core'], 29014: ['Orfen'], 29020: ['Baium'],
  29028: ['Valakas'], 29068: ['Antharas'], 29118: ['Beleth'],
};
for (const m of read(`${D}/dp/sys/grandboss_data.sql`).matchAll(/^\((\d+),\s*(-?\d+),\s*(-?\d+),\s*(-?\d+),/gm)) {
  const id = +m[1], key = (gbRule[id] || [''])[0];
  const iv = gbProps[`IntervalOf${key}Spawn`], rd = gbProps[`RandomOf${key}Spawn`];
  spawns.push({ id, x: +m[2], y: +m[3], z: +m[4], respawnMinH: iv ?? null, respawnMaxH: iv != null ? iv + (rd || 0) : null, kind: 'grand' });
}
// Instance epics (no world spawn) — entry rules from L2J H5 instance scripts (summary).
const instanceEpics = [
  { id: 29022, name: 'Zaken', note: 'Instance (Pirate Ship, Devil\'s Isle). Day Zaken lvl 60 (party 9-18, reuse daily-ish), Nightmare Zaken lvl 83 (CC 18-27). Entry via Pathfinder Worker / Zaken quest at Devil\'s Isle.' },
  { id: 29045, name: 'Frintezza', note: 'Instance Last Imperial Tomb, CC 36-45, lvl 80+, needs Frintezza\'s Magic Force Field Removal Scroll (Imperial Tomb Guide). Reuse ~2 days.' },
  { id: 29179, name: 'Freya', note: 'Instance Ice Queen\'s Castle (Jinia/Kegor quests), easy 82+ party / hard CC. Weekly-ish reuse.' },
  { id: 29163, name: 'Tiat', note: 'Seed of Destruction instance, CC, lvl 80+.' },
  { id: 29150, name: 'Ekimus', note: 'Seed of Infinity (Hall of Suffering/Erosion), lvl 75-82 parties.' },
];

// --- npc xml ------------------------------------------------------------------
const npcXml = {};
for (const f of fs.readdirSync(`${D}/npcstats`)) {
  const txt = read(`${D}/npcstats/${f}`);
  for (const m of txt.matchAll(/<npc id="(\d+)"[\s\S]*?<\/npc>/g)) npcXml[m[1]] = m[0];
}
const num = (re, s) => { const m = re.exec(s); return m ? +m[1] : null; };
function parseNpc(id) {
  const x = npcXml[id] || '';
  const minions = [...x.matchAll(/<npc id="(\d+)" count="(\d+)"[^>]*\/>/g)].map(m => `${(npcs[m[1]] || {}).n || m[1]} x${m[2]}`);
  const skills = [...new Set([...x.matchAll(/<skill [^>]*\/>\s*<!--\s*(.+?)\s*-->/g)].map(m => m[1].trim()))]
    .filter(s => !/^Raid Boss/i.test(s) && /BOSS|Stun|Paraly|Sleep|Hold|Root|Poison|Bleed|Silence|Fear|Range|Strike|Blast|Cancel|Petrif|Curse|Drain/i.test(s));
  const drops = [...x.matchAll(/<item id="(\d+)" min="(\d+)" max="(\d+)" chance="([\d.]+)" \/>\s*<!--\s*(.+?)\s*-->/g)]
    .map(m => ({ id: +m[1], name: m[5].trim(), min: +m[2], max: +m[3], chance: +m[4] }));
  const isNotable = (n) => /Ring|Earring|Necklace|Life Stone|Recipe|Enchant|Soul Crystal|Codex|Blessed|Giant|Elixir|Dynasty|Vesper|Icarus|Moirai|Tallum|Nightmare|Majestic|Dark Crystal|Imperial|Draconic|Arcana|Major Arcana|Blue Wolf|Avadon|Doom|Zubei|Karmian|Mithril|Sage|Tome|Gemstone|Crystal: |Attribute|Fire Stone|Water Stone|Earth Stone|Wind Stone|Holy Stone|Dark Stone/i.test(n);
  const notable = [...new Set(drops.filter(d => isNotable(d.name) && !/Material|Page|Fragment|Piece/i.test(d.name)).map(d => d.name))].slice(0, 12);
  return {
    hp: Math.round(num(/<vitals hp="([\d.]+)"/, x) || 0), pdef: Math.round(num(/defence physical="([\d.]+)"/, x) || 0),
    mdef: Math.round(num(/defence physical="[\d.]+" magical="([\d.]+)"/, x) || 0), patk: Math.round(num(/attack physical="([\d.]+)"/, x) || 0),
    aggressive: /isAggressive="true"/.test(x), raidPoints: num(/raidPoints="(\d+)"/, x), minions, skills, notable, title: (/title="([^"]*)"/.exec(x) || [])[1] || '',
  };
}

// --- teleports / zones ----------------------------------------------------
const okTp = teleports.filter(t => t.desc && t.desc.includes('->') && !/clan hall|castle|fortress|olympiad|noble|adena|token/i.test(t.desc));
function nearestTp(b) {
  let best = null, bd = Infinity;
  for (const t of okTp) { const d = Math.hypot(t.x - b.x, t.y - b.y); if (d < bd) { bd = d; best = t; } }
  if (!best) return null;
  const [from, to] = best.desc.split('->').map(s => s.trim());
  return { from, to, desc: best.desc, x: best.x, y: best.y, z: best.z, price: best.price, walkDist: Math.round(bd) };
}
function zoneOf(b) {
  const tx = Math.floor(b.x / 32768) + 20, ty = Math.floor(b.y / 32768) + 18;
  const r = regions.filter(r => r.tx === tx && r.ty === ty && r.name && b.z >= r.zmin && b.z <= r.zmax);
  return (r[0] || regions.find(r => r.tx === tx && r.ty === ty && r.name) || {}).name || '';
}

// --- build ------------------------------------------------------------------------
const out = [];
for (const s of spawns) {
  const n = npcs[s.id] || {};
  const p = parseNpc(s.id);
  const level = n.l || 0;
  const type = s.kind === 'grand' ? (level >= 75 ? 'epic' : 'grand') : 'raid';
  const tp = nearestTp(s);
  const danger = [];
  if (p.aggressive) danger.push('aggressive');
  if (p.minions.length) danger.push(`minions: ${p.minions.join(', ')}`);
  if (p.skills.length) danger.push(`skills: ${p.skills.slice(0, 6).join(', ')}`);
  if (s.z < -8000) danger.push('deep underground/underwater area');
  if (type !== 'raid') danger.push('grand boss: zone rules, big party/CC');
  danger.push(`raid curse if a player is >8 levels above the boss (keep the party <= ${level + 8})`);
  out.push({
    id: s.id, name: n.n || `npc ${s.id}`, title: p.title, level, type, hp: p.hp || n.hp || 0, pdef: p.pdef, mdef: p.mdef, patk: p.patk,
    x: s.x, y: s.y, z: s.z, zoneName: zoneOf(s),
    respawnMinH: s.respawnMinH, respawnMaxH: s.respawnMaxH,
    nearestTeleport: tp, minions: p.minions, notableDrops: p.notable, dangerNotes: danger.join('; '),
    recommendedPartyLevel: { min: Math.max(1, level - 3), max: level + 8 },
    recommendedFor9Man: type === 'raid' && (p.hp || 0) < 3000000 && s.z > -8000,
    raidPoints: p.raidPoints,
  });
}
out.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
for (const e of instanceEpics) {
  const n = npcs[e.id] || {};
  out.push({ id: e.id, name: n.n || e.name, level: n.l || 0, type: 'epic', hp: n.hp || 0, x: null, y: null, z: null, zoneName: 'instance',
    respawnMinH: null, respawnMaxH: null, nearestTeleport: null, minions: [], notableDrops: [], dangerNotes: e.note,
    recommendedPartyLevel: { min: n.l || 0, max: (n.l || 0) + 8 }, recommendedFor9Man: false, instance: true });
}

// --- per band ranking ----------------------------------------------------------
const valueOf = (b) => b.notableDrops.reduce((s, d) => s + (/Ring|Earring|Necklace/i.test(d) ? 4 : /Life Stone|Enchant|Soul Crystal|Recipe/i.test(d) ? 3 : 2), 0);
const bands = [
  { name: 'Now (team 18-20)', team: 20, lo: 20, hi: 28 },
  { name: 'Level ~40', team: 40, lo: 38, hi: 46 },
  { name: 'Level ~60', team: 60, lo: 57, hi: 66 },
  { name: 'Level 76+', team: 78, lo: 74, hi: 85 },
];
const ranking = {};
for (const band of bands) {
  ranking[band.name] = out.filter(b => b.type === 'raid' && b.recommendedFor9Man && b.level >= band.lo && b.level <= band.hi && b.nearestTeleport)
    .map(b => ({ b, score: valueOf(b) * 2 - Math.abs(b.level - band.team - 3) - b.nearestTeleport.walkDist / 2500 - (b.minions.length ? 1 : 0) }))
    .sort((a, c) => c.score - a.score).slice(0, 8).map(x => ({ id: x.b.id, name: x.b.name, level: x.b.level, score: Math.round(x.score * 10) / 10 }));
}

// USER LEVEL CORRECTIONS (2026-10-10: Core is level 40 on L2Toggle, the datapack says 50): an entry with levelNote keeps its level,
// curseLevel, zoneLevelCap and datapackLevel when the list is rebuilt
try {
  const old = JSON.parse(fs.readFileSync(`${D}/raidbosses_h5.json`, 'utf8').replace(/^﻿/, ''));
  (old.bosses || []).filter(o => o && o.levelNote).forEach(o => { const b = out.find(x => x.id === o.id); if (!b) return;
    b.datapackLevel = b.level; ['level', 'curseLevel', 'zoneLevelCap', 'levelNote'].forEach(k => { if (o[k] !== undefined) b[k] = o[k]; }); });
} catch (e) { }
fs.writeFileSync(`${D}/raidbosses_h5.json`, JSON.stringify({
  generated: new Date().toISOString(),
  note: 'L2J High Five datapack defaults (respawn = respawn_delay +/- respawn_random; grand boss = interval + 0..random from grandboss.properties). L2Toggle may differ. Live status must come from in-game observation.',
  bosses: out, ranking,
}, null, 1));

// --- markdown ---------------------------------------------------------------------
const fmt = (h) => h == null ? '?' : (Number.isInteger(h) ? `${h}` : h.toFixed(1));
const tpTxt = (t) => t ? `${t.desc} (${t.price}a), walk ${t.walkDist}` : '—';
let md = `# Raid bosses (High Five)\n\nGenerated ${new Date().toISOString().slice(0, 10)} by \`docs/plan/tools/raidbosses.js\` from the L2J H5 datapack.\n` +
  `Data: \`Scripts/data/raidbosses_h5.json\` (${out.length} entries: ${out.filter(b => b.type === 'raid').length} raid, ${out.filter(b => b.type !== 'raid').length} grand/epic).\n\n` +
  `- **Respawn** = datapack defaults: raid bosses respawn_delay ± respawn_random (usually 12–60 h); grand bosses interval + 0..random. L2Toggle may use other values.\n` +
  `- **Live status** (spawned/alive) is not in the datapack: the dashboard must learn it from what the bots see (boss in view = alive; killed time → next window).\n` +
  `- **Raid curse:** a player more than 8 levels above the boss gets silenced/paralysed. Keep the party at or below boss level + 8.\n\n`;
md += `## Good first targets per level band (9-man party, board buffs)\n\n`;
for (const [band, list] of Object.entries(ranking)) {
  md += `### ${band}\n\n| # | Boss | Lvl | Where | Teleport | Notable drops |\n|---|---|---|---|---|---|\n`;
  list.forEach((r, i) => { const b = out.find(x => x.id === r.id); md += `| ${i + 1} | ${b.name} (${b.id}) | ${b.level} | ${b.zoneName} (${b.x},${b.y},${b.z}) | ${tpTxt(b.nearestTeleport)} | ${b.notableDrops.slice(0, 5).join(', ') || '—'} |\n`; });
  md += '\n';
}
md += `## Grand / epic bosses\n\n| Boss | Lvl | Where | Respawn (h) | Notes |\n|---|---|---|---|---|\n`;
out.filter(b => b.type !== 'raid').forEach(b => { md += `| ${b.name} (${b.id}) | ${b.level} | ${b.instance ? 'instance' : `${b.zoneName} (${b.x},${b.y},${b.z})`} | ${fmt(b.respawnMinH)}–${fmt(b.respawnMaxH)} | ${b.dangerNotes} |\n`; });
md += `\n## All raid bosses\n\n| Boss | Lvl | HP | Zone | Coords | Respawn (h) | Nearest teleport | Minions | Notable drops | 9-man |\n|---|---|---|---|---|---|---|---|---|---|\n`;
out.filter(b => b.type === 'raid').forEach(b => {
  md += `| ${b.name} (${b.id}) | ${b.level} | ${b.hp.toLocaleString('en')} | ${b.zoneName} | ${b.x},${b.y},${b.z} | ${fmt(b.respawnMinH)}–${fmt(b.respawnMaxH)} | ${tpTxt(b.nearestTeleport)} | ${b.minions.join(', ') || '—'} | ${b.notableDrops.slice(0, 6).join(', ') || '—'} | ${b.recommendedFor9Man ? 'yes' : 'no'} |\n`;
});
fs.writeFileSync(__ROOT + '/docs/plan/raidbosses.md', md);
console.log(`bosses: ${out.length}`);
for (const [band, list] of Object.entries(ranking)) console.log(band, '->', list.map(r => `${r.name}(${r.level})`).join(', '));
