// QUEST CIRCUIT API (owner 2026-10-25: "make it possible to repeat quest infinite times like circuit page but with quests"):
//   GET  /api/qcircuit                    -> { parties: [{ leader, names, on, mode, quests: [{ id, times, name, type, lv }], state, running }], quests: [{ id, name, type, lv }] }
//   POST /api/qcircuit { party, on?, mode?, quests? }  -> writes Scripts/data/quest_circuits.json (read by swarm.js QUEST CIRCUIT every 30 s)
//   GET  /qcircuitpage.js                 -> the page (#/qcircuit[/<leader>], Dashboard/qcircuitpage.js)
// state = Logs/qcircuit_<leader>.json (the leader's progress: cur, idx, round, runs, skip, last). The party still needs its Start (run switch).
'use strict';
const fs = require('fs'), path = require('path');
const rj = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch (e) { return d; } };
const NAME_RE = /^[A-Za-z0-9_]{2,32}$/;
let QL = { mt: 0, list: [] };
function questList(ctx) {
  const f = path.join(ctx.DATA, 'quests_h5.json'); let mt = 0; try { mt = fs.statSync(f).mtimeMs; } catch (e) { }
  if (QL.mt !== mt) { const j = rj(f, {}), all = Array.isArray(j.quests) ? j.quests : Object.values(j.quests || {});
    const lv = (L) => L && typeof L === 'object' ? [L.min || L.minLevel || null, L.max || L.maxLevel || null] : Number(L) ? [Number(L), null] : null;
    QL = { mt, list: all.filter(q => q && q.id).map(q => ({ id: Number(q.id), name: q.name, type: q.type || '', lv: lv(q.level) })) }; }
  return QL.list;
}
function partiesOf(ctx) {
  const cfg = rj(path.join(ctx.ROOT, 'swarm.config.json'), {}), out = {}, order = [];
  (cfg.accounts || []).forEach(a => { if (!a || !a.character || a.enabled === false) return; const p = String(a.party || a.character); if (!out[p]) { out[p] = []; order.push(p); } out[p].push(a.character); });
  return order.map(l => ({ leader: l, names: out[l] }));
}
const fileOf = (ctx) => path.join(ctx.DATA, 'quest_circuits.json');
function info(ctx) {
  const C = rj(fileOf(ctx), { parties: {} }) || { parties: {} }, Q = questList(ctx), byId = Object.fromEntries(Q.map(q => [q.id, q]));
  return { quests: Q, parties: partiesOf(ctx).map(p => { const e = (C.parties || {})[p.leader] || {};
    return { leader: p.leader, names: p.names, on: !!e.on, mode: e.mode === 'solo' ? 'solo' : 'party', quests: (e.quests || []).map(x => Object.assign({ id: x.id, times: x.times || 1 }, byId[x.id] ? { name: byId[x.id].name, type: byId[x.id].type, lv: byId[x.id].lv } : { name: 'quest ' + x.id })),
      state: rj(path.join(ctx.LOGS, `qcircuit_${p.leader}.json`), null) }; }) };
}
function post(ctx, b) {
  const party = String(b.party || ''); if (!NAME_RE.test(party) || !partiesOf(ctx).some(p => p.leader === party)) return { code: 400, error: 'party (leader name) required' };
  const C = rj(fileOf(ctx), { parties: {} }) || { parties: {} }; C.parties = C.parties || {};
  const e = C.parties[party] = Object.assign({ on: false, mode: 'party', quests: [] }, C.parties[party] || {});
  if (typeof b.on === 'boolean') e.on = b.on;
  if (b.mode === 'solo' || b.mode === 'party') e.mode = b.mode;
  if (Array.isArray(b.quests)) { const ids = new Set(questList(ctx).map(q => q.id)); const L = b.quests.map(x => ({ id: Number(x.id), times: Math.max(1, Math.min(999, Number(x.times) || 1)) })).filter(x => ids.has(x.id)).slice(0, 40);
    if (L.length !== b.quests.length) return { code: 400, error: 'unknown quest id in the list' }; e.quests = L; }
  if (e.on && !e.quests.length) return { code: 400, error: 'add at least one quest before switching the circuit on' };
  e.at = new Date().toISOString(); e.by = String(b.by || 'dashboard').slice(0, 40);
  try { if (fs.existsSync(fileOf(ctx))) { const bk = path.join(ctx.ROOT, 'Settings', 'backup'); fs.mkdirSync(bk, { recursive: true }); fs.copyFileSync(fileOf(ctx), path.join(bk, 'quest_circuits_' + Date.now() + '.json')); } } catch (er) { }
  C._readme = 'QUEST CIRCUIT (owner 2026-10-25): per party leader { on, mode party|solo, quests: [{ id, times }] } — the leader runs the list in a loop forever (swarm.js QUEST CIRCUIT). Edited on the dashboard #/qcircuit.';
  fs.writeFileSync(fileOf(ctx) + '.tmp', JSON.stringify(C, null, 1) + '\n'); fs.renameSync(fileOf(ctx) + '.tmp', fileOf(ctx));
  try { fs.appendFileSync(path.join(ctx.LOGS, 'dashboard_commands.log'), `${e.at}\tqcircuit\t${party} on=${e.on} mode=${e.mode} quests=${e.quests.map(x => x.id + 'x' + x.times).join(',')}\r\n`); } catch (er) { }
  return Object.assign({ ok: true }, info(ctx));
}
async function handle(req, res, url, ctx) {
  if (url.pathname === '/qcircuitpage.js') { res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-cache' }); res.end(fs.readFileSync(path.join(ctx.DIR, 'qcircuitpage.js'))); return true; }
  if (url.pathname !== '/api/qcircuit') return false;
  if (!ctx.allowed(req, url)) { ctx.json(res, 401, { error: 'key' }); return true; }
  try {
    if (req.method === 'POST') { let t = ''; for await (const c of req) t += c; let b; try { b = JSON.parse(t || '{}'); } catch (e) { ctx.json(res, 400, { error: 'bad JSON' }); return true; } const r = post(ctx, b); const code = r.code || 200; delete r.code; ctx.json(res, code, r); return true; }
    ctx.json(res, 200, info(ctx));
  } catch (e) { ctx.json(res, 500, { error: e.message }); }
  return true;
}
module.exports = { handle, info, post };
