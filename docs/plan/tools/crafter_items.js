// Builds Scripts/data/crafter_items.json for OUR CRAFTER's crystallize + recipe-learn buttons (CRAFTITEMS-2026-10-15, owner: "he should also
// have the option to disenchant items into crystals ... and be able to send recipes and materials to him"). swarm.js CRYST block reads it.
//   crystal { itemId: [crystalCount, grade, kind, flags] }   every item the H5 datapack lets a Dwarf crystallize (crystal_count > 0 and a grade):
//             grade D | C | B | A | S | S80 | S84 (S80 / S84 give S crystals and need Crystallize level 5 like S), kind w = weapon, a = armor /
//             shield, j = jewelry (neck / ear / finger), flags: t = the datapack says not tradeable, s = special ability weapon ("Name - SA"),
//             c = Common Item (cheap copy, no set bonus)
//   recipes { recipeItemId: [listId, craftLevel, 'd'|'c', productId] }  listId = recipes.xml "id" = what the recipe book (0xDC) lists
// Sources: Scripts/data/dp/gear_db.json (H5 item stats: crystal_count, crystal_type, bodypart, is_tradable) + Scripts/data/dp/recipes.xml.
//   node docs/plan/tools/crafter_items.js
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const OUT = path.join(ROOT, 'Scripts', 'data', 'crafter_items.json');
function build() {
  const G = JSON.parse(fs.readFileSync(path.join(ROOT, 'Scripts', 'data', 'dp', 'gear_db.json'), 'utf8').replace(/^﻿/, '')).items || {};
  const crystal = {};
  Object.values(G).forEach(i => {
    const c = Number(i.crystal_count) || 0, g = String(i.crystal_type || '');
    if (c <= 0 || !/^(D|C|B|A|S|S80|S84)$/.test(g)) return;
    const bp = String(i.bodypart || '');
    const kind = i.type === 'Weapon' ? 'w' : /neck|ear|finger/.test(bp) ? 'j' : 'a';
    let fl = '';
    if (String(i.is_tradable) === 'false' || String(i.is_tradable) === '0') fl += 't';
    if (kind === 'w' && /\S - \S/.test(String(i.name || '')) && !/^Common Item/i.test(String(i.name || ''))) fl += 's';
    if (/^Common Item/i.test(String(i.name || ''))) fl += 'c';
    crystal[i.id] = [c, g, kind, fl];
  });
  const xml = fs.readFileSync(path.join(ROOT, 'Scripts', 'data', 'dp', 'recipes.xml'), 'utf8');
  const recipes = {}; let m; const re = /<item\s+([^>]*?)>([\s\S]*?)<\/item>/g;
  while ((m = re.exec(xml))) {
    const a = {}; m[1].replace(/(\w+)="([^"]*)"/g, (_, k, v) => { a[k] = v; });
    if (!a.recipeId || !a.id) continue;
    const prod = (m[2].match(/<production\s+id="(\d+)"/) || [])[1];
    recipes[a.recipeId] = [Number(a.id), Number(a.craftLevel) || 1, a.type === 'common' ? 'c' : 'd', prod ? Number(prod) : 0];
  }
  return { generated: new Date().toISOString(), tool: 'docs/plan/tools/crafter_items.js', source: 'Scripts/data/dp/gear_db.json + Scripts/data/dp/recipes.xml (H5 datapack)',
    note: 'crystal: itemId -> [crystalCount at +0, grade D|C|B|A|S|S80|S84, kind w|a|j, flags t=not tradeable s=special ability c=common item]; recipes: recipeItemId -> [recipe list id, craft level, d=dwarven|c=common, productId]',
    counts: { crystal: Object.keys(crystal).length, recipes: Object.keys(recipes).length }, crystal, recipes };
}
if (require.main === module) {
  const out = build();
  fs.writeFileSync(OUT, JSON.stringify(out) + '\n');
  console.log(`wrote ${path.relative(ROOT, OUT)}: ${out.counts.crystal} crystallizable items, ${out.counts.recipes} recipes`);
}
module.exports = { build, OUT };
