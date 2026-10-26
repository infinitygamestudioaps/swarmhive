// TRADE / HAND-OVER logic (user 2026-10-10: "buttons so I can tell teams and characters to go to the clan leader OR a character of my own
// choice and trade everything we want to. I need to be able to select what should be traded easily."). Pure functions, no DOM, no fs:
// used by Dashboard/tradepage_api.js (server: categorise the live bags, check an order before it is written) AND by Dashboard/tradepage.js
// (browser: quick buttons, presets, the dry-run preview). Tested by docs/plan/tools/test_handover.js.
// The bot side (Scripts_dev/swarm.js HANDOVER-PURE) applies the SAME refusal rules again on its live bag right before each trade:
// never equipped, never quest items, never items the server does not let you trade (Scripts/data/trade_items.json notrade), never adena
// unless the order names an amount.
(function (root, factory) {
  const M = factory();
  if (typeof module === 'object' && module.exports) module.exports = M;
  else root.TradeLogic = M;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  // category key, label, icon (Dashboard/icons/<path>.png), quick-button label
  const TRADE_CATS = [
    ['raid', 'Raid materials', 'icon/etc_broken_crystal_red_i00'],
    ['material', 'Crafting materials', 'icon/etc_crystal_blue_i00'],
    ['recipe', 'Recipes', 'icon/etc_recipe_blue_i00'],
    ['enchant', 'Enchant scrolls', 'icon/etc_scroll_of_enchant_weapon_i01'],
    ['gear', 'Gear (not worn)', 'icon/armor_t53_u_i00'],
    ['dye', 'Dyes', 'icon/etc_str_hena_i00'],
    ['lifestone', 'Life stones', 'icon/etc_mineral_general_i00'],
    ['consumable', 'Consumables', 'icon/etc_potion_scarlet_i00'],
    ['other', 'Everything else', 'icon/etc_question_mark_i00'],
  ];
  const CAT_KEYS = TRADE_CATS.map(c => c[0]);
  const QUICK = {
    materials: { label: 'All materials', cats: ['raid', 'material'] },
    raid: { label: 'Raid materials', cats: ['raid'] },
    recipes: { label: 'All recipes', cats: ['recipe'] },
    enchant: { label: 'All enchant scrolls', cats: ['enchant'] },
    gear: { label: 'All unequipped gear', cats: ['gear'] },
    lifestones: { label: 'All life stones', cats: ['lifestone'] },
    dyes: { label: 'All dyes', cats: ['dye'] },
    all: { label: 'Everything tradeable', cats: CAT_KEYS.filter(c => c !== 'consumable'), note: 'every tradeable kind except consumables (potions, shots, scrolls — tick them by hand) and adena' },
  };
  const GEAR_TYPES = /^(weapon|armor|armour|accessory|accessary|jewel)/i;
  const ID_RE = /^[a-z0-9][a-z0-9_-]{3,40}$/i;
  const LIMITS = { batch: 8, maxRows: 400, maxGivers: 40 };

  const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const setOf = (arr) => { const s = new Set(); (arr || []).forEach(x => s.add(num(x))); return s; };

  /** data = Scripts/data/trade_items.json -> { notrade: Set, cat: {id: key} } (cached on the object) */
  function trData(data) {
    if (!data) return { notrade: new Set(), cat: {}, quest: new Set() };
    if (data._tl) return data._tl;
    const d = { notrade: setOf(data.notrade), cat: data.cat || {}, quest: setOf(data.questItems || []) };
    try { Object.defineProperty(data, '_tl', { value: d, enumerable: false }); } catch (e) { }
    return d;
  }
  /** one bag row (MCP get_account_data inventory, as /api/char maps it: id, objId, name, count, equipped, quest, type) ->
   *  { cat, ok, why }   ok = may be offered for a trade (adena: never ticked by a category, only by its own amount field) */
  function trClassify(row, data) {
    const D = trData(data), id = num(row && row.id);
    if (id === 57) return { cat: 'adena', ok: false, why: 'adena: only with its own amount field' };
    const cat = D.cat[id] || (GEAR_TYPES.test(String((row && row.type) || '')) ? 'gear' : 'other');
    if (row && row.equipped) return { cat, ok: false, why: 'worn (equipped)' };
    if ((row && row.quest) || D.quest.has(id)) return { cat, ok: false, why: 'quest item' };
    if (D.notrade.has(id)) return { cat, ok: false, why: 'the server does not allow trading it' };
    return { cat, ok: true, why: '' };
  }
  /** a whole bag -> rows sorted by category order, then name: { objId, id, name, count, cat, ok, why, enchant, grade, stack } + adena */
  function trBagRows(items, data) {
    const rows = []; let adena = 0;
    (items || []).forEach(it => {
      if (!it) return;
      const id = num(it.id != null ? it.id : it.item_id);
      const r = { objId: num(it.objId != null ? it.objId : it.obj_id), id, name: String(it.name || ''), count: Math.max(1, num(it.count)),
        equipped: !!(it.equipped != null ? it.equipped : it.is_equipped), quest: !!(it.quest != null ? it.quest : it.is_quest), type: String(it.type || ''),
        enchant: num(it.enchant != null ? it.enchant : it.enchant_level), grade: String(it.grade || '') };
      if (id === 57) { adena += r.count; return; }
      const c = trClassify(r, data);
      r.cat = c.cat; r.ok = c.ok; r.why = c.why; r.stack = r.count > 1 || r.cat === 'consumable' || r.cat === 'material' || r.cat === 'raid' || r.cat === 'enchant' || r.cat === 'dye' || r.cat === 'lifestone';
      rows.push(r);
    });
    const ord = (c) => { const i = CAT_KEYS.indexOf(c); return i < 0 ? 99 : i; };
    rows.sort((a, b) => (a.ok === b.ok ? 0 : a.ok ? -1 : 1) || ord(a.cat) - ord(b.cat) || a.name.localeCompare(b.name) || b.enchant - a.enchant);
    return { rows, adena };
  }
  /** counts per category of the tradeable rows of several bags { cat: { kinds, count } } */
  function trCatCounts(bags) {
    const out = {};
    Object.keys(bags || {}).forEach(n => ((bags[n] && bags[n].rows) || []).forEach(r => { if (!r.ok) return; const o = out[r.cat] = out[r.cat] || { kinds: 0, count: 0 }; o.kinds++; o.count += r.count; }));
    return out;
  }
  /** selection = { giver: { objId: count } }; adena = { giver: amount }. Tick every tradeable row of `cats` (all givers), full counts. */
  function trSelectCats(sel, bags, cats, on) {
    const out = Object.assign({}, sel || {}), C = new Set(cats || []);
    Object.keys(bags || {}).forEach(n => {
      const m = out[n] = Object.assign({}, out[n] || {});
      ((bags[n] && bags[n].rows) || []).forEach(r => { if (r.ok && C.has(r.cat)) { if (on === false) delete m[r.objId]; else m[r.objId] = r.count; } });
    });
    return out;
  }
  function trQuick(sel, bags, key, on) { const q = QUICK[key]; return q ? trSelectCats(sel, bags, q.cats, on) : sel; }
  /** text search over name / category / id */
  function trMatch(row, q) {
    q = String(q || '').trim().toLowerCase(); if (!q) return true;
    return q.split(/\s+/).every(w => String(row.name).toLowerCase().includes(w) || String(row.cat).toLowerCase().includes(w) || String(row.id) === w);
  }
  // ---------------- presets ----------------
  // preset = { name, receiver: '@clanleader' | '<name>' | '', cats: [keys], ids: [item ids], names: [regex text], exclude: [item ids], adena: number }
  function trPresetCheck(p) {
    const err = [];
    if (!p || typeof p !== 'object') return { ok: false, errors: ['not an object'] };
    if (!String(p.name || '').trim() || String(p.name).length > 60) err.push('a name (max 60 characters)');
    (p.cats || []).forEach(c => { if (!CAT_KEYS.includes(c)) err.push(`unknown category "${c}"`); });
    (p.names || []).forEach(s => { try { new RegExp(s, 'i'); } catch (e) { err.push(`bad name pattern "${s}"`); } });
    if (p.adena != null && (num(p.adena) < 0 || !Number.isFinite(Number(p.adena)))) err.push('adena must be 0 or more');
    if (!(p.cats || []).length && !(p.ids || []).length && !(p.names || []).length && !num(p.adena)) err.push('nothing to trade (no category, item or adena)');
    return { ok: !err.length, errors: err };
  }
  function trPresetPick(p, row) {
    if (!row.ok) return false;
    if ((p.exclude || []).some(x => num(x) === row.id)) return false;
    if ((p.cats || []).includes(row.cat)) return true;
    if ((p.ids || []).some(x => num(x) === row.id)) return true;
    return (p.names || []).some(s => { try { return new RegExp(s, 'i').test(row.name); } catch (e) { return false; } });
  }
  /** a preset on the givers' bags -> { sel, adena } */
  function trApplyPreset(p, bags) {
    const sel = {}, adena = {}, lim = {};   // PRESETQTY-2026-10-26: a preset with items [{id, count}] ticks at most that many per giver
    (p.items || []).forEach(x => { const id = num(x && x.id), c = num(x && x.count); if (id && c > 0) lim[id] = c; });
    Object.keys(bags || {}).forEach(n => {
      const m = sel[n] = {}, left = Object.assign({}, lim);
      ((bags[n] && bags[n].rows) || []).forEach(r => {
        if (left[r.id] !== undefined && r.ok && !(p.exclude || []).some(x => num(x) === r.id) && !(p.cats || []).includes(r.cat)) {
          if (left[r.id] > 0) { const c = Math.min(num(r.count) || 1, left[r.id]); m[r.objId] = c; left[r.id] -= c; }
          return;
        }
        if (trPresetPick(p, r)) m[r.objId] = r.count;
      });
      const a = Math.min(num(p.adena), num(bags[n] && bags[n].adena));
      if (a > 0) adena[n] = a;
    });
    return { sel, adena };
  }
  /** '@clanleader' / '' -> the clan leader; a name stays */
  function trReceiver(spec, clanLeader) { const s = String(spec || '').trim(); return !s || /^@?clan ?leader$/i.test(s) ? String(clanLeader || '') : s; }
  // ---------------- preview / order ----------------
  /** the exact hand-over per giver from the selection: { givers: [{ name, rows: [{objId,id,name,count,cat,stack}], adena, kinds, problems[] }],
   *  total: { givers, kinds, adena }, problems[] }   (only tradeable rows, counts capped at what the bag holds; the receiver never gives) */
  function trPreview(sel, adena, bags, receiver) {
    const out = { givers: [], total: { givers: 0, kinds: 0, adena: 0 }, problems: [] };
    const names = [...new Set(Object.keys(sel || {}).concat(Object.keys(adena || {})))];
    names.forEach(n => {
      const b = bags && bags[n]; const g = { name: n, rows: [], adena: 0, kinds: 0, problems: [] };
      if (n === receiver) { if (Object.keys((sel || {})[n] || {}).length || num((adena || {})[n])) out.problems.push(`${n} is the receiver — it gives nothing`); return; }
      if (!b) { g.problems.push('no bag loaded'); }
      const byObj = {}; ((b && b.rows) || []).forEach(r => { byObj[r.objId] = r; });
      Object.keys((sel || {})[n] || {}).forEach(k => {
        const want = num(sel[n][k]); if (want <= 0) return;
        const r = byObj[num(k)];
        if (!r) { g.problems.push(`object ${k} is not in the bag any more`); return; }
        if (!r.ok) { g.problems.push(`${r.name}: ${r.why}`); return; }
        g.rows.push({ objId: r.objId, id: r.id, name: r.name, count: Math.min(want, r.count), cat: r.cat, stack: !!r.stack, enchant: r.enchant || 0 });
      });
      const a = num((adena || {})[n]);
      if (a > 0) { const have = num(b && b.adena); if (a > have) g.problems.push(`adena ${a} > ${have} in the bag (capped)`); g.adena = Math.min(a, have); }
      g.kinds = g.rows.length;
      if (g.rows.length || g.adena) { out.givers.push(g); out.total.givers++; out.total.kinds += g.kinds; out.total.adena += g.adena; }
      else if (g.problems.length) out.problems.push(`${n}: ${g.problems.join('; ')}`);
    });
    if (out.total.kinds > LIMITS.maxRows) out.problems.push(`more than ${LIMITS.maxRows} kinds in one order`);
    return out;
  }
  /** batches of the trade window (batch size, adena last) — the bots use the same split (swarm.js hovBatches) */
  function trBatches(rows, size) {
    const s = Math.max(1, num(size) || LIMITS.batch), items = (rows || []).filter(r => !r.adena), ad = (rows || []).filter(r => r.adena), out = [];
    for (let i = 0; i < items.length; i += s) out.push(items.slice(i, i + s));
    if (ad.length) { if (out.length && out[out.length - 1].length < s) out[out.length - 1] = out[out.length - 1].concat(ad); else out.push(ad); }
    return out;
  }
  /** the order file body (Logs/handover/<id>.json) from a preview */
  function trOrder(id, receiver, preview, extra) {
    const givers = {};
    (preview.givers || []).forEach(g => { givers[g.name] = { items: g.rows.map(r => ({ objId: r.objId, id: r.id, name: r.name, count: r.count, stack: !!r.stack })), adena: g.adena || 0 }; });
    return Object.assign({ id, v: 1, at: new Date().toISOString(), receiver, givers, batch: LIMITS.batch }, extra || {});
  }
  function trNewId(t) { return 'h' + (t || Date.now()).toString(36) + Math.random().toString(36).slice(2, 6); }
  /** a giver's result file -> a short status { state, label, given, failed, skipped } for the page */
  function trResultLine(r) {
    if (!r) return { state: 'waiting', label: 'no answer yet (the order reaches it within seconds when its swarm.js runs)' };
    const g = (r.given || []).length, f = (r.failed || []).length, s = (r.skipped || []).length;
    const st = String(r.state || '');
    const label = st === 'done' ? `done — gave ${g} kind${g === 1 ? '' : 's'}${r.adenaGiven ? ' + ' + r.adenaGiven + ' adena' : ''}${f ? `, ${f} failed` : ''}${s ? `, ${s} skipped` : ''}`
      : st === 'failed' ? `FAILED — ${r.msg || 'unknown'}${g ? ` (gave ${g} before)` : ''}`
      : st === 'stopped' ? `stopped${g ? ` after ${g} kinds` : ''}`
      : `${st || 'working'}${r.step ? ': ' + r.step : ''}${g ? ` — ${g} given so far` : ''}`;
    return { state: st || 'working', label, given: g, failed: f, skipped: s };
  }
  return { TRADE_CATS, CAT_KEYS, QUICK, LIMITS, ID_RE, trData, trClassify, trBagRows, trCatCounts, trSelectCats, trQuick, trMatch,
    trPresetCheck, trPresetPick, trApplyPreset, trReceiver, trPreview, trBatches, trOrder, trNewId, trResultLine };
});
