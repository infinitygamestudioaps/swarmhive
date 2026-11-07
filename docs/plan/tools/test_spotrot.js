// SPOTROT + EXPERZONES guard (owner 2026-11-05: "Byg spot rotation og Exper-zonerne først")
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const ROOT = path.join(__dirname, '../../..');
const SRC = fs.readFileSync(path.join(ROOT, 'Scripts_dev/swarm.js'), 'utf8');
let ok = 0, bad = 0; const t = (m, c, x) => { if (c) { ok++; console.log('ok   ' + m); } else { bad++; console.log('FAIL ' + m + (x === undefined ? '' : ' ' + JSON.stringify(x))); } };
const R = new Function(SRC.slice(SRC.indexOf('// SPOTROT-PURE-BEGIN'), SRC.indexOf('// SPOTROT-PURE-END')) + '\nreturn { rotWhy, rotNext };')();
const T0 = 1e9, M = 60000;
t('no arrival yet = no move', R.rotWhy({ now: T0, arrivedAt: 0, everyMin: 1 }) === null);
t('after N minutes at the spot', /30 min/.test(R.rotWhy({ now: T0 + 31 * M, arrivedAt: T0, everyMin: 30 })) && R.rotWhy({ now: T0 + 29 * M, arrivedAt: T0, everyMin: 30 }) === null);
t('after N minutes without a kill', /no kill for 5 min/.test(R.rotWhy({ now: T0 + 20 * M, arrivedAt: T0, noMobsMin: 5, lastKillAt: T0 + 14 * M })) && R.rotWhy({ now: T0 + 20 * M, arrivedAt: T0, noMobsMin: 5, lastKillAt: T0 + 16 * M }) === null);
t('after N deaths', /2 death/.test(R.rotWhy({ now: T0 + M, arrivedAt: T0, afterDeaths: 2, deaths: 2 })) && R.rotWhy({ now: T0 + M, arrivedAt: T0, afterDeaths: 2, deaths: 1 }) === null);
t('when the team outgrows the spot', /outgrew/.test(R.rotWhy({ now: T0 + M, arrivedAt: T0, levelOut: true, teamMin: 33, curMax: 30 })) && R.rotWhy({ now: T0 + M, arrivedAt: T0, levelOut: true, teamMin: 32, curMax: 30 }) === null);
const Z = [{ name: 'A', levelMin: 20, levelMax: 25 }, { name: 'B', levelMin: 22, levelMax: 28 }, { name: 'C', levelMin: 40, levelMax: 45 }];
t('alternately: the next one that fits the level', R.rotNext(Z, 'A', 'next', 24) === 'B' && R.rotNext(Z, 'B', 'next', 24) === 'A');
t('random: never the current one', [0, 0.5, 0.99].every(v => R.rotNext(Z, 'A', 'random', 24, () => v) !== 'A'));
t('fewer than 2 spots = no rotation', R.rotNext([Z[0]], 'A', 'next', 24) === null);
t('the leader writes the next spot as the party choice, never in a fight', /by: 'spot rotation', rotWhy: why/.test(SRC) && /if \(IsInCombat \|\| now\(\) - \(lastAttackerOnMe\.at \|\| 0\) < 8000\) return;/.test(SRC));
// the API
const API = require(path.join(ROOT, 'Dashboard/rotation_api.js'));
t('API: on with < 2 spots is refused; values are clamped', !!API.cleanCfg({ on: true, spots: ['A'] }).error && API.cleanCfg({ on: true, spots: ['A', 'B'], everyMin: 99999 }).everyMin === 1440);
t('API: unknown zone names are dropped', API.cleanCfg({ spots: ['A', 'X'] }, new Set(['A'])).spots.join() === 'A');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rot-')); fs.writeFileSync(path.join(tmp, 'custom_zones.json'), JSON.stringify([{ name: 'A' }, { name: 'B' }]));
process.env.SWARM_ROTATION_FILE = path.join(tmp, 'rot.json');
const r = API.post({ DATA: tmp, LOGS: tmp }, { leader: 'Destroyer3', cfg: { on: true, spots: ['A', 'B'], everyMin: 30 } });
t('API: a save writes spot_rotation.json for the party', r.ok && JSON.parse(fs.readFileSync(process.env.SWARM_ROTATION_FILE, 'utf8')).parties.Destroyer3.everyMin === 30);
try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { }
// the Exper zones import
const E = require('./exper_zones.js');
const z = E.parseZmap('<zone><ExternalPoly><points><point x="0" y="0"/><point x="100" y="0"/><point x="100" y="100"/><point x="0" y="100"/></points></ExternalPoly><InternalPolies><poly><points><point x="40" y="40"/><point x="60" y="40"/><point x="60" y="60"/><point x="40" y="60"/></points></poly></InternalPolies></zone>');
t('EXPER: .zmap polygon + holes parse', z.poly.length === 4 && z.holes.length === 1);
t('EXPER: a point in a hole is outside the zone', E.inZone(10, 10, z) && !E.inZone(50, 50, z));
const mobs = E.zoneMobs(z, [{ id: 1, x: 10, y: 10, z: -100 }, { id: 2, x: 20, y: 20, z: -100 }, { id: 1, x: 50, y: 50, z: 0 }], { 1: { n: 'Ant', l: 30, ty: 'L2Monster' }, 2: { n: 'Ant Captain', l: 34, ty: 'L2Monster' } });
t('EXPER: the H5 levels come from OUR spawns inside the polygon', mobs.n === 2 && mobs.levelMin === 30 && mobs.levelMax === 34);
const CZ = JSON.parse(fs.readFileSync(path.join(ROOT, 'Scripts/data/custom_zones.json'), 'utf8').replace(/^﻿/, '')), L = Array.isArray(CZ) ? CZ : (CZ.zones || []);
const ex = L.filter(x => x && x.source === 'exper');
t('EXPER: the imported zones are never picked automatically (team exper, enabled false)', ex.length > 50 && ex.every(x => x.team === 'exper' && x.enabled === false && Array.isArray(x.poly)));
console.log(`spotrot: ${ok} ok, ${bad} failed`); process.exit(bad ? 1 : 0);
