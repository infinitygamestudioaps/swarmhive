// BEGINNER GEAR LOGIC (2026-10-12, forum topic 78 "Beginners gear for Lineage2 High Five" + L2J H5 datapack NewbieGuide.java / Q00174 / Q00255).
// Pure (no fs, no DOM): which beginner step pays for which character. Used by Dashboard/questpage_api.js (GET /api/quests/beginner, live plan)
// and docs/plan/tools/beginner_gear.js (writes Scripts/data/beginner_gear_plan.json). Data: Scripts/data/beginner_gear.json.
// Test: node docs/plan/tools/test_beginnergear.js
'use strict';
// class tier from the class id (L2J ClassId.level()): 0 = base class, 1 = 1st class, 2 = 2nd, 3 = 3rd
const BASE = [0, 10, 18, 25, 31, 38, 44, 49, 53, 123, 124];
const FIRST = [1, 4, 7, 11, 15, 19, 22, 26, 29, 32, 35, 39, 42, 45, 47, 50, 54, 56, 125, 126];
function classTier(cid) {
  const c = Number(cid);
  if (!isFinite(c) || cid === null || cid === undefined || cid === '') return null;
  if (BASE.indexOf(c) >= 0) return 0;
  if (FIRST.indexOf(c) >= 0) return 1;
  if ((c >= 88 && c <= 118) || (c >= 131 && c <= 136)) return 3;
  return 2;
}
const MYSTIC = [10, 11, 12, 13, 14, 15, 16, 17, 25, 26, 27, 28, 29, 30, 38, 39, 40, 41, 42, 43, 49, 50, 51, 52, 94, 95, 96, 97, 98, 103, 104, 105, 110, 111, 112, 115, 116];
function isMystic(cid) { return MYSTIC.indexOf(Number(cid)) >= 0; }
function raceOf(cid) {
  const c = Number(cid);
  if ((c >= 0 && c <= 17) || (c >= 88 && c <= 98)) return 'HUMAN';
  if ((c >= 18 && c <= 30) || (c >= 99 && c <= 105)) return 'ELF';
  if ((c >= 31 && c <= 43) || (c >= 106 && c <= 112)) return 'DARK_ELF';
  if ((c >= 44 && c <= 52) || (c >= 113 && c <= 116)) return 'ORC';
  if ((c >= 53 && c <= 57) || c === 117 || c === 118) return 'DWARF';
  if (c >= 123 && c <= 136) return 'KAMAEL';
  return '';
}
/** the shadow weapon (multisell 305986001) that fits the class: mystic -> staff, dwarf -> club, orc fighter -> cestus, other fighters -> long sword,
 *  Kamael -> none (rapier / ancient sword / crossbow are not in the list) */
function shadowWeaponFor(cid, weapons) {
  const W = weapons || [], by = (id) => W.find(w => Number(w.id) === id) || { id };
  const r = raceOf(cid);
  if (r === 'KAMAEL') return null;
  if (isMystic(cid)) return by(10474);
  if (r === 'DWARF') return by(10475);
  if (r === 'ORC') return by(10477);
  return by(10479);
}
function pct(a, b) { return b > 0 ? Math.round(a * 1000 / b) / 10 : 0; }

/** plan for ONE character. c = { name, level, classId, cls, party, gear: { weapon, neck, earring, ring }, quests: { '174': { status } } },
 *  data = beginner_gear.json, o = { expToNext(level) -> exp of that level bar, itemStats(name) -> { pAtk, mAtk, mDef } | null }
 *  -> { name, level, cls, tier, steps: [{ key, verdict: 'do'|'optional'|'wait'|'done'|'skip'|'gone'|'no', why, quest?, cmds?: [...] }], best } */
function planChar(c, data, o) {
  o = o || {};
  const L = Number(c.level) || 0, cid = c.classId, tier = classTier(cid), D = data || {}, S = D.steps || {};
  const steps = [];
  const q174 = c.quests && c.quests['174'];
  const stat = (n) => { try { return n && o.itemStats ? o.itemStats(n) : null; } catch (e) { return null; } };
  // 1) Tutorial (Q00255, memo-state quest: not run by the quest engine)
  {
    const t = S.tutorial || {};
    if (tier === 0 && L <= 5) steps.push({ key: 'tutorial', verdict: 'optional', why: `fresh character: Newbie Helper next to the class master gives ${isMystic(cid) ? '100 beginner spiritshots' : '200 beginner soulshots'} (kill Gremlins for the Blue Gemstone first); manual — the quest engine cannot run this memo-state quest` });
    else steps.push({ key: 'tutorial', verdict: 'skip', why: L > 5 ? `level ${L}: only for brand-new characters` : 'needs a base class' });
    void t;
  }
  // 2) Supply Check (Q00174): level 2+, one-time, Kamael Village
  {
    const q = S.supplyCheck || {}, R = q.reward || {}, exp = Number(R.exp) || 5672;
    const bar = o.expToNext ? Number(o.expToNext(L)) || 0 : 0, ep = pct(exp, bar);
    const base = { key: 'supplyCheck', quest: 174 };
    if (q174 && q174.status === 'done') steps.push(Object.assign(base, { verdict: 'done', why: 'already done (quest_state)' }));
    else if (L < 2) steps.push(Object.assign(base, { verdict: 'wait', why: 'level 2+' }));
    else if (L <= 9) steps.push(Object.assign(base, { verdict: 'do', why: `no-grade armor set + ${exp} exp (${ep}% of level ${L}) + 2,466 adena; 4 talks in Kamael Village` }));
    else if (L <= 19) steps.push(Object.assign(base, { verdict: 'optional', why: `${exp} exp is only ${ep}% of level ${L}; the no-grade armor only helps a character without a chest piece; costs a trip to Kamael Village` }));
    else steps.push(Object.assign(base, { verdict: 'skip', why: `level ${L}: ${exp} exp (${ep}%) and no-grade armor are not worth the trip` }));
  }
  // 3) Apprentice weapon coupons (7832 x5): level 6-19, base class, once (one-time flag 207); the exchange has the SAME limits
  {
    const s = S.weaponCoupon || {}, w = shadowWeaponFor(cid, s.weapons);
    const base = { key: 'weaponCoupon' };
    if (tier === null) steps.push(Object.assign(base, { verdict: 'no', why: 'class unknown' }));
    else if (tier > 0 || L >= 20) steps.push(Object.assign(base, { verdict: 'gone', why: tier > 0 ? 'only before the 1st class change' : 'only up to level 19' }));
    else if (L < 6) steps.push(Object.assign(base, { verdict: 'wait', why: `from level 6 (is ${L}); before the class change at 20` }));
    else if (!w) steps.push(Object.assign(base, { verdict: 'skip', why: 'Kamael: none of the 6 shadow weapons fits (no rapier / ancient sword / crossbow)' }));
    else {
      const cur = c.gear && c.gear.weapon, cs = stat(cur), key = isMystic(cid) ? 'mAtk' : 'pAtk';
      const mine = cs ? Number(cs[key]) || 0 : null, theirs = Number(w[key]) || 0;
      const better = mine === null || theirs > mine;
      const urgent = L >= 18 ? ' — DO IT BEFORE THE CLASS CHANGE AT 20 (coupons and exchange stop at the 1st class)' : '';
      steps.push(Object.assign(base, { verdict: better ? 'do' : 'optional', weapon: w,
        why: `5 coupons = 5 x ${w.name || ('#' + w.id)} (${key} ${theirs}${mine !== null ? ' vs ' + mine + ' now (' + cur + ')' : ''}), 180 min of use each${urgent}` }));
    }
  }
  // 4) Magic accessory coupon (7833 x1): 1st class, level < 40, once (flag 208) -> Magic Accessory Set (2 earrings, 2 rings, 1 necklace, D shadow)
  {
    const base = { key: 'accessoryCoupon' };
    if (tier === null) steps.push(Object.assign(base, { verdict: 'no', why: 'class unknown' }));
    else if (tier >= 2 || L >= 40) steps.push(Object.assign(base, { verdict: 'gone', why: tier >= 2 ? 'only with the 1st class (before the 2nd class change)' : 'only below level 40' }));
    else if (tier === 0) steps.push(Object.assign(base, { verdict: 'wait', why: 'after the 1st class change (level 20), before 40' }));
    else {
      const g = c.gear || {}, now = ['earring', 'ring', 'neck'].map(k => String(g[k] || '').split(' + ')).reduce((a, b) => a.concat(b), []).filter(Boolean);
      const md = now.reduce((s, n) => { const x = stat(n); return s + (x ? Number(x.mDef) || 0 : 0); }, 0);
      const setMd = 24 * 2 + 16 * 2 + 32;   // DATAPACK: Red Crescent 24, Ring of Devotion 16, Necklace of Devotion 32
      const gain = now.length >= 5 ? setMd - md : null;
      steps.push(Object.assign(base, { verdict: gain === null || gain > 20 ? 'do' : 'optional',
        why: `D-grade shadow jewelry (M.Def ${setMd} for the 5 pieces${gain !== null ? ', now ' + md + ' = ' + (gain >= 0 ? '+' : '') + gain : ''}), 180 min of use; one dialog at any Newbie Guide` }));
    }
  }
  const order = { do: 0, optional: 1, wait: 2, done: 3, skip: 4, gone: 5, no: 6 };
  const best = steps.filter(s => s.verdict === 'do' || s.verdict === 'optional').sort((a, b) => order[a.verdict] - order[b.verdict])[0] || null;
  return { name: c.name, level: L, cls: c.cls || '', classId: cid, tier, party: c.party || '', steps, best: best ? best.key : null };
}
/** every character -> rows sorted: those with a 'do' first, then by level */
function planAll(chars, data, o) {
  const rows = (chars || []).filter(c => c && c.name).map(c => planChar(c, data, o));
  const rank = (r) => r.steps.some(s => s.verdict === 'do') ? 0 : r.steps.some(s => s.verdict === 'optional') ? 1 : r.steps.some(s => s.verdict === 'wait') ? 2 : 3;
  rows.sort((a, b) => rank(a) - rank(b) || a.level - b.level || a.name.localeCompare(b.name));
  const count = (k) => rows.filter(r => r.steps.some(s => s.key === k && s.verdict === 'do')).length;
  return { rows, summary: { characters: rows.length, supplyCheck: count('supplyCheck'), weaponCoupon: count('weaponCoupon'), accessoryCoupon: count('accessoryCoupon'),
    relevant: rows.filter(r => rank(r) <= 1).length } };
}
module.exports = { classTier, isMystic, raceOf, shadowWeaponFor, planChar, planAll };
