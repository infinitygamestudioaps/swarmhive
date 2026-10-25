// OFFLINE TEST of docs/requirements/walls.md (owner 2026-10-24: "walls are COMPLETE blockers ... never through a wall"):
//   node docs/plan/tools/test_walls.js   (exit code 1 when a check fails)
//  A) geopath.sight on the real geodata: Archon Suscepter (Cruma Tower 2nd floor) through the wall = blocked, inside the room = seen, floors block
//  B) WALLSTOP: navAtlasPts / mtCut cut a route by the walk left, not by a straight circle (the Archon route walks round into the boss room)
//  C) WALLSIGHT: every attack / heal / assist / raid / NPC path checks canSee
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const src = fs.readFileSync(process.env.SWARM_JS || path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
let fails = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails++; };
const fn = (name) => { const a = src.indexOf('function ' + name + '('); if (a < 0) throw new Error(name + ' not found'); const z = src.indexOf('\n}\n', a); return src.slice(a, z + 2); };

// ---- A) line of sight on the geodata -----------------------------------------------------------------------------------------
const geo = require('./geopath');
const P = (x, y, z) => ({ x, y, z });
const haveGeo = fs.existsSync(path.join(ROOT, 'Geodata', '20_22.l2j')) || geo.sight(P(20776, 109704, -9040), P(20712, 109432, -9040)) !== null;
if (!haveGeo) console.log('skip A (no Cruma geodata in this install)');
else {
  check(geo.sight(P(20776, 109704, -9040), P(21512, 110440, -9040)) === false, 'A1 Archon Suscepter seen from the next room (through the wall) = blocked');
  check(geo.sight(P(20776, 109704, -9040), P(21700, 110100, -9040)) === false, 'A2 its minion 998 away behind the wall = blocked');
  check(geo.sight(P(21636, 110877, -9040), P(21512, 110440, -9040)) === true, 'A3 inside the boss room = seen');
  check(geo.sight(P(20776, 109704, -9040), P(20712, 109432, -9040)) === true, 'A4 two teammates in the same room = seen');
  check(geo.sight(P(17781, 113999, -11672), P(17776, 108288, -9056)) === false, 'A5 another floor = blocked');
}

// ---- B) route cuts by the walk left ------------------------------------------------------------------------------------------
const navAtlasPts = new Function(fn('navAtlasPts') + '\nreturn navAtlasPts;')();
const mtCut = new Function(fn('mtCut') + '\nreturn mtCut;')();
const atlas = path.join(ROOT, 'Scripts', 'data', 'nav_atlas', 't', 'raid_25395.json');
if (fs.existsSync(atlas)) {
  const a = JSON.parse(fs.readFileSync(atlas, 'utf8').replace(/^﻿/, ''));
  const w = a.steps.filter(s => s.do === 'walk').pop();
  const out = navAtlasPts(w.points, P(17776, 108288, -9056), { x: 21550, y: 109400, dist: 1500 });
  const e = out[out.length - 1];
  check(out.length > 30 && Math.hypot(e.x - 21512, e.y - 110440) < 800, `B1 Archon route walks round into the boss room (${out.length} of ${w.points.length / 3} points, ends ${e.x},${e.y})`);
}
const flat = []; for (let x = 0; x <= 10000; x += 1000) flat.push(x, 0, 0);
const s1 = navAtlasPts(flat, P(0, 0, 0), { x: 10000, y: 0, dist: 1500 });
check(s1[s1.length - 1].x === 8500, 'B2 a straight route still stops at the stop distance (8500)');
// a U-shaped route: passes 1000 from the target on the far side of a wall, then walks round to it
const U = [P(0, 0, 0), P(4000, 0, 0), P(8000, 0, 0), P(8000, 4000, 0), P(4000, 4000, 0), P(4000, 1600, 0)];
const tgt = { x: 4000, y: 1000, dist: 1500 };
const c1 = mtCut(U, tgt), last = c1[c1.length - 1];
check(c1.length === 6 && Math.abs(last.y - 2500) < 2, `B3 mtCut does not stop where the route passes behind the wall (cut at ${last.x},${last.y}, ${c1.length} points)`);
const u2 = navAtlasPts([].concat(...U.map(p => [p.x, p.y, p.z])), P(0, 0, 0), tgt);
check(u2.length === 6 && Math.abs(u2[u2.length - 1].y - 2500) < 2, 'B4 navAtlasPts the same');
check(mtCut([P(0, 0, 0), P(5000, 0, 0)], { x: 5000, y: 0, dist: 1000 }).slice(-1)[0].x === 4000, 'B5 mtCut on a straight line: unchanged result (4000)');

// ---- C) every action path checks the sight -----------------------------------------------------------------------------------
check(/function canSee\(c\)[\s\S]{0,1200}GeoSight\(Me\.X, Me\.Y, Me\.Z, x, y, z\)/.test(src), 'C1 canSee asks the geodata (GeoSight)');
check(/function srvAttack\(id\) \{[^\n]*canSee\(m\)\) \{ wallRefused\('attacking', m\); wallApproach\(o, m\); return; \}/.test(src) && /function wallApproach\(o, m\)[^\n]*Send\.MoveBackwardToLocation/.test(src), 'C2 srvAttack refuses a monster behind a wall and walks to it instead (WALLWALK: members no longer stand still)');
check(/async function engage\(t\)[\s\S]{0,700}if \(!canSee\(t\)\)/.test(src), 'C3 engage refuses it');
check(/function huntTarget\([\s\S]{0,8000}for \(const c of cands\) \{ if \(!canSee\(c\.mb\)\)/.test(src), 'C4 huntTarget skips it (nearest first, only until one is in sight)');
check(/function nearestMonster\([\s\S]{0,400}if \(d < bestDist && canSee\(crt\)\)/.test(src), 'C5 nearestMonster skips it');
check(/const SEE_FAR = 3000, SEE_BUDGET = 40;/.test(src) && /if \(typeof GeoSight !== 'function' \|\| d > SEE_FAR\) return true;/.test(src) && /if \(\+\+SEE\.n > SEE_BUDGET\)/.test(src), 'C13 SEECOST: no geodata check beyond 3000, at most 40 a second (brain workers hit 100 % ELU without it)');
// C6 (changed 2026-10-24 late: test_member_assist / test_questengine_host): choosing the leader's target needs no sight (members move to it
// round the corner); firing does: srvAttack and castOn refuse a monster behind a wall
check(!/function assistView\(m\)[^\n]*\n[^\n]*\n[^\n]*canSee\(m\)/.test(src) && /async function castOn\([\s\S]{0,400}mobById\(creature\.objId\); if \(m && !canSee\(m\)\)/.test(src) && /function srvAttack\(id\)[^\n]*!canSee\(m\)/.test(src), 'C6 assist: the leader\'s target may be chosen behind a corner, but no hit or cast goes through a wall');
check(/bossMinions\(boss, 2500\)\.filter\(m => canSee\(m\)\)/.test(src), 'C7 the raid tank only goes for minions in sight');
check(/async function raidDealer\([\s\S]{0,4500}if \(!canSee\(tgt\)\) \{/.test(src), 'C8 raid dealers never attack the focus through a wall');
check(/function healTargets\(\)[\s\S]{0,1600}canSee\(\{ x: t\.x, y: t\.y/.test(src), 'C9 healers never heal through a wall');
check(/async function openNpcInner\([\s\S]{0,1200}Distance\(npc\) > 250 && !canSee\(npc\)/.test(src), 'C10 NPC talk: behind a wall -> walk round first');
check(/function mtHelpTarget\([\s\S]{0,600}!canSee\(m\)/.test(src) && /function mtLeashFight\([\s\S]{0,700}canSee\(m\)\)/.test(src), 'C11 the team walk\'s fights only take monsters in sight');
const host = fs.readFileSync(path.join(ROOT, 'Dashboard', 'brain_host', 'host.js'), 'utf8');
check(/GeoSight: \(ax, ay, az, bx, by, bz\) =>[^\n]*geopath\.js[^\n]*\.sight\(/.test(host), 'C12 the brain host gives the scripts GeoSight (geopath.js sight)');

// ---- D) RAIDKEEP (hunting.md R6): auto-levelling never takes a raid boss's minion or a monster next to a living raid boss --------------
check(/const RAIDKEEP_R = 3000;/.test(src) && /function huntTarget\([\s\S]{0,3000}const rkBosses = \[\]; if \(!inRaid\(\)\)[\s\S]{0,300}isRaidBossMob\(b\)/.test(src), 'D1 huntTarget knows the living raid bosses around (outside a raid)');
check(/const rkNear = \(mb\) => rkBosses\.find\(b => [^\n]*b\.mins\.includes\(String\(mb\.Name\)\)/.test(src) && !/rkBosses\.find\([^\n]*\|\|[^\n]*b\.mins/.test(src) && /if \(rb\) \{ if \(!userSpot\) return no\(mb\);/.test(src), 'D2 only the boss\'s own minions are skipped, not every monster near it (owner); a user-chosen spot only warns');
check(/const ignoredMobHard = [^\n]*raidBossOutsideRaid\(m\)/.test(src), 'D3 the raid boss itself is never a target outside its raid');

console.log(fails ? `\n${fails} FAILED` : '\nALL OK');
process.exit(fails ? 1 : 0);
