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
'use strict';
const fs = require('fs'), path = require('path');

function readCfg(raw, last) {
  if (!raw || typeof raw !== 'object') return last || { on: false, allow: [], bridge: true, pool: true, maxRssMb: 0, unread: true };
  const allow = (Array.isArray(raw.allow) ? raw.allow : []).map(String).filter(Boolean);
  return { on: raw.on !== false && allow.length > 0, allow, bridge: raw.bridge !== false, pool: raw.pool !== false, maxRssMb: Number(raw.maxRssMb) || 0 };
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

module.exports = { readCfg, restartSig, brainParties, fightKeys, liveFights, decide, readStats };
