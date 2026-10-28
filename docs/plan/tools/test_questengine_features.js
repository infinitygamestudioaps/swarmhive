// TEST QUEST ENGINE FEATURES (2026-10-27, the quest engine agent; owner: "I want ALL quests to work ... step by step, automatically").
// Pure logic of Scripts_dev/swarm.js QENGINE-PURE against REAL quest records + stubbed-host checks of the new host steps, and the dry-run mirror:
//   A memo-state stages (QMEMO): fromMemo -> cond map, memo carried by setCond, own memo record, qeMemoCheck = builder + dry run
//   B gives-only talks / skipIfHave / condAfterAll / collect a stage item first (QGIVES), repeatable exchange = a turn-in run (QEXCHANGE)
//   C hunt rounds follow the plan's expected time (QHUNTCAP), progress rounds never count as a failed try
//   D override fields: routes / placeRoutes / forMobs / routeSteps / atlas + via starts (QPLANOV)
//   E quest-spawned NPCs: the spawner trigger (QSPAWNER)
//   F R7 ask-first purchase (QBUY): pure choice + STUBBED HOST: nothing is bought without the owner's yes; gear never
//   G Kamaloka bosses = the party's Kamaloka mission (QINSTANCE)
//   H the dry run uses the same engine functions (quest_dryrun.js verifyOne, no geodata)
// Run: node docs/plan/tools/test_questengine_features.js   (BelowNormal; reads only)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
try { os.setPriority(process.pid, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch (e) { }
const ROOT = path.resolve(__dirname, '..', '..', '..'), DATA = path.join(ROOT, 'Scripts', 'data');
const src = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
const a = src.indexOf('// QENGINE-PURE-BEGIN'), b = src.indexOf('// QENGINE-PURE-END');
const NAMES = ['qeDecide', 'qeTransAt', 'qeMemoInfo', 'qeMemoCheck', 'qeMemoAfter', 'qeFromMemoOf', 'qeGivesHeld', 'qeHuntRounds', 'qePlanRoute', 'qePlanRouteSteps', 'qeNpcSpawner', 'qeBuyAsk', 'qeBuyCmd', 'qeInstanceOf', 'qeHuntAction', 'qeIsQuit', 'qePlanMatch', 'QE_SHOP_ITEMS'];
const E = new Function(src.slice(a, b) + '\nreturn {' + NAMES.map(n => n + ': typeof ' + n + ' !== "undefined" ? ' + n + ' : null').join(', ') + '};')();
let oks = 0, fails = 0; const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (c) oks++; else fails++; };
const Q = (id) => JSON.parse(fs.readFileSync(path.join(DATA, 'quests', id + '.json'), 'utf8'));
const P = (id) => JSON.parse(fs.readFileSync(path.join(DATA, 'quest_plans', id + '.json'), 'utf8'));
NAMES.forEach(n => ok(!!E[n], n + ' is in the QENGINE-PURE block'));

// ---- A memo ----
console.log('A memo-state');
{ const q = Q(116);
  const d1 = E.qeDecide(q, { started: true, cond: 1, condKnown: true, have: {} });
  ok(d1.act === 'talk' && d1.npcs[0] === 30535 && d1.memo === 2, '116 cond 1: talk Filaur 30535 "Yes, I can" (memo 2) — not the end NPC 32052 (fromMemo [2])');
  const d2 = E.qeDecide(q, { started: true, cond: 2, condKnown: true, have: {}, memo: 2 });
  ok(d2.act === 'talk' && d2.npcs[0] === 32052 && d2.to === 'end', '116 cond 2: the end talk at 32052');
  ok(E.qeMemoCheck(q).ok && E.qeMemoCheck(q).uses, '116: qeMemoCheck ok (the builder drops memo-state, the dry run proves the flow)');
  const st = E.qeDecide(q, { started: false, have: {} });
  ok(st.kind === 'start' && st.memo === 1, 'the start action carries the memo it sets (1)');
}
{ const q = Q(117);
  ok(E.qeMemoInfo(q).m2c[7].indexOf(8) >= 0, '117: the kill 7 -> 8 keeps memo 7 (setCond does not touch the memo): memo 7 maps to cond 7 and 8');
  const d = E.qeDecide(q, { started: true, cond: 8, condKnown: true, have: { 8495: 1 }, memo: 7 });
  ok(d.act === 'talk' && d.npcs[0] === 32052, '117 cond 8 memo 7: hand the item to 32052 (was "no automatic step")');
  ok(E.qeMemoAfter(q, { cond: 7, memo: 7 }, { cond: 8 }, { act: 'hunt' }, false) === 7, 'qeMemoAfter: a memo-less kill to cond 8 keeps memo 7');
  ok(E.qeMemoAfter(q, { cond: 1, memo: 1 }, { cond: 2 }, { act: 'talk', memo: 2 }, true) === 2, 'qeMemoAfter: a talk that took its link sets its memo');
}
{ const bad = { transitions: [{ start: true, to: 1, memo: 20000, trigger: { type: 'event', npcs: [1] } }, { fromMemo: [20000], to: 2, trigger: { type: 'talk', npcs: [2] } }] };
  ok(!E.qeMemoCheck(bad).ok && /bit-flag/.test(E.qeMemoCheck(bad).why.join(' ')), 'qeMemoCheck: a bit-flag memo (Q00337 style) = cannot follow');
  const none = { transitions: [{ start: true, to: 1, memo: 1, trigger: { type: 'event', npcs: [1] } }, { fromMemo: [1], trigger: { type: 'talk', npcs: [2] } }] };
  ok(!E.qeMemoCheck(none).ok, 'qeMemoCheck: a transition that changes neither the cond nor the memo = cannot follow');
  const un = { transitions: [{ start: true, to: 1, memo: 1, trigger: { type: 'event', npcs: [1] } }, { fromMemo: [5], to: 2, trigger: { type: 'talk', npcs: [2] } }] };
  ok(!E.qeMemoCheck(un).ok && /no transition sets/.test(E.qeMemoCheck(un).why.join(' ')), 'qeMemoCheck: a memo nothing sets = cannot follow');
  const raw = E.qeFromMemoOf({ trigger: { raw: ['memoState >= 5', 'memoState <= 6', '!getQuestItemsCount(x) >= 3'] } }, 9);
  ok(JSON.stringify(raw) === '[5,6]', 'qeFromMemoOf: the raw "memoState >= 5 / <= 6" test = memo 5..6 (negated ones ignored)');
  const q423 = Q(423), d = E.qeDecide(q423, { started: true, cond: 1, condKnown: true, have: {}, memo: 1 });
  ok(d.act !== 'talk' || d.npcs[0] !== 32740, '423 cond 1 memo 1: never the end talk of memo 2 (it used to "pass" by going straight to the end)');
}

// ---- B gives-only / exchange ----
console.log('B gives-only talks, skipIfHave, condAfterAll, exchange');
{ const q = Q(166); let have = { 1088: 1 }; const seq = [];
  for (let i = 0; i < 4; i++) { const d = E.qeDecide(q, { started: true, cond: 1, condKnown: true, have }); seq.push(d.npcs && d.npcs[0]); const t = q.transitions[d.trans[0]]; (t.gives || []).forEach(g => { have[g.id] = (have[g.id] || 0) + 1; }); if (t.to === 2) break; }
  ok(seq.join(',') === '30135,30139,30143', '166: Iria (gives) -> Dorankus -> Trudy, each once (' + seq.join(',') + ')');
}
{ const q = Q(5); let have = { 1547: 1, 1552: 1 }; const seq = [];
  for (let i = 0; i < 6; i++) { const d = E.qeDecide(q, { started: true, cond: 1, condKnown: false, have }); seq.push(d.act === 'advance' ? 'adv' + d.to : d.npcs[0]); if (d.act === 'advance') break; const t = q.transitions[d.trans[0]]; (t.takes || []).forEach(x => { have[x.id] = 0; }); (t.gives || []).forEach(g => { have[g.id] = (have[g.id] || 0) + 1; }); }
  ok(seq.length === 5 && seq[4] === 'adv2' && new Set(seq.slice(0, 4)).size === 4, '5 Miner\'s Favor: the four talks once each (skipIfHave), then cond 2 (condAfterAll) — ' + seq.join(' > '));
}
{ const q = Q(135); const d = E.qeDecide(q, { started: true, cond: 4, condKnown: true, have: { 10328: 0, 10329: 10, 10330: 10, 10331: 1 } });
  ok(d.act === 'talk' && d.npcs[0] === 30078, '135 cond 4: collect Pano\'s stage item before the forward talk at 30291');
}
{ const q = Q(270); const d = E.qeDecide(q, { started: true, cond: 1, condKnown: true, have: { 15526: 100 } });
  ok(d.act === 'turnin' && d.exchange && d.npcs[0] === 32757, '270: 100 Rags of Monks = an exchange turn-in run (then hunt again)');
  ok(E.qeIsQuit('"I tire of this. I am done with this mission."') && E.qeIsQuit('"Oh well. I\'m done with this."') && !E.qeIsQuit('I brought 100 Rags of Monks'), 'qeIsQuit: "I am done with this mission" / "I\'m done with this" are quit links');
}

// ---- C hunt rounds ----
console.log('C hunt rounds follow the plan');
ok(E.qeHuntRounds(0, 45, 4, 12) === 4 && E.qeHuntRounds(600, 45, 4, 12) === 4, 'qeHuntRounds: short hunts keep the old 4 rounds');
ok(E.qeHuntRounds(300 * 60, 45, 4, 12) === 11, 'qeHuntRounds: a 300-min plan -> 11 rounds of 45 min (x1.5 + 1)');
ok(E.qeHuntRounds(40 * 3600, 45, 4, 12) === 16, 'qeHuntRounds: never more than 12 h (16 rounds)');
{ const run = src.slice(src.indexOf('async function qeRun('), src.indexOf('function qeStart('));
  ok(/qeHuntRounds\(pmh && pmh\.step && pmh\.step\.expectedSec/.test(run) && /if \(r\.progress\) \{ same = Math\.max\(0, same - 1\); fails = 0;/.test(run), 'qeRun: rounds from the plan step, a progress round is not a failed try');
  const hunt = src.slice(src.indexOf('async function qeDoHunt('), src.indexOf('async function qeDoSpawn('));
  ok(/let kills = num\(a\.kills\) > 0 \? \(num\(Q\.huntKills\[hk\]\) \|\| 0\) : 0/.test(hunt) && /progress: gained > 0 \|\| kills > kills0/.test(hunt) && /Q\.roundTxt/.test(hunt), 'qeDoHunt: a kill-count step keeps its kills across rounds, reports progress, says the round live');
  ok(/Q\.huntKills = \{\}; Q\.huntRounds = \{\};/.test(run), 'qeRun: a new run (turn-in / end) counts kills and rounds from zero');
}

// ---- D override fields ----
console.log('D override routes');
{ const p = P(215), st = p.steps.find(s => s.key === 'c1:hunt'), ov = p.override.steps['c1:hunt'];
  const nah = (st.places || []).find(pl => (pl.mobs || []).map(Number).includes(27117)), other = (st.places || []).find(pl => !(pl.mobs || []).map(Number).includes(27117));
  const r1 = E.qePlanRoute({ ov, step: st, place: nah }, nah && nah.mobs);
  ok(r1 && r1.src === 'override' && r1.start && r1.start.kind === 'atlas', '215 forMobs [27117]: the Nahir place walks the override route (atlas start)');
  if (other) { const r2 = E.qePlanRoute({ ov, step: st, place: other }, other.mobs); ok(!r2 || r2.src !== 'override', '215 forMobs: another place of the step keeps its own route'); }
}
{ const p = P(103), st = p.steps.find(s => s.key === 'c1:hunt'), ov = p.override.steps['c1:hunt'], pr = ov.placeRoutes[0];
  const place = { mobs: (st.places && st.places[0] && st.places[0].mobs) || [], area: { at: pr.place } };
  const r = E.qePlanRoute({ ov, step: st, place }, place.mobs);
  ok(r && r.which === 'place' && r.start && r.start.kind === 'gk', '103 placeRoutes: the route of the place being hunted (gk start ' + (r && r.start && r.start.desc) + ')');
}
{ const ov = { routes: { 27064: { route: [[1, 2, 3], [4, 5, 6]] }, 27065: { route: [[7, 8, 9], [10, 11, 12]] } } };
  const r = E.qePlanRoute({ ov, step: {}, place: null }, [27065]);
  ok(r && r.points[0].x === 7 && r.which === 'monster 27065', 'routes by monster: the route of the ONE chief being hunted');
  ok(!E.qePlanRoute({ ov, step: {}, place: null }, [27064, 27065]), 'routes by monster: several chiefs at once = no single route (the plan travel)');
}
{ const p = P(124), ov = p.override.steps['c2:talk:32114'], r = E.qePlanRouteSteps(ov.routeSteps, ov.route);
  const fl = r.points ? r.points.filter(x => x.do === 'floor') : [];
  ok(r.points && fl.length === 1 && fl[0].npc.id === 32111 && fl[0].link === 'Teleport.' && r.start && r.start.kind === 'gk', '124 routeSteps: .rune > gatekeeper > walk > Orahochin "Teleport." > walk override.route (one route with its NPC step)');
  ok(!!E.qePlanRouteSteps([{ do: 'floor', npc: 1, link: 'x' }, { do: 'walk', points: [[1, 1, 1], [2, 2, 2]] }]).bad, 'routeSteps: an NPC step without its place cannot run (stays an engine gap)');
}
{ const ct = src.slice(src.indexOf('async function rsCustomTrip('), src.indexOf('async function routeSwitchTrip('));
  ok(/st\.kind === 'atlas' && st\.key/.test(ct) && /navAtlasRun\(ar,/.test(ct) && /navAtlasNpc\(\{ id: Number\(th\.id\)/.test(ct), 'rsCustomTrip: atlas start = the nav atlas route, then the NPC teleport (then.link / landing)');
  ok(/st\.via/.test(ct) && /viaDone = true/.test(ct), 'rsCustomTrip: gatekeeper start via the hops first (".schuttgart > Schuttgart -> Orc Village")');
}

// ---- E spawned NPCs ----
console.log('E quest-spawned NPCs');
{ const s21 = E.qeNpcSpawner(Q(21), 31524); ok(s21 && s21.how === 'talk' && s21.npcs[0] === 31523 && s21.links[0] === 'Wait.', '21: Ghost of von Hellmann <- Tombstone 31523 "Wait."');
  const s64 = E.qeNpcSpawner(Q(64), 32253); ok(s64 && s64.how === 'kill' && s64.mobs[0] === 27323, '64: Harkilgamed <- kill Divine Emissary 27323');
  ok(E.qeNpcSpawner(Q(21), 99999) === null, 'no spawner known = null (the engine says so)');
  const go = src.slice(src.indexOf('async function qeGoNpc('), src.indexOf('function qeBagCount('));
  ok(/qeNpcSpawner\(q, npcId\)/.test(go) && /appeared — talking to it at once/.test(go) && /spawnerBusy/.test(go), 'qeGoNpc: not reached + a spawner = do the trigger, wait for it, talk at once (no recursion)');
}

// ---- F R7 ask first ----
console.log('F R7: quest items only after a yes');
{ const q = { id: 999, name: 'T', requirements: { items: [{ id: 736, count: 1 }] }, items: [{ id: 5000, name: 'Quest Paper', roles: ['given'] }, { id: 220, name: 'Crafted Dagger', roles: [] }], drops: [{ item: 6000, monsters: [1] }],
    transitions: [{ start: true, to: 1, trigger: { type: 'event', npcs: [1], events: ['a'] } }, { from: [1], to: 2, trigger: { type: 'talk', npcs: [2], needCounts: [{ id: 1831, n: 2 }, { id: 5000, n: 1 }, { id: 6000, n: 1 }, { id: 220, n: 1 }] } }] };
  const st = E.qeBuyAsk(q, { act: 'talk', kind: 'start', trans: [0] }, { started: false, have: { 736: 0 } }, null);
  ok(st.length === 1 && st[0].id === 736 && st[0].n === 1, 'start item: 1 Scroll of Escape to ask for');
  const t = E.qeBuyAsk(q, { act: 'talk', kind: 'step', trans: [1] }, { started: true, have: { 1831: 0 } }, [{ id: 220, name: 'Crafted Dagger', count: 1 }]);
  ok(t.length === 1 && t[0].id === 1831 && t[0].n === 2, 'hand-in: 2 Antidote; never the quest\'s own item, never a drop, never GEAR (Crafted Dagger even when listed)');
  ok(!E.qeBuyAsk(q, { act: 'talk', kind: 'step', trans: [1] }, { started: true, have: { 1831: 2 } }, null).length, 'already held = nothing to ask');
  ok(!E.qeBuyAsk(q, { act: 'hunt' }, { have: {} }, null).length, 'a hunt never buys');
  ok(E.qeBuyCmd(['!quest', 'buy', 'yes', 'Bishop1']).answer === 'yes' && E.qeBuyCmd(['!quest', 'buy', 'no']).answer === 'no' && E.qeBuyCmd(['!quest', '258']) === null, '!quest buy yes|no [name] parses');
}
// STUBBED HOST: qeBuyStep with a fake shop; the answer comes from qeCommand('!quest buy ...')
const hostOf = (bodyStart, bodyEnd) => src.slice(src.indexOf(bodyStart), src.indexOf(bodyEnd));
const BUYSRC = hostOf('function qeBuyHave(', '\n// ---- party mode ----'), CMDSRC = hostOf('function qeCommand(', '\n// ---- QUEST FARM');
async function buyScenario(answer) {
  const W = { t: 0, bought: [], said: [], log: [], inv: { 57: 100000, 1831: 0 }, opened: 0 };
  const H = {
    QE_CFG: { buyWaitMs: 60000, maxFails: 8 }, QE_SHOP_ITEMS: E.QE_SHOP_ITEMS, qeBuyCmd: E.qeBuyCmd, Me: { Name: 'Bishop1', X: 0, Y: 0, Z: 0 },
    num: (v) => Number(v) || 0, now: () => W.t, sleep: async (ms) => { W.t += ms; if (answer && W.t >= 9000 && !W.answered) { W.answered = true; H.qeCommand(['!quest', 'buy', answer, 'Bishop1']); } },
    itemCount: (id) => W.inv[id] || 0, isLeader: () => false, currentTownKey: () => 'giran', qeStopped: () => false,
    nearestGrocer: () => ({ Name: 'Helvetia', X: 10, Y: 10, Z: 0 }), Distance: () => 100, goToNpc: async () => ({ ok: true }), walkTo: async () => true,
    openShop: async () => { W.opened++; return { ok: true, prices: { 1831: 165 }, shopId: 18 }; },
    buyAt: async (npc, wants) => { wants.forEach(w => { W.bought.push(w); W.inv[w.id] = (W.inv[w.id] || 0) + w.count; }); return { ok: true, bought: wants, msg: 'bought ' + wants.map(w => w.count + ' ' + w.name).join(', ') }; },
    SayToParty: (m) => W.said.push(m), note: (m) => W.log.push(m), qeLog: (id, m) => W.log.push(m), qeSave: () => { }, qePhase: (ph, st) => { W.phase = ph + ': ' + st; },
    S: { active: {} }, QS: { running: true, spec: { mode: 'solo' } },
  };
  H.qeS = () => H.QS; H.qeSt = () => H.S;
  const keys = Object.keys(H).filter(k => !/^(S|QS)$/.test(k));
  const mk = new Function(...keys, BUYSRC + '\n' + CMDSRC + '\nreturn { qeBuyStep, qeCommand, qeBuyHave };');
  const F = mk(...keys.map(k => H[k])); H.qeCommand = F.qeCommand;
  const q = { id: 380, name: 'Bring Out the Flavor of Ingredients!' };
  const r = await F.qeBuyStep(q, { act: 'talk', trans: [1] }, { have: {} }, [{ id: 1831, name: 'Antidote', n: 2, have: 0, shop: 'grocer' }]);
  return { r, W, ask: H.S.active.ask };
}
(async () => {
  { const { r, W, ask } = await buyScenario(null);
    ok(!W.bought.length && r.fatal && /no answer/.test(r.msg), 'R7 no answer: nothing bought, the run stops with "no answer" (' + r.msg.slice(0, 70) + ')');
    ok(ask && ask.items[0].price === 165 && ask.total === 330 && /Helvetia/.test(ask.shop) && W.said.some(m => /2 Antidote \(165 a each\).*= 330 adena.*!quest buy yes Bishop1/.test(m)), 'R7 the question names item, count, the shop\'s price, total and shop (party chat + active.ask)');
    ok(/asking you: buy 2 Antidote at Helvetia/.test(W.phase || ''), 'R7 the live line says what it waits for'); }
  { const { r, W, ask } = await buyScenario('no');
    ok(!W.bought.length && r.fatal && /you said no/.test(r.msg) && ask.answer === 'no', 'R7 answer no: nothing bought, the run stops'); }
  { const { r, W, ask } = await buyScenario('yes');
    ok(W.bought.length === 1 && W.bought[0].id === 1831 && W.bought[0].count === 2 && r.ok && ask.answer === 'yes', 'R7 answer yes: exactly 2 Antidote bought, then the step goes on'); }
  ok(/bl = qeBuyAsk\(q, a, Object\.assign\(\{\}, s, \{ have: qeBuyHave\(q, s\) \}\)/.test(src) && /if \(br\.fatal\)/.test(src), 'qeRun asks before every talk / turn-in that needs a shop item');
  { const cat = fs.readFileSync(path.join(ROOT, 'Dashboard', 'commands.js'), 'utf8'); ok(/id: 'questbuy'[\s\S]{0,120}tpl: '!quest buy \{answer\}'/.test(cat), 'dashboard command catalog: "Answer a quest purchase" (!quest buy yes|no)'); }

  // ---- G Kamaloka ----
  console.log('G Kamaloka bosses');
  { const q = Q(10278); const d = E.qeDecide(q, { started: true, cond: 1, condKnown: true, have: {} });
    ok(d.act === 'instance' && d.kind === 'kamaloka' && d.level === 43 && d.target === 18562, '10278: Blade Otis = Kamaloka level 43 (the party\'s Kamaloka mission)');
    const d2 = E.qeDecide(q, { started: true, cond: 1, condKnown: true, have: { 13834: 1 } });
    ok(d2.act === 'instance' && d2.level === 46, '10278: then Weird Bunei = Kamaloka level 46');
    const di = src.slice(src.indexOf('async function qeDoInstance('), src.indexOf('// ---- QBUY-2026-10-27: ask the owner'));
    ok(/leaderMission\('kamaloka', a\.level[,)]/.test(di)   /* RESUPOPT-2026-10-27: + { auto: quest farm } */ && /PARTY mode/.test(di), 'qeDoInstance: party leader only, runs the existing Kamaloka mission'); }

  // ---- I live-test fixes (coordinator 2026-10-27) ----
  console.log('I live-test fixes');
  { const L = new Function(src.slice(a, b) + '\nreturn { qeInferFrom, qeMemoInfo, qePlanFoot, qeDecide };')();
    const q2 = Q(2), d = L.qeDecide(q2, { started: true, cond: 1, condKnown: true, have: {} });
    ok(!(d.act === 'talk' && d.to === 'end'), 'QFROM quest 2 at cond 1: never the cond-less END event (the "start -> end" dry-run pass) — ' + d.act + ' ' + (d.npcs || []).join('/') + ' to ' + d.to);
    const M = L.qeMemoInfo(q2), tEnd = q2.transitions.find(t => t.to === 'end' && t.trigger.type === 'event' && !(t.from || []).length);
    ok(tEnd && L.qeInferFrom(tEnd, M).indexOf(M.maxStage) >= 0 && L.qeInferFrom(tEnd, M).indexOf(1) < 0, 'QFROM: a cond-less end event belongs to the leaf stage(s), never cond 1 (' + L.qeInferFrom(tEnd, M).join('/') + ')');
    const q237 = Q(237), d5 = L.qeDecide(q237, { started: true, cond: 5, condKnown: true, have: {} }), d6 = L.qeDecide(q237, { started: true, cond: 6, condKnown: true, have: {} });
    ok(d5.act === 'talk' && d5.to === 'end' && d6.act === 'talk' && d6.to === 'end' && JSON.stringify(L.qeMemoInfo(q237).leaves) === '[5,6]', 'QFROM 237: both branch stages (cond 5 / 6) are leaves where an end talk is allowed (which NPC ends which branch is not in the record: open data point)');
    ok(L.qeInferFrom({ to: 4, trigger: { type: 'event' } }, { stages: { 1: 1, 3: 1, 4: 1 }, maxStage: 4, maxMemo: 0 }).join() === '3' && L.qeInferFrom({ to: 3, trigger: { type: 'talk' } }, { stages: { 2: 1 }, maxStage: 3 }) === null, 'QFROM: a cond-less "to N" event = stage N-1; talks / unknown stages stay any-cond');
    const r362 = Q(362), st = { started: true, cond: 1, condKnown: true, have: {}, memo: 1 }, d1 = L.qeDecide(r362, st);
    ok(d1.act === 'talk' && d1.npcs[0] !== 30957, 'live 362 (memo): right after the start the engine goes on to the next NPC, not straight back to Swan 30957 (' + d1.npcs[0] + ')');
    const me = { x: 0, y: 0, z: 0 };
    ok(L.qePlanFoot(me, [{ x: 90000, y: 0, z: 0 }, { x: 6000, y: 0, z: 0 }], 8000) === 'foot', 'live 174: the target 6,000 away on my height = walk there, no .town + gatekeeper (12,000 adena)');
    ok(L.qePlanFoot(me, [{ x: 90000, y: 0, z: 0 }, { x: 30000, y: 0, z: 0 }], 8000) === 'trip' && L.qePlanFoot(me, [{ x: 900, y: 0, z: 0 }, { x: 5000, y: 0, z: 0 }], 8000) === 'route', 'far = the route with its start; standing on the route = walk it from here');
    ok(L.qePlanFoot(me, [{ x: 100, y: 0, z: 0 }, { do: 'floor', npc: {} }, { x: 3000, y: 0, z: -8000 }], 8000) !== 'foot', 'an NPC teleport / another floor on the way: never "just walk"');
    ok(/how === 'foot'/.test(src.slice(src.indexOf('async function qePlanWalk('), src.indexOf('async function qeStayInFront('))), 'qePlanWalk walks on foot when qePlanFoot says so');
    const hunt = src.slice(src.indexOf('async function qeDoHunt('), src.indexOf('async function qeDoSpawn('));
    ok(/another template than the quest/.test(hunt) && /ids\.has\(num\(mb\.Id\)\)/.test(src.slice(src.indexOf('function qeLiveMob('), src.indexOf('function qeLiveMob(') + 600)), 'live 291: a same-name monster of another template (Black Wolf 22232) is never attacked; the engine says why (the script counts only 20317)');
    const q384 = Q(384), d384 = L.qeDecide(q384, { started: true, cond: 1, condKnown: true, have: { 5964: 10 } });
    ok(d384.act !== 'turnin', '384: the 10-medal bingo start (a memo stage) is not taken as a finished exchange run');
  }

  // ---- J live phase B (coordinator 2026-10-27) ----
  console.log('J live phase B fixes');
  { const P = new Function(src.slice(a, b) + '\nreturn { qeHuntWant, qeHuntAlts, qeListInProgress };')();
    const q356 = Q(356), a356 = { items: [{ id: 5865, n: 20 }, { id: 5866, n: 20 }], cond: 1 };
    ok(JSON.stringify(P.qeHuntWant(q356, a356, [20558, 20562], { 5866: 50, 5865: 3 })) === '[20562]', 'live 356: Herbivorous complete -> only Spore Zombies (Carnivore 3/20), never more Rotting trees');
    ok(P.qeHuntWant(q356, a356, [20558, 20562], { 5866: 0, 5865: 0 }).length === 2, '356: both missing = both monsters');
    const step = { places: [{ mobs: [20317], area: { at: [1000, 1000, 0], name: 'A', alt: [{ at: [9000, 9000, 0], name: 'B' }] } }] };
    const al = P.qeHuntAlts({ monsters: [{ id: 20317, name: 'Black Wolf', clusters: [{ at: [20000, 0, 0], count: 7, place: 'C' }] }] }, [20317], step, { x: 1000, y: 1000 });
    ok(al.map(x => x.name).join('|') === 'B|Black Wolf (C)', 'live 291: the plan\'s other places, then the record\'s spawn clusters (' + al.map(x => x.name).join(' > ') + ')');
    ok(!P.qeHuntAlts({ monsters: [] }, [1], { places: [] }, { x: 0, y: 0 }).length, 'no other place known = none (the hunt stops with a why)');
    const hunt = src.slice(src.indexOf('async function qeDoHunt('), src.indexOf('async function qeDoSpawn('));
    ok(/qeLiveMob\(want\)/.test(hunt) && /now\(\) - lastValid > QE_CFG\.noTargetMs/.test(hunt) && /stopped instead of waiting/.test(hunt), 'qeDoHunt: targets = qeHuntWant; after noTargetMs without a target the next place; none left = stop with the why');
    ok(P.qeListInProgress([{ text: '[Bard\'s Mandolin (In Progress)]' }, { text: 'Quest' }], 'Bard\'s Mandolin') && !P.qeListInProgress([{ text: '[Bard\'s Mandolin]' }], 'Bard\'s Mandolin'), 'live 362: the quest list "(In Progress)" entry = the quest runs');
    const dlg = src.slice(src.indexOf('async function qeDialog('), src.indexOf('/** talk / turn-in / start: travel, dialog, judge progress.'));
    ok(/a\.kind === 'start' && qeListInProgress\(/.test(dlg) && /inProgress: true/.test(dlg), 'qeDialog: a START talk whose quest list shows "(In Progress)" is not started again');
    const done = src.slice(src.indexOf('function qeRunDone('), src.indexOf('async function qeRun('));
    ok(/srv = qeCondRead\(num\(q\.id\)\)\.started/.test(done) && /if \(srv !== true\) delete rec\.own/.test(done), 'qeRunDone: never deletes the own record of a quest the server still lists');
    const go = src.slice(src.indexOf('async function qeGoNpc('), src.indexOf('function qeBagCount('));
    ok(/pw\.walked && !pw\.ok\) return \{ ref: null, why: 'the plan route to /.test(go), 'live 165: a failed plan route never falls into the generic .town / gatekeeper travel (loop guard)');
    const pwk = src.slice(src.indexOf('async function qePlanWalk('), src.indexOf('async function qeStayInFront('));
    ok(/refused \(.*waiting until nobody fights/.test(pwk) && /retry after the fight/.test(pwk), 'live 165: a start refused by combat = wait the fight out, the SAME route once more');
    const run = src.slice(src.indexOf('async function qeRun('), src.indexOf('function qeStart('));
    ok(/Q\.routeFails\[k\] >= 2\) r = Object\.assign\(\{\}, r, \{ fatal: true/.test(run), 'the same step\'s plan route failing twice = stop (no more paid teleports)');
  }

  // ---- K live phase C (coordinator 2026-10-27) ----
  console.log('K live phase C fixes');
  { const K = new Function(src.slice(a, b) + '\nreturn { qeDecide, qeNeeds, qeKillNeedList, qeDefaultBatch, QE_NOQUEST };')();
    const q165 = Q(165);
    ok(JSON.stringify(K.qeDecide(q165, { started: true, cond: 1, condKnown: false, have: { 1160: 13 } })) === JSON.stringify({ act: 'advance', to: 2, key: 'adv1' }), 'live 165: 13/13 Dark Bezoar on a random kill stage (no needCounts) = stage 2 (own record), then the hand-in');
    ok(K.qeDecide(q165, { started: true, cond: 1, condKnown: false, have: { 1160: 12 } }).act === 'hunt', '165: 12/13 = hunt on');
    const n356 = K.qeNeeds(Q(356), 1, K.qeDefaultBatch(Q(356)));
    ok(n356.length === 2 && n356.every(x => x.n === 50), 'live 356: 50 spores each (the script\'s hasItemsAtLimit), not the turn-in batch 20 (' + n356.map(x => x.id + 'x' + x.n).join(', ') + ')');
    const q414 = Q(414), t414 = q414.transitions.map((t, i) => Object.assign({ i }, t)).find(t => t.trigger.type === 'kill' && (t.trigger.needCounts || []).some(x => x.id === 1580 && x.n === 9));
    ok(t414 && K.qeKillNeedList(q414, t414, 1).find(x => x.id === 1580).n === 10 && K.qeNeeds(q414, 1, K.qeDefaultBatch(q414)).find(x => x.id === 1580).n === 10, '414 (same pattern as 220 / 223 / 227 / 422): a kill stage stored as 9 (the count before the last kill, Java >= 9 / == 9) needs the full 10');
    const CF = require('./quest_count_fix.js'), j356 = fs.readFileSync(fs.readdirSync('C:/RainbowControl/l2/datapack_h5/dp/src/main/java/com/l2jserver/datapack/quests').filter(d => /^Q00356_/.test(d)).map(d => 'C:/RainbowControl/l2/datapack_h5/dp/src/main/java/com/l2jserver/datapack/quests/' + d + '/' + d + '.java')[0], 'utf8');
    const al = CF.atLimitItems(j356); ok(al[5865] && al[5866], 'quest_count_fix.atLimitItems reads hasItemsAtLimit(CARNIVORE_SPORE, HERBIVOROUS_SPORE) from the Java');
    ok(Q(356).drops.every(d => d.atLimit === true), 'the 356 record carries atLimit on both spores');
    ok(K.QE_NOQUEST.test('You are either not on a quest that involves this NPC, or you don\'t meet this NPC\'s minimum quest requirements.'), 'live 362: L2J\'s noquest page is recognised');
    const dot = src.slice(src.indexOf('async function qeDoTalk('), src.indexOf('// ---- hunting ----'));
    ok(/QE_NOQUEST\.test\(/.test(dot) && /api === true \|\| \(own && own\.started\) \|\| qeMemoInfo\(q\)\.uses/.test(dot) && /already running — going on/.test(dot), 'qeDoTalk: on a START that answers "not on a quest": started (server state / own record / memo quest) = go on with the next talk; else the exact refusal');
    const p291 = P(291), st = p291.steps.find(s => s.kind === 'hunt'), ov = p291.override.steps[st.key];
    ok(ov && ov.area && Math.hypot(ov.area.at[0] - 120230, ov.area.at[1] + 180579) < 100 && /not yet seen live/.test(ov.note), 'live 291: the plan hunts the Dwarven Village 20317 spawns (datapack; said: not yet seen live)');
    ok(Q(291).monsters.find(m => m.id === 20317).clusters.some(c => Math.hypot(c.at[0] - 119287, c.at[1] + 187185) < 100), '291: the south cluster is a fallback place (qeHuntAlts)');
  }

  // ---- L live phase D: kill / attack transitions without `from` (data; coordinator 2026-10-27) ----
  console.log('L phase D: kill stages carry their from (data)');
  { const q = Q(356), kt = q.transitions.filter(t => t.trigger.type === 'kill');
    ok(kt.find(t => t.to === 2) && JSON.stringify(kt.find(t => t.to === 2).from) === '[1]' && JSON.stringify(kt.find(t => t.to === 3).from) === '[1,2]', 'live 356: kill -> 2 from [1], kill -> 3 from [1, 2] (quest_from_fix: no cond guard in onKill = forward only)');
    const Ld = new Function(src.slice(a, b) + '\nreturn { qeDecide };')();
    const d3 = Ld.qeDecide(q, { started: true, cond: 3, condKnown: false, have: { 5865: 50, 5866: 50 } });
    ok(!(d3.act === 'advance' && d3.to === 2), '356 at stage 3 with 50 + 50: never "advance" back to 2 (' + d3.act + ')');
    const FF = require('./quest_from_fix.js');
    ok([...FF.guards('onKill(){ if (qs.isCond(2)) { qs.setCond(3); } }', 3)].join() === '2' && FF.guards('onKill(){ qs.setCond(4); }', 4).size === 0, 'quest_from_fix.guards: the cond test before setCond(N) = from; none = forward only');
    const fs2 = require('fs'), left = fs2.readdirSync(path.join(DATA, 'quests')).filter(f => /^\d+\.json$/.test(f)).filter(f => (JSON.parse(fs2.readFileSync(path.join(DATA, 'quests', f), 'utf8')).transitions || []).some(t => !t.start && t.trigger && /^(kill|attack)$/.test(t.trigger.type) && typeof t.to === 'number' && !(t.from || []).length && !(t.fromMemo || []).length && t.to > 1));
    ok(!left.length, 'no record has a kill / attack transition to a stage > 1 without from or fromMemo (' + left.slice(0, 8).join(', ') + ')');
    const ed = fs2.readFileSync(path.join(__dirname, 'quest_engine_data.js'), 'utf8'); ok(/quest_from_fix\.js/.test(ed), 'quest_engine_data.js re-applies quest_from_fix after a regeneration');
  }

  // ---- H the dry run mirrors the engine ----
  console.log('H dry-run mirror (no geodata)');
  { const D = require('./quest_dryrun.js'), JAVA = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'Logs', 'quest_java_src.json'), 'utf8')).src; } catch (e) { return ''; } })();
    if (!JAVA || !fs.existsSync(JAVA)) ok(true, '(skipped: no Java source, Logs/quest_java_src.json)');
    else {
      const v = (id) => D.verifyOne(id, { src: JAVA, noGeo: true }), codes = (r) => r.fails.map(f => f.code);
      const r116 = v(116); ok(!codes(r116).length, '116 (memo) passes the no-geo dry run: ' + (codes(r116).join(',') || 'PASS'));
      const r21 = v(21); ok(!codes(r21).includes('engine-gap:npcAt-spawner') && r21.warns.some(w => w.code === 'npc-by-trigger'), '21: the spawned ghost is no engine gap any more (trigger: the Tombstone)');
      const r16 = v(16); ok(!codes(r16).some(c => /plan-stage-unknown|script-flow/.test(c)), '16: setCond(cond + 1) behind fall-through case labels is read');
      const r158 = v(158); ok(!codes(r158).some(c => /^engine-gap/.test(c)), '158: the atlas start is read (no engine gap)');
      const r310 = v(310); ok(!codes(r310).includes('hunt-too-long'), '310: ~740 kills fit the plan-based hunt rounds');
      const r423 = v(423); ok(codes(r423).includes('engine-manual'), '423: the memo-aware flow no longer "passes" by skipping to the end (honest engine-manual: the target only appears through the script)');
      { const c611 = codes(v(611)); ok(c611.includes('stage-cycle'), '611: a stage cycle through from-less transitions = dryrun:stage-cycle'); }
      { const r356 = v(356); ok(!codes(r356).includes('stage-cycle'), '356: no stage cycle after the from fix (dry run)'); }
      const r402 = v(402); ok(!codes(r402).some(c => /^engine-gap:(forMobs|start)/.test(c)), '402: forMobs + atlas start are read');
    }
  }
  { // ADVLOOP-2026-10-27 (live 356: cond 2 <-> 3 with no await killed a brain worker 3x)
    const i = src.indexOf("if (a.act === 'advance') {"), blk = i > 0 ? src.slice(i, i + 900) : '';
    ok(/await sleep\(300\); continue;/.test(blk), 'ADVLOOP: a stage advance always yields (never a tight loop)');
    ok(/advSeen\[to \+ '>' \+ from\]/.test(blk) && /advSeen\[k\] > 2/.test(blk) && /to === from/.test(blk) && /stage loop:/.test(blk) && /result = 'failed'/.test(blk), 'ADVLOOP: going back to a stage advanced from, a repeated advance or a no-op advance stops the run with "stage loop"');
    ok(/for \(const k in advSeen\) delete advSeen\[k\];/.test(src), 'ADVLOOP: a repeat round starts with a clean advance record');
  }
  console.log(`\n${fails ? 'FAILED' : 'ALL OK'}: ${oks} ok, ${fails} failed`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('  FAIL error ' + (e && e.stack || e)); process.exit(1); });
