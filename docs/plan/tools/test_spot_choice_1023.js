// OFFLINE TEST of the 2026-10-23 public tester fixes (Raltru: "Send bots to TOI 5 ... they stay in Forsaken"; Vykaax: "plans ... ignored due to
// 'difficulty'", "the one on the right didn't even confirm", "when I hit Start ... they go to Giran").
//   node docs/plan/tools/test_spot_choice_1023.js        (exit code 1 when a check fails)
// 1) manualLevelGate (SSGATE-PURE + the dashboard's 1:1 copy): ask === false = the choice is used, only a warning; old callers unchanged.
// 2) party setting spotLevelCheck: swarm.js PAUTO_KINDS and Dashboard/partyauto_api.js KINDS (same order, default OFF), defaultValues (all parties).
// 3) spotResumeDecide / huntOnDecide: a chosen spot we stand in is kept on Start, even above our level or after a long Stop.
// 4) Wiring: manualSpot asks spotLevelAsk() and carries the warn as override; huntOnHere's chosen-spot path; the party card save confirms at once;
//    Override keeps nonstop; party settings toggle + "all parties".
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..', '..', '..');
const src = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'Dashboard', 'index.html'), 'utf8');
const psJs = fs.readFileSync(path.join(ROOT, 'Dashboard', 'partysettings.js'), 'utf8');
const server = fs.readFileSync(path.join(ROOT, 'Dashboard', 'server.js'), 'utf8');
let fails = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails++; };
const block = (s, name) => { const a = s.indexOf('// ' + name + '-BEGIN'), b = s.indexOf('// ' + name + '-END'); return a >= 0 && b > a ? s.slice(a, b) : null; };
const fnSrc = (s, name) => { const i = s.indexOf('function ' + name + '('); if (i < 0) return ''; let n = 0;
  for (let k = s.indexOf('{', i); k < s.length; k++) { if (s[k] === '{') n++; else if (s[k] === '}' && --n === 0) return s.slice(i, k + 1); } return ''; };

// ---- 1) manualLevelGate ------------------------------------------------------------------------------------------------------
{
  const g = fnSrc(src, 'manualLevelGate'), gu = fnSrc(html, 'manualLevelGate');
  check(!!g && g === gu, 'manualLevelGate: the dashboard copy is identical to swarm.js');
  const L = new Function(g + '\nreturn manualLevelGate;')();
  const a = L(40, 42, 0, 28, 6, false, false);
  check(a.ok && !a.needOk && a.above && a.warn && /only a warning/.test(a.why), `Vykaax: Cruma room 40-42 for a level-28 party, setting off -> used, only a warning (${a.why})`);
  const b = L(40, 42, 0, 28, 6, false, true);
  check(!b.ok && b.needOk, 'setting on (ask) -> needs your OK (the old rule)');
  check(L(40, 42, 0, 28, 6, false).needOk, 'old callers (no ask argument) -> unchanged (needs your OK)');
  const c = L(40, 42, 0, 28, 6, true, true);
  check(c.ok && !c.warn && /user override/.test(c.why), 'an override still wins in ask mode');
  check(L(28, 32, 0, 28, 6, false, false).ok && !L(28, 32, 0, 28, 6, false, false).above, 'not above the safe level: no warning at all');
}
// ---- 2) the party setting ----------------------------------------------------------------------------------------------------
{
  const pure = block(src, 'PARTYAUTO-PURE');
  const P = new Function(pure + '\nreturn { PAUTO_KINDS, pautoEffective };')();
  const API = require(path.join(ROOT, 'Dashboard', 'partyauto_api.js'));
  const sk = Object.keys(P.PAUTO_KINDS);
  check(sk.indexOf('spotLevelCheck') > sk.indexOf('swarmFight') && API.KEYS.indexOf('spotLevelCheck') > API.KEYS.indexOf('swarmFight'), 'spotLevelCheck added at the end (after swarmFight) in swarm.js and the API');
  check(sk.join() === API.KEYS.join(), 'swarm.js and the API know the same switches in the same order');
  check(P.pautoEffective({}, 'spotLevelCheck', 'A', 'A').on === false && API.pautoEffective({}, 'spotLevelCheck', 'A', 'A').on === false, 'default OFF = warn only (never refuse)');
  check(P.PAUTO_KINDS.spotLevelCheck.char === false && !API.CHAR_KEYS.includes('spotLevelCheck'), 'a party switch (no per-character choice)');
  const r = API.applyChange({}, { party: 'Vykaax', values: { spotLevelCheck: true } });
  check(r.ok && r.data.parties.Vykaax.spotLevelCheck === true && P.pautoEffective(r.data, 'spotLevelCheck', 'Vykaax', 'Vykaax').on === true, 'party value saved + read by swarm.js');
  const r2 = API.applyChange({}, { party: 'Vykaax', defaultValues: { spotLevelCheck: true } });
  check(r2.ok && r2.data.default.spotLevelCheck === true && P.pautoEffective(r2.data, 'spotLevelCheck', 'Other', 'Other').on === true, 'defaultValues = the setting for every party without its own');
  const r3 = API.applyChange(r2.data, { party: 'Vykaax', defaultValues: { spotLevelCheck: null } });
  check(r3.ok && r3.data.default.spotLevelCheck === undefined, 'defaultValues null removes it');
  check(!API.applyChange({}, { party: 'Vykaax', defaultValues: { nope: true } }).ok && !API.applyChange({}, { party: 'Vykaax', defaultValues: { spotLevelCheck: 'ask' } }).ok, 'defaultValues: unknown keys / non-booleans refused');
  const kd = (API.KINDS || []).find(k => k.key === 'spotLevelCheck');
  check(!!kd && kd.group === 'combat' && /above our level/.test(kd.label), 'API kind in the Combat section of the party settings');
}
// ---- 3) Start resumes a chosen spot -----------------------------------------------------------------------------------------
{
  const rp = block(src, 'SPOTREPICK-PURE'), sr = block(src, 'SPOTRESUME-PURE');
  const sb = { Math, Number, String, isFinite, JSON, Object, Array };
  vm.createContext(sb);
  vm.runInContext(`function inPolygon(x, y, P) { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b = P[j]; if (((a.y > y) !== (b.y > y)) && (x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x)) c = !c; } return c; }
    function nearPolygon(x, y, P, m) { if (!P || P.length < 3) return false; if (inPolygon(x, y, P)) return true; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[j], b = P[i], dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy; let t = L ? ((x - a.x) * dx + (y - a.y) * dy) / L : 0; t = Math.max(0, Math.min(1, t)); if (Math.hypot(x - a.x - t * dx, y - a.y - t * dy) <= m) return true; } return false; }
    ${rp}\n${sr}\nthis.T = { huntOnDecide, spotResumeDecide, spotResumeInside, spotRepickKey };`, sb);
  const T = sb.T, t = 1e12;
  const room = { name: 'Cruma Tower: 1st floor, left: room a', levelMin: 40, levelMax: 45, manual: true, center: { x: 17000, y: 114000, z: -3400 }, room: { id: 'cruma-1-left-a' },
    poly: [{ x: 16500, y: 113500 }, { x: 17500, y: 113500 }, { x: 17500, y: 114500 }, { x: 16500, y: 114500 }], floor: { zMin: -3600, zMax: -3200 } };
  const key = T.spotRepickKey(room);
  const base = { inTown: false, spread: [{ d: 300 }], lim: 9000, now: t, saved: { spot: room, at: t - 60000 }, pickKey: key, pickManual: true, level: 28,
    me: { x: 17010, y: 114020, z: -3390 }, bad: () => false, inside: T.spotResumeInside };
  const D = (o) => T.huntOnDecide(Object.assign({}, base, o));
  check(!!key, `the room has a key (${key})`);
  check(D({}).keep === true, 'Vykaax: level-28 duo in its chosen Cruma room (level 40), Start -> hunt on there (was: "too high for us" -> Giran)');
  check(D({ saved: { spot: room, at: t - 3 * 3600e3 } }).keep === true, 'the chosen spot after a 3 h Stop, still standing in it -> hunt on (was: "the saved spot is 180 min old")');
  check(D({ me: { x: 40000, y: 114020, z: -3390 } }).keep === false, 'not standing in the chosen spot -> the normal start');
  check(D({ inTown: true }).keep === false && D({ spread: [{ d: 20000 }] }).keep === false, 'town / team apart -> the normal start (unchanged)');
  const auto = Object.assign({}, room, { manual: false });
  check(D({ saved: { spot: auto, at: t - 60000 }, pickManual: false, pickKey: 'area:x' }).keep === false, 'an AUTOMATIC spot far above the team level is still not kept (unchanged rule)');
  check(D({ saved: { spot: auto, at: t - 3 * 3600e3 }, pickManual: false, pickKey: key }).keep === false, 'an automatic old record is still too old (hunting.md R1 30 min)');
}
// ---- 4) wiring ---------------------------------------------------------------------------------------------------------------
{
  const ms = fnSrc(src, 'manualSpot');
  check(/spotLevelAsk\(\)/.test(ms) && /CONFIG\.danger\.margin, !!e\.override, ask\)/.test(ms), 'manualSpot asks the party setting and passes it to manualLevelGate');
  check(/override: !!e\.override \|\| lvlWarnOnly/.test(ms), 'manualSpot: a warn-only choice travels as override (the landing check + travel status never say "needs your OK")');
  check(/SayToParty\(`\[lead\] \$\{manualLabel\(e\)\}: above our safe level/.test(ms), 'manualSpot: the warning is said in party chat');
  check(/function spotLevelAsk\(\) \{ try \{ return !!pautoEffective\(pautoData\(\), 'spotLevelCheck', Me\.Name, CONFIG\.leader\)\.on;/.test(src), 'spotLevelAsk reads party_auto.json spotLevelCheck');
  check(/levelWarn: s\.levelWarn \|\| null/.test(fnSrc(src, 'manualSpotPublic')), 'manualSpotPublic sends levelWarn to the card');
  const ho = fnSrc(src, 'huntOnHere');
  check(/pick && pick\.manual/.test(ho) && /saved: \{ spot: pick, at: now\(\) \}/.test(ho) && /chosen: true/.test(ho), 'huntOnHere: standing in the chosen spot = hunt on there, also without a fresh last-hunt record');
  const ll = fnSrc(src, 'leadLevel');
  check(ll.indexOf('huntOnHere(why)') > 0 && ll.indexOf('huntOnHere(why)') < ll.indexOf('stopCombatG()'), 'leadLevel asks huntOnHere before the Giran regroup (Start, !level, plan)');
  const pse = fnSrc(src, 'planSpotEntry');
  check(/const override = sp\.override === true \|\| !!base\.override/.test(pse), 'a running plan step inherits the party override (PLANOVR)');
  // dashboard
  const ss = fnSrc(html, 'saveSpot');
  check(ss.indexOf('UIKit.toast(`Party ${party}: hunting spot saved') > 0 && ss.indexOf('UIKit.toast(`Party ${party}: hunting spot saved') < ss.indexOf('HuntTimer.afterSave'), 'saveSpot: the card is updated + confirmed before the hunt timer / plan questions');
  check(/loadPartySpots\(true\)/.test(ss), 'saveSpot re-reads the choices from the server');
  const sc = fnSrc(html, 'spotChoiceChecks');
  check(/await spotLevelAskOf\(party\)/.test(sc) && /mg && mg\.warn\) parts\.push/.test(sc), 'spotChoiceChecks: setting off = no question, the warning goes with the save');
  check(/nonstop: !!cur\.nonstop, override: true/.test(html) && /if \(b\.nonstop === true\) e\.nonstop = true;/.test(server), 'Override keeps nonstop (dashboard + server)');
  check(/ms\.levelWarn && ms\.mode === 'manual'/.test(html), 'party card: "above our level · your choice" chip');
  check(/key: 'spotLevelCheck', char: false, group: 'combat'/.test(psJs) && /data-pschk="combat\.allToo"/.test(psJs) && /cbody\.defaultValues = \{ spotLevelCheck:/.test(psJs), 'party settings: the switch + "every party" checkbox + defaultValues save');
}
console.log(fails ? `\n${fails} check(s) FAILED` : '\nall checks passed');
process.exit(fails ? 1 : 0);
