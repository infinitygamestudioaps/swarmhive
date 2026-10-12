// ATTACH THE BRAIN AGENT TO CHARACTERS WITHOUT RESTARTING EVERY OTHER AGENT (engine audit #20, 2026-10-12).
// The old procedure (DESIGN.md §12 step 4b: manage_account_scripts create + the "existing file" workaround of CLAUDE.md §6) deleted and
// re-created the SHARED Scripts/agent2.js for every character it attached. L2Swarm restarts an attached script on every account whenever its
// file changes, so each attach dropped and reconnected every agent already moved (2026-10-12 13:26: 44 disconnects in 40 s; moving N
// characters = O(N^2) V8 engine restarts in L2Swarm). This tool never writes Scripts/agent2.js:
//   - a character that already has an agent attached (agent2.js or agent2_<Name>.js) only gets it STARTED (no file change);
//   - otherwise it gets its OWN copy Scripts/agent2_<Name>.js (manage_account_scripts create with a NEW file name, the path the dashboard
//     transfer already uses for its one-shot scripts): a new file restarts nobody else.
//   swarm.js is stopped on the character first (never driven twice).
// Deploying a new agent version with per-character copies: copy it to Scripts/agent2.js as before, then `--sync` copies it into every
// Scripts/agent2_<Name>.js that differs (each reloads only its own character, once).
// Refuses while a raid / Kamaloka is live (Logs/raid_live*.json, Logs/kamaloka_live.json written < 60 s ago) unless --force.
// Usage: node docs/plan/tools/attach_agent.js --names Spoiler6,Healer6 [--apply] [--force] [--mcp http://127.0.0.1:8083] [--root C:\L2Swarm]
//        node docs/plan/tools/attach_agent.js --sync [--apply] [--force]
//        without --apply it only prints what it would do (dry run).
'use strict';
const fs = require('fs'), path = require('path');
const a = process.argv.slice(2), opt = (k, d) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; };
const ROOT = path.resolve(opt('--root', path.resolve(__dirname, '..', '..', '..')));
const MCP = opt('--mcp', 'http://127.0.0.1:8083');
const APPLY = a.includes('--apply'), FORCE = a.includes('--force');
const SCRIPTS = path.join(ROOT, 'Scripts'), LOGS = path.join(ROOT, 'Logs');
const AGENT_RE = /^agent2(_[A-Za-z0-9]+)?\.js$/i;

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

async function attach(name) {
  const sel = { account_name: name };
  const l = await mcp('manage_account_scripts', { ...sel, action: 'list' });
  const list = Array.isArray(l.scripts) ? l.scripts : null;
  if (!list) { say(`${name}: script list unreadable (${String(l.text || JSON.stringify(l)).slice(0, 160)}) — skipped`); return false; }
  const sw = list.find(s => s.name === 'swarm.js'), ag = list.find(s => AGENT_RE.test(s.name));
  if (sw && sw.enabled) { say(`${name}: stop swarm.js`); if (APPLY) await mcp('manage_account_scripts', { ...sel, action: 'stop', script_name: 'swarm.js' }); }
  if (ag) {
    if (ag.enabled) { say(`${name}: ${ag.name} already attached and running — nothing to do`); return true; }
    say(`${name}: ${ag.name} already attached — start it (no file is written)`);
    if (APPLY) await mcp('manage_account_scripts', { ...sel, action: 'start', script_name: ag.name });
    return true;
  }
  const file = `agent2_${name.replace(/[^A-Za-z0-9]/g, '')}.js`, src = fs.readFileSync(path.join(SCRIPTS, 'agent2.js'), 'utf8');
  say(`${name}: create its own copy Scripts/${file} (${src.length} chars from Scripts/agent2.js) and start it — Scripts/agent2.js is not touched`);
  if (!APPLY) return true;
  // a leftover copy that is not attached here can only be this character's own (the name carries it): remove it so create can write it
  try { fs.unlinkSync(path.join(SCRIPTS, file)); say(`${name}: removed an unattached leftover Scripts/${file}`); } catch (e) { }
  const cr = await mcp('manage_account_scripts', { ...sel, action: 'create', file_name: file, source: src });
  const guid = cr.script_guid || cr.guid || (cr.script && (cr.script.guid || cr.script.script_guid)) || null;
  if (cr.text && /error|fail|refus|exists/i.test(cr.text) && !/created/i.test(cr.text)) { say(`${name}: create answered: ${cr.text.slice(0, 200)} — stopped here (swarm.js stays stopped; start it again by hand if needed)`); return false; }
  await mcp('manage_account_scripts', { ...sel, action: 'start', ...(guid ? { script_guid: guid } : { script_name: file }) });
  say(`${name}: ${file} attached + started — check Logs/brain_host.log for 'agent ${name} connected'`);
  return true;
}

function sync() {
  const src = fs.readFileSync(path.join(SCRIPTS, 'agent2.js'), 'utf8');
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
  const names = String(opt('--names', '')).split(',').map(s => s.trim()).filter(Boolean);
  if (!names.length) { say('usage: --names A,B [--apply] [--force] | --sync [--apply]'); process.exit(2); }
  if (!APPLY) say('DRY RUN (add --apply to act)');
  let bad = 0;
  for (const n of names) { try { if (!(await attach(n))) bad++; } catch (e) { bad++; say(`${n}: ${e.message}`); } }
  process.exit(bad ? 1 : 0);
})();
