// OFFLINE TEST of the MANUAL RUN SWITCH (owner 2026-10-13 17:50: "You don't need to start the bots automatically ... just stop them and
// switch them on as you like"; rule: nothing automatic unless the player switched it on). Never touches the game, MCP or the live Logs.
//   node docs/plan/tools/test_run_state.js        (exit code 1 when a check fails; SWARM_JS=<file> tests another copy of swarm.js)
// 1) RUNSTATE-PURE of Scripts_dev/swarm.js: runNorm, runEffective (party / member hold / default OFF), runAutoAllowed (survival always),
//    runStartPlan (what Start does), runWatchDecide (OFF stops a running activity).
// 2) the REAL host part (runData / runAuto / runSetMine / runHeld / runStartOrder / the 3 s watch) on an in-memory file system + virtual
//    clock: no file = OFF, a reload keeps the state, the leader / member writes, the held member's follow + assist, Start's activity.
// 3) source checks: every automatic path asks the switch (runAuto / runOn), survival / orders do not, the orders that start an activity
//    switch it ON, the user's !stop switches it OFF, !start is an order.
// 4) the dashboard API (Dashboard/runstate_api.js) on a scratch file: party / character / all writes, the commands it sends, its rules =
//    the bot's rules (same answers for a matrix of files), the page module and the commands catalog.
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const ROOT = path.join(__dirname, '..', '..', '..');
const SRCF = process.env.SWARM_JS || path.join(ROOT, 'Scripts_dev', 'swarm.js');
const src = fs.readFileSync(SRCF, 'utf8');
const DASH = process.env.SWARM_DASH || path.join(ROOT, 'Dashboard');
let fails = 0, n = 0;
const check = (ok, what) => { n++; console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails++; };
const blk = (b, e) => { const i = src.indexOf(b), j = src.indexOf(e, i + 1); if (i < 0 || j < i) { console.error(b + ' block not found'); process.exit(1); } return src.slice(i, j); };
const PURE = blk('// RUNSTATE-PURE-BEGIN', '// RUNSTATE-PURE-END');
const P = new Function(PURE + '\nreturn { RUN_ALWAYS, RUN_ON_ORDERS, RUN_OFF_ORDERS, runNorm, runEffective, runAutoAllowed, runStartPlan, runWatchDecide };')();

// ---- 1) pure ------------------------------------------------------------------------------------------------------------------
const J0 = {};
check(P.runEffective(J0, 'Tank1', 'Tank1').on === false && P.runEffective(J0, 'Tank1', 'Tank1').src === 'default', 'no file / empty file: OFF (the default)');
check(P.runEffective(null, 'Bishop1', 'Tank1').on === false, 'broken content: OFF');
check(P.runEffective({ default: 'yes' }, 'A', 'A').on === false, 'default must be literally true');
const J1 = { parties: { Tank1: { on: true, at: 'x', by: 'dashboard' } } };
check(P.runEffective(J1, 'Tank1', 'Tank1').on === true && P.runEffective(J1, 'Tank1', 'Tank1').src === 'party', 'party ON: the leader runs');
check(P.runEffective(J1, 'Bishop1', 'Tank1').on === true && !P.runEffective(J1, 'Bishop1', 'Tank1').held, 'party ON: a member runs with it');
check(P.runEffective(J1, 'Destroyer3', 'Destroyer3').on === false, 'another party not listed: OFF');
const J2 = { parties: { Tank1: { on: true } }, chars: { Bishop1: { on: false } } };
check(P.runEffective(J2, 'Bishop1', 'Tank1').on === false && P.runEffective(J2, 'Bishop1', 'Tank1').held === true, 'a member stopped on its own: held, OFF');
check(P.runEffective(J2, 'Necro1', 'Tank1').on === true, '... its teammates still run');
check(P.runEffective({ chars: { Tank1: { on: false } }, parties: { Tank1: { on: true } } }, 'Tank1', 'Tank1').on === true, 'a character entry on a LEADER is ignored (the party switch decides)');
check(P.runEffective({ chars: { Solo: { on: true } } }, 'Solo', 'Tank1').on === true, 'a member outside its party switched on by its own order (!autolevel solo): ON');
check(P.runNorm({ _about: 'x', parties: [] }).parties && !Array.isArray(P.runNorm({ parties: [] }).parties) && P.runNorm({ _about: 'x' })._about === 'x', 'runNorm: arrays dropped, other keys kept');
['survive', 'respawn', 'defend', 'res', 'trade', 'order', 'rescue', 'escape'].forEach(k => check(P.runAutoAllowed(k, { on: false }) === true, `survival / answering "${k}" works while OFF`));
['leveling', 'watchdog leveling', 'resume', 'supply run', 'daily Kamaloka', 'raidhunt', 'raid circuit', 'split regroup', 'left-behind trip', 'back-to-the-middle walk', 'warehouse stash', 'Seven Signs sign-up', 'class change', 'town sell']
  .forEach(k => check(P.runAutoAllowed(k, { on: false }) === false && P.runAutoAllowed(k, { on: true }) === true, `automatic "${k}": refused while OFF, allowed while ON`));
const SP = P.runStartPlan;
check(SP({ busy: 'leveling' }).act === 'already', 'Start while it already levels: nothing new');
check(SP({ circuit: { on: true, bosses: 3 } }).act === 'circuit' && /3 bosses/.test(SP({ circuit: { on: true, bosses: 3 } }).text), 'Start with a switched-on circuit (3 bosses): the circuit');
check(SP({ circuit: { on: false, bosses: 3 } }).act === 'level', 'a circuit list that is switched off: leveling');
check(SP({ circuit: { on: true, bosses: 0 } }).act === 'level', 'a circuit without bosses: leveling');
check(/hunt here 24\/7/.test(SP({ spot: { mode: 'manual', kind: 'here', spot: 'Here: Plains (24/7)' } }).text), 'hunt here: "hunt here 24/7 at ..."');
check(/your chosen spot: Cruma Tower/.test(SP({ spot: { mode: 'manual', kind: 'rooms', spot: 'Cruma Tower', roomIds: ['a', 'b'] } }).text) && /2 rooms/.test(SP({ spot: { mode: 'manual', kind: 'rooms', spot: 'Cruma Tower', roomIds: ['a', 'b'] } }).text), 'a chosen spot (2 rooms)');
check(/nonstop/.test(SP({ spot: { mode: 'auto', nonstop: true } }).text) && /the leader picks/.test(SP({ spot: { mode: 'auto' } }).text), 'auto spot (+ nonstop note)');
check(/it picks/.test(SP({ solo: true }).text) && SP({ solo: true }).solo === true, 'solo character');
check(/level stages/.test(SP({ spot: { mode: 'auto', stages: [{ fromLevel: 20 }] } }).text), 'level stages');
check(P.runWatchDecide({ on: true, leveling: true }).act === 'none', 'watch: ON + leveling = fine');
check(P.runWatchDecide({ on: false }).act === 'none', 'watch: OFF + idle = fine');
check(P.runWatchDecide({ on: false, leveling: true }).act === 'stop', 'watch: OFF + leveling = stop it');
check(P.runWatchDecide({ on: false, raidhunt: true, circuit: true, inRaid: true }).what.join() === 'raid circuit' && /finished first/.test(P.runWatchDecide({ on: false, circuit: true, raidhunt: true, inRaid: true }).why), 'watch: OFF + circuit in a boss fight = stop after the fight');

// ---- 2) host part ---------------------------------------------------------------------------------------------------------------
const HOST = blk('// RUNSTATE-PURE-BEGIN', '\n// ---------------------------------------------------------------------------\n// LEADER CONTROL');
function world(o) {
  const W = Object.assign({ t: 1760360000000, files: {}, notes: [], said: [], calls: [], intervals: [], me: 'Tank1', leader: 'Tank1', team: [], party: 0 }, o || {});
  const File = {
    Exists: (f) => Object.prototype.hasOwnProperty.call(W.files, f),
    ReadAllText: (f) => { if (!File.Exists(f)) throw new Error('no file'); return W.files[f].text; },
    WriteAllText: (f, t) => { W.files[f] = { text: String(t), stamp: String(++W.t) }; },
  };
  const env = {
    File, __DIR__: 'C:\\L2', now: () => W.t, fileStamp: (f) => (W.files[f] ? W.files[f].stamp : ''),
    Me: { Name: W.me }, CONFIG: { leader: W.leader, roster: {} }, isLeader: () => W.me === W.leader, teamNames: () => W.team.slice(), teamOf: (n) => W.teamOf ? W.teamOf(n) : W.leader,
    note: (m, say) => { W.notes.push(m); if (say) W.said.push(m); }, logError: (w, e) => { W.notes.push('ERROR ' + w + ' ' + e.message); },
    setInterval: (fn, ms) => { W.intervals.push({ fn, ms }); return W.intervals.length; },
    state: { role: 'x' }, IsCharacterReady: () => true, inRaid: () => !!W.inRaid,
    autoLvl: { active: false, stop: false, spot: 1 }, raidHunt: { active: false, stop: false }, daily: { orderAt: 0 }, RC: { resumingAt: 5 },
    rcOn: () => !!W.rcOn, rcConfigOf: () => W.circuit || null, rcData: () => ({}), rcRunRead: () => ({ running: false }), rcRun: () => null, rcRunSave: () => { },
    raidCircuitLoop: (how) => { W.calls.push('raidCircuitLoop ' + how); return Promise.resolve(); }, sleep: () => Promise.resolve(),
    partySpotEntry: () => W.spot || null, setLeadPaused: (on) => W.calls.push('setLeadPaused ' + on),
    leadLevel: (why) => { W.calls.push('leadLevel ' + why); return Promise.resolve(); }, autoLevelLoop: (solo) => { W.calls.push('autoLevelLoop ' + solo); return Promise.resolve(); },
    PartyList: { get Count() { return W.party; } }, Options: { ActiveFollow: true, FollowAtk: true, FollowName: '' }, followOk: () => true, memberRoute: { id: null },
    IsEnabled: true, EnableBot: () => { }, abortRegroup: (w) => W.calls.push('abortRegroup ' + w), stopCombatG: () => W.calls.push('stopCombat'),
    Send: { StopMove: () => W.calls.push('StopMove') }, isHealerRole: () => !!W.healer, noMelee: () => false, pauseInfo: () => null,
  };
  const names = Object.keys(env);
  const api = new Function(...names, HOST + '\nreturn { runData, runMine, runOn, runHeld, runAuto, runSetMine, runStartOrder, rcStartOrder, RUNST, RUN_FILE };')(...names.map(k => env[k]));
  W.env = env; W.api = api; W.F = api.RUN_FILE();
  W.tick = () => { W.t += 3000; W.intervals.forEach(iv => iv.fn()); };
  W.json = () => JSON.parse(W.files[W.F].text);
  return W;
}
{ const W = world();
  check(W.api.runOn() === false, 'no run_state.json: the party is OFF');
  check(W.api.runAuto('leveling') === false && W.notes.some(m => /run switch OFF: no automatic leveling/.test(m)), 'an automatic task is refused and noted');
  const k = W.notes.length; W.api.runAuto('leveling'); check(W.notes.length === k, 'the refusal is noted once per 10 min, not every tick');
  check(W.said.length === 0, '... and never in party chat');
  check(W.api.runAuto('survive') === true && W.api.runAuto('respawn') === true && W.api.runAuto('defend') === true, 'survival is never gated');
  W.autoLvlActive = false; W.tick(); check(!W.env.autoLvl.stop, 'watch: OFF + idle leader = nothing happens');
}
{ const W = world();
  W.api.runSetMine(true, 'your order !level');
  check(W.json().parties.Tank1.on === true && /bot:Tank1/.test(W.json().parties.Tank1.by), 'the leader writes his PARTY entry (on, by bot:Tank1)');
  check(W.api.runOn() === true, '... and sees it at once (write-through cache)');
  const before = W.files[W.F].stamp; W.api.runSetMine(true, 'again'); check(W.files[W.F].stamp === before, 'no write when nothing changes');
  // a restart (new script instance, same file)
  const W2 = world(); W2.files = W.files; check(W2.api.runOn() === true, 'RESTART: a party switched ON stays ON (the file is the state)');
  W.api.runSetMine(false, 'your order !stop'); check(W.json().parties.Tank1.on === false && W.api.runOn() === false, 'the user\'s stop writes OFF');
  const W3 = world(); W3.files = W.files; check(W3.api.runOn() === false, 'RESTART: a stopped party stays OFF');
  // half-written file
  W.api.runSetMine(true, 'on'); W.t += 5000; check(W.api.runOn() === true, 'ON before the half write');
  W.files[W.F] = { text: '{"parties": {"Sha', stamp: 'zz' }; W.t += 5000; check(W.api.runOn() === true, 'a half-written file keeps the last good state');
  W.files[W.F] = { text: '{ "parties": {} }', stamp: 'zz2' }; W.t += 5000; check(W.api.runOn() === false, '... the next good write is read');
}
{ const W = world({ me: 'Bishop1', leader: 'Tank1', team: ['Tank1'] });
  W.files[W.F] = { text: JSON.stringify({ parties: { Tank1: { on: true } } }), stamp: '1' };
  check(W.api.runOn() === true && W.api.runHeld() === false, 'member of a running party: runs, not held');
  W.api.runSetMine(false, 'test'); check(W.json().chars.Bishop1.on === false && W.json().parties.Tank1.on === true, 'a member writes only its OWN entry');
  check(W.api.runHeld() === true && W.api.runAuto('back-to-the-middle walk') === false, 'held member: no walks of its own');
  W.tick();
  check(W.env.Options.ActiveFollow === false && W.env.Options.FollowAtk === false && W.calls.includes('StopMove'), 'the watch: held member stops, no follow, no assist');
  check(W.said.some(m => /stopped on its own/.test(m)), '... and says so in party chat once');
  W.api.runStartOrder(['!start', 'Bishop1']);
  check(!W.json().chars.Bishop1, '!start Bishop1: its hold is removed (back to the party switch)');
  W.tick(); check(W.env.Options.FollowAtk === true && W.env.Options.ActiveFollow === true, 'un-held: assist + follow back on');
  W.api.runStartOrder(['!start']); check(!W.calls.some(c => /leadLevel|autoLevelLoop/.test(c)), 'a party Start reaching a member does nothing there (the leader starts it)');
  W.api.runStartOrder(['!start', 'Necro1']); check(!W.json().chars.Bishop1, '!start <another name> is not for me');
}
{ const W = world({ me: 'Bishop1', leader: 'Tank1', team: [] });   // a member alone (out of its party): !autolevel solo = its own run
  W.api.runSetMine(true, 'your order !autolevel solo'); check(W.json().chars.Bishop1.on === true && W.api.runOn() === true, 'a member alone: its own order switches ITSELF on');
}
{ const W = world({ healer: true, me: 'Bishop1', leader: 'Tank1', team: ['Tank1'] });
  W.files[W.F] = { text: JSON.stringify({ parties: { Tank1: { on: true } }, chars: { Bishop1: { on: false } } }), stamp: '1' };
  W.env.Options.FollowAtk = false; W.tick(); W.files[W.F] = { text: JSON.stringify({ parties: { Tank1: { on: true } } }), stamp: '2' }; W.t += 3000; W.tick();
  check(W.env.Options.FollowAtk === false, 'a healer never gets assist switched on by the un-hold');
}
{ const W = world();   // the leader's watch
  W.env.autoLvl.active = true; W.tick();
  check(W.env.autoLvl.stop === true && W.calls.includes('abortRegroup run switch OFF') && W.said.some(m => /switch is OFF but leveling/.test(m)), 'watch: OFF while leveling (the Stop order got lost) -> leveling stopped');
  const W2 = world(); W2.env.raidHunt.active = true; W2.rcOn = true; W2.inRaid = true; W2.tick();
  check(W2.env.raidHunt.stop === true && !W2.calls.includes('stopCombat'), 'watch: OFF during a circuit boss fight -> the circuit ends after the fight (no combat stop)');
  const W3 = world(); W3.files[W3.F] = { text: JSON.stringify({ parties: { Tank1: { on: true } } }), stamp: '1' }; W3.env.autoLvl.active = true; W3.tick();
  check(!W3.env.autoLvl.stop, 'watch: ON while leveling = untouched');
}
{ const W = world({ team: ['Bishop1'], party: 2 });   // Start = the configured activity
  W.api.runStartOrder(['!start']);
  check(W.json().parties.Tank1.on === true && W.calls.includes('leadLevel !start') && W.calls.includes('setLeadPaused false'), '!start: ON + leveling (leadLevel: Giran regroup, the chosen / auto spot)');
  check(W.said.some(m => /party Tank1 ON — leveling: the leader picks/.test(m)), '... and says what it starts');
  const Wc = world({ team: ['Bishop1'], party: 2, circuit: { on: true, bosses: [1, 2] } }); Wc.api.runStartOrder(['!start']);
  check(Wc.said.some(m => /raid circuit \(2 bosses/.test(m)), '!start with a switched-on circuit: the circuit');
  const Ws = world(); Ws.api.runStartOrder(['!start']); check(Ws.calls.includes('autoLevelLoop true'), '!start for a character alone: solo leveling');
  const Wb = world({ team: ['Bishop1'], party: 2 }); Wb.env.autoLvl.active = true; Wb.api.runStartOrder(['!start']);
  check(!Wb.calls.some(c => /leadLevel/.test(c)) && Wb.said.some(m => /already running/.test(m)) && Wb.json().parties.Tank1.on === true, '!start while it already levels: switch ON, nothing doubled');
  const Wo = world({ team: ['Bishop1'], party: 2 }); Wo.api.runStartOrder(['!start', 'Bishop1']); check(!Wo.files[Wo.F], '!start <member> in the leader\'s window: not for him');
}
{ const W = world({ team: ['Bishop1'], party: 2 }); W.api.rcStartOrder(); setImmediate(() => { }); }

// ---- 3) source checks -------------------------------------------------------------------------------------------------------
const has = (re, what) => check(re.test(src), what);
const fnBody = (head) => { const i = src.indexOf(head); if (i < 0) return ''; return src.slice(i, src.indexOf('\n}\n', i) + 2); };
has(/function benched\(n\) \{ return runHeld\(n\) \|\|/, 'benched(): a held member is benched (the leader does not wait for / regroup / invite it)');
has(/function followOk\(want\) \{\n  if \(!want\) return false;\n  if \(runHeld\(\)\) return false;/, 'followOk(): a held member never follows');
has(/function rgFollowTick\(\) \{\n  if \(isLeader\(\) \|\| runHeld\(\)/, 'room-graph follow: not for a held member');
has(/App\.on\('swarm\.comehere'[^\n]*!runHeld\(\)/, 'the leader\'s come-here call: not for a held member');
has(/App\.on\('swarm\.routewalk', \(event\) => \{\n  if \([^\n]*runHeld\(\)\) return;/, 'route walks: not for a held member');
has(/isLeader\(\) \|\| !state\.role \|\| runHeld\(\)\) return;   \/\/ RUNSTATE: a held member stays\n  const town = event\.data\.town;/, 'the leader\'s .town hub call: not for a held member');
// the idle watchdog: respawn comes first (survival), the leveling start asks the switch
{ const i = src.indexOf("note('watchdog: dead too long — respawning in town', true);"), j = src.indexOf("if (!runAuto('watchdog leveling')) return;");
  check(i > 0 && j > i && j - i < 3000, 'idle watchdog: the dead respawn runs BEFORE (not behind) the switch; leveling asks the switch'); }
has(/if \(!runAuto\('watchdog'\)\) return;[^\n]*\n  note\(`watchdog: team has been idle/, 'old (non-lead) watchdog asks the switch');
has(/if \(!runAuto\('leveling after an automatic pause'\)\) return;/, 'an automatic pause (raid wipe / done) only expires into leveling while ON');
{ const b = fnBody('async function resumeActivity()'); const r = b.indexOf("runAuto('resume')"), rf = b.indexOf('raidFightResume()'), ro = b.indexOf('resumeOrder()');
  check(r > 0 && rf > 0 && rf < r && ro > 0 && ro < r, 'resume after a restart: a raid fight in progress + a town ORDER on the way still resume; the activity only while ON');
  check(/if \(!runAuto\('resume'\)\) \{[^\n]*return; \}/.test(b), '... the activity resume returns while OFF'); }
has(/const k = dailyDue\(\);\n  if \(!k\) return;\n  if \(!runAuto\('daily Kamaloka'\)\) return;/, 'daily Kamaloka asks the switch');
has(/if \(!low\.length\) return;\n  if \(!runAuto\('supply run'\)\) return;/, 'supply watch asks the switch');
has(/const runOK = runOn\(\);[^\n]*\n  if \(ok && runOK && leadMode\(\)[^\n]*supplyDue/, 'Giran regroup: no automatic supply run while OFF');
['fund other teams', 'seven signs'].forEach(s => has(new RegExp("if \\(ok && runOK && leadMode\\(\\)[^\\n]*pstStep\\('regroup', '" + s + "'\\)"), `Giran regroup: no automatic "${s}" while OFF`));
has(/if \(ok && runOK && leadMode\(\) && !rcHub && !leadRunBusy && !regroupRun && Me\.Name === clanLeaderName\(\)\)/, 'Giran regroup: no automatic clan warehouse look while OFF');
has(/if \(!runAuto\('split regroup'\)\) return;[^\n]*\n  if \(!takeControl\('regroup: left behind'/, 'split watchdog asks the switch');
has(/if \(!runAuto\('class change'\)\) return;/, 'automatic class change order asks the switch');
has(/if \(!runOn(?:OrCollector)?\(\)\) return;[^\n]*\n  fund\.lastIdleRound = now\(\);/, 'idle fund round asks the switch');
has(/if \(!runAuto\('town sell'\)\) return;/, 'town sell asks the switch');
has(/if \(!runAuto\('warehouse stash'\)\) return;/, 'automatic warehouse stash asks the switch');
has(/scriptStartAt < 180000 \|\| !runOn(?:OrCollector)?\(\)\) return; lettersTick\(false\)/, 'automatic letters hand-over asks the switch');
has(/CLANHAND_CFG\.startDelayMs \|\| !runOn(?:OrCollector)?\(\)\) return;/, 'automatic clan item hand-over asks the switch');
has(/!clanWhDirty\(\) \|\| !runOn(?:OrCollector)?\(\)\) return;/, 'idle clan warehouse look asks the switch');
has(/now\(\) - clanLvlRun\.last < 15 \* 60000 \|\| !runOn(?:OrCollector)?\(\)\) return;/, 'automatic clan level-up asks the switch');
has(/clanRun\.tries < 3 && runOn\(\)/, 'automatic clan creation asks the switch');
has(/if \(!need\.length\) return;\n    if \(!runAuto\('Seven Signs sign-up'\)\) return;/, 'automatic Seven Signs team sign-up asks the switch');
has(/if \(!runOn(?:OrCollector)?\(\)\) return;          \/\/ RUNSTATE: OFF = no walk to the Priest of Dawn by itself/, 'a character\'s own Seven Signs walk asks the switch');
has(/if \(!runOn(?:OrCollector)?\(\)\) return;[^\n]*no daily clan skill trip/, 'daily clan skill trip asks the switch');
has(/inKamaInstance\(\)\) return;\n    if \(!runOn(?:OrCollector)?\(\)\) return;[^\n]*no quest farm start/, 'quest farm start asks the switch');
has(/CONFIG\.gear\.autoShare \|\| !runOn(?:OrCollector)?\(\)\) return;/, 'automatic gear share asks the switch');
has(/if \(!runAuto\('back-to-the-middle walk'\)\) return;/, 'member "back to the middle" walk asks the switch');
has(/if \(!runAuto\('left-behind trip'\)\) return;[^\n]*\n  if \(!takeControl\('left behind: to Giran'/, 'member left-behind trip asks the switch');
has(/if \(autoLvl\.active\) return;\n  if \(!runAuto\('leveling'\)\) return;/, 'autoLevelLoop: entry gate');
has(/async function raidHuntLoop\(minL, maxL\) \{\n  if \(raidHunt\.active \|\| !isLeader\(\)\) return;\n  if \(!runAuto\('raidhunt'\)\) return;/, 'raidHuntLoop: entry gate');
has(/if \(!runAuto\('raid circuit'\)\) return;[^\n]*\n  const cfg0 = rcConfigOf/, 'raidCircuitLoop: entry gate');
has(/async function leadLevel\(why\) \{\n  if \(!isLeader\(\)\) return;\n  if \(!runAuto\('leveling'\)\)/, 'leadLevel: entry gate');
has(/runOff: !runOn\(\), now: now\(\) \}\);/, 'circuit keeper passes the switch');
// survival / orders are NOT gated
['async function leadSupply(why, opts) {', 'async function leaderMission(kind, arg) {', 'async function orderSupply('].forEach(h => { const b = fnBody(h); check(b && !/runAuto\(|runOn\(\)/.test(b), `order path ${h.split('(')[0].replace('async function ', '')} is never gated (your order runs while OFF)`); });
{ const i = src.indexOf('// THE WATCH (every 3 s)'); const b = src.slice(i, src.indexOf('}, 3000);', i));
  check(!/RequestRestartPoint|Mana Potion|healTick/.test(b), 'the watch never touches survival'); }
// orders that switch ON / OFF
has(/case '!level':[^\n]*\n      if \(isLeader\(\)\) \{ runSetMine\(true, 'your order !level'\); leadLevel/, '!level switches the party ON');
has(/if \(isLeader\(\)\) \{ runSetMine\(true, 'your order !autolevel'\); leadLevel\('!autolevel'\)/, '!autolevel (leader mode) switches ON');
has(/runSetMine\(true, 'your order !autolevel solo'\);\n        autoLevelLoop\(true\)/, '!autolevel solo switches ON only after the "not in a party" check');
has(/runSetMine\(true, 'your order !raidhunt'\);/, '!raidhunt switches ON');
has(/runSetMine\(true, 'your order !circuit start'\);[^\n]*\n      if \(rcOn\(\) && !raidHunt\.stop\)/, '!circuit start switches ON (the circuit keeper then may resume it)');
has(/runSetMine\(true, 'your order !hunthere'\);/, '!hunthere switches ON');
has(/runSetMine\(true, 'your order !dungeon ' \+ d\.name\);/, '!dungeon <name> switches ON (after the Seven Signs check)');
has(/runSetMine\(true, 'your order !assist ' \+ who\);/, '!assist <who> switches ON');
has(/runSetMine\(true, 'your order !zone ' \+ rel\);/, '!zone switches ON');
has(/runSetMine\(true, `your order !levelto \$\{to\}`\);/, '!levelto switches ON');
has(/runSetMine\(false, `level \$\{o\.to\} reached — waiting in Giran`\);/, '!levelto reached: OFF again (waits for your next order)');
has(/if \(arg !== 'auto'\) runSetMine\(true, 'your order !soul hunt'\);/, '!soul hunt switches ON (its own automatic re-pick does not)');
has(/runSetMine\(true, `your clan quest \$\{id\} \(hunt step\)`\);/, 'a clan quest hunt step switches ON');
has(/if \(!\(pi && pi\.auto && now\(\) - pi\.at < 60000\)\) \{ setLeadPaused\(true\); runSetMine\(false, 'your order !stop'\); \}/, 'the USER\'s !stop switches OFF (the automatic one after a raid does not)');
has(/setLeadPaused\(true, orderPauseTag\('autolevel', 'stop'\)\); runSetMine\(false, 'your order !autolevel stop'\);/, '!autolevel stop switches OFF');
has(/case '!start':[^\n]*\n      runStartOrder\(parts\);/, '!start is handled');
check((src.match(/runSetMine\(true/g) || []).length >= 15, `runSetMine(true …) at every start point (${(src.match(/runSetMine\(true/g) || []).length})`);
P.RUN_ON_ORDERS.forEach(o => { const w = o.split(' ')[0]; check(new RegExp("runSetMine\\(true[^\\n]*" + (w === '!clanquest' ? 'clan quest' : w)).test(src) || w === '!start', `RUN_ON_ORDERS ${o}: a handler switches ON`); });
// order plumbing
{ const OS = blk('// ORDERSTICK-PURE-BEGIN', '// ORDERSTICK-PURE-END'); const M = new Function(OS + '\nreturn { ORDER_CMDS, orderNewFor };')();
  check(M.ORDER_CMDS.test('!start') && M.ORDER_CMDS.test('!stop'), '!start is an ORDER (supersedes the order before it)');
  check(M.orderNewFor(['!start'], 'Bishop1', {}) === true && M.orderNewFor(['!start', 'Necro1'], 'Bishop1', {}) === false && M.orderNewFor(['!start', 'bishop1'], 'Bishop1', {}) === true, "'!start <name>' is only that character's order");
  try { const OQ = require(path.join(DASH, 'orderqueue.js')); check(String(OQ.ORDER_RE) === String(M.ORDER_CMDS), 'orderqueue.js ORDER_RE == swarm.js ORDER_CMDS');
    check(OQ.isOrderFor('!start Necro1', 'Bishop1', ['Necro1', 'Bishop1']) === false && OQ.isOrderFor('!start', 'Bishop1') === true, 'orderqueue isOrderFor: !start <name> only for that character'); } catch (e) { check(false, 'orderqueue.js: ' + e.message); } }
if (src.includes('// ==== RCIRCUIT-PURE begin')) {
  const RCB = blk('// ==== RCIRCUIT-PURE begin', '// ==== RCIRCUIT-PURE end'); const R = new Function(RCB + '\nreturn { rcOrderEffect, rcKeeperDecide };')();
  check(R.rcOrderEffect('!start', true) === 'none', 'Start never ends a running circuit');
  check(R.rcKeeperDecide({ running: true, cfgOn: true, bosses: true, loopOn: false, ready: true, runOff: true, now: 1 }).act === 'wait', 'circuit keeper: a stopped party\'s circuit does not resume (waits for Start)');
  check(R.rcKeeperDecide({ running: true, cfgOn: true, bosses: true, loopOn: false, ready: true, runOff: false, now: 1 }).act === 'start', '... and resumes when ON');
}

// ---- 4) dashboard API + page + catalog ---------------------------------------------------------------------------------------
(async () => {
  const A = require(path.join(DASH, 'runstate_api.js'));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'runstate-')); fs.mkdirSync(path.join(tmp, 'Logs')); fs.mkdirSync(path.join(tmp, 'data'));
  const F = path.join(tmp, 'data', 'run_state.json');
  fs.writeFileSync(path.join(tmp, 'data', 'raid_circuits.json'), JSON.stringify({ parties: { Destroyer3: { on: true, bosses: [1, 2, { id: 3, off: true }] } } }));
  fs.writeFileSync(path.join(tmp, 'data', 'party_spots.json'), JSON.stringify({ Tank1: { mode: 'manual', kind: 'zone', spot: 'Cruma Tower' } }));
  const chars = [{ name: 'Tank1', party: 'Tank1', task: 'hunting at Cruma', ageSec: 3, run: { on: false } }, { name: 'Bishop1', party: 'Tank1', ageSec: 3 }, { name: 'Destroyer3', party: 'Destroyer3', ageSec: 3 }, { name: 'Solo', party: 'Solo', ageSec: 3 }];
  const sent = [];
  const ctx = { DATA: path.join(tmp, 'data'), LOGS: path.join(tmp, 'Logs'), ROOT, runStateFile: F, readStates: () => chars, partyOf: (c) => c.party,
    commandRun: async (b) => { sent.push(b.cmd + ' ' + b.target); return { code: 200, body: { ok: true } }; } };
  let s = A.summary(ctx, chars);
  check(s.exists === false && s.parties.every(p => p.on === false), 'API: no file = every party OFF');
  check(s.parties.find(p => p.leader === 'Tank1').plan.text === 'leveling at your chosen spot: Cruma Tower', 'API: Start plan = the chosen spot');
  check(/raid circuit \(2 bosses/.test(s.parties.find(p => p.leader === 'Destroyer3').plan.text), 'API: Start plan = the circuit (switched-off boss not counted)');
  check(/it picks/.test(s.parties.find(p => p.leader === 'Solo').plan.text), 'API: a character alone = solo leveling');
  let r = await A.post(ctx, { party: 'Tank1', on: true });
  check(r.ok && JSON.parse(fs.readFileSync(F, 'utf8')).parties.Tank1.on === true && sent.join() === '!start party:Tank1', 'API: party Start writes ON and sends !start to the party');
  check(r.state.parties.find(p => p.leader === 'Tank1').seen === false, 'API: shows what the leader\'s window sees (not picked up yet)');
  r = await A.post(ctx, { char: 'Bishop1', on: false }); let J = JSON.parse(fs.readFileSync(F, 'utf8'));
  check(r.ok && J.chars.Bishop1.on === false && sent.length === 1, 'API: a member\'s Stop = its hold (file only, no order: its 3 s watch applies it)');
  check(r.state.parties.find(p => p.leader === 'Tank1').held.join() === 'Bishop1', 'API: the party shows its held member');
  r = await A.post(ctx, { party: 'Tank1', on: false }); J = JSON.parse(fs.readFileSync(F, 'utf8'));
  check(J.parties.Tank1.on === false && !J.chars.Bishop1 && sent[1] === '!stop party:Tank1', 'API: party Stop writes OFF, resets the members\' own switches, sends !stop');
  r = await A.post(ctx, { char: 'Destroyer3', on: true }); check(JSON.parse(fs.readFileSync(F, 'utf8')).parties.Destroyer3.on === true && sent[2] === '!start party:Destroyer3', 'API: a leader\'s character toggle = his party\'s switch');
  r = await A.post(ctx, { all: true, on: false }); J = JSON.parse(fs.readFileSync(F, 'utf8'));
  check(['Tank1', 'Destroyer3', 'Solo'].every(l => J.parties[l].on === false) && sent.filter(x => /^!stop/.test(x)).length === 4, 'API: Stop all = every party OFF + !stop to each');
  r = await A.post(ctx, { party: 'Tank1', on: 'yes' }); check(r.code === 400, 'API: on must be true / false');
  r = await A.post(ctx, { party: '../x', on: true }); check(r.code === 400, 'API: bad party name refused');
  fs.writeFileSync(F, '{"parties": {'); r = await A.post(ctx, { party: 'Tank1', on: true }); check(r.code === 500 && /does not parse/.test(r.error), 'API: a broken file is not overwritten');
  check(fs.readFileSync(path.join(tmp, 'Logs', 'dashboard_commands.log'), 'utf8').split('\n').filter(Boolean).length >= 4, 'API: every switch is logged (Logs/dashboard_commands.log)');
  // the API and the bot agree
  const files = [{}, { default: true }, { parties: { L: { on: true } } }, { parties: { L: { on: false } }, chars: { M: { on: false } } }, { parties: { L: { on: true } }, chars: { M: { on: false }, L: { on: false } } }, { chars: { M: { on: true } } }];
  let same = true; files.forEach(f => ['L', 'M', 'X'].forEach(me => { if (JSON.stringify(A.runEffective(f, me, 'L')) !== JSON.stringify(P.runEffective(f, me, 'L'))) same = false; }));
  check(same, 'API runEffective == swarm.js runEffective (6 files x 3 characters)');
  const plans = [{}, { busy: 'leveling' }, { circuit: { on: true, bosses: 2 } }, { spot: { mode: 'manual', kind: 'here', spot: 'H' } }, { spot: { mode: 'manual', kind: 'rooms', spot: 'C', roomIds: ['a', 'b'], nonstop: true } }, { spot: { stages: [1] } }, { solo: true }];
  check(plans.every(x => JSON.stringify(A.runStartPlan(x)) === JSON.stringify(P.runStartPlan(x))), 'API runStartPlan == swarm.js runStartPlan (7 cases)');
  // page module + catalog
  const js = fs.readFileSync(path.join(DASH, 'runswitch.js'), 'utf8');
  check(!/\b(alert|confirm|prompt)\s*\(/.test(js.replace(/uiConfirm|uiAlert|uiPrompt|window\.confirm/g, '')), 'runswitch.js: no browser alert / confirm / prompt (uidialog only)');
  try { new Function(js); check(true, 'runswitch.js compiles'); } catch (e) { check(false, 'runswitch.js compiles: ' + e.message); }
  const C = require(path.join(DASH, 'commands.js'));
  check(C.SWARM_WORDS.includes('!start') && C.COMMANDS.some(c => c.id === 'start' && c.tpl.startsWith('!start')), 'commands catalog: !start (so the server may send it)');
  const html = fs.readFileSync(path.join(DASH, 'index.html'), 'utf8');
  check(/RunSwitch\.partyButton\(leader\)/.test(html) && /RunSwitch\.partyLine\(leader/.test(html) && /id="runAll"/.test(html) && /\/runswitch\.js/.test(html), 'index.html: party toggle + state line + header Start all / Stop all + the module');
  check(!/data-quick="\$\{tgt\}\|!stop\|STOP everything"/.test(html), 'index.html: the old Stop button became the toggle');
  const cp = fs.readFileSync(path.join(DASH, 'charpage.js'), 'utf8'); check(/RunSwitch\.charBlock\(/.test(cp), 'character page: its toggle');
  const sv = fs.readFileSync(path.join(DASH, 'server.js'), 'utf8'); check(/require\('\.\/runstate_api'\)\.handle/.test(sv) && /run: require\('\.\/runstate_api'\)\.summary/.test(sv), 'server.js: /api/runstate + STATE.run');
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\n${n - fails}/${n} checks passed`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
