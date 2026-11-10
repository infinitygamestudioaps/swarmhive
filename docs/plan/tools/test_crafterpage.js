// test_crafterpage.js - requirement pages.md "Clan crafter #/crafter" (owner 2026-11-01: stock targets per shot, the needs, normal-cost prices,
// the clan bank ledger) + CLANALLOWREAD (the clan warehouse allow list read from the real page). Sandbox only: never the live data files.
const fs = require('fs'), path = require('path'), os = require('os');
const ROOT = path.join(__dirname, '..', '..', '..');
let ok = 0, bad = 0; const t = (m, c, info) => { if (c) { ok++; console.log('ok   ' + m); } else { bad++; console.log('FAIL ' + m + (info !== undefined ? ' — ' + JSON.stringify(info).slice(0, 300) : '')); } };
const SB = fs.mkdtempSync(path.join(os.tmpdir(), 'crafterpage-'));
const DATA = path.join(SB, 'data'), LOGS = path.join(SB, 'logs'); fs.mkdirSync(DATA); fs.mkdirSync(LOGS);
process.env.SWARM_CRAFTERPAGE_DIR = DATA; process.env.SWARM_CRAFTER_FILE = path.join(DATA, 'crafter_rules.json');
fs.writeFileSync(process.env.SWARM_CRAFTER_FILE, JSON.stringify({ v: 1, crafters: { Crafter1: { on: true, stock: { 'soulshot:A': 50000 } } } }));
// PICKALL-2026-11-10: the API has no built-in crafter / bank name any more (was 'Crafter1') - the sandbox sets them like a real install
fs.writeFileSync(path.join(DATA, 'crafter.json'), JSON.stringify({ crafter: 'Crafter1', bank: 'Crafter1' }));
// Crafter1: 12000 Soulshot A in the bag, 2000 in the clan wh; Soul Ore 3600 bag + 400 clan; A crystals 50 in his warehouse
fs.writeFileSync(path.join(LOGS, 'bag_Crafter1.json'), JSON.stringify({ at: 'x', name: 'Crafter1', items: [{ id: 1466, objId: 900, count: 12000 }, { id: 1785, objId: 901, count: 3600 }, { id: 57, objId: 902, count: 1000 }] }));
fs.writeFileSync(path.join(LOGS, 'wh_private_Crafter1.json'), JSON.stringify({ seenAt: 'x', items: [{ id: 1461, count: 50 }] }));
fs.writeFileSync(path.join(LOGS, 'clan_state.json'), JSON.stringify({ warehouse: { seenAt: 'y', items: [{ id: 1466, count: 2000 }, { id: 1785, count: 400 }] } }));
const sent = [];
const ctx = { DATA, LOGS, ROOT, DIR: path.join(ROOT, 'Dashboard'), readStates: () => [{ name: 'Crafter1', adena: 37703334, ageSec: 5 }], teamMap: () => ({ Tank1: [], Crafter1: [] }),
  post: async (p, b) => { sent.push({ p, b }); return { ok: true, id: 'o' + sent.length, item: { id: 'q' + sent.length } }; } };
const P = require(path.join(ROOT, 'Dashboard', 'crafterpage_api.js'));
(async () => {
  // the math on Soulshot (A): 300 per batch, 36 Soul Ore + 1 A crystal
  const d = P.info(ctx), a = d.rows.find(r => r.key === 'soulshot:A');
  t('in stock = bag + own warehouse + clan warehouse (12000 + 2000)', a.have === 14000 && a.where.bag === 12000 && a.where.clan === 2000, a);
  t('short by 36000 = 120 batches of 300', a.short === 36000 && a.batches === 120, a);
  const ore = a.ing.find(g => g.id === 1785), cry = a.ing.find(g => g.id === 1461);
  t('materials: 4320 Soul Ore (have 4000, missing 320) + 120 A crystals (have 50, missing 70)', ore.need === 4320 && ore.have === 4000 && ore.missing === 320 && cry.need === 120 && cry.have === 50 && cry.missing === 70, a.ing);
  t('craftable now = min(4000/36, 50/1) = 50 batches', a.canNow === 50, a.canNow);
  t('no target = nothing needed (Blessed C)', d.rows.find(r => r.key === 'blessed:C').short === 0 && d.total.find(x => x.id === 1785).need === 4320);
  t('normal cost: Soulshot A 80, Blessed Spiritshot C 42 (NPC price)', P.priceOf(1466, {}) === 80 && P.priceOf(3949, {}) === 42 && P.priceOf(1466, { 1466: 70 }) === 70);
  t('bank now = the bank character\'s adena', d.bankNow.adena === 37703334);
  // targets save through crafter_rules.json (the numbers swarm.js crafts toward)
  let r = await P.post(ctx, { action: 'targets', targets: { 'blessed:C': 40000, 'soulshot:A': 50000 } });
  const rules = JSON.parse(fs.readFileSync(process.env.SWARM_CRAFTER_FILE, 'utf8'));
  t('targets saved into crafter_rules.json crafters.Crafter1.stock', r && r.ok && rules.crafters.Crafter1.stock['blessed:C'] === 40000 && rules.crafters.Crafter1.stock['soulshot:A'] === 50000 && rules.crafters.Crafter1.on === true, r);
  r = await P.post(ctx, { action: 'targets', targets: { 'nonsense:Z': 5 } });
  t('an unknown shot is refused', r && r.code === 400, r);
  // orders ask first
  r = await P.post(ctx, { action: 'craft', key: 'soulshot:A' });
  t('craft without confirm = refused, nothing sent', r.code === 400 && sent.length === 0, r);
  r = await P.post(ctx, { action: 'craft', key: 'soulshot:A', confirm: true });
  t('craft 1 batch = "!craft one soulshot:A Crafter1" into the command queue', r.ok && sent[0].p === '/api/autoqueue' && sent[0].b.cmd === '!craft one soulshot:A Crafter1' && sent[0].b.targets[0] === 'char:Crafter1', sent);
  // a sale: 1000 Soulshot A to Tank1 = 80,000 adena, two same-town orders + a ledger row
  r = await P.post(ctx, { action: 'sell', key: 'soulshot:A', party: 'Tank1', count: 1000, confirm: true });
  const o1 = sent[1], o2 = sent[2];
  t('sale: shots order crafter -> party (same town), payment order party -> bank', r.ok && o1.p === '/api/trade/order' && o1.b.receiver === 'Tank1' && o1.b.sel.Crafter1['900'] === 1000 && o1.b.sameTown === true && o2.b.receiver === 'Crafter1' && o2.b.adena.Tank1 === 80000, { o1, o2 });
  r = await P.post(ctx, { action: 'sell', key: 'soulshot:A', party: 'Tank1', count: 999999, confirm: true });
  t('selling more than the bag holds is refused', r.code === 400, r);
  await P.post(ctx, { action: 'ledger', kind: 'buy', who: 'Crafter1', adena: 30000, note: 'Soul Ore' });
  const s = P.info(ctx).ledger.summary;
  t('ledger: sale 80,000 income, buy 30,000 spending, net 50,000, sales per party', s.income === 80000 && s.spending === 30000 && s.net === 50000 && s.salesBy.Tank1.count === 1000, s);
  t('a bad ledger row is refused', (await P.post(ctx, { action: 'ledger', kind: 'gift', who: 'x', adena: 1 })).code === 400);
  P.tick(ctx); P.tick(ctx);
  t('the bank balance is sampled (Logs/crafter_balance.json)', P.info(ctx).balance.length === 2);
  // CLANALLOWREAD: the real "List given" page
  const SRC = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
  const i = SRC.indexOf('function clanAllowNames('); let d2 = 0, j = SRC.indexOf('{', i); for (; j < SRC.length; j++) { if (SRC[j] === '{') d2++; else if (SRC[j] === '}' && --d2 === 0) break; }
  const CN = new Function(SRC.slice(i, j + 1) + '\nreturn clanAllowNames;')();
  const page = '<html>\n<body>Clan CP (.clan)<br>\n<br>\n<table>\n<tr>\n<td width=10>\n</td>\n<td width=60>Bishop1</td>\n<td width=20>\n<button width=50 height=15 back="L2UI_CT1.Button_DF_Down" fore="L2UI_CT1.Button_DF" action="bypass -h 00" value="Remove">\n<br>\n</td>\n</tr>\n<tr>\n<td width=10>\n</td>\n<td width=60>Inspector1</td>\n<td width=20>\n<button width=50 height=15 action="bypass -h 01" value="Remove">\n<br>\n</td>\n</tr>\n<tr>\n<td width=10>\n</td>\n<td width=60>Crafter1</td>\n<td width=20>\n<button action="bypass -h 02" value="Remove">\n<br>\n</td>\n</tr>\n<tr>\n<td width=10>\n</td>\n<td width=20>\n<button action="bypass -h 03" value="Back">\n</td>\n</tr>\n</table>\n</body>';
  t('CLANALLOWREAD: the real page lists Bishop1, Inspector1, Crafter1 (not "Back")', JSON.stringify(CN(page)) === JSON.stringify(['Bishop1', 'Inspector1', 'Crafter1']), CN(page));
  t('CLANALLOWREAD: !clanallow uses clanAllowNames', SRC.includes('const listed = clanAllowNames(h)'));
  // wiring
  const SRV = fs.readFileSync(path.join(ROOT, 'Dashboard', 'server.js'), 'utf8'), IX = fs.readFileSync(path.join(ROOT, 'Dashboard', 'index.html'), 'utf8');
  t('server.js hooks /api/crafterpage + the 10-min bank sample; index.html has the Crafter button, route and script',
    SRV.includes("require('./crafterpage_api').handle(") && SRV.includes("require('./crafterpage_api').tick(") && IX.includes('data-tab="crafter"') && IX.includes('CrafterPage.route(kind, arg)') && IX.includes('<script src="/crafterpage.js"></script>'));
  try { fs.rmSync(SB, { recursive: true, force: true }); } catch (e) { }
  console.log(`crafter page: ${ok} ok, ${bad} failed`); process.exit(bad ? 1 : 0);
})().catch(e => { console.log('FAIL crashed: ' + e.stack); process.exit(1); });
