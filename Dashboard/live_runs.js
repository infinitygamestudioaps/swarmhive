// LIVE PER PARTY (user 2026-10-09 18:15: "two parties in Kamaloka at the same time, the live view keeps jumping between them"):
// every party leader's swarm.js writes its own Logs/kamaloka_live_<leader>.json / Logs/raid_live_<leader>.json (the old shared
// Logs/kamaloka_live.json / raid_live.json is still read as a fallback for a swarm.js that is not deployed yet). This module reads all of
// them, one run per leader (the newest file wins), and picks a run: the asked leader's, else a STABLE default (the oldest running run,
// then the newest finished one) so the default view never flips between parties. Used by server.js (/api/kamalive, /api/raidlive,
// ?leader=<name>) and kamapage_api.js (pinned live box). Test: docs/plan/tools/test_live_runs.js.
'use strict';
const fs = require('fs'), path = require('path');
let FSC = null; try { FSC = require('./fscache'); } catch (e) { }   // DASHPERF 2026-10-13: the Logs listing (2100 files) at most every 1.5 s

/** All live files of one kind ('kamaloka_live' | 'raid_live') -> [{ leader, d, upd, file }], one per leader. */
function readRuns(LOGS, base, readJson) {
  let names = [];
  try { names = (FSC ? FSC.listDir(LOGS, 1500) : fs.readdirSync(LOGS)).filter(n => n === base + '.json' || (n.startsWith(base + '_') && n.endsWith('.json'))); } catch (e) { }
  const by = {};
  names.forEach(n => {
    const d = readJson(path.join(LOGS, n), null);
    if (!d || typeof d !== 'object') return;
    const leader = String(d.leader || (n === base + '.json' ? '' : n.slice(base.length + 1, -5)));
    const upd = Date.parse(d.updatedAt || 0) || 0;
    const cur = by[leader];
    if (!cur || upd > cur.upd) by[leader] = { leader, d, upd, file: n };
  });
  return Object.values(by);
}
/** running / finished flags, the same rules the single-file readers used. */
function flags(r, kind, nowMs) {
  const age = ((nowMs || Date.now()) - r.upd) / 1000;
  if (kind === 'kama') return { ageSec: Math.round(age), running: r.d.phase !== 'done' && age <= 30, finished: r.d.phase === 'done' && age <= 900 };
  return { ageSec: Math.round(age), running: age <= 30, finished: false };
}
/** A short line per run for lists (pinned box, banners, chooser). */
function summary(r, kind, nowMs) {
  const d = r.d, f = flags(r, kind, nowMs), party = Array.isArray(d.party) ? d.party : [];
  const base = { leader: r.leader, running: f.running, finished: f.finished, ageSec: f.ageSec, startedMs: +d.startedMs || 0, updatedAt: d.updatedAt || '',
    alive: party.filter(p => !p.dead).length, size: party.length, phase: d.phase || '' };
  if (kind === 'kama') return Object.assign(base, { id: d.id, name: d.name, endedMs: d.endedMs || 0, result: d.result || '', kills: d.kills || 0, step: d.step || '', loot: Array.isArray(d.loot) ? d.loot : [] });
  const b = d.boss || {};
  return Object.assign(base, { boss: { name: b.name || d.bossName || '', hp: b.hp != null ? b.hp : null } });
}
/** The run to show: the asked leader's, else the oldest running one, else the newest finished one. */
function pick(runs, kind, leader, nowMs) {
  if (leader) return runs.find(r => r.leader === leader) || null;
  const withF = runs.map(r => ({ r, f: flags(r, kind, nowMs) }));
  const run = withF.filter(x => x.f.running).sort((a, b) => ((+a.r.d.startedMs || 0) - (+b.r.d.startedMs || 0)) || a.r.leader.localeCompare(b.r.leader))[0];
  if (run) return run.r;
  const fin = withF.filter(x => x.f.finished).sort((a, b) => b.r.upd - a.r.upd)[0];
  return fin ? fin.r : null;
}
/** One kind, ready for the API: { ...the chosen run's data, ageSec, running, finished, runs: [summaries of the running + finished runs] }. */
function live(LOGS, base, kind, readJson, leader, nowMs) {
  const runs = readRuns(LOGS, base, readJson);
  const list = runs.map(r => summary(r, kind, nowMs)).filter(s => s.running || s.finished)
    .sort((a, b) => (b.running - a.running) || (a.startedMs - b.startedMs) || a.leader.localeCompare(b.leader));
  const r = pick(runs, kind, leader || '', nowMs);
  if (!r) return { running: false, finished: false, runs: list, forLeader: leader || '' };
  return Object.assign({}, r.d, flags(r, kind, nowMs), { leader: r.d.leader || r.leader, runs: list, forLeader: leader || '' });
}
/** The live file a leader writes (swarm.js kamaLiveWrite / the raid live loop). */
function fileOf(LOGS, base, leader) { return path.join(LOGS, base + '_' + String(leader).replace(/[^A-Za-z0-9_-]/g, '') + '.json'); }

module.exports = { readRuns, flags, summary, pick, live, fileOf };
