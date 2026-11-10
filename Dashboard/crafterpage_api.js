// CLAN CRAFTER PAGE #/crafter (CRAFTERPAGE-2026-11-01, owner: "I need a live page where I can see needs for crafting depending on what I set the
// individual numbers for, like I want 50000 soulshots A grade and 40000 blessed spiritshots C grade" / "the price should be normal cost. Ideally
// Crafter1 will be the clan bank so the accounts ('regnskab') should go up"). Loaded by server.js (one hook). Public: /crafterpage.js|css.
//   GET  /api/crafterpage            per shot: target, in stock (crafter bag + its warehouse + clan warehouse), short by, batches, materials for the
//                                    shortfall (Soul / Spirit Ore + crystals = the base materials), have / missing, batches craftable now; price; the
//                                    crafter's live craft status; the bank (balance now, ledger totals, sales per party, balance samples)
//   POST /api/crafterpage { action: 'targets', targets: { 'soulshot:A': n | null } }  -> crafter_rules.json crafters.<crafter>.stock (the SAME targets
//                                    swarm.js CRAFT already crafts toward; written through crafter_api.post: lock + history + atomic)
//        { action: 'settings', crafter?, bank?, prices?: { <itemId>: adena | null } }   -> Scripts/data/crafter.json
//        { action: 'craft', key?: 'soulshot:A', confirm: true }   -> the command queue: "!craft one <key> <crafter>" (one batch) or "!craft <crafter>" (a round)
//        { action: 'sell', party: <leader>, key, count, confirm: true }  -> two same-town trade orders (shots crafter -> leader, adena leader -> bank)
//                                    + a ledger row 'sale' (normal cost = the NPC price)
//        { action: 'ledger', kind, who, item?, count?, adena, note? }        -> one manual ledger row (deposit / payout / buy ...)
// Files: Scripts/data/crafter.json (settings), Scripts/data/crafter_ledger.json (append-only rows), Logs/crafter_balance.json (the bank's adena every
// 10 min: tick()). Env SWARM_CRAFTERPAGE_DIR overrides the data folder (the tests use a sandbox). Never moves anything without the owner's click.
'use strict';
const fs = require('fs'), path = require('path');
const CA = require('./crafter_api');
// NPC price of every shot (L2J High Five datapack stats/items "price" = what the grocer charges; "normal cost", owner 2026-11-01)
const SHOT_PRICE = { 1463: 14, 1464: 22, 1465: 50, 1466: 80, 1467: 100, 2510: 18, 2511: 35, 2512: 100, 2513: 120, 2514: 150, 3948: 28, 3949: 42, 3950: 245, 3951: 290, 3952: 350 };
// PICKALL-2026-11-10: no built-in names any more (was 'Crafter1' = the owner's character: a public install without crafter.json showed a bank the
// bots did not have - swarm.js crafterSet() treats a missing name as none). Nobody set = "none set" + the Change pickers.
const DEF = { crafter: '', bank: '', prices: {}, runner: '', runnerOn: false, pays: {}, cwhWithdraw: true };
const NAME_RE = /^[A-Za-z0-9_\-]{1,40}$/;
// CRAFTRUN-2026-11-01: + npcsale (the crafter sold marked items at the grocer), cry (crystallized marked items), collect (the runner brought loot in)
const KINDS = ['sale', 'buy', 'deposit', 'payout', 'craft', 'npcsale', 'cry', 'collect'];
const obj = (x) => x && typeof x === 'object' && !Array.isArray(x) ? x : {};
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

// ---------------------------------------------------------------------------------------------------- pure (docs/plan/tools/test_crafterpage.js)
/** count of every item id over the given row lists ([{ id, count }]) -> { id: n } */
function countIds(...lists) { const o = {}; lists.forEach(L => (L || []).forEach(r => { const id = num(r && r.id); if (id) o[id] = (o[id] || 0) + Math.max(1, num(r.count) || 1); })); return o; }
/** price of one shot: the owner's override, else the NPC price */
function priceOf(id, prices) { const p = obj(prices)[id]; return p !== undefined && p !== null && num(p) >= 0 ? num(p) : (SHOT_PRICE[id] || 0); }
/** one row of the page: recipe r, target, stock counts by id, materials by id -> the needs */
function needRow(r, target, stock, mats) {
  const t = Math.max(0, Math.round(num(target))), have = num(stock[r.product]), short = Math.max(0, t - have);
  const batches = short > 0 ? Math.ceil(short / r.count) : 0;
  const ing = r.ing.map(([id, q]) => { const need = q * batches, h = num(mats[id]); return { id, perBatch: q, need, have: h, missing: Math.max(0, need - h) }; });
  const canNow = r.ing.reduce((m, [id, q]) => Math.min(m, Math.floor(num(mats[id]) / q)), Infinity);
  return { key: r.key, product: r.product, perBatch: r.count, lvl: r.lvl, target: t, have, short, batches, ing, canNow: Number.isFinite(canNow) ? canNow : 0,
    canCover: Math.min(batches, Number.isFinite(canNow) ? canNow : 0), done: t > 0 && short === 0 };
}
/** every recipe's row + the total materials for all shortfalls */
function needs(recipes, targets, stock, mats) {
  const rows = recipes.map(r => needRow(r, obj(targets)[r.key], stock, mats));
  const total = {}; rows.forEach(x => x.ing.forEach(g => { total[g.id] = (total[g.id] || 0) + g.need; }));
  const tot = Object.keys(total).map(id => ({ id: Number(id), need: total[id], have: num(mats[id]), missing: Math.max(0, total[id] - num(mats[id])) }));
  return { rows, total: tot };
}
/** the bank: ledger rows -> balance per kind, income / spending, sales per party */
function ledgerSummary(rows) {
  const s = { income: 0, spending: 0, net: 0, byKind: {}, salesBy: {}, rows: 0 };
  (rows || []).forEach(r => {
    const a = num(r.adena), k = KINDS.includes(r.kind) ? r.kind : 'other'; s.rows++;
    s.byKind[k] = (s.byKind[k] || 0) + a;
    if (k === 'sale' || k === 'deposit' || k === 'npcsale' || k === 'collect') s.income += a; else if (k === 'buy' || k === 'payout') s.spending += a;
    if (k === 'sale') { const w = String(r.who || '?'); s.salesBy[w] = s.salesBy[w] || { adena: 0, count: 0 }; s.salesBy[w].adena += a; s.salesBy[w].count += num(r.count); }
  });
  s.net = s.income - s.spending;
  return s;
}
/** a ledger row from a request body -> { row } | { error } */
function ledgerRow(b, at) {
  const kind = String(obj(b).kind || ''); if (!KINDS.includes(kind)) return { error: `kind: one of ${KINDS.join(', ')}` };
  const who = String(b.who || '').trim(); if (!NAME_RE.test(who)) return { error: 'who: a character / party name' };
  const adena = Math.round(num(b.adena)); if (!(adena >= 0) || adena > 5e9) return { error: 'adena: 0 to 5,000,000,000' };
  return { row: { at: at || new Date().toISOString(), kind, who, item: b.item ? Number(b.item) || null : null, count: Math.max(0, Math.round(num(b.count))), adena, note: String(b.note || '').slice(0, 160) } };
}
// PICKALL-2026-11-10 (public tester Vykaax: "Crafter1 is locked as the bank on the Crafter tab. No way to change this? ... the Runner is changed
// from the Crafter tab and NOT the Runner tab ... when you press the 'Change runner' button, you are given a limited selection. I can't even select
// my Plainswalker 'vRunner'"): the bank / crafter / runner pickers (Crafter page + Runner page) list EVERY character of the install (teamMap = every
// swarm.config.json account + the swarm.js teams, plus every reporting character) - no class filter, no 40-button cap. A character that cannot take
// the role is listed GREYED with the reason (crafter.md R16: the bank never leaves Giran, so the runner is never the bank / crafter).
/** pure: why `name` cannot take `role` ('runner' | 'bank' | 'crafter') with the settings S -> '' = it can */
function roleBlock(role, name, S) {
  S = obj(S); name = String(name || '');
  if (!name) return '';
  if (role === 'runner') { if (S.bank && name === S.bank) return 'is the bank (the bank never leaves Giran)'; if (S.crafter && name === S.crafter) return 'is the crafter (it crafts in Giran)'; return ''; }
  if (role === 'bank' || role === 'crafter') return S.runner && name === S.runner ? 'is the runner (it travels) - pick another runner first' : '';
  return '';
}
/** pure: every character for the pickers. tm = { name: partyKey } (server.js teamMap), states = [{ name, cls, level, ageSec }], S = settings
 *  -> [{ name, party, cls, level, online, block: { runner?, bank?, crafter? } }] sorted by name (no filter, no cap) */
function charChoices(tm, states, S) {
  tm = obj(tm); const st = {};
  (states || []).forEach(s => { if (s && s.name && NAME_RE.test(String(s.name))) st[s.name] = s; });
  const names = [...new Set(Object.keys(tm).concat(Object.keys(st)).filter(n => NAME_RE.test(n)))].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
  return names.map(n => {
    const s = st[n] || {}, block = {};
    ['runner', 'bank', 'crafter'].forEach(r => { const w = roleBlock(r, n, S); if (w) block[r] = w; });
    const p = tm[n]; return { name: n, party: typeof p === 'string' && p ? p : (Array.isArray(p) ? n : ''), cls: String(s.cls || ''), level: s.level != null ? num(s.level) : null, online: s.ageSec != null && num(s.ageSec) < 120, block };
  });
}
/** pure: a settings change that would make one character both the runner and the bank / crafter -> the error text, else '' */
function roleClash(next) {
  next = obj(next); const r = String(next.runner || '');
  if (!r) return '';
  if (r === next.bank) return `${r} cannot be the runner and the bank at once (the bank never leaves Giran) - pick another runner or another bank`;
  if (r === next.crafter) return `${r} cannot be the runner and the crafter at once (the crafter crafts in Giran) - pick another runner or another crafter`;
  return '';
}
/** the sale of shots to a party at normal cost -> { count, price, adena } */
function salePrice(id, count, prices) { const c = Math.max(0, Math.round(num(count))), p = priceOf(id, prices); return { count: c, price: p, adena: Math.round(c * p) }; }

// ---------------------------------------------------------------------------------------------------- files
const dataDir = (ctx) => process.env.SWARM_CRAFTERPAGE_DIR || ctx.DATA;
const setFile = (ctx) => path.join(dataDir(ctx), 'crafter.json');
const ledFile = (ctx) => path.join(dataDir(ctx), 'crafter_ledger.json');
const balFile = (ctx) => path.join(process.env.SWARM_CRAFTERPAGE_DIR || ctx.LOGS, 'crafter_balance.json');
function rj(f, d) { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch (e) { return d; } }
function wjAtomic(f, j) { fs.mkdirSync(path.dirname(f), { recursive: true }); const t = f + '.tmp' + process.pid; fs.writeFileSync(t, JSON.stringify(j, null, 1) + '\n'); fs.renameSync(t, f); }
/** CRAFTRUN-2026-11-01: the bots write ledger rows to Logs/crafter_ledger_in.log (one JSON per line); booked here once (byte offset in
 *  Logs/crafter_ledger_in.pos) -> rows added. Pure part: ingestLines(text) -> [row] */
function ingestLines(text) {
  const out = [];
  String(text || '').split(/\r?\n/).forEach(l => { if (!l.trim()) return; let j = null; try { j = JSON.parse(l); } catch (e) { return; } const r = ledgerRow(j, j && j.at); if (r.row) out.push(r.row); });
  return out;
}
function ingest(ctx) {
  try {
    const F = path.join(ctx.LOGS, 'crafter_ledger_in.log'), P = path.join(ctx.LOGS, 'crafter_ledger_in.pos');
    if (!fs.existsSync(F)) return 0;
    const size = fs.statSync(F).size; let pos = 0; try { pos = num(fs.readFileSync(P, 'utf8')); } catch (e) { }
    if (pos > size) pos = 0; if (pos === size) return 0;
    const fd = fs.openSync(F, 'r'), b = Buffer.alloc(size - pos); fs.readSync(fd, b, 0, b.length, pos); fs.closeSync(fd);
    const text = String(b), cut = text.lastIndexOf('\n') + 1; if (!cut) return 0;           // only whole lines; the rest next time
    const rows = ingestLines(text.slice(0, cut)); rows.forEach(r => ledgerAdd(ctx, r));
    fs.writeFileSync(P, String(pos + Buffer.byteLength(text.slice(0, cut))));
    return rows.length;
  } catch (e) { return 0; }
}
function settings(ctx) { const j = obj(rj(setFile(ctx), {})); return { runner: NAME_RE.test(j.runner || '') ? j.runner : '', runnerOn: j.runnerOn === true, pays: obj(j.pays), cwhWithdraw: j.cwhWithdraw !== false, rotateOn: j.rotateOn !== false, rotateMin: Math.max(10, Math.min(1440, num(j.rotateMin) || 60)), runnerStealth: j.runnerStealth !== false, crafter: NAME_RE.test(j.crafter || '') ? j.crafter : DEF.crafter, bank: NAME_RE.test(j.bank || '') ? j.bank : DEF.bank, prices: obj(j.prices) }; }
function ledger(ctx) { const j = rj(ledFile(ctx), null); return Array.isArray(j && j.rows) ? j.rows : []; }
function ledgerAdd(ctx, row) {
  const F = ledFile(ctx), j = obj(rj(F, {})); const rows = Array.isArray(j.rows) ? j.rows : [];
  rows.push(row);
  wjAtomic(F, { _about: 'CRAFTERPAGE-2026-11-01: the clan bank ledger (append-only): sale | buy | deposit | payout | craft. Written by Dashboard/crafterpage_api.js.', rows });
}
function logLine(ctx, t) { try { fs.appendFileSync(path.join(ctx.LOGS, 'dashboard_commands.log'), `${new Date().toISOString()}\tcrafterpage\t${t}\r\n`); } catch (e) { } }

/** stock and materials of the crafter: its bag report + its own warehouse + the clan warehouse */
function sources(ctx, name) {
  const bag = obj(rj(path.join(ctx.LOGS, `bag_${name}.json`), {})), wh = obj(rj(path.join(ctx.LOGS, `wh_private_${name}.json`), {}));
  const cs = obj(rj(path.join(ctx.LOGS, 'clan_state.json'), {})), cw = obj(cs.warehouse);
  const bagRows = Array.isArray(bag.items) ? bag.items : [], whRows = Array.isArray(wh.items) ? wh.items : [], cwRows = Array.isArray(cw.items) ? cw.items : [];
  return { all: countIds(bagRows, whRows, cwRows), bag: countIds(bagRows), wh: countIds(whRows), clan: countIds(cwRows), bagRows,
    seen: { bag: bag.at || null, wh: wh.seenAt || null, clan: cw.seenAt || null } };
}
function info(ctx) {
  ingest(ctx);   // CRAFTRUN: book the bots' rows before showing the bank
  const S = settings(ctx), R = CA.readFile(ctx), cfg = CA.craftCfgOf(R.data || {}, S.crafter);
  const src = sources(ctx, S.crafter), N = needs(CA.CRAFT_RECIPES, cfg.stock, src.all, src.all);
  N.rows.forEach(x => { x.name = CA.craftName(x.key); x.price = priceOf(x.product, S.prices); x.npcPrice = SHOT_PRICE[x.product] || 0;
    x.where = { bag: src.bag[x.product] || 0, wh: src.wh[x.product] || 0, clan: src.clan[x.product] || 0 }; });
  N.total.forEach(t => { t.name = CA.CRAFT_MATS[t.id] || ('item ' + t.id); });
  let st = null; try { st = JSON.parse(fs.readFileSync(path.join(ctx.LOGS, `crafter_${S.crafter}.json`), 'utf8').replace(/^﻿/, '')); } catch (e) { }
  let states = []; try { states = (ctx.readStates && ctx.readStates()) || []; } catch (e) { }
  const bankSt = states.find(s => s && s.name === S.bank) || {};
  const L = ledger(ctx), sum = ledgerSummary(L), bal = obj(rj(balFile(ctx), {}));
  let tm = {}; try { tm = (ctx.teamMap && ctx.teamMap()) || {}; } catch (e) { }
  const parties = Object.keys(tm), leaders = [...new Set(parties.map(n => typeof tm[n] === 'string' && tm[n] ? tm[n] : n))].sort();   // leaders: PICKALL - the sale goes to a party leader
  const chars = charChoices(tm, states, S), known = (n) => !!n && chars.some(c => c.name === n);   // PICKALL-2026-11-10
  return { ok: true, crafter: S.crafter, bank: S.bank, chars, roleKnown: { crafter: known(S.crafter), bank: known(S.bank), runner: known(S.runner) }, prices: S.prices, rev: R.rev, cfg: { on: cfg.on, town: cfg.town, parties: cfg.parties, maxBatches: cfg.maxBatches },
    rows: N.rows, total: N.total, mats: Object.keys(CA.CRAFT_MATS).map(id => ({ id: Number(id), name: CA.CRAFT_MATS[id], bag: src.bag[id] || 0, wh: src.wh[id] || 0, clan: src.clan[id] || 0 })),
    seen: src.seen, status: st ? { state: st.state, why: st.why, at: st.at, town: st.town, createLvl: st.createLvl } : null,
    bankNow: { adena: num(bankSt.adena), online: num(bankSt.ageSec) < 120 }, ledger: { summary: sum, last: L.slice(-30).reverse() },
    balance: Array.isArray(bal.rows) ? bal.rows.slice(-288) : [], parties, leaders,
    runner: Object.assign({ name: S.runner, on: S.runnerOn, pays: S.pays, cwhWithdraw: S.cwhWithdraw, rotateOn: S.rotateOn, rotateMin: S.rotateMin, runnerStealth: S.runnerStealth }, obj(rj(path.join(ctx.LOGS, 'runner_state.json'), {}))) };
}
/** every 10 min (server.js): the bank's adena -> Logs/crafter_balance.json (last 2000 samples) */
function tick(ctx) {
  ingest(ctx);
  try {
    const S = settings(ctx); let states = []; try { states = (ctx.readStates && ctx.readStates()) || []; } catch (e) { }
    const s = states.find(x => x && x.name === S.bank); if (!s || !(num(s.ageSec) < 600)) return;
    const F = balFile(ctx), j = obj(rj(F, {})), rows = Array.isArray(j.rows) ? j.rows : [];
    rows.push({ at: new Date().toISOString(), who: S.bank, adena: num(s.adena) });
    wjAtomic(F, { rows: rows.slice(-2000) });
  } catch (e) { }
}
async function post(ctx, b) {
  b = obj(b); const S = settings(ctx), a = String(b.action || '');
  if ((a === 'targets' || a === 'craft' || a === 'sell') && !S.crafter) return { code: 400, error: 'no crafter set: pick one first (Change crafter)' };   // PICKALL-2026-11-10
  if (a === 'targets') {
    const t = obj(b.targets), stock = {}; Object.keys(t).forEach(k => { stock[k] = t[k] === null || t[k] === '' ? null : t[k]; });
    const r = CA.post(ctx, { name: S.crafter, values: { stock }, rev: b.rev, by: 'crafter page' });
    if (r && r.ok) logLine(ctx, `targets ${S.crafter}: ${JSON.stringify(stock).slice(0, 300)}`);
    return r;
  }
  if (a === 'settings') {
    const j = obj(rj(setFile(ctx), {})), out = Object.assign({}, DEF, j);
    if (b.crafter !== undefined) { if (!NAME_RE.test(String(b.crafter))) return { code: 400, error: 'crafter: a character name' }; out.crafter = String(b.crafter); }
    if (b.bank !== undefined) { if (!NAME_RE.test(String(b.bank))) return { code: 400, error: 'bank: a character name' }; out.bank = String(b.bank); }
    // CRAFTRUN-2026-11-01: the runner (who shuttles between the crafter and the parties), its switch, who pays, whether the crafter takes from the clan warehouse
    if (b.runner !== undefined) { if (b.runner !== '' && !NAME_RE.test(String(b.runner))) return { code: 400, error: 'runner: a character name or empty' }; out.runner = String(b.runner || ''); }
    if (typeof b.runnerOn === 'boolean') out.runnerOn = b.runnerOn;
    if (typeof b.cwhWithdraw === 'boolean') out.cwhWithdraw = b.cwhWithdraw;
    // RUNNERROTATE-2026-11-03: the runner's rotation through the farming parties (empty queue): on/off + at most one visit per party every N min
    if (typeof b.rotateOn === 'boolean') out.rotateOn = b.rotateOn;
    if (typeof b.runnerStealth === 'boolean') out.runnerStealth = b.runnerStealth;   // RUNNERSTEALTH-2026-11-03: walks in everywhere (stealth) / the old level limit
    // PICKALL-2026-11-10: never one character as the runner AND the bank / crafter (crafter.md R16) - checked only when one of the three changes
    if (b.runner !== undefined || b.bank !== undefined || b.crafter !== undefined) { const clash = roleClash(out); if (clash) return { code: 400, error: clash }; }
    if (b.rotateMin !== undefined) { const m = Math.round(num(b.rotateMin)); if (!(m >= 10 && m <= 1440)) return { code: 400, error: 'rotateMin: 10 - 1440 minutes' }; out.rotateMin = m; }
    if (b.pays !== undefined) { const p = obj(out.pays); Object.keys(obj(b.pays)).forEach(k => { if (!NAME_RE.test(k)) return; if (b.pays[k] === false) p[k] = false; else delete p[k]; }); out.pays = p; }
    if (b.prices !== undefined) { const p = obj(out.prices); Object.keys(obj(b.prices)).forEach(id => { const v = b.prices[id]; if (v === null || v === '') delete p[id]; else if (num(v) >= 0 && num(v) <= 1e6) p[id] = num(v); }); out.prices = p; }
    out._about = 'CRAFTERPAGE-2026-11-01: the clan crafter page (#/crafter): crafter = who crafts, bank = who holds the clan money, prices = per shot item id an override of the NPC price. The stock targets live in crafter_rules.json crafters.<crafter>.stock.';
    wjAtomic(setFile(ctx), out); logLine(ctx, `settings ${JSON.stringify({ crafter: out.crafter, bank: out.bank, prices: out.prices }).slice(0, 300)}`);
    return { code: 200, ok: true, settings: { crafter: out.crafter, bank: out.bank, prices: out.prices, runner: out.runner || '', runnerOn: out.runnerOn === true, pays: obj(out.pays), cwhWithdraw: out.cwhWithdraw !== false } };
  }
  if (a === 'ledger') { const r = ledgerRow(b); if (r.error) return { code: 400, error: r.error }; ledgerAdd(ctx, r.row); logLine(ctx, `ledger ${JSON.stringify(r.row)}`); return { code: 200, ok: true, row: r.row }; }
  if (b.confirm !== true) return { code: 400, error: 'confirm: true is needed (this sends an order)' };
  if (a === 'craft') {
    if (b.key && !CA.CRAFT_RECIPES.some(r => r.key === b.key)) return { code: 400, error: 'unknown shot ' + b.key };
    const cmd = b.key ? `!craft one ${b.key} ${S.crafter}` : `!craft ${S.crafter}`;
    if (typeof ctx.post !== 'function') return { code: 500, error: 'no queue' };
    const r = await ctx.post('/api/autoqueue', { cmd, targets: ['char:' + S.crafter], by: 'crafter page', note: b.key ? 'one batch' : 'a craft round toward the targets' });
    logLine(ctx, `craft ${cmd}: ${r && r.ok ? 'queued' : 'NOT queued'}`);
    return r && r.ok ? { code: 200, ok: true, cmd, queued: r.item && r.item.id } : { code: 500, error: (r && r.error) || 'not queued' };
  }
  if (a === 'sell') {
    const rec = CA.CRAFT_RECIPES.find(r => r.key === b.key); if (!rec) return { code: 400, error: 'unknown shot ' + b.key };
    const party = String(b.party || ''); if (!NAME_RE.test(party)) return { code: 400, error: 'party: its leader' };
    const sp = salePrice(rec.product, b.count, S.prices); if (!(sp.count > 0)) return { code: 400, error: 'count: more than 0' };
    const src = sources(ctx, S.crafter), row = src.bagRows.find(r => num(r.id) === rec.product && !r.eq);
    if (!row || num(row.count) < sp.count) return { code: 400, error: `${S.crafter} has only ${row ? num(row.count) : 0} ${CA.craftName(rec.key)} in the bag` };
    if (typeof ctx.post !== 'function') return { code: 500, error: 'no trade orders' };
    const o1 = await ctx.post('/api/trade/order', { receiver: party, sel: { [S.crafter]: { [row.objId]: sp.count } }, adena: {}, confirm: true, sameTown: true, note: `shots from the clan crafter: ${sp.count} ${CA.craftName(rec.key)}` });
    if (!o1 || !o1.ok) return { code: 500, error: 'shots order not sent: ' + ((o1 && o1.error) || '?') };
    const o2 = sp.adena > 0 ? await ctx.post('/api/trade/order', { receiver: S.bank, sel: {}, adena: { [party]: sp.adena }, confirm: true, sameTown: true, note: `pays the clan bank: ${sp.count} ${CA.craftName(rec.key)} x ${sp.price}` }) : { ok: true };
    const lr = ledgerRow({ kind: 'sale', who: party, item: rec.product, count: sp.count, adena: sp.adena, note: `${CA.craftName(rec.key)} x ${sp.price}${o2 && o2.ok ? '' : ' (payment order NOT sent)'}` });
    if (lr.row) ledgerAdd(ctx, lr.row);
    logLine(ctx, `sell ${sp.count} ${rec.key} to ${party} for ${sp.adena}`);
    return { code: 200, ok: true, shotsOrder: o1.id, payOrder: o2 && o2.id, sale: sp };
  }
  return { code: 400, error: 'action: targets | settings | craft | sell | ledger' };
}
const STATIC = { '/crafterpage.js': 'text/javascript; charset=utf-8', '/runnercall.js': 'text/javascript; charset=utf-8' };
// RUNNERBTN-2026-11-02 (owner: "I dont see the Call collector under #/char/Spoiler3?? On mobile og pc"): GET /api/crafterpage?view=runner = the small
// read-only state the "🐎 Call the runner" buttons (Dashboard/runnercall.js) need: who the runner / crafter are, their parties, its state + queue.
function partyOfName(tm, name) { if (!name) return ''; const k = Object.keys(tm || {}).find(l => l === name || (Array.isArray(tm[l]) && tm[l].includes(name))); return k || name; }
function runnerView(ctx) {
  const S = settings(ctx), st = obj(rj(path.join(ctx.LOGS, 'runner_state.json'), {}));
  let tm = {}; try { tm = (ctx.teamMap && ctx.teamMap()) || {}; } catch (e) { }
  let crafter = S.crafter; try { const cr = obj(rj(path.join(dataDir(ctx), 'crafter_rules.json'), {})).crafters; if (cr && Object.keys(cr).length) crafter = Object.keys(cr)[0]; } catch (e) { }
  return { ok: true, runner: S.runner, on: S.runnerOn, crafter, runnerParty: partyOfName(tm, S.runner), crafterParty: partyOfName(tm, crafter),
    state: String(st.state || ''), cur: String(st.cur || ''), queue: Array.isArray(st.queue) ? st.queue.map(q => String((q && q.party) || '')).filter(Boolean) : [], at: st.at || null };
}
async function handle(req, res, url, ctx) {
  if (STATIC[url.pathname]) {
    let body; try { body = fs.readFileSync(path.join(ctx.DIR || __dirname, url.pathname.slice(1))); } catch (e) { res.writeHead(404); res.end('not found'); return true; }
    res.writeHead(200, { 'Content-Type': STATIC[url.pathname], 'Cache-Control': 'no-cache' }); res.end(body); return true;
  }
  if (url.pathname !== '/api/crafterpage') return false;
  if (!ctx.allowed(req, url)) { ctx.send(res, 401, 'text/plain; charset=utf-8', 'Access denied'); return true; }
  if (req.method === 'GET' && url.searchParams.get('view') === 'runner') { try { ctx.json(res, 200, runnerView(ctx)); } catch (e) { ctx.json(res, 500, { error: e.message }); } return true; }   // RUNNERBTN-2026-11-02
  if (req.method === 'GET') { try { ctx.json(res, 200, info(ctx)); } catch (e) { ctx.json(res, 500, { error: e.message }); } return true; }
  if (req.method !== 'POST') { ctx.json(res, 405, { error: 'GET or POST' }); return true; }
  let b = {}; try { let t = ''; for await (const c of req) t += c; b = JSON.parse(t || '{}'); } catch (e) { ctx.json(res, 400, { error: 'bad JSON' }); return true; }
  try { const r = (await post(ctx, b)) || { code: 500, error: 'no result' }; const code = r.code || 200; delete r.code; ctx.json(res, code, r); } catch (e) { ctx.json(res, 500, { error: e.message }); }
  return true;
}
module.exports = { handle, info, post, tick, runnerView, partyOfName, roleBlock, charChoices, roleClash, countIds, priceOf, needRow, needs, ledgerSummary, ledgerRow, salePrice, SHOT_PRICE, settings, ingestLines, ingest, KINDS };
