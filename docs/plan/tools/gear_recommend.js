// Writes the RECOMMENDED gear for every class x grade (Dashboard/gear_recommend.js) to Scripts/data/gear_rec/<classId>.json for swarm.js
// (the dashboard server does the same by itself whenever the catalog or the Giran shop scan changes) and prints a short table.
//   node docs/plan/tools/gear_recommend.js [classId ...]      (no ids = a few examples; --all = every class)
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const API = require(path.join(ROOT, 'Dashboard', 'gearpage_api.js'))._t;
const { recommendAll } = require(path.join(ROOT, 'Dashboard', 'gear_recommend.js'));
const DATA = path.join(ROOT, 'Scripts', 'data');
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch (e) { return d; } };
const C = API.catalog(path.join(ROOT, 'Dashboard'));
const G = API.giranOffers(DATA, readJson);
const t0 = Date.now();
const R = recommendAll(C, G, { fitOf: API.fitOf, giranGet: API.giranGet, srcText: API.srcText });
console.log(`recommended: ${Object.keys(R.byKey).length} archetype/race kits x 8 grades in ${Date.now() - t0} ms`);
API.writeRecFiles(DATA, C, R);
console.log('written: Scripts/data/gear_rec/<classId>.json for', C.classes.length, 'classes');
const ids = process.argv.includes('--all') ? C.classes.map(c => c.id) : (process.argv.slice(2).map(Number).filter(Boolean).length ? process.argv.slice(2).map(Number).filter(Boolean) : [46, 33, 16, 13, 93, 92, 131, 128, 55, 52]);
ids.forEach(id => {
  const c = C.byClass[id]; console.log(`\n=== ${c.name} (${c.arch}, ${c.race})`);
  ['D', 'C', 'B', 'A', 'S', 'S80'].forEach(g => {
    const sl = R.byKey[R.classKey[id]][g] || {};
    console.log(`  ${g.padEnd(4)} ` + ['weapon', 'shield', 'chest', 'legs', 'head', 'gloves', 'feet', 'neck', 'earring', 'ring', 'belt'].filter(s => sl[s]).map(s => `${s}:${sl[s].name}${sl[s].buy === 'real' ? '(real)' : ''}${sl[s].alt.length ? ' [alt ' + sl[s].altNames.join('/') + ']' : ''}`).join(' | '));
    if (sl.chest) console.log('       why chest: ' + sl.chest.why);
    if (sl.weapon) console.log('       why weapon: ' + sl.weapon.why);
  });
});
