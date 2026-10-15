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
function kitStatus(kit, bag, clanItems) {
  const slots = ((kit && kit.slots) || []).map(s => {
    const ids = new Map((s.ids || []).map(x => [Number(x.id), x]));
    const inBag = (bag || []).filter(i => ids.has(Number(i.id)));
    const worn = inBag.find(i => i.eq), held = inBag.find(i => !i.eq), wh = (clanItems || []).find(i => ids.has(Number(i.id)));
    const have = worn ? { where: 'worn', id: worn.id, name: ids.get(Number(worn.id)).name } : held ? { where: 'bag', id: held.id, name: ids.get(Number(held.id)).name }
      : wh ? { where: 'clan', id: wh.id, name: ids.get(Number(wh.id)).name } : null;
    const c = (s.ids || [])[0] || null;
    return { key: s.key, set: s.set, slot: s.slot, label: s.label, why: s.why, have, cheapest: c ? { id: c.id, name: c.name, grade: c.grade, price: c.price } : null, options: (s.ids || []).length };
  });
  const setOk = (set) => slots.filter(s => s.set === set).every(s => s.have && s.have.where !== 'clan');
  const highAny = slots.some(s => s.set === 'high' && s.have && s.have.where !== 'clan');
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
  const st = kitStatus(kit, bag, clanItems);
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
async function handle(req, res, url, ctx) {
  if (url.pathname !== '/api/frenzykit') return false;
  if (!ctx.allowed(req, url)) { ctx.send(res, 401, 'text/plain; charset=utf-8', 'Access denied'); return true; }
  try { const r = info(ctx, url.searchParams.get('name'), url.searchParams.get('buy') === '1'); const code = r.code; delete r.code; ctx.json(res, code, r); } catch (e) { ctx.json(res, 500, { error: e.message }); }
  return true;
}
module.exports = { handle, info, kitStatus, buyPlan, shopIndex, townNear, DESTROYER_RE };
