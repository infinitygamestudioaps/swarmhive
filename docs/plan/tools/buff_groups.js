// BUFF GROUPS (stack families) for the buffers (public kit feedback 2026-10-10, Mr.P: "WC tries to use Chant of Fire (M.Def); the char has
// Improved Magic, so the WC casts it until he runs out of MP ... 1st Improved buffs, 2nd buff groups ... if I have one buff from the group then
// don't buff it"). Writes Scripts/data/buff_groups.json from the L2J High Five datapack (Scripts/data/dp/skills/*.xml):
//   types[TYPE]  = { names: [skill names], covers: [types it blocks], coveredBy: [types that block it], stats: [stats it changes], families: [..],
//                    songDance }   covers = the skill's BlockBuffSlot effect (the server REFUSES a buff of a covered type while this one is up:
//                    e.g. IMPROVE_MA_MD_UP (Improved Magic) blocks MA_UP + MD_UP (Empower, Magic Barrier, Chant of Fire))
//   families     = stat families (P.Def, M.Def, P.Atk ...) for the Buffs page and the optional strict rule (settings.buffGroupRule 'stat')
//   divine       = { skillId 1405, slots per level } (Divine Inspiration: + buff slots)
//   hand         = entries that are not in the datapack, each with its source note
// Same abnormal type = the same group anyway (the server keeps the higher level). swarm.js reads this file (BUFFPLAN bpGroups); the dashboard too.
//   node docs/plan/tools/buff_groups.js            (write)        --check   (exit 1 when the file is out of date)
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const DP = path.join(ROOT, 'Scripts', 'data', 'dp', 'skills');
const OUT = process.env.BUFF_GROUPS_OUT || path.join(ROOT, 'Scripts', 'data', 'buff_groups.json');
// stat -> family label (what a player calls the group)
const FAMILY = { pAtk: 'P.Atk', pDef: 'P.Def', mAtk: 'M.Atk', mDef: 'M.Def', pAtkSpd: 'Atk. Spd', mAtkSpd: 'Casting Spd', runSpd: 'Speed', critRate: 'Crit Rate',
  critDmg: 'Crit Damage', accCombat: 'Accuracy', rEvas: 'Evasion', maxHp: 'Max HP', maxMp: 'Max MP', absorbDam: 'Vampiric', mCritRate: 'Magic Crit',
  regMp: 'MP Regen', regHp: 'HP Regen', cancel: 'Concentration', mpConsume: 'MP Cost' };
// hand entries (not readable from the datapack): { type, covers, note }
const HAND = [
  { type: 'MAX_HP_UP', families: ['Max HP'], note: 'Improved Condition (1501) uses MaxHp/MaxMp effects, not a Buff stat: families set by hand (datapack skill 1501)' },
  { type: 'MAX_MP_UP', families: ['Max MP'], note: 'same (datapack skill 1501)' },
  { type: 'IMPROVE_HP_MP_UP', families: ['Max HP', 'Max MP'], note: 'Improved Condition: MaxHp/MaxMp effects (datapack skill 1501)' },
];
function build() {
  if (!fs.existsSync(DP)) return null;
  // stat families only from skills a CLASS learns (NPC / item skills of the same type change other stats and would pollute them)
  let learned = null; try { learned = new Set(); const x = fs.readFileSync(path.join(DP, '..', 'classSkillTree.xml'), 'utf8'); const r = /skillId="(\d+)"/g; let q; while ((q = r.exec(x))) learned.add(q[1]); } catch (e) { learned = null; }
  const types = {};
  const T = (t) => (types[t] = types[t] || { names: [], covers: [], stats: [], families: [], songDance: /^(SONG|DANCE)_/.test(t) });
  fs.readdirSync(DP).filter(f => f.endsWith('.xml')).sort().forEach(f => {
    const x = fs.readFileSync(path.join(DP, f), 'utf8');
    const re = /<skill id="(\d+)" levels="(\d+)" name="([^"]*)"[^>]*>([\s\S]*?)<\/skill>/g; let m;
    while ((m = re.exec(x))) {
      const b = m[4], get = (k) => { const r = new RegExp('<set name="' + k + '" val="([^"]*)"').exec(b); return r ? r[1] : ''; };
      const ab = get('abnormalType'), op = get('operateType');
      if (!ab || ab === 'NONE' || !/^A2|^CA/.test(op) || get('isDebuff') === 'true') continue;
      if (!/^(SELF|TARGET|ONE|PARTY|CLAN|OTHERS)$/.test(get('targetType'))) continue;
      const t = T(ab);
      if (!t.names.includes(m[3])) t.names.push(m[3]);
      const blk = /<effect name="BlockBuffSlot">\s*<param slot="([^"]*)"/g; let s;
      while ((s = blk.exec(b))) s[1].split(';').map(v => v.trim()).filter(Boolean).forEach(v => { if (v !== ab && !t.covers.includes(v)) t.covers.push(v); });
      const st = /<(?:add|mul|sub|set) stat="([A-Za-z]+)"/g;
      if (!learned || learned.has(m[1])) while ((s = st.exec(b))) if (!t.stats.includes(s[1])) t.stats.push(s[1]);
    }
  });
  HAND.forEach(h => { const t = T(h.type); (h.covers || []).forEach(c => { if (!t.covers.includes(c)) t.covers.push(c); }); (h.families || []).forEach(fm => { if (!t.families.includes(fm)) t.families.push(fm); }); });
  Object.keys(types).forEach(k => { const t = types[k]; t.stats.forEach(s => { const fm = FAMILY[s]; if (fm && !t.families.includes(fm)) t.families.push(fm); }); });
  Object.keys(types).forEach(k => types[k].covers.forEach(c => { const o = T(c); (o.coveredBy = o.coveredBy || []).includes(k) || o.coveredBy.push(k); }));
  const families = {};
  Object.keys(types).sort().forEach(k => types[k].families.forEach(fm => { if (types[k].songDance) return; (families[fm] = families[fm] || { types: [] }).types.push(k); }));
  const sorted = {}; Object.keys(types).sort().forEach(k => { const t = types[k]; t.names.sort(); if (t.names.length > 12) { t.more = t.names.length - 12; t.names = t.names.slice(0, 12); } t.covers.sort(); if (t.coveredBy) t.coveredBy.sort(); sorted[k] = t; });
  return {
    _about: 'BUFF GROUPS (stack families) by abnormal type, generated by docs/plan/tools/buff_groups.js from the L2J High Five datapack (BlockBuffSlot effects). ' +
      'covers = types the server refuses while this type is up (a buffer never casts a covered buff on that member); same type = one group (the higher level stays). ' +
      'families = stat families for the dashboard and the strict rule (buff_plans.json settings.buffGroupRule "stat"). Do not edit by hand: re-run the tool.',
    source: 'L2J High Five datapack Scripts/data/dp/skills (github.com/Shagooh/l2j-server-datapack)',
    divine: { skillId: 1405, name: 'Divine Inspiration', slots: [1, 2, 3, 4], note: 'datapack skill 1405: enlargeAbnormalSlot +1..+4 by level' },
    hand: HAND, types: sorted, families,
  };
}
if (require.main === module) {
  const j = build();
  if (!j) { console.log('skipped: needs the L2J datapack in Scripts/data/dp (dev install only)'); process.exit(0); }
  const txt = JSON.stringify(j, null, 1) + '\n';
  let cur = ''; try { cur = fs.readFileSync(OUT, 'utf8'); } catch (e) { }
  if (process.argv.includes('--check')) { console.log(cur === txt ? 'buff_groups.json is up to date' : 'buff_groups.json DIFFERS (run the tool)'); process.exit(cur === txt ? 0 : 1); }
  if (cur !== txt) { fs.writeFileSync(OUT + '.tmp', txt); fs.renameSync(OUT + '.tmp', OUT); }
  const cov = Object.keys(j.types).filter(k => j.types[k].covers.length);
  console.log(`${cur === txt ? 'unchanged' : 'wrote'} ${path.relative(ROOT, OUT)}: ${Object.keys(j.types).length} buff types, ${cov.length} combined (${cov.join(', ')}), ${Object.keys(j.families).length} families`);
}
module.exports = { build };
