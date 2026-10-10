// Gear plan generator: node gear_plan.js  -> Scripts/data/gear_plan_h5.json + docs/plan/gear_tables.md
const __ROOT = require('path').resolve(__dirname, '..', '..', '..').replace(/\\/g, '/');   // install folder (portable, 2026-10-07)
// Sources: gear_db.json (from gear_db.js), spawns_h5.json, live_inventory.json.
const fs = require('fs');
const D = __ROOT + '/Scripts/data';
const db = JSON.parse(fs.readFileSync(`${D}/dp/gear_db.json`, 'utf8'));
const spawns = JSON.parse(fs.readFileSync(`${D}/spawns_h5.json`, 'utf8').replace(/^\uFEFF/, ''));
const npcPos = {};
for (const s of spawns) if (!npcPos[s.id]) npcPos[s.id] = s;

const TOWNS = { Gludio: [-14000, 123000], Gludin: [-80800, 151000], Dion: [15670, 142983], Giran: [83400, 147943], Oren: [82956, 53162], Aden: [146331, 25762], Heine: [111409, 219364], 'Hunters Village': [116819, 76994], Floran: [17144, 170156], 'Kamael Village': [-117251, 46771] };
const TOWN_ORDER = Object.keys(TOWNS);
const townOf = (id) => { const p = npcPos[id]; if (!p) return null; for (const [t, [x, y]] of Object.entries(TOWNS)) if (Math.hypot(p.x - x, p.y - y) < 6000) return t; return null; };

// ---------- where can each item be bought / exchanged in Gludio or Gludin ----------
const offers = {};   // itemId -> [{type, listId, npcId, npcName, town, x,y,z, price, ingredients}]
for (const b of db.buylists) {
  for (const n of b.npcs) {
    const town = townOf(n); if (!town) continue;
    const p = npcPos[n];
    for (const it of b.items) {
      const item = db.items[it.id]; if (!item) continue;
      (offers[it.id] = offers[it.id] || []).push({ type: 'buy', listId: b.id, npcId: n, npcName: p.name, town, x: p.x, y: p.y, z: p.z, price: it.price || +item.price || 0 });
    }
  }
}
for (const m of db.multisells) {
  for (const n of m.npcs) {
    const town = townOf(n); if (!town) continue;
    const p = npcPos[n];
    for (const e of m.entries) for (const pr of e.prod) {
      if (!db.items[pr.id]) continue;
      const adena = e.ing.filter(i => i.id === 57).reduce((a, i) => a + i.count, 0);
      const other = e.ing.filter(i => i.id !== 57);
      if (other.length) continue;                      // item-for-item exchanges are not shopping
      (offers[pr.id] = offers[pr.id] || []).push({ type: 'multisell', listId: m.id, npcId: n, npcName: p.name, town, x: p.x, y: p.y, z: p.z, price: adena, ingredients: other });
    }
  }
}
const cheapest = (id) => (offers[id] || []).slice().sort((a, b) => TOWN_ORDER.indexOf(a.town) - TOWN_ORDER.indexOf(b.town) || a.price - b.price)[0];

// ---------- roles ----------
const ROLES = {
  tank:       { armor: ['HEAVY'], alt: ['LIGHT'], shield: true, weapon: w => ['SWORD', 'BLUNT'].includes(w.weapon_type) && w.bodypart === 'rhand' && w.is_magic_weapon !== 'true', main: 'pAtk', armorStat: 'pDef', note: 'Heavy armor + shield + 1-handed sword/blunt. P.Def and shield first.' },
  fighter2h:  { armor: ['HEAVY'], alt: ['LIGHT'], shield: false, weapon: w => ['SWORD', 'BLUNT'].includes(w.weapon_type) && w.bodypart === 'lrhand' && w.is_magic_weapon !== 'true', main: 'pAtk', armorStat: 'pDef', note: 'Heavy armor, 2-handed sword or blunt. Weapon first.' },
  kamaelAS:   { armor: ['LIGHT'], alt: ['MAGIC'], shield: false, weapon: w => w.weapon_type === 'ANCIENTSWORD' || (w.weapon_type === 'SWORD' && w.is_magic_weapon !== 'true'), main: 'pAtk', armorStat: 'pDef', note: 'Kamael: no heavy armor, no shield. Ancient sword (Berserker). Weapon first.' },
  kamaelRapier: { armor: ['LIGHT'], alt: ['MAGIC'], shield: false, weapon: w => w.weapon_type === 'RAPIER' || (w.weapon_type === 'SWORD' && w.bodypart === 'rhand' && w.is_magic_weapon !== 'true'), main: 'pAtk', armorStat: 'pDef', note: 'Kamael: no heavy armor, no shield. Rapier (Soul Breaker). Weapon first.' },
  mage:       { armor: ['MAGIC'], alt: [], shield: false, weapon: w => w.is_magic_weapon === 'true' && w.weapon_type !== 'RAPIER' && w.weapon_type !== 'ANCIENTSWORD', main: 'mAtk', armorStat: 'pDef', note: 'Robe. Casting-speed set first, then the highest M.Atk weapon, then M.Def jewels.' },
};
const CHARS = {
  Tank1: 'tank', Bishop1: 'mage', Destroyer1: 'fighter2h', Destroyer2: 'fighter2h', Doombringer1: 'kamaelAS',
  Inspector1: 'kamaelRapier', Necro1: 'mage', Chanter1: 'mage', Saint1: 'mage',
};
const KAMAEL = new Set(['Doombringer1', 'Inspector1']);
const RACE = { Tank1: 'DARK_ELF', Bishop1: 'HUMAN', Destroyer1: 'ORC', Destroyer2: 'ORC', Doombringer1: 'KAMAEL', Inspector1: 'KAMAEL', Necro1: 'HUMAN', Chanter1: 'ORC', Saint1: 'DARK_ELF' };
const BANDS = { nograde: 'NONE', d: 'D', c: 'C' };
const grade = (i) => (i.crystal_type || 'NONE').toUpperCase();
const num = (v) => (typeof v === 'string' && v.startsWith('x')) ? 0 : (+v || 0);

// Usable items for a role at a grade, with an offer in Gludio/Gludin.
function candidates(role, band, slot, kamael, race) {
  const r = ROLES[role], g = BANDS[band];
  const out = [];
  for (const id of Object.keys(offers)) {
    const it = db.items[id];
    if (!it || grade(it) !== g) continue;
    if (/^Shadow Item|Fortune|limited|Event|Hero|Common Item|Augment/i.test(it.name)) continue;   // time-limited / academy-only
    if (it.cond && /categoryType|pledgeClass/.test(it.cond)) continue;          // pet-only / academy-only
    if (it.cond && /races="/.test(it.cond) && !new RegExp(race).test(/races="([^"]*)"/.exec(it.cond)[1])) continue;
    const bp = it.bodypart;
    const ok = (() => {
      switch (slot) {
        case 'weapon': return it.type === 'Weapon' && r.weapon(it);
        case 'chest': return it.type === 'Armor' && (bp === 'chest' || bp === 'onepiece' || bp === 'fullarmor') && [...r.armor].includes(it.armor_type);
        case 'legs': return it.type === 'Armor' && bp === 'legs' && [...r.armor].includes(it.armor_type);
        case 'head': return it.type === 'Armor' && bp === 'head';
        case 'gloves': return it.type === 'Armor' && bp === 'gloves';
        case 'feet': return it.type === 'Armor' && bp === 'feet';
        case 'shield': return r.shield && it.type === 'Armor' && bp === 'lhand' && !(it.armor_type === 'SIGIL');
        case 'neck': return bp === 'neck';
        case 'earring': return bp === 'rear;lear';
        case 'ring': return bp === 'rfinger;lfinger';
      }
      return false;
    })();
    if (!ok) continue;
    const o = cheapest(id);
    const stat = slot === 'weapon' ? num(it.stats[r.main]) : slot === 'shield' ? num(it.stats.sDef) : ['neck', 'earring', 'ring'].includes(slot) ? num(it.stats.mDef) : num(it.stats.pDef);
    out.push({ itemId: +id, name: it.name, stat, price: o.price, source: o, item: it });
  }
  return out.sort((a, b) => b.stat - a.stat || a.price - b.price);
}

// Best value pick: highest stat; ties -> cheaper.  'budget' pick: best stat per adena among the top half.
const CAP = {   // max adena per piece for the 'recommended' pick
  nograde: { weapon: 150000, armor: 40000, jewel: 30000 },
  d:       { weapon: 800000, armor: 250000, jewel: 120000 },
  c:       { weapon: 3000000, armor: 1200000, jewel: 500000 },
};
const capKind = (slot) => slot === 'weapon' ? 'weapon' : ['neck', 'earring', 'ring'].includes(slot) ? 'jewel' : 'armor';
function pick(list, band, slot) {
  if (!list.length) return null;
  const best = list[0];
  const cap = CAP[band][capKind(slot)];
  const within = list.filter(x => x.price > 0 && x.price <= cap);
  let rec = within[0] || list.slice().sort((a, b) => a.price - b.price)[0];
  const near = within.filter(x => x.stat >= rec.stat * 0.9).sort((a, b) => TOWN_ORDER.indexOf(a.source.town) - TOWN_ORDER.indexOf(b.source.town) || b.stat - a.stat);
  if (near.length) rec = near[0];                // prefer Gludio/Gludin when nearly as good
  return { best, budget: rec };
}

const SLOTS = ['weapon', 'chest', 'legs', 'head', 'gloves', 'feet', 'shield', 'neck', 'earring', 'ring'];
const COUNT = { earring: 2, ring: 2 };
const PRIORITY = {
  tank: ['shield', 'chest', 'legs', 'weapon', 'head', 'gloves', 'feet', 'neck', 'earring', 'ring'],
  fighter2h: ['weapon', 'chest', 'legs', 'head', 'gloves', 'feet', 'neck', 'earring', 'ring'],
  kamaelAS: ['weapon', 'chest', 'legs', 'head', 'gloves', 'feet', 'neck', 'earring', 'ring'],
  kamaelRapier: ['weapon', 'chest', 'legs', 'head', 'gloves', 'feet', 'neck', 'earring', 'ring'],
  mage: ['set', 'weapon', 'neck', 'earring', 'ring', 'gloves', 'feet'],
};

// Sets whose every piece is buyable in Gludio/Gludin at a grade, usable by the role.
function townSets(role, band) {
  const r = ROLES[role], g = BANDS[band];
  return db.sets.filter(s => (s.grade || 'NONE').toUpperCase() === g && r.armor.includes(s.armorType) && !/Shadow|Fortune/.test(s.name))
    .map(s => {
      const pieces = Object.entries(s.pieces).filter(([slot]) => slot !== 'shield' || r.shield).map(([slot, ids]) => {
        const id = ids.find(i => offers[i]) || ids[0];
        const o = cheapest(id);
        return { slot, itemId: id, name: (db.items[id] || {}).name, price: o ? o.price : null, source: o || null };
      });
      const allBuyable = pieces.every(p => p.source);
      return { setId: s.id, name: s.name, armorType: s.armorType, grade: g, pieces, allBuyable, cost: pieces.reduce((a, p) => a + (p.price || 0), 0),
               bonus: s.skills.map(k => `${k.name}: ${k.effects.join(', ')}`).filter(t => !/^Equip Set Items/.test(t)) };
    });
}

const plan = { generated: new Date().toISOString(), note: 'L2J H5 defaults; verify prices live on L2Toggle.', towns: TOWNS, chars: {}, sets: [], eligibility: {} };
const md = [];
for (const [name, role] of Object.entries(CHARS)) {
  const kamael = KAMAEL.has(name);
  const c = { role, roleNote: ROLES[role].note, bands: {}, priority: PRIORITY[role] };
  md.push(`\n### ${name} (${role})`);
  for (const band of Object.keys(BANDS)) {
    const slots = {};
    let total = 0, budgetTotal = 0;
    for (const slot of SLOTS) {
      if (slot === 'shield' && !ROLES[role].shield) continue;
      const p = pick(candidates(role, band, slot, kamael, RACE[name]), band, slot);
      if (!p) continue;
      const n = COUNT[slot] || 1;
      const view = (x) => ({ itemId: x.itemId, name: x.name, stat: x.stat, price: x.price, count: n,
        source: { type: x.source.type, npcId: x.source.npcId, npcName: x.source.npcName, town: x.source.town, x: x.source.x, y: x.source.y, z: x.source.z, listId: x.source.listId, ingredients: x.source.ingredients } });
      slots[slot] = { best: view(p.best), budget: view(p.budget) };
      total += p.best.price * n; budgetTotal += p.budget.price * n;
    }
    const sets = townSets(role, band).filter(s => s.allBuyable);
    c.bands[band] = { slots, sets, bestTotal: total, budgetTotal };
    md.push(`- **${band}** best ≈ ${total.toLocaleString('en')} a, recommended ≈ ${budgetTotal.toLocaleString('en')} a` +
      (sets.length ? ` | town sets: ${sets.map(s => `${s.name} (${s.cost.toLocaleString('en')} a; ${s.bonus.join('; ') || 'no bonus'})`).join(' / ')}` : ''));
    for (const [slot, v] of Object.entries(slots)) md.push(`  - ${slot}: best **${v.best.name}** (${v.best.stat}, ${v.best.price} a, ${v.best.source.npcName}/${v.best.source.town}${v.best.source.type === 'multisell' ? ' multisell ' + v.best.source.listId : ''}) · **recommended** ${v.budget.name} (${v.budget.stat}, ${v.budget.price} a, ${v.budget.source.npcName}/${v.budget.source.town})`);
  }
  plan.chars[name] = c;
}
for (const s of db.sets) if (['NONE', 'D', 'C'].includes((s.grade || 'NONE').toUpperCase()) && !/Fortune/.test(s.name)) {
  plan.sets.push({ id: s.id, name: s.name, grade: (s.grade || 'NONE').toUpperCase(), armorType: s.armorType, pieces: s.pieces,
    bonus: s.skills.map(k => `${k.name}: ${k.effects.join(', ')}`).filter(t => !/^Equip Set Items/.test(t)),
    shieldBonus: s.shieldSkill ? `${s.shieldSkill.name}: ${s.shieldSkill.effects.join(', ')}` : null });
}
for (const [role, r] of Object.entries(ROLES)) {
  plan.eligibility[role] = { armor: r.armor.concat(r.alt.map(a => a + ' (fallback)')), shield: r.shield, weaponRule: r.weapon.toString(), mainStat: r.main, note: r.note };
}
// ---------- Starter kit: what each character can buy NOW (budget = live adena, keep 3k reserve) ----------
let live = {};
try { live = JSON.parse(fs.readFileSync(`${D}/dp/live_inventory.json`, 'utf8').replace(/^﻿/, '')); } catch (e) { }
// Buy queue = No-grade "recommended" pick per slot in priority order (script buys the next one when it can
// afford it; it never skips ahead, so casters save for the Devotion set). Owned/better items are skipped.
md.push('\n## No-grade buy queue (buy in this order; "now" = affordable with current adena, 3k reserve)');
const statOf = (it, role, slot) => !it ? 0 : slot === 'weapon' ? num(it.stats[ROLES[role].main]) : slot === 'shield' ? num(it.stats.sDef)
  : ['neck', 'earring', 'ring'].includes(slot) ? num(it.stats.mDef) : num(it.stats.pDef);
const slotOf = (it) => {
  if (!it) return null;
  const bp = it.bodypart;
  if (it.type === 'Weapon') return 'weapon';
  return { chest: 'chest', onepiece: 'chest', fullarmor: 'chest', legs: 'legs', head: 'head', gloves: 'gloves', feet: 'feet', lhand: 'shield', neck: 'neck', 'rear;lear': 'earring', 'rfinger;lfinger': 'ring' }[bp] || null;
};
for (const [name, role] of Object.entries(CHARS)) {
  const inv = live[name] || [];
  const adena = (inv.find(i => i.item_id === 57) || {}).count || 0;
  let budget = Math.max(0, adena - 3000);
  // best owned item per slot (equipped or in the bag) that the role may use
  const ownedBest = {}, equip = [];
  for (const i of inv) {
    const it = db.items[i.item_id]; const slot = slotOf(it); if (!slot) continue;
    if (slot === 'weapon' && !ROLES[role].weapon(it)) continue;
    if (slot === 'shield' && !ROLES[role].shield) continue;
    if (['chest', 'legs'].includes(slot) && it.armor_type && !ROLES[role].armor.concat(ROLES[role].alt).includes(it.armor_type)) continue;
    const st = statOf(it, role, slot);
    if (!ownedBest[slot] || st > ownedBest[slot].stat) ownedBest[slot] = { itemId: i.item_id, name: it.name, stat: st, equipped: i.is_equipped };
  }
  for (const [slot, o] of Object.entries(ownedBest)) if (!o.equipped) equip.push(`${slot}: equip ${o.name} from the bag`);
  const queue = [];
  const prio = role === 'mage' ? ['set', 'weapon', 'neck', 'earring', 'ring', 'gloves', 'feet'] : PRIORITY[role];
  let blocked = false;
  for (const slot of prio) {
    let entry;
    if (slot === 'set') {
      const devo = townSets(role, 'nograde').find(s => /Devotion/.test(s.name) && s.allBuyable);
      if (!devo) continue;
      entry = { slot: 'set', name: 'Devotion set (Tunic + Stockings + Leather Helmet), +15% casting speed', price: devo.cost,
        items: devo.pieces.map(p => ({ itemId: p.itemId, name: p.name, price: p.price, npcId: p.source.npcId, npc: p.source.npcName, town: p.source.town })) };
    } else {
      const p = pick(candidates(role, 'nograde', slot, KAMAEL.has(name), RACE[name]), 'nograde', slot);
      if (!p) continue;
      const rec = p.budget; const n = COUNT[slot] || 1;
      if (ownedBest[slot] && ownedBest[slot].stat >= rec.stat) continue;          // already have as good
      entry = { slot, itemId: rec.itemId, name: rec.name, count: n, price: rec.price * n, npcId: rec.source.npcId, npc: rec.source.npcName, town: rec.source.town };
    }
    entry.now = !blocked && entry.price <= budget;
    if (entry.now) budget -= entry.price; else blocked = true;                    // never skip ahead
    queue.push(entry);
  }
  plan.chars[name].starter = { adena, equipFromBag: equip, queue };
  md.push(`- **${name}** (${adena} a)` + (equip.length ? ` — ${equip.join('; ')}` : '') + `\n  ` +
    queue.map(q => `${q.now ? '✅' : '⏳'} ${q.slot}: ${q.name}${q.count > 1 ? ' x' + q.count : ''} ${q.price.toLocaleString('en')} a${q.town ? ' (' + q.npc + '/' + q.town + ')' : ''}`).join(' → '));
}

// ---------- Upgrade (trade-in) multisell 003: old item + adena -> next item, at regular merchants ----------
const up = db.multisells.find(m => m.id === '003');
if (up) plan.tradeIn = { listId: '003', note: 'Hand in the old item + adena for the next item (cheaper than buying new).',
  npcs: up.npcs.filter(n => townOf(n)).map(n => ({ npcId: n, name: npcPos[n].name, town: townOf(n) })),
  entries: up.entries.map(e => ({ get: e.prod.map(p => ({ id: p.id, name: (db.items[p.id] || {}).name })), give: e.ing.map(i => ({ id: i.id, count: i.count, name: i.id === 57 ? 'Adena' : (db.items[i.id] || {}).name })) })) };

// ---------- Shadow D coupon (8869): 1 coupon -> 1 Shadow weapon, at class masters ----------
const COUPON = 8869;
const couponLists = db.multisells.filter(m => m.entries.some(e => e.ing.some(i => i.id === COUPON)));
plan.coupon = { itemId: COUPON, name: 'Shadow Item Exchange Coupon (D-Grade)', lists: couponLists.map(m => ({
  listId: m.id,
  npcs: m.npcs.filter(n => townOf(n)).map(n => ({ npcId: n, name: npcPos[n].name, town: townOf(n), x: npcPos[n].x, y: npcPos[n].y, z: npcPos[n].z })),
  items: m.entries.filter(e => e.ing.some(i => i.id === COUPON)).map(e => {
    const it = db.items[e.prod[0].id] || {};
    return { itemId: e.prod[0].id, name: it.name, grade: it.crystal_type, weaponType: it.weapon_type, bodypart: it.bodypart,
             pAtk: +(it.stats || {}).pAtk || 0, mAtk: +(it.stats || {}).mAtk || 0, magic: it.is_magic_weapon === 'true',
             durationMin: it.duration ? +it.duration : null, coupons: e.ing.find(i => i.id === COUPON).count };
  }),
})) };
plan.couponPick = {};
md.push('\n## Shadow D coupon pick (1x 8869 each)');
for (const [name, role] of Object.entries(CHARS)) {
  const key = ROLES[role].main;
  const ok = plan.coupon.lists.flatMap(l => l.items).filter(i => i.grade === 'D' && ROLES[role].weapon(db.items[i.itemId] || {}))
    .sort((a, b) => b[key] - a[key]);
  plan.couponPick[name] = ok[0] || null;
  md.push(`- ${name}: ${ok[0] ? `${ok[0].name} (${key} ${ok[0][key]}, ${ok[0].durationMin} min)` : 'none fits'}`);
}
fs.writeFileSync(`${D}/gear_plan_h5.json`, JSON.stringify(plan, null, 1));
fs.writeFileSync(__ROOT + '/docs/plan/gear_tables.md', '# Generated gear tables (gear_plan.js)\n' + md.join('\n') + '\n');
console.log(md.join('\n'));
