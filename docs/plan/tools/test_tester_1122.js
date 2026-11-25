// OFFLINE TEST: tester reports of 2026-11-18..22 (v1.14.7): can't reach destinations, parties die without shots, 10m paid for a buff.
// Never touches the game, MCP or live data (the learned-wall check uses its own file).   node docs/plan/tools/test_tester_1122.js
const fs = require('fs'), path = require('path'), os = require('os');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
let pass = 0, fails = 0;
const t = (name, ok) => { if (ok) { pass++; } else { fails++; console.log('  FAIL ' + name); } };
const cut = (a, b) => { const i = SRC.indexOf(a), j = SRC.indexOf(b, i); if (i < 0 || j < 0) throw new Error('block not found: ' + a); return SRC.slice(i, j); };
// ---- LEARNEDSOFT: a learned wall never closes the only way (real Forge of the Gods legs, the four learned spots that closed it)
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 't1122-')), f = path.join(tmp, 'geo_blocked.json');
  const hit = (d) => ({ at: d, t: Date.parse(d) });
  fs.writeFileSync(f, JSON.stringify({ points: [[173288, -115144, -3700], [171832, -115576, -2700], [172264, -115432, -2900], [171304, -114856, -2250]].map(p => ({ id: 'x' + p[0], x: p[0], y: p[1], r: 250, active: true, episodes: 2, hits: [hit('2026-11-12T05:00:00Z'), hit('2026-11-12T07:00:00Z')] })) }));
  process.env.GEO_BLOCKED = f;
  const geo = require('./geopath');
  const A = { x: 169018, y: -116303, z: -2432 }, B = { x: 177800, y: -116696, z: -3672 };
  t('LEARNEDSOFT: the test really has 4 active learned walls on the Forge slope', geo.learnedAvoid(A, B, 6000).length === 4);
  if (fs.existsSync(path.join(ROOT, 'Geodata'))) {
    const r = geo.findPath(A, B, { maxLeg: 1000, maxMs: 25000 });
    t('LEARNEDSOFT: Goddard landing -> Forge Top level is found in spite of them (' + (r.ok ? r.lengthUnits : r.reason) + ')', r.ok && r.lengthUnits < 25000 && r.learnedIgnored === 4);
    const blocked = geo.findPath(A, B, { maxLeg: 1000, maxMs: 25000, avoid: [{ x: B.x, y: B.y, r: 900 }] });
    t('LEARNEDSOFT: what THIS bot just ran into (opts.avoid) stays a wall', !blocked.ok);
  }
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { }
}
// ---- PRICEREAD: a buff store price that cannot be read is never "free"
{
  const P = new Function(cut('// PRICEREAD-PURE-BEGIN', '// PRICEREAD-PURE-END') + '\nreturn { storePriceOf };')().storePriceOf;
  t('PRICEREAD: plain / with tags / thousands', P('Price: 1a') === 1 && P('<td>Price:</td><td><font color="x">10,000,000</font> a</td>') === 10000000 && P('Price:&nbsp;5000a') === 5000);
  t('PRICEREAD: 10m / 10kk / 5k / 1.5m', P('Price: 10m') === 1e7 && P('Price: 10kk') === 1e7 && P('Price: 5k') === 5000 && P('Price: 1.5m') === 1500000);
  t('PRICEREAD: no price = null, never 0', P('<html>no line</html>') === null && P('') === null && P(null) === null);
  const body = cut('async function storeBuyBuff(', 'async function leadSupply(');
  t('PRICEREAD: not readable = not bought; the clicked page is checked again; no default 0', /if \(price === null\) \{[\s\S]{0,420}not bought/.test(body) && /p2 !== null && p2 > O\.maxPrice/.test(body) && !/\|\| '0'/.test(body));
}
// ---- SHOTCRAFT + RUNNERLATE: a party out of shots is resupplied
{
  const S = new Function(cut('// PSHOP-PURE-BEGIN', '// PSHOP-PURE-END') + '\nreturn { shotBuyable };')().shotBuyable;
  const on = { on: true, max: { blessed: { S: 500 }, soulshot: {}, spiritshot: {} } }, off = { on: false, max: {} };
  t('SHOTCRAFT: "Spiritshot (S)" counts the blessed limit too, S80 / S84 = S shots', S('X: Spiritshot (S) 0', on) === true && S('X: Spiritshot (S84) 0', on) === true && S('X: Soulshot (S80) 0', off) === false);
  const FC = new Function(cut('// PSHOP-PURE-BEGIN', '// PSHOP-PURE-END') + '\nreturn { shotFromCrafter };')().shotFromCrafter;
  t('SHOTCRAFT: shots a crafter HAS keep the party on the supply list (any of its crafters)', FC('X: Spiritshot (S) 0', [{ 3952: 0 }, { 3952: 4000 }]) && FC('X: Soulshot (A) 12', [{ 1466: 900 }]) && FC('X: Soulshot (S84) 0', [{ 1467: 900 }]));
  t('SHOTCRAFT: an empty crafter never sends a party to town (Destroyer3 left the Forge for nothing, 14:30)', !FC('X: Soulshot (S) 0', [{ 1463: 36418, 1467: 0 }]) && !FC('X: Soulshot (S) 0', []) && !FC('X: Soulshot (S) 0', [{ 1467: 40 }]));
  t('SHOTCRAFT: the watch asks for real stock (fresh status, every crafter of the party)', /unb = htSupplyCritical\(low\)\.filter\(c => !shotBuyable\(c, pc\) && !shotFromCrafter\(c, crSt\)\)/.test(SRC) && /crSt = crafterStocks\(\)/.test(SRC) && /craftCraftersFor\(craftRules\(\), CONFIG\.leader\)\.forEach/.test(SRC) && /15 \* 60000\) out\.push\(st\.products\)/.test(SRC));
  t('SHOTCRAFT: supply runs OFF still buys nothing (ONESWITCH after it)', SRC.indexOf('crSt = crafterStocks()') < SRC.indexOf("if (!rcH && !pautoOn('supplyWatch')) { supplyOffSay(low); return; }"));
  const r = cut('function crunCallRunner(low, own)', "App.on('swarm.runner.call'");
  t('RUNNERLATE: the supply watch asks as "own"; in a town / 40 min without shots = its own run', /crunCallRunner\(low, true\)/.test(SRC) && /if \(own\) \{[\s\S]{0,200}currentTownKey\(\)\) return false/.test(r) && /outSince > 40 \* 60000/.test(r));
  t('RUNNERLATE: the bag call (raid / idle window) is not changed', /crunCallRunner\(\[`bag \$\{bag\} % full/.test(SRC));
}
// ---- LEGANCHOR: a fight between two waypoints is fought where the team is (behaviour, not only text)
{
  const code = cut('function mtTeamPoint()', 'const MTRUN = ');
  const run = (o) => new Function('isLeader', 'memberRoute', 'MTL', 'mtLeadPos', 'livePos', 'CONFIG', 'Me', 'now', 'num', code + '\nreturn mtAnchor();')(() => !!o.leader, o.mr || {}, o.MTL || null, () => o.seen || null, o.live || {}, { leader: 'L' }, o.me || { X: 0, Y: 0, Z: 0 }, () => 1e9, (v) => Number(v) || 0);
  const pts = [{ x: 0, y: 0, z: 0 }, { x: 3000, y: 0, z: 0 }], mr = (ph) => ({ mt: true, pts, gate: 1, ph });
  let a = run({ mr: mr('leg'), seen: { x: 900, y: 50, z: 0 } });
  t('LEGANCHOR: on a leg a member measures from the LEADER (900), not from the next waypoint (3000)', a && a.x === 900);
  a = run({ mr: mr('gate'), seen: { x: 900, y: 50, z: 0 } }); t('LEGANCHOR: at a waypoint = the waypoint (unchanged)', a && a.x === 3000);
  a = run({ mr: mr('leg'), live: { L: { X: 1200, Y: 0, Z: 0, at: 1e9 - 2000, IsDead: true } } }); t('LEGANCHOR: a dead leader = his body (the team defends there)', a && a.x === 1200);
  a = run({ mr: mr('leg') }); t('LEGANCHOR: leader position unknown = no leash (never a wrong point)', a === null);
  a = run({ leader: true, MTL: { pts, gate: 1, ph: 'leg' }, me: { X: 700, Y: 0, Z: 0 } }); t('LEGANCHOR: the leader on a leg = himself', a && a.x === 700);
  a = run({ leader: true, MTL: { pts, gate: 1, ph: 'gate' }, me: { X: 700, Y: 0, Z: 0 } }); t('LEGANCHOR: the leader at a waypoint = the waypoint', a && a.x === 3000);
  a = run({ mr: {} }); t('LEGANCHOR: no team walk = null', a === null);
  t('LEGANCHOR: help, assist, self-defence, regroup and the leg fight all use it', (SRC.match(/const tp = mtAnchor\(\)/g) || []).length === 2 && /const hp = mtAnchor\(\);/.test(SRC) && /const G = mtAnchor\(\);/.test(SRC) && /const gp = \(leg \? null : L\.pts/.test(SRC) && !/const tp = mtTeamPoint\(\)/.test(SRC));
  t('LEGANCHOR: being hit never blocks the fight hold nor freezes a healer / caster on a route', /bfStanceLive\(\) && !\(m\.mt && \(now\(\) < \(m\.hold \|\| 0\) \|\| isHealerRole\(\) \|\| noMelee\(\)\)\)/.test(SRC));
  t('LEGANCHOR: a waiting leader hits back; a caster leader only selects (never melees)', /if \(paceHit && casterOwnsAttacks\(\)\)/.test(SRC) && /MTL\.pts && !MTL\.fighting;/.test(SRC));
}
// ---- MOVEPROG / HITBACK (the pure block) + MEMBERSQUARE
{
  const M = new Function(cut('// MOVETOGETHER-PURE-BEGIN', '// MOVETOGETHER-PURE-END') + '\nreturn { MT, mtCfg, mtStuckTick, mtDecide };')();
  let tr = null, stuckAt = 0;
  for (let s = 0; s <= 60 && !stuckAt; s++) { const r = M.mtStuckTick(tr, { now: s * 1000, idx: 1, d: 1000 + (s % 2 ? 150 : 0), pos: { x: s % 2 ? 150 : 0, y: 0 } }); tr = r.tr; if (r.stuck) stuckAt = s; }
  t('MOVEPROG: running to and fro without coming closer = stuck (after ' + stuckAt + ' s)', stuckAt >= 30 && stuckAt <= 45);
  tr = null; let bad = false;
  for (let s = 0; s <= 25; s++) { const r = M.mtStuckTick(tr, { now: s * 1000, idx: 1, d: 1000, pos: { x: s * 130, y: 0 } }); tr = r.tr; if (r.stuck) bad = true; }
  t('MOVEPROG: a bending leg at run speed for 25 s is not stuck (ROUTEMOVE kept)', !bad);
  t('HITBACK: per party, default 40, limits 20-95', M.mtCfg({}).hitBack === 40 && M.mtCfg({ mtHitBackPct: 70 }).hitBack === 70 && M.mtCfg({ mtHitBackPct: 5 }).hitBack === 20 && M.mtCfg({ mtHitBackPct: 'x' }).hitBack === 40);
  t('HITBACK: the walk uses the party value', /< \(\(L\.cfg && L\.cfg\.hitBack\) \|\| MT\.lowHp\)/.test(SRC));
  t('MEMBERSQUARE: a raid engage sets the wide combat zone only on the leader', /if \(isLeader\(\)\) combatSquare\(CONFIG\.mission\.engageRadius \* zoneScale\(\), b\.x, b\.y, b\.z\);/.test(SRC) && (SRC.match(/combatSquare\(CONFIG\.mission\.engageRadius \* zoneScale\(\)/g) || []).length === 1);
}
console.log(fails ? `tester 2026-11-22: ${pass} passed, ${fails} failed` : `tester 2026-11-22: ${pass} passed, 0 failed`);
process.exit(fails ? 1 : 0);
