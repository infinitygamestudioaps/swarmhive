// test_town_landing.js - requirement towns.md R3 (owner 2026-11-01: ".townname ... actually dont fail most of the time ... check if the xyz changes
// after the .townname, could be 10 seconds wait ... write down ALL .townname locations where you arrive and give it a radius of 500")
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
const TL = JSON.parse(fs.readFileSync(path.join(ROOT, 'Scripts', 'data', 'town_landings.json'), 'utf8'));
let ok = 0, bad = 0; const t = (m, c) => { if (c) { ok++; console.log('ok   ' + m); } else { bad++; console.log('FAIL ' + m); } };
const grab = (name) => { const i = SRC.indexOf('function ' + name + '('); let d = 0; for (let k = SRC.indexOf('{', i); k < SRC.length; k++) { if (SRC[k] === '{') d++; else if (SRC[k] === '}' && --d === 0) return SRC.slice(i, k + 1); } return ''; };
const F = new Function(grab('townAtLanding') + '\n' + grab('townArrived') + '\nreturn { townAtLanding, townArrived };')();
t('town_landings.json: radius 500, wait 10 s, all 11 .townname towns', TL.radius === 500 && TL.waitMs === 10000 && ['Aden', 'Dion', 'Giran', 'Gludin', 'Gludio', 'Goddard', 'Heine', 'Hunters', 'Oren', 'Rune', 'Schuttgart'].every(k => (TL.towns[k] || []).length));
t('a landing in Giran (83473,148554) counts', F.townAtLanding(83500, 148600, -3408, 'Giran', TL.towns, 500));
t('600 away from the landing does not count as that landing', !F.townAtLanding(84073, 148554, -3408, 'Giran', TL.towns, 500));
const g = TL.towns.Gludio[0];
t('THE BUG: .gludio from 2,000 outside Gludio that landed = success (was "did not move")', F.townArrived({ x: g.x, y: g.y, z: g.z }, { x: g.x + 2000, y: g.y, z: g.z }, 'Gludio', TL.towns, 500).ok);
t('no move, not at the landing = failure', !F.townArrived({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, 'Gludio', TL.towns, 500).ok);
t('an unknown landing still counts when moved >= 3000 (then logged as a new point)', F.townArrived({ x: 5000, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, 'Nowhere', TL.towns, 500).how === 'moved');
t('townCommand: already at the landing = no command, the same success path (team wait)', /const already = townAtLanding\(/.test(SRC) && /if \(!already\) Send\.Say2\(0, cmd, '', true\);/.test(SRC));
t('townCommand: waits TL.waitMs polling townArrived, new points to Logs/town_landings_new.log', /const until = already \? now\(\) : now\(\) \+ TL\.waitMs;/.test(SRC) && /townArrived\(\{ x: Me\.X, y: Me\.Y, z: Me\.Z \}, start, c\.k, TL\.towns, R\)/.test(SRC) && SRC.includes('town_landings_new.log'));
console.log(`town landing: ${ok} ok, ${bad} failed`); process.exit(bad ? 1 : 0);
