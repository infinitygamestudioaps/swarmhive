// QUEST LIVE (user 2026-10-12: "Under /quests/40 I want to see live progress for EACH character doing the quest, what step they are on, where
// they are going etc."). Served through questpage_api.js (same key check, no server.js hook of its own):
//   GET /api/quests/live?id=<id>   { ok, at, id, quest{ id, name, type, repeatable, total, npcs[], hunts[] }, chars[] }   every character running
//                                   quest <id> + the ones that finished / stopped it in the last 6 h (ended: true)
//   GET /api/quests/live           { ok, at, id: null, chars[] }   every character running ANY quest (compact rows for the #/quests "Live quests" box)
// Reads only small files: Logs/quest_state_<Name>.json (swarm.js QENGINE: active run, per-quest status, last 40 log lines; cached by mtime),
// Logs/swarm_state_<Name>.json through ctx.readStates() (position, task, intent, route, hp/mp), the END of Logs/intent_<Name>.log (8 KB, detail
// view only), Scripts/data/quests/<id>.json (one quest, cached by mtime). Never quests_h5.json.
// Env for tests: SWARM_QUESTLIVE_LOGS (a fixture Logs dir: swarm_state_* + quest_state_* + intent_* are read from there), SWARM_QUESTDIR.
'use strict';
const fs = require('fs'), path = require('path');
const RECENT_MS = 6 * 3600e3, ENDED = /^(done|failed|stopped|cannot)$/, NAME_RE = /^[A-Za-z0-9_-]{1,32}$/;
const PHASE_TXT = { start: 'taking the quest', travel: 'travelling', talk: 'talking', hunt: 'hunting', spawn: 'spawning the quest monster', turnin: 'handing in',
  wait: 'waiting', done: 'done', failed: 'failed', stopped: 'stopped', cannot: 'cannot take it' };

const dirs = (ctx) => ({ logs: process.env.SWARM_QUESTLIVE_LOGS || ctx.LOGS, quests: process.env.SWARM_QUESTDIR || path.join(ctx.DATA, 'quests'), own: !!process.env.SWARM_QUESTLIVE_LOGS });
const mtime = (f) => { try { return fs.statSync(f).mtimeMs; } catch (e) { return 0; } };
const readJ = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch (e) { return null; } };
const finite = (v) => v !== null && v !== undefined && v !== '' && isFinite(Number(v));
const iso = (t) => { const n = Date.parse(t || ''); return isFinite(n) ? n : 0; };

// ---------------------------------------------------------------- small cached reads
const QC = {}, SC = {};
function questData(ctx, id) {
  const k = String(Number(id)); if (!/^\d{1,6}$/.test(k)) return null;
  const f = path.join(dirs(ctx).quests, k + '.json'), m = mtime(f); if (!m) return null;
  if (QC[k] && QC[k].m === m) return QC[k].q;
  if (Object.keys(QC).length > 60) Object.keys(QC).forEach(x => delete QC[x]);
  const q = readJ(f); QC[k] = { m, q }; return q;
}
/** every Logs/quest_state_<Name>.json -> { name: state } (each file re-read only when it changed) */
function questStates(ctx) {
  const L = dirs(ctx).logs, out = {};
  let files = []; try { files = fs.readdirSync(L); } catch (e) { return out; }
  files.forEach(f => {
    const m = f.match(/^quest_state_([A-Za-z0-9_-]+)\.json$/); if (!m) return;
    const p = path.join(L, f), t = mtime(p);
    if (!SC[p] || SC[p].t !== t) SC[p] = { t, j: readJ(p) };
    if (SC[p].j && typeof SC[p].j === 'object') out[m[1]] = SC[p].j;
  });
  return out;
}
function swarmStates(ctx) {
  const D = dirs(ctx);
  if (!D.own) { try { return ctx.readStates ? ctx.readStates() : []; } catch (e) { return []; } }
  const out = [];
  try { fs.readdirSync(D.logs).forEach(f => { if (!/^swarm_state_[A-Za-z0-9_-]+\.json$/.test(f)) return; const s = readJ(path.join(D.logs, f)); if (!s || !s.name) return; s.ageSec = Math.round((Date.now() - iso(s.updated)) / 1000); out.push(s); }); } catch (e) { }
  return out;
}
/** the last lines of a big log: reads at most 'bytes' from the end */
function tailLines(file, bytes) {
  try {
    const st = fs.statSync(file), want = Math.min(st.size, bytes || 8192); if (!want) return [];
    const fd = fs.openSync(file, 'r'), buf = Buffer.alloc(want);
    try { fs.readSync(fd, buf, 0, want, st.size - want); } finally { fs.closeSync(fd); }
    let L = buf.toString('utf8').split(/\r?\n/); if (want < st.size) L = L.slice(1);
    return L.filter(Boolean);
  } catch (e) { return []; }
}
/** intent log lines -> [{ at, action, detail, dist, result, resultDetail }] oldest first (start lines + their "-> action OK|FAIL" results) */
function parseIntentLines(lines) {
  const ev = [];
  lines.forEach(line => {
    let m = line.match(/^(\S+Z)\s+-> (.+?) (OK|FAIL|FEJL)(?:: (.*?))? \| now at (\S+)\s*$/);
    if (m) { for (let i = ev.length - 1; i >= 0; i--) if (ev[i].action === m[2] && !ev[i].result) { ev[i].result = m[3] === 'OK' ? 'OK' : 'FAIL'; ev[i].resultDetail = m[4] || ''; ev[i].doneAt = m[1]; break; } return; }
    m = line.match(/^(\S+Z) ([^:|]+?): (.*)$/); if (!m) return;
    let rest = m[3]; const ti = rest.lastIndexOf(' | task: '); if (ti >= 0) rest = rest.slice(0, ti);
    let dist = null; const fi = rest.lastIndexOf(' | from ');
    if (fi >= 0) { const dm = rest.slice(fi).match(/\((\d+) away\)/); if (dm) dist = Number(dm[1]); rest = rest.slice(0, fi); }
    ev.push({ at: m[1], action: m[2], detail: rest.trim().slice(0, 220), dist });
  });
  // merge repeats in a row (same action + detail)
  const out = [];
  ev.forEach(e => { const p = out[out.length - 1]; if (p && p.action === e.action && p.detail === e.detail && (p.result || '') === (e.result || '')) { p.count = (p.count || 1) + 1; p.at = e.at; return; } out.push(e); });
  return out;
}

// ---------------------------------------------------------------- quest data helpers
function namer(q) {
  const N = {};
  if (!q) return (id) => '#' + id;
  [].concat(q.npcs || [], q.startNpcs || [], q.monsters || []).forEach(n => { if (n && n.id != null) N[n.id] = n.name; });
  (q.spawns || []).forEach(s => { if (s.npc && s.name) N[s.npc] = s.name; });
  return (id) => N[id] || ('#' + id);
}
function itemOf(q, id) { return ((q && q.items) || []).find(i => Number(i.id) === Number(id)) || null; }
const list3 = (a) => a.length > 3 ? a.slice(0, 3).join(', ') + ' +' + (a.length - 3) : a.join(', ');
/** the step the character is on: { no (cond, 0 = not taken yet), total, text } */
function stepInfo(q, a) {
  const cond = a && a.started === false ? 0 : finite(a && a.cond) && Number(a.cond) >= 1 ? Number(a.cond) : (a && a.started ? 1 : 0);
  if (!q) return { no: cond, total: null, text: '' };
  const steps = q.steps || [], total = steps.reduce((m, s) => Math.max(m, Number(s.cond) || 0), 0) || null;
  const s = steps.find(x => Number(x.cond) === cond), nm = namer(q);
  let text = s && s.title ? String(s.title) : '';
  if (!text) {
    const parts = [], dropMobs = {};
    (q.drops || []).filter(d => !(d.conds && d.conds.length) || d.conds.indexOf(cond) >= 0).slice(0, 3).forEach(d => {
      (d.monsters || []).forEach(m => { dropMobs[m] = 1; });
      const it = itemOf(q, d.item); parts.push(`collect ${it ? it.name : '#' + d.item}${d.limit ? ' ×' + d.limit : ''} from ${list3((d.monsters || []).map(nm))}`);
    });
    // kill steps whose monsters are already the drop source above are the same hunt: not listed twice
    (q.kills || []).filter(k => (k.conds || []).indexOf(cond) >= 0 && !(k.monsters || []).every(m => dropMobs[m])).slice(0, 2).forEach(k => parts.push(`kill ${list3((k.monsters || []).map(nm))}${k.count ? ' ×' + k.count : ''}`));
    if (s && (s.talk || []).length) parts.push(`${parts.length ? 'then talk to' : 'talk to'} ${list3(s.talk.map(nm))}`);
    text = parts.join(' · ') || (cond === 0 ? 'accept the quest' : 'step ' + cond);
  }
  return { no: cond, total, text };
}
/** live kill counter: the engine's own fields (QUESTLIVE patch) or the step text "kills 3/10" / "· 7 kills" */
function killsOf(a) {
  if (a && finite(a.kills) && a.kills !== null) return { have: Number(a.kills), n: finite(a.killsNeed) ? Number(a.killsNeed) : 0 };
  const t = String((a && a.step) || ''), m = t.match(/kills (\d+)\/(\d+)/);
  if (m) return { have: Number(m[1]), n: Number(m[2]) };
  const m2 = t.match(/· (\d+) kills\s*$/);
  return m2 ? { have: Number(m2[1]), n: 0 } : null;
}
function needOf(q, a) {
  return ((a && a.need) || []).filter(x => x && x.id != null).slice(0, 8).map(x => {
    const it = itemOf(q, x.id);
    return { id: Number(x.id), name: x.name || (it && it.name) || '#' + x.id, icon: (it && it.icon) || null, have: Number(x.have) || 0, n: Number(x.n) || 0 };
  });
}
function parseXY(s) { const m = String(s || '').match(/^(-?\d+),(-?\d+)(?:,(-?\d+))?/); return m ? { x: Number(m[1]), y: Number(m[2]), z: m[3] != null ? Number(m[3]) : null } : null; }
/** where it is going: the engine's target (area / npc with coordinates), a quest NPC by name, else the intent's walk target */
function destOf(q, a, st) {
  const t = (a && a.target) || null; let d = null;
  if (t && finite(t.x) && finite(t.y) && (Number(t.x) || Number(t.y))) d = { name: t.name || '', kind: t.kind || '', x: Number(t.x), y: Number(t.y) };
  else if (t && t.kind === 'npc' && q) {
    const n = [].concat(q.npcs || [], q.startNpcs || []).find(n => n.name === t.name), sp = n && (n.spawns || [])[0];
    if (sp) d = { name: t.name + (n.town ? ' (' + n.town + ')' : ''), kind: 'npc', x: sp[0], y: sp[1] };
    else if (t.name) d = { name: t.name, kind: 'npc', x: null, y: null };
  }
  const I = st && st.intent, it = I && parseXY(I.to);
  if ((!d || d.x == null) && it) d = { name: (d && d.name) || String(I.detail || I.action || '').slice(0, 80), kind: 'walk', x: it.x, y: it.y };
  if ((!d || d.x == null) && st && st.route && st.route.target && finite(st.route.target.x)) d = { name: (d && d.name) || st.route.target.label || 'route', kind: 'route', x: st.route.target.x, y: st.route.target.y };
  if (d && d.x != null && st && finite(st.x)) d.dist = Math.round(Math.hypot(d.x - st.x, d.y - st.y));
  return d;
}
function doingOf(st) {
  if (!st) return null;
  const I = st.intent || {}, R = st.route && st.route.text ? st.route : null;
  return { task: String(st.task || '').slice(0, 200), action: I.action || '', detail: String(I.detail || '').slice(0, 220), dist: finite(I.dist) ? Number(I.dist) : null, at: I.at || null,
    route: R ? { text: String(R.text).slice(0, 160), i: Number(R.i) || 0, n: Array.isArray(R.pts) ? R.pts.length : Number(R.pts) || 0, stuck: !!R.stuck } : null,
    combat: !!st.combat, dead: !!st.dead };
}

// ---------------------------------------------------------------- one row per character
function row(ctx, name, qs, st, id, opt) {
  const a = qs.active || null, q = questData(ctx, a.id), run = !ENDED.test(String(a.phase || ''));
  const s = stepInfo(q, a), age = st && finite(st.ageSec) ? Number(st.ageSec) : null;
  const r = { name, classId: st && st.classId != null ? Number(st.classId) : qs.classId != null ? Number(qs.classId) : null, cls: (st && st.cls) || '',
    level: Number((st && st.level) || qs.level) || 0, party: (st && st.party) || '', online: age != null && age <= 60, ageSec: age,
    stateAge: qs.at ? Math.round((Date.now() - iso(qs.at)) / 1000) : null,
    quest: { id: Number(a.id), name: a.name || (q && q.name) || '' }, running: run, ended: !run, status: run ? 'running' : String(a.phase),
    mode: a.mode || 'solo', leader: a.leader || null, farm: !!a.farm, repeat: finite(a.repeat) ? Number(a.repeat) : 1, runs: Number(a.runs) || 0,
    repeatable: !!a.repeatable, phase: a.phase || '', phaseText: PHASE_TXT[a.phase] || a.phase || '', phaseSince: a.phaseSince || null, phaseAt: a.phaseAt || null,
    startedAt: a.startedAt || null, step: String(a.step || '').slice(0, 220), msg: String(a.msg || '').slice(0, 220), lastMsg: String(a.lastMsg || '').slice(0, 220),
    fails: Number(a.fails) || 0, cond: finite(a.cond) ? Number(a.cond) : null, started: a.started !== false,
    stepNo: s.no, stepTotal: s.total, stepText: s.text, need: needOf(q, a), kills: killsOf(a),
    hp: st && finite(st.hp) ? Number(st.hp) : null, mp: st && finite(st.mp) ? Number(st.mp) : null, dead: !!(st && st.dead),
    x: st && finite(st.x) ? Number(st.x) : null, y: st && finite(st.y) ? Number(st.y) : null,
    plan: (() => { const dq = st && st.doing && st.doing.quest, o = Object.assign({}, a.plan || {}, (dq && Number(dq.id) === Number(a.id) && dq.plan) || {}); return Object.keys(o).length ? o : null; })() };   // QUESTPLAN-2026-10-27: plan step i / n, route point i / n, why it waits (swarm_state is fresher)
  if (!run) r.endedAt = a.phaseAt || null;
  if (opt && opt.detail) {
    r.doing = run ? doingOf(st) : null;
    r.dest = run ? destOf(q, a, st) : null;
    r.events = (qs.log || []).filter(l => l && (l.id == null || Number(l.id) === Number(a.id))).slice(-5).reverse().map(l => ({ at: l.at, msg: String(l.msg || '').slice(0, 240) }));
    if (run) {
      const t0 = iso(a.startedAt);
      r.moves = parseIntentLines(tailLines(path.join(dirs(ctx).logs, `intent_${name}.log`), 8192)).filter(e => iso(e.at) >= t0 - 1000).slice(-4).reverse();
    } else r.moves = [];
  } else {
    r.doing = run && st && st.intent ? { action: st.intent.action || '', detail: String(st.intent.detail || '').slice(0, 140) } : null;
  }
  return r;
}

/** the API answer (cached 1.5 s per id: several open phones share it) */
const RC = {};
function live(ctx, idArg) {
  const id = idArg != null && String(idArg).trim() !== '' ? Number(idArg) : null;
  if (id !== null && !(Number.isInteger(id) && id > 0 && id < 1e6)) return { ok: false, code: 400, error: 'bad quest id' };
  const key = String(id), c = RC[key];
  if (c && Date.now() - c.at < 1500) return c.d;
  const QS = questStates(ctx), byName = {};
  swarmStates(ctx).forEach(s => { if (s && s.name) byName[s.name] = s; });
  const now = Date.now(), chars = [];
  Object.keys(QS).forEach(name => {
    if (!NAME_RE.test(name)) return;
    const qs = QS[name], a = qs && qs.active, st = byName[name] || null;
    if (id !== null) {
      // running / ended this quest (active), or finished it lately while the active record is another quest
      if (a && a.id != null && Number(a.id) === id) {
        if (!ENDED.test(String(a.phase || '')) || now - iso(a.phaseAt || qs.at) < RECENT_MS) chars.push(row(ctx, name, qs, st, id, { detail: true }));
        return;
      }
      const rec = qs.quests && qs.quests[String(id)];
      const t = rec && Math.max(iso(rec.lastDone), iso(rec.startedAt));
      if (rec && rec.status && rec.status !== 'running' && t && now - t < RECENT_MS) {
        const fake = { id, name: rec.name, phase: rec.status, phaseAt: rec.lastDone || rec.startedAt, runs: rec.runs, msg: rec.lastMsg || '', started: rec.status !== 'cannot' };
        chars.push(Object.assign(row(ctx, name, Object.assign({}, qs, { active: fake }), st, id, { detail: true }), { otherActive: a && a.id ? { id: Number(a.id), name: a.name || '' } : null }));
      }
      return;
    }
    if (a && a.id != null && (!ENDED.test(String(a.phase || '')) || now - iso(a.phaseAt || qs.at) < RECENT_MS)) chars.push(row(ctx, name, qs, st, null, {}));
  });
  chars.sort((x, y) => (x.ended - y.ended) || (y.online - x.online) || x.name.localeCompare(y.name));
  const d = { ok: true, at: new Date().toISOString(), id, chars };
  if (id !== null) {
    const q = questData(ctx, id);
    if (q) {
      const startIds = new Set((q.startNpcs || []).map(n => Number(n.id))), npcs = [], seen = {};
      [].concat(q.startNpcs || [], q.npcs || []).forEach(n => { if (seen[n.id]) return; seen[n.id] = 1; const sp = (n.spawns || [])[0]; if (sp) npcs.push({ id: n.id, name: n.name, title: n.title || '', town: n.town || n.region || '', x: sp[0], y: sp[1], start: startIds.has(Number(n.id)) }); });
      const hunts = [];
      (q.monsters || []).forEach(m => (m.clusters || []).slice(0, 6).forEach(cl => { if (cl.at) hunts.push({ name: m.name, x: cl.at[0], y: cl.at[1], n: Number(cl.count) || 1 }); }));
      d.quest = { id, name: q.name, type: q.type || '', repeatable: q.type === 'repeatable' || q.type === 'daily' || !!q.endless, total: stepInfo(q, { started: true, cond: 1 }).total, npcs, hunts: hunts.slice(0, 40) };
    } else d.quest = { id, name: '', npcs: [], hunts: [] };
  }
  RC[key] = { at: Date.now(), d };
  return d;
}
module.exports = { live, stepInfo, killsOf, destOf, parseIntentLines, tailLines, PHASE_TXT, _reset: () => { [QC, SC, RC].forEach(o => Object.keys(o).forEach(k => delete o[k])); } };
