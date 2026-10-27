// MKCHAR CLEANUP (CPUOPT-2026-10-26, l2swarm_internals.md: 39 characters still had an ENABLED leftover mkchar_*.js = a 2nd V8 engine + a 2 s
// watchdog each, long after the character was created). Stops (disables) every mkchar_*.js on the open accounts and saves each account's config,
// so the next L2Swarm start does not load it again. The script files themselves are kept.
//   node docs/plan/tools/mkchar_cleanup.js            dry run: lists what it would stop
//   node docs/plan/tools/mkchar_cleanup.js --apply
'use strict';
const http = require('http');
const APPLY = process.argv.includes('--apply'), MCP = new URL('http://127.0.0.1:8083');
let sid = null, inited = false;
function rpc(body) {
  return new Promise((res, rej) => {
    const data = Buffer.from(JSON.stringify(body));
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'Content-Length': data.length, Connection: 'close' }; if (sid) headers['Mcp-Session-Id'] = sid;
    const rq = http.request({ host: MCP.hostname, port: MCP.port, path: MCP.pathname || '/', method: 'POST', headers, agent: false }, (r) => {
      const s = r.headers['mcp-session-id']; if (s) sid = s;
      let t = ''; r.setEncoding('utf8'); r.on('data', d => t += d);
      r.on('end', () => { if (/^\s*(event|data):/.test(t)) t = t.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5)).join(''); try { res(JSON.parse(t)); } catch (e) { rej(new Error('not JSON: ' + t.slice(0, 200))); } });
    });
    rq.on('error', rej); rq.setTimeout(60000, () => rq.destroy(new Error('MCP timeout'))); rq.end(data);
  });
}
async function mcp(tool, args) {
  if (!inited) { await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'mkchar-cleanup', version: '1' } } }); inited = true; }
  const r = await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: tool, arguments: args } });
  const c = r && r.result && r.result.content, t = c && c[0] ? c[0].text : JSON.stringify(r);
  try { return JSON.parse(t); } catch (e) { return { text: t }; }
}
(async () => {
  const st = await mcp('get_accounts_status', {});
  const accs = (st.accounts || st.Accounts || (Array.isArray(st) ? st : [])).map(a => ({ id: a.account_id || a.accountId || a.id, name: a.character_name || a.characterName || a.name || a.login })).filter(a => a.id);
  let found = 0, stopped = 0;
  for (const a of accs) {
    const l = await mcp('manage_account_scripts', { account_id: String(a.id), action: 'list' });
    const mk = (l.scripts || []).filter(s => /^mkchar_.*\.js$/i.test(String(s.name || '')) && s.enabled);
    if (!mk.length) continue;
    found += mk.length;
    for (const s of mk) {
      console.log(`${a.name || a.id}: ${s.name} enabled (${s.runtime ? s.runtime.state : '?'}, heap ${s.runtime && s.runtime.used_heap_bytes ? Math.round(s.runtime.used_heap_bytes / 1048576) + ' MB' : '-'})${APPLY ? '' : ' -> would stop'}`);
      if (!APPLY) continue;
      const r = await mcp('manage_account_scripts', { account_id: String(a.id), action: 'stop', script_guid: s.guid });
      console.log('   stop: ' + JSON.stringify(r).slice(0, 160)); stopped++;
    }
    if (APPLY) { const sv = await mcp('manage_account_config', { account_id: String(a.id), action: 'save' }); console.log('   config saved: ' + JSON.stringify(sv).slice(0, 120)); }
  }
  console.log(`accounts ${accs.length}, enabled mkchar scripts ${found}${APPLY ? ', stopped ' + stopped : ' (dry run)'}`);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
