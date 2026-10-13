// HEAL SKILLS table (public tester 2026-10-13: "SE uses Self Heal — the weakest heal skill — at lvl 80"; "no MP recharge from SE/EE").
// Builds Scripts/data/heal_skills.json from the L2J High Five datapack copy in Scripts/data/dp (skills/*.xml + classSkillTree.xml):
//   skills.<id>  = { name, kind, levels, power[] (heal power per skill level; % for the *Pct kinds), hit (cast ms), reuse (ms), range, scope }
//   classes.<classId> = [{ id, from, at[] }]   every heal / recharge skill the class line learns (own tree + parents), the level it comes at,
//                                          at = [char level, skill level, ...] (the skill level reached by each char level)
// swarm.js (HEALSCHEME block) ranks the heals a character KNOWS by this power at the level it learned, so a level-80 Shillien Elder uses
// Greater Heal / Battle Heal, never Self Heal (42 power). The dashboard heal-scheme editor (Dashboard/healschemes.js) lists the skills from it.
//   node docs/plan/tools/heal_skills.js            (writes the file; --check = only compare, exit 1 when it would change)
// Kinds: single (target heal) · self (Self Heal: only me) · group (party heal by power) · groupPct (Benediction: % of max HP, long reuse)
//        singlePct (Restore Life) · balance (Balance Life: evens the party's HP) · recharge (MP to one target) · massRecharge (MP to the party)
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const DP = path.join(ROOT, 'Scripts', 'data', 'dp');
const OUT = process.env.HEAL_SKILLS_OUT || path.join(ROOT, 'Scripts', 'data', 'heal_skills.json');
// only the mystic heal / recharge skills (fighter self heals like Divine Heal / Elemental Heal and servitor heals are left out on purpose:
// the support heal must not start casting them on knights that never did)
const KIND = { 1011: 'single', 1015: 'single', 1217: 'single', 1218: 'single', 1401: 'single', 1020: 'single', 1216: 'self',
  1027: 'group', 1219: 'group', 1402: 'group', 1271: 'groupPct', 1258: 'singlePct', 1335: 'balance', 1013: 'recharge', 1428: 'massRecharge' };

function tables(block) {
  const t = {}; const re = /<table name="(#[^"]+)">([^<]*)<\/table>/g; let m;
  while ((m = re.exec(block))) t[m[1]] = m[2].trim().split(/\s+/).map(Number);
  return t;
}
function setVal(block, name) { const m = block.match(new RegExp('<set name="' + name + '" val="([^"]+)"')); return m ? m[1] : ''; }
function build() {
  const skills = {};
  for (const f of fs.readdirSync(path.join(DP, 'skills')).filter(n => n.endsWith('.xml'))) {
    const x = fs.readFileSync(path.join(DP, 'skills', f), 'utf8');
    const re = /<skill id="(\d+)" levels="(\d+)" name="([^"]+)"[\s\S]*?<\/skill>/g; let m;
    while ((m = re.exec(x))) {
      const id = Number(m[1]); if (!KIND[id]) continue;
      const block = m[0], main = block.split(/<enchant\d+Effects>/)[0], T = tables(block), levels = Number(m[2]), kind = KIND[id];
      const eff = /^(singlePct|groupPct)$/.test(kind) ? 'HpPerMax' : /recharge/i.test(kind) ? 'ManaHealByLevel' : kind === 'balance' ? 'RebalanceHP' : 'Heal';
      const em = main.match(new RegExp('<effect name="' + eff + '">([\\s\\S]*?)</effect>'));
      let power = [];
      if (em) {
        const pm = em[1].match(/<param power="([^"]+)"/);
        if (pm) power = pm[1].startsWith('#') ? (T[pm[1]] || []) : Array(levels).fill(Number(pm[1]));
      }
      if (kind === 'balance') power = Array(levels).fill(0);
      const num = (v) => { if (!v) return 0; if (v.startsWith('#')) { const a = T[v] || []; return a.length ? a[a.length - 1] : 0; } return Number(v) || 0; };
      skills[id] = { name: m[3], kind, levels, power, hit: num(setVal(block, 'hitTime')), reuse: num(setVal(block, 'reuseDelay')),
        range: num(setVal(block, 'castRange')), scope: setVal(block, 'affectScope') || '' };
    }
  }
  // class lines
  const tx = fs.readFileSync(path.join(DP, 'classSkillTree.xml'), 'utf8'), trees = {};
  const rt = /<skillTree type="classSkillTree" classId="(\d+)"(?: parentClassId="(\d+)")?>([\s\S]*?)<\/skillTree>/g; let t;
  while ((t = rt.exec(tx))) {
    const sk = []; const r2 = /skillId="(\d+)" skillLvl="(\d+)" getLevel="(\d+)"/g; let k;
    while ((k = r2.exec(t[3]))) sk.push({ id: Number(k[1]), lv: Number(k[2]), gl: Number(k[3]) });
    trees[t[1]] = { parent: t[2] || null, sk };
  }
  // classes.<classId> = [{ id, from, at: [charLevel, skillLevel, charLevel, skillLevel, ...] }]: the skill levels this class LINE learns by
  // character level (the highest skill level per learn level) = the dashboard's estimate before a bot reports its real skills
  const classes = {};
  Object.keys(trees).sort((a, b) => a - b).forEach(cid => {
    const at = {}; let c = cid, guard = 0;
    while (c && trees[c] && guard++ < 8) { trees[c].sk.forEach(s => { if (!skills[s.id]) return; const m = at[s.id] = at[s.id] || {}; if (!(m[s.gl] >= s.lv)) m[s.gl] = s.lv; }); c = trees[c].parent; }
    const list = Object.keys(at).map(Number).map(id => { const gls = Object.keys(at[id]).map(Number).sort((a, b) => a - b), flat = []; let best = 0;
      gls.forEach(g => { if (at[id][g] > best) { best = at[id][g]; flat.push(g, best); } }); return { id, from: gls[0], at: flat }; })
      .sort((a, b) => a.from - b.from || a.id - b.id);
    if (list.length) classes[cid] = list;
  });
  return { _about: 'HEAL SKILLS — generated by docs/plan/tools/heal_skills.js from the High Five datapack (Scripts/data/dp). Never edit by hand. power[] = heal power per skill level (% of max HP for singlePct / groupPct, MP for recharge). Read by swarm.js (HEALSCHEME: the best heal you know) and the dashboard heal-scheme editor.',
    version: 1, skills, classes };
}
if (require.main === module) {
  const data = build(), txt = JSON.stringify(data, null, 1) + '\n';
  const old = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  if (process.argv.includes('--check')) { console.log(old === txt ? 'heal_skills.json is up to date' : 'heal_skills.json WOULD CHANGE'); process.exit(old === txt ? 0 : 1); }
  if (old !== txt) fs.writeFileSync(OUT, txt, 'utf8');
  console.log(`${Object.keys(data.skills).length} heal skills, ${Object.keys(data.classes).length} classes -> ${path.relative(ROOT, OUT)}${old === txt ? ' (unchanged)' : ''}`);
}
module.exports = { build, KIND };
