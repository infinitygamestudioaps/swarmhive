// UNSEAL TABLE (testers 2026-10-25: "if we stock them with ancient adena they should be able to unseal armor ... the distributor hands out the sealed
// piece along with the ancient adena required to unseal it"): every sealed armor / jewelry piece of the High Five datapack and what unsealing it
// costs, from the unseal exchange lists (Scripts/data/dp/multisell/311262504/505 = S grade for Ancient Adena, 311262506/507 = A grade for adena;
// on L2Toggle all four are at Pushkin, the Giran blacksmith: "Release the S-/A-grade armor / accessory seal").
//   node docs/plan/tools/unseal_table.js -> Scripts/data/unseal_h5.json { byUnsealed: { <id>: { sealed, aa, list, entry } }, bySealed: { <sealed id>: { id, aa, list, entry } } }
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..'), DIR = path.join(ROOT, 'Scripts', 'data', 'dp', 'multisell'), OUT = path.join(ROOT, 'Scripts', 'data', 'unseal_h5.json');
const out = { _readme: 'unseal exchanges (Pushkin in Giran on L2Toggle; datapack: Blacksmith of Mammon 31126 + town blacksmiths): sealed piece + aa x pay (5575 Ancient Adena for S, 57 adena for A) -> the piece; docs/plan/tools/unseal_table.js', generated: new Date().toISOString(), npc: 31126, byUnsealed: {}, bySealed: {} };
// S grade: Ancient Adena (504 armor, 505 jewelry); A grade: adena (506 armor, 507 jewelry; town blacksmiths incl. Pushkin in Giran)
for (const list of ['311262504', '311262505', '311262506', '311262507']) {
  const x = fs.readFileSync(path.join(DIR, list + '.xml'), 'utf8'), re = /<item>([\s\S]*?)<\/item>/g; let m, entry = 0;
  while ((m = re.exec(x))) {
    entry++;
    const ings = [...m[1].matchAll(/<ingredient\s+count="(\d+)"\s+id="(\d+)"/g)].map(g => ({ count: +g[1], id: +g[2] }));
    const prod = /<production\s+count="(\d+)"\s+id="(\d+)"/.exec(m[1]);
    const aa = ings.find(g => g.id === 5575 || g.id === 57), sealed = ings.find(g => g.id !== 5575 && g.id !== 57);
    if (!prod || !aa || !sealed || ings.length !== 2) continue;
    const id = +prod[2];
    out.byUnsealed[id] = { sealed: sealed.id, aa: aa.count, pay: aa.id, list: +list, entry };   // aa = the price, pay = 5575 Ancient Adena | 57 adena
    out.bySealed[sealed.id] = { id, aa: aa.count, pay: aa.id, list: +list, entry };
  }
}
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log(`${Object.keys(out.byUnsealed).length} sealed pieces -> ${OUT}`);
