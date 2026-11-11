// OFFLINE TEST of RESFIGHT2-2026-11-10 (public tester, Discord #swarmhive 2026-11-10: "When a bot dies, the leader stops fighting. The healer
// doesn't resurrect for some reason and after a little while eventually another party member decides to use a scroll. The whole time they are
// getting hit by a mob."). Our own replay: party Destroyer3 at Forge of the Gods, Chanter2 died 15:59:19 next to the bishop Bishop2:
//   Bishop2 15:59:19 "resurrect: Chanter2 is dead — Resurrection" -> "Chanter2 is already alive" (partyMember preferred Chanter2's 2 s old own
//   report) -> next try 20 s later (15:59:39, revived 15:59:43); Destroyer3 15:59:21 "gather team: waiting for Chanter2 dead" = stopCombatG every
//   3 s, no attack for 18 s while the mobs hit the team.
//   node docs/plan/tools/test_res_fight.js        (exit code 1 when a check fails)
// 1) RES-PURE resDecide: the healer's OWN hold, the skill goes first, a scroll only after RESX.skillWaitMs, raids unchanged
// 2) RES-HOST resStillDead / resFightHold with stubs (the Chanter2 replay)
// 3) TEAMJOIN-PURE huntDeadFightOk: the leader fights on while a dead teammate lies near and the party is hit
// 4) wiring in Scripts_dev/swarm.js
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const src = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
let fails = 0, n = 0;
const check = (ok, what) => { n++; console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails++; };
const blk = (b, e) => { const a = src.indexOf(b), z = src.indexOf(e); if (a < 0 || z < a) { console.error(b + ' block not found'); process.exit(1); } return src.slice(a, z); };

// ---- 1) resDecide --------------------------------------------------------------------------------------------------------------
const M = new Function(blk('// RES-PURE-BEGIN', '// RES-PURE-END') + '\nreturn { RESX, resDecide, resHeld };')();
const R = (o) => Object.assign({}, M.RESX.defaults, o || {});
const P = (name, x, y, extra) => Object.assign({ name, x, y, z: -5840 }, extra || {});
const bishop = (extra) => P('Bishop2', 178680, -112856, Object.assign({ healer: true, skill: { id: 1016, name: 'Resurrection', ready: true }, sor: 0, bsor: 0 }, extra || {}));
const dealer = (extra) => P('Destroyer5', 178712, -112840, Object.assign({ sor: 3, sorId: 737 }, extra || {}));
const deadW = (extra) => P('Chanter2', 178648, -112856, extra || {});
const job = (d, who) => (d.jobs || []).find(j => j.dead === who);
const wait = (d, who) => ((d.waits || []).find(w => w.dead === who) || {}).why || '';
check(M.RESX.skillWaitMs >= 15000 && M.RESX.skillWaitMs <= 60000 && M.RESX.holdAttackers >= 3, `RESX: skillWaitMs ${M.RESX.skillWaitMs}, hold at ${M.RESX.holdAttackers}+ monsters / own HP < ${M.RESX.holdMyHp} / teammate < ${M.RESX.holdMateHp}`);
// (a) the tester's case: party hit, the deciding window (a dealer) is in the fight, the bishop itself is safe (hold false) -> the bishop's SKILL
let d = M.resDecide({ dead: [deadW({ deadMs: 2000 })], alive: [bishop({ hold: false }), dealer()], rules: R(), fightHold: true });
check(job(d, 'Chanter2') && job(d, 'Chanter2').by === 'Bishop2' && job(d, 'Chanter2').how === 'skill', `party hit, bishop safe: Bishop2 casts Resurrection (not the dealer's scroll) (${(job(d, 'Chanter2') || {}).why || wait(d, 'Chanter2')})`);
// (b) the bishop really unsafe (its own hold) -> NO scroll for skillWaitMs; it says who will res
d = M.resDecide({ dead: [deadW({ deadMs: 5000 })], alive: [bishop({ hold: true }), dealer()], rules: R() });
check(!job(d, 'Chanter2') && /Bishop2 resurrects Chanter2 with Resurrection as soon as it is safe/.test(wait(d, 'Chanter2')), `bishop held 5 s after the death: nobody reads a scroll yet (${wait(d, 'Chanter2')})`);
// (c) still held after skillWaitMs -> the scroll is the fallback (a dealer, never the healer first)
d = M.resDecide({ dead: [deadW({ deadMs: M.RESX.skillWaitMs + 1000 })], alive: [bishop({ hold: true, sor: 2 }), dealer()], rules: R() });
check(job(d, 'Chanter2') && job(d, 'Chanter2').by === 'Destroyer5' && job(d, 'Chanter2').how === 'scroll', 'bishop still held after the wait: Destroyer5 reads the scroll (fallback)');
// (d) the skill on cooldown -> scroll at once (unchanged)
d = M.resDecide({ dead: [deadW({ deadMs: 1000 })], alive: [bishop({ hold: false, skill: { id: 1016, name: 'Resurrection', ready: false } }), dealer()], rules: R() });
check(job(d, 'Chanter2') && job(d, 'Chanter2').how === 'scroll', 'Resurrection on cooldown: a scroll at once (no wait for a skill that cannot come)');
// (e) a held healer that is BUSY (trading / gatekeeper) is no reason to wait
d = M.resDecide({ dead: [deadW({ deadMs: 1000 })], alive: [bishop({ hold: true, busy: true }), dealer()], rules: R() });
check(job(d, 'Chanter2') && job(d, 'Chanter2').by === 'Destroyer5', 'busy healer (not the fight): the scroll goes');
// (f) no healer report (old swarm.pos without hold): the deciding window's fightHold as before
d = M.resDecide({ dead: [deadW()], alive: [bishop(), dealer()], rules: R(), fightHold: false });
check(job(d, 'Chanter2') && job(d, 'Chanter2').how === 'skill', 'no hold in the report + fightHold false: skill');
check(M.resHeld({}, { fightHold: true }) === true && M.resHeld({ hold: false }, { fightHold: true }) === false, 'resHeld: own report wins, else the window\'s fightHold');
// (g) deadMs unknown (manual tools / old callers): no skill wait (old behaviour)
d = M.resDecide({ dead: [deadW()], alive: [bishop({ hold: true }), dealer()], rules: R() });
check(job(d, 'Chanter2') && job(d, 'Chanter2').how === 'scroll', 'deadMs unknown: old behaviour (scroll when the healer holds)');
// (h) raids unchanged: the 85 % gate; a dead bishop may be scrolled at once
d = M.resDecide({ dead: [deadW({ deadMs: 1000 })], alive: [bishop({ hold: false }), dealer()], rules: R(), raid: true, raidHpOk: false });
check(!job(d, 'Chanter2') && /raid/.test(wait(d, 'Chanter2')), 'raid: the 85 % rule and no scroll on a dealer stay');
d = M.resDecide({ dead: [P('Bishop5', 0, 0, { healer: true, deadMs: 1000 })], alive: [P('Bishop6', 300, 0, { healer: true, hold: true, skill: { id: 1016, name: 'Resurrection', ready: true } }), P('Nuker13', 200, 0, { sor: 2 })], rules: R(), raid: true, raidHpOk: false });
check(job(d, 'Bishop5') && job(d, 'Bishop5').by === 'Nuker13', 'raid: a dead bishop is scrolled at once (owner 2026-10-13 rule stays)');
// (i) your order never waits
d = M.resDecide({ dead: [deadW({ deadMs: 1000 })], alive: [bishop({ hold: true }), dealer()], rules: R(), manual: { dead: 'Chanter2', by: 'Destroyer5', how: 'scroll' } });
check(job(d, 'Chanter2') && job(d, 'Chanter2').by === 'Destroyer5', 'your order: no wait');

// ---- 2) host helpers with stubs ------------------------------------------------------------------------------------------------
const fnSrc = (name) => { const i = src.indexOf('function ' + name + '('); if (i < 0) throw new Error(name + ' not found'); let depth = 0, j = src.indexOf('{', i); for (let k = j; k < src.length; k++) { if (src[k] === '{') depth++; else if (src[k] === '}') { depth--; if (depth === 0) return src.slice(i, k + 1); } } throw new Error('no end ' + name); };
const host = (S) => new Function(...Object.keys(S), fnSrc('resStillDead') + '\n' + fnSrc('resFightHold') + '\nreturn { resStillDead, resFightHold };')(...Object.values(S));
const T = 1e9;
// the Chanter2 replay: the Die packet is in the party row, Chanter2's own report (1.8 s old) still says alive
let H = host({ now: () => T, livePos: { Chanter2: { IsDead: false, at: T - 1800 } }, partyRows: () => [{ Name: 'Chanter2', IsDead: true }], PartyList: [], num: Number, Me: {}, RESX: M.RESX, healTargets: () => [], escAttackers: () => [] });
check(H.resStillDead('Chanter2') === true, 'Chanter2 replay: row dead + own 2 s old report alive -> still dead (the cast goes on; was "already alive" + 20 s pause)');
check(H.resStillDead('Chanter2', T - 1000) === true, '...also in the accept wait when his report is older than the cast');
H = host({ now: () => T, livePos: { Chanter2: { IsDead: false, at: T - 200 } }, partyRows: () => [{ Name: 'Chanter2', IsDead: true }], PartyList: [], num: Number, Me: {}, RESX: M.RESX, healTargets: () => [], escAttackers: () => [] });
check(H.resStillDead('Chanter2', T - 1000) === false, 'his own report AFTER the cast says alive -> revived (a stale row cannot hold the wait)');
H = host({ now: () => T, livePos: { Chanter2: { IsDead: true, at: T - 1000 } }, partyRows: () => [{ Name: 'Chanter2', IsDead: false }], PartyList: [], num: Number, Me: {}, RESX: M.RESX, healTargets: () => [], escAttackers: () => [] });
check(H.resStillDead('Chanter2') === true, 'body out of sight (no Die packet, row alive) + own report dead -> dead (LEASH-2026-10-14 rule kept)');
H = host({ now: () => T, livePos: { Chanter2: { IsDead: true, at: T - 20000 } }, partyRows: () => [{ Name: 'Chanter2', IsDead: false }], PartyList: [], num: Number, Me: {}, RESX: M.RESX, healTargets: () => [], escAttackers: () => [] });
check(H.resStillDead('Chanter2') === false, 'row alive + a 20 s old dead report -> alive');
// resFightHold: 1-2 monsters on a healthy bishop = res anyway; 3+ / own HP low / teammate low = heal first
const mobs = (k) => Array.from({ length: k }, (_, i) => ({ targetsMe: true, hitMe: i === 0, cc: null }));
const fh = (me, mates, k) => host({ now: () => T, livePos: {}, partyRows: () => [], PartyList: [], num: Number, Me: { HpPercent: me }, RESX: M.RESX, healTargets: () => [{ me: true, hp: me }].concat(mates.map(h => ({ hp: h }))), escAttackers: () => mobs(k), lastAttackerOnMe: { at: T - 500 } }).resFightHold();
check(fh(90, [80, 70], 2) === false, 'bishop at 90 % hit by 2 monsters, team >= 70 %: NOT held (res now)');
check(fh(90, [80, 70], 3) === true, '3 monsters on the bishop: held');
check(fh(55, [80], 1) === true, 'bishop below 60 %: held (heals itself first)');
check(fh(95, [45], 0) === true, 'a teammate below 50 %: held (heal first)');
check(fh(95, [80], 0) === false, 'nobody low, nothing on it: not held');
check(host({ now: () => T, livePos: {}, partyRows: () => [], PartyList: [], num: Number, Me: { HpPercent: 95 }, RESX: M.RESX, healTargets: () => [{ me: true, hp: 95 }], escAttackers: () => mobs(2).map(m => Object.assign(m, { cc: 'sleep' })).concat(mobs(1)) }).resFightHold() === false, 'crowd-controlled monsters do not count');

// ---- 3) huntDeadFightOk ------------------------------------------------------------------------------------------------------------
const J = new Function(blk('// TEAMJOIN-PURE-BEGIN', '// TEAMJOIN-PURE-END') + '\nreturn { huntDeadFightOk, huntGatherDecide };')();
const sp = [{ name: 'Bishop2', d: 30, dead: false }, { name: 'Destroyer5', d: 50, dead: false }, { name: 'Chanter2', d: 80, dead: true }];
check(J.huntDeadFightOk({ spread: sp, lim: 9000, fighting: true }) === true, 'Destroyer3 replay: Chanter2 dead 80 away, the team is hit -> the leader FIGHTS on (no gather / stopCombat)');
check(J.huntDeadFightOk({ spread: sp, lim: 9000, fighting: false }) === false, 'nobody hit any more -> gather (wait for the res, no new pulls)');
check(J.huntDeadFightOk({ spread: sp.concat([{ name: 'Far', d: 20000, dead: false }]), lim: 9000, fighting: true }) === false, 'a living teammate far away too -> the gather rules (unchanged)');
check(J.huntDeadFightOk({ spread: [{ name: 'W', d: 15000, dead: true }], lim: 9000, fighting: true }) === false, 'a body far away (respawned / other area) -> gather rules');
check(J.huntDeadFightOk({ spread: sp.slice(0, 2), lim: 9000, fighting: true }) === false, 'nobody dead -> not this rule');
check(J.huntGatherDecide({ spread: sp, lim: 9000 }) === 'gather', 'huntGatherDecide itself unchanged (a dead teammate = gather)');

// ---- 4) wiring --------------------------------------------------------------------------------------------------------------------
const has = (re, what) => check(re.test(src), 'wiring: ' + what);
has(/if \(IsInCombat && !partyHitNow\(\)\) stopCombatG\(\);/, 'gatherTeamInner never drops the fight while the party is hit');
has(/if \(\/\^during hunt\$\/\.test\(String\(why\)\) && huntDeadFightOk\(\{ spread: teamSpread\(\)/, 'gatherTeamInner (during hunt) returns to the hunt loop when only a dead teammate near is missing and we are hit');
has(/const deadFight = !solo && huntDeadFightOk\(\{ spread: teamSpread\(\), lim: huntLim, fighting: partyHitNow\(\)/, 'autolevel loop: skips the gather while fighting with a dead teammate near');
has(/if \(!solo && !deadFight && teamSpread\(\)\.some\(m => m\.d > huntLim \|\| m\.dead\)\)/, 'autolevel loop: gather only when not fighting on');
has(/function partyHitNow\(\) \{ return now\(\) - \(lastAttackerOnMe\.at \|\| 0\) < 6000 \|\| now\(\) - \(teamHitAt\.at \|\| 0\) < 6000; \}/, 'partyHitNow = me or a teammate hit < 6 s');
has(/teamOf\(d\.name\) !== teamOf\(Me\.Name\)\) return;\n  teamHitAt\.at = now\(\);/, 'swarm.attacked records every teammate hit');
has(/now\(\) - lastAttackerOnMe\.at < 4000 && !inRaid\(\) && !isHealerRole\(\)/, 'resMeBusy: being hit does not make a healer busy');
has(/hold: isHealerRole\(\) \? resFightHold\(\) : false \}; \} catch/, 'swarm.pos res kit carries the healer\'s own hold');
has(/hold: rk && typeof rk\.hold === 'boolean' \? rk\.hold : undefined/, 'resGather reads the teammates\' hold');
has(/deadMs: now\(\) - ds\[n\]/, 'resGather: how long each body lies there');
has(/why = `\$\{job\.dead\} is already alive`; delete RES\.tried\[job\.dead\];/, 'resRun: a wrong "already alive" is retried at once (no 20 s pause)');
has(/while \(now\(\) - t2 < 16000 && resStillDead\(job\.dead, t2\)\)/, 'resRun: the accept wait trusts a report sent after the cast');
check(!/now\(\) - \(lastAttackerOnMe\.at \|\| 0\) < 4000 \|\| num\(Me\.HpPercent\) < 50/.test(src), 'the old "hit < 4 s = hold" res rule is gone');

console.log(`\n${n - fails} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
