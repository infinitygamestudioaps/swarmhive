// MEMBERNOSOLO-2026-11-02: a member of a roster party never runs its own leveling (Kaeloth894, academy group 4, died alone at
// Fortress of Resistance: every restart resumed his old saved solo leveling after the move into Kaelra702's party)
const fs = require('fs'), path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '../../../Scripts_dev/swarm.js'), 'utf8');
let ok = 0, bad = 0; const check = (c, m) => { if (c) { ok++; console.log('ok   ' + m); } else { bad++; console.log('FAIL ' + m); } };
const i = SRC.indexOf('function memberNoOwnLeveling(');
const M = new Function(SRC.slice(i, SRC.indexOf('\n', i)) + '\nreturn memberNoOwnLeveling;')();
// replay: group 4 = Kaelra702 leads Kaeloth894, Myreth21, Zarith0669, Zarara58
const g4 = ['Kaelra702', 'Kaeloth894', 'Myreth21', 'Zarith0669', 'Zarara58'];
const mates = (me) => g4.filter(n => n !== me);
check(M('Kaeloth894', 'Kaelra702', mates('Kaeloth894')) === true, 'replay: Kaeloth894 (member of Kaelra702) never levels on his own');
check(M('Kaelra702', 'Kaelra702', mates('Kaelra702')) === false, 'the leader levels (leads the group)');
check(M('Dagger1', 'Dagger1', []) === false && M('Solo1', '', []) === false, 'a solo character / no leader: unchanged');
check(M('X', 'Gone', ['Y']) === false, 'a leader that is not on my roster team does not block (old config)');
// wiring: the start of autoLevelLoop and every round of its loop check it (covers the restart resume, !autolevel without an in-game party,
// plan / career solo starts - all of them go through autoLevelLoop)
const al = SRC.indexOf('async function autoLevelLoop(solo) {');
check(al > 0 && /if \(memberLevelBlock\(solo \? 'solo leveling' : 'leveling'\)\) return;/.test(SRC.slice(al, al + 400)), 'autoLevelLoop refuses at its start for a member');
check(/while \(!autoLvl\.stop && \(!raidHunt\.active \|\| raidHunt\.waiting\) && state\.running\) \{[^\n]*\n\s*if \(memberLevelBlock\('moved into a party while leveling'\)\) \{ stopCombatG\(\); writeClaim\(null\); autoLvl\.spot = null; break; \}/.test(SRC), 'a running solo loop ends when the character is moved into a party');
check(/function memberLevelBlock\(where\) \{[\s\S]{0,300}if \(a && a\.type === 'autolevel'\) setActivity\(null\);[\s\S]{0,200}Options\.ActiveFollow = followOk/.test(SRC), 'the block forgets the saved solo leveling (no resume after the next restart) and follows the leader');
check(/autoLevelLoop\(!!a\.solo\)/.test(SRC), 'the restart resume still goes through autoLevelLoop (so the block covers it)');
console.log(`member nosolo: ${ok} ok, ${bad} failed`); process.exit(bad ? 1 : 0);
