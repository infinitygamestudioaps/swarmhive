// OFFLINE TEST: the rest of the tester reports of 2026-11-18..22 (v1.14.7), N01..N21.
// Never touches the game, MCP or live data.   node docs/plan/tools/test_tester_1122b.js
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const rd = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const SRC = rd('Scripts_dev', 'swarm.js'), HOST = rd('Dashboard', 'brain_host', 'host.js'), AG = rd('Scripts_dev', 'agent2.js');
let pass = 0, fails = 0;
const t = (name, ok, x) => { if (ok) { pass++; } else { fails++; console.log('  FAIL ' + name + (x === undefined ? '' : ' ' + JSON.stringify(x))); } };
const cut = (a, b) => { const i = SRC.indexOf(a), j = SRC.indexOf(b, i); if (i < 0 || j < 0) throw new Error('block not found: ' + a); return SRC.slice(i, j); };
const fn = (name) => { const i = SRC.search(new RegExp('^(async )?function ' + name + '\\(', 'm')); if (i < 0) throw new Error('no function ' + name); const j = SRC.slice(i + 10).search(/^\}/m); const one = SRC.slice(i, SRC.indexOf('\n', i)); return /\}\s*(\/\/.*)?$/.test(one) ? one : SRC.slice(i, i + 10 + j + 1); };

// ---- N01 XFERBRAIN: the hidden trade is callable in the brain (both halves), a refusal goes to the window at once, a timeout never gives twice
t('XFERBRAIN: host.js and agent2.js both know TransferItems', /TransferItems: \(target, items\) => promiseCall\('TransferItems', \[target, items\]/.test(HOST) && /TransferItems: \(target, items\) => TransferItems\(target, items\)/.test(AG));
t('XFERBRAIN: a refused promise = the normal window; "timed out" waits for the bag', /if \(!\/timed out\/i\.test\(why\) && !movedAny\(\)\) \{ XFER\.badUntil = now\(\) \+ 30 \* 60000;[^\n]*return null; \}/.test(fn('xferGive')));
// XFEREND (live find 2026-11-22): the giver's end reaches a receiver without an account id; a finished session leaves no "done" for the giver's next trade
{ let H = null; const run = (st, XFER, d) => { const i = SRC.indexOf("App.on('swarm.trade.end'"), j = SRC.indexOf('\n});', i) + 4; new Function('App', 'now', 'tradeEndedToks', 'tradeState', 'XFER', 'Me', 'tradeLog', SRC.slice(i, j))({ on: (n, f) => { H = f; } }, () => 1e6, {}, st, XFER, { Name: 'L' }, () => { }); H({ data: d }); return st; };
  const e = { giver: 'G', tok: 'G:1', ok: true, xfer: true, receiver: 'L' }, X = () => ({ doneFrom: {} });
  t('XFEREND: my waiting session with that giver ends at once, also when its start was seen', run({ role: 'take', other: 'G' }, X(), e).done === 'xfer' && run({ role: 'take', other: 'G', started: true }, X(), e).done === 'xfer');
  let x = X(); run({ role: 'take', other: 'G' }, x, e); t('XFEREND: no leftover "done" for the next trade', !x.doneFrom.G); x = X(); x.tookAt = { G: 1e6 - 2000 }; run(null, x, e); t('XFEREND: nor right after a finished session', !x.doneFrom.G); x = X(); run(null, x, e); t('XFEREND: an end before my session started is remembered', !!x.doneFrom.G);
  t('XFEREND: somebody else\'s trade is ignored', !run({ role: 'take', other: 'G' }, X(), Object.assign({}, e, { receiver: 'Other' })).done); }
// ---- N02 WHKIND
{ const set = []; const run = (kind, done, why) => { set.length = 0; const f = new Function('STASH', 'stashDest', 'fullSysKind', 'whFullSet', 'num', fn('fullSys') + '\nreturn fullSys;')({ busy: true, kind }, () => 'private', () => 'wh', (...a) => set.push(a), Number); f(130, 'full'); return set[0][0]; };
  t('WHKIND: a clan deposit answered "full" is the CLAN warehouse (the setting says private)', run('clan') === 'clan' && run('private') === 'private');
  t('WHKIND: every deposit tells its kind and clears the flag when something went in', /STASH\.kind = kind;/.test(fn('stashDepositAt')) && /res\.done\.length && res\.why !== 'warehouse full'\) whFullSet\(kind, false/.test(fn('stashDepositAt')));
  t('WHKIND: the page drops records older than 24 h', /w\.private\[n\]\.full && Date\.now\(\) - \(Date\.parse\(w\.private\[n\]\.at/.test(rd('Dashboard', 'server.js'))); }
// ---- N04 DAWNWALK
{ const T = 1e12, run = (rec) => new Function('File', 'ssFile', 'now', fn('ssRead') + '\nreturn ssRead;')({ ReadAllText: () => JSON.stringify(rec) }, () => '', () => T)('x');
  t('DAWNWALK: three failed tries close 6 h, not the week', run({ v: 2, status: 'failed', tries: 3, at: T - 7 * 3600e3 }).tries === 1 && run({ v: 2, status: 'failed', tries: 3, at: T - 3600e3 }).tries === 3 && run({ v: 2, status: 'dusk', tries: 3, at: 1 }).tries === 3);
  t('DAWNWALK: by the streets, as an errand, with the plain walk as the fallback', /errandStart\('dawn'/.test(fn('dawnWalk')) && /townWalkToNpc\(/.test(fn('dawnWalk')) && /errandEnd\('dawn'\)/.test(fn('dawnWalk')) && /await dawnWalk\(p\)/.test(fn('dawnSignUp')));
  t('DAWNWALK: the page and the bot count the same tries', /tries: c\.tries \|\| 0/.test(rd('Dashboard', 'index.html')) && !/maxTries: 99/.test(rd('Dashboard', 'index.html')));
  const D = JSON.parse(rd('Scripts', 'data', 'slim', 'dawn_priests.json').replace(/^﻿/, '')).filter(n => (n.roles || []).includes('priest of dawn'));
  const dir = path.join(ROOT, 'Scripts', 'data', 'town_graph'), keys = new Set(); fs.readdirSync(dir).filter(f => /\.json$/.test(f)).forEach(f => { const o = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8').replace(/^﻿/, '')); Object.keys((o && o.npcs) || {}).forEach(k => keys.add(k)); });
  const miss = D.filter(n => n.place && n.place.town && !keys.has(`${n.id}@${n.x},${n.y}`)).map(n => n.place.town); t('DAWNWALK: every town street graph knows its Priest of Dawn', D.length >= 10 && !miss.length, miss); }
// ---- N05 SPOTLAND + PLANREACH
{ const H = JSON.parse(rd('Scripts', 'data', 'hunting_spots_h5.json').replace(/^﻿/, '')), TP = JSON.parse(rd('Scripts', 'data', 'teleports_h5.json').replace(/^﻿/, ''));
  const off = H.filter(s => s.gk && String(s.gk.desc || '').includes('->')).map(s => { const e = TP.find(x => String(x.desc || '').trim() === String(s.gk.desc).trim()); return { n: s.name, d: e ? Math.hypot(s.center.x - e.x, s.center.y - e.y) : 1e9 }; }).filter(o => o.d > 24500);
  t('SPOTLAND: Kamael, Dragonspine and Fortress of Resistance have a landing within the walk limit', !off.some(o => /^Kamael|Dragonspine|Fortress of Resistance/.test(o.n)), off.map(o => o.n));
  t('SPOTLAND: at most 28 datapack spots have no landing in reach (catacombs without an entry, islands)', off.length <= 28, off.length);
  const C = new Function(cut('// CHOICEONLY-PURE-BEGIN', '// CHOICEONLY-PURE-END') + '\nreturn choiceOnlyHold;')();
  const nw = { kind: 'fallback-auto', detail: 'could not get there (REFUSED: Soul Isle Harbor -> The Town of Gludio lands 122.0k from Kamael (Lv12-14) — more than the 24.5k walk limit)' };
  t('PLANREACH: a plan step whose place can never be reached goes to the automatic spot', C({}, { mode: 'manual', by: 'plan' }, nw, 1) === null);
  t('PLANREACH: your own choice, "stay" and every other failure still wait', typeof C({}, { mode: 'manual' }, nw, 1) === 'string' && typeof C({}, { mode: 'manual', by: 'plan', stay: true }, nw, 1) === 'string' && typeof C({}, { mode: 'manual', by: 'plan' }, { kind: 'fallback-auto', detail: 'could not get there (stuck)' }, 1) === 'string');
  t('PLANREACH: tried again after 12 h, not every 5 min', /waitMs = never \? 12 \* 3600000 : 300000/.test(fn('manualSpotOnTravel'))); }
// ---- N06 PLANREOPEN
{ const R = new Function(cut('// PARTYPLAN-PURE-BEGIN', '// PARTYPLAN-PURE-END') + '\nreturn planReopen;')();
  const S = [{ id: 'a1', kind: 'level', to: 30 }, { id: 'q1', kind: 'quest' }, { id: 'b1', kind: 'level', to: 38 }, { id: 'c1', kind: 'level', to: 40 }], D = { a1: { result: 'level 30 reached' }, q1: { result: 'done' }, b1: { result: 'level 38 reached' } };
  t('PLANREOPEN: a group at 25 goes back to "until 30" (quests stay done)', R(S, D, 3, [25, 25, 26, 40]).join() === 'a1,b1');
  t('PLANREOPEN: one late joiner never pulls the group back; level 39 goes on', !R(S, D, 3, [25, 39, 39, 39]).length && !R(S, D, 3, [39, 39]).length && !R(S, D, 3, []).length);
  t('PLANREOPEN: a step you skipped stays skipped', R(S, Object.assign({}, D, { a1: { result: 'skipped by you', skipped: true } }), 3, [25, 25]).join() === 'b1');
  t('PLANREOPEN: academy plans only, most of the group must be here', /plan\.steps\.some\(s => s\.kind === 'academy'\)/.test(fn('planReopenNow')) && /levels\.length \* 2 < teamNames\(\)\.length \+ 1\) return false/.test(fn('planReopenNow'))); }
// ---- N03 / N08 / N09 runner
{ const B = new Function('fundCollectorName', fn('crunBankTo') + '\nreturn crunBankTo;')(() => 'Collector');
  t('RUNNERBANK: the bank, else the collector; adena only to the bank', B({ bank: 'Bank' }).name === 'Bank' && B({ bank: 'Bank' }).bank === true && B({ bank: '' }).name === 'Collector' && B({ bank: '' }).bank === false && /give = B\.bank \? Math\.max\(0, itemCount\(57\) - keepAdena\) : 0/.test(fn('crunServe')));
  const cs = fn('crunServe');
  t('RUNNERREACH: a walk that did not arrive is never announced as "here"', cs.indexOf("could not reach ${c.party}") > 0 && cs.indexOf('off > RUNNER_REACH') < cs.indexOf("App.emit('swarm.runner.here'"));
  t('RUNNERREACH: a party never runs to a runner more than 4000 away (a far meeting excepted)', /if \(!d\.meet && isFinite\(d\.x\) && Math\.hypot\(num\(d\.x\) - Me\.X, num\(d\.y\) - Me\.Y\) > 4000\)/.test(SRC));
  t('RUNNERPAGE: a call counts as a visit, "Switch rotation ON / OFF", no "due" while it is OFF', /crotMark\(c\.party\);/.test(cs) && /Switch rotation OFF' : 'Switch rotation ON'/.test(rd('Dashboard', 'runnerpage.js')) && /rotation is OFF/.test(rd('Dashboard', 'runnerpage.js'))); }
// ---- N10 SUBPLAN (the block is text-synced: test_class_plans.js)
{ const CL = require(path.join(ROOT, 'Dashboard', 'classlogic.js')), TREE = JSON.parse(rd('Scripts', 'data', 'class_tree.json').replace(/^﻿/, ''));
  const sub = Object.values(TREE.classes).find(c => c.subclassOnly), d = (plans, cls) => CL.cpDecide(TREE, plans, { name: 'X', party: 'P', classId: cls, level: 60 }).status;
  t('SUBPLAN: an Inspector needs no main-class plan (no warning); a main class without a plan still warns', d({ parties: {} }, sub.id) === 'done' && d({ parties: {} }, 10) === 'missing' && d({ parties: { P: { members: { X: { plan: [15, 16, 97], approved: true } } } } }, sub.id) === 'done'); }
// ---- N11 BOOSTATTR
{ const A = new Function(cut('// BOOSTATTR-PURE-BEGIN', '// BOOSTATTR-PURE-END') + '\nreturn { boostStoneInfo, boostAttrOf, boostAttrCap };')();
  t('BOOSTATTR: the stones by id (9546 Fire stone ... 9569 Holy energy)', A.boostStoneInfo(9546).el === 'Fire' && A.boostStoneInfo(9548).el === 'Earth' && A.boostStoneInfo(9550).el === 'Unholy' && A.boostStoneInfo(9557).el === 'Holy' && A.boostStoneInfo(9557).crystal && A.boostStoneInfo(9570) === null);
  t('BOOSTATTR: armor shows the defence against the opposite element', A.boostAttrOf({ type: 'Armor', DefAttWater: 24, DefAttFire: 0 }, 9546) === 24 && A.boostAttrOf({ type: 'Weapon', AttackElementVal: 90 }, 9546) === 90 && A.boostAttrOf({ type: 'EtcItem' }, 9546) === -1);
  t('BOOSTATTR: never past the stone\'s limit', A.boostAttrCap({ type: 'Armor' }, 9546, 300) === 60 && A.boostAttrCap({ type: 'Armor' }, 9552, 300) === 120 && A.boostAttrCap({ type: 'Weapon' }, 9546, 300) === 150 && A.boostAttrCap({ type: 'Weapon' }, 9552, 90) === 90);
  t('BOOSTATTR: the value is asked from the agent; unreadable = nothing used; 10 stones without any change = stop', /__itemAttr: \(objId\) => promiseCall\('ItemAttr'/.test(HOST) && /ItemAttr: \(id\) =>/.test(AG) && /row === false\) \{ BOOST\.why = [^\n]*nothing used/.test(fn('boostAttrRun')) && /!BOOST\.ok && BOOST\.fail >= 10/.test(fn('boostAttrRun')));
  t('BOOSTATTR: the page lists weapons + armor and the stones by id', /Weapon\|Armor/.test(rd('Dashboard', 'boostpage.js')) && /Number\(b\.id\) >= 9546 && Number\(b\.id\) <= 9569/.test(rd('Dashboard', 'boostpage.js'))); }
// ---- N13 TWOCRAFTERS / CRAFTALIVE / SUPSTUCK2
{ const P = new Function(cut('// CRAFT-PURE-BEGIN', '// CRAFT-PURE-END') + '\nreturn { craftCraftersFor, craftCrafterFor };')();
  const J = { crafters: { B: { on: true, parties: ['L'] }, A: { on: true, parties: ['*'] }, C: { on: false, parties: ['*'] }, L: { on: true, parties: ['*'] } } };
  t('TWOCRAFTERS: every crafter of the party, the first one unchanged', P.craftCraftersFor(J, 'L').join() === 'A,B' && P.craftCrafterFor(J, 'L') === 'A');
  t('TWOCRAFTERS: the supply step asks them one after the other', /for \(const crafter of craftCraftersFor\(/.test(fn('crafterSupplyStep')));
  t('CRAFTALIVE: the status is written while it crafts and waits for MP', (fn('craftTick').match(/alive\(\)/g) || []).length >= 2);
  t('SUPSTUCK2: shots our crafter makes are tried again after 2 h', /craftSkipMs: 2 \* 3600000/.test(SRC) && /r\.e\.until = t \+ SUPSTUCK\.craftSkipMs/.test(SRC)); }
// ---- N18 AMMOSHARE
{ const T = new Function(cut('const SUPPLY_NO_TRIGGER', '// SUPSTUCK-2026-11-13') + '\nreturn supplyTriggers;')();
  t('AMMOSHARE: Shining arrows are asked for, never start a run and are never bought', /if \(am \/\* AMMOSHARE/.test(SRC) && !T({ id: 1345, have: 0, need: 500 }) && !T({ id: 9637, have: 0, need: 500 }) && T({ id: 1344, have: 0, need: 500 }) && /!\(ammoIdSet\(OWNTYPE\.ammo\)\.has\(num\(b\.id\)\) && !OWNTYPE\.helvetia\.includes\(num\(b\.id\)\)\)/.test(SRC)); }
// ---- N14 WPLAST / N17 ROUTENEAR2 + TOWNEXIT2
t('WPLAST: after the waypoints only the LAST waypoint is walked on to, never the zone centre', /WPLAST-2026-11-22[\s\S]{0,700}leadRouteWalk\(wp\.slice\(-2\)/.test(SRC));
t('TOWNEXIT2: the town exit walk runs without the route id and gives it back', /memberRoute\.id = null;[^\n]*TOWNEXIT2[^\n]*\n\s*rgWalk\(tx\.TD, tx\.pt[^\n]*memberRoute\.id != null[^\n]*\n[^\n]*\n\s*\.finally\(\(\) => \{ if \(memberRoute\.id == null && Array\.isArray\(m\.pts\)\) memberRoute\.id = id;/.test(SRC));
// RUNGO (live find 2026-11-22): a respawning place on a leg never holds the team for minutes
{ const M = new Function(cut('// MOVETOGETHER-PURE-BEGIN', '// MOVETOGETHER-PURE-END') + '\nreturn { MT, mtRunGo };')(), B = { now: 1e6, act: 'pace', waiting: 1, legSince: 1e6 - 41000, runUntil: 0 };
  t('RUNGO: 40 s on one leg waiting for a member = run on for 20 s; not earlier, not while it goes, not with somebody very low', M.mtRunGo(B) && !M.mtRunGo(Object.assign({}, B, { legSince: 1e6 - 20000 })) && !M.mtRunGo(Object.assign({}, B, { act: 'go' })) && !M.mtRunGo(Object.assign({}, B, { crit: true })) && M.MT.runGoMs === 20000);
  t('RUNGO: again only 20 s after the last run', !M.mtRunGo(Object.assign({}, B, { runUntil: 1e6 - 5000 })) && !M.mtRunGo(Object.assign({}, B, { runUntil: 1e6 + 5000 })) && M.mtRunGo(Object.assign({}, B, { runUntil: 1e6 - 21000 })));
  const R = (m, hp) => new Function('memberRoute', 'Me', 'isLeader', 'now', 'MT', fn('mtRunNow') + '\nreturn mtRunNow();')(m, { HpPercent: hp }, () => false, () => 1000, { critHp: 20 });
  t('RUNGO: a member runs while told; a fight hold, the end of the time and under 20 % HP win', R({ id: 1, mt: true, run: 2000 }, 90) && !R({ id: 1, mt: true, run: 2000, hold: 1500 }, 90) && !R({ id: 1, mt: true, run: 900 }, 90) && !R({ id: 1, mt: true, run: 2000 }, 12) && !R({ id: 0, mt: true, run: 2000 }, 90));
  t('RUNGO: it walks although it is hit, nobody assists / defends meanwhile', /!runNow && \(IsInCombat \|\| \(bfStanceLive\(\)/.test(SRC) && /mtRunNow\(\)\) return 'team route walk: running on'/.test(fn('assistBlocked')) && /mtRunNow\(\)\) return true;/.test(fn('mtRunOn'))); }
// LBFIGHT (live find 2026-11-22: a healer alone under an archer's arrows stood 15 min, its leader waited in Giran)
{ const E = new Function(cut('// LBFIGHT-PURE-BEGIN', '// LBFIGHT-PURE-END') + '\nreturn lbEscapeNow;')();
  t('LBFIGHT: a healer / caster leaves the fight after 6 s, a fighter after 20 s, anybody below 60 %', E({ hp: 100, ms: 7000, passive: true }) && !E({ hp: 100, ms: 7000, passive: false }) && E({ hp: 100, ms: 21000, passive: false }) && E({ hp: 50, ms: 0, passive: false }));
  t('LBFIGHT: every left-behind way uses it (no passive wait for the hits to stop)', (SRC.match(/await lbOutOfFight\(\);/g) || []).length === 3 && !/t0 < 60000 && now\(\) - lastAttackerOnMe\.at < 6000/.test(SRC));
  t('LBFIGHT: an archer that hits every 10-15 s counts as an attack (20 s window, not 6)', /const LB_HIT_MS = 20000;/.test(SRC) && /now\(\) - lastAttackerOnMe\.at < LB_HIT_MS/.test(fn('lbOutOfFight')) && !/at < 6000/.test(fn('lbOutOfFight')));
  const RD = new Function(cut('// LBFIGHT-PURE-BEGIN', '// LBFIGHT-PURE-END') + '\nreturn lbRefusedByDamage;')();
  t('LBFIGHT: .town refused under damage (archer or drowning) = the escape at once', RD('#2262 X has received 90 damage from Pit Archer.', 1e9) && RD('#297 You have taken 39 damage because you were unable to breathe.', 1e9) && RD('', 4000) && !RD('#46 You use Vitalize [lvl 6].', 1e9) && /lbRefusedByDamage\(/.test(SRC.slice(SRC.indexOf('left behind: joining ${CONFIG.leader}'), SRC.indexOf('left behind: joining ${CONFIG.leader}') + 800)));
  t('SEEHIT2: a monster that hit me is in sight at bow range', /d <= 1200 && Math\.abs\(z - Me\.Z\) < 400 && c\.objId !== undefined/.test(fn('canSee')));
  t('LBFIGHT: a lone healer goes straight to the escape', /if \(passive && !inRaid\(\) && !inst\.on && !ESC\.on\) await escapeFight\(/.test(fn('lbOutOfFight')));
  const DI = rd('docs', 'plan', 'tools', 'deploy_when_idle.ps1'), DS = rd('docs', 'plan', 'tools', 'deploy_swarm.ps1');
  t('DEPLOYNOPAUSE: the idle deploy never pauses a party; a broken gate ends it at once', !/hive_pause/.test(DI) && /requirements_check\.js/.test(DI) && /exit 7/.test(DI) && /gate_ok\.json/.test(DS)); }
// TEAMLEVEL (live find 2026-11-22: a level 64 still in another party's in-game party hunted at 82-83, 3 deaths)
{ const run = (me, list) => new Function('num', 'Me', 'PartyList', 'CONFIG', 'teamOf', fn('teamMinLevel') + '\nreturn teamMinLevel();')(Number, me, list, { roster: { A: 1, B: 1, C: 1 } }, (n) => (n === 'A' ? 'T1' : 'T2'));
  t('TEAMLEVEL: the in-game party of another team never decides my hunting level', run({ Name: 'A', Level: 64 }, [{ Name: 'B', Level: 78 }, { Name: 'C', Level: 78 }]) === 64 && run({ Name: 'B', Level: 78 }, [{ Name: 'C', Level: 74 }, { Name: 'A', Level: 64 }]) === 74); }
// DEATHSTOP (live find 2026-11-22: 3 wipes of one duo in an hour in a chosen room next to a living raid boss)
{ const H = new Function(cut('// CHOICEONLY-PURE-BEGIN', '// CHOICEONLY-PURE-END') + '\nreturn deathStopHold;')(), h = { until: 5000, sig: 'a', seq: 3, name: 'X' };
  t('DEATHSTOP: waits until the hour is over, your order or another choice', !!H(h, { now: 1000, sig: 'a', seq: 3 }) && !H(h, { now: 6000, sig: 'a', seq: 3 }) && !H(h, { now: 1000, sig: 'b', seq: 3 }) && !H(h, { now: 1000, sig: 'a', seq: 4 }) && !H(null, { now: 1, sig: '', seq: 0 }));
  // AUTODEATH-2026-11-25: the count moved into autoDeathCount (each case ends with return, so the chosen-spot case starts with "if")
  t('DEATHSTOP: chosen spots only count their own deaths; no other spot is taken meanwhile', /\n  if \(sp && sp\.manual\) \{\s*const k = 'manual:'/.test(SRC) && /if \(sp && !sp\.manual\) \{[\s\S]*?\n    return;\n  \}/.test(SRC) && SRC.indexOf('deathStopHold(DEATHSTOP.hold') < SRC.indexOf('if (!resumedSpot) hold = choiceOnlyHold(')); }
// DEATHSTOP banner (owner 2026-11-22: "announce it with a banner that can be resolved manually")
{ const os = require('os'), A = require(path.join(ROOT, 'Dashboard', 'deathstop_api.js')), P = new Function(cut('// CHOICEONLY-PURE-BEGIN', '// CHOICEONLY-PURE-END') + '\nreturn { deathStopHold, deathStopResume };')();
  const h = { until: 5000, sig: 'a', seq: 3, name: 'X', at: 1000 }, J = { leader: 'Aa', hold: h, deaths: [1, 2, 3], ended: null };
  t('DEATHSTOP: Resolve ends the wait', P.deathStopHold(h, { now: 1000, sig: 'a', seq: 3 }) !== '' && P.deathStopHold(h, { now: 1000, sig: 'a', seq: 3, ack: true }) === '');
  t('DEATHSTOP: a restart goes on waiting (not after the hour, not with another spot, not when it was over)', P.deathStopResume(J, { now: 2000, sig: 'a', seq: 9 }).seq === 9 && !P.deathStopResume(J, { now: 6000, sig: 'a', seq: 9 })
    && !P.deathStopResume(J, { now: 2000, sig: 'b', seq: 9 }) && !P.deathStopResume(Object.assign({}, J, { ended: { at: 1 } }), { now: 2000, sig: 'a', seq: 9 }) && !P.deathStopResume(null, { now: 1 }));
  const D = fs.mkdtempSync(path.join(os.tmpdir(), 'deathstop-')); fs.writeFileSync(path.join(D, 'deathstop_Aa.json'), JSON.stringify(J));
  const r1 = A.rows(D, 2000), r2 = A.rows(D, 9000), bad = A.resolve(D, '../x', 2000), none = A.resolve(D, 'Bb', 2000), ok = A.resolve(D, 'Aa', 2000), ack = JSON.parse(fs.readFileSync(path.join(D, 'deathstop_ack_Aa.json'), 'utf8'));
  t('DEATHSTOP: the banner shows party, spot, deaths; it stays after the hour until Resolve', r1.length === 1 && r1[0].leader === 'Aa' && r1[0].spot === 'X' && r1[0].deaths.length === 3 && r1[0].waiting === true && r2.length === 1 && r2[0].waiting === false);
  t('DEATHSTOP: Resolve hides exactly this one; a new one shows again; bad names refused', ok.ok && !ok.rows.length && ack.of === 1000 && bad.code === 400 && none.code === 404);
  fs.writeFileSync(path.join(D, 'deathstop_Aa.json'), JSON.stringify(Object.assign({}, J, { hold: Object.assign({}, h, { at: 1500 }) }))); t('DEATHSTOP: the next 3 deaths raise it again', A.rows(D, 2000).length === 1);
  fs.rmSync(D, { recursive: true, force: true });
  const IX = rd('Dashboard', 'index.html'), SV = rd('Dashboard', 'server.js'), DJ = rd('Dashboard', 'deathstop.js');
  t('DEATHSTOP: banner on every page, with a Resolve button, fed by /api/state', /id="deathStopBar"/.test(IX) && /DeathStop\.paint\(STATE\.deathStops\)/.test(IX) && /src="\/deathstop\.js"/.test(IX) && /deathStops: /.test(SV) && /require\('\.\/deathstop_api'\)\.handle/.test(SV) && /data-dsresolve/.test(DJ) && !/\balert\(|\bconfirm\(/.test(DJ));
  t('DEATHSTOP: the leader writes the record, reads Resolve and says why the wait ended', /deathStopWrite\(DEATHSTOP\.hold, D\[k\], ''\)/.test(SRC) && /deathStopAck\(DEATHSTOP\.hold\)/.test(SRC) && /'you resolved it'/.test(SRC) && /deathStopBoot\(sig\);/.test(SRC)); }
// RAIDNEVER (owner 2026-11-22: "just dont attack ANY raidboss or minions while hunting ... All raid monsters and minions has a special title"; the server overwrites the title)
{ const P = new Function(cut('// RAIDNEVER-PURE-BEGIN', '// RAIDNEVER-PURE-END') + '\nreturn { raidNpcId, raidNeverNow };')(), N = JSON.parse(rd('Scripts', 'data', 'npcs_h5.json').replace(/^﻿/, ''));
  const want = Object.keys(N).filter(k => /\braid\b|^(Lord|Follower) of Destruction$/i.test(String(N[k].t || ''))), got = Object.keys(N).filter(k => P.raidNpcId(k));
  t('RAIDNEVER: exactly the monsters with a raid title in the datapack (boss + minions)', want.length > 600 && want.join() === got.join(), [want.length, got.length, want.filter(k => !got.includes(k)).slice(0, 5), got.filter(k => !want.includes(k)).slice(0, 5)]);
  t('RAIDNEVER: Archon / Kusion / Gustos Suscepter yes; Ossiud, Perum and no id no', [25395, 25396, 25397].every(P.raidNpcId) && !P.raidNpcId(0) && !P.raidNpcId(undefined) && !Object.keys(N).filter(k => /^(Ossiud|Perum|Torfe)$/.test(N[k].n)).some(P.raidNpcId));
  const o = (x) => P.raidNeverNow(Object.assign({ raid: true }, x));
  t('RAIDNEVER: never while hunting; a raid, its mission, its own boss + minions, an instance and a quest still may', o({}) && !P.raidNeverNow({}) && !['inRaid', 'mission', 'inst', 'quest', 'missionBoss', 'missionMinion'].some(k => o({ [k]: true })));
  // the real function with the live title "LvL: 44"
  const S = new Function('num', 'now', 'state', 'inRaid', 'inst', 'inKamaInstance', 'questRun', 'missionBoss', 'isMissionBoss', 'minionNames', 'ownMinionName',
    cut('const raidTitled = ', '// RAIDNEVER-2026-11-22') + cut('// RAIDNEVER-PURE-BEGIN', '/** a raid boss / minion we must not hit stands') + '\nreturn raidTitledOutsideRaid;');
  const mk = (st, raid, mb) => S(Number, () => 1000, st, () => raid, { on: false }, () => false, { active: false }, mb || { name: '', until: 0 }, (n) => !!mb && mb.name === n, () => ['Gustos Suscepter'], () => false);
  const g = { Id: 25397, Name: 'Gustos Suscepter', Title: 'LvL: 44' };
  t('RAIDNEVER: the live title "LvL: 44" does not hide it', mk({ mode: 'autolevel' }, false)(g) === true && mk({ mode: 'raid' }, true)(g) === false && mk({ mode: 'autolevel' }, false)({ Id: 20834, Name: 'Ossiud', Title: 'LvL: 47 A' }) === false && mk({ mode: 'idle' }, false, { name: 'Archon Suscepter', until: 5000 })(g) === false && mk({ mode: 'idle' }, false, { name: 'Archon Suscepter', until: 500 })(g) === true);
  t('RAIDNEVER: no path attacks it: target choice, help, self-defence, hit, skill, engage, caster, area skills', /const ignoredMobHard = [^\n]*raidTitledOutsideRaid\(m\)/.test(SRC) && /function srvAttack\(id\)[^\n]*raidNeverRefuse\(m, 'attack'\)/.test(SRC) && /async function castOn\([\s\S]{0,400}raidNeverRefuse/.test(SRC)
    && /raidNeverRefuse\(t, 'attack'\)/.test(fn('engage')) && /raidTitledOutsideRaid\(cm\)\) cur = null/.test(fn('casterTarget')) && /raidNearNow\(/.test(fn('aoeMinNow')) && /noAoe: raidNearNow\(/.test(SRC) && /c\.noAoe \? false/.test(fn('castPick')));
  t('RAIDNEVER: it still counts as a danger (escape, resurrection)', ['escAttackers', 'dangerMobs', 'resFoesAt'].every(n => /ignoredMob\(m\) && !raidTitledOutsideRaid\(m\)/.test(fn(n)))); }
// ---- N15 MOVEHELD / PMOVEBOOT
{ const PM = require(path.join(ROOT, 'Dashboard', 'partymove_api.js')), cfg = { accounts: [{ character: 'A', party: 'A' }, { character: 'B', party: 'A' }, { character: 'C', party: 'C' }] };
  const r = PM.planMove(cfg, { 'run_state.json': { chars: { B: { on: false } } }, 'crafter.json': { townRole: ['B'] } }, 'B', 'C', '');
  t('MOVEHELD: an own Stop does not survive a move; a town role is only said', r.ok && !r.data['run_state.json'].chars.B && r.touched.includes('run_state.json') && !r.touched.includes('crafter.json') && r.changes.some(x => /own Stop is removed/.test(x)) && r.changes.some(x => /^NOTE: B stays in its town/.test(x)));
  const L = [], files = {}; let key = 'New';
  const mk = () => new Function('state', 'IsCharacterReady', 'now', 'scriptStartAt', 'SWARM_ROOT', 'Me', 'CONFIG', 'File', 'PMOVE', 'note', fn('pmoveBootTick') + '\nreturn pmoveBootTick;')({ role: 'x' }, () => true, () => 1e6, 0, 'R', { Name: 'B' }, { get leader() { return key; } }, { Exists: (f) => f in files, ReadAllText: (f) => files[f], WriteAllText: (f, s) => { files[f] = s; } }, { list: L }, () => { });
  mk()(); t('PMOVEBOOT: the first start only remembers the party', !L.length && Object.values(files)[0] === 'New');
  key = 'Other'; mk()(); t('PMOVEBOOT: another party at the next start = leave the old one', L.length === 1 && L[0].was === 'New' && L[0].party === 'Other'); mk()(); t('PMOVEBOOT: once', L.length === 1); }
// ---- N19 RESLOOP / RESPARK
{ const P = new Function(cut('// RESLOOP-PURE-BEGIN', '// RESLOOP-PURE-END') + '\nreturn resLoopCount;')();
  t('RESLOOP: deaths at the same place within 3 min are counted', P([{ at: 0, x: 0, y: 0 }, { at: 100000, x: 100, y: 0 }, { at: 150000, x: 5000, y: 0 }], 170000, { x: 0, y: 0 }) === 2 && P([{ at: 0, x: 0, y: 0 }], 200000, { x: 0, y: 0 }) === 0);
  const rd2 = fn('resDecide'); t('RESLOOP: dead twice with monsters at the body = wait; raids and your order never wait', /if \(!man && !o\.raid && resNum\(d\.loopN\) >= 2 && resNum\(d\.foes\) > 0\) \{ waits\.push/.test(rd2));
  t('RESPARK: a parked / stopped party resurrects nobody by itself, except your order and a hand-played leader\'s team', /if \(!man\) \{ let pw = ''; try \{ pw = handsOffOf\(String\(CONFIG\.leader\)\) \? '' : partyUserPaused\(\);/.test(SRC)); }
console.log(`tester 2026-11-22 b: ${pass} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
