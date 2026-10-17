// OFFLINE TEST of the HEAL SCHEMES (public tester 2026-10-13: "No MP recharge from SE/EE", "SE uses Self Heal — the weakest heal skill — at
// lvl 80", "ability to set own heal / MP schemes"). Never touches the game, MCP or the live Logs / settings files.
//   node docs/plan/tools/test_heal_schemes.js        (exit code 1 when a check fails; SWARM_JS=<file> tests another copy of swarm.js)
// 1) data: Scripts/data/heal_skills.json is what docs/plan/tools/heal_skills.js builds from the datapack (real skill ids / powers / class lines);
//    Dashboard/heallogic.js is the text copy of HEALSCHEME-PURE.
// 2) HEALSCHEME-PURE: the automatic choice per class + level with the REAL skills (Shillien Elder / Saint, Elven Elder / Eva's Saint, Bishop,
//    Cardinal, Oracles, a level-5 mystic), Self Heal only as the last resort, Recharge to casters / everyone / off / Mass Recharge, the
//    scheme overrides (char > class > automatic, a picked skill, never-list, a picked skill cooling down), heal order, validation.
// 3) the REAL host code (Scripts_dev/swarm.js from HEALSCHEME-PURE to AUTO-SKILLS: healTick, castOnMate, the support heal, the XML guard) in
//    a mocked host: which packets a level-80 SE / EE sends. The same harness on the pre-fix copy (Settings/backup/healschemes_2026-10-13)
//    shows the two reported faults (informational).
// 4) the dashboard API (Dashboard/healschemes_api.js) on a scratch file: GET rows, set / clear per character and class, validation 400,
//    rev conflict 409, history copy, the bots' rules = the page's rules.
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const ROOT = path.join(__dirname, '..', '..', '..');
const SRCF = process.env.SWARM_JS || path.join(ROOT, 'Scripts_dev', 'swarm.js');
const src = fs.readFileSync(SRCF, 'utf8');
let fails = 0, n = 0;
const check = (ok, what, info) => { n++; console.log((ok ? 'ok   ' : 'FAIL ') + what + (info !== undefined && !ok ? ' — ' + (typeof info === 'string' ? info : JSON.stringify(info)) : '')); if (!ok) fails++; };
const blk = (s, b, e) => { const i = s.indexOf(b), j = s.indexOf(e, i + 1); if (i < 0 || j < i) { console.error(b + ' block not found'); process.exit(1); } return s.slice(i, j); };
const D = JSON.parse(fs.readFileSync(path.join(ROOT, 'Scripts', 'data', 'heal_skills.json'), 'utf8'));
const LIVEF = path.join(ROOT, 'Scripts', 'data', 'heal_schemes.json'), LIVE0 = fs.existsSync(LIVEF) ? fs.readFileSync(LIVEF, 'utf8') : null;

// ---- 1) data ------------------------------------------------------------------------------------------------------------------
{
  // PKGSKIP-2026-10-13: the public package has no L2J datapack (Scripts/data/dp) -> the "built from the datapack" compare is skipped there
  if (!fs.existsSync(path.join(ROOT, 'Scripts', 'data', 'dp', 'skills'))) console.log('  skipped: heal_skills.js --check needs the L2J datapack in Scripts/data/dp (dev install only)');
  else {
    const r = cp.spawnSync(process.execPath, [path.join(__dirname, 'heal_skills.js'), '--check'], { encoding: 'utf8' });
    check(r.status === 0, 'heal_skills.json is up to date with the datapack (heal_skills.js --check)', r.stdout + r.stderr);
  }
  const s = cp.spawnSync(process.execPath, [path.join(__dirname, 'heal_logic_sync.js'), '--check'], { encoding: 'utf8' });
  check(s.status === 0, 'Dashboard/heallogic.js = the HEALSCHEME-PURE block of swarm.js (heal_logic_sync.js --check)', s.stdout + s.stderr);
  check(D.skills[1216] && D.skills[1216].power[0] === 42 && D.skills[1216].kind === 'self', 'Self Heal 1216: power 42, kind self (from the datapack)');
  check(D.skills[1217].power.length === 33 && D.skills[1217].power[32] === 472, 'Greater Heal 1217: 33 levels, 472 at the top');
  check(D.skills[1013].kind === 'recharge' && D.skills[1428].kind === 'massRecharge', 'Recharge 1013 / Mass Recharge 1428 classified');
  const ids = (c) => (D.classes[c] || []).map(x => x.id);
  check(ids(43).includes(1013) && ids(43).includes(1217) && ids(43).includes(1219) && !ids(43).includes(1218), 'Shillien Elder line: Recharge, Greater Heal, Greater Group Heal, no Greater Battle Heal');
  check(ids(112).includes(1428) && ids(105).includes(1428), 'Shillien Saint + Eva\'s Saint: Mass Recharge (80)');
  check(ids(30).includes(1401) && ids(30).includes(1020) && ids(30).includes(1013), 'Elven Elder line: Major Heal, Vitalize, Recharge');
  check(ids(97).includes(1402) && ids(97).includes(1335) && !ids(97).includes(1013), 'Cardinal: Major Group Heal, Balance Life, no Recharge');
}

// ---- 2) pure ------------------------------------------------------------------------------------------------------------------
const PURE = blk(src, '// HEALSCHEME-PURE-BEGIN', '// HEALSCHEME-PURE-END');
const P = new Function(PURE + '\nreturn { HS_DEFAULT, HS_CHOOSE, hsClean, hsValidate, hsNorm, hsEffective, hsKnown, hsPick, hsAutoTable, hsOrder, hsRechargeTarget, hsPotionBelow, hsPowerAt, hsRow };')();
/** the skills a class line knows at a character level (skill level = the highest learned by then), all ready */
function skillsAt(cls, lvl, extra) {
  const out = [];
  (D.classes[cls] || []).forEach(s => { if (s.from > lvl) return; let sl = 0; for (let i = 0; i + 1 < s.at.length; i += 2) if (s.at[i] <= lvl && s.at[i + 1] > sl) sl = s.at[i + 1]; out.push(Object.assign({ id: s.id, level: sl || 1, ready: true, mp: 30 }, extra || {})); });
  return out;
}
const known = (cls, lvl) => P.hsKnown(skillsAt(cls, lvl), D);
const pick = (cls, lvl, sit, sc, o) => (P.hsPick(known(cls, lvl), sit, sc || P.HS_DEFAULT, o) || {}).id || null;
const name = (id) => (id ? D.skills[id].name + ' ' + id : 'nothing');
const maxSingle = (K) => K.filter(k => k.kind === 'single').reduce((a, k) => (k.power > (a ? a.power : -1) ? k : a), null);
// the reported classes at 80 + the other healer lines at several levels
const CASES = [[43, 80, 'Shillien Elder'], [112, 80, 'Shillien Saint'], [30, 80, 'Elven Elder'], [105, 80, 'Eva\'s Saint'], [16, 60, 'Bishop'], [97, 80, 'Cardinal'],
  [42, 25, 'Shillien Oracle'], [29, 35, 'Elven Oracle'], [15, 30, 'Cleric'], [43, 45, 'Shillien Elder'], [30, 58, 'Elven Elder']];
CASES.forEach(([c, l, nm]) => {
  const K = known(c, l), A = P.hsAutoTable(K), best = maxSingle(K);
  check(A.self && A.self.id !== 1216 && A.single && A.single.id !== 1216, `${nm} ${l}: never Self Heal (heal ${name(A.single && A.single.id)}, myself ${name(A.self && A.self.id)})`, A);
  const sg = K.find(k => k.id === (A.single || {}).id);
  check(best && sg && sg.power === best.power, `${nm} ${l}: "heal a teammate" = the strongest single heal it knows (${name(sg && sg.id)}, power ${sg && sg.power}; equal power = the faster cast)`, A.single);
  const em = K.find(k => k.id === (A.emergency || {}).id);
  check(em && em.kind === 'single' && em.power >= best.power * 0.5, `${nm} ${l}: "someone is dying" = a fast heal with at least half the top power (${name(em && em.id)}, power ${em && em.power})`, A.emergency);
});
// the exact choices for the two reported classes at 80 (real ids)
check(pick(43, 80, 'single') === 1217 && pick(112, 80, 'single') === 1217, 'SE / Shillien Saint 80: normal heal = Greater Heal 1217 (472) — not Self Heal (42)');
check(pick(43, 80, 'emergency') === 1015, 'SE 80: dying = Battle Heal 1015 (301 in 2 s beats Greater Heal 472 in 5 s)');
check(pick(43, 80, 'self', null, { forMe: true }) === 1217, 'SE 80: heal myself = Greater Heal 1217 on myself');
check(pick(43, 80, 'group') === 1219 && pick(43, 80, 'recharge') === 1013, 'SE 80: party heal = Greater Group Heal 1219, MP = Recharge 1013');
check(pick(30, 80, 'single') === 1401 && pick(30, 80, 'emergency') === 1020, 'Elven Elder 80: normal = Major Heal 1401 (946), dying = Vitalize 1020 (780 in 3 s)');
check(pick(105, 80, 'recharge', null, { count: 3 }) === 1428 && pick(105, 80, 'recharge', null, { count: 1 }) === 1013, "Eva's Saint 80: 3+ low on MP = Mass Recharge 1428, else Recharge 1013");
check(pick(16, 76, 'emergency') === 1218 && pick(97, 80, 'group') === 1402, 'Bishop 76: dying = Greater Battle Heal 1218; Cardinal: party = Major Group Heal 1402');
check(pick(43, 80, 'recharge') === 1013 && pick(16, 76, 'recharge') === null, 'Recharge only for classes that learn it (Bishop: none)');
// Self Heal = last resort
check(pick(25, 5, 'self', null, { forMe: true }) === 1216, 'Elven Mystic 5 (only Self Heal known): heal myself = Self Heal 1216');
check(pick(25, 5, 'single') === null, '... and Self Heal is never cast on a teammate');
check(pick(25, 10, 'self', null, { forMe: true }) === 1011, 'Elven Mystic 10 (Heal learned): heal myself = Heal 1011, not Self Heal');
{ const K = P.hsKnown(skillsAt(43, 80).map(s => Object.assign(s, { ready: s.id === 1216 })), D);
  check(P.hsPick(K, 'self', P.HS_DEFAULT, { forMe: true }) === null, 'SE 80, every real heal cooling down: still NO Self Heal (waits for a real heal)'); }
{ const K = P.hsKnown([{ id: 1216, level: 1, ready: true }, { id: 1011, level: 18, ready: true, mp: 41 }], D);
  check(P.hsPick(K, 'self', { never: [1011] }, { forMe: true }).id === 1216, 'Heal on the never-list = Self Heal is all that is left: used'); }
check(P.hsPowerAt({ power: [1, 2, 3] }, 102, 3) === 3 && P.hsPowerAt({ power: [1, 2, 3] }, 2) === 2 && P.hsPowerAt({ power: [5] }, 0) === 5, 'power at level: enchanted level 101+ uses the base level');
// recharge targets
const team = [{ name: 'Me', me: true, mp: 5, role: 'healer' }, { name: 'Nuke', mp: 20, role: 'nuker' }, { name: 'Tank', mp: 10, role: 'tank' }, { name: 'Necro', mp: 35, role: 'necromancer' }, { name: 'Dead', mp: 0, role: 'nuker', dead: true }];
{ const r = P.hsRechargeTarget(team, P.HS_DEFAULT);
  check(r && r.t.name === 'Nuke' && r.count === 2, 'Recharge (automatic): casters only, never me, never the dead, lowest MP first (Nuke 20 %, Necro 35 %)', r); }
check(P.hsRechargeTarget(team, { recharge: { on: true, below: 40, who: 'everyone' } }).t.name === 'Tank', 'Recharge "everyone": the tank (10 %) first');
check(P.hsRechargeTarget(team, { recharge: { on: false } }) === null, 'Recharge off: nobody');
check(P.hsRechargeTarget(team, { recharge: { on: true, below: 25, who: 'casters' } }).count === 1, 'Recharge below 25 %: only Nuke');
// schemes
const FILE = { classes: { 43: { single: { below: 80 }, priority: 'tank' } }, chars: { Saint: { single: { skill: 1011 }, recharge: { who: 'everyone' } }, Bad: { single: { below: 500, skill: 'x' } } } };
{ const E = P.hsEffective(FILE, 'Saint', 43);
  check(E.scheme.single.below === 80 && E.scheme.single.skill === 1011 && E.scheme.priority === 'tank' && E.scheme.recharge.who === 'everyone' && E.scheme.emergency.below === 50,
    'scheme: character over class over automatic (class 80 %, own Heal, class tank first, own Recharge everyone, the rest automatic)', E.scheme);
  check(E.src['single.below'] === 'class' && E.src['single.skill'] === 'char' && !E.src['emergency.below'] && E.own && E.classOwn, 'src tells which fields are whose');
  check(JSON.stringify(P.hsEffective(FILE, 'Bad', 0).scheme) === JSON.stringify(P.HS_DEFAULT), 'invalid values in the file are dropped (automatic)');
  check(JSON.stringify(P.hsEffective({}, 'X', 43).scheme) === JSON.stringify(P.HS_DEFAULT) && JSON.stringify(P.hsEffective(null, 'X', 43).scheme) === JSON.stringify(P.HS_DEFAULT), 'no file / broken file: automatic'); }
{ const sc = P.hsEffective(FILE, 'Saint', 43).scheme, K = known(43, 80);
  check(P.hsPick(K, 'single', sc).id === 1011 && P.hsPick(K, 'single', sc).why === 'your choice', 'a picked skill is used (Saint: Heal 1011 for normal heals)');
  const K2 = K.map(k => Object.assign({}, k, { ready: k.id !== 1011 }));
  const p2 = P.hsPick(K2, 'single', sc); check(p2.id === 1217 && /cooling down/.test(p2.why), 'picked skill cooling down: the automatic one this time (Greater Heal), the reason says so', p2);
  check(P.hsPick(K, 'emergency', { never: [1015] }).id === 1217, 'never-list: Battle Heal never used — dying = Greater Heal');
  check(P.hsPick(K, 'single', { single: { skill: 1216 } }).id === 1217, 'Self Heal picked for teammates is impossible (it only heals the caster): automatic instead');
  check(P.hsPick(K, 'self', { self: { skill: 1216 } }, { forMe: true }).id === 1216, '... but the player MAY pick Self Heal for "heal myself"'); }
{ const L = [{ name: 'A', hp: 40, role: 'nuker' }, { name: 'T', hp: 70, role: 'tank' }, { name: 'H', hp: 60, role: 'bishop' }];
  check(P.hsOrder(L, 'auto').map(x => x.name).join() === 'A,H,T', 'who first, automatic: lowest HP');
  check(P.hsOrder(L, 'tank', { tank: 'T' })[0].name === 'T', 'who first, tank first');
  check(P.hsOrder(L, 'healers')[0].name === 'H', 'who first, healers first'); }
check(P.hsPotionBelow(P.HS_DEFAULT, false) === 70 && P.hsPotionBelow({ potion: { below: 30 } }, false) === 30 && P.hsPotionBelow({ potion: { below: 30 } }, true) === 90, 'mana potion: automatic 70 %, the player\'s %, raids always 90 % (raid rule)');
{ const v = P.hsValidate({ single: { below: 150 }, group: { count: 1 }, recharge: { who: 'x' }, priority: 'me', potion: { below: 'a' } });
  check(v.errors.length === 5, 'validation: 5 plain-language errors', v.errors);
  const w = P.hsValidate({ emergency: { below: 95 }, single: { below: 80 } });
  check(!w.errors.length && w.warnings.length === 1, 'validation: dying above normal = a warning, not an error', w);
  check(P.hsValidate({ never: [1216], self: { skill: 1216 } }).errors.length === 1, 'validation: Self Heal both picked and never-listed = error');
  check(JSON.stringify(P.hsClean({ single: { skill: 'auto' }, junk: 1 })) === '{"single":{"skill":"auto"}}', 'clean keeps only known fields'); }

// ---- 3) host ------------------------------------------------------------------------------------------------------------------
function harness(code, opt) {
  const clock = { t: 1e6 }, sent = [], intervals = [], files = {};
  const sk = {}; (opt.skills || []).forEach(s => { sk[s.id] = { Id: s.id, Name: D.skills[s.id] ? D.skills[s.id].name : 'skill ' + s.id, Level: s.level, BaseLevel: s.level, MP: 30, IsReady: s.ready !== false, HitTime: 1000 }; });
  const SkillsList = { GetItemByID: (id) => sk[id] || null, get Count() { return Object.keys(sk).length; }, forEach: (f) => Object.values(sk).forEach(f) };
  const Me = Object.assign({ Name: 'Saint', objId: 1, ClassId: 43, HpPercent: 100, MpPercent: 100, MP: 3000, X: 0, Y: 0, IsDead: false }, opt.me || {});
  const party = (opt.party || []).map((m, i) => Object.assign({ objId: 100 + i, HP: 1000, MaxHP: 1000, HpPercent: 100, MpPercent: 100, X: 50, Y: 50, IsDead: false }, m));
  const livePos = {}; party.forEach(m => { livePos[m.Name] = { role: m.role || '', mp: m.MpPercent, at: clock.t }; });
  const auto = [{ Skill: { Id: 1216, Name: 'Self Heal' }, IsEnabled: true }, { Skill: { Id: 1217, Name: 'Greater Heal' }, IsEnabled: true }];
  const AutoSkillsList = { get Count() { return auto.length; } }; auto.forEach((a, i) => { AutoSkillsList[i] = a; });
  if (opt.file) { files['X\\Scripts\\data\\heal_schemes.json'] = JSON.stringify(opt.file); }
  files['X\\Scripts\\data\\heal_skills.json'] = JSON.stringify(D);
  const env = {
    state: Object.assign({ role: 'healer' }, opt.state || {}), CONFIG: { healer: { roles: ['bishop', 'shilliensaint', 'healer'], classIds: [15, 16, 97, 42, 43, 112, 29, 30, 105, 25] }, roster: {}, leader: 'Tank' },
    ROLE_RE: { noMelee: /doomcryer|^buffer$|^summoner$/ }, Options: { FollowAtk: false, AutoSkillsList }, IsCharacterReady: () => true, stopCombatG: () => { }, IsInCombat: false,
    SkillsList, Me, hostSnap: { party: () => party, buffs: () => [] }, PartyList: { forEach: (f) => party.forEach(f) }, num: (v) => Number(v) || 0, now: () => clock.t,
    sleep: () => Promise.resolve(), inRaid: () => false, inst: { on: false }, raidCtl: {}, isLeader: () => false, livePos, teamOf: () => 'A', itemCount: () => opt.potions || 0,
    UseItem: (id) => sent.push(['item', id]), note: () => { }, App: { on() { }, emit() { } },
    Send: { Action: (id) => sent.push(['target', id]), RequestMagicSkillUse: (id) => sent.push(['cast', id]) }, SWARM_ROOT: 'X',
    File: { ReadAllText: (f) => { if (files[f] === undefined) throw new Error('no file'); return files[f]; } }, fileStamp: (f) => (files[f] !== undefined ? 'st' + files[f].length : ''),
    rkKindOfClass: (t, id) => ([15, 16, 97, 42, 43, 112, 29, 30, 105].includes(id) ? 'healer' : 'nuker'), classTree: () => null, rkBuffAb: () => ({ ab: '' }), BuffsList: { forEach() { } },
    DLV: { on: false }, CharList: { forEach() { } }, appendShared: () => { }, lastSysMsg: null, rkPetToHeal: () => null, Target: null, mobById: () => null,
    skillPlan: { key: '', attacks: [], selfBuffs: [], toggles: [], lock: null },   // the support-heal gate (CASTPRIO) reads the caster's plan; a healer has no magic attacks
    logError: (w, e) => { console.error('  host error', w, e); }, setInterval: (f) => { intervals.push(f); return 0; },
    hiveHealsOn: () => opt.heals !== false, hiveSkillsOn: () => true };   // HIVESW-2026-10-15: Hive heals (the default; opt.heals false = the player's profile heals)
  const names = Object.keys(env);
  const exportsList = opt.old ? 'healTick, castOnMate' : 'healTick, castOnMate, hsReport, HSH';
  const fn = new Function(...names, code + `\nreturn { ${exportsList}, setHealer: (v) => { healerMode = v; }, getHealer: () => healerMode };`);
  const H = fn(...names.map(k => env[k]));
  return Object.assign(H, { sent, intervals, Me, party, clock, auto, env });
}
const HOST = blk(src, '// HEALSCHEME-PURE-BEGIN', '// AUTO-SKILLS  —');
const lvl80 = (cls) => skillsAt(cls, 80);
const casts = (h) => h.sent.filter(x => x[0] === 'cast').map(x => x[1]);
const flush = () => new Promise(r => setTimeout(r, 0));
(async () => {
  // 3a) the healer brain: Recharge to a caster (the D16 bug: never cast)
  { const h = harness(HOST, { skills: lvl80(43), party: [{ Name: 'Nuke', role: 'nuker', MpPercent: 10 }, { Name: 'Tank', role: 'tank' }] });
    h.setHealer(true); await h.healTick();
    check(casts(h).join() === '1013' && h.sent.some(x => x[0] === 'target' && x[1] === 100), 'SE 80 healer, everyone full HP, the nuker at 10 % MP: Recharge 1013 on the nuker', h.sent); }
  { const h = harness(HOST, { skills: lvl80(30), party: [{ Name: 'Nuke', role: 'nuker', MpPercent: 10 }] });
    h.env.Me.ClassId = 30; h.setHealer(true); await h.healTick();
    check(casts(h).join() === '1013', 'Elven Elder 80 healer: Recharge 1013 on the nuker at 10 % MP', h.sent); }
  { const h = harness(HOST, { skills: lvl80(112), party: [{ Name: 'N1', role: 'nuker', MpPercent: 10 }, { Name: 'N2', role: 'mage', MpPercent: 20 }, { Name: 'N3', role: 'summoner', MpPercent: 30 }] });
    h.env.Me.ClassId = 112; h.setHealer(true); await h.healTick();
    check(casts(h).join() === '1428', 'Shillien Saint 80: three casters low on MP = Mass Recharge 1428', h.sent); }
  { const h = harness(HOST, { skills: lvl80(43), party: [{ Name: 'Melee', role: 'melee', MpPercent: 5 }] });
    h.setHealer(true); await h.healTick();
    check(casts(h).length === 0, 'automatic: a melee at 5 % MP gets no Recharge (casters only)', h.sent);
    const h2 = harness(HOST, { skills: lvl80(43), party: [{ Name: 'Melee', role: 'melee', MpPercent: 5 }], file: { chars: { Saint: { recharge: { who: 'everyone' } } } } });
    h2.setHealer(true); await h2.healTick();
    check(casts(h2).join() === '1013', 'scheme "MP for everyone": the melee gets Recharge', h2.sent);
    const h3 = harness(HOST, { skills: lvl80(43), party: [{ Name: 'Nuke', role: 'nuker', MpPercent: 5 }], file: { classes: { 43: { recharge: { on: false } } } } });
    h3.setHealer(true); await h3.healTick();
    check(casts(h3).length === 0, 'class scheme "MP off": no Recharge', h3.sent); }
  // 3b) heals: the strongest / fastest real heal, never Self Heal
  { const h = harness(HOST, { skills: lvl80(43), party: [{ Name: 'Nuke', role: 'nuker', HpPercent: 80 }] });
    h.setHealer(true); await h.healTick();
    check(casts(h).join() === '1217', 'SE 80: teammate at 80 % = Greater Heal 1217', h.sent); }
  { const h = harness(HOST, { skills: lvl80(43), party: [{ Name: 'Nuke', role: 'nuker', HpPercent: 30 }] });
    h.setHealer(true); await h.healTick();
    check(casts(h).join() === '1015', 'SE 80: teammate dying (30 %) = Battle Heal 1015 (the fast one)', h.sent); }
  { const h = harness(HOST, { skills: lvl80(43), me: { HpPercent: 40 }, party: [{ Name: 'Nuke', role: 'nuker' }] });
    h.setHealer(true); await h.healTick();
    check(casts(h).join() === '1015' && !casts(h).includes(1216), 'SE 80 healing ITSELF at 40 %: Battle Heal, not Self Heal', h.sent); }
  { const h = harness(HOST, { skills: lvl80(30), party: [{ Name: 'Nuke', role: 'nuker', HpPercent: 75 }] });
    h.env.Me.ClassId = 30; h.setHealer(true); await h.healTick();
    check(casts(h).join() === '1401', 'Elven Elder 80: teammate at 75 % = Major Heal 1401 (was never used before)', h.sent); }
  { const h = harness(HOST, { skills: lvl80(43), party: [{ Name: 'A', role: 'nuker', HpPercent: 60 }, { Name: 'B', role: 'melee', HpPercent: 70 }, { Name: 'C', role: 'tank', HpPercent: 75 }] });
    h.setHealer(true); await h.healTick();
    check(casts(h).join() === '1219', 'SE 80: 3 below 80 % = Greater Group Heal 1219', h.sent); }
  { const h = harness(HOST, { skills: lvl80(43), party: [{ Name: 'Nuke', role: 'nuker', HpPercent: 65 }, { Name: 'Tank', role: 'tank', HpPercent: 68 }], file: { chars: { Saint: { priority: 'tank', single: { skill: 1011 } } } } });
    h.setHealer(true); await h.healTick();
    check(casts(h).join() === '1011' && h.sent.find(x => x[0] === 'target')[1] === 101, 'scheme: tank first + Heal 1011 picked: the tank (68 %) gets Heal before the nuker (65 %)', h.sent); }
  { const h = harness(HOST, { skills: lvl80(43), party: [{ Name: 'Nuke', role: 'nuker', HpPercent: 85 }], file: { chars: { Saint: { single: { below: 80 } } } } });
    h.setHealer(true); await h.healTick();
    check(casts(h).length === 0, 'scheme "heal a teammate below 80 %": a teammate at 85 % is left alone', h.sent); }
  { const h = harness(HOST, { skills: lvl80(43), me: { MpPercent: 50 }, potions: 5, party: [] });
    h.setHealer(true); await h.healTick();
    const h2 = harness(HOST, { skills: lvl80(43), me: { MpPercent: 50 }, potions: 5, party: [], file: { chars: { Saint: { potion: { below: 30 } } } } });
    h2.setHealer(true); await h2.healTick();
    check(h.sent.some(x => x[0] === 'item' && x[1] === 728) && !h2.sent.some(x => x[0] === 'item'), 'mana potion: automatic drinks at 50 % MP (line 70 %), the scheme\'s 30 % does not', [h.sent, h2.sent]); }
  // 3c) the support heal: a healer CLASS in a non-healer role (the tester's SE as "buffer") — before: Self Heal first
  { const h = harness(HOST, { skills: lvl80(43), state: { role: 'buffer' }, me: { HpPercent: 30 }, party: [{ Name: 'Nuke', role: 'nuker' }] });
    h.intervals.forEach(f => { try { f(); } catch (e) { } }); await flush(); await flush();
    check(casts(h).length && !casts(h).includes(1216) && casts(h)[0] === 1217, 'support heal (SE 80 as "buffer", own HP 30 %): Greater Heal on itself, NOT Self Heal', h.sent); }
  { const h = harness(HOST, { skills: lvl80(43), state: { role: 'buffer' }, party: [{ Name: 'Nuke', role: 'nuker', MpPercent: 10 }] });
    h.intervals.forEach(f => { try { f(); } catch (e) { } }); await flush(); await flush();
    check(casts(h).join() === '1013', 'support (SE as "buffer"), nobody hurt, the nuker at 10 % MP: Recharge', h.sent); }
  { const h = harness(HOST, { skills: skillsAt(11, 40), state: { role: 'nuker' }, party: [{ Name: 'Nuke', role: 'nuker', MpPercent: 10 }] });
    h.env.Me.ClassId = 11; h.intervals.forEach(f => { try { f(); } catch (e) { } }); await flush(); await flush();
    check(!casts(h).includes(1013), 'a Human Wizard never recharges (no Recharge, not a healer class)', h.sent); }
  // 3d) L2Swarm's own XML Self Heal auto-skill
  { const h = harness(HOST, { skills: lvl80(43), party: [] });
    h.intervals.forEach(f => { try { f(); } catch (e) { } });
    check(h.auto[0].IsEnabled === false && h.auto[1].IsEnabled === true, 'XML auto-skill Self Heal switched off for a SE that knows real heals (Greater Heal left alone)', h.auto);
    const h2 = harness(HOST, { skills: lvl80(43), party: [], file: { chars: { Saint: { xmlSelfHeal: 'keep' } } } });
    h2.intervals.forEach(f => { try { f(); } catch (e) { } });
    check(h2.auto[0].IsEnabled === true, '... unless the scheme says "keep it"'); }
  { const h = harness(HOST, { skills: lvl80(43), party: [{ Name: 'Nuke', role: 'nuker', MpPercent: 10 }] });
    h.setHealer(true); await h.healTick(); const r = h.hsReport();
    check(r && r.mode === 'healer' && r.auto.single.id === 1217 && r.known.length >= 6 && r.lastRc && r.lastRc.target === 'Nuke', 'bot report (swarm_state healPlan): mode, known skills, automatic choices, the last MP gift', r); }
  // 3e) informational: the same situations on the pre-fix copy
  { const OLDF = path.join(ROOT, 'Settings', 'backup', 'healschemes_2026-10-13', 'swarm.js.before');
    if (fs.existsSync(OLDF)) {
      const old = fs.readFileSync(OLDF, 'utf8'), OH = blk(old, '// HEALER-ROLLE', '// AUTO-SKILLS  —');
      try {
        const h = harness(OH, { old: true, skills: lvl80(43), party: [{ Name: 'Nuke', role: 'nuker', MpPercent: 10 }] }); h.setHealer(true); await h.healTick();
        console.log(`info pre-fix code, SE 80 healer + nuker at 10 % MP: casts [${casts(h).join(',') || 'nothing'}] (the D16 array bug: Recharge never cast)`);
        const h2 = harness(OH, { old: true, skills: lvl80(43), state: { role: 'buffer' }, me: { HpPercent: 30 }, party: [] }); h2.intervals.forEach(f => { try { f(); } catch (e) { } }); await flush(); await flush();
        console.log(`info pre-fix code, SE 80 as "buffer" at 30 % HP: casts [${casts(h2).join(',') || 'nothing'}] (Self Heal 1216 first in the support list)`);
      } catch (e) { console.log('info pre-fix harness: ' + e.message); }
    }
  }

  // ---- 4) the dashboard API on a scratch file ---------------------------------------------------------------------------------
  { const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'healschemes-'));
    const F = path.join(TMP, 'heal_schemes.json'); process.env.SWARM_HEALSCHEMES_FILE = F;
    const API = require(path.join(ROOT, 'Dashboard', 'healschemes_api.js'));
    const ctx = { DATA: path.join(ROOT, 'Scripts', 'data'), LOGS: TMP, ROOT, readStates: () => [
      { name: 'Saint', classId: 112, cls: 'Shillien Saint', level: 80, role: 'healer', ageSec: 5, party: 'Tank', healPlan: { v: 1, mode: 'healer', classId: 112, known: [{ id: 1217, lvl: 33 }, { id: 1015, lvl: 15 }, { id: 1216, lvl: 1 }, { id: 1013, lvl: 32 }] } },
      { name: 'Eve', classId: 105, cls: "Eva's Saint", level: 80, role: 'buffer', ageSec: 999, party: 'Tank' },
      { name: 'Tank', classId: 6, cls: 'Shillien Knight', level: 80, role: 'tank', ageSec: 5, party: 'Tank' }] };
    const G0 = API.summary(ctx);
    const rS = G0.chars.find(c => c.name === 'Saint'), rE = G0.chars.find(c => c.name === 'Eve'), rT = G0.chars.find(c => c.name === 'Tank');
    check(!G0.exists && rS.live && rS.canHeal && rS.auto.single.id === 1217 && rS.auto.recharge.id === 1013, 'API GET, no file: the live report decides (Saint: Greater Heal, Recharge)', rS);
    check(rE && !rE.live && rE.canHeal && rE.auto.single.id === 1401 && rE.healerClass && !rE.healerRole, "API GET: an offline Eva's Saint (no report) — estimated from its class at 80: Major Heal", rE);
    check(rT && !rT.canHeal, 'API GET: a Shillien Knight cannot heal');
    let r = API.post(ctx, { action: 'set', scope: 'char', name: 'Saint', scheme: { single: { below: 85, skill: 1015 }, recharge: { who: 'everyone' } }, rev: G0.rev });
    const f1 = JSON.parse(fs.readFileSync(F, 'utf8'));
    check(r.code === 200 && f1.chars.Saint.single.below === 85 && f1.chars.Saint.recharge.who === 'everyone' && !f1.classes['112'], 'API set (char): exactly the changed fields are written', f1);
    check(r.state.chars.find(c => c.name === 'Saint').scheme.single.skill === 1015, 'API set: the answer carries the new state');
    const rev1 = r.rev;
    r = API.post(ctx, { action: 'set', scope: 'char', name: 'Saint', scheme: { single: { below: 999 } }, rev: rev1 });
    check(r.code === 400 && /5 to 99/.test(r.error), 'API: invalid % rejected with a plain sentence', r);
    r = API.post(ctx, { action: 'set', scope: 'class', classId: 105, scheme: { priority: 'healers' }, rev: 'stale' });
    check(r.code === 409 && r.rev === rev1, 'API: changed meanwhile (stale rev) = 409 + the current rev', r);
    r = API.post(ctx, { action: 'set', scope: 'class', classId: 105, scheme: { priority: 'healers' }, rev: rev1 });
    const hist = fs.existsSync(path.join(TMP, 'history')) ? fs.readdirSync(path.join(TMP, 'history')).filter(x => /^heal_schemes_/.test(x)) : [];
    check(r.code === 200 && hist.length >= 1, 'API set (class): written, the previous file copied to history/', hist);
    const G1 = API.summary(ctx), e1 = G1.chars.find(c => c.name === 'Eve');
    check(e1.scheme.priority === 'healers' && e1.src.priority === 'class' && e1.classScheme && !e1.own, 'API: the class scheme applies to every Eva\'s Saint');
    // the page's rules = the bots' rules
    const HLm = require(path.join(ROOT, 'Dashboard', 'heallogic.js'));
    const J = JSON.parse(fs.readFileSync(F, 'utf8'));
    check(JSON.stringify(HLm.hsEffective(J, 'Saint', 112)) === JSON.stringify(P.hsEffective(J, 'Saint', 112)), 'heallogic.js and swarm.js give the same effective scheme');
    r = API.post(ctx, { action: 'clear', scope: 'char', name: 'Saint', rev: G1.rev });
    check(r.code === 200 && !JSON.parse(fs.readFileSync(F, 'utf8')).chars.Saint, 'API clear: back to automatic');
    r = API.post(ctx, { action: 'set', scope: 'char', name: '../x', scheme: {} });
    check(r.code === 400, 'API: a bad character name is refused');
    r = API.post(ctx, { action: 'set', scope: 'char', name: 'Eve', scheme: {}, rev: API.summary(ctx).rev });
    check(r.code === 200 && !JSON.parse(fs.readFileSync(F, 'utf8')).chars.Eve, 'API: an empty scheme = no entry (automatic)');
    check((fs.existsSync(LIVEF) ? fs.readFileSync(LIVEF, 'utf8') : null) === LIVE0, 'the live Scripts/data/heal_schemes.json was not touched');
    // the server hook + the page files
    const srv = fs.readFileSync(path.join(ROOT, 'Dashboard', 'server.js'), 'utf8'), idx = fs.readFileSync(path.join(ROOT, 'Dashboard', 'index.html'), 'utf8');
    check(/require\('\.\/healschemes_api'\)\.handle/.test(srv), 'server.js hooks /api/healschemes');
    check(/\/heallogic\.js/.test(idx) && /\/healschemes\.js/.test(idx) && /\/healschemes\.css/.test(idx), 'index.html loads heallogic.js + healschemes.js/.css');
    check(/HealSchemes\.button\(CP\.name/.test(fs.readFileSync(path.join(ROOT, 'Dashboard', 'charpage.js'), 'utf8')) && /function secHeal\(\)/.test(fs.readFileSync(path.join(ROOT, 'Dashboard', 'partysettings.js'), 'utf8')), 'character page button + party settings "Healing" section');
    const hsjs = fs.readFileSync(path.join(ROOT, 'Dashboard', 'healschemes.js'), 'utf8');
    check(!/\b(alert|confirm|prompt)\s*\(/.test(hsjs.replace(/ui(Alert|Confirm|Prompt|Choice)\s*\(/g, '')), 'healschemes.js uses no browser alert / confirm / prompt (uidialog only)');
  }
  // the raid rules are still in healTick
  { const T = blk(src, 'async function healTick()', '\nsetInterval(');
    check(/tank\.hp < 60/.test(T) && /rhTankFirst/.test(T) &&/HEAL\.spamBelow/.test(T) && /drainEmergencyBelow/.test(T) && /drainHold/.test(T), 'raid rules still in healTick: tank first < 60 %, spam < 80 %, no heals / group heals over a draining Destroyer'); }
  console.log(`\n${n - fails}/${n} checks passed`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
