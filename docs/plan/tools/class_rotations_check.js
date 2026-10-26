// CLASS ROTATIONS check (2026-10-26): node docs/plan/tools/class_rotations_check.js [group]
// validates Scripts/data/class_rotations/<group>.json against docs/plan/class_skills/ROTATION_SCHEMA.md + class_skills.json; exit 1 on errors
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..'), DIR = path.join(ROOT, 'Scripts', 'data', 'class_rotations');
const CS = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs', 'plan', 'class_skills', 'class_skills.json'), 'utf8'));
const ASPECTS = ['single', 'opener', 'aoe', 'aoe-self', 'burst', 'debuff', 'cc', 'toggle', 'selfbuff', 'partybuff', 'heal', 'groupheal', 'recharge', 'cure', 'res', 'summon', 'pet', 'spoil', 'sweep', 'mp', 'emergency', 'never', 'obsolete'];
const WEAPONS = ['SWORD', 'BLUNT', '2H_SWORD', '2H_BLUNT', 'DAGGER', 'DUALDAGGER', 'DUAL', 'POLE', 'BOW', 'CROSSBOW', 'FIST', 'RAPIER', 'ANCIENT', 'SHIELD', 'NOT_BOW'];
const WHEN = ['onCooldown', 'mobsMin', 'mobsMax', 'hpBelow', 'hpAbove', 'mpBelow', 'mpAbove', 'cpAbove', 'targetHpAbove', 'targetHpBelow', 'distMin', 'distMax', 'targetHas', 'targetLacks', 'behind', 'bigTarget', 'raidOnly', 'notRaid',
  'soloOnly', 'partyOnly', 'fightOnly', 'outOfCombat', 'always', 'alliesBelow', 'allyBelow', 'tankBelow', 'mobsOnMe', 'onTank', 'boardMissing', 'item', 'corpse', 'noSpoiler', 'summonOut', 'noFrenzyWindow', 'afterSkill', 'charges', 'souls', 'mobType', 'text'];
const BANDS = ['1-19', '20-39', '40-75', '76-85'];
// every class id -> the skills it and its parents learn; the band of each class id
const own = {}, band = {}, lineOf = {};
CS.lines.forEach(l => { const acc = {}; l.tiers.forEach(t => { t.skills.forEach(s => { acc[s.id] = s; }); own[t.classId] = Object.assign(own[t.classId] || {}, acc); band[t.classId] = ['1-19', '20-39', '40-75', '76-85'][t.tier]; (lineOf[t.classId] = lineOf[t.classId] || new Set()).add(l.name); }); });
const groups = process.argv[2] ? [process.argv[2]] : (fs.existsSync(DIR) ? fs.readdirSync(DIR).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5)) : []);
let errors = 0, warns = 0, rows = 0, classes = 0;
const err = (g, m) => { errors++; console.log(`ERR  ${g}: ${m}`); }, warn = (g, m) => { warns++; if (process.env.VERBOSE) console.log(`warn ${g}: ${m}`); };
groups.forEach(g => {
  let d; try { d = JSON.parse(fs.readFileSync(path.join(DIR, g + '.json'), 'utf8').replace(/^﻿/, '')); } catch (e) { err(g, 'not valid JSON: ' + e.message); return; }
  if (!d.classes || typeof d.classes !== 'object') { err(g, 'no classes'); return; }
  (d.rules || []).forEach((r, i) => { if (!r || !r.text) err(g, `rules[${i}] has no text`); });
  Object.keys(d.classes).forEach(cid => {
    const c = d.classes[cid], at = `${g} class ${cid} ${c && c.name}`; classes++;
    if (!own[cid]) { err(g, `${at}: unknown class id`); return; }
    if (!BANDS.includes(c.band)) err(g, `${at}: band "${c.band}"`); else if (c.band !== band[cid]) err(g, `${at}: band ${c.band}, class_skills says ${band[cid]}`);
    if (!Array.isArray(c.rows) || !c.rows.length) { err(g, `${at}: no rows`); return; }
    c.rows.forEach((r, i) => {
      rows++; const ra = `${at} row ${i} (${r.name})`;
      if (!ASPECTS.includes(r.aspect)) err(g, `${ra}: aspect "${r.aspect}"`);
      if (r.skill != null && !Number.isFinite(Number(r.skill))) err(g, `${ra}: skill id`);
      if (r.skill != null && !own[cid][r.skill]) warn(g, `${ra}: skill ${r.skill} not learned by class ${cid} or its parents (datapack)`);
      if (!Array.isArray(r.weapon)) err(g, `${ra}: weapon must be an array`); else r.weapon.forEach(w => { if (!WEAPONS.includes(w)) err(g, `${ra}: weapon "${w}"`); });
      if (typeof r.auto !== 'boolean') err(g, `${ra}: auto must be true/false`);
      if ((r.aspect === 'never' || r.aspect === 'obsolete') && r.auto) err(g, `${ra}: ${r.aspect} must be auto:false`);
      if (r.aspect === 'obsolete' && !(r.replacedBy || []).length) warn(g, `${ra}: obsolete without replacedBy`);
      if (!r.trigger) err(g, `${ra}: no trigger text`);
      Object.keys(r.when || {}).forEach(k => { if (!WHEN.includes(k)) err(g, `${ra}: when.${k} unknown`); });
    });
  });
});
// coverage: every class id of the datapack lines in some file
if (!process.argv[2]) { const have = new Set(); groups.forEach(g => { try { Object.keys(JSON.parse(fs.readFileSync(path.join(DIR, g + '.json'), 'utf8').replace(/^﻿/, '')).classes || {}).forEach(k => have.add(k)); } catch (e) { } });
  Object.keys(own).forEach(cid => { if (!have.has(cid)) err('coverage', `class ${cid} (${[...lineOf[cid]].join('/')}) has no rows in any file`); }); }
console.log(`class rotations: ${groups.length} files, ${classes} classes, ${rows} rows, ${errors} errors, ${warns} warnings`);
process.exit(errors ? 1 : 0);
