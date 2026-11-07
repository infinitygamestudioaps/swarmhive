// FOGEXIT guard (owner 2026-11-04, Forge of the Gods: "you CANT kill them all, because they keep coming" - kill some, step further out, finish
// the rest in the middle of the bridge, then out) + WHPRIVSLOW (the private warehouse "(Select)" way)
'use strict';
const fs = require('fs'), path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '../../../Scripts_dev/swarm.js'), 'utf8');
let ok = 0, bad = 0; const t = (m, c, x) => { if (c) { ok++; console.log('ok   ' + m); } else { bad++; console.log('FAIL ' + m + (x === undefined ? '' : ' ' + JSON.stringify(x))); } };
const blk = (a, b) => SRC.slice(SRC.indexOf(a), SRC.indexOf(b));
const F = new Function(blk('// FOGEXIT-PURE-BEGIN', '// FOGEXIT-PURE-END') + '\nreturn { LEAVE, leaveCounts, leaveDecide, leavePick, leaveLegs };')();
// pause at a step: kill some, never clear the room
t('a step waits at least 5 s', F.leaveDecide({ phase: 'step', stepMs: 2000, near: 0, quietMs: 2000 }) === 'fight');
t('a step goes on when 2 or fewer monsters are left', F.leaveDecide({ phase: 'step', stepMs: 6000, near: 2, quietMs: 0 }) === 'next');
t('a step goes on after 20 s even with monsters left (they keep spawning)', F.leaveDecide({ phase: 'step', stepMs: 20000, near: 9, quietMs: 0 }) === 'next');
t('a step with many monsters before 20 s = fight', F.leaveDecide({ phase: 'step', stepMs: 9000, near: 6, quietMs: 0 }) === 'fight');
t('the bridge: finish the rest off (8 s with none)', F.leaveDecide({ phase: 'bridge', stepMs: 30000, near: 1, quietMs: 3000 }) === 'fight' && F.leaveDecide({ phase: 'bridge', stepMs: 30000, near: 0, quietMs: 8000 }) === 'next');
t('Lavasaurus (cannot move) and the Tar Beetle never hold the exit up', !F.leaveCounts('Ancient Lavasaurus') && !F.leaveCounts('Newborn Lavasaurus') && !F.leaveCounts('Tar Beetle') && F.leaveCounts('Scarlet Stakato Soldier'));
const EX = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../Scripts/data/room_exits.json'), 'utf8'));
const pick = F.leavePick(EX, { x: 179300, y: -117000 });
t('the recorded forge-1-straight-a exit is picked from the room centre', pick && pick.id === 'forge-1-straight-a', pick && pick.id);
t('no exit far from any room', F.leavePick(EX, { x: 0, y: 0 }) === null);
const legs = F.leaveLegs(pick);
t('legs: steps, then the bridge, then the walk out, safe spot last', legs.map(l => l.phase).join(',') === 'step,step,step,bridge,out,out,out,safe', legs.map(l => l.phase));
t('consecutive points are <= 650 apart (no long blind walk)', legs.every((l, i) => i === 0 || Math.hypot(l.p[0] - legs[i - 1].p[0], l.p[1] - legs[i - 1].p[1]) <= 650) && Math.hypot(legs[0].p[0] - pick.from[0], legs[0].p[1] - pick.from[1]) <= 650);
t('the leader\'s exit walk is allowed in hold', /kind === 'walk' && typeof LEAVE !== 'undefined' && LEAVE\.active\) return false/.test(SRC));
t('!leaveroom only for the leader, only by order (no automatic caller)', /case '!leaveroom':[\s\S]{0,200}if \(isLeader\(\)\) leaveRoomOrder/.test(SRC) && (SRC.match(/leaveRoomOrder\(/g) || []).length === 2);
t('!stop / !hold end it (stopGen)', /const gen = state\.stopGen \|\| 0, stopped = \(\) => \(state\.stopGen \|\| 0\) !== gen/.test(SRC));
// WHPRIVSLOW
const W = new Function(blk('/** WHPRIVSLOW-2026-11-04: the "(Select)"', '/** What to withdraw: rows') + '\n' + SRC.slice(SRC.indexOf('function whPickWithdrawLink('), SRC.indexOf('/** WHPRIVSLOW-2026-11-04: the "(Select)"')) + '\nreturn { whPickSelectLink, whPickWithdrawLink };')();
const L1 = [{ cmd: '00', text: 'Deposit an item. (Private Warehouse)' }, { cmd: '01', text: 'Withdraw an item. (Private Warehouse) (List all)' }, { cmd: '02', text: 'Withdraw an item. (Private Warehouse) (Select)' }, { cmd: '03', text: 'Return' }];
t('normal way = "(List all)"', W.whPickWithdrawLink(L1, 'private').cmd === '01');
t('second try = "(Select)"', W.whPickSelectLink(L1, 'private').cmd === '02');
t('Select: the keeper main page -> Private Warehouse.', W.whPickSelectLink([{ cmd: '00', text: 'Private Warehouse.' }, { cmd: '01', text: 'Clan Warehouse.' }], 'private').cmd === '00');
t('Select: a category page -> its first category, never Return', W.whPickSelectLink([{ cmd: '00', text: 'Return' }, { cmd: '01', text: 'Weapon' }, { cmd: '02', text: 'Armor' }], 'private').cmd === '01');
t('the private list gets 40 s (WHRETRY 2026-11-05: 20 s was not enough for Crafter1\'s full warehouse)', /privListMs: 40000/.test(SRC));
t('WHRETRY: a withdraw list that does not come is asked for again, up to 3 times (owner: "prøv igen, du skal bare trykke withdraw")', /listTries: 3/.test(SRC) && /for \(let a = 1; a <= WH\.listTries; a\+\+\) \{\s*\n\s*r = await whOpenWithdrawOnce\(npc, kind, viaSelect\);\s*\n\s*if \(r\.ok \|\| r\.noRetry\) return r;/.test(SRC));
{ const E = new Function(SRC.slice(SRC.indexOf('// WHEMPTY-PURE-BEGIN'), SRC.indexOf('// WHEMPTY-PURE-END')) + '\nreturn whEmptyAnswer;')();
  t('WHEMPTY: the server\'s "nothing deposited" answer = an empty warehouse (owner: "Crafter1 private warehouse is completely empty")', E({ id: 282, at: 10, text: '' }, 5) && E({ id: 0, at: 10, text: 'You have not deposited any items in your warehouse.' }, 5) && !E({ id: 282, at: 1, text: '' }, 5) && !E({ id: 130, at: 10, text: 'Your warehouse is full.' }, 5));
  t('WHEMPTY: the withdraw look returns an empty list instead of "no links"', /if \(!r\.ok && whEmptyAnswer\(lastSysMsg, t0\)\) return \{ ok: true, rows: \[\]/.test(SRC)); }
t('a "(Select)" list never replaces the full private list', /wh_private_' \+ Me\.Name \+ '_select\.json/.test(SRC));
console.log(`leaveroom: ${ok} ok, ${bad} failed`); process.exit(bad ? 1 : 0);
