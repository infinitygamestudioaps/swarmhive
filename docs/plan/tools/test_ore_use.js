// OREUSE-2026-10-15: Spirit Ore only for skills the hive really casts (tester: the leader traded 300 Spirit Ore to every member)
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const src = fs.readFileSync(process.env.SWARM_JS || path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL ' + m); } };
const m = src.match(/function oreSkillUsed\([^)]*\) \{[^\n]*\}/);
ok(!!m, 'oreSkillUsed exists');
const oreSkillUsed = m ? new Function(m[0] + '; return oreSkillUsed;')() : () => true;
ok(src.includes('oreSkillUsed(sk.Name, healer, summoner)'), 'oreSkills filters with oreSkillUsed');
// wizards / fighters: nothing
['Summon Kat the Cat', 'Summon Mew the Cat', 'Summon Boxer the Unicorn', 'Summon Shadow', 'Mana Regeneration', 'Erase', 'Turn Undead', 'Soul Gathering', 'War Chant', 'Earth Chant']
  .forEach(n => ok(!oreSkillUsed(n, false, false), `${n}: no ore for a non-healer non-summoner`));
// healer heals, cubics, summoner summons: yes
ok(oreSkillUsed('Major Heal', true, false) && oreSkillUsed('Major Group Heal', true, false), 'healer: Major Heal / Major Group Heal');
ok(!oreSkillUsed('Major Heal', false, false), 'non-healer with Major Heal: no ore');
ok(!oreSkillUsed('Turn Undead', true, false) && !oreSkillUsed('Erase', true, false), 'healer: Turn Undead / Erase do not count');
ok(oreSkillUsed('Summon Vampiric Cubic', false, false) && oreSkillUsed('Summon Phantom Cubic', false, false), 'cubics count for anyone (tank)');
ok(oreSkillUsed('Summon Kat the Cat', false, true), 'a summoner keeps its own summons');
console.log(`ore use: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
