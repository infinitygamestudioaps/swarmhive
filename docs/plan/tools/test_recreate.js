// RECREATE-2026-11-03: the academy re-creation after a graduation (live: all 5 group-1 accounts "no character list seen in 30 s - nothing
// deleted" - the old graduate still exists, L2Swarm logged straight into the game with him and the create script took Me.Name for success;
// the manager then waited for ever). Sandbox only: pure decisions + the generated create script's source.
const path = require('path'), fs = require('fs');
const R = path.join(__dirname, '../../..');
const AL = require(path.join(R, 'Dashboard', 'academy_logic.js'));
const AA = require(path.join(R, 'Dashboard', 'addaccount_api.js'));
let ok = 0, bad = 0; const t = (m, c, x) => { if (c) { ok++; console.log('ok   ' + m); } else { bad++; console.log('FAIL ' + m + (x === undefined ? '' : ' ' + JSON.stringify(x))); } };

// 1) replay: Shadora6413 (mylogin82) after Nyxara05's graduation at 15:01Z - no status file, no create result, setup done, 20 min later
const D = { made: 2, setupFor: 'Shadora6413', history: [{ graduated: 'Nyxara05', at: '2026-11-03T15:01:00.000Z' }], madeNames: ['Nyxara05', 'Shadora6413'] };
const acc = { login: 'mylogin82', character: 'Shadora6413', academyMage: true, party: 'Zarael0158' };
const cfg = { on: true, end: { newCharacter: true, deleteGraduate: true, slotWaitMin: 360 } };
let d = AL.academyDecide(acc, null, null, D, cfg, '2026-11-03T15:21:00.000Z');
t('replay: no character came into the game 20 min after the graduation -> retry (was: wait for ever)', d.act === 'retry', d);
d = AL.academyDecide(acc, null, null, D, cfg, '2026-11-03T15:10:00.000Z');
t('within the first 15 min it waits (a normal creation takes a few minutes)', d.act === 'wait', d);
// 2) back-off: 15, 30, 60 ... max 360 min, never given up
const S = (n, min) => AL.academyStuckCreate(null, null, { retries: n, createAt: '2026-11-03T10:00:00.000Z' }, 'X', new Date(Date.parse('2026-11-03T10:00:00.000Z') + min * 60000).toISOString());
t('back-off: try 2 waits 30 min, try 5 waits 360 min (capped), try 20 still retries', !S(1, 29) && !!S(1, 31) && !S(5, 359) && !!S(5, 361) && !!S(19, 361));
// 3) created but never logged in -> re-open (same name), not a new character
const r = AL.academyStuckCreate(null, { result: 'ok', name: 'X', forChar: 'X' }, { createAt: '2026-11-03T10:00:00.000Z' }, 'X', '2026-11-03T10:20:00.000Z');
t('created but never in game -> reopen the account (no second character)', r && r.act === 'reopen', r);
t('in game (a status file for it) -> the normal flow', AL.academyStuckCreate({ name: 'X', status: 'leveling' }, null, { createAt: '2026-11-03T10:00:00.000Z' }, 'X', '2026-11-03T12:00:00.000Z') === null);
t('the owner can force it at once (API recreate)', !!AL.academyStuckCreate(null, null, { forceRetry: true }, 'X', '2026-11-03T10:00:00.000Z'));
t('a first-generation account without any history is left alone', AL.academyStuckCreate(null, null, {}, 'X', '2026-11-03T10:00:00.000Z') === null);
// 4) the manager acts on it and the API has the action
const API = fs.readFileSync(path.join(R, 'Dashboard', 'academy_api.js'), 'utf8');
t('manager: reopen branch + createAt / retries on next and retry + API action recreate',
  API.includes("dec.act === 'reopen'") && API.includes("D.createAt = iso(); D.retries = 0; delete D.forceRetry;") && API.includes("b.action === 'recreate'"));
// 5) the create script: back to the character list when in game as anyone else, only the new name counts, 2 min for the list, select by slot
const s = AA.buildCreateScript('C:/x', 'mylogin82', { race: 2, sex: 0, classId: 38, stats: [1, 2, 3, 4, 5, 6], names: ['Shadora6413', 'Kaeliel2359'], resultFile: 'Logs/academy_create_mylogin82.json', del: ['Nyxara05'] }, 'Shadora6413');
let parsed = true; try { new Function(s); } catch (e) { parsed = false; }
t('the generated create script is valid JavaScript', parsed);
// RECREATE3-2026-11-03: max 8 restarts 45 s apart (was 30 x 20 s: a log flood), AutoReconnect restored on the result
t('in game as the old graduate -> RequestRestart (0x57) back to the character list, every 45 s, max 8', s.includes("const gameAct = (inGame) => !inGame ? 'none' : (NAMES.indexOf(inGame) >= 0 ? 'done' : 'restart');") && s.includes("Send.SendHex('57')") && s.includes('if (rs >= 8)'));
t('only the new character counts as done (not Me.Name of the graduate)', s.includes("if (ga === 'done') { arBack(); log('RESULT OK ' + inGame") && !s.includes("if (Me && Me.Name) { if (n === 0 || result)"));
t('the character list is waited for 2 min, then the new one is selected by its slot', s.includes('if (noList >= 24)') && s.includes('Send.CharSelected(s)'));
t('only pipeline-made graduates are deleted (DEL list unchanged, R2)', s.includes('const DEL = ["Nyxara05"]'));
// 6) the brain host drives the NEW character: the graduate's place in brain_host.json "allow" goes to it (owner: no hand work)
const AC = require(path.join(R, 'Dashboard', 'academy_api.js'));
const bh = AC.bhAllowRename({ on: true, allow: ['Spoiler11', 'Nyxara05', 'Velyn8584'] }, 'Nyxara05', 'Shadora6413');
t('brain_host.json allow: Nyxara05 -> Shadora6413 in the same place, nothing else changed', bh && JSON.stringify(bh.allow) === JSON.stringify(['Spoiler11', 'Shadora6413', 'Velyn8584']), bh);
t('allowAll lists and already-listed names are left alone', AC.bhAllowRename({ allowAll: true, allow: ['A'] }, 'A', 'B') === null && AC.bhAllowRename({ allow: ['B'] }, 'A', 'B') === null);
t('reopenAs renames the brain host entry together with the roster', API.includes('try { bhRename(ctx, acc.character, newName); }'));
// 7) the warning bar: a graduate that is in no team any more is gone at once (owner 16:20 "5 characters not reporting")
const SRV = fs.readFileSync(path.join(R, 'Dashboard', 'server.js'), 'utf8');
const gi = SRV.indexOf('function gradGone('), gradGone = new Function(SRV.slice(gi, SRV.indexOf('\n', gi)) + '\nreturn gradGone;')();
t('gradGone: a graduated academy status = gone; a leveling one or none = stays', gradGone({ status: 'graduated', name: 'Nyxara05' }, 'Nyxara05') && !gradGone({ status: 'leveling', name: 'X' }, 'X') && !gradGone(null, 'X'));
t('readStatesFresh drops a graduate that is in no team at once (not after 2 h)', SRV.includes("gradGone(readJson(path.join(STATE_DIR, `academy_${s.name}.json`), null), s.name)) continue;"));
console.log(`recreate: ${ok} ok, ${bad} failed`); process.exit(bad ? 1 : 0);
