// QUEST PLAN BUILD + AUDIT (owner 2026-10-27: "make sure you have all quests created and they have the path ... Each quest should be setup so the bot
// can run it automatically. Step by step, and you should be able to follow live and see what quest it's on and step etc, even change the pathfinding
// for a specific quest IF it should NOT work").
//
// One PLAN per quest:  Scripts/data/quest_plans/<id>.json  (format: docs/requirements/quests.md + docs/plan/quest_status.md "Plan format")
//   { id, name, version, generated, tool, level, type, region, requirements, restrictions[], status 'ready'|'fixable'|'not-for-bots', reasons[],
//     expectedMin, steps: [ { i, key, cond, kind 'start'|'talk'|'deliver'|'hunt'|'spawn'|'special', text, to, links[],
//       npc { id, name, at[x,y,z], town, alt[[x,y,z]] }            (talk / start / deliver)
//       monsters[{ id, name, level, aggressive, spawns }], items[{ id, name, n, from[{ id, name, chance }] }], kills (hunt / spawn)
//       area { kind 'field'|'room'|'cluster', id, name, at, radius, levels, count, atlasKey, alt[] }   (hunt / spawn: WHERE)
//       travel { src 'atlas'|'computed'|'none', key, status, from, via, length, sec, start, points (computed: the walk the bot takes), pv (map preview),
//                checks { reachable, walls, water, danger, dangerVsLevel, aggro[] }, needs[] }                                         (HOW TO GET THERE)
//       engine (what the swarm.js quest engine would do at this cond: QENGINE-PURE qeDecide), expectedSec, reasons[] } ],
//     override: { skip, manual, note, steps: { <step key>: { route[[x,y,z]], start{kind,town|from,desc}, npcAt[x,y,z], area{at,radius,name}, skip,
//                 manual, note, editedAt, by } }, editedAt, by }  <- written ONLY by the dashboard (Dashboard/questplan_api.js) / the phase-2 fixers;
//     this tool keeps it (manual_guard.js writeGuarded kind 'questplan') and the engine prefers it.
//
// HOW (no new big searches where the data already has them):
//   NPC places: the quest record's spawns (Scripts/data/quests/<id>.json from quest_extract.js); routes: the NAV ATLAS (Scripts/data/nav_atlas, every
//   NPC with a role / quest, field area, dungeon room: town > gatekeeper > walk, doors, danger, swim). A place the atlas does not have gets a COMPUTED
//   route: the nearest atlas route whose steps the bots can walk as a route (town / gatekeeper / walks) + one geodata leg from its end to the place,
//   searched with the RAID ROUTE POLICY (raid_policy.js: DRY first, walls always block, clearance, drops) in worker children at BelowNormal priority,
//   in batches, cached in Scripts/data/quest_plans/_walks.json (resumable: a re-run only searches the legs it does not have).
//   Hunting places: field areas (field_areas.json, every monster of the area with counts / levels / aggro), dungeon rooms (dungeon_rooms.json), else the
//   quest record's spawn clusters. Danger: aggressive monsters (aggro_h5.json + spawns_h5.json) whose aggro circle touches the walk, vs the quest level.
//
// Run:  node docs/plan/tools/quest_plan_build.js [--only 1,2,3] [--no-walks] [--batch 40] [--max-jobs N] [--mem 700] [--free-min 1500] [--report-only]
//   default = plan (child) -> leg workers (children, restarted every --batch legs / past --mem MB) -> plan again -> status + reports.
// Output: Scripts/data/quest_plans/<id>.json, Scripts/data/quest_status.json, docs/plan/quest_status.md, docs/plan/quest_phase2.md (generated part),
//   progress Logs/quest_plan_progress.json. Env for tests: SWARM_QUESTPLAN_DIR (plan folder), SWARM_QUESTPLAN_NOREPORT=1 (no status / md files).
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
try { os.setPriority(process.pid, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch (e) { }
const ROOT = path.resolve(__dirname, '..', '..', '..');
const DATA = path.join(ROOT, 'Scripts', 'data'), QDIR = path.join(DATA, 'quests'), ATL = path.join(DATA, 'nav_atlas'), LOGS = path.join(ROOT, 'Logs');
const PDIR = process.env.SWARM_QUESTPLAN_DIR || path.join(DATA, 'quest_plans');
const CACHE = path.join(PDIR, '_walks.json'), JOBS = path.join(LOGS, 'quest_plan_jobs.json'), PROGRESS = path.join(LOGS, 'quest_plan_progress.json');
const ARG = process.argv.slice(2), has = (f) => ARG.includes(f), argv = (f, d) => { const i = ARG.indexOf(f); return i >= 0 && ARG[i + 1] ? ARG[i + 1] : d; };
const MEM_MB = +argv('--mem', 700), FREE_MIN_MB = +argv('--free-min', 1500), BATCH = +argv('--batch', 40), MAX_JOBS = +argv('--max-jobs', 1e9);
const ONLY = argv('--only', '') ? new Set(argv('--only', '').split(',').map(Number)) : null;
const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, ''));
const tryJ = (f, d) => { try { return J(f); } catch (e) { return d; } };
const atomic = (f, s) => { const t = f + '.tmp' + process.pid; fs.writeFileSync(t, s); fs.renameSync(t, f); };
const progress = (o) => { try { atomic(PROGRESS, JSON.stringify(Object.assign({ at: new Date().toISOString(), pid: process.pid }, o))); } catch (e) { } };
fs.mkdirSync(PDIR, { recursive: true }); fs.mkdirSync(LOGS, { recursive: true });
const kq = (v) => Math.round(v / 32);
const walkKey = (a, b) => `${kq(a.x)},${kq(a.y)},${kq(a.z || 0)}>${kq(b.x)},${kq(b.y)},${kq(b.z || 0)}#qp1`;
const VERSION = 1;

// =============================================================================================================================== WORKER
if (has('--worker')) {
  const geo = require('./geopath_fast');
  const { policyLeg } = require('./raid_policy');
  const jobs = (tryJ(JOBS, { jobs: [] }).jobs || []);
  let cache = tryJ(CACHE, { walks: {} }); cache.walks = cache.walks || {};
  const mine = new Set(); let n = 0; const t0 = Date.now();
  const flush = () => { const disk = tryJ(CACHE, { walks: {} }); disk.walks = disk.walks || {}; for (const k of mine) if (cache.walks[k]) disk.walks[k] = cache.walks[k]; disk.updated = new Date().toISOString(); atomic(CACHE, JSON.stringify(disk)); cache = disk; mine.clear(); };
  const todo = jobs.filter(j => !cache.walks[j.k]);
  const rk = (p) => ((p.x + 294912) >> 15) * 64 + ((p.y + 262144) >> 15); todo.sort((x, y) => rk(x.a) - rk(y.a) || rk(x.b) - rk(y.b));   // same geodata regions back to back
  const sleepSync = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  for (const j of todo) {
    if (n >= BATCH) break;
    for (let w = 0; os.freemem() / 1048576 < FREE_MIN_MB; w++) { if (w === 0) flush(); progress({ phase: 'legs: waiting for free memory', freeMB: Math.round(os.freemem() / 1048576) }); if (w >= 30) { flush(); process.exit(76); } sleepSync(20000); }
    let r;
    try {
      const straight = Math.hypot(j.a.x - j.b.x, j.a.y - j.b.y);
      r = policyLeg(geo, { a: j.a, b: j.b, avoid: [], pol: { danger: [] } }, straight);
    } catch (e) { r = { ok: false, why: 'error: ' + e.message }; }
    r.at = Date.now(); r.by = process.pid; cache.walks[j.k] = r; mine.add(j.k); n++;
    if (n % 5 === 0) { flush(); progress({ phase: 'legs', done: jobs.length - todo.length + n, total: jobs.length, rssMB: Math.round(process.memoryUsage().rss / 1048576), sec: Math.round((Date.now() - t0) / 1000) }); }
    if (process.memoryUsage().rss / 1048576 > MEM_MB) { flush(); process.exit(75); }
  }
  flush();
  process.exit(todo.length > n ? 75 : 0);
}

// =============================================================================================================================== ORCHESTRATOR
if (!has('--plan')) {
  const pass = ARG.filter(a => a !== '--no-walks');
  const run = (args) => cp.spawnSync(process.execPath, ['--max-old-space-size=' + (args.includes('--gate') ? 3000 : 1400), __filename, '--plan'].concat(args), { stdio: 'inherit', windowsHide: true }).status;   // the gate loads geodata (dry run)
  // READY GATE (2026-10-27): the LAST plan pass runs the dry run for every plan the builder calls ready (--no-gate: off)
  const gateArg = has('--no-gate') ? [] : ['--gate'];
  const oneRun = has('--no-walks') || has('--report-only');
  let st = run(pass.concat(['--write-jobs'], oneRun ? gateArg : []));
  if (st === 0 && !oneRun) {
    let done = 0;
    for (let round = 0; round < 1000; round++) {
      const left = (tryJ(JOBS, { jobs: [] }).jobs || []).length; if (!left) break;
      const c = tryJ(CACHE, { walks: {} }).walks || {}; const pend = (tryJ(JOBS, { jobs: [] }).jobs || []).filter(j => !c[j.k]).length;
      if (!pend || done >= MAX_JOBS) break;
      const r = cp.spawnSync(process.execPath, ['--max-old-space-size=' + Math.max(400, MEM_MB - 100), __filename, '--worker', '--batch', String(Math.min(BATCH, MAX_JOBS - done)), '--mem', String(MEM_MB), '--free-min', String(FREE_MIN_MB)], { stdio: 'inherit', windowsHide: true });
      done += BATCH;
      if (r.status === 76) { console.log(`quest_plan_build: the PC stayed below ${FREE_MIN_MB} MB free — legs paused (run again later; the cache keeps what was done)`); break; }
      if (r.status !== 0 && r.status !== 75) { console.log(`quest_plan_build: worker ended with ${r.status}`); break; }
      console.log(`quest_plan_build: legs batch ${round + 1} done (${pend} were pending before it)`);
    }
    st = run(pass.concat(gateArg));
  }
  process.exit(st || 0);
}

// =============================================================================================================================== PLAN
const SRC = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
const pa = SRC.indexOf('// QENGINE-PURE-BEGIN'), pb = SRC.indexOf('// QENGINE-PURE-END');
const E = new Function(SRC.slice(pa, pb) + '\nreturn { qeDecide, qeStartTrans, qeTransAt, qeNeedList, qeDropsAt, qeDropMobs, qeSpawnOnly, qeHuntAction, qeLinksOf, qeIsQuit, qeTr, qeNeeds, qeDefaultBatch, qeRepeatable, qeTurnIn, qeMemoCheck: typeof qeMemoCheck === "function" ? qeMemoCheck : null };')();
const mg = require('./manual_guard');
// READY GATE (2026-10-27, owner via coordinator: "ready ONLY when quest_dryrun.js passes"): a plan the builder would call ready is checked by the
// independent dry run (docs/plan/tools/quest_dryrun.js verifyOne: script vs data, engine flow, override fields the engine reads, geodata routes,
// aggressive monsters 6+ on every walk). Not passed = 'fixable' with 'dryrun-fail' + one 'dryrun:<code>' reason per failing check.
// The caller holds Logs/quest_build.lock (the dry run never takes it in this mode). Java source: --src <datapack root | dir of <id>.java>,
// env QUEST_JAVA_DIR / L2J_DP, else the last one given (Logs/quest_java_src.json). No source = not ready ('dryrun-no-script').
const GATE = has('--gate'), GATE_GEO = !has('--gate-no-geo');
const JAVA_SRC = (() => { const mem = path.join(LOGS, 'quest_java_src.json'); let s = argv('--src', process.env.QUEST_JAVA_DIR || process.env.L2J_DP || '');
  if (s && fs.existsSync(s)) { try { atomic(mem, JSON.stringify({ src: s, at: new Date().toISOString() })); } catch (e) { } } else s = (tryJ(mem, {}) || {}).src || '';
  return s && fs.existsSync(s) ? s : ''; })();
let DRY = null; const dryMod = () => DRY || (DRY = require('./quest_dryrun.js'));
/** the ready gate for one written plan file -> the plan (status / reasons / dryrun updated) */
function readyGate(plan, pf) {
  if (!GATE || plan.status !== 'ready') return plan;
  const r = JAVA_SRC ? dryMod().verifyOne(plan.id, { src: JAVA_SRC, lockOwned: true, noGeo: !GATE_GEO }) : null;
  if (!r) { plan.status = 'fixable'; plan.reasons.push({ code: 'dryrun-no-script', text: REASON['dryrun-no-script'][1] }); plan.dryrun = { at: new Date().toISOString(), pass: false, fails: [{ code: 'no-script-source' }] }; return plan; }
  const codes = [...new Set(r.fails.map(x => x.code))];
  plan.dryrun = { at: new Date().toISOString(), pass: !codes.length, geo: GATE_GEO, fails: r.fails.slice(0, 30), warns: [...new Set((r.warns || []).map(w => w.code))] };
  if (codes.length) {
    plan.status = 'fixable';
    plan.reasons.push({ code: 'dryrun-fail', text: 'dry run: ' + codes.join(', ') });
    codes.forEach(c => plan.reasons.push({ code: 'dryrun:' + c, text: String((r.fails.find(x => x.code === c) || {}).t || c).slice(0, 300) }));
  }
  return plan;
}

// ---- data ----
const IDX = tryJ(path.join(ATL, 'index.json'), { targets: [] });
const ROWS = (IDX.targets || []).map(t => ({ key: t[0], type: t[1], name: t[2], x: t[3], y: t[4], z: t[5], status: t[6], length: t[7], sec: t[8], id: t[10], flags: t[11] || '' }));
const ROWBY = new Map(ROWS.map(r => [r.key, r]));
const RGRID = new Map(); const RG = 8192; ROWS.forEach(r => { if (r.status === 'unreachable') return; const k = Math.floor(r.x / RG) + ',' + Math.floor(r.y / RG); if (!RGRID.has(k)) RGRID.set(k, []); RGRID.get(k).push(r); });
const fileKey = (key) => key.replace(/[^A-Za-z0-9@,._-]+/g, '_') + '.json';
const RCACHE = new Map();
function atlasRoute(key) {
  if (RCACHE.has(key)) return RCACHE.get(key);
  const r = tryJ(path.join(ATL, 't', fileKey(key)), null);
  if (RCACHE.size > 600) RCACHE.delete(RCACHE.keys().next().value);
  RCACHE.set(key, r); return r;
}
const NPCID = new Map();
function npcRows(id) { if (!NPCID.has(id)) NPCID.set(id, tryJ(path.join(ATL, 'npcid', id + '.json'), []) || []); return NPCID.get(id); }
const FA = tryJ(path.join(DATA, 'field_areas.json'), { regions: [] });
const AREA = new Map(), AREAS_BY_MOB = new Map();
(FA.regions || []).forEach(R => (R.areas || []).forEach(a => { a._region = R.name || R.id; a._rid = R.id; AREA.set(a.id, a); (a.monsters || []).forEach(m => { if (!AREAS_BY_MOB.has(m.id)) AREAS_BY_MOB.set(m.id, []); AREAS_BY_MOB.get(m.id).push(a); }); }));
const DR = tryJ(path.join(DATA, 'dungeon_rooms.json'), []);
const ROOMS_BY_MOB = new Map();
(DR || []).forEach(d => (d.floors || []).forEach(F => (F.rooms || []).forEach(r => { r._d = d.name; r._f = F.name; (r.monsters || []).forEach(m => { if (!ROOMS_BY_MOB.has(m.id)) ROOMS_BY_MOB.set(m.id, []); ROOMS_BY_MOB.get(m.id).push(r); }); })));
const NPCS = tryJ(path.join(DATA, 'npcs_h5.json'), {}), AGGRO = tryJ(path.join(DATA, 'aggro_h5.json'), {});
// LOOKALIKE-2026-10-27 (live test 291: 11 Black Wolves 22232 were never attacked, the quest's script counts only 20317): monsters of another template
// with the SAME name as a quest target give nothing (the script registers ids); the plan says so per hunting place
const SAMENAME = (() => { const by = {}; Object.entries(NPCS).forEach(([id, n]) => { if (n && n.n && /Monster|Raid/i.test(n.ty || '')) (by[n.n] = by[n.n] || []).push(Number(id)); }); const o = new Map(); Object.values(by).forEach(ids => { if (ids.length > 1) ids.forEach(id => o.set(id, ids)); }); return o; })();
const LOOKSP = (() => { const m = new Map(); for (const sp of tryJ(path.join(DATA, 'spawns_h5.json'), [])) { if (!SAMENAME.has(Number(sp.id))) continue; if (!m.has(sp.id)) m.set(sp.id, []); m.get(sp.id).push(sp); } return m; })();
function lookalikes(mobs, area) {
  if (!area || !area.at) return []; const set = new Set((mobs || []).map(Number)), out = [];
  (mobs || []).forEach(id => (SAMENAME.get(Number(id)) || []).forEach(o => { if (set.has(o) || out.some(x => x.id === o)) return; const n = (LOOKSP.get(o) || []).filter(s => Math.hypot(s.x - area.at[0], s.y - area.at[1]) <= (area.radius || 1500) + 300 && Math.abs(s.z - area.at[2]) < 1500).reduce((a, s) => a + (s.count || 1), 0); if (n) out.push({ id: o, name: (NPCS[o] || {}).n, n, not: Number(id) }); }));
  return out;
}
const AGG = new Map(); const AG = 4096;
for (const sp of tryJ(path.join(DATA, 'spawns_h5.json'), [])) { const n = NPCS[sp.id]; if (!n || !n.l) continue; const r = AGGRO[sp.name || n.n]; if (!r) continue; const k = Math.floor(sp.x / AG) + ',' + Math.floor(sp.y / AG); if (!AGG.has(k)) AGG.set(k, []); AGG.get(k).push({ x: sp.x, y: sp.y, z: sp.z, lv: n.l, r, name: sp.name || n.n, id: sp.id }); }
const DANGER = tryJ(path.join(DATA, 'danger_grid.json'), { data: {} });
function dangerAt(x, y, z) { const D = DANGER; if (!D || !D.data) return 0; const gx = Math.floor((x - D.x0) / D.size), gy = Math.floor((y - D.y0) / D.size); const c = D.data[gy * D.w + gx]; if (!c) return 0; let m = 0; c.forEach(([b, lv]) => { if (Math.abs(b * D.band - z) <= D.band * 1.5 && lv > m) m = lv; }); return m; }
const WCACHE = tryJ(CACHE, { walks: {} }).walks || {};
const JOBLIST = new Map();

// ---- helpers ----
const R0 = (v) => Math.round(Number(v) || 0);
const P3 = (p) => Array.isArray(p) ? [R0(p[0]), R0(p[1]), R0(p[2])] : [R0(p.x), R0(p.y), R0(p.z)];
const flat2pts = (f) => { const o = []; for (let i = 0; i + 2 < (f || []).length; i += 3) o.push([R0(f[i]), R0(f[i + 1]), R0(f[i + 2])]); return o; };
function thin(pts, max) { if (pts.length <= max) return pts; const o = []; const st = (pts.length - 1) / (max - 1); for (let i = 0; i < max; i++) o.push(pts[Math.round(i * st)]); return o; }
function plen(pts) { let s = 0; for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return Math.round(s); }
const STATUS_RANK = { ok: 0, unverified: 1, conditional: 2, blocked: 3, unreachable: 4, pending: 2 };
/** aggressive monsters whose aggro circle touches the walk (sampled every 250) with level >= ref + 6 -> [{ name, lv, n }] */
function aggroOn(pts, ref) {
  const hit = new Map();
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / 250));
    for (let k = 0; k <= n; k++) {
      const x = a[0] + (b[0] - a[0]) * k / n, y = a[1] + (b[1] - a[1]) * k / n, z = a[2] + (b[2] - a[2]) * k / n;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) (AGG.get((Math.floor(x / AG) + dx) + ',' + (Math.floor(y / AG) + dy)) || []).forEach(m => {
        if (m.lv < ref + 6 || Math.abs(m.z - z) > 400 || Math.hypot(m.x - x, m.y - y) > m.r + 100) return;
        const key = m.x + ',' + m.y; if (!hit.has(m.name)) hit.set(m.name, { name: m.name, lv: m.lv, spawns: new Set() }); hit.get(m.name).spawns.add(key);
      });
    }
  }
  return [...hit.values()].map(h => ({ name: h.name, lv: h.lv, n: h.spawns.size })).sort((x, y) => y.lv - x.lv || y.n - x.n).slice(0, 8);
}
/** aggressive non-target spawns ref+8 and up inside a hunting area (the dry run's area-aggro rule: 3+ = too dangerous) -> [{ name, lv }] */
function areaAggro(area, mobs, ref) {
  const out = [], tg = new Set((mobs || []).map(Number)), at = area && area.at; if (!at) return out;
  for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) (AGG.get((Math.floor(at[0] / AG) + dx) + ',' + (Math.floor(at[1] / AG) + dy)) || []).forEach(m => {
    if (m.lv >= ref + 8 && Math.abs(m.z - at[2]) < 800 && Math.hypot(m.x - at[0], m.y - at[1]) <= (area.radius || 1500) && !tg.has(Number(m.id))) out.push({ name: m.name, lv: m.lv });
  });
  return out;
}
/** a nav atlas route -> the plan's travel block (compact steps, the walk points, the checks) */
function travelFromAtlas(r, ref, extraPts, extra) {
  const steps = [], pts = [];
  let swimLen = 0, maxSwim = 0, straight = 0, start = null, simple = true, gkSeen = 0;
  (r.steps || []).forEach(s => {
    if (s.do === 'town') { steps.push({ do: 'town', town: s.town, cmd: s.cmd }); if (!start && !steps.some(x => x.do === 'walk')) start = { kind: 'town', town: s.town }; }
    else if (s.do === 'gk') { steps.push({ do: 'gk', from: s.from, desc: s.desc, link: s.linkLive || s.link, price: s.price || 0, live: !!s.live }); gkSeen++; if (gkSeen === 1 && !pts.length) start = { kind: 'gk', from: s.from, desc: s.desc }; else simple = false; }
    else if (s.do === 'walk') { const p = flat2pts(s.points); pts.push(...(pts.length ? p.slice(1) : p)); steps.push({ do: 'walk', len: s.len, how: s.how, danger: s.danger || 0 }); if (s.how === 'straight') straight++; if (s.swimLen) { swimLen += s.swimLen; maxSwim = Math.max(maxSwim, s.maxSwim || 0); } }
    else if (s.do === 'arrive') { }
    else { simple = false; steps.push(Object.assign({ do: s.do }, s.do === 'door' ? { name: s.name || s.doorId, need: s.need } : s.do === 'floor' ? { npc: s.npc && s.npc.name, link: s.link, floor: s.floorName || s.floor } : s.do === 'enter' ? { how: s.how, npc: s.npc && s.npc.name, link: s.link } : s.do === 'need' ? { text: s.text } : {})); }
  });
  const all = pts.concat(extraPts || []);
  const t = { src: extra && extra.src || 'atlas', key: r.key, status: r.status, flags: r.flags || [], from: r.from || '', length: R0((r.length || 0) + plen(extraPts || [])), sec: R0((r.sec || 0) + plen(extraPts || []) / 120),
    via: steps.filter(s => s.do !== 'walk').map(s => s.do === 'town' ? s.cmd : s.do === 'gk' ? s.desc : s.do === 'door' ? 'door ' + s.name : s.do === 'floor' ? 'floor ' + (s.floor || '') : s.do === 'enter' ? 'enter ' + (s.npc || s.how) : s.do === 'need' ? 'needs: ' + s.text : s.do).join(' > '),
    steps, start, simple, pv: thin(all, 50), maxDanger: Math.max(r.maxDanger || 0, ...(extraPts || []).map(p => dangerAt(p[0], p[1], p[2]))),
    needs: [].concat(...Object.values(r.needs || {}).map(v => Array.isArray(v) ? v.map(x => x.why || x.item || JSON.stringify(x).slice(0, 80)) : [])).slice(0, 6), why: (r.why || []).slice(0, 4) };
  const ag = aggroOn(all, ref);
  t.checks = { reachable: r.status !== 'unreachable', walls: straight ? 'straight legs not wall-checked: ' + straight : 'geodata / saved / graph walks (walls block)', water: swimLen ? { swimLen, maxSwim, overBreath: maxSwim > 2800 } : false,
    danger: t.maxDanger, dangerVsLevel: t.maxDanger ? t.maxDanger - ref : 0, aggro: ag };
  return t;
}
/** the nearest atlas route the bots can walk as a plain route (town / gatekeeper / walks) for a point -> { row, route } | null */
function anchorFor(p) {
  const gx = Math.floor(p[0] / RG), gy = Math.floor(p[1] / RG), cand = [];
  for (let d = 0; d <= 2 && cand.length < 12; d++) for (let dx = -d; dx <= d; dx++) for (let dy = -d; dy <= d; dy++) { if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue; (RGRID.get((gx + dx) + ',' + (gy + dy)) || []).forEach(r => cand.push(r)); }
  cand.forEach(r => { r._d = Math.hypot(r.x - p[0], r.y - p[1]) + Math.abs(r.z - p[2]) * 3 + (STATUS_RANK[r.status] || 0) * 1500; });
  cand.sort((a, b) => a._d - b._d);
  for (const r of cand.slice(0, 14)) {
    if (Math.hypot(r.x - p[0], r.y - p[1]) > 16000) break;
    const route = atlasRoute(r.key); if (!route || !(route.steps || []).length) continue;
    if ((route.steps || []).some(s => !/^(town|gk|walk|arrive)$/.test(s.do))) continue;
    if ((route.steps || []).filter(s => s.do === 'gk').length > 1) continue;
    return { row: r, route };
  }
  return null;
}
/** a computed route to p: the anchor's plain route + one geodata leg (cached; queued for the workers when missing) */
function computedTravel(p, ref, label) {
  const an = anchorFor(p);
  if (!an) return { src: 'none', status: 'unreachable', why: ['no atlas route within 16 km to start from'], checks: { reachable: false }, pv: [] };
  const rp = []; (an.route.steps || []).forEach(s => { if (s.do === 'walk') { const q = flat2pts(s.points); rp.push(...(rp.length ? q.slice(1) : q)); } });
  const end = rp.length ? rp[rp.length - 1] : [an.row.x, an.row.y, an.row.z];
  const a = { x: end[0], y: end[1], z: end[2] }, b = { x: p[0], y: p[1], z: p[2] };
  let leg = [], legSt = 'ok', why = [];
  if (Math.hypot(a.x - b.x, a.y - b.y) > 150 || Math.abs(a.z - b.z) > 300) {
    const k = walkKey(a, b), w = WCACHE[k];
    if (!w) { JOBLIST.set(k, { k, a, b, label }); legSt = 'pending'; why.push('the geodata leg from ' + an.row.name + ' is not searched yet (run the tool with walks)'); }
    else if (!w.ok) { legSt = 'unreachable'; why.push('no walk on the geodata from ' + an.row.name + ': ' + String(w.why || '').slice(0, 160)); }
    else leg = flat2pts(w.pts).slice(1);
  }
  const t = travelFromAtlas(Object.assign({}, an.route, { key: an.row.key }), ref, leg, { src: 'computed' });
  t.anchor = { key: an.row.key, name: an.row.name };
  t.status = legSt === 'ok' ? an.route.status : legSt;
  t.why = why.concat(t.why || []);
  if (legSt === 'ok') { const pts = []; (an.route.steps || []).forEach(s => { if (s.do === 'walk') { const q = flat2pts(s.points); pts.push(...(pts.length ? q.slice(1) : q)); } }); t.points = pts.concat(leg); if (!t.points.length) t.points = [P3(p)]; }
  t.checks.reachable = legSt === 'ok' || legSt === 'pending';
  return t;
}
// LIVELAND-2026-10-27 (coordinator: the Hardin's Private Academy landing is stored, Oren / Valentina 105855,109782,-3200): a LIVE gatekeeper landing
// (Scripts/data/nav_atlas_extra.json gkLinks read LIVE + Scripts/data/gk_landing_live.json "A -> B") within 8 km of a step place whose own travel is not
// ok = .<town> -> that gatekeeper link -> the geodata leg from the landing (queued for the leg workers like every computed leg)
const LIVELAND = (() => {
  const out = [], seen = new Set(), add = (from, dest, l, price, src) => { if (!from || !dest || !Array.isArray(l) || l.length < 2) return; const k = from + '>' + dest; if (seen.has(k)) return; seen.add(k); out.push({ from, dest, at: l.map(Number), price: price || 0, src }); };
  (tryJ(path.join(DATA, 'nav_atlas_extra.json'), {}).gkLinks || []).forEach(g => { if (/^LIVE$/.test(String(g.read || ''))) add(g.from, g.dest, g.landing, g.price, 'nav_atlas_extra gkLinks (LIVE)'); });
  Object.entries(tryJ(path.join(DATA, 'gk_landing_live.json'), {})).forEach(([k, v]) => { const m = String(k).split('->').map(s => s.trim()); if (m.length === 2 && v && isFinite(v.x)) add(m[0], m[1], [v.x, v.y, v.z], 0, 'gk_landing_live.json'); });
  return out;
})();
function landingTravel(p, ref, label) {
  const c = LIVELAND.map(L => Object.assign({ d: Math.hypot(L.at[0] - p[0], L.at[1] - p[1]) }, L)).filter(L => L.d <= 8000 && Math.abs(L.at[2] - p[2]) < 1500).sort((a, b) => a.d - b.d)[0];
  if (!c) return null;
  const a = { x: c.at[0], y: c.at[1], z: c.at[2] }, b = { x: p[0], y: p[1], z: p[2] }, k = walkKey(a, b), w = WCACHE[k];
  let leg = [], st = 'ok', why = [];
  if (Math.hypot(a.x - b.x, a.y - b.y) > 150) { if (!w) { JOBLIST.set(k, { k, a, b, label }); st = 'pending'; why.push('the geodata leg from the ' + c.from + ' -> ' + c.dest + ' landing is not searched yet'); } else if (!w.ok) { st = 'unreachable'; why.push('no walk from the ' + c.dest + ' landing: ' + String(w.why || '').slice(0, 160)); } else leg = flat2pts(w.pts).slice(1); }
  const pts = [c.at].concat(leg), ag = aggroOn(pts, ref);
  return { src: 'computed', key: '', status: st, flags: ['live-landing'], from: c.from, length: R0(plen(pts)), sec: R0(plen(pts) / 120), steps: [{ do: 'town', town: c.from, cmd: '.' + String(c.from).toLowerCase() }, { do: 'gk', from: c.from, desc: c.from + ' -> ' + c.dest, link: c.dest, price: c.price, live: true }, { do: 'walk', len: R0(plen(pts)), how: 'geodata' }],
    via: '.' + String(c.from).toLowerCase() + ' > ' + c.from + ' -> ' + c.dest, start: { kind: 'gk', from: c.from, desc: c.from + ' -> ' + c.dest }, simple: true, pv: thin(pts, 50), points: st === 'ok' ? pts : undefined, landing: { from: c.from, dest: c.dest, src: c.src },
    maxDanger: Math.max(0, ...pts.map(q => dangerAt(q[0], q[1], q[2]))), needs: [], why, checks: { reachable: st !== 'unreachable', walls: 'geodata leg from a live landing (walls block)', water: false, danger: 0, dangerVsLevel: 0, aggro: ag } };
}
/** the step's travel, or the live-landing travel when that one is better (the own travel not ok, the landing way ok / pending) */
function withLanding(t, p, ref, label) {
  if (t && t.status === 'ok') return t;
  const lt = p ? landingTravel(P3(p), ref, label) : null;
  return lt && /^(ok|pending)$/.test(lt.status) ? lt : t;
}
/** travel to an NPC spawn: its own atlas route, else computed */
function npcTravel(id, at, ref, name) {
  const rows = npcRows(id).filter(r => Math.hypot(r[1] - at[0], r[2] - at[1]) < 400);
  if (rows.length) { const r = atlasRoute(rows[0][0]); if (r) return withLanding(travelFromAtlas(Object.assign({ key: rows[0][0] }, r), ref), at, ref, name); }
  return withLanding(computedTravel(at, ref, name), at, ref, name);
}
function placeTravel(key, at, ref, name) {
  if (key) { const r = atlasRoute(key); if (r) return withLanding(travelFromAtlas(Object.assign({ key }, r), ref), at, ref, name); }
  return withLanding(computedTravel(at, ref, name), at, ref, name);
}

// ---- reasons ----
const REASON = {
  'territory-war': ['not-for-bots', 'Territory War quest (only during territory wars, PvP)'],
  'clan': ['not-for-bots', 'clan / clan leader quest (clan level-up, siege, mercenary)'],
  'olympiad': ['not-for-bots', 'Olympiad / PvP condition'],
  'dummy-script': ['not-for-bots', 'tutorial / coupon placeholder script (the server runs it by itself)'],
  'owner-skip': ['not-for-bots', 'skipped on the dashboard (plan override)'],
  'steps-unknown': ['fixable', 'the quest script has no readable state machine (no transitions / no script): steps must be written by hand'],
  'saga-template': ['fixable', 'saga template quest (AbstractSagaQuest arrays): steps / items not resolved'],
  'memo-state': ['fixable', 'memo-state machine (no setCond): the engine cannot read the step'],
  'runtime-cond': ['fixable', 'setCond with a runtime value: the next step is decided by the script'],
  'unresolved-ids': ['fixable', 'NPC / monster ids from arrays the extractor could not resolve'],
  'drop-unresolved': ['fixable', 'a quest drop (item / chance) was not resolved'],
  'no-start-npc': ['fixable', 'no start NPC registered'],
  'kill-parse': ['fixable', 'kill NPCs registered but no drop / kill step parsed'],
  'npc-no-spawn': ['fixable', 'an NPC of a step has no spawn in the datapack'],
  'npc-quest-spawned': ['fixable', 'an NPC of a step is spawned by the quest script (appears only during the quest)'],
  'npc-instance': ['fixable', 'an NPC of a step stands inside an instance / closed zone'],
  'mob-no-spawn': ['fixable', 'a monster of a step has no spawn and no known trigger'],
  'item-from-quest-mob': ['fixable', 'a quest item drops from a monster the quest script spawns (trigger known: the engine kills the trigger first)'],
  'spawn-script': ['fixable', 'a monster / NPC is spawned by a timer / event / other script hook the engine does not do'],
  'no-route': ['fixable', 'no route to a step place (atlas unreachable / no geodata walk)'],
  'route-pending': ['fixable', 'the geodata leg to a step place is not searched yet (run the tool again with walks)'],
  'route-blocked': ['fixable', 'a closed door on the way the party cannot open'],
  'route-conditional': ['fixable', 'the way needs something (airship window, items, Seven Signs, adena for a special teleport ...)'],
  'route-unverified': ['fixable', 'a walk on the way is a straight line not checked against the walls, or a gatekeeper link not seen on a live menu'],
  'route-swim': ['fixable', 'the way has a swim longer than one breath'],
  'aggro-on-way': ['fixable', 'aggressive monsters 6+ levels above the quest level touch the route'],
  'area-danger': ['fixable', 'the hunting place holds aggressive monsters 10+ levels above the quest level (or 3+ aggressive non-target spawns 8+ above)'],
  'dryrun-fail': ['fixable', 'the independent dry run (docs/plan/tools/quest_dryrun.js) does not pass: see the dryrun:<code> reasons'],
  'dryrun-no-script': ['fixable', 'no Java source for the dry run (pass --src <datapack root> once; Logs/quest_java_src.json remembers it)'],
  'no-hunt-place': ['fixable', 'no hunting place (field area / room / spawn cluster) for the monsters of a step'],
  'item-from-elsewhere': ['fixable', 'a step needs an item the quest does not give or drop (bought / crafted / another quest)'],
  'needs-party': ['fixable', 'a raid boss / party-only kill: needs the party (party mode) and a strong enough team'],
  'engine-manual': ['fixable', 'the swarm.js quest engine has no automatic action at a step (qeDecide = manual)'],
  'timer': ['fixable', 'the quest uses timers (despawns / waits) the engine does not watch'],
  'owner-manual': ['fixable', 'marked "manual" on the dashboard (plan override)'],
};
const INFO = { 'race-only': 'only some races', 'class-only': 'only some classes / class groups', 'prereq-quest': 'needs an earlier quest done', 'needs-item': 'needs an item to start',
  'party-instance': 'a Kamaloka boss: party mode', 'subclass': 'subclass only', 'noble': 'noblesse only', 'level-unknown': 'minimum level not found in the script', 'type-unknown': 'one-time / repeatable not found', 'one-time-done-risk': '' };
function reasonsFromParse(q) {
  const o = [];
  (q.parse && q.parse.reasons || []).forEach(t => {
    if (/no script in the datapack|no state transitions found/.test(t)) o.push('steps-unknown');
    else if (/saga template/.test(t)) o.push('saga-template');
    else if (/memo-state machine|memo state computed|memo-state sub-stages/.test(t)) o.push('memo-state');
    else if (/setCond with a runtime value/.test(t)) o.push('runtime-cond');
    else if (/^unresolved:/.test(t)) o.push('unresolved-ids');
    else if (/drop item not resolved|drop chance not resolved/.test(t)) o.push('drop-unresolved');
    else if (/no start NPC registered/.test(t)) o.push('no-start-npc');
    else if (/kill NPCs registered but no drop/.test(t)) o.push('kill-parse');
  });
  return [...new Set(o)];
}

// ---- one quest ----
const STEP_SEC = { talk: 25, start: 30, deliver: 25 };
function npcPlace(q, id) {
  const n = [].concat(q.npcs || [], q.startNpcs || []).find(x => Number(x.id) === Number(id));
  if (!n) return { id, name: (NPCS[id] && NPCS[id].n) || '#' + id, at: null, why: 'npc-no-spawn' };
  const sp = (n.spawns || []).map(P3);
  const o = { id: n.id, name: n.name, title: n.title || '', town: n.town || n.region || '', at: sp[0] || null, alt: sp.slice(1, 4) };
  if (!sp.length) o.why = n.spawnedByQuest ? 'npc-quest-spawned' : 'npc-no-spawn';
  else if (/instance|pailaka|kamaloka|rift|hall of suffering|hall of erosion|seed of/i.test(String(n.region || '') + ' ' + String(n.town || ''))) o.why = 'npc-instance';
  return o;
}
function huntPlace(q, mobIds, ref) {
  const want = new Set(mobIds.map(Number)), cand = [];
  mobIds.forEach(id => {
    (AREAS_BY_MOB.get(Number(id)) || []).forEach(a => { if (cand.some(c => c.kind === 'field' && c.id === a.id)) return;
      const cnt = (a.monsters || []).filter(m => want.has(Number(m.id))).reduce((s, m) => s + (Number(m.count) || 1), 0);
      const row = ROWBY.get('area:' + a.id);
      cand.push({ kind: 'field', id: a.id, name: a.name, at: P3(a.center), radius: R0(a.radius), levels: a.levelRange || null, count: cnt, region: a._region, atlasKey: row ? row.key : null, status: row ? row.status : 'none', sec: row ? row.sec : 600, danger: a.dangerMax || 0, aggrShare: a.aggressiveShare || 0, reachable: a.reachable !== false });
    });
    (ROOMS_BY_MOB.get(Number(id)) || []).forEach(r => { if (cand.some(c => c.kind === 'room' && c.id === r.id)) return;
      const cnt = (r.monsters || []).filter(m => want.has(Number(m.id))).reduce((s, m) => s + (Number(m.count) || 1), 0);
      const row = ROWBY.get('room:' + r.id);
      cand.push({ kind: 'room', id: r.id, name: r._d + ': ' + r.name, at: P3(r.center), radius: R0(r.radius || 600), levels: r.levelRange || null, count: cnt, region: r._d, atlasKey: row ? row.key : null, status: row ? row.status : 'none', sec: row ? row.sec : 900, danger: Math.max(0, ...(r.monsters || []).filter(m => m.aggressive).map(m => m.level || 0)), reachable: true });
    });
  });
  if (!cand.length) {   // the quest record's spawn clusters (computed routes)
    mobIds.forEach(id => { const m = (q.monsters || []).find(x => Number(x.id) === Number(id)); (m && m.clusters || []).forEach(c => cand.push({ kind: 'cluster', id: m.id + '@' + c.at[0] + ',' + c.at[1], name: m.name + (c.place ? ' (' + c.place + ')' : ''), at: P3(c.at), radius: 1500, levels: [m.level, m.level], count: Number(c.count) || 1, region: c.place || '', atlasKey: null, status: 'none', sec: 900, danger: 0, reachable: true })); });
  }
  if (!cand.length) return null;
  cand.forEach(c => { c.score = -Math.min(c.count, 30) * 6 + (STATUS_RANK[c.status] == null ? 3 : STATUS_RANK[c.status]) * 25 + (c.sec || 600) / 60 + Math.max(0, (c.danger || 0) - ref - 8) * 4 + (c.reachable ? 0 : 60); });
  cand.sort((a, b) => a.score - b.score);
  const best = cand[0];
  return Object.assign({}, best, { alt: cand.slice(1, 4).map(c => ({ kind: c.kind, id: c.id, name: c.name, at: c.at, count: c.count, status: c.status })) });
}
function mobInfo(q, id) {
  const m = (q.monsters || []).find(x => Number(x.id) === Number(id)), n = NPCS[id] || {};
  return { id: Number(id), name: (m && m.name) || n.n || '#' + id, level: (m && m.level) || n.l || null, aggressive: !!(m && m.aggressive), raid: !!(m && m.raid), spawns: m ? Number(m.spawnCount) || 0 : 0, questSpawned: !!(m && m.spawnedByQuest) };
}
function itemName(q, id) { const it = (q.items || []).find(x => Number(x.id) === Number(id)); return it ? it.name : '#' + id; }

function buildQuest(q, prev) {
  const ov = (prev && prev.override) || null;
  const lvMin = q.level && q.level.min != null ? Number(q.level.min) : null;
  const reasons = [], restrictions = [], steps = [];
  const addR = (code, text, step) => { if (!reasons.some(r => r.code === code && r.step === step)) reasons.push(Object.assign({ code, text: text || REASON[code][1] }, step != null ? { step } : {})); };
  // not for bots
  if (q.special === 'TerritoryWarScripts' || /territory war quest/.test(JSON.stringify(q.parse || {}))) addR('territory-war');
  if (q.special === 'Dummy' || /dummy script/.test(JSON.stringify(q.parse || {}))) addR('dummy-script');
  const rq = q.requirements || {};
  if (rq.clan) addR('clan', 'clan quest' + (rq.clan.leader ? ' (clan leader only)' : ''));
  if ((q.transitions || []).some(t => t.trigger && t.trigger.type === 'olympiad')) addR('olympiad');
  // restrictions (info: the bot can do it with the right character)
  if (rq.races && rq.races.length) restrictions.push({ code: 'race-only', text: 'races: ' + rq.races.join('/') });
  if (rq.notRaces && rq.notRaces.length) restrictions.push({ code: 'race-only', text: 'not for ' + rq.notRaces.join('/') });
  if ((rq.classes && rq.classes.length) || (rq.categories && rq.categories.length)) restrictions.push({ code: 'class-only', text: 'classes: ' + [].concat(rq.classes || [], rq.categories || []).join('/') });
  if ((rq.quests || []).length) restrictions.push({ code: 'prereq-quest', text: rq.quests.map(x => x.id + ' ' + x.need).join(', ') });
  if ((rq.items || []).length) restrictions.push({ code: 'needs-item', text: rq.items.map(x => x.name || x.id).join(', ') });
  if (rq.subclass) restrictions.push({ code: 'subclass', text: 'subclass' });
  if (rq.noble) restrictions.push({ code: 'noble', text: 'noblesse' });
  if (lvMin == null) restrictions.push({ code: 'level-unknown', text: 'minimum level unknown' });
  if (q.type === 'unknown') restrictions.push({ code: 'type-unknown', text: 'quest type unknown' });
  // QMEMO-2026-10-27: 'memo-state' only when the engine cannot follow the memo (swarm.js qeMemoCheck, the same check as the dry run); a memo it can place
  // is walked by the memo-aware qeDecide and its whole flow is proven by the dry-run gate (docs/plan/tools/quest_dryrun.js) before 'ready'
  reasonsFromParse(q).forEach(c => { if (c === 'memo-state' && E.qeMemoCheck) { const mc = E.qeMemoCheck(q); if (mc.ok) return; addR(c, REASON[c][1] + (mc.why.length ? ': ' + mc.why.join('; ') : '')); return; } addR(c); });
  const monLv = (q.monsters || []).map(m => Number(m.level) || 0).filter(Boolean);
  const ref = Math.max(1, lvMin != null ? lvMin : (monLv.length ? Math.min(...monLv) - 3 : 1));
  // ---- the steps ----
  const st = E.qeStartTrans(q);
  const startNpcs = st.length && st[0].trigger && (st[0].trigger.npcs || []).length ? st[0].trigger.npcs.map(Number) : (q.startNpcs || []).map(n => Number(n.id));
  const title = (c) => { const s = (q.steps || []).find(x => Number(x.cond) === c); return s && s.title ? s.title : ''; };
  const pushTalk = (kind, cond, npcId, links, to, needs) => {
    const np = npcPlace(q, npcId);
    const s = { i: steps.length, key: 'c' + cond + ':' + kind + ':' + npcId, cond, kind, to: to === undefined ? null : to, links: (links || []).slice(0, 6), npc: np,
      text: (title(cond) || '') || (kind === 'start' ? 'Accept the quest at ' + np.name : kind === 'deliver' ? 'Bring ' + (needs || []).map(x => itemName(q, x.id) + (x.n > 1 ? ' x' + x.n : '')).join(', ') + ' to ' + np.name : 'Talk to ' + np.name) };
    if (needs && needs.length) s.needs = needs.map(x => ({ id: x.id, name: itemName(q, x.id), n: x.n }));
    s.reasons = [];
    if (np.why) s.reasons.push(np.why);
    if (np.at) s.travel = npcTravel(np.id, np.at, ref, np.name);
    s.expectedSec = (STEP_SEC[kind] || 25) + (s.travel ? Math.min(s.travel.sec || 0, 1800) : 0);
    steps.push(s); return s;
  };
  if (startNpcs.length) {
    const alt = st.length ? st : E.qeTr(q).filter(t => !(t.from && t.from.length) && t.trigger && t.trigger.type === 'event' && (t.trigger.npcs || []).some(n => startNpcs.includes(Number(n))));
    pushTalk('start', 0, startNpcs[0], E.qeLinksOf(alt), 1);
  } else addR('no-start-npc');
  const conds = [...new Set((q.steps || []).map(s => Number(s.cond)).filter(c => c >= 1))].sort((a, b) => a - b);
  const allMobIds = new Set();
  conds.forEach(c => {
    const T = E.qeTransAt(q, c).filter(t => !(t.to === 'end' && ((t.trigger && t.trigger.links) || []).some(E.qeIsQuit)));
    // engine view of this cond
    const need0 = E.qeNeeds(q, c, E.qeDefaultBatch(q));
    const haveAll = {}; need0.forEach(x => { haveAll[x.id] = x.n; }); T.forEach(t => E.qeNeedList(t).forEach(x => { haveAll[x.id] = Math.max(haveAll[x.id] || 0, x.n); }));
    const a0 = E.qeDecide(q, { started: true, cond: c, condKnown: true, have: {} }), a1 = E.qeDecide(q, { started: true, cond: c, condKnown: true, have: haveAll });
    // hunts: drops at this cond + kills at this cond
    const drops = E.qeDropsAt(q, c).filter(d => (d.conds || []).length || true);
    const kills = (q.kills || []).filter(k => (k.conds || []).includes(c));
    const mobs = []; drops.forEach(d => E.qeDropMobs(d).forEach(m => { if (!mobs.includes(m)) mobs.push(m); })); kills.forEach(k => (k.monsters || []).forEach(m => { if (!mobs.includes(Number(m))) mobs.push(Number(m)); }));
    const huntDrops = drops.filter(d => (d.conds || []).includes(c) || !(d.conds || []).length);
    if (mobs.length && (huntDrops.length || kills.length)) {
      const nat = mobs.filter(id => !E.qeSpawnOnly(q, id)), spawnOnly = mobs.filter(id => E.qeSpawnOnly(q, id));
      const items = need0.filter(x => x.drops.length).map(x => ({ id: x.id, name: itemName(q, x.id), n: x.n, from: [].concat(...x.drops.map(d => E.qeDropMobs(d).map(m => ({ id: m, name: mobInfo(q, m).name, chance: d.chanceByNpc && d.chanceByNpc[m] != null ? d.chanceByNpc[m] : d.chance })))).slice(0, 8) }));
      const killN = kills.reduce((s, k) => s + (Number(k.count) || 0), 0) || (kills.length ? 1 : 0);
      if (nat.length) {
        nat.forEach(m => allMobIds.add(m));
        const s = { i: steps.length, key: 'c' + c + ':hunt', cond: c, kind: 'hunt', to: (kills[0] && kills[0].to) != null ? kills[0].to : null, monsters: nat.map(id => mobInfo(q, id)), items, kills: killN || null, reasons: [] };
        s.text = title(c) || ('Hunt ' + s.monsters.map(m => m.name).slice(0, 3).join(', ') + (items.length ? ' for ' + items.map(i => i.name + ' x' + i.n).join(', ') : killN ? ' x' + killN : ''));
        // one hunting place per group of items with the same droppers (+ the kill monsters): the engine hunts the monsters of what is still missing
        const groups = [], gOf = (mobs2) => { const k = mobs2.slice().sort((x, y) => x - y).join(','); let g = groups.find(x => x.k === k); if (!g) { g = { k, mobs: mobs2.slice(), items: [] }; groups.push(g); } return g; };
        items.forEach(it => { const ms = [...new Set(it.from.map(f => Number(f.id)))].filter(id => nat.includes(id)); if (ms.length) gOf(ms).items.push(it.id); });
        { const km = [...new Set([].concat(...kills.map(k => (k.monsters || []).map(Number))))].filter(id => nat.includes(id)); if (km.length) gOf(km).kills = killN; }
        if (!groups.length) gOf(nat);
        s.places = groups.map(g => { const area = huntPlace(q, g.mobs, ref); const pl = { mobs: g.mobs, items: g.items, kills: g.kills || null, area };
          if (area) { pl.travel = placeTravel(area.atlasKey, area.at, ref, area.name); if (area.danger && area.danger - ref >= 10 && (area.aggrShare || 0) > 0) pl.danger = true;
            const ag = areaAggro(area, g.mobs, ref); if (ag.length >= 3) { pl.danger = true; pl.aggro = ag.slice(0, 6); }
            const lk = lookalikes(g.mobs, area); if (lk.length) { pl.lookalikes = lk; pl.note = lk.map(x => x.n + ' ' + x.name + ' ' + x.id + ' here are NOT the quest\'s monster (the script counts only ' + x.not + '): the bots leave them alone').join('; '); } } return pl; });
        s.area = (s.places[0] || {}).area || null; s.travel = (s.places[0] || {}).travel;
        if (s.places.some(p => !p.area)) s.reasons.push('no-hunt-place');
        if (s.places.some(p => p.danger)) s.reasons.push('area-danger');
        // the step's worst travel decides its route reason (every place is walked)
        s.places.forEach(p => { if (p.travel && (STATUS_RANK[p.travel.status] || 0) > (STATUS_RANK[(s.travel || {}).status] || 0)) s.travel = p.travel; });
        if (s.monsters.some(m => m.raid)) s.reasons.push('needs-party');
        // time: kills needed / spawns there; 25 s per kill (quest rates x1)
        const perKill = 25, needKills = Math.max(killN, ...items.map(it => { const ch = Math.max(1, Number((it.from[0] || {}).chance) || 50); return Math.ceil(it.n * 100 / ch); }), 1);
        s.expectedSec = Math.round(needKills * perKill + (s.travel ? Math.min(s.travel.sec || 0, 1800) : 0));
        steps.push(s);
      }
      if (spawnOnly.length) {
        const ha = E.qeHuntAction(q, spawnOnly, [], killN || 1, c, null);
        const s = { i: steps.length, key: 'c' + c + ':spawn:' + spawnOnly[0], cond: c, kind: 'spawn', monsters: spawnOnly.map(id => mobInfo(q, id)), items, kills: killN || 1, reasons: [], engine: ha.act === 'spawn' ? { how: ha.how, trigger: ha.how === 'kill' ? ha.triggerMobs : ha.npcs } : { manual: ha.why } };
        s.text = title(c) || ('Make ' + s.monsters.map(m => m.name).join(', ') + ' appear and kill it');
        // QINSTANCE-2026-10-27: a Kamaloka boss = the party leader's Kamaloka mission (swarm.js qeDoInstance): no blocking reason, a party-mode restriction
        if (ha.act === 'instance') { s.engine = { instance: ha.kind, level: ha.level }; s.text = title(c) || ('Kamaloka level ' + ha.level + ': kill ' + s.monsters.map(m => m.name).join(', ') + ' (party mode)'); if (!restrictions.some(r => r.code === 'party-instance')) restrictions.push({ code: 'party-instance', text: 'Kamaloka level ' + ha.level + ' boss: party mode (the leader runs the Kamaloka mission); one Hall a day on L2Toggle' }); else restrictions.find(r => r.code === 'party-instance').text += ' + level ' + ha.level; }
        else if (ha.act !== 'spawn') s.reasons.push((q.spawns || []).some(x => spawnOnly.includes(Number(x.npc)) && x.by && /^(timer|other)$/.test(x.by.type)) ? 'spawn-script' : 'mob-no-spawn');
        else {
          // QSPAWN-2026-10-27: the engine does the trigger (qeDoSpawn: kill / talk, hunt rounds until it appears, then the kill); the dry-run gate checks the
          // trigger spawns, the script's addSpawn and the levels before 'ready' -> no blocking reason, the step says it was not seen live yet
          if (items.length) s.engine = Object.assign({}, s.engine || {}, { spawnItems: true, liveCheck: 'quest-spawned monster drop: not yet seen live' });
          const at = ha.at ? P3(ha.at) : null;
          if (ha.how === 'kill') { s.area = huntPlace(q, ha.triggerMobs, ref); if (s.area) s.travel = placeTravel(s.area.atlasKey, s.area.at, ref, s.area.name); else s.reasons.push('no-hunt-place'); }
          else if ((ha.npcs || []).length) { const np = npcPlace(q, ha.npcs[0]); s.npc = np; if (np.at) s.travel = npcTravel(np.id, np.at, ref, np.name); else s.reasons.push(np.why || 'npc-no-spawn'); }
          if (at && !s.area) s.area = { kind: 'spawn', id: 'spawn', name: 'quest spawn', at, radius: 800, count: 1 };
        }
        if (s.monsters.some(m => m.raid)) s.reasons.push('needs-party');
        s.expectedSec = 300 + (s.travel ? Math.min(s.travel.sec || 0, 1800) : 0);
        steps.push(s);
      }
    }
    // talks: forward transitions at this cond
    // QGIVES-2026-10-27: a same-stage talk that gives / takes an item (Miner's Favor's four gifts, an exchange) is a step too (plan line + dialogue chain)
    const talks = T.filter(t => t.trigger && /^(talk|event|firstTalk)$/.test(t.trigger.type) && (t.to !== c || (t.gives || []).some(x => x && Number(x.id) && Number(x.id) !== 57) || (t.takes || []).some(x => x && Number(x.id) && Number(x.id) !== 57)));
    const seenNpc = new Set();
    talks.sort((a, b) => (b.to === 'end' ? 1000 : Number(b.to) || 0) - (a.to === 'end' ? 1000 : Number(a.to) || 0)).forEach(t => {
      const npcId = ((t.trigger && t.trigger.npcs) || [])[0]; if (!npcId || seenNpc.has(npcId)) return; seenNpc.add(npcId);
      const needs = E.qeNeedList(t);
      const s = pushTalk(needs.length ? 'deliver' : 'talk', c, npcId, E.qeLinksOf([t]), t.to, needs);
      needs.forEach(x => { const it = (q.items || []).find(i => Number(i.id) === x.id); const roles = (it && it.roles) || []; if (!roles.some(r => /given|drop|reward|counted/.test(r)) && !(q.drops || []).some(d => Number(d.item) === x.id)) s.reasons.push('item-from-elsewhere'); });
    });
    // other triggers at this cond (item use / skill / zone / timer / see)
    T.filter(t => t.trigger && !/^(talk|event|firstTalk|kill|attack)$/.test(t.trigger.type)).forEach(t => {
      if (steps.some(s => s.key === 'c' + c + ':special')) return;
      steps.push({ i: steps.length, key: 'c' + c + ':special', cond: c, kind: 'special', text: title(c) || ('script trigger "' + t.trigger.type + '"'), trigger: t.trigger.type, reasons: [t.trigger.type === 'timer' ? 'timer' : 'engine-manual'], expectedSec: 60 });
    });
    // the engine at this cond: manual = a gap
    [a0, a1].forEach(a => { if (a.act === 'manual') { const cs = steps.filter(s => s.cond === c); const tgt = cs[cs.length - 1]; if (tgt) { if (!tgt.reasons.includes('engine-manual')) tgt.reasons.push('engine-manual'); tgt.engineWhy = a.why; } else steps.push({ i: steps.length, key: 'c' + c + ':manual', cond: c, kind: 'special', text: title(c) || 'step ' + c, reasons: ['engine-manual'], engineWhy: a.why, expectedSec: 60 }); } });
    steps.filter(s => s.cond === c).forEach(s => { s.engine = s.engine || { act: a0.act, hasItems: a1.act }; });
  });
  // TURN-IN STEP (2026-10-27, verifier finding 6): a repeatable / endless quest hands its batch in at the turn-in NPC (qeDecide act 'turnin');
  // qePlanMatch needs a non-start step with that NPC, else the live line shows no plan step and the plan route is not used.
  { const ti = E.qeTurnIn(q), tn = ti && ti.trigger && (ti.trigger.npcs || [])[0];
    if (tn && !steps.some(s => s.kind !== 'start' && s.npc && Number(s.npc.id) === Number(tn))) {
      const tc = (ti.from || []).length ? ti.from.map(Number) : [...new Set(steps.filter(s => s.kind === 'hunt' || s.kind === 'spawn').map(s => s.cond))];
      const needs = (ti.takes || []).filter(x => x && x.id && Number(x.id) !== 57).map(x => ({ id: Number(x.id), n: Math.min(E.qeDefaultBatch(q), Number(x.count) > 0 ? Number(x.count) : E.qeDefaultBatch(q)) }));
      const s = pushTalk('deliver', tc[0] || 1, tn, E.qeLinksOf([ti]), tc[0] || 1, needs);
      s.key = 'c' + (tc[0] || 1) + ':turnin:' + tn; s.turnin = true;
      s.text = 'Hand in ' + (needs.length ? needs.map(x => itemName(q, x.id)).join(', ') : 'the batch') + ' at ' + s.npc.name + ' (repeatable: then hunt again)';
      s.turninConds = tc.length ? tc : [1];
    } }
  // the same step offered at several conds (transitions without 'from', branch quests): listed once, with every cond it belongs to
  { const seen = new Map(), out = [];
    steps.forEach(s => { const sig = [s.kind, s.npc ? s.npc.id : '', (s.needs || []).map(x => x.id + 'x' + x.n).join('+'), (s.monsters || []).map(m => m.id).join('+'), (s.items || []).map(x => x.id).join('+'), s.trigger || '', s.kind === 'hunt' || s.kind === 'spawn' ? '' : String(s.to)].join('|');   // LIVETEST-2026-10-27 (174): a talk that leads to another stage (the final hand-in) is a step of its own, never merged into an earlier talk at that NPC
      s.conds = [s.cond];
      if (s.kind !== 'start' && seen.has(sig)) { const o = seen.get(sig); if (!o.conds.includes(s.cond)) o.conds.push(s.cond); (s.reasons || []).forEach(r => { if (!o.reasons.includes(r)) o.reasons.push(r); }); return; }
      seen.set(sig, s); out.push(s); });
    steps.length = 0; steps.push(...out);
    steps.forEach(s => { if (s.turnin) { s.conds = [...new Set(s.turninConds)]; delete s.turninConds; } }); }
  // step-level travel reasons
  const ROUTE_CODES = ['no-route', 'route-pending', 'route-blocked', 'route-conditional', 'route-unverified', 'route-swim', 'aggro-on-way'];
  const travelReasons = (s) => {
    const t = s.travel; if (!t) return;
    if (t.status === 'unreachable') s.reasons.push('no-route');
    else if (t.status === 'pending') s.reasons.push('route-pending');
    else if (t.status === 'blocked') s.reasons.push('route-blocked');
    else if (t.status === 'conditional') s.reasons.push('route-conditional');
    else if (t.status === 'unverified') s.reasons.push('route-unverified');
    if (t.checks && t.checks.water && t.checks.water.overBreath) s.reasons.push('route-swim');
    if (t.checks && (t.checks.aggro || []).some(a => a.lv >= ref + 6)) s.reasons.push('aggro-on-way');
    // DANGER ON EVERY WALK (2026-10-27, verifier finding 3): every hunting place of the step is walked, not only the worst-status one
    (s.places || []).forEach(p => { const pt = p.travel; if (pt && pt !== t && pt.checks && (pt.checks.aggro || []).some(a => a.lv >= ref + 6)) s.reasons.push('aggro-on-way'); });
  };
  steps.forEach(travelReasons);
  if ((q.timers || []).some(t => t.by === 'timer')) addR('timer', 'the quest script runs timers (' + q.timers.slice(0, 2).map(t => t.name).join(', ') + ')');
  if ((q.spawns || []).some(x => x.by && x.by.type === 'timer')) addR('spawn-script', 'quest monsters / NPCs spawned by a timer');
  // ---- overrides (the dashboard / phase-2 fixers): they win ----
  const ovs = (ov && ov.steps) || {};
  steps.forEach(s => {
    // LIVETEST-2026-10-27: a final hand-in split off an earlier talk at the same NPC (174), or a step whose key moved (QFROM: c1 -> c2), keeps that NPC step's override (the way to that NPC)
    let o = ovs[s.key];
    // (also an orphaned override whose step key moved: an override is never lost, R3)
    if (!o && s.npc && s.kind !== 'start') { const k = Object.keys(ovs).find(k2 => { const m = /^c\d+:(talk|deliver|turnin):(\d+)$/.exec(k2); return m && Number(m[2]) === Number(s.npc.id) && k2 !== s.key && !!ovs[k2]; }); if (k) { o = ovs[k]; s.overrideFrom = k; } }
    if (!o) return;
    s.override = o;
    const fixed = [];
    if (Array.isArray(o.npcAt) && o.npcAt.length >= 2 && s.npc) { s.npc.at = P3(o.npcAt); ['npc-no-spawn', 'npc-quest-spawned', 'npc-instance'].forEach(c => fixed.push(c)); }
    if (o.area && Array.isArray(o.area.at)) { s.area = Object.assign({ kind: 'override', id: 'override', name: o.area.name || 'your hunting place', radius: R0(o.area.radius) || 1500, count: 0 }, s.area ? { alt: [{ kind: s.area.kind, id: s.area.id, name: s.area.name, at: s.area.at }] } : {}, { at: P3(o.area.at), radius: R0(o.area.radius) || 1500 }); fixed.push('no-hunt-place', 'area-danger'); }
    // QUESTPLAN fix 2026-10-27: your own NPC / hunting place gets its own route (computed like any other place) and its own route checks
    if ((Array.isArray(o.npcAt) && o.npcAt.length >= 2 && s.npc) || (o.area && Array.isArray(o.area.at))) {
      s.travel = o.area && Array.isArray(o.area.at) ? placeTravel(null, s.area.at, ref, s.area.name) : npcTravel(s.npc.id, s.npc.at, ref, s.npc.name);
      s.reasons = s.reasons.filter(c => !ROUTE_CODES.includes(c)); travelReasons(s);
      if (s.places && s.places.length && o.area) s.places = [Object.assign({}, s.places[0], { area: s.area, travel: s.travel })].concat(s.places.slice(1));
    }
    if (Array.isArray(o.route) && o.route.length >= 2) {
      // an override route fixes the route reasons of the plan's own travel, but its OWN walk is checked for aggressive monsters 6+ above (2026-10-27)
      const ag = aggroOn(o.route.map(P3), ref);
      fixed.push('no-route', 'route-pending', 'route-blocked', 'route-conditional', 'route-unverified', 'route-swim'); if (!ag.length) fixed.push('aggro-on-way'); else s.reasons.push('aggro-on-way');
      s.travelOverride = { src: 'override', start: o.start || null, points: o.route.map(P3), pv: thin(o.route.map(P3), 50), length: plen(o.route.map(P3)), checks: { aggro: ag } }; }
    if (o.fixed && Array.isArray(o.fixed)) o.fixed.forEach(c => fixed.push(c));   // a fixer says the reason is handled (e.g. engine-manual after an engine change)
    s.fixedByOverride = s.reasons.filter(c => fixed.includes(c));
    s.reasons = s.reasons.filter(c => !fixed.includes(c));
    if (o.manual) s.reasons.push('owner-manual');
  });
  if (ov && ov.skip) addR('owner-skip', 'skipped on the dashboard' + (ov.note ? ': ' + ov.note : ''));
  if (ov && ov.manual) addR('owner-manual');
  if (ov && Array.isArray(ov.fixed)) for (let i = reasons.length - 1; i >= 0; i--) if (ov.fixed.includes(reasons[i].code)) reasons.splice(i, 1);
  // ---- status ----
  steps.forEach(s => { s.reasons = [...new Set(s.reasons)]; s.reasons.forEach(c => addR(c, REASON[c] ? REASON[c][1] : c, s.i)); });
  const codes = [...new Set(reasons.map(r => r.code))];
  const status = codes.some(c => REASON[c] && REASON[c][0] === 'not-for-bots') ? 'not-for-bots' : codes.length ? 'fixable' : 'ready';
  const st0 = steps[0] && steps[0].npc;
  const region = (st0 && (st0.town || '')) || (steps.find(s => s.area) || {}).area && (steps.find(s => s.area).area.region || '') || '';
  const plan = { id: q.id, name: q.name, version: VERSION, generated: new Date().toISOString(), tool: 'docs/plan/tools/quest_plan_build.js', level: q.level || null, type: q.type, region,
    requirements: rq, restrictions, status, reasons, expectedMin: Math.round(steps.reduce((s, x) => s + (x.expectedSec || 0), 0) / 60), refLevel: ref,
    steps: steps.map((s, i) => Object.assign(s, { i })), override: ov || { steps: {} } };
  if (prev && prev.manual) plan.manual = prev.manual;
  if (prev && prev.edited) plan.edited = prev.edited;
  return plan;
}

// ---- run ----
const files = fs.readdirSync(QDIR).filter(f => /^\d+\.json$/.test(f)).map(f => Number(f.slice(0, -5))).sort((a, b) => a - b);
const t0 = Date.now(); let n = 0;
const statusRows = {};
for (const id of files) {
  const pf = path.join(PDIR, id + '.json');
  if (ONLY && !ONLY.has(id)) { const p = tryJ(pf, null); if (p) statusRows[id] = { n: p.name, status: p.status, reasons: [...new Set((p.reasons || []).map(r => r.code))], region: p.region, level: p.level && p.level.min, steps: (p.steps || []).length, expectedMin: p.expectedMin }; continue; }
  const q = tryJ(path.join(QDIR, id + '.json'), null); if (!q) continue;
  const prev = tryJ(pf, null);
  let plan;
  try { plan = buildQuest(q, prev); } catch (e) { console.log(`quest ${id}: planner error ${e.stack}`); continue; }
  if (!has('--dry')) mg.writeGuarded(pf, plan, 'questplan', { indent: 1, quiet: true, who: 'quest_plan_build.js' });
  if (!has('--dry') && GATE && plan.status === 'ready') { try { plan = readyGate(plan, pf); } catch (e) { plan.status = 'fixable'; plan.reasons.push({ code: 'dryrun-fail', text: 'dry run error: ' + e.message }); } mg.writeGuarded(pf, plan, 'questplan', { indent: 1, quiet: true, who: 'quest_plan_build.js (ready gate)' }); }
  statusRows[id] = { n: plan.name, status: plan.status, reasons: [...new Set(plan.reasons.map(r => r.code))], region: plan.region, level: plan.level && plan.level.min, steps: plan.steps.length, expectedMin: plan.expectedMin,
    restrictions: [...new Set(plan.restrictions.map(r => r.code))] };
  if (++n % 50 === 0) progress({ phase: 'plans', done: n, total: ONLY ? ONLY.size : files.length, sec: Math.round((Date.now() - t0) / 1000) });
}
if (has('--write-jobs')) atomic(JOBS, JSON.stringify({ generated: new Date().toISOString(), jobs: [...JOBLIST.values()] }));
console.log(`quest_plan_build: ${n} plans written (${Math.round((Date.now() - t0) / 1000)} s), ${JOBLIST.size} geodata legs ${has('--write-jobs') ? 'queued' : 'still missing'}`);
progress({ phase: 'plans done', done: n, legsPending: JOBLIST.size });
if (process.env.SWARM_QUESTPLAN_NOREPORT) process.exit(0);
// ---- status + reports ----
const counts = { ready: 0, fixable: 0, 'not-for-bots': 0 }, byReason = {}, byRestriction = {}, nfb = {};
Object.values(statusRows).forEach(r => { counts[r.status] = (counts[r.status] || 0) + 1; (r.reasons || []).forEach(c => { if (r.status === 'not-for-bots') { if (REASON[c] && REASON[c][0] === 'not-for-bots') nfb[c] = (nfb[c] || 0) + 1; return; } byReason[c] = (byReason[c] || 0) + 1; }); (r.restrictions || []).forEach(c => { byRestriction[c] = (byRestriction[c] || 0) + 1; }); });
const SJ = { generated: new Date().toISOString(), tool: 'docs/plan/tools/quest_plan_build.js', total: Object.keys(statusRows).length, counts, byReason, notForBots: nfb, restrictions: byRestriction, legsPending: JOBLIST.size,
  reasonText: Object.fromEntries(Object.entries(REASON).map(([k, v]) => [k, { status: v[0], text: v[1] }])), quests: statusRows };
atomic(path.join(DATA, 'quest_status.json'), JSON.stringify(SJ, null, 1));
// docs/plan/quest_status.md
const L = [];
L.push('# Quest plans: status of every quest (generated)', '', `Generated ${SJ.generated} by \`node docs/plan/tools/quest_plan_build.js\` (do not edit by hand: the next run rewrites it).`, '',
  'Every quest has a plan `Scripts/data/quest_plans/<id>.json` (format: docs/requirements/quests.md). **ready** = every step resolved (NPC place, hunting place, route with walls / water / danger checked, the engine has an action) **and the independent dry run passes** (docs/plan/tools/quest_dryrun.js: script vs data, engine flow, override fields, geodata, aggressive monsters 6+ on every walk; `dryrun:<code>` reasons otherwise); **fixable** = at least one reason below; **not-for-bots** = PvP / territory war / clan / placeholder scripts / skipped by the owner.', '',
  `| status | quests |`, `|---|---|`, ...Object.entries(counts).map(([k, v]) => `| ${k} | ${v} |`), `| total | ${SJ.total} |`, '',
  `Geodata legs still to search: ${JOBLIST.size}${JOBLIST.size ? ' (run the tool again; they count as `route-pending`)' : ''}.`, '',
  '## Fixable: reasons (a quest can have several)', '', '| code | quests | meaning |', '|---|---|---|',
  ...Object.entries(byReason).sort((a, b) => b[1] - a[1]).map(([k, v]) => `| \`${k}\` | ${v} | ${REASON[k] ? REASON[k][1] : k} |`), '',
  '## Not for bots', '', '| code | quests | meaning |', '|---|---|---|', ...Object.entries(nfb).sort((a, b) => b[1] - a[1]).map(([k, v]) => `| \`${k}\` | ${v} | ${REASON[k] ? REASON[k][1] : k} |`), '',
  '## Restrictions (information, not a blocker: the right character can run it)', '', '| code | quests |', '|---|---|', ...Object.entries(byRestriction).sort((a, b) => b[1] - a[1]).map(([k, v]) => `| \`${k}\` | ${v} |`), '',
  '## Every quest', '', '| id | quest | level | region | status | reasons | steps | ~min |', '|---|---|---|---|---|---|---|---|',
  ...Object.entries(statusRows).sort((a, b) => Number(a[0]) - Number(b[0])).map(([id, r]) => `| ${id} | ${String(r.n).replace(/\|/g, '/')} | ${r.level == null ? '?' : r.level} | ${String(r.region || '').replace(/\|/g, '/')} | ${r.status} | ${(r.reasons || []).join(', ')} | ${r.steps} | ${r.expectedMin} |`));
atomic(path.join(ROOT, 'docs', 'plan', 'quest_status.md'), L.join('\n') + '\n');
console.log(`quest_plan_build: status ${JSON.stringify(counts)}; reasons ${JSON.stringify(byReason)}`);
