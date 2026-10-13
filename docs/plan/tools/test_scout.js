// OFFLINE TEST of the SCOUT order (user 2026-10-10: "It should be possible to send a char to an epic raid to see if it's up"):
//   node docs/plan/tools/test_scout.js      (exit code 1 when a check fails; nothing reaches the game, no file outside memory is written)
// 1) EPIC-PURE scout*: who may go (scoutAllowed), who goes (scoutPick: most expendable), the safe look-out (scoutLookouts: tactic look-out,
//    out of the aggro ranges, inside the view range, every Orfen spawn spot), the verdict (scoutVerdict) and the raid_status text round trip
// 2) the host scoutRun / scoutCommand of Scripts_dev/swarm.js run in node with mocked host calls (fake clock): alive, not there, Orfen's spots,
//    attacked on the way (no fight, no status write, back to town), Core's route (floors + Cubic), refusals (party in a raid, busy leader)
// 3) wiring: !scout in the chat switch, benched() = away scouts, the command catalog entry, the dashboard button
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const src = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8').replace(/\r\n/g, '\n');
// Scripts/data/epic_tactics.json is OWNER ONLY (not in the public package): without it the boss-tactic checks (Core / Orfen / Queen Ant) skip,
// the generic scout checks still run (TEST_NO_EPIC=1 simulates the public package)
const EPIC_FILE = path.join(ROOT, 'Scripts', 'data', 'epic_tactics.json');
const HAVE_EPIC = !process.env.TEST_NO_EPIC && fs.existsSync(EPIC_FILE);
// without the file: no bosses, but the role kinds the scout pick needs (same regexes as epic_tactics.json roleKinds)
const J = HAVE_EPIC ? JSON.parse(fs.readFileSync(EPIC_FILE, 'utf8')) : { version: 1, bosses: {}, roleKinds: { tank: '^(sk|tank)$', healer: 'healer|bishop|shilliensaint', caster: '^(necromancer|nuker|mage|wizard|summoner)$', buffer: '^(doomcryer|warcryer|buffer|meleebuffer)$', melee: '^(destroyer|doombringer|inspector|dagger|melee|archer|spoiler|crafter|gladiator|warlord)$' } };
if (!HAVE_EPIC) console.log('skip: boss tactic checks (Core / Orfen / Queen Ant) need Scripts/data/epic_tactics.json (dev install only)');
const RB = JSON.parse(fs.readFileSync(path.join(ROOT, 'Scripts', 'data', 'raidbosses_h5.json'), 'utf8')).bosses;
let fails = 0, n = 0;
const check = (ok, what) => { n++; console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails++; };
const PURE = src.slice(src.indexOf('// EPIC-PURE-BEGIN'), src.indexOf('// EPIC-PURE-END'));
const M = new Function(PURE + '\nreturn { SCOUTP, scoutAllowed, scoutPick, scoutLookouts, scoutVerdict, scoutSrc, scoutSrcParse, epicTacticOf };')();
const core = HAVE_EPIC ? M.epicTacticOf(J, 'Core') : null, orf = HAVE_EPIC ? M.epicTacticOf(J, 'Orfen') : null, qa = HAVE_EPIC ? M.epicTacticOf(J, 'Queen Ant') : null;

// ---- 1) pure ------------------------------------------------------------------------------------------------------------------------
check(M.scoutAllowed({ name: 'A' }).ok && !M.scoutAllowed({ name: 'A', dead: true }).ok && !M.scoutAllowed({ name: 'A', online: false }).ok, 'allowed: alive + online only');
check(!M.scoutAllowed({ name: 'A', partyInRaid: true }, { picked: true }).ok, 'never a character whose party is in a raid (even when picked)');
check(!M.scoutAllowed({ name: 'L', leader: true }).ok && !M.scoutAllowed({ name: 'L', leader: true, partyBusy: true }, { picked: true }).ok && M.scoutAllowed({ name: 'L', leader: true }, { picked: true }).ok,
  'a party leader only when the user picks him AND the party is idle');
const C = [{ name: 'Lead', level: 55, role: 'sk', leader: true }, { name: 'Heal', level: 40, role: 'bishop' }, { name: 'Nuke', level: 38, role: 'nuker' },
  { name: 'Axe', level: 44, role: 'destroyer' }, { name: 'Dag', level: 41, role: 'dagger' }, { name: 'Gone', level: 30, role: 'destroyer', dead: true }];
const pk = M.scoutPick(C, { J });
check(pk.name === 'Dag' && pk.ranked.join() === 'Dag,Axe,Nuke,Heal', `pick: the most expendable — melee first, lowest level; casters, healers after; never the leader / the dead (${pk.ranked.join(' > ')})`);
check(M.scoutPick([{ name: 'Lead', role: 'sk', leader: true }], { J }).name === '', 'pick: nobody free -> no name (the user names one)');
const BOSS = { x: 10000, y: 20000, z: -3000 };
let L = M.scoutLookouts(null, BOSS, { x: 30000, y: 20000 }, {});
check(L.length === 1 && Math.round(Math.hypot(L[0].x - BOSS.x, L[0].y - BOSS.y)) === M.SCOUTP.lookDist && L[0].x > BOSS.x, `generic look-out: ${M.SCOUTP.lookDist} from the spawn, toward me`);
L = M.scoutLookouts(null, BOSS, { x: 30000, y: 20000 }, { aggro: 3100 });
check(Math.round(Math.hypot(L[0].x - BOSS.x, L[0].y - BOSS.y)) === M.SCOUTP.viewRange - 300, 'look-out: out of a big aggro range, but never beyond the view range (- 300)');
L = M.scoutLookouts(null, BOSS, { x: 30000, y: 20000 }, { aggro: 1500 });
check(Math.round(Math.hypot(L[0].x - BOSS.x, L[0].y - BOSS.y)) === 2200 && Math.hypot(L[0].x - BOSS.x, L[0].y - BOSS.y) > 1500 + 300 - 1, 'look-out: aggro 1500 -> 2200 (>= aggro + 300)');
L = M.scoutLookouts(null, BOSS, { x: 30000, y: 20000 }, { stage: { x: 10000, y: 22500, z: -3000 }, aggro: 1000 });
check(L[0].how === 'raid fight area stage point' && L[0].y === 22500, 'look-out: the raid fight area\'s stage point when it is in view and out of aggro');
L = M.scoutLookouts(null, BOSS, { x: 10500, y: 20000 }, {});
check(L[0].how === 'already within view' && L[0].x === 10500, 'look-out: already closer than the look-out distance -> stay');
if (HAVE_EPIC) {
L = M.scoutLookouts(core, BOSS, { x: 0, y: 0 }, {});
check(L.length === 1 && L[0].x === 17696 && L[0].y === 111812 && L[0].how === 'tactic look-out', 'Core: the tactic look-out = the Core room landing (live 2026-10-10)');
check(Math.hypot(L[0].x - 17726, L[0].y - 108915) < (core.scout.viewRange || 3500), 'Core: Core is inside the view range from the landing');
L = M.scoutLookouts(orf, BOSS, { x: 64328, y: 26803 }, { aggro: 1000 });
check(L.length === 4 && L.every((p, i) => Math.round(Math.hypot(p.x - p.of.x, p.y - p.of.y)) === 2200 || p.how === 'already within view'), 'Orfen: one look-out per spawn spot, 2200 away (her aggro 1000 + margin)');
L = M.scoutLookouts(qa, { x: -21610, y: 181594, z: -5734 }, { x: -9959, y: 176184 }, { aggro: 1000 });
check(Math.round(Math.hypot(L[0].x - -21610, L[0].y - 181594)) === 2800, 'Queen Ant: 2800 from her toward the way in (tactic lookDist)');
}
check(M.scoutVerdict({ reached: true, seen: true }).result === 'alive', 'verdict: in sight -> alive');
check(M.scoutVerdict({ reached: true, seen: false, spotsLooked: 1, spots: 1 }).result === 'not-there', 'verdict: reached + not in sight -> not there');
check(M.scoutVerdict({ reached: false }).result === 'unknown' && M.scoutVerdict({ reached: false }).alive === null, 'verdict: did not get there -> unknown (no status written)');
check(M.scoutVerdict({ reached: true, attacked: true, spotsLooked: 2, spots: 4 }).result === 'unknown', 'verdict: attacked before every Orfen spot was checked -> unknown');
check(M.scoutVerdict({ reached: true, seenDead: true }).result === 'not-there', 'verdict: its body in sight -> not there');
const s1 = M.scoutSrc('Dag', { result: 'alive' }), s2 = M.scoutSrc('Dag', { result: 'not-there' });
check(M.scoutSrcParse(s1).alive === true && M.scoutSrcParse(s2).alive === false && M.scoutSrcParse(s1).by === 'Dag' && M.scoutSrcParse('killed by us') === null, 'raid_status src text round trip (the boss page badge)');

// ---- 2) host: scoutRun / scoutCommand with mocks ------------------------------------------------------------------------------------
const HOST = src.slice(src.indexOf('// ===== SCOUT'), src.indexOf('\n\n// LOOT RECORD', src.indexOf('// ===== SCOUT')));
check(HOST.length > 1000 && !/new Map\(/.test(HOST), 'scout host block found, no new Map()');
function world(o) {
  let T = 1e9; const ivs = [], said = [], notes = [], status = [], files = {}, esc = [], trips = [], links = [], tps = [];
  const Me = Object.assign({ Name: 'Dag', X: 83473, Y: 148554, Z: -3400, Level: 41, IsDead: false, HpPercent: 100 }, o.me || {});
  const ctx = {
    console, Math, JSON, String, Number, Object, Array, Date, isFinite, Promise, Error,
    now: () => T, num: (v) => Number(v) || 0, Me, state: Object.assign({ running: true, mode: 'idle', role: 'dagger' }, o.state || {}),
    CONFIG: { roster: { Dag: 1, Lead: 1, Axe: 1 } }, SWARM_ROOT: 'X', liveFileName: () => Me.Name, P: (x, y, z) => `${Math.round(x)},${Math.round(y)}`,
    App: { on() { }, emit(n, d) { if (n === 'swarm.scoutaway') ctx.lastAway = d; } }, File: { WriteAllText(f, t) { files[f] = JSON.parse(t); } },
    findBoss: (t) => RB.find(b => String(b.id) === String(t) || b.name.toLowerCase() === String(t).toLowerCase()) || null,
    epicFor: (b) => M.epicTacticOf(J, { id: b.id, name: b.name }), epicData: () => J, isLeader: () => !!o.leader, teamNames: () => o.team || ['Lead', 'Axe'],
    livePos: o.livePos || {}, SayToParty: (m) => said.push(m), note: (m) => notes.push(m), intent() { }, intentDone() { }, logError: (w, e) => notes.push('ERR ' + w + ' ' + e),
    orderState: { seq: 1 }, orderWaitControl: async () => true, orderRelease() { }, regroupRun: o.regroupRun || null, autoLvl: { active: !!o.autoLvl }, raidHunt: { active: false },
    inRaid: () => ctx.state.mode === 'raid', missionBoss: { until: 0 }, followHold() { }, stopCombatG() { }, lastAttackerOnMe: { id: 0, at: 0 }, aggroRange: (nm) => o.aggro || 0,
    minionNames: () => [], raidAreaOf: () => null, gkFail: '',
    orderRetry: async (name, r) => { let last = null; for (let i = 1; i <= (r.max || 3); i++) { if (r.abort && r.abort()) break; last = await r.attempt(i); if (last.ok || (r.done && r.done())) return { ok: true, tries: i }; } return { ok: false, why: last ? last.why : 'stopped', tries: r.max }; },
    goToNpc: async (q, op) => { trips.push(q + (op.solo ? ' solo' : '')); Object.assign(Me, { X: 17722, Y: 119749, Z: -9068 }); return { ok: true }; },
    epicClickLink: async (N, link, land) => { links.push(link); if (land) Object.assign(Me, { X: land[0], Y: land[1], Z: land[2] }); return true; },
    teleportNear: async (x, y) => { tps.push([x, y]); Object.assign(Me, { X: x + 2500, Y: y }); if (o.hitOnTeleport) ctx.lastAttackerOnMe = { id: 9, at: T }; },
    walkTo: async (x, y, z) => { if (o.walkFails) return false; Object.assign(Me, { X: x, Y: y, Z: z }); return true; },
    snapMobs: () => (o.mobs || []).map(m => Object.assign({ IsDead: false, HpPercent: 100, Level: 50 }, m)), Send: { StopMove() { } }, setTask() { },
    raidStatusSet: (nm, alive, s) => status.push({ nm, alive, s }), currentTownKey: () => ctx.inTown || '', useEscape: async (id, why) => { esc.push(why); ctx.inTown = 'giran'; },
    sleep: async (ms) => { T += ms; ivs.slice().forEach(f => f()); await Promise.resolve(); }, setInterval: (f) => { ivs.push(f); return ivs.length; }, clearInterval: (i) => { ivs[i - 1] = () => { }; },
    followHoldUntil: 0,
  };
  // the pure scout* + epic* functions
  const pureNames = ['SCOUTP', 'scoutAllowed', 'scoutPick', 'scoutLookouts', 'scoutVerdict', 'scoutSrc', 'scoutSrcParse', 'epPt', 'epNum', 'epicRoleKind'];
  const PM = new Function(PURE + `\nreturn { ${pureNames.join(', ')} };`)(); Object.assign(ctx, PM);
  const fn = new Function('ctx', `with (ctx) { ${HOST}\n return { scoutRun, scoutCommand, scoutCtl, scoutAwayIs }; }`);
  const H = fn(ctx);
  return { ctx, H, Me, said, notes, status, files, esc, trips, links, tps, adv: (ms) => { T += ms; } };
}
const bossOf = (nm) => RB.find(b => b.name === nm);
(async () => {
  // a) a plain raid boss, alive
  { const b = RB.find(x => x.type === 'raid' && x.level > 30 && x.nearestTeleport);
    const w = world({ mobs: [{ Name: b.name, X: b.x, Y: b.y, Z: b.z, objId: 5 }] });
    const r = await w.H.scoutRun(String(b.id), { picked: true, seq: 1 });
    check(r && r.result === 'alive' && w.status.length === 1 && w.status[0].alive === true && w.status[0].s === 'scouted by Dag: ALIVE', `generic boss (${b.name}): ALIVE -> raid_status alive "scouted by Dag: ALIVE"`);
    check(w.tps.length === 1 && w.files['X\\Logs\\scout_Dag.json'] && w.files['X\\Logs\\scout_Dag.json'].phase === 'back' && w.files['X\\Logs\\scout_Dag.json'].result === 'alive', 'teleport near the look-out, Logs/scout_<name>.json written (last phase: back)');
    check(w.esc.length === 1 && w.ctx.inTown === 'giran', 'back to town with .townname (useEscape) after the look');
    check(!w.H.scoutCtl.on && w.ctx.lastAway && w.ctx.lastAway.until === 0 && w.ctx.state.fleeUntil === 0 && !w.H.scoutAwayIs('Dag'), 'afterwards: not away any more, self-defence back, follow hold released');
    check(w.said.some(m => /\[scout\].*ALIVE/.test(m)), 'party chat: the result'); }
  // b) not there
  { const b = RB.find(x => x.type === 'raid' && x.level > 30 && x.nearestTeleport);
    const w = world({ mobs: [] });
    const r = await w.H.scoutRun(b.name, { picked: true, seq: 1 });
    check(r.result === 'not-there' && w.status[0] && w.status[0].alive === false && w.status[0].s === 'scouted by Dag: not there', 'not in sight -> raid_status alive:false "scouted by Dag: not there"'); }
  // c) Orfen: four spots, she is at the third one
  if (HAVE_EPIC) { const b = bossOf('Orfen'), sp = orf.points.search[2];
    const w = world({ mobs: [{ Name: 'Orfen', X: sp[0], Y: sp[1], Z: sp[2], objId: 7 }], aggro: 1000 });
    const r = await w.H.scoutRun('Orfen', { picked: true, seq: 1 });
    check(r.result === 'alive' && r.looked >= 1 && r.lookouts.length === 4, `Orfen: checks her spawn spots until she is in sight (looked at ${r.looked} of 4)`);
    const near = r.lookouts.map(L => Math.min(...orf.points.search.map(p => Math.hypot(p[0] - L.x, p[1] - L.y))));
    check(near.every(d => d >= 1000 + 300 - 1), 'Orfen: every look-out stays out of her aggro range (1000) + 300'); }
  // d) attacked on the way (user 2026-10-10: "the scout should just run as fast as it can"): a hit at good HP does NOT end the trip - it
  //    keeps going and looks; only real danger (HP < 50 % or 3+ monsters close) sends it back: no fight, no status, back to town
  { const b = RB.find(x => x.type === 'raid' && x.level > 30 && x.nearestTeleport);
    const w = world({ mobs: [{ Name: b.name, X: b.x, Y: b.y, Z: b.z }], hitOnTeleport: true });
    const r = await w.H.scoutRun(b.name, { picked: true, seq: 1 });
    check(r.result === 'alive', 'hit once at full HP -> keeps running, reaches the look-out and sees the boss'); }
  { const b = RB.find(x => x.type === 'raid' && x.level > 30 && x.nearestTeleport);
    const w = world({ mobs: [{ Name: b.name, X: b.x, Y: b.y, Z: b.z }], hitOnTeleport: true, me: { HpPercent: 40 } });
    const r = await w.H.scoutRun(b.name, { picked: true, seq: 1 });
    check(r.result === 'unknown' && !w.status.length && w.esc.length === 1, 'hit at low HP (40 %) -> unknown, nothing written to raid_status, back to town');
    check(w.notes.some(m => /in danger/.test(m)), 'says why (in danger, no fighting)'); }
  // e) Core: the route (Hanna via the floors, solo) + the two links, look from the room landing
  if (HAVE_EPIC) { const w = world({ mobs: [{ Name: 'Core', X: 17726, Y: 108915, Z: -6480 }] });
    const r = await w.H.scoutRun('Core', { picked: true, seq: 1 });
    check(w.trips.join() === '30486 solo' && w.links.join() === 'Go to the 3rd floor.,I am ready to face Core!', 'Core: solo trip to Hanna (Cruma floors), then Hanna + the Teleportation Cubic');
    check(r.result === 'alive' && w.Me.X === 17696 && w.tps.length === 0, 'Core: seen from the Core room landing (no teleport-near)');
    check(w.esc.length === 1, 'Core: leaves with .town at once after the look'); }
  // f) refusals
  { const w = world({ state: { mode: 'raid' } });
    const r = await w.H.scoutRun('Core', { picked: true, seq: 1 });
    check(r.result === 'unknown' && /raid/.test(r.why) && !w.trips.length && w.said.some(m => /not going/.test(m)), 'refused while my party is in a raid (said in party chat, no trip)'); }
  { const w = world({ leader: true, autoLvl: true });
    const r = await w.H.scoutRun('Core', { picked: true, seq: 1 });
    check(r.result === 'unknown' && /busy/.test(r.why), 'the leader of a busy party is refused even when picked'); }
  { const w = world({ leader: true, mobs: [{ Name: 'Core', X: 17726, Y: 108915, Z: -6480 }] });
    const r = await w.H.scoutRun('Core', { picked: true, seq: 1 });
    check(r.result === 'alive' && w.said.some(m => /party leader/.test(m)), 'the leader of an idle party may go when picked (with the Follow-Party-Leader warning)'); }
  // g) the command: the leader picks the most expendable member and names it; the named one acts; others ignore it
  { const w = world({ leader: true, me: { Name: 'Lead' }, team: ['Lead', 'Dag', 'Axe'], livePos: { Dag: { lvl: 41, role: 'dagger', at: 1e9 }, Axe: { lvl: 44, role: 'destroyer', at: 1e9 } } });
    w.H.scoutCommand(['!scout', 'Core']);
    check(w.said.some(m => m === '!scout 29006 Dag'), `no name: the leader names the most expendable free member (${w.said.join(' | ')})`); }
  { const w = world({ me: { Name: 'Axe' } });
    w.H.scoutCommand(['!scout', '29006', 'Dag']); await Promise.resolve();
    check(!w.H.scoutCtl.on && !w.trips.length, 'a !scout for another character is ignored by my window'); }

  // ---- 3) wiring ---------------------------------------------------------------------------------------------------------------
  check(/case '!scout':[\s\S]{0,200}scoutCommand\(parts\)/.test(src), "party chat: case '!scout' -> scoutCommand");
  check(/function benched\(n\) \{ return (?:runHeld\(n\) \|\| )?benchedHall\(n\) \|\| \(typeof scoutCtl !== 'undefined' && !!scoutCtl && scoutAwayIs\(n \|\| Me\.Name\)\)( \|\| qeAwayIs\(n \|\| Me\.Name\))?; \}/.test(src), 'benched(): a scout away counts as benched for its party (no split watchdog / left-behind / stuck follow)');
  check(!/if \(benched\(\)\) \{\n\s+note\(`bench: not in the Hall team/.test(src), 'the Hall bench code itself uses benchedHall() (a scout never leaves the party)');
  const cmds = require(path.join(ROOT, 'Dashboard', 'commands.js')).COMMANDS;
  check(cmds.some(c => c.id === 'scout' && c.tpl === '!scout {boss}[ {name}]'), 'command catalog: scout entry');
  const page = fs.readFileSync(path.join(ROOT, 'Dashboard', 'raidspage.js'), 'utf8');
  check(/id="rpbScout"/.test(page) && /async function scoutFlow\(\)/.test(page) && /uiChoice\(/.test(page) && /!scout \$\{b\.id\} \$\{who\}/.test(page), 'boss page: Scout button -> uiChoice (pick the character) -> !scout <id> <name>');
  check(/function scoutBadge\(r\)/.test(page) && /scoutWatch\(b, r\)/.test(page), 'boss page: scout badge + toast when a new scout result arrives');
  console.log(`\n${n - fails}/${n} checks passed${fails ? ' — ' + fails + ' FAILED' : ''}`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
