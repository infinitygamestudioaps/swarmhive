// BRAIN HOST SUPERVISION RULES for Dashboard/server.js (engine audit #26 / #35 / #38, 2026-10-12). Pure functions + small file reads, so
// docs/plan/tools/test_engine_resilience.js can test them without starting the dashboard.
//   restartSig(cfg)      what forces a NEW pool process: on / bridge / pool mode. The allow list is NOT in it for the pool (pool.js re-reads
//                        Scripts/data/brain_host.json itself every 5 s: a character added / removed never restarts the other parties). The
//                        single-process runner (pool:false) still needs a restart for a new list, so there the list is in the signature.
//   readCfg(raw, last)   brain_host.json -> config; an unreadable / half-written file (raw null) keeps the LAST good config (before: {} =
//                        on:false = the pool was killed by one unlucky read).
//   liveFights(...)      the brain parties with a raid / Kamaloka / epic running now (Logs/{raid,kamaloka,epic}_live_<party>.json written in
//                        the last 30 s): a restart that would reload them waits (user rule: never restart during a raid).
//   decide(...)          -> { act: 'none' | 'start' | 'stop' | 'restart' | 'defer', why }
// ENGINE DEFAULT (2026-10-13, user: "Make the new engine default!"; test docs/plan/tools/test_engine_default.js):
//   "allowAll": true     EVERY character of the roster (swarm.config.json accounts[] with a login + a character, enabled !== false) is a
//                        brain character, plus the names in "allow" (characters outside the roster), minus the names in "except". The
//                        dashboard (readCfg with the roster) and the pool (pool.js pollConfig re-reads swarm.config.json too) re-evaluate it
//                        live: an account added on the dashboard joins the brain at its agent's next hello, no restart.
//                        Switch back: "on": false (nobody), or "allowAll": false + the names in "allow", or a name in "except".
//   readCfg(raw, last, accounts)   accounts = swarm.config.json accounts[] (null / missing = unreadable: allowAll keeps the last good list)
//   isBrainChar(name, raw, accounts, { adding })   the same rule for ONE character (SETUP / add account / attach_agent.js)
//   engineScripts(list, brain)      an account's script list for its engine: swarm.js <-> agent2.js (other scripts stay)
//   migrateDefault(raw)             update.ps1: the untouched OLD default (on:false, no "allow" names, no "allowAll" key) -> the new
//                                   default; any file the user changed is kept ({ migrate: false, why })
'use strict';
const fs = require('fs'), path = require('path');

const README = 'New engine (Dashboard/brain_host, started by Dashboard/server.js): the brain characters run swarm.js in the dashboard; their L2Swarm '
  + 'accounts run Scripts/agent2.js only. "allowAll": true = every character of swarm.config.json (+ "allow", minus "except"). Switch back: '
  + '"on": false, or "allowAll": false + the characters in "allow". Move running accounts: dashboard PC tab -> New engine, or '
  + 'node docs/plan/tools/attach_agent.js --all --apply (back: --back --names A,B --apply). docs/plan/INSTALL.md section "New engine".';
/** the characters of the roster (swarm.config.json accounts[]) */
function rosterOf(accounts) {
  return Array.from(new Set((Array.isArray(accounts) ? accounts : []).filter(a => a && a.login && a.character && a.enabled !== false).map(a => String(a.character))));
}
const strList = (v) => (Array.isArray(v) ? v : []).map(String).filter(Boolean);
/** brain_host.json + roster -> the brain characters; null = allowAll but the roster is unknown (unreadable swarm.config.json) */
function effectiveAllow(raw, accounts) {
  if (!raw || typeof raw !== 'object') return [];
  const list = strList(raw.allow), ex = new Set(strList(raw.except));
  if (raw.allowAll !== true) return list.filter(n => !ex.has(n));
  if (!Array.isArray(accounts)) return null;
  return Array.from(new Set(rosterOf(accounts).concat(list))).filter(n => !ex.has(n));
}
function readCfg(raw, last, accounts) {
  if (!raw || typeof raw !== 'object') return last || { on: false, allow: [], allowAll: false, except: [], bridge: true, pool: true, maxRssMb: 0, unread: true };
  let allow = effectiveAllow(raw, accounts), rosterUnread = false;
  if (allow === null) {                                  // allowAll, roster unreadable / being written: keep the last good list
    rosterUnread = true;
    const ex = new Set(strList(raw.except));
    allow = last && last.allowAll && Array.isArray(last.allow) ? last.allow.filter(n => !ex.has(n)) : strList(raw.allow).filter(n => !ex.has(n));
  }
  const c = { on: raw.on !== false && allow.length > 0, allow, allowAll: raw.allowAll === true, except: strList(raw.except), bridge: raw.bridge !== false, pool: raw.pool !== false, maxRssMb: Number(raw.maxRssMb) || 0 };
  if (rosterUnread) c.rosterUnread = true;
  return c;
}
/** one character: does the new engine drive it? (adding = it is being added to the roster right now) */
function isBrainChar(name, raw, accounts, opts) {
  name = String(name || '');
  if (!name || !raw || typeof raw !== 'object' || raw.on === false) return false;
  if (strList(raw.except).includes(name)) return false;
  if (strList(raw.allow).includes(name)) return true;
  if (raw.allowAll !== true) return false;
  return !!(opts && opts.adding) || rosterOf(accounts).includes(name);
}
const AGENT_RX = /^agent2(_[A-Za-z0-9]+)?\.js$/i;
function engineScripts(list, brain) {
  const out = [];
  (Array.isArray(list) ? list : []).map(String).forEach(s => {
    const t = brain && /^swarm\.js$/i.test(s) ? 'agent2.js' : !brain && AGENT_RX.test(s) ? 'swarm.js' : s;
    if (!out.includes(t)) out.push(t);
  });
  return out;
}
/** the default brain_host.json (package / migration): on, every roster character; keeps bridge / pool / maxRssMb of `base` */
function newDefault(base) {
  const b = base && typeof base === 'object' ? base : {}, out = { _readme: README, on: true, allowAll: true, allow: [], except: [], bridge: b.bridge !== false, pool: b.pool !== false };
  if (Number(b.maxRssMb) > 0) out.maxRssMb = Number(b.maxRssMb);
  return out;
}
function migrateDefault(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { migrate: false, why: 'brain_host.json unreadable - not changed' };
  if (Object.prototype.hasOwnProperty.call(raw, 'allowAll')) return { migrate: false, why: `already has "allowAll" (${raw.allowAll === true ? 'every character' : 'your list'}, "on": ${raw.on !== false}) - kept` };
  if (raw.on === true) return { migrate: false, why: 'the new engine is already on for your own list of characters - kept' };
  if (strList(raw.allow).length) return { migrate: false, why: `you listed characters in "allow" (${strList(raw.allow).length}) - kept` };
  return { migrate: true, cfg: newDefault(raw), why: 'the untouched old default (new engine off, no characters) -> the new default (on, every character of swarm.config.json)' };
}
/** swarm.config.json accounts[] (null when the file is missing / unreadable) */
function readRoster(file) {
  try { const j = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')); return j && Array.isArray(j.accounts) ? j.accounts : []; } catch (e) { return null; }
}
function restartSig(c) {
  if (!c) return '';
  return JSON.stringify(c.pool ? { on: !!c.on, bridge: !!c.bridge, pool: true, maxRssMb: c.maxRssMb || 0 } : { on: !!c.on, bridge: !!c.bridge, pool: false, allow: c.allow || [] });
}
/** the parties (swarm.config.json accounts[].party, default the character) of the brain characters */
function brainParties(allow, accounts) {
  const m = new Map(); (accounts || []).forEach(a => { if (a && a.character) m.set(String(a.character), String(a.party || a.character)); });
  return Array.from(new Set((allow || []).map(n => m.get(n) || n)));
}
/** the names a live-fight file of the brain parties can carry: the party keys AND the brain characters (swarm.js names the file after the
 *  writer, liveFileName() = the party leader's Me.Name, which is not the config party key when the leader changed; review 2026-10-12) */
function fightKeys(allow, accounts) { return Array.from(new Set(brainParties(allow, accounts).concat((allow || []).map(String)))); }
/** -> [{ party, kind, ageMs }] for the live raid / Kamaloka / epic files of these parties */
function liveFights(logsDir, parties, t, ms) {
  const out = [];
  (parties || []).forEach(p => {
    for (const k of ['raid', 'kamaloka', 'epic']) {
      try { const s = fs.statSync(path.join(logsDir, `${k}_live_${p}.json`)); const age = (t || Date.now()) - s.mtimeMs; if (age < (ms || 30000)) { out.push({ party: p, kind: k, ageMs: Math.round(age) }); break; } } catch (e) { }
    }
  });
  return out;
}
/** o = { running, sig (the running process's restartSig), cfg (readCfg), fights ([] from liveFights), deferSince, maxDeferMs } */
function decide(o) {
  const c = o.cfg || {}, s = restartSig(c);
  if (!o.running) return c.on ? { act: 'start', sig: s, why: 'not running' } : { act: 'none', sig: s, why: 'off' };
  if (s === o.sig) return { act: 'none', sig: s, why: 'same' };
  if (o.fights && o.fights.length && !(o.maxDeferMs && o.deferSince && Date.now() - o.deferSince > o.maxDeferMs)) {
    return { act: 'defer', sig: s, why: `live ${o.fights.map(f => `${f.kind} of party ${f.party}`).join(', ')}` };
  }
  return { act: c.on ? 'restart' : 'stop', sig: s, why: 'brain_host.json: ' + (c.on ? 'on / bridge / pool mode changed' : 'switched off') };
}
/** the pool's stats file (pool.js --stats-file) when it is fresh (< maxAgeMs) */
function readStats(file, maxAgeMs) {
  try { const s = fs.statSync(file); const j = JSON.parse(fs.readFileSync(file, 'utf8')); j.ageMs = Date.now() - s.mtimeMs; j.fresh = j.ageMs < (maxAgeMs || 60000); return j; } catch (e) { return null; }
}

/** the characters whose agent is connected to the pool now (fresh stats file), or null */
function connectedNames(stats) {
  if (!stats || !stats.fresh || !Array.isArray(stats.workers)) return null;
  const out = []; stats.workers.forEach(w => (w.contexts || []).forEach(c => { if (c && c.connected && c.name) out.push(String(c.name)); }));
  return out;
}

module.exports = { readCfg, restartSig, brainParties, fightKeys, liveFights, decide, readStats,
  rosterOf, effectiveAllow, isBrainChar, engineScripts, newDefault, migrateDefault, readRoster, connectedNames, README, AGENT_RX };
