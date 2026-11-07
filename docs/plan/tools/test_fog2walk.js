// FOG2WALK + FOGCHANDRA guard (owner 2026-11-05: Destroyer3's team to the first room of FoG level 2; 15:16 + 15:22 the trip failed: the plan used a
// "walk in from outside" straight into the Lower level that does not exist on the geodata, the chosen spot was dropped -> Pavel Ruins.
// Owner: "gå til teleporten lige før broen på niveau 1 og teleportere ned ELLER bare forsætte med fra niveau 1 til niveau 2 via lava trappen")
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '../../..');
const SRC = fs.readFileSync(path.join(ROOT, 'Scripts_dev/swarm.js'), 'utf8');
let ok = 0, bad = 0; const t = (m, c, x) => { if (c) { ok++; console.log('ok   ' + m); } else { bad++; console.log('FAIL ' + m + (x === undefined ? '' : ' ' + JSON.stringify(x))); } };
const cut = (a, b) => SRC.slice(SRC.indexOf(a), SRC.indexOf(b));
const W = new Function(cut('// FOG2WALK-PURE-BEGIN', '// FOG2WALK-PURE-END') + '\nreturn walkInFloorOk;')();
const num = (v) => Number(v) || 0;
const M = new Function('num', cut('// ROOMGRAPH-PURE-BEGIN', '// ROOMGRAPH-PURE-END') + '\nreturn { rgBuild, rgPlan };')(num);
const rd = (f) => JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, ''));
const D = rd(path.join(ROOT, 'Scripts/data/dungeon_rooms.json'));
const fog0 = (Array.isArray(D) ? D : Object.values(D)).find(d => d && d.key === 'forge');
const G = rd(path.join(ROOT, 'Scripts/data/dungeon_graph/forge.json'));
const fog = Object.assign({}, fog0, { floors: fog0.floors.map((F, i) => Object.assign({}, F, { graph: G.floors[i] && G.floors[i].graph })) });
t('the FoG Lower-level walk-in from the landing is switched off (verified:false, manual)', fog0.entryLinks.some(l => l.to === 1 && l.verified === false && l.manual));
t('floor 0 holds the Chandra teleporter to the Lower level ("Request a ride with the freight below.")', fog0.floors[0].links.some(l => l.to === 1 && l.kind === 'npc' && /freight below/i.test(String(l.linkText || ''))));
t('floor 0 holds the lava stairs walk to the Lower level (owner)', fog0.floors[0].links.some(l => l.id === 'fog-lava-stairs' && l.to === 1 && l.kind === 'walk' && Array.isArray(l.path) && l.path.length > 30));
const p = M.rgPlan(M.rgBuild(fog), { start: 'outside' }, { room: 'forge-2-straight-a' });
const enters = (p.steps || []).filter(s => s.do === 'enter');
t('the plan from outside to the first Lower-level room works', p.ok === true, p.why);
t('it enters on the Top level only (never straight into the Lower level)', enters.length === 1 && Number(enters[0].floor || 0) === 0, enters.map(s => s.floor));
t('it goes down by Chandra or the stairs', (p.steps || []).some(s => s.do === 'npc' || s.do === 'stairs'), (p.steps || []).map(s => s.do).join(','));
t('rgBuild skips a verified:false walk-in', /if \(l && l\.verified === false\) return; edge\(OUT/.test(SRC));
t('room_graph.js keeps a manual entry link on a rebuild', /filter\(l => l\.source !== 'room_graph' \|\| l\.manual\)/.test(fs.readFileSync(path.join(__dirname, 'room_graph.js'), 'utf8')));
t('FoG Top level (floor 0) still walks in', W(fog0, { floor: 0, x: 177800, y: -116696, z: -3672 }) === true);
console.log(`fog2walk: ${ok} ok, ${bad} failed`); process.exit(bad ? 1 : 0);
