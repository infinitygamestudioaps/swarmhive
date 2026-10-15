// FRENZY KIT API (owner 2026-10-14: "a full overview for a destroyer, showing what it is missing in order to do the frenzy with item changing"):
//   GET /api/frenzykit?name=<Name> -> { name, level, cls, destroyer, partners[], slots: [{ key, set, slot, label, why, have: { where: worn|bag|clan,
//   id, name } | null, cheapest: { id, name, grade, price } | null, options }], ready: { swap, low, high, partner }, generated }
// Data: Scripts/data/frenzy_kit.json (docs/plan/tools/frenzy_kit.js), Logs/bag_<Name>.json (worn = eq), Logs/clan_state.json warehouse,
// swarm_state of the party (other destroyers = duel partners). Skills are added by the page (it has the live skill list). Read only.
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
function info(ctx, name) {
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
  return { code: 200, ok: true, roleOk: me.role === 'destroyer', role: me.role || '', otherDestroyers: list.filter(n => n !== name), name, level: me.level != null ? Number(me.level) : null, cls: me.cls || '', destroyer: DESTROYER_RE.test(String(me.cls || '')),
    partners, slots: st.slots, ready: Object.assign(st.ready, { partner: partners.length > 0 }), skills: kit.skills || [], bagAt: (ctx.readJson(path.join(ctx.LOGS, 'bag_' + name + '.json'), null) || {}).at || null,
    clanSeenAt: cs && cs.warehouse ? cs.warehouse.seenAt || null : null, generated: kit.generated };
}
async function handle(req, res, url, ctx) {
  if (url.pathname !== '/api/frenzykit') return false;
  if (!ctx.allowed(req, url)) { ctx.send(res, 401, 'text/plain; charset=utf-8', 'Access denied'); return true; }
  try { const r = info(ctx, url.searchParams.get('name')); const code = r.code; delete r.code; ctx.json(res, code, r); } catch (e) { ctx.json(res, 500, { error: e.message }); }
  return true;
}
module.exports = { handle, info, kitStatus, DESTROYER_RE };
