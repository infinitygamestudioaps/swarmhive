// FORTRESS + CASTLE SIEGES (user 2026-10-08: "fortress siege with multiple teams in the same clan, a tab with a map of all fortresses,
// choose which one, which parties and when, regroup before; everything visible (skills, rewards ...); a live view like the raid view;
// the same for castle sieges"). Required by server.js:
//   GET  /api/sieges            -> { forts, castles, rules, plans, parties, clan, live, now, tz }
//   POST /api/sieges            -> { action: 'save', plan } | { action: 'delete', id } | { action: 'status', id, status }
//   GET  /api/siegelive         -> Logs/siege_live.json (written by the siege's main leader every 2 s) + running / finished
// Data: Scripts/data/fortresses.json + castles.json (docs/plan/sieges_research.md, docs/plan/tools/sieges_data.js),
// plans: Scripts/data/siege_plans.json (read live by swarm.js: the main leader of a plan starts it at regroup time).
'use strict';
const fs = require('fs');
const path = require('path');

module.exports = function sieges(ctx) {
  const { DATA, LOGS, ROOT, readJson, readStates } = ctx;
  const PLANS_F = path.join(DATA, 'siege_plans.json');
  const LIVE_F = path.join(LOGS, 'siege_live.json');
  let cache = { at: 0, forts: null, castles: null };
  function data() {
    // the data files change only when the tool runs again: re-read at most every 30 s
    if (Date.now() - cache.at > 30000) {
      cache = { at: Date.now(), forts: readJson(path.join(DATA, 'fortresses.json'), null), castles: readJson(path.join(DATA, 'castles.json'), null) };
    }
    return cache;
  }
  const HEAL = /bishop|saint|healer|elder|oracle|cleric|prophet|cardinal|eva/i, TANK = /^(sk|tank|paladin|darkavenger|templeknight|phoenix|hell|evatemplar|shillientemplar)$/i;
  /** Every party (leader -> members) with levels, roles and the leader's clan / Command Channel right. */
  function parties(chars) {
    const by = {};
    chars.forEach(c => {
      const t = (typeof c.party === 'string' && c.party) || c.name;
      const p = by[t] = by[t] || { leader: t, members: [] };
      p.members.push({ name: c.name, level: +c.level || 0, role: c.role || '', cls: c.cls || '', online: (c.ageSec || 1e9) <= 60, dead: !!c.dead, hp: c.hp, mp: c.mp,
        x: c.x, y: c.y, z: c.z, clan: (c.clanInfo && c.clanInfo.name) || '', task: c.task || '' });
    });
    return Object.values(by).map(p => {
      const L = p.members.map(m => m.level).filter(Boolean), lc = chars.find(c => c.name === p.leader) || {};
      const roles = {}; p.members.forEach(m => { roles[m.role || '?'] = (roles[m.role || '?'] || 0) + 1; });
      return Object.assign(p, { size: p.members.length, online: p.members.filter(m => m.online).length, min: L.length ? Math.min(...L) : 0, max: L.length ? Math.max(...L) : 0,
        avg: L.length ? Math.round(L.reduce((a, b) => a + b, 0) / L.length) : 0, roles,
        healers: p.members.filter(m => HEAL.test(m.role) || HEAL.test(m.cls)).length, tanks: p.members.filter(m => TANK.test(m.role)).length,
        ccRight: lc.ccRight || '', clan: (lc.clanInfo && lc.clanInfo.name) || '', inClan: 0 });
    }).sort((a, b) => b.size - a.size || a.leader.localeCompare(b.leader));
  }
  /** Our clan: the clan leader's report (Logs/clan_state.json) + what the characters report (clanInfo). */
  function clan(chars) {
    const st = readJson(path.join(LOGS, 'clan_state.json'), null) || {};
    let name = '', level = 0, leader = st.leader || 'Dagger1', id = 0;
    chars.forEach(c => { const ci = c.clanInfo; if (!ci || !ci.name) return; if (ci.isLeader || c.name === leader) { name = ci.name; level = Math.max(level, +ci.level || 0); id = ci.id || id; } });
    if (!name && st.clan && st.clan.name) { name = st.clan.name; level = +st.clan.level || 0; }
    if (!name) chars.forEach(c => { const ci = c.clanInfo; if (ci && ci.name && !name) { name = ci.name; level = +ci.level || 0; } });
    const lc = chars.find(c => c.name === leader) || null;
    const members = chars.filter(c => name && c.clanInfo && c.clanInfo.name === name).map(c => c.name);
    return { name, level, id, leader, leaderOnline: !!(lc && lc.ageSec <= 60), leaderLevel: lc ? +lc.level || 0 : null, leaderAt: lc ? { x: lc.x, y: lc.y } : null,
      leaderCcRight: lc ? lc.ccRight || '' : '', members, sp: st.sp || null, nextLevel: st.nextLevel || null };
  }
  function plans() { const p = readJson(PLANS_F, null); return (p && Array.isArray(p.plans)) ? p.plans : []; }
  function writePlans(list) {
    try { if (fs.existsSync(PLANS_F)) fs.copyFileSync(PLANS_F, path.join(ROOT, 'Settings', 'backup', 'siege_plans_' + Date.now() + '.json')); } catch (e) { }
    fs.writeFileSync(PLANS_F, JSON.stringify({ _note: 'Siege plans (dashboard Fortresses / Castles tab). swarm.js: the main leader (cc) of an enabled plan starts it at siegeAt - regroupMin. Times are UTC ISO.', plans: list }, null, 2));
  }
  function live() {
    const d = readJson(LIVE_F, null);
    if (!d) return { running: false };
    const age = (Date.now() - Date.parse(d.updatedAt || 0)) / 1000;
    return Object.assign({}, d, { ageSec: Math.round(age), running: d.phase !== 'done' && age <= 30, finished: d.phase === 'done' && age <= 1800 });
  }
  function targetOf(kind, id) {
    const D = data();
    const list = kind === 'castle' ? ((D.castles && D.castles.castles) || []) : ((D.forts && D.forts.forts) || []);
    return list.find(t => String(t.id) === String(id)) || null;
  }
  function info() {
    const D = data(), chars = readStates();
    const P = parties(chars), C = clan(chars);
    P.forEach(p => { p.inClan = C.name ? p.members.filter(m => m.clan === C.name).length : 0; });
    const fortRules = (D.forts && D.forts.rules) || {}, castleRules = (D.castles && D.castles.rules) || {};
    const owners = readJson(path.join(LOGS, 'siege_owners.json'), {}) || {};
    const runs = readJson(path.join(LOGS, 'siege_runs.json'), {}) || {};          // swarm.js: planId -> { status: started|done, at, result }
    return {
      forts: (D.forts && D.forts.forts) || [], castles: (D.castles && D.castles.castles) || [],
      fortMeta: D.forts ? { rules: fortRules, combatFlagItemId: D.forts.combatFlagItemId, notes: D.forts._notes || [], sources: D.forts._sources || [], generated: D.forts._generated || '' } : null,
      castleMeta: D.castles ? { rules: castleRules, notes: D.castles._notes || [], sources: D.castles._sources || [], generated: D.castles._generated || '' } : null,
      plans: plans().map(p => Object.assign({}, p, { run: runs[p.id] || null })), parties: P, clan: C, owners, live: live(),
      registrations: readJson(path.join(LOGS, 'siege_registrations.json'), {}) || {},
      now: new Date().toISOString(), tzOffsetMin: new Date().getTimezoneOffset(),
      tz: (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { return ''; } })(),
    };
  }
  /** POST: save / delete / status. Returns { ok, plans } or { error }. */
  function post(b) {
    const list = plans();
    if (!b || typeof b !== 'object') return { error: 'no body' };
    if (b.action === 'delete') {
      const i = list.findIndex(p => p.id === b.id); if (i < 0) return { error: 'unknown plan ' + b.id };
      list.splice(i, 1); writePlans(list); return { ok: true, plans: list };
    }
    if (b.action === 'status') {
      const p = list.find(x => x.id === b.id); if (!p) return { error: 'unknown plan ' + b.id };
      if (!/^(planned|cancelled|done)$/.test(String(b.status))) return { error: 'status: planned | cancelled | done' };
      p.status = b.status; p.updatedAt = new Date().toISOString(); writePlans(list); return { ok: true, plans: list };
    }
    if (b.action !== 'save') return { error: 'unknown action' };
    const p = b.plan || {};
    const kind = p.kind === 'castle' ? 'castle' : p.kind === 'fort' ? 'fort' : null;
    if (!kind) return { error: 'kind must be fort or castle' };
    const t = targetOf(kind, p.targetId); if (!t) return { error: `unknown ${kind} ${p.targetId}` };
    const at = Date.parse(p.siegeAt); if (!isFinite(at)) return { error: 'siege time missing or invalid' };
    const chars = readStates(), leaders = parties(chars).map(x => x.leader);
    const ps = [...new Set((Array.isArray(p.parties) ? p.parties : []).map(String))].filter(x => leaders.includes(x));
    if (!ps.length) return { error: 'choose at least one party' };
    const cc = ps.includes(String(p.cc || '')) ? String(p.cc) : ps[0];
    const num = (v, d, lo, hi) => { const n = Math.round(+v); return isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
    const stg = p.staging && isFinite(+p.staging.x) && isFinite(+p.staging.y) ? { x: Math.round(+p.staging.x), y: Math.round(+p.staging.y), z: isFinite(+p.staging.z) ? Math.round(+p.staging.z) : (t.staging ? t.staging.z : (t.pos || {}).z), custom: !!p.staging.custom } : (t.staging || null);
    const names = chars.filter(c => ps.includes((typeof c.party === 'string' && c.party) || c.name)).map(c => c.name);
    const pick = (n) => names.includes(String(n || '')) ? String(n) : '';
    const assign = {}; Object.entries(p.assign || {}).forEach(([k, v]) => { if (ps.includes(String(v))) assign[String(k).slice(0, 40)] = String(v); });
    const plan = {
      id: p.id && list.some(x => x.id === p.id) ? p.id : 's' + Date.now(),
      kind, targetId: t.id, targetName: t.name,
      siegeAt: new Date(at).toISOString(), regroupMin: num(p.regroupMin, 30, 5, 240), regroupTown: 'Giran',
      staging: stg, parties: ps, cc,
      roles: { flagCarrier: pick(p.roles && p.roles.flagCarrier), flagBackup: pick(p.roles && p.roles.flagBackup), engraver: kind === 'castle' ? (pick(p.roles && p.roles.engraver) || '') : '' },
      assign, notes: String(p.notes || '').slice(0, 500), enabled: p.enabled !== false, status: 'planned',
      createdAt: (list.find(x => x.id === p.id) || {}).createdAt || new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    const i = list.findIndex(x => x.id === plan.id);
    if (i >= 0) list[i] = plan; else list.push(plan);
    list.sort((a, c) => Date.parse(a.siegeAt) - Date.parse(c.siegeAt));
    writePlans(list);
    return { ok: true, plan, plans: list };
  }
  return { info, post, live, plans };
};
