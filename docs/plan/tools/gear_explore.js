// Exploration: list NONE/D/C armor sets with bonus + where each piece can be bought.
const __ROOT = require('path').resolve(__dirname, '..', '..', '..').replace(/\\/g, '/');   // install folder (portable, 2026-10-07)
const fs = require('fs');
const db = JSON.parse(fs.readFileSync(__ROOT + '/Scripts/data/dp/gear_db.json', 'utf8'));
const spawns = JSON.parse(fs.readFileSync(__ROOT + '/Scripts/data/spawns_h5.json', 'utf8').replace(/^\uFEFF/, ''));
const npcPos = {};
for (const s of spawns) if (!npcPos[s.id]) npcPos[s.id] = s;
const TOWNS = { Gludio: [-14000, 123000], Gludin: [-80800, 151000], Dion: [15600, 142900], Giran: [83400, 148600] };
const townOf = (id) => { const p = npcPos[id]; if (!p) return '?'; for (const [t, [x, y]] of Object.entries(TOWNS)) if (Math.hypot(p.x - x, p.y - y) < 6000) return t; return 'other'; };
const sellers = {};
for (const b of db.buylists) for (const it of b.items) (sellers[it.id] = sellers[it.id] || []).push({ list: b.id, npcs: b.npcs, price: it.price });
const where = (id) => {
  const s = sellers[id] || [];
  const towns = new Set();
  for (const b of s) for (const n of b.npcs) towns.add(townOf(n));
  return [...towns].join('/') || '-';
};
const grade = process.argv[2] || 'NONE';
for (const set of db.sets) {
  if ((set.grade || 'NONE').toUpperCase() !== grade) continue;
  const parts = Object.entries(set.pieces).map(([slot, ids]) => {
    const id = ids[0]; const it = db.items[id] || {};
    return `${slot}:${it.name || id}[${it.price || '?'}|${where(id)}]`;
  });
  const bonus = set.skills.map(s => `${s.name}{${s.effects.join(', ')}}`).join(' ; ');
  console.log(`#${set.id} ${set.name} (${set.armorType}) ${parts.join('  ')}\n    BONUS: ${bonus}${set.shieldSkill ? `\n    SHIELD: ${set.shieldSkill.name}{${set.shieldSkill.effects.join(', ')}}` : ''}`);
}
