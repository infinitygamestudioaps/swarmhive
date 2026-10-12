// OFFLINE TEST of HUNTABLE (user 2026-10-10: "party Dagger1 is just standing in an area where there are no monsters, why is it not moving
// to another area?"): monsters the hunt picker refuses (solo pull too big, level, another player's) must not keep an area "occupied".
//   node docs/plan/tools/test_huntable.js
'use strict';
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(process.env.SWARM_SRC || path.join(__dirname, '..', '..', '..', 'Scripts_dev', 'swarm.js'), 'utf8');
const piece = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i); if (i < 0 || j < 0) { console.log('FAIL block not found: ' + a); process.exit(1); } return src.slice(i, j); };
const code = piece('const huntSkip = {', '/** Mob i passende') + piece('function multiLive(spot)', '/** a kill while hunting');
let T = 1e6; const mobs = [];
const env = { now: () => T, num: Number, ignoredMob: () => false, foreignTagged: () => false, snapMobs: () => mobs,
  nearPolygon: (x, y, P) => x >= 0 && x <= 1000 && y >= 0 && y <= 1000 };
const M = new Function(...Object.keys(env), code + '\nreturn { huntSkip, multiLive };')(...Object.values(env));
let fails = 0; const ok = (c, w) => { console.log((c ? 'ok   ' : 'FAIL ') + w); if (!c) fails++; };
const spot = { poly: [[0, 0], [1000, 0], [1000, 1000], [0, 1000]] };
mobs.push({ objId: 1, X: 500, Y: 500, Z: 0, IsDead: false, Name: 'Farhite Lad' }, { objId: 2, X: 600, Y: 500, Z: 0, IsDead: false, Name: 'Nos Lad' });
ok(M.multiLive(spot) === 2, 'no hunt picker info yet: 2 live monsters count');
M.huntSkip.ok = {}; M.huntSkip.at = T;
ok(M.multiLive(spot) === 0, 'the hunt picker would attack none of them (solo pull / other floor / outside its circle): the area counts as EMPTY -> the rotation moves on');
M.huntSkip.ok = { 2: 1 };
ok(M.multiLive(spot) === 1, 'one it would attack: 1 counts (stay and hunt it)');
T += 20000;
ok(M.multiLive(spot) === 2, 'stale picker info (> 15 s): ignored, every live monster counts again');
const ht = piece('function huntTarget(', '\n}\n');
ok(/huntSkip\.ids = skip; huntSkip\.ok = okIds; huntSkip\.at = now\(\);/.test(ht) && /okIds\[num\(mb\.objId\)\] = 1;\s*if \(d < bd\)/.test(ht) && ht.includes('sWhy = `${mb.Name}: ${pk.why}`; return no(mb); }') && /lvl > L \+ 3 \|\| lvl < L - 8\)\) return no\(mb\)/.test(ht), 'huntTarget records solo-pull and level refusals');
console.log(fails ? `${fails} FAILED` : 'all huntable checks passed'); process.exit(fails ? 1 : 0);
