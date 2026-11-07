// PARTYBUFF guard (owner 2026-11-06: "it would be good if chanter2 could cast Fighter buffs for party" + "a healer AND or Doomcryer is mostly
// NEVER in combat. So they can always use the community buffer. Then they should just buff with fighter buffs").
'use strict';
const fs = require('fs'), path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '../../../Scripts_dev/swarm.js'), 'utf8');
let ok = 0, bad = 0; const t = (m, c, x) => { if (c) { ok++; console.log('ok   ' + m); } else { bad++; console.log('FAIL ' + m + (x === undefined ? '' : ' ' + JSON.stringify(x))); } };
const cut = (a, b) => SRC.slice(SRC.indexOf(a), SRC.indexOf(b));
const P = new Function(cut('// PARTYBUFF-PURE-BEGIN', '// PARTYBUFF-PURE-END') + '\nreturn { partyBuffPick, PARTYBUFF };')();

const team = [{ name: 'Destroyer3', role: 'destroyer' }, { name: 'Destroyer4', role: 'destroyer' }, { name: 'Bishop2', role: 'bishop' }, { name: 'Chanter2', role: 'doomcryer' }];
const base = (o) => Object.assign({ now: 1e7, lastAt: 0, pendingUntil: 0, board: true, on: true, queue: [{ name: 'Destroyer3', role: 'destroyer' }, { name: 'Destroyer4', role: 'destroyer' }], members: team }, o);
let r = P.partyBuffPick(base());
t('fighters waiting -> the doomcryer (Chanter2) gives Buff Party', r && r.buffer === 'Chanter2' && r.fighters.join() === 'Destroyer3,Destroyer4', r);
r = P.partyBuffPick(base({ members: team.map(m => m.name === 'Chanter2' ? Object.assign({}, m, { fight: true }) : m) }));
t('the doomcryer in combat -> the healer (Bishop2) does it', r && r.buffer === 'Bishop2', r);
r = P.partyBuffPick(base({ members: team.map(m => /Chanter2|Bishop2/.test(m.name) ? Object.assign({}, m, { fight: true }) : m) }));
t('both supports in combat -> nobody (the normal one-by-one turns)', r === null);
t('a dead support is skipped', P.partyBuffPick(base({ members: team.map(m => m.name === 'Chanter2' ? Object.assign({}, m, { dead: true }) : m) })).buffer === 'Bishop2');
t('only casters waiting -> no Buff Party (they take Mystic themselves)', P.partyBuffPick(base({ queue: [{ name: 'Bishop2', role: 'bishop' }] })) === null);
t('at most one Buff Party per 5 min', P.partyBuffPick(base({ lastAt: 1e7 - 60000 })) === null && !!P.partyBuffPick(base({ lastAt: 1e7 - 300001 })));
t('not while one is on its way', P.partyBuffPick(base({ pendingUntil: 1e7 + 5000 })) === null);
t('board buffs off for the party -> nothing', P.partyBuffPick(base({ board: false })) === null);
t('the scheme is Warrior (fighter buffs)', P.PARTYBUFF.scheme === 'Warrior');
// the party switch + the order (owner: "Make it something u Can enable for parties and action to ... ask it to do")
t('party switch OFF -> nothing by itself', P.partyBuffPick(base({ on: false })) === null);
t('your order works with the switch off, inside the 5 min and with nobody waiting', !!P.partyBuffPick(base({ on: false, force: true, lastAt: 1e7 - 1000, queue: [] })));
t('your order still needs a support out of combat', P.partyBuffPick(base({ force: true, members: team.map(m => /Chanter2|Bishop2/.test(m.name) ? Object.assign({}, m, { fight: true }) : m) })) === null);
t('host: the automatic path reads the party switch partyBuff', /const on = !!force \|\| pautoOn\('partyBuff'\);/.test(SRC) && /partyBuff: \{ char: false,/.test(SRC));
t('host: !partybuff runs it at once on the leader', /case '!partybuff':[^\n]*\n\s+if \(isLeader\(\)\) leaderPartyBuff\(true\);/.test(SRC));
const API = fs.readFileSync(path.join(__dirname, '../../../Dashboard/partyauto_api.js'), 'utf8'), CMD = fs.readFileSync(path.join(__dirname, '../../../Dashboard/commands.js'), 'utf8');
t('dashboard: the switch is in party settings -> Combat, default off', /\{ key: 'partyBuff', char: false, group: 'combat'/.test(API) && !/key: 'partyBuff'[^\n]*def: true/.test(API));
t('dashboard: the order is in the command catalog', /\{ id: 'partybuff',[^\n]*tpl: '!partybuff', handler: 'leader', targets: \['party'\]/.test(CMD));
// host wiring
t('the leader tries the party buff before a one-by-one turn', /if \(now\(\) < PB\.pendingUntil\) return;[^\n]*\n\s+try \{ if \(leaderPartyBuff\(\)\) return; \}/.test(SRC));
t('never by itself in raids (the raid wave owns that)', /function leaderPartyBuff\(force\) \{\s+if \(\(!force && inRaid\(\)\) \|\| !boardOn\(\)\)/.test(SRC));
t('the support clicks Warrior -> Buff Party', /bbsApplyScheme\(PARTYBUFF\.scheme, 'Buff Party'\)/.test(SRC));
t('casters put Mystic on top afterwards', /App\.emit\('swarm\.buff\.partydone', \{ leader \}\);/.test(SRC));
t('a failed Buff Party falls back to the normal turns', /did not work — the normal one-by-one turns go on/.test(SRC));
console.log(`partybuff: ${ok} ok, ${bad} failed`); process.exit(bad ? 1 : 0);
