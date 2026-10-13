// Test of the durable ORDER QUEUE (2026-10-13; Dashboard/orderqueue.js + orders_api.js + orders.js, the ORDERQ block of Scripts_dev/swarm.js,
// the server.js /api/command wiring). Offline: never the game, never the live Logs (temp folders only), never the real dashboard (8090) or MCP.
//   1) ORDERQ-PURE (swarm.js) in node: delivery while not ready, exactly once, supersede, !stop clears, expiry, cancel, wrong sender, chat copy,
//      lost state file, the running-order decision, pruning
//   2) Dashboard/orderqueue.js pure parts: policy / ttl, isOrderFor (= swarm.js orderNewFor), merge, enqueue supersede, nudge backoff
//   3) END TO END on a temp folder: the dashboard queue + simulated swarm.js windows running the REAL ORDERQ block (host part too) with a fake
//      host: a window that is down gets it when it starts (the 12:09 !dawn case), exactly once after a restart, a newer order supersedes,
//      !stop clears, cancel of a running order, expiry, legacy windows
//   4) server.js /api/command with a mock MCP: a fresh window = queue only (no MCP say), a never-seen window = MCP say as before + 'done'
//      legacy entry; /api/orders lists it; the old file channel test layout still holds
//   5) wiring source checks (swarm.js, server.js, commands.js, index.html, orders.js: no alert / confirm / prompt)
//   node docs/plan/tools/test_order_queue.js
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), http = require('http'), cp = require('child_process');
const ROOT = process.env.OQ_TEST_ROOT || path.resolve(__dirname, '..', '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
let fails = 0, passes = 0;
const check = (ok, msg) => { if (ok) { passes++; } else { fails++; console.log('FAIL ' + msg); } };
const blk = (a, b) => { const i = SRC.indexOf(a), j = SRC.indexOf(b, i + 1); if (i < 0 || j < 0) throw new Error('block not found: ' + a); return SRC.slice(i, j); };

// ---- 1) ORDERQ-PURE ------------------------------------------------------------------------------------------------------------------
const PURE = blk('// ORDERQ-PURE-BEGIN', '// ORDERQ-PURE-END');
const STICK = blk('// ORDERSTICK-PURE-BEGIN', '// ORDERSTICK-PURE-END');
const P = new Function(STICK + PURE + '\nreturn { OQ, oqPlan, oqRunDecide, oqPrune, oqKey, oqValid, orderNewFor, ORDER_CMDS };')();
const T0 = 1760350000000;
const ROSTER = { Char1: 1, Bishop5: 1, Bishop1: 1 };
const isNew = (o) => P.orderNewFor(String(o.cmd).trim().replace(/^#(?=!)/, '').split(/\s+/), 'Bishop5', ROSTER);
const isStop = (o) => /^!stop\b/i.test(o.cmd);
const ctx = (o) => Object.assign({ me: 'Bishop5', leader: 'Char1', now: T0, ready: true, chat: [], isNew, isStop }, o || {});
const ord = (id, cmd, o) => Object.assign({ id, cmd, from: 'Char1', at: T0 - 1000, ttlMs: 600000, state: 'queued' }, o || {});
const Q = (...orders) => ({ v: 1, name: 'Bishop5', orders });
let r;
r = P.oqPlan(Q(ord('oaaaa1', '!dawn')), { orders: {} }, ctx({ ready: false, notReadyWhy: 'logging in' }));
check(r.run.length === 0 && r.mark.length === 1 && r.mark[0].state === 'delivered' && /logging in/.test(r.mark[0].why), 'not ready: marked delivered, not run');
r = P.oqPlan(Q(ord('oaaaa1', '!dawn')), { orders: { oaaaa1: { state: 'delivered' } } }, ctx({ ready: false }));
check(r.mark.length === 0 && r.run.length === 0, 'still not ready: no new mark');
r = P.oqPlan(Q(ord('oaaaa1', '!dawn')), { orders: { oaaaa1: { state: 'delivered' } } }, ctx());
check(r.run.length === 1 && r.run[0].id === 'oaaaa1', 'ready later: runs (the 12:09 !dawn case)');
for (const s of ['acknowledged', 'running', 'done', 'failed', 'superseded', 'expired', 'cancelled'])
  check(P.oqPlan(Q(ord('oaaaa1', '!dawn')), { orders: { oaaaa1: { state: s } } }, ctx()).run.length === 0, `exactly once: a ${s} record never runs again`);
r = P.oqPlan(Q(ord('oaaaa1', '!town giran', { at: T0 - 9000 }), ord('oaaaa2', '!status', { at: T0 - 8000 }), ord('oaaaa3', '!dawn', { at: T0 - 7000 })), { orders: {} }, ctx());
check(r.run.map(o => o.id).join() === 'oaaaa2,oaaaa3' && r.mark.find(m => m.id === 'oaaaa1').state === 'superseded' && /replaced by !dawn/.test(r.mark.find(m => m.id === 'oaaaa1').why), 'a newer order supersedes an older one that did not run; a report (!status) still runs');
r = P.oqPlan(Q(ord('oaaaa1', '!town giran', { at: T0 - 9000 }), ord('oaaaa2', '!status', { at: T0 - 8000 }), ord('oaaaa3', '!stop', { at: T0 - 7000 })), { orders: { oold01: { state: 'running', order: true }, oold02: { state: 'done' } } }, ctx());
check(r.run.map(o => o.id).join() === 'oaaaa3' && r.mark.filter(m => m.state === 'superseded').length === 2 && /!stop clears/.test(r.mark[0].why), '!stop clears every pending order');
check(r.endRunning.length === 1 && r.endRunning[0].id === 'oold01' && r.endRunning[0].state === 'superseded', '!stop ends the running order');
r = P.oqPlan(Q(ord('oaaaa3', '!level')), { orders: { oold01: { state: 'running', order: true }, oold03: { state: 'running', order: false } } }, ctx());
check(r.endRunning.map(e => e.id).join() === 'oold01', 'a new order ends the running ORDER (not a running non-order)');
r = P.oqPlan(Q(ord('oaaaa1', '!dawn', { at: T0 - 700000 })), { orders: {} }, ctx());
check(r.run.length === 0 && r.mark[0].state === 'expired', 'older than its ttl: expired, never run');
r = P.oqPlan(Q(ord('oaaaa1', '!status', { at: T0 - 130000, ttlMs: 120000 })), { orders: {} }, ctx());
check(r.mark[0].state === 'expired', 'per-order ttl (2 min report)');
r = P.oqPlan(Q(ord('oaaaa1', '!dawn', { state: 'cancelled' })), { orders: {} }, ctx());
check(r.run.length === 0 && r.mark[0].state === 'cancelled', 'cancelled before it ran: never runs');
r = P.oqPlan(Q(ord('oaaaa1', '!town giran', { state: 'cancelled' })), { orders: { oaaaa1: { state: 'running' } } }, ctx());
check(r.endRunning.length === 1 && r.endRunning[0].state === 'cancelled', 'cancelled while running: the window ends it');
r = P.oqPlan(Q(ord('oaaaa1', '!dawn', { state: 'superseded', why: 'x' }), ord('oaaaa2', '!level', { state: 'done', how: 'party chat (legacy)' })), { orders: {} }, ctx());
check(r.run.length === 0 && r.mark.map(m => m.state).join() === 'superseded,done', 'dashboard-side states (superseded / legacy chat) are recorded, never run');
r = P.oqPlan(Q(ord('oaaaa1', '!level', { from: 'Tank1' })), { orders: {} }, ctx());
check(r.run.length === 0 && r.mark[0].state === 'failed' && /my leader is Char1/.test(r.mark[0].why), 'from someone who is not my leader: failed with the reason');
r = P.oqPlan(Q(ord('oaaaa1', '!status', { from: 'Bishop5' })), { orders: {} }, ctx());
check(r.run.length === 1, 'from myself (character target): runs');
const chat = [{ key: '!dawn', from: 'Char1', at: T0 - 500, used: false }];
r = P.oqPlan(Q(ord('oaaaa1', '#!Dawn')), { orders: {} }, ctx({ chat }));
check(r.run.length === 0 && r.mark[0].state === 'done' && /party chat/.test(r.mark[0].how) && chat[0].used, 'the same order heard in party chat: done, not run twice ("#" and case ignored)');
r = P.oqPlan(Q(ord('oaaaa1', '!dawn')), { orders: {} }, ctx({ chat: [{ key: '!dawn', from: 'Char1', at: T0 - 60000, used: false }] }));
check(r.run.length === 1, 'a chat line from BEFORE the order does not count');
r = P.oqPlan(Q(ord('oaaaa1', '!dawn')), { orders: {} }, ctx({ ready: false, fatal: 'not in CONFIG.roster' }));
check(r.mark[0].state === 'failed' && /roster/.test(r.mark[0].why), 'not in the roster: failed');
r = P.oqPlan(Q(ord('oaaaa1', '!dawn', { at: T0 - 5000 })), { orders: {} }, ctx({ lostBefore: T0 - 1000 }));
check(r.run.length === 0 && r.mark[0].state === 'failed', 'state file lost: older orders are never run (might have run)');
r = P.oqPlan({ name: 'Bishop1', orders: [ord('oaaaa1', '!dawn')] }, { orders: {} }, ctx());
check(r.run.length === 0 && r.mark.length === 0, "another character's file: ignored");
r = P.oqPlan(Q({ id: 'bad', cmd: '!dawn', at: T0 }, ord('oaaaa2', '/config set x y'), ord('oaaaa3', '!a\nb')), { orders: {} }, ctx());
check(r.run.length === 0, 'bad ids / non-! commands / two lines are ignored');
// !dawn <name> and !goto npc <q> <name>: an order only for the named one
check(P.orderNewFor(['!dawn'], 'Bishop1', ROSTER) && P.orderNewFor(['!dawn', 'bishop1'], 'Bishop1', ROSTER) && !P.orderNewFor(['!dawn', 'Bishop5'], 'Bishop1', ROSTER), '!dawn = a new order; !dawn <other> is not one for me');
// running decisions
const RUN = { seq: 3, startAt: T0, runId: 'r1' };
const live = (o) => Object.assign({ runId: 'r1', seq: 3, text: '!town giran', active: false, activeAt: T0, now: T0 + 200000 }, o || {});
check(P.oqRunDecide(RUN, live({ seq: 4, text: '!level' })).state === 'superseded', 'running: a newer order (seq) -> superseded');
check(P.oqRunDecide(RUN, live({ runId: 'r2' })).state === 'failed', 'running when swarm.js restarted -> failed (never re-run)');
check(P.oqRunDecide(RUN, live({ active: true })) === null, 'running while its retry loop / control slot is busy');
check(P.oqRunDecide(RUN, live({ failWhy: '5 tries' })).state === 'failed', 'its retry loop gave up -> failed with the reason');
check(P.oqRunDecide(RUN, live({ now: T0 + 30000 })) === null, 'quiet but young: still running');
check(P.oqRunDecide(RUN, live({ okWhy: 'getting the team to Giran' })).state === 'done', 'quiet and old: done');
check(P.oqRunDecide(RUN, live({ active: true, now: T0 + 3700000 })).state === 'done', 'no end report after 60 min: done');
// pruning keeps what could still run
const stp = { orders: { oaaaa1: { state: 'done', at: T0 - 7 * 3600e3, orderAt: T0 - 7 * 3600e3 }, oaaaa2: { state: 'done', at: T0 - 7 * 3600e3, orderAt: T0 - 60000, ttlMs: 600000 }, oaaaa3: { state: 'running', at: T0 - 8 * 3600e3 } } };
P.oqPrune(stp, Q(ord('oaaaa2', '!x')), T0);
check(!stp.orders.oaaaa1 && !!stp.orders.oaaaa2 && !!stp.orders.oaaaa3, 'prune: an old terminal record goes; one whose order is still runnable in the queue stays; a running one stays');

// ---- 2) Dashboard/orderqueue.js -----------------------------------------------------------------------------------------------------
const OQM = require(path.join(ROOT, 'Dashboard', 'orderqueue.js'));
check(String(OQM.ORDER_RE) === String(P.ORDER_CMDS), `ORDER_RE (orderqueue.js) == ORDER_CMDS (swarm.js)`);
check(OQM.isOrderFor('!dawn Bishop1', 'Bishop1') && !OQM.isOrderFor('!dawn Bishop1', 'Bishop5') && OQM.isOrderFor('#!level', 'x') && !OQM.isOrderFor('!status', 'x'), 'isOrderFor = orderNewFor');
check(OQM.isOrderFor('!goto npc grocer Bishop1', 'Bishop5', ['Bishop1']) === false && OQM.isOrderFor('!goto npc grocer Bishop1', 'Bishop1', ['Bishop1']), 'isOrderFor: !goto npc ... <name>');
const CMDS = require(path.join(ROOT, 'Dashboard', 'commands.js'));
const pol = (t) => OQM.policy(CMDS.classify(t), t);
check(pol('!stop').stop && pol('!stop').ttlMs === 300000, '!stop: stop, 5 min');
check(pol('!status').ttlMs === 120000 && pol('!dawn').ttlMs === 600000, 'report 2 min, order 10 min');
check(pol('!soe').ttlMs === 120000, 'catalog ttl override (!soe retreat: 2 min)');
const W0 = OQM.windowOf(null, T0), W1 = OQM.windowOf({ atMs: T0 - 1000, ready: true }, T0), W2 = OQM.windowOf({ atMs: T0 - 120000, ready: true }, T0);
check(!W0.seen && W1.fresh && W1.ready && W2.seen && !W2.fresh, 'windowOf: never seen / fresh / down');
const qe = { id: 'oaaaa1', cmd: '!dawn', at: T0 - 1000, ttlMs: 600000, state: 'queued' };
check(OQM.merge('V', qe, null, W2, T0).waiting && /not connected yet/.test(OQM.merge('V', qe, null, W2, T0).why), 'merge: window down -> waiting, "will be delivered"');
check(OQM.merge('V', qe, { state: 'running' }, W1, T0).state === 'running', "merge: the bot's record wins");
check(OQM.merge('V', Object.assign({}, qe, { at: T0 - 700000 }), null, W1, T0).state === 'expired', 'merge: too old -> expired');
const mo = (e) => OQM.merge('V', e, e.id === 'otaken' ? { state: 'running' } : null, W1, T0);
let qq = { v: 1, name: 'V', rev: 0, orders: [Object.assign({}, qe, { id: 'opend1', order: true }), Object.assign({}, qe, { id: 'otaken', order: true }), Object.assign({}, qe, { id: 'oinfo1', cmd: '!status', order: false })] };
let er = OQM.enqueueInto(qq, { id: 'onew01', cmd: '!level', at: T0, order: true, stop: false, state: 'queued' }, mo, T0);
check(er.superseded.join() === 'opend1' && er.queue.orders.find(e => e.id === 'otaken').state === 'queued', 'enqueue: a pending older order is superseded, one the bot took is left to the bot, a report stays');
er = OQM.enqueueInto(er.queue, { id: 'ostop1', cmd: '!stop', at: T0, order: true, stop: true, state: 'queued' }, mo, T0);
check(er.superseded.sort().join() === 'oinfo1,onew01', 'enqueue !stop: every pending entry superseded');
const E = { at: T0, nudges: 0 }, M = { pending: true, state: 'queued' };
check(!OQM.nudgeDue(E, M, W1, T0 + 4000) && OQM.nudgeDue(E, M, W1, T0 + 5000) && !OQM.nudgeDue({ at: T0, nudges: 1, lastNudge: T0 + 5000 }, M, W1, T0 + 15000) && OQM.nudgeDue({ at: T0, nudges: 1, lastNudge: T0 + 5000 }, M, W1, T0 + 20000), 'nudge backoff 5 s, 15 s, ...');
check(!OQM.nudgeDue(E, M, W2, T0 + 60000), 'no nudge while the window is down (it reads the file when it starts)');

// ---- 3) END TO END on a temp folder ---------------------------------------------------------------------------------------------------
const HOSTBLK = blk('// ORDER QUEUE (user 2026-10-13 12:20', '// ORDERQ-HOST-END');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'swarm_orderq_'));
const ODIR = path.join(TMP, 'Logs', 'orders'); fs.mkdirSync(ODIR, { recursive: true });
let CLOCK = T0 + 1e7; const realNow = Date.now;
const DQ = OQM.create({ dir: () => ODIR });
const realFile = {
  Exists: (f) => fs.existsSync(f), ReadAllText: (f) => fs.readFileSync(f, 'utf8'), WriteAllText: (f, s) => fs.writeFileSync(f, s),
  GetLastWriteTimeUtc: (f) => ({ Ticks: fs.existsSync(f) ? BigInt(Math.round(fs.statSync(f).mtimeMs * 1000)) + BigInt(fs.statSync(f).size) * 7n + BigInt(Math.floor(Math.random() * 3)) : 504911232000000000n }),
};
function windowSim(name, leader, opts) {
  const W = Object.assign({ ready: true, said: [], notes: [], timeouts: [], ivs: [] }, opts || {});
  const env = {
    SWARM_ROOT: TMP, Me: { Name: name }, CONFIG: { leader, roster: { Char1: 1, Bishop5: 1, Bishop6: 1, Bishop1: 1 } }, File: realFile,
    note: (m) => W.notes.push(m), logError: (w, e) => W.notes.push('ERR ' + w + ' ' + (e && e.message)), now: () => CLOCK,
    IsCharacterReady: () => W.ready, state: { role: 'x' }, userOrder: { name: '!town', since: 0 }, control: { owner: null }, orderCtl: {}, orderState: { seq: 0, text: '' },
    userOrderEnd: () => { env.userOrder.name = null; },
    handleSay: (from, text) => { W.said.push(from + '>' + text); if (P.orderNewFor(text.split(/\s+/), name, env.CONFIG.roster)) { env.orderState.seq++; env.orderState.text = text; if (W.holdCtl) env.orderCtl['ctl'] = env.orderState.seq; } },
    orderBegin: (t) => { env.orderState.seq++; env.orderState.text = t; return env.orderState.seq; },
    orderNewFor: P.orderNewFor,
    fileStamp: (f) => { try { const s = fs.statSync(f); return String(s.mtimeMs) + ':' + s.size; } catch (e) { return ''; } },
    setTimeout: (fn) => { W.timeouts.push(fn); }, setInterval: (fn, ms) => { W.ivs.push({ fn, ms }); }, questRun: { active: false }, qeS: () => ({ running: false }),
  };
  const names = Object.keys(env);
  const S = new Function(...names, HOSTBLK + '\nreturn { oq, oqTick, oqChatGate, oqSeqFail, oqLive, OQ };')(...names.map(k => env[k]));
  W.env = env; W.S = S;
  W.tick = () => { S.oqTick(); let n = 0; while (W.timeouts.length && n++ < 20) W.timeouts.shift()(); };
  return W;
}
const stateOf = (n) => JSON.parse(fs.readFileSync(path.join(ODIR, n + '.state.json'), 'utf8'));
const addOrder = (cmd, sends, extra) => { const id = OQM.newId(CLOCK); const p = OQM.policy(CMDS.classify(cmd), cmd); DQ.add(Object.assign({ id, cmd, at: CLOCK, label: 'test', targets: ['party:Char1'], safety: 'confirm', ttlMs: p.ttlMs, stop: p.stop, sends }, extra || {}), ['Char1', 'Bishop5', 'Bishop6']); return id; };
const PARTY = [{ from: 'Char1', text: '#!dawn', via: 'party', recipients: ['Char1', 'Bishop5', 'Bishop6'] }];
// heartbeats first (a window that wrote a state file = queue-aware); Bishop6's window is DOWN (pool restart)
let V = windowSim('Char1', 'Char1'), S2 = windowSim('Bishop5', 'Char1');
CLOCK += 5000; V.tick(); S2.tick();
fs.writeFileSync(path.join(ODIR, 'Bishop6.state.json'), JSON.stringify({ v: 1, name: 'Bishop6', atMs: CLOCK - 300000, ready: true, orders: {} }));
const id1 = addOrder('!dawn', PARTY);
let st1 = DQ.status(id1, ['Char1', 'Bishop5', 'Bishop6'], CLOCK);
check(st1.every(x => x.state === 'queued') && st1.find(x => x.name === 'Bishop6').waiting && /not connected yet/.test(st1.find(x => x.name === 'Bishop6').why), 'queued for 3; Bishop6 (down) shows "not connected yet - will be delivered"');
CLOCK += 1000; V.tick(); S2.tick();
check(V.said.join() === 'Char1>!dawn' && S2.said.join() === 'Char1>!dawn', 'the up windows ran it once, as the leader\'s party-chat line');
st1 = DQ.status(id1, ['Char1', 'Bishop5'], CLOCK);
check(st1.every(x => x.state === 'running'), `!dawn is an order: running (${st1.map(x => x.state).join()})`);
check(V.env.userOrder.name === null, 'a new order releases the old userOrder (the 11:08 !town no longer blocks it)');
CLOCK += 3000; V.tick(); S2.tick(); V.tick();
check(V.said.length === 1, 'no second run on later polls');
// Bishop6's window starts 4 min later (the pool restart): not ready first, then ready
CLOCK += 240000;
let I = windowSim('Bishop6', 'Char1', { ready: false });
I.tick();
check(I.said.length === 0 && stateOf('Bishop6').orders[id1].state === 'delivered', 'Bishop6 starts, not ready: delivered');
I.env.state.role = 'x'; I.ready = true; CLOCK += 5000; I.S.oq.scanNow = true; I.tick();
check(I.said.join() === 'Char1>!dawn', 'ready: it runs the order it missed - exactly once');
// restart of every window: nothing runs again
CLOCK += 2000;
V = windowSim('Char1', 'Char1'); S2 = windowSim('Bishop5', 'Char1'); I = windowSim('Bishop6', 'Char1');
CLOCK += 5000; V.tick(); S2.tick(); I.tick();
check(V.said.length + S2.said.length + I.said.length === 0, 'after a restart (reload / pool restart / relogin) nothing runs twice');
check(stateOf('Char1').orders[id1].state === 'failed' && /restarted while it ran/.test(stateOf('Char1').orders[id1].why), 'an order running across a restart is reported (failed: restarted), not re-run');
// offline window gets two orders: the older is superseded, only the newer runs
fs.writeFileSync(path.join(ODIR, 'Bishop6.state.json.bak'), fs.readFileSync(path.join(ODIR, 'Bishop6.state.json')));
const st = stateOf('Bishop6'); st.atMs = CLOCK - 300000; fs.writeFileSync(path.join(ODIR, 'Bishop6.state.json'), JSON.stringify(st));
const one = (cmd) => [{ from: 'Char1', text: '#' + cmd, via: 'party', recipients: ['Bishop6'] }];
const ida = addOrder('!town giran', one('!town giran')); CLOCK += 1000; const idb = addOrder('!level', one('!level'));
check(DQ.status(ida, ['Bishop6'], CLOCK)[0].state === 'superseded', 'dashboard: an older pending order is superseded by the newer one');
I = windowSim('Bishop6', 'Char1'); CLOCK += 5000; I.tick();
check(I.said.join() === 'Char1>!level', 'the window runs only the newest order');
// !stop clears pending orders + ends the running one
const st2 = stateOf('Bishop5'); st2.atMs = CLOCK - 300000; fs.writeFileSync(path.join(ODIR, 'Bishop5.state.json'), JSON.stringify(st2));
const idc = addOrder('!park start', [{ from: 'Char1', text: '#!park start', via: 'party', recipients: ['Bishop5'] }]);
const idd = addOrder('!status', [{ from: 'Char1', text: '#!status', via: 'party', recipients: ['Bishop5'] }], { safety: 'safe' });
const ids = addOrder('!stop', [{ from: 'Char1', text: '#!stop', via: 'party', recipients: ['Bishop5'] }]);
check(DQ.status(idc, ['Bishop5'], CLOCK)[0].state === 'superseded' && DQ.status(idd, ['Bishop5'], CLOCK)[0].state === 'superseded', '!stop clears the pending orders (dashboard)');
S2 = windowSim('Bishop5', 'Char1'); CLOCK += 5000; S2.tick();
check(S2.said.join() === 'Char1>!stop', 'only !stop runs');
// cancel a running order: its window ends it (orderBegin)
const ide = addOrder('!town giran', [{ from: 'Char1', text: '#!town giran', via: 'party', recipients: ['Char1'] }]);
V.holdCtl = true; CLOCK += 1000; V.tick();
check(DQ.status(ide, ['Char1'], CLOCK)[0].state === 'running', 'running (it holds a control slot)');
CLOCK += 200000; V.tick();
check(DQ.status(ide, ['Char1'], CLOCK)[0].state === 'running', 'still running while its control slot is held');
const seqBefore = V.env.orderState.seq;
DQ.cancel(ide, ['Char1'], 'cancelled on the dashboard', CLOCK); CLOCK += 1000; V.tick();
check(DQ.status(ide, ['Char1'], CLOCK)[0].state === 'cancelled' && V.env.orderState.seq === seqBefore + 1, 'cancel while running: cancelled, its retry loops step aside (orderBegin)');
// done when its control slot is released and it stays quiet
const idf = addOrder('!town dion', [{ from: 'Char1', text: '#!town dion', via: 'party', recipients: ['Char1'] }]);
CLOCK += 1000; V.tick(); V.env.orderCtl.ctl = V.env.orderState.seq;
CLOCK += 60000; V.tick(); delete V.env.orderCtl.ctl;
CLOCK += 100000; V.S.oq.scanNow = true; V.tick();
check(DQ.status(idf, ['Char1'], CLOCK)[0].state === 'done', 'done once its control slot is free and it stays quiet');
// failed when its retry loop gave up
const idg = addOrder('!park grocer', [{ from: 'Char1', text: '#!park grocer', via: 'party', recipients: ['Char1'] }]);
V.holdCtl = false; CLOCK += 1000; V.tick(); V.S.oqSeqFail(V.env.orderState.seq, '!park: getting me to Giran FAILED - 5 tries'); CLOCK += 100000; V.S.oq.scanNow = true; V.tick();
const g = DQ.status(idg, ['Char1'], CLOCK)[0];
check(g.state === 'failed' && /5 tries/.test(g.why), 'failed with the reason when its retry loop gave up');
// chat copy after a queue run: ignored; chat first, then the queue: marked done, not run
const idh = addOrder('!status', [{ from: 'Char1', text: '#!status', via: 'party', recipients: ['Char1'] }], { safety: 'safe' });
CLOCK += 1000; V.tick();
check(V.S.oqChatGate('Char1', '!status') === true && V.S.oqChatGate('Char1', '!status') === false, 'chat copy of an order the queue ran: ignored once (a real second one runs)');
const n0 = V.said.length; V.S.oqChatGate('Char1', '!collect');
const idi = addOrder('!collect', [{ from: 'Char1', text: '#!collect', via: 'party', recipients: ['Char1'] }]);
CLOCK += 1000; V.tick();
check(V.said.length === n0 && DQ.status(idi, ['Char1'], CLOCK)[0].state === 'done', 'heard in party chat first: the queued copy is done, not run twice');
// expiry of a window that never came back
const idj = addOrder('!level', [{ from: 'Char1', text: '#!level', via: 'party', recipients: ['Bishop6'] }]);
const st3 = stateOf('Bishop6'); st3.atMs = CLOCK - 300000; fs.writeFileSync(path.join(ODIR, 'Bishop6.state.json'), JSON.stringify(st3));
CLOCK += 700000; DQ.tick(CLOCK);
check(DQ.status(idj, ['Bishop6'], CLOCK)[0].state === 'expired', 'never picked up within 10 min: expired (dashboard)');
I = windowSim('Bishop6', 'Char1'); CLOCK += 5000; I.tick();
check(I.said.length === 0, 'an expired order never runs when the window comes back');
// legacy: never-seen window -> 'done' (party chat), never run by a later queue-aware swarm.js
const idk = addOrder('!level', [{ from: 'Char1', text: '#!level', via: 'party', recipients: ['Bishop1'] }]);
const lk = DQ.status(idk, ['Bishop1'], CLOCK)[0];
check(lk.state === 'done' && /old swarm\.js/.test(lk.why), 'never-seen window (old swarm.js): sent by party chat, entry done');
const B = windowSim('Bishop1', 'Char1'); CLOCK += 5000; B.tick();
check(B.said.length === 0, 'after the swarm.js deploy the legacy entry is not run a second time');
// nudges while the window is up but has not picked it up
const st4 = stateOf('Bishop5'); st4.atMs = CLOCK; st4.ready = true; fs.writeFileSync(path.join(ODIR, 'Bishop5.state.json'), JSON.stringify(st4));
const idl = addOrder('!level', [{ from: 'Char1', text: '#!level', via: 'party', recipients: ['Bishop5'] }]);
const rev0 = JSON.parse(fs.readFileSync(path.join(ODIR, 'Bishop5.json'), 'utf8')).rev;
CLOCK += 6000; DQ.tick(CLOCK);
check(JSON.parse(fs.readFileSync(path.join(ODIR, 'Bishop5.json'), 'utf8')).rev === rev0 + 1, 're-delivery: the file is rewritten (nudged) after 5 s without an ack');
const lst = DQ.list(null, 50, CLOCK);
check(lst.length >= 10 && lst[0].id === idl && Array.isArray(lst[0].recipients), 'list: newest first with recipients');
check(fs.readFileSync(path.join(ODIR, 'orders.log'), 'utf8').split('\n').length > 10, 'orders.log has the state changes');

if (process.argv.includes('--pure')) { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { } console.log(fails ? fails + ' FAILED, ' + passes + ' passed' : 'pure+e2e: all ' + passes + ' checks passed'); process.exit(fails ? 1 : 0); }
// ---- 4) server.js /api/command with a mock MCP ----------------------------------------------------------------------------------------
const LIVEDIR = path.join(ROOT, 'Logs', 'orders');
const liveSnap = () => { try { return fs.readdirSync(LIVEDIR).map(f => f + ':' + fs.statSync(path.join(LIVEDIR, f)).mtimeMs).sort().join('|'); } catch (e) { return 'none'; } };
const LIVE0 = liveSnap();
const STMP = fs.mkdtempSync(path.join(os.tmpdir(), 'swarm_orderq_srv_'));
process.env.SWARM_CMD_DIR = path.join(STMP, 'cmd'); process.env.SWARM_ORDERS_DIR = path.join(STMP, 'orders');
const MCP_CALLS = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opt = {}) => {
  const u = String(url);
  if (/:8090\b/.test(u)) throw new Error('test: the real dashboard must never be called');
  if (!/:8083\b/.test(u)) return realFetch(url, opt);
  const b = JSON.parse(opt.body || '{}'); let result;
  if (b.method === 'initialize') result = { protocolVersion: '2025-03-26', capabilities: {} };
  else { MCP_CALLS.push({ tool: b.params.name, args: b.params.arguments }); result = { content: [{ type: 'text', text: b.params.name === 'get_accounts_status' ? '[]' : JSON.stringify({ success: true, mock: true }) }] }; }
  const txt = JSON.stringify({ jsonrpc: '2.0', id: b.id, result });
  return { headers: { get: () => null }, text: async () => txt };
};
const timers = { setInterval: global.setInterval, setTimeout: global.setTimeout };
global.setInterval = () => 0; global.setTimeout = () => 0;
cp.fork = () => ({ on() { }, kill() { } });
cp.execFile = (c2, a, o2, cb) => { const f = typeof o2 === 'function' ? o2 : cb; if (f) process.nextTick(() => f(null, '', '')); return { on() { } }; };
const realAppend = fs.appendFileSync;
fs.appendFileSync = (f, d, o2) => { if (/dashboard_commands\.log$/.test(String(f))) return; return realAppend(f, d, o2); };
let PORT = 0;
const realCreate = http.createServer;
http.createServer = (h) => { const s = realCreate(h); const L2 = s.listen.bind(s); s.listen = (p2, host, cb) => L2(0, '127.0.0.1', () => { PORT = s.address().port; if (cb) cb(); }); return s; };
const realLog = console.log; console.log = () => { };
require(path.join(ROOT, 'Dashboard', 'server.js'));
console.log = realLog;
global.setInterval = timers.setInterval; global.setTimeout = timers.setTimeout;
const call = (p2, body) => new Promise((resolve, reject) => {
  const data = body ? JSON.stringify(body) : null;
  const rq = http.request({ host: '127.0.0.1', port: PORT, path: p2, method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json' } }, (res) => {
    let t = ''; res.on('data', c => t += c); res.on('end', () => { let j = null; try { j = JSON.parse(t); } catch (e) { } resolve({ code: res.statusCode, j, t }); });
  });
  rq.on('error', reject); if (data) rq.write(data); rq.end();
});
(async () => {
  for (let i = 0; i < 60 && !PORT; i++) await new Promise(res => timers.setTimeout(res, 50));
  const dry = await call('/api/command', { cmd: '!level', dryRun: true });
  const s0 = dry.j && dry.j.sends && dry.j.sends[0];
  if (!s0) console.log('section 4 skipped: no characters report in this install (no Logs/swarm_state_*.json)');
  else await serverChecks(s0);
  sourceChecks();
  try { fs.rmSync(TMP, { recursive: true, force: true }); fs.rmSync(STMP, { recursive: true, force: true }); } catch (e) { }
  console.log(fails ? `\n${fails} check(s) FAILED, ${passes} passed` : `\ntest_order_queue: all ${passes} checks passed`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('FAIL exception ' + (e && e.stack || e)); process.exit(1); });
async function serverChecks(s0) {
  check(Array.isArray(s0.recipients) && s0.recipients.includes(s0.to), `dry run: the send lists its recipients (${s0.recipients && s0.recipients.length})`);
  // never-seen windows: MCP say as before + a 'done' (legacy) entry per recipient
  let r1 = await call('/api/command', { cmd: '!level', target: 'party:' + s0.to });
  check(r1.code === 200 && MCP_CALLS.some(c => /!level/.test(String((c.args && (c.args.command || (c.args.params && c.args.params.message))) || ''))), 'no heartbeat (old swarm.js): MCP party chat as before');
  check(Array.isArray(r1.j.orders) && r1.j.orders.length === 1 && r1.j.orders[0].recipients.every(x => x.state === 'done' && x.legacy), 'legacy recipients: entries done (party chat), never run again by the queue');
  // fresh heartbeats for the whole party -> queue only, no MCP
  const now0 = Date.now();
  s0.recipients.forEach(n => fs.writeFileSync(path.join(STMP, 'orders', n + '.state.json'), JSON.stringify({ v: 1, name: n, atMs: now0, ready: true, orders: {} })));
  MCP_CALLS.length = 0;
  r1 = await call('/api/command', { cmd: '!dawn', target: 'party:' + s0.to, ackWaitMs: 0 });
  check(r1.code === 200 && r1.j.ok && !MCP_CALLS.some(c => c.tool === 'run_account_command' || c.tool === 'send_game_action'), 'every window queue-aware + up: queue only (no MCP say)');
  check(r1.j.channel === 'queue' && r1.j.sends[0].ok && r1.j.sends[0].orderId && r1.j.orders[0].recipients.length === s0.recipients.length, `channel queue, one order id, ${s0.recipients.length} recipients`);
  const qf = JSON.parse(fs.readFileSync(path.join(STMP, 'orders', s0.to + '.json'), 'utf8'));
  check(qf.orders.some(e => e.cmd === '!dawn' && e.from === s0.to && e.state === 'queued'), "the leader's queue file has { cmd: '!dawn', from: leader, queued }");
  const lv = await call('/api/orders?party=' + encodeURIComponent(s0.to));
  check(lv.code === 200 && lv.j.enabled && lv.j.orders[0].cmd === '!dawn' && !!lv.j.pending, '/api/orders lists it (party filter) + pending per party');
  const TESTID = r1.j.orders[0].id;   // the live queue is ON since 2026-10-13 13:20 (59 heartbeats write Logs\orders all the time): check by this test's own id
  const cx = await call('/api/orders', { action: 'cancel', id: r1.j.orders[0].id });
  check(cx.code === 200 && cx.j.cancelled.length === s0.recipients.length, 'cancel: every not-yet-run entry cancelled');
  // a '/' command is not queued (it keeps its own path)
  MCP_CALLS.length = 0;
  r1 = await call('/api/command', { cmd: '/attack', target: 'char:' + s0.to });
  check(!r1.j.orders && MCP_CALLS.some(c => c.tool === 'run_account_command' && c.args.command === '/attack'), "'/' commands keep their MCP path (not queued)");
  { let hit = false; try { fs.readdirSync(LIVEDIR).forEach(fl => { try { if (fs.readFileSync(path.join(LIVEDIR, fl), 'utf8').indexOf(TESTID) >= 0) hit = true; } catch (e) { } }); } catch (e) { }
    check(!hit && (LIVE0 !== 'none' || liveSnap() === 'none'), "nothing written to the live Logs\\orders (this test's order id is not there)"); }
}
// ---- 5) wiring source checks ----------------------------------------------------------------------------------------------------
function sourceChecks() {
  const srv = fs.readFileSync(path.join(ROOT, 'Dashboard', 'server.js'), 'utf8'), idx = fs.readFileSync(path.join(ROOT, 'Dashboard', 'index.html'), 'utf8');
  const page = fs.readFileSync(path.join(ROOT, 'Dashboard', 'orders.js'), 'utf8'), cc = fs.readFileSync(path.join(ROOT, 'Dashboard', 'cmdcenter.js'), 'utf8');
  check(/require\('\.\/orderqueue'\)/.test(srv) && /require\('\.\/orders_api'\)\.handle\(/.test(srv) && /ORDERQ\.add\(/.test(srv), 'server.js: queue module, API, commandRun queues the orders');
  check(/SWARM_ORDERS_DIR/.test(srv) && /ORDERQ_LIVE/.test(srv), 'server.js: the live Logs\\orders only when it really listens on the dashboard port (tests: temp folders)');
  check(/<script src="\/orders\.js"><\/script>/.test(idx) && /OrdersView\.partyBanner\(leader\)/.test(idx) && /OrdersView\.button\('party:' \+ leader\)/.test(idx), 'index.html: orders.js + party banner + Orders button');
  check(!/\b(alert|confirm|prompt)\s*\(/.test(page.replace(/uiConfirm|window\.confirm\b/g, '')) && /uiConfirm/.test(page), 'orders.js: the styled dialog only (no alert / confirm / prompt)');
  check(/OrdersView\.resultLines/.test(cc), 'command center result: per-character delivery state');
  const hs = blk('function handleSay(charName, text, messageType) {', "if (cmd === '!gearup') {");
  check(/oqChatGate\(charName, text\)/.test(hs), 'handleSay: the chat copy of a queued order runs once');
  check(/function releaseControl\(name\) \{[^\n]*userOrderEnd\(name\); \}/.test(SRC) && !/function releaseControl\(name\) \{ if \(control\.owner === name\) \{ Object\.assign\(control, \{ owner: null, level: 99, since: now\(\) \}\); userOrderEnd\(name\); \} \}/.test(SRC), 'releaseControl always ends its user order (also when another task held control at the end)');
  check(/function orderBegin\(text\) \{[\s\S]{0,400}userOrderEnd\(\)/.test(SRC), 'orderBegin: a new order releases the old userOrder');
  check(/oqLive\(seq, 1\)/.test(SRC) && /oqLive\(seq, -1\)/.test(SRC) && /oqSeqFail\(seq, m\)/.test(SRC), 'orderRetry reports in-flight / failure to the queue');
  check(/oq\.userOrderSinceStart/.test(blk('async function resumeActivity() {', 'ANNONCERINGER')), 'resumeActivity steps aside for an order the queue already ran');
  check(/setInterval\(oqTick, OQ\.pollMs\)/.test(SRC), 'swarm.js polls its queue every second');
}
