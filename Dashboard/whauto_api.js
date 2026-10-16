// WHAUTO-2026-10-16 (owner: "when in storage I need to be able to select which should be crystallized and which should be sold by default. Like then
// collector will run around and sell and take out items for dwarfs to disenchant"). A DEFAULT action per item kind of the CLAN WAREHOUSE:
// 'sell' or 'cry' (crystallize). With the switch on, the dashboard server (tick below, every minute) looks at the clan warehouse as the clan leader
// last saw it (Logs/clan_state.json) and, while the collector / clan leader stands idle in Giran, sends the SAME orders as the Storage page buttons:
//   sell -> Logs/whsell_order.json + "!whsell order" to the clan leader (takes them out, sells them at the grocer)        = "Take out and sell"
//   cry  -> crafter_api.cwhCryOrder (crystallize_queue.json + "!whtake ... clan <crafter>"): the clan leader takes them out, trades them to the
//           crafter, the crafter crystallizes exactly those kinds                                                           = "Take out and crystallize"
// One order per round, then it waits until the warehouse was seen again (a kind is never ordered twice for the same warehouse look) and the
// interval (everyMin, default 30) passed. Enchanted pieces are never touched. Nothing happens while the switch is off (default).
// File: Scripts/data/wh_auto.json { v, on, crafter ('' = the first crafter the crafter page knows), everyMin, items: { "<id>": { act, name } } }
// State: Logs/whauto_state.json { lastAt, lastSeen, ordered: { "<id>": seenAt }, last }, log Logs/whauto.log.
//   GET  /api/whauto                      -> { data, status, crafters }
//   POST /api/whauto { set: [{ id, act: 'sell'|'cry'|null, name }] }  |  { on, crafter, everyMin }  |  { runNow: true }
// Test: docs/plan/tools/test_whauto.js
'use strict';
const fs = require('fs'), path = require('path');
const NAME_RE = /^[A-Za-z0-9_.-]{1,40}$/;
const ACTS = ['sell', 'cry'];
const obj = (x) => x && typeof x === 'object' && !Array.isArray(x) ? x : {};
const fileOf = (ctx) => process.env.SWARM_WHAUTO_FILE || path.join(ctx.DATA, 'wh_auto.json');
const stateOf = (ctx) => process.env.SWARM_WHAUTO_STATE || path.join(ctx.LOGS, 'whauto_state.json');
const GIRAN = { x0: 76000, x1: 89000, y0: 140000, y1: 152500 };

// ---- pure ------------------------------------------------------------------------------------------------------------------------------------
function norm(j) {
  const o = obj(j), items = {};
  Object.keys(obj(o.items)).forEach(k => { const v = obj(o.items[k]), id = Number(k); if (Number.isInteger(id) && id > 0 && ACTS.includes(v.act)) items[id] = { act: v.act, name: String(v.name || '').slice(0, 80) }; });
  const every = Math.round(Number(o.everyMin));
  return { v: 1, on: o.on === true, crafter: NAME_RE.test(String(o.crafter || '')) ? String(o.crafter) : '', everyMin: every >= 10 && every <= 1440 ? every : 30, items };
}
/** apply a POST body to the settings -> { data } | { error } */
function applyChange(D, b) {
  const d = norm(D);
  if (Array.isArray(b.set)) {
    if (b.set.length > 400) return { error: 'at most 400 kinds at once' };
    for (const s of b.set) {
      const id = Number(s && s.id); if (!Number.isInteger(id) || id <= 0) return { error: 'bad item id' };
      if (s.act === null || s.act === '' || s.act === 'none') delete d.items[id];
      else if (ACTS.includes(s.act)) d.items[id] = { act: s.act, name: String(s.name || (d.items[id] || {}).name || '').slice(0, 80) };
      else return { error: 'act must be sell, cry or none' };
    }
  }
  if (typeof b.on === 'boolean') d.on = b.on;
  if (b.crafter !== undefined) { const c = String(b.crafter || ''); if (c && !NAME_RE.test(c)) return { error: 'crafter?' }; d.crafter = c; }
  if (b.everyMin !== undefined) { const e = Math.round(Number(b.everyMin)); if (!(e >= 10 && e <= 1440)) return { error: 'every 10 - 1440 minutes' }; d.everyMin = e; }
  return { data: d };
}
/** what to order now -> { act: 'sell'|'cry'|'', items: [{ id, count, name }], why }
 *  wh = { seenAt, items: [{ id, name, count, enchant }] }, st = { lastAt, ordered: { id: seenAt } }, who = { ok, why } (the clan leader idle in Giran) */
function decide(D, wh, st, who, nowMs) {
  const d = norm(D), S = obj(st);
  if (!d.on) return { act: '', items: [], why: 'switched off' };
  if (!Object.keys(d.items).length) return { act: '', items: [], why: 'no item has a default yet' };
  if (!wh || !Array.isArray(wh.items)) return { act: '', items: [], why: 'the clan warehouse was never looked at' };
  if (nowMs - (Number(S.lastAt) || 0) < d.everyMin * 60000) return { act: '', items: [], why: `waits (every ${d.everyMin} min)` };
  if (!who || !who.ok) return { act: '', items: [], why: (who && who.why) || 'the collector is busy' };
  const seen = String(wh.seenAt || ''), done = obj(S.ordered), by = {};
  wh.items.forEach(i => {
    const id = Number(i.id); if (!id || (Number(i.enchant) || 0) > 0) return;                // never an enchanted piece
    const r = d.items[id]; if (!r) return;
    if (done[id] && done[id] === seen) return;                                                // ordered for this warehouse look already
    const k = by[id] = by[id] || { id, count: 0, name: String(i.name || r.name || 'item ' + id), act: r.act };
    k.count += Math.max(1, Number(i.count) || 1);
  });
  const all = Object.keys(by).map(k => by[k]);
  for (const act of ['sell', 'cry']) {
    const L = all.filter(x => x.act === act).sort((a, b) => a.name.localeCompare(b.name)).slice(0, 40);
    if (L.length) return { act, items: L.map(x => ({ id: x.id, count: x.count, name: x.name })), why: `${L.length} kind${L.length === 1 ? '' : 's'} to ${act === 'sell' ? 'sell' : 'crystallize'}` };
  }
  return { act: '', items: [], why: 'nothing with a default is in the clan warehouse (as last seen)' };
}
/** is the clan leader / collector free? s = his swarm_state, coll = stash_rules collector */
function collectorFree(s, coll, nowMs) {
  if (!s) return { ok: false, why: 'the clan leader is not known / no state' };
  const age = nowMs - (Date.parse(s.updated || '') || 0);
  if (age > 180000) return { ok: false, why: `${s.name} is offline (state ${Math.round(age / 60000)} min old)` };
  if (s.dead) return { ok: false, why: `${s.name} is dead` };
  if (coll && coll.on === false) return { ok: false, why: 'the collector is switched off (Storage page -> Collector)' };
  if (String(s.mode || '') !== 'idle') return { ok: false, why: `${s.name} is busy (${s.mode || '?'})` };
  if (/whsell|whtake|crystalli|hand.?over|trade|supply|stash/i.test(String(s.task || ''))) return { ok: false, why: `${s.name} is busy: ${String(s.task).slice(0, 60)}` };
  const x = Number(s.x), y = Number(s.y);
  if (!(x >= GIRAN.x0 && x <= GIRAN.x1 && y >= GIRAN.y0 && y <= GIRAN.y1)) return { ok: false, why: `${s.name} is not in Giran` };
  return { ok: true, why: '' };
}

// ---- host ------------------------------------------------------------------------------------------------------------------------------------
function readJ(f, def) { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch (e) { return def; } }
function writeJ(f, j) { fs.mkdirSync(path.dirname(f), { recursive: true }); const t = f + '.tmp'; fs.writeFileSync(t, JSON.stringify(j, null, 1)); fs.renameSync(t, f); }
const log = (ctx, t) => { try { fs.appendFileSync(path.join(ctx.LOGS, 'whauto.log'), `${new Date().toISOString()}\t${t}\r\n`); } catch (e) { } };
function crafterApi() { return require('./crafter_api'); }
function clanLeaderOf(ctx) { try { return crafterApi().info(ctx).clanLeader || ''; } catch (e) { return ''; } }
function crafterNames(ctx) { try { return (crafterApi().info(ctx).crafters || []).map(c => c.name); } catch (e) { return []; } }
function collector(ctx) {
  const rules = readJ(path.join(ctx.DATA, 'stash_rules.json'), {}), c = obj(rules.collector);
  const name = String(c.name || clanLeaderOf(ctx) || '');
  return { name, cfg: c, clanLeader: clanLeaderOf(ctx) };
}
function stateFor(ctx, name) {
  let L = []; try { L = (ctx.readStates && ctx.readStates()) || []; } catch (e) { }
  return L.find(s => s && s.name === name) || readJ(path.join(ctx.LOGS, `swarm_state_${name}.json`), null);
}
let busy = false;
async function tick(ctx, force) {
  if (busy) return { act: '', why: 'busy' };
  busy = true;
  try {
    const D = norm(readJ(fileOf(ctx), {})), S = readJ(stateOf(ctx), {}) || {};
    const wh = (readJ(path.join(ctx.LOGS, 'clan_state.json'), {}) || {}).warehouse || null;
    const C = collector(ctx), CL = C.clanLeader;
    let who;
    if (!CL) who = { ok: false, why: 'no clan leader known (only he can take items out of the clan warehouse)' };
    else if (C.name && C.name !== CL) who = { ok: false, why: `the collector (${C.name}) is not the clan leader (${CL}): only the clan leader can take items out` };
    else who = collectorFree(stateFor(ctx, CL), C.cfg, Date.now());
    const st = force ? Object.assign({}, S, { lastAt: 0 }) : S;
    const dec = decide(D, wh, st, who, Date.now());
    S.check = { at: new Date().toISOString(), why: dec.why };
    if (!dec.act) { writeJ(stateOf(ctx), S); return dec; }
    let sent = null, err = '';
    if (dec.act === 'sell') {
      const F = process.env.SWARM_WHSELL_FILE || path.join(ctx.LOGS, 'whsell_order.json');
      writeJ(F, { items: dec.items.map(i => ({ id: i.id, count: 'all' })), sell: true, at: new Date().toISOString(), by: 'whauto' });
      if (!ctx.commandRun) err = 'the dashboard server has no command runner';
      else { const r = await ctx.commandRun({ cmd: '!whsell order', targets: ['chars:' + CL] }); sent = r && r.body ? r.body : r; if (sent && sent.error) err = String(sent.error); }
    } else {
      const names = crafterNames(ctx), crafter = D.crafter && names.includes(D.crafter) ? D.crafter : names[0];
      if (!crafter) err = 'no crafter with the Crystallize skill is known';
      else { const r = await crafterApi().cwhCryOrder(ctx, { crafter, items: dec.items, confirm: true }); if (r && r.error) err = r.error; else sent = r; dec.crafter = crafter; }
    }
    if (err) { S.last = { at: new Date().toISOString(), act: dec.act, ok: false, msg: err }; S.lastAt = Date.now(); writeJ(stateOf(ctx), S); log(ctx, `FAILED ${dec.act}: ${err}`); return Object.assign(dec, { error: err }); }
    S.lastAt = Date.now(); S.ordered = obj(S.ordered);
    dec.items.forEach(i => { S.ordered[i.id] = String(wh.seenAt || ''); });
    const msg = `${dec.act === 'sell' ? CL + ' takes out and sells' : CL + ' takes out for ' + dec.crafter + ' to crystallize'} ${dec.items.length} kind${dec.items.length === 1 ? '' : 's'}: ${dec.items.slice(0, 8).map(i => i.name + (i.count > 1 ? ' x' + i.count : '')).join(', ')}${dec.items.length > 8 ? ' ...' : ''}`;
    S.last = { at: new Date().toISOString(), act: dec.act, ok: true, msg: msg.slice(0, 400) };
    writeJ(stateOf(ctx), S); log(ctx, msg);
    return Object.assign(dec, { ok: true, msg });
  } catch (e) { log(ctx, 'error: ' + e.message); return { act: '', error: e.message }; }
  finally { busy = false; }
}
async function handle(req, res, url, ctx) {
  if (url.pathname !== '/api/whauto') return false;
  if (!ctx.allowed(req, url)) { ctx.send(res, 401, 'text/plain; charset=utf-8', 'Access denied'); return true; }
  if (req.method === 'GET') {
    const D = norm(readJ(fileOf(ctx), {})), S = readJ(stateOf(ctx), {}) || {};
    ctx.json(res, 200, { data: D, status: { check: S.check || null, last: S.last || null, lastAt: S.lastAt || 0 }, crafters: crafterNames(ctx), clanLeader: clanLeaderOf(ctx) });
    return true;
  }
  if (req.method !== 'POST') { ctx.json(res, 405, { error: 'GET or POST' }); return true; }
  let b = {}; try { let t = ''; for await (const c of req) t += c; b = JSON.parse(t || '{}'); } catch (e) { ctx.json(res, 400, { error: 'bad JSON' }); return true; }
  if (b.runNow === true) { const r = await tick(ctx, true); ctx.json(res, 200, Object.assign({ ok: !r.error }, r)); return true; }
  const a = applyChange(readJ(fileOf(ctx), {}), b);
  if (a.error) { ctx.json(res, 400, { error: a.error }); return true; }
  a.data._about = 'Default actions for the clan warehouse (dashboard Storage page -> Clan warehouse). items.<id>.act = sell | cry. With on = true the collector (the clan leader) takes them out by itself while idle in Giran: sell = sells them, cry = trades them to the crafter, who crystallizes them. Enchanted pieces are never touched.';
  a.data._updated = new Date().toISOString();
  writeJ(fileOf(ctx), a.data);
  try { fs.appendFileSync(path.join(ctx.LOGS, 'dashboard_commands.log'), `${new Date().toISOString()}\twhauto\t${JSON.stringify(b).slice(0, 300)}\r\n`); } catch (e) { }
  ctx.json(res, 200, { ok: true, data: norm(a.data) }); return true;
}
module.exports = { handle, tick, norm, applyChange, decide, collectorFree, GIRAN };
