// CLANSQUADS-2026-10-25 (owner: "impossible to see academy characters and clan permissions and who is in what squad"):
//   A swarm.js clan packets: 0x5A per sub-unit (name / leader / members), FE:3E member info (squad, title, rank, sponsor), FE:3D privileges,
//     FE:3C rank list; the request string encoding (UTF-16LE + 00 00)
//   B Dashboard/clansquads.js: the clan from the leader's server list, squads with limits by clan level, ranks + privileges, academy
//     progress, characters that still carry the clan id but are not in the server list (graduated / left), no "(clan 123)" phantom clan
//   node docs/plan/tools/test_clansquads.js
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };

// ---- A) swarm.js parsing ---------------------------------------------------------------------------------------------------------
const src = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
const a = src.indexOf('const clanIntel = {'), z = src.indexOf('function clanIntelInstallHook');
ok(a > 0 && z > a, 'A0 the clan packet block is found');
const block = src.slice(a, z);
const env = new Function('num', 'now', block + '\nreturn { clanIntel, clanPacketParse, clanStrHex };')((v) => Number(v) || 0, () => 1000);
const { clanIntel: CI, clanPacketParse, clanStrHex } = env;
ok(clanStrHex('Ab') === '410062000000', 'A1 names go out as UTF-16LE + 00 00, got ' + clanStrHex('Ab'));
const w = []; const D = (v) => { w.push(v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255); }, S = (s) => { for (const ch of s) { const c = ch.charCodeAt(0); w.push(c & 255, c >> 8); } w.push(0, 0); };
function pledgeAll(ptype, name, leader, members) {
  w.length = 0; w.push(0, 0, 0x5A);
  D(ptype === 0 ? 0 : 1); D(270098570); D(ptype); S(name); S(leader); D(0); D(5); D(0); D(0); D(0); D(0); D(38100); D(0); D(0); D(0); S(''); D(0); D(0); D(0);
  D(members.length); for (const m of members) { S(m[0]); D(m[1]); D(m[2]); D(0); D(0); D(1); D(0); }
  return w.slice();
}
CI.batch = 5; clanPacketParse(pledgeAll(0, 'MyClan', 'Dagger1', [['Dagger1', 56, 8], ['Spoiler7', 46, 55]]));
clanPacketParse(pledgeAll(-1, 'SwarmAcademy', 'Spoiler7', [['Spoiler14', 32, 54]]));
ok(CI.name === 'MyClan' && CI.leader === 'Dagger1', 'A2 the main unit sets the clan name and leader (not the academy answer)');
ok(CI.units['-1'] && CI.units['-1'].name === 'SwarmAcademy' && CI.units['-1'].leader === 'Spoiler7' && CI.units['0'].n === 2, 'A3 every sub-unit keeps its name, leader and size');
ok(CI.members.length === 3 && CI.members.find(m => m.name === 'Spoiler14').unit === -1, 'A4 academy members carry unit -1');
w.length = 0; w.push(0, 0, 0xFE, 0x3E, 0x00); D(-1); S('Spoiler14'); S('cadet'); D(9); S('SwarmAcademy'); S('Spoiler7');
clanPacketParse(w.slice());
ok(CI.info.Spoiler14 && CI.info.Spoiler14.grade === 9 && CI.info.Spoiler14.sponsor === 'Spoiler7' && CI.info.Spoiler14.title === 'cadet' && CI.info.Spoiler14.unit === -1, 'A5 FE:3E member info: squad, title, rank, sponsor');
w.length = 0; w.push(0, 0, 0xFE, 0x3D, 0x00); D(6); S('Spoiler7'); D(2 | 8);
clanPacketParse(w.slice());
ok(CI.power.Spoiler7 && CI.power.Spoiler7.grade === 6 && CI.power.Spoiler7.privs === 10, 'A6 FE:3D privileges per member');
w.length = 0; w.push(0, 0, 0xFE, 0x3C, 0x00); D(2); D(1); D(1); D(6); D(20);
clanPacketParse(w.slice());
ok(CI.grades.length === 2 && CI.grades[1].rank === 6 && CI.grades[1].members === 20, 'A7 FE:3C rank list');
ok(/clanIntel\.leader === Me\.Name && now\(\) - clanIntel\.rankAt > 1800000/.test(src) && /'D0160000000000' \+ clanStrHex\(nm\)/.test(src) && /'D0140000000000' \+ clanStrHex\(nm\)/.test(src), 'A8 only the clan leader asks, at most every 30 min, with the read-only member-info / power-info packets');
ok(!/D01500|D02C00|'CC'/.test(block + src.slice(z, z + 3000)), 'A9 never the set-rank / reorganize / set-privileges packets');

// ---- B) dashboard logic ---------------------------------------------------------------------------------------------------------
const CS = require(path.join(ROOT, 'Dashboard', 'clansquads.js'));
const levels = JSON.parse(fs.readFileSync(path.join(ROOT, 'Scripts', 'data', 'clan_data.json'), 'utf8')).levels;
const leaderCi = { id: 270098570, name: 'MyClan', level: 5, leader: 'Dagger1', isLeader: true, rep: 38100, seenAt: '2026-10-25T07:00:00Z', ranksAt: '2026-10-25T07:00:00Z',
  units: [{ type: 0, name: 'MyClan', leader: 'Dagger1', n: 3 }, { type: -1, name: 'SwarmAcademy', leader: 'Spoiler7', n: 1 }],
  grades: [{ rank: 1, members: 1 }, { rank: 6, members: 2 }, { rank: 9, members: 1 }],
  members: [{ name: 'Dagger1', level: 56, classId: 8, unit: 0, grade: 1, privs: 16777214 }, { name: 'Spoiler7', level: 46, classId: 55, unit: 0, grade: 6, privs: 8 },
    { name: 'Healer7', level: 46, classId: 30, unit: 0, grade: 6, privs: 8 }, { name: 'Spoiler14', level: 32, classId: 54, unit: -1, grade: 9, privs: 0, sponsor: 'Spoiler7' }] };
const stale = { id: 270098570, name: '(clan 270098570)', level: 5, leader: '', isLeader: null, members: [], noAnswer: 3 };
const chars = [
  { name: 'Dagger1', level: 56, cls: 'Treasure Hunter', party: 'Dagger1', clanInfo: leaderCi },
  { name: 'Spoiler7', level: 46, cls: 'Bounty Hunter', party: 'Spoiler7', clanInfo: Object.assign({}, leaderCi, { leader: 'Dagger1', isLeader: false }) },
  { name: 'Spoiler14', level: 32, cls: 'Dwarven Scavenger', party: 'Spoiler14', clanInfo: Object.assign({}, leaderCi, { isLeader: false }) },
  { name: 'Spoiler12', level: 44, cls: 'Bounty Hunter', classId: 55, party: 'Spoiler12', clanInfo: stale },
  { name: 'Spoiler15', level: 44, cls: 'Bounty Hunter', party: 'Spoiler15', clanInfo: null },
];
const v = CS.build(chars, levels, { academyGraduated: ['Spoiler12'] });
ok(v.clans.length === 1 && v.clans[0].name === 'MyClan', 'B1 one clan: the "(clan 270098570)" copy of the same id is merged, not a second clan, got ' + v.clans.map(c => c.name).join(','));
const c = v.clans[0];
const main = c.squads.find(s => s.type === 0), acad = c.squads.find(s => s.type === -1);
ok(main && main.members.length === 3 && main.limit === 40, 'B2 main squad 3 / 40 at clan level 5');
ok(acad && acad.name === 'SwarmAcademy' && acad.leader === 'Spoiler7' && acad.members.length === 1 && acad.limit === 20, 'B3 academy squad with its name, leader and limit 20');
ok(c.squads.some(s => s.type === 100 && s.locked && s.unlockLevel === 6), 'B4 locked squads say which clan level opens them (Royal Guard at 6)');
ok(c.total.members === 4 && c.total.limit === 60, 'B5 total members 4 / 60 (main 40 + academy 20)');
const orv = acad.members[0];
ok(orv.sponsor === 'Spoiler7' && orv.graduateAt === 40 && orv.toGo === 8, 'B6 academy member: sponsor and levels to the graduation level');
ok(c.ranks.find(r => r.rank === 6).privs.includes('View the clan warehouse') && c.ranks.find(r => r.rank === 1).privs.length > 10, 'B7 ranks list their privileges in words');
const left = c.left.map(x => x.name).sort();
ok(left.join(',') === 'Spoiler12', 'B8 Spoiler12 carries the clan id but is not in the server list -> left (Spoiler15 has no clan at all), got ' + left);
ok(c.left[0].why.includes('graduated'), 'B9 a level 40+ 2nd-class character that left is called graduated');
ok(!c.squads.some(s => s.members.some(m => m.name === 'Spoiler12')), 'B10 a character that left is in no squad');
ok(main.members.find(m => m.name === 'Spoiler7').ours && main.members.find(m => m.name === 'Spoiler7').party === 'Spoiler7', 'B11 our characters link to their party');
const v2 = CS.build([{ name: 'Spoiler12', level: 44, party: 'Spoiler12', clanInfo: stale }], levels, {});
ok(v2.clans.length === 1 && v2.clans[0].unknown && v2.clans[0].name === 'clan 270098570', 'B12 without any server list the clan says "unknown" instead of looking like a real clan name');

console.log(fail ? `clansquads: ${pass} passed, ${fail} failed` : `clansquads: ALL OK (${pass} checks)`);
process.exit(fail ? 1 : 0);
