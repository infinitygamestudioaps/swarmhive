// OFFLINE TEST of docs/requirements/hunting.md R2 (owner 2026-10-20: "yes make it 5 minutes" - Spoiler8 stood 20 min in an empty spot).
//   node docs/plan/tools/test_empty_spot.js        (exit code 1 when a check fails)
// 1) EMPTY5 pure: empty5Decide - leave after 5 min with no monster / kill / experience; never a dashboard choice, never while fighting.
// 2) Source: autoLevelLoop runs the check only AT the picked spot (walks never count), marks the spot empty + skips it 30 min, and
//    a monster found by huntTarget restarts the clock.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..', '..', '..');
const src = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
let fails = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails++; };
const fnSrc = (name) => { const i = src.indexOf('function ' + name + '('); if (i < 0) return ''; let n = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) { if (src[k] === '{') n++; else if (src[k] === '}' && --n === 0) return src.slice(i, k + 1); } return ''; };

const sk = (src.match(/const SPOTKEEP = \{[^}]*\};/) || [''])[0];
check(/emptyMs:\s*300000/.test(sk), 'SPOTKEEP.emptyMs = 300000 (5 minutes, owner 2026-10-20)');
const fn = fnSrc('empty5Decide');
check(!!fn, 'empty5Decide exists');
const sb = { Math, Number, String, isFinite };
vm.createContext(sb);
vm.runInContext(`${sk}\n${fn}\nthis.D = empty5Decide;`, sb);
const D = sb.D, t = 1e12, base = { now: t, since: t - 301000, expGain: 0, userPick: false, fighting: false };
const E = (o) => D(Object.assign({}, base, o));
check(E({}).leave === true, 'Spoiler8 case: 5 min at the spot, no monster / kill / exp -> leave');
check(E({ since: t - 299000 }).leave === false, '4 min 59 s: stay');
check(E({ since: t - 1200000 }).leave === true, '20 min empty -> leave (never waits for the 2 x 10 min windows)');
check(E({ expGain: 50 }).leave === false, 'experience gained in the window: stay');
check(E({ fighting: true }).leave === false, 'fighting right now: stay');
check(E({ userPick: true }).leave === false, 'a spot the player chose on the dashboard: stay (the player decides)');

// source wiring
const loopAt = src.indexOf('EMPTY5-2026-10-20 (owner');
const chunk = loopAt >= 0 ? src.slice(loopAt, loopAt + 3500) : '';
check(loopAt >= 0, 'the empty-spot check is in autoLevelLoop');
check(/atPickedSpot\) autoLvl\.emptyAwayAt = now\(\)/.test(chunk) && /mark && atPickedSpot/.test(chunk), 'only time AT the picked spot counts (walking there never does)');
check(/emptyZoneMark\(sp/.test(chunk) && /autoLvl\.bad\[spotKeyOf\(sp\)\] = now\(\) \+ 1800000/.test(chunk), 'an empty spot is marked empty and skipped for 30 min');
check(/teamKillTimes/.test(chunk) && /mobSeenAt/.test(chunk), 'a team kill or a monster seen restarts the clock');
check(/if \(t\) \{ autoLvl\.mobSeenAt = now\(\);/.test(src), 'huntTarget finding a monster stamps mobSeenAt');
check(loopAt > 0 && loopAt < src.indexOf('Videre til næste område'), 'it runs before the 10-min window check');

console.log(fails ? `\n${fails} check(s) FAILED` : '\nall checks passed');
process.exit(fails ? 1 : 0);
