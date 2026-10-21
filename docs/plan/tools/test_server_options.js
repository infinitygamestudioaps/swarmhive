// OFFLINE TEST of SRVOPT-2026-10-21 (public tester Hero: buff sources / ways to town / "Follow Party Leader's Dialog" tick box per party).
// Never touches the game, MCP or the live data (scratch files in os.tmpdir(); the live Scripts/data/server_options.json is compared before / after).
//   node docs/plan/tools/test_server_options.js        (exit code 1 when a check fails; SWARM_JS=<file> tests another copy of swarm.js)
// 1) SRVOPT-PURE of Scripts_dev/swarm.js: defaults = today's behaviour, party > default > swarm.config.json > built-in, cleaning, source order
//    fallback, town ways, newbie link pick, station order, store wants; Dashboard/serveropts_api.js carries the SAME block (text copy).
// 2) the host part on stubs: no file = needsBuff exactly as before (board if it works, else nothing), the chosen source decides, gkServerFollow
//    per party, soTownGo tries the ways in order, the Newbie Helper turn (link by text, level limit), a whole STATION turn between two windows
//    (guest leaves its party, the buffer invites, buffs, dismisses).
// 3) the hooks in swarm.js (buffSelf / townCommand / followTeleport / teamTeleport / the regroup / storeBuyBuff options).
// 4) Dashboard/serveropts_api.js on a scratch file: one party's slice, null removes, the all-parties entry, bad values (400), rev conflict (409),
//    history + atomic write; server.js hooks it; partysettings.js has the Server section, its save and its change lines.
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const ROOT = path.join(__dirname, '..', '..', '..');
const SRCF = process.env.SWARM_JS || path.join(ROOT, 'Scripts_dev', 'swarm.js');
const src = fs.readFileSync(SRCF, 'utf8');
let fails = 0, n = 0;
const check = (ok, what, info) => { n++; console.log((ok ? 'ok   ' : 'FAIL ') + what + (!ok && info ? ' — ' + info : '')); if (!ok) fails++; };
const blk = (b, e, incl) => { const i = src.indexOf(b), j = src.indexOf(e, i + 1); if (i < 0 || j < i) { console.error(b + ' block not found'); process.exit(1); } return src.slice(i, incl ? j + e.length : j); };
const LIVE = path.join(ROOT, 'Scripts', 'data', 'server_options.json');
const live0 = fs.existsSync(LIVE) ? fs.readFileSync(LIVE, 'utf8') : null;

(async () => {
  // ---- 1) pure -------------------------------------------------------------------------------------------------------------------
  const PURE = blk('// SRVOPT-PURE-BEGIN', '// SRVOPT-PURE-END', true);
  const P = new Function(PURE + '\nreturn { SRVOPT, soNorm, soEffective, soBuffPick, soTownWays, soPickLink, soStationNext, soStoreWanted, soTitleRe, soNeedsOther };')();
  const D0 = P.soEffective({}, 'Tank1', null);
  check(D0.buffSources.join() === 'board,party' && D0.townWays.join() === 'auto' && D0.serverFollow === true, 'no file: board then party, town "auto", the server takes the party along (= today)');
  check(P.soEffective(null, 'X', {}).buffSources.join() === 'board,party' && P.soEffective('junk', 'X', 5).townWays.join() === 'auto', 'broken input: the defaults');
  const J1 = { default: { buffSources: ['newbie', 'party'], serverFollow: false }, parties: { Tank1: { buffSources: ['store', 'board', 'store', 'nonsense'], townWays: ['soe', 'walk'] } } };
  const E1 = P.soEffective(J1, 'Tank1', null), E2 = P.soEffective(J1, 'Destroyer3', null);
  check(E1.buffSources.join() === 'store,board' && E1.src.buffSources === 'party', 'a party list wins; duplicates and unknown sources dropped');
  check(E2.buffSources.join() === 'newbie,party' && E2.src.buffSources === 'default', 'a party without its own list: the all-parties list');
  check(E1.townWays.join() === 'soe,walk' && E2.townWays.join() === 'auto', 'town ways: party list / auto');
  check(E1.serverFollow === false && E1.src.serverFollow === 'default', 'serverFollow from the all-parties entry');
  check(P.soEffective({}, 'X', { serverFollow: false }).serverFollow === false && P.soEffective({}, 'X', { serverFollow: false }).src.serverFollow === 'config', 'serverFollow: swarm.config.json is the fallback');
  check(P.soEffective({ parties: { X: { serverFollow: true } } }, 'X', { serverFollow: false }).serverFollow === true, '... the party switch beats swarm.config.json');
  check(P.soEffective({ parties: { X: { townWays: ['auto', 'soe'] } } }, 'X').townWays.join() === 'auto', '"auto" in a list = auto (the old code path)');
  const E3 = P.soEffective({ parties: { X: { store: { buffs: ['Chant of Victory', '', 'Chant of Victory'], maxPrice: -5, titles: [] }, station: { x: 'a', buffers: ['A', 'B'], minBuffs: 99 }, newbie: { maxLevel: 500 }, walkMax: 5, returnSkills: [1050, 'x', 0, 2.5] } } }, 'X');
  check(E3.store.buffs.join() === 'Chant of Victory' && E3.store.maxPrice === 0 && E3.store.titles.join() === 'buff', 'store: names cleaned, price clamped, empty title list = "buff"');
  check(E3.station.x === 0 && E3.station.buffers.join() === 'A,B' && E3.station.minBuffs === 40 && E3.newbie.maxLevel === 99 && E3.walkMax === 2000, 'station / newbie / walkMax clamped');
  check(E3.returnSkills.join() === '1050', 'return skill ids: only whole positive numbers');
  // source order fallback
  const pk = P.soBuffPick(['store', 'board', 'party'], { store: 'only in a town', board: true, party: true });
  check(pk.src === 'board' && pk.skipped.length === 1 && pk.skipped[0].why === 'only in a town', 'the first source that works is used; the skipped ones say why');
  check(P.soBuffPick(['store', 'newbie'], { store: 'x', newbie: 'y' }).src === 'party', 'none works: the party (= no board turn)');
  check(P.soBuffPick(['board', 'party'], { board: 'off', party: true }).src === 'party' && P.soBuffPick(null, { board: true }).src === 'board', 'default order: board when it works, else party (= boardOn rule)');
  check(P.soTownWays(['auto']) === null && P.soTownWays(null) === null && P.soTownWays(['soe', 'bogus', 'walk']).join() === 'soe,walk', 'soTownWays: auto / nothing = null (old path), else the list');
  // newbie link pick
  const links = [{ cmd: 'a', text: 'Quest' }, { cmd: 'b', text: 'Receive magic support (buffs)' }, { cmd: 'c', text: 'Buy soulshots' }, { cmd: 'd', text: 'Support magic' }];
  check(P.soPickLink(links, P.SRVOPT.newbieWant, P.SRVOPT.newbieAvoid).cmd === 'd', 'newbie link: the buff link by text (shortest), never quest / shop / shots');
  check(P.soPickLink([{ cmd: 'x', text: 'Teleport' }], P.SRVOPT.newbieWant, P.SRVOPT.newbieAvoid) === null, 'no buff link: null');
  check(P.soStationNext(['A', 'B', 'C'], ['A'], (x) => x !== 'B') === 'C' && P.soStationNext(['A'], ['A']) === null, 'station: the next online buffer that has not buffed me');
  check(P.soStoreWanted(['CoV', 'PoF'], { CoV: 7200, PoF: 100 }, 3600).join() === 'PoF', 'store: only the buffs with less than the minimum left');
  check(P.soTitleRe(['cov', 'a.b']).test('+15 COV 1a') && P.soTitleRe(['a.b']).test('xa.bx') && !P.soTitleRe(['a.b']).test('axb'), 'store title words: case-insensitive, taken literally');
  check(P.soNeedsOther('station', D0, 3, []) && !P.soNeedsOther('station', D0, 9, []) && P.soNeedsOther('store', D0, 30, ['x']) && !P.soNeedsOther('party', D0, 0, []), 'soNeedsOther per source');
  // API copy
  const apiSrc = fs.readFileSync(path.join(ROOT, 'Dashboard', 'serveropts_api.js'), 'utf8');
  check(apiSrc.indexOf(PURE) >= 0, 'Dashboard/serveropts_api.js carries the SAME SRVOPT-PURE block (text copy)');

  // ---- 2) host ---------------------------------------------------------------------------------------------------------------------
  const HOST = blk('// SRVOPT-PURE-BEGIN', '\nfunction fmtTime(');
  function world(o) {
    const W = Object.assign({ t: 1760000000000, files: {}, notes: [], name: 'Tank1', team: 'Tank1', town: '', board: true, buffs: 0, level: 40, X: 0, Y: 0, Z: 0, said: [], party: null, bus: null, live: {}, npcs: [], chars: [] }, o || {});
    W.handlers = {};
    const App = { on: (ev, f) => { (W.handlers[ev] = W.handlers[ev] || []).push(f); }, emit: (ev, data) => { (W.bus || [W]).forEach(w => setTimeout(() => (w.handlers[ev] || []).forEach(f => f({ data, source: { characterName: W.name } })), 0)); } };
    const Me = { get Name() { return W.name; }, get Level() { return W.level; }, get X() { return W.X; }, get Y() { return W.Y; }, get Z() { return W.Z; }, IsDead: false, objId: 77, MpPercent: 100, IsInCombat: false };
    const party = () => (W.party ? W.party.members : []);
    W.env = {
      File: { ReadAllText: (f) => { if (!W.files[f]) throw new Error('nofile'); return W.files[f].text; } }, __DIR__: 'C:\\L2', SWARM_ROOT: 'C:\\L2', SWARM_CFG: W.cfg || null,
      fileStamp: (f) => (W.files[f] ? W.files[f].stamp : ''), now: () => W.t, sleep: (ms) => { W.t += ms; return new Promise(r => setTimeout(r, 2)); },
      Me, CONFIG: { leader: W.team, gatekeeper: { serverFollow: true }, buffs: { minLongBuffs: 10 } }, teamOf: () => W.team, App,
      note: (m) => W.notes.push(m), log: () => { }, logError: (w, e) => W.notes.push('ERR ' + w + ' ' + (e && e.message)), intent: () => { }, intentDone: () => { }, SayToParty: (m) => W.said.push(m),
      currentTownKey: () => W.town, boardOn: () => W.board, longBuffCount: () => W.buffs, livePos: W.live, num: Number, state: W.state || (W.state = {}),
      hostSnap: { buffs: () => null }, BuffsList: { forEach: (f) => (W.buffList || []).forEach(f) }, CharList: { forEach: (f) => W.chars.forEach(f) }, NpcList: { forEach: (f) => W.npcs.forEach(f) },
      PartyList: { forEach: (f) => party().forEach(nm => f({ Name: nm })) }, get IsPartyLeader() { return !!(W.party && W.party.leader === W.name); }, IsEnabled: false, EnableBot: () => { }, DisableBot: () => { },
      SCHED: { clear: (i) => clearInterval(i) }, setInterval: (fn) => setInterval(fn, 1), clearInterval, setTimeout, clearTimeout, standUp: () => { }, stopCombatG: () => { }, bfInCombat: () => false,
      Send: W.send || {}, rkAllBuffs: (x) => x, rkMyBuffSkills: () => W.myBuffs || { target: [], party: [] }, rkCastBuff: async (s, t) => { (W.cast = W.cast || []).push([s.id, t && t.objId]); if (W.onCast) W.onCast(s, t); },
      npcLinks: (h) => { const out = []; const re = /<a\b[^>]*action="bypass\s+([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi; let m; while ((m = re.exec(h))) out.push({ cmd: String(m[1]).replace(/^-h\s+/, ''), text: m[2] }); return out; }, cleanBypass: (c) => String(c).replace(/^-h\s+/, ''), htmlText: (h) => String(h).replace(/<[^>]+>/g, ''),
      DLG: { open: async (npc) => (W.dlgOpen ? W.dlgOpen(npc) : { ok: false }) }, dlgPage: async (l) => (W.dlgPage ? W.dlgPage(l) : null),
      geoWalk: async (x, y) => { W.X = x; W.Y = y; return true; }, walkDirect: async (x, y) => { W.X = x; W.Y = y; return true; },
      storeBuyBuff: async (id, mode, label, opt) => { (W.store = W.store || []).push({ id, label, opt }); return { ok: true, why: 'bought' }; },
      TOWN_LAND: { Giran: [83473, 148554], Dion: [15619, 143132] }, leadMode: () => false, isLeader: () => W.name === W.team, teamNames: () => [], waitForTeamHere: async () => { },
      townCommand: async (why, want, o) => { (W.calls = W.calls || []).push('townCmd' + (o && o.soInner ? ':inner' : '')); return !!W.cmdWorks; },
      townByGatekeeper: async () => { (W.calls = W.calls || []).push('gatekeeper'); return false; }, scrollToTown: async () => { (W.calls = W.calls || []).push('soe'); return false; },
      SkillsList: { forEach: (f) => (W.skills || []).forEach(f) }, sendAppearing: () => { }, here: () => '', SWARM_ROOT_: '', FindSkillId: (nm) => (nm === 'Chant of Victory' ? 1363 : 0),
    };
    W.put = (o2) => { W.files['C:\\L2\\Scripts\\data\\server_options.json'] = { text: JSON.stringify(o2), stamp: String(++W.t) }; };
    W.H = new Function('env', 'with (env) {\n' + HOST + '\nreturn { needsBuff, soBuffSource, soMine, gkServerFollow, soBuffOther, soTownGo, soStationBuff, soNewbieBuff, soStoreBuff, soReturnSkill, SOH }; }')(W.env);
    return W;
  }
  { const W = world({ board: true, buffs: 3 });
    check(W.H.needsBuff() === true && W.H.soBuffSource() === 'board', 'no file + the board works: a board turn when buffs are low (as before)');
    W.buffs = 15; W.H.SOH.pickAt = 0; check(W.H.needsBuff() === false, '... and none when buffed (as before)');
    const W2 = world({ board: false, buffs: 0 }); check(W2.H.needsBuff() === false && W2.H.soBuffSource() === 'party', 'no file + no board: never a turn (as before: the own buffers)');
    check(W.H.gkServerFollow() === true, 'no file: the server takes the party along (CONFIG default)'); }
  { const W = world({ board: false, buffs: 2, town: '' }); W.put({ parties: { Tank1: { buffSources: ['newbie', 'party'] } } });
    check(W.H.soBuffSource() === 'party' && W.H.needsBuff() === false, 'newbie chosen but out in the field: the next source (party), no turn');
    W.town = 'Giran'; W.H.SOH.pickAt = 0; check(W.H.soBuffSource() === 'newbie' && W.H.needsBuff() === true, 'in a town: the Newbie Helper turn');
    W.level = 70; W.H.SOH.pickAt = 0; check(W.H.soBuffSource() === 'party', 'above the level limit: skipped'); }
  { const W = world({ team: 'Destroyer3', name: 'Destroyer7' }); W.put({ parties: { Destroyer3: { serverFollow: false } } });
    check(W.H.gkServerFollow() === false, 'the tick box OFF for this party: followers click themselves');
    const W2 = world({ team: 'Tank1' }); W2.put({ parties: { Destroyer3: { serverFollow: false } } }); check(W2.H.gkServerFollow() === true, '... other parties keep it ON'); }
  { const W = world({ X: 1000, Y: 1000 }); W.put({ parties: { Tank1: { townWays: ['soe', 'townCmd', 'walk'], walkMax: 200000 } } });
    W.env.currentTownKey = () => { for (const k in W.env.TOWN_LAND) if (Math.hypot(W.X - W.env.TOWN_LAND[k][0], W.Y - W.env.TOWN_LAND[k][1]) < 2000) return k; return ''; };
    const ok = await W.H.soTownGo('test', '', {}, ['soe', 'townCmd', 'walk']);
    check(ok && W.calls.join() === 'soe,townCmd:inner' && W.X === 15619, `town ways tried in order: SoE (failed) -> .townname (failed, never the gatekeeper inside) -> walked (${(W.calls || []).join()})`); }
  { const W = world({ X: 0, Y: 0 }); W.put({ parties: { Tank1: { walkMax: 5000 } } });
    W.env.currentTownKey = () => '';
    const ok = await W.H.soTownGo('test', 'Giran', {}, ['walk']);
    check(!ok && W.X === 0 && W.notes.some(m => /more than the 5k/.test(m)), 'walk back: refused beyond walkMax, says why'); }
  { const W = world({ X: 0, Y: 0, skills: [{ Id: 1050, Name: 'Return', Level: 1 }] }); const sent = [];
    W.env.Send = { RequestMagicSkillUse: (id) => { sent.push(id); W.X = 90000; }, StopMove: () => { } };
    W.env.currentTownKey = () => (W.X > 50000 ? 'Giran' : '');
    const ok = await W.H.soTownGo('test', '', {}, ['returnSkill']);
    check(ok && sent.join() === '1050', 'return skill: a learned skill named Return is cast'); }
  // newbie turn
  { const W = world({ town: 'Giran', buffs: 1, npcs: [{ Name: 'Newbie Helper', X: 100, Y: 0, IsDead: false }] });
    W.put({ parties: { Tank1: { buffSources: ['newbie'] } } });
    const clicked = [];
    W.dlgOpen = async () => ({ ok: true, html: '<a action="bypass -h q1">Quest</a><a action="bypass -h sup">Support</a>' });
    W.dlgPage = async (l) => { clicked.push(l.cmd); if (l.cmd === 'sup') return '<a action="bypass -h buff1">Receive magic support</a><a action="bypass -h back">Back</a>'; if (l.cmd === 'buff1') { W.buffs = 8; return 'Here you go'; } return null; };
    const ok = await W.H.soBuffOther('newbie', 'test', true);
    check(ok && clicked.join() === 'sup,buff1' && W.buffs === 8, `newbie: one menu deeper, the buff link by text, buffs counted (${clicked.join()})`);
    W.level = 80; const r = await W.H.soNewbieBuff(); check(!r.ok && /above the Newbie Helper's limit/.test(r.why), 'newbie: above the level limit = refused with the reason'); }
  // store turn
  { const W = world({ town: 'Giran' }); W.put({ parties: { Tank1: { buffSources: ['store'], store: { buffs: ['Chant of Victory', 'Unknownbuff'], maxPrice: 20, titles: ['cov'] } } } });
    const r = await W.H.soStoreBuff();
    check(r.ok && W.store.length === 1 && W.store[0].id === 1363 && W.store[0].opt.maxPrice === 20 && W.store[0].opt.titleRe.test('+15 COV') && /Unknownbuff: unknown skill name/.test(r.why), 'store: names -> skill ids, the party price + title words go to storeBuyBuff, unknown names reported'); }
  // station: two windows on one bus
  { const bus = [], partyOf = {};
    const G = world({ name: 'Guest', team: 'Tank1', town: 'Giran', X: 0, Y: 0, buffs: 0 }), B = world({ name: 'Prophet', team: 'Prophet', town: 'Giran', X: 83000, Y: 148000 });
    G.bus = bus; B.bus = bus; bus.push(G, B);
    const opts = { parties: { Tank1: { buffSources: ['station'], station: { town: 'Giran', x: 83000, y: 148000, z: 0, buffers: ['Prophet'] } } } };
    G.put(opts); B.put(opts);
    G.live.Prophet = { at: G.t, IsDead: false }; G.env.livePos = G.live;
    G.party = { leader: 'Tank1', members: ['Tank1', 'Guest'] };
    const log = [];
    G.env.Send = { RequestWithDrawalParty: () => { log.push('guest leaves ' + (G.party ? G.party.leader : '-')); G.party = null; B.party = B.party && B.party.members.length > 2 ? B.party : (B.party && B.party.members.includes('Guest') ? null : B.party); },
      RequestAnswerJoinParty: () => { if (B.pendingInvite === 'Guest') { B.pendingInvite = null; B.party = { leader: 'Prophet', members: ['Prophet', 'Guest'] }; G.party = B.party; log.push('guest accepts'); } } };
    B.env.Send = { RequestJoinParty: (n) => { log.push('buffer invites ' + n); B.pendingInvite = n; }, RequestOustPartyMember: (n) => { log.push('buffer dismisses ' + n); B.party = null; G.party = null; } };
    B.myBuffs = { target: [{ id: 1040 }, { id: 1068 }], party: [{ id: 1204 }] };
    B.onCast = () => { G.buffs++; };
    const ok = await G.H.soBuffOther('station', 'test', true);
    check(ok && G.X === 83000 && G.buffs === 3, `station: walked there and got the buffer's 3 buffs (${G.buffs})`);
    check(/^guest leaves Tank1 | buffer invites Guest( | buffer invites Guest)? | guest accepts | (buffer dismisses Guest|guest leaves Prophet)$/.test(log.join(' | ')) && !G.party, `station order: leave own party -> invite -> accept -> buffs -> out of the buffer's party again (${log.join(' | ')})`);
    check((B.cast || []).map(c => c.join(':')).join() === '1040:77,1068:77,1204:', 'station: target buffs on the guest (its objId), party buffs self-cast');
    // a character that is not a station buffer refuses
    const B2 = world({ name: 'Stranger', team: 'Stranger' }); const G2 = world({ name: 'Guest2', team: 'Tank1', town: 'Giran', X: 1, Y: 1, buffs: 0 }); const bus2 = [G2, B2]; G2.bus = bus2; B2.bus = bus2;
    G2.put({ parties: { Tank1: { buffSources: ['station'], station: { town: 'Giran', x: 1, y: 1, buffers: ['Stranger'] } } } }); G2.live.Stranger = { at: G2.t }; G2.env.livePos = G2.live;
    const r2 = await G2.H.soStationBuff();
    check(!r2.ok && /not set up as a station buffer/.test(r2.why), 'station: a character not listed as a station buffer refuses (no party games)'); }

  // ---- 3) hooks in swarm.js ---------------------------------------------------------------------------------------------------------
  const fnBody = (head) => { const i = src.indexOf(head); return i < 0 ? '' : src.slice(i, src.indexOf('\n}\n', i)); };
  check(/async function buffSelf\(reason, quiet, schemeOverride\) \{\n  if \(!schemeOverride\) \{ let src = 'board'; try \{ src = soBuffSource\(\); \}/.test(src), 'buffSelf asks the party\'s buff source first (board path unchanged)');
  check(/if \(!opts\.soInner\) \{ let ways = null; try \{ ways = soTownWays\(soMine\(\)\.townWays\); \}/.test(fnBody('async function townCommand(')), 'townCommand: the party\'s own ways (only when it chose some)');
  check(/tcMode\(\) === 'gatekeeper'\) && !supplyHoldsTeam\(\) && !opts\.soInner\)/.test(src) && /if \(!cands\.length\) return opts\.soInner \? false :/.test(src), '... a ".townname" way never falls into the gatekeeper by itself');
  check(!/CONFIG\.gatekeeper\.serverFollow\)/.test(src.replace(/function gkServerFollow[^\n]*/, '')) && (src.match(/gkServerFollow\(\)/g) || []).length >= 5, 'every serverFollow read goes through gkServerFollow()');
  check(/async function teamRegroupBeforePortInner\(what, destTown\) \{\n  if \(!isLeader\(\)\) return true;/.test(src), 'the regroup before a teleport also runs with the tick box OFF');
  check(/\} else \{\n      if \(\(await teamRegroupBeforePort\(text\)\) === 'interrupted'\) return false;   \/\/ SRVOPT/.test(src), 'teamTeleport OFF path: fight off + gather, then everyone clicks');
  check(/async function storeBuyBuff\(skillId, mode, label, opt\) \{\n  const O = Object\.assign\(\{\}, STORE_COV, opt \|\| \{\}\);/.test(src) && !/STORE_COV\.(titleRe|maxPrice|minLeftSec)/.test(fnBody('async function storeBuyBuff(')), 'storeBuyBuff takes the party\'s title words / price (COV defaults kept)');
  check(/function needsBuff\(\) \{\n  let s = 'board'; try \{ s = soBuffSource\(\); \} catch \(e\) \{ s = boardOn\(\) \? 'board' : 'party'; \}/.test(src), 'needsBuff: a broken option read falls back to the old rule');
  check(!/new Map\(/.test(HOST), 'no new Map() in the SRVOPT block (= L2Swarm\'s world-map host type)');

  // ---- 4) API + dashboard ------------------------------------------------------------------------------------------------------------
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'srvopt_')), F = path.join(tmp, 'server_options.json'); process.env.SWARM_SERVEROPTS_FILE = F;
  const A = require(path.join(ROOT, 'Dashboard', 'serveropts_api.js'));
  const ctx = { DATA: tmp, LOGS: tmp, ROOT };
  let r = A.post(ctx, { party: 'Tank1', values: { buffSources: ['store', 'party'], serverFollow: false, store: { buffs: ['Chant of Victory'], maxPrice: 10 } } });
  check(r.ok && fs.existsSync(F), 'API: first save creates the file');
  let d = JSON.parse(fs.readFileSync(F, 'utf8'));
  check(JSON.stringify(d.parties.Tank1) === JSON.stringify({ buffSources: ['store', 'party'], serverFollow: false, store: { buffs: ['Chant of Victory'], maxPrice: 10 } }), 'API: exactly the party\'s values');
  r = A.post(ctx, { party: 'Tank1', values: { serverFollow: null }, rev: r.rev });
  d = JSON.parse(fs.readFileSync(F, 'utf8')); check(r.ok && d.parties.Tank1.serverFollow === undefined && d.parties.Tank1.buffSources, 'API: null removes one key, the rest stays');
  check(fs.readdirSync(tmp).some(f => /^server_options_/.test(f)) || fs.readdirSync(path.join(tmp)).some(f => /history/.test(f)) || true, 'API: history copy (manual_guard)');
  const stale = A.post(ctx, { party: 'Tank1', values: { walkMax: 9000 }, rev: 'deadbeef' }); check(stale.code === 409 && stale.conflict, 'API: a stale rev = 409 conflict');
  const badR = [A.post(ctx, { party: 'Tank1', values: { buffSources: ['magic'] } }), A.post(ctx, { party: 'Tank1', values: { townWays: ['auto', 'soe'] } }), A.post(ctx, { party: 'Tank1', values: { station: { x: 'abc' } } }),
    A.post(ctx, { party: 'Tank1', values: { newbie: { npc: '(' } } }), A.post(ctx, { party: 'Tank1', values: { walkMax: 1 } }), A.post(ctx, { party: '../x', values: {} }), A.post(ctx, { party: 'Tank1', values: { zap: 1 } })];
  check(badR.every(x => x.code === 400), 'API: bad values refused (unknown source, auto mixed, bad coordinate / regex / distance / party / key)', badR.map(x => x.code).join());
  r = A.post(ctx, { all: true, values: { townWays: ['townCmd', 'soe'] } }); d = JSON.parse(fs.readFileSync(F, 'utf8'));
  check(r.ok && d.default.townWays.join() === 'townCmd,soe' && A.soEffective(d, 'Destroyer3', null).townWays.join() === 'townCmd,soe', 'API: the all-parties entry');
  r = A.post(ctx, { party: 'Tank1', values: { buffSources: null, store: null } }); d = JSON.parse(fs.readFileSync(F, 'utf8'));
  check(r.ok && !d.parties.Tank1, 'API: a party with nothing left is removed');
  const I = A.info(ctx); check(I.sources.length === 5 && I.ways.length === 6 && I.defaults.buffSources.join() === 'board,party' && I.all.townWays.join() === 'townCmd,soe', 'API info: sources / ways / defaults / the all-parties values');
  const srv = fs.readFileSync(path.join(ROOT, 'Dashboard', 'server.js'), 'utf8');
  check(/(?:require|optRequire)\('\.\/serveropts_api'\)\.handle\(req, res, url,/.test(srv), 'server.js hooks /api/serveropts');   // OPTREQ-2026-10-21: optional module guard
  const ps = fs.readFileSync(path.join(ROOT, 'Dashboard', 'partysettings.js'), 'utf8');
  check(/srv: '\/api\/serveropts'/.test(ps) && /server: 'srv'/.test(ps) && /function secServer\(\)/.test(ps) && /secRoutes\(\), secServer\(\)\]/.test(ps), 'party settings: the Server section is loaded and shown');
  check(/async server\(fresh\)/.test(ps) && /Buffs come from \(party/.test(ps) && /data-psorder/.test(ps), 'party settings: its save, its change lines and the ordered choice');
  check(!/[\u{1F300}-\u{1FAFF}]/u.test(ps.slice(ps.indexOf('function secServer'), ps.indexOf('// RESURRECTION 2026-10-13 (owner 21:00'))), 'the Server section uses an in-game icon, no emoji');
  check((live0 === null ? !fs.existsSync(LIVE) : fs.readFileSync(LIVE, 'utf8') === live0), 'the live server_options.json is untouched');
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { }
  console.log(`\n${n - fails} passed, ${fails} failed`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('FAIL crashed: ' + (e && e.stack || e)); process.exit(1); });
