// AUTOQUEUE-2026-10-30 (owner: "create a queue system so commands dont get overrun and make sure you follow the queue and make sure we can
// overwrite it as a user. Like if i cast a order it should take precedence over your decicion"; requirement docs/requirements/orders.md).
// Why: Claude's scripted orders replaced each other (!gearup Chanter1 <- !gearup Inspector1: one leader order supersedes the previous, a
// Homunkulus item job failed "a newer order replaced it", Tank1's adena hand-over "stopped (a newer order)").
// How: AUTOMATIC orders (Claude, scripts, automation) go into Logs/auto_queue.json, one LANE per party (the party leader of every recipient);
// per lane ONE item runs at a time and the next starts only when the orders it created are finished (ORDERQ states done / skipped / failed /
// superseded / expired / cancelled; item jobs: done / failed; hand-overs: every giver done / failed / stopped) or after its timeout (30 min).
// The OWNER's orders (every /api/command that does not come from this queue) take precedence: they are sent at once as before, and the lanes
// they touch PAUSE until they are finished; an automatic item they replaced is marked "replaced by your order" and never sent again.
// The owner can Cancel / Run now / Clear on the Orders page. Pure logic over a ctx (tests: docs/plan/tools/test_autoqueue.js, no game).
'use strict';
const fs = require('fs');

const AQD = { timeoutMs: 30 * 60000, ownerMaxMs: 30 * 60000, keepMs: 6 * 3600e3, maxItems: 300 };
const TERMINAL = new Set(['done', 'skipped', 'failed', 'superseded', 'expired', 'cancelled']);
const OPEN = new Set(['waiting', 'running']);
let seq = 0;
const newId = (now) => 'aq' + Number(now).toString(36) + (++seq).toString(36);

/** ctx = { file, now(), log(line), commandRun(body) -> { code, body }, post(path, body) -> json, orderStatus(orderId, names) -> [{ name, state }],
 *  laneOf(name) -> party leader, membersOf(lane) -> [names], itemJobState(id) -> 'queued'|'running'|'done'|'failed'|'', handoverState(id) -> 'open'|'done'|'failed'|'' } */
function create(ctx) {
  const now = () => (ctx.now ? ctx.now() : Date.now());
  const log = (t) => { try { ctx.log && ctx.log(t); } catch (e) { } };
  let D = null;
  function load() {
    if (D) return D;
    try { let t = fs.readFileSync(ctx.file, 'utf8'); if (t.charCodeAt(0) === 0xFEFF) t = t.slice(1); D = JSON.parse(t); } catch (e) { D = null; }
    if (!D || !Array.isArray(D.items)) D = { v: 1, items: [], owner: [] };
    D.owner = Array.isArray(D.owner) ? D.owner : [];
    return D;
  }
  function save() {
    const d = load(), t = now();
    d.items = d.items.filter(i => OPEN.has(i.state) || t - (i.endedAt || i.at || 0) < AQD.keepMs).slice(-AQD.maxItems);
    d.owner = d.owner.filter(o => !o.over || t - (o.endedAt || o.at) < AQD.keepMs).slice(-100);
    d.at = new Date(t).toISOString();
    const tmp = ctx.file + '.' + process.pid + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(d, null, 1)); fs.renameSync(tmp, ctx.file);
  }
  /** the lanes (party leaders) a target list touches */
  function lanesOfTargets(targets) {
    const out = new Set();
    (targets || []).forEach(t => {
      const s = String(t), m = /^(party|char|chars):(.+)$/i.exec(s);
      if (!m) { out.add('*'); return; }                                   // all / clan / anything wider = its own lane '*'
      if (m[1].toLowerCase() === 'party') out.add(m[2]);
      else m[2].split(',').map(x => x.trim()).filter(Boolean).forEach(n => out.add(ctx.laneOf(n) || n));
    });
    return [...out];
  }
  function enqueue(b) {
    const d = load(), t = now(), kind = b.kind === 'upgrade' || b.kind === 'trade' || b.kind === 'make' ? b.kind : 'command';   // EPICGET-2026-10-31: 'make' = a craft job (/api/upgrade/make/start)
    if (kind === 'command' && !String(b.cmd || '').trim()) return { error: 'cmd is needed' };
    const targets = kind === 'command' ? (Array.isArray(b.targets) ? b.targets.map(String) : b.target ? [String(b.target)] : []) : [];
    let lanes = kind === 'command' ? lanesOfTargets(targets) : [];
    if (kind === 'upgrade') lanes = [...new Set(((b.body && b.body.orders) || []).map(o => ctx.laneOf(o.name) || o.name))];
    if (kind === 'make') lanes = [...new Set([b.body && b.body.name].filter(Boolean).map(n => ctx.laneOf(n) || n))];
    if (kind === 'trade') lanes = [...new Set([b.body && b.body.receiver].concat(Object.keys((b.body && b.body.adena) || {}), Object.keys((b.body && b.body.sel) || {})).filter(Boolean).map(n => ctx.laneOf(n) || n))];
    if (!lanes.length) return { error: 'no target (party:X / char:X / chars:A,B, or an upgrade / trade body with names)' };
    const it = { id: newId(t), kind, cmd: kind === 'command' ? String(b.cmd).trim() : kind === 'upgrade' ? 'upgrade job' : kind === 'make' ? 'craft job' : 'hand-over', targets, body: kind === 'command' ? null : b.body,
      by: String(b.by || 'claude').slice(0, 80), note: String(b.note || '').slice(0, 200), lanes, state: 'waiting', at: t, after: Number(b.after) || 0,
      timeoutMs: Math.max(60000, Math.min(4 * 3600e3, Number(b.timeoutMs) || AQD.timeoutMs)) };
    d.items.push(it); save(); log(`autoqueue: + ${it.id} [${lanes.join(',')}] ${it.cmd} (${it.by})`);
    return { ok: true, item: it, position: d.items.filter(i => i.state === 'waiting' && i.lanes.some(l => lanes.includes(l))).length };
  }
  /** the owner sent an order (any /api/command not from this queue): its lanes pause until it is finished */
  function noteOwner(o) {
    const d = load(), t = now(), names = [...new Set(o.names || [])];
    const lanes = o.lanes && o.lanes.length ? o.lanes : [...new Set(names.map(n => ctx.laneOf(n) || n))];
    if (!lanes.length) return null;
    const rec = { orderIds: [...new Set(o.orderIds || [])], names, lanes, cmd: String(o.cmd || '').slice(0, 120), at: t, over: !(o.orderIds || []).length };
    if (rec.over) rec.endedAt = t;                                          // no durable order (an L2Swarm '/' command, a dry run): nothing to wait for
    d.owner.push(rec);
    d.items.filter(i => i.state === 'running' && i.lanes.some(l => lanes.includes(l))).forEach(i => { i.ownerAfter = t; });
    save(); log(`autoqueue: owner order ${rec.cmd} [${lanes.join(',')}]${rec.over ? '' : ' - lanes paused until it is done'}`);
    return rec;
  }
  const ordersOver = (ids, names) => ids.every(id => { const st = ctx.orderStatus(id, names) || []; return st.length > 0 && st.every(r => TERMINAL.has(r.state) || r.state === 'unknown'); });
  const ownerBusy = (lane) => load().owner.some(o => !o.over && o.lanes.includes(lane));
  function action(b) {
    const d = load(), a = String(b.action || '');
    if (a === 'clear') { const lane = b.lane ? String(b.lane) : null; let n = 0; d.items.forEach(i => { if (i.state === 'waiting' && (!lane || i.lanes.includes(lane))) { i.state = 'cancelled'; i.why = 'queue cleared by you'; i.endedAt = now(); n++; } }); save(); log(`autoqueue: clear ${lane || 'all'} (${n})`); return { ok: true, cleared: n }; }
    const it = d.items.find(i => i.id === String(b.id || '')); if (!it) return { error: 'no such queue item' };
    if (a === 'cancel') { if (!OPEN.has(it.state)) return { error: 'already ' + it.state }; it.state = 'cancelled'; it.why = it.startedAt ? 'cancelled by you (the order it sent keeps running; cancel that one on the Orders list)' : 'cancelled by you'; it.endedAt = now(); save(); log(`autoqueue: cancel ${it.id}`); return { ok: true, item: it }; }
    if (a === 'runnow') { if (it.state !== 'waiting') return { error: 'only a waiting item can run now' }; it.runNow = true; it.after = 0; d.items.splice(d.items.indexOf(it), 1); d.items.unshift(it); save(); log(`autoqueue: run now ${it.id}`); return { ok: true, item: it }; }
    return { error: 'action: cancel | runnow | clear' };
  }
  async function start(it) {
    const t = now(); it.state = 'running'; it.startedAt = t; it.orderIds = []; it.names = []; save();
    try {
      if (it.kind === 'command') {
        const r = await ctx.commandRun({ cmd: it.cmd, targets: it.targets, by: 'autoqueue: ' + it.by, confirmDanger: true });
        const body = (r && r.body) || {};
        if (!r || (r.code && r.code >= 400) || body.error) { finish(it, 'failed', 'not sent: ' + (body.error || 'no answer')); return; }
        (body.sends || []).forEach(s => { if (s.orderId) it.orderIds.push(s.orderId); (s.recipients || [s.to]).forEach(n => n && it.names.push(n)); });
        it.orderIds = [...new Set(it.orderIds)]; it.names = [...new Set(it.names)];
        it.sent = String(body.channelNote || body.out || '').slice(0, 200);
        if (!it.orderIds.length) finish(it, 'done', 'sent (no durable order to wait for)');
      } else if (it.kind === 'upgrade') {
        const j = await ctx.post('/api/upgrade/start', Object.assign({}, it.body, { by: 'autoqueue: ' + it.by }));
        if (!j || j.error || !j.started) { finish(it, 'failed', 'upgrade not started: ' + ((j && j.error) || 'no answer')); return; }
        it.jobIds = j.started.map(s => s.id).filter(Boolean);
        if (!it.jobIds.length) finish(it, 'failed', 'upgrade: nothing started');
      } else if (it.kind === 'make') {
        const j = await ctx.post('/api/upgrade/make/start', Object.assign({}, it.body, { by: 'autoqueue: ' + it.by }));
        if (!j || j.error || !j.id) { finish(it, 'failed', 'craft not started: ' + ((j && j.error) || 'no answer')); return; }
        it.jobIds = [j.id];
      } else {
        const j = await ctx.post('/api/trade/order', Object.assign({ confirm: true }, it.body));
        if (!j || j.error || !j.id) { finish(it, 'failed', 'hand-over not ordered: ' + ((j && j.error) || 'no answer')); return; }
        it.handoverId = j.id;
      }
      log(`autoqueue: > ${it.id} ${it.cmd} started (${(it.orderIds || []).join(',') || (it.jobIds || []).join(',') || it.handoverId || '-'})`);
    } catch (e) { finish(it, 'failed', 'error: ' + e.message); }
    save();
  }
  function finish(it, state, why) { it.state = state; it.why = String(why || '').slice(0, 240); it.endedAt = now(); log(`autoqueue: ${it.id} ${it.cmd} -> ${state}${why ? ' (' + why + ')' : ''}`); }
  function check(it) {
    const t = now();
    if (it.kind === 'command' && it.orderIds && it.orderIds.length) {
      const st = []; it.orderIds.forEach(id => (ctx.orderStatus(id, it.names) || []).forEach(r => st.push(r)));
      if (st.length && st.every(r => TERMINAL.has(r.state) || r.state === 'unknown')) {
        if (st.some(r => r.state === 'superseded')) finish(it, 'replaced', it.ownerAfter ? 'replaced by your order - not sent again' : 'replaced by a newer order - not sent again');
        else if (st.some(r => r.state === 'failed')) finish(it, 'failed', st.filter(r => r.state === 'failed').map(r => r.name + ': ' + (r.why || 'failed')).join('; '));
        else finish(it, 'done', st.map(r => r.name + ' ' + r.state).join(', ').slice(0, 200));
        return;
      }
    }
    if ((it.kind === 'upgrade' || it.kind === 'make') && it.jobIds) {
      const s = it.jobIds.map(id => ctx.itemJobState(id) || '');
      if (s.every(x => x === 'done' || x === 'failed')) { finish(it, s.includes('failed') ? 'failed' : 'done', 'item job(s) ' + s.join(', ')); return; }
    }
    if (it.kind === 'trade' && it.handoverId) {
      const s = ctx.handoverState(it.handoverId);
      if (s === 'done' || s === 'failed') { finish(it, s, 'hand-over ' + s); return; }
    }
    if (t - it.startedAt > it.timeoutMs) finish(it, 'timeout', `no end seen in ${Math.round(it.timeoutMs / 60000)} min - the next one goes`);
  }
  /** every ~3 s: owner orders that ended, running items that ended, then per lane the next waiting item */
  async function tick() {
    const d = load(), t = now(); let dirty = false;
    d.owner.filter(o => !o.over).forEach(o => { if (t - o.at > AQD.ownerMaxMs || ordersOver(o.orderIds, o.names)) { o.over = true; o.endedAt = t; dirty = true; log(`autoqueue: owner order ${o.cmd} finished - lanes ${o.lanes.join(',')} go on`); } });
    for (const it of d.items.filter(i => i.state === 'running')) { const was = it.state; check(it); if (it.state !== was) dirty = true; }
    const busy = new Set(); d.items.filter(i => i.state === 'running').forEach(i => i.lanes.forEach(l => busy.add(l)));
    if (busy.has('*')) { if (dirty) save(); return; }
    for (const it of d.items.filter(i => i.state === 'waiting')) {
      if (it.after && t < it.after) continue;
      if (it.lanes.includes('*') ? busy.size > 0 : it.lanes.some(l => busy.has(l))) { it.lanes.forEach(l => busy.add(l)); continue; }   // keeps the order inside a lane
      if (!it.runNow && it.lanes.some(l => ownerBusy(l) || (l === '*' && d.owner.some(o => !o.over)))) { it.lanes.forEach(l => busy.add(l)); continue; }
      it.lanes.forEach(l => busy.add(l));
      await start(it);
      if (it.lanes.includes('*')) break;
    }
    if (dirty) save();
  }
  function view() {
    const d = load(), lanes = {};
    d.items.forEach(i => i.lanes.forEach(l => { const L = lanes[l] = lanes[l] || { lane: l, waiting: 0, running: null, paused: false }; if (i.state === 'waiting') L.waiting++; if (i.state === 'running') L.running = { id: i.id, cmd: i.cmd, since: i.startedAt }; }));
    d.owner.filter(o => !o.over).forEach(o => o.lanes.forEach(l => { const L = lanes[l] = lanes[l] || { lane: l, waiting: 0, running: null, paused: false }; L.paused = true; L.owner = { cmd: o.cmd, since: o.at }; }));
    return { ok: true, items: d.items.slice().reverse(), owner: d.owner.slice().reverse().slice(0, 30), lanes: Object.values(lanes) };
  }
  return { enqueue, noteOwner, action, tick, view, lanesOfTargets, _data: () => load() };
}
module.exports = { create, AQD, TERMINAL };
