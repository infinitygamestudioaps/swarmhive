// KITNEVERBLOCK-2026-11-10 guard (academy.md R21; owner: the academy runs 24/7, "manual interference is a no go"): an academy kit buy step
// never ends as 'blocked' because one shop piece was not handed over. Live: Nuker31 acbuy18 blocked since 2026-11-06 (Leather Helmet at Radia),
// Nuker25 acbuyjw blocked 2026-11-10 (Common Item - Elven Necklace at Denkus). Sandbox only (no game, no files written).
'use strict';
const fs = require('fs'), path = require('path');
const R = path.join(__dirname, '../../..'), SRC = fs.readFileSync(path.join(R, 'Scripts_dev', 'swarm.js'), 'utf8');
let ok = 0, bad = 0; const check = (c, m) => { if (c) { ok++; console.log('ok   ' + m); } else { bad++; console.log('FAIL ' + m); } };
const cut = (a, b) => { const i = SRC.indexOf(a); return i < 0 ? '' : SRC.slice(i, SRC.indexOf(b, i)); };

const pure = cut('// ACADKIT-PURE-BEGIN', '// ACADKIT-PURE-END');
check(pure.length > 0, 'ACADKIT pure part (acadKitRetry, acadKitOutcome) exists');
const P = new Function(pure + '\nreturn { ACADKIT_TRIES, ACADKIT_LATER_MS, acadKitRetry, acadKitOutcome, acadKitAfford, acadKitWearOk, acadKitPendingSet, acadKitRetryDue };')();

// 1) retries: the live failure ("the shop did not hand it over") is tried again with a pause, the next merchant on the 2nd try
const r1 = P.acadKitRetry({ tries: 1, why: "NOT bought at Radia (the shop did not hand it over)", offers: 2 });
check(r1.again && r1.pauseMs >= 3000 && r1.offer === 1, 'try 1 not handed over -> again after a pause, at the other merchant (Radia -> Peta)');
const r2 = P.acadKitRetry({ tries: 2, why: 'moved away from Denkus (580) before the buy', offers: 1 });
check(r2.again && r2.pauseMs > r1.pauseMs && r2.offer === 0, 'try 2 (moved away) -> again after a longer pause, the only merchant');
check(!P.acadKitRetry({ tries: P.ACADKIT_TRIES, why: 'the shop did not hand it over', offers: 2 }).again && P.ACADKIT_TRIES === 3, 'after 3 tries: no more tries');
check(!P.acadKitRetry({ tries: 1, why: 'not enough adena (6431 with tax, I have 0)', offers: 2 }).again, 'not enough adena: no pointless retry');

// 2) the outcome: never a fail; a missing piece is skipped with its reason and the plan goes on
const done = P.acadKitOutcome('level18', [], 'Tunic of Devotion: bought for 18018 adena');
check(done.ok && !done.skipped && done.state === 'leveling', 'all pieces there -> ok, leveling');
const sk = P.acadKitOutcome('level18', [{ name: 'Leather Helmet', why: 'NOT bought at Radia (the shop did not hand it over)' }], "Tunic of Devotion: bought; Magnus' Chant: still 2.7 h left — not bought");
check(sk.ok === true && sk.skipped === true && !sk.fail, 'Nuker31 case: Leather Helmet missing -> ok + skipped (never fail / blocked)');
check(/skipped Leather Helmet \(NOT bought at Radia/.test(sk.result) && /plan goes on/.test(sk.result) && sk.state === 'leveling' && sk.state !== 'blocked', 'the skip is shown with its reason, state leveling');
check(!/Magnus/.test(sk.text), "Magnus' Chant (a buff timer) is never named as missing");

// 3) acadBuy itself: no 'blocked' state and no fail for missing pieces any more; the retries and the hold are wired in
const buy = cut('async function acadBuy(step) {', '\nasync function acadGraduate');
check(buy.length > 0, 'acadBuy found');
check(!/acadState\('blocked'/.test(buy) && !/fail: `still missing/.test(buy), 'acadBuy never sets blocked / never fails with "still missing"');
check(/acadKitOutcome\(set, miss\.map/.test(buy) && /skipped: !!out\.skipped/.test(buy), 'acadBuy answers through acadKitOutcome (skipped flag -> plan shows the cross + why)');
check((buy.match(/acadKitRetry\(\{ tries: t/g) || []).length === 2, 'both buy paths (merchant + Helvetia shots) retry with acadKitRetry');
check(/const offers = \[\]; ids\.forEach/.test(buy), 'every recorded merchant that sells the piece is a retry candidate');
const tryFn = cut('async function acadKitTry(', '\nasync function acadBuy');
check(/await acadKitHold\(\)/.test(tryFn) && /Distance\(npc\) > 250/.test(tryFn), 'each try waits for my own team walk and checks I still stand at the merchant');
check(/leadRunBusy \|\| regroupRun/.test(cut('async function acadKitHold(', '\n}\n')), "the hold waits for the leader's team walk / regroup (max 45 s)");

// 4) the old blocked steps (Nuker31, Nuker25) go on by themselves after the deploy
const ub = cut('function planKitUnblockDecide(o)', '\n}\n') + '\n}\n';
const D = new Function(ub + '\nreturn planKitUnblockDecide;')();
const base = { on: true, running: false, planOn: true, status: 'blocked', kind: 'academy', act: 'buy', why: 'still missing: Leather Helmet — ...', lastTry: 0, nowMs: 1e12 };
check(D(base) === true, 'Nuker31: blocked "still missing" academy buy step + party ON -> runs again by itself');
check(!D(Object.assign({}, base, { on: false })) && !D(Object.assign({}, base, { act: 'join' })) && !D(Object.assign({}, base, { why: 'no Academy invite from X in 30 min' })), 'only a kit step, only while the party is ON');
check(!D(Object.assign({}, base, { lastTry: 1e12 - 60000 })), 'at most once per 10 min');
check(/planKitUnblockDecide\(\{ on: runOn\(\)/.test(SRC) && /setLeadPaused\(false\);\s*note\(`plan: the academy kit step/.test(SRC), 'the unblock clears the lead pause and restarts the plan');

// 5) KITWHOLE (owner 2026-11-10): the whole kit must be affordable, else nothing is bought, the step is skipped and the kit is tried again later
const kit = [{ name: 'Tunic of Devotion', cost: 21622 }, { name: 'Stockings of Devotion', cost: 13541 }, { name: 'Leather Helmet', cost: 10839 }];
const af = P.acadKitAfford(30000, kit);
check(!af.ok && af.total === 46002 && af.short === 16002, "can't afford the whole level18 kit (30,000 of 46,002) -> not ok");
check(P.acadKitAfford(46002, kit).ok, 'exactly enough -> ok');
const ao = P.acadKitOutcome('level18', [], '', { adena: { total: af.total, have: 30000 } });
check(ao.ok && ao.skipped && ao.pending === 'adena' && /nothing bought/.test(ao.result) && /tried again/.test(ao.text), 'not enough adena -> nothing bought, step skipped (plan goes on), tried again later');
const buy2 = cut('async function acadBuy(step) {', '\nasync function acadGraduate');
const affAt = buy2.indexOf('acadKitAfford('), firstBuy = buy2.indexOf('acadKitTry(row');
check(affAt > 0 && firstBuy > affAt && /if \(!af\.ok\) \{[\s\S]{0,400}acadKitPendSave\(set, \{ kind: 'adena'[\s\S]{0,300}return \{ ok: true, skipped: true/.test(buy2), 'acadBuy checks the whole kit BEFORE any buy and returns skipped + pending (adena)');
let pend = P.acadKitPendingSet({}, 'level18', { kind: 'adena', why: 'not enough', need: 46002 }, 1e12);
const base2 = { academy: true, inGiran: true, idle: true, pend, adena: 30000, lastTry: 0, nowMs: 1e12 };
check(P.acadKitRetryDue(base2) === '', 'an adena kit is not tried again while the adena is still short');
check(P.acadKitRetryDue(Object.assign({}, base2, { adena: 50000 })) === 'level18', '... and is tried again on a Giran visit once the adena is there (not once-and-forget)');
check(P.acadKitRetryDue(Object.assign({}, base2, { adena: 50000, inGiran: false })) === '' && P.acadKitRetryDue(Object.assign({}, base2, { adena: 50000, idle: false })) === '', 'only idle in Giran');
check(P.acadKitRetryDue(Object.assign({}, base2, { adena: 50000, lastTry: 1e12 - 60000 })) === '' && P.ACADKIT_LATER_MS === 600000, 'at most every 10 min');

// 6) whole set or nothing: a partial kit (helmet missing) wears nothing; complete = wear all
const rows18 = [{ name: 'Tunic of Devotion', equip: true }, { name: 'Stockings of Devotion', equip: true }, { name: 'Leather Helmet', equip: true }];
check(!P.acadKitWearOk([rows18[2]]), 'helmet missing -> nothing of the kit is worn (old gear stays on)');
check(P.acadKitWearOk([]) && P.acadKitWearOk([{ name: 'Blessed Spiritshot (D-Grade)', shots: true }]), 'complete (or only shots missing) -> every piece is worn');
const po = P.acadKitOutcome('level18', [{ name: 'Leather Helmet', why: 'NOT bought at Radia' }], 'Tunic of Devotion: bought');
check(po.pending === 'missing' && /nothing new worn/.test(po.result) && /old gear stays on/.test(po.text), 'partial kit -> skipped, nothing new worn, tried again later');
pend = P.acadKitPendingSet({}, 'level18', { kind: 'missing', why: 'Leather Helmet', need: 10839 }, 1e12);
check(P.acadKitRetryDue({ academy: true, inGiran: true, idle: true, pend, adena: 0, lastTry: 0, nowMs: 1e12 }) === 'level18', 'a missing-piece kit is tried again on the next idle Giran visit');
check(!Object.keys(P.acadKitPendingSet(pend, 'level18', null, 1e12).sets).length, 'complete later -> the pending entry is removed');
check(/woreKit = acadKitWearOk\(miss\)/.test(buy2) && /for \(const row of \(woreKit \? list : \[\]\)\.filter\(r => r\.equip\)\)/.test(buy2), 'acadBuy wears ONLY when the whole kit is there (equip-on-complete)');
check(/acadKitPendSave\(set, \{ kind: 'missing'/.test(buy2) && /else acadKitPendSave\(set, null\)/.test(buy2), 'acadBuy keeps a partial kit pending and clears it when complete');
// the later retry tick + the bought pieces are kept (never sold / stored / handed over while waiting)
check(/acadKitRetryDue\(\{ academy: true, inGiran: currentTownKey\(\) === 'Giran', idle/.test(SRC) && /acadBuy\(\{ set, bg: true \}\)/.test(SRC), 'a pending kit is retried by itself on a later idle Giran visit');
check(/!only && typeof acadKitProtected === 'function' && acadKitProtected\(id\)\) return;/.test(SRC), 'sellAt never sells a waiting kit piece (automatic sales)');
check(/acadKitProtected\(r\.id\)/.test(cut('function acadUnloadRows(', '\n')) && /acadKitProtected\(id\)\) return K\('academy kit piece/.test(SRC), 'the bag unload / stash keep waiting kit pieces');
console.log(`acad kit retry: ${ok} ok, ${bad} failed`); process.exit(bad ? 1 : 0);
