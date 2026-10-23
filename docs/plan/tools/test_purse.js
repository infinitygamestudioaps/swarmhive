// OFFLINE TEST of the PARTY PURSE (tester 2026-10-13 20:45, v1.6.4: leaders with 37M / 44M, members with ~100 adena, every member
// "[gear] gearup: not enough adena (0 to spend after keep 300000)" and the leader never paid anything). Never touches the game, MCP or the live Logs.
//   node docs/plan/tools/test_purse.js        (exit code 1 when a check fails; SWARM_JS=<file> tests another copy of swarm.js)
// 1) PURSE-PURE of Scripts_dev/swarm.js: pocket money by level, the party rule (missing = OFF), the need, purseDecide (amounts, caps, the
//    leader's keep, the per-run budget, off = nothing paid, supply run only for members whose gear upgrades are on, !gearup / manual orders),
//    the plain-language lines, the "Needs you" card rows (off only, the leader must be able to pay).
// 2) the dashboard copy of the card rule (Dashboard/partysettings.js PurseCard.purseCardRows) = the bot's on the same inputs.
// 3) Dashboard/fundpage_api.js fundSanitize: parties.<leader>.purse + memberKeep kept / checked; a file without them stays without them.
// 4) source checks: the order of the steps (the leader pays before anybody shops; his own gear-up after the members; the supply buying after
//    the gear step), the gear planner uses the scaled pocket money everywhere, !purse / purseask / swarm_state.purse, the command catalog.
// 5) defaults: the owner's fund_rules.json -> every party OFF (unchanged behaviour); the public package (release_build sanitizer) -> OFF.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..', '..', '..');
const SRCF = process.env.SWARM_JS || path.join(ROOT, 'Scripts_dev', 'swarm.js');
const src = fs.readFileSync(SRCF, 'utf8');
let fails = 0, n = 0;
const check = (ok, what, info) => { n++; console.log((ok ? 'ok   ' : 'FAIL ') + what + (!ok && info !== undefined ? '  — ' + (typeof info === 'string' ? info : JSON.stringify(info)) : '')); if (!ok) fails++; };
const blk = (b, e) => { const i = src.indexOf(b), j = src.indexOf(e, i + 1); if (i < 0 || j < i) { console.error(b + ' block not found'); process.exit(1); } return src.slice(i, j); };
const P = new Function(blk('// PURSE-PURE-BEGIN', '// PURSE-PURE-END') + '\nreturn { PURSE_DEF, purseKeepTable, purseKeepFor, purseRule, purseNeed, purseDecide, purseMemberLine, purseSkipWhy, purseCardRows, purseFmt, purseShort };')();

// ---- 1) pure --------------------------------------------------------------------------------------------------------------
// pocket money by level
check(P.purseKeepFor({}, 1) === 5000 && P.purseKeepFor({}, 19) === 5000 && P.purseKeepFor({}, 20) === 50000 && P.purseKeepFor({}, 39) === 50000, 'pocket money: lvl 1-19 5,000, 20-39 50,000 (default table)');
check(P.purseKeepFor({}, 40) === 150000 && P.purseKeepFor({}, 59) === 150000 && P.purseKeepFor({}, 60) === 300000 && P.purseKeepFor({}, 85) === 300000, 'pocket money: 40-59 150,000, 60+ 300,000 (the old flat 300k only from 60)');
check(P.purseKeepFor({ memberKeep: [[50, 1000], [10, 0], [999, 7]] }, 5) === 0 && P.purseKeepFor({ memberKeep: [[50, 1000], [10, 0], [999, 7]] }, 30) === 1000 && P.purseKeepFor({ memberKeep: [[50, 1000], [10, 0], [999, 7]] }, 90) === 7, 'pocket money: an own table (sorted by level) wins');
check(P.purseKeepFor({ memberKeep: [[20, -5]] }, 1) === 5000 && P.purseKeepFor({ memberKeep: 'x' }, 1) === 5000 && P.purseKeepFor({ memberKeep: [] }, 70) === 300000, 'pocket money: a broken table = the default');
check(P.purseKeepFor({}, 200) === 300000 && P.purseKeepFor({}, 0) === 5000, 'pocket money: beyond the table = the last row; level 0/unknown = level 1');
// the rule
const R0 = P.purseRule({}, 'JadeLeader');
check(R0.on === false && R0.leaderKeep === 2000000 && R0.memberCap === 5000000 && R0.budget === 0 && R0.src === 'default', 'no rule = OFF (keep 2M, cap 5M, no budget)');
check(P.purseRule({ parties: { JadeLeader: { receive: true } } }, 'JadeLeader').on === false, 'a party entry without purse = OFF');
check(P.purseRule({ parties: { JadeLeader: { purse: { on: 'yes' } } } }, 'JadeLeader').on === false, 'on must be literally true');
const R1 = P.purseRule({ parties: { JadeLeader: { purse: { on: true, leaderKeep: 5000000, memberCap: 0, budget: 1000000 } } } }, 'JadeLeader');
check(R1.on && R1.leaderKeep === 5000000 && R1.memberCap === 0 && R1.budget === 1000000 && R1.src === 'party', 'own rule: keep 5M, no cap (0), budget 1M');
check(P.purseRule({ parties: { JadeLeader: { purse: { on: true, leaderKeep: -1, memberCap: 'abc' } } } }, 'JadeLeader').leaderKeep === 2000000, 'bad amounts = the defaults');
check(P.purseRule({ parties: { JadeLeader: { purse: { on: true } } } }, 'OrangeLeader').on === false, 'another party is not affected');
// the need
check(P.purseNeed({ want: 400000, keep: 5000, have: 106 }) === 404894, 'need = plan 400,000 + pocket money 5,000 - adena 106 = 404,894');
check(P.purseNeed({ want: 0, keep: 5000, have: 0 }) === 0, 'nothing planned = needs nothing (not even its pocket money)');
check(P.purseNeed({ want: 100000, keep: 5000, have: 500000 }) === 0, 'can afford it = 0');
// THE TESTER'S PARTY: JadeLeader 37.3M, 8 members with ~106 adena, level 1-2, each plans ~400k of D-grade / no-grade gear
const jade = Array.from({ length: 8 }, (_, i) => ({ name: 'Jade' + ['Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'][i], want: 400000 + i * 10000, have: 106, keep: 5000, auto: false, grade: 'D' }));
const lead = { name: 'JadeLeader', adena: 37300000 };
const off = P.purseDecide(R0, lead, jade, {});
check(off.off === false && off.pay.length === 0 && off.skip.length === 0 && off.need.length === 0, 'OFF + their automatic gear upgrades off (public default): nothing is paid, nothing asked in a supply run', off);
const offOrder = P.purseDecide(R0, lead, jade, { order: true });
check(offOrder.off === true && offOrder.pay.length === 0 && offOrder.skip.length === 8 && offOrder.skip.every(s => s.why === 'off'), '"Better gear now" with Leader pays OFF: nothing paid, all 8 "off" (the note says Settings → Money)');
const ON = P.purseRule({ parties: { JadeLeader: { purse: { on: true } } } }, 'JadeLeader');
const gearup = P.purseDecide(ON, lead, jade, { order: true });
check(gearup.pay.length === 8 && gearup.skip.length === 0 && gearup.pay.every(p => p.amount === p.need && !p.capped && !p.partial), 'Leader pays ON + "Better gear now": all 8 get exactly what they miss', gearup.pay.map(p => p.name + ' ' + p.amount));
check(gearup.pay.find(p => p.name === 'JadeTwo').amount === 404894 && gearup.total === jade.reduce((a, m) => a + P.purseNeed(m), 0), 'JadeTwo gets 404,894; the total is the sum of the needs', gearup.total);
check(lead.adena - gearup.total >= ON.leaderKeep, 'the leader keeps at least 2,000,000 afterwards');
const supplyRun = P.purseDecide(ON, lead, jade.map((m, i) => Object.assign({}, m, { auto: i < 3 })), {});
check(supplyRun.pay.length === 3 && supplyRun.pay.every(p => ['JadeTwo', 'JadeThree', 'JadeFour'].includes(p.name)), 'supply run: only the members whose automatic gear upgrades are on are paid (the others do not shop in it)', supplyRun.pay.map(p => p.name));
// cap, budget, leader keep, partial
const cap = P.purseDecide(P.purseRule({ parties: { J: { purse: { on: true, memberCap: 100000 } } } }, 'J'), { name: 'J', adena: 37300000 }, jade.slice(0, 2), { order: true });
check(cap.pay.length === 2 && cap.pay.every(p => p.amount === 100000 && p.capped), 'per-member cap 100k: each gets 100,000 (capped)', cap.pay);
const bud = P.purseDecide(P.purseRule({ parties: { J: { purse: { on: true, budget: 600000 } } } }, 'J'), { name: 'J', adena: 37300000 }, jade.slice(0, 3), { order: true });
check(bud.pay.length === 2 && bud.pay[0].amount === 404894 && bud.pay[1].partial && bud.pay[1].amount === 600000 - 404894 && bud.skip.length === 1 && bud.skip[0].why === 'leader', 'budget 600k per run: one full, one part, one not paid', bud);
const poor = P.purseDecide(ON, { name: 'JadeLeader', adena: 2500000 }, jade.slice(0, 3), { order: true });
check(poor.avail === 500000 && poor.pay.length === 2 && poor.pay[0].amount === 404894 && poor.pay[1].partial && poor.skip.length === 1, 'leader 2.5M, keeps 2M: 500k to spread — smallest need first, the next gets the rest, the last nothing', poor);
check(P.purseDecide(ON, { name: 'JadeLeader', adena: 1500000 }, jade.slice(0, 2), { order: true }).pay.length === 0, 'leader below his keep: nobody is paid');
check(P.purseDecide(ON, lead, [{ name: 'JadeLeader', want: 9e6, have: 0, keep: 0 }].concat(jade.slice(0, 1)), { order: true }).pay.map(p => p.name).join() === 'JadeTwo', 'the leader never pays himself');
check(P.purseDecide(ON, lead, jade, { order: true, only: ['JadeFive'] }).pay.map(p => p.name).join() === 'JadeFive', 'only = just that member');
// manual (the user's Give it now): rule off / cap / budget do not apply, the leader's keep does
const man = P.purseDecide(P.purseRule({ parties: { JadeLeader: { purse: { on: false, memberCap: 1000 } } } }, 'JadeLeader'), lead, jade, { manual: true, only: ['JadeTwo'] });
check(man.pay.length === 1 && man.pay[0].amount === 404894 && !man.off, 'Give it now (manual): paid although Leader pays is off, the cap does not apply');
check(P.purseDecide(R0, lead, jade, { manual: true, only: ['JadeTwo'], amount: 1000000 }).pay[0].amount === 1000000, 'manual with an amount: exactly that');
check(P.purseDecide(R0, lead, [], { manual: true, only: ['JadeTen'], amount: 70000 }).pay[0].amount === 70000, 'manual with an amount for a member that did not answer the plan: that amount');
check(P.purseDecide(R0, { name: 'JadeLeader', adena: 2100000 }, jade, { manual: true, only: ['JadeTwo'] }).pay[0].partial === true, 'manual: still never below the leader\'s keep (a part of it)');
check(P.purseDecide(ON, lead, [{ name: 'X', want: 50, have: 0, keep: 0 }], { order: true }).skip[0].why === 'small', 'less than 100 adena is not a trade');
// plain-language lines (the tester's words)
check(P.purseMemberLine('JadeTwo', { need: 52400, have: 106 }, 'JadeLeader', true) === 'JadeTwo: needs 52,400 for its upgrades, has 106 — asking JadeLeader', 'member line ON: "JadeTwo: needs 52,400 for its upgrades, has 106 — asking JadeLeader"');
check(P.purseMemberLine('JadeTwo', { need: 52400, have: 106, grade: 'D' }, 'JadeLeader', false) === "JadeTwo: needs 52,400 for its D-grade upgrades, has 106 — not paid: the party's 'Leader pays' is off (Settings → Money)", 'member line OFF: "... not paid: the party\'s \'Leader pays\' is off (Settings → Money)"');
check(/has no more to spare \(keeps at least 2,000,000\)/.test(P.purseSkipWhy({ why: 'leader' }, 'JadeLeader', ON)) && /Settings → Money/.test(P.purseSkipWhy({ why: 'off' }, 'JadeLeader', R0)), 'skip reasons in words');
check(/\$\{Me\.Name\} paid \$\{p\.name\} \$\{purseFmt\(p\.amount\)\} for gear/.test(src), 'the leader\'s line: "JadeLeader paid JadeTwo 52,400 for gear"');
check(P.purseFmt(37300000) === '37,300,000' && P.purseShort(37300000) === '37.3M' && P.purseShort(52400) === '52k', 'number formats');
// the card rows
const mem = [{ name: 'JadeTwo', need: 52400, have: 106, grade: 'D' }, { name: 'JadeThree', need: 0, have: 900000 }, { name: 'JadeFour', need: 40000000, have: 5 }];
const rows = P.purseCardRows(R0, lead, mem);
check(rows.length === 1 && rows[0].name === 'JadeTwo' && rows[0].need === 52400 && rows[0].grade === 'D', 'card OFF: JadeTwo (52,400); not JadeThree (needs nothing) and not JadeFour (more than the leader can spare)', rows);
check(P.purseCardRows(ON, lead, mem).length === 0, 'card ON: no card (the leader pays by himself)');
check(P.purseCardRows(R0, { name: 'JadeLeader', adena: 2000000 }, mem).length === 0, 'card: a leader at his keep cannot pay -> no card');

// ---- 2) the dashboard copy of the card rule ----------------------------------------------------------------------------------
{
  const win = {}, doc = { addEventListener() { }, querySelectorAll: () => [], getElementById: () => null, documentElement: { classList: { add() { }, remove() { } } } };
  const ctx = vm.createContext({ window: win, document: doc, console, setTimeout, clearTimeout, fetch: () => Promise.reject(new Error('no')) });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'Dashboard', 'partysettings.js'), 'utf8'), ctx);
  const PC = win.PurseCard;
  check(!!PC && typeof PC.purseCardRows === 'function' && !!win.PartySettings, 'partysettings.js loads and exposes PurseCard + PartySettings');
  const cases = [[R0, lead, mem], [ON, lead, mem], [R0, { name: 'JadeLeader', adena: 2000000 }, mem], [R0, { name: 'L', adena: 9e9 }, jade.map(m => Object.assign({ need: P.purseNeed(m) }, m))], [null, lead, mem], [{ on: false }, { name: 'L', adena: 3e6 }, [{ name: 'A', need: 1e6 }, { name: 'B', need: 1000001 }]]];
  check(cases.every(c => JSON.stringify(PC.purseCardRows(...c)) === JSON.stringify(P.purseCardRows(...c))), 'the dashboard card rule = the bot\'s card rule (6 cases)');
  check(JSON.stringify(PC.KEEP_DEF) === JSON.stringify(P.PURSE_DEF.memberKeep) && PC.DEF.leaderKeep === P.PURSE_DEF.leaderKeep && PC.DEF.memberCap === P.PURSE_DEF.memberCap, 'the dashboard defaults = the bot\'s (keep table, 2M, 5M)');
  // partyData from live reports (STATE.chars shape)
  const list = [{ name: 'JadeLeader', party: 'JadeLeader', adena: 37300000, ageSec: 3, purse: { rule: { on: false, leaderKeep: 2000000 }, need: 0 } },
    { name: 'JadeTwo', party: 'JadeLeader', adena: 106, ageSec: 3, purse: { need: 52400, have: 106, keep: 5000, grade: 'D' } },
    { name: 'JadeLock', party: 'JadeLeader', adena: 1, ageSec: 3, purse: { need: 99999, lock: true } },
    { name: 'JadeOld', party: 'JadeLeader', adena: 1, ageSec: 900, purse: { need: 99999 } }];
  const pd = PC.partyData('JadeLeader', list);
  check(pd && pd.rows.length === 1 && pd.rows[0].name === 'JadeTwo', 'card data: locked gear and stale (> 5 min) reports are left out', pd && pd.rows);
  const html = PC.partyHtml('JadeLeader', list);
  check(/JadeTwo<\/b> needs <b>52,400<\/b> adena for its D-grade upgrades — JadeLeader has <b>37.3M<\/b>/.test(html) && /data-quick="party:JadeLeader\|!purse give JadeTwo\|/.test(html) && /data-purse-on="JadeLeader"/.test(html) && /Give it now/.test(html) && /Switch on 'Leader pays' for this party/.test(html), 'card html: the sentence, [Give it now] = "!purse give JadeTwo", [Switch on \'Leader pays\' for this party]');
  check(PC.partyHtml('JadeLeader', list.map(c => c.name === 'JadeLeader' ? Object.assign({}, c, { purse: { rule: { on: true } } }) : c)) === '', 'card html: Leader pays ON -> no card');
  check(PC.partyHtml('JadeLeader', [list[1]]) === '' && PC.partyHtml('JadeLeader', [Object.assign({}, list[0], { purse: null }), list[1]]) === '', 'card html: no report from the leader (or an older swarm.js) -> no card');
  const r = PC.fundFill({});
  check(r.town === 'Giran' && r.on === true && r.givers.keepAtLeast === 30000000 && r.defaults.memberTarget === 3000000, 'the switch-on writer fills a new file with the bots\' defaults (the API accepts it)');
}

// ---- 3) the API sanitizer ------------------------------------------------------------------------------------------------------
{
  const API = require(path.join(ROOT, 'Dashboard', 'fundpage_api.js'));
  const base = () => ({ on: false, town: 'Giran', everyMin: 30, minGive: 200000, slack: 500000, brokeBelow: 500000, givers: { mode: 'auto', list: [], keepAtLeast: 30000000 }, defaults: { leaderTarget: 8000000, memberTarget: 3000000, clanLeaderTarget: 12000000 }, parties: {}, chars: {} });
  const a = base(); a.parties.JadeLeader = { receive: true, purse: { on: true, leaderKeep: '5m', memberCap: '', budget: 0 } };
  const s1 = API.fundSanitize(a, {});
  check(s1.ok && JSON.stringify(s1.rules.parties.JadeLeader.purse) === JSON.stringify({ on: true, leaderKeep: 5000000, budget: 0 }), 'API: purse kept ("5m" -> 5,000,000, blank cap = default, 0 budget kept)', s1);
  const b = base(); b.parties.X = { purse: { on: 'true' } };
  check(API.fundSanitize(b, {}).rules.parties.X.purse.on === false, 'API: purse.on must be literally true');
  const c = base(); c.parties.X = { purse: { leaderKeep: 'lots' } };
  check(!API.fundSanitize(c, {}).ok, 'API: a bad amount is refused');
  const d = base(); d.parties.X = { purse: [1] };
  check(!API.fundSanitize(d, {}).ok, 'API: purse must be an object');
  const e = base(); e.memberKeep = [[40, '50k'], [20, 5000], [999, '300k']];
  const s5 = API.fundSanitize(e, {});
  check(s5.ok && JSON.stringify(s5.rules.memberKeep) === JSON.stringify([[20, 5000], [40, 50000], [999, 300000]]), 'API: memberKeep kept, sorted, amounts parsed', s5);
  for (const bad of [[[20, 5000], [20, 1]], [[1, 5]], [[20]], 'x', []]) { const f = base(); f.memberKeep = bad; check(!API.fundSanitize(f, {}).ok, 'API: bad memberKeep refused: ' + JSON.stringify(bad)); }
  const g = API.fundSanitize(base(), {});
  check(g.ok && !('memberKeep' in g.rules) && Object.keys(g.rules.parties).length === 0, 'API: a file without purse / memberKeep stays without them (no keys added)');
  const live = JSON.parse(fs.readFileSync(path.join(ROOT, 'Scripts', 'data', 'fund_rules.json'), 'utf8').replace(/^﻿/, ''));
  const ls = API.fundSanitize(live, live);
  // 2026-10-21: the owner switches Leader pays on himself (Spoiler7 2026-10-20) = check that the round trip adds / drops no purse / memberKeep key
  const pk = (o) => JSON.stringify([Object.keys(o.parties || {}).filter(k => 'purse' in o.parties[k]).sort(), 'memberKeep' in o]);
  check(ls.ok && pk(ls.rules) === pk(live), 'API: the owner\'s file round-trips without purse / memberKeep keys added or dropped', pk(live));
}

// ---- 4) source checks: order of the steps, the scaled pocket money, the hooks -------------------------------------------------
{
  const sup = src.slice(src.indexOf('async function leadSupply('), src.indexOf('// --- Adena ---', src.indexOf('async function leadSupply(')));
  const iPlan = sup.indexOf("let gp = await teamStep(runId, 'gearplan'"), iPurse = sup.indexOf("await purseStep(runId, gp.got, 'supply run')"), iOrder = sup.indexOf('const order = needOrder(gp.got, all);'), iRun = sup.indexOf("teamStep(runId, 'gearrun'"), iBuy = sup.indexOf("pstStep('supply', 'buy at Helvetia'");
  check(iPlan > 0 && iPurse > iPlan && iOrder > iPurse && iRun > iOrder && iBuy > iRun, 'supply run: plan -> the leader pays -> plan again -> members shop -> THEN the leader\'s supply buying at Helvetia', { iPlan, iPurse, iOrder, iRun, iBuy });
  check(/const all = members\.map\(a => a\.name\)\.filter\(n => n !== Me\.Name\)\.concat\(\[Me\.Name\]\);/.test(sup), 'supply run: the leader buys his own gear LAST (gear run order)');
  check(/if \(pr\.paid > 0\) \{ res\.push\('purse: ' \+ pr\.text\); gp = await teamStep\(runId, 'gearplan2', 30000\); \}/.test(sup), 'supply run: after paying everyone plans again with the new adena (own step gearplan2: GEARFUND-2026-10-23)');
  const gu = src.slice(src.indexOf("if (cmd === '!gearup') {"), src.indexOf("if (cmd === '!clanskill')"));
  const gP = gu.indexOf("await purseRun('!gearup'"), gE = gu.indexOf("App.emit('swarm.gearup'"), gL = gu.indexOf("await gearUpgrade('!gearup')");
  check(gP > 0 && gE > gP && gL > gE && /await sleep\(\(buyers\.length \+ 1\) \* 7000\)/.test(gu), '!gearup: the leader pays first, then the members buy, then he buys his own (after them)');
  check(/if \(cmd === '!purse'\) \{ if \(isLeader\(\)\) purseOrder\(parts\)/.test(src) && /async function purseOrder\(parts\)/.test(src), '!purse give <name|all> / !purse (status) handled by the leader');
  const po = src.slice(src.indexOf('async function purseOrder(parts)'), src.indexOf('async function purseOrder(parts)') + 4000);
  check(po.indexOf("purseRun('!purse give'") < po.indexOf("App.emit('swarm.gearup'") && /manual: true/.test(po), '!purse give: pays (manual order) before the paid members buy');
  check(/if \(action === 'purseask'\) \{ const p = purseInfoMine\(true\); purseNoteMine\(p\);/.test(src), "team step 'purseask': every member reports its plan cost + says what it misses");
  check(/try \{ o\.purse = pursePublic\(\); \} catch/.test(src) && /st\.purse = Object\.assign\(\{\}, SW\.slow\.purse\)/.test(src), 'swarm_state.purse (the dashboard card) is published');
  // the scaled pocket money is used by the whole gear planner (no flat 300k left)
  const gp = src.slice(src.indexOf('async function gearPlanStep()'), src.indexOf('async function gearPlanStep()') + 3000);
  check(/planUpgrades\(itemCount\(57\) - gearKeep\(\)\)/.test(gp) && !/U\.keep/.test(gp), 'gearPlanStep spends adena above the level pocket money (gearKeep), not 300k');
  const gU = src.slice(src.indexOf('async function gearUpgrade(why)'), src.indexOf('async function gearUpgrade(why)') + 3000);
  check(/planUpgrades\(itemCount\(57\) - gearKeep\(\)\)/.test(gU) && !/U\.keep/.test(gU), 'gearUpgrade (!gearup, supply run) uses gearKeep too');
  const pu = src.slice(src.indexOf('function planUpgrades(budget)'), src.indexOf('async function buyGearPicks'));
  check(/const keepA = \(typeof gearKeep === 'function' \? gearKeep\(\) : num\(U\.keep\)\)/.test(pu) && (pu.match(/U\.keep|upgrade\.keep/g) || []).length === 1, 'the planner\'s "needs N adena (… + K kept for supplies)" note uses the same scaled pocket money (flat value only when the function is lifted alone by a test)');
  check((src.match(/U\.keep\b/g) || []).length === 1, 'no other U.keep (flat 300k) left in swarm.js');
  check(/function gearKeep\(\)[\s\S]{0,400}purseKeepFor\(fundRules\(\), num\(Me\.Level\)\)[\s\S]{0,200}R\.on\) k = Math\.max\(k, R\.leaderKeep\)/.test(src), 'gearKeep: level pocket money; a leader with Leader pays on keeps his keep-at-least for the supplies');
  check(/if \(!CONFIG\.adena\.enabled\) \{ try \{ purseNoteMine\(purseInfoMine\(false\)\); \} catch/.test(src), 'ADENA SHORT with the old hand-out off: the plain purse line instead of "CONFIG.adena.enabled"');
  const cat = fs.readFileSync(path.join(ROOT, 'Dashboard', 'commands.js'), 'utf8');
  check(/tpl: '!purse give \{name\}', handler: 'leader'/.test(cat) && /tpl: '!purse', handler: 'leader'/.test(cat), 'command catalog: !purse give {name} + !purse (status), handled by the leader');
}

// ---- 5) defaults ---------------------------------------------------------------------------------------------------------------
{
  const live = JSON.parse(fs.readFileSync(path.join(ROOT, 'Scripts', 'data', 'fund_rules.json'), 'utf8').replace(/^﻿/, ''));
  // 2026-10-21: parties the owner switched on himself (a purse entry with on:true, saved by the dashboard) are his choice; every other party = OFF
  check(Object.keys(live.parties || {}).every(k => (live.parties[k].purse && live.parties[k].purse.on === true) || P.purseRule(live, k).on === false), "owner's fund_rules.json: Leader pays OFF for every party he did not switch on himself (his rules unchanged)");
  // PKGSKIP-2026-10-13: the public package has no release_build.js (owner tool) -> that check is skipped there
  const RBF = path.join(ROOT, 'docs', 'plan', 'tools', 'release_build.js'), rb = fs.existsSync(RBF) ? fs.readFileSync(RBF, 'utf8') : null;
  if (rb === null) console.log('  skipped: the release_build.js check needs the owner install (the public package has no release_build.js)');
  else check(/case 'fund_rules\.json': \{ o\.on = false; o\.parties = \{\};/.test(rb), 'public package: fund_rules.json parties emptied -> Leader pays OFF for everyone, cross-party hand-outs OFF');
  check(!/PRIVATE-START[\s\S]{0,200}PurseCard/.test(fs.readFileSync(path.join(ROOT, 'Dashboard', 'index.html'), 'utf8')), 'the card is public (not inside a PRIVATE block)');
}

console.log(`\n${n - fails} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
