// CLASS PLAN LOGIC (2026-10-10, user: "Every single class should have a plan, and it should be configurable from the user per party! It should
// never upgrade without asking"). The ONE place where the dashboard decides a character's class plan status, validates a plan against the
// class tree and matches group templates. The CLASSPLAN-PURE block below is a TEXT COPY of the block in Scripts_dev/swarm.js (the gate the
// bots use), written by docs/plan/tools/class_logic_sync.js; docs/plan/tools/test_class_plans.js fails when they differ.
// Used by Dashboard/classpage_api.js (server: /api/classplans, /api/classtree), Dashboard/classpage.js (browser: window.ClassLogic) and the tests.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ClassLogic = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

// CLASSPLAN-PURE-BEGIN (no host calls in here: Dashboard/classlogic.js carries the SAME block text for text; docs/plan/tools/test_class_plans.js
// checks that and runs it in node). CLASS PLANS (user 2026-10-10: "It should never upgrade without asking ... you may never upgrade if it has
// not been agreed with the user"). Data: Scripts/data/class_tree.json (every class, docs/plan/tools/class_tree.js) + Scripts/data/class_plans.json
// (dashboard Classes page): parties[<leader>].members[<name>] = { plan: [1st, 2nd, 3rd class ids], approved, approvedBy, approvedAt, note }.
// A class change happens ONLY when cpDecide() says 'ready': an APPROVED plan, valid in the tree, my current class on it, the next step a
// child of my current class and my level high enough. Anything else (no plan, not approved, broken, off the plan, two parties disagree) = no change.
const CP_STATUS = { missing: 'missing', approval: 'needs-approval', invalid: 'invalid', off: 'off-plan', ambiguous: 'ambiguous', waiting: 'waiting', ready: 'ready', done: 'done', unknown: 'unknown' };
const cpNorm = (s) => String(s == null ? '' : s).toLowerCase().replace(/[^a-z]/g, '');
function cpClass(tree, id) { const c = tree && tree.classes ? tree.classes[String(id)] : null; return c || null; }
function cpName(tree, id) { const c = cpClass(tree, id); return c ? c.name : (id === null || id === undefined || id === '' ? '?' : 'class ' + id); }
/** the full chain of a plan: [base class, ...plan] (base = the root of plan[0]) or null */
function cpChain(tree, plan) {
  if (!Array.isArray(plan) || !plan.length) return null;
  const first = cpClass(tree, plan[0]); if (!first) return null;
  return [first.root].concat(plan.map(Number));
}
/** plan check against the tree: { ok, why } — ids exist, plan[0] is a 1st profession, every step a child of the one before, at most 3 steps */
function cpValidate(tree, plan) {
  if (!Array.isArray(plan) || !plan.length) return { ok: false, why: 'empty plan' };
  if (plan.length > 3) return { ok: false, why: 'a plan has at most 3 steps (1st, 2nd, 3rd profession)' };
  for (let i = 0; i < plan.length; i++) {
    const c = cpClass(tree, plan[i]);
    if (!c) return { ok: false, why: `unknown class id ${plan[i]}` };
    // user 2026-10-10: Inspector / Judicator (subclassOnly in class_tree.json) are never a MAIN-class plan step (High Five: subclass only)
    if (c.subclassOnly) return { ok: false, why: `${c.name} is a subclass-only class in High Five - it cannot be a main-class plan step` };
    if (c.tier !== i + 1) return { ok: false, why: `step ${i + 1} must be a ${['', '1st', '2nd', '3rd'][i + 1]} profession, ${c.name} is ${c.tier ? ['', '1st', '2nd', '3rd'][c.tier] + ' profession' : 'a base class'}` };
    if (i > 0 && Number(c.parent) !== Number(plan[i - 1])) return { ok: false, why: `${c.name} does not follow ${cpName(tree, plan[i - 1])} (it follows ${cpName(tree, c.parent)})` };
  }
  return { ok: true, why: '' };
}
/** does the plan fit a character of this current class? (its class must be the base class or a step of the plan) */
function cpFits(tree, plan, classId) {
  const ch = cpChain(tree, plan); if (!ch) return false;
  return ch.indexOf(Number(classId)) >= 0;
}
/** my plan entry: own party first; else exactly one other party has me (a character that moved). { entry, party, moved, ambiguous } */
function cpEntry(plans, party, name) {
  const P = plans && plans.parties && typeof plans.parties === 'object' ? plans.parties : {};
  const own = P[party] && P[party].members ? P[party].members[name] : null;
  if (own) return { entry: own, party, moved: false, ambiguous: false };
  const others = Object.keys(P).filter(k => k !== party && P[k] && P[k].members && P[k].members[name]);
  if (!others.length) return { entry: null, party, moved: false, ambiguous: false };
  const sig = (k) => JSON.stringify([(P[k].members[name].plan || []).map(Number), !!P[k].members[name].approved]);
  if (others.length > 1 && others.some(k => sig(k) !== sig(others[0]))) return { entry: null, party: others.join(', '), moved: true, ambiguous: true };
  return { entry: P[others[0]].members[name], party: others[0], moved: true, ambiguous: false };
}
/** THE GATE. me = { name, party, classId, level } -> { status, text, next, nextName, needLevel, plan, chain, approved, why, party } */
function cpDecide(tree, plans, me) {
  const out = { status: CP_STATUS.unknown, text: '', next: null, nextName: '', needLevel: null, plan: null, chain: null, approved: false, why: '', party: me && me.party };
  if (!tree || !tree.classes) { out.why = 'no class tree (Scripts/data/class_tree.json)'; out.text = 'unknown'; return out; }
  const cur = cpClass(tree, me && me.classId);
  const e = cpEntry(plans, me && me.party, me && me.name);
  out.party = e.party;
  if (e.ambiguous) { out.status = CP_STATUS.ambiguous; out.why = `two parties (${e.party}) hold different class plans for ${me.name}`; out.text = 'ambiguous'; return out; }
  // the next profession level of my current class (for the "reached the level without a plan" note)
  if (cur && cur.children && cur.children.length) { const k = cpClass(tree, cur.children[0]); out.needLevel = k ? k.changeLevel : null; }
  if (!e.entry || !Array.isArray(e.entry.plan) || !e.entry.plan.length) { out.status = CP_STATUS.missing; out.why = 'no class plan'; out.text = 'missing'; return out; }
  out.plan = e.entry.plan.map(Number); out.approved = e.entry.approved === true;
  const v = cpValidate(tree, out.plan);
  if (!v.ok) { out.status = CP_STATUS.invalid; out.why = v.why; out.text = 'invalid'; return out; }
  out.chain = cpChain(tree, out.plan);
  if (!out.approved) { out.status = CP_STATUS.approval; out.why = 'the plan is not approved'; out.text = 'needs-approval'; return out; }
  if (!cur) { out.status = CP_STATUS.unknown; out.why = `current class unknown (${me && me.classId})`; out.text = 'unknown'; return out; }
  const idx = out.chain.indexOf(Number(cur.id));
  if (idx < 0) { out.status = CP_STATUS.off; out.why = `${cur.name} is not on the plan (${out.chain.map(id => cpName(tree, id)).join(' > ')})`; out.text = 'off-plan'; return out; }
  if (idx === out.chain.length - 1) { out.status = CP_STATUS.done; out.why = cur.children && cur.children.length ? `the plan ends at ${cur.name}` : `${cur.name} is a final class`; out.text = 'done'; out.needLevel = null; return out; }
  const nx = cpClass(tree, out.chain[idx + 1]);
  if (!nx || Number(nx.parent) !== Number(cur.id)) { out.status = CP_STATUS.invalid; out.why = `${cpName(tree, out.chain[idx + 1])} is not a profession of ${cur.name}`; out.text = 'invalid'; return out; }
  out.next = nx.id; out.nextName = nx.name; out.needLevel = nx.changeLevel;
  const lvl = Number(me.level) || 0;
  if (!nx.changeLevel || lvl < nx.changeLevel) { out.status = CP_STATUS.waiting; out.why = `${nx.name} at level ${nx.changeLevel} (now ${lvl})`; out.text = `waiting ${nx.name} @${nx.changeLevel}`; return out; }
  out.status = CP_STATUS.ready; out.why = `${cur.name} -> ${nx.name}`; out.text = `ready ${nx.name}`;
  return out;
}
/** Career -> Professions page buttons -> the ONE button of class `id` (exact label = one of its names; else the only label containing one
 *  of its names as whole words). { idx, label, why } idx -1 = none / two buttons fit (never guess). */
function cpPickButton(tree, id, labels) {
  const c = cpClass(tree, id); if (!c) return { idx: -1, label: '', why: `unknown class ${id}` };
  const names = (c.aliases && c.aliases.length ? c.aliases : [c.name]).map(cpNorm).filter(Boolean);
  const L = (labels || []).map(l => String(l || ''));
  const exact = []; L.forEach((l, i) => { if (names.indexOf(cpNorm(l)) >= 0) exact.push(i); });
  if (exact.length === 1) return { idx: exact[0], label: L[exact[0]], why: '' };
  if (exact.length > 1) return { idx: -1, label: '', why: `${exact.length} buttons are called ${c.name}: ${exact.map(i => L[i]).join(' | ')}` };
  const words = (s) => ' ' + String(s).toLowerCase().replace(/[^a-z' ]/g, ' ').replace(/\s+/g, ' ') + ' ';
  const al = (c.aliases && c.aliases.length ? c.aliases : [c.name]).map(a => words(a).replace(/'/g, '').trim()).filter(Boolean);
  const part = []; L.forEach((l, i) => { const w = words(l).replace(/'/g, ''); if (al.some(a => w.indexOf(' ' + a + ' ') >= 0)) part.push(i); });
  if (part.length === 1) return { idx: part[0], label: L[part[0]], why: '' };
  return { idx: -1, label: '', why: part.length ? `${part.length} buttons mention ${c.name}: ${part.map(i => L[i]).join(' | ')}` : `no ${c.name} button (the page shows: ${L.join(' | ').slice(0, 200)})` };
}
/** does a text name class `id`? (quest targets like "Warrior", the old plan names) */
function cpNameIs(tree, id, text) { const c = cpClass(tree, id); if (!c) return false; const t = cpNorm(text); return !!t && (c.aliases || [c.name]).some(a => cpNorm(a) === t); }
/** a class name (any alias) -> its id, preferring a class of `rootId`'s line; null when unknown or two classes fit */
function cpIdOf(tree, text, rootId) {
  const t = cpNorm(text); if (!t || !tree || !tree.classes) return null;
  let hits = Object.keys(tree.classes).map(k => tree.classes[k]).filter(c => (c.aliases || [c.name]).some(a => cpNorm(a) === t));
  if (rootId !== undefined && rootId !== null && hits.length > 1) { const own = hits.filter(c => Number(c.root) === Number(rootId)); if (own.length) hits = own; }
  return hits.length === 1 ? hits[0].id : null;
}
/** names -> plan ids along one line (old CONFIG.classPlan / swarm.config.json classPlan); { plan, why } plan null when it does not resolve */
function cpPlanFromNames(tree, names, rootId) {
  if (!Array.isArray(names) || !names.length) return { plan: null, why: 'no names' };
  const plan = []; let prev = null;
  for (let i = 0; i < names.length; i++) {
    const t = cpNorm(names[i]);
    let hits = Object.keys(tree.classes).map(k => tree.classes[k]).filter(c => c.tier === i + 1 && (c.aliases || [c.name]).some(a => cpNorm(a) === t));
    if (prev !== null) hits = hits.filter(c => Number(c.parent) === prev);
    else if (rootId !== undefined && rootId !== null) { const own = hits.filter(c => Number(c.root) === Number(rootId)); if (own.length) hits = own; }
    if (hits.length !== 1) return { plan: null, why: `"${names[i]}" ${hits.length ? 'fits ' + hits.length + ' classes' : 'is no ' + ['', '1st', '2nd', '3rd'][i + 1] + ' profession' + (prev !== null ? ' of ' + cpName(tree, prev) : '')}` };
    plan.push(hits[0].id); prev = hits[0].id;
  }
  const v = cpValidate(tree, plan);
  return v.ok ? { plan, why: '' } : { plan: null, why: v.why };
}
/** every valid full plan (1st..3rd) a character of class `classId` can still follow: its own taken steps first, then every branch */
function cpPathsFrom(tree, classId) {
  const cur = cpClass(tree, classId); if (!cur) return [];
  const up = []; let c = cur; for (let i = 0; i < 4 && c && c.tier > 0; i++) { up.unshift(c.id); c = cpClass(tree, c.parent); }
  const out = [];
  const down = (id, acc) => { const k = cpClass(tree, id); const kids = k && k.children ? k.children.filter(ch => { const x = cpClass(tree, ch); return !(x && x.subclassOnly); }) : [];   /* subclass-only: never offered */ if (!kids.length || acc.length >= 3) { if (acc.length) out.push(acc); return; } kids.forEach(ch => down(ch, acc.concat([Number(ch)]))); };
  down(cur.id, up);
  return out;
}
/** TEMPLATES: slots [{ label, role, from, plan }] matched to party members [{ name, classId, role }]. A member fits a slot when its current class
 *  is on the slot's chain (base .. last step); a role match and the exact class rank first. One member per slot, each slot once, slot order.
 *  -> { assign: [{ slot, i, name, plan }], unmatched: [slot index], left: [names] } */
function cpTemplateMatch(tree, template, members) {
  const slots = (template && Array.isArray(template.slots) ? template.slots : []);
  const used = {}, assign = [], unmatched = [];
  slots.forEach((s, i) => {
    const ch = cpChain(tree, s.plan || []);
    if (!ch || !cpValidate(tree, s.plan).ok) { unmatched.push(i); return; }
    const cands = (members || []).filter(m => !used[m.name] && ch.indexOf(Number(m.classId)) >= 0).map(m => ({ m,
      score: (s.role && m.role && String(s.role) === String(m.role) ? 4 : 0) + (s.from !== undefined && s.from !== null && Number(s.from) === Number(m.classId) ? 2 : 0) + ch.indexOf(Number(m.classId)) / 10 }))
      .sort((a, b) => b.score - a.score || String(a.m.name).localeCompare(String(b.m.name)));
    if (!cands.length) { unmatched.push(i); return; }
    used[cands[0].m.name] = true;
    assign.push({ slot: s.label || ('slot ' + (i + 1)), i, name: cands[0].m.name, plan: s.plan.map(Number) });
  });
  return { assign, unmatched, left: (members || []).filter(m => !used[m.name]).map(m => m.name) };
}
/** a party's plans as template slots (members without a valid plan are skipped) */
function cpTemplateFromParty(tree, partyPlans, members) {
  const M = partyPlans && partyPlans.members ? partyPlans.members : {};
  const slots = [];
  (members || []).forEach(m => {
    const e = M[m.name]; if (!e || !Array.isArray(e.plan) || !cpValidate(tree, e.plan).ok) return;
    const root = cpChain(tree, e.plan)[0];
    slots.push({ label: m.role ? m.role : cpName(tree, e.plan[e.plan.length - 1]), role: m.role || '', from: root, plan: e.plan.map(Number), seenOn: m.name });
  });
  return slots;
}
// CLASSPLAN-PURE-END

  return { CP_STATUS, cpNorm, cpClass, cpName, cpChain, cpValidate, cpFits, cpEntry, cpDecide, cpPickButton, cpNameIs, cpIdOf, cpPlanFromNames, cpPathsFrom,
    cpTemplateMatch, cpTemplateFromParty };
});
