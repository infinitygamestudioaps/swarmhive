// CLASS PLANS migration (user 2026-10-10: "My teams - I know what the plan is and we have talked about this. But you may never upgrade if it
// has not been agreed with the user"). Writes Scripts/data/class_plans.migrated.json for the user's review (NEVER the live class_plans.json):
// the class paths swarm.js used until 2026-10-10 for the characters of swarm.config.json, as APPROVED plans "migrated: agreed before 2026-10-10".
//
// The old effective plan of a character (swarm.js before 2026-10-10, the SWARM_CFG loop): swarm.config.json accounts[].classPlan, else the
// hardcoded CONFIG.classPlan entry, else ROLE_CLASS_PLAN[role]. Approved here:
//   - accounts[].classPlan (an explicit choice in the config)                              -> approved, source "swarm.config.json classPlan"
//   - a role with a default path (sk, bishop, destroyer, ... = the agreed team roles)       -> approved, source "role default <role>"
//     (the hardcoded entry, where there is one, is the same path)
//   - a role WITHOUT a default (nuker): only the hardcoded table had a path                  -> NOT approved = MISSING, kept as a suggestion
//   - a plan that does not contain the character's current class (its last swarm_state)     -> not migrated, reported
// Old table source: --from <file>, else Scripts/swarm.js (the deployed script still carries the table), else the newest
// Settings/backup/swarm_dev_before_classplans_*.js.
//   node docs/plan/tools/class_plans_migrate.js [--from <swarm.js>] [--out <file>]
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const CL = require(path.join(ROOT, 'Dashboard', 'classlogic.js'));
const rd = (p) => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^﻿/, ''));
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };

/** the object literal after `anchor` in a JS source, evaluated (our own file: plain strings / arrays) */
function literalAfter(src, anchorRx) {
  const m = anchorRx.exec(src); if (!m) return null;
  let i = m.index + m[0].length; while (src[i] !== '{') i++;
  let depth = 0, q = null, j = i;
  for (; j < src.length; j++) {
    const c = src[j];
    if (q) { if (c === '\\') { j++; continue; } if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '/' && src[j + 1] === '/') { j = src.indexOf('\n', j); continue; }
    if (c === '{') depth++; else if (c === '}') { depth--; if (!depth) break; }
  }
  return new Function('return (' + src.slice(i, j + 1) + ');')();
}
function oldTables(file) {
  const src = fs.readFileSync(file, 'utf8');
  const hard = literalAfter(src, /\n  classPlan: (?=\{)/) || {};
  const role = literalAfter(src, /const ROLE_CLASS_PLAN = (?=\{)/) || {};
  return { hard, role, file };
}
function sourceFile() {
  const a = arg('--from'); if (a) return a;
  const live = path.join(ROOT, 'Scripts', 'swarm.js');
  try { if (/const ROLE_CLASS_PLAN = \{/.test(fs.readFileSync(live, 'utf8'))) return live; } catch (e) { }
  const B = path.join(ROOT, 'Settings', 'backup');
  const f = fs.readdirSync(B).filter(x => /^swarm_dev_before_classplans_.*\.js$/.test(x)).sort().pop();
  if (!f) throw new Error('no old swarm.js with the class table found (use --from)');
  return path.join(B, f);
}

function migrate(opt = {}) {
  const tree = opt.tree || rd(path.join(ROOT, 'Scripts', 'data', 'class_tree.json'));
  const cfg = opt.cfg || rd(path.join(ROOT, 'swarm.config.json'));
  const T = opt.tables || oldTables(sourceFile());
  const states = opt.states || (() => { const o = {}; const L = path.join(ROOT, 'Logs');
    fs.readdirSync(L).filter(f => /^swarm_state_.+\.json$/.test(f)).forEach(f => { try { const s = rd(path.join(L, f)); if (s && s.name && f === `swarm_state_${s.name}.json`) o[s.name] = s; } catch (e) { } }); return o; })();
  const at = opt.at || new Date().toISOString();
  const main = cfg.mainLeader || '';
  const out = { _about: 'CLASS PLANS migrated by docs/plan/tools/class_plans_migrate.js for the user\'s REVIEW — the bots never read this file. Copy it to Scripts/data/class_plans.json (or approve plans on the dashboard Classes page) once the user agreed. Format: see Scripts/data/class_plans.example.json.',
    version: 1, migratedAt: at, source: { table: path.relative(ROOT, T.file || '(given)'), config: 'swarm.config.json', states: 'Logs/swarm_state_*.json' },
    parties: {}, templates: {}, _migration: { rows: [], suggestions: {} } };
  const rows = out._migration.rows;
  (cfg.accounts || []).forEach(a => {
    if (!a || !a.character || a.enabled === false) return;
    const name = String(a.character), party = String(a.party || name), role = String(a.role || '');
    const st = states[name] || null, classId = st && st.classId !== undefined ? Number(st.classId) : null;
    const root = classId !== null && CL.cpClass(tree, classId) ? CL.cpClass(tree, classId).root : null;
    let names = null, src = '', approve = false;
    if (Array.isArray(a.classPlan) && a.classPlan.length) { names = a.classPlan; src = 'swarm.config.json classPlan'; approve = true; }
    else if (T.role[role]) { names = T.hard[name] || T.role[role]; src = T.hard[name] ? `role default ${role} (= the old CONFIG.classPlan entry)` : `role default ${role}`; approve = true; }
    else if (T.hard[name]) { names = T.hard[name]; src = `old CONFIG.classPlan only (role ${role || '-'} has no default)`; approve = false; }
    const row = { party, name, role, classId, cls: st ? st.cls : null, level: st ? st.level : null, names, source: src || 'none', status: 'missing', plan: null, why: '' };
    rows.push(row);
    if (!names) { row.why = 'no plan anywhere'; return; }
    const r = CL.cpPlanFromNames(tree, names.map(String), root);
    if (!r.plan) { row.status = 'not migrated'; row.why = 'names do not resolve: ' + r.why; return; }
    row.plan = r.plan;
    if (classId !== null && !CL.cpFits(tree, r.plan, classId)) { row.status = 'not migrated'; row.why = `current class ${CL.cpName(tree, classId)} is not on ${r.plan.map(id => CL.cpName(tree, id)).join(' > ')}`; return; }
    if (!approve) { row.status = 'missing'; row.why = 'suggestion only (not agreed): ' + src; out._migration.suggestions[name] = { party, plan: r.plan, source: src }; return; }
    row.status = 'approved';
    const P = out.parties[party] = out.parties[party] || { members: {} };
    P.members[name] = { plan: r.plan, approved: true, approvedBy: 'migration', approvedAt: at, note: `migrated: agreed before 2026-10-10 (${src})` };
  });
  // parties in config order, main leader first
  const order = Object.keys(out.parties).sort((x, y) => (x === main ? -1 : y === main ? 1 : 0));
  const sorted = {}; order.forEach(k => { sorted[k] = out.parties[k]; }); out.parties = sorted;
  // the shipped example templates come along (marked example) so the Classes page has them from the start
  try { const ex = rd(path.join(ROOT, 'Scripts', 'data', 'class_plans.example.json')); Object.assign(out.templates, ex.templates || {}); } catch (e) { }
  return out;
}

if (require.main === module) {
  const out = migrate();
  const tree = rd(path.join(ROOT, 'Scripts', 'data', 'class_tree.json'));
  const F = arg('--out') || path.join(ROOT, 'Scripts', 'data', 'class_plans.migrated.json');
  if (/[\\/]class_plans\.json$/i.test(F)) { console.log('refused: this tool never writes the live class_plans.json'); process.exit(1); }
  const txt = JSON.stringify(out, null, 1) + '\n';
  fs.writeFileSync(F + '.tmp', txt, 'utf8'); JSON.parse(txt); fs.renameSync(F + '.tmp', F);
  const nm = (p) => p ? p.map(id => CL.cpName(tree, id)).join(' > ') : '-';
  out._migration.rows.forEach(r => console.log([r.party.padEnd(12), r.name.padEnd(12), (r.role || '-').padEnd(13), String(r.cls || '?').padEnd(18), String(r.level || '?').padEnd(3), r.status.padEnd(13), nm(r.plan || (out._migration.suggestions[r.name] || {}).plan), r.why].join(' | ')));
  const c = (s) => out._migration.rows.filter(r => r.status === s).length;
  console.log(`\n${out._migration.rows.length} characters: ${c('approved')} approved, ${c('missing')} missing, ${c('not migrated')} not migrated -> ${path.relative(ROOT, F)}`);
}
module.exports = { migrate, oldTables, literalAfter };
