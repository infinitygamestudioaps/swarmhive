// CLAN NOBILITY RANKS API (user 2026-10-12, forum topic 429). READ-ONLY. Loaded by server.js with one hook BEFORE the key check (like
// clanauto_api.js); the API checks the key itself, the page files are public (no secrets):
//   /clanranks.js, /clanranks.css, /clanranks_logic.js
//   GET /api/clanranks   { ok, summary (clanranks_logic.summary), ladder, conflicts, levels (requirements + unlocks per clan level), goals,
//                          rankNames, roles, live, l2toggleNotes, generated }
// Inputs (never written): Scripts/data/clan_ranks.json (docs/plan/tools/clan_ranks.js), Logs/clan_state.json (clan leader's report),
// Logs/swarm_state_<Name>.json clanInfo (every member's copy of the server's clan list), Logs/clan.log "clan intel" lines (fallback),
// Logs/bag_<leader>.json (level-up item in the leader's bag). Env SWARM_CLANRANKS_FILE overrides the data file (tests).
'use strict';
const fs = require('fs'), path = require('path');
const STATIC = { '/clanranks.js': 'application/javascript; charset=utf-8', '/clanranks.css': 'text/css; charset=utf-8', '/clanranks_logic.js': 'application/javascript; charset=utf-8' };
let LOGIC = null;
const logic = (ctx) => LOGIC || (LOGIC = require(path.join(ctx.DIR || __dirname, 'clanranks_logic.js')));
const dataFile = (ctx) => process.env.SWARM_CLANRANKS_FILE || path.join(ctx.DATA, 'clan_ranks.json');
const rd = (ctx, F, d) => { try { if (ctx.readJson) return ctx.readJson(F, d); return JSON.parse(fs.readFileSync(F, 'utf8').replace(/^﻿/, '')); } catch (e) { return d; } };
let lastGood = null;   // the newest good clanInfo seen (survives the few minutes after a script restart where clan_state has none)

function tail(F, bytes) {
  try { const st = fs.statSync(F), n = Math.min(bytes, st.size), fd = fs.openSync(F, 'r'); const b = Buffer.alloc(n); fs.readSync(fd, b, 0, n, st.size - n); fs.closeSync(fd); return b.toString('utf8'); } catch (e) { return ''; }
}
/** newest good clanInfo among the members' state files (same clan id when known) */
function cacheFromStates(ctx, clanId) {
  let best = null;
  try {
    fs.readdirSync(ctx.LOGS).forEach(f => {
      if (!/^swarm_state_[A-Za-z0-9_-]+\.json$/.test(f)) return;
      const s = rd(ctx, path.join(ctx.LOGS, f), null), c = s && s.clanInfo;
      if (!c || !c.seenAt || !Array.isArray(c.members) || !c.members.length || !c.name || /^\(clan /.test(c.name)) return;
      if (clanId && c.id && Number(c.id) !== Number(clanId)) return;
      if (!best || Date.parse(c.seenAt) > Date.parse(best.seenAt)) best = c;
    });
  } catch (e) { }
  if (best && (!lastGood || Date.parse(best.seenAt) >= Date.parse(lastGood.seenAt))) lastGood = best;
  return lastGood;
}

function build(ctx) {
  const L = logic(ctx);
  const data = rd(ctx, dataFile(ctx), null);
  if (!data || !Array.isArray(data.levels)) return { ok: false, error: 'Scripts/data/clan_ranks.json missing — run: node docs/plan/tools/clan_ranks.js' };
  const st = rd(ctx, path.join(ctx.LOGS, 'clan_state.json'), {}) || {};
  const clanId = (st.clanInfo && st.clanInfo.id) || (st.clan && st.clan.id) || null;
  const cache = cacheFromStates(ctx, clanId);
  const intel = L.parseIntel(tail(path.join(ctx.LOGS, 'clan.log'), 65536));
  const leader = (st.clanInfo && st.clanInfo.leader) || (intel && intel.leader) || (cache && cache.leader) || st.leader || '';
  const bagF = leader && /^[A-Za-z0-9_-]+$/.test(leader) ? path.join(ctx.LOGS, `bag_${leader}.json`) : null;
  const bagD = bagF ? rd(ctx, bagF, null) : null;
  const bag = bagD && Array.isArray(bagD.items) ? bagD.items.map(i => ({ id: Number(i.id), count: Number(i.count) || 0 })) : null;
  const summary = L.summary(data, st, { intel, cache, bag });
  return {
    ok: true, generated: data.generated, summary,
    ladder: L.ladder(), rankNames: L.RANK_NAMES, roles: L.ROLES.map(r => ({ key: r, label: L.ROLE_LABEL[r], from: L.UNIT_MIN_LEVEL[r] || 1 })),
    conflicts: data.conflicts || [], levels: (data.levels || []).map(l => ({ level: l.level, requirements: l.requirements, itemSource: l.itemSource, live: l.live, unlocks: l.unlocks })),
    goals: summary.goals, rankGatedItems: (data.rankGatedItems || []).map(g => ({ pledgeClass: g.pledgeClass, rank: g.rank, label: g.label, count: (g.items || []).length,
      sample: (g.items || []).slice(0, 4).map(i => i.name) })),
    clanSkillRanks: data.clanSkillRanks || null, l2toggleNotes: data.l2toggleNotes || [], live: data.live || null,
    leaderBagAt: bagD && bagD.at || null,
  };
}

/** server.js hook: returns true when it answered */
async function handle(req, res, url, ctx) {
  const p = url.pathname;
  if (STATIC[p]) {
    try { ctx.send(res, 200, STATIC[p], fs.readFileSync(path.join(ctx.DIR || __dirname, p.slice(1)))); } catch (e) { ctx.send(res, 404, 'text/plain; charset=utf-8', 'not found'); }
    return true;
  }
  if (p !== '/api/clanranks') return false;
  if (!ctx.allowed(req, url)) { ctx.json(res, 401, { error: 'key needed' }); return true; }
  if (req.method !== 'GET') { ctx.json(res, 405, { error: 'read-only' }); return true; }
  try { ctx.json(res, 200, build(ctx)); } catch (e) { ctx.json(res, 500, { error: e.message }); }
  return true;
}
module.exports = { handle, build, _reset: () => { lastGood = null; LOGIC = null; } };
