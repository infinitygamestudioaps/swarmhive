// OUR CRAFTER (CRAFTER-2026-10-15, Discord player Vykaax: "crafter supplier"): a Dwarf crafter keeps shots in stock and supplies parties first.
// Pure checks of swarm.js CRAFT-PURE: the recipe table against the H5 datapack (Scripts/data/dp/recipes.xml) and L2Swarm's Data/base.db Recipes,
// the packet layouts against L2Swarm's own packet catalog (Data/base.db PacketsGSClient B5/B8, PacketsGSServer DC/DD), the bytes we send and parse,
// settings (default OFF, the same reading in Dashboard/crafter_api.js), recipe picking + ingredient maths + "what is missing" text, daily limits,
// the supply ORDER (crafter > NPC shop > player shops) and the wiring in leadSupply, the dashboard API (validation, rev conflict, history),
// the command catalog.   node docs/plan/tools/test_crafter.js
'use strict';
const fs = require('fs'), path = require('path'), zlib = require('zlib'), os = require('os');
const ROOT = path.resolve(__dirname, '..', '..', '..');
// NO_DP_SKIP 2026-10-15: the server datapack (Scripts/data/dp) is not shipped in the public package — these checks need its recipes.xml
if (!fs.existsSync(path.join(ROOT, 'Scripts', 'data', 'dp', 'recipes.xml'))) { console.log('skipped: needs the server datapack (Scripts/data/dp/recipes.xml), not in this install'); process.exit(0); }
const src = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
const cut = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b); if (i < 0 || j < i) throw new Error('block missing: ' + a); return src.slice(i, j); };
const P = new Function(cut('// CRAFT-PURE-BEGIN', '// CRAFT-PURE-END') +
  '\nreturn { CRAFT_RECIPES, CRAFT_MATS, craftRecipe, craftByProduct, craftName, craftCfgOf, craftCrafterFor, craftDay, craftDailyLeft, craftMatText, craftPlan, craftBytes, craftParseBook, craftParseResult, craftMakeHex, craftBookHex, craftSupplySplit, craftSupplyDecide, craftFmt };')();
const API = require(path.join(ROOT, 'Dashboard', 'crafter_api.js'));
let fails = 0; const check = (c, n, info) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${n}${!c && info ? ' — ' + info : ''}`); if (!c) fails++; };

// ---- 1. the recipe table = the H5 datapack
{ const xml = fs.readFileSync(path.join(ROOT, 'Scripts', 'data', 'dp', 'recipes.xml'), 'utf8');
  const bad = [];
  P.CRAFT_RECIPES.forEach(r => {
    const m = xml.match(new RegExp(`<item id="${r.list}" recipeId="(\\d+)" name="[^"]*" craftLevel="(\\d+)" type="dwarven" successRate="(\\d+)">([\\s\\S]*?)</item>`));
    if (!m) { bad.push(r.key + ': not in recipes.xml'); return; }
    const ing = [...m[4].matchAll(/<ingredient id="(\d+)" count="(\d+)" \/>/g)].map(x => [Number(x[1]), Number(x[2])]);
    const pr = m[4].match(/<production id="(\d+)" count="(\d+)" \/>/), mp = m[4].match(/<statUse name="MP" value="(\d+)" \/>/);
    if (Number(m[1]) !== r.scroll || Number(m[2]) !== r.lvl || m[3] !== '100' || !pr || Number(pr[1]) !== r.product || Number(pr[2]) !== r.count || !mp || Number(mp[1]) !== r.mp || JSON.stringify(ing) !== JSON.stringify(r.ing)) bad.push(r.key);
  });
  check(P.CRAFT_RECIPES.length === 15 && !bad.length, 'all 15 shot recipes (soulshot / spiritshot / blessed spiritshot D-S) match recipes.xml: list id, scroll, Create Item level, product, count, MP, ingredients, 100 %', bad.join(', '));
  check(P.craftRecipe('soulshot:C').list === 21 && P.craftRecipe('soulshot:C').scroll === 1805 && P.craftByProduct(3949).key === 'blessed:C' && P.craftByProduct(1835) === null, 'lookups by key / product (no-grade shots cannot be crafted)');
  check(JSON.stringify(P.CRAFT_RECIPES) === JSON.stringify(API.CRAFT_RECIPES), 'Dashboard/crafter_api.js has the same recipe table');
}
// ---- 2. Data/base.db: the Recipes table + the packet catalog
function baseDb(names) {
  const out = {};
  const z = fs.readFileSync(path.join(ROOT, 'Data', 'base.db'));
  const eocd = z.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  let cd = z.readUInt32LE(eocd + 16); const n = z.readUInt16LE(eocd + 10);
  for (let i = 0; i < n; i++) {
    const meth = z.readUInt16LE(cd + 10), csz = z.readUInt32LE(cd + 20), nl = z.readUInt16LE(cd + 28), el = z.readUInt16LE(cd + 30), cl = z.readUInt16LE(cd + 32), off = z.readUInt32LE(cd + 42);
    const name = z.toString('utf8', cd + 46, cd + 46 + nl);
    if (names.includes(name)) { const lnl = z.readUInt16LE(off + 26), lel = z.readUInt16LE(off + 28), data = z.subarray(off + 30 + lnl + lel, off + 30 + lnl + lel + csz); out[name] = (meth === 8 ? zlib.inflateRawSync(data) : data).toString('utf8').split(/\r?\n/); }
    cd += 46 + nl + el + cl;
  }
  return out;
}
{ let db = null, why = ''; try { db = baseDb(['Recipes', 'PacketsGSClient', 'PacketsGSServer']); } catch (e) { why = e.message; }
  if (!db || !db.Recipes) console.log(`skip Data/base.db not readable here (${why || 'no Recipes'})`);
  else {
    const bad = P.CRAFT_RECIPES.filter(r => { const l = db.Recipes.find(x => x.startsWith(r.list + '=')); return l !== `${r.list}=${r.scroll}=${r.lvl}=0=100=${r.product}=${r.count}=${r.mp}=${r.ing.map(i => i.join(',')).join('|')}`; }).map(r => r.key);
    check(!bad.length, "L2Swarm's own Recipes table (ID=RECP_ID=CRAFT_LEVEL=CRAFT_TYPE=SUCCESS_RATE=ITEM_ID=ITEM_COUNT=MP_COST=INGREDIENTS) agrees row by row", bad.join(', '));
    const line = (t, op) => (db[t].find(l => l.startsWith(op + '=')) || '').trim();
    check(line('PacketsGSClient', 'B5') === 'B5=RequestRecipeBookOpen=d(isDwarvenCraft)', 'catalog B5 RequestRecipeBookOpen = d(isDwarvenCraft)', line('PacketsGSClient', 'B5'));
    check(line('PacketsGSClient', 'B8') === 'B8=RequestRecipeItemMakeSelf=d(RecipeID:Get.F3)', 'catalog B8 RequestRecipeItemMakeSelf = d(RecipeID looked up in the Recipes table by its ID column = the list id)', line('PacketsGSClient', 'B8'));
    check(line('PacketsGSServer', 'DC') === 'DC=RecipeBookItemList=d(isDwarvenCraft)d(MaxMP)d(RecipesCount:Loop.01.0002)d(RecipeID:Get.F3)d(num)', 'catalog DC RecipeBookItemList = d type, d maxMP, d count, count x [d list id, d slot]', line('PacketsGSServer', 'DC'));
    check(line('PacketsGSServer', 'DD') === 'DD=RecipeItemMakeInfo=d(OID)d(isDwarvenRecipe)d(CurrentMP)d(MaxMP)d(isSuccess)', 'catalog DD RecipeItemMakeInfo = d id, d type, d curMP, d maxMP, d success', line('PacketsGSServer', 'DD'));
    check(/^D06600=RequestSendPost=/.test(line('PacketsGSClient', 'D06600')), 'mail exists in the client catalog (RequestSendPost) — NOT used: not verified on L2Toggle (see the guide)');
  }
}
// ---- 3. bytes we send + parse
check(P.craftMakeHex(20) === 'B814000000' && P.craftMakeHex(327) === 'B847010000', 'RequestRecipeItemMakeSelf: B8 + d(list id) little-endian, upper-case, no spaces (Send.SendHex)');
check(P.craftBookHex(true) === 'B500000000' && P.craftBookHex() === 'B500000000' && P.craftBookHex(false) === 'B501000000', 'RequestRecipeBookOpen: d 0 = the DWARVEN book (L2J reads readD() == 0 as dwarven), 1 = common');
{ const le = (v) => [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255];
  const body = [0xDC].concat(le(0), le(1234), le(3), le(20), le(1), le(323), le(2), le(21), le(3));
  const withHdr = [(body.length + 2) & 255, (body.length + 2) >> 8].concat(body);
  const b1 = P.craftBytes(withHdr, withHdr.length, [0xDC, 0xDD]), b2 = P.craftBytes(body, body.length, [0xDC, 0xDD]);
  const bk = P.craftParseBook(b1);
  check(b1 && b1[0] === 0xDC && b2 && b2[0] === 0xDC && P.craftBytes([0x10, 0, 0x20], 3, [0xDC]) === null, "craftBytes: with L2Swarm's 2-byte length header and without; other packets = null");
  check(bk && bk.dwarven && bk.maxMp === 1234 && JSON.stringify(bk.ids) === '[20,323,21]', 'RecipeBookItemList parsed: dwarven, max MP, the list ids', JSON.stringify(bk));
  check(P.craftParseBook([0xDC].concat(le(1), le(10), le(0))).dwarven === false && P.craftParseBook([0xDD]) === null, 'the common book is not the dwarven one; other opcodes = null');
  const rs = P.craftParseResult([0xDD].concat(le(21), le(0), le(500), le(900), le(1))), rf = P.craftParseResult([0xDD].concat(le(21), le(0), le(10), le(900), le(0)));
  check(rs.list === 21 && rs.ok && rs.mp === 500 && rs.maxMp === 900 && rf.ok === false, 'RecipeItemMakeInfo parsed: list id, MP, success flag'); }

// ---- 4. settings: default OFF; cleaned; the same in the API
const J = { crafters: { Crafter1: { on: true, town: 'Giran', parties: ['Tank1', 'bad name!', 'Dagger1', 'Tank1'], stock: { 'soulshot:C': 5000, 'soulshot:X': 9, 'blessed:B': '2000', 'spiritshot:D': -5 }, daily: { C: 100, soulOre: '300' }, maxBatches: 500 },
  Alldwarf: { on: true, parties: ['*'], town: 'Nowhere' }, Offy: { on: false, parties: ['*'] } } };
{ const f = P.craftCfgOf(J, 'Crafter1'), n = P.craftCfgOf({}, 'Crafter1'), a = P.craftCfgOf(J, 'Alldwarf');
  check(n.on === false && n.exists === false && n.town === 'Giran' && !Object.keys(n.stock).length && n.maxBatches === 20 && n.learn === false, 'no file / no entry = OFF (town Giran, nothing in stock, 20 crafts per round, never learns by itself)');
  check(f.on && JSON.stringify(f.parties) === '["Tank1","Dagger1"]' && JSON.stringify(f.stock) === '{"soulshot:C":5000,"blessed:B":2000}' && f.daily.C === 100 && f.daily.soulOre === 300 && f.daily.D === 0 && f.maxBatches === 20, 'cleaned: bad names / unknown shots / negative numbers dropped, duplicates removed, maxBatches out of range = default', JSON.stringify(f));
  check(a.town === 'Giran' && P.craftCfgOf({ crafters: { X: { on: 'yes' } } }, 'X').on === false, 'an unknown town = Giran; "on" must be exactly true');
  ['Crafter1', 'Alldwarf', 'Offy', 'Nobody'].forEach(nm => check(JSON.stringify(P.craftCfgOf(J, nm)) === JSON.stringify(API.craftCfgOf(J, nm)), `swarm.js craftCfgOf = Dashboard/crafter_api.js craftCfgOf (${nm})`)); }
check(P.craftCrafterFor(J, 'Dagger1') === 'Alldwarf' && P.craftCrafterFor({ crafters: { Crafter1: J.crafters.Crafter1 } }, 'Dagger1') === 'Crafter1', 'the crafter for a party: switched on + the party on its list or "*" (first by name)');
check(P.craftCrafterFor({ crafters: { Crafter1: J.crafters.Crafter1 } }, 'Crafter1') === '' && P.craftCrafterFor({ crafters: { Offy: { on: false, parties: ['*'] } } }, 'Tank1') === '' && P.craftCrafterFor({}, 'Tank1') === '', 'never itself; a switched-off crafter supplies nobody; no file = nobody');
['Tank1', 'Dagger1', 'Crafter1', 'X'].forEach(L => check(P.craftCrafterFor(J, L) === API.craftCrafterFor(J, L), `craftCrafterFor = the API's (${L})`));

// ---- 5. the crafting day (resets 06:30 local) + daily limits
check(P.craftDay(new Date(2026, 9, 15, 6, 29)) === '2026-10-14' && P.craftDay(new Date(2026, 9, 15, 6, 31)) === '2026-10-15', 'the crafting day turns over at 06:30 local (like the dailies)');
{ const c = P.craftCfgOf(J, 'Crafter1');
  check(P.craftDailyLeft(c, { 1459: 40 }, 1459) === 60 && P.craftDailyLeft(c, {}, 1458) === Infinity && P.craftDailyLeft(c, { 1785: 400 }, 1785) === 0, 'daily left: limit - used today; 0 = no limit; never below 0'); }

// ---- 6. recipe picking + ingredient maths + what is missing
{ const cfg = P.craftCfgOf({ crafters: { F: { on: true, stock: { 'soulshot:C': 1000, 'soulshot:D': 1000, 'blessed:C': 400, 'soulshot:S': 350 } } } }, 'F');
  const all = [20, 21, 324, 24];
  let pl = P.craftPlan(cfg, { bag: { 1785: 30 }, createLvl: 7, known: all, used: {} });
  const c = pl.rows.find(r => r.key === 'soulshot:C');
  check(c.want === 2 && c.need[1785] === 60 && c.need[1459] === 4 && c.missing[1459] === 4 && c.missing[1785] === 30 && c.can === 0, '1000 C soulshots = 2 crafts (952 each) = 60 Soul Ore + 4 C crystals; with 30 Soul Ore: missing 4 C crystals + 30 Soul Ore', JSON.stringify(c));
  check(c.text === 'Soulshot (C): 0 of 1,000 — needs 4 C crystals + 60 Soul Ore for 1,000 Soulshot (C); missing 4 C crystals + 30 Soul Ore', 'the plain sentence says exactly what is missing', c.text);
  const s = pl.rows.find(r => r.key === 'soulshot:S');
  check(s.can === 0 && /needs Create Item level 8 \(mine 7\)/.test(s.why), 'S soulshots need Create Item 8 (Warsmith level 62): said plainly', s.why);
  pl = P.craftPlan(cfg, { bag: { 1785: 1000, 1458: 100, 1459: 100, 3031: 1000, 1463: 400 }, createLvl: 7, known: all, used: {} });
  const d = pl.rows.find(r => r.key === 'soulshot:D'), cc = pl.rows.find(r => r.key === 'soulshot:C');
  check(d.short === 600 && d.want === 2 && d.can === 2 && cc.can === 2, 'enough of everything: crafts = ceil(short / per craft)');
  check(pl.next && pl.next.key === 'blessed:C' || pl.next.key === 'soulshot:C', 'next = the most-short shot relative to its target (C soulshots / blessed C are at 0 %)', pl.next && pl.next.key);
  check(P.craftPlan(cfg, { bag: { 1785: 1000, 1459: 100, 1464: 5000 }, createLvl: 7, known: all }).rows.find(r => r.key === 'soulshot:C').why === 'stock is full', 'a full stock is not crafted');
  // limits + recipes
  const cfgL = P.craftCfgOf({ crafters: { F: { on: true, stock: { 'soulshot:C': 3000 }, daily: { C: 10 } } } }, 'F');
  const lim = P.craftPlan(cfgL, { bag: { 1785: 1000, 1459: 100 }, createLvl: 7, known: [21], used: { 1459: 6 } }).rows[0];
  check(lim.want === 4 && lim.can === 2 && /can make 1,904 of 3,000 now/.test(lim.why), 'a daily limit of 10 C crystals with 6 used = 2 more crafts today', JSON.stringify(lim));
  const lim0 = P.craftPlan(cfgL, { bag: { 1785: 1000, 1459: 100 }, createLvl: 7, known: [21], used: { 1459: 10 } }).rows[0];
  check(lim0.can === 0 && /daily limit reached for C crystals/.test(lim0.why), 'the limit used up: "daily limit reached" (not "missing")', lim0.why);
  const nr = P.craftPlan(cfgL, { bag: { 1785: 1000, 1459: 100 }, createLvl: 7, known: [20] }).rows[0];
  const ns = P.craftPlan(cfgL, { bag: { 1785: 1000, 1459: 100, 1805: 1 }, createLvl: 7, known: [20], learnable: [21] }).rows[0];
  check(nr.can === 0 && /recipe not learned — needs "Recipe: Soulshot \(C\)"/.test(nr.why) && /is in the bag/.test(ns.why), 'a recipe that is not in the book: said, and when its scroll is in the bag that is said too', nr.why + ' | ' + ns.why);
  check(P.craftPlan(cfgL, { bag: { 1785: 1000, 1459: 100 }, createLvl: 7, known: null }).rows[0].can === 4, 'book not read yet (null) = not blocked by it (the craft itself then answers)');
  check(P.craftMatText({ 1785: 30, 1459: 120 }) === '120 C crystals + 30 Soul Ore', 'crystals first, then ore'); }

// ---- 7. supply order: crafter > NPC shop > player shops
{ const sp = P.craftSupplySplit([{ id: 1464, name: 'Soulshot (C)', count: 3000 }, { id: 1463, name: 'Soulshot (D)', count: 500 }, { id: 736, name: 'Scroll of Escape', count: 5 }, { id: 3950, name: 'Blessed Spiritshot (B)', count: 200 }],
    { 1464: 2000, 1463: 10000, 736: 99 }, { 1463: 9800 });
  check(JSON.stringify(sp.take) === JSON.stringify([{ id: 1464, name: 'Soulshot (C)', count: 2000 }, { id: 1463, name: 'Soulshot (D)', count: 200 }]), 'from the crafter: what it has of shots it can craft (minus what it keeps back); never scrolls', JSON.stringify(sp.take));
  check(JSON.stringify(sp.rest.map(r => [r.id, r.count])) === JSON.stringify([[1464, 1000], [1463, 300], [736, 5], [3950, 200]]), 'the rest goes to the shop NPC, then (B / A / S) the player shops', JSON.stringify(sp.rest)); }
{ const T = 1e12, st = { at: T - 60000, town: 'Giran' };
  check(P.craftSupplyDecide({ crafter: 'F', status: st, recv: { town: 'Giran' }, myTown: 'Giran', nowMs: T }).act === 'take', 'crafter reports + stands in my town: take');
  check(/not here in Giran — no trip/.test(P.craftSupplyDecide({ crafter: 'F', status: { at: T, town: 'Dion' }, recv: { town: 'Dion' }, myTown: 'Giran', nowMs: T }).why), 'crafter in another town: skip with a note, no trip');
  check(/out in the field/.test(P.craftSupplyDecide({ crafter: 'F', status: { at: T, town: '' }, recv: { town: '' }, myTown: 'Giran', nowMs: T }).why), 'crafter in the field: skip');
  check(/has not reported/.test(P.craftSupplyDecide({ crafter: 'F', status: { at: T - 11 * 60000, town: 'Giran' }, myTown: 'Giran', nowMs: T }).why) && /has not reported/.test(P.craftSupplyDecide({ crafter: 'F', status: null, myTown: 'Giran', nowMs: T }).why), 'no report for 10 minutes / never: skip (buy everything)');
  check(/dead/.test(P.craftSupplyDecide({ crafter: 'F', status: st, recv: { town: 'Giran', dead: true }, myTown: 'Giran', nowMs: T }).why) && P.craftSupplyDecide({}).act === 'skip', 'dead crafter / none: skip'); }
{ const ls = src.slice(src.indexOf('async function leadSupply('), src.indexOf('async function leadSupply(') + 40000);
  const iC = ls.indexOf('await crafterSupplyStep(total, runId)'), iB = ls.indexOf('const buys = Object.values(total)'), iShop = ls.indexOf("T.mark('shop'"), iP = ls.indexOf('pshopRes = await pshopBuyRun(buys, why)'), iH = ls.indexOf("pstStep('supply', 'hand out'");
  check(iC > 0 && iB > iC && iShop > iB && iP > iShop && iH > iP, 'leadSupply order: our crafter -> the buys worked out from my bag after it -> Helvetia -> player shops -> hand-out', [iC, iB, iShop, iP, iH].join(','));
  check(/const have = itemCount\(t\.id\)/.test(ls.slice(iB, iB + 400)), 'the NPC buys use the live bag count (so what the crafter gave is not bought again)');
  check(/craftCrafterFor\(craftRules\(\), Me\.Name\) && regroupAlive\(runId\)/.test(ls) && /'our crafter'/.test(ls), 'only when a crafter supplies this party; its own step on the party status line'); }
{ const st = src.slice(src.indexOf('async function crafterSupplyStep('), src.indexOf('async function crafterSupplyStep(') + 5000);
  check(/kind: 'crafter'/.test(st) && /hovCommand\(\['!handover', id\]\)/.test(st) && /App\.emit\('swarm\.hovcall'/.test(st), 'the crafter brings the shots through the HANDOVER machinery (walk over in town, receiver stands still, batches)');
  check(/craftSupplyDecide\(/.test(st) && /craftSupplySplit\(/.test(st) && /480000/.test(st), 'decide (same town only) + split, waits at most 8 min'); }
{ const tk = src.slice(src.indexOf('async function craftTick('), src.indexOf('async function craftTick(') + 7000);
  check(/takeControl\('craft', PRIO\.UPKEEP\)/.test(tk) && /interrupted\(g0\)/.test(tk) && /craftBusyWhy\(\)/.test(tk), 'one owner: crafting holds the lowest control (P6) and steps aside for anything more important; never while busy (raid / hand-over / trade / order / fight)');
  check(/myTown !== cfg\.town/.test(tk) && /never travel/.test(tk), 'crafts only in its own town, never travels for it');
  check(!/Crystallize|crystallize\(/.test(tk) && !/RequestCrystallize/.test(cut('// CRAFT-PURE-BEGIN', 'async function crafterSupplyStep(')), 'never crystallizes anything');
  const iv = src.slice(src.indexOf('const CRAFTX = {'), src.indexOf('async function crafterSupplyStep('));
  check(/!cfg\.on \|\| !runOnOrCollector\(\)/.test(iv), 'automatic crafting only when switched on AND its party runs (or it is the collector); !craft always works');
  check(/case '!craft'/.test(src) && /craftCommand\(parts\)/.test(src), '!craft order'); }

// ---- 8. the dashboard API
{ const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'crafter-')); const F = path.join(tmp, 'crafter_rules.json');
  process.env.SWARM_CRAFTER_FILE = F;
  const ctx = { DATA: tmp, LOGS: tmp, ROOT, DIR: path.join(ROOT, 'Dashboard') };
  let r = API.post(ctx, { name: 'Crafter1', values: { on: true, town: 'Giran', parties: ['Tank1'], stock: { 'soulshot:C': 5000, 'blessed:B': 2000 }, daily: { C: 100 }, learn: false, maxBatches: 10 } });
  check(r && r.ok && fs.existsSync(F), 'save a crafter', JSON.stringify(r));
  const saved = JSON.parse(fs.readFileSync(F, 'utf8'));
  check(saved.crafters.Crafter1.on === true && saved.crafters.Crafter1.stock['soulshot:C'] === 5000 && saved._about && saved.v === 1, 'the file holds the entry + an explanation');
  r = API.post(ctx, { name: 'Crafter1', values: { stock: { 'soulshot:C': null, 'soulshot:D': 0 } }, rev: 'wrong' });
  check(r.code === 409 && r.conflict, 'a stale rev = 409 (someone saved meanwhile)');
  const rev = API.readFile(ctx).rev;
  r = API.post(ctx, { name: 'Crafter1', values: { stock: { 'soulshot:C': null } }, rev });
  check(r.ok && !('soulshot:C' in JSON.parse(fs.readFileSync(F, 'utf8')).crafters.Crafter1.stock), 'null removes a stock target');
  check(!!r.history && /crafter_rules/.test(r.history), 'the old version is kept as a history copy (manual_guard)', r.history);
  r = API.post(ctx, { name: 'Crafter1', values: { town: 'Mars', parties: ['bad name!'], stock: { 'soulshot:Z': 5 }, maxBatches: 0, color: 1 } });
  check(r.code === 400 && r.errors.length === 5, 'bad values are refused with plain reasons (town, parties, unknown shot, maxBatches, unknown setting)', JSON.stringify(r.errors));
  r = API.post(ctx, { name: 'bad name!', values: {} });
  check(r.code === 400, 'a bad crafter name is refused');
  r = API.post(ctx, { name: 'Crafter1', remove: true });
  check(r.ok && !JSON.parse(fs.readFileSync(F, 'utf8')).crafters.Crafter1, 'remove = the entry is gone (= off)');
  const inf = API.info(Object.assign({}, ctx, { readStates: () => [{ name: 'Crafter1', roleKind: 'crafter', cls: 'Warsmith', level: 61, party: 'Crafter1', ageSec: 10 }, { name: 'Tank1', cls: 'Shillien Knight' }] }));
  check(inf.candidates.length === 1 && inf.candidates[0].name === 'Crafter1' && inf.crafters.some(c => c.name === 'Crafter1') && inf.recipes.length === 15, 'GET lists the Dwarf crafters online as candidates + the recipe table');
  delete process.env.SWARM_CRAFTER_FILE;
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { } }
{ const seed = JSON.parse(fs.readFileSync(path.join(ROOT, 'Scripts', 'data', 'crafter_rules.json'), 'utf8'));
  check(seed.v === 1 && !Object.keys(seed.crafters).length, 'the shipped Scripts/data/crafter_rules.json: nobody crafts (OFF)'); }
// ---- 9. commands + dashboard wiring
{ const C = require(path.join(ROOT, 'Dashboard', 'commands.js'));
  check(C.classify('!craft Crafter1').id === 'craft' && C.classify('!craft book Crafter1').id === 'craftbook' && C.classify('!craft one soulshot:D Crafter1').id === 'craftone', 'the command catalog knows !craft, !craft book, !craft one');
  const idx = fs.readFileSync(path.join(ROOT, 'Dashboard', 'index.html'), 'utf8'), stg = fs.readFileSync(path.join(ROOT, 'Dashboard', 'storagepage.js'), 'utf8'), ps = fs.readFileSync(path.join(ROOT, 'Dashboard', 'partysettings.js'), 'utf8'), sv = fs.readFileSync(path.join(ROOT, 'Dashboard', 'server.js'), 'utf8');
  check(/\/crafterpanel\.js/.test(idx) && /id="stgCraft"/.test(stg) && /data-crafter-party=/.test(ps) && /require\('\.\/crafter_api'\)/.test(sv), 'dashboard: server hook, script include, Storage page box, party settings line');
  const pan = fs.readFileSync(path.join(ROOT, 'Dashboard', 'crafterpanel.js'), 'utf8');
  check(!/\b(alert|confirm|prompt)\(/.test(pan.replace(/uiConfirm|uiAlert|uiPrompt/g, '')), 'no browser alert / confirm / prompt in the panel'); }

console.log(fails ? `\n${fails} FAILED` : '\nall crafter checks passed'); process.exit(fails ? 1 : 0);
