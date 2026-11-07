// CRLINES + NODMGCALL guard (owner 2026-11-06): Nuker31's academy group (level-4 Dark Elven Mystics, plan Dark Elven Wizard -> Spellhowler)
// cast nothing for hours - the Shillien Saint row "never Wind Strike in a party" of the shared Dark Elven Mystic file blocked every DE Mystic.
// And "a bot that does no damage for several minutes calls the group, or walks away" (Nuker34: 25 min under a Kaboo Orc Fighter at 100 %).
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '../../..');
const SRC = fs.readFileSync(path.join(ROOT, 'Scripts_dev/swarm.js'), 'utf8');
let ok = 0, bad = 0; const t = (m, c, x) => { if (c) { ok++; console.log('ok   ' + m); } else { bad++; console.log('FAIL ' + m + (x === undefined ? '' : ' ' + JSON.stringify(x))); } };
const cut = (a, b) => SRC.slice(SRC.indexOf(a), SRC.indexOf(b));
const num = (v) => Number(v) || 0;
const L = new Function('num', cut('// CRLINES-PURE-BEGIN', '// CRLINES-PURE-END') + '\nreturn { crLinesFor, crRowsForLines };')(num);
const N = new Function(cut('// NODMGCALL-PURE-BEGIN', '// NODMGCALL-PURE-END') + '\nreturn { nodmgStep, NODMG };')();

// ---- class lines ----
const tree = JSON.parse(fs.readFileSync(path.join(ROOT, 'Scripts/data/class_tree.json'), 'utf8').replace(/^﻿/, ''));
const rot = JSON.parse(fs.readFileSync(path.join(ROOT, 'Scripts/data/class_rotation/38.json'), 'utf8').replace(/^﻿/, ''));
const nuker = L.crLinesFor(tree, [39, 40], false);
t('plan Dark Elven Wizard -> Spellhowler = the Storm Screamer line, never Shillien Saint', nuker.includes('Storm Screamer') && !nuker.includes('Shillien Saint'), nuker);
const rowsN = L.crRowsForLines(rot.rows, nuker);
t('the nuker keeps the auto Wind Strike row', rowsN.some(r => r.id === 1177 && r.auto && r.a === 'single'));
t('the nuker does NOT get the Shillien Saint "never Wind Strike in a party" row (the bug)', !rowsN.some(r => r.id === 1177 && r.a === 'never'));
const saint = L.crLinesFor(tree, [42, 43], true);
const rowsS = L.crRowsForLines(rot.rows, saint);
t('a Shillien Oracle plan keeps its healer rule (never Wind Strike in a party = healers only heal)', rowsS.some(r => r.id === 1177 && r.a === 'never') && !rowsS.some(r => r.id === 1177 && r.auto), saint);
t('no plan: the role decides (nuker -> not the healer line, healer -> the healer line)', !L.crLinesFor(tree, [], false).includes('Shillien Saint') && L.crLinesFor(tree, [], true).includes('Shillien Saint'));
t('nothing known = every row (the old way)', L.crRowsForLines(rot.rows, []).length === rot.rows.length && L.crLinesFor(tree, [], null).length === 0);
t('a row without "lines" always stays', L.crRowsForLines([{ id: 1 }, { id: 2, lines: ['X'] }], ['Y']).map(r => r.id).join() === '1');
t('crApplyPlan uses only my line rows', /d = Object\.assign\(\{\}, d, \{ rows: crRowsForLines\(d\.rows, myLines\) \}\)/.test(SRC));
t('a changed line rebuilds the skill plan (key token)', /'\|ln' \+ ln/.test(SRC));

// ---- no damage ----
const S = (tr, o) => N.nodmgStep(tr, Object.assign({ hitAgoMs: 1000, canCall: true }, o));
let r = S(null, { now: 0, attackerId: 7, hpPct: 100 });
t('a new attacker starts a track, nothing yet', r.act === 'none' && r.tr && r.tr.id === 7);
r = S(r.tr, { now: 170000, attackerId: 7, hpPct: 100 });
t('under 3 min: nothing', r.act === 'none');
r = S(r.tr, { now: 181000, attackerId: 7, hpPct: 100 });
t('3 min without damage = call the leader + team', r.act === 'call');
const again = S(r.tr, { now: 190000, attackerId: 7, hpPct: 100 });
t('the call repeats every 20 s, not every tick', again.act === 'none' && S(again.tr, { now: 202000, attackerId: 7, hpPct: 100 }).act === 'call');
const w = S(r.tr, { now: 361000, attackerId: 7, hpPct: 100 });
t('still nothing after 6 min = step out of its reach', w.act === 'walk');
const alone = S(S(S(null, { now: 0, attackerId: 9, hpPct: 100, canCall: false }).tr, { now: 1000, attackerId: 9, hpPct: 100, canCall: false }).tr, { now: 185000, attackerId: 9, hpPct: 100, canCall: false });
t('nobody to call (leader / alone) = step away at 3 min', alone.act === 'walk');
let d = S(null, { now: 0, attackerId: 5, hpPct: 100 }); d = S(d.tr, { now: 100000, attackerId: 5, hpPct: 90 }); d = S(d.tr, { now: 250000, attackerId: 5, hpPct: 90 });
t('my hits land (HP dropped) = the clock starts again', d.act === 'none');
const over = S(r.tr, { now: 200000, attackerId: 7, hpAgo: 0, hitAgoMs: 20000, hpPct: 100 });
t('nothing hits me any more after a call = done (the leader stops the rescue)', over.act === 'done' && over.tr === null);
const landed = S(r.tr, { now: 200000, attackerId: 7, hpPct: 80 });
t('it takes damage after a call = done', landed.act === 'done');
t('host: never in raids / instances / escapes / trades / hands off', /if \(inRaid\(\) \|\| inst\.on \|\| ESC\.on \|\| tradeState \|\| state\.escaping \|\| handsOffMe\(\)\) \{ nodmgTr = null; return; \}/.test(SRC));
t('host: the call goes through the rescue machinery with the attacker', /App\.emit\('swarm\.rescue', \{ name: Me\.Name, leader: lead, [^\n]*stage: 'nodamage'[^\n]*attackers: \[id\] \}\)/.test(SRC));
console.log(`crlines_nodmg: ${ok} ok, ${bad} failed`); process.exit(bad ? 1 : 0);
