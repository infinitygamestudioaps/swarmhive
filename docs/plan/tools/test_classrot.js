// CLASS ROTATIONS (CLASSROT-2026-10-26; owner: "Implement this ... line for line"): node docs/plan/tools/test_classrot.js
//  A) the data: every class line, 0 errors in class_rotations_check.js; the compiled per-class files exist
//  B) the engine (swarm.js CLASSROT block, stubbed host): Destroyer 2H / polearm / unknown weapon, Berserker conditions (distance, bleed,
//     Scorn never), old skills give way, never guard, emergency + buffs, castPick in the guide's order
//  C) the wiring: buildSkillPlan -> crApplyPlan, castCands/castPick hooks, castNow guard, keeper, state, Destroyer raid order, dashboard
const fs = require('fs'), path = require('path'), cp = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const src = fs.readFileSync(process.env.SWARM_JS || path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL ' + m); } };

// ---------------- A) data
{ const r = cp.spawnSync(process.execPath, [path.join(__dirname, 'class_rotations_check.js')], { encoding: 'utf8' });
  ok(r.status === 0, 'class_rotations_check: 0 errors (' + String(r.stdout).trim().split('\n').pop() + ')');
  ok(/6 files, 103 classes/.test(r.stdout), 'all 6 race files, all 103 class ids'); }
const CRL = require(path.join(ROOT, 'Dashboard', 'classrot_logic.js'));
const dataDir = path.join(ROOT, 'Scripts', 'data', 'class_rotation');
const cls = (id) => JSON.parse(fs.readFileSync(path.join(dataDir, id + '.json'), 'utf8'));
ok(fs.existsSync(path.join(dataDir, '46.json')) && fs.existsSync(path.join(dataDir, '113.json')) && fs.existsSync(path.join(dataDir, '127.json')), 'compiled per-class files (Destroyer, Titan, Berserker)');
ok(CRL.whenText({ mobsMin: 2, distMin: 200, targetHas: 'bleed' }) === '2+ monsters · target 200+ away · target has bleed', 'whenText reads plainly');

// ---------------- B) engine
const a = src.indexOf('// CLASSROT-2026-10-26 (owner: "Implement this'), b = src.indexOf('// CLASSROT-END');
ok(a > 0 && b > a, 'CLASSROT block found');
const block = src.slice(a, b);
function engine(classId, skills, weapon, extra) {
  const X = Object.assign({ mobs: [], buffs: [], hp: 100, mp: 100, target: null, casts: [] }, extra || {});
  const file = fs.readFileSync(path.join(dataDir, classId + '.json'), 'utf8');
  const SK = skills.map(s => Object.assign({ Id: s[0], Name: s[1], Level: 1, MP: 30, CastRange: s[2] == null ? 40 : s[2], HitTime: 1000, IsReady: true, AbnormalType: '' }, s[3] || {}));
  const env = {
    Me: { ClassId: classId, HpPercent: X.hp, MpPercent: X.mp, MP: 1000, X: 0, Y: 0, Z: 0, objId: 1, Name: 'Me', CP: 100, MaxCP: 100 },
    File: { ReadAllText: () => file }, __SCRIPTS__: 'S', SkillsList: { forEach: (f) => SK.forEach(f), GetItemByID: (id) => SK.find(s => s.Id === id) || null },
    hostSnap: { skills: () => SK, buffs: () => X.buffs }, BuffsList: { forEach: (f) => X.buffs.forEach(f) },
    myGear: () => ({ eq: weapon ? Object.assign({ weapon: [{ info: weapon }] }, weapon.shield ? { shield: [{}] } : {}) : {} }),
    num: (v) => { const n = Number(v); return isFinite(n) ? n : 0; }, now: () => 1e9, logError: () => { }, cpNormEl: () => '', skillElementByName: () => '',
    countFightMobsNear: (x, y, r) => X.mobs.filter(m => Math.hypot(m.X - x, m.Y - y) <= r).length, aoeMinNow: () => 3, snapMobs: () => X.mobs, itemCount: () => 0,
    livePos: {}, PetList: { Count: 0 }, teamNames: () => ['Me', 'B'], inRaid: () => false, IsAttacking: true, lastAttackerOnMe: { at: 0 }, BuffLow: (id) => !X.buffs.some(b => b.Id === id),
    castNow: async (info) => { X.casts.push(info.name); return { started: true }; }, Target: X.target, Distance: () => X.dist || 50, skillPlan: { key: '' }, PartyList: { forEach: () => { } },
    hiveSkillsOn: () => true, skFilterAttacks: (a) => a, myBuffEntry: () => null, state: { role: "" },
  };
  const names = Object.keys(env);
  const fn = new Function(...names, block + '\nreturn { CR, crData, crApplyPlan, crLive, crBlocked, crMarkCast, crTargetHas, crWhenOk, crEmergencyStep, crBuffStep, crPublic, crWeaponCodes, setPlan: (p) => { skillPlan = p; } };');
  const E = fn(...names.map(n => env[n]));
  // the engine reads skillPlan through its closure argument: give it the plan object
  return { E, X, env };
}
// Destroyer: a 2H blunt
{
  const skills = [[3, 'Power Strike'], [255, 'Power Smash'], [190, 'Fatal Strike'], [260, 'Hammer Crush'], [315, 'Crush of Doom'], [36, 'Whirlwind', -1], [245, 'Wild Sweep'], [29, 'Iron Punch'], [100, 'Stun Attack'], [94, 'Rage', -1], [176, 'Frenzy', -1], [139, 'Guts', -1], [320, 'Wrath']];
  const { E } = engine(46, skills, { t: 'BLUNT', two: 1 });
  const p = E.crApplyPlan({ key: 'k', attacks: [], selfBuffs: [], toggles: [] });
  const names = p.attacks.map(x => x.name);
  ok(!!p.cr, 'Destroyer: the guide plan is used');
  ok(names[0] === 'Crush of Doom' && names.indexOf('Fatal Strike') > 0 && names.indexOf('Hammer Crush') > names.indexOf('Fatal Strike'), `Destroyer 2H blunt: Crush of Doom > Fatal Strike > Hammer Crush (${names.join(', ')})`);
  ok(!names.includes('Whirlwind') && !names.includes('Wild Sweep'), 'Destroyer 2H: no polearm skills');
  ok(!names.includes('Power Strike') && !names.includes('Power Smash') && !names.includes('Stun Attack'), 'Destroyer: older skills give way (Power Strike, Power Smash, Stun Attack)');
  ok(!names.includes('Iron Punch'), 'Destroyer 2H: no fist skill');
  ok(p.cr.never.has(320), 'Destroyer: Wrath (CP only) never');
}
// Destroyer: a polearm
{
  const skills = [[190, 'Fatal Strike'], [315, 'Crush of Doom'], [36, 'Whirlwind', -1], [245, 'Wild Sweep'], [255, 'Power Smash']];
  const { E } = engine(46, skills, { t: 'POLE', two: 1 });
  const p = E.crApplyPlan({ key: 'k', attacks: [], selfBuffs: [], toggles: [] });
  const names = p.attacks.map(x => x.name), ww = p.attacks.filter(x => x.name === 'Whirlwind');
  ok(names.includes('Whirlwind') && !names.includes('Wild Sweep') && !names.includes('Fatal Strike'), `Destroyer polearm: Whirlwind, no Wild Sweep, no sword/blunt skills (${names.join(', ')})`);
  ok(ww.some(x => x.scope === 'POINT_BLANK' && x.range >= 150), 'Whirlwind = an area attack around me (POINT_BLANK, radius range)');
}
// Destroyer: weapon unknown -> only weapon-free rows
{
  const { E } = engine(46, [[190, 'Fatal Strike'], [36, 'Whirlwind', -1], [94, 'Rage', -1]], null);
  const p = E.crApplyPlan({ key: 'k', attacks: [], selfBuffs: [], toggles: [] });
  ok(!p.attacks.some(x => ['Fatal Strike', 'Whirlwind'].includes(x.name)), 'weapon unknown: no weapon-bound attack (was: every weapon\'s skills)');
}
// Berserker: rules
{
  const skills = [[477, 'Dark Smash'], [497, 'Crush of Pain'], [498, 'Contagion'], [494, 'Shoulder Charge'], [495, 'Blade Rush'], [493, 'Storm Assault'], [496, 'Slashing Blade', -1], [492, 'Spread Wing', -1], [503, 'Scorn']];
  const T = { objId: 77, X: 0, Y: 0, HP: 100, MaxHP: 100 };
  const { E, X } = engine(127, skills, { t: 'ANCIENTSWORD', two: 1 }, { target: T });
  const p = E.crApplyPlan({ key: 'k', attacks: [], selfBuffs: [], toggles: [] });
  E.setPlan(p);
  ok(p.cr.never.has(503), 'Berserker: Scorn never (pulls aggro off the tank)');
  ok(E.crBlocked(503) === true && E.crBlocked(477) === false, 'castNow guard: Scorn blocked, Dark Smash free');
  const byName = (n) => p.attacks.filter(x => x.name === n);
  const live = (dist) => { const c = p.attacks.map(x => Object.assign({}, x)); E.crLive(c, T, dist, false); return c; };
  let c = live(50);
  ok(c.filter(x => x.name === 'Contagion').every(x => x.crOk === false), 'Contagion waits for a bleed on the target');
  ok(c.filter(x => x.name === 'Shoulder Charge').every(x => x.crOk === false), 'Shoulder Charge not in melee (needs 200+)');
  ok(c.filter(x => x.name === 'Dark Smash').some(x => x.crOk !== false), 'Dark Smash usable in melee');
  c = live(300);
  ok(c.filter(x => x.name === 'Shoulder Charge').some(x => x.crOk !== false), 'Shoulder Charge from 300 away (1 monster)');
  E.crMarkCast(byName('Blade Rush')[0] || { id: 495, name: 'Blade Rush', cr: { ab: 'BLEEDING', dur: 20 } }, 77);
  c = live(50);
  ok(c.filter(x => x.name === 'Contagion').some(x => x.crOk !== false), 'Contagion once Blade Rush made the target bleed');
  // an opener once per target (Doombringer1 spammed Abyssal Blaze after the first deploy), a debuff only after it wore off
  const ab = p.attacks.find(x => x.cr && x.cr.a === 'opener');
  if (ab) { E.crMarkCast(ab, 77); c = live(300); ok(c.filter(x => x.id === ab.id).every(x => x.crOk === false), `opener ${ab.name}: once per target`); }
  const vt = p.attacks.find(x => x.cr && x.cr.a === 'debuff');
  if (vt) { E.crMarkCast(vt, 77); c = live(50); ok(c.filter(x => x.id === vt.id).every(x => x.crOk === false), `debuff ${vt.name}: not again while it is on the target`); }
  X.mobs.push({ X: 10, Y: 0 }, { X: 20, Y: 0 }, { X: 30, Y: 0 });
  c = live(50);
  ok(c.filter(x => x.name === 'Slashing Blade').some(x => x.crMobs >= 3 && x.crOk !== false), 'Slashing Blade with 3 monsters around me (counted around ME)');
}
// castPick in the guide's order (CASTLOOP block + crOrder)
{
  const ca = src.indexOf('// CASTLOOP-BEGIN'), cb = src.indexOf('// CASTLOOP-END');
  const M = new Function(src.slice(ca, cb) + '\nreturn { castPick };')();
  const s = (o) => Object.assign({ scope: 'SINGLE', ready: true, reuseLeftMs: 0, mp: 10, range: 40, castMs: 800, power: 100 }, o);
  let r = M.castPick([s({ id: 1, name: 'Crush of Doom', crOk: true, power: 7000 }), s({ id: 2, name: 'Fatal Strike', crOk: true })], { mp: 100, dist: 30, mobs: 1, crOrder: true, now: 0 });
  ok(r.skill && r.skill.name === 'Crush of Doom', 'castPick (guide order): the first row');
  r = M.castPick([s({ id: 1, name: 'Crush of Doom', ready: false, reuseLeftMs: 3000 }), s({ id: 2, name: 'Fatal Strike' })], { mp: 100, dist: 30, mobs: 1, crOrder: true, now: 0 });
  ok(r.skill && r.skill.name === 'Fatal Strike', 'castPick (guide order): the next row while the first is on cooldown');
  r = M.castPick([s({ id: 1, name: 'Contagion', crOk: false }), s({ id: 2, name: 'Dark Smash' })], { mp: 100, dist: 30, mobs: 1, crOrder: true, now: 0 });
  ok(r.skill && r.skill.name === 'Dark Smash', 'castPick: a row whose rule fails is skipped');
  r = M.castPick([s({ id: 3, name: 'Whirlwind', scope: 'POINT_BLANK', crMobs: 1, crMobsMin: 2, range: 150 }), s({ id: 2, name: 'Fatal Strike' })], { mp: 100, dist: 30, mobs: 1, crOrder: true, now: 0 });
  ok(r.skill && r.skill.name === 'Fatal Strike', 'castPick: an area row needs its monsters');
  r = M.castPick([s({ id: 2, name: 'Prominence' }), s({ id: 9, name: 'Aura Flare', crSpecific: true })], { mp: 100, dist: 30, mobs: 1, crOrder: true, now: 0 });
  ok(r.skill && r.skill.name === 'Aura Flare', 'castPick: a situational row whose rule holds beats the plain spam row');
}
// ---------------- C) wiring
ok(src.includes('  return crApplyPlan(plan);'), 'buildSkillPlan returns the guide plan');
ok(src.includes("attacks2 = skFilterAttacks(attacks, state.role || '', myBuffEntry());"), 'agreed switches hold: caster buffers attack only when ticked (Chanter1 got nukes after the first deploy)');
ok(src.includes("if (plan.cr) crLive(cands, T, dist, worth);") && src.includes('chase, crOrder: !!plan.cr });'), 'autoSkillTick: live rules + guide order');
ok(src.includes("if (crBlocked(info && info.id) && !(opts && opts.user)) return { started: false, never: true };"), 'castNow: never rows are blocked on every automatic path');
ok(src.includes("if (plan.cr && await crEmergencyStep()) return { next: 0 };") && src.includes('await crBuffStep(sbCtx.town)'), 'emergency rows first, the guide buffs');
ok(src.includes('(skillPlan.cr.toggles.has(id) && !skillPlan.cr.toggleOff.has(id))'), 'toggle keeper: the guide toggles');
ok(src.includes('combatPlan: (() => { try { return crPublic(); }'), 'swarm_state.combatPlan for the dashboard');
{ const i = src.indexOf('async function drainAndFrenzy('), body = src.slice(i, i + 9000);
  ok(/await cast\(s\.rage, 1000\);\n    \{ const k = skillNamed\('Battle Roar'\); if \(k && k\.IsReady && !crHasBuffNamed\('Bless the Body'\)\)/.test(body), 'Destroyer: Rage (+ Battle Roar only without Bless the Body) BEFORE the drain');
  const z = body.indexOf('await cast(s.zealot, 1000);'), f = body.indexOf('await cast(s.frenzy, 1000);', z);
  ok(z > 0 && f > z && body.indexOf("if (!crHasBuffNamed('Frenzy')) { const k = skillNamed('Guts');", f) > f, 'Destroyer: Zealot -> Frenzy, Guts only when Frenzy did not land'); }
ok(src.includes("for (const n of ['Zealot', 'Frenzy', 'Guts', 'Rage']) { if (n === 'Guts' && crHasBuffNamed('Frenzy')) continue;"), 'raid low-HP burst: Zealot -> Frenzy, no Guts over Frenzy');
const idx = fs.readFileSync(path.join(ROOT, 'Dashboard', 'index.html'), 'utf8'), srv = fs.readFileSync(path.join(ROOT, 'Dashboard', 'server.js'), 'utf8');
ok(idx.includes('<script src="/combatclass.js"></script>') && idx.includes('CombatClassPage.route(kind, arg)') && idx.includes('data-tab="combat"'), 'dashboard: #/combat page, route, Combat tab');
ok(srv.includes("CLASSROT_HOT = { sig, mod: require('./classrot_api') }") && srv.includes('await classrotApi().handle(req, res, url,'), 'server: /api/classrot (hot-reloaded module)');
console.log(`class rotations: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
