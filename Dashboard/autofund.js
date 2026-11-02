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
// IDLEGIVER-2026-11-02: "waiting for orders" is IDLE, not busy - the old /order/ match kept the parked bank (Crafter1, 343M) from ever giving,
// and no academy character got adena for the level-20 kit (885-8,500 adena, the kit ~25,000)
function busyTask(t) { t = String(t || ''); return /supply|regroup|trade|handover|gear|order/i.test(t.replace(/waiting for orders[^|]*/i, '')); }
function decide(cfg, scope, states, busy, raidParties, mem, nowMs, mayGive) {
  // never in the middle of a supply run / regroup / trade / hand-over (2026-10-22: a hand-over interrupted Spoiler10's supply run - no gear bought)
  const live = states.filter(s => s && scope.has(s.name) && Number(s.ageSec) <= 60 && !s.dead && !busyTask(s.task));
  const recv = live.filter(s => Number(s.adena) < cfg.below && !busy.has(s.name) && nowMs - ((mem.recv || {})[s.name] || 0) > cfg.againMin * 60000)
    .sort((a, b) => Number(a.adena) - Number(b.adena));
  if (!recv.length) return { give: null, why: 'nobody below ' + cfg.below + ' adena (or all were helped lately)' };
  // FUNDCOLLECTOR-2026-10-25 (owner: "not auto selected ... only the collector role should hand them out, or selectable"): with a giver rule
  // (mayGive) the giver comes from ALL characters the rule allows (the collector is not in the academy scope); without one: the old richest-in-scope
  const pool = mayGive ? states.filter(s => s && Number(s.ageSec) <= 60 && !s.dead && !busyTask(s.task) && mayGive(s.name)) : live;
  const givers = pool.filter(s => !busy.has(s.name) && !raidParties.has(s.party || s.name) && Number(s.adena) - cfg.give >= cfg.keep)
    .sort((a, b) => Number(b.adena) - Number(a.adena));
  for (const r of recv) { const g = givers.find(x => x.name !== r.name); if (g) return { give: { giver: g.name, receiver: r.name, amount: cfg.give }, why: `${r.name} has ${r.adena}, ${g.name} has ${g.adena}` }; }
  return { give: null, why: 'nobody rich enough is free (keeps ' + cfg.keep + ' after giving)' };
}
// ACADFUND-2026-10-31: the receiver of an open SAME-TOWN order is not busy - it only waits for the giver's next town visit (days). Two pending
// deposits to Dagger1 (10-27, 10-30) kept the collector "busy" and no academy character got its start adena.
function busyFromOrders(orders) {
  const busy = new Set();
  // SAMETOWNGIVER-2026-11-02: a same-town order only waits for the receiver's town visit (hours) - its giver (the bank) stays free to pay others
  // (one open order to an academy character out in the field blocked every academy payment: Nuker34 at 2,979 adena could not buy the kit)
  (orders || []).forEach(o => { if (!o || o.over || o.sameTown) return; busy.add(o.receiver); (o.givers || []).forEach(g => busy.add(g)); });
  return busy;
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
    let busy = new Set();
    try { busy = busyFromOrders(ctx.recentOrders ? ctx.recentOrders() : []); } catch (e) { }
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
// DEPOSITKEEP-2026-11-02 (tester: "I have it set to top a party leader up to 100m, and party leader should never give away if they are under
// 300m" - "one of my parties just gave 700m to the collector and kept 16m"): the deposit only looked at deposit.keep (default 10M) and ignored the
// Adena page's "Always keeps at least" (givers.keepAtLeast) and the character's own top-up target. Now it keeps the HIGHEST of: the deposit keep
// (party / global), "Always keeps at least", the character's top-up target (char > party > default; leader / member / clan leader), its gear need.
/** pure: what a depositor keeps. g = { keepAtLeast, targetOf(name) -> number } */
function depositKeep(keep, s, g) { g = g || {}; let t = 0; try { t = Number(g.targetOf ? g.targetOf(s.name, s.party) : 0) || 0; } catch (e) { } return Math.max(0, Number(keep) || 0, Number(g.keepAtLeast) || 0, t, Number(s.gearNeed) || 0); }
/** the top-up target the Adena page shows for a character (fund_rules chars / parties / defaults) */
function fundTargetOf(r, clanLeader) {
  const d = r.defaults || {}, P = r.parties || {}, C = r.chars || {}, has = v => v !== undefined && v !== null && v !== '' && isFinite(Number(v));
  return (name, party) => { const c = C[name] || {}; if (has(c.target)) return Number(c.target); if (clanLeader && name === clanLeader && has(d.clanLeaderTarget)) return Number(d.clanLeaderTarget);
    const p = P[party || name] || {}; if (name === (party || name)) return has(p.leaderTarget) ? Number(p.leaderTarget) : (has(d.leaderTarget) ? Number(d.leaderTarget) : 0);
    return has(p.memberTarget) ? Number(p.memberTarget) : (has(d.memberTarget) ? Number(d.memberTarget) : 0); };
}
function depositDecide(dep, states, collector, busy, partyDep, mem, nowMs, g) {
  if (!dep.on || !collector) return null;
  for (const s of states.slice().sort((a, b) => Number(b.adena) - Number(a.adena))) {
    if (!s || s.name === collector || s.dead || Number(s.ageSec) > 60 || busy.has(s.name)) continue;
    const pd = (partyDep && partyDep[s.party || s.name]) || {}, above = Number(pd.above != null ? pd.above : dep.above), keep = Number(pd.keep != null ? pd.keep : dep.keep);
    if (!(above > 0) || Number(s.adena) <= above || nowMs - ((mem.dep || {})[s.name] || 0) < dep.againMin * 60000) continue;
    // GEARKEEP-2026-10-30 (owner: "he should NOT hand over hes adena to dagger1!! Then he cant buy gear"): gear money stays. No deposit within
    // 12 h of a leader's gear payment (!purse), and never below what the character's gear plan still needs.
    if (s.pursePaidAt && nowMs - s.pursePaidAt < 12 * 3600000) continue;
    const kept = depositKeep(keep, s, g), amount = Math.floor(Number(s.adena) - kept); if (amount < 1000000) continue;
    return { giver: s.name, amount, why: `${s.name} has ${s.adena}, keeps ${kept} (above ${above})` };
  }
  return null;
}
/** GEARKEEP: when each character last got gear money from its leader (Logs/purse.log "X paid <Name> N for gear") */
function purseTimes(ctx) {
  const out = {}; let txt = ''; try { const fd = fs.openSync(path.join(ctx.LOGS, 'purse.log'), 'r'), st = fs.fstatSync(fd), n = Math.min(st.size, 200000), b = Buffer.alloc(n); fs.readSync(fd, b, 0, n, st.size - n); fs.closeSync(fd); txt = b.toString('utf8'); } catch (e) { return out; }
  txt.split(/\r?\n/).forEach(l => { const m = l.match(/^(\S+Z) \[[^\]]+\] .* paid (\S+) [\d,]+ for gear/); if (m) { const at = Date.parse(m[1]); if (at > (out[m[2]] || 0)) out[m[2]] = at; } });
  return out;
}
/** GEARKEEP: adena the character's gear plan (Logs/gear_plan_<Name>.json, < 24 h old) still needs: its own "all N planned pieces: X" + 300k supplies */
function gearNeed(ctx, name) {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(ctx.LOGS, 'gear_plan_' + name + '.json'), 'utf8').replace(/^﻿/, ''));
    if (!(Date.now() - Date.parse(j.at) < 24 * 3600000)) return 0;
    const m = String(j.why || '').match(/all \d+ planned pieces: ([\d,]+)/); if (m) return Number(m[1].replace(/,/g, '')) + 300000;
    let c = 0; (j.planned || []).forEach(r => { if (r.status !== 'buy') return; const x = String(r.detail || '').match(/ (\d+) at /); if (x) c += Number(x[1]) * (r.slot === 'earring' || r.slot === 'ring' ? 2 : 1); });
    return c ? c + 300000 : 0;
  } catch (e) { return 0; }
}
async function depositTick(ctx) {
  const r = readJson(path.join(ctx.DATA, 'fund_rules.json'), {}) || {}, dep = Object.assign({}, DEP_DEF, r.deposit || {});
  if (!dep.on) return;
  const c = (readJson(path.join(ctx.DATA, 'stash_rules.json'), {}) || {}).collector, cq = readJson(path.join(ctx.DATA, 'clan_quests.json'), {}) || {};
  const col = c && c.on === true ? String(c.name || (cq.clan && cq.clan.leader) || '') : ''; if (!col) return;
  const states = (ctx.readStates ? ctx.readStates() : []).map(s => ({ name: s.name, adena: Number(s.adena) || 0, ageSec: Number(s.ageSec), dead: !!s.dead, party: s.party || s.leader || s.name }));
  const purseAt = purseTimes(ctx); states.forEach(s => { s.pursePaidAt = purseAt[s.name] || 0; s.gearNeed = gearNeed(ctx, s.name); });
  const busy = new Set(); try { (ctx.recentOrders ? ctx.recentOrders() : []).forEach(o => { if (!o.over) { busy.add(o.receiver); (o.givers || []).forEach(g => busy.add(g)); } }); } catch (e) { }
  const partyDep = {}; Object.entries(r.parties || {}).forEach(([k, v]) => { if (v && v.deposit) partyDep[k] = v.deposit; });
  const memF = path.join(ctx.LOGS, 'autofund.json'), mem = readJson(memF, {}) || {}; mem.dep = mem.dep || {};
  const keepG = { keepAtLeast: Number((r.givers || {}).keepAtLeast) || 0, targetOf: fundTargetOf(r, String((cq.clan && cq.clan.leader) || '')) };   // DEPOSITKEEP
  const d = depositDecide(dep, states, col, busy, partyDep, mem, Date.now(), keepG); if (!d) return;
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
module.exports = { tick, decide, busyTask, busyFromOrders, shareCfg, scopeNames, giverRule, depositDecide, depositKeep, fundTargetOf, DEP_DEF, DEF };
