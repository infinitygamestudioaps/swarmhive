// OVERVIEW-2026-10-24: Dashboard/overview_api.js on synthetic data (a temp Logs folder; no real files touched).
//   A total exp from level + %, B rates over the window (exp/h, wallet/h, level-ups, kills/h), C deaths = alive -> dead edges,
//   D costs (supply_use x prices, gear_upgrades "bought", pshop "= N adena"), E party sums + next level-ups, F the recorder line + read back.
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const SB = fs.mkdtempSync(path.join(os.tmpdir(), 'ovtest-')), LOGS = path.join(SB, 'Logs'), DIR = path.join(SB, 'Dashboard');
fs.mkdirSync(LOGS); fs.mkdirSync(path.join(DIR, 'data'), { recursive: true });
fs.writeFileSync(path.join(DIR, 'data', 'item_prices.json'), JSON.stringify({ 1463: 10, 1061: 300 }));
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const O = require(path.join(ROOT, 'Dashboard', 'overview_api.js')), LE = require(path.join(ROOT, 'Dashboard', 'levelEta.js'));
const now = Date.now(), H = 3600000;

// A
ok(O.totalExp(10, 0) === LE.expTotal(10), 'A1 level start');
ok(O.totalExp(10, 50) === Math.round(LE.expTotal(10) + (LE.expTotal(11) - LE.expTotal(10)) / 2), 'A2 half level');
ok(O.totalExp(0, 5) === null && O.totalExp(10, null) === null, 'A3 missing = null');

// B + C: Alpha hunts an hour (exp +1000 per minute, adena +100k over the hour, one level-up, one death)
const R = O._R; R.ring.clear(); R.deaths.clear();
const base = O.totalExp(40, 10);
const push = (name, s) => { const a = R.ring.get(name) || []; const prev = a[a.length - 1]; if (prev && !prev.dead && s.dead) { const d = R.deaths.get(name) || []; d.push(s.at); R.deaths.set(name, d); } a.push(s); R.ring.set(name, a); };
for (let i = 0; i <= 60; i++) push('Alpha', { at: now - H + i * 60000, party: 'Alpha', level: i < 30 ? 40 : 41, exp: base + i * 1000, adena: 1e6 + i * 100000 / 60, dead: i === 40 ? 1 : 0, on: 1, kh: 90 });
for (let i = 0; i <= 60; i++) push('Beta', { at: now - H + i * 60000, party: 'Alpha', level: 38, exp: O.totalExp(38, 20) + i * 500, adena: 5e5, dead: 0, on: 1, kh: 60 });
// D: costs in the window
fs.writeFileSync(path.join(LOGS, 'supply_use_Alpha.json'), JSON.stringify({ v: 1, b: [{ h: Math.floor((now - 30 * 60000) / H) * H, ms: 1800000, u: { 1463: 1000, 1061: 2 } }, { h: now - 30 * H, ms: 1, u: { 1463: 99999 } }] }));
const iso = (t) => new Date(t).toISOString();
fs.writeFileSync(path.join(LOGS, 'gear_upgrades.log'), `${iso(now - 20 * 60000)} [Beta] lvl 38 mage (supply run): Karmian Tunic 336105: bought; Karmian Stockings 210325: bought | x\n${iso(now - 5 * H)} [Beta] old: Thing 999999: bought\n`);
fs.writeFileSync(path.join(LOGS, 'pshop_buys.log'), `${iso(now - 10 * 60000)} [Alpha] bought 100 x Soulshot (B) at 400 from M40 = 40,000 adena (max 400)\n${iso(now - 10 * 60000)} [Alpha] run: bought 100 Soulshot (B) at 400 (M40) for 40,000 adena\n`);
const st = (n, lvl, exp, extra) => Object.assign({ name: n, party: 'Alpha', level: lvl, exp, adena: 1e6, ageSec: 2, leader: n === 'Alpha', role: 'tank', classId: 6, expHour: { amt: 60000, pct: 3, n: 90, mins: 60 }, expLog: [] }, extra || {});
const ctx = { DIR, LOGS, readStates: () => [st('Alpha', 41, 12, { expLog: [{ up: true, at: now - 30 * 60000 }] }), st('Beta', 38, 40)] };
const v = O.build(ctx, 1);
const A = v.chars.find(c => c.name === 'Alpha'), B = v.chars.find(c => c.name === 'Beta');
ok(Math.abs(A.expH - 60000) < 200, 'B1 exp/h ~60000, got ' + A.expH);
ok(Math.abs(A.adenaH - 100000) < 2000, 'B2 wallet/h ~100k, got ' + A.adenaH);
ok(A.levels === 1 && B.levels === 0, 'B3 level-ups counted');
ok(A.killsH === 90, 'B4 kills/h from the samples');
ok(A.deaths === 1 && B.deaths === 0, 'C1 one death (alive -> dead edge)');
const bh = Math.floor((now - 30 * 60000) / H) * H;   // the bucket's hour; only its part inside [now - 1 h, now] counts
const useCost = (1000 * 10 + 2 * 300) * (Math.min(now, bh + H) - Math.max(now - H, bh)) / H;
ok(Math.abs(A.useH - useCost) < 50, 'D1 consumables only inside the window, ' + A.useH + ' vs ' + Math.round(useCost));
ok(A.gearH === 40000, 'D2 player shop buy counted once (not the "run:" echo), got ' + A.gearH);
ok(B.gearH === 336105 + 210325, 'D3 gear bought in the window only, got ' + B.gearH);
ok(A.costH === A.useH + A.gearH, 'D4 costs = use + gear');
const P = v.parties.find(p => p.leader === 'Alpha');
ok(P && P.n === 2 && P.expH === A.expH + B.expH && P.costH === A.costH + B.costH, 'E1 party sums its members');
ok(P.minLevel === 38, 'E2 party lowest level');
ok(v.ups.length === 1 && v.ups[0].name === 'Alpha', 'E3 just levelled');
ok(v.total.n === 2 && v.total.deaths === 1, 'E4 totals');
ok(A.spark.length === 24 && A.spark[23] > A.spark[0], 'E5 exp line rises');

// G (OVDRILL-2026-10-29): the detail sheets behind the tiles add up to the tiles; deaths merged from the recorder + swarm_buffs.log + intent logs
{
  fs.writeFileSync(path.join(DIR, 'data', 'items.json'), JSON.stringify({ 1463: ['Soulshot (C)', 'icon/etc_spirit_bullet_white_i00', 'Etc', '3'], 1061: ['Healing Potion', 'icon/etc_lesser_potion_red_i00', 'Etc', '0'], 1864: ['Stem', 'icon/etc_branch_gold_i00', 'Etc', '0'] }));
  fs.writeFileSync(path.join(DIR, 'data', 'item_prices.json'), JSON.stringify({ 1463: 10, 1061: 300, 1864: 41 }));
  fs.writeFileSync(path.join(LOGS, 'loot_' + new Date(now).toISOString().slice(0, 10) + '.log'), [[iso(now - 5 * 60000), 'Alpha', 'Alpha', 7, 'Stem', 'loot', 'Cruma', 'hunt'], [iso(now - 6 * 60000), 'Beta', 'Alpha', 2, 'Stem', 'spoil', 'Cruma', 'hunt'],
    [iso(now - 7 * 60000), 'Gamma', 'Gamma', 5, 'Stem', 'loot', 'Cruma', 'hunt']].map(r => r.join('\t')).join('\n') + '\n');
  const dAt = now - 20 * 60000;   // Alpha's recorder edge (i = 40); the note says 40 s earlier, the Ketra Raider hit him before
  fs.writeFileSync(path.join(LOGS, 'swarm_buffs.log'), `${iso(dAt - 70000)} [Alpha] self-defence: Ketra Raider is hitting me — fighting it with skills\n${iso(dAt - 40000)} [Alpha] died — buffs gone, rebuffing after revive\n${iso(now - 3 * H)} [Beta] died — buffs gone, old\n`);
  // Beta: a res nobody sampled (revive only) + an escape death that ends in a town respawn (one death, not two)
  fs.writeFileSync(path.join(LOGS, 'intent_Beta.log'), [
    `${iso(now - 41 * 60000)} hunting: x | from 100,200,-300 | task: autolevel: Cruma Tower: 1st floor · lvl 38`,
    `${iso(now - 40 * 60000)}   -> escape FAIL: died | now at 110,210,-300`,
    `${iso(now - 38 * 60000)} revived: alive again — rebuffing before anything else | from 83000,148000,-3400 | task: autolevel: Cruma Tower: 1st floor · lvl 38`,
    `${iso(now - 10 * 60000)} revived: alive again (Alpha resurrected me) — rebuffing before anything else | from 500,600,-700 | task: autolevel: Cruma Tower: 1st floor · lvl 38`, ''].join('\n'));
  R.cache.clear(); R.dscanAt = 0; R.tails.clear(); R.dev.clear(); R.hits.clear(); R.costCache = { key: '' };
  const g = O.build(ctx, 1); R.cache.set(1, { at: Date.now(), v: g });
  const GA = g.chars.find(c => c.name === 'Alpha'), GB = g.chars.find(c => c.name === 'Beta');
  ok(GA.deaths === 1, 'G1 recorder edge + "died" note = one death, got ' + GA.deaths);
  ok(GB.deaths === 2, 'G2 Beta: res-only death + escape death closed by a town respawn = 2, got ' + GB.deaths);
  const dd = O.detail(ctx, 'deaths', 1);
  ok(dd.rows.length === g.total.deaths && g.total.deaths === 3 && dd.total === 3, 'G3 death list length = the tile (' + dd.rows.length + ' / ' + g.total.deaths + ')');
  const da = dd.rows.find(r => r.name === 'Alpha'), dres = dd.rows.find(r => r.name === 'Beta' && r.resBy), desc = dd.rows.find(r => r.name === 'Beta' && !r.resBy);
  ok(da && da.killer === 'Ketra Raider' && !da.approx && da.at === dAt - 40000 && da.level === 41, 'G4 Alpha: exact time from the note, killer + level, ' + JSON.stringify(da));
  ok(dres && dres.x === 500 && /Cruma/.test(dres.task) && dres.party === 'Alpha', 'G5 res death: place = where he got up, task + party');
  ok(desc && desc.x === 110 && desc.town && desc.how.includes('escape'), 'G6 escape death: place = where he died (not the town), ' + JSON.stringify(desc));
  ok(dd.byChar[0].name === 'Beta' && dd.byChar[0].n === 2 && dd.byChar.reduce((t, x) => t + x.n, 0) === 3, 'G7 per-character count, most first');
  const ad = O.detail(ctx, 'adena', 1);
  ok(ad.sum === g.total.adena && ad.total === g.total.adena && ad.rows.length === 2 && ad.rows[0].adena >= ad.rows[1].adena, 'G8 per-character adena adds up to the tile, ' + ad.sum + ' / ' + g.total.adena);
  { const ch = ad.rows.find(r => r.name === 'Alpha').change; ok(ch > 95000 && ch <= 100000, 'G9 adena change over the window (first sample may fall just outside), ' + ch); }
  const ld = O.detail(ctx, 'loot', 1);
  ok(ld.rows.length === 1 && ld.rows[0].each === 20 && ld.rows[0].count === 14 && ld.others === 5 * 20 && ld.worth === 9 * 20, 'G10 loot: unit price = half the shop price, others split off, ' + JSON.stringify(ld.rows[0]) + ' others ' + ld.others);
  ok(ld.worth === GA.lootH + GB.lootH && ld.totalH === g.total.lootH, 'G11 loot worth = the tile (1 h window)');
  const cd = O.detail(ctx, 'costs', 1);
  ok(Math.abs(cd.items.reduce((t, i) => t + i.value, 0) - g.total.useH) < 2 && cd.items[0].name === 'Soulshot (C)', 'G12 consumables add up to the tile, named, ' + cd.items.map(i => i.name + '=' + Math.round(i.value)).join(','));
  ok(cd.buys.reduce((t, b) => t + b.v, 0) === g.total.gearH && cd.buys.some(b => b.kind === 'player shop' && /Soulshot/.test(b.name)), 'G13 gear + player shop buys add up to the tile');
  ok(O.detail(ctx, 'nope', 1).ok === false, 'G14 unknown detail refused');
}

// H (OVBAG-2026-10-29): one bag priced like the loot tile (half the shop price), every row marked; "can sell" never a worn / quest / enchanted /
// adena / kept / no-shop item; the sell list is read (all / this character / keep); rows add up to the bag worth; a bad name is refused
{
  const SD = path.join(SB, 'Scripts', 'data'); fs.mkdirSync(SD, { recursive: true });
  fs.writeFileSync(path.join(DIR, 'data', 'item_prices.json'), JSON.stringify({ 1463: 10, 1061: 300, 1864: 41, 2000: 1000, 2001: 5000, 2002: 800, 2003: 600, 2004: 400, 2005: 900, 2006: 700, 2007: 200 }));
  fs.writeFileSync(path.join(DIR, 'data', 'questitems.json'), JSON.stringify([2002]));
  fs.writeFileSync(path.join(SD, 'sell_list.json'), JSON.stringify({ all: [1864], keep: [2006], Alpha: [2000] }));
  fs.writeFileSync(path.join(SD, 'nosell_items.json'), JSON.stringify({ ids: [2007] }));
  fs.writeFileSync(path.join(SD, 'trade_items.json'), JSON.stringify({ notrade: [2005], cat: { 1061: 'consumable' } }));
  fs.writeFileSync(path.join(SD, 'stash_rules.json'), JSON.stringify({ keep: [], keepNames: [], chars: { Alpha: { keepNames: ['^Soulshot'] } } }));
  const bagAt = now - 7 * 60000, it = (id, name, count, type, x) => Object.assign({ id, objId: 9000 + id, name, count, eq: false, q: false, type }, x || {});
  fs.writeFileSync(path.join(LOGS, 'bag_Alpha.json'), JSON.stringify({ at: iso(bagAt), name: 'Alpha', items: [
    it(57, 'Adena', 123456, 'Etc'), it(1864, 'Stem', 30, 'Mats'), it(2000, 'Old Sword', 1, 'Weapon'), it(2001, 'Worn Helm', 1, 'Armor', { eq: true }),
    it(2002, 'Quest Thing', 2, 'Etc'), it(2003, 'Lucky Blade', 1, 'Weapon', { enchant: 3 }), it(2004, 'Quest Flagged', 1, 'Etc', { q: true }),
    it(2005, 'Bound Ring', 1, 'Armor'), it(2006, 'Kept Gem', 4, 'Etc'), it(2007, 'Unsellable', 9, 'Etc'), it(1061, 'Healing Potion', 50, 'Etc'),
    it(1463, 'Soulshot (C)', 1000, 'Shot'), it(1999, 'No Price', 3, 'Etc'), it(2004, 'Plain Junk', 5, 'Etc', { objId: 1 })] }));
  R.prices = null;   // prices are memoised 10 min: read the new file
  const bg = O.detail(ctx, 'bag', 1, { name: 'Alpha' }), by = (n) => bg.rows.find(r => r.name === n) || {};
  ok(bg.ok && bg.rows.length === 13 && bg.at === Date.parse(iso(bagAt)), 'H1 bag read with its age, ' + bg.rows.length + ' rows (the worn helm is not listed)');
  ok(bg.rows.reduce((t, r) => t + r.value, 0) === bg.total && bg.total === bg.items + bg.adena && bg.adena === 123456, 'H2 sum of the rows = the bag total (items + coins), ' + bg.total);
  ok(by('Stem').each === 20 && by('Stem').value === 600 && by('Old Sword').each === 500, 'H3 unit value = half the shop price (same as the loot tile)');
  ok(by('Stem').sell && by('Old Sword').sell && by('Plain Junk').sell && by('Old Sword').enU, 'H4 plain items can be sold (gear without an enchant level flagged "check")');
  ok(!bg.rows.some(r => r.name === 'Worn Helm'), 'H5 OVBAG-INBAG: worn gear is not in the bag view (owner: only what is inside the bag)');
  ok(!by('Quest Thing').sell && by('Quest Thing').why === 'quest item' && !by('Quest Flagged').sell && by('Quest Flagged').why === 'quest item', 'H6 quest items (flag or questitems.json) never "can sell"');
  ok(!by('Lucky Blade').sell && by('Lucky Blade').why === 'enchanted +3', 'H7 enchanted gear never "can sell"');
  ok(!by('Adena').sell && by('Adena').adena, 'H8 adena itself is not "can sell"');
  ok(!by('Bound Ring').sell && by('Bound Ring').why === 'untradeable', 'H9 untradeable (trade_items notrade) not "can sell"');
  ok(!by('Unsellable').sell && by('Unsellable').noShop && by('Unsellable').value === 0 && !by('No Price').sell, 'H10 no shop buys it / no price = not sellable, worth 0');
  ok(!by('Kept Gem').sell && by('Kept Gem').kept && by('Kept Gem').list === 'keep' && !by('Healing Potion').sell && by('Healing Potion').why === 'kept' && !by('Soulshot (C)').sell, 'H11 kept: keep list, supplies, stash keepNames');
  ok(by('Stem').list === 'all' && by('Old Sword').list === 'char' && by('Plain Junk').list === '', 'H12 sell list read: all bots / this character / not marked');
  ok(bg.sellable === bg.rows.filter(r => r.sell).reduce((t, r) => t + r.value, 0) && bg.sellable === 600 + 500 + 1000 && bg.marked === 2, 'H13 sellable = the "can sell" rows, ' + bg.sellable);
  ok(bg.rows.every((r, i) => !i || bg.rows[i - 1].value >= r.value), 'H14 sorted by total value');
  ok(O.detail(ctx, 'bag', 1, { name: '../Alpha' }).ok === false && O.detail(ctx, 'bag', 1, { name: 'A<b' }).error === 'bad name' && O.detail(ctx, 'bag', 1, { name: 'Nobody' }).ok === false && O.detail(ctx, 'bag', 1, {}).ok === false, 'H15 bad / unknown name refused');
  ok(O.bagOf(ctx, 'Alpha') === O.bagOf(ctx, 'Alpha'), 'H16 memo: same result object while no file changed');
  R.cache.clear(); const ad2 = O.detail(ctx, 'adena', 1), A2 = ad2.rows.find(r => r.name === 'Alpha');
  ok(A2 && A2.bag && A2.bag.sell === bg.sellable && A2.bag.value === bg.total && ad2.rows.find(r => r.name === 'Beta').bag === null, 'H17 Adena rows carry each bag worth + sellable (null = no bag read)');
  fs.writeFileSync(path.join(SD, 'sell_list.json'), JSON.stringify({ all: [], keep: [] })); const t1 = Date.now() + 5000; fs.utimesSync(path.join(SD, 'sell_list.json'), t1 / 1000, t1 / 1000);
  ok(O.bagOf(ctx, 'Alpha').rows.find(r => r.name === 'Stem').list === '', 'H18 a changed sell list is read again (mtime)');
}

// F: recorder writes a line per character and a fresh module reads it back
O._R.ctx = ctx; O._R.ring.clear(); O._R.deaths.clear();
const f = path.join(LOGS, 'overview_' + new Date().toISOString().slice(0, 10) + '.tsv');
const line = (t, n, dead) => [Math.round(t / 1000), n, 'Alpha', 40, 5000, 100, dead, 1, 50].join('\t');
fs.writeFileSync(f, [line(now - 120000, 'Alpha', 0), line(now - 60000, 'Alpha', 1), line(now - 60000, 'Beta', 0)].join('\n') + '\n');
delete require.cache[require.resolve(path.join(ROOT, 'Dashboard', 'overview_api.js'))];
const O2 = require(path.join(ROOT, 'Dashboard', 'overview_api.js'));
O2._R.started = 1; O2._R.ctx = ctx;   // no timers in a test
(function loadBack() { const R2 = O2._R; const mod = O2; mod.start; })();
// loadBack is internal: start() calls it; run start with a ctx that has no timers effect beyond the test (unref them)
const _si = global.setInterval, _st = global.setTimeout; global.setInterval = () => 0; global.setTimeout = () => 0;
O2._R.started = 0; O2.start(ctx); global.setInterval = _si; global.setTimeout = _st;
ok((O2._R.ring.get('Alpha') || []).length === 2 && (O2._R.ring.get('Beta') || []).length === 1, 'F1 read back after a restart');
ok((O2._R.deaths.get('Alpha') || []).length === 1, 'F2 death edge rebuilt from the file');

fs.rmSync(SB, { recursive: true, force: true });
console.log(fail ? `overview: ${pass} passed, ${fail} failed` : `overview: ALL OK (${pass} checks)`);
process.exit(fail ? 1 : 0);
