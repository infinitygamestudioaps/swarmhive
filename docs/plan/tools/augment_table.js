// AUGMENT TABLE (AUGTABLE-2026-10-25, owner: "Show me all life stones and all augmentation you can get from each level life stone and quality
// grade. I wanna see everything I can get and all the life stones that we have"). Builds Scripts/data/augment_table.json from the L2J High
// Five datapack (github.com/Shagooh/l2j-server-datapack, data/stats/augmentation: retailchances.xml (weapons, fighter / mage),
// retailchances_accessory.xml (jewelry), augmentation_skillmap.xml (which option is a skill)) + the client's option texts (L2Swarm static data
// category "augments", saved as docs/plan/augment_src/augments_client.json).
// One augmentation = line 1 (variation 1) + line 2 (variation 2); a line picks a category by its probability, then an option by its chance:
// chance of an option = category % x option %. Assumes the server uses the retail chances (L2J RetailLikeAugmentation, the H5 default).
//   node docs/plan/tools/augment_table.js
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..'), SRC = path.join(ROOT, 'docs', 'plan', 'augment_src');
const rd = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');
const client = JSON.parse(rd('augments_client.json'));
const text = {}; for (const e of client.entries) text[e.id] = String(e.value || '').trim();
const items = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'Dashboard', 'data', 'items.json'), 'utf8')); } catch (e) { return {}; } })();
const itemName = (id) => { const r = items[id] || items[String(id)]; return r ? (r.name || r.n || (Array.isArray(r) ? r[0] : '')) : ''; };

// skill options: id -> { skill, level, type } (type blue / purple / red = active / passive / chance in the client)
const skills = {};
for (const m of rd('augmentation_skillmap.xml').matchAll(/<augmentation id="(\d+)">[\s\S]*?<skillId val="(\d+)" \/>\s*(?:<!--\s*Item Skill:\s*([^:]+?):[^>]*-->)?[\s\S]*?<skillLevel val="(\d+)"[\s\S]*?<type val="(\w+)"/g))
  skills[m[1]] = { skill: +m[2], name: (m[3] || '').trim(), level: +m[4], color: m[5] };   // the name from the datapack comment ("Item Skill: Empower: ...")
// the kind comes from the client text: "Active: ..." / "Passive: ..." / "Chance: ..."
const kindOf = (id) => { const t = text[id] || '', s = skills[id]; if (/^Active:/i.test(t)) return 'active'; if (/^Passive:/i.test(t)) return 'passive'; if (/^Chance:/i.test(t)) return 'chance'; if (s) return 'skill'; return /^(STR|CON|INT|MEN|DEX|WIT) \+\d/.test(t) ? 'base' : 'stat'; };

function parse(xml, kind) {
  const out = {};
  const blocks = kind === 'weapon' ? [...xml.matchAll(/<weapon type="(\w+)">([\s\S]*?)<\/weapon>/g)].map(m => [m[1], m[2]]) : [['accessory', xml]];
  for (const [type, body] of blocks) {
    for (const s of body.matchAll(/<stone id="(\d+)">([\s\S]*?)<\/stone>/g)) {
      const sid = s[1], st = out[sid] = out[sid] || { id: +sid, kind, types: {} };
      const T = st.types[type] = { lines: [] };
      for (const v of s[2].matchAll(/<variation id="(\d+)">([\s\S]*?)<\/variation>/g)) {
        const cats = [];
        for (const c of v[2].matchAll(/<category probability="([\d.]+)">([\s\S]*?)<\/category>/g)) {
          const p = +c[1] / 100, opts = [...c[2].matchAll(/<augment id="(\d+)" chance="([\d.]+)"/g)].map(a => [+a[1], Math.round(p * (+a[2]) * 10000) / 10000]);
          cats.push({ p: +c[1], opts });
        }
        T.lines[+v[1] - 1] = cats;
      }
    }
  }
  return out;
}
const W = parse(rd('retailchances.xml'), 'weapon'), A = parse(rd('retailchances_accessory.xml'), 'accessory');
const stones = Object.values(Object.assign({}, W, A)).map(s => {
  const n = itemName(s.id) || `Life Stone ${s.id}`;
  const lvl = +((n.match(/Level (\d+)/) || [])[1] || 0), grade = /Top-Grade/i.test(n) ? 'top' : /High-Grade/i.test(n) ? 'high' : /Mid-Grade/i.test(n) ? 'mid' : 'normal';
  return Object.assign(s, { name: n.replace(/\s+/g, ' ').trim(), level: lvl, grade });
}).sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'weapon' ? -1 : 1) || a.level - b.level || ['normal', 'mid', 'high', 'top'].indexOf(a.grade) - ['normal', 'mid', 'high', 'top'].indexOf(b.grade));
const used = new Set(); stones.forEach(s => Object.values(s.types).forEach(T => T.lines.forEach(L => (L || []).forEach(c => c.opts.forEach(o => used.add(o[0]))))));
const textOut = {}, skillOut = {}, kinds = {};
used.forEach(id => { const s = skills[id]; if (text[id]) textOut[id] = (s && s.name ? `${s.name} Lv ${s.level} — ` : '') + text[id]; if (s) skillOut[id] = s; kinds[id] = kindOf(id); });
const out = { generated: new Date().toISOString(), source: 'L2J High Five datapack retailchances.xml / retailchances_accessory.xml / augmentation_skillmap.xml + client option texts',
  note: 'One augmentation = line 1 + line 2. Chance of an option = category % x option % (in %). Retail chances assumed (L2J H5 default).', stones, text: textOut, skills: skillOut, kinds };
fs.writeFileSync(path.join(ROOT, 'Scripts', 'data', 'augment_table.json'), JSON.stringify(out));
console.log(`augment_table.json: ${stones.length} stones (${stones.filter(s => s.kind === 'weapon').length} weapon, ${stones.filter(s => s.kind === 'accessory').length} jewelry), ${used.size} options (${Object.keys(skillOut).length} skills), ${Object.keys(textOut).length} texts`);
const missingTxt = [...used].filter(id => !text[id]).length; if (missingTxt) console.log(`${missingTxt} options have no client text`);
