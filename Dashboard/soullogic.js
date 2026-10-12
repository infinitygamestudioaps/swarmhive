// SOUL CRYSTAL LOGIC (2026-10-12, topic "soulcrystal"): the pure rules of quest 350 "Enhance Your Weapon" (L2J H5 Q00350_EnhanceYourWeapon.java +
// levelUpCrystalData.xml, data in Scripts/data/soul_crystals.json) shared by THREE users:
//   - the dashboard Crystals tab "Stage plan" (browser: window.SoulLogic, Dashboard/soulplan.js),
//   - Dashboard/soulplan_api.js (node: require),
//   - Scripts_dev/swarm.js: patch_soulcrystal.js copies the block between SOULLOGIC-BEGIN / SOULLOGIC-END into swarm.js (SOUL-PURE), so the bots
//     and the dashboard decide with the same code. No host calls, no DOM, no fs in the block.
// Test: node docs/plan/tools/test_soulcrystal.js
(function (root) {
  'use strict';
  // SOULLOGIC-BEGIN
  /** crystal item ids per colour, index = stage 0..18 (DATAPACK; the test checks them against soul_crystals.json itemsAll) */
  const SOUL_IDS = {
    red: [4629, 4630, 4631, 4632, 4633, 4634, 4635, 4636, 4637, 4638, 4639, 5577, 5580, 5908, 9570, 10480, 13071, 15541, 15826],
    green: [4640, 4641, 4642, 4643, 4644, 4645, 4646, 4647, 4648, 4649, 4650, 5578, 5581, 5911, 9572, 10482, 13073, 15543, 15828],
    blue: [4651, 4652, 4653, 4654, 4655, 4656, 4657, 4658, 4659, 4660, 4661, 5579, 5582, 5914, 9571, 10481, 13072, 15542, 15827]
  };
  /** { color, stage } for a soul crystal item id, else null (broken crystals 4662-4664 are not crystals: they never count for resonation) */
  function soulCrystalOf(id) {
    id = Number(id);
    for (const c of ['red', 'green', 'blue']) { const i = SOUL_IDS[c].indexOf(id); if (i >= 0) return { color: c, stage: i }; }
    return null;
  }
  function soulIsCrystalId(id) { return !!soulCrystalOf(id); }
  /** L2J rolls getRandom(100) <= chance: chance N = (N + 1) % */
  function soulPct(chance) { const n = Number(chance); return isFinite(n) ? Math.max(0, Math.min(100, n + 1)) : 0; }
  /** a crystal is finished when it reached the target stage in the target colour; any other colour = stock, finished at stage 10 */
  function soulReadyP(c, t) {
    if (!c) return false;
    if (t && t.color && t.color === c.color) return Number(c.stage) >= Number(t.stage);
    return Number(c.stage) >= 10;
  }
  /** one monster / boss entry at one crystal stage -> { absorb, chance, pct, useNeeded } or null (not accepted = system message 978) */
  function soulInfoAt(m, stage) {
    if (!m) return null; stage = Number(stage);
    const d = (m.details || []).find(x => (x.stages || []).map(Number).includes(stage));
    const st = d || ((m.stages || []).map(Number).includes(stage) ? m : null);
    if (!st) return null;
    const absorb = st.absorb || m.absorb, chance = Number(st.chance !== undefined ? st.chance : m.chance);
    return { absorb, chance, pct: soulPct(chance), useNeeded: m.crystalUseNeeded !== false && absorb === 'LAST_HIT' };
  }
  /** Should I use my crystal on my target now?  s = { on, pref, crystals: [{ color, stage, count }], target: { color, stage } | null,
   *  levelOn, quest: true | false | null (unknown), healer, mob: { id, hp, dead } | null, entry (soul_crystals.json monster) | null,
   *  lastMob, lastAt, now, reuseMs, useBelowHp }  ->  { use: boolean, why } */
  function soulUseDecide(s) {
    const no = (why) => ({ use: false, why });
    if (!s || s.on === false) return no('crystal use is off');
    if (s.pref === 'off') return no('soul_prefs.json: off for me');
    const cs = s.crystals || [];
    if (!cs.length) return no('no crystal');
    if (cs.length > 1 || Number(cs[0].count || 1) > 1) return no(`${cs.length > 1 ? cs.length : cs[0].count} crystals in the bag: resonation, nothing absorbs (store the extra ones)`);
    const c = cs[0];
    if (s.levelOn === false) return no('my party does not level crystals (dashboard plan)');
    if (soulReadyP(c, s.target)) return no(`finished (${c.color} ${c.stage}): store it`);
    if (s.quest === false) return no('quest 350 not started: nothing absorbs ("!soul get" starts it at Gideon)');
    if (s.healer) return no('healer: never lands the killing blow, so LAST_HIT monsters cannot level my crystal (party bosses can)');
    const mob = s.mob;
    if (!mob || mob.dead) return no('no live target');
    if (!s.entry) return no('my target is not a crystal monster');
    const inf = soulInfoAt(s.entry, c.stage);
    if (!inf) return no(`${s.entry.name} does not accept stage ${c.stage} (978)`);
    if (!inf.useNeeded) return no(`${s.entry.name}: ${inf.absorb} boss, no crystal use (the party rolls on the kill)`);
    const hp = Number(mob.hp);
    const below = Number(s.useBelowHp) || 50;
    if (!(hp > 0) || hp > below) return no(`waiting for <= ${below} % HP (now ${Math.round(hp || 0)} %)`);
    const t = Number(s.now) || 0;
    if (s.lastMob === mob.id && t - (Number(s.lastAt) || 0) < 60000) return no('already used on this monster');
    if (t - (Number(s.lastAt) || 0) < (Number(s.reuseMs) || 4000)) return no('reuse delay');
    return { use: true, why: `use on ${s.entry.name} (${inf.pct} % per kill, I must land the killing blow)` };
  }
  /** Which crystals go to the warehouse: the finished ones, and with 2+ unfinished ones all but ONE (the target colour, highest stage), because
   *  two crystals in the bag = nothing absorbs.  -> { keep: crystal | null, store: [crystal] } */
  function soulKeepOne(cs, t) {
    const all = (cs || []).slice(), store = all.filter(c => soulReadyP(c, t));
    const open = all.filter(c => !store.includes(c));
    if (open.length <= 1) return { keep: open[0] || null, store };
    const rank = (c) => (t && t.color === c.color ? 1000 : 0) + Number(c.stage);
    open.sort((a, b) => rank(b) - rank(a));
    return { keep: open[0], store: store.concat(open.slice(1)) };
  }
  /** Who levels on monsters now: reports [{ name, crystals, target, levelOn, healer, level }] -> { stages: [unique], who: [{ name, color, stage }] } */
  function soulNeeds(reps) {
    const who = [];
    (reps || []).forEach(r => {
      if (!r || r.healer || r.levelOn === false) return;
      const cs = r.crystals || []; if (cs.length !== 1 || Number(cs[0].count || 1) > 1) return;
      if (soulReadyP(cs[0], r.target)) return;
      who.push({ name: r.name, color: cs[0].color, stage: Number(cs[0].stage) });
    });
    return { stages: [...new Set(who.map(w => w.stage))].sort((a, b) => a - b), who };
  }
  /** How good is a hunting spot (hunting_spots_h5.json row: mobs [{ id, name, level, count }]) for these crystal stages?
   *  byId = { npcId: soul_crystals.json monster }. Monsters more than 4 levels above the team are not counted (danger).
   *  -> { score, mobs: [{ name, level, count, pct, stages }] }  score = sum(count x members it levels x pct / 10) */
  function soulSpotScore(spot, needs, byId, level) {
    const out = { score: 0, mobs: [] };
    const who = (needs && needs.who) || [];
    if (!spot || !who.length) return out;
    (spot.mobs || []).forEach(m => {
      const e = byId && byId[Number(m.id)]; if (!e) return;
      if (level && Number(m.level || e.level) > Number(level) + 4) return;
      let hits = 0, pct = 0; const sts = [];
      who.forEach(w => { const inf = soulInfoAt(e, w.stage); if (inf && inf.useNeeded) { hits++; pct = inf.pct; if (!sts.includes(w.stage)) sts.push(w.stage); } });
      if (!hits) return;
      const cnt = Number(m.count) || 1;
      out.score += cnt * hits * pct / 10;
      out.mobs.push({ name: e.name, level: Number(m.level || e.level), count: cnt, pct, stages: sts.sort((a, b) => a - b) });
    });
    out.score = Math.round(out.score * 10) / 10;
    out.mobs.sort((a, b) => b.count - a.count);
    return out;
  }
  /** The best spot for the crystals: spots already filtered by the caller (reachable, not blocked); level window lvl-12 .. lvl+3.
   *  -> { spot, score, mobs } | null */
  function soulPickSpot(spots, needs, level, byId) {
    let best = null;
    (spots || []).forEach(s => {
      if (!s || s.enabled === false) return;
      if (level && (Number(s.levelMin) > Number(level) + 3 || Number(s.levelMax) < Number(level) - 12)) return;
      const r = soulSpotScore(s, needs, byId, level);
      if (r.score <= 0) return;
      // tie-break: monsters closer to the team level give exp too
      const gap = level ? Math.max(0, Number(level) - Number(s.levelMax)) : 0;
      const sc = r.score - gap * 0.5;
      if (!best || sc > best.sc) best = { spot: s, score: r.score, mobs: r.mobs, sc };
    });
    if (best) delete best.sc;
    return best;
  }
  /** The stage plan for one crystal: data = soul_crystals.json, o = { color, from, to, level, healer, maxMobs, maxBosses }.
   *  -> { color, from, to, steps: [{ stage, to, mobs: [...], bosses: [...], buy, method, kills }], buy: best Alexandria shortcut | null } */
  function soulStagePlan(data, o) {
    o = o || {};
    const from = Math.max(0, Number(o.from) || 0), to = Math.min(18, Number(o.to) || 0), L = Number(o.level) || 0;
    const nM = o.maxMobs || 4, nB = o.maxBosses || 5;
    const offers = ((data && data.buy && data.buy.offers) || []);
    const where = (m) => { const sp = (m.spots || []).slice().sort((a, b) => (b.count || 0) - (a.count || 0))[0]; return sp ? { area: sp.area || '', landing: (sp.nearestLanding && sp.nearestLanding.desc) || '', walk: sp.nearestLanding && sp.nearestLanding.walk } : null; };
    const fit = (lv) => !L ? 0 : lv > L + 3 ? 100 + (lv - L) : Math.abs(L - lv);
    const steps = [];
    for (let s = from; s < to; s++) {
      const mobs = ((data && data.monsters) || []).map(m => ({ m, inf: soulInfoAt(m, s) })).filter(x => x.inf)
        .sort((a, b) => (fit(a.m.level) - fit(b.m.level)) || (b.m.spawnCount || 0) - (a.m.spawnCount || 0))
        .slice(0, nM).map(x => ({ name: x.m.name, level: x.m.level, pct: x.inf.pct, absorb: x.inf.absorb, aggressive: !!x.m.aggressive, spawns: x.m.spawnCount || 0, where: where(x.m) }));
      const bosses = ((data && data.raidBosses) || []).map(m => ({ m, inf: soulInfoAt(m, s) })).filter(x => x.inf)
        .sort((a, b) => (b.inf.absorb === 'FULL_PARTY') - (a.inf.absorb === 'FULL_PARTY') || (b.inf.pct - a.inf.pct) || (a.m.level - b.m.level))
        .slice(0, nB).map(x => ({ name: x.m.name, level: x.m.level, pct: x.inf.pct, absorb: x.inf.absorb, type: x.m.type || '', where: where(x.m) }));
      const buy = offers.find(f => Number(f.stage) === s + 1) || null;
      const method = o.healer ? (bosses.some(b => b.absorb === 'FULL_PARTY') ? 'party boss' : buy ? 'buy' : 'trade') : mobs.length ? 'monsters' : bosses.length ? 'boss' : buy ? 'buy' : 'none';
      steps.push({ stage: s, to: s + 1, mobs, bosses, buy: buy ? { stage: buy.stage, cost: buy.cost } : null, method, kills: mobs.length ? Math.round(100 / mobs[0].pct) : null });
    }
    // the highest stage Alexandria sells that is above my crystal and not above the target: buy it instead of the steps below it
    const sc = offers.filter(f => Number(f.stage) > from && Number(f.stage) <= to).sort((a, b) => b.stage - a.stage)[0] || null;
    return { color: o.color || '', from, to, steps, buy: sc ? { stage: sc.stage, id: sc.ids && o.color ? sc.ids[o.color] : null, cost: sc.cost, skips: Number(sc.stage) - from } : null };
  }
  // SOULLOGIC-END
  const api = { SOUL_IDS, soulCrystalOf, soulIsCrystalId, soulPct, soulReadyP, soulInfoAt, soulUseDecide, soulKeepOne, soulNeeds, soulSpotScore, soulPickSpot, soulStagePlan };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SoulLogic = api;
})(typeof window !== 'undefined' ? window : globalThis);
