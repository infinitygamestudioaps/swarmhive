// OFFLINE TEST of SAFESPOT-2026-10-27 (public tester Vykaax: "An order to manually trigger the 'safe spot' routes. I've been parking them in town
// before closing to update client"): !safespot = the leader stops leveling, the team walks to the spot's safe-spot route or the nearest point
// out of every aggressive monster's range and stands still (defend only) until the next order.
//   node docs/plan/tools/test_safespot_order.js   (exit code 1 when a check fails)
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const src = fs.readFileSync(process.env.SWARM_JS || path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
let fails = 0; const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails++; };
const blk = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i); if (i < 0 || j < 0) throw new Error('block ' + a + ' not found'); return src.slice(i, j); };
const plan = new Function(blk('// SAFESPOT-PURE-BEGIN', '// SAFESPOT-PURE-END') + '\nreturn safeSpotPlan;')();
// A) the decision
check(plan({ raid: true, route: [{ x: 1, y: 1 }] }).act === 'refuse' && plan({ inst: true }).act === 'refuse', 'A1 never inside a raid / instance (raids are fought to the end; !soe retreats)');
check(plan({ inTown: true, spot: { x: 1, y: 2 } }).act === 'stay', 'A2 already in a town = stand still there');
check(plan({ route: [{ x: 1, y: 1 }, { x: 2, y: 2 }], spot: { x: 5, y: 5 } }).act === 'route', 'A3 the spot\'s own safe-spot route comes first (the tester\'s routes)');
check(plan({ route: null, spot: { x: 5, y: 5 }, danger: 3 }).act === 'walk', 'A4 no route: the nearest point out of every aggro range');
check(plan({ route: [], spot: null, danger: 0 }).act === 'stay', 'A5 nothing aggressive near = stand still here');
// B) the order in swarm.js
const C = blk("case '!safespot': {", "case '!park': {");
check(/ORDER_CMDS = \/\^!\(stop\|start\|park\|safespot\|/.test(src), 'B1 !safespot is an ORDER (it supersedes the running order; the next order ends the hold)');
check(/safeSpotPlan\(\{ inTown: !!currentTownKey\(\), raid: inRaid\(\), inst: inst\.on \|\| kamaLive\.on, route: safeRoutePts\(\), spot: safeSpot\(\), danger: dangerMobs\(\)\.length \}\)/.test(C), 'B2 uses the existing safe-spot route, safeSpot() and dangerMobs()');
check(/if \(isLeader\(\)\) \{ abortRegroup\('!safespot'\); setLeadPaused\(true, orderPauseTag\('safespot'\)\); \}/.test(C) && /autoLvl\.stop = true; raidHunt\.stop = true;/.test(C), 'B3 the leader stops leveling and stays paused (lead_pause) until the next order');
check(/Object\.assign\(SAFER, \{ on: true, since: now\(\), why: 'order'/.test(C) && /while \(state\.running && orderState\.seq === seq\) await sleep\(2000\);\s*if \(SAFER\.why === 'order'\) SAFER\.on = false;/.test(C), 'B4 defend only (SAFER hold, every window) until a newer order');
check(/leadRouteWalk\(pts, 'safe spot', abort, '', null, null\)/.test(C) && /routeHop\(p, abort\)/.test(C) && /Send\.StopMove\(\)/.test(C), 'B5 the team walks together (move-together route walk), then stands still');
check(/orderWaitControl\('!safespot', seq\)/.test(C) && /orderRelease\('!safespot', seq\)/.test(C), 'B6 waits for a more important task, releases its control slot');
// C) dashboard + docs
const OQ = require(path.join(ROOT, 'Dashboard', 'orderqueue.js'));
const ORD = new Function(/const ORDER_CMDS = [^\n]+?\/;/.exec(src)[0] + '\nreturn ORDER_CMDS;')();
check(String(OQ.ORDER_RE) === String(ORD), 'C1 orderqueue.js ORDER_RE == swarm.js ORDER_CMDS');
global.window = undefined; const K = require(path.join(ROOT, 'Dashboard', 'commands.js'));
const list = (K && (K.COMMANDS || K.commands || K.list)) || [];
const e = list.find(c => c.id === 'safespot');
check(!!e && e.tpl === '!safespot' && e.kind === 'swarm' && e.handler === 'each' && e.safety === 'confirm' && e.cat === 'move' && Array.isArray(e.targets) && e.targets.includes('party'), 'C2 catalog entry (Move, !safespot, each, confirm, party target)');
const cc = fs.readFileSync(path.join(ROOT, 'Dashboard', 'cmdcenter.js'), 'utf8');
check(/\['s_move', 'Move', [^\]]*\['park', 'safespot',/.test(cc) && /safespot: \['Park at the safe spot'/.test(cc), 'C3 a button on the simple Move sheet');
check(/cmd-safespot/.test(fs.readFileSync(path.join(ROOT, 'docs', 'guide', '05-commands.md'), 'utf8')) && /!safespot/.test(fs.readFileSync(path.join(ROOT, 'docs', 'plan', 'dashboard_commands.md'), 'utf8')), 'C4 command reference + dashboard_commands.md regenerated');
check(/Park at the safe spot\*\* \(`!safespot`/.test(fs.readFileSync(path.join(ROOT, 'docs', 'guide', 'pages', 'command-center.md'), 'utf8')), 'C5 guide line (command-center.md)');
console.log(fails ? `\n${fails} FAILED` : '\nALL OK'); process.exit(fails ? 1 : 0);
