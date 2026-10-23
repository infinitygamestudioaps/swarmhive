// ITEMS + CRAFTING API (ITEMS-2026-10-17; owner: "a general page where I can select any character ... inventory, warehouse, clan warehouse ... what
// is for sale in Giran ... buy it enchanted to +X ... put an SA on it ... give it to this character ... success rates ... crafting page for crafters").
// Loaded by server.js. Rules: Dashboard/itemslogic.js. Pages: Dashboard/itemspage.js (#/items/<name>), Dashboard/craftpage.js (#/crafting/<name>).
//   GET  /api/items/chars                      every character: name, party, level, class, online, clan leader, crafter
//   GET  /api/items/char?name=<N>[&fresh=1]    its bag (live MCP, else Logs/bag_<N>.json), private warehouse (Logs/wh_private_<N>.json), clan
//                                              warehouse (Logs/clan_state.json; taking out goes through the clan leader), adena, item facts
//   GET  /api/items/shops                      what Giran's merchants sell (Scripts/data/shopscan_giran.json)
//   GET  /api/items/find?q=<2+ letters>        hive-wide item search: who has it, how many, bag / worn / warehouse / clan warehouse (ITEMFIND)
//   POST /api/items/plan  { name, item: { src: bag|wh|clan|shop, id, objId, enchant }, enchantTo, blessed, saId, giveTo }
//                         -> the steps in plain words, what is needed from where, what is missing, chance, cost
//   POST /api/items/job   (same body) -> Logs/itemjobs/<id>.json + the order "!itemjob <id>" to the character (swarm.js ITEMJOB block)
//   GET  /api/items/job?id=<id>               the job + its live status (Logs/itemjobs/<id>_status.json, written by the bot)
//   POST /api/items/look  { name }             "!whlook <name>": it goes to a warehouse and writes its private list
//   GET  /api/items/craft?name=<N>            crafter: create level, recipes it can make (dp/recipes.xml) with materials from bag + warehouse + clan
//   POST /api/items/craft { name, recipe, count } -> "!craftmake <recipe item id> <count> <name>"
'use strict';
const fs = require('fs'), path = require('path');
const IL = require('./itemslogic');
const STATIC = { '/itemspage.js': 'application/javascript; charset=utf-8', '/itemspage.css': 'text/css; charset=utf-8', '/itemslogic.js': 'application/javascript; charset=utf-8', '/craftpage.js': 'application/javascript; charset=utf-8' };
const NAME_RE = /^[A-Za-z0-9_\-]{1,40}$/;
const isoNow = () => new Date().toISOString();
const PROTECT_ENCH = 10;   // owner 2026-10-17: +10 and higher are "game changing": never picked by chance or automatically (only the owner picks one, after an extra-strong warning)
const rj = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch (e) { return d; } };
const cache = {};
function cached(key, file, fb, map) {
  let st = ''; try { st = String(fs.statSync(file).mtimeMs); } catch (e) { }
  if (!cache[key] || cache[key].st !== st) { let v = rj(file, fb); if (map) v = map(v); cache[key] = { st, v }; }
  return cache[key].v;
}
const tpa = () => require('./tradepage_api');
const items = (ctx) => cached('items', path.join(ctx.DIR, 'data', 'items.json'), {});
const catalog = (ctx) => cached('cat', path.join(ctx.DIR, 'data', 'gear_catalog.json'), { items: {} }, v => (v && v.items) || {});
const saRecipes = (ctx) => cached('sa', path.join(ctx.DATA, 'soul_sa_recipes.json'), { recipes: [] }, v => (v && v.recipes) || []);
const rates = (ctx) => Object.assign({}, IL.RATES, cached('rates', path.join(ctx.DATA, 'enchant_rates.json'), {}) || {});
const cfg = (ctx) => rj(path.join(ctx.ROOT, 'swarm.config.json'), {}) || {};
function clanLeader(ctx) { const cq = rj(path.join(ctx.DATA, 'clan_quests.json'), null), cs = rj(path.join(ctx.LOGS, 'clan_state.json'), null); return (cq && cq.clan && cq.clan.leader) || cfg(ctx).clanLeader || (cs && cs.leader) || ''; }
function crafters(ctx) {
  const out = new Set(), R = rj(path.join(ctx.DATA, 'crafter_rules.json'), {}) || {};
  Object.keys(R.crafters || {}).forEach(n => out.add(n));
  try { fs.readdirSync(ctx.LOGS).forEach(f => { const m = /^crafter_bag_(.+)\.json$/.exec(f); if (m) { const j = rj(path.join(ctx.LOGS, f), {}); if (Number(j.createLvl) > 0) out.add(m[1]); } }); } catch (e) { }
  return out;
}
/** item facts for the page: { name, icon, grade, slot, type, kind, price, saOf (base id when it is an SA weapon), sa (its SA name), common } */
function facts(ctx, id) {
  const I = items(ctx)[String(id)] || [], C = catalog(ctx)[String(id)] || {};
  const grade = C.g || (I[3] !== '' && I[3] != null ? IL.GRADES[Number(I[3])] : 'NONE') || 'NONE';
  return { id: Number(id), name: C.n || I[0] || `item ${id}`, icon: I[1] || '', grade, slot: C.s || '', wtype: C.t || '', type: I[2] || '', kind: IL.kindOf(C.s), full: !!C.full || C.s === 'full',
    price: C.p || 0, base: C.base || 0, sa: C.sa || '', common: /^Common Item/.test(C.n || I[0] || ''), pa: C.pa, ma: C.ma, pd: C.pd, md: C.md };
}
function chars(ctx) {
  const st = ctx.readStates ? ctx.readStates() : [], by = {}; st.forEach(s => { by[s.name] = s; });
  const CL = clanLeader(ctx), CR = crafters(ctx);
  const list = (cfg(ctx).accounts || []).filter(a => a.character && a.enabled !== false).map(a => { const s = by[a.character] || {};
    return { name: a.character, party: a.party || '', level: s.level || null, cls: s.cls || '', classId: s.classId != null ? s.classId : null, online: Number(s.ageSec) < 30, clanLeader: a.character === CL, crafter: CR.has(a.character), adena: s.adena || 0 }; });
  return { ok: true, chars: list, clanLeader: CL };
}
function rowsOf(ctx, list, extra) { return (list || []).map(r => Object.assign(facts(ctx, r.id), { count: Number(r.count) || 1, enchant: Number(r.enchant) || 0 }, extra ? extra(r) : {})); }
async function charInfo(ctx, name, fresh) {
  if (!NAME_RE.test(name)) return { code: 400, error: 'name?' };
  const B = (await tpa().bags(Object.assign({}, ctx), [name], fresh))[name] || { ok: false, rows: [] };
  const wh = rj(path.join(ctx.LOGS, `wh_private_${name}.json`), null), cs = rj(path.join(ctx.LOGS, 'clan_state.json'), {}) || {};
  const CL = clanLeader(ctx), st = (ctx.readStates ? ctx.readStates() : []).find(s => s.name === name) || {};
  return { ok: true, name, level: st.level || null, cls: st.cls || '', classId: st.classId, online: Number(st.ageSec) < 30, town: (st.doing && st.doing.town) || '', clanLeader: CL, isClanLeader: name === CL,
    adena: B.adena || st.adena || 0, bagSrc: B.src || '', bagErr: B.ok ? '' : (B.err || ''),
    bag: rowsOf(ctx, (B.rows || []).filter(r => !r.quest), r => ({ objId: r.objId, eq: !!r.equipped, src: 'bag' })),
    wh: wh ? rowsOf(ctx, wh.items, () => ({ src: 'wh' })) : [], whSeen: wh ? wh.seenAt : null,
    clan: cs.warehouse ? rowsOf(ctx, cs.warehouse.items, () => ({ src: 'clan' })) : [], clanSeen: cs.warehouse ? cs.warehouse.seenAt : null, clanSeenBy: cs.warehouse ? cs.warehouse.seenBy : '' };
}
function shops(ctx) {
  const S = cached('shops', path.join(ctx.DATA, 'shopscan_giran.json'), { shops: [] }) || { shops: [] };
  const out = [];
  (S.shops || []).forEach(sh => (sh.lists || []).forEach(l => { const rows = (l.items || []).map(i => Object.assign(facts(ctx, i.id), { price: Number(i.price) || 0, src: 'shop', npc: sh.npc, est: !!i.est })); if (rows.length) out.push({ npc: sh.npc, title: sh.title || '', list: (l.path || []).join(' > '), rows }); }));
  // GIRANSCAN 2026-10-17: the census of every Giran NPC (shops + exchanges); a census row carries its offer (where + how to buy it)
  const M = cached('market', path.join(ctx.DATA, 'giran_market.json'), null);
  if (M && Array.isArray(M.offers)) {
    const groups = {};
    M.offers.forEach(o => {
      const k = o.npc + '|' + (o.path || []).join(' > ');
      const npcRow = (M.npcs || []).find(n => n.name === o.npc) || {};
      const offer = { npc: o.npc, x: npcRow.x, y: npcRow.y, path: o.path || [], kind: o.kind, shopId: o.shopId, listId: o.listId, entry: o.entry };
      // an exchange that costs ONLY adena (Galladucci / Alexandria: the A / B grade weapons + armor of north Giran) is shown with its price like a shop item
      const onlyAdena = Array.isArray(o.cost) && o.cost.length === 1 && Number(o.cost[0].id) === 57;
      (groups[k] = groups[k] || { npc: o.npc, title: o.title || '', list: (o.path || []).join(' > '), rows: [] }).rows.push(Object.assign(facts(ctx, o.id), { src: 'shop', npc: o.npc, kind2: o.kind, price: onlyAdena ? Number(o.cost[0].count) : (Number(o.price) || 0), cost: o.cost && !onlyAdena ? o.cost.map(c => Object.assign({}, c, { icon: facts(ctx, c.id).icon })) : null, per: Number(o.count) || 1, offer }));
    });
    Object.values(groups).forEach(g => { const old = out.find(x => x.npc === g.npc && x.list === g.list); if (old) old.rows = g.rows; else out.push(g); });
  }
  return { ok: true, at: S.at || null, market: M ? M.at : null, shops: out };
}

// CHARSRC-2026-10-23 (owner: "there need to be an option to get crystals from another character or warehouse"): who else carries this item in the
// bag (Logs/bag_<Name>.json, every window writes its own; max 6 h old) -> [{ name, count, rows: [{ objId, id, name, count, stack }] }], most first
function holdersOf(ctx, tid, except) {
  const out = [];
  try { fs.readdirSync(ctx.LOGS).forEach(f => { const m = /^bag_(.+)\.json$/.exec(f); if (!m || m[1] === except) return; const j = rj(path.join(ctx.LOGS, f), null); if (!j || !Array.isArray(j.items) || Date.now() - (Date.parse(j.at || '') || 0) > 6 * 3600000) return;
    const rows = j.items.filter(r => Number(r.id) === Number(tid) && !r.eq && !r.equipped && !r.q && !r.quest); const count = rows.reduce((a, r) => a + (Number(r.count) || 1), 0);
    if (count > 0) out.push({ name: m[1], count, rows: rows.map(r => ({ objId: Number(r.objId), id: Number(r.id), name: String(r.name || ''), count: Number(r.count) || 1, stack: !!(r.stackable || Number(r.count) > 1) })) }); }); } catch (e) { }
  return out.sort((a, b) => b.count - a.count);
}
// ITEMFIND-2026-10-23 (public tester Vykaax: "Item tab lets you search by bot, but not by item. I knew I had a Heaven's Divider somewhere and
// couldn't find it ... a Hive-wide item search to see who has something and how many"): GET /api/items/find?q=<2+ letters> -> every character
// that has it (bag / worn from Logs/bag_<Name>.json, private warehouse from Logs/wh_private_<Name>.json) + the clan warehouse (Logs/clan_state.json),
// grouped by item then holder, enchant levels kept apart, with how old each source is. Read only; file reads cached by mtime (cached()).
const FIND_MAX = 200;
function findItems(ctx, qRaw) {
  const q = String(qRaw || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (q.length < 2) return { code: 400, error: 'Type at least 2 letters.' };
  if (q.length > 60) return { code: 400, error: 'That search is too long.' };
  const known = new Set((cfg(ctx).accounts || []).filter(a => a.character).map(a => a.character));
  let files = []; try { files = fs.readdirSync(ctx.LOGS); } catch (e) { }
  const groups = {}, src = { bags: 0, bagNewest: null, wh: 0, clanAt: null, clanSeenBy: '' };
  const IT = items(ctx), CA = catalog(ctx);
  const memo = {}, F =(id) => memo[id] || (memo[id] = facts(ctx, id));   // facts() stats two files per call: once per item id per search
  const add = (r, hk, mk, where) => {
    const id = Number(r.id) || 0; if (!id) return;
    const raw = String(r.name || '');
    if (!raw.toLowerCase().includes(q) && !String((CA[id] && CA[id].n) || (IT[id] && IT[id][0]) || '').toLowerCase().includes(q)) return;   // cheap name test first
    const f = F(id), nm = /^item \d+$/.test(f.name) && raw ? raw.replace(/^\+\d+\s+/, '') : f.name;
    if (!nm.toLowerCase().includes(q) && !raw.toLowerCase().includes(q)) return;
    const g = groups[id] = groups[id] || { id, name: nm, icon: f.icon, grade: f.grade, kind: f.kind, total: 0, holders: {} };
    const H = g.holders[hk] = g.holders[hk] || Object.assign(mk(), { total: 0, rows: [] });
    const count = Number(r.count) || 1, enchant = Number(r.enchant) || 0;
    const row = H.rows.find(x => x.where === where && x.enchant === enchant);
    if (row) row.count += count; else H.rows.push({ where, count, enchant });
    H.total += count; g.total += count;
  };
  files.forEach(fn => {
    let m = /^bag_(.+)\.json$/.exec(fn);
    if (m && NAME_RE.test(m[1])) {
      const j = cached('find_bag_' + m[1], path.join(ctx.LOGS, fn), null); if (!j || !Array.isArray(j.items)) return;
      src.bags++; if (j.at && (!src.bagNewest || j.at > src.bagNewest)) src.bagNewest = j.at;
      const nm = m[1], mk = () => ({ name: nm, kind: 'char', known: known.has(nm), bagAt: j.at || null, whAt: null });
      j.items.forEach(r => add(r, 'c:' + nm, mk, (r.eq || r.equipped) ? 'worn' : 'bag'));
      return;
    }
    m = /^wh_private_(.+)\.json$/.exec(fn);
    if (m && NAME_RE.test(m[1])) {
      const j = cached('find_wh_' + m[1], path.join(ctx.LOGS, fn), null); if (!j || !Array.isArray(j.items)) return;
      src.wh++;
      const nm = m[1], mk = () => ({ name: nm, kind: 'char', known: known.has(nm), bagAt: null, whAt: j.seenAt || null });
      j.items.forEach(r => add(r, 'c:' + nm, mk, 'wh'));
      // a holder first made from the bag file gets the warehouse age too
      Object.values(groups).forEach(g => { const H = g.holders['c:' + nm]; if (H && !H.whAt) H.whAt = j.seenAt || null; });
    }
  });
  // the bag file may come after the warehouse file in the folder listing: fill in the bag age where it is missing
  Object.values(groups).forEach(g => Object.values(g.holders).forEach(H => { if (H.kind === 'char' && !H.bagAt) { const j = cached('find_bag_' + H.name, path.join(ctx.LOGS, `bag_${H.name}.json`), null); if (j && j.at) H.bagAt = j.at; } }));
  const cs = cached('find_clan', path.join(ctx.LOGS, 'clan_state.json'), {}) || {};
  if (cs.warehouse && Array.isArray(cs.warehouse.items)) {
    src.clanAt = cs.warehouse.seenAt || null; src.clanSeenBy = cs.warehouse.seenBy || '';
    cs.warehouse.items.forEach(r => add(r, 'clan', () => ({ name: 'Clan warehouse', kind: 'clan', clanAt: src.clanAt, seenBy: src.clanSeenBy }), 'clan'));
  }
  // best matches first: the exact name, then names that start with it, then the rest by name; holders with the most first
  const rank = (g) => { const n = g.name.toLowerCase(); return n === q ? 0 : n.startsWith(q) ? 1 : n.split(/[\s'(-]+/).some(w => w.startsWith(q)) ? 2 : 3; };
  const all = Object.values(groups).sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
  const out = []; let n = 0, truncated = false;
  for (const g of all) {
    const hs = Object.values(g.holders).sort((a, b) => (a.kind === 'clan') - (b.kind === 'clan') || b.total - a.total || a.name.localeCompare(b.name));
    hs.forEach(H => H.rows.sort((a, b) => ['worn', 'bag', 'wh', 'clan'].indexOf(a.where) - ['worn', 'bag', 'wh', 'clan'].indexOf(b.where) || b.enchant - a.enchant));
    if (n + hs.length > FIND_MAX) { const room = FIND_MAX - n; if (room > 0) { out.push(Object.assign({}, g, { holders: hs.slice(0, room), more: hs.length - room })); n += room; } truncated = true; break; }
    out.push(Object.assign({}, g, { holders: hs })); n += hs.length;
  }
  return { ok: true, q, items: out, results: n, truncated, sources: src, clanLeader: clanLeader(ctx), at: isoNow() };
}
// ---- the plan ----
async function plan(ctx, b) {
  const name = String(b.name || ''); if (!NAME_RE.test(name)) return { code: 400, error: 'Choose a character.' };
  const it = b.item || {}; const id = Number(it.id); if (!(id > 0)) return { code: 400, error: 'Choose an item.' };
  const src = ['bag', 'wh', 'clan', 'shop'].includes(it.src) ? it.src : 'bag';
  const C = await charInfo(ctx, name, false); if (C.error) return C;
  const S = { bag: C.bag.map(r => ({ id: r.id, count: r.count, eq: r.eq })), wh: C.wh, clan: C.clan };
  const F = facts(ctx, id), steps = [], needs = [], warn = [], R = rates(ctx);
  let cur = Number(it.enchant) || 0, adena = 0, chance = 1;
  // ASK FIRST (owner 2026-10-17: "Dont take ANYTHING automatically! Always ask. And let the user select!"): for every material the page shows
  // where it could come from (the bag, the private warehouse, the clan warehouse, buying it in Giran) and the OWNER picks; b.sources = { <item id>:
  // 'wh' | 'clan' | 'buy' }. Without a pick only the character's own bag counts — nothing leaves a warehouse and nothing is bought on its own.
  const pick = (b.sources && typeof b.sources === 'object') ? b.sources : {};
  const M = cached('market', path.join(ctx.DATA, 'giran_market.json'), null);
  const offerFor = (tid) => { if (!M || !Array.isArray(M.offers)) return null; const offs = M.offers.filter(o => Number(o.id) === Number(tid)); return offs.filter(o => o.kind === 'shop').sort((a, b2) => a.price - b2.price)[0] || offs.find(o => o.kind === 'exchange' && !(o.cost || []).some(c => Number(c.id) === Number(tid))) || null; };
  const takeFrom = (what, tid, n, depth) => {
    const h = IL.have(tid, S), bag = Math.min(n, h.bag), rest = n - bag, choice = rest > 0 ? String(pick[tid] || '') : '';
    const best = offerFor(tid), from = { bag, wh: 0, clan: 0, buy: 0 };
    const holders = rest > 0 ? holdersOf(ctx, tid, name) : [];   // CHARSRC: another character's bag
    const need = { what, id: tid, need: n, have: h, from, missing: 0, choice, options: { chars: holders.map(x => ({ name: x.name, count: x.count })), wh: h.wh, clan: h.clan, buy: best ? { npc: best.npc, kind: best.kind, price: best.price || 0, cost: best.cost || null } : null }, ask: rest > 0 };
    if (rest > 0) {
      if (/^char:/.test(choice)) {   // CHARSRC: that character hands it over in Giran (hand-over machinery)
        const H = holders.find(x => 'char:' + x.name === choice);
        if (H) { let left = rest; const rows = []; H.rows.forEach(r => { if (left <= 0) return; const c = r.stack ? Math.min(left, r.count) : 1; rows.push(Object.assign({}, r, { count: c })); left -= c; });
          from.char = { name: H.name, count: rest - left, rows }; need.missing = left;
          steps.splice(1, 0, { k: 'handover', text: `${H.name} hands ${rest - left}× ${what} to ${name} in Giran` }); }
        else need.missing = rest;
      }
      else if (choice === 'wh') { from.wh = Math.min(rest, h.wh); need.missing = rest - from.wh; }
      else if (choice === 'clan') { from.clan = Math.min(rest, h.clan); need.missing = rest - from.clan; }
      else if (choice === 'buy' && best && !depth) {
        const per = Math.max(1, Number(best.count) || 1), times = Math.ceil(rest / per), npcRow = (M.npcs || []).find(x => x.name === best.npc) || {};
        from.buy = rest;
        need.buy = { offer: { npc: best.npc, x: npcRow.x, y: npcRow.y, path: best.path, kind: best.kind, shopId: best.shopId, listId: best.listId, entry: best.entry }, count: best.kind === 'shop' ? rest : times, per };
        if (best.kind === 'shop') { adena += Math.ceil(best.price * rest * 1.2); steps.splice(1, 0, { k: 'buy', text: `buy ${rest.toLocaleString('en-US')}× ${what} at ${best.npc} (about ${IL.kmb(Math.ceil(best.price * rest * 1.2))} adena)` }); }
        else { (best.cost || []).forEach(c => { if (Number(c.id) === 57) adena += Number(c.count) * times; else takeFrom(c.name, Number(c.id), Number(c.count) * times, 1); });
          steps.splice(1, 0, { k: 'buy', text: `exchange at ${best.npc}: ${(best.cost || []).map(c => (Number(c.count) * times).toLocaleString('en-US') + '× ' + c.name).join(' + ')} → ${(per * times).toLocaleString('en-US')}× ${what}` }); }
      } else need.missing = rest;
    }
    if (depth) needs.unshift(need); else needs.push(need);
    return need;
  };
  // 1. get it
  const count = Math.max(1, Math.min(100000, Number(b.count) || 1));
  let offer = null, alsoHave = [];
  if (src === 'shop') {
    const all = [].concat(...shops(ctx).shops.map(x => x.rows));
    const o = it.offer || null;
    const row = (o && all.find(r => r.id === id && r.offer && r.offer.npc === o.npc && String(r.offer.path) === String(o.path))) || all.find(r => r.id === id && !r.cost) || all.find(r => r.id === id);
    if (!row) return { code: 400, error: `${F.name} is not on a Giran NPC's list.` };
    offer = row.offer || null;
    if (row.cost) {   // an exchange: what it costs comes from the bag / warehouse / clan warehouse; adena from the purse
      row.cost.forEach(c => { if (Number(c.id) === 57) adena += Number(c.count) * count; else takeFrom(c.name, Number(c.id), Number(c.count) * count); });
      steps.push({ k: 'buy', text: `${name} goes to ${row.npc} in Giran and exchanges ${count > 1 ? count + '× ' : ''}${row.cost.map(c => (Number(c.count) * count).toLocaleString('en-US') + '× ' + c.name).join(' + ')} for ${F.name}` });
    } else {
      adena += Math.ceil(row.price * count * 1.2);
      steps.push({ k: 'buy', text: `${name} goes to Giran and buys ${count > 1 ? count + '× ' : ''}${F.name} at ${row.npc} (about ${IL.kmb(Math.ceil(row.price * count * 1.2))} adena with tax)` });
    }
    cur = 0;
    // the owner (2026-10-17): "Dagger1 has a Homunkulus's Sword in the clan warehouse though" -> pieces we own already, to use instead of buying
    alsoHave = [].concat(C.bag.filter(x => x.id === id).map(x => ({ src: 'bag', enchant: x.enchant, eq: x.eq, objId: x.objId })), C.wh.filter(x => x.id === id).map(x => ({ src: 'wh', enchant: x.enchant })), C.clan.filter(x => x.id === id).map(x => ({ src: 'clan', enchant: x.enchant }))).map(x => Object.assign(x, { overSafe: (x.enchant || 0) > (R.safe || 4), rare: (x.enchant || 0) >= PROTECT_ENCH })).sort((a, b) => a.enchant - b.enchant);   // above +4: shown with a warning, picked only by the owner
    if (alsoHave.length) warn.unshift(`You already have ${alsoHave.length} of these: ${alsoHave.map(x => '+' + x.enchant + ' ' + ({ bag: 'in the bag', wh: 'in the warehouse', clan: 'in the clan warehouse' }[x.src])).join(', ')} — tap one below to use it instead of buying.`);
    if (F.common && (b.enchantTo || b.saId)) warn.push('Common items cannot be enchanted or get a Special Ability (no set bonus either).');
  } else if (src === 'wh') steps.push({ k: 'take', text: `${name} takes ${F.name}${cur ? ' +' + cur : ''} out of its private warehouse (Giran)` });
  else if (src === 'clan') steps.push({ k: 'clan', text: name === C.clanLeader ? `${name} takes ${F.name}${cur ? ' +' + cur : ''} out of the clan warehouse` : `the clan leader ${C.clanLeader || '?'} takes ${F.name}${cur ? ' +' + cur : ''} out of the clan warehouse and hands it to ${name}` });
  // 2. enchant (first: a destroyed item never wasted the SA materials)
  const to = Number(b.enchantTo) || 0;
  if (to > cur) {
    if (F.common) return { code: 400, error: 'Common items cannot be enchanted.' };
    if (F.grade === 'NONE') return { code: 400, error: 'No-grade items cannot be enchanted.' };
    const sc = IL.scrollFor(F.kind || 'armor', F.grade, !!b.blessed);
    const n = to - cur; takeFrom(`${b.blessed ? 'Blessed ' : ''}Scroll: Enchant ${F.kind === 'weapon' ? 'Weapon' : 'Armor'} (${IL.gradeKey(F.grade)}-Grade)`, sc, n);
    chance = IL.chanceTo(cur, to, F.kind, F.full, R);
    const safe = F.full ? R.safeFull : R.safe;
    steps.push({ k: 'enchant', text: `enchant +${cur} → +${to}: ${n} scroll(s), one try per level; chance to reach +${to}: ${IL.pct(chance)}${to > safe ? ` — above the safe +${safe}: a fail ${b.blessed ? 'drops it to +0 (blessed scroll)' : 'DESTROYS the item (it turns into crystals)'}` : ''}` });
    if (to > safe) warn.push(`Above +${safe} a failed ${b.blessed ? 'blessed scroll resets the item to +0' : 'normal scroll destroys the item'}. If it fails, it fails: the job stops there.`);
  }
  // 3. Special Ability AFTER enchanting (the exchange keeps the enchant level; a failed enchant first costs no soul crystal / gemstones)
  let finalId = id;
  if (b.saId) {
    const o = IL.saOptions(F.base || id, saRecipes(ctx)).find(x => Number(x.saId) === Number(b.saId));
    if (!o) return { code: 400, error: `No such Special Ability for ${F.name}.` };
    if (F.sa) return { code: 400, error: `${F.name} already has a Special Ability (${F.sa}).` };
    takeFrom(`${o.color} Soul Crystal stage ${o.stage}`, o.cid, 1);
    if (o.gem && o.gem.count) takeFrom(`${o.gem.name}`, o.gem.id, o.gem.count);
    adena += Math.ceil(o.adena * 1.2);
    steps.push({ k: 'sa', text: `at the Giran blacksmith (Pushkin): ${F.name} + ${o.color} Soul Crystal stage ${o.stage} + ${o.gem ? o.gem.count + ' ' + o.gem.name : ''} + about ${IL.kmb(Math.ceil(o.adena * 1.2))} adena → ${F.name} - ${o.sa}` });
    finalId = Number(o.saId);
  }
  // 4. give + wear
  const giveTo = String(b.giveTo || '');
  if (giveTo) {
    if (!NAME_RE.test(giveTo)) return { code: 400, error: 'giveTo?' };
    const R2 = (ctx.readStates ? ctx.readStates() : []).find(s => s.name === giveTo) || {};
    if (!IL.levelOk(F.grade, R2.level)) warn.push(`${giveTo} is level ${R2.level || '?'}: ${F.grade}-grade needs level ${IL.GRADE_LEVEL[F.grade]} (a penalty when worn below it).`);
    steps.push({ k: 'give', text: giveTo === name ? `${name} puts it on (in place of what it wears there now)` : `${giveTo}'s party goes to Giran; ${name} hands it over; ${giveTo} puts it on (in place of what it wears there); the party carries on` });
  }
  const missing = needs.filter(n => n.missing > 0);
  // OVER THE SAFE LIMIT (owner 2026-10-17: "Anything over the safe limit is no go unless an explicit warning was given"): a warehouse piece above +4
  // or enchanting above +4 -> the page shows a red warning that must be ticked (b.overSafeOk); without it the plan is not doable
  const SAFE = R.safe || 4, overSafe = [];
  if ((src === 'wh' || src === 'clan') && cur > SAFE) overSafe.push(`${F.name} +${cur} is above the safe +${SAFE}${cur >= PROTECT_ENCH ? ' — a +' + cur + ' is extremely rare and game changing' : ''}: it leaves the ${src === 'clan' ? 'clan ' : ''}warehouse only because you pick it here.`);
  // BUY WARNINGS (owner 2026-10-17: "not automatically but should warn and give options to purchase items if the user wants, with a warning")
  if (src === 'shop' && adena >= 3000000) overSafe.push(`This costs about ${IL.kmb(adena)} adena of ${name}'s ${IL.kmb(C.adena)}.`);
  if (src === 'shop' && F.kind && !IL.levelOk(F.grade, C.level)) overSafe.push(`${name} is level ${C.level || '?'}: ${F.grade}-grade needs level ${IL.GRADE_LEVEL[F.grade]} — worn earlier it gives a heavy penalty.`);
  if (to > SAFE) overSafe.push(`Enchanting to +${to} goes above the safe +${SAFE}: every try above +${SAFE} can ${b.blessed ? 'drop it to +0' : 'DESTROY the item'}.`);
  const overSafeOk = !!b.overSafeOk && overSafe.length > 0;
  if (missing.some(n => n.ask && !n.choice)) warn.unshift('Choose where each missing thing comes from (below): nothing is taken out of a warehouse or bought unless you pick it.');
  if (adena > C.adena) warn.push(`${name} has ${IL.kmb(C.adena)} adena, this needs about ${IL.kmb(adena)} — get adena first (Adena page / Trade).`);
  if (C.clan.length && needs.some(n => n.from.clan > 0) && !C.clanLeader) warn.push('No clan leader known for the clan warehouse.');
  const saOpts = F.kind === 'weapon' && !F.sa && !F.common ? IL.saOptions(F.base || id, saRecipes(ctx)) : [];
  return { ok: !missing.length && adena <= C.adena + 1 && (!overSafe.length || overSafeOk), overSafe, overSafeOk, saOptions: saOpts, offer, count, alsoHave, name, item: Object.assign(F, { src, enchant: Number(it.enchant) || 0, objId: Number(it.objId) || 0 }), finalId, enchantTo: to, blessed: !!b.blessed, saId: Number(b.saId) || 0, giveTo,
    steps, needs, missing, adena, haveAdena: C.adena, chance, ladder: to > cur ? IL.ladder(cur, to, F.kind, F.full, R) : [], gain: IL.gainOf({ s: F.slot, g: F.grade, t: F.wtype }, cur, to), rates: R, warn };
}
const JOBDIR = (ctx) => path.join(ctx.LOGS, 'itemjobs');
async function job(ctx, b) {
  const p = await plan(ctx, b); if (p.error) return p;
  if (p.missing.length) return { code: 409, error: `Missing: ${p.missing.map(m => `${m.missing}× ${m.what}`).join(', ')}.`, plan: p };
  if (!ctx.commandRun) return { code: 500, error: 'the dashboard server needs a restart' };
  const id = `ij_${p.name.toLowerCase()}_${Date.now().toString(36)}`;
  const J = { id, doer: p.name, item: { src: p.item.src, id: p.item.id, objId: p.item.objId, enchant: p.item.enchant, name: p.item.name, kind: p.item.kind, grade: p.item.grade, full: p.item.full, offer: p.offer || null, count: p.count || 1 },
    sa: p.saId ? Object.assign({}, IL.saOptions(p.item.base || p.item.id, saRecipes(ctx)).find(x => Number(x.saId) === p.saId), { weapon: p.item.id }) : null,
    enchant: p.enchantTo > p.item.enchant ? { to: p.enchantTo, blessed: p.blessed, scroll: IL.scrollFor(p.item.kind || 'armor', p.item.grade, p.blessed) } : null,
    finalId: p.finalId, overSafeOk: !!p.overSafeOk, give: p.giveTo ? { to: p.giveTo } : null, needs: p.needs.map(n => ({ id: n.id, what: n.what, need: n.need, from: n.from, buy: n.buy || null, choice: n.choice || '' })), clanLeader: clanLeader(ctx),
    steps: p.steps.map(s => s.text), created: isoNow(), by: String(b.by || 'dashboard').slice(0, 40) };
  fs.mkdirSync(JOBDIR(ctx), { recursive: true });
  fs.writeFileSync(path.join(JOBDIR(ctx), id + '.json'), JSON.stringify(J, null, 1));
  const r = await ctx.commandRun({ cmd: `!itemjob ${id}`, targets: ['chars:' + [p.name].concat(p.giveTo && p.giveTo !== p.name ? [p.giveTo] : []).concat(J.clanLeader && p.needs.some(n => n.from.clan > 0) && J.clanLeader !== p.name ? [J.clanLeader] : []).join(',')] });
  const body = r && r.body ? r.body : r;
  try { fs.appendFileSync(path.join(ctx.LOGS, 'dashboard_commands.log'), `${isoNow()}\titems\tjob ${id}: ${J.steps.join(' / ').slice(0, 400)}\t${J.by}\r\n`); } catch (e) { }
  if (body && body.error) return { code: 500, error: body.error };
  return { ok: true, id, job: J };
}
/** ENCHMANY-2026-10-18: several bag pieces to +to in one job (the bot enchants them one after another, one scroll at a time) */
async function enchantMany(ctx, b) {
  const name = String(b.name || ''); if (!NAME_RE.test(name)) return { code: 400, error: 'name?' };
  const to = Number(b.to) || 0; if (to < 1 || to > 25) return { code: 400, error: 'pick a + level' };
  // ENCHMANY-WH 2026-10-20 (owner: "Its not under 'Clan Warehouse'"): items = [{ src: bag|wh|clan, objId (bag), id, enchant }]; the old objIds = bag only
  const picks = Array.isArray(b.items) && b.items.length ? b.items.map(x => ({ src: String(x.src || 'bag'), objId: Number(x.objId) || 0, id: Number(x.id) || 0, enchant: Number(x.enchant) || 0 }))
    : (Array.isArray(b.objIds) ? b.objIds : []).map(Number).filter(Boolean).map(oid => ({ src: 'bag', objId: oid }));
  if (!picks.length) return { code: 400, error: 'tick at least one item' };
  if (picks.some(p => !['bag', 'wh', 'clan'].includes(p.src))) return { code: 400, error: 'items come from the bag, the warehouse or the clan warehouse' };
  const C = await charInfo(ctx, name, false); if (C.error) return C;
  const R = rates(ctx), safe = Number(R.safe) || 4, blessed = !!b.blessed, list = [], skip = [], need = {}, whOver = [];
  const used = { wh: {}, clan: {} };                                       // several identical warehouse pieces: each pick takes one more
  for (const p of picks) {
    let r = null;
    if (p.src === 'bag') { r = C.bag.find(x => Number(x.objId) === p.objId); if (!r) { skip.push(`item ${p.objId} is not in the bag`); continue; } }
    else {
      const k = `${p.id}:${p.enchant}`, n = (used[p.src][k] || 0) + 1;
      const rows = C[p.src].filter(x => Number(x.id) === p.id && (Number(x.enchant) || 0) === p.enchant), have = rows.reduce((s, x) => s + (Number(x.count) || 1), 0);
      if (have < n) { skip.push(`${(rows[0] && rows[0].name) || 'item ' + p.id} +${p.enchant} is not in the ${p.src === 'clan' ? 'clan ' : ''}warehouse (any more)`); continue; }
      used[p.src][k] = n; r = rows[0];
      if (p.enchant >= PROTECT_ENCH) { skip.push(`${r.name} +${p.enchant}: +${PROTECT_ENCH} and higher leaves the warehouse only by its own single pick`); continue; }
      if (p.enchant > safe) whOver.push(`${r.name} +${p.enchant}`);
    }
    if (r.common) { skip.push(`${r.name}: Common items cannot be enchanted`); continue; }
    if (!r.kind || IL.gradeKey(r.grade) === 'NONE') { skip.push(`${r.name}: cannot be enchanted`); continue; }
    const cur = Number(r.enchant) || 0; if (cur >= to) { skip.push(`${r.name} is already +${cur}`); continue; }
    const scroll = IL.scrollFor(r.kind, r.grade, blessed); if (!scroll) { skip.push(`${r.name}: no scroll for it`); continue; }
    need[scroll] = (need[scroll] || 0) + (to - cur);
    list.push({ src: p.src, objId: p.src === 'bag' ? p.objId : 0, id: r.id, name: r.name, from: cur, to, scroll, kind: r.kind, grade: r.grade, chance: IL.chanceTo(cur, to, r.kind, !!r.full, R) });
  }
  const fromClan = list.some(x => x.src === 'clan'), CL = clanLeader(ctx);
  if (fromClan && !CL) return { code: 409, error: 'No clan leader known: nobody can take things out of the clan warehouse.' };
  if (whOver.length && !b.overSafeOk) return { code: 409, error: `${whOver.join(', ')} ${whOver.length === 1 ? 'is' : 'are'} above the safe +${safe}: tick the warning first (it leaves the warehouse only because you pick it).`, needWarning: true };
  if (!list.length) return { code: 400, error: skip.join('; ') || 'nothing to enchant' };
  // ENCHSCROLLS 2026-10-20 (owner: "it says there is not enchants in the bags?" — Dagger1: 0 in the bag, 644 / 31 / 363 ... in the clan warehouse):
  // scrolls missing from the bag are OFFERED from the warehouse / clan warehouse (scrollOptions); taken only when the owner says yes (scrollsFrom)
  const cnt = (rows, sid) => rows.filter(x => x.id === Number(sid)).reduce((n, x) => n + (Number(x.count) || 0), 0);
  const have = (sid) => cnt(C.bag, sid), take = b.scrollsFrom === 'warehouses';
  const opts = [], scrollNeeds = [];
  for (const sid of Object.keys(need)) {
    const bag = have(sid), gap = need[sid] - bag; if (gap <= 0) continue;
    const w = cnt(C.wh, sid), c = cnt(C.clan, sid), nm = facts(ctx, sid).name;
    opts.push({ id: Number(sid), name: nm, need: need[sid], bag, wh: w, clan: c });
    if (take) { const fw = Math.min(gap, w), fc = Math.min(gap - fw, c); if (fw + fc > 0) scrollNeeds.push({ id: Number(sid), what: nm, need: bag + fw + fc, from: { bag, wh: fw, clan: fc } }); }
  }
  if (!take && opts.some(o => o.wh + o.clan > 0)) return { code: 409, error: `Not enough enchant scrolls in ${name}'s bag — they can come from the ${opts.some(o => o.clan) ? 'clan ' : ''}warehouse.`, scrollOptions: opts };
  const got = (o) => o.bag + (take ? Math.min(o.need - o.bag, o.wh + o.clan) : 0);
  const missing = opts.filter(o => got(o) < 1).map(o => o.name);
  if (missing.length) return { code: 409, error: `No ${missing.join(', ')} in ${name}'s bag, warehouse or the clan warehouse` };
  const short = opts.filter(o => got(o) < o.need).map(o => `${o.name}: ${got(o)} of up to ${o.need}`);
  const scrollClan = scrollNeeds.some(n => n.from.clan > 0);
  if (scrollClan && !CL) return { code: 409, error: 'No clan leader known: nobody can take scrolls out of the clan warehouse.' };
  const over = to > safe;
  if (over && !b.overSafeOk) return { code: 409, error: `+${to} is above the safe +${safe}: a failed ${blessed ? 'blessed scroll drops the item to +0' : 'scroll DESTROYS the item'}. Tick the warning first.`, needWarning: true };
  const id = `ij_${name.toLowerCase()}_${Date.now().toString(36)}`;
  const takeTxt = (x) => x.src === 'clan' ? `take ${x.name} +${x.from} out of the clan warehouse${CL && CL !== name ? ` (${CL} hands it over)` : ''}, then ` : x.src === 'wh' ? `take ${x.name} +${x.from} out of the warehouse, then ` : '';
  const steps = scrollNeeds.map(n => `take ${n.need - n.from.bag}× ${n.what} out of the ${n.from.clan ? (n.from.wh ? 'warehouse + clan warehouse' : 'clan warehouse') : 'warehouse'}${n.from.clan && CL && CL !== name ? ` (${CL} hands them over)` : ''}`)
    .concat(list.map(x => `${takeTxt(x)}enchant ${x.name} +${x.from} → +${to} (chance ${IL.pct(x.chance)})`)).concat(short.length ? [`scrolls may run out: ${short.join(', ')}`] : []).concat(skip.map(s => `skipped: ${s}`));
  const J = { id, doer: name, item: { src: list[0].src, id: list[0].id, objId: list[0].objId, enchant: list[0].from, name: `${list.length} item(s) to +${to}`, kind: list[0].kind, grade: list[0].grade },
    enchantMany: list.map(x => ({ src: x.src, objId: x.objId, id: x.id, from: x.from, name: x.name, to, scroll: x.scroll })), overSafeOk: !!b.overSafeOk, clanLeader: CL, needs: scrollNeeds, steps, created: isoNow(), by: String(b.by || 'dashboard').slice(0, 40) };
  fs.mkdirSync(JOBDIR(ctx), { recursive: true });
  fs.writeFileSync(path.join(JOBDIR(ctx), id + '.json'), JSON.stringify(J, null, 1));
  try { fs.appendFileSync(path.join(ctx.LOGS, 'dashboard_commands.log'), `${isoNow()}	items	job ${id}: ${steps.join(' / ').slice(0, 400)}	${J.by}
`); } catch (e) { }
  const r = await ctx.commandRun({ cmd: `!itemjob ${id}`, targets: ['chars:' + [name].concat((fromClan || scrollClan) && CL !== name ? [CL] : []).join(',')] });   // the clan leader hears it to hand the pieces over
  const body = r && r.body ? r.body : r; if (body && body.error) return { code: 500, error: body.error };
  return { ok: true, id, job: J, skipped: skip, short };
}
/** BUYMANY-2026-10-23 (owner: "Under /items/ I need to be able to purchase multiple items"): several shop items in ONE job = one Giran trip,
 *  each bought at its own NPC (adena items; an exchange that costs other items keeps its own single job: its materials need a pick).
 *  b = { name, items: [{ id, count, npc?, path? }], overOk } -> the job; nothing is bought before the owner presses the button (ASK FIRST). */
async function buyMany(ctx, b) {
  const name = String(b.name || ''); if (!NAME_RE.test(name)) return { code: 400, error: 'Choose a character.' };
  const picks = (Array.isArray(b.items) ? b.items : []).map(x => ({ id: Number(x.id) || 0, count: Math.max(1, Math.min(100000, Number(x.count) || 1)), npc: String(x.npc || ''), path: Array.isArray(x.path) ? x.path.join(' > ') : String(x.path || '') })).filter(x => x.id > 0);
  if (!picks.length) return { code: 400, error: 'Add at least one item to the list.' };
  if (picks.length > 40) return { code: 400, error: 'At most 40 different items in one list.' };
  const C = await charInfo(ctx, name, false); if (C.error) return C;
  const all = [].concat(...shops(ctx).shops.map(x => x.rows)), list = [], skip = [], warn = [];
  let adena = 0;
  for (const p of picks) {
    const rows = all.filter(r => r.id === p.id && !r.cost && r.price > 0);
    const row = rows.find(r => r.npc === p.npc && (!p.path || !r.offer || (r.offer.path || []).join(' > ') === p.path)) || rows.sort((a, c) => a.price - c.price)[0];
    if (!row) { const f = facts(ctx, p.id); skip.push(`${f.name || 'item ' + p.id}: no Giran NPC sells it for adena (an exchange: buy it on its own)`); continue; }
    const cost = Math.ceil(row.price * p.count * 1.2);
    adena += cost;
    if (row.kind && !IL.levelOk(row.grade, C.level)) warn.push(`${row.name}: ${row.grade}-grade needs level ${IL.GRADE_LEVEL[row.grade]} (${name} is ${C.level || '?'})`);
    list.push({ id: row.id, name: row.name, count: p.count, npc: row.npc, price: row.price, cost, offer: row.offer || null });
  }
  if (!list.length) return { code: 400, error: skip.join('; ') };
  if (adena > C.adena) return { code: 409, error: `${name} has ${IL.kmb(C.adena)} adena, this list costs about ${IL.kmb(adena)} with tax — remove items or get adena first.`, adena, haveAdena: C.adena, list, skipped: skip };
  if ((adena >= 3000000 || warn.length) && !b.overOk) return { code: 409, needWarning: true, error: `Please confirm: about ${IL.kmb(adena)} adena of ${name}'s ${IL.kmb(C.adena)}${warn.length ? '; ' + warn.join('; ') : ''}.`, adena, haveAdena: C.adena, list, skipped: skip, warn };
  const id = `ij_${name.toLowerCase()}_${Date.now().toString(36)}`;
  const steps = [`${name} goes to Giran once`].concat(list.map(x => `buy ${x.count.toLocaleString('en-US')}× ${x.name} at ${x.npc} (about ${IL.kmb(x.cost)} adena)`)).concat(skip.map(s => `skipped: ${s}`));
  const J = { id, doer: name, item: { src: 'shop', id: list[0].id, name: `${list.length} item(s) from the Giran shops`, count: 1 }, buyMany: list.map(x => ({ id: x.id, name: x.name, count: x.count, npc: x.npc, offer: x.offer })),
    adena, needs: [], steps, created: isoNow(), by: String(b.by || 'dashboard').slice(0, 40) };
  fs.mkdirSync(JOBDIR(ctx), { recursive: true });
  fs.writeFileSync(path.join(JOBDIR(ctx), id + '.json'), JSON.stringify(J, null, 1));
  try { fs.appendFileSync(path.join(ctx.LOGS, 'dashboard_commands.log'), `${isoNow()}\titems\tjob ${id}: ${steps.join(' / ').slice(0, 400)}\t${J.by}\r\n`); } catch (e) { }
  if (!ctx.commandRun) return { code: 500, error: 'the dashboard server needs a restart' };
  const r = await ctx.commandRun({ cmd: `!itemjob ${id}`, targets: ['chars:' + name] });
  const body = r && r.body ? r.body : r; if (body && body.error) return { code: 500, error: body.error };
  return { ok: true, id, job: J, skipped: skip, adena };
}
/** the doer status + the receiver steps in one time line (the job is done when the receiver wore it / failed when either failed) */
function mergeStatus(a, b) {
  if (!a && !b) return null; if (!b) return a;
  const steps = (a ? a.steps || [] : []).concat(b.steps || []).sort((x, y) => String(x.t).localeCompare(String(y.t)));
  let state = a ? a.state : 'running', result = a ? a.result : '';
  if (a && a.state === 'done' && /^given to/.test(String(a.result || ''))) { state = b.state === 'done' ? 'done' : b.state === 'failed' ? 'failed' : 'running'; result = b.state === 'done' ? `${a.result}, ${b.result}` : b.state === 'failed' ? b.step : 'waiting for the receiver to put it on'; }
  if (b.state === 'failed' && (!a || a.state !== 'done')) { state = 'failed'; result = b.step; }
  return Object.assign({}, a || {}, { state, result, steps, step: steps.length ? steps[steps.length - 1].msg : '' });
}
function jobStatus(ctx, id) {
  if (!/^ij_[a-z0-9_-]{3,60}$/i.test(id)) return { code: 400, error: 'id?' };
  const J = rj(path.join(JOBDIR(ctx), id + '.json'), null); if (!J) return { code: 404, error: 'no such job' };
  return { ok: true, job: J, status: mergeStatus(rj(path.join(JOBDIR(ctx), id + '_status.json'), null), rj(path.join(JOBDIR(ctx), id + '_rx.json'), null)) };
}
function recentJobs(ctx, name) {
  try { return fs.readdirSync(JOBDIR(ctx)).filter(f => /^ij_.*\.json$/.test(f) && !/_status\.json$/.test(f)).map(f => rj(path.join(JOBDIR(ctx), f), null)).filter(j => j && (!name || j.doer === name || (j.give && j.give.to === name)))
    .sort((a, b) => String(b.created).localeCompare(String(a.created))).slice(0, 8).map(j => ({ id: j.id, doer: j.doer, name: j.item.name, created: j.created, steps: j.steps, status: mergeStatus(rj(path.join(JOBDIR(ctx), j.id + '_status.json'), null), rj(path.join(JOBDIR(ctx), j.id + '_rx.json'), null)) })); } catch (e) { return []; }
}

// ---- the detailed log (owner 2026-10-17: "I want a detailed log on what is going on") ----
const LOGFILES = [['itemjobs.log', 'item job'], ['craftmake.log', 'crafting'], ['dispatch.log', 'dispatch'], ['whtake.log', 'warehouse'], ['enchant.log', 'enchant'], ['handover.log', 'hand-over']];
function tailLines(file, max) { try { const st = fs.statSync(file), len = Math.min(st.size, 400000), fd = fs.openSync(file, 'r'), buf = Buffer.alloc(len); fs.readSync(fd, buf, 0, len, st.size - len); fs.closeSync(fd); return buf.toString('utf8').split(/\r?\n/).filter(Boolean).slice(-max); } catch (e) { return []; } }
function activity(ctx, name, n) {
  const out = [], max = Math.max(20, Math.min(1000, Number(n) || 200));
  LOGFILES.forEach(([f, kind]) => tailLines(path.join(ctx.LOGS, f), max).forEach(l => {
    const m = /^(\d{4}-\d\d-\d\dT[\d:.]+Z)\s+\[([^\]]+)\]\s*(.*)$/.exec(l); if (!m) return;
    if (name && m[2] !== name && !m[3].includes(name)) return;
    out.push({ t: m[1], who: m[2], kind, text: m[3].slice(0, 500) });
  }));
  return { ok: true, lines: out.sort((a, b) => b.t.localeCompare(a.t)).slice(0, max) };
}
// ---- crafting ----
let RECIPES = null;
function recipes(ctx) {
  if (RECIPES) return RECIPES;
  const out = []; let x = ''; try { x = fs.readFileSync(path.join(ctx.DATA, 'dp', 'recipes.xml'), 'utf8'); } catch (e) { }
  x.replace(/<item id="(\d+)" recipeId="(\d+)" name="([^"]*)" craftLevel="(\d+)" type="(\w+)" successRate="(\d+)">([\s\S]*?)<\/item>/g, (m, list, rid, nm, lvl, type, rate, body) => {
    const ing = []; body.replace(/<ingredient id="(\d+)" count="(\d+)"/g, (q, i, c) => { ing.push({ id: Number(i), count: Number(c) }); return q; });
    const pr = /<production id="(\d+)" count="(\d+)"/.exec(body), mp = /<statUse name="MP" value="(\d+)"/.exec(body);
    if (pr) out.push({ list: Number(list), recipe: Number(rid), code: nm, level: Number(lvl), dwarven: type === 'dwarven', rate: Number(rate), product: Number(pr[1]), count: Number(pr[2]), mp: mp ? Number(mp[1]) : 0, ing });
    return m;
  });
  RECIPES = out; return out;
}
async function craftInfo(ctx, name) {
  if (!NAME_RE.test(name)) return { code: 400, error: 'name?' };
  const C = await charInfo(ctx, name, false); if (C.error) return C;
  const rep = rj(path.join(ctx.LOGS, `crafter_bag_${name}.json`), {}) || {}, live = rj(path.join(ctx.LOGS, `crafter_${name}.json`), {}) || {};
  const createLvl = Number(rep.createLvl) || 0, commonLvl = Number(rep.commonLvl) || 0;
  if (!createLvl && !commonLvl) return { ok: true, name, crafter: false, why: `${name} cannot craft (Create Item is a Dwarf skill).` };
  const bk = (live.book && live.book.ids) || rep.book || null, book = Array.isArray(bk) ? bk : (bk && Array.isArray(bk.ids) ? bk.ids : null);   // the report holds a list or { ids }
  const S = { bag: C.bag.map(r => ({ id: r.id, count: r.count, eq: r.eq })), wh: C.wh, clan: C.clan };
  const list = recipes(ctx).filter(r => r.dwarven ? r.level <= createLvl : r.level <= commonLvl).map(r => {
    const can = IL.craftCan(r, S), P = facts(ctx, r.product);
    return Object.assign({}, r, { name: P.name, icon: P.icon, grade: P.grade, slot: P.slot, kind: P.kind, learned: book ? book.includes(r.list) : null, can: can.can,
      ing: can.ing.map(g => Object.assign(g, { name: facts(ctx, g.id).name, icon: facts(ctx, g.id).icon })) });
  });
  return { ok: true, name, crafter: true, createLvl, commonLvl, mp: live.mp || null, maxMp: live.maxMp || null, bookKnown: !!book, whSeen: C.whSeen, clanSeen: C.clanSeen, clanLeader: C.clanLeader, recipes: list };
}
async function craftOrder(ctx, b) {
  const name = String(b.name || ''), list = Number(b.recipe), n = Math.max(1, Math.min(500, Number(b.count) || 1));
  if (!NAME_RE.test(name) || !(list > 0)) return { code: 400, error: 'name + recipe?' };
  const use = b.use || {}, flags = (use.wh ? ' wh' : '') + (use.clan ? ' clan' : '');   // ASK FIRST: the warehouses the owner picked on the Crafting page
  const r = await ctx.commandRun({ cmd: `!craftmake ${list} ${n} ${name}${flags}`, targets: ['chars:' + name] }); const body = r && r.body ? r.body : r;
  try { fs.appendFileSync(path.join(ctx.LOGS, 'dashboard_commands.log'), `${isoNow()}\titems\tcraft ${name} recipe ${list} x${n}\tdashboard\r\n`); } catch (e) { }
  return body && body.error ? { code: 500, error: body.error } : { ok: true };
}

async function handle(req, res, url, ctx) {
  const p = url.pathname;
  if (STATIC[p]) { res.writeHead(200, { 'Content-Type': STATIC[p], 'Cache-Control': 'no-cache' }); res.end(fs.readFileSync(path.join(ctx.DIR || __dirname, path.basename(p)))); return true; }
  if (!p.startsWith('/api/items/')) return false;
  if (!ctx.allowed(req, url)) { ctx.send(res, 401, 'text/plain; charset=utf-8', 'Access denied'); return true; }
  const q = (k) => String(url.searchParams.get(k) || '');
  const out = (r) => { const code = (r && r.code) || 200; if (r) delete r.code; ctx.json(res, code, r || { error: 'no result' }); };
  let b = {}; if (req.method === 'POST') { try { let t = ''; for await (const c of req) t += c; b = JSON.parse(t || '{}'); } catch (e) { out({ code: 400, error: 'bad JSON' }); return true; } }
  try {
    const sub = p.slice('/api/items/'.length);
    if (sub === 'chars') return out(chars(ctx)), true;
    if (sub === 'char') return out(Object.assign(await charInfo(ctx, q('name'), q('fresh') === '1'), { jobs: recentJobs(ctx, q('name')) })), true;
    if (sub === 'shops') return out(shops(ctx)), true;
    if (sub === 'find') return out(findItems(ctx, q('q'))), true;   // ITEMFIND-2026-10-23: hive-wide item search
    if (sub === 'log') return out(activity(ctx, q('name'), q('n'))), true;
    if (sub === 'plan' && req.method === 'POST') return out(await plan(ctx, b)), true;
    if (sub === 'job' && req.method === 'POST') return out(await job(ctx, b)), true;
    if (sub === 'enchantmany' && req.method === 'POST') return out(await enchantMany(ctx, b)), true;
    if (sub === 'buymany' && req.method === 'POST') return out(await buyMany(ctx, b)), true;   // BUYMANY-2026-10-23
    if (sub === 'job') return out(jobStatus(ctx, q('id'))), true;
    if (sub === 'look' && req.method === 'POST') { const n = String(b.name || ''); if (!NAME_RE.test(n)) return out({ code: 400, error: 'name?' }), true; const r = await ctx.commandRun({ cmd: `!whlook ${n}`, targets: ['chars:' + n] }); const bd = r && r.body ? r.body : r; return out(bd && bd.error ? { code: 500, error: bd.error } : { ok: true }), true; }
    if (sub === 'craft' && req.method === 'POST') return out(await craftOrder(ctx, b)), true;
    if (sub === 'craft') return out(await craftInfo(ctx, q('name'))), true;
    out({ code: 404, error: 'unknown items API' }); return true;
  } catch (e) { out({ code: 500, error: e.message }); return true; }
}
module.exports = { handle, chars, charInfo, shops, findItems, plan, job, enchantMany, buyMany, jobStatus, craftInfo, recipes, facts, activity, STATIC };
