// RAIDREACH-2026-10-16: Archon Suscepter replay - the boss 534 away in a straight line, 13,106 to walk (a wall): walk around before the clear,
// and re-route when a fight does not start. Pure raidReachPlan + the wiring in raidClearArea / waitBossDead.
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(process.env.SWARM_JS || path.join(__dirname, '..', '..', '..', 'Scripts_dev', 'swarm.js'), 'utf8');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL ' + m); } };
const fn = (name) => { const i = src.indexOf('function ' + name + '('); if (i < 0) throw new Error('no ' + name); let d = 0, j = src.indexOf('{', i); for (; j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}' && --d === 0) break; } return src.slice(i, j + 1); };
const raidReachPlan = new Function(fn('raInPoly') + '\n' + fn('raidReachPlan') + '\nreturn raidReachPlan;')();

const me = { x: 20776, y: 109208 }, boss = { x: 21281, y: 109382 };
// the route the geodata gives (east around, in from the south)
let route = null;
try {
  const G = require('./geopath.js');
  const r = G.findPath({ x: me.x, y: me.y, z: -9040 }, { x: boss.x, y: boss.y, z: -8976 });
  if (r && r.ok) route = r.points;
} catch (e) { }
if (!route) route = [{ x: 20712, y: 108952 }, { x: 23096, y: 108712 }, { x: 23224, y: 110360 }, { x: 23688, y: 112600 }, { x: 21656, y: 113144 }, { x: 21448, y: 111608 }, { x: 21352, y: 110616 }, { x: 21352, y: 110040 }, { x: 21288, y: 109384 }];
const fight = [[21088, 108970], [22014, 108970], [22014, 110293], [21088, 110293]];
const p = raidReachPlan(me, boss, route, fight, 900);
ok(p.act === 'walk', 'a wall between team and boss -> walk around (' + p.act + ', walk ' + p.walk + ', straight ' + p.straight + ')');
ok(p.straight < 600 && p.walk > 3 * p.straight, 'straight ~534, walk much longer');
const end = p.pts[p.pts.length - 1];
ok(end && end.y > 109900, 'the cut ends on the south (open) side of the boss room, not behind the wall: ' + JSON.stringify(end));
ok(p.pts.length >= 3, 'the walk keeps the route points (around, not straight)');
const q = raidReachPlan(me, boss, [{ x: 21000, y: 109300 }, { x: 21281, y: 109382 }], fight, 900);
ok(q.act === 'ok', 'an open straight way -> nothing to do');
const n = raidReachPlan({ x: 0, y: 0 }, { x: 3000, y: 0 }, [{ x: 1500, y: 500 }, { x: 3000, y: 0 }], null, 900);
ok(n.act === 'ok', 'a normal approach (walk < 3x straight) -> nothing to do');
const nf = raidReachPlan(me, boss, route, null, 900);
ok(nf.act === 'walk' && nf.pts.length && (function () { const e = nf.pts[nf.pts.length - 1]; let L = 0, P = route; let i = P.findIndex(x => x.x === e.x && x.y === e.y); for (let k = i + 1; k < P.length; k++) L += Math.hypot(P[k].x - P[k - 1].x, P[k].y - P[k - 1].y); return L <= 900; })(), 'no fight area: the cut keeps <= 900 of WALKING to the boss');
// wiring
const clr = fn('raidClearArea');
ok(/raidReachFix\(b, A, runId, 'before the clear'\)/.test(clr) && clr.indexOf('raidReachFix') < clr.indexOf("swarm.clear'"), 'raidClearArea walks around before clearing / the countdown');
const wbd = fn('waitBossDead');
ok(/now\(\) - progressAt > 60000/.test(wbd) && /raidReachFix\(b, raidAreaOf\(b\), runId/.test(wbd) && /!O\.noReach/.test(wbd), 'a fight without HP lost for 60 s re-routes (not for epics)');
ok(src.includes("Object.assign({ noReach: true }, opt") || src.includes("lostMs: epicDef().lostMs, noReach: true"), 'epics opt out');   // the epic prep block is owner-only (stripped from the public package); the raid wiring keeps noReach: true
const fx = fn('raidReachFix');
ok(/isLeader\(\)/.test(fx) && /geoRoute\(/.test(fx) && /leadRouteWalk\(pl\.pts/.test(fx), 'the leader plans with the geo service and walks the team the route');
console.log(`raid reach: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
