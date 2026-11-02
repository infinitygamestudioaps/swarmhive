// test_sit_escape.js - requirement hunting.md R7 (tester Vykaax, Discord 2026-11-02, v1.13.0): a party sat 30 min with "Sit down to rest" OFF;
// "Solo: escape" OFF was ignored; solo bots "chicken out and run away, then re-engage, repeat until dead".
const fs = require('fs'), path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'Scripts_dev', 'swarm.js'), 'utf8');
let ok = 0, bad = 0; const t = (m, c) => { if (c) { ok++; console.log('ok   ' + m); } else { bad++; console.log('FAIL ' + m); } };
const grab = (name) => { const i = SRC.indexOf('function ' + name + '('); if (i < 0) return ''; let d = 0; for (let k = SRC.indexOf('{', i); k < SRC.length; k++) { if (SRC[k] === '{') d++; else if (SRC[k] === '}' && --d === 0) return SRC.slice(i, k + 1); } return ''; };
const F = new Function([grab('sitGuardDecide'), grab('soloRecoverHold'), grab('soloEscapeOffDecide'), grab('soloFleeDecide')].join('\n') + '\nreturn { sitGuardDecide, soloRecoverHold, soloEscapeOffDecide, soloFleeDecide };')();
const S = { sitting: true, hiveSit: false, restOn: false, attacked: false, partyCombat: false, sitMs: 1000, cannotMoveMsg: false };
t('SITFIX: sitting with "Sit down to rest" OFF and no Hive rest = stand up', !!F.sitGuardDecide(S));
t('SITFIX: "You cannot move while sitting" = stand up, also during a Hive rest', !!F.sitGuardDecide(Object.assign({}, S, { hiveSit: true, restOn: true, cannotMoveMsg: true })));
t('SITFIX: attacked = stand up, also during a Hive rest', !!F.sitGuardDecide(Object.assign({}, S, { hiveSit: true, restOn: true, attacked: true })));
t('SITFIX: a foreign sit while the party fights / for 2 min = stand up', !!F.sitGuardDecide(Object.assign({}, S, { restOn: true, partyCombat: true })) && !!F.sitGuardDecide(Object.assign({}, S, { restOn: true, sitMs: 130000 })));
t('SITFIX: Hive\'s own rest with the switch ON, nothing wrong = stays seated; not sitting = nothing', !F.sitGuardDecide(Object.assign({}, S, { hiveSit: true, restOn: true })) && !F.sitGuardDecide(Object.assign({}, S, { sitting: false })));
t('SITFIX: the 3 s guard runs, switches L2Swarm\'s FollowPartyLeaderSit off with the rest switch off, srvAttack stands up first',
  SRC.includes('if (!RR.on) { try { if (Options.FollowPartyLeaderSit) Options.FollowPartyLeaderSit = false; }') && /function srvAttack\(id\) \{ const o = num\(id\); if \(!o\) return; if \(!srvAttackPre\(o\)\) return;/.test(SRC) && /function srvAttackPre\(o\) \{\s*\n\s*try \{ if \(Me\.IsSitting[^\n]*standUp\(\)/.test(SRC));
t('ESCOFF: any party key with soloEscape false = OFF (a member unknown to the roster read its own name and fell back to ON)', F.soloEscapeOffDecide([undefined, false, undefined]) && !F.soloEscapeOffDecide([undefined, true]) && !F.soloEscapeOffDecide([]));
t('ESCOFF: both escape triggers (solo watch + alone-in-a-fight) use soloEscapeOff()', (SRC.match(/if \(soloEscapeOff\(\)\) return;/g) || []).length >= 2 && !/partyTactics\(CONFIG\.leader\)\.soloEscape === false/.test(SRC));
const C = { hitMs: 4000, againMs: 20000, fleeHp: 50, fleeAttackers: 2, fleeNear: Number((SRC.match(/var SOLOSAFE = \{[^}]*fleeNear: (\d+)/) || [])[1]), leaveHp: 30, finishAtkHp: 20 };
t('SOLOFLEE: monsters merely near never cause a flee (1 attacker, 4 near, 40 % = fight on)', F.soloFleeDecide({ hp: 40, hitAgo: 500, attackers: 1, near: 4, atkHp: 60 }, C).act === '');
t('SOLOFLEE: still flees from 2+ attackers below 50 % or below 30 % still hit', F.soloFleeDecide({ hp: 40, hitAgo: 500, attackers: 2, near: 2, atkHp: 60 }, C).act === 'escape' && F.soloFleeDecide({ hp: 25, hitAgo: 500, attackers: 1, near: 1, atkHp: 60 }, C).act === 'escape');
t('SOLOFLEE: after a flee nothing new is attacked for 90 s, only the monster hitting me', F.soloRecoverHold(1000, 5000, false) && !F.soloRecoverHold(1000, 5000, true) && !F.soloRecoverHold(6000, 5000, false) && SRC.includes("if (r !== 'town' && r !== 'soe') SOLO.recoverUntil = now() + 90000;"));
t('SOLOPARTY: a character in an in-game party with others is never "solo"', SRC.includes('rosterTeam().length === 0 && soloPartyOthers() === 0'));
console.log(`sit + escape: ${ok} ok, ${bad} failed`); process.exit(bad ? 1 : 0);
