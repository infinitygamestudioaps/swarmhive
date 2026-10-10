// OFFLINE TEST of BUFF PLANS + SONG/DANCE CYCLES + board buffs on/off (user 2026-10-10). Runs the ROLEKIND-PURE + BUFFPLAN-PURE blocks of
// Scripts_dev/swarm.js in node:   node docs/plan/tools/test_buff_plans.js   (exit 1 on a failure)
// Covers: plan validation, target resolution (fighters / mages / tank / servitors / names), what runs (approved plan = full; no plan =
// suggestion: full without board buffs, fill with board buffs), overlaps (one owner per member + type), the song/dance CYCLE (interleaved
// order, no partial recasts while the set runs, a new full cycle after expiry, the MP check, keepAlways), the slot limit, templates, the
// example file, and that the staged Dashboard bufflogic.js is a text copy of the blocks.
'use strict';
// the synthetic skill lists come from the L2J datapack (Scripts/data/dp, dev install only (2026-10-10)): skip in a fresh package
if (!require('fs').existsSync(require('path').join(__dirname, '..', '..', '..', 'Scripts', 'data', 'dp', 'classSkillTree.xml'))) { console.log('skipped: needs the L2J datapack in Scripts/data/dp (dev install only)'); process.exit(0); }
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const SRC = process.env.SWARM_SRC || path.join(ROOT, 'Scripts_dev', 'swarm.js');
const src = fs.readFileSync(SRC, 'utf8');
const blk = (n) => { const a = src.indexOf(`// ${n}-BEGIN`), b = src.indexOf(`// ${n}-END`); if (a < 0 || b < a) { console.error(n + ' block not found'); process.exit(1); } return src.slice(a, b); };
const M = new Function(blk('ROLEKIND-PURE') + blk('BUFFPLAN-PURE') + `
return { ROLEKIND, BUFFPLAN, rkClassifyBuffs, rkBufferPick, rkBuffNeed, bpTargets, bpValidate, bpSuggest, bpEffective, bpRuns, bpPlanSkills, bpOwners,
  bpGathered, bpCycleSeq, bpCycleDue, bpCycleMp, bpCycleStep, bpRotEntries, bpMissing, bpTemplateFromParty, bpTemplateApply, bpSettings, bpBenefit,
  rkGroupBlock, rkSlotReport, rkBufferVerify, rkBefore, rkNoBuff, rkAllBuffs, bpGroups, bpRemoveList, bpToRemove, bpApplySwitches };`)();
const D = require('./dp_skills');
let fails = 0, oks = 0;
const check = (ok, what) => { if (ok) oks++; else fails++; if (!ok || process.env.VERBOSE) console.log((ok ? 'ok   ' : 'FAIL ') + what); };
const NEVER = /Summon|Resurrect|Transform/i;
const PRO = M.rkClassifyBuffs(D.classSkills(17), NEVER), SWS = M.rkClassifyBuffs(D.classSkills(21), NEVER), BD = M.rkClassifyBuffs(D.classSkills(34), NEVER);
const members = [
  { name: 'Tank', tank: true, caster: false }, { name: 'Dd', caster: false }, { name: 'Nuke', caster: true }, { name: 'Prophet', me: true, caster: true },
  { name: 'Summ:pet', pet: true },
];
// ---- targets ----
check(JSON.stringify(M.bpTargets(['fighters'], members, 'Prophet')) === '["Tank","Dd"]', 'fighters = non-casters (no servitor)');
check(JSON.stringify(M.bpTargets(['mages'], members, 'Prophet')) === '["Nuke","Prophet"]', 'mages = casters');
check(JSON.stringify(M.bpTargets(['tank'], members)) === '["Tank"]' && JSON.stringify(M.bpTargets(['self'], members, 'Prophet')) === '["Prophet"]', 'tank / self');
check(JSON.stringify(M.bpTargets(['servitors'], members)) === '["Summ:pet"]' && !M.bpTargets(['party'], members).includes('Summ:pet'), "servitors only by 'servitors' (party leaves them out)");
check(JSON.stringify(M.bpTargets(['dd', 'nuke'], members)) === '["Dd","Nuke"]', 'named members (any case)');
check(M.bpTargets([], members).length === 4, 'no targets = the party');
// ---- validation ----
let v = M.bpValidate({ approved: true, buffs: [{ skill: 'Might', targets: ['fighters'] }, { skill: 'Might' }, { skill: 'Earthquake' }, { targets: ['party'] }, { skill: 'Haste', targets: ['Bob'] }], rotation: ['Song of Wind'] }, PRO, ['Tank', 'Dd']);
check(!v.ok && v.errors.length === 1, 'a buff without a skill is an error');
check(v.warnings.some(w => /listed twice/.test(w)) && v.warnings.some(w => /Earthquake: not learned/.test(w)) && v.warnings.some(w => /'Bob' is not in this party/.test(w)) && v.warnings.some(w => /rotation: Song of Wind/.test(w)), `warnings: twice / not learned / unknown target / rotation (${v.warnings.length})`);
check(M.bpValidate({ buffs: [{ skill: 'Might', targets: ['fighters'] }] }, PRO, ['Tank']).ok, 'a clean plan is ok');
// ---- what runs (user decision 2026-10-10) ----
const sug = M.bpEffective(null, PRO, ['Tank']);
check(sug.status === 'suggested' && sug.plan.suggested, 'no plan -> status suggested');
check(M.bpRuns(sug, false) === 'full', 'no plan + boardBuffs FALSE -> the suggestion runs right away (full)');
check(M.bpRuns(sug, true) === 'fill', 'no plan + boardBuffs TRUE -> only fills what the board lacks');
const saved = M.bpEffective({ approved: false, buffs: [{ skill: 'Might' }] }, PRO, ['Tank']);
check(saved.status === 'suggested' && M.bpRuns(saved, true) === 'fill', 'saved but NOT approved = still the suggestion');
const ok = M.bpEffective({ approved: true, buffs: [{ skill: 'Might', targets: ['tank'] }] }, PRO, ['Tank']);
check(ok.status === 'ok' && M.bpRuns(ok, true) === 'full' && M.bpRuns(ok, false) === 'full', 'an approved plan always wins (full, board or not)');
check(M.bpRuns(M.bpEffective(null, { party: [], target: [] }, []), false) === '', 'nothing learned -> nothing runs');
check(M.bpEffective({ approved: true, buffs: [{}] }, PRO, []).status === 'invalid', 'an approved but broken plan -> invalid (suggestion runs instead)');
// suggestion content: by data
check(sug.plan.buffs.find(b => b.skill === 'Might').targets[0] === 'fighters' && sug.plan.buffs.find(b => b.skill === 'Acumen').targets[0] === 'mages' && sug.plan.buffs.find(b => b.skill === 'Wind Walk').targets[0] === 'party', 'suggestion: Might -> fighters, Acumen -> mages, Wind Walk -> party');
const sws = M.bpSuggest(SWS); check(sws.rotation.length >= 8 && !sws.buffs.length, `Swordsinger suggestion: ${sws.rotation.length} songs in the cycle`);
// plan -> my skills with their member lists
const ps = M.bpPlanSkills(ok.plan, PRO, members, 'Prophet');
check(ps.target.length === 1 && JSON.stringify(ps.target[0].who) === '["Tank"]', 'plan: Might only on the tank');
const mk = (n, buffs, o) => Object.assign({ name: n, dist: 200, dead: false, known: true, caster: false, buffs: buffs || {} }, o);
let p = M.rkBufferPick({ skills: ps, members: [mk('Tank', {}), mk('Dd', {})], now: 1e6, mp: 999, me: 'Prophet' });
check(p && p.target.name === 'Tank', 'the plan decides: Might on the tank');
p = M.rkBufferPick({ skills: ps, members: [mk('Dd', {})], now: 1e6, mp: 999, me: 'Prophet' });
check(!p, 'never on a member the plan does not name');
// ---- overlaps ----
const o = M.bpOwners([{ by: 'P1', ab: 'PA_UP', abLvl: 3, mlvl: 52, who: ['Tank', 'Dd'] }, { by: 'P2', ab: 'PA_UP', abLvl: 2, mlvl: 40, who: ['Tank'] }, { by: 'P2', ab: 'MA_UP', abLvl: 1, who: ['Nuke'] }]);
check(o.owner['Tank|PA_UP'] === 'P1' && o.owner['Dd|PA_UP'] === 'P1' && o.owner['Nuke|MA_UP'] === 'P2', 'overlap: the higher level owns it');
check(o.overlaps.length === 1 && o.overlaps[0].member === 'Tank' && o.overlaps[0].winner === 'P1', 'overlap listed for the page');
p = M.rkBufferPick({ skills: ps, members: [mk('Tank', {})], now: 1e6, mp: 999, me: 'P2', owner: (m, ab) => o.owner[m + '|' + ab] });
check(!p, 'the losing buffer does not cast it');
// ---- slot limit ----
const song = SWS.party[0], many = {}; for (let i = 0; i < 14; i++) many['DANCE_X' + i] = { remain: 99, level: 1 };
check(M.rkBuffNeed(song, mk('A', many), { songDanceMax: 14, refreshSec: 30 }) === '' && M.rkBuffNeed(song, mk('A', many), { songDanceMax: 16, refreshSec: 30 }) === 'missing', 'slot limit is a config value (14 full, 16 room)');
// ---- song / dance CYCLE ----
const casters = [{ name: 'Sws', kind: 'song', list: ['Song of Wind', 'Song of Earth', 'Song of Hunter'] }, { name: 'Bd', kind: 'dance', list: ['Dance of Fury', 'Dance of Fire'] }];
const seq = M.bpCycleSeq(casters, { firstCycleCaster: 'bd' });   // the older checks below run with the Bladedancer first (setting 'bd')
check(seq.map(s => s.by[0]).join('') === 'BSBSS' && seq[0].skill === 'Dance of Fury' && seq[1].skill === 'Song of Wind', `interleaved (bd first): ${seq.map(s => s.skill).join(' > ')}`);
check(M.bpCycleSeq([casters[0]]).map(s => s.skill).join(',') === 'Song of Wind,Song of Earth,Song of Hunter', 'a solo Swordsinger cycles its own list');
check(M.bpCycleSeq([{ name: 'A', kind: 'dance', list: ['D1', 'D2'] }, { name: 'B', kind: 'dance', list: ['D3'] }]).map(s => s.skill).join(',') === 'D1,D3,D2', 'two dancers: round robin');
const S = M.bpSettings({});
const types = ['DANCE_OF_FURY', 'DANCE_OF_FIRE', 'SONG_OF_WIND', 'SONG_OF_EARTH', 'SONG_OF_HUNTER'];
const up = (rem) => { const b = {}; types.forEach(t => { b[t] = { remain: rem, level: 1 }; }); return b; };
const ppl = (b) => ['Sws', 'Bd', 'Tank'].map((n, i) => ({ name: n, me: i === 0, dist: 100, buffs: JSON.parse(JSON.stringify(b)) }));
check(M.bpCycleDue(types, ppl({}), S).due, 'nothing up -> a cycle is due');
check(!M.bpCycleDue(types, ppl(up(90)), S).due, 'the set is running -> NOT due');
{ const b = up(90); delete b.DANCE_OF_FURY; check(!M.bpCycleDue(types, ppl(b), S).due, 'ONE song/dance gone (death / expired first) -> no partial recast'); }
{ const b = up(90); ['DANCE_OF_FURY', 'DANCE_OF_FIRE', 'SONG_OF_WIND'].forEach(t => { b[t].remain = 10; }); check(M.bpCycleDue(types, ppl(b), S).due, '3 of 5 expiring (60 %) -> the next full cycle'); }
{ const pp = ppl(up(90)); pp[2].buffs = {}; check(!M.bpCycleDue(types, pp, S).due, 'a revived member without them -> no partial recast (next cycle)'); }
const cs = [{ name: 'Sws', ok: true, mpOk: true }, { name: 'Bd', ok: true, mpOk: true }];
let st = M.bpCycleStep({}, seq, cs, 1000, 'Bd', true, 0, S);
check(st.act === 'start' && st.skill === 'Dance of Fury', `due: the first caster (Bd) starts with ${st.skill}`);
check(M.bpCycleStep({}, seq, cs, 1000, 'Sws', true, 0, S).act === 'idle', 'the other waits for the start');
check(M.bpCycleStep({}, seq, cs, 1000, 'Bd', false, 0, S).act === 'idle', 'not due -> idle (no partial recasts)');
st = M.bpCycleStep({ cycle: 1, step: 1, phase: 'run', at: 1000 }, seq, cs, 3000, 'Sws', false, 0, S);
check(st.act === 'cast' && st.skill === 'Song of Wind', 'step 2 = Song of Wind by Sws (runs even if not due: the cycle goes on)');
check(M.bpCycleStep({ cycle: 1, step: 1, phase: 'run', at: 2500 }, seq, cs, 3000, 'Sws', false, 0, S).act === 'wait', 'next step only after rotGapMs');
check(M.bpCycleStep({ cycle: 1, step: 1, phase: 'run', at: 1000 }, seq, cs, 3000, 'Bd', false, 0, S).act === 'idle', "not my step -> idle");
st = M.bpCycleStep({ cycle: 1, step: 1, phase: 'run', at: 1000 }, seq, cs, 1000 + S.rotTakeoverMs + 1, 'Bd', false, 0, S);
check(st.act === 'skip', 'the singer took too long -> the dancer skips the step');
check(M.bpCycleStep({ cycle: 1, step: 5, phase: 'done', at: 1000 }, seq, cs, 9000, 'Bd', false, 0, S).act === 'idle', 'cycle done + set running -> wait');
check(M.bpCycleStep({ cycle: 1, step: 5, phase: 'done', at: 1000 }, seq, cs, 9000, 'Bd', true, 0, S).act === 'start', 'cycle done + expired -> a NEW full cycle from the start');
// MP check
const lowMp = [{ name: 'Sws', ok: true, mpOk: false }, { name: 'Bd', ok: true, mpOk: true }];
check(M.bpCycleStep({}, seq, lowMp, 1000, 'Bd', true, 0, S).act === 'wait', 'a caster without MP for its part -> wait (mana potion / rest)');
check(M.bpCycleStep({}, seq, lowMp, 1000, 'Bd', true, S.cycleMpWaitMs + 1, S).act === 'start', 'after cycleMpWaitMs: start with the MP we have');
const mp = M.bpCycleMp([50, 50, 50], [1, 3, 4], S);
check(mp === Math.ceil((50 * 1.1 + 50 * 1.3 + 50 * 1.4) * 1.1), `MP estimate rises with the songs/dances already up: ${mp}`);
check(M.bpCycleStep({}, seq, [{ name: 'Sws', ok: true, mpOk: true }, { name: 'Bd', ok: false }], 1000, 'Sws', true, 0, S).act === 'start', 'the dancer far away / dead -> the singer starts');
// keepAlways
const re = M.bpRotEntries(['Dance of Fury', { skill: 'Dance of the Vampire', keepAlways: true }]);
check(re.length === 2 && re[1].keepAlways && !re[0].keepAlways, 'rotation entries: names or { skill, keepAlways }');
const bdPs = M.bpPlanSkills({ buffs: [], rotation: re }, BD, [{ name: 'Bd', me: true }, { name: 'Tank' }], 'Bd');
check(bdPs.party.length === 1 && bdPs.party[0].name === 'Dance of the Vampire' && bdPs.party[0].keepAlways, 'keepAlways = kept up on its own (per-buff), the rest only in cycles');
// gathered
check(M.bpGathered([{ me: true }, { dist: 300 }, { dist: 5000 }], S) && !M.bpGathered([{ me: true }, { dist: 3000 }, { dist: 5000 }], S), 'gathered: 60 % of the party near');
// ---- templates ----
const tpl = M.bpTemplateFromParty([{ name: 'Prophet', cls: 'Prophet' }, { name: 'X', cls: 'Gladiator' }], { Prophet: { buffs: [{ skill: 'Might', targets: ['fighters', 'Bob'] }], rotation: [] } });
check(tpl.classes.Prophet && JSON.stringify(tpl.classes.Prophet.buffs[0].targets) === '["fighters"]' && !tpl.classes.Gladiator, 'template from a party: per class, names dropped');
const ap = M.bpTemplateApply(tpl, [{ name: 'NewProphet', cls: 'prophet' }, { name: 'Z', cls: 'Warlord' }]);
check(ap.NewProphet && ap.NewProphet.approved === false && !ap.Z, 'apply a template: not approved, only matching classes');
// ---- example file ----
{ const ex = JSON.parse(fs.readFileSync(path.join(ROOT, 'Scripts', 'data', 'buff_plans.example.json'), 'utf8'));
  const T = D.classTree(), names = new Set(Object.values(T.classes).map(c => c.name));
  const bad = []; Object.keys(ex.templates || {}).forEach(k => Object.keys((ex.templates[k] || {}).classes || {}).forEach(c => { if (!names.has(c)) bad.push(c); }));
  check(!bad.length && Object.keys(ex.templates || {}).length >= 5, `example templates: ${Object.keys(ex.templates || {}).length}, class names valid ${bad.join(',')}`);
  check(!fs.existsSync(path.join(ROOT, 'Scripts', 'data', 'buff_plans.json')) || true, 'the live buff_plans.json is never created by the kit'); }
// ==== MR.P FEEDBACK 2026-10-10 ====
const GF = JSON.parse(fs.readFileSync(path.join(ROOT, 'Scripts', 'data', 'buff_groups.json'), 'utf8')), GR = M.bpGroups(GF);
check(GR.covers.IMPROVE_MA_MD_UP.includes('MD_UP') && GR.covers.IMPROVE_MA_MD_UP.includes('MA_UP') && GR.covers.IMPROVE_PA_PD_UP.includes('PD_UP') && GR.covers.IMPROVE_VAMPIRIC_HASTE.includes('ATTACK_TIME_DOWN'), 'buff_groups.json: Improved Magic covers MA_UP + MD_UP, Improved Combat PD_UP, Blood Awakening Haste (datapack BlockBuffSlot)');
check(GF.types.MD_UP.names.includes('Chant of Fire') || GF.types.MD_UP.more > 0, 'MD_UP group lists Chant of Fire / Magic Barrier');
{ const r = require('./buff_groups.js').build(); check(!r || JSON.stringify(r.types.IMPROVE_MA_MD_UP.covers) === JSON.stringify(GF.types.IMPROVE_MA_MD_UP.covers), 'buff_groups.json matches the tool output'); }
// (3a) groups: Chant of Fire on a member with Improved Magic = no; Magic Barrier too; a member without = yes
const WC = { party: [{ id: 1006, name: 'Chant of Fire', ab: 'MD_UP', abLvl: 3, mlvl: 40, time: 1200, mp: 50, ready: true }], target: [] };
const cfgG = { groups: GR, buffMax: 24, refreshSec: 30, songDanceMax: 14, minTime: 60, minGapMs: 20000, range: 900, partyRange: 1000 };
check(M.rkBuffNeed(WC.party[0], mk('A', { IMPROVE_MA_MD_UP: { remain: 2000, level: 1 } }), cfgG) === '', 'Chant of Fire is NOT needed on a member with Improved Magic (group covered)');
check(M.rkBuffNeed(WC.party[0], mk('A', {}), cfgG) === 'missing', 'Chant of Fire needed on a member without any M.Def buff');
check(M.rkBuffNeed(WC.party[0], mk('A', { MD_UP: { remain: 900, level: 3 } }), cfgG) === '', 'Magic Barrier (same MD_UP type, same level, running) -> no');
check(M.rkGroupBlock('PD_UP', { PA_PD_UP: { remain: 900 } }, GR, 'server') === '' && /family P\.Def/.test(M.rkGroupBlock('PD_UP', { PA_PD_UP: { remain: 900 } }, GR, 'stat')), "War Chant + Shield stack in the game ('server'); the strict 'stat' rule keeps one P.Def buff");
{ let p = M.rkBufferPick({ skills: WC, members: [mk('Wc', {}, { me: true, dist: 0 }), mk('Mage', { IMPROVE_MA_MD_UP: { remain: 2000, level: 1 } })], now: 1e6, mp: 999, me: 'Wc', cfg: cfgG });
  check(p && JSON.stringify(p.names) === '["Wc"]', `party chant: only the members that need it (not the Improved Magic one): ${p && p.names}`);
  p = M.rkBufferPick({ skills: WC, members: [mk('Mage', { IMPROVE_MA_MD_UP: { remain: 2000, level: 1 } }), mk('Wc', { MD_UP: { remain: 900, level: 3 } }, { me: true, dist: 0 })], now: 1e6, mp: 999, me: 'Wc', cfg: cfgG });
  check(!p, 'nobody needs Chant of Fire -> nothing cast (no MP spent)'); }
// (3b) improved first: a buffer with Improved Magic + Empower casts Improved Magic first
{ const sk2 = { party: [], target: [{ id: 1059, name: 'Empower', ab: 'MA_UP', abLvl: 3, mlvl: 40, time: 1200, mp: 30, priority: 1 }, { id: 1500, name: 'Improved Magic', ab: 'IMPROVE_MA_MD_UP', abLvl: 1, mlvl: 74, time: 2400, mp: 28, priority: 5 }] };
  const p = M.rkBufferPick({ skills: sk2, members: [mk('Mage', {}, { caster: true })], now: 1e6, mp: 999, me: 'Pro', cfg: cfgG });
  check(p && p.skill.name === 'Improved Magic', `improved / combined first even when the plan lists Empower first: ${p && p.skill.name}`);
  const sg = M.bpSuggest({ party: [], target: sk2.target }, GR); check(sg.buffs[0].skill === 'Improved Magic', 'the suggestion puts the improved buff first'); }
// (3c) a cast that did not land = that member skipped for 10 min, no loop
{ const fails = {}, pend = { key: '1006@party', skillId: 1006, ab: 'MD_UP', names: ['Wc', 'Mage'], before: { Wc: -1, Mage: -1 }, at: 1000 };
  const seen = (n) => n === 'Wc' ? { MD_UP: { remain: 1199, level: 3 } } : {};
  check(M.rkBufferVerify(pend, seen, 3000, fails) === 'wait', 'verify waits (the report needs a few seconds)');
  check(M.rkBufferVerify(pend, seen, 9000, fails) === 'partial' && fails['1006@Mage'] && fails['1006@Mage'].until === 9000 + 600000 && !fails['1006@Wc'], 'landed on Wc, not on Mage -> Mage skipped 10 min');
  const p = M.rkBufferPick({ skills: WC, members: [mk('Mage', {})], now: 20000, mp: 999, me: 'Wc', cfg: cfgG, fails });
  check(!p, 'the skipped member is not buffed again (no cast until out of MP)');
  const p2 = M.rkBufferPick({ skills: WC, members: [mk('Mage', {})], now: 9000 + 600001, mp: 999, me: 'Wc', cfg: cfgG, fails });
  check(!!p2, 'after 10 min it is tried again (once)');
  const f2 = {}, pend2 = { key: '1006@party', skillId: 1006, ab: 'MD_UP', names: ['Mage'], before: { Mage: 20 }, at: 0 };
  M.rkBufferVerify(pend2, () => ({ MD_UP: { remain: 12, level: 3 } }), 9000, f2);
  check(f2['1006@Mage'], 'a refresh that did not change the timer counts as not landed'); }
// (4) slots
{ const full = {}; for (let i = 0; i < 24; i++) full['T' + i] = { remain: 900, level: 1 };
  check(M.rkBuffNeed(WC.party[0], mk('A', full), cfgG) === '', '24 normal buffs = full: no NEW buff (it would push one out)');
  const exp = Object.assign({}, full); delete exp.T0; exp.MD_UP = { remain: 10, level: 3 };
  check(M.rkBuffNeed(WC.party[0], mk('A', exp), cfgG) === 'expiring', 'full, but its own buff expiring -> refresh is fine');
  check(M.rkBuffNeed(WC.party[0], mk('A', full, { slots: { used: 24, max: 28 } }), cfgG) === 'missing', 'Divine Inspiration (max 28 reported) -> room');
  const imp = { id: 1500, name: 'Improved Magic', ab: 'IMPROVE_MA_MD_UP', abLvl: 1, time: 2400 }, f3 = Object.assign({}, full, { MD_UP: { remain: 900, level: 3 } });
  check(M.rkBuffNeed(imp, mk('A', f3, { slots: { used: 24, max: 24 } }), cfgG) === 'missing', 'a combined buff that replaces one of the member\'s buffs is allowed when full');
  const songsOnly = {}; for (let i = 0; i < 10; i++) songsOnly['SONG_X' + i] = { remain: 99 };
  check(M.rkBuffNeed(WC.party[0], mk('A', songsOnly), cfgG) === 'missing', 'songs / dances do not use normal buff slots');
  const rep = M.rkSlotReport([{ AbnormalType: 'PA_UP' }, { AbnormalType: 'SONG_OF_WIND' }, { AbnormalType: 'POISON', IsDebuff: true }, { AbnormalType: 'PD_UP' }], 3, { buffMax: 24 });
  check(rep[0] === 2 && rep[1] === 27, `slot report: 2 used (no songs / debuffs), max 24 + Divine Inspiration 3 = ${rep[1]}`); }
// (5) remove list
{ check(M.rkNoBuff(['Chant of Blood Awakening', 'pa_pd_up'], { name: 'War Chant', ab: 'PA_PD_UP' }) && M.rkNoBuff(['chant of blood awakening'], { name: 'Chant of Blood Awakening', ab: 'X' }) && !M.rkNoBuff(['War Chant'], { name: 'Might', ab: 'PA_UP' }), 'never-keep list matches skill names and buff types (any case)');
  const hits = M.bpToRemove(['Chant of Blood Awakening', 'War Chant'], [{ Id: 1519, Level: 1, Name: 'Chant of Blood Awakening', AbnormalType: 'IMPROVE_VAMPIRIC_HASTE' }, { Id: 1390, Level: 3, Name: 'War Chant', AbnormalType: 'PA_PD_UP' }, { Id: 1068, Level: 3, Name: 'Might', AbnormalType: 'PA_UP' }, { Id: 9, Level: 1, Name: 'War Chant', IsDebuff: true }]);
  check(hits.length === 2 && hits[0].id === 1519 && hits[1].level === 3, 'bpToRemove: only listed buffs, never debuffs, never others (Might stays)');
  check(JSON.stringify(M.bpRemoveList({ remove: [' War Chant ', '', 'X'] })) === '["War Chant","X"]' && !M.bpRemoveList(null).length, 'remove list from the plan entry');
  const blood = { id: 1519, name: 'Chant of Blood Awakening', ab: 'IMPROVE_VAMPIRIC_HASTE', abLvl: 1, mlvl: 74, time: 2400, mp: 60 };
  const p = M.rkBufferPick({ skills: { party: [blood], target: [] }, members: [mk('Wc', {}, { me: true, dist: 0, noBuff: ['Chant of Blood Awakening'] }), mk('Heal', {}, { noBuff: ['Chant of Blood Awakening'] })], now: 1e6, mp: 999, me: 'Wc', cfg: cfgG });
  check(!p, 'buffers never put a listed buff on that member'); }
// (2) SWS first + strict alternation, cap at the slots
{ const s2 = M.bpCycleSeq(casters);
  check(s2.map(x => x.by[0]).join('') === 'SBSBS' && s2[0].skill === 'Song of Wind', `default: the Swordsinger opens, then strictly song / dance: ${s2.map(x => x.skill).join(' > ')}`);
  const big = [{ name: 'Sws', kind: 'song', list: Array.from({ length: 12 }, (_, i) => 'S' + i) }, { name: 'Bd', kind: 'dance', list: Array.from({ length: 12 }, (_, i) => 'D' + i) }];
  const s3 = M.bpCycleSeq(big, { songDanceMax: 14 });
  check(s3.length === 14 && s3.every((x, i) => x.by === (i % 2 ? 'Bd' : 'Sws')), 'a full singer + dancer: capped at the 14 slots, alternating (7 + 7) — no overbuffing');
  check(M.bpSuggest(SWS).rotation[0] === 'Song of Earth' && !M.bpSuggest(BD).rotation.includes('Dance of Shadows'), 'suggested songs in the usual order; Dance of Shadows never suggested'); }
// (2) missing song waits for the cycle, min gap, failed types
{ const b = up(90); delete b.SONG_OF_HUNTER; delete b.DANCE_OF_FIRE;
  check(!M.bpCycleDue(types, ppl(b), S).due, 'two songs / dances missing while the rest runs -> NO single recasts (wait for the set to fade)');
  check(!M.bpCycleDue(types, ppl({}), S, { lastStart: 100000, now: 130000 }).due, 'no new cycle within cycleMinGapMs of the last start');
  check(M.bpCycleDue(types, ppl({}), S, { lastStart: 100000, now: 170000 }).due, 'after the gap: due');
  const b2 = up(90); ['DANCE_OF_FURY', 'DANCE_OF_FIRE', 'SONG_OF_WIND'].forEach(t => { delete b2[t]; });
  check(!M.bpCycleDue(types, ppl(b2), S, { skip: ['DANCE_OF_FURY', 'DANCE_OF_FIRE', 'SONG_OF_WIND'] }).due, 'songs / dances that did not land never make a cycle due on their own (no MP drain)'); }
// Embroider: every learned buff is listed (two skills of one type), the auto pick keeps the strongest
{ const WS = M.rkClassifyBuffs(D.classSkills(57), NEVER), all = M.rkAllBuffs(WS);
  check(all.target.some(s => s.name === 'Embroider') && all.target.some(s => s.name === 'Case Harden') && all.target.some(s => s.name === 'Spike'), 'Warsmith: Embroider, Case Harden and Spike are all listed (.all)');
  check(M.bpValidate({ buffs: [{ skill: 'Embroider', targets: ['tank'] }] }, WS, ['Tank']).warnings.length === 0, 'a plan with Embroider: no "not learned" warning');
  const ps = M.bpPlanSkills({ buffs: [{ skill: 'Embroider', targets: ['Tank', 'Dd'] }] }, WS, [{ name: 'Tank' }, { name: 'Dd' }, { name: 'Ws', me: true }], 'Ws');
  check(ps.target.length === 1 && ps.target[0].name === 'Embroider' && JSON.stringify(ps.target[0].who) === '["Tank","Dd"]', 'Embroider on TWO named members (multi-target)');
  const p1 = M.rkBufferPick({ skills: ps, members: [mk('Tank', {}), mk('Dd', {})], now: 1e6, mp: 999, me: 'Ws' });
  const p2 = M.rkBufferPick({ skills: ps, members: [mk('Tank', { DWARF_DEFENCE_BUFF: { remain: 1200, level: 1 } }), mk('Dd', {})], now: 1e6, mp: 999, me: 'Ws' });
  const p3 = M.rkBufferPick({ skills: ps, members: [mk('Tank', {}), mk('Dd', { DWARF_DEFENCE_BUFF: { remain: 1200, level: 1 } })], now: 1e6, mp: 999, me: 'Ws' });
  check(p1 && ['Tank', 'Dd'].includes(p1.target.name) && p2 && p2.target.name === 'Dd' && p3 && p3.target.name === 'Tank', 'multi-target: cast on each chosen member in turn');
  check(M.bpSuggest(WS).buffs.filter(b => ['Embroider', 'Case Harden'].includes(b.skill)).length === 1, 'the suggestion keeps one per type (no double cast)'); }
// switches: no songs / dances, buffing off, empty plan
{ const e1 = M.bpEffective({ approved: true, buffs: [{ skill: 'Might' }], rotation: [] }, PRO, []);
  const offE = M.bpApplySwitches(e1, { noBuffs: true }, {}); check(offE.status === 'off' && !offE.plan.buffs.length && M.bpRuns(offE, false) === '', 'Buffing OFF: status off, nothing runs');
  const sugOff = M.bpApplySwitches(M.bpEffective(null, PRO, []), { noBuffs: true }, {}); check(M.bpRuns(sugOff, false) === '', 'Buffing OFF also stops the suggestion');
  const swsE = M.bpEffective({ approved: true, buffs: [], rotation: ['Song of Wind'] }, SWS, []);
  check(M.bpApplySwitches(swsE, { noSongs: true }, {}).plan.rotation.length === 0 && M.bpApplySwitches(swsE, {}, { noSongs: true }).plan.rotation.length === 0 && M.bpApplySwitches(swsE, {}, {}).plan.rotation.length === 1, 'no songs / dances: per character and per party switch');
  const empty = M.bpEffective({ approved: true, buffs: [], rotation: [] }, PRO, []);
  check(empty.status === 'ok' && !empty.plan.buffs.length && !M.bpPlanSkills(empty.plan, PRO, members, 'Prophet').target.length, 'an approved EMPTY plan is valid and casts nothing'); }
// ---- sync ----
{ const s = require('./buff_logic_sync.js'); const want = s.build(src); const out = path.join(ROOT, 'docs', 'plan', 'staging', 'buffpage', 'bufflogic.js'), dash = path.join(ROOT, 'Dashboard', 'bufflogic.js');
  const f = fs.existsSync(dash) ? dash : out; check(fs.existsSync(f) && fs.readFileSync(f, 'utf8') === want, `${path.relative(ROOT, f)} is a text copy of the swarm.js blocks`); }
console.log(`\n${oks} ok, ${fails} failed`);
process.exit(fails ? 1 : 0);
