// OFFLINE TEST of the autolevel re-pick fix (bug found 2026-10-09 14:35 while monitoring: party leaders re-ran the whole spot setup every
// 4-7 s while already hunting at the spot: "autolevel: spot Windy Hill: area 2 (lvl 28-30)" + "autolevel: hunting inside the drawn area ..."
// Destroyer3 44x, Crafter1 34x in ~4 min, 724-859 such lines per hour in Logs/swarm_buffs.log).
// Cause: autoLevelLoop re-picked when `Me.Level > spot.levelMax + 2` (the LEADER's level, while pickSpot picks for the team's lowest level or
// returns the dashboard choice whatever its level) and treated every pickSpot result as a new spot (`spot !== autoLvl.spot`: a new object every
// time) -> claim + 1.5-2.5 s wait + travelToSpot + SetCombatPolygon + 2 notes on every loop pass.
//   node docs/plan/tools/test_spot_repick.js        (exit code 1 when a check fails; nothing reaches the game)
// 1) SPOTREPICK-PURE of Scripts_dev/swarm.js: spotRepickDue, spotRepickKey, spotShapeSig, spotRepickDecide.
// 2) a simulated leader loop (virtual clock, 1 h) with the OLD and the NEW rule for the three leaders of the incident + an automatic spot:
//    "autolevel: spot" notes per hour before / after; and the events that MUST still re-pick: dashboard choice changed, rotation to the next
//    chosen area, another party's earlier claim, outgrown automatic spot, pushed away from the spot (> 1500 outside its outline / other floor).
// 3) the real counts per leader and hour in Logs/swarm_buffs.log (information only, when the log exists).
// 4) source checks of the call site in autoLevelLoop.
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const src = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
let fails = 0, n = 0;
const check = (ok, what) => { n++; console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails++; };
const blk = (b, e) => { const i = src.indexOf(b), j = src.indexOf(e); if (i < 0 || j < i) { console.error(b + ' block not found'); process.exit(1); } return src.slice(i, j); };
const M = new Function(blk('// SPOTREPICK-PURE-BEGIN', '// SPOTREPICK-PURE-END') + '\nreturn { SPOT_REPICK, spotRepickDue, spotRepickKey, spotShapeSig, spotRepickDecide, MOVE_ON, mobsTooLowBelow, moveOnWhy };')();

// spots as pickSpot builds them (a NEW object on every call, like manualSpot's Object.assign / areaSpotOf / roomSpotOf)
const poly = (cx, cy, r) => Array.from({ length: 12 }, (_, k) => ({ x: Math.round(cx + Math.cos(k * Math.PI / 6) * r), y: Math.round(cy + Math.sin(k * Math.PI / 6) * r) }));
const windy2 = (o) => Object.assign({ name: 'Windy Hill: area 2', levelMin: 28, levelMax: 30, center: { x: 10000, y: 20000, z: -3000 }, radius: 1500, noScale: true,
  area: { region: 'windy-hill', id: 'windy-hill-2', n: 2 }, poly: poly(10000, 20000, 1500), zr: [-3400, -2600], floor: null, manual: true,
  multi: { kind: 'field', ids: ['windy-hill-2', 'windy-hill-3'], order: 'nearest' } }, o || {});
const windy3 = (o) => Object.assign(windy2(), { name: 'Windy Hill: area 3', center: { x: 14000, y: 20000, z: -3000 }, area: { region: 'windy-hill', id: 'windy-hill-3', n: 3 }, poly: poly(14000, 20000, 1500) }, o || {});
const validus = (o) => Object.assign({ name: 'Cruma Tower: 2nd floor, right: Validus room', levelMin: 46, levelMax: 47, center: { x: 17000, y: 114000, z: -9000 }, radius: 800, noScale: true,
  room: { id: 'cruma-2-right-a', dungeon: 'Cruma Tower', floor: 2 }, floor: { zMin: -9200, zMax: -8800 }, poly: poly(17000, 114000, 700), manual: true }, o || {});
const ossiud = (o) => Object.assign(validus(), { name: 'Cruma Tower: 2nd floor, left: Ossiud room', levelMin: 47, levelMax: 49, room: { id: 'cruma-2-left-b', dungeon: 'Cruma Tower', floor: 2 }, center: { x: 15000, y: 114000, z: -9000 }, poly: poly(15000, 114000, 700) }, o || {});
const beeAuto = (o) => Object.assign({ name: 'Bee Hive: area 2', levelMin: 37, levelMax: 40, center: { x: 20000, y: 180000, z: -3500 }, radius: 1500, noScale: true,
  area: { region: 'bee-hive', id: 'bee-hive-2', n: 2 }, poly: poly(20000, 180000, 1500), zr: [-3900, -3100] }, o || {});
const datapack = (o) => Object.assign({ name: 'Plains of Dion', levelMin: 30, levelMax: 36, center: { x: 30000, y: 150000, z: -3500 }, radius: 3000 }, o || {});

// ---- 1) pure functions ------------------------------------------------------------------------------------------------------
{
  const D = M.spotRepickDue, t0 = 1e9;
  check(D({ now: t0, lastPick: 0, spot: null, level: 30 }) === true, 'due: nothing picked yet');
  check(D({ now: t0 + 5000, lastPick: t0, spot: windy2(), level: 36 }) === false, 'due: dashboard choice (lvl 28-30), team lvl 36 -> NOT due 5 s later (the bug: due on every pass)');
  check(D({ now: t0 + 299000, lastPick: t0, spot: windy2(), level: 36 }) === false, 'due: dashboard choice -> not due before 5 min');
  check(D({ now: t0 + 300001, lastPick: t0, spot: windy2(), level: 36 }) === true, 'due: every 5 min as before');
  check(D({ now: t0 + 5000, lastPick: t0, spot: beeAuto(), level: 43 }) === false, 'due: outgrown automatic spot -> not before 60 s (throttle)');
  check(D({ now: t0 + 61000, lastPick: t0, spot: beeAuto(), level: 43 }) === true, 'due: outgrown automatic spot (team 43 > 40 + 2) -> due after 60 s');
  check(D({ now: t0 + 61000, lastPick: t0, spot: beeAuto(), level: 42 }) === false, 'due: team 42 = 40 + 2 is not outgrown');
  check(D({ now: t0 + 61000, lastPick: t0, spot: null, level: 99 }) === false, 'due: no spot (local fallback) -> the 5-min rule only');
  const K = M.spotRepickKey;
  check(K(windy2()) === 'area:windy-hill-2' && K(validus()) === 'room:cruma-2-right-a' && K(datapack()) === 'Plains of Dion' && K(null) === '', 'key: area / room / name (same as spotKeyOf)');
  const spotKeyOfSrc = /const spotKeyOf = \(s\) => \(s && s\.room && s\.room\.id\) \? `room:\$\{s\.room\.id\}` : \(s && s\.area && s\.area\.id\) \? `area:\$\{s\.area\.id\}` : String\(\(s && s\.name\) \|\| ''\)/.test(src);
  check(spotKeyOfSrc, 'key: spotKeyOf in swarm.js still has the same rule (room > area > name)');
  const S = M.spotRepickDecide;
  check(S(windy2(), windy2(), { atPrev: true }) === 'same', 'decide: same area, a NEW object, I am there -> same (keep hunting)');
  check(S(validus(), validus(), { atPrev: true }) === 'same', 'decide: same room, new object -> same');
  check(S(datapack(), datapack(), { atPrev: true }) === 'same', 'decide: same datapack spot (by name) -> same');
  check(S(windy2(), windy3(), { atPrev: true }) === 'new', 'decide: rotation to area 3 -> new (claim + travel)');
  check(S(null, windy2(), { atPrev: false }) === 'new', 'decide: no spot before -> new');
  check(S(windy2(), null, { atPrev: true }) === 'none', 'decide: pickSpot gave nothing -> none (keep the old one, as before)');
  check(S(windy2(), windy2(), { atPrev: false }) === 'new', 'decide: same spot but I am not at it (pushed out / other floor) -> new = travel again');
  check(S(windy2(), windy2(), { atPrev: true, localFb: true }) === 'new', 'decide: the last setup was a local fallback -> new (travel to the spot)');
  check(S(windy2(), windy2({ poly: poly(10000, 20000, 1700) }), { atPrev: true }) === 'reshape', 'decide: outline edited in the shape editor -> reshape (zone setup, no trip)');
  check(S(datapack(), datapack({ circles: [{ x: 1, y: 2, r: 300 }] }), { atPrev: true }) === 'reshape', 'decide: a new exclusion circle -> reshape');
  check(S(beeAuto(), beeAuto({ manual: true }), { atPrev: true }) === 'new', 'decide: the automatic spot became the dashboard choice -> new (status + claim)');
  check(S(datapack(), datapack({ assist: true }), { atPrev: true }) === 'new', 'decide: assist flag changed -> new');
  check(M.spotShapeSig(windy2()) === M.spotShapeSig(windy2()), 'shape: deterministic for equal spots');
}

// ---- 2) simulated leader loop (virtual clock) --------------------------------------------------------------------------------
// One loop pass = 1.5 s sleep + 0-3 s hunting; a NEW pick adds the claim wait (1.5-2.5 s) + travelToSpot (0 s when already there).
// world: { level, pickLvl, spotAt(t) -> spot factory, here(t) -> I am at the current spot, events: [{ t, kind }] }
function simulate(world, rule, hours) {
  let t = 0, lastPick = 0, cur = null, localFb = false, notes = 0, picks = 0, trips = 0, zone = 0, rnd = 12345;
  const rand = () => { rnd = (rnd * 1103515245 + 12345) % 2147483648; return rnd / 2147483648; };
  const end = hours * 3600000, ev = (world.events || []).slice();
  const log = [];
  while (t < end) {
    // events that reset the pick (dashboard change / rotation / rival claim / regroup): the loop sets autoLvl.spot = null; lastPick = 0
    while (ev.length && ev[0].t <= t) { const e = ev.shift(); cur = null; lastPick = 0; log.push(`${Math.round(t / 1000)}s ${e.kind}`); }
    const level = world.level(t), pickLvl = world.pickLvl(t);
    let due;
    if (rule === 'old') due = !lastPick || t - lastPick > 300000 || (cur && level > cur.levelMax + 2);
    else due = M.spotRepickDue({ now: t || 1, lastPick, spot: cur, level: pickLvl });
    let pass = 1500 + rand() * 3000;
    if (due) {
      lastPick = t || 1; picks++;
      const next = world.spotAt(t)();
      let kind;
      if (rule === 'old') kind = next && next !== cur ? 'new' : 'none';
      else kind = M.spotRepickDecide(cur, next, { atPrev: cur ? world.here(t, cur) : false, localFb });
      if (kind === 'same' || kind === 'reshape') cur = next;
      if (kind === 'new') { cur = next; pass += 1500 + rand() * 1000; notes++; trips++; }
      if (kind !== 'same') zone++;
      localFb = false;
    }
    t += pass;
  }
  return { notes, picks, trips, zone, perHour: notes / hours, log };
}
const always = () => true;
const fixed = (f) => () => f;
const cases = [
  { who: 'Destroyer3 (lvl 36, team min 30) at his dashboard choice Windy Hill area 2 (lvl 28-30)', level: () => 36, pickLvl: () => 30, spotAt: fixed(windy2), here: always },
  { who: 'Crafter1 (lvl 51) in his dashboard room Validus (lvl 46-47)', level: () => 51, pickLvl: () => 51, spotAt: fixed(validus), here: always },
  { who: 'Tank1 (lvl 52) in his dashboard room Ossiud (lvl 47-49)', level: () => 52, pickLvl: () => 51, spotAt: fixed(ossiud), here: always },
  { who: 'an automatic spot that fits the team (lvl 38 at Bee Hive 37-40)', level: () => 38, pickLvl: () => 38, spotAt: fixed(beeAuto), here: always },
];
const results = [];
cases.forEach(c => {
  const o = simulate(c, 'old', 1), nw = simulate(c, 'new', 1);
  results.push({ who: c.who, before: o.notes, after: nw.notes });
  console.log(`     ${c.who}: "autolevel: spot" notes per hour ${o.notes} before -> ${nw.notes} after (zone setups ${o.zone} -> ${nw.zone}, picks ${o.picks} -> ${nw.picks})`);
});
check(results[0].before > 500 && results[1].before > 500 && results[2].before > 500, 'old rule reproduces the incident: > 500 spot notes per hour for each of the three leaders (log: 724-859 per hour in total)');
check(results.every(r => r.after === 1), 'new rule: ONE spot note per hour for each leader staying at its spot (the first pick)');
check(results[3].before === 12 && results[3].after === 1, 'a fitting automatic spot: before = a full re-setup + note every 5 min (12/h, new object each pick), after = 1');

// events that must still re-pick and travel
{
  const ev = [{ t: 20 * 60000, kind: 'rotation: area 2 empty 35 s -> area 3' }, { t: 30 * 60000, kind: 'dashboard choice changed' }, { t: 40 * 60000, kind: 'rival claim: yield' }, { t: 50 * 60000, kind: 'regroup in Giran' }];
  const w = { level: () => 36, pickLvl: () => 30, spotAt: (t) => t >= 20 * 60000 && t < 30 * 60000 ? windy3 : windy2, here: always, events: ev };
  const r = simulate(w, 'new', 1);
  check(r.notes === 5, `new rule + 4 events (rotation, dashboard change, rival claim, regroup) -> 5 spot notes / trips in the hour (got ${r.notes})`);
}
{
  // pushed away: at minute 12 the leader is chased out of the area for good (> 1500 outside its outline) -> the next 5-min re-pick travels back
  const w = { level: () => 36, pickLvl: () => 30, spotAt: fixed(windy2), here: (t) => !(t > 12 * 60000 && t < 16 * 60000) };
  const r = simulate(w, 'new', 1);
  check(r.trips === 2, `pushed away from the spot -> one extra trip back at the next re-pick (got ${r.trips} trips)`);
}
{
  // outgrown AUTOMATIC spot: team min reaches 43 at minute 10 (Bee Hive 37-40) -> re-picked within ~60 s, a better spot is taken
  const w = { level: () => 45, pickLvl: (t) => t > 10 * 60000 ? 43 : 38, spotAt: (t) => t > 10 * 60000 ? datapack.bind(null, { name: 'Field of Silence', levelMin: 42, levelMax: 48 }) : beeAuto, here: always };
  const r = simulate(w, 'new', 1);
  check(r.trips === 2, `outgrown automatic spot -> moves on once (got ${r.trips} trips)`);
}
{
  // outgrown automatic spot and pickSpot finds NOTHING better (gives the same spot again): at most one re-pick a minute, no notes
  const w = { level: () => 45, pickLvl: () => 43, spotAt: fixed(beeAuto), here: always };
  const r = simulate(w, 'new', 1);
  check(r.notes === 1 && r.picks <= 62, `outgrown but nothing better -> 1 note, ${r.picks} quiet re-picks (<= 1 per min)`);
}

// ---- 3) the real log (information) --------------------------------------------------------------------------------------------
{
  const f = path.join(ROOT, 'Logs', 'swarm_buffs.log');
  if (fs.existsSync(f)) {
    try {
      const st = fs.statSync(f), fd = fs.openSync(f, 'r'), len = Math.min(st.size, 40 * 1024 * 1024), buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, st.size - len); fs.closeSync(fd);
      const cnt = {};
      buf.toString('utf8').split('\n').forEach(l => { const m = /^(\d{4}-\d\d-\d\dT\d\d):.*?\[([^\]]+)\] autolevel: spot /.exec(l); if (m) { const k = `${m[2]} ${m[1]}`; cnt[k] = (cnt[k] || 0) + 1; } });
      const top = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a]).slice(0, 8);
      console.log('     real log (before the fix): "autolevel: spot" lines per leader and UTC hour, top 8:');
      top.forEach(k => console.log(`       ${k}h: ${cnt[k]}`));
    } catch (e) { console.log('     (log not readable: ' + e.message + ')'); }
  }
}

// ---- 3b) move-on checks (coordinator 2026-10-09 15:35: Tank3 party 32-33 left Abandoned Camp area 3 for "mobs too low (avg 29.0)") ----
{
  const W = (o) => M.moveOnWhy(Object.assign({ mins: 3.5, recentKills: 10, expGain: 2, avgMob: null, pickLvl: 30, teamMax: 30, spot: null }, o));
  // the H5 exp penalty itself (L2J calculateExpAndSp): factor (5/6)^(diff-5) from diff 6
  const xpFactor = (diff) => diff > 5 ? Math.pow(5 / 6, diff - 5) : 1;
  check(xpFactor(5) === 1 && Math.abs(xpFactor(6) - 0.833) < 0.001 && Math.abs(xpFactor(8) - 0.579) < 0.001, 'H5 penalty: none up to 5 levels, 83 % at 6, 58 % at 8');
  check(W({ avgMob: 29.0, pickLvl: 32, teamMax: 33 }) === '', 'Tank3 15:35: team 32-33, monsters avg 29.0 -> stay (old rule: leader 33 - 2 = 31 -> "mobs too low")');
  const oldRule = (lead, avg) => avg < lead - 2;
  check(oldRule(33, 29.0) === true, '... and the old rule did fire for the same case (regression baseline)');
  check(W({ avgMob: 27.9, pickLvl: 32, teamMax: 33 }) !== '' && /mobs too low/.test(W({ avgMob: 27.9, pickLvl: 32, teamMax: 33 })), 'team 32-33, monsters avg 27.9 (> 5 below the highest = exp penalty) -> mobs too low');
  check(W({ avgMob: 30, pickLvl: 30, teamMax: 40 }) === '', 'spread team 30..40 at the level-30 monsters pickSpot chose for its minimum -> stay (no hop-away churn)');
  check(/mobs too low/.test(W({ avgMob: 27.5, pickLvl: 30, teamMax: 40 })), 'spread team 30..40, monsters 27.5 (below the pick level - 2) -> mobs too low');
  check(W({ avgMob: 35, pickLvl: 40, teamMax: 40 }) === '' && /mobs too low/.test(W({ avgMob: 34.9, pickLvl: 40, teamMax: 40 })), 'uniform team / solo lvl 40: stays down to avg 35 (no H5 penalty), leaves below');
  check(M.mobsTooLowBelow(40, 40) === 35 && M.mobsTooLowBelow(32, 33) === 28 && M.mobsTooLowBelow(30, 40) === 28, 'threshold = min(team max - 5, pick level - 2)');
  check(W({ spot: { levelMax: 30 }, pickLvl: 31, teamMax: 36 }) === '', 'outgrew: team min 31 vs spot max 30 -> stay (old rule: leader 36 > 31 -> leave)');
  check(/outgrew the spot \(team lvl 32 > 30\)/.test(W({ spot: { levelMax: 30 }, pickLvl: 32, teamMax: 36 })), 'outgrew: team min 32 > 30 + 1 -> leave');
  check(/only 2 kills/.test(W({ mins: 5, recentKills: 2 })) && /only 0\.5% exp/.test(W({ mins: 5, expGain: 0.5 })), 'few kills / low exp: unchanged (5 min, < 3 kills, < 1 % per 5 min)');
  check(W({ mins: 4.9, recentKills: 0, expGain: 0 }) === '', 'few kills / low exp: not before 5 min (unchanged)');
}

// ---- 4) source checks ----------------------------------------------------------------------------------------------------------
{
  const i = src.indexOf('async function autoLevelLoop'), j = src.indexOf('\n}\n', i), body = src.slice(i, j);
  const has = (re, what) => check(re.test(body), 'source: ' + what);
  has(/if \(spotRepickDue\(\{ now: now\(\), lastPick, spot: autoLvl\.spot, level: pickLvl \}\)\)/, 'the re-pick test is spotRepickDue with the pick level');
  check(!/Me\.Level > autoLvl\.spot\.levelMax \+ 2/.test(body), 'source: the old leader-level re-pick test is gone');
  check(!/if \(spot && spot !== autoLvl\.spot\)/.test(body), 'source: no object-identity comparison of spots any more');
  has(/const rp = (?:resumedSpot \? 'reshape' : )?spotRepickDecide\(prevSpot, spot, \{ atPrev, localFb: !!localFb \}\)/, 'spotRepickDecide decides new / same / reshape');
  has(/if \(rp === 'new'\) \{[\s\S]{0,200}autoLvl\.spot = spot;[\s\S]{0,600}await writeClaim\(spot/, 'only a NEW spot claims + waits + travels');
  has(/zoneSetup: \{\s*\n\s*if \(rp === 'same'\) \{[\s\S]{0,900}break zoneSetup;/, "a 'same' re-pick skips the zone setup (no SetCombatPolygon, no notes)");
  has(/\}\s*\/\/ zoneSetup\s*\n\s*autoLvl\.expMark = \{ at: now\(\), exp: expNow\(\) \};/, 'the measuring window is still reset at each re-pick (old behaviour)');
  has(/const pickLvl = leadMode\(\) && !solo \? teamMinLevel\(\) : num\(Me\.Level\);[\s\S]{0,400}(?:const|let) spot = pickSpot\(pickLvl, solo\);/, 'pickSpot gets the same level as the re-pick test');
  // the resets the other features use are untouched
  has(/multiTick\(autoLvl\.spot, solo\) === 'move'\) \{ stopCombatG\(\); writeClaim\(null\); autoLvl\.spot = null; lastPick = 0; continue; \}/, 'rotation (multiTick move) still resets the pick');
  has(/manualSpotChanged\(\) && !autoLvl\.forceSpot[\s\S]{0,300}autoLvl\.spot = null; lastPick = 0; writeClaim\(null\); continue;/, 'dashboard change still resets the pick');
  has(/autoLvl\.spot = null; lastPick = 0; claimCache\.at = 0;/, 'claim yield still resets the pick');
  has(/let why = moveOnWhy\(\{ mins, recentKills, expGain, avgMob, pickLvl, teamMax: tMax, spot: autoLvl\.spot \}\)/, 'move-on checks use moveOnWhy with the pick level + team max');
  check(!/avgMob < Me\.Level - 2/.test(body) && !/Me\.Level > autoLvl\.spot\.levelMax \+ 1/.test(body), 'source: the leader-level move-on checks are gone');
  has(/\} else if \(why && autoLvl\.spot && autoLvl\.spot\.manual\) \{/, 'a dashboard choice still only warns for few kills / low mobs / outgrown');
  has(/autoLvl\.spot\.manual && autoLvl\.spot\.moveOn && outMax > 0 && outMin > outMax \+ 3/, "a dashboard choice still ends by itself only with 'move on when outgrown'");
}
console.log(`\n${n - fails}/${n} passed${fails ? ', ' + fails + ' FAILED' : ''}`);
process.exit(fails ? 1 : 0);
