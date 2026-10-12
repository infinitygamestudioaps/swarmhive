// SKILL ENCHANT LOGIC (user 2026-10-12, forum topic 2753 "Skill Enchant Table"). Pure functions, no I/O; works in node (require) and the browser
// (window.SkillEnchantLogic). Used by docs/plan/tools/skill_enchant.js (data + plan), Dashboard/skillenchant_api.js (/api/skillenchant),
// Dashboard/skillenchantpage.js (#/skillenchant) and docs/plan/tools/test_skillenchant.js. USER RULE 2026-10-12: enchanting is NEVER automatic
// (items and skills): recommendations here + ONE attempt per explicit order ("!skillenchant ...", scratchpad patch_skillenchant.js). The SENPURE
// block (senDecide) is copied verbatim into swarm.js, so the page and the bot check an order the same way.
//
// Facts (SERVER = L2J High Five game server code; L2Toggle not verified live):
//   - enchanting needs a 3rd class + character level >= 76; the chance is the column of the CHARACTER level (76..85, above 85 = the 85 column).
//   - skill level on the wire = route * 100 + plus (101 = route 1, +1); +1 needs the skill at its max base level, +N needs +N-1 on the same route.
//   - normal: SP + adena (x1), Giant's Codex 6622 only for +1; a fail drops the skill back to its base level.
//   - safe: SP + adena x5 and Giant's Codex - Mastery 9627 every attempt; a fail keeps the level.
//   - untrain: Giant's Codex - Oblivion 9625 + the adena of the current level, 80 % SP back, -1 level.
//   - route change: Giant's Codex - Discipline 9626 + SP + adena of that level, then -Rnd(min(4, N)) levels.
// Route recommendation + skill priority = INFERRED rules below (role of the character x kind of the skill); the user can override every route.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SkillEnchantLogic = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const LEVELS = [76, 77, 78, 79, 80, 81, 82, 83, 84, 85];
  const BOOKS = { normal: 6622, safe: 9627, untrain: 9625, routeChange: 9626 };
  const DEFAULT_RULES = { minLevel: 76, multipliers: { normal: 1, safe: 5 }, untrainSpBack: 0.8, routeChangeMaxLoss: 3 };
  const DEFAULT_SETTINGS = { auto: false, minChance: 80, reserveAdena: 5000000, maxTriesPerVisit: 6, chars: {} };
  // H5 3rd classes (ClassId.level() == 3): 88-118, Doombringer 131, Soul Hound 132/133, Trickster 134, Judicator 136 (Inspector 135 is 2nd tier)
  const TIER3 = (() => { const a = []; for (let i = 88; i <= 118; i++) a.push(i); return a.concat([131, 132, 133, 134, 136]); })();

  const num = (v, d) => { const n = Number(v); return Number.isFinite(n) ? n : (d === undefined ? 0 : d); };

  // ------------------------------------------------------------------------------------------------------- levels, chances, costs
  /** a live skill level -> { route, plus } (route 0 = not enchanted) */
  function parseLevel(level) { level = num(level); return level > 100 ? { route: Math.floor(level / 100), plus: level % 100 } : { route: 0, plus: 0 }; }
  const wireLevel = (route, plus) => route * 100 + plus;
  /** DATAPACK chance % of +plus (1-based) at a character level; 0 below 76, the 85 column above 85 */
  function chance(group, plus, charLevel) {
    const lv = group && group.levels && group.levels[plus - 1]; if (!lv) return 0;
    const l = num(charLevel); if (l < LEVELS[0]) return 0;
    return num(lv.chance[Math.min(LEVELS.length - 1, l - LEVELS[0])]);
  }
  /** one attempt at +plus: { sp, adena, books: { itemId: count } } (mode normal | safe) */
  function attemptCost(group, plus, mode, rules) {
    const lv = group && group.levels && group.levels[plus - 1]; if (!lv) return null;
    const M = ((rules && rules.multipliers) || DEFAULT_RULES.multipliers)[mode === 'safe' ? 'safe' : 'normal'];
    const books = {};
    if (mode === 'safe') books[BOOKS.safe] = 1; else if (plus === 1) books[BOOKS.normal] = 1;
    return { sp: lv.sp * M, adena: lv.adena * M, books };
  }
  /**
   * Expected cost to go from +from to +to on one route at a character level.
   * normal: a fail drops to the base level, so E_k (base -> +k) = (E_{k-1} + c_k) / p_k and from +a to +b = sum_{k=a+1..b} [c_k + (1 - p_k) * E_k].
   * safe:   every attempt costs c_k^safe, retried until it works: sum c_k / p_k.
   * Returns { sp, adena, books: {id: n}, attempts, pNoFail (normal: chance to get there without a single fail), minChance, ok }; ok false when a chance is 0.
   */
  function expectedCost(group, from, to, charLevel, mode, rules) {
    from = Math.max(0, num(from)); to = Math.min(num(to), group ? group.maxEnchant || group.levels.length : 0);
    const r = { sp: 0, adena: 0, books: {}, attempts: 0, pNoFail: 1, minChance: 100, ok: true, from, to, mode: mode === 'safe' ? 'safe' : 'normal', level: num(charLevel) };
    if (!group || to <= from) return r;
    const addBooks = (dst, src, k) => { Object.keys(src).forEach(id => { dst[id] = (dst[id] || 0) + src[id] * k; }); };
    if (r.mode === 'safe') {
      for (let k = from + 1; k <= to; k++) {
        const p = chance(group, k, charLevel) / 100, c = attemptCost(group, k, 'safe', rules);
        r.minChance = Math.min(r.minChance, p * 100);
        if (p <= 0) { r.ok = false; r.sp = r.adena = r.attempts = Infinity; return r; }
        r.sp += c.sp / p; r.adena += c.adena / p; r.attempts += 1 / p; addBooks(r.books, c.books, 1 / p); r.pNoFail *= p;
      }
      return roundCost(r);
    }
    // normal: E[k] (from the base level to +k), in SP, adena, books, attempts
    const E = [{ sp: 0, adena: 0, books: {}, attempts: 0 }];
    for (let k = 1; k <= to; k++) {
      const p = chance(group, k, charLevel) / 100, c = attemptCost(group, k, 'normal', rules), prev = E[k - 1];
      if (p <= 0) { E[k] = null; if (k > from) { r.ok = false; r.sp = r.adena = r.attempts = Infinity; r.minChance = 0; return r; } continue; }
      if (!prev) { E[k] = null; continue; }
      const e = { sp: (prev.sp + c.sp) / p, adena: (prev.adena + c.adena) / p, attempts: (prev.attempts + 1) / p, books: {} };
      Object.keys(prev.books).forEach(id => { e.books[id] = prev.books[id] / p; });
      Object.keys(c.books).forEach(id => { e.books[id] = (e.books[id] || 0) + c.books[id] / p; });
      E[k] = e;
    }
    for (let k = from + 1; k <= to; k++) {
      const p = chance(group, k, charLevel) / 100, c = attemptCost(group, k, 'normal', rules), e = E[k];
      r.minChance = Math.min(r.minChance, p * 100); r.pNoFail *= p;
      if (!e) { r.ok = false; r.sp = r.adena = r.attempts = Infinity; return r; }     // a lower level has chance 0: after a fail it can never come back
      r.sp += c.sp + (1 - p) * e.sp; r.adena += c.adena + (1 - p) * e.adena; r.attempts += 1 + (1 - p) * e.attempts;
      addBooks(r.books, c.books, 1); addBooks(r.books, e.books, 1 - p);
    }
    return roundCost(r);
  }
  function roundCost(r) {
    r.sp = Math.round(r.sp); r.adena = Math.round(r.adena); r.attempts = Math.round(r.attempts * 100) / 100; r.pNoFail = Math.round(r.pNoFail * 10000) / 10000;
    Object.keys(r.books).forEach(id => { r.books[id] = Math.round(r.books[id] * 100) / 100; });
    r.minChance = Math.round(r.minChance * 100) / 100;
    return r;
  }
  /** the highest +N reachable from +from where EVERY step has chance >= minChance at that character level (normal enchants the bot may try) */
  function targetPlus(group, from, charLevel, minChance, maxPlus) {
    const top = Math.min(group ? group.maxEnchant || group.levels.length : 0, maxPlus ? num(maxPlus) : 99);
    let t = num(from);
    while (t < top && chance(group, t + 1, charLevel) >= num(minChance, 80)) t++;
    return t;
  }
  /** cheaper of normal / safe for one step (+plus) at a level: { mode, normal, safe } (expected values) */
  function cheaperMode(group, from, to, charLevel, rules) {
    const n = expectedCost(group, from, to, charLevel, 'normal', rules), s = expectedCost(group, from, to, charLevel, 'safe', rules);
    const w = (c) => c.ok ? c.adena + c.sp * 0.5 : Infinity;   // INFERRED weighting: 1 SP ~ 0.5 adena (books not counted)
    return { mode: w(s) < w(n) ? 'safe' : 'normal', normal: n, safe: s };
  }

  // ------------------------------------------------------------------------------------------------------- recommendation (INFERRED)
  // Route preference per kind of skill (first = best). Duel only raises PvP damage: always last (the bots do PvE).
  const ROUTE_PREF = {
    attack: ['Power', 'Chance', 'Cost', 'Recycle', 'Attack', 'Crit Power', 'Modify Critical', 'Accuracy', 'Distance', 'HP Power', 'MP Power', 'Fire Attack', 'Water Attack', 'Wind Attack', 'Earth Attack', 'Dark Attack', 'Holy Attack', 'Time'],
    heal: ['Power', 'Recycle', 'Cost', 'Recovery', 'Time', 'Mana', 'Life'],
    resurrect: ['Recycle', 'Cost', 'Power', 'Time'],
    debuff: ['Chance', 'Time', 'Power', 'Cost', 'Recycle', 'Decrease Defense', 'Decrease Magic Defense', 'Decrease Attack', 'Decrease Magic Attack'],
    aggro: ['Power', 'Chance', 'Attack', 'Defense', 'Cost', 'Recycle', 'Time'],
    buff: ['Time', 'Power', 'Decrease Penalty', 'Cost', 'Recycle', 'Defense', 'Magic Defense', 'Bravery', 'Swiftness'],
    toggle: ['Power', 'Cost', 'Defense', 'Magic Defense', 'Attack', 'Recycle', 'Time'],
    summon: ['Power', 'Time', 'Cost', 'Recycle'],
    passive: ['Power', 'Defense', 'Magic Defense', 'Attack', 'Accuracy', 'Dodge', 'Movement', 'Time', 'Cost'],
    other: ['Power', 'Time', 'Chance', 'Cost', 'Recycle'],
  };
  // role tweaks (first match wins over the kind list)
  const ROLE_ROUTE = {
    tank: { toggle: ['Defense', 'Magic Defense', 'Power', 'Cost'], buff: ['Time', 'Defense', 'Power', 'Magic Defense', 'Cost'], passive: ['Defense', 'Magic Defense', 'Power'] },
    healer: { buff: ['Time', 'Power', 'Cost', 'Recycle'], toggle: ['Cost', 'Power'] },
    nuker: { attack: ['Power', 'Cost', 'Recycle', 'Chance'] },
    buffer: { buff: ['Time', 'Power', 'Decrease Penalty', 'Cost'] },
  };
  // how much each kind of skill matters for a role (enchant order)
  const KIND_W = {
    tank: { aggro: 100, toggle: 80, buff: 75, passive: 60, attack: 55, debuff: 50, summon: 45, heal: 40, resurrect: 10, other: 20 },
    healer: { heal: 100, resurrect: 70, buff: 65, toggle: 40, debuff: 35, passive: 30, summon: 20, attack: 5, aggro: 0, other: 20 },
    buffer: { buff: 100, toggle: 70, heal: 60, debuff: 55, attack: 35, passive: 30, summon: 30, resurrect: 20, aggro: 0, other: 20 },
    nuker: { attack: 100, summon: 60, debuff: 55, toggle: 50, buff: 45, passive: 30, heal: 20, resurrect: 10, aggro: 0, other: 20 },
    melee: { attack: 100, buff: 70, toggle: 65, debuff: 45, passive: 40, aggro: 20, heal: 15, summon: 30, resurrect: 0, other: 20 },
    summoner: { summon: 100, buff: 70, attack: 60, debuff: 50, heal: 40, toggle: 45, passive: 30, resurrect: 10, aggro: 0, other: 20 },
    spoiler: { attack: 90, debuff: 70, buff: 50, toggle: 50, passive: 30, heal: 15, summon: 20, aggro: 0, resurrect: 0, other: 20 },
    crafter: { summon: 90, attack: 70, buff: 60, toggle: 50, debuff: 40, passive: 30, heal: 15, aggro: 0, resurrect: 0, other: 20 },
  };
  const ROLE_ALIAS = { dagger: 'melee', archer: 'melee', base: 'melee', dd: 'melee', fighter: 'melee', mage: 'nuker', caster: 'nuker', support: 'buffer' };
  const roleOf = (r) => { r = String(r || '').toLowerCase(); return KIND_W[r] ? r : (ROLE_ALIAS[r] || 'melee'); };

  /** score every route of a skill for a role: [{ route, name, score, why }] best first */
  function scoreRoutes(skill, role) {
    role = roleOf(role);
    const kind = skill.kind || 'other';
    const pref = (ROLE_ROUTE[role] && ROLE_ROUTE[role][kind]) || ROUTE_PREF[kind] || ROUTE_PREF.other;
    return (skill.routes || []).map(r => {
      const nm = String(r.name || '');
      let i = pref.findIndex(p => p.toLowerCase() === nm.toLowerCase());
      if (i < 0) i = pref.findIndex(p => nm.toLowerCase().startsWith(p.toLowerCase()));
      let score = i >= 0 ? 100 - i * 8 : 20;
      let why = i >= 0 ? `${nm}: ${kind} skill, ${i === 0 ? 'first choice' : 'choice ' + (i + 1)} for a ${role}` : `${nm}: not in the ${kind} list`;
      if (/^Duel$/i.test(nm)) { score = 1; why = 'Duel: PvP damage only (the bots fight monsters)'; }
      if (/^(Weaken|.* Vulnerability|.* Weakness|Resist )/i.test(nm) && kind === 'debuff') { score = Math.max(score, 30); }
      return { route: r.route, name: nm, group: r.group, score, why };
    }).sort((a, b) => b.score - a.score || a.route - b.route);
  }
  /** enchant order weight of a skill for a role (higher = earlier) */
  function priority(skill, role, extra) {
    role = roleOf(role);
    const w = (KIND_W[role] || KIND_W.melee)[skill.kind || 'other'];
    let p = w === undefined ? 20 : w;
    p += Math.min(16, num(skill.getLevel) / 5);                 // later skills are the class's core skills
    if (skill.table === '3rd') p += 8;                          // 3rd-class skills (Templar / Cardinal / ...) are the strongest
    if (extra && extra.primary && extra.primary.includes(skill.id)) p += 25;   // the caster's primary nuke (caster_primary.json)
    return Math.round(p * 10) / 10;
  }

  // ------------------------------------------------------------------------------------------------------- characters
  /** class path root -> target 3rd class from class_tree.json */
  function classPathTo(ct, target) {
    const out = []; let c = num(target, -1), guard = 0;
    while (c >= 0 && ct && ct.classes && ct.classes[c] && guard++ < 6) { out.unshift(c); const p = ct.classes[c].parent; c = p === null || p === undefined ? -1 : num(p, -1); }
    return out;
  }
  /** the 3rd class a character goes for: approved class plan > current class (tier 3) > only child of the current class > role suggestion */
  function target3rd(st, ct, role) {
    const tier = (id) => ct && ct.classes && ct.classes[id] ? ct.classes[id].tier : null;
    const plan = st && st.classPlanInfo && Array.isArray(st.classPlanInfo.plan) ? st.classPlanInfo.plan : null;
    if (plan) { const t = plan.slice().reverse().find(id => tier(id) === 3); if (t !== undefined) return { id: t, from: 'class plan' }; }
    const cid = st ? num(st.classId, -1) : -1;
    if (tier(cid) === 3) return { id: cid, from: 'current class' };
    let c = cid, guard = 0;
    while (c >= 0 && ct.classes[c] && tier(c) < 3 && guard++ < 4) { const ch = (ct.classes[c].children || []).filter(x => !(ct.classes[x] || {}).subclassOnly); if (ch.length !== 1) break; c = ch[0]; }
    if (tier(c) === 3) return { id: c, from: 'class tree' };
    const sug = ct && ct.roleSuggestions && ct.roleSuggestions[role];
    if (sug && sug.length) { const path = sug.find(p => cid < 0 || p.includes(cid)) || sug[0]; const t = path[path.length - 1]; if (tier(t) === 3) return { id: t, from: 'role suggestion' }; }
    return null;
  }
  /** swarm.config.json accounts + Logs/swarm_state_*.json -> [{ name, party, role, roleKind, level, classId, cls, target, path, online, sp, adena, live }] */
  function charactersFrom(cfg, states, ct) {
    const seen = new Set(), out = [];
    ((cfg && cfg.accounts) || []).forEach(a => {
      const n = a && a.character; if (!n || seen.has(n) || a.enabled === false) return; seen.add(n);
      const st = (states && states[n]) || null;
      const role = a.role || (st && st.role) || '';
      const t = target3rd(st, ct, role);
      const roleKind = (st && st.roleKind) || (t && ct.classes[t.id] && ct.classes[t.id].role) || role;
      const age = st && st.updated ? (Date.now() - Date.parse(st.updated)) / 1000 : null;
      out.push({ name: n, party: a.party || '', role, roleKind, level: st ? num(st.level) : null, classId: st ? num(st.classId, -1) : -1, cls: (st && st.cls) || '',
        target: t ? t.id : null, targetName: t && ct.classes[t.id] ? ct.classes[t.id].name : '', targetFrom: t ? t.from : '', path: t ? classPathTo(ct, t.id) : [],
        online: age !== null && age <= 90, sp: st && st.skillEnchant && st.skillEnchant.sp != null ? num(st.skillEnchant.sp) : (st && st.sp != null ? num(st.sp) : null),
        adena: st && st.adena != null ? num(st.adena) : null, live: st && st.skillEnchant ? st.skillEnchant : null });
    });
    return out;
  }
  /** the enchantable skills a class path learns up to their max base level: [{ skill, getLevel, by }] */
  function skillsForPath(data, path) {
    const set = new Set(path || []), out = [];
    Object.values((data && data.skills) || {}).forEach(s => {
      let maxLvl = 0, getLevel = 0, by = null;
      (s.learnedBy || []).forEach(l => { if (set.has(l.classId) && l.maxLevel > maxLvl) { maxLvl = l.maxLevel; getLevel = l.getLevel; by = l.className; } });
      if (!maxLvl || maxLvl < s.baseMaxLevel) return;            // never reaches the max base level on this path: cannot be enchanted
      out.push({ skill: s, getLevel, by });
    });
    return out;
  }
  /** the caster's primary nukes (Scripts/data/caster_primary.json, role 'primary') of its target 3rd class / class path: [skill ids] */
  function primaryFrom(casterPrimary, ch) {
    const out = [];
    if (!casterPrimary || !ch) return out;
    [ch.target].concat((ch.path || []).slice().reverse()).forEach(cid => {
      const list = casterPrimary[cid]; if (!Array.isArray(list)) return;
      list.forEach(x => { if (x && x.role === 'primary' && !out.includes(num(x.skillId))) out.push(num(x.skillId)); });
    });
    return out;
  }
  /** character settings with the defaults filled in */
  function charSettings(settings, name) {
    const s = Object.assign({}, DEFAULT_SETTINGS, settings || {});
    const c = (s.chars && s.chars[name]) || {};
    return { auto: false, globalAuto: false, charAuto: c.auto === false ? false : undefined, manualOnly: true,   // NEVER automatic (user 2026-10-12) minChance: num(c.minChance, num(s.minChance, 80)), reserveAdena: num(s.reserveAdena, 5000000),
      maxTriesPerVisit: num(s.maxTriesPerVisit, 6), routes: c.routes || {} };
  }
  /**
   * One character's recommendation: which of ITS skills can be enchanted, the best route for its role, costs.
   * opts: { level (character level to price at; default max(live level, 76)), detail (per-level table of the chosen route), primary: [skill ids], live: { id: level } }
   */
  function recommendChar(data, ch, settings, opts) {
    opts = opts || {};
    const cs = charSettings(settings, ch.name), role = roleOf(ch.roleKind || ch.role);
    const lvl = Math.max(LEVELS[0], num(opts.level, num(ch.level, LEVELS[0])));
    const live = opts.live || (ch.live && ch.live.skills) || null;
    const tier3Now = TIER3.includes(num(ch.classId, -1));
    const why = [];
    if (!ch.target) why.push('no 3rd class known (no class plan)');
    if (!tier3Now) why.push(`needs the 3rd class${ch.targetName ? ' (' + ch.targetName + ')' : ''}`);
    if (num(ch.level) < LEVELS[0]) why.push(`needs level 76 (now ${ch.level == null ? '?' : ch.level})`);
    const list = skillsForPath(data, ch.path).map(({ skill, getLevel, by }) => {
      const s = Object.assign({}, skill, { getLevel });
      const scores = scoreRoutes(s, role);
      const best = scores[0] || null;
      const ov = cs.routes[s.id] !== undefined ? num(cs.routes[s.id], -1) : null;
      const chosenRoute = ov !== null && ov >= 0 ? ov : (best ? best.route : 0);   // 0 = do not enchant
      const r = (s.routes || []).find(x => x.route === chosenRoute) || null;
      const cur = live && live[s.id] !== undefined ? parseLevel(live[s.id]) : null;
      const curLevel = live && live[s.id] !== undefined ? num(live[s.id]) : null;
      const g = r && data.groups[r.group];
      // on another route already: the bot never changes routes by itself (Discipline book), the page shows it
      const onOther = cur && cur.route && r && cur.route !== r.route;
      const from = cur && r && cur.route === r.route ? cur.plus : 0;
      const tgt = g ? targetPlus(g, from, lvl, cs.minChance) : 0;
      const item = { id: s.id, name: s.name, icon: s.icon, kind: s.kind, table: s.table, baseMaxLevel: s.baseMaxLevel, getLevel, learnedBy: by,
        priority: priority(s, role, { primary: opts.primary }), haveLevel: curLevel, current: cur, haveMax: curLevel !== null ? curLevel >= s.baseMaxLevel : null,
        routes: scores.map(x => { const rr = s.routes.find(y => y.route === x.route) || {}; return { route: x.route, name: x.name, group: x.group, score: x.score, why: x.why, maxEnchant: rr.maxEnchant, plus1: rr.plus1, plusMax: rr.plusMax }; }),
        best: best ? { route: best.route, name: best.name, why: best.why } : null,
        chosen: r ? { route: r.route, name: r.name, group: r.group, from: ov !== null ? 'your choice' : 'recommended', maxEnchant: r.maxEnchant } : { route: 0, name: 'skip', from: ov === 0 ? 'your choice' : 'none' },
        onOtherRoute: onOther ? cur.route : 0,
        target: g ? { from, plus: tgt, atLevel: lvl, minChance: cs.minChance, nextChance: chance(g, from + 1, lvl) } : null };
      if (g) {
        item.cost = { normalToTarget: expectedCost(g, from, tgt, lvl, 'normal'), safeToTarget: expectedCost(g, from, tgt, lvl, 'safe'),
          normalToMax: expectedCost(g, from, g.maxEnchant, Math.max(lvl, 85), 'normal'), safeToMax: expectedCost(g, from, g.maxEnchant, Math.max(lvl, 85), 'safe') };
        if (opts.detail) item.perLevel = g.levels.map(l => ({ plus: l.plus, sp: l.sp, adena: l.adena, chance: l.chance, guide: l.guide || null, chanceNow: chance(g, l.plus, lvl), step: (r.steps || [])[l.plus - 1] || (r.steps || [])[0] || '' }));
      }
      return item;
    }).sort((a, b) => b.priority - a.priority || a.id - b.id);
    const tot = { sp: 0, adena: 0, books: {} };
    list.filter(x => x.chosen.route && x.cost && x.cost.normalToTarget.ok).forEach(x => { const c = x.cost.normalToTarget; tot.sp += c.sp; tot.adena += c.adena; Object.keys(c.books).forEach(id => { tot.books[id] = Math.round(((tot.books[id] || 0) + c.books[id]) * 100) / 100; }); });
    return { name: ch.name, party: ch.party, role, level: ch.level, classId: ch.classId, cls: ch.cls, target: ch.target, targetName: ch.targetName, targetFrom: ch.targetFrom,
      eligible: !why.length, why, pricedAt: lvl, settings: cs, sp: ch.sp, adena: ch.adena, online: ch.online, skills: list, totals: tot };
  }

  // ------------------------------------------------------------------------------------------------------- plan file for the bots
  /**
   * Scripts/data/skill_enchant_plan.json: everything a bot needs, small. groups: { id: { max, sp: [], adena: [], chance: [[10 per +level]] } },
   * chars: { Name: { auto, minChance, reserveAdena, maxTries, list: [{ id, name, base, route, group }] } } in enchant order.
   */
  function buildPlanFile(data, chars, settings, ct, at, opts) {
    const groups = {};
    Object.values(data.groups || {}).forEach(g => { groups[g.id] = { max: g.maxEnchant, sp: g.levels.map(l => l.sp), adena: g.levels.map(l => l.adena), chance: g.levels.map(l => l.chance) }; });
    const s = Object.assign({}, DEFAULT_SETTINGS, settings || {});
    const out = { _about: 'GENERATED by Dashboard/skillenchant_api.js / docs/plan/tools/skill_enchant.js from skill_enchant.json + skill_enchant_settings.json — do not edit; change the routes on the dashboard (#/skillenchant). Read by swarm.js only for the MANUAL order !skillenchant (one attempt per order; NEVER automatic, user 2026-10-12). list[].route = the chosen route (0 = skip for "next"), list[].routes = every route -> group.',
      generated: at || new Date().toISOString(), auto: false, manualOnly: true, minLevel: LEVELS[0], levels: LEVELS, books: BOOKS, multipliers: DEFAULT_RULES.multipliers, tier3: TIER3, groups, chars: {} };
    (chars || []).forEach(ch => {
      const r = recommendChar(data, ch, settings, { level: 85, primary: opts && opts.primaryOf ? opts.primaryOf(ch) : null });
      out.chars[ch.name] = { auto: false, never: r.settings.charAuto === false, minChance: r.settings.minChance, reserveAdena: r.settings.reserveAdena, target: ch.target,
        list: r.skills.filter(x => (x.routes || []).length).map(x => { const rt = {}; x.routes.forEach(y => { if (y.group) rt[y.route] = y.group; });
          return { id: x.id, name: x.name, base: x.baseMaxLevel, route: x.chosen.route || 0, group: x.chosen.group || null, routes: rt }; }) };
    });
    return out;
  }

  // SENPURE-BEGIN (skill enchant, MANUAL ORDER ONLY — user 2026-10-12: enchanting is NEVER automatic. No host calls: copied verbatim into swarm.js)
  /**
   * Check ONE manual skill enchant order.
   * plan = Scripts/data/skill_enchant_plan.json (groups, levels, minLevel, tier3, books, multipliers)
   * me   = { name, level, classId, sp, adena, books: { itemId: count }, skills: { skillId: level }, list: plan.chars[name].list, minChance, never }
   * o    = { id, route, safe } (explicit skill + route; route 0/empty = the plan route) | { next: true, safe } (the first plan step that fits)
   * -> { ok, why, step: { id, name, route, plus, level, chance, sp, adena, book, bookName, safe, failText } }
   */
  function senDecide(plan, me, o) {
    const N = (v, d) => { const n = Number(v); return isFinite(n) ? n : (d === undefined ? 0 : d); };
    o = o || {}; me = me || {};
    if (!plan || !plan.groups) return { ok: false, why: 'no skill enchant plan (Scripts/data/skill_enchant_plan.json)' };
    const minL = N(plan.minLevel, 76), levels = plan.levels || [76, 77, 78, 79, 80, 81, 82, 83, 84, 85];
    if (N(me.level) < minL) return { ok: false, why: 'needs level ' + minL + ' (now ' + N(me.level) + ')' };
    if (!(plan.tier3 || []).includes(N(me.classId, -1))) return { ok: false, why: 'needs the 3rd class (class id ' + N(me.classId, -1) + ')' };
    if (me.never) return { ok: false, why: 'skill enchant is set to "never" for ' + (me.name || 'this character') + ' on the dashboard' };
    const list = me.list || [], safe = !!o.safe, mult = N(((plan.multipliers || {})[safe ? 'safe' : 'normal']), safe ? 5 : 1);
    const books = plan.books || { normal: 6622, safe: 9627 };
    const col = Math.max(0, Math.min(levels.length - 1, N(me.level) - minL));
    const check = (e, route, strict) => {
      const group = route === N(e.route) && e.group ? e.group : (e.routes || {})[route];
      const g = group && plan.groups[group];
      if (!g) return { ok: false, why: (e.name || e.id) + ' has no route ' + route };
      const have = me.skills ? me.skills[e.id] : undefined;
      if (have === undefined || have === null) return { ok: false, why: (e.name || e.id) + ' is not learned' };
      const lv = N(have), cur = lv > 100 ? { route: Math.floor(lv / 100), plus: lv % 100 } : { route: 0, plus: 0 };
      let plus;
      if (cur.route === 0) { if (lv < N(e.base)) return { ok: false, why: (e.name || e.id) + ' needs its max base level ' + e.base + ' first (now ' + lv + ')' }; plus = 1; }
      else if (cur.route !== route) return { ok: false, why: (e.name || e.id) + ' is enchanted on route ' + cur.route + ' (+' + cur.plus + "); a route change (Giant's Codex - Discipline) is not done by this command" };
      else plus = cur.plus + 1;
      if (plus > N(g.max)) return { ok: false, why: (e.name || e.id) + ' is at its maximum +' + g.max };
      const chance = N(((g.chance || [])[plus - 1] || [])[col]);
      if (!strict && chance < N(me.minChance, 80)) return { ok: false, low: true, why: (e.name || e.id) + ' +' + plus + ': ' + chance + ' % is below the minimum ' + N(me.minChance, 80) + ' %' };
      const sp = N((g.sp || [])[plus - 1]) * mult, adena = N((g.adena || [])[plus - 1]) * mult;
      const book = safe ? N(books.safe, 9627) : plus === 1 ? N(books.normal, 6622) : 0;
      if (N(me.sp) < sp) return { ok: false, why: 'not enough SP for ' + (e.name || e.id) + ' +' + plus + ' (' + sp + ', have ' + N(me.sp) + ')' };
      if (N(me.adena) < adena) return { ok: false, why: 'not enough adena for ' + (e.name || e.id) + ' +' + plus + ' (' + adena + ')' };
      if (book && !(me.books && N(me.books[book]) > 0)) return { ok: false, why: 'no ' + (book === N(books.safe, 9627) ? "Giant's Codex - Mastery" : "Giant's Codex") + ' (' + book + ') in the bag for ' + (e.name || e.id) + ' +' + plus };
      return { ok: true, why: 'ok', step: { id: N(e.id), name: e.name || String(e.id), route, plus, level: route * 100 + plus, chance, sp, adena, book, safe,
        bookName: book ? (book === N(books.safe, 9627) ? "Giant's Codex - Mastery" : "Giant's Codex") : '',
        failText: safe ? 'a fail keeps the level (SP, adena and the codex are spent)' : 'a fail drops the skill back to its base level ' + e.base + ' (every +level is lost)' } };
    };
    if (o.next) {
      let first = null;
      for (const e of list) {
        if (!N(e.route)) continue;
        const r = check(e, N(e.route), false);
        if (r.ok) return r;
        if (!first && !/not learned|maximum/.test(r.why)) first = r;
      }
      return first || { ok: false, why: 'nothing to enchant (every plan skill is unlearned, at its maximum or set to skip)' };
    }
    const e = list.find(x => N(x.id) === N(o.id));
    if (!e) return { ok: false, why: 'skill ' + o.id + ' is not an enchantable skill of ' + (me.name || 'this character') };
    return check(e, N(o.route) || N(e.route), true);
  }
  /** the party-chat order for one step (what the dashboard sends) */
  function senOrderText(step, name, safe) {
    return '!skillenchant ' + Number(step.id) + ' ' + Number(step.route) + (safe ? ' safe' : '') + (name ? ' ' + name : '');
  }
  // SENPURE-END
  /** the suggestion for a MANUAL "!skillenchant next" (old name kept for the page/tests). Never runs by itself. */
  function nextEnchant(plan, p, me) {
    const d = senDecide(plan, Object.assign({}, me, { list: p && p.list, minChance: p && p.minChance, never: p && p.never }), { next: true });
    return d.ok ? { next: d.step, why: 'ok' } : { next: null, why: d.why };
  }

  return { LEVELS, BOOKS, TIER3, DEFAULT_RULES, DEFAULT_SETTINGS, ROUTE_PREF, KIND_W, parseLevel, wireLevel, chance, attemptCost, expectedCost, targetPlus, cheaperMode,
    roleOf, scoreRoutes, priority, classPathTo, target3rd, charactersFrom, skillsForPath, primaryFrom, charSettings, recommendChar, buildPlanFile, nextEnchant, senDecide, senOrderText };
}));
