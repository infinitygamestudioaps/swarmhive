// NPC2SPOT-2026-11-04 guard: a Giran route that serves two NPCs gives each NPC its OWN stand spot (the nearest anchor wins)
// live: Spoiler1 stood at Galladucci's spot, 135 from Alexandria behind her counter -> "Alexandria did not answer 3 clicks" (4 pieces failed)
'use strict';
const fs = require('fs'), path = require('path');
const R0 = path.join(__dirname, '../../..'), SRC = fs.readFileSync(path.join(R0, 'Scripts_dev/swarm.js'), 'utf8');
let ok = 0, bad = 0; const t = (m, c, x) => { if (c) { ok++; console.log('ok   ' + m); } else { bad++; console.log('FAIL ' + m + (x === undefined ? '' : ' ' + JSON.stringify(x))); } };
const a = SRC.indexOf('function npcFrontKnown('), b = SRC.indexOf('\n}', a);
const body = SRC.slice(a, b + 2);
t('npcFrontKnown exists', a > 0);
const R = JSON.parse(fs.readFileSync(path.join(R0, 'Scripts/data/giran_routes.json'), 'utf8')), routes = R.routes || R;
const num = (v) => Number(v) || 0;
const fn = new Function('giranRoutes', 'num', 'currentTownKey', 'townGraphD', 'Me', body + '\nreturn npcFrontKnown;')(() => ({ routes }), num, () => null, () => null, { X: 0, Y: 0, Z: 0 });
const alex = fn({ X: 79599, Y: 145457, Z: -3488 }), gal = fn({ X: 79599, Y: 145522, Z: -3494 });
t('Alexandria gets her own spot on her side (within 100 of her)', alex && Math.hypot(alex.x - 79599, alex.y - 145457) <= 100, alex);
t('Galladucci keeps his spot (within 150)', gal && Math.hypot(gal.x - 79599, gal.y - 145522) <= 150 && !(gal.x === alex.x && gal.y === alex.y), gal);
t('the luxury route carries npc2At + npc2Spot for Alexandria', routes.luxury && Array.isArray(routes.luxury.npc2At) && Array.isArray(routes.luxury.npc2Spot));
console.log(`npc2spot: ${ok} ok, ${bad} failed`); process.exit(bad ? 1 : 0);
