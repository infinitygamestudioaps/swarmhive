// DISPATCH API (DISPATCH-2026-10-17; owner: "dispatch a party or a solo person to a point in game ... Baium, Valakas teleport, Antharas, Core,
// Sailren, any raid start ... go to X, go to Y, go to Z, so we can verify that all the routes are working ... auto learn the path"). Loaded by
// server.js. Page: Dashboard/dispatchpage.js (#/dispatch). Bot side: swarm.js DISPATCH block ("!dispatch <id>").
//   GET  /api/dispatch/who                     parties (leader + members) and every character
//   GET  /api/dispatch/targets?q=&type=&n=     search the nav atlas (Scripts/data/nav_atlas/index.json: raid, epic, npc, area, room, dungeon) with
//                                              the computed route's status and our last dispatch result (Logs/dispatch/results.json); &quick=1 = epics
//   POST /api/dispatch { who: { party } | { char }, stops: [key], sneak, enter, goOn } -> Logs/dispatch/<id>.json + "!dispatch <id>"
//        a party MEMBER sent alone is benched first (run switch, so its party does not call it back) — the page says so
//   GET  /api/dispatch/job?id=   the job + its live status · GET /api/dispatch/recent  the last tours
'use strict';
const fs = require('fs'), path = require('path');
const STATIC = { '/dispatchpage.js': 'application/javascript; charset=utf-8' };
const NAME_RE = /^[A-Za-z0-9_\-]{1,40}$/;
const isoNow = () => new Date().toISOString();
const rj = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch (e) { return d; } };
let IDX = null, IDXST = '';
function index(ctx) {
  const f = path.join(ctx.DATA, 'nav_atlas', 'index.json'); let st = ''; try { st = String(fs.statSync(f).mtimeMs); } catch (e) { }
  if (!IDX || st !== IDXST) { const j = rj(f, { cols: [], targets: [] }); const c = j.cols || []; IDX = (j.targets || []).map(t => { const o = {}; c.forEach((k, i) => { o[k] = t[i]; }); return o; }); IDXST = st; }
  return IDX;
}
const DIR = (ctx) => path.join(ctx.LOGS, 'dispatch');
const results = (ctx) => rj(path.join(DIR(ctx), 'results.json'), {}) || {};
const cfg = (ctx) => rj(path.join(ctx.ROOT, 'swarm.config.json'), {}) || {};
// the epic / boss doors the owner names first (matched by name in the atlas)
const QUICK = [['Baium (to the Angelic Vortex door)', /^Baium$/], ['Klein (Valakas teleporter)', /^Klein$/], ['Valakas', /^Valakas$/], ['Antharas', /^Antharas$/], ['Core', /^Core$/], ['Queen Ant', /^Queen Ant$/], ['Orfen', /^Orfen$/], ['Zaken', /^Zaken$/], ['Frintezza', /^Frintezza$/], ['Primeval Isle (Sailren)', /^Primeval Isle 1:/], ['Shilen\'s Messenger Cabrio', /Cabrio/]];
function row(t, R) { const r = R[t.key] || null; return { key: t.key, type: t.type, name: t.name, x: t.x, y: t.y, z: t.z, status: t.status, length: t.length, sec: t.sec, flags: t.flags, last: r ? { ok: r.last === 'ok', at: r.at, by: r.by, how: r.how, why: r.why, learned: r.learned, runs: r.runs, oks: r.oks } : null }; }
function targets(ctx, q, type, n, quick) {
  const I = index(ctx), R = results(ctx);
  if (quick) { const out = []; QUICK.forEach(([label, re]) => { const t = I.find(x => re.test(String(x.name)) && (x.type === 'raid' || x.type === 'epic' || x.type === 'npc' || x.type === 'area')); if (t) out.push(Object.assign(row(t, R), { label })); }); return { ok: true, targets: out }; }
  const words = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
  const list = I.filter(t => (!type || type === 'all' || t.type === type) && words.every(w => String(t.name).toLowerCase().includes(w) || String(t.key).toLowerCase().includes(w)));
  return { ok: true, total: list.length, targets: list.slice(0, Math.max(10, Math.min(300, Number(n) || 60))).map(t => row(t, R)) };
}
function who(ctx) {
  const st = ctx.readStates ? ctx.readStates() : [], by = {}; st.forEach(s => { by[s.name] = s; });
  const acc = (cfg(ctx).accounts || []).filter(a => a.character && a.enabled !== false), parties = {};
  acc.forEach(a => { const p = a.party || a.character; (parties[p] = parties[p] || []).push(a.character); });
  const ch = (n) => { const s = by[n] || {}; return { name: n, level: s.level || null, cls: s.cls || '', classId: s.classId != null ? s.classId : null, online: Number(s.ageSec) < 30, x: s.x, y: s.y, z: s.z, task: String(s.task || '').slice(0, 120) }; };
  return { ok: true, parties: Object.keys(parties).map(l => ({ leader: l, members: parties[l].map(ch) })), chars: acc.map(a => Object.assign(ch(a.character), { party: a.party || '' })) };
}
async function post(ctx, b) {
  const W = b.who || {}, solo = !!W.char, actor = solo ? String(W.char) : String(W.party || '');
  if (!NAME_RE.test(actor)) return { code: 400, error: 'Choose a party or a character.' };
  const I = index(ctx), stops = (Array.isArray(b.stops) ? b.stops : []).slice(0, 40).map(k => {
    const m = /^xy:(-?\d+),(-?\d+)(?:,(-?\d+))?$/.exec(String(k));   // a point on the map: the nearest atlas route within 1500 when there is one, else teleport closer + walk
    if (m) return { key: String(k), type: 'point', name: `point ${m[1]}, ${m[2]}`, x: +m[1], y: +m[2], z: m[3] != null ? +m[3] : 0 };
    return I.find(t => t.key === String(k));
  }).filter(Boolean);
  if (!stops.length) return { code: 400, error: 'Choose at least one place.' };
  if (!ctx.commandRun) return { code: 500, error: 'the dashboard server needs a restart' };
  const id = `dsp_${actor.toLowerCase()}_${Date.now().toString(36)}`;
  const J = { id, who: solo ? { char: actor } : { party: actor }, sneak: !!b.sneak && solo, enter: !!b.enter, goOn: !!b.goOn,
    stops: stops.map(t => ({ key: t.key, type: t.type, name: t.name, x: t.x, y: t.y, z: t.z })), created: isoNow(), by: String(b.by || 'dashboard').slice(0, 40) };
  fs.mkdirSync(DIR(ctx), { recursive: true });
  fs.writeFileSync(path.join(DIR(ctx), id + '.json'), JSON.stringify(J, null, 1));
  let benched = false;
  if (solo) {   // a party member alone: bench it, so its leader neither waits for it nor calls it back
    const a = (cfg(ctx).accounts || []).find(x => x.character === actor);
    if (a && a.party && a.party !== actor) { try { const RS = require('./runstate_api'); if (RS.post) { await RS.post(ctx, { char: actor, on: false, by: 'dispatch ' + id, send: false }); benched = true; } } catch (e) { } }
  }
  const r = await ctx.commandRun({ cmd: `!dispatch ${id}`, targets: ['chars:' + actor] }); const body = r && r.body ? r.body : r;
  try { fs.appendFileSync(path.join(ctx.LOGS, 'dashboard_commands.log'), `${isoNow()}\tdispatch\t${id}: ${solo ? actor : 'party ' + actor} -> ${J.stops.map(s => s.name).join(' > ').slice(0, 300)}${benched ? ' (benched)' : ''}\t${J.by}\r\n`); } catch (e) { }
  if (body && body.error) return { code: 500, error: body.error };
  return { ok: true, id, job: J, benched };
}
function job(ctx, id) {
  if (!/^dsp_[a-z0-9_-]{3,60}$/i.test(id)) return { code: 400, error: 'id?' };
  const J = rj(path.join(DIR(ctx), id + '.json'), null); if (!J) return { code: 404, error: 'no such tour' };
  return { ok: true, job: J, status: rj(path.join(DIR(ctx), id + '_status.json'), null) };
}
function recent(ctx) {
  try { return { ok: true, jobs: fs.readdirSync(DIR(ctx)).filter(f => /^dsp_.*\.json$/.test(f) && !/_status\.json$/.test(f)).map(f => rj(path.join(DIR(ctx), f), null)).filter(Boolean)
    .sort((a, b) => String(b.created).localeCompare(String(a.created))).slice(0, 12).map(j => ({ id: j.id, who: j.who, stops: j.stops.map(s => s.name), created: j.created, status: rj(path.join(DIR(ctx), j.id + '_status.json'), null) })) }; } catch (e) { return { ok: true, jobs: [] }; }
}
async function handle(req, res, url, ctx) {
  const p = url.pathname;
  if (STATIC[p]) { res.writeHead(200, { 'Content-Type': STATIC[p], 'Cache-Control': 'no-cache' }); res.end(fs.readFileSync(path.join(ctx.DIR || __dirname, path.basename(p)))); return true; }
  if (p !== '/api/dispatch' && !p.startsWith('/api/dispatch/')) return false;
  if (!ctx.allowed(req, url)) { ctx.send(res, 401, 'text/plain; charset=utf-8', 'Access denied'); return true; }
  const q = (k) => String(url.searchParams.get(k) || '');
  const out = (r) => { const code = (r && r.code) || 200; if (r) delete r.code; ctx.json(res, code, r || { error: 'no result' }); return true; };
  try {
    if (p === '/api/dispatch' && req.method === 'POST') { let b = {}; try { let t = ''; for await (const c of req) t += c; b = JSON.parse(t || '{}'); } catch (e) { return out({ code: 400, error: 'bad JSON' }); } return out(await post(ctx, b)); }
    if (p === '/api/dispatch/who') return out(who(ctx));
    if (p === '/api/dispatch/targets') return out(targets(ctx, q('q'), q('type'), q('n'), q('quick') === '1'));
    if (p === '/api/dispatch/job') return out(job(ctx, q('id')));
    if (p === '/api/dispatch/recent') return out(recent(ctx));
    return out({ code: 404, error: 'unknown dispatch API' });
  } catch (e) { return out({ code: 500, error: e.message }); }
}
module.exports = { handle, targets, who, post, job, recent, QUICK, STATIC };
