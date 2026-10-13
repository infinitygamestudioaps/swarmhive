// ORDERS VIEW API (2026-10-13, the durable order queue: Dashboard/orderqueue.js + the ORDERQ block in Scripts_dev/swarm.js)
//   /orders.js                      the page module (public, no secrets)
//   GET  /api/orders[?party=<leader>|char=<name>][&limit=n]   orders newest first with every recipient's state + pending per party
//   POST /api/orders { action: 'cancel', id, names? }          not-yet-run entries -> cancelled; a running one -> its window ends it
//   POST /api/orders { action: 'resend', id, confirmDanger? }  the same command to the same targets again (a NEW order id)
'use strict';
const path = require('path'), fs = require('fs');

async function handle(req, res, url, c) {
  if (url.pathname === '/orders.js') {
    res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(fs.readFileSync(path.join(c.DIR, 'orders.js')));
    return true;
  }
  if (url.pathname !== '/api/orders') return false;
  if (!c.allowed(req, url)) { c.send(res, 401, 'text/plain; charset=utf-8', 'Access denied'); return true; }
  const Q = c.ORDERQ;
  if (!Q || !Q.enabled()) { c.json(res, 200, { enabled: false, orders: [], pending: {} }); return true; }
  const chars = c.readStates(), partyOfName = {};
  chars.forEach(ch => { partyOfName[ch.name] = c.partyOf(ch); });
  if (req.method === 'POST') {
    const b = await c.body(req);
    const x = Q.find(String(b.id || ''));
    if (!x) { c.json(res, 404, { error: 'no such order' }); return true; }
    if (b.action === 'cancel') {
      const names = Array.isArray(b.names) && b.names.length ? b.names.map(String) : x.recipients || [];
      const done = Q.cancel(x.id, names, 'cancelled on the dashboard');
      c.json(res, 200, { ok: true, cancelled: done });
      return true;
    }
    if (b.action === 'resend') {
      const r = await c.commandRun({ cmd: x.cmd, targets: Array.isArray(x.targets) && x.targets.length ? x.targets : undefined, confirmDanger: b.confirmDanger === true });
      c.json(res, r.code || 200, r.body);
      return true;
    }
    c.json(res, 400, { error: 'action: cancel | resend' });
    return true;
  }
  const party = String(url.searchParams.get('party') || ''), one = String(url.searchParams.get('char') || '');
  const names = party ? new Set(chars.filter(ch => c.partyOf(ch) === party).map(ch => ch.name).concat([party])) : one ? new Set([one]) : null;
  const limit = Math.max(1, Math.min(200, Number(url.searchParams.get('limit')) || 40));
  const orders = Q.list(names ? { names } : null, limit);
  // pending per party (the party header line): orders with a recipient still waiting, newest first
  const pending = {};
  Q.list(null, 80).forEach(o => {
    o.recipients.forEach(r => {
      if (!r.pending) return;
      const p = partyOfName[r.name] || r.from || r.name;
      const list = pending[p] = pending[p] || [];
      let row = list.find(z => z.id === o.id);
      if (!row) { row = { id: o.id, cmd: o.cmd, at: o.at, until: o.until, waiting: [] }; list.push(row); }
      row.waiting.push({ name: r.name, state: r.state, why: r.why, down: !!r.waiting });
    });
  });
  c.json(res, 200, { enabled: true, now: Date.now(), orders, pending });
  return true;
}
module.exports = { handle };
