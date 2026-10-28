// HPUNKNOWN-2026-10-27 (tester Hero, quest 281 "Head for the Hills!": "character stands around confused, moving between 2 points in the interval
// of 5 minutes"): a monster nobody targeted yet reports HP 0 / MaxHP 0 (CLAUDE.md 0b2: unknown != 0 %). The quest hunt picker (qeLiveMob), the
// hunting-pairs picker and the solo picker skipped every such monster, so a quest hunt found nothing to attack and walked between its points.
//   node docs/plan/tools/test_hp_unknown.js
'use strict';
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'Scripts_dev', 'swarm.js'), 'utf8');
let fails = 0, n = 0; const ok = (c, m) => { n++; console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
const cut = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i + 1); if (i < 0 || j < 0) throw new Error('block not found: ' + a); return src.slice(i, j); };

const num = (v) => Number(v) || 0;
const hpZeroKnown = new Function('num', cut('function hpZeroKnown(m)', 'function targetGone(') + '\nreturn hpZeroKnown;')(num);
ok(hpZeroKnown({ HpPercent: 0, MaxHP: 0 }) === false, 'HP 0 with MaxHP 0 (never targeted) = unknown, not dead');
ok(hpZeroKnown({ HpPercent: 0, MaxHp: 0 }) === false, '... also with the MaxHp spelling of snapshot rows');
ok(hpZeroKnown({ HpPercent: 0, MaxHP: 120 }) === true, 'HP 0 with a known MaxHP = really at 0 %');

// qeLiveMob on stubs
const me = { X: 0, Y: 0, Z: 0 };
const rows = [
  { objId: 1, Id: 22234, X: 300, Y: 0, Z: 0, HpPercent: 0, MaxHp: 0, IsDead: false },     // Green Goblin, never targeted (the Hero case)
  { objId: 2, Id: 22235, X: 100, Y: 0, Z: 0, HpPercent: 0, MaxHp: 90, IsDead: false },    // really at 0 %
  { objId: 3, Id: 99999, X: 50, Y: 0, Z: 0, HpPercent: 100, MaxHp: 90, IsDead: false },   // not a quest monster
];
rows.forEach(r => { r.ref = r; });
const qeLiveMob = new Function('snapMobs', 'meSnap', 'huntBlacklisted', 'num', 'QE_CFG', 'hpZeroKnown',
  cut('function qeLiveMob(ids, range)', '\n}\n') + '\n}\nreturn qeLiveMob;')(() => rows, () => me, () => false, num, { search: 5000, zMax: 500 }, hpZeroKnown);
const pick = qeLiveMob(new Set([22234, 22235]));
ok(pick && pick.objId === 1, 'quest hunt picks the never-targeted Green Goblin (was: nothing -> walked between its points)');
rows[0].IsDead = true;
ok(qeLiveMob(new Set([22234, 22235])) === null, 'a monster really at 0 % is still not picked');

// the other two pickers use the same rule (source)
ok(/if \(hpZeroKnown\(mb\)\) return;\s+\/\/ HPUNKNOWN-2026-10-27: unknown HP \(never targeted\) is not 0 %\n\s+if \(Math\.abs\(\(mb\.Z \|\| meSnap\(\)\.Z\) - meSnap\(\)\.Z\) > CONFIG\.rest\.zLimit\) return;/.test(src), 'hunting-pairs picker: hpZeroKnown');
ok(/if \(!r \|\| r\.IsDead \|\| hpZeroKnown\(r\)\) \{ delete okIds\[num\(c\.mb\.objId\)\]; continue; \}/.test(src) && /if \(!r \|\| r\.IsDead \|\| hpZeroKnown\(r\)\) continue; best = r;/.test(src), 'solo picker (both passes): hpZeroKnown');
ok(!/num\(mb\.HpPercent\) <= 0\)|num\(r\.HpPercent\) <= 0\)\)/.test(src), 'no picker compares a monster row\'s raw HpPercent with 0 any more');
console.log(fails ? `${fails} of ${n} FAILED` : `all ${n} ok`); process.exit(fails ? 1 : 0);
