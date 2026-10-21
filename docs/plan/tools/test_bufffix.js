// OFFLINE TEST of BUFFFIX-2026-10-21 + MTFIX-2026-10-21 (public tester Vykaax; AUTOMATION_LOG 2026-10-21). Nothing live: functions are cut out of
// Scripts_dev/swarm.js and run on a fake clock with stubbed host globals.
//   node docs/plan/tools/test_bufffix.js        (exit code 1 when a check fails)
//   A  waitOutOfCombat: waits for a clear moment (out of combat + no hit for 8 s, held 3 s), steps out of reach once after 15 s, gives up at the max
//   B  the buff turn: never clicks in a fight, a fight refusal is no board failure (short retry, no back-off), town clears the back-off,
//      self-defence stays off during the turn, no second click in a fight, the leader holds the pulls while a teammate buffs
//   C  resAfterStep: "board buffs refused" instead of "buffs done" after a refused board
//   D  mtFight: the fight time is summed per waypoint (the wait clock is not reset), fightDone after fightMaxMs in total; the leader fights when
//      nobody else can kill; a member held in a fight without progress counts as stuck
//   E  the chosen room: 'arrived' only inside it; the dashboard keeps the white outline while the party hunts elsewhere
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const src = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'Dashboard', 'index.html'), 'utf8');
let fails = 0, passes = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (c) passes++; else fails++; };
/** the text of one top-level function (from its header to the next line starting with "}") */
function fnText(name) {
  const re = new RegExp('^(async )?function ' + name + '\\(', 'm'), m = re.exec(src); if (!m) throw new Error('missing ' + name);
  const end = src.indexOf('\n}\n', m.index); return src.slice(m.index, end + 2);
}
const lineOf = (name) => { const m = new RegExp('^(async )?function ' + name + '\\(', 'm').exec(src); return m ? src.slice(0, m.index).split('\n').length : -1; };

(async () => {
  console.log('BUFFFIX + MTFIX (Scripts_dev/swarm.js)');
  // ---- A: waitOutOfCombat on a fake clock
  {
    const mk = (combatUntil, hitUntil) => {
      const W = { t: 0, steps: 0, notes: [] };
      const env = { now: () => W.t, sleep: async (ms) => { W.t += ms; }, Me: { get IsInCombat() { return W.t < combatUntil; }, IsDead: false, Z: 0 },
        lastAttackerOnMe: { id: 1, get at() { return W.t < hitUntil ? W.t : hitUntil; }, for: undefined },
        CONFIG: { buffs: { outOfCombatMaxMs: 45000 } }, safeSpot: () => ({ x: 1, y: 1, dist: 700 }), walkDirect: async () => { W.steps++; W.t += 2000; },
        stopCombatG: () => { }, note: (m) => W.notes.push(m) };
      const body = fnText('bfHitMe') + '\n' + fnText('bfInCombat') + '\n' + fnText('waitOutOfCombat') + '\nreturn waitOutOfCombat;';
      const f = new Function(...Object.keys(env), body)(...Object.values(env));
      return { W, f };
    };
    let k = mk(10000, 9000); let r = await k.f();
    ok(r === true && k.W.t >= 9000 + 8000 + 3000 - 500 && k.W.t <= 21000, `A in a fight for 10 s (last hit at 9 s): true after the 8 s no-hit + 3 s settle (${k.W.t} ms)`);
    k = mk(1e9, 1e9); r = await k.f();
    ok(r === false && k.W.steps === 1 && k.W.t >= 45000, `A never out of combat: false at the 45 s max, stepped out of reach once (${k.W.steps}, ${k.W.t} ms)`);
    k = mk(0, -1e9); r = await k.f();
    ok(r === true && k.W.t <= 3500, `A already out of combat: true after the 3 s settle (${k.W.t} ms)`);
  }
  // ---- B: the buff turn (source shape: host code)
  {
    const turn = fnText('runBuffTurn');
    ok(/await waitOutOfCombat\(\)/.test(turn) && turn.indexOf('waitOutOfCombat()') < turn.indexOf('await buffSelf('), `B runBuffTurn waits out of combat BEFORE the board click (line ${lineOf('runBuffTurn')})`);
    ok(/else if \(inCombatFail && !Me\.IsDead\)[\s\S]{0,200}inCombatRetryMs/.test(turn) && !/inCombatFail[\s\S]{0,120}buffFails = \(state\.buffFails/.test(turn), 'B a turn refused for a fight: short retry, buffFails unchanged (no 5/10/20/40/60 min back-off)');
    ok(/if \(state\.buffTurn\) return;\s+\/\/ BUFFFIX/.test(src), 'B self-defence stays off during my buff turn (it switched the bot ON again)');
    ok(/reclick: !action && !bfInCombat\(\)/.test(src), 'B no second board click in a fight');
    ok(/!buffsPage && bfInCombat\(\)\) \{ const e = new Error[\s\S]{0,140}e\.inCombat = true/.test(src), "B a 'Buffs' timeout in a fight is an in-combat error (not a board failure)");
    ok(/buffBackoffReset\('in town, out of combat'\)/.test(src), 'B in town out of combat the back-off is cleared (the supply visit rebuffs)');
    ok(/buffCurrent && buffCurrent\.name !== Me\.Name && !bfInCombat\(\) && autoLvl\.spot[\s\S]{0,200}holding the pulls/.test(src), 'B the leveling leader holds new pulls while a teammate buffs (max 60 s)');
    ok(/turnTimeoutMs: 150000/.test(src), 'B the leader queue gives a turn 150 s (it may wait 45 s for a clear moment)');
    ok(/A\.boardTries\+\+; if \(!inRaid\(\) && !await waitOutOfCombat\(15000, 2000\)\)/.test(src) && /if \(await waitOutOfCombat\(20000, 2000\)\) await buffSelf\('return trip/.test(src), 'B after a revive + on the return trip: wait out of combat before the board');
  }
  // ---- C: resAfterStep wording (pure)
  {
    const resNum = (v) => Number(v) || 0;
    const f = new Function('resNum', fnText('resAfterStep') + '\nreturn resAfterStep;')(resNum);
    const T = 1e6;
    let s = f({ now: T + 30000, at: T, phase: 'buff', board: true, boardTries: 2, boardOk: false, maxBoard: 2, healer: false });
    ok(s.act === 'done' && /board buffs refused/.test(s.why) && !/buffs done/.test(s.why), `C refused board: "${s.why}"`);
    s = f({ now: T + 30000, at: T, phase: 'buff', board: true, boardTries: 1, boardOk: true, maxBoard: 2, healer: false });
    ok(/^buffs done/.test(s.why), `C board ok: "${s.why}"`);
  }
  // ---- D: mtFight on a fake clock
  {
    const W = { t: 100000 };
    const MT = { critHp: 20, fightMaxMs: 15000, fightMinMs: 3000, packLeft: 5, packR: 300, freshMs: 15000 };
    const MTL = { label: 'Cruma', gate: 7, pts: Array.from({ length: 26 }, (_, i) => ({ x: i * 100, y: 0, z: 0 })), gateSince: 50000, paceSince: 0, emit: () => { }, fightDoneGate: -1 };
    let leash = 0, noDealer = false;
    const env = { MTL, MT, now: () => W.t, sleep: async (ms) => { W.t += ms; }, Send: { StopMove() { } }, note: () => { }, rcTravelFighting: () => true, isLeader: () => true,
      num: Number, Me: { HpPercent: 90, IsAttacking: false, IsDead: false }, IsInCombat: false, stopCombatG: () => { }, mtShow: () => { }, mtPackNear: () => 2,
      mtLeashFight: async () => { leash++; }, logError: () => { }, mtNoDealer: () => noDealer };
    const mtFight = new Function(...Object.keys(env), fnText('mtFight') + '\nreturn mtFight;')(...Object.values(env));
    for (let i = 0; i < 5; i++) await mtFight(() => false);
    ok(MTL.gateSince === 50000, `D the wait clock is NOT reset by the fights (gateSince ${MTL.gateSince})`);
    ok(MTL.fightDoneGate === 7 && MTL.gateFightMs >= 15000, `D 4 short fights (3 s each) + 1 more add up: fightDone after ${MTL.gateFightMs} ms in total`);
    // before the fix one fight of the full 15 s was needed: 4 x 3 s = 12 s must NOT be done yet
    const L2 = Object.assign({}, MTL, { gate: 8, fightDoneGate: -1, gateFightMs: 0 }); Object.assign(MTL, L2);
    for (let i = 0; i < 4; i++) await mtFight(() => false);
    ok(MTL.fightDoneGate === -1 && MTL.gateFightMs === 12000, `D a new waypoint starts its own sum (12 s: not done yet)`);
    await mtFight(() => false);
    ok(MTL.fightDoneGate === 8, 'D ... the 5th short fight there makes it 15 s: the team runs on');
    ok(leash === 0, 'D with damage dealers in the party the leader only holds aggro (PACKSTOP)');
    noDealer = true; await mtFight(() => false);
    ok(leash > 0, 'D only healers / support with the leader: the leader fights himself');
    const nd = fnText('mtNoDealer');
    ok(/HEALER_ROLES\.test/.test(nd) && /every\(/.test(nd), 'D mtNoDealer = every online teammate is a healer');
    ok(/const longFight = fighting && now\(\) - m\.combatSince >= MT\.combatStuckMs/.test(src) && /\(fighting && !longFight\)/.test(src) && /combatStuckMs: 25000/.test(src), 'D a member in a fight without progress for 25 s counts as stuck (was a pause for ever)');
  }
  // ---- E: the chosen room
  {
    const tr = fnText('manualSpotOnTravel');
    ok(/if \(ok && !manualSpotInside\(spot\)\)[\s\S]{0,200}hunting nearby instead \(could not reach/.test(tr) && tr.indexOf('manualSpotInside') < tr.indexOf("manualSwSet('arrived'"), "E 'arrived' only inside the chosen room, else \"hunting nearby instead (could not reach <room>)\"");
    const env = { inPolygon: (x, y, poly) => x >= 0 && x <= 100 && y >= 0 && y <= 100, Me: { X: 50, Y: 50, Z: 0 } };
    const inside = new Function(...Object.keys(env), fnText('manualSpotInside') + '\nreturn manualSpotInside;')(...Object.values(env));
    const room = { poly: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }], floor: { zMin: -100, zMax: 100 } };
    ok(inside(room) === true, 'E inside the polygon on its floor = inside');
    env.Me.X = 500; ok(inside(room) === false, 'E outside the polygon = not inside');
    ok(/const elsewhere = !!\(zone && \(zone\.local \|\| \(zone\.room && zone\.room !== chosen\?\.room\)\)\)/.test(html) && /ms\.status === 'arrived' && !elsewhere/.test(html), 'E dashboard: the white chosen outline stays while the party hunts a local fallback / another room');
  }
  console.log(`\n${passes} passed, ${fails} failed`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('FAIL crashed: ' + (e && e.stack || e)); process.exit(1); });
