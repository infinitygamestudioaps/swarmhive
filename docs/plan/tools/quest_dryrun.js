// QUEST DRY RUN (independent verifier, 2026-10-27; owner: "verify that all of this works").
// For every quest plan labelled `ready` (Scripts/data/quest_status.json) this walks the plan step by step with a VIRTUAL CHARACTER at the quest's
// minimum level and checks it against data the plan builder did not write:
//   1 START   the start NPC spawns (spawns_h5.json) at the plan's place, the npc atlas knows it, the route's town / gatekeeper link is on a LIVE gatekeeper
//             menu (Scripts/data/gk_live), level / race / class of the plan = the datapack Java (MIN_LVL, Race.X, ClassId / category checks).
//   2 STEPS   the Java script (L2J High Five datapack source, --src dir): every NPC / monster / item id of the plan is in the script, every setCond
//             stage of the script has a plan step, every dialog event exists and its case block sets the transition's cond, hunt counts are in the
//             script, drop chances are compared (warn); the hunted monsters spawn in the chosen area (spawns_h5.json); then a FLOW SIMULATION runs the
//             real engine decision (swarm.js QENGINE-PURE qeDecide + the staged QUESTPLAN qePlanMatch / qePlanSpot) against a server model built from
//             the quest's transitions until the quest ends (no manual step, no loop, every action has a plan step / a hunt spot).
//   3 ROUTES  every stored route (plan computed points, else the nav atlas route file) on the GEODATA: each leg straight-walkable (geopath.legOk:
//             walls block, water = swim), a leg that is not gets a short path search (detour ok, else FAIL), "field-areas-gap" legs (only 2 points
//             stored) get a full geodata search, swims longer than one breath, the route ends at the NPC / area, aggressive monsters
//             (npcs_h5.json aggro range) 6+ levels above the character along the walked path; the hunting area: targets / aggressive mobs vs level.
//   4 ENGINE  every action kind the simulation produced can run in the current engine (talk links / events, qeHuntSpot) and with the staged edits.
// Read-only: writes only the report (--md, default docs/plan/quest_verify.md) and a JSON (--json, optional).
// Geodata work holds the shared lock directory Logs/quest_build.lock (mkdir; retry every 30 s; removed after). Runs at BelowNormal priority.
// Run: node docs/plan/tools/quest_dryrun.js --src <dir with <id>.java> [--only 1,2] [--no-geo] [--json out.json] [--md out.md] [--edits <staged edits .md>]
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
try { os.setPriority(process.pid, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch (e) { }
const ROOT = path.resolve(__dirname, '..', '..', '..'), DATA = path.join(ROOT, 'Scripts', 'data'), LOGS = path.join(ROOT, 'Logs');
const ARG = process.argv.slice(2), has = (f) => ARG.includes(f), argv = (f, d) => { const i = ARG.indexOf(f); return i >= 0 && ARG[i + 1] ? ARG[i + 1] : d; };
const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, ''));
const tryJ = (f, d) => { try { return J(f); } catch (e) { return d; } };
let SRC_DIR = argv('--src', process.env.QUEST_JAVA_DIR || '');
const EDITS = argv('--edits', process.env.QUESTPLAN_EDITS || '');
const ONLY = argv('--only', '') ? new Set(argv('--only', '').split(',').map(String)) : null;
let NOGEO_RT = has('--no-geo');
const MDOUT = argv('--md', path.join(ROOT, 'docs', 'plan', 'quest_verify.md')), JSONOUT = argv('--json', '');
const LOCK = path.join(LOGS, 'quest_build.lock');
const FREE_MIN_MB = 2048;
const sleepSync = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const freeMB = () => Math.round(os.freemem() / 1048576);

// ------------------------------------------------------------------------------------------------ the engine (current + staged)
const SWARM = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
const pa = SWARM.indexOf('// QENGINE-PURE-BEGIN'), pb = SWARM.indexOf('// QENGINE-PURE-END');
let staged = '', stagedFrom = 'none';
if (!/function qePlanMatch\(/.test(SWARM.slice(pa, pb))) {
  try { const md = fs.readFileSync(EDITS, 'utf8'); const m = md.match(/## E1[\s\S]*?```js\r?\n([\s\S]*?)```/); if (m) { staged = m[1]; stagedFrom = EDITS; } } catch (e) { }
} else stagedFrom = 'swarm.js (applied)';
const E = new Function(SWARM.slice(pa, pb) + '\n' + staged + '\nreturn { qeDecide, qeStartTrans, qeTransAt, qeNeedList, qeNeedMet, qeDropsAt, qeDropMobs, qeSpawnOnly, qeHuntAction, qeLinksOf, qeIsQuit, qeTr, qeNeeds, qeDefaultBatch, qeRepeatable, qeTurnIn, qeEligible, qeHuntSpot, qePlanMatch: typeof qePlanMatch === "function" ? qePlanMatch : null, qePlanSpot: typeof qePlanSpot === "function" ? qePlanSpot : null, qePlanRoute: typeof qePlanRoute === "function" ? qePlanRoute : null };')();
const QE_HUNT_MAX_MIN = (() => { const m = SWARM.match(/huntMaxMs:\s*(\d+)\s*\*\s*60000/); return m ? Number(m[1]) : 45; })();
const QE_SAME_MAX = (() => { const m = SWARM.match(/sameKeyMax:\s*(\d+)/); return m ? Number(m[1]) : 4; })();

// ------------------------------------------------------------------------------------------------ data
const STATUS = J(path.join(DATA, 'quest_status.json'));
const NPCS = J(path.join(DATA, 'npcs_h5.json'));
// + the datapack spawn XML lists (Scripts/data/spawns_xml_h5.json from docs/plan/tools/spawn_xml_h5.js: Turek Orcs 171 / 327 / 422, Sel Mahums)
const SPAWNS = J(path.join(DATA, 'spawns_h5.json')).concat(tryJ(path.join(DATA, 'spawns_npc_h5.json'), []), tryJ(path.join(DATA, 'spawns_xml_h5.json'), []));
const SPID = new Map(); SPAWNS.forEach(s => { if (!SPID.has(s.id)) SPID.set(s.id, []); SPID.get(s.id).push(s); });
const ATLASNPC = new Map(); (tryJ(path.join(DATA, 'npc_atlas.json'), { npcs: [] }).npcs || []).forEach(n => { if (!ATLASNPC.has(n.id)) ATLASNPC.set(n.id, []); ATLASNPC.get(n.id).push(n); });
const GKLIVE = []; try { fs.readdirSync(path.join(DATA, 'gk_live')).filter(f => /\.json$/.test(f) && f[0] !== '_').forEach(f => { const g = tryJ(path.join(DATA, 'gk_live', f), null); if (g) GKLIVE.push(g); }); } catch (e) { }
const norm = (t) => String(t || '').toLowerCase().replace(/<[^>]*>/g, ' ').replace(/&#?\w+;/g, ' ').replace(/['’]s\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim();   // "Antharas's Lair" = "Antharas Lair"
const ATL = path.join(DATA, 'nav_atlas'), fileKey = (key) => key.replace(/[^A-Za-z0-9@,._-]+/g, '_') + '.json';
const atlasRoute = (key) => tryJ(path.join(ATL, 't', fileKey(key)), null);
// aggressive spawns (independent of aggro_h5.json: npcs_h5 'ag' = aggro range)
const AGR = new Map(), AGS = 4096;
// aggressive = aggro_h5.json (the AGGRESSIVE monsters by name, as the bots and the builder use it; npcs_h5 'ag' is only the RANGE and is set for
// passive monsters too: CLAUDE.md 'Out of aggro range'); a missing file falls back to 'ag'
const AGGRO_NAMES = tryJ(path.join(DATA, 'aggro_h5.json'), null);
SPAWNS.forEach(s => { const n = NPCS[s.id]; if (!n || !(n.ag > 0) || !n.l || !/Monster|RaidBoss|Grand/i.test(n.ty || 'L2Monster')) return; if (AGGRO_NAMES && !AGGRO_NAMES[n.n] && !AGGRO_NAMES[s.name]) return; const k = Math.floor(s.x / AGS) + ',' + Math.floor(s.y / AGS); if (!AGR.has(k)) AGR.set(k, []); AGR.get(k).push({ x: s.x, y: s.y, z: s.z, lv: n.l, r: n.ag, name: n.n || s.name, id: s.id }); });
function aggroNear(pts, minLv, step) {
  const hit = new Map();
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / (step || 150)));
    for (let k = (i ? (L > 4000 ? n : 1) : 0); k <= n; k++) {   // > 4000 between two points = a teleport between segments: only the landing
      const x = a[0] + (b[0] - a[0]) * k / n, y = a[1] + (b[1] - a[1]) * k / n, z = a[2] + (b[2] - a[2]) * k / n;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) (AGR.get((Math.floor(x / AGS) + dx) + ',' + (Math.floor(y / AGS) + dy)) || []).forEach(m => {
        if (m.lv < minLv || Math.abs(m.z - z) > 400 || Math.hypot(m.x - x, m.y - y) > m.r + 100) return;
        if (!hit.has(m.name)) hit.set(m.name, { name: m.name, lv: m.lv, s: new Set() }); hit.get(m.name).s.add(m.x + ',' + m.y);
      });
    }
  }
  return [...hit.values()].map(h => ({ name: h.name, lv: h.lv, n: h.s.size })).sort((p, q) => q.lv - p.lv || q.n - p.n);
}
const P3 = (p) => Array.isArray(p) ? [Number(p[0]), Number(p[1]), Number(p[2]) || 0] : [Number(p.x), Number(p.y), Number(p.z) || 0];
const flat2pts = (f) => { const o = []; for (let i = 0; i + 2 < (f || []).length; i += 3) o.push([f[i], f[i + 1], f[i + 2]]); return o; };
const d2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// ------------------------------------------------------------------------------------------------ the Java script facts
function javaFacts(src) {
  const code = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
  const nums = new Set(); (code.match(/(?<![\w.])\d+(?:\.\d+)?(?:[LlDdFf])?(?![\w.])/g) || []).forEach(t => nums.add(Number(t.replace(/[LlDdFf]$/, ''))));
  const strings = new Set(); (code.match(/"(?:[^"\\]|\\.)*"/g) || []).forEach(t => strings.add(t.slice(1, -1)));
  const consts = {}; let m; const re = /static\s+final\s+([^=;(){}]+?)\s+(\w+)\s*=\s*([^;]*);/g;
  while ((m = re.exec(code))) consts[m[2]] = { type: m[1].trim(), expr: m[3], nums: (m[3].match(/(?<![\w.])\d+(?:\.\d+)?(?![\w.])/g) || []).map(Number) };
  const setConds = new Set(); (code.match(/setCond\(\s*(\d+)/g) || []).forEach(t => setConds.add(Number(t.match(/(\d+)/)[1])));
  const condRuntime = /setCond\(\s*(?!\d)[^)]/.test(code);
  const starts = /startQuest\(|setState\(State\.STARTED\)/.test(code);
  // level
  const lv = { min: [], max: [] };
  // MIN_LVL / MIN_LEVEL constants (not MAX_LEVEL_FOR_EXP_SP style reward limits); without one: getLevel() checks of the start (CREATED) branch
  Object.entries(consts).forEach(([k, v]) => { if (/EXP|_SP\b|REWARD|BONUS|SHOT|ITEM/.test(k)) return; if (/^MIN_?(LVL|LEVEL)$/.test(k) && v.nums.length === 1) lv.min.push(v.nums[0]); if (/^MAX_?(LVL|LEVEL)$/.test(k) && v.nums.length === 1) lv.max.push(v.nums[0]); });
  const constVal = (t) => /^\d+$/.test(t) ? Number(t) : consts[t] && consts[t].nums.length === 1 ? consts[t].nums[0] : null;
  const races = [...new Set((code.match(/Race\.(HUMAN|ELF|DARK_ELF|ORC|DWARF|KAMAEL)/g) || []).map(t => t.slice(5)))];
  // isMageClass() is a reward choice in H5 scripts (staff / sword), not a start rule
  const classChecks = [...new Set((code.match(/ClassId\.\w+|isInCategory\(\s*CategoryType\.\w+|getClassId\(\)\.(level|getId|isMage)\(\)|getClassLevel\(\)|isSubClassActive\(\)|isNoble\(\)/g) || []))];
  const prereq = [...new Set((code.match(/Q(\d{5})_\w+/g) || []).map(t => Number(t.slice(1, 6))))];
  // method bodies
  const body = (name) => { const i = code.search(new RegExp('\\b' + name + '\\s*\\([^)]*\\)\\s*\\{')); if (i < 0) return ''; let j = code.indexOf('{', i), d = 0, k = j; for (; k < code.length; k++) { if (code[k] === '{') d++; else if (code[k] === '}') { d--; if (!d) break; } } return code.slice(j, k + 1); };
  const created = (() => { const t = body('onTalk'); const i = t.search(/(State\.)?CREATED\b/); if (i < 0) return ''; const r = t.slice(i); const e = r.slice(8).search(/case\s+(State\.)?(STARTED|COMPLETED)\b/); return e >= 0 ? r.slice(0, e + 8) : r.slice(0, 2500); })();
  if (!lv.min.length) (created.match(/getLevel\(\)\s*(>=|<)\s*(\w+)/g) || []).forEach(t => { const x = t.match(/getLevel\(\)\s*(>=|<)\s*(\w+)/), v = constVal(x[2]); if (v != null) lv.min.push(v); });
  if (!lv.max.length) (created.match(/getLevel\(\)\s*(>|<=)\s*(\w+)/g) || []).forEach(t => { const x = t.match(/getLevel\(\)\s*(>|<=)\s*(\w+)/), v = constVal(x[2]); if (v != null) lv.max.push(v); });
  return { code, nums, strings, consts, setConds, condRuntime, starts, lv, races, classChecks, prereq, onKill: body('onKill'), onTalk: body('onTalk'), onAdv: body('onAdvEvent'), created, constVal };
}
function eventBlock(F, ev) {
  const lit = '"' + ev + '"'; let out = [];
  let i = F.code.indexOf(lit);
  while (i >= 0) { const r = F.code.slice(i, i + 1800); const e = r.slice(lit.length).search(/case\s+"|\bdefault\s*:|equals\("/); out.push(e >= 0 ? r.slice(0, e + lit.length) : r); i = F.code.indexOf(lit, i + 1); }
  return out;
}

// ------------------------------------------------------------------------------------------------ geodata (lazy, under the shared lock)
let GEO = null, GF = null, WATER = null, lockHeld = false;
let lockByCaller = false;   // quest_plan_build.js holds Logs/quest_build.lock itself and calls verify() (module mode)
function lockTake() {
  if (lockHeld || lockByCaller) return;
  for (let w = 0; ; w++) {
    try { fs.mkdirSync(LOCK); fs.writeFileSync(path.join(LOCK, 'owner.txt'), 'quest_dryrun.js pid ' + process.pid + ' ' + new Date().toISOString()); lockHeld = true; return; }
    catch (e) { if (e.code !== 'EEXIST') throw e; if (w % 4 === 0) console.log(`quest_dryrun: ${LOCK} is held (${(() => { try { return fs.readFileSync(path.join(LOCK, 'owner.txt'), 'utf8'); } catch (e2) { return '?'; } })()}) — waiting`); sleepSync(30000); }
  }
}
function lockFree() { if (!lockHeld) return; try { fs.rmSync(LOCK, { recursive: true, force: true }); } catch (e) { } lockHeld = false; }
process.on('exit', lockFree); process.on('SIGINT', () => { lockFree(); process.exit(130); });
function geoLoad() { if (GEO) return; lockTake(); GEO = require('./geopath'); GF = require('./geopath_fast'); WATER = require('./water_zones'); }
function memGate() { for (let w = 0; freeMB() < FREE_MIN_MB; w++) { if (w === 0) console.log(`quest_dryrun: free RAM ${freeMB()} MB < ${FREE_MIN_MB} — pausing`); if (w > 40) throw new Error('free RAM stayed below 2 GB'); sleepSync(15000); } }
const ROUTE_CACHE = new Map();
/** geodata check of a walk (points [[x,y,z]], gaps = index pairs that are unstored 'field-areas-gap' legs) -> { ok, fails[], warns[], walked[[x,y,z]] } */
function geoWalk(pts, gapIdx) {
  const sig = pts.map(p => p.map(Math.round).join(',')).join(';') + '|' + [...gapIdx].join(',');
  if (ROUTE_CACHE.has(sig)) return ROUTE_CACHE.get(sig);
  geoLoad(); memGate();
  const fails = [], warns = [], walked = [pts[0]];
  let swimRun = 0, maxSwim = 0, detours = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = { x: pts[i - 1][0], y: pts[i - 1][1], z: pts[i - 1][2] }, b = { x: pts[i][0], y: pts[i][1], z: pts[i][2] }, L = Math.hypot(b.x - a.x, b.y - a.y);
    if (L < 64) { walked.push(pts[i]); continue; }   // a step of a few cells: snap / layer noise, the walker steps it
    const inW = (p) => { try { return !!WATER.zoneAt(p.x, p.y, p.z); } catch (e) { return false; } };
    if (inW(a) && inW(b)) { swimRun += L; maxSwim = Math.max(maxSwim, swimRun); } else swimRun = 0;
    if (gapIdx.has(i)) {   // only 2 points stored: the bot's walkTo must find the way
      const r = GF.findPath(a, b, { maxMs: 30000, maxNodes: 6e6, pad: 3000 });
      if (!r.ok) {   // only "not on walkable geodata" is a proof; a search that gave up / ran out of its box is inconclusive
        (/not on walkable/.test(r.reason) ? fails : warns).push(`gap leg ${Math.round(L)} long (${a.x},${a.y} -> ${b.x},${b.y}): ${/not on walkable/.test(r.reason) ? 'no geodata walk' : 'geodata search inconclusive'}: ${r.reason}`); walked.push(pts[i]); continue; }
      if (r.swimUnits && r.maxSwimRun > 2800) fails.push(`gap leg swims ${r.maxSwimRun} in one go (one breath ~2800)`);
      if (r.lengthUnits > L * 2.5 + 2000) warns.push(`gap leg real walk ${r.lengthUnits} for ${Math.round(L)} straight`);
      r.points.forEach(p => walked.push([p.x, p.y, p.z])); continue;
    }
    let ok = false; try { ok = GEO.legOk(a, b); } catch (e) { ok = false; }
    if (!ok) {
      const r = GF.findPath(a, b, { maxMs: 8000, maxNodes: 4e5, pad: 1200 });
      if (r.ok && r.lengthUnits <= Math.max(L * 3, L + 1500)) { detours++; r.points.forEach(p => walked.push([p.x, p.y, p.z])); continue; }
      fails.push(`leg ${i} (${Math.round(a.x)},${Math.round(a.y)},${Math.round(a.z)} -> ${Math.round(b.x)},${Math.round(b.y)},${Math.round(b.z)}, ${Math.round(L)}) blocked by walls` + (r.ok ? ` (only a ${r.lengthUnits} detour)` : ` (no short way: ${r.reason})`));
    }
    walked.push(pts[i]);
  }
  if (maxSwim > 2800) fails.push(`swims ${Math.round(maxSwim)} without a shore (one breath ~2800)`);
  if (detours) warns.push(`${detours} leg(s) not straight-walkable, a short geodata detour exists`);
  const res = { ok: !fails.length, fails, warns, walked, maxSwim: Math.round(maxSwim) };
  ROUTE_CACHE.set(sig, res);
  return res;
}
/** the walk SEGMENTS of a plan travel block (a teleport / door / floor step separates two segments)
 *  -> { segs: [{ pts, gaps:Set }], jumps: [{ i, dist }] (computed / override points that jump like a teleport inside ONE stored list), src, why } */
const JUMP = 4000;
function splitJumps(P, gapSet) {
  const segs = [], jumps = []; let cur = { pts: [], gaps: new Set() };
  P.forEach((p, i) => {
    if (cur.pts.length && !gapSet.has(i) && d2(cur.pts[cur.pts.length - 1], p) > JUMP) { jumps.push({ i, dist: Math.round(d2(cur.pts[cur.pts.length - 1], p)) }); segs.push(cur); cur = { pts: [], gaps: new Set() }; }
    if (gapSet.has(i) && cur.pts.length) cur.gaps.add(cur.pts.length);
    cur.pts.push(p);
  });
  if (cur.pts.length) segs.push(cur);
  return { segs, jumps };
}
function travelPoints(t) {
  if (!t) return null;
  if (Array.isArray(t.points) && t.points.length) {   // computed: anchor route + leg; the builder stored ONE point list (the plan route the staged engine walks)
    const r = t.key ? atlasRoute(t.key) : null; const gapPts = [];
    if (r) (r.steps || []).forEach(s => { if (s.do === 'walk' && s.how === 'field-areas-gap') { const p = flat2pts(s.points); if (p.length === 2) gapPts.push(p[1]); } });
    const P = t.points.map(P3), G = new Set();
    gapPts.forEach(q => { const j = P.findIndex(x => d2(x, q) < 2 && Math.abs(x[2] - q[2]) < 5); if (j > 0) G.add(j); });
    const sj = splitJumps(P, G);
    return Object.assign({ src: 'computed', steps: (r && r.steps) || [] }, sj);
  }
  const r = t.key ? atlasRoute(t.key) : null; if (!r) return { segs: [], jumps: [], src: 'missing', why: 'atlas route file ' + t.key + ' missing' };
  const segs = []; let cur = { pts: [], gaps: new Set() };
  (r.steps || []).forEach(s => {
    if (s.do === 'arrive') return;
    if (s.do !== 'walk') { if (cur.pts.length) { segs.push(cur); cur = { pts: [], gaps: new Set() }; } return; }   // a teleport / door / floor step: a new segment
    const p = flat2pts(s.points); const off = cur.pts.length ? 1 : 0;
    if (s.how === 'field-areas-gap' && p.length === 2) cur.gaps.add(cur.pts.length + (off ? 0 : 1));
    cur.pts.push(...p.slice(off));
  });
  if (cur.pts.length) segs.push(cur);
  return { segs, jumps: [], steps: r.steps || [], src: 'atlas', route: r };
}

// ------------------------------------------------------------------------------------------------ Java source: a flat <id>.java dir or a datapack root
const JAVA_IDX = new Map();
function javaPathOf(id) {
  if (!SRC_DIR) return '';
  const flat = path.join(SRC_DIR, id + '.java'); if (fs.existsSync(flat)) return flat;
  const qd = [path.join(SRC_DIR, 'src', 'main', 'java', 'com', 'l2jserver', 'datapack', 'quests'), SRC_DIR].find(d => { try { return fs.statSync(d).isDirectory(); } catch (e) { return false; } });
  if (!qd) return '';
  if (!JAVA_IDX.has(qd)) { const m = {}; try { for (const d of fs.readdirSync(qd)) { const mm = /^Q(\d{5})_/.exec(d); if (!mm) continue; const jf = fs.readdirSync(path.join(qd, d)).find(x => x.endsWith('.java')); if (jf) m[Number(mm[1])] = path.join(qd, d, jf); } } catch (e) { } JAVA_IDX.set(qd, m); }
  return JAVA_IDX.get(qd)[Number(id)] || '';
}

// ------------------------------------------------------------------------------------------------ the engine's reading of the plan override
// MIRROR of Scripts_dev/swarm.js QUESTPLAN-2026-10-27 (qePlanMatch / qePlanSpot / qePlanRoute / qePlanNpcAt / qePlanWalk -> rsCustomTrip):
//   override.steps[key].route (>= 2 points) + start {kind 'town' | 'gk' (from, desc)}  -> walked as the step's route (every place of the step)
//   .area {at, radius, name}  -> the hunting place;  .npcAt  -> where the NPC is looked for;  .manual -> the run fails at that step;  override.skip -> not started
//   a step with .area / .npcAt but no .route -> the engine's own travel (no plan route).  Plan travel: src 'computed' + points + start + status ok|unverified.
// Fields the fixers write that the engine does NOT read yet (docs/plan/quest_engine_needs/batch1.md A, batch5.md) -> FAIL 'engine-gap:<field>'.
const ovOf = (plan, s) => (plan && plan.override && plan.override.steps && s && plan.override.steps[s.key]) || null;
const ovRoute = (ov) => ov && Array.isArray(ov.route) && ov.route.filter(p => Array.isArray(p) && p.length >= 2).length >= 2 ? ov.route.filter(p => Array.isArray(p) && p.length >= 2) : null;
function engineGaps(plan, q) {
  const out = [];
  const add = (field, t) => { if (!out.some(x => x.field === field && x.t === t)) out.push({ field, t }); };
  Object.entries((plan && plan.override && plan.override.steps) || {}).forEach(([k, ov]) => {
    if (!ov || typeof ov !== 'object') return;
    const st = ov.start;
    if (st && st.kind && !/^(town|gk)$/.test(st.kind)) add('start.kind=' + st.kind, `${k}: start "${st.kind}" (${st.desc || st.key || ''}) — rsCustomTrip knows only town / gk`);
    if (st && st.via) add('start.via', `${k}: gatekeeper start via "${st.via}" — rsCustomTrip teleports to "${st.from || ''}" directly`);
    if (st && !ovRoute(ov)) add('start-without-route', `${k}: an override start without a route is never used (qePlanRoute needs route)`);
    ['forMobs', 'routeProposed', 'placeRoutes', 'routes', 'routeSteps'].forEach(f => { if (ov[f] != null && !(Array.isArray(ov[f]) && !ov[f].length)) add(f, `${k}: override.${f} is not read by the engine`); });
  });
  ((q && q.drops) || []).forEach(d => { if (d.needEquipped) add('needEquipped', `drop ${d.item}: equip ${JSON.stringify(d.needEquipped.items || d.needEquipped)} before the kill`); if (d.soloHits) add('soloHits', `drop ${d.item}: only this character may hit the monster`); });
  return out;
}

// ------------------------------------------------------------------------------------------------ helpers
const spawnsNear = (id, at, r, dz) => (SPID.get(Number(id)) || []).filter(s => Math.hypot(s.x - at[0], s.y - at[1]) <= r && (dz == null || Math.abs(s.z - at[2]) <= dz));
function gkLinkLive(from, link) {
  // like swarm.js gkNorm: drop "the", "town of", "village of", the price / free suffix; GK_ALIAS 'Ant Cave' = 'The Ant Nest'
  const gkn = (t) => norm(t).replace(/\b(the|town of|village of|of the)\b/g, ' ').replace(/\b\d+\s*adena\b|\bfree\b|\bnoblesse\b.*$/g, ' ').replace(/\s+/g, ' ').trim();
  const ALIAS = { 'ant cave': 'ant nest' };
  let L = gkn(link); if (!L) return { ok: false, why: 'no link text' }; L = ALIAS[L] || L;
  const town = norm(from);
  const gks = GKLIVE.filter(g => norm(g.town) === town || norm(g.name) === town);
  if (!gks.length) return { ok: null, why: 'no live gatekeeper menu for "' + from + '"' };
  for (const g of gks) for (const page of Object.values(g.pages || {})) for (const t of page) { const n = gkn(t); if (!n) continue; if (n === L || (n.length > 5 && L.length > 5 && (n.indexOf(L) >= 0 || L.indexOf(n) >= 0))) return { ok: true, gk: g.name }; }
  return { ok: false, why: '"' + link + '" not on the live menu of ' + gks.map(g => g.name).join('/') };
}
const RACES = ['HUMAN', 'ELF', 'DARK_ELF', 'ORC', 'DWARF', 'KAMAEL'];

// ------------------------------------------------------------------------------------------------ one quest
function verify(id) {
  const R = { id: Number(id), fails: [], warns: [], info: [] };
  const F = (code, t) => R.fails.push({ code, t }), W = (code, t) => R.warns.push({ code, t });
  const plan = tryJ(path.join(process.env.SWARM_QUESTPLAN_DIR || path.join(DATA, 'quest_plans'), id + '.json'), null), q = tryJ(path.join(DATA, 'quests', id + '.json'), null);
  if (!plan || !q) { F('data-missing', 'plan or quest record missing'); return R; }
  R.name = plan.name; R.level = plan.level && plan.level.min; R.planStatus = plan.status; R.region = plan.region; R.type = q.type;
  if (plan.status !== 'ready') W('label-changed', 'the plan is now "' + plan.status + '" (a fixer re-built it)');
  const javaFile = javaPathOf(id);
  const jf = javaFile && fs.existsSync(javaFile) ? javaFacts(fs.readFileSync(javaFile, 'utf8')) : null;
  if (!jf) W('no-script-source', 'Java source not available: script checks skipped');
  const rq = plan.requirements || {};
  // ---- the virtual character ----
  let lvl = plan.level && plan.level.min != null ? Number(plan.level.min) : null;
  if (jf && jf.lv.min.length) { const jm = Math.max(...jf.lv.min); if (lvl == null) { F('level-mismatch', `plan has no minimum level, the script needs ${jm}`); lvl = jm; } else if (jm !== lvl) F('level-mismatch', `plan min level ${lvl}, script ${[...new Set(jf.lv.min)].join('/')}`); }
  if (jf && jf.lv.max.length && plan.level && plan.level.max == null && Math.min(...jf.lv.max) < 85) W('level-max-missing', `script has a max level ${[...new Set(jf.lv.max)].join('/')}, plan none`);
  if (lvl == null) lvl = plan.refLevel || 1;
  R.charLevel = lvl;
  const race = (rq.races && rq.races[0]) || RACES.find(r => !(rq.notRaces || []).includes(r)) || 'HUMAN';
  const me = { level: lvl, race, className: (rq.classes || [])[0] || '' };
  const el = E.qeEligible(q, me); if (!el.ok) F('not-eligible', 'virtual char ' + JSON.stringify(me) + ': ' + el.why.join('; '));
  if (jf) {
    const pr = new Set([].concat(rq.races || [], rq.notRaces || []));
    if (jf.races.length && !pr.size) F('race-missing', `script checks race ${jf.races.join('/')}, plan has no race rule`);
    else if (jf.races.length && jf.races.some(r => !pr.has(r))) W('race-differs', `script races ${jf.races.join('/')}, plan ${[...pr].join('/')}`);
    else if (!jf.races.length && pr.size) W('race-extra', `plan has race rule ${[...pr].join('/')}, script has no Race check`);
    const pc = [].concat(rq.classes || [], rq.notClasses || [], rq.categories || []);
    const cc = jf.classChecks.filter(c => !/isSubClassActive|isNoble/.test(c));
    if (cc.length && !pc.length) F('class-missing', `script checks ${cc.slice(0, 4).join(', ')}, plan has no class rule`);
    const pq = new Set((rq.quests || []).map(x => Number(x.id)));
    const jq = jf.prereq.filter(x => x !== Number(id) && !pq.has(x));
    if (jq.length) W('prereq-missing', `script refers to quest(s) ${jq.join(', ')} not in the plan requirements`);
    // start items checked in the CREATED branch
    const itemIds = new Set((q.items || []).map(i => Number(i.id)));
    const needItems = []; (jf.created.match(/(hasQuestItems|getQuestItemsCount|hasItem|hasAtLeastOneQuestItem)\(\s*([\w.]+(?:\s*,\s*[\w.]+)*)\)/g) || []).forEach(t => t.replace(/^[^(]*\(/, '').replace(/\)$/, '').split(',').map(s => s.trim()).forEach(nm => { const c = jf.consts[nm]; const v = c && c.nums.length ? c.nums[0] : null; if (v && !needItems.includes(v)) needItems.push(v); }));
    const ri = new Set((rq.items || []).map(x => Number(x.id)));
    const miss = needItems.filter(v => !ri.has(v) && !NPCS[v]);
    if (miss.length) W('start-item-missing', `the start page checks item(s) ${miss.map(v => v + ((q.items || []).find(i => Number(i.id) === v) ? ' ' + (q.items.find(i => Number(i.id) === v).name) : '')).join(', ')}, plan requirements do not list it`);
  }
  // ---- 0 OVERRIDE: what the engine honours / not ----
  if (plan.override && plan.override.skip) F('plan-skip', 'override.skip: the engine does not start this quest' + (plan.override.note ? ' (' + plan.override.note + ')' : ''));
  plan.steps.forEach(s => { const ov = ovOf(plan, s); if (ov && ov.manual) F('step-manual', `step ${s.i + 1} (${s.key}) is marked manual in the override: the engine fails the run there${ov.note ? ' (' + String(ov.note).slice(0, 120) + ')' : ''}`); });
  engineGaps(plan, q).forEach(g => F('engine-gap:' + g.field, g.t));
  // ---- 1 START ----
  const st0 = plan.steps[0];
  if (!st0 || st0.kind !== 'start' || !st0.npc) F('no-start-step', 'first plan step is not a start at an NPC');
  else {
    const ov0 = ovOf(plan, st0), at = ov0 && Array.isArray(ov0.npcAt) ? ov0.npcAt.map(Number) : st0.npc.at;
    if (!at) F('start-npc-no-place', 'start NPC has no place');
    else {
      const sp = spawnsNear(st0.npc.id, at, 300);
      if (!sp.length) F('start-npc-no-spawn', `${st0.npc.name} ${st0.npc.id} has no spawn within 300 of ${at.join(',')} (spawns_h5: ${(SPID.get(st0.npc.id) || []).length})`);
      const an = (ATLASNPC.get(st0.npc.id) || []).filter(n => Math.hypot(n.x - at[0], n.y - at[1]) < 600);
      if (!an.length) W('start-npc-not-in-atlas', `${st0.npc.name} not in npc_atlas.json at that place`);
    }
    if (jf && !jf.nums.has(Number(st0.npc.id))) F('script-npc-unknown', `start NPC ${st0.npc.id} not in the script`);
  }
  // ---- 2 STEPS vs SCRIPT ----
  const planConds = new Set(); plan.steps.forEach(s => (s.conds || [s.cond]).forEach(c => planConds.add(Number(c))));
  (q.transitions || []).forEach(t => { if (typeof t.to === 'number') planConds.add(t.to); });
  if (jf) {
    if (jf.condRuntime) W('script-runtime-cond', 'script sets a cond from a variable');
    if (/setMemoState\(/.test(jf.code) && (q.transitions || []).some(t => t.to == null)) F('memo-state', 'the script steps by setMemoState (' + (jf.code.match(/setMemoState\(/g) || []).length + ' calls); transitions without a cond: the engine cannot see these stages');
    if (/exitQuest\(/.test(jf.onTalk) && !jf.starts && !jf.setConds.size) F('dummy-quest', 'the script only exits the quest on talk (no start, no stage): nothing to run');
    const missing = [...jf.setConds].filter(c => !planConds.has(c));
    if (missing.length) F('script-stage-missing', `script setCond(${missing.join(', ')}) has no plan step / transition`);
    const extra = [...planConds].filter(c => c > 1 && !jf.setConds.has(c));
    if (extra.length) F('plan-stage-unknown', `plan stage(s) ${extra.join(', ')} never set by the script`);
    // transitions: events + their cond
    (q.transitions || []).forEach(t => {
      const evs = t.to == null ? [] : (t.trigger && t.trigger.events) || [];
      evs.forEach(ev => {
        if (!jf.strings.has(ev)) { F('script-event-missing', `event "${ev}" (to ${t.to}) not in the script`); return; }
        const blocks = eventBlock(jf, ev); if (!blocks.length) return;
        const want = t.to === 'end' ? /exitQuest\(|setState\(State\.COMPLETED/ : t.start || (t.to === 1 && !(t.from || []).length) ? /startQuest\(|setState\(State\.STARTED|setCond\(\s*1\b/ : new RegExp('setCond\\(\\s*' + t.to + '\\b');
        if (t.to === 'end' && blocks.some(b => /startQuest\(|setState\(State\.STARTED/.test(b)) && !blocks.some(b => /exitQuest\(|setState\(State\.COMPLETED/.test(b))) { F('start-merged-with-end', `event "${ev}" STARTS the quest in the script, the data says it ends it (switch cases merged by the extractor: the steps between are lost)`); return; }
        if (!blocks.some(b => want.test(b))) {
          if (t.to === 'end' || t.start || jf.setConds.has(Number(t.to))) W('script-flow-far', `event "${ev}": its case block does not show ${t.to === 'end' ? 'exitQuest' : 'setCond(' + t.to + ')'} (set elsewhere)`);
          else F('script-flow', `event "${ev}" -> cond ${t.to}: the script never sets it`);
        }
      });
      ((t.trigger && t.trigger.npcs) || []).forEach(n => { if (!jf.nums.has(Number(n))) F('script-npc-unknown', `transition NPC/monster ${n} not in the script`); });
      [].concat(t.gives || [], t.takes || []).forEach(x => { if (x && x.id && Number(x.id) !== 57 && !jf.nums.has(Number(x.id))) F('script-item-unknown', `item ${x.id} given/taken in the plan data, not in the script`); });
    });
  }
  // ---- per step: places, monsters, items ----
  plan.steps.forEach(s => {
    const tag = `step ${s.i + 1} (${s.key})`;
    if (s.npc && s.kind !== 'start') {
      const ovs = ovOf(plan, s), nat = ovs && Array.isArray(ovs.npcAt) ? ovs.npcAt.map(Number) : s.npc.at;   // qePlanNpcAt: your NPC place first
      if (!nat) F('npc-no-place', `${tag}: ${s.npc.name} has no place`);
      else if (!spawnsNear(s.npc.id, nat, 300).length) {
        if (ovs && ovs.npcAt && !(SPID.get(Number(s.npc.id)) || []).length) F('engine-gap:npcAt-spawner', `${tag}: ${s.npc.name} ${s.npc.id} is spawned by the quest (override npcAt ${nat.join(',')}): the engine walks there but does not trigger the spawn`);
        else F('npc-no-spawn', `${tag}: ${s.npc.name} ${s.npc.id} has no spawn at ${nat.join(',')}`);
      }
      if (jf && !jf.nums.has(Number(s.npc.id))) F('script-npc-unknown', `${tag}: NPC ${s.npc.id} not in the script`);
    }
    (s.needs || []).forEach(x => { if (jf && !jf.nums.has(Number(x.id))) F('script-item-unknown', `${tag}: needs item ${x.id} not in the script`); });
    if (s.kind === 'hunt' && jf && !(s.items || []).length && /getRandom\(|giveItemRandomly\(/.test(jf.onKill)) {
      // the engine hunts "kills N" (here N = ${s.kills}) and stops when the count is reached; the script moves the stage only on a RANDOM roll:
      // qeRun repeats the same hunt at most sameKeyMax times (it never resets on success) -> the run fails when the roll keeps missing
      const m = jf.onKill.match(/getRandom\((\d+)\)\s*(==|<|<=)\s*(\w+)/), den = m ? Number(m[1]) : null, num = m ? jf.constVal(m[3]) : null;
      // the data's own roll (quest_extract.js 2026-10-27: kills[].chance / chanceByNpc of a random stage) beats the regex guess
      const kd = (q.kills || []).filter(k => k.random && (k.conds || []).some(c => (s.conds || [s.cond]).map(Number).includes(Number(c))));
      const dps = [].concat(...kd.map(k => [].concat(k.chance != null ? [k.chance] : [], k.chanceByNpc ? Object.values(k.chanceByNpc) : []))).map(Number).filter(v => v > 0 && v < 100);
      const p = dps.length ? Math.min(...dps) / 100 : den ? (m[2] === '==' ? 1 / den : (num + (m[2] === '<=' ? 1 : 0)) / den) : null;
      const kills = Math.max(1, Number(s.kills) || 1), fail = p != null ? Math.pow(1 - p, kills * QE_SAME_MAX) : null;
      const ok = p != null && p > 0 && p < 1;
      if (ok && fail <= 0.05) W('kill-step-random', `${tag}: random stage ${Math.round(p * 1000) / 10} % per kill, ${kills} kills x ${QE_SAME_MAX} tries: fails ${Math.round(fail * 1000) / 10} % of runs`); else
      F('kill-step-random', `${tag}: the plan hunts with no item to collect (${s.kills ? 'kill ' + s.kills : 'no kill count'}), but the script gives a drop only on a random roll${ok ? ' (' + Math.round(p * 100) + ' % per kill)' : ''}${(q.drops || []).length ? ' (data drop items ' + [...new Set(q.drops.map(d => d.item))].join(', ') + ' have no target count)' : ''}; the engine ends each hunt at the count and gives up after ${QE_SAME_MAX} tries${ok ? ' = fails ' + Math.round(fail * 100) + ' % of runs' : ''}`);
    }
    if (s.kind === 'hunt') {
      (s.monsters || []).forEach(m => {
        if (jf && !jf.nums.has(Number(m.id))) F('script-mob-unknown', `${tag}: monster ${m.id} ${m.name} not in the script`);
        if (!(SPID.get(Number(m.id)) || []).length) F('mob-no-spawn', `${tag}: ${m.name} ${m.id} has no spawn at all`);
      });
      (s.items || []).forEach(it => {
        if (jf && !jf.nums.has(Number(it.id))) F('script-item-unknown', `${tag}: drop item ${it.id} ${it.name} not in the script`);
        const d = (q.drops || []).find(x => Number(x.item) === Number(it.id));
        const endlessBatch = d && (E.qeTurnIn(q) || q.endless) && Number(it.n) === Math.min(Number(d.limit) || 1e9, E.qeDefaultBatch(q));   // the engine's own batch, not a script number
        if (jf && !endlessBatch && !jf.nums.has(Number(it.n))) F('script-count', `${tag}: count ${it.n} of ${it.name} not in the script`);
        (it.from || []).forEach(f => {
          if (jf && !jf.nums.has(Number(f.id))) F('script-mob-unknown', `${tag}: drop source ${f.id} ${f.name} not in the script`);
          const c = Number(f.chance);
          if (jf && isFinite(c) && c > 0 && c < 100) { const cand = [c, c / 100, c * 10, Math.round(c * 10) / 1000, 100 - c, (100 - c) / 100]; if (!cand.some(v => [...jf.nums].some(n => Math.abs(n - v) < 1e-6))) W('chance-unconfirmed', `${tag}: ${it.name} from ${f.name} at ${c}% — no such number in the script`); }
          if (f.chance == null) W('chance-unresolved', `${tag}: ${it.name} from ${f.name}: no chance in the data (builder should say drop-unresolved)`);
          else if (!(c > 0) || c > 100) W('chance-garbled', `${tag}: ${it.name} from ${f.name}: chance ${f.chance} (not a percent)`);
        });
      });
      // the chosen area(s)
      const ovh = ovOf(plan, s);   // qePlanSpot: the override area beats every plan place
      const huntPlaces = ovh && ovh.area && Array.isArray(ovh.area.at) ? [{ mobs: (s.monsters || []).map(m => m.id), area: { at: ovh.area.at.map(Number), radius: Number(ovh.area.radius) || 1500, name: ovh.area.name || 'override area' } }]
        : (s.places || [{ mobs: (s.monsters || []).map(m => m.id), area: s.area, travel: s.travel }]);
      huntPlaces.forEach((pl, k) => {
        const ar = pl.area; if (!ar || !ar.at) { F('no-hunt-place', `${tag}: place ${k + 1} has no area`); return; }
        let tot = 0; const lvs = [];
        const inA = new Set();
        (pl.mobs || []).forEach(mid => { const n = spawnsNear(mid, ar.at, (ar.radius || 1500) + 300, 1500).reduce((a, x) => a + (x.count || 1), 0); tot += n; if (n) { inA.add(Number(mid)); if (NPCS[mid]) lvs.push(NPCS[mid].l); } });
        // every item of this place needs at least one of its source monsters inside the area; kill steps at least one kill monster
        const its = (s.items || []).filter(it => !(pl.items || []).length || (pl.items || []).includes(it.id));
        its.forEach(it => { const src = (it.from || []).map(f => Number(f.id)).filter(id => (pl.mobs || []).map(Number).includes(id)); if (src.length && !src.some(id => inA.has(id))) F('mob-not-in-area', `${tag}: no source of ${it.name} (${src.join(', ')}) spawns in "${ar.name}"`); });
        if (!its.length && !inA.size) F('mob-not-in-area', `${tag}: none of ${(pl.mobs || []).join(', ')} spawns in "${ar.name}"`);
        const out = (pl.mobs || []).filter(id => !inA.has(Number(id))); if (out.length && inA.size) W('area-partial', `${tag}: ${out.map(id => (NPCS[id] || {}).n || id).join(', ')} not in "${ar.name}" (others are)`);
        if (tot && tot < 3) W('area-thin', `${tag}: only ${tot} target spawn(s) in "${ar.name}"`);
        if (lvs.length) { const lo = Math.min(...lvs); if (lo >= lvl + 9) F('mob-too-strong', `${tag}: weakest target is level ${lo}, character ${lvl}`); else if (lo >= lvl + 6) W('mob-strong', `${tag}: weakest target level ${lo} vs character ${lvl}`); }
        const ag = aggroNear([ar.at], lvl + 8, 150).filter(a => a); // aggro circle touching the centre
        const inArea = []; for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) (AGR.get((Math.floor(ar.at[0] / AGS) + dx) + ',' + (Math.floor(ar.at[1] / AGS) + dy)) || []).forEach(m => { if (m.lv >= lvl + 8 && Math.abs(m.z - ar.at[2]) < 800 && Math.hypot(m.x - ar.at[0], m.y - ar.at[1]) <= (ar.radius || 1500) && !(pl.mobs || []).map(Number).includes(m.id)) inArea.push(m); });
        if (inArea.length >= 3) F('area-aggro', `${tag}: "${ar.name}" holds ${inArea.length} aggressive spawns ${lvl + 8}+ (${[...new Set(inArea.map(m => m.name + ' ' + m.lv))].slice(0, 4).join(', ')})`);
        else if (inArea.length) W('area-aggro-few', `${tag}: ${inArea.length} aggressive spawn(s) ${[...new Set(inArea.map(m => m.name + ' ' + m.lv))].join(', ')} in the area`);
        void ag;
      });
      // time vs the engine hunt cap
      const needKills = Math.max(Number(s.kills) || 0, ...(s.items || []).map(it => { const cs = (it.from || []).map(f => Number(f.chance)).filter(c => c > 0 && c <= 100); const ch = cs.length ? Math.max(...cs) : 100; return Math.ceil(Number(it.n) * 100 / ch); }), 1);   // best source; unknown chance = counted as 100 % (optimistic)
      const min = needKills * 25 / 60; if (min > QE_HUNT_MAX_MIN * QE_SAME_MAX) F('hunt-too-long', `${tag}: ~${needKills} kills (~${Math.round(min)} min) > the engine's ${QE_SAME_MAX} x ${QE_HUNT_MAX_MIN} min hunt cap`);
      else if (min > QE_HUNT_MAX_MIN) W('hunt-long', `${tag}: ~${needKills} kills (~${Math.round(min)} min): more than one ${QE_HUNT_MAX_MIN}-min hunt round`);
    }
    if (s.kind === 'spawn') {
      if (s.engine && s.engine.how === 'talk') (s.engine.trigger || []).forEach(n => { if (!(SPID.get(Number(n)) || []).length) F('npc-no-spawn', `${tag}: trigger NPC ${n} has no spawn`); });
      if (s.engine && s.engine.how === 'kill') (s.engine.trigger || []).forEach(n => { if (!(SPID.get(Number(n)) || []).length) F('mob-no-spawn', `${tag}: trigger monster ${n} has no spawn`); });
      (s.monsters || []).forEach(m => { if (jf && !jf.nums.has(Number(m.id))) F('script-mob-unknown', `${tag}: ${m.id} not in the script`); if (jf && !/addSpawn\(/.test(jf.code)) F('spawn-not-in-script', `${tag}: the script never calls addSpawn`); if (NPCS[m.id] && NPCS[m.id].l >= lvl + 9) F('mob-too-strong', `${tag}: ${m.name} level ${NPCS[m.id].l}, character ${lvl}`); });
    }
  });
  // ---- 4 FLOW SIMULATION (engine decisions against the transitions) ----
  simulate(q, plan, R, jf, F, W);
  // ---- 3 ROUTES ----
  if (!NOGEO_RT) routes(plan, R, lvl, F, W);
  R.pass = !R.fails.length;
  return R;
}
function simulate(q, plan, R, jf, F, W) {
  const T = E.qeTr(q), s = { started: false, cond: null, condKnown: true, have: { 57: 1e9 } };   // the character carries adena
  const acts = []; let ended = false, last = '', same = 0;
  const apply = (t) => { (t.takes || []).forEach(x => { if (x && x.id) s.have[x.id] = Math.max(0, (s.have[x.id] || 0) - (Number(x.count) || 1)); }); (t.gives || []).forEach(x => { if (x && x.id) s.have[x.id] = (s.have[x.id] || 0) + (Number(x.count) || 1); }); if (t.to === 'end') ended = true; else if (t.to != null) s.cond = Number(t.to); };
  for (let g = 0; g < 80 && !ended; g++) {
    const a = E.qeDecide(q, s), before = JSON.stringify(s);
    const label = a.act + (a.kind ? ':' + a.kind : '') + (a.npcs ? '@' + a.npcs[0] : a.monsters ? '@' + a.monsters.join('+') : a.target ? '@' + a.target : '');
    acts.push((s.started ? 'c' + s.cond : 'c0') + ' ' + label);
    if (a.act === 'manual') { F('engine-manual', `cond ${s.cond}: ${a.why}`); break; }
    if (a.act === 'advance') { s.cond = Number(a.to); continue; }
    // the staged plan wiring: every action must find its plan step
    if (E.qePlanMatch) {
      const m = E.qePlanMatch(plan, a, a.kind === 'start' ? 0 : s.cond);
      if (a.act === 'talk' && !(a.npcs || []).length) F('talk-no-npc', `cond ${s.cond}: the engine must talk but the data names no NPC (qeDoTalk = fatal "no NPC for this step")`);
      if (!m && (a.npcs || []).length + (a.monsters || []).length) W('plan-step-missing', `cond ${s.started ? s.cond : 0}: the engine does ${label}, no plan step matches it (staged qePlanMatch)`);
      else if ((a.act === 'hunt') && !E.qePlanSpot(m)) F('plan-spot-missing', `cond ${s.cond}: ${label}: the plan step has no hunting place`);
    }
    if (a.act === 'talk' || a.act === 'turnin') {
      const ids = (a.npcs || []).map(Number);
      if (!ids.some(n => (SPID.get(n) || []).length)) F('npc-no-spawn', `cond ${s.cond}: engine talks to ${ids.join('/')} — no spawn`);
      if (a.act === 'turnin') { ended = true; break; }
      const cands = (a.trans || []).map(i => T[i]).filter(Boolean);
      const t = cands.find(x => E.qeNeedMet(x, s.have)) || null;
      if (!t) { F('flow-stuck', `cond ${s.cond}: talk to ${ids[0]} needs ${cands.map(x => E.qeNeedList(x).map(n => n.id + 'x' + n.n).join('+')).join(' | ')} — not in the bag`); break; }
      const ty = t.trigger && t.trigger.type;
      if (ty === 'event' && !(a.links || []).length && !(a.events || []).length) F('no-dialog-link', `cond ${s.cond}: talk to ${ids[0]} needs a dialog click but the action has no link / event`);
      if (a.kind === 'start') { s.started = true; s.cond = 1; apply(t); if (t.to !== 'end' && t.to != null) s.cond = Number(t.to); }
      else apply(t);
    } else if (a.act === 'hunt') {
      if (!E.qeHuntSpot(q, a.monsters, null)) F('hunt-spot-missing', `cond ${s.cond}: current engine (qeHuntSpot) knows no spawn cluster for ${a.monsters.join(', ')}`);
      (a.items || []).forEach(x => { s.have[x.id] = Math.max(s.have[x.id] || 0, x.n); });
      const ks = E.qeTransAt(q, s.cond).filter(t => t.trigger && /^(kill|attack)$/.test(t.trigger.type) && (t.trigger.npcs || []).some(n => a.monsters.includes(Number(n))) && t.to !== s.cond && E.qeNeedMet(t, s.have));
      if (ks.length) apply(ks.sort((x, y) => (y.to === 'end' ? 1e3 : y.to) - (x.to === 'end' ? 1e3 : x.to))[0]);
    } else if (a.act === 'spawn') {
      if (a.how === 'talk') { const tt = E.qeTransAt(q, s.cond).find(t => t.trigger && /^(talk|event)$/.test(t.trigger.type) && (t.trigger.npcs || []).some(n => (a.npcs || []).includes(Number(n))) && E.qeNeedMet(t, s.have)); if (tt && tt.to !== s.cond) apply(tt); }
      (a.items || []).forEach(x => { s.have[x.id] = Math.max(s.have[x.id] || 0, x.n); });
      const ks = E.qeTransAt(q, s.cond).filter(t => t.trigger && /^(kill|attack)$/.test(t.trigger.type) && (t.trigger.npcs || []).map(Number).includes(Number(a.target)) && E.qeNeedMet(t, s.have));
      if (ks.length) apply(ks[0]);
      if (jf && !/addSpawn\(/.test(jf.code)) F('spawn-not-in-script', 'the engine expects a quest spawn, the script has no addSpawn');
    } else { F('engine-unknown-action', a.act); break; }
    const after = JSON.stringify(s);
    if (after === before) { if (label === last) same++; else { same = 1; last = label; } if (same >= 3) { F('flow-no-progress', `cond ${s.cond}: ${label} changes nothing (the engine stops after ${QE_SAME_MAX} tries)`); break; } }
    else { same = 0; last = label; }
  }
  if (!ended && !R.fails.some(f => /^flow-|engine-manual/.test(f.code))) F('flow-no-end', `the simulation did not reach the end (last cond ${s.cond})`);
  R.flow = acts;
}
function routes(plan, R, lvl, F, W) {
  const seen = new Set();
  plan.steps.forEach(s => {
    const tag = `step ${s.i + 1} (${s.key})`;
    const blocks = [];
    const ov = ovOf(plan, s), ovr = ovRoute(ov);
    const npcEnd = s.npc ? { at: ov && Array.isArray(ov.npcAt) ? ov.npcAt.map(Number) : s.npc.at, radius: 0, name: s.npc.name } : null;
    const ovArea = ov && ov.area && Array.isArray(ov.area.at) ? { at: ov.area.at.map(Number), radius: Number(ov.area.radius) || 1500, name: ov.area.name || 'override area' } : null;
    if (ovr) {   // qePlanRoute: the override route (with its town / gk start) is walked for this step, whatever place it hunts
      const st = ov.start && ov.start.kind ? ov.start : null;
      const gkSteps = st && st.kind === 'gk' ? [{ do: 'gk', from: st.from || String(st.desc || '').split('->')[0].trim(), link: String(st.desc || '').split('->').pop().trim(), desc: st.desc }] : [];
      const ends = npcEnd ? [npcEnd] : ovArea ? [ovArea] : (s.places && s.places.length ? s.places.map(p => p.area).filter(Boolean) : [s.area]);
      const end = ends.slice().sort((a, b) => (a && a.at ? d2(P3(ovr[ovr.length - 1]), a.at) : 1e9) - (b && b.at ? d2(P3(ovr[ovr.length - 1]), b.at) : 1e9))[0];
      blocks.push({ t: { src: 'override', key: 'override ' + s.key, points: ovr, start: st, steps: gkSteps, status: 'ok' }, end, kind: npcEnd ? 'npc' : 'area' });
    } else if (ov && (ovArea || ov.npcAt)) {   // your own place without your own route: the engine's normal travel (route switch / nav atlas) goes there
      W('route-engine-own', `${tag}: override place without a route — the engine's own travel goes there (not checked on the geodata here)`);
      return;
    } else if (s.kind === 'hunt' && Array.isArray(s.places) && s.places.length) s.places.forEach((p, k) => blocks.push({ t: p.travel, end: p.area, kind: 'area', k }));
    else if (s.travel) blocks.push({ t: s.travel, end: npcEnd || s.area, kind: s.npc ? 'npc' : 'area' });
    if (!blocks.length) { if (s.kind !== 'special') F('route-missing', `${tag}: no travel block`); return; }
    blocks.forEach(b => {
      const t = b.t; if (!t) { F('route-missing', `${tag}: place ${(b.k || 0) + 1} has no travel`); return; }
      const sig = (t.key || '') + '|' + (t.points ? t.points.length + ':' + (t.points[t.points.length - 1] || []).join(',') : '');
      if (t.status && t.status !== 'ok') F('route-status', `${tag}: route ${t.key} status ${t.status}`);
      // gatekeeper / town start
      (t.steps || []).forEach(x => { if (x.do === 'gk') { const L = gkLinkLive(x.from, x.link); if (L.ok === false) F('gk-link-not-live', `${tag}: ${x.desc}: ${L.why}`); else if (L.ok === null) W('gk-menu-unknown', `${tag}: ${x.desc}: ${L.why}`); } });
      const tp = t.src === 'override' ? Object.assign({ src: 'override', steps: t.steps }, splitJumps(t.points.map(P3), new Set())) : travelPoints(t);
      if (!tp || !tp.segs.length) { F('route-no-points', `${tag}: ${tp && tp.why || 'no walk points'}`); return; }
      // ONE stored point list that jumps like a teleport: the staged qePlanWalk -> rsCustomTrip walks it as one route (no teleport in between)
      if (tp.jumps.length && (tp.src === 'override' || (s.kind === 'hunt' || s.kind === 'spawn') || true)) {
        const gkMid = (t.steps || []).filter(x => x.do === 'gk').length && t.start && t.start.kind === 'town';
        (tp.src === 'override' ? F : (gkMid ? F : W))('plan-route-jump', `${tag}: ${t.key || t.src}: the stored ${tp.src} point list jumps ${tp.jumps.map(j => j.dist).join(', ')} between two points (a teleport inside it${gkMid ? ': start .' + String(t.start.town).toLowerCase() + ', then a gatekeeper' : ''}) — the staged plan walk (rsCustomTrip) would try to WALK that jump`);
      }
      // the end of the walk vs the target
      const lastSeg = tp.segs[tp.segs.length - 1], end = lastSeg.pts[lastSeg.pts.length - 1];
      if (b.end && b.end.at) { const dd = d2(end, b.end.at); const lim = b.kind === 'npc' ? 900 : (b.end.radius || 1500) + 1500; if (dd > lim) F('route-end-far', `${tag}: the walk ends ${Math.round(dd)} from ${b.end.name || 'the target'} (limit ${lim})`); }
      if (seen.has(sig)) return; seen.add(sig);
      const walked = [];
      tp.segs.forEach(sg => {
        if (sg.pts.length < 2) { walked.push(...sg.pts); return; }
        const g = geoWalk(sg.pts, sg.gaps);
        g.fails.forEach(x => F(/swim/.test(x) ? 'route-swim' : /gap/.test(x) ? 'route-gap' : 'route-wall', `${tag}: ${t.key || t.src}: ${x}`));
        g.warns.forEach(x => W('route-detour', `${tag}: ${t.key || t.src}: ${x}`));
        walked.push(...g.walked);
      });
      const g = { walked };
      const ag = aggroNear(g.walked, lvl + 6, 150);
      if (ag.length) F('route-aggro', `${tag}: ${t.key || t.src}: aggressive ${ag.slice(0, 4).map(a => a.name + ' ' + a.lv + ' x' + a.n).join(', ')} on the walk (character ${lvl})`);
    });
  });
}

// ------------------------------------------------------------------------------------------------ run (CLI only; quest_plan_build.js requires this file and calls verify())
if (require.main === module) {
const ids = Object.keys(STATUS.quests).filter(k => STATUS.quests[k].status === 'ready' && (!ONLY || ONLY.has(k))).sort((a, b) => a - b);
console.log(`quest_dryrun: ${ids.length} ready quests; engine staged edits: ${stagedFrom}; Java: ${SRC_DIR || '(none)'}; geodata: ${NOGEO_RT ? 'off' : 'on'}; free RAM ${freeMB()} MB`);
const t0 = Date.now(), res = [];
try {
  for (const id of ids) { let r; try { r = verify(id); } catch (e) { r = { id: Number(id), fails: [{ code: 'verifier-error', t: e.stack.split('\n').slice(0, 3).join(' ') }], warns: [] }; } res.push(r); if (res.length % 20 === 0) console.log(`  ${res.length}/${ids.length} (${Math.round((Date.now() - t0) / 1000)} s, free ${freeMB()} MB)`); }
} finally { lockFree(); }
// ---- report ----
const pass = res.filter(r => !r.fails.length), fail = res.filter(r => r.fails.length);
const byCode = {}; fail.forEach(r => [...new Set(r.fails.map(f => f.code))].forEach(c => { (byCode[c] = byCode[c] || []).push(r.id); }));
const wCode = {}; res.forEach(r => [...new Set(r.warns.map(f => f.code))].forEach(c => { (wCode[c] = wCode[c] || []).push(r.id); }));
console.log(`quest_dryrun: PASS ${pass.length} / ${res.length}, FAIL ${fail.length} (${Math.round((Date.now() - t0) / 1000)} s)`);
Object.entries(byCode).sort((a, b) => b[1].length - a[1].length).forEach(([c, v]) => console.log(`  ${c}: ${v.length}  ${v.slice(0, 12).join(' ')}`));
if (JSONOUT) fs.writeFileSync(JSONOUT, JSON.stringify({ at: new Date().toISOString(), staged: stagedFrom, res }, null, 1));
if (!has('--no-md')) {
  const L = [];
  L.push('# Quest plans: independent dry-run verification', '', `Generated ${new Date().toISOString()} by \`node docs/plan/tools/quest_dryrun.js\` (read-only verifier; it does not trust the \`ready\` label).`, '',
    `Engine: Scripts_dev/swarm.js QENGINE-PURE (qeDecide, qeHuntSpot, qeEligible) + staged QUESTPLAN qePlanMatch / qePlanSpot from: ${stagedFrom}. Hunt cap: ${QE_SAME_MAX} x ${QE_HUNT_MAX_MIN} min. Script source: L2J High Five datapack Java (github.com/Shagooh/l2j-server-datapack master). Geodata: ${NOGEO_RT ? 'not checked' : 'every route leg (geopath.legOk; field-areas-gap legs path-searched with geopath_fast)'}.`, '',
    `**Result: ${pass.length} of ${res.length} \`ready\` quests PASS, ${fail.length} FAIL.**`, '',
    '## Checks', '', '- Virtual character at the quest\'s minimum level (race from the plan\'s race rule), `qeEligible` must accept it.',
    '- Start NPC: spawn within 300 of the plan place (spawns_h5.json), npc_atlas entry, every gatekeeper link of every route on a live menu (Scripts/data/gk_live).',
    '- Script (Java): min level, Race checks, class checks, prereq quests, start-page item checks; every setCond stage has a plan step and vice versa; every dialog event exists and its case block sets the cond; every NPC / monster / item id of the plan is in the script; hunt counts are script numbers; drop chances (warn only).',
    '- Hunting place: every target monster spawns inside the chosen area; weakest target >= level+9 = FAIL; 3+ aggressive non-target spawns level+8 inside the area = FAIL; hunt time > the engine cap = FAIL.',
    '- Flow: the real `qeDecide` against a server model of the quest transitions, from "not started" to the end: no manual step, no loop without progress, every hand-in item obtainable, every action matched to a plan step (staged `qePlanMatch`), hunts have a spot in the current engine (`qeHuntSpot`) and in the plan (`qePlanSpot`).',
    '- Routes (geodata): each leg straight-walkable or a short detour, gap legs path-searched, no swim > 2800 in one go, the walk ends at the NPC (600) / area, no aggressive monster 6+ levels above the character along the walked path, route status ok.', '',
    '## FAIL causes', '', '| cause | quests | ids |', '|---|---|---|', ...Object.entries(byCode).sort((a, b) => b[1].length - a[1].length).map(([c, v]) => `| \`${c}\` | ${v.length} | ${v.join(', ')} |`), '',
    '## Warnings (not counted as FAIL)', '', '| warning | quests | ids |', '|---|---|---|', ...Object.entries(wCode).sort((a, b) => b[1].length - a[1].length).map(([c, v]) => `| \`${c}\` | ${v.length} | ${v.slice(0, 40).join(', ')}${v.length > 40 ? ' ...' : ''} |`), '',
    '## PASS', '', pass.map(r => `${r.id} ${r.name} (L${r.charLevel})`).join(' · ') || '(none)', '',
    '## Every quest', '');
  res.forEach(r => {
    L.push(`### ${r.id} ${r.name || ''} — ${r.fails.length ? 'FAIL' : 'PASS'} (char level ${r.charLevel}, ${r.region || ''})`);
    r.fails.forEach(f => L.push(`- FAIL \`${f.code}\`: ${f.t}`));
    r.warns.forEach(f => L.push(`- warn \`${f.code}\`: ${f.t}`));
    if (r.flow) L.push(`- flow: ${r.flow.join(' > ')}`);
    L.push('');
  });
  fs.writeFileSync(MDOUT, L.join('\n') + '\n');
  console.log('quest_dryrun: wrote ' + MDOUT);
}
}
/** module use (quest_plan_build.js ready gate): verify one quest with the plan / record now on disk.
 *  opts: { src: Java dir or datapack root, noGeo, lockOwned (the caller holds Logs/quest_build.lock) } -> { id, pass, fails[], warns[], flow } */
function verifyOne(id, opts) {
  opts = opts || {};
  const keep = { SRC: SRC_DIR, GEO: NOGEO_RT, LK: lockByCaller };
  if (opts.src) SRC_DIR = opts.src; if (opts.noGeo !== undefined) NOGEO_RT = !!opts.noGeo; if (opts.lockOwned) lockByCaller = true;
  try { const r = verify(String(id)); r.pass = !r.fails.length; return r; }
  catch (e) { return { id: Number(id), pass: false, fails: [{ code: 'verifier-error', t: String(e && e.stack || e).split(String.fromCharCode(10)).slice(0, 3).join(' ') }], warns: [] }; }
  finally { SRC_DIR = keep.SRC; NOGEO_RT = keep.GEO; lockByCaller = keep.LK; }
}
module.exports = { verifyOne, javaFacts, aggroNear, engineGaps, spawnIndex: SPID };
