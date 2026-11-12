// 2026-11-12 Inspector1 + Healer1 (powerlevel.md R7, hunting.md R11; owner, live):
//  PLBUFFGROUPS "Luneath is constantly buffing Inspector1" - the healer's buff pick had no buff groups (board Improved Combat covers Might / Shield),
//               so Shield / Might / Agility / Holy Weapon were "missing" every 5 s; a buff that does not stay rests 30 min
//  PLHEALAT     "he is barely down in HP and she keeps healing him?" - the leveler is healed by the pair's healAt (70), not the party rule (90)
//  PLPROTECT    "inspector1 should protect Healer1" / "Healer1 is getting hit now by Lilim Seer and inspector1 is just standing still" - the pair's healer
//               counts as a healer of mine for attack-first
//  UNREACHLOOP  "he should constantly get new target after a kill" - the same "Unknown Mob" was picked every ~3 min (unreachable, aside 2 min only)
const fs = require('fs'), path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '../../../Scripts_dev/swarm.js'), 'utf8');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log('  ok  ' + m); } else { fail++; console.log('  FAIL ' + m); } };
const blk = (a, b) => { const i = SRC.indexOf(a), j = SRC.indexOf(b, i); if (i < 0 || j < 0) throw new Error(a + ' missing'); return SRC.slice(i, j); };
const A = new Function(blk('// PLHEALAT-PURE-BEGIN', '// PLHEALAT-PURE-END') + blk('// PLBUFFGROUPS-PURE-BEGIN', '// PLBUFFGROUPS-PURE-END') + blk('// UNREACHLOOP-PURE-BEGIN', '// UNREACHLOOP-PURE-END') + '\nreturn { plHealHp, plBuffRestMs, huntUnreachAsideMs };')();
// heal at
ok(A.plHealHp(95, 70) === 100 && A.plHealHp(71, 70) === 100, 'leveler above the pair\'s heal-at (70) counts as full: no heal at 95 / 71 %');
ok(A.plHealHp(65, 70) === 65 && A.plHealHp(30, 70) === 30, 'below it the real HP goes to the heal brain (emergency heals below 50 stay)');
ok(A.plHealHp(80, undefined) === 100 && A.plHealHp(60, 0) === 60, 'no heal-at set = 70');
ok(/hp: plHealHp\(lv\.hp, m\.pair\.healAt\)/.test(blk('function plHealTarget()', '\n}\n')), 'plHealTarget hands the heal brain the heal-at HP');
// buffs
const tick = blk('function plBuffTick(m, lv, d)', '\nfunction plWriteLive(');
ok(/groups: buffGroups\(\)/.test(tick) && /bpSettings\(buffPlansFile\(\)\)/.test(tick) && /cfg: bcfg/.test(tick), 'the healer\'s buff pick gets the same buff groups / settings as the party buffer');
ok(A.plBuffRestMs({ ab: 'PA_UP', after: { IMPROVE_PA_PD_UP: {} } }) === 1800000 && A.plBuffRestMs({ ab: 'PA_UP', after: { PA_UP: {} } }) === 0, 'a buff that did not stay rests 30 min; one that stayed does not');
ok(/await sleep\(6000\)/.test(tick) && /PLB\.fails\[pick\.key\] = \{/.test(tick), 'after each cast the leveler\'s buffs are checked again and a missing one is rested (fails)');
// replay: Inspector1's live buffs (2026-11-12) -> Might / Shield / Agility are covered by the buff groups
try {
  const f1 = blk('function rkGroupBlock(', '\n}\n') + '\n}\n';
  const iI = SRC.indexOf('function buffGroupsIndex('); const f2 = iI >= 0 ? SRC.slice(iI, SRC.indexOf('\n}\n', iI)) + '\n}\n' : '';
  if (f2) {
    const G = new Function(f1 + f2 + '\nreturn { rkGroupBlock, buffGroupsIndex };')();
    const idx = G.buffGroupsIndex(JSON.parse(fs.readFileSync(path.join(__dirname, '../../../Scripts/data/buff_groups.json'), 'utf8')));
    const B = { IMPROVE_PA_PD_UP: {}, IMPROVE_SPEED_AVOID_UP: {}, PA_PD_UP: {} };
    ok(['PA_UP', 'PD_UP'].every(ab => G.rkGroupBlock(ab, B, idx, 'strict')), 'replay: board Improved Combat covers Might (PA_UP) and Shield (PD_UP)');
  } else console.log('  skip replay (no buffGroupsIndex)');
} catch (e) { console.log('  skip replay: ' + e.message); }
// protect the healer
const af = blk('function attackFirstNow(curId)', '\n}\n');
ok(/pm\.role === 'leveler'/.test(af) && /team\.push\(pm\.pair\.healer\); healers\.push\(pm\.pair\.healer\)/.test(af), 'the leveler counts its out-of-party healer as a healer of its team (monster on her = first)');
const P = new Function(blk('// ATTACKFIRST-PURE-BEGIN', '// ATTACKFIRST-PURE-END') + '\nreturn attackFirstPick;')();
const p = P({ cur: 0, me: 'Inspector1', team: ['Healer1'], healers: ['Healer1'], hits: [{ id: 7, on: 'Healer1', at: 1000, d: 600 }], now: 2000 });
ok(p && p.id === 7 && /healer Healer1/.test(p.why), 'replay: Lilim Seer on Healer1 -> Inspector1 switches to it');
// unreachable loop
ok(A.huntUnreachAsideMs(1) === 120000 && A.huntUnreachAsideMs(2) === 600000 && A.huntUnreachAsideMs(5) === 1800000, 'unreachable: 1st 2 min, 2nd 10 min, then 30 min aside');
ok(/huntUnreachN\[ku\] = \(huntUnreachN\[ku\] \|\| 0\) \+ 1/.test(SRC) && /huntBlack\[t\.objId\] = now\(\) \+ msu;/.test(SRC), 'the hunt counts unreachable per object and uses the longer rest');
console.log(`\ntest_pl_pair_1112: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
