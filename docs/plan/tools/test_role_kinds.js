// OFFLINE TEST of ROLE KINDS (user 2026-10-10: "sws/bd/prophet are missing" — every class needs a sensible role, data-driven, no skill ids).
// Runs the ROLEKIND-PURE + BUFFPLAN-PURE blocks of Scripts_dev/swarm.js in node (no host objects):
//   node docs/plan/tools/test_role_kinds.js        (exit code 1 when a check fails; SWARM_SRC=<file> tests another copy)
// Covers: every one of the 103 classes resolves to a kind; the 13 legacy names map unchanged; the LIVE roster (swarm.config.json, read only)
// keeps exactly today's tokens and gets the same answer from every role regex as the old literals; the new code paths are gated off for it;
// skill selection per kind from the L2J datapack skill lists (Swordsinger, Bladedancer, Prophet, Paladin, Hawkeye, Warlock ...: dp_skills.js),
// never a debuff on allies / a buff on enemies; buff upkeep respects existing buffs + the board-buff rule; summoners (pick, consumables, care,
// target, the servitor's own skills); archer spacing; boardBuffs per party.
'use strict';
// the synthetic skill lists come from the L2J datapack (Scripts/data/dp, dev install only (2026-10-10)): skip in a fresh package
if (!require('fs').existsSync(require('path').join(__dirname, '..', '..', '..', 'Scripts', 'data', 'dp', 'classSkillTree.xml'))) { console.log('skipped: needs the L2J datapack in Scripts/data/dp (dev install only)'); process.exit(0); }
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const SRC = process.env.SWARM_SRC || path.join(ROOT, 'Scripts_dev', 'swarm.js');
const src = fs.readFileSync(SRC, 'utf8');
const blk = (n) => { const a = src.indexOf(`// ${n}-BEGIN`), b = src.indexOf(`// ${n}-END`); if (a < 0 || b < a) { console.error(n + ' block not found'); process.exit(1); } return src.slice(a, b); };
const M = new Function(blk('ROLEKIND-PURE') + blk('BUFFPLAN-PURE') + `
return { ROLEKIND, ROLE_RE, rkResolve, rkKindOfClass, rkKindOf, rkIsLegacy, rkRaidRoutine, rkBehaviour, rkClassifyBuffs, rkBuffNeed, rkBufferPick,
  rkBufferVerify, rkBuffReport, rkBuffsFromReport, rkTeamNeedsBuffReport, rkTankPick, rkSummonPick, rkSummonConsumable, rkServitorSkills, rkServitorCare,
  rkServitorTarget, rkServitorActions, rkServitorSkillPick, rkArcherStep, rkBoardBuffs, rkUpkeepRole, rkSelfBuffsAllowed, rkSkill };`)();
const D = require('./dp_skills');
const T = D.classTree();
let fails = 0, oks = 0;
const check = (ok, what) => { if (ok) oks++; else { fails++; console.log('FAIL ' + what); } if (process.env.VERBOSE || !ok) { if (ok) console.log('ok   ' + what); } };
const NEVER = /Defense Aura|Ultimate Defense|Ultimate Evasion|Frenzy|Zealot|Guts|Fake Death|Silent Move|Hide|Final Fortress|Summon|Resurrect|Craft|Escape|Return|Sweeper|Spoil|Seed|Fishing|Pumping|Reeling|Expand|Create|Transform/i;

// ---- 1) every class -> a kind -------------------------------------------------------------------------------------------------------
const classes = Object.values(T.classes);
check(classes.length === 103, `class_tree.json has 103 classes (${classes.length})`);
const table = [];
classes.forEach(c => {
  const r = M.rkResolve('auto', c.id, T);
  check(!!r.role && M.ROLEKIND.kinds.includes(r.kind), `${c.name} (${c.id}) -> kind ${r.kind} token ${r.role}`);
  if (c.role !== 'base') check(r.kind === c.role, `${c.name}: kind = class_tree role ${c.role}`);
  else check(r.kind === (c.type === 'mystic' ? 'nuker' : 'melee'), `${c.name} (base ${c.type}) -> ${r.kind}`);
  if (r.kind === 'buffer') check(r.role === (c.type === 'mystic' ? 'buffer' : 'meleebuffer'), `${c.name}: buffer style ${r.role}`);
  table.push(`${c.name} | ${r.kind} | ${r.role}`);
});
['Swordsinger', 'Bladedancer', 'Prophet', 'Overlord', 'Warcryer', 'Doomcryer', 'Dominator', 'Hierophant', 'Sword Muse', 'Spectral Dancer'].forEach(n => {
  const c = classes.find(x => x.name === n); const r = M.rkResolve('auto', c.id, T);
  check(r.kind === 'buffer' && M.rkBehaviour(r.role).bufferUpkeep, `${n} keeps party buffs up (token ${r.role})`);
});
['Paladin', 'Dark Avenger', 'Temple Knight', 'Shillien Knight', 'Phoenix Knight', 'Hell Knight', "Eva's Templar", 'Shillien Templar'].forEach(n => {
  const c = classes.find(x => x.name === n); const b = M.rkBehaviour(M.rkResolve('auto', c.id, T).role);
  check(b.kind === 'tank' && b.genericTank && b.tank && b.raid === 'tank', `${n}: generic tank (aggro logic, raid opener)`);
});
['Hawkeye', 'Silver Ranger', 'Phantom Ranger', 'Sagittarius', 'Moonlight Sentinel', 'Ghost Sentinel', 'Arbalester', 'Trickster'].forEach(n => {
  const c = classes.find(x => x.name === n); const b = M.rkBehaviour(M.rkResolve('auto', c.id, T).role);
  check(b.kind === 'archer' && b.archerSpacing && !b.noMelee && b.raid === 'dealer', `${n}: archer (keeps range, raid from range)`);
});
['Warlock', 'Elemental Summoner', 'Phantom Summoner', 'Arcana Lord', 'Elemental Master', 'Spectral Master'].forEach(n => {
  const c = classes.find(x => x.name === n); const b = M.rkBehaviour(M.rkResolve('auto', c.id, T).role);
  check(b.kind === 'summoner' && b.summoner && b.noMelee && b.caster, `${n}: summoner (servitor fights, caster spacing)`);
});
check(M.rkResolve('buffer', 21, T).role === 'meleebuffer' && M.rkResolve('buffer', 17, T).role === 'buffer', 'role "buffer" + Swordsinger -> meleebuffer, + Prophet -> buffer');
check(M.rkResolve('tank', 5, T).role === 'tank' && M.rkResolve('archer', 9, T).role === 'archer', 'kinds given directly stay the token');
check(M.rkResolve('weird', 14, T).kind === 'summoner' && /unknown role/.test(M.rkResolve('weird', 14, T).source), 'an unknown word -> the class kind (source says so)');
check(M.rkResolve('', 14, T).role === '', 'no role -> not controlled (as before)');

// ---- 2) legacy names unchanged + the live roster --------------------------------------------------------------------------------------
const OLD = {   // the literals as they were before ROLE KINDS (swarm.js 2026-10-10 11:52 backup)
  caster: /necromancer|nuker|doomcryer|bishop|shilliensaint|healer|mage|wizard/, noMelee: /doomcryer/,
  meleeOnly: /^(destroyer|doombringer|sk|crafter|spoiler|dagger)$/, phys: /^(sk|tank|destroyer|doombringer|dagger|crafter|spoiler|archer|warrior|gladiator|warlord|titan)$/,
  meleeDD: /destroyer|doombringer|inspector/, pairDealers: /^(destroyer|doombringer|inspector|necromancer|nuker|dagger|mage|wizard|archer)$/,
  pairBuffers: /^(doomcryer|warcryer|buffer)$/, debuffers: /^(sk|necromancer|inspector|doombringer|shilliensaint|doomcryer)$/, tank: /^(sk|tank)$/, healer: /healer|bishop|shilliensaint/,
};
const LEGACY = Object.keys(M.ROLEKIND.legacy);
check(LEGACY.length === 13, '13 legacy role names');
LEGACY.forEach(r => {
  const x = M.rkResolve(r, 33, T);
  check(x.role === r && x.legacy, `legacy ${r} -> token ${x.role} unchanged (kind ${x.kind})`);
  Object.keys(OLD).forEach(k => check(OLD[k].test(r) === M.ROLE_RE[k].test(r), `legacy ${r}: ${k} regex same answer (${OLD[k].test(r)})`));
  check(!M.ROLE_RE.generic.test(r) && !M.ROLE_RE.bufferUp.test(r) && M.rkRaidRoutine(r) === '', `legacy ${r}: no generic loop, raid switch keeps its own case`);
  check(M.rkUpkeepRole(r, true) === '', `legacy ${r} with board buffs: no buff upkeep`);
});
let cfg = null; try { cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'swarm.config.json'), 'utf8').replace(/^﻿/, '')); } catch (e) { cfg = null; }
if (cfg) {
  const acc = (cfg.accounts || []).filter(a => a && a.character && a.enabled !== false && a.role);
  const parties = {};
  acc.forEach(a => {
    // any class: a legacy name never looks at the class
    [0, 14, 17, 33, 116].forEach(cls => { const r = M.rkResolve(a.role, cls, T); if (!(r.role === a.role && r.legacy)) check(false, `live ${a.character}: role ${a.role} -> ${r.role}`); });
    check(M.rkIsLegacy(a.role), `live ${a.character} (${a.role}): a legacy role = exactly today's behaviour`);
    (parties[a.party || a.character] = parties[a.party || a.character] || []).push(a.role);
  });
  Object.keys(parties).forEach(p => {
    check(M.rkBoardBuffs(cfg, p) === true, `live party ${p}: board buffs on (no boardBuffs in swarm.config.json)`);
    check(!M.rkTeamNeedsBuffReport(parties[p]), `live party ${p}: no buff reports in swarm.pos (payload unchanged)`);
    check(parties[p].every(r => M.rkUpkeepRole(r, M.rkBoardBuffs(cfg, p)) === ''), `live party ${p}: no buff upkeep loop runs`);
  });
  console.log(`live roster: ${acc.length} characters in ${Object.keys(parties).length} parties checked`);
} else console.log('(no swarm.config.json — live roster checks skipped)');
// the healer class list of CONFIG.healer.classIds covers every class_tree healer class (the new class_tree check adds nothing for live roles)
{ const m = /classIds: \[([^\]]*)\]/.exec(src); const ids = m ? m[1].split(',').map(Number) : [];
  const healers = classes.filter(c => c.role === 'healer').map(c => c.id);
  check(healers.every(i => ids.includes(i)), `every class_tree healer class is already in CONFIG.healer.classIds (${healers.join(',')})`); }
// tankReady keeps the old name lists first; inspector party buffs by name
check(/function tankReady\(which\)[\s\S]{0,400}if \(k \|\| state\.role !== 'tank'\) return k;/.test(src), 'tankReady: sk / legacy return exactly readySkill(old list)');
{ const m = /const PHYS_ROLES = (\/[^;]+\/);/.exec(src); check(m && m[1] === String(M.ROLE_RE.phys), 'PHYS_ROLES literal (CASTPRIO block) = ROLE_RE.phys'); }
check(/partyBuffs: \{ inspector: \['Dark Weapon', 'Pride of Kamael'\] \}/.test(src), 'inspector party buffs by name, no ids');

// ---- 3) skill selection per kind from datapack lists ----------------------------------------------------------------------------------
const ENEMY = /^(ENEMY|ENEMY_ONLY|ENEMY_NOT)$/;
classes.forEach(c => {
  const cl = M.rkClassifyBuffs(D.classSkills(c.id), NEVER);
  const all = cl.party.concat(cl.target);
  check(!all.some(s => s.debuff), `${c.name}: no debuff among its buffs for allies`);
  check(!all.some(s => ENEMY.test(s.target)), `${c.name}: no enemy-target skill among its buffs`);
});
const SWS = M.rkClassifyBuffs(D.classSkills(21), NEVER), BD = M.rkClassifyBuffs(D.classSkills(34), NEVER), PRO = M.rkClassifyBuffs(D.classSkills(17), NEVER);
check(SWS.party.length >= 8 && SWS.party.every(s => /^SONG_/.test(s.ab)), `Swordsinger: ${SWS.party.length} songs as party buffs (${SWS.party.map(s => s.name).join(', ')})`);
check(BD.party.length >= 8 && BD.party.every(s => /^DANCE_/.test(s.ab)), `Bladedancer: ${BD.party.length} dances as party buffs`);
check(['Might', 'Haste', 'Acumen', 'Focus', 'Wind Walk', 'Shield'].every(n => PRO.target.some(s => s.name === n)), 'Prophet: Might / Haste / Acumen / Focus / Wind Walk / Shield as single-target ally buffs');
check(!PRO.target.some(s => /Resurrect|Heal/.test(s.name)), 'Prophet: no heals / resurrection among buffs');
const PAL = M.rkTankPick(D.classSkills(5));
check(PAL.single.includes(28) && PAL.area.includes(18) && PAL.save.includes(110), `Paladin: Aggression single, Aura of Hate area, Ultimate Defense save (${JSON.stringify(PAL)})`);
const DA = M.rkTankPick(D.classSkills(6));
check(DA.single.length && DA.area.length, 'Dark Avenger: aggro skills found by TARGET_LOCK');
const HAWK = M.rkClassifyBuffs(D.classSkills(9), NEVER);
check(!HAWK.party.length && !HAWK.target.length, 'Hawkeye: no party buffs (assist only)');
// ---- 4) buff upkeep rules -------------------------------------------------------------------------------------------------------------
const might = PRO.target.find(s => s.name === 'Might'), acu = PRO.target.find(s => s.name === 'Acumen'), song = SWS.party.find(s => s.name === 'Song of Wind');
const mem = (o) => Object.assign({ name: 'A', me: false, dist: 300, dead: false, known: true, caster: false, buffs: {} }, o);
check(M.rkBuffNeed(might, mem({})) === 'missing', 'Might missing -> missing');
check(M.rkBuffNeed(might, mem({ buffs: { PA_UP: { remain: 40000, level: 3 } } })) === '', 'board Might (same type, 11 h left) -> never overwritten');
check(M.rkBuffNeed(might, mem({ buffs: { PA_UP: { remain: 10, level: might.abLvl } } })) === 'expiring', 'my Might with 10 s left -> expiring');
check(M.rkBuffNeed(might, mem({ buffs: { PA_UP: { remain: 10, level: might.abLvl + 5 } } })) === '', 'a STRONGER Might (higher level) about to expire -> left alone');
const fourteen = {}; for (let i = 0; i < 14; i++) fourteen['SONG_X' + i] = { remain: 100, level: 1 };
check(M.rkBuffNeed(song, mem({ buffs: fourteen })) === '', 'song with 14 songs/dances up -> no slot (L2Toggle 14)');
check(M.rkBuffNeed(song, mem({ buffs: { SONG_A: { remain: 100, level: 1 } } })) === 'missing', 'song with 1 up -> missing');
let p = M.rkBufferPick({ skills: { party: [], target: [might, acu] }, members: [mem({ name: 'Me', me: true, caster: true }), mem({ name: 'Tank', tank: true }), mem({ name: 'Mage', caster: true })], now: 100000, mp: 500 });
check(p && p.skill.name === 'Might' && p.target.name === 'Tank', `fighter buff on the tank first (${p && p.why})`);
p = M.rkBufferPick({ skills: { party: [], target: [might, acu] }, members: [mem({ name: 'Tank', tank: true, buffs: { PA_UP: { remain: 999, level: 9 } } }), mem({ name: 'Mage', caster: true })], now: 100000, mp: 500 });
check(p && p.skill.name === 'Acumen' && p.target.name === 'Mage', `Acumen only on the caster, never Might on the mage (${p && p.why})`);
p = M.rkBufferPick({ skills: { party: [], target: [might] }, members: [mem({ name: 'Mage', caster: true })], now: 100000, mp: 500 });
check(!p, 'nothing for a lone mage from a fighter-only buff');
p = M.rkBufferPick({ skills: { party: [song], target: [] }, members: [mem({ name: 'Me', me: true }), mem({ name: 'B' })], now: 100000, mp: 500, last: { [song.id + '@party']: 95000 } });
check(!p, 'same skill again within minGapMs (20 s) -> no (loop guard)');
p = M.rkBufferPick({ skills: { party: [song], target: [] }, members: [mem({ name: 'Me', me: true }), mem({ name: 'B' })], now: 100000, mp: 500, fails: { [song.id + '@party']: { n: 0, until: 200000 } } });
check(!p, 'a skill that failed 3 times rests (fail block)');
p = M.rkBufferPick({ skills: { party: [song], target: [] }, members: [mem({ name: 'Me', me: true }), mem({ name: 'B' })], now: 100000, mp: 1 });
check(!p, 'not enough MP -> no cast');
{ const f = {}; const pend = { key: 'k', ab: 'PA_UP', names: ['A'], at: 0 };
  check(M.rkBufferVerify(pend, () => ({}), 1000, f) === 'wait', 'verify: wait 2.5 s');
  M.rkBufferVerify(pend, () => ({}), 9000, f); M.rkBufferVerify(pend, () => ({}), 9000, f); M.rkBufferVerify(pend, () => ({}), 9000, f);
  check(f.k && f.k.until > 9000, 'verify: 3 misses -> blocked 10 min');
  check(M.rkBufferVerify(pend, () => ({ PA_UP: {} }), 9000, f) === 'ok' && !f.k, 'verify: it showed up -> ok, block cleared'); }
check(JSON.stringify(M.rkBuffReport([{ AbnormalType: 'PA_UP', RemainTime: 100, Level: 3 }, { AbnormalType: 'STUN', IsDebuff: true }])) === '{"PA_UP":[100,3]}', 'buff report: debuffs left out');
// board-buff rule
check(M.rkSelfBuffsAllowed(true, false) === false && M.rkSelfBuffsAllowed(true, true) === true && M.rkSelfBuffsAllowed(false, false) === true, 'self buffs: not over board buffs; always without board buffs');
check(M.rkUpkeepRole('buffer', true) === 'fill' && M.rkUpkeepRole('meleebuffer', false) === 'primary', 'generic buffer: fill with board, primary without');
check(M.rkUpkeepRole('doomcryer', false) === 'primary' && M.rkUpkeepRole('bishop', false) === 'healer-idle' && M.rkUpkeepRole('destroyer', false) === '', 'no board: doomcryer primary, healers between heals, others none');
check(M.rkBoardBuffs({ boardBuffs: false }, 'X') === false && M.rkBoardBuffs({ boardBuffs: false, accounts: [{ character: 'X', boardBuffs: true }] }, 'X') === true && M.rkBoardBuffs({}, 'X') === true, 'boardBuffs: top level, party leader entry wins, default on');

// ---- 5) summoners ----------------------------------------------------------------------------------------------------------------------
[14, 28, 41, 96, 104, 111].forEach(id => {
  const l = D.classSkills(id), s = M.rkSummonPick(l, () => 999);
  check(s && /^Summon /.test(s.name) && !/Cubic|Golem|Friend/i.test(s.name), `${T.classes[id].name}: summons ${s && s.name}`);
  check(M.rkSummonPick(l, () => 0) === null || !M.rkSummonPick(l, () => 0).itemId, `${T.classes[id].name}: nothing it cannot pay for (items)`);
  const c = M.rkSummonConsumable(l); check(c && c.id === 3031 && c.want > c.below, `${T.classes[id].name}: consumable from the skill data: item ${c && c.id} x${c && c.perSummon}, want ${c && c.want}`);
  const sv = M.rkServitorSkills(l); check(sv.heal.length && sv.buffs.length, `${T.classes[id].name}: servitor heal + ${sv.buffs.length} servitor buffs`);
});
{ const l = D.classSkills(14); const kat = M.rkSummonPick(l, () => 999, 'kat'); check(kat && /Kat/.test(kat.name), `user override 'kat' -> ${kat && kat.name}`); }
{ const sv = M.rkServitorSkills(D.classSkills(14));
  const care = (pet, me) => M.rkServitorCare(sv, pet, me || { hp: 100, mp: 999 });
  check(care({ hp: 50, mp: 100, buffs: {} }).skill.name === 'Servitor Heal', 'servitor at 50 % -> Servitor Heal');
  check(care({ hp: 50, mp: 100 }, { hp: 20, mp: 999 }) === null, 'me at 20 % -> my own heal first');
  check(care({ hp: 100, mp: 20, buffs: {} }).skill.name === 'Servitor Recharge', 'servitor MP 20 % -> Servitor Recharge');
  const b = care({ hp: 100, mp: 100, buffs: {} }); check(b && /servitor buff/.test(b.why), `healthy servitor without buffs -> ${b && b.skill.name}`);
  const full = {}; sv.buffs.forEach(s => { full[s.ab] = { remain: 9999, level: 99 }; }); check(care({ hp: 100, mp: 100, buffs: full }) === null, 'every servitor buff up -> nothing'); }
check(M.rkServitorTarget({ retreat: true, leaderTarget: 5 }) === 'stop', 'servitor: called back on regroup / teleport / escape');
check(M.rkServitorTarget({ raid: true, raidPulled: false, raidFocus: 7, onMe: 0 }) === 0, 'raid before the pull: no attack');
check(M.rkServitorTarget({ raid: true, raidPulled: true, raidFocus: 7, leaderTarget: 5 }) === 7, 'raid: the focus (minions first)');
check(M.rkServitorTarget({ onHealer: 9, leaderTarget: 5 }) === 9, 'a monster on the healer first');
check(M.rkServitorTarget({ leaderTarget: 5 }) === 5 && M.rkServitorTarget({}) === 0, "the leader's target; nothing = no attack (never pulls)");
{ const tab = JSON.parse(fs.readFileSync(path.join(ROOT, 'Scripts', 'data', 'servitor_actions.json'), 'utf8')).actions;
  const sk = (n, o) => Object.assign({ Id: 4000 + n.length, Level: 1, Name: n, IsActive: true, TargetType: 'ENEMY', AffectScope: 'SINGLE', MagicLvl: 60 }, o || {});
  let acts = M.rkServitorActions(tab, 'Magnus the Unicorn', [sk('Whiplash'), sk('Tridal Wave', { AffectScope: 'RANGE' })]);
  check(acts.length === 2 && acts.find(a => a.action === 1034).use === 'attack' && acts.find(a => a.action === 1035).use === 'aoe', 'Magnus (high level): Whiplash = action 1034 attack, Tridal Wave = 1035 AoE');
  acts = M.rkServitorActions(tab, 'Magnus the Unicorn', [sk('Whiplash')]);
  check(acts.length === 1, 'Magnus at a low level (only Whiplash learned): one action');
  check(M.rkServitorSkillPick({ acts: M.rkServitorActions(tab, 'Magnus the Unicorn', [sk('Whiplash'), sk('Tridal Wave', { AffectScope: 'RANGE' })]), fighting: true, mobsAtTarget: 4, owner: { hp: 100 }, now: 1 }).action === 1035, '4 monsters -> the AoE');
  check(M.rkServitorSkillPick({ acts: M.rkServitorActions(tab, 'Magnus the Unicorn', [sk('Whiplash'), sk('Tridal Wave', { AffectScope: 'RANGE' })]), fighting: true, mobsAtTarget: 1, owner: { hp: 100 }, now: 1 }).action === 1034, '1 monster -> the single attack');
  check(M.rkServitorSkillPick({ acts: M.rkServitorActions(tab, 'Magnus the Unicorn', [sk('Whiplash')]), fighting: false, owner: { hp: 100 }, now: 1 }) === null, 'no fight -> no attack skill');
  const q = M.rkServitorActions(tab, 'Feline Queen', [sk('Blessing of Queen', { TargetType: 'TARGET', AbnormalType: 'MULTI_BUFF', AbnormalTime: 1200 })]);
  check(q.length === 1 && q[0].use === 'buff' && q[0].owner, 'Feline Queen: Blessing of Queen = a buff on the summoner');
  check(M.rkServitorSkillPick({ acts: q, fighting: false, owner: { hp: 100, buffs: {} }, now: 1 }).action === 1007, 'the summoner lacks it -> action 1007');
  check(M.rkServitorSkillPick({ acts: q, fighting: false, owner: { hp: 100, buffs: { MULTI_BUFF: { remain: 999, level: 9 } } }, now: 1 }) === null, 'already up -> nothing');
  check(M.rkServitorSkillPick({ acts: M.rkServitorActions(tab, 'Magnus the Unicorn', [sk('Whiplash')]), fighting: true, owner: { hp: 100 }, now: 2000, last: { 1034: 1000 } }) === null, 'reuse gap respected');
  const boxer = M.rkServitorActions(tab, 'Boxer the Unicorn', [sk('Master Recharge', { TargetType: 'TARGET' })]);
  check(boxer.length && boxer[0].use === 'recharge' && M.rkServitorSkillPick({ acts: boxer, owner: { hp: 100, mp: 20 }, now: 1 }).action === 45, 'Boxer: Master Recharge on the summoner at 20 % MP (action 45)'); }
// ---- 6) archer -------------------------------------------------------------------------------------------------------------------------
{ const s = M.rkArcherStep({ me: { x: 0, y: 0 }, mobs: [{ x: 100, y: 0, on: 'mate' }] });
  check(s && s.x < -300 && Math.abs(s.y) < 5, `monster 100 away held by the tank -> step back to ${s && s.x},${s && s.y}`);
  check(M.rkArcherStep({ me: { x: 0, y: 0 }, mobs: [{ x: 100, y: 0, on: 'me' }] }) === null, 'monster on me -> stay (stepping does not help)');
  check(M.rkArcherStep({ me: { x: 0, y: 0 }, mobs: [{ x: 900, y: 0, on: 'mate' }] }) === null, 'nothing close -> stay'); }

console.log(`\nkind table (class | kind | token): ${table.length} classes`);
if (process.env.TABLE) console.log(table.join('\n'));
console.log(`\n${oks} ok, ${fails} failed`);
process.exit(fails ? 1 : 0);
