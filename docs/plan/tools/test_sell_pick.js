// OFFLINE TEST of SELLPICK (2026-10-13): what the bots sell at !sell / town sell / every supply run, and WHY nothing went.
// Tester: "+1 Leather Gauntlets marked 'sell (all bots)' -> !sell says nothing marked/junk to sell"; owner: "bots are not selling junk when
// resupplying". Runs the SELLPICK-PURE block of swarm.js in node with fixtures, + source checks of the host wiring, + (when the files exist)
// a replay over the real bags (Logs/bag_<Name>.json) with the real Scripts/data/sell_list.json + Logs/unsellable.json: old rule vs new rule.
//   node docs/plan/tools/test_sell_pick.js [swarm.js]      (or SWARM_JS=<file>; default Scripts_dev/swarm.js; exit 1 on a failure)
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const SRC = process.argv.slice(2).filter(a => !/^--/.test(a))[0] || process.env.SWARM_JS || path.join(ROOT, 'Scripts_dev', 'swarm.js');
const src = fs.readFileSync(SRC, 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL: ' + m); } };
const blk = (n) => { const a = src.indexOf(`// ${n}-BEGIN`), b = src.indexOf(`// ${n}-END`); if (a < 0 || b < a) throw new Error(`${n} block not found in ${SRC}`); return src.slice(a, b); };
const M = new Function(blk('SELLPICK-PURE') + '\nreturn { SELLPICK, spGradeRank, spBandOfLevel, spSupplyJunkGrades, spMarks, spIsMarked, spBanned, spStrike, spPick, spSkipText, spWhyNothing };')();
const NEVER_JUNK = /^(Shadow Item|Apprentice Adventurer's|Traveler's)\b/i;   // same as swarm.js
{ const m = src.match(/const NEVER_JUNK = (\/.*\/i);/); ok(m && m[1] === String(NEVER_JUNK), 'NEVER_JUNK in swarm.js matches the test copy'); }

const NOW = Date.parse('2026-10-13T14:00:00Z'), H = 3600000;
const GEAR = {   // gear rows (gear_items.json shape)
  605: { n: 'Leather Gauntlets', s: 'gloves', g: 'D' }, 49: { n: 'Gloves', s: 'gloves', g: 'NONE' }, 845: { n: "Cat's Eye Earring", s: 'earring', g: 'NONE' },
  2369: { n: "Squire's Sword", s: 'weapon', g: 'NONE' }, 1101: { n: 'Tunic of Devotion', s: 'chest', g: 'NONE' }, 7000: { n: 'Common Item - Brigandine', s: 'chest', g: 'C' },
  158: { n: 'Tarbar - Health', s: 'weapon', g: 'D' }, 22: { n: 'Leather Shirt', s: 'chest', g: 'NONE' }, 2386: { n: 'Wooden Breastplate', s: 'chest', g: 'NONE' },
};
const row = (id, name, extra) => Object.assign({ objId: 1000 + Math.floor(Math.random() * 1e6), id, name, count: 1, eq: false, quest: false, enchant: 0 }, extra || {});
const base = (o) => Object.assign({ marks: { all: [], keep: [] }, me: 'Bob', keepIds: [57, 736, 737], noSale: {}, now: NOW, nosell: new Set(), notrade: new Set(),
  protect: () => false, starterKeep: () => false, info: (id) => GEAR[id] || null, junk: true, junkGrades: ['none'], gain: () => 0, wanted: () => false, neverJunk: NEVER_JUNK }, o || {});
const ids = (r) => r.list.map(x => x.id).sort((a, b) => a - b);

// ---- 1. the tester's case: an ENCHANTED D-grade piece marked "sell (all bots)" (id 605) is sold, every enchant level
{
  const r = M.spPick([row(605, 'Leather Gauntlets', { enchant: 1 })], base({ marks: { all: [605], keep: [] } }));
  ok(ids(r).join() === '605' && r.list[0].why === 'marked', '+1 Leather Gauntlets marked for all bots -> sold');
  const r2 = M.spPick([row(605, 'Leather Gauntlets', { enchant: 1 })], base({ marks: { all: [605] }, junkGrades: [] }));
  ok(ids(r2).join() === '605', 'marked items go even when the junk grades are empty (town sell)');
  const r3 = M.spPick([row(605, 'Leather Gauntlets', { enchant: 1 })], base({ marks: { all: ['605'] } }));
  ok(ids(r3).join() === '605', 'a mark stored as a string id works too');
}
// ---- 2. 'all' vs 'this bot' marks; 'keep' wins
{
  const bag = [row(605, 'Leather Gauntlets'), row(845, "Cat's Eye Earring")];
  ok(ids(M.spPick(bag, base({ me: 'Bob', marks: { all: [], Bob: [845] } }))).join() === '845', 'a mark for this bot (Bob) is sold by Bob');
  ok(ids(M.spPick(bag, base({ me: 'Alice', marks: { all: [], Bob: [845] }, junk: false }))).join() === '', "Bob's own mark is not sold by Alice");
  ok(ids(M.spPick(bag, base({ me: 'Bob', marks: { all: [605], Bob: [845] } }))).join() === '605,845', "'all' + 'Bob' marks both count");
  const k = M.spPick(bag, base({ marks: { all: [605, 845], keep: [845] } }));
  ok(ids(k).join() === '605', "'never sell' (keep) wins over a mark");
  ok(M.spPick(bag, base({ marks: { all: [], keep: [] } })).marked === 0, 'nothing marked -> marked 0');
}
// ---- 3. a mark for ONE enchant level ("605+2" / { id, enchant }) sells only that piece; plain id = all levels
{
  const bag = [row(605, 'Leather Gauntlets', { enchant: 1, objId: 11 }), row(605, 'Leather Gauntlets', { enchant: 2, objId: 12 }), row(605, 'Leather Gauntlets', { objId: 13 })];
  const a = M.spPick(bag, base({ marks: { all: ['605+2'] }, junk: false }));
  ok(a.list.length === 1 && a.list[0].objIds.join() === '12' && a.list[0].count === 1, '"605+2" sells only the +2 piece');
  const b = M.spPick(bag, base({ marks: { all: [{ id: 605, enchant: 0 }] }, junk: false }));
  ok(b.list.length === 1 && b.list[0].objIds.join() === '13', '{ id, enchant: 0 } sells only the plain piece');
  const c = M.spPick(bag, base({ marks: { all: [605] }, junk: false }));
  ok(c.list.length === 1 && c.list[0].count === 3 && c.list[0].objIds.length === 3, 'a plain id sells all three pieces (non-stackables summed, every objId)');
}
// ---- 4. never: worn / quest / protected / Newbie Guide + shadow / untradeable / shop never buys / soul crystal (keepIds) / starter keep
{
  const bag = [row(605, 'Leather Gauntlets', { enchant: 1, eq: true }), row(9001, 'Wolf Fang', { quest: true }), row(1419, 'Blood Mark'),
    row(9002, 'Shadow Item: Falchion'), row(9003, "Apprentice Adventurer's Knife"), row(1146, "Squire's Shirt"), row(2369, "Squire's Sword"),
    row(4629, 'Red Soul Crystal - Stage 0'), row(49, 'Gloves')];
  const r = M.spPick(bag, base({ marks: { all: [605, 9001, 1419, 9002, 9003, 1146, 2369, 4629, 49] }, keepIds: [57, 4629], protect: (id) => id === 1419,
    notrade: new Set([1146]), nosell: new Set([2369]), starterKeep: (id) => id === 49 }));
  ok(r.list.length === 0, 'none of the protected kinds is sold');
  ok((r.skip.worn || []).join() === '+1 Leather Gauntlets', 'worn piece reported as worn, with its enchant');
  ok((r.skip['quest / clan item'] || []).length === 2, 'quest item + protected (clan) item reported');
  ok((r.skip['Newbie Guide / shadow item'] || []).length === 2, 'shadow + Newbie Guide items reported (never sold, even marked)');
  ok((r.skip.untradeable || []).join() === "Squire's Shirt", 'untradeable reported');
  ok((r.skip['the shop does not buy it'] || []).join() === "Squire's Sword", 'datapack is_sellable=false reported');
  ok((r.skip['never sell'] || []).join() === 'Red Soul Crystal - Stage 0', 'soul crystal (keep ids) reported');
  ok((r.skip['starter gear set to keep'] || []).join() === 'Gloves', 'starterGear keep reported');
  const why = M.spWhyNothing(r);
  ok(/^nothing to sell: /.test(why) && /1 marked item is worn \(\+1 Leather Gauntlets\)/.test(why), 'the note says WHY: ' + why.slice(0, 120));
  const q = M.spPick([row(605, 'Leather Gauntlets', { eq: true }), row(605, 'Leather Gauntlets', { enchant: 1 })], base({ marks: { all: [605] } }));
  ok(q.list.length === 1 && q.list[0].count === 1, 'worn copy kept, the spare copy of the same id sold');
  ok(M.spPick([row(57, 'Adena', { count: 5000 })], base({ marks: { all: [57] } })).list.length === 0, 'adena never');
  ok(/no marked item in my bag and no junk/.test(M.spWhyNothing(M.spPick([], base()))), 'empty pick: plain reason');
  const unmarked = M.spPick([row(605, 'Leather Gauntlets', { eq: true })], base());
  ok(Object.keys(unmarked.skip).length === 0, 'reasons are only reported for MARKED items (junk stays quiet)');
}
// ---- 5. Logs/unsellable.json: legacy entries are a strike, not a ban; sure / 2 strikes ban; marked retried after 24 h, junk after 7 days
{
  const bag = [row(1798, 'Recipe: Leather Helmet'), row(845, "Cat's Eye Earring")];
  const legacy = { 1798: 'Recipe: Leather Helmet', 845: "Cat's Eye Earring" };
  const r = M.spPick(bag, base({ marks: { all: [1798] }, noSale: legacy }));
  ok(ids(r).join() === '845,1798', 'legacy "id": "Name" entries no longer block (marked recipe + junk earring offered again)');
  const sure = { 1798: { n: 'x', strikes: 1, sure: true, at: new Date(NOW - 2 * H).toISOString() } };
  const s = M.spPick(bag, base({ marks: { all: [1798] }, noSale: sure }));
  ok(!ids(s).includes(1798) && (s.skip['refused by the shop before'] || []).length === 1, 'a sure refusal 2 h ago bans a marked item (reported)');
  const old = { 1798: { n: 'x', strikes: 1, sure: true, at: new Date(NOW - 25 * H).toISOString() } };
  ok(ids(M.spPick(bag, base({ marks: { all: [1798] }, noSale: old }))).includes(1798), 'marked item retried after 24 h');
  const junkBan = { 845: { n: 'x', strikes: 1, sure: true, at: new Date(NOW - 25 * H).toISOString() } };
  ok(!ids(M.spPick(bag, base({ noSale: junkBan }))).includes(845), 'junk ban holds after 25 h');
  const junkOld = { 845: { n: 'x', strikes: 1, sure: true, at: new Date(NOW - 8 * 24 * H).toISOString() } };
  ok(ids(M.spPick(bag, base({ noSale: junkOld }))).includes(845), 'junk retried after 7 days');
  const one = { 845: { n: 'x', strikes: 1, sure: false, at: new Date(NOW - H).toISOString() } };
  ok(ids(M.spPick(bag, base({ noSale: one }))).includes(845), 'one unclear refusal is not a ban');
  const two = { 845: M.spStrike(one[845], "Cat's Eye Earring", false, NOW) };
  ok(two[845].strikes === 2 && !ids(M.spPick(bag, base({ noSale: two }))).includes(845), 'the second unclear refusal bans it');
  const fromLegacy = M.spStrike("Cat's Eye Earring", "Cat's Eye Earring", false, NOW);
  ok(fromLegacy.strikes === 2 && M.spBanned(fromLegacy, NOW, false), 'a legacy entry + one more unclear refusal = ban');
  ok(M.spStrike(undefined, 'X', true, NOW).sure === true && M.spBanned(M.spStrike(undefined, 'X', true, NOW), NOW, true), 'one sure refusal = ban at once');
  ok(M.spBanned(undefined, NOW, true) === false && M.spBanned('Name', NOW, false) === false, 'no entry / legacy string: no ban');
}
// ---- 6. junk rules
{
  const bag = [row(845, "Cat's Eye Earring"), row(1101, 'Tunic of Devotion'), row(22, 'Leather Shirt', { enchant: 3 }), row(158, 'Tarbar - Health'),
    row(7000, 'Common Item - Brigandine'), row(605, 'Leather Gauntlets'), row(2386, 'Wooden Breastplate'), row(5000, 'Bone Arrow', { count: 233 })];
  const r = M.spPick(bag, base({ junkGrades: ['none'], wanted: (id) => id === 1101, gain: (id) => id === 2386 ? 50 : 0 }));
  ok(ids(r).join() === '845', 'no-grade junk sold; wanted / upgrade / enchanted / D (grade not sold) / non-gear (arrows) kept');
  const r2 = M.spPick(bag, base({ junkGrades: ['none', 'd', 'c'] }));
  ok(ids(r2).includes(605) && ids(r2).includes(7000) && !ids(r2).includes(158), 'D + C junk with those grades: Common Item sold, special-ability piece kept');
  ok(!ids(M.spPick(bag, base({ junk: false }))).length, 'junk off: only marked items');
  ok(r.list.every(x => x.why === 'junk'), 'junk rows say why: junk');
}
// ---- 7. supply-run junk grades = no-grade + every grade below the team's LOWEST band
{
  const G = (l) => M.spSupplyJunkGrades(l).join(',');
  ok(G([]) === 'none' && G([0]) === 'none', 'unknown levels: no-grade only');
  ok(G([19, 45]) === 'none', 'someone under 20 in the team: no-grade only (user 2026-10-06: keep D for the trio)');
  ok(G([25, 45]) === 'none', 'lowest 25 (D band): no-grade only');
  ok(G([40, 52]) === 'none,d', 'lowest 40 (C band): no-grade + D');
  ok(G([62, 70]) === 'none,d,c,b', 'lowest 62 (A band): up to B');
  ok(G([80]) === 'none,d,c,b,a,s', 'lowest 80: up to S');
  ok(M.spBandOfLevel(20) === 'd' && M.spBandOfLevel(39) === 'd' && M.spBandOfLevel(76) === 's' && M.spBandOfLevel(84) === 's84', 'grade bands');
}
// ---- 8. host wiring (source checks)
{
  const cut = (a, n) => { const i = src.indexOf(a); return i < 0 ? '' : src.slice(i, i + (n || 4000)); };
  const sa = cut('async function sellAt(npc, why, grades, only) {', 9000);
  ok(/sold.length >= 2 && sold.length >= refused.length/.test(sa), 'SELLSTUCK: a sale where the shop took only one item bans nothing (sure = the shop took most of the sale)');
  ok(/sellOnlyRows\(only\)/.test(sa) && /function sellOnlyRows/.test(src), 'WHSELL: sellAt can sell exactly the chosen bag entries');
  ok(/sellCandidatesEx\(grades\)/.test(sa) && /pick\.why/.test(sa), 'sellAt uses the pick and returns WHY when nothing goes');
  ok(/unsellRecord\(refused/.test(sa) && !/u\[it\.id\] = it\.name/.test(sa), 'sellAt records strikes (no more life bans after one failed sale)');
  ok(/objOk\(id, i\.objId\)/.test(sa), 'sellAt sells only the bag entries the pick chose');
  const sc = cut("case '!sell': {", 3000);
  ok(/bagSync\(\)/.test(sc) && /note\(`sell: \$\{pick\.why\}`/.test(sc) && !/note\('sell: nothing marked\/junk to sell'/.test(sc), '!sell: bag sync first, the note says WHY');
  ok(/giranGo\('grocer'\)/.test(sc), '!sell in Giran walks the recorded route to Helvetia');
  const ls = cut('async function leadSupply(why, opts) {', 14000);
  ok(/teamStep\(runId, 'sellrun'[^\n]*grades: supplyJunkGrades\(\)/.test(ls), 'supply run: members sell with the team junk grades');
  ok(/junk = (?:pautoOn\('sell'\) \? )?sellCandidates\(junkGrades\)/.test(ls) && /sellAt\(npc, 'supply run', junkGrades\)/.test(ls), 'supply run: the leader sells with the team junk grades (PARTYAUTO 2026-10-13: when its sell switch is on)');
  ok(!/sellCandidates\(\['none'\]\)/.test(src), "no sellCandidates(['none']) left anywhere");
  const sr = cut("if (action === 'sellrun') {", 2500);
  ok(/data\.grades/.test(sr) && /sellAt\(npc, 'team sale', grades\)/.test(sr), 'sellrun uses the grades the leader sent');
  const tw = cut('function teamWantedIds() {', 1500);
  ok(/teamOf\(n\) !== mine/.test(tw) && /spBandOfLevel\(lp\.lvl\)/.test(tw), 'teammateWants: only my team, only its current band');
  ok(/function sellCandidatesEx\(grades\)/.test(src) && /hostSnap\.inv\(\) \|\| Inventory/.test(cut('function sellBagRows() {', 600)), 'one host snapshot of the bag');
  ok(fs.existsSync(path.join(ROOT, 'Scripts', 'data', 'nosell_items.json')), 'Scripts/data/nosell_items.json exists (node docs/plan/tools/nosell_items.js)');
}
// ---- 9. replay over the REAL bags (informational; asserts only what must hold for any data)
{
  const L = path.join(ROOT, 'Logs'), D = path.join(ROOT, 'Scripts', 'data');
  const rj = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch (e) { return d; } };
  const marks = rj(path.join(D, 'sell_list.json'), null), uns = rj(path.join(L, 'unsellable.json'), {}), gdb = rj(path.join(D, 'gear_items.json'), null);
  const bags = fs.existsSync(L) ? fs.readdirSync(L).filter(f => /^bag_.*\.json$/.test(f)) : [];
  if (marks && gdb && bags.length) {
    const nosell = new Set((rj(path.join(D, 'nosell_items.json'), { ids: [] }).ids || []).map(Number)), notrade = new Set((rj(path.join(D, 'trade_items.json'), { notrade: [] }).notrade || []).map(Number));
    const plan = rj(path.join(D, 'gear_shop.json'), {}), oldWanted = new Set();
    Object.values(plan).forEach(p => Object.values((p && p.bands) || {}).forEach(b => b.forEach(e => oldWanted.add(Number(e.itemId)))));
    (gdb.castSets || []).forEach(cs => (cs.chest || []).concat(cs.legs || []).forEach(i => oldWanted.add(Number(i))));
    let oldN = 0, newN = 0, oldMarked = 0, newMarked = 0, blockedLegacy = 0;
    for (const f of bags) {
      const b = rj(path.join(L, f), null); if (!b || !Array.isArray(b.items)) continue;
      const rows = b.items.map(i => ({ objId: i.objId, id: i.id, name: i.name, count: i.count, eq: !!i.eq, quest: !!i.q, enchant: Number(i.en || i.enchant) || 0 }));
      const ctx = base({ marks, me: b.name, now: Date.now(), noSale: uns, nosell, notrade, info: (id) => (gdb.items || {})[id] || null, junkGrades: ['none'] });
      // OLD rule: every unsellable entry blocks, every plan band + every casting set counts as "a teammate wants it"
      const o = M.spPick(rows.filter(r => !uns[r.id]), Object.assign({}, ctx, { nosell: new Set(), notrade: new Set(), wanted: (id) => oldWanted.has(id) }));
      const n = M.spPick(rows, Object.assign({}, ctx, { wanted: () => false }));   // new rule, no teammate levels in this replay
      oldN += o.list.length; newN += n.list.length; oldMarked += o.list.filter(x => x.why === 'marked').length; newMarked += n.list.filter(x => x.why === 'marked').length;
      blockedLegacy += rows.filter(r => typeof uns[r.id] === 'string').length;
    }
    console.log(`replay over ${bags.length} real bags: OLD rule ${oldN} kinds to sell (${oldMarked} marked) -> NEW rule ${newN} kinds (${newMarked} marked); ${blockedLegacy} bag rows were blocked by legacy unsellable.json entries`);
    ok(newN >= oldN, 'the new rule never offers less than the old one on the real bags (with no teammate levels known)');
  } else console.log('(no real bags / data here: replay skipped)');
}
// SAJUNK-2026-10-25 (tester Mr.P: "new gearup is selling SA weapon in grocery shop if i bought the new one"): the client shows "Tarbar"
// (no SA in the name) but item 158 is "Tarbar - Health" -> never junk; the plain Tarbar (id 159 here) of the same grade still is
{ GEAR[159] = { n: 'Tarbar', s: 'weapon', g: 'D' };
  const r = M.spPick([row(158, 'Tarbar'), row(159, 'Tarbar')], base({ junkGrades: ['d'] }));
  ok(ids(r).join() === '159', 'SAJUNK: an SA weapon (id says "- Health", client name plain) is never sold as junk; the plain one is'); }
console.log(`test_sell_pick: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
