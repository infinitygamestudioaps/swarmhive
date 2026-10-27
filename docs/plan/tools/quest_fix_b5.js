// QUEST PHASE 2, BATCH 5 FIXER HELPER (2026-10-27): writes plan overrides (Scripts/data/quest_plans/<id>.json -> override) and manual quest
// records (Scripts/data/quests/<id>.json, manual: true + edited) for batch 5 only, under the manual_guard lock (atomic, history kept).
// Use from node:  const F = require('./quest_fix_b5'); F.step(id, key, {...}); F.quest(id, {...}); F.record(id, (q) => { ...mutate... }, why)
'use strict';
const fs = require('fs'), path = require('path');
const mg = require('./manual_guard');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const PDIR = path.join(ROOT, 'Scripts', 'data', 'quest_plans'), QDIR = path.join(ROOT, 'Scripts', 'data', 'quests');
const BY = 'quest-fixer batch 5';
function planEdit(id, fn) {
  const f = path.join(PDIR, id + '.json');
  mg.withLock(f, () => {
    const t = mg.readText(f), p = JSON.parse(t.text);
    p.override = p.override || { steps: {} }; p.override.steps = p.override.steps || {};
    fn(p.override, p);
    p.override.editedAt = new Date().toISOString(); p.override.by = BY;
    mg.atomicWrite(f, mg.stringifyLike(p, t.fmt));
  }, { who: 'quest_fix_b5.js' });
}
/** override.steps[key] = merge(o) (fixed[] merged) */
function step(id, key, o) {
  planEdit(id, (ov, p) => {
    if (!(p.steps || []).some(s => s.key === key)) console.log(`WARN ${id}: step key ${key} not in the plan now (kept for the next build)`);
    const cur = ov.steps[key] || {};
    const fixed = [...new Set([].concat(cur.fixed || [], o.fixed || []))];
    ov.steps[key] = Object.assign(cur, o, { fixed, editedAt: new Date().toISOString(), by: BY });
    if (!fixed.length) delete ov.steps[key].fixed;
  });
}
/** quest-level override fields (fixed[] merged, note appended) */
function quest(id, o) {
  planEdit(id, (ov) => {
    if (o.fixed) ov.fixed = [...new Set([].concat(ov.fixed || [], o.fixed))];
    if (o.note) ov.note = ov.note && !ov.note.includes(o.note) ? ov.note + ' | ' + o.note : o.note;
    Object.keys(o).filter(k => k !== 'fixed' && k !== 'note').forEach(k => { ov[k] = o[k]; });
  });
}
/** manual quest record: fn(q) mutates it; manual: true + edited { at, by, why } */
function record(id, fn, why) {
  const f = path.join(QDIR, id + '.json');
  mg.withLock(f, () => {
    const t = mg.readText(f), q = JSON.parse(t.text);
    if (!q.edited || !q.edited.orig) q.origParse = q.origParse || JSON.parse(JSON.stringify(q.parse || {}));
    fn(q);
    q.manual = true; q.edited = { at: new Date().toISOString(), by: BY, why };
    mg.atomicWrite(f, mg.stringifyLike(q, t.fmt));
  }, { who: 'quest_fix_b5.js' });
}
/** drop parse reasons matching re from q.parse.reasons */
function dropParse(q, re) { q.parse = q.parse || {}; q.parse.reasons = (q.parse.reasons || []).filter(r => !re.test(r)); if (!q.parse.reasons.length) q.parse.status = 'full'; }
module.exports = { step, quest, record, dropParse, planEdit };
