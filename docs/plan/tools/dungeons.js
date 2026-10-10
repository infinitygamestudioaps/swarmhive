// Writes Scripts/data/dungeons_h5.json. Source: L2J High Five datapack (instances/*.java + data/instances/*.xml,
const __ROOT = require('path').resolve(__dirname, '..', '..', '..').replace(/\\/g, '/');   // install folder (portable, 2026-10-07)
// quests Q128/Q129/Q179, multisell 324840001) plus retail High Five knowledge where marked src:'knowledge'.
// Run: node dungeons.js
const fs = require('fs');

const kamaLevels = [23, 26, 29, 33, 36, 39, 43, 46, 49, 53, 56, 59, 63, 66, 69, 73, 78, 81, 83];
const kamaParty = [6, 6, 9, 6, 6, 9, 6, 6, 9, 6, 6, 9, 6, 6, 9, 6, 9, 9, 9];
const kamaMin = [30, 30, 45, 30, 30, 45, 30, 30, 45, 30, 30, 45, 30, 30, 45, 30, 45, 45, 45];
const kamaBoss = [
  ['Tomlan Kamos', 23], ['Ol Ariosh', 26], ['Lost Captain', 29], ['Crimson Hatu Otis', 33], ['Seer Flouros', 36],
  ['Lost Captain', 39], ['Blade Otis', 43], ['Weird Bunei', 46], ['Lost Captain', 49], ['Kaim Abigore', 53],
  ['Knight Montagnar', 56], ['Lost Captain', 59], ['Venomous Storace', 63], ['Kel Bilette', 66], ['Lost Captain', 69],
  ['White Allosce', 73], ['Lost Captain', 78], ['Lost Captain', 81], ['Lost Captain', 83]];
const kamaDrops = {
  23: 'Enchant Weapon/Armor D, Bronze/Piece Bone armor + fragments',
  26: 'Cursed Tunic/Stockings (robe), Enchant Weapon/Armor D',
  29: 'Blessed Enchant Armor D x3-9, Reinforced Long Bow, Manticore Skin Shirt + parts',
  33: 'Reinforced Leather / Knowledge gloves+boots, Enchant Weapon/Armor D',
  36: 'Hoplon, Helmet, Enchant Weapon/Armor D',
  39: 'Karmian Tunic (casting-speed set!), Flamberge/Stormbringer, Blessed Enchant Armor C, Greater STR dyes',
  43: 'Plate Gaiters, Half Plate Armor, Enchant Weapon/Armor C',
  46: 'Crystallized Ice Bow + shafts, Enchant Weapon/Armor C',
  49: "Nassen's Earring, Necklace/Ring of Seal + parts, Eminence Bow, Greater INT/MEN dyes, Blessed Enchant Weapon C",
  53: 'Great Pata + blades, Enchant Weapon/Armor B',
  56: "Zubei's/Avadon armor parts, Enchant Weapon/Armor B",
  59: 'Black Ore jewelry + parts, Greater DEX/CON dyes, Blessed Enchant Armor B',
  63: 'Blue Wolf / Doom stocking + tunic patterns, Enchant Armor A',
  66: 'Sealed Doom/Blue Wolf boots+gloves + parts, Enchant Armor A',
  69: 'Soul Bow, Sealed Nightmare/Majestic robe + fabric, Enchant Armor A, Blessed Enchant Weapon A',
  73: 'Sealed Phoenix ring/earring + gemstones, Enchant Armor A',
  78: 'Sealed Draconic Leather Armor + parts, Draconic Bow, Enchant Armor S',
  81: 'Demon Splinter, Sealed Imperial Crusader shield/helmet, Sealed Draconic helmet, Major Arcana circlet, Enchant Armor S',
  83: 'Icarus Trident (100%), Sealed Moirai ring/earring/necklace, Enchant Armor S',
};
const captains = [
  { town: 'Gludio', npcId: 30332, npc: 'Captain Bathis', x: -13900, y: 123822, z: -3112, idx: [0, 1, 2] },
  { town: 'Dion', npcId: 30071, npc: 'Captain Lucas', x: 18199, y: 146081, z: -3080, idx: [3, 4, 5] },
  { town: 'Heine', npcId: 30916, npc: 'Captain Gosta', x: 108384, y: 221563, z: -3592, idx: [6, 7, 8] },
  { town: 'Oren', npcId: 30196, npc: 'Captain Mouen', x: 81023, y: 56456, z: -1552, idx: [9, 10, 11] },
  { town: 'Schuttgart', npcId: 31981, npc: 'Captain Vishotsky', x: 85865, y: -142153, z: -1342, idx: [12, 13, 14] },
  { town: 'Rune', npcId: 31340, npc: 'Captain Mathias', x: 42596, y: -47988, z: -800, idx: [15, 16, 17, 18] },
];
const kamaloka = kamaLevels.map((lvl, i) => {
  const c = captains.find(c => c.idx.includes(i));
  const lab = kamaParty[i] === 9;
  return {
    id: `kamaloka-${lvl}`, name: `Kamaloka, ${lab ? 'Labyrinth' : 'Hall'} of the Abyss (level ${lvl})`, type: 'instance',
    levelMin: lvl - 5, levelMax: lvl + 5, partyMin: 2, partyMax: kamaParty[i], durationMin: kamaMin[i],
    reenter: 'once per day per Kamaloka, resets 06:30 server time', leaderEnters: true,
    entry: { npcId: c.npcId, npc: c.npc, town: c.town, x: c.x, y: c.y, z: c.z, bypass: `Quest Kamaloka ${i}`, itemNeeded: null },
    removesBuffs: 'ALL except newbie-guide buffs (4322-4331, 5632, 5637, 5950): Community Board buffs are LOST on enter',
    boss: { name: kamaBoss[i][0], level: kamaBoss[i][1], raid: kamaBoss[i][0] === 'Lost Captain' },
    rewards: kamaDrops[lvl] + (lab ? '; Labyrinth: Essence of Kamaloka (13002) by party rank (src: knowledge)' : ''),
    exchange: 'Pathfinder Worker (32484, Gludio -13948,123819 / Dion 18228,146030 ...): Essence of Kamaloka 10/20/50/100/200 -> Pathfinder\'s Reward D/C/B/A/S box; 300 -> Bronze/Silver/Gold Kamaloka Circlet',
    nineManOk: lab, src: 'datapack Kamaloka.java + 3xxxx.htm + npc drops',
  };
});

const others = [
  { id: 'nornils-garden', name: "Nornil's Garden", type: 'instance', levelMin: 18, levelMax: 22, partyMin: 2, partyMax: 9,
    entry: { npcId: 32330, npc: 'Garden Guard', town: 'Kamael territory (Nornil\'s Cave)', x: -84728, y: 60089, z: -2576 },
    requirement: 'Party leader enters; party must include a KAMAEL; all members level 18-22. Kamael base-class quest 179 "Into the Large Cavern" (needs 178 Iconic Trinity, level 17-21, 1st class not yet taken) runs here.',
    reenter: 'no daily lock in datapack', durationMin: 70, removesBuffs: 'ALL',
    rewards: 'Q179 for each Kamael: Puma Skin Shirt + Gaiters, 2x Red Crescent Earring, 2x Ring of Devotion, Necklace of Devotion. Herbs, exp.',
    nineManOk: true, src: 'datapack NornilsGarden.java, Q00179' },
  { id: 'pailaka-128', name: 'Pailaka - Song of Ice and Fire (quest 128)', type: 'solo instance', levelMin: 36, levelMax: 42, partyMin: 1, partyMax: 1,
    entry: { npcId: 32497, npc: 'Inspector Adler', town: 'Gludin', x: -80570, y: 151298, z: -3040 },
    reenter: 'one-time quest per character', durationMin: 60,
    rewards: '810,000 exp + 50,000 SP, Pailaka Ring (13294) + Pailaka Earring (13293); Sword of Ice and Fire during the quest',
    nineManOk: false, src: 'datapack Q00128' },
  { id: 'pailaka-129', name: "Pailaka - Devil's Legacy (quest 129)", type: 'solo instance', levelMin: 61, levelMax: 67, partyMin: 1, partyMax: 1,
    entry: { npcId: 32498, npc: "Devil's Isle Survivor", town: 'Giran', x: 85104, y: 147616, z: -3400 },
    reenter: 'one-time quest per character', durationMin: 90,
    rewards: '10,800,000 exp + 950,000 SP, Pailaka Bracelet (13295), Scroll of Escape',
    nineManOk: false, src: 'datapack Q00129' },
  { id: 'pailaka-144', name: 'Pailaka - Injured Dragon (quest 144)', type: 'solo instance', levelMin: 73, levelMax: 77, partyMin: 1, partyMax: 1,
    entry: { npc: 'Ketra/Varka border (Hunter\'s Village area)', town: 'Hunters Village' },
    reenter: 'one-time', rewards: 'Big exp + Pailaka Shirt (13296)', nineManOk: false,
    src: 'knowledge (not in this datapack; check on L2Toggle)' },
  { id: 'dimensional-rift', name: 'Dimensional Rift', type: 'party zone (rooms)', levelMin: 20, levelMax: 85, partyMin: 2, partyMax: 9,
    entry: { npc: 'Oracle of Dawn/Dusk -> Dimensional Rift (ziggurat) in the Seven Signs oracle area', town: 'any town Priest/Oracle' },
    requirement: 'Dimensional Fragments (7079) per member: Recruit 20-29 (18), Soldier 30-39 (21), Officer 40-49 (24), Captain 50-59 (27), Commander 60-69 (30), Hero 70+ (33). Fragments drop from quest 634 (any monster level 20+).',
    reenter: 'unlimited (paid per run in fragments)', durationMin: 30,
    rewards: 'Good group exp; Anakazel raid in the Hero rift; 4th room can lead to Delusion Chamber at 80+',
    nineManOk: true, src: 'knowledge + datapack Rift.java/ziggurat_rift.htm (core config not in datapack)' },
  { id: 'catacombs', name: 'Seven Signs Catacombs & Necropolises', type: 'field dungeons', levelMin: 20, levelMax: 80, partyMin: 1, partyMax: 9,
    entry: { npc: 'Gatekeeper Ziggurat (31114-31121) at each entrance', town: 'see leveling_spots.md' },
    requirement: 'Seven Signs: register with Priest of Dawn/Dusk in any town (free) during competition; in seal-validation week only the winning side may enter',
    levels: { 'Necropolis of Sacrifice': '20-30', 'Catacomb of the Heretic': '30-40', "Pilgrim's Necropolis": '40-50', 'Catacomb of the Branded': '40-50',
      'Necropolis of Worship': '50-60', 'Catacomb of Apostate': '50-60', "Patriot's Necropolis": '60-70', 'Catacomb of the Witch': '60-70',
      'Necropolis of Devotion': '70-80', 'Necropolis of Martyrdom': '70-80', "Saint's Necropolis": '70-80', "Disciple's Necropolis": '70-80',
      'Catacomb of Dark Omens': '70-80', 'Catacomb of the Forbidden Path': '70-80' },
    reenter: 'open field, no lock',
    rewards: 'Dense mobs (great exp), Seal Stones -> Ancient Adena (5575) at Priest of Dawn/Dusk -> Merchant/Blacksmith of Mammon: SA (Special Ability) crystals, Life Stones, A/S weapon upgrades, Ancient Adena -> adena 1:1',
    nineManOk: true, src: 'knowledge + datapack multisell 311132501/31126xxxx/500' },
  { id: 'crystal-caverns', name: 'Crystal Caverns (Baylor)', type: 'instance', levelMin: 78, levelMax: 85, partyMin: 2, partyMax: 27,
    reenter: '24h after enter', durationMin: 90, rewards: 'Clear/Blue/Red crystals, Seed of Evil shards, Baylor drops (Soul Crystal stage), Cavern bosses', nineManOk: true, src: 'datapack CrystalCaverns' },
  { id: 'dark-cloud-mansion', name: 'Dark Cloud Mansion', type: 'instance', levelMin: 78, levelMax: 85, partyMin: 2, partyMax: 9,
    reenter: 'per entry', durationMin: 30, rewards: 'Puzzle instance tied to Crystal Caverns/Soul Crystal progression', nineManOk: true, src: 'datapack DarkCloudMansion (lvl 78 check)' },
  { id: 'chambers-of-delusion', name: 'Chambers of Delusion (East/West/South/North/Great/Tower)', type: 'instance', levelMin: 80, levelMax: 85, partyMin: 2, partyMax: 9,
    entry: { npc: 'Guardian of the Seal (32658-32663) in the Delusion hall; reached via Dimensional Rift gatekeepers (DelusionTeleport)', x: -114597, y: -152501, z: -6750 },
    reenter: 'daily, 06:30', durationMin: 40, rewards: 'Aenkinel raid + treasure boxes: Enria, Asofe, Thons, Leonard (A/S craft + attribute materials)', nineManOk: true, src: 'datapack Chamber.java' },
  { id: 'seed-of-destruction', name: 'Seed of Destruction', type: 'instance (command channel)', levelMin: 75, levelMax: 85, partyMin: 18, partyMax: 45,
    reenter: 'Wed + Sat 06:30', rewards: 'Tiat; S80 Vesper/Dynasty material quests', nineManOk: false, src: 'datapack SeedOfDestructionStage1.xml' },
  { id: 'hall-of-suffering', name: 'Seed of Infinity - Hall of Suffering', type: 'instance', levelMin: 75, levelMax: 85, partyMin: 2, partyMax: 9,
    reenter: 'daily 06:30', rewards: 'Exp, Soul Crystal stages, quest 692/693 items', nineManOk: true, src: 'datapack HallOfSuffering.xml' },
  { id: 'monastery-den-of-evil', name: 'Monastery of Silence / Den of Evil / Forge of the Gods / Primeval Isle', type: 'field zones', levelMin: 76, levelMax: 85, partyMin: 1, partyMax: 9,
    reenter: 'open field', rewards: 'Best 80+ party exp; Den of Evil Kasha eye (+exp buff); Primeval Isle quest 642 (Ancient Eggs)', nineManOk: true, src: 'datapack ai/group_template + knowledge' },
];

fs.writeFileSync(__ROOT + '/Scripts/data/dungeons_h5.json', JSON.stringify({ generated: new Date().toISOString(), kamaloka, others }, null, 1));
console.log(`kamaloka ${kamaloka.length}, others ${others.length}`);
