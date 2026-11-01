// test_autoqueue.js - requirement docs/requirements/orders.md (owner 2026-10-30): automatic orders wait in a lane per party, one at a time;
// the owner's orders take precedence (they pause the lanes they touch; a queued item they replace is never sent again); Cancel / Run now /
// Clear; a timeout moves the lane on. Dashboard/autoqueue.js with a mocked commandRun / order status (no game, no server).
const fs = require('fs'), os = require('os'), path = require('path');
const AQ = require(path.join(__dirname, '..', '..', '..', 'Dashboard', 'autoqueue.js'));
let ok = 0, bad = 0; const check = (c, m) => { if (c) { ok++; console.log('ok   ' + m); } else { bad++; console.log('FAIL ' + m); } };
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'aq_'));
let clock = 1000000; const status = {}; const sent = []; let oid = 0;
const team = { Doombringer1: 'Tank1', Inspector1: 'Tank1', Chanter1: 'Tank1', Tank1: 'Tank1', Nuker4: 'Tank2', Tank2: 'Tank2' };
const ctx = {
  file: path.join(T, 'auto_queue.json'), now: () => clock, log: () => { },
  laneOf: (n) => team[n] || n,
  commandRun: async (b) => { const id = 'o' + (++oid); sent.push({ cmd: b.cmd, by: b.by, id }); const names = (b.targets || []).map(t => String(t).split(':')[1]).join(',').split(',');
    status[id] = names.map(n => ({ name: n, state: 'running' })); return { code: 200, body: { ok: true, command: b.cmd, sends: [{ orderId: id, recipients: names }] } }; },
  orderStatus: (id) => status[id] || [],
  post: async () => ({ error: 'not in this test' }), itemJobState: () => '', handoverState: () => '',
};
const Q = AQ.create(ctx);
const st = (id) => Q._data().items.find(i => i.id === id).state;
(async () => {
  const a = Q.enqueue({ cmd: '!gearup Doombringer1', targets: ['party:Tank1'], by: 'claude' }).item;
  const b = Q.enqueue({ cmd: '!gearup Inspector1', targets: ['party:Tank1'], by: 'claude' }).item;
  const c = Q.enqueue({ cmd: '!circuit start', targets: ['chars:Nuker4'], by: 'claude' }).item;
  check(a.lanes[0] === 'Tank1' && c.lanes[0] === 'Tank2', 'lanes = the party leader (party:X, or chars:A -> its leader)');
  await Q.tick();
  check(st(a.id) === 'running' && st(b.id) === 'waiting', 'one at a time in a lane: !gearup Inspector1 waits for !gearup Doombringer1');
  check(st(c.id) === 'running', 'another party\'s lane runs at the same time');
  check(sent.every(s => /^autoqueue: /.test(s.by)), 'queued orders go out marked "autoqueue: ..." (not counted as the owner\'s)');
  status.o1 = [{ name: 'Tank1', state: 'done' }]; await Q.tick();
  check(st(a.id) === 'done' && st(b.id) === 'running', 'the next one starts only when the first one\'s order is finished');
  // owner order while b runs: the lane pauses, b is replaced and not re-sent, the next waits for the owner's order
  const d = Q.enqueue({ cmd: '!gearup Chanter1', targets: ['party:Tank1'], by: 'claude' }).item;
  Q.noteOwner({ cmd: '!town giran', orderIds: ['own1'], names: ['Tank1', 'Doombringer1'] }); status.own1 = [{ name: 'Tank1', state: 'running' }];
  status.o3 = [{ name: 'Tank1', state: 'superseded' }]; const nSent = sent.length; await Q.tick();
  check(st(b.id) === 'replaced' && /your order/.test(Q._data().items.find(i => i.id === b.id).why), 'an automatic item the owner\'s order replaced = "replaced by your order"');
  check(st(d.id) === 'waiting' && sent.length === nSent, 'the lane stays paused while the owner\'s order runs (nothing new is sent)');
  check(Q.view().lanes.find(l => l.lane === 'Tank1').paused === true, 'the view shows the lane as paused by your order');
  status.own1 = [{ name: 'Tank1', state: 'done' }]; await Q.tick();
  check(st(d.id) === 'running', 'when the owner\'s order is finished the queue goes on');
  check(!sent.some(s => s.cmd === '!gearup Inspector1' && sent.indexOf(s) >= nSent), 'the replaced item is never sent again');
  // cancel / run now / clear
  const e = Q.enqueue({ cmd: '!supply', targets: ['party:Tank1'] }).item, f = Q.enqueue({ cmd: '!sell', targets: ['party:Tank1'] }).item, g = Q.enqueue({ cmd: '!park', targets: ['party:Tank1'] }).item;
  check(Q.action({ action: 'cancel', id: e.id }).ok && st(e.id) === 'cancelled', 'Cancel a waiting item');
  check(Q.action({ action: 'runnow', id: g.id }).ok && Q._data().items[0].id === g.id, 'Run now moves it to the front');
  status.o4 = [{ name: 'Tank1', state: 'done' }]; await Q.tick();
  check(st(g.id) === 'running' && st(f.id) === 'waiting', 'the Run-now item goes next, before the older one');
  check(Q.action({ action: 'clear', lane: 'Tank1' }).cleared === 1 && st(f.id) === 'cancelled', 'Clear empties the waiting items of a lane');
  // timeout
  clock += 31 * 60000; await Q.tick();
  check(st(g.id) === 'timeout', 'an order without an end after 30 min = timeout, the lane goes on');
  check(Q.enqueue({ cmd: '' }).error && Q.enqueue({ cmd: '!x' }).error, 'refused: no command / no target');
  check(fs.existsSync(ctx.file) && JSON.parse(fs.readFileSync(ctx.file, 'utf8')).items.length > 0, 'the queue is saved in its file (survives a restart)');
  try { fs.rmSync(T, { recursive: true, force: true }); } catch (e) { }
  console.log(`autoqueue: ${ok} ok, ${bad} failed`); process.exit(bad ? 1 : 0);
})();
