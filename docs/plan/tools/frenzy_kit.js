// FRENZY KIT (owner 2026-10-14: "a full overview for a destroyer, showing what it is missing in order to do the frenzy with item changing"):
// builds Scripts/data/frenzy_kit.json from Scripts/data/gear_items.json (datapack names WITH the SA: "Homunkulus's Sword - Conversion").
// The game client / L2Swarm name SA weapons WITHOUT the SA ("Homunkulus's Sword") and the gloves / boots without " - Heavy Armor", so the bots
// match by ITEM ID (swarm.js hpSwap reads this file). Slots: low (Max HP down first: Conversion weapon + Tallum heavy), high (Max HP up: Health
// weapon + Doom heavy), btb (optional, not used by the bots: Blessed Body weapon). Each slot lists every fitting id, cheapest first.
//   node docs/plan/tools/frenzy_kit.js
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const G = JSON.parse(fs.readFileSync(path.join(ROOT, 'Scripts', 'data', 'gear_items.json'), 'utf8')), IT = G.items || G;
const bad = (n) => /\{PvP\}|^Common Item|limited period|of Friendship|of Fortune|Commendation|\(Event\)|Light Armor|Robe|Shadow Item/i.test(n);
const pick = (test) => Object.keys(IT).filter(id => { const v = IT[id]; return v && v.n && !bad(v.n) && test(v.n, v); })
  .map(id => ({ id: Number(id), name: IT[id].n, grade: IT[id].g || '', price: Number(IT[id].p) || 0, two: !!IT[id].two, type: IT[id].t || '' }))
  .sort((a, b) => (a.price || 9e12) - (b.price || 9e12) || a.id - b.id);
const exact = (names) => (n) => names.includes(n);
const SLOTS = [
  { key: 'low.weapon', set: 'low', slot: 'weapon', label: 'Weapon with SA: Conversion', why: 'lowers Max HP (HP becomes MP)', ids: pick((n, v) => v.s === 'weapon' && / - Conversion$/.test(n)) },
  { key: 'low.armor', set: 'low', slot: 'armor', label: 'Tallum Plate Armor', why: 'Tallum heavy set (low-HP set)', ids: pick(exact(['Tallum Plate Armor'])) },
  { key: 'low.helmet', set: 'low', slot: 'helmet', label: 'Tallum Helmet (heavy)', why: 'Tallum heavy set', ids: pick(exact(['Tallum Helm', 'Tallum Helmet - Heavy Armor'])) },
  { key: 'low.gloves', set: 'low', slot: 'gloves', label: 'Tallum Gloves (heavy)', why: 'Tallum heavy set', ids: pick(exact(['Tallum Gloves', 'Tallum Gloves - Heavy Armor'])) },
  { key: 'low.boots', set: 'low', slot: 'boots', label: 'Tallum Boots (heavy)', why: 'Tallum heavy set', ids: pick(exact(['Tallum Boots - Heavy Armor'])) },
  { key: 'high.weapon', set: 'high', slot: 'weapon', label: 'Weapon with SA: Health', why: 'raises Max HP by 25 % (current HP stays: the % drops)', ids: pick((n, v) => v.s === 'weapon' && / - Health$/.test(n)) },
  { key: 'high.armor', set: 'high', slot: 'armor', label: 'Doom Plate Armor', why: 'Doom heavy set (high-HP set)', ids: pick(exact(['Doom Plate Armor'])) },
  { key: 'high.helmet', set: 'high', slot: 'helmet', label: 'Doom Helmet (heavy)', why: 'Doom heavy set', ids: pick(exact(['Doom Helmet', 'Doom Helmet - Heavy Armor'])) },
  { key: 'high.gloves', set: 'high', slot: 'gloves', label: 'Doom Gloves (heavy)', why: 'Doom heavy set', ids: pick(exact(['Doom Gloves - Heavy Armor'])) },
  { key: 'high.boots', set: 'high', slot: 'boots', label: 'Doom Boots (heavy)', why: 'Doom heavy set', ids: pick(exact(['Doom Boots - Heavy Armor'])) },
  { key: 'btb.weapon', set: 'btb', slot: 'weapon', label: 'Weapon with SA: Blessed Body', why: 'optional — NOT used by the bots (its effect only triggers by chance)', ids: pick((n, v) => v.s === 'weapon' && / - Blessed Body$/.test(n)) },
];
const out = {
  _about: 'FRENZY KIT (docs/plan/tools/frenzy_kit.js, from gear_items.json): the destroyer HP-swap gear by item id. swarm.js hpSwap: low set on, then high set on (Max HP up, current HP stays -> the % drops), Frenzy & co., then the old gear back. The dashboard character page shows what each destroyer has / lacks. Do not edit by hand: run the tool.',
  generated: new Date().toISOString(),
  skills: ['Zealot', 'Frenzy', 'Guts', 'Rage', 'Battle Roar'],
  classes: 'Destroyer|Titan|Orc Raider',
  slots: SLOTS,
};
fs.writeFileSync(path.join(ROOT, 'Scripts', 'data', 'frenzy_kit.json'), JSON.stringify(out, null, 1));
SLOTS.forEach(s => console.log(`${s.key.padEnd(12)} ${String(s.ids.length).padStart(3)} items  cheapest: ${s.ids[0] ? s.ids[0].name + ' (' + s.ids[0].grade + ', ' + s.ids[0].price + ')' : '-'}`));
