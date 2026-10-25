// AUTOFUND / ADENA SHARE (owner 2026-10-22: "I keep clicking Resupply but the dwarfs is not getting adena OR buying gear, they keep dying" -> "Both":
// a one-time hand-out now + an automatic share from then on). The fund round (swarm.js) only works when a rich giver and a broke character stand idle
// in Giran at the same moment, and a running hunt timer holds it: the poor Flyt dwarves (Spoiler8 55k, Spoiler14 124k ...) never got a coin while
// Spoiler16 / Spoiler7 / Spoiler11 carried 7-9M. This job closes the gap with the Trade page's hand-over orders (the giver goes to the receiver):
//   every 3 min (server.js): a character in the SCOPE that is online, alive and below `below` adena gets `give` adena from the richest character of the
//   scope that keeps at least `keep` after giving, is online + alive, not in a live raid party and not already giving / receiving in an open order.
//   One new order per tick, one open order per giver / receiver, the same receiver again only after `againMin`. POST /api/trade/order (same checks,
//   same files, same "!handover <id>" as the Trade page). Log: Logs/autofund.log, memory: Logs/autofund.json.
// Settings: Scripts/data/fund_rules.json "share" { on, scope: 'academy' (accounts with clanAcademy) | 'all', names: [], below, give, keep, againMin }.
// Missing / on:false = nothing happens (the public package ships it off).
'use strict';
const fs = require('fs'), path = require('path');
const DEF = { on: false, scope: 'academy', names: [], below: 500000, give: 1500000, keep: 3000000, againMin: 360 };
function readJson(f, d) { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch (e) { return d; } }
function shareCfg(DATA) { const j = readJson(path.join(DATA, 'fund_rules.json'), {}) || {}; const s = j.share && typeof j.share === 'object' ? j.share : {}; return Object.assign({}, DEF, s, { names: Array.isArray(s.names) ? s.names.map(String) : [] }); }
function scopeNames(cfg, swarmCfg) {
  if (cfg.names.length) return new Set(cfg.names);
  const acc = (swarmCfg && Array.isArray(swarmCfg.accounts)) ? swarmCfg.accounts : [];
  return new Set(acc.filter(a => a && a.character && (cfg.scope === 'all' || a.clanAcademy || a.academy || a.academyMage)).map(a => String(a.character)));
}
/** pure: states [{ name, adena, ageSec, dead, party }], busy Set (names in an open order), raidParties Set, memory { recv: { name: ms } } -> { give: { giver, receiver, amount } | null, why } */
function decide(cfg, scope, states, busy, raidParties, mem, nowMs, mayGive) {
  // never in the middle of a supply run / regroup / trade / hand-over (2026-10-22: a hand-over interrupted Spoiler10's supply run - no gear bought)
  const live = states.filter(s => s && scope.has(s.name) && Number(s.ageSec) <= 60 && !s.dead && !/supply|regroup|trade|handover|gear|order/i.test(s.task || ''));
  const recv = live.filter(s => Number(s.adena) < cfg.below && !busy.has(s.name) && nowMs - ((mem.recv || {})[s.name] || 0) > cfg.againMin * 60000)
    .sort((a, b) => Number(a.adena) - Number(b.adena));
  if (!recv.length) return { give: null, why: 'nobody below ' + cfg.below + ' adena (or all were helped lately)' };
  // FUNDCOLLECTOR-2026-10-25 (owner: "not auto selected ... only the collector role should hand them out, or selectable"): with a giver rule
  // (mayGive) the giver comes from ALL characters the rule allows (the collector is not in the academy scope); without one: the old richest-in-scope
  const pool = mayGive ? states.filter(s => s && Number(s.ageSec) <= 60 && !s.dead && !/supply|regroup|trade|handover|gear|order/i.test(s.task || '') && mayGive(s.name)) : live;
  const givers = pool.filter(s => !busy.has(s.name) && !raidParties.has(s.party || s.name) && Number(s.adena) - cfg.give >= cfg.keep)
    .sort((a, b) => Number(b.adena) - Number(a.adena));
  for (const r of recv) { const g = givers.find(x => x.name !== r.name); if (g) return { give: { giver: g.name, receiver: r.name, amount: cfg.give }, why: `${r.name} has ${r.adena}, ${g.name} has ${g.adena}` }; }
  return { give: null, why: 'nobody rich enough is free (keeps ' + cfg.keep + ' after giving)' };
}
const RUN = { busy: false };
async function tick(ctx) {
  if (RUN.busy) return; RUN.busy = true;
  try {
    try { await depositTick(ctx); } catch (e) { }   // FUNDCOLLECTOR: surplus to the collector (own switch)
    const cfg = shareCfg(ctx.DATA); if (!cfg.on) return;
    const scope = scopeNames(cfg, ctx.swarmCfg ? ctx.swarmCfg() : null); if (!scope.size) return;
    const states = (ctx.readStates ? ctx.readStates() : []).map(s => ({ name: s.name, adena: Number(s.adena) || 0, ageSec: Number(s.ageSec), dead: !!s.dead, party: s.party || s.leader || s.name, task: String(s.task || '') }));
    // open orders (the Trade page list): givers + receivers that are still busy
    const busy = new Set();
    try { (ctx.recentOrders ? ctx.recentOrders() : []).forEach(o => { if (!o.over) { busy.add(o.receiver); (o.givers || []).forEach(g => busy.add(g)); } }); } catch (e) { }
    // live raid / Kamaloka parties never give (their leader writes Logs/raid_live_<leader>.json every few s)
    const raidParties = new Set();
    try { fs.readdirSync(ctx.LOGS).filter(f => /^(raid|kamaloka|epic)_live_.+\.json$/.test(f)).forEach(f => { const st = fs.statSync(path.join(ctx.LOGS, f)); if (Date.now() - st.mtimeMs < 120000) raidParties.add(f.replace(/^(raid|kamaloka|epic)_live_/, '').replace(/\.json$/, '')); }); } catch (e) { }
    const memF = path.join(ctx.LOGS, 'autofund.json'), mem = readJson(memF, {}) || {}; mem.recv = mem.recv || {};
    const d = decide(cfg, scope, states, busy, raidParties, mem, Date.now(), giverRule(ctx));
    if (!d.give) return;
    const g = d.give;
    // FUNDCOLLECTOR-2026-10-25: with a giver rule (the collector / picked characters) the hand-over waits until both stand in the same town
    // (sameTown: the giver parks it) - nobody travels to deliver adena (owner: "I don't want any to go back to town and deliver adena")
    const r = await ctx.post('/api/trade/order', { receiver: g.receiver, sel: {}, adena: { [g.giver]: g.amount }, confirm: true, sameTown: !!giverRule(ctx), note: `adena share (automatic): ${d.why}` });
    const line = `${new Date().toISOString()} ${g.giver} -> ${g.receiver} ${g.amount} adena: ${r && r.ok ? 'order ' + r.id + ' sent' : 'NOT sent - ' + ((r && r.error) || 'no answer')} (${d.why})`;
    try { fs.appendFileSync(path.join(ctx.LOGS, 'autofund.log'), line + '\r\n'); } catch (e) { }
    if (r && r.ok) { mem.recv[g.receiver] = Date.now(); try { fs.writeFileSync(memF, JSON.stringify(mem, null, 1)); } catch (e) { } }
  } catch (e) { } finally { RUN.busy = false; }
}
// DEPOSIT (FUNDCOLLECTOR-2026-10-25, owner: "the teams hand over adena to the collector if they have over 10-20 million or depending on how much
// adena they need to hunt for a while"): fund_rules.json deposit = { on, above, keep, againMin } (+ parties.<leader>.deposit { above, keep }):
// a character (never the collector) with more than `above` gets ONE same-town hand-over order of everything above `keep` to the collector; it
// hands it over the next time it stands idle in the collector's town (no trip for it). One new order per tick; the same character again after againMin.
const DEP_DEF = { on: false, above: 20000000, keep: 10000000, againMin: 120 };
function depositDecide(dep, states, collector, busy, partyDep, mem, nowMs) {
  if (!dep.on || !collector) return null;
  for (const s of states.slice().sort((a, b) => Number(b.adena) - Number(a.adena))) {
    if (!s || s.name === collector || s.dead || Number(s.ageSec) > 60 || busy.has(s.name)) continue;
    const pd = (partyDep && partyDep[s.party || s.name]) || {}, above = Number(pd.above != null ? pd.above : dep.above), keep = Number(pd.keep != null ? pd.keep : dep.keep);
    if (!(above > 0) || Number(s.adena) <= above || nowMs - ((mem.dep || {})[s.name] || 0) < dep.againMin * 60000) continue;
    const amount = Math.floor(Number(s.adena) - Math.max(0, keep)); if (amount < 1000000) continue;
    return { giver: s.name, amount, why: `${s.name} has ${s.adena}, keeps ${keep} (above ${above})` };
  }
  return null;
}
async function depositTick(ctx) {
  const r = readJson(path.join(ctx.DATA, 'fund_rules.json'), {}) || {}, dep = Object.assign({}, DEP_DEF, r.deposit || {});
  if (!dep.on) return;
  const c = (readJson(path.join(ctx.DATA, 'stash_rules.json'), {}) || {}).collector, cq = readJson(path.join(ctx.DATA, 'clan_quests.json'), {}) || {};
  const col = c && c.on === true ? String(c.name || (cq.clan && cq.clan.leader) || '') : ''; if (!col) return;
  const states = (ctx.readStates ? ctx.readStates() : []).map(s => ({ name: s.name, adena: Number(s.adena) || 0, ageSec: Number(s.ageSec), dead: !!s.dead, party: s.party || s.leader || s.name }));
  const busy = new Set(); try { (ctx.recentOrders ? ctx.recentOrders() : []).forEach(o => { if (!o.over) { busy.add(o.receiver); (o.givers || []).forEach(g => busy.add(g)); } }); } catch (e) { }
  const partyDep = {}; Object.entries(r.parties || {}).forEach(([k, v]) => { if (v && v.deposit) partyDep[k] = v.deposit; });
  const memF = path.join(ctx.LOGS, 'autofund.json'), mem = readJson(memF, {}) || {}; mem.dep = mem.dep || {};
  const d = depositDecide(dep, states, col, busy, partyDep, mem, Date.now()); if (!d) return;
  const o = await ctx.post('/api/trade/order', { receiver: col, sel: {}, adena: { [d.giver]: d.amount }, confirm: true, sameTown: true, note: `adena to the collector (automatic): ${d.why}` });
  try { fs.appendFileSync(path.join(ctx.LOGS, 'autofund.log'), `${new Date().toISOString()} DEPOSIT ${d.giver} -> ${col} ${d.amount} adena: ${o && o.ok ? 'order ' + o.id + ' sent (same town)' : 'NOT sent - ' + ((o && o.error) || 'no answer')} (${d.why})\r\n`); } catch (e) { }
  if (o && o.ok) { mem.dep[d.giver] = Date.now(); try { fs.writeFileSync(memF, JSON.stringify(mem, null, 1)); } catch (e) { } }
}
/** the giver rule of fund_rules.json givers (Adena page): collector (default) | list | none | auto (old: null = richest in scope) */
function giverRule(ctx) {
  const r = readJson(path.join(ctx.DATA, 'fund_rules.json'), {}) || {}, g = r.givers || {}, mode = ['auto', 'list', 'none', 'collector'].includes(g.mode) ? g.mode : 'collector';
  if (mode === 'auto') return null;
  if (mode === 'none') return () => false;
  if (mode === 'list') { const L = new Set((g.list || []).map(String)); return (n) => L.has(n); }
  const c = (readJson(path.join(ctx.DATA, 'stash_rules.json'), {}) || {}).collector, cq = readJson(path.join(ctx.DATA, 'clan_quests.json'), {}) || {};
  const col = c && c.on === true ? String(c.name || (cq.clan && cq.clan.leader) || '') : '';
  return (n) => !!col && n === col;
}
module.exports = { tick, decide, shareCfg, scopeNames, giverRule, depositDecide, DEP_DEF, DEF };
