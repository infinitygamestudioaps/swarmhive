// OFFLINE TEST of the HIVE SWITCHES (HIVESW-2026-10-15, owner-approved request of player Vykaax: "load my parties into Hive for the dashboard,
// pathing and resupply, but let my own L2Swarm profile pick skills and heals") + the fight-toggle whitelist fix.
// Never touches the game, MCP or the live data (scratch files in os.tmpdir()).
//   node docs/plan/tools/test_hive_switches.js        (exit code 1 when a check fails; SWARM_JS=<file> tests another copy of swarm.js)
// 1) PARTYAUTO-PURE: skills / heals / potions DEFAULT ON (missing file / key), character > party > default, a literal false in default wins,
//    the old switches stay OFF by default; chars.<Name>.toggles; swarm.js = Dashboard/partyauto_api.js (matrix).
// 2) host part: hiveSw / hiveSkillsOn / hiveHealsOn / hivePotionsOn read party_auto.json live (2 s cache), a broken file keeps the last good
//    state, a switch to OFF is said once.
// 3) TOGGLE-PURE toggleWanted: the fight whitelist (no more Strike Back / True Berserker / Arcane Power), tank stances for a tank only, the
//    player's ticks (also a hide toggle), case-insensitive; with toggleDecide a running unwanted toggle still goes OFF after the fight.
// 4) source checks: EVERY Send.RequestMagicSkillUse in swarm.js sits behind a gate (hiveSkillsOn / hiveHealsOn / tankReady) or in the
//    documented exception list; named gates per cast path; potions gated; restore paths (l2sSkillGuard via casterOwnsAttacks, HSH AutoSkills
//    restore, caster-leader safeguard, healers-never-attack only while Hive owns the skills); member fights use L2Swarm combat when skills are OFF.
// 5) l2sGuardPlan with own = false restores exactly what the script switched off (never a skill the user disabled), castOwnDecide is false
//    when the switch is OFF.
// 6) the dashboard: the API accepts / validates / removes toggles, GET sends fightToggles = swarm.js FIGHT_TOGGLES, partysettings.js has a
//    Combat section (its own kinds, not in Supplies), hiveswitch.js exists and is served, charpage.js mounts it.
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const ROOT = path.join(__dirname, '..', '..', '..');
const SRCF = process.env.SWARM_JS || path.join(ROOT, 'Scripts_dev', 'swarm.js');
const src = fs.readFileSync(SRCF, 'utf8');
let fails = 0, n = 0;
const check = (ok, what, info) => { n++; console.log((ok ? 'ok   ' : 'FAIL ') + what + (!ok && info ? ' — ' + info : '')); if (!ok) fails++; };
const blk = (b, e) => { const i = src.indexOf(b), j = src.indexOf(e, i + 1); if (i < 0 || j < i) { console.error(b + ' block not found'); process.exit(1); } return src.slice(i, j); };
const fnBody = (head) => { const i = src.indexOf(head); if (i < 0) return ''; const j = src.indexOf('\n}\n', i); return src.slice(i, j + 3); };

// ---- 1) pure ---------------------------------------------------------------------------------------------------------------------
const PURE = blk('// PARTYAUTO-PURE-BEGIN', '// PARTYAUTO-PURE-END');
const P = new Function(PURE + '\nreturn { PAUTO_KINDS, pautoNorm, pautoEffective, pautoToggles };')();
const API = require(path.join(ROOT, 'Dashboard', 'partyauto_api.js'));
const E = P.pautoEffective, C3 = ['skills', 'heals', 'potions'];
C3.forEach(k => check(E({}, k, 'Bishop1', 'Tank1').on === true && E(null, k, 'X', 'X').on === true && E({ parties: [] }, k, 'X', 'X').on === true, `${k}: no file / empty / broken = ON (the autopilot as before)`));
['supplyWatch', 'sell', 'dyes'].forEach(k => check(E({}, k, 'Bishop1', 'Tank1').on === false, `${k}: still OFF by default`));
check(E({ default: { skills: false } }, 'skills', 'A', 'A').on === false && E({ default: { skills: 'no' } }, 'skills', 'A', 'A').on === true, 'a literal false in "default" switches it off for all parties (a non-boolean is ignored)');
const J1 = { parties: { Tank1: { skills: false, heals: false } }, chars: { Bishop1: { heals: true }, Destroyer1: { skills: true, potions: false } } };
check(E(J1, 'skills', 'Necro1', 'Tank1').on === false && E(J1, 'skills', 'Necro1', 'Tank1').src === 'party', 'party OFF: a member without its own = OFF');
check(E(J1, 'heals', 'Bishop1', 'Tank1').on === true && E(J1, 'heals', 'Bishop1', 'Tank1').src === 'char', 'a character ON wins over the party OFF');
check(E(J1, 'skills', 'Destroyer1', 'Tank1').on === true && E(J1, 'potions', 'Destroyer1', 'Tank1').on === false, 'per character: skills ON in a skills-OFF party, potions OFF in a potions-ON party');
check(E(J1, 'skills', 'Destroyer3', 'Destroyer3').on === true, 'another party is not touched');
check(P.PAUTO_KINDS.skills.char && P.PAUTO_KINDS.heals.char && P.PAUTO_KINDS.potions.char, 'all three have a per-character override');
check(JSON.stringify(P.pautoToggles({ chars: { Doombringer1: { toggles: [' War Frenzy ', '', 5, 'Arcane Power'] } } }, 'Doombringer1')) === '["War Frenzy","Arcane Power"]' && P.pautoToggles({}, 'Doombringer1').length === 0 && P.pautoToggles({ chars: { D: { toggles: 'x' } } }, 'D').length === 0, 'pautoToggles: trimmed names, junk dropped, missing = none');
check(Object.keys(P.PAUTO_KINDS).join() === API.KEYS.join() && Object.keys(P.PAUTO_KINDS).filter(k => P.PAUTO_KINDS[k].char).join() === API.CHAR_KEYS.join(), 'swarm.js and the API know the same switches');
check(C3.every(k => { const K = API.KINDS.find(x => x.key === k); return K && K.group === 'combat' && K.def === true; }), 'API: the three are group "combat" with def true');
check(API.KINDS.filter(k => k.group === 'combat').map(k => k.key).filter(k => k !== 'recommend').join() === C3.concat(['swarmFight', 'spotLevelCheck']).join() && !(API.KINDS.find(k => k.key === 'swarmFight') || {}).def, 'API: + SWARMFIGHT (group combat, default OFF) + SPOTLVL-2026-10-23 spotLevelCheck');
{ const files = [{}, J1, { default: { skills: false, heals: true, potions: false, sell: true }, parties: { Tank1: { potions: true } }, chars: { Bishop1: { skills: true } } }, { parties: [], chars: 'x' }, null];
  let same = true; files.forEach(f => ['Tank1', 'Bishop1', 'Destroyer1', 'Destroyer3'].forEach(me => C3.concat(['sell', 'supplyWatch']).forEach(k => { const L = me === 'Destroyer3' ? 'Destroyer3' : 'Tank1'; const a = E(f, k, me, L), b = API.pautoEffective(f, k, me, L); if (a.on !== b.on || a.src !== b.src) same = false; })));
  check(same, 'the bot and the dashboard give the same answer (matrix of files x characters x switches)');
  check(JSON.stringify(API.pautoToggles({ chars: { A: { toggles: ['Accuracy', ' x '] } } }, 'A')) === JSON.stringify(P.pautoToggles({ chars: { A: { toggles: ['Accuracy', ' x '] } } }, 'A')), 'pautoToggles: bot = dashboard'); }

// ---- 2) host part ----------------------------------------------------------------------------------------------------------------
const HOST = blk('// PARTYAUTO-PURE-BEGIN', '// PARTYAUTO-HOST-END');
function world(o) {
  const W = Object.assign({ t: 1760360000000, files: {}, notes: [], me: 'Bishop1', leader: 'Tank1' }, o || {});
  W.File = { Exists: (f) => !!W.files[f], ReadAllText: (f) => { if (!W.files[f]) throw new Error('no file'); return W.files[f].text; } };
  W.put = (o2) => { W.files['C:\\L2\\Scripts\\data\\party_auto.json'] = { text: typeof o2 === 'string' ? o2 : JSON.stringify(o2), stamp: String(++W.t) }; };
  W.env = { File: W.File, __DIR__: 'C:\\L2', now: () => W.t, fileStamp: (f) => (W.files[f] ? W.files[f].stamp : ''), Me: { get Name() { return W.me; } }, CONFIG: { get leader() { return W.leader; } },
    teamOf: (x) => x, note: (m) => W.notes.push(m) };
  return W;
}
const hostFns = (W) => new Function('env', 'with (env) {\n' + HOST + '\nreturn { hiveSw, hiveSkillsOn, hiveHealsOn, hivePotionsOn, hiveToggles, HIVESW }; }')(W.env);
{ const W = world(), H = hostFns(W);
  check(H.hiveSkillsOn() && H.hiveHealsOn() && H.hivePotionsOn() && W.notes.length === 0, 'host: no file = all three ON, nothing said');
  W.put({ parties: { Tank1: { skills: false } }, chars: { Bishop1: { toggles: ['War Frenzy'] } } }); W.t += 1000;
  check(H.hiveSkillsOn() === true, 'host: cached for 2 s');
  W.t += 5000;
  check(H.hiveSkillsOn() === false && H.hiveHealsOn() === true && W.notes.length === 1 && /Hive skills OFF/.test(W.notes[0]), 'host: party skills OFF read live + said once', W.notes.join(' | '));
  check(H.hiveToggles().join() === 'War Frenzy', 'host: my ticked toggles');
  W.t += 6000; H.hiveSkillsOn();
  check(W.notes.length === 1, 'host: not said again while it stays OFF');
  W.put('{"parties": {"Tank1": {'); W.t += 6000;
  check(H.hiveSkillsOn() === false, 'host: a half-written file keeps the last good state');
  W.put({ chars: { Bishop1: { skills: true, potions: false } } }); W.t += 6000;
  check(H.hiveSkillsOn() === true && H.hivePotionsOn() === false && W.notes.some(m => /picks my skills again/.test(m)) && W.notes.some(m => /potions OFF/.test(m)), 'host: back ON is said, potions OFF is said'); }
{ const W = world({ me: 'Necro1' }); W.put({ parties: { Tank1: { heals: false } } }); const H = hostFns(W);
  check(H.hiveHealsOn() === false && W.notes.length === 1 && /Hive heals OFF/.test(W.notes[0]), 'host: an OFF at the first read is said (after a reload the player still sees it)'); }
{ const W = world(); W.env.pautoData = undefined; const H = hostFns(W); W.files = { bad: 1 }; W.File.ReadAllText = () => { throw new Error('io'); };
  check(H.hiveSkillsOn() === true, 'host: an unreadable file = ON (never switches the autopilot off by accident)'); }

// ---- 3) toggles --------------------------------------------------------------------------------------------------------------------
const TOG = blk('// TOGGLE-PURE-BEGIN', '// TOGGLE-PURE-END');
const T = new Function(TOG + '\nreturn { toggleWanted, toggleDecide, FIGHT_TOGGLES, TOGGLE_RULE };')();
const NIF = /^(Relax|Fake Death|Silent Move|Hide|Stealth|Shadow Hide|Parry Stance|Guard Stance|Fortitude|Final Fortress|Ultimate Defense|Ultimate Evasion)$/i;
const TANK = /^(Guard Stance|Fortitude|Final Fortress)$/i;
const TW = (name, role, picked) => T.toggleWanted({ name, role: role || 'destroyer' }, { tankRe: TANK, picked: picked || [], notInFight: NIF });
['Soul Cry', 'Vicious Stance', 'Accuracy', 'Focus Attack', 'Polearm Accuracy', 'Fury Fists'].forEach(t => check(TW(t), `fight whitelist: ${t} ON in fights`));
['Strike Back', 'True Berserker', 'Hard March', 'Arcane Power', 'War Frenzy', 'Riposte Stance', 'Transfer Pain', 'Divine Blade'].forEach(t => check(!TW(t), `not worth its MP: ${t} stays off (Berserker / Destroyer MP drain)`));
check(TW('Guard Stance', 'tank') && TW('Fortitude', 'tank') && !TW('Guard Stance', 'destroyer') && !TW('Fortitude', 'sk'), 'tank stances: only the generic tank (as before)');
check(TW('Arcane Power', 'nuker', ['arcane power']) && TW('Strike Back', 'destroyer', ['Strike Back']), "the player's ticks switch any toggle on (case-insensitive)");
check(TW('Silent Move', 'dagger', ['Silent Move']) && !TW('Silent Move', 'dagger') && !TW('Relax'), 'hide / sit toggles: never by Hive, only when the player ticked them');
check(!T.toggleWanted({ name: '' }, {}), 'no name: no');
{ const c = { now: 100000, fight: false, lastFightAt: 0, town: false, raid: false, dead: false };
  check(T.toggleDecide({ name: 'Strike Back', running: true, wanted: TW('Strike Back'), lastCastAt: 0 }, c) === 'off', 'a running unwanted toggle (switched on by hand) still goes OFF after the fight');
  check(T.toggleDecide({ name: 'Strike Back', running: false, wanted: TW('Strike Back'), lastCastAt: 0 }, Object.assign({}, c, { fight: true })) === '', '... and is never switched ON in a fight');
  check(T.toggleDecide({ name: 'Vicious Stance', running: false, wanted: TW('Vicious Stance'), lastCastAt: 0 }, Object.assign({}, c, { fight: true })) === 'on', 'a whitelisted one is switched ON in a fight'); }
check(JSON.stringify(T.FIGHT_TOGGLES) === JSON.stringify(API.FIGHT_TOGGLES), 'the dashboard shows the same fight whitelist as swarm.js');
{ const kp = src.slice(src.indexOf('function toggleCtx()'), src.indexOf('async function autoSkillTick'));
  check(/: KEEP_TOGGLES\.includes\(name\) \|\| toggleWanted\(\{ name, role: state\.role \|\| '' \}, \{ tankRe: ROLEKIND\.tankStances, picked: picked, notInFight: TOGGLE_NOT_IN_FIGHT \}\)/.test(kp), 'keeper: wanted = KEEP_TOGGLES + toggleWanted (whitelist + tank stances + the player\'s ticks)');
  check(!/!TOGGLE_NOT_IN_FIGHT\.test\(name\) && !\(CONFIG\.autoSkills/.test(kp), 'keeper: the old "ALL toggles" rule is gone');
  check(/const picked = hiveToggles\(\);/.test(kp), 'keeper: reads the ticked toggles of this character');
  check(/if \(!hiveSkillsOn\(\)\) return;\s+\/\/ HIVESW/.test(kp), 'keeper: Hive skills OFF = toggles / cubics / fight buffs never touched');
  check(/function toggleOffOne\(why\) \{\s+try \{\s+if \(!hiveSkillsOn\(\)\) return false;/.test(src), 'toggleOffOne (before sitting): untouched with Hive skills OFF'); }

// ---- 4) source checks --------------------------------------------------------------------------------------------------------------
{ // every cast site: gated or a documented exception
  const L = src.split('\n');
  const EXC = { escEscBuff: 'escape alone: Dash / Sprint before running (survival)', escCastCC: 'escape alone: crowd control on what hits me (survival)', kamaelChangeWeapon: 'gear: Change Weapon',
    scoutSpeedTick: 'your !scout order: run / stealth buffs on the trip', navAtlasDoor: 'route: Unlock on a door (route rules)', 'swarm.navatlas.unlock': 'route: Unlock (route rules)',
    siegeCarry: 'siege order: flag', siegeEngrave: 'siege order: seal', resRun: 'resurrection (own switch)', raidOverride: 'your !ov order (character page "use now")', toggleOffOne: 'gated (OFF only)',
    soReturnSkill: 'party setting "way to town": a return-to-town skill instead of .town (travel, SRVOPT-2026-10-21)' };
  const sites = [], bad = [];
  L.forEach((l, i) => {
    if (!/Send\.RequestMagicSkillUse\(/.test(l) || /^\s*\/\//.test(l)) return;
    let f = '?', at = 0;
    for (let j = i; j >= 0; j--) { const m = L[j].match(/^(?:async\s+)?function\s+(\w+)|^setInterval|^App\.on\('([^']+)'|^\s*(?:async\s+)?function\s+(\w+)/); if (m) { f = m[1] || m[2] || m[3] || 'setInterval'; at = j; break; } }
    const pre = L.slice(at, i + 1).join('\n');
    const gated = /hiveSkillsOn\(\)|hiveHealsOn\(\)|tankReady\(/.test(pre);
    sites.push({ line: i + 1, f, gated, exc: EXC[f] });
    if (!gated && !EXC[f]) bad.push(`${f}@${i + 1}`);
  });
  check(sites.length >= 50 && !bad.length, `every Send.RequestMagicSkillUse (${sites.length}) is gated or a listed exception`, bad.join(', '));
  check(Object.keys(EXC).every(k => sites.some(s => s.f === k)), 'every listed exception still exists (a renamed one would hide a new cast path)', Object.keys(EXC).filter(k => !sites.some(s => s.f === k)).join(', '));
}
const has = (re, what) => check(re.test(src), what);
const gate = (head, re, what) => { const b = fnBody(head); check(!!b && re.test(b.slice(0, 600)), what); };
const S = /if \(!hiveSkillsOn\(\)\)/;
gate('async function castNow(info, opts)', /if \(!hiveSkillsOn\(\)\) return \{ started: false, off: true \};/, 'castNow (CAST LOOP): nothing cast with skills OFF');
gate('async function autoSkillTick()', /if \(!hiveSkillsOn\(\)\) return \{ next: 2000 \};/, 'autoSkillTick: no attacks / self buffs / class party buffs');
gate('async function cast(skillId', S, 'cast() helper (necro / inspector / doombringer raid routines)');
gate('async function castOn(creature', S, 'castOn() helper');
gate('async function teamSurrenderStep(', S, 'team Surrender caster');
gate('async function rkCastBuff(', S, 'buffer rotation / songs / dances');
gate('function tankReady(which)', /if \(!hiveSkillsOn\(\)\) return null;/, 'tankReady: no Aggression / hate aura / Ultimate Defense (aggro spam, raid tank, epic tank, instance tank)');
gate('async function raidDebuffStep(boss)', S, 'raid debuff step');
gate('async function raidDebuffCast(boss, d)', S, 'raid debuff cast');
gate('async function drainAndFrenzy(', S, 'destroyer HP drain + Frenzy');
// SPOIL-2026-10-19: Spoil + Sweeper + the festivals moved into spoilerStep() (cast through castNow, gated too)
gate('async function spoilerStep(', /if \(state\.role !== 'spoiler' \|\| !hiveSkillsOn\(\)\) return null;/, 'spoiler: Spoil / Sweeper / festivals (spoilerStep)');
gate('async function epicCastTick()', /!hiveSkillsOn\(\)/, 'epic phase casts');
gate('async function castOnMate(t, k)', /if \(!hiveHealsOn\(\)\) return false;/, 'castOnMate (every heal on a teammate)');
gate('async function healTick()', /if \(!hiveHealsOn\(\)\) return;/, 'healTick (healer brain)');
has(/if \(state\.role !== 'summoner'[^\n]*\n\s+if \(!hiveSkillsOn\(\)\) return;/, 'summoner: summon / servitor care');
has(/if \(state\.role !== 'crafter'[^\n]*\n\s+if \(!hiveSkillsOn\(\)\) return;/, 'crafter: golem summon');
has(/if \(k && k\.IsReady && hiveSkillsOn\(\)\) Send\.RequestMagicSkillUse\(plan\.lock\.id\); else Send\.Attack/, 'pull cycle: a plain hit instead of the lock skill');
has(/if \(hiveSkillsOn\(\)\) for \(const sk of plan\.attacks\)/, 'instance melee: no skill after the hit');
has(/if \(Me\.HpPercent < 30 && hiveSkillsOn\(\)\) for \(const n of \['Zealot', 'Frenzy'/, 'raid dealer: no Frenzy / Zealot / Rage / Guts');
has(/if \(skillNamed\('Frenzy'\) && hiveSkillsOn\(\)\) \{/, 'raid destroyer: no drain before the pull (ready at once)');
has(/const da = hiveSkillsOn\(\) \? readySkill\(\['Deflect Arrow'\]\) : null;/, 'raid tank: no Deflect Arrow');
has(/if \(st && due && hiveSkillsOn\(\) && st\.IsReady/, 'raid saint: no Stigma');
has(/if \(k && hiveSkillsOn\(\) && k\.IsReady && Me\.MP >= num\(k\.MP\) && !Me\.IsCasting && now\(\) - \(chantAt\[id\]/, 'raid doomcryer: no chants');
if (/a\.use\.skill/.test(src)) has(/else if \(num\(a\.use\.skill\) && hiveSkillsOn\(\)\) Send\.RequestMagicSkillUse/, 'epic counters: items yes, skills only with Hive skills');
else console.log('skip epic counters: owner-only epic code is not in this install (public package)');
has(/const mode = BUFFUP\.mode = \(state\.role && state\.running && IsCharacterReady\(\) && hiveSkillsOn\(\)\) \? rkUpkeepMode\(\) : '';/, 'buffer upkeep (songs / dances / party buffs) off');
has(/enabled: !!\(CONFIG\.autoSkills\.enabled && state\.running && hiveSkillsOn\(\)\) \}\);/, 'casterOwnsAttacks false with skills OFF -> l2sSkillGuard restores the Combat Skills it switched off and never disables again');
has(/state\.role !== 'doomcryer'[^\n]*\n\s+if \(!hiveHealsOn\(\)\) return;/, 'Chant of Life = a heal (heals switch)');
has(/if \(!state\.role \|\| healerMode \|\| supportHealing[^\n]*\n\s+if \(!hiveHealsOn\(\)\) return;/, 'support heals / Recharge');
has(/resAfterHold\(\)\) return;[^\n]*\n\s+if \(!hiveHealsOn\(\)\) return;/, 'healer brain interval');
has(/now\(\) - survive\.heal > 2500 && !healerMode && hiveHealsOn\(\)\)/, 'survival self heal (heals switch)');
has(/const k = !hiveHealsOn\(\) \? null : hsKnownNow\(\)\.length/, 'escape self heal (heals switch)');
has(/itemCount\(728\) > 0 && hivePotionsOn\(\)\) \{ survive\.mp = now\(\); UseItem\(728\);/, 'survival Mana Potion (potions switch)');
has(/if \(!hivePotionsOn\(\)\) return;\s+\/\/ HIVESW-2026-10-15: no Healing Potions by the script\n\s+if \(soloChar\(\)/, 'survival Healing Potions (potions switch)');
has(/ESC\.mpAt > 3000 && itemCount\(728\) > 0 && hivePotionsOn\(\)\)/, 'escape Mana Potion (potions switch)');
has(/ESC\.potAt > 10000 && hivePotionsOn\(\)\)/, 'escape Healing Potion (potions switch)');
gate('function castMpPotion(reserve)', /if \(!hivePotionsOn\(\)\) return false;/, 'cast-loop Mana Potion (potions switch)');
// restore paths
has(/if \(!hiveHealsOn\(\)\) \{ HSH\.xml = 'player'; hshXmlRestore\('Hive heals is OFF — your profile heals'\); return; \}/, "HSH: heals OFF gives L2Swarm's Auto Skills (Self Heal) back and stops touching the list");
{ // HSH on stubs: Hive heals ON switches Self Heal off (recorded), OFF gives it back, a player-disabled entry stays off
  const i = src.indexOf('const hshXmlOff = { ids: null };'), j = src.indexOf('}, 15000);', i);
  const code = src.slice(i, j + 10);
  const mk = (heals, files) => {
    const auto = [{ Skill: { Id: 1216, Name: 'Self Heal' }, IsEnabled: true }, { Skill: { Id: 1011, Name: 'Heal' }, IsEnabled: false }];
    const AL = { get Count() { return auto.length; } }; auto.forEach((a, k) => { AL[k] = a; });
    const notes = [], iv = []; let t = 1e9;
    const env = { state: { role: 'healer' }, IsCharacterReady: () => true, now: () => (t += 70000), HSH: { xmlAt: 0, xml: '' }, hsMine: () => ({ xmlSelfHeal: 'auto', never: [] }), hsIsHealerClass: () => true,
      hsKnownNow: () => [{ kind: 'single' }], Options: { AutoSkillsList: AL }, num: Number, note: (m) => notes.push(m), SWARM_ROOT: 'X', Me: { Name: 'Saint' },
      File: { Exists: (f) => files[f] !== undefined, ReadAllText: (f) => files[f], WriteAllText: (f, x) => { files[f] = x; } }, hiveHealsOn: () => heals.v,
      hsEach: (coll, fn) => { for (let k = 0; k < coll.Count; k++) fn(coll[k]); }, setInterval: (f) => iv.push(f) };
    const names = Object.keys(env);
    new Function(...names, code)(...names.map(k => env[k]));
    return { auto, notes, tick: () => iv[0](), env };
  };
  const files = {}, heals = { v: true }, W = mk(heals, files);
  W.tick();
  check(W.auto[0].IsEnabled === false && /"1216":true/.test(files['X\\Logs\\hsh_xml_off_Saint.json'] || ''), 'HSH stubs: Hive heals ON -> Self Heal switched off + recorded in Logs/hsh_xml_off_<name>.json');
  const W2 = mk(heals, files); W2.auto[0].IsEnabled = false; heals.v = false; W2.tick();   // a reload: memory empty, the file remembers
  check(W2.auto[0].IsEnabled === true && W2.auto[1].IsEnabled === false && W2.env.HSH.xml === 'player' && W2.notes.some(m => /switched back ON/.test(m)), 'HSH stubs: Hive heals OFF (after a reload) -> Self Heal back ON, the player-disabled Heal stays off');
  W2.auto[0].IsEnabled = false; W2.tick();
  check(W2.auto[0].IsEnabled === false, 'HSH stubs: ... and then never touched again (the player may switch it off himself)'); }
has(/a\.IsEnabled = false; rec\[id\] = true;/, 'HSH: what it switches off is recorded (Logs/hsh_xml_off_<name>.json) so a reload can still give it back');
gate('function hshXmlRestore(why)', /if \(!ids\[id\]\) return;/, 'HSH restore: only what the script switched off (never one the player disabled)');
has(/!isLeader\(\) \|\| isHealerRole\(\)\) return;\n\s+if \(!hiveSkillsOn\(\)\) return;\s+\/\/ HIVESW-2026-10-15: skills OFF = the player owns/, 'caster-leader safeguard: never force-enables Combat Skills with skills OFF');
has(/if \(\(!isHealerRole\(\) && !noMelee\(\)\) \|\| !IsCharacterReady\(\)\) return;\n\s+if \(!hiveSkillsOn\(\)\) return;/, "healers / no-melee never attack: enforced only while Hive owns the skills (OFF = the player's FollowAtk / Combat Skills)");
has(/selfAllowed: \(\(\) => \{ try \{ return hiveSkillsOn\(\) && rkSelfBuffsAllowed/, 'after a res: no own self buffs with skills OFF (board Buff Me still)');
// member fighting
gate('function hiveOwnCombat()', /!hiveSkillsOn\(\) && !recHold\(\) && deadlockFixed\(\)/, 'L2Swarm combat for skills-OFF characters only where the StartCombat deadlock is fixed (3.8.11+)');
gate('function memberScriptFight(mob)', /if \(hiveOwnCombat\(\)\) return false;/, 'member help / self-defence: L2Swarm combat (the player\'s Combat Skills) instead of script hits');
has(/UISAFE\.memberScriptFight && !isLeader\(\) && !hiveOwnCombat\(\)\)\) \{ try \{ startCombatG\(\); \}/, 'members switch L2Swarm combat back on after the fight-check (skills OFF)');
has(/soloScriptFight\(\) && !hiveOwnCombat\(\)/, 'solo character with skills OFF: L2Swarm combat');
has(/if \(hiveOwnCombat\(\)\) \{ try \{ if \(!IsInCombat\) startCombatG\(\); \} catch \(e\) \{ \} \}\s+\/\/ HIVESW-2026-10-15: skills OFF = L2Swarm combat casts the player's Combat Skills on the focus/, 'raid dealer: L2Swarm combat on the focus with skills OFF');
{ // memberScriptFight decision on stubs
  const body = fnBody('function hiveOwnCombat()') + fnBody('function memberScriptFight(mob)');
  const run = (skills, fixed, scriptFlag, leader) => { const calls = []; const f = new Function('hiveSkillsOn', 'recHold', 'deadlockFixed', 'UISAFE', 'isLeader', 'casterOwnsAttacks', 'srvAttack', 'selfDef', 'now', 'Target', 'Send', 'num', 'sfMember', body + '\nreturn memberScriptFight;')(
    () => skills, () => false, () => fixed, { memberScriptFight: scriptFlag }, () => leader, () => false, (id) => calls.push(id), {}, () => 1, null, { Action() { } }, Number, () => false);
    return { r: f({ objId: 7 }), calls }; };
  const a = run(false, true, true, false), b = run(false, false, true, false), c = run(true, true, true, false);
  check(a.r === false && !a.calls.length, 'stubs: skills OFF + 3.8.11+ -> L2Swarm combat (no script hit)');
  check(b.r === true && b.calls.join() === '7', 'stubs: skills OFF on an old L2Swarm -> the safe script hit (no skills)');
  check(c.r === true && c.calls.join() === '7', 'stubs: skills ON -> unchanged (script attacks per runtime flag)'); }

// ---- 5) pure guard plans --------------------------------------------------------------------------------------------------------
{ const CL = blk('// CASTLOOP-BEGIN', '// CASTLOOP-END');
  const M = new Function(CL + '\nreturn { l2sGuardPlan, castOwnDecide };')();
  const p = M.l2sGuardPlan([{ id: 1177, enabled: false }, { id: 1220, enabled: false }, { id: 1148, enabled: true }], { own: false, attackIds: [1177, 1148], off: { 1177: true } });
  check(p.restore.join() === '1177' && !p.disable.length, 'l2sGuardPlan own=false: restores only what the script switched off (1177), not the player-disabled 1220, disables nothing');
  check(M.castOwnDecide({ enabled: false, role: 'nuker', magicAttacks: true, classType: 'MAGE' }) === false && M.castOwnDecide({ enabled: true, role: 'nuker', magicAttacks: true, classType: 'MAGE' }) === true, 'castOwnDecide: enabled false (skills OFF) = never script-owned'); }

// ---- 6) dashboard ------------------------------------------------------------------------------------------------------------------
{ const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'hivesw-')), DATA = path.join(TMP, 'data'), LOGS = path.join(TMP, 'Logs');
  fs.mkdirSync(DATA, { recursive: true }); fs.mkdirSync(LOGS, { recursive: true });
  const F = path.join(DATA, 'party_auto.json'); process.env.SWARM_PARTYAUTO_FILE = F;
  const ctx = { DIR: path.join(ROOT, 'Dashboard'), DATA, LOGS, ROOT, readJson: () => null, readStates: () => [], teamMap: () => ({ Tank1: 'Tank1', Bishop1: 'Tank1' }), reloadCfg: () => ({ accounts: [] }), mainLeader: 'Tank1', allowed: () => true };
  const r1 = API.post(ctx, { party: 'Tank1', values: { skills: false }, chars: { Bishop1: { heals: false, toggles: ['War Frenzy', ' Accuracy ', 'War Frenzy'] } } });
  const f1 = JSON.parse(fs.readFileSync(F, 'utf8'));
  check(r1.ok && f1.parties.Tank1.skills === false && f1.chars.Bishop1.heals === false && JSON.stringify(f1.chars.Bishop1.toggles) === '["War Frenzy","Accuracy"]', 'API: party skills OFF, a member heals OFF + ticked toggles (trimmed, no doubles)');
  check(f1.default.skills === undefined && f1.default.sell === false, 'API: a new file seeds the old switches OFF and leaves skills / heals / potions missing (= ON)');
  const i1 = API.info(ctx), sh = (i1.parties || []).find(p => p.leader === 'Tank1');
  check(Array.isArray(i1.fightToggles) && i1.fightToggles.includes('Vicious Stance'), 'API GET: fightToggles');
  check(!sh || (sh.eff.skills.on === false && sh.eff.heals.on === true), 'API GET: effective combat values per party');
  const bad1 = API.post(ctx, { party: 'Tank1', chars: { Bishop1: { toggles: ['<script>'] } } });
  const bad2 = API.post(ctx, { party: 'Tank1', chars: { Bishop1: { toggles: 'Accuracy' } } });
  const bad3 = API.post(ctx, { party: 'Tank1', values: { skills: 'off' } });
  check(bad1.code === 400 && bad2.code === 400 && bad3.code === 400, 'API: refuses a bad toggle name, a non-list, a non-boolean switch');
  const r2 = API.post(ctx, { party: 'Tank1', values: { skills: null }, chars: { Bishop1: { heals: null, toggles: null } } });
  const f2 = JSON.parse(fs.readFileSync(F, 'utf8'));
  check(r2.ok && !f2.parties.Tank1 && !f2.chars.Bishop1, 'API: null removes the party / character entries (back to ON)');
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { } delete process.env.SWARM_PARTYAUTO_FILE; }
{ const ps = fs.readFileSync(path.join(ROOT, 'Dashboard', 'partysettings.js'), 'utf8');
  check(/function secCombat\(\)/.test(ps) && /secSupplies\(\), secCombat\(\)/.test(ps), 'party settings: a Combat section');
  check(/const K = supKinds\(\);|K = supKinds\(\)/.test(ps) && /supKinds = \(\) => paKinds\(\)\.filter\(k => k\.group !== 'combat'\)/.test(ps), 'party settings: the Supplies section shows only its own switches');
  check(/combat: 'pauto'/.test(ps) && /async combat\(fresh\)/.test(ps) && /fetchSrc\('pauto'\)/.test(ps), 'party settings: Combat saves through /api/partyauto with a fresh rev (Supplies may write the same file first)');
  check(!/alert\(|confirm\(|prompt\(/.test(ps.replace(/ui(Alert|Confirm|Prompt)\(|UIDialog\.\w+\(/g, '')), 'party settings: no browser alert / confirm / prompt');
  const hs = fs.readFileSync(path.join(ROOT, 'Dashboard', 'hiveswitch.js'), 'utf8');
  check(/window\.HiveSwitch = \{ render/.test(hs) && !/[^.\w](alert|confirm|prompt)\(/.test(hs.replace(/UIDialog\.alert\(/g, '')), 'hiveswitch.js: HiveSwitch.render, UIDialog only');
  check(/is_toggle/.test(hs) && /data-hstxt/.test(hs), 'hiveswitch.js: toggle checkboxes from the skill list, a text box without one');
  const cp = fs.readFileSync(path.join(ROOT, 'Dashboard', 'charpage.js'), 'utf8');
  check(/BOX\('hive'/.test(cp) && /HiveSwitch\.render\(\$id\('cp_hive'\)/.test(cp), 'character page: the Combat box is mounted');
  const ix = fs.readFileSync(path.join(ROOT, 'Dashboard', 'index.html'), 'utf8');
  check(/<script src="\/hiveswitch\.js"><\/script>/.test(ix), 'index.html loads /hiveswitch.js');
  check(/url\.pathname === '\/hiveswitch\.js'/.test(fs.readFileSync(path.join(ROOT, 'Dashboard', 'partyauto_api.js'), 'utf8')), 'partyauto_api.js serves /hiveswitch.js'); }

console.log(`\n${n - fails} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
