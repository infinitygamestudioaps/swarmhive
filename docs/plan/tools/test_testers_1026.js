// TESTER FIXES 2026-10-26 (Raltru / Hero): node docs/plan/tools/test_testers_1026.js
//  PRESETQTY  a trade preset of 2 rings ticks 2, not every ring    SAJUNK-2  never-store never sells an enchanted / SA piece
//  STOPTRIP   Stop ends the spot trip + a running supply run          OWNFIGHT  Hive off = no own target / walk while L2Swarm fights
//  AOEFIGHT   area skills count only monsters in the fight
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const src = fs.readFileSync(process.env.SWARM_JS || path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
const D = (f) => fs.readFileSync(path.join(ROOT, 'Dashboard', f), 'utf8');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL ' + m); } };

// PRESETQTY
const L = require(path.join(ROOT, 'Dashboard', 'tradelogic.js'));
const rows = [1, 2, 3, 4, 5].map(i => ({ objId: i, id: 882, count: 1, ok: true, cat: 'jewel', name: 'Ring' })).concat([{ objId: 9, id: 57, count: 1000, ok: true, cat: 'other', name: 'Stack' }]);
const a = L.trApplyPreset({ ids: [882, 57], items: [{ id: 882, count: 2 }, { id: 57, count: 300 }] }, { A: { rows, adena: 0 } });
ok(Object.keys(a.sel.A).filter(k => +k < 9).length === 2, 'PRESETQTY: 2 of 5 rings ticked');
ok(a.sel.A[9] === 300, 'PRESETQTY: a stack is ticked with the saved count');
ok(Object.keys(L.trApplyPreset({ ids: [882] }, { A: { rows, adena: 0 } }).sel.A).length === 5, 'PRESETQTY: an old preset (ids only) still ticks every match');
ok(D('tradepage.js').includes('ids, items, adena }') && D('tradepage_api.js').includes('items: (pr.items || [])'), 'PRESETQTY: the page sends and the API keeps items [{id, count}]');

// SAJUNK-2
ok(/SAJUNK-2[^\n]*/.test(src) && src.includes("if (Number(b.enchant) > 0 || (gi && / - /.test(String(gi.n || ''))"), 'SAJUNK-2: never-store sale skips enchanted / SA pieces');

// STOPTRIP
ok(src.includes("const stale = (where) => { if (autoLvl.stop || leadPaused() || !runOnOrCollector())"), 'STOPTRIP: the trip ends at the next step after Stop');
ok(src.includes("if (stale('before the way in')) return false;"), 'STOPTRIP: checked before the dungeon / room way in');
ok(src.includes("globalThis.__spotTripAt = now();") && src.includes("pstEnd('travel'); globalThis.__spotTripAt = 0;") && src.includes('(globalThis.__spotTripAt && now() - globalThis.__spotTripAt < 1800000)'), 'STOPTRIP: no automatic supply run starts during a spot trip');
ok((src.match(/if \(supStopped\('/g) || []).length === 3, 'STOPTRIP: the supply run stops after the Giran regroup, before the grocer, before the hand-out');

// OWNFIGHT
ok(/OWNFIGHT-2026-10-26[\s\S]{0,600}if \(!sfMode && hiveOwnCombat\(\) && IsInCombat && [^\n]*\{\n\s*lastTarget = 0; autoLvl\.mobSeenAt = now\(\); await sleep\(1000\); continue;/.test(src), 'OWNFIGHT: Hive steps aside while L2Swarm\'s own combat fights');
{ const i = src.indexOf('OWNFIGHT-2026-10-26'), j = src.indexOf('ATTACKFIRST-2026-10-23: a monster hitting', i); ok(i > 0 && j > i && j - i < 1200, 'OWNFIGHT: placed before the hive target pick'); }

// AOEFIGHT
const cf = new Function('snapMobs', 'num', 'aggroRange', src.slice(src.indexOf('function countFightMobsNear('), src.indexOf('function countMobsNear(')) + '\nreturn countFightMobsNear;');
const mobs = [{ X: 0, Y: 0, Name: 'T' }, { X: 50, Y: 0, Name: 'idle' }, { X: 80, Y: 0, Name: 'idle' }, { X: 100, Y: 0, Name: 'hits', TargetObjId: 7 }, { X: 120, Y: 0, Name: 'aggro' }];
const n = cf(() => mobs, Number, (nm) => nm === 'aggro' ? 300 : 0)(0, 0, 250);
ok(n === 3, `AOEFIGHT: target + one fighting + one aggressive = 3, idle passive ones not counted (got ${n})`);
ok((src.match(/countFightMobsNear\(/g) || []).length >= 4, 'AOEFIGHT: castPick paths use it (skill plan, hunt, member fight)');

// NOJUNK (owner 2026-10-26: "WHY DID YOU SELL SOMETHING I NEVER ASKED YOU TO ... YOU CAN NEVER DO THIS"): gear is never sold as junk
ok(/sell: { enabled: true, junk: false,/.test(src), "NOJUNK: CONFIG.sell.junk is false (only items the owner marks are sold)");
// NOAUTOSELL (owner 2026-10-26: "automatic selling should be default OFF for all characters"): every sale path passes the sellAt guard
ok(src.includes("if (!only && !/^!/.test(String(why || '')) && !pautoOn('sell')) {"), 'NOAUTOSELL: sellAt refuses without the owner order / sell switch');
// NOAUTOSELL2 (owner 2026-10-27: "WHY WHY WHY ARE YOU SELLING drops!!!!!!"): automatic warehouse sales used a '!whsell' reason, which the guard
// reads as the owner's order. The collector's 5-min sale and the resume after a restart need the sell switch themselves.
{ const i = src.indexOf('// COLLSELL 2026-10-14'), j = src.indexOf('await whSellLoop(ids.map(', i), blk = i > 0 && j > i ? src.slice(i, j) : '';
  ok(/if \(!pautoOn\('sell'\)\) \{ COLLT\.checkAt = now\(\); return; \}/.test(blk), "NOAUTOSELL2: the collector's automatic clan warehouse sale needs the sell switch"); }
{ const i = src.indexOf('setTimeout(function whsResumeCheck()'), j = src.indexOf('whSellLoop(items, !items.length)', i), blk = i > 0 && j > i ? src.slice(i, j) : '';
  ok(/if \(!pautoOn\('sell'\)\) \{ note\(/.test(blk), 'NOAUTOSELL2: an interrupted sale is not resumed by a restart unless selling is switched on'); }
{ const callers = (src.match(/whSellLoop\(/g) || []).length;
  ok(callers === 4, `NOAUTOSELL2: whSellLoop has exactly its known callers (definition, the collector, the !whsell order, the resume): ${callers} — a new caller must check the sell switch`); }
console.log(`testers 2026-10-26: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
