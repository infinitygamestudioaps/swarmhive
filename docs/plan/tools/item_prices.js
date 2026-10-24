// ITEM PRICES (2026-10-24, owner: the Loot page "should also show total loot"): item id -> datapack price (the NPC shop price; an NPC buys
// at half of it). Source: Scripts/data/dp/stats/items/*.xml (L2J High Five datapack). Writes Dashboard/data/item_prices.json { id: price }.
//   node docs/plan/tools/item_prices.js
'use strict';
const fs = require('fs'), path = require('path');
const R = path.join(__dirname, '..', '..', '..');
const DIR = path.join(R, 'Scripts', 'data', 'dp', 'stats', 'items'), OUT = path.join(R, 'Dashboard', 'data', 'item_prices.json');
const out = {};
for (const f of fs.readdirSync(DIR).filter(f => /\.xml$/i.test(f))) {
  const s = fs.readFileSync(path.join(DIR, f), 'utf8');
  const re = /<item id="(\d+)"[^>]*>([\s\S]*?)<\/item>/g; let m;
  while ((m = re.exec(s))) { const p = /name="price" val="(\d+)"/.exec(m[2]); if (p && Number(p[1]) > 0) out[m[1]] = Number(p[1]); }
}
fs.writeFileSync(OUT, JSON.stringify(out));
console.log(`item prices: ${Object.keys(out).length} items -> ${path.relative(R, OUT)}`);
