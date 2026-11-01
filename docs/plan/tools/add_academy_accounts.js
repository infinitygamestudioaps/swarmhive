// add_academy_accounts.js (owner 2026-10-31, remote on vacation: "you're forcing me to drive 6 hours home"): the OWNER runs this himself from the
// Claude chat with the "!" prefix, so the owner (not Claude) puts in the password:
//   ! node docs/plan/tools/add_academy_accounts.js mylogin82-20 'password'
// It posts the same request as Accounts -> + Add account -> Several at once -> Academy mages + Log in right away (POST /api/addaccount,
// bulkAcademy): the dashboard stores the password only encrypted (new_account.ps1, Option.EncryptPassword). This script never prints, logs or
// writes the password; logins go 5 s apart (login_gap).
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const [range, pw] = process.argv.slice(2);
const m = String(range || '').match(/^([A-Za-z][A-Za-z_]*)(\d+)-(?:[A-Za-z_]*)(\d+)$/);
if (!m || !pw) { console.log("usage: node docs/plan/tools/add_academy_accounts.js mylogin82-20 'password'"); process.exit(1); }
const a = +m[2], b = +m[3];
if (b < a || b - a >= 200) { console.log('range: 1 to 200 logins'); process.exit(1); }
const logins = []; for (let i = a; i <= b; i++) logins.push(m[1] + i);
const K = fs.readFileSync(path.join(ROOT, 'Dashboard', 'key.txt'), 'utf8').trim();
(async () => {
  const body = { bulk: logins.map(l => l + ';' + pw).join('\n'), bulkAcademy: true, autoStart: true, loginNow: true, dryRun: false };
  let r;
  try { r = await (await fetch('http://127.0.0.1:8090/api/addaccount', { method: 'POST', headers: { 'x-key': K, 'content-type': 'application/json' }, body: JSON.stringify(body) })).json(); }
  catch (e) { console.log('dashboard not reachable: ' + String(e.message).replace(pw, '***')); process.exit(1); }
  body.bulk = null;
  const scrub = (s) => String(s == null ? '' : s).split(pw).join('***');
  const res = (r && r.results) || [];
  res.forEach(x => console.log(`${x.login || '?'}: ${x.status || '?'}${x.character ? ' -> ' + x.character : ''}${x.reason ? ' (' + scrub(x.reason).slice(0, 160) + ')' : ''}`));
  if (!res.length) console.log(scrub(JSON.stringify(r)).slice(0, 600));
  console.log(`${res.filter(x => x.status !== 'error').length}/${logins.length} added${body.loginNow ? ' - logging in one by one, 5 s apart' : ''}`);
})();
