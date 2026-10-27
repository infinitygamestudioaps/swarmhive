// OFFLINE TEST of CCFUND-2026-10-27 (public tester Vykaax, Destroyer "YellowNine" 76 -> Titan: "class did not change — server: #46 You use Crush
// of Doom" + "the bots don't carry enough adena and don't request it from leader"): the price is read from the Professions page, a short
// character asks its leader (party purse) and the party's adena givers (fund round), waits and tries again; a failed click is explained only
// by refusal messages AFTER the click / the answer page.   node docs/plan/tools/test_classchange_fund.js   (exit code 1 when a check fails)
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const src = fs.readFileSync(process.env.SWARM_JS || path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
let fails = 0; const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails++; };
const blk = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i); if (i < 0 || j < 0) throw new Error('block ' + a + ' not found'); return src.slice(i, j); };
const fnSrc = (name) => { const a = src.indexOf('function ' + name + '('); if (a < 0) throw new Error(name + ' not found'); return src.slice(a, src.indexOf('\n}\n', a) + 2); };
const PURE = blk('// CCFUND-PURE-BEGIN', '// CCFUND-PURE-END');
const REF = /const DLG_REFUSALS = \[[\s\S]*?\n\];/.exec(src)[0] + '\n' + fnSrc('dlgRefusal');
const M = new Function(PURE + REF + '\nreturn { CC_COST_DEF, CC_FUND, ccFmt, ccText, ccCostFromPage, ccKnownCost, ccRefusal, ccGiverLabel, ccNeedLine, dlgRefusal };')();

// A) the price on the page (our own saved 2nd-profession page: "The cost of changing the profession: <font color="LEVEL">200 000 &#57;</font>")
const PAGE2 = 'Select the desired profession.\t\t\t\t\t\t\t<br1>\t\t\t\t\t\t\tThe cost of changing the profession: <font color="LEVEL">200 000 &#57;</font>\t\t\t\t\t\t\t<br>'
  + '<table width=700 border=0><tr><td align=center width=230><button value="Bishop" action="bypass 16" width=200 height=30></td></tr></table>';
const c2 = M.ccCostFromPage(PAGE2);
check(c2 && c2.adena === 200000 && !c2.items, 'A1 "200 000 <adena icon>" = 200,000 adena');
check(M.ccCostFromPage(PAGE2.replace('200 000', '5 000 000')).adena === 5000000, 'A2 a 3rd-profession price "5 000 000" = 5,000,000');
check(M.ccCostFromPage(PAGE2.replace('200 000 &#57;', '15,000,000 adena')).adena === 15000000, 'A3 "15,000,000 adena" with commas');
check(M.ccCostFromPage(PAGE2.replace('200 000 &#57;', 'Free')).adena === 0, 'A4 "Free" = 0');
{ const it = M.ccCostFromPage(PAGE2.replace('200 000 &#57;', "1 Giant's Codex")); check(it && it.items === "1 Giant's Codex" && it.adena === 0, 'A5 an item price is reported as items (never funded as adena)'); }
check(M.ccCostFromPage('<button value="Titan" action="bypass 16">') === null, 'A6 no price line = null (the configured price is used)');
{ const real = fs.readdirSync(path.join(ROOT, 'Logs')).filter(f => /^career_[^_]+\.html$/.test(f)).slice(0, 40).map(f => fs.readFileSync(path.join(ROOT, 'Logs', f), 'utf8')).filter(h => /cost of changing/i.test(h));
  if (real.length) check(real.every(h => M.ccCostFromPage(h) && M.ccCostFromPage(h).adena === 200000), `A7 every saved Professions page in Logs/ (${real.length}) reads 200,000`);
  else console.log('skip A7 (no saved Logs/career_*.html pages here)'); }
// B) the configured price
check(M.ccKnownCost({}, 2) === 200000 && M.ccKnownCost({}, 3) === null, 'B1 defaults: 2nd 200,000, 3rd unknown (the page says it)');
check(M.ccKnownCost({ classChangeCost: { 3: 10000000 } }, 3) === 10000000 && M.ccKnownCost({ classChangeCost: { '2': 0 } }, 2) === 0, 'B2 fund_rules.json classChangeCost wins (also 0)');
check(M.ccKnownCost({ classChangeCost: { 3: 'x' } }, 3) === null, 'B3 a broken value = the default');
// C) the refusal reason: only AFTER the click, never an unrelated message
const T = 1000;
const ring = [{ at: T + 100, id: 46, text: '#46 You use Crush of Doom' }];
check(M.ccRefusal('', ring, T, M.dlgRefusal) === null, 'C1 "#46 You use Crush of Doom" is NOT the server\'s answer (the YellowNine case)');
{ const r = M.ccRefusal('', ring.concat([{ at: T + 300, id: 279, text: '#279 You do not have enough adena.' }]), T, M.dlgRefusal); check(r && r.key === 'adena' && r.from === 'server', 'C2 #279 after the click = not enough adena'); }
check(M.ccRefusal('', [{ at: T - 5, id: 279, text: '#279 You do not have enough adena.' }], T, M.dlgRefusal) === null, 'C3 a refusal from BEFORE the click does not count');
{ const r = M.ccRefusal('<html><body>Career -> Professions<br>You do not have enough adena to change the profession.</body></html>', [], T, M.dlgRefusal); check(r && r.key === 'adena' && r.from === 'page', 'C4 the answer page text "not enough adena"'); }
{ const r = M.ccRefusal('<body>To change class you must obtain 76 level.</body>', [], T, M.dlgRefusal); check(r && r.key === 'level', 'C5 the answer page "you must obtain 76 level" = level'); }
check(M.ccRefusal(PAGE2, [], T, M.dlgRefusal) === null, 'C6 the plain Professions page (price line, buttons) is no refusal');
check(M.ccRefusal('', [{ at: T + 1, id: 22, text: '#22 Your target is out of range.' }], T, M.dlgRefusal) === null, 'C7 a cast\'s "target out of range" is no class-change refusal');
// D) who was asked + the dashboard line
check(M.ccGiverLabel({ me: 'YellowNine', leader: 'Vyk', isLeader: false, givers: { mode: 'collector' }, collector: 'Banker' }) === 'Vyk (party leader), Banker (collector)', 'D1 member: its leader + the collector');
check(M.ccGiverLabel({ me: 'Vyk', leader: 'Vyk', isLeader: true, givers: { mode: 'list', list: ['Rich', 'Vyk'] } }) === 'Rich', 'D2 leader: the party\'s listed givers (never himself)');
check(/^nobody/.test(M.ccGiverLabel({ me: 'Vyk', leader: 'Vyk', isLeader: true, givers: { mode: 'none' } })), 'D3 no leader to ask + givers off = says nobody (and where to switch it on)');
{ const l = M.ccNeedLine('Titan', 5000000, 1200000, 'Vyk (party leader)'); check(l === 'Titan needs 5,000,000 adena (I have 1,200,000, 3,800,000 short) — asked Vyk (party leader)', 'D4 note: "needs X adena ... asked <giver>"'); }
// E) wiring in swarm.js
const once = fnSrc('classChangeOnce'), wrap = fnSrc('classChange');
check(/ccCostFromPage\(page\)/.test(once) && /ccKnownCost\(ccCostRules\(\), tier\)/.test(once) && /itemCount\(57\) < cost/.test(once), 'E1 before the click: price from the page, else the configured one; short = no click');
check(/ccRefusal\(res, sysMsgRing, tClick, dlgRefusal\)/.test(once) && !/lastSysMsg/.test(once), 'E2 after the click: only refusals after the click (lastSysMsg is gone)');
check(/needAdena/.test(once) && /ccWaitFunds\(n\.cls, n\.cost, why\)/.test(wrap) && /classChangeOnce\(`\$\{why\} \(after the adena top-up\)`\)/.test(wrap), 'E3 short / refused for adena -> ask, wait, try again');
const wait = fnSrc('ccWaitFunds');
check(/App\.emit\('swarm\.ccfund'/.test(wait) && /note\(`class change: \$\{line\}/.test(wait) && /CC_FUND\.asks/.test(wait), 'E4 the ask goes out on swarm.ccfund and is noted on the dashboard (bounded asks)');
const h = src.slice(src.indexOf("App.on('swarm.ccfund'"), src.indexOf('async function ccWaitFunds'));
check(/purseRun\(`class change \$\{d\.name\} -> \$\{d\.cls\}`, \{ only: \[d\.name\], manual: true, amount: Number\(d\.short\) \|\| 0 \}\)/.test(h) && /teamNames\(\)\.includes\(d\.name\)/.test(h), 'E5 the leader pays his own member through the party purse (the existing !purse give path)');
check(/const fundTarget = \(n\) => \{ const b = fundTargetBase\(n\), a = typeof ccAskOpen === 'function' \? ccAskOpen\(n\) : 0;/.test(src) && /ccAskOpen\(n\) > 0 \/\* CCFUND/.test(src), 'E6 the fund round tops up an open ask (target raised, no 30-min pause)');
check(!/\b(sell|Sell|buyAt|BuyItem|gearUpgrade)\b/.test(PURE + wait + h), 'E7 no selling / buying in the class-change funding (NOAUTOSELL, no auto gear buys)');
console.log(fails ? `\n${fails} FAILED` : '\nALL OK'); process.exit(fails ? 1 : 0);
