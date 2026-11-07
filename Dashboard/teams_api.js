// TEAMS PAGE API (TEAMS-2026-11-03, owner: "from now on I want an easy way to re-arrange the groups and teams across - should be extremely easy to
// do from mobile or pc. Selecting which should be able to do what."). Read-only view of every party + member + the roles each one has TODAY, from
// the files those roles already live in (no new mechanics - owner: "don't make up new things we already have working"):
//   bank / crafter / runner (+ runnerOn) / bank takes from the clan warehouse  Scripts/data/crafter.json  (written by POST /api/crafterpage settings)
//   crafter switched on                                                        Scripts/data/crafter_rules.json crafters.<Name>.on (POST /api/crafter)
//   collector / letters receiver                                               Scripts/data/stash_rules.json collector / letters.to (POST /api/storage)
//   power-level leveler / healer                                               Scripts/data/powerlevel.json pairs (POST /api/powerlevel)
//   benched                                                                    Scripts/data/run_state.json chars.<Name>.on === false (POST /api/runstate)
//   role (spoiler, healer, nuker, ...) + clan leader                           swarm.config.json accounts[].role / clanLeader (shown, not edited here)
// Moves use the EXISTING /api/partymove (dry run + POST, backups in Settings/backup/partymove_<ts>/). This file adds only the UNDO of the last move:
//   GET  /api/teams                       { ok, parties: [{ key, leader, on, members: [{ name, cls, classId, level, online, role, roles: {..} }] }],
//                                           settings: { bank, crafter, runner, runnerOn, cwhWithdraw, collector, lettersTo, clanLeader }, pairs,
//                                           undo: { ts, dir, moves: [{ name, from, to }] } | null }
//   POST /api/teams { op: 'undo', confirm: true }   puts every character's party back as it was before the last not-undone party move
//                                           (only swarm.config.json accounts[].party + the moved members' class plans - every other setting stays);
//                                           marks that backup undone (undone.txt), a backup of the state before the undo, one log line.
//   /teamspage.js                          the page (#/teams)
'use strict';
const fs = require('fs'), path = require('path');
const rj = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch (e) { return d; } };
const obj = (o) => (o && typeof o === 'object' && !Array.isArray(o)) ? o : {};
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const STATIC = { '/teamspage.js': 'text/javascript; charset=utf-8' };
const HEALER_RE = /^(bishop|shilliensaint|healer|elder|cardinal|evasaint|shillientemplar)$/i;
const SPOIL_RE = /Bounty Hunter|Scavenger|Fortune Seeker/i;

/** pure: the teams view. cfg = swarm.config.json, f = { crafter, crafterRules, stash, powerlevel, runState }, states = [{ name, cls, classId, level, ageSec }] */
function view(cfg, f, states) {
  cfg = obj(cfg); f = obj(f);
  const st = {}; (states || []).forEach(s => { if (s && s.name) st[s.name] = s; });
  const C = obj(f.crafter), CR = obj(obj(f.crafterRules).crafters), S = obj(f.stash), PL = Array.isArray(obj(f.powerlevel).pairs) ? f.powerlevel.pairs : [];
  const RS = obj(f.runState), RP = obj(RS.parties), RC = obj(RS.chars);
  const healerRoles = Array.isArray(cfg.healerRoles) && cfg.healerRoles.length ? cfg.healerRoles.map(String) : null;
  const col = obj(S.collector), lettersTo = String(obj(S.letters).to || '');
  const clanLeader = String(cfg.clanLeader || '');
  const accs = (cfg.accounts || []).filter(a => a && a.character && a.enabled !== false);
  const keyOf = (a) => String(a.party || a.character);
  const roles = (a) => {
    const n = a.character, s = st[n] || {}, role = String(a.role || '');
    const pl = PL.find(p => p && (p.leveler === n || p.healer === n));
    return {
      bank: !!C.bank && C.bank === n, crafter: (!!C.crafter && C.crafter === n) || !!obj(CR[n]).on, runner: !!C.runner && C.runner === n, runnerOn: !!C.runner && C.runner === n && C.runnerOn === true,
      cwh: !!C.bank && C.bank === n && C.cwhWithdraw !== false, collector: col.on === true && (col.name ? col.name === n : n === clanLeader),
      letters: lettersTo === n || (lettersTo === 'clanleader' && n === clanLeader), clanLeader: n === clanLeader,
      plLeveler: !!pl && pl.leveler === n, plHealer: !!pl && pl.healer === n, plWith: pl ? (pl.leveler === n ? pl.healer : pl.leveler) : '', plOn: !!pl && pl.on === true,
      benched: obj(RC[n]).on === false,
      healerOnly: healerRoles ? healerRoles.includes(role) : HEALER_RE.test(role),
      spoiler: /^spoiler$/i.test(role) || SPOIL_RE.test(String(s.cls || '')),
    };
  };
  const keys = [...new Set(accs.map(keyOf))];
  const parties = keys.map(k => {
    const ms = accs.filter(a => keyOf(a) === k).sort((x, y) => (x.character === k ? -1 : y.character === k ? 1 : 0) || String(x.character).localeCompare(String(y.character)));
    return { key: k, leader: ms.some(a => a.character === k) ? k : (ms[0] && ms[0].character) || k, on: obj(RP[k]).on === true,
      members: ms.map(a => { const s = st[a.character] || {}; return { name: a.character, cls: String(s.cls || ''), classId: s.classId != null ? num(s.classId) : null, level: s.level != null ? num(s.level) : null,
        online: s.ageSec != null && num(s.ageSec) < 120, dead: !!s.dead, role: String(a.role || ''), roles: roles(a) }; }) };
  }).sort((a, b) => b.members.length - a.members.length || a.key.localeCompare(b.key));
  return { parties, settings: { bank: String(C.bank || ''), crafter: String(C.crafter || ''), runner: String(C.runner || ''), runnerOn: C.runnerOn === true, cwhWithdraw: C.cwhWithdraw !== false,
    collector: { on: col.on === true, name: String(col.name || '') }, lettersTo, clanLeader }, pairs: PL };
}

/** pure: the undo of one party move. cur / bak = swarm.config.json now / before the move; cpCur / cpBak = class_plans.json now / before
 *  -> { ok, error, moves: [{ name, from, to }], cfg, classPlans } - only accounts[].party and the moved members' class plans change back */
function planUndo(cur, bak, cpCur, cpBak) {
  cur = JSON.parse(JSON.stringify(obj(cur))); const B = obj(bak);
  const bakParty = {}; (B.accounts || []).forEach(a => { if (a && a.character) bakParty[a.character] = String(a.party || a.character); });
  const moves = [];
  (cur.accounts || []).forEach(a => {
    if (!a || !a.character || !(a.character in bakParty)) return;
    const now = String(a.party || a.character), was = bakParty[a.character];
    if (now !== was) { moves.push({ name: a.character, from: now, to: was }); a.party = was; }
  });
  if (!moves.length) return { ok: false, error: 'nothing to undo: every character is already in the party it had before that move', moves: [] };
  let classPlans = null;
  if (cpCur && cpBak) {
    classPlans = JSON.parse(JSON.stringify(cpCur)); const P = obj(classPlans.parties), PB = obj(obj(cpBak).parties);
    moves.forEach(m => {
      const src = obj(P[m.from]), back = obj(obj(PB[m.to]).members)[m.name];
      if (back === undefined) return;
      if (src.members && src.members[m.name] !== undefined) delete src.members[m.name];
      if (!P[m.to]) P[m.to] = Object.assign({}, PB[m.to], { members: {} });
      P[m.to].members = obj(P[m.to].members); P[m.to].members[m.name] = back;
    });
    classPlans.parties = P;
  }
  return { ok: true, moves, cfg: cur, classPlans };
}

function cfgFile(ctx) { return ctx.CONFIG_FILE || path.join(ctx.ROOT, 'swarm.config.json'); }
function backupRoot(ctx) { return path.join(ctx.SETTINGS || path.join(ctx.ROOT, 'Settings'), 'backup'); }
/** the newest party-move backup that was not undone yet: { ts, dir } | null */
function lastBackup(ctx) {
  let L = []; try { L = fs.readdirSync(backupRoot(ctx)).filter(d => /^partymove_\d{4}-/.test(d)).sort().reverse(); } catch (e) { return null; }
  for (const d of L) { const dir = path.join(backupRoot(ctx), d); if (fs.existsSync(path.join(dir, 'undone.txt'))) continue; if (!fs.existsSync(path.join(dir, 'swarm.config.json'))) continue; return { ts: d.slice('partymove_'.length), dir }; }
  return null;
}
function undoInfo(ctx) {
  const b = lastBackup(ctx); if (!b) return null;
  const p = planUndo(rj(cfgFile(ctx), {}), rj(path.join(b.dir, 'swarm.config.json'), {}), null, null);
  return { ts: b.ts, dir: path.basename(b.dir), moves: p.moves || [], error: p.ok ? '' : p.error };
}
function writeAtomic(f, text) { const tmp = f + '.teams.tmp'; fs.writeFileSync(tmp, text); fs.renameSync(tmp, f); }
function doUndo(ctx, b) {
  if (obj(b).confirm !== true) return { code: 400, error: 'confirm: true is needed (GET /api/teams shows what the undo changes)' };
  const last = lastBackup(ctx); if (!last) return { code: 400, error: 'no party move to undo' };
  const CF = cfgFile(ctx), cpF = path.join(ctx.DATA, 'class_plans.json');
  const cpBakF = path.join(last.dir, 'class_plans.json');
  const p = planUndo(rj(CF, {}), rj(path.join(last.dir, 'swarm.config.json'), {}), fs.existsSync(cpBakF) ? rj(cpF, null) : null, fs.existsSync(cpBakF) ? rj(cpBakF, null) : null);
  if (!p.ok) { try { fs.writeFileSync(path.join(last.dir, 'undone.txt'), `${new Date().toISOString()} nothing to undo\r\n`); } catch (e) { } return { code: 400, error: p.error }; }
  const B = path.join(backupRoot(ctx), 'partymove_undo_' + new Date().toISOString().replace(/[:.]/g, '-'));
  fs.mkdirSync(B, { recursive: true }); fs.copyFileSync(CF, path.join(B, 'swarm.config.json')); if (p.classPlans) try { fs.copyFileSync(cpF, path.join(B, 'class_plans.json')); } catch (e) { }
  if (p.classPlans) writeAtomic(cpF, JSON.stringify(p.classPlans, null, 1));
  writeAtomic(CF, JSON.stringify(p.cfg, null, 2));
  fs.writeFileSync(path.join(last.dir, 'undone.txt'), `${new Date().toISOString()} undone by ${String(obj(b).by || 'dashboard').slice(0, 60)}\r\n`);
  if (typeof ctx.reloadCfg === 'function') try { ctx.reloadCfg(); } catch (e) { }
  try { fs.appendFileSync(path.join(ctx.LOGS, 'dashboard_commands.log'), `${new Date().toISOString()}\tteams\tundo ${path.basename(last.dir)}: ${p.moves.map(m => `${m.name} ${m.from} -> ${m.to}`).join(', ')}\r\n`); } catch (e) { }
  return { code: 200, ok: true, moves: p.moves, backup: B, note: 'The bots read swarm.config.json every minute: the in-game parties change by themselves within about a minute.' };
}
function info(ctx) {
  const D = ctx.DATA;
  const f = { crafter: rj(path.join(D, 'crafter.json'), {}), crafterRules: rj(path.join(D, 'crafter_rules.json'), {}), stash: rj(process.env.SWARM_STASHRULES_FILE || path.join(D, 'stash_rules.json'), {}),
    powerlevel: rj(path.join(D, 'powerlevel.json'), {}), runState: rj(path.join(D, 'run_state.json'), {}) };
  let states = []; try { states = ctx.readStates ? ctx.readStates() : []; } catch (e) { }
  const v = view(rj(cfgFile(ctx), {}), f, states);
  return Object.assign({ ok: true, at: new Date().toISOString() }, v, { undo: undoInfo(ctx) });
}
async function handle(req, res, url, ctx) {
  if (STATIC[url.pathname]) {
    let body; try { body = fs.readFileSync(path.join(ctx.DIR || __dirname, url.pathname.slice(1))); } catch (e) { res.writeHead(404); res.end('not found'); return true; }
    res.writeHead(200, { 'Content-Type': STATIC[url.pathname], 'Cache-Control': 'no-cache' }); res.end(body); return true;
  }
  if (url.pathname !== '/api/teams') return false;
  if (!ctx.allowed(req, url)) { ctx.send(res, 401, 'text/plain; charset=utf-8', 'Access denied'); return true; }
  try {
    if (req.method === 'GET') { ctx.json(res, 200, info(ctx)); return true; }
    if (req.method !== 'POST') { ctx.json(res, 405, { error: 'GET or POST' }); return true; }
    let b = {}; try { let t = ''; for await (const c of req) t += c; b = JSON.parse(t || '{}'); } catch (e) { ctx.json(res, 400, { error: 'bad JSON' }); return true; }
    if (b.op !== 'undo') { ctx.json(res, 400, { error: "op: 'undo' (moves go through /api/partymove, roles through their own pages' APIs)" }); return true; }
    const r = doUndo(ctx, b), code = r.code || 200; delete r.code; ctx.json(res, code, r);
  } catch (e) { ctx.json(res, 500, { error: e.message }); }
  return true;
}
module.exports = { handle, info, view, planUndo, lastBackup, doUndo };
