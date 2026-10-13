// NEW ENGINE = DEFAULT (2026-10-13, user: "Make the new engine default!"). A small CLI around Dashboard/brain_host/supervise.js:
//   node docs/plan/tools/engine_default.js --status  [--root <install>]   on / allowAll / how many characters the new engine drives
//   node docs/plan/tools/engine_default.js --migrate [--root <install>]   update.ps1: Scripts/data/brain_host.json that is still the untouched
//        OLD default (on:false, no characters in "allow", no "allowAll" key) becomes the new default (on:true, allowAll:true = every character
//        of swarm.config.json). A file you changed is KEPT. Prints "MIGRATED: ..." or "KEPT: ...", then "STATUS: ...". Always exit 0.
// Switch back by hand: "on": false (nobody) or "allowAll": false + the names in "allow" (docs/plan/INSTALL.md, section New engine).
'use strict';
const fs = require('fs'), path = require('path');
const a = process.argv.slice(2), opt = (k, d) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; };
const ROOT = path.resolve(opt('--root', path.resolve(__dirname, '..', '..', '..')));
let S; try { S = require(path.join(ROOT, 'Dashboard', 'brain_host', 'supervise.js')); } catch (e) { S = require(path.join(__dirname, '..', '..', '..', 'Dashboard', 'brain_host', 'supervise.js')); }
const FILE = path.join(ROOT, 'Scripts', 'data', 'brain_host.json');
const readJ = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch (e) { return null; } };

function status() {
  const raw = readJ(FILE), acc = S.readRoster(path.join(ROOT, 'swarm.config.json'));
  if (!raw) return 'Scripts/data/brain_host.json missing or unreadable - new engine OFF (every account runs swarm.js)';
  const c = S.readCfg(raw, null, acc || []), roster = S.rosterOf(acc || []);
  const how = c.allowAll ? 'allowAll: every character of swarm.config.json' + (c.except.length ? ', except ' + c.except.join(', ') : '') : 'your "allow" list';
  return `new engine ${c.on ? 'ON' : 'OFF'} (${how}): ${c.on ? c.allow.length : 0} of ${roster.length} roster characters run in the brain`;
}
function migrate() {
  const raw = readJ(FILE);
  if (!raw) { console.log('KEPT: Scripts/data/brain_host.json missing or unreadable - not changed'); return; }
  const m = S.migrateDefault(raw);
  if (!m.migrate) { console.log('KEPT: ' + m.why); return; }
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(m.cfg, null, 1) + '\n'); fs.renameSync(tmp, FILE);
  console.log('MIGRATED: ' + m.why);
}

if (a.includes('--migrate')) migrate();
if (a.includes('--migrate') || a.includes('--status')) console.log('STATUS: ' + status());
else console.log('usage: --status | --migrate  [--root <install folder>]');
