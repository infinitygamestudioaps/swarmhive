// OFFLINE TEST of the raid role decisions (2026-10-09, party Tank3 vs Serpent Demon Bifrons / Ikuntai / Zombie Lord Crowl:
// "nobody actually cast a debuff"). Runs the RAIDROLE-PURE block of Scripts_dev/swarm.js in node:
//   node docs/plan/tools/test_raid_roles.js            (exit code 1 when a check fails)
// Covers: the debuff gate (destroyer opening / no destroyer / NO destroyer opening on the boss), the debuff range plan (tank Sting in melee,
// doomcryer Venom from the caster spacing -> step in), Chant of Life rule, doomcryer chant order, the 3 s follow check under the native-nav
// guard (the 'follow resumed' loop), the script follow threshold in raids, raid targeting ownership (self-defence) and the tank's Aggression
// spam hold; plus a replay of the Crowl timeline (old rules: no debuff for 3.5 min / never; new: first debuff within ~20 s) and wiring checks.
const fs = require('fs'), path = require('path');
const SRC = path.join(__dirname, '..', '..', '..', 'Scripts_dev', 'swarm.js');
const src = fs.readFileSync(SRC, 'utf8');
const a = src.indexOf('// RAIDROLE-PURE-BEGIN'), b = src.indexOf('// RAIDROLE-PURE-END');
if (a < 0 || b < a) { console.error('RAIDROLE-PURE block not found'); process.exit(1); }
const M = new Function(src.slice(a, b) + '\nreturn { RAIDROLE, raidDebuffGate, debuffRecastMs, raidDebuffPlan, chantOfLifeDue, doomcryerChantDue, followResumeOk, nnFollowThreshold, raidOwnsTargeting, aggroSpamHold };')();
let fails = 0, n = 0;
const check = (ok, what) => { n++; console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails++; };

// ---- 1) debuff gate --------------------------------------------------------------------------------------------------------
const T = 1000000;
let g = M.raidDebuffGate({ now: T, ddStartAt: 0, aggroAt: 0, fullAt: 0, destroyers: 1 });
check(!g.go, `no aggro yet -> no debuffs (${g.why})`);
g = M.raidDebuffGate({ now: T, ddStartAt: T - 1000, aggroAt: T - 2000, destroyers: 1 });
check(g.go, `destroyer hits the boss (swarm.ddstart) -> debuffs (${g.why})`);
g = M.raidDebuffGate({ now: T, ddStartAt: 0, aggroAt: T - 10000, destroyers: 1 });
check(!g.go, 'destroyer in the team, aggro 10 s ago, no opening yet -> still waiting');
g = M.raidDebuffGate({ now: T, ddStartAt: 0, aggroAt: T - 21000, destroyers: 1 });
check(g.go && /no destroyer opening/.test(g.why), `NO destroyer opening on the boss (dealers on minions) -> debuffs 20 s after the aggro (${g.why})`);
g = M.raidDebuffGate({ now: T, ddStartAt: 0, aggroAt: T - 9000, destroyers: 0 });
check(g.go, `no destroyer in the team -> debuffs 8 s after the aggro (${g.why})`);
g = M.raidDebuffGate({ now: T, ddStartAt: 0, aggroAt: T - 5000, destroyers: 0 });
check(!g.go, 'no destroyer, aggro 5 s ago -> not yet');
g = M.raidDebuffGate({ now: T, ddStartAt: 0, aggroAt: 0, fullAt: T - 25000, destroyers: 2 });
check(g.go, 'member missed swarm.aggro: the first full-aggro broadcast counts as the aggro time');
check(M.debuffRecastMs(30) === 28000 && M.debuffRecastMs(15) === 13000 && M.debuffRecastMs(5) === 8000 && M.debuffRecastMs(0) === 28000, 'recast gap: 2 s before it runs out, never under 8 s');

// ---- 2) debuff range plan --------------------------------------------------------------------------------------------------
const oldRule = (dist, range) => dist <= range + 60;          // the rule before 2026-10-09
let p = M.raidDebuffPlan({ dist: 115, range: 40, caster: false, hp: 90, fullAggro: true });
check(p.act === 'cast' && !oldRule(115, 40), `tank Sting (range 40) at 115 from the boss centre: cast (the old rule skipped it: ${p.why})`);
p = M.raidDebuffPlan({ dist: 93, range: 40, caster: false, hp: 90, fullAggro: true });
check(p.act === 'cast', 'tank Sting at 93: cast');
p = M.raidDebuffPlan({ dist: 420, range: 40, caster: false, hp: 90, fullAggro: true });
check(p.act === 'skip', `tank Sting at 420 (pulled away): skip (${p.why})`);
p = M.raidDebuffPlan({ dist: 750, range: 600, caster: true, hp: 100, fullAggro: true });
check(p.act === 'step' && p.to === 560 && !oldRule(750, 600), `doomcryer Venom (600) at 750 (raid spacing): step in to 560 (old rule: skipped) — ${p.why}`);
p = M.raidDebuffPlan({ dist: 640, range: 600, caster: true, hp: 100, fullAggro: true });
check(p.act === 'cast', 'doomcryer Venom at 640: cast from where he stands');
p = M.raidDebuffPlan({ dist: 750, range: 600, caster: true, hp: 100, fullAggro: false });
check(p.act === 'skip', `caster out of range without the tank's full aggro: no step-in (${p.why})`);
p = M.raidDebuffPlan({ dist: 750, range: 600, caster: true, hp: 100, fullAggro: true, bossOnMe: true });
check(p.act === 'skip', 'caster out of range with the boss on him: no step-in');
p = M.raidDebuffPlan({ dist: 750, range: 600, caster: true, hp: 45, fullAggro: true });
check(p.act === 'skip', 'caster out of range at 45 % HP: no step-in');
p = M.raidDebuffPlan({ dist: 1500, range: 600, caster: true, hp: 100, fullAggro: true });
check(p.act === 'skip', `caster 1500 away: too far to step in (${p.why})`);
p = M.raidDebuffPlan({ dist: 800, range: 600, caster: false, hp: 100, fullAggro: true });
check(p.act === 'cast', 'melee dealer (inspector Death Mark 600) at 800: cast, the server walks the last step');
p = M.raidDebuffPlan({ dist: 300, range: 0, caster: true, hp: 100, fullAggro: true });
check(p.act === 'skip', 'no cast range: skip');

// ---- 3) Chant of Life + doomcryer chants -------------------------------------------------------------------------------------
const tm = (...hps) => hps.map(h => typeof h === 'number' ? { hp: h } : h);
check(!M.chantOfLifeDue(tm(100, 90, 80, 76), 12), 'Chant of Life: nobody below 75 -> no');
check(M.chantOfLifeDue(tm(100, 70, 74), 12), 'Chant of Life: 2 below 75 -> yes');
check(!M.chantOfLifeDue(tm(100, 70, 90), 12), 'Chant of Life: only 1 below 75 (not below 50) -> no');
check(M.chantOfLifeDue(tm(100, 45), 12), 'Chant of Life: one below 50 -> yes');
check(!M.chantOfLifeDue(tm(100, { hp: 20, draining: true }), 12), 'Chant of Life: a draining destroyer at 20 % does not count');
check(M.chantOfLifeDue(tm(100, { hp: 10, draining: true }), 12), 'Chant of Life: a draining destroyer below the emergency (12 %) counts');
check(!M.chantOfLifeDue(tm(100, { hp: 0, dead: true }, { hp: 0, dead: true }), 12), 'Chant of Life: the dead do not count');
const C = (v, r, m) => ({ victory: v, rage: r, magnus: m });
check(M.doomcryerChantDue(C({}, {}, {})) === '', 'lvl 30 Orc Shaman (no Victory/Rage/Magnus): no chant, debuffs only');
check(M.doomcryerChantDue(C({ known: true, low: true }, { known: true, low: true }, { known: true, low: true })) === 'victory', 'Victory first');
check(M.doomcryerChantDue(C({ known: true, low: false }, { known: true, low: true }, { known: true, low: true })) === 'magnus', 'Victory up: Magnus next (Rage is replaced by Victory)');
check(M.doomcryerChantDue(C({ known: false }, { known: true, low: true }, { known: false })) === 'rage', 'below 78: Chant of Rage');
check(M.doomcryerChantDue(C({ known: true, low: false }, { known: true, low: true }, { known: true, low: false })) === '', 'all up: nothing (no blind recast)');

// ---- 4) follow -------------------------------------------------------------------------------------------------------------
const fr = (o) => M.followResumeOk(Object.assign({ noNativeNav: false, inRaid: false, paused: false, active: false, followName: true, dist: 500, busy: false }, o));
// replay: 146 s raid under the native-nav guard, the 3 s follow check (old: 'follow resumed' every tick because the guard holds follow off)
let oldResumes = 0, newResumes = 0;
for (let t = 0; t < 146; t += 3) {
  const active = false;                                                   // the guard switched ActiveFollow off again
  if ((false || (!active && true)) && 500 < 3000) oldResumes++;           // the old condition
  if (fr({ noNativeNav: true, inRaid: true, active })) newResumes++;
}
check(oldResumes >= 45 && newResumes === 0, `146 s raid under the guard: old check 'resumed' follow ${oldResumes}x, new 0x`);
check(fr({ paused: true }), 'outside the guard: paused follow near the leader -> resume');
check(!fr({ paused: true, busy: true }), 'busy (quest / route / gatekeeper): no resume');
check(!fr({ paused: true, dist: 5000 }), 'leader 5000 away: no resume');
check(!fr({ active: true, paused: false }), 'already following: nothing to do');
const th = (o) => M.nnFollowThreshold(Object.assign({ casting: false, castLock: false, inRaid: false, raidRunning: false, healer: false, raidClear: false }, o));
check(th({ inRaid: true, raidRunning: true, casting: true }) === 0, 'script follow never while casting');
check(th({ inRaid: true, raidRunning: true, castLock: true }) === 0, 'script follow never during a pending debuff / chant');
check(th({ inRaid: true, raidRunning: true }) === 1600, 'raid routine running (doomcryer at 700-1100 from the boss): follow only when > 1600 from the tank');
check(th({ inRaid: true, raidRunning: true, healer: true }) === 900, 'healers in a raid keep the 900 follow (heal range)');
check(th({ raidClear: true }) === 900 && th({}) === 350, 'raid clear 900, normal 350');

// ---- 5) targeting ownership + Aggression spam hold ----------------------------------------------------------------------------
const own = (o) => M.raidOwnsTargeting(Object.assign({ inRaid: true, raidRunning: true, tank: false, dealer: false }, o));
check(own({ tank: true }), "tank in a raid with raidSK running: self-defence does not re-target ('self-defence ... fighting it with skills' every 3 s)");
check(own({ dealer: true }), 'dealer in a raid with raidDealer running: the focus decides');
check(!own({ tank: true, raidRunning: false }), 'raid routine not running (boss not in sight yet): self-defence works');
check(!own({ tank: true, inRaid: false }), 'outside raids: self-defence works');
check(!own({}), 'neither tank nor dealer: not owned');
check(M.aggroSpamHold({ now: 100, castLock: 2000, onMate: false }), 'Aggression spam waits while a debuff cast is pending');
check(!M.aggroSpamHold({ now: 100, castLock: 2000, onMate: true }), 'a monster on a teammate: Aggression at once anyway');
check(!M.aggroSpamHold({ now: 3000, castLock: 2000, onMate: false }), 'lock over: spam again');

// ---- 6) replay: Zombie Lord Crowl 2026-10-09 (team with a destroyer, minions respawning, ddstart 210 s after the aggro) ---------
function replay(useNew) {
  const aggroAt = 12, dd = 222, out = { dc: null, tank: null };
  for (let t = 0; t < 460; t++) {
    const gate = useNew ? M.raidDebuffGate({ now: t * 1000, ddStartAt: t >= dd ? dd * 1000 : 0, aggroAt: t >= aggroAt ? aggroAt * 1000 : 0, destroyers: 1 }).go
                        : (t >= dd);                                      // old: raidPrep.ddStartAt || (... && !teamDestroyers().length)
    if (!gate) continue;
    const dcDist = 750, tankDist = 118;                                   // doomcryer at the caster spacing, tank in melee of a big boss
    if (out.dc === null) { const ok = useNew ? M.raidDebuffPlan({ dist: dcDist, range: 600, caster: true, hp: 100, fullAggro: true }).act !== 'skip' : oldRule(dcDist, 600); if (ok) out.dc = t; }
    if (out.tank === null) { const ok = useNew ? M.raidDebuffPlan({ dist: tankDist, range: 40, caster: false, hp: 90, fullAggro: true }).act !== 'skip' : oldRule(tankDist, 40); if (ok) out.tank = t; }
  }
  return out;
}
const o = replay(false), nw = replay(true);
check(o.dc === null && o.tank === null, `Crowl replay, OLD rules: doomcryer Venom ${o.dc === null ? 'never' : o.dc + ' s'}, tank Sting ${o.tank === null ? 'never' : o.tank + ' s'} (as in the raid)`);
check(nw.dc !== null && nw.dc <= 35 && nw.tank !== null && nw.tank <= 35, `Crowl replay, NEW rules: doomcryer Venom at ${nw.dc} s, tank Sting at ${nw.tank} s (aggro at 12 s)`);

// ---- 7) wiring in swarm.js -------------------------------------------------------------------------------------------------
const body = (name) => { const i = src.indexOf(name); return i < 0 ? '' : src.slice(i, i + 4000); };
check(/raidDebuffGate\(/.test(body('async function raidDebuffStep(')) && /raidDebuffCast\(boss, d\)/.test(body('async function raidDebuffStep(')), 'raidDebuffStep uses the gate + raidDebuffCast');
check(/LIVEP\.skill/.test(body('async function raidDebuffCast(')) && /raidKeepPauseUntil/.test(body('async function raidDebuffCast(')), 'raidDebuffCast checks that the cast started and pauses the spacing for a step-in');
check(/aggroSpamHold\(/.test(src) && /raidOwnsTargeting\(\{ inRaid: inRaid\(\), raidRunning: !!\(raidSeq && raidSeq\.running\), tank: .*dealer: MELEE_DD/.test(src), 'aggro spam hold + self-defence ownership are wired');
check(/followResumeOk\(\{ noNativeNav:/.test(src) && /nnFollowThreshold\(\{ casting:/.test(src), 'follow check + script follow use the pure rules');
check(/chantOfLifeDue\(healTargets\(\)/.test(src) && /doomcryerChantDue\(/.test(body('async function raidDoomcryer(')), 'Chant of Life + doomcryer chants use the pure rules');
check(/raidSeq\.running = true/.test(body('async function runRaidSequence(')) && /finally \{ if \(raidSeq\.runs === myRun\) raidSeq\.running = false; \}/.test(src), 'runRaidSequence marks the routine running (and clears it)');
check(!/\x08/.test(src), 'no backspace characters in swarm.js');

console.log(`\n${n - fails} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
