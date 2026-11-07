'use strict';
// SUBCLASS2-2026-11-04: a character's subclass adena ask (Logs/subclass_fund_<name>.json, written by swarm.js subclassRun) becomes a NORMAL
// adena trade order from the bank, exactly like autofund (POST /api/trade/order { receiver, sel: {}, adena: { [bank]: amount }, confirm, sameTown }).
// Why: the first version used the runner hand-over (crunOrder) - Crafter1 logged "gave 1 kind (81042600 adena)" and nothing arrived (live 11-04).
// One order per ask: the file is rewritten { state: 'sent', orderId } (or 'failed', why). Asks older than 20 min, bad names or amounts are ignored.
// Server.js runs tick() every 20 s.
const fs = require('fs'), path = require('path');
const NAME = /^[A-Za-z0-9_.-]{1,40}$/, MAX = 200000000, FRESH_MS = 20 * 60000;

/** pure: ask file -> { send: { receiver, giver, amount } } | { skip: why } */
function decide(a, nowMs) {
  if (!a || a.state !== 'ask') return { skip: 'not an open ask' };
  if (!NAME.test(String(a.name || '')) || !NAME.test(String(a.bank || ''))) return { skip: 'bad name' };
  if (a.name === a.bank) return { skip: 'the bank cannot pay itself' };
  const amount = Math.round(Number(a.amount) || 0);
  if (!(amount > 0) || amount > MAX) return { skip: `amount ${a.amount} out of range` };
  if (!(nowMs - Number(a.at) < FRESH_MS)) return { skip: 'ask too old' };
  return { send: { receiver: a.name, giver: a.bank, amount } };
}
const RUN = { busy: false };
async function tick(ctx) {
  if (RUN.busy) return; RUN.busy = true;
  try {
    let files = []; try { files = fs.readdirSync(ctx.LOGS).filter(f => /^subclass_fund_[A-Za-z0-9_.-]+\.json$/.test(f)); } catch (e) { }
    for (const f of files) {
      const F = path.join(ctx.LOGS, f); let a = null; try { a = JSON.parse(fs.readFileSync(F, 'utf8')); } catch (e) { continue; }
      const d = decide(a, Date.now());
      if (!d.send) continue;
      const r = await ctx.post('/api/trade/order', { receiver: d.send.receiver, sel: {}, adena: { [d.send.giver]: d.send.amount }, confirm: true, sameTown: true, note: `subclass for ${d.send.receiver} (owner order)` });
      const out = Object.assign({}, a, r && r.ok ? { state: 'sent', orderId: r.id, sentAt: Date.now() } : { state: 'failed', why: String((r && r.error) || 'no answer').slice(0, 200), sentAt: Date.now() });
      try { fs.writeFileSync(F, JSON.stringify(out)); } catch (e) { }
      try { fs.appendFileSync(path.join(ctx.LOGS, 'autofund.log'), `${new Date().toISOString()} subclass: ${d.send.giver} -> ${d.send.receiver} ${d.send.amount} adena: ${out.state === 'sent' ? 'order ' + out.orderId + ' sent' : 'NOT sent - ' + out.why}\r\n`); } catch (e) { }
    }
  } finally { RUN.busy = false; }
}
module.exports = { decide, tick, MAX, FRESH_MS };
