// PARTY MOVE (owner 2026-11-01: "Make so i can transfer characters between teams via Dashboard"): move one character to another party, or make
// it the leader of its own new party. Loaded by server.js (one hook, like runstate_api.js). Public (no secrets): /partymove.js.
//   GET  /api/partymove?name=X[&to=Y][&newLeader=Z]   dry run: { name, from, parties: [...], members, needLeader, plan: { ok, error, changes } }
//   POST /api/partymove { name, to, newLeader?, confirm: true }   to = an existing party key | '' (= its own new party, it leads it)
// swarm.config.json accounts[].party is the truth (the running bots read it every minute: swarm.js PARTYMOVE-2026-10-28 - the moved character
// leaves, the old leader ousts it, the new leader invites; no deploy). A NEW party key gets copies of the old party's party-level settings
// (fund_rules / loot_rules / party_auto / run_state parties, party_spots / party_tactics top level) - never over an existing key - and the
// class plan member entries move along (class_plans.json parties.<key>.members). A leader with members can only leave when someone leads the
// rest (newLeader: the rest move to that member's new party key, which gets the copies too). Backups: Settings/backup/partymove_<ts>/.
'use strict';
const fs = require('fs'), path = require('path');
const STATIC = { '/partymove.js': 'application/javascript; charset=utf-8' };
const NAME_RE = /^[A-Za-z0-9_\-]{1,40}$/;
const PARTY_FILES = [['fund_rules.json', 'parties'], ['loot_rules.json', 'parties'], ['party_auto.json', 'parties'], ['run_state.json', 'parties'], ['party_spots.json', 'top'], ['party_tactics.json', 'top']];
const clone = (x) => JSON.parse(JSON.stringify(x));

/** pure: cfg (swarm.config.json), data { <file>: json } -> { ok, error, changes: [text], cfg, data, touched: [files] } (inputs never changed) */
function planMove(cfg0, data0, name, to, newLeader, by) {
  const cfg = clone(cfg0 || {}), data = clone(data0 || {}), changes = [], touched = new Set();
  const acc = (cfg.accounts || []).find(a => a && a.character === name);
  if (!acc) return { ok: false, error: `${name} is not in swarm.config.json` };
  const keyOf = (a) => String(a.party || a.character);
  const from = keyOf(acc), target = to ? String(to) : name;
  const parties = [...new Set((cfg.accounts || []).filter(a => a && a.character && a.enabled !== false).map(keyOf))];
  if (target === from) return { ok: false, error: `${name} is already in party ${from}` };
  if (to && !parties.includes(target)) return { ok: false, error: `there is no party "${target}"` };
  if (!to && parties.includes(name)) return { ok: false, error: `${name} already leads a party` };
  const rest = (cfg.accounts || []).filter(a => a && a.character !== name && keyOf(a) === from).map(a => a.character);
  const isLeader = from === name;
  if (isLeader && rest.length && !newLeader) return { ok: false, error: `${name} leads ${rest.join(', ')}: pick who leads the rest`, needLeader: rest };
  if (newLeader && !(isLeader && rest.includes(newLeader))) return { ok: false, error: `${newLeader} is not one of ${name}'s members` };
  const stamp = new Date().toISOString(), who = by || 'dashboard';
  const copyParty = (src, dst) => {
    PARTY_FILES.forEach(([file, where]) => {
      const j = data[file]; if (!j || typeof j !== 'object') return;
      const o = where === 'top' ? j : j[where]; if (!o || o[src] === undefined) return;
      if (o[dst] !== undefined) { changes.push(`${file}: ${dst} already has its own settings - kept`); return; }
      o[dst] = clone(o[src]);
      if (file === 'run_state.json') Object.assign(o[dst], { at: stamp, by: who, why: `new party (from ${src})` });
      touched.add(file); changes.push(`${file}: ${src}'s party settings copied to ${dst}`);
    });
  };
  const movePlan = (member, src, dst) => {
    const j = data['class_plans.json']; if (!j || !j.parties) return;
    const s = j.parties[src]; if (!s || !s.members || !s.members[member]) return;
    if (!j.parties[dst]) { j.parties[dst] = Object.assign(clone(s), { members: {} }); }
    j.parties[dst].members = j.parties[dst].members || {};
    if (j.parties[dst].members[member]) { changes.push(`class_plans.json: ${member} already has a plan in ${dst} - kept`); return; }
    j.parties[dst].members[member] = s.members[member]; delete s.members[member];
    touched.add('class_plans.json'); changes.push(`class_plans.json: ${member}'s class plan moved ${src} -> ${dst}`);
  };
  const setParty = (member, key) => { const a = cfg.accounts.find(x => x.character === member); a.party = key; changes.push(`swarm.config.json: ${member} -> party ${key}`); };
  // the rest of a leader's party first (they keep the old settings under their new leader's key)
  if (isLeader && newLeader) {
    copyParty(from, newLeader);
    rest.forEach(m => { setParty(m, newLeader); movePlan(m, from, newLeader); });
  }
  if (!to) copyParty(from, name);
  setParty(name, target); movePlan(name, from, target);
  return { ok: true, from, to: target, rest: isLeader ? rest : [], newLeader: newLeader || '', changes, cfg, data, touched: [...touched] };
}

function readJ(f, d) { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch (e) { return d; } }
function writeAtomic(f, text) { const tmp = f + '.partymove.tmp'; fs.writeFileSync(tmp, text); fs.renameSync(tmp, f); }
function files(ctx) { const d = {}; PARTY_FILES.map(x => x[0]).concat(['class_plans.json']).forEach(f => { const j = readJ(path.join(ctx.DATA, f), null); if (j) d[f] = j; }); return d; }
function cfgFile(ctx) { return ctx.CONFIG_FILE || path.join(ctx.ROOT, 'swarm.config.json'); }
function logLine(ctx, t) { try { fs.appendFileSync(path.join(ctx.LOGS, 'dashboard_commands.log'), `${new Date().toISOString()}\tpartymove\t${t}\r\n`); } catch (e) { } }

function info(ctx, name, to, newLeader) {
  const cfg = readJ(cfgFile(ctx), null); if (!cfg) return { error: 'swarm.config.json not readable' };
  const acc = (cfg.accounts || []).find(a => a && a.character === name); if (!acc) return { error: `${name} is not in swarm.config.json` };
  const keyOf = (a) => String(a.party || a.character), from = keyOf(acc);
  const all = (cfg.accounts || []).filter(a => a && a.character && a.enabled !== false);
  const parties = [...new Set(all.map(keyOf))].sort().map(k => ({ key: k, members: all.filter(a => keyOf(a) === k).map(a => a.character) }));
  const members = all.filter(a => keyOf(a) === from && a.character !== name).map(a => a.character);
  const out = { name, from, parties, members, needLeader: from === name && members.length > 0 };
  if (to !== undefined) { const p = planMove(cfg, files(ctx), name, to, newLeader); out.plan = { ok: p.ok, error: p.error || '', changes: p.changes || [], needLeader: p.needLeader || null }; }
  return out;
}

function apply(ctx, b) {
  const name = String(b.name || ''), to = String(b.to || ''), nl = String(b.newLeader || '');
  if (!NAME_RE.test(name) || (to && !NAME_RE.test(to)) || (nl && !NAME_RE.test(nl))) return { code: 400, error: 'bad name' };
  if (b.confirm !== true) return { code: 400, error: 'confirm: true is needed (GET /api/partymove = the dry run)' };
  const CF = cfgFile(ctx), cfg = readJ(CF, null); if (!cfg) return { code: 500, error: 'swarm.config.json not readable' };
  const data = files(ctx), p = planMove(cfg, data, name, to, nl, String(b.by || 'dashboard').slice(0, 60));
  if (!p.ok) return { code: 400, error: p.error, needLeader: p.needLeader || null };
  const B = path.join(ctx.SETTINGS || path.join(ctx.ROOT, 'Settings'), 'backup', 'partymove_' + new Date().toISOString().replace(/[:.]/g, '-'));
  fs.mkdirSync(B, { recursive: true });
  fs.copyFileSync(CF, path.join(B, 'swarm.config.json'));
  p.touched.forEach(f => { try { fs.copyFileSync(path.join(ctx.DATA, f), path.join(B, f)); } catch (e) { } });
  p.touched.forEach(f => writeAtomic(path.join(ctx.DATA, f), JSON.stringify(p.data[f], null, 1)));
  writeAtomic(CF, JSON.stringify(p.cfg, null, 2));
  if (typeof ctx.reloadCfg === 'function') try { ctx.reloadCfg(); } catch (e) { }
  logLine(ctx, `${name}: ${p.from} -> ${p.to}${p.newLeader ? ` (the rest ${p.rest.join(', ')} -> ${p.newLeader})` : ''} | ${p.changes.join(' | ')}`);
  return { ok: true, from: p.from, to: p.to, rest: p.rest, newLeader: p.newLeader, changes: p.changes, backup: B,
    note: 'The bots read swarm.config.json every minute: the in-game party changes by itself (leave / invite) within about a minute.' };
}

async function handle(req, res, url, ctx) {
  const p = url.pathname;
  if (STATIC[p]) { res.writeHead(200, { 'Content-Type': STATIC[p], 'Cache-Control': 'no-cache' }); res.end(fs.readFileSync(path.join(ctx.DIR || __dirname, path.basename(p)))); return true; }
  if (p !== '/api/partymove') return false;
  if (!ctx.allowed(req, url)) { ctx.send(res, 401, 'text/plain; charset=utf-8', 'Access denied'); return true; }
  try {
    if (req.method === 'GET') {
      const q = url.searchParams, name = String(q.get('name') || '');
      if (!NAME_RE.test(name)) { ctx.json(res, 400, { error: 'name=?' }); return true; }
      const r = info(ctx, name, q.has('to') ? String(q.get('to') || '') : undefined, String(q.get('newLeader') || ''));
      ctx.json(res, r.error ? 400 : 200, r); return true;
    }
    if (req.method !== 'POST') { ctx.json(res, 405, { error: 'GET or POST' }); return true; }
    let b = {}; try { let t = ''; for await (const c of req) t += c; b = JSON.parse(t || '{}'); } catch (e) { ctx.json(res, 400, { error: 'bad JSON' }); return true; }
    const r = apply(ctx, b), code = r.code || 200; delete r.code; ctx.json(res, code, r);
  } catch (e) { ctx.json(res, 500, { error: e.message }); }
  return true;
}
module.exports = { handle, planMove, info, apply, PARTY_FILES };
