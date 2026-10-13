// ATTACH THE BRAIN AGENT TO CHARACTERS WITHOUT RESTARTING EVERY OTHER AGENT (engine audit #20, 2026-10-12).
// The old procedure (DESIGN.md §12 step 4b: manage_account_scripts create + the "existing file" workaround of CLAUDE.md §6) deleted and
// re-created the SHARED Scripts/agent2.js for every character it attached. L2Swarm restarts an attached script on every account whenever its
// file changes, so each attach dropped and reconnected every agent already moved (2026-10-12 13:26: 44 disconnects in 40 s; moving N
// characters = O(N^2) V8 engine restarts in L2Swarm). This tool never writes Scripts/agent2.js:
//   - a character that already has an agent attached (agent2.js or agent2_<Name>.js) only gets it STARTED (no file change);
//   - otherwise it gets its OWN copy Scripts/agent2_<Name>.js (manage_account_scripts create with a NEW file name, the path the dashboard
//     transfer already uses for its one-shot scripts): a new file restarts nobody else.
//   swarm.js is stopped on the character first and the tool checks that it IS stopped before the agent starts (never driven twice).
// Deploying a new agent version with per-character copies: copy it to Scripts/agent2.js as before, then `--sync` copies it into every
// Scripts/agent2_<Name>.js that differs (each reloads only its own character, once).
// Refuses while a raid / Kamaloka is live (Logs/raid_live*.json, Logs/kamaloka_live.json written < 60 s ago) unless --force.
// ENGINE DEFAULT (2026-10-13, user: "Make the new engine default!"):
//   --all      every brain character of Scripts/data/brain_host.json ("allowAll" = every character of swarm.config.json), one by one
//              (--gap ms between two characters, default 3000). Characters already on the agent are left alone. This is the switch for
//              an UPDATED install whose accounts still run swarm.js (the dashboard PC tab -> "New engine" runs it too).
//   A character that brain_host.json does NOT put in the brain is refused (the pool would turn its agent away: it would have no driver);
//   --apply refuses while the brain pool is not running (Logs/brain_host_stats.json older than 60 s: restart the dashboard first). --force
//   overrides both.
//   --back     rollback, the other way round: stop the agent, check it stopped, start swarm.js (also take the character out of the brain in
//              brain_host.json - "except" with allowAll, else remove it from "allow" - or the next --all moves it again).
// Usage: node docs/plan/tools/attach_agent.js --names Spoiler6,Healer6 [--apply] [--force] [--mcp http://127.0.0.1:8083] [--root C:\L2Swarm]
//        node docs/plan/tools/attach_agent.js --all [--apply] [--gap 3000] [--force]
//        node docs/plan/tools/attach_agent.js --back --names A,B [--apply]
//        node docs/plan/tools/attach_agent.js --sync [--apply] [--force]
//        without --apply it only prints what it would do (dry run).
'use strict';
const fs = require('fs'), path = require('path');
const a = process.argv.slice(2), opt = (k, d) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; };
const ROOT = path.resolve(opt('--root', path.resolve(__dirname, '..', '..', '..')));
const MCP = opt('--mcp', 'http://127.0.0.1:8083');
const APPLY = a.includes('--apply'), FORCE = a.includes('--force'), ALL = a.includes('--all'), BACK = a.includes('--back');
const GAP = Math.max(0, Number(opt('--gap', ALL ? 3000 : 0)) || 0);
const SCRIPTS = path.join(ROOT, 'Scripts'), LOGS = path.join(ROOT, 'Logs');
const AGENT_RE = /^agent2(_[A-Za-z0-9]+)?\.js$/i;
let S = null; try { S = require(path.join(ROOT, 'Dashboard', 'brain_host', 'supervise.js')); } catch (e) { try { S = require(path.join(__dirname, '..', '..', '..', 'Dashboard', 'brain_host', 'supervise.js')); } catch (e2) { } }

let sid = null;
// plain http with Connection: close (fetch's keep-alive sockets + process.exit trip a libuv assertion on Windows)
function rpc(body) {
  return new Promise((res, rej) => {
    const u = new URL(MCP), data = Buffer.from(JSON.stringify(body));
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'Content-Length': data.length, Connection: 'close' }; if (sid) headers['Mcp-Session-Id'] = sid;
    const rq = require('http').request({ host: u.hostname, port: u.port || 80, path: u.pathname || '/', method: 'POST', headers, agent: false }, (r) => {
      const s = r.headers['mcp-session-id']; if (s) sid = s;
      let t = ''; r.setEncoding('utf8'); r.on('data', d => t += d);
      r.on('end', () => { if (/^\s*(event|data):/.test(t)) t = t.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5)).join(''); try { res(JSON.parse(t)); } catch (e) { rej(new Error('MCP answer is not JSON: ' + t.slice(0, 200))); } });
    });
    rq.on('error', rej); rq.setTimeout(60000, () => rq.destroy(new Error('MCP timeout'))); rq.end(data);
  });
}
let inited = false;
async function mcp(tool, args) {
  if (!inited) { await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'attach-agent', version: '1' } } }); inited = true; }
  const r = await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: tool, arguments: args } });
  const c = r && r.result && r.result.content, t = c && c[0] ? c[0].text : JSON.stringify(r);
  try { return JSON.parse(t); } catch (e) { return { text: t }; }
}

function liveFight() {
  const t = Date.now(), out = [];
  let files = []; try { files = fs.readdirSync(LOGS).filter(f => /^raid_live.*\.json$/i.test(f) || /^kamaloka_live\.json$/i.test(f)); } catch (e) { }
  for (const f of files) { try { if (t - fs.statSync(path.join(LOGS, f)).mtimeMs < 60000) out.push(f); } catch (e) { } }
  return out;
}
const say = (m) => console.log(m);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const readJ = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, '')); } catch (e) { return null; } };
const BH_RAW = readJ(path.join(ROOT, 'Scripts', 'data', 'brain_host.json'));
const ACCOUNTS = S ? S.readRoster(path.join(ROOT, 'swarm.config.json')) : null;
const isBrain = (n) => !!(S && S.isBrainChar(n, BH_RAW, ACCOUNTS || []));
function poolRunning() { try { return Date.now() - fs.statSync(path.join(LOGS, 'brain_host_stats.json')).mtimeMs < 60000; } catch (e) { return false; } }

/** the account's script list: by character name, else by its config file (an account that is not logged in) */
async function scriptList(name) {
  let sel = { account_name: name }, l = await mcp('manage_account_scripts', { ...sel, action: 'list' });
  if (!Array.isArray(l.scripts)) {
    const acc = (ACCOUNTS || []).find(x => x && x.character === name && x.config);
    if (acc) { sel = { config_path: path.join(ROOT, 'Settings', acc.config) }; l = await mcp('manage_account_scripts', { ...sel, action: 'list' }); }
  }
  return { sel, list: Array.isArray(l.scripts) ? l.scripts : null, raw: l };
}
const outcome = { moved: [], already: [], skipped: [] };

async function attach(name) {
  if (!FORCE && !isBrain(name)) {
    say(`${name}: NOT a brain character in Scripts/data/brain_host.json — skipped (its agent would be turned away by the pool and nothing would drive it; add it there first, or --force)`);
    outcome.skipped.push(name); return false;
  }
  const { sel, list, raw } = await scriptList(name);
  if (!list) { say(`${name}: script list unreadable (${String(raw.text || JSON.stringify(raw)).slice(0, 160)}) — skipped (not open in L2Swarm? run this again once it is logged in, or switch its config offline with SETUP.cmd -Apply while L2Swarm is stopped)`); outcome.skipped.push(name); return false; }
  const sw = list.find(s => s.name === 'swarm.js'), ag = list.find(s => AGENT_RE.test(s.name));
  if (ag && ag.enabled && !(sw && sw.enabled)) { say(`${name}: ${ag.name} already attached and running — nothing to do`); outcome.already.push(name); return true; }
  if (sw && sw.enabled) {
    say(`${name}: stop swarm.js`);
    if (APPLY) {
      await mcp('manage_account_scripts', { ...sel, action: 'stop', script_name: 'swarm.js' });
      const chk = await scriptList(name), s2 = chk.list && chk.list.find(s => s.name === 'swarm.js');
      if (!chk.list || (s2 && s2.enabled)) { say(`${name}: swarm.js did NOT stop (${chk.list ? 'still running' : 'list unreadable'}) — the agent is NOT started (never two drivers); try again`); outcome.skipped.push(name); return false; }
    }
  }
  if (ag) {
    if (ag.enabled) { say(`${name}: ${ag.name} already attached and running — nothing to do`); outcome.already.push(name); return true; }
    say(`${name}: ${ag.name} already attached — start it (no file is written)`);
    if (APPLY) await mcp('manage_account_scripts', { ...sel, action: 'start', script_name: ag.name });
    outcome.moved.push(name); return true;
  }
  const file = `agent2_${name.replace(/[^A-Za-z0-9]/g, '')}.js`, src = fs.readFileSync(fs.existsSync(path.join(SCRIPTS, 'agent2.js')) ? path.join(SCRIPTS, 'agent2.js') : path.join(ROOT, 'Scripts_dev', 'agent2.js'), 'utf8');
  say(`${name}: create its own copy Scripts/${file} (${src.length} chars from Scripts/agent2.js) and start it — Scripts/agent2.js is not touched`);
  if (!APPLY) { outcome.moved.push(name); return true; }
  // a leftover copy that is not attached here can only be this character's own (the name carries it): remove it so create can write it
  try { fs.unlinkSync(path.join(SCRIPTS, file)); say(`${name}: removed an unattached leftover Scripts/${file}`); } catch (e) { }
  const cr = await mcp('manage_account_scripts', { ...sel, action: 'create', file_name: file, source: src });
  const guid = cr.script_guid || cr.guid || (cr.script && (cr.script.guid || cr.script.script_guid)) || null;
  if (cr.text && /error|fail|refus|exists/i.test(cr.text) && !/created/i.test(cr.text)) { say(`${name}: create answered: ${cr.text.slice(0, 200)} — stopped here (swarm.js stays stopped; start it again by hand if needed)`); outcome.skipped.push(name); return false; }
  await mcp('manage_account_scripts', { ...sel, action: 'start', ...(guid ? { script_guid: guid } : { script_name: file }) });
  say(`${name}: ${file} attached + started — check Logs/brain_host.log for 'agent ${name} connected'`);
  outcome.moved.push(name); return true;
}

/** rollback of one character: agent off (checked), then swarm.js on */
async function back(name) {
  const { sel, list, raw } = await scriptList(name);
  if (!list) { say(`${name}: script list unreadable (${String(raw.text || JSON.stringify(raw)).slice(0, 160)}) — skipped`); outcome.skipped.push(name); return false; }
  const sw = list.find(s => s.name === 'swarm.js'), ags = list.filter(s => AGENT_RE.test(s.name) && s.enabled);
  if (!sw) { say(`${name}: swarm.js is not attached to this account — attach it in L2Swarm (or SETUP.cmd -Apply with L2Swarm stopped); nothing changed`); outcome.skipped.push(name); return false; }
  if (!ags.length && sw.enabled) { say(`${name}: already on swarm.js — nothing to do`); outcome.already.push(name); return true; }
  for (const ag of ags) { say(`${name}: stop ${ag.name}`); if (APPLY) await mcp('manage_account_scripts', { ...sel, action: 'stop', script_name: ag.name }); }
  if (APPLY && ags.length) {
    const chk = await scriptList(name);
    if (!chk.list || chk.list.some(s => AGENT_RE.test(s.name) && s.enabled)) { say(`${name}: the agent did NOT stop — swarm.js is NOT started (never two drivers); try again`); outcome.skipped.push(name); return false; }
  }
  if (!sw.enabled) { say(`${name}: start swarm.js`); if (APPLY) await mcp('manage_account_scripts', { ...sel, action: 'start', script_name: 'swarm.js' }); }
  if (isBrain(name)) say(`${name}: NOTE brain_host.json still puts it in the brain — add it to "except" (allowAll) or take it out of "allow", or the next --all moves it again`);
  outcome.moved.push(name); return true;
}

function sync() {
  const src = fs.readFileSync(fs.existsSync(path.join(SCRIPTS, 'agent2.js')) ? path.join(SCRIPTS, 'agent2.js') : path.join(ROOT, 'Scripts_dev', 'agent2.js'), 'utf8');
  const copies = fs.readdirSync(SCRIPTS).filter(f => /^agent2_[A-Za-z0-9]+\.js$/i.test(f));
  let n = 0;
  for (const f of copies) {
    const p = path.join(SCRIPTS, f); let cur = ''; try { cur = fs.readFileSync(p, 'utf8'); } catch (e) { }
    if (cur === src) continue;
    n++; say(`sync: ${f} differs from Scripts/agent2.js${APPLY ? ' -> copied (L2Swarm reloads that one character)' : ' (dry run)'}`);
    // in place (like deploy_swarm.ps1's Copy-Item): L2Swarm reloads on FileSystemWatcher Changed; a rename over the file may only raise Renamed
    if (APPLY) fs.writeFileSync(p, src);
  }
  say(`sync: ${copies.length} per-character copies, ${n} ${APPLY ? 'updated' : 'would be updated'}`);
}

(async () => {
  const live = liveFight();
  if (live.length && !FORCE) { say(`REFUSED: a raid / Kamaloka is live (${live.join(', ')} written < 60 s ago); --force overrides`); process.exit(2); }
  if (a.includes('--sync')) { sync(); return; }
  let names = String(opt('--names', '')).split(',').map(s => s.trim()).filter(Boolean);
  if (ALL && !BACK) {
    if (!S) { say('REFUSED: Dashboard/brain_host/supervise.js not found (needed for --all)'); process.exit(2); }
    if (!BH_RAW) { say('REFUSED: Scripts/data/brain_host.json is missing or unreadable'); process.exit(2); }
    if (!ACCOUNTS) { say('REFUSED: swarm.config.json is missing or unreadable (the roster)'); process.exit(2); }
    const c = S.readCfg(BH_RAW, null, ACCOUNTS);
    if (!c.on) { say(`the new engine is OFF in Scripts/data/brain_host.json ("on": ${BH_RAW.on}, ${c.allow.length} characters) — nothing to move`); process.exit(0); }
    names = c.allow.filter(n => (ACCOUNTS || []).some(x => x && x.character === n));
    say(`brain characters (${c.allowAll ? 'allowAll: every character of swarm.config.json' : 'the "allow" list'}${c.except.length ? ', except ' + c.except.join(', ') : ''}): ${names.length}`);
  }
  if (!names.length) { say('usage: --names A,B [--apply] [--force] | --all [--apply] [--gap ms] | --back --names A,B [--apply] | --sync [--apply]'); process.exit(2); }
  if (!APPLY) say('DRY RUN (add --apply to act)');
  // AGENTFILE-2026-10-13 (tester: "ENOENT ... Scripts\agent2.js" for every character AFTER "stop swarm.js" = characters left with no script):
  // the agent file must exist BEFORE anything is stopped; an install where update.cmd did not copy it gets it from Scripts_dev\agent2.js here
  if (!BACK) {
    const liveA = path.join(SCRIPTS, 'agent2.js'), devA = path.join(ROOT, 'Scripts_dev', 'agent2.js');
    if (!fs.existsSync(liveA)) {
      if (!fs.existsSync(devA)) { say('REFUSED: neither Scripts/agent2.js nor Scripts_dev/agent2.js exists - nothing was stopped. Run update.cmd again.'); process.exit(2); }
      const chk = require('child_process').spawnSync(process.execPath, ['--check', devA], { encoding: 'utf8' });
      if (chk.status !== 0) { say('REFUSED: Scripts_dev/agent2.js has a syntax error - nothing was stopped: ' + String(chk.stderr || '').slice(0, 200)); process.exit(2); }
      if (APPLY) { fs.copyFileSync(devA, liveA); say('Scripts/agent2.js was missing - copied it from Scripts_dev/agent2.js'); }
      else say('Scripts/agent2.js is missing - --apply copies it from Scripts_dev/agent2.js first');
    }
  }
  if (!BACK && !poolRunning()) {
    if (APPLY && !FORCE) { say('REFUSED: the brain pool is not running (Logs/brain_host_stats.json is older than 60 s). Start / restart the dashboard (it starts the pool when brain_host.json is on), then run this again; --force overrides'); process.exit(2); }
    say('WARNING: the brain pool is not running (Logs/brain_host_stats.json older than 60 s) — moved characters would only have the agent\'s reflexes until it runs');
  }
  let bad = 0, i = 0;
  for (const n of names) {
    if (i++ && GAP && APPLY) await sleep(GAP);
    try { if (!(await (BACK ? back(n) : attach(n)))) bad++; } catch (e) { bad++; outcome.skipped.push(n); say(`${n}: ${e.message}`); }
  }
  say(`summary: ${BACK ? 'back on swarm.js' : 'moved to the new engine'}${APPLY ? '' : ' (dry run: would be)'} ${outcome.moved.length}${outcome.moved.length ? ' (' + outcome.moved.join(', ') + ')' : ''}; already ${outcome.already.length}; skipped ${outcome.skipped.length}${outcome.skipped.length ? ' (' + outcome.skipped.join(', ') + ')' : ''}`);
  process.exit(bad ? 1 : 0);
})();
