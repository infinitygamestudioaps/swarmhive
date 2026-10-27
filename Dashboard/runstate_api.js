// RUN SWITCH API (owner 2026-10-13 17:50: "You don't need to start the bots automatically ... it would be nice if you could just stop them
// and switch them on as you like"; rule: nothing automatic unless the player switched it on). The manual Start / Stop per party and per
// character. Loaded by server.js (one hook, like fundpage_api.js). Public (no secrets): /runswitch.js, /runswitch.css.
//   GET  /api/runstate                 summary(): { default, parties: [{ leader, on, src, at, by, why, members, held, task, seen, plan }], chars, updated }
//   POST /api/runstate { party, on }   the party's switch (+ resets its members' own switches) and sends !start / !stop to the party
//        { char, on: true|false|null } a member's own switch (false = it stands still; true / null = back to the party's switch; the bot's
//                                      3 s watch applies it, no order is sent); a party leader's character = that party's switch
//        { all: true, on }             every party (+ every character switch reset), !start / !stop to every party
//        { char, handsOff: true|false } HANDSOFF-2026-10-26: that character's hands-off switch (handsOff.<name>; never reset by Start / Stop)
//        send: false                   only write the file (tests)
// File: Scripts/data/run_state.json (env SWARM_RUNSTATE_FILE overrides it), read by swarm.js runData() every 2 s. Missing = everything OFF.
//   { v: 1, default: false, parties: { <leader>: { on, at, by, why } }, chars: { <member>: { on: false, at, by } } }
'use strict';
const fs = require('fs'), path = require('path');
const STATIC = { '/runswitch.js': 'application/javascript; charset=utf-8', '/runswitch.css': 'text/css; charset=utf-8' };
const NAME_RE = /^[A-Za-z0-9_\-]{1,40}$/;
let G = null;
function guard(ctx) { if (!G) G = require(path.join(ctx.ROOT || path.join(__dirname, '..'), 'docs', 'plan', 'tools', 'manual_guard.js')); return G; }
const fileOf = (ctx) => process.env.SWARM_RUNSTATE_FILE || (ctx && ctx.runStateFile) || path.join(ctx.DATA, 'run_state.json');
const isoNow = () => new Date().toISOString();

// ---- the same rules as swarm.js RUNSTATE-PURE (docs/plan/tools/test_run_state.js checks both give the same answers)
function runNorm(j) {
  const o = j && typeof j === 'object' && !Array.isArray(j) ? j : {};
  const obj = (x) => x && typeof x === 'object' && !Array.isArray(x) ? x : {};
  return Object.assign({}, o, { v: 1, default: o.default === true, parties: obj(o.parties), chars: obj(o.chars) });
}
// HANDSOFF-2026-10-26: handsOff.<name> = { on: true, at, by } (own map: party Start / Stop / Start all never reset it; missing = OFF). = swarm.js runHandsOff
function runHandsOff(j, name) {
  const h = j && typeof j === 'object' && j.handsOff && typeof j.handsOff === 'object' && !Array.isArray(j.handsOff) ? j.handsOff[name] : null;
  return !!(h && typeof h === 'object' && h.on === true);
}
function runEffective(j, me, leader) {
  const J = runNorm(j), p = J.parties[leader], c = me !== leader ? J.chars[me] : null;
  const pOn = p && typeof p.on === 'boolean' ? p.on : J.default;
  if (runHandsOff(J, me)) { const h = J.handsOff[me]; return { on: false, held: me !== leader, partyOn: pOn, src: 'handsoff', at: h.at || null, by: h.by || '', why: 'hands off', handsOff: true }; }   // HANDSOFF-2026-10-26
  if (c && typeof c.on === 'boolean') return { on: c.on, held: c.on === false, partyOn: pOn, src: 'char', at: c.at || null, by: c.by || '', why: c.why || '' };
  return { on: pOn, held: false, partyOn: pOn, src: p && typeof p.on === 'boolean' ? 'party' : 'default', at: p ? p.at || null : null, by: p ? p.by || '' : '', why: p ? p.why || '' : '' };
}
function runStartPlan(x) {
  const s = x || {}, sp = s.spot && typeof s.spot === 'object' ? s.spot : null, solo = !!s.solo;
  // PLAN-2026-10-13: a plan that is switched on and not finished = Start runs the plan (x.plan = planStartInfo)
  if (s.plan && s.plan.on && s.plan.left > 0) {
    if (s.plan.running) return { act: 'already', solo, text: `already running your plan (${s.plan.text}) — nothing new started` };
    if (s.plan.status === 'waiting') return { act: 'plan', solo, text: `your plan waits for you at ${s.plan.text} — press Continue in 📋 Plan` };
    return { act: 'plan', solo, text: `your plan${s.plan.name ? ' "' + s.plan.name + '"' : ''}: ${s.plan.text}` };
  }
  if (s.busy) return { act: 'already', solo, text: `already running (${s.busy}) — nothing new started` };
  if (s.circuit && s.circuit.on && Number(s.circuit.bosses) > 0) return { act: 'circuit', solo, text: `the raid circuit (${s.circuit.bosses} boss${Number(s.circuit.bosses) === 1 ? '' : 'es'} on its list)` };
  const ns = sp && sp.nonstop ? ' — nonstop: no automatic town / supply trips' : '';
  if (sp && sp.kind === 'here') return { act: 'level', solo, text: `hunt here 24/7 at ${sp.spot || 'the saved place'} (no town trips)` };
  if (sp && sp.mode === 'manual') return { act: 'level', solo, text: `leveling at your chosen spot: ${sp.spot || sp.dungeon || sp.region || '?'}${sp.roomIds && sp.roomIds.length > 1 ? ` (${sp.roomIds.length} rooms)` : sp.areaIds && sp.areaIds.length > 1 ? ` (${sp.areaIds.length} areas)` : ''}${ns}` };
  if (sp && Array.isArray(sp.stages) && sp.stages.length) return { act: 'level', solo, text: `leveling with your level stages (${sp.stages.length}; the leader picks a spot below the first)${ns}` };
  return { act: 'level', solo, text: `leveling: ${solo ? 'it picks' : 'the leader picks'} a hunting spot for the ${solo ? '' : "party's "}level${solo ? '' : ' (regroup in Giran first)'}${ns}` };
}

function readState(ctx) {
  const F = fileOf(ctx); let raw = '';
  try { raw = fs.readFileSync(F, 'utf8'); } catch (e) { return { exists: false, data: runNorm({}) }; }
  try { return { exists: true, data: runNorm(raw.trim() ? JSON.parse(raw.replace(/^﻿/, '')) : {}) }; } catch (e) { return { exists: true, data: null, broken: e.message }; }
}
/** what Start will do for this party: the circuit (raid_circuits.json, owner install only) / its spot choice (party_spots.json) / leveling */
function startPlanFor(ctx, leader, solo) {
  const rj = (f, d) => { try { return ctx.readJson ? ctx.readJson(path.join(ctx.DATA, f), d) : JSON.parse(fs.readFileSync(path.join(ctx.DATA, f), 'utf8').replace(/^﻿/, '')); } catch (e) { return d; } };
  let circuit = null;
  try { const rc = rj('raid_circuits.json', null), p = rc && rc.parties ? rc.parties[leader] : null; if (p) { const on = Object.assign({ on: false }, rc.defaults || {}, p).on === true; circuit = { on, bosses: (Array.isArray(p.bosses) ? p.bosses : []).filter(b => b != null && !(typeof b === 'object' && b.off === true)).length }; } } catch (e) { }
  const spots = rj('party_spots.json', {}) || {};
  let plan = null;   // PLAN-2026-10-13: the party's plan as Start sees it (Dashboard/partyplan_api.js; the step text in the bots' short words)
  try {
    const PA = require('./partyplan_api'), P = PA.readPlans(ctx), pl = P.data && P.data.parties[leader];
    if (pl && pl.steps.length) {
      const PLg = require('./planlogic'), prog = PA.readProgress(ctx, leader) || {}, idx = PLg.planCursor(pl, prog), n = pl.steps.length;
      plan = { on: !!pl.on, name: pl.name, n, left: Math.max(0, n - idx), idx, status: String(prog.status || 'idle'), running: false,
        text: idx < n ? `step ${idx + 1}/${n}: ${PLg.stepText(pl.steps[idx], {})}` : 'finished' };
    }
  } catch (e) { }
  return runStartPlan({ circuit, spot: spots[leader] || null, solo: !!solo, busy: '', plan });
}
/** the parties (leader -> member names): from the bots' state files (party = teamMap), plus parties known only from swarm.config.json */
function partiesOf(ctx, chars) {
  const out = {};
  (chars || []).forEach(c => { const p = ctx.partyOf ? ctx.partyOf(c) : (c.party || c.name); (out[p] = out[p] || []).push(c.name); });
  try { if (ctx.teamMap) { const K = require('./kamapage_api'); K.partyList(ctx).forEach(({ leader, names }) => { out[leader] = [...new Set((out[leader] || []).concat(names))]; }); } } catch (e) { }
  Object.keys(out).forEach(l => { out[l] = [l].concat(out[l].filter(n => n !== l)); });
  return out;
}
/** summary for the page (also part of /api/state as STATE.run) */
function summary(ctx, chars) {
  const R = readState(ctx), J = R.data || runNorm({}), P = partiesOf(ctx, chars), byName = {};
  (chars || []).forEach(c => { byName[c.name] = c; });
  const parties = Object.keys(P).sort().map(leader => {
    const e = runEffective(J, leader, leader), lc = byName[leader] || null, members = P[leader];
    const held = members.filter(n => n !== leader && runEffective(J, n, leader).held && !runHandsOff(J, n));   // HANDSOFF: listed apart (handsOff)
    const seen = lc && lc.run && typeof lc.run.on === 'boolean' ? lc.run.on : null;   // what the leader's window sees (null = older swarm.js / offline)
    return { leader, on: !!e.on, src: e.src, at: e.at, by: e.by, why: e.why, members, held, task: lc ? String(lc.task || '') : '', online: !!(lc && lc.ageSec <= 30),
      seen, plan: startPlanFor(ctx, leader, members.length <= 1) };
  });
  const chars2 = {}; Object.keys(J.chars).forEach(n => { const c = J.chars[n]; if (c && typeof c.on === 'boolean') chars2[n] = { on: c.on, at: c.at || null, by: c.by || '' }; });
  const ho = {}; const H = J.handsOff && typeof J.handsOff === 'object' && !Array.isArray(J.handsOff) ? J.handsOff : {}; Object.keys(H).forEach(n => { if (runHandsOff(J, n)) ho[n] = { on: true, at: H[n].at || null, by: H[n].by || '' }; });   // HANDSOFF-2026-10-26
  return { default: J.default, exists: R.exists, broken: R.broken || null, parties, chars: chars2, handsOff: ho, updated: J._updated || null };
}

// ---- write
function bad(code, error) { return { code, error }; }
function write(ctx, mutate, label, by) {
  const F = fileOf(ctx), Gd = guard(ctx); let result = null;
  fs.mkdirSync(path.dirname(F), { recursive: true });
  Gd.withLock(F, () => {
    const R = readState(ctx);
    if (R.broken) { result = bad(500, `run_state.json does not parse (${R.broken}) — fix or delete it (deleted = every party OFF)`); return; }
    const J = R.data; mutate(J);
    J._updated = isoNow();
    Gd.atomicWrite(F, JSON.stringify(J, null, 1) + '\n');
    try { fs.appendFileSync(path.join(ctx.LOGS, 'dashboard_commands.log'), `${isoNow()}\trunstate\t${label}\t${by}\r\n`); } catch (e) { }
    result = { code: 200, ok: true };
  }, { who: 'runstate ' + label });
  return result;
}
async function post(ctx, b) {
  if (!b || typeof b !== 'object') return bad(400, 'bad body');
  const chars = ctx.readStates ? ctx.readStates() : [], P = partiesOf(ctx, chars), by = String(b.by || 'dashboard').slice(0, 40), at = isoNow(), send = b.send !== false;
  const sends = [];
  const setParty = (J, leader, on) => { J.parties[leader] = { on: !!on, at, by, why: on ? 'Start on the dashboard' : 'Stop on the dashboard' }; (P[leader] || []).forEach(n => { if (n !== leader) delete J.chars[n]; }); };
  let r;
  if (b.all === true) {
    if (typeof b.on !== 'boolean') return bad(400, 'on (true / false) required');
    const leaders = Object.keys(P); if (!leaders.length) return bad(404, 'no parties known');
    r = write(ctx, (J) => { leaders.forEach(l => setParty(J, l, b.on)); J.chars = {}; }, `all ${b.on ? 'ON' : 'OFF'}`, by);
    leaders.forEach(l => sends.push({ cmd: b.on ? '!start' : '!stop', target: 'party:' + l }));
  } else if (b.party != null) {
    const leader = String(b.party); if (!NAME_RE.test(leader) || leader.startsWith('_')) return bad(400, 'party (leader name) required');
    if (typeof b.on !== 'boolean') return bad(400, 'on (true / false) required');
    r = write(ctx, (J) => setParty(J, leader, b.on), `party ${leader} ${b.on ? 'ON' : 'OFF'}`, by);
    sends.push({ cmd: b.on ? '!start' : '!stop', target: 'party:' + leader });
  } else if (b.char != null && b.handsOff !== undefined) {           // HANDSOFF-2026-10-26: { char, handsOff: true | false } — no order is sent, the bot reads it within 2 s
    const name = String(b.char); if (!NAME_RE.test(name)) return bad(400, 'char (character name) required');
    if (typeof b.handsOff !== 'boolean') return bad(400, 'handsOff: true (Hive leaves it alone) or false (back to normal)');
    r = write(ctx, (J) => { const H = J.handsOff && typeof J.handsOff === 'object' && !Array.isArray(J.handsOff) ? J.handsOff : {}; if (b.handsOff) H[name] = { on: true, at, by }; else delete H[name]; if (Object.keys(H).length) J.handsOff = H; else delete J.handsOff; }, `char ${name} hands off ${b.handsOff ? 'ON' : 'OFF'}`, by);
  } else if (b.char != null) {
    const name = String(b.char); if (!NAME_RE.test(name)) return bad(400, 'char (character name) required');
    const leader = Object.keys(P).find(l => (P[l] || []).includes(name)) || null;
    if (leader === name || !leader) {                                   // a party leader / a character alone: its party's switch
      if (typeof b.on !== 'boolean') return bad(400, `${name} leads its party: on (true / false) required`);
      r = write(ctx, (J) => setParty(J, name, b.on), `party ${name} ${b.on ? 'ON' : 'OFF'} (from its character page)`, by);
      sends.push({ cmd: b.on ? '!start' : '!stop', target: 'party:' + name });
    } else {
      if (!(b.on === false || b.on === true || b.on === null)) return bad(400, 'on: false (stop it), true or null (back to the party switch)');
      r = write(ctx, (J) => { if (b.on === false) J.chars[name] = { on: false, at, by, why: 'Stop on the dashboard' }; else delete J.chars[name]; }, `char ${name} ${b.on === false ? 'OFF (held)' : 'back to the party'}`, by);
    }
  } else return bad(400, 'party, char or all required');
  if (!r || r.code !== 200) return r || bad(500, 'not written');
  const sent = [];
  if (send && ctx.commandRun) for (const s of sends) { try { const x = await ctx.commandRun({ cmd: s.cmd, target: s.target, by: 'runswitch' }); sent.push({ target: s.target, cmd: s.cmd, ok: !!(x && x.body && !x.body.error), error: x && x.body && x.body.error || null }); } catch (e) { sent.push({ target: s.target, cmd: s.cmd, ok: false, error: e.message }); } }
  return { code: 200, ok: true, sent, state: summary(ctx, ctx.readStates ? ctx.readStates() : chars) };
}

async function handle(req, res, url, ctx) {
  const p = url.pathname;
  if (STATIC[p]) {
    res.writeHead(200, { 'Content-Type': STATIC[p], 'Cache-Control': 'no-cache' });
    res.end(fs.readFileSync(path.join(ctx.DIR || __dirname, path.basename(p))));
    return true;
  }
  if (p !== '/api/runstate') return false;
  if (!ctx.allowed(req, url)) { ctx.send(res, 401, 'text/plain; charset=utf-8', 'Access denied'); return true; }
  if (req.method === 'GET') { try { ctx.json(res, 200, summary(ctx, ctx.readStates ? ctx.readStates() : [])); } catch (e) { ctx.json(res, 500, { error: e.message }); } return true; }
  if (req.method !== 'POST') { ctx.json(res, 405, { error: 'GET or POST' }); return true; }
  let b = {}; try { let t = ''; for await (const c of req) t += c; b = JSON.parse(t || '{}'); } catch (e) { ctx.json(res, 400, { error: 'bad JSON' }); return true; }
  try { const r = await post(ctx, b) || bad(500, 'no result'); const code = r.code || 200; delete r.code; ctx.json(res, code, r); } catch (e) { ctx.json(res, 500, { error: e.message }); }
  return true;
}
module.exports = { runHandsOff, handle, summary, post, readState, fileOf, runNorm, runEffective, runStartPlan, startPlanFor, partiesOf };
