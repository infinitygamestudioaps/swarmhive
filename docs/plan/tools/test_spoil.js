// SPOIL-2026-10-19 tests: the SPOIL-PURE block of Scripts_dev/swarm.js (spoil until it lands, festivals, sweep order, monster choice)
// + Dashboard/spoilpage_api.js uses the same rules (spoilWanted). Run: node docs/plan/tools/test_spoil.js
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const src = fs.readFileSync(process.env.SWARM_SRC || path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
const a = src.indexOf('// SPOIL-PURE-BEGIN'), b = src.indexOf('// SPOIL-PURE-END');
if (a < 0 || b < a) { console.log('FAIL: SPOIL-PURE block not found'); process.exit(1); }
const ctx = {}; vm.createContext(ctx);
vm.runInContext(src.slice(a, b) + '\nthis.X = { SPOIL_DEF, spoilRulesNorm, spoilCfg, spoilWanted, spoilPick, sweepPick };', ctx);
const X = ctx.X;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL:', m); } };
const eq = (x, y, m) => ok(JSON.stringify(x) === JSON.stringify(y), `${m}: got ${JSON.stringify(x)} want ${JSON.stringify(y)}`);

// --- monster choice
eq(X.spoilWanted({}, 'L', 20001).on, true, 'nothing set = spoil everything');
eq(X.spoilWanted({ default: false }, 'L', 20001).on, false, 'default off');
eq(X.spoilWanted({ monsters: { 20001: false } }, 'L', 20001), { on: false, src: 'all' }, 'unticked for all');
eq(X.spoilWanted({ monsters: { 20001: false }, parties: { L: { monsters: { 20001: true } } } }, 'L', 20001), { on: true, src: 'party' }, 'party tick beats all');
eq(X.spoilWanted({ monsters: { 20001: false }, parties: { L: { monsters: { 20001: true } } } }, 'Other', 20001).on, false, 'other party keeps the all-parties choice');
eq(X.spoilWanted({ default: true, parties: { L: { default: false } } }, 'L', 5).on, false, 'party default beats all default');
eq(X.spoilWanted({ monsters: { abc: false, 7: 'yes' } }, 'L', 7).on, true, 'junk entries ignored');
eq(X.spoilCfg({ festivalMin: 3, mpReserve: 999, maxTries: 0 }).festivalMin, 3, 'festivalMin from file');
eq(X.spoilCfg({ mpReserve: 999 }).mpReserve, X.SPOIL_DEF.mpReserve, 'bad mpReserve -> default');

// --- spoil until it lands
const have = { spoil: true, spoilReady: true, spoilMp: 38, fest: true, festReady: true, festMp: 113 };
const T = (o) => Object.assign({ id: 1, wanted: true, ok: false, tries: 0, gaveUp: false }, o);
const C = X.spoilCfg({});
eq(X.spoilPick({ cfg: C, mp: 500, mpPct: 80, target: T(), near: [], have }).do, 'spoil', 'fresh target -> Spoil');
eq(X.spoilPick({ cfg: C, mp: 500, mpPct: 80, target: T({ tries: 3 }), near: [], have }).do, 'spoil', 'failed 3x -> Spoil again');
const done = X.spoilPick({ cfg: C, mp: 500, mpPct: 80, target: T({ ok: true }), near: [], have });
eq([done.do, done.hold], [null, false], 'spoiled -> never again, attacks go on');
eq(X.spoilPick({ cfg: C, mp: 500, mpPct: 80, target: T({ tries: 6 }), near: [], have }).do, null, 'maxTries reached -> give up');
eq(X.spoilPick({ cfg: C, mp: 500, mpPct: 80, target: T({ gaveUp: true }), near: [], have }).do, null, 'cannot be spoiled -> give up');
eq(X.spoilPick({ cfg: C, mp: 500, mpPct: 80, target: T({ wanted: false }), near: [], have }).do, null, 'not on the list -> no Spoil');
const reuse = X.spoilPick({ cfg: C, mp: 500, mpPct: 80, target: T(), near: [], have: Object.assign({}, have, { spoilReady: false, festReady: false }) });
eq([reuse.do, reuse.hold], [null, true], 'Spoil on reuse -> attack skills wait');
const nomp = X.spoilPick({ cfg: C, mp: 20, mpPct: 3, target: T(), near: [], have });
eq([nomp.do, nomp.hold], [null, true], 'no MP for Spoil -> attack skills wait');
eq(X.spoilPick({ cfg: C, mp: 500, mpPct: 10, target: T({ ok: true }), near: [], have }).hold, true, 'below the MP reserve -> attack skills wait');

// --- Spoil Festival
const near = [{ id: 2, d: 90, wanted: true }, { id: 3, d: 150, wanted: true }];
eq(X.spoilPick({ cfg: C, mp: 500, mpPct: 80, target: T(), near, have }).do, 'festival', '3 monsters -> Spoil Festival');
eq(X.spoilPick({ cfg: C, mp: 100, mpPct: 80, target: T(), near, have }).do, 'spoil', 'not enough MP for the festival -> Spoil');
eq(X.spoilPick({ cfg: C, mp: 500, mpPct: 80, target: T(), near: [{ id: 2, d: 90, wanted: false }], have }).do, 'spoil', 'neighbour not on the list -> Spoil');
eq(X.spoilPick({ cfg: C, mp: 500, mpPct: 80, target: T(), near: [{ id: 2, d: 900, wanted: true }], have }).do, 'spoil', 'neighbour too far -> Spoil');
eq(X.spoilPick({ cfg: C, mp: 500, mpPct: 80, target: T(), near: [{ id: 2, d: 50, wanted: true, ok: true }], have }).do, 'spoil', 'neighbour already spoiled -> Spoil');
eq(X.spoilPick({ cfg: X.spoilCfg({ festival: false }), mp: 500, mpPct: 80, target: T(), near, have }).do, 'spoil', 'festival switched off');

// --- sweeping
const sh = { sweep: true, sweepReady: true, fest: true, festReady: true, festMp: 12 };
eq(X.sweepPick({ cfg: C, mp: 300, corpses: [], have: sh }), null, 'no corpse -> nothing');
eq(X.sweepPick({ cfg: C, mp: 300, corpses: [{ id: 9, d: 400, tries: 0 }], have: sh }), { do: 'sweep', id: 9 }, 'one corpse -> Sweeper');
eq(X.sweepPick({ cfg: C, mp: 300, corpses: [{ id: 9, d: 120 }, { id: 8, d: 60 }], have: sh }).do, 'festival', '2 near -> Sweeper Festival');
eq(X.sweepPick({ cfg: C, mp: 300, corpses: [{ id: 9, d: 500 }, { id: 8, d: 60 }], have: sh }), { do: 'sweep', id: 8 }, 'one near, one far -> Sweeper on the nearest');
eq(X.sweepPick({ cfg: C, mp: 300, corpses: [{ id: 9, d: 50, tries: 3 }], have: sh }), null, '3 failed tries -> drop it');
eq(X.sweepPick({ cfg: C, mp: 300, corpses: [{ id: 9, d: 50 }], have: { sweep: false, fest: true, festReady: true, festMp: 12 } }).do, 'festival', 'no Sweeper -> festival takes it');

console.log(`${fail ? 'FAILED' : 'OK'}: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
