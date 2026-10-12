// OFFLINE TEST of the TRADE / HAND-OVER feature (user 2026-10-10: "buttons so I can tell teams and characters to go to the clan leader OR a
// character of own choice and trade everything we want to ... select what should be traded easily"). Never talks to the game:
//   node docs/plan/tools/test_handover.js        (exit code 1 when a check fails)
// 1) Dashboard/tradelogic.js on the REAL Scripts/data/trade_items.json: categories, refusals (worn / quest / not tradeable / adena), quick
//    buttons, presets, the preview (caps, receiver never gives), batches.
// 2) Scripts_dev/swarm.js HANDOVER-PURE: hovResolve (live bag re-check, stack with a new objId, adena only by amount), hovBatches = trBatches,
//    hovMoved (stack / adena by count, pieces by objId), hovTravelDecide, hovRoleOf.
// 3) Dashboard/tradepage_api.js in a SANDBOX http server (mock MCP inventories, mock command center, scratch folders via env): info,
//    bags, plan, order (409 without confirm, the file, "!handover <id>" to givers + receiver), status, stop, presets, key check, static files.
// 4) Source checks: the !handover case + hooks in swarm.js, the catalog entry, the server hook, the page wiring, no browser dialogs.
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
const ROOT = path.join(__dirname, '..', '..', '..');
const src = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
const blk = (s, b, e) => { const i = s.indexOf(b), j = s.indexOf(e, i); if (i < 0 || j < i) { console.error(b + ' block not found'); process.exit(1); } return s.slice(i, j); };
const PURE = blk(src, '// HANDOVER-PURE-BEGIN', '// HANDOVER-PURE-END');
const H = new Function(PURE + '\nreturn { HOV_CFG, HOV_ID_RE, hovRoleOf, hovResolve, hovBatches, hovBagMap, hovMoved, hovTravelDecide, hovLine };')();
const TL = require(path.join(ROOT, 'Dashboard', 'tradelogic.js'));
const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'Scripts', 'data', 'trade_items.json'), 'utf8'));
let fails = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails++; };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---- 1) tradelogic -------------------------------------------------------------------------------------------------------------
const NT = new Set(DATA.notrade);
const shadow = 8821;                                                           // Shadow Item: Two Handed Sword (is_tradable=false)
check(NT.has(shadow) && !NT.has(57) && !NT.has(1458) && !NT.has(955), 'trade_items.json: Shadow item not tradeable; adena, Crystal (D), Enchant Weapon (D) tradeable');
check(DATA.cat[955] === 'enchant' && DATA.cat[1458] === 'material' && DATA.cat[1935] === 'raid' && DATA.cat[728] === 'consumable' && DATA.cat[4445] === 'dye' && DATA.cat[8723] === 'lifestone' && DATA.cat[1666] === 'recipe', 'categories: enchant / material / raid / consumable / dye / lifestone / recipe');
const bagA = [
  { id: 57, objId: 1, name: 'Adena', count: 5000000 },
  { id: 955, objId: 2, name: 'Scroll: Enchant Weapon (D)', count: 12 },
  { id: 1935, objId: 3, name: 'Scale Mail Fragment', count: 40 },
  { id: 1458, objId: 4, name: 'Crystal (D-Grade)', count: 300 },
  { id: 1666, objId: 5, name: 'Recipe: Wooden Arrow', count: 1 },
  { id: 348, objId: 6, name: 'Scale Mail', count: 1, type: 'Armor' },
  { id: 349, objId: 7, name: 'Worn Armor', count: 1, type: 'Armor', equipped: true },
  { id: shadow, objId: 8, name: 'Shadow Item: Two Handed Sword', count: 1, type: 'Weapon' },
  { id: 728, objId: 9, name: 'Mana Potion', count: 900 },
  { id: 1661, objId: 10, name: 'Thief Key', count: 3 },
  { id: 4445, objId: 11, name: 'Dye of STR', count: 10 },
  { id: 999999, objId: 12, name: 'Quest Thing', count: 1, quest: true },
];
const BA = TL.trBagRows(bagA, DATA), byO = (o) => BA.rows.find(r => r.objId === o);
check(BA.adena === 5000000 && !BA.rows.some(r => r.id === 57), 'adena is not a row (only its own amount field)');
check(!byO(7).ok && /worn/.test(byO(7).why) && !byO(8).ok && /server/.test(byO(8).why) && !byO(12).ok && /quest/.test(byO(12).why), 'refused: worn, not tradeable, quest — with the reason');
check(byO(6).cat === 'gear' && byO(6).ok && byO(10).cat === 'other' && byO(3).cat === 'raid', 'gear by live type; unknown -> other; raid material');
check(BA.rows[0].ok && !BA.rows[BA.rows.length - 1].ok, 'rows: tradeable first');
const BAGS = { Tank1: BA, Bishop1: TL.trBagRows([{ id: 955, objId: 50, name: 'Scroll: Enchant Weapon (D)', count: 3 }, { id: 1864, objId: 51, name: 'Stem', count: 99 }, { id: 57, objId: 52, name: 'Adena', count: 1000 }], DATA) };
let sel = TL.trQuick({}, BAGS, 'materials', true);
check(eq(Object.keys(sel.Tank1).sort(), ['3', '4']) && eq(sel.Bishop1, { 51: 99 }), 'quick "All materials" = raid + crafting materials, full counts, every giver');
sel = TL.trQuick(sel, BAGS, 'enchant', true);
check(sel.Tank1[2] === 12 && sel.Bishop1[50] === 3, 'quick "All enchant scrolls"');
const all = TL.trQuick({}, BAGS, 'all', true);
check(!all.Tank1[9] && !all.Tank1[7] && !all.Tank1[8] && all.Tank1[6] === 1 && all.Tank1[10] === 3, '"Everything tradeable" skips consumables + refused rows, takes gear + other');
check(eq(TL.trQuick(sel, BAGS, 'enchant', false).Tank1, { 3: 40, 4: 300 }), 'quick off unticks only its categories');
const pv = TL.trPreview({ Tank1: { 2: 50, 7: 1, 6: 1, 777: 1 }, Dagger1: { 1: 1 } }, { Tank1: 9e9, Bishop1: 500 }, Object.assign({ Dagger1: BA }, BAGS), 'Dagger1');
const gS = pv.givers.find(g => g.name === 'Tank1'), gB = pv.givers.find(g => g.name === 'Bishop1');
check(gS.rows.find(r => r.objId === 2).count === 12 && !gS.rows.some(r => r.objId === 7) && gS.problems.some(p => /worn/.test(p)) && gS.problems.some(p => /777/.test(p)), 'preview: count capped at the bag, worn refused, vanished object reported');
check(gS.adena === 5000000 && gB.adena === 500 && !pv.givers.some(g => g.name === 'Dagger1') && pv.problems.some(p => /receiver/.test(p)), 'preview: adena capped; the receiver never gives');
const pre = { name: 'Raid loot', receiver: '@clanleader', cats: ['raid', 'enchant'], ids: [1661], exclude: [955], adena: 2000 };
check(TL.trPresetCheck(pre).ok && !TL.trPresetCheck({ name: '', cats: ['nope'] }).ok && !TL.trPresetCheck({ name: 'x' }).ok, 'preset check: good one ok; empty name / unknown category / nothing to trade refused');
const ap = TL.trApplyPreset(pre, BAGS);
check(eq(Object.keys(ap.sel.Tank1).sort(), ['10', '3']) && eq(ap.sel.Bishop1, {}) && ap.adena.Tank1 === 2000 && ap.adena.Bishop1 === 1000, 'preset apply: categories + ids - exclude, adena capped per giver');
check(TL.trReceiver('@clanleader', 'Dagger1') === 'Dagger1' && TL.trReceiver('', 'Dagger1') === 'Dagger1' && TL.trReceiver('Tank1', 'Dagger1') === 'Tank1', 'receiver: @clanleader / empty = the clan leader');
const rows20 = Array.from({ length: 19 }, (_, i) => ({ objId: i + 1, id: 1, count: 1 })).concat([{ adena: true, id: 57, count: 5 }]);
check(eq(TL.trBatches(rows20, 8).map(b => b.length), [8, 8, 4]) && TL.trBatches(rows20, 8)[2].some(r => r.adena), 'batches of 8, adena in the last window');
check(eq(TL.trBatches(rows20, 8), H.hovBatches(rows20, 8)) && eq(TL.trBatches(rows20.slice(0, 16).concat([rows20[19]]), 8), H.hovBatches(rows20.slice(0, 16).concat([rows20[19]]), 8)), 'dashboard trBatches = swarm.js hovBatches (same windows the preview counts)');
check(TL.ID_RE.test(TL.trNewId()) && H.HOV_ID_RE.test(TL.trNewId()) && !H.HOV_ID_RE.test('..\\x') && !H.HOV_ID_RE.test('a/b/c'), 'order ids: same pattern both sides, no paths');
const order = TL.trOrder('habc123', 'Dagger1', pv, { by: 'test' });
check(order.givers.Tank1.items.length === gS.rows.length && order.givers.Bishop1.adena === 500 && order.receiver === 'Dagger1', 'order body from the preview');

// ---- 2) swarm.js HANDOVER-PURE -------------------------------------------------------------------------------------------------
const live = [
  { objId: 1, id: 57, name: 'Adena', count: 1000, stackable: true },
  { objId: 2, id: 955, name: 'Scroll: Enchant Weapon (D)', count: 5, stackable: true },
  { objId: 90, id: 1935, name: 'Scale Mail Fragment', count: 40, stackable: true },      // the stack got a new objId (was 3)
  { objId: 6, id: 348, name: 'Scale Mail', count: 1 },
  { objId: 7, id: 349, name: 'Worn Armor', count: 1, equipped: true },
  { objId: 8, id: shadow, name: 'Shadow Item', count: 1 },
  { objId: 12, id: 999999, name: 'Quest Thing', count: 1, quest: true },
];
const ord = [{ objId: 2, id: 955, name: 'EW D', count: 12, stack: true }, { objId: 3, id: 1935, name: 'Frag', count: 40, stack: true }, { objId: 6, id: 348, name: 'Scale Mail', count: 1 },
  { objId: 7, id: 349, name: 'Worn', count: 1 }, { objId: 8, id: shadow, name: 'Shadow', count: 1 }, { objId: 12, id: 999999, name: 'Quest', count: 1 }, { objId: 1, id: 57, name: 'Adena', count: 1 }, { objId: 44, id: 1458, name: 'Gone', count: 1 }];
const rs = H.hovResolve(ord, 5000, live, DATA.notrade);
const why = (n) => (rs.skip.find(s => s.name === n) || {}).why || '';
check(rs.give.find(g => g.id === 955).count === 5 && rs.give.find(g => g.id === 955).short, 'resolve: count capped at the live bag (marked short)');
check(rs.give.find(g => g.id === 1935).objId === 90, 'resolve: a stack with a new objId is found by item id');
check(/worn/.test(why('Worn')) && /server/.test(why('Shadow')) && /quest/.test(why('Quest')) && /adena only/.test(why('Adena')) && /not in my bag/.test(why('Gone')), 'resolve: worn / not tradeable / quest / adena row / vanished refused with reasons');
const ad = rs.give.find(g => g.adena);
check(ad && ad.count === 1000 && ad.objId === 1 && ad.short, 'resolve: adena only through the amount, capped at what I hold');
check(H.hovResolve([], 0, live, []).give.length === 0 && H.hovResolve([], 10, [], []).skip.some(s => /no adena/.test(s.why)), 'resolve: empty list / no adena');
const before = H.hovBagMap(live), after = H.hovBagMap(live.filter(b => b.objId !== 6).map(b => b.id === 57 ? Object.assign({}, b, { count: 400 }) : b.id === 1935 ? Object.assign({}, b, { count: 10 }) : b));
const mv = H.hovMoved([{ objId: 6, id: 348, count: 1 }, { adena: true, id: 57, count: 600 }, { objId: 90, id: 1935, count: 40, stack: true }, { objId: 2, id: 955, count: 5, stack: true }], before, after);
check(eq(mv.map(m => m.moved), [1, 600, 30, 0]), 'moved: piece by objId, adena + stacks by count (partial stack = 30 of 40), untouched = 0');
const me = { x: 0, y: 0, z: 0, town: 'Giran' };
const D = (r, m) => H.hovTravelDecide({ recv: r, me: m || me });
check(D(null).act === 'wait' && D({ name: 'Q', dead: true }).act === 'wait' && D({ name: 'Q', busy: 'in a raid' }).act === 'wait', 'travel: no answer / dead / busy -> wait');
check(D({ name: 'Q', x: 500, y: 0, z: 0, town: 'Giran' }).act === 'here' && D({ name: 'Q', x: 500, y: 0, z: 2000 }).act !== 'here', 'travel: close on the same floor = here; another floor is not');
check(D({ name: 'Q', x: 3000, y: 0, z: 0, town: 'Giran' }).act === 'walk' && D({ name: 'Q', x: 90000, y: 0, z: 0, town: 'Dion' }).act === 'town' && D({ name: 'Q', x: 90000, y: 0, z: 0, town: 'Dion' }).town === 'Dion', 'travel: same town = walk, another town = .townname');
check(D({ name: 'Q', x: 4000, y: 0, z: 0, town: '' }).act === 'walk' && D({ name: 'Q', x: 60000, y: 0, z: 0, town: '' }).act === 'route', 'travel: field close = walk, far = route');
check(H.hovRoleOf({ receiver: 'Q', givers: { A: {} } }, 'Q') === 'receiver' && H.hovRoleOf({ receiver: 'Q', givers: { A: {} } }, 'A') === 'giver' && H.hovRoleOf({ receiver: 'Q', givers: { A: {} } }, 'B') === '', 'roles');
check(/gave 2 kinds to Q/.test(H.hovLine({ receiver: 'Q', given: [{ name: 'a', count: 1 }, { name: 'b', count: 3 }], failed: [{ name: 'c', why: 'x' }], skipped: [] })), 'result line');

// ---- 4) source checks ----------------------------------------------------------------------------------------------------------
const hovSrc = src.slice(src.indexOf('// --- HANDOVER (user 2026-10-10'), src.indexOf('// --- CLAN (user 2026-10-07: Clan tab'));
check(/case '!handover': \{[\s\S]{0,300}hovCommand\(parts\)/.test(src), "swarm.js: case '!handover' -> hovCommand");
check(!/new Map\(/.test(hovSrc), 'swarm.js HANDOVER: no new Map() (L2Swarm world-map host type)');
check(/if \(d > 15000 && hovAway\(n\)\) \{ delete splitWatch/.test(src) && /tradeState \|\| HOV\.busy \|\| raidFightNow\(\)/.test(src), 'split watchdog + left-behind rejoin leave a giver on a hand-over alone');
check(/CONFIG\.roster\[d\.giver\]/.test(hovSrc) && /swarm\.handover\.take/.test(hovSrc) && /receiveItems\(/.test(hovSrc) && /giveItems\(\{ receiver: o\.receiver/.test(hovSrc), 'receiver accepts only CONFIG.roster givers; the existing giveItems / receiveItems plumbing is used');
check(/inRaid\(\)/.test(hovSrc) && /inKamaInstance\(\)/.test(hovSrc) && /orderWaitControl\('!handover'/.test(hovSrc) && /PRIO\.ORDER/.test(hovSrc), 'never in raid / Kamaloka; order control P4');
const C = require(path.join(ROOT, 'Dashboard', 'commands.js'));
const ce = C.COMMANDS.find(c => c.id === 'handover');
check(ce && C.firstWord(ce.tpl) === '!handover' && C.classify('!handover stop habc').id === 'handoverstop' && C.classify('!handover habc1234').id === 'handover', 'catalog: handover + handoverstop entries, classify picks the right one');
const srv = fs.readFileSync(path.join(ROOT, 'Dashboard', 'server.js'), 'utf8');
const iHook = srv.indexOf("require('./tradepage_api').handle"), iKey = srv.indexOf("if (!allowed(req, url)) return send(res, 401,'text/plain; charset=utf-8', 'Access denied: open the link");
check(iHook > 0 && iHook < iKey, 'server.js: trade hook BEFORE the key check (page files public, API checks the key itself)');
const idx = fs.readFileSync(path.join(ROOT, 'Dashboard', 'index.html'), 'utf8');
check(/data-tab="trade"/.test(idx) && /TradePage\.route\(kind, arg\)/.test(idx) && /src="\/tradepage\.js"/.test(idx) && /src="\/tradelogic\.js"/.test(idx) && /TradePage\.button\('party:'/.test(idx), 'index.html: Trade tab, route hook, scripts, party header button');
check(/TradePage\.button\('char:'/.test(fs.readFileSync(path.join(ROOT, 'Dashboard', 'charpage.js'), 'utf8')), 'charpage.js: Trade button on the character page');
const page = fs.readFileSync(path.join(ROOT, 'Dashboard', 'tradepage.js'), 'utf8');
check(!/(^|[^.\w])(alert|confirm|prompt)\(/m.test(page.replace(/ui(Confirm|Alert|Prompt)\(/g, '')), 'tradepage.js: no browser alert / confirm / prompt (uidialog only)');
check(fs.existsSync(path.join(ROOT, 'docs', 'guide', 'pages', 'trade.md')), 'guide page docs/guide/pages/trade.md');

// ---- 3) API sandbox ------------------------------------------------------------------------------------------------------------
(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'handover-'));
  process.env.SWARM_HANDOVER_DIR = path.join(tmp, 'handover');
  process.env.SWARM_TRADEPRESETS_FILE = path.join(tmp, 'trade_presets.json');
  const API = require(path.join(ROOT, 'Dashboard', 'tradepage_api.js'));
  const INV = {
    Tank1: [{ item_id: 57, obj_id: 1, name: 'Adena', count: 777 }, { item_id: 955, obj_id: 2, name: 'Scroll: Enchant Weapon (D)', count: 12 }, { item_id: 349, obj_id: 7, name: 'Worn Armor', count: 1, is_equipped: true, type: 'Armor' }, { item_id: 1935, obj_id: 3, name: 'Scale Mail Fragment', count: 40 }],
    Bishop1: [{ item_id: 1864, obj_id: 51, name: 'Stem', count: 99 }],
  };
  const SENT = [];
  const states = [{ name: 'Tank1', party: 'Tank1', level: 60, ageSec: 5, x: 83473, y: 148554 }, { name: 'Bishop1', party: 'Tank1', level: 58, ageSec: 5 }, { name: 'Dagger1', party: 'Dagger1', level: 40, ageSec: 5 }];
  const ctx = {
    DIR: path.join(ROOT, 'Dashboard'), DATA: path.join(ROOT, 'Scripts', 'data'), LOGS: tmp, ROOT,
    readJson: (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch (e) { return d; } },
    readStates: () => states, teamMap: () => ({ Tank1: 'Tank1', Bishop1: 'Tank1', Dagger1: 'Dagger1' }), reloadCfg: () => ({ accounts: [{ character: 'Tank1' }, { character: 'Bishop1' }, { character: 'Dagger1' }], clanLeader: 'Dagger1' }), mainLeader: 'Tank1',
    allowed: (req) => req.headers['x-key'] === 'k', json: (res, code, o) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); },
    send: (res, code, type, b) => { res.writeHead(code, { 'Content-Type': type }); res.end(b); },
    body: async (req) => { let b = ''; for await (const c of req) b += c; return JSON.parse(b || '{}'); },
    mcpCallChar: async (tool, name) => { if (tool !== 'get_account_data') throw new Error('unexpected ' + tool); return JSON.stringify({ items: INV[name] || [] }); },
    commandRun: async (b) => { SENT.push(b); return { code: 200, body: { ok: true, sends: b.targets[0].slice(6).split(',').map(n => ({ to: n, ok: true })) } }; },
  };
  const srvH = http.createServer(async (req, res) => { const url = new URL(req.url, 'http://x'); if (!(await API.handle(req, res, url, ctx))) { res.writeHead(404); res.end('not mine'); } });
  await new Promise(r => srvH.listen(0, '127.0.0.1', r));
  const PORT = srvH.address().port;
  const call = (p, b, key) => new Promise((resolve, reject) => {
    const data = b ? JSON.stringify(b) : null;
    const r = http.request({ host: '127.0.0.1', port: PORT, path: p, method: b ? 'POST' : 'GET', headers: { 'content-type': 'application/json', 'x-key': key === undefined ? 'k' : key } }, (res) => {
      let t = ''; res.on('data', c => t += c); res.on('end', () => { let j = null; try { j = JSON.parse(t); } catch (e) { } resolve({ code: res.statusCode, j, t, type: res.headers['content-type'] }); });
    }); r.on('error', reject); if (data) r.write(data); r.end();
  });
  try {
    const st = await call('/tradepage.js', null, '');
    check(st.code === 200 && /javascript/.test(st.type) && /TradePage/.test(st.t), 'static /tradepage.js served without the key');
    check((await call('/tradelogic.js', null, '')).code === 200 && (await call('/tradepage.css', null, '')).code === 200, 'static /tradelogic.js + /tradepage.css');
    check((await call('/api/trade/info', null, 'bad')).code === 401, 'API: wrong key = 401');
    check((await call('/api/other', null)).code === 404 && (await call('/api/other', null)).t === 'not mine', 'other paths fall through to server.js');
    const inf = await call('/api/trade/info');
    check(inf.code === 200 && inf.j.clanLeader === 'Dagger1' && inf.j.parties.some(p => p.leader === 'Tank1' && p.members.length === 2) && inf.j.presets.some(p => p.builtIn) && inf.j.parties.find(p => p.leader === 'Tank1').members[0].town === 'Giran', 'info: clan leader, parties, built-in presets, town');
    const bg = await call('/api/trade/bags?names=Tank1,Bishop1');
    check(bg.code === 200 && bg.j.bags.Tank1.src === 'live' && bg.j.bags.Tank1.adena === 777 && bg.j.bags.Tank1.rows.find(r => r.objId === 7).ok === false, 'bags: live via MCP, adena separate, worn refused');
    check((await call('/api/trade/bags?names=Nobody')).code === 400, 'bags: unknown character refused');
    // MCP down -> the bot's own report
    const keep = ctx.mcpCallChar; ctx.mcpCallChar = async () => { throw new Error('ECONNREFUSED'); };
    fs.writeFileSync(path.join(tmp, 'bag_Bishop1.json'), JSON.stringify({ at: new Date(Date.now() - 120000).toISOString(), name: 'Bishop1', items: [{ id: 1864, objId: 51, name: 'Stem', count: 98, eq: false, q: false }] }));
    API._cache.Bishop1 = null;
    const bg2 = await call('/api/trade/bags?names=Bishop1&fresh=1');
    check(bg2.j.bags.Bishop1.src === 'report' && bg2.j.bags.Bishop1.rows[0].count === 98 && bg2.j.bags.Bishop1.ageSec >= 100, 'bags: MCP down -> Logs/bag_<name>.json report with its age');
    ctx.mcpCallChar = keep; API._cache.Bishop1 = null;
    const pl = await call('/api/trade/plan', { receiver: '@clanleader', sel: { Tank1: { 2: 5, 7: 1 }, Bishop1: { 51: 99 } }, adena: { Tank1: 100 } });
    check(pl.code === 200 && pl.j.receiver === 'Dagger1' && pl.j.total.givers === 2 && pl.j.givers.find(g => g.name === 'Tank1').rows.length === 1 && pl.j.givers.find(g => g.name === 'Tank1').adena === 100 && pl.j.batches.Tank1 === 1, 'plan: receiver = clan leader, worn dropped, explicit adena, batches');
    check((await call('/api/trade/plan', { receiver: 'Ghost', sel: {} })).code === 400 && (await call('/api/trade/plan', { receiver: 'Dagger1', sel: { Evil: { 1: 1 } } })).code === 400, 'plan: unknown receiver / giver refused');
    const nc = await call('/api/trade/order', { receiver: '@clanleader', sel: { Tank1: { 2: 5 } } });
    check(nc.code === 409 && nc.j.needConfirm && SENT.length === 0, 'order without confirm = 409, nothing sent');
    check((await call('/api/trade/order', { receiver: '@clanleader', sel: { Tank1: { 7: 1 } }, confirm: true })).code === 400, 'order with only refused items = 400');
    const od = await call('/api/trade/order', { receiver: '@clanleader', sel: { Tank1: { 2: 5, 3: 40 }, Bishop1: { 51: 99 } }, adena: { Tank1: 50 }, confirm: true, preset: 'Raid loot to clan leader' });
    const id = od.j && od.j.id;
    const file = id && path.join(tmp, 'handover', id + '.json');
    const saved = file && JSON.parse(fs.readFileSync(file, 'utf8'));
    check(od.code === 200 && saved && saved.receiver === 'Dagger1' && saved.givers.Tank1.items.length === 2 && saved.givers.Tank1.adena === 50 && saved.givers.Bishop1.items[0].objId === 51 && saved.preset, 'order: Logs/handover/<id>.json with the exact rows + adena');
    check(SENT.length === 1 && SENT[0].cmd === '!handover ' + id && SENT[0].targets[0] === 'chars:Tank1,Bishop1,Dagger1', 'order: "!handover <id>" to every giver + the receiver (command center)');
    check(H.HOV_ID_RE.test(id) && H.hovRoleOf(saved, 'Bishop1') === 'giver' && H.hovRoleOf(saved, 'Dagger1') === 'receiver', 'the bots read the same file: id pattern + roles');
    let s1 = await call('/api/trade/status?id=' + id);
    check(s1.code === 200 && !s1.j.over && s1.j.results.Tank1.line.state === 'waiting', 'status: waiting before any bot answered');
    fs.writeFileSync(path.join(tmp, 'handover', `${id}_Tank1.json`), JSON.stringify({ id, name: 'Tank1', state: 'done', given: [{ name: 'EW D', count: 5 }], failed: [{ name: 'Frag', count: 40, why: 'server said no' }] }));
    fs.writeFileSync(path.join(tmp, 'handover', `${id}_Bishop1.json`), JSON.stringify({ id, name: 'Bishop1', state: 'failed', msg: 'Dagger1 not reached', given: [] }));
    s1 = await call('/api/trade/status?id=' + id);
    check(s1.j.over && s1.j.done === 1 && s1.j.failed === 1 && /done — gave 1 kind, 1 failed/.test(s1.j.results.Tank1.line.label) && /FAILED/.test(s1.j.results.Bishop1.line.label), 'status: per giver result lines, over when all ended');
    check((await call('/api/trade/status?id=../../x')).code === 404, 'status: bad id refused (no path tricks)');
    const inf2 = await call('/api/trade/info');
    check(inf2.j.orders.length === 1 && inf2.j.orders[0].id === id && inf2.j.orders[0].over, 'info: recent orders with their state');
    const sp = await call('/api/trade/stop', { id });
    check(sp.code === 200 && SENT[1].cmd === '!handover stop ' + id, 'stop: "!handover stop <id>" to the same characters');
    const ps = await call('/api/trade/presets', { action: 'save', preset: { name: 'Mats to Tank1', receiver: 'Tank1', cats: ['material', 'raid'], ids: [1661], adena: 0 } });
    check(ps.code === 200 && ps.j.presets.some(p => p.name === 'Mats to Tank1' && !p.builtIn) && JSON.parse(fs.readFileSync(process.env.SWARM_TRADEPRESETS_FILE, 'utf8')).presets.length === 1, 'presets: save -> Scripts/data/trade_presets.json');
    check((await call('/api/trade/presets', { action: 'save', preset: { name: 'bad', cats: ['zzz'] } })).code === 400, 'presets: bad preset refused');
    check((await call('/api/trade/presets', { action: 'delete', name: 'Raid loot to clan leader' })).code === 404, 'presets: built-in cannot be deleted');
    const pd = await call('/api/trade/presets', { action: 'delete', name: 'Mats to Tank1' });
    check(pd.code === 200 && !pd.j.presets.some(p => p.name === 'Mats to Tank1'), 'presets: delete');
    const lg = fs.readFileSync(path.join(tmp, 'dashboard_commands.log'), 'utf8');
    check(/trade page: order h/.test(lg) && /trade page: stop/.test(lg) && /preset saved/.test(lg), 'every write logged in dashboard_commands.log');
  } catch (e) { check(false, 'API sandbox: ' + e.stack); }
  srvH.close();
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { }
  console.log(fails ? `\n${fails} FAILED` : '\nALL OK');
  process.exit(fails ? 1 : 0);
})();
