// Builds the gatekeeper catalog: every gatekeeper (position, town) + what it can teleport to.
const __ROOT = require('path').resolve(__dirname, '..', '..', '..').replace(/\\/g, '/');   // install folder (portable, 2026-10-07)
// Sources: L2J datapack (teleporter_ids, spawns, teleports "From -> To") + the live menus the bots have seen
// (Scripts/data/gk_live/*.json and "Links:" lines in Logs/swarm_buffs.log).
// Output: Scripts/data/gatekeepers_h5.json + docs/plan/gatekeepers.md     Run: node docs/plan/tools/gatekeepers.js
const fs = require('fs'), path = require('path');
const ROOT = __ROOT + '', D = ROOT + '/Scripts/data';
const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, ''));
const ids = new Set(J(D + '/teleporter_ids.json').map(Number));
const npcs = J(D + '/npcs_h5.json');
const npcName = (id) => { const n = Array.isArray(npcs) ? npcs.find(x => x.id === id) : npcs[id]; return n ? (n.name || n.n) : null; };
const npcTitle = (id) => { const n = Array.isArray(npcs) ? npcs.find(x => x.id === id) : npcs[id]; return n ? (n.title || n.t || '') : ''; };
const spawns = J(D + '/spawns_npc_h5.json').filter(s => ids.has(Number(s.id)));
const tps = J(D + '/teleports_h5.json').filter(e => String(e.desc || '').includes('->'));

// towns: landing coordinates of "X -> <town>" entries
const TOWN_NAMES = { 'Town of Gludio': 'Gludio', 'Gludin': 'Gludin', 'Gludin Village': 'Gludin', 'Elven Village': 'Elven Village', 'DE Village': 'Dark Elf Village',
  'Dark Elf Village': 'Dark Elf Village', 'Dwarven village': 'Dwarven Village', 'Dwarven Village': 'Dwarven Village', 'Orc village': 'Orc Village', 'Orc Village': 'Orc Village',
  'TI Village': 'Talking Island', 'Talking Island': 'Talking Island', 'Kamael Village': 'Kamael Village', 'Town of Dion': 'Dion', 'Town of Giran': 'Giran', 'Town of Oren': 'Oren',
  'Town of Aden': 'Aden', 'Hunters Village': 'Hunters Village', 'Heine': 'Heine', 'Town of Goddard': 'Goddard', 'Rune Township': 'Rune', 'Town of Schuttgart': 'Schuttgart' };
const FROM_TO_TOWN = { 'Gludio': 'Gludio', 'Gludin': 'Gludin', 'Elven Village': 'Elven Village', 'DE Village': 'Dark Elf Village', 'Dark Elf Village': 'Dark Elf Village',
  'Dwarven Village': 'Dwarven Village', 'Orc Village': 'Orc Village', 'TI': 'Talking Island', 'Talking Island': 'Talking Island', 'Talking Village': 'Talking Island',
  'Kamael Vilage': 'Kamael Village', 'Dion': 'Dion', 'Giran': 'Giran', 'Oren': 'Oren', 'Aden': 'Aden', 'Town of Aden': 'Aden', 'Hunters': 'Hunters Village', 'Heine': 'Heine',
  'Goddard': 'Goddard', 'Rune Township': 'Rune', 'Rune': 'Rune', 'Schuttgart': 'Schuttgart' };
const townPos = {};
tps.forEach(e => { const to = e.desc.split('->')[1].trim(); const t = TOWN_NAMES[to]; if (t && !townPos[t]) townPos[t] = { x: e.x, y: e.y }; });
const townOf = (x, y) => { let b = null, bd = 9000; for (const [t, p] of Object.entries(townPos)) { const d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; b = t; } } return b; };
const dests = {};   // town -> [{to, x, y, price}]
tps.forEach(e => { const [a, b] = e.desc.split('->').map(s => s.trim()); const t = FROM_TO_TOWN[a]; if (!t) return; (dests[t] = dests[t] || []).push({ to: b, x: e.x, y: e.y, z: e.z, price: e.price }); });

// live menus
const live = {};
try { fs.readdirSync(D + '/gk_live').forEach(f => { const j = J(D + '/gk_live/' + f); live[j.name] = new Set(Object.values(j.pages || {}).flat()); }); } catch (e) { }
try {
  fs.readFileSync(ROOT + '/Logs/swarm_buffs.log', 'utf8').split(/\r?\n/).forEach(l => {
    const m = l.match(/(?:fandt ikke|did not find) '.*?' (?:hos|at) ([^.]+)\. Links: (.*)$/); if (!m) return;
    const set = live[m[1].trim()] = live[m[1].trim()] || new Set();
    m[2].split(' | ').map(s => s.trim()).filter(s => s && !/\.\.\.$/.test(s)).forEach(s => set.add(s));
  });
} catch (e) { }

const out = spawns.map(s => {
  const name = npcName(Number(s.id)) || s.name;
  const town = townOf(s.x, s.y);
  return { npcId: Number(s.id), name, title: npcTitle(Number(s.id)), x: s.x, y: s.y, z: s.z, town,
    datapackDestinations: town ? (dests[town] || []).map(d => d.to) : [], liveMenu: live[name] ? [...live[name]] : null };
}).sort((a, b) => String(a.town || 'zzz').localeCompare(String(b.town || 'zzz')) || a.name.localeCompare(b.name));
fs.writeFileSync(D + '/gatekeepers_h5.json', JSON.stringify({ built: new Date().toISOString(), towns: townPos, gatekeepers: out, destinationsByTown: dests }, null, 1));

let md = `# Gatekeepers — where they stand and where they teleport to (H5 / L2Toggle)\n\nBuilt ${new Date().toISOString()} by \`docs/plan/tools/gatekeepers.js\`.\n` +
  `Sources: L2J datapack (positions, \`From -> To\` links) + **live menus** the bots have seen on L2Toggle (✔ = verified on the server).\n` +
  `Menu texts on L2Toggle are e.g. "The Town of Gludio", "The Elven Village", "The Dark Elf Village", "Talking Island Village".\n` +
  `The bots save each gatekeeper's live menu to \`Scripts/data/gk_live/<name>.json\` automatically; rerun this tool to update the list.\n\n`;
md += `## Town gatekeepers\n\n| Town | Gatekeeper | Position (x, y, z) | Datapack destinations | Live menu (L2Toggle) |\n|---|---|---|---|---|\n`;
out.filter(g => g.town).forEach(g => {
  md += `| ${g.town} | ${g.name}${g.title ? ' (' + g.title + ')' : ''} | ${g.x}, ${g.y}, ${g.z} | ${g.datapackDestinations.join(', ')} | ${g.liveMenu ? '✔ ' + g.liveMenu.join(', ') : '—'} |\n`;
});
md += `\n## Destination coordinates per town\n\n`;
Object.entries(dests).sort().forEach(([t, list]) => {
  md += `### ${t}\n| Destination | Lands at (x, y, z) | Price |\n|---|---|---|\n`;
  list.forEach(d => md += `| ${d.to} | ${d.x}, ${d.y}, ${d.z} | ${d.price} |\n`);
  md += '\n';
});
md += `## Gatekeepers outside towns (dungeons, fortresses, special)\n\n| Gatekeeper | Position (x, y, z) |\n|---|---|\n`;
out.filter(g => !g.town).forEach(g => md += `| ${g.name}${g.title ? ' (' + g.title + ')' : ''} | ${g.x}, ${g.y}, ${g.z} |\n`);
fs.writeFileSync(ROOT + '/docs/plan/gatekeepers.md', md);
console.log('gatekeepers', out.length, 'in towns', out.filter(g => g.town).length, 'live menus', Object.keys(live).length, '-> docs/plan/gatekeepers.md');
