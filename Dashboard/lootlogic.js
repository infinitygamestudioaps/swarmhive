// LOOT RULES — the decision logic (owner 2026-10-13 22:10: an S80 "Sealed Moirai Helmet" Spoiler6's party looted was handed to Dagger1, the clan
// collector, by itself. "OPTIONAL LOOT RULE per party: what happens to loot the party picks up"). Shared by Dashboard/lootrules_api.js (node: require)
// and the party settings popup (browser: window.LootLogic, served as /lootlogic.js). swarm.js has the SAME rules in its LOOTRULE-PURE block
// (docs/plan/tools/test_loot_rules.js runs both on the same inputs).
// One party's rule (Scripts/data/loot_rules.json parties.<leader>; missing = OFF = everyone keeps what it finds):
//   on            false = nothing is handed over by itself (the finder keeps everything)
//   mode          'all'      hand everything the warehouse plan would store (materials, recipes, letters, old gear ...) — the old behaviour
//                 'grade'    like 'all', but valuable gear stays with the finder: keepGrades (e.g. S / S80 / S84), keepEnchanted (+1 and up),
//                            keepSpecial (special ability, "Sword of Valhalla - Health")
//                 'nongear'  hand only non-gear (materials, recipes, letters ...); every weapon / armour / jewel stays with the finder
//                 'list'     hand only the items on the always-give list
//   to            'clanleader' | a character name (the collector)
//   enchant       hand enchant scrolls too (default true)       adenaAbove  hand adena above this amount (0 = keep all adena)
//   never[]       never handed by itself (item id or a name / part of a name) — wins over everything
//   always[]      always handed (also items the warehouse plan keeps, e.g. potions) — wins over mode / grade, never over "never"
// Scopes: 'loot' = the loot hand-over to the collector (every rule above); 'other' = the other AUTOMATIC hand-overs (event letters, clan level
// items, the leader's unload to a teammate): only the never-list and the gear-keep rules (grade / enchanted / special / non-gear) — those have
// their own switches. Your own hand-overs (Trade page, Give buttons, !handover orders you start) are never filtered.
(function (root) {
  'use strict';
  const LOOT_MODES = ['all', 'grade', 'nongear', 'list'];
  const LOOT_GRADES = ['NONE', 'D', 'C', 'B', 'A', 'S', 'S80', 'S84'];
  const LOOT_DEF = { on: false, mode: 'all', to: 'clanleader', enchant: true, adenaAbove: 0, keepGrades: ['S', 'S80', 'S84'], keepEnchanted: true, keepSpecial: true, never: [], always: [] };
  // LOOTLOGIC-PURE-BEGIN (the same text as swarm.js LOOTRULE-PURE; test_loot_rules.js compares the results)
  /** one list entry -> number (item id) | string (name or part of a name) | null */
  function lootEntry(x) {
    if (typeof x === 'number') return Number.isInteger(x) && x > 0 && x < 1e7 ? x : null;
    const s = String(x == null ? '' : x).trim();
    if (!s) return null;
    if (/^\d{1,7}$/.test(s)) { const n = Number(s); return n > 0 ? n : null; }
    return s.length <= 60 ? s : null;
  }
  function lootList(a) { const out = []; (Array.isArray(a) ? a : []).forEach(x => { const e = lootEntry(x); if (e !== null && !out.some(y => String(y).toLowerCase() === String(e).toLowerCase())) out.push(e); }); return out.slice(0, 100); }
  /** a party's rule as the bots use it (missing keys = the defaults; an entry without "on" counts as on: the 2026-10-12 file format) */
  function lootNorm(r) {
    const o = r && typeof r === 'object' && !Array.isArray(r) ? r : null;
    if (!o) return Object.assign({}, LOOT_DEF, { keepGrades: LOOT_DEF.keepGrades.slice(), never: [], always: [] });
    const g = Array.isArray(o.keepGrades) ? o.keepGrades.map(x => String(x || '').toUpperCase()).filter(x => LOOT_GRADES.includes(x)) : LOOT_DEF.keepGrades.slice();
    const a = Number(o.adenaAbove);
    return { on: o.on !== false, mode: LOOT_MODES.includes(o.mode) ? o.mode : 'all', to: String(o.to || 'clanleader').trim() || 'clanleader', enchant: o.enchant !== false,
      adenaAbove: Number.isFinite(a) && a > 0 ? Math.round(a) : 0, keepGrades: LOOT_GRADES.filter(x => g.includes(x)), keepEnchanted: o.keepEnchanted !== false, keepSpecial: o.keepSpecial !== false,
      never: lootList(o.never), always: lootList(o.always) };
  }
  /** the list entry that matches the item ('' = none): id = the item id; text = the name or a part of it (any case) */
  function lootListMatch(list, item) {
    const id = Number(item && item.id), name = String((item && item.name) || '').toLowerCase();
    for (const e of (Array.isArray(list) ? list : [])) {
      if (typeof e === 'number') { if (e === id) return String(e); continue; }
      const s = String(e).toLowerCase(); if (s && name && name.includes(s)) return String(e);
    }
    return '';
  }
  /** "S-grade" | "A-grade and up" | "B / S80-grade" */
  function lootGradesText(g) {
    const L = LOOT_GRADES.filter(x => (g || []).includes(x)); if (!L.length) return 'no grade';
    const lo = LOOT_GRADES.indexOf(L[0]), top = LOOT_GRADES.slice(lo);
    if (L.length === top.length) return L[0] === 'S' ? 'S-grade' : L[0] === 'NONE' ? 'every grade' : `${L[0]}-grade and up`;
    return `${L.join(' / ')}-grade`;
  }
  /** why the item STAYS with its owner ('' = it may be handed). item = { id, name, gear, grade, enchant, special, enchantScroll }; scope 'loot' | 'other' */
  function lootKeepWhy(rule, item, scope) {
    const loot = scope !== 'other';
    if (!rule) return loot ? 'no loot rule for this party — everyone keeps what it finds' : '';
    const R = lootNorm(rule), it = item || {};
    const nv = lootListMatch(R.never, it); if (nv) return `on the never-give list ("${nv}")`;
    if (loot && lootListMatch(R.always, it)) return '';
    if (!R.on) return loot ? 'party rule: everyone keeps what it finds (hand-over off)' : '';
    if (loot && R.mode === 'list') return 'party rule: hand only the items on the always-give list';
    if (it.gear) {
      if (R.mode === 'nongear') return 'gear — party rule: hand only non-gear';
      if (R.mode === 'grade') {
        const gr = String(it.grade || '').toUpperCase();
        if (gr && R.keepGrades.includes(gr)) return `${gr === 'NONE' ? 'no-grade' : gr} gear — party rule: keep ${lootGradesText(R.keepGrades)}`;
        if (R.keepEnchanted && Number(it.enchant) > 0) return `+${Number(it.enchant)} enchanted — party rule: keep enchanted gear`;
        if (R.keepSpecial && it.special) return 'special ability — party rule: keep special-ability gear';
      }
    }
    if (loot && it.enchantScroll && !R.enchant) return 'enchant scroll — party rule: keep enchant scrolls';
    return '';
  }
  /** items -> { give: [...], kept: [{ ...item, why }] } */
  function lootSplit(rule, items, scope) {
    const give = [], kept = [];
    (items || []).forEach(it => { const why = lootKeepWhy(rule, it, scope); if (why) kept.push(Object.assign({}, it, { why })); else give.push(it); });
    return { give, kept };
  }
  /** the collector's name: 'clanleader' -> the clan leader */
  function lootReceiver(rule, clanLeader) { const t = lootNorm(rule).to; return /^clan ?leader$/i.test(t) ? String(clanLeader || '') : t; }
  /** one plain sentence for the dashboard */
  function lootSummary(rule, clanLeader) {
    if (!rule) return 'Off — everyone keeps what it finds. Nothing is handed over by itself.';
    const R = lootNorm(rule), to = lootReceiver(rule, clanLeader) || 'the clan leader';
    if (!R.on) return 'Off — everyone keeps what it finds. Nothing is handed over by itself.';
    const extra = [];
    if (R.never.length) extra.push(`never: ${R.never.slice(0, 4).join(', ')}${R.never.length > 4 ? ' …' : ''}`);
    if (R.mode !== 'list' && R.always.length) extra.push(`always: ${R.always.slice(0, 4).join(', ')}${R.always.length > 4 ? ' …' : ''}`);
    const x = extra.length ? ` (${extra.join('; ')})` : '';
    if (R.mode === 'list') return R.always.length ? `Only the listed items go to ${to} (${R.always.slice(0, 5).join(', ')}${R.always.length > 5 ? ' …' : ''}); everything else stays with the finder.` : `Only listed items go to ${to} — the list is empty, so nothing moves.`;
    if (R.mode === 'nongear') return `Materials, recipes, letters … go to ${to}; every weapon, armour and jewel stays with the finder${x}.`;
    if (R.mode === 'grade') {
      const k = [R.keepGrades.length ? `${lootGradesText(R.keepGrades)} gear` : '', R.keepEnchanted ? 'enchanted gear' : '', R.keepSpecial ? 'special-ability gear' : ''].filter(Boolean);
      return k.length ? `Everything goes to ${to}, except ${k.join(', ').replace(/, ([^,]*)$/, ' and $1')} — that stays with the finder${x}.` : `Everything goes to ${to}${x}.`;
    }
    return `Everything the party finds goes to ${to}${x}.`;
  }
  // LOOTLOGIC-PURE-END
  /** sample loot for the "what happens" examples on the dashboard */
  const LOOT_EXAMPLES = [
    { id: 15694, name: 'Sealed Moirai Helmet', what: 'S80 helmet', gear: true, grade: 'S80' },
    { id: 148, name: 'Sword of Valhalla - Health', what: 'A-grade sword with a special ability', gear: true, grade: 'A', special: true },
    { id: 365, name: '+3 Dark Crystal Breastplate', what: 'A-grade armour, enchanted +3', gear: true, grade: 'A', enchant: 3 },
    { id: 356, name: 'Full Plate Armor', what: 'C-grade armour', gear: true, grade: 'C' },
    { id: 1864, name: 'Stem', what: 'crafting material', gear: false },
    { id: 1805, name: 'Recipe: Soulshot (C-grade)', what: 'recipe', gear: false },
    { id: 3875, name: 'L2Day - A', what: 'event letter', gear: false },
    { id: 959, name: 'Scroll: Enchant Weapon (S-grade)', what: 'enchant scroll', gear: false, enchantScroll: true }];
  /** [{ name, what, give, why }] for the examples (with this rule) */
  function lootExamples(rule) { return LOOT_EXAMPLES.map(e => { const why = lootKeepWhy(rule, e, 'loot'); return { name: e.name, what: e.what, give: !why, why }; }); }
  const API = { LOOT_MODES, LOOT_GRADES, LOOT_DEF, LOOT_EXAMPLES, lootEntry, lootList, lootNorm, lootListMatch, lootGradesText, lootKeepWhy, lootSplit, lootReceiver, lootSummary, lootExamples };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.LootLogic = API;
})(typeof window !== 'undefined' ? window : this);
