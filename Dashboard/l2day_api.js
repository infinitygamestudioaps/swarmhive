// L2DAY-2026-10-31 (owner: "I need a Way for Me to deliver the letters for the npc i giran town square ... x1, x5, x10 ... Queue x amount of
// deliveries for the npc based on how many we have. It's important that everyone deliver the letters to the collector in town. I want to see
// the rewards for delivering the letters nicely like look from raidboss etc."; requirement docs/requirements/l2day.md, test test_l2day.js)
//   /l2daypage.js, /l2daypage.css            the page #/l2day (public, like the other page modules)
//   GET /api/l2day (key checked inside)      letters per letter (collector's bag + clan warehouse + still in members' bags), what each word
//                                            costs and how many can be made now, the exchange queue (autoqueue items '!l2day'), the running run
//                                            (Logs/l2day_state.json) and the rewards (Logs/l2day_rewards.log, written by swarm.js l2dayRun)
// Queuing goes through POST /api/autoqueue { cmd: '!l2day <word> <n> <x1|x5|x10>', targets: ['char:<collector>'] } (lane = the collector).
'use strict';
const fs = require('fs'), path = require('path');
const STATIC = { '/l2daypage.js': 'application/javascript; charset=utf-8', '/l2daypage.css': 'text/css; charset=utf-8' };
// the same tables as Scripts_dev/swarm.js L2DAY-PURE (test_l2day.js checks they stay equal)
const L2DAY_LETTER = { A: 3875, C: 3876, E: 3877, F: 3878, G: 3879, H: 3880, I: 3881, L: 3882, N: 3883, O: 3884, R: 3885, S: 3886, T: 3887, II: 3888 };
const L2DAY_WORDS = { LineageII: ['L', 'I', 'N', 'E', 'A', 'G', 'E', 'II'], LIIToggle: ['L', 'II', 'T', 'O', 'G', 'G', 'L', 'E'], NCSoft: ['N', 'C', 'S', 'O', 'F', 'T'], Throne: ['T', 'H', 'R', 'O', 'N', 'E'] };
const MULTS = { x1: 1, x5: 5, x10: 10 };
const rj = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch (e) { return d; } };
function need(word, units) { const out = {}; (L2DAY_WORDS[word] || []).forEach(l => { const id = L2DAY_LETTER[l]; out[id] = (out[id] || 0) + units; }); return out; }
/** PRIORITY-2026-10-31: the owner's order of the words (best first) */
const L2DAY_PRIORITY = ['LineageII', 'LIIToggle', 'NCSoft', 'Throne'];
/** stock -> [{ word, n, rank }] in the priority order: each word takes as many as the letters LEFT after the better words allow */
function priorityPlan(stock) {
  const left = Object.assign({}, stock);
  return L2DAY_PRIORITY.filter(w => L2DAY_WORDS[w]).map((w, i) => { const n = possible(left, w), c = need(w, n); Object.keys(c).forEach(id => { left[id] = (Number(left[id]) || 0) - c[id]; }); return { word: w, n, rank: i + 1 }; });
}
function possible(stock, word) { const n = need(word, 1), ids = Object.keys(n); if (!ids.length) return 0; return ids.reduce((m, id) => Math.min(m, Math.floor((Number(stock[id]) || 0) / n[id])), Infinity); }
const letterIds = () => Object.values(L2DAY_LETTER);
function countIn(items) { const o = {}; (items || []).forEach(r => { const id = Number(r.id); if (letterIds().includes(id)) o[id] = (o[id] || 0) + (Number(r.count) || 1); }); return o; }
function collectorOf(ctx) { const S = rj(path.join(ctx.DATA, 'stash_rules.json'), {}) || {}, L = S.letters || {}; const to = String(L.to || 'clanleader'); if (!/^clan ?leader$/i.test(to)) return to; const cq = rj(path.join(ctx.DATA, 'clan_quests.json'), {}) || {}; return String((cq.clan && cq.clan.leader) || 'Dagger1'); }
/** the reward log: one JSON object per line -> newest first */
function rewards(ctx, max) {
  const items = rj(path.join(ctx.DIR || __dirname, 'data', 'items.json'), {}) || {}, icon = (id) => (items[id] || [])[1] || '';
  let lines = []; try { lines = fs.readFileSync(path.join(ctx.LOGS, 'l2day_rewards.log'), 'utf8').split(/\r?\n/).filter(Boolean); } catch (e) { }
  const rows = []; lines.forEach(l => { try { rows.push(JSON.parse(l)); } catch (e) { } });
  const byWord = {}, total = {};
  rows.forEach(r => { const w = String(r.word || '?'), mult = MULTS[r.mult] || 1, W = byWord[w] = byWord[w] || { exchanges: 0, words: 0, items: {} };
    W.exchanges++; W.words += mult;
    (r.rewards || []).forEach(g => { if (letterIds().includes(Number(g.id))) return; const k = String(g.id); const add = (o) => { o[k] = o[k] || { id: Number(g.id), name: g.name, icon: icon(g.id), count: 0, times: 0 }; o[k].count += Number(g.count) || 0; o[k].times++; };
      add(W.items); add(total); }); });
  const list = (o) => Object.values(o).sort((a, b) => b.times - a.times || b.count - a.count);
  return { exchanges: rows.length, byWord: Object.fromEntries(Object.entries(byWord).map(([w, v]) => [w, { exchanges: v.exchanges, words: v.words, items: list(v.items) }])), total: list(total),
    history: rows.slice(-(max || 60)).reverse().map(r => Object.assign({}, r, { rewards: (r.rewards || []).map(g => Object.assign({ icon: icon(g.id) }, g)) })) };
}
function info(ctx) {
  const items = rj(path.join(ctx.DIR, 'data', 'items.json'), {}) || {}, col = collectorOf(ctx);
  const letters = Object.entries(L2DAY_LETTER).map(([k, id]) => ({ key: k, id, name: (items[id] || [])[0] || ('L2Day - ' + k), icon: (items[id] || [])[1] || '' }));
  const bag = countIn((rj(path.join(ctx.LOGS, 'bag_' + col + '.json'), {}) || {}).items);
  const cs = rj(path.join(ctx.LOGS, 'clan_state.json'), {}) || {}, wh = countIn(cs.warehouse && cs.warehouse.items);
  const members = [];
  try { fs.readdirSync(ctx.LOGS).filter(f => /^bag_[A-Za-z0-9]+\.json$/.test(f)).forEach(f => { const n = f.slice(4, -5); if (n === col) return; const j = rj(path.join(ctx.LOGS, f), {}) || {}; const c = countIn(j.items); const tot = Object.values(c).reduce((a, b) => a + b, 0); if (tot) members.push({ name: n, total: tot, at: j.at || '', letters: c }); }); } catch (e) { }
  members.sort((a, b) => b.total - a.total);
  const stock = {}; letterIds().forEach(id => { stock[id] = (bag[id] || 0) + (wh[id] || 0); });
  // PRIORITY-2026-10-31 (owner: "Always calculate based on top pick. LineageII is best, then L2Toggle and so on"): 'possible' = in the owner's order
  // (L2DAY_PRIORITY): the best word takes all it can, the next one counts only the letters that are left; 'alone' = if that word were the only one
  const words = priorityPlan(stock).map(p => ({ word: p.word, letters: L2DAY_WORDS[p.word], cost: need(p.word, 1), possible: p.n, alone: possible(stock, p.word), rank: p.rank, possibleBag: possible(bag, p.word) }));
  const q = rj(path.join(ctx.LOGS, 'auto_queue.json'), {}) || {}, qItems = (Array.isArray(q.items) ? q.items : []).filter(x => /^!l2day\b/i.test(String(x.cmd || '')));
  return { ok: true, at: Date.now(), collector: col, letters, stock: { bag, clanWh: wh, total: stock, whAt: (cs.warehouse && cs.warehouse.seenAt) || null }, members, words,
    queue: qItems.slice(-30).map(x => ({ id: x.id, cmd: x.cmd, state: x.state, at: x.at || x.createdAt || null, why: x.why || x.result || '' })),
    state: rj(path.join(ctx.LOGS, 'l2day_state.json'), null), rewards: rewards(ctx) };
}
async function handle(req, res, url, ctx) {
  if (STATIC[url.pathname]) {
    try { res.writeHead(200, { 'Content-Type': STATIC[url.pathname], 'Cache-Control': 'no-cache' }); res.end(fs.readFileSync(path.join(__dirname, url.pathname.slice(1)))); }
    catch (e) { res.writeHead(404); res.end(); }
    return true;
  }
  if (url.pathname !== '/api/l2day') return false;
  if (!ctx.allowed(req, url)) { ctx.send(res, 401, 'text/plain; charset=utf-8', 'Access denied'); return true; }
  if (req.method !== 'GET') { ctx.json(res, 405, { error: 'GET only (queue through /api/autoqueue)' }); return true; }
  try { ctx.json(res, 200, info(ctx)); } catch (e) { ctx.json(res, 500, { error: e.message }); }
  return true;
}
module.exports = { handle, info, need, possible, priorityPlan, L2DAY_PRIORITY, rewards, countIn, L2DAY_LETTER, L2DAY_WORDS, MULTS };
