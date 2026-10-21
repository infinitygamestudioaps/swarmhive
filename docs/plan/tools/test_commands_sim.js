// COMMAND SIMULATION (2026-10-12): every HARMLESS swarm '!' command reaches a brain-host party and gets handled, through BOTH channels the
// dashboard uses:  (1) party chat from the leader (MCP run_account_command '#!x' -> L2Toggle party chat -> agent2.js OnSay -> brain -> handleSay)
//                  (2) the command FILE inbox (Logs\cmd\inbox.json, entry exactly as Dashboard/server.js cmdInboxWrite builds it -> swarm.js
//                      CMDINBOX poll through the brain vfs -> party chat from the addressed character, or handleSay locally)
// plus (3) the inbox addressed to the MEMBER for the per-character commands (server: char:<member> -> via 'party' -> only that window acts).
// Nothing live: fake world + the REAL Scripts/agent2.js + Dashboard/brain_host Runner + the UNCHANGED Scripts_dev/swarm.js (test_brain_host.js
// harness). Logs is isolated in a temp overlay and every other write (Scripts/data/*.json ...) goes to the overlay too; the test checks that
// the real Logs\cmd\inbox.json and Scripts/data files are untouched.
// Party = the live brain party Spoiler6 (leader, spoiler) + Healer6 (healer), standing in Giran.
// "Handled" = the window(s) that must act logged 'received' for exactly that text, the command's own reaction showed up (a note, a party-chat
// line - also when swarm.js's chat throttle dropped it -, a file, or a state change), and no exception (swarm_errors.log / brain errors).
//   node docs/plan/tools/test_commands_sim.js            (exit 1 when a command is not handled)
//   node docs/plan/tools/test_commands_sim.js --only status,stop
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto');
const T1 = require('./test_brain_host.js');
const { World, Clock, Runner, run, mkTmp, GIRAN, ROOT, AGENT2, setCur } = T1;

const LEADER = 'Spoiler6', MEMBER = 'Healer6', NAMES = [LEADER, MEMBER];
const ONLY = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1].split(',') : null;

// ---------------------------------------------------------------- the commands + what proves they were handled
// who: windows that must log 'received' (party chat from the leader reaches both; the leader-only handlers still log it in both)
// expect(ev) -> '' when handled, else why not. ev = { notes{name:[lines]}, chat[], chatTry{name:n}, js(name, expr), files[] }
const anyNote = (ev, re, who) => (who || NAMES).some(n => (ev.notes[n] || []).some(l => re.test(l)));
const chatOr = (ev, re, who) => ev.chat.some(m => re.test(m.text) && (!who || who.includes(m.from))) || (who || NAMES).some(n => (ev.chatTry[n] || 0) > 0);
const need = (cond, why) => cond ? '' : why;
const CMDS = [
  { id: 'status', cmd: '!status', each: true, expect: (ev) => need(NAMES.every(n => ev.chat.some(m => m.from === n && /\| HP \d+% MP \d+%/.test(m.text)) || (ev.chatTry[n] || 0) > 0), 'no "[role] mode | HP .. MP .." line from each') },
  { id: 'stop', cmd: '!stop', expect: (ev) => need(ev.js(LEADER, 'state.mode') === 'idle' && ev.js(MEMBER, 'state.mode') === 'idle' && ev.files.some(f => /lead_pause_Spoiler6/.test(f)), 'state.mode not idle / no lead_pause file') },
  { id: 'park start', cmd: '!park start', stopAfter: true, expect: (ev) => need(/park/.test(String(ev.js(LEADER, 'pauseInfo() && pauseInfo().why'))) || anyNote(ev, /!park/), 'no park pause tag / note') },
  { id: 'level', cmd: '!level', stopAfter: true, expect: (ev) => need(anyNote(ev, /level|spot|giran|team/i, [LEADER]) || ev.js(LEADER, '!!(autoLvl.active || autoLvl.spot)') || ev.calls[LEADER] > 0, 'leader did nothing') },
  // fully buffed = requestBuffTurn() only log()s "har allerede N buffs" (correct no-op); before 2026-10-12 this check passed only on a stray host call
  { id: 'buff', cmd: '!buff', expect: (ev) => need(anyNote(ev, /buff/i) || ev.calls[LEADER] + ev.calls[MEMBER] > 0 || NAMES.every(n => ev.js(n, '!needsBuff()') === true), 'no buff note / board call (and someone needs buffs)') },
  { id: 'town giran', cmd: '!town giran', stopAfter: true, expect: (ev) => need(/town/.test(String(ev.js(LEADER, 'pauseInfo() && pauseInfo().why'))) || anyNote(ev, /town|giran/i, [LEADER]), 'no town pause tag / note') },
  { id: 'mark', cmd: '!mark simtest_spot', expect: (ev) => need(chatOr(ev, /\[goto\] saved: simtest_spot/, [LEADER]) && /simtest_spot/.test(JSON.stringify(ev.js(LEADER, 'loadPlaces()'))), 'place not saved / no "[goto] saved" line') },
  { id: 'places', cmd: '!places', expect: (ev) => need(chatOr(ev, /\[goto\] places:/, [LEADER]), 'no "[goto] places" line') },
  { id: 'dumpskills', cmd: '!dumpskills', each: true, expect: (ev) => need(NAMES.every(n => ev.files.some(f => f === `skills_${n}.json`)), 'no Logs/skills_<name>.json for each') },
  { id: 'navtest', cmd: `!navtest ${GIRAN.x + 300} ${GIRAN.y + 300} ${LEADER}`, each: true, expect: (ev) => need(ev.files.some(f => f === `navtest_${LEADER}.log`) && !ev.files.some(f => f === `navtest_${MEMBER}.log`), 'navtest log missing (or the member ran it too)') },
  { id: 'hunthere', cmd: '!hunthere 1500', stopAfter: true, field: true, expect: (ev) => need(chatOr(ev, /\[hunt here\]/, [LEADER]) || anyNote(ev, /hunt here/i, [LEADER]), 'no [hunt here] line') },
  { id: 'hunthereoff', cmd: '!hunthere off', expect: (ev) => need(chatOr(ev, /\[hunt here\] off/, [LEADER]) || anyNote(ev, /hunt here/i, [LEADER]), 'no "[hunt here] off" line') },
  { id: 'nonstop on', cmd: '!nonstop on', expect: (ev) => need(chatOr(ev, /\[nonstop\] ON/, [LEADER]) && ev.js(LEADER, `(partySpots()['${LEADER}'] || {}).nonstop`) === true, 'party_spots.json nonstop not true / no [nonstop] line') },
  { id: 'nonstop off', cmd: '!nonstop off', expect: (ev) => need(chatOr(ev, /\[nonstop\] OFF/, [LEADER]) && ev.js(LEADER, `(partySpots()['${LEADER}'] || {}).nonstop`) === false, 'party_spots.json nonstop not false / no [nonstop] line') },
  { id: 'formation', cmd: '!formation wedge', stopAfter: true, expect: (ev) => need(anyNote(ev, /formation/i, [LEADER]) || chatOr(ev, /formation/i, [LEADER]) || ev.calls[LEADER] > 0, 'no formation note / move') },
  { id: 'classplan', cmd: '!classplan', each: true, expect: (ev) => need(NAMES.every(n => (ev.notes[n] || []).some(l => /class plan:/.test(l))), 'no "class plan:" note from each') },
  { id: 'gearplan', cmd: '!gearplan', each: true, expect: (ev) => need(NAMES.every(n => ev.files.some(f => f === `gear_plan_${n}.json`)), 'no Logs/gear_plan_<name>.json for each') },
  { id: 'stashplan', cmd: '!stashplan', each: true, expect: (ev) => need(NAMES.every(n => (ev.notes[n] || []).some(l => /\[stash\] plan:/.test(l))), 'no "[stash] plan:" note from each') },
  { id: 'dyeplan', cmd: '!dyeplan', each: true, wait: 8000, expect: (ev) => need(NAMES.every(n => (ev.notes[n] || []).some(l => /\[dyes\] !dyeplan:/.test(l))), 'no "[dyes] !dyeplan:" note from each') },
  { id: 'soulstat', cmd: '!soul', each: true, expect: (ev) => need(NAMES.every(n => ev.chat.some(m => m.from === n && /^\[soul\]/.test(m.text)) || (ev.chatTry[n] || 0) > 0), 'no "[soul]" line from each') },
  // CMDFIX2 override (2026-10-12): !zone = a forced leveling spot with the zmap (autoLvl.forceSpot.zmap) + "zone: the team levels inside ..." note;
  // the old one-off load ("zone loaded" + LoadCombatMap) still counts (a file outside Settings / no outline)
  { id: 'zone', cmd: '!zone fightzone_under20.zmap', stopAfter: true, expect: (ev) => need(anyNote(ev, /zone( loaded)?: .*fightzone_under20\.zmap/, [LEADER]) && (ev.callsBy(LEADER, 'LoadCombatMap') > 0 || /fightzone_under20/.test(String(ev.js(LEADER, 'autoLvl.forceSpot && autoLvl.forceSpot.zmap')))), 'no "zone" note / forced zone spot / LoadCombatMap') },
  { id: 'assist', cmd: `!assist ${MEMBER}`, stopAfter: true, expect: (ev) => need(anyNote(ev, /assist:/, [LEADER]), 'no "assist:" note from the leader') },
  { id: 'assistoff', cmd: '!assist off', expect: (ev) => need(anyNote(ev, /assist: off/, [LEADER]) && ev.js(LEADER, 'autoLvl.forceSpot') === null, 'no "assist: off" / forceSpot kept') },
  { id: 'kill', cmd: '!kill Bifrons', stopAfter: true, field: true, expect: (ev) => need(NAMES.every(n => (ev.notes[n] || []).some(l => /^kill: |kill: /.test(l))) || ev.callsBy(LEADER, 'Send.Attack') > 0, 'no "kill:" note from each') },
  { id: 'supply', cmd: '!supply', stopAfter: true, wait: 8000, expect: (ev) => need(anyNote(ev, /supply|giran|Helvetia|need/i) || ev.calls[LEADER] > 0, 'leader did nothing') },
  { id: 'collect', cmd: '!collect', stopAfter: true, wait: 8000, expect: (ev) => need(anyNote(ev, /collect|adena|keep/i) || ev.calls[LEADER] > 0 || ev.js(LEADER, 'orderState.seq') > 0, 'leader did nothing') },
  { id: 'raidhunt stop', cmd: '!raidhunt stop', expect: (ev) => need(ev.js(LEADER, 'raidHunt.stop') === true && ev.js(MEMBER, 'raidHunt.stop') === true, 'raidHunt.stop not set') },
  { id: 'circuitstop', cmd: '!circuit stop', expect: () => '' /* no circuit running: a silent no-op by design (received + no error is all) */ },
  { id: 'missionstop', cmd: '!mission stop', expect: () => '' /* nothing running: abortRegroup() is a silent no-op */ },
];
// per-character commands also sent through the inbox to the MEMBER only (server: char:Healer6 -> via 'party', only her window acts)
const MEMBER_INBOX = ['status', 'dumpskills', 'classplan', 'gearplan', 'stashplan', 'soulstat'];

// ---------------------------------------------------------------- helpers
let pass = 0, fail = 0; const rows = [];
const say = (s) => console.log(s);
function hashFile(p) { try { return crypto.createHash('sha1').update(fs.readFileSync(p)).digest('hex'); } catch (e) { return 'missing'; } }
function readSince(p, off) { try { const b = fs.readFileSync(p); return b.slice(off).toString('utf8'); } catch (e) { return ''; } }
function sizeOf(p) { try { return fs.statSync(p).size; } catch (e) { return 0; } }

async function main() {
  const tmp = mkTmp(), overlay = path.join(tmp, 'overlay'); fs.mkdirSync(overlay);
  // !zone needs a drawn zone file in Settings\ (the user's own; none on a fresh / public install): the sim gets a small one in its overlay
  if (!fs.existsSync(path.join(ROOT, 'Settings', 'fightzone_under20.zmap'))) {
    fs.mkdirSync(path.join(overlay, 'Settings'), { recursive: true });
    const pts = [[-29250, 211695], [-23790, 211822], [-17791, 213727], [-19283, 216330], [-24139, 215187], [-28679, 213981]];
    fs.writeFileSync(path.join(overlay, 'Settings', 'fightzone_under20.zmap'), '<?xml version="1.0" encoding="utf-8"?>\r\n<zone>\r\n  <ExternalPoly>\r\n    <points>\r\n'
      + pts.map(p => `      <point x="${p[0]}" y="${p[1]}" />\r\n`).join('') + '    </points>\r\n  </ExternalPoly>\r\n  <InternalPolies />\r\n</zone>\r\n');
  }
  const OL = path.join(overlay, 'Logs'); fs.mkdirSync(path.join(OL, 'cmd'), { recursive: true });
  const LIVE = [path.join(ROOT, 'Logs', 'cmd', 'inbox.json'), path.join(ROOT, 'Scripts', 'data', 'party_spots.json'), path.join(ROOT, 'Scripts', 'data', 'places.json')];
  const liveHash0 = LIVE.map(hashFile);
  const port = 19100 + Math.floor(Math.random() * 600);
  const clock = new Clock({ virtual: true, start: Date.now() });
  const runner = new Runner({ port, clock, overlay, isolate: ['Logs'], allow: NAMES, logFile: path.join(tmp, 'brain_host.log'), root: ROOT.replace(/\//g, '\\'), geopath: true });
  setCur(runner);
  await runner.start();
  say(`brain host on 127.0.0.1:${port}, overlay ${overlay}`);
  const world = new World(clock); world.sockets = new Set();
  world.addNpc('Clarissa', 30080, 83396, 147904, -3404, 'Gatekeeper'); world.addNpc('Helvetia', 30081, 81000, 149000, -3400, 'Grocer');
  world.addNpc('Kusto', 30512, 83000, 148100, -3400, 'Warehouse Keeper'); world.addNpc('Valkon', 30103, 82500, 148600, -3470, 'Blacksmith');
  world.addChar(LEADER, 55, 46, GIRAN.x, GIRAN.y, { leader: true, skills: [[254, 'Spoil', 5, 'ENEMY'], [42, 'Sweeper', 1, 'SELF'], [1216, 'Self Heal', 1, 'SELF']] });
  world.addChar(MEMBER, 30, 46, GIRAN.x - 120, GIRAN.y + 80, { skills: [[1011, 'Heal', 18, 'ONE'], [1015, 'Battle Heal', 15, 'ONE'], [1016, 'Resurrection', 3, 'ONE']] });
  const src = fs.readFileSync(AGENT2, 'utf8');
  for (const c of world.chars.values()) world.startAgent(c, port, src);
  await run(clock, world, 14000);
  const rep0 = runner.report();
  const booted = rep0.contexts.length === 2 && rep0.contexts.every(c => c.booted && c.connected);
  say(`boot: ${rep0.contexts.map(c => `${c.name} booted=${c.booted} connected=${c.connected}`).join(', ')}`);
  if (!booted) { say('FAIL brain contexts did not boot'); process.exit(1); }

  const ctxOf = (n) => runner.ctxs.get(n).ctx;
  const js = (n, expr) => { try { return vm.runInContext(expr, ctxOf(n)); } catch (e) { return 'ERR ' + e.message; } };
  const chatTries = (n) => { const v = js(n, 'CHATT.sent + CHATT.dropped'); return typeof v === 'number' ? v : 0; };
  const buffsLog = path.join(OL, 'swarm_buffs.log'), errLog = path.join(OL, 'swarm_errors.log');
  const errMapCount = () => { let s = 0; runner.errorsByWhere.forEach(v => { s += v; }); return s; };
  const errMapSnap = () => new Map(runner.errorsByWhere);
  const listLogs = () => { try { return fs.readdirSync(OL).filter(f => fs.statSync(path.join(OL, f)).isFile()).map(f => f + '@' + fs.statSync(path.join(OL, f)).mtimeMs); } catch (e) { return []; } };
  let inboxEntries = [], seq = 0;
  const inbox = (cmd, to) => {
    const id = 'sim' + Date.now().toString(36) + (++seq).toString(36);
    // exactly like Dashboard/server.js cmdInboxWrite: { id, at, from, to: [name], cmd (no '#'), via: 'party' } (the character is in a party)
    inboxEntries = inboxEntries.filter(e => e.at > clock.now() - 120000).concat([{ id, at: clock.now(), from: 'dashboard', to: [to], cmd, via: 'party' }]);
    const f = path.join(OL, 'cmd', 'inbox.json'), t = f + '.tmp'; fs.writeFileSync(t, JSON.stringify(inboxEntries, null, 1)); fs.renameSync(t, f);
    return id;
  };
  const ackOf = (id, n) => { try { return JSON.parse(fs.readFileSync(path.join(OL, 'cmd', `ack_${id}_${n}.json`), 'utf8')); } catch (e) { return null; } };
  const quiet = async () => { for (let i = 0; i < 20 && Date.now() && clock.now() - (js(LEADER, 'CHATT.last') || 0) < 16000; i++) await run(clock, world, 1000); };
  const toTown = () => { world.teleportAll(GIRAN.x, GIRAN.y, GIRAN.z, 'PEACEZONE'); };
  const toField = () => {
    const F = { x: 70969, y: 69956, z: -3691 };
    if (!world.mobs.some(m => m.Name === 'Bifrons')) { world.addMob('Bifrons', 25146, 33, F.x + 600, F.y + 200, F.z); world.addMob('Timak Orc Soldier', 20585, 42, F.x + 500, F.y + 300, F.z); world.addMob('Timak Orc Warrior', 20586, 43, F.x - 400, F.y + 450, F.z); }
    world.teleportAll(F.x, F.y, F.z, 'GENERALZONE');
  };

  async function once(spec, channel) {
    // channel: 'party' (leader's party chat) | 'inbox' (file inbox to the leader) | 'inbox-member' (file inbox to the member)
    if (spec.field) { toField(); await run(clock, world, 5000); } else if (world.chars.get(LEADER).flags.CurrentZone !== 'PEACEZONE') { toTown(); await run(clock, world, 4000); }
    await quiet();
    const who = channel === 'inbox-member' ? [MEMBER] : NAMES;
    const off = sizeOf(buffsLog), eoff = sizeOf(errLog), em0 = errMapSnap(), chat0 = world.chat.length, calls0 = world.calls.length, logs0 = new Set(listLogs());
    const tries0 = Object.fromEntries(NAMES.map(n => [n, chatTries(n)]));
    let id = null;
    if (channel === 'party') world.partyChat(LEADER, spec.cmd);
    else id = inbox(spec.cmd, channel === 'inbox' ? LEADER : MEMBER);
    const wait = spec.wait || 5000;
    await run(clock, world, wait);
    const lines = readSince(buffsLog, off).split(/\r?\n/).filter(Boolean);
    const notes = Object.fromEntries(NAMES.map(n => [n, lines.filter(l => l.includes(`[${n}] `)).map(l => l.replace(/^\S+ \[[^\]]+\] /, ''))]));
    const recv = Object.fromEntries(NAMES.map(n => [n, notes[n].some(l => l === `modtaget (received): ${spec.cmd}`)]));
    notes[LEADER] = notes[LEADER].filter(l => !/^modtaget/.test(l)); notes[MEMBER] = notes[MEMBER].filter(l => !/^modtaget/.test(l));
    const chat = world.chat.slice(chat0).filter(m => m.text !== spec.cmd);
    const chatTry = Object.fromEntries(NAMES.map(n => [n, chatTries(n) - tries0[n] - (world.chat.slice(chat0).filter(m => m.from === n && m.text === spec.cmd).length)]));
    const newCalls = world.calls.slice(calls0);
    const calls = Object.fromEntries(NAMES.map(n => [n, newCalls.filter(k => k.who === n && !/^(AppEvents\.on)$/.test(k.fn)).length]));
    const files = listLogs().filter(f => !logs0.has(f)).map(f => f.replace(/@[\d.]+$/, ''));
    const errText = readSince(errLog, eoff).trim();
    const brainErr = []; runner.errorsByWhere.forEach((v, k) => { const d = v - (em0.get(k) || 0); if (d > 0) brainErr.push(`${k} x${d}`); });
    const ev = { notes, chat, chatTry, calls, files, js, callsBy: (n, fn) => newCalls.filter(k => k.who === n && k.fn === fn).length };
    const ack = id ? ackOf(id, channel === 'inbox' ? LEADER : MEMBER) : null;
    const problems = [];
    // inbox to the member: only she must act; the leader must NOT hear it as his own order
    const mustRecv = channel === 'inbox-member' ? [MEMBER] : NAMES;
    mustRecv.forEach(n => { if (!recv[n]) problems.push(`${n} did not log 'received'`); });
    if (channel === 'inbox-member' && recv[LEADER]) problems.push(`${LEADER} also obeyed a line meant for ${MEMBER}`);
    if (id && !(ack && ack.ok)) problems.push(`no OK ack (${ack ? JSON.stringify(ack).slice(0, 120) : 'none'})`);
    let exp = '';
    if (channel === 'inbox-member') {
      const sub = { notes: { [MEMBER]: notes[MEMBER], [LEADER]: [] }, chat: chat.filter(m => m.from === MEMBER), chatTry: { [MEMBER]: chatTry[MEMBER], [LEADER]: 0 }, calls, files: files.filter(f => !f.includes(LEADER)), js, callsBy: ev.callsBy };
      exp = memberExpect(spec, sub);
    } else exp = spec.expect(ev);
    if (exp) problems.push(exp);
    if (errText) problems.push('swarm_errors.log: ' + errText.split(/\r?\n/)[0].slice(0, 200));
    if (brainErr.length) problems.push('brain errors: ' + brainErr.join('; ').slice(0, 200));
    const evidence = [].concat(
      NAMES.map(n => notes[n].length ? `${n} notes: ${notes[n].slice(0, 3).map(l => l.slice(0, 90)).join(' | ')}` : '').filter(Boolean),
      chat.length ? [`chat: ${chat.slice(0, 3).map(m => m.from + ': ' + m.text.slice(0, 80)).join(' | ')}`] : [],
      NAMES.some(n => chatTry[n] > 0 && !chat.some(m => m.from === n)) ? [`chat throttled: ${NAMES.map(n => n + ' ' + chatTry[n]).join(', ')}`] : [],
      files.length ? [`files: ${files.join(', ')}`] : [],
      [`host calls: ${NAMES.map(n => n + ' ' + calls[n]).join(', ')}`],
      ack ? [`ack: ${ack.ok ? 'OK' : 'FAILED'} ${ack.how || ack.error || ''}`.slice(0, 120)] : []);
    const okk = problems.length === 0;
    if (okk) pass++; else fail++;
    const row = { id: spec.id, cmd: spec.cmd, channel, ok: okk, problems, evidence };
    rows.push(row);
    say(`${okk ? '  ok  ' : '  FAIL'} ${spec.cmd.padEnd(36)} ${channel.padEnd(13)} ${okk ? '' : problems.join(' / ')}`);
    evidence.forEach(e => say(`         ${e}`));
    if (spec.stopAfter) { await quiet(); world.partyChat(LEADER, '!stop'); await run(clock, world, 4000); }
  }
  function memberExpect(spec, ev) {
    const n = MEMBER;
    switch (spec.id) {
      case 'status': case 'soulstat': return need(ev.chat.length > 0 || ev.chatTry[n] > 0, `no party-chat reply from ${n}`);
      case 'dumpskills': return need(ev.files.includes(`skills_${n}.json`), `no skills_${n}.json`);
      case 'gearplan': return need(ev.files.includes(`gear_plan_${n}.json`), `no gear_plan_${n}.json`);
      case 'classplan': return need(ev.notes[n].some(l => /class plan:/.test(l)), 'no "class plan:" note');
      case 'stashplan': return need(ev.notes[n].some(l => /\[stash\] plan:/.test(l)), 'no "[stash] plan:" note');
      default: return '';
    }
  }

  for (const spec of CMDS) {
    if (ONLY && !ONLY.includes(spec.id)) continue;
    await once(spec, 'party');
    await once(spec, 'inbox');
    if (MEMBER_INBOX.includes(spec.id)) await once(spec, 'inbox-member');
  }

  const liveHash1 = LIVE.map(hashFile);
  const untouched = liveHash0.every((h, i) => h === liveHash1[i]);
  say(`${untouched ? '  ok  ' : '  FAIL'} live files untouched (${LIVE.map(p => path.relative(ROOT, p)).join(', ')})`);
  if (!untouched) fail++;
  const out = { at: new Date().toISOString(), pass, fail, party: NAMES, rows };
  const outF = path.join(ROOT, 'docs', 'plan', 'new_engine', 'sim_commands_last_run.json');
  fs.writeFileSync(outF, JSON.stringify(out, null, 1));
  say(`\n${pass} passed, ${fail} failed  (details: ${path.relative(ROOT, outF)}; overlay ${overlay})`);
  await runner.stop('end');
  for (const s of world.sockets) try { s.destroy(); } catch (e) { }
  for (const c of world.chars.values()) c.T.dispose();
  world.timers.dispose();
  return fail === 0;
}
main().then(okAll => process.exit(okAll ? 0 : 1), e => { console.log('ERROR', e && e.stack || e); process.exit(1); });
