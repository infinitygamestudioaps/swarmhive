// OFFLINE TEST of BUFFFIX-2026-10-21 + MTFIX-2026-10-21 (public tester Vykaax; AUTOMATION_LOG 2026-10-21). Nothing live: functions are cut out of
// Scripts_dev/swarm.js and run on a fake clock with stubbed host globals.
//   node docs/plan/tools/test_bufffix.js        (exit code 1 when a check fails)
//   A  waitOutOfCombat: waits for a clear moment (out of combat + no hit for 8 s, held 3 s), steps out of reach once after 15 s, gives up at the max
//   B  the buff turn: never clicks in a fight, a fight refusal is no board failure (short retry, no back-off), town clears the back-off,
//      BUFFFIX2: self-defence fights back during the turn, the bot stays on (follow, no assist), a fight is no failed attempt, the pull hold only with buffHoldPulls
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
    ok(/await waitOutOfCombat\(/.test(turn) && turn.indexOf('await waitOutOfCombat(') < turn.indexOf('await buffSelf('), `B runBuffTurn waits out of combat BEFORE the board click (line ${lineOf('runBuffTurn')})`);
    ok(/else if \(inCombatFail && !Me\.IsDead\)[\s\S]{0,200}inCombatRetryMs/.test(turn) && !/inCombatFail[\s\S]{0,120}buffFails = \(state\.buffFails/.test(turn), 'B a turn refused for a fight: short retry, buffFails unchanged (no 5/10/20/40/60 min back-off)');
    // BUFFFIX2-2026-10-21 (Vykaax): self-defence is NOT paused (a duo's healer cannot protect me), the bot stays on (I keep following), no assist
    ok(!/if \(state\.buffTurn\) return;/.test(src) && /if \(state\.buffTurn\) \{ if \(now\(\) - \(state\.buffTurnFight \|\| 0\) > 4000\) state\.buffTurnFight = now\(\); \}/.test(src), 'B2 self-defence fights back during my buff turn (marks the fight for the turn)');
    ok(!/DisableBot\(\)/.test(turn) && /noStep: true/.test(turn), 'B2 the buff turn keeps the bot ON (following) and never walks off to a safe spot');
    ok(!/state\.buffTurn \|\| benched\(\)\) return;/.test(src), 'B2 the script follow (nnFollow) keeps following during a buff turn');
    ok(/!healerMode \|\| healing \|\| Me\.IsDead \|\| bfTurnQuiet\(\)/.test(src) && /!healerMode && !bfTurnQuiet\(\) && !state\.escaping/.test(src), 'B2 healing + attack skills come back as soon as a monster hits me during the turn');
    ok(/reclick: !action && !bfInCombat\(\)/.test(src), 'B no second board click in a fight');
    ok(/!buffsPage && bfInCombat\(\)\) \{ const e = new Error[\s\S]{0,140}e\.inCombat = true/.test(src), "B a 'Buffs' timeout in a fight is an in-combat error (not a board failure)");
    ok(/buffBackoffReset\('in town, out of combat'\)/.test(src), 'B in town out of combat the back-off is cleared (the supply visit rebuffs)');
    ok(/!solo && bfHoldPullsOn\(\) && buffCurrent && buffCurrent\.name !== Me\.Name && !bfInCombat\(\) && autoLvl\.spot[\s\S]{0,200}holding the pulls/.test(src), 'B2 the pull hold during a teammate\'s buff turn only with the party option buffHoldPulls');
    { const hold = new Function('now', 'SWARM_ROOT', 'File', 'teamOf', 'Me', 'BFHOLD', fnText('bfHoldPullsOn') + '\nreturn bfHoldPullsOn;');
      const fileWith = (txt) => ({ ReadAllText: () => { if (txt === null) throw new Error('no file'); return txt; } });
      const mkH = (txt) => hold(() => 1e9, 'C:\\x', fileWith(txt), () => 'Spoiler7', { Name: 'Spoiler7' }, { v: false, at: 0 });
      ok(mkH(null)() === false && mkH('{}')() === false, 'B2 buffHoldPulls missing = OFF: the party keeps fighting while one character buffs (default)');
      ok(mkH('{"default":{"buffHoldPulls":true}}')() === true && mkH('{"default":{"buffHoldPulls":true},"parties":{"Spoiler7":{"buffHoldPulls":false}}}')() === false, 'B2 buffHoldPulls: default true holds, the party\'s own false wins'); }
    // B2 the turn on a fake clock: following without assist, attacked -> fight -> clear -> click again (the fight is no failed attempt), duo leader + healer
    {
      const runTurn = async (scenario) => {
        const W = { t: 0, clicks: 0, fa: [], enabled: true, disabled: 0, startC: 0, notes: [] };
        const state = { buffTurn: false, buffTurnFight: 0, buffFails: 0, buffBackoffUntil: 0, buffFailInCombat: false };
        const Opt = { _fa: true, get FollowAtk() { return this._fa; }, set FollowAtk(v) { this._fa = v; W.fa.push(v); } };
        const env = { state, CONFIG: { buffs: { attempts: 3, outOfCombatMaxMs: 45000, inCombatRetryMs: 60000, turnTimeoutMs: 150000, backoffMs: 300000, fightCycles: 4 } },
          now: () => W.t, sleep: async (ms) => { W.t += ms; }, Me: { IsDead: false }, IsInCombat: false, Options: Opt,
          needsBuff: () => true, longBuffCount: () => 3, buffSecondsLeft: () => 100, fmtTime: (s) => s + 's', note: (m) => W.notes.push(m),
          stopCombatG: () => { }, startCombatG: () => { W.startC++; }, DisableBot: () => { W.disabled++; }, EnableBot: () => { },
          bfHitMe: (ms) => scenario.hitAt(W.t, ms),
          waitOutOfCombat: async (max, settle, opt) => { W.noStep = !!(opt && opt.noStep); const r = await scenario.wait(W, state); return r; },
          buffSelf: async () => { W.clicks++; W.faAtClick = Opt.FollowAtk; return scenario.click(W, state); } };
        const f = new Function(...Object.keys(env), fnText('runBuffTurn') + '\nreturn runBuffTurn;')(...Object.values(env));
        const ok2 = await f(); return { ok: ok2, W, state };
      };
      // a monster hits me twice while I wait; each time self-defence marks a fight; after it the clear moment comes and the click works
      let fightN = 0;
      const sc1 = { hitAt: () => false,
        wait: async (W, st) => { if (fightN < 2) { fightN++; W.t += 8000; st.buffTurnFight = W.t; } W.t += 3000; return true; },
        click: (W) => W.clicks >= 1 };
      const r1 = await runTurn(sc1);
      ok(r1.ok === true && r1.W.clicks === 1 && r1.W.disabled === 0, `B2 attacked twice while waiting: fought (self-defence), then ONE click worked; the bot was never switched off (clicks ${r1.W.clicks})`);
      ok(r1.W.faAtClick === false && r1.W.fa[r1.W.fa.length - 1] === true && r1.W.noStep === true, 'B2 follow without assist during the turn (FollowAtk off at the click, back on after), no walking off');
      ok(r1.state.buffTurn === false && r1.state.buffFails === 0, 'B2 the turn ends cleanly, no failure counted');
      // hit DURING the click (the board refused for the fight): that try is not counted, the next clear moment clicks again
      const sc2 = { hitAt: (t) => false, wait: async (W) => { W.t += 3000; return true; },
        click: (W, st) => { if (W.clicks === 1) { st.buffFailInCombat = true; return false; } return true; } };
      const r2 = await runTurn(sc2);
      ok(r2.ok === true && r2.W.clicks === 2, `B2 hit during the click: fight, then the SAME attempt again (2 clicks, the first not counted as a failure)`);
      // a duo whose healer cannot protect me: attacked over and over -> after fightCycles fights the turn ends as "in combat" (short retry, never a long back-off)
      const sc3 = { hitAt: () => false, wait: async (W, st) => { W.t += 6000; st.buffTurnFight = W.t; return true; }, click: (W, st) => { st.buffFailInCombat = true; return false; } };
      const r3 = await runTurn(sc3);
      ok(r3.ok === false && r3.W.clicks <= 5 && r3.state.buffFails === 0 && r3.state.buffBackoffUntil > 0 && r3.state.buffBackoffUntil - r3.W.t <= 60000, `B2 duo, attacked again and again: it keeps fighting back, the turn ends as "in combat" -> retry in 60 s, no back-off (${r3.W.clicks} clicks)`);
    }
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
