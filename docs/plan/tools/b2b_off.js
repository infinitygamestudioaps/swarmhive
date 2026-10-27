// C2-2026-10-26 (owner approved "C2: bot-to-bot broadcast off"; docs/plan/perf_2026-10-26/cpu_trace.md: L2Swarm's bot-to-bot UDP broadcast,
// sent synchronously on the packet thread for every status update to all 79 accounts = ~13 % of the remaining L2Swarm CPU). Hive reads no
// bot-to-bot data (its brain mirrors every character itself); trial on Crafter1 / Spoiler1 / Healer1 21:02-21:12 fine. Sets
// EnableBotToBotComm=false on every open account and saves its config (the next L2Swarm start keeps it). Undo: --on.
//   node docs/plan/tools/b2b_off.js [--apply] [--on]
'use strict';
const http = require('http');
const APPLY = process.argv.includes('--apply'), ON = process.argv.includes('--on'), MCP = new URL('http://127.0.0.1:8083');
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
  if (!inited) { await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'b2b-off', version: '1' } } }); inited = true; }
  const r = await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: tool, arguments: args } });
  const c = r && r.result && r.result.content, t = c && c[0] ? c[0].text : JSON.stringify(r);
  try { return JSON.parse(t); } catch (e) { return { text: t }; }
}
(async () => {
  const st = await mcp('get_accounts_status', {});
  const accs = (st.accounts || st.Accounts || (Array.isArray(st) ? st : [])).map(a => ({ id: a.account_id || a.accountId || a.id, name: a.character_name || a.characterName || a.name || a.login })).filter(a => a.id);
  let n = 0, bad = 0;
  for (const a of accs) {
    if (!APPLY) { console.log(`${a.name}: would set EnableBotToBotComm=${ON}`); continue; }
    const m = await mcp('manage_account_config', { account_id: String(a.id), action: 'modify', properties: { EnableBotToBotComm: ON } });
    const s = await mcp('manage_account_config', { account_id: String(a.id), action: 'save' });
    const ok = /Modified/.test(JSON.stringify(m)) && /saved/i.test(JSON.stringify(s)); if (ok) n++; else { bad++; console.log(`${a.name}: ${JSON.stringify(m).slice(0, 80)} | ${JSON.stringify(s).slice(0, 80)}`); }
  }
  console.log(`accounts ${accs.length}${APPLY ? `, set + saved ${n}, problems ${bad}` : ' (dry run)'}`);
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
