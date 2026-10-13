// UI KIT static files (UX audit 2026-10-13, batch B1): /ui_kit.css, /ui_kit.js, /plainwords.js (public, no secrets).
// Loaded by server.js (one hook, BEFORE the key check, like storagepage_api.js). The files are read from disk on every request, so edits
// need no restart; only this hook itself needed one.
'use strict';
const fs = require('fs'), path = require('path');
const STATIC = { '/ui_kit.css': 'text/css; charset=utf-8', '/ui_kit.js': 'text/javascript; charset=utf-8', '/plainwords.js': 'text/javascript; charset=utf-8',
  '/partysettings.js': 'text/javascript; charset=utf-8', '/partysettings.css': 'text/css; charset=utf-8' };   // PARTYSETTINGS 2026-10-13: the per-party settings popup (Dashboard/partysettings.js)
async function handle(req, res, url, ctx) {
  const type = STATIC[url.pathname];
  if (!type) return false;
  let body;
  try { body = fs.readFileSync(path.join(ctx.DIR, path.basename(url.pathname))); } catch (e) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('not found'); return true; }
  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
  res.end(body);
  return true;
}
module.exports = { handle, STATIC };
