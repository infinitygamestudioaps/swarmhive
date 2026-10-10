// Builds Scripts/data/dp/gear_db.json from the downloaded L2J datapack XML:
const __ROOT = require('path').resolve(__dirname, '..', '..', '..').replace(/\\/g, '/');   // install folder (portable, 2026-10-07)
// items (equipment only), armor sets (+ bonus skill effects), buylists, multisells.
// Run: node gear_db.js
const fs = require('fs'), path = require('path');
const DP = __ROOT + '/Scripts/data/dp';
const OUT = path.join(DP, 'gear_db.json');

const files = (dir) => fs.readdirSync(dir).filter(f => f.endsWith('.xml')).map(f => path.join(dir, f));
const read = (f) => fs.readFileSync(f, 'utf8').replace(/<!--\s*<[\s\S]*?-->/g, '');   // drop commented-out tags
const attr = (s, n) => { const m = new RegExp(`\\b${n}="([^"]*)"`).exec(s); return m ? m[1] : undefined; };

// ---------- items ----------
const items = {};
for (const f of files(path.join(DP, 'stats/items'))) {
  const x = read(f);
  const re = /<item\s+id="(\d+)"\s+type="(\w+)"\s+name="([^"]*)"[^>]*>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = re.exec(x))) {
    const [, id, type, name, body] = m;
    if (type !== 'Weapon' && type !== 'Armor') continue;
    const it = { id: +id, type, name, stats: {} };
    const sets = /<set\s+name="(\w+)"\s+val="([^"]*)"\s*\/>/g;
    let s;
    while ((s = sets.exec(body))) it[s[1]] = s[2];
    const forBlock = /<for>([\s\S]*?)<\/for>/.exec(body);
    if (forBlock) {
      const st = /<(set|add|mul|enchant)\s+(?:order="\w+"\s+)?stat="(\w+)"\s+val="([^"]*)"/g;
      let t;
      while ((t = st.exec(forBlock[1]))) {
        if (t[1] === 'enchant') continue;
        it.stats[t[2]] = (t[1] === 'mul' ? 'x' : '') + t[3];
      }
    }
    const conds = /<cond[\s\S]*?<\/cond>/.exec(body);
    if (conds) it.cond = conds[0].replace(/\s+/g, ' ').slice(0, 300);
    items[id] = it;
  }
}

// ---------- skills (only what set bonuses need) ----------
const skills = {};
const skillDir = path.join(DP, 'skills');
if (fs.existsSync(skillDir)) {
  for (const f of files(skillDir)) {
    const x = read(f);
    const re = /<skill\s+id="(\d+)"\s+levels="(\d+)"\s+name="([^"]*)"[^>]*>([\s\S]*?)<\/skill>/g;
    let m;
    while ((m = re.exec(x))) {
      const [, id, , name, body] = m;
      const eff = [];
      const st = /<(add|mul|sub|set)\s+stat="(\w+)"\s+val="([^"]*)"/g;
      let t;
      while ((t = st.exec(body))) eff.push(`${t[2]} ${t[1] === 'mul' ? 'x' : t[1] === 'sub' ? '-' : '+'}${t[3]}`);
      skills[id] = { name, effects: [...new Set(eff)] };
    }
  }
}

// ---------- armor sets ----------
const sets = [];
for (const f of files(path.join(DP, 'stats/armorsets'))) {
  const x = read(f);
  const re = /<set\s+id="(\d+)">([\s\S]*?)<\/set>/g;
  let m;
  while ((m = re.exec(x))) {
    const body = m[2];
    const set = { id: +m[1], file: path.basename(f), pieces: {}, skills: [], shieldSkill: null, stats: {} };
    const p = /<(chest|legs|head|gloves|feet|shield)\s+id="(\d+)"/g;
    let q;
    while ((q = p.exec(body))) (set.pieces[q[1]] = set.pieces[q[1]] || []).push(+q[2]);
    const sk = /<(skill|shield_skill|enchant6skill)\s+id="(\d+)"\s+level="(\d+)"/g;
    while ((q = sk.exec(body))) {
      const info = skills[q[2]] || {};
      const e = { id: +q[2], level: +q[3], name: info.name || '', effects: info.effects || [] };
      if (q[1] === 'skill') set.skills.push(e);
      else if (q[1] === 'shield_skill') set.shieldSkill = e;
      else set.enchant6 = e;
    }
    const sv = /<(str|con|dex|int|men|wit)\s+val="(-?\d+)"/g;
    while ((q = sv.exec(body))) set.stats[q[1]] = +q[2];
    const chest = (set.pieces.chest || [])[0];
    set.name = chest && items[chest] ? items[chest].name : `set ${set.id}`;
    set.grade = chest && items[chest] ? (items[chest].crystal_type || 'NONE') : '';
    set.armorType = chest && items[chest] ? (items[chest].armor_type || '') : '';
    sets.push(set);
  }
}

// ---------- buylists ----------
const buylists = [];
for (const f of files(path.join(DP, 'buylists'))) {
  const x = read(f);
  const npcs = [...x.matchAll(/<npc>(\d+)<\/npc>/g)].map(m => +m[1]);
  const list = [...x.matchAll(/<item\s+id="(\d+)"([^>]*)\/>/g)].map(m => ({ id: +m[1], price: attr(m[2], 'price') ? +attr(m[2], 'price') : undefined }));
  buylists.push({ id: path.basename(f, '.xml'), npcs, items: list });
}

// ---------- multisells ----------
const multisells = [];
const msDir = path.join(DP, 'multisell');
for (const f of files(msDir)) {
  const x = read(f);
  const npcs = [...x.matchAll(/<npc>(\d+)<\/npc>/g)].map(m => +m[1]);
  const entries = [];
  for (const it of x.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const ing = [...it[1].matchAll(/<ingredient\s+count="(\d+)"\s+id="(-?\d+)"/g)].map(m => ({ id: +m[2], count: +m[1] }));
    const prod = [...it[1].matchAll(/<production\s+count="(\d+)"\s+id="(-?\d+)"/g)].map(m => ({ id: +m[2], count: +m[1] }));
    entries.push({ ing, prod });
  }
  multisells.push({ id: path.basename(f, '.xml'), npcs, entries });
}

fs.writeFileSync(OUT, JSON.stringify({ items, sets, buylists, multisells }));
console.log(`items ${Object.keys(items).length}, skills ${Object.keys(skills).length}, sets ${sets.length}, buylists ${buylists.length}, multisells ${multisells.length}`);
