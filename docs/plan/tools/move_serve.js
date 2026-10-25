// MOVE SERVE (2026-10-24, owner: move to the new PC "use home network"): a temporary file transfer over the home network, no shared folder,
// no admin. Serves each folder as ONE tar stream (Windows' built-in tar), only with the one-time token, only to the home network.
//   node docs/plan/tools/move_serve.js [port]          prints the token + the download commands for the new PC; Ctrl+C (or kill) ends it
// New PC:  curl.exe -f -H "X-Move-Token: <token>" http://<old-ip>:<port>/l2swarm | tar -xf - -C C:\l2
'use strict';
const http = require('http'), cp = require('child_process'), crypto = require('crypto'), os = require('os'), fs = require('fs'), path = require('path');
const PORT = Number(process.argv[2]) || 8097;
const TOKEN = crypto.randomBytes(18).toString('base64url');
const HOME = os.homedir();
// name -> { dir: parent folder, item: folder inside it, target: where the new PC unpacks it }
const SETS = {
  l2swarm: { dir: 'C:\\l2', item: 'L2Swarm', target: 'C:\\l2' },
  l2client: { dir: 'C:\\L2', item: 'L2Client', target: 'C:\\L2' },
  claude: { dir: path.join(HOME, '.claude', 'projects'), item: 'C--l2-L2Swarm', target: '%USERPROFILE%\\.claude\\projects' },
};
const LOG = path.join(__dirname, '..', '..', '..', 'Logs', 'move_serve.log');
const log = (m) => { const l = `${new Date().toISOString()} ${m}`; console.log(l); try { fs.appendFileSync(LOG, l + '\r\n'); } catch (e) { } };
const local = (a) => /^(::ffff:)?(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)|^::1$/.test(a || '');
const srv = http.createServer((req, res) => {
  const ip = req.socket.remoteAddress, name = String(req.url || '').replace(/^\/+|\/+$/g, '');
  if (!local(ip)) { res.writeHead(403); res.end(); log(`refused ${ip} (not home network)`); return; }
  if (req.headers['x-move-token'] !== TOKEN) { res.writeHead(401); res.end('token'); log(`refused ${ip} ${name} (bad token)`); return; }
  if (name === 'list') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(Object.keys(SETS).filter(k => fs.existsSync(path.join(SETS[k].dir, SETS[k].item))))); return; }
  const S = SETS[name];
  if (!S || !fs.existsSync(path.join(S.dir, S.item))) { res.writeHead(404); res.end('no such set'); return; }
  log(`start ${name} -> ${ip}`);
  res.writeHead(200, { 'Content-Type': 'application/x-tar' });
  const t = cp.spawn('tar.exe', ['-cf', '-', '-C', S.dir, S.item], { windowsHide: true });
  let bytes = 0; t.stdout.on('data', (b) => { bytes += b.length; });
  t.stdout.pipe(res);
  t.stderr.on('data', (d) => log(`${name} tar: ${String(d).trim().slice(0, 200)}`));
  t.on('close', (code) => log(`done ${name} -> ${ip}: ${(bytes / 1e9).toFixed(2)} GB, tar exit ${code}`));
  req.on('close', () => { if (t.exitCode === null) { t.kill(); log(`${name}: the new PC closed the connection`); } });
});
srv.listen(PORT, '0.0.0.0', () => {
  const ips = Object.values(os.networkInterfaces()).flat().filter(n => n && n.family === 'IPv4' && !n.internal).map(n => n.address);
  log(`move_serve on port ${PORT}, this PC: ${ips.join(', ')}`);
  console.log(`TOKEN ${TOKEN}`);
  for (const k of Object.keys(SETS)) console.log(`  ${k}: curl.exe -f -H "X-Move-Token: ${TOKEN}" http://${ips[0]}:${PORT}/${k} | tar -xf - -C "${SETS[k].target}"`);
});
