// test_team_of.js — TEAMOF-2026-10-22 (public tester Vykaax: parties added through the dashboard while the bots ran; his stopped, parked main party
// kept porting to the NEW parties: MoS into RedLeader's room, Dragon Valley toward BlueLeader). Cause: teamOf(unknown name) = the main party, so the
// main leader answered the new parties' rescue calls. Runs the real teamOf from Scripts_dev/swarm.js with a fake CONFIG.
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'Scripts_dev', 'swarm.js'), 'utf8');
let ok = 0, fail = 0;
const t = (name, cond) => { if (cond) { ok++; console.log('  ok   ' + name); } else { fail++; console.log('  FAIL ' + name); } };

const i = src.indexOf('const teamOf = (name) => {'), j = src.indexOf('\n};', i) + 3;
t('teamOf found', i > 0 && j > i);
const mk = (CONFIG, livePos) => new Function('CONFIG', 'SWARM_CFG', 'livePos', src.slice(i, j) + '\nreturn teamOf;')(CONFIG, { mainLeader: 'YellowLeader' }, livePos);
const CONFIG = { mainLeader: 'YellowLeader', roster: { YellowLeader: 'tank', YellowTwo: 'healer', Jade: 'tank', JadeTwo: 'nuker' }, teams: { Jade: 'Jade', JadeTwo: 'Jade' } };
const teamOf = mk(CONFIG, { RedTwo: { lead: 'RedLeader' } });
t('main party member -> main leader', teamOf('YellowTwo') === 'YellowLeader' && teamOf('YellowLeader') === 'YellowLeader');
t('another known party -> its leader', teamOf('JadeTwo') === 'Jade');
t('an UNKNOWN character (added later) is NOT the main party: its reported leader', teamOf('RedTwo') === 'RedLeader');
t('an unknown character without a report = a party of its own', teamOf('BlueLeader') === 'BlueLeader' && teamOf('BlueLeader') !== teamOf('YellowLeader'));
t('livePos not declared yet (start-up) does not throw', (() => { try { const f = new Function('CONFIG', 'SWARM_CFG', src.slice(i, j) + '\nreturn teamOf;')(CONFIG, {}); return f('Nobody') === 'Nobody'; } catch (e) { return false; } })());

// rescue: the call carries its own leader and a leader answers only its own members
t('escRescue sends leader', /App\.emit\('swarm\.rescue', \{ name: Me\.Name, leader: isLeader\(\) \? Me\.Name : CONFIG\.leader/.test(src));
t('the rescue handler ignores another leader\'s members', /if \(d\.leader && d\.leader !== Me\.Name\) return;/.test(src));
// roster sync covers every new account, compared with the MAIN leader
const rs = src.slice(src.indexOf('function academyRosterSync()'), src.indexOf('function academyRosterSync()') + 2200);
t('roster sync adds every new account (not only academy)', /if \(!a \|\| !a\.character \|\| a\.enabled === false \|\| !a\.role\) return;/.test(rs) && /added\.push/.test(rs));
t('roster sync compares the party with the MAIN leader', /if \(party !== main\) CONFIG\.teams\[n\] = party/.test(rs) && !/party !== CONFIG\.leader/.test(rs));

console.log(`\n${ok} ok, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
