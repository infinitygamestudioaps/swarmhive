// test_fightstall.js - requirement walls.md R4 (2026-11-02: no spoil duo reached Devil's Isle Caves any more: 74 learned "blocked" spots since 10-25
// on the island, learned from stalls while fighting / resurrecting a dead healer, closed the only way from the landing to the caves - "no way through")
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
let ok = 0, bad = 0; const t = (m, c) => { if (c) { ok++; console.log('ok   ' + m); } else { bad++; console.log('FAIL ' + m); } };
const i = SRC.indexOf('function geoLearnSkip('); const S = new Function(SRC.slice(i, SRC.indexOf('\n', i)) + '\nreturn geoLearnSkip;')();
t('FIGHTSTALL: a stall while I am in combat / dead / a teammate is dead is never learned as a wall', S({ inCombat: true }) && S({ dead: true }) && S({ mateDead: true }));
t('FIGHTSTALL: a plain stall (out of combat, everyone alive) is still learned', !S({ inCombat: false, dead: false, mateDead: false }));
t('FIGHTSTALL: geoBlockLearn asks geoLearnSkip (combatInfo + dead teammates) before writing geo_blocked.json',
  /function geoBlockLearn\(why, target\) \{[\s\S]{0,2000}geoLearnSkip\(\{ dead: Me\.IsDead, inCombat: combatInfo\(\)\.in, mateDead \}\)\) return null;[\s\S]{0,200}sharedJsonUpdate\(GEO_BLOCKED_FILE\(\)/.test(SRC));
const GP = fs.readFileSync(path.join(__dirname, 'geopath.js'), 'utf8');
t('the path finder ignores disabled learned points (they can be switched off without losing the record)', /p\.disabled !== true/.test(GP));
console.log(`fight stall: ${ok} ok, ${bad} failed`); process.exit(bad ? 1 : 0);
