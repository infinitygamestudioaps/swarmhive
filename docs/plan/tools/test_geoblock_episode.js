// GEOEPISODE-2026-11-10 guard (walls.md R5): a party stuck together at one spot is ONE episode of a learned blocked spot. Live: leader Spoiler13
// (06:20:44Z) and his follower Healer13 (06:21:00Z) stuck in the same incident at 44696,206936 counted as 2 episodes -> the spot went active and
// cut the only path from the Devil Isle landing to Devil's Isle Caves; Spoiler13, Spoiler7 and Spoiler11 looped Giran <-> Devil Isle for 6 h.
// Sandbox only (no game, no files written).
'use strict';
const fs = require('fs'), path = require('path');
const R = path.join(__dirname, '../../..'), SRC = fs.readFileSync(path.join(R, 'Scripts_dev', 'swarm.js'), 'utf8');
let ok = 0, bad = 0; const check = (c, m) => { if (c) { ok++; console.log('ok   ' + m); } else { bad++; console.log('FAIL ' + m); } };
const i = SRC.indexOf('// GEOLEARN-PURE-BEGIN'), j = SRC.indexOf('// GEOLEARN-PURE-END');
check(i > 0 && j > i, 'GEOLEARN pure block exists');
const GL = new Function(SRC.slice(i, j) + '\nreturn { GEOLEARN, geoBlockActive, geoBlockMerge };')();

const t0 = Date.parse('2026-11-10T06:20:44Z');
let r = GL.geoBlockMerge({}, { x: 44696, y: 206936, z: -3752, by: 'Spoiler13', at: t0, why: 'stuck, gave up' });
r = GL.geoBlockMerge(r.doc, { x: 44700, y: 206940, z: -3752, by: 'Healer13', at: t0 + 16000, why: 'stuck, gave up' });
check(r.doc.points.length === 1 && r.point.episodes === 1, 'Spoiler13 + Healer13 16 s apart at the same spot = 1 episode');
check(!GL.geoBlockActive(r.point) && !r.became, '... and the spot is NOT active (the caves path stays open)');
// a third party member inside the window still counts to the same episode
r = GL.geoBlockMerge(r.doc, { x: 44690, y: 206930, z: -3752, by: 'Spoiler7', at: t0 + 5 * 60000 });
check(r.point.episodes === 1 && !GL.geoBlockActive(r.point), 'another character 5 min later (inside episodeMs of the last hit) = still 1 episode');
// a real time gap = the 2nd episode -> active (the learning itself still works)
r = GL.geoBlockMerge(r.doc, { x: 44696, y: 206936, z: -3752, by: 'Spoiler11', at: t0 + 5 * 60000 + GL.GEOLEARN.episodeMs + 1000 });
check(r.point.episodes === 2 && GL.geoBlockActive(r.point) && r.became, 'two hits more than episodeMs apart = 2 episodes -> active');
const s = GL.geoBlockMerge({}, { x: 0, y: 0, z: 0, by: 'A', at: t0 }); const s2 = GL.geoBlockMerge(s.doc, { x: 10, y: 0, z: 0, by: 'A', at: t0 + GL.GEOLEARN.episodeMs + 1 });
check(s2.point.episodes === 2 && GL.geoBlockActive(s2.point), 'the same character twice, > episodeMs apart = 2 episodes -> active');
check(!/last\.by !== hit\.by/.test(SRC.slice(i, j)), 'a different reporter alone never starts a new episode');
console.log(`geoblock episode: ${ok} ok, ${bad} failed`); process.exit(bad ? 1 : 0);
