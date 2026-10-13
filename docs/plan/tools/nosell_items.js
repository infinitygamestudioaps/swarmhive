// NOSELL ITEMS data (2026-10-13, tester: "I marked D grade items for sale ... it reports that there is nothing to sell"; owner: "bots are not
// selling junk when resupplying"). Builds Scripts/data/nosell_items.json from the H5 datapack item tables (Scripts/data/dp/stats/items/*.xml):
//   ids   item ids the server never buys (is_sellable=false: Newbie Guide / shadow / starter pieces, event items ...)
// swarm.js (SELLPICK) skips these up front instead of walking to the grocer and learning it the hard way (Logs/unsellable.json), and the
// sale note says "the shop does not buy it". Prices are not needed: the shop decides those.
//   node docs/plan/tools/nosell_items.js            (writes the file, prints the count)
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const DIR = path.join(ROOT, 'Scripts', 'data', 'dp', 'stats', 'items');
const OUT = path.join(ROOT, 'Scripts', 'data', 'nosell_items.json');

function build() {
  const ids = [];
  for (const f of fs.readdirSync(DIR).filter(f => /\.xml$/i.test(f))) {
    const x = fs.readFileSync(path.join(DIR, f), 'utf8');
    const re = /<item\s+id="(\d+)"[^>]*?(\/>|>([\s\S]*?)<\/item>)/g;
    let m;
    while ((m = re.exec(x))) if (/<set\s+name="is_sellable"\s+val="false"\s*\/>/.test(m[3] || '')) ids.push(Number(m[1]));
  }
  return ids.sort((a, b) => a - b);
}
if (require.main === module) {
  if (!fs.existsSync(DIR)) { console.log('no datapack item tables at ' + DIR + ' - nothing written'); process.exit(0); }
  const ids = build();
  fs.writeFileSync(OUT, JSON.stringify({ generated: new Date().toISOString(), tool: 'docs/plan/tools/nosell_items.js',
    source: 'Scripts/data/dp/stats/items/*.xml (H5 datapack: is_sellable=false)', note: 'the NPC shops never buy these: swarm.js never offers them (SELLPICK)', ids }));
  console.log(`nosell_items.json: ${ids.length} item ids the shops do not buy -> ${OUT}`);
}
module.exports = { build };
