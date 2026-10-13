// TEST RAID ROUTES (2026-10-13, owner 15:15: precompute all raid boss routes: dry first, Heine walk-out, swims within one breath unless marked,
// centre navigation (clearance), doors as steps, needs-item / needs-skill statuses, the route STATE MACHINE incl. resume after a reload and the
// members following the leader's state). Nothing live: no L2Swarm, no game, no MCP; temp files only.
//   1) the path finder options (geopath_fast: drops / clearance / wet / flood) on the real geodata (small, known legs)
//   2) the raid policy (raid_policy.js): decide() matrix, needSwimSearch, wetStats
//   3) the atlas data (Scripts/data/nav_atlas/raid.json): policy flags, swim legs vs breath, doors as steps, drops, Heine starts
//   4) doors_h5.json: how each door opens (timer / npc / skill / item / owner / never), Thief Key sellers
//   5) raid_routes.js: order (circuit first, then by level), summarize() statuses (ok / needs-item / needs-skill / unreachable / pending)
//   6) swarm.js ROUTESM-PURE (vm): states, retries -> re-plan -> FAILED, BLOCKED, stop, resume, buy step, public state, member line
//   7) swarm.js navAtlasRun state machine in a fake world: run, persist, abort, RESUME after a reload, member follow (swarm.routesm), drop step
//   8) Heine walk-out guards, rsChoice / routestore check flag, dashboard (routeview + partystatus) compile + render
// Usage: node docs/plan/tools/test_raid_routes_all.js [--quick]  (--quick skips the geodata searches of part 1)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..', '..', '..'), DATA = path.join(ROOT, 'Scripts', 'data'), DASH = path.join(ROOT, 'Dashboard');
const QUICK = process.argv.includes('--quick');
// PACKAGE-SAFE (2026-10-13, v1.6.4): the public package ships no Geodata and no user data (raid_circuits.json, swarm.config.json): those parts are skipped
const HAS_GEO = (() => { try { return fs.readdirSync(path.join(ROOT, 'Geodata')).some(f => /.l2j$/.test(f)); } catch (e) { return false; } })();
const J = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch (e) { return d; } };
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m); } };

(async () => {
// ------------------------------------------------------------------------------------------------ 1) path finder options
console.log('1) geopath_fast: drops / clearance / wet / flood');
const G = require('./geopath_fast'), POL = require('./raid_policy'), R0 = POL.RPOL;
if (!QUICK && !HAS_GEO) console.log('  skipped: needs Geodata (your L2Swarm install)');
if (!QUICK && HAS_GEO) {
  const opt = { maxLeg: 1000, hWeight: R0.hWeight, drops: true, clear: R0.clear, clearW: R0.clearW, clearNeed: R0.clearNeed, maxNodes: 2e6, maxMs: 60000, pad: 3000 };
  // an open field near Dion (no water): every straight leg keeps >= 48 from walls / cliffs
  for (const [n, a, b] of [['Dion field', { x: 15670, y: 142983, z: -2705 }, { x: 22000, y: 150000, z: -3100 }], ['Gludio field', { x: -12672, y: 122776, z: -3116 }, { x: -20000, y: 137000, z: -3900 }]]) {
    const r = G.findPath(a, b, opt), plain = G.findPath(a, b, { maxLeg: 1000, hWeight: 2, maxNodes: 2e6, maxMs: 60000, pad: 3000 });
    ok(r.ok && plain.ok, `${n}: found with and without clearance (${r.lengthUnits} vs ${plain.lengthUnits})`);
    if (r.ok) {
      let mn = 1e9, below = 0, legs = 0; for (let i = 1; i < r.points.length; i++) { const p = r.points[i - 1], q = r.points[i]; if (q.drop || p.swim || q.swim) continue; const c = G.legClearance(p, q, 4); legs++; if (c >= 0) { mn = Math.min(mn, c); if (c < 48) below++; } }
      let pmn = 1e9, pbelow = 0; for (let i = 1; i < plain.points.length; i++) { const c = G.legClearance(plain.points[i - 1], plain.points[i], 4); if (c >= 0) { pmn = Math.min(pmn, c); if (c < 48) pbelow++; } }
      ok(mn >= 16 && below <= Math.max(0, (r.clr ? r.clr.legs - r.clr.open : 0)) && below < pbelow, `${n}: every leg keeps >= 48 from walls except at narrow spots the ground forces (${below} legs < 48 = the finder's narrow legs ${r.clr ? r.clr.legs - r.clr.open : '?'}; min ${mn}; without the policy: min ${pmn}, ${pbelow} legs < 48)`);
      ok(r.lengthUnits <= plain.lengthUnits * 1.15 + 500, `${n}: the centre path is at most ~15 % longer (${r.lengthUnits} / ${plain.lengthUnits})`);
      ok(r.clr && r.clr.need === 3, `${n}: result reports the clearance it kept (${JSON.stringify(r.clr)})`);
    }
  }
  // no option = the old result (other callers unchanged)
  { const a = { x: 15670, y: 142983, z: -2705 }, b = { x: 18000, y: 145000, z: -2900 };
    const r1 = G.findPath(a, b, { maxLeg: 1000, hWeight: 2, pad: 3000 }), r2 = G.findPath(a, b, { maxLeg: 1000, hWeight: 2, pad: 3000, drops: false });
    ok(r1.ok && JSON.stringify(r1.points) === JSON.stringify(r2.points) && r1.drops === undefined && r1.clr === undefined, 'no new option = the same points as before, no extra fields'); }
  // the Garden of Eva: from the top of the garden down to Millenu needs drops (one-way ledges): flood + join finds it, drop heights recorded
  { const top = { x: 83720, y: 241800, z: -6984 }, mil = { x: 88532, y: 245798, z: -10376 };
    const nd = G.findPathFlood(top, mil, { swim: false, floodCap: 1500000 }), wd = G.findPathFlood(top, mil, { swim: false, drops: true, floodCap: 1500000, maxLeg: 1000 });
    ok(!nd.ok, `Garden of Eva: without drops no way down (${nd.reason})`);
    ok(wd.ok && wd.drops && wd.drops.length >= 1 && wd.drops.every(d => d.fall > 48) && wd.points.some(p => p.drop), `Garden of Eva: with drops the flood + join gets to Millenu (${wd.lengthUnits}, drops ${JSON.stringify(wd.drops)})`);
    if (wd.ok) { const D = wd.points.filter(p => p.drop); ok(D.every(p => isFinite(p.z)), 'drop waypoints carry their height'); }
    ok(G.pocketIn(mil.x, mil.y, mil.z, 50000, { drops: true }) >= 50000, 'pocketIn with drops: Millenu is reachable from outside'); }
  // wet floors: the sea floor south of Heine is inside the water zone (22_25_water6) -> 'block' never stands there
  { const a = { x: 84413, y: 234334, z: -3656 }, b = { x: 85128, y: 238408, z: -4424 };
    const blk = G.findPathFlood(a, b, { swim: false, wet: 'block', drops: true, floodCap: 600000, floodPad: 6000 }), wet = G.findPathFlood(a, b, { swim: false, drops: true, floodCap: 600000, floodPad: 6000, maxLeg: 1000 });
    const W = require('./water_zones');
    ok(!blk.ok || !blk.points.some(p => W.zoneAt(p.x, p.y, p.z)), `wet 'block': no point inside a water zone (${blk.ok ? 'found a dry way' : blk.reason})`);
    ok(wet.ok && wet.points.some(p => W.zoneAt(p.x, p.y, p.z)), `without the block the way goes along the sea floor inside the water zone (a dive) (${wet.reason || wet.lengthUnits})`); }
  G.dropRegions();
} else if (QUICK) console.log('  (skipped: --quick)');

// ------------------------------------------------------------------------------------------------ 2) raid policy (pure)
console.log('2) raid_policy.js');
{
  const d = POL.decide, R = (len) => ({ ok: true, lengthUnits: len });
  ok(d(R(10000), R(4000), 3000).pick === 'dry', 'a dry way exists (2.5x the swim way): dry');
  ok(d(R(30000), R(4000), 3000).mode === 'swim-shorter', 'the dry way is > 4x and > 15 km longer: the swim way (swim-shorter)');
  ok(d(R(16000), R(3000), 3000).pick === 'dry', 'dry > 4x but only 13 km more: still dry');
  ok(d(R(60000), R(20000), 3000).pick === 'dry', 'dry 3x longer (40 km more): still dry (needs > 4x)');
  ok(d({ ok: false }, R(5000), 3000).mode === 'swim-only', 'no dry way: swim-only');
  ok(d({ ok: false }, { ok: false }, 0).pick === null, 'neither: no route');
  ok(POL.needSwimSearch({ ok: true, lengthUnits: 9000 }, 5000, true) === false && POL.needSwimSearch({ ok: true, lengthUnits: 40000 }, 5000, true) === true && POL.needSwimSearch({ ok: false }, 5000, false) === false, 'needSwimSearch: only for no dry way / an absurd detour, and only near water');
  const ws = POL.wetStats({ ok: true, points: [{ x: 0, y: 0, z: 0 }, { x: 1000, y: 0, z: 0, swim: true }, { x: 2000, y: 0, z: 0, swim: true }, { x: 3000, y: 0, z: 0 }, { x: 4000, y: 0, z: 0, swim: true }] });
  ok(ws.len === 3000 && ws.max === 2000, `wetStats: swim length + longest unbroken run (${JSON.stringify(ws)})`);
  ok(R0.swimCost === 12 && R0.breath === 2800 && R0.swimFactor === 4 && R0.swimExtra === 15000 && R0.clear >= 3, 'policy numbers: swim x12, breath 2,800, 4x / 15 km rule, clearance on');
}

// ------------------------------------------------------------------------------------------------ 3) atlas data
console.log('3) atlas raid routes');
const RA = (J(path.join(DATA, 'nav_atlas', 'raid.json'), { routes: {} }).routes) || {};
const routes = Object.values(RA);
ok(routes.length >= 190, `raid.json has ${routes.length} raid / epic routes`);
const pol = routes.filter(r => (r.flags || []).includes('raid-policy'));
if (!pol.length) console.log('  skipped: no route planned under the raid policy in this atlas yet'); else ok(true, `${pol.length} routes planned under the raid policy so far`);
{
  let badBreath = 0, swimNoFlag = 0, dropNoFlag = 0, doorNoStep = 0, polDryButSwim = 0;
  for (const r of routes) {
    for (const s of (r.steps || []).filter(s => s.do === 'walk')) {
      if ((s.maxSwim || 0) > 2800 && !(r.flags || []).includes('long-swim') && !(r.flags || []).includes('over-breath')) badBreath++;
      if (s.swim && s.swim.length && !(r.flags || []).includes('swim')) swimNoFlag++;
      if (s.drops && s.drops.length && !(r.flags || []).includes('drop')) dropNoFlag++;
      if (s.pol && s.pol.mode === 'dry' && s.pol.dryLen && s.swimLen) polDryButSwim++;
    }
    if ((r.flags || []).includes('doors') && !(r.steps || []).some(s => s.do === 'door')) doorNoStep++;
  }
  ok(badBreath === 0, 'every walk with a swim longer than one breath is flagged (long-swim / over-breath)');
  ok(swimNoFlag === 0 && dropNoFlag === 0, 'swims and drops are flagged on the route');
  ok(doorNoStep === 0, 'a route with doors has door steps');
  ok(polDryButSwim === 0, 'policy walks in dry mode never swim (dry first)');
  const pw = pol.flatMap(r => (r.steps || []).filter(s => s.do === 'walk' && s.pol));
  const swimModes = pw.filter(s => s.swimLen > 0);
  ok(swimModes.every(s => s.pol.mode === 'swim-only' || s.pol.mode === 'swim-shorter'), `every policy walk that swims has a reason: no dry way / dry way absurdly longer (${swimModes.length})`);
  ok(pol.filter(r => (r.steps || []).some(s => s.do === 'walk' && s.pol && s.pol.overBreath)).every(r => (r.steps || []).some(s => s.do === 'walk' && s.maxSwim > 2800) && (r.flags || []).includes('over-breath')), 'overBreath only on routes with a swim longer than one breath (flag over-breath)');
  const mil = RA['raid:25032'];
  if (mil && (mil.flags || []).includes('raid-policy')) {
    ok(mil.steps.some(s => s.do === 'door' && s.need && s.need.wait) && mil.steps.some(s => s.do === 'door' && s.need && s.need.unlock), "Millenu (Garden of Eva): timed doors + an Unlock door are steps");
    ok((mil.needs && (mil.needs.skills || []).some(k => k.id === 27)), 'Millenu: needs Unlock (needs-skill)');
    ok((mil.flags || []).includes('drop'), 'Millenu: the way down has drops');
  } else console.log('  (Millenu not planned under the policy yet)');
  const fa = pol.filter(r => r.fortressAlt);
  ok(fa.every(r => Array.isArray(r.fortressAlt.steps) && (r.why || []).some(w => /Try fortress gates/.test(w))), `fortress routes keep the way through as an opt-in alternative + one plain note (${fa.map(r => r.name).join(', ') || 'none planned yet'})`);
  const blk = pol.filter(r => r.status === 'blocked' || (r.whyDoors || []).length);
  ok(blk.every(r => !/^door \d/.test(String((r.why || [])[0] || '')) && /no way around|inside .* \(owner clan only\)/.test(String((r.why || [])[0] || ''))), `blocked by doors: ONE plain sentence first, the door list in whyDoors (${blk.length})`);
  const heine = pol.filter(r => r.from === '.heine' && (r.steps || [])[1] && r.steps[1].do === 'walk');
  console.log(`  info: ${heine.length} policy routes walk straight out of Heine (.heine > walk)`);
}

// ------------------------------------------------------------------------------------------------ 4) doors_h5.json
console.log('4) doors_h5.json');
{
  const D = J(path.join(DATA, 'doors_h5.json'), { doors: [] }), by = {}; D.doors.forEach(d => { by[d.id] = d; });
  ok(D.doors.length > 1200 && D.counts && D.counts.timer > 100, `doors: ${D.doors.length} ${JSON.stringify(D.counts)}`);
  ok(by[22250001] && by[22250001].how === 'timer' && by[22250001].timer && by[22250001].timer.openSec[0] >= 0, 'Eva_001: timer (open / closed seconds)');
  ok(by[22250027] && by[22250027].how === 'skill' && by[22250027].skill.id === 27 && by[22250027].skill.consumes.id === 1661 && (by[22250027].skill.consumes.sold || []).length > 5, 'Eva_027: Unlock 27 + Thief Keys sold by the grocers');
  ok(by[19160001] && by[19160001].how === 'npc' && by[19160001].npc[0].id === 32034, 'Pagan Temple gate: the Temple Gatekeeper opens it');
  ok(D.doors.filter(d => d.how === 'owner').every(d => d.owner), 'castle / fortress / clan hall doors: owner named');
  ok((D.thiefKey.sold || []).some(s => /Helvetia/.test(s.name)), 'Thief Key: sold by Helvetia (Giran) among others');
}

// ------------------------------------------------------------------------------------------------ 5) raid_routes.js
console.log('5) raid_routes.js');
{
  const RR = require('./raid_routes');
  const order = RR.buildOrder(), C = J(path.join(DATA, 'raid_circuits.json'), { parties: {} });
  const circ = new Set(); Object.values(C.parties || {}).forEach(p => (p.bosses || []).forEach(b => circ.add(Number(b.id))));
  const firstNon = order.findIndex(o => !o.circuit.length);
  ok(order.slice(0, firstNon).every(o => circ.has(o.id)) && order.slice(firstNon).every(o => !circ.has(o.id)), `order: the ${firstNon} circuit bosses first`);
  ok(order.slice(firstNon).every((o, i, a) => !i || a[i - 1].level <= o.level), 'then every other boss by level');
  ok(order.length === (J(path.join(DATA, 'raidbosses_h5.json'), { bosses: [] }).bosses || []).length, `every boss once (${order.length})`);
  const o = { id: 1, name: 'T', level: 50, circuit: [] };
  const base = (steps, extra) => Object.assign({ key: 'raid:1', status: 'ok', flags: [], steps: [{ do: 'town', cmd: '.giran', town: 'Giran' }].concat(steps, [{ do: 'arrive' }]), needs: {}, length: 5000 }, extra || {});
  ok(RR.summarize(o, base([{ do: 'walk', how: 'geodata', len: 5000, points: [0, 0, 0, 5000, 0, 0] }])).status === 'ok', 'summary: ok');
  ok(RR.summarize(o, base([{ do: 'door', doorId: 5, name: 'd', need: { unlock: { skillId: 27 } } }], { needs: { skills: [{ id: 27, name: 'Unlock' }] } })).status === 'needs-skill', 'summary: Unlock door -> needs-skill');
  ok(RR.summarize(o, base([{ do: 'door', doorId: 6, name: 'k', need: { items: [{ id: 8275, name: 'Key of Darkness' }] } }], { needs: { items: [{ id: 8275, name: 'Key of Darkness' }] } })).status === 'needs-item', 'summary: key item -> needs-item');
  ok(RR.summarize(o, base([], { status: 'unreachable', why: ['closed pocket'] })).status === 'unreachable', 'summary: unreachable keeps the reason');
  ok(RR.summarize(o, base([{ do: 'walk', how: 'straight', len: 9000, points: [0, 0, 0, 9000, 0, 0] }])).status === 'pending', 'summary: a walk not computed yet -> pending');
  const sw = RR.summarize(o, base([{ do: 'walk', how: 'geodata', len: 6000, swim: [1, 2], swimLen: 3500, maxSwim: 3500, points: [0, 0, 0, 3000, 0, 0, 6000, 0, 0], pol: { mode: 'swim-only' } }], { flags: ['swim', 'swim-only'] }));
  ok(sw.swimOnly && sw.overBreath && sw.swim === 3500, 'summary: swim-only + over one breath marked');
}

// ------------------------------------------------------------------------------------------------ 6) ROUTESM-PURE
console.log('6) swarm.js ROUTESM-PURE');
const SRC = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
const pa = SRC.indexOf('// ROUTESM-PURE-BEGIN'), pb = SRC.indexOf('// ROUTESM-PURE-END');
ok(pa > 0 && pb > pa, 'ROUTESM-PURE block found');
const ctxP = { Math, JSON, String, Number, Object, Array, isFinite, console };
vm.createContext(ctxP); vm.runInContext(SRC.slice(pa, pb) + '\n;globalThis.__Z = { rsmArrived3D, rsmWrongHeight, rsmDiveMs, rsmFloorBand, rsmUnlockKeys };\n;globalThis.__R = { RSM, rsmStateOf, rsmLabel, rsmChain, rsmSupply, rsmWithBuy, rsmInit, rsmEnter, rsmResult, rsmResume, rsmPublic, rsmMemberLine };', ctxP);
// ROUTE RULES (owner 2026-10-13: everything configurable per party, nothing automatic unless asked)
{
  const ctxR = { Math, JSON, String, Number, Object, Array, isFinite, console }; vm.createContext(ctxR);
  vm.runInContext(SRC.slice(pa, SRC.indexOf('// ROUTESM-PURE-END') + 20) + '\n;globalThis.__Q = { RSM_RULES, rsmRules, rsmRouteBan, rsmDoorBan };', ctxR);
  const Q = ctxR.__Q, FILE = J(path.join(DATA, 'route_rules.json'), null);
  ok(FILE && Array.isArray(FILE.rules) && FILE.rules.every(r => r.key in Q.RSM_RULES && typeof r.default === 'boolean' && r.label && r.help), 'route_rules.json: every rule has a label, a default and a help text (shown in the UI)');
  ok(Object.keys(Q.RSM_RULES).every(k => FILE.rules.some(r => r.key === k && r.default === Q.RSM_RULES[k])), 'the file defaults = the built-in defaults');
  const d = Q.rsmRules(FILE, 'Nobody');
  ok(d.buyKeys === true && d.tryFortressGates === false && d.swim === true && d.heineWalkOut === true, 'defaults (owner 19:10): buy the keys a route needs ON, fortress gates OFF, swim / Heine walk-out on');
  const p = Q.rsmRules({ rules: FILE.rules, parties: { Tank2: { swim: false, buyKeys: true } } }, 'Tank2');
  ok(p.swim === false && p.buyKeys === true && p.drops === true, 'a party\'s own switches win');
  const sw = [{ do: 'walk', swim: [1] }], dr = [{ do: 'walk', drops: [{ i: 1, fall: 400 }] }];
  ok(/swimming is switched off/.test(Q.rsmRouteBan(sw, p)) && Q.rsmRouteBan(sw, d) === '' && /drops are switched off/.test(Q.rsmRouteBan(dr, Object.assign({}, d, { drops: false }))), 'a route that swims / drops is refused when the party switched it off');
  ok(/Unlock is switched off/.test(Q.rsmDoorBan({ do: 'door', name: 'x', need: { unlock: {} } }, Object.assign({}, d, { unlockDoors: false }))) && Q.rsmDoorBan({ do: 'door', name: 'x', need: { unlock: {} } }, d) === '', 'door kinds switch off one by one (Unlock)');
  ok(/passing closed doors is switched off/.test(Q.rsmDoorBan({ do: 'door', need: { wait: {} } }, Object.assign({}, d, { openDoors: false }))), 'all doors off');
}
const S = ctxP.__R;
// 3D ARRIVAL (owner 2026-10-13 19:10: "make sure x,y,z is reached, not only x,y — some caves like Garden of Eva are deep down")
{
  const Z = ctxP.__Z, p = { x: 1000, y: 0, z: -6000 };
  ok(Z.rsmArrived3D({ x: 1010, y: 0, z: -5900 }, p, 150) && !Z.rsmArrived3D({ x: 1010, y: 0, z: -3700 }, p, 150), '3D arrival: x,y AND z (surface above a dive = not arrived)');
  ok(Z.rsmWrongHeight({ x: 1010, y: 0, z: -3700 }, p) && !Z.rsmWrongHeight({ x: 9000, y: 0, z: -3700 }, p), 'wrong height only when x,y is right');
  ok(Z.rsmDiveMs({ x: 1000, y: 0, z: -3700 }, p) > 2300 / 50 * 1000, 'dive time from the 3D length (2.3k down at swim speed 50)');
  ok(JSON.stringify(Z.rsmFloorBand([{ bbox: [0, 100, 0, 100], floors: [{ z: [-100, 0] }, { z: [-3000, -2500] }] }], 50, 50, -2800)) === '[-3300,-2200]' && Z.rsmFloorBand([{ bbox: [0, 100, 0, 100], floors: [{ z: [-100, 0] }] }], 50, 50, -50) === null, 'dungeon floor band (only for multi-floor dungeons)');
  ok(Z.rsmUnlockKeys(1, 1) === 4 && Z.rsmUnlockKeys(14, 2) === 68, 'keys by the buyer\'s Unlock level (2 tries a door)');
}
{
  const st = (s) => S.rsmStateOf(s);
  ok(st({ do: 'town' }) === 'TRAVEL_TOWN' && st({ do: 'gk' }) === 'GK_TELEPORT' && st({ do: 'buy' }) === 'BUY_KEY' && st({ do: 'floor' }) === 'FLOOR_TELEPORT' && st({ do: 'enter' }) === 'ENTER' && st({ do: 'arrive' }) === 'ARRIVED', 'states: town / gk / buy / floor / enter / arrive');
  ok(st({ do: 'walk' }) === 'WALK_LEG' && st({ do: 'walk', swim: [2] }) === 'SWIM_LEG' && st({ do: 'walk', drops: [{ i: 3, fall: 500 }] }) === 'DROP', 'walk / swim / drop');
  ok(st({ do: 'door', need: { wait: {} } }) === 'DOOR_WAIT' && st({ do: 'door', need: { npc: [{}] } }) === 'DOOR_OPEN_NPC' && st({ do: 'door', need: { unlock: {} } }) === 'DOOR_OPEN_SKILL' && st({ do: 'door', need: { items: [{ id: 1 }], unlock: {} } }) === 'DOOR_OPEN_ITEM' && st({ do: 'door', need: { blocked: true } }) === 'BLOCKED', 'doors: wait / npc / skill / item / blocked');
  ok(st({ do: 'need', manual: true }) === 'BLOCKED', 'a by-hand step is BLOCKED');
  const steps = [{ do: 'town', town: 'Giran', cmd: '.giran' }, { do: 'walk', points: [0, 0, 0, 1000, 0, 0], len: 1000 }, { do: 'door', doorId: 7, name: 'g', need: { unlock: { skillId: 27 } }, at: [1000, 0, 0] }, { do: 'walk', points: [1000, 0, 0, 2000, 0, 0], len: 1000, swim: [1], swimLen: 1000, maxSwim: 1000 }, { do: 'arrive' }];
  const sup = S.rsmSupply(steps); ok(sup.length === 1 && sup[0].id === 1661 && sup[0].unlockDoors === 1 && sup[0].count === 4, 'supply: only what this route needs (1 Unlock door: 2 tries x 2 keys at Unlock 1)');
  ok(S.rsmSupply([{ do: 'walk' }, { do: 'door', need: { wait: {} } }]).length === 0, 'no Unlock door on the route = nothing bought (never a stock)');
  const wb = S.rsmWithBuy(steps, sup); ok(wb.length === steps.length + 1 && wb[1].do === 'buy' && wb[0].do === 'town', 'BUY_KEY step right after the town step');
  ok(S.rsmSupply([{ do: 'door', need: { npc: [{}], unlock: {} } }]).length === 0, 'no keys when an NPC opens the door');
  const ch = S.rsmChain(wb); ok(ch.map(c => c.st).join(',') === 'TRAVEL_TOWN,BUY_KEY,WALK_LEG,DOOR_OPEN_SKILL,SWIM_LEG,ARRIVED' && ch[3].cp === 'door' && ch[4].cp === 'swim', 'chain + checkpoints (door, swim)');
  // retries -> re-plan -> FAILED
  const r = { key: 'raid:1', name: 'T', steps: wb };
  let sm = S.rsmInit(r, 0, 1000, null); S.rsmEnter(sm, 2, wb, 1000);
  ok(sm.state === 'WALK_LEG', 'enter: state of the step');
  const acts = []; for (let k = 0; k < 12; k++) { const a = S.rsmResult(sm, { ok: false, why: 'stuck' }, wb, 1000 + k); acts.push(a.act); if (a.act === 'final') break; }
  ok(acts.join(',') === 'retry,retry,replan,retry,retry,replan,retry,retry,final' && sm.state === 'FAILED' && sm.final && /stuck/.test(sm.why), `walk: 2 retries, 2 re-plans, then FAILED (${acts.join(',')})`);
  sm = S.rsmInit(r, 0, 1000, null); S.rsmEnter(sm, 3, wb, 1000);
  ok(S.rsmResult(sm, { ok: false, why: 'no key', blocked: true }, wb, 1001).act === 'final' && sm.state === 'BLOCKED', 'blocked door: BLOCKED at once');
  sm = S.rsmInit(r, 0, 1000, null); S.rsmEnter(sm, 2, wb, 1000);
  ok(S.rsmResult(sm, { ok: false, why: 'stopped' }, wb, 1001).act === 'stop' && !sm.final && sm.sub === 'paused', 'stopped: paused, not final (resumable)');
  ok(S.rsmResult(sm, { ok: true }, wb, 1002).act === 'next', 'ok: next');
  S.rsmEnter(sm, wb.length - 1, wb, 1003); ok(S.rsmResult(sm, { ok: true }, wb, 1004).act === 'final' && sm.state === 'ARRIVED', 'arrive: ARRIVED (final)');
  // resume
  const startIdx = (steps2, me) => { for (let i = steps2.length - 1; i >= 0; i--) { const s = steps2[i]; if (s.do !== 'walk') continue; for (let k = 0; k < s.points.length; k += 3) if (Math.hypot(s.points[k] - me.x, s.points[k + 1] - me.y) < 800) return i; } return 0; };
  const saved = { v: S.RSM.v, key: 'raid:1', i: 3, state: 'DOOR_OPEN_SKILL', at: 5000, tries: { 3: 1 }, replans: 1, hist: [], final: false, startedAt: 100 };
  const rs = S.rsmResume(saved, r, { x: 1000, y: 10, z: 0 }, 6000, startIdx);
  ok(rs && rs.i === 3 && rs.replans === 1 && rs.tries[3] === 1, 'resume: standing at the door -> the saved door step, its tries and re-plans kept');
  const rs2 = S.rsmResume(Object.assign({}, saved, { i: 2, state: 'WALK_LEG' }), r, { x: 1900, y: 0, z: 0 }, 6000, startIdx);
  ok(rs2 && rs2.i === 4, 'resume: a walk -> where my position is on the route (further on)');
  ok(S.rsmResume(Object.assign({}, saved, { final: true }), r, { x: 1000, y: 0, z: 0 }, 6000, startIdx) === null, 'resume: a finished run is not resumed');
  ok(S.rsmResume(Object.assign({}, saved, { key: 'raid:2' }), r, { x: 1000, y: 0, z: 0 }, 6000, startIdx) === null, 'resume: another route is not resumed');
  ok(S.rsmResume(saved, r, { x: 1000, y: 0, z: 0 }, 5000 + 3 * 3600000, startIdx) === null, 'resume: too old (> 2 h) is not resumed');
  ok(S.rsmResume(saved, r, { x: 50000, y: 0, z: 0 }, 6000, startIdx).i === 0, 'resume: far from the saved door -> from my position (start)');
  const pub = S.rsmPublic(Object.assign(S.rsmInit(r, 0, 1, null), { i: 4, state: 'SWIM_LEG' }), wb);
  ok(pub.state === 'SWIM_LEG' && pub.cp === 'swim' && /swim/.test(pub.label) && Array.isArray(pub.chain) && pub.chain.length === wb.length, 'public state: label, checkpoint, chain');
  ok(/SWIM_LEG 5\/6/.test(S.rsmMemberLine(Object.assign({}, pub, { n: 6 }), 0)), 'member line: "leader route: SWIM_LEG 5/6 ..."');
}

// ------------------------------------------------------------------------------------------------ 7) navAtlasRun state machine (fake world)
console.log('7) navAtlasRun as a state machine (fake world)');
const na = SRC.indexOf('// ===== NAV ATLAS ('), nb = SRC.indexOf('// ===== NAV ATLAS end');
ok(na > 0 && nb > na, 'NAV ATLAS block found');
const BLOCK = SRC.slice(na, nb);
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'raidroutes_test_'));
function world(opts) {
  const W = { t: 1e9, calls: [], said: [], notes: [], files: {}, handlers: {}, me: Object.assign({ X: 0, Y: 0, Z: 0, Level: 50, Name: opts.name || 'Lead', IsDead: false }, opts.me || {}), items: opts.items || {}, skills: opts.skills || {}, doors: opts.doors || {}, town: opts.town || null, npcs: opts.npcs || [], abortAt: opts.abortAt || null };
  const towns = opts.towns || {}, land = opts.land || {};
  W.files[path.join(ROOT, 'Scripts') + '\\data\\route_rules.json'] = JSON.stringify(opts.rules || { parties: { [opts.name || 'Lead']: { buyKeys: true } } });   // ROUTE RULES: this party may buy keys
  const ctx = {
    console, Math, JSON, Date: { now: () => W.t }, String, Number, Object, Array, isFinite, Promise, setTimeout: (f, ms) => { W.calls.push('setTimeout'); }, RegExp, Set, Map,
    __SCRIPTS__: path.join(ROOT, 'Scripts'), SWARM_ROOT: TMP,
    File: { ReadAllText: (p) => { const k = String(p); if (W.files[k] !== undefined) return W.files[k]; return fs.readFileSync(k.replace(/\\/g, '/'), 'utf8'); }, WriteAllText: (p, t) => { W.files[String(p)] = String(t); } },
    Me: W.me, CONFIG: { leader: opts.leader === false ? 'Lead' : W.me.Name, mission: {}, restock: { npcMatch: /grocer/i, skipNpcs: [] } }, state: {}, control: { gen: 1 }, gkFail: '',
    PartyList: { forEach: (f) => (opts.party || []).forEach(f) },
    SkillsList: { GetItemByID: (id) => W.skills[id] || null },
    App: { on: (n, f) => { W.handlers[n] = f; }, emit: (n, d) => W.calls.push('emit ' + n + (d && d.state ? ' ' + d.state : '')) },
    Send: { ReqBypassToServer: (c) => W.calls.push('bypass ' + c), Action: (id) => W.calls.push('action ' + id), RequestMagicSkillUse: (id) => { W.calls.push('skill ' + id); if (id === 27) Object.values(W.doors).forEach(d => { if (d.unlockable) d.open = true; }); } },
    UseItem: (id) => W.calls.push('use ' + id),
    now: () => W.t, sleep: async (ms) => { W.t += ms; Object.values(W.doors).forEach(d => { if (d.opensAt && W.t >= d.opensAt) d.open = true; }); },
    num: (v) => Number(v) || 0, P: (x, y, z) => `${Math.round(x)},${Math.round(y)}`, distTo: (x, y) => Math.hypot(W.me.X - x, W.me.Y - y),
    note: (m, say) => W.notes.push(m), SayToParty: (m) => W.said.push(m), setTask: () => { }, intent: () => { }, intentDone: () => { },
    logError: (w, e) => W.calls.push('ERROR ' + w + ' ' + (e && e.message)), appendShared: () => { }, interrupted: () => false, isLeader: () => opts.leader !== false, teamNames: () => opts.team || [],
    currentTownKey: () => W.town, townKeyFor: (t) => { const k = String(t || ''); return towns[k] ? k : null; }, itemCount: (id) => W.items[id] || 0,
    teamTeleport: async (text) => { W.calls.push('tp ' + text); if (towns[text]) { Object.assign(W.me, { X: towns[text][0], Y: towns[text][1], Z: towns[text][2] }); W.town = text; return true; } if (land[text]) { Object.assign(W.me, { X: land[text][0], Y: land[text][1], Z: land[text][2] }); W.town = null; return true; } return false; },
    walkTo: async (x, y, z, d, ms, abort) => { if (W.abortAt && W.calls.filter(c => c === 'walk').length >= W.abortAt) { W.stop = true; return false; } W.calls.push('walk'); Object.assign(W.me, { X: x, Y: y, Z: z }); W.t += 1000; return true; },
    walkDirect: async (x, y, z) => { W.calls.push('direct ' + Math.round(z)); Object.assign(W.me, { X: x, Y: y, Z: z }); W.t += 500; return true; },
    leadRouteWalk: async (pts) => { W.calls.push('leadRouteWalk ' + pts.length + (pts.some(p => p.swim) ? ' swim' : '') + (pts.some(p => p.drop) ? ' drop' : '')); const p = pts[pts.length - 1]; Object.assign(W.me, { X: p.x, Y: p.y, Z: p.z }); return true; },
    gatherTeam: async (why) => { W.calls.push('gather ' + why); return true; },
    swimPlan: (ms) => W.calls.push('swimPlan'),
    appearBurst: () => { }, sendAppearing: () => { },
    SIEGE: { hook: false, on: false, statics: {} }, siegeHookOn: () => { }, siegeHookOff: () => { },
    snapNpcs: () => [], openNpc: async () => null, npcLinks: () => [], npcNorm: (s) => String(s || '').toLowerCase(),
    floorTeleport: async (F) => { W.calls.push('floor ' + F.name); return true; }, dungeonRooms: () => opts.dungeons || [], enterDungeon: async () => true,
    livePos: {}, buyAt: async (npc, wants) => { W.calls.push('buy ' + wants.map(w => w.id + 'x' + w.count).join(',')); wants.forEach(w => { W.items[w.id] = (W.items[w.id] || 0) + w.count; }); return { ok: true, msg: 'bought' }; },
    findNpcOrWalk: async () => ({ Name: 'Helvetia', Title: 'Grocer' }), grocerSpawns: () => [], giranGo: async (w) => W.calls.push('giranGo ' + w),
  };
  Object.defineProperty(ctx.SIEGE, 'statics', { get: () => { const o = {}; Object.entries(W.doors).forEach(([id, d]) => { o[id] = { objId: 7000 + Number(id) % 1000, closed: !d.open, at: W.t }; }); return o; } });
  vm.createContext(ctx);
  vm.runInContext(BLOCK + '\n;globalThis.__api = { navAtlasRun, rsmLoad, routeSmFile };', ctx);
  ctx.Me = W.me; W.api = ctx.__api; W.ctx = ctx;
  return W;
}
{
  const R = { key: 'raid:777', type: 'raid', name: 'Deep Boss', status: 'conditional', target: { x: 9000, y: 0, z: -2000 }, needs: {}, steps: [
    { do: 'town', town: 'Heine', cmd: '.heine' },
    { do: 'walk', points: [100, 0, 0, 2000, 0, 0, 3000, 0, 0], len: 2900, how: 'geodata' },
    { do: 'walk', points: [3000, 0, 0, 3016, 0, -500, 4000, 0, -500], len: 1000, how: 'geodata', drops: [{ i: 1, fall: 500 }] },
    { do: 'door', doorId: 401, name: 'lock', kind: 'unlock', at: [4000, 0, -500], need: { unlock: { skillId: 27 } } },
    { do: 'walk', points: [4000, 0, -500, 6000, 0, -500, 9000, 0, -2000], len: 5000, how: 'geodata', swim: [1, 2], swimLen: 5000, maxSwim: 5000 },
    { do: 'arrive', target: 'raid:777', x: 9000, y: 0, z: -2000 }] };
  const base = { towns: { Heine: [100, 0, 0] }, me: { X: 50000, Y: 50000, Z: 0 }, team: ['M1'], skills: { 27: { Id: 27 } }, doors: { 401: { open: false, unlockable: true } } };
  // a full run: town -> buy keys -> walk -> drop -> Unlock door -> swim -> arrived; checkpoints regroup the team; state persisted + sent to the team
  const W = world(base);
  const r = await W.api.navAtlasRun(R, { why: 'test' });
  ok(r.ok && r.state === 'ARRIVED', `full run ARRIVED (${r.why || ''})`);
  ok(W.calls.includes('tp Heine') && W.calls.some(c => /^buy 1661x4$/.test(c)), 'TRAVEL_TOWN, then BUY_KEY: the 4 Thief Keys this route needs (Unlock 1, one door)');
  ok(W.calls.some(c => /^gather .*before the drop/.test(c)) && W.calls.some(c => /^gather .*before the door/.test(c)) && W.calls.some(c => /^gather .*before the swim/.test(c)), 'REGROUP before the drop, the door and the swim');
  ok(W.calls.some(c => /leadRouteWalk .* drop/.test(c)) && W.calls.some(c => /leadRouteWalk .* swim/.test(c)), 'the team walks the drop / swim points (marked)');
  ok(W.calls.includes('skill 27'), 'DOOR_OPEN_SKILL: Unlock cast');
  ok(W.calls.some(c => /emit swarm\.routesm SWIM_LEG/.test(c)) && W.calls.some(c => /emit swarm\.routesm ARRIVED/.test(c)), 'the team hears every state (swarm.routesm)');
  const f = W.api.routeSmFile(), saved = JSON.parse(W.files[f] || 'null');
  ok(saved && saved.key === 'raid:777' && saved.state === 'ARRIVED' && saved.final, 'state persisted to Logs/route_sm_<name>.json (final)');
  ok(W.ctx.state.routeSM && W.ctx.state.routeSM.state === 'ARRIVED', 'swarm_state routeSM = ARRIVED');
  // a reload in the middle: the first run stops at the door (abort), the second (a fresh engine, same files) resumes AT the door
  const W1 = world(Object.assign({}, base, { doors: { 401: { open: false } }, skills: {} }));   // no Unlock: the door fails
  W1.ctx.interrupted = () => !!W1.stop;
  const r1 = await W1.api.navAtlasRun(R, { why: 'first', abort: () => W1.calls.filter(c => /^skill|^gather .*door/.test(c)).length > 0 && W1.calls.some(c => /gather .*door/.test(c)) });
  const sv = JSON.parse(W1.files[W1.api.routeSmFile()] || 'null');
  ok(!r1.ok && r1.why === 'stopped' && sv && !sv.final && sv.i === 3, `a stop at the door: paused, saved at step ${sv && sv.i + 1} (not final)`);
  const W2 = world(Object.assign({}, base, { me: { X: 4000, Y: 30, Z: -500 }, doors: { 401: { open: true } } }));
  W2.files = W1.files;   // the same Logs folder after the reload
  const r2 = await W2.api.navAtlasRun(R, { why: 'after the reload' });
  ok(r2.ok && !W2.calls.includes('tp Heine') && !W2.calls.some(c => /^buy/.test(c)), 'RESUME after the reload: no .heine, no shopping again, straight on from the door');
  ok(W2.ctx.state.routeSM && W2.ctx.state.routeSM.resumed, 'the resumed run says so (routeSM.resumed)');
  // never through a door that never opens: retries + re-plans, then FAILED with the reason (no skip past the door)
  const W3 = world(Object.assign({}, base, { skills: {}, doors: { 401: { open: false } } }));
  const r3 = await W3.api.navAtlasRun(R, { why: 'no dagger' });
  ok(!r3.ok && r3.state === 'FAILED' && /lock/.test(r3.why) && !W3.calls.some(c => /swim/.test(c)), `no Unlock: FAILED at the door (${r3.why}), never past it`);
  ok(W3.said.some(m => /re-planning/.test(m)) && W3.said.some(m => /FAILED/.test(m)), 'party chat: re-planning ... FAILED');
  // ROUTE RULES in the executor: no swimming for this party -> the route is refused before leaving (BLOCKED, nothing done); no buying when off
  const W4 = world(Object.assign({}, base, { rules: { parties: { Lead: { swim: false } } } }));
  const r4 = await W4.api.navAtlasRun(R, { why: 'no swim' });
  ok(!r4.ok && r4.state === 'BLOCKED' && /swimming is switched off/.test(r4.why) && !W4.calls.some(c => /^tp /.test(c)), 'route rules: a party that may not swim never sets off on a swimming route');
  const W5 = world(Object.assign({}, base, { rules: { parties: { Lead: { buyKeys: false } } } }));
  await W5.api.navAtlasRun(R, { why: 'keys off' });
  ok(!W5.calls.some(c => /^buy/.test(c)) && W5.notes.some(n => /buying them is switched off/.test(n)), 'route rules: key buying switched off -> no shopping, the party is told what would help');
  const W5b = world(Object.assign({}, base, { rules: { parties: {} } }));
  await W5b.api.navAtlasRun(R, { why: 'default rules' });
  ok(W5b.calls.some(c => /^buy 1661x4$/.test(c)), 'route rules default (owner 19:10): the keys the route needs are bought');
  // 3D: a deep dive is reached only when the height is reached; a surface-only arrival is refused
  const RD = { key: 'raid:778', name: 'Deep', status: 'ok', target: { x: 3000, y: 0, z: -6000 }, needs: {}, steps: [
    { do: 'walk', points: [0, 0, -3700, 1500, 0, -3700, 3000, 0, -6000], len: 3000, how: 'geodata', swim: [1, 2], swimLen: 3800, maxSwim: 3800 }, { do: 'arrive', x: 3000, y: 0, z: -6000 }] };
  const dive = (moves) => { const Wd = world({ me: { X: 0, Y: 0, Z: -3700 }, team: [] }); Wd.ctx.walkTo = async (x, y) => { Wd.calls.push('walk'); Object.assign(Wd.me, { X: x, Y: y }); Wd.t += 1000; return true; };   // x,y only: stays at the surface
    Wd.ctx.Send.MoveBackwardToLocation = (x, y, z) => { Wd.calls.push('move3d ' + z); if (moves) Wd.me.Z = Math.max(z, Wd.me.Z - 400); }; return Wd; };
  const Wa = dive(true), ra = await Wa.api.navAtlasRun(RD, { why: 'dive', team: false });
  ok(ra.ok && Math.abs(Wa.me.Z + 6000) <= 250 && Wa.calls.some(c => /^move3d -6000/.test(c)), `deep dive: kept diving until z -6000 was reached (${Math.round(Wa.me.Z)})`);
  const Wb = dive(false), rb = await Wb.api.navAtlasRun(RD, { why: 'surface only', team: false });
  ok(!rb.ok && Wb.me.Z === -3700, `surface-only (x,y reached, z not): refused (${rb.state}: ${String(rb.why).slice(0, 60)})`);
  // a land point on another floor (right x,y, 2000 lower) is not "reached"
  const RF = { key: 'raid:779', name: 'Floor', status: 'ok', target: { x: 2000, y: 0, z: -2000 }, needs: {}, steps: [{ do: 'walk', points: [0, 0, 0, 2000, 0, -2000], len: 2000, how: 'geodata' }, { do: 'arrive', x: 2000, y: 0, z: -2000 }] };
  const Wf = world({ me: { X: 0, Y: 0, Z: 0 }, team: [] }); Wf.ctx.walkTo = async (x, y) => { Object.assign(Wf.me, { X: x, Y: y }); Wf.t += 1000; return true; };
  const rf = await Wf.api.navAtlasRun(RF, { why: 'wrong floor', team: false });
  ok(!rf.ok, 'land point on another floor (x,y right, z 2000 off): not reached');
  const W6 = world(Object.assign({}, base, { doors: { 401: { open: false, unlockable: true } }, rules: { parties: { Lead: { unlockDoors: false } } } }));
  const r6 = await W6.api.navAtlasRun(R, { why: 'no unlock' });
  if (!(r6.state === 'BLOCKED')) console.log('   r6', JSON.stringify(r6), W6.calls.slice(0, 30).join(' / '));
  ok(!r6.ok && r6.state === 'BLOCKED' && /Unlock is switched off/.test(r6.why) && !W6.calls.includes('skill 27'), 'route rules: Unlock off -> BLOCKED at that door, no skill cast');
  // a member: the leader's state -> routeSMLeader + swimPlan on SWIM_LEG
  const M = world(Object.assign({}, base, { name: 'M1', leader: false }));
  M.ctx.CONFIG.leader = 'Lead';
  const h = M.handlers['swarm.routesm']; ok(typeof h === 'function', 'members listen to swarm.routesm');
  h({ source: { characterName: 'Lead' }, data: { key: 'raid:777', state: 'SWIM_LEG', i: 4, n: 6, label: 'swim 5k' } });
  ok(M.ctx.state.routeSMLeader && M.ctx.state.routeSMLeader.state === 'SWIM_LEG' && M.calls.includes('swimPlan'), 'member follows the leader state: routeSMLeader + ready to swim');
  h({ source: { characterName: 'Someone' }, data: { state: 'DROP' } });
  ok(M.ctx.state.routeSMLeader.state === 'SWIM_LEG', 'only the leader\'s state counts');
}

// ------------------------------------------------------------------------------------------------ 8) guards + dashboard
console.log('8) Heine walk-out, route choice, dashboard');
ok(!/!\/\^\(heine\|giran\)\$\/i\.test\(String\(currentTownKey\(\)\)\)/.test(SRC) && /routeRuleOff\('heineWalkOut'\)/.test(SRC), 'raid travel: walking out of Heine allowed (route rule "Walk out of Heine" / CONFIG.travel.heineWalkOut off = the old rule)');
ok(/walking out of the town to .* \(allowed since 2026-10-13\)/.test(SRC) && !/will NOT walk out of Heine to \$\{spot\.name\} \(user rule\), giving it up/.test(SRC), 'travelToSpot: no more Heine give-up by default');
{
  const RS = require(path.join(DASH, 'routestore.js'));
  const pts = [{ x: 0, y: 0, z: 0 }, { x: 1000, y: 0, z: 0 }];
  ok(RS.choice({ points: pts, manual: true }).use === 'custom', 'locked own route: used');
  { const c = RS.choice({ points: pts, manual: true, check: { ok: false, why: 'leg 3' } }); ok(c.use === 'custom' && /geodata check/.test(c.warn || ''), 'locked own route failing the geodata check: still walked (owner: nothing automatic), with a warning'); }
  ok(RS.choice({ points: pts, manual: true, use: 'atlas', check: { ok: false, why: 'x' } }).use === 'atlas', '... the user\'s own choice decides');
  ok(/ckWarn = r && r\.check && r\.check\.ok === false/.test(SRC) && /WARNING — your locked route failed the geodata check/.test(SRC), 'swarm.js rsChoice + raidRouteUseFloors: the check is a warning only');
}
{
  for (const f of ['routeview.js', 'partystatus.js', 'routeview_api.js']) { try { new vm.Script(fs.readFileSync(path.join(DASH, f), 'utf8')); ok(true, f + ' compiles'); } catch (e) { ok(false, f + ': ' + e.message); } }
  // route view: swim / drop / door icons + live state
  const doc = { addEventListener: () => { }, getElementById: () => null, createElement: () => ({}) };
  const wctx = { window: {}, document: doc, console, fetch: () => Promise.resolve({ json: () => ({}) }), WeakMap, Map, Set };
  vm.createContext(wctx); vm.runInContext(fs.readFileSync(path.join(DASH, 'routeview.js'), 'utf8'), wctx);
  const RV = wctx.window.RouteView;
  const v = { target: { key: 'raid:25032', name: 'Millenu', x: 1, y: 1, z: 1 }, atlas: { key: 'raid:25032', status: 'conditional', name: 'Millenu', length: 44000, steps: [{ do: 'town', cmd: '.heine' }, { do: 'walk', len: 9000, swim: [1], swimLen: 9000, maxSwim: 8500, drops: [{ i: 2, fall: 2264 }], points: [0, 0, 0, 100, 0, 0, 200, 0, -2264] }, { do: 'door', doorId: 1, name: 'Eva_001', need: { wait: {} } }, { do: 'door', doorId: 2, name: 'Eva_027', need: { unlock: {} } }, { do: 'arrive' }] }, live: [{ party: 'Tank2', state: 'DOOR_WAIT', i: 2, n: 5, label: 'door Eva_001: wait' }], obstacles: [], items: [] };
  const h = RV._html(v, { opts: { map: false } });
  ok(/🌊/.test(h) && /⤓2264/.test(h) && /⏳/.test(h) && /🗝/.test(h) && /⚠ &gt; 1 breath|⚠ > 1 breath/.test(h), 'route view chain: swim / drop / timed door / Unlock icons + the breath warning');
  ok(/party Tank2/.test(h) && /DOOR_WAIT/.test(h) && /rv-cur/.test(h), 'route view: the party\'s live state line + the current step highlighted');
  // route view notes (owner 19:10): keys this route needs, fortress gates rule, drops untested
  { const RVA0 = require(path.join(DASH, 'routeview_api.js'));
    const rr = { key: 'raid:1', status: 'ok', steps: [{ do: 'walk', points: [0, 0, 0, 10, 0, -500], drops: [{ i: 1, fall: 500 }] }, { do: 'door', doorId: 22250027, name: 'Eva_027', at: [10, 0, -500], need: { unlock: { skillId: 27 } } }, { do: 'arrive' }], fortressAlt: { fort: 'Valley Fortress', steps: [], length: 24000 } };
    const ob = RVA0.obstaclesOf({ DATA, DIR: DASH }, rr).out;
    ok(ob.some(o => o.kind === 'buy' && /needs Thief Keys for Unlock on Eva_027/.test(o.text)), 'route view: "this route needs Thief Keys ... buys them before leaving"');
    ok(ob.some(o => o.kind === 'fortress' && /Try fortress gates/.test(o.text)), 'route view: the fortress gates note (opt-in rule)');
    ok(ob.some(o => o.kind === 'drop' && /not tested live yet/.test(o.text)), 'route view: drops marked "not tested live yet"'); }
  // routeview_api: live from a fake Logs folder
  const RVA = require(path.join(DASH, 'routeview_api.js'));
  const ctxR2 = () => { const c = { Math, JSON, String, Number, Object, Array, isFinite, console }; vm.createContext(c); vm.runInContext(SRC.slice(SRC.indexOf('// ROUTESM-PURE-BEGIN'), SRC.indexOf('// ROUTESM-PURE-END')) + '\n;globalThis.__Q = { RSM_RULES };', c); return c.__Q; };
  ok(typeof RVA.view === 'function', 'routeview_api loads');
  // partystatus: the route line on the party card
  const pctx = { window: {}, console, STATE: { chars: [{ name: 'Lead', party: 'Lead', routeSM: { key: 'raid:25032', name: 'Millenu', state: 'SWIM_LEG', i: 1, n: 5, label: 'swim 9k', at: Date.now() } }] }, esc: (s) => String(s), GI: () => '', UI: {}, km: (d) => String(d), Date };
  vm.createContext(pctx); vm.runInContext(fs.readFileSync(path.join(DASH, 'partystatus.js'), 'utf8'), pctx);
  const line = pctx.window.PartyStatus.routeLine('Lead');
  ok(/psb-route/.test(line) && /SWIM_LEG/.test(line) && /#\/raid\/25032\/route/.test(line), 'party card: one route state line (links to the route view)');
  // ROUTE RULES on the dashboard: GET / POST /api/routerules on a scratch data folder; the route view renders the switches with their defaults
  {
    const SD = fs.mkdtempSync(path.join(os.tmpdir(), 'rr_')); fs.mkdirSync(path.join(SD, 'Scripts', 'data'), { recursive: true });
    fs.copyFileSync(path.join(DATA, 'route_rules.json'), path.join(SD, 'Scripts', 'data', 'route_rules.json'));
    fs.writeFileSync(path.join(SD, 'swarm.config.json'), JSON.stringify({ accounts: [{ character: 'A', party: 'PartyA' }, { character: 'B', party: 'PartyB' }] }));
    const call = (method, body) => new Promise((resolve) => { const req = { method, on: (ev, cb) => { if (ev === 'data' && body) cb(JSON.stringify(body)); if (ev === 'end') cb(); }, destroy: () => { } }; RVA.handle(req, {}, new URL('http://x/api/routerules'), { DATA: path.join(SD, 'Scripts', 'data'), DIR: DASH, allowed: () => true, json: (r, code, v) => resolve({ code, v }), send: (r, code) => resolve({ code }) }); });
    const g = await call('GET'); ok(g.code === 200 && g.v.parties.join() === 'PartyA,PartyB' && g.v.values.PartyA.buyKeys === true && g.v.values.PartyA.tryFortressGates === false && g.v.rules.every(r => r.label && 'default' in r), 'GET /api/routerules: parties, effective values, labels + defaults');
    const p1 = await call('POST', { party: 'PartyA', key: 'swim', value: false }); ok(p1.code === 200 && p1.v.values.PartyA.swim === false && p1.v.values.PartyB.swim === true, 'POST: one party switches swimming off, the other keeps the default');
    const fileNow = J(path.join(SD, 'Scripts', 'data', 'route_rules.json')); ok(fileNow.parties.PartyA.swim === false, 'written to route_rules.json (read live by swarm.js)');
    const p2 = await call('POST', { party: 'PartyA', key: 'swim', value: null }); ok(p2.v.values.PartyA.swim === true && !(J(path.join(SD, 'Scripts', 'data', 'route_rules.json')).parties.PartyA), 'POST null: back to the default (entry removed)');
    const bad = await call('POST', { party: 'Nope', key: 'swim', value: true }); ok(bad.code === 400, 'unknown party refused');
    ok(JSON.stringify(RVA.RR_BUILTIN) === JSON.stringify(ctxR2().RSM_RULES), 'dashboard built-in defaults = swarm.js RSM_RULES');
    const st = { opts: { party: 'PartyB' }, rules: p2.v }; const rv = fs.readFileSync(path.join(DASH, 'routeview.js'), 'utf8');
    ok(/data-rv="rule"/.test(rv) && /\(default \$\{r\.default \? 'on' : 'off'\}/.test(rv) && /back to default/.test(rv), 'route view: a switch per rule with "(default on/off)" + back to default');
    try { fs.rmSync(SD, { recursive: true, force: true }); } catch (e) { }
  }
  const css = fs.readFileSync(path.join(DASH, 'partystatus.css'), 'utf8'); ok(/\.psb-route \{[^}]*height: 20px/.test(css), 'the line has a fixed height (no layout jumps)');
  const html = fs.readFileSync(path.join(DASH, 'index.html'), 'utf8'); const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g; let mm, n = 0, bc = 0;
  while ((mm = re.exec(html))) { n++; try { new vm.Script(mm[1]); } catch (e) { bc++; } }
  ok(bc === 0, `index.html inline scripts compile (${n})`);
}
try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { }
console.log(`\nraid routes tests: ${pass} ok, ${fail} failed`);
process.exit(fail ? 1 : 0);
})().catch(e => { console.log('THROW', e.stack); process.exit(2); });
