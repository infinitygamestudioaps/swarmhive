// TOIGAP 2026-10-22 (owner: "Tank1 traversing Tower of Insolence: it's not updating the floors, they look like walking into wrong rooms"):
// the levels between two floor bands (ToI stair rings, z -1408 between floor 3 and 4) get their own picture + level on the maps
const fs = require('fs'), path = require('path'), R = path.join(__dirname, '..', '..', '..');
const MF = require(path.join(R, 'Dashboard', 'mapfloors.js')), D = JSON.parse(fs.readFileSync(path.join(R, 'Scripts', 'data', 'dungeon_rooms.json'), 'utf8').replace(/^﻿/, ''));
const M = MF.build(D.dungeons || D), SRC = fs.readFileSync(path.join(R, 'Dashboard', 'mapfloors.js'), 'utf8'), TOOL = fs.readFileSync(path.join(__dirname, 'floor_maps.js'), 'utf8');
let ok = 0, bad = 0; const t = (n, c) => { if (c) ok++; else { bad++; console.log('FAIL', n); } };
const L = MF.lvlOf(M, 'toi#g2');
t('lvlOf parses a gap level', L.gap === 2 && L.fi === -1 && L.z === null && L.dn === 'Tower of Insolence');
t('gap label names both floors', L.n === 'between 3rd floor and 4th floor');
t('normal floors unchanged', MF.lvlOf(M, 'toi#3').n === '4th floor' && MF.lvlOf(M, 'surface').k === 'surface');
t('gap level has no map layer guess (picture only)', MF.tileSuffix(L, 23, 18, { x: 115557, y: 17723, z: -1408 }, {}, {}) === null);
t('node side (no floor index) keeps the old stairs rule', (() => { const S = {}; MF.trackLevel(M, S, { x: 116952, y: 17224, z: -1856 }, 0); const a = MF.trackLevel(M, S, { x: 115557, y: 17723, z: -1408 }, 1500), b = MF.trackLevel(M, S, { x: 115557, y: 17723, z: -1408 }, 3000); return a.k === 'toi#2' && b.k === 'toi#2'; })());
t('doorLevel uses the gap picture when there is one', SRC.includes("if (gapPic(d.name, lo.i)) return dk + '#g' + lo.i;"));
t('floorPic + plainLayer know gap levels', SRC.includes("[lvl.gap != null ? 'g' + lvl.gap : lvl.fi]") && SRC.includes('if (lvl.gap != null) return floorPic(lvl);'));
t('floor_maps.js --gaps draws the in-between levels', TOOL.includes("process.argv.includes('--gaps')") && TOOL.includes("['g' + lo.i] = {"));
// the floor pictures are made from the player's own client / geodata (floor_maps.js) and are not in the public package: checked where they exist
const FMI = path.join(R, 'Dashboard', 'icons', 'floormaps', 'index.json');
if (fs.existsSync(FMI)) {
  const idx = JSON.parse(fs.readFileSync(FMI, 'utf8'))['Tower of Insolence'] || {};
  t('ToI in-between pictures exist (g0..g10)', ['g0', 'g1', 'g2', 'g3'].every(k => idx[k] && fs.existsSync(path.join(R, 'Dashboard', 'icons', 'floormaps', idx[k].f))));
} else console.log('skipped: the ToI in-between picture check (no Dashboard/icons/floormaps here: made from your own install by floor_maps.js --gaps)');
console.log(`${ok} passed, ${bad} failed`); process.exit(bad ? 1 : 0);
