// HEAP PROBE (2026-10-12, "find the main cause"): READ-ONLY. Lists every open account's scripts through L2Swarm's MCP server
// (manage_account_scripts list: used/total V8 heap per script) and L2Swarm's process memory, so script memory and L2Swarm's own memory can be
// told apart.  node docs/plan/tools/heap_probe.js [--out file.json]
'use strict';
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const MCP = 'http://127.0.0.1:8083';
async function call(tool, args) {
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
  const post = async (body) => { const r = await fetch(MCP, { method: 'POST', headers, body: JSON.stringify(body) }); const sid = r.headers.get('mcp-session-id'); if (sid) headers['Mcp-Session-Id'] = sid; let t = await r.text(); if (/^\s*(event|data):/.test(t)) t = t.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5)).join(''); return JSON.parse(t); };
  await post({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'heap_probe', version: '1' } } });
  const res = await post({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: tool, arguments: args } });
  if (res.error) throw new Error(res.error.message); return (res.result.content || []).map(c => c.text).join('\n');
}
(async () => {
  const all = JSON.parse(await call('get_accounts_status', {})); const list = (Array.isArray(all) ? all : (all.accounts || [])).filter(a => a.is_connected);
  const out = { at: new Date().toISOString(), accounts: [] };
  for (const a of list) {
    try {
      const j = JSON.parse(await call('manage_account_scripts', { account_id: a.account_id, action: 'list' }));
      const sc = (j.scripts || []).filter(s => s.runtime && s.runtime.used_heap_bytes);
      out.accounts.push({ name: (a.character && a.character.name) || a.account_name, scripts: sc.map(s => ({ n: s.name, used: Math.round(s.runtime.used_heap_bytes / 1048576 * 10) / 10, total: Math.round(s.runtime.total_heap_bytes / 1048576 * 10) / 10, state: s.runtime.state, gen: s.runtime.runtime_generation })) });
    } catch (e) { out.accounts.push({ name: a.account_name, error: e.message }); }
  }
  try { const o = execFileSync('powershell', ['-NoProfile', '-Command', '$p=Get-Process L2Swarm; [int]($p.PrivateMemorySize64/1MB)'], { encoding: 'utf8' }).trim(); out.l2swarmMB = +o; } catch (e) { }
  const sum = (k) => Math.round(out.accounts.reduce((s, a) => s + (a.scripts || []).reduce((t, x) => t + (x[k] || 0), 0), 0));
  out.sumUsedMB = sum('used'); out.sumTotalMB = sum('total');
  const of = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : null;
  if (of) fs.writeFileSync(of, JSON.stringify(out, null, 1));
  console.log(`${out.at}: ${out.accounts.length} accounts, V8 heaps used ${out.sumUsedMB} MB / total ${out.sumTotalMB} MB, L2Swarm private ${out.l2swarmMB} MB`);
  const top = out.accounts.map(a => ({ n: a.name, t: (a.scripts || []).reduce((s, x) => s + x.total, 0) })).sort((a, b) => b.t - a.t);
  console.log('largest:', top.slice(0, 5).map(x => `${x.n} ${x.t}`).join(', '), '| smallest:', top.slice(-3).map(x => `${x.n} ${x.t}`).join(', '));
})().catch(e => { console.log('ERROR', e.message); process.exit(1); });
