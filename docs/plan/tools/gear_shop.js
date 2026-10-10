// Builds Scripts/data/gear_shop.json: per character, per grade band, an ordered
const __ROOT = require('path').resolve(__dirname, '..', '..', '..').replace(/\\/g, '/');   // install folder (portable, 2026-10-07)
// shopping list from gear_plan_h5.json. Casters take their casting-speed set first,
// then everyone follows the role's slot priority with the "budget" pick
// (the script skips anything that is not an upgrade or not affordable).
// Run: node gear_shop.js
const fs = require('fs');
const plan = JSON.parse(fs.readFileSync(__ROOT + '/Scripts/data/gear_plan_h5.json', 'utf8').replace(/^\uFEFF/, ''));
const out = {};
const entry = (slot, it, src) => ({
  slot, itemId: it.itemId, name: it.name, price: it.price, count: it.count || (/(earring|ring)/.test(slot) ? 2 : 1),
  npcId: src.npcId, npcName: src.npcName, town: src.town, x: src.x, y: src.y, z: src.z, type: src.type,
});
for (const [name, ch] of Object.entries(plan.chars)) {
  out[name] = { role: ch.role, bands: {} };
  for (const [band, b] of Object.entries(ch.bands)) {
    const list = [];
    const seen = new Set();
    if (ch.role === 'mage' && b.sets && b.sets.length) {
      const set = b.sets.find(s => /Devotion|Karmian|Robe|Tunic/i.test(s.name)) || b.sets[0];
      for (const p of set.pieces) {
        if (!p.source || p.source.type !== 'buy') continue;
        list.push(entry(p.slot, p, p.source)); seen.add(p.slot);
      }
    }
    for (const slot of ch.priority) {
      if (seen.has(slot)) continue;
      const pick = (b.slots[slot] && (b.slots[slot].budget || b.slots[slot].best));
      if (!pick || !pick.source || pick.source.type !== 'buy') continue;
      list.push(entry(slot, pick, pick.source));
    }
    out[name].bands[band] = list;
  }
}
fs.writeFileSync(__ROOT + '/Scripts/data/gear_shop.json', JSON.stringify(out, null, 1));
for (const [n, c] of Object.entries(out)) {
  const l = c.bands.nograde || [];
  console.log(`${n} (${c.role}): ` + l.map(e => `${e.slot}:${e.name} ${e.price} @${e.npcName}/${e.town}`).join(' | '));
}
