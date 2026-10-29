// OFFLINE TEST of the HUNT TIMER (owner 2026-10-15: "I asked Tank1's team to go to the catacomb but I did not get asked how many hours etc.").
// Never touches the game, MCP, the live Logs or the live Scripts/data files.
//   node docs/plan/tools/test_hunt_timer.js        (exit code 1 when a check fails; SWARM_JS=<file> tests another copy of swarm.js)
// 1) HUNTTIMER-PURE of Scripts_dev/swarm.js: htEntry / htClock (arrival, "from now", the 45-min fallback, End now, done), htHold for every
//    early-leave reason (supply run unless shots really ran out, daily Kamaloka, Giran hub, move on, split regroup up to 15 min, trips),
//    htEndDecide (none / wait in a raid / close when stopped / end), htFmt, supUseStep / supUseRates (measured supply use).
// 2) Dashboard/huntlogic.js: the same clock as the bot (a matrix), the estimate maths (rules of thumb, measured rates, need, runs out after,
//    "until I stop it" = 2 h horizon, Spirit Ore / Holy Water / Soul Ore only for characters whose skills use them), the party card line.
// 3) Dashboard/hunttimer_api.js: set / extend / end / clear + validation (pure), POST on a scratch file (lock + atomic write), GET status.
// 4) the HOST part on an in-memory file system + virtual clock: the dashboard file is read live, the leader's clock file persists across a
//    reload, the clock starts on arrival, the end actions (town + supply + wait / resupply + back / keep / party stopped), htHolds notes.
// 5) source checks: every early-leave path asks htHolds with a known kind, leadLevel goes straight while a timer runs, swarm_state fields,
//    the dashboard hooks (spot picker popup, party card chip, server hook, uiForm).
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const ROOT = path.join(__dirname, '..', '..', '..');
const SRCF = process.env.SWARM_JS || path.join(ROOT, 'Scripts_dev', 'swarm.js');
const src = fs.readFileSync(SRCF, 'utf8');
let fails = 0, n = 0;
const check = (ok, what) => { n++; console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails++; };
const blk = (b, e) => { const i = src.indexOf(b), j = src.indexOf(e, i + 1); if (i < 0 || j < i) { console.error(b + ' block not found'); process.exit(1); } return src.slice(i, j); };
const PURE = blk('// HUNTTIMER-PURE-BEGIN', '// HUNTTIMER-PURE-END');
const P = new Function(PURE + '\nreturn { HT_ACTIONS, HT_ARRIVE_WAIT_MS, HT_SPLIT_MAX_MIN, HT_SHOT_CRIT, HT_HOLD, HT_HOLD_TEXT, htNorm, htEntry, htClock, htSupplyCritical, htHold, htEndDecide, htFmt, supUseStep, supUseRates };')();
const HL = require(path.join(ROOT, 'Dashboard', 'huntlogic.js'));
const H = 3600000, M = 60000, T0 = Date.parse('2026-10-15T10:00:00Z');
const iso = (t) => new Date(t).toISOString();

// ---- 1) pure ---------------------------------------------------------------------------------------------------------------------
const F1 = { parties: { Tank1: { id: 'a1', hours: 2, endAction: 'town', from: 'arrival', at: iso(T0), spot: 'Catacomb of the Branded' } } };
check(P.htEntry({}, 'Tank1') === null && P.htEntry(null, 'Tank1') === null, 'no file / no entry: no timer (today\'s behaviour)');
check(P.htEntry({ parties: { Tank1: { id: 'x', hours: 0, at: iso(T0) } } }, 'Tank1') === null, 'hours 0 = no timer');
check(P.htEntry({ parties: { Tank1: { id: 'x', hours: 99, at: iso(T0) } } }, 'Tank1') === null, 'hours > 48 = broken = no timer');
check(P.htEntry({ parties: { Tank1: { hours: 2, at: iso(T0) } } }, 'Tank1') === null, 'no id = no timer');
check(P.htEntry({ parties: { Tank1: { id: 'x', hours: 2, at: iso(T0), endAction: 'dance' } } }, 'Tank1').endAction === 'town', 'unknown end action = go to town and wait (the default)');
const e1 = P.htEntry(F1, 'Tank1');
let c = P.htClock(e1, null, T0 + 10 * M);
check(c.active && c.waitingArrival && !c.started && c.leftMs === null, 'from arrival: not arrived yet = active, waiting, no time left shown');
c = P.htClock(e1, { id: 'a1', startedAt: iso(T0 + 20 * M) }, T0 + 30 * M);
check(c.active && c.started && c.endAt === T0 + 20 * M + 2 * H && c.leftMs === 2 * H - 10 * M, 'arrived 20 min after the choice: ends 2 h after the arrival');
c = P.htClock(e1, { id: 'other', startedAt: iso(T0) }, T0 + 30 * M);
check(c.waitingArrival, 'a status file of an OLD timer is ignored (new id)');
c = P.htClock(e1, null, T0 + 45 * M);
check(c.started && c.startAt === T0 + 45 * M && /45 min/.test(c.startWhy), 'never arrived: the clock starts 45 min after the choice');
c = P.htClock(e1, { id: 'a1', startedAt: iso(T0) }, T0 + 2 * H);
check(c.ended && !c.active && !c.done && c.leftMs === 0, 'time up: ended, not active');
c = P.htClock(e1, { id: 'a1', startedAt: iso(T0), endedFor: 'a1' }, T0 + 2 * H + M);
check(c.ended && c.done, 'end action ran (endedFor = id): done');
const eNow = P.htEntry({ parties: { S: { id: 'b', hours: 3, from: 'now', at: iso(T0) } } }, 'S');
check(P.htClock(eNow, null, T0 + H).leftMs === 2 * H, 'from now: counts from the choice');
const eEnd = P.htEntry({ parties: { S: { id: 'b', hours: 3, at: iso(T0), endNow: iso(T0 + 5 * M) } } }, 'S');
c = P.htClock(eEnd, null, T0 + 6 * M);
check(c.ended && c.endedNow, 'End now before arrival: ended at once');
c = P.htClock(eEnd, { id: 'b', startedAt: iso(T0) }, T0 + 4 * M);
check(c.active && c.endAt === T0 + 5 * M, 'End now in the future (clock skew): ends then');
// holds
const act = P.htClock(e1, { id: 'a1', startedAt: iso(T0) }, T0 + H), off = P.htClock(null, null, T0);
const kinds = Object.keys(P.HT_HOLD);
check(kinds.length >= 12, `${kinds.length} early-leave kinds are known`);
kinds.filter(k => P.HT_HOLD[k] === 'trip').forEach(k => check(P.htHold(k, act, {}).hold === true && P.htHold(k, off, {}).hold === false, `"${k}": held while the timer runs, free without one`));
check(P.htHold('supply run', act, { low: ['Tank1: Soulshot (C-Grade) 150, Mana Potion 80', 'Bishop1: Scroll of Escape 1'] }).hold === true, 'supply run: held while shots are low but not out (150)');
let h = P.htHold('supply run', act, { low: ['Destroyer1: Soulshot (C-Grade) 12, Mana Potion 30'] });
check(h.hold === false && h.critical === true && /Destroyer1: Soulshot \(C-Grade\) 12/.test(h.why), 'supply run: allowed when shots really ran out (< 30), said why');
check(P.htHold('supply run', act, { low: ['Necro1: Blessed Spiritshot (C-Grade) 0'] }).hold === false, '... also spiritshots at 0');
check(P.htHold('supply run', act, { low: ['Tank1: inventory full (190 slots) — sell + stash + unload'] }).hold === true, 'supply run: a full bag is held (not an emergency)');
check(P.htHold('split regroup', act, { farMin: 3 }).hold === true, 'split regroup: held for a teammate away 3 min');
check(P.htHold('split regroup', act, { farMin: 16 }).hold === false, 'split regroup: runs after 15 min (nobody stranded)');
check(P.htHold('survive', act, {}).hold === false && P.htHold('order', act, {}).hold === false && P.htHold('rescue', act, {}).hold === false, 'survival / orders / rescue are never held');
const ended = P.htClock(e1, { id: 'a1', startedAt: iso(T0) }, T0 + 3 * H);
check(P.htHold('supply run', ended, {}).hold === false, 'after the time is up nothing is held');
check(JSON.stringify(P.htSupplyCritical(['A: Soulshot (D-Grade) 5', 'B: Spiritshot: No Grade 29, Mana Potion 0', 'C: Mana Potion 0'])) === JSON.stringify(['A: Soulshot (D-Grade) 5', 'B: Spiritshot: No Grade 29']), 'htSupplyCritical: only shots, below 30');
// end decide
check(P.htEndDecide(act, { on: true }).act === 'none', 'end: nothing while the time runs');
check(P.htEndDecide(ended, { on: true }).act === 'end' && P.htEndDecide(ended, { on: true }).action === 'town', 'end: time up + party on -> the end action');
check(P.htEndDecide(ended, { on: true, busy: 'the raid' }).act === 'wait', 'end: waits for a raid / mission / instance to finish');
check(P.htEndDecide(ended, { on: false }).act === 'close', 'end: party stopped -> just closed (nothing moves)');
check(P.htEndDecide(P.htClock(e1, { id: 'a1', startedAt: iso(T0), endedFor: 'a1' }, T0 + 3 * H), { on: true }).act === 'none', 'end: runs once (done)');
check(P.htEndDecide(P.htClock(eEnd, null, T0 + 6 * M), { on: true }).why === 'ended on the dashboard', 'end: End now says so');
check(P.htFmt(72 * M) === '1 h 12 min' && P.htFmt(45 * M) === '45 min' && P.htFmt(2 * H) === '2 h' && P.htFmt(10000) === 'less than a minute', 'htFmt');
// measured use
let J = { v: 1, b: [] };
J = P.supUseStep(J, null, { 1464: 1000 }, true, T0, M, 600);
check(J.b.length === 0, 'use: the first sample only remembers the counts');
J = P.supUseStep(J, { 1464: 1000, 728: 50 }, { 1464: 980, 728: 49 }, true, T0 + M, M, 600);
J = P.supUseStep(J, { 1464: 980, 728: 49 }, { 1464: 960, 728: 49 }, true, T0 + 2 * M, M, 600);
J = P.supUseStep(J, { 1464: 960 }, { 1464: 5000 }, true, T0 + 3 * M, M, 600);          // bought / handed: up, not use
J = P.supUseStep(J, { 1464: 5000 }, { 1464: 2000 }, true, T0 + 4 * M, M, 600);         // 3000 in one minute: a hand-over, not use
J = P.supUseStep(J, { 1464: 2000 }, { 1464: 1900 }, false, T0 + 5 * M, M, 600);        // in town: not counted
let r = P.supUseRates(J, T0 + 6 * M, 6);
check(r.perHour[1464] === Math.round(40 * H / (4 * M)) && r.perHour[728] === Math.round(1 * H / (4 * M)), `use: 40 shots in 4 hunting minutes = ${r.perHour[1464]}/h; drops in town / above the cap / rises ignored`);
check(Math.abs(r.hours - 4 / 60) < 0.01, 'use: hunting time counted (4 min)');
check(P.supUseRates(J, T0 + 7 * H, 6).hours === 0, 'use: only the last 6 h count');
let JJ = { v: 1, b: [] }; for (let i = 0; i < 30; i++) JJ = P.supUseStep(JJ, { 1: 10 }, { 1: 9 }, true, T0 + i * H, M, 600);
check(JJ.b.length <= 24, 'use: at most 24 hourly buckets are kept');

// ---- 2) huntlogic ------------------------------------------------------------------------------------------------------------------
let same = true;
[[null, T0 + 10 * M], [{ id: 'a1', startedAt: iso(T0 + 5 * M) }, T0 + H], [{ id: 'a1', startedAt: iso(T0) }, T0 + 3 * H], [{ id: 'a1', startedAt: iso(T0), endedFor: 'a1' }, T0 + 3 * H], [null, T0 + 50 * M]].forEach(([st, t]) => {
  const a = P.htClock(P.htEntry(F1, 'Tank1'), st, t), b = HL.clock(HL.entry(F1, 'Tank1'), st, t);
  if (JSON.stringify(a) !== JSON.stringify(b)) { same = false; console.log('   bot', JSON.stringify(a), '\n   page', JSON.stringify(b)); }
});
[eNow, eEnd].forEach(() => { });
const FE = { parties: { S: { id: 'b', hours: 3, at: iso(T0), endNow: iso(T0 + 5 * M) } } };
if (JSON.stringify(P.htClock(P.htEntry(FE, 'S'), null, T0 + 6 * M)) !== JSON.stringify(HL.clock(HL.entry(FE, 'S'), null, T0 + 6 * M))) same = false;
check(same, 'the dashboard clock (huntlogic.js) = the bot clock (swarm.js) for every case');
check(HL.fmt(72 * M) === P.htFmt(72 * M), 'same time format');
const fighter = { name: 'Destroyer1', shotId: 1464, shots: 2000, sup: { k: 'fighter', h: false, mana: 500, heal: 30, ore: 0, oreSk: [], holySk: [], soulSk: [], seenH: 0, use: {} } };
const healer = { name: 'Bishop1', shotId: 3949, shots: 3000, sup: { k: 'mage', h: true, mana: 100, heal: 30, ore: 50, oreSk: ['Major Heal'], holy: 3, holySk: ['Cleanse'], soulOre: null, soulSk: [], seenH: 0, use: {} } };
const measured = { name: 'Necro1', shotId: 3949, shots: 1000, sup: { k: 'mage', h: false, mana: 900, heal: 10, ore: 0, oreSk: [], holySk: [], soulSk: [], seenH: 2, use: { 3949: 500, 728: 100 } } };
const old = { name: 'Oldie', shotId: 1463, shots: 100 };
const est = HL.estimate([fighter, healer, measured, old], 2, {});
const g = (k) => est.groups.find(x => x.key === k);
check(g('soulshots') && g('soulshots').chars.find(x => x.name === 'Destroyer1').perHour === 1200 && g('soulshots').chars.find(x => x.name === 'Destroyer1').need === 2400, 'fighter without measured use: ~1,200 soulshots an hour, 2,400 for 2 h');
check(g('spiritshots').chars.find(x => x.name === 'Bishop1').perHour === 300 && g('spiritshots').chars.find(x => x.name === 'Necro1').perHour === 500, 'healer ~300 spiritshots/h (rule of thumb); Necro1 measured 500/h');
check(g('spiritshots').chars.find(x => x.name === 'Necro1').src === 'seen' && est.seen.includes('Necro1') && est.about.includes('Destroyer1'), 'measured vs rule of thumb is told apart');
check(g('mana').chars.find(x => x.name === 'Necro1').perHour === 100 && g('heal').chars.find(x => x.name === 'Necro1').perHour === 0, 'measured: an item never used while hunting = 0 an hour');
check(g('ore') && g('ore').chars.length === 1 && g('ore').chars[0].name === 'Bishop1' && g('ore').chars[0].perHour === 60, 'Spirit Ore only for the character whose skills eat it (healer ~60/h)');
check(g('holy') && g('holy').chars.length === 1 && g('holy').label === "Einhasad's Holy Water", "Einhasad's Holy Water only for a character that knows Cleanse / Salvation");
check(!g('soul'), 'Soul Ore not shown when nobody uses it');
const sd = est.short.find(s => s.name === 'Destroyer1' && s.key === 'soulshots');
check(sd && Math.round(sd.lastsMs / M) === 100 && /Destroyer1 runs out of Soulshot \(C-Grade\) after about 1 h 40 min/.test(sd.text), 'warning: "Destroyer1 runs out of Soulshot (C-Grade) after about 1 h 40 min" (2,000 / 1,200 an hour)');
check(est.short.find(s => s.name === 'Bishop1' && s.key === 'holy'), 'warning: Bishop1 runs out of Holy Water (3 at ~10/h)');
check(!est.short.find(s => s.name === 'Necro1' && s.key === 'spiritshots'), 'no warning for Necro1\'s spiritshots (1,000 at 500/h = exactly 2 h)');
check(g('soulshots').chars.some(x => x.name === 'Oldie') && !g('mana').chars.some(x => x.name === 'Oldie'), 'an older script (no sup): only its shots are estimated');
const est8 = HL.estimate([fighter], 8, {}), estS = HL.estimate([fighter], null, {});
check(est8.groups[0].need === 9600 && estS.hours === null && estS.horizon === 2 && estS.short.length === 1, '8 h = 9,600 soulshots; "until I stop it" warns about what runs out within 2 h');
check(HL.estimate([], 2, {}).groups.length === 0, 'no characters: nothing to show (no crash)');
const cl = HL.cardLine(F1, { id: 'a1', startedAt: iso(T0) }, 'Tank1', T0 + 48 * M);
check(cl && cl.state === 'running' && cl.text === 'Hunting at Catacomb of the Branded — 1 h 12 min left', 'party card: "Hunting at Catacomb of the Branded — 1 h 12 min left"');
check(HL.cardLine(F1, null, 'Tank1', T0 + M).state === 'travel' && /starts when they arrive/.test(HL.cardLine(F1, null, 'Tank1', T0 + M).text), 'party card: travelling = the clock starts on arrival');
check(HL.cardLine(F1, { id: 'a1', startedAt: iso(T0), endedFor: 'a1', result: 'waiting in Giran' }, 'Tank1', T0 + 3 * H).text === 'Hunting time at Catacomb of the Branded is over — waiting in Giran', 'party card: over + what happened');
check(HL.cardLine({}, null, 'Tank1', T0) === null, 'party card: no timer = no line');

// ---- 3) the API ---------------------------------------------------------------------------------------------------------------------
const API = require(path.join(ROOT, 'Dashboard', 'hunttimer_api.js'));
let a = API.applyChange({}, { party: 'Tank1', act: 'set', hours: 2, endAction: 'resupply', spot: 'Catacomb of the Branded' }, T0, () => 'id1');
check(a.ok && a.data.parties.Tank1.id === 'id1' && a.data.parties.Tank1.hours === 2 && a.data.parties.Tank1.endAction === 'resupply' && a.data.parties.Tank1.from === 'arrival', 'api set: a timer from arrival');
check(!API.applyChange({}, { party: 'Tank1', act: 'set', hours: 0 }, T0).ok && !API.applyChange({}, { party: 'Tank1', act: 'set', hours: 60 }, T0).ok, 'api set: hours 0.25-48 only');
check(!API.applyChange({}, { party: '../x', act: 'set', hours: 2 }, T0).ok, 'api: a party must be a character name');
check(!API.applyChange({}, { party: 'Tank1', act: 'extend', addMin: 60 }, T0).ok, 'api extend: no timer -> refused with a reason');
{ const us = API.applyChange({}, { party: 'Tank1', act: 'stop', spot: 'Forgotten Temple - EWD 1' }, T0);   // UNTILSTOP-2026-10-29
  check(us.ok && us.data.parties.Tank1.untilStop === true && !API.applyChange(us.data, { party: 'Tank1', act: 'extend', addMin: 60 }, T0).ok, 'api stop: "Until I stop it" is remembered (no 12 h long hunt), and is no timer to extend'); }
let b2 = API.applyChange(a.data, { party: 'Tank1', act: 'extend', addMin: 60 }, T0 + 10 * M);
check(b2.ok && b2.data.parties.Tank1.hours === 3 && b2.data.parties.Tank1.id === 'id1', 'api extend: +1 h on a running timer (same id: the clock keeps its start)');
let b3 = API.applyChange(a.data, Object.assign({ party: 'Tank1', act: 'extend', addMin: 30 }, { _status: { id: 'id1', startedAt: iso(T0), endedFor: 'id1' } }), T0 + 3 * H, () => 'id2');
check(b3.ok && b3.data.parties.Tank1.id === 'id2' && b3.data.parties.Tank1.hours === 0.5 && b3.data.parties.Tank1.from === 'now' && b3.data.parties.Tank1.endAction === 'resupply', 'api extend after the end: a new 30-min timer from now, same end action');
let b4 = API.applyChange(a.data, { party: 'Tank1', act: 'end' }, T0 + H);
check(b4.ok && b4.data.parties.Tank1.endNow === iso(T0 + H), 'api end: End now stamps the time');
check(API.applyChange(a.data, { party: 'Tank1', act: 'clear' }, T0).data.parties.Tank1 === undefined, 'api clear: "until I stop it" = no entry');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'hunttimer-'));
process.env.SWARM_HUNTTIMER_FILE = path.join(TMP, 'hunt_timers.json');
fs.mkdirSync(path.join(TMP, 'Logs'));
const ctx = { DATA: TMP, LOGS: path.join(TMP, 'Logs'), ROOT };
let pr = API.post(ctx, { party: 'Tank1', act: 'set', hours: 4, endAction: 'keep', spot: 'Cruma Tower' });
const disk = JSON.parse(fs.readFileSync(process.env.SWARM_HUNTTIMER_FILE, 'utf8'));
check(pr.ok && disk.parties.Tank1.hours === 4 && disk._about && !fs.existsSync(process.env.SWARM_HUNTTIMER_FILE + '.lock'), 'api post: written to the (scratch) file, lock released');
fs.writeFileSync(path.join(TMP, 'Logs', 'hunt_timer_Tank1.json'), JSON.stringify({ id: disk.parties.Tank1.id, startedAt: iso(Date.now()) }));
const inf = API.info(ctx);
check(inf.status.Tank1 && inf.status.Tank1.startedAt && inf.data.parties.Tank1, 'api get: the timers + the leader\'s clock file');
check(/dashboard_commands\.log/.test(fs.readdirSync(ctx.LOGS).join(',')), 'api post: one line in dashboard_commands.log');
check(API.post(ctx, { party: 'Tank1', act: 'bogus' }).code === 400, 'api post: an unknown act = 400');

// ---- 4) host part ---------------------------------------------------------------------------------------------------------------------
const HOST = blk('var HT = { j: null', '// MEASURED SUPPLY USE');
function makeHost(fsMem, clock, opts) {
  const o = opts || {}, calls = [], notes = [], said = [], timers = [];
  const env = {
    now: () => clock.t, File: { Exists: (f) => fsMem[f] !== undefined, ReadAllText: (f) => { if (fsMem[f] === undefined) throw new Error('nf'); return fsMem[f]; }, WriteAllText: (f, t) => { fsMem[f] = t; fsMem['@' + f] = (fsMem['@' + f] || 0) + 1; } },
    fileStamp: (f) => fsMem[f] === undefined ? '' : String(fsMem['@' + f] || 0) + ':' + fsMem[f].length,
    __DIR__: 'D', SWARM_ROOT: 'R', CONFIG: { leader: 'Tank1', lead: { hub: 'Giran' } }, claimTeam: () => 'Tank1', Me: { Name: 'Tank1' },
    note: (m) => notes.push(m), SayToParty: (m) => said.push(m), isLeader: () => true, soloChar: () => false, logError: (w, e) => { notes.push('ERROR ' + w + ' ' + (e && e.message)); },
    nonstopOn: () => false, leadMode: () => true, state: { role: 'sk', mode: '' }, IsCharacterReady: () => true, runOn: () => o.on !== false, inRaid: () => !!o.raid, inKamaInstance: () => false,
    manualSw: { mode: 'manual', status: 'travelling', sig: 'S1', spotName: 'Catacomb of the Branded' }, partySpotSig: () => 'S1', partySpotEntry: () => ({}),
    autoLvl: { active: true, stop: false }, regroupRun: null, abortRegroup: () => calls.push('abortRegroup'), sleep: async () => { env.autoLvl.active = false; },
    leadGoGiran: async (w) => { calls.push('giran:' + w); return o.giranOk !== false; }, pautoOn: (k) => { calls.push('pautoOn:' + k); return !!o.supplyOn; },
    leadSupply: async (w, op) => { calls.push('supply:' + (op && op.inline ? 'inline' : '')); }, leadLevel: async (w) => { calls.push('level:' + w); },
    setLeadPaused: (on, why) => calls.push('pause:' + on + ':' + why), orderPauseTag: (k, a) => `order:${k}-${a}`, runSetMine: (on, why) => calls.push('run:' + on + ':' + why), townFailWhy: () => 'no route',
    setInterval: (fn) => { timers.push(fn); return timers.length; },
  };
  const names = Object.keys(env);
  const fn = new Function(...names, PURE + '\n' + HOST + '\nreturn { HT, htData, htKey, htStRead, htStWrite, htClockMine, htActiveMine, htHolds, noTownTrip, htPublic, htEndRun };');
  const api = fn(...names.map(k => env[k]));
  return { api, env, calls, notes, said, tick: () => timers[0](), timers };
}
const mem = {}, clk = { t: T0 };
const DF = 'D\\Scripts\\data\\hunt_timers.json', SF = 'R\\Logs\\hunt_timer_Tank1.json';
let X = makeHost(mem, clk);
check(X.api.htClockMine() === null && X.api.htHolds('supply run', {}) === false && !X.api.noTownTrip(), 'host: no file = no timer, nothing held');
mem[DF] = JSON.stringify({ v: 1, parties: { Tank1: { id: 't1', hours: 2, endAction: 'town', from: 'arrival', at: iso(T0), spot: 'Catacomb of the Branded' } } }); mem['@' + DF] = 1;
clk.t += 6000;
check(X.api.htActiveMine() && X.api.noTownTrip(), 'host: the dashboard file is read live (5 s cache): timer active, no town trips');
X.tick();
check(JSON.parse(mem[SF]).id === 't1' && !JSON.parse(mem[SF]).startedAt, 'leader clock: the status file is created for the new timer (not started: travelling)');
check(X.api.htHolds('daily Kamaloka') === true && X.api.htHolds('daily Kamaloka') === true && X.notes.filter(m => /no daily Kamaloka/.test(m)).length === 1, 'htHolds: held, noted once per 10 min');
check(X.api.htHolds('supply run', { low: ['Destroyer1: Soulshot (C-Grade) 3'] }) === false && X.said.some(m => /really ran out/.test(m)), 'htHolds: shots out -> the supply run may go, said in party chat');
X.env.manualSw.status = 'arrived'; clk.t = T0 + 20 * M; X.tick();
let S = JSON.parse(mem[SF]);
check(S.startedAt === iso(T0 + 20 * M) && /arrived at Catacomb/.test(S.startWhy) && X.said.some(m => /hunting 2 h at Catacomb of the Branded/.test(m)), 'leader clock: starts on arrival + says so in party chat');
// reload: a new engine reads the same files
const Y = makeHost(mem, clk); clk.t = T0 + 80 * M;
check(Y.api.htClockMine().leftMs === 60 * M && Y.api.htPublic().leftMs === 60 * M, 'reload: the clock survives (1 h left after 80 min, started at 20)');
check(Y.api.htHolds('move on') === true && Y.api.htPublic().held.some(x => x.kind === 'move on'), 'htPublic: what was held lately (party card tooltip)');
clk.t = T0 + 20 * M + 2 * H + 1000; Y.tick(); await0();
async function await0() { }
setTimeout(async () => {
  await new Promise(r => setTimeout(r, 20));
  S = JSON.parse(mem[SF]);
  check(S.endedFor === 't1' && S.action === 'town', 'time up: the end action runs once (endedFor)');
  check(Y.calls.includes('giran:hunting time is up') && Y.calls.includes('pause:true:order:hunttimer-done') && Y.calls.some(c => /^run:false:hunting time is up — waiting in Giran/.test(c)), 'end "town": to Giran, paused, party switched OFF (waits for you)');
  check(!Y.calls.includes('supply:inline') && /no supply run: switched off/.test(S.result), 'end "town": no supply run when the party\'s supply switch is off — said in the result');
  const before = Y.calls.length; Y.env.autoLvl.active = false; Y.tick(); await new Promise(r => setTimeout(r, 20));
  check(Y.calls.length === before, 'end action never runs twice');
  // resupply + supply switch on
  const m2 = {}; m2[DF] = JSON.stringify({ parties: { Tank1: { id: 't2', hours: 1, endAction: 'resupply', from: 'now', at: iso(T0) } } }); m2['@' + DF] = 1;
  const c2 = { t: T0 + 2 * H }; const Z = makeHost(m2, c2, { supplyOn: true }); Z.tick(); Z.tick(); await new Promise(r => setTimeout(r, 20));
  check(Z.calls.includes('supply:inline') && Z.calls.some(c => /^level:hunting time is up: back to the spot/.test(c)) && !Z.calls.some(c => /^run:false/.test(c)), 'end "resupply": Giran, supply run (switched on), back to the spot; the party stays ON');
  // keep
  const m3 = {}; m3[DF] = JSON.stringify({ parties: { Tank1: { id: 't3', hours: 1, endAction: 'keep', from: 'now', at: iso(T0) } } }); m3['@' + DF] = 1;
  const c3 = { t: T0 + 2 * H }; const K = makeHost(m3, c3); K.tick(); K.tick(); await new Promise(r => setTimeout(r, 20));
  check(!K.calls.some(c => /^giran:/.test(c)) && JSON.parse(m3[SF]).result === 'kept hunting' && K.said.some(m => /we keep hunting/.test(m)), 'end "keep": nothing moves, said in party chat');
  // party stopped
  const m4 = {}; m4[DF] = JSON.stringify({ parties: { Tank1: { id: 't4', hours: 1, endAction: 'town', from: 'now', at: iso(T0) } } }); m4['@' + DF] = 1;
  const c4 = { t: T0 + 2 * H }; const O = makeHost(m4, c4, { on: false }); O.tick(); O.tick(); await new Promise(r => setTimeout(r, 20));
  check(!O.calls.some(c => /^giran:/.test(c)) && JSON.parse(m4[SF]).action === 'none' && JSON.parse(m4[SF]).endedFor === 't4', 'party stopped when the time is up: closed, nothing moves');
  // raid: waits
  const m5 = {}; m5[DF] = JSON.stringify({ parties: { Tank1: { id: 't5', hours: 1, endAction: 'town', from: 'now', at: iso(T0) } } }); m5['@' + DF] = 1;
  const c5 = { t: T0 + 2 * H }; const R5 = makeHost(m5, c5, { raid: true }); R5.tick(); R5.tick(); await new Promise(r => setTimeout(r, 20));
  check(!R5.calls.some(c => /^giran:/.test(c)) && !JSON.parse(m5[SF]).endedFor, 'time up during a raid: waits until the raid is over');
  // End now from the dashboard before arrival
  const m6 = {}; m6[DF] = JSON.stringify({ parties: { Tank1: { id: 't6', hours: 3, endAction: 'town', at: iso(T0), endNow: iso(T0 + 2 * M) } } }); m6['@' + DF] = 1;
  const c6 = { t: T0 + 3 * M }; const N6 = makeHost(m6, c6); N6.tick(); N6.tick(); await new Promise(r => setTimeout(r, 20));
  check(N6.calls.some(c => /^giran:/.test(c)) && JSON.parse(m6[SF]).why === 'ended on the dashboard', 'End now while still travelling: the end action runs at once');

  // ---- 5) source checks -------------------------------------------------------------------------------------------------------------
  const holds = [...src.matchAll(/htHolds\('([^']+)'/g)].map(m => m[1]).filter(k => k !== 'move on' || true);
  const uniq = [...new Set(holds)];
  check(uniq.every(k => P.HT_HOLD[k]), 'every htHolds(kind) in swarm.js is a known kind: ' + uniq.join(', '));
  ['supply run', 'daily Kamaloka', 'giran hub', 'move on', 'split regroup', 'warehouse stash', 'letters', 'clan hand-over', 'Seven Signs sign-up', 'quest farm', 'clan skill trip', 'fund round']
    .forEach(k => check(holds.includes(k), `early-leave path held: ${k}`));
  check(/if \(!runAuto\('supply run'\)\) return;[^\n]*\n(\s*if \(!rcH && !pautoOn\('supplyWatch'\)\)[^\n]*\n)?\s*if \(htHolds\('supply run', \{ low \}\)\) return;/.test(src), 'supply watch: the timer is asked with the low list before the supply run starts');
  check(/if \(noTownTrip\(\) && !currentTownKey\(\)\) \{/.test(src), 'leadLevel: straight to the hunting (no Giran regroup) while a timer runs');
  check(/outMin > outMax \+ 3 && !htHolds\('move on'\)\)/.test(src), "'move on when outgrown' waits for the timer");
  check(/sup: SW\.med\.sup \|\| null/.test(src) && /huntTimer: \(isLeader\(\) \|\| soloChar\(\)\) \? \(\(\) => \{ try \{ return htPublic\(\); \}/.test(src), 'swarm_state: sup (bag + measured use) + huntTimer (leader)');
  const IDX = fs.readFileSync(path.join(ROOT, 'Dashboard', 'index.html'), 'utf8'), SRV = fs.readFileSync(path.join(ROOT, 'Dashboard', 'server.js'), 'utf8'), UID = fs.readFileSync(path.join(ROOT, 'Dashboard', 'uidialog.js'), 'utf8');
  check(/HuntTimer\.ask\(party, label/.test(IDX) && /HuntTimer\.afterSave\(party, hunt, label, body\.mode\)/.test(IDX) && /HuntTimer\.chipHtml\(leader\)/.test(IDX), 'index.html: the spot picker asks (popup), saves the timer, the party card shows it');
  check(/<script src="\/huntlogic\.js"><\/script>\s*<script src="\/hunttimer\.js"><\/script>/.test(IDX), 'index.html loads huntlogic.js + hunttimer.js');
  check(/require\('\.\/hunttimer_api'\)\.handle\(/.test(SRV), 'server.js: the /api/hunttimer hook');
  check(/function uiForm\(o\)/.test(UID) && /form: uiForm/.test(UID) && !/\balert\(|\bconfirm\(|\bprompt\(/.test(fs.readFileSync(path.join(ROOT, 'Dashboard', 'hunttimer.js'), 'utf8').replace(/ui(Confirm|Alert|Prompt)\(/g, '')), 'the popup uses the shared dialog (uiForm), never alert / confirm / prompt');
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { }
  console.log(`\n${n - fails}/${n} checks ok`);
  process.exit(fails ? 1 : 0);
}, 30);
