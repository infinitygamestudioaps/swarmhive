// A sandboxed copy of Dashboard/server.js for UI tests (command center, 2026-10-08): the MCP server is MOCKED (nothing ever reaches
// L2Swarm / the game), the real dashboard (8090) is never called, background timers + child processes of server.js are off, and it
// listens on a random 127.0.0.1 port (printed as "PORT <n>"). Every MCP call is printed as "MCP <tool> <json args>".
//   node docs/plan/tools/cmdcenter_testserver.js
'use strict';
const path = require('path');
const fs = require('fs');
const http = require('http');
const cp = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..', '..');

const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opt = {}) => {
  const u = String(url);
  if (/:8083\b/.test(u)) {
    const b = JSON.parse(opt.body || '{}');
    let result;
    if (b.method === 'initialize') result = { protocolVersion: '2025-03-26', capabilities: {} };
    else {
      process.stdout.write('MCP ' + b.params.name + ' ' + JSON.stringify(b.params.arguments) + '\n');
      // SANDBOX_INVENTORY (2026-10-10, Trade page UI test): a JSON file { "<character>": [MCP inventory rows] } answers get_account_data inventory
      let fx = null; try { if (process.env.SANDBOX_INVENTORY && b.params.name === 'get_account_data' && b.params.arguments.type === 'inventory') fx = JSON.parse(fs.readFileSync(process.env.SANDBOX_INVENTORY, 'utf8'))[b.params.arguments.account_name] || null; } catch (e) { }
      const t = fx ? JSON.stringify({ items: fx }) : b.params.name === 'get_accounts_status' ? '[]' : JSON.stringify({ success: true, mock: true });
      result = { content: [{ type: 'text', text: t }] };
    }
    const txt = JSON.stringify({ jsonrpc: '2.0', id: b.id, result });
    return { headers: { get: (h) => (h.toLowerCase() === 'mcp-session-id' ? 'mock' : null) }, text: async () => txt, json: async () => JSON.parse(txt) };
  }
  if (/:8090\b/.test(u)) throw new Error('sandbox: real dashboard blocked');
  return realFetch(url, opt);
};
const T = { si: global.setInterval, st: global.setTimeout };
global.setInterval = () => 0; global.setTimeout = () => 0;
cp.fork = () => ({ on() { }, kill() { } });
cp.execFile = (cmd, args, opt, cb) => { const f = typeof opt === 'function' ? opt : cb; if (f) process.nextTick(() => f(null, '', '')); return { on() { } }; };
cp.exec = () => ({ on() { } });
const realAppend = fs.appendFileSync;
fs.appendFileSync = (f, d, o) => (/dashboard_commands\.log$/.test(String(f)) ? undefined : realAppend(f, d, o));
const realWrite = fs.writeFileSync;   // never let the sandbox change settings / data files
fs.writeFileSync = (f, d, o) => (/[\\/](Settings|Scripts)[\\/]/.test(String(f)) ? undefined : realWrite(f, d, o));
const realCreate = http.createServer;
// SANDBOX_HOST (2026-10-10): bind to a LAN address instead of 127.0.0.1 so the key check of server.js really applies (phone-over-LAN test)
http.createServer = (h) => { const s = realCreate(h); const L = s.listen.bind(s); s.listen = (p, host, cb) => L(0, process.env.SANDBOX_HOST || '127.0.0.1', () => { process.stdout.write('PORT ' + s.address().port + '\n'); }); return s; };
console.log = () => { };
require(path.join(ROOT, 'Dashboard', 'server.js'));
global.setInterval = T.si; global.setTimeout = T.st;
