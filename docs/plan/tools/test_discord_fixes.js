// OFFLINE TEST of the Discord backlog fixes 2026-10-12 (docs/plan/backlog_2026-10-12.md): D5 (L2Swarm window minimize = option, default off),
// D6 (songs / dances not re-sung after a reload), D7 (no self buffs / attack casts in towns), D14 (towns ONLY with .townname).
// Runs the DISCORDFIX-PURE block of swarm.js in node + source checks of the host wiring:
//   node docs/plan/tools/test_discord_fixes.js [swarm.js]      (or SWARM_JS=<file>; default Scripts_dev/swarm.js; exit 1 on a failure)
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const SRC = process.argv.slice(2).filter(a => !/^--/.test(a))[0] || process.env.SWARM_JS || process.env.SWARM_SRC || path.join(ROOT, 'Scripts_dev', 'swarm.js');
const src = fs.readFileSync(SRC, 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL: ' + m); } };
const blk = (n) => { const a = src.indexOf(`// ${n}-BEGIN`), b = src.indexOf(`// ${n}-END`); if (a < 0 || b < a) throw new Error(`${n} block not found in ${SRC} (patch not applied?)`); return src.slice(a, b); };
const M = new Function(blk('DISCORDFIX-PURE') + '\nreturn { DFIX, dfSelfBuffSkip, dfStepStillUp, dfTownRule, dfTownBadSet };')();

// ---- D6 / D7: which self buffs autoSkillTick may cast
{
  const S = M.dfSelfBuffSkip;
  ok(S({ name: 'Song of Earth', scope: 'PARTY', abType: 'SONG_OF_EARTH' }, {}) !== '', 'a song is never a self buff');
  ok(S({ name: 'Dance of Fury', scope: 'PARTY', abType: 'DANCE_OF_FURY' }, { upkeep: false }) !== '', 'a dance is never a self buff, even without the upkeep');
  ok(S({ name: 'Dance of the Warrior', scope: '', abType: '' }, {}) !== '', 'a dance found by name when the type is empty');
  ok(S({ name: 'War Chant', scope: 'PARTY', abType: 'PA_UP' }, { upkeep: true }) !== '', 'party chant: the buffer upkeep owns it');
  ok(S({ name: 'War Chant', scope: 'PARTY', abType: 'PA_UP' }, { upkeep: false }) === '', 'party chant without an upkeep: still a self buff (old behaviour)');
  ok(S({ name: 'Battle Roar', scope: 'SINGLE', abType: 'MAX_HP_UP' }, { town: true }) !== '', 'no self buffs in a town');
  ok(S({ name: 'Battle Roar', scope: 'SINGLE', abType: 'MAX_HP_UP' }, { town: false }) === '', 'self buffs in the field stay');
  ok(S({ name: 'Rage', scope: '', abType: 'PA_UP_SPECIAL' }, null) === '', 'no ctx = field');
}
// ---- D6: a cycle step whose song / dance is still up on most of the party is skipped (a reload re-sang everything)
{
  const U = M.dfStepStillUp, mk = (me, dist, remain, extra) => Object.assign({ me, dist, dead: false, known: true, buffs: remain == null ? {} : { SONG_OF_EARTH: { remain } } }, extra || {});
  ok(U('SONG_OF_EARTH', [mk(true, 0, 100), mk(false, 300, 100), mk(false, 400, 90)], 120) === true, 'up on all with 90-100 s of 120 left: skipped');
  ok(U('SONG_OF_EARTH', [mk(true, 0, 40), mk(false, 300, 40), mk(false, 400, 40)], 120) === false, 'only 40 s of 120 left (< 60): sung again');
  ok(U('SONG_OF_EARTH', [mk(true, 0, 100), mk(false, 300, null), mk(false, 400, null)], 120) === false, 'missing on most members: sung');
  ok(U('SONG_OF_EARTH', [mk(true, 0, 100), mk(false, 300, 100), mk(false, 400, null)], 120) === true, 'up on 2 of 3: skipped');
  ok(U('SONG_OF_EARTH', [mk(true, 0, 100), mk(false, 5000, null), mk(false, 6000, null)], 120) === true, 'far members do not count (only the gathered party)');
  ok(U('SONG_OF_EARTH', [mk(true, 0, 100), mk(false, 300, null, { known: false }), mk(false, 300, null, { dead: true })], 120) === true, 'unknown / dead members do not count');
  ok(U('SONG_OF_EARTH', [mk(true, 0, 0), mk(false, 300, 0)], 120) === false, 'remain 0 = expired: sung');
  ok(U('SONG_OF_EARTH', [mk(true, 0, 400), mk(false, 300, 400)], 600) === true, '10-min song with 400 s left (> 300): skipped');
  ok(U('SONG_OF_EARTH', [mk(true, 0, 250), mk(false, 300, 250)], 600) === false, '10-min song with 250 s left (< 50 %): sung');
  ok(U('', [mk(true, 0, 100)], 120) === false && U('SONG_OF_EARTH', [], 120) === false, 'no type / nobody: never skipped');
  ok(M.DFIX.cycle.settleMs >= 10000, 'a new cycle waits >= 10 s after a (re)load (swarm.rotme goes out every 5 s)');
}
// ---- D14: towns only with .townname
{
  const R = M.dfTownRule;
  ok(R({ hasCmd: true, enabled: true, bad: false }) === 'town', 'command town: .townname only');
  ok(R({ hasCmd: true, enabled: true, bad: true }) === 'gk', 'command the server lacks: gatekeeper allowed');
  ok(R({ hasCmd: true, enabled: false, bad: false }) === 'gk', '.town switched off: gatekeeper allowed');
  ok(R({ hasCmd: false, enabled: true, bad: false }) === 'gk', 'village without a command (Dwarven, Kamael ...): gatekeeper');
  let t = 1000000; const B = M.dfTownBadSet(() => t);
  B.add('heine'); ok(!B.has('heine') && B.hits('heine') === 1, 'ONE Usage answer does not mark .heine as missing');
  t += 5000; B.add('heine'); ok(B.has('heine') && B.list().includes('heine'), 'a 2nd Usage answer within 30 min: missing');
  t += 1800001; ok(!B.has('heine'), 'missing only for 30 min, then .heine is tried again');
  B.add('goddard'); t += 1800001; B.add('goddard'); ok(!B.has('goddard') && B.hits('goddard') === 1, 'two answers 30+ min apart do not add up');
}
// ---- host wiring (source checks)
{
  const n = (re) => (src.match(re) || []).length;
  ok(/abType: abnormal\.toUpperCase\(\)/.test(src), 'buildSkillPlan keeps the abnormal type (abType)');
  ok(/const sbCtx = dfZoneNow\(\)[\s\S]{0,200}for \(const b of hasServerBuffs \? \[\] : plan\.selfBuffs\) \{\n\s+if \(dfSelfBuffSkip\(b,/.test(src), 'autoSkillTick filters every self buff through dfSelfBuffSkip');
  ok(/for \(const pb of sbCtx\.town \? \[\]/.test(src), 'no class party buffs in a town');
  ok(/if \(isHealerRole\(\)\) return;[^\n]*\n\s+if \(sbCtx\.peace\) return \{ next: 1000 \};/.test(src), 'no attack casts in a peace zone');
  ok(/BUFFUP\.dfBorn < DFIX\.cycle\.settleMs/.test(src), 'rkCycleTick waits after a (re)load');
  ok(/const name = seq\[step\]\.skill, s = rot\.find\(x => x\.name === name\);\n\s+if \(s && dfStepStillUp\(s\.ab, people, s\.time/.test(src), 'rkCycleTick skips a step still up on the party');
  ok(/const townCmdBad = dfTownBadSet\(/.test(src), 'townCmdBad is the timed 2-answer set');
  ok(/!opts\.only \|\| k === wantTown/.test(src), 'townCommand { only: true } = that town or nothing');
  ok(n(/townCommand\([^\n]*, \{ only: true \}\)/g) >= 4, 'gkTeleport, both route-hop loops and teleportNear ask for exactly that town');
  ok(!/did not work \(\$\{why\}\) — trying the gatekeeper/.test(src), 'the old "trying the gatekeeper" fallback for command towns is gone');
  ok(/async function gkTeleportInner\(wanted, why\) \{\n\s+\/\/ D14[\s\S]{0,400}dfTownRule\(/.test(src), 'gkTeleportInner refuses a command town (the one place every gatekeeper click goes through)');
}
// ---- D5: l2swarm_ctl.ps1 minimizes only when swarm.config.json l2swarm.minimizeWindow is true (default off)
{
  const ps = fs.readFileSync(path.join(ROOT, 'docs', 'plan', 'tools', 'l2swarm_ctl.ps1'), 'utf8');
  ok(/SwarmCfgValue \$SwarmCfg 'l2swarm\.minimizeWindow' \$false/.test(ps), 'ctl reads l2swarm.minimizeWindow, default $false');
  ok(/if \(\$minimizeWin -and -not \(Test-Path "\$root\\Logs\\keep_window_open\.flag"\)/.test(ps), 'minimize only when the option is on (keep_window_open.flag still wins)');
  const ex = JSON.parse(fs.readFileSync(path.join(ROOT, 'swarm.config.example.json'), 'utf8'));
  ok(ex.l2swarm && ex.l2swarm.minimizeWindow === false, 'swarm.config.example.json documents l2swarm.minimizeWindow = false');
}
console.log(`test_discord_fixes: ${pass} passed, ${fail} failed (${path.basename(SRC)})`);
process.exit(fail ? 1 : 0);
