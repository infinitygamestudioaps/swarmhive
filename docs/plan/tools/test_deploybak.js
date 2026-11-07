// DEPLOYBAK guard (owner 2026-11-06 "Do 4"): every deploy keeps the swarm.js it replaces (Scripts\backup\deployed, newest 30), so a regression
// ("26 raid deaths today, 1 yesterday") can be diffed exactly instead of guessed from logs.
'use strict';
const fs = require('fs'), path = require('path');
const S = fs.readFileSync(path.join(__dirname, 'deploy_swarm.ps1'), 'utf8');
let ok = 0, bad = 0; const t = (m, c) => { if (c) { ok++; console.log('ok   ' + m); } else { bad++; console.log('FAIL ' + m); } };
const bak = S.indexOf('Copy-Item $dst $bak'), copies = [...S.matchAll(/Copy-Item \$src \$dst/g)].map(m => m.index);
t('the live swarm.js is copied to a backup', bak > 0 && /\\Scripts\\backup\\deployed/.test(S) && /swarm_\{0\}\.js/.test(S));
t('the backup is made BEFORE every copy over the live file (restart and live reload)', copies.length >= 2 && copies.every(i => i > bak));
t('only the newest 30 are kept', /Select-Object -Skip 30/.test(S));
t('a failed backup never blocks the deploy (try / catch)', /backup FAILED \(deploy goes on\)/.test(S));
console.log(`deploybak: ${ok} ok, ${bad} failed`); process.exit(bad ? 1 : 0);
