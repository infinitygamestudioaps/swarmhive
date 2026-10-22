// HEAL SCHEME LOGIC (2026-10-13, public tester: "SE uses Self Heal at lvl 80", "no MP recharge from SE/EE", "let me set my own heal / MP
// schemes"). The HEALSCHEME-PURE block below is a TEXT COPY of the block in Scripts_dev/swarm.js (what the bots run), written by
// docs/plan/tools/heal_logic_sync.js; docs/plan/tools/test_heal_schemes.js fails when they differ.
// Used by Dashboard/healschemes_api.js (server: /api/healschemes), Dashboard/healschemes.js (browser: window.HealLogic) and the tests.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.HealLogic = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

// HEALSCHEME-PURE-BEGIN (no host calls in here: docs/plan/tools/test_heal_schemes.js runs this block in node; Dashboard/heallogic.js is a TEXT
// COPY written by docs/plan/tools/heal_logic_sync.js — edit it here, then run that tool)
// HEAL SCHEMES (public tester 2026-10-13: "SE uses Self Heal — the weakest heal skill — at lvl 80", "no MP recharge from SE/EE", "let me set my own
// heal / MP schemes"). Every heal / recharge skill a character KNOWS is judged by its real power at the level it learned (Scripts/data/
// heal_skills.json, from the datapack: docs/plan/tools/heal_skills.js). The player's scheme (Scripts/data/heal_schemes.json, dashboard: the
// character page "Healing" button and the party settings popup) can set the skill and the HP % per situation; anything not set = automatic.
//   situations: single (heal a teammate) · emergency (someone is dying: a fast, strong heal) · group (party heal) · self (heal myself, used by
//               the non-healers' support / survival heal) · recharge (MP to a teammate)
//   Self Heal is used ONLY when the character knows no other single heal (or the player picked it for "self").
//   Raid rules stay: tank first below 60 % and the spam below 80 % in raids / dungeons, no heals on a draining Destroyer, healers only heal.
const HS_DEFAULT = { single: { skill: 'auto', below: 90 }, emergency: { skill: 'auto', below: 50 }, group: { skill: 'auto', below: 80, count: 3 },
  self: { skill: 'auto', below: 45 }, recharge: { on: true, skill: 'auto', below: 40, who: 'casters' }, priority: 'auto', potion: { below: 'auto' },
  never: [], xmlSelfHeal: 'auto' };
const HS_SITS = ['single', 'emergency', 'group', 'self', 'recharge'];
const HS_PRIORITIES = ['auto', 'tank', 'healers', 'lowest'];
const HS_WHO = ['casters', 'everyone'];
const HS_XML = ['auto', 'keep'];
// the skill kinds the AUTOMATIC choice uses per situation, and the kinds a player may PICK for it
const HS_KINDS = { single: ['single'], emergency: ['single', 'singlePct'], group: ['group', 'groupPct', 'balance'], self: ['single', 'self'], recharge: ['recharge', 'massRecharge'] };
const HS_CHOOSE = { single: ['single', 'singlePct'], emergency: ['single', 'singlePct'], group: ['group', 'groupPct', 'balance'], self: ['single', 'self', 'singlePct'], recharge: ['recharge', 'massRecharge'] };
// heal_skills.json missing: id -> [kind, power at the top level, cast ms, reuse ms, name]
const HS_FALLBACK = { 1011: ['single', 301, 5000, 3000, 'Heal'], 1015: ['single', 301, 2000, 1000, 'Battle Heal'], 1217: ['single', 472, 5000, 3000, 'Greater Heal'],
  1218: ['single', 858, 2000, 1000, 'Greater Battle Heal'], 1401: ['single', 946, 5000, 1000, 'Major Heal'], 1020: ['single', 780, 3000, 3000, 'Vitalize'],
  1216: ['self', 42, 5000, 3000, 'Self Heal'], 1027: ['group', 241, 7000, 6000, 'Group Heal'], 1219: ['group', 378, 7000, 6000, 'Greater Group Heal'],
  1402: ['group', 1170, 7000, 3000, 'Major Group Heal'], 1271: ['groupPct', 100, 7000, 900000, 'Benediction'], 1258: ['singlePct', 30, 8000, 30000, 'Restore Life'],
  1335: ['balance', 0, 5000, 30000, 'Balance Life'], 1013: ['recharge', 136, 6000, 3000, 'Recharge'], 1428: ['massRecharge', 1500, 5000, 3600000, 'Mass Recharge'] };
// who counts as a caster for "Recharge: casters only" (role tokens; the same list the healer brain used since D16 2026-10-12)
const HS_CASTER_RE = /bishop|necro|doomcryer|saint|healer|mage|buffer|summoner|nuker|caster|singer|howler|sorc|wizard|elder|prophet|warcryer|overlord/i;
const HS_HEALER_RE = /healer|bishop|shilliensaint/;
const HS_TANK_RE = /^(sk|tank)$/;
function hsN(v) { return typeof v === 'bigint' ? Number(v) : Number(v); }
function hsInt(v) { if (v === null || v === undefined || v === '' || typeof v === 'boolean') return NaN; const n = hsN(v); return Number.isFinite(n) ? Math.round(n) : NaN; }
function hsObj(x) { return x && typeof x === 'object' && !Array.isArray(x) ? x : {}; }
function hsCopy(x) { return JSON.parse(JSON.stringify(x)); }
/** one scheme -> only its valid fields (partial: what the player set; nothing filled in) */
function hsClean(s) {
  const S = hsObj(s), out = {};
  const pct = (v, lo, hi) => { const n = hsInt(v); return Number.isFinite(n) && n >= lo && n <= hi ? n : undefined; };
  const sk = (v) => (v === 'auto' ? 'auto' : Number.isFinite(hsInt(v)) && hsInt(v) > 0 ? hsInt(v) : undefined);
  HS_SITS.forEach(k => {
    const x = hsObj(S[k]), o = {};
    if (x.skill !== undefined) { const v = sk(x.skill); if (v !== undefined) o.skill = v; }
    if (x.below !== undefined) { const v = pct(x.below, 5, 99); if (v !== undefined) o.below = v; }
    if (k === 'group' && x.count !== undefined) { const v = pct(x.count, 2, 9); if (v !== undefined) o.count = v; }
    if (k !== 'recharge' && x.noOre !== undefined) { const v = sk(x.noOre); if (v !== undefined) o.noOre = v; }   // NOOREPICK-2026-10-22: the second choice when out of Spirit Ore
    if (k === 'recharge') { if (typeof x.on === 'boolean') o.on = x.on; if (HS_WHO.includes(x.who)) o.who = x.who; }
    if (Object.keys(o).length) out[k] = o;
  });
  if (HS_PRIORITIES.includes(S.priority)) out.priority = S.priority;
  { const p = hsObj(S.potion); if (p.below === 'auto') out.potion = { below: 'auto' }; else { const v = pct(p.below, 5, 95); if (v !== undefined) out.potion = { below: v }; } }
  if (Array.isArray(S.never)) { const l = [...new Set(S.never.map(hsInt).filter(n => Number.isFinite(n) && n > 0))]; if (l.length) out.never = l; }
  if (HS_XML.includes(S.xmlSelfHeal)) out.xmlSelfHeal = S.xmlSelfHeal;
  return out;
}
/** a scheme from the page -> { errors: [plain sentences], warnings: [] } (errors = not saved) */
function hsValidate(s) {
  const S = hsObj(s), C = hsClean(S), errors = [], warnings = [];
  const label = { single: 'Heal a teammate', emergency: 'Someone is dying', group: 'Party heal', self: 'Heal myself', recharge: 'MP for teammates' };
  HS_SITS.forEach(k => {
    const x = hsObj(S[k]), c = hsObj(C[k]);
    if (x.skill !== undefined && c.skill === undefined) errors.push(`${label[k]}: the skill must be "automatic" or one of the character's skills`);
    if (k !== 'recharge' && x.noOre !== undefined && c.noOre === undefined) errors.push(`${label[k]}: "if out of Spirit Ore" must be "automatic" or one of the character's skills`);   // NOOREPICK
    if (x.below !== undefined && c.below === undefined) errors.push(`${label[k]}: the % must be a number from 5 to 99`);
    if (k === 'group' && x.count !== undefined && c.count === undefined) errors.push(`${label[k]}: "how many" must be 2 to 9`);
    if (k === 'recharge' && x.who !== undefined && c.who === undefined) errors.push(`${label[k]}: choose "casters only" or "everyone"`);
    if (k === 'recharge' && x.on !== undefined && typeof x.on !== 'boolean') errors.push(`${label[k]}: on or off`);
  });
  if (S.priority !== undefined && C.priority === undefined) errors.push('Who first: choose one of the offered options');
  if (S.potion !== undefined && !C.potion) errors.push('Mana potion: a number from 5 to 95, or automatic');
  if (S.never !== undefined && !Array.isArray(S.never)) errors.push('Never use: a list of skills');
  if (S.xmlSelfHeal !== undefined && C.xmlSelfHeal === undefined) errors.push("L2Swarm's own Self Heal: choose one of the offered options");
  const E = hsMergeScheme(hsCopy(HS_DEFAULT), C);
  if (E.emergency.below > E.single.below) warnings.push(`"Someone is dying" (${E.emergency.below} %) starts above the normal heal (${E.single.below} %): the fast heal will be used for everything.`);
  if (E.recharge.on && E.recharge.below >= 90) warnings.push('MP for teammates at 90 % or more: the healer will spend most of its MP on Recharge.');
  if (C.never && C.never.includes(1216) && C.self && C.self.skill === 1216) errors.push('Heal myself uses Self Heal, but Self Heal is also on the "never use" list');
  return { errors, warnings, clean: C };
}
function hsMergeScheme(base, o) {
  const sc = base;
  HS_SITS.forEach(k => { if (o[k]) Object.assign(sc[k], o[k]); });
  if (o.priority !== undefined) sc.priority = o.priority;
  if (o.xmlSelfHeal !== undefined) sc.xmlSelfHeal = o.xmlSelfHeal;
  if (o.potion) sc.potion = Object.assign({}, o.potion);
  if (o.never) sc.never = o.never.slice();
  return sc;
}
/** the file -> { version, classes: { <classId>: scheme }, chars: { <name>: scheme } } (cleaned; other keys kept) */
function hsNorm(j) {
  const o = hsObj(j), out = Object.assign({}, o, { version: 1, classes: {}, chars: {} });
  Object.keys(hsObj(o.classes)).forEach(k => { if (/^\d+$/.test(k)) { const c = hsClean(o.classes[k]); if (Object.keys(c).length) out.classes[k] = c; } });
  Object.keys(hsObj(o.chars)).forEach(k => { if (k && !k.startsWith('_')) { const c = hsClean(o.chars[k]); if (Object.keys(c).length) out.chars[k] = c; } });
  return out;
}
/** the scheme that runs for a character: automatic < its class's scheme < its own. src.<field> = 'class' | 'char' (missing = automatic) */
function hsEffective(j, name, classId) {
  const J = hsNorm(j), c = J.classes[String(hsInt(classId))] || {}, m = J.chars[String(name || '')] || {};
  const sc = hsCopy(HS_DEFAULT), src = {};
  [[c, 'class'], [m, 'char']].forEach(([o, tag]) => {
    HS_SITS.forEach(k => { if (o[k]) Object.keys(o[k]).forEach(f => { src[k + '.' + f] = tag; src[k] = tag; }); });
    ['priority', 'xmlSelfHeal', 'potion', 'never'].forEach(k => { if (o[k] !== undefined) src[k] = tag; });
    hsMergeScheme(sc, o);
  });
  return { scheme: sc, src, own: Object.keys(m).length > 0, classOwn: Object.keys(c).length > 0 };
}
/** a skill's row: heal_skills.json > the built-in fallback; null = not a heal skill */
function hsRow(data, id) {
  const S = data && data.skills ? data.skills : null, r = S ? S[String(id)] : null;
  if (r && r.kind) return r;
  const f = HS_FALLBACK[id]; if (!f) return null;
  return { name: f[4], kind: f[0], levels: 1, power: [f[1]], hit: f[2], reuse: f[3] };
}
/** heal power at a learned skill level (enchanted levels 101+ use the base level) */
function hsPowerAt(row, level, base) {
  const P = row && Array.isArray(row.power) ? row.power : []; if (!P.length) return 0;
  let lv = hsInt(level); if (!(lv >= 1)) lv = P.length;
  if (lv > P.length) { const b = hsInt(base); lv = b >= 1 && b <= P.length ? b : P.length; }
  return Number(P[lv - 1]) || 0;
}
/** live skills [{ id, level, base, mp, ready, name, ... }] -> the heal / recharge ones with kind, power, cast and reuse time (other fields kept) */
function hsKnown(list, data) {
  const out = [];
  (list || []).forEach(x => {
    const id = hsInt(x && x.id), row = hsRow(data, id); if (!row) return;
    out.push(Object.assign({}, x, { id, name: x.name || row.name, kind: row.kind, power: hsPowerAt(row, x.level, x.base), hit: Number(row.hit) || 0, reuse: Number(row.reuse) || 0,
      mp: Number.isFinite(hsN(x.mp)) ? hsN(x.mp) : 0, ready: x.ready !== false }));
  });
  return out;
}
const hsBy = (a, b) => (b.power - a.power) || (a.mp - b.mp) || (a.hit - b.hit) || (a.id - b.id);
/** the skill for a situation -> { id, name, why } | null.  o: { forMe (the target is me), critical (3+ below 30 %), spread (one above 85 %, one
 *  below 40 %), count (teammates that want MP) }. never-listed skills are never used; a picked skill that is cooling down = the automatic one. */
function hsPick(known, sit, sc, o) {
  o = o || {}; sc = sc || HS_DEFAULT;
  const never = new Set((sc.never || []).map(Number));
  const K = (known || []).filter(k => !never.has(k.id));
  const meOk = sit === 'self' || !!o.forMe;
  const hasSingle = K.some(k => k.kind === 'single');
  const usable = (k) => k.kind !== 'self' || meOk;                       // Self Heal only lands on the caster
  const conf = hsObj(sc[sit]), want = conf.skill;
  // NOOREPICK-2026-10-22 (owner: "I want to be able to select the secondary skill to use IF we are out of spirit ores"): a heal of this situation is
  // learned but cannot be cast for want of its item (noItem, set by the host: Major Heal 1 / Major Group Heal 4 Spirit Ore) -> the player's second
  // choice (conf.noOre) when it is ready; for a picked skill only when THAT skill is the one without ore. 'auto' / missing = the next best (below).
  if (typeof conf.noOre === 'number') {
    const ch = HS_CHOOSE[sit] || [];
    const oreOut = K.some(k => k.noItem && ch.includes(k.kind) && (typeof want !== 'number' || k.id === want));
    if (oreOut) { const f = K.find(k => k.id === conf.noOre && ch.includes(k.kind) && usable(k)); if (f && f.ready) return { id: f.id, name: f.name, why: 'out of Spirit Ore — your second choice' }; }
  }
  let note = '';
  if (typeof want === 'number') {
    const c = K.find(k => k.id === want && (HS_CHOOSE[sit] || []).includes(k.kind) && usable(k));
    if (c && c.ready) return { id: c.id, name: c.name, why: 'your choice' };
    note = c ? 'your choice is cooling down — ' : never.has(want) ? '' : 'your choice is not learned — ';
  }
  let kinds = (HS_KINDS[sit] || []).slice();
  if (sit === 'self' && hasSingle) kinds = kinds.filter(x => x !== 'self');          // Self Heal ONLY when nothing else is learned
  if ((sit === 'single' || sit === 'emergency') && meOk && !hasSingle) kinds.push('self');
  const cand = K.filter(k => kinds.includes(k.kind) && usable(k)), ready = cand.filter(k => k.ready);
  const pick = (k, why) => (k ? { id: k.id, name: k.name, why: note + why } : null);
  if (!ready.length) return null;
  if (sit === 'single' || sit === 'self') return pick(ready.filter(k => k.kind === 'single' || k.kind === 'self').sort(hsBy)[0], 'automatic: the strongest heal ready');
  if (sit === 'emergency') {
    const P = Math.max(0, ...cand.filter(k => k.kind === 'single').map(k => k.power));
    const fast = ready.filter(k => k.kind === 'single' && k.power >= P * 0.5).sort((a, b) => (b.power / Math.max(500, b.hit)) - (a.power / Math.max(500, a.hit)) || hsBy(a, b));
    if (fast.length) return pick(fast[0], 'automatic: the fastest strong heal');
    const any = ready.filter(k => k.kind === 'single' || k.kind === 'self').sort(hsBy)[0];
    return pick(any || ready.filter(k => k.kind === 'singlePct')[0], 'automatic: the best heal ready');
  }
  if (sit === 'group') {
    if (o.critical) { const b = ready.find(k => k.kind === 'groupPct'); if (b) return pick(b, 'automatic: party nearly dead — full party heal'); }
    const g = ready.filter(k => k.kind === 'group').sort(hsBy)[0];
    if (g) return pick(g, 'automatic: the strongest party heal ready');
    if (o.spread) { const b = ready.find(k => k.kind === 'balance'); if (b) return pick(b, 'automatic: evens out the party HP'); }
    return null;
  }
  if (sit === 'recharge') {
    if (Number(o.count) >= 3) { const m = ready.find(k => k.kind === 'massRecharge'); if (m) return pick(m, 'automatic: 3+ teammates low on MP — Mass Recharge'); }
    return pick(ready.filter(k => k.kind === 'recharge').sort(hsBy)[0], 'automatic: Recharge');
  }
  return null;
}
/** what "automatic" would use (everything ready) — for the dashboard and the bot report */
function hsAutoTable(known) {
  const all = (known || []).map(k => Object.assign({}, k, { ready: true })), out = {};
  HS_SITS.forEach(s => { const p = hsPick(all, s, HS_DEFAULT, { forMe: s === 'self' }); out[s] = p ? { id: p.id, name: p.name } : null; });
  return out;
}
/** heal order: targets [{ name, hp, role }] -> sorted copy. priority tank / healers = that group first, then the lowest HP. */
function hsOrder(list, priority, o) {
  o = o || {};
  const grp = (t) => priority === 'tank' ? ((t.name === o.tank || HS_TANK_RE.test(t.role || '')) ? 0 : 1) : priority === 'healers' ? (HS_HEALER_RE.test(t.role || '') || (t.me && o.meHealer) ? 0 : 1) : 0;
  return (list || []).slice().sort((a, b) => grp(a) - grp(b) || (a.hp - b.hp));
}
/** who gets MP: { t, count } | null — never me; casters only unless "everyone"; the lowest MP first */
function hsRechargeTarget(team, sc) {
  const R = hsObj(sc && sc.recharge); if (R.on === false) return null;
  const below = Number.isFinite(hsInt(R.below)) ? hsInt(R.below) : HS_DEFAULT.recharge.below;
  // SPOIL-2026-10-19 (owner: "the Elven Elder should just recharge and heal the Bounty Hunter"): a spoiler lives on MP (Spoil 38, Spoil Festival
  // 113) and counts as a caster here, recharged below max(scheme %, 60)
  const spoilerLow = (t) => t.role === 'spoiler' && Number(t.mp) < Math.max(below, 60);
  const want = (team || []).filter(t => !t.me && !t.dead && (Number(t.mp) < below || spoilerLow(t)) && (R.who === 'everyone' || HS_CASTER_RE.test(t.role || '') || t.role === 'spoiler')).sort((a, b) => a.mp - b.mp);
  return want.length ? { t: want[0], count: want.length } : null;
}
/** the healer's own Mana Potion line: raids / dungeons 90 % (raid rule, unchanged); otherwise the scheme's % (automatic = 70 %) */
function hsPotionBelow(sc, fight) {
  if (fight) return 90;
  const b = hsObj(sc && sc.potion).below;
  return Number.isFinite(hsInt(b)) ? hsInt(b) : 70;
}
// HEALSCHEME-PURE-END

  return { HS_DEFAULT, HS_SITS, HS_PRIORITIES, HS_WHO, HS_XML, HS_KINDS, HS_CHOOSE, HS_FALLBACK, HS_CASTER_RE, hsClean, hsValidate, hsMergeScheme, hsNorm,
    hsEffective, hsRow, hsPowerAt, hsKnown, hsPick, hsAutoTable, hsOrder, hsRechargeTarget, hsPotionBelow };
});
