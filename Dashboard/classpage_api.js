// CLASS PLANS API (user 2026-10-10: "Every single class should have a plan, and it should be configurable from the user per party! It should
// never upgrade without asking. Or at least show that there is no plan for them ... They should be able to create group templates").
// Loaded by server.js (one hook, like kamapage_api.js). Public (no secrets): /classpage.js, /classpage.css, /classlogic.js.
//   GET  /api/classtree               Scripts/data/class_tree.json (every class: parent / children / race / tier / change level / role / names)
//   GET  /api/classplans              every party of swarm.config.json (party = its leader's name) with its members: current class + level,
//                                     the plan, its status (Dashboard/classlogic.js cpDecide = the swarm.js gate), what the bot itself
//                                     reports (swarm_state.classPlan), a SUGGESTION (swarm.config.json classPlan / class_tree roleSuggestions,
//                                     never approved by itself), the templates (the file's own + the shipped examples) and the counts for the badges
//   POST /api/classplans { action, rev, ... }   set | approve | unapprove | clear | copyClass | saveTemplate | deleteTemplate | applyTemplate
//                                     every write: validated against class_tree.json (no invalid jumps, the character's current class must be on
//                                     the plan), APPROVING needs confirm: true (the page asks first), lock + rev check (409 when the file changed
//                                     since the page loaded it), a history copy (history/class_plans_<time>.json next to the file, last 50),
//                                     atomic tmp + rename (docs/plan/tools/manual_guard.js), one line in Logs/dashboard_commands.log.
// File: Scripts/data/class_plans.json (env SWARM_CLASSPLANS_FILE overrides it: the tests use a scratch copy). swarm.js reads it live (10 s).
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const CL = require('./classlogic');
const STATIC = { '/classpage.js': 'application/javascript; charset=utf-8', '/classpage.css': 'text/css; charset=utf-8', '/classlogic.js': 'application/javascript; charset=utf-8' };
const WARN = ['missing', 'needs-approval', 'invalid', 'off-plan', 'ambiguous'];

let G = null;
function guard(ctx) { if (!G) G = require(path.join(ctx.ROOT, 'docs', 'plan', 'tools', 'manual_guard.js')); return G; }
const plansFile = (ctx) => process.env.SWARM_CLASSPLANS_FILE || ctx.plansFile || path.join(ctx.DATA, 'class_plans.json');
const sha = (t) => t ? crypto.createHash('sha1').update(t).digest('hex').slice(0, 16) : '';
let TREE = null, treeStamp = '';
function tree(ctx) {
  const f = path.join(ctx.DATA, 'class_tree.json');
  let st = ''; try { st = String(fs.statSync(f).mtimeMs); } catch (e) { }
  if (!TREE || st !== treeStamp) { TREE = ctx.readJson(f, null); treeStamp = st; }
  return TREE;
}
function readPlans(ctx) {
  const F = plansFile(ctx);
  let raw = ''; try { raw = fs.readFileSync(F, 'utf8'); } catch (e) { }
  let data = null; try { data = raw ? JSON.parse(raw.replace(/^﻿/, '')) : null; } catch (e) { return { raw, rev: sha(raw), data: null, broken: e.message }; }
  if (!data || typeof data !== 'object') data = {};
  if (!data.parties || typeof data.parties !== 'object') data.parties = {};
  if (!data.templates || typeof data.templates !== 'object') data.templates = {};
  if (!data.version) data.version = 1;
  return { raw, rev: sha(raw), data, exists: !!raw };
}
function exampleTemplates(ctx) { const ex = ctx.readJson(path.join(ctx.DATA, 'class_plans.example.json'), null); return ex && ex.templates ? ex.templates : {}; }
function cfgFresh(ctx) {
  try { return JSON.parse(fs.readFileSync(path.join(ctx.LOGS, '..', 'swarm.config.json'), 'utf8').replace(/^﻿/, '')); } catch (e) { }
  try { return ctx.reloadCfg() || {}; } catch (e) { return {}; }
}
/** parties in config order (main leader first) — the same list as the Kamaloka page (kamapage_api.partyList) */
function parties(ctx) { return require('./kamapage_api').partyList(ctx); }

/** a suggestion for one character (never approved): swarm.config.json classPlan names, else the role's path from class_tree roleSuggestions
 *  that fits the character's current class */
function suggestion(T, acc, classId) {
  const c = CL.cpClass(T, classId), root = c ? c.root : null;
  if (acc && Array.isArray(acc.classPlan) && acc.classPlan.length) {
    const r = CL.cpPlanFromNames(T, acc.classPlan.map(String), root);
    if (r.plan && (classId == null || CL.cpFits(T, r.plan, classId))) return { plan: r.plan, source: 'swarm.config.json classPlan' };
  }
  const paths = (T.roleSuggestions || {})[acc && acc.role] || [];
  const fit = paths.find(p => classId != null && CL.cpFits(T, p, classId));
  if (fit) return { plan: fit.slice(), source: `role ${acc.role}` };
  return null;
}

function info(ctx) {
  const T = tree(ctx);
  if (!T) return { error: 'Scripts/data/class_tree.json is missing — run node docs/plan/tools/class_tree.js' };
  const P = readPlans(ctx);
  const plans = P.data || { parties: {}, templates: {} };
  const cfg = cfgFresh(ctx);
  const accOf = {}; (cfg.accounts || []).forEach(a => { if (a && a.character && a.enabled !== false) accOf[a.character] = a; });
  const states = {}; (ctx.readStates() || []).forEach(s => { states[s.name] = s; });
  const out = { file: path.basename(plansFile(ctx)), exists: !!P.exists, rev: P.rev, broken: P.broken || null, levels: T.meta.levels, fee: T.meta.fee, parties: [], counts: { warn: 0, missing: 0, approval: 0, problem: 0, ready: 0, total: 0 } };
  parties(ctx).forEach(({ leader, names }) => {
    const pc = { warn: 0, missing: 0, approval: 0, problem: 0, ready: 0 };
    const members = names.map(n => {
      const s = states[n] || {}, a = accOf[n] || {};
      const classId = s.classId !== undefined && s.classId !== null && s.classId !== '' ? Number(s.classId) : null;
      const d = CL.cpDecide(T, plans, { name: n, party: leader, classId, level: s.level });
      const e = (plans.parties[leader] && plans.parties[leader].members || {})[n] || null;
      const st = d.status;
      if (WARN.includes(st)) { pc.warn++; if (st === 'missing') pc.missing++; else if (st === 'needs-approval') pc.approval++; else pc.problem++; }
      if (st === 'ready') pc.ready++;
      return { name: n, role: a.role || s.role || '', classId, cls: s.cls || (classId != null ? CL.cpName(T, classId) : ''), level: s.level != null ? Number(s.level) : null,
        online: s.ageSec != null && s.ageSec <= 90, ageSec: s.ageSec != null ? s.ageSec : null,
        status: st, text: d.text, why: d.why, next: d.next, nextName: d.nextName, needLevel: d.needLevel, plan: e && Array.isArray(e.plan) ? e.plan.map(Number) : null,
        approved: !!(e && e.approved === true), approvedBy: e ? e.approvedBy || '' : '', approvedAt: e ? e.approvedAt || '' : '', note: e ? e.note || '' : '', updatedAt: e ? e.updatedAt || '' : '',
        planParty: d.party !== leader ? d.party : null,
        reported: s.classPlan || null, reportedInfo: s.classPlanInfo || null,
        suggestion: !e ? suggestion(T, a, classId) : null };
    });
    out.parties.push({ leader, members, counts: pc });
    Object.keys(pc).forEach(k => { out.counts[k] += pc[k]; }); out.counts.total += members.length;
  });
  const ex = exampleTemplates(ctx);
  const tpls = Object.assign({}, ex, plans.templates);
  out.templates = Object.keys(tpls).map(id => Object.assign({ id, own: !!plans.templates[id], example: !!tpls[id].example }, tpls[id]));
  return out;
}

// ------------------------------------------------------------------------------------------------------------------- writes
const isoNow = () => new Date().toISOString();
function bad(code, error, extra) { return Object.assign({ code, error }, extra || {}); }
/** one party member with its live class (for validation) */
function memberOf(ctx, leader, name) {
  const p = parties(ctx).find(x => x.leader === leader);
  if (!p) return { err: bad(400, `no party "${leader}" in swarm.config.json`) };
  if (!p.names.includes(name)) return { err: bad(400, `${name} is not in party ${leader}`) };
  const s = (ctx.readStates() || []).find(x => x.name === name) || {};
  const classId = s.classId !== undefined && s.classId !== null && s.classId !== '' ? Number(s.classId) : null;
  return { party: p, classId, level: s.level != null ? Number(s.level) : null, role: s.role || '' };
}
function checkPlan(T, plan, classId, name) {
  if (!Array.isArray(plan) || !plan.length) return 'a plan needs at least the 1st profession';
  const ids = plan.map(Number);
  if (ids.some(x => !isFinite(x))) return 'class ids must be numbers';
  const v = CL.cpValidate(T, ids); if (!v.ok) return v.why;
  if (classId !== null && classId !== undefined && !CL.cpFits(T, ids, classId)) return `${name} is ${CL.cpName(T, classId)} now — that class is not on ${ids.map(i => CL.cpName(T, i)).join(' > ')}`;
  return '';
}
function slug(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'template'; }

/** POST body -> { code, ... } — runs fn(data) under the lock with the rev check, then history + atomic write */
function write(ctx, b, label, fn) {
  const F = plansFile(ctx), Gd = guard(ctx);
  fs.mkdirSync(path.dirname(F), { recursive: true });
  let result = null;
  try {
    Gd.withLock(F, () => {
      const P = readPlans(ctx);
      if (P.broken) { result = bad(500, `${path.basename(F)} does not parse (${P.broken}) — fix or restore it from history/ first`); return; }
      if (b.rev !== undefined && b.rev !== null && String(b.rev) !== P.rev) { result = bad(409, 'the class plans were changed meanwhile (another page or a tool) — reload and try again', { rev: P.rev }); return; }
      const r = fn(P.data);
      if (r && r.code && r.code !== 200) { result = r; return; }
      if (r && r.noWrite) { result = Object.assign({ code: 200, ok: true, rev: P.rev }, r); return; }
      const hist = P.exists ? Gd.saveHistory(F, path.dirname(F), 50) : null;
      if (!P.data._about) P.data._about = 'CLASS PLANS — see Scripts/data/class_plans.example.json. Edited on the dashboard Classes page (#/classes); read live by swarm.js. A character changes class ONLY with an approved plan here.';
      const txt = JSON.stringify(P.data, null, 1) + '\n';
      Gd.atomicWrite(F, txt);
      try { fs.appendFileSync(path.join(ctx.LOGS, 'dashboard_commands.log'), `${isoNow()}\tclassplans\t${label}\t${(r && r.log) || ''}\r\n`); } catch (e) { }
      result = Object.assign({ code: 200, ok: true, rev: sha(txt), history: hist ? path.basename(hist) : null }, r || {});
      delete result.log;
    }, { who: 'classplans ' + label });
  } catch (e) { return bad(500, e.message); }
  return result;
}

function post(ctx, b) {
  const T = tree(ctx); if (!T) return bad(500, 'class_tree.json missing');
  const a = String(b.action || '');
  const by = String(b.by || 'dashboard').slice(0, 40);
  const leader = String(b.leader || '');
  const names = Array.isArray(b.names) ? b.names.map(String) : b.name ? [String(b.name)] : [];
  const needConfirm = () => bad(400, 'approving a class plan needs confirm: true (the page asks you first)');
  const party = (data) => { data.parties[leader] = data.parties[leader] || { members: {} }; data.parties[leader].members = data.parties[leader].members || {}; return data.parties[leader].members; };

  if (a === 'set') {
    const name = names[0]; if (!name) return bad(400, 'name missing');
    const m = memberOf(ctx, leader, name); if (m.err) return m.err;
    const why = checkPlan(T, b.plan, m.classId, name); if (why) return bad(400, why);
    const approve = b.approve === true;
    if (approve && b.confirm !== true) return needConfirm();
    return write(ctx, b, 'set', (data) => {
      const M = party(data), old = M[name] || null, plan = b.plan.map(Number);
      const same = old && JSON.stringify((old.plan || []).map(Number)) === JSON.stringify(plan);
      M[name] = { plan, approved: approve || !!(same && old.approved && b.keepApproval !== false),
        approvedBy: approve ? by : same && old.approved ? old.approvedBy || '' : '', approvedAt: approve ? isoNow() : same && old.approved ? old.approvedAt || '' : '',
        note: typeof b.note === 'string' ? b.note.slice(0, 200) : old && same ? old.note || '' : '', updatedAt: isoNow() };
      if (!M[name].approved) { delete M[name].approvedBy; delete M[name].approvedAt; }
      return { name, entry: M[name], log: `${leader}/${name} ${plan.join('>')} ${M[name].approved ? 'APPROVED by ' + by : 'not approved'}` };
    });
  }
  if (a === 'approve' || a === 'unapprove') {
    if (!names.length) return bad(400, 'names missing');
    if (a === 'approve' && b.confirm !== true) return needConfirm();
    const checks = {};
    for (const n of names) { const m = memberOf(ctx, leader, n); if (m.err) return m.err; checks[n] = m; }
    return write(ctx, b, a, (data) => {
      const M = party(data), done = [];
      for (const n of names) {
        const e = M[n]; if (!e || !Array.isArray(e.plan)) return bad(400, `${n} has no plan to ${a}`);
        if (a === 'approve') { const why = checkPlan(T, e.plan, checks[n].classId, n); if (why) return bad(400, why); Object.assign(e, { approved: true, approvedBy: by, approvedAt: isoNow(), updatedAt: isoNow() }); }
        else { e.approved = false; delete e.approvedBy; delete e.approvedAt; e.updatedAt = isoNow(); }
        done.push(n);
      }
      return { names: done, log: `${leader}: ${done.join(',')} ${a === 'approve' ? 'APPROVED by ' + by : 'unapproved'}` };
    });
  }
  if (a === 'clear') {
    if (!names.length) return bad(400, 'names missing');
    return write(ctx, b, 'clear', (data) => {
      const M = party(data), done = names.filter(n => M[n]); done.forEach(n => { delete M[n]; });
      if (!Object.keys(M).length) delete data.parties[leader];
      return { names: done, log: `${leader}: removed ${done.join(',')}` };
    });
  }
  if (a === 'copyClass') {
    // the plan of `from` to every member with the same CURRENT class (scope 'party' = this party, 'all' = every party)
    const from = String(b.from || ''); const m = memberOf(ctx, leader, from); if (m.err) return m.err;
    if (m.classId === null) return bad(400, `${from}'s current class is unknown (no state)`);
    const approve = b.approve === true; if (approve && b.confirm !== true) return needConfirm();
    const scope = b.scope === 'all' ? 'all' : 'party';
    const states = {}; (ctx.readStates() || []).forEach(s => { states[s.name] = s; });
    const targets = [];
    parties(ctx).forEach(p => { if (scope === 'party' && p.leader !== leader) return; p.names.forEach(n => { if (n !== from && states[n] && Number(states[n].classId) === m.classId) targets.push({ leader: p.leader, name: n }); }); });
    if (b.dryRun) return { code: 200, ok: true, dryRun: true, targets };
    return write(ctx, b, 'copyClass', (data) => {
      const src = (data.parties[leader] && data.parties[leader].members || {})[from];
      if (!src || !Array.isArray(src.plan)) return bad(400, `${from} has no plan to copy`);
      const why = checkPlan(T, src.plan, m.classId, from); if (why) return bad(400, why);
      targets.forEach(t => { data.parties[t.leader] = data.parties[t.leader] || { members: {} }; const M = data.parties[t.leader].members = data.parties[t.leader].members || {};
        M[t.name] = { plan: src.plan.map(Number), approved: approve, updatedAt: isoNow(), note: `copied from ${from}` }; if (approve) Object.assign(M[t.name], { approvedBy: by, approvedAt: isoNow() }); });
      return { targets, log: `${from} (${CL.cpName(T, m.classId)}) -> ${targets.map(t => t.name).join(',')} ${approve ? 'APPROVED by ' + by : 'not approved'}` };
    });
  }
  if (a === 'saveTemplate') {
    const tname = String(b.templateName || '').trim().slice(0, 80); if (!tname) return bad(400, 'template name missing');
    const p = parties(ctx).find(x => x.leader === leader); if (!p) return bad(400, `no party "${leader}"`);
    const cfg = cfgFresh(ctx), roleOf = {}; (cfg.accounts || []).forEach(x => { if (x && x.character) roleOf[x.character] = x.role || ''; });
    return write(ctx, b, 'saveTemplate', (data) => {
      const slots = CL.cpTemplateFromParty(T, data.parties[leader] || {}, p.names.map(n => ({ name: n, role: roleOf[n] || '' })));
      if (!slots.length) return bad(400, `party ${leader} has no valid plans to save`);
      let id = 'tpl-' + slug(tname), k = 2; while (data.templates[id] && !b.overwrite) id = 'tpl-' + slug(tname) + '-' + (k++);
      data.templates[id] = { name: tname, desc: String(b.desc || '').slice(0, 300), createdAt: isoNow(), from: `party ${leader}`, slots };
      return { id, template: data.templates[id], log: `template ${id} from party ${leader} (${slots.length} slots)` };
    });
  }
  if (a === 'deleteTemplate') {
    const id = String(b.id || '');
    return write(ctx, b, 'deleteTemplate', (data) => {
      if (!data.templates[id]) return bad(400, exampleTemplates(ctx)[id] ? 'a shipped example template cannot be deleted (it is not in your file)' : `no template ${id}`);
      delete data.templates[id]; return { id, log: `template ${id} deleted` };
    });
  }
  if (a === 'applyTemplate') {
    const id = String(b.id || '');
    const P0 = readPlans(ctx), tpl = ((P0.data && P0.data.templates) || {})[id] || exampleTemplates(ctx)[id];
    if (!tpl) return bad(400, `no template ${id}`);
    const p = parties(ctx).find(x => x.leader === leader); if (!p) return bad(400, `no party "${leader}"`);
    const cfg = cfgFresh(ctx), roleOf = {}; (cfg.accounts || []).forEach(x => { if (x && x.character) roleOf[x.character] = x.role || ''; });
    const states = {}; (ctx.readStates() || []).forEach(s => { states[s.name] = s; });
    const mem = p.names.filter(n => states[n] && states[n].classId != null).map(n => ({ name: n, classId: Number(states[n].classId), role: roleOf[n] || states[n].role || '' }));
    const match = CL.cpTemplateMatch(T, tpl, mem);
    const unknown = p.names.filter(n => !states[n] || states[n].classId == null);
    const cur = (P0.data && P0.data.parties[leader] && P0.data.parties[leader].members) || {};
    match.assign.forEach(x => { const o = cur[x.name]; x.replaces = o && Array.isArray(o.plan) && JSON.stringify(o.plan.map(Number)) !== JSON.stringify(x.plan) ? o.plan.map(Number) : null; x.wasApproved = !!(o && o.approved); });
    if (b.dryRun) return { code: 200, ok: true, dryRun: true, template: { id, name: tpl.name }, match, unknown };
    const approve = b.approve === true; if (approve && b.confirm !== true) return needConfirm();
    const only = Array.isArray(b.only) ? b.only.map(String) : null;     // the page may untick some rows
    return write(ctx, b, 'applyTemplate', (data) => {
      const M = party(data), done = [];
      match.assign.forEach(x => { if (only && !only.includes(x.name)) return;
        M[x.name] = { plan: x.plan, approved: approve, updatedAt: isoNow(), note: `template: ${tpl.name}` }; if (approve) Object.assign(M[x.name], { approvedBy: by, approvedAt: isoNow() }); done.push(x.name); });
      return { applied: done, match, log: `template ${id} -> party ${leader}: ${done.join(',')} ${approve ? 'APPROVED by ' + by : 'not approved'}` };
    });
  }
  return bad(400, 'unknown action (set | approve | unapprove | clear | copyClass | saveTemplate | deleteTemplate | applyTemplate)');
}

async function handle(req, res, url, ctx) {
  const p = url.pathname;
  if (STATIC[p]) {
    res.writeHead(200, { 'Content-Type': STATIC[p], 'Cache-Control': 'no-cache' });
    res.end(fs.readFileSync(path.join(ctx.DIR, path.basename(p))));
    return true;
  }
  if (p !== '/api/classplans' && p !== '/api/classtree') return false;
  if (!ctx.allowed(req, url)) { ctx.send(res, 401, 'text/plain; charset=utf-8', 'Access denied'); return true; }
  if (p === '/api/classtree') { const T = tree(ctx); ctx.json(res, T ? 200 : 500, T || { error: 'Scripts/data/class_tree.json missing' }); return true; }
  if (req.method === 'GET') { try { const r = info(ctx); ctx.json(res, r.error ? 500 : 200, r); } catch (e) { ctx.json(res, 500, { error: e.message }); } return true; }
  if (req.method !== 'POST') { ctx.json(res, 405, { error: 'GET or POST' }); return true; }
  let b = {}; try { let t = ''; for await (const c of req) t += c; b = JSON.parse(t || '{}'); } catch (e) { ctx.json(res, 400, { error: 'bad JSON' }); return true; }
  try { const r = post(ctx, b) || bad(500, 'no result'); const code = r.code || 200; delete r.code; ctx.json(res, code, r); } catch (e) { ctx.json(res, 500, { error: e.message }); }
  return true;
}
module.exports = { handle, info, post, readPlans, plansFile, WARN };
