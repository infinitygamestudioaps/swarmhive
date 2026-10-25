// OFFLINE TEST of SAFEROUTE-2026-10-24 (public tester Vykaax: a 2nd "Safe Spot" waypoint list per custom spot, used when .town is refused in
// combat or the server goes down; then defend only): node docs/plan/tools/test_saferoute.js   (exit code 1 when a check fails)
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const src = fs.readFileSync(process.env.SWARM_JS || path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
let fails = 0; const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails++; };
const fn = (name) => { const a = src.indexOf('function ' + name + '('); if (a < 0) throw new Error(name + ' not found'); return src.slice(a, src.indexOf('\n}\n', a) + 2); };
const decide = new Function(fn('safeRetreatDecide') + '\nreturn safeRetreatDecide;')();
const RE = new Function(/const SHUTDOWN_RE = [^\n]+/.exec(src)[0] + '\nreturn SHUTDOWN_RE;')();
// A) when it starts
check(decide({ why: 'town', hasRoute: true, sinceLast: 1e9 }) === true, 'A1 .town refused in combat + a route = walk it');
check(decide({ why: 'town', hasRoute: false, sinceLast: 1e9 }) === false, 'A2 no route set up = the old behaviour (trap check / escape)');
check(decide({ why: 'town', hasRoute: true, sinceLast: 60000 }) === false, 'A3 at most once per 5 min (no loop with the .town retry)');
check(decide({ why: 'shutdown', hasRoute: true, sinceLast: 1000 }) === true, 'A4 a shutdown always starts it (no cooldown)');
check(decide({ why: 'town', hasRoute: true, sinceLast: 1e9, raid: true }) === false && decide({ why: 'shutdown', hasRoute: true, sinceLast: 1e9, inst: true }) === false && decide({ why: 'town', hasRoute: true, sinceLast: 1e9, esc: true }) === false, 'A5 never in a raid, an instance or the escape procedure');
check(decide({ why: 'town', hasRoute: true, sinceLast: 1e9, on: true }) === false, 'A6 not twice at the same time');
// B) the shutdown text
['The server will be coming down in 60 second(s). Please find a safe place to log out.', 'Server shutdown in 5 minutes', 'The server will restart in 10 minutes', 'Restarting in 120 seconds']
  .forEach(t => check(RE.test(t), `B shutdown recognised: "${t}"`));
['You have obtained 3 Iron Ore.', 'Server: Welcome to L2Toggle', 'Party member is coming'].forEach(t => check(!RE.test(t), `B not a shutdown: "${t}"`));
// C) wiring
check(/Number\(id\) === 1 \|\| SHUTDOWN_RE\.test\(lastSysMsg\.text\)\) safeRetreatStart\('shutdown'\)/.test(src), 'C1 system message #1 / the text starts it');
check(/globalThis\.OnAnnouncement = [^\n]*SHUTDOWN_RE\.test[^\n]*safeRetreatStart\('shutdown'\)/.test(src), 'C2 an announcement in ANY window starts it');
check(/safeRetreatStart\('town'\)\) return false;\s*\} catch \(e\) \{ \}\s*\n\s*trapCheck\(/.test(src), 'C3 a .town refused in combat tries the safe route before the trap check');
check(/function stopCalmStopped\(\) \{\s*try \{\s*if \(SAFER\.on\) return true;/.test(src) && /function stopCalmBusy\(\) \{\s*try \{\s*if \(SAFER\.on && !inRaid\(\) && !inst\.on\) return false;/.test(src), 'C4 at the safe spot the stop guard = defend only (no new pulls)');
check(/safeWaypoints: Array\.isArray\(z\.safeWaypoints\)/.test(src), 'C5 a custom spot carries its safe route');
const ed = fs.readFileSync(path.join(ROOT, 'Dashboard', 'spoteditor.js'), 'utf8'), sv = fs.readFileSync(path.join(ROOT, 'Dashboard', 'server.js'), 'utf8');
check(/\['safe', '🛡 Safe spot route'/.test(ed) && /safeWaypoints: M\.safeWaypoints \|\| \[\]/.test(ed), 'C6 the spot editor has the tool and saves it');
check(/ext\.safeWaypoints = w\.length \? w : undefined/.test(sv), 'C7 the dashboard stores it');
console.log(fails ? `\n${fails} FAILED` : '\nALL OK'); process.exit(fails ? 1 : 0);
