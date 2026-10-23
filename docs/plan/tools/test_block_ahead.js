// BLOCKAHEAD-2026-10-23: a route leg the server refuses although the geodata calls it open (Tank2, Iron Giant Totem, 105 tries in a night)
// -> a small circle just ahead of the stuck spot is treated as a wall and the path finder goes around it
'use strict';
const fs = require('fs'), path = require('path');
const R = path.join(__dirname, '..', '..', '..');
const SW = fs.readFileSync(path.join(R, fs.existsSync(path.join(R, 'Scripts_dev', 'swarm.js')) ? 'Scripts_dev/swarm.js' : 'Scripts/swarm.js'), 'utf8');
let ok = 0, bad = 0;
const t = (name, cond) => { if (cond) ok++; else { bad++; console.log('FAIL', name); } };
const m = /\/\/ BLOCKAHEAD-PURE-BEGIN[\s\S]*?\/\/ BLOCKAHEAD-PURE-END/.exec(SW);
t('pure block exists', !!m);
const blockAheadSpot = new Function(m[0] + '\nreturn blockAheadSpot;')();
const me = { x: 105032, y: 29960 };
const a = blockAheadSpot(me, [{ x: 105030, y: 29962 }, { x: 104936, y: 29960 }, { x: 104664, y: 29672 }], { x: 104667, y: 29578 });
t('ahead = towards the first real path point', a && a.x < me.x && Math.abs(a.y - me.y) < 5 && a.r === 110);
t('start stays outside the circle', a && Math.hypot(a.x - me.x, a.y - me.y) > a.r);
const b = blockAheadSpot(me, null, { x: 105032, y: 29000 });
t('no path: towards the goal', b && b.y < me.y && Math.abs(b.x - me.x) < 2);
t('on the goal: nothing', blockAheadSpot(me, [], { x: 105040, y: 29965 }) === null);
// the real case on the geodata: the plain plan uses the refused step, the circle gives another way that does not pass it
try {
  const g = require('./geopath');
  const goal = { x: 104667, y: 29578, z: -3640 }, s = { x: 105032, y: 29960, z: -3776 };
  const f0 = g.findPath(s, goal, {});
  const c = blockAheadSpot(s, f0.points, goal);
  const f1 = g.findPath(s, goal, { avoid: [c] });
  t('geodata: a way around the blocked step exists', f1.ok && f1.points.every(q => Math.hypot(q.x - c.x, q.y - c.y) > c.r));
} catch (e) { console.log('(geodata part skipped: ' + e.message + ')'); }
t('routeHop uses it after the old detour', /BLOCKAHEAD-2026-10-23[\s\S]{0,2500}blockAheadSpot\(\{ x: Me\.X, y: Me\.Y \}[\s\S]{0,600}geoBlockLearn\([\s\S]{0,400}geoRoute\(p\.x, p\.y, isFinite\(p\.z\) \? p\.z : null, 15000, avoid\)/.test(SW));
t('detour is saved into the route (onDetour)', /if \(ok \|\| Math\.hypot\(p\.x - Me\.X, p\.y - Me\.Y\) <= 150\) \{ if \(onDetour && det\.length\) onDetour\(det\); break; \}/.test(SW));
console.log(`${ok} ok, ${bad} FAIL`);
process.exit(bad ? 1 : 0);
