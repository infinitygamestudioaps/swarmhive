// Builds Scripts/data/gear_items.json (compact item table for swarm.js's gear module)
const __ROOT = require('path').resolve(__dirname, '..', '..', '..').replace(/\\/g, '/');   // install folder (portable, 2026-10-07)
// from Scripts/data/dp/gear_db.json. Run: node gear_items.js
const fs = require('fs');
const src = __ROOT + '/Scripts/data/dp/gear_db.json';
const out = __ROOT + '/Scripts/data/gear_items.json';
const db = JSON.parse(fs.readFileSync(src, 'utf8').replace(/^\uFEFF/, ''));

const slotMap = {
  rhand: 'weapon', lrhand: 'weapon', lhand: 'shield', chest: 'chest', fullarmor: 'chest', onepiece: 'chest',
  legs: 'legs', head: 'head', gloves: 'gloves', feet: 'feet', neck: 'neck',
  rear: 'earring', lear: 'earring', 'rear;lear': 'earring', rfinger: 'ring', lfinger: 'ring', 'rfinger;lfinger': 'ring',
};
const num = v => Number(v) || 0;
const items = {};
for (const [id, it] of Object.entries(db.items)) {
  if (it.type !== 'Weapon' && it.type !== 'Armor') continue;
  const slot = slotMap[it.bodypart];
  if (!slot) continue;
  const s = it.stats || {};
  const races = /races="([^"]+)"/.exec(it.cond || '');
  items[id] = {
    n: it.name, s: slot, full: (it.bodypart === 'fullarmor' || it.bodypart === 'onepiece') ? 1 : 0, two: it.bodypart === 'lrhand' ? 1 : 0,
    g: (it.crystal_type || 'NONE').toUpperCase(),
    t: it.weapon_type || it.armor_type || '',
    mw: it.is_magic_weapon === 'true' ? 1 : 0,
    pa: num(s.pAtk), ma: num(s.mAtk), pd: num(s.pDef), md: num(s.mDef), sd: num(s.sDef), mp: num(s.maxMp),
    r: races ? races[1] : '',
    p: num(it.price),
    cw: num(it.change_weaponId),            // Kamael "Change Weapon" (skill 1473) twin: sword <-> rapier / ancient sword, bow <-> crossbow
  };
}

// Armor sets with a casting-speed bonus (casters want these first).
const castSets = [];
for (const set of db.sets) {
  const effects = (set.skills || []).flatMap(k => k.effects || []).join(' ');
  if (!/mAtkSpd|castSpd|MAtkSpd/i.test(effects)) continue;
  const pieces = set.pieces || {};
  castSets.push({
    name: set.name, grade: set.grade, effects,
    chest: pieces.chest || [], legs: pieces.legs || [], head: pieces.head || [],
    gloves: pieces.gloves || [], feet: pieces.feet || [],
  });
}

// Every armor set (not the limited-period "of Fortune" copies): the gear upgrade buys a caster's whole set by name (Devotion, Karmian, Demon's).
const sets = db.sets.filter(t => !/Fortune|PvP/.test(t.name)).map(t => ({ name: t.name, grade: t.grade, pieces: t.pieces || {} }));

fs.writeFileSync(out, JSON.stringify({ items, castSets, sets }));
console.log(`items: ${Object.keys(items).length}, casting-speed sets: ${castSets.length}, sets: ${sets.length}`);
console.log(castSets.slice(0, 6).map(s => `${s.grade} ${s.name}: ${s.effects}`).join('\n'));
