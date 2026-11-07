// RUNNERPAGE-2026-11-03 (owner: "I want a page dedicated to the runner, where you can see the parties that are calling for him, what they have of
// loot for him, what is next in the line and make sure the state is kept EVEN after restart or redeployment").
//   GET  /api/runner            the runner page's data: settings, live state, the trip now, the call queue, the rotation line (next parties in
//                               order + skipped with why), per party what it has for the runner (per member: kinds the take rules would take, bag %),
//                               the last trips + what the bank did with each delivery
//   POST /api/runner { op: 'skip' | 'up', party }   a queue edit for the runner (Logs/runner_queue_edit.json; the runner applies it within 10 s)
//   /runnerpage.js              the page (#/runner)
// All runner state lives in Logs/ (written by swarm.js, tmp + copy): runner_state.json, runner_queue.json, runner_trip.json, runner_trips.json,
// runner_rotation.json, runner_bank.json - nothing is kept only in memory, a restart / deploy / re-login reads the same files again.
const fs = require('fs'), path = require('path');
const rj = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch (e) { return d; } };
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const NAME_RE = /^[A-Za-z0-9_.-]{1,40}$/;
const obj = (o) => (o && typeof o === 'object' && !Array.isArray(o)) ? o : {};

/** pure: is a party's load worth a visit (same rule as swarm.js crunWorth) */
function worth(kinds, bagPct) { return num(kinds) > 20 || num(bagPct) > 50; }
/** pure: the rotation line. parties = [{ party, on, hunting, kinds, bagPct }], visited = { party: ms }, exclude = [names]
 *  -> { next: [{ party, lastMin, kinds, bagPct, dueInMin }], skipped: [{ party, why }] } - the same order the runner uses */
function rotationLine(parties, visited, nowMs, rotateMin, exclude) {
  const gap = Math.max(10, num(rotateMin) || 60) * 60000, ex = new Set(exclude || []), V = obj(visited), next = [], skipped = [];
  (parties || []).forEach(p => {
    if (!p || !p.party || ex.has(p.party)) return;
    if (!p.on) return skipped.push({ party: p.party, why: 'party switched off' });
    if (!p.hunting) return skipped.push({ party: p.party, why: p.raid || 'not hunting at its spot (town / travel / raid / instance)' });   // RUNNERRAID-2026-11-03: 'raid circuit: pulling - later'
    if (!worth(p.kinds, p.bagPct)) return skipped.push({ party: p.party, why: `nothing worth taking yet (${num(p.kinds)} kinds, bag ${num(p.bagPct)} %)` });
    const last = num(V[p.party]), lastMin = last ? Math.round((nowMs - last) / 60000) : null;
    next.push({ party: p.party, raid: p.raid || '', lastMin, kinds: num(p.kinds), bagPct: num(p.bagPct), dueInMin: last ? Math.max(0, Math.ceil((gap - (nowMs - last)) / 60000)) : 0, last });
  });
  next.sort((a, b) => a.dueInMin - b.dueInMin || a.last - b.last || b.bagPct - a.bagPct);
  return { next: next.map(({ last, ...r }) => r), skipped };
}
/** pure: a queue edit request -> the rows to append to runner_queue_edit.json, or an error */
function editRow(b) {
  b = obj(b); const op = String(b.op || ''), party = String(b.party || '');
  if (!/^(skip|up)$/.test(op)) return { error: 'op: skip | up' };
  if (!NAME_RE.test(party)) return { error: 'party (leader name) required' };
  return { row: { op, party, at: Date.now() } };
}

function cfgAccounts(ctx) { const c = rj(path.join(ctx.ROOT || path.join(ctx.DIR, '..'), 'swarm.config.json'), {}) || {}; return (c.accounts || []).filter(a => a && a.character && a.enabled !== false); }
function info(ctx) {
  const L = ctx.LOGS, D = ctx.DATA, now = Date.now();
  let S = {}; try { S = require('./crafterpage_api').settings(ctx); } catch (e) { }
  const st = obj(rj(path.join(L, 'runner_state.json'), {}));
  const queue = Array.isArray(st.queue) ? st.queue : (rj(path.join(L, 'runner_queue.json'), []) || []).map(c => ({ party: c.party, out: !!c.out, at: new Date(num(c.at) || now).toISOString() }));
  const trip = st.trip || null, tripFile = rj(path.join(L, 'runner_trip.json'), null);
  const trips = (rj(path.join(L, 'runner_trips.json'), []) || []).slice(-20).reverse();
  const bank = (rj(path.join(L, 'runner_bank.json'), []) || []).slice(-40).reverse();
  const visited = Object.assign({}, rj(path.join(L, 'runner_rotation.json'), {}) || {}, obj(st.visited));
  const run = obj(rj(path.join(D, 'run_state.json'), {}));
  const states = {}; try { (ctx.readStates ? ctx.readStates() : []).forEach(s => { states[s.name] = s; }); } catch (e) { }
  // per party: every member's load for the runner (swarm_state rl = { k: kinds the take rules would take, b: bag % })
  const byParty = {};
  cfgAccounts(ctx).forEach(a => { const p = a.party || a.character; (byParty[p] = byParty[p] || []).push(a.character); });
  const offers = {}; (Array.isArray(st.offers) ? st.offers : []).forEach(o => { offers[o.party] = o; });
  const ex = [S.runner, S.bank, S.crafter].filter(Boolean);
  const parties = Object.keys(byParty).filter(p => !ex.includes(p)).map(p => {
    const members = byParty[p].map(n => { const s = states[n] || {}; const rl = obj(s.rl); return { name: n, online: num(s.ageSec) < 120, kinds: num(rl.k), bagPct: num(rl.b) }; });
    const on = !!(obj(obj(run.parties)[p]).on), o = offers[p];
    const kinds = Math.max(0, ...members.map(m => m.kinds)), bagPct = Math.max(0, ...members.map(m => m.bagPct));
    const lead = states[p] || {}, task = String(lead.task || '');
    const hunting = o ? !!o.hunting : (on && /^autolevel:|fighting|farming/i.test(task) && !/in town|in Giran|regroup|route to|nav:/i.test(task));
    return { party: p, on, hunting, raid: o && o.raid ? String(o.raid) : '', kinds, bagPct, members, task: task.slice(0, 90), offerAt: o ? o.at : null, lastVisit: num(visited[p]) ? new Date(num(visited[p])).toISOString() : null };
  }).filter(p => p.on || p.kinds > 0);
  const line = rotationLine(parties, visited, now, S.rotateMin, ex);
  return { ok: true, at: new Date(now).toISOString(),
    runner: { name: S.runner || '', on: !!S.runnerOn, rotateOn: S.rotateOn !== false, rotateMin: num(S.rotateMin) || 60, stealth: S.runnerStealth !== false, bank: S.bank || '', crafter: S.crafter || '',
      state: st.state || '', cur: st.cur || null, seen: st.at || null, x: st.x, y: st.y, town: st.town || '', fresh: st.at ? now - Date.parse(st.at) < 120000 : false },
    trip: trip || (tripFile && !tripFile.done ? tripFile : null), queue, rotation: line, parties: parties.sort((a, b) => b.bagPct - a.bagPct || b.kinds - a.kinds), trips, bank };
}
function post(ctx, b) {
  const r = editRow(b); if (r.error) return { code: 400, error: r.error };
  const F = path.join(ctx.LOGS, 'runner_queue_edit.json'); let L = rj(F, []); if (!Array.isArray(L)) L = [L];
  L.push(r.row); try { fs.writeFileSync(F + '.tmp', JSON.stringify(L.slice(-20))); fs.renameSync(F + '.tmp', F); } catch (e) { return { code: 500, error: e.message }; }
  return { code: 200, ok: true, queued: r.row };
}
const STATIC = { '/runnerpage.js': 'text/javascript; charset=utf-8' };
async function handle(req, res, url, ctx) {
  if (STATIC[url.pathname]) {
    let body; try { body = fs.readFileSync(path.join(ctx.DIR || __dirname, url.pathname.slice(1))); } catch (e) { res.writeHead(404); res.end('not found'); return true; }
    res.writeHead(200, { 'Content-Type': STATIC[url.pathname], 'Cache-Control': 'no-cache' }); res.end(body); return true;
  }
  if (url.pathname !== '/api/runner') return false;
  if (!ctx.allowed(req, url)) { ctx.send(res, 401, 'text/plain; charset=utf-8', 'Access denied'); return true; }
  if (req.method === 'GET') { try { ctx.json(res, 200, info(ctx)); } catch (e) { ctx.json(res, 500, { error: e.message }); } return true; }
  if (req.method !== 'POST') { ctx.json(res, 405, { error: 'GET or POST' }); return true; }
  let b = {}; try { let t = ''; for await (const c of req) t += c; b = JSON.parse(t || '{}'); } catch (e) { ctx.json(res, 400, { error: 'bad JSON' }); return true; }
  const r = post(ctx, b); const code = r.code || 200; delete r.code; ctx.json(res, code, r); return true;
}
module.exports = { handle, info, post, rotationLine, editRow, worth };
