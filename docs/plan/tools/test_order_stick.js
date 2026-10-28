// OFFLINE TEST of ORDERS STICK (user 2026-10-10: "they should respect what I ask them to; you should not have to ask them twice").
// Incidents of 2026-10-10:
//   a) "!town giran" to Tank1 / Tank3 / Destroyer3 / Tank2: each regrouped in Giran (06:13-06:16Z), then the idle watchdog's
//      leadLevel ported the party out again 3 min later (.dion / .schuttgart) — a town order did not leave the lead pause.
//   b) "!park start" to Tank2 at Plunderous Plains: ONE refusal of .giran ("#2262 Tank2 has received 58 damage from Bandit
//      Undertaker", 06:20:33Z) ended the order; he stood "waiting for orders" in the field until a second !park.
//   node docs/plan/tools/test_order_stick.js       (exit code 1 when a check fails; nothing reaches the game, MCP or Logs)
// 1) ORDERSTICK-PURE of Scripts_dev/swarm.js: orderRetryDecide, orderPauseTag (+ pauseInfo's own regex), orderCmdIs, orderNewFor,
//    orderFatalWhy, orderResumeDecide.
// 2) the REAL host helpers (orderRetry, orderTownTrip, orderWaitControl, orderRelease, orderSupply, resumeOrder) from swarm.js, run on a
//    virtual clock with stubbed game calls: the Tank2 park (refused once -> retried -> in Giran), always refused (5 tries, loud
//    report, saved as failed), a newer order mid-trip, dead / outranked waits, the hub regroup, the reload resume.
// 3) source checks of the wiring (handleSay, !town, !park, !goto npc, !supply, leadLevel, watchdog, resumeActivity).
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const src = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
let fails = 0, n = 0;
const check = (ok, what) => { n++; console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails++; };
const blk = (b, e) => { const i = src.indexOf(b), j = src.indexOf(e, i + 1); if (i < 0 || j < i) { console.error(b + ' block not found'); process.exit(1); } return src.slice(i, j); };
const PURE = blk('// ORDERSTICK-PURE-BEGIN', '// ORDERSTICK-PURE-END');
const M = new Function(PURE + '\nreturn { ORDER_STICK, ORDER_CMDS, orderCmdIs, orderNewFor, orderPauseTag, orderRetryDecide, orderFatalWhy, orderResumeDecide };')();

// ---- 1a) orderRetryDecide ------------------------------------------------------------------------------------------------------
const T0 = 1760076000000;
const D = (o) => M.orderRetryDecide(Object.assign({ done: false, superseded: false, fatal: false, dead: false, outranked: false, tries: 0, startedAt: T0, now: T0, lastWhy: '' }, o));
check(D({}).act === 'try' && D({}).delayMs === 0, 'first step: try at once');
check(D({ done: true }).act === 'done', 'already there (in town): done without a try');
check(D({ tries: 1, lastWhy: 'server said: #2262 ... damage' }).act === 'try' && D({ tries: 1 }).delayMs === 4000, 'a refused step is retried (after 4 s)');
check(D({ tries: 2 }).delayMs === 8000 && D({ tries: 3 }).delayMs === 12000 && D({ tries: 4 }).delayMs === 20000, 'growing gaps 4 / 8 / 12 / 20 s');
const g5 = D({ tries: 5, now: T0 + 90000, lastWhy: 'server said: #2262' });
check(g5.act === 'giveup' && /5 tries/.test(g5.why) && /#2262/.test(g5.why), `cap: give up after 5 tries with the last reason (${g5.why})`);
check(D({ tries: 2, now: T0 + 600000 }).act === 'giveup', 'cap: give up after 10 min whatever the tries');
check(D({ tries: 1, superseded: true }).act === 'superseded' && D({ done: true, superseded: true }).act === 'superseded', 'a newer order wins over everything');
check(D({ tries: 1, dead: true }).act === 'wait' && D({ tries: 1, outranked: true }).act === 'wait', 'dead / a more important task: wait (no try counted)');
check(D({ tries: 1, dead: true, now: T0 + 700000 }).act === 'giveup', 'dead for longer than the time cap: give up');
check(D({ tries: 1, fatal: true, lastWhy: 'no NPC "x" in the atlas' }).act === 'giveup', 'an unfixable failure is not retried');
check(D({ tries: 1, max: 3 }).act === 'try' && D({ tries: 3, max: 3 }).act === 'giveup', 'per-order max (3 for !goto npc / !supply)');
check(D({ tries: 2, done: true }).act === 'done' && /after 2 tries/.test(D({ tries: 2, done: true }).why), 'done after a retry says so');
check(M.orderFatalWhy('no NPC "Bob" in the atlas (Scripts/data/npc_atlas.json)') && M.orderFatalWhy('empty query') && !M.orderFatalWhy('server said: #2262') && !M.orderFatalWhy('the regroup before .giran was interrupted'), 'orderFatalWhy: only atlas / empty query / unknown');

// ---- 1b) pause tags: one word, not 'auto:', readable by pauseInfo's own regex -------------------------------------------------
const reSrc = (src.match(/m = t\.match\((\/\^\(\?:\(\\S\+\)\\s\+\)\?.*?\$\/)\);/) || [])[1];
check(!!reSrc, 'pauseInfo regex found in swarm.js');
const PRE = reSrc ? eval(reSrc) : /^$/;
const parse = (t) => { const m = String(t).trim().match(PRE); return m ? { why: m[1] || '', auto: /^auto:/.test(m[1] || '') } : null; };
for (const [k, a] of [['town', 'Giran'], ['park', 'start'], ['goto-npc', 'Helvetia grocer Giran'], ['park-failed', 'grocer'], ['!town', 'Hunters Village']]) {
  const tag = M.orderPauseTag(k, a), p = parse(tag + ' 2026-10-10T06:13:08.617Z');
  check(p && p.why === tag && !p.auto && /^order:/.test(tag) && !/\s/.test(tag), `tag "${tag}" survives pauseInfo (why read back, not auto)`);
}
check(!/wipe/.test(M.orderPauseTag('town', 'Giran')), 'an order tag never looks like a raid wipe (leadPauseIsWipe)');

// ---- 1c) which commands are new orders ----------------------------------------------------------------------------------------
for (const c of ['!stop', '!park', '!town', '!level', '!supply', '!mission', '!raidhunt', '!goto', '!soe', '!gearup', '!autolevel', '!restock', '!dungeon', '!assist']) check(M.orderCmdIs(c), `${c} is a new order`);
for (const c of ['!status', '!buff', '!gearplan', '!ov', '!classchange', '!loot', '!ready', '!dumpskills', '!enchant', '!stashplan']) check(!M.orderCmdIs(c), `${c} does not replace the running order`);
const roster = { Tank2: 'sk', Bishop1: 'bishop', Tank1: 'sk' };
check(!M.orderNewFor(['!goto', 'npc', 'Helvetia', 'Bishop1'], 'Tank2', roster), '!goto npc <x> <other character>: not a new order in the leader\'s window');
check(M.orderNewFor(['!goto', 'npc', 'Helvetia', 'Bishop1'], 'Bishop1', roster) && M.orderNewFor(['!goto', 'npc', 'Helvetia'], 'Tank2', roster), '!goto npc for me / for the party: a new order');
check(M.orderNewFor(['!PARK', 'start'], 'Tank2', roster), 'case does not matter');

// ---- 1d) resume after a script reload -------------------------------------------------------------------------------------------
const iso = (t) => new Date(t).toISOString();
const rec = { text: '!park start', tag: 'order:park-start', town: 'Giran', state: 'travel', at: iso(T0) };
check(M.orderResumeDecide(rec, T0 + 120000, { why: 'order:park-start', auto: false }).act === 'resume', 'a park still on the way + its pause: resume');
check(M.orderResumeDecide(Object.assign({}, rec, { state: 'done' }), T0 + 120000, { why: 'order:park-start' }).act === 'none', 'a finished order is never replayed');
check(M.orderResumeDecide(Object.assign({}, rec, { state: 'failed' }), T0 + 120000, { why: 'order:park-start' }).act === 'none', 'a failed (reported) order is never replayed');
check(M.orderResumeDecide(rec, T0 + 120000, null).act === 'drop', 'pause gone (!level cleared it): dropped');
check(M.orderResumeDecide(rec, T0 + 120000, { why: 'order:town-Giran' }).act === 'drop', 'another order\'s pause: dropped');
check(M.orderResumeDecide(rec, T0 + 120000, { why: 'auto:wipe', auto: true }).act === 'drop', 'an automatic pause: dropped');
check(M.orderResumeDecide(rec, T0 + 31 * 60000, { why: 'order:park-start' }).act === 'drop', 'older than 30 min: dropped');
check(M.orderResumeDecide(null, T0, null).act === 'none' && M.orderResumeDecide({}, T0, null).act === 'none', 'no saved order: nothing');

// ---- 2) the real host helpers on a virtual clock ------------------------------------------------------------------------------
const HOST = blk('const orderState = {', '// LEADER CONTROL');
const GOTO = blk('async function gotoPlace(text) {', '// JAGT-HJ');                 // the old !goto <place> walk (round 2)
const COLLECT = blk('/** !collect as an order', '// --- Community Board');     // orderCollect (round 2)
function makeEnv(o) {
  const W = Object.assign({ t: T0, town: null, dead: false, leader: true, team: ['Nuker4', 'Nuker2'], ctl: { owner: null, level: 99, gen: 0, since: 0 },
    files: {}, pos: { x: 0, y: 0 }, notes: [], party: [], intents: [], holds: [], tc: [], gg: [], said: [], sup: [], level: [], paused: { why: 'order:park-start', at: T0, auto: false } }, o || {});
  const env = {
    W, now: () => W.t, sleep: async (ms) => { W.t += Math.max(1, ms | 0); if (W.tick) W.tick(W); await Promise.resolve(); },
    state: { running: true }, Me: { Name: 'Tank2', get IsDead() { return W.dead; }, IsInCombat: false, Z: -2000 },
    CONFIG: { lead: { hub: 'Giran' } }, TOWN_CMD: { Giran: 'giran', Dion: 'dion', Schuttgart: 'schuttgart' }, SWARM_ROOT: 'X',
    PRIO: { SURVIVE: 0, UNFREEZE: 1, TEAM_SAFETY: 2, PORT_SAFETY: 3, ORDER: 4, LEVEL: 5, UPKEEP: 6 },
    File: { Exists: (f) => f in W.files, Delete: (f) => { delete W.files[f]; }, WriteAllText: (f, s) => { W.files[f] = s; }, ReadAllText: (f) => W.files[f] },
    note: (m, say) => { W.notes.push(m); if (say) W.party.push(m); }, intent: (a, d) => W.intents.push(`${a}: ${d}`), intentDone: (a, ok, d) => W.intents.push(`-> ${a} ${ok ? 'OK' : 'FAIL'}: ${d}`),
    logError: (w, e) => { W.notes.push('ERROR ' + w + ' ' + (e && e.stack || e)); }, leadMode: () => true, isLeader: () => W.leader,
    currentTownKey: () => W.town, stopCombatG: () => { }, safeSpot: () => null, walkDirect: async () => true, Send: { StopMove: () => { } },
    lastAttackerOnMe: { at: 0 }, num: Number, PartyList: { get Count() { return W.team.length; } },
    takeControl: (name, level) => { const c = W.ctl; if (c.owner && c.owner !== name && c.level < level) return false; if (c.owner !== name) c.gen++; Object.assign(c, { owner: name, level, since: W.t }); return c.gen; },
    releaseControl: (name) => { if (W.ctl.owner === name) Object.assign(W.ctl, { owner: null, level: 99 }); },
    outranked: (level) => !!W.ctl.owner && W.ctl.level < level, get control() { return W.ctl; },
    teamRegroupBeforePort: async (what, town) => { W.holds.push({ what, town, holdLastWas: env.getHoldLast() }); W.t += 20000; return W.holdAnswer ? W.holdAnswer(W.holds.length) : true; },
    townCommand: async (why, town, opts) => { W.tc.push({ why, town, noHold: !!(opts && opts.noHold), lastTownCmd: env.getLastTownCmd() }); W.t += 3000; const ok = W.tcAnswer(W.tc.length, town); if (ok) W.town = town; else env.setSys(W.tcRefusal || '#2262 Tank2 has received 58 damage from Bandit Undertaker.'); return ok; },
    leadGoGiran: async (why) => { W.gg.push(why); W.t += 30000; const ok = W.ggAnswer ? W.ggAnswer(W.gg.length) : true; if (ok) W.town = 'Giran'; else env.setSys('#2262 hit'); return ok; },
    pauseInfo: () => W.paused, SayToParty: (m) => W.said.push(m), handleSay: (c, m) => W.said.push('local:' + m),
    leadSupply: async (why, op) => { W.sup.push(op); return W.supAnswer ? W.supAnswer(W.sup.length) : undefined; },
    autoLvl: { active: false }, raidHunt: { active: false }, autoLevelLoop: async () => { W.level.push(W.t); }, leadPaused: () => !!W.paused,
    // round 2: gotoPlace / orderCollect
    resolvePlace: (t) => (W.places || {})[t] || null, waitFree: async (ms) => { W.waits = (W.waits || 0) + 1; W.t += 1000; return W.freeAnswer ? W.freeAnswer(W.waits) : true; },
    walkTo: async (x, y) => { W.walks = (W.walks || 0) + 1; W.t += 30000; const ok = W.walkAnswer ? W.walkAnswer(W.walks) : true; if (ok) Object.assign(W.pos, { x, y }); return ok; },
    distTo: (x, y) => Math.hypot(x - W.pos.x, y - W.pos.y), IsEnabled: false, DisableBot: () => { }, EnableBot: () => { }, setTask: () => { },
    leadCollect: async (why) => { W.col = (W.col || 0) + 1; return W.colAnswer ? W.colAnswer(W.col) : { ok: true, failed: [] }; },
  };
  const names = Object.keys(env).filter(k => !['W', 'getHoldLast', 'getLastTownCmd', 'setSys', 'leadRunBusy', 'regroupRun'].includes(k));
  const body = `let holdLast = { at: 1 }, lastTownCmd = 12345, gkFail = '', lastSysMsg = null;
    let leadRunBusy = false, regroupRun = null;
    ${PURE}
    ${HOST}
    ${GOTO}
    ${COLLECT}
    return { gotoPlace, orderCollect, orderState, orderBegin, orderSave, orderLoad, orderRetry, orderTownTrip, orderWaitControl, orderRelease, orderSupply, resumeOrder, orderFile,
      getHoldLast: () => holdLast, getLastTownCmd: () => lastTownCmd, setBusy: (v) => { leadRunBusy = !!v; }, setSys: (t) => { lastSysMsg = { text: t, at: now() }; } };`;
  const S = new Function(...names, body)(...names.map(k => env[k]));
  env.getHoldLast = S.getHoldLast; env.getLastTownCmd = S.getLastTownCmd; env.setSys = S.setSys;
  return { W, S, env };
}

(async () => {
  // a) the Tank2 park: refused once in a fight (#2262), then the retry gets there
  {
    const { W, S } = makeEnv({ tcAnswer: (k) => k >= 2 });
    S.orderBegin('!park start');
    const r = await S.orderTownTrip('!park', 'Giran', { control: '!park', tag: 'order:park-start', text: '!park start' });
    check(r.ok && r.tries === 2 && W.town === 'Giran', `park: refused once, retried, in Giran (ok=${r.ok}, tries=${r.tries})`);
    check(W.holds.length === 2 && W.holds[1].holdLastWas === null, 'the retry ran a FRESH hold (holdLast cleared: fight off / out of aggro again)');
    check(W.tc.every(c => c.noHold && c.lastTownCmd === 0 && c.town === 'Giran'), '.giran without a second hold inside townCommand, the min gap reset');
    check(W.party.some(m => /did not work \(server said: #2262/.test(m) && /try 2\/5/.test(m)), 'the retry is reported in party chat with the server\'s reason');
    check(W.intents.some(l => /^-> order OK/.test(l)), 'intent log: order OK at the end');
    const saved = JSON.parse(W.files[S.orderFile()]);
    check(saved.state === 'done' && saved.tries === 2, 'saved trip marked done (never replayed after a reload)');
  }
  // b) always refused: 5 tries, loud report, saved as failed, no leveling started
  {
    const { W, S } = makeEnv({ tcAnswer: () => false });
    S.orderBegin('!park start');
    const r = await S.orderTownTrip('!park', 'Giran', { control: '!park', tag: 'order:park-start', text: '!park start' });
    check(!r.ok && r.tries === 5 && W.tc.length === 5, `always refused: gives up after exactly 5 tries (${r.tries})`);
    check(W.party.some(m => /FAILED — 5 tries/.test(m) && /#2262/.test(m)), 'final failure is loud (party chat) with the last reason');
    check(W.t - T0 < 11 * 60000, `within the time cap (${Math.round((W.t - T0) / 1000)} s)`);
    check(JSON.parse(W.files[S.orderFile()]).state === 'failed', 'saved as failed (no replay)');
  }
  // c) a newer order during the trip ends the retries at once, and never overwrites the new order's saved trip
  {
    const { W, S } = makeEnv({ tcAnswer: () => false });
    S.orderBegin('!park start');
    W.holdAnswer = (k) => { if (k === 2) { S.orderBegin('!level'); } return true; };
    const r = await S.orderTownTrip('!park', 'Giran', { control: '!park', tag: 'order:park-start', text: '!park start' });
    check(!r.ok && r.superseded && W.tc.length <= 2, `a newer order (!level) mid-trip: stopped (superseded=${r.superseded}, .town calls ${W.tc.length})`);
    check(!(S.orderFile() in W.files), 'the old trip does not write its file after the new order cleared it');
  }
  // d) dead for 50 s between tries: waits, the wait is no try
  {
    const { W, S } = makeEnv({ tcAnswer: (k) => { if (k === 1) W.dead = true; return k >= 2; } });
    let deadSeen = 0;
    W.tick = (w) => { if (w.dead) { deadSeen++; if (w.t > T0 + 80000) w.dead = false; } };   // respawn ~1 min after the refused try
    S.orderBegin('!park start');
    const r = await S.orderTownTrip('!park', 'Giran', { control: '!park', tag: 'order:park-start' });
    check(r.ok && r.tries === 2 && deadSeen > 3, `dead after the 1st try: waited ${deadSeen} ticks (no try counted), then the 2nd try worked (tries=${r.tries})`);
  }
  // e) outranked: a P2 task (fund round) holds control -> the order WAITS for it instead of being dropped
  {
    const { W, S } = makeEnv({ tcAnswer: () => true });
    const seq = S.orderBegin('!park start');
    Object.assign(W.ctl, { owner: 'fund other teams', level: 2, gen: 5, since: T0 });   // same object as the script's 'control'
    W.tick = (w) => { if (w.t > T0 + 30000 && w.ctl.owner === 'fund other teams') Object.assign(w.ctl, { owner: null, level: 99 }); };   // the round ends after 30 s
    const got = await S.orderWaitControl('!park', seq);
    W.tick = null;
    check(got && W.ctl.owner === '!park' && W.t >= T0 + 30000, `!park waited for the fund round (P2) and then took control (owner ${W.ctl.owner}, after ${Math.round((W.t - T0) / 1000)} s)`);
    check(W.party.some(m => /comes first — the order waits/.test(m)), 'the wait is said once in party chat');
    S.orderRelease('!park', seq);
    check(W.ctl.owner === null, 'released at the end');
    const s2 = S.orderBegin('!park grocer'); W.ctl.owner = null; await S.orderWaitControl('!park', s2);
    S.orderRelease('!park', seq);
    check(W.ctl.owner === '!park', 'an OLDER !park run never releases the control of the newer !park');
  }
  // f) the hub with regroup (!town giran): leadGoGiran retried, done in Giran
  {
    const { W, S } = makeEnv({ ggAnswer: (k) => k >= 3, tcAnswer: () => true });
    S.orderBegin('!town giran');
    const r = await S.orderTownTrip('!town Giran', 'Giran', { control: '!town', regroup: true, tag: 'order:town-Giran', text: '!town giran' });
    check(r.ok && W.gg.length === 3 && W.tc.length === 0, `!town giran: the Giran regroup retried until it worked (${W.gg.length} regroups)`);
  }
  // g) already in the town: no teleport at all
  {
    const { W, S } = makeEnv({ town: 'Giran', tcAnswer: () => true });
    S.orderBegin('!town giran');
    const r = await S.orderTownTrip('!town Giran', 'Giran', { regroup: true, tag: 'order:town-Giran' });
    check(r.ok && r.tries === 0 && !W.gg.length && !W.tc.length, 'already in Giran: done, nothing sent');
  }
  // h) member (solo): no hold, its own .town retried
  {
    const { W, S } = makeEnv({ leader: false, tcAnswer: (k) => k >= 2 });
    S.orderBegin('!park start');
    const r = await S.orderTownTrip('!park', 'Giran', { solo: true, control: '!park' });
    check(r.ok && W.holds.length === 0 && W.tc.length === 2 && !(S.orderFile() in W.files), 'member: no team hold, its .giran retried, no saved trip (only leaders resume)');
  }
  // i) !supply as an order: waits while another team task runs, retries "could not get to Giran", passes resumeLevel on the retry
  {
    const { W, S } = makeEnv({ supAnswer: (k) => (k === 1 ? 'no-giran' : undefined) });
    let firstRunAt = 0;
    W.tick = (w) => S.setBusy(w.t < T0 + 60000);       // another supply run / regroup holds the team for the first minute
    S.setBusy(true);
    const s0 = W.sup.length; W.supAnswer = (k) => { if (k === 1) firstRunAt = W.t; return k === 1 ? 'no-giran' : undefined; };
    S.orderBegin('!supply');
    await S.orderSupply('!supply');
    W.tick = null;
    check(W.sup.length === s0 + 2 && W.sup[0].order === true, `!supply: waited for the busy team task, then retried after "no-giran" (${W.sup.length} runs)`);
    check(firstRunAt >= T0 + 60000, 'the first run started only after the other team task ended (was: "busy" = dropped)');
    check(!W.sup[0].resumeLevel && W.sup[1].resumeLevel === false, 'resumeLevel only when leveling ran before (it did not here)');
  }
  // j) resume after a reload: a park on the way + its pause -> sent again to the party; a done one is not
  {
    const { W, S } = makeEnv({});
    S.orderSave({ text: '!park start', tag: 'order:park-start', town: 'Giran', state: 'travel', at: iso(T0 - 60000), seq: 1 });
    S.resumeOrder();
    check(W.said.includes('!park start'), 'reload: the park still on the way is sent again (party chat, so the members run their part too)');
    const E2 = makeEnv({});
    E2.S.orderSave({ text: '!park start', tag: 'order:park-start', town: 'Giran', state: 'done', at: iso(T0 - 60000), seq: 1 });
    E2.S.resumeOrder();
    check(!E2.W.said.length, 'reload: a finished park is not replayed');
    const E3 = makeEnv({ paused: null });
    E3.S.orderSave({ text: '!park start', tag: 'order:park-start', town: 'Giran', state: 'travel', at: iso(T0 - 60000), seq: 1 });
    E3.S.resumeOrder();
    check(!E3.W.said.length && JSON.parse(E3.W.files[E3.S.orderFile()]).state === 'dropped', 'reload: pause gone (a newer order) -> dropped, marked so');
  }

  // ---- 2b) round 2 (coordinator 2026-10-10): !goto <place>, !collect, !regroup / !return, orderRetry abort, fatal menus -----------
  check(M.orderFatalWhy('no link to Plunderous Plains at Clarissa (Giran) — its menu: ...') && M.orderFatalWhy("unknown raid boss 'x'"), 'orderFatalWhy: a gatekeeper menu without the link / an unknown boss is not retried');
  // k) !goto <place>: busy once (waitFree false), then a walk that stops short, then arrived
  {
    const { W, S } = makeEnv({ leader: false, places: { Poesia: { name: 'Poesia', x: 5000, y: 0, z: 0 } }, freeAnswer: (k) => k >= 2, walkAnswer: (k) => k >= 2 });
    S.orderBegin('!goto Poesia');
    const r = await S.gotoPlace('Poesia');
    check(r.ok && r.tries === 3 && W.walks === 2, `!goto <place>: busy once + one short walk, then arrived (tries ${r.tries}, walks ${W.walks}) — was "busy -> return" / one walk`);
    check(W.party.some(m => /did not work \(busy/.test(m)), 'the busy wait is reported, not silent');
  }
  {
    const { W, S } = makeEnv({ leader: false, places: {} });
    const r = await S.gotoPlace('Nowhere');
    check(!r.ok && !W.walks && W.party.some(m => /unknown place/.test(m)), '!goto <unknown place>: said, no walk');
  }
  {
    const { W, S } = makeEnv({ leader: false, places: { Poesia: { name: 'Poesia', x: 5000, y: 0, z: 0 } }, walkAnswer: () => false });
    S.orderBegin('!goto Poesia');
    const r = await S.gotoPlace('Poesia');
    check(!r.ok && W.walks === 3 && W.party.some(m => /FAILED — 3 tries/.test(m)), '!goto <place> never arriving: 3 walks, then a loud FAILED');
  }
  // l) !collect: busy first (waits), one trade failed -> a 2nd run, done
  {
    const { W, S } = makeEnv({ colAnswer: (k) => (k === 1 ? { ok: false, failed: ['Bishop1'], got: 5e6 } : { ok: true, failed: [], got: 1e6 }) });
    let started = 0;
    W.tick = (w) => S.setBusy(w.t < T0 + 45000);
    S.setBusy(true);
    const orig = W.colAnswer; W.colAnswer = (k) => { if (k === 1) started = W.t; return orig(k); };
    S.orderBegin('!collect');
    await S.orderCollect('!collect');
    W.tick = null;
    check(W.col === 2 && started >= T0 + 45000, `!collect: waited for the busy team task (was "busy" = dropped), then asked Bishop1 again after the failed trade (${W.col} runs)`);
    check(W.party.some(m => /trade failed: Bishop1/.test(m)), 'the failed trade is named in party chat');
  }
  {
    const { W, S } = makeEnv({ colAnswer: () => 'busy' });
    S.orderBegin('!collect');
    await S.orderCollect('!collect');
    check(W.col === 3 && W.party.some(m => /FAILED — 3 tries/.test(m)), '!collect always refused: 3 runs, then a loud FAILED');
  }
  // m) lead-mode !regroup / !return = the supply run, ALWAYS back to leveling afterwards (thenLevel), also when it finally fails
  {
    const { W, S } = makeEnv({ supAnswer: () => undefined });
    S.orderBegin('!regroup');
    await S.orderSupply('!regroup', { thenLevel: true });
    check(W.sup.length === 1 && W.sup[0].resumeLevel === true, '!regroup: one supply run that resumes leveling afterwards (home, restock, back)');
    const E = makeEnv({ supAnswer: () => 'no-giran', paused: null });   // the handler clears the pause first
    E.S.orderBegin('!return');
    await E.S.orderSupply('!return', { thenLevel: true });
    check(E.W.sup.length === 3 && E.W.level.length === 1, '!return never reaching Giran: 3 tries, then back to leveling (not idle in the field)');
  }
  // n) orderRetry abort (a mission's !mission stop / aborted team run): ends the loop like a newer order — the raid travel uses it
  {
    const { W, S } = makeEnv({});
    let aborted = false, tries = 0;
    S.orderBegin('!mission raid X');
    const r = await S.orderRetry('raid X', { what: 'travel to X', team: true, max: 2, abort: () => aborted, attempt: async () => { tries++; aborted = true; return { ok: false, why: '4000 from X' }; } });
    check(!r.ok && r.superseded && tries === 1, 'raid travel: !mission stop during the trip -> no second try');
    const E = makeEnv({});
    let n2 = 0;
    E.S.orderBegin('!mission raid X');
    const r2 = await E.S.orderRetry('raid X', { what: 'travel to X', team: true, max: 2, attempt: async () => { n2++; return { ok: false, why: '4000 from X' }; } });
    check(!r2.ok && n2 === 2 && E.W.holds.length === 0, 'raid travel: max 2 tries (CONFIG.mission.travelTries), then the old "could not reach" path');
  }

  const has = (re, what) => check(re.test(src), 'source: ' + what);
  // ---- 3) source checks ---------------------------------------------------------------------------------------------------------
  const lm = blk('async function leaderMission(kind, arg, opt) {', '\n// ---');
  check(/while \(regroupRun && state\.running && orderState\.seq === mseq/.test(lm) && !/SayToParty\(`\[mission\] busy: \$\{regroupRun\.reason\}`\); return; \}/.test(lm), 'source: leaderMission waits for a running team task (no "busy" drop)');
  check(/orderRetry\('kamaloka', \{ what: `teleport to \$\{k\.entry\.town\}`, team: true, max: 3, abort: \(\) => !regroupAlive\(runId\)/.test(lm), 'source: Kamaloka travel teleport retried (3), stops on !mission stop');
  { const i = lm.indexOf('const rt = await orderRetry(`raid ${boss.name}`'), j = lm.indexOf('raidClearArea(boss, runId)'), k = lm.indexOf('waitBossDead(boss, runId'), e = lm.indexOf('// ORDERSTICK (2026-10-10): only the TRAVEL');
    check(i > 0 && i < j && j < k && !/orderRetry/.test(lm.slice(j)), 'source: raid — only the TRAVEL is in orderRetry; clear / countdown / fight (waitBossDead) come after it, never retried or escaped');
    check(/max: (?:rcOn\(\) \? Math\.max\(3, num\(CONFIG\.mission\.travelTries\) \|\| 2\) : \(num\(CONFIG\.mission\.travelTries\) \|\| 2\), maxMs: rcOn\(\) \? 2400000 : undefined,[^\n]*\s*|num\(CONFIG\.mission\.travelTries\) \|\| 2, )abort: \(\) => !regroupAlive\(runId\),\s*done: \(\) => Math\.hypot\(boss\.x - Me\.X, boss\.y - Me\.Y\) <= 3000/.test(lm) && e > 0, 'source: raid travel done = within 3000 of the boss, stops on !mission stop');
    check(/travelTries: 2,/.test(src), 'source: CONFIG.mission.travelTries = 2'); }
  const gk = blk("case '!gk': {", "case '!raidbuff':");
  check(/setLeadPaused\(true, orderPauseTag\('gk', where\)\)/.test(gk) && /orderRetry\(`!gk \$\{where\}`/.test(gk) && /max: 3/.test(gk) && /orderWaitControl\('!gk', gseq\)/.test(gk), 'source: !gk stays (pause), waits for control, retries the teleport (3)');
  has(/case '!collect':[\s\S]{0,120}orderCollect\('!collect'\)/, '!collect goes through orderCollect');
  has(/return 'busy'; \}\s*\n\s*if \(!takeControl\('!collect'/, "leadCollect says 'busy' instead of a silent return");
  has(/case '!regroup':[\s\S]{0,120}case '!return':[\s\S]{0,1200}if \(leadMode\(\)\) \{ setLeadPaused\(false\); orderSupply\(cmd, \{ thenLevel: true \}\)/, 'lead-mode !regroup / !return = the supply run, then leveling');
  const lr = blk('async function leaderRegroup(reason, opts) {', 'function abortRegroup(why)');
  check(/while \(regroupRun && state\.running && orderState\.seq === seq/.test(lr) && /for \(let k = 1; k <= 3 && regroupAlive\(runId\); k\+\+\)/.test(lr) && !/SayToParty\(`\[regroup\][^`]*try !return again/.test(lr), 'source: old leaderRegroup waits when busy and retries its farm teleport (3)');
  const gp = blk('async function gotoPlace(text) {', '// JAGT-HJ');
  check(/orderRetry\(`!goto \$\{p\.name\}`/.test(gp) && !/if \(!\(await waitFree\(30000\)\)\) return;/.test(gp), 'source: gotoPlace retries, no silent busy return');
  has(/if \(orderNewFor\(parts, Me\.Name, CONFIG\.roster\)\) orderBegin\(text\.trim\(\)\);/, 'handleSay starts a new order for every ORDER_CMDS command');
  { const i = src.indexOf('if (orderNewFor(parts'), j = src.indexOf("if (cmd === '!gearup')"), k = src.indexOf("if (leadMode() && cmd === '!restock')"); check(i > 0 && i < j && i < k, 'source: ...before the early handlers (!restock, !autolevel, !gearup) and the switch'); }
  const town = blk("case '!town': {", "case '!gk': {");
  check(/setLeadPaused\(true, tag\)/.test(town) && /orderPauseTag\('town', want\)/.test(town), 'source: !town leaves the lead pause (order:town-<x>) like !park');
  check(/orderTownTrip\(`!town \$\{want\}`, want, \{ control: '!town', regroup: want === CONFIG\.lead\.hub/.test(town) && /orderWaitControl\('!town', seq\)/.test(town), 'source: !town = orderTownTrip (hub regroup) + waits for control');
  check(/orderTownTrip\(`!town \$\{want\}`, want, \{ solo: true \}\)/.test(town), 'source: a member retries its own .town when the server did not take it along');
  const park = blk("case '!park': {", "case '!town': {");
  check(/orderWaitControl\('!park', seq\)/.test(park) && !/if \(!takeControl\('!park'/.test(park), 'source: !park waits for control (no silent return)');
  check(/orderTownTrip\('!park', 'Giran'/.test(park) && /orderRelease\('!park', seq\)/.test(park), 'source: !park = orderTownTrip, releases only its own control');
  check(/setLeadPaused\(true, tag\)/.test(park) && /park-failed/.test(park), 'source: !park keeps the pause, a failure is tagged park-failed and said');
  const gnpc = blk("if (String(parts[1] || '').toLowerCase() === 'npc')", "gotoPlace(parts.slice(1).join(' '))");
  check(/orderWaitControl\('!goto npc', seq\)/.test(gnpc) && /orderRetry\(`!goto npc \$\{query\}`/.test(gnpc) && /max: 3/.test(gnpc), 'source: !goto npc waits for control and retries (3)');
  has(/case '!supply':[\s\S]{0,200}orderSupply\('!supply'\)/, '!supply goes through orderSupply');
  has(/cmd === '!restock'\) \{ if \(isLeader\(\)\) (\{ setLeadPaused\(false\); )?orderSupply\('!restock'\)/, '!restock (lead mode) goes through orderSupply');   // CMDFIX2-SUPPLY: may clear the lead pause first (like !supply)
  has(/return 'no-giran';/, "leadSupply says 'no-giran' when the Giran regroup failed");
  const ll = blk('async function leadLevel(why) {', '// --- Supplies');
  check(/orderRetry\(`level \(\$\{why\}\)`/.test(ll) && !/try again', true\)/.test(ll), 'source: leadLevel retries the Giran regroup (no "try again")');
  check(/if \(leadPaused\(\)\) return;\s*\/\/ a !stop/.test(ll), 'source: leadLevel does not start leveling when a pause came in meanwhile');
  has(/if \(leadPaused\(\)\) return;\s*\/\/ the user said !stop/, 'idle watchdog respects the lead pause (so !town / !park stick)');
  has(/if \(leadRunBusy \|\| state\.levelRetry \|\|/, 'idle watchdog skips while leadLevel is retrying');
  has(/try \{ resumeOrder\(\); \} catch \(e\) \{ logError\('resumeOrder', e\); \}/, 'resumeActivity resumes a town order still on the way');
  has(/if \((?:orderState\.seq !== gseq|orderReplaced\(gseq\))\) return;/, '!gearup does not level over a newer order');
  has(/const opts = arguments\[2\] \|\| \{\};/, 'townCommand takes { noHold }');
  check(!/new Map\(/.test(src), 'source: no new Map() (L2Swarm host type clash)');

  console.log(`\n${n - fails}/${n} checks passed`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
