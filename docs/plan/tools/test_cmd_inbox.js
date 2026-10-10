// OFFLINE TEST of the MCP-independent FILE COMMAND CHANNEL (2026-10-08):
//   1) the CMDINBOX block of Scripts_dev/swarm.js in node (addressing, expiry, dedupe incl. a script reload, deferred while not ready,
//      bad JSON, the !command / '/' mapping, "needs MCP"), and that its '/' list equals FILE_BOT in Dashboard/server.js;
//   2) Dashboard/server.js /api/command with a MOCK MCP that is down (refused / hanging) or healthy: the order goes to a TEMP inbox
//      (SWARM_CMD_DIR, never Logs\cmd), a simulated swarm.js window (the same CMDINBOX block on the real file system) runs it and acks,
//      and the answer says "sent via file channel"; '/config' and '@logout' answer "needs MCP"; healthy MCP = no file at all; a tool call
//      that timed out after MCP answered is NOT re-sent through the file.
//   node docs/plan/tools/test_cmd_inbox.js          (exit code 1 when a check fails; never touches the game, MCP or Logs\cmd)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), http = require('http'), cp = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const src = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
const a = src.indexOf('// CMDINBOX-BEGIN'), b = src.indexOf('// CMDINBOX-END');
if (a < 0 || b < a) { console.error('CMDINBOX block not found'); process.exit(1); }
const M = new Function(src.slice(a, b) + '\nreturn { cmdInboxAddressed, cmdInboxSelect, cmdInboxPlan, cmdInboxStep, CMD_INBOX_HOST, CMD_INBOX_RUN, CMD_INBOX_MAX_AGE };')();
let fails = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails++; };
const teamOf = (n) => ({ Tank1: 'Tank1', Bishop1: 'Tank1', Crafter1: 'Crafter1', Healer1: 'Crafter1' })[n] || 'Tank1';

// ---- 1a) addressing ---------------------------------------------------------------------------------------------------------
check(M.cmdInboxAddressed({ to: ['bishop1', 'Tank1'] }, 'Bishop1', teamOf), 'to: names, case-insensitive');
check(!M.cmdInboxAddressed({ to: ['Tank1'] }, 'Bishop1', teamOf), 'to: other names -> not me');
check(M.cmdInboxAddressed({ to: 'all' }, 'Healer1', teamOf), "to: 'all'");
check(M.cmdInboxAddressed({ to: 'team:Crafter1' }, 'Healer1', teamOf) && !M.cmdInboxAddressed({ to: 'team:Crafter1' }, 'Bishop1', teamOf), "to: 'team:<leader>' = teamOf(me)");
check(M.cmdInboxAddressed({ to: 'Bishop1' }, 'bishop1', teamOf), 'to: one name as a string');
check(!M.cmdInboxAddressed({ to: ['Bishop1'] }, '', teamOf), 'no own name (not logged in) -> nothing');

// ---- 1b) select: expiry, bad entries, seen ----------------------------------------------------------------------------------
const T0 = 1760000000000;
const E = (id, o) => Object.assign({ id, at: T0, from: 'dashboard', to: ['Bishop1'], cmd: '!stop', via: 'party' }, o || {});
let sel = M.cmdInboxSelect([E('c0001', { at: T0 - 59000 }), E('c0002', { at: T0 - 61000 }), E('c0003', { at: T0 + 120000 }), E('bad id!'), E('c0004', { cmd: '' }),
  E('c0005', { to: ['Tank1'] }), null, 'x', E('c0006', { at: T0 - 1000 })], 'Bishop1', T0, {}, teamOf);
check(sel.run.map(e => e.id).join(',') === 'c0001,c0006', `run = fresh entries for me, oldest first (${sel.run.map(e => e.id)})`);
check(sel.expired.map(e => e.id).join(',') === 'c0002,c0003', `expired = older than 60 s / clock far ahead (${sel.expired.map(e => e.id)})`);
sel = M.cmdInboxSelect([E('c0001'), E('c0006')], 'Bishop1', T0, { c0001: T0 }, teamOf);
check(sel.run.length === 1 && sel.run[0].id === 'c0006', 'seen ids are never selected again');
check(M.CMD_INBOX_MAX_AGE === 60000, 'max age 60 s');

// ---- 1c) plan -------------------------------------------------------------------------------------------------------------
const P = (cmd, via, inParty) => M.cmdInboxPlan({ cmd, via }, { inParty });
check(P('!level', 'party', true).kind === 'party' && P('!level', 'party', true).text === '!level', '!level via party in a party -> party chat');
check(P('!level', 'party', false).kind === 'local', '!level via party but no party -> handleSay locally');
check(P('!stop', 'say', true).kind === 'local', "via 'say' -> handleSay locally");
check(P('#!stop', 'party', true).text === '!stop', "a '#' party prefix is stripped");
check(P('/stopcombat', 'command').kind === 'host' && P('/stopcombat').fn === 'StopCombat', '/stopcombat -> StopCombat()');
['/startcombat:StartCombat', '/enablebot:EnableBot', '/disablebot:DisableBot', '/attack:AttackTarget', '/loc:Loc'].forEach(x => { const [c, f] = x.split(':'); check(P(c).kind === 'host' && P(c).fn === f, `${c} -> ${f}`); });
let pl = P('/moveto 83473 148554 -3408');
check(pl.kind === 'host' && pl.fn === 'GoToPoint' && pl.args.join(',') === '83473,148554', '/moveto x y z -> GoToPoint(x, y)');
check(P('/moveto 12').kind === 'bad' && P('/moveto a b').kind === 'bad', '/moveto without two numbers -> bad');
pl = P('/target Elder Blacksmith');
check(pl.kind === 'host' && pl.fn === 'Select' && pl.args[0] === 'Elder Blacksmith', '/target <name with spaces> -> Select(name)');
check(P('/target').kind === 'bad', '/target without a name -> bad');
check(P('/sit').kind === 'run' && P('/unstuck').kind === 'run' && P('/invite Bishop1').text === '/invite Bishop1', '/sit /unstuck /invite -> RunCommand');
check(P('/config set FollowDistance 200').kind === 'needs-mcp' && P('/sellitem 57 1').kind === 'needs-mcp' && P('/partyinfo').kind === 'needs-mcp', '/config /sellitem /partyinfo -> needs MCP');
check(P('@logout').kind === 'needs-mcp' && P('@login').kind === 'needs-mcp', '@logout / @login -> needs MCP');
check(P('hello').kind === 'bad' && P('!a\nb').kind === 'bad' && P('!' + 'x'.repeat(400)).kind === 'bad', 'free text / two lines / too long -> bad');

// ---- 1d) the step: dedupe, reload, deferred, bad JSON -----------------------------------------------------------------------
function engine(me, files, o) {
  const W = Object.assign({ t: T0, ready: true, inParty: true, ran: [], acks: files.acks, logs: [] }, o || {});
  const io = {
    state: W.state || { mt: null, retry: false, seen: {} }, me, get now() { return () => W.t; },
    exists: () => files.inbox !== undefined, mtime: () => files.mt, read: () => JSON.parse(files.inbox),
    ackExists: (id) => !!files.acks[id + '_' + me], ack: (id, obj) => { files.acks[id + '_' + me] = obj; },
    ready: () => W.ready, inParty: () => W.inParty, teamOf, exec: (plan, e) => { W.ran.push(me + ':' + plan.kind + ':' + (plan.fn || plan.text)); return { ok: true, how: plan.kind }; },
    log: (m) => W.logs.push(m),
  };
  return { W, io };
}
const FS = { inbox: JSON.stringify([E('c1000', { to: ['Bishop1', 'Tank1'], cmd: '!level' }), E('c1001', { to: ['Bishop1'], cmd: '/stopcombat', via: 'command' }), E('c1002', { at: T0 - 70000 })]), mt: '1', acks: {} };
let bishop1 = engine('Bishop1', FS), shaded = engine('Tank1', FS, { inParty: false });
check(M.cmdInboxStep(bishop1.io) === 2 && bishop1.W.ran.join('|') === 'Bishop1:party:!level|Bishop1:host:StopCombat', `Bishop1 runs its 2 fresh entries (${bishop1.W.ran.join(' | ')})`);
check(FS.acks.c1002_Bishop1 && FS.acks.c1002_Bishop1.status === 'expired' && !bishop1.W.ran.some(r => /c1002/.test(r)), 'the 70 s old entry is acked expired, never run');
check(FS.acks.c1000_Bishop1.ok === true && FS.acks.c1001_Bishop1.kind === 'host' && FS.acks.c1001_Bishop1.name === 'Bishop1', 'acks written per entry + name');
check(M.cmdInboxStep(bishop1.io) === 0, 'same time stamp -> nothing (one File.Exists + GetLastWriteTimeUtc per second)');
FS.mt = '2';
check(M.cmdInboxStep(bishop1.io) === 0 && bishop1.W.ran.length === 2, 'file rewritten (new stamp) -> seen entries not run again');
const reload = engine('Bishop1', FS);                                      // script reload: empty memory, acks on disk
check(M.cmdInboxStep(reload.io) === 0 && reload.W.ran.length === 0, 'after a script reload the ack files stop a second run');
check(M.cmdInboxStep(shaded.io) === 1 && shaded.W.ran[0] === 'Tank1:local:!level', 'Tank1 (no party) runs the shared entry locally, once');
const FS2 = { inbox: JSON.stringify([E('c2000', { to: ['Bishop1'], cmd: '!supply' })]), mt: '7', acks: {} };
const late = engine('Bishop1', FS2, { ready: false });
check(M.cmdInboxStep(late.io) === 0 && late.io.state.retry === true && !FS2.acks.c2000_Bishop1, 'not ready (logging in) -> deferred, no ack');
late.W.ready = true; late.W.t = T0 + 5000;
check(M.cmdInboxStep(late.io) === 1 && late.W.ran.length === 1, 'ready a few seconds later -> runs it (same file stamp, retry flag)');
late.W.t = T0 + 5000;
check(M.cmdInboxStep(late.io) === 0 && late.W.ran.length === 1, '... and only once');
const FS3 = { inbox: JSON.stringify([E('c3000', { to: ['Bishop1'] })]), mt: '9', acks: {} };
const slow = engine('Bishop1', FS3, { ready: false }); slow.W.t = T0 + 61000; M.cmdInboxStep(slow.io);
check(FS3.acks.c3000_Bishop1 && FS3.acks.c3000_Bishop1.status === 'expired', 'a deferred entry that passes 60 s is acked expired, never run');
const FS4 = { inbox: '[{"id":"c4000",', mt: '3', acks: {} };
const broken = engine('Bishop1', FS4);
check(M.cmdInboxStep(broken.io) === 0 && broken.io.state.mt === null, 'half-written JSON -> nothing, retried next second');
FS4.inbox = JSON.stringify([E('c4000', { to: ['Bishop1'], cmd: '/config set A B', via: 'command' })]);
M.cmdInboxStep(broken.io);
check(broken.W.ran.length === 0 && FS4.acks.c4000_Bishop1 && FS4.acks.c4000_Bishop1.ok === false && /needs MCP/.test(FS4.acks.c4000_Bishop1.error), '/config -> acked "needs MCP", nothing run');
const FS5 = { inbox: JSON.stringify([E('c5000', { to: 'team:Crafter1', cmd: '!level' })]), mt: '1', acks: {} };
const lun = engine('Healer1', FS5), bis5 = engine('Bishop1', FS5);
check(M.cmdInboxStep(lun.io) === 1 && M.cmdInboxStep(bis5.io) === 0, "team addressing: Healer1 (team Crafter1) runs it, Bishop1 (team Tank1) does not");

// ---- 1e) '/' list in sync with the dashboard ----------------------------------------------------------------------------------
const srvSrc = fs.readFileSync(path.join(ROOT, 'Dashboard', 'server.js'), 'utf8');
const fb = srvSrc.match(/const FILE_BOT = new Set\(\[([\s\S]*?)\]\)/);
const dash = fb ? [...fb[1].matchAll(/'(\/[a-z]+)'/g)].map(m => m[1]).sort() : [];
const js = Object.keys(M.CMD_INBOX_HOST).concat(M.CMD_INBOX_RUN).sort();
check(dash.length > 0 && dash.join(',') === js.join(','), `FILE_BOT (server.js) == CMD_INBOX_HOST + CMD_INBOX_RUN (swarm.js) [${js.length}]`);
const CMDS = require(path.join(ROOT, 'Dashboard', 'commands.js'));
check(js.every(w => CMDS.BOT_WORDS.includes(w)), 'every file-channel / command is in the dashboard catalog');

// ---- 2) the dashboard with a mock MCP --------------------------------------------------------------------------------------
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'swarm_cmdinbox_'));
process.env.SWARM_CMD_DIR = TMP; process.env.SWARM_MCP_INIT_MS = '600'; process.env.SWARM_MCP_CALL_MS = '800';
let MODE = 'refused'; const MCP_CALLS = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (url, opt = {}) => {
  const u = String(url);
  if (/:8090\b/.test(u)) return Promise.reject(new Error('test: the real dashboard must never be called'));
  if (!/:8083\b/.test(u)) return realFetch(url, opt);
  const bd = JSON.parse(opt.body || '{}');
  if (MODE === 'refused') return Promise.reject(Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } }));
  if (MODE === 'hang') return new Promise(() => { });                       // the 2026-10-08 19:49 state: connect ok, never an answer
  if (MODE === 'callhang' && bd.method !== 'initialize') { MCP_CALLS.push(bd.params.name); return new Promise(() => { }); }
  let result;
  if (bd.method === 'initialize') result = { protocolVersion: '2025-03-26', capabilities: {} };
  else { MCP_CALLS.push(bd.params.name); result = { content: [{ type: 'text', text: bd.params.name === 'get_accounts_status' ? '[]' : JSON.stringify({ success: true, mock: true }) }] }; }
  const txt = JSON.stringify({ jsonrpc: '2.0', id: bd.id, result });
  return Promise.resolve({ headers: { get: () => null }, text: async () => txt });
};
const timers = { setInterval: global.setInterval, setTimeout: global.setTimeout };
global.setInterval = () => 0; global.setTimeout = () => 0;
cp.fork = () => ({ on() { }, kill() { } });
cp.execFile = (cmd, args, opt, cb) => { const f = typeof opt === 'function' ? opt : cb; if (f) process.nextTick(() => f(null, '', '')); return { on() { } }; };
const realAppend = fs.appendFileSync;
fs.appendFileSync = (f, d, o) => { if (/dashboard_commands\.log$/.test(String(f))) return; return realAppend(f, d, o); };
let PORT = 0;
const realCreate = http.createServer;
http.createServer = (h) => { const s = realCreate(h); const L = s.listen.bind(s); s.listen = (p, host, cb) => L(0, '127.0.0.1', () => { PORT = s.address().port; if (cb) cb(); }); return s; };
const realLog = console.log; console.log = () => { };
require(path.join(ROOT, 'Dashboard', 'server.js'));
console.log = realLog;
global.setInterval = timers.setInterval; global.setTimeout = timers.setTimeout;
const call = (p, body) => new Promise((resolve, reject) => {
  const data = JSON.stringify(body);
  const r = http.request({ host: '127.0.0.1', port: PORT, path: p, method: 'POST', headers: { 'content-type': 'application/json' } }, (res) => {
    let t = ''; res.on('data', c => t += c); res.on('end', () => { let j = null; try { j = JSON.parse(t); } catch (e) { } resolve({ code: res.statusCode, j }); });
  });
  r.on('error', reject); r.write(data); r.end();
});
// simulated swarm.js windows on the REAL temp files (same CMDINBOX code, real fs, exec recorded)
const RAN = [];
function window(me, inParty) {
  const st = { mt: null, retry: false, seen: {} }, inbox = path.join(TMP, 'inbox.json');
  return () => M.cmdInboxStep({ state: st, me, now: () => Date.now(), exists: () => fs.existsSync(inbox), mtime: () => fs.statSync(inbox).mtimeMs,
    read: () => JSON.parse(fs.readFileSync(inbox, 'utf8')), ackExists: (id) => fs.existsSync(path.join(TMP, `ack_${id}_${me}.json`)),
    ack: (id, o) => fs.writeFileSync(path.join(TMP, `ack_${id}_${me}.json`), JSON.stringify(o)), ready: () => true, inParty: () => inParty, teamOf,
    exec: (plan) => { RAN.push(`${me}:${plan.kind}:${plan.fn || plan.text}`); return plan.kind === 'host' && plan.fn === 'Loc' ? { ok: true, how: 'position', result: '1 2 3' } : { ok: true, how: plan.kind === 'party' ? 'party chat from ' + me : plan.kind }; },
    log: () => { } });
}
(async () => {
  for (let i = 0; i < 60 && !PORT; i++) await new Promise(r => timers.setTimeout(r, 50));
  const dry = await call('/api/command', { cmd: '!level', dryRun: true });
  const leader = dry.j && dry.j.sends && dry.j.sends[0] && dry.j.sends[0].to;
  const member = (() => { try { return fs.readdirSync(path.join(ROOT, 'Logs')).filter(f => /^swarm_state_.+\.json$/.test(f)).map(f => f.slice(12, -5)).find(n => n !== leader); } catch (e) { return null; } })();
  check(!!leader, `dry run plan: !level -> ${leader} (${dry.j && dry.j.sends && dry.j.sends[0].via})`);
  const wins = [leader, member].filter(Boolean).map(n => window(n, true));
  const pump = timers.setInterval(() => wins.forEach(w => { try { w(); } catch (e) { } }), 200);

  MODE = 'refused';
  let r = await call('/api/command', { cmd: '!level' });
  const s0 = r.j && r.j.sends && r.j.sends[0];
  check(r.code === 200 && r.j.channel === 'file' && /sent via file channel/.test(r.j.channelNote || ''), `MCP refused -> "${r.j && r.j.channelNote}"`);
  check(s0 && s0.ok && s0.ack && s0.ack.kind === 'party' && /via file channel: party chat from/.test(s0.out || ''), `the window acked it (party chat from the leader): ${s0 && s0.out}`);
  const inbox = JSON.parse(fs.readFileSync(path.join(TMP, 'inbox.json'), 'utf8'));
  check(inbox.length === 1 && inbox[0].to[0] === leader && inbox[0].cmd === '!level' && inbox[0].via === 'party' && inbox[0].from === 'dashboard', 'inbox entry { to: [leader], cmd: !level (no #), via: party }');
  check(RAN.filter(x => /!level/.test(x)).length === 1, `run exactly once (${RAN.join(' | ')})`);
  check(!fs.existsSync(path.join(ROOT, 'Logs', 'cmd', `ack_${s0 && s0.fileId}_${leader}.json`)), 'nothing was written to the real Logs\\cmd');

  if (member) {
    r = await call('/api/command', { cmd: '/stopcombat', target: 'char:' + member });
    const s1 = r.j.sends[0];
    check(r.j.channel === 'file' && s1.ok && s1.ack && s1.ack.kind === 'host' && RAN.includes(`${member}:host:StopCombat`), `/stopcombat to ${member} -> StopCombat() in its window (MCP_DOWN cached: ${s1.out})`);
    r = await call('/api/command', { cmd: '/loc', target: 'char:' + member });
    check(r.j.sends[0].ok && /= 1 2 3/.test(r.j.sends[0].out), `/loc answers the position through the ack (${r.j.sends[0].out})`);
  }
  r = await call('/api/command', { cmd: '/config set FollowDistance 200', target: 'char:' + leader, confirmDanger: true });
  check(r.j.sends[0].ok === false && /needs MCP/.test(r.j.sends[0].error) && !JSON.parse(fs.readFileSync(path.join(TMP, 'inbox.json'), 'utf8')).some(e => /config/.test(e.cmd)), `/config while MCP is down -> "${r.j.sends[0].error}", not queued`);
  r = await call('/api/command', { cmd: '@logout', target: 'char:' + leader, confirmDanger: true });
  check(r.j.sends[0].ok === false && /needs MCP/.test(r.j.sends[0].error), '@logout while MCP is down -> needs MCP');

  // hanging MCP (connect ok, never an answer): the initialize time limit decides, then the file channel
  await new Promise(res => timers.setTimeout(res, 15200));                  // let MCP_DOWN (15 s) run out
  MODE = 'hang';
  const t0 = Date.now();
  r = await call('/api/command', { cmd: '!stop', ackWaitMs: 0 });
  check(r.j.channel === 'file' && Date.now() - t0 < 4000 && /did not answer the initialize/.test(r.j.channelNote), `hanging MCP -> file channel after the initialize limit (${Date.now() - t0} ms): ${r.j.channelNote}`);
  check(r.j.sends[0].ok === false && r.j.sends[0].pending === true && /do not resend/.test(r.j.sends[0].error), 'no ack in time -> reported as pending (not ok), "do not resend at once"');

  // healthy MCP: no file at all; a tool call that hangs AFTER initialize is not re-sent through the file
  await new Promise(res => timers.setTimeout(res, 15200));
  MODE = 'ok';
  const before = JSON.parse(fs.readFileSync(path.join(TMP, 'inbox.json'), 'utf8')).length;
  r = await call('/api/command', { cmd: '!level' });
  check(r.j.channel === 'mcp' && r.j.sends[0].ok && MCP_CALLS.includes('run_account_command'), 'healthy MCP -> MCP as before (channel mcp)');
  MODE = 'callhang';
  r = await call('/api/command', { cmd: '!supply' });
  const after = JSON.parse(fs.readFileSync(path.join(TMP, 'inbox.json'), 'utf8')).length;
  check(r.j.sends[0].ok === false && /not re-sent through the file channel/.test(r.j.sends[0].error) && after === before, `tool call timed out after initialize -> error, NOT queued: ${r.j.sends[0].error}`);

  timers.setTimeout(() => { }, 0); clearInterval(pump);
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { }
  console.log(fails ? `\n${fails} check(s) FAILED` : '\nall checks passed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('FAIL exception ' + (e && e.stack || e)); process.exit(1); });
