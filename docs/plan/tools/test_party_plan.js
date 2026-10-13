// OFFLINE TEST of the PARTY PLAN (owner 2026-10-13: "make a plan for a character and choose e.g. quests along the way ... a lovely way to do
// it"). Never touches the game, MCP or the live Logs / data files.
//   node docs/plan/tools/test_party_plan.js        (exit code 1 when a check fails; SWARM_JS=<file> tests another copy of swarm.js)
// 1) PARTYPLAN-PURE of Scripts_dev/swarm.js (planCursor = Dashboard/planlogic.js planCursor on a matrix; quest / class / raid judges, order
//    texts, Start info) + runStartPlan (bot == Dashboard/runstate_api.js) with a plan.
// 2) the REAL host part (planRun / planCommand / the step runners / the resume timer) on a stubbed host with an in-memory file system and a
//    virtual clock: level step via the spot picker (partySpotEntry gets the step's place) until the lowest level is reached, a quest step via
//    the quest engine (qeStart party mode, done by the quest_state record), a solo quest for named characters (!quest ... solo <name>),
//    class change (only 'ready' = approved plans; changed / skipped / blocked), town / supply / gearup / raid orders watched to the end,
//    stop at "wait for my order" + !plan next, the end (switch OFF), a user order pauses it, Stop (switch OFF) pauses it, onFail skip / stop,
//    resume after a restart (the same step, the quest not started twice), !plan goto / restart.
// 3) Dashboard/planlogic.js: normalising, sentences, checks (warnings), suggestPlan on the real data, applySteps, progressLine.
// 4) Dashboard/partyplan_api.js on a scratch file: set / use / rev conflict (409) / history / templates / apply / control (command sent).
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), vm = require('vm');
const ROOT = path.join(__dirname, '..', '..', '..');
const SRCF = process.env.SWARM_JS || path.join(ROOT, 'Scripts_dev', 'swarm.js');
const src = fs.readFileSync(SRCF, 'utf8');
const DASH = path.join(ROOT, 'Dashboard');
let fails = 0, n = 0;
const check = (ok, what) => { n++; console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails++; };
const blk = (b, e) => { const i = src.indexOf(b), j = src.indexOf(e, i + 1); if (i < 0 || j < i) { console.error(b + ' block not found'); process.exit(1); } return src.slice(i, j); };
const PURE = blk('// PARTYPLAN-PURE-BEGIN', '// PARTYPLAN-PURE-END');
const P = new Function(PURE + '\nreturn { PLAN_KINDS, planOfParty, planCursor, planStepSay, planOrderText, planQuestJudge, planClassDecide, planRaidOutcome, planStartInfo };')();
const PL = require(path.join(DASH, 'planlogic.js'));
const RSP = new Function(blk('// RUNSTATE-PURE-BEGIN', '// RUNSTATE-PURE-END') + '\nreturn runStartPlan;')();
const RSA = require(path.join(DASH, 'runstate_api.js'));

// ---- 1) pure ----------------------------------------------------------------------------------------------------------------------
const S = (id, kind, x) => Object.assign({ id, kind }, x || {});
const plan1 = { name: 'T', on: true, steps: [S('s1', 'level', { to: 20 }), S('s2', 'quest', { quest: 101 }), S('s3', 'wait'), S('s4', 'town', { town: 'Giran' })] };
const progs = [{}, { stepId: 's2' }, { stepId: 's2', done: { s2: {} } }, { done: { s1: {} } }, { done: { s1: {}, s2: {}, s3: {}, s4: {} } }, { stepId: 'gone' }, { stepId: 'gone', done: { s1: {} } }, { stepId: 's4', done: { s4: {} } }, { stepId: 's3', done: { s1: {}, s2: {} } }];
progs.forEach((pg, i) => check(P.planCursor(plan1, pg) === PL.planCursor(plan1, pg), `planCursor bot == dashboard (case ${i}: ${P.planCursor(plan1, pg)})`));
check(P.planCursor(plan1, {}) === 0 && P.planCursor(plan1, { stepId: 's2', done: { s2: {} } }) === 2 && P.planCursor(plan1, { done: { s1: {}, s2: {}, s3: {}, s4: {} } }) === 4, 'planCursor: start / after a done step / finished');
check(P.planCursor(plan1, { stepId: 'gone', done: { s1: {} } }) === 1, 'planCursor: a removed step = the first open step');
check(P.planOfParty({ parties: { A: { on: true, steps: [S('s1', 'level', { to: 1 }), S('x', 'level', { to: 9 }), S('s2', 'bogus'), S('s3', 'quest', {}), S('s4', 'wait')] } } }, 'A').steps.map(s => s.id).join() === 's4', 'planOfParty: invalid steps (level < 2, bad id, unknown kind, quest without id) dropped');
check(P.planOfParty({}, 'A') === null && P.planOfParty({ parties: { A: { steps: 'x' } } }, 'A') === null, 'planOfParty: no plan');
check(P.planOrderText({ kind: 'town', town: 'Hunters' }) === '!town hunters' && P.planOrderText({ kind: 'supply' }) === '!supply' && P.planOrderText({ kind: 'gear' }) === '!gearup' && P.planOrderText({ kind: 'raid', boss: 25372, name: 'Discarded Guardian' }) === '!mission raid Discarded Guardian', 'planOrderText: the same orders a user sends');
const T0 = Date.parse('2026-10-13T10:00:00Z');
check(P.planQuestJudge(null, 0, T0) === 'none' && P.planQuestJudge({ runs: 2, status: 'done' }, 1, T0) === 'done', 'quest judge: none / a new completed run');
check(P.planQuestJudge({ runs: 1, status: 'done', startedAt: '2026-10-12T00:00:00Z' }, 1, T0) === 'none', 'quest judge: an OLD run does not count');
check(P.planQuestJudge({ runs: 1, status: 'running' }, 1, T0) === 'running' && P.planQuestJudge({ runs: 0, status: 'failed', startedAt: '2026-10-13T10:01:00Z' }, 0, T0) === 'failed' && P.planQuestJudge({ runs: 0, status: 'cannot', startedAt: '2026-10-13T10:01:00Z' }, 0, T0) === 'cannot', 'quest judge: running / failed / cannot since the step');
const cd = P.planClassDecide([{ name: 'A', status: 'ready', classId: 0, classId0: 0 }, { name: 'B', status: 'missing', classId: 10, classId0: 10 }]);
check(cd.act === 'change' && cd.ready.join() === 'A' && cd.skipped.join() === 'B' && /no approved class plan/.test(cd.why), 'class decide: ready -> change, no plan -> skipped (never changed)');
check(P.planClassDecide([{ name: 'A', status: 'waiting', classId: 1, classId0: 0, needLevel: 40, level: 20 }, { name: 'B', status: 'needs-approval' }]).act === 'done', 'class decide: changed + unapproved = done');
const bl = P.planClassDecide([{ name: 'A', status: 'waiting', classId: 0, classId0: 0, needLevel: 20, nextName: 'Warrior', level: 18 }]);
check(bl.act === 'blocked' && /A \(Warrior at level 20, now 18\)/.test(bl.why), 'class decide: below the class level = blocked, says who + why');
check(P.planRaidOutcome(['2026-10-13T09:00:00.000Z\t25372\tDiscarded Guardian\tdead', '2026-10-13T10:05:00.000Z\t25372\tDiscarded Guardian\twiped'], 25372, T0) === 'wiped' && P.planRaidOutcome(['2026-10-13T09:00:00.000Z\t25372\tX\tdead'], 25372, T0) === null, 'raid outcome: only after the step started');
const si = P.planStartInfo(plan1, { stepId: 's2' }, false);
check(si.on && si.idx === 1 && si.left === 3 && /step 2\/4: quest 101/.test(si.text), 'start info: step 2/4');
[{ plan: si }, { plan: Object.assign({}, si, { running: true }) }, { plan: Object.assign({}, si, { status: 'waiting' }) }, { plan: Object.assign({}, si, { on: false }), busy: 'leveling' }, { plan: Object.assign({}, si, { left: 0 }) }, { plan: si, circuit: { on: true, bosses: 2 } }, {}].forEach((x, i) => {
  const a = RSP(x), b = RSA.runStartPlan(x);
  check(JSON.stringify(a) === JSON.stringify(b), `runStartPlan bot == dashboard with a plan (case ${i}: ${a.act})`);
});
check(RSP({ plan: si }).act === 'plan' && RSP({ plan: si, busy: 'leveling' }).act === 'plan' && RSP({ plan: Object.assign({}, si, { running: true }) }).act === 'already', 'Start: a switched-on plan wins over leveling; already running = nothing new');
check(RSP({ plan: Object.assign({}, si, { on: false }) }).act === 'level' && RSP({ plan: Object.assign({}, si, { left: 0 }) }).act === 'level', 'Start: a plan that is off / finished = the normal activity');

// ---- 2) host part -----------------------------------------------------------------------------------------------------------------
const HOST = blk('// ===== PARTY PLAN (PLAN-2026-10-13', '// ===== QUEST ENGINE (QENGINE-2026-10-12');
const ORDER_RE = /^!(stop|start|park|town|level|autolevel|supply|restock|collect|mission|raidhunt|goto|gk|soe|regroup|return|gearup|assist|dungeon|jointraid|siege|routetest|escort|career|farm|go|raid|hunthere|formation|dawn)$/;
function world(o) {
  const W = Object.assign({ t: Date.parse('2026-10-13T12:00:00Z'), files: {}, said: [], notes: [], sent: [], ev: [], intervals: [], timeouts: [], on: true, lvl: 10, town: '', paused: null, quests: {}, qeRuns: [], cls: {}, levels: {}, team: ['Bishop1', 'Necro1'], spotSeen: [], leadCalls: 0, runSets: [] }, o || {});
  const ROOTW = 'C:\\SW';
  const ctx = {
    console, JSON, Math, Date, Object, Array, String, Number, Promise, RegExp, Error, parseInt, isNaN, isFinite,
    __DIR__: ROOTW, SWARM_ROOT: ROOTW, scriptStartAt: Date.now() - 120000,
    CONFIG: { leader: 'Tank1', roster: { Tank1: {}, Bishop1: {}, Necro1: {} } },
    Me: { Name: 'Tank1', get Level() { return W.levels.Tank1 || W.lvl; }, get ClassId() { return W.cls.Tank1 != null ? W.cls.Tank1 : 0; } },
    state: { running: true, role: 'sk', mode: 'idle' },
    orderState: { seq: 0, text: '', at: 0 },
    autoLvl: { active: false, stop: false, spot: null },
    regroupRun: null, leadRunBusy: false, control: { owner: '' },
    PartyList: { get Count() { return W.team.length; } },
    File: {
      ReadAllText: (f) => { if (!(f in W.files)) throw new Error('no file ' + f); return W.files[f]; },
      WriteAllText: (f, t) => { W.files[f] = String(t); }, Exists: (f) => f in W.files,
    },
    fileStamp: (f) => (f in W.files ? 'v' + W.files[f].length + ':' + W.files[f].slice(-20) : ''),
    num: (v) => Number(v) || 0, now: () => W.t,
    sleep: async (ms) => { W.t += ms; tick(); await new Promise(r => setImmediate(r)); },
    setTimeout: (fn, ms) => { W.timeouts.push({ at: W.t + (ms || 0), fn }); return W.timeouts.length; },
    setInterval: (fn) => { W.intervals.push(fn); return W.intervals.length; },
    SCHED: { clear: () => { } }, IsCharacterReady: () => true,
    isLeader: () => true, runOn: () => W.on, teamNames: () => W.team.slice(),
    orderCmdIs: (w) => ORDER_RE.test(String(w || '').toLowerCase()),
    orderBegin: (text) => { ctx.orderState.seq++; ctx.orderState.text = String(text); ctx.orderState.at = W.t; return ctx.orderState.seq; },
    pauseInfo: () => W.paused ? { why: W.paused.why, at: W.paused.at, auto: /^auto:/.test(W.paused.why) } : null,
    setLeadPaused: (on, why) => { W.paused = on ? { why: why || '', at: W.t } : null; },
    orderPauseTag: (k, a) => `order:${k}${a ? '-' + a : ''}`,
    runSetMine: (on, why) => { W.runSets.push({ on, why }); W.on = !!on; return true; },
    note: (m, say) => { W.notes.push(String(m)); }, intent: () => { }, intentDone: () => { }, logError: (w, e) => { W.notes.push('ERROR ' + w + ': ' + (e && e.message)); },
    SayToParty: (t) => { W.said.push(String(t)); if (String(t)[0] === '!') hear(String(t)); },
    handleSay: (n, t) => hear(String(t)),
    lvlToMin: () => Math.min(W.lvl, ...W.team.map(nm => W.levels[nm] || W.lvl)),
    leadLevel: async (why) => { W.leadCalls++; W.spotSeen.push(JSON.parse(JSON.stringify(ctx.partySpotEntry()))); ctx.autoLvl.active = true; ctx.autoLvl.stop = false; },
    autoLevelLoop: async () => { W.leadCalls++; ctx.autoLvl.active = true; },
    inRaid: () => false, currentTownKey: () => W.town,
    partySpots: () => ({ Tank1: { mode: 'manual', kind: 'zone', spot: 'Party own place' } }),
    partyMember: () => null, lastState: (nm) => ({ level: W.levels[nm] || W.lvl, classId: W.cls[nm] != null ? W.cls[nm] : 0 }),
    QEST: { quests: {} }, QES: { running: false, q: null },
    qeS: () => ctx.QES, qeSt: () => ctx.QEST,
    qeQuest: (id) => ({ id, type: id === 777 ? 'repeatable' : 'one-time' }), qeRepeatable: (q) => q.type === 'repeatable',
    qeStart: (spec) => { W.qeRuns.push(spec); ctx.QES.running = true; ctx.QES.q = { id: spec.id }; const rec = ctx.QEST.quests[spec.id] = Object.assign({ runs: 0 }, ctx.QEST.quests[spec.id] || {}, { status: 'running', startedAt: new Date(W.t).toISOString() });
      const r = W.questResult && W.questResult[spec.id] || 'done';
      W.ev.push({ at: W.t + 600000, fn: () => { ctx.QES.running = false; if (r === 'done') { rec.runs++; rec.status = 'done'; } else { rec.status = r; rec.lastMsg = 'the NPC refused'; } } }); },
    qeStopReq: () => { ctx.QES.running = false; return true; },
    classPlanOf: (nm) => (W.cp && W.cp[nm]) || { status: 'missing' },
    classChange: async () => ({ ok: true, msg: 'changed' }),
  };
  ctx.partySpotEntry = () => { const pe = ctx.planSpotEntry(); if (pe) return pe; return ctx.partySpots().Tank1; };
  function tick() {
    W.ev.sort((a, b) => a.at - b.at);
    while (W.ev.length && W.ev[0].at <= W.t) { const e = W.ev.shift(); try { e.fn(); } catch (x) { W.notes.push('EV ERR ' + x.message); } }
    W.timeouts.sort((a, b) => a.at - b.at);
    while (W.timeouts.length && W.timeouts[0].at <= W.t) { const e = W.timeouts.shift(); try { e.fn(); } catch (x) { W.notes.push('TO ERR ' + x.message); } }
  }
  function hear(text) {                                                // the leader's own handleSay (+ what the order then does)
    W.sent.push(text);
    const p = text.trim().split(/\s+/), w = p[0].toLowerCase();
    if (ORDER_RE.test(w)) ctx.orderBegin(text.trim());
    if (w === '!plan') { ctx.planCommand(p); return; }
    if (W.onOrder) W.onOrder(text, ctx, W);
  }
  W.ctx = ctx; W.tick = tick;
  vm.createContext(ctx);
  vm.runInContext(HOST, ctx, { filename: 'swarm.js#PARTYPLAN' });
  W.prog = () => { try { return JSON.parse(W.files['C:\\SW\\Logs\\plan_progress_Tank1.json']); } catch (e) { return {}; } };
  W.setPlan = (steps, on) => { W.files['C:\\SW\\Scripts\\data\\party_plans.json'] = JSON.stringify({ v: 1, parties: { Tank1: { name: 'Test plan', on: on !== false, steps } } }); ctx.PLAN.chk = 0; };
  W.run = async (maxMs) => { const p = ctx.planRun('test'); let stop = false; p.then(() => { stop = true; }); const t0 = W.t; while (!stop && W.t - t0 < (maxMs || 6 * 3600000)) await ctx.sleep(5000); await p.catch(() => { }); return p; };
  return W;
}
const LVL_UP = (W, per) => { W.ev.push({ at: W.t, fn: function up() { if (W.ctx.autoLvl.active && !W.ctx.autoLvl.stop) { W.lvl++; } if (W.ctx.autoLvl.stop) W.ctx.autoLvl.active = false; W.ev.push({ at: W.t + (per || 300000), fn: up }); } }); };

(async () => {
  // A: level (chosen place) -> party quest -> wait -> !plan next -> level -> end
  {
    const W = world();
    W.setPlan([S('a1', 'level', { to: 12, spot: { mode: 'manual', kind: 'zone', spot: 'Abandoned Camp (route 20-40)' } }), S('a2', 'quest', { quest: 101, mode: 'party', repeat: 1 }), S('a3', 'wait', { note: 'check gear' }), S('a4', 'level', { to: 14, spot: { mode: 'auto' } })]);
    LVL_UP(W);
    await W.run();
    const pg = W.prog();
    check(W.spotSeen[0] && W.spotSeen[0].mode === 'manual' && W.spotSeen[0].kind === 'zone' && W.spotSeen[0].spot === 'Abandoned Camp (route 20-40)' && W.spotSeen[0].plan === 'a1', 'A level step: leveling gets the STEP\'s place through partySpotEntry (spot picker)');
    check(!!pg.done.a1 && /level 12 reached/.test(pg.done.a1.result) && W.lvl >= 12, 'A level step: done when the lowest level reaches 12');
    check(W.qeRuns.length === 1 && W.qeRuns[0].id === 101 && W.qeRuns[0].mode === 'party', 'A quest step: the quest engine runs quest 101 in party mode');
    check(!!pg.done.a2 && /quest 101 done/.test(pg.done.a2.result), 'A quest step: done by the quest_state record (a new completed run)');
    check(pg.status === 'waiting' && pg.stepId === 'a3' && W.paused && /plan-wait/.test(W.paused.why), 'A wait step: the plan stops (waiting) with a lead pause (no idle leveling)');
    check(W.ctx.PLAN.running === false && W.ctx.partySpotEntry().spot === 'Party own place', 'A: nothing runs while waiting; the party\'s own place is back');
    W.ctx.planCommand(['!plan', 'next']);
    for (let i = 0; i < 400 && W.ctx.PLAN.running; i++) await W.ctx.sleep(5000);
    await W.ctx.sleep(1000);
    const p2 = W.prog();
    check(!!p2.done.a3 && /continue/.test(p2.done.a3.result), 'A !plan next: the wait step is done');
    check(W.spotSeen[1] && W.spotSeen[1].mode === 'auto', 'A 2nd level step: "leader picks" = auto spot');
    check(p2.status === 'done' && W.runSets.some(r => r.on === false && /finished/.test(r.why)) && /plan-done/.test((W.paused || {}).why || ''), 'A end: status done, the run switch OFF, lead pause');
    check(W.said.some(s => /\[plan\] step 2\/4: quest 101/.test(s)) && W.said.some(s => /finished/.test(s)), 'A: party chat says each step + the end');
  }
  // B: a user order pauses it; Start (!plan start) goes on with the SAME step; Stop (switch OFF) pauses it
  {
    const W = world();
    W.setPlan([S('b1', 'level', { to: 30 }), S('b2', 'wait')]);
    LVL_UP(W);
    const p = W.ctx.planRun('test');
    await W.ctx.sleep(30000); await W.ctx.sleep(5000);
    W.ctx.orderBegin('!town giran');                                    // the user's order
    for (let i = 0; i < 20 && W.ctx.PLAN.running; i++) await W.ctx.sleep(5000);
    await p;
    check(W.prog().status === 'paused' && /your order "!town giran" took over/.test(W.prog().why) && W.prog().stepId === 'b1', 'B: a user order pauses the plan at the same step (says which order)');
    W.ctx.planCommand(['!plan', 'start']);
    await W.ctx.sleep(10000);
    check(W.ctx.PLAN.running && W.prog().stepId === 'b1' && W.prog().status === 'running', 'B: !plan start goes on with the same step');
    W.on = false;
    for (let i = 0; i < 20 && W.ctx.PLAN.running; i++) await W.ctx.sleep(5000);
    check(!W.ctx.PLAN.running && W.prog().status === 'paused' && /switched OFF/.test(W.prog().why), 'B: the switch OFF (Stop) pauses the plan');
    check(W.ctx.planStartInfo(W.ctx.planMine(), W.prog(), false).idx === 0, 'B: Start would begin with step 1 again (not done)');
  }
  // C: quest by named characters alone; one fails -> onFail stop = blocked; skip = goes on
  {
    const W = world();
    W.setPlan([S('c1', 'quest', { quest: 202, mode: 'solo', who: ['Bishop1', 'Necro1', 'Nobody'], onFail: 'stop' }), S('c2', 'town', { town: 'Giran' })]);
    W.onOrder = (text, ctx) => {                                       // the members' windows run the !quest order and write their quest_state
      const m = text.match(/^!quest (\d+) repeat (\d+) solo (\w+)/); if (!m) return;
      const nm = m[3], f = `C:\\SW\\Logs\\quest_state_${nm}.json`, ok = nm === 'Bishop1';
      W.files[f] = JSON.stringify({ quests: { 202: { runs: 0, status: 'running', startedAt: new Date(W.t).toISOString() } } });
      W.ev.push({ at: W.t + 900000, fn: () => { W.files[f] = JSON.stringify({ quests: { 202: ok ? { runs: 1, status: 'done', startedAt: new Date(W.t - 900000).toISOString() } : { runs: 0, status: 'failed', lastMsg: 'no progress', startedAt: new Date(W.t - 900000).toISOString() } } }); } });
    };
    await W.run();
    check(W.sent.filter(s => /^!quest 202 repeat 1 solo (Bishop1|Necro1)$/.test(s)).length === 2 && !W.sent.some(s => /Nobody/.test(s)), 'C: "!quest 202 repeat 1 solo <name>" to each named member (one not in the party is left out)');
    check(W.prog().status === 'blocked' && /Necro1: not finished \(no progress\)/.test(W.prog().why) && /plan-blocked/.test(W.paused.why), 'C: one failed + onFail stop = blocked with the reason');
    const W2 = world();
    W2.setPlan([S('d1', 'quest', { quest: 303, mode: 'party', onFail: 'skip' }), S('d2', 'wait')]);
    W2.questResult = { 303: 'cannot' };
    await W2.run();
    check(/skipped: Tank1: cannot take it/.test((W2.prog().done.d1 || {}).result || '') && W2.prog().status === 'waiting', 'C: onFail skip = skipped with the reason, the plan goes on');
  }
  // D: class change: ready -> !classchange, changed -> done; skipped without a plan; blocked below the level
  {
    const W = world();
    W.cp = { Tank1: { status: 'ready', nextName: 'Palus Knight', needLevel: 20 }, Bishop1: { status: 'needs-approval' }, Necro1: { status: 'ready', nextName: 'Wizard', needLevel: 20 } };
    W.onOrder = (text) => { if (text === '!classchange') W.ev.push({ at: W.t + 20000, fn: () => { W.cls.Tank1 = 32; W.cls.Necro1 = 11; W.cp.Tank1 = { status: 'waiting', nextName: 'Shillien Knight', needLevel: 40 }; W.cp.Necro1 = { status: 'waiting', needLevel: 40 }; } }); };
    W.setPlan([S('e1', 'class'), S('e2', 'wait')]);
    await W.run();
    check(W.sent.includes('!classchange'), 'D: the class step sends !classchange (each window\'s gate = its APPROVED plan)');
    check(/changed: Tank1, Necro1/.test(W.prog().done.e1.result) && /no approved class plan \(not changed\): Bishop1/.test(W.prog().done.e1.result), 'D: done — who changed, who has no approved plan (never changed)');
    const W2 = world();
    W2.cp = { Tank1: { status: 'waiting', nextName: 'Palus Knight', needLevel: 20 } }; W2.lvl = 18; W2.team = [];
    W2.setPlan([S('f1', 'class')]);
    await W2.run();
    check(W2.prog().status === 'blocked' && /Tank1 \(Palus Knight at level 20, now 18\)/.test(W2.prog().why) && !W2.sent.includes('!classchange'), 'D: below the class level = blocked (no class change sent)');
    const W3 = world(); W3.cp = {};
    W3.setPlan([S('g1', 'class'), S('g2', 'wait')]);
    await W3.run();
    check(/nothing to change/.test(W3.prog().done.g1.result) && !W3.sent.includes('!classchange'), 'D: nobody with an approved plan = nothing changed, the plan goes on');
  }
  // E: town / supply / gearup / raid orders, watched until they are finished
  {
    const W = world();
    W.onOrder = (text, ctx) => {
      if (/^!town giran/.test(text)) W.ev.push({ at: W.t + 60000, fn: () => { W.town = 'Giran'; } });
      if (text === '!supply') { W.ev.push({ at: W.t + 20000, fn: () => { ctx.leadRunBusy = true; } }); W.ev.push({ at: W.t + 600000, fn: () => { ctx.leadRunBusy = false; } }); }
      if (text === '!gearup') { const seq = ctx.orderState.seq; W.ev.push({ at: W.t + 300000, fn: () => { W.gearOwned = ctx.planGearupDone(seq); } }); }
      if (/^!mission raid/.test(text)) { W.ev.push({ at: W.t + 30000, fn: () => { ctx.regroupRun = { id: '1', reason: 'mission raid' }; } }); W.ev.push({ at: W.t + 1800000, fn: () => {
        ctx.regroupRun = null; W.files['C:\\SW\\Logs\\raid_seen.log'] = `${new Date(W.t).toISOString()}\t25372\tDiscarded Guardian\tdead\r\n`;
        ctx.SayToParty('!stop'); ctx.setLeadPaused(true, 'auto:raid-done'); } }); }
    };
    W.setPlan([S('h1', 'town', { town: 'Giran' }), S('h2', 'supply'), S('h3', 'gear'), S('h4', 'raid', { boss: 25372, name: 'Discarded Guardian', level: 20 }), S('h5', 'wait')]);
    await W.run();
    const pg = W.prog();
    check(W.sent.includes('!town giran') && /in Giran/.test(pg.done.h1.result), 'E town: "!town giran", done when the party stands in Giran');
    check(/supply run finished/.test(pg.done.h2.result), 'E supply: "!supply", done after the supply run (busy -> idle)');
    check(W.gearOwned === true && /gear bought/.test(pg.done.h3.result), 'E gear: "!gearup", the plan owns it (no leveling after it), done');
    check(/Discarded Guardian killed/.test(pg.done.h4.result), 'E raid: "!mission raid Discarded Guardian", done by its outcome (dead); the automatic !stop after the raid does not pause the plan');
    check(pg.status === 'waiting', 'E: then the wait step');
  }
  // F: resume after a restart: the same step, the quest not started a second time; goto / restart
  {
    const W = world();
    W.setPlan([S('r1', 'level', { to: 5 }), S('r2', 'quest', { quest: 404 }), S('r3', 'wait')]);
    W.files['C:\\SW\\Logs\\plan_progress_Tank1.json'] = JSON.stringify({ stepId: 'r2', status: 'running', stepAt: new Date(W.t - 60000).toISOString(), started: new Date(W.t - 50000).toISOString(), base: { Tank1: 0 }, done: { r1: { result: 'level 5 reached' } } });
    W.ctx.QEST.quests[404] = { runs: 0, status: 'running', startedAt: new Date(W.t - 50000).toISOString() };
    W.ctx.QES.running = true; W.ctx.QES.q = { id: 404 };                 // the quest engine resumed its own run
    W.ev.push({ at: W.t + 300000, fn: () => { W.ctx.QES.running = false; W.ctx.QEST.quests[404] = { runs: 1, status: 'done', startedAt: new Date(W.t - 400000).toISOString() }; } });
    W.intervals.forEach(f => f());                                      // the resume timer (and the paused-check)
    check(W.ctx.PLAN.running, 'F: the resume timer starts the plan again (party ON, it was running)');
    for (let i = 0; i < 300 && W.ctx.PLAN.running; i++) await W.ctx.sleep(5000);
    check(W.qeRuns.length === 0 && /quest 404 done/.test(W.prog().done.r2.result) && W.prog().status === 'waiting', 'F: resumed at the quest step, the quest engine\'s own run counted (not started twice)');
    W.ctx.planCommand(['!plan', 'goto', '2']);
    check(W.prog().stepId === 'r2' && !W.prog().done.r2 && !!W.prog().done.r1 && W.ctx.PLAN.running, '!plan goto 2: step 2 not done again, step 1 stays done, the plan runs');
    for (let i = 0; i < 300 && W.ctx.PLAN.running; i++) await W.ctx.sleep(5000);
    check(/already done before/.test((W.prog().done.r2 || {}).result || '') && W.prog().status === 'waiting', '... a one-time quest done before counts as done (not run twice)');
    W.ctx.planCommand(['!plan', 'restart']);
    check(W.prog().stepId === 'r1' && !W.prog().done.r1 && !W.prog().done.r2, '!plan restart: every step not done again, begins at step 1');
    const W2 = world({ on: false });
    W2.setPlan([S('x1', 'wait')]);
    W2.files['C:\\SW\\Logs\\plan_progress_Tank1.json'] = JSON.stringify({ stepId: 'x1', status: 'running', done: {} });
    W2.intervals.forEach(f => f());
    check(!W2.ctx.PLAN.running, 'F: a party switched OFF is NOT resumed after a restart (owner rule: nothing starts by itself)');
    const W3 = world();
    W3.setPlan([S('y1', 'wait')], false);
    W3.files['C:\\SW\\Logs\\plan_progress_Tank1.json'] = JSON.stringify({ stepId: 'y1', status: 'running', done: {} });
    W3.intervals.forEach(f => f());
    check(!W3.ctx.PLAN.running, 'F: a plan that is switched off is NOT resumed');
    await W3.ctx.planRun('x');
    check(W3.notes.some(m => /not switched on/.test(m)), 'planRun refuses a plan that is not switched on (says so)');
  }
  // G: source checks
  {
    check(/const partySpotEntry = \(\) => \{ const pe = typeof planSpotEntry === 'function' \? planSpotEntry\(\) : null; if \(pe\) return pe;/.test(src), 'source: partySpotEntry asks the plan level step first');
    check(/if \(cmd === '!plan'\) \{ planCommand\(parts\); return; \}/.test(src), 'source: handleSay runs !plan');
    check(/PLAN\.running\)\);\s+\/\/ PLAN-2026-10-13\n\}/.test(src), 'source: busy() includes a running plan (no idle-watchdog leveling)');
    check(/if \(plan\.act === 'plan'\) \{ setLeadPaused\(false\);[^\n]*planRun\('Start'\)/.test(src), 'source: Start (!start) runs the plan');
    check(/planGearupDone\(gseq\)\) return;/.test(src) && /planGearupDone\(gseq, 'could not get the team to Giran/.test(src), 'source: !gearup tells the plan (done / failed) and does not level after a plan step');
    check(!/new Map\(/.test(HOST), 'source: no new Map() in the plan block');
    const cat = require(path.join(DASH, 'commands.js'));
    check(['!plan start', '!plan next', '!plan stop', '!plan goto 3', '!plan restart', '!plan status'].every(c => cat.classify(c)), 'commands catalog: every !plan order is allowed');
  }

  // ---- 3) planlogic ------------------------------------------------------------------------------------------------------------------
  {
    const st = PL.normStep({ kind: 'quest', quest: '40', name: 'A Special Order', who: ['Bishop1', 'bad name!'], repeat: 0 });
    check(st && st.quest === 40 && st.mode === 'solo' && st.who.join() === 'Bishop1' && st.repeat === 1 && st.onFail === 'stop' && /^s/.test(st.id), 'normStep: quest with who = solo, bad names dropped, defaults');
    check(PL.normStep({ kind: 'level', to: 1 }) === null && PL.normStep({ kind: 'nope' }) === null && PL.normStep({ kind: 'town', town: '.dion' }).town === 'Dion', 'normStep: level < 2 / unknown kind refused; town names');
    check(PL.normSpot({ mode: 'manual', kind: 'field', spot: 'X', region: 'r' }).mode === 'party', 'normSpot: a field place without areas = the party\'s own place');
    const ctxQ = { quests: { 40: { id: 40, name: 'A Special Order', town: 'Giran', adena: '163k', exp: 0, lmin: 40, req: {}, parse: 'full', type: 'one-time' } } };
    const s2 = PL.planSentence({ steps: [{ kind: 'level', to: 20, spot: { mode: 'manual', kind: 'zone', spot: 'Ruins of Despair (route 10-20)' } }, { kind: 'quest', quest: 40, mode: 'party' }] }, ctxQ);
    check(s2 === 'Level in Ruins of Despair until level 20, then do "A Special Order" (Giran) — reward 163k adena', 'sentence: ' + s2);
    const ck = PL.checkPlan({ steps: [{ kind: 'quest', quest: 40, mode: 'party' }, { kind: 'class' }, { kind: 'level', to: 5 }] }, { quests: ctxQ.quests, members: [{ name: 'A', level: 10, cp: { status: 'missing' } }] });
    check(ck.steps[0].warns.some(w => /needs level 40/.test(w)) && ck.steps[1].warns.some(w => /no approved class plan/.test(w)) && ck.steps[2].warns.some(w => /already level 10/.test(w)), 'checks: quest level too low / no approved class plan / a level step that ends at once (warnings, never refused)');
    const r = PL.applySteps([{ id: 'a1', kind: 'quest', quest: 1, who: ['X'] }, { id: 'a2', kind: 'quest', quest: 2, who: ['X', 'Me'] }, { id: 'a3', kind: 'wait' }], ['Me']);
    check(r.steps.length === 2 && r.steps[0].who.join() === 'Me' && r.dropped.length === 2 && r.steps.every(s => s.id !== 'a2' && s.id !== 'a3'), 'applySteps: other parties\' characters dropped, new ids');
    // suggestPlan on the real data
    const Q = require(path.join(DASH, 'questpage_api.js'));
    const rows = Q.listRows({ DATA: path.join(ROOT, 'Scripts', 'data'), LOGS: path.join(ROOT, 'Logs'), DIR: DASH }) || [];
    const A = require(path.join(DASH, 'partyplan_api.js')), opt = A.options({ DATA: path.join(ROOT, 'Scripts', 'data'), LOGS: path.join(ROOT, 'Logs'), ROOT, DIR: DASH });
    const mem = [{ name: 'A', level: 1, race: 'HUMAN', classEnum: 'fighter' }, { name: 'B', level: 3, race: 'ELF', classEnum: 'elvenMage' }];
    const sg = PL.suggestPlan({ leader: 'Nobody', members: mem, zones: opt.zones, datapack: opt.datapack, quests: rows, to: 40 });
    const kinds = sg.steps.map(s => s.kind), lv = sg.steps.filter(s => s.kind === 'level').map(s => s.to);
    check(sg.steps.length > 5 && kinds[kinds.length - 1] === 'wait' && lv[lv.length - 1] === 40 && lv.every((x, i) => !i || x > lv[i - 1]), `suggestPlan (real data): ${sg.steps.length} steps, levels rising to 40, ends with "wait"`);
    check(kinds.filter(k => k === 'class').length === 2 && kinds.includes('supply') && kinds.includes('gear'), 'suggestPlan: class change at 20 and 40 + supplies + gear');
    const qs = sg.steps.filter(s => s.kind === 'quest').map(s => (rows.find(x => x.id === s.quest) || {}));
    check(qs.length > 0 && qs.length <= 12 && qs.every(q => q.type === 'one-time' && q.parse === 'full'), `suggestPlan: ${qs.length} quests, all one-time + every step known`);
    check(sg.steps.every(s => PL.normStep(s)), 'suggestPlan: every step is valid');
    const pl = PL.progressLine({ name: 'P', on: true, steps: [{ id: 's1', kind: 'wait' }, { id: 's2', kind: 'town', town: 'Dion' }] }, { stepId: 's2', status: 'running', done: { s1: {} } }, {}, true);
    check(pl.kind === 'run' && pl.text === '📋 Plan step 2/2: Go to Dion', 'progressLine: ' + pl.text);
    check(PL.progressLine({ on: true, steps: [{ id: 's1', kind: 'wait' }] }, { status: 'waiting' }, {}, true).kind === 'wait' && PL.progressLine({ on: false, steps: [{ id: 's1', kind: 'wait' }] }, {}, {}, true).kind === 'off', 'progressLine: waiting / not used');
  }

  // ---- 4) the API on a scratch file -----------------------------------------------------------------------------------------------
  {
    const A = require(path.join(DASH, 'partyplan_api.js'));
    const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ppapi-'));
    process.env.SWARM_PARTYPLANS_FILE = path.join(TMP, 'data', 'party_plans.json'); process.env.SWARM_PLANPROGRESS_DIR = path.join(TMP, 'logs');
    fs.mkdirSync(path.join(TMP, 'data')); fs.mkdirSync(path.join(TMP, 'logs'));
    const sent = [];
    const ctx = { DATA: path.join(ROOT, 'Scripts', 'data'), LOGS: path.join(TMP, 'logs'), ROOT, DIR: DASH, readStates: () => [{ name: 'Lead', level: 10, classId: 0, ageSec: 5 }, { name: 'Mem', level: 12, classId: 10, ageSec: 5 }],
      teamMap: () => ({ Lead: 'Lead', Mem: 'Lead', Solo: 'Solo' }), reloadCfg: () => ({ accounts: [{ character: 'Lead' }, { character: 'Mem' }, { character: 'Solo' }] }), mainLeader: 'Lead',
      readJson: (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }, commandRun: async (b) => { sent.push(b); return { code: 200, body: { ok: true } }; } };
    let r = await A.post(ctx, { action: 'set', party: 'Lead', plan: { name: 'P1', steps: [{ kind: 'level', to: 20 }, { kind: 'quest', quest: 40, who: ['Mem'] }, { kind: 'wait' }] } });
    check(r.code === 200 && r.plan.steps.length === 3 && r.plan.on === false && fs.existsSync(process.env.SWARM_PARTYPLANS_FILE), 'API set: saved (not used on Start until switched on)');
    const rev1 = r.rev;
    r = await A.post(ctx, { action: 'use', party: 'Lead', on: true, rev: rev1 });
    check(r.code === 200 && A.readPlans(ctx).data.parties.Lead.on === true, 'API use: switched on');
    r = await A.post(ctx, { action: 'set', party: 'Lead', plan: { steps: [] }, rev: rev1 });
    check(r.code === 409 && /changed meanwhile/.test(r.error), 'API: an old rev = 409 (conflict detection)');
    check(fs.readdirSync(path.join(TMP, 'data', 'history')).some(f => /^party_plans_/.test(f)), 'API: a history copy of every older version');
    r = await A.post(ctx, { action: 'saveTemplate', name: 'Mages 1-40', steps: A.readPlans(ctx).data.parties.Lead.steps });
    check(r.code === 200 && r.id === 'mages-1-40', 'API saveTemplate');
    r = await A.post(ctx, { action: 'apply', parties: ['Solo'], template: 'mages-1-40', on: true });
    check(r.code === 200 && r.applied.Solo.steps === 2 && r.applied.Solo.dropped.length === 1 && A.readPlans(ctx).data.parties.Solo.on === true, 'API apply: the template on another party (the Mem-only quest left out)');
    r = await A.post(ctx, { action: 'control', party: 'Lead', cmd: 'goto', n: 2 });
    check(r.code === 200 && sent.length === 1 && sent[0].cmd === '!plan goto 2' && sent[0].target === 'party:Lead', 'API control: "!plan goto 2" sent to the party (no file write)');
    check((await A.post(ctx, { action: 'control', party: 'Lead', cmd: 'rm -rf' })).code === 400 && (await A.post(ctx, { action: 'set', party: '_x', plan: {} })).code === 400, 'API: bad input refused');
    fs.writeFileSync(path.join(TMP, 'logs', 'plan_progress_Lead.json'), JSON.stringify({ stepId: 's?', status: 'waiting', done: {} }));
    const inf = A.info(ctx), lp = inf.parties.find(p => p.leader === 'Lead');
    check(lp && lp.members.length === 2 && lp.plan && lp.line && lp.steps.length === 3 && inf.templates.length === 1, 'API info: parties, members, plan, line, step sentences, templates');
    const sm = A.summary(ctx, []);
    check(sm.Lead && sm.Lead.n === 3 && sm.Solo && sm.Solo.on === true, 'API summary (for /api/state): per party');
    const sp = RSA.startPlanFor(Object.assign({}, ctx, { readJson: ctx.readJson }), 'Solo', false);
    check(sp.act === 'plan' && /your plan "Mages 1-40": step 1\/2/.test(sp.text), 'runstate_api: the dashboard\'s Start text names the plan (' + sp.text + ')');
    delete process.env.SWARM_PARTYPLANS_FILE; delete process.env.SWARM_PLANPROGRESS_DIR;
    fs.rmSync(TMP, { recursive: true, force: true });
  }
  console.log(`\n${n - fails}/${n} checks passed`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
