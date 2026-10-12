// TRADE ITEMS data (user 2026-10-10: "buttons so I can tell teams and characters to go to the clan leader OR a character of my own choice
// and trade everything we want to ... select what should be traded easily"). Builds Scripts/data/trade_items.json from the H5 datapack
// item tables (Scripts/data/dp/stats/items/*.xml) + the raid drop tables (Scripts/data/raid_drops_h5.json):
//   notrade  item ids the server does not let you trade (is_tradable=false) or quest items (is_questitem=true)
//   cat      item id -> category for the Trade page picker (Dashboard/tradelogic.js TRADE_CATS):
//            raid (material a raid boss drops) | recipe | enchant (enchant / attribute / enchant-chance scrolls, ancient crystals)
//            | dye | lifestone | material | consumable (potions, elixirs, scrolls, arrows / bolts, shots, herbs, lures)
//            gear is NOT listed here: the live inventory type (Weapon / Armor / Accessory) decides it.
//   node docs/plan/tools/trade_items.js            (writes the file, prints the counts)
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const DIR = path.join(ROOT, 'Scripts', 'data', 'dp', 'stats', 'items');
const OUT = path.join(ROOT, 'Scripts', 'data', 'trade_items.json');

// basic crafting materials (Stem ... Metallic Fiber, the upgraded ones Mold Glue ... Oriharukon, crystals, gemstones): plain "material", never "raid"
const BASIC = new Set([].concat(range(1864, 1895), range(4039, 4048), range(1458, 1462), range(2130, 2134), [5220, 5549, 5550, 5551, 5552, 5553, 5554]));
function range(a, b) { const o = []; for (let i = a; i <= b; i++) o.push(i); return o; }

function parseItems() {
  const out = {};
  const files = fs.readdirSync(DIR).filter(f => /\.xml$/i.test(f));
  for (const f of files) {
    const x = fs.readFileSync(path.join(DIR, f), 'utf8');
    const re = /<item\s+id="(\d+)"\s+type="(\w+)"\s+name="([^"]*)"[^>]*?(\/>|>([\s\S]*?)<\/item>)/g;
    let m;
    while ((m = re.exec(x))) {
      const body = m[5] || '', set = {};
      body.replace(/<set\s+name="([a-z_]+)"\s+val="([^"]*)"\s*\/>/g, (_, k, v) => { set[k] = v; return ''; });
      out[m[1]] = { id: Number(m[1]), type: m[2], name: m[3], set };
    }
  }
  return out;
}
function raidDropIds() {
  const ids = new Set();
  try {
    const j = JSON.parse(fs.readFileSync(path.join(ROOT, 'Scripts', 'data', 'raid_drops_h5.json'), 'utf8'));
    Object.values(j).forEach(b => ((b && b.categories) || []).forEach(c => (c.items || []).forEach(i => ids.add(Number(i.id)))));
  } catch (e) { console.error('raid_drops_h5.json not readable: ' + e.message); }
  return ids;
}
const ENCH_T = /^(SCRL_ENCHANT_|BLESS_SCRL_ENCHANT_|ANCIENT_CRYSTAL_ENCHANT_|SCRL_INC_ENCHANT_PROP_)/;
const CONS_T = new Set(['POTION', 'ELIXIR', 'SCROLL', 'ARROW', 'BOLT', 'LURE']);
const CONS_N = /Soulshot|Spiritshot|Herb of|Potion|Elixir|Scroll of Escape|Scroll of Resurrection|Antidote|Bandage|Spirit Ore|Soul Ore|Mana Drug|Healing Drug|Arrow|Bolt/i;
function category(it, raid) {
  const t = String(it.set.etcitem_type || ''), n = it.name;
  if (it.type !== 'EtcItem') return '';                                  // weapon / armor = gear (decided live)
  if (t === 'RECIPE' || /^Recipe:/i.test(n)) return 'recipe';
  if (ENCH_T.test(t) || /^(Blessed |Crystal |Ancient )?Scroll: Enchant|Scroll: Enchant|Enchant (Weapon|Armor)|Elemental|Attribute/i.test(n) && /Scroll|Stone|Crystal/i.test(n)) return 'enchant';
  if (/^(Fire|Water|Wind|Earth|Holy|Dark|Unholy) (Stone|Crystal|Jewel|Energy)$/i.test(n)) return 'enchant';   // attribute stones / crystals
  if (t === 'DYE' || /^(Greater )?Dye of /i.test(n)) return 'dye';
  if (/Life Stone/i.test(n)) return 'lifestone';
  if (CONS_T.has(t) || CONS_N.test(n)) return 'consumable';
  if (t === 'MATERIAL' || /Crystal \([A-S]+-Grade\)|Gemstone/i.test(n)) return raid.has(it.id) && !BASIC.has(it.id) ? 'raid' : 'material';
  return '';
}

function build() {
  const items = parseItems(), raid = raidDropIds();
  const notrade = [], cat = {}, counts = {};
  Object.values(items).forEach(it => {
    const tradable = it.set.is_tradable !== 'false', quest = it.set.is_questitem === 'true';
    if (!tradable || quest) notrade.push(it.id);
    const c = category(it, raid);
    if (c) { cat[it.id] = c; counts[c] = (counts[c] || 0) + 1; }
  });
  notrade.sort((a, b) => a - b);
  return {
    generated: new Date().toISOString(), tool: 'docs/plan/tools/trade_items.js',
    source: 'Scripts/data/dp/stats/items/*.xml (H5 datapack: is_tradable / is_questitem / etcitem_type) + Scripts/data/raid_drops_h5.json',
    note: 'notrade = never offered on the Trade page and never put in a trade window by swarm.js (HANDOVER); cat = picker category (gear is decided by the live item type)',
    counts: Object.assign({ items: Object.keys(items).length, notrade: notrade.length }, counts),
    notrade, cat,
  };
}
if (require.main === module) {
  const d = build();
  fs.writeFileSync(OUT, JSON.stringify(d));
  console.log(`${path.relative(ROOT, OUT)}: ${JSON.stringify(d.counts)}`);
}
module.exports = { build, category, parseItems };
