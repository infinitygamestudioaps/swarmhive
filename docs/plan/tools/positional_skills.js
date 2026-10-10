// POSITIONAL SKILLS (user 2026-10-09 13:50: "some skills like Backstab work better from behind the enemy, and they should try to move behind
// the enemy if they can"). Built from the L2J High Five datapack on disk (Scripts/data/dp/skills/*.xml = effects + conditions,
// Scripts/data/dp/classSkillTree.xml = who learns what at which level).
//   node docs/plan/tools/positional_skills.js     -> Scripts/data/positional_skills.json + docs/plan/positional_skills.md
// Rules (L2J High Five server code for the effect handlers named in the skill XML; front / side / behind = L2J isInFrontOf / isBehind:
// a 120-degree cone in front of the target's heading, a 120-degree cone behind it, the two 60-degree wedges between = side):
//   behindOnly  : effect "Backstab" - the handler's calcSuccess is `!effector.isInFrontOf(target) && calcBlowSuccess(...)`: it never lands
//                 from the front (the client tooltip says "only when behind"); it also gets the blow position bonus (side x1.5, behind x2).
//   behindBonus : effects "FatalBlow" / "SoulBlow" (blows) - Formulas.calcBlowSuccess: blowChance x DEX bonus x position (front 1,
//                 side 1.5, behind 2). Usable from anywhere, best from behind, side still better than the front.
//   turnsTarget : effect "Bluff" (Bluff, Blinding Blow) - the target takes MY heading = it turns its back to me (+ stun / target cancel).
//   stepsBehind : effect "TeleportToTarget" (Shadow Step) - puts me 25 units behind the target's heading (and cancels its target).
//   critPosBuff : self buffs / passives whose stats depend on the position (Focus Chance / Focus Power / Focus Death: crit rate / crit
//                 damage x0.7 from the front, x1.3 side, x1.6-1.9 behind) - plain hits are better from behind while they are up.
//   frontOnly   : none in the H5 datapack (no player skill has a `player front="true"` CONDITION; the front checks are only stat modifiers).
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const DP = path.join(ROOT, 'Scripts', 'data', 'dp');
const tree = fs.readFileSync(path.join(DP, 'classSkillTree.xml'), 'utf8');
const classNames = JSON.parse(fs.readFileSync(path.join(ROOT, 'Dashboard', 'data', 'classes.json'), 'utf8'));

// ---- who learns what (directly in the class's own tree; the children inherit) ----
const learn = {};    // skill id -> { classId: first getLevel }
for (const m of tree.matchAll(/<skillTree type="classSkillTree" classId="(\d+)"(?: parentClassId="(\d+)")?>([\s\S]*?)<\/skillTree>/g)) {
  for (const s of m[3].matchAll(/skillId="(\d+)" skillLvl="(\d+)" getLevel="(\d+)"/g)) {
    const id = s[1], cls = m[1], lv = +s[3];
    learn[id] = learn[id] || {};
    if (!(cls in learn[id]) || lv < learn[id][cls]) learn[id][cls] = lv;
  }
}
// ---- skill definitions ----
const defs = {};
for (const f of fs.readdirSync(path.join(DP, 'skills'))) {
  const x = fs.readFileSync(path.join(DP, 'skills', f), 'utf8');
  for (const m of x.matchAll(/<skill id="(\d+)" levels="(\d+)" name="([^"]*)"[^>]*>([\s\S]*?)<\/skill>/g)) defs[m[1]] = { name: m[3], body: m[4] };
}
const set = (b, n) => { const r = new RegExp('<set name="' + n + '" val="([^"]*)"').exec(b); return r ? r[1] : ''; };

const rows = [];
for (const id of Object.keys(defs)) {
  if (!learn[id]) continue;                                     // NPC / item skills: nobody of ours learns them
  const d = defs[id], b = d.body.replace(/<enchant\d+Effects>[\s\S]*?<\/enchant\d+Effects>/g, '').replace(/<enchant\d+pvpEffects>[\s\S]*?<\/enchant\d+pvpEffects>/g, '');
  const effects = [...b.matchAll(/<effect name="([^"]*)"/g)].map(e => e[1]);
  const blow = /<param blowChance="(\d+)"/.exec(b);
  const posStat = /<player (behind|front)="(true|false)"/.test(b);
  let rule = null; const extra = [];
  if (effects.includes('Backstab')) rule = 'behindOnly';
  else if (effects.includes('FatalBlow') || effects.includes('SoulBlow')) rule = 'behindBonus';
  if (effects.includes('Bluff')) { if (!rule) rule = 'turnsTarget'; else extra.push('turnsTarget'); }
  if (effects.includes('TeleportToTarget')) rule = 'stepsBehind';
  if (!rule && posStat) rule = 'critPosBuff';
  if (!rule) continue;
  const using = /<using kind="([^"]*)"/.exec(b);
  const classes = Object.keys(learn[id]).map(Number).sort((a, c) => a - c);
  rows.push({
    id: +id, name: d.name, rule, also: extra, blowChance: blow ? +blow[1] : 0,
    weapons: using ? using[1].split(',') : [], range: +set(b, 'castRange') || 0, reuse: +set(b, 'reuseDelay') || 0,
    op: set(b, 'operateType'), effects: [...new Set(effects)],
    classes: classes.map(c => ({ id: c, name: classNames[c] || String(c), level: learn[id][c] })),
  });
}
const ORDER = { behindOnly: 0, behindBonus: 1, turnsTarget: 2, stepsBehind: 3, critPosBuff: 4 };
rows.sort((a, b) => ORDER[a.rule] - ORDER[b.rule] || a.id - b.id);

const out = {
  generated: 'node docs/plan/tools/positional_skills.js (L2J High Five datapack: Scripts/data/dp)',
  angles: { frontHalfDeg: 60, behindHalfDeg: 60, note: 'L2J isInFrontOf / isBehind: front = within 60 deg of the target heading, behind = within 60 deg of its back, side = between' },
  blowPositionMod: { front: 1, side: 1.5, behind: 2 },
  rules: {
    behindOnly: 'fails from the front (L2J Backstab handler: not in front); best from behind (blow x2), side x1.5',
    behindBonus: 'blow land chance x1.5 from the side, x2 from behind (Formulas.calcBlowSuccess)',
    turnsTarget: 'the target turns its back to the caster (Bluff effect: target heading = my heading)',
    stepsBehind: 'teleports me 25 units behind the target (TeleportToTarget)',
    critPosBuff: 'self buff: crit rate / crit damage x0.7 front, x1.3 side, x1.6-1.9 behind while it is up',
    frontOnly: 'none in the H5 datapack',
  },
  skills: {},
};
rows.forEach(r => { out.skills[r.id] = { name: r.name, rule: r.rule, also: r.also, blowChance: r.blowChance, weapons: r.weapons, range: r.range, reuse: r.reuse }; });
fs.writeFileSync(path.join(ROOT, 'Scripts', 'data', 'positional_skills.json'), JSON.stringify(out, null, 1));

const lineOf = (r) => {
  const by = {}; r.classes.forEach(c => { by[c.level] = by[c.level] || []; by[c.level].push(c.name); });
  return Object.keys(by).map(Number).sort((a, b) => a - b).map(l => `${by[l].join(', ')} (${l})`).join('; ');
};
const md = [
  '# Positional skills (front / side / behind)', '',
  'User 2026-10-09 13:50: "some skills like Backstab work better from behind the enemy, and they should try to move behind the enemy if they can."', '',
  'Generated by `node docs/plan/tools/positional_skills.js` from the L2J High Five datapack on disk (`Scripts/data/dp/skills/*.xml` effects +',
  'conditions, `Scripts/data/dp/classSkillTree.xml` learners). Machine copy: `Scripts/data/positional_skills.json` (read by swarm.js, POSBEHIND block).', '',
  '## How the server decides the position', '',
  '- L2J `isInFrontOf` / `isBehind`: **front** = I stand within 60 deg of the direction the target faces (a 120 deg cone), **behind** = within 60 deg of its back,',
  '  **side** = the two 60 deg wedges between.',
  '- The target faces whoever it attacks (the server turns it toward its target on every hit), and its walking direction while it moves.',
  '- Blow land chance (`Formulas.calcBlowSuccess`): blowChance x DEX bonus x **front 1 / side 1.5 / behind 2**.',
  '- Backstab handler: `!isInFrontOf(target) && calcBlowSuccess(...)` = **never from the front** (tooltip: "only when behind").',
  '- Bluff effect: the target takes the caster\'s heading = it turns its back to the caster (Bluff, Blinding Blow). Shadow Step (TeleportToTarget):',
  '  the caster lands 25 units behind the target.',
  '- No player skill in the H5 datapack is front-only (the `player front="true"` checks are only stat modifiers of the Focus buffs).',
  '- Kamael **Shining Edge** (rapier, SoulBlow) is a blow too (front 1 / side 1.5 / behind 2). Archers / Sagittarius: nothing positional.', '',
  '## Table', '',
  '| Skill id | Name | Rule | Blow chance | Weapon | Reuse | Learned by (level) |',
  '|---|---|---|---|---|---|---|',
  ...rows.map(r => `| ${r.id} | ${r.name} | ${r.rule}${r.also.length ? ' + ' + r.also.join(', ') : ''} | ${r.blowChance || '-'} | ${r.weapons.join(', ') || '-'} | ${r.reuse ? (r.reuse / 1000) + ' s' : '-'} | ${lineOf(r)} |`),
  '', '## What the bots do (swarm.js POSBEHIND block)', '',
  '- Every character that knows a behindOnly / behindBonus skill checks its position to the target before such a cast (any account, any class).',
  '- The target\'s facing is inferred: the creature it last hit / cast at (OnAttack / OnMagicSkillUse) > its walking direction > the client heading.',
  '- **Target on a teammate** (tank / leader holds it): step to the point ~60 units behind it (out of other aggressive monsters\' aggro, a short straight',
  '  move, members only move themselves), re-check every ~1 s while it moves, give up after ~3 s and cast the best other skill.',
  '- **Target on me** (solo, or it chose me): it turns with me, walking behind it is wasted. Bluff / Blinding Blow (turn it) or Shadow Step (behind it)',
  '  first when known and ready, then the blows; otherwise Backstab is skipped and the other blows are cast from the front.',
  '- Raid melee damage dealers keep their own behind-the-boss slot (raidDealer, formation arc); this block only adds the per-cast check.',
  '- Each decision is logged once per fight (`positional: ...`).', '',
];
fs.writeFileSync(path.join(ROOT, 'docs', 'plan', 'positional_skills.md'), md.join('\n'));
console.log(`positional skills: ${rows.length} (${Object.keys(ORDER).map(k => k + ' ' + rows.filter(r => r.rule === k).length).join(', ')})`);
