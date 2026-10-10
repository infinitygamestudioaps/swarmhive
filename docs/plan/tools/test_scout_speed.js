// OFFLINE TEST of the scout speed mode (user 2026-10-10: "the scout should move as fast as possible; Dagger1 has Silent Move - use it"):
// scoutSpeedTick from Scripts_dev/swarm.js on a simulated Treasure Hunter (Silent Move toggle + Dash) with aggressive monsters near, then gone.
//   node docs/plan/tools/test_scout_speed.js
'use strict';
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'Scripts_dev', 'swarm.js'), 'utf8');
const a = src.indexOf('const SCOUT_SPEED = {'), b = src.indexOf('async function scoutRun(text, o) {');
if (a < 0 || b < 0) { console.log('FAIL scout speed block not found'); process.exit(1); }
let T = 100000, casts = [], cmds = [], mobs = [], stealthOn = false, dashUntil = 0;
const skills = [
  { Id: 221, Name: 'Silent Move', IsToggle: true, IsActive: true, IsReady: true, MP: 10, AbnormalType: 'SILENT_MOVE', TargetType: 'SELF' },
  { Id: 4, Name: 'Dash', IsToggle: false, IsActive: true, IsReady: true, MP: 20, AbnormalType: 'SPEED_UP', TargetType: 'SELF' },
  { Id: 263, Name: 'Deadly Blow', IsToggle: false, IsActive: true, IsReady: true, MP: 30, AbnormalType: '', TargetType: 'ENEMY' },
];
const env = {
  now: () => T, num: Number, note: () => {}, scoutCtl: { on: true }, Me: { IsDead: false, X: 0, Y: 0, MP: 500 }, currentTownKey: () => null,
  RunCommand: (c) => cmds.push(c), hostSnap: { skills: () => skills }, SkillsList: skills,
  Send: { RequestMagicSkillUse: (id) => { casts.push(id); if (id === 221) stealthOn = !stealthOn; if (id === 4) dashUntil = T + 15000; } },
  dangerMobs: () => mobs, toggleActive: (id) => id === 221 ? stealthOn : false, BuffLow: (id) => id === 4 ? T > dashUntil - 3000 : true,
};
const tick = new Function(...Object.keys(env), src.slice(a, b) + '\nreturn scoutSpeedTick;')(...Object.values(env));
let fails = 0; const ok = (c, w) => { console.log((c ? 'ok   ' : 'FAIL ') + w); if (!c) fails++; };
tick(); ok(cmds.includes('/run'), 'run mode on at the start'); ok(casts.includes(4) && !casts.includes(221), 'no monsters near: Dash cast, Silent Move stays off');
ok(!casts.includes(263), 'never an attack skill');
casts = []; T += 3000; mobs = [{ x: 500, y: 0, r: 600 }]; tick();
ok(casts.includes(221) && stealthOn, 'aggressive monster near: Silent Move switched ON');
casts = []; T += 3000; tick(); ok(!casts.length, 'while sneaking: no recast, no Dash (a cast could break stealth)');
casts = []; mobs = []; T += 3000; tick(); ok(!casts.includes(221) && stealthOn, 'calm for 0 s: Silent Move still on');
T += 9000; tick(); ok(casts.includes(221) && !stealthOn, 'calm for 9 s: Silent Move switched OFF again (full speed)');
casts = []; T += 3000; dashUntil = 0; tick(); ok(casts.includes(4), 'Dash again when it ran out');
env.scoutCtl.on = false; casts = []; T += 5000; tick(); ok(!casts.length, 'no scout trip: nothing happens');
console.log(fails ? `${fails} FAILED` : 'all scout speed checks passed'); process.exit(fails ? 1 : 0);
