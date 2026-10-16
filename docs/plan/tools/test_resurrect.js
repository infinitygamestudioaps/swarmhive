// OFFLINE TEST of RESURRECTION (owner 2026-10-13 21:00, party Tank3 at Tillion: the only bishop Bishop4 died, the doomcryer Chanter4
// carried 3 Scrolls of Resurrection and nobody raised her). Runs the RES-PURE block of Scripts_dev/swarm.js in node + the dashboard side:
//   node docs/plan/tools/test_resurrect.js            (exit code 1 when a check fails)
// Covers: res skills by name (never Purify / a scroll's skill), the settings layers (built-in < all parties < party, bad values ignored) and the
// same rules in Dashboard/resrules_api.js, resDecide (who + how per situation: skill first, scrolls by anyone, healer > tank > rest, one job per
// resser, raid exceptions incl. the owner's "a dead healer may be scrolled in a raid", the 85 % gate, automatic off / scrolls off / who may read
// scrolls / walking reach / floors / Kamaloka / claims / delevel, manual orders), the Tillion replay (old rule: nobody; new: Chanter4 scrolls
// Bishop4), resAfterStep (rebuff FIRST, healer heals next, then back; a dying teammate cuts a healer's buffing short), the API's applyChange,
// the Resurrect dialog's pure helpers (Dashboard/respanel.js), the command catalog and the swarm.js wiring.
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const src = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
const a = src.indexOf('// RES-PURE-BEGIN'), b = src.indexOf('// RES-PURE-END');
if (a < 0 || b < a) { console.error('RES-PURE block not found'); process.exit(1); }
const M = new Function(src.slice(a, b) + '\nreturn { RESX, resIsResSkill, resIsMass, resRulesFor, resRulesClean, resDecide, resAfterStep, resPickScroll, resScrollUser };')();
const API = require(path.join(ROOT, 'Dashboard', 'resrules_api.js'));
const RP = require(path.join(ROOT, 'Dashboard', 'respanel.js'));
let fails = 0, n = 0;
const check = (ok, what) => { n++; console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails++; };
const R = (o) => Object.assign({}, M.RESX.defaults, o || {});
const job = (d, who) => (d.jobs || []).find(j => j.dead === who);
const wait = (d, who) => ((d.waits || []).find(w => w.dead === who) || {}).why || '';

// ---- 1) res skills by name -------------------------------------------------------------------------------------------------
['Resurrection', 'Mass Resurrection', 'Greater Resurrection', 'Blessed Resurrection', 'Battle Resurrection'].forEach(s => check(M.resIsResSkill(s), `res skill: ${s}`));
['Purify', 'Scroll of Resurrection', 'Blessed Scroll of Resurrection', 'Resurrection Possible', 'Presentation - Resurrection Possible', 'Revival', 'Heal'].forEach(s => check(!M.resIsResSkill(s), `not a res skill: ${s}`));
check(M.resIsMass('Mass Resurrection') && !M.resIsMass('Resurrection'), 'Mass Resurrection is the mass one');

// ---- 2) settings layers (swarm.js) == the API's ------------------------------------------------------------------------------
let r = M.resRulesFor({}, 'Tank3');
check(r.auto === true && r.scrolls === true && r.raidHealerScrolls === true && r.raidAllScrolls === false && r.scrollWho === 'anyone' && r.maxWalk === 6000, 'missing file = automatic ON, scrolls ON, healer scrolls in raids ON, others OFF, walk 6000');
const J = { default: { maxWalk: 9000, raidAllScrolls: true }, parties: { Tank3: { auto: false, scrollWho: 'names', scrollNames: ['Chanter4', 'bad name!'], maxWalk: 50, scrolls: 'yes' } } };
r = M.resRulesFor(J, 'Tank3');
check(r.auto === false && r.src.auto === 'party', 'party layer wins (auto off)');
check(r.maxWalk === 9000 && r.src.maxWalk === 'all', 'a bad party value (maxWalk 50) falls back to the all-parties value 9000');
check(r.scrolls === true && r.src.scrolls === 'default', 'a non-boolean ("yes") is ignored -> built-in default');
check(JSON.stringify(r.scrollNames) === '["Chanter4"]', 'scroll names: only character names');
check(M.resRulesFor(J, 'Other').auto === true && M.resRulesFor(J, 'Other').raidAllScrolls === true, 'another party: the all-parties layer');
const same = ['Tank3', 'Other', 'Zz'].every(L => { const x = M.resRulesFor(J, L), y = API.resRulesFor(J, L); return JSON.stringify(x) === JSON.stringify(y); });
check(same, 'Dashboard/resrules_api.js resRulesFor == swarm.js RES-PURE resRulesFor');
check(JSON.stringify(API.DEFAULTS) === JSON.stringify(M.RESX.defaults), 'API DEFAULTS == RESX.defaults');

// ---- 3) resDecide --------------------------------------------------------------------------------------------------------------
const P = (name, x, y, extra) => Object.assign({ name, x, y, z: -3700 }, extra || {});
const bishop = (name, x, y, extra) => P(name, x, y, Object.assign({ healer: true, skill: { id: 1016, name: 'Resurrection', ready: true }, sor: 0, bsor: 0 }, extra || {}));
// (a) the Tillion replay: Bishop4 (bishop) dead, Chanter4 (doomcryer, 3 scrolls) alive, Tank3 (tank, none), RAID mode
const deadLumi = P('Bishop4', 43512, 218744, { healer: true });
const rage = (x, y) => P('Chanter4', x, y, { sor: 3, sorId: 737 }), dusk = P('Tank3', 43048, 219720, { tank: true, sor: 0 });
let d = M.resDecide({ dead: [deadLumi], alive: [rage(43357, 217900), dusk], rules: R(), raid: true, raidHpOk: false });
check(job(d, 'Bishop4') && job(d, 'Bishop4').by === 'Chanter4' && job(d, 'Bishop4').how === 'scroll' && job(d, 'Bishop4').itemId === 737, `Tillion: Chanter4 reads a Scroll of Resurrection on Bishop4 mid-raid (${(job(d, 'Bishop4') || {}).why})`);
// the old rule (chooseResurrector 2026-10-05): within 1500 only, never a scroll in a raid
const oldRule = (o) => { if (o.raid) return null; const c = o.alive.filter(x => Math.hypot(x.x - o.dead.x, x.y - o.dead.y) <= 1500 && x.sor > 0); return c.length ? c[0].name : null; };
check(oldRule({ dead: deadLumi, alive: [rage(43357, 217900), dusk], raid: true }) === null, 'Tillion: the OLD rule picked nobody (raid = no scrolls)');
// where Chanter4 really stood (43357,206866: ~11.9k away) -> beyond the default walk: a clear reason; an order reaches 12000
d = M.resDecide({ dead: [deadLumi], alive: [rage(43357, 206866), dusk], rules: R(), raid: true, raidHpOk: false });
check(!job(d, 'Bishop4') && /Chanter4\) is 1\d{4} away/.test(wait(d, 'Bishop4')), `Tillion at 11.9k: waits with a reason (${wait(d, 'Bishop4')})`);
d = M.resDecide({ dead: [deadLumi], alive: [rage(43357, 206866), dusk], rules: R({ maxWalk: 15000 }), raid: true, raidHpOk: false });
check(job(d, 'Bishop4') && job(d, 'Bishop4').by === 'Chanter4', 'party setting "walk at most 15,000": Chanter4 goes');
d = M.resDecide({ dead: [deadLumi], alive: [rage(43357, 206866), dusk], rules: R(), raid: true, manual: { dead: 'Bishop4' } });
check(job(d, 'Bishop4') && job(d, 'Bishop4').by === 'Chanter4', 'your order (!res Bishop4) reaches 12000');
// (b) skill first: a living bishop with Resurrection beats a scroll carrier
d = M.resDecide({ dead: [P('Destroyer1', 0, 0)], alive: [bishop('Bishop1', 300, 0), P('Necro1', 100, 0, { sor: 5 })], rules: R() });
check(job(d, 'Destroyer1').by === 'Bishop1' && job(d, 'Destroyer1').how === 'skill' && job(d, 'Destroyer1').skillId === 1016, 'skill first: the bishop casts Resurrection (no scroll used)');
// (c) skill not ready -> a scroll from someone else; mass res when the single one is on cooldown
d = M.resDecide({ dead: [P('Destroyer1', 0, 0)], alive: [bishop('Bishop1', 300, 0, { skill: { id: 1016, name: 'Resurrection', ready: false } }), P('Necro1', 100, 0, { sor: 5 })], rules: R() });
check(job(d, 'Destroyer1').by === 'Necro1' && job(d, 'Destroyer1').how === 'scroll', 'Resurrection on cooldown: Necro1 reads a scroll');
d = M.resDecide({ dead: [P('Destroyer1', 0, 0)], alive: [bishop('Bishop1', 300, 0, { skill: { id: 1016, name: 'Resurrection', ready: false }, mass: { id: 1254, name: 'Mass Resurrection', ready: true } })], rules: R() });
check(job(d, 'Destroyer1').how === 'skill' && job(d, 'Destroyer1').skillId === 1254, 'Resurrection on cooldown, Mass Resurrection ready: the mass one');
// (d) healer priority: the bishop and a destroyer dead, one scroll carrier -> the bishop first, the destroyer waits for it
d = M.resDecide({ dead: [P('Destroyer1', 50, 0), P('Bishop1', 900, 0, { healer: true }), P('Tank1', 60, 0, { tank: true })], alive: [P('Necro1', 0, 0, { sor: 2 })], rules: R() });
check(d.jobs.length === 1 && job(d, 'Bishop1') && job(d, 'Bishop1').by === 'Necro1', 'healer first: the dead bishop gets the only scroll carrier although the destroyer lies nearer');
check(/Necro1 resurrects Bishop1 first/.test(wait(d, 'Tank1')) && /first/.test(wait(d, 'Destroyer1')), `the others wait for him (${wait(d, 'Tank1')})`);
d = M.resDecide({ dead: [P('Destroyer1', 50, 0), P('Tank1', 60, 0, { tank: true })], alive: [P('Necro1', 0, 0, { sor: 2 }), P('Inspector1', 0, 50, { sor: 1 })], rules: R() });
check(job(d, 'Tank1') && job(d, 'Destroyer1') && job(d, 'Tank1').by !== job(d, 'Destroyer1').by, 'two ressers, two dead: one each (the tank before the destroyer)');
// (e) scroll users: non-healers / non-tanks first, the healer last
d = M.resDecide({ dead: [P('Destroyer1', 0, 0)], alive: [P('Bishop1', 50, 0, { healer: true, sor: 5 }), P('Tank1', 60, 0, { tank: true, sor: 5 }), P('Necro1', 900, 0, { sor: 1 })], rules: R() });
check(job(d, 'Destroyer1').by === 'Necro1', 'scroll: Necro1 (a dealer) goes although the healer and the tank stand nearer');
d = M.resDecide({ dead: [P('Destroyer1', 0, 0)], alive: [P('Bishop1', 50, 0, { healer: true, sor: 5 }), P('Tank1', 60, 0, { tank: true, sor: 5 })], rules: R() });
check(job(d, 'Destroyer1').by === 'Tank1', 'scroll: the tank before the healer');
// (f) raid rules
d = M.resDecide({ dead: [P('Destroyer1', 0, 0)], alive: [P('Necro1', 100, 0, { sor: 5 })], rules: R(), raid: true });
check(!job(d, 'Destroyer1') && /raid: no Scroll of Resurrection on a non-healer/.test(wait(d, 'Destroyer1')), 'raid: no scroll on a dead destroyer (the 2026-10-05 rule stays)');
d = M.resDecide({ dead: [P('Destroyer1', 0, 0)], alive: [P('Necro1', 100, 0, { sor: 5 })], rules: R({ raidAllScrolls: true }), raid: true });
check(job(d, 'Destroyer1') && job(d, 'Destroyer1').by === 'Necro1', 'raid + "scroll anyone" switched on: Necro1 scrolls the destroyer');
d = M.resDecide({ dead: [P('Bishop4', 0, 0, { healer: true })], alive: [P('Necro1', 100, 0, { sor: 5 })], rules: R({ raidHealerScrolls: false }), raid: true });
check(!job(d, 'Bishop4') && /scrolls on a healer are switched off/.test(wait(d, 'Bishop4')), 'raid + "scroll a dead healer" off: no scroll');
d = M.resDecide({ dead: [P('Destroyer1', 0, 0)], alive: [bishop('Bishop1', 300, 0)], rules: R(), raid: true, raidHpOk: false });
check(!job(d, 'Destroyer1') && /heals first/.test(wait(d, 'Destroyer1')), 'raid: the bishop heals first while someone alive is below 85 %');
d = M.resDecide({ dead: [P('Destroyer1', 0, 0)], alive: [bishop('Bishop1', 300, 0)], rules: R(), raid: true, raidHpOk: true });
check(job(d, 'Destroyer1') && job(d, 'Destroyer1').how === 'skill', 'raid: everyone >= 85 % -> the bishop resurrects');
d = M.resDecide({ dead: [P('Bishop5', 0, 0, { healer: true })], alive: [bishop('Bishop6', 300, 0), P('Nuker13', 200, 0, { sor: 2 })], rules: R(), raid: true, raidHpOk: false });
check(job(d, 'Bishop5') && job(d, 'Bishop5').by === 'Nuker13' && job(d, 'Bishop5').how === 'scroll', 'raid: a dead bishop while the other bishop must heal -> a sorcerer scrolls her (two healers again)');
// (g) switches
d = M.resDecide({ dead: [P('Destroyer1', 0, 0)], alive: [bishop('Bishop1', 300, 0)], rules: R({ auto: false }) });
check(!d.jobs.length && /switched off/.test(wait(d, 'Destroyer1')), 'automatic res off: nobody acts by itself');
d = M.resDecide({ dead: [P('Destroyer1', 0, 0)], alive: [bishop('Bishop1', 300, 0)], rules: R({ auto: false }), manual: { dead: 'Destroyer1' } });
check(job(d, 'Destroyer1') && job(d, 'Destroyer1').by === 'Bishop1', 'automatic res off + your order: done');
d = M.resDecide({ dead: [P('Destroyer1', 0, 0)], alive: [P('Necro1', 100, 0, { sor: 5 })], rules: R({ scrolls: false }) });
check(!job(d, 'Destroyer1') && /scrolls are switched off/.test(wait(d, 'Destroyer1')), 'scrolls off: no scroll');
d = M.resDecide({ dead: [P('Destroyer1', 0, 0)], alive: [P('Necro1', 100, 0, { sor: 5 })], rules: R({ scrolls: false }), raid: true, manual: { dead: 'Destroyer1', by: 'Necro1', how: 'scroll' } });
check(job(d, 'Destroyer1') && job(d, 'Destroyer1').how === 'scroll', 'your order: a scroll even with scrolls off and in a raid (warn, never refuse)');
d = M.resDecide({ dead: [P('Destroyer1', 0, 0)], alive: [P('Tank1', 100, 0, { tank: true, sor: 5 })], rules: R({ scrollWho: 'nottank' }) });
check(!job(d, 'Destroyer1') && /may not use them/.test(wait(d, 'Destroyer1')), 'who may read scrolls = not the tank: the tank does not');
d = M.resDecide({ dead: [P('Destroyer1', 0, 0)], alive: [P('Necro1', 100, 0, { sor: 5 }), P('Inspector1', 50, 0, { sor: 5 })], rules: R({ scrollWho: 'names', scrollNames: ['Necro1'] }) });
check(job(d, 'Destroyer1').by === 'Necro1', 'who may read scrolls = only chosen (Necro1): Necro1, not the nearer Inspector1');
// (h) scroll kind
d = M.resDecide({ dead: [P('Destroyer1', 0, 0)], alive: [P('Necro1', 100, 0, { sor: 5, sorId: 737, bsor: 2, bsorId: 3936 })], rules: R() });
check(job(d, 'Destroyer1').how === 'scroll' && job(d, 'Destroyer1').itemId === 737, 'normal scroll first');
d = M.resDecide({ dead: [P('Destroyer1', 0, 0)], alive: [P('Necro1', 100, 0, { sor: 5, sorId: 737, bsor: 2, bsorId: 3936 })], rules: R({ blessedFirst: true }) });
check(job(d, 'Destroyer1').how === 'blessed' && job(d, 'Destroyer1').itemId === 3936, 'blessed first (setting)');
d = M.resDecide({ dead: [P('Destroyer1', 0, 0)], alive: [P('Necro1', 100, 0, { sor: 0, bsor: 2, bsorId: 3936 })], rules: R() });
check(job(d, 'Destroyer1').how === 'blessed', 'only blessed scrolls: a blessed one');
d = M.resDecide({ dead: [P('Destroyer1', 0, 0)], alive: [P('Necro1', 100, 0, { sor: 5 })], rules: R(), manual: { dead: 'Destroyer1', by: 'Necro1', how: 'blessed' } });
check(!job(d, 'Destroyer1') && /Blessed Scroll/.test(wait(d, 'Destroyer1')), 'order "blessed" without one: a clear reason');
d = M.resDecide({ dead: [P('Destroyer1', 0, 0)], alive: [P('Necro1', 100, 0, { sor: 5 })], rules: R(), manual: { dead: 'Destroyer1', by: 'Necro1', how: 'skill' } });
check(!job(d, 'Destroyer1') && /resurrection skill/.test(wait(d, 'Destroyer1')), 'order "skill" without one: a clear reason');
// (i) reach, floors, Kamaloka, claims, delevel, busy
d = M.resDecide({ dead: [P('Destroyer1', 0, 0, { z: -3700 })], alive: [P('Necro1', 100, 0, { z: -1500, sor: 5 })], rules: R() });
check(!job(d, 'Destroyer1') && /another floor/.test(wait(d, 'Destroyer1')), 'another floor (2200 higher): not reachable');
d = M.resDecide({ dead: [P('Destroyer1', 0, 0, { z: -7500 })], alive: [P('Necro1', 3500, 0, { z: -7000, sor: 5 })], rules: R({ maxWalk: 1500 }), kama: true });
check(job(d, 'Destroyer1') && job(d, 'Destroyer1').by === 'Necro1', 'Kamaloka: bodies all over the room (4000, no floors)');
d = M.resDecide({ dead: [P('Destroyer1', 0, 0, { claimedBy: 'Inspector1' })], alive: [P('Necro1', 100, 0, { sor: 5 })], rules: R() });
check(!d.jobs.length && /Inspector1 is already on the way/.test(wait(d, 'Destroyer1')), 'claimed body: nobody else goes (no double scroll)');
d = M.resDecide({ dead: [P('Healer6', 0, 0, { dlv: true })], alive: [P('Necro1', 100, 0, { sor: 5 })], rules: R() });
check(!d.jobs.length && !d.waits.length, 'delevel (dying on purpose): never resurrected');
d = M.resDecide({ dead: [P('Destroyer1', 0, 0)], alive: [P('Necro1', 100, 0, { sor: 5, busy: true }), P('Inspector1', 2000, 0, { sor: 1 })], rules: R() });
check(job(d, 'Destroyer1').by === 'Inspector1', 'busy (being hit / trading): the next one goes');
d = M.resDecide({ dead: [P('Destroyer1', 0, 0)], alive: [P('Necro1', 100, 0, { sor: 0 }), P('Inspector1', 50, 0)], rules: R() });
check(!d.jobs.length && /nobody near Destroyer1 has a resurrection skill or a Scroll/.test(wait(d, 'Destroyer1')), 'nobody has anything: says so');
// (j) the same answer in every window: positions 2 s old (a 150 difference) do not flip the choice
const w1 = M.resDecide({ dead: [P('Destroyer1', 0, 0)], alive: [P('Necro1', 1000, 0, { sor: 1 }), P('Inspector1', 1100, 0, { sor: 1 })], rules: R() });
const w2 = M.resDecide({ dead: [P('Destroyer1', 0, 0)], alive: [P('Necro1', 1150, 0, { sor: 1 }), P('Inspector1', 1050, 0, { sor: 1 })], rules: R() });
check(job(w1, 'Destroyer1').by === job(w2, 'Destroyer1').by, `two windows with slightly different positions pick the same resser (${job(w1, 'Destroyer1').by})`);

// ---- 4) after the res: rebuff FIRST ------------------------------------------------------------------------------------------
const T = 1000000;
let s = M.resAfterStep({ now: T + 1000, at: T, phase: 'buff', board: true, boardTries: 0, boardOk: false, maxBoard: 2, selfAllowed: false, selfLow: 3, healer: true, hurt: 2 });
check(s.act === 'board', 'revived bishop: Community Board Buff Me FIRST (before any heal)');
s = M.resAfterStep({ now: T + 4000, at: T, phase: 'buff', board: true, boardTries: 1, boardOk: true, selfAllowed: false, selfLow: 3, healer: true, hurt: 2 });
check(s.act === 'heal' && s.phase === 'heal', 'board buffs on -> no own self buffs (user rule) -> heal the party');
s = M.resAfterStep({ now: T + 9000, at: T, phase: 'heal', healSince: T + 4000, healer: true, hurt: 1 });
check(s.act === 'heal', 'heals while someone is below 75 %');
s = M.resAfterStep({ now: T + 25000, at: T, phase: 'heal', healSince: T + 4000, healer: true, hurt: 1 });
check(s.act === 'done', 'healing phase ends after 20 s (the healer brain keeps healing) -> back to the party');
s = M.resAfterStep({ now: T + 5000, at: T, phase: 'heal', healSince: T + 4000, healer: true, hurt: 0 });
check(s.act === 'done', 'party healed -> back to the party');
s = M.resAfterStep({ now: T + 2000, at: T, phase: 'buff', board: true, boardTries: 1, boardOk: false, maxBoard: 1, selfAllowed: true, selfLow: 2, healer: false });
check(s.act === 'self', 'raid / combat: the board refused once -> its own self buffs');
s = M.resAfterStep({ now: T + 2000, at: T, phase: 'buff', board: false, selfAllowed: true, selfLow: 0, healer: false });
check(s.act === 'done', 'no board, nothing to cast: back at once');
s = M.resAfterStep({ now: T + 7000, at: T, phase: 'buff', board: true, boardTries: 1, boardOk: false, maxBoard: 2, selfAllowed: true, selfLow: 2, healer: true, hurt: 2, dying: true });
check(s.act === 'heal' && /cut short/.test(s.why), 'a teammate dying: the revived healer stops buffing after 6 s and heals');
s = M.resAfterStep({ now: T + 26000, at: T, phase: 'buff', board: true, boardTries: 0, selfAllowed: true, selfLow: 2, healer: false });
check(s.act === 'done', 'buff phase never longer than 25 s');
// sequence: a non-healer whose board works
const seq = []; let st = { phase: 'buff', boardTries: 0, boardOk: false };
for (let i = 0; i < 5; i++) { const x = M.resAfterStep(Object.assign({ now: T + i * 2000, at: T, board: true, maxBoard: 2, selfAllowed: !st.boardOk, selfLow: st.boardOk ? 0 : 2, healer: false }, st)); seq.push(x.act); if (x.act === 'board') { st.boardTries++; st.boardOk = true; } if (x.act === 'done') break; }
check(seq.join(',') === 'board,done', `non-healer: ${seq.join(' -> ')}`);

// ---- 5) the API: one party's entry, validation ----------------------------------------------------------------------------------
let A = API.applyChange({ default: { maxWalk: 9000 }, parties: { Other: { auto: false } } }, { party: 'Tank3', values: { raidAllScrolls: true, scrollWho: 'names', scrollNames: ['Chanter4'], maxWalk: 10000 } });
check(A.ok && JSON.stringify(A.data.parties.Tank3) === JSON.stringify({ raidAllScrolls: true, scrollWho: 'names', scrollNames: ['Chanter4'], maxWalk: 10000 }) && A.data.parties.Other.auto === false && A.data.default.maxWalk === 9000, 'API: only that party\'s entry changes');
A = API.applyChange(A.data, { party: 'Tank3', values: { raidAllScrolls: null, scrollWho: null, scrollNames: null, maxWalk: null } });
check(A.ok && !A.data.parties.Tank3, 'API: null removes a key; an empty entry disappears');
A = API.applyChange({}, { party: 'Tank3', values: { auto: 'yes', scrollWho: 'everyone', maxWalk: 99999, scrollNames: ['a b'], bogus: 1 } });
check(!A.ok && A.errors.length === 5, `API: bad values are refused (${(A.errors || []).length} errors)`);
check(!API.applyChange({}, { party: '../x', values: {} }).ok, 'API: party must be a character name');

// ---- 6) the Resurrect dialog (Dashboard/respanel.js, pure helpers) ----------------------------------------------------------------
const chars = [
  { name: 'Tank3', party: 'Tank3', role: 'sk', ageSec: 2, x: 43048, y: 219720, resKit: { sk: '', sor: 0, bsor: 0 } },
  { name: 'Bishop4', party: 'Tank3', role: 'bishop', ageSec: 2, dead: true, x: 43512, y: 218744, resKit: { sk: 'Resurrection', sor: 0 } },
  { name: 'Chanter4', party: 'Tank3', role: 'doomcryer', ageSec: 2, x: 43357, y: 217900, resKit: { sk: '', sor: 3, bsor: 1 } },
  { name: 'Nuker7', party: 'Tank3', role: 'nuker', ageSec: 2, x: 43357, y: 190000, resKit: { sk: '', sor: 2 } },
  { name: 'Other', party: 'Zed', ageSec: 2, x: 43357, y: 217900, resKit: { sk: 'Resurrection', sor: 9 } },
  { name: 'Offline', party: 'Tank3', ageSec: 900, x: 43357, y: 217900, resKit: { sk: 'Resurrection', sor: 9 } },
];
const ch = RP.choices('Bishop4', chars);
check(ch.length === 3 && ch[0].by === 'Chanter4' && ch[0].how === 'scroll' && /Scroll of Resurrection \(3\)/.test(ch[0].label), `dialog: Chanter4's scroll first, then blessed, then far Nuker7 (${ch.map(c => c.label + ' · ' + c.sub).join(' | ')})`);
check(!ch.some(c => c.by === 'Other' || c.by === 'Offline' || c.by === 'Bishop4'), 'dialog: only living, reporting members of the same party');
check(ch[2].by === 'Nuker7' && ch[2].far, 'dialog: a member farther than 12000 is marked "too far" and listed last');
check(JSON.stringify(RP.sendPlan('Bishop4', 'Tank3', ch[0])) === JSON.stringify({ target: 'char:Chanter4', cmd: '!ov Chanter4 res Bishop4 scroll' }), 'dialog: a choice = !ov <who> res <dead> <how> to that character');
check(RP.sendPlan('Bishop4', 'Tank3', 'auto').cmd === '!res Bishop4' && RP.sendPlan('', 'Tank3', 'all').cmd === '!resall', 'dialog: automatic = !res <dead> to the party, Res all dead = !resall');
const pi = RP.partyInfo([chars[1], Object.assign({}, chars[2], { resLive: { job: { dead: 'Bishop4', how: 'scroll', phase: 'walk' } } })]);
check(pi.dead.length === 1 && /Chanter4 is walking over with a Scroll of Resurrection/.test(pi.dead[0].status), `party card: "${pi.dead[0].status}"`);
const pi2 = RP.partyInfo([Object.assign({}, chars[1], { dead: false, resLive: { after: { phase: 'buff', by: 'Chanter4', why: 'rebuffing first: Community Board Buff Me' } } })]);
check(pi2.revived.length === 1 && /alive again \(Chanter4\) — rebuffing first/.test(pi2.revived[0].status), `party card after the res: "${pi2.revived[0].status}"`);
const pi3 = RP.partyInfo([chars[1], Object.assign({}, chars[0], { resLive: { waits: [{ dead: 'Bishop4', why: 'nobody alive within 6000 of Bishop4' }] } })]);
check(/waiting: nobody alive within 6000/.test(pi3.dead[0].status), 'party card: why the body still lies there');

// ---- 7) command catalog + swarm.js wiring --------------------------------------------------------------------------------------
const C = require(path.join(ROOT, 'Dashboard', 'commands.js'));
check(C.SWARM_WORDS.includes('!res') && C.SWARM_WORDS.includes('!resall'), 'catalog: !res and !resall are swarm commands (server ALLOWED)');
const ov = C.COMMANDS.find(c => c.id === 'ovres');
check(ov && /\{how\}/.test(ov.tpl) && ov.args.some(x => x.key === 'how'), 'catalog: Override resurrect takes "how" (skill / scroll / blessed)');
const has = (re, what) => check(re.test(src), 'wiring: ' + what);
has(/globalThis\.OnRevive = \(objId\) => \{\n  if \(!IsMe\(objId\)\) return;\n  try \{ if \(resAfterRevive\(\)\) return; \}/, 'OnRevive -> resAfterRevive (rebuff first) before the old buff-turn request');
has(/state\.buffTurn \|\| resAfterHold\(\)\) return;/, 'healer brain holds while the revived healer rebuffs');
has(/scrolls: itemCount\(737\), rk: resPosKit\(\)/, 'swarm.pos carries the res kit');
has(/livePos\[d\.name\]\.rk = /, 'teammates keep the res kit');
has(/if \(cmd === '!res' \|\| cmd === '!resall'\) \{ resOrder\(parts\); return; \}/, 'handleSay: !res / !resall');
has(/const r = await resManual\(t\.name, howW === 'auto' \? '' : howW\);/, '!ov <name> res <dead> <how> -> resManual (walks into range)');
has(/< resWaitReach\(\) &&/, 'deathWait waits for ressers within their walking reach');
has(/now\(\) - RES\.incomingAt < 25000/, 'deathWait keeps waiting while a res is on its way');
has(/st\.resKit = resKitPublic\(\); st\.resLive = resPublic\(\);/, 'swarm_state: resKit + resLive for the dashboard');
has(/Send\.DlgAnswer\(1510, 1, 0\)/, 'the dead side answers the res dialog (fallback)');
has(/resSkills: \[1016, 1254\] \}/, 'Purify 1018 is no longer a res skill');
check(!/const scrolls = inRaid\(\) \? 0 : itemCount\(737\)/.test(src), 'the old "never a scroll in a raid" hive res is gone');
check(!/function chooseResurrector\(/.test(src), 'the old chooseResurrector is gone');
const srv = fs.readFileSync(path.join(ROOT, 'Dashboard', 'server.js'), 'utf8');
check(/require\('\.\/resrules_api'\)\.handle/.test(srv), 'server.js: /api/resrules + /respanel.js hook');
const ps = fs.readFileSync(path.join(ROOT, 'Dashboard', 'partysettings.js'), 'utf8');
check(/secRes\(\)/.test(ps) && /res: '\/api\/resrules'/.test(ps), 'party settings popup: Resurrection section');
const ix = fs.readFileSync(path.join(ROOT, 'Dashboard', 'index.html'), 'utf8');
check(/<script src="\/respanel\.js"><\/script>/.test(ix) && /ResPanel\.rowButton\(c\)/.test(ix) && /ResPanel\.partyHtml\(leader, list\)/.test(ix), 'index.html: respanel.js + row button + party card');
check(/ResPanel\.button\(CP\.name, true\)/.test(fs.readFileSync(path.join(ROOT, 'Dashboard', 'charpage.js'), 'utf8')), 'character page: Resurrect button');
check(!/\b(alert|confirm|prompt)\(/.test(fs.readFileSync(path.join(ROOT, 'Dashboard', 'respanel.js'), 'utf8').replace(/ui(Alert|Confirm|Prompt)\(/g, '')), 'respanel.js: no browser alert / confirm / prompt');

// ---- 8) the host (RES-HOST) with a stubbed game: the Tillion scene end to end, the revived bishop's sequence, an order --------------------
(async () => {
  const ha = src.indexOf('// RES-HOST-BEGIN'), hb = src.indexOf('// RES-HOST-END');
  check(ha > 0 && hb > ha, 'RES-HOST block found');
  function world(o) {
    const W = { t: 1e9, log: [], timers: [], target: 0, inv: Object.assign({}, o.inv || {}), alive: {}, bot: true, follow: true, events: {}, emits: [], buffs: 0, hurt: o.hurt || 0, cast: [] };
    const Me = Object.assign({ objId: 1, Level: 70, HpPercent: 100, MpPercent: 90, MP: 900, IsSitting: false, IsInCombat: false }, o.me);
    const party = o.party.map(p => Object.assign({}, p));
    const S = {
      num: (v) => (typeof v === 'bigint' ? Number(v) : (Number(v) || 0)), now: () => W.t, fileStamp: () => '', File: { ReadAllText: () => '{}' }, SWARM_ROOT: 'X',
      CONFIG: { leader: o.leader, hive: { resDist: 1500 }, roster: o.roster || {}, autoSkills: { selfBuffMinGapSec: 60, selfBuffRefreshSec: 30 }, buffs: { schemes: { bishop: ['Mystic'], doomcryer: ['Warrior'] } } },
      teamOf: () => o.leader, teamNames: () => party.map(p => p.Name).filter(n => n !== Me.Name), livePos: {}, partyRows: () => party, PartyList: party,
      Me, state: { role: o.role, mode: o.raid ? 'raid' : 'autolevel' }, isHealerRole: () => /bishop/.test(o.role), HEALER_ROLES: /healer|bishop|shilliensaint/, ROLE_RE: { tank: /^(sk|tank)$/ },
      rkSkillList: () => (o.skills || []).map(n => ({ Id: n[0], Name: n[1] })), SkillsList: { GetItemByID: (id) => { const k = (o.skills || []).find(x => x[0] === id); return k ? { Id: id, Name: k[1], IsReady: true, MP: 50, HitTime: 3000 } : null; } },
      itemCount: (id) => W.inv[id] || 0, DLV: { on: false }, lastAttackerOnMe: { at: 0 }, inRaid: () => !!o.raid, tradeState: null,
      App: { on: (n, f) => { W.events[n] = f; }, emit: (n, d) => { W.emits.push(n + ' ' + JSON.stringify(d)); W.log.push('emit ' + n); } },
      note: (m) => W.log.push('note ' + m), intent: (a, d) => W.log.push('intent ' + a + ': ' + d), intentDone: (a, ok, d) => W.log.push(`done ${a} ${ok ? 'OK' : 'FAIL'}: ${d}`), logError: (w, e) => W.log.push('ERROR ' + w + ' ' + (e && e.stack || e)),
      Options: { get ActiveFollow() { return W.follow; }, set ActiveFollow(v) { W.follow = v; W.log.push('follow ' + v); }, AutoResurrect: true },
      isLeader: () => Me.Name === o.leader, standUp: () => { }, get IsEnabled() { return W.bot; }, DisableBot: () => { W.bot = false; W.log.push('bot off'); }, EnableBot: () => { W.bot = true; W.log.push('bot on'); },
      inKamaInstance: () => false, instMove: () => { }, rgWalkInside: async () => null,
      walkDirect: async (x, y) => { W.log.push(`walk ${Math.round(Math.hypot(x - Me.X, y - Me.Y))}`); Me.X = x - 120; Me.Y = y; W.t += 4000; return true; },
      sleep: (ms) => new Promise(r => setTimeout(() => { W.t += ms; r(); }, 0)), IsCharacterReady: () => true, partyMember: (n) => { const p = party.find(x => x.Name === n); return p ? { IsDead: p.IsDead, X: p.X, Y: p.Y } : null; }, mateObjId: () => 0,
      Send: { Action: (id) => { W.target = id; W.log.push('target ' + id); }, RequestMagicSkillUse: (id) => { W.log.push('cast ' + id); (o.onRes || (() => { }))(party); }, DlgAnswer: () => W.log.push('dlg yes') },
      get Target() { return W.target ? { objId: W.target } : null; },
      UseItem: (id) => { W.inv[id]--; W.log.push('use ' + id); (o.onRes || (() => { }))(party); },
      followOk: (w) => w, memberRoute: { id: null }, healTargets: () => [{ me: true, hp: 100 }].concat(W.hurt > 0 ? [{ name: 'Mate', hp: 50 }] : []),
      setInterval: (f) => { W.timers.push(f); return 0; }, setTimeout: (f, ms) => { if (ms < 4000) setTimeout(f, 0); return 0; },
      currentSkillPlan: () => ({ selfBuffs: o.selfBuffs || [] }), dfZoneNow: () => ({ town: false }), dfSelfBuffSkip: () => false, skSelfBuffSkip: () => '', myBuffEntry: () => null, BUFFUP: { mode: '', last: { '1@Bishop4': 1, '2@party': 1 }, fails: {}, skipped: {} },
      selfBuffLastCast: {}, BuffLow: (id) => !W.cast.includes(id), ready: () => true, castInfo: async (b) => { W.cast.push(b.id); W.log.push('selfbuff ' + b.id); W.t += 1500; },
      boardOn: () => o.board !== false, needsBuff: () => W.buffs < 10 && o.board !== false, rkSelfBuffsAllowed: (board, need) => !board || !!need,
      buffSelf: async (why) => { W.log.push('board ' + why); W.t += 3000; if (o.boardOk !== false) { W.buffs = 20; return true; } return false; },
      longBuffCount: () => W.buffs, requestBuffTurn: (r) => W.log.push('buffturn ' + r), stopCombatG: () => W.log.push('stop combat'),
      hiveSkillsOn: () => true, hiveHealsOn: () => true,   // HIVESW-2026-10-15: the default (Hive picks skills + heals)
    };
    // the pure block + the host block in one scope (the host reads RESX / resDecide ...)
    const names = Object.keys(S).filter(k => !Object.getOwnPropertyDescriptor(S, k).get);   // getters (IsEnabled, Target) stay globals (defined per world below)
    const fn = new Function(...names, src.slice(a, b) + src.slice(ha, hb) + '\nreturn { RES, resGather, resRun, resOrder, resManual, resAfterRevive, resAfterHold, resPublic, resKitPublic, resPosKit };');
    W.H = fn(...names.map(k => S[k]));
    W.S = S; W.Me = Me; W.party = party;
    return W;
  }
  // (a) Chanter4's window, Tillion (raid mode), Bishop4 dead 850 away
  const party = [{ Name: 'Tank3', X: 43048, Y: 219720, Z: -3700, IsDead: false, objId: 10 }, { Name: 'Bishop4', X: 43512, Y: 218744, Z: -3700, IsDead: true, objId: 111 }, { Name: 'Chanter4', X: 43357, Y: 217900, Z: -3700, IsDead: false, objId: 12 }];
  const W1 = world({ leader: 'Tank3', role: 'doomcryer', raid: true, me: { Name: 'Chanter4', X: 43357, Y: 217900, Z: -3700, get IsDead() { return false; } }, party, inv: { 737: 3 },
    roster: { Bishop4: 'bishop', Tank3: 'sk' }, onRes: (p) => { setTimeout(() => { p.find(x => x.Name === 'Bishop4').IsDead = false; }, 0); } });
  // the bishop in livePos (fresh, dead) and the tank (fresh, nothing)
  W1.S.livePos.Bishop4 = { X: 43512, Y: 218744, Z: -3700, IsDead: true, at: W1.t, role: 'bishop', healer: true, objId: 111 };
  W1.S.livePos.Tank3 = { X: 43048, Y: 219720, Z: -3700, IsDead: false, at: W1.t, role: 'sk', rk: { skill: null, mass: null, sor: 0, bsor: 0, busy: false } };
  // Target / IsEnabled are getters on S: patch them in after creation (the Function got undefined for them) — the host reads them as globals
  globalThis.Target = null; Object.defineProperty(globalThis, 'Target', { configurable: true, get: () => (W1.target ? { objId: W1.target } : null) });
  Object.defineProperty(globalThis, 'IsEnabled', { configurable: true, get: () => W1.bot });
  W1.timers[0]();                                   // one res tick
  for (let i = 0; i < 40 && !W1.log.some(l => /^done resurrect/.test(l)); i++) await new Promise(r => setTimeout(r, 0));
  const L1 = W1.log.join('\n');
  check(/emit swarm\.res\.claim/.test(L1) && /walk \d+/.test(L1) && /target 111/.test(L1) && /use 737/.test(L1) && /done resurrect OK: Bishop4 is alive again \(Scroll of Resurrection\)/.test(L1),
    'host, Tillion: Chanter4 claims, walks over, targets body 111, reads 737 -> "Bishop4 is alive again"' + (/ERROR/.test(L1) ? ' — ' + L1.split('\n').filter(l => /ERROR/.test(l))[0] : ''));
  check(L1.indexOf('target 111') < L1.indexOf('emit swarm.res.incoming') && L1.indexOf('emit swarm.res.incoming') < L1.indexOf('use 737'), 'host: the body is targeted, the dead one is told (incoming), then the scroll is read');
  check(/bot off/.test(L1) && /bot on/.test(L1) && W1.inv[737] === 2, 'host: the bot is off during the walk + read and on again; one scroll used (2 left)');
  check(!/ERROR/.test(L1), 'host: no errors' + (/ERROR/.test(L1) ? ': ' + L1.split('\n').filter(l => /ERROR/.test(l)).join(' | ').slice(0, 300) : ''));
  // (b) Bishop4's window: revived -> board Buff Me FIRST, then heal the party, then follow again
  const W2 = world({ leader: 'Tank3', role: 'bishop', raid: true, hurt: 1, me: { Name: 'Bishop4', X: 43512, Y: 218744, Z: -3700, get IsDead() { return false; } }, party, skills: [[1016, 'Resurrection']], selfBuffs: [{ id: 1, name: 'Self Buff' }] });
  Object.defineProperty(globalThis, 'IsEnabled', { configurable: true, get: () => W2.bot });
  W2.events['swarm.res.incoming']({ data: { to: 'Bishop4', by: 'Chanter4', how: 'scroll' } });
  const tR = W2.t; setTimeout(() => { W2.hurt = 0; }, 30);
  W2.H.resAfterRevive();
  for (let i = 0; i < 400 && !W2.log.some(l => /^done revived/.test(l)); i++) await new Promise(r => setTimeout(r, 0));
  const L2 = W2.log.join('\n'), order = ['emit swarm.res.revived', 'bot off', 'board revived'].map(x => L2.indexOf(x));
  check(order.every(i => i >= 0) && order[0] < order[1] && order[1] < order[2], 'host, revived bishop: tells the buffers, stops the bot, then Community Board Buff Me FIRST');
  check(!/selfbuff/.test(L2), 'host: board buffs worked -> no own self buffs on top (user rule)');
  check(/note revived: buffs done/.test(L2) && L2.indexOf('board revived') < L2.indexOf('note revived: buffs done'), 'host: heals the party AFTER the buffs');
  check(/done revived OK/.test(L2) && /bot on/.test(L2) && L2.lastIndexOf('follow true') > L2.indexOf('board revived'), 'host: back to the bot + following after buffs + heals');
  check(/note revived by Chanter4/.test(L2), 'host: the note names who raised it');
  check(!/ERROR/.test(L2), 'host (revived): no errors' + (/ERROR/.test(L2) ? ': ' + L2.split('\n').filter(l => /ERROR/.test(l)).join(' | ').slice(0, 300) : ''));
  void tR;
  // (c) the board refuses (combat): own self buffs, then the rotation asks again
  const W3 = world({ leader: 'Tank3', role: 'doomcryer', raid: true, boardOk: false, me: { Name: 'Chanter4', X: 0, Y: 0, Z: 0, get IsDead() { return false; } }, party, selfBuffs: [{ id: 5, name: 'Soul Cry' }, { id: 6, name: 'Chant' }] });
  Object.defineProperty(globalThis, 'IsEnabled', { configurable: true, get: () => W3.bot });
  W3.H.resAfterRevive();
  for (let i = 0; i < 400 && !W3.log.some(l => /^done revived/.test(l)); i++) await new Promise(r => setTimeout(r, 0));
  const L3 = W3.log.join('\n');
  check(/board revived/.test(L3) && /selfbuff 5/.test(L3) && /selfbuff 6/.test(L3) && /buffturn dead/.test(L3), 'host: the board refused in the raid -> own self buffs at once, the rebuff rotation tries the board again later');
  // (d) the buffer side: a revived teammate's per-member gaps are forgotten
  W1.events['swarm.res.revived']({ data: { name: 'Bishop4' } });
  check(!('1@Bishop4' in W1.S.BUFFUP.last) && ('2@party' in W1.S.BUFFUP.last), 'host: buffers forget their per-member gaps for the revived one (it is rebuffed at once)');
  // (e) an order with a named resser in another window: only that one acts
  const W4 = world({ leader: 'Tank3', role: 'nuker', raid: false, me: { Name: 'Nuker7', X: 43400, Y: 218700, Z: -3700, get IsDead() { return false; } }, party: party.map(p => Object.assign({}, p, p.Name === 'Bishop4' ? { IsDead: true } : {})), inv: { 737: 1 } });
  Object.defineProperty(globalThis, 'IsEnabled', { configurable: true, get: () => W4.bot });
  W4.S.livePos.Bishop4 = { X: 43512, Y: 218744, Z: -3700, IsDead: true, at: W4.t, role: 'bishop', healer: true, objId: 111 };
  W4.S.livePos.Chanter4 = { X: 43357, Y: 217900, Z: -3700, IsDead: false, at: W4.t, role: 'doomcryer', rk: { sor: 3, sorId: 737, busy: false } };
  W4.H.resOrder(['!res', 'Bishop4', 'scroll', 'by', 'Chanter4']);
  W4.timers[0]();
  await new Promise(r => setTimeout(r, 0));
  check(W4.H.RES.order && W4.H.RES.order.by === 'Chanter4' && !W4.log.some(l => /^intent resurrect/.test(l)), 'host, order "!res Bishop4 scroll by Chanter4" in Nuker7\'s window: Nuker7 does not act');
  const pub = W4.H.resPublic();
  check(pub && pub.order && pub.order.by === 'Chanter4', 'host: the dashboard sees the order (resLive.order)');
  console.log(`\n${n - fails} passed, ${fails} failed`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
