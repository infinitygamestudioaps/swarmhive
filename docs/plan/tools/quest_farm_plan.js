// QUEST FARM PLANNER (2026-10-12, user: "low-level repeatable quests that give adena: spawn 10 chars to repeat them and trade all adena to
// another character").
//
// Ranks every REPEATABLE quest (type repeatable / daily, or an endless turn-in quest) a character of level 1-40 can take by
// adena + sellable reward value per hour, and writes
//   Scripts/data/quest_farm.json   { on, collector, chars[], tradeAbove, keep, override{}  <- user fields, PRESERVED from the existing file
//                                    meta { generated, tool, notes[], prices{} (sell-price cache), skipped[] },
//                                    plan { quests[] (best first), byLevel { "1": [ids], ... "40": [ids] } } }
//   docs/plan/quest_farm.md        how it is computed, the top 20, best picks per level band, how to use the farm
//
// Run:  node docs/plan/tools/quest_farm_plan.js [<datapack root>]
//   The datapack (sparse clone of github.com/Shagooh/l2j-server-datapack with src/main/resources/data/stats/items) gives the item prices
//   (sell price = price / 2, L2J). Without it the price cache in the existing quest_farm.json meta.prices is used.
//
// MODEL (one run = take the quest, collect, hand in; see ASSUMPTIONS below):
//   hunt monsters = the monsters that drop the counted / needed items (quest drops), weighted by their spawn count (a bot kills what is there)
//   per kill      = sum over items of chance x avg amount x weight;  a converted item (map pieces -> map) = rate of the piece / its limit
//   turn-in quest (adena per item, quest stays open or is retaken): batch K kills chosen to maximise adena/hour (bonus >= N counted), the
//                 hunt part capped at 30 min; fixed quest: kills = needed count / rate per item (needCounts, else the drop limit)
//   run time      = talk (20 s per NPC talk) + travel along start NPC -> other talk NPCs -> hunting cluster -> hand-in NPC (+ the way back)
//                   + kills x kill time (by monster level)
//   adena / run   = number | perItem x collected + bonus (when the batch reaches its minimum) + base | {amount, chance} | range | simple raw
//   item value    = sell price (price / 2) x count (x chance); several reward lists without chance = alternatives (average; max when the
//                   player chooses)
//   score         = adena/h + item value/h
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const P = (...a) => path.join(ROOT, ...a);
const OUT = P('Scripts', 'data', 'quest_farm.json'), MD = P('docs', 'plan', 'quest_farm.md');

// ---------------------------------------------------------------- assumptions
const A = {
  runSpeed: 140,            // units / s (buffed run speed incl. stops; H5 base 115-130, Wind Walk +33)
  talkS: 20,                // one NPC dialog incl. walking up to it inside town
  townPortS: 45,            // .townname (free on L2Toggle) incl. loading
  gkS: 60,                  // gatekeeper teleport incl. walking to the gatekeeper and loading
  maxWalkS: 900,            // a single hop never counts more than 15 min (the bot would teleport)
  killS: (lvl) => lvl < 10 ? 22 : lvl < 20 ? 28 : lvl < 30 ? 34 : 40,   // one kill incl. walking to the next monster + a share of resting
  huntCapS: 1800,           // a turn-in batch never hunts longer than 30 min
  huntMinS: 300,            // ... and at least 5 min (no back-and-forth for 1 item even when a base amount would pay for it)
  rareS: 600,               // a kill of a monster with <= 2 spawns in the world (named / unique): 10 min (waiting for its respawn)
  defaultNeed: 10,          // a fixed quest whose count the parser could not resolve (REQUIRED_COUNT ...): 10
  minLevel: 1, maxLevel: 40,
  tooHigh: 5,               // byLevel: hunt monster level <= L + 5
  wasted: 10,               // byLevel: hunt monster level < L - 10 = still listed, after the fitting ones
};
const NOTES = [
  `Run speed ${A.runSpeed} u/s, ${A.talkS} s per NPC talk, .townname ${A.townPortS} s, gatekeeper teleport ${A.gkS} s, one walk hop at most ${A.maxWalkS / 60} min.`,
  'Kill time per monster (incl. walking to the next one and a share of resting, one character solo): < lvl 10: 22 s, 10-19: 28 s, 20-29: 34 s, 30+: 40 s.',
  'Monsters are weighted by their spawn count (a bot kills what stands there); a unique / quest-spawned dropper adds little.',
  'Turn-in quests: batch size chosen for the best adena/hour (the >= N bonus is counted when the expected batch reaches it), hunting 5-30 min per batch.',
  'Several turn-in formulas (base amounts for different counts): the one with the LOWEST base is used (conservative). 4+ reward lists without per-item pay = a random outcome table: adena averaged.',
  'Reward lists that pay adena OR items (exchange vs. quit): score = the better of the two, not the sum.',
  'A needed item that only a named / unique monster (<= 2 spawns) drops: 10 min per kill (respawn wait). A count the parser could not resolve = 10.',
  'Drops whose chance is a runtime formula: 50 %. Non-quest items a quest takes (Scroll of Escape ...) are subtracted at their shop price.',
  'confidence low = partly parsed quest, an NPC without a fixed spawn, a guessed drop chance, unresolved formula / count, prerequisite item, or no hunt found; byLevel lists high confidence first.',
  'Item rewards are valued at the NPC sell price (datapack price / 2). Quest items and items without a price count 0.',
  'Several reward lists without a chance = alternatives: averaged (max when the quest lets the player choose).',
  'score = adena/hour + item value/hour. Daily quests are listed but never in byLevel (once a day).',
  'Not modelled: party drops, spoil, rest time at low HP beyond the kill time, aggressive monsters, competition from other players.',
];

// ---------------------------------------------------------------- input
const readJ = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, '')); } catch (e) { return d; } };
const QD = readJ(P('Scripts', 'data', 'quests_h5.json'), null);
if (!QD) { console.error('Scripts/data/quests_h5.json missing (run docs/plan/tools/quest_extract.js)'); process.exit(1); }
const Q = QD.quests;
const ITEMS = readJ(P('Dashboard', 'data', 'items.json'), {});
const OLD = readJ(OUT, {});
const itemName = (id) => (ITEMS[id] && ITEMS[id][0]) || `item ${id}`;

function dpRoot() {
  const c = [process.argv[2], process.env.L2J_DP, P('Scripts', 'data', 'dp', 'l2j-server-datapack'),
    '%TEMP%\\scratch'].filter(Boolean);
  return c.find(d => fs.existsSync(path.join(d, 'src', 'main', 'resources', 'data', 'stats', 'items')));
}
/** id -> datapack price (adena). From the datapack when present, else the cache in the old file. */
function loadPrices() {
  const dp = dpRoot(), out = {};
  if (dp) {
    const dir = path.join(dp, 'src', 'main', 'resources', 'data', 'stats', 'items');
    for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.xml'))) {
      const s = fs.readFileSync(path.join(dir, f), 'utf8');
      const re = /<item\s+id="(\d+)"[^>]*>([\s\S]*?)<\/item>/g; let m;
      while ((m = re.exec(s))) { const p = /<set\s+name="price"\s+val="(\d+)"/.exec(m[2]); if (p) out[m[1]] = Number(p[1]); }
    }
    return { prices: out, src: 'datapack ' + dp };
  }
  return { prices: (OLD.meta && OLD.meta.prices) || {}, src: 'cache (quest_farm.json meta.prices)' };
}
const PR = loadPrices();
const sellValue = (id) => Math.floor((PR.prices[id] || 0) / 2);

// ---------------------------------------------------------------- helpers
const dist = (a, b) => (a && b) ? Math.hypot(a[0] - b[0], a[1] - b[1]) : 0;
const avgAmt = (a) => Array.isArray(a) ? (Number(a[0]) + Number(a[a.length - 1])) / 2 : (Number(a) || 1);
function numOf(v) {
  if (typeof v === 'number') return v;
  if (v && typeof v === 'object' && v.raw) { const m = /getRandom\((\d+),\s*(\d+)\)/.exec(v.raw); if (m) return (Number(m[1]) + Number(m[2])) / 2; const r = /getRandom\((\d+)\)\s*\+\s*(\d+)/.exec(v.raw); if (r) return Number(r[1]) / 2 + Number(r[2]); }
  return 1;
}
function npcPos(n) { if (!n) return null; if (n.spawns && n.spawns[0]) return n.spawns[0]; if (n.clientPos) return n.clientPos; return null; }
/** seconds for one hop a -> b. b may be a hunting cluster with a gatekeeper landing. */
function hopS(a, b, landing, bInTown) {
  if (!a || !b) return 120;                                              // unknown position: 2 min
  const d = dist(a, b), walk = Math.min(d / A.runSpeed, A.maxWalkS);
  if (d < 3000) return walk;
  let tp = Infinity;
  if (landing) tp = A.gkS + (landing.dist != null ? landing.dist : dist([landing.x, landing.y], b)) / A.runSpeed;
  if (bInTown) tp = Math.min(tp, A.townPortS + 30);
  return Math.min(walk, tp);
}
/** evaluate an ADENA spec for `got` = { itemId: count } and `n` = total counted items */
function adenaOf(ad, got, n, why) {
  if (ad == null) return 0;
  if (typeof ad === 'number') return ad;
  if (Array.isArray(ad)) return Math.max(...ad.map(a => adenaOf(a, got, n, why)));
  if (ad.amount != null) return Number(ad.amount) * (ad.chance != null ? Number(ad.chance) / 100 : 1);
  if (ad.range) return (Number(ad.range[0]) + Number(ad.range[1])) / 2;
  if (ad.perItem || ad.bonus || ad.base != null) {
    let a = Number(ad.base) || 0;
    (ad.perItem || []).forEach(p => (p.items || []).forEach(id => { a += (got[id] || 0) * Number(p.each || 0); }));
    if (ad.bonus && n >= Number(ad.bonus.min || 0)) a += Number(ad.bonus.adena || 0);
    return a;
  }
  if (ad.raw) {                                                          // simple formula with item-count variables
    const raw = String(ad.raw);
    if (!/^[\w\s*+\-()/.<>=?:]+$/.test(raw)) { why.push('adena formula not evaluated: ' + raw.slice(0, 60)); return 0; }
    const ids = raw.match(/[A-Za-z_]\w*/g) || [];
    const vars = [...new Set(ids.filter(v => !/^(Math)$/.test(v)))];
    if (!vars.length) { try { return Number(Function(`"use strict";return (${raw})`)()) || 0; } catch (e) { return 0; } }
    if (vars.length === 1 && /^(sum|amount|reward|adena|count|itemCount)$/i.test(vars[0]) && raw.trim() === vars[0]) { why.push('adena formula not evaluated: ' + raw); return 0; }
    const each = n / vars.length;
    try { const f = Function(...vars, `"use strict";return (${raw})`); const v = Number(f(...vars.map(() => each))); if (isFinite(v)) { why.push('adena from formula ' + raw.slice(0, 50) + ' (items split evenly over its variables)'); return v; } } catch (e) { }
    why.push('adena formula not evaluated: ' + raw.slice(0, 60)); return 0;
  }
  return 0;
}
/** expected sell value of one reward entry list (items with chance = expectation) */
function itemsValue(entries, choices) {
  let withChance = 0; const alts = [];
  entries.forEach(r => {
    let v = 0, hasNoChance = false;
    (r.items || []).forEach(i => {
      const val = sellValue(i.id) * numOf(i.count);
      if (i.chance != null) withChance += val * Number(i.chance) / 100; else { v += val; hasNoChance = true; }
    });
    if (hasNoChance) alts.push(v);
  });
  let alt = 0;
  if (alts.length === 1) alt = alts[0];
  else if (alts.length > 1) alt = choices ? Math.max(...alts) : alts.reduce((a, b) => a + b, 0) / alts.length;
  return withChance + alt;
}

// ---------------------------------------------------------------- per quest
const SKIP_NAME = /pet|wedding|fishing|tutorial|enhance your weapon|clan's|bandit stronghold|guardians of the holy grail|taming wild beasts|dimension|song of the hunter|coins of magic|grand feast|fantasy wine|bring out the flavor|mandolin|flute|accordion|birthday|jovial|repent|little wing/i;
function planQuest(x) {
  const why = [], R = x.rewards || {}, lvl = x.level || {};
  const reasons = (x.parse && x.parse.reasons) || [];
  const skip = (w) => ({ skip: true, id: x.id, name: x.name, why: w });
  if (x.parse && x.parse.status === 'manual') return skip('parse status manual');
  if (reasons.some(r => /territory war/i.test(r))) return skip('territory war quest');
  if (reasons.some(r => /dummy script/i.test(r))) return skip('dummy script');
  const req = x.requirements || {};
  if (req.clan) return skip('clan quest');
  if (req.noble || req.subclass) return skip('noble / subclass only');
  if (SKIP_NAME.test(x.name)) return skip('pet / wedding / fishing / fun / special quest (no plain adena farm)');
  if (lvl.min != null && lvl.min > A.maxLevel) return skip('level ' + lvl.min + '+');
  // ---- items the run collects
  const drops = (x.drops || []).filter(d => Number(d.item) > 0);
  let lowConf = false;
  const guessed = drops.filter(d => d.chance == null && !d.chanceByNpc && d.chanceRaw);
  if (guessed.length) { lowConf = true; why.push('drop chance not resolved (' + String(guessed[0].chanceRaw).slice(0, 40) + '): assumed 50 %'); guessed.forEach(d => { d.chance = 50; }); }
  const unresolved = (x.drops || []).filter(d => !(Number(d.item) > 0));
  const mons = {}; (x.monsters || []).forEach(m => { mons[m.id] = m; });
  const turnIns = R.turnIns || [], finals = R.final || [];
  const counted = new Set();
  const adSpecs = turnIns.concat(finals).map(r => r.adena).filter(Boolean);
  const addPer = (ad) => { if (!ad) return; if (Array.isArray(ad)) return ad.forEach(addPer); (ad.perItem || []).forEach(p => (p.items || []).forEach(id => counted.add(Number(id)))); };
  adSpecs.forEach(addPer);
  if (!counted.size && adSpecs.some(a => a && !Array.isArray(a) && a.raw && !a.perItem)) drops.forEach(d => counted.add(Number(d.item)));
  const need = {};                                                       // fixed counts the quest wants
  (x.transitions || []).forEach(t => ((t.trigger || {}).needCounts || []).forEach(c => { need[c.id] = Math.max(need[c.id] || 0, Number(c.n) || 0); }));
  // rate per kill for every dropped item (monsters weighted by spawn count)
  // a drop whose item is a runtime expression (MONSTERS.get(npc), groupedDropItem(...)): it gives one of the paid items nobody else drops
  if (unresolved.length) {
    const open = [...counted].filter(id => !drops.some(d => Number(d.item) === id));
    if (open.length) {
      unresolved.forEach(d => {
        const raw = String((d.item && d.item.raw) || ''), num = /(\d+(?:\.\d+)?)/.exec(raw);
        const base = d.chance != null ? Number(d.chance) : num && !/get\(/.test(raw) ? Number(num[1]) : 50;
        open.forEach(id => drops.push(Object.assign({}, d, { item: id, chance: d.chanceByNpc ? undefined : base / open.length,
          chanceByNpc: d.chanceByNpc ? Object.fromEntries(Object.entries(d.chanceByNpc).map(([k, v]) => [k, Number(v) / open.length])) : undefined })));
      });
      lowConf = true; why.push('drop item is a runtime choice: assumed it is one of ' + open.map(itemName).join(' / ') + ' (split evenly)');
    } else { lowConf = true; why.push('a drop item was not resolved'); }
  }
  const rate = {}, monUse = {};
  const itemDrops = {};
  drops.forEach(d => { (itemDrops[d.item] = itemDrops[d.item] || []).push(d); });
  const rawRate = (id) => { const ms = {}; (itemDrops[id] || []).forEach(d => (d.monsters || []).forEach(m => { const ch = d.chanceByNpc && d.chanceByNpc[m] != null ? d.chanceByNpc[m] : d.chance; if (ch == null) return; ms[m] = Math.max(ms[m] || 0, Number(ch) / 100 * avgAmt(d.amount)); })); return ms; };
  const rateOf = (id) => {
    const ds = itemDrops[id]; if (!ds) return 0;
    const ms = {}; ds.forEach(d => (d.monsters || []).forEach(m => { const ch = d.chanceByNpc && d.chanceByNpc[m] != null ? d.chanceByNpc[m] : d.chance; if (ch == null) return; ms[m] = Math.max(ms[m] || 0, Number(ch) / 100 * avgAmt(d.amount)); }));
    let wsum = 0, r = 0;
    Object.keys(ms).forEach(m => { const w = mons[m] ? Number(mons[m].spawnCount) || 0 : 0; wsum += w; r += w * ms[m]; });
    if (!wsum) return 0;
    Object.keys(ms).forEach(m => { if (mons[m] && Number(mons[m].spawnCount)) monUse[m] = Math.max(monUse[m] || 0, Number(mons[m].spawnCount)); });
    return r / wsum;
  };
  Object.keys(itemDrops).forEach(id => { rate[id] = rateOf(id); });
  const wOf = (m) => mons[m] ? Number(mons[m].spawnCount) || 0 : 0;
  const rareSet = (id) => { const ms = rawRate(id); const w = Object.keys(ms).reduce((a, m) => a + wOf(m), 0); return w > 0 && w <= 2; };
  // converted items (map pieces -> map): a counted item nobody drops = a dropped quest item with a limit / that limit
  const undropped = [...counted].filter(id => !rate[id]);
  if (undropped.length === 1) {
    const src = drops.filter(d => d.limit && !counted.has(Number(d.item)) && rate[d.item]);
    if (src.length === 1) { rate[undropped[0]] = rate[src[0].item] / Number(src[0].limit); why.push(`assumed ${src[0].limit} x ${itemName(src[0].item)} turn into 1 ${itemName(undropped[0])}`); }
  }
  // counted items are hunted together: their rate is over the UNION of their monsters (a unique dropper is a small share of the kills)
  { const uni = {}; [...counted].forEach(id => Object.keys(rawRate(id)).forEach(m => { if (wOf(m)) uni[m] = wOf(m); }));
    const W = Object.values(uni).reduce((a, b) => a + b, 0);
    if (W) [...counted].forEach(id => { if (!itemDrops[id]) return; const ms = rawRate(id); let r = 0; Object.keys(ms).forEach(m => { r += wOf(m) * ms[m]; }); rate[id] = r / W; }); }
  // the items of this run: the counted (per item paid) ones, else the needed ones, else every dropped quest item with a limit
  let runItems = [...counted].filter(id => rate[id] > 0);
  const fixedItems = Object.keys(need).map(Number).filter(id => rate[id] > 0);
  const killQuest = (x.kills || []).filter(k => k.count);
  if (!runItems.length && !fixedItems.length && !killQuest.length) {
    const ids = [...new Set(drops.filter(d => rate[d.item] > 0).map(d => Number(d.item)))];
    ids.forEach(id => { const lim = Math.max(0, ...drops.filter(d => Number(d.item) === id && d.limit).map(d => Number(d.limit))); need[id] = Math.max(need[id] || 0, lim || A.defaultNeed); if (!lim) { lowConf = true; why.push('count of ' + itemName(id) + ' not resolved: assumed ' + A.defaultNeed); } });
    fixedItems.push(...ids);
  }
  const huntMonIds = Object.keys(monUse).map(Number);
  if (!huntMonIds.length && !killQuest.length) {
    const sp = (x.monsters || []).filter(m => m.roles && m.roles.includes('kill'));
    if (sp.length && sp.every(m => !Number(m.spawnCount))) return skip('its monsters only appear through the quest script');
    if (!adSpecs.length && !finals.some(r => (r.items || []).length)) return skip('no drops, no adena, no item reward');
  }
  // ---- hunt place: the cluster of the most spawned dropper
  const huntMons = huntMonIds.map(id => mons[id]).filter(Boolean).sort((a, b) => (b.spawnCount || 0) - (a.spawnCount || 0));
  const killMons = killQuest.flatMap(k => k.monsters || []).map(id => mons[id]).filter(Boolean);
  const main = huntMons[0] || killMons[0] || null;
  const huntLevel = huntMons.length ? Math.max(...huntMons.slice(0, 4).map(m => Number(m.level) || 0)) : (main ? Number(main.level) || 0 : 0);
  const cl = main && main.clusters && main.clusters[0];
  const huntAt = cl ? cl.at : null, landing = cl && cl.landing ? cl.landing : null;
  const area = main && main.areas && main.areas[0] ? main.areas[0].name : (cl ? cl.place : '');
  const killS = A.killS(huntLevel || (lvl.min || 10));
  // ---- route: start NPC -> other talk NPCs (cond order) -> hunt -> hand-in NPC -> back to the start
  const npcs = {}; (x.npcs || []).forEach(n => { npcs[n.id] = n; });
  const start = (x.startNpcs || [])[0] || null;
  const trans = (x.transitions || []).slice().sort((a, b) => (a.start ? -1 : b.start ? 1 : 0) || (a.to === 'end' ? 1 : b.to === 'end' ? -1 : 0) || ((a.from || [0])[0] - (b.from || [0])[0]));
  const talkNpcs = [];
  trans.forEach(t => { const tr = t.trigger || {}; if (/talk|event|firstTalk/.test(tr.type) && tr.npcs && tr.npcs[0] && npcs[tr.npcs[0]]) talkNpcs.push(npcs[tr.npcs[0]]); });
  const endT = trans.find(t => t.to === 'end') || null;
  const endNpc = endT && endT.trigger && endT.trigger.npcs && npcs[endT.trigger.npcs[0]] || start;
  const mid = []; talkNpcs.forEach(n => { if (n !== start && n !== endNpc && !mid.includes(n)) mid.push(n); });
  if (talkNpcs.some(n => !Number(n.spawnCount)) || (start && !Number(start.spawnCount))) { lowConf = true; why.push('talks to an NPC without a fixed spawn (the quest spawns it / it wanders)'); }
  // items the quest takes that are NOT quest items (Scroll of Escape, materials ...) cost money every run
  const qItem = {}; (x.items || []).forEach(i => { qItem[i.id] = !!i.questItem; });
  let costRun = 0; const costTxt = [];
  (x.transitions || []).forEach(t => (t.takes || []).forEach(k => { if (!qItem[k.id] && Number(k.count) > 0 && Number(k.id) !== 57) { costRun += Number(k.count) * (PR.prices[k.id] || 0); costTxt.push(k.count + ' x ' + itemName(k.id)); } }));
  if (costRun) why.push('costs ' + costTxt.join(', ') + ' per run (' + costRun + ' adena, subtracted)');
  let travelS = 0, talks = 1 + mid.length + 1, pos = npcPos(start);
  mid.forEach(n => { travelS += hopS(pos, npcPos(n), null, n.inTown); pos = npcPos(n); });
  if (huntAt) { travelS += hopS(pos, huntAt, landing, false); pos = huntAt; }
  travelS += hopS(pos, npcPos(endNpc), null, endNpc && endNpc.inTown);
  const endless = !!x.endless || (turnIns.length > 0 && !finals.length);
  // ---- adena + items per run
  const choices = !!R.choices;
  const entries = turnIns.concat(finals);
  const altRewards = entries.length > 1 && entries.some(r => r.adena && !(r.items || []).length) && entries.some(r => !r.adena && (r.items || []).length);
  const perKill = {}; runItems.forEach(id => { perKill[id] = rate[id]; });
  const totalRate = runItems.reduce((a, id) => a + rate[id], 0);
  const evalRun = (kills) => {
    const got = {}; let n = 0;
    runItems.forEach(id => { got[id] = kills * rate[id]; n += got[id]; });
    fixedItems.forEach(id => { if (got[id] == null) { got[id] = need[id]; n += need[id]; } });
    let ad = 0; const w = [];
    const hasPer = (a) => !!a && (Array.isArray(a) ? a.some(hasPer) : !!a.perItem);
    const per = entries.filter(r => hasPer(r.adena));
    if (per.length) {                                                   // turn-in formulas: the lowest base (conservative)
      const baseOf = (a) => Array.isArray(a) ? Math.min(...a.map(baseOf)) : Number(a.base) || 0;
      const pick = per.slice().sort((a, b) => baseOf(a.adena) - baseOf(b.adena))[0];
      ad = adenaOf(pick.adena, got, n, w);
    } else if (entries.length >= 4) {                                   // random outcome table: average
      ad = entries.reduce((a, r) => a + adenaOf(r.adena, got, n, w), 0) / entries.length;
    } else entries.forEach(r => { ad = Math.max(ad, adenaOf(r.adena, got, n, w)); });
    return { ad, n, w };
  };
  let kills = 0, batch = 0, best = null, rareExtraS = 0;
  if (runItems.length && totalRate > 0) {
    // turn-in: try batches of 1..cap kills, keep the best adena/hour
    const cap = Math.max(1, Math.floor(A.huntCapS / killS));
    const fixedK = fixedItems.filter(id => !counted.has(id)).reduce((a, id) => a + need[id] / rate[id], 0);
    const minK = Math.max(1, Math.ceil(A.huntMinS / killS));
    let limitK = Infinity; drops.forEach(d => { if (d.limit && counted.has(Number(d.item)) && rate[d.item] > 0) limitK = Math.min(limitK, Number(d.limit) / rate[d.item]); });
    const k0 = Math.min(minK, cap), k1 = Math.min(cap, limitK === Infinity ? cap : Math.max(Math.ceil(limitK), k0));
    for (let k = k0; k <= k1; k++) {
      const e = evalRun(k), t = A.talkS * talks + travelS + (k + fixedK) * killS;
      const ph = e.ad / (t / 3600);
      if (!best || ph > best.ph + 1e-9) best = { k, ph, e, t };
    }
    kills = best.k + fixedK; batch = Math.round(best.k * totalRate);
    best.e.w.forEach(w => why.push(w));
  } else {
    fixedItems.forEach(id => { const k = need[id] / rate[id]; kills += k; if (rareSet(id)) { rareExtraS += k * Math.max(0, A.rareS - killS); why.push(itemName(id) + ' only from a named monster (respawn wait)'); } });
    killQuest.forEach(k => { kills += Number(k.count) || 0; });
    batch = fixedItems.length ? Math.max(...fixedItems.map(id => need[id])) : killQuest.length ? Math.max(...killQuest.map(k => Number(k.count) || 0)) : 0;
    const e = evalRun(kills); best = { e }; e.w.forEach(w => why.push(w));
  }
  const adenaRun = Math.round(best.e.ad - costRun);
  const itemValueRun = Math.round(itemsValue(entries, choices));
  const runS = A.talkS * talks + travelS + kills * killS + rareExtraS;
  const runMin = Math.round(runS / 6) / 10;
  if (adenaRun + itemValueRun <= 0) return skip((entries.length ? 'no adena and no sellable item reward' : 'reward not parsed (random items in the script)') + (why.length ? ' (' + why.join('; ') + ')' : ''));
  if (!kills && !huntAt && mid.length === 0 && !runItems.length) why.push('delivery / talk quest');
  const adenaHour = Math.round(adenaRun / (runS / 3600)), valueHour = Math.round(itemValueRun / (runS / 3600));
  if (altRewards) why.push('adena OR items (alternatives): score = the better one');
  if (/unreachable/i.test(area || '')) { lowConf = true; why.push('hunting area marked unreachable in field_areas.json'); }
  if (best.e.w.some(t => /not evaluated/.test(t))) lowConf = true;
  if ((x.parse && x.parse.status === 'partial') || (req.items && req.items.length) || (!kills && drops.length) || (!huntAt && kills)) lowConf = true;
  if (req.items && req.items.length) why.push('needs ' + req.items.map(i => i.name).join(', ') + ' in the bag');
  if (req.quests && req.quests.length) why.push('needs quest ' + req.quests.map(q => `${q.id} ${q.need}`).join(', '));
  if (x.type === 'daily') why.push('daily: once a day');
  if (x.parse && x.parse.status === 'partial') why.push('partly parsed: ' + reasons.slice(0, 2).join('; '));
  return {
    id: Number(x.id), name: x.name, levels: [lvl.min || 1, lvl.max || null], type: x.type, endless,
    adenaRun, itemValueRun, runMin, kills: Math.round(kills), adenaHour, valueHour, score: altRewards ? Math.max(adenaHour, valueHour) : adenaHour + valueHour,
    confidence: lowConf ? 'low' : 'high',
    startNpc: start ? { id: start.id, name: start.name, town: start.town || start.region || '' } : null,
    endNpc: endNpc && endNpc !== start ? { id: endNpc.id, name: endNpc.name, town: endNpc.town || endNpc.region || '' } : null,
    hunt: { monsters: (huntMons.length ? huntMons : killMons).slice(0, 5).map(m => m.name), ids: (huntMons.length ? huntMons : killMons).slice(0, 5).map(m => m.id),
      level: huntLevel, area: area || '', at: huntAt, landing: landing ? landing.desc : '' },
    items: runItems.concat(fixedItems.filter(i => !runItems.includes(i))).map(id => ({ id, name: itemName(id), perKill: Math.round(rate[id] * 1000) / 1000, need: need[id] || null })),
    batch, races: req.races || [], notRaces: req.notRaces || [], classes: req.classes || [], categories: req.categories || [],
    why: why.join('; '),
  };
}

// ---------------------------------------------------------------- run
const out = [], skipped = [];
Object.values(Q).forEach(x => {
  const rep = x.type === 'repeatable' || x.type === 'daily' || x.endless;
  if (!rep) return;
  const lv = x.level || {};
  if (lv.min != null && lv.min > A.maxLevel) return;
  if (x.type === 'daily' && (lv.min || 0) > A.maxLevel) return;
  let r; try { r = planQuest(x); } catch (e) { r = { skip: true, id: x.id, name: x.name, why: 'planner error: ' + e.message }; }
  if (r.skip) skipped.push({ id: Number(r.id), name: r.name, why: r.why }); else out.push(r);
});
out.sort((a, b) => b.score - a.score);
const byLevel = {};
for (let L = A.minLevel; L <= A.maxLevel; L++) {
  const fit = [], low = [], weak = [];
  out.forEach(q => {
    if (q.type === 'daily') return;
    if (q.levels[0] > L || (q.levels[1] && q.levels[1] < L)) return;
    const hl = q.hunt.level || q.levels[0];
    if (hl > L + A.tooHigh) return;
    (q.confidence === 'low' ? weak : hl < L - A.wasted ? low : fit).push(q.id);
  });
  byLevel[L] = fit.concat(low, weak);
}
// prices cache: every reward item of the listed quests (lets the tool run without the datapack)
const prices = Object.assign({}, (OLD.meta && OLD.meta.prices) || {});
Object.values(Q).forEach(x => { const R = x.rewards || {}; [].concat(R.final || [], R.turnIns || []).forEach(r => (r.items || []).forEach(i => { if (PR.prices[i.id] != null) prices[i.id] = PR.prices[i.id]; })); });
const keepUser = (k, d) => (OLD[k] !== undefined ? OLD[k] : d);
const file = {
  on: keepUser('on', false), collector: keepUser('collector', ''), chars: keepUser('chars', []), tradeAbove: keepUser('tradeAbove', 200000),
  keep: keepUser('keep', 20000), override: keepUser('override', {}),
  meta: { generated: new Date().toISOString(), tool: 'docs/plan/tools/quest_farm_plan.js', prices: prices, priceSource: PR.src, notes: NOTES,
    fields: { on: 'farm switched on', collector: 'character that receives the adena', chars: 'farming characters', tradeAbove: 'a farmer trades its adena to the collector when it holds more than this',
      keep: 'adena a farmer keeps after the trade', override: '{ <character>: <quest id> } forces a quest for that character' },
    counts: { ranked: out.length, skipped: skipped.length }, skipped },
  plan: { quests: out, byLevel },
};
// keep any other user field the dashboard / bots added
Object.keys(OLD).forEach(k => { if (!(k in file) && k !== 'meta' && k !== 'plan') file[k] = OLD[k]; });
const tmp = OUT + '.tmp';
fs.writeFileSync(tmp, JSON.stringify(file, null, 1)); fs.renameSync(tmp, OUT);

// ---------------------------------------------------------------- markdown
const fmt = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const reqTxt = (q) => [q.races.length ? q.races.join('/') + ' only' : '', q.notRaces.length ? 'not ' + q.notRaces.join('/') : '', q.classes.length ? q.classes.join('/') : '', q.categories.length ? q.categories.join('/') : ''].filter(Boolean).join(', ');
const where = (q) => `${q.startNpc ? q.startNpc.name + ' (' + q.startNpc.town + ')' : '?'}${q.hunt.monsters.length ? ' · ' + q.hunt.monsters.slice(0, 3).join(', ') + (q.hunt.area ? ' — ' + q.hunt.area : '') : ''}`;
const L = [];
L.push('# Quest farm (adena from repeatable quests, levels 1-40)', '');
L.push(`Generated ${file.meta.generated} by \`node docs/plan/tools/quest_farm_plan.js\` from \`Scripts/data/quests_h5.json\` (L2J High Five datapack). ` +
  `${out.length} repeatable quests ranked, ${skipped.length} skipped. Item prices: ${PR.src}.`, '');
L.push('## How it is computed', '',
  'One **run** = take the quest at its start NPC, walk / teleport to the hunting place, kill until the counted items are collected, hand them in (and retake the quest when it ends).', '',
  '- **Hunt monsters** = the monsters that drop the quest\'s counted / needed items, weighted by their spawn count (a bot kills what stands there).',
  '- **Per kill** = drop chance x average amount, per item. A paid item nobody drops (map pieces that turn into a map) = the piece rate / its limit.',
  '- **Turn-in quests** (adena per item, e.g. "12 adena per Imp Shackle + 500 when you bring 10+"): the batch size (`batch` = items per hand-in) is chosen for the best adena per hour; hunting per batch is capped at 30 min.',
  '- **Fixed quests**: kills = needed count / rate per item (the quest\'s own counts, else the drop limit).',
  '- **Run time** = 20 s per NPC talk + travel along start NPC -> other quest NPCs -> hunting cluster -> hand-in NPC (walk, or a teleport when shorter) + kills x kill time.',
  '- **Adena per run** from the quest record: fixed amount, per item + bonus + base, random amount x chance, or a simple formula (variables = the collected items, split evenly).',
  '- **Item value** = NPC sell price (datapack price / 2) x count (x chance). Lists without a chance are alternatives: averaged (max when the player chooses).',
  '- **score = adena/hour + item value/hour** (the better of the two when the quest pays adena OR items). `plan.byLevel[L]` = quests a level-L character can take whose hunt monsters are at most L+5, best score first; quests with monsters below L-10 come after the fitting ones, low-confidence estimates last. Daily quests are never in byLevel.', '');
L.push('### Assumptions', ''); NOTES.forEach(n => L.push('- ' + n)); L.push('');
L.push('## Top 20', '', '| # | id | Quest | Levels | Adena/h | Value/h | Run (min) | Batch | Conf. | Requirements | Where |', '|---|---|---|---|---|---|---|---|---|---|---|');
out.slice(0, 20).forEach((q, i) => L.push(`| ${i + 1} | ${q.id} | ${q.name} | ${q.levels[0]}${q.levels[1] ? '-' + q.levels[1] : '+'} | ${fmt(q.adenaHour)} | ${fmt(q.valueHour)} | ${q.runMin} | ${q.batch || ''} | ${q.confidence} | ${reqTxt(q) || 'any'} | ${where(q)} |`));
L.push('');
L.push('## Best picks per level band', '', 'Numbers = score per hour (adena + item value). Higher bands still list low-level race quests after the fitting ones.', '');
const byId = {}; out.forEach(q => { byId[q.id] = q; });
[[1, 5], [6, 10], [11, 15], [16, 20], [21, 25], [26, 30], [31, 35], [36, 40]].forEach(([a, b]) => {
  const ids = byLevel[b] || [];
  const any = ids.filter(id => { const q = byId[id]; return q && !q.races.length && !q.classes.length && !q.categories.length; }).slice(0, 3);
  const race = ids.filter(id => { const q = byId[id]; return q && (q.races.length || q.classes.length || q.categories.length); }).slice(0, 3);
  L.push(`- **Level ${a}-${b}** (list for level ${b}): any race: ${any.map(id => `${id} ${byId[id].name} (${fmt(byId[id].score)}/h)`).join(', ') || '—'}` +
    (race.length ? `; race / class only: ${race.map(id => `${id} ${byId[id].name} [${reqTxt(byId[id])}] (${fmt(byId[id].score)}/h)`).join(', ')}` : ''));
});
L.push('');
L.push('## How to use the farm', '',
  '1. New characters: create the accounts on the dashboard with **+ Add account** (never by hand). Low-level characters of any race work; race-only quests (Dark Elf, Orc, Dwarf …) rank high, so a mix of races uses more of the list.',
  '2. Dashboard **Quests** page -> **Quest farm** section: tick the farming characters, pick the collector, set "trade above" / "keep", switch it on. That writes the user fields of `Scripts/data/quest_farm.json` (this tool never overwrites them).',
  '3. Each farming character repeats the best quest for its level (`plan.byLevel[<level>][0]`, or `override.<name>`), with the batch size from `plan.quests[].batch`.',
  '4. When a farmer holds more than `tradeAbove` adena it trades everything above `keep` to the collector through the existing hand-over (Trade page plumbing, `Logs/handover/qf_*.json`).',
  '5. Re-run the planner after a datapack / quest data update: `node docs/plan/tools/quest_farm_plan.js`.', '',
  '### `Scripts/data/quest_farm.json` fields', '',
  '| Field | Meaning |', '|---|---|',
  ...Object.keys(file.meta.fields).map(k => `| \`${k}\` | ${file.meta.fields[k]} |`),
  '| `plan.quests[]` | id, name, levels, adenaRun, itemValueRun, runMin, kills, adenaHour, valueHour, score, startNpc, endNpc, hunt {monsters, ids, level, area, at, landing}, items [{id, name, perKill, need}], batch, races, notRaces, classes, categories, why |',
  '| `plan.byLevel` | "1" … "40" -> quest ids best first. Race / class requirements are NOT applied here: the bot skips ids whose races / notRaces / classes / categories do not fit the character |', '');
L.push('## Skipped', '', '| id | Quest | Why |', '|---|---|---|');
skipped.sort((a, b) => a.id - b.id).forEach(s => L.push(`| ${s.id} | ${s.name} | ${String(s.why).replace(/\|/g, '/')} |`));
L.push('');
fs.writeFileSync(MD + '.tmp', L.join('\n')); fs.renameSync(MD + '.tmp', MD);

console.log(`${out.length} ranked, ${skipped.length} skipped -> ${path.relative(ROOT, OUT)}, ${path.relative(ROOT, MD)} (prices: ${PR.src})`);
out.slice(0, 15).forEach((q, i) => console.log(`${i + 1}. [${q.confidence}] ${q.id} ${q.name} L${q.levels[0]} ${fmt(q.adenaHour)} a/h + ${fmt(q.valueHour)} v/h, run ${q.runMin} min, kills ${q.kills}, batch ${q.batch}, adena/run ${q.adenaRun} ${reqTxt(q)} ${q.why ? '| ' + q.why : ''}`));
