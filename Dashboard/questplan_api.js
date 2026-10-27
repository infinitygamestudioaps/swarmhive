// QUEST PLAN API (QUESTPLAN-2026-10-27; owner: "you should be able to follow live and see what quest it's on and step etc, even change the
// pathfinding for a specific quest IF it should NOT work"). Served through questpage_api.js (same key check, no server.js hook of its own):
//   GET  /api/quests/plan?id=<id>       { ok, plan, live[] }     the quest's bot plan (Scripts/data/quest_plans/<id>.json, made by
//                                        docs/plan/tools/quest_plan_build.js) + every character running it now (position, plan step, route point, wait)
//   POST /api/quests/plan               body { id, key, override } -> override.steps[key] = override (null = remove)
//                                        body { id, quest: { skip, manual, note } } -> the quest-level switches
//                                        Locked (<file>.lock) + atomic (tmp + rename) + history (Scripts/data/quest_plans/history/<id>_<stamp>.json,
//                                        last 50 per quest), through docs/plan/tools/manual_guard.js. The builder keeps the override section.
//   GET  /api/quests/planstatus         Scripts/data/quest_status.json (counts by status / reason)
// The swarm.js quest engine reads the override at its next step (plan file re-read after 30 s): route = walked as your own route (team walk),
// npcAt = where the NPC stands, area = where to hunt, manual = the engine stops before that step and says so; quest skip = never started.
// Env for tests: SWARM_QUESTPLAN_DIR (plan folder), SWARM_QUESTLIVE_LOGS (fixture Logs: quest_state_* / swarm_state_*).
'use strict';
const fs = require('fs'), path = require('path');
const NAME_RE = /^[A-Za-z0-9_-]{1,32}$/, KEY_RE = /^c\d{1,3}:[a-z]+(?::\d{1,7})?$/;
const dirs = (ctx) => ({ plans: process.env.SWARM_QUESTPLAN_DIR || path.join(ctx.DATA, 'quest_plans'), logs: process.env.SWARM_QUESTLIVE_LOGS || ctx.LOGS, own: !!process.env.SWARM_QUESTLIVE_LOGS });
const readJ = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch (e) { return null; } };
const MG = (ctx) => require(path.join(ctx.ROOT, 'docs', 'plan', 'tools', 'manual_guard.js'));
const fin = (v, lim) => typeof v === 'number' ? isFinite(v) && Math.abs(v) <= lim : typeof v === 'string' && v.trim() !== '' && isFinite(Number(v)) && Math.abs(Number(v)) <= lim;
const P3 = (p) => Array.isArray(p) && p.length >= 2 && fin(p[0], 400000) && fin(p[1], 400000) && (p[2] == null || fin(p[2], 40000)) ? [Math.round(+p[0]), Math.round(+p[1]), Math.round(+(p[2] || 0))] : null;
const txt = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f]/g, ' ').slice(0, n);

/** the owner's input -> a clean step override | { error } */
function cleanStep(o) {
  if (o === null) return null;
  if (!o || typeof o !== 'object') return { error: 'override must be an object or null' };
  const out = {};
  if (o.route != null) {
    if (!Array.isArray(o.route)) return { error: 'route must be a list of [x, y, z]' };
    if (o.route.length > 400) return { error: 'route: at most 400 points' };
    const r = o.route.map(P3); if (r.some(x => !x)) return { error: 'route: every point needs numbers x, y (and z)' };
    if (r.length === 1) return { error: 'route: at least 2 points (or none)' };
    if (r.length) out.route = r;
  }
  if (o.start != null) {
    const s = o.start;
    if (s && s.kind === 'town' && /^[A-Za-z ]{2,30}$/.test(String(s.town || ''))) out.start = { kind: 'town', town: txt(s.town, 30) };
    else if (s && s.kind === 'gk' && s.desc) out.start = { kind: 'gk', from: txt(s.from, 40), desc: txt(s.desc, 80) };
    else if (s !== '' && s !== false) return { error: 'start must be { kind: "town", town } or { kind: "gk", from, desc }' };
  }
  if (o.npcAt != null) { const p = P3(o.npcAt); if (!p) return { error: 'npcAt must be [x, y, z]' }; out.npcAt = p; }
  if (o.area != null) {
    const p = o.area && P3(o.area.at); if (!p) return { error: 'area.at must be [x, y, z]' };
    const r = Number(o.area.radius || 1500); if (!(r >= 100 && r <= 10000)) return { error: 'area.radius must be 100 - 10000' };
    out.area = { at: p, radius: Math.round(r), name: txt(o.area.name || 'my hunting place', 80) };
  }
  if (o.manual) out.manual = true;
  if (o.note) out.note = txt(o.note, 300);
  if (Array.isArray(o.fixed)) out.fixed = o.fixed.map(x => txt(x, 40)).filter(x => /^[a-z-]{3,40}$/.test(x)).slice(0, 20);
  return out;
}
function planFile(ctx, id) { const n = Number(id); return Number.isInteger(n) && n > 0 && n < 1e6 ? path.join(dirs(ctx).plans, n + '.json') : ''; }

/** POST: one change under the lock, history first -> { code, body } */
function save(ctx, b) {
  const f = planFile(ctx, b && b.id); if (!f) return { code: 400, body: { error: 'bad quest id' } };
  if (!fs.existsSync(f)) return { code: 404, body: { error: 'no plan for quest ' + b.id + ' — run node docs/plan/tools/quest_plan_build.js' } };
  let stepOv; const isStep = b.key !== undefined;
  if (isStep) { if (!KEY_RE.test(String(b.key))) return { code: 400, body: { error: 'bad step key' } }; stepOv = cleanStep(b.override); if (stepOv && stepOv.error) return { code: 400, body: stepOv }; }
  else if (!b.quest || typeof b.quest !== 'object') return { code: 400, body: { error: 'key + override, or quest { skip, manual, note }' } };
  const mg = MG(ctx), by = txt(b.by || 'dashboard', 40), at = new Date().toISOString();
  try {
    const plan = mg.withLock(f, () => {
      const p = readJ(f); if (!p) throw new Error('plan file unreadable');
      if (isStep && !(p.steps || []).some(s => s.key === b.key)) { const e = new Error('no step ' + b.key + ' in quest ' + b.id); e.code = 404; throw e; }
      if (b.base && p.override && p.override.editedAt && b.base !== p.override.editedAt) { const e = new Error('changed meanwhile (' + p.override.editedAt + ' by ' + (p.override.by || '?') + ') — reload'); e.code = 409; throw e; }
      mg.saveHistory(f, dirs(ctx).plans, 50);
      const ov = p.override = Object.assign({ steps: {} }, p.override || {}); ov.steps = ov.steps || {};
      if (isStep) { if (stepOv === null || !Object.keys(stepOv).length) delete ov.steps[b.key]; else ov.steps[b.key] = Object.assign(stepOv, { editedAt: at, by }); }
      else { const q = b.quest; ['skip', 'manual'].forEach(k => { if (q[k] !== undefined) { if (q[k]) ov[k] = true; else delete ov[k]; } }); if (q.note !== undefined) { if (q.note) ov.note = txt(q.note, 300); else delete ov.note; } }
      ov.editedAt = at; ov.by = by;
      mg.atomicWrite(f, JSON.stringify(p, null, 1));
      return p;
    }, { who: 'questplan_api' });
    try { fs.appendFileSync(path.join(ctx.LOGS, 'questplan_edits.log'), `${at} ${by} quest ${b.id} ${isStep ? 'step ' + b.key + ' ' + JSON.stringify(stepOv) : 'quest ' + JSON.stringify(b.quest)}\n`); } catch (e) { }
    return { code: 200, body: { ok: true, override: plan.override, note: 'saved — the bots use it at their next step; the status updates at the next quest_plan_build.js run' } };
  } catch (e) { return { code: e.code === 404 ? 404 : e.code === 409 ? 409 : /locked/.test(e.message) ? 423 : 500, body: { error: e.message } }; }
}

/** every character running quest id: position + the engine's plan line (quest_state active.plan, swarm_state doing.quest.plan = fresher) */
function liveOf(ctx, id) {
  const D = dirs(ctx), out = [], byName = {};
  let st = [];
  if (D.own) { try { fs.readdirSync(D.logs).forEach(f => { if (/^swarm_state_[A-Za-z0-9_-]+\.json$/.test(f)) { const s = readJ(path.join(D.logs, f)); if (s && s.name) { s.ageSec = Math.round((Date.now() - Date.parse(s.updated || 0)) / 1000); st.push(s); } } }); } catch (e) { } }
  else { try { st = ctx.readStates ? ctx.readStates() : []; } catch (e) { st = []; } }
  st.forEach(s => { if (s && s.name) byName[s.name] = s; });
  let files = []; try { files = fs.readdirSync(D.logs); } catch (e) { }
  files.forEach(f => {
    const m = f.match(/^quest_state_([A-Za-z0-9_-]+)\.json$/); if (!m || !NAME_RE.test(m[1])) return;
    const q = readJ(path.join(D.logs, f)), a = q && q.active; if (!a || Number(a.id) !== Number(id)) return;
    if (/^(done|failed|stopped|cannot)$/.test(String(a.phase || '')) && Date.now() - Date.parse(a.phaseAt || 0) > 3600e3) return;
    const s = byName[m[1]] || {}, dq = s.doing && s.doing.quest, pl = Object.assign({}, a.plan || {}, (dq && Number(dq.id) === Number(id) && dq.plan) || {});
    out.push({ name: m[1], x: isFinite(s.x) ? Math.round(s.x) : null, y: isFinite(s.y) ? Math.round(s.y) : null, online: s.ageSec != null && s.ageSec <= 60, phase: a.phase || '', step: String(a.step || '').slice(0, 200),
      cond: a.cond == null ? null : a.cond, stepI: pl.i == null ? null : pl.i, stepKey: pl.key || '', stepText: pl.text || '', routeI: pl.routeI || null, routeN: pl.routeN || null, src: pl.src || '', waitWhy: pl.waitWhy || (a.phase === 'wait' ? String(a.step || '') : ''),
      target: a.target || null, ended: /^(done|failed|stopped|cannot)$/.test(String(a.phase || '')), msg: String(a.msg || '').slice(0, 200) });
  });
  return out.sort((x, y) => x.name.localeCompare(y.name));
}
async function readBody(req, ctx) { if (ctx.body) return ctx.body(req); let b = ''; for await (const c of req) b += c; return JSON.parse(b || '{}'); }
/** called by questpage_api.js after its key check */
async function handle(req, res, url, ctx) {
  const p = url.pathname;
  if (p === '/api/quests/planstatus') { const j = readJ(path.join(ctx.DATA, 'quest_status.json')); ctx.json(res, j ? 200 : 404, j ? Object.assign({ ok: true }, j) : { error: 'run node docs/plan/tools/quest_plan_build.js' }); return true; }
  if (p !== '/api/quests/plan') return false;
  if (req.method === 'POST') { let b; try { b = await readBody(req, ctx); } catch (e) { ctx.json(res, 400, { error: 'bad JSON' }); return true; } const r = save(ctx, b || {}); ctx.json(res, r.code, r.body); return true; }
  const id = url.searchParams.get('id'), f = planFile(ctx, id);
  if (!f) { ctx.json(res, 400, { error: 'bad quest id' }); return true; }
  const plan = readJ(f);
  if (!plan) { ctx.json(res, 404, { error: 'no plan for quest ' + id + ' — run node docs/plan/tools/quest_plan_build.js' }); return true; }
  ctx.json(res, 200, { ok: true, plan, live: liveOf(ctx, id) });
  return true;
}
module.exports = { handle, save, cleanStep, liveOf };
