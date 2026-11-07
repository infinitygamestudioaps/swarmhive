// RAIDKEEP-KNOWN-2026-11-02: a raid boss raid_status.json knows as alive keeps its minions out of the hunt even when it is not in view
const fs = require('fs'), path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '../../../Scripts_dev/swarm.js'), 'utf8');
let ok = 0, bad = 0; const check = (c, m) => { if (c) { ok++; console.log('ok   ' + m); } else { bad++; console.log('FAIL ' + m); } };
const i = SRC.indexOf('function rkKnownPick('), e = SRC.indexOf('\nconst RKK', i);
const P = new Function('num', SRC.slice(i, e) + '\nreturn rkKnownPick;')(v => Number(v) || 0);
const bosses = [{ id: 25357, name: 'Sukar Wererat Chief', x: -3456, y: 112864, z: -3456 }, { id: 1, name: 'Far Boss', x: 90000, y: 0, z: 0 }];
const mins = n => n === 'Sukar Wererat Chief' ? ['Sukar Wererat Guard', 'Sukar Wererat Priest'] : [];
const me = { X: -3064, Y: 112584, Z: -3536 };
const r = P({ 25357: { name: 'Sukar Wererat Chief', alive: true }, 1: { name: 'Far Boss', alive: true } }, bosses, me, mins);
check(r.length === 1 && r[0].mins.includes('Sukar Wererat Priest'), 'Nyxwen334 replay: the living Sukar Wererat Chief nearby counts (its Priest is no target)');
check(P({ 25357: { name: 'Sukar Wererat Chief', alive: false } }, bosses, me, mins).length === 0, 'a dead / unknown boss does not count');
check(/rkKnownBosses\(meSnap\(\)\)\.forEach\(b => \{ if \(!rkBosses\.some/.test(SRC), 'the hunt target filter adds the known bosses to RAIDKEEP');
// RAIDSPOT-2026-11-02: an automatic hunting spot next to a living raid boss is blocked (Ashyn2797 died to Greyclaw Kutus' guards)
{ const kutus = [{ id: 25038, name: 'Greyclaw Kutus', x: -54800, y: 146900, z: -2880 }], st = { 25038: { name: 'Greyclaw Kutus', alive: true } };
  check(P(st, kutus, { X: -54408, Y: 146232, Z: -2880 }, () => [], 2500).length === 1 && P(st, kutus, { X: -40000, Y: 146232, Z: -2880 }, () => [], 2500).length === 0, 'RAIDSPOT: a spot within 2500 of a living boss counts, 15000 away does not');
  check(/RAIDSPOT-2026-11-02[\s\S]{0,700}rkKnownBosses\(\{ X: num\(center\.x\)[\s\S]{0,160}return `raid boss \$\{rb\[0\]\.name\} lives there`/.test(SRC), 'RAIDSPOT: spotBlock refuses an automatic spot next to a living raid boss'); }
console.log(`raidkeep known: ${ok} ok, ${bad} failed`); process.exit(bad ? 1 : 0);
