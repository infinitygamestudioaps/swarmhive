// FRENZY KIT API (owner 2026-10-14: "a full overview for a destroyer, showing what it is missing in order to do the frenzy with item changing"):
//   GET /api/frenzykit?name=<Name> -> { name, level, cls, destroyer, partners[], slots: [{ key, set, slot, label, why, have: { where: worn|bag|clan,
//   id, name } | null, cheapest: { id, name, grade, price } | null, options }], ready: { swap, low, high, partner }, generated }
// Data: Scripts/data/frenzy_kit.json (docs/plan/tools/frenzy_kit.js), Logs/bag_<Name>.json (worn = eq), Logs/clan_state.json warehouse,
// swarm_state of the party (other destroyers = duel partners). Skills are added by the page (it has the live skill list). Read only.
// KITBUY (owner 2026-10-15: "The destroyer swap kit should never be bought automatically, there should be a button to make the character go
// purchase what is needed"): GET /api/frenzykit?name=<Name>&buy=1 adds { buy } = what "Buy what is missing" can buy: per missing slot the
// cheapest REAL piece a Giran merchant with a recorded route sells (Scripts/data/shopscan_giran.json; Common copies never: no set bonus),
// "not sold in Giran" otherwise, pieces in the clan warehouse, the adena, the town, raid / hunt-timer warnings. Same rules as swarm.js
// KITBUY-PURE kitBuyPlan (docs/plan/tools/test_frenzykit_buy.js checks both). The page sends the order '!kitbuy <Name> <id,id,...>'.
'use strict';
const path = require('path');
const NAME_RE = /^[A-Za-z0-9_\-]{1,40}$/;
const DESTROYER_RE = /Destroyer|Titan|Orc Raider/i;

/** pure: kit + bag rows + clan warehouse rows -> slots with status (exported for the test) */
function kitStatus(kit, bag, clanItems, uns) {
  const byU = (uns && uns.byUnsealed) || {};   // KITGET-2026-10-25: a SEALED copy of a kit piece counts too (unsealed at Pushkin in town)
  const slots = ((kit && kit.slots) || []).map(s => {
    const ids = new Map((s.ids || []).map(x => [Number(x.id), x]));
    const sealedOf = new Map(); (s.ids || []).forEach(x => { const u = byU[x.id]; if (u && u.sealed) sealedOf.set(Number(u.sealed), x); });
    const inBag = (bag || []).filter(i => ids.has(Number(i.id)));
    const worn = inBag.find(i => i.eq), held = inBag.find(i => !i.eq), wh = (clanItems || []).find(i => ids.has(Number(i.id)));
    const sBag = (bag || []).find(i => !i.eq && sealedOf.has(Number(i.id))), sWh = (clanItems || []).find(i => sealedOf.has(Number(i.id)));
    const sealedHave = (r, where) => { const x = sealedOf.get(Number(r.id)), u = byU[x.id]; return { where, id: Number(r.id), name: String(r.name || ''), sealed: true, toId: Number(x.id), toName: x.name, pay: Number(u.pay) || 57, price: Number(u.aa) || 0, list: Number(u.list) || 0 }; };
    const have = worn ? { where: 'worn', id: worn.id, name: ids.get(Number(worn.id)).name } : held ? { where: 'bag', id: held.id, name: ids.get(Number(held.id)).name }
      : wh ? { where: 'clan', id: wh.id, name: ids.get(Number(wh.id)).name } : sBag ? sealedHave(sBag, 'bag') : sWh ? sealedHave(sWh, 'clan') : null;
    const c = (s.ids || [])[0] || null;
    return { key: s.key, set: s.set, slot: s.slot, label: s.label, why: s.why, have, cheapest: c ? { id: c.id, name: c.name, grade: c.grade, price: c.price } : null, options: (s.ids || []).length };
  });
  const setOk = (set) => slots.filter(s => s.set === set).every(s => s.have && s.have.where !== 'clan' && !s.have.sealed);
  const highAny = slots.some(s => s.set === 'high' && s.have && s.have.where !== 'clan' && !s.have.sealed);
  return { slots, ready: { low: setOk('low'), high: setOk('high'), swap: highAny } };   // the bot swaps with whatever it has; without a high piece nothing changes
}
/** pure: the Giran shop index of shopscan_giran.json — id -> offers [{ npc, alt, route, path, price, common, est }], cheapest first. Merchants
 *  without a recorded route / marked unreachable are left out (= swarm.js giranShopIndex: in Giran we only walk recorded routes) */
function shopIndex(scan) {
  const idx = {};
  ((scan && scan.shops) || []).forEach(s => {
    if (!s || s.unreachable || !s.route) return;
    (s.lists || []).forEach(l => (l.items || []).forEach(i => {
      (idx[i.id] = idx[i.id] || []).push({ npc: s.npc, alt: Array.isArray(s.alt) ? s.alt : [], route: s.route, path: l.path || [], price: Number(i.price) || 0, common: /^Common Item/.test(String(i.name)), est: i.est ? 1 : 0 });
    }));
  });
  Object.keys(idx).forEach(k => idx[k].sort((a, b) => a.price - b.price || a.est - b.est));
  return idx;
}
const SA_RE = / - (Conversion|Health|Blessed Body)$/;
/** pure: the buy plan for "Buy what is missing". kit = frenzy_kit.json, slots = kitStatus().slots, idx = shopIndex(), clanItems = clan warehouse rows.
 *  -> rows: one per missing slot of the low / high set (the optional Blessed Body slot is never offered):
 *     { key, set, slot, label, status: 'buy' | 'notsold' | 'clan', id, name, grade, price, npc, route, path, why, clanId?, clanName? } */
function buyPlan(kit, slots, idx) {
  const rows = [];
  ((kit && kit.slots) || []).filter(s => s.set === 'low' || s.set === 'high').forEach(s => {
    const st = (slots || []).find(x => x.key === s.key) || {};
    if (st.have && st.have.where !== 'clan') return;                       // worn or in the bag: never bought again
    const row = { key: s.key, set: s.set, slot: s.slot, label: s.label };
    if (st.have && st.have.where === 'clan') { row.clanId = Number(st.have.id); row.clanName = st.have.name; }
    let best = null;
    (s.ids || []).forEach(x => (idx[x.id] || []).forEach(o => { if (o.common) return; if (!best || o.price < best.o.price) best = { x, o }; }));
    if (best) Object.assign(row, { status: 'buy', id: Number(best.x.id), name: best.x.name, grade: best.x.grade, price: best.o.price, npc: best.o.npc, route: best.o.route, path: best.o.path, est: !!best.o.est,
      why: `${best.o.npc} (Giran, recorded route "${best.o.route}")` });
    else {
      const c = (s.ids || [])[0] || {};
      Object.assign(row, { status: row.clanId ? 'clan' : 'notsold', id: Number(c.id) || 0, name: c.name || s.label, grade: c.grade || '', price: Number(c.price) || 0,
        why: s.slot === 'weapon' && SA_RE.test(String(c.name || '')) ? 'not sold in Giran — shops never sell weapons with a Special Ability (S.A.): get one from a drop / trade, or put the S.A. on with a soul crystal at a blacksmith'
          : 'not sold in Giran — get it elsewhere (drop, craft, trade, a shop in another town)' });
      if (row.clanId) row.status = 'clan';
    }
    rows.push(row);
  });
  return rows;
}
function townNear(x, y) { let best = '', bd = 6000; Object.keys(TOWN_POS).forEach(t => { const d = Math.hypot(TOWN_POS[t][0] - x, TOWN_POS[t][1] - y); if (d < bd) { bd = d; best = t; } }); return best; }
const TOWN_POS = { Giran: [83473, 148554], Gludin: [-80786, 150251], Gludio: [-12712, 122776], Dion: [15619, 143132], Oren: [82760, 53578], Aden: [147448, 25816],
  Hunters: [116589, 76268], Heine: [111381, 218981], Goddard: [147732, -56554], Rune: [43835, -47749], Schuttgart: [87126, -143520] };
function info(ctx, name, wantBuy) {
  if (!NAME_RE.test(String(name || ''))) return { code: 400, error: 'name?' };
  const kit = ctx.readJson(path.join(ctx.DATA, 'frenzy_kit.json'), null);
  if (!kit) return { code: 500, error: 'Scripts/data/frenzy_kit.json is missing — run node docs/plan/tools/frenzy_kit.js' };
  const bag = (ctx.readJson(path.join(ctx.LOGS, 'bag_' + name + '.json'), null) || {}).items || [];
  const cs = ctx.readJson(path.join(ctx.LOGS, 'clan_state.json'), null), clanItems = cs && cs.warehouse && Array.isArray(cs.warehouse.items) ? cs.warehouse.items : [];
  const states = ctx.readStates() || [], me = states.find(s => s.name === name) || {};
  const team = ctx.teamMap() || {}, party = team[name] || me.leader || name;
  // = swarm.js partnerDestroyer: the party's role-'destroyer' characters in name order, paired 1-2, 3-4 ... (an odd last one hits the one before)
  const list = states.filter(s => (s.name === name || (team[s.name] || s.leader) === party) && s.role === 'destroyer').map(s => s.name).filter((v, i, a) => a.indexOf(v) === i).sort();
  const i = list.indexOf(name), pair = i < 0 || list.length < 2 ? null : (i % 2 === 0 ? (list[i + 1] || list[i - 1]) : list[i - 1]);
  const partners = pair ? [pair] : [];
  const st = kitStatus(kit, bag, clanItems, ctx.readJson(path.join(ctx.DATA, 'unseal_h5.json'), null));
  let buy;
  if (wantBuy) {
    const scan = ctx.readJson(path.join(ctx.DATA, 'shopscan_giran.json'), null), rows = buyPlan(kit, st.slots, shopIndex(scan));
    const adenaRow = bag.find(i => Number(i.id) === 57), adena = adenaRow ? Number(adenaRow.count) || 0 : (me.adena != null ? Number(me.adena) || 0 : null);
    const lead = states.find(s => s.name === party) || me, mates = states.filter(s => (team[s.name] || s.leader || s.name) === party);
    const ci = me.clanInfo || (cs && cs.clanInfo) || null, clanLeader = ci && ci.leader ? String(ci.leader) : '';
    const town = isFinite(me.x) && isFinite(me.y) ? townNear(Number(me.x), Number(me.y)) : '';
    const RAIDM = /^(raid|prep|mission)$/;
    const total = rows.filter(r => r.status === 'buy').reduce((a, r) => a + r.price, 0);
    buy = { rows, adena, total, tax: Math.round(total * 0.2), town, inGiran: town === 'Giran', party, isLeader: party === name, solo: mates.length <= 1,
      clanLeader, isClanLeader: !!clanLeader && clanLeader === name, scanAt: scan && scan.at || null,
      raid: RAIDM.test(String(lead.mode || '')) || RAIDM.test(String(me.mode || '')) ? String(lead.mode || me.mode) : '',
      huntTimer: !!(lead.huntTimer && lead.huntTimer.active), leveling: !!(lead.doing && lead.doing.autolevel) || /level/i.test(String(lead.task || '')), online: me.ageSec == null || me.ageSec <= 60 };
  }
  return { code: 200, ok: true, roleOk: me.role === 'destroyer', role: me.role || '', otherDestroyers: list.filter(n => n !== name), name, level: me.level != null ? Number(me.level) : null, cls: me.cls || '', destroyer: DESTROYER_RE.test(String(me.cls || '')),
    partners, slots: st.slots, ready: Object.assign(st.ready, { partner: partners.length > 0 }), skills: kit.skills || [], bagAt: (ctx.readJson(path.join(ctx.LOGS, 'bag_' + name + '.json'), null) || {}).at || null,
    clanSeenAt: cs && cs.warehouse ? cs.warehouse.seenAt || null : null, generated: kit.generated, buy };
}
/** KITGET: the item job that fetches every clan-warehouse kit piece + unseals every sealed one, queued for the next Giran visit (or sent now) */
async function kitGet(ctx, b) {
  const fs = require('fs');
  if (!ctx.commandRun) return { code: 500, error: 'the dashboard server needs a restart' };
  const name = String(b.name || ''); const I = info(ctx, name, false); if (I.error) return I;
  const cs = ctx.readJson(path.join(ctx.LOGS, 'clan_state.json'), null) || {}, me = (ctx.readStates() || []).find(s => s.name === name) || {};
  const ci = me.clanInfo || cs.clanInfo || null, clanLeader = ci && ci.leader ? String(ci.leader) : '';
  const label = (h) => { const sg = h.list === 311262504 || h.list === 311262505, acc = h.list === 311262505 || h.list === 311262507; return `Release the ${sg ? 'S' : 'A'}-grade ${acc ? 'accessory' : 'armor'} seal`; };
  let pieces;
  if (Array.isArray(b.picks)) {   // FRENZYREADY-2026-10-29: exactly the owner's ticks, each checked against the live sources (one per kit slot)
    const SRC = kitSources(ctx, name); if (SRC.error) return SRC; pieces = []; const used = new Set();
    for (const p of b.picks.slice(0, 12)) { const sl = SRC.slots.find(s => s.key === String(p.key || '')); if (!sl || used.has(sl.key)) continue;
      const f = sl.from.find(x => x.src === String(p.src) && x.id === Number(p.id) && (x.char || '') === String(p.char || '') && (x.src !== 'char' || x.objId === Number(p.objId))); if (!f) continue;
      used.add(sl.key); pieces.push(Object.assign({ src: f.src, char: f.char, id: f.id, name: f.name, enchant: f.enchant || 0, objId: f.src === 'char' ? f.objId : 0, slot: sl.label, sealed: !!f.sealed },
        f.sealed ? { toId: f.toId, toName: f.toName, label: label(f), pay: f.pay, price: f.price } : { toId: f.id, toName: f.name })); }
    if (!pieces.length) return { code: 409, error: 'None of the ticked pieces is there any more (bags / the clan warehouse changed): reload and tick again.' };
  } else {
    const want = I.slots.filter(s => s.have && (s.have.where === 'clan' || s.have.sealed));
    if (!want.length) return { code: 409, error: 'Nothing to get: no kit piece is in the clan warehouse or sealed.' };
    pieces = want.map(s => Object.assign({ src: s.have.where === 'clan' ? 'clan' : 'bag', id: Number(s.have.id), name: s.have.name, enchant: 0, objId: 0, slot: s.label, sealed: !!s.have.sealed },
      s.have.sealed ? { toId: s.have.toId, toName: s.have.toName, label: label(s.have), pay: s.have.pay, price: s.have.price } : { toId: Number(s.have.id), toName: s.have.name }));
  }
  const id = `ij_${name.toLowerCase()}_kg${Date.now().toString(36)}`, now = !!b.now;
  const steps = [];
  const fromClan = pieces.filter(p => p.src === 'clan'); if (fromClan.length) steps.push(`${name} takes ${fromClan.length} kit piece(s) out of the clan warehouse: ${fromClan.map(p => p.name).join(', ').slice(0, 200)}`);
  const byChar = {}; pieces.filter(p => p.src === 'char').forEach(p => { (byChar[p.char] = byChar[p.char] || []).push(p.name); });   // FRENZYREADY
  Object.keys(byChar).forEach(c => steps.push(`${c} hands ${name} ${byChar[c].join(', ').slice(0, 200)} in Giran`));
  const sealed = pieces.filter(p => p.sealed); if (sealed.length) steps.push(`unseals ${sealed.length} at Pushkin: ${sealed.map(p => p.toName + ' (' + p.price + (p.pay === 57 ? ' adena' : ' Ancient Adena') + ')').join(', ').slice(0, 240)}`);
  steps.push(`everything stays in ${name}'s bag (the Frenzy swap kit)`);
  const J = { id, doer: name, kind: 'kitget', item: { name: `Frenzy kit: ${pieces.length} piece(s)`, id: pieces[0].toId }, unseal: { pieces, keep: true }, give: null, clanLeader, steps,
    created: new Date().toISOString(), by: 'dashboard frenzy kit', queued: now ? null : { since: new Date().toISOString() } };
  const dir = path.join(ctx.LOGS, 'itemjobs'); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, id + '.json'), JSON.stringify(J, null, 1));
  const stF = path.join(dir, id + '_status.json');
  if (!now) { fs.writeFileSync(stF, JSON.stringify({ id, state: 'queued', doer: name, at: new Date().toISOString(), step: `waits until ${name} is in Giran next time`, steps: [{ t: new Date().toISOString(), who: 'dashboard', msg: `queued: ${steps.join(' / ')}` }] }, null, 1));
    try { fs.appendFileSync(path.join(ctx.LOGS, 'dashboard_commands.log'), `${new Date().toISOString()}\tkitget\t${id} (next town visit): ${steps.join(' / ').slice(0, 400)}\tdashboard\r\n`); } catch (e) { }
    return { ok: true, id, queued: true, steps }; }
  const r = await ctx.commandRun({ cmd: '!itemjob ' + id, targets: ['chars:' + [name].concat(fromClan.length && clanLeader && clanLeader !== name ? [clanLeader] : []).join(',')] });
  const body = r && r.body ? r.body : r;
  try { fs.appendFileSync(path.join(ctx.LOGS, 'dashboard_commands.log'), `${new Date().toISOString()}\tkitget\t${id} (now): ${steps.join(' / ').slice(0, 400)}\tdashboard\r\n`); } catch (e) { }
  return body && body.error ? { code: 500, error: body.error } : { ok: true, id, queued: false, steps };
}
// FRENZYREADY-2026-10-29 (owner: "a way to ask destroyer or titan to get the gears from clan warehouse or collector to become 'Frenzy ready'"):
// every place a missing kit piece lies: the clan warehouse, the COLLECTOR's bag (Storage page -> Collector), any other character's bag (< 6 h old;
// never worn / quest / +10, never from another destroyer: that is its own kit). Sealed copies count (unsealed at Pushkin). The owner ticks the
// pieces; kitGet takes exactly those (a bag piece comes by hand-over in Giran: the giver walks there, swarm.js unsealRun -> ijFetch CHARSRC).
const fsx = require('fs');
function collectorOf(ctx) { const c = (ctx.readJson(path.join(ctx.DATA, 'stash_rules.json'), {}) || {}).collector || null; if (!c || c.on !== true) return ''; const cs = ctx.readJson(path.join(ctx.LOGS, 'clan_state.json'), null) || {}; return String(c.name || (cs.clanInfo && cs.clanInfo.leader) || ''); }
function kitSources(ctx, name) {
  const I = info(ctx, name, false); if (I.error) return I;
  const kit = ctx.readJson(path.join(ctx.DATA, 'frenzy_kit.json'), null), uns = ctx.readJson(path.join(ctx.DATA, 'unseal_h5.json'), null) || {}, byU = uns.byUnsealed || {};
  const cs = ctx.readJson(path.join(ctx.LOGS, 'clan_state.json'), null), clan = cs && cs.warehouse && Array.isArray(cs.warehouse.items) ? cs.warehouse.items : [];
  const states = ctx.readStates() || [], role = {}; states.forEach(s => { role[s.name] = s.role; });
  const col = collectorOf(ctx), bags = [];
  try { fsx.readdirSync(ctx.LOGS).forEach(f => { const m = /^bag_(.+)\.json$/.exec(f); if (!m || m[1] === name || role[m[1]] === 'destroyer') return; const j = ctx.readJson(path.join(ctx.LOGS, f), null);
    if (!j || !Array.isArray(j.items) || Date.now() - (Date.parse(j.at || '') || 0) > 6 * 3600000) return; bags.push({ char: m[1], items: j.items.filter(r => !r.eq && !r.equipped && !r.q && !r.quest && (Number(r.enchant) || 0) < 10) }); }); } catch (e) { }
  bags.sort((a, b) => (b.char === col) - (a.char === col) || a.char.localeCompare(b.char));
  const out = [];
  for (const s of ((kit && kit.slots) || []).filter(x => x.set === 'low' || x.set === 'high')) {
    const st = I.slots.find(x => x.key === s.key) || {}; if (st.have && (st.have.where === 'worn' || st.have.where === 'bag') && !st.have.sealed) continue;   // it has this one
    const ids = new Map((s.ids || []).map(x => [Number(x.id), x])), sealedOf = new Map(); (s.ids || []).forEach(x => { const u = byU[x.id]; if (u && u.sealed) sealedOf.set(Number(u.sealed), x); });
    const row = (r, src, char) => { const x = ids.get(Number(r.id)), z = !x ? sealedOf.get(Number(r.id)) : null, u = z ? byU[z.id] : null; if (!x && !z) return null;
      return Object.assign({ src, char: char || '', id: Number(r.id), objId: Number(r.objId) || 0, count: Math.max(1, Number(r.count) || 1), name: x ? x.name : String(r.name || z.name), enchant: Number(r.enchant) || 0, collector: !!char && char === col, sealed: !!z },
        z ? { toId: Number(z.id), toName: z.name, pay: Number(u.pay) || 57, price: Number(u.aa) || 0, list: Number(u.list) || 0 } : { toId: Number(r.id), toName: x.name }); };   // the kit's name: the client drops the S.A. from bag / warehouse names
    const from = [];
    if (st.have && st.have.where === 'bag' && st.have.sealed) from.push(Object.assign({ src: 'bag', char: '', objId: 0, enchant: 0, collector: false }, st.have));
    clan.forEach(r => { if ((Number(r.enchant) || 0) < 10) { const x = row(r, 'clan'); if (x && !from.some(y => y.src === 'clan' && y.id === x.id)) from.push(x); } });
    bags.forEach(b => b.items.forEach(r => { const x = row(r, 'char', b.char); if (x) from.push(x); }));
    from.sort((a, b) => (a.sealed - b.sealed) || ((a.src === 'clan' ? 0 : a.collector ? 1 : a.src === 'bag' ? -1 : 2) - (b.src === 'clan' ? 0 : b.collector ? 1 : b.src === 'bag' ? -1 : 2)));
    out.push({ key: s.key, set: s.set, label: s.label, from: from.slice(0, 8) });
  }
  return { ok: true, name, cls: I.cls, roleOk: I.roleOk, collector: col, clanLeader: (cs && cs.clanInfo && cs.clanInfo.leader) || '', slots: out };
}
/** the party's destroyers / titans (role destroyer or the class) with their sources */
function partySources(ctx, leader) {
  if (!NAME_RE.test(String(leader || ''))) return { code: 400, error: 'leader?' };
  const team = ctx.teamMap() || {}, states = ctx.readStates() || [];
  const list = states.filter(s => (team[s.name] || (typeof s.leader === 'string' && s.leader ? s.leader : s.name)) === leader && (s.role === 'destroyer' || DESTROYER_RE.test(String(s.cls || '')))).map(s => s.name).filter((v, i, a) => a.indexOf(v) === i).sort();
  return { ok: true, leader, chars: list.map(n => kitSources(ctx, n)).filter(x => x && x.ok) };
}
async function handle(req, res, url, ctx) {
  if (url.pathname === '/api/frenzykit/sources' || url.pathname === '/api/frenzykit/party') {   // FRENZYREADY (read only)
    if (!ctx.allowed(req, url)) { ctx.send(res, 401, 'text/plain; charset=utf-8', 'Access denied'); return true; }
    try { const r = url.pathname.endsWith('party') ? partySources(ctx, url.searchParams.get('leader')) : kitSources(ctx, url.searchParams.get('name')); const code = r.code || 200; delete r.code; ctx.json(res, code, r); } catch (e) { ctx.json(res, 500, { error: e.message }); }
    return true;
  }
  if (url.pathname === '/api/frenzykit/get' && req.method === 'POST') {   // KITGET
    if (!ctx.allowed(req, url)) { ctx.send(res, 401, 'text/plain; charset=utf-8', 'Access denied'); return true; }
    let b = {}; try { let t = ''; for await (const c of req) t += c; b = JSON.parse(t || '{}'); } catch (e) { ctx.json(res, 400, { error: 'bad JSON' }); return true; }
    try { const r = await kitGet(ctx, b); const code = r.code || 200; delete r.code; ctx.json(res, code, r); } catch (e) { ctx.json(res, 500, { error: e.message }); }
    return true;
  }
  if (url.pathname !== '/api/frenzykit') return false;
  if (!ctx.allowed(req, url)) { ctx.send(res, 401, 'text/plain; charset=utf-8', 'Access denied'); return true; }
  try { const r = info(ctx, url.searchParams.get('name'), url.searchParams.get('buy') === '1'); const code = r.code; delete r.code; ctx.json(res, code, r); } catch (e) { ctx.json(res, 500, { error: e.message }); }
  return true;
}
module.exports = { handle, info, kitGet, kitSources, partySources, kitStatus, buyPlan, shopIndex, townNear, DESTROYER_RE };
