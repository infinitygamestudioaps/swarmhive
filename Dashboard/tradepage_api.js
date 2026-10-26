// TRADE / HAND-OVER API (user 2026-10-10: "I need some buttons so I can tell teams and characters to go to the clan leader OR a character
// of my own choice and trade everything we want to. I need to be able to select what should be traded easily."). Loaded by server.js
// (one hook, BEFORE the key check like buffpage_api.js). Public (no secrets): /tradepage.js, /tradepage.css, /tradelogic.js.
//   GET  /api/trade/info                  parties (leader + members, online, level, class, town), the clan leader (swarm.config.json
//                                         clanLeader / Logs/clan_state.json), presets (Scripts/data/trade_presets.json), the last orders
//   GET  /api/trade/bags?names=a,b        the givers' LIVE bags (MCP get_account_data inventory; fallback: the bot's own report
//                                         Logs/bag_<name>.json written by swarm.js every 2 min), categorised by Dashboard/tradelogic.js
//   POST /api/trade/plan    { receiver, sel, adena }                 dry run: exactly what each giver hands over (re-read bags)
//   POST /api/trade/order   { receiver, sel, adena, confirm: true }  writes Logs/handover/<id>.json and sends "!handover <id>" to every
//                                         giver + the receiver (command center commandRun, party chat / file channel)
//   POST /api/trade/stop    { id }        sends "!handover stop <id>" to the same characters
//   GET  /api/trade/status?id=<id>        the order + every giver's result file Logs/handover/<id>_<name>.json (+ the receiver's)
//   POST /api/trade/presets { action: 'save' | 'delete', preset | name }
// Every write: one line in Logs/dashboard_commands.log. SWARM_HANDOVER_DIR / SWARM_TRADEPRESETS_FILE override the folders (tests).
'use strict';
const fs = require('fs'), path = require('path');
const TL = require('./tradelogic');
const STATIC = { '/tradepage.js': 'application/javascript; charset=utf-8', '/tradepage.css': 'text/css; charset=utf-8', '/tradelogic.js': 'application/javascript; charset=utf-8' };
const DIR_OF = (ctx) => process.env.SWARM_HANDOVER_DIR || path.join(ctx.LOGS, 'handover');
const PRESETS_OF = (ctx) => process.env.SWARM_TRADEPRESETS_FILE || path.join(ctx.DATA, 'trade_presets.json');
const BAG_TTL = 15000;
const bagCache = {};                                   // name -> { at, bag }

let ITEMS = null, itemsStamp = '';
function tradeData(ctx) {
  const f = path.join(ctx.DATA, 'trade_items.json');
  let st = ''; try { st = String(fs.statSync(f).mtimeMs); } catch (e) { }
  if (!ITEMS || st !== itemsStamp) {
    ITEMS = ctx.readJson(f, null) || { notrade: [], cat: {} };
    try { ITEMS.questItems = JSON.parse(fs.readFileSync(path.join(ctx.DIR || __dirname, 'data', 'questitems.json'), 'utf8')); } catch (e) { ITEMS.questItems = []; }
    itemsStamp = st;
  }
  return ITEMS;
}
function cfgFresh(ctx) {
  try { return JSON.parse(fs.readFileSync(path.join(ctx.ROOT, 'swarm.config.json'), 'utf8').replace(/^﻿/, '')); } catch (e) { }
  try { return ctx.reloadCfg() || {}; } catch (e) { return {}; }
}
function clanLeader(ctx, cfg) {
  const cs = ctx.readJson(path.join(ctx.LOGS, 'clan_state.json'), null);
  const cq = ctx.readJson(path.join(ctx.DATA, 'clan_quests.json'), null);
  return (cq && cq.clan && cq.clan.leader) || (cfg && cfg.clanLeader) || (cs && cs.leader) || '';
}
function parties(ctx) { let K; try { K = require('./kamapage_api'); } catch (e) { K = require(path.join(ctx.ROOT, 'Dashboard', 'kamapage_api')); } return K.partyList(ctx); }
const TOWNS = { Giran: [83473, 148554], Gludin: [-80786, 150251], Gludio: [-12712, 122776], Dion: [15619, 143132], Oren: [82760, 53578], Aden: [147448, 25816],
  Hunters: [116589, 76268], Heine: [111381, 218981], Goddard: [147732, -56554], Rune: [43835, -47749], Schuttgart: [87126, -143520] };
function townNear(x, y) { let best = '', bd = 6000; Object.keys(TOWNS).forEach(t => { const d = Math.hypot(TOWNS[t][0] - x, TOWNS[t][1] - y); if (d < bd) { bd = d; best = t; } }); return best; }
function presetsRead(ctx) { const j = ctx.readJson(PRESETS_OF(ctx), null); return (j && Array.isArray(j.presets)) ? j.presets : []; }
function presetsWrite(ctx, list) {
  const F = PRESETS_OF(ctx), tmp = F + '.' + process.pid + '.tmp';
  fs.mkdirSync(path.dirname(F), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify({ _note: 'Trade page presets (Dashboard/tradepage.js, user 2026-10-10). receiver: @clanleader or a character name; cats: Dashboard/tradelogic.js TRADE_CATS keys; ids / exclude: item ids; names: name patterns; adena: amount per giver (0 = none).', presets: list }, null, 1));
  fs.renameSync(tmp, F);
}
const DEFAULT_PRESETS = [
  { name: 'Raid loot to clan leader', receiver: '@clanleader', cats: ['raid', 'recipe', 'enchant', 'lifestone'], ids: [], names: [], exclude: [], adena: 0, builtIn: true },
  { name: 'All materials + recipes to clan leader', receiver: '@clanleader', cats: ['raid', 'material', 'recipe'], ids: [], names: [], exclude: [], adena: 0, builtIn: true },
  { name: 'Old gear to clan leader', receiver: '@clanleader', cats: ['gear'], ids: [], names: [], exclude: [], adena: 0, builtIn: true },
];
function logLine(ctx, t) { try { fs.appendFileSync(path.join(ctx.LOGS, 'dashboard_commands.log'), `${new Date().toISOString()} ${t}\r\n`); } catch (e) { } }
function withTimeout(p, ms, what) { let t; return Promise.race([p, new Promise((_, rej) => { t = setTimeout(() => rej(new Error(`${what}: no answer in ${ms / 1000} s`)), ms); })]).finally(() => clearTimeout(t)); }

function info(ctx) {
  const cfg = cfgFresh(ctx), states = {}; (ctx.readStates() || []).forEach(s => { states[s.name] = s; });
  const CL = clanLeader(ctx, cfg);
  const P = parties(ctx).map(({ leader, names }) => ({ leader, members: names.map(n => {
    const s = states[n] || {}; const x = Number(s.x != null ? s.x : (s.pos && s.pos.x)), y = Number(s.y != null ? s.y : (s.pos && s.pos.y));
    return { name: n, online: s.ageSec != null && s.ageSec <= 90, level: s.level != null ? Number(s.level) : null, classId: s.classId != null ? Number(s.classId) : null,
      cls: s.cls || '', task: String(s.task || '').slice(0, 80), town: Number.isFinite(x) && Number.isFinite(y) ? townNear(x, y) : '', mode: s.mode || '' };
  }) }));
  // the clan leader may not be in any party listing (solo): add him
  if (CL && !P.some(p => p.members.some(m => m.name === CL))) P.push({ leader: CL, members: [{ name: CL, online: !!(states[CL] && states[CL].ageSec <= 90), level: states[CL] ? states[CL].level : null, classId: states[CL] ? states[CL].classId : null, cls: states[CL] ? states[CL].cls : '', task: '', town: '', mode: '' }] });
  const own = presetsRead(ctx), names = new Set(own.map(p => p.name));
  return { clanLeader: CL, parties: P, presets: own.concat(DEFAULT_PRESETS.filter(p => !names.has(p.name))), cats: TL.TRADE_CATS, quick: TL.QUICK, batch: TL.LIMITS.batch, orders: recentOrders(ctx, 8) };
}
function bagReport(ctx, name) {
  const f = path.join(ctx.LOGS, `bag_${name}.json`);
  const j = ctx.readJson(f, null); if (!j || !Array.isArray(j.items)) return null;
  let age = null; try { age = Math.round((Date.now() - (Date.parse(j.at) || fs.statSync(f).mtimeMs)) / 1000); } catch (e) { }
  return { items: j.items.map(i => ({ id: i.id, objId: i.objId, name: i.name, count: i.count, equipped: !!i.eq, quest: !!i.q, type: i.type || '' })), ageSec: age };
}
async function bagOf(ctx, name, fresh) {
  const c = bagCache[name];
  if (!fresh && c && Date.now() - c.at < BAG_TTL) return c.bag;
  let items = null, src = '', ageSec = 0, err = '';
  if (ctx.mcpCallChar) {
    try {
      const txt = await withTimeout(ctx.mcpCallChar('get_account_data', name, { type: 'inventory' }), 12000, 'MCP inventory');
      const j = JSON.parse(txt); const list = Array.isArray(j) ? j : (j.items || []);
      if (Array.isArray(list) && list.length) { items = list.map(i => ({ id: i.item_id, objId: i.obj_id, name: i.name, count: i.count, equipped: i.is_equipped, quest: i.is_quest, type: i.type, grade: i.grade, enchant: i.enchant_level })); src = 'live'; }
      else err = /No account matches/i.test(txt) ? 'not logged in' : 'MCP returned no items';
    } catch (e) { err = String(e.message || e).slice(0, 120); }
  }
  if (!items) { const r = bagReport(ctx, name); if (r) { items = r.items; src = 'report'; ageSec = r.ageSec; } }
  const D = tradeData(ctx);
  const bag = items ? Object.assign(TL.trBagRows(items, D), { ok: true, src, ageSec, err }) : { ok: false, rows: [], adena: 0, src: '', err: err || 'no bag known (MCP down and no Logs/bag_<name>.json yet)' };
  bagCache[name] = { at: Date.now(), bag };
  return bag;
}
async function bags(ctx, names, fresh) {
  const out = {}, list = [...new Set(names)].slice(0, TL.LIMITS.maxGivers);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(4, list.length) }, async () => { while (i < list.length) { const n = list[i++]; out[n] = await bagOf(ctx, n, fresh); } }));
  return out;
}
function knownNames(ctx) { const s = new Set(); parties(ctx).forEach(p => p.names.forEach(n => s.add(n))); const CL = clanLeader(ctx, cfgFresh(ctx)); if (CL) s.add(CL); return s; }
async function plan(ctx, b, fresh) {
  const known = knownNames(ctx), CL = clanLeader(ctx, cfgFresh(ctx));
  const receiver = TL.trReceiver(b.receiver, CL);
  if (!receiver) return { error: 'no receiver (and no clan leader known)' };
  if (!known.has(receiver)) return { error: `unknown receiver "${receiver}"` };
  const sel = b.sel && typeof b.sel === 'object' ? b.sel : {}, adena = b.adena && typeof b.adena === 'object' ? b.adena : {};
  const givers = [...new Set(Object.keys(sel).concat(Object.keys(adena)))];
  const bad = givers.filter(n => !known.has(n)); if (bad.length) return { error: `unknown giver(s): ${bad.join(', ')}` };
  if (givers.length > TL.LIMITS.maxGivers) return { error: `max ${TL.LIMITS.maxGivers} givers` };
  const B = await bags(ctx, givers, fresh);
  const pv = TL.trPreview(sel, adena, B, receiver);
  pv.receiver = receiver; pv.batches = {};
  pv.givers.forEach(g => { pv.batches[g.name] = TL.trBatches(g.rows.concat(g.adena ? [{ adena: true, count: g.adena, name: g.adena + ' adena' }] : []), TL.LIMITS.batch).length; });
  pv.bagSrc = {}; Object.keys(B).forEach(n => { pv.bagSrc[n] = { src: B[n].src, ageSec: B[n].ageSec || 0, err: B[n].err || '' }; });
  return pv;
}
function ordFile(ctx, id) { if (!TL.ID_RE.test(String(id || ''))) return null; return path.join(DIR_OF(ctx), `${id}.json`); }
function status(ctx, id) {
  const f = ordFile(ctx, id); if (!f) return { error: 'bad order id' };
  const o = ctx.readJson(f, null); if (!o) return { error: 'no such order' };
  const res = {};
  Object.keys(o.givers || {}).concat([o.receiver]).forEach(n => { const r = ctx.readJson(path.join(DIR_OF(ctx), `${id}_${n}.json`), null); res[n] = r ? Object.assign(r, { line: TL.trResultLine(r) }) : { line: TL.trResultLine(null) }; });
  const g = Object.keys(o.givers || {}), states = g.map(n => (res[n] && res[n].state) || 'waiting');
  const over = states.every(s => /^(done|failed|stopped)$/.test(s));
  return { order: o, results: res, over, done: states.filter(s => s === 'done').length, failed: states.filter(s => s === 'failed').length, total: g.length };
}
function recentOrders(ctx, n) {
  let files = []; try { files = fs.readdirSync(DIR_OF(ctx)).filter(f => /^h[a-z0-9]+\.json$/i.test(f)); } catch (e) { return []; }
  return files.map(f => { const o = ctx.readJson(path.join(DIR_OF(ctx), f), null); return o && o.id ? o : null; }).filter(Boolean)
    .sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, n || 8)
    .map(o => { const s = status(ctx, o.id); return { id: o.id, at: o.at, receiver: o.receiver, givers: Object.keys(o.givers || {}), kinds: Object.values(o.givers || {}).reduce((a, g) => a + (g.items || []).length, 0), preset: o.preset || '', over: s.over, done: s.done, failed: s.failed, total: s.total }; });
}
async function send(ctx, cmd, names) {
  if (!ctx.commandRun) return { ok: false, error: 'the server has no command center' };
  const r = await ctx.commandRun({ cmd, targets: ['chars:' + names.join(',')] });
  return r && r.body ? r.body : r;
}

async function handle(req, res, url, ctx) {
  const p = url.pathname;
  if (STATIC[p]) {
    res.writeHead(200, { 'Content-Type': STATIC[p], 'Cache-Control': 'no-cache' });
    res.end(fs.readFileSync(path.join(ctx.DIR || __dirname, p.slice(1))));
    return true;
  }
  if (!p.startsWith('/api/trade/')) return false;
  if (!ctx.allowed(req, url)) { ctx.send(res, 401, 'text/plain; charset=utf-8', 'Access denied'); return true; }
  try {
    if (p === '/api/trade/info') { ctx.json(res, 200, info(ctx)); return true; }
    if (p === '/api/trade/bags') {
      const names = String(url.searchParams.get('names') || '').split(',').map(s => s.trim()).filter(Boolean);
      const known = knownNames(ctx), bad = names.filter(n => !known.has(n));
      if (bad.length) { ctx.json(res, 400, { error: `unknown character(s): ${bad.join(', ')}` }); return true; }
      ctx.json(res, 200, { bags: await bags(ctx, names, url.searchParams.get('fresh') === '1') }); return true;
    }
    if (p === '/api/trade/status') { const s = status(ctx, url.searchParams.get('id')); ctx.json(res, s.error ? 404 : 200, s); return true; }
    if (req.method !== 'POST') { ctx.json(res, 405, { error: 'POST' }); return true; }
    const b = await ctx.body(req);
    if (p === '/api/trade/plan') { const pv = await plan(ctx, b, false); ctx.json(res, pv.error ? 400 : 200, pv); return true; }
    if (p === '/api/trade/order') {
      if (b.confirm !== true) { ctx.json(res, 409, { error: 'confirm the hand-over first (the page asks)', needConfirm: true }); return true; }
      const pv = await plan(ctx, b, true);                                // fresh bags: what really is there now
      if (pv.error) { ctx.json(res, 400, pv); return true; }
      if (!pv.givers.length) { ctx.json(res, 400, { error: 'nothing to hand over' + (pv.problems.length ? ': ' + pv.problems.join('; ') : ''), plan: pv }); return true; }
      const id = TL.trNewId();
      const order = TL.trOrder(id, pv.receiver, pv, { by: 'dashboard', preset: String(b.preset || '').slice(0, 60), note: String(b.note || '').slice(0, 200), sameTown: b.sameTown === true });
      fs.mkdirSync(DIR_OF(ctx), { recursive: true });
      const F = ordFile(ctx, id), tmp = F + '.' + process.pid + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(order, null, 1)); fs.renameSync(tmp, F);
      const names = Object.keys(order.givers).concat([order.receiver]);
      const sent = await send(ctx, `!handover ${id}`, names);
      logLine(ctx, `trade page: order ${id} -> ${order.receiver} from ${Object.keys(order.givers).map(n => `${n} (${order.givers[n].items.length} kinds${order.givers[n].adena ? ' + ' + order.givers[n].adena + ' adena' : ''})`).join(', ')}${order.preset ? ' preset "' + order.preset + '"' : ''}`);
      ctx.json(res, 200, { ok: true, id, order, plan: pv, sent }); return true;
    }
    if (p === '/api/trade/stop') {
      const f = ordFile(ctx, b.id), o = f ? ctx.readJson(f, null) : null;
      if (!o) { ctx.json(res, 404, { error: 'no such order' }); return true; }
      const sent = await send(ctx, `!handover stop ${o.id}`, Object.keys(o.givers || {}).concat([o.receiver]));
      logLine(ctx, `trade page: stop ${o.id}`);
      ctx.json(res, 200, { ok: true, sent }); return true;
    }
    if (p === '/api/trade/presets') {
      const list = presetsRead(ctx);
      if (b.action === 'delete') { const n = String(b.name || ''); const next = list.filter(x => x.name !== n); if (next.length === list.length) { ctx.json(res, 404, { error: `no saved preset "${n}" (built-in presets cannot be deleted)` }); return true; } presetsWrite(ctx, next); logLine(ctx, `trade page: preset deleted "${n}"`); ctx.json(res, 200, { ok: true, presets: info(ctx).presets }); return true; }
      if (b.action === 'save') {
        const pr = b.preset || {}; const ck = TL.trPresetCheck(pr);
        if (!ck.ok) { ctx.json(res, 400, { error: 'preset: ' + ck.errors.join('; ') }); return true; }
        const clean = { name: String(pr.name).trim().slice(0, 60), receiver: String(pr.receiver || '@clanleader').slice(0, 40), cats: (pr.cats || []).filter(c => TL.CAT_KEYS.includes(c)),
          ids: (pr.ids || []).map(Number).filter(Number.isFinite).slice(0, 300), names: (pr.names || []).map(String).slice(0, 20), exclude: (pr.exclude || []).map(Number).filter(Number.isFinite).slice(0, 300),
          items: (pr.items || []).map(x => ({ id: Number(x && x.id), count: Math.max(1, Math.round(Number(x && x.count) || 1)) })).filter(x => Number.isFinite(x.id) && x.id > 0).slice(0, 300),   // PRESETQTY
          adena: Math.max(0, Math.round(Number(pr.adena) || 0)), savedAt: new Date().toISOString() };
        const next = list.filter(x => x.name !== clean.name).concat([clean]);
        presetsWrite(ctx, next); logLine(ctx, `trade page: preset saved "${clean.name}"`);
        ctx.json(res, 200, { ok: true, presets: info(ctx).presets }); return true;
      }
      ctx.json(res, 400, { error: 'action: save | delete' }); return true;
    }
    ctx.json(res, 404, { error: 'unknown trade endpoint' }); return true;
  } catch (e) { ctx.json(res, 500, { error: String(e && e.message || e) }); return true; }
}
module.exports = { handle, info, plan, status, bags, recentOrders, DEFAULT_PRESETS, _cache: bagCache };
