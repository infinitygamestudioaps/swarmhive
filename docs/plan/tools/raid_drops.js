// Build Scripts/data/raid_drops_h5.json from the L2J H5 npc stats (Scripts/data/npcstats/*.xml) for every boss in raidbosses_h5.json.
// XML: <dropLists><death|drop|spoil|corpse>[<group chance=G>] <item id min max chance=C/> <!-- name --> ...
// Inside a group, one item at most drops: chance(group) * C/100 is the item's overall chance. Items outside a group roll on their own.
// Usage: node docs/plan/tools/raid_drops.js
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', '..', '..');
const dir = path.join(root, 'Scripts', 'data', 'npcstats');
const bosses = JSON.parse(fs.readFileSync(path.join(root, 'Scripts', 'data', 'raidbosses_h5.json'), 'utf8').replace(/^﻿/, '')).bosses;
const want = new Set(bosses.map(b => String(b.id)));
const out = {};
for (const f of fs.readdirSync(dir).filter(n => n.endsWith('.xml'))) {
  const xml = fs.readFileSync(path.join(dir, f), 'utf8');
  const npcRe = /<npc id="(\d+)"[\s\S]*?<\/npc>/g; let m;
  while ((m = npcRe.exec(xml))) {
    if (!want.has(m[1])) continue;
    const dl = /<dropLists>([\s\S]*?)<\/dropLists>/.exec(m[0]);
    if (!dl) continue;
    const categories = [];
    const kindRe = /<(death|drop|spoil|corpse|lucky)>([\s\S]*?)<\/\1>/g; let k;
    while ((k = kindRe.exec(dl[1]))) {
      const kind = k[1] === 'drop' ? 'death' : k[1];
      let body = k[2];
      const grpRe = /<group(?:\s+chance="([\d.]+)")?\s*>([\s\S]*?)<\/group>/g; let g;
      const items = (txt) => { const r = []; const itRe = /<item id="(\d+)" min="(\d+)" max="(\d+)" chance="([\d.]+)"\s*\/>\s*(?:<!--\s*(.*?)\s*-->)?/g; let i; while ((i = itRe.exec(txt))) r.push({ id: +i[1], name: (i[5] || '').trim(), min: +i[2], max: +i[3], chance: +i[4] }); return r; };
      while ((g = grpRe.exec(body))) {
        const gc = g[1] !== undefined ? +g[1] : 100;
        categories.push({ kind, chance: Math.round(gc * 1000) / 1000, oneOf: true, items: items(g[2]).map(it => ({ ...it, overall: Math.round(gc * it.chance / 100 * 1000) / 1000 })) });
      }
      const loose = items(body.replace(grpRe, ''));
      if (loose.length) categories.push({ kind, chance: null, oneOf: false, items: loose.map(it => ({ ...it, overall: it.chance })) });
    }
    out[m[1]] = { categories };
  }
}
fs.writeFileSync(path.join(root, 'Scripts', 'data', 'raid_drops_h5.json'), JSON.stringify(out));
console.log(`raid_drops_h5.json: ${Object.keys(out).length} of ${want.size} bosses with drop lists`);
