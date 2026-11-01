// OFFLINE TEST TANKFOCUS-2026-10-30 (owner: "feel like shaded is changing targets all the time?" -> "Keep the target, taunt the adds"): a tank
// leader's MARKED target (what the party kills) stays while it lives (< 1500, < 45 s); the adds he grabs (help / ATTACKFIRST) do not move it.
'use strict';
const fs = require('fs'), path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'Scripts_dev', 'swarm.js'), 'utf8');
let oks = 0, fails = 0; const check = (ok, w) => { if (ok) oks++; else fails++; console.log((ok ? 'ok   ' : 'FAIL ') + w); };
const lt = SRC.slice(SRC.indexOf('function assistLeaderTick()'), SRC.indexOf('function assistLeaderTick()') + 4000);
const fi = lt.indexOf('TANKFOCUS-2026-10-30'), ei = lt.indexOf("App.emit('swarm.ltgt'");
check(fi > 0 && ei > fi, 'the focus rule runs before the announcement');
check(/ROLE_RE\.tank\.test\(state\.role \|\| ''\) && id && F && F\.id && F\.id !== id/.test(lt), 'only a TANK leader, only when his target changed away from the marked one');
check(/fm && !fm\.IsDead && Math\.hypot\(num\(fm\.X\) - Me\.X, num\(fm\.Y\) - Me\.Y\) <= 1500 && now\(\) - F\.at < 45000\) \{ id = F\.id; m = fm;/.test(lt), 'the marked target stays while alive, within 1500, marked < 45 s ago');
check(/else assistSt\.focus = \{ id, at: now\(\) \};/.test(lt), 'dead / gone / too old: the monster the tank holds becomes the next marked target');
console.log(`\ntank focus: ${oks} ok, ${fails} failed`); process.exit(fails ? 1 : 0);
