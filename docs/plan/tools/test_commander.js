// OFFLINE TEST of the COMMANDER (tester Roketta 2026-10-12: "a single leader of multiple groups ... orders over clan chat or a private
// message to the other party leaders"). Runs the CMDR-PURE block (cmdrList / cmdrParse / cmdrRoute / cmdrSeen) and the CMDR-HOST block
// (cmdrOnSay with a mocked window: Tell, SayToParty, handleSay, PartyList ...) of Scripts_dev/swarm.js in node, plus wiring checks
// (OnSay -> cmdrOnSay before handleSay; agent2.js forwards the chat type to the brain host; the brain host has Tell).
//   node docs/plan/tools/test_commander.js        (exit 1 on a failure; SWARM_SRC=<file> tests another copy)
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const SRC = process.env.SWARM_SRC || path.join(ROOT, 'Scripts_dev', 'swarm.js');
const src = fs.readFileSync(SRC, 'utf8');
let oks = 0, fails = 0;
const check = (ok, what) => { if (ok) oks++; else fails++; console.log((ok ? 'ok   ' : 'FAIL ') + what); };
const block = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b); if (i < 0 || j < i) { console.error('block not found: ' + a); process.exit(1); } return src.slice(i, j); };
const PURE = block('// CMDR-PURE-BEGIN', '// CMDR-PURE-END'), HOST = block('// CMDR-HOST-BEGIN', '// CMDR-HOST-END');
const M = new Function(PURE + '\nreturn { CMDR, cmdrList, cmdrIs, cmdrParse, cmdrRoute, cmdrSeen };')();

// ---- 1) chat types (L2 High Five CreatureSay / L2Swarm OnSay messageType; docs/js-api: Tell = 2, SayToParty = 3, SayToClan = 4)
check(M.CMDR.whisper === 2 && M.CMDR.clan === 4, 'chat types: whisper 2, clan 4 (party 3 stays the normal order path)');
const GF = path.join(ROOT, 'docs', 'js-api', 'globals.txt');   // L2Swarm's own API reference: never shipped in the public package
const G = fs.existsSync(GF) ? fs.readFileSync(GF, 'utf8') : null;
if (!G) console.log('skip: docs/js-api/globals.txt check (L2Swarm API reference, dev install only)');
else check(/Tell\(text, target\) - Private message \(type 2\)/.test(G) && /SayToClan\(text\) - Clan chat \(type 4\)/.test(G), 'docs/js-api/globals.txt agrees (Tell = type 2, SayToClan = type 4)');

// ---- 2) config
check(M.cmdrList({ commanders: ['Roketta', ' Boss '] }).join() === 'Roketta,Boss' && M.cmdrList({ commanders: 'A, B' }).join() === 'A,B', 'commanders: an array or "A, B"');
check(M.cmdrList({}).length === 0 && M.cmdrList(null).length === 0 && M.cmdrList({ commanders: [null, ''] }).length === 0, 'no commanders = feature off');
check(M.cmdrIs(['Roketta'], 'roketta') && !M.cmdrIs(['Roketta'], 'Rokett'), 'names compare case-insensitively, whole name');

// ---- 3) parsing
const P = (t) => JSON.stringify(M.cmdrParse(t));
check(P('!level') === JSON.stringify({ cmd: '!level', targets: [], all: true }), '"!level" = every party');
check(P('@Tankname !town giran') === JSON.stringify({ cmd: '!town giran', targets: ['tankname'], all: false }), '"@Tankname !town giran" = only that party');
check(P('Tankname !supply') === JSON.stringify({ cmd: '!supply', targets: ['tankname'], all: false }), 'in game "@Tankname !supply" typed with the clan prefix arrives as "Tankname !supply"');
check(M.cmdrParse('@A,@B !stop').targets.join() === 'a,b' && M.cmdrParse('@A @B: !stop').targets.join() === 'a,b' && M.cmdrParse('A, B !stop').targets.join() === 'a,b', 'several leaders: "@A,@B", "@A @B:", "A, B"');
check(M.cmdrParse('@all !stop').all && M.cmdrParse('everyone: !stop').all, '"@all" / "everyone:" = every party');
check(M.cmdrParse('#!level').cmd === '!level', 'a party-chat "#" prefix is dropped');
check(M.cmdrParse('hello there') === null && M.cmdrParse('wow!') === null && M.cmdrParse('! ') === null && M.cmdrParse('!') === null && M.cmdrParse('') === null, 'plain talk (no !command) = not an order');
check(M.cmdrParse('a b c d e f !level') === null, 'a "!" deep inside a sentence is not an order');
check(M.cmdrParse('!level\nsecond') === null && M.cmdrParse('!x ' + 'y'.repeat(400)) === null, 'one line, max 300 characters');

// ---- 4) routing
const base = { from: 'Roketta', me: 'Tankname', leader: true, myLeader: 'Tankname', commanders: ['Roketta'], inParty: true };
const R = (o) => M.cmdrRoute(Object.assign({}, base, o));
check(R({ type: 3, text: '!level' }).act === 'none', 'party chat (3) is not the commander path (normal handleSay)');
check(R({ type: 0, text: '!level' }).act === 'none' && R({ type: 1, text: '!level' }).act === 'none' && R({ type: 8, text: '!level' }).act === 'none', 'all / shout / trade chat: ignored by the commander path');
check(R({ type: 4, text: '!level', from: 'Stranger' }).act === 'none', 'a clan member who is no commander: ignored (behaves as before)');
check(R({ type: 2, text: '!level', from: 'Stranger' }).act === 'none', 'a whisper from someone else: ignored');
check(R({ type: 4, text: 'hi all' }).act === 'none', 'the commander chatting normally: nothing happens');
let r = R({ type: 4, text: '!level' });
check(r.act === 'run' && r.how === 'party' && r.cmd === '!level' && r.to === 'Roketta' && /^ok: !level -> party Tankname/.test(r.msg), `clan "!level" -> the leader relays it to his party, answers "${r.msg}"`);
r = R({ type: 4, text: '!level', inParty: false });
check(r.act === 'run' && r.how === 'local', 'a leader without a party (solo) runs it in his own window');
check(R({ type: 4, text: '!level', leader: false, me: 'Healername' }).act === 'drop', 'clan: a party member swallows it (his leader relays it; never run twice)');
check(R({ type: 4, text: '@Otherleader !level' }).act === 'drop', 'clan "@Otherleader !level": the other leaders do nothing');
check(R({ type: 4, text: '@tankname !level' }).act === 'run', 'clan "@tankname": case does not matter');
r = R({ type: 2, text: '!supply' });
check(r.act === 'run' && r.how === 'party' && r.cmd === '!supply', 'whisper "!supply" to a party leader -> his party');
r = R({ type: 2, text: '!supply', leader: false, me: 'Healername', myLeader: 'Tankname' });
check(r.act === 'reply' && /whisper Tankname/.test(r.msg), `whisper to a member -> "${r.msg}"`);
r = R({ type: 2, text: '@Otherleader !supply' });
check(r.act === 'reply' && /not me/.test(r.msg), 'whisper naming another leader -> answered, not run');
check(R({ type: 4, text: '!level', from: 'roketta' }).act === 'run', 'commander name case-insensitive');
check(R({ type: 4, text: '!level', commanders: [] }).act === 'none', 'no commanders configured: off');
check(R({ type: 4, text: '!level', from: 'Tankname', me: 'Tankname', commanders: ['Tankname'] }).act === 'run', 'a commander who is a party leader himself: his own clan line runs for his own party too');
const seen = {};
check(M.cmdrSeen(seen, 'k', 1000) === false && M.cmdrSeen(seen, 'k', 2000) === true && M.cmdrSeen(seen, 'k', 1000 + M.CMDR.dedupeMs + 1) === false, 'the same line twice within 4 s counts once');

// ---- 5) the host part in a mocked window
function win(o) {
  const calls = { tell: [], party: [], say: [], notes: [], logs: [] };
  const timers = [];
  const env = {
    now: () => o.t || 5000, num: (v) => Number(v) || 0, File: { ReadAllText: () => JSON.stringify({ commanders: o.commanders || ['Roketta'] }) }, SWARM_ROOT: 'X', SWARM_CFG: null,
    PartyList: { Count: o.party === undefined ? 3 : o.party }, Me: { Name: o.me || 'Tankname' }, state: { role: 'sk' }, isLeader: () => o.leader !== false, CONFIG: { leader: o.myLeader || 'Tankname' },
    Tell: (m, to) => calls.tell.push([m, to]), SayToParty: (t) => calls.party.push(t), handleSay: (a, b, c) => calls.say.push([a, b, c]), IsCharacterReady: () => o.ready !== false,
    note: (t) => calls.notes.push(t), appendShared: (f, t) => calls.logs.push(t), logError: (w, e) => { throw e; }, setTimeout: (f) => { timers.push(f); return 1; },
  };
  const names = Object.keys(env);
  const H = new Function(...names, PURE + HOST + '\nreturn { cmdrOnSay, CMDRH };')(...names.map(k => env[k]));
  return { H, calls, flush: () => { while (timers.length) timers.shift()(); } };
}
let w = win({});
check(w.H.cmdrOnSay('Roketta', '!level', 4) === true && w.calls.party.join() === '!level' && w.calls.tell.length === 1 && /^ok: !level/.test(w.calls.tell[0][0]) && w.calls.tell[0][1] === 'Roketta', 'host: clan "!level" -> SayToParty("!level") + whisper "ok: ..." to the commander');
check(w.H.cmdrOnSay('Roketta', '!level', 4) === true && w.calls.party.length === 1, 'host: the same line again within 4 s is not relayed twice');
check(w.calls.logs.length === 1 && /clan chat/.test(w.calls.logs[0]) && w.calls.notes.length === 1, 'host: Logs/commander.log line + a note');
w = win({ party: 0 });
check(w.H.cmdrOnSay('Roketta', '!level', 4) === true && w.calls.party.length === 0, 'host: no party -> not in party chat');
w.flush(); check(w.calls.say.length === 1 && w.calls.say[0][0] === 'Tankname' && w.calls.say[0][1] === '!level' && w.calls.say[0][2] === 3, 'host: ... but handleSay(me, "!level", 3) in the own window (like the dashboard file channel)');
w = win({});
check(w.H.cmdrOnSay('Roketta', 'hello', 4) === false && w.H.cmdrOnSay('Somebody', '!level', 4) === false && w.H.cmdrOnSay('Tankname', '!level', 3) === false, 'host: anything else returns false (handleSay runs as before)');
w = win({ leader: false, me: 'Healername' });
check(w.H.cmdrOnSay('Roketta', '!level', 4) === true && !w.calls.party.length && !w.calls.tell.length, 'host: a member swallows the clan line silently');
check(w.H.cmdrOnSay('Roketta', '!level', 2) === true && w.calls.tell.length === 1 && /not a party leader/.test(w.calls.tell[0][0]), 'host: a member answers a whisper with whom to whisper');
w = win({ commanders: [] });
check(w.H.cmdrOnSay('Roketta', '!level', 4) === false, 'host: no commanders in swarm.config.json = off');
w = win({ ready: false });
check(w.H.cmdrOnSay('Roketta', '!level', 2) === true && !w.calls.party.length && /not ready/.test(w.calls.tell[0][0]), 'host: not ready (logging in) -> told to send it again');

// ---- 6) wiring
const onsay = src.slice(src.indexOf('globalThis.OnSay = (charName, text, messageType) => {'), src.indexOf('function handleSay(charName, text, messageType) {'));
check(/if \(cmdrOnSay\(charName, text, messageType\)\) return; handleSay\(charName, text, messageType\);/.test(onsay), 'OnSay: the commander path first, then handleSay (only when the line was not a commander order)');
const A2 = fs.readFileSync(path.join(ROOT, 'Scripts', 'agent2.js'), 'utf8');
check(/function OnSay\(charName, text, messageType\) \{ ev\('OnSay', \[String\(charName\), String\(text\), num\(messageType\)\]\); \}/.test(A2), 'brain host: agent2.js forwards OnSay WITH the chat type');
const HJ = fs.readFileSync(path.join(ROOT, 'Dashboard', 'brain_host', 'host.js'), 'utf8');
check(/Tell: \(t, to\) => fwd\('Tell', \[t, to\]/.test(HJ) && /SayToParty: \(t\) => fwd\('SayToParty'/.test(HJ), 'brain host: Tell + SayToParty are forwarded to L2Swarm');
const EX = JSON.parse(fs.readFileSync(path.join(ROOT, 'swarm.config.example.json'), 'utf8'));
check(Array.isArray(EX.commanders) && typeof EX['//commanders'] === 'string' && /clan/i.test(EX['//commanders']), 'swarm.config.example.json documents "commanders"');
check(/commanders/.test(fs.readFileSync(path.join(ROOT, 'docs', 'plan', 'INSTALL.md'), 'utf8')), 'docs/plan/INSTALL.md documents "commanders"');
console.log(`\n${oks} ok, ${fails} failed`);
process.exit(fails ? 1 : 0);
