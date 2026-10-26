// CLASS ROTATIONS API (CLASSROT-2026-10-26; owner: "Make sure we have aspect, skill, rule/trigger, weapon etc setup under /Combat ... so we can see
// everything that is going on for each class, level"). The page Dashboard/combatclass.js (#/combat).
//   GET  /api/classrot                 { lines: [{ name, group, tiers: [{ cid, name, band, rows, chars }] }], chars: [{ name, cid, level, cls, guide }] }
//   GET  /api/classrot/line?name=Titan { name, group, rules, tiers: [{ cid, name, band, notes, rows (+ user/def), chars: [live plan] }] }
//   POST /api/classrot/set             { cid, key: "<aspect>:<skillId>", auto: true|false|null }  -> Scripts/data/class_rotations_user.json + recompile
'use strict';
const fs = require('fs'), path = require('path');
const CR = require('./classrot_logic.js');
const rd = (p) => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^﻿/, ''));
const ROOT = path.resolve(__dirname, '..');
const userFile = (ctx) => process.env.SWARM_CLASSROT_USER || path.join(ctx.DATA, 'class_rotations_user.json');
let CACHE = { at: 0, sig: '', groups: [], idx: null, cs: null };
function load(ctx) {
  const dir = path.join(ctx.DATA, 'class_rotations');
  let files = []; try { files = fs.readdirSync(dir).filter(f => f.endsWith('.json')); } catch (e) { }
  const sig = files.map(f => { try { return f + fs.statSync(path.join(dir, f)).mtimeMs; } catch (e) { return f; } }).join('|');
  if (sig !== CACHE.sig || !CACHE.idx || Date.now() - CACHE.at > 60000) {
    const groups = files.map(f => { try { return Object.assign({ group: f.slice(0, -5) }, rd(path.join(dir, f))); } catch (e) { return null; } }).filter(Boolean);
    const cs = rd(path.join(ROOT, 'docs', 'plan', 'class_skills', 'class_skills.json'));
    CACHE = { at: Date.now(), sig, groups, idx: CR.classIndex(cs), cs };
  }
  return CACHE;
}
function readUser(ctx) { try { return rd(userFile(ctx)); } catch (e) { return {}; } }
function liveChars(ctx) {
  let st = []; try { st = ctx.readStates(); } catch (e) { }
  return st.map(s => ({ name: s.name, cid: Number(s.classId), cls: s.cls, level: Number(s.level), role: s.role, online: Number(s.ageSec) < 120, plan: s.combatPlan || null }));
}
function srcRows(C, cid) { const g = C.groups.find(x => x.classes && x.classes[cid]); return g ? { group: g.group, c: g.classes[cid], rules: g.rules || [] } : null; }
function index(ctx) {
  const C = load(ctx), chars = liveChars(ctx);
  const lines = C.cs.lines.map(l => {
    const tiers = l.tiers.map(t => { const s = srcRows(C, t.classId); return { cid: t.classId, name: t.name, band: CR.BANDS[t.tier], rows: s ? (s.c.rows || []).length : 0, chars: chars.filter(c => c.cid === t.classId).length }; });
    const s = srcRows(C, l.tiers[l.tiers.length - 1].classId);
    return { name: l.name, group: s ? s.group : '', tiers };
  });
  return { lines, chars: chars.map(c => ({ name: c.name, cid: c.cid, cls: c.cls, level: c.level, online: c.online, guide: !!(c.plan && c.plan.guide), hive: !(c.plan && c.plan.hive === false) })), groups: C.groups.map(g => g.group), status: status(ctx),
    totals: { classes: Object.keys(C.idx).length, rows: C.groups.reduce((s, g) => s + Object.values(g.classes || {}).reduce((t, c) => t + (c.rows || []).length, 0), 0) } };
}
function line(ctx, name) {
  const C = load(ctx), L = C.cs.lines.find(l => l.name === name); if (!L) return { code: 404, error: `no class line "${name}"` };
  const U = readUser(ctx), chars = liveChars(ctx);
  let rules = [], group = '';
  const tiers = L.tiers.map(t => {
    const s = srcRows(C, t.classId), u = U[t.classId] || {};
    if (s) { group = s.group; rules = s.rules; }
    const learn = {}; t.skills.forEach(k => { learn[k.id] = k; });
    const rows = s ? (s.c.rows || []).map(r => { const key = `${r.aspect}:${Number(r.skill)}`, ov = u[key] && typeof u[key].auto === 'boolean' ? u[key].auto : null;
      const wk = Object.keys(r.when || {}), manual = (wk.length === 1 && wk[0] === 'text') || !!(r.when && r.when.mobType);
      return Object.assign({}, r, { key, def: !!r.auto, auto: ov === null ? !!r.auto : ov, user: ov !== null, whenText: CR.whenText(r.when), manual }); }) : [];
    // what this class ALSO uses: the compiled rows it carries over from the classes before it (Scripts/data/class_rotation/<cid>.json)
    let inherited = []; try { const comp = rd(path.join(ctx.DATA, 'class_rotation', t.classId + '.json')); inherited = (comp.rows || []).filter(r => r.cls !== t.classId).map(r => ({ a: r.a, id: r.id, n: r.n, auto: r.auto, from: r.from, w: r.w, trig: r.trig, whenText: CR.whenText(r.when) })); } catch (e) { }
    return { cid: t.classId, name: t.name, band: CR.BANDS[t.tier], notes: s ? s.c.notes || [] : [], rows, inherited, chars: chars.filter(c => c.cid === t.classId) };
  });
  return { code: 200, name: L.name, group, rules, tiers, aspects: CR.ASPECT_TEXT, weapons: CR.WEAPON_TEXT, guide: guideFor(C, group, L) };
}
/** the written guide (docs/plan/class_skills/research/<group>.md) for one line: its own sections (title has the line or one of its class
 *  names) + the race-wide sections (rules, never lists, open questions, sources: the ones that belong to no line) */
function guideFor(C, group, L) {
  let txt = ''; try { txt = fs.readFileSync(path.join(ROOT, 'docs', 'plan', 'class_skills', 'research', group + '.md'), 'utf8'); } catch (e) { return { line: [], general: [] }; }
  const S = CR.mdSections(txt), names = (l) => [l.name].concat(l.tiers.map(t => t.name));
  const groupLines = C.cs.lines.filter(l => { const s = srcRows(C, l.tiers[l.tiers.length - 1].classId); return s && s.group === group; });
  const hits = (title, l) => names(l).some(n => title.toLowerCase().includes(n.toLowerCase()));
  const has = (title, n) => title.toLowerCase().includes(n.toLowerCase());
  // my line's own section (its name in the title), or a shared base / 1st-class section (one of my class names, no other line named in it)
  const mine = S.filter(s => has(s.title, L.name) || (hits(s.title, L) && !groupLines.some(l => l.name !== L.name && has(s.title, l.name)))), general = S.filter(s => !groupLines.some(l => hits(s.title, l)));
  const out = (s) => ({ title: s.title, html: CR.mdToHtml(s.body) });
  return { line: mine.map(out), general: general.map(out) };
}
function status(ctx) { try { return rd(path.join(ctx.DATA, 'class_rotations_status.json')); } catch (e) { return null; } }
function setRow(ctx, b) {
  const cid = String(Number(b.cid)), key = String(b.key || '');
  if (!/^\d+$/.test(cid) || !/^[a-z-]+:\d+$/.test(key)) return { code: 400, error: 'cid and key "<aspect>:<skill id>" needed' };
  const U = readUser(ctx); U[cid] = U[cid] || {};
  if (b.auto === null || b.auto === undefined) delete U[cid][key]; else U[cid][key] = { auto: !!b.auto, at: new Date().toISOString() };
  if (!Object.keys(U[cid]).length) delete U[cid];
  const f = userFile(ctx), tmp = f + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(U, null, 1)); fs.renameSync(tmp, f);
  let comp = null; try { comp = require(path.join(ROOT, 'docs', 'plan', 'tools', 'class_rotation_compile.js')).compileAll({ quiet: true }); } catch (e) { comp = { error: e.message }; }
  try { fs.appendFileSync(path.join(ctx.LOGS, 'dashboard_commands.log'), `${new Date().toISOString()} class rotation: class ${cid} ${key} -> ${b.auto === null || b.auto === undefined ? 'guide default' : b.auto ? 'ON' : 'OFF'}\n`); } catch (e) { }
  return { code: 200, ok: true, compiled: comp };
}
async function handle(req, res, url, ctx) {
  if (url.pathname === '/combatclass.js') {                             // the page script (public, no secrets)
    res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(fs.readFileSync(path.join(__dirname, 'combatclass.js'))); return true;
  }
  if (!/^\/api\/classrot(\/|$)/.test(url.pathname)) return false;
  if (!ctx.allowed(req, url)) { ctx.send(res, 401, 'text/plain; charset=utf-8', 'Access denied'); return true; }
  try {
    if (url.pathname === '/api/classrot/set' && req.method === 'POST') {
      let b = {}; try { let t = ''; for await (const c of req) t += c; b = JSON.parse(t || '{}'); } catch (e) { ctx.json(res, 400, { error: 'bad JSON' }); return true; }
      const r = setRow(ctx, b), code = r.code; delete r.code; ctx.json(res, code, r); return true;
    }
    if (url.pathname === '/api/classrot/line') { const r = line(ctx, url.searchParams.get('name') || ''), code = r.code; delete r.code; ctx.json(res, code, r); return true; }
    if (url.pathname === '/api/classrot') { ctx.json(res, 200, index(ctx)); return true; }
    ctx.json(res, 404, { error: 'unknown' }); return true;
  } catch (e) { ctx.json(res, 500, { error: e.message }); return true; }
}
module.exports = { handle, index, line, setRow };
