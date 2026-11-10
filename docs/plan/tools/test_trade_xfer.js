// OFFLINE guard test for the public tester reports #16-#19 (Discord 2026-11-10, Hive 1.14.0 / L2Swarm 3.11.5). Never talks to the game.
//   node docs/plan/tools/test_trade_xfer.js        (exit code 1 when a check fails)
// #16 (Vykaax) TRADEBATCH: 40 kinds per trade window (was 8 / 10), the receiver waits for a filling window, failed rows are retried in FULL windows
//     before one by one. GEARONE: the gear-up picks the fewest givers (one giver = one hand-over). GEARQUEUE: a busy distributor queues the next
//     bot's pieces instead of refusing. XFER: L2Swarm 3.11.3+ TransferItems (hidden trade) when the host has it - feature-detected, within reach
//     first (trade.md R2), a single piece only when it is the only one of its id (never a different / plused piece), normal trade otherwise / on
//     older hosts (this PC: 3.10.10).
// #17 (Vykaax + LuckyStrikz) NOTRADE2: the Tutorial Guide is never offered; refused-to-add rows are not retried. JUNKDEL: destroying it is a
//     setting that is OFF without Scripts/data/destroy_junk.json { on: true } (owner decision).
// #18 (Vykaax) AMMOGIVE: a worn arrow / bolt stack comes off for the trade (the rest goes, the share stays) and goes back on; bolts = arrows.
// #19 (LuckyStrikz + Vykaax) SUP76: Einhasad's Holy Water / Battle Symbol / Magic Symbol in the supply table for characters whose skills eat
//     them; Spirit Ore built-in 1000 (was 300).
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const src = fs.readFileSync(process.env.SWARM_JS || path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
let pass = 0, fails = 0;
const check = (c, m, extra) => { if (c) { pass++; console.log('ok   ' + m); } else { fails++; console.log('FAIL ' + m + (extra ? ' — ' + extra : '')); } };
const blk = (b, e) => { const i = src.indexOf(b), j = src.indexOf(e, i); if (i < 0 || j < i) { console.error(b + ' block not found'); process.exit(1); } return src.slice(i, j); };
const fn = (name) => { const i = src.indexOf('function ' + name + '('); if (i < 0) throw new Error('missing ' + name); let d = 0, j = src.indexOf('{', i); for (; j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}' && --d === 0) break; } return src.slice(i, j + 1); };
const between = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i + 1); return i >= 0 && j > i ? src.slice(i, j) : ''; };

const X = new Function(blk('// XFER-PURE-BEGIN', '// XFER-PURE-END') + '\nreturn { XFER, xferSplit, xferArgs, tradeFillMs, ammoIdSet, ammoTakeOff };')();
const J = new Function(blk('// JUNKDEL-PURE-BEGIN', '// JUNKDEL-PURE-END') + '\nreturn { junkDelCfg, junkDelPick, JUNKDEL_DEFAULT_IDS };')();
const H = new Function(blk('// HANDOVER-PURE-BEGIN', '// HANDOVER-PURE-END') + '\nreturn { HOV_CFG, hovBatches, hovRetryWindows, hovResolve, NEWBIE_NOTRADE, hovNtCounts };')();
const TL = require(path.join(ROOT, 'Dashboard', 'tradelogic.js'));

// ---- #16 TRADEBATCH ----------------------------------------------------------------------------------------------------------
check(H.HOV_CFG.batch === 40 && TL.LIMITS.batch === 40, 'one trade window carries 40 kinds (swarm.js HOV_CFG = dashboard tradelogic; was 8)');
check(/unload: \{ above: 150, perTrade: 40 \}/.test(src), 'the leader unload trades 40 kinds per window (was 10)');
const rows45 = Array.from({ length: 45 }, (_, i) => ({ objId: i + 1, id: 100 + i, name: 'x' + i, count: 1 })).concat([{ adena: true, id: 57, count: 5, name: '5 adena' }]);
check(JSON.stringify(H.hovBatches(rows45, H.HOV_CFG.batch).map(b => b.length)) === '[40,6]', '45 kinds + adena = 2 trade windows (was 6)');
check(X.tradeFillMs(40) === 24000 && X.tradeFillMs(0) === 0 && X.tradeFillMs(500) === 60000, 'the receiver waits 0.6 s per item for the window to fill (max 60 s)');
{ const rv = fn('receiveItems');
  check(/waitTrade\('done', T \* 2 \+ tradeFillMs\(nItems\)\)/.test(rv), 'receiveItems waits for a full window (never cancels one that is still filling)'); }
check(/swarm\.handover\.take', \{ id: o\.id, giver: Me\.Name, to: o\.receiver, what: tradeWhat\(items\), n: items\.length \}/.test(src) && /receiveItems\(\{ giver: d\.giver, what: d\.what \|\| '', step: 'handover', n: num\(d\.n\) \}\)/.test(src), 'the hand-over tells the receiver how many items the window gets');
check(JSON.stringify(H.hovRetryWindows(rows45.slice(0, 12), 40).map(b => b.length)) === '[12]' && H.hovRetryWindows([{ count: 0 }], 40).length === 0, 'failed rows are retried in ONE full window (not 12 single trades)');
{ const hg = fn('hovGive');
  check(/for \(const b of hovRetryWindows\(retry, o\.batch \|\| HOV_CFG\.batch\)\)/.test(hg) && /book\(r\.moved, r\.why, r\.na, singles\)/.test(hg) && /for \(const row of singles\)/.test(hg), 'hovGive: retry windows first, only their failures go one by one'); }

// ---- #16 GEARONE / GEARQUEUE ---------------------------------------------------------------------------------------------------
const num = (v) => Number(v) || 0;
const G = new Function('num', fn('gdBestOffer') + '\n' + fn('gdPickOffers') + '\nreturn { gdBestOffer, gdPickOffers };')(num);
{ // Vykaax: 5 jewels + 5 armor + 2 weapons, one distributor holds all 12; another character / the clan warehouse offer some too
  const asks = Array.from({ length: 12 }, (_, i) => ({ rid: 'r' + i, offers: [{ by: 'Distri', src: 'dist', id: i }].concat(i < 3 ? [{ by: 'Clan', src: 'clan', id: i }] : []).concat(i % 2 ? [{ by: 'Spare', src: 'bag', id: i }] : []) }));
  const pk = G.gdPickOffers(asks), givers = new Set(Object.values(pk).map(o => o.by));
  check(Object.keys(pk).length === 12 && givers.size === 1 && givers.has('Distri'), '12 pieces, one distributor holds all: 1 giver = 1 hand-over', [...givers].join());
  const a2 = [{ rid: 'a', offers: [{ by: 'D1', src: 'dist' }, { by: 'D2', src: 'dist' }] }, { rid: 'b', offers: [{ by: 'D2', src: 'dist' }] }, { rid: 'c', offers: [{ by: 'D2', src: 'dist' }, { by: 'D1', src: 'dist' }] }];
  const p2 = G.gdPickOffers(a2);
  check(p2.a.by === 'D2' && p2.b.by === 'D2' && p2.c.by === 'D2', 'pieces spread over two distributors go to the one that covers the most (fewest trades)');
  const a3 = [{ rid: 'u', offers: [{ by: 'D1', src: 'dist', sealed: true }, { by: 'D2', src: 'dist' }] }, { rid: 's', offers: [{ by: 'D1', src: 'dist', sealed: true }] }, { rid: 'n', offers: [] }];
  const p3 = G.gdPickOffers(a3);
  check(p3.u.by === 'D2' && !p3.u.sealed && p3.s.by === 'D1' && p3.s.sealed && !p3.n, 'unsealed offers first; a piece offered only sealed still comes; no offer = bought');
  check(/const pk = gdPickOffers\(asks\.map\(a => \(\{ rid: a\.rid, offers: GD\.offers\[a\.rid\] \|\| \[\] \}\)\)\)/.test(fn('gearOwnedFirst')), 'the gear-up uses the fewest-givers pick'); }
{ const dm = fn('gdDeliverMany');
  check(/await gdWaitHov\(to\);\s*try \{ App\.emit\('swarm\.hovcall'/.test(dm) && /while \(HOV\.busy && now\(\) - t0 < 4 \* 60000\)/.test(fn('gdWaitHov')), 'a distributor busy with one bot queues the next bot\'s pieces (max 4 min, inside the asker\'s wait) instead of refusing'); }

// ---- #16 XFER (hidden trade) --------------------------------------------------------------------------------------------------
{ const bag = [
    { objId: 1, id: 881, name: 'Ring', count: 1 }, { objId: 2, id: 881, name: 'Ring', count: 1 },             // two of the same ring
    { objId: 3, id: 2384, name: 'Zubei Breastplate', count: 1 },                                           // the only one
    { objId: 4, id: 2385, name: 'Zubei Gaiters', count: 1, enchant: 3 },                                     // plused
    { objId: 5, id: 1835, name: 'Soulshot', count: 5000, stackable: true },
    { objId: 6, id: 57, name: 'Adena', count: 900000 },
    { objId: 7, id: 1341, name: 'Bone Arrow', count: 8000, equipped: true },
    { objId: 8, id: 2386, name: 'Zubei Gauntlet', count: 1 }, { objId: 9, id: 2386, name: 'Zubei Gauntlet', count: 1, enchant: 5 } ];
  const rows = [{ objId: 1, id: 881, count: 1 }, { objId: 3, id: 2384, count: 1 }, { objId: 4, id: 2385, count: 1 }, { objId: 5, id: 1835, count: 2000, stack: true },
    { adena: true, objId: 6, count: 50000 }, { objId: 7, id: 1341, count: 3000, stack: true }, { objId: 8, id: 2386, count: 1 }];
  const sp = X.xferSplit(rows, bag), xo = sp.xfer.map(r => r.objId).sort().join(), to = sp.trade.map(r => r.objId).sort().join();
  check(xo === '3,5,6', 'hidden trade carries: the only piece of its id, stacks, adena', xo);
  check(to === '1,4,7,8', 'normal trade window keeps: a ring with a twin, a plused piece, a worn stack, a piece whose twin is plused (the API picks by item id)', to);
  check(JSON.stringify(X.xferArgs(sp.xfer)) === JSON.stringify([{ itemId: 2384, count: 1 }, { itemId: 1835, count: 2000 }, { itemId: 57, count: 50000 }]), 'TransferItems gets [{ itemId, count }] (adena = 57)');
  const both = X.xferSplit([{ objId: 1, id: 881, count: 1 }, { objId: 2, id: 881, count: 1 }], bag);
  check(both.xfer.length === 0, 'two pieces of one id are never sent by item id (exact pieces go through the window)'); }
{ const xh = fn('xferHost'), xg = fn('xferGive'), gi = fn('giveItems');
  check(/typeof TransferItems !== 'undefined' && TransferItems/.test(xh) && /if \(!XFER\.on \|\| now\(\) < XFER\.badUntil\) return null/.test(xh), 'feature-detected: no TransferItems (L2Swarm 3.10.10) = normal trade');
  const env = { XFER: { on: true, badUntil: 0 }, now: () => 1 };
  const xhRun = new Function('env', 'with (env) { ' + xh + '; return xferHost(); }');
  check(xhRun(env) === null, 'an old host without TransferItems: xferHost() = null (falls back)');
  check(typeof xhRun(Object.assign({}, env, { TransferItems: () => true })) === 'function', 'a 3.11.3+ host with TransferItems: used');
  check(/const reach = await tradeApproach\(/.test(between('if (xferHost()) {', 'System message 142')) && /reach\.ok \? await xferGive\(/.test(gi), 'hidden trade only after tradeApproach says within reach (trade.md R2: never through a wall)');
  check(/if \(!movedAny\(\)\) \{\s*try \{ r = fn\(String\(d\.receiver\), args\); how = 'name'; \}/.test(xg), 'a refused call is tried once by name, never a second call after something moved (no double give)');
  check(/d\.items = xr\.left; chk = d\.items;/.test(gi) && /xferAll = true; endOk = true;/.test(gi), 'what the transfer did not move goes through the trade window; all moved = done without a window');
  check(/'swarm\.trade\.end', \{ giver: Me\.Name, tok, ok: endOk, xfer: xferAll \}/.test(gi) && /if \(d\.xfer && d\.ok && d\.giver\)/.test(src) && /XFER\.doneFrom\[String\(d\.giver\)\]/.test(fn('receiveItems')), 'the receiver\'s waiting session ends when the giver moved everything hidden'); }

// ---- #17 NOTRADE2 / JUNKDEL ---------------------------------------------------------------------------------------------------
{ const NT = new Set(H.NEWBIE_NOTRADE);
  const r = H.hovResolve([{ objId: 11, id: 5588, name: 'Tutorial Guide', count: 1 }, { objId: 12, id: 1869, name: 'Iron Ore', count: 50, stack: true }],
    0, [{ objId: 11, id: 5588, name: 'Tutorial Guide', count: 1 }, { objId: 12, id: 1869, name: 'Iron Ore', count: 50, stackable: true }], NT);
  check(r.give.length === 1 && r.give[0].id === 1869 && r.skip.some(s => s.name === 'Tutorial Guide' && /does not allow/.test(s.why)), 'the Tutorial Guide is never put into a hand-over; the rest goes');
  check(!H.hovNtCounts({ n: 3 }) && H.hovNtCounts({ na: 2 }), "learned untradeable only from 2 refusals to ADD (the 'n' rule that blocked Iron Ore / Steel is gone)"); }
check(J.junkDelPick(null, [{ objId: 1, id: 5588 }]).length === 0 && J.junkDelPick({}, [{ objId: 1, id: 5588 }]).length === 0 && J.junkDelPick({ on: 'yes' }, [{ objId: 1, id: 5588 }]).length === 0, 'destroy junk is OFF by default (no file / not exactly on: true)');
{ const bag = [{ objId: 1, id: 5588, name: 'Tutorial Guide', count: 1 }, { objId: 2, id: 1869, count: 9 }, { objId: 3, id: 5588, equipped: true }, { objId: 4, id: 5588, enchant: 1 }, { objId: 5, id: 5588, quest: true }];
  const p = J.junkDelPick({ on: true }, bag);
  check(p.length === 1 && p[0].objId === 1, 'ON: only the listed newbie item (default Tutorial Guide), never worn / plused / quest / anything else');
  check(J.junkDelPick({ on: true, ids: [57, 1869] }, bag).map(b => b.objId).join() === '2', 'ON with own ids: those only, never adena'); }
{ const OF = path.join(ROOT, 'Scripts', 'data', 'destroy_junk.json');   // owner 2026-11-10: "YES" -> the coordinator wrote { "on": true, "_note": ... }
  if (fs.existsSync(OF)) { const oj = JSON.parse(fs.readFileSync(OF, 'utf8').replace(/^﻿/, ''));
    const p = J.junkDelPick(oj, [{ objId: 1, id: 5588, name: 'Tutorial Guide', count: 1 }, { objId: 2, id: 1869, count: 3 }]);
    check(oj.on === true ? p.length === 1 && p[0].id === 5588 : p.length === 0, `the owner's destroy_junk.json (${oj.on === true ? 'ON' : 'off'}) is read in exactly this shape: ${oj.on === true ? 'the Tutorial Guide only' : 'nothing'}`); }
  else check(true, 'no destroy_junk.json on this install: OFF'); }
{ const loop = between('var JUNKDEL =', '/** the host\'s hidden trade');
  check(/if \(!File\.Exists\(f\)\) return;\s*\/\/ missing file = OFF/.test(loop) && /const rows = junkDelPick\(cfg, hovBag\(\)\)/.test(loop) && /tradeState \|\| IsInCombat/.test(loop), 'the destroy loop runs only with the owner\'s file, through junkDelPick, never mid trade / fight'); }

// ---- #18 AMMOGIVE -------------------------------------------------------------------------------------------------------------
{ const ow = between('const OWNTYPE = {', '/** plain words for a weapon');
  const OWNTYPE = new Function(ow.replace(/^const OWNTYPE =/, 'return') )();
  const ids = X.ammoIdSet(OWNTYPE.ammo);
  check([17, 1341, 1342, 1343, 1344, 1345, 9632, 9633, 9634, 9635, 9636, 9637].every(i => ids.has(i)), 'every arrow AND Kamael crossbow bolt counts as ammo');
  const ammoFor = new Function('OWNTYPE', fn('ammoFor') + '; return ammoFor;')(OWNTYPE);
  check(ammoFor({ t: 'CROSSBOW', g: 'C' }).id === 9634 && ammoFor({ t: 'BOW', g: 'C' }).id === 1342, 'bolts are grade-matched for crossbows exactly like arrows for bows (same supply amount "arrows")');
  const bag = [{ objId: 7, id: 1342, count: 9000, equipped: true }, { objId: 8, id: 1835, count: 100 }];
  check(X.ammoTakeOff([{ objId: 7, id: 1342, count: 4000, stack: true }], bag, ids) === 7 && X.ammoTakeOff([{ objId: 8, id: 1835, count: 1, stack: true }], bag, ids) === 0, 'the leader\'s worn arrows in the hand-out list come off for the trade; nothing else is touched');
  const gi = fn('giveItems');
  check(/ammoBack = ammoTakeOff\(d\.items, hovBag\(\), ammoIdSet\(OWNTYPE\.ammo\)\)/.test(gi) && /Send\.SendHex\('16' \+ cryLe\(0x100, 4\)\)/.test(gi) && /Send\.UseItem\(ammoBack\)/.test(gi), 'giveItems: worn ammo off (L_HAND) before the trade, the rest back on afterwards');
  check(/am && am\.id === n\.id \? \(CONFIG\.lead\.supply\.arrowsBelow \|\| 1500\) : 0/.test(src), 'the leader keeps his own share of the ammo when he hands it out'); }

// ---- #19 SUP76 --------------------------------------------------------------------------------------------------------------
{ const API = require(path.join(ROOT, 'Dashboard', 'partyauto_api.js'));
  const keys = blk('const PAUTO_AMT_KEYS = ', ';').replace('const PAUTO_AMT_KEYS = ', '');
  check(['holy', 'bsym', 'msym'].every(k => keys.includes(`'${k}'`)), 'supply table knows Holy Water / Battle Symbols / Magic Symbols (swarm.js)');
  const inf = API.info({ DATA: ROOT, LOGS: ROOT, ROOT, readJson: () => null, readStates: () => ({}), teamMap: () => ({}), mainLeader: 'x' });
  const ks = inf.amounts.keys.map(k => k.key);
  check(['holy', 'bsym', 'msym'].every(k => ks.includes(k)) && inf.amounts.builtin.ore === 2500 && inf.amounts.suggest[76].ore >= 2000 && inf.amounts.suggest[76].ore <= 3000 && inf.amounts.suggest[76].holy > 0, 'party settings Supplies show them; Spirit Ore standard 2500 (owner 2026-11-10 "could be 2000-3000"), suggested 2000-3000 at 76+');
  check(Object.keys(inf.amounts.suggest).every(b => inf.amounts.suggest[b].bsym === 0 && inf.amounts.suggest[b].msym === 0) && inf.amounts.builtin.bsym === 0 && inf.amounts.builtin.msym === 0, 'owner 2026-11-10 ("symbols are drops, NOT without explicit decision"): standard and every suggested symbol amount = 0');
  check(/oreUsers: 2500,/.test(src) && /holyWater: 100, symbols: 0,/.test(src) && /bsym: 0, msym: 0 \}/.test(fn('supplyAmounts')), 'swarm.js built-in: Spirit Ore 2500, Holy Water 100, symbols 0');
  check(/key: 'holy', id: 8874, name: "Einhasad's Holy Water", src: 'grocer'/.test(src) && /msym', id: 8876, name: 'Magic Symbol', explicitOnly: true/.test(src) && /bsym', id: 8875, name: 'Battle Symbol', explicitOnly: true/.test(src), 'Holy Water is a grocer item (owner: "sold in the general store"); symbols only on an explicit amount');
  // supplyWants on stubs: a Cardinal whose Mass skill eats Holy Water, a Doomcryer whose skill eats Magic Symbols
  const sw = fn('supplyWants'), st = between('const SUP76_ITEMS = ', '\n'), si = fn('supItemSkills');
  const run = (skills, A) => new Function('env', 'with (env) { ' + st + '\n' + si + '\n' + sw + '\n return supplyWants(); }')({
    num, CONFIG: { lead: { supply: { shotsBelow: 2000, arrowsBelow: 1500, manaPotionsBelow: 500 } } }, supplyAmounts: () => Object.assign({ soe: 5, sor: 3, soulshots: 1, spiritshots: 1, mana: 1, healing: 1, ore: 1000, arrows: 0, holy: 100, bsym: 100, msym: 100, src: {} }, A || {}),
    shotId: () => 0, shotKind: () => 'mage', weaponGrade: () => 'S', PSHOP_ALT: {}, myAmmo: () => null, OWNTYPE: { helvetia: [] }, teamNames: () => ['L'], oreSkills: () => [],
    deathPenaltyLevel: () => 0, recoveryScroll: () => ({ id: 8599, name: 'Scroll: Recovery (Grade S)' }), state: { role: 'bishop' }, lhScaleWants: undefined,
    SkillsList: { forEach: (f) => skills.forEach(f) } });
  const w1 = run([{ Id: 1, Name: 'Mass Something', ItemConsumeId: 8874, IsActive: true }]);
  const h = w1.find(w => w.id === 8874);
  check(h && h.want === 100 && !w1.some(w => w.id === 8875 || w.id === 8876), 'a character whose skill eats Einhasad\'s Holy Water carries 100 of it (and no symbols)', JSON.stringify(h));
  check(/\(grocer\)/.test(h ? h.why : ''), 'the Holy Water want says it is bought at the grocer', h && h.why);
  const symSkills = [{ Id: 2, Name: 'Chant X', ItemConsumeId: 8876, IsActive: true }, { Id: 4, Name: 'Mass Y', ItemConsumeId: 8875, IsActive: true }];
  check(!run(symSkills).some(w => w.id === 8875 || w.id === 8876), 'symbols are never requested by themselves, even when a skill eats them and a built-in amount exists (owner: drops)');
  check(!run(symSkills, { msym: 250, bsym: 250, src: { msym: 'builtin', bsym: 'builtin' } }).some(w => w.id === 8875 || w.id === 8876), 'a built-in symbol amount never counts');
  const w2 = run([{ Id: 2, Name: 'Chant X', ItemConsumeId: 8876, IsActive: true }, { Id: 3, Name: 'Passive', ItemConsumeId: 8875, IsActive: false }], { msym: 250, bsym: 250, src: { msym: 'party', bsym: 'party' } });
  check((w2.find(w => w.id === 8876) || {}).want === 250 && !w2.some(w => w.id === 8875 || w.id === 8874), 'Magic Symbols only when the owner SET an amount in the party table; a passive skill never counts');
  const w3 = run(symSkills, { bsym: 40, src: { bsym: 'default' } });
  check((w3.find(w => w.id === 8875) || {}).want === 40 && !w3.some(w => w.id === 8876), 'an amount set for all parties counts too (Battle Symbols 40), the unset one does not');
  check(!run([]).some(w => [8874, 8875, 8876].includes(w.id)), 'a character without such a skill buys none of them'); }

console.log(`trade xfer / testers 16-19: ${pass} ok, ${fails} failed`);
process.exit(fails ? 1 : 0);
