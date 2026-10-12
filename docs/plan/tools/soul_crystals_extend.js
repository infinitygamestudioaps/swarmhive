// SOUL CRYSTALS: EXTEND THE DATA (2026-10-12, workflow topic "soulcrystal"; forum topic 503 + the L2J High Five datapack).
//   node docs/plan/tools/soul_crystals_extend.js [--dry]
// Adds to Scripts/data/soul_crystals.json (backup first, atomic tmp + rename; the bots read only items / itemsAbove13 / monsters /
// raidBosses, the new keys are small):
//   itemsAll   { red|green|blue: { "0".."18": itemId } }                   DATAPACK (= items + itemsAbove13)
//   buy        Alexandria (30098, Giran luxury shop) multisell 300984002: stage 7-10 crystals for C/D/B crystals   DATAPACK, not live-verified
//   q350Code   the absorb rules read from Q00350_EnhanceYourWeapon.java (exact code behaviour)                    DATAPACK
//   forum503   the forum guide (topic 503, written for another server) + where it disagrees with the datapack       GUIDE
// Writes Scripts/data/soul_sa_recipes.json (dashboard only, the bots never read it): every "weapon + soul crystal + gemstones + adena ->
//   weapon with a special ability" recipe from the datapack multisells (Blacksmiths 1005, Blacksmith of Mammon 3112625xx, Ishuma 32615000x)
//   with the NPCs that sell it and where they stand (Scripts/data/npc_atlas.json).                               DATAPACK
// Sources: Scripts/data/dp/multisell (local copy) and, when present, the scratchpad datapack clone (SWARM_DP or the default path below).
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const DATA = path.join(ROOT, 'Scripts', 'data');
const DRY = process.argv.includes('--dry');
const DP_CLONE = process.env.SWARM_DP || '%TEMP%\\scratch';
const MS_DIRS = [path.join(DATA, 'dp', 'multisell'), path.join(DP_CLONE, 'multisell')].filter(d => fs.existsSync(d));
const rd = (p) => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));
const SC_F = process.env.SWARM_SOULCRYSTALS_FILE || path.join(DATA, 'soul_crystals.json');
const SA_F = process.env.SWARM_SOULSA_FILE || path.join(DATA, 'soul_sa_recipes.json');

const sc = rd(SC_F);
const items = rd(path.join(ROOT, 'Dashboard', 'data', 'items.json'));
const GRADE = { 0: '', 1: 'D', 2: 'C', 3: 'B', 4: 'A', 5: 'S', 6: 'S80', 7: 'S84' };
const iname = (id) => (items[id] && items[id][0]) || ('item ' + id);
const igrade = (id) => (items[id] && GRADE[items[id][3]]) || '';

// ---- crystal ids 0..18 per colour
const itemsAll = {};
['red', 'green', 'blue'].forEach(c => { itemsAll[c] = Object.assign({}, (sc.items || {})[c] || {}, ((sc.itemsAbove13 || {})[c]) || {}); });
const crystalInfo = {};
Object.keys(itemsAll).forEach(c => Object.keys(itemsAll[c]).forEach(s => { crystalInfo[itemsAll[c][s]] = { color: c, stage: +s }; }));
const missing = ['red', 'green', 'blue'].filter(c => Object.keys(itemsAll[c]).length !== 19);
if (missing.length) { console.error('crystal id table incomplete for ' + missing.join(', ')); process.exit(1); }

// ---- multisell parsing
function parseMultisell(file) {
  const t = fs.readFileSync(file, 'utf8');
  const npcs = [], npcNames = {};
  (t.match(/<npcs>[\s\S]*?<\/npcs>/) || [''])[0].replace(/<npc>(\d+)<\/npc>(?:[ \t]*<!--\s*(.*?)\s*-->)?/g, (m, id, c) => { npcs.push(+id); if (c) npcNames[+id] = c; return m; });
  const rows = [];
  (t.match(/<item>[\s\S]*?<\/item>/g) || []).forEach(b => {
    const ing = [], prod = [];
    b.replace(/<ingredient\s+count="(\d+)"\s+id="(-?\d+)"\s*\/>/g, (m, c, id) => { ing.push({ id: +id, count: +c }); return m; });
    b.replace(/<production\s+count="(\d+)"\s+id="(-?\d+)"\s*\/>/g, (m, c, id) => { prod.push({ id: +id, count: +c }); return m; });
    const prodName = (b.match(/<!--\s*([^>]*?)\s*-->\s*<production/) || [])[1] || '';   // the SA name ("Stormbringer - Critical Anger"); items.json has only the base name
    rows.push({ ing, prod, prodName });
  });
  return { npcs, npcNames, rows, applyTaxes: /applyTaxes="true"/.test(t), keepEnchant: /maintainEnchantment="true"/.test(t) };
}
const seen = new Set(), lists = {};
MS_DIRS.forEach(dir => fs.readdirSync(dir).filter(f => /^\d+\.xml$/.test(f)).forEach(f => {
  const id = f.replace('.xml', ''); if (seen.has(id)) return; seen.add(id);
  lists[id] = parseMultisell(path.join(dir, f));
}));

// ---- Alexandria
const alex = lists['300984002'];
if (!alex) { console.error('multisell 300984002 (Alexandria) not found in ' + MS_DIRS.join(' / ')); process.exit(1); }
const offers = {};
alex.rows.forEach(r => {
  const p = r.prod[0], ci = p && crystalInfo[p.id]; if (!ci) return;
  const o = offers[ci.stage] = offers[ci.stage] || { stage: ci.stage, ids: {}, cost: r.ing.map(x => ({ id: x.id, name: iname(x.id), count: x.count })) };
  o.ids[ci.color] = p.id;
});
let atlas = {}; try { (rd(path.join(DATA, 'npc_atlas.json')).npcs || []).forEach(n => { atlas[n.id] = n; }); } catch (e) { }
const npcRow = (id, cmt) => { const n = atlas[id] || {}, cm = String(cmt || '').match(/^(.*?)(?:\s*\((.*)\))?$/) || []; return { id, name: n.name || cm[1] || '', title: n.title || cm[2] || '', town: (n.place && n.place.town) || '', region: (n.place && n.place.region) || '', x: n.x, y: n.y, z: n.z }; };
const buy = {
  mark: 'DATAPACK (multisell 300984002); L2Toggle Kain price/list NOT verified live',
  npc: npcRow(30098), multisell: 300984002,
  note: 'Paid with grade crystals (Crystal: D 1458 / C 1459 / B 1460 = what crystallizing gear gives), NOT adena. The forum guide (topic 503) says "for crystal stage 10 go to the Giran luxury shop, Alexandria, Purchase Specialty Items". A bought crystal only levels when quest 350 is STARTED and it is the only crystal in the bag.',
  offers: Object.values(offers).sort((a, b) => a.stage - b.stage)
};

// ---- SA recipes
const SA_GEM = { 2130: 'D', 2131: 'C', 2132: 'B', 2133: 'A', 2134: 'S' };
const recipes = [], npcLists = {};
Object.entries(lists).forEach(([ms, L]) => {
  L.rows.forEach(r => {
    const cr = r.ing.find(x => crystalInfo[x.id]); if (!cr) return;
    const p = r.prod[0]; if (!p) return;
    const w = r.ing.find(x => x !== cr && !SA_GEM[x.id] && x.id !== 57 && !crystalInfo[x.id] && items[x.id] && items[x.id][2] === 'Weapon');
    if (!w) return;
    const gem = r.ing.find(x => SA_GEM[x.id]), ad = r.ing.find(x => x.id === 57);
    const other = r.ing.filter(x => x !== cr && x !== w && x !== gem && x !== ad).map(x => ({ id: x.id, name: iname(x.id), count: x.count }));
    const pn = r.prodName || iname(p.id), wn = iname(w.id), ci = crystalInfo[cr.id];
    const sa = pn.startsWith(wn + ' - ') ? pn.slice(wn.length + 3) : pn.replace(/^.*? - /, '');
    recipes.push({ ms: +ms, w: w.id, wn, g: igrade(w.id) || (gem ? SA_GEM[gem.id] : ''), sa, saId: p.id, color: ci.color, stage: ci.stage, cid: cr.id,
      gem: gem ? { id: gem.id, name: iname(gem.id), count: gem.count } : null, adena: ad ? ad.count : 0, other: other.length ? other : undefined });
    npcLists[ms] = { npcs: L.npcs.map(id => npcRow(id, L.npcNames[id])), applyTaxes: L.applyTaxes, keepEnchant: L.keepEnchant };
  });
});
recipes.sort((a, b) => (a.ms - b.ms) || a.wn.localeCompare(b.wn) || a.color.localeCompare(b.color));

// ---- the quest script, exact (read from Q00350_EnhanceYourWeapon.java)
const q350Code = {
  mark: 'DATAPACK (Q00350_EnhanceYourWeapon.java levelSoulCrystals / getSCForPlayer / levelCrystal; L2J H5)',
  rules: [
    'getSCForPlayer: quest 350 must be STARTED, and the bag must hold exactly ONE item that is a soul crystal of any colour, stage 0-18 (two or more = null = no roll at all, no message from the script).',
    'LAST_HIT monsters (every regular monster): the KILLER must be in the monster\'s absorber list (= he used the crystal on it) and his crystal use must have been at <= 50 % of the monster\'s max HP; else nothing. Only the killer\'s crystal rolls.',
    'So a character that never lands killing blows (our healers only heal) can NOT level a crystal on regular monsters: its crystal use only costs MP. Healers level on FULL_PARTY bosses, buy (Alexandria, stage 7-10) or get one levelled by a damage dealer (trade / warehouse).',
    'Party monsters (any non-LAST_HIT entry = all bosses): the killer\'s party is checked (no distance check in the script); maxSCLevel = the highest member crystal stage the boss accepts; no crystal use needed.',
    'FULL_PARTY: every member holding one valid crystal rolls. PARTY_ONE_RANDOM: ONE member is drawn from ALL members (also those without a crystal); a member without a valid crystal = nobody levels (the code comment calls it retail behaviour).',
    'PARTY_RANDOM is declared but used by no entry in levelUpCrystalData.xml.',
    'Roll: getRandom(100) <= chance, so chance N = (N+1) %. Success = the crystal is replaced by the next stage (974). Fail = 975. Stage not accepted = 978. The crystal never breaks in H5 (976 unused).',
    'The boss must be killed by OUR party (killer.getParty()); another party\'s kill gives us nothing.'
  ]
};

// ---- forum topic 503 (GUIDE)
const forum503 = {
  mark: 'GUIDE (community.lineage2toggle.com topic 503, Arthose 2023-01-02; a copy of an rpg-club x50 guide, NOT L2Toggle data; 3 of the 4 "other raid boss" images and the NPC screenshots are lost)',
  steps: ['Take quest 350 at the Magic Guild in Giran or Aden (the datapack also has Gideon in Oren).',
    'Stage 10 crystals: Giran luxury shop, Alexandria, "Purchase Specialty Items" (the datapack multisell sells stage 7-10 for grade crystals).',
    'Raid boss table colours: RED = 100 %, every party member levels; YELLOW = random chance, each member rolls; GREEN = one random party member levels. The forum column = the stage the crystal REACHES (datapack accepted stage + 1).'],
  conflicts: [
    'Anakazel 78: forum YELLOW (every member rolls), datapack 25338 PARTY_ONE_RANDOM 15 % [12,13] (green). Stages agree. The forum leaves out Anakazel 68 (25337, 5 % PARTY_ONE_RANDOM [10,11]).',
    'Scarlet van Halisha and Freya (normal): the forum shows a GREEN stage 17; the datapack stops at accepted stage 15 (gives up to 16).',
    'Lost Captain / Lost Warden (81): forum GREEN 11-14; not in levelUpCrystalData.xml at all (no absorb on stock L2J).',
    'Zaken: forum "night time 60" = datapack 29022 (100 % FULL_PARTY [10,11], 10 % [12,13]); forum "daytime HARD 83" = 29181 (PARTY_ONE_RANDOM 20/10/3 %). The datapack XML COMMENT swaps day/night; npcs_h5.json names all three plain "Zaken". 29176 (60, 10 % one random [10,11]) is not on the forum.',
    'Forum names: Orphen = Orfen, Anays = Anais, Takeurakan = Taklacan, Darnel = Darnels, Cannibalistic Leader Stakato = Cannibalistic Stakato Chief, Ant Queen = Queen Ant.',
    'The forum gives no percentages; Ice Knight Captain (25699/25700) and the mid-level bosses are not on the surviving images.',
    'Not verified on L2Toggle Kain: rates and lists may differ (first kills: watch messages 974/975/978 in Logs/soul.log).'],
  mostImportant: [
    ['Queen Ant', 40, 'Y 11'], ['Orfen', 50, 'Y 11-13'], ['Core', 50, 'Y 11-13'], ['Zaken (night) 29022', 60, 'R 11-12, Y 13-14'], ['Baium', 75, 'R 11-12, Y 13'],
    ['Anakazel', 78, 'Y 13-14 (datapack: one random)'], ['Lilith', 80, 'R 11-12, Y 13-14'], ['Ember', 80, 'Y 11-14'], ['Anakim', 80, 'R 11-12, Y 13-14'],
    ['Ekimus', 82, 'Y 13-17'], ['Tiat', 82, 'Y 13-17'], ['Beleth', 83, 'Y 13-17'], ['Zaken (daytime hard) 29181', 83, 'G 13-17'],
    ['Scarlet van Halisha', 85, 'R 13-14, Y 15-16, G 17 (datapack: no 17)'], ['Freya (normal)', 85, 'R 13-15, Y 16, G 17 (datapack: no 17)'],
    ['Freya (extreme)', 85, 'R 13-16, Y 17-18'], ['Antharas', 85, 'R 13-17, Y 18'], ['Valakas', 85, 'R 13-17, Y 18']]
};

const out = Object.assign({}, sc, { itemsAll, buy, q350Code, forum503, extended: { at: new Date().toISOString(), tool: 'docs/plan/tools/soul_crystals_extend.js' } });
const saOut = { generated: new Date().toISOString(), tool: 'docs/plan/tools/soul_crystals_extend.js', mark: 'DATAPACK (multisell xml); costs before castle tax (applyTaxes lists add the town tax); L2Toggle not verified live',
  sources: MS_DIRS, npcs: npcLists, recipes };

console.log(`crystals 0-18: ${Object.keys(crystalInfo).length} ids; Alexandria offers: ${buy.offers.map(o => 'stage ' + o.stage + ' (' + o.cost.map(c => c.count + ' ' + c.name).join(' + ') + ')').join('; ')}`);
console.log(`SA recipes: ${recipes.length} from multisells ${Object.keys(npcLists).join(', ')}`);
if (DRY) { console.log('dry run: nothing written'); process.exit(0); }
function writeAtomic(f, obj, pretty) {
  const t = JSON.stringify(obj, null, pretty ? 1 : 0);
  if (fs.existsSync(f)) {
    const bdir = path.join(ROOT, 'Settings', 'backup', 'soulcrystal_' + new Date().toISOString().slice(0, 10));
    fs.mkdirSync(bdir, { recursive: true });
    const b = path.join(bdir, path.basename(f) + '.' + Date.now());
    fs.copyFileSync(f, b);
  }
  const tmp = f + '.tmp' + process.pid; fs.writeFileSync(tmp, t); fs.renameSync(tmp, f);
}
writeAtomic(SC_F, out, true);
writeAtomic(SA_F, saOut, false);
console.log('written: ' + SC_F + ', ' + SA_F);
