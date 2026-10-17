// ITEMS PAGE rules (ITEMS-2026-10-17; owner: "a general page where I can select any character ... see the inventory or the clan warehouse ... see
// what is for sale in Giran ... buy a Homunkulus's Sword enchanted to X ... put an SA on it (Acumen) ... give it to this character ... see the
// success rates and what is gained ... craft items"). Pure functions shared by Dashboard/itemspage_api.js and Dashboard/itemspage.js /
// craftpage.js; swarm.js has its own copy of the few rules it needs (ITEMJOB block).
(function (root, factory) { const api = factory(); if (typeof module === 'object' && module.exports) module.exports = api; else root.ItemsLogic = api; })(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const GRADES = ['NONE', 'D', 'C', 'B', 'A', 'S', 'S80', 'S84'];
  const GRADE_LEVEL = { NONE: 1, D: 20, C: 40, B: 52, A: 61, S: 76, S80: 80, S84: 84 };
  // enchant scrolls (L2J ids): weapon / armor (jewels use the armor scroll), normal / blessed, per grade (S80 / S84 use S)
  const SCROLLS = {
    weapon: { D: 955, C: 951, B: 947, A: 729, S: 959 }, armor: { D: 956, C: 952, B: 948, A: 730, S: 960 },
    bweapon: { D: 6575, C: 6573, B: 6571, A: 6569, S: 6577 }, barmor: { D: 6576, C: 6574, B: 6572, A: 6570, S: 6578 },
  };
  // DEFAULT rates (an ESTIMATE: L2J High Five config 66 %; L2Toggle publishes only "safe enchant +4"); Scripts/data/enchant_rates.json overrides
  const RATES = { safe: 4, safeFull: 4, weapon: 66, armor: 66, jewel: 66, blessedFailTo: 0, estimate: true };
  const gradeKey = (g) => { const s = String(g || 'NONE').toUpperCase(); return /^S\d+$/.test(s) ? 'S' : s; };
  /** gear kind: 'weapon' | 'armor' | 'jewel' | '' from the gear catalog slot (s) */
  function kindOf(slot) { const s = String(slot || ''); if (!s) return ''; if (s === 'weapon') return 'weapon'; if (/earring|ring|neck/.test(s)) return 'jewel'; if (/shield|sigil|chest|legs|head|gloves|feet|full|under|cloak|belt/.test(s)) return 'armor'; return ''; }
  function scrollFor(kind, grade, blessed) { const g = gradeKey(grade); if (!kind || g === 'NONE') return 0; const t = (blessed ? 'b' : '') + (kind === 'weapon' ? 'weapon' : 'armor'); return SCROLLS[t][g] || 0; }
  /** chance (0..1) to get from +cur to +to, one scroll per step; every step at or below the safe level always works */
  function chanceTo(cur, to, kind, full, R) {
    R = Object.assign({}, RATES, R || {}); const safe = full ? R.safeFull : R.safe, p = (kind === 'weapon' ? R.weapon : kind === 'jewel' ? R.jewel : R.armor) / 100;
    let c = 1; for (let l = Number(cur) + 1; l <= Number(to); l++) if (l > safe) c *= p;
    return c;
  }
  /** per step: [{ to, chance (this step), total (from cur), safe }] */
  function ladder(cur, to, kind, full, R) {
    R = Object.assign({}, RATES, R || {}); const safe = full ? R.safeFull : R.safe, p = (kind === 'weapon' ? R.weapon : kind === 'jewel' ? R.jewel : R.armor) / 100;
    const out = []; let t = 1; for (let l = Number(cur) + 1; l <= Number(to); l++) { const s = l <= safe ? 1 : p; t *= s; out.push({ to: l, chance: s, total: t, safe: l <= safe }); }
    return out;
  }
  // stat gain per enchant level (High Five, ABOUT): weapons P.Atk / M.Atk per level by grade, doubled above +3; bows double P.Atk; armor P.Def +1
  // (+3 above +3), shields / jewels M.Def +1 (+3 above +3)
  const WPN_GAIN = { D: [2, 2], C: [3, 3], B: [3, 3], A: [4, 3], S: [5, 4] };
  function gainOf(item, from, to) {
    const k = kindOf(item && item.s), g = gradeKey(item && item.g), F = Number(from) || 0, T = Number(to) || 0; if (T <= F || g === 'NONE') return null;
    let lv = 0; for (let l = F + 1; l <= T; l++) lv += l > 3 ? 2 : 1;        // "levels" with the over-enchant double
    if (k === 'weapon') { const w = WPN_GAIN[g] || [3, 3], bow = /bow/i.test(String(item.t || '')); return { pa: lv * w[0] * (bow ? 2 : 1), ma: lv * w[1], text: `about +${lv * w[0] * (bow ? 2 : 1)} P.Atk, +${lv * w[1]} M.Atk` }; }
    const d = (() => { let s = 0; for (let l = F + 1; l <= T; l++) s += l > 3 ? 3 : 1; return s; })();
    if (k === 'jewel') return { md: d, text: `about +${d} M.Def` };
    if (k === 'armor') return { pd: d, text: /shield|sigil/.test(String(item.s)) ? `about +${d} shield P.Def` : `about +${d} P.Def` };
    return null;
  }
  /** Special Ability choices for a weapon (soul_sa_recipes.json rows of its base id) -> [{ sa, saId, color, stage, cid, gem, adena, ms }] */
  function saOptions(weaponId, recipes) { return (recipes || []).filter(r => Number(r.w) === Number(weaponId)).map(r => ({ sa: r.sa, saId: r.saId, color: r.color, stage: r.stage, cid: r.cid, gem: r.gem, adena: r.adena, ms: r.ms, wn: r.wn })); }
  /** how many of item `id` each source holds: { bag, wh, clan, total } (bag counts only unworn pieces) */
  function have(id, S) {
    const c = (rows, f) => (rows || []).filter(r => Number(r.id) === Number(id) && (!f || f(r))).reduce((s, r) => s + (Number(r.count) || 1), 0);
    const o = { bag: c(S && S.bag, r => !r.eq), wh: c(S && S.wh), clan: c(S && S.clan) }; o.total = o.bag + o.wh + o.clan; return o;
  }
  /** take `n` from the sources in order bag -> private warehouse -> clan warehouse: { from: { bag, wh, clan }, missing } */
  function takePlan(id, n, S, allowClan) {
    const h = have(id, S), out = { bag: 0, wh: 0, clan: 0 }; let left = Number(n) || 0;
    ['bag', 'wh'].concat(allowClan === false ? [] : ['clan']).forEach(k => { const t = Math.min(left, h[k]); out[k] = t; left -= t; });
    return { from: out, missing: Math.max(0, left), have: h };
  }
  const levelOk = (grade, level) => (Number(level) || 0) >= (GRADE_LEVEL[String(grade || 'NONE').toUpperCase()] || 1);
  const pct = (x) => x >= 0.995 ? '100 %' : x < 0.0005 ? '< 0.1 %' : (Math.round(x * 1000) / 10) + ' %';
  const kmb = (n) => { n = Number(n) || 0; const a = Math.abs(n); return a >= 1e9 ? +(n / 1e9).toFixed(2) + 'b' : a >= 1e6 ? +(n / 1e6).toFixed(2) + 'm' : a >= 1e4 ? Math.round(n / 1e3) + 'k' : String(n); };
  /** recipes the crafter can make with what is reachable: per recipe { have per ingredient, can (how many crafts) } */
  function craftCan(rec, S) {
    let can = Infinity; const ing = (rec.ing || []).map(g => { const h = have(g.id, S); const n = Math.floor(h.total / Math.max(1, g.count)); if (n < can) can = n; return Object.assign({}, g, { have: h, short: Math.max(0, g.count - h.total) }); });
    return { ing, can: can === Infinity ? 0 : can };
  }
  return { GRADES, GRADE_LEVEL, SCROLLS, RATES, gradeKey, kindOf, scrollFor, chanceTo, ladder, gainOf, saOptions, have, takePlan, levelOk, pct, kmb, craftCan };
});
