// RUNNERSTEALTH-2026-11-03 (owner: "The runner should ideally be a dagger class, they have silent walk so they can bypass all monsters levels
// because they are hidden ... So you should not level restrict the runner"): no level limit with stealth ON (default), Silent Move kept ON the
// whole trip in the field, the old limit only with the setting OFF
const fs = require('fs'), path = require('path'), R = path.join(__dirname, '../../..');
const SRC = fs.readFileSync(path.join(R, 'Scripts_dev/swarm.js'), 'utf8');
let ok = 0, bad = 0; const t = (m, c) => { if (c) { ok++; console.log('ok   ' + m); } else { bad++; console.log('FAIL ' + m); } };
const fn = (name) => { const i = SRC.indexOf('function ' + name + '('); let d = 0, j = SRC.indexOf('{', i); for (; j < SRC.length; j++) { if (SRC[j] === '{') d++; else if (SRC[j] === '}' && --d === 0) break; } return SRC.slice(i, j + 1); };
const meet = new Function(fn('crunMeetDecide') + '\nreturn crunMeetDecide;')();
const want = new Function(fn('crunStealthWant') + '\nreturn crunStealthWant;')();
t('stealth ON (default): walks in even to level-80 monsters at level 60', meet(80, 60).walkIn && meet(80, 60, true).walkIn && /stealth/.test(meet(80, 60).why));
t('stealth OFF: the old limit (level + 5, else one member meets it)', !meet(80, 60, false).walkIn && meet(64, 60, false).walkIn && /ONE member/.test(meet(80, 60, false).why));
const base = { runner: true, trip: true, stealth: true, town: false, dead: false, hitAgoMs: null };
t('Silent Move ON on a runner trip in the field (also standing for a hand-over)', want(base));
t('OFF in town, dead, when hit (self-defence first), without a trip, for a non-runner, with the setting OFF',
  !want(Object.assign({}, base, { town: true })) && !want(Object.assign({}, base, { dead: true })) && !want(Object.assign({}, base, { hitAgoMs: 2000 }))
  && !want(Object.assign({}, base, { trip: false })) && !want(Object.assign({}, base, { runner: false })) && !want(Object.assign({}, base, { stealth: false })));
t('the trip uses the setting', /crunMeetDecide\(danger, num\(Me\.Level\), S\.stealth\)/.test(SRC) && /stealth: j\.runnerStealth !== false \}/.test(SRC));
// RUNNERRUN-2026-11-03 (owner: "Dagger1 should run not walk"): stealth only near aggressive monsters (wide 1500 margin), run re-asserted every 20 s
t('the runner RUNS: /run re-asserted every 20 s on a trip, stealth only near aggressive monsters (1500 margin), else full speed', /RUNNERRUN-2026-11-03[\s\S]{0,200}SCOUT_SPEED\.always && now\(\) - \(SCOUT_SPEED\.runAt \|\| 0\) > 20000/.test(SRC) && /const pad = SCOUT_SPEED\.always \? 1500 : SCOUT_SPEED\.nearPad;/.test(SRC) && !/if \(SCOUT_SPEED\.always\) near = true;/.test(SRC));
t('the toggle keeper leaves the runner stealth alone (SOLOSNEAK.on)',/SCOUT_SPEED\.always = rs;\s*\n\s*const due = rs \|\| soloSneakDue\(\);/.test(SRC));
const CA = fs.readFileSync(path.join(R, 'Dashboard/crafterpage_api.js'), 'utf8'), CP = fs.readFileSync(path.join(R, 'Dashboard/crafterpage.js'), 'utf8'), RP = fs.readFileSync(path.join(R, 'Dashboard/runnerpage.js'), 'utf8');
t('Crafter + Runner page switch, saved as crafter.json runnerStealth (default ON)', /runnerStealth: j\.runnerStealth !== false/.test(CA) && /typeof b\.runnerStealth === 'boolean'/.test(CA) && /data-cfstealth/.test(CP) && /data-rnpst/.test(RP));
console.log(`runner stealth: ${ok} ok, ${bad} failed`); process.exit(bad ? 1 : 0);
