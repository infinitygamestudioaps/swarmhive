// Builds docs/plan/gear_systems.md + Scripts/data/gear_systems_h5.json
const __ROOT = require('path').resolve(__dirname, '..', '..', '..').replace(/\\/g, '/');   // install folder (portable, 2026-10-07)
// Sources: L2J High Five datapack (downloaded under Scripts/data/dp, Scripts/data/npcstats)
// and the L2J game server source (AbstractRefinePacket, character.properties) in dp/sys.
// Run: node gear_systems.js
const fs = require('fs');
const path = require('path');
const D = __ROOT + '/Scripts/data';
const rd = p => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));
const txt = p => fs.readFileSync(p, 'utf8');

const db = rd(`${D}/dp/gear_db.json`);
const spawns = rd(`${D}/spawns_h5.json`);
const npcsRaw = rd(`${D}/npcs_h5.json`);
const npcs = Array.isArray(npcsRaw) ? Object.fromEntries(npcsRaw.map(n => [n.id, n])) : npcsRaw;
const towns = rd(`${D}/gear_plan_h5.json`).towns;

// ---------- names for every item id from XML comments ----------
const itemName = {};
for (const [id, it] of Object.entries(db.items)) itemName[id] = it.name;
function harvestNames(dir) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) { harvestNames(p); continue; }
    if (!f.endsWith('.xml')) continue;
    const s = txt(p);
    const re = /<(?:item|ingredient|production)\s+id="(\d+)"[^>]*\/>\s*<!--\s*([^>]+?)\s*-->/g;
    let m;
    while ((m = re.exec(s))) if (!itemName[m[1]]) itemName[m[1]] = m[2];
  }
}
for (const d of ['dp/buylists', 'dp/multisell', 'npcstats']) if (fs.existsSync(`${D}/${d}`)) harvestNames(`${D}/${d}`);
const nm = id => itemName[id] || `item ${id}`;

// reference prices (and names) of every item, incl. etc items, from stats/items
const refPrice = {};
for (const dir of [`${D}/dp/stats/items`, `${D}/dp/stats`]) {
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.xml')) continue;
    const s = txt(path.join(dir, f));
    for (const m of s.matchAll(/<item id="(\d+)"[^>]*name="([^"]*)"[^>]*>([\s\S]*?)<\/item>/g)) {
      if (!itemName[m[1]]) itemName[m[1]] = m[2];
      const p = /<set name="price" val="(\d+)"/.exec(m[3]);
      if (p) refPrice[m[1]] = Number(p[1]);
    }
  }
}

// ---------- NPC positions / towns ----------
const spawnById = {};
for (const s of spawns) (spawnById[s.id] = spawnById[s.id] || []).push(s);
function nearestTown(x, y) {
  let best = null, bd = 1e12;
  for (const [t, [tx, ty]] of Object.entries(towns)) {
    const d = Math.hypot(x - tx, y - ty);
    if (d < bd) { bd = d; best = t; }
  }
  return bd < 12000 ? best : `field near ${best}`;
}
function npcInfo(id) {
  const n = npcs[id] || {};
  const s = (spawnById[id] || [])[0];
  return { npcId: Number(id), name: n.n || (s && s.name) || `npc ${id}`, title: n.t || '',
           x: s ? s.x : null, y: s ? s.y : null, z: s ? s.z : null, town: s ? nearestTown(s.x, s.y) : '?' };
}

// ---------- where an item comes from ----------
const buySrc = {};    // itemId -> [{npcId, price}]
for (const b of db.buylists) for (const it of b.items) for (const npc of b.npcs) (buySrc[it.id] = buySrc[it.id] || []).push({ npcId: npc, price: it.price });
const msSrc = {};     // itemId -> [{listId, npcs, ing}]
for (const m of db.multisells) for (const e of m.entries) for (const p of e.prod) (msSrc[p.id] = msSrc[p.id] || []).push({ listId: m.id, npcs: m.npcs, ing: e.ing });
// drops from npc stats
const dropSrc = {};   // itemId -> [{npcId, name, level, chance}]
for (const f of fs.readdirSync(`${D}/npcstats`)) {
  const s = txt(`${D}/npcstats/${f}`);
  const re = /<npc id="(\d+)" level="(\d+)" type="(\w+)" name="([^"]*)"([\s\S]*?)<\/npc>/g;
  let m;
  while ((m = re.exec(s))) {
    const [, id, level, type, name, body] = m;
    if (!/Monster|RaidBoss|GrandBoss/.test(type)) continue;
    const ire = /<item id="(\d+)" min="(\d+)" max="(\d+)" chance="([\d.]+)"/g;
    let im;
    while ((im = ire.exec(body))) {
      (dropSrc[im[1]] = dropSrc[im[1]] || []).push({ npcId: Number(id), name, level: Number(level), type, chance: Number(im[4]) });
    }
  }
}
function sourceOf(id, maxDrops = 3) {
  const out = [];
  const b = buySrc[id];
  if (b) {
    // skip NPCs with no spawn (test/GM NPCs such as Mr. Cat)
    const live = [...new Map(b.map(x => [x.npcId, x])).values()].filter(x => npcInfo(x.npcId).x !== null);
    const shops = live.slice(0, 4).map(x => { const n = npcInfo(x.npcId); return `${n.name} (${n.town})`; });
    // buylists without a price use the item's reference price
    if (live.length) out.push(`shop ${b[0].price || (db.items[id] && db.items[id].price) || refPrice[id] || '?'} adena: ${shops.join(', ')}`);
  }
  const ms = msSrc[id];
  if (ms) out.push(`exchange (multisell ${ms[0].listId}${ms[0].npcs.length ? ' @ ' + ms[0].npcs.slice(0, 3).map(n => npcInfo(n).name).join('/') : ''}): ` + ms[0].ing.map(i => `${i.count}× ${nm(i.id)}`).join(' + '));
  const dr = dropSrc[id];
  if (dr) out.push(`drop: ` + dr.sort((a, c) => c.chance - a.chance).slice(0, maxDrops).map(d => `${d.name} L${d.level} ${d.chance}%`).join(', '));
  if (!out.length) out.push('craft / spoil / quest (not sold or dropped in datapack)');
  return out;
}

// ===================== a) ARMOR SETS =====================
const gradeOrder = ['NONE', 'D', 'C', 'B', 'A', 'S', 'S80', 'S84'];
const sets = db.sets.map(s => {
  const pieces = {};
  for (const [slot, ids] of Object.entries(s.pieces || {})) pieces[slot] = ids.map(i => ({ id: i, name: nm(i) }));
  const bonus = (s.skills || []).flatMap(k => k.effects || []).join(', ');
  const chest = (s.pieces.chest || [])[0];
  return {
    id: s.id, name: s.name, grade: (s.grade || 'NONE').toUpperCase(), type: s.armorType || '?',
    pieces, bonus, stats: s.stats || {},
    shieldBonus: s.shieldSkill ? (s.shieldSkill.effects || []).join(', ') : '',
    enchant6: s.enchant6 ? (s.enchant6.effects || []).join(', ') : '',
    source: chest ? sourceOf(chest, 2) : [],
  };
}).sort((a, b) => gradeOrder.indexOf(a.grade) - gradeOrder.indexOf(b.grade) || a.type.localeCompare(b.type) || a.name.localeCompare(b.name));

// role recommendations per grade: pick by type + effect keywords
const ROLE_SET = {
  tank:      { type: ['HEAVY'], want: /pDef|maxHp|rShld|sDef|healEffect/ },
  healer:    { type: ['MAGIC'], want: /mAtkSpd|regMp|maxMp|mDef/ },
  mage:      { type: ['MAGIC'], want: /mAtkSpd|mAtk|maxMp/ },
  destroyer: { type: ['HEAVY'], want: /maxHp|pAtk|pAtkSpd|pDef/ },
  kamael:    { type: ['LIGHT'], want: /pAtkSpd|pAtk|critRate|runSpd|evasion|mAtkSpd/ },
  buffer:    { type: ['MAGIC', 'LIGHT'], want: /mAtkSpd|regMp|maxMp|maxHp/ },
};
const TEAM = {
  Tank1: 'tank', Bishop1: 'healer', Destroyer1: 'destroyer', Destroyer2: 'destroyer', Doombringer1: 'kamael',
  Inspector1: 'kamael', Necro1: 'mage', Chanter1: 'buffer', Saint1: 'healer',
};
const setRecs = {};
for (const [role, r] of Object.entries(ROLE_SET)) {
  setRecs[role] = {};
  for (const g of gradeOrder) {
    const cands = sets.filter(s => s.grade === g && r.type.includes(s.type) && !/PvP|\{PvP\}|Shadow|Sealed|Clan Oath|Apella|Elegia|Vorpal|Vesper Noble|Fortune|limited/i.test(s.name));
    const scored = cands.map(s => ({ s, score: (s.bonus.match(r.want) || []).length * 10 + (s.bonus.split(',').length) + (s.source.join(' ').includes('shop') ? 3 : 0) }))
      .sort((a, b) => b.score - a.score);
    setRecs[role][g] = scored.slice(0, 2).map(x => x.s.name);
  }
}

// ===================== b) DYES =====================
const hx = txt(`${D}/dp/sys/hennaList.xml`);
const dyes = [];
{
  const re = /<henna dyeId="(\d+)" dyeName="([^"]*)" dyeItemId="(\d+)" dyeLevel="(\d+)">([\s\S]*?)<\/henna>/g;
  let m;
  while ((m = re.exec(hx))) {
    const [, dyeId, dyeName, itemId, level, body] = m;
    const st = /<stats ([^/]*)\/>/.exec(body)[1];
    const stats = {};
    st.replace(/(\w+)="(-?\d+)"/g, (_, k, v) => { if (Number(v)) stats[k.toUpperCase()] = Number(v); });
    const wear = /<wear count="(\d+)" fee="(\d+)"/.exec(body);
    const cancel = /<cancel count="(\d+)" fee="(\d+)"/.exec(body);
    const classes = [...body.matchAll(/<classId>(\d+)<\/classId>/g)].map(c => Number(c[1]));
    const label = Object.entries(stats).map(([k, v]) => `${k}${v > 0 ? '+' : ''}${v}`).join(' ');
    dyes.push({
      dyeId: Number(dyeId), itemId: Number(itemId), name: nm(itemId), label, level: Number(level), stats,
      wearCount: wear ? Number(wear[1]) : 0, wearFee: wear ? Number(wear[2]) : 0,
      cancelFee: cancel ? Number(cancel[2]) : 0, classes, source: sourceOf(itemId, 3),
    });
  }
}
// Our class ids: 1st class (20-39) and 2nd class (40+)
const CLASS = {
  Tank1:    { first: 32, second: 33, w1: { CON: 3, DEX: 2, STR: 1.5, MEN: 1, WIT: 0.5 }, w2: { CON: 3, DEX: 2, STR: 1.5, MEN: 1.5, WIT: 0.5 } },
  Bishop1:     { first: 15, second: 16, w1: { WIT: 3, MEN: 2.5, INT: 1, CON: 1 }, w2: { WIT: 3, MEN: 2.5, INT: 1, CON: 1 } },
  Destroyer1:  { first: 45, second: 46, w1: { STR: 3, DEX: 1.5, CON: 1.5 }, w2: { STR: 3, CON: 1.5, DEX: 1.5 } },
  Destroyer2:  { first: 45, second: 46, w1: { STR: 3, DEX: 1.5, CON: 1.5 }, w2: { STR: 3, CON: 1.5, DEX: 1.5 } },
  Doombringer1:    { first: 125, second: 127, w1: { STR: 3, DEX: 2.5, CON: 1 }, w2: { STR: 3, DEX: 2.5, CON: 1 } },
  Inspector1:  { first: 125, second: 128, w1: { STR: 3, DEX: 2.5, CON: 1 }, w2: { INT: 3, WIT: 2, MEN: 1, CON: 0.5 } },
  Necro1:    { first: 11, second: 13, w1: { INT: 3, WIT: 2, MEN: 1.5, CON: 1 }, w2: { INT: 3, WIT: 2, MEN: 1.5, CON: 1 } },
  Chanter1: { first: 50, second: 52, w1: { WIT: 3, MEN: 2, CON: 1.5, INT: 1 }, w2: { WIT: 3, CON: 2, MEN: 2 } },
  Saint1:  { first: 42, second: 43, w1: { WIT: 3, MEN: 2.5, INT: 1, CON: 0.5 }, w2: { WIT: 3, MEN: 2.5, INT: 1, CON: 0.5 } },
};
const classNames = { 32: 'Palus Knight', 33: 'Shillien Knight', 15: 'Cleric', 16: 'Bishop', 45: 'Orc Raider', 46: 'Destroyer',
  125: 'Trooper', 127: 'Berserker', 128: 'Soul Breaker', 11: 'Human Wizard', 13: 'Necromancer', 50: 'Orc Shaman', 52: 'Warcryer', 42: 'Shillien Oracle', 43: 'Shillien Elder' };
// Stats the class doesn't care about still cost a little (0.3), so a dye never trades away a stat for free.
function dyeScore(d, w) { return Object.entries(d.stats).reduce((a, [k, v]) => a + v * (w[k] !== undefined ? w[k] : 0.3), 0); }
function pickDyes(classId, maxLevel, w, slots) {
  const usable = dyes.filter(d => d.classes.includes(classId) && d.level <= maxLevel)
    .map(d => ({ d, s: dyeScore(d, w) })).filter(x => x.s >= 0).sort((a, b) => b.s - a.s || a.d.wearFee - b.d.wearFee);
  const picked = [], total = {};
  for (const { d } of usable) {
    if (picked.length >= slots) break;
    // stat cap: symbols can't raise a stat by more than +5 in total
    const ok = Object.entries(d.stats).every(([k, v]) => v < 0 || (total[k] || 0) + v <= 5);
    if (!ok || picked.some(p => p.dyeId === d.dyeId)) continue;
    picked.push(d);
    for (const [k, v] of Object.entries(d.stats)) total[k] = (total[k] || 0) + v;
  }
  return { dyes: picked, total };
}
const dyePlan = {};
for (const [ch, c] of Object.entries(CLASS)) {
  const a = pickDyes(c.first, 39, c.w1, 2), b = pickDyes(c.second, 85, c.w2, 3);
  dyePlan[ch] = {
    first: { classId: c.first, className: classNames[c.first], dyes: a.dyes.map(d => d.dyeId), total: a.total },
    second: { classId: c.second, className: classNames[c.second], dyes: b.dyes.map(d => d.dyeId), total: b.total },
  };
}
const symbolMakers = Object.entries(npcs).filter(([, n]) => /Symbol Maker/i.test(n.t || '')).map(([id]) => npcInfo(id)).filter(n => n.x !== null);

// ===================== c) CRYSTALS / GEMSTONES =====================
const crystals = [
  { id: 1458, grade: 'D' }, { id: 1459, grade: 'C' }, { id: 1460, grade: 'B' }, { id: 1461, grade: 'A' }, { id: 1462, grade: 'S' },
].map(c => ({ ...c, name: nm(c.id), source: sourceOf(c.id, 3) }));
const gemstones = [{ id: 2130, grade: 'D' }, { id: 2131, grade: 'C' }, { id: 2132, grade: 'B' }]
  .map(g => ({ ...g, name: nm(g.id), source: sourceOf(g.id, 5) }));
// crystallize values: crystal_count on items
const crystallize = {};
for (const g of ['D', 'C', 'B', 'A', 'S']) {
  const ws = Object.values(db.items).filter(i => (i.crystal_type || '').toUpperCase() === g && i.crystal_count);
  if (ws.length) {
    const counts = ws.map(i => Number(i.crystal_count)).sort((a, b) => a - b);
    crystallize[g] = { items: ws.length, min: counts[0], median: counts[Math.floor(counts.length / 2)], max: counts[counts.length - 1] };
  }
}

// ===================== d) SOUL CRYSTALS & SA =====================
const lx = txt(`${D}/dp/sys/levelUpCrystalData.xml`);
const crystalStage = {};   // itemId -> {color, level}
{
  const re = /<item itemId="(\d+)" level="(\d+)" leveledItemId="(\d+)" \/>\s*<!--\s*(\w+)/g;
  let m;
  while ((m = re.exec(lx))) {
    crystalStage[m[1]] = { color: m[4], level: Number(m[2]) };
    if (!crystalStage[m[3]]) crystalStage[m[3]] = { color: m[4], level: Number(m[2]) + 1 };
  }
}
const absorbers = [];      // {npcId, name, level, chance, skill, maxLevel, absorbType}
{
  const npcSec = lx.slice(lx.indexOf('<npc>'));
  const re = /<item npcId="(\d+)">\s*<!--\s*([^>]*?)\s*-->([\s\S]*?)<\/item>/g;
  let m;
  while ((m = re.exec(npcSec))) {
    const det = [...m[3].matchAll(/<detail([^/]*)\/>/g)].map(d => {
      const o = {}; d[1].replace(/(\w+)="([^"]*)"/g, (_, k, v) => { o[k] = v; }); return o;
    });
    const n = npcs[m[1]] || {};
    for (const d of det) absorbers.push({ npcId: Number(m[1]), name: m[2], level: n.l || null, type: n.ty || '',
      chance: Number(d.chance), skill: d.skill === 'true', maxLevel: d.maxLevel ? Number(d.maxLevel) : null,
      levelList: d.levelList ? d.levelList.split(',').map(x => Number(x.trim())) : null, absorbType: d.absorbType || 'LAST_HIT' });
  }
}
// best mobs per stage (to level from stage s to s+1, a mob needs maxLevel > s)
const stageGuide = [];
for (let s = 0; s < 18; s++) {
  // Normal mobs level a crystal while its stage is below their maxLevel (stages 0-9).
  // Raid/grand bosses list the exact stages they work on (levelList, stages 10-17).
  const mobs = absorbers.filter(a => a.maxLevel !== null && a.maxLevel > s)
    .sort((a, b) => a.maxLevel - b.maxLevel || (a.level || 99) - (b.level || 99)).slice(0, 6);
  const raids = absorbers.filter(a => a.levelList && a.levelList.includes(s))
    .sort((a, b) => b.chance - a.chance || (a.level || 99) - (b.level || 99)).slice(0, 8);
  stageGuide.push({ from: s, to: s + 1,
    mobs: mobs.map(a => `${a.name}${a.level ? ` L${a.level}` : ''} (${a.chance}%, up to ${a.maxLevel})`),
    raids: raids.map(a => `${a.name}${a.level ? ` L${a.level}` : ''} (${a.absorbType}, ${a.chance}%)`) });
}const q350Npcs = [30115, 30856, 30194].map(npcInfo);

// SA weapons from multisells: weapon + soul crystal + gemstones + adena -> weapon with SA
const saWeapons = {};
for (const m of db.multisells) {
  for (const e of m.entries) {
    const sc = e.ing.find(i => crystalStage[i.id]);
    if (!sc) continue;
    const base = e.ing.find(i => db.items[i.id] && db.items[i.id].type === 'Weapon');
    const prod = e.prod[0];
    if (!base || !prod) continue;
    const pname = nm(prod.id);
    const sa = pname.includes(' - ') ? pname.split(' - ').slice(1).join(' - ') : pname;
    const key = base.id;
    const w = db.items[base.id];
    if (!saWeapons[key]) saWeapons[key] = {
      baseId: base.id, name: w.name, grade: (w.crystal_type || 'NONE').toUpperCase(), type: w.weapon_type,
      twoHand: w.bodypart === 'lrhand', magic: w.is_magic_weapon === 'true', pAtk: Number((w.stats || {}).pAtk || 0),
      mAtk: Number((w.stats || {}).mAtk || 0), listId: m.id, npcs: m.npcs, options: [],
    };
    if (saWeapons[key].options.some(o => o.sa === sa)) continue;
    const st = crystalStage[sc.id];
    saWeapons[key].options.push({
      sa, productId: prod.id, crystal: `${st.color} Soul Crystal stage ${st.level}`, crystalId: sc.id,
      gemstones: e.ing.filter(i => i.id >= 2130 && i.id <= 2134).map(i => `${i.count}× ${nm(i.id)}`).join(', '),
      adena: (e.ing.find(i => i.id === 57) || {}).count || 0,
    });
  }
}
const saList = Object.values(saWeapons).sort((a, b) => gradeOrder.indexOf(a.grade) - gradeOrder.indexOf(b.grade) || a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
const saNpcIds = [...new Set(saList.flatMap(w => w.npcs))];
const refiners = saNpcIds.map(npcInfo).filter(n => n.x !== null);
// best SA per role
const SA_PREF = {
  tank:        { ok: w => ['SWORD', 'BLUNT'].includes(w.type) && !w.twoHand && !w.magic, prefer: ['Health', 'Focus', 'Haste', 'Critical Damage', 'Guidance'] },
  destroyer:   { ok: w => ['SWORD', 'BLUNT'].includes(w.type) && w.twoHand && !w.magic, prefer: ['Haste', 'Focus', 'Critical Damage', 'Health', 'Light'] },
  berserker:   { ok: w => w.type === 'ANCIENTSWORD', prefer: ['Haste', 'Focus', 'Critical Damage', 'Light', 'Health'] },
  soulbreaker: { ok: w => w.type === 'RAPIER', prefer: ['Focus', 'Haste', 'Critical Damage', 'Health', 'Light'] },
  mage:        { ok: w => w.magic, prefer: ['Acumen', 'Empower', 'Mana Up', 'Magic Power', 'Conversion', 'Magic Hold'] },
  healer:      { ok: w => w.magic, prefer: ['Acumen', 'Mana Up', 'Empower', 'Magic Regeneration', 'Conversion'] },
};
const saBest = {};
for (const [role, r] of Object.entries(SA_PREF)) {
  saBest[role] = {};
  for (const g of ['C', 'B', 'A', 'S', 'S80', 'S84']) {
    const ws = saList.filter(w => w.grade === g && r.ok(w) && !w.name.includes(' - ')).sort((a, b) => (role === 'mage' || role === 'healer' ? b.mAtk - a.mAtk : b.pAtk - a.pAtk));
    saBest[role][g] = ws.slice(0, 3).map(w => {
      const opt = r.prefer.map(p => w.options.find(o => o.sa.toLowerCase().includes(p.toLowerCase()))).find(Boolean) || w.options[0];
      return { weapon: w.name, sa: opt ? opt.sa : '?', crystal: opt ? opt.crystal : '?', cost: opt ? `${opt.gemstones}, ${opt.adena} adena` : '' };
    });
  }
}

// ===================== e) AUGMENTATION =====================
const lsLevels = [46, 49, 52, 55, 58, 61, 64, 67, 70, 76, 80, 82, 84, 85];
const lifeStones = [];
const lsGrade = ['Normal', 'Mid', 'High', 'Top'];
for (let g = 0; g < 4; g++) for (let l = 0; l < 10; l++) lifeStones.push({ id: 8723 + g * 10 + l, grade: lsGrade[g], playerLevel: lsLevels[l] });
[[9573, 10], [10483, 11], [14166, 12]].forEach(([base, l]) => { for (let g = 0; g < 4; g++) lifeStones.push({ id: base + g, grade: lsGrade[g], playerLevel: lsLevels[l] }); });
for (const ls of lifeStones) {
  ls.name = nm(ls.id);
  const dr = (dropSrc[ls.id] || []).sort((a, b) => b.chance - a.chance).slice(0, 3);
  ls.topDrops = dr.map(d => `${d.name} L${d.level} ${d.chance}%`);
  ls.shop = buySrc[ls.id] ? sourceOf(ls.id)[0] : '';
}
const skillmap = txt(`${D}/dp/sys/augmentation_skillmap.xml`);
const augSkills = { blue: {}, purple: {}, red: {} };
{
  const re = /<augmentation id="\d+">\s*<!--\s*([^>]*?)\s*-->\s*<skillId val="(\d+)" \/>\s*<!--\s*([^>]*?)\s*-->[\s\S]*?<type val="(\w+)" \/>/g;
  let m;
  while ((m = re.exec(skillmap))) {
    const name = m[3].replace(/^Item Skill:\s*/, '').split(':')[0].trim();
    const kind = /^Active/i.test(m[1]) ? 'Active' : /^Passive/i.test(m[1]) ? 'Passive' : /^Chance/i.test(m[1]) ? 'Chance' : '';
    const k = `${name}${kind ? ` (${kind})` : ''}`;
    augSkills[m[4]][k] = (augSkills[m[4]][k] || 0) + 1;
  }
}
const augment = {
  gemstoneCost: {
    weapon: { C: '20× Gemstone D', B: '30× Gemstone D', A: '20× Gemstone C', S: '25× Gemstone C', S80: '36× Gemstone B', S84: '36× Gemstone B' },
    accessory: { C: '200× Gemstone D', B: '300× Gemstone D', A: '200× Gemstone C', S: '250× Gemstone C', S80: '360× Gemstone B', S84: '480× Gemstone B' },
  },
  rules: 'C-grade or higher weapons (not shadow, hero, common, time-limited, PvP) and C+ necklaces/earrings/rings. Life stone level = minimum player level. One augment per item; removing it costs adena at the same NPC.',
  skillChance: { Normal: 15, Mid: 30, High: 45, Top: 60, accessory: 0 },
  glowChance: { Normal: 0, Mid: 40, High: 70, Top: 100 },
  colorChance: 'RetailLikeAugmentation=True: per life-stone grade the result colour is yellow 55% / blue 35% / purple 7% / red 3% (character.properties defaults).',
  colors: 'yellow = stat bonuses only. Blue, purple and red each mix Active, Passive and Chance (proc) skills; blue are the weakest/common ones, purple the useful mid tier, red the rarest and strongest (Reflect Damage, Focus, Wild Magic, Clarity/Refresh, Vampiric Rage, Celestial Shield)',
  lifeStones, skills: Object.fromEntries(Object.entries(augSkills).map(([c, o]) => [c, Object.entries(o).sort((a, b) => b[1] - a[1]).map(([n]) => n)])),
};

// ===================== f) ENCHANTING =====================
const ex = txt(`${D}/dp/sys/enchantItemData.xml`);
const scrolls = [...ex.matchAll(/<enchant id="(\d+)" targetGrade="(\w+)"([^/]*)\/>/g)].map(m => ({ id: Number(m[1]), grade: m[2], name: nm(m[1]), extra: m[3].trim(), source: sourceOf(m[1], 2) }));
const gx = txt(`${D}/dp/sys/enchantItemGroups.xml`);
const rateGroups = {};
for (const m of gx.matchAll(/<enchantRateGroup name="(\w+)">([\s\S]*?)<\/enchantRateGroup>/g)) {
  rateGroups[m[1]] = [...m[2].matchAll(/<current enchant="([\d-]+)" chance="([\d.]+)"/g)].slice(0, 10).map(c => `+${c[1]}: ${c[2]}%`);
}

// ===================== write JSON =====================
const out = {
  generated: new Date().toISOString(), source: 'L2J High Five datapack + L2J game server (Shagooh/l2j-server-datapack, Shagooh/l2j-server-game)',
  sets, setRecommendations: setRecs, team: TEAM, dyes, dyePlan, symbolMakers, crystals, gemstones, crystallize,
  soulCrystals: { q350StartNpcs: q350Npcs, stageGuide, absorbers, crystalStage }, saWeapons: saList, saBest, refiners, augment,
  enchant: { scrolls, rateGroups },
};
fs.writeFileSync(`${D}/gear_systems_h5.json`, JSON.stringify(out, null, 1));

// ===================== write MD =====================
const L = [];
const P = s => L.push(s);
const dyeById = Object.fromEntries(dyes.map(d => [d.dyeId, d]));
P('# Gear systems, High Five (L2Toggle)');
P('');
P('Generated by `docs/plan/tools/gear_systems.js` from the L2J High Five datapack and the L2J game server source.');
P('Data: `Scripts/data/gear_systems_h5.json`. L2Toggle may have changed prices, drops or rates, so check them live.');
P('');
P('## a) Armor sets');
P('');
P('`bonus` = full-set bonus. `shield` = extra bonus with the set shield. `+6` = bonus when every piece is +6 or more.');
P('');
for (const g of gradeOrder) {
  const gs = sets.filter(s => s.grade === g);
  if (!gs.length) continue;
  P(`### ${g === 'NONE' ? 'No-grade' : g + '-grade'} (${gs.length} sets)`);
  P('');
  P('| Set | Type | Pieces | Bonus | Shield | +6 | Where |');
  P('|---|---|---|---|---|---|---|');
  for (const s of gs) {
    const pieces = Object.entries(s.pieces).map(([sl, arr]) => `${sl}: ${arr[0].name}`).join('; ');
    P(`| ${s.name} | ${s.type} | ${pieces} | ${s.bonus || '-'} | ${s.shieldBonus || '-'} | ${s.enchant6 || '-'} | ${s.source.join('<br>')} |`);
  }
  P('');
}
P('### Set recommendations per role');
P('');
P('| Role (who) | ' + gradeOrder.map(g => g === 'NONE' ? 'No-grade' : g).join(' | ') + ' |');
P('|---|' + gradeOrder.map(() => '---').join('|') + '|');
const who = r => Object.entries(TEAM).filter(([, v]) => v === r).map(([k]) => k).join(', ');
for (const [role, recs] of Object.entries(setRecs)) P(`| ${role} (${who(role)}) | ` + gradeOrder.map(g => recs[g].join(' / ') || '-').join(' | ') + ' |');
P('');
P('Casters: a casting-speed set (+15%) comes before anything else (Devotion at No-grade, Karmian at C, Avadon/Blue Wolf at B).');
P('The Clan Oath sets are for academy members only. Shadow sets expire, and Sealed pieces must be unsealed first.');
P('');
P('## b) Tattoos (dyes / hennas)');
P('');
P(`There are ${dyes.length} dyes in High Five. A Symbol Maker draws the dye on: it costs **wear count** dyes plus the fee, and removing it costs the cancel fee.`);
P('Symbols can raise a stat by at most +5 in total. You get 2 symbol slots after the 1st class change and 3 after the 2nd (one symbol per slot).');
P('');
P('### Best dyes for our 9');
P('');
P('| Character | 1st class (2 slots) | Total | 2nd class (3 slots) | Total |');
P('|---|---|---|---|---|');
const fmtTot = t => Object.entries(t).map(([k, v]) => `${k}${v > 0 ? '+' : ''}${v}`).join(' ');
for (const [ch, p] of Object.entries(dyePlan)) {
  const a = p.first.dyes.map(id => `${dyeById[id].label} (${dyeById[id].itemId})`).join(', ');
  const b = p.second.dyes.map(id => `${dyeById[id].label} (${dyeById[id].itemId})`).join(', ');
  P(`| ${ch} (${p.first.className} → ${p.second.className}) | ${a || '-'} | ${fmtTot(p.first.total)} | ${b || '-'} | ${fmtTot(p.second.total)} |`);
}
P('');
P('### Symbol Makers');
P('');
P('| NPC | Town | x, y, z |');
P('|---|---|---|');
for (const s of symbolMakers) P(`| ${s.name} | ${s.town} | ${s.x}, ${s.y}, ${s.z} |`);
P('');
P('### All dyes');
P('');
P('| Dye item | Stats | Min level | Wear (dyes, fee) | Cancel fee | Our classes | Where |');
P('|---|---|---|---|---|---|---|');
const ourIds = new Set(Object.values(CLASS).flatMap(c => [c.first, c.second]));
for (const d of dyes) {
  const ours = d.classes.filter(c => ourIds.has(c)).map(c => classNames[c]).join(', ');
  P(`| ${d.itemId} ${d.name} | ${d.label} | ${d.level} | ${d.wearCount}, ${d.wearFee} | ${d.cancelFee} | ${ours || '-'} | ${d.source.join('<br>')} |`);
}
P('');
P('## c) Crystals and gemstones');
P('');
P('Crystals come from crystallizing graded gear (needs the Crystallize skill; Dwarves get it), from spoiling, and from some drops. They are used for soulshots/spiritshots (crafting), Special Ability insertion, and as currency in exchanges.');
P('');
P('| Item | Where |');
P('|---|---|');
for (const c of crystals) P(`| ${c.name} (${c.id}) | ${c.source.join('<br>')} |`);
for (const g of gemstones) P(`| ${g.name} (${g.id}) | ${g.source.join('<br>')} |`);
P('');
P('Crystals you get from crystallizing gear, per grade (across all items of that grade):');
P('');
P('| Grade | Items | Min | Median | Max |');
P('|---|---|---|---|---|');
for (const [g, c] of Object.entries(crystallize)) P(`| ${g} | ${c.items} | ${c.min} | ${c.median} | ${c.max} |`);
P('');
P('## d) Soul crystals and Special Abilities (SA)');
P('');
P('**How it works (quest 350, Enhance Your Weapon):**');
P(`1. Talk to ${q350Npcs.map(n => `${n.name} (${n.town}, ${n.x}, ${n.y})`).join(' / ')} to start the quest and get a stage-0 Red, Green or Blue soul crystal.`);
P('2. Carry exactly **one** soul crystal. Use it on a listed monster when the monster is low on HP (the Soul Crystal skill 2096), then kill the monster.');
P('3. Each monster can raise a crystal only up to its `maxLevel`, with a chance. Absorb types:');
P('   - LAST_HIT: only the killer');
P('   - FULL_PARTY: everyone in the party who used a crystal');
P('   - PARTY_ONE_RANDOM / PARTY_RANDOM: random party members');
P('   Raid bosses usually use FULL_PARTY. A crystal can break on failure at higher stages.');
P('4. Take the weapon, the crystal at the required stage, gemstones and adena to a Blacksmith and exchange (multisell 1005 and others). Red, Green and Blue each give a different SA on the same weapon.');
P('');
P('### Where to level each stage');
P('');
P('| Stage | Monsters (chance, absorb type) | Raid bosses |');
P('|---|---|---|');
for (const s of stageGuide) P(`| ${s.from} → ${s.to} | ${s.mobs.join(', ') || '-'} | ${s.raids.join(', ') || '-'} |`);
P('');
P('### Blacksmiths (SA insertion and augmentation)');
P('');
P('| NPC | Town | x, y, z |');
P('|---|---|---|');
for (const r of refiners) P(`| ${r.name} ${r.title ? `(${r.title})` : ''} | ${r.town} | ${r.x}, ${r.y}, ${r.z} |`);
P('');
P('### Best SA per role');
P('');
for (const [role, byG] of Object.entries(saBest)) {
  P(`**${role}:**`);
  for (const [g, list] of Object.entries(byG)) if (list.length) P(`- ${g}: ` + list.map(x => `${x.weapon} → **${x.sa}** (${x.crystal}; ${x.cost})`).join('; '));
  P('');
}
P('### Every weapon with an SA');
P('');
P('| Weapon | Grade | Type | SA options (crystal → SA, cost) |');
P('|---|---|---|---|');
for (const w of saList) P(`| ${w.name} | ${w.grade} | ${w.type}${w.twoHand ? ' 2H' : ''}${w.magic ? ' magic' : ''} | ${w.options.map(o => `${o.crystal}: **${o.sa}** (${o.gemstones}, ${o.adena})`).join('<br>')} |`);
P('');
P('## e) Augmentation (life stones)');
P('');
P(`- ${augment.rules}`);
P(`- Gemstones per weapon: ${Object.entries(augment.gemstoneCost.weapon).map(([g, c]) => `${g} ${c}`).join(', ')}.`);
P(`- Gemstones per accessory: ${Object.entries(augment.gemstoneCost.accessory).map(([g, c]) => `${g} ${c}`).join(', ')}.`);
P(`- Chance of a skill: Normal ${augment.skillChance.Normal}%, Mid ${augment.skillChance.Mid}%, High ${augment.skillChance.High}%, Top ${augment.skillChance.Top}%. Accessory augments give stats only.`);
P(`- ${augment.colorChance}`);
P(`- Colours: ${augment.colors}.`);
P('- Done at a Blacksmith (the "Augment" link), see the table above.');
P('');
P('**What to aim for:**');
P('- **Tank (Tank1):** Reflect Damage (Passive, red), Shield or Magic Barrier (Passive, purple), Lesser Celestial Shield (Active, red) as an emergency button. Stat roll: CON or STR.');
P('- **Destroyers, Berserker (Destroyer1, Destroyer2, Doombringer1):** Might or Duel Might (Passive, purple), Focus or Guidance (Passive, red), Vampiric Rage (Active, red). Stat roll: STR.');
P('- **Soul Breaker (Inspector1):** Wild Magic (Passive, red) or Empower (Passive), with Focus (Passive) as the melee backup. Stat roll: INT.');
P('- **Necromancer (Necro1):** Empower (Passive), Wild Magic (Passive, red), Spell Clarity or Mana Gain (Passive, red). Stat roll: INT or MEN.');
P('- **Healers (Bishop1, Saint1):** Heal Empower (Passive), Mana Gain (Passive, red), Spell Clarity or Spell Refresh (red), Recharge (Active). Stat roll: MEN.');
P('- **Warcryer/Doomcryer (Chanter1):** Spell Clarity or Mana Gain (Passive). Chants are magic skills, so Music Clarity/Refresh does not help. Stat roll: MEN.');
P('- Accessory augments (necklace/earring/ring) give stats only on default settings (accessory skill chance 0%).');
P('');
P('### Life stones (top drops)');
P('');
P('| Life stone | Min level | Top drops |');
P('|---|---|---|');
for (const ls of lifeStones) P(`| ${ls.id} ${ls.name} | ${ls.playerLevel} | ${ls.topDrops.join(', ') || ls.shop || '-'} |`);
P('');
P('### Augment skills by colour');
P('');
for (const [c, list] of Object.entries(augment.skills)) P(`- **${c}** (${list.length}): ${list.slice(0, 60).join(', ')}${list.length > 60 ? ', …' : ''}`);
P('');
P('## f) Enchanting');
P('');
P('- **Safe enchant:** +3 on everything, +4 on full-body armor. Above that a normal scroll can destroy the item (it crystallizes); a **blessed** scroll resets it to +0 instead.');
P('- Success chances (default server values):');
for (const [g, r] of Object.entries(rateGroups)) P(`  - ${g}: ${r.join(', ')}`);
P('');
P('| Scroll | Grade | Where |');
P('|---|---|---|');
for (const s of scrolls) P(`| ${s.id} ${s.name} | ${s.grade} | ${s.source.join('<br>')} |`);
P('');
fs.writeFileSync(__ROOT + '/docs/plan/gear_systems.md', L.join('\n'));
console.log(`sets ${sets.length}, dyes ${dyes.length}, symbol makers ${symbolMakers.length}, SA weapons ${saList.length}, refiners ${refiners.length}, absorbers ${absorbers.length}, life stones ${lifeStones.length}, scrolls ${scrolls.length}`);
console.log(JSON.stringify(dyePlan.Tank1), JSON.stringify(dyePlan.Necro1));
