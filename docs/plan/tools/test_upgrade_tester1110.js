// GUARD TEST: the Upgrade page end to end after public tester Vykaax's Discord report (Swarm 3.11.5 + Hive 1.14.0, 2026-11-10:
// "it worked on 1.13 but not at all on 1.14"). Requirements: gear.md R3 / R12, pages.md #/upgrade.
//   a) UPGCOMMENT  an inline comment had swallowed `item: {...}, overSafeOk:` of the job -> every order failed ("reading 'name'")
//   b) UPGFALL     a piece the clan warehouse does not have falls through to the next TICKED source (never "item 0 x1", never a stop)
//   c) UPGSRC      unticked "own warehouse" / "clan warehouse" are respected (plan, preset, bot)
//   d) UPGWHEN     "Now — only <name>" is sent at once and says so (never "waiting for the next Giran visit")
//   e) UPGNAME     the gear plan piece is bought (Sirra's Blade, not its alt Tallum Blade) and the line names the piece really bought
//   f) UPGWARN     the warning tick only for enchanting above the safe level / a plused warehouse piece (cost / level = plain warnings)
//   node docs/plan/tools/test_upgrade_tester1110.js     (exit code 1 when a check fails; sandbox dirs only, nothing reaches a bot)
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
let fails = 0;
const t = (ok, what, info) => { console.log((ok ? 'ok   ' : 'FAIL ') + what + (!ok && info !== undefined ? ' - ' + JSON.stringify(info).slice(0, 400) : '')); if (!ok) fails++; };
const SW = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
const API = fs.readFileSync(path.join(ROOT, 'Dashboard', 'upgrade_api.js'), 'utf8'), PAGE = fs.readFileSync(path.join(ROOT, 'Dashboard', 'upgradepage.js'), 'utf8');
const IPSRC = fs.readFileSync(path.join(ROOT, 'Dashboard', 'itemspage_api.js'), 'utf8');
(async () => {
  // ---- a) the job object (static + sandbox) ----
  { const line = API.split(/\r?\n/).find(l => /item: \{ name: `\$\{lines\.length\} upgrade\(s\)`/.test(l)) || '';
    const before = line.slice(0, line.indexOf('item: { name:'));
    t(line && !/\/\//.test(before) && /overSafeOk: !!b\.overSafeOk/.test(line), 'a1 the upgrade job literal: item + overSafeOk are code, not inside a // comment', line.slice(0, 200)); }
  const SB = fs.mkdtempSync(path.join(os.tmpdir(), 'upg1110_')), LOGS = path.join(SB, 'Logs'), DATA = path.join(SB, 'data');
  fs.mkdirSync(LOGS, { recursive: true }); fs.mkdirSync(path.join(DATA, 'gear_rec'), { recursive: true });
  // UPGGIVE: one armor set (chest 2001 + helm 2002) for the "never a piece of the set the giver wears" case (written before the first set lookup: cached)
  fs.writeFileSync(path.join(DATA, 'gear_items.json'), JSON.stringify({ sets: [{ name: 'Test Set', grade: 'C', pieces: { chest: [2001], head: [2002] } }] }));
  const IP = require(path.join(ROOT, 'Dashboard', 'itemspage_api.js')), U = require(path.join(ROOT, 'Dashboard', 'upgrade_api.js'));
  const FACTS = { 80: { name: 'Tallum Blade', grade: 'A', kind: 'weapon', slot: 'weapon', pa: 213 }, 8678: { name: "Sirra's Blade", grade: 'A', kind: 'weapon', slot: 'weapon', pa: 220 }, 1111: { name: 'Test Helm', grade: 'C', kind: 'armor', slot: 'head', pd: 50 } };
  const SHOP = [{ id: 80, name: 'Tallum Blade', price: 14098000, npc: 'Galladucci', offer: { npc: 'Galladucci', path: ['a'] } }, { id: 8678, name: "Sirra's Blade", price: 26968400, npc: 'Galladucci', offer: { npc: 'Galladucci', path: ['b'] } }, { id: 1111, name: 'Test Helm', price: 100000, npc: 'Alexandria', offer: { npc: 'Alexandria', path: ['c'] } }];
  let CI = { ok: true, level: 70, adena: 50000000, bag: [], wh: [], clan: [], whSeen: '2026-11-10T10:00:00Z', clanSeen: '2026-11-10T10:00:00Z' };
  const orig = { plan: IP.plan, charInfo: IP.charInfo, shops: IP.shops, facts: IP.facts, clanLeader: IP.clanLeader, chars: IP.chars };
  IP.facts = (ctx, id) => Object.assign({ id: Number(id), name: 'item ' + id, icon: '', grade: 'NONE', kind: '', slot: '' }, FACTS[id] || {});
  IP.shops = () => ({ ok: true, shops: [{ npc: 'x', rows: SHOP.map(r => Object.assign({ src: 'shop', kind: 'weapon' }, r)) }] });
  IP.charInfo = async () => CI; IP.clanLeader = () => 'Boss';
  const planned = [];
  IP.plan = async (ctx, b) => { planned.push(JSON.parse(JSON.stringify(b))); const F = IP.facts(ctx, b.item.id); return { ok: true, item: Object.assign({}, F, { src: b.item.src, enchant: b.item.enchant, objId: b.item.objId }), steps: [{ text: `${b.name} gets ${F.name} (${b.item.src})` }, { text: `${b.name} puts it on` }], missing: [], needs: [], adena: 0, overSafe: [], warn: [], offer: b.item.offer || null, enchantTo: 0, finalId: b.item.id }; };
  const sent = [], ctx = { DIR: path.join(ROOT, 'Dashboard'), DATA, LOGS, ROOT: SB, readStates: () => [], commandRun: async (o) => { sent.push(o); return { ok: true }; } };
  try {
    const order = (name, item, use) => ({ orders: [{ name, lines: [{ item }] }], use });
    { const S = await U.start(ctx, Object.assign({ when: 'solo', overSafeOk: false }, order('Vyka', { src: 'shop', id: 1111, offer: SHOP[2].offer }, { wh: true, clan: true, buy: false })));
      const id = S.started && S.started[0] && S.started[0].id, J = id ? JSON.parse(fs.readFileSync(path.join(LOGS, 'itemjobs', id + '.json'), 'utf8')) : {};
      t(S.ok && J.item && J.item.name === '1 upgrade(s)' && J.overSafeOk === false && J.upgrade && J.upgrade.lines.length === 1, 'a2 an upgrade order starts: the job has item + overSafeOk + its lines', S);
      t(J.item && J.item.id === 0 && J.item.src === 'none' && J.upgrade.use && J.upgrade.use.wh === true && J.upgrade.use.clan === true && J.upgrade.buyOk === false, 'b1 the job keeps the ticked sources (use / buyOk) and its summary item is never fetchable', J.upgrade);
      const st = id ? JSON.parse(fs.readFileSync(path.join(LOGS, 'itemjobs', id + '_status.json'), 'utf8')) : {};
      t(!J.queued && st.state === 'sent' && /alone now/.test(st.step || '') && sent.length === 1, 'd1 "Now — only <name>": sent at once, the status says alone now (not the next Giran visit)', st); }
    // ---- c) sources respected / b) falls through at plan time ----
    { planned.length = 0; CI = Object.assign({}, CI, { clan: [{ id: 1111, enchant: 0, count: 1 }] });
      const P = await U.planAll(ctx, order('Vyka', { src: 'clan', id: 1111 }, { wh: false, clan: false, buy: true }));
      t(planned[0] && planned[0].item.src === 'shop' && P.orders[0].lines[0].warn.some(w => /clan warehouse is switched off/.test(w)), 'c1 clan warehouse unticked: the line is not taken from it (buys instead, says why)', P.orders[0].lines[0]);
      const P2 = await U.planAll(ctx, order('Vyka', { src: 'clan', id: 1111 }, { wh: false, clan: false, buy: false }));
      t(P2.orders[0].lines[0].error && /switched off/.test(P2.orders[0].lines[0].error) && !P2.orders[0].ok, 'c2 nothing ticked: the line says why, nothing is asked', P2.orders[0].lines[0]);
      planned.length = 0; const P3 = await U.planAll(ctx, order('Vyka', { src: 'clan', id: 1111, ownerPick: true }, { wh: false, clan: false, buy: false }));
      t(planned[0] && planned[0].item.src === 'clan' && P3.orders[0].ok, 'c3 a piece the owner tapped himself still counts with its source unticked', P3.orders[0]);
      CI = Object.assign({}, CI, { clan: [] }); planned.length = 0;
      const P4 = await U.planAll(ctx, order('Vyka', { src: 'clan', id: 1111 }, { wh: true, clan: true, buy: true }));
      t(planned[0] && planned[0].item.src === 'shop' && P4.orders[0].lines[0].warn.some(w => /not in the clan warehouse/.test(w)), 'b2 not in the clan warehouse (last read): falls through to buying when "buy" is ticked', P4.orders[0].lines[0]);
      CI = Object.assign({}, CI, { wh: [{ id: 1111, enchant: 0, count: 1 }] }); planned.length = 0;
      await U.planAll(ctx, order('Vyka', { src: 'clan', id: 1111 }, { wh: true, clan: true, buy: true }));
      t(planned[0] && planned[0].item.src === 'wh', 'b3 ... or to the own warehouse first when it has it and it is ticked', planned[0] && planned[0].item);
      CI = Object.assign({}, CI, { wh: [], clan: [] });
      const P5 = await U.planAll(ctx, order('Vyka', { src: 'clan', id: 1111, enchant: 5, ownerPick: true }, { wh: true, clan: true, buy: true }));
      t(P5.orders[0].lines[0].error && /plused/.test(P5.orders[0].lines[0].error), 'b4 a plused piece is never swapped for another one (gear.md R12)', P5.orders[0].lines[0]); }
    { const F = U.srcFallback;
      t(F({ src: 'clan', id: 5, enchant: 0 }, { bag: [], wh: [{ id: 5 }], clan: [] }, { wh: false, clan: true, buy: false }, null) === null, 'c4 srcFallback: an unticked warehouse is never the fallback');
      t((F({ src: 'clan', id: 5, enchant: 0 }, { bag: [{ id: 5, eq: false }], wh: [], clan: [] }, {}, null) || {}).src === 'bag', 'c5 srcFallback: the own bag always counts');
      t(F({ src: 'wh', id: 5, enchant: 2 }, { bag: [], wh: [], clan: [{ id: 5 }] }, { clan: true, buy: true }, { id: 5 }) === null, 'c6 srcFallback: never for a plused piece'); }
    // ---- e) the gear plan piece is bought, the name follows the id ----
    { fs.writeFileSync(path.join(DATA, 'gear_rec', '90.json'), JSON.stringify({ grades: { A: { weapon: { id: 8678, name: "Sirra's Blade", alt: [80] } } } }));
      IP.chars = () => ({ ok: true, chars: [{ name: 'OrangeLeader', classId: 90, level: 70, cls: 'Test' }] });
      const R = U.preset(ctx, 'OrangeLeader', 'A'), L = (R.chars[0] && R.chars[0].lines) || [];
      t(L.length === 1 && L[0].id === 8678 && L[0].name === "Sirra's Blade" && L[0].price === 26968400, 'e1 preset: the plan piece Sirra\'s Blade (26.97m) is ordered, not the alt Tallum Blade the shop list has first', L);
      fs.writeFileSync(path.join(DATA, 'gear_rec', '90.json'), JSON.stringify({ grades: { A: { weapon: { id: 9999, name: 'Unsold Blade', alt: [80] } } } }));
      const R2 = U.preset(ctx, 'OrangeLeader', 'A'), L2 = (R2.chars[0] && R2.chars[0].lines) || [];
      t(L2.length === 1 && L2[0].id === 80 && L2[0].name === 'Tallum Blade', 'e2 preset: when an alt is bought, the line is named after the alt (never the plan piece\'s name on another id)', L2);
      fs.writeFileSync(path.join(LOGS, 'clan_state.json'), JSON.stringify({ warehouse: { items: [{ id: 8678, count: 1 }] } }));
      const R3 = U.preset(ctx, 'OrangeLeader', 'A', 'wh,buy'), L3 = (R3.chars[0] && R3.chars[0].lines) || [];
      t(L3.length === 1 && L3[0].src !== 'clan', 'c7 preset: clan warehouse unticked = no clan warehouse lines', L3); }
    // ---- UPGGIVE (owner 2026-11-10): distributors + other characters' UNUSED spare pieces, before buying ----
    { const S = U.upgSpare, it = (o) => Object.assign({ id: 1111, objId: 9, enchant: 0 }, o);
      t(S([it({})], 1111).length === 1, 'g1 a spare unused +0 piece on another character is usable');
      t(S([it({ eq: true })], 1111).length === 0 && S([it({ equipped: true })], 1111).length === 0, 'g2 a worn piece is never taken');
      t(S([it({ enchant: 1 })], 1111).length === 0, 'g3 a plused piece is never taken');
      t(S([it({})], 1111, new Set([9])).length === 0, 'g4 a piece kept for that character (kept_ / jobkeep_) is never taken');
      t(S([it({})], 1111, null, new Set([1111])).length === 0, 'g5 a piece of the armor set that character wears is never taken');
      t(S([it({})], 1111, null, null, new Set([1111])).length === 0, 'g6 a piece of that character\'s own gear plan is never taken');
      t(S([it({})], 1111, null, null, null, new Set([9])).length === 0, 'g7 a piece already promised in this plan is never promised twice'); }
    { fs.writeFileSync(path.join(DATA, 'gear_sources.json'), JSON.stringify({ distributors: { on: true, names: ['Distro'] } }));
      const at = new Date().toISOString(), bag = (n, items) => fs.writeFileSync(path.join(LOGS, `bag_${n}.json`), JSON.stringify({ at, items }));
      bag('Distro', [{ id: 1111, objId: 501, enchant: 0 }]); bag('Other', [{ id: 1111, objId: 601, enchant: 0 }, { id: 1111, objId: 602, enchant: 0, eq: true }]);
      bag('SetMan', [{ id: 2001, objId: 701, eq: true }, { id: 2002, objId: 702 }]); bag('Away', [{ id: 1111, objId: 801 }]);
      fs.writeFileSync(path.join(LOGS, 'kept_Other.json'), JSON.stringify({ items: [] }));
      const G = { x: 80000, y: 148000, ageSec: 5, level: 50, classId: 0 };
      ctx.readStates = () => [Object.assign({ name: 'Distro' }, G), Object.assign({ name: 'Other' }, G), Object.assign({ name: 'SetMan' }, G), { name: 'Away', x: 10000, y: 10000, ageSec: 5 }];
      CI = Object.assign({}, CI, { bag: [], wh: [], clan: [] }); planned.length = 0;
      const P = await U.planAll(ctx, { orders: [{ name: 'Vyka', lines: [{ item: { src: 'clan', id: 1111 } }, { item: { src: 'clan', id: 1111 } }, { item: { src: 'clan', id: 1111 } }] }], use: { wh: true, clan: true, buy: false } });
      const src = planned.map(b => b.item.src + ':' + b.item.char + ':' + b.item.objId);
      t(src[0] === 'char:Distro:501', 'g8 not in the clan warehouse: the distributor\'s spare piece first', src);
      t(src[1] === 'char:Other:601', 'g9 then another character\'s unused spare piece (never its worn one), each piece promised once', src);
      t(P.orders[0].lines[2] && P.orders[0].lines[2].error && !src[2], 'g10 no third spare piece (worn / away from Giran) and buying unticked: that line says why', P.orders[0].lines[2]);
      planned.length = 0;
      await U.planAll(ctx, { orders: [{ name: 'Vyka', lines: [{ item: { src: 'clan', id: 2002 } }] }], use: { wh: true, clan: true, buy: false } });
      t(!planned.length, 'g11 a spare piece of the armor set its owner wears is never taken (SetMan keeps its helm)', planned);
      ctx.readStates = () => []; }
  } finally { Object.assign(IP, orig); try { fs.rmSync(SB, { recursive: true, force: true }); } catch (e) { } }
  // ---- b) bot side (pure + static) ----
  { const blk = SW.slice(SW.indexOf('// UPGFALL-PURE-BEGIN'), SW.indexOf('// UPGFALL-PURE-END'));
    let f = null; try { f = new Function(blk + '\nreturn upgFallSources;')(); } catch (e) { }
    t(!!f, 'b5 swarm.js has the pure UPGFALL block');
    if (f) {
      t(JSON.stringify(f({ src: 'clan', enchant: 0 }, { use: { wh: true, clan: true }, buyOk: true })) === '["wh","givers","buy"]', 'b6 clan line: own warehouse (ticked), distributors / other characters, then buy (ticked)');
      t(JSON.stringify(f({ src: 'clan', enchant: 0 }, { use: { wh: false, clan: true }, buyOk: false })) === '["givers"]', 'b7 nothing else ticked: only the givers\' spare pieces (then the line fails, the next line goes on)');
      t(JSON.stringify(f({ src: 'clan', enchant: 3 }, { use: { wh: true }, buyOk: true })) === '[]', 'b8 plused piece: no fallback (gear.md R12)');
      t(JSON.stringify(f({ src: 'wh', enchant: 0 }, { buyOk: true })) === '["givers","buy"]', 'b9 an old job without use{}: no warehouse, givers, buying only when it was allowed'); }
    { let g = null; try { g = new Function(blk + '\nreturn upgSpareRows;')(); } catch (e) { }
      const r = (o) => Object.assign({ id: 5, objId: 7, enchant: 0, equipped: false }, o);
      t(g && g([r({})], 5).join() === '7' && !g([r({ equipped: true })], 5).length && !g([r({ enchant: 2 })], 5).length && !g([r({})], 5, new Set([7])).length && !g([r({})], 5, null, new Set([5])).length && !g([r({})], 5, null, null, new Set([5])).length,
        'g12 giver side (swarm.js): only an unused +0 piece (not worn / kept / of its worn set / of its plan)'); }
    { const src = SW.slice(SW.indexOf('function gdBagRows('), SW.indexOf('async function gdDeliverMany('));
      let g = null; try { g = new Function('const num = (v) => Number(v) || 0;\n' + src + '\nreturn gdBagRows;')(); } catch (e) { }
      const bag = [{ id: 5, objId: 1 }, { id: 5, objId: 2 }];
      t(g && g(bag, [{ id: 5, count: 1, objId: 2 }]).rows[0].objId === 2 && g(bag, [{ id: 5, count: 1, objId: 3 }]).rows.length === 0, 'g13 the giver hands over exactly the reserved piece (never another one)'); }
    { const off = SW.slice(SW.indexOf('function upgGiverOffer('), SW.indexOf('function upgGiverOffer(') + 3000);
      t(/currentTownKey\(\) !== 'Giran' \|\| Me\.IsDead \|\| IsInCombat \|\| IJ\.busy/.test(off) && /upgSpareRows\(bag, id, keep, setIds, planIds\)\.find\(x => !held\.has\(x\)\)/.test(off) && /GD\.res\[d\.rid\] = \{[^}]*objId: o \}/.test(off), 'g14 a giver offers only in Giran / idle, an unused piece not reserved already, and reserves that exact piece');
      t(/if \(d\.upg\) \{ upgGiverOffer\(d, S\); return; \}/.test(SW) && /gdBestOffer\(\(GD\.offers\[rid\] \|\| \[\]\)\.filter\(x => x\.src !== 'clan'\)\)/.test(SW) && /if \(a === 'givers'\) \{[^\n]*upgAskGivers\(/.test(SW.slice(SW.indexOf('async function upgradeRun('), SW.indexOf('async function itemJobOrder('))), 'g15 upgradeRun asks the givers before buying (never the clan warehouse through this ask)'); }
    const run = SW.slice(SW.indexOf('async function upgradeRun('), SW.indexOf('async function itemJobOrder('));
    t(/const alts = upgFallSources\(it, U\);/.test(run) && /if \(!f\.ok && alts\.includes\('buy'\)\)/.test(run), 'b10 upgradeRun falls through the ticked sources, then buys');
    const fetch = SW.slice(SW.indexOf('async function ijFetch('), SW.indexOf('async function ijFetch(') + 1200);
    t(/if \(!\(num\(id\) > 0\)\) return \{ ok: false/.test(fetch), 'b11 ijFetch never asks a warehouse for item 0');
    const ijo = SW.slice(SW.indexOf('async function itemJobOrder('), SW.indexOf('async function itemJobOrder(') + 20000);
    t(/if \(J\.kind === 'upgrade' \|\| !J\.item \|\| !\(num\(J\.item\.id\) > 0\)\) \{/.test(ijo) && ijo.indexOf("J.kind === 'upgrade' || !J.item") < ijo.indexOf('starts: ${J.item.name}'), 'b12 an upgrade order never runs the single-item path (the "item 0 x1" clan warehouse ask)'); }
  // ---- c / d / f) page ----
  t(/&use=\$\{\['wh', 'clan', 'buy'\]\.filter\(k => S\.use\[k\]\)/.test(PAGE), 'c8 the page fills presets only from the ticked sources');
  t(/addPick\(i, s, S\.slot\.slot, S\.slot\.idx, '', \{ ownerPick: true \}\)/.test(PAGE), 'c9 a source tapped on the paperdoll list is the owner\'s pick');
  t(!/waiting for the next Giran visit · running · finished/.test(PAGE) && /goes to Giran alone now, then back to the party/.test(PAGE), 'd2 the orders box shows the real state (no fixed "waiting for the next Giran visit")');
  t(/const softW = b\.softWarn === true \? warn : overSafe;/.test(IPSRC) && /softWarn: true/.test(API), 'f1 cost / level notes are plain warnings on the Upgrade page (no tick needed)');
  t(/if \(to > SAFE\) overSafe\.push/.test(IPSRC) && /\(src === 'wh' \|\| src === 'clan'\) && cur > SAFE\) overSafe\.push/.test(IPSRC), 'f2 enchanting above the safe level / a plused warehouse piece still need the tick');
  t(/if \(t\.id === 'upSafe'\) \{ S\.overSafeOk = t\.checked; check\(\); return; \}/.test(PAGE), 'f3 ticking the warning re-checks the plan (no stale "0 ready")');
  console.log(fails ? `\n${fails} check(s) FAILED` : '\nall checks passed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('FAIL crashed: ' + (e && e.stack || e)); process.exit(1); });
