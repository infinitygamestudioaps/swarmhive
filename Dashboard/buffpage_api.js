// BUFF PLANS API (user 2026-10-10: a friend "runs every single class" and uses no community buffer: per party and per buffer character the
// user chooses WHICH of its own buffs it casts and ON WHOM; group templates like the class plans). Loaded by server.js (one hook, BEFORE the
// key check like classpage_api.js). Public (no secrets): /buffpage.js, /buffpage.css, /bufflogic.js.
//   GET  /api/buffplans                every party of swarm.config.json (party = its leader's name) with its members: class, level, role token,
//                                      kind, board buffs on/off (rkBoardBuffs), the bot's own report (swarm_state.buffPlan: learned buff skills,
//                                      status, missing buffs), the saved entry, the plan that runs (bpEffective = the swarm.js code via
//                                      Dashboard/bufflogic.js) and whether it runs (bpRuns), the overlaps per party (bpOwners: two buffers with
//                                      the same buff type on the same member -> one casts), the templates (the file's own + the shipped examples),
//                                      the settings and the counts for the badges
//   POST /api/buffplans { action, rev, ... }   set | approve | unapprove | clear | settings | saveTemplate | deleteTemplate | applyTemplate
//                                      every write: validated (bpValidate: errors reject, warnings are returned), APPROVING needs confirm: true,
//                                      lock + rev check (409 when the file changed since the page loaded it), a history copy
//                                      (history/buff_plans_<time>.json next to the file, last 50), atomic tmp + rename (manual_guard.js),
//                                      one line in Logs/dashboard_commands.log.
// File: Scripts/data/buff_plans.json (env SWARM_BUFFPLANS_FILE overrides it: the tests use a scratch copy). swarm.js re-reads it on change.
// runs per member (USER DECISION 2026-10-10, bpRuns): 'full' = an approved plan, or no reviewed plan in a party WITHOUT board buffs (the
// suggestion runs at once); 'fill' = no reviewed plan WITH board buffs (only fills what the board lacks, no song / dance cycles); '' = nothing.
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
// STAGING (2026-10-10): this copy lives in docs/plan/staging/buffpage until the page is wired in (WIRING.txt); then it moves to Dashboard/
const BL = (() => { try { return require('./bufflogic'); } catch (e) { return require(require('path').join(__dirname, '..', '..', '..', '..', 'Dashboard', 'bufflogic')); } })();
const STATIC = { '/buffpage.js': 'application/javascript; charset=utf-8', '/buffpage.css': 'text/css; charset=utf-8', '/bufflogic.js': 'application/javascript; charset=utf-8' };

let G = null;
function guard(ctx) { if (!G) G = require(path.join(ctx.ROOT, 'docs', 'plan', 'tools', 'manual_guard.js')); return G; }
const plansFile = (ctx) => process.env.SWARM_BUFFPLANS_FILE || ctx.buffPlansFile || path.join(ctx.DATA, 'buff_plans.json');
const sha = (t) => t ? crypto.createHash('sha1').update(t).digest('hex').slice(0, 16) : '';
let TREE = null, treeStamp = '';
function tree(ctx) {
  const f = path.join(ctx.DATA, 'class_tree.json');
  let st = ''; try { st = String(fs.statSync(f).mtimeMs); } catch (e) { }
  if (!TREE || st !== treeStamp) { TREE = ctx.readJson(f, null); treeStamp = st; }
  return TREE;
}
// BUFF GROUPS (Mr.P 2026-10-10): Scripts/data/buff_groups.json (docs/plan/tools/buff_groups.js) -> the covers index the bots use
let GROUPS = null, groupsStamp = '';
function groups(ctx) {
  const f = path.join(ctx.DATA, 'buff_groups.json');
  let st = ''; try { st = String(fs.statSync(f).mtimeMs); } catch (e) { }
  if (!GROUPS || st !== groupsStamp) { GROUPS = BL.bpGroups(ctx.readJson(f, null)); groupsStamp = st; }
  return GROUPS;
}
function readPlans(ctx) {
  const F = plansFile(ctx);
  let raw = ''; try { raw = fs.readFileSync(F, 'utf8'); } catch (e) { }
  let data = null; try { data = raw ? JSON.parse(raw.replace(/^﻿/, '')) : null; } catch (e) { return { raw, rev: sha(raw), data: null, broken: e.message }; }
  if (!data || typeof data !== 'object') data = {};
  if (!data.parties || typeof data.parties !== 'object') data.parties = {};
  if (!data.templates || typeof data.templates !== 'object') data.templates = {};
  if (!data.settings || typeof data.settings !== 'object') data.settings = {};
  if (!data.version) data.version = 1;
  return { raw, rev: sha(raw), data, exists: !!raw };
}
function exampleTemplates(ctx) { const ex = ctx.readJson(path.join(ctx.DATA, 'buff_plans.example.json'), null) || ctx.readJson(path.join(__dirname, 'buff_plans.example.json'), null); return ex && ex.templates ? ex.templates : {}; }
function cfgFresh(ctx) {
  try { return JSON.parse(fs.readFileSync(path.join(ctx.LOGS, '..', 'swarm.config.json'), 'utf8').replace(/^﻿/, '')); } catch (e) { }
  try { return ctx.reloadCfg() || {}; } catch (e) { return {}; }
}
function parties(ctx) { let K; try { K = require('./kamapage_api'); } catch (e) { K = require(path.join(ctx.ROOT, 'Dashboard', 'kamapage_api')); } return K.partyList(ctx); }   // STAGING: the Dashboard copy

/** the learned buff skills a bot reported (swarm_state.buffPlan.skills) in the rkClassifyBuffs shape { party, target } */
/** SELFOFF-2026-10-23: self buffs that always stay on (swarm.js SKSANE.alwaysSelf) */
const SELF_ALWAYS = /^Counter Critical$/i;
function reportedSkills(rep) {
  const out = { party: [], target: [] };
  ((rep && rep.skills) || []).forEach(s => {
    if (!s || !s.name) return;
    const x = { id: Number(s.id) || 0, name: String(s.name), ab: String(s.ab || '').toUpperCase(), abLvl: Number(s.abLvl) || 0, mlvl: Number(s.mlvl) || 0, time: Number(s.time) || 0, mp: 0, ready: true };
    (s.kind === 'target' ? out.target : out.party).push(x);
  });
  return out;
}
/** the members of one party as the logic sees them (caster / tank / kind) */
function partyMembers(ctx, T, cfg, states, names) {
  const accOf = {}; (cfg.accounts || []).forEach(a => { if (a && a.character) accOf[a.character] = a; });
  return names.map(n => {
    const s = states[n] || {}, a = accOf[n] || {};
    const classId = s.classId !== undefined && s.classId !== null && s.classId !== '' ? Number(s.classId) : null;
    const token = String(s.role || a.role || '');
    const res = BL.rkResolve(token || 'auto', classId, T);
    const kind = String(s.roleKind || BL.rkKindOf(token) || res.kind || '');
    const style = String(s.roleStyle || res.style || BL.rkStyleOfClass(T, classId) || '');
    const caster = BL.ROLE_RE.caster.test(token) || ['healer', 'nuker', 'summoner'].includes(kind) || (kind === 'buffer' && style === 'caster');
    const tank = BL.ROLE_RE.tank.test(token) || kind === 'tank';
    const cls = s.cls || (classId != null && T && T.classes[String(classId)] ? T.classes[String(classId)].name : '');
    return { name: n, classId, cls, level: s.level != null ? Number(s.level) : null, role: token, kind, style, caster, tank,
      online: s.ageSec != null && s.ageSec <= 90, ageSec: s.ageSec != null ? s.ageSec : null, report: s.buffPlan || null };
  });
}

function info(ctx) {
  const T = tree(ctx);
  const P = readPlans(ctx);
  const plans = P.data || { parties: {}, templates: {}, settings: {} };
  const settings = BL.bpSettings(plans);
  const cfg = cfgFresh(ctx);
  const states = {}; (ctx.readStates() || []).forEach(s => { states[s.name] = s; });
  const out = { file: path.basename(plansFile(ctx)), exists: !!P.exists, rev: P.rev, broken: P.broken || null, settings, defaults: BL.BUFFPLAN.settings,
    targetWords: BL.BUFFPLAN.targetWords, parties: [], counts: { warn: 0, buffers: 0, ok: 0, total: 0 } };
  parties(ctx).forEach(({ leader, names }) => {
    const board = BL.rkBoardBuffs(cfg, leader, plans, ctx.readJson(path.join(ctx.ROOT, 'Logs', 'board_buffs.json'), null));   // BOARDLEARN: a server without board buffs (learned by the bots)
    const sw = plans.parties && plans.parties[leader] ? plans.parties[leader].boardBuffs : undefined;
    const boardFrom = typeof sw === 'boolean' ? 'switch' : ((cfg.accounts || []).some(a => a && a.character === leader && typeof a.boardBuffs === 'boolean') ? 'leader' : typeof cfg.boardBuffs === 'boolean' ? 'config' : 'default');
    const ms = partyMembers(ctx, T, cfg, states, names);
    const tmembers = ms.map(m => ({ name: m.name, caster: m.caster, tank: m.tank }));
    const pc = { warn: 0, buffers: 0, ok: 0 };
    const offers = [], abName = {};
    const pnode = (plans.parties && plans.parties[leader]) || {}, GR = groups(ctx);
    const members = ms.map(m => {
      const skills = reportedSkills(m.report);
      const known = skills.party.length + skills.target.length;
      const entry = BL.bpEntry(plans, leader, m.name);
      const buffer = m.kind === 'buffer' || m.kind === 'healer' || known > 0 || !!(entry && (entry.approved || (entry.buffs || []).length || (entry.rotation || []).length || entry.noBuffs || entry.noSongs));   // SELFOFF-2026-10-23: a never-keep / self-buff list alone does not make a buffer
      let eff = BL.bpEffective(entry, skills, names, GR);
      if (!known && !(entry && entry.approved)) { eff.status = 'suggested'; eff.why = 'no skill report yet (log in once with the kit)'; }
      eff = BL.bpApplySwitches(eff, entry, pnode);   // MR.P 2026-10-10: buffing OFF / no songs / dances
      const runs = BL.bpRuns(eff, board);   // 'full' | 'fill' | '' (USER DECISION 2026-10-10: approved = full; no reviewed plan: board OFF = full, board ON = fill)
      if (buffer) { pc.buffers++; if (eff.status === 'ok' || eff.status === 'off') pc.ok++; else pc.warn++; }
      if (buffer && runs) {
        const ps = BL.bpPlanSkills(eff.plan, skills, tmembers.map(x => Object.assign({ me: x.name === m.name }, x)), m.name);
        [].concat(ps.party, ps.target).forEach(s => { offers.push({ by: m.name, ab: s.ab, abLvl: s.abLvl, mlvl: s.mlvl, who: s.who }); abName[m.name + '|' + s.ab] = s.name; });
      }
      return Object.assign({}, m, { buffer, skills, known, entry, approved: !!(entry && entry.approved), status: buffer ? eff.status : '', why: eff.why, warnings: eff.warnings || [],
        plan: eff.plan, runs: buffer ? runs : '', suggestion: BL.bpSuggest(skills, GR), remove: BL.bpRemoveList(entry), noBuffs: !!(entry && entry.noBuffs), noSongs: !!(entry && entry.noSongs), attackSkills: entry && typeof entry.attackSkills === 'boolean' ? entry.attackSkills : null, attackDefault: !/^(doomcryer|warcryer|buffer)$/.test(String(m.role || '')),   // SKILLSANE-2026-10-16 (swarm.js SKSANE.casterBuffer)
        slots: m.report && m.report.slots ? m.report.slots : null, skipped: (m.report && m.report.skipped) || [],
        self: ((m.report && m.report.self) || []).filter(x => x && x.name).map(x => ({ id: Number(x.id) || 0, name: String(x.name).slice(0, 60), always: SELF_ALWAYS.test(String(x.name)) })), selfOff: (entry && Array.isArray(entry.selfOff)) ? entry.selfOff.slice() : [] });   // SELFOFF-2026-10-23
    });
    // the interleaved song / dance cycle of this party (kind = the majority of the character's rotation skills)
    const casters = members.filter(m => m.buffer && m.runs && (m.plan.rotation || []).length).map(m => { const list = BL.bpRotEntries(m.plan.rotation).map(r => r.name);
      const known = [].concat(m.skills.party, m.skills.target); const dances = list.filter(n => { const k = known.find(x => BL.bpNorm(x.name) === BL.bpNorm(n)); return k ? /^DANCE_/.test(k.ab) : /^dance /i.test(n); }).length;
      return { name: m.name, kind: dances * 2 >= list.length && dances ? 'dance' : 'song', list }; });
    const cycle = BL.bpCycleSeq(casters, settings);   // MR.P: the Swordsinger opens by default, capped at the song / dance slots
    const ov = BL.bpOwners(offers).overlaps.map(o => Object.assign({}, o, { skills: o.by.map(b => abName[b + '|' + o.ab] || o.ab) }));
    out.parties.push({ leader, board, boardFrom, members, overlaps: ov, cycle, counts: pc, noSongs: !!pnode.noSongs });
    out.counts.warn += pc.warn; out.counts.buffers += pc.buffers; out.counts.ok += pc.ok; out.counts.total += members.length;
  });
  const ex = exampleTemplates(ctx);
  const tpls = Object.assign({}, ex, plans.templates);
  out.templates = Object.keys(tpls).map(id => Object.assign({ id, own: !!plans.templates[id], example: !plans.templates[id] }, tpls[id]));
  return out;
}

// ------------------------------------------------------------------------------------------------------------------- writes
const isoNow = () => new Date().toISOString();
function bad(code, error, extra) { return Object.assign({ code, error }, extra || {}); }
function slug(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'template'; }
/** a buff list from the page -> clean entries */
function cleanBuffs(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, 80).map((b, i) => {
    if (!b || typeof b !== 'object') return null;
    const skill = String(b.skill || '').trim().slice(0, 60), id = Number(b.id) || 0;
    if (!skill && !id) return null;
    const o = { skill, targets: (Array.isArray(b.targets) ? b.targets : ['party']).map(t => String(t).trim().slice(0, 40)).filter(Boolean).slice(0, 12), priority: Number(b.priority) || (i + 1), keep: b.keep !== false };
    if (id) o.id = id;
    if (!o.targets.length) o.targets = ['party'];
    return o;
  }).filter(Boolean);
}
// rotation entries: a skill name, or { skill, keepAlways: true } (kept up on its own between cycles)
const cleanRot = (r) => Array.isArray(r) ? r.map(x => { const n = String(BL.bpRotName(x) || '').trim().slice(0, 60); if (!n) return null; return x && typeof x === 'object' && x.keepAlways ? { skill: n, keepAlways: true } : n; }).filter(Boolean).slice(0, 30) : [];
function memberCtx(ctx, leader, name) {
  const p = parties(ctx).find(x => x.leader === leader);
  if (!p) return { err: bad(400, `no party "${leader}" in swarm.config.json`) };
  if (name && !p.names.includes(name)) return { err: bad(400, `${name} is not in party ${leader}`) };
  const states = {}; (ctx.readStates() || []).forEach(s => { states[s.name] = s; });
  return { party: p, states, skills: name ? reportedSkills((states[name] || {}).buffPlan) : null };
}

function write(ctx, b, label, fn) {
  const F = plansFile(ctx), Gd = guard(ctx);
  fs.mkdirSync(path.dirname(F), { recursive: true });
  let result = null;
  try {
    Gd.withLock(F, () => {
      const P = readPlans(ctx);
      if (P.broken) { result = bad(500, `${path.basename(F)} does not parse (${P.broken}) — fix or restore it from history/ first`); return; }
      if (b.rev !== undefined && b.rev !== null && String(b.rev) !== P.rev) { result = bad(409, 'the buff plans were changed meanwhile (another page or a tool) — reload and try again', { rev: P.rev }); return; }
      const r = fn(P.data);
      if (r && r.code && r.code !== 200) { result = r; return; }
      const hist = P.exists ? Gd.saveHistory(F, path.dirname(F), 50) : null;
      if (!P.data._about) P.data._about = 'BUFF PLANS — see Scripts/data/buff_plans.example.json. Edited on the dashboard Buffs page (#/buffs); read live by swarm.js. Per party (leader name) and buffer character: which own buffs it casts on whom, the song/dance order. No reviewed plan = the suggestion from the skills of the character: it runs at once without board buffs, and only fills what the board lacks with them.';
      const txt = JSON.stringify(P.data, null, 1) + '\n';
      Gd.atomicWrite(F, txt);
      try { fs.appendFileSync(path.join(ctx.LOGS, 'dashboard_commands.log'), `${isoNow()}\tbuffplans\t${label}\t${(r && r.log) || ''}\r\n`); } catch (e) { }
      result = Object.assign({ code: 200, ok: true, rev: sha(txt), history: hist ? path.basename(hist) : null }, r || {});
      delete result.log;
    }, { who: 'buffplans ' + label });
  } catch (e) { return bad(500, e.message); }
  return result;
}

function post(ctx, b) {
  const a = String(b.action || '');
  const by = String(b.by || 'dashboard').slice(0, 40);
  const leader = String(b.leader || '');
  const names = Array.isArray(b.names) ? b.names.map(String) : b.name ? [String(b.name)] : [];
  const chars = (data) => { data.parties[leader] = data.parties[leader] || { chars: {} }; data.parties[leader].chars = data.parties[leader].chars || {}; return data.parties[leader].chars; };
  const needConfirm = () => bad(400, 'approving a buff plan needs confirm: true (the page asks you first)');

  if (a === 'set') {
    const name = names[0]; if (!name) return bad(400, 'name missing');
    const m = memberCtx(ctx, leader, name); if (m.err) return m.err;
    const entry = { buffs: cleanBuffs(b.buffs), rotation: cleanRot(b.rotation) };
    // MR.P 2026-10-10: an EMPTY plan is allowed (approved = this character casts nothing); noBuffs / noSongs switches can come along
    const v = BL.bpValidate(entry, m.skills, m.party.names); if (!v.ok) return bad(400, v.errors.join('; '), { warnings: v.warnings });
    const approve = b.approve === true; if (approve && b.confirm !== true) return needConfirm();
    return write(ctx, b, 'set', (data) => {
      const C = chars(data);
      const old = C[name] || {};
      C[name] = Object.assign(entry, { approved: approve, savedAt: isoNow() });
      ['remove', 'noSongs', 'noBuffs', 'summon', 'attackSkills', 'selfOff'].forEach(k => { if (old[k] !== undefined) C[name][k] = old[k]; });   // the switches + never-keep list stay
      if (typeof b.noSongs === 'boolean') { if (b.noSongs) C[name].noSongs = true; else delete C[name].noSongs; }
      if (typeof b.noBuffs === 'boolean') { if (b.noBuffs) C[name].noBuffs = true; else delete C[name].noBuffs; }
      if (typeof b.attackSkills === 'boolean') C[name].attackSkills = b.attackSkills;   // SKILLSANE-2026-10-16
      if (approve) Object.assign(C[name], { approvedBy: by, approvedAt: isoNow() });
      return { name, entry: C[name], warnings: v.warnings, log: `${leader}/${name} ${entry.buffs.length} buffs, ${entry.rotation.length} songs/dances ${approve ? 'APPROVED by ' + by : 'not approved'}` };
    });
  }
  if (a === 'approve' || a === 'unapprove') {
    if (!names.length) return bad(400, 'names missing');
    if (a === 'approve' && b.confirm !== true) return needConfirm();
    const m = memberCtx(ctx, leader); if (m.err) return m.err;
    for (const n of names) if (!m.party.names.includes(n)) return bad(400, `${n} is not in party ${leader}`);
    return write(ctx, b, a, (data) => {
      const C = chars(data), done = [];
      for (const n of names) {
        const e = C[n]; if (!e) return bad(400, `${n} has no saved buff plan to ${a} (save one first)`);
        if (a === 'approve') { const v = BL.bpValidate(e, reportedSkills((m.states[n] || {}).buffPlan), m.party.names); if (!v.ok) return bad(400, `${n}: ${v.errors.join('; ')}`); Object.assign(e, { approved: true, approvedBy: by, approvedAt: isoNow() }); }
        else { e.approved = false; delete e.approvedBy; delete e.approvedAt; }
        done.push(n);
      }
      return { names: done, log: `${leader}: ${done.join(',')} ${a === 'approve' ? 'APPROVED by ' + by : 'unapproved'}` };
    });
  }
  if (a === 'clear') {
    if (!names.length) return bad(400, 'names missing');
    return write(ctx, b, 'clear', (data) => {
      const C = chars(data), done = names.filter(n => C[n]); done.forEach(n => { const keep = {}; ['remove', 'noSongs', 'noBuffs', 'attackSkills', 'selfOff'].forEach(k => { if (C[n][k] !== undefined) keep[k] = C[n][k]; }); if (Object.keys(keep).length) C[n] = keep; else delete C[n]; });   // the never-keep list + switches are not the plan
      if (!Object.keys(C).length && typeof data.parties[leader].boardBuffs !== 'boolean') delete data.parties[leader];
      return { names: done, log: `${leader}: removed ${done.join(',')}` };
    });
  }
  if (a === 'board') {   // 2026-10-10: Board buffs ON / OFF per party from the page (true | false | null = back to swarm.config.json)
    if (!leader) return bad(400, 'leader missing');
    const v = b.value === true || b.value === false ? b.value : b.value === null ? null : undefined;
    if (v === undefined) return bad(400, 'value must be true, false or null');
    if (b.confirm !== true) return bad(400, 'switching board buffs needs confirm: true (the page asks you first)');
    const m = memberCtx(ctx, leader); if (m.err) return m.err;
    return write(ctx, b, 'board', (data) => {
      data.parties[leader] = data.parties[leader] || { chars: {} };
      if (v === null) delete data.parties[leader].boardBuffs; else data.parties[leader].boardBuffs = v;
      if (v === null && !Object.keys(data.parties[leader].chars || {}).length) delete data.parties[leader];
      return { leader, boardBuffs: v, log: `${leader}: board buffs ${v === null ? 'back to swarm.config.json' : v ? 'ON' : 'OFF'} by ${by}` };
    });
  }
  if (a === 'remove') {   // MR.P 2026-10-10: a member's "never keep" list (it cancels those buffs itself; buffers never cast them on it) — any party member
    const name = names[0]; if (!name) return bad(400, 'name missing');
    const m = memberCtx(ctx, leader, name); if (m.err) return m.err;
    const list = (Array.isArray(b.remove) ? b.remove : []).map(x => String(x || '').trim().slice(0, 60)).filter(Boolean).slice(0, 40);
    return write(ctx, b, 'remove', (data) => { const C = chars(data); C[name] = C[name] || {}; if (list.length) C[name].remove = list; else delete C[name].remove; if (!Object.keys(C[name]).length) delete C[name];
      return { name, remove: list, log: `${leader}/${name} never keep: ${list.join(', ') || '(none)'}` }; });
  }
  if (a === 'selfoff') {   // SELFOFF-2026-10-23 (public tester: "Forgotten Scrolls skills are cast on reuse; make them selectable in the buff window. Exception: Counter Critical")
    const name = names[0]; if (!name) return bad(400, 'name missing');
    const m = memberCtx(ctx, leader, name); if (m.err) return m.err;
    const list = (Array.isArray(b.selfOff) ? b.selfOff : []).map(x => String(x || '').trim().slice(0, 60)).filter(x => x && !SELF_ALWAYS.test(x)).filter((x, i, a) => a.indexOf(x) === i).slice(0, 40);
    return write(ctx, b, 'selfoff', (data) => { const C = chars(data); C[name] = C[name] || {}; if (list.length) C[name].selfOff = list; else delete C[name].selfOff; if (!Object.keys(C[name]).length) delete C[name];
      return { name, selfOff: list, log: `${leader}/${name} self buffs off: ${list.join(', ') || '(none)'}` }; });
  }
  if (a === 'switches') {   // MR.P 2026-10-10: { name, noBuffs, noSongs } per character, or { noSongs } for the whole party (no name)
    const m = memberCtx(ctx, leader, names[0]); if (m.err) return m.err;
    const sw = {}; ['noBuffs', 'noSongs'].forEach(k => { if (typeof b[k] === 'boolean') sw[k] = b[k]; });
    // SKILLSANE-2026-10-16: attackSkills true (attacks with its own skills) | false (never) | null (the role default: caster buffers no, the rest yes)
    const atk = Object.prototype.hasOwnProperty.call(b, 'attackSkills') ? b.attackSkills : undefined;
    if (atk !== undefined && atk !== null && typeof atk !== 'boolean') return bad(400, 'attackSkills must be true, false or null');
    if (!Object.keys(sw).length && atk === undefined) return bad(400, 'noBuffs / noSongs must be true or false');
    if (!names[0] && (sw.noBuffs !== undefined || atk !== undefined)) return bad(400, 'buffing off / attack skills are per character (give a name)');
    return write(ctx, b, 'switches', (data) => {
      data.parties[leader] = data.parties[leader] || { chars: {} };
      const node = names[0] ? (chars(data)[names[0]] = chars(data)[names[0]] || {}) : data.parties[leader];
      Object.keys(sw).forEach(k => { if (sw[k]) node[k] = true; else delete node[k]; });
      if (atk !== undefined) { if (atk === null) delete node.attackSkills; else node.attackSkills = atk; sw.attackSkills = atk; }
      return { name: names[0] || null, switches: sw, log: `${leader}${names[0] ? '/' + names[0] : ' (party)'} ${JSON.stringify(sw)}` };
    });
  }
  if (a === 'settings') {
    const s = b.settings || {}, o = {};
    if (s.songDanceMax !== undefined) { const v = Math.round(Number(s.songDanceMax)); if (!(v >= 1 && v <= 40)) return bad(400, 'song / dance slots: 1 to 40'); o.songDanceMax = v; }
    if (s.gatherPct !== undefined) { const v = Math.round(Number(s.gatherPct)); if (!(v >= 0 && v <= 100)) return bad(400, 'gathered %: 0 to 100'); o.gatherPct = v; }
    if (s.gatherRange !== undefined) { const v = Math.round(Number(s.gatherRange)); if (!(v >= 200 && v <= 3000)) return bad(400, 'gather range: 200 to 3000'); o.gatherRange = v; }
    const NUM = { rotGapMs: [0, 10000, 'pause between two songs / dances (ms)'], rotTakeoverMs: [1000, 60000, 'turn take-over (ms)'], rotMinMpPct: [0, 100, 'min MP %'],
      cycleExpiredPct: [1, 100, 'new cycle when this % expired'], cycleMpStepPct: [0, 50, 'MP step %'], cycleMpMarginPct: [0, 50, 'MP margin %'], cycleMpWaitMs: [0, 600000, 'MP wait (ms)'] };
    Object.assign(NUM, { buffMax: [0, 60, 'buff slots (0 = no check)'], cycleMinGapMs: [0, 600000, 'min time between two cycles (ms)'], cycleMpReservePct: [0, 90, 'MP reserve %'] });
    if (s.firstCycleCaster !== undefined) { const v = String(s.firstCycleCaster).toLowerCase(); if (!['sws', 'bd'].includes(v)) return bad(400, 'first song / dance caster: sws or bd'); o.firstCycleCaster = v; }
    if (s.buffGroupRule !== undefined) { const v = String(s.buffGroupRule).toLowerCase(); if (!['server', 'stat'].includes(v)) return bad(400, 'buff group rule: server or stat'); o.buffGroupRule = v; }
    for (const k of Object.keys(NUM)) if (s[k] !== undefined) { const v = Math.round(Number(s[k])); if (!(v >= NUM[k][0] && v <= NUM[k][1])) return bad(400, `${NUM[k][2]}: ${NUM[k][0]} to ${NUM[k][1]}`); o[k] = v; }
    if (!Object.keys(o).length) return bad(400, 'nothing to change');
    return write(ctx, b, 'settings', (data) => { data.settings = Object.assign({}, data.settings || {}, o); return { settings: data.settings, log: JSON.stringify(o) }; });
  }
  if (a === 'saveTemplate') {
    const tname = String(b.templateName || '').trim().slice(0, 80); if (!tname) return bad(400, 'template name missing');
    const m = memberCtx(ctx, leader); if (m.err) return m.err;
    const T = tree(ctx);
    const list = m.party.names.map(n => { const s = m.states[n] || {}; const id = s.classId != null ? Number(s.classId) : null; return { name: n, cls: s.cls || (id != null && T && T.classes[String(id)] ? T.classes[String(id)].name : '') }; });
    return write(ctx, b, 'saveTemplate', (data) => {
      const tpl = BL.bpTemplateFromParty(list, (data.parties[leader] || {}).chars || {});
      if (!Object.keys(tpl.classes).length) return bad(400, `party ${leader} has no saved buff plans (with a known class) to save`);
      let id = 'tpl-' + slug(tname), k = 2; while (data.templates[id] && !b.overwrite) id = 'tpl-' + slug(tname) + '-' + (k++);
      data.templates[id] = { name: tname, desc: String(b.desc || '').slice(0, 300), createdAt: isoNow(), from: `party ${leader}`, classes: tpl.classes };
      return { id, template: data.templates[id], log: `template ${id} from party ${leader} (${Object.keys(tpl.classes).length} classes)` };
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
    const m = memberCtx(ctx, leader); if (m.err) return m.err;
    const T = tree(ctx);
    const list = m.party.names.map(n => { const s = m.states[n] || {}; const cid = s.classId != null ? Number(s.classId) : null; return { name: n, cls: s.cls || (cid != null && T && T.classes[String(cid)] ? T.classes[String(cid)].name : '') }; });
    const got = BL.bpTemplateApply(tpl, list.filter(x => x.cls));
    const cur = (P0.data && P0.data.parties[leader] && P0.data.parties[leader].chars) || {};
    const assign = Object.keys(got).map(n => ({ name: n, cls: (list.find(x => x.name === n) || {}).cls, buffs: got[n].buffs.length, rotation: got[n].rotation.length, replaces: !!cur[n], wasApproved: !!(cur[n] && cur[n].approved) }));
    const left = list.filter(x => !got[x.name]).map(x => x.name);
    if (b.dryRun) return { code: 200, ok: true, dryRun: true, template: { id, name: tpl.name }, assign, left };
    const only = Array.isArray(b.only) ? b.only.map(String) : null;
    return write(ctx, b, 'applyTemplate', (data) => {
      const C = chars(data), done = [];
      Object.keys(got).forEach(n => { if (only && !only.includes(n)) return; C[n] = Object.assign(got[n], { approved: false, savedAt: isoNow(), note: `template: ${tpl.name}` }); done.push(n); });
      if (!done.length) return bad(400, 'nobody in this party fits the template');
      return { applied: done, assign, log: `template ${id} -> party ${leader}: ${done.join(',')} (not approved)` };
    });
  }
  return bad(400, 'unknown action (set | approve | unapprove | clear | board | remove | selfoff | switches | settings | saveTemplate | deleteTemplate | applyTemplate)');
}

async function handle(req, res, url, ctx) {
  const p = url.pathname;
  if (STATIC[p]) {
    res.writeHead(200, { 'Content-Type': STATIC[p], 'Cache-Control': 'no-cache' });
    res.end(fs.readFileSync(path.join(ctx.DIR, path.basename(p))));
    return true;
  }
  if (p !== '/api/buffplans') return false;
  if (!ctx.allowed(req, url)) { ctx.send(res, 401, 'text/plain; charset=utf-8', 'Access denied'); return true; }
  if (req.method === 'GET') { try { const r = info(ctx); ctx.json(res, r.error ? 500 : 200, r); } catch (e) { ctx.json(res, 500, { error: e.message }); } return true; }
  if (req.method !== 'POST') { ctx.json(res, 405, { error: 'GET or POST' }); return true; }
  let b = {}; try { let t = ''; for await (const c of req) t += c; b = JSON.parse(t || '{}'); } catch (e) { ctx.json(res, 400, { error: 'bad JSON' }); return true; }
  try { const r = post(ctx, b) || bad(500, 'no result'); const code = r.code || 200; delete r.code; ctx.json(res, code, r); } catch (e) { ctx.json(res, 500, { error: e.message }); }
  return true;
}
module.exports = { handle, info, post, readPlans, plansFile, reportedSkills };
