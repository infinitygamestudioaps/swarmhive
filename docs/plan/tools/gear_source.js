// node gear_source.js <name regex>  -> every buylist/multisell that produces matching items, with ingredients + NPC towns
const __ROOT = require('path').resolve(__dirname, '..', '..', '..').replace(/\\/g, '/');   // install folder (portable, 2026-10-07)
const fs = require('fs');
const db = JSON.parse(fs.readFileSync(__ROOT + '/Scripts/data/dp/gear_db.json', 'utf8'));
const spawns = JSON.parse(fs.readFileSync(__ROOT + '/Scripts/data/spawns_h5.json', 'utf8').replace(/^\uFEFF/, ''));
const etcNames = {};
for (const f of fs.readdirSync(__ROOT + '/Scripts/data/dp/stats/items').filter(f => f.endsWith('.xml'))) {
  const x = fs.readFileSync(__ROOT + '/Scripts/data/dp/stats/items/' + f, 'utf8');
  for (const m of x.matchAll(/<item\s+id="(\d+)"\s+type="\w+"\s+name="([^"]*)"/g)) etcNames[m[1]] = m[2];
}
etcNames['57'] = 'Adena';
const npcPos = {};
for (const s of spawns) if (!npcPos[s.id]) npcPos[s.id] = s;
const re = new RegExp(process.argv[2], 'i');
const ids = new Set(Object.values(db.items).filter(i => re.test(i.name)).map(i => i.id));
for (const m of db.multisells) {
  for (const e of m.entries) {
    if (!e.prod.some(p => ids.has(p.id))) continue;
    const npcs = m.npcs.slice(0, 6).map(n => `${npcPos[n] ? npcPos[n].name : n}(${n})@${npcPos[n] ? npcPos[n].x + ',' + npcPos[n].y : '?'}`).join(' ');
    console.log(`MS ${m.id}: ${e.prod.map(p => `${p.count}x ${etcNames[p.id] || p.id}`).join('+')} <= ${e.ing.map(i => `${i.count}x ${etcNames[i.id] || i.id}`).join(' + ')}  | ${npcs}${m.npcs.length > 6 ? ` +${m.npcs.length - 6}` : ''}`);
  }
}
for (const b of db.buylists) for (const it of b.items) if (ids.has(it.id)) console.log(`BUY ${b.id}: ${etcNames[it.id]} ${it.price || db.items[it.id].price} | ${b.npcs.map(n => `${npcPos[n] ? npcPos[n].name : n}(${n})`).join(' ')}`);
