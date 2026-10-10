// KAMALOKA PAGE API (user 2026-10-09 14:15: "/kamaloka still only shows 2 groups, and is not optimized like the rest of the pages").
// Loaded by server.js (one hook, like gearpage_api.js). Public: /kamapage.js, /kamapage.css, /kamalogic.js (no secrets).
// GET /api/kamapage (key checked here): EVERY party of swarm.config.json (party = its leader's name) with members + levels + online, the
// daily switch, today's done / tries (Logs/daily_<leader>.json, only when its day is today: the lock resets 06:30), and per Kamaloka the
// fit / today / runnable state + the NEXT daily pick from Dashboard/kamalogic.js (= swarm.js dailyDue / manualKamaloka, see that file).
// Plus every Kamaloka (dungeons_h5.json) with its map layout (Dashboard/data/kamaloka_layout.json) and what our runs learned
// (Logs/kamaloka_map.json), cleared today (kamaloka.log, attributed to a party via daily.log / kamaloka_live.json), run history, daily.log.
// The Run button goes through /api/command, the daily switch through POST /api/daily (server.js).
// HALL TEAM PER PARTY (user 2026-10-09 16:05: "a Kamaloka hall team per party, so 9-member parties can run Halls"): every party shows its
// hall team (configured / the old global list / automatic) and POST /api/kamahall { leader, names: [2-6 names] | null (= automatic), expect }
// writes swarm.config.json kamaloka.hallTeams[<leader>] (atomic tmp + rename, the file's own layout kept, the old file copied to
// Settings/backup/swarm_config_history/ first, last 50 kept; 409 when it changed since the page loaded). swarm.js reads it live (30 s).
'use strict';
const fs = require('fs'), path = require('path');
const KL = require('./kamalogic');

/** swarm.config.json next to Logs (the install root swarm.js reads; in a test sandbox the sandbox's own file) */
const cfgFile = (ctx) => path.join(ctx.LOGS, '..', 'swarm.config.json');
function readCfgFresh(ctx) {
  try { return JSON.parse(fs.readFileSync(cfgFile(ctx), 'utf8').replace(/^\uFEFF/, '')); } catch (e) { }
  try { return ctx.reloadCfg() || {}; } catch (e) { return {}; }
}
/** the hall settings for kamalogic.evalParty: per-party teams, the old global list (its own party only), the healer roles */
function hallSettings(ctx, cfg) {
  const ht = cfg && cfg.kamaloka && cfg.kamaloka.hallTeams && typeof cfg.kamaloka.hallTeams === 'object' ? cfg.kamaloka.hallTeams : {};
  let legacy = []; try { legacy = (ctx.hallTeam() || []).map(String); } catch (e) { }
  return { hallTeams: ht, legacy, healerRoles: Array.isArray(cfg && cfg.healerRoles) && cfg.healerRoles.length ? cfg.healerRoles.map(String) : KL.HEALER_ROLES };
}
/** swarm.config.json in its own layout: 2-space blocks, accounts one per line, hallTeams one party per line (round-trips the file as it is) */
function cfgText(o) {
  const inline = (v) => Array.isArray(v) ? '[' + v.map(inline).join(', ') + ']'
    : v && typeof v === 'object' ? (Object.keys(v).length ? '{ ' + Object.keys(v).map(x => JSON.stringify(x) + ': ' + inline(v[x])).join(', ') + ' }' : '{}') : JSON.stringify(v);
  const fmt = (v, ind, key) => {
    const pad = '  '.repeat(ind + 1), end = '  '.repeat(ind);
    if (Array.isArray(v)) {
      if (!v.length) return '[]';
      if (key === 'accounts') return '[\n' + v.map(x => pad + inline(x)).join(',\n') + '\n' + end + ']';
      return '[\n' + v.map(x => pad + fmt(x, ind + 1, '')).join(',\n') + '\n' + end + ']';
    }
    if (v && typeof v === 'object') {
      const ks = Object.keys(v); if (!ks.length) return '{}';
      if (key === 'hallTeams') return '{\n' + ks.map(x => pad + JSON.stringify(x) + ': ' + inline(v[x])).join(',\n') + '\n' + end + '}';
      return '{\n' + ks.map(x => pad + JSON.stringify(x) + ': ' + fmt(v[x], ind + 1, x)).join(',\n') + '\n' + end + '}';
    }
    return JSON.stringify(v);
  };
  return fmt(o, 0, '') + '\n';
}
/** POST /api/kamahall: { leader, names: [..] | null, expect: [..] | null } -> { ok, hallTeams } */
function saveHall(ctx, b) {
  const F = cfgFile(ctx);
  if (!fs.existsSync(F)) return { code: 404, error: 'swarm.config.json not found' };
  const raw = fs.readFileSync(F, 'utf8'), bom = raw.charCodeAt(0) === 0xFEFF;
  let cfg; try { cfg = JSON.parse(raw.replace(/^\uFEFF/, '')); } catch (e) { return { code: 500, error: 'swarm.config.json does not parse: ' + e.message }; }
  const leader = String(b.leader || '');
  const party = partyList(ctx).find(p => p.leader === leader);
  if (!party) return { code: 400, error: `no party "${leader}" in swarm.config.json` };
  const cur = cfg.kamaloka && cfg.kamaloka.hallTeams && Array.isArray(cfg.kamaloka.hallTeams[leader]) ? cfg.kamaloka.hallTeams[leader] : null;
  if (b.expect !== undefined && JSON.stringify(cur || null) !== JSON.stringify(b.expect || null)) return { code: 409, error: `the hall team of party ${leader} was changed meanwhile (now: ${cur ? cur.join(', ') : 'automatic'}) — reload and try again`, current: cur };
  let names = null;
  if (b.names !== null && b.names !== undefined) {
    const c = KL.checkHallTeam(leader, party.names, b.names);
    if (!c.ok) return { code: 400, error: c.why };
    names = c.names;
  }
  cfg.kamaloka = cfg.kamaloka && typeof cfg.kamaloka === 'object' ? cfg.kamaloka : {};
  cfg.kamaloka.hallTeams = cfg.kamaloka.hallTeams && typeof cfg.kamaloka.hallTeams === 'object' ? cfg.kamaloka.hallTeams : {};
  if (names) cfg.kamaloka.hallTeams[leader] = names; else delete cfg.kamaloka.hallTeams[leader];
  // history first (the file as it was), last 50 kept
  const H = path.join(ctx.LOGS, '..', 'Settings', 'backup', 'swarm_config_history');
  try {
    fs.mkdirSync(H, { recursive: true });
    fs.writeFileSync(path.join(H, 'swarm.config.' + new Date().toISOString().replace(/[:.]/g, '-') + '.json'), raw);
    const old = fs.readdirSync(H).filter(f => /^swarm\.config\..*\.json$/.test(f)).sort();
    old.slice(0, Math.max(0, old.length - 50)).forEach(f => { try { fs.unlinkSync(path.join(H, f)); } catch (e) { } });
  } catch (e) { return { code: 500, error: 'could not write the history copy: ' + e.message }; }
  const txt = (bom ? '\uFEFF' : '') + cfgText(cfg);
  JSON.parse(txt.replace(/^\uFEFF/, ''));                               // never write a file that does not parse
  const tmp = F + '.tmp';
  fs.writeFileSync(tmp, txt, 'utf8'); fs.renameSync(tmp, F);
  try { fs.appendFileSync(path.join(ctx.LOGS, 'dashboard_commands.log'), `${new Date().toISOString()}\tkamahall\t${leader}\t${names ? names.join(',') : 'automatic'}\r\n`); } catch (e) { }
  return { code: 200, ok: true, leader, names, hallTeams: cfg.kamaloka.hallTeams };
}

function tsv(file) { try { return fs.readFileSync(file, 'utf8').replace(/^﻿/, '').split(/\r?\n/).filter(Boolean).map(l => l.split('\t')); } catch (e) { return []; } }

/** parties in config order (main leader first): { leader: [names] } from server.js teamMap() (swarm.config.json accounts[].party) */
function partyList(ctx) {
  const map = ctx.teamMap() || {};
  let order = [];
  try { const cur = ctx.reloadCfg(); if (cur && Array.isArray(cur.accounts)) order = cur.accounts.filter(a => a && a.character && a.enabled !== false).map(a => String(a.character)); } catch (e) { }
  Object.keys(map).forEach(n => { if (!order.includes(n)) order.push(n); });
  const out = {};
  order.forEach(n => { const p = map[n]; if (!p) return; (out[p] = out[p] || []).push(n); });
  Object.keys(out).forEach(p => { if (!out[p].includes(p)) out[p].unshift(p); else out[p] = [p].concat(out[p].filter(n => n !== p)); });
  const leaders = Object.keys(out).sort((a, b) => (a === ctx.mainLeader ? -1 : b === ctx.mainLeader ? 1 : 0));
  return leaders.map(l => ({ leader: l, names: out[l] }));
}

/** KAMALOKA CHARS bootstrap: did <name>'s intent log (Logs/intent_<name>.log, last 3 MB) say needle between fromMs and toMs? */
function intentHit(LOGS, name, fromMs, toMs, needle) {
  let t = '';
  try { const f = path.join(LOGS, 'intent_' + name + '.log'), st = fs.statSync(f), n = Math.min(st.size, 3e6), fd = fs.openSync(f, 'r'), b = Buffer.alloc(n);
    fs.readSync(fd, b, 0, n, st.size - n); fs.closeSync(fd); t = b.toString('utf8'); } catch (e) { return false; }
  return t.split('\n').some(l => { if (l.indexOf(needle) < 0) return false; const ms = Date.parse(l.slice(0, 24)); return ms >= fromMs && ms <= toMs; });
}
/** KAMALOKA CHARS bootstrap: names in Logs/raid_dmg_raw.log (iso \t name \t msgId \t text; last 5 MB) whose damage line names the boss in the window */
function dmgNames(LOGS, fromMs, toMs, boss) {
  const out = {};
  try { const f = path.join(LOGS, 'raid_dmg_raw.log'), st = fs.statSync(f), n = Math.min(st.size, 5e6), fd = fs.openSync(f, 'r'), b = Buffer.alloc(n);
    fs.readSync(fd, b, 0, n, st.size - n); fs.closeSync(fd);
    b.toString('utf8').split('\n').forEach(l => { if (!boss || l.indexOf(boss) < 0) return; const p = l.split('\t'); const ms = Date.parse(p[0]); if (ms >= fromMs && ms <= toMs && p[1]) out[p[1]] = 1; });
  } catch (e) { }
  return out;
}
function info(ctx) {
  const { DATA, LOGS, DIR, readJson } = ctx;
  const nowMs = Date.now(), B = KL.dayBounds(nowMs);
  const kamas = (readJson(path.join(DATA, 'dungeons_h5.json'), {}) || {}).kamaloka || [];
  const layout = (readJson(path.join(DIR, 'data', 'kamaloka_layout.json'), {}) || {}).kamaloka || {};
  const learned = readJson(path.join(LOGS, 'kamaloka_map.json'), {}) || {};
  const enabled = readJson(path.join(LOGS, 'daily_enabled.json'), {}) || {};
  const states = {}; (ctx.readStates() || []).forEach(s => { states[s.name] = s; });
  const hall = ctx.hallTeam();
  const cfgNow = readCfgFresh(ctx), HS = hallSettings(ctx, cfgNow);
  const roleOf = {}; (cfgNow.accounts || []).forEach(a => { if (a && a.character && a.role) roleOf[a.character] = String(a.role); });
  // live runs (LIVE PER PARTY 2026-10-09: Logs/kamaloka_live_<leader>.json per party + the old shared file; Dashboard/live_runs.js)
  // lives = every running / finished run (one per party), live = the stable default (oldest running, else newest finished)
  const LR = require('./live_runs');
  const allRuns = LR.readRuns(LOGS, 'kamaloka_live', readJson).map(r => LR.summary(r, 'kama', nowMs));   // also old runs: kamaloka.log attribution
  const lives = allRuns.filter(l => l.running || l.finished).sort((a, b) => (b.running - a.running) || (a.startedMs - b.startedMs) || a.leader.localeCompare(b.leader));
  const live = lives.find(l => l.running) || lives.find(l => l.finished) || null;
  // daily.log: at, leader, id, result, msg
  const dlog = tsv(path.join(LOGS, 'daily.log')).map(([at, leader, id, result, ...m]) => ({ at, ms: Date.parse(at), leader: leader === 'null' ? '' : leader, id, result: result || '?', msg: m.join(' ') }));
  // kamaloka.log: at, id, result — which party? the daily.log line of the same Kamaloka within 90 min, else the live file's run
  // KAMALOKA LOOT/CHARS 2026-10-09: swarm.js adds a "by:<leader>" field to its result line (the party that ran it)
  const kh = tsv(path.join(LOGS, 'kamaloka.log')).map(([at, id, ...r]) => {
    const ms = Date.parse(at); let by = '';
    const bi = r.findIndex(x => /^by:/.test(x)); if (bi >= 0) { by = r[bi].slice(3); r = r.filter((x, i) => i !== bi); }
    const d = by ? null : dlog.filter(x => x.id === id && x.leader && Math.abs(x.ms - ms) <= 90 * 60000).sort((a, b) => Math.abs(a.ms - ms) - Math.abs(b.ms - ms))[0];
    if (d) by = d.leader;
    else if (!by) { const l = allRuns.find(x => x.id === id && x.leader && Math.abs((x.endedMs || x.startedMs) - ms) <= 15 * 60000); if (l) by = l.leader; }
    return { at, ms, id, result: r.join(' '), by };
  });
  const plist = partyList(ctx);
  // KAMALOKA CHARS 2026-10-09: the per-character lock of today (Logs/kamaloka_chars.json, written by swarm.js; reset 06:30)
  const KCF = path.join(LOGS, 'kamaloka_chars.json');
  const KC = readJson(KCF, null), chars = KC && KC.day === B.day && KC.chars ? KC.chars : {};
  const dailyOf = {}; plist.forEach(({ leader }) => { const f = readJson(path.join(LOGS, 'daily_' + leader + '.json'), null); dailyOf[leader] = f && f.day === B.day ? f : { done: {}, tries: {} }; });
  const cleared = {};
  kh.forEach(h => {
    if (!/clear/i.test(h.result) || h.ms < B.start) return;
    let by = h.by;
    if (!by) { const c0 = Object.keys(chars).map(n => chars[n]).find(c => c.id === h.id && c.st === 'done' && c.by && Math.abs(Date.parse(c.at) - h.ms) < 3600000); if (c0) by = c0.by; }
    if (!by) { const p = plist.find(({ leader }) => /clear/i.test(String((dailyOf[leader].done || {})[h.id] || ''))); if (p) by = p.leader; }   // the party whose daily file says it cleared it
    const c = cleared[h.id] = cleared[h.id] || { at: h.at, by, runs: [] };
    c.at = h.at; c.by = by; c.runs.push({ at: h.at, by });
  });
  // runs cleared before swarm.js recorded characters (today's first runs): assume the party's hall team (or the whole party when it fits) was
  // inside, marked assumed:true, and saved so swarm.js's daily pick knows it too
  { let add = 0;
    Object.keys(cleared).forEach(id => cleared[id].runs.forEach(run => {
      const k = kamas.find(x => x.id === id) || {}, needle = 'instance: fighting ' + ((k.boss && k.boss.name) || '\u0000'), ms = Date.parse(run.at), from = ms - 45 * 60000;
      if (!run.by) { const p0 = plist.find(x => intentHit(LOGS, x.leader, from, ms + 60000, needle)); if (p0) { run.by = p0.leader; if (cleared[id].at === run.at) cleared[id].by = p0.leader; } }
      const p = plist.find(x => x.leader === run.by); if (!p) return;
      if (p.names.some(n => chars[n] && chars[n].id === id)) return;
      // who was inside: the members whose own intent log says "instance: fighting <boss>" before the clear; else the hall team swarm.js picks
      const dn = dmgNames(LOGS, from, ms + 60000, k.boss && String(k.boss.name).split(' ').pop());   // everyone who hit / was hit by the boss
      let names = p.names.filter(n => dn[n] || intentHit(LOGS, n, from, ms + 60000, needle));
      // healers never show in the damage log: fill up with the hall team swarm.js would pick when fewer than the instance holds were found
      if (names.length < Math.min(p.names.length, k.partyMax || 6)) {
        const found = names.slice();
        const mates = p.names.map(n => ({ name: n, lv: Number((states[n] || {}).level) || 0, role: (states[n] || {}).role || roleOf[n] || '' }));
        try { names = found.concat(KL.kamaBenchPlan(k, mates, p.leader, KL.kamaHallCfg({ hallTeams: HS.hallTeams, legacy: HS.legacy }, p.leader), { healer: HS.healerRoles, tank: KL.KAMAHALL.tankRoles }).team.filter(n => !found.includes(n))).slice(0, Math.max(found.length, k.partyMax || 6)); } catch (e) { names = found; }
      }
      names.forEach(n => { if (!chars[n] || chars[n].st === 'entered') { chars[n] = { st: 'done', id, name: k.name || id, at: run.at, by: p.leader, assumed: true }; add++; } });
    }));
    if (add) { try { const tmp = KCF + '.tmp'; fs.writeFileSync(tmp, JSON.stringify({ day: B.day, chars }, null, 1)); fs.renameSync(tmp, KCF); } catch (e) { } } }
  Object.keys(cleared).forEach(id => { cleared[id].runs.forEach(r => { r.n = Object.keys(chars).filter(n => chars[n].id === id && chars[n].st === 'done' && chars[n].by === r.by).length; });
    const last = cleared[id].runs[cleared[id].runs.length - 1]; cleared[id].n = last ? last.n : 0; });
  const parties = plist.map(({ leader, names }) => {
    const f = readJson(path.join(LOGS, 'daily_' + leader + '.json'), null);
    const today = dailyOf[leader] || { done: {}, tries: {} };
    const members = names.map(n => { const s = states[n] || {};
      return { name: n, level: s.level ?? null, cls: s.cls || '', role: s.role || roleOf[n] || '', online: s.ageSec != null && s.ageSec <= 90, ageSec: s.ageSec ?? null, dead: !!s.dead,
        kama: chars[n] || null }; });   // KAMALOKA CHARS: { st: done|locked|entered, id, name, at, by, assumed }
    const en = !!(enabled[leader] && enabled[leader].kamaloka);
    const locked = {}; names.forEach(n => { const c = chars[n]; if (c && (c.st === 'done' || c.st === 'locked')) locked[n] = c; });
    const ev = KL.evalParty(kamas, { leader, members, done: today.done || {}, tries: today.tries || {}, enabled: en, locked }, HS);
    const last = dlog.filter(x => x.leader === leader).slice(-1)[0] || null;
    const lastDay = f && f.day && f.day !== B.day ? f.day : '';
    const own = Array.isArray(HS.hallTeams[leader]) && HS.hallTeams[leader].length ? HS.hallTeams[leader].map(String) : null;
    return { leader, members, done: today.done || {}, tries: today.tries || {}, enabled: { kamaloka: en }, eval: ev, lastDaily: last, lastDay,
      hall: { src: ev.hallSrc, set: own, names: ev.hallCfg || [], suggest: ev.hallSuggest },
      running: lives.some(l => l.running && l.leader === leader) };
  });
  // "Can run now" (user 2026-10-09 18:27): every party + Kamaloka pair that is really possible today (fits with its free characters, not done
  // by the party, tries left, the party not in a run) — the same truth as the daily pick
  const canRun = [];
  parties.forEach(p => { if (p.running) return; kamas.forEach(k => { const r = p.eval.rows[k.id]; if (r && r.ok && r.free) canRun.push({ leader: p.leader, id: k.id, txt: r.txt, hall: !!r.hallNames, names: r.hallNames || p.members.map(m => m.name), next: !!(p.eval.next && p.eval.next.id === k.id), enabled: p.enabled.kamaloka }); }); });
  canRun.sort((a, b) => (b.next - a.next) || KL.lvlNum(b.id) - KL.lvlNum(a.id));
  return {
    v: 1, now: nowMs, canRun, chars, day: B.day, dayStart: B.start, nextReset: B.next, hallTeam: hall, hallSource: ctx.hallSource(), hallTeams: HS.hallTeams,
    parties, live, lives, cleared,
    history: kh.slice(-60).reverse().map(({ ms, ...h }) => h),
    daily: dlog.slice(-40).reverse().map(({ ms, ...d }) => d),
    kamaloka: kamas.map(k => ({ id: k.id, lvl: KL.lvlNum(k.id), name: k.name, kind: KL.isHall(k) ? 'hall' : 'labyrinth', levelMin: k.levelMin, levelMax: k.levelMax,
      partyMin: k.partyMin, partyMax: k.partyMax, durationMin: k.durationMin, entry: k.entry, boss: k.boss, rewards: k.rewards,
      layout: layout[k.id] || null, learned: learned[k.id] || null })),
  };
}

const STATIC = { '/kamapage.js': 'text/javascript; charset=utf-8', '/kamapage.css': 'text/css; charset=utf-8', '/kamalogic.js': 'text/javascript; charset=utf-8' };
/** server.js: if (await require('./kamapage_api').handle(req, res, url, ctx)) return; */
async function handle(req, res, url, ctx) {
  const p = url.pathname;
  if (STATIC[p]) {
    res.writeHead(200, { 'Content-Type': STATIC[p], 'Cache-Control': 'no-cache' });
    res.end(fs.readFileSync(path.join(ctx.DIR, path.basename(p))));
    return true;
  }
  if (p === '/api/kamahall') {
    if (!ctx.allowed(req, url)) { ctx.send(res, 401, 'text/plain; charset=utf-8', 'Access denied'); return true; }
    if (req.method !== 'POST') { ctx.json(res, 405, { error: 'POST { leader, names | null, expect }' }); return true; }
    let b = {}; try { let t = ''; for await (const c of req) t += c; b = JSON.parse(t || '{}'); } catch (e) { ctx.json(res, 400, { error: 'bad JSON' }); return true; }
    try { const r = saveHall(ctx, b); ctx.json(res, r.code || 200, r); } catch (e) { ctx.json(res, 500, { error: e.message }); }
    return true;
  }
  if (p === '/api/kamapage') {
    if (!ctx.allowed(req, url)) { ctx.send(res, 401, 'text/plain; charset=utf-8', 'Access denied'); return true; }
    try { ctx.json(res, 200, info(ctx)); } catch (e) { ctx.json(res, 500, { error: e.message }); }
    return true;
  }
  return false;
}
module.exports = { handle, info, partyList, saveHall, cfgText };
