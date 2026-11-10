// ONLINEGAP-2026-11-10 (tester LuckyStrikz, Discord #swarmhive: "hive got all the accounts online but only recognized 16 of the 27 are online" /
// "27 of 27 there but parties are full in swarm but the dashboard still has them as offline" - the 11 had no agent2.js script / were missing
// from swarm.config.json; he found it by editing swarm.config.json by hand). Every account L2Swarm has LOGGED IN whose character does not
// report to Hive (no fresh Logs/swarm_state_<name>.json) gets a plain reason + the safe fix:
//   notInConfig  the character is not in swarm.config.json             -> Accounts tab "+ Add account" (existing character: party + role)
//   otherChar    its login is in swarm.config.json for another character -> the account plays an alt; switch back or add this character
//   disabled     "enabled": false in swarm.config.json                  -> nothing runs for it (on purpose)
//   noRole       no "role" in swarm.config.json                          -> the script ignores it until a role is set
//   poolDown     new engine on, the brain pool does not report           -> PC tab: Restart dashboard
//   noAgent      new engine on, its agent2.js is not connected            -> one click: PC tab "Move accounts to the new engine" (attach_agent --all)
//   silent       agent connected, but swarm.js writes no state yet        -> starting (wait ~1 min) or stuck: Restart brain host
//   noScript     new engine off / excluded, no swarm.js state             -> swarm.js is not running on that account in L2Swarm (said, no button)
// MEMWATCH BAR (MEMPAGEFILE-2026-11-10, requirement memwatch.md R3/R4): Logs/memwatch_alert.json { kind: 'pagefile' | 'restart', reason, advice }
// -> the warning bar under the header (index.html renderFull). pagefile = rewritten every 2 min while it lasts (older than 30 min = MemWatch
// stopped: not shown); restart = shown for 3 h after the restart.
// Pure parts (gapRows, memAlertOf) are tested by docs/plan/tools/test_onlinegap.js.
'use strict';
const fs = require('fs');

const lc = (s) => String(s == null ? '' : s).toLowerCase();
/** MCP get_accounts_status list -> [{ login, name, config }] of the accounts logged in with a character */
function onlineOf(list) {
  return (Array.isArray(list) ? list : []).filter(a => a && a.is_logged_in && a.character && a.character.name)
    .map(a => ({ login: String(a.account_name || a.configured_name || ''), name: String(a.character.name), config: String(a.config_path || '') }));
}
/** o = { online: [{login,name}], accounts: swarm.config.json accounts[], engine: { on, allow, except }, connected: [names] | null,
 *        ages: { name: ageSec }, handsOff: { name: { on } }, freshSec (30) } -> { rows: [{ name, login, reason, text, fix }], online, reporting } */
function gapRows(o) {
  const on = Array.isArray(o && o.online) ? o.online : [], accs = Array.isArray(o && o.accounts) ? o.accounts.filter(a => a && typeof a === 'object') : [];
  const eng = (o && o.engine) || {}, allow = new Set((eng.allow || []).map(String)), except = new Set((eng.except || []).map(String));
  const conn = Array.isArray(o && o.connected) ? new Set(o.connected.map(String)) : null, ages = (o && o.ages) || {}, H = (o && o.handsOff) || {};
  const fresh = Number(o && o.freshSec) > 0 ? Number(o.freshSec) : 30;
  const rows = []; let reporting = 0;
  for (const a of on) {
    const name = String(a.name || ''), login = String(a.login || '');
    if (!name) continue;
    const acc = accs.find(x => lc(x.character) === lc(name)), cn = acc ? String(acc.character) : name;   // the config's spelling for every other list
    const age = ages[name] != null ? ages[name] : ages[cn];
    if (age != null && Number(age) < fresh) { reporting++; continue; }
    const row = { name, login, reason: '', text: '', fix: '' };
    const hoff = !!((H[cn] && H[cn].on) || (H[name] && H[name].on));
    if (!acc) {
      const other = login ? accs.find(x => lc(x.login) === lc(login)) : null;
      if (other) Object.assign(row, { reason: 'otherChar', text: `logged in as ${name}, but swarm.config.json has ${other.character} for login ${login} (an alt?) - Hive only drives ${other.character}`, fix: 'accounts' });
      else Object.assign(row, { reason: 'notInConfig', text: `not in swarm.config.json - Hive does not know this account (no party, no role, no script)`, fix: 'add' });
    } else if (acc.enabled === false) Object.assign(row, { reason: 'disabled', text: `"enabled": false in swarm.config.json - nothing runs for it`, fix: '' });
    else if (!acc.role) Object.assign(row, { reason: 'noRole', text: `has no role in swarm.config.json - the script ignores it until it has one`, fix: 'role' });
    else if (eng.on && allow.has(cn)) {
      if (!conn) Object.assign(row, { reason: 'poolDown', text: `new engine: the brain pool does not report - its agent cannot connect`, fix: 'dashrestart' });
      else if (!conn.has(cn)) Object.assign(row, { reason: 'noAgent', text: `no agent2.js connected to the brain - the script is not attached / not started on this account in L2Swarm (or it still runs swarm.js)${hoff ? ' · hands off: the automatic re-attach leaves it alone' : ''}`, fix: 'attach' });
      else Object.assign(row, { reason: 'silent', text: `its agent is connected, but swarm.js has written no state ${age == null ? 'yet' : `for ${Math.round(age)} s`} - still starting (about a minute) or stuck`, fix: 'bhrestart' });
    } else {
      const why = !eng.on ? 'the new engine is off' : except.has(cn) ? 'it is excluded from the new engine (brain_host.json "except")' : 'it is not in the new engine\'s list';
      Object.assign(row, { reason: 'noScript', text: `${why} and swarm.js reports nothing - no Hive script runs on this account in L2Swarm (start swarm.js on it, or put it on the new engine)`, fix: '' });
    }
    if (hoff) row.handsOff = true;
    rows.push(row);
  }
  return { rows, online: on.length, reporting };
}
/** the parsed Logs/memwatch_alert.json (BOM-tolerant) + now -> what the bar shows, or null */
function memAlertOf(j, nowMs, fileMtimeMs) {
  if (!j || typeof j !== 'object' || (j.kind !== 'pagefile' && j.kind !== 'restart')) return null;
  const at = Date.parse(j.at || '') || Number(fileMtimeMs) || 0, ageMin = at ? (nowMs - at) / 60000 : null;
  if (ageMin != null && ageMin > (j.kind === 'pagefile' ? 30 : 180)) return null;
  return { kind: j.kind, at: j.at || (at ? new Date(at).toISOString() : ''), reason: String(j.reason || ''), advice: String(j.advice || ''),
    pcFreeMB: Number(j.pcFreeMB) || null, commitFreeMB: Number(j.commitFreeMB) || null, commitLimitMB: Number(j.commitLimitMB) || null };
}
function memAlert(file, nowMs) {
  try { const st = fs.statSync(file); const j = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')); return memAlertOf(j, nowMs || Date.now(), st.mtimeMs); } catch (e) { return null; }
}
/** ctx = { mcpList: async () => [accounts], accounts: () => swarm.config.json accounts, engine: () => { on, allow, except }, connected: () => names | null,
 *          ages: () => { name: ageSec }, handsOff: () => {} } -> { get (async, cached 30 s), peek (sync, last result; refreshes in the background) } */
function create(ctx) {
  const C = { at: 0, v: null, busy: null };
  async function get(maxAgeMs) {
    if (C.v && Date.now() - C.at < (maxAgeMs || 30000)) return C.v;
    if (C.busy) return C.busy;
    C.busy = (async () => {
      let list; try { list = await ctx.mcpList(); } catch (e) { C.v = { rows: [], online: null, reporting: null, error: 'L2Swarm (MCP) does not answer', at: new Date().toISOString() }; C.at = Date.now(); return C.v; }
      const r = gapRows({ online: onlineOf(list), accounts: ctx.accounts(), engine: ctx.engine(), connected: ctx.connected(), ages: ctx.ages(), handsOff: ctx.handsOff() });
      C.v = Object.assign(r, { at: new Date().toISOString() }); C.at = Date.now(); return C.v;
    })().finally(() => { C.busy = null; });
    return C.busy;
  }
  function peek() { if (!C.v || Date.now() - C.at > 60000) get(60000).catch(() => { }); return C.v; }
  return { get, peek };
}
module.exports = { onlineOf, gapRows, memAlertOf, memAlert, create };
