// RAID HEALING PER BOSS (RAIDHEAL-2026-10-17; owner: "Some raid boss required Extreme healing, like Iron Giant Totem hits like a truck and
// therefore the bishop should heal much faster and on a much more frequent interval. So we need to be able to set a healing for a raidboss.")
// Shared by Dashboard/raidheal_api.js + Dashboard/raidspage.js; swarm.js has a TEXT COPY in its block RAIDHEAL-PURE (test_raid_heal.js checks they match).
// File Scripts/data/raid_heal.json: { version: 1, bosses: { <npc id>: { name, level: 'normal'|'heavy'|'extreme', custom: { spamBelow, tankBelow, groupCount, potionBelow }, at, by } } }
// A boss without an entry = normal (= the raid healing from before this setting).
(function (root, factory) { const api = factory(); if (typeof module === 'object' && module.exports) module.exports = api; else root.RaidHealLogic = api; })(typeof self !== 'undefined' ? self : this, function () {
  // RAIDHEAL-PURE-BEGIN
  const RH_LEVELS = ['normal', 'heavy', 'extreme'];
  // spamBelow: everyone below it gets the fastest heal, again and again · tankBelow: the tank below it is healed before anyone else
  // (unless someone else is dying) · groupCount: this many below spamBelow = group heal · potionBelow: mana potion line (0 = the healer's own)
  // stagger: ms a second healer waits before deciding (so it sees the first one's claim) · idleMs: pause when nobody needs a heal
  // keepTarget: no re-select (180 ms) when the target is already selected
  const RH_PRESETS = {
    normal: { spamBelow: 80, tankBelow: 60, groupCount: 3, potionBelow: 0, stagger: 350, idleMs: 250, keepTarget: false },
    heavy: { spamBelow: 90, tankBelow: 80, groupCount: 2, potionBelow: 90, stagger: 150, idleMs: 120, keepTarget: true },
    extreme: { spamBelow: 97, tankBelow: 95, groupCount: 2, potionBelow: 95, stagger: 0, idleMs: 60, keepTarget: true },
  };
  const RH_CUSTOM = { spamBelow: [50, 99], tankBelow: [30, 99], groupCount: [1, 9], potionBelow: [0, 99] };
  function rhInt(v) { const n = Math.round(Number(v)); return Number.isFinite(n) ? n : NaN; }
  /** a clean entry (or null = normal / nothing to keep) */
  function rhClean(e) {
    if (!e || typeof e !== 'object') return null;
    const level = RH_LEVELS.indexOf(e.level) >= 0 ? e.level : 'normal', custom = {};
    const c = e.custom && typeof e.custom === 'object' ? e.custom : {};
    Object.keys(RH_CUSTOM).forEach(k => { const n = rhInt(c[k]); if (Number.isFinite(n)) custom[k] = Math.min(RH_CUSTOM[k][1], Math.max(RH_CUSTOM[k][0], n)); });
    if (level === 'normal' && !Object.keys(custom).length) return null;
    const out = { level }; if (Object.keys(custom).length) out.custom = custom;
    if (e.name) out.name = String(e.name).slice(0, 60);
    return out;
  }
  /** the entry of a boss: by npc id, else by name (case-insensitive) */
  function rhPick(j, id, name) {
    const B = j && j.bosses && typeof j.bosses === 'object' ? j.bosses : {};
    if (id && B[String(id)]) return B[String(id)];
    const n = String(name || '').toLowerCase(); if (!n) return null;
    const k = Object.keys(B).find(x => String((B[x] || {}).name || '').toLowerCase() === n);
    return k ? B[k] : null;
  }
  /** the numbers that run: preset of the level + the player's own numbers */
  function rhResolve(e) {
    const c = rhClean(e), level = c ? c.level : 'normal';
    return Object.assign({ level, custom: !!(c && c.custom) }, RH_PRESETS[level], (c && c.custom) || {});
  }
  /** tank-first rule: the tank below tankBelow gets the heal, unless another member is dying (< 50 %) and lower than the tank */
  function rhTankFirst(R, tankHp, othersHp) {
    if (!(tankHp < 100)) return false;
    if (tankHp < Math.min(60, R.tankBelow)) return true;
    if (!(tankHp < R.tankBelow)) return false;
    return !(othersHp || []).some(h => h < 50 && h < tankHp);
  }
  /** one plain sentence for the dashboard / party chat */
  function rhSentence(R) {
    return `${R.level === 'extreme' ? 'Extreme' : R.level === 'heavy' ? 'Heavy' : 'Normal'} healing: everyone below ${R.spamBelow} % gets the fastest heal again and again, the tank first below ${R.tankBelow} %, group heal when ${R.groupCount}+ are low` +
      `${R.potionBelow ? `, mana potion below ${R.potionBelow} % MP` : ''}${R.stagger === 0 ? ', healers do not wait for each other' : ''}${R.custom ? ' (your own numbers)' : ''}.`;
  }
  // RAIDHEAL-PURE-END
  return { RH_LEVELS, RH_PRESETS, RH_CUSTOM, rhClean, rhPick, rhResolve, rhTankFirst, rhSentence };
});
