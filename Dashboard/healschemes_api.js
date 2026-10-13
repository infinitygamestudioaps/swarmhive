// HEAL SCHEMES API (public tester 2026-10-13: "SE uses Self Heal — the weakest heal skill — at lvl 80", "no MP recharge from SE/EE",
// "ability to set own heal / MP schemes"). Loaded by server.js (one hook, like runstate_api.js). Public (no secrets): /healschemes.js,
// /healschemes.css, /heallogic.js.
//   GET  /api/healschemes              { file, exists, rev, broken, defaults, skills, classNames, classSkills, classes, chars: [row] }
//        row = { name, party, classId, cls, level, role, online, live (the bot reported its skills), mode ('healer' | 'support' | ''),
//                healerRole, healerClass, canHeal, known: [{ id, name, kind, power, lvl }], auto: { single, emergency, group, self, recharge },
//                scheme (what runs: automatic < class < own), src (which fields are the player's), own, classScheme, last, lastRc, xml }
//   POST /api/healschemes { action: 'set' | 'clear', scope: 'char' | 'class', name | classId, scheme, rev, by }
//        set = the whole scheme of that character / class (only the fields the player changed; an empty scheme = back to automatic)
//        every write: hsValidate (errors reject with plain sentences, warnings come back), lock + rev check (409 when the file changed since
//        the page loaded it), a history copy (Scripts/data/history/heal_schemes_<time>.json, last 50), atomic tmp + rename
//        (docs/plan/tools/manual_guard.js), one line in Logs/dashboard_commands.log.
// File: Scripts/data/heal_schemes.json (env SWARM_HEALSCHEMES_FILE overrides it: the tests use a scratch copy). swarm.js re-reads it within ~3 s.
//   { version: 1, classes: { <classId>: scheme }, chars: { <name>: scheme } }   missing / empty = everything automatic (the best skill it knows).
// The rules (skill choice, merge, validation) are Dashboard/heallogic.js = a text copy of swarm.js HEALSCHEME-PURE (heal_logic_sync.js).
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const HL = require('./heallogic');
const STATIC = { '/healschemes.js': 'application/javascript; charset=utf-8', '/healschemes.css': 'text/css; charset=utf-8', '/heallogic.js': 'application/javascript; charset=utf-8' };
const NAME_RE = /^[A-Za-z0-9_\-]{1,40}$/;
const isoNow = () => new Date().toISOString();
let G = null;
function guard(ctx) { if (!G) G = require(path.join(ctx.ROOT || path.join(__dirname, '..'), 'docs', 'plan', 'tools', 'manual_guard.js')); return G; }
const fileOf = (ctx) => process.env.SWARM_HEALSCHEMES_FILE || (ctx && ctx.healSchemesFile) || path.join(ctx.DATA, 'heal_schemes.json');
const sha = (t) => (t ? crypto.createHash('sha1').update(t).digest('hex').slice(0, 16) : '');
const rj = (ctx, f, d) => { try { return ctx.readJson ? ctx.readJson(f, d) : JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch (e) { return d; } };
const cache = {};
function cached(ctx, key, file, fb) {
  let st = ''; try { st = String(fs.statSync(file).mtimeMs); } catch (e) { }
  if (!cache[key] || cache[key].st !== st) cache[key] = { st, v: rj(ctx, file, fb) };
  return cache[key].v;
}
const healData = (ctx) => cached(ctx, 'skills', ctx.healSkillsFile || path.join(ctx.DATA, 'heal_skills.json'), { skills: {}, classes: {} }) || { skills: {}, classes: {} };
const classTree = (ctx) => cached(ctx, 'tree', path.join(ctx.DATA, 'class_tree.json'), null);
function classRow(ctx, id) { const t = classTree(ctx), c = t && t.classes; if (!c) return null; return (Array.isArray(c) ? c.find(x => Number(x.id) === Number(id)) : c[String(id)]) || null; }

function readFile(ctx) {
  const F = fileOf(ctx); let raw = '';
  try { raw = fs.readFileSync(F, 'utf8'); } catch (e) { return { raw: '', rev: '', exists: false, data: HL.hsNorm({}) }; }
  try { return { raw, rev: sha(raw), exists: true, data: HL.hsNorm(raw.trim() ? JSON.parse(raw.replace(/^﻿/, '')) : {}) }; }
  catch (e) { return { raw, rev: sha(raw), exists: true, data: null, broken: e.message }; }
}
/** before a bot reports: the heals its class line learns by its level (skill level = the highest one learned by then) */
function estimateKnown(D, classId, level) {
  const lv = Number(level) || 0, list = [];
  ((D.classes || {})[String(classId)] || []).forEach(s => {
    if (s.from > lv) return;
    const S = (D.skills || {})[String(s.id)]; if (!S) return;
    let sl = 0; const at = Array.isArray(s.at) ? s.at : []; for (let i = 0; i + 1 < at.length; i += 2) if (at[i] <= lv && at[i + 1] > sl) sl = at[i + 1];
    list.push({ id: s.id, level: sl || 1, ready: true, mp: 0 });
  });
  return list;
}
function charRow(ctx, s, D, J) {
  const rep = s.healPlan && s.healPlan.v ? s.healPlan : null;
  const classId = Number(s.classId != null ? s.classId : rep && rep.classId);
  const list = rep && Array.isArray(rep.known) ? rep.known.map(k => ({ id: k.id, level: k.lvl, ready: true, mp: 0 })) : estimateKnown(D, classId, s.level);
  const K = HL.hsKnown(list, D), E = HL.hsEffective(J, s.name, classId), cr = classRow(ctx, classId);
  return { name: s.name, party: s.party || null, classId: Number.isFinite(classId) ? classId : null, cls: s.cls || (cr && cr.name) || '', level: s.level || null, role: s.role || '',
    online: Number(s.ageSec) <= 30, live: !!rep, mode: rep ? rep.mode || '' : '',
    healerRole: /healer|bishop|shilliensaint/.test(String(s.role || '')), healerClass: !!(cr && cr.role === 'healer'),
    canHeal: K.length > 0, known: K.map(k => ({ id: k.id, name: k.name, kind: k.kind, power: k.power, lvl: k.level, hit: k.hit, reuse: k.reuse })), auto: HL.hsAutoTable(K),
    scheme: E.scheme, src: E.src, own: J.chars[s.name] || null, classScheme: Number.isFinite(classId) ? J.classes[String(classId)] || null : null,
    last: rep ? rep.last || null : null, lastRc: rep ? rep.lastRc || null : null, xml: rep ? rep.xml || '' : '' };
}
function summary(ctx) {
  const R = readFile(ctx), J = R.data || HL.hsNorm({}), D = healData(ctx);
  const states = ctx.readStates ? ctx.readStates() : [];
  const chars = states.filter(s => s && s.name).map(s => charRow(ctx, s, D, J)).sort((a, b) => (b.canHeal - a.canHeal) || String(a.party || '').localeCompare(String(b.party || '')) || a.name.localeCompare(b.name));
  const skills = {}; Object.keys(D.skills || {}).forEach(id => { const S = D.skills[id]; skills[id] = { name: S.name, kind: S.kind, power: (S.power || [])[(S.power || []).length - 1] || 0, hit: S.hit, reuse: S.reuse }; });
  const classNames = {}; Object.keys(D.classes || {}).forEach(id => { const c = classRow(ctx, id); classNames[id] = c ? c.name : 'class ' + id; });
  const classSkills = {}; Object.keys(D.classes || {}).forEach(id => { classSkills[id] = (D.classes[id] || []).map(x => x.id); });
  return { file: path.basename(fileOf(ctx)), exists: R.exists, rev: R.rev, broken: R.broken || null, defaults: HL.HS_DEFAULT, skills, classNames, classSkills, classes: J.classes, chars };
}

function bad(code, error, extra) { return Object.assign({ code, error }, extra || {}); }
function write(ctx, b, label, fn) {
  const F = fileOf(ctx), Gd = guard(ctx); let result = null;
  fs.mkdirSync(path.dirname(F), { recursive: true });
  try {
    Gd.withLock(F, () => {
      const R = readFile(ctx);
      if (R.broken) { result = bad(500, `${path.basename(F)} does not parse (${R.broken}) — fix it or restore it from Scripts/data/history/ first`); return; }
      if (b.rev !== undefined && b.rev !== null && String(b.rev) !== String(R.rev)) { result = bad(409, 'The heal schemes were changed meanwhile (another page or another person). Reload and try again.', { rev: R.rev }); return; }
      const J = R.data; fn(J);
      J._about = 'HEAL SCHEMES — edited on the dashboard (character page "Healing" / party settings → Healing). classes.<classId> and chars.<name>: only the fields the player changed; everything missing is automatic (the strongest / fastest heal the character knows). Read live by swarm.js (HEALSCHEME).';
      J._updated = isoNow();
      const hist = R.exists ? Gd.saveHistory(F, path.dirname(F), 50) : null;
      const txt = JSON.stringify(J, null, 1) + '\n';
      Gd.atomicWrite(F, txt);
      try { fs.appendFileSync(path.join(ctx.LOGS, 'dashboard_commands.log'), `${isoNow()}\thealschemes\t${label}\t${String(b.by || 'dashboard').slice(0, 40)}\r\n`); } catch (e) { }
      result = { code: 200, ok: true, rev: sha(txt), history: hist ? path.basename(hist) : null };
    }, { who: 'healschemes ' + label });
  } catch (e) { return bad(500, e.message); }
  return result;
}
function post(ctx, b) {
  if (!b || typeof b !== 'object') return bad(400, 'bad body');
  const action = String(b.action || ''), scope = String(b.scope || '');
  if (!['set', 'clear'].includes(action)) return bad(400, 'action: set or clear');
  if (!['char', 'class'].includes(scope)) return bad(400, 'scope: char or class');
  let key = '';
  if (scope === 'char') { key = String(b.name || ''); if (!NAME_RE.test(key) || key.startsWith('_')) return bad(400, 'name (character name) required'); }
  else { key = String(b.classId == null ? '' : b.classId); if (!/^\d{1,3}$/.test(key)) return bad(400, 'classId required'); }
  let warnings = [], clean = {};
  if (action === 'set') {
    const v = HL.hsValidate(b.scheme);
    if (v.errors.length) return bad(400, v.errors[0], { errors: v.errors, warnings: v.warnings });
    warnings = v.warnings; clean = v.clean;
  }
  const bucket = scope === 'char' ? 'chars' : 'classes';
  const label = `${action} ${scope} ${key}${action === 'set' ? ' ' + JSON.stringify(clean).slice(0, 300) : ''}`;
  const r = write(ctx, b, label, (J) => { if (action === 'clear' || !Object.keys(clean).length) delete J[bucket][key]; else J[bucket][key] = clean; });
  if (!r || r.code !== 200) return r || bad(500, 'not written');
  return Object.assign(r, { warnings, state: summary(ctx) });
}
async function handle(req, res, url, ctx) {
  const p = url.pathname;
  if (STATIC[p]) {
    res.writeHead(200, { 'Content-Type': STATIC[p], 'Cache-Control': 'no-cache' });
    res.end(fs.readFileSync(path.join(ctx.DIR || __dirname, path.basename(p))));
    return true;
  }
  if (p !== '/api/healschemes') return false;
  if (!ctx.allowed(req, url)) { ctx.send(res, 401, 'text/plain; charset=utf-8', 'Access denied'); return true; }
  if (req.method === 'GET') { try { ctx.json(res, 200, summary(ctx)); } catch (e) { ctx.json(res, 500, { error: e.message }); } return true; }
  if (req.method !== 'POST') { ctx.json(res, 405, { error: 'GET or POST' }); return true; }
  let b = {}; try { let t = ''; for await (const c of req) t += c; b = JSON.parse(t || '{}'); } catch (e) { ctx.json(res, 400, { error: 'bad JSON' }); return true; }
  try { const r = post(ctx, b) || bad(500, 'no result'); const code = r.code || 200; delete r.code; ctx.json(res, code, r); } catch (e) { ctx.json(res, 500, { error: e.message }); }
  return true;
}
module.exports = { handle, summary, post, readFile, fileOf, estimateKnown, charRow };
