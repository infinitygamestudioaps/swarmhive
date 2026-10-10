// Synthetic L2Skill lists from the L2J High Five datapack (tests only): Scripts/data/dp/skills/*.xml (skill data with the SAME field names the
// client data on L2Skill uses: targetType, affectScope, abnormalType, abnormalTime, isDebuff, castRange, magicLvl ...) and
// Scripts/data/dp/classSkillTree.xml (which class learns which skill; parents via Scripts/data/class_tree.json).
//   const D = require('./dp_skills'); D.classSkills(21)   -> [{ Id, Level, Name, IsActive, IsToggle, IsDebuff, TargetType, AffectScope, ... }]
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..'), DP = path.join(ROOT, 'Scripts', 'data', 'dp');
let SK = null, TREE = null, CT = null;
function tableVal(block, v) {
  if (!/^#/.test(String(v))) return v;
  const m = new RegExp('<table name="' + v.replace(/[#]/g, '\\#') + '">([^<]*)</table>').exec(block);
  if (!m) return null;
  const a = m[1].trim().split(/\s+/); return a[a.length - 1];
}
function loadSkills() {
  if (SK) return SK;
  SK = {};
  fs.readdirSync(path.join(DP, 'skills')).filter(f => f.endsWith('.xml')).forEach(f => {
    const x = fs.readFileSync(path.join(DP, 'skills', f), 'utf8');
    const re = /<skill id="(\d+)" levels="(\d+)" name="([^"]*)"[^>]*>([\s\S]*?)<\/skill>/g; let m;
    while ((m = re.exec(x))) {
      const block = m[4], sets = {};
      const sr = /<set name="([A-Za-z0-9_]+)" val="([^"]*)"\s*\/>/g; let s;
      while ((s = sr.exec(block))) if (!(s[1] in sets)) sets[s[1]] = tableVal(block, s[2]);
      SK[m[1]] = { id: Number(m[1]), levels: Number(m[2]), name: m[3], sets };
    }
  });
  return SK;
}
/** one skill as an L2Skill-like plain object (the highest level) */
function skill(id) {
  const k = loadSkills()[String(id)]; if (!k) return null;
  const s = k.sets, op = String(s.operateType || ''), n = (v) => (v === null || v === undefined || v === '' ? 0 : Number(v) || 0);
  return { Id: k.id, Level: k.levels, Name: k.name, IsActive: /^(A|T|CA|DA)/.test(op), IsToggle: op === 'T', IsDebuff: String(s.isDebuff) === 'true',
    TargetType: s.targetType || '', AffectScope: s.affectScope || '', AbnormalType: s.abnormalType || '', AbnormalLevel: s.abnormalLvl !== undefined ? n(s.abnormalLvl) : null,
    AbnormalTime: n(s.abnormalTime), CastRange: n(s.castRange), MP: n(s.mpConsume2) + n(s.mpConsume1), HitTime: n(s.hitTime), MagicLvl: n(s.magicLvl),
    ItemConsumeId: n(s.itemConsumeId), ItemConsumeCount: n(s.itemConsumeCount), IsReady: true };
}
function classTree() { if (!CT) CT = JSON.parse(fs.readFileSync(path.join(ROOT, 'Scripts', 'data', 'class_tree.json'), 'utf8').replace(/^﻿/, '')); return CT; }
function treeIds() {
  if (TREE) return TREE;
  TREE = {};
  const x = fs.readFileSync(path.join(DP, 'classSkillTree.xml'), 'utf8');
  const re = /<skillTree type="classSkillTree" classId="(\d+)"[^>]*>([\s\S]*?)<\/skillTree>/g; let m;
  while ((m = re.exec(x))) { const ids = new Set(); const sr = /skillId="(\d+)"/g; let s; while ((s = sr.exec(m[2]))) ids.add(Number(s[1])); TREE[m[1]] = ids; }
  return TREE;
}
/** every skill a class (with its parents) learns, as L2Skill-like objects */
function classSkills(classId) {
  const T = classTree(), ids = new Set(); let c = T.classes[String(classId)];
  while (c) { (treeIds()[String(c.id)] || new Set()).forEach(i => ids.add(i)); c = c.parent === null || c.parent === undefined ? null : T.classes[String(c.parent)]; }
  return Array.from(ids).map(skill).filter(Boolean);
}
module.exports = { loadSkills, skill, classSkills, classTree };
