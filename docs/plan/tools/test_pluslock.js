// PLUSLOCK-2026-11-04 guard test (gear.md R12): plused equipment (+1 and up) outside the own bag is never used automatically.
// Owner: "NEVER FUCKING Ever take the +++ weapons from Warehouse!!!! ... Never touch my plused equipment unless i tell you to."
'use strict';
const fs = require('fs'), path = require('path');
const R = path.join(__dirname, '../../..');
let ok = 0, bad = 0; const check = (c, m) => { if (c) { ok++; console.log('ok   ' + m); } else { bad++; console.log('FAIL ' + m); } };
const SRC = fs.readFileSync(path.join(R, 'Scripts_dev', 'swarm.js'), 'utf8');
const cut = (s, a, b) => { const i = s.indexOf(a); return i < 0 ? '' : s.slice(i, s.indexOf(b, i) + b.length); };

// 1) the dashboard helper
const PL = require(path.join(R, 'Dashboard', 'pluslock.js'));
check(PL.plusLocked({ src: 'clan', enchant: 9 }) === true, 'a +9 from the clan warehouse is locked');
check(PL.plusLocked({ src: 'wh', enchant: 1 }) === true, 'a +1 from the own warehouse is locked');
check(PL.plusLocked({ src: 'char', enchant: 8 }) === true, "a +8 from another character's bag is locked");
check(PL.plusLocked({ src: 'clan', enchant: 9 }, true) === false && PL.plusLocked({ src: 'clan', enchant: 9, ownerPick: true }) === false, "the owner's own pick may move it");
check(PL.plusLocked({ src: 'clan', enchant: 0 }) === false, 'a +0 piece is free to use');
check(PL.plusLocked({ src: 'bag', enchant: 9 }) === false, "the character's own bag is not locked");

// 2) the same pure rule in swarm.js
const pure = cut(SRC, '// PLUSLOCK-PURE-BEGIN', '// PLUSLOCK-PURE-END');
check(pure.length > 0, 'PLUSLOCK-PURE block exists in swarm.js');
const sw = new Function(pure + '\nreturn plusLocked;')();
[[{ src: 'clan', enchant: 9 }], [{ src: 'wh', enchant: 3 }], [{ src: 'clan', enchant: 9 }, true], [{ src: 'bag', enchant: 7 }], [{ src: 'clan', enchant: 0 }]].forEach(a =>
  check(sw(...a) === PL.plusLocked(...a), `swarm.js and the dashboard agree: ${JSON.stringify(a)}`));

// 3) whPlan: without the owner's exact pick only +0 pieces
const wp = cut(SRC, 'function whPlan(rows, want) {', '\n}\n');
check(/\(Number\(r\.enchant\) \|\| 0\) < 1\)\)/.test(wp), 'whPlan without an exact enchant takes +0 pieces only');
const whPlan = new Function('WH_SAFE_ENCH', 'WH_PROTECT_ENCH', wp + '\nreturn whPlan;')(4, 10);
const rows = [{ id: 84, objId: 1, count: 1, enchant: 9 }, { id: 84, objId: 2, count: 1, enchant: 9 }];
const p1 = whPlan(rows, [{ id: 84, count: 1 }]);
check(!(p1.take || []).length, 'live case: two +9 Homunkulus\'s Swords in the clan warehouse are never taken by a plain "take 84"');
const p2 = whPlan(rows.concat([{ id: 84, objId: 3, count: 1, enchant: 0 }]), [{ id: 84, count: 1 }]);
check((p2.take || []).length === 1 && Number(p2.take[0].objId) === 3, 'a +0 one next to them is taken');
const p3 = whPlan(rows, [{ id: 84, count: 1, ench: 9 }]);
check((p3.take || []).length === 1, "the owner's exact pick (+9) still works");

// 4) the givers and the upgrade run
check(/function gdBagFree\(id\)[^\n]*EnchantLvl\) < 1/.test(SRC), 'a giver never counts a plused bag piece as spare');
check(/function gdBagRows[\s\S]{0,300}!\(num\(b\.enchant\) >= 1\)/.test(SRC), 'a giver never hands over a plused bag piece');
check(/stackable: st, enchant: en \}/.test(SRC), 'bag rows carry the enchant level');
check(/!\(Number\(x\.enchant\) < 1\)\) return \{ ok: false/.test(SRC), 'the distributors never pass on a plused piece');
check(/if \(plusLocked\(it\)\) \{ fail\(/.test(SRC) && /it\.src === 'char' && plusLocked\(it\)/.test(SRC), 'the upgrade run refuses a plused warehouse / other-bag piece without the owner pick');

// 5) the Upgrade page API + UI
const UA = fs.readFileSync(path.join(R, 'Dashboard', 'upgrade_api.js'), 'utf8'), UP = fs.readFileSync(path.join(R, 'Dashboard', 'upgradepage.js'), 'utf8');
check(/PL\.plusLocked\(b\.item\)/.test(UA), 'POST /api/upgrade/plan refuses a plused piece without the owner pick');
check(/ownerPick: it\.ownerPick === true/.test(UA) && /ownerPick: r\.item\.ownerPick === true/.test(UA), 'the owner pick travels into the job');
check(/\(Number\(r\.enchant\) \|\| 0\) < 1\)\.forEach\(r => \{ const F = IP\.facts/.test(UA), "other characters' spare jewels: +0 only");
check((UP.match(/ownerPick: true/g) || []).length >= 2 && /ownerPick: L\.ownerPick === true/.test(UP), 'the page marks the owner\'s own taps as ownerPick and sends it');

console.log(`pluslock: ${ok} ok, ${bad} failed`); process.exit(bad ? 1 : 0);
