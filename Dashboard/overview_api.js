// OVERVIEW 2026-10-24 (owner: "a complete overview, compact with animation, icons and most important of all statistics for all parties and
// characters, experience, adena, everything so we can see when they level up, what they make per hour, what their cost is"): GET /api/overview
// Read only, except its own recorder:
//   - every 60 s one line per character -> Logs/overview_<yyyy-mm-dd>.tsv  (at sec, name, party, level, total exp, adena, dead, online, kills/h)
//     kept in memory for 26 h and read back after a dashboard restart, so the rates survive restarts (the bots' own expHour is 60 min, in memory).
//   - deaths = a sample that turns dead after one that was alive (60 s grain; a death + res inside one minute is missed).
// Sources joined in: live state (level, exp %, adena, activity, expHour), Dashboard/levelEta.js (next level-up), lootpage_api.query (loot worth),
// Logs/supply_use_<Name>.json x data/item_prices.json (shots / potions / ore used), Logs/gear_upgrades.log + Logs/pshop_buys.log (gear / shop buys).
// Profit = wallet change + loot worth (items count at shop value until sold); costs are already inside the wallet change and shown for info.
'use strict';
const fs = require('fs'), path = require('path');
const LE = require('./levelEta.js');

const KEEP_MS = 26 * 3600000, EVERY_MS = 60000;
const R = { ctx: null, ring: new Map(), deaths: new Map(), started: 0, cache: new Map(), costCache: { key: '', v: null } };
const day = (t) => new Date(t).toISOString().slice(0, 10);
const num = (v) => (v == null || v === '' || isNaN(+v) ? null : +v);

function totalExp(level, pct) {
  level = num(level); pct = num(pct); if (!(level > 0) || pct == null) return null;
  const a = LE.expTotal(level), b = LE.expTotal(level + 1);
  return a == null ? null : Math.round(a + (b != null ? (b - a) * pct / 100 : 0));
}
function push(name, s) {
  let a = R.ring.get(name); if (!a) R.ring.set(name, a = []);
  const prev = a[a.length - 1];
  if (prev && prev.dead === 0 && s.dead === 1) { let d = R.deaths.get(name); if (!d) R.deaths.set(name, d = []); d.push(s.at); }
  a.push(s);
  const cut = Date.now() - KEEP_MS; while (a.length && a[0].at < cut) a.shift();
  const d = R.deaths.get(name); if (d) while (d.length && d[0] < cut) d.shift();
}
function loadBack(ctx) {
  for (const t of [Date.now() - 86400000 - 3600000, Date.now() - 86400000, Date.now()]) {
    const f = path.join(ctx.LOGS, 'overview_' + day(t) + '.tsv');
    if (R._loaded && R._loaded.has(f)) continue; (R._loaded = R._loaded || new Set()).add(f);
    let txt = ''; try { txt = fs.readFileSync(f, 'utf8'); } catch (e) { continue; }
    for (const ln of txt.split('\n')) {
      const p = ln.split('\t'); if (p.length < 9) continue;
      const at = +p[0] * 1000; if (!(at > Date.now() - KEEP_MS)) continue;
      push(p[1], { at, party: p[2], level: num(p[3]), exp: num(p[4]), adena: num(p[5]), dead: +p[6] ? 1 : 0, on: +p[7] ? 1 : 0, kh: num(p[8]) });
    }
  }
  for (const a of R.ring.values()) a.sort((x, y) => x.at - y.at);
}
function sample() {
  const ctx = R.ctx; if (!ctx) return;
  try {
    const now = Date.now(), lines = [];
    for (const c of ctx.readStates()) {
      if (!c || !c.name) continue;
      const on = num(c.ageSec) != null && c.ageSec < 30 ? 1 : 0;
      const h = c.expHour, kh = h && num(h.mins) >= 3 ? Math.round(num(h.n) / h.mins * 60) : null;
      const s = { at: now, party: String(c.party || c.name), level: num(c.level), exp: totalExp(c.level, c.exp), adena: num(c.adena), dead: c.dead ? 1 : 0, on, kh };
      if (!on) { const a = R.ring.get(c.name), last = a && a[a.length - 1]; if (last && !last.on && now - last.at < 10 * 60000) continue; }   // offline: one line per 10 min is enough
      push(c.name, s);
      lines.push([Math.round(now / 1000), c.name, s.party, s.level ?? '', s.exp ?? '', s.adena ?? '', s.dead, s.on, s.kh ?? ''].join('\t'));
    }
    if (lines.length) fs.appendFileSync(path.join(ctx.LOGS, 'overview_' + day(now) + '.tsv'), lines.join('\n') + '\n');
  } catch (e) { }
}
function start(ctx) {
  if (R.started) return; R.started = Date.now(); R.ctx = ctx;
  try { loadBack(ctx); } catch (e) { }
  setTimeout(sample, 5000); setInterval(sample, EVERY_MS);
}

// --- costs: consumables used (supply_use) + gear and player-shop buys (logs), per character inside [from, to] ---
function prices(ctx) {
  if (!R.prices || Date.now() - R.pricesAt > 600000) { try { R.prices = JSON.parse(fs.readFileSync(path.join(ctx.DIR, 'data', 'item_prices.json'), 'utf8')); } catch (e) { R.prices = R.prices || {}; } R.pricesAt = Date.now(); }
  return R.prices;
}
function tailLines(f, bytes) {
  try { const st = fs.statSync(f), fd = fs.openSync(f, 'r'), n = Math.min(st.size, bytes), b = Buffer.alloc(n); fs.readSync(fd, b, 0, n, st.size - n); fs.closeSync(fd); return b.toString('utf8').split('\n'); } catch (e) { return []; }
}
function costs(ctx, names, from, to) {
  const key = Math.round(from / 60000) + ':' + names.length;
  if (R.costCache.key === key && Date.now() - R.costCache.at < 60000) return R.costCache.v;
  const PR = prices(ctx), out = {};
  const C = (n) => out[n] || (out[n] = { use: 0, gear: 0, shop: 0, huntMs: 0 });
  for (const n of names) {
    let j = null; try { j = JSON.parse(fs.readFileSync(path.join(ctx.LOGS, 'supply_use_' + n + '.json'), 'utf8')); } catch (e) { continue; }
    for (const b of (j && j.b) || []) {
      if (!(b.h + 3600000 > from && b.h < to)) continue;
      const part = Math.max(0, Math.min(1, (Math.min(to, b.h + 3600000) - Math.max(from, b.h)) / 3600000));   // only the part of the hour inside the window
      const c = C(n); c.huntMs += (b.ms || 0) * part;
      for (const [id, k] of Object.entries(b.u || {})) c.use += (Number(PR[id]) || 0) * k * part;
    }
  }
  const inWin = (ln) => { const t = Date.parse(ln.slice(0, 24)); return t >= from && t <= to; };
  for (const ln of tailLines(path.join(ctx.LOGS, 'gear_upgrades.log'), 3 << 20)) {
    if (!inWin(ln)) continue; const m = /\[([A-Za-z0-9]+)\]/.exec(ln); if (!m) continue;
    // "...(supply run): A 336105: bought; B 210325: bought | ..."
    const re = /[:;] ([^:;|]+?) (\d+): bought/g; let g; while ((g = re.exec(ln))) C(m[1]).gear += +g[2];
  }
  for (const ln of tailLines(path.join(ctx.LOGS, 'pshop_buys.log'), 2 << 20)) {
    if (!inWin(ln) || / run: /.test(ln)) continue; const m = /\[([A-Za-z0-9]+)\] bought .*?= ([\d,]+) adena/.exec(ln); if (m) C(m[1]).shop += +m[2].replace(/,/g, '');
  }
  R.costCache = { key, at: Date.now(), v: out };
  return out;
}

// --- one character over the window ---
function rate(a, from) {
  const w = (a || []).filter(s => s.at >= from); if (w.length < 2) return null;
  const f = w[0], l = w[w.length - 1], hrs = (l.at - f.at) / 3600000; if (hrs < 0.05) return null;
  const on = w.filter(s => s.on).length / w.length, ks = w.filter(s => s.kh != null && s.on);
  // exp: sum of the rises only while online and the level did not drop (a delevel / a death penalty counts as the loss it is)
  return { hrs, levels: (l.level || 0) - (f.level || 0), expH: f.exp != null && l.exp != null ? (l.exp - f.exp) / hrs : null,
    adenaH: f.adena != null && l.adena != null ? (l.adena - f.adena) / hrs : null, online: on, killsH: ks.length ? ks.reduce((t, s) => t + s.kh, 0) / ks.length : null,
    spark: spark(w, 24) };
}
function spark(w, n) {   // total exp at n even steps (for the little line on the card)
  if (w.length < 2) return [];
  const f = w[0].at, l = w[w.length - 1].at, out = []; let j = 0;
  for (let i = 0; i < n; i++) { const t = f + (l - f) * i / (n - 1); while (j < w.length - 1 && w[j + 1].at <= t) j++; out.push(w[j].exp); }
  return out;
}

function build(ctx, hours) {
  const now = Date.now(), from = now - hours * 3600000;
  const states = ctx.readStates(), names = states.map(c => c.name);
  let lootWho = {}; try { lootWho = require('./lootpage_api').query(ctx, { hours }).summary.valueByWho || {}; } catch (e) { }
  const cost = costs(ctx, names, from, now);
  const chars = states.map(c => {
    const a = R.ring.get(c.name), r = rate(a, from), e = (() => { try { return LE.calc(c, { now }); } catch (er) { return null; } })();
    const k = cost[c.name] || { use: 0, gear: 0, shop: 0, huntMs: 0 }, hrs = hours;   // loot + costs come from logs over the whole window (the recorder rates use their own span)
    const lootV = lootWho[c.name] || 0, costT = k.use + k.gear + k.shop;
    const deaths = (R.deaths.get(c.name) || []).filter(t => t >= from).length;
    const live = c.expHour && num(c.expHour.mins) >= 3 ? c.expHour : null;
    return {
      name: c.name, party: String(c.party || c.name), leader: !!c.leader, role: c.role || '', cls: c.cls || '', classId: num(c.classId),
      level: num(c.level), exp: num(c.exp), adena: num(c.adena), hp: num(c.hp), mp: num(c.mp), dead: !!c.dead, online: num(c.ageSec) != null && c.ageSec < 30,
      activity: (c.doing && c.doing.activity) || c.mode || '', task: String(c.task || '').slice(0, 140), where: (c.doing && c.doing.autolevel && c.doing.autolevel.spot) || (c.doing && c.doing.zone) || '',
      eta: e ? { status: e.status, at: e.at, etaMs: e.etaMs, pctH: e.pctH, days: e.days } : null,
      lastUp: (() => { const l = (c.expLog || []).filter(x => x.up).pop(); return l ? l.at : null; })(),
      expH: r && r.expH != null ? Math.round(r.expH) : live ? Math.round(num(live.amt) / live.mins * 60) : null,
      pctH: e && e.pctH != null ? +e.pctH.toFixed(2) : null,
      levels: r ? r.levels : 0, adenaH: r && r.adenaH != null ? Math.round(r.adenaH) : null,
      lootH: Math.round(lootV / hrs), costH: Math.round(costT / hrs), useH: Math.round(k.use / hrs), gearH: Math.round((k.gear + k.shop) / hrs),
      profitH: r && r.adenaH != null ? Math.round(r.adenaH + lootV / hrs) : Math.round(lootV / hrs),
      killsH: r && r.killsH != null ? Math.round(r.killsH) : live ? Math.round(num(live.n) / live.mins * 60) : null,
      deaths, online24: r ? +r.online.toFixed(2) : null, huntShare: hrs ? +Math.min(1, k.huntMs / 3600000 / hrs).toFixed(2) : null, spark: r ? r.spark : [], hrs: r ? +r.hrs.toFixed(2) : 0
    };
  });
  const parties = new Map();
  for (const c of chars) { let p = parties.get(c.party); if (!p) parties.set(c.party, p = { leader: c.party, members: [] }); p.members.push(c); }
  const sum = (list, k) => list.reduce((t, c) => t + (Number(c[k]) || 0), 0);
  const agg = (list) => ({ n: list.length, online: list.filter(c => c.online).length, dead: list.filter(c => c.dead).length,
    adena: sum(list, 'adena'), expH: sum(list, 'expH'), adenaH: sum(list, 'adenaH'), lootH: sum(list, 'lootH'), costH: sum(list, 'costH'), useH: sum(list, 'useH'), gearH: sum(list, 'gearH'),
    profitH: sum(list, 'profitH'), killsH: sum(list, 'killsH'), deaths: sum(list, 'deaths'), levels: sum(list, 'levels'),
    minLevel: Math.min(...list.map(c => c.level || 99)), avgLevel: +(list.reduce((t, c) => t + (c.level || 0), 0) / Math.max(1, list.length)).toFixed(1) });
  const P = [...parties.values()].map(p => {
    p.members.sort((a, b) => (b.leader - a.leader) || a.name.localeCompare(b.name));
    let next = null; try { next = LE.party(states.filter(c => String(c.party || c.name) === p.leader), { now }); } catch (e) { }
    const L = p.members.find(m => m.leader) || p.members[0];
    return Object.assign(p, agg(p.members), { activity: L.activity, task: L.task, where: L.where, next: next ? { level: next.level, next: next.next, at: next.at, who: next.who, status: next.status, days: next.days } : null });
  }).sort((a, b) => b.profitH - a.profitH);
  const soon = chars.filter(c => c.eta && c.eta.status === 'ok' && c.eta.at).sort((a, b) => a.eta.at - b.eta.at).slice(0, 8).map(c => ({ name: c.name, party: c.party, level: c.level, at: c.eta.at, classId: c.classId }));
  const ups = chars.filter(c => c.lastUp && now - c.lastUp < 6 * 3600000).sort((a, b) => b.lastUp - a.lastUp).slice(0, 8).map(c => ({ name: c.name, level: c.level, at: c.lastUp, classId: c.classId }));
  const firstAt = Math.min(...[...R.ring.values()].map(a => (a[0] || {}).at || now));
  return { ok: true, at: now, hours, recordingSince: firstAt, total: agg(chars), parties: P, chars, soon, ups };
}

async function handle(req, res, url, ctx) {
  if (url.pathname === '/overview.js') {   // the page script (public, no secrets; like /lootpage.js)
    res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-cache' }); res.end(fs.readFileSync(path.join(ctx.DIR || __dirname, 'overview.js'))); return true;
  }
  if (url.pathname !== '/api/overview') return false;
  if (ctx.allowed && !ctx.allowed(req, url)) { ctx.send(res, 401, 'text/plain; charset=utf-8', 'Access denied'); return true; }   // the key, like every other API
  start(ctx);
  const hours = url.searchParams.get('hours') === '24' ? 24 : 1;
  const c = R.cache.get(hours);
  if (c && Date.now() - c.at < 20000) { ctx.json(res, 200, c.v); return true; }
  let v; try { v = build(ctx, hours); } catch (e) { ctx.json(res, 500, { error: String(e.message || e) }); return true; }
  R.cache.set(hours, { at: Date.now(), v });
  ctx.json(res, 200, v); return true;
}
module.exports = { handle, start, build, totalExp, _R: R };
