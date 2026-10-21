// OFFLINE TEST of docs/requirements/hunting.md R1 (owner 2026-10-20: "if they are hunting at a place they should continue hunting there").
//   node docs/plan/tools/test_hunt_on.js        (exit code 1 when a check fails)
// 1) HUNTON pure: huntOnDecide (SPOTRESUME-PURE) — hunt on when standing in the last spot; town / team apart / dashboard choice / outgrown /
//    skip list / another floor / old record = the normal start.
// 2) Source: leadLevel checks huntOnHere BEFORE the Giran regroup; Stop cannot erase the memory (own file lasthunt_<Name>.json);
//    autoLevelLoop takes the handed record.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..', '..', '..');
const src = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
let fails = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails++; };
const block = (name) => { const a = src.indexOf('// ' + name + '-BEGIN'), b = src.indexOf('// ' + name + '-END'); return a >= 0 && b > a ? src.slice(a, b) : null; };
const fnSrc = (name) => { const i = src.indexOf('function ' + name + '('); if (i < 0) return ''; let n = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) { if (src[k] === '{') n++; else if (src[k] === '}' && --n === 0) return src.slice(i, k + 1); } return ''; };

const rp = block('SPOTREPICK-PURE'), sr = block('SPOTRESUME-PURE');
check(!!(rp && sr && /function huntOnDecide/.test(sr)), 'huntOnDecide lives in the SPOTRESUME-PURE block');
const sb = { Math, Number, String, isFinite, JSON, Object, Array };
vm.createContext(sb);
vm.runInContext(`function inPolygon(x, y, P) { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b = P[j]; if (((a.y > y) !== (b.y > y)) && (x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x)) c = !c; } return c; }
  function nearPolygon(x, y, P, m) { if (!P || P.length < 3) return false; if (inPolygon(x, y, P)) return true; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[j], b = P[i], dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy; let t = L ? ((x - a.x) * dx + (y - a.y) * dy) / L : 0; t = Math.max(0, Math.min(1, t)); if (Math.hypot(x - a.x - t * dx, y - a.y - t * dy) <= m) return true; } return false; }
  ${rp}\n${sr}\nthis.T = { huntOnDecide, spotResumeInside };`, sb);
const T = sb.T, t = 1e12;
// ToI 5th floor room (the 2026-10-20 case): a room spot with a floor band
const room = { name: "Tower of Insolence: 5th floor, straight: Hallate's Commander room", levelMin: 60, levelMax: 70, center: { x: 115300, y: 15600, z: 940 },
  room: { id: 'toi-5-commander' }, poly: [{ x: 114800, y: 15100 }, { x: 115800, y: 15100 }, { x: 115800, y: 16100 }, { x: 114800, y: 16100 }], floor: { zMin: 800, zMax: 1100 } };
const base = { inTown: false, spread: [{ d: 300 }, { d: 800 }], lim: 9000, now: t, saved: { spot: room, at: t - 120000 }, pickKey: 'room:toi-5-commander',
  pickManual: false, level: 66, me: { x: 115256, y: 15608, z: 944 }, bad: () => false, inside: T.spotResumeInside };
const D = (o) => T.huntOnDecide(Object.assign({}, base, o));
check(D({}).keep === true, 'Tank1 at ToI 5th floor, team with him: hunt on there (no Giran trip)');
check(D({ pickKey: 'area:other' }).keep === true, 'the fresh automatic pick differs, but we stand in our spot: hunt on (a re-pick decides later)');
check(D({ inTown: true }).keep === false, 'in a town: the normal start');
check(D({ spread: [{ d: 300 }, { d: 47000 }] }).keep === false, 'a teammate 47k away (Healer2 case): the normal start (regroup)');
check(D({ spread: [{ d: 300, dead: true }] }).keep === false, 'a dead teammate: the normal start');
check(D({ pickManual: true, pickKey: 'room:elsewhere' }).keep === false, 'the dashboard points to another spot: that choice wins');
check(D({ level: 75 }).keep === false, 'outgrown the spot: the normal start (pick a new spot)');
check(D({ bad: () => true }).keep === false, 'the spot is on the skip list: the normal start');
check(D({ me: { x: 115256, y: 15608, z: -2000 } }).keep === false, 'same x/y but another floor: the normal start');
check(D({ me: { x: 140000, y: 30000, z: 944 } }).keep === false, 'away from the spot: the normal start');
check(D({ saved: { spot: room, at: t - 3 * 3600000 } }).keep === false, 'the saved spot is hours old: the normal start');

// source checks
const ll = fnSrc('leadLevel');
const iHunt = ll.indexOf('huntOnHere('), iGiran = ll.indexOf('leadGoGiran(');
check(iHunt > 0 && iHunt < iGiran, 'leadLevel: hunt-on check comes BEFORE the Giran regroup');
check(/spotResumeArm\.saved\s*=/.test(ll) && /autoLevelLoop\(false\)/.test(ll), 'leadLevel hands the spot to autoLevelLoop');
check(/spotResumeArm\.saved \|\| getActivity\(\)/.test(fnSrc('autoLevelLoop')), 'autoLevelLoop resumes from the handed record');
check(/lasthunt_\$\{Me\.Name\}\.json/.test(fnSrc('spotResumeSave')) && /lasthunt_\$\{Me\.Name\}\.json/.test(fnSrc('huntOnHere')), 'the spot memory has its own file (a Stop clears only the activity record)');
check(!/lasthunt_/.test(fnSrc('setActivity')), 'setActivity (Stop) never touches lasthunt');

console.log(fails ? `\n${fails} FAILED` : '\nALL OK');
process.exit(fails ? 1 : 0);
