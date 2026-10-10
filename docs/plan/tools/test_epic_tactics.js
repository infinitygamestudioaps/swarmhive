// OFFLINE TEST of the EPIC BOSS TACTICS (user 2026-10-10: the L2Toggle guides for Core / Queen Ant / Orfen):
//   node docs/plan/tools/test_epic_tactics.js       (exit code 1 when a check fails; read-only: never writes game / log files)
// 1) Scripts/data/epic_tactics.json: parses, validates (epicValidate), guide URLs, levels (Core 50 by the user), zones, minions vs npcs_h5.json
// 2) the requirement check (EPIC-PURE epicCheck) for sample parties + the LIVE roster (Logs/swarm_state_*.json, read only) per party
// 3) the 10-clients-per-IP rule (epicZoneCount + epicCheck 'clients')
// 4) phase machines with a simulated fight timeline per boss (Core waves, Queen Ant rush -> larva -> boss, Orfen 50 % teleport -> nest)
// 5) focus pick + formation slots
// 6) wiring: swarm.js hooks, no new Map(), raidspage.js copy in sync (epic_sync.js --check), the dashboard renderer, no browser dialogs
const fs = require('fs'), path = require('path'), cp = require('child_process');
const ROOT = path.join(__dirname, '..', '..', '..');
const SRC = path.join(ROOT, 'Scripts_dev', 'swarm.js'), DATA = path.join(ROOT, 'Scripts', 'data', 'epic_tactics.json');
const src = fs.readFileSync(SRC, 'utf8');
let fails = 0, n = 0;
const check = (ok, what) => { n++; console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails++; };

const a = src.indexOf('// EPIC-PURE-BEGIN'), b = src.indexOf('// EPIC-PURE-END');
if (a < 0 || b < a) { console.error('EPIC-PURE block not found'); process.exit(1); }
const PURE = src.slice(a, b);
const M = new Function(PURE + '\nreturn { EPICP, epicTacticOf, epicDefaults, epicLevel, epicRoleKind, epicCounts, epicZoneCount, epicCheck, epicPhaseInit, epicPhaseOf, epicCond, epicPhaseStep, epicWhenText, epicRules, epicPoint, epicFocusPick, epicSlot, epicStagePoint, epicGuideText, epicValidate };')();
check(!/new Map\(/.test(PURE), 'pure block: no new Map() (the L2Swarm world-map host type)');

// ---- 1) data ---------------------------------------------------------------------------------------------------------------------
const J = JSON.parse(fs.readFileSync(DATA, 'utf8').replace(/^﻿/, ''));
const v = M.epicValidate(J);
check(!v.length, `epic_tactics.json validates${v.length ? ': ' + v.join('; ') : ''}`);
const core = M.epicTacticOf(J, { id: 29006, name: 'Core' }), qa = M.epicTacticOf(J, 'Queen Ant'), orf = M.epicTacticOf(J, 29014);
check(core && qa && orf, 'Core, Queen Ant, Orfen have a tactic (by id, by name, by id as a number)');
check(M.epicTacticOf(J, 'core') === core && M.epicTacticOf(J, '29006') === core && M.epicTacticOf(J, { name: 'Zaken' }) === null, 'lookup: case-insensitive name, id string; no tactic for other epics');
check(/topic\/477-how-to-core/.test(core.source.url) && /topic\/476-how-to-ant-queen/.test(qa.source.url) && /topic\/475-how-to-orfen/.test(orf.source.url), 'each tactic carries its guide URL');
check(M.epicLevel(core, 0).level === 50 && M.epicLevel(core, 0).source === 'user', 'Core level 50 from the user (the guide says 40)');
check(M.epicLevel(core, 52).level === 52 && M.epicLevel(core, 52).source === 'live', 'the live level wins once the boss is seen');
check(M.epicLevel(orf, 0).level === 50 && M.epicLevel(orf, 0).source === 'datapack', 'Orfen: datapack 50 until seen live (the guide says 60)');
check(core.zone.maxClientsPerIp === 10 && qa.zone.maxClientsPerIp === 10 && orf.zone.maxClientsPerIp === 10, 'max 10 clients per IP in every epic zone');
check(core.zone.levelCap === 55 && qa.zone.levelCap === null && orf.zone.levelCap === null, 'level caps: Core 55 (Mozella), Queen Ant / Orfen nest unknown (null)');
check(core.requirements.meleeUseless && qa.requirements.meleeUseless && !orf.requirements.meleeUseless, 'melee useless: Core + Queen Ant (guide), not Orfen');
{ const npcs = JSON.parse(fs.readFileSync(path.join(ROOT, 'Scripts', 'data', 'npcs_h5.json'), 'utf8'));
  const bad = []; [core, qa, orf].forEach(t => { if (!npcs[String(t.id)] || npcs[String(t.id)].n !== t.name) bad.push(t.name); t.minions.forEach(m => { const x = npcs[String(m.id)]; if (!x || x.n !== m.name) bad.push(`${t.name}/${m.name}`); }); });
  check(!bad.length, `boss + minion ids / names match npcs_h5.json${bad.length ? ': ' + bad.join(', ') : ''}`); }
{ const rb = JSON.parse(fs.readFileSync(path.join(ROOT, 'Scripts', 'data', 'raidbosses_h5.json'), 'utf8')).bosses;
  check([29006, 29001, 29014].every(id => rb.some(x => x.id === id)), 'all three are in raidbosses_h5.json (findBoss / !mission raid <boss>)'); }
{ const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'Scripts', 'data', 'dungeon_rooms.json'), 'utf8')).find(x => x.key === 'cruma');
  const links = [].concat(...d.floors.map(f => f.links || []));
  const cub = links.find(l => l.linkText === 'Teleport into The Core room.'), han = links.find(l => l.linkText === 'Go to the 3rd floor.');
  const st = core.route.steps;
  check(cub && st[2].link === cub.linkText && st[2].npc.id === cub.npc.id && st[2].land[1] === cub.land.y, 'Core route: the Teleportation Cubic link + landing = dungeon_rooms.json');
  check(han && st[1].link === han.linkText && st[1].npc.id === han.npc.id, 'Core route: Hanna "Go to the 3rd floor." = dungeon_rooms.json');
  check(/<= 55/.test((d.entryLinks[0] || {}).needs || ''), 'Cruma entry (Mozella) needs level <= 55 = the Core zone cap'); }
check(Object.keys(J.bosses).every(k => J.bosses[k].phases.every(p => p.label && p.say)), 'every phase has a label and a party-chat line');
check(J.enabledInRaidhunt === false, 'raidhunt keeps leaving the epics out by default (enabledInRaidhunt false)');
check(fs.existsSync(path.join(ROOT, 'docs', 'plan', 'epic_guides.md')) && /topic\/477/.test(fs.readFileSync(path.join(ROOT, 'docs', 'plan', 'epic_guides.md'), 'utf8')), 'docs/plan/epic_guides.md: the guide summaries with their URLs');

// ---- 2) requirement checks ---------------------------------------------------------------------------------------------------------
const mk = (spec) => spec.split(' ').map(s => { const [nm, lv, role] = s.split(':'); return { name: nm, level: +lv, role }; });
const P1 = mk('Tank1:55:sk Bishop1:55:bishop Destroyer1:55:destroyer Destroyer2:55:destroyer Doombringer1:55:doombringer Necro1:55:necromancer Inspector1:55:inspector Chanter1:55:doomcryer Saint1:55:shilliensaint');
let c = M.epicCheck(J, core, P1, {});
check(!c.ok && /damage caster/.test(c.refuse) && c.items.find(i => i.key === 'curse').ok && c.items.find(i => i.key === 'levelCap').ok, `Core vs party Tank1 (55, 1 caster): REFUSED — ${c.refuse}`);
c = M.epicCheck(J, qa, P1, {});
check(!c.ok && /raid curse above 48/.test(c.refuse), `Queen Ant vs party Tank1 (55): REFUSED (curse) — ${c.refuse}`);
c = M.epicCheck(J, orf, P1, {});
check(c.ok, `Orfen (50) vs party Tank1 (55): allowed${c.items.filter(i => !i.ok).length ? ' with warnings: ' + c.items.filter(i => !i.ok).map(i => i.label).join('; ') : ''}`);
const MAGE = (lv) => mk(`Tank:${lv}:sk Heal1:${lv}:bishop Heal2:${lv}:shilliensaint M1:${lv}:nuker M2:${lv}:nuker M3:${lv}:nuker M4:${lv}:nuker M5:${lv}:necromancer M6:${lv}:nuker`);
c = M.epicCheck(J, core, MAGE(53), {});
check(c.ok && c.items.every(i => i.ok), 'Core vs the guide party (tank + 2 healers + 6 mages, lvl 53): every requirement green');
c = M.epicCheck(J, core, MAGE(56), {});
check(!c.ok && /zone cap 55/.test(c.refuse), `Core with level 56: refused by the Cruma level cap — ${c.refuse}`);
c = M.epicCheck(J, core, MAGE(45), {});
check(!c.ok && /need 50/.test(c.refuse), `Core with level 45: refused (below the boss) — ${c.refuse}`);
c = M.epicCheck(J, core, MAGE(50), {});
check(c.ok && c.items.find(i => i.key === 'suggested').ok === false, 'Core with level 50: allowed, the guide level (53) shows as a warning');
c = M.epicCheck(J, qa, MAGE(42), {});
check(c.ok, 'Queen Ant vs a level-42 mage party: allowed');
c = M.epicCheck(J, qa, MAGE(49), {});
check(!c.ok && /curse/.test(c.refuse), 'Queen Ant at level 49: refused (raid curse above 48)');
c = M.epicCheck(J, core, MAGE(53).filter(m => m.role !== 'bishop'), {});
check(!c.ok && /1 healer/.test(c.refuse), 'Core with one healer: refused (needs 2)');
c = M.epicCheck(J, core, MAGE(53).filter(m => m.role !== 'sk'), {});
check(!c.ok && /0 tank/.test(c.refuse), 'Core without a tank: refused');
check(M.epicRoleKind('shilliensaint', J) === 'healer' && M.epicRoleKind('nuker', J) === 'caster' && M.epicRoleKind('doomcryer', J) === 'buffer' && M.epicRoleKind('destroyer', J) === 'melee' && M.epicRoleKind('sk', J) === 'tank' && M.epicRoleKind('crafter', J) === 'melee', 'role kinds by token (healer / caster / buffer / melee / tank)');
// the live roster (read only)
{
  const logs = path.join(ROOT, 'Logs'); let cfg = {}; try { cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'swarm.config.json'), 'utf8')); } catch (e) { }
  const partyOf = {}; (cfg.accounts || []).forEach(x => { if (x.character) partyOf[x.character] = x.party || x.leader || ''; });
  const states = []; try { fs.readdirSync(logs).filter(f => /^swarm_state_.+\.json$/.test(f)).forEach(f => { try { const s = JSON.parse(fs.readFileSync(path.join(logs, f), 'utf8')); if (s && s.name && f === `swarm_state_${s.name}.json`) states.push(s); } catch (e) { } }); } catch (e) { }
  const parties = {}; states.forEach(s => { const p = partyOf[s.name] || (s.leader === true ? s.name : typeof s.leader === 'string' ? s.leader : '?'); (parties[p] = parties[p] || []).push({ name: s.name, level: +s.level || 0, role: s.role || '' }); });
  const keys = Object.keys(parties);
  console.log(`     live roster: ${states.length} characters in ${keys.length} parties`);
  keys.forEach(p => { const row = [core, qa, orf].map(t => { const r = M.epicCheck(J, t, parties[p], {}); return `${t.name} ${r.ok ? 'OK' : 'refused (' + r.refuse.slice(0, 70) + ')'}`; }).join(' | ');
    console.log(`     party ${p} (${parties[p].length}, lvl ${Math.min(...parties[p].map(m => m.level))}-${Math.max(...parties[p].map(m => m.level))}): ${row}`); });
  check(keys.every(p => [core, qa, orf].every(t => typeof M.epicCheck(J, t, parties[p], {}).ok === 'boolean')), 'live roster: the check runs for every party (no throw)');
}

// ---- 3) 10 clients per IP ----------------------------------------------------------------------------------------------------------
{
  const P = MAGE(53), inside = { x: 17726, y: 110000, z: -6500 }, outside = { x: 17726, y: 140000, z: -3000 };
  const chars = [{ name: 'X1', ...inside, ageMs: 1000 }, { name: 'X2', ...inside, ageMs: 2000 }, { name: 'X3', ...outside, ageMs: 1000 }, { name: 'X4', ...inside, ageMs: 600000 }, { name: 'Tank', ...inside, ageMs: 1000 }];
  const z = M.epicZoneCount(core, chars, P.map(m => m.name));
  check(z.n === 2 && z.names.join() === 'X1,X2', 'zone count: our other characters inside the Core room (fresh only, not this party, not outside)');
  check(M.epicZoneCount(core, [{ name: 'Y', x: 17726, y: 110000, z: -9000 }], []).n === 0, 'zone count: same x/y on another floor of Cruma (z) does not count');
  let r = M.epicCheck(J, core, P, { others: 1 });
  check(r.ok && r.items.find(i => i.key === 'clients').have === 10, '9 + 1 already inside = 10 clients: allowed');
  r = M.epicCheck(J, core, P, { others: 2 });
  check(!r.ok && /11 of our characters/.test(r.refuse), '9 + 2 already inside = 11: REFUSED (max 10 per IP)');
}

// ---- 4) phase machines --------------------------------------------------------------------------------------------------------------
function sim(t, timeline, label) {
  const st = M.epicPhaseInit(t, 0), seen = [st.phase];
  for (const ev of timeline) { const r = M.epicPhaseStep(t, st, Object.assign({ flags: {} }, ev)); if (r.changed) seen.push(`${r.to}@${ev.now / 1000}`); }
  console.log(`     ${label}: ${seen.join(' -> ')}`);
  return { st, seen };
}
{
  const T = []; let tm = 0;
  const at = (s, o) => { tm = s * 1000; T.push(Object.assign({ now: tm, minions: 0, wave: 0, bossHp: 100 }, o)); };
  at(1, {}); at(5, {});                                    // stage -> pull after 4 s
  at(10, {}); at(20, { minions: 12 });                     // pulling
  at(24, { minions: 30, flags: { pulled: 24000 } });       // the tank is back with the pull -> wave1
  at(30, { minions: 28, wave: 2 }); at(40, { minions: 22, wave: 7 });   // 7 new ones come round the corner -> wave2
  at(45, { minions: 30 }); at(52, { minions: 2 });         // wave 2 dies -> clear (after 10 s in wave2)
  at(60, { minions: 1 }); at(66, { minions: 0 }); at(80, { minions: 0 });   // clear -> boss after 12 s without minions
  const r = sim(core, T, 'Core');
  check(r.seen.map(s => s.split('@')[0]).join() === 'stage,pull,wave1,wave2,clear,boss', 'Core: stage -> pull -> wave1 -> wave2 (second wave) -> clear -> boss');
  const R = (ph) => M.epicRules(core, { phase: ph });
  check(R('pull').bossOffLimits && R('pull').focus === 'none' && R('pull').tankSpam === false && R('pull').tank === 'pull', 'Core pull: nobody attacks, no aggro spam, boss off limits');
  check(R('wave1').areaAggro === 'hold' && R('wave1').ud === 'hold' && R('wave1').focus === 'minions' && R('wave1').bossOffLimits, 'Core wave 1: AoE on minions, hate aura + UD held, boss off limits');
  check(R('wave2').areaAggro === 'now' && R('wave2').ud === 'afterArea', 'Core wave 2: hate aura NOW, Ultimate Defense right after it');
  check(!R('boss').bossOffLimits && R('boss').focus === 'minions-then-boss' && R('boss').formation.healer > R('boss').formation.caster, 'Core boss phase: boss allowed, respawning minions first, spread (healers behind casters)');
  // a pull that never reports back: 45 s timeout
  const r2 = sim(core, [{ now: 5000 }, { now: 50000 }, { now: 96000 }], 'Core (pull without report)');
  check(r2.seen[2] === 'wave1@50', 'Core: the pull ends after 45 s even without the tank report');
  // a wave count that started before the phase does not count: waveAtLeast needs after 3 s
  const st = M.epicPhaseInit(core, 0); st.phase = 'wave1'; st.since = 100000;
  check(!M.epicPhaseStep(core, st, { now: 101000, minions: 30, wave: 9, flags: {} }).changed, 'Core wave 1 -> 2 not in the first 3 s of wave 1');
  // flags from the previous phase do not carry over
  const st2 = M.epicPhaseInit(core, 0); st2.phase = 'pull'; st2.since = 50000; st2.flags.pulled = 40000;
  check(!M.epicPhaseStep(core, st2, { now: 51000, flags: {} }).changed, 'a flag set before the phase began does not count (old pull report)');
}
{
  const T = [{ now: 4000 }, { now: 10000 }, { now: 20000, flags: { tankAt: 20000 } }, { now: 25000 }, { now: 30000, flags: { tankAggro: 29000 } }, { now: 35000 }];
  const r = sim(qa, T, 'Queen Ant');
  check(r.seen.map(s => s.split('@')[0]).join() === 'stage,rush,larva,boss', 'Queen Ant: stage -> rush -> larva -> boss');
  const R = (ph) => M.epicRules(qa, { phase: ph });
  check(R('rush').bossOffLimits && R('rush').focus === 'none' && R('rush').tank === 'rush' && R('rush').team === 'follow', 'QA rush: run past everything to the larva, nobody attacks');
  check(R('larva').focus === 'larva' && R('larva').aoeMinMobs === 1, 'QA larva: target the larva, AoE first');
  // focus pick: boss-larva
  const larva = { id: 2, x: 0, y: 0 };
  check(M.epicFocusPick(R('boss'), { boss: { id: 1, x: 200, y: 0 }, larva, minions: [] }) === 1, 'QA boss phase: the Queen inside AoE range of the larva -> the Queen');
  check(M.epicFocusPick(R('boss'), { boss: { id: 1, x: 900, y: 0 }, larva, minions: [] }) === 2, 'QA boss phase: the Queen walked off -> the larva (keep the AoE on it)');
  check(M.epicFocusPick(R('rush'), { boss: { id: 1, x: 0, y: 0 }, larva, minions: [{ id: 5, x: 1, y: 1 }] }) === -1, 'QA rush: focus -1 (nobody attacks, not even the boss by fallback)');
}
{
  const T = [{ now: 10000, bossHp: 80 }, { now: 60000, bossHp: 52 }, { now: 65000, bossHp: null, flags: { bossTeleported: 65000 } },
    { now: 120000, flags: { tankAt: 120000 } }, { now: 124000 }, { now: 140000, flags: { pulled: 140000 } }, { now: 150000, bossHp: 40 }];
  const r = sim(orf, T, 'Orfen');
  check(r.seen.map(s => s.split('@')[0]).join() === 'stage1,follow,lure,stage2', 'Orfen: stage 1 -> 50 % teleport -> follow to the nest -> lure -> stage 2');
  const R = (ph) => M.epicRules(orf, { phase: ph });
  check(R('stage1').ud === 'hold' && !R('stage1').bossOffLimits, 'Orfen stage 1: NO Ultimate Defense ("you will need it later")');
  check(R('follow').team === 'goto' && R('follow').tank === 'goto' && R('follow').anchor === 'nestEntrance', 'Orfen follow: everyone walks to the nest entrance');
  check(R('lure').tank === 'lure' && R('lure').focus === 'none' && R('lure').tankSpam === false, 'Orfen lure: the tank runs in WITHOUT hitting anything');
  check(R('stage2').areaAggro === 'now' && R('stage2').ud === 'afterArea' && R('stage2').focus === 'boss', 'Orfen stage 2: hate aura, then UD, all on Orfen');
  // a lure that never reports: the boss at the entrance also ends it, else 60 s
  const st = M.epicPhaseInit(orf, 0); st.phase = 'lure'; st.since = 0;
  check(M.epicPhaseStep(orf, st, { now: 5000, flags: { bossNearAnchor: 5000 } }).to === 'stage2', 'Orfen lure ends when she is at the entrance');
  const r3 = sim(orf, [{ now: 1000, bossHp: 60 }, { now: 30000, bossHp: 55 }], 'Orfen (no teleport yet)');
  check(r3.seen.length === 1, 'Orfen stays in stage 1 until the teleport');
  check(M.epicWhenText({ flag: 'bossTeleported' }) === 'the boss teleported' && /after 45 s/.test(M.epicWhenText({ after: 45000 })), 'plain-language conditions for the guide box');
}

// ---- 5) focus + formation --------------------------------------------------------------------------------------------------------
{
  const R = M.epicRules(core, { phase: 'wave1' });
  const mins = [{ id: 11, x: 100, y: 0 }, { id: 12, x: 300, y: 0, onMate: true }, { id: 13, x: 900, y: 0, onHealer: true }];
  check(M.epicFocusPick(R, { minions: mins, from: { x: 0, y: 0 } }) === 13, 'focus: a minion on a healer first');
  check(M.epicFocusPick(R, { minions: mins.slice(0, 2), cur: 11, from: { x: 0, y: 0 } }) === 11, 'focus: sticky on the current one');
  check(M.epicFocusPick(R, { minions: mins.slice(0, 2), from: { x: 0, y: 0 } }) === 12, 'focus: then one on a teammate');
  check(M.epicFocusPick(R, { minions: [], boss: { id: 1, x: 0, y: 0 } }) === -1, 'Core wave: no minion -> -1, NEVER the boss');
  check(M.epicFocusPick(M.epicRules(core, { phase: 'boss' }), { minions: [], boss: { id: 1, x: 0, y: 0 } }) === 1, 'Core boss phase: no minion -> the boss');
  const anchor = { x: 0, y: 0 }, enemy = { x: 0, y: -1000 };
  const sc = M.epicSlot({ kind: 'caster', rules: R, anchor, enemy, off: 0 }), sh = M.epicSlot({ kind: 'healer', rules: R, anchor, enemy, off: 0 });
  check(sc.y > 0 && sh.y > sc.y && Math.abs(sc.x) < 2, `formation: casters ${Math.round(sc.y)} and healers ${Math.round(sh.y)} BEHIND the anchor, away from the enemy (tank front, mages middle, healers rear)`);
  check(M.epicSlot({ kind: 'melee', rules: R, anchor, enemy }) === null, 'formation: melee with a target fight behind it (no slot)');
  check(M.epicSlot({ kind: 'melee', rules: M.epicRules(core, { phase: 'pull' }), anchor, enemy }) !== null, 'formation: melee stay at the wall during the pull');
  const qs = M.epicStagePoint(qa, { x: -21600 + 5000, y: 179482, z: -5800 }, {});
  check(Math.round(Math.hypot(qs.x - -21600, qs.y - 179482)) === 1800 && qs.x > -21600, 'QA stage: 1800 from the larva toward the team');
  check(M.epicStagePoint(core, { x: 0, y: 0 }, {}).x === 17691, 'Core stage: the hold point (the wall / room landing)');
  const g = M.epicGuideText(J, core);
  check(g.some(s => s.h === 'Server rules' && s.lines.some(l => /max 10 clients per IP/.test(l))) && g.some(s => s.h === 'Fight' && s.lines.length === core.phases.length), 'guide text: server rules + one line per phase');
}

// ---- 6) wiring --------------------------------------------------------------------------------------------------------------------
const has = (re, what) => check(re.test(src), what);
has(/if \(data && data\.epic\) return epicEngage\(data\);/, 'engage: an epic engage runs epicEngage (no L2Swarm combat)');
has(/epicT = epicFor\(boss\);[\s\S]{0,400}if \(!chk\.ok\) \{ epicRefuse\(epicT, chk\); return; \}/, 'leaderMission: the pre-check refuses BEFORE any trip');
has(/if \(epicT\) \{ const eo = await epicMission\(boss, epicT, runId\);/, 'leaderMission: lead mode runs epicMission for an epic');
has(/async function raidMissionFinish\(boss, outcome\)/, 'the raid result block is shared (raidMissionFinish)');
has(/if \(epicCtl\.on\) \{ try \{ epicFocusTick\(\); \} catch \(e\) \{ \} return; \}/, 'focus broadcast: the epic phase decides');
has(/const area = epicAreaHold\(\) \? null : near\.filter\(/, 'tank aggro spam: hate aura held when the phase says so');
has(/if \(epicTankSpamOff\(\)\) return;/, 'tank aggro spam: off in stage / pull / rush / lure');
has(/if \(epicUdHold\(hp\)\) return;/, 'Ultimate Defense: held when the phase says so');
has(/aoeMinMobs: epicAoeMin\(CONFIG\.autoSkills\.aoeMinMobs\)/, 'raidDealer: the phase AoE gate');
has(/filter\(b => epicHuntOk\(b, lo, hi\) \|\| b\.type === 'raid' && !EPIC_BOSS_RE/, 'raidhunt: epics only via epicHuntOk (off by default)');
has(/async function waitBossDead\(b, runId, ms, opt\)/, 'waitBossDead: options (wider search, Orfen lost limit)');
has(/epicLiveExtras\(out\)/, 'raid_live: epic phase extras');
has(/const epre = !rcl && state\.mode !== 'raid' && epicPreLive\(\);/, 'raid_live: before the fight too (travel / search / stage)');
check((src.match(/epicOwnsMove\(\)/g) || []).length >= 7, 'raid spacing / caster spacing / dealer follow moves stand aside for the epic formation');
check(!/scroll of resurrection|UseItem\(\s*737/i.test(src.slice(src.indexOf('// ===== EPIC HOST'), src.indexOf('// LOOT RECORD'))), 'the epic code never uses a resurrection scroll (raid rule)');
check(!/useEscape|townCommand|Scroll of Escape/.test(src.slice(src.indexOf('// ===== EPIC HOST'), src.indexOf('// LOOT RECORD'))), 'the epic code never escapes (raid rule)');
check(!/new Map\(/.test(src.slice(src.indexOf('// ===== EPIC HOST'), src.indexOf('// LOOT RECORD'))), 'host block: no new Map()');
['ORDERSTICK', 'CLASSPLAN', 'ROLEKIND', 'BUFFPLAN', 'RAIDAREA'].forEach(k => check(src.includes(`// ${k}-PURE-BEGIN`) && src.includes(`// ${k}-PURE-END`), `${k}-PURE block intact`));
try { cp.execFileSync(process.execPath, ['--check', SRC], { stdio: 'pipe' }); check(true, 'node --check Scripts_dev/swarm.js'); } catch (e) { check(false, 'node --check Scripts_dev/swarm.js: ' + String(e.stderr || e.message).slice(0, 300)); }
{ let ok = true, out = ''; try { out = cp.execFileSync(process.execPath, [path.join(__dirname, 'epic_sync.js'), '--check'], { encoding: 'utf8', stdio: 'pipe' }); } catch (e) { ok = false; out = String(e.stdout || e.message); }
  check(ok, `Dashboard/raidspage.js carries the current tactics + EPIC-PURE (${out.trim().slice(0, 100)})`); }
{ const page = fs.readFileSync(path.join(ROOT, 'Dashboard', 'raidspage.js'), 'utf8');
  check(/function renderGuide\(b, p\)/.test(page) && /id="rpbGuideBox"/.test(page) && /renderGuide\(b, p\)/.test(page), 'dashboard: Guide box on the boss page (renderBossStatus -> renderGuide)');
  check(!/[^.\w](alert|confirm|prompt)\(/.test(page.replace(/uiConfirm|uiAlert|uiPrompt/g, '')), 'dashboard: no browser alert / confirm / prompt');
  try { cp.execFileSync(process.execPath, ['--check', path.join(ROOT, 'Dashboard', 'raidspage.js')], { stdio: 'pipe' }); check(true, 'node --check Dashboard/raidspage.js'); } catch (e) { check(false, 'node --check raidspage.js'); }
  // the page copy works in node too (same answers as the swarm block)
  const g0 = page.indexOf('// EPIC-GUIDE-BEGIN'), g1 = page.indexOf('// EPIC-GUIDE-END');
  const PM = new Function(page.slice(g0, g1) + '\nreturn { EPIC_TACTICS, epicCheck, epicTacticOf };')();
  const x = PM.epicCheck(PM.EPIC_TACTICS, PM.epicTacticOf(PM.EPIC_TACTICS, { id: 29006 }), MAGE(53), {}), y = M.epicCheck(J, core, MAGE(53), {});
  check(JSON.stringify(x) === JSON.stringify(y), 'the dashboard copy gives the same requirement check as the bots'); }

console.log(`\n${n - fails}/${n} checks passed${fails ? ' — ' + fails + ' FAILED' : ''}`);
process.exit(fails ? 1 : 0);
