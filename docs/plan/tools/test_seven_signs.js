// OFFLINE TEST of the catacomb / necropolis entry rules (user 2026-10-08 21:50-22:00) and the dashboard level override (21:58):
//   node docs/plan/tools/test_seven_signs.js          (exit code 1 when a check fails)
// 1) SSGATE-PURE of Scripts_dev/swarm.js in node: period math (ssgNow), the team gate (ssGateDecide: registered = hard precondition,
//    competition -> Dawn sign-up first, validation -> only the registered winners, closed until the Monday change), the live files of
//    2026-10-08 (Tank3 at the Necropolis of Sacrifice), manualLevelGate (override / no override), localFallbackZone + nextSpotAfterFail
//    with the REAL Scripts/data/dungeon_rooms.json.
// 2) Entry data of EVERY catacomb + necropolis (catacombs.json vs dungeon_rooms.json vs the datapack spawns/teleports): Ziggurat NPC id +
//    position, the inside landing, inside box, gatekeeper route (missing routes are listed as warnings).
// 3) Source checks: no walk-in left in enterDungeon, the gate runs before any trip, manual choices are never put on the skip list, the
//    override branch in the landing-danger check, server.js stores override.
// 4) Dashboard: SSGATE-UI in Dashboard/index.html is a 1:1 copy of SSGATE-PURE; ssGateParty / ssGateText / spotChoiceChecks with stubs.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const src = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'Dashboard', 'index.html'), 'utf8');
const server = fs.readFileSync(path.join(ROOT, 'Dashboard', 'server.js'), 'utf8');
const rd = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/^﻿/, ''));
const blk = (s, b, e) => { const i = s.indexOf(b), j = s.indexOf(e, i); if (i < 0 || j < i) { console.error(b + ' block not found'); process.exit(1); } return s.slice(i, j); };
const SSG = blk(src, '// SSGATE-PURE-BEGIN', '// SSGATE-PURE-END');
const M = new Function(blk(src, '// ESCPURE-BEGIN', '// ESCPURE-END') + '\n' + SSG +
  '\nreturn { ssgWeek, ssgCycleOf, ssgNextChange, ssgNow, ssgSide, ssgOne, ssGateDecide, ssgUntilText, manualLevelGate, localFallbackZone, nextSpotAfterFail, LOCAL_FB, dzFloor };')();
const D = rd('Scripts/data/dungeon_rooms.json'), C = rd('Scripts/data/catacombs.json');
let fails = 0, warns = [];
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails++; };
const H = 18, EVERY = 6 * 3600e3, T = (iso) => Date.parse(iso);

// ---- 1a) period math ---------------------------------------------------------------------------------------------------------
{
  const s = { period: 'validation', winner: 'dusk', checkedAt: T('2026-10-08T18:14:02Z') };   // = Logs/sevensigns_state.json (Tank2 20:14 local)
  const c = M.ssgNow(s, T('2026-10-08T19:47:31Z'), H, EVERY);
  check(c.period === 'validation' && c.winner === 'dusk' && c.cycle === '2026-09-28' && !c.stale, `2026-10-08 19:47Z: validation, dusk won, cycle 2026-09-28, fresh (${JSON.stringify(c)})`);
  check(new Date(c.nextChange).toISOString() === '2026-10-12T18:00:00.000Z', `next change Monday 2026-10-12 18:00 UTC (${new Date(c.nextChange).toISOString()})`);
  const c2 = M.ssgNow(s, T('2026-10-12T17:59:00Z'), H, EVERY);
  check(c2.period === 'validation' && c2.stale, 'Monday 17:59 UTC: still validation (stale: re-read the priest)');
  const c3 = M.ssgNow(s, T('2026-10-12T18:01:00Z'), H, EVERY);
  check(c3.period === 'competition' && c3.cycle === '2026-10-12' && c3.winner === '' && c3.stale, `Monday 18:01 UTC: competition, cycle 2026-10-12 (${c3.period} ${c3.cycle})`);
  const c4 = M.ssgNow(s, T('2026-10-19T18:01:00Z'), H, EVERY);
  check(c4.period === 'validation' && c4.winner === 'unknown' && c4.cycle === '2026-10-12', 'a week later: validation of the 2026-10-12 cycle, winner not known yet');
  const c5 = M.ssgNow(s, T('2026-10-26T18:01:00Z'), H, EVERY);
  check(c5.period === 'validation' ? false : c5.period === 'competition' && c5.cycle === '2026-10-26', 'two weeks later: competition again (cycle 2026-10-26)');
  check(M.ssgNow({}, T('2026-10-08T19:00:00Z'), H, EVERY).period === 'unknown', 'no priest page read: period unknown');
  check(M.ssgCycleOf('competition', T('2026-10-12T18:30:00Z'), H) === '2026-10-12' && M.ssgCycleOf('validation', T('2026-10-08T12:00:00Z'), H) === '2026-09-28', 'cycle ids');
  // the live state file, if present, agrees with the math
  try { const L = rd('Logs/sevensigns_state.json'); const cl = M.ssgNow(L, L.checkedAt, H, EVERY); check(cl.cycle === L.cycle && new Date(cl.nextChange).toISOString() === L.nextChange, `live Logs/sevensigns_state.json: cycle ${L.cycle}, next change ${L.nextChange} agree with the math`); } catch (e) { warns.push('Logs/sevensigns_state.json not readable: ' + e.message); }
}
// ---- 1b) the team gate -------------------------------------------------------------------------------------------------------
const VAL = { period: 'validation', winner: 'dusk', cycle: '2026-09-28', nextChange: T('2026-10-12T18:00:00Z') };
const COMP = { period: 'competition', winner: '', cycle: '2026-10-12', nextChange: T('2026-10-19T18:00:00Z') };
const mem = (name, rec, base) => ({ name, rec: rec || {}, base: !!base });
{
  const G = M.ssGateDecide;
  const g1 = G(VAL, [mem('Tank3'), mem('Nuker11')], 'necropolis', {});
  check(g1.state === 'closed' && !g1.ok && g1.until === VAL.nextChange && /validation/.test(g1.why) && /not signed up/.test(g1.why), `validation, dusk won, nobody registered: CLOSED until the change (${g1.why})`);
  check(/^Mon 12 Oct \d\d:00$/.test(M.ssgUntilText(g1.until)), `until text: ${M.ssgUntilText(g1.until)}`);
  const g2 = G(VAL, [mem('A', { cycle: '2026-09-28', status: 'signed' })], 'necropolis', {});
  check(g2.state === 'closed' && /only the winners \(dusk\)/.test(g2.why), 'validation, dusk won, registered with DAWN: closed (only the winners)');
  const g3 = G(VAL, [mem('A', { cycle: '2026-09-28', status: 'dusk' })], 'catacomb', {});
  check(g3.state === 'enter', 'validation, dusk won, registered with Dusk: enter');
  const g4 = G(Object.assign({}, VAL, { winner: 'none' }), [mem('A', { cycle: '2026-09-28', status: 'member' })], 'catacomb', {});
  check(g4.state === 'enter', 'validation without a decisive winner, registered: enter');
  const g4b = G(Object.assign({}, VAL, { winner: 'none' }), [mem('A')], 'catacomb', {});
  check(g4b.state === 'closed', 'validation without a decisive winner, NOT registered: closed (user rule: registration is a hard precondition)');
  const g5 = G(COMP, [mem('A', { cycle: '2026-10-12', status: 'signed' }), mem('B'), mem('C', { cycle: '2026-09-28', status: 'signed' })], 'necropolis', {});
  check(g5.state === 'signup' && g5.need.join(',') === 'B,C' && !g5.ok, `competition: B (never) + C (last cycle) must sign up first (${g5.why})`);
  const g6 = G(COMP, [mem('A', { cycle: '2026-10-12', status: 'signed' }), mem('B', { cycle: '2026-10-12', status: 'member' })], 'necropolis', {});
  check(g6.state === 'enter' && g6.ok, 'competition, everyone registered: enter');
  const g7 = G(COMP, [mem('A', { cycle: '2026-10-12', status: 'signed' }), mem('Dagger1', {}, true)], 'necropolis', {});
  check(g7.state === 'closed' && g7.until === 0 && /1st class/.test(g7.why), 'a member without the 1st class transfer: closed (no date)');
  const g8 = G(COMP, [mem('A', { cycle: '2026-10-12', status: 'fee' })], 'catacomb', {});
  check(g8.state === 'closed' && /fee/.test(g8.why), 'the priest asked for a fee: closed (never paid, never Dusk)');
  const g9 = G(COMP, [mem('A', { cycle: '2026-10-12', status: 'failed', tries: 3 })], 'catacomb', { maxTries: 3 });
  check(g9.state === 'closed' && /failed 3 times/.test(g9.why), '3 failed sign-ups this cycle: closed');
  const g10 = G(COMP, [mem('A', { cycle: '2026-10-12', status: 'signed', denied: { cycle: '2026-10-12', period: 'competition', kind: 'necropolis', dungeon: 'Necropolis of Sacrifice', why: 'deceive me' } })], 'necropolis', {});
  check(g10.state === 'closed' && /refused/.test(g10.why), 'a Ziggurat refusal this period (necropolis): closed');
  check(G(COMP, [mem('A', { cycle: '2026-10-12', status: 'signed', denied: { cycle: '2026-10-12', period: 'competition', kind: 'necropolis' } })], 'catacomb', {}).state === 'enter', '... the catacombs stay open (refusal remembered per kind)');
  check(G({ period: 'unknown', cycle: null }, [mem('A')], 'catacomb', {}).state === 'check', 'period unknown: check (read the Priest of Dawn first)');
  check(G(VAL, [mem('A')], 'catacomb', { enabled: false }).state === 'enter', 'CONFIG.sevenSigns.blockDungeons = false: the gate is off');
  // the live files: every character that has a Logs/sevensigns_<name>.json — what would party Tank3 get right now (2026-10-08 19:47Z)?
  try {
    const L = rd('Logs/sevensigns_state.json'), cur = M.ssgNow(L, T('2026-10-08T19:47:31Z'), H, EVERY);
    const names = ['Tank3', 'Nuker11', 'Nuker8', 'Bishop4', 'Nuker1'].filter(n => fs.existsSync(path.join(ROOT, 'Logs', `sevensigns_${n}.json`)));
    const g = G(cur, names.map(n => mem(n, rd(`Logs/sevensigns_${n}.json`))), 'necropolis', {});
    check(g.state === 'closed' && new Date(g.until).toISOString() === '2026-10-12T18:00:00.000Z', `live files, party Tank3 (${names.join(', ')}): ${g.state} until ${g.until ? new Date(g.until).toISOString() : '-'} — ${g.why}`);
  } catch (e) { warns.push('live sevensigns files: ' + e.message); }
}
// ---- 1c) level override ------------------------------------------------------------------------------------------------------
{
  const L = M.manualLevelGate;
  const a = L(40, 42, 34, 26, 6, false);
  check(a.needOk && !a.ok && a.why === 'needs your OK: too high level (monsters 40-42, landing level-34, team max 26, safe limit 32)', `Tank2 case without override: ${a.why}`);
  const b = L(40, 42, 34, 26, 6, true);
  check(b.ok && b.above && /^hunting above level by user override/.test(b.why), `... with override: ${b.why}`);
  check(L(28, 32, 0, 26, 6, false).ok && !L(28, 32, 0, 26, 6, false).above, 'monsters 28-32 for team max 26 (limit 32): fine, no question');
  check(L(30, 33, 34, 26, 6, false).needOk, 'monsters fine but the landing has level-34 (limit 32): needs the OK');
  check(L(0, 0, 0, 26, 6, false).ok, 'no level data: fine');
}
// ---- 1d) local fallback + next spot ------------------------------------------------------------------------------------------
{
  const at = (x, y, z) => M.localFallbackZone({ x, y, z }, M.dzFloor(D, x, y, z));
  const land = at(-41633, 208722, -5088);   // the Necropolis of Sacrifice landing (19:47:30Z), outside the inside box
  check(land.kind === 'square' && land.side === 2000, `Necropolis of Sacrifice landing: small square ${land.side} (was 4000 x zoneScale 3 = 12000)`);
  const inside = at(-43000, 210152, -5088);   // Dagger1's fight 2026-10-07 23:49 (inside the necropolis)
  check(inside.kind === 'room' && inside.poly.length >= 3 && /Necropolis of Sacrifice/.test(inside.name), `inside the necropolis: the room polygon (${inside.name}, ${inside.poly && inside.poly.length} corners)`);
  const cr = D.find(d => /Cruma/i.test(d.name)); const r0 = cr && cr.floors[0].rooms.find(r => r.poly && r.center);
  if (r0) { const z = at(r0.center[0], r0.center[1], r0.center[2]); check(z.kind === 'room' && z.room === r0.id, `Cruma floor 1 at ${r0.id}'s centre: that room (${z.room})`); }
  const out = at(100000, 100000, -3000);
  check(out.kind === 'square' && out.side === M.LOCAL_FB.side, 'outdoors, no dungeon: small square, never scaled');
  const f = [], t0 = 1e9;
  check(M.nextSpotAfterFail(f, t0) === true && M.nextSpotAfterFail(f, t0 + 60000) === true, '1st and 2nd failed trip: take the next spot');
  check(M.nextSpotAfterFail(f, t0 + 120000) === false, '3rd failed trip within 10 min: hunt locally (small area)');
  check(M.nextSpotAfterFail(f, t0 + 900000) === true, 'failures older than 10 min are forgotten');
}

// ---- 2) entry data of every catacomb + necropolis ----------------------------------------------------------------------------
{
  const S = rd('Scripts/data/spawns_h5.json'), SP = Array.isArray(S) ? S : (S.spawns || []);
  const TP = rd('Scripts/data/teleports_h5.json'), TPA = Array.isArray(TP) ? TP : (TP.teleports || []);
  const want = ['Necropolis of Sacrifice', "Pilgrim's Necropolis", 'Necropolis of Worship', "Patriot's Necropolis", 'Necropolis of Devotion', 'Necropolis of Martyrdom', "Saint's Necropolis", "Disciple's Necropolis",
    'Catacomb of the Heretic', 'Catacomb of the Branded', 'Catacomb of the Apostate', 'Catacomb of the Witch', 'Catacomb of Dark Omens', 'Catacomb of the Forbidden Path'];
  check(want.every(n => C.some(c => c.name === n)) && C.length === 14, `catacombs.json has all 14 (8 necropolises + 6 catacombs): ${C.map(c => c.name).join(', ')}`);
  for (const c of C) {
    const isN = /necropolis/i.test(c.name), E = c.entranceNpc || {}, I = c.inside || {}, Lg = I.landing || [];
    const idOk = isN ? E.id >= 31095 && E.id <= 31102 : E.id >= 31114 && E.id <= 31119;
    const sp = SP.find(s => s.id === E.id && Math.hypot(s.x - E.x, s.y - E.y) < 100);
    const tpId = +String(E.bypass || '').split(' ')[1], tp = TPA.find(t => +t.id === tpId);
    const inBox = Lg.length === 3 && Lg[0] >= I.bbox[0] - 400 && Lg[0] <= I.bbox[2] + 400 && Lg[1] >= I.bbox[1] - 400 && Lg[1] <= I.bbox[3] + 400 && Lg[2] >= I.z[0] - 600 && Lg[2] <= I.z[1] + 600;
    const dr = D.find(d => d.name === c.name), en = dr && dr.floors && dr.floors[0] && dr.floors[0].enter;
    const drOk = !!(en && en.how === 'ziggurat' && en.catacomb === c.name && en.npc && en.npc.id === E.id && en.npc.x === E.x && en.npc.y === E.y && JSON.stringify(en.landing) === JSON.stringify(Lg) && /ONLY through the outer Gatekeeper Ziggurat/.test(en.note || ''));
    const rooms = dr ? dr.floors.reduce((t, F) => t + (F.rooms || []).length, 0) : 0;
    const boxSame = dr && dr.bbox && dr.bbox[0] === I.bbox[0] && dr.bbox[1] === I.bbox[2] && dr.bbox[2] === I.bbox[1] && dr.bbox[3] === I.bbox[3];
    const T2 = c.insideTeleporter, spIn = T2 && SP.find(s => s.id === T2.id && Math.hypot(s.x - T2.x, s.y - T2.y) < 100);
    check(idOk && E.name === 'Gatekeeper Ziggurat' && E.link === 'Teleport' && !!sp && !!tp && tp.x === Lg[0] && tp.y === Lg[1] && inBox && drOk && rooms > 0 && boxSame && !!spIn,
      `${c.name}: Ziggurat ${E.id} at ${E.x},${E.y},${E.z} (datapack spawn ${sp ? 'ok' : 'MISSING'}), "${E.bypass}" -> landing ${Lg.join(',')} (teleport ${tp ? tp.desc : 'MISSING'}${tp && (tp.x !== Lg[0] || tp.y !== Lg[1]) ? ' DIFFERS' : ''}), landing ${inBox ? 'inside' : 'NOT inside'} the box, dungeon_rooms ${drOk ? 'same' : 'DIFFERS'}, ${rooms} rooms, inside Ziggurat ${T2 ? T2.id : '-'} ${spIn ? 'ok' : 'MISSING'}`);
    const g = c.gatekeeperRoute || {};
    if (!g.destination) warns.push(`${c.name}: no live gatekeeper link known (${g.landingNote || 'no route'}) — the trip goes .${String(c.town || '').toLowerCase()} + a long walk to the surface entrance ${c.entrance ? c.entrance.x + ',' + c.entrance.y : '?'} and down the shaft to the Ziggurat (untested)`);
    else if (!g.landing) warns.push(`${c.name}: gatekeeper ${g.gatekeeper} (${g.town}) "${g.destination}" — landing position not recorded yet (expected near the entrance; Sacrifice landed at -41633,208722 = 625 from its Ziggurat)`);
  }
}

// ---- 3) source checks --------------------------------------------------------------------------------------------------------
{
  const fn = (name) => { const i = src.indexOf(name), j = src.indexOf('\n}\n', i); return i < 0 ? '' : src.slice(i, j); };
  const ed = fn('async function enterDungeon(name)');
  check(!!ed && !/geoRoute\(|geoWalk\(|walking in to |the walk in did not get me inside/.test(ed), 'enterDungeon: no walk-in left (no geoRoute / geoWalk / "walking in to")');
  const gi = ed.indexOf('ssTeamAllowed('), ti = ed.indexOf('teamTeleport(');
  check(gi > 0 && ti > gi, 'enterDungeon: the Seven Signs check comes BEFORE any teleport / walk');
  check(/App\.emit\('swarm\.zig'/.test(ed) && /zigguratEnter\(d\)/.test(ed) && /insideDungeon\(d, lp\.X/.test(ed), 'enterDungeon: every member uses the Ziggurat (swarm.zig), the leader too, everyone verified inside (insideDungeon)');
  const tr = fn('async function travelToSpot(spot)');
  const a = tr.indexOf('ssGateTrip('), b = tr.indexOf('leadGoGiran(`next hunting spot');
  check(a > 0 && b > a && /!viaGiran/.test(tr), 'travelToSpot: the gate (sign-up / closed) runs before the Giran regroup and the trip; no second regroup after a sign-up trip');
  check(/dungeonAt\(spot\.center\)/.test(tr) && /spot\.near && !inDun/.test(tr), 'travelToSpot: a zone centre inside a catacomb goes through enterDungeon (never teleport-near + walk in)');
  const gt = fn('async function ssGateTrip(');
  check(/state === 'closed'/.test(gt) && /leadGoGiran\(/.test(gt) && /ssTeamSignup\(/.test(gt), 'ssGateTrip: closed -> no trip; sign-up -> Giran + ssTeamSignup (Dawn) + check again');
  const ms = fn('function manualSpot(level, solo)');
  check(/ssTeamAllowed\(k\)/.test(ms) && /kind: 'blocked'/.test(ms) && /return null;/.test(ms), "manualSpot: a closed catacomb/necropolis choice = status 'blocked', no trip (automatic spot meanwhile)");
  check(/manualLevelGate\(/.test(ms) && /kind: 'needs-ok'/.test(ms) && /override: !!e\.override/.test(ms), "manualSpot: above the safe level without override = 'needs-ok', no trip; the override travels with the spot");
  const al = fn('async function autoLevelLoop(solo)');
  check(/const manualPick = !!spot\.manual;/.test(al) && /if \(!manualPick && /.test(al), 'autolevel: a dashboard choice is never put on the 12 h / 1 h skip list');
  check(/nextSpotAfterFail\(/.test(al) && /localFallbackZone\(/.test(al) && !/radius = 4000 \* zoneScale\(\)/.test(al), 'autolevel: a failed trip takes the next spot; local hunting = localFallbackZone (no 4000 x zoneScale square)');
  check(/autoLvl\.zone\.local = true/.test(al), 'autolevel: the local fallback zone is marked for the dashboard (zone.local)');
  const gk = fn('async function gkTeleport(wanted, why)');
  check(/userLevelOverride\(\)/.test(gk) && /hunting above level by user override/.test(gk) && /REFUSED: '/.test(gk), 'gkTeleport: the landing-danger refusal is skipped only with the user override (logged), else REFUSED as before');
  check(/e\.override \? '\|override' : ''/.test(src), 'partySpotSig: a new override counts as a new choice');
  const mt = fn('function manualSpotOnTravel(spot, ok)');
  check(/'needs-ok'/.test(mt) && /!spot\.override/.test(mt), "manualSpotOnTravel: a REFUSED landing without override -> 'needs your OK' (remembered, no retries)");
  const dg = (() => { const i = src.indexOf("if (cmd === '!dungeon')"); return src.slice(i, src.indexOf('\n  }\n', i)); })();
  check(/ssTeamAllowed\(ssKindOf\(d\.name\)\)/.test(dg) && /state === 'closed'/.test(dg), '!dungeon: refuses a closed catacomb/necropolis at once');
  check(/b\.override === true/.test(server) && /overrideBy/.test(server), 'server.js /api/partyspot stores override + who/when (needs the dashboard restart)');
}

// ---- 4) dashboard ------------------------------------------------------------------------------------------------------------
{
  const ui = blk(html, '// SSGATE-UI-BEGIN', '// SSGATE-UI-END');
  const names = ['ssgWeek', 'ssgCycleOf', 'ssgNextChange', 'ssgNow', 'ssgSide', 'ssgOne', 'ssGateDecide', 'ssgUntilText', 'manualLevelGate'];
  const fsrc = (s, n) => { const i = s.indexOf('function ' + n + '('); if (i < 0) return null; const rest = s.slice(i); const m = rest.slice(1).search(/\n(function |\/\*\*|\/\/ |const )/); return rest.slice(0, m < 0 ? undefined : m + 1).trimEnd(); };
  const diff = names.filter(n => !fsrc(ui, n) || fsrc(ui, n) !== fsrc(SSG, n));
  check(!diff.length, `Dashboard SSGATE-UI is a 1:1 copy of swarm.js SSGATE-PURE (${names.length} functions)${diff.length ? ' — DIFFERENT: ' + diff.join(', ') : ''}`);
  // the glue: from SSGATE-UI-BEGIN to spotPickHtml, with stubs
  let glue = blk(html, '// SSGATE-UI-BEGIN', 'function spotPickHtml(leader, list) {').replace('function askChoice(', 'function askChoice_real(');
  const env = { asked: [], answers: [], posted: [] };
  const U = new Function('env', `
    const esc = (s) => String(s); const api = () => Promise.resolve({}); let TAB = 'parties', STATE = { get chars() { return env.chars; } }; let SPK = null;
    const PSPOT = { get data() { return env.pspot; } }; const renderParties = () => {}; const renderSpotPicker = () => {};
    const partyLevels = (p) => { const L = STATE.chars.filter(c => c.party === p).map(c => c.level); return { min: Math.min(...L), max: Math.max(...L) }; };
    const confirm = (t) => { env.asked.push(t); return true; };
    const flat = (x) => Array.isArray(x) ? x.map(flat).join('') : String(x == null ? '' : x); const uiConfirm = (o) => { env.asked.push(o.title + ': ' + flat(o.body)); return Promise.resolve(true); }; const uiP = (...a) => a, uiEm = (t) => t, uiList = (a) => a, uiNote = (...a) => a, uiWarn = (...a) => a;   // UIDIALOG 2026-10-10
    const askChoice = (title, text, buttons) => { env.asked.push(title + ': ' + text); return Promise.resolve(env.answers.shift()); };
    ${glue}
    return { setSS: (d) => { d.optin = d.optin || {}; if (!d.optin.gate) d.optin.gate = env.gate || 'strict'; SSD.data = d; SSD.at = Date.now(); }, ssGateParty, ssGateText, spotChoiceChecks, spotMonsterLevels };`)(env);   // SSGATETRY 2026-10-13: these checks test the STRICT rule; env.gate = 'try' for the new default
  env.chars = [{ name: 'Tank3', party: 'Tank3', level: 26 }, { name: 'Nuker11', party: 'Tank3', level: 22 }];
  env.pspot = { options: { dungeons: [{ name: 'Necropolis of Sacrifice', levelRange: [20, 30] }, { name: 'Cruma Tower', levelRange: [40, 51] }], zones: [], datapack: [] } };
  const state = { period: 'validation', winner: 'dusk', cycle: '2026-09-28', checkedAt: T('2026-10-08T18:14:02Z') };
  U.setSS({ state, chars: [{ name: 'Tank3', party: 'Tank3', cycle: '', status: '', why: '' }, { name: 'Nuker11', party: 'Tank3', cycle: '', status: '', why: '' }] });
  const g = U.ssGateParty('Tank3', 'Necropolis of Sacrifice', T('2026-10-08T19:50:00Z')), x = U.ssGateText(g);
  check(g.state === 'closed' && x.cls === 'bad' && /^closed: Seven Signs validation — only Dusk winners until Mon 12 Oct \d\d:00 \(local\)$/.test(x.t), `picker: "${x.t}"`);
  // 7 SIGNS OPT-IN (2026-10-12): not enrolled -> closed + the hint; the party enrolled (seven_signs.json via /api/clan optin) -> sign-up first
  U.setSS({ state: { period: 'competition', checkedAt: T('2026-10-12T18:20:00Z') }, chars: [{ name: 'Tank3', party: 'Tank3', cycle: '', status: '' }] });
  { const gn = U.ssGateParty('Tank3', 'Catacomb of the Branded', T('2026-10-12T19:00:00Z')); check(gn.state === 'signup', `picker, party not enrolled: picking it = consent to the Dawn sign-up (SSGATE2 2026-10-13): "${U.ssGateText(gn).t}"`); }
  U.setSS({ state: { period: 'competition', checkedAt: T('2026-10-12T18:20:00Z') }, optin: { parties: ['Tank3'], chars: [] }, chars: [{ name: 'Tank3', party: 'Tank3', cycle: '', status: '' }] });
  const gs = U.ssGateParty('Tank3', 'Catacomb of the Branded', T('2026-10-12T19:00:00Z'));
  check(gs.state === 'signup' && /^needs sign-up \(Dawn\) first — competition period/.test(U.ssGateText(gs).t), `picker in the competition period: "${U.ssGateText(gs).t}"`);
  U.setSS({ state: { period: 'competition', checkedAt: T('2026-10-12T18:20:00Z') }, chars: [{ name: 'Tank3', party: 'Tank3', cycle: '2026-10-12', status: 'signed' }] });
  check(U.ssGateText(U.ssGateParty('Tank3', 'Catacomb of the Branded', T('2026-10-12T19:00:00Z'))).t === 'Seven Signs: can enter', 'picker: everyone signed up -> "can enter"');
  // SSGATETRY 2026-10-13 (tester: manual entry works without the sign-up): gate "try" (the default) = can enter even when nobody signed up /
  // enrolled, in either period; a real Ziggurat refusal this period closes it until the period change
  env.gate = 'try';
  U.setSS({ state, chars: [{ name: 'Tank3', party: 'Tank3', cycle: '', status: '' }, { name: 'Nuker11', party: 'Tank3', cycle: '', status: '' }] });
  { const gt = U.ssGateParty('Tank3', 'Necropolis of Sacrifice', T('2026-10-08T19:50:00Z')); check(gt.state === 'enter' && U.ssGateText(gt).t === 'Seven Signs: can enter', `try mode, validation, nobody signed up -> "${U.ssGateText(gt).t}"`); }
  U.setSS({ state: { period: 'competition', checkedAt: T('2026-10-12T18:20:00Z') }, chars: [{ name: 'Tank3', party: 'Tank3', cycle: '', status: '' }] });
  { const gt = U.ssGateParty('Tank3', 'Catacomb of the Branded', T('2026-10-12T19:00:00Z')); check(gt.state === 'enter', `try mode, competition, not enrolled -> can enter (${gt.state})`); }
  U.setSS({ state: { period: 'competition', checkedAt: T('2026-10-12T18:20:00Z') }, chars: [{ name: 'Tank3', party: 'Tank3', cycle: '', status: '', denied: { cycle: '2026-10-12', period: 'competition', kind: 'catacomb', dungeon: 'Catacomb of the Branded', why: 'may not pass' } }] });
  { const gt = U.ssGateParty('Tank3', 'Catacomb of the Branded', T('2026-10-12T19:00:00Z')); check(gt.state === 'closed' && /refused/.test(gt.why), `try mode, the Ziggurat refused this period -> closed (${gt.why})`); }
  env.gate = 'strict';
  (async () => {
    // closed necropolis: asks, "Save anyway" keeps it (bot shows "blocked"), Cancel drops it (SSGATE2: closed = a member without 1st class transfer; the real date is used here)
    U.setSS({ state, chars: [{ name: 'Tank3', party: 'Tank3', cycle: '', status: '', why: 'no 1st class transfer yet' }, { name: 'Nuker11', party: 'Tank3', cycle: '', status: '' }] });
    env.answers = [null]; env.asked = [];
    const r0 = await U.spotChoiceChecks('Tank3', { mode: 'manual', kind: 'rooms', dungeon: 'Necropolis of Sacrifice', roomId: 'any' }, 'Necropolis of Sacrifice · any free room');
    check(r0 === null && /is closed now: .*NOT go there/s.test(env.asked[0] || ''), 'choosing a closed necropolis asks first and explains; Cancel = nothing saved');
    env.answers = ['save']; env.asked = [];
    const r1 = await U.spotChoiceChecks('Tank3', { mode: 'manual', kind: 'rooms', dungeon: 'Necropolis of Sacrifice', roomId: 'any' }, 'x');
    check(r1 && !r1.override && env.asked.length === 1, '"Save anyway" saves it (no extra confirm)');
    // too high level: override / plain / cancel
    env.answers = ['override']; env.asked = [];
    const r2 = await U.spotChoiceChecks('Tank3', { mode: 'manual', kind: 'rooms', dungeon: 'Cruma Tower', roomId: 'any' }, 'Cruma Tower · any free room');
    check(r2 && r2.override === true && r2.overrideBy === 'dashboard' && /Party level 22-26, monsters here 40-51 — above the safe limit \(32\)/.test(env.asked[0] || ''), `too high: "Yes, override" saves override:true (${(env.asked[0] || '').split('\n')[2]})`);
    env.answers = ['plain']; const r3 = await U.spotChoiceChecks('Tank3', { mode: 'manual', kind: 'rooms', dungeon: 'Cruma Tower', roomId: 'any' }, 'x');
    check(r3 && !r3.override, '"Save without override" saves it without override (bot: needs your OK, auto spot meanwhile)');
    env.answers = [null]; const r4 = await U.spotChoiceChecks('Tank3', { mode: 'manual', kind: 'rooms', dungeon: 'Cruma Tower', roomId: 'any' }, 'x');
    check(r4 === null, 'Cancel saves nothing');
    env.asked = []; const r5 = await U.spotChoiceChecks('Tank3', { mode: 'manual', kind: 'datapack', spot: 'nowhere' }, 'nowhere');
    check(r5 && env.asked.length === 1 && /hunting spot = nowhere/.test(env.asked[0]), 'a normal choice: the usual single confirm');
    // party-map labels + the new statuses
    check(/local fallback square \(the chosen spot was not reached\)/.test(html) && /▭ local fallback square/.test(html), 'party map: "local fallback square" label + legend');
    check(/ms\.status === 'blocked'/.test(html) && /ms\.status === 'needs-ok'/.test(html) && /data-spotoverride/.test(html), "spot line: 'closed (Seven Signs)' and 'needs your OK' (+ Override… button) statuses");
    for (const w of warns) console.log('WARN ' + w);
    console.log(fails ? `\n${fails} check(s) FAILED` : '\nall checks passed');
    process.exit(fails ? 1 : 0);
  })().catch(e => { console.error(e); process.exit(1); });
}
