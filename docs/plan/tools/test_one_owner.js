// ONEOWNER / ONEPORT / TOWNFIRST / RAIDSTATUS-SAFE / NOWAY / ENGAGEDFOCUS / SURRENDERBOSS / SPOTKEEP (2026-10-14, owner: "2 commands should never fight").
// Lifts the new blocks from Scripts_dev/swarm.js and runs them against stubs, plus source checks of the wiring.
//   node docs/plan/tools/test_one_owner.js      (exit 1 when a check fails)
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const src = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
let fails = 0, n = 0; const ok = (c, m) => { n++; console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
const cut = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i + 1); if (i < 0 || j < 0) throw new Error('block not found: ' + a); return src.slice(i, j); };

(async () => {
  // ---- 1) RAIDSTATUS-SAFE: readJsonHeal ------------------------------------------------------------------------------------------
  const files = {};
  const File = { Exists: (p) => p in files, ReadAllText: (p) => { if (!(p in files)) throw new Error('missing'); return files[p]; } };
  const H = new Function('File', cut('function readJsonHeal(', 'function raidStatusRead(') + '\nreturn readJsonHeal;')(File);
  files.a = '{"1":{"name":"A","alive":false}}';
  ok(H('a').j['1'].name === 'A' && !H('a').healed, 'a good file is read as it is');
  files.b = '{"1":{"name":"A"},"2":{"name":"B","x":"y"}}"}}';               // the 2026-10-12 damage: a shorter write over a longer file
  const rb = H('b');
  ok(rb && rb.healed && rb.j['2'].name === 'B', 'trailing garbage after the JSON: the valid part is recovered (healed)');
  ok(H('missing').j && Object.keys(H('missing').j).length === 0, 'a missing file = empty (first write)');
  files.c = 'not json at all';
  ok(H('c') === null, 'a file that cannot be read at all = null (the writer keeps a copy and starts fresh)');
  const real = path.join(ROOT, 'Logs', 'raid_status.json');
  if (fs.existsSync(real)) {
    files.r = fs.readFileSync(real, 'utf8');
    let plain = true; try { JSON.parse(files.r); } catch (e) { plain = false; }
    const rr = H('r');
    ok(rr && Object.keys(rr.j).length > 0, `the real Logs/raid_status.json reads (${plain ? 'clean' : 'damaged -> healed'}, ${rr ? Object.keys(rr.j).length : 0} bosses)`);
  }
  ok(/function raidStatusWrite\(name, alive, src\) \{ withFileLock\('raid_status'/.test(src), 'every raid status write runs under the raid_status lock');
  ok(/File\.WriteAllText\(tmp, JSON\.stringify\(j\)\); File\.Copy\(tmp, f, true\)/.test(src), 'the write goes through a temp copy');
  ok(!/JSON\.parse\(File\.ReadAllText\(SWARM_ROOT \+ '\\\\Logs\\\\raid_status\.json'\)\)/.test(src), 'no reader parses raid_status.json without the heal (raidStatusRead)');

  // ---- 2) ONEPORT: one team hold at a time --------------------------------------------------------------------------------------
  let clock = 0, running = 0, maxRunning = 0; const runs = [], notes = [], emits = [];
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const env = {
    Me: { Name: 'Tank1' }, note: (m) => notes.push(m), now: () => clock, App: { emit: (e, d) => emits.push(e + ' ' + (d.names || []).join(',') + ' ' + d.town) },
    TOWN_CMD: { Giran: 'giran', Dion: 'dion' }, townKeyFor: (s) => ({ giran: 'Giran', dion: 'Dion' })[String(s).toLowerCase()] || '',
    teamRegroupBeforePortOne: async (what) => { running++; maxRunning = Math.max(maxRunning, running); runs.push(what); await sleep(30); running--; return what === '.dion' ? 'interrupted' : true; },
  };
  const P = new Function(...Object.keys(env), cut('let portHoldRun = null;', 'async function teamRegroupBeforePortOne(') + '\nreturn { teamRegroupBeforePort, queueJoinTown, flushJoinTown, get pending() { return pendingJoinTown; } };')(...Object.values(env));
  const [r1, r2] = await Promise.all([P.teamRegroupBeforePort('.giran', 'Giran'), P.teamRegroupBeforePort('.giran', 'Giran')]);
  ok(runs.length === 1 && r1 === true && r2 === true, 'two holds for the SAME town at once: one hold runs, both get its result (no "newer teleport took over")');
  runs.length = 0;
  const [r3, r4] = await Promise.all([P.teamRegroupBeforePort('.giran', 'Giran'), P.teamRegroupBeforePort('.dion', 'Dion')]);
  ok(runs.join(',') === '.giran,.dion' && maxRunning === 1, 'holds for different places run one after the other, never side by side');
  ok(r3 === true && r4 === 'interrupted', 'each gets its own result');

  // ---- 3) TOWNFIRST: members port only after the leader's own .town worked --------------------------------------------------------
  P.queueJoinTown(['Doombringer1', 'Inspector1'], 'Giran', '.giran');
  ok(emits.length === 0, 'the hold only QUEUES the members\' own .town (nothing sent while the leader has not ported)');
  P.flushJoinTown('', false);
  ok(emits.length === 0 && notes.some(m => /stay with me/.test(m)), 'the leader\'s .town failed (combat): nobody leaves, it is said why');
  P.queueJoinTown(['Doombringer1'], 'Giran', '.giran'); P.queueJoinTown(['Destroyer2'], 'Giran', '.giran');
  P.flushJoinTown('Giran', true);
  ok(emits.length === 1 && /swarm\.jointown Doombringer1,Destroyer2 Giran/.test(emits[0]), 'the leader is in Giran: now the queued members are told, all at once');
  ok(P.pending === null, 'the queue is empty afterwards');
  ok(/if \(go\.length\) queueJoinTown\(go, dTown, what\);/.test(src) && /if \(isLeader\(\)\) flushJoinTown\(c\.k, true\);/.test(src) && /if \(isLeader\(\)\) flushJoinTown\('', false\);/.test(src), 'wired: the hold queues, townCommand flushes on success and on failure');
  ok(!/App\.emit\('swarm\.jointown', \{ leader: Me\.Name, names: go/.test(src), 'no direct jointown from the hold any more');

  // ---- 4) ONEOWNER: the split watchdog never runs beside a raid hunt / circuit ------------------------------------------------------
  const sw = cut('const splitWatch = {', 'split watchdog: ${');
  ok(/if \(raidHunt\.active \|\| leadRunBusy \|\| regroupRun\) return;/.test(sw), 'split watchdog: returns while a raid hunt / circuit / team run owns the team');

  // ---- 5) NOWAY: a boss with no way through is unreachable, a not-found one is not looked at again within 2 h ----------------------
  ok(/state\.noWayAt = now\(\); break; \}/.test(src), 'the leader walk records "no way through"');
  ok(/\(state\.noWayAt \|\| 0\) > huntStepAt && !\/dead\$\/\.test\(last\)\) \{ raidUnreachable\(b\.name\); raidHunt\.skip\[b\.name\] = true;/.test(src), 'raidhunt: no way through = unreachable + skipped');
  ok(/raidHunt\.notFoundAt && now\(\) - \(raidHunt\.notFoundAt\[b\.name\] \|\| 0\) < 2 \* 3600e3/.test(src), 'raidhunt: a not-found boss waits 2 h even when the status file cannot be written');

  // ---- 6) ENGAGEDFOCUS + SURRENDERBOSS ------------------------------------------------------------------------------------------
  ok(/(?:const|let) minsAll = bossMinions\(boss\)\.filter\(engaged\)/.test(src) && /Math\.hypot\(m\.X - Me\.X, m\.Y - Me\.Y\) < 900; \};/.test(src), 'focus: only minions in the fight (hitting us / within 900 of the tank); loose far ones are the tank\'s job');
  ok(/aggroAge: raidCtl\.aggroAt \? now\(\) - raidCtl\.aggroAt/.test(src) && /if \(isFinite\(ag\) && ag >= 0 && !raidCtl\.aggroAt\) raidCtl\.aggroAt = now\(\) - ag;/.test(src), 'members learn the pull time from the focus broadcast (2.5 s opening works in every window)');
  ok(/if \(bossObj && !bossObj\.IsDead && \(raidCtl\.aggroAt \|\| num\(bossObj\.HpPercent\) < 99\) && await teamSurrenderStep\(bossObj, true\)\) (?:\{ rw\('team surrender cast'\); )?continue;/.test(src), 'raid: the team Surrender goes on the BOSS (not the focus minion)');
  const SM = new Function('now', 'surTrack', cut('function surrenderMissed()', '/** the team\'s Surrender on my target') + '\nreturn surrenderMissed;');
  const st = { 77: { at: 1000, dur: 30 }, __last: { oid: 77, at: 1000 } };
  SM(() => 3000, st)();
  ok(!st[77], 'a resisted Surrender (server answer within 6 s) is forgotten -> cast again at once');
  const st2 = { 77: { at: 1000, dur: 30 }, __last: { oid: 77, at: 1000 } };
  SM(() => 20000, st2)();
  ok(!!st2[77], 'an old resist message does not cancel a Surrender that landed');
  ok(/try \{ surrenderMissed\(\); \} catch \(e\) \{ \} const d = \{ resisted: res/.test(src), 'wired: the resist / interrupt watcher calls surrenderMissed');

  // ---- 7) SPOTKEEP ------------------------------------------------------------------------------------------------------------
  ok(/const SPOTKEEP = \{ windowMs: 600000(?: \}|, emptyMs: \d+ \});/.test(src), 'a spot is judged over 10 min');   // EMPTY5-2026-10-20 added emptyMs (test_empty_spot.js checks it)
  ok(/autoLvl\.teamKillTimes\.push\(now\(\)\)/.test(src), 'every monster that dies near the party counts (not only the leader\'s own kills)');
  ok(/else if \(why && \/kills in\|exp in\/\.test\(why\) && \(autoLvl\.weakWindows \|\| 0\) < 1\)/.test(src), 'one weak window = stay one more round; leave only after two');
  ok(/const MULTI = \{ emptyMs: 150000,/.test(src) && /staleMs: 300000 \}/.test(src), 'an area is empty after 150 s (was 35 s), checked again after 5 min');
  ok(/if \(key && c\.key && isAR\(key\) && isAR\(c\.key\)\) return false; \}/.test(src), 'two different rooms never block each other\'s claim');

  // ---- 8) TRAPPED --------------------------------------------------------------------------------------------------------------
  ok(/const TRAP = \{ minMs: 480000, fails: 3, near: 200, gapMs: 900000 \};/.test(src) && /trapCheck\(`\.\$\{TOWN_CMD\[cands\[0\]\.k\]\} refused/.test(src), 'trapped: same spot + .town refused 3x over 8 min -> the escape procedure (wired in townCommand)');
  ok(/if \(Me\.IsDead \|\| inRaid\(\) \|\| ESC\.on\) return;/.test(cut('function trapCheck(', 'let lastUnstuck')), 'trapped: never in a raid, never twice at once');

  console.log(fails ? `${fails} of ${n} FAILED` : `all ${n} ok`); process.exit(fails ? 1 : 0);
})().catch(e => { console.log('FAIL ' + e.stack); process.exit(1); });
