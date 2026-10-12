// SOUL CRYSTAL STAGE PLAN API (2026-10-12, forum topic 503 + L2J H5 levelUpCrystalData.xml; data Scripts/data/soul_crystals.json). READ-ONLY.
// Loaded by server.js (one hook before the key check, like addaccount_api.js). Public (no secrets): /soullogic.js, /soulplan.js, /soulplan.css.
//   GET /api/soulstageplan                       { generated, chars: [{ name, level, healer, crystal, target, from, to, color, plan }] }
//        one entry per character with a live report (Logs/soul_<name>.json, written by swarm.js every minute) that has a crystal or a target.
//   GET /api/soulstageplan?color=red&from=0&to=13&level=52&healer=0   one plan for any crystal (the "Custom" form).
// The plan comes from Dashboard/soullogic.js soulStagePlan (the same SOULLOGIC block the bots run after scratchpad patch_soulcrystal.js).
'use strict';
const fs = require('fs'), path = require('path');
const SL = require('./soullogic.js');
const STATIC = { '/soullogic.js': 'application/javascript; charset=utf-8', '/soulplan.js': 'application/javascript; charset=utf-8', '/soulplan.css': 'text/css; charset=utf-8' };
const COLORS = ['red', 'green', 'blue'];
const DC = { file: '', mtime: 0, data: null };
function data(ctx) {
  const F = ctx.soulDataFile || path.join(ctx.DATA, 'soul_crystals.json');
  let st = null; try { st = fs.statSync(F); } catch (e) { return null; }
  if (DC.data && DC.file === F && DC.mtime === st.mtimeMs) return DC.data;
  try { DC.data = JSON.parse(fs.readFileSync(F, 'utf8').replace(/^﻿/, '')); DC.file = F; DC.mtime = st.mtimeMs; } catch (e) { return null; }
  return DC.data;
}
const int = (v, d, lo, hi) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
/** every live report Logs/soul_<name>.json (not soul_q350_* / soul_gideon_*) */
function liveReports(ctx) {
  const out = [];
  let files = []; try { files = fs.readdirSync(ctx.LOGS); } catch (e) { return out; }
  files.filter(f => /^soul_[A-Za-z0-9_-]+\.json$/.test(f)).forEach(f => {
    try { const j = JSON.parse(fs.readFileSync(path.join(ctx.LOGS, f), 'utf8').replace(/^﻿/, '')); if (j && j.name) out.push(j); } catch (e) { }
  });
  return out;
}
/** healer per character: the live report (after patch_soulcrystal) or Scripts/data/soul_targets.json role */
function healerOf(ctx, name, live) {
  if (live && typeof live.healer === 'boolean') return live.healer;
  try { const t = JSON.parse(fs.readFileSync(path.join(ctx.DATA, 'soul_targets.json'), 'utf8')); const c = t.chars && t.chars[name]; return !!(c && c.role === 'healer'); } catch (e) { return false; }
}
/** one character's plan: from = its crystal (or 0), to = its target stage (or from + 1); colour = crystal > target */
function charPlan(d, j, healer) {
  const cr = (j.crystals || [])[0] || null, tg = j.target || null;
  const color = (cr && cr.color) || (tg && tg.color) || '';
  const from = cr ? Number(cr.stage) || 0 : 0;
  const to = tg && Number(tg.stage) > from ? Number(tg.stage) : Math.min(18, from + 1);
  const plan = color ? SL.soulStagePlan(d, { color, from, to, level: Number(j.level) || 0, healer, maxMobs: 3, maxBosses: 4 }) : null;
  return { name: j.name, at: j.at || null, level: Number(j.level) || 0, healer, crystal: cr ? { color: cr.color, stage: Number(cr.stage), count: cr.count || 1 } : null,
    crystals: (j.crystals || []).length, target: tg ? { sa: tg.sa || '', weapon: tg.weapon || '', grade: tg.grade || '', stage: Number(tg.stage) || 0, color: tg.color || '' } : null,
    levelOn: j.levelOn !== false, on: j.on !== false, quest350: j.quest350 === undefined ? null : j.quest350, why: j.why || '', color, from, to, plan };
}
async function handle(req, res, url, ctx) {
  const p = url.pathname;
  if (STATIC[p]) { try { ctx.send(res, 200, STATIC[p], fs.readFileSync(path.join(ctx.DIR, p.slice(1)))); } catch (e) { ctx.send(res, 404, 'text/plain; charset=utf-8', 'missing ' + p); } return true; }
  if (p !== '/api/soulstageplan') return false;
  if (ctx.allowed && !ctx.allowed(req, url)) { ctx.json(res, 401, { error: 'key' }); return true; }
  if (req.method !== 'GET') { ctx.json(res, 405, { error: 'GET only (read-only)' }); return true; }
  const d = data(ctx);
  if (!d) { ctx.json(res, 200, { error: 'Scripts/data/soul_crystals.json is missing or broken' }); return true; }
  const q = url.searchParams;
  if (q.get('color')) {
    const color = String(q.get('color')).toLowerCase();
    if (!COLORS.includes(color)) { ctx.json(res, 400, { error: 'color = red | green | blue' }); return true; }
    const from = int(q.get('from'), 0, 0, 17), to = int(q.get('to'), from + 1, from + 1, 18);
    const plan = SL.soulStagePlan(d, { color, from, to, level: int(q.get('level'), 0, 0, 99), healer: q.get('healer') === '1', maxMobs: 4, maxBosses: 5 });
    ctx.json(res, 200, { generated: new Date().toISOString(), plan }); return true;
  }
  const chars = liveReports(ctx).map(j => charPlan(d, j, healerOf(ctx, j.name, j)))
    .filter(c => c.crystal || c.target).sort((a, b) => (b.level - a.level) || a.name.localeCompare(b.name));
  ctx.json(res, 200, { generated: new Date().toISOString(), source: 'soul_crystals.json (DATAPACK levelUpCrystalData.xml + forum topic 503)', chars });
  return true;
}
module.exports = { handle, charPlan, liveReports };
