// BUFF PLAN LOGIC (2026-10-10, user: buffers must work for every class, without community-board buffs, with plans the user chooses per
// party). The ROLEKIND-PURE and BUFFPLAN-PURE blocks below are TEXT COPIES of the blocks in Scripts_dev/swarm.js (what the bots run), written by
// docs/plan/tools/buff_logic_sync.js; docs/plan/tools/test_buff_plans.js fails when they differ.
// Used by Dashboard/buffpage_api.js (server: /api/buffplans), Dashboard/buffpage.js (browser: window.BuffLogic) and the tests.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BuffLogic = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

// ROLEKIND-PURE-BEGIN (no host calls in here: docs/plan/tools/test_role_kinds.js runs this block in node)
const ROLEKIND = {
  kinds: ['tank', 'healer', 'buffer', 'melee', 'archer', 'dagger', 'nuker', 'summoner', 'spoiler', 'crafter'],
  legacy: { sk: 'tank', bishop: 'healer', shilliensaint: 'healer', healer: 'healer', destroyer: 'melee', doombringer: 'melee',
            necromancer: 'nuker', nuker: 'nuker', inspector: 'buffer', doomcryer: 'buffer', crafter: 'crafter', spoiler: 'spoiler', dagger: 'dagger' },
  tokens: { meleebuffer: 'buffer' },          // internal token: a buffer of a fighter class
  auto: /^(auto|class)$/i,
  // board scheme / raid delay / gear rule for the NEW tokens (legacy names keep theirs in CONFIG / GEAR_ROLE_OF)
  scheme: { tank: 'Defender', melee: 'Warrior', meleebuffer: 'Warrior', archer: 'Warrior', buffer: 'Mystic', summoner: 'Mystic' },
  raidDelay: { tank: 0, melee: 5000, meleebuffer: 4000, archer: 3000, buffer: 500, summoner: 2500 },
  gear: { tank: 'tank', melee: 'melee', meleebuffer: 'melee', archer: 'archer', buffer: 'mage', summoner: 'mage' },
  buff: { refreshSec: 30, minTime: 60, minGapMs: 20000, failMax: 3, failBlockMs: 600000, songDanceMax: 14, range: 900, partyRange: 1000,
          reportMaxAgeMs: 12000, minMpPct: 15, reportMax: 48 },
  archer: { tooClose: 220, want: 520, gapMs: 2500 },
  // summoner: resummon gap, min MP, servitor attack resend gap, consumable stock (resummons summons + upkeep margin, low below lowSummons),
  // servitor care thresholds, own nukes only as filler above fillerMinMpPct (fillerNukes false = never)
  summon: { gapMs: 20000, minMpPct: 30, attackGapMs: 3000, resummons: 10, upkeepMargin: 20, lowSummons: 3, petHealBelow: 70, petMpBelow: 40, selfDangerHp: 35,
            fillerNukes: true, fillerMinMpPct: 60, careGapMs: 1500 },
  tankStances: /^(Guard Stance|Fortitude|Final Fortress)$/i,   // tank toggles the keeper may switch on in a fight for a generic tank
};
// role regexes (the old literals plus the new tokens; every legacy name gives the same answer as before — test_role_kinds.js proves it)
const ROLE_RE = {
  caster: /necromancer|nuker|doomcryer|bishop|shilliensaint|healer|mage|wizard|^buffer$|^summoner$/,
  noMelee: /doomcryer|^buffer$|^summoner$/,
  meleeOnly: /^(destroyer|doombringer|sk|crafter|spoiler|dagger|tank|melee|meleebuffer|archer)$/,
  phys: /^(sk|tank|destroyer|doombringer|dagger|crafter|spoiler|archer|warrior|gladiator|warlord|titan|melee|meleebuffer)$/,
  meleeDD: /destroyer|doombringer|inspector|^melee$|^meleebuffer$/,
  pairDealers: /^(destroyer|doombringer|inspector|necromancer|nuker|dagger|mage|wizard|archer|melee|meleebuffer|summoner)$/,
  pairBuffers: /^(doomcryer|warcryer|buffer)$/,
  debuffers: /^(sk|necromancer|inspector|doombringer|shilliensaint|doomcryer|tank)$/,
  tank: /^(sk|tank)$/,
  healer: /healer|bishop|shilliensaint/,
  generic: /^(tank|buffer|meleebuffer|melee|archer|summoner)$/,   // tokens with generic kind behaviour (never a legacy name)
  bufferUp: /^(buffer|meleebuffer)$/,
};
function rkNum(v) { return typeof v === 'bigint' ? Number(v) : (Number(v) || 0); }
function rkClassRow(tree, id) {
  const c = tree && tree.classes; if (!c || id === null || id === undefined || id === '') return null;
  const n = Number(id); if (!isFinite(n)) return null;
  return (Array.isArray(c) ? c.find(x => Number(x.id) === n) : c[String(n)]) || null;
}
/** the kind of a class (class_tree.json role; base / unknown role: fighter -> melee, mystic -> nuker); '' = unknown class */
function rkKindOfClass(tree, id) {
  const r = rkClassRow(tree, id); if (!r) return '';
  const k = String(r.role || '');
  if (ROLEKIND.kinds.includes(k)) return k;
  return String(r.type || '') === 'mystic' ? 'nuker' : 'melee';
}
function rkStyleOfClass(tree, id) { const r = rkClassRow(tree, id); return !r ? '' : String(r.type || '') === 'mystic' ? 'caster' : 'melee'; }
/** the kind behind a role token ('' = unknown) */
function rkKindOf(token) { const t = String(token || ''); return ROLEKIND.legacy[t] || ROLEKIND.tokens[t] || (ROLEKIND.kinds.includes(t) ? t : ''); }
function rkTokenFor(kind, style) { return kind === 'buffer' && style === 'melee' ? 'meleebuffer' : kind; }
function rkIsLegacy(role) { return Object.prototype.hasOwnProperty.call(ROLEKIND.legacy, String(role || '')); }
/** swarm.config.json role + current class -> { role: the token for state.role, kind, legacy, source, style }. role '' (no role) = not controlled. */
function rkResolve(role, classId, tree) {
  const raw = String(role === null || role === undefined ? '' : role).trim(), r = raw.toLowerCase();
  if (!r) return { role: '', kind: '', legacy: false, source: 'none', style: '' };
  if (rkIsLegacy(raw)) return { role: raw, kind: ROLEKIND.legacy[raw], legacy: true, source: 'legacy', style: '' };   // exact spelling: unchanged
  if (rkIsLegacy(r)) return { role: r, kind: ROLEKIND.legacy[r], legacy: true, source: 'legacy', style: '' };
  if (r === 'meleebuffer') return { role: r, kind: 'buffer', legacy: false, source: 'kind', style: 'melee' };
  if (ROLEKIND.kinds.includes(r)) {
    const style = r === 'buffer' ? (rkStyleOfClass(tree, classId) || 'caster') : '';
    return { role: rkTokenFor(r, style), kind: r, legacy: false, source: 'kind', style };
  }
  const k = rkKindOfClass(tree, classId);
  if (!k) return { role: '', kind: '', legacy: false, source: ROLEKIND.auto.test(r) ? 'class unknown' : 'unknown role ' + r, style: '' };
  const style = rkStyleOfClass(tree, classId);
  return { role: rkTokenFor(k, style), kind: k, legacy: false, source: ROLEKIND.auto.test(r) ? 'class' : 'class (unknown role ' + r + ')', style };
}
/** which raid routine a NEW token runs (legacy names have their own cases in runRaidSequence: '' here) */
function rkRaidRoutine(token) {
  const t = String(token || '');
  if (rkIsLegacy(t)) return '';
  if (t === 'tank') return 'tank';
  if (/^(melee|meleebuffer|archer|buffer|summoner)$/.test(t)) return 'dealer';
  return '';
}
/** what a token does (for the tests and the kind table) */
function rkBehaviour(token) {
  const t = String(token || ''), kind = rkKindOf(t);
  return { token: t, kind, legacy: rkIsLegacy(t), healer: ROLE_RE.healer.test(t), caster: ROLE_RE.caster.test(t), noMelee: ROLE_RE.noMelee.test(t),
    meleeOnly: ROLE_RE.meleeOnly.test(t), meleeDD: ROLE_RE.meleeDD.test(t), tank: ROLE_RE.tank.test(t), genericTank: t === 'tank',
    bufferUpkeep: ROLE_RE.bufferUp.test(t), summoner: t === 'summoner', archerSpacing: t === 'archer', raid: rkRaidRoutine(t),
    scheme: ROLEKIND.scheme[t] || '', gear: ROLEKIND.gear[t] || '' };
}
/** plain skill info from an L2Skill (host object or snapshot copy) */
function rkSkill(s) {
  const lv = rkNum(s.Level);
  return { id: rkNum(s.Id), level: lv, name: String(s.Name || ''), active: s.IsActive !== false, toggle: !!s.IsToggle, debuff: !!s.IsDebuff,
    target: String(s.TargetType || '').toUpperCase(), scope: String(s.AffectScope || '').toUpperCase(), ab: String(s.AbnormalType || '').toUpperCase(),
    abLvl: s.AbnormalLevel === null || s.AbnormalLevel === undefined ? lv : rkNum(s.AbnormalLevel), time: rkNum(s.AbnormalTime),
    range: rkNum(s.CastRange), mp: rkNum(s.MP), hit: rkNum(s.HitTime), mlvl: rkNum(s.MagicLvl), ready: s.IsReady !== false,
    itemId: rkNum(s.ItemConsumeId), itemCount: rkNum(s.ItemConsumeCount) };
}
const RK_PARTY_SCOPE = /^(PARTY|PLEDGE|PARTY_PLEDGE)$/;     // party songs / dances / chants: TargetType SELF + this scope (datapack affectObject FRIEND)
const RK_ALLY_TARGET = /^(TARGET|ONE|OTHERS)$/;             // single-target buffs (Might, Haste, Prophecy ...): cast on a party member
const RK_FIGHTER_TYPES = /^(PA_UP|ATTACK_TIME_DOWN|CRITICAL_PROB_UP|CRITICAL_DMG_UP|HIT_UP|BERSERKER)$/;   // single-target: only on physical fighters
const RK_MAGE_TYPES = /^(MA_UP|CASTING_TIME_DOWN|MAGIC_CRITICAL_UP|CANCEL_PROB_DOWN|MAX_MP_UP)$/;            // single-target: only on casters / healers
/** my buffs for others, from my learned skills: { party: [...], target: [...] } — never a debuff, never an enemy-target skill */
function rkClassifyBuffs(list, neverRe) {
  const party = [], target = [];
  (list || []).forEach(s0 => {
    const s = rkSkill(s0);
    if (!s.id || !s.active || s.toggle || s.debuff || !s.ab || s.time <= 0 || s.ab === 'TARGET_LOCK') return;
    if (neverRe && neverRe.test(s.name)) return;
    if (s.target === 'SELF') { if (RK_PARTY_SCOPE.test(s.scope)) party.push(s); return; }   // self-only buffs = the skill plan's self buffs (board-buff rule)
    if (RK_ALLY_TARGET.test(s.target) && (s.scope === 'SINGLE' || s.scope === '')) target.push(s);
  });
  const best = (a) => { const by = {}; a.forEach(s => { const o = by[s.ab]; if (!o || s.abLvl > o.abLvl || (s.abLvl === o.abLvl && s.mlvl > o.mlvl)) by[s.ab] = s; }); return Object.keys(by).map(k => by[k]); };
  return { party: best(party), target: best(target) };     // one skill per abnormal type (the strongest I know)
}
function rkIsSongDance(s) { return /^(SONG|DANCE)_/.test(String(s.ab || '')) || /^(Song|Dance) of /i.test(String(s.name || '')); }
function rkSongDanceCount(buffs) { return Object.keys(buffs || {}).filter(t => /^(SONG|DANCE)_/.test(t)).length; }
/** does member m need my buff s? 'missing' | 'expiring' | '' (no). m.buffs = { ABNORMAL_TYPE: { remain: s, level } } */
function rkBuffNeed(s, m, cfg) {
  const c = cfg || ROLEKIND.buff, b = (m.buffs || {})[s.ab];
  if (!b) return rkIsSongDance(s) && rkSongDanceCount(m.buffs) >= c.songDanceMax ? '' : 'missing';   // L2Toggle: 14 songs / dances at most
  if (rkNum(b.level) > s.abLvl) return '';                   // a stronger one (board / another buffer) is never overwritten
  const rem = rkNum(b.remain);
  if (rem <= 0 || rem > c.refreshSec) return '';             // still running (a 12 h board buff of the same type counts) / no timer
  return 'expiring';
}
/** the next buff to cast: { skill, target (member | null = the party buff on myself), why, key } | null.
 *  o: { skills: { party, target }, members: [{ name, me, dist, dead, known, caster, tank, leader, buffs }], now, last: { key: at }, fails: { key: { n, until } },
 *       mp, have(itemId) -> count, cfg } */
function rkBufferPick(o) {
  const cfg = Object.assign({}, ROLEKIND.buff, (o && o.cfg) || {}), t = rkNum(o && o.now), last = (o && o.last) || {}, fails = (o && o.fails) || {};
  const mates = ((o && o.members) || []).filter(m => m && !m.dead && m.known !== false);
  const sk = (o && o.skills) || {};
  const free = (key) => { const f = fails[key]; if (f && rkNum(f.until) > t) return false; return !(last[key] && t - last[key] < cfg.minGapMs); };
  const afford = (s) => s.ready !== false && (o.mp === undefined || o.mp === null || s.mp <= rkNum(o.mp)) &&
    (!s.itemId || !o.have || rkNum(o.have(s.itemId)) >= Math.max(1, s.itemCount));
  // BUFF PLANS: s.who = the members the plan gives it to (else everyone / the fighter-mage rule), o.owner(member, ab) = the buffer that owns
  // that buff on that member (OVERLAP: only one casts), s.priority = the plan order (lower first)
  const mine = (s, m) => (!s.who || s.who.includes(m.name)) && (!o.owner || !o.me || (o.owner(m.name, s.ab) || o.me) === o.me);
  const pri = (s) => rkNum(s.priority);
  let best = null;
  (sk.party || []).forEach(s => {
    const key = s.id + '@party';
    if (s.time < cfg.minTime || !afford(s) || !free(key)) return;
    const near = mates.filter(m => (m.me || rkNum(m.dist) <= cfg.partyRange) && mine(s, m));
    const need = near.map(m => ({ m, n: rkBuffNeed(s, m, cfg) })).filter(x => x.n);
    if (!need.length) return;
    const score = need.length * 10 + need.filter(x => x.n === 'missing').length * 3 + (rkIsSongDance(s) ? 0 : 1);
    if (!best || pri(s) < pri(best.skill) || (pri(s) === pri(best.skill) && score > best.score)) best = { skill: s, target: null, key, score, why: `${s.name} (${s.ab}): ${need.map(x => x.m.name + ' ' + x.n).join(', ')}` };
  });
  if (best) return best;
  const order = mates.slice().sort((a, b) => (b.tank ? 1 : 0) - (a.tank ? 1 : 0) || (b.leader ? 1 : 0) - (a.leader ? 1 : 0) || String(a.name).localeCompare(String(b.name)));
  for (const m of order) {
    if (!m.me && rkNum(m.dist) > cfg.range) continue;
    for (const s of sk.target || []) {
      if (!s.who && RK_FIGHTER_TYPES.test(s.ab) && m.caster) continue;
      if (!s.who && RK_MAGE_TYPES.test(s.ab) && !m.caster) continue;
      if (!mine(s, m)) continue;
      const key = s.id + '@' + m.name;
      if (s.time < cfg.minTime || !afford(s) || !free(key)) continue;
      const n = rkBuffNeed(s, m, cfg);
      if (n) return { skill: s, target: m, key, score: 1, why: `${s.name} (${s.ab}) on ${m.name}: ${n}` };
    }
  }
  return null;
}
/** after a cast: did the buff show up? pend: { key, ab, names: [who], at }, seen(name) -> buffs map | null. Returns 'ok' | 'fail' | 'wait' */
function rkBufferVerify(pend, seen, t, fails, cfg) {
  const c = Object.assign({}, ROLEKIND.buff, cfg || {});
  if (!pend) return 'ok';
  if (t - pend.at < 2500) return 'wait';
  const ok = (pend.names || []).some(n => { const b = seen(n); return !!(b && b[pend.ab]); });
  if (ok) { delete fails[pend.key]; return 'ok'; }
  if (t - pend.at < 8000) return 'wait';
  const f = fails[pend.key] = fails[pend.key] || { n: 0, until: 0 };
  f.n++; if (f.n >= c.failMax) { f.until = t + c.failBlockMs; f.n = 0; }
  return 'fail';
}
/** compact buff report for teammates' buffers: { TYPE: [remainSec, level] } (debuffs left out; at most reportMax types) */
function rkBuffReport(list) {
  const out = {}; let n = 0;
  (list || []).forEach(b => { if (!b || b.IsDebuff || n >= ROLEKIND.buff.reportMax) return; const ab = String(b.AbnormalType || '').toUpperCase(); if (!ab || out[ab]) return;
    out[ab] = [Math.round(rkNum(b.RemainTime)), b.AbnormalLevel === null || b.AbnormalLevel === undefined ? rkNum(b.Level) : rkNum(b.AbnormalLevel)]; n++; });
  return out;
}
function rkBuffsFromReport(r) { const out = {}; Object.keys(r || {}).forEach(k => { const v = r[k] || []; out[k] = { remain: rkNum(v[0]), level: rkNum(v[1]) }; }); return out; }
/** does a team (role tokens / raw roster roles) contain a generic buffer that needs our buff reports? */
function rkTeamNeedsBuffReport(roles) { return (roles || []).some(r => ROLE_RE.bufferUp.test(String(r || ''))); }
const RK_SAVE_TYPES = /^(PD_UP_SPECIAL|AVOID_UP_SPECIAL|INVINCIBILITY)$/;   // Ultimate Defense / Ultimate Evasion / Vengeance type: the tank's emergency
/** a generic tank's skills by data: { single: [ids], area: [ids], save: [ids] } (strongest first). TARGET_LOCK = the Aggression / Aura of Hate type */
function rkTankPick(list) {
  const single = [], area = [], save = [];
  (list || []).forEach(s0 => {
    const s = rkSkill(s0);
    if (!s.id || !s.active || s.toggle) return;
    if (s.ab === 'TARGET_LOCK') {
      if (/^(ENEMY|ENEMY_ONLY|TARGET|)$/.test(s.target) && (s.scope === 'SINGLE' || s.scope === '')) single.push(s);
      else area.push(s);
      return;
    }
    if (s.target === 'SELF' && !s.debuff && RK_SAVE_TYPES.test(s.ab) && s.time > 0 && s.time <= 120) save.push(s);
  });
  const ord = (a) => a.sort((x, y) => y.mlvl - x.mlvl || y.level - x.level || x.mp - y.mp).map(s => s.id);
  return { single: ord(single), area: ord(area), save: ord(save) };
}
const RK_SUMMON_NOT = /cubic|friend|party|clan|golem|cannon|big boom|siege|treasure|corrupted|cursed|mechanic|wyvern|pet|signet|merchant/i;
/** SUMMONERS (user 2026-10-10: "summoners need to use their summon for attacks or they are useless ... summon and assist their summon"):
 *  Warlock / Arcana Lord, Elemental Summoner / Elemental Master, Phantom Summoner / Spectral Master (class_tree role 'summoner').
 *  The best servitor I can summon now: my learned 'Summon ...' servitor skills (no cubics / golems / Summon Friend), highest magic level, then
 *  skill level; prefer = the user's choice (plan field `summon`: a name part like 'Kat', 'Unicorn', 'Shadow') wins when I know + can afford it.
 *  The consumable it eats (Spirit Ore / crystals) comes from the skill data (L2Skill.ItemConsumeId / ItemConsumeCount). */
function rkSummonPick(list, have, prefer) {
  let best = null, pref = null;
  const want = String(prefer || '').trim().toLowerCase();
  (list || []).forEach(s0 => {
    const s = rkSkill(s0);
    if (!s.id || !s.active || s.toggle || !/^Summon /i.test(s.name) || RK_SUMMON_NOT.test(s.name)) return;
    if (s.target && s.target !== 'SELF' && s.target !== 'NONE') return;
    if (s.itemId && have && rkNum(have(s.itemId)) < Math.max(1, s.itemCount)) return;
    if (want && s.name.toLowerCase().includes(want) && (!pref || s.mlvl > pref.mlvl)) pref = s;
    if (!best || s.mlvl > best.mlvl || (s.mlvl === best.mlvl && (s.level > best.level || (s.level === best.level && s.mp > best.mp)))) best = s;
  });
  return pref || best;
}
/** every servitor summon I know (also the ones I cannot afford now): for the consumable need */
function rkSummonSkills(list) { return (list || []).map(rkSkill).filter(s => s.id && s.active && !s.toggle && /^Summon /i.test(s.name) && !RK_SUMMON_NOT.test(s.name) && (!s.target || s.target === 'SELF' || s.target === 'NONE')); }
/** the consumable my best summon needs: { id, perSummon, want, below } | null (want = enough for summon.resummons summons + the upkeep margin) */
function rkSummonConsumable(list, cfg) {
  const c = Object.assign({}, ROLEKIND.summon, cfg || {});
  const all = rkSummonSkills(list).filter(s => s.itemId);
  if (!all.length) return null;
  const s = all.sort((a, b) => b.mlvl - a.mlvl || b.level - a.level)[0], per = Math.max(1, s.itemCount);
  return { id: s.itemId, skill: s.name, perSummon: per, want: per * c.resummons + c.upkeepMargin, below: per * c.lowSummons + Math.ceil(c.upkeepMargin / 2) };
}
const RK_SERVITOR_TT = /^(SUMMON|PET|SERVITOR)$/;
/** my skills FOR the servitor (TargetType SUMMON, or the 'Servitor ...' names): { heal: [], recharge: [], cure: [], buffs: [] } */
function rkServitorSkills(list) {
  const out = { heal: [], recharge: [], cure: [], buffs: [] };
  (list || []).forEach(s0 => {
    const s = rkSkill(s0);
    if (!s.id || !s.active || s.toggle || s.debuff) return;
    if (!(RK_SERVITOR_TT.test(s.target) || /\bservitor\b/i.test(s.name))) return;
    if (/^Summon /i.test(s.name) || /golem/i.test(s.name)) return;
    if (/recharge/i.test(s.name)) out.recharge.push(s);
    else if (/\bheal\b|healing/i.test(s.name)) out.heal.push(s);
    else if (/cure|purify|cleanse/i.test(s.name)) out.cure.push(s);
    else if (s.ab && s.time > 0) out.buffs.push(s);
  });
  const ord = (a) => a.sort((x, y) => y.mlvl - x.mlvl || y.level - x.level);
  Object.keys(out).forEach(k => ord(out[k]));
  return out;
}
/** what the summoner does for its servitor now: { skill, why } | null. pet: { hp, mp, dead, buffs: { AB: {remain, level} }, debuffed }, me: { hp }.
 *  Order: servitor heal below petHealBelow (before my own heal unless I am in danger: me.hp < selfDangerHp), recharge below petMpBelow,
 *  cure when debuffed, missing servitor buffs (same rules as party buffs: never over a stronger one). */
function rkServitorCare(sk, pet, me, cfg) {
  const c = Object.assign({}, ROLEKIND.summon, cfg || {}), S = sk || {}; me = me || {};
  if (!pet || pet.dead) return null;
  if (me && rkNum(me.hp) > 0 && rkNum(me.hp) < c.selfDangerHp) return null;   // I am in danger: my own heal / potion first
  const ready = (a) => (a || []).find(s => s.ready !== false && (me.mp === undefined || s.mp <= rkNum(me.mp)));
  if (rkNum(pet.hp) < c.petHealBelow) { const k = ready(S.heal); if (k) return { skill: k, why: `servitor HP ${Math.round(rkNum(pet.hp))}%` }; }
  if (pet.mp !== undefined && rkNum(pet.mp) < c.petMpBelow) { const k = ready(S.recharge); if (k) return { skill: k, why: `servitor MP ${Math.round(rkNum(pet.mp))}%` }; }
  if (pet.debuffed) { const k = ready(S.cure); if (k) return { skill: k, why: 'servitor debuffed' }; }
  for (const k of S.buffs || []) { if (k.ready === false || (me.mp !== undefined && k.mp > rkNum(me.mp))) continue; const n = rkBuffNeed(k, { buffs: pet.buffs || {} }); if (n) return { skill: k, why: `servitor buff ${k.name} ${n}` }; }
  return null;
}
/** whom the servitor attacks: an objId, 'stop' (call it back: regroup / teleport / escape / flee) or 0 (nothing: it never pulls on its own).
 *  o: { retreat, raid, raidPulled, raidFocus, instFocus, onHealer, leaderTarget, onMe, onPet } */
function rkServitorTarget(o) {
  const c = o || {};
  if (c.retreat) return 'stop';
  if (c.raid) return c.raidPulled ? (rkNum(c.raidFocus) || rkNum(c.onHealer) || rkNum(c.onPet) || rkNum(c.onMe) || 0) : (rkNum(c.onPet) || rkNum(c.onMe) || 0);   // raid rules: nothing before the pull but self-defence
  return rkNum(c.instFocus) || rkNum(c.onHealer) || rkNum(c.leaderTarget) || rkNum(c.onPet) || rkNum(c.onMe) || 0;
}
/** THE SERVITOR'S OWN SKILLS: L2Swarm can read them (L2PartyPet.Skills) but has no cast packet for them; the client casts them with
 *  RequestActionUse(action) and the server maps action -> skill (Scripts/data/servitor_actions.json from L2J RequestActionUse.java).
 *  table: [{ action, servitor, skill, owner, pet }], petSkills: the servitor's L2Skill list -> [{ action, s (rkSkill), use: 'attack'|'aoe'|
 *  'debuff'|'buff'|'heal'|'recharge', owner }] — only actions whose skill the servitor really has now (it learns them with its level). */
function rkServitorActions(table, petName, petSkills) {
  const sk = (petSkills || []).map(rkSkill).filter(s => s.id && s.active !== false && !s.toggle);
  const pn = String(petName || '').trim().toLowerCase(), out = [], low = (x) => String(x || '').toLowerCase();
  const nameFits = (a) => !pn || !a.servitor || pn.includes(low(a.servitor)) || low(a.servitor).includes(pn);
  sk.forEach(s => {
    const rows = (table || []).filter(a => a && !a.pet && low(a.skill) === low(s.name));   // pets (wolves, striders) are not servitors
    if (!rows.length) return;
    const a = rows.find(nameFits) || (rows.length === 1 ? rows[0] : null);   // the same skill name on several servitors: the servitor's name decides
    if (!a) return;
    const enemy = /^(ENEMY|ENEMY_ONLY|TARGET|)$/.test(s.target) && !a.owner;
    const use = /recharge/i.test(s.name) ? 'recharge' : (/heal|sacrifice/i.test(s.name) && !enemy) ? 'heal'
      : (!enemy || a.owner) ? ((s.ab && s.time > 0) ? 'buff' : 'heal')
      : s.debuff && s.ab && s.time > 0 && !/stun|hold|blow|strike|slash|bang|wave|kaboom|death/i.test(s.name) ? 'debuff'
      : (s.scope && s.scope !== 'SINGLE') ? 'aoe' : 'attack';
    out.push({ action: Number(a.action), s, use, owner: !!a.owner });
  });
  return out;
}
/** which servitor skill to use now: { action, why } | null. o: { acts (rkServitorActions + .ready), fighting (the servitor attacks a live focus),
 *  mobsAtTarget, worth (raid boss / long fight: debuffs), owner: { hp, mp, buffs }, last: { action: at }, now, gapMs } */
function rkServitorSkillPick(o) {
  const c = o || {}, t = rkNum(c.now), gap = rkNum(c.gapMs) || 3000, own = c.owner || {};
  const free = (a) => a.ready !== false && !(c.last && c.last[a.action] && t - c.last[a.action] < gap);
  const acts = (c.acts || []).filter(free);
  const f = (use) => acts.filter(a => a.use === use).sort((x, y) => y.s.mlvl - x.s.mlvl || y.s.level - x.s.level)[0];
  let a = null;
  if (rkNum(own.hp) > 0 && rkNum(own.hp) < 60 && (a = f('heal'))) return { action: a.action, why: `${a.s.name}: summoner HP ${Math.round(rkNum(own.hp))}%` };
  if (own.mp !== undefined && rkNum(own.mp) < 40 && (a = f('recharge'))) return { action: a.action, why: `${a.s.name}: summoner MP ${Math.round(rkNum(own.mp))}%` };
  for (const b of acts.filter(x => x.use === 'buff')) if (rkBuffNeed(b.s, { buffs: own.buffs || {} })) return { action: b.action, why: `${b.s.name}: buff on the summoner` };
  if (!c.fighting) return null;
  if (rkNum(c.mobsAtTarget) >= 3 && (a = f('aoe'))) return { action: a.action, why: `${a.s.name}: ${rkNum(c.mobsAtTarget)} monsters` };
  if (c.worth && (a = f('debuff'))) return { action: a.action, why: `${a.s.name}: debuff on the target` };
  if ((a = f('attack'))) return { action: a.action, why: `${a.s.name}: attack` };
  return null;
}
/** archer spacing: a monster close to me that a TEAMMATE holds -> step back to `want` from it. o: { me: {x,y}, mobs: [{ x, y, on: 'me'|'mate'|'none' }], cfg }
 *  null = stay (nothing close, or it fights ME: stepping back does not help, the tank takes it) */
function rkArcherStep(o) {
  const c = Object.assign({}, ROLEKIND.archer, (o && o.cfg) || {}), me = (o && o.me) || { x: 0, y: 0 };
  const d = (m) => Math.hypot(m.x - me.x, m.y - me.y);
  const close = ((o && o.mobs) || []).filter(m => d(m) < c.tooClose);
  if (!close.length || close.some(m => m.on === 'me')) return null;
  const held = close.filter(m => m.on === 'mate'); if (!held.length) return null;
  const cx = held.reduce((a, m) => a + m.x, 0) / held.length, cy = held.reduce((a, m) => a + m.y, 0) / held.length;
  let dx = me.x - cx, dy = me.y - cy, L = Math.hypot(dx, dy); if (L < 1) { dx = 1; dy = 0; L = 1; }
  return { x: Math.round(cx + dx / L * c.want), y: Math.round(cy + dy / L * c.want), why: `${held.length} monster(s) held by a teammate within ${Math.round(Math.min(...held.map(d)))}` };
}
// BOARD BUFFS OPTIONAL (public kit user 2026-10-10: "old school playstyle, all needed chars in party, NOT relying on community buffs"):
// swarm.config.json "boardBuffs": true | false (default true = L2Toggle Community Board buffs, today's behaviour) and per party on the party
// LEADER's account entry ("boardBuffs": false on the leader = the whole party). Party = the leader's character name.
function rkBoardBuffs(cfg, party) {
  const c = cfg || {}, p = String(party || '');
  const acc = (c.accounts || []).find(a => a && String(a.character || '') === p && typeof a.boardBuffs === 'boolean');
  if (acc) return acc.boardBuffs;
  return typeof c.boardBuffs === 'boolean' ? c.boardBuffs : true;
}
/** who keeps party buffs up: 'fill' = a generic buffer next to the board (only what the board lacks) | 'primary' = no board buffs: the party's own
 *  buffers are the buff source (priority over damage, mana potions, before pulls) | 'healer-idle' = no board: a healer buffs when nobody is hurt | '' */
function rkUpkeepRole(token, board) {
  const t = String(token || ''), k = rkKindOf(t);
  if (ROLE_RE.bufferUp.test(t)) return board ? 'fill' : 'primary';
  if (board) return '';                                       // board buffs on: legacy roles exactly as before (no upkeep)
  if (k === 'buffer') return 'primary';                       // doomcryer / inspector without board buffs
  if (k === 'healer') return 'healer-idle';                   // Bishop / Elder / Shillien Elder buffs between heals
  return '';
}
/** self buffs / toggles allowed? (CLAUDE.md rule: not over board buffs — only when the board is used for this party) */
function rkSelfBuffsAllowed(board, needsBoardBuff) { return !board || !!needsBoardBuff; }
// ROLEKIND-PURE-END

// BUFFPLAN-PURE-BEGIN (no host calls in here: docs/plan/tools/test_buff_plans.js runs this block in node; Dashboard/bufflogic.js = text copy)
const BUFFPLAN = {
  targetWords: ['party', 'fighters', 'mages', 'self', 'tank', 'servitors'],   // servitors = the summoners' servitors (pseudo members '<owner>:pet')
  // songDanceMax: the server's song/dance slots (L2Toggle 14); gather*: songs / dances only with the party near; rot*: cycle step timing;
  // cycleExpiredPct: a new full song/dance cycle starts when this share of the set has expired on most gathered members; cycleMp*: MP estimate
  // for a cycle (+ step % per song/dance already up, + margin), cycleMpWaitMs: max wait for MP before starting with what we have
  settings: { songDanceMax: 14, gatherPct: 60, gatherRange: 1000, rotGapMs: 1500, rotTakeoverMs: 7000, rotMinMpPct: 20,
              cycleExpiredPct: 60, cycleMpStepPct: 10, cycleMpMarginPct: 10, cycleMpWaitMs: 60000 },
  status: ['ok', 'suggested', 'missing', 'invalid', 'none'],
};
function bpNorm(s) { return String(s || '').trim().toLowerCase().replace(/[’`]/g, "'").replace(/\s+/g, ' '); }
function bpSettings(file) { return Object.assign({}, BUFFPLAN.settings, (file && file.settings) || {}); }
/** the plan entry of one character: { entry, party } | null */
function bpEntry(file, party, name) {
  const p = file && file.parties && file.parties[party];
  const e = p && p.chars && p.chars[name];
  return e && typeof e === 'object' ? e : null;
}
/** which members a target list means. members: [{ name, caster, tank, me }] -> [names] */
function bpTargets(targets, members, me) {
  const out = [], add = (n) => { if (n && !out.includes(n)) out.push(n); };
  const list = Array.isArray(targets) && targets.length ? targets : ['party'];
  list.forEach(t0 => {
    const t = bpNorm(t0);
    (members || []).forEach(m => {
      if (m.pet) { if (t === 'servitors' || bpNorm(m.name) === t) add(m.name); return; }   // a servitor only by 'servitors' or its own name
      if (t === 'party') add(m.name);
      else if (t === 'fighters' && !m.caster) add(m.name);
      else if (t === 'mages' && m.caster) add(m.name);
      else if (t === 'self' && (m.me || m.name === me)) add(m.name);
      else if (t === 'tank' && m.tank) add(m.name);
      else if (bpNorm(m.name) === t) add(m.name);
    });
  });
  return out;
}
/** checks one plan entry against the character's known buff skills (classified: { party, target } from rkClassifyBuffs) */
function bpValidate(entry, skills, memberNames) {
  const errors = [], warnings = [];
  if (!entry || typeof entry !== 'object') return { ok: false, errors: ['no plan'], warnings };
  const known = [].concat((skills && skills.party) || [], (skills && skills.target) || []);
  const have = (b) => known.find(s => (b.id && Number(b.id) === s.id) || bpNorm(b.skill) === bpNorm(s.name));
  const seen = {};
  (entry.buffs || []).forEach((b, i) => {
    if (!b || (!b.skill && !b.id)) { errors.push(`buff ${i + 1}: no skill`); return; }
    const k = bpNorm(b.skill || b.id); if (seen[k]) warnings.push(`${b.skill || b.id}: listed twice`); seen[k] = true;
    if (known.length && !have(b)) warnings.push(`${b.skill || b.id}: not learned (yet) — skipped until it is`);
    (Array.isArray(b.targets) ? b.targets : []).forEach(t => {
      const w = bpNorm(t);
      if (!BUFFPLAN.targetWords.includes(w) && memberNames && !memberNames.some(n => bpNorm(n) === w)) warnings.push(`${b.skill || b.id}: target '${t}' is not in this party`);
    });
  });
  bpRotEntries(entry.rotation).forEach(r => { if (known.length && !known.some(s => bpNorm(s.name) === bpNorm(r.name))) warnings.push(`rotation: ${r.name} not learned (yet)`); });
  return { ok: !errors.length, errors, warnings };
}
const BP_FIGHTER = /^(PA_UP|ATTACK_TIME_DOWN|CRITICAL_PROB_UP|CRITICAL_DMG_UP|HIT_UP|BERSERKER|VAMPIRIC_ATTACK|DANCE_OF_FURY|DANCE_OF_WARRIOR|DANCE_OF_FIRE|DANCE_OF_VAMPIRE)$/;
const BP_MAGE = /^(MA_UP|CASTING_TIME_DOWN|MAGIC_CRITICAL_UP|CANCEL_PROB_DOWN|MAX_MP_UP|MP_REGEN_UP|DANCE_OF_MYSTIC|DANCE_OF_CONCENTRATION|DANCE_OF_SIREN)$/;
/** who benefits from a buff type: 'fighters' | 'mages' | 'party' */
function bpBenefit(ab) { const a = String(ab || '').toUpperCase(); return BP_FIGHTER.test(a) ? 'fighters' : BP_MAGE.test(a) ? 'mages' : 'party'; }
/** a SUGGESTED plan from the character's own skills (never approved by itself) */
function bpSuggest(skills) {
  const buffs = [], rotation = [];
  ((skills && skills.party) || []).forEach(s => { if (rkIsSongDance(s)) rotation.push(s.name); else buffs.push({ skill: s.name, id: s.id, targets: ['party'], priority: 2, keep: true }); });
  ((skills && skills.target) || []).forEach(s => buffs.push({ skill: s.name, id: s.id, targets: [bpBenefit(s.ab)], priority: 3, keep: true }));
  return { buffs, rotation, suggested: true };
}
/** the plan that runs: { status: 'ok'|'suggested'|'invalid'|'none', plan, why }. A saved plan needs approved: true; a saved plan that is not
 *  approved yet does not run (status 'suggested' with the suggestion running, like no plan). */
function bpEffective(entry, skills, memberNames) {
  if (entry && entry.approved) {
    const v = bpValidate(entry, skills, memberNames);
    if (!v.ok) return { status: 'invalid', plan: bpSuggest(skills), why: v.errors.join('; '), warnings: v.warnings };
    return { status: 'ok', plan: { buffs: (entry.buffs || []).slice(), rotation: (entry.rotation || []).slice() }, why: 'approved plan', warnings: v.warnings };
  }
  const s = bpSuggest(skills);
  if (!s.buffs.length && !s.rotation.length) return { status: 'none', plan: s, why: 'no party buffs learned', warnings: [] };
  return { status: 'suggested', plan: s, why: entry ? 'saved but not approved: the suggestion runs' : 'no plan: the suggestion runs (not reviewed)', warnings: [] };
}
/** HOW the plan runs (user decision 2026-10-10): 'full' | 'fill' | ''.
 *  - a SAVED + approved plan always wins: 'full' (its buffs + its song/dance cycles; a stronger buff of the same type is never overwritten);
 *  - NO plan (or saved but not approved / invalid) = the SUGGESTION from the character's own skills, status 'suggested' (dashboard: animated
 *    "buff plan not reviewed" badge): with boardBuffs FALSE for the party it runs right away ('full'); with boardBuffs TRUE it only fills what
 *    the board lacks ('fill': missing types only, no song/dance cycles) = the behaviour before buff plans;
 *  - nothing learned: ''. */
function bpRuns(eff, board) {
  if (!eff || eff.status === 'none') return '';
  if (eff.status === 'ok') return 'full';
  return board ? 'fill' : 'full';
}
/** my skills that the plan allows, each with .who = [member names] and .priority (lower first); rotation skills are left out (the cycle) */
function bpPlanSkills(plan, skills, members, me) {
  const known = [].concat(((skills && skills.party) || []).map(s => Object.assign({ kind: 'party' }, s)), ((skills && skills.target) || []).map(s => Object.assign({ kind: 'target' }, s)));
  const rot = bpRotEntries(plan && plan.rotation).filter(r => !r.keepAlways).map(r => bpNorm(r.name));   // keepAlways songs / dances: per-buff upkeep
  const out = { party: [], target: [] };
  ((plan && plan.buffs) || []).forEach((b, i) => {
    if (b && b.keep === false) return;
    const s = known.find(k => (b.id && Number(b.id) === k.id) || bpNorm(b.skill) === bpNorm(k.name));
    if (!s || rot.includes(bpNorm(s.name))) return;
    const x = Object.assign({}, s, { who: bpTargets(b.targets, members, me), priority: Number(b.priority) || (i + 1) });
    (s.kind === 'party' ? out.party : out.target).push(x);
  });
  // a song / dance marked keepAlways is kept up on its own between cycles (per-buff upkeep, like a party buff)
  bpRotEntries(plan && plan.rotation).filter(r => r.keepAlways).forEach((r, i) => { const s = known.find(k => k.kind === 'party' && bpNorm(k.name) === bpNorm(r.name)); if (s) out.party.push(Object.assign({}, s, { who: bpTargets(['party'], members, me), priority: 50 + i, keepAlways: true })); });
  out.party.sort((a, b) => a.priority - b.priority); out.target.sort((a, b) => a.priority - b.priority);
  return out;
}
/** OVERLAP: several buffers put the same abnormal type on the same member -> one owner (the higher abnormal level, then the higher magic level,
 *  then the name). offers: [{ by, ab, abLvl, mlvl, who: [names] }] -> { owner: { 'member|AB': by }, overlaps: [{ member, ab, by: [...], winner }] } */
function bpOwners(offers) {
  const owner = {}, cand = {};
  (offers || []).forEach(o => (o.who || []).forEach(m => { const k = m + '|' + String(o.ab || '').toUpperCase(); (cand[k] = cand[k] || []).push(o); }));
  const overlaps = [];
  Object.keys(cand).forEach(k => {
    const list = cand[k].slice().sort((a, b) => (Number(b.abLvl) || 0) - (Number(a.abLvl) || 0) || (Number(b.mlvl) || 0) - (Number(a.mlvl) || 0) || String(a.by).localeCompare(String(b.by)));
    owner[k] = list[0].by;
    const bys = Array.from(new Set(list.map(x => x.by)));
    if (bys.length > 1) { const [member, ab] = k.split('|'); overlaps.push({ member, ab, by: bys, winner: list[0].by }); }
  });
  return { owner, overlaps };
}
/** is the party gathered for a song / dance (it reaches only who is near): enough alive members within range of me */
function bpGathered(members, cfg) {
  const c = Object.assign({}, BUFFPLAN.settings, cfg || {});
  const alive = (members || []).filter(m => !m.dead);
  if (alive.length <= 1) return true;
  const near = alive.filter(m => m.me || (Number(m.dist) || 0) <= c.gatherRange).length;
  return near * 100 >= alive.length * c.gatherPct;
}
/** SONG / DANCE CYCLES (user 2026-10-10: "songs and dances cost more and more the more you have up, so normally you cast them all; as soon as
 *  they run out you start dancing and singing again"). NOT a per-song top-up: a FULL CYCLE = the whole planned set back to back (dance, song,
 *  dance, song ... when the party has dancers and singers), then WAIT while they run, and the next full cycle once most of the set expired
 *  (settings.cycleExpiredPct). A song / dance marked keepAlways in the plan is the only one kept up on its own (per-buff upkeep).
 *  Rotation entries: 'Dance of Fire' or { skill: 'Dance of Fire', keepAlways: true }. */
function bpRotName(r) { return typeof r === 'string' ? r : String((r && (r.skill || r.name)) || ''); }
function bpRotEntries(rotation) { return (rotation || []).map(r => ({ name: bpRotName(r), keepAlways: !!(r && typeof r === 'object' && r.keepAlways) })).filter(r => r.name); }
/** the cycle order. casters: [{ name, kind: 'dance'|'song', list: [skill names in the user's order] }] -> [{ by, skill }]
 *  inside each kind round robin over the casters (dancer A step 1, dancer B step 1, A step 2 ...); both kinds: dance, song, dance, song ... */
function bpCycleSeq(casters) {
  const rr = (cs) => { const out = [], n = Math.max(0, ...cs.map(c => (c.list || []).length)); for (let i = 0; i < n; i++) cs.forEach(c => { if ((c.list || [])[i]) out.push({ by: c.name, skill: c.list[i] }); }); return out; };
  const by = (k) => (casters || []).filter(c => c.kind === k).slice().sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const D = rr(by('dance')), S = rr(by('song')), seq = [];
  for (let i = 0; i < Math.max(D.length, S.length); i++) { if (D[i]) seq.push(D[i]); if (S[i]) seq.push(S[i]); }
  return seq;
}
/** is a new cycle due? types = the abnormal types of the whole set; members = gathered members with buffs. A type counts as expired when it is
 *  gone / about to run out on most of the gathered members. due = expired share >= cycleExpiredPct. -> { due, expired, total } */
function bpCycleDue(types, members, cfg) {
  const c = Object.assign({}, ROLEKIND.buff, BUFFPLAN.settings, cfg || {});
  const near = (members || []).filter(m => !m.dead && m.known !== false && (m.me || (Number(m.dist) || 0) <= c.gatherRange));
  const list = Array.from(new Set((types || []).map(t => String(t || '').toUpperCase()).filter(Boolean)));
  if (!list.length || !near.length) return { due: false, expired: 0, total: list.length };
  let expired = 0;
  list.forEach(t => {
    const gone = near.filter(m => { const b = (m.buffs || {})[t]; return !b || (rkNum(b.remain) > 0 && rkNum(b.remain) <= c.refreshSec); }).length;
    if (gone * 2 > near.length) expired++;
  });
  return { due: expired * 100 >= list.length * c.cycleExpiredPct, expired, total: list.length };
}
/** MP for my part of a cycle: each song / dance costs more the more are already up (estimate: + cycleMpStepPct % of its base cost per song /
 *  dance already running; the client data has no exact number) plus cycleMpMarginPct. mps = my steps' base MP in cycle order, upBefore = how
 *  many of the whole cycle are up before each of my steps (array, same length; default = its position in my list) */
function bpCycleMp(mps, upBefore, cfg) {
  const c = Object.assign({}, BUFFPLAN.settings, cfg || {});
  let sum = 0; (mps || []).forEach((mp, i) => { const up = upBefore && upBefore[i] !== undefined ? Number(upBefore[i]) : i; sum += (Number(mp) || 0) * (1 + up * c.cycleMpStepPct / 100); });
  return Math.ceil(sum * (1 + c.cycleMpMarginPct / 100));
}
/** what I do now in the cycle. token: { cycle, step, at, phase: 'run'|'done' } (shared by App events), seq = bpCycleSeq(...),
 *  casters: [{ name, ok (alive, gathered), mpOk (MP for my part) }], due = bpCycleDue(...).due, waitedMs = how long the start already waits for MP.
 *  -> { act: 'start'|'cast'|'skip'|'wait'|'idle', step, skill, why } */
function bpCycleStep(token, seq, casters, now, me, due, waitedMs, cfg) {
  const c = Object.assign({}, BUFFPLAN.settings, cfg || {}), t = token || {}, n = (seq || []).length;
  const info = (name) => (casters || []).find(x => x.name === name) || { ok: false, mpOk: false };
  if (!n) return { act: 'idle', why: 'no songs / dances planned' };
  const running = t.phase === 'run' && Number(t.step) < n;
  if (!running) {
    if (!due) return { act: 'idle', why: 'the set is still running (no partial recasts)' };
    const order = Array.from(new Set(seq.map(s => s.by)));
    const starter = order.find(nm => info(nm).ok);
    if (starter !== me) return { act: 'idle', why: `cycle due: ${starter || 'nobody'} starts it` };
    const allMp = order.every(nm => !info(nm).ok || info(nm).mpOk);
    if (!allMp && (Number(waitedMs) || 0) < c.cycleMpWaitMs) return { act: 'wait', why: 'cycle due: waiting for MP (mana potion / rest) first' };
    return { act: 'start', step: 0, skill: seq[0].by === me ? seq[0].skill : '', why: allMp ? 'cycle due: starting' : 'cycle due: starting with the MP we have' };
  }
  const st = seq[Number(t.step)], age = (Number(now) || 0) - (Number(t.at) || 0);
  if (st.by === me) {
    if (age < c.rotGapMs) return { act: 'wait', step: Number(t.step), why: 'next step soon' };
    return { act: 'cast', step: Number(t.step), skill: st.skill, why: `cycle step ${Number(t.step) + 1}/${n}` };
  }
  if (age > c.rotTakeoverMs || !info(st.by).ok) {             // its caster cannot (dead / far / no MP) or took too long: the next caster skips it
    const nxt = seq.slice(Number(t.step) + 1).find(s => info(s.by).ok);
    if (nxt && nxt.by === me) return { act: 'skip', step: Number(t.step), why: `${st.by} did not cast ${st.skill}: skipping it` };
  }
  return { act: 'idle', step: Number(t.step), why: `${st.by}'s turn (${st.skill})` };
}
/** the status line for the dashboard: { status, missing: { member: [ab...] } } from the plan's skills and the members' buffs */
function bpMissing(planSkills, members) {
  const out = {};
  [].concat((planSkills && planSkills.party) || [], (planSkills && planSkills.target) || []).forEach(s => (members || []).forEach(m => {
    if (m.dead || (s.who && !s.who.includes(m.name))) return;
    if (rkBuffNeed(s, m) === 'missing') (out[m.name] = out[m.name] || []).push(s.name);
  }));
  return out;
}
/** a party as a template (by class name) and a template applied to a party (only characters whose class has an entry; others untouched).
 *  chars: [{ name, cls }] ; entries: { name: entry } */
function bpTemplateFromParty(chars, entries) {
  const classes = {};
  (chars || []).forEach(c => { const e = entries && entries[c.name]; if (e && c.cls && !classes[c.cls]) classes[c.cls] = { buffs: (e.buffs || []).map(b => Object.assign({}, b, { targets: (b.targets || []).filter(t => BUFFPLAN.targetWords.includes(bpNorm(t))) })), rotation: (e.rotation || []).slice() }; });
  return { classes };
}
function bpTemplateApply(tpl, chars) {
  const out = {};
  (chars || []).forEach(c => { const e = tpl && tpl.classes && (tpl.classes[c.cls] || tpl.classes[Object.keys(tpl.classes).find(k => bpNorm(k) === bpNorm(c.cls))]); if (e) out[c.name] = { approved: false, buffs: (e.buffs || []).map(b => Object.assign({}, b)), rotation: (e.rotation || []).slice() }; });
  return out;
}
// BUFFPLAN-PURE-END

  return { ROLEKIND, ROLE_RE, BUFFPLAN, rkNum, rkClassRow, rkKindOfClass, rkStyleOfClass, rkKindOf, rkResolve, rkIsLegacy, rkBehaviour, rkSkill,
    rkClassifyBuffs, rkIsSongDance, rkBuffNeed, rkBufferPick, rkBoardBuffs, rkUpkeepRole,
    bpNorm, bpSettings, bpEntry, bpTargets, bpValidate, bpBenefit, bpSuggest, bpEffective, bpRuns, bpPlanSkills, bpOwners, bpGathered,
    bpMissing, bpTemplateFromParty, bpTemplateApply, bpRotName, bpRotEntries, bpCycleSeq, bpCycleDue, bpCycleMp, bpCycleStep };
});
