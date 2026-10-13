// OFFLINE TEST of "the dashboard hunting-spot choice takes effect at once" + "max 3 pull-backs" (2026-10-08 19:55 task, user: "The hunting
// spots do not take effect after you select it"). Runs the ESCPURE + MANUALSPOT-PURE blocks of Scripts_dev/swarm.js in node with mocks and
// the REAL Scripts/data/dungeon_rooms.json:
//   node docs/plan/tools/test_manual_spot.js        (exit code 1 when a check fails)
// Covers: holdPullBackStep (the 4/3 5/3 6/3 incident: max 3, shared across hold loops, reset after 3 min, walls rule), manualSpotBlocker,
// manualSpotTick in a simulated leader (virtual clock: 3 s watcher, party_spots.json re-read every 5 s, a "fighting first" hold loop that
// polls interrupted(gen) every 1.5 s, the autolevel loop that consumes manualSw.pending): a room chosen during a hold loop is in effect
// within 20 s; chosen while a teammate is below 50 % in a fight -> applied right after the fight; back to Auto; every blocker; roomSameFloor.
// Plus source checks of the call sites (the max is used by the note, the loop top consumes pending, an interrupted trip bans nothing).
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const src = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
const blk = (b, e) => { const i = src.indexOf(b), j = src.indexOf(e); if (i < 0 || j < i) { console.error(b + ' block not found'); process.exit(1); } return src.slice(i, j); };
const M = new Function(blk('// ESCPURE-BEGIN', '// ESCPURE-END') + '\n' + blk('// MANUALSPOT-PURE-BEGIN', '// MANUALSPOT-PURE-END') +
  '\n' + blk('// SUPPLY-PURE-BEGIN', '// SUPPLY-PURE-END') + '\n' + blk('// TOGGLE-PURE-BEGIN', '// TOGGLE-PURE-END') +
  '\nreturn { holdPullBackStep, holdPullBackStuck, manualSpotBlocker, manualSwSync, manualSpotTick, roomSameFloor, HOLD_PULLBACK, dzFloor,' +
  ' levelTripCancelledPure, manualChoiceChangedPure, SUPPLY_RULE, supplyDue, supplyLastParse, unavailActive, unavailMark, needOrder, fmtDur, supplyTimer,' +
  ' TOGGLE_RULE, toggleFightNow, toggleDecide };')();
const D = JSON.parse(fs.readFileSync(path.join(ROOT, 'Scripts', 'data', 'dungeon_rooms.json'), 'utf8').replace(/^﻿/, ''));
let fails = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails++; };

// ---- 1) pull-backs: max 3 ---------------------------------------------------------------------------------------------------
{
  const pb = {}; const seen = [];
  // the incident: a fight that is never won, a pull-back request every 60 s for 7 min, across TWO hold loops (a new .giran attempt)
  for (let k = 0; k < 7; k++) { const r = M.holdPullBackStep(pb, 1e6 + k * 60000); seen.push(r.go ? `${r.n}/${r.max}` : (r.first ? 'fight-it-out(said)' : 'fight-it-out')); }
  check(seen.join(' ') === '1/3 2/3 3/3 fight-it-out(said) fight-it-out fight-it-out fight-it-out', `7 requests in one long fight: ${seen.join(' ')}`);
  check(!seen.some(s => /^[4-9]\/3/.test(s)), 'never 4/3, 5/3, 6/3 (the 17:47-17:49 log lines)');
  const r2 = M.holdPullBackStep(pb, 1e6 + 6 * 60000 + 200000);   // 3 min 20 s without a stalled fight -> a NEW fight may pull back again
  check(r2.go && r2.n === 1, 'after > 3 min without a stalled fight the counter starts again (1/3)');
  const pb2 = {}; M.holdPullBackStep(pb2, 0); check(M.holdPullBackStuck(pb2, 50) === false && M.holdPullBackStuck(pb2, 30) === true, 'walls: 2 pull-backs that moved < 200 -> no more pull-backs');
  check(M.holdPullBackStep(pb2, 60000).go === false, '... and the next request fights it out');
  check(M.HOLD_PULLBACK.max === 3, 'max is 3');
}
// call site
{
  const i = src.indexOf('async function teamRegroupBeforePortInner'), j = src.indexOf('\n}\n', i), body = src.slice(i, j);
  check(!/disengaged < 8/.test(body), 'call site: the old "disengaged < 8" check is gone');
  check(/holdPullBackStep\(state\.holdPull/.test(body) && /\$\{disengaged\}\/\$\{pbMax\}/.test(body), 'call site: one counter per leader (state.holdPull) and the note prints n/max from it');
  check(/if \(pbGo\) \{/.test(body), 'call site: pulls back only when holdPullBackStep says go; otherwise the help / kill block runs (fight it out)');
}

// ---- 2) blockers ------------------------------------------------------------------------------------------------------------
{
  const B = M.manualSpotBlocker, ok = (c) => B(Object.assign({ team: [], me: { name: 'Crafter1', hp: 90, fight: true } }, c));
  check(ok({}) === '', 'nothing special (even fighting, everyone healthy): go now');
  check(ok({ raid: true }) === 'in a raid', 'raid: wait');
  check(ok({ instance: true }) === 'in Kamaloka / an instance', 'Kamaloka / instance: wait');
  check(ok({ mission: true }) === 'on a mission / raid hunt', 'mission / raid hunt: wait');
  check(ok({ escape: true }) === 'escaping from a fight', 'escape: wait');
  check(ok({ rescue: 'Bishop1' }) === 'rescuing Bishop1', 'rescue trip: wait');
  check(ok({ force: true }) === 'a !dungeon / !assist order holds the spot', '!dungeon / !assist: wait');
  check(ok({ order: 'supply' }) === 'supply first', 'a more important order holds control: wait');
  check(ok({ team: [{ name: 'Bishop1', hp: 34, fight: true }] }) === 'after the fight (Bishop1 34 %)', 'teammate fighting at 34 %: after the fight');
  check(ok({ team: [{ name: 'Bishop1', hp: 34, fight: false }] }) === '', 'teammate at 34 % but not fighting (resting): go now');
  check(ok({ team: [{ name: 'Bishop1', hp: 0, fight: true, dead: true }] }) === '', 'a dead teammate does not block');
  check(ok({ me: { name: 'Crafter1', hp: 40, fight: true } }) === 'after the fight (Crafter1 40 %)', 'leader himself at 40 % in a fight: after the fight');
}

// ---- 3) the leader, simulated -----------------------------------------------------------------------------------------------
const sig = (e) => e && e.mode === 'manual' ? [e.mode, e.kind, e.spot || '', e.dungeon || '', e.roomId || '', e.stay ? 1 : 0, e.at || ''].join('|') : 'auto';   // = partySpotSig
const label = (e) => !e || e.mode !== 'manual' ? 'Auto' : `${e.dungeon} / ${e.roomId}`;
/** virtual leader: hold loop ("fighting first") from t=0, watcher every 3 s, file cache 5 s, autolevel loop top every 1.5 s after the hold */
function simulate(o) {
  const W = { t: 0, gen: 7, file: o.file0, cache: null, cacheAt: -1e9, applied: sig(o.file0), st: {}, log: [], kickAt: 0, appliedAt: 0, holdEndAt: 0, picked: null };
  const entry = () => { if (W.t - W.cacheAt > 5000) { W.cacheAt = W.t; W.cache = W.file; } return W.cache; };   // partySpots(): re-read every 5 s
  const io = { now: () => W.t, entry, sig, label, applied: () => W.applied, ctx: () => o.ctx(W.t), log: (m) => W.log.push(m),
    kick: () => { W.gen++; W.cacheAt = -1e9; W.kickAt = W.t; } };
  let g0 = W.gen, inHold = true;
  for (W.t = 0; W.t <= (o.until || 120000); W.t += 500) {
    if (o.choose && W.t === o.choose.at) W.file = o.choose.entry;
    if (W.t % 3000 === 0) M.manualSpotTick(W.st, io);
    if (inHold && W.t % 1500 === 0 && W.gen !== g0) { inHold = false; W.holdEndAt = W.t; }        // teamRegroupBeforePort returns 'interrupted'
    if (!inHold && W.t % 1500 === 0 && W.st.pending && !W.appliedAt) {                              // autolevel loop top: consume pending, pickSpot
      W.st.pending = false; W.cacheAt = -1e9; const e = entry(); W.applied = sig(e); W.appliedAt = W.t; W.picked = e;
    }
  }
  return W;
}
const ROOM = { mode: 'manual', kind: 'rooms', spot: 'Cruma Tower', dungeon: 'Cruma Tower', roomId: 'cruma-1-left-a', stay: false, at: '2026-10-08T17:43:01.401Z' };
const AUTO = { mode: 'auto' };
const calm = () => ({ team: [{ name: 'Spoiler1', hp: 80, fight: true }, { name: 'Healer1', hp: 95, fight: false }], me: { name: 'Crafter1', hp: 85, fight: true } });
{
  // A) the incident: in the "fighting first" hold before .giran, the user picks the Catherok room at t = 7.3 s (between two reads)
  const W = simulate({ file0: AUTO, choose: { at: 7500, entry: ROOM }, ctx: calm });
  check(W.kickAt > 0 && W.kickAt - 7500 <= 9000, `room chosen during a hold loop: the hold is interrupted ${((W.kickAt - 7500) / 1000).toFixed(1)} s after the choice`);
  check(W.appliedAt > 0 && W.appliedAt - 7500 <= 20000, `... and the chosen room is picked ${((W.appliedAt - 7500) / 1000).toFixed(1)} s after the choice (<= 20 s)`);
  check(W.picked && W.picked.roomId === 'cruma-1-left-a' && W.applied === sig(ROOM), 'the pick reads the chosen room');
  check(W.st.status === 'travelling' && W.st.label === 'Cruma Tower / cruma-1-left-a' && W.st.room === 'cruma-1-left-a' && W.st.dungeon === 'Cruma Tower', `status for the dashboard: ${W.st.status} · ${W.st.label}`);
  check(W.st.chosenAt === Date.parse(ROOM.at), 'chosenAt = the dashboard time (party_spots.json "at")');
  check(W.log.some(m => /seen .* after the choice/.test(m)), 'logged when the leader saw it');
  // a later tick with the same choice in effect: no second kick
  const kicks = W.kickAt; const st2 = W.st; const io = { now: () => 200000, entry: () => ROOM, sig, label, applied: () => sig(ROOM), ctx: calm, log: () => { }, kick: () => { throw new Error('kicked twice'); } };
  let twice = false; try { M.manualSpotTick(st2, io); } catch (e) { twice = true; } check(!twice && kicks > 0, 'once in effect: no second interruption');
}
{
  // B) a teammate is at 34 % in the fight until t = 40 s -> no interruption before, applied right after
  const W = simulate({ file0: AUTO, choose: { at: 6000, entry: ROOM }, ctx: (t) => t < 40000 ? { team: [{ name: 'Bishop1', hp: 34, fight: true }], me: { name: 'Crafter1', hp: 80, fight: true } } : calm() });
  check(W.kickAt >= 40000 && W.kickAt <= 43000, `teammate below 50 % in a fight: interrupted only after the fight (${(W.kickAt / 1000).toFixed(1)} s, fight ended at 40 s)`);
  check(W.appliedAt > 0 && W.appliedAt - 40000 <= 6000, `... applied ${((W.appliedAt - 40000) / 1000).toFixed(1)} s after the fight ended`);
  check(W.log.some(m => /waiting — after the fight \(Bishop1 34 %\)/.test(m)), 'the wait reason is logged once ("after the fight (Bishop1 34 %)")');
  check(W.log.filter(m => /waiting/.test(m)).length === 1, 'the wait reason is logged only once, not every 3 s');
  // status while waiting
  const W2 = simulate({ file0: AUTO, choose: { at: 6000, entry: ROOM }, until: 20000, ctx: () => ({ team: [{ name: 'Bishop1', hp: 34, fight: true }], me: { name: 'Crafter1', hp: 80, fight: true } }) });
  check(W2.st.status === 'pending' && W2.st.detail === 'waiting: after the fight (Bishop1 34 %)' && !W2.kickAt, `dashboard while waiting: ${W2.st.status} · ${W2.st.detail}`);
}
{
  // C) back to Auto (manual room in effect, user presses "Back to auto")
  const W = simulate({ file0: ROOM, choose: { at: 30000, entry: AUTO }, ctx: calm });
  check(W.kickAt >= 30000 && W.kickAt - 30000 <= 9000 && W.applied === 'auto', `back to Auto: interrupted ${((W.kickAt - 30000) / 1000).toFixed(1)} s later, the pick is automatic again`);
  check(W.st.mode === 'auto' && W.st.label === 'Auto', 'state mode auto');
  // D) a raid / Kamaloka / escape / rescue blocks the whole time
  ['raid', 'instance', 'escape', 'mission'].forEach(k => {
    const W3 = simulate({ file0: AUTO, choose: { at: 3000, entry: ROOM }, until: 90000, ctx: () => Object.assign(calm(), { [k]: true }) });
    check(!W3.kickAt && !W3.appliedAt && W3.st.status === 'pending', `${k}: never interrupted (status ${W3.st.status} · ${W3.st.detail})`);
  });
  const W4 = simulate({ file0: AUTO, choose: { at: 3000, entry: ROOM }, until: 30000, ctx: () => Object.assign(calm(), { rescue: 'Bishop1' }) });
  check(!W4.kickAt && /rescuing Bishop1/.test(W4.st.detail), 'rescue trip: never interrupted');
  // E) the user changes the room again while the first change waits -> the newest choice wins, one kick
  const R2 = Object.assign({}, ROOM, { roomId: 'cruma-1-left-b', at: '2026-10-08T17:44:00.000Z' });
  const W5 = simulate({ file0: AUTO, choose: { at: 3000, entry: ROOM }, until: 60000, ctx: (t) => t < 20000 ? { team: [{ name: 'Bishop1', hp: 20, fight: true }] } : calm() });
  check(W5.applied === sig(ROOM), 'sanity');
  const st = {}; let k = 0; const ioE = (e, ctx) => ({ now: () => 1000, entry: () => e, sig, label, applied: () => sig(AUTO), ctx: () => ctx, log: () => { }, kick: () => { k++; } });
  M.manualSpotTick(st, ioE(ROOM, { team: [{ name: 'Bishop1', hp: 20, fight: true }] }));
  M.manualSpotTick(st, ioE(R2, calm()));
  check(k === 1 && st.room === 'cruma-1-left-b' && st.status === 'travelling', 'a newer choice while the first one waited: one interruption, for the newest room');
  // F) nothing picked yet (script just started): no interruption, the first pick reads the file anyway
  const st6 = {}; let k6 = 0; M.manualSpotTick(st6, { now: () => 0, entry: () => ROOM, sig, label, applied: () => '', ctx: calm, log: () => { }, kick: () => { k6++; } });
  check(k6 === 0, 'before the first pick: no interruption');
}

// ---- 4) same floor = walk, no Giran ----------------------------------------------------------------------------------------
{
  const cr = D.find(d => d.name === 'Cruma Tower'); let fi = -1, room = null;
  cr.floors.forEach((F, i) => (F.rooms || []).forEach(r => { if (r.id === 'cruma-1-left-a') { fi = i; room = r; } }));
  check(fi === 0 && room, `cruma-1-left-a is a 1st-floor room (${room && room.name})`);
  const spot = { room: { dungeon: 'Cruma Tower', floor: fi, id: 'cruma-1-left-a' } };
  check(M.roomSameFloor(D, spot, { x: 15032, y: 118760, z: -12096 }) === true, 'Crafter1 at 15032,118760,-12096 (Cruma floor 1, the incident) -> same floor: walk, no .giran');
  check(M.roomSameFloor(D, spot, { x: 16952, y: 110248, z: -9312 }) === false, 'from Cruma floor 2 -> not the same floor (normal travel)');
  check(M.roomSameFloor(D, spot, { x: 83473, y: 148554, z: -3408 }) === false, 'from Giran -> normal travel');
  check(M.roomSameFloor(D, { center: {} }, { x: 15032, y: 118760, z: -12096 }) === false, 'a spot that is no room -> normal travel');
}

// ---- 5) call sites ------------------------------------------------------------------------------------------------------------
{
  const i = src.indexOf('async function autoLevelLoop'), body = src.slice(i, src.indexOf('\n// HUNTING PAIRS', i));
  const top = body.indexOf("takeControl('leveling', PRIO.LEVEL);"), pend = body.indexOf('if (manualSw.pending) { manualSw.pending = false;');
  check(top > 0 && pend > top && pend - top < 400, 'autolevel loop top consumes manualSw.pending right after taking control (re-pick now)');
  const fail = body.indexOf('if (!(await travelToSpot(spot))) {'), pf = body.indexOf('if (manualSw.pending) { note(`autolevel: trip to', fail), ban = body.indexOf('autoLvl.bad[spotKeyOf(spot)] =', fail);
  check(fail > 0 && pf > fail && pf < ban, 'a trip interrupted for the dashboard choice continues BEFORE any spot ban');
  check(/manualSpotOnPick\(spot\);/.test(body) && /manualSpotOnTravel\(spot, true\);/.test(body), 'status hooks after the pick and on arrival');
  const tts = src.slice(src.indexOf('async function travelToSpot'), src.indexOf('async function autoLevelLoop'));
  check(/!sameFloorRoom && (!atLandingNow && )?(!viaGiran && )?(!nonstopOn\(\) && )?Math\.hypot\(spot\.center\.x - Me\.X/.test(tts),'travelToSpot: no Giran regroup for a room on the floor we stand on');
  check(/manualSpot: \(isLeader\(\) \|\| soloChar\(\)\) \? \(\(\) => \{ try \{ return manualSpotPublic\(\)/.test(src), 'swarm_state carries manualSpot');
  check(/if \(now\(\) - manualState\.at > 5000\)/.test(src), 'party_spots.json is re-read every 5 s');
}

// ==== 2026-10-08 21:25 task: "they are just standing in town" / toggles only in fights / "why is the supply run taking so long?" ====

// ---- 6) a dashboard choice during the supply run: the old trip never teleports --------------------------------------------------
{
  const C = M.levelTripCancelledPure, base = { pending: true, autolevel: true, mode: 'autolevel' };
  check(C(base) === true, 'kicked autolevel trip: cancelled');
  check(C(Object.assign({}, base, { pending: false })) === false, 'no pending choice: not cancelled');
  check(C(Object.assign({}, base, { autolevel: false })) === false && C(Object.assign({}, base, { mode: 'mission' })) === false, 'autolevel stopped / a mission: never cancelled');
  ['supplyBusy', 'raidHunt', 'escaping', 'rescue'].forEach(k => check(C(Object.assign({}, base, { [k]: true })) === false, `${k}: its own teleports are never cancelled by a spot choice`));
  check(M.manualChoiceChangedPure('', 'x') === false, 'nothing picked yet: no change');
  check(M.manualChoiceChangedPure('auto', sig(ROOM)) === true && M.manualChoiceChangedPure(sig(ROOM), sig(ROOM)) === false, 'choice changed vs the last pick');

  // The 19:15-19:24 incident as a virtual leader (0.5 s ticks). pick Oren at t=0 -> .giran -> supply run 6 s .. 470 s; the room is chosen
  // at t=200 s; after the supply: hold(.oren) -> teleport(.oren) -> hold(Sel Mahum) -> teleport(Sel Mahum). OLD = the code before (the hold
  // only knew control.gen, its result was ignored, no check after the supply); NEW = stale() checks + levelTripCancelled in every hold.
  function trip(mode) {
    const W = { t: 0, gen: 1, file: AUTO, applied: sig(AUTO), st: {}, pending: false, log: [], ports: [], supplyBusy: false, picked: 'Oren' };
    const io = { now: () => W.t, entry: () => W.file, sig, label, applied: () => W.applied, log: (m) => W.log.push(m),
      ctx: () => ({ order: W.supplyBusy ? 'the supply run' : '', team: [], me: { name: 'Tank1', hp: 100, fight: false } }),
      kick: (st) => { W.gen++; W.pending = true; st.pending = true; } };
    const tick = () => { if (W.t === 200000) W.file = ROOM; if (W.t % 3000 === 0) M.manualSpotTick(W.st, io); W.t += 500; };
    const cancelled = () => M.levelTripCancelledPure({ pending: W.pending, autolevel: true, mode: 'autolevel', supplyBusy: W.supplyBusy });
    const stale = () => {                                        // = manualTripCheck: kicked, or a newer choice seen now and not blocked
      if (mode === 'old') return false;
      if (cancelled()) return true;
      if (M.manualChoiceChangedPure(W.applied, sig(W.file)) && !M.manualSpotBlocker(io.ctx())) { M.manualSwSync(W.st, W.file, sig(W.file), W.t, label(W.file)); W.st.kicked = W.t; W.pending = true; W.gen++; return true; }
      return false;
    };
    const hold = (ms) => { const g0 = W.gen; const end = W.t + ms; while (W.t < end) { tick(); if (W.gen !== g0) return 'interrupted'; if (mode === 'new' && cancelled()) return 'interrupted'; } return 'ok'; };
    const teleport = (to, ms) => { if (hold(ms) === 'interrupted') return false; W.ports.push({ to, at: W.t }); return true; };
    // .giran + supply
    W.supplyBusy = true; while (W.t < 470000) tick(); W.supplyBusy = false;
    if (stale()) return W;                                       // NEW: right after the Giran regroup / supply run
    teleport('Oren', 2000);                                      // (result ignored, as in travelToSpot)
    if (stale()) return W;                                       // NEW: between the town step and the field teleport
    teleport('Sel Mahum', 14000);
    return W;
  }
  const O = trip('old'), N = trip('new');
  check(O.ports.some(p => p.to === 'Sel Mahum'), `OLD code reproduces the incident: ported to ${O.ports.map(p => p.to).join(', ') || 'nowhere'} although the room was chosen at 200 s`);
  check(N.ports.length === 0, `NEW: the old trip never teleports (ports: ${N.ports.map(p => p.to).join(', ') || 'none'})`);
  check(N.pending && N.t <= 470500, `NEW: the chosen room is taken right after the supply run (${(N.t / 1000).toFixed(1)} s, supply ended at 470 s)`);
  check(N.log.some(m => /waiting — the supply run first/.test(m)), 'NEW: while the supply run lasts the dashboard shows "waiting — the supply run first"');
  check(N.st.status === 'pending' || N.st.status === 'travelling', `status after the take: ${N.st.status}`);
  // a kick in the middle of the trip (after the supply): the next hold of the SAME trip refuses too
  {
    let gen = 1, pending = false; const holdNew = (kickAt) => { const g0 = gen; for (let t = 0; t < 4000; t += 500) { if (t === kickAt) { gen++; pending = true; } if (gen !== g0 || M.levelTripCancelledPure({ pending, autolevel: true, mode: 'autolevel' })) return 'interrupted'; } return 'ok'; };
    const h1 = holdNew(1000), h2 = holdNew(-1);
    check(h1 === 'interrupted' && h2 === 'interrupted', `kick during hold 1 -> hold 1 ${h1}, the next hold of the same trip ${h2} (old code: it passed with the new generation)`);
  }
}
// source checks (call sites)
{
  const tts = src.slice(src.indexOf('async function travelToSpot'), src.indexOf('async function autoLevelLoop'));
  const lg = tts.indexOf('await leadGoGiran(`next hunting spot'), s1 = tts.indexOf("stale('after the Giran regroup / supply run')", lg);
  check(lg > 0 && s1 > lg && s1 - lg < 200, 'travelToSpot: a newer choice is checked right after the Giran regroup / supply run');
  const ft = tts.indexOf('if (fromTown) await teamTeleport(fromTown'), s2 = tts.indexOf('if (stale(`after ${fromTown', ft), dt = tts.indexOf("if (dest && !(await teamTeleport(dest, 'autolevel')))", ft);
  check(ft > 0 && s2 > ft && dt > s2, 'travelToSpot: checked between the town step and the field teleport (the 19:24:06 Sel Mahum port)');
  const rp = src.slice(src.indexOf('async function teamRegroupBeforePortInner'), src.indexOf('async function teamRegroupBeforePortInner') + 6000);
  check((rp.match(/levelTripCancelled\(\)/g) || []).length >= 2, 'every hold before a teleport refuses for a cancelled autolevel trip (start + loop)');
  check(/if \(isLeader\(\) && levelTripCancelled\(\)\) \{ gkFail = 'the hunting spot was changed on the dashboard'/.test(src), 'gkTeleport refuses for a cancelled autolevel trip');
  const er = src.slice(src.indexOf('async function enterRoom'), src.indexOf('// --- JOINT RAID'));
  check(/if \(\(await teamRegroupBeforePort\(F\.name\)\) === 'interrupted' \|\| manualTripCheck/.test(er), 'enterRoom: the floor-teleporter hold answer counts (it was ignored)');
  const ps = src.slice(src.indexOf('function pickSpot('), src.indexOf('function pickSpot(') + 1200);
  const fs1 = ps.indexOf('if (autoLvl.forceSpot) return autoLvl.forceSpot;'), ms1 = ps.indexOf('const ms = manualSpot(level, solo); if (ms) return ms;'), cz = ps.indexOf('const zones = customZones()');
  check(fs1 > 0 && ms1 > fs1 && cz > ms1, 'pickSpot: the dashboard choice comes before every automatic zone / datapack spot (only !dungeon / !assist come first)');
  const msrc = src.slice(src.indexOf('function manualSpot(level, solo)'), src.indexOf('// --- the dashboard choice takes effect at once'));
  check(!/spotBad|autoLvl\.bad|spotBlock\(/.test(msrc), 'manualSpot ignores the automatic skip list (the trio\'s "Cruma Tower: skipped (bad)" never hides a chosen room)');
  const sw = src.slice(src.indexOf('async function leadSupply'), src.indexOf('// --- Adena ----'));
  check(/const hurry = \(\) =>/.test(sw) && /CONFIG\.gear\.upgrade\.auto && !hurry\(\)/.test(sw) && /CONFIG\.gear\.dyes\.auto && !hurry\(\)/.test(sw), 'a choice during the supply run: gear / dye shopping skipped, the essentials finish');
}

// ---- 7) toggles only in fights ------------------------------------------------------------------------------------------------
{
  const F = M.toggleFightNow, D = M.toggleDecide;
  check(F({ town: true, hitAgoMs: 0, attacking: true, mobTarget: true }) === false, 'a town is never a fight');
  check(F({ town: false, hitAgoMs: 2000 }) === true, 'hit 2 s ago: fight');
  check(F({ town: false, hitAgoMs: 9000, combatStance: true, mobTarget: false }) === false, 'combat stance without a live monster target: no fight (the stance lingers after the fight)');
  check(F({ town: false, hitAgoMs: 60000, attacking: true, mobTarget: true }) === true, 'attacking my live monster target: fight');
  check(F({ town: false, raid: true, raidEngaged: true, hitAgoMs: 99999 }) === true, 'pulled raid boss: a fight (between waves too)');
  check(F({ town: false, raid: true, raidEngaged: false, hitAgoMs: 99999 }) === false, 'raid walk-in / clearing wait / countdown: NO fight (2026-10-10: toggles drained MP)');
  // a destroyer's day: Giran -> field -> fight -> pause -> fight -> town (Accuracy wanted, plus a non-wanted toggle the user switched on)
  const tg = { acc: { name: 'Accuracy', running: true, wanted: true, lastCastAt: -1e9 }, vs: { name: 'Vicious Stance', running: false, wanted: true, lastCastAt: -1e9 }, other: { name: 'Guard Stance', running: true, wanted: false, lastCastAt: -1e9 } };
  let lastFight = 0; const seen = [];
  const step = (t, s) => {
    const c = { now: t, town: !!s.town, raid: !!s.raid, dead: false, fight: F({ town: !!s.town, raid: !!s.raid, hitAgoMs: s.hit, attacking: !!s.att, mobTarget: !!s.att }) };
    if (c.fight) lastFight = t; c.lastFightAt = lastFight;
    Object.keys(tg).forEach(k => { const a = D(tg[k], c); if (a) { tg[k].running = a === 'on'; tg[k].lastCastAt = t; seen.push(`${t / 1000}s ${tg[k].name} ${a}`); } });
  };
  step(1000, { town: true, hit: 1e9 });                                     // Giran: Accuracy + Guard Stance were on (the user's report)
  check(!tg.acc.running && !tg.other.running && !tg.vs.running, `in town: every running toggle goes OFF (${seen.join(', ')})`);
  for (let t = 30000; t <= 60000; t += 5000) step(t, { hit: 1e9 });        // field, no monster yet
  check(!tg.acc.running && !tg.vs.running, 'field without a fight: stay off');
  for (let t = 65000; t <= 90000; t += 5000) step(t, { hit: t - 64000, att: true });   // fight
  check(tg.acc.running && tg.vs.running, 'fight: Accuracy + Vicious Stance ON');
  check(!tg.other.running, 'a toggle that is not wanted is never switched on');
  for (let t = 95000; t <= 100000; t += 5000) step(t, { hit: 1e9 });         // 5-10 s after the fight
  for (let t = 105000; t <= 125000; t += 5000) step(t, { hit: 1e9 });
  check(!tg.acc.running && !tg.vs.running, `fight over (>= 8 s): OFF (${seen.slice(-2).join(', ')})`);
  const nOn = seen.filter(s => / on$/.test(s)).length, nOff = seen.filter(s => / off$/.test(s)).length;
  check(nOn === 2 && nOff === 4, `one switch per change, no flapping (${nOn} on, ${nOff} off)`);
  // raid between waves, Fake Death, recast gap, dead
  check(D({ name: 'Accuracy', running: true, wanted: true, lastCastAt: 0 }, { now: 1e6, fight: false, lastFightAt: 1e6 - 15000, town: false, raid: true, raidEngaged: true }) === '', 'pulled raid, 15 s between waves: stays on');
  check(D({ name: 'Accuracy', running: true, wanted: true, lastCastAt: 0 }, { now: 1e6, fight: false, lastFightAt: 1e6 - 25000, town: false, raid: true, raidEngaged: true }) === 'off', 'pulled raid, 25 s quiet: OFF');
  check(D({ name: 'Accuracy', running: true, wanted: true, lastCastAt: 0 }, { now: 1e6, fight: false, lastFightAt: 0, town: false, raid: true, raidEngaged: false }) === 'off', 'raid not pulled yet (walk-in / countdown): OFF');
  check(D({ name: 'Accuracy', running: false, wanted: true, lastCastAt: 0 }, { now: 1e6, fight: false, lastFightAt: 0, town: false, raid: true, raidEngaged: false }) === '', 'raid not pulled yet: never switched ON');
  { const kp2 = src.slice(src.indexOf('function toggleCtx()'), src.indexOf('async function autoSkillTick'));
    check(/act === 'on' && !busy/.test(kp2) && !kp2.includes('state.escaping || tradeState || Me.IsSitting || rest.sitting || state.gkBusy) return'), 'trade / gatekeeper / escape: toggles still switched OFF, never ON'); }
  check(D({ name: 'Fake Death', running: true, wanted: false, lastCastAt: 0 }, { now: 1e6, fight: false, lastFightAt: 0, town: true }) === '', 'Fake Death is never switched off by the keeper');
  // 2026-10-10 (user: "Dagger1 still has Silent Move activated - it's also a toggle skill")
  check(D({ name: 'Silent Move', running: true, wanted: false, lastCastAt: 0 }, { now: 1e6, fight: false, lastFightAt: 1e6 - 9000, town: false }) === 'off', 'Silent Move left on in the field: switched OFF after the fight-off delay');
  check(D({ name: 'Silent Move', running: true, wanted: false, lastCastAt: 0 }, { now: 1e6, fight: false, lastFightAt: 0, town: true }) === 'off', 'Silent Move in a town: OFF');
  { const kp3 = src.slice(src.indexOf('function toggleCtx()'), src.indexOf('async function autoSkillTick'));
    check(/scoutCtl\.on && typeof SCOUT_SPEED !== 'undefined' && \(SCOUT_SPEED\.stealthRe\.test\(name\)/.test(kp3), 'during a scout trip the keeper leaves the stealth toggle to the scout'); }
  check(D({ name: 'Accuracy', running: true, wanted: true, lastCastAt: 1e6 - 5000 }, { now: 1e6, fight: false, lastFightAt: 0, town: true }) === '', `recast gap ${M.TOGGLE_RULE.recastGapMs / 1000} s (IsRunning needs a moment to show)`);
  check(D({ name: 'Accuracy', running: false, wanted: true, lastCastAt: 0 }, { now: 1e6, fight: true, lastFightAt: 1e6, town: false, dead: true }) === '', 'dead: nothing');
  check(D({ name: 'Accuracy', running: false, wanted: true, lastCastAt: 0 }, { now: 1e6, fight: true, lastFightAt: 1e6, town: true }) === '', 'never on in a town, even when hit there');
  // call sites
  const kp = src.slice(src.indexOf('function toggleCtx()'), src.indexOf('async function autoSkillTick'));
  check(/const act = toggleDecide\(/.test(kp) && /todo = \{ id, name, off: true \}/.test(kp), 'the keeper uses toggleDecide for every IsToggle skill (on AND off)');
  check(!/k\.IsToggle && KEEP_TOGGLES\.includes\(name\) && !k\.IsRunning/.test(src), 'the old "switch on whenever it is off" rule is gone');
  const ast = src.slice(src.indexOf('async function autoSkillTick'), src.indexOf('async function autoSkillTick') + 1500);
  check(!/plan\.toggles\)/.test(ast), 'autoSkillTick no longer casts toggles (only the keeper does)');
}

// ---- 8) supply runs ---------------------------------------------------------------------------------------------------------
{
  const iso = (s) => Date.parse('2026-10-08T' + s + 'Z');
  // the 30-min rule with the persisted timestamp: 18:34:38 run; script restart 18:40:43 (memory lost, the file stays); regroup 18:41:44
  const file = new Date(iso('18:34:38')).toISOString();
  const afterRestart = M.supplyLastParse(file);
  check(afterRestart === iso('18:34:38'), 'the timestamp survives a script restart (Logs/supply_last_<leader>.txt)');
  check(M.supplyDue(afterRestart, iso('18:41:44')) === false, '18:41:44 regroup after the restart: NOT due (was a 2nd run 7 min later)');
  check(M.supplyDue(afterRestart, iso('19:04:37')) === false && M.supplyDue(afterRestart, iso('19:04:38')) === true, 'due again after exactly 30 min');
  check(M.supplyDue(afterRestart, iso('18:41:44'), true) === true, '!supply / !restock from the user always runs');
  check(M.supplyDue(0, iso('18:00:00')) === true && M.supplyLastParse('') === 0 && M.supplyLastParse('garbage') === 0, 'no file / unreadable: due');
  // plan steps: only those with something to do, leader first
  const got = { Tank1: { name: 'Tank1', ok: true, need: false }, Bishop1: { name: 'Bishop1', ok: true, need: true }, Doombringer1: { name: 'Doombringer1', ok: true, need: true }, Necro1: { name: 'Necro1', ok: false, need: true } };
  check(M.needOrder(got, ['Tank1', 'Doombringer1', 'Bishop1', 'Necro1']).join(',') === 'Doombringer1,Bishop1', 'gear/dye run order = only the ones with need (failed answers skipped), in the given order');
  check(M.needOrder({}, ['Tank1']).length === 0, 'nobody: no run at all');
  // dyes not sold: 24 h
  const U = M.unavailMark({}, 4445, iso('18:52:42'), M.SUPPLY_RULE.dyeUnavailMs, 'Greater Dye of STR: not sold');
  check(M.unavailActive(U, 4445, iso('19:23:00')) === true, 'Greater Dye of STR (not sold at 18:52) is skipped at the 19:16 run');
  check(M.unavailActive(U, '4445', iso('18:52:42') + 24 * 3600000 - 1) === true && M.unavailActive(U, 4445, iso('18:52:42') + 24 * 3600000) === false, 'tried again after 24 h');
  check(M.unavailActive(U, 4446, iso('19:00:00')) === false, 'other dyes are not affected');
  // the timer line
  const T = M.supplyTimer(1000); T.mark('needs', 1500); T.mark('gear', 1500 + 200000, 'nothing to buy'); T.mark('adena', 1500 + 200000 + 500);
  const line = T.summary(1500 + 200000 + 500);
  check(line === '3m21s — needs 0.5 s, gear 3m20s (nothing to buy), adena 0.5 s', `summary line: "${line}"`);
  check(M.fmtDur(59400) === '59.4 s' && M.fmtDur(465000) === '7m45s', 'durations');
  // a run with nothing to do, estimated with the new steps: needs 0.5 + shop 0 + hand-out 0 + enchant 0.5 + sales 0 + gear plan ~1 + dye plan ~5 + adena 0.5
  const est = 0.5 + 0 + 0 + 0.5 + 0 + 1 + 5 + 0.5;
  check(est < 180, `nothing needed: ~${est} s + the gather (target < 3 min; was 7m45s at 19:16)`);
  // call sites
  const lg = src.slice(src.indexOf('async function leadGoGiran'), src.indexOf('async function leadGoGiran') + 3500);
  check(/supplyDue\(lastSupplyAtGet\(\), now\(\)\)/.test(lg), 'Giran-regroup auto-supply uses the persisted timestamp');
  check(/!supplyDue\(lastSupplyAtGet\(\), now\(\)\)\) return;/.test(src), 'the supply watch uses the same timestamp');
  check(!/now\(\) - lastSupplyAt\b/.test(src) && /lastSupplyAtSet\(now\(\)\);/.test(src), 'no in-memory-only timestamp left; leadSupply persists it');
  check(/control\.gen\+\+; state\.supplyHold = runId;/.test(src) && /if \(state\.supplyHold === runId\) state\.supplyHold = null;/.test(src), 'the supply run holds the team: other walks/holds step aside, the hold is released in finally');
  check(/async function gkTeleport\(wanted, why\) \{(?:\s*if \(\/\^autolevel\/i[^\n]*)?\s*if \(supplyHoldsTeam\(\)\)/.test(src) && /if \(supplyHoldsTeam\(\)\) \{ note\(`town: NOT using \.town/.test(src), 'no .town / gatekeeper teleport by the leader during the supply run (the 18:35:17 .dion)');
  check(/state\.inHubRegroup \|\| state\.goingHub \|\| \(control\.owner && control\.owner !== 'leveling'/.test(src), 'idle watchdog: no 2nd regroup/supply while a regroup / order still runs (18:34:38)');
  check(/if \(rank < 0 && data && Array\.isArray\(data\.order\)\) return \{ ok: true, msg: 'nothing to buy \(plan step\)' \}/.test(src), 'gearrun: characters not on the buyers list answer at once');
  check(/dyeUnavailMark\(e\.dyeId/.test(src) && /todoAll\.filter\(e => !unavailActive\(UA, e\.dyeId, now\(\)\)\)/.test(src), 'dyeMine remembers + skips dyes no shop sold');
  check(/T\.summary\(now\(\)\)/.test(sw2()) && /supply_runs\.log/.test(src), 'one summary line per run (party chat + Logs/supply_runs.log)');
  function sw2() { return src.slice(src.indexOf('async function leadSupply'), src.indexOf('// --- Adena ----')); }
}

console.log(fails ? `\n${fails} check(s) FAILED` : '\nall checks passed');
process.exit(fails ? 1 : 0);
