// CLASS SKILLS (owner 2026-10-26: "Each class has their own skills, im tired of you keep using wrong skills"): every High Five class line with the
// ACTIVE skills each class tier learns (learn levels, max level, kind, target, scope, power, weapon, reuse, MP, effects) from the local datapack.
//   node docs/plan/tools/class_skills_extract.js   -> docs/plan/class_skills/class_skills.json + one <line>.md per 3rd class + index.md
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..'), DP = path.join(ROOT, 'Scripts', 'data', 'dp');
const OUT = path.join(ROOT, 'docs', 'plan', 'class_skills'); fs.mkdirSync(OUT, { recursive: true });
const CT = JSON.parse(fs.readFileSync(path.join(ROOT, 'Scripts', 'data', 'class_tree.json'), 'utf8').replace(/^﻿/, ''));
const classes = {}; Object.values(CT.classes || {}).forEach(c => { classes[c.id] = c; });

// ---- skill definitions ----
const skills = {};
fs.readdirSync(path.join(DP, 'skills')).filter(f => f.endsWith('.xml')).forEach(f => {
  const x = fs.readFileSync(path.join(DP, 'skills', f), 'utf8');
  const re = /<skill id="(\d+)" levels="(\d+)" name="([^"]*)"[^>]*>([\s\S]*?)<\/skill>/g; let m;
  while ((m = re.exec(x))) {
    const body = m[4], set = (n) => { const r = new RegExp(`<set name="${n}" val="([^"]*)"`).exec(body); return r ? r[1] : ''; };
    const table = (n) => { const r = new RegExp(`<table name="#${n}">([^<]*)</table>`).exec(body); return r ? r[1].trim().split(/\s+/) : null; };
    const val = (n) => { const v = set(n); if (v.startsWith('#')) { const t = table(v.slice(1)); return t ? t[t.length - 1] : ''; } return v; };
    let power = ''; const pw = /<param power="([^"]*)"/.exec(body);
    if (pw) { if (pw[1].startsWith('#')) { const t = table(pw[1].slice(1)); power = t ? t[t.length - 1] : ''; } else power = pw[1]; }
    const effects = [...new Set((body.match(/<effect name="([^"]+)"/g) || []).map(e => e.slice(14, -1)))];
    const weapons = [...new Set((body.match(/<using kind="([^"]+)"/g) || []).map(e => e.slice(13, -1)))];
    skills[m[1]] = { id: +m[1], name: m[3], levels: +m[2], op: set('operateType'), target: set('targetType'), scope: set('affectScope'), range: val('castRange'),
      power, mp: val('mpConsume2') || val('mpConsume1'), reuse: val('reuseDelay'), hit: val('hitTime'), abnormal: set('abnormalType'), abnormalTime: val('abnormalTime'),
      magic: set('magicType') || (body.includes('MagicalAttack') ? '1' : ''), weapons, effects, debuff: set('isDebuff') === 'true' };
  }
});

// ---- class trees ----
// classSkillTree.xml + highFiveNewClassSkillTree.xml (the H5 additions: Sonic Mastery, Aura Cannon, Death Shot, Soul Roar ...) merged per class
const trees = {}, per = {};
['classSkillTree.xml', 'highFiveNewClassSkillTree.xml'].forEach(file => {
  if (!fs.existsSync(path.join(DP, file))) return;
  const tx = fs.readFileSync(path.join(DP, file), 'utf8');
  const tre = /<skillTree type="classSkillTree" classId="(\d+)"(?: parentClassId="(\d+)")?>([\s\S]*?)<\/skillTree>/g; let t;
  while ((t = tre.exec(tx))) {
    const cid = +t[1], P = per[cid] = per[cid] || {};
    if (!trees[cid]) trees[cid] = { classId: cid, parent: null, skills: [] };
    if (t[2] != null) trees[cid].parent = +t[2];
    const sre = /<skill skillName="([^"]*)" skillId="(\d+)" skillLvl="(\d+)" getLevel="(\d+)"/g; let s;
    while ((s = sre.exec(t[3]))) { const id = +s[2], e = P[id] = P[id] || { id, name: s[1], from: 99, to: 0, maxLvl: 0, h5new: file !== 'classSkillTree.xml' }; e.from = Math.min(e.from, +s[4]); e.to = Math.max(e.to, +s[4]); e.maxLvl = Math.max(e.maxLvl, +s[3]); }
  }
});
Object.keys(trees).forEach(c => { trees[c].skills = Object.values(per[c] || {}); });
const kind = (d) => {
  if (!d) return '?';
  if (/^P/.test(d.op)) return 'passive';
  if (/^T/.test(d.op)) return 'toggle';
  const tg = d.target, sc = d.scope, fx = d.effects.join(',');
  if (/Heal|HealPercent|ManaHeal|Resurrection|Cleanse|DispelByCategory/.test(fx) && !/Attack/.test(fx)) return tg === 'SELF' ? 'self-heal' : (/PARTY|PLEDGE|ALLY/.test(sc) ? 'party-heal/support' : 'heal/support');
  if (/Summon/.test(fx)) return 'summon';
  if (/PhysicalAttack|MagicalAttack|FatalBlow|EnergyAttack|Lethal|DeathLink|HpDrain|SoulBlow|Backstab|MagicalSoulAttack|PhysicalSoulAttack|MagicalAttackMp|ChainHeal/.test(fx) && (tg !== 'SELF' || /POINT_BLANK|AREA|RANGE/.test(sc)))
    return (sc && !/SINGLE/.test(sc)) ? 'attack AoE' : 'attack';
  if (tg === 'SELF') return /PARTY|PLEDGE/.test(sc) ? 'party buff' : 'self buff';
  if (/ENEMY/.test(tg) || d.debuff) return 'debuff/CC';
  if (/PARTY|PLEDGE|ALLY/.test(sc)) return 'party buff';
  return 'buff/other';
};
const lineOf = (cid) => { const out = []; let c = cid; while (c != null && trees[c]) { out.unshift(c); c = trees[c].parent; } return out; };
const leaves = Object.keys(trees).map(Number).filter(c => !Object.values(trees).some(x => x.parent === c));
const tierName = ['Base (1-19)', '1st class (20-39)', '2nd class (40-75)', '3rd class (76-85)'];
const result = { generated: new Date().toISOString(), source: 'Scripts/data/dp classSkillTree.xml + skills/*.xml (L2J High Five datapack)', lines: [] };
leaves.sort((a, b) => a - b).forEach(leaf => {
  const L = lineOf(leaf);
  const line = { leaf, name: (classes[leaf] && classes[leaf].name) || String(leaf), tiers: L.map((cid, i) => {
    const tr = trees[cid];
    const sk = tr.skills.map(e => { const d = skills[e.id]; return Object.assign({}, e, { kind: kind(d) }, d ? { target: d.target, scope: d.scope, power: d.power, mp: d.mp, reuse: d.reuse, range: d.range, weapons: d.weapons, effects: d.effects, abnormal: d.abnormal } : {}); })
      .filter(e => !/passive/.test(e.kind) && !/^(Expertise|Lucky|Common Craft|Create Common Item|Create Item|Dwarven Craft|Spoil Crush|Relax|Summon Friend|Clan|Divine Inspiration)/.test(e.name));
    return { classId: cid, name: (classes[cid] && classes[cid].name) || String(cid), tier: i, tierName: tierName[i] || ('tier ' + i), skills: sk.sort((a, b) => a.from - b.from || a.name.localeCompare(b.name)) };
  }) };
  result.lines.push(line);
});
fs.writeFileSync(path.join(OUT, 'class_skills.json'), JSON.stringify(result, null, 1));
// markdown per line
const idx = ['# Class skill lines (High Five datapack)', '', `Generated ${result.generated} by docs/plan/tools/class_skills_extract.js. Active skills only (passives / crafting / expertise left out).`, ''];
result.lines.forEach(l => {
  const md = [`# ${l.name} line`, ''];
  l.tiers.forEach(t => {
    md.push(`## ${t.tierName}: ${t.name} (class ${t.classId})`, '', '| Skill | id | learned | max lvl | kind | target / scope | power | MP | reuse ms | weapon |', '|---|---|---|---|---|---|---|---|---|---|');
    t.skills.forEach(s => md.push(`| ${s.name} | ${s.id} | ${s.from}${s.to !== s.from ? '-' + s.to : ''} | ${s.maxLvl} | ${s.kind} | ${s.target || ''} ${s.scope || ''} | ${s.power || ''} | ${s.mp || ''} | ${s.reuse || ''} | ${(s.weapons || []).join(' ')} |`));
    md.push('');
  });
  const fn = l.name.replace(/[^A-Za-z0-9]+/g, '_') + '.md';
  fs.writeFileSync(path.join(OUT, fn), md.join('\n'));
  idx.push(`- [${l.name}](${fn}): ${l.tiers.map(t => t.name).join(' → ')}`);
});
fs.writeFileSync(path.join(OUT, 'index.md'), idx.join('\n'));
console.log(`${result.lines.length} class lines, ${Object.keys(skills).length} skills -> ${OUT}`);
