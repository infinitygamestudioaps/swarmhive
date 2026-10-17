// COMBAT PROFILE API (COMBATPROFILE-2026-10-17; owner: "I want to be able to setup combat profile inside hive exactly like swarm" + "Build it").
// The character's L2Swarm profile (Settings/<config>.xml: Combat Skills, Auto Skills, Auto Items, follow / assist, range / zone, pickup, shots,
// resurrection, monsters) edited on the dashboard page #/combat/<Name> (Dashboard/combatprofile.js). Loaded by server.js.
//   GET  /api/combatprofile?char=<Name>   { char, file, rev, online, open, profile (Dashboard/combatxml.js model), enums, known skills, bag, party, job }
//   POST /api/combatprofile { action: 'apply', char, profile, rev, force }
//        = a JOB (the page polls GET ... job): checks (no live raid / Kamaloka of its party; not fighting / dead unless force) -> MCP close_account
//          (L2Swarm keeps the profile in memory and writes it on close, so a file edit while the account is open would be lost) -> re-read the
//          file -> backup Settings/backup/combatprofile/<file>_<time>.xml -> write ONLY the changed profile parts (everything else byte-identical,
//          checked; Password line checked) -> MCP open_account -> waits for the character to report again. An account that is not open in
//          L2Swarm: the file is written directly (no close / open).
//        { action: 'cancel', char } = forget a finished / failed job line
// Every apply: one line in Logs/dashboard_commands.log + Logs/combatprofile.log. Never two jobs at once (one character at a time).
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const CX = require('./combatxml');
const STATIC = { '/combatprofile.js': 'application/javascript; charset=utf-8', '/combatprofile.css': 'text/css; charset=utf-8', '/combatxml.js': 'application/javascript; charset=utf-8' };
const NAME_RE = /^[A-Za-z0-9_\-]{1,40}$/;
const isoNow = () => new Date().toISOString();
const sha = (t) => (t ? crypto.createHash('sha1').update(t).digest('hex').slice(0, 16) : '');
const bad = (code, error, extra) => Object.assign({ code, error }, extra || {});
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const rj = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch (e) { return d; } };
const JOBS = {};          // char -> { id, char, phase, steps: [text], ok, error, at, done }
let RUNNING = '';

const setDir = (ctx) => process.env.SWARM_COMBATPROFILE_SETTINGS || ctx.SETTINGS;   // tests: a scratch copy of Settings
function cfg(ctx) { return rj(path.join(ctx.ROOT, 'swarm.config.json'), {}) || {}; }
function account(ctx, name) { return ((cfg(ctx).accounts) || []).find(a => String(a.character || '').toLowerCase() === String(name).toLowerCase()) || null; }
function fileFor(ctx, name) {
  const a = account(ctx, name);
  if (a && a.config) { const f = path.join(setDir(ctx), path.basename(a.config)); if (fs.existsSync(f)) return f; }
  try {   // fallback: the Settings/*.xml that selects this character
    for (const n of fs.readdirSync(setDir(ctx))) { if (!/\.xml$/i.test(n) || n === 'settings.xml') continue; const f = path.join(setDir(ctx), n); const m = fs.readFileSync(f, 'utf8').match(/<SelectedCharacter>([^<]+)</); if (m && m[1].toLowerCase() === String(name).toLowerCase()) return f; }
  } catch (e) { }
  return null;
}
const state = (ctx, name) => rj(path.join(ctx.LOGS, `swarm_state_${name}.json`), null);
const ageSec = (st) => st && st.updated ? (Date.now() - Date.parse(st.updated)) / 1000 : 1e9;
let SKD = null, ITD = null;
function skillData(ctx) { if (!SKD) SKD = rj(path.join(ctx.DIR || __dirname, 'data', 'skills.json'), {}) || {}; return SKD; }
function itemData(ctx) { if (!ITD) ITD = rj(path.join(ctx.DIR || __dirname, 'data', 'items.json'), {}) || {}; return ITD; }
/** what the character knows now (bot report) -> [{ id, name, lvl, mp, op, icon, toggle }] (passives left out) */
function knownSkills(ctx, st) {
  const D = skillData(ctx), out = [];
  ((st && st.ov && st.ov.skills) || []).forEach(s => { const d = D[String(s.id)] || []; const op = String(d[3] || ''); if (op === 'P') return; out.push({ id: s.id, name: d[0] || `skill ${s.id}`, lvl: s.lvl, mp: s.mp, op, icon: d[1] || '', toggle: !!s.tog || op === 'T' }); });
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
function bag(ctx, st) {
  const D = itemData(ctx);
  return ((st && st.ov && st.ov.items) || []).filter(i => i && i.id !== 57).map(i => { const d = D[String(i.id)] || []; return { id: i.id, name: i.name || d[0] || `item ${i.id}`, n: i.n, icon: d[1] || '', kind: d[2] || '' }; });
}
function partyNames(ctx, name) { const me = account(ctx, name); const p = me && me.party; return ((cfg(ctx).accounts) || []).filter(a => p && a.party === p && a.character).map(a => a.character); }
async function openAccounts(ctx) {
  try { const all = JSON.parse(await ctx.mcpCall('get_accounts_status', {})); const list = Array.isArray(all) ? all : (all.accounts || []); return list; } catch (e) { return null; }
}
const liveRaid = (ctx, leader) => {
  const out = [];
  ['raid_live_' + leader + '.json', 'kamaloka_live_' + leader + '.json'].forEach(n => { try { const a = (Date.now() - fs.statSync(path.join(ctx.LOGS, n)).mtimeMs) / 1000; if (a < 60) out.push(n.replace(/_.*/, '').replace('raid', 'a raid').replace('kamaloka', 'a Kamaloka')); } catch (e) { } });
  return out;
};
const logLine = (ctx, char, text) => { try { fs.appendFileSync(path.join(ctx.LOGS, 'combatprofile.log'), `${isoNow()}\t${char}\t${text}\r\n`); } catch (e) { } };

/** entries L2Swarm stored without a name get the client name (display only: an unchanged skill keeps its stored node) */
function named(ctx, P) {
  const SD = skillData(ctx), ID = itemData(ctx);
  P.combatSkills.concat(P.autoSkills).forEach(e => { if (e.id && !e.name) e.name = (SD[String(e.id)] || [])[0] || ''; });
  P.autoItems.forEach(e => { if (e.id && !e.name) e.name = (ID[String(e.id)] || [])[0] || ''; });
  return P;
}
function summary(ctx, name) {
  if (!NAME_RE.test(name)) return bad(400, 'char (character name) required');
  const f = fileFor(ctx, name); if (!f) return bad(404, `No L2Swarm profile file found for ${name} (swarm.config.json "config").`);
  const raw = fs.readFileSync(f, 'utf8');
  if (!/<Option[\s>]/.test(raw)) return bad(500, `${path.basename(f)} is not an L2Swarm profile.`);
  const st = state(ctx, name), a = account(ctx, name);
  return { ok: true, char: name, file: path.basename(f), rev: sha(raw), party: (a && a.party) || '', online: ageSec(st) < 30, level: st ? st.level : null, cls: st ? st.cls : '',
    fighting: !!(st && (st.combat || (st.doing && st.doing.target))), dead: !!(st && st.dead), profile: named(ctx, CX.readProfile(raw)),
    enums: { triggers: CX.TRIGGERS, triggerText: CX.TRIGGER_TEXT, autoSkillTypes: CX.AUTOSKILL_TYPES, autoSkillText: CX.AUTOSKILL_TEXT, autoFields: CX.AUTO_FIELDS,
      autoItemTypes: CX.AUTOITEM_TYPES, autoItemText: CX.AUTOITEM_TEXT, healTypes: CX.HEAL_TYPES, scalars: CX.SCALARS },
    known: knownSkills(ctx, st), bag: bag(ctx, st), partyNames: partyNames(ctx, name), job: JOBS[name] || null, busy: RUNNING || '' };
}

async function runJob(ctx, J, b) {
  const step = (t) => { J.steps.push(`${new Date().toLocaleTimeString('en-GB')} ${t}`); J.at = isoNow(); logLine(ctx, J.char, t); };
  const name = J.char, f = fileFor(ctx, name);
  try {
    let raw0 = fs.readFileSync(f, 'utf8');
    if (b.rev && sha(raw0) !== String(b.rev)) step('the file changed since the page loaded it (L2Swarm saved it) - your changes are put on top of the new file');
    const list = await openAccounts(ctx);
    const open = list ? list.find(a => a.config_path && path.basename(String(a.config_path)).toLowerCase() === path.basename(f).toLowerCase()) : null;
    if (open) {
      J.phase = 'closing'; step('logging the character out (L2Swarm writes its profile on close)');
      await ctx.mcpCall('close_account', { config_path: open.config_path }); J.closed = open.config_path;
      for (let i = 0; i < 20; i++) { await sleep(1000); const l2 = await openAccounts(ctx); if (l2 && !l2.some(a => a.config_path === open.config_path)) break; }
      await sleep(1500);
      raw0 = fs.readFileSync(f, 'utf8');
    } else step('the account is not open in L2Swarm - writing the file directly');
    J.phase = 'writing';
    const out = CX.writeProfile(raw0, b.profile);
    const pw = (t) => (t.match(/<Password>[^<]*<\/Password>/) || [''])[0];
    if (!CX.untouchedSame(raw0, out) || pw(raw0) !== pw(out)) throw new Error('safety check failed: something outside the combat profile would change - nothing written');
    if (out === raw0) step('nothing changed in the file');
    else {
      const bdir = path.join(setDir(ctx), 'backup', 'combatprofile'); fs.mkdirSync(bdir, { recursive: true });
      const bk = path.join(bdir, `${path.basename(f, '.xml')}_${isoNow().replace(/[:.]/g, '-')}.xml`); fs.copyFileSync(f, bk);
      const tmp = f + '.tmp_cp'; fs.writeFileSync(tmp, out, 'utf8'); fs.renameSync(tmp, f);
      step(`profile written (backup ${path.relative(ctx.ROOT, bk)})`);
    }
    if (open) {
      J.phase = 'opening'; step('logging the character in again');
      await ctx.mcpCall('open_account', { config_path: open.config_path }); J.reopened = true;
      const t0 = Date.now(); let back = false;
      while (Date.now() - t0 < 150000) { await sleep(3000); if (ageSec(state(ctx, name)) < 10 && Date.parse((state(ctx, name) || {}).updated || 0) > t0) { back = true; break; } }
      step(back ? 'the character is back in the game' : 'opened - the character has not reported yet (it may still be logging in)');
      const check = CX.readProfile(fs.readFileSync(f, 'utf8')), want = CX.readProfile(out);
      if (JSON.stringify(check.combatSkills.map(s => s.id)) !== JSON.stringify(want.combatSkills.map(s => s.id))) step('note: L2Swarm changed the combat skill list while loading it - reload the page to see what it kept');
    }
    J.ok = true; J.phase = 'done'; step('done');
    try { fs.appendFileSync(path.join(ctx.LOGS, 'dashboard_commands.log'), `${isoNow()}\tcombatprofile\tapply ${name} (${path.basename(f)})\t${String(b.by || 'dashboard').slice(0, 40)}\r\n`); } catch (e) { }
  } catch (e) {
    J.ok = false; J.error = e.message; J.phase = 'failed'; step('FAILED: ' + e.message);
    // never leave a character logged out because of us
    if (J.closed && !J.reopened) { try { await ctx.mcpCall('open_account', { config_path: J.closed }); J.reopened = true; step('logged the character in again'); } catch (x) { step('could not log it in again: ' + x.message); } }
  } finally { J.done = true; RUNNING = ''; }
}

async function post(ctx, b) {
  if (!b || typeof b !== 'object') return bad(400, 'bad body');
  const name = String(b.char || ''); if (!NAME_RE.test(name)) return bad(400, 'char (character name) required');
  if (b.action === 'cancel') { if (JOBS[name] && JOBS[name].done) delete JOBS[name]; return { code: 200, ok: true }; }
  if (b.action !== 'apply') return bad(400, 'action: apply or cancel');
  const f = fileFor(ctx, name); if (!f) return bad(404, `No L2Swarm profile file found for ${name}.`);
  const errors = CX.validate(b.profile); if (errors.length) return bad(400, errors[0], { errors });
  if (RUNNING) return bad(409, `Another profile is being applied right now (${RUNNING}). Try again in a minute.`);
  const a = account(ctx, name), st = state(ctx, name);
  const live = liveRaid(ctx, (a && a.party) || name);
  if (live.length && !b.force) return bad(409, `Party ${(a && a.party) || name} is in ${live.join(' and ')} right now - applying logs ${name} out. Wait until it is over (or apply anyway).`, { canForce: true });
  if (st && ageSec(st) < 30 && (st.combat || st.dead) && !b.force) return bad(409, `${name} is ${st.dead ? 'dead' : 'fighting'} right now - applying logs it out for ~30 s. Apply anyway?`, { canForce: true });
  const J = JOBS[name] = { id: sha(String(Date.now())), char: name, phase: 'starting', steps: [], ok: null, error: '', at: isoNow(), done: false };
  RUNNING = name;
  runJob(ctx, J, b);        // async; the page polls
  return { code: 200, ok: true, job: J };
}

async function handle(req, res, url, ctx) {
  const p = url.pathname;
  if (STATIC[p]) { res.writeHead(200, { 'Content-Type': STATIC[p], 'Cache-Control': 'no-cache' }); res.end(fs.readFileSync(path.join(ctx.DIR || __dirname, path.basename(p)))); return true; }
  if (p !== '/api/combatprofile') return false;
  if (!ctx.allowed(req, url)) { ctx.send(res, 401, 'text/plain; charset=utf-8', 'Access denied'); return true; }
  if (req.method === 'GET') { try { const r = summary(ctx, String(url.searchParams.get('char') || '')); const code = r.code || 200; delete r.code; ctx.json(res, code, r); } catch (e) { ctx.json(res, 500, { error: e.message }); } return true; }
  if (req.method !== 'POST') { ctx.json(res, 405, { error: 'GET or POST' }); return true; }
  let b = {}; try { let t = ''; for await (const c of req) t += c; b = JSON.parse(t || '{}'); } catch (e) { ctx.json(res, 400, { error: 'bad JSON' }); return true; }
  try { const r = await post(ctx, b) || bad(500, 'no result'); const code = r.code || 200; delete r.code; ctx.json(res, code, r); } catch (e) { ctx.json(res, 500, { error: e.message }); }
  return true;
}
module.exports = { handle, summary, post, fileFor, STATIC, _jobs: JOBS };
