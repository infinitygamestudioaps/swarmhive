// OFFLINE TEST FORGESAFE + NEVERAUTO 2026-10-30 (owner: "shaded left multiple characters to die in Forge of Gods. Forge of Gods its mostly AOE teams ...
// The 'safepoint' on the bridge was NOT far away from the monsters ... the safe spot should be in the start BEFORE the bridge" -> AskUserQuestion:
// "Bottom of the slope, before the bridge" + "Never auto-pick Forge").
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
let oks = 0, fails = 0; const check = (ok, w) => { if (ok) oks++; else fails++; console.log((ok ? 'ok   ' : 'FAIL ') + w); };
console.log('1) the data: one owner safe spot on Forge\'s top level, the corridor spots next to the rooms off');
const raw = fs.readFileSync(path.join(ROOT, 'Scripts', 'data', 'dungeon_rooms.json'), 'utf8');
const D = JSON.parse(raw.replace(/^﻿/, '')), F = D.find(x => /Forge of the Gods/.test(x.name)).floors[0];
const own = F.safeSpots.find(s => s.id === 'forge-1-safe-start');
check(own && own.x === 173032 && own.y === -116248 && own.z === -3448 && own.owner && own.manual && own.maxWalk >= 10000, 'forge-1-safe-start = 173032,-116248,-3448 (bottom of the slope, before the bridge), owner + manual (generators keep it), reachable from every room');
check(F.safeSpots.filter(s => s !== own).every(s => s.off === true), `the ${F.safeSpots.length - 1} generated corridor spots next to the rooms are off`);
check(!/\n /.test(raw.slice(0, 5000)), 'dungeon_rooms.json stays compact (the bots read it)');
console.log('2) escape / pull-back use it');
check(/safeSpots: \(f\.safeSpots \|\| \[\]\)\.filter\(s => s\.off !== true\)/.test(SRC), 'escFloor drops switched-off spots');
check(/const os = fl && \(fl\.safeSpots \|\| \[\]\)\.find\(s => s\.maxWalk > 0/.test(SRC) && /p\.ownerSpot = true; return p;/.test(SRC), 'escFleePlan: a floor with the owner spot uses only that one (before the path finder picks a closer corridor)');
check(/if \(plan\.ownerSpot\) return true;/.test(SRC), "the stuck-fight pull-back inside a dungeon may walk back the whole way to the owner's spot (no 2500 limit for it)");
console.log('3) Forge of the Gods is never picked automatically');
const neverAuto = /neverAuto: \/Forge of the Gods\/i,/.test(SRC);
check(neverAuto, 'CONFIG.lead.neverAuto = /Forge of the Gods/i');
const ps = SRC.slice(SRC.indexOf('function pickSpot('), SRC.indexOf('function pickSpot(') + 9000);
const msAt = ps.indexOf('const ms = manualSpot(level, solo); if (ms) return ms;'), naAt = ps.indexOf('const noAuto =');
check(msAt > 0 && naAt > msAt, 'your own choice (party card / plan) comes BEFORE the rule = still used');
check((ps.match(/!noAuto\(z\.name\) && !noAuto\(z\.rooms\)/g) || []).length === 2 && /!noAuto\(r\.name\)/.test(ps) && /if \(noAuto\(s\.name\) \|\| noAuto\(s\.dungeon\)/.test(ps), 'route / other parties\' zones, the team route and datapack spots all skip it');
const re = /Forge of the Gods/i; check(re.test('Forge of the Gods (route 74-80)') && re.test('Forge of the Gods + Valakas approach (Hall of Flames)') && !re.test('Varka Silenos Stronghold'), 'matches the route zone and the dungeon, not other places');
console.log(`\nforge safe: ${oks} ok, ${fails} failed`); process.exit(fails ? 1 : 0);
