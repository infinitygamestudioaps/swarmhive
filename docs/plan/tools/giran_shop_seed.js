// GIRAN SHOP SEED (owner 2026-10-15: "Nobody buys common-C jewels, incorrectly determined 'Not sold in Giran'").
// The live shop scan (!shopscan -> Logs/shopscan.json -> Scripts/data/shopscan_giran.json, 2026-10-06) only read Graham, Stanford,
// Radia, Peta and Denkus. Denkus (30082, next to Helvetia) sells No-Grade + D jewels only; the C jewels (Nassen's, Moonstone,
// Aquastone, Protection, Ages, Seal ... and their "Common Item -" twins) are on the lists of Sandra (30090) / Ellie (30091), the
// accessory merchants at the END of the recorded 'jewelry' route. So the dashboard said "not sold in Giran" and the bots never bought them.
//
// This tool adds every Giran merchant that sells gear the scan does not know as a SEEDED shop (datapack buylists, marked
// seeded / est / pathGuess) so the dashboard + swarm.js see it until a real !shopscan replaces it:
//   - route: the recorded Giran route (Scripts/data/giran_routes.json) whose end (tradeSpot / npcAt) is within 400 of the merchant,
//     else `unreachable` (the bots may only walk recorded routes in Giran: they skip that shop, the dashboard warns).
//   - list paths: copied from a scanned merchant with the same title (same L2Toggle dialog), Common list <-> Common list; else a guess.
//   - prices: datapack price x the Giran tax factor measured on the scanned lists (median live / datapack).
// It also fixes the route of a SCANNED shop whose route ends far from the merchant (Denkus was on 'jewelry' = Sandra's spot, 1350 away;
// the 'grocer' route ends 95 from him).
// Idempotent: old seeded entries are replaced, live entries are never changed (only `route`, old value in `routeWas`).
//   node docs/plan/tools/giran_shop_seed.js [--dry]
'use strict';
// LIVE LINK TEXTS (2026-10-15, Nuker4's live page Logs/npc_Nuker4.html): Sandra's menu is 'Buy/Sell/Refund.' | 'Buy bracelet or talisman.' |
// 'Buy basic-type accessory.' (= the Common jewels) — NOT Denkus's 'Buy/Sell/Refund Common Items.' (copied guess; the supply run bought 0/5: 'no link').
// Ellie stands next to her with the same dialog. Add a merchant here when its live page is known.
const LIVE_LINKS = { 30090: { normal: 'Buy/Sell/Refund.', common: 'Buy basic-type accessory.' }, 30091: { normal: 'Buy/Sell/Refund.', common: 'Buy basic-type accessory.' } };
const fs = require('fs'), path = require('path');
const ROOT = process.env.SWARM_ROOT_DIR || path.join(__dirname, '..', '..', '..');
const DATA = path.join(ROOT, 'Scripts', 'data');
const rd = (f) => JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, ''));
const NEAR = 400, FAR = 600;

function seed(opt) {
  const SC = opt.scan, A = opt.atlas, I = opt.items, R = (opt.routes && opt.routes.routes) || {};
  const out = JSON.parse(JSON.stringify(SC));
  out.shops = (out.shops || []).filter(s => !s.seeded);
  const npcs = (A.npcs || []).filter(n => n.place && n.place.town === 'Giran');
  const byName = {}; npcs.forEach(n => { if (!byName[n.name]) byName[n.name] = n; });
  const routeEnds = Object.entries(R).map(([k, r]) => ({ k, r, pts: [r.tradeSpot, r.npcAt, (r.points || []).slice(-1)[0]].filter(Boolean) }));
  const routeFor = (n) => {
    let best = null;
    routeEnds.forEach(e => e.pts.forEach(p => { const d = Math.hypot(p[0] - n.x, p[1] - n.y); if (!best || d < best.d) best = { k: e.k, d }; }));
    return best;
  };
  const report = { routeFixes: [], added: [], unreachable: [] };
  // 1) scanned shops: the route must end at the merchant
  out.shops.forEach(s => {
    const n = byName[s.npc]; if (!n) return;
    const cur = R[s.route], b = routeFor(n);
    const curD = cur ? Math.min(...[cur.tradeSpot, cur.npcAt, (cur.points || []).slice(-1)[0]].filter(Boolean).map(p => Math.hypot(p[0] - n.x, p[1] - n.y))) : Infinity;
    if (curD > FAR && b && b.d <= NEAR && b.k !== s.route) { report.routeFixes.push(`${s.npc}: route ${s.route || '-'} (ends ${Math.round(curD)} away) -> ${b.k} (${Math.round(b.d)})`); s.routeWas = s.route; s.route = b.k; }
  });
  // 2) the Giran tax factor (live price / datapack price) on the scanned lists
  const ratios = [];
  out.shops.forEach(s => (s.lists || []).forEach(l => (l.items || []).forEach(i => { const it = I[i.id]; if (it && it.p > 0 && i.price > 0) ratios.push(i.price / it.p); })));
  ratios.sort((a, b) => a - b);
  const tax = ratios.length ? Math.round(ratios[ratios.length >> 1] * 1000) / 1000 : 1;
  // 3) merchants with gear the scan does not know
  const known = new Set(); out.shops.forEach(s => (s.lists || []).forEach(l => (l.items || []).forEach(i => known.add(+i.id))));
  const sameTitle = (t) => out.shops.find(s => !s.seeded && s.title === t && (s.lists || []).some(l => l.items));
  npcs.filter(n => n.type === 'L2Merchant' && /merchant/i.test(n.title || '') && n.shop).sort((a, b) => a.id - b.id).forEach(n => {
    const lists = n.shop.map(sh => {
      const ids = (opt.buylist(sh.list) || []).filter(i => I[i]);
      return ids.length ? { list: sh.list, ids } : null;
    }).filter(Boolean);
    const fresh = lists.some(L => L.ids.some(i => !known.has(i)));
    if (!fresh) {   // nothing new: another merchant at the same spot with the same lists = a fallback name for that seeded shop
      const twin = out.shops.find(s => s.seeded && s.npcId && Math.hypot(s.at[0] - n.x, s.at[1] - n.y) < 200 && s.title === n.title);
      if (twin && twin.alt.indexOf(n.name) < 0) twin.alt.push(n.name);
      return;
    }
    const b = routeFor(n), ok = b && b.d <= NEAR, tmpl = sameTitle(n.title);
    const tl = tmpl ? (tmpl.lists || []).filter(l => l.items && l.items.length) : [];
    const entry = { npc: n.name, npcId: n.id, title: n.title, at: [n.x, n.y, n.z], route: ok ? b.k : null, alt: [], links: tmpl ? (tmpl.links || []).slice() : [], seeded: 'datapack buylists ' + lists.map(L => L.list).join(', ') + ` (not scanned live yet: !shopscan replaces it; prices = datapack x ${tax} Giran tax, link names copied from ${tmpl ? tmpl.npc : 'a guess'})`, lists: [] };
    if (!ok) entry.unreachable = `no recorded Giran route ends at ${n.name} (${n.x}, ${n.y}; nearest route end ${b ? b.k + ' ' + Math.round(b.d) : '-'} away): record one on the dashboard (Teleports -> Giran town routes)`;
    lists.forEach(L => {
      const common = L.ids.filter(i => /^Common Item/.test(I[i].n)).length > L.ids.length / 2;
      const t = tl.find(l => l.items.some(i => /^Common Item/.test(i.name)) === common);
      const live = LIVE_LINKS[n.id] && LIVE_LINKS[n.id][common ? 'common' : 'normal'];   // the link text SEEN on the live page wins over a copied guess
      entry.lists.push({ path: live ? [live] : t ? t.path.slice() : [common ? 'Buy/Sell/Refund Common Items.' : 'Buy/Sell/Refund.'], pathGuess: !live, list: L.list,
        items: L.ids.map(i => ({ id: i, name: I[i].n, price: Math.round((I[i].p || 0) * tax), est: 1 })) });
      L.ids.forEach(i => known.add(i));
    });
    out.shops.push(entry);
    (ok ? report.added : report.unreachable).push(`${n.name} (${n.id}) ${ok ? 'route ' + b.k + ' ' + Math.round(b.d) : entry.unreachable}: ${lists.map(L => L.ids.length).join('+')} items`);
  });
  out.seededAt = opt.now || new Date().toISOString();
  return { out, report, tax };
}

function buylistReader(dir) {
  return (list) => {
    const f = path.join(dir, String(list).padStart(7, '0') + '.xml');
    if (!fs.existsSync(f)) return null;
    return [...fs.readFileSync(f, 'utf8').matchAll(/<item id="(\d+)"/g)].map(m => +m[1]);
  };
}

if (require.main === module) {
  const dry = process.argv.includes('--dry');
  const file = path.join(DATA, 'shopscan_giran.json');
  const r = seed({ scan: rd(file), atlas: rd(path.join(DATA, 'npc_atlas.json')), items: rd(path.join(DATA, 'gear_items.json')).items,
    routes: rd(path.join(DATA, 'giran_routes.json')), buylist: buylistReader(path.join(DATA, 'dp', 'buylists')) });
  console.log('Giran tax factor ' + r.tax);
  r.report.routeFixes.forEach(t => console.log('route fix: ' + t));
  r.report.added.forEach(t => console.log('added: ' + t));
  r.report.unreachable.forEach(t => console.log('UNREACHABLE: ' + t));
  if (dry) { console.log('(dry run: nothing written)'); process.exit(0); }
  const bdir = path.join(ROOT, 'Settings', 'backup', 'giran_shop_seed_' + new Date().toISOString().slice(0, 10));
  fs.mkdirSync(bdir, { recursive: true });
  const bf = path.join(bdir, 'shopscan_giran.json');
  if (!fs.existsSync(bf)) fs.copyFileSync(file, bf);
  fs.writeFileSync(file + '.tmp', JSON.stringify(r.out, null, 1)); fs.renameSync(file + '.tmp', file);
  console.log('written ' + file + ' (backup ' + bf + ')');
}
module.exports = { seed, buylistReader };
