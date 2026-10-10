// OFFLINE TEST of the caster attack order + team Surrender (2026-10-09). Runs the CASTPRIO block of Scripts_dev/swarm.js in node:
//   node docs/plan/tools/test_caster_prio.js            (exit code 1 when a check fails; SWARM_SRC=<file> tests another copy)
// Covers: the primary chain per caster class from Scripts/data/caster_primary.json (built from the datapack class skill trees), the order on
// our casters' LIVE skill lists (snapshot 2026-10-09 from Logs/swarm_state_*.json 'ov'), drains / bursts at cast time, fighters unchanged,
// the team element (party Tank3, Tank2, Tank1, mixed teams), the Surrender caster choice, worth (never on trash), recast/expiry.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const SRC = process.env.SWARM_SRC || path.join(ROOT, 'Scripts_dev', 'swarm.js');
const src = fs.readFileSync(SRC, 'utf8');
const a = src.indexOf('// CASTPRIO-BEGIN'), b = src.indexOf('// CASTPRIO-END');
if (a < 0 || b < a) { console.error('CASTPRIO block not found'); process.exit(1); }
const M = new Function(src.slice(a, b) + '\nreturn { casterOrder, castOrder, attackOrderText, teamElementProfile, surrenderWorth, surrenderDue, surrenderElOf, skillElementByName, cpKeepAttack, cpNormEl, TEAM_SURRENDER };')();
const CP = JSON.parse(fs.readFileSync(path.join(ROOT, 'Scripts', 'data', 'caster_primary.json'), 'utf8'));
let fails = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails++; };

// plan.attacks the way buildSkillPlan makes them, for the skill ids a character knows (power = a made-up number: it must NOT decide the order)
const POWER = { 1266: 55, 1178: 44, 1177: 21, 1172: 36, 1175: 44, 1264: 55, 1274: 22, 1148: 108, 1220: 44, 1234: 90, 1147: 40, 1239: 108, 1176: 54, 1265: 135, 1235: 108, 1230: 108, 1436: 60, 1433: 40, 1434: 50 };
function attacksFor(cls, ids, extra) {
  const rows = CP[cls] || [];
  const out = rows.filter(r => ids.includes(r.skillId) && r.role !== 'debuff').map(r => ({ id: r.skillId, name: r.name, scope: r.aoe ? 'RANGE' : 'SINGLE', power: POWER[r.skillId] || 30, mp: 30, magic: true }));
  return out.concat(extra || []);
}
const names = (l) => l.map(s => s.name).join(' > ');

// ---- 1) the json: every caster class of our roster has rows and the expected primary chain --------------------------------------
const chain = (cls) => (CP[cls] || []).filter(r => r.role === 'primary').sort((x, y) => y.learnLevel - x.learnLevel).map(r => r.name).join(' > ');
const EXPECT = { 39: 'Twister > Wind Strike', 40: 'Hurricane > Twister > Wind Strike', 110: 'Hurricane > Twister > Wind Strike', 11: 'Blaze', 12: 'Prominence > Blaze', 94: 'Prominence > Blaze',
  26: 'Aqua Swirl', 27: 'Hydro Blast > Aqua Swirl', 103: 'Hydro Blast > Aqua Swirl', 13: 'Death Spike', 95: 'Death Spike', 128: 'Soul of Pain > Abyssal Blaze', 132: 'Soul of Pain > Abyssal Blaze',
  10: 'Wind Strike', 25: 'Wind Strike', 38: 'Wind Strike', 16: '', 43: '', 52: '', 116: '' };
Object.keys(EXPECT).forEach(c => check(chain(c) === EXPECT[c], `class ${c} ${CP._meta[c] && CP._meta[c].name}: primary chain '${chain(c)}'`));
check(CP[40].some(r => r.name === 'Surrender To Wind' && r.role === 'debuff' && r.kind === 'surrender' && r.learnLevel === 40), 'Spellhowler learns Surrender To Wind at 40 (debuff/surrender)');
check(!CP[39].some(r => r.kind === 'surrender' && r.element === 'wind'), 'Dark Wizard (39) has no Surrender To Wind yet');
check(CP[27].some(r => r.name === 'Surrender To Water' && r.learnLevel === 40), 'Spellsinger learns Surrender To Water at 40');
check(CP[128].some(r => r.skillId === 1445 && r.element === 'dark'), 'Soul Breaker has Surrender to Dark (1445)');
check(CP[110].some(r => r.name === 'Wind Vortex Slug' && r.kind === 'combo') && CP[110].some(r => r.name === 'Demon Wind' && r.kind === 'burst'), 'Storm Screamer: Wind Vortex Slug = combo, Demon Wind = burst');
['Nuker7', 'Nuker8', 'Nuker9', 'Nuker10', 'Nuker11'].length;

// ---- 2) the order on our casters' live skill lists ------------------------------------------------------------------------------
// Nuker7 / Nuker8 / Nuker9 / Nuker10 / Nuker11: Dark Wizard 30 (live ids from swarm_state ov, 2026-10-09)
const DW = [1147, 1172, 1177, 1178, 1181, 1184, 1266];
let o = M.casterOrder(attacksFor(39, DW), CP[39], false);
check(names(o).startsWith('Twister > Wind Strike > Shadow Spark'), `Dark Wizard (Nuker7 & co): ${names(o)}`);
check(M.attackOrderText(o).startsWith('attack order: Twister > Wind Strike > Shadow Spark'), 'log line: ' + M.attackOrderText(o));
// Nuker4 / Nuker5 / Nuker1 / Nuker2 / Nuker6 / Nuker3: Elven Wizard 28
const EW = [1172, 1175, 1177, 1181, 1184, 1264, 1274];
o = M.casterOrder(attacksFor(26, EW), CP[26], false);
check(o[0].name === 'Aqua Swirl' && o.findIndex(s => s.name === 'Solar Spark') > 0, `Elven Wizard (Nuker4 & co): ${names(o)}`);
// Necro1: Necromancer 50
const NEC = [1147, 1148, 1172, 1177, 1181, 1184, 1220, 1234, 1263, 1274];
o = M.casterOrder(attacksFor(13, NEC), CP[13], false);
check(o[0].name === 'Death Spike' && o.findIndex(s => s.name === 'Blaze') < o.findIndex(s => s.name === 'Aura Burn') && o.findIndex(s => s.name === 'Vampiric Claw') > o.findIndex(s => s.name === 'Blaze'), `Necromancer (Necro1): ${names(o)}`);
let c = M.castOrder(o, { hpPct: 45 });
check(c[0].name === 'Vampiric Claw' && c[1].name === 'Vampiric Touch' && c[2].name === 'Death Spike', `Necro1 below 60 % HP: drains first (${names(c.slice(0, 3))})`);
c = M.castOrder(o, { hpPct: 90 });
check(c[0].name === 'Death Spike', 'Necro1 at 90 % HP: Death Spike first');
// Spellhowler 48 (when the Dark Wizards reach 40+): Hurricane > Twister > Wind Strike, then the wind AoE (skill 1176), Death Spike / Shadow Flare after
const SH = [1147, 1148, 1172, 1176, 1177, 1178, 1181, 1184, 1234, 1239, 1266, 1267, 1074, 1224];
o = M.casterOrder(attacksFor(40, SH), CP[40], false);
const AOE_1176 = ['Tem', 'pest'].join('');   // skill 1176 (split: the release build neutralises an old character with this name)
check(names(o).startsWith('Hurricane > Twister > Wind Strike > ' + AOE_1176), `Spellhowler 48: ${names(o)}`);
check(!o.some(s => /Surrender/.test(s.name)), 'Surrender is never in the attack list');
// Storm Screamer 80: bursts only on long-lived targets, vortex/combo out
const SS = SH.concat([1291, 1294, 1288, 1341, 1456, 1159, 1417]);
o = M.casterOrder(attacksFor(110, SS), CP[110], false);
check(o[0].name === 'Hurricane' && !o.some(s => /Vortex/.test(s.name)), `Storm Screamer: Hurricane first, no vortex/slug (${names(o.slice(0, 5))} ...)`);
c = M.castOrder(o, { hpPct: 100, worth: false });
check(!c.some(s => s.cpKind === 'burst'), 'Storm Screamer on trash: no Demon Wind / Elemental Storm');
c = M.castOrder(o, { hpPct: 100, worth: true });
check(c[0].name === 'Demon Wind' && c[0].cpKind === 'burst', `Storm Screamer on a raid boss: the bursts first (${names(c.slice(0, 4))})`);
// Archmage / Mystic Muse / Soultaker
o = M.casterOrder(attacksFor(94, [1177, 1220, 1230, 1172, 1274, 1275, 1296, 1181, 1289]), CP[94], false);
check(names(o).startsWith('Prominence > Blaze > Rain of Fire > Flame Strike'), `Archmage: ${names(o)}`);
o = M.casterOrder(attacksFor(103, [1175, 1235, 1237, 1265, 1264, 1295, 1177, 1290]), CP[103], false);
check(names(o).startsWith('Hydro Blast > Aqua Swirl > Aqua Splash') && o.findIndex(s => s.name === 'Solar Flare') > 2, `Mystic Muse: ${names(o)}`);
// Inspector1: Soul Breaker 50, inspector role = physical first, then the soul nukes in class order
const phys = [{ id: 485, name: 'Shining Edge', power: 1200, mp: 40, magic: false, scope: 'SINGLE' }, { id: 478, name: 'Triple Thrust', power: 1400, mp: 50, magic: false, scope: 'SINGLE' }];
o = M.casterOrder(attacksFor(128, [1431, 1433, 1434, 1436, 1437]), CP[128], true).concat([]);
o = M.casterOrder(attacksFor(128, [1431, 1433, 1434, 1436, 1437], phys), CP[128], true);
check(names(o).startsWith('Triple Thrust > Shining Edge > Soul of Pain > Abyssal Blaze'), `Soul Breaker (Inspector1, physical first): ${names(o)}`);
// fighters (no json rows): the old order, power then MP, physical before magic for melee roles
const fighter = [{ id: 1, name: 'A', power: 100, mp: 10, magic: false }, { id: 2, name: 'B', power: 300, mp: 30, magic: false }, { id: 3, name: 'C', power: 300, mp: 50, magic: false }];
check(names(M.casterOrder(fighter, null, false)) === 'C > B > A', 'fighter: unchanged power/MP order');
check(names(M.casterOrder([{ name: 'M', power: 900, mp: 1, magic: true }, { name: 'P', power: 10, mp: 1, magic: false }], null, true)) === 'P > M', 'melee role without json rows: physical first (unchanged)');
check(M.cpKeepAttack({ role: 'primary' }) && M.cpKeepAttack({ role: 'fallback', kind: 'burst' }) && !M.cpKeepAttack({ role: 'fallback', kind: 'nuke+debuff' }) && !M.cpKeepAttack({ role: 'debuff' }) && !M.cpKeepAttack(null), 'cpKeepAttack: damage roles only');

// ---- 3) names / elements --------------------------------------------------------------------------------------------------------
check(M.surrenderElOf(1074, 'Surrender To Wind') === 'wind' && M.surrenderElOf(0, 'Surrender to Dark') === 'dark' && M.surrenderElOf(0, 'Surrender to the Unholy') === 'dark'
  && M.surrenderElOf(1224, 'Surrender To Poison') === '' && M.surrenderElOf(0, 'Surrender To Fire') === 'fire', 'surrenderElOf: ids + names (Poison has no element)');
check(M.skillElementByName('Shadow Flare') === 'dark' && M.skillElementByName('Solar Spark') === 'holy' && M.skillElementByName('Twister') === 'wind' && M.skillElementByName('Aura Burn') === '', 'skillElementByName: Shadow Flare dark, Solar Spark holy, Aura Burn none');
check(M.cpNormEl('UNHOLY') === 'dark' && M.cpNormEl('WIND') === 'wind' && M.cpNormEl('NONE') === '', 'cpNormEl: client AttributeType values');

// ---- 4) team element -------------------------------------------------------------------------------------------------------------
const meta = CP._meta;
const mem = (name, cls, lvl, role, extra) => Object.assign({ name, cls, lvl, role, healer: /bishop|healer|shilliensaint/.test(role), sur: null, alive: true }, extra || {});
// party Tank3 today: 5 Dark Wizards 30, tank, Destroyer9, Cleric, Orc Shaman
const dusk = [mem('Tank3', 32, 30, 'sk'), mem('Bishop4', 15, 30, 'bishop'), mem('Chanter4', 50, 30, 'doomcryer'), mem('Destroyer9', 45, 30, 'destroyer'),
  ...['Nuker7', 'Nuker8', 'Nuker9', 'Nuker10', 'Nuker11'].map(n => mem(n, 39, 30, 'nuker'))];
let p = M.teamElementProfile(dusk, meta);
check(p.element === 'wind' && p.casters === 5 && p.share === 1 && p.caster === '', `Tank3 at 30: wind team, nobody knows Surrender To Wind yet (${p.reason})`);
// the same party at 44: Spellhowlers learned Surrender To Wind (levels differ) -> the highest level, then the name
const dusk44 = dusk.map(m => m.role === 'nuker' ? Object.assign({}, m, { cls: 40, lvl: 44, sur: { wind: m.name === 'Nuker9' || m.name === 'Nuker11' ? 5 : 3 } }) : m);
p = M.teamElementProfile(dusk44, meta);
check(p.element === 'wind' && p.caster === 'Nuker11' && p.skillLvl === 5, `Tank3 at 44: Surrender To Wind by Nuker11 (level 5, name before Nuker9) — ${p.reason}`);
p = M.teamElementProfile(dusk44.map(m => m.name === 'Nuker11' ? Object.assign({}, m, { alive: false }) : m), meta);
check(p.caster === 'Nuker9', 'Nuker11 dead -> Nuker9 casts it');
// party Tank2: 6 Elven Wizards 28 -> water; at 40 a Spellsinger knows Surrender To Water
const vor = [mem('Tank2', 32, 28, 'sk'), mem('Bishop3', 15, 28, 'bishop'), mem('Chanter3', 50, 28, 'doomcryer'),
  ...['Nuker1', 'Nuker2', 'Nuker3', 'Nuker4', 'Nuker5', 'Nuker6'].map(n => mem(n, 26, 28, 'nuker'))];
p = M.teamElementProfile(vor, meta);
check(p.element === 'water' && p.casters === 6 && !p.caster, `Tank2 at 28: water team, no Surrender yet (${p.reason})`);
p = M.teamElementProfile(vor.map(m => m.name === 'Nuker2' ? Object.assign({}, m, { cls: 27, lvl: 40, sur: { water: 1, earth: 2 } }) : m), meta);
check(p.element === 'water' && p.caster === 'Nuker2', 'Tank2: Nuker2 (Spellsinger 40) casts Surrender To Water — not her higher Surrender To Earth');
// party Tank1: Necro1 (Necromancer) + Inspector1 (Soul Breaker, knows Surrender to Dark) = dark; Necro1's Surrender To Fire is not used
const sh = [mem('Tank1', 33, 50, 'sk'), mem('Bishop1', 16, 50, 'bishop'), mem('Saint1', 43, 50, 'shilliensaint', { sur: { dark: 9 } }), mem('Chanter1', 52, 49, 'doomcryer'),
  mem('Destroyer1', 46, 50, 'destroyer'), mem('Destroyer2', 46, 50, 'destroyer'), mem('Doombringer1', 127, 50, 'doombringer'),
  mem('Necro1', 13, 50, 'necromancer', { sur: { fire: 3 } }), mem('Inspector1', 128, 50, 'inspector', { sur: { dark: 12 } })];
p = M.teamElementProfile(sh, meta);
check(p.element === 'dark' && p.caster === 'Inspector1' && p.casters === 2, `Tank1's party: dark (Necro1 + Inspector1) -> Surrender to Dark by Inspector1, never the healer (${p.reason})`);
// mixed team: Sorcerer + Spellsinger + Spellhowler -> no element has 2 casters, physical bigger -> no Surrender
const mixed = [mem('T', 33, 50, 'sk'), mem('D1', 46, 50, 'destroyer'), mem('D2', 46, 50, 'destroyer'),
  mem('Fi', 12, 50, 'nuker', { sur: { fire: 9, wind: 9 } }), mem('Wa', 27, 50, 'nuker', { sur: { water: 9 } }), mem('Wi', 40, 50, 'nuker', { sur: { wind: 9 } })];
p = M.teamElementProfile(mixed, meta);
check(p.element === '' && !p.caster, `mixed team: no dominant element -> no Surrender (${p.reason})`);
// 2 wind + 1 water casters: wind 67 % with 2 casters -> wind; the Sorcerer who also knows Surrender To Wind is not a wind caster but may cast it
const two = [mem('T', 33, 50, 'sk'), mem('W1', 40, 50, 'nuker', { sur: { wind: 4 } }), mem('W2', 40, 50, 'nuker', { sur: { wind: 6 } }), mem('Wa', 27, 50, 'nuker', { sur: { water: 9 } })];
p = M.teamElementProfile(two, meta);
check(p.element === 'wind' && p.share === 0.67 && p.caster === 'W2', `2 wind + 1 water: wind (${p.share}), W2 has the highest Surrender To Wind`);
// a lone Storm Screamer with a tank: 1 caster, but magic >= physical -> his element
p = M.teamElementProfile([mem('T', 33, 40, 'sk'), mem('S', 110, 78, 'nuker', { sur: { wind: 14 } })], meta);
check(p.element === 'wind' && p.caster === 'S', 'main damage dealer is a wind caster (1 caster, magic > physical) -> wind');
p = M.teamElementProfile([mem('D1', 46, 50, 'destroyer'), mem('D2', 46, 50, 'destroyer'), mem('D3', 46, 50, 'destroyer'), mem('S', 40, 50, 'nuker', { sur: { wind: 9 } })], meta);
check(p.element === '' && p.candidate === 'wind', `1 wind caster among 3 destroyers: not the team's damage -> no Surrender (${p.reason})`);
p = M.teamElementProfile([mem('Destroyer3', 45, 35, 'destroyer'), mem('Bishop2', 15, 35, 'bishop'), mem('Chanter2', 50, 35, 'doomcryer')], meta);
check(p.element === '' && p.reason === 'no caster damage in the team', 'destroyer team: no caster damage');
p = M.teamElementProfile([mem('H', 16, 50, 'bishop', { sur: { wind: 9 } }), mem('W1', 40, 50, 'nuker'), mem('W2', 40, 50, 'nuker')], meta);
check(p.element === 'wind' && p.caster === '', 'healers never cast it (a healer knowing Surrender To Wind is skipped)');

// ---- 5) worth + recast ------------------------------------------------------------------------------------------------------------
const dps = M.teamElementProfile(dusk, meta).teamDps;
check(dps > 500 && dps < 3000, `Tank3 estimated team damage ${dps}/s`);
check(!M.surrenderWorth({ hpPct: 100, maxHp: 2200 }, dps), 'trash (2200 HP) is never worth a Surrender');
check(M.surrenderWorth({ hpPct: 100, maxHp: 40000 }, dps), 'a 40k HP elite at full HP is worth it');
check(!M.surrenderWorth({ hpPct: 50, maxHp: 40000 }, dps), 'not when it is already below 60 %');
check(!M.surrenderWorth({ hpPct: 100, maxHp: 0 }, dps), 'unknown max HP = ordinary monster: no');
check(M.surrenderWorth({ boss: true, hpPct: 80 }, dps) && M.surrenderWorth({ minion: true, hpPct: 0 }, dps) && !M.surrenderWorth({ boss: true, hpPct: 5 }, dps), 'raid boss / minion yes (not a boss at 5 %)');
const tr = {};
check(M.surrenderDue(tr, 77, 1000, 30), 'not on the target yet -> due');
tr[77] = { at: 1000, dur: 30 };
check(!M.surrenderDue(tr, 77, 11000, 30) && !M.surrenderDue(tr, 77, 28000, 30) && M.surrenderDue(tr, 77, 29500, 30), 'on the target: recast only 2 s before the 30 s run out');
check(M.surrenderDue(tr, 78, 11000, 30), 'another target -> due');

console.log(fails ? `\n${fails} FAILED` : '\nall ok');
process.exit(fails ? 1 : 0);
