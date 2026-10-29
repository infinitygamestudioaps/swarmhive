// Requirement engine.md R1 (owner 2026-10-23: "Make the fix permanent now", "Tired of fixing the same bugs over and over"):
// a brain character always runs the brain agent, also after an L2Swarm restart. Offline checks of
//   - Dashboard/server.js AGENTGUARD: who gets moved back (not connected twice in a row, 20 min per character) + the spawn wiring
//   - docs/plan/tools/attach_agent.js PERSIST: every change is saved to the account's XML (manage_account_config save)
'use strict';
const fs = require('fs'), path = require('path');
const R = path.join(__dirname, '..', '..', '..');
const SV = fs.readFileSync(path.join(R, 'Dashboard', 'server.js'), 'utf8');
const AT = fs.readFileSync(path.join(R, 'docs', 'plan', 'tools', 'attach_agent.js'), 'utf8');
let ok = 0, bad = 0;
const t = (name, c) => { if (c) ok++; else { bad++; console.log('FAIL', name); } };
const i = SV.indexOf('const agentGuard = '), j = SV.indexOf('setInterval(', i);
if (i < 0 || j < 0) { console.log('FAIL AGENTGUARD block missing in Dashboard/server.js'); process.exit(1); }
const G = new Function(SV.slice(i, j) + '\nreturn { agentGuard, agentGuardPick, agentGuardOnline };')();
const stats = (conn) => ({ allow: ['Spoiler12', 'Spoiler13', 'Tank1'], workers: [{ contexts: Object.keys(conn).map(n => ({ name: n, connected: conn[n] })) }] });
const T0 = 1e12;
t('first sighting: nobody moved yet (could be reconnecting)', G.agentGuardPick(stats({ Spoiler12: false, Spoiler13: true, Tank1: true }), T0).length === 0);
const p2 = G.agentGuardPick(stats({ Spoiler12: false, Spoiler13: true, Tank1: true }), T0 + 120000);
t('second sighting: Spoiler12 (agent not connected) is moved back', p2.length === 1 && p2[0] === 'Spoiler12');
G.agentGuard.tried.Spoiler12 = T0 + 120000; G.agentGuard.seen.Spoiler12 = 0;
G.agentGuardPick(stats({ Spoiler12: false, Spoiler13: true, Tank1: true }), T0 + 240000);
t('tried less than 20 min ago: not again', !G.agentGuardPick(stats({ Spoiler12: false, Spoiler13: true, Tank1: true }), T0 + 360000).includes('Spoiler12'));
t('after 20 min: tried again', G.agentGuardPick(stats({ Spoiler12: false, Spoiler13: true, Tank1: true }), T0 + 120000 + 21 * 60000).includes('Spoiler12'));
G.agentGuardPick(stats({ Spoiler12: true, Spoiler13: true, Tank1: true }), T0 + 50 * 60000);
t('connected again: its count is cleared', !G.agentGuard.seen.Spoiler12);
t('the guard runs every 2 min and spawns attach_agent --names ... --apply', /agentGuardPick\(stats, Date\.now\(\)\)[\s\S]{0,900}'attach_agent\.js'\), '--names', names\.join\(','\)[\s\S]{0,120}'--apply'\][\s\S]{0,1200}\}, 120000\);/.test(SV));
t('the guard never runs next to another engine job, an alt account switch (ALTS-2026-10-25) or without the pool', /if \(engineJob\.running \|\| ALTJOB\.running \|\| !bhProc\) return;/.test(SV));
t('attach_agent saves the XML (manage_account_config save)', /async function persist\(name, sel\)[\s\S]{0,200}mcp\('manage_account_config', \{ \.\.\.sel, action: 'save' \}\)/.test(AT));
// AGENTGUARD-ONLINE-2026-10-29 (Hero): only logged-in characters are moved; MCP down = nothing tried
{ const on = G.agentGuardOnline([{ is_logged_in: true, character: { name: 'Spoiler12' } }, { is_logged_in: false, character: { name: 'Spoiler13' } }, { is_logged_in: true }]);
  t('online: only logged-in characters count', on.has('Spoiler12') && !on.has('Spoiler13') && on.size === 1); }
t('MCP down (L2Swarm not up) = return before any spawn, not logged in = its count cleared', /let online; try \{[^\n]*mcpCallT\('get_accounts_status'[^\n]*catch \(e\) \{ return; \}\n\s*if \(engineJob\.running\) return;\n\s*names\.filter\(n => !online\.has\(n\)\)\.forEach\(n => \{ agentGuard\.seen\[n\] = 0; \}\);/.test(SV));
const persists = (AT.match(/await persist\(name, sel\);/g) || []).length;
t('persist after: already running (2x), started, created, back (= 5 calls)', persists >= 5);
console.log(`${ok} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
