// Public tester Vykaax, Discord #swarmhive 2026-11-10 (Hive 1.14.0 + Swarm 3.11.5, raid party vRaidB01-09): node docs/plan/tools/test_raid_vykaax_1110.js
//  #6 RAIDCR / CRUNTIL  raid casters use the class guide like the hunting cast loop; "until X is learned" rows end; owner-off skills are never cast
//                       (castNow, raid debuffs, L2Swarm's own combat list)                                         -> combat.md R13
//  #7 HEALFULL          the healer never heals a teammate whose own fresh report says full                       -> combat.md R14
//  #8 RAIDWALL          a rock between a dealer and a big raid body is no wall; casters step sideways / hold      -> walls.md R6
//  #9 TOWNFIGHT         a .townname hold fights only what hits us close by, never clears standing aggro monsters -> towns.md R5
//  #10 SITTOGGLE        /sit and /stand are one toggle: sent only when the real state differs                     -> combat.md R15
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const src = fs.readFileSync(process.env.SWARM_JS || path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL ' + m); } };
const block = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i + 1); if (i < 0 || j < 0) throw new Error('block not found: ' + a); return src.slice(i, j); };
const fnBody = (name, len) => { const i = src.indexOf(name); return i < 0 ? '' : src.slice(i, i + (len || 6000)); };

// ---------------- #6 class guide in raids
const dataDir = path.join(ROOT, 'Scripts', 'data', 'class_rotation');
const CRBLOCK = block('// CLASSROT-2026-10-26 (owner: "Implement this', '// CLASSROT-END');
function engine(classId, skills, fileText) {
  const file = fileText || fs.readFileSync(path.join(dataDir, classId + '.json'), 'utf8');
  const SK = skills.map(s => ({ Id: s[0], Name: s[1], Level: 1, MP: 30, CastRange: s[2] == null ? 900 : s[2], HitTime: 1000, IsReady: true, AbnormalType: '' }));
  const env = {
    Me: { ClassId: classId, HpPercent: 100, MpPercent: 100, MP: 1000, X: 0, Y: 0, Z: 0, objId: 1, Name: 'Me', CP: 100, MaxCP: 100 },
    File: { ReadAllText: () => file }, __SCRIPTS__: 'S', SkillsList: { forEach: (f) => SK.forEach(f), GetItemByID: (id) => SK.find(s => s.Id === id) || null },
    hostSnap: { skills: () => SK, buffs: () => [] }, BuffsList: { forEach: () => { } }, myGear: () => ({ eq: {} }),
    num: (v) => { const n = Number(v); return isFinite(n) ? n : 0; }, now: () => 1e9, logError: () => { }, cpNormEl: () => '', skillElementByName: () => '',
    countFightMobsNear: () => 1, aoeMinNow: () => 3, snapMobs: () => [], itemCount: () => 0, livePos: {}, PetList: { Count: 0 }, teamNames: () => ['Me', 'B'],
    inRaid: () => true, IsAttacking: true, lastAttackerOnMe: { at: 0 }, BuffLow: () => true, castNow: async () => ({ started: true }), Target: null, Distance: () => 600,
    skillPlan: { key: '' }, PartyList: { forEach: () => { } }, hiveSkillsOn: () => true, skFilterAttacks: (a) => a, myBuffEntry: () => null, state: { role: 'necromancer' },
  };
  const names = Object.keys(env);
  const fn = new Function(...names, CRBLOCK + '\nreturn { crApplyPlan, crBlocked, crUntilId, crOffIds, setPlan: (p) => { skillPlan = p; } };');
  return fn(...names.map(n => env[n]));
}
const NECRO = [[1148, 'Death Spike'], [1220, 'Blaze'], [1263, 'Curse Gloom'], [1234, 'Vampiric Claw'], [1222, 'Curse Chaos'], [1269, 'Curse Disease'], [1164, 'Curse Weakness']];
{
  const E = engine(13, NECRO);
  ok(E.crUntilId({ when: { text: 'until Death Spike (1148) is learned at 44' } }) === 1148, 'crUntilId: Blaze row ends with Death Spike 1148');
  ok(E.crUntilId({ when: { text: 'levels 76-78, until Summon Feline King (1406) is learned' } }) === 1406 && E.crUntilId({ when: { text: 'until the charges are full' } }) === 0, 'crUntilId: other "until" texts');
  const p = E.crApplyPlan({ key: 'k', attacks: [], selfBuffs: [], toggles: [] }); E.setPlan(p);
  const names = p.attacks.map(x => x.name);
  ok(!!p.cr && names.includes('Death Spike') && !names.includes('Blaze'), `Necromancer 55 (Death Spike learned): no Blaze in the raid / hunting plan (${names.join(', ')})`);
  ok(E.crBlocked(1220) === true, 'Necromancer: Blaze blocked on every automatic path once Death Spike is learned (castNow / L2Swarm list)');
  ok(E.crBlocked(1222) === true, 'Necromancer: Curse Chaos (guide: never, weak) blocked - raid debuffs no longer cast it');
  ok(E.crBlocked(1148) === false, 'Death Spike free');
}
{ // level 40-43: no Death Spike yet -> Blaze is the primary
  const E = engine(13, NECRO.filter(s => s[0] !== 1148));
  const p = E.crApplyPlan({ key: 'k', attacks: [], selfBuffs: [], toggles: [] }); E.setPlan(p);
  ok(p.attacks.some(x => x.name === 'Blaze') && !E.crBlocked(1220), 'Necromancer 40-43 (no Death Spike): Blaze stays the nuke');
}
{ // the owner unticks Death Spike on #/combat (compiled file: user true, auto false) -> never cast
  const d = JSON.parse(fs.readFileSync(path.join(dataDir, '13.json'), 'utf8'));
  d.rows.forEach(r => { if (r.id === 1148 && r.a === 'single') { r.auto = false; r.user = true; } });
  const E = engine(13, NECRO, JSON.stringify(d));
  const p = E.crApplyPlan({ key: 'k', attacks: [], selfBuffs: [], toggles: [] }); E.setPlan(p);
  ok(!p.attacks.some(x => x.name === 'Death Spike') && E.crBlocked(1148), 'owner tick off (Death Spike): not in the plan and blocked everywhere (combat.md R3/R4)');
  ok(!E.crBlocked(1263), 'a guide-default row is not blocked by the owner-off rule');
  const off = E.crOffIds([{ id: 5, a: 'partybuff', auto: false, user: false }, { id: 6, a: 'single', auto: false, user: true }, { id: 7, a: 'single', auto: false, user: true }, { id: 7, a: 'aoe', auto: true }]);
  ok(!off.has(5) && off.has(6) && !off.has(7), 'crOffIds: only owner-unticked skills with no auto row left (songs / summons the guide leaves off stay usable)');
}
{ // L2Swarm's own combat list: blocked skills switched off while the script owns the attacks
  const M = new Function(block('// CASTLOOP-BEGIN', '// CASTLOOP-END') + '\nreturn { l2sGuardPlan };')();
  let r = M.l2sGuardPlan([{ id: 1148, enabled: true }, { id: 1220, enabled: true }], { own: true, attackIds: [1148], off: {}, blockIds: [1220] });
  ok(r.disable.includes(1148) && r.disable.includes(1220), 'l2sGuardPlan: the blocked Blaze is switched off in L2Swarm\'s Combat Skills too (it cast it between the script casts)');
  r = M.l2sGuardPlan([{ id: 1220, enabled: false }], { own: true, attackIds: [1148], off: { 1220: true }, blockIds: [1220] });
  ok(!r.restore.includes(1220), 'l2sGuardPlan: a blocked skill we switched off is NOT switched back on while we own the attacks (was: restored)');
  r = M.l2sGuardPlan([{ id: 1220, enabled: false }], { own: false, attackIds: [], off: { 1220: true }, blockIds: [] });
  ok(r.restore.includes(1220), 'l2sGuardPlan: given back when the script no longer owns the attacks');
}
{ const rd = fnBody('async function raidDealer(boss)', 22000);
  ok(rd.includes('crOrder: crOn') && rd.includes('crLive(cands, tgt, dT, true)') && rd.includes('crNoteCast(pk.skill, pk.why, num(tgt.objId))'), 'raidDealer: guide order + live row rules + target marks (same as autoSkillTick)');
  ok(rd.includes('if (castOne) { castStats.fightMs += now() - itT0; await sleep(20); }'), 'raidDealer: the next cast right after the previous one ended');
  const ds = fnBody('function raidDebuffSkills()', 2500);
  ok(ds.includes('if (crBlocked(num(k.Id))) return;'), 'raid debuffs skip guide never / owner-off skills (they bypass castNow)');
  ok(fnBody('function l2sSkillGuard(forceRestore)', 1500).includes('blockIds'), 'l2sSkillGuard passes the blocked skills');
  ok(src.includes('(p.cr.off && p.cr.off.has(num(id)))') && src.includes('off: crOffIds(d.rows) }'), 'crBlocked = never + owner-off'); }

// ---------------- #7 no heals at full HP
{
  const H = new Function(block('// HEALHP-PURE-BEGIN', '// HEALHP-PURE-END') + '\nreturn { healHpPick };')();
  ok(H.healHpPick({ rowPct: 70, rep: 100, repAgeMs: 1500, repFight: false }) === 100, 'party row says 70, the leader himself says 100 (fresh, nothing hits him) -> full, no heal');
  ok(H.healHpPick({ rowPct: 70, rep: 100, repAgeMs: 1500, repFight: true }) === 70, 'in a fight the live party row wins');
  ok(H.healHpPick({ rowPct: 70, rep: 100, repAgeMs: 9000, repFight: false }) === 70, 'a stale report does not override the row');
  ok(H.healHpPick({ rowPct: 40, rep: 45, repAgeMs: 1000 }) === 40, 'really hurt: the row');
  ok(H.healHpPick({ rowPct: 0, rep: 100, repAgeMs: 1000 }) === 100 && H.healHpPick({ rowPct: 0 }) === 100, 'row HP unknown (0) is never "low"');
  ok(H.healHpPick({ rowPct: 80 }) === 80, 'no own report: the row as before');
  const ht = fnBody('function healTargets()', 2500);
  ok(ht.includes('const hpNow = healHpPick({ rowPct: num(m.HpPercent)') && ht.includes('hp: hpNow,'), 'healTargets uses healHpPick');
}

// ---------------- #8 raid wall
{
  const W = new Function(block('// RAIDWALL-PURE-BEGIN', '// RAIDWALL-PURE-END') + '\nreturn { raidWallDecide };')();
  ok(W.raidWallDecide({ see: true, dist: 900 }) === 'ok', 'seen = attack');
  ok(W.raidWallDecide({ see: false, dist: 220, dz: 20, onUs: false, melee: true }) === 'ok', 'melee in reach of a big raid body (220) behind a rock = attack (Leo\'s Steward)');
  ok(W.raidWallDecide({ see: false, dist: 600, dz: 10, onUs: true, melee: true }) === 'ok', 'it hits a teammate: melee keeps attacking (the server walks round)');
  ok(W.raidWallDecide({ see: false, dist: 600, dz: 10, onUs: true, melee: false }) === 'side', 'it hits a teammate: a caster steps sideways for a clear line');
  ok(W.raidWallDecide({ see: false, dist: 998, dz: 10, onUs: false, melee: true }) === 'wall', 'out of reach and touching nobody (Archon through a wall) = still a wall');
  ok(W.raidWallDecide({ see: false, dist: 200, dz: 400, onUs: true, melee: true }) === 'wall', 'another floor stays a wall');
  const rd = fnBody('async function raidDealer(boss)', 22000), side = rd.slice(rd.indexOf("if (rwd === 'side')"), rd.indexOf("if (rwd === 'wall')"));
  ok(rd.includes('raidWallDecide({ see: false, dist: Distance(tgt)') && side.length > 0 && !side.includes('followSpot(tank)'), 'raidDealer: the decide is used; a caster never runs off to the tank for a rock');
}

// ---------------- #9 town hold
{
  const T = new Function(block('// TOWNFIGHT-PURE-BEGIN', '// TOWNFIGHT-PURE-END') + '\nreturn { holdFightScope, HOLDFIGHT };')();
  const t = T.holdFightScope({ town: true }), f = T.holdFightScope({ town: false });
  ok(t.helpMax <= 1500 && t.clearAggro === false, `.townname hold: helps only fights within ${t.helpMax}, never clears standing aggressive monsters`);
  ok(f.helpMax === 4000 && f.clearAggro === true, 'field port: the old clearing stays');
  const h = fnBody('async function teamRegroupBeforePortInner(', 26000);
  ok(h.includes('const hfs = holdFightScope({ town: !!dTown });') && (h.match(/< hfs\.helpMax/g) || []).length >= 3 && h.includes('if (hfs.clearAggro && !currentTownKey() && dangerMobs()'), 'the hold uses the scope (help distance x3, clearing gated)');
}

// ---------------- #10 sit / stand toggle
{
  const S = new Function(block('// SITCMD-PURE-BEGIN', '// SITCMD-PURE-END') + '\nreturn { sitCmd };')();
  ok(S.sitCmd('stand', false, 0, 1e6) === '', 'standing + stand = nothing (a /stand would SIT it down: one toggle)');
  ok(S.sitCmd('stand', true, 0, 1e6) === '/stand', 'sitting + stand = /stand');
  ok(S.sitCmd('sit', true, 0, 1e6) === '' && S.sitCmd('sit', false, 0, 1e6) === '/sit', 'sit only when standing');
  ok(S.sitCmd('stand', true, 1e6 - 500, 1e6) === '', 'no second command within 1.5 s (the server answer is not in yet)');
  const raw = (src.match(/RunCommand\('\/(?:sit|stand)'\)/g) || []).length;
  const allowed = (src.match(/if \(!Me\.IsSitting\) \{? ?RunCommand\('\/sit'\)/g) || []).length + (src.match(/RunCommand\('\/stand'\); rest\.sitting = false; return \{ ok: true, how: 'stood up' \}/g) || []).length
    + (src.match(/RunCommand\('\/sit'\); return \{ ok: true, how: 'sat down/g) || []).length + (src.match(/RunCommand\('\/sit'\), \.\.\.\)/g) || []).length;
  ok(raw === allowed, `no unguarded /sit or /stand left (${raw} raw, ${allowed} guarded)`);
  ok(src.includes("function standUp() { try { sitSet('stand'); rest.sitting = false; } catch (e) { } }"), 'standUp goes through sitCmd (no stand from the stale flag alone)');
  ok(src.includes('rest.byHold = false; standUp(); rest.sitting = false; SITG.since = 0;'), 'sit guard: ONE stand (it stood up and sat straight down again)');
}
console.log(`tester 2026-11-10 raid fixes: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
