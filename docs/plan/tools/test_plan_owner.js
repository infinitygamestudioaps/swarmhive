// docs/requirements/plan.md: one owner for leveling (R1) + a plan leveling step never blocks for good (R2). Source + behaviour checks.
'use strict';
const fs = require('fs'), path = require('path');
const R = path.join(__dirname, '..', '..', '..');
const SW = fs.readFileSync(path.join(R, fs.existsSync(path.join(R, 'Scripts_dev', 'swarm.js')) ? 'Scripts_dev' : 'Scripts', 'swarm.js'), 'utf8');
let ok = 0, bad = 0;
const t = (name, cond) => { if (cond) ok++; else { bad++; console.log('FAIL', name); } };
const fnBody = (head) => { const i = SW.indexOf(head); if (i < 0) return ''; const j = SW.slice(i + 10).search(/\n(async )?function /); return SW.slice(i, j < 0 ? undefined : i + 10 + j); };

// ---- R1 one owner
const m = /function levelByUser\(why\) \{ return (\/[^\n]*?\/i)\.test/.exec(SW);
t('R1 levelByUser exists', !!m);
const re = m ? Function('return ' + m[1])() : /^$/;
['!level', '!autolevel', '!start', '!zone Settings/x.zmap', '!dungeon Cruma Tower', '!assist Tank1', '!soul hunt', 'level to 40', 'clan quest 508', 'your order !level']
  .forEach(w => t('R1 user order restarts: ' + w, re.test(w)));
['watchdog', 'after !kitbuy', 'after !handover', 'hunting time is up: back to the spot', 'plan: level until 40', 'automatic pause expired', 'circuit waits for respawns', 'soul hunt off']
  .forEach(w => t('R1 automation does not restart: ' + w, !re.test(w)));
const LL = fnBody('async function leadLevel(why)');
const gi = LL.indexOf('if (!levelByUser(why) && ((autoLvl.active && !autoLvl.stop) || (state.levelRetry || 0) > 0))');
t('R1 leadLevel guard present', gi > 0);
t('R1 guard runs before anything stops leveling', gi > 0 && gi < LL.indexOf('autoLvl.stop = true') && gi < LL.indexOf('setLeadPaused(false)') && gi < LL.indexOf('orderRetry('));
t('R1 guard returns', gi > 0 && /\n\s*return;\n\s*\}/.test(LL.slice(gi, gi + 400)));
// behaviour of the guard condition
const guard = (why, active, stop, retry) => !re.test(why) && ((active && !stop) || retry > 0);
t('R1 hunt timer during a trip is refused', guard('hunting time is up: back to the spot', true, false, 0));
t('R1 automation while another leadLevel regroups is refused', guard('watchdog', false, false, 1));
t('R1 automation after leveling stopped is allowed', !guard('after !kitbuy', false, false, 0) && !guard('soul hunt off', true, true, 0));
t('R1 user order during a trip is allowed', !guard('!level', true, false, 1));
const HT = fnBody('async function htEndRun(');
t('R1 hunt timer leaves a running plan level step alone', HT.includes("PLAN.running && PLAN.levelStep) note(") && /else leadLevel\('hunting time is up: back to the spot'\)/.test(HT));

// ---- R2 never blocks for good
const PL = fnBody('async function planStepLevel(step)');
t('R2 planStepLevel found', PL.length > 200);
t('R2 no fail return in the level step', !/return \{ fail:/.test(PL));
t('R2 busy task is not idle', PL.includes('|| busyTask()) { idle = 0; continue; }') && /now\(\) - \(state\.taskAt \|\| 0\) < 180000/.test(PL));
t('R2 a real run forgives restarts', PL.includes('else if (now() - ranSince > 120000 && restarts) restarts = 0;'));
t('R2 backoff pause then start again', /backoffs > 3 \? 1200000 : 600000/.test(PL) && /restarts = 0; idle = 0; if \(lvlToMin\(\) < to && !autoLvl\.active\) start\(\); continue;/.test(PL));
t('R2 the pause is told (party chat + plan why)', /SayToParty\(msg/.test(PL) && /pg\.why = msg; planProgSave\(pg\)/.test(PL));
t('R2 the pause still obeys the owner', /const w2 = planInterrupted\(\); if \(w2\) return \{ interrupted: w2 \}/.test(PL));

t('R2 an old give-up block resumes after the deploy when the party is ON', SW.includes("const oldLevelBlock = pg.status === 'blocked' && /leveling stopped again and again/.test(String(pg.why || ''));") && SW.includes("(pg.status !== 'running' && !oldLevelBlock) || !runOn()) return;"));

console.log(`${ok} ok, ${bad} FAIL`);
process.exit(bad ? 1 : 0);
