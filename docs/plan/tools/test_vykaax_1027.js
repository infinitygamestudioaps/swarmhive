// OFFLINE TEST of the tester fixes 2026-10-27 (Vykaax, L2Swarm 3.10.7 / 3.10.8, SwarmHive v1.12.2). Never touches the game, MCP or live data.
//   node docs/plan/tools/test_vykaax_1027.js        (SWARM_JS=<file> tests another copy of swarm.js)
// BUG 2 SFKEEP: "If I press Start Combat in OOG Swarm it immediately turns itself off again" - with the party switch Fight with L2Swarm ON a member's
//   L2Swarm combat was stopped by the member loop every 2 s (and by every startCombatG call). Reproduced on stubs with the OLD line, then the new loop:
//   left on, given back after a Hive stop when the fight phase returns, a player's stop stays; startCombatG never stops it; each Hive stop of an
//   expected L2Swarm combat names its caller; deadlockFixed() is true on 3.10.x (version.txt missing / old + snapshotJsonNear).
// BUG 1 SPOILSTAT / SPOILOWN: the spoil numbers (one answer per cast: landed / resisted / already / cannot / no answer + why, a late #612 still lands,
//   no recast before the answer), the Hive assist does not re-target a spoiler mid-cast, L2Swarm's own Spoil rows are switched off only while Hive
//   picks the skills (given back when OFF; OFF + nothing of ours = the list is never read), and the Spoil page card (rate = landed / (landed + resisted)).
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const src = fs.readFileSync(process.env.SWARM_JS || path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
let fails = 0, n = 0;
const check = (ok, what, info) => { n++; console.log((ok ? 'ok   ' : 'FAIL ') + what + (!ok && info ? ' — ' + info : '')); if (!ok) fails++; };
const fnBody = (head) => { const i = src.indexOf(head); if (i < 0) { console.error('not found: ' + head); process.exit(1); } return src.slice(i, src.indexOf('\n}\n', i) + 3); };
const blk = (b, e) => { const i = src.indexOf(b), j = src.indexOf(e, i + 1); if (i < 0 || j < i) { console.error(b + ' block not found'); process.exit(1); } return src.slice(i, j); };

// ======================================================================= BUG 2: Fight with L2Swarm member combat
const loopAt = src.indexOf("App.on('swarm.sf'"), loopEnd = src.indexOf('const stuckFollow = ', loopAt);
const memSrc = src.slice(loopAt, loopEnd);
const cbAt = memSrc.indexOf('setInterval(() => {'), cb = memSrc.slice(cbAt + 'setInterval('.length, memSrc.lastIndexOf('}, 2000);') + 1);
const STEP = fnBody('function sfOwnCombatStep(s)');
const STOPF = blk('const CSTOP = {', 'function stopCombatG(why)') + fnBody('function stopCombatG(why)');
function world(o) {
  const H = Object.assign({ t: 1e6, combat: false, enabled: true, phase: true, sf: true, leader: false, town: '', stops: 0, starts: 0, notes: [], marks: [] }, o || {});
  H.SF = { at: 0, on: true, said: true, until: 0, leader: 'Lead', emitAt: 0, lastT: 0, atkSet: false };
  H.Options = { FollowName: 'Lead', ActiveFollow: true, FollowAtk: true };
  const f = new Function('H', 'OLDLINE', `
    const now = () => H.t, note = (m) => H.notes.push(m), intent = () => { }, num = Number;
    const isLeader = () => H.leader, IsCharacterReady = () => true, Me = { IsDead: false, Name: 'FindStuff3' };
    const sfMember = () => H.sf && !H.leader, swarmFightNow = () => H.sf && H.phase, hiveOwnCombat = () => false, currentTownKey = () => H.town, errandNow = () => false;
    const isHealerRole = () => false, noMelee = () => false, CONFIG = { leader: 'Lead' }, state = { followHoldUntil: 0 }, NNAV = null;
    const SF = H.SF, Options = H.Options;
    const EnableBot = () => { H.enabled = true; }, hostCallMark = (m) => H.marks.push(m);
    const StartCombat = () => { H.starts++; H.combat = true; }, StopCombat = () => { H.stops++; H.combat = false; };
    let IsInCombat, IsEnabled;
    const sync = () => { IsInCombat = H.combat; IsEnabled = H.enabled; };
    ${STEP}
    ${STOPF}
    const tick = ${cb};
    const oldTick = () => { try { if (isLeader() || !IsCharacterReady() || Me.IsDead) return; eval(OLDLINE); } catch (e) { } };
    return { tick: () => { sync(); tick(); }, oldTick: () => { sync(); oldTick(); }, stopCombatG: (w) => { sync(); return stopCombatG(w); },
      travelStop: function regroupWalk() { sync(); return stopCombatG(); }, CSTOP, sfOwnCombatStep };`);
  return Object.assign(H, f(H, "if (sfMember()) { try { if (IsInCombat) { StopCombat(); } } catch (e) { } }"));
}
{ // reproduction: the OLD member loop line (SFMEMBER-2026-10-16) stops the player's Start Combat at the next 2 s tick
  const W = world(); W.combat = true; W.oldTick();
  check(W.combat === false && W.stops === 1, 'REPRO old loop: the player presses Start Combat on a Fight-with-L2Swarm member -> stopped at the next 2 s tick');
}
{ const W = world(); W.combat = true;
  for (let i = 0; i < 10; i++) { W.t += 2000; W.tick(); }
  check(W.combat === true && W.stops === 0, 'new loop: the player\'s Start Combat stays ON for 20 s (10 ticks), no StopCombat');
  check(W.notes.filter(m => /my own L2Swarm combat runs/.test(m)).length === 1, '... said once: "my own L2Swarm combat runs ... Hive leaves it on"');
  // a Hive stop for a real reason during travel (phase off): said with the caller, given back when the fight phase returns
  W.phase = false; W.travelStop();
  check(W.combat === false && W.notes.some(m => /L2Swarm combat stopped by Hive: regroupWalk/.test(m) && /Fight with L2Swarm/.test(m)), 'a Hive stop says why (the caller: regroupWalk) in the notes', W.notes.join(' | '));
  W.t += 2000; W.tick(); W.t += 2000; W.tick();
  check(W.combat === false && W.starts === 0, '... travel / no fight phase: it stays off meanwhile');
  W.phase = true; W.t += 2000; W.tick();
  check(W.combat === true && W.starts === 1 && W.marks.join() === 'StartCombat pending,StartCombat done' && W.notes.some(m => /back on \(Hive had stopped it: regroupWalk/.test(m)), 'fight phase back: the player\'s own combat is switched back on once (hostCallMark around it)');
  // the player stops it himself: stays off
  W.t += 2000; W.tick(); W.combat = false; W.t += 2000; W.tick(); W.t += 25000; W.tick(); W.t += 2000; W.tick();
  check(W.combat === false && W.starts === 1, 'the player stops it (no Hive stop): it stays off');
  // town: no restart even after a Hive stop
  const T = world(); T.combat = true; T.tick(); T.travelStop(); T.town = 'Giran'; T.t += 2000; T.tick();
  check(T.combat === false && T.starts === 0, 'in a town: never switched back on');
  // never started by Hive when the player never ran it
  const N = world(); for (let i = 0; i < 5; i++) { N.t += 2000; N.tick(); }
  check(N.starts === 0 && N.stops === 0, 'a member whose player never started combat: Hive neither starts nor stops it (no own combat box)');
  // flapping guard: at most one give-back per 20 s
  const F = world(); F.combat = true; F.tick(); F.travelStop(); F.t += 2000; F.tick(); F.travelStop(); F.t += 2000; F.tick();
  check(F.starts === 1, 'give-back at most once per 20 s (a stop loop cannot make it flap)', 'starts ' + F.starts);
  check(F.sfOwnCombatStep({ inCombat: false, own: true, hiveStopAt: 100, lastOnAt: 10000, phase: true }).act === 'none', 'sfOwnCombatStep: an old Hive stop before the last "on" = the player stopped it');
  // repeated stop notes are rate-limited per caller
  const R = world(); R.combat = true; R.stopCombatG('rest'); R.combat = true; R.stopCombatG('rest');
  check(R.notes.filter(m => /stopped by Hive: rest/.test(m)).length === 1, 'the same reason is said at most once a minute');
  const Q = world({ sf: false }); Q.combat = true; Q.stopCombatG('x');
  check(!Q.notes.length && Q.stops === 1, 'a Hive-driven character (switch off, Hive skills ON): stops are quiet as before');
}
{ // startCombatG: a Fight-with-L2Swarm member is never started NOR stopped; skills OFF in a dungeon keeps a running L2Swarm combat
  const body = fnBody('function startCombatG()');
  const run = (o) => { const H = Object.assign({ combat: true, stops: 0, starts: 0, nn: 0 }, o);
    new Function('H', `const recHold = () => false, sfMember = () => !!H.sf, noNativeNav = () => !!H.dungeon, soloScriptFight = () => false, hiveOwnCombat = () => !!H.own;
      const NNAV = {}, nnFight = () => { H.nn++; }, hostCallMark = () => { };
      const StopCombat = () => { H.stops++; H.combat = false; }, StartCombat = () => { H.starts++; H.combat = true; };
      let IsInCombat = H.combat; ${body} startCombatG();`)(H); return H; };
  const a = run({ sf: true }), b = run({ sf: true, combat: false }), c = run({ own: true, dungeon: true }), d = run({ dungeon: true });
  check(a.stops === 0 && a.combat === true, 'startCombatG on a Fight-with-L2Swarm member: a running combat is NOT stopped (was StopCombat)');
  check(b.starts === 0, '... and never started (no own combat box, SFMEMBER kept)');
  check(c.stops === 0 && c.nn === 0, 'Hive skills OFF in a dungeon (no native nav): the player\'s running L2Swarm combat stays (NNAVOWN)');
  check(d.stops === 1 && d.nn === 1, 'Hive skills ON in a dungeon: unchanged (script fight, L2Swarm combat off)');
}
{ // the member loop source: no StopCombat left in it
  check(!/StopCombat\(\)/.test(cb), 'the Fight-with-L2Swarm member loop contains no StopCombat any more');
  check(/function stopCombatG\(why\) \{ if \(NNAV\) NNAV\.wantCombat = false; try \{ if \(IsInCombat\) combatStopSay\(why\); \} catch \(e\) \{ \} return StopCombat\(\); \}/.test(src), 'stopCombatG names its reason only when a combat really ran');
}
{ // deadlockFixed on 3.10.x (UISAFE / hiveOwnCombat need it): version.txt is never rewritten by L2Swarm's updater
  const V = src.slice(src.indexOf('let fixesDllSeen = null'), src.indexOf('function v4Patch()')) + fnBody('function deadlockFixed()');
  const run = (ver, near) => new Function('VER', 'NEAR', `const SWARM_ROOT = 'X';
    const File = { ReadAllText: () => { if (VER === null) throw new Error('missing'); return VER; }, Exists: () => false };
    const CreaturesList = NEAR ? { snapshotJsonNear() { } } : {};
    ${V} return deadlockFixed();`)(ver, near);
  check(run('3.10.7', true) === true && run('3.10.8.0', false) === true, 'deadlockFixed: version.txt 3.10.7 / 3.10.8 -> fixed (members may run L2Swarm combat)');
  check(run(null, true) === true, 'deadlockFixed: no version.txt (public install) + snapshotJsonNear -> 3.8.12 floor -> fixed');
  check(run('3.8.5', true) === true, 'deadlockFixed: a stale installer version.txt (3.8.5) + snapshotJsonNear -> fixed');
  check(run('3.8.5', false) === false, 'deadlockFixed: a real 3.8.5 (no snapshotJsonNear) -> not fixed (safe script fights)');
}

// ======================================================================= BUG 1: spoil
const SP = blk('// SPOIL-PURE-BEGIN', '// SPOIL-PURE-END');
const X = new Function(SP + '\nreturn { spoilAnswer, spoilNoAnswerWhy };')();
check(X.spoilAnswer({ kind: 'spoil' }, 612) === 'landed' && X.spoilAnswer({ kind: 'spoil' }, 357) === 'already' && X.spoilAnswer({ kind: 'spoil' }, 661) === 'cannot', 'spoilAnswer: #612 landed, #357 already, #661 cannot');
check(X.spoilAnswer({ kind: 'spoil' }, 139, 'Grave Priest has resisted your Spoil.') === 'resisted' && X.spoilAnswer({ kind: 'spoil' }, 139, 'Ant has resisted your Stun Attack.') === null, 'spoilAnswer: #139 is a resisted Spoil only when it names Spoil (or has no text)');
check(X.spoilAnswer({ kind: 'spoil', res: 'landed' }, 612) === null && X.spoilAnswer({ kind: 'spoil', res: 'none' }, 612) === 'landed' && X.spoilAnswer({ kind: 'spoil', res: 'none' }, 139) === null, 'spoilAnswer: one answer per cast; a LATE #612 after "no answer" still lands');
check(X.spoilAnswer({ kind: 'festival' }, 612) === null && X.spoilAnswer(null, 612) === null, 'spoilAnswer: festivals keep their own hit count');
check(X.spoilNoAnswerWhy({ targetDead: true, ms: 900 }) === 'died' && X.spoilNoAnswerWhy({ targetChanged: true }) === 'switched' && X.spoilNoAnswerWhy({ ms: 120 }) === 'cut' && X.spoilNoAnswerWhy({ ms: 1100 }) === 'silent', 'spoilNoAnswerWhy: died / switched / cut / silent');
{ // host: spoilSys + spoilResolve on stubs, the cast sequence of a member spoiler
  const H = { t: 1e6, logs: [] };
  const code = src.slice(src.indexOf('const SPOIL_ID = '), src.indexOf('function spoilRules()')) + fnBody('function spoilSys(id, text)');
  const M = new Function('H', `const now = () => H.t, num = Number, state = { role: 'spoiler' };
    const spoilLog = (m) => H.logs.push(m);
    ${SP}
    ${code}
    return { spoilState, spoilSys, spoilResolve, spoilBusy };`)(H);
  const S = M.spoilState.stats, cast = (tid, o) => { M.spoilState.pend = Object.assign({ at: H.t, kind: 'spoil', tid, ids: [tid], hits: 0, res: null, castEnd: H.t + 1000, ms: 1000, endTarget: tid, endDead: false }, o || {}); S.spoilCasts++; };
  cast(1); H.t += 1100; M.spoilSys(612); H.t += 2000; M.spoilResolve(false);
  cast(2); H.t += 1100; M.spoilSys(139, 'Grave Priest has resisted your Spoil.'); H.t += 2000; M.spoilResolve(false);
  cast(3, { endDead: true }); H.t += 2600; M.spoilResolve(false);
  cast(4, { endTarget: 9 }); H.t += 2600; M.spoilResolve(false);
  cast(5); H.t += 2600; M.spoilResolve(false); H.t += 300; M.spoilSys(612);   // a late answer
  cast(6); H.t += 1100; M.spoilSys(357);
  check(S.spoilCasts === 6 && S.spoiled === 2 && S.failed === 1 && S.noAnswer === 2 && S.already === 1, 'counts: 6 casts = 2 landed (one late) + 1 resisted + 2 no answer + 1 already spoiled', JSON.stringify(S));
  check(S.noAns.died === 1 && S.noAns.switched === 1 && S.noAns.silent === 0, '... no answer split by reason (target died 1, target switched 1; the late one taken back)', JSON.stringify(S.noAns));
  check(S.v === 2 && H.logs.some(m => /no answer \(the target died during the cast\)/.test(m)), 'stats v 2 + spoil.log says why a cast got no answer');
  M.spoilState.busyUntil = H.t + 1000; check(M.spoilBusy() === true, 'spoilBusy while my Spoil / Sweeper is cast');
}
{ // spoilerStep wiring
  const st = fnBody('async function spoilerStep()');
  check(/if \(state\.role !== 'spoiler' \|\| !hiveSkillsOn\(\)\) return null;/.test(st), 'spoilerStep: Hive skills OFF = Hive casts no Spoil / Sweeper (unchanged)');
  check(/P0\.tid === tid && !P0\.res && P0\.castEnd && now\(\) - P0\.castEnd < 1500\) return \{ next: 200 \}/.test(st), 'spoilerStep: no recast on the same target before its answer (was: recast after 0.5 s -> "#357 already spoiled")');
  check(!/S\.failed\+\+/.test(st), "spoilerStep: 'failed' is no longer 'no #612 within 0.5 s'");
  check(/spoilState\.busyUntil = now\(\) \+ 5000;[\s\S]{0,200}Send\.Action\(sp\.id\)/.test(st) && (st.match(/spoilState\.busyUntil = now\(\) \+ 5000/g) || []).length === 2, 'spoilerStep: Spoil and Sweeper casts mark the spoiler busy');
  check(/if \(spoilBusy\(\)\) return 'my Spoil \/ Sweeper cast';/.test(fnBody('function assistBlocked()')), 'the Hive assist does not re-target a spoiler during its Spoil / Sweeper cast');
  check(/try \{ spoilSys\(Number\(id\), text\); \}/.test(src), 'OnSystemMessage hands the text to spoilSys (#139 names the skill)');
}
{ // SPOILOWN guard on stubs: L2Swarm's Spoil rows only while Hive picks the skills; OFF = given back, never touched otherwise
  const CL = blk('// CASTLOOP-BEGIN', '// CASTLOOP-END');
  const G = src.slice(src.indexOf('const SPOILOWN = '), src.indexOf("setInterval(() => { if (!state.role || !IsCharacterReady()) return; try { spoilOwnGuard(false)"));
  const mk = (skills, files) => { const H = { skills, reads: 0, notes: [], files: files || {}, rows: [{ id: 254, en: true }, { id: 42, en: true }, { id: 3, en: true }, { id: 302, en: false }] };
    const M = new Function('H', `const SWARM_ROOT = 'R', Me = { Name: 'FindStuff3' }, num = Number, state = { role: 'spoiler', running: true };
      const SPOIL_ID = { spoil: 254, sweep: 42, fest: 302, sweepFest: 444 };
      const File = { Exists: (f) => f in H.files, ReadAllText: (f) => H.files[f], WriteAllText: (f, t) => { H.files[f] = t; } };
      const hiveSkillsOn = () => H.skills, note = (m) => H.notes.push(m), logError = () => { };
      const l2sEntries = () => { H.reads++; return H.rows.map(r => ({ id: r.id, nm: 'S' + r.id, get en() { return r.en; }, cs: { set IsEnabled(v) { r.en = v; } } })); };
      ${CL}
      ${G}
      return { spoilOwnGuard, SPOILOWN };`)(H); return { H, M }; };
  const A = mk(true); A.M.spoilOwnGuard(false);
  const en = (H, id) => H.rows.find(r => r.id === id).en;
  check(!en(A.H, 254) && !en(A.H, 42) && en(A.H, 3) && en(A.H, 302) === false, 'Hive skills ON: L2Swarm Spoil + Sweeper rows OFF (another row untouched, a row the player had off stays as it is)');
  check(A.H.notes.some(m => /switched OFF \(in memory/.test(m)), '... said once (party chat + note)');
  A.H.skills = false; A.M.spoilOwnGuard(false);
  check(en(A.H, 254) && en(A.H, 42) && en(A.H, 302) === false && !Object.keys(A.M.SPOILOWN.off).length, 'Hive skills OFF: exactly the rows Hive switched off are given back (never one the player switched off)');
  const r0 = A.H.reads; A.M.spoilOwnGuard(false);
  check(A.H.reads === r0, 'Hive skills OFF and nothing of ours left: the list is not even read (Hive never touches it)');
  const B = mk(false); B.M.spoilOwnGuard(false);
  check(B.H.reads === 0 && en(B.H, 254), 'a spoiler that started with Hive skills OFF: list never read, Spoil stays ON');
  const C = mk(false, { 'R\\Logs\\spoil_l2s_off_FindStuff3.json': '{"254":true}' }); C.H.rows[0].en = false; C.M.spoilOwnGuard(false);
  check(en(C.H, 254), 'after a crash (file says we switched Spoil off): given back with skills OFF');
  const D = mk(true); D.M.spoilOwnGuard(false); D.M.spoilOwnGuard(true);
  check(en(D.H, 254) && en(D.H, 42), 'script stop (forceRestore): given back');
  check(/try \{ spoilOwnGuard\(true\); \} catch \(e\) \{ \}/.test(src.slice(src.indexOf('globalThis.OnBeforeScriptStop'))), 'OnBeforeScriptStop gives the Spoil rows back');
}
{ // Spoil page card numbers
  const pg = fs.readFileSync(path.join(ROOT, 'Dashboard', 'spoilpage.js'), 'utf8');
  const i = pg.indexOf('// SPOILNUMS-BEGIN'), j = pg.indexOf('// SPOILNUMS-END');
  const f = new Function(pg.slice(i, j) + '\nreturn spoilStatNums;')();
  const old = f({ spoiled: 405, failed: 232, spoilCasts: 1227, sweeps: 213 });
  check(old.old === true && old.rate === null && old.failed === 232, 'card: an old stats file (Vykaax FindStuff3) shows "missed (old counter)", no misleading %');
  const v2 = f({ v: 2, spoiled: 60, failed: 20, noAnswer: 25, noAns: { died: 18, switched: 5, cut: 0, silent: 2 }, already: 4, spoilCasts: 109 });
  check(v2.old === false && v2.rate === 75 && v2.noAnswer === 25 && v2.why === '18 target died, 5 target switched, 2 silent' && v2.already === 4, 'card: rate = landed / (landed + resisted) = 75 %, no answer apart with reasons, already spoiled apart', JSON.stringify(v2));
  check(f({ v: 2 }).rate === null, 'card: no casts = no rate');
  check(/no answer\$\{R\.why/.test(pg) && /already spoiled<\/span>/.test(pg) && /resisted\$\{R\.rate/.test(pg), 'card renders resisted (% hit), no answer (why), already spoiled');
}

console.log(`\nvykaax 2026-10-27: ${n - fails} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
