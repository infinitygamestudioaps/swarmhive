// Builds Scripts/data/stash_items.json for the WAREHOUSE STASH (swarm.js STASH-PURE, user 2026-10-09 16:05):
//   recipes   { recipeItemId: [craftLevel, 'd'|'c', productId] }   every recipe item (dwarven = Create Item 172, common = Create Common Item 1320)
//   materials { itemId: [minDwarvenLevel|null, minCommonLevel|null] } every recipe INGREDIENT that is not equipment and not a recipe
//             (the lowest craft level of a recipe that uses it: the crafter keeps the materials of the recipes his skill level can make)
// Source: the H5 datapack Scripts/data/dp/recipes.xml (1000 recipes). Equipment = Scripts/data/gear_items.json.
//   node docs/plan/tools/stash_items.js
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const xml = fs.readFileSync(path.join(ROOT, 'Scripts', 'data', 'dp', 'recipes.xml'), 'utf8');
const gear = JSON.parse(fs.readFileSync(path.join(ROOT, 'Scripts', 'data', 'gear_items.json'), 'utf8').replace(/^﻿/, '')).items || {};
let names = {};
try { names = JSON.parse(fs.readFileSync(path.join(ROOT, 'Dashboard', 'data', 'items.json'), 'utf8')); } catch (e) { }
const recipes = {}, mats = {};
const re = /<item\s+([^>]*?)>([\s\S]*?)<\/item>/g;
let m, n = 0;
while ((m = re.exec(xml))) {
  const a = {}; m[1].replace(/(\w+)="([^"]*)"/g, (_, k, v) => { a[k] = v; });
  if (!a.recipeId) continue;
  n++;
  const lvl = Number(a.craftLevel) || 1, t = a.type === 'common' ? 'c' : 'd';
  const prod = (m[2].match(/<production\s+id="(\d+)"/) || [])[1];
  recipes[a.recipeId] = [lvl, t, prod ? Number(prod) : 0];
  m[2].replace(/<ingredient\s+id="(\d+)"/g, (_, id) => {
    const r = mats[id] = mats[id] || [null, null], k = t === 'd' ? 0 : 1;
    if (r[k] === null || lvl < r[k]) r[k] = lvl;
  });
}
Object.keys(mats).forEach(id => { if (gear[id] || recipes[id]) delete mats[id]; });
const out = { generated: new Date().toISOString(), tool: 'docs/plan/tools/stash_items.js', source: 'Scripts/data/dp/recipes.xml (H5 datapack)',
  note: 'recipes: recipeItemId -> [craftLevel, d=dwarven(Create Item 172)|c=common(Create Common Item 1320), productId]; materials: itemId -> [lowest dwarven craft level, lowest common craft level] of the recipes that use it (equipment and recipes excluded)',
  counts: { recipes: Object.keys(recipes).length, materials: Object.keys(mats).length }, recipes, materials: mats };
fs.writeFileSync(path.join(ROOT, 'Scripts', 'data', 'stash_items.json'), JSON.stringify(out));
console.log(`stash_items.json: ${n} recipes, ${Object.keys(mats).length} materials` +
  ` (e.g. ${['1865', '1872', '1458', '2134', '3031', '1785'].map(id => `${id} ${(names[id] || [])[0] || '?'}=${JSON.stringify(mats[id] || null)}`).join(', ')})`);
