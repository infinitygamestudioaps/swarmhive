// CASTER PRIMARY SKILLS (user 2026-10-09 10:15): "Whenever casters reach a new class they gain a new skill, and that skill ~99% of the time
// takes over as the primary attack skill." Built from the L2J High Five datapack on disk (Scripts/data/dp/classSkillTree.xml = the class
// skill trees with getLevel per class id + parentClassId; Scripts/data/dp/skills/*.xml = skill definitions: element, scope, reuse, effects).
//   node docs/plan/tools/caster_primary.js          -> Scripts/data/caster_primary.json + docs/plan/caster_skills.md
// Roles per skill of a caster class line (parents included, learnLevel = the first level the line can learn it):
//   primary  : single-target magic nuke of the LINE's element, reuse <= 3 s, cast range >= 600, no side effect, no condition.
//              swarm.js casts the KNOWN primary with the HIGHEST learnLevel first (= the one that came with the latest class), the
//              older primaries are the fallbacks for cooldown / MP / range.
//   fallback : every other single-target damage spell (kind nuke | nuke+debuff | drain | deathlink | burst = 5-min nukes)
//   aoe      : area damage (cast only when 3+ monsters stand at the target, the old aoe rule)
//   debuff   : vortex (3rd class 77+), combo (needs the vortex on the target), surrender (team element, see swarm.js TEAM SURRENDER)
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const DP = path.join(ROOT, 'Scripts', 'data', 'dp');
const tree = fs.readFileSync(path.join(DP, 'classSkillTree.xml'), 'utf8');
const classNames = JSON.parse(fs.readFileSync(path.join(ROOT, 'Dashboard', 'data', 'classes.json'), 'utf8'));

// class line element + kind. Element = the line's own nuke element (verified from the trees below: every primary must match it).
const LINES = {
  10: ['wind', 'base'], 25: ['wind', 'base'], 38: ['wind', 'base'],                                   // base mystics: Wind Strike only
  11: ['fire', 'nuker'], 12: ['fire', 'nuker'], 94: ['fire', 'nuker'],                                // Wizard -> Sorcerer -> Archmage
  13: ['dark', 'nuker'], 95: ['dark', 'nuker'],                                                       // Necromancer -> Soultaker
  14: ['fire', 'summoner'], 96: ['fire', 'summoner'],                                                 // Warlock -> Arcana Lord
  26: ['water', 'nuker'], 27: ['water', 'nuker'], 103: ['water', 'nuker'],                            // Elven Wizard -> Spellsinger -> Mystic Muse
  28: ['water', 'summoner'], 104: ['water', 'summoner'],                                              // Elemental Summoner -> Elemental Master
  39: ['wind', 'nuker'], 40: ['wind', 'nuker'], 110: ['wind', 'nuker'],                              // Dark Wizard -> Spellhowler -> Storm Screamer
  41: ['dark', 'summoner'], 111: ['dark', 'summoner'],                                                // Phantom Summoner -> Spectral Master
  15: ['', 'healer'], 16: ['', 'healer'], 97: ['', 'healer'], 29: ['', 'healer'], 30: ['', 'healer'], 105: ['', 'healer'],
  42: ['', 'healer'], 43: ['', 'healer'], 112: ['', 'healer'],                                        // healers never attack (healer rule)
  17: ['', 'buffer'], 98: ['', 'buffer'],                                                             // Prophet / Hierophant
  49: ['', 'buffer'], 50: ['', 'buffer'], 51: ['', 'buffer'], 115: ['', 'buffer'], 52: ['', 'buffer'], 116: ['', 'buffer'],   // orc mystics
  125: ['dark', 'hybrid'], 126: ['dark', 'hybrid'], 128: ['dark', 'hybrid'], 129: ['dark', 'hybrid'],
  132: ['dark', 'hybrid'], 133: ['dark', 'hybrid'], 135: ['dark', 'hybrid'], 136: ['dark', 'hybrid'], // kamael soul lines
};
const NOTES = {
  summoner: 'servitor class: its own nukes are secondary to the servitor (the servitor is not automated by these lists)',
  healer: 'healer: never attacks (swarm.js healer rule) - listed for information only',
  buffer: 'buffer: no primary nuke; its offensive spells are fallbacks only',
  hybrid: 'kamael: physical skills first (inspector role), then these soul nukes; doombringer/berserker roles never cast magic',
  base: 'base mystic: Wind Strike until the 1st class change',
};

// ---- class trees (parents inherited) ----
const trees = {};
for (const m of tree.matchAll(/<skillTree type="classSkillTree" classId="(\d+)"(?: parentClassId="(\d+)")?>([\s\S]*?)<\/skillTree>/g)) {
  const sk = [];
  for (const s of m[3].matchAll(/skillName="([^"]*)" skillId="(\d+)" skillLvl="(\d+)" getLevel="(\d+)"/g)) sk.push({ name: s[1], id: +s[2], lvl: +s[3], get: +s[4] });
  trees[m[1]] = { parent: m[2], sk };
}
// ---- skill definitions ----
const defs = {};
for (const f of fs.readdirSync(path.join(DP, 'skills'))) {
  const x = fs.readFileSync(path.join(DP, 'skills', f), 'utf8');
  for (const m of x.matchAll(/<skill id="(\d+)" levels="(\d+)" name="([^"]*)"[^>]*>([\s\S]*?)<\/skill>/g)) defs[m[1]] = { name: m[3], body: m[4] };
}
const EL = { FIRE: 'fire', WATER: 'water', WIND: 'wind', EARTH: 'earth', HOLY: 'holy', UNHOLY: 'dark' };
function info(id) {
  const d = defs[id]; if (!d) return null;
  const b = d.body.replace(/<enchant\d+Effects>[\s\S]*?<\/enchant\d+Effects>/g, '').replace(/<enchant\d+ [^>]*>/g, '');
  const table = (n) => { const r = new RegExp('<table name="' + n + '">([^<]*)<').exec(b); return r ? r[1].trim().split(/\s+/).map(Number) : null; };
  const set = (n) => { const r = new RegExp('<set name="' + n + '" val="([^"]*)"').exec(b); return r ? r[1] : ''; };
  const val = (v) => (v && v.startsWith('#')) ? table(v) : (v === '' ? null : [Number(v)]);
  const effects = [...b.matchAll(/<effect name="([^"]*)"/g)].map(e => e[1]);
  const cond = /<cond[\s\S]*?<\/cond>/.exec(b);
  const ml = val(set('magicLvl')) || [0], rng = val(set('castRange')) || [0];
  return {
    name: d.name, element: EL[set('attributeType')] || '', scope: set('affectScope') || 'SINGLE', target: set('targetType'), op: set('operateType'),
    reuse: Number(set('reuseDelay')) || 0, hit: Number(set('hitTime')) || 0, range: rng[rng.length - 1], abnormal: set('abnormalType'),
    maxMagicLvl: ml[ml.length - 1], effects, undeadOnly: !!(cond && /race="UNDEAD"/.test(cond[0])), needsAbnormal: !!(cond && /checkAbnormal|active_effect_id/.test(cond[0])),
  };
}
const DMG = /^(MagicalAttack|MagicalAttackRange|MagicalSoulAttack|MagicalAttackByAbnormal|InstantMagicalAttackOverHit|HpDrain|DeathLink)$/;   // not MagicalAttackMp (mana burn)
const SURRENDER = { 1074: 'wind', 1083: 'fire', 1071: 'water', 1223: 'earth', 1445: 'dark' };

function classify(id, s, lineEl, kind) {
  if (SURRENDER[id]) return { role: 'debuff', kind: 'surrender', element: SURRENDER[id] };
  if (!/^A[12]$/.test(s.op) || !s.effects.some(e => DMG.test(e))) return null;   // CA1 = channeled (Cyclone / Volcano ...): not automated
  if (!/^(ENEMY|ENEMY_ONLY|NPC_BODY|GROUND|SELF|#targetType)$/.test(s.target)) return null;
  if (s.undeadOnly) return null;                                         // Disrupt / Might of Heaven / Turn Undead: undead only
  const aoe = s.scope !== 'SINGLE';
  if (s.needsAbnormal) return { role: 'debuff', kind: 'combo', aoe };     // Wind Vortex Slug / Fire Vortex Buster / ...: only with the vortex on the target
  if (/^MULTI_DEBUFF/.test(s.abnormal)) return { role: 'debuff', kind: 'vortex', aoe };
  if (aoe) return { role: 'aoe', kind: s.target === 'NPC_BODY' ? 'corpse' : 'aoe', aoe };
  if (s.effects.includes('HpDrain')) return { role: 'fallback', kind: 'drain' };
  if (s.effects.includes('DeathLink')) return { role: 'fallback', kind: 'deathlink' };
  if (s.reuse >= 60000) return { role: 'fallback', kind: 'burst' };      // Demon Wind / Inferno / Blizzard / Elemental Assault ...: 5-min nukes
  const plain = !s.abnormal && s.reuse <= 3000 && s.range >= 600 && s.element && s.element === lineEl;
  if (plain && kind !== 'healer' && kind !== 'buffer') return { role: 'primary', kind: 'nuke' };
  return { role: 'fallback', kind: s.abnormal ? 'nuke+debuff' : 'nuke' };
}
const ROLE_ORDER = { primary: 0, fallback: 1, aoe: 2, debuff: 3 };
const KIND_ORDER = { nuke: 0, 'nuke+debuff': 1, burst: 2, drain: 3, deathlink: 4, aoe: 0, corpse: 1, vortex: 0, combo: 1, surrender: 2 };

const out = { _note: 'Generated by docs/plan/tools/caster_primary.js from Scripts/data/dp (L2J H5 datapack) - do not edit by hand. ' +
  'swarm.js: the known primary with the highest learnLevel first, the older primaries next, then fallbacks; aoe only with 3+ monsters at the target.', _meta: {} };
for (const cid of Object.keys(LINES).map(Number).sort((a, b) => a - b)) {
  const [lineEl, kind] = LINES[cid];
  const chain = []; let t = String(cid); while (t && trees[t]) { chain.unshift(t); t = trees[t].parent; }
  const first = {};
  chain.forEach(c => trees[c].sk.forEach(s => { if (!first[s.id] || s.get < first[s.id].get) first[s.id] = s; }));
  const rows = [];
  Object.keys(first).forEach(id => {
    const s = info(id); if (!s) return;
    const c = classify(Number(id), s, lineEl, kind); if (!c) return;
    rows.push({ skillId: Number(id), name: s.name, learnLevel: first[id].get, element: c.element || s.element, aoe: !!c.aoe || s.scope !== 'SINGLE',
      role: c.role, kind: c.kind, reuseMs: s.reuse, range: s.range, maxMagicLvl: s.maxMagicLvl });
  });
  // fallbacks: line element first, then the primaries of an ancestor line (Blaze = the Wizard's nuke, for the Necromancer), then reach >= 600, then newest
  const anc = {}; chain.slice(0, -1).forEach(c => { const le = (LINES[c] || [''])[0]; if (le && le !== lineEl) rows.forEach(r => { if (r.role === 'fallback' && r.kind === 'nuke' && r.element === le && r.reuseMs <= 3000 && r.range >= 600) anc[r.skillId] = true; }); });
  rows.forEach(r => { if (anc[r.skillId]) r.ancestorPrimary = true; });
  rows.sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || (KIND_ORDER[a.kind] || 0) - (KIND_ORDER[b.kind] || 0)
    || ((b.element === lineEl) - (a.element === lineEl)) || (!!b.ancestorPrimary - !!a.ancestorPrimary) || ((b.range >= 600) - (a.range >= 600))
    || b.learnLevel - a.learnLevel || a.skillId - b.skillId);
  out[cid] = rows;
  out._meta[cid] = { name: classNames[cid] || String(cid), element: lineEl, kind, chain: chain.map(Number), note: NOTES[kind] || '' };
}
fs.writeFileSync(path.join(ROOT, 'Scripts', 'data', 'caster_primary.json'), JSON.stringify(out, null, 1));

// ---- readable table ----
const LINE_GROUPS = [
  ['Human Mystic -> Wizard -> Sorcerer -> Archmage (fire)', [10, 11, 12, 94]], ['Wizard -> Necromancer -> Soultaker (dark)', [13, 95]],
  ['Wizard -> Warlock -> Arcana Lord (summoner)', [14, 96]], ['Human Mystic -> Cleric -> Bishop/Prophet (healer / buffer)', [15, 16, 97, 17, 98]],
  ['Elven Mystic -> Elven Wizard -> Spellsinger -> Mystic Muse (water)', [25, 26, 27, 103]], ['Elven Wizard -> Elemental Summoner -> Elemental Master (summoner)', [28, 104]],
  ['Elven Oracle -> Elder -> Eva\'s Saint (healer)', [29, 30, 105]],
  ['Dark Mystic -> Dark Wizard -> Spellhowler -> Storm Screamer (wind)', [38, 39, 40, 110]], ['Dark Wizard -> Phantom Summoner -> Spectral Master (summoner)', [41, 111]],
  ['Shillien Oracle -> Elder -> Saint (healer)', [42, 43, 112]], ['Orc Mystic -> Shaman -> Overlord/Warcryer -> Dominator/Doomcryer (buffer)', [49, 50, 51, 115, 52, 116]],
  ['Kamael Trooper/Warder -> Soul Breaker -> Soul Hound, Inspector -> Judicator (soul nukes)', [125, 126, 128, 129, 132, 133, 135, 136]],
];
const md = [];
md.push('# Caster attack skills per class line (H5)', '',
  'Generated by `node docs/plan/tools/caster_primary.js` from the L2J High Five datapack on disk (`Scripts/data/dp/classSkillTree.xml` = class skill trees with',
  '`getLevel` per class id and `parentClassId`; `Scripts/data/dp/skills/*.xml` = element, scope, reuse, effects). Machine copy: `Scripts/data/caster_primary.json`.', '',
  '**Rule (user 2026-10-09 10:15):** the new skill of each class change takes over as the primary attack. swarm.js casts the KNOWN **primary** with the',
  'highest learn level first; the older primaries are its fallbacks (cooldown / MP / range); then the other fallbacks (line element first, newest first).',
  'AoE only when 3+ monsters stand at the target. Drains move to the front below 60 % HP; 5-minute "burst" nukes only on long-lived targets (raid boss,',
  'minion, monster with lots of HP). Vortex/combo skills (77+) are not automated yet. Surrender = team element rule (one caster per party).', '',
  'Primary = single target, the line element, reuse <= 3 s, range >= 600, no side debuff, no condition.', '');
for (const [title, ids] of LINE_GROUPS) {
  md.push(`## ${title}`, '');
  for (const cid of ids) {
    const meta = out._meta[cid], rows = out[cid] || [];
    md.push(`### ${meta.name} (${cid})${meta.element ? ' - line element ' + meta.element : ''}${meta.note ? ' - ' + meta.note : ''}`, '');
    const prim = rows.filter(r => r.role === 'primary').sort((a, b) => b.learnLevel - a.learnLevel);
    md.push(`Primary chain: ${prim.length ? prim.map(r => `**${r.name}** (${r.learnLevel})`).join(' > ') : '(none)'}`, '');
    md.push('| Role | Kind | Skill | Id | Learn lvl | Element | Reuse s | Range |', '|---|---|---|---|---|---|---|---|');
    rows.forEach(r => md.push(`| ${r.role} | ${r.kind} | ${r.name} | ${r.skillId} | ${r.learnLevel} | ${r.element || '-'} | ${(r.reuseMs / 1000).toFixed(1)} | ${r.range || '-'} |`));
    md.push('');
  }
}
fs.writeFileSync(path.join(ROOT, 'docs', 'plan', 'caster_skills.md'), md.join('\n'));
console.log('wrote Scripts/data/caster_primary.json + docs/plan/caster_skills.md:', Object.keys(out._meta).length, 'classes');
for (const cid of [39, 40, 110, 11, 12, 94, 26, 27, 103, 13, 95, 128, 132]) {
  const prim = out[cid].filter(r => r.role === 'primary').sort((a, b) => b.learnLevel - a.learnLevel);
  console.log(String(cid).padStart(3), out._meta[cid].name.padEnd(22), prim.map(r => `${r.name}(${r.learnLevel})`).join(' > '));
}
