// PARTY PLAN API (owner 2026-10-13: "make a plan for a character and choose e.g. quests along the way ... a lovely way to do it").
// Loaded by server.js with one hook (like runstate_api.js). The page files are public (no secrets), the API checks the key itself:
//   /partyplan.js, /partyplan.css, /planlogic.js
//   GET  /api/partyplans               { ok, rev, exists, broken, file, parties: [{ leader, members, plan, progress, line, runOn }], templates, towns }
//   GET  /api/partyplans/options       { ok, raids, zones, datapack, dungeons, regions } — the pickers of the step editor (raid bosses from
//                                      raidbosses_h5.json; hunting places = the same choices as the Parties tab spot picker: custom_zones.json,
//                                      hunting_spots_h5.json, dungeon_rooms.json, field_areas.json; cached by file time)
//   POST /api/partyplans { action, rev, by, ... }   lock + rev check (409 when the file changed since the page loaded it) + a history copy
//        (Scripts/data/history/party_plans_<time>.json, last 50) + atomic tmp + rename (docs/plan/tools/manual_guard.js) + one line in
//        Logs/dashboard_commands.log:
//     set            { party, plan }                        the party's plan (normalised by Dashboard/planlogic.js normPlan)
//     use            { party, on }                          "Use this plan when I press Start"
//     clear          { party }                              remove the party's plan
//     saveTemplate   { name, steps, note }                  a named template (id = slug of the name; same name = replaced)
//     deleteTemplate { id }
//     apply          { parties: [leader...], steps | template, name, on }   the same plan for several parties (named characters that are
//                    not in a party are dropped: PlanLogic.applySteps) — each party's progress starts again at step 1
//     control        { party, cmd: start|next|stop|restart|goto, n }   NO file write: sends "!plan <cmd>" to the party (commandRun)
// Files: Scripts/data/party_plans.json (env SWARM_PARTYPLANS_FILE), progress Logs/plan_progress_<leader>.json (env SWARM_PLANPROGRESS_DIR;
// written ONLY by the leader's swarm.js window; read here).
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const PL = require('./planlogic');
const STATIC = { '/partyplan.js': 'application/javascript; charset=utf-8', '/partyplan.css': 'text/css; charset=utf-8', '/planlogic.js': 'application/javascript; charset=utf-8' };
const NAME_RE = /^[A-Za-z0-9_\-]{1,40}$/;
let G = null;
function guard(ctx) { if (!G) G = require(path.join(ctx.ROOT || path.join(__dirname, '..'), 'docs', 'plan', 'tools', 'manual_guard.js')); return G; }
const fileOf = (ctx) => process.env.SWARM_PARTYPLANS_FILE || (ctx && ctx.plansFile) || path.join(ctx.DATA, 'party_plans.json');
const progDir = (ctx) => process.env.SWARM_PLANPROGRESS_DIR || ctx.LOGS;
const sha = (t) => (t ? crypto.createHash('sha1').update(t).digest('hex').slice(0, 16) : '');
const isoNow = () => new Date().toISOString();
const rj = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch (e) { return d; } };

function readPlans(ctx) {
  const F = fileOf(ctx); let raw = '';
  try { raw = fs.readFileSync(F, 'utf8'); } catch (e) { }
  if (!raw.trim()) return { raw, rev: sha(raw), data: PL.normFile({}), exists: !!raw };
  try { return { raw, rev: sha(raw), data: PL.normFile(JSON.parse(raw.replace(/^﻿/, ''))), exists: true }; }
  catch (e) { return { raw, rev: sha(raw), data: null, broken: e.message, exists: true }; }
}
function readProgress(ctx, leader) { if (!NAME_RE.test(String(leader || ''))) return null; return rj(path.join(progDir(ctx), `plan_progress_${leader}.json`), null); }

// ---- quests (names / rewards for the sentences) — Dashboard/questpage_api.js listRows (cached there)
function questMap(ctx) {
  try { const Q = require('./questpage_api'); const rows = Q.listRows({ DATA: ctx.DATA, LOGS: ctx.LOGS, DIR: ctx.DIR || __dirname }) || []; const m = {}; rows.forEach(r => { m[r.id] = r; }); return m; }
  catch (e) { return {}; }
}
let RAIDS = null, RAIDS_AT = 0;
function raids(ctx) {
  const f = path.join(ctx.DATA, 'raidbosses_h5.json'); let st = 0; try { st = fs.statSync(f).mtimeMs; } catch (e) { }
  if (!RAIDS || st !== RAIDS_AT) {
    const j = rj(f, []); const a = Array.isArray(j) ? j : (j && j.bosses) || Object.values(j || {});
    RAIDS = a.filter(b => b && b.id && b.name && (b.type || 'raid') === 'raid').map(b => ({ id: Number(b.id), name: String(b.name), level: Number(b.level) || null, where: (b.nearestTeleport && b.nearestTeleport.desc) || b.zoneName || '' }))
      .sort((x, y) => (x.level || 0) - (y.level || 0) || x.name.localeCompare(y.name));
    RAIDS_AT = st;
  }
  return RAIDS;
}

// ---- parties (leader -> members) + who is who (level / class / race / class plan) for the builder's checks
const OPT = { key: '', v: null };
function mt(f) { try { const s = fs.statSync(f); return s.mtimeMs + ':' + s.size; } catch (e) { return '0'; } }
function options(ctx) {
  const F = ['custom_zones.json', 'hunting_spots_h5.json', 'dungeon_rooms.json', 'field_areas.json'].map(n => path.join(ctx.DATA, n));
  const key = F.map(mt).join('|');
  if (OPT.v && OPT.key === key) return Object.assign({ raids: raids(ctx) }, OPT.v);
  const rd = (f, d) => (ctx.readJson ? ctx.readJson(f, d) : rj(f, d));
  const zones = (rd(F[0], []) || []).filter(z => z && z.name).map(z => ({ name: z.name, levelMin: z.levelMin, levelMax: z.levelMax, enabled: z.enabled !== false,
    teams: Array.isArray(z.teams) ? z.teams : (z.team ? [z.team] : ['all']), via: z.gkDesc || (z.travel && z.travel.town ? z.travel.town : ''), kind: z.rooms ? 'rooms' : z.dungeon ? 'dungeon' : 'outdoor' }));
  const datapack = (rd(F[1], []) || []).filter(s => s && s.name && s.gk && String(s.gk.desc || '').includes('->'))
    .map(s => ({ name: s.name, levelMin: s.levelMin, levelMax: s.levelMax, via: s.gk.desc, mobs: (s.mobs || []).reduce((n, m) => n + (m.count || 0), 0) }));
  const dungeons = (rd(F[2], []) || []).map(d => ({ name: d.name, levelRange: d.levelRange || null, catacomb: !!d.catacomb, rooms: (d.floors || []).reduce((n, Fl) => n + (Fl.rooms || []).length, 0) }));
  const regions = (((rd(F[3], null) || {}).regions) || []).map(R => ({ id: R.id, name: R.name, levelRange: R.levelRange || null,
    areaIds: (R.areas || []).filter(a => a.reachable).map(a => a.id).slice(0, 40), landing: (R.landings && R.landings[0] && R.landings[0].desc) || '' })).filter(R => R.areaIds.length);
  OPT.key = key; OPT.v = { zones, datapack, dungeons, regions };
  return Object.assign({ raids: raids(ctx) }, OPT.v);
}
function partyList(ctx) { try { return require('./kamapage_api').partyList(ctx); } catch (e) { return []; } }
function memberInfo(ctx) {
  const out = {}; let cp = null;
  try { cp = require('./classpage_api').info(ctx); } catch (e) { cp = null; }
  let Q = null; try { Q = require('./questpage_api'); } catch (e) { }
  (ctx.readStates ? ctx.readStates() : []).forEach(s => {
    const classId = s.classId !== undefined && s.classId !== null && s.classId !== '' ? Number(s.classId) : null;
    out[s.name] = { name: s.name, level: Number(s.level) || 0, classId, cls: s.cls || '', online: s.ageSec != null && s.ageSec <= 60,
      race: Q && classId != null ? Q.raceOf(classId) : '', classEnum: Q && classId != null ? (Q.CLASS_ENUM[classId] || '') : '' };
  });
  ((cp && cp.parties) || []).forEach(p => (p.members || []).forEach(m => {
    const o = out[m.name] = out[m.name] || { name: m.name, level: Number(m.level) || 0, classId: m.classId, cls: m.cls || '', online: !!m.online, race: Q && m.classId != null ? Q.raceOf(m.classId) : '', classEnum: Q && m.classId != null ? (Q.CLASS_ENUM[m.classId] || '') : '' };
    o.cp = { status: m.status, text: m.text, why: m.why, nextName: m.nextName || '', needLevel: m.needLevel || null };
  }));
  return out;
}
function runOnOf(ctx, leader) {
  try { const R = require('./runstate_api'); const s = R.readState(ctx); return s.data ? !!R.runEffective(s.data, leader, leader).on : false; } catch (e) { return false; }
}

/** GET /api/partyplans */
function info(ctx) {
  const P = readPlans(ctx), D = P.data || PL.normFile({}), Qm = questMap(ctx), MI = memberInfo(ctx);
  const plist = partyList(ctx);
  Object.keys(D.parties).forEach(l => { if (!plist.some(p => p.leader === l)) plist.push({ leader: l, names: [l] }); });
  const parties = plist.map(({ leader, names }) => {
    const plan = D.parties[leader] || null, prog = readProgress(ctx, leader), on = runOnOf(ctx, leader);
    const members = names.map(n => MI[n] || { name: n, level: 0 });
    const ctxS = { quests: Qm, members: names };
    const idx = plan ? PL.planCursor(plan, prog) : 0;
    return { leader, members, plan, progress: prog, runOn: on, idx, line: plan ? PL.progressLine(plan, prog, ctxS, on) : null,
      steps: plan ? plan.steps.map(s => PL.stepText(s, ctxS)) : [] };
  });
  const templates = Object.keys(D.templates).map(id => Object.assign({ id }, D.templates[id], { sentence: PL.planSentence(D.templates[id], { quests: Qm }, 2) }));
  return { ok: true, file: path.basename(fileOf(ctx)), exists: !!P.exists, rev: P.rev, broken: P.broken || null, parties, templates, towns: PL.TOWNS };
}
/** the party card line for /api/state (cheap: no class plans) -> { <leader>: { name, on, n, idx, status, line } } */
function summary(ctx, chars) {
  const P = readPlans(ctx); if (!P.data) return {};
  const out = {}, leaders = Object.keys(P.data.parties); if (!leaders.length) return out;
  const Qm = questMap(ctx);
  leaders.forEach(l => {
    const plan = P.data.parties[l]; if (!plan || !plan.steps.length) return;
    const prog = readProgress(ctx, l), on = runOnOf(ctx, l), idx = PL.planCursor(plan, prog);
    out[l] = { name: plan.name, on: plan.on, n: plan.steps.length, idx, status: (prog && prog.status) || 'idle', why: (prog && prog.why) || '', line: PL.progressLine(plan, prog, { quests: Qm }, on) };
  });
  return out;
}

// ---- writes
function bad(code, error, extra) { return Object.assign({ code, error }, extra || {}); }
function write(ctx, b, label, fn) {
  const F = fileOf(ctx), Gd = guard(ctx);
  fs.mkdirSync(path.dirname(F), { recursive: true });
  let result = null;
  try {
    Gd.withLock(F, () => {
      const P = readPlans(ctx);
      if (P.broken) { result = bad(500, `${path.basename(F)} does not parse (${P.broken}) — fix it or restore it from Scripts/data/history/ first`); return; }
      if (b.rev !== undefined && b.rev !== null && String(b.rev) !== P.rev) { result = bad(409, 'the plans were changed meanwhile (another page or phone) — reload and try again', { rev: P.rev }); return; }
      const r = fn(P.data);
      if (r && r.code && r.code !== 200) { result = r; return; }
      const hist = P.exists && P.raw.trim() ? Gd.saveHistory(F, path.dirname(F), 50) : null;
      P.data._about = 'PARTY PLANS — the steps each party follows when it is started (dashboard: 📋 Plan on the party card). Written only by the dashboard (Dashboard/partyplan_api.js); read live by swarm.js (PLAN block). Progress: Logs/plan_progress_<leader>.json.';
      P.data._updated = isoNow();
      const txt = JSON.stringify(P.data, null, 1) + '\n';
      Gd.atomicWrite(F, txt);
      try { fs.appendFileSync(path.join(ctx.LOGS, 'dashboard_commands.log'), `${isoNow()}\tpartyplans\t${label}\t${String(b.by || 'dashboard').slice(0, 40)}\r\n`); } catch (e) { }
      result = Object.assign({ code: 200, ok: true, rev: sha(txt), history: hist ? path.basename(hist) : null }, r || {});
    }, { who: 'partyplans ' + label });
  } catch (e) { return bad(500, e.message); }
  return result;
}
async function post(ctx, b) {
  if (!b || typeof b !== 'object') return bad(400, 'bad body');
  const a = String(b.action || ''), by = String(b.by || 'dashboard').slice(0, 40), at = isoNow();
  const plist = partyList(ctx), membersOf = (l) => { const p = plist.find(x => x.leader === l); return p ? p.names : [l]; };
  const party = String(b.party || '');
  const needParty = () => (!NAME_RE.test(party) || party.startsWith('_')) ? bad(400, 'party (leader name) required') : null;
  if (a === 'set') {
    const e = needParty(); if (e) return e;
    if (!b.plan || typeof b.plan !== 'object') return bad(400, 'plan required');
    const plan = PL.normPlan(Object.assign({}, b.plan, { at, by }));
    if (Array.isArray(b.plan.steps) && b.plan.steps.length && !plan.steps.length) return bad(400, 'none of the steps is valid');
    return write(ctx, b, `set ${party} (${plan.steps.length} steps, ${plan.on ? 'used on Start' : 'not used'})`, (D) => { D.parties[party] = plan; return { plan }; });
  }
  if (a === 'use') {
    const e = needParty(); if (e) return e;
    if (typeof b.on !== 'boolean') return bad(400, 'on (true / false) required');
    return write(ctx, b, `use ${party} ${b.on ? 'ON' : 'OFF'}`, (D) => { const p = D.parties[party]; if (!p) return bad(404, `party ${party} has no plan`); p.on = b.on; p.at = at; p.by = by; return { plan: p }; });
  }
  if (a === 'clear') {
    const e = needParty(); if (e) return e;
    return write(ctx, b, `clear ${party}`, (D) => { if (!D.parties[party]) return bad(404, `party ${party} has no plan`); delete D.parties[party]; return {}; });
  }
  if (a === 'saveTemplate') {
    const name = String(b.name || '').replace(/[<>\r\n]/g, '').trim().slice(0, 60); if (!name) return bad(400, 'name required');
    const steps = PL.normSteps(b.steps); if (!steps.length) return bad(400, 'a template needs at least one step');
    const id = PL.slug(name);
    return write(ctx, b, `template ${id} (${steps.length} steps)`, (D) => { D.templates[id] = { name, steps, note: String(b.note || '').slice(0, 200), at, by }; return { id }; });
  }
  if (a === 'deleteTemplate') {
    const id = String(b.id || ''); if (!/^[a-z0-9-]{1,40}$/.test(id)) return bad(400, 'id required');
    return write(ctx, b, `delete template ${id}`, (D) => { if (!D.templates[id]) return bad(404, 'no such template'); delete D.templates[id]; return {}; });
  }
  if (a === 'apply') {
    const ps = (Array.isArray(b.parties) ? b.parties : []).map(String).filter(p => NAME_RE.test(p) && !p.startsWith('_'));
    if (!ps.length) return bad(400, 'parties required');
    return write(ctx, b, `apply to ${ps.join(', ')}`, (D) => {
      let src = Array.isArray(b.steps) ? b.steps : null, name = String(b.name || '').slice(0, 60), tid = '';
      if (!src && b.template) { const t = D.templates[String(b.template)]; if (!t) return bad(404, 'no such template'); src = t.steps; name = name || t.name; tid = String(b.template); }
      if (!src || !src.length) return bad(400, 'steps or template required');
      const res = {};
      ps.forEach(p => { const r = PL.applySteps(src, membersOf(p)); D.parties[p] = PL.normPlan({ name: name || 'My plan', on: b.on === true, steps: r.steps, at, by, template: tid }); res[p] = { steps: r.steps.length, dropped: r.dropped }; });
      return { applied: res };
    });
  }
  if (a === 'control') {
    const e = needParty(); if (e) return e;
    const cmd = String(b.cmd || '');
    if (!/^(start|next|stop|restart|goto)$/.test(cmd)) return bad(400, 'cmd: start | next | stop | restart | goto');
    const n = cmd === 'goto' ? Math.round(Number(b.n)) : null;
    if (cmd === 'goto' && !(n >= 1 && n <= PL.MAX_STEPS)) return bad(400, 'n (step number) required');
    const text = `!plan ${cmd}${n ? ' ' + n : ''}`;
    if (!ctx.commandRun) return bad(500, 'no command channel');
    try {
      const x = await ctx.commandRun({ cmd: text, target: 'party:' + party, by: 'partyplan' });
      const err = x && x.body && x.body.error;
      try { fs.appendFileSync(path.join(ctx.LOGS, 'dashboard_commands.log'), `${isoNow()}\tpartyplans\tcontrol ${party} ${text}${err ? ' ERROR ' + err : ''}\t${by}\r\n`); } catch (er) { }
      return err ? bad((x && x.code) || 500, err) : { code: 200, ok: true, sent: text };
    } catch (er) { return bad(500, er.message); }
  }
  return bad(400, 'unknown action (set | use | clear | saveTemplate | deleteTemplate | apply | control)');
}

async function handle(req, res, url, ctx) {
  const p = url.pathname;
  if (STATIC[p]) {
    let body; try { body = fs.readFileSync(path.join(ctx.DIR || __dirname, path.basename(p))); } catch (e) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('not found'); return true; }
    res.writeHead(200, { 'Content-Type': STATIC[p], 'Cache-Control': 'no-cache' }); res.end(body); return true;
  }
  if (p !== '/api/partyplans' && p !== '/api/partyplans/options') return false;
  if (!ctx.allowed(req, url)) { ctx.send(res, 401, 'text/plain; charset=utf-8', 'Access denied'); return true; }
  if (p === '/api/partyplans/options') { try { ctx.json(res, 200, Object.assign({ ok: true }, options(ctx))); } catch (e) { ctx.json(res, 500, { error: e.message }); } return true; }
  if (req.method === 'GET') { try { ctx.json(res, 200, info(ctx)); } catch (e) { ctx.json(res, 500, { error: e.message }); } return true; }
  if (req.method !== 'POST') { ctx.json(res, 405, { error: 'GET or POST' }); return true; }
  let b = {}; try { let t = ''; for await (const c of req) t += c; b = JSON.parse(t || '{}'); } catch (e) { ctx.json(res, 400, { error: 'bad JSON' }); return true; }
  try { const r = await post(ctx, b) || bad(500, 'no result'); const code = r.code || 200; delete r.code; ctx.json(res, code, r); } catch (e) { ctx.json(res, 500, { error: e.message }); }
  return true;
}
module.exports = { handle, info, summary, post, readPlans, readProgress, fileOf, raids, options, STATIC };
