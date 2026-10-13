// OFFLINE TEST of the CLAN LEVEL ITEM HAND-OVER + the one clan level (CLANHAND, user 2026-10-13: "Some of the clan members have the required
// item to level up the clan, they should automatically trade it to the leader."). Never talks to the game, the MCP server or the dashboard:
//   node docs/plan/tools/test_clan_handover.js        (exit code 1 when a check fails)
// 1) Scripts_dev/swarm.js CLANHAND-PURE: clanHandNeeds (clan_data.json levels), clanHandDecide (who gives what, when it may run: same town,
//    solo + idle, the clan leader comes, busy rules, offline / stale, back-off after a failure, manual "Hand it over now", untradeable items).
// 2) HANDOVER-PURE hovResolve: a protected (quest) item is skipped, unless THIS order allows its id; untradeable stays refused.
// 3) Dashboard/clanauto_api.js in a sandbox: fixNextLevel (the "level 0 -> 1" report of Me.Clan.Level 0 rebuilt at the real level),
//    clanItemPlan / itemHandText, status() (one level everywhere, the hand-over row + button, Needs you only when OFF / failed), POST handover.
// 4) Source checks (swarm.js hooks, catalog entry, no browser dialogs) + syntax (node --check, the inline scripts of Dashboard/index.html).
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const ROOT = path.join(__dirname, '..', '..', '..');
const SW = path.join(ROOT, 'Scripts_dev', 'swarm.js');
const src = fs.readFileSync(SW, 'utf8');
let fails = 0, n = 0;
const check = (ok, what) => { n++; console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails++; };
const blk = (b, e) => { const i = src.indexOf(b), j = src.indexOf(e, i); if (i < 0 || j < i) { console.error(b + ' block not found'); process.exit(1); } return src.slice(i, j); };

// ---- 1) CLANHAND-PURE ----------------------------------------------------------------------------------------------------------------
const P = new Function(blk('// CLANHAND-PURE-BEGIN', '// CLANHAND-PURE-END') + '\nreturn { CLANHAND_CFG, clanHandNeeds, clanHandDecide };')();
const CD = JSON.parse(fs.readFileSync(path.join(ROOT, 'Scripts', 'data', 'clan_data.json'), 'utf8').replace(/^﻿/, ''));
const NT = new Set(JSON.parse(fs.readFileSync(path.join(ROOT, 'Scripts', 'data', 'trade_items.json'), 'utf8').replace(/^﻿/, '')).notrade.map(Number));
check(P.clanHandNeeds(CD.levels, 0).length === 0 && P.clanHandNeeds(CD.levels, 1).length === 0, 'levels 1 and 2 need no item');
const need2 = P.clanHandNeeds(CD.levels, 2);
check(need2.length === 1 && need2[0].id === 1419 && need2[0].need === 1 && need2[0].name === 'Blood Mark', 'clan level 2 -> 3 needs 1 Blood Mark (1419)');
check(P.clanHandNeeds(CD.levels, 3)[0].id === 3874 && P.clanHandNeeds(CD.levels, 4)[0].id === 3870, 'level 4 = Alliance Manifesto 3874, level 5 = Seal of Aspiration 3870');
check(!NT.has(1419), 'trade_items.json: Blood Mark is tradeable');
const T0 = Date.parse('2026-10-13T10:00:00Z');
const base = (o) => Object.assign({
  me: { name: 'Destroyer1', town: 'Giran', busy: '', idle: false }, leader: 'Dagger1', clvl: 2, needs: need2, leaderHas: {},
  recv: { name: 'Dagger1', town: 'Giran', dead: false, busy: '', order: '', quest: '', solo: true, idle: false },
  bag: [{ id: 1419, objId: 777, name: 'Blood Mark', count: 3, equipped: false, stackable: true }], notrade: NT, manual: false, solo: false, last: null, lastCall: 0, now: T0 }, o || {});
let d = P.clanHandDecide(base());
check(d.act === 'give' && d.items.length === 1 && d.items[0].objId === 777 && d.items[0].count === 1 && d.items[0].stack === true && d.text === '1 × Blood Mark', 'both in Giran -> give ONE Blood Mark (only what is still needed): ' + JSON.stringify(d));
check(P.clanHandDecide(base({ leaderHas: { 1419: 1 } })).act === 'none', 'the clan leader already has it -> nothing');
check(P.clanHandDecide(base({ me: { name: 'Dagger1', town: 'Giran' } })).act === 'none', 'the clan leader never gives to himself');
check(P.clanHandDecide(base({ bag: [] })).act === 'none', 'no item in my bag -> nothing');
check(P.clanHandDecide(base({ needs: [] })).act === 'none', 'next level needs no item -> nothing');
check(P.clanHandDecide(base({ bag: [{ id: 1419, objId: 5, name: 'Blood Mark', count: 1, equipped: true }] })).act === 'none', 'an equipped piece is never given');
const two = P.clanHandDecide(base({ needs: [{ id: 1419, name: 'Blood Mark', need: 2 }], bag: [{ id: 1419, objId: 1, count: 1 }, { id: 1419, objId: 2, count: 1 }] }));
check(two.act === 'give' && two.items.length === 2 && two.items.every(i => i.count === 1 && !i.stack) && two.text === '2 × Blood Mark', 'need 2, two single pieces -> both, by objId');
const blocked = P.clanHandDecide(base({ needs: P.clanHandNeeds(CD.levels, 3), clvl: 3, bag: [{ id: 3874, objId: 9, name: 'Alliance Manifesto', count: 1 }] }));
check(blocked.act === 'none' && /cannot be traded/.test(blocked.why), 'untradeable (Alliance Manifesto in trade_items notrade) -> never sent, says why: ' + blocked.why);
// busy rules (mine + his)
[['I raid', { me: { name: 'Destroyer1', town: 'Giran', busy: 'in a raid' } }, /busy \(in a raid\)/], ['his raid', { recv: { town: 'Giran', busy: 'in a raid' } }, /Dagger1 is busy/],
 ['his order', { recv: { town: 'Giran', busy: '', order: '!stash' } }, /runs your order/], ['his quest', { recv: { town: 'Giran', busy: '', quest: 'quest' } }, /runs a quest/],
 ['he is dead', { recv: { town: 'Giran', dead: true } }, /dead/], ['offline', { recv: null }, /offline/], ['stale answer', { recv: { town: 'Giran', stale: true } }, /does not answer/],
 ['me in the field', { me: { name: 'Destroyer1', town: '', busy: '' } }, /until I am in a town/], ['he is in the field', { recv: { town: '' } }, /until Dagger1 is in a town/]]
  .forEach(([what, o, re]) => { const x = P.clanHandDecide(base(o)); check(x.act === 'wait' && re.test(x.why) && x.text === '1 × Blood Mark', `${what} -> wait: ${x.why}`); });
// different towns
d = P.clanHandDecide(base({ me: { name: 'Destroyer1', town: 'Giran', busy: '', idle: false }, recv: { town: 'Oren', solo: true, idle: false } }));
check(d.act === 'wait' && /passes by Oren/.test(d.why), 'party member in Giran, leader busy-ish in Oren -> wait for the party to pass by Oren: ' + d.why);
d = P.clanHandDecide(base({ recv: { town: 'Oren', solo: true, idle: true } }));
check(d.act === 'call' && /come to Giran/.test(d.why), 'leader on his own + idle in Oren -> he is asked to come to Giran');
d = P.clanHandDecide(base({ recv: { town: 'Oren', solo: true, idle: true }, lastCall: T0 - 5 * 60000 }));
check(d.act === 'wait' && /waiting for him/.test(d.why), 'asked 5 min ago -> wait, no second call');
d = P.clanHandDecide(base({ recv: { town: 'Oren', solo: false, idle: true } }));
check(d.act === 'wait', 'a clan leader WITH a party is never called (his party would come along)');
d = P.clanHandDecide(base({ solo: true, me: { name: 'Destroyer1', town: 'Giran', busy: '', idle: true }, recv: { town: 'Oren' } }));
check(d.act === 'give' && /on my own/.test(d.why), 'I am on my own and idle -> I go to him');
check(P.clanHandDecide(base({ solo: true, me: { name: 'Destroyer1', town: 'Giran', busy: '', idle: false }, recv: { town: 'Oren' } })).act === 'wait', 'on my own but leveling -> wait');
// back-off + manual
d = P.clanHandDecide(base({ last: { state: 'failed', at: T0 - 10 * 60000, why: 'trade refused' } }));
check(d.act === 'wait' && /next try in 20 min/.test(d.why), 'failed 10 min ago -> next automatic try in 20 min: ' + d.why);
check(P.clanHandDecide(base({ last: { state: 'failed', at: T0 - 31 * 60000 } })).act === 'give', 'failed 31 min ago -> tries again');
check(P.clanHandDecide(base({ manual: true, last: { state: 'failed', at: T0 - 60000 }, me: { name: 'Destroyer1', town: '', busy: '' }, recv: { town: 'Oren', stale: true } })).act === 'give', 'manual "Hand it over now": no town rule, no back-off, a stale position is enough');
check(P.clanHandDecide(base({ manual: true, me: { name: 'Destroyer1', town: 'Giran', busy: 'a quest runs' } })).act === 'wait', 'manual still waits for my quest / raid / order');
check(P.clanHandDecide(base({ manual: true, recv: { town: 'Giran', busy: 'in a raid' } })).act === 'wait', 'manual never pulls the clan leader out of a raid');

// ---- 2) hovResolve allow list ---------------------------------------------------------------------------------------------------------
const H = new Function(blk('// HANDOVER-PURE-BEGIN', '// HANDOVER-PURE-END') + '\nreturn { hovResolve };')();
const qbag = [{ objId: 777, id: 1419, name: 'Blood Mark', count: 3, quest: true, stackable: true }, { objId: 9, id: 3874, name: 'Alliance Manifesto', count: 1, quest: true }];
const rows = [{ objId: 777, id: 1419, name: 'Blood Mark', count: 1, stack: true }, { objId: 9, id: 3874, name: 'Alliance Manifesto', count: 1 }];
let r = H.hovResolve(rows, 0, qbag, NT);
check(!r.give.length && r.skip.length === 2 && r.skip.every(s => s.why === 'quest item'), 'protected items: a normal hand-over (Trade page / loot) skips them');
r = H.hovResolve(rows, 0, qbag, NT, new Set([1419, 3874]));
check(r.give.length === 1 && r.give[0].id === 1419 && r.give[0].count === 1 && r.skip.length === 1 && /does not allow/.test(r.skip[0].why), 'clanlvl_ order: Blood Mark allowed (1 of 3), the untradeable manifesto still refused');
check(H.hovResolve(rows, 0, qbag, NT, null).give.length === 0 && H.hovResolve(rows, 0, qbag, NT, [1419]).give.length === 1, 'allow list: null = none, an array works too');

// ---- 2b) TRADEEV-PURE: late trade events (the real cause of "trade closed (server: #120 You begin trading ...)", live 2026-10-13) ------------
const E = new Function(blk('// TRADEEV-PURE-BEGIN', '// TRADEEV-PURE-END') + '\nreturn { TRADEEV, tradeEvDecide, tradeAcceptDecide, tradeRangeDecide };')();
{
  // replay of 09:25 UTC: batch 1 ends at t=0 (#22 out of range, Send.TradeDone(0)) -> quiet until 6000; the single retry (session B) starts at
  // 1500; batch 1's TradeClosed reaches the brain at 4000 (3-6 s agent ticks); B's trade opens (#120) at 19000
  const quiet = 0 + E.TRADEEV.quietMs, B = { role: 'give', started: false, done: null };
  let x = E.tradeEvDecide(B, 'closed', 4000, quiet);
  check(!x.apply && /late event of the previous trade/.test(x.why), 'replay 09:25: batch 1\'s late TradeClosed does NOT close the retry session: ' + x.why);
  check(!E.tradeEvDecide(B, 'closed', 7000, quiet).apply, 'a close before THIS trade opened never counts (an earlier trade\'s event)');
  Object.assign(B, { started: true, startedAt: 19000 });                     // #120 You begin trading
  check(!B.done, 'replay: after "#120 You begin trading" the session is still open (old code: done = closed -> "trade closed" 1.7 s after the open)');
  x = E.tradeEvDecide(B, 'completed', 23000, quiet); check(x.apply && x.set.done === 'completed', 'a real completion after the open counts');
  check(!E.tradeEvDecide(Object.assign({}, B, { done: 'completed' }), 'closed', 24000, quiet).apply, 'a close after the completion is ignored');
  check(!E.tradeEvDecide({ started: false }, 'started', 3000, quiet).apply && E.tradeEvDecide({ started: false }, 'started', 6500, quiet).apply, 'a late TradeStarted inside the quiet window is ignored, a fresh one counts');
  check(E.tradeEvDecide({ started: true }, 'closed', 9000, quiet).apply, 'a real close of an open trade counts (the session ends)');
  check(!E.tradeEvDecide(null, 'closed', 9000, 0).apply, 'no session -> nothing');
  // receiver "yes" answers
  const R = { role: 'take', until: 60000, started: false };
  check(E.tradeAcceptDecide(R, 10000, 0, false, false) && !E.tradeAcceptDecide(R, 12000, 10000, false, false) && E.tradeAcceptDecide(R, 14000, 10000, false, false), 'blind answers at most every 4 s (was every 1.5 s)');
  check(E.tradeAcceptDecide(R, 12000, 10000, false, true), 'a real trade request is answered at once');
  check(!E.tradeAcceptDecide(R, 14000, 0, true, true) && !E.tradeAcceptDecide(Object.assign({}, R, { started: true }), 14000, 0, false, true) && !E.tradeAcceptDecide(Object.assign({}, R, { added: 1 }), 14000, 0, false, true), 'never once the trade opened (#120 / started / the giver added items)');
  check(!E.tradeAcceptDecide({ role: 'give', until: 60000 }, 1, 0, false, true) && !E.tradeAcceptDecide(R, 60000, 0, false, true), 'only a receiver session, only before its timeout');
  // giver range before the confirm (Dagger1 at the Giran landing 83473,148554,-3408)
  const QF = { x: 83473, y: 148554, z: -3408 };
  let g = E.tradeRangeDecide({ x: 83453, y: 148573, z: -3408 }, QF); check(g.act === 'ok' && g.d === 28, '28 away -> confirm');
  g = E.tradeRangeDecide({ x: 83000, y: 148888, z: -3472 }, QF);
  check(g.act === 'walk' && g.d === 579 && g.to.z === -3408 && Math.round(Math.hypot(QF.x - g.to.x, QF.y - g.to.y)) <= 46, '579 away (where batch 1 really stood) -> step to ~44 short of him at HIS z -3408: ' + JSON.stringify(g));
  check(E.tradeRangeDecide({ x: 83473, y: 148554, z: -2900 }, QF).act === 'walk', 'same x/y but 508 height apart -> not in reach');
  check(E.tradeRangeDecide({ x: 1, y: 1, z: 0 }, null).act === 'unknown', 'receiver not in sight -> unknown (confirm anyway)');
}

// ---- 3) Dashboard/clanauto_api.js -------------------------------------------------------------------------------------------------------
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'clanhand-'));
const LOGS = path.join(TMP, 'Logs'), DATA = path.join(TMP, 'data'); [LOGS, DATA, path.join(TMP, 'Settings', 'backup')].forEach(x => fs.mkdirSync(x, { recursive: true }));
const realCq = JSON.parse(fs.readFileSync(path.join(ROOT, 'Scripts', 'data', 'clan_quests.json'), 'utf8').replace(/^﻿/, ''));
const cq = JSON.parse(JSON.stringify(realCq)); cq.clan = { name: 'MyClan', leader: 'Dagger1', level: 2, id: 270098570, created: '2026-10-07T17:07:00Z', inviteAllow: [], auto: {} };
fs.writeFileSync(path.join(DATA, 'clan_quests.json'), JSON.stringify(cq));
fs.copyFileSync(path.join(ROOT, 'Scripts', 'data', 'clan_data.json'), path.join(DATA, 'clan_data.json'));
process.env.SWARM_CLANQUESTS_FILE = path.join(DATA, 'clan_quests.json'); process.env.SWARM_CLANAUTO_FILE = path.join(LOGS, 'clan_auto.json');
fs.writeFileSync(path.join(LOGS, 'clan_auto.json'), JSON.stringify({ levelUp: true }));
const readJson = (f, dflt) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch (e) { return dflt; } };
const nowIso = new Date().toISOString();
// exactly what the live clan_state.json looked like on 2026-10-13 07:53 (Me.Clan.Level 0, the intel did not parse)
fs.writeFileSync(path.join(LOGS, 'clan_state.json'), JSON.stringify({ leader: 'Dagger1', at: nowIso, sp: 4113891, adena: 30085030, town: 'Oren', mode: 'idle',
  nextLevel: { level: 0, next: 1, ok: true, missing: [], sp: { have: 4113891, need: 20000 }, adena: { have: 30085030, need: 650000 }, items: [] },
  clanInfo: { id: 270098570, name: '(clan 270098570)', level: 0, members: [] }, clan: { name: '', level: 0, id: 270098570 },
  skillCheck: { ok: false, msg: 'clan skills start at clan level 5 (the clan is level 0)' } }));
fs.writeFileSync(path.join(LOGS, 'bag_Destroyer1.json'), JSON.stringify({ at: nowIso, name: 'Destroyer1', items: [{ id: 1419, objId: 276838854, name: 'Blood Mark', count: 3 }] }));
const chars = [{ name: 'Dagger1', level: 53, party: 'Dagger1', ageSec: 5, mode: 'idle' }, { name: 'Tank1', level: 56, party: 'Tank1', ageSec: 5, mode: 'autolevel' },
  { name: 'Destroyer1', level: 56, party: 'Tank1', ageSec: 5 }, { name: 'Bishop1', level: 55, party: 'Tank1', ageSec: 5 }];
const A = require(path.join(ROOT, 'Dashboard', 'clanauto_api.js'));
const sent = [];
const ctx = { ROOT: TMP, LOGS, DATA, readJson, readStates: () => chars, commandRun: async (b) => { sent.push(b); return { code: 200, body: { ok: true } }; } };
// fixNextLevel
const fx = A.fixNextLevel({ level: 0, next: 1, ok: true, missing: [] }, 2, CD.levels, { sp: 4113891, adena: 30085030 }, () => 0);
check(fx.level === 2 && fx.next === 3 && !fx.ok && fx.missing.some(m => /Blood Mark \(1419\) 0\/1/.test(m)) && fx.fixed && fx.reported === 0, 'fixNextLevel: the "level 0 -> 1" report becomes "level 2 -> 3, Blood Mark missing": ' + JSON.stringify(fx.missing));
check(A.fixNextLevel({ level: 2, next: 3, ok: false, x: 1 }, 2, CD.levels, {}, null).x === 1, 'fixNextLevel: a report at the real level is kept as it is');
check(A.fixNextLevel({ level: 0 }, 2, CD.levels, { sp: 4113891, adena: 30085030 }, () => 1).ok === true, 'fixNextLevel: SP + adena + Blood Mark in the leader\'s bag -> ready');
check(A.realName('(clan 270098570)') === '' && A.realName('MyClan') === 'MyClan', 'realName: "(clan <id>)" is no name');
// status: one level everywhere
let S = A.status(ctx);
const row = (k) => S.rows.find(x => x.key === k);
check(S.level === 2 && S.clan === 'MyClan', 'status: level 2, name MyClan (not "(clan 270098570)")');
check(/level 2 → 3/.test(row('levelUp').text) && /Blood Mark/.test(row('levelUp').text) && !/level 0/.test(row('levelUp').text), 'level-up row: "level 2 → 3 waits for ... Blood Mark": ' + row('levelUp').text);
check(/the clan is level 2/.test(row('skillLearn').text) && !/level 0/.test(row('skillLearn').text), 'skills row: "(the clan is level 2)": ' + row('skillLearn').text);
check(/the clan is level 2/.test(row('questDispatch').text), 'raid quest row: level 2');
const ih = row('itemHandover');
check(ih && ih.on === true && ih.act && ih.act.giver === 'Destroyer1' && ih.act.receiver === 'Dagger1' && ih.act.count === 1 && ih.act.item === 'Blood Mark', 'hand-over row: Destroyer1 -> Dagger1, 1 × Blood Mark, button: ' + JSON.stringify(ih && ih.act));
check(/Destroyer1 already has 3 × Blood Mark: hands 1 to Dagger1 by itself/.test(ih.text) && ih.state === 'wait', 'hand-over row text: ' + ih.text);
check(!S.needs.some(x => x.kind === 'clanhand' || x.kind === 'handover') && !/Needs you/.test(row('levelQuests').text), 'no "Needs you" while the hand-over is automatic');
check(/no hunt needed/.test(row('levelQuests').text) && /Destroyer1 already has 3/.test(row('levelQuests').text), 'level quest row: no hunt needed: ' + row('levelQuests').text);
// the giver's status file (swarm.js CLANHAND)
const hf = path.join(LOGS, 'clanhand_Destroyer1.json');
fs.writeFileSync(hf, JSON.stringify({ name: 'Destroyer1', at: nowIso, state: 'waiting', text: '1 × Blood Mark for Dagger1', why: 'until my party passes by Oren (Dagger1\'s town) — or press "Hand it over now"' }));
S = A.status(ctx); check(/waiting until my party passes by Oren/.test(row('itemHandover').text), 'waiting status shown: ' + row('itemHandover').text);
fs.writeFileSync(hf, JSON.stringify({ name: 'Destroyer1', at: nowIso, state: 'handing', text: 'handing 1 × Blood Mark to Dagger1', why: 'both in Giran' }));
S = A.status(ctx); check(/Destroyer1 is handing 1 × Blood Mark to Dagger1 \(both in Giran/.test(row('itemHandover').text) && row('itemHandover').state === 'ok' && !row('itemHandover').act, 'handing: "Destroyer1 is handing 1 × Blood Mark to Dagger1", no second button: ' + row('itemHandover').text);
fs.writeFileSync(hf, JSON.stringify({ name: 'Destroyer1', at: nowIso, state: 'handed', text: 'handed 1 × Blood Mark to Dagger1' }));
S = A.status(ctx); check(/handed 1 × Blood Mark to Dagger1/.test(row('itemHandover').text) && row('itemHandover').state === 'ok', 'handed shown: ' + row('itemHandover').text);
fs.writeFileSync(hf, JSON.stringify({ name: 'Destroyer1', at: nowIso, state: 'failed', why: 'Dagger1 not reached in 30 min' }));
S = A.status(ctx); check(row('itemHandover').state === 'need' && S.needs.some(x => x.kind === 'clanhand' && x.giver === 'Destroyer1' && x.count === 1), 'failed -> Needs you with "Hand it to Dagger1 now"');
fs.writeFileSync(hf, JSON.stringify({ name: 'Destroyer1', at: new Date(Date.now() - 3600e3).toISOString(), state: 'waiting', why: 'old' }));
S = A.status(ctx); check(!/old/.test(row('itemHandover').text), 'a status older than 20 min is ignored');
// the leader got it -> "enough", no hunt / trade needed
fs.writeFileSync(path.join(LOGS, 'bag_Dagger1.json'), JSON.stringify({ at: nowIso, name: 'Dagger1', items: [{ id: 1419, objId: 1, name: 'Blood Mark', count: 1 }] }));
S = A.status(ctx);
check(/Dagger1 has 1 × Blood Mark — enough/.test(row('itemHandover').text) && !row('itemHandover').act, 'leader has it: ' + row('itemHandover').text);
check(/no hunt or trade needed/.test(row('levelQuests').text), 'level quest row: leader has it -> next is the level-up: ' + row('levelQuests').text);
check(/level 2 → 3/.test(row('levelUp').text) && row('levelUp').state === 'ok', 'level-up row: ready 2 -> 3 once the Blood Mark is in his bag: ' + row('levelUp').text);
fs.unlinkSync(path.join(LOGS, 'bag_Dagger1.json'));
// switch OFF -> Needs you
cq.clan.auto.itemHandover = false; fs.writeFileSync(path.join(DATA, 'clan_quests.json'), JSON.stringify(cq)); fs.unlinkSync(hf);
S = A.status(ctx); check(row('itemHandover').on === false && S.needs.some(x => x.kind === 'clanhand') && /OFF/.test(row('itemHandover').text), 'switched OFF -> Needs you + the button');
check(A.post(ctx, { action: 'set', key: 'itemHandover', on: true }).ok && readJson(path.join(DATA, 'clan_quests.json')).clan.auto.itemHandover === true, 'POST set itemHandover writes clan_quests.json clan.auto');
// POST handover
(async () => {
  let p = await A.post(ctx, { action: 'handover', giver: 'Destroyer1' });
  check(p.ok && sent.length === 1 && sent[0].cmd === '!clanhand Destroyer1' && sent[0].target === 'char:Destroyer1', 'POST handover -> "!clanhand Destroyer1" to char:Destroyer1');
  p = await A.post(ctx, { action: 'handover', giver: 'Dagger1' }); check(p.code === 400 && sent.length === 1, 'the clan leader is never a giver');
  p = await A.post(ctx, { action: 'handover', giver: 'x y' }); check(p.code === 400, 'bad name refused');
  check(/clan level item hand-over now/.test(fs.readFileSync(path.join(LOGS, 'dashboard_commands.log'), 'utf8')), 'logged in dashboard_commands.log');
  fs.rmSync(TMP, { recursive: true, force: true });

  // ---- 4) source checks + syntax ---------------------------------------------------------------------------------------------------
  check(/case '!clanhand': \{/.test(src) && /clanHandTick\(true\)/.test(src), "swarm.js: '!clanhand [name]' runs a manual check");
  check((src.match(/hovResolve\(mine\.items, mine\.adena, hovBag\(\), hovNotrade\(\), hovAllow\(o\)\)/g) || []).length === 2, 'swarm.js: hovGive passes the order\'s allow list (both resolves)');
  check(/o\.receiver !== clanLeaderName\(\)/.test(src) && /\^clanlvl_/.test(src), 'swarm.js: hovAllow only for clanlvl_ orders to the CURRENT clan leader');
  check(/if \(clanLvlItemIds\(\)\.has\(n\)\) return true;/.test(src.slice(src.indexOf('function qeProtected('), src.indexOf('function qeProtected(') + 900)), 'swarm.js: qeProtected keeps clan level items from sell / stash / destroy');
  const cln = src.slice(src.indexOf('function clanLevelNow()'), src.indexOf('function clanLevelNow()') + 500);
  check(/clanCfgCached\(\)/.test(cln) && /num\(C\.id\) === id/.test(cln), 'swarm.js: clanLevelNow = max(L2Swarm, intel, clan_quests.json clan.level of the same clan id)');
  check(/level: clanLevelNow\(\),\s+\/\/ CLANHAND/.test(src), 'swarm.js: clanInfo().level = clanLevelNow()');
  check(/App\.on\('swarm\.clanhand\.come'/.test(src) && /takeControl\(name, PRIO\.UPKEEP\)/.test(src), 'swarm.js: the clan leader comes over at the lowest priority (any task interrupts it)');
  check(/clanAutoFlag\('itemHandover', true\)/.test(src), 'swarm.js: switch clan.auto.itemHandover (default ON)');
  check(/hovNow = !!\(HOV\.busy \|\| HOV\.host\.ctl \|\| tradeState\)/.test(src), 'swarm.js: the 3 s follow check never switches follow on during a hand-over / trade (live 08:10 "trade closed")');
  check(/onAppEvent\('TradeClosed', \(\) => tradeEv\('closed'\)\)/.test(src) && /onAppEvent\('TradeCompleted', \(\) => tradeEv\('completed'\)\)/.test(src), 'swarm.js: trade events go through tradeEvDecide (session-scoped)');
  check((src.match(/tradeQuiet\(\);\s+\/\/ TRADEEV: this session's late events/g) || []).length === 2 && /tradeQuiet\(\);\s+\/\/ TRADEEV: its close event arrives late/.test(src), 'swarm.js: a quiet window after every giver / receiver session and after clearStuckTrade');
  check(/rc < TRADEEV\.reconfirmMax\) \{ rc\+\+; lastRc = now\(\); try \{ Send\.TradeDone\(1\)/.test(src) && /tradeState\.rcAt = now\(\); try \{ Send\.TradeDone\(1\)/.test(src), 'swarm.js: giver and receiver re-confirm every 3 s until done');
  check(/tradeRangeDecide\(\{ x: Me\.X, y: Me\.Y, z: Me\.Z \}/.test(src) && /walkDirect\(q\.X, q\.Y, zOf\(q\), 100, 8000, null, true\)/.test(src), 'swarm.js: the giver confirms only within reach and walks to the receiver at HIS z');
  check(/receiveItems\(\{ giver: d\.giver, what: d\.what \|\| '', step: 'late', added: true \}\)/.test(src), 'swarm.js: a trade opened while no receiver session ran is still confirmed (our own hand-over givers only)');
  check(/if \(!CLANHAND\.loaded\)/.test(src), 'swarm.js: after a reload the running order / last failure is picked up from Logs/clanhand_<name>.json');
  const CMDS = require(path.join(ROOT, 'Dashboard', 'commands.js'));
  const ce = CMDS.COMMANDS.find(c => c.id === 'clanhand');
  check(ce && ce.tpl === '!clanhand' && ce.nameForChar && CMDS.SWARM_WORDS.includes('!clanhand'), 'catalog: clanhand (!clanhand, nameForChar) -> server ALLOWED');
  const ui = fs.readFileSync(path.join(ROOT, 'Dashboard', 'clanauto.js'), 'utf8');
  check(!/(^|[^\w.])(alert|confirm|prompt)\s*\(/m.test(ui.replace(/uiConfirm|confirmOrder/g, '')) && /uiConfirm\(\{ title: `Hand \$\{a\.item\}/.test(ui) && /data-cahand/.test(ui), 'clanauto.js: styled uiConfirm, no browser dialogs, row button');
  const sv = fs.readFileSync(path.join(ROOT, 'Dashboard', 'server.js'), 'utf8');
  check(/CA\.fixNextLevel\(st\.nextLevel, lv/.test(sv), 'server.js /api/clan: the level-up box gets the same one level');
  ['Scripts_dev/swarm.js', 'Dashboard/server.js', 'Dashboard/clanauto_api.js', 'Dashboard/clanauto.js', 'Dashboard/commands.js', 'docs/plan/tools/test_clan_handover.js'].forEach(f => {
    let ok = true; try { cp.execFileSync(process.execPath, ['--check', path.join(ROOT, f)], { stdio: 'pipe' }); } catch (e) { ok = false; console.log(String(e.stderr || e.message).slice(0, 400)); }
    check(ok, 'node --check ' + f);
  });
  const html = fs.readFileSync(path.join(ROOT, 'Dashboard', 'index.html'), 'utf8');
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi; let m, k = 0, bad = 0;
  while ((m = re.exec(html))) { k++; try { new Function(m[1]); } catch (e) { bad++; console.log('inline script ' + k + ': ' + e.message); } }
  check(k > 0 && !bad, `Dashboard/index.html: ${k} inline scripts parse`);
  console.log(`\ntest_clan_handover: ${n - fails}/${n} checks passed${fails ? ' — ' + fails + ' FAILED' : ''}`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
