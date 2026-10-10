// CLASS TREE (CLASS PLANS, user 2026-10-10: "Every single class should have a plan ... It needs to work for every single class in the game.
// But it's important that we don't hardcode it"). Builds Scripts/data/class_tree.json = every High Five class with its parent, children,
// race, fighter / mystic, gender (Kamael), tier (0 base, 1st, 2nd, 3rd profession), the level of the change, the role it suits, a short
// description and the names the game / the L2Toggle Career page use for it.
//
// Sources (no class data is typed into code):
//   Scripts/data/dp/classSkillTree.xml       L2J High Five datapack (github.com/Shagooh/l2j-server-datapack): classId + parentClassId
//   Dashboard/data/classes.json              client class names (exported from the user's L2Swarm Data\base.db)
//   docs/plan/tools/class_tree_manual.json   the hand-typed part, each with a source note: change levels, base-class race / type / gender,
//                                            roles, descriptions, aliases (labels seen on the Career page), subclass-only, role suggestions
// Used by: Scripts_dev/swarm.js (CLASSPLAN-PURE gate), Dashboard/classlogic.js + classpage_api.js (Classes page), the tests.
//   node docs/plan/tools/class_tree.js            (writes Scripts/data/class_tree.json)
//   node docs/plan/tools/class_tree.js --check    (builds in memory, prints problems, writes nothing)
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const D = path.join(ROOT, 'Scripts', 'data');
const OUT = path.join(D, 'class_tree.json');
const rd = (p) => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^﻿/, ''));

function build() {
  const xml = fs.readFileSync(path.join(D, 'dp', 'classSkillTree.xml'), 'utf8');
  const CLIENT = rd(path.join(ROOT, 'Dashboard', 'data', 'classes.json'));
  const M = rd(path.join(__dirname, 'class_tree_manual.json'));
  const parent = {}, ids = new Set();
  for (const m of xml.matchAll(/<skillTree type="classSkillTree" classId="(\d+)"(?: parentClassId="(\d+)")?/g)) {
    ids.add(+m[1]); parent[m[1]] = m[2] !== undefined ? +m[2] : null;
  }
  const problems = [];
  const list = [...ids].sort((a, b) => a - b);
  const rootOf = (id) => { let c = id, n = 0; while (parent[c] != null && n < 6) { c = parent[c]; n++; } return c; };
  const tierOf = (id) => { let c = id, n = 0; while (parent[c] != null && n < 6) { c = parent[c]; n++; } return n; };
  const classes = {};
  list.forEach(id => {
    const man = (M.classes || {})[id] || {};
    const root = rootOf(id), r = (M.roots || {})[root];
    if (!r) problems.push(`class ${id}: base class ${root} has no race in class_tree_manual.json roots`);
    if (!CLIENT[id]) problems.push(`class ${id}: no client name in Dashboard/data/classes.json`);
    if (!man.role) problems.push(`class ${id} (${CLIENT[id]}): no role in class_tree_manual.json`);
    const tier = tierOf(id);
    const clientName = CLIENT[id] || ('class ' + id);
    const name = man.name || clientName;
    const al = [];
    const add = (s) => { s = String(s || '').trim(); if (s && !al.some(x => x.toLowerCase() === s.toLowerCase())) al.push(s); };
    add(name); add(clientName); add(clientName.replace(/\s+(Male|Female)$/i, '')); (man.aliases || []).forEach(add);
    const lv = tier ? (M.levels || {})[tier] : null;
    if (tier && !lv) problems.push(`class ${id}: no change level for tier ${tier}`);
    classes[id] = {
      id, name, clientName, aliases: al,
      race: r ? r.race : '', raceLabel: r ? (M.races || {})[r.race] || r.race : '',
      type: r ? r.type : '', gender: r && r.gender ? r.gender : null,
      tier, parent: parent[id], children: [], root,
      changeLevel: lv || null,
      role: man.role || '', roleLabel: ((M.roles || {})[man.role] || {}).label || man.role || '',
      desc: man.desc || '', swarmRoles: man.swarmRoles || [],
      subclassOnly: !!man.subclassOnly,
    };
  });
  list.forEach(id => { const p = parent[id]; if (p != null) { if (!classes[p]) problems.push(`class ${id}: parent ${p} unknown`); else classes[p].children.push(id); } });
  // children of one parent must be told apart by their labels (the Career page shows one button per child)
  Object.values(classes).forEach(c => {
    const seen = {};
    c.children.forEach(k => classes[k].aliases.forEach(a => { const n = a.toLowerCase().replace(/[^a-z]/g, ''); if (seen[n] !== undefined && seen[n] !== k) problems.push(`children of ${c.id} share the label "${a}": ${seen[n]} and ${k}`); seen[n] = k; }));
  });
  // role suggestions: every path must be a valid chain from a base class
  const sugg = M.roleSuggestions || {};
  Object.entries(sugg).forEach(([role, paths]) => paths.forEach(p => {
    p.forEach((id, i) => { const c = classes[id]; const want = i === 0 ? null : p[i - 1];
      if (!c) problems.push(`roleSuggestions.${role}: unknown class ${id}`);
      else if (i === 0 ? c.tier !== 1 : c.parent !== want) problems.push(`roleSuggestions.${role}: ${id} does not follow ${want === null ? 'a base class' : want}`); });
  }));
  const roots = list.filter(id => parent[id] == null);
  const out = {
    _about: 'GENERATED by docs/plan/tools/class_tree.js — do not edit; edit docs/plan/tools/class_tree_manual.json and run the tool. Every High Five class: parent / children / race / tier / change level / role / names. Used by the class plan gate (Scripts_dev/swarm.js CLASSPLAN-PURE) and the dashboard Classes page.',
    meta: {
      generated: new Date().toISOString(), tool: 'docs/plan/tools/class_tree.js',
      sources: Object.assign({ tree: 'Scripts/data/dp/classSkillTree.xml (L2J High Five datapack, github.com/Shagooh/l2j-server-datapack): classId + parentClassId', clientNames: 'Dashboard/data/classes.json (L2Swarm Data\\base.db)' }, M.sources || {}),
      levels: M.levels, fee: M.fee || null, races: M.races, roles: M.roles,
      count: list.length,
    },
    roots,
    classes,
    roleSuggestions: sugg,
  };
  return { out, problems };
}

if (require.main === module) {
  const { out, problems } = build();
  problems.forEach(p => console.log('PROBLEM ' + p));
  const tiers = [0, 1, 2, 3].map(t => Object.values(out.classes).filter(c => c.tier === t).length);
  console.log(`${out.meta.count} classes (base ${tiers[0]}, 1st ${tiers[1]}, 2nd ${tiers[2]}, 3rd ${tiers[3]}), ${out.roots.length} base classes, ${problems.length} problems`);
  if (process.argv.includes('--check')) process.exit(problems.length ? 1 : 0);
  if (problems.length) { console.log('not written (fix the problems first)'); process.exit(1); }
  const txt = JSON.stringify(out, null, 1) + '\n';
  const tmp = OUT + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, txt, 'utf8'); JSON.parse(txt); fs.renameSync(tmp, OUT);
  console.log('wrote ' + path.relative(ROOT, OUT) + ' (' + Math.round(txt.length / 1024) + ' KB)');
}
module.exports = { build };
