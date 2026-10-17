// ITEMS-2026-10-17 tests: Dashboard/itemslogic.js (chances, gains, Special Ability options, sources), Dashboard/itemspage_api.js (plan, chars,
// shops, crafting on the live data — read only), swarm.js ITEMJOB block (the MultiSellList parser on a built High Five packet, the order wiring).
// Never starts a job (nothing is written into Logs/itemjobs, no order is sent).
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
let ok = 0, bad = 0; const t = (c, m, info) => { if (c) { ok++; console.log('ok   ' + m); } else { bad++; console.log('FAIL ' + m + (info !== undefined ? ' — ' + JSON.stringify(info) : '')); } };
const IL = require(path.join(ROOT, 'Dashboard', 'itemslogic.js'));
// 1) rules
t(IL.chanceTo(0, 4, 'weapon', false) === 1, 'up to the safe +4 always works');
t(Math.abs(IL.chanceTo(0, 6, 'weapon', false) - 0.66 * 0.66) < 1e-9 && Math.abs(IL.chanceTo(4, 5, 'armor', false, { armor: 50 }) - 0.5) < 1e-9, 'above the safe level: one chance per step (rates file overrides)');
t(IL.ladder(3, 6, 'weapon', false).map(s => s.safe).join() === 'true,false,false', 'ladder marks the safe steps');
t(IL.scrollFor('weapon', 'C', false) === 951 && IL.scrollFor('armor', 'C', true) === 6574 && IL.scrollFor('jewel', 'S80', false) === 960 && IL.scrollFor('weapon', 'NONE') === 0, 'scroll ids per kind / grade / blessed');
t(IL.gainOf({ s: 'weapon', g: 'C', t: 'SWORD' }, 0, 6).pa === 27 && IL.gainOf({ s: 'weapon', g: 'C', t: 'BOW' }, 0, 3).pa === 18 && /P\.Def/.test(IL.gainOf({ s: 'chest', g: 'B' }, 0, 4).text), 'stat gains (over-enchant doubles, bows double P.Atk)');
const S = { bag: [{ id: 951, count: 2 }, { id: 951, count: 5, eq: true }], wh: [{ id: 951, count: 3 }], clan: [{ id: 951, count: 10 }] };
t(JSON.stringify(IL.takePlan(951, 7, S).from) === JSON.stringify({ bag: 2, wh: 3, clan: 2 }) && IL.takePlan(951, 20, S).missing === 5, 'take plan: bag -> warehouse -> clan, worn pieces never counted');
t(IL.levelOk('C', 40) && !IL.levelOk('B', 45), 'grade level check');
const SA = JSON.parse(fs.readFileSync(path.join(ROOT, 'Scripts', 'data', 'soul_sa_recipes.json'), 'utf8')).recipes;
const homo = IL.saOptions(84, SA);
t(homo.some(o => o.sa === 'Acumen' && o.color === 'red' && o.stage === 7 && o.gem.count === 306), "Homunkulus's Sword: Acumen = red stage 7 + 306 Gemstone C");
t(IL.craftCan({ ing: [{ id: 1, count: 2 }, { id: 2, count: 1 }] }, { bag: [{ id: 1, count: 5 }], wh: [{ id: 2, count: 1 }], clan: [{ id: 2, count: 3 }] }).can === 2, 'craft count from bag + warehouse + clan');

// 2) the API on the live data (read only)
(async () => {
  const A = require(path.join(ROOT, 'Dashboard', 'itemspage_api.js')), LOGS = path.join(ROOT, 'Logs');
  const states = []; for (const f of fs.readdirSync(LOGS)) { if (!/^swarm_state_.+\.json$/.test(f)) continue; try { const s = JSON.parse(fs.readFileSync(path.join(LOGS, f), 'utf8')); if (s && s.name) { s.ageSec = (Date.now() - Date.parse(s.updated)) / 1000; states.push(s); } } catch (e) { } }
  const sent = [];
  const ctx = { DIR: path.join(ROOT, 'Dashboard'), DATA: path.join(ROOT, 'Scripts', 'data'), LOGS, ROOT, readStates: () => states, readJson: (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }, commandRun: async (b) => { sent.push(b); return { body: { ok: true } }; } };
  const C = A.chars(ctx);
  t(C.ok && C.chars.length > 10 && C.chars.some(c => c.clanLeader) && C.chars.some(c => c.crafter), `characters: ${C.chars.length}, clan leader + crafters marked`);
  const SH = A.shops(ctx); t(SH.shops.length >= 5 && SH.shops.some(s => s.rows.some(r => r.id === 84)), "Giran shops listed (Homunkulus's Sword at Stanford)");
  const who = C.chars.find(c => c.clanLeader) || C.chars[0];
  const P = await A.plan(ctx, { name: who.name, item: { src: 'shop', id: 84 }, enchantTo: 6, saId: 6313, giveTo: C.chars[1].name, sources: { 951: 'clan', 4636: 'buy', 2131: 'buy', 1458: 'clan', 1459: 'clan' }, overSafeOk: true });
  const P0 = await A.plan(ctx, { name: who.name, item: { src: 'shop', id: 84 }, enchantTo: 6, saId: 6313 });
  t(!P0.ok && P0.needs.every(n => !n.from.wh && !n.from.clan && !n.from.buy) && P0.overSafe.length === 1, 'ASK FIRST: without picks nothing is taken / bought, and +6 needs the ticked warning');
  t(!P.error && [...new Set(P.steps.map(s => s.k))].join() === 'buy,enchant,sa,give', 'plan order: buy -> enchant -> Special Ability -> give', P.error || P.steps);
  t(P.needs.some(n => n.id === 951 && n.need === 6) && P.needs.some(n => n.id === 4636 && n.need === 1) && P.needs.some(n => n.id === 2131 && n.need === 306), 'plan needs: 6 C weapon scrolls, the red crystal, 306 Gemstone C');
  if (fs.existsSync(path.join(ROOT, 'Scripts', 'data', 'giran_market.json'))) t(P.needs.some(n => n.id === 4636 && n.buy && n.buy.offer.kind === 'exchange') && P.needs.some(n => n.id === 2131 && n.buy && n.buy.offer.kind === 'shop') && P.needs.some(n => n.id === 1458 && n.need === 500), 'buy chain: the soul crystal is exchanged (its D / C crystals become needs), gemstones are bought');
  t(Math.abs(P.chance - 0.66 * 0.66) < 1e-9 && P.gain && P.gain.pa === 27 && P.saOptions.length === 3, 'plan chance + gain + the 3 Special Ability choices');
  t(P.ok === (P.missing.length === 0 && P.adena <= P.haveAdena + 1), 'plan ok only when nothing is missing');
  t((await A.plan(ctx, { name: who.name, item: { src: 'shop', id: 999999 } })).error, 'an item no Giran merchant sells is refused');
  const common = SH.shops.map(s => s.rows.find(r => r.common && r.kind === 'weapon')).find(Boolean);
  if (common) t(/Common items cannot be enchanted/.test((await A.plan(ctx, { name: who.name, item: { src: 'shop', id: common.id }, enchantTo: 2 })).error || ''), 'Common items cannot be enchanted');
  const before = fs.existsSync(path.join(LOGS, 'itemjobs')) ? fs.readdirSync(path.join(LOGS, 'itemjobs')).length : 0;
  const J = await A.job(ctx, { name: who.name, item: { src: 'shop', id: 84 }, enchantTo: 12, blessed: true, saId: 6313, count: 1 });   // blessed C scrolls: nobody sells them
  t(J.code === 409 && /Missing/.test(J.error) && !sent.length && (fs.existsSync(path.join(LOGS, 'itemjobs')) ? fs.readdirSync(path.join(LOGS, 'itemjobs')).length : 0) === before, 'a job with missing materials is refused (no file, no order)');
  const crafter = C.chars.find(c => c.crafter);
  const CR = crafter ? await A.craftInfo(ctx, crafter.name) : null;
  if (!CR || !CR.crafter) console.log('skip crafting checks: no crafter report on this install yet (Logs/crafter_bag_<name>.json)');
  else t(CR.ok && CR.recipes.length > 50 && CR.recipes.every(r => r.ing.length && r.product > 0), `crafting: ${crafter.name} sees ${CR.recipes.length} recipes with materials`);
  if (CR && CR.crafter) t(CR.recipes.every(r => r.can === IL.craftCan(r, { bag: [], wh: [], clan: [] }).can || r.can >= 0), 'craft counts computed');
  if (C.chars.find(c => !c.crafter)) await A.craftInfo(ctx, C.chars.find(c => !c.crafter).name).then(r => t(r.ok && r.crafter === false, 'a non-crafter is told it cannot craft'));

  // 3) swarm.js: MultiSellList parser on a built packet (High Five layout) + wiring
  const SW = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
  const grab = (a, b) => SW.slice(SW.indexOf(a), SW.indexOf(b, SW.indexOf(a)));
  const num = (x) => Number(x) || 0;
  const { msParse } = new Function('num', grab('function msReader(p)', 'function msDump(') + '; return { msReader, msParse };')(num);
  const out = []; const C1 = (v) => out.push(v & 255), H = (v) => { C1(v); C1(v >> 8); }, D = (v) => { H(v & 65535); H((v >>> 16) & 65535); }, Q = (v) => { D(v % 4294967296); D(Math.floor(v / 4294967296)); };
  const item = (id, cnt, ench, prod) => { D(id); if (prod) D(0); H(prod ? 0 : 0); Q(cnt); H(ench); D(0); D(0); H(65534); H(0); for (let k = 0; k < 6; k++) H(0); };
  const pkt = (entries) => { out.length = 0; C1(0); C1(0); C1(0xD0); D(1005); D(1); D(1); D(40); D(entries.length);
    entries.forEach((e, i) => { D(i + 1); C1(0); H(0); D(0); D(0); H(65534); H(0); for (let k = 0; k < 6; k++) H(0); H(e.p.length); H(e.g.length); e.p.forEach(x => item(x[0], x[1], x[2], true)); e.g.forEach(x => item(x[0], x[1], x[2], false)); });
    const a = out.slice(); a[0] = a.length & 255; a[1] = a.length >> 8; return a; };
  const P1 = pkt([{ p: [[6314, 1, 5]], g: [[84, 1, 5], [4647, 1, 0], [2131, 306, 0], [57, 918000, 0]] }, { p: [[6313, 1, 5]], g: [[84, 1, 5], [4636, 1, 0], [2131, 306, 0], [57, 918000, 0]] }]);
  const M = msParse(P1);
  t(M && M.list === 1005 && M.finished === 1 && M.entries.length === 2 && M.entries[1].entry === 2 && M.entries[1].products[0].id === 6313 && M.entries[1].ings[0].ench === 5 && M.entries[1].ings[3].count === 918000, 'MultiSellList read: list, entries, products, ingredients, enchant, adena', M);
  t(msParse(P1.concat([0])) === null && msParse(P1.slice(0, P1.length - 3)) === null, 'a list that does not add up exactly is refused (nothing gets exchanged)');
  t(/case '!itemjob':/.test(SW) && /case '!whlook':/.test(SW) && /case '!craftmake':/.test(SW), 'swarm.js handles !itemjob / !whlook / !craftmake');
  t(/stops at the first fail/.test(SW) && /if \(n2 !== lvl \+ 1\)/.test(grab('async function ijEnchant', 'async function itemJobOrder')), 'enchanting stops at the first fail');
  t(/ijSA\(J\.sa/.test(SW) && SW.indexOf('ijEnchant(objId') < SW.indexOf('const s = await ijSA('), 'the doer enchants before the Special Ability');
  const CMD = require(path.join(ROOT, 'Dashboard', 'commands.js'));
  t(['!itemjob ij_dagger1_abc12', '!whlook Dagger1', '!craftmake 2330 3 Crafter1'].every(x => CMD.classify(x)), 'the command catalog knows the three orders');
  const IDX = fs.readFileSync(path.join(ROOT, 'Dashboard', 'index.html'), 'utf8'), SRV = fs.readFileSync(path.join(ROOT, 'Dashboard', 'server.js'), 'utf8');
  t(/ItemsPage\.route\(kind, arg\)/.test(IDX) && /CraftPage\.route\(kind, arg\)/.test(IDX) && /data-tab="items"/.test(IDX) && /data-tab="crafting"/.test(IDX) && /require\('\.\/itemspage_api'\)\.handle\(/.test(SRV), 'pages, tabs and the API are hooked in');
  console.log(`\n${ok} passed, ${bad} failed`); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
