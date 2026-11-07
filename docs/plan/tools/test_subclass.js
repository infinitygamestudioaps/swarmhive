// test_subclass.js - requirement orders.md R3 (owner 2026-11-04: "Yes Inspector1 should level its subclass. But you need to subclass it first
// so it goes back to lvl 40 and becomes the subclass class"). !subclass is an owner order only. SUBCLASS2 (live 11-04 09:12): the board only
// UNLOCKS the subclass (100M, "Congratulations ... refer to the leader of the race"), the class is added at the race master; never pay twice;
// the bank's adena is a normal adena trade order (Dashboard/subclass_fund.js), not the runner hand-over.
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
const CAT = fs.readFileSync(path.join(ROOT, 'Dashboard', 'commands.js'), 'utf8');
const SRV = fs.readFileSync(path.join(ROOT, 'Dashboard', 'server.js'), 'utf8');
const TREE = JSON.parse(fs.readFileSync(path.join(ROOT, 'Scripts', 'data', 'class_tree.json'), 'utf8'));
let ok = 0, bad = 0; const check = (c, m, x) => { if (c) { ok++; console.log('ok   ' + m); } else { bad++; console.log('FAIL ' + m + (x === undefined ? '' : ' ' + JSON.stringify(x).slice(0, 300))); } };
const cut = (src, start, end) => { const i = src.indexOf(start); return i < 0 ? '' : src.slice(i, src.indexOf(end, i) + end.length); };

// 1) the pure block runs in node
const pure = cut(SRC, '// SUBCLASS-PURE-BEGIN', '// SUBCLASS-PURE-END');
check(pure.length > 0, 'SUBCLASS-PURE block exists');
const P = new Function(pure + '\nreturn { SUBCLASS, subclassPick, subclassDecide, subclassProbeMayOpen, subclassBoardResult, subclassNpcStep, subclassClassId, subclassVerify };')();
check(P.SUBCLASS.cost === 100000000, 'price = 100,000,000 (the board page)');

// class pick
const acts = [{ label: 'Inspector', cmd: '21' }, { label: 'Judicator', cmd: '22' }, { label: 'Berserker', cmd: '23' }, { label: 'Back', cmd: '1' }];
check(P.subclassPick(acts, 'Berserker').hit && P.subclassPick(acts, 'Berserker').hit.cmd === '23', 'exact class button is picked');
check(P.subclassPick(acts, 'berserker ').hit.cmd === '23', 'case / spaces do not matter');
check(!P.subclassPick(acts, 'Spellhowler').hit, 'a class not offered = no button (never another class)');
check(!P.subclassPick(acts, '').hit, 'no class name = no button');
check(!P.subclassPick([{ label: 'Soul Breaker M', cmd: '1' }, { label: 'Soul Breaker F', cmd: '2' }], 'Soul Breaker').hit, 'two candidates = refuse to guess');
check(!P.subclassPick([{ label: 'Berserkers', cmd: '9' }], 'Berserker').hit, 'part of a word is not a match');

// decide: never pay twice
const base = { probe: false, inGiran: true, adena: 120000000, cost: 100000000, combat: false, raid: false, dead: false, unlocked: false };
check(P.subclassDecide(base).act === 'go' && P.subclassDecide(base).board === true, 'not unlocked, enough adena = board step first');
const un = P.subclassDecide(Object.assign({}, base, { unlocked: true, adena: 1060000 }));
check(un.act === 'go' && un.board === false, 'already unlocked = NO board step and no adena needed (never pay twice)', un);
check(P.subclassDecide(Object.assign({}, base, { inGiran: false })).act === 'refuse', 'not in Giran = refuse');
check(P.subclassDecide(Object.assign({}, base, { combat: true, unlocked: true })).act === 'refuse', 'in a fight = refuse (also when unlocked)');
check(P.subclassDecide(Object.assign({}, base, { raid: true })).act === 'refuse', 'in a raid = refuse');
check(P.subclassDecide(Object.assign({}, base, { dead: true })).act === 'refuse', 'dead = refuse');
const f = P.subclassDecide(Object.assign({}, base, { adena: 19957400 }));
check(f.act === 'fund' && f.missing === 80042600, 'short of adena = ask the bank for the missing amount', f);
check(P.subclassProbeMayOpen(19957400, 100000000) === true && P.subclassProbeMayOpen(100000000, 100000000) === false, 'the probe opens Activate Subclass only when it cannot pay');

// board answers (live texts 11-04)
check(P.subclassBoardResult('Career -> Subclass Total online: 491 (148) Congratulations! You have successfully activated the possibility of a subclass. Please refer to the leader of the race for the activation of the subclass.') === 'unlocked', 'the Congratulations page = board step done');
check(P.subclassBoardResult('You do not have enough to pay for items. You need: 100 000 000') === 'noadena', 'the no-adena page is recognised');
check(P.subclassBoardResult('Career -> Subclass The cost of activation a subclass: 100 000 000') === 'unknown', 'the price page is not success');

// master links (L2J village master: Subclass -> Add a subclass -> class list)
const home = [{ text: 'Learn skills', cmd: 'a' }, { text: 'Subclass.', cmd: 'Subclass 0' }, { text: 'Quest', cmd: 'q' }];
check(P.subclassNpcStep(home, 'Berserker').act === 'menu', 'home page: the Subclass menu');
const menu = [{ text: 'Add subclass.', cmd: 'Subclass 1' }, { text: 'Change subclass.', cmd: 'Subclass 2' }, { text: 'Cancel subclass.', cmd: 'Subclass 3' }];
const sm = P.subclassNpcStep(menu, 'Berserker');
check(sm.act === 'add' && sm.link.cmd === 'Subclass 1', 'menu: Add subclass - never Change / Cancel', sm);
check(P.subclassNpcStep([{ text: 'Change subclass.', cmd: '2' }, { text: 'Cancel subclass.', cmd: '3' }], 'Berserker').act === 'stop', 'only change / cancel links = stop');
const list = [{ text: 'Berserker', cmd: 'Subclass 4 127' }, { text: 'Soul Breaker', cmd: 'Subclass 4 128' }, { text: 'Arbalester', cmd: 'Subclass 4 130' }];
const sl = P.subclassNpcStep(list, 'Berserker');
check(sl.act === 'class' && sl.link.cmd === 'Subclass 4 127', 'class list: exactly Berserker', sl);
check(P.subclassNpcStep(list, 'Inspector').act === 'stop', 'a class not offered = stop (never another class)');
check(P.subclassNpcStep(list, '').act === 'stop', 'probe (no class) never picks a class link');

// class id + verify
check(P.subclassClassId(TREE, 'Berserker') === 127, 'Berserker = class 127 (class_tree.json)');
check(P.subclassClassId(TREE, 'Nonsense') === null, 'an unknown name = null');
check(P.subclassVerify(132, 127, 40, 127).ok === true, 'class 127 at level 40 = done');
check(P.subclassVerify(132, 132, 76, 127).ok === false, 'unchanged class = not done');
check(P.subclassVerify(132, 127, 76, 127).ok === false && P.subclassVerify(132, 127, 76, 127).classOk === true, 'right class but not level 40 = not done');
check(P.subclassVerify(132, 128, 40, 127).ok === false, 'another class = not done');

// 2) the host code
const run = cut(SRC, 'async function subclassRun(cls, probe) {', '\n}\n');
const board = cut(SRC, 'async function subclassBoard(probe) {', '\n}\n');
const master = cut(SRC, 'async function subclassMaster(cls, probe) {', '\n}\n');
check(run && board && master, 'subclassRun / subclassBoard / subclassMaster exist');
check(/unlocked: !!mem\.unlocked/.test(run) && /if \(d\.board\)/.test(run), 'the board step runs only when the memory does not say unlocked');
check(/subMemSave\(\{ unlocked: true/.test(board) && board.indexOf("subclassBoardResult(ccText(p2))") > 0, 'the Congratulations page is remembered at once (Logs/subclass_<name>.json)');
check(/subclassProbeMayOpen\(itemCount\(57\), cost\)/.test(board) && board.indexOf('subclassProbeMayOpen') < board.indexOf('pageRequest(act.cmd'), 'the probe stops BEFORE Activate Subclass when it could pay');
check(/cfgWithBoard\(/.test(board), 'the board step waits for the board like the other board users');
check(/subclass_fund_\$\{Me\.Name\}\.json/.test(run) && !/crunOrder\(/.test(run) && !/swarm\.subclass\.fund/.test(SRC), 'the adena ask is a file for the dashboard trade order, not the runner hand-over');
check(/SUBCLASS\.masters\[race\]/.test(master) && /goToNpc\(String\(id\)\)/.test(master), 'the race master is reached with goToNpc (stands in front first)');
check(/32213, 32214/.test(pure), 'Kamael masters in Giran: Vitus 32213 / Meldina 32214');
check(/probe \? '' : cls/.test(master) && /probe && s\.act === 'class'/.test(master), 'the probe never clicks a class link');
check(/reclick: s\.act !== 'class'/.test(master), 'the class link is never clicked twice');
check(/subNpcSave\(\+\+n/.test(master) && /subclass_\$\{Me\.Name\}_npc_\$\{n\}\.html/.test(SRC), 'every master page is saved (Logs/subclass_<name>_npc_<n>.html)');
check(/SUBCLASS\.confirm/.test(master) && /namesIt\(html\)/.test(master) && /test\(htmlText\(h\)\)/.test(master), 'it confirms only a page that names the chosen class (name or its class id)');
check(/subclassVerify\(cls0, num\(Me\.ClassId\), num\(Me\.Level\), want\)/.test(master), 'verified: the class id and level 40');
check(/buffSelf\(.*'Warrior'\)/.test(run) && /giranGo\('start'\)/.test(run), 'after the switch: board rebuff (fighter scheme), back to the Giran start');
check((SRC.match(/subclassRun\(/g) || []).length === 2, 'subclassRun is only called by the !subclass order');

const cs = cut(SRC, "case '!subclass': {", 'break;\n    }');
check(/if \(!who \|\| who !== Me\.Name\) break;/.test(cs), 'only the named character acts');

// 3) dashboard adena order
const SF = require(path.join(ROOT, 'Dashboard', 'subclass_fund.js'));
const t = Date.now();
const d1 = SF.decide({ name: 'Inspector1', bank: 'Crafter1', amount: 81042600, at: t - 1000, state: 'ask' }, t);
check(d1.send && d1.send.giver === 'Crafter1' && d1.send.receiver === 'Inspector1' && d1.send.amount === 81042600, 'an open ask = one adena order bank -> character', d1);
check(SF.decide({ name: 'Inspector1', bank: 'Crafter1', amount: 81042600, at: t - 1000, state: 'sent' }, t).skip, 'an ask already sent is never sent again');
check(SF.decide({ name: 'Inspector1', bank: 'Crafter1', amount: 81042600, at: t - 30 * 60000, state: 'ask' }, t).skip, 'an old ask is ignored');
check(SF.decide({ name: 'Inspector1', bank: 'Crafter1', amount: 500000000, at: t, state: 'ask' }, t).skip, 'an amount above 200M is refused');
check(SF.decide({ name: 'a b', bank: 'Crafter1', amount: 5, at: t, state: 'ask' }, t).skip, 'a bad name is refused');
const SFS = fs.readFileSync(path.join(ROOT, 'Dashboard', 'subclass_fund.js'), 'utf8');
check(/'\/api\/trade\/order', \{ receiver: d\.send\.receiver, sel: \{\}, adena: \{ \[d\.send\.giver\]: d\.send\.amount \}, confirm: true, sameTown: true/.test(SFS), 'the order is the normal adena trade order (like autofund)');
check(SRV.includes("require('./subclass_fund').tick({ LOGS, post: crafterPagePost })"), 'server.js runs it');

// 4) catalog
const e1 = (CAT.match(/\{ id: 'subclassprobe'[\s\S]*?kw: '[^']*' \}/) || [''])[0], e2 = (CAT.match(/\{ id: 'subclass',[\s\S]*?kw: '[^']*' \}/) || [''])[0];
check(/safety: 'safe'/.test(e1) && /tpl: '!subclass probe \{name\}'/.test(e1), 'catalog: the probe is safe');
check(/safety: 'destructive'/.test(e2) && /tpl: '!subclass \{name\} \{cls\}'/.test(e2) && /targets: \['char'\]/.test(e2), 'catalog: the real run is destructive (needs confirmDanger), one character');

// SUBSPACE-2026-11-04: the live Giran master Vitus writes "Sub Class." (space) - it must be the menu link, never "not offered"
{ const vitus = [{ text: 'Listen to information about second class transfer.', cmd: 'a' }, { text: 'Sub Class.', cmd: 'b' }, { text: 'Clan.', cmd: 'c' }, { text: 'Quest.', cmd: 'd' }];
  const st = P.subclassNpcStep(vitus, 'Berserker'); check(st.act === 'menu' && st.link.cmd === 'b', 'live Vitus page: "Sub Class." (with a space) is the subclass menu');
  check(P.subclassNpcStep([{ text: 'Add a Sub Class.', cmd: 'x' }], 'Berserker').act === 'add', '"Add a Sub Class." (space) is the add link'); }
// SUBCLASSID-2026-11-04: live Vitus "Which subclass do you wish to add?" lists class ids: 127 (Berserker) | 130
{ const list = [{ text: '127', cmd: 'p1' }, { text: '130', cmd: 'p2' }];
  const st = P.subclassNpcStep(list, 'Berserker', 127); check(st.act === 'class' && st.link.cmd === 'p1', 'class list by id: 127 is picked for Berserker, never 130');
  check(P.subclassNpcStep(list, 'Berserker', 128).act === 'stop', 'a wanted id that is not listed = stop, nothing clicked'); }
console.log(`subclass: ${ok} ok, ${bad} failed`);
process.exit(bad ? 1 : 0);
