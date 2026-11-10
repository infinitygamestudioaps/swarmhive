// HTSTICKY + STAYSTICK + MEMBERPACE + ZONEREAPPLY guard (public testers, Discord #swarmhive, Hive 1.14.0, 2026-11-10):
//  #3  Vykaax: '"Hunting time" setting is still ignored, they return after 12h no matter what'
//  #4  LuckyStrikz: "I told one group to stay in FOG but hive constantly overrides me and takes them to some field zone" /
//      "parties also cant make it down into FOG without running into the lava flows in the bottom instead of following the leader down"
//  #11 Vykaax: "After restarting Swarm ... they start combat using their old polygon elsewhere in the world and end up just standing around"
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '../../..');
const SRC = fs.readFileSync(path.join(ROOT, 'Scripts_dev/swarm.js'), 'utf8');
let ok = 0, bad = 0; const t = (m, c, x) => { if (c) { ok++; console.log('ok   ' + m); } else { bad++; console.log('FAIL ' + m + (x === undefined ? '' : ' ' + JSON.stringify(x))); } };
const cut = (a, b) => { const i = SRC.indexOf(a), k = SRC.indexOf(b, i); if (i < 0 || k < 0) throw new Error('block missing: ' + a); return SRC.slice(i, k); };

// ---------- #3 HTSTICKY ----------
const HT = new Function(cut('// HUNTTIMER-PURE-BEGIN', '// HUNTTIMER-PURE-END') + '\nreturn { htNoLongWhy, htUntilStop, htPlanEntry, htEntry, htClock };')();
const J = (p) => ({ v: 1, parties: p });
t('#3 "Until I stop it" = no 12 h session', HT.htNoLongWhy(J({ Lead: { untilStop: true } }), ['Lead'], null) !== '');
t('#3 "Until I stop it" filed under the claim team is found too', HT.htNoLongWhy(J({ Team1: { untilStop: true } }), ['Lead', 'Lead', 'Team1'], null) !== '');
t('#3 a "Keep hunting" timer = no 12 h session', HT.htNoLongWhy(J({ Lead: { id: 'a', hours: 2, endAction: 'keep', at: '2026-11-10T00:00:00Z' } }), ['Lead'], null) !== '');
t('#3 a timed "town" / "resupply" choice or no choice keeps the 12 h rule (owner R3)', HT.htNoLongWhy(J({ Lead: { id: 'a', hours: 2, endAction: 'town', at: '2026-11-10T00:00:00Z' } }), ['Lead'], null) === '' && HT.htNoLongWhy(J({}), ['Lead'], null) === '');
t('#3 htEntryMine asks htNoLongWhy under every key before the long-hunt session', /if \(htUntilStop\(htData\(\), key\)\) return null;[\s\S]{0,320}const ks = \[key, CONFIG\.leader\]; try \{ ks\.push\(claimTeam\(\)\); \}[\s\S]{0,120}if \(htNoLongWhy\(htData\(\), ks, pe, null\)\) return null;/.test(SRC));
const API = require(path.join(ROOT, 'Dashboard/hunttimer_api.js'));
{ const d0 = J({ Lead: { id: 'x', hours: 2, endAction: 'keep', at: '2026-11-10T00:00:00Z', spot: 'Cruma Tower · room cruma-2-left-b' } });
  const r = API.applyChange(d0, { party: 'Lead', act: 'done' }, Date.parse('2026-11-10T03:00:00Z'));
  t('#3 the card\'s OK on a finished "Keep hunting" timer turns it into "Until I stop it" (not deleted -> no 12 h clock)', r.ok && r.data.parties.Lead && r.data.parties.Lead.untilStop === true && /cruma/.test(r.data.parties.Lead.spot), r);
  const r2 = API.applyChange(J({ Lead: { id: 'x', hours: 2, endAction: 'town', at: '2026-11-10T00:00:00Z' } }), { party: 'Lead', act: 'done' }, Date.now());
  t('#3 the card\'s OK on a finished "town" timer removes it', r2.ok && !r2.data.parties.Lead, r2);
  const r3 = API.applyChange(J({}), { party: 'Lead', act: 'stop', spot: 'x' }, Date.now());
  t('#3 the picker\'s "Until I stop it" is still remembered', r3.ok && r3.data.parties.Lead.untilStop === true); }
{ const UI = fs.readFileSync(path.join(ROOT, 'Dashboard/hunttimer.js'), 'utf8');
  t('#3 the card\'s OK sends act "done"', /t\.dataset\.htclear\) post\(\{ party: t\.dataset\.htclear, act: 'done' \}\)/.test(UI));
  t('#3 the picker still writes "stop" for "Until I stop it"', /choice\.hours === null\) await post\(\{ party, act: 'stop', spot: label \}\)/.test(UI)); }

// ---------- owner 2026-11-10: nonstop exempt + plan level steps get the "how long?" choice ----------
t('owner: "Hunt here 24/7" (nonstop) = no 12 h town trip', HT.htNoLongWhy(J({}), ['Lead'], { mode: 'manual', kind: 'here', nonstop: true }, null) !== '');
t('owner: a plan step\'s "Until I stop it" / "Keep hunting" = no 12 h town trip', HT.htNoLongWhy(J({}), ['Lead'], null, { untilStop: true }) !== '' && HT.htNoLongWhy(J({}), ['Lead'], null, { hours: 2, endAction: 'keep' }) !== '');
{ const pe = HT.htPlanEntry({ hours: 3, endAction: 'resupply' }, 'sA1', 1000);
  t('plan step 3 h + "town, supplies, back" = a hunt clock with that end action (clock from the arrival)', pe && pe.hours === 3 && pe.endAction === 'resupply' && pe.from === 'arrival' && pe.plan === true && /^plan:sA1:1000$/.test(pe.id), pe);
  const c = HT.htClock(pe, { id: pe.id, startedAt: new Date(5000).toISOString() }, 5000 + 3 * 3600000 + 1);
  t('plan step clock ends after its hours', c.ended && !c.active);
  t('plan step "Until I stop it" / no choice = no plan clock', HT.htPlanEntry({ untilStop: true }, 'sA1', 1) === null && HT.htPlanEntry(null, 'sA1', 1) === null); }
t('htEntryMine: the running plan step\'s choice wins, then the dashboard timer, then nonstop / untilStop', /const ph = htPlanHuntMine\(\);\s*if \(ph\) \{ const pe = htPlanEntry\(ph\.hunt, ph\.id, ph\.at\); if \(pe\) return pe; return null; \}[\s\S]{0,900}htNoLongWhy\(htData\(\), ks, pe, null\)/.test(SRC));
t('the plan step\'s start survives a reload (plan progress stepAt) = a stable clock id', /PLAN\.levelStepAt = sa \|\| now\(\);/.test(SRC) && /return \{ hunt: h, id: st\.id, at: PLAN\.levelStepAt/.test(SRC));
t('a plan step clock starts when the team is at its spot', /if \(e\.long\) return lhAtSpot\(\); if \(e\.plan\) return lhAtSpot\(\);/.test(SRC));
{ const PL = require(path.join(ROOT, 'Dashboard/planlogic.js'));
  const lv = (h) => PL.normStep({ kind: 'level', to: 40, spot: { mode: 'auto' }, hunt: h });
  t('planlogic: "Until I stop it" is stored', JSON.stringify(lv({ hours: 'stop' }).hunt) === '{"untilStop":true}');
  t('planlogic: 4 h + keep hunting is stored', JSON.stringify(lv({ hours: '4', endAction: 'keep' }).hunt) === '{"hours":4,"endAction":"keep"}');
  t('planlogic: the default (12 h rule) stores nothing; old steps stay valid', lv({ hours: 'default' }).hunt === undefined && lv(undefined).hunt === undefined);
  t('planlogic: a stored choice reads back in the editor and can be changed', PL.huntChoice({ untilStop: true }) === 'stop' && PL.huntChoice({ hours: 2, endAction: 'town' }) === '2' && JSON.stringify(PL.normHunt({ untilStop: true, hours: '2', endAction: 'town' })) === '{"hours":2,"endAction":"town"}');
  t('planlogic: the step sentence says it', /until you stop it/.test(PL.stepText(lv({ hours: 'stop' }), {})) && /2 h, then town, supplies, back/.test(PL.stepText(lv({ hours: 2, endAction: 'resupply' }), {}))); }
{ const UI = fs.readFileSync(path.join(ROOT, 'Dashboard/partyplan.js'), 'utf8');
  t('plan editor: the level step shows "How long?" + "When the time is up"', /seg\('hunt\.hours', hv, \[\['default'[\s\S]{0,120}\['stop', 'Until I stop it'\]/.test(UI) && /seg\('hunt\.endAction'[\s\S]{0,80}\['town', 'Go to town and wait'\], \['resupply', 'Town, supplies, come back'\], \['keep', 'Keep hunting'\]/.test(UI) && /\$\{huntBlock\(s\)\}/.test(UI)); }

// ---------- #4 STAYSTICK ----------
const C = new Function(cut('// CHOICEONLY-PURE-BEGIN', '// CHOICEONLY-PURE-END') + '\nreturn choiceOnlyHold;')();
const stay = { mode: 'manual', kind: 'rooms', dungeon: 'Forge of the Gods', stay: true }, plain = { mode: 'manual', kind: 'rooms' };
t('#4 a "stay" choice that was not reached: wait + retry, never an automatic field zone', typeof C({ name: 'Field area 3' }, stay, { kind: 'fallback-auto', detail: 'x', retryAt: 9e12 }, 1000) === 'string');
t('#4 a "stay" choice with no reason known: still no automatic spot', typeof C({ name: 'Field area 3' }, stay, null, 1000) === 'string');
t('#4 a "stay" choice marked empty / occupied: still no automatic spot', typeof C({ name: 'f' }, stay, { kind: 'empty' }, 1000) === 'string' && typeof C({ name: 'f' }, stay, { kind: 'occupied' }, 1000) === 'string');
t('#4 the hold says why (party card / chat)', /stay/.test(C({ name: 'f' }, stay, { kind: 'empty', detail: 'no monster' }, 1000)));
t('#4 Seven Signs + "needs your OK" keep their own rules', C({}, stay, { kind: 'blocked' }, 1000) === null && C({}, stay, { kind: 'needs-ok' }, 1000) === null);
t('#4 the chosen spot itself goes on', C({ name: 'FoG room', manual: true }, stay, null, 1000) === null);
t('#4 your !assist / !dungeon order (forced) is never held', C({ name: 'x' }, stay, { kind: 'fallback-auto' }, 1000, true) === null);
t('#4 without "stay": occupied keeps the automatic spot (CHOICEONLY unchanged)', C({}, plain, { kind: 'occupied' }, 1000) === null && C({}, { mode: 'auto' }, null, 1000) === null);
t('#4 the leader\'s solo run (partner not in the party yet) keeps the party\'s chosen spot', /if \(!e \|\| e\.mode !== 'manual' \|\| \(solo && !soloChar\(\) && !isLeader\(\)\)\) return null;/.test(SRC));
t('#4 the autolevel loop passes forced + shows the hold on the card + re-checks', /choiceOnlyHold\(spot, partySpotEntry\(\), manualSw\.nullWhy, now\(\), !!autoLvl\.forceSpot \|\| \(solo && !isLeader\(\)\)\)[\s\S]{0,600}manualSwSet\([\s\S]{0,200}lastPick = 0; await sleep\(15000\); continue;/.test(SRC));

// ---------- #4 MEMBERPACE (FoG lava) ----------
const MP = new Function(cut('// MEMBERPACE-PURE-BEGIN', '// MEMBERPACE-PURE-END') + '\nreturn memberPace;')();
const route = [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 200 }, { x: 400, y: 400 }];
t('#4 a member never walks past the leader on his route', MP(route, 3, { x: 210, y: 5 }) === 'wait' && MP(route, 1, { x: 210, y: 5 }) === 'go');
t('#4 the leader at the end / off the route: walk the route to its end', MP(route, 4, { x: 400, y: 410 }) === 'go' && MP(route, 3, { x: 5000, y: 5000 }) === 'go');
t('#4 "caught up with him" no longer ends the route walk (no beeline follow over the lava)', !/< 300 && j > k \+ 2\) break;/.test(SRC) && /memberPace\(pts, j, \{ x: lp\.X, y: lp\.Y \}\) === 'wait'/.test(SRC));

// ---------- #11 ZONEREAPPLY ----------
const Z = new Function(cut('// ZONEREAPPLY-PURE-BEGIN', '// ZONEREAPPLY-PURE-END') + '\nreturn { zoneEpochStep, zoneReapplyDue };')();
{ const st = { epoch: 0, ready: false, oid: 0, applied: 0 };
  t('#11 the first ready = epoch 1 (the zone is set at the first pick)', Z.zoneEpochStep(st, true, 11) === true && st.epoch === 1 && Z.zoneReapplyDue(st));
  st.applied = st.epoch;
  t('#11 still logged in = no new epoch', Z.zoneEpochStep(st, true, 11) === false && !Z.zoneReapplyDue(st));
  Z.zoneEpochStep(st, false, 0);
  t('#11 L2Swarm restart (not ready -> ready) = new epoch -> the zone is set again', Z.zoneEpochStep(st, true, 11) === true && Z.zoneReapplyDue(st));
  st.applied = st.epoch;
  t('#11 another objId (relogin seen without a gap) = new epoch', Z.zoneEpochStep(st, true, 12) === true && Z.zoneReapplyDue(st)); }
t('#11 a new epoch drops the zone caches (square cache + Fight-with-L2Swarm keeper)', /if \(!zoneEpochStep\(ZONEEP, rdy, oid\)\) return;\s*zoneCache\.last = null; zoneCache\.type = null;[\s\S]{0,120}SF\.zone\.at = 0/.test(SRC));
t('#11 the hunting loop re-picks at once and the "same spot" shortcut is skipped once', /if \(autoLvl\.spot && zoneReapplyDue\(ZONEEP\)\) lastPick = 0;/.test(SRC) && /if \(rp === 'same' && !zoneReapplyDue\(ZONEEP\)\) \{/.test(SRC) && /ZONEEP\.applied = ZONEEP\.epoch;[^\n]*\n\s*localFb = null;/.test(SRC));

console.log(`hunt_sticky: ${ok} ok, ${bad} failed`); process.exit(bad ? 1 : 0);
