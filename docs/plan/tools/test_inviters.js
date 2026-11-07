// INVITERS guard (owner 2026-11-05: "Dagger1 skal IKKE ud og hunte når han er clan leder ... han skal være Runner"; "ALLE kunne inviteret
// til klannen. Crafter1 er ALTID i Giran alligevel"): the clan crafter (Crafter1) invites besides the clan leader
'use strict';
const fs = require('fs'), path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '../../../Scripts_dev/swarm.js'), 'utf8');
let ok = 0, bad = 0; const t = (m, c, x) => { if (c) { ok++; console.log('ok   ' + m); } else { bad++; console.log('FAIL ' + m + (x === undefined ? '' : ' ' + JSON.stringify(x))); } };
const F = new Function(SRC.slice(SRC.indexOf('// INVITERS-PURE-BEGIN'), SRC.indexOf('// INVITERS-PURE-END')) + '\nreturn { clanInviterList, clanNoInviteRight };')();
t('default: the clan leader + the clan crafter invite', F.clanInviterList(undefined, 'Dagger1', 'Crafter1').join() === 'Dagger1,Crafter1');
t('a configured list replaces the crafter; the leader always stays first', F.clanInviterList(['Bishop1', 'Dagger1'], 'Dagger1', 'Crafter1').join() === 'Dagger1,Bishop1');
t('an empty list = only the clan leader', F.clanInviterList([], 'Dagger1', 'Crafter1').join() === 'Dagger1');
t('a "no right" answer is recognised, a "clan is full" answer is not', F.clanNoInviteRight('You are not authorized to do that.') && !F.clanNoInviteRight('The clan is full'));
const iv = SRC.slice(SRC.indexOf('// INVITERS-PURE-END'), SRC.indexOf('globalThis.OnAskJoinPledge'));
t('the invite loop runs on every inviter, founding a clan only on the leader', /if \(!iLead && !clanInviters\(\)\.includes\(Me\.Name\)\) return;/.test(iv) && /if \(iLead && !myClanName\(\) &&/.test(iv));
t('an inviter without the right pauses 1 h (never spams the server)', /CLANAUTO\.noRightUntil = now\(\) \+ 3600000/.test(iv) && /if \(!iLead && now\(\) < \(CLANAUTO\.noRightUntil \|\| 0\)\) return;/.test(iv));
console.log(`inviters: ${ok} ok, ${bad} failed`); process.exit(bad ? 1 : 0);
