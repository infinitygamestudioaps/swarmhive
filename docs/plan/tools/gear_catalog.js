// GEAR PLANNER catalog (user 2026-10-09 12:45: "Under /gear we need to be able to select gear for EVERY single class and EVERY single grade.
// Even though there is no shop selling items in town, we should be able to select, per grade for each class, the equipment we want them to have").
// Builds Dashboard/data/gear_catalog.json for the dashboard Gear planner page (Dashboard/gearpage.js + gearpage_api.js):
//   classes  every H5 class (base, 1st, 2nd, 3rd + Kamael) with race, parent, tier, archetype and its gear KIT (weapon types, armor types,
//            shield / sigil, Kamael Change Weapon) — what the picker shows as "fits this class" (everything equippable stays one tap away).
//   items    every wearable item: slot, grade, type, stats (P.Atk / M.Atk / P.Def / M.Def / crit / atk. speed / shield / max MP), race limit,
//            Kamael Change Weapon twin, S.A. base, Common twin, set, and WHERE it comes from in the datapack: shops (npc + town + price),
//            multisell exchanges, craft (recipe, level, rate, where the recipe drops), monster drop / spoil (top 3), raid boss drops.
//   sets     armor sets with their bonus, shield bonus and +6 bonus.
// Live Giran prices are NOT baked in: the API reads Scripts/data/shopscan_giran.json on every request (re-scanned with !shopscan).
// Sources: Scripts/data/gear_items.json (normalized slots/stats, the same file swarm.js uses), Scripts/data/dp/gear_db.json (L2J H5 items,
// buylists, multisells, sets), Scripts/data/dp/recipes.xml (L2J H5 recipes, github.com/Shagooh/l2j-server-datapack), Scripts/data/npcstats/*.xml
// (drops / spoil), npcs_h5.json + spawns_h5.json (npc names / towns), gear_systems_h5.json (S.A. options), dp/classSkillTree.xml (class tree).
//   node docs/plan/tools/gear_catalog.js
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const D = path.join(ROOT, 'Scripts', 'data');
const rd = (p) => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^﻿/, ''));
const txt = (p) => fs.readFileSync(p, 'utf8');

const GI = rd(path.join(D, 'gear_items.json'));               // normalized: n s full two g t mw pa ma pd md sd mp r p cw
const DB = rd(path.join(D, 'dp', 'gear_db.json'));            // items (raw L2J), sets, buylists, multisells
const NPCS = rd(path.join(D, 'npcs_h5.json'));                // id -> { n, t, l, ty }
const SPAWNS = rd(path.join(D, 'spawns_h5.json'));
const SYS = rd(path.join(D, 'gear_systems_h5.json'));
const TOWNS = rd(path.join(D, 'gear_plan_h5.json')).towns;
const CLASSN = rd(path.join(ROOT, 'Dashboard', 'data', 'classes.json'));
const GRADES = ['NONE', 'D', 'C', 'B', 'A', 'S', 'S80', 'S84'];

// ------------------------------------------------------------------------------------------------ names, npcs, towns
const itemName = {};
try { Object.entries(rd(path.join(ROOT, 'Dashboard', 'data', 'items.json'))).forEach(([id, v]) => { if (v && v[0]) itemName[id] = v[0]; }); } catch (e) { }   // every item incl. recipes / materials
Object.entries(DB.items).forEach(([id, it]) => { itemName[id] = it.name; });
const nm = (id) => itemName[id] || ('item ' + id);
const spawnById = {};
SPAWNS.forEach(s => { (spawnById[s.id] = spawnById[s.id] || []).push(s); });
function townOf(x, y) {
  let best = null, bd = 1e12;
  Object.entries(TOWNS).forEach(([t, [tx, ty]]) => { const d = Math.hypot(x - tx, y - ty); if (d < bd) { bd = d; best = t; } });
  return bd < 12000 ? best : 'near ' + best;
}
const npcCache = {};
function npc(id) {
  if (npcCache[id]) return npcCache[id];
  const n = NPCS[id] || {}, s = (spawnById[id] || [])[0];
  return (npcCache[id] = { id: +id, n: n.n || (s && s.name) || ('npc ' + id), l: n.l || 0, town: s ? townOf(s.x, s.y) : '', spawned: !!s, boss: /RaidBoss|GrandBoss/.test(n.ty || '') });
}

// ------------------------------------------------------------------------------------------------ class tree + kits
const parent = {};
for (const m of txt(path.join(D, 'dp', 'classSkillTree.xml')).matchAll(/<skillTree type="classSkillTree" classId="(\d+)"(?: parentClassId="(\d+)")?/g)) {
  if (m[2] !== undefined) parent[m[1]] = +m[2];
}
function raceOfClass(id) {
  id = +id;
  if (id >= 123) return 'KAMAEL';
  if (id <= 17 || (id >= 88 && id <= 98)) return 'HUMAN';
  if (id <= 30 || (id >= 99 && id <= 105)) return 'ELF';
  if (id <= 43 || (id >= 106 && id <= 112)) return 'DARK_ELF';
  if (id <= 52 || (id >= 113 && id <= 116)) return 'ORC';
  if (id <= 57 || (id >= 117 && id <= 118)) return 'DWARF';
  return '';
}
const MYSTIC_BASE = [10, 25, 38, 49];
const isMystic = (id) => { let c = +id; for (let i = 0; i < 5 && c != null; i++) { if (MYSTIC_BASE.includes(c)) return true; c = parent[c]; } return false; };
const tier = (id) => { let n = 0, c = +id; while (parent[c] != null && n < 5) { c = parent[c]; n++; } return n; };
// archetype = the "kind" of gear a class line wears (one archetype = one gear plan can be copied to every class in it)
const ARCH = {
  fighter: { label: 'Fighter (no class yet)', w: ['SWORD', 'BLUNT', 'DAGGER', 'BOW', 'POLE'], a: ['HEAVY', 'LIGHT'], sh: true },
  mystic: { label: 'Mystic (no class yet)', w: ['MAGIC'], a: ['MAGIC'], sh: true, sig: true },
  kamaelBase: { label: 'Kamael soldier (no class yet)', w: ['RAPIER', 'ANCIENTSWORD', 'CROSSBOW'], a: ['LIGHT', 'MAGIC'], sh: false },
  tank: { label: 'Tank / knight', w: ['SWORD', 'BLUNT'], one: true, a: ['HEAVY'], sh: true },
  warrior: { label: 'Warrior (2h / pole)', w: ['SWORD', 'BLUNT', 'POLE'], a: ['HEAVY', 'LIGHT'], sh: false },
  dual: { label: 'Dual swords (Gladiator / Bladedancer)', w: ['DUAL', 'SWORD', 'BLUNT'], a: ['HEAVY', 'LIGHT'], sh: false },
  pole: { label: 'Pole (Warlord)', w: ['POLE'], a: ['HEAVY', 'LIGHT'], sh: false },
  dagger: { label: 'Dagger', w: ['DAGGER', 'DUALDAGGER'], a: ['LIGHT'], sh: false },
  archer: { label: 'Archer (bow)', w: ['BOW'], a: ['LIGHT'], sh: false },
  sws: { label: 'Swordsinger', w: ['SWORD', 'BLUNT', 'DUAL'], a: ['HEAVY', 'LIGHT'], sh: true },
  destroyer: { label: 'Destroyer / Titan (2h)', w: ['SWORD', 'BLUNT'], two: true, a: ['HEAVY', 'LIGHT'], sh: false },
  fist: { label: 'Fist (Tyrant)', w: ['FIST', 'DUALFIST'], a: ['LIGHT', 'HEAVY'], sh: false },
  nuker: { label: 'Nuker', w: ['MAGIC'], a: ['MAGIC'], sh: false, sig: true },
  summoner: { label: 'Summoner', w: ['MAGIC'], a: ['MAGIC', 'LIGHT'], sh: false, sig: true },
  healer: { label: 'Healer', w: ['MAGIC'], a: ['MAGIC'], sh: true, sig: true },
  buffer: { label: 'Buffer (Prophet / Overlord / Warcryer)', w: ['MAGIC'], a: ['MAGIC', 'HEAVY'], sh: true, sig: true },
  dwarf: { label: 'Dwarf (spoiler / crafter)', w: ['BLUNT', 'SWORD', 'POLE'], a: ['HEAVY', 'LIGHT'], sh: true },
  kamaelAS: { label: 'Kamael ancient sword (Berserker / Doombringer)', w: ['ANCIENTSWORD'], a: ['LIGHT', 'MAGIC'], sh: false, change: 'ANCIENTSWORD' },
  kamaelRapier: { label: 'Kamael rapier (Soul Breaker / Soul Hound / Inspector)', w: ['RAPIER'], a: ['LIGHT', 'MAGIC'], sh: false, change: 'RAPIER' },
  kamaelBow: { label: 'Kamael crossbow (Arbalester / Trickster)', w: ['CROSSBOW'], a: ['LIGHT'], sh: false },
};
const ARCH_OF = {};
const setA = (a, ids) => ids.forEach(i => { ARCH_OF[i] = a; });
setA('fighter', [0, 18, 31, 44, 53]); setA('mystic', [10, 25, 38, 49]); setA('kamaelBase', [123, 124]);
setA('tank', [4, 5, 6, 90, 91, 19, 20, 99, 32, 33, 106]);
setA('warrior', [1]); setA('dual', [2, 88, 34, 107]); setA('pole', [3, 89]);
setA('dagger', [7, 8, 93, 22, 23, 101, 35, 36, 108]); setA('archer', [9, 92, 24, 102, 37, 109]);
setA('sws', [21, 100]); setA('destroyer', [45, 46, 113]); setA('fist', [47, 48, 114]);
setA('nuker', [11, 12, 94, 13, 95, 26, 27, 103, 39, 40, 110]); setA('summoner', [14, 96, 28, 104, 41, 111]);
setA('healer', [15, 16, 97, 29, 30, 105, 42, 43, 112]); setA('buffer', [17, 98, 50, 51, 115, 52, 116]);
setA('dwarf', [54, 55, 117, 56, 57, 118]);
setA('kamaelAS', [125, 127, 131]); setA('kamaelRapier', [128, 129, 132, 133, 135, 136]); setA('kamaelBow', [126, 130, 134]);
// the swarm.js role a class plays in our teams (for "our characters of this class" + the old per-role preferences)
const ROLE_HINT = { 33: 'sk', 106: 'sk', 46: 'destroyer', 113: 'destroyer', 131: 'doombringer', 127: 'doombringer', 128: 'inspector', 132: 'inspector', 129: 'inspector', 133: 'inspector', 135: 'inspector', 136: 'inspector',
  16: 'bishop', 97: 'bishop', 43: 'shilliensaint', 112: 'shilliensaint', 30: 'healer', 105: 'healer', 13: 'necromancer', 95: 'necromancer', 52: 'doomcryer', 116: 'doomcryer',
  57: 'crafter', 118: 'crafter', 55: 'spoiler', 117: 'spoiler' };
const CLASS_IDS = Object.keys(CLASSN).map(Number).sort((a, b) => a - b);
const classes = CLASS_IDS.map(id => {
  const t = tier(id);
  return { id, name: CLASSN[id], race: raceOfClass(id), parent: parent[id] != null ? parent[id] : null, tier: t, mystic: isMystic(id), arch: ARCH_OF[id] || (isMystic(id) ? 'mystic' : 'fighter'),
    role: ROLE_HINT[id] || '', sub: id === 135 || id === 136, minLevel: [1, 20, 40, 76][t] || 1 };
});

// ------------------------------------------------------------------------------------------------ sources
const buySrc = {};
(DB.buylists || []).forEach(b => (b.items || []).forEach(it => (b.npcs || []).forEach(n => { (buySrc[it.id] = buySrc[it.id] || []).push({ npc: n, price: it.price }); })));
const msSrc = {};
(DB.multisells || []).forEach(m => (m.entries || []).forEach(e => (e.prod || []).forEach(p => { (msSrc[p.id] = msSrc[p.id] || []).push({ list: m.id, npcs: m.npcs || [], ing: e.ing || [] }); })));
// drops / spoil (group chance x item chance = overall chance), raid bosses flagged
const drop = {}, spoil = {};
for (const f of fs.readdirSync(path.join(D, 'npcstats')).filter(n => n.endsWith('.xml'))) {
  const s = txt(path.join(D, 'npcstats', f));
  for (const m of s.matchAll(/<npc id="(\d+)"([^>]*)>([\s\S]*?)<\/npc>/g)) {
    const attrs = m[2], body = m[3];
    const type = (/type="(\w+)"/.exec(attrs) || [])[1] || '';
    if (!/Monster|RaidBoss|GrandBoss/.test(type)) continue;
    const dl = /<dropLists>([\s\S]*?)<\/dropLists>/.exec(body); if (!dl) continue;
    const level = +((/level="(\d+)"/.exec(attrs) || [])[1] || 0);
    const name = (/name="([^"]*)"/.exec(attrs) || [])[1] || (NPCS[m[1]] || {}).n || ('npc ' + m[1]);
    for (const k of dl[1].matchAll(/<(death|drop|spoil|corpse|lucky)>([\s\S]*?)<\/\1>/g)) {
      const tgt = k[1] === 'spoil' || k[1] === 'corpse' ? spoil : drop;   // <corpse> = what Sweep takes after Spoil in this datapack
      const add = (id, ch) => { (tgt[id] = tgt[id] || []).push({ n: name, l: level, c: Math.round(ch * 1000) / 1000, b: /Boss/.test(type) ? 1 : 0 }); };
      let rest = k[2];
      for (const g of k[2].matchAll(/<group(?:\s+chance="([\d.]+)")?\s*>([\s\S]*?)<\/group>/g)) {
        const gc = g[1] !== undefined ? +g[1] : 100;
        for (const i of g[2].matchAll(/<item id="(\d+)" min="\d+" max="\d+" chance="([\d.]+)"/g)) add(i[1], gc * +i[2] / 100);
      }
      rest = rest.replace(/<group[\s\S]*?<\/group>/g, '');
      for (const i of rest.matchAll(/<item id="(\d+)" min="\d+" max="\d+" chance="([\d.]+)"/g)) add(i[1], +i[2]);
    }
  }
}
const top = (L, n) => { if (!L) return undefined; const seen = new Set(); return L.slice().sort((a, b) => b.c - a.c).filter(d => !seen.has(d.n) && seen.add(d.n)).slice(0, n).map(d => [d.n, d.l, d.c, d.b]); };   // one line per monster name
// recipes: production id -> recipe
const recipeOf = {};
for (const m of txt(path.join(D, 'dp', 'recipes.xml')).matchAll(/<item id="(\d+)" recipeId="(\d+)" name="([^"]*)" craftLevel="(\d+)" type="(\w+)" successRate="(\d+)">([\s\S]*?)<\/item>/g)) {
  const prod = /<production id="(\d+)" count="(\d+)"/.exec(m[7]); if (!prod) continue;
  const ing = [...m[7].matchAll(/<ingredient id="(\d+)" count="(\d+)"/g)].map(i => [+i[1], +i[2]]);
  const r = { r: +m[2], rn: nm(m[2]), lv: +m[4], k: m[5], rate: +m[6], ing: ing.length, mats: ing.slice(0, 4).map(([i, c]) => c + '× ' + nm(i)).join(', ') + (ing.length > 4 ? ' …' : '') };
  r.rdrop = top(drop[m[2]], 2); r.rspoil = top(spoil[m[2]], 2);
  r.rshop = (buySrc[m[2]] || []).length ? 1 : 0;
  if (!recipeOf[prod[1]] || r.rate > recipeOf[prod[1]].rate) recipeOf[prod[1]] = r;
}
function sourcesOf(id) {
  const o = {};
  const b = (buySrc[id] || []).filter(x => npc(x.npc).spawned);
  if (b.length) {
    const seen = new Set(); o.sh = [];
    b.forEach(x => { const n = npc(x.npc); const k = n.town; if (seen.has(k) || o.sh.length >= 3) return; seen.add(k); o.sh.push([n.n, n.town, Number(x.price) || Number((DB.items[id] || {}).price) || 0]); });
  }
  // multisell: not the Mammon 'take the S.A. off again' lists (an ingredient is the same weapon with an S.A.)
  const base = String((DB.items[id] || {}).name || '').toLowerCase();
  const ms = (msSrc[id] || []).filter(e => !e.ing.some(i => String(nm(i.id)).toLowerCase().startsWith(base + ' - ')));
  if (ms.length) o.ms = ms.slice(0, 2).map(e => [e.npcs.slice(0, 2).map(n => { const q = npc(n); return q.n + (q.town ? ' (' + q.town + ')' : ''); }).join(' / ') || 'list ' + e.list,
    e.ing.map(i => (i.id === 57 ? Number(i.count).toLocaleString('en-US') + ' adena' : i.count + '× ' + nm(i.id))).join(' + ')]);
  if (recipeOf[id]) o.cr = recipeOf[id];
  const dr = top(drop[id], 3); if (dr) o.dr = dr;
  const sp = top(spoil[id], 3); if (sp) o.sp = sp;
  return o;
}

// ------------------------------------------------------------------------------------------------ items
const SKIP = /Shadow Item|limited period|Limited\b|Event|\(Not In Use\)|^Test|_Test|Lv\. ?\d|\{PvP\}|Fortune|Agathion|Olympiad|Hero's|Infinity|Cursed|Zariche|Akamanah|Pirate|Baguette|Halloween|Valentine|Santa|Rudolph|Raid Rank|Clan Oath|Apprentice's|Monster Only/i;
const EXTRA_SLOT = { waist: 'belt', rbracelet: 'bracelet', deco1: 'talisman', back: 'cloak' };
const gnorm = (n) => String(n).toLowerCase().replace(/^common item - /, '').replace(/[^a-z0-9]/g, '').replace(/(earring|necklace|ring)$/, '').replace(/s$/, '');
const items = {};
const gradeOf = (raw) => { const c = String((raw && raw.crystal_type) || 'NONE').toUpperCase(); return GRADES.includes(c) ? c : 'NONE'; };
Object.entries(DB.items).forEach(([id, raw]) => {
  const g = GI.items[id];
  let slot = g ? g.s : EXTRA_SLOT[raw.bodypart];
  if (!slot || SKIP.test(raw.name) || raw.for_npc === 'true') return;
  if (slot === 'weapon' && g && ['FISHINGROD', 'FLAG', 'OWNTHING', 'ETC', ''].includes(g.t)) return;
  const st = raw.stats || {};
  const it = { n: raw.name, s: slot, g: g ? g.g : gradeOf(raw) };
  if (g) {
    if (g.t) it.t = g.t;
    if (g.two) it.two = 1; if (g.mw) it.mw = 1; if (g.full) it.full = 1;
    if (g.r) it.r = g.r; if (g.cw && GI.items[g.cw]) it.cw = g.cw;
    if (g.pa) it.pa = g.pa; if (g.ma) it.ma = g.ma; if (g.pd) it.pd = g.pd; if (g.md) it.md = g.md; if (g.sd) it.sd = g.sd; if (g.mp) it.mp = g.mp;
  } else {
    if (st.pDef) it.pd = +st.pDef; if (st.mDef) it.md = +st.mDef; if (st.maxMp) it.mp = +st.maxMp;
  }
  if (slot === 'shield' && raw.weapon_type === 'SIGIL') it.t = 'SIGIL';
  if (raw.armor_type === 'SIGIL') it.t = 'SIGIL';
  if (st.critRate) it.cr = +st.critRate;
  if (st.pAtkSpd) it.spd = +st.pAtkSpd;
  if (st.rShld) it.rs = +st.rShld;
  if (raw.price) it.p = +raw.price;
  if (/^Common Item - /.test(raw.name)) it.common = 1;
  const src = sourcesOf(id); if (Object.keys(src).length) it.src = src;
  items[id] = it;
});
// Common twins (real <-> "Common Item - X", same stats, no set bonus, no S.A.)
const byKey = {};
Object.entries(items).forEach(([id, it]) => { const k = (it.common ? 'C:' : 'R:') + it.s + ':' + it.g + ':' + gnorm(it.n); (byKey[k] = byKey[k] || []).push(+id); });
Object.entries(items).forEach(([id, it]) => {
  const k = (it.common ? 'R:' : 'C:') + it.s + ':' + it.g + ':' + gnorm(it.n);
  const tw = (byKey[k] || [])[0]; if (tw) it.tw = tw;
});
// S.A. variants: "<base> - <ability>" with a base of the same slot + grade
const byName = {};
Object.entries(items).forEach(([id, it]) => { if (!it.common) byName[it.s + ':' + it.g + ':' + it.n.toLowerCase()] = +id; });
Object.entries(items).forEach(([id, it]) => {
  if (it.common || it.s !== 'weapon') return;
  const m = /^(.*) - ([^-]+)$/.exec(it.n); if (!m) return;
  const base = byName[it.s + ':' + it.g + ':' + m[1].toLowerCase()];
  if (base && base !== +id) { it.base = base; it.sa = m[2].trim(); }
});
// how to put an S.A. on a base weapon (soul crystal + gemstones + adena at a blacksmith)
(SYS.saWeapons || []).forEach(w => (w.options || []).forEach(o => { const p = items[o.productId]; if (p) p.saHow = `${o.crystal} + ${o.gemstones} + ${Number(o.adena || 0).toLocaleString('en-US')} adena at a blacksmith`; }));

// ------------------------------------------------------------------------------------------------ sets
const sets = [];
(DB.sets || []).forEach(s => {
  if (!s.name || SKIP.test(s.name)) return;
  const pieces = {};
  Object.entries(s.pieces || {}).forEach(([slot, ids]) => { const L = (ids || []).filter(i => items[i]); if (L.length) pieces[slot === 'shield' ? 'shield' : slot] = L; });
  if (!pieces.chest) return;
  const bonus = (s.skills || []).flatMap(k => k.effects || []).join(', ');
  const stat = Object.entries(s.stats || {}).map(([k, v]) => k.toUpperCase() + (v > 0 ? ' +' : ' ') + v).join(', ');
  const ix = sets.length;
  sets.push({ name: s.name, g: String(s.grade || 'NONE').toUpperCase(), t: s.armorType || '', pieces, bonus: [bonus, stat].filter(Boolean).join(', '),
    shield: s.shieldSkill ? (s.shieldSkill.effects || []).join(', ') : '', e6: s.enchant6 ? (s.enchant6.effects || []).join(', ') : '' });
  Object.values(pieces).flat().forEach(i => { if (items[i] && items[i].set == null) items[i].set = ix; });
});

const out = { generated: new Date().toISOString(), tool: 'docs/plan/tools/gear_catalog.js', grades: GRADES,
  slots: ['weapon', 'shield', 'head', 'chest', 'legs', 'gloves', 'feet', 'neck', 'earring', 'ring', 'belt', 'bracelet', 'talisman', 'cloak'],
  arch: ARCH, classes, items, sets };
const OUT = path.join(ROOT, 'Dashboard', 'data', 'gear_catalog.json');
fs.writeFileSync(OUT, JSON.stringify(out));
const cnt = {}; Object.values(items).forEach(i => { cnt[i.s] = (cnt[i.s] || 0) + 1; });
const srcN = { shop: 0, multisell: 0, craft: 0, drop: 0, spoil: 0, none: 0 };
Object.values(items).forEach(i => { const s = i.src || {}; if (s.sh) srcN.shop++; if (s.ms) srcN.multisell++; if (s.cr) srcN.craft++; if (s.dr) srcN.drop++; if (s.sp) srcN.spoil++; if (!i.src) srcN.none++; });
console.log(`${OUT}: ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB, ${classes.length} classes, ${Object.keys(items).length} items`, JSON.stringify(cnt), 'sources', JSON.stringify(srcN), sets.length, 'sets');
