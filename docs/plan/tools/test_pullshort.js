// PULLSHORT + HOLDWALK guard (owner 2026-11-04): a pull only after a quiet camp, max ~200 out in a STRAIGHT line and straight back;
// in hold no script walks except healers reaching the party ("Healers should always heal the party members. Follow distance is fine.")
'use strict';
const fs = require('fs'), path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '../../../Scripts_dev/swarm.js'), 'utf8');
let ok = 0, bad = 0; const t = (m, c) => { if (c) { ok++; console.log('ok   ' + m); } else { bad++; console.log('FAIL ' + m); } };
const cut = (a, b) => { const i = SRC.indexOf(a); return i < 0 ? '' : SRC.slice(i, SRC.indexOf(b, i)); };
const num = (v) => Number(v) || 0;
const inPolygon = new Function(cut('function inPolygon(', '\n}\n') + '\n}\nreturn inPolygon;')();
const P = new Function('num', 'inPolygon', 'dungeonRooms', cut('var PULL = {', 'async function pullStraight') + '\nreturn { PULL, pullGate, pullPointOk };')(num, inPolygon, () => []);
t('no pull while a monster is at the camp', P.pullGate({ campMobs: 2, quietSince: 1000, nowMs: 99999 }).go === false);
t('no pull right after the camp got quiet', P.pullGate({ campMobs: 0, quietSince: 0, nowMs: 10000 }).go === false);
t('a pull once the camp was quiet for 4 s', P.pullGate({ campMobs: 0, quietSince: 10000, nowMs: 14100 }).go === true);
t('no room data: a point 200 out is ok, 600 out (the bridge) is skipped', P.pullPointOk({ x: 0, y: 0 }, { x: 200, y: 0 }) && !P.pullPointOk({ x: 0, y: 0 }, { x: 600, y: 0 }));
// PULLROOM: with rooms, a point must lie inside one of them (camp room + the ground's pullRooms), whatever its distance
const sq = (x0, y0, x1, y1) => ({ id: 'r', P: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }] });
t('PULLROOM: a point inside an allowed room is ok, outside every room is skipped', P.pullPointOk({ x: 0, y: 0 }, { x: 900, y: 0 }, [sq(-100, -100, 100, 100), sq(800, -100, 1000, 100)]) && !P.pullPointOk({ x: 0, y: 0 }, { x: 500, y: 0 }, [sq(-100, -100, 100, 100), sq(800, -100, 1000, 100)]));
t('PULLROOM: the pull walks the room graph (rgWalkInside), not a straight line, inside a dungeon', /const r = await rgWalkInside\(x, y, z, 80,/.test(SRC));
t('PULLROOM: the AOE ground keeps pullRooms (dashboard)', /out\.pullRooms = /.test(fs.readFileSync(path.join(__dirname, '../../../Dashboard/aoeteam_api.js'), 'utf8')));
const run = cut('async function aoePullRun(', '\n/** everyone but the pullers');
t('the pull uses the quiet gate before it starts', /pullGate\(\{ campMobs: aoeCampMobs\(c, 900\)\.length/.test(run) && run.indexOf('pullGate(') < run.indexOf('AOE.runs++'));
t('route points: only inside the allowed rooms, walked via pullStraight (room graph), never the old free walk', /if \(OR\.roomCheck && !pullPointOk\(camp, p, pullRooms\)\)/.test(run) && /const pullRooms = pullRoomsOf\(c\);/.test(run) && /\} else if \(!\(await pullStraight\(num\(p\.x\), num\(p\.y\), pz\)\)\) \{[^\n]*break; \}/.test(run) && !/await walkDirect\(num\(p\.x\)/.test(run));   // OWNERRUN: only the owner's recorded routes skip the room check
t('back to the camp straight first', /if \(!\(await \(OR\.roomCheck \? pullStraight\(num\(camp\.x\), num\(camp\.y\), cz\) : ownerLeg\(num\(camp\.x\), num\(camp\.y\), cz\)\)\)\)/.test(run));
const H = new Function(cut('function holdDecide(', '/** the !stop window') + '\nreturn holdDecide;')();
t('hold: no script walk for a fighter (any distance)', H({ on: true, kind: 'walk', dist: 50 }).ok === false && H({ on: true, kind: 'walk', dist: 1100 }).ok === false);
t('hold: a healer may always walk to heal the party', H({ on: true, kind: 'walk', dist: 3000, healer: true }).ok === true);
t('hold: no invented 1200 left', !/Number\(o\.max\) \|\| 1200/.test(SRC));
console.log(`pullshort: ${ok} ok, ${bad} failed`); process.exit(bad ? 1 : 0);
