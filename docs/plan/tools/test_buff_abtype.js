// OFFLINE TEST of the buff type fix (Mr.P 2026-10-10: "they keep buffing all the time even when the whole party is buffed"):
// L2Swarm's L2Buff.AbnormalType is the RAW per-level list ("DANCE_OF_FURY,1", "PA_PD_UP,1;PA_PD_UP,2;PA_PD_UP,3", AbnormalLevel always 1),
// L2Skill.AbnormalType the plain type (AbnormalLevel always 1). Probed live on Destroyer1. Runs ROLEKIND-PURE + BUFFPLAN-PURE in node.
//   node docs/plan/tools/test_buff_abtype.js
'use strict';
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(process.env.SWARM_SRC || path.join(__dirname, '..', '..', '..', 'Scripts_dev', 'swarm.js'), 'utf8');
const blk = (n) => { const a = src.indexOf(`// ${n}-BEGIN`), b = src.indexOf(`// ${n}-END`); if (a < 0 || b < a) { console.log('FAIL ' + n + ' block not found'); process.exit(1); } return src.slice(a, b); };
const M = new Function(blk('ROLEKIND-PURE') + blk('BUFFPLAN-PURE') + '\nreturn { rkBuffAb, rkBuffReport, rkBuffsFromReport, rkBuffNeed, rkSkill, bpCycleDue, rkSlotReport, bpToRemove, ROLEKIND };')();
let fails = 0; const ok = (c, w) => { console.log((c ? 'ok   ' : 'FAIL ') + w); if (!c) fails++; };
// live shapes (Destroyer1 2026-10-10 20:04)
const live = [
  { Name: 'Rage', Level: 2, AbnormalType: 'PA_UP_SPECIAL,1;PA_UP_SPECIAL,2', AbnormalLevel: 1, RemainTime: 80, IsDebuff: false },
  { Name: 'Greater Might', Level: 3, AbnormalType: 'PA_PD_UP,1;PA_PD_UP,2;PA_PD_UP,3', AbnormalLevel: 1, RemainTime: 42922, IsDebuff: false },
  { Name: 'Dance of Fury', Level: 1, AbnormalType: 'DANCE_OF_FURY,1', AbnormalLevel: 1, RemainTime: 110, IsDebuff: false },
  { Name: 'Song of Vitality', Level: 1, AbnormalType: 'SONG_OF_VITALITY,1', AbnormalLevel: 1, RemainTime: 100, IsDebuff: false },
  { Name: 'Haste', Level: 102, AbnormalType: 'ATTACK_TIME_DOWN,1;ATTACK_TIME_DOWN,2', AbnormalLevel: 1, RemainTime: 900, IsDebuff: false },
];
ok(M.rkBuffAb(live[1]).ab === 'PA_PD_UP' && M.rkBuffAb(live[1]).level === 3, 'raw list "PA_PD_UP,1;..;PA_PD_UP,3" + Level 3 -> PA_PD_UP level 3');
ok(M.rkBuffAb(live[2]).ab === 'DANCE_OF_FURY' && M.rkBuffAb(live[2]).level === 1, '"DANCE_OF_FURY,1" -> DANCE_OF_FURY level 1');
ok(M.rkBuffAb(live[4]).ab === 'ATTACK_TIME_DOWN' && M.rkBuffAb(live[4]).level === 2, 'enchanted level 102 -> the last entry (level 2)');
ok(M.rkBuffAb({ AbnormalType: 'STUN', Level: 4, AbnormalLevel: 1 }).ab === 'STUN', 'a plain type stays as it is');
ok(M.rkBuffAb({ AbnormalType: '', Level: 1 }).ab === '', 'no type -> empty');
const rep = M.rkBuffReport(live), map = M.rkBuffsFromReport(rep);
ok(map.DANCE_OF_FURY && map.SONG_OF_VITALITY && map.PA_PD_UP && !Object.keys(rep).some(k => /[,;]/.test(k)), `the report is keyed by plain types (${Object.keys(rep).join(', ')})`);
// skill side: AbnormalLevel always 1 -> the skill level
const fury = M.rkSkill({ Id: 275, Level: 1, Name: 'Dance of Fury', IsActive: true, AbnormalType: 'DANCE_OF_FURY', AbnormalLevel: 1, AbnormalTime: 120 });
const might = M.rkSkill({ Id: 1068, Level: 3, Name: 'Might', IsActive: true, AbnormalType: 'PA_PD_UP', AbnormalLevel: 1, AbnormalTime: 1200 });
ok(fury.ab === 'DANCE_OF_FURY' && might.abLvl === 3, `skill: plain type, level from the skill level (Might 3 -> abLvl ${might.abLvl})`);
// Mr.P's loop: the dance is up on the member -> no recast; about to run out -> refresh; gone -> missing
const m = { name: 'Bd', buffs: map };
ok(M.rkBuffNeed(fury, m) === '', 'Dance of Fury up (110 s left): NOT cast again (the bug: it was "missing" every tick)');
ok(M.rkBuffNeed(might, m) === '', 'Might 3 vs a running Greater Might 3 of the same type: not recast');
ok(M.rkBuffNeed(fury, { name: 'X', buffs: M.rkBuffsFromReport(M.rkBuffReport([Object.assign({}, live[2], { RemainTime: 20 })])) }) === 'expiring', 'about to run out (20 s): refresh');
ok(M.rkBuffNeed(fury, { name: 'X', buffs: {} }) === 'missing', 'gone: missing');
// the song / dance cycle: the whole set is up -> no new cycle
const types = ['DANCE_OF_FURY', 'SONG_OF_VITALITY'];
const due = M.bpCycleDue(types, [{ name: 'Sws', me: true, dist: 0, buffs: map }, { name: 'Bd', dist: 200, buffs: map }], {});
ok(!due.due && due.expired === 0, `cycle with the set up on everyone: not due (expired ${due.expired}/${due.total})`);
ok(M.rkSlotReport(live, 0, { buffMax: 24 })[0] === 3, 'buff slots: songs / dances not counted (3 normal buffs)');
ok(M.bpToRemove(['Greater Might'], live.map(b => Object.assign({ Id: 1, }, b))).length === 1, 'remove list still finds a raw-typed buff');
console.log(fails ? `${fails} FAILED` : 'all buff type checks passed'); process.exit(fails ? 1 : 0);
