// NAV ATLAS (user 2026-10-12: "We have all the geodata, all the pathways and all the NPC and enemy locations from the game data. So why don't
// we have computed paths for every single raid boss, NPC, epic raid boss or location?").
// A precomputed route for every target, as a STATE MACHINE of steps the bot executes in order:
//   { do: 'town', town, cmd }                        .townname (the 11 towns with a command)
//   { do: 'gk', from, npc, link, landing, live, price } a town gatekeeper link (live menu text when recorded, else the datapack text)
//   { do: 'walk', points: [x,y,z,...], len, danger, how: 'geodata'|'saved'|'town-graph'|'dungeon-rooms'|'field-areas'|'straight', graph? }
//   { do: 'door', doorId, name, kind, need: { wait | unlock | items | npc | owner | blocked }, fallback, at }
//   { do: 'floor', dungeon, floor, npc, link, landing }   a dungeon floor teleporter (also the way in: Mozella, Triol's Mirror, ...)
//   { do: 'enter', how: 'ziggurat'|'instance'|'bosszone', ... }    Seven Signs ziggurat / an instance / a boss-zone entry NPC
//   { do: 'arrive', target, x, y, z }
// 2026-10-12 (unreachable research, docs/plan/unreachable_research.md; executor: scratchpad patch_navatlas2.js):
//   enter { how: 'npc-teleport' | 'vehicle' | 'zone', links: [page link, ..., last link], wait: { sec, retrySec }, at, landingR, hub }
//   { do: 'need', manual: true, text, condition }   a step the bots cannot do (kill Darion / Epidos, a Four Sepulchers hall): the route stops
//   transport hubs, live-only gatekeeper links, drop walks: Scripts/data/nav_atlas_extra.json; long legs: nav_atlas_longlegs.js
// Targets: every raid boss + grand/epic boss (raidbosses_h5.json, epic_tactics.json), every NPC with a role or a quest (npc_atlas.json), every
// field area (field_areas.json), every dungeon room (dungeon_rooms.json) and every dungeon entrance. Saved / locked routes win over computed ones
// (routes/raid/<id>.json, routes/dungeons/<key>.json); existing graphs are reused (town_graph, dungeon_rooms room routes, field_areas entry routes);
// only the missing walks are computed with docs/plan/tools/geopath.js (wall + height aware A*), in a low-priority child process that exits and
// is restarted when it passes the memory limit (default 1.2 GB rss), results cached in Scripts/data/nav_atlas/_walks.json (resumable,
// incremental: a re-run only computes walks that are not in the cache). Every walk is checked against the datapack doors (Scripts/data/nav_doors.json,
// docs/plan/tools/nav_doors.js): a closed door on the way becomes a 'door' step (timed wait / Unlock / key item / NPC) or blocks the route.
// Output: Scripts/data/nav_atlas/index.json + raid.json, npc.json, area.json, room.json, dungeon.json; docs/plan/nav_atlas_report.md;
// progress in Logs/nav_atlas_progress.json. Routes with  manual: true  in the type files are never overwritten (manual_guard lock + atomic write).
// SWIMMING (2026-10-13, Tillion): the path finders cross water zones by swimming (water_zones.js). A walk step gets  swim: [point indices
//   inside a water zone]  (the walker allows the slow swim speed there and does not turn back when the breath runs out), swimLen / maxSwim
//   (the longest unbroken swim, breath ~60 s, then 1 % HP a second) and flags 'swim' / 'long-swim'. The goal's "closed pocket" check is
//   pocketIn (who can walk IN), not pocket (who can walk out): a beach you swim onto or a pit you drop into is no closed pocket.
// RAID ROUTE POLICY (2026-10-13 15:15, owner: "Precompute all routes to all raid bosses ... around obstacles, navigate the centre ... do not choose
//   positions where we must swim if it can be avoided ... Pirate Cave / Garden of Eva: swim down, doors to open"): every walk of a raid / epic
//   target is searched with RPOL (below): clearance (keep >= 48 from walls / cliffs where the ground allows), one-way drops off ledges (fall height
//   recorded), danger circles (aggressive monsters > boss level + 6), DRY FIRST: swimming only when no dry way exists or the dry way is > 4x and
//   > 15 km longer than the swim way; swim cost x12; the longest unbroken swim vs the breath (2,800 units at swim speed 50 = 56 s) is recorded
//   (overBreath). Hard legs (A* cap) are flooded + joined (geopath_fast.findPathFlood). Cache keys of these walks end in '#rp1:<boss level>'.
//   Walk steps get  drops: [{ i, fall }]  and  pol: { mode: dry | swim-only | swim-shorter | dry-capped, dryLen, swimLen, overBreath }.
// Run:  node docs/plan/tools/nav_atlas.js [--no-walks] [--max-jobs N] [--retry-failed] [--mem MB] [--only raid,npc,...]
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
try { os.setPriority(process.pid, os.constants.priority.PRIORITY_LOW); } catch (e) { }
const ROOT = path.resolve(__dirname, '..', '..', '..');
const DATA = path.join(ROOT, 'Scripts', 'data'), OUTDIR = path.join(DATA, 'nav_atlas'), LOGS = path.join(ROOT, 'Logs');
const ARG = process.argv.slice(2), has = (f) => ARG.includes(f), argv = (f, d) => { const i = ARG.indexOf(f); return i >= 0 && ARG[i + 1] ? ARG[i + 1] : d; };
// FOGREACH-2026-10-13: --tag <name> = own job list + progress file (Logs/nav_atlas_jobs_<name>.json), so a --keys run can go next to another
// running atlas batch (raid_routes.js) without sharing its job list; the walk cache + the type files are merged as before
const RUNTAG = String(argv('--tag', '') || '').replace(/[^A-Za-z0-9_-]/g, '');
const CACHE = path.join(OUTDIR, '_walks.json'), JOBS = path.join(LOGS, RUNTAG ? `nav_atlas_jobs_${RUNTAG}.json` : 'nav_atlas_jobs.json'), PROGRESS = path.join(LOGS, RUNTAG ? `nav_atlas_progress_${RUNTAG}.json` : 'nav_atlas_progress.json');
const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, ''));
const tryJ = (f, d) => { try { return J(f); } catch (e) { return d; } };
const atomic = (f, s) => { const t = f + '.tmp' + process.pid; fs.writeFileSync(t, s); fs.renameSync(t, f); };
const progress = (o) => { try { atomic(PROGRESS, JSON.stringify(Object.assign({ at: new Date().toISOString(), pid: process.pid }, o))); } catch (e) { } };
const WATER = require('./water_zones');                                     // SWIMMING (2026-10-13)
const SWIM_SPEED = 50;                                                       // H5 player swim speed (baseStats fastSwim 50; run 115-130)
const MEM_MB = +argv('--mem', 700), FREE_MIN_MB = +argv('--free-min', 450);   // the bot PC runs L2Swarm: MemWatch restarts it below 300 MB free
const P = { maxLeg: 1000, walkSpeed: 120, townSec: 20, gkSec: 25, floorSec: 15, npcSec: 10, maxWalkBot: 25000, maxSearch: 48000, maxNodes: 2000000, maxMs: 15000, hWeight: 2, cand: 3, doorPad: 40 };
// RAID ROUTE POLICY (2026-10-13): the search rules for every walk of a raid / epic target (see the header)
const { RPOL, policyLeg: policyLegM } = require('./raid_policy');   // RAID ROUTE POLICY (2026-10-13): rules + the walk search live in raid_policy.js
fs.mkdirSync(OUTDIR, { recursive: true }); fs.mkdirSync(LOGS, { recursive: true });
const kq = (v) => Math.round(v / 32);
const walkKey = (a, b) => `${kq(a.x)},${kq(a.y)},${kq(a.z || 0)}>${kq(b.x)},${kq(b.y)},${kq(b.z || 0)}`;

// =============================================================================================================================== WORKER
if (has('--worker')) {
  const geo = has('--slow') ? require('./geopath') : require('./geopath_fast');   // geopath_fast: same rules, typed arrays (2026-10-12)
  const jobs = tryJ(JOBS, { jobs: [] }).jobs;
  let cache = tryJ(CACHE, { walks: {} }); cache.walks = cache.walks || {};
  let n = 0, since = 0; const t0 = Date.now();
  // MINE-ONLY FLUSH (2026-10-13 datafix): merge ONLY the walks this worker computed into the disk copy. Before, the whole in-memory cache was
  // written over the disk, so a worker that started earlier (raid_routes.js batch) put its stale failed entries back over walks another run
  // (--keys --tag) had just solved.
  const mine = new Set();
  const flush = () => { const disk = tryJ(CACHE, { walks: {} }); disk.walks = disk.walks || {}; for (const k of mine) if (cache.walks[k]) disk.walks[k] = cache.walks[k]; disk.updated = new Date().toISOString(); atomic(CACHE, JSON.stringify(disk)); cache = disk; mine.clear(); since = 0; };
  const todo = jobs.filter(j => !cache.walks[j.k] || (has('--retry-failed') && !cache.walks[j.k].ok));
  const rk = (p) => ((p.x + 294912) >> 15) * 64 + ((p.y + 262144) >> 15); todo.sort((x, y) => rk(x.a) - rk(y.a) || rk(x.b) - rk(y.b));   // same geodata regions back to back
  if (has('--reverse')) todo.reverse();                               // a 2nd worker from the other end (both skip what the other did: 'at' > start)
  const sleepSync = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  for (const j of todo) {
    if (cache.walks[j.k] && cache.walks[j.k].at > t0 && cache.walks[j.k].by !== process.pid) continue;   // done by the other worker since I started
    // the PC is shared with L2Swarm: wait while free memory is low; give up (exit 76) when it stays low
    for (let w = 0; os.freemem() / 1048576 < FREE_MIN_MB; w++) { if (w === 0) flush(); progress({ phase: 'walks: waiting for free memory', freeMB: Math.round(os.freemem() / 1048576), done: jobs.length - todo.length + n, total: jobs.length }); if (w >= 30) process.exit(76); sleepSync(20000); }
    let r;
    try {
      const straight = Math.hypot(j.a.x - j.b.x, j.a.y - j.b.y);
      if (j.pol) r = policyLeg(geo, j, straight);                          // RAID ROUTE POLICY (2026-10-13)
      else if (straight > P.maxSearch) r = { ok: false, why: `too far for one search (${Math.round(straight)} straight)` };
      else {
        // a closed pocket (platform, island, sealed room) around either end: no search needed
        // both ends in the SAME closed pocket (same cell count from either end: a transport hub's room, 2026-10-12) = search inside it
        const pa = geo.pocket ? geo.pocket(j.a.x, j.a.y, j.a.z, 60000) : 60000, pb = geo.pocketIn ? geo.pocketIn(j.b.x, j.b.y, j.b.z, 60000) : geo.pocket ? geo.pocket(j.b.x, j.b.y, j.b.z, 60000) : 60000;   // 2026-10-13: walk IN
        const same = pa < 60000 && pa === pb;
        const p = same ? geo.findPath(j.a, j.b, { maxNodes: pa * 4 + 1000, maxMs: P.maxMs, maxLeg: P.maxLeg, hWeight: P.hWeight, pad: 3000, noLearned: false, avoid: j.avoid || [] })
          : pa < 60000 ? { ok: false, reason: `the start is a closed pocket of ${pa} cells on the geodata (platform / island / sealed room: no walk out)` } : pb < 60000 ? { ok: false, reason: `the goal is a closed pocket of ${pb} cells on the geodata (no walk in)` }
          : geo.findPath(j.a, j.b, { maxNodes: Math.min(P.maxNodes, Math.round(1.6 * ((Math.abs(j.a.x - j.b.x) + (straight > 20000 ? 6000 : 10000)) / 16) * ((Math.abs(j.a.y - j.b.y) + (straight > 20000 ? 6000 : 10000)) / 16))), maxMs: P.maxMs, maxLeg: P.maxLeg, hWeight: P.hWeight, pad: straight > 20000 ? 3000 : 5000, noLearned: false, avoid: j.avoid || [] });
        r = p.ok ? Object.assign({ ok: true, pts: [].concat(...p.points.map(q => [q.x, q.y, q.z])), len: p.lengthUnits || 0, ms: p.ms }, p.swimUnits ? { swimLen: p.swimUnits, maxSwim: p.maxSwimRun } : {}) : { ok: false, why: String(p.reason || 'no way'), ms: p.ms };
        // FLOOD ON GIVE-UP (2026-10-13 datafix, Rune guild / Aden castle NPCs): the A* node cap ("gave up after N cells") is no proof that there is
        // no way: flood the geodata (geopath_fast.findPathFlood, the raid policy's hard-leg search) before writing the walk off as straight
        if (!p.ok && /gave up after/.test(String(p.reason || '')) && geo.findPathFlood) {
          const f = geo.findPathFlood(j.a, j.b, { maxNodes: 4000000, maxMs: P.maxMs * 2, maxLeg: P.maxLeg, pad: straight > 20000 ? 6000 : 3000, avoid: j.avoid || [] });
          if (f.ok) r = Object.assign({ ok: true, pts: [].concat(...f.points.map(q => [q.x, q.y, q.z])), len: f.lengthUnits || 0, ms: (p.ms || 0) + (f.ms || 0), flood: true }, f.swimUnits ? { swimLen: f.swimUnits, maxSwim: f.maxSwimRun } : {});
          else r.why += `; flood: ${f.reason || 'no way'}`;
        }
      }
    } catch (e) { r = { ok: false, why: 'error: ' + e.message }; }
    r.at = Date.now(); r.by = process.pid; cache.walks[j.k] = r; mine.add(j.k); n++; since++;
    if (since >= 15) flush();
    const rss = process.memoryUsage().rss / 1048576;
    if (n % 5 === 0) progress({ phase: 'walks', done: jobs.length - todo.length + n, total: jobs.length, rssMB: Math.round(rss), sec: Math.round((Date.now() - t0) / 1000) });
    if (rss > MEM_MB) { flush(); process.exit(75); }      // the parent starts a fresh worker (the geodata buffers are dropped with this process)
  }
  flush();
  process.exit(0);
}
/** RAID ROUTE POLICY (2026-10-13): one walk under the raid rules (docs/plan/tools/raid_policy.js) */
function policyLeg(geo, j, straight) { return policyLegM(geo, j, straight); }

// =============================================================================================================================== ORCHESTRATOR
// default: the planning runs in a child (writes the atlas + the walk job list), the walks in worker children (restarted past the memory
// limit), then a final build child — this process holds no data, so the PC never carries planner + worker at once
if (!has('--plan')) {
  const pass = ARG.filter(a => a !== '--retry-failed' && a !== '--no-walks');
  const run = (args) => { const r = cp.spawnSync(process.execPath, ['--max-old-space-size=900', __filename, '--plan'].concat(args), { stdio: 'inherit', windowsHide: true }); return r.status; };
  let st = run(pass.concat(['--write-jobs']));
  let paused = false;
  for (let pass2 = 0; pass2 < 3 && !paused; pass2++) {
  const njobs = (tryJ(JOBS, { jobs: [] }).jobs || []).length;
  if (!(st === 0 && !has('--no-walks') && njobs)) break;
  {
    for (let round = 0; round < 400; round++) {
      const r = cp.spawnSync(process.execPath, ['--max-old-space-size=' + Math.max(400, MEM_MB - 200), __filename, '--worker', '--mem', String(MEM_MB), '--free-min', String(FREE_MIN_MB)].concat(RUNTAG ? ['--tag', RUNTAG] : [], has('--retry-failed') && pass2 === 0 ? ['--retry-failed'] : []), { stdio: 'inherit', windowsHide: true });
      if (r.status === 75) { console.log(`nav_atlas: worker restarted (memory > ${MEM_MB} MB), round ${round + 1}`); continue; }
      if (r.status === 76) { console.log(`nav_atlas: the PC stayed below ${FREE_MIN_MB} MB free for 10 min — walks paused (run again later; the cache keeps what was done)`); paused = true; break; }
      if (r.status !== 0) console.log(`nav_atlas: worker ended with ${r.status} ${r.signal || ''}`);
      break;
    }
    st = run(pass.concat(['--write-jobs']));
  }
  }
  if (st === 0) cp.spawnSync(process.execPath, [path.join(__dirname, 'nav_atlas_split.js')], { stdio: 'inherit', windowsHide: true });   // small per-target files for the bots
  process.exit(st || 0);
}
// =============================================================================================================================== PLAN
const SRC = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
const grabObj = (name) => { const i = SRC.indexOf(`const ${name} = {`); if (i < 0) return {}; let d = 0, j = SRC.indexOf('{', i); const s = j; for (; j < SRC.length; j++) { if (SRC[j] === '{') d++; else if (SRC[j] === '}') { d--; if (!d) break; } } return (0, eval)('(' + SRC.slice(s, j + 1) + ')'); };
const TOWN_LAND = grabObj('TOWN_LAND'), TOWN_CMD = grabObj('TOWN_CMD'), TOWNS = grabObj('TOWNS'), GK_ALIAS = grabObj('GK_ALIAS'), DUNGEON_GK = grabObj('DUNGEON_GK'), DUNGEON_NEEDS = grabObj('DUNGEON_NEEDS');
const gkNorm = (s) => String(s || '').toLowerCase().replace(/\bvilage\b/g, 'village').replace(/<[^>]*>/g, ' ').replace(/&#\d+;/g, ' ').replace(/\s+-\s+[\d.,]+\s*$/, '')
  .replace(/\s*[-–:(]?\s*(free|[\d.,]+\s*(adena|a))\s*\)?\s*$/i, '').replace(/^the\s+/, '').replace(/^town of\s+/, '').replace(/'s\b/g, '').replace(/[’']/g, '').replace(/\s+/g, ' ').trim();
const fromKey = {}; Object.entries(TOWNS).forEach(([k, t]) => (t.from || []).forEach(n => { fromKey[n.toLowerCase()] = k; }));
const toKey = (name) => { const n = gkNorm(name); return Object.keys(TOWNS).find(k => (TOWNS[k].to || []).some(t => gkNorm(t) === n) || gkNorm(TOWNS[k].menu) === n || gkNorm(k) === n) || null; };
const placeTown = { 'Kamael Village': 'Kamael', 'Talking Island': 'TI', 'Orc Village': 'Orc', 'Dark Elf Village': 'DarkElf', 'Elven Village': 'Elven', 'Dwarven Village': 'Dwarven', 'Hunters Village': 'Hunters' };
const townKeyOfPlace = (t) => placeTown[t] || (TOWNS[t] ? t : null);
/** any town spelling (datapack 'from', TOWNS key, menu name, atlas place) -> TOWNS key */
const tkOf = (s) => { if (!s) return null; const t = String(s).trim(); return fromKey[t.toLowerCase()] || (TOWNS[t] ? t : null) || placeTown[t] || toKey(t) || null; };
const TG_KEY = { TI: 'talkingisland', Elven: 'elven', DarkElf: 'darkelf', Orc: 'orc', Dwarven: 'dwarven', Kamael: 'kamael', Gludin: 'gludin', Gludio: 'gludio', Dion: 'dion', Giran: 'giran', Oren: 'oren', Aden: 'aden', Hunters: 'hunters', Heine: 'heine', Goddard: 'goddard', Rune: 'rune', Schuttgart: 'schuttgart', Floran: 'floran' };

const TP = tryJ(path.join(DATA, 'teleports_h5.json'), []);
const ATLAS = tryJ(path.join(DATA, 'npc_atlas.json'), { npcs: [] }).npcs || [];
const RAIDS = (tryJ(path.join(DATA, 'raidbosses_h5.json'), { bosses: [] }).bosses) || [];
const EPIC = tryJ(path.join(DATA, 'epic_tactics.json'), { bosses: {} }).bosses || {};
const FAREAS = tryJ(path.join(DATA, 'field_areas.json'), { regions: [] });
const DROOMS = tryJ(path.join(DATA, 'dungeon_rooms.json'), []);
const DOORS = tryJ(path.join(DATA, 'nav_doors.json'), { doors: [], conditions: [], bossZones: [] });
const DANGER = tryJ(path.join(DATA, 'danger_grid.json'), { data: {} });
const ONLY = argv('--only', '') ? argv('--only', '').split(',') : null;
// 2026-10-12 unreachable research (docs/plan/unreachable_research.md): live-only gatekeeper links, dungeon gatekeeper overrides, transport hubs
// (NPC / vehicle / walk-in-zone chains: Ivory Tower floors, race track, Fantasy Isle, Underground Coliseum, the Gracia airship + Seed docks,
// Seed of Annihilation portals, Hellbound -> Tully's Workshop floors -> Tower of Naia, Four Sepulchers), drop walks, notes
const EXTRA = tryJ(path.join(DATA, 'nav_atlas_extra.json'), {});
Object.entries(EXTRA.dungeonGk || {}).forEach(([k, o]) => { const d = DROOMS.find(x => x.key === k); if (d) d.gatekeeperRoute = Object.assign({}, d.gatekeeperRoute || {}, o); });

// ---- live gatekeeper menus ----
const liveLinks = {};   // town key -> Set(gkNorm link text)
for (const f of fs.readdirSync(path.join(DATA, 'gk_live'))) {
  if (!/\.json$/.test(f) || f.startsWith('_')) continue;
  const g = tryJ(path.join(DATA, 'gk_live', f), null); if (!g) continue;
  const tk = g.town ? (fromKey[String(g.town).toLowerCase()] || toKey(g.town) || g.town) : f.replace(/\.json$/, '');
  const S = liveLinks[tk] = liveLinks[tk] || new Set();
  Object.values(g.pages || {}).forEach(L => (L || []).forEach(t => S.add(gkNorm(t))));
}
const isLive = (town, dest) => { const S = liveLinks[town]; if (!S) return null; const w = gkNorm(GK_ALIAS[gkNorm(dest)] || dest); return [...S].some(t => t === w || t.startsWith(w) || t.endsWith(' ' + w)) ? true : false; };
const liveText = (town, dest) => { const S = liveLinks[town]; if (!S) return null; const w = gkNorm(GK_ALIAS[gkNorm(dest)] || dest); return [...S].find(t => t === w || t.startsWith(w) || t.endsWith(' ' + w)) || null; };
const townGk = {}; ATLAS.filter(n => (n.roles || []).includes('gatekeeper') && n.place && n.place.town).forEach(n => { const k = townKeyOfPlace(n.place.town); if (k && (!townGk[k] || (n.teleports || []).length > (townGk[k].teleports || []).length)) townGk[k] = n; });

// ---- towns + landings ----
const townLanding = (k) => { const p = TOWN_LAND[k]; if (!p) return null; const t = TP.filter(x => isFinite(x.z) && Math.hypot(x.x - p[0], x.y - p[1]) < 1500).sort((a, b) => Math.hypot(a.x - p[0], a.y - p[1]) - Math.hypot(b.x - p[0], b.y - p[1]))[0]; return { x: p[0], y: p[1], z: t ? t.z : -3000 }; };
const CMD_TOWNS = Object.keys(TOWN_CMD);
const TOWNPOS = {}; CMD_TOWNS.forEach(k => { TOWNPOS[k] = townLanding(k); });
// gatekeeper links: town key -> [{ desc, dest, x,y,z, price }]
const GKL = {};
for (const t of TP) {
  const parts = String(t.desc || '').split('->'); if (parts.length < 2) continue;
  const from = fromKey[parts[0].trim().toLowerCase()]; if (!from) continue;
  const dest = parts.slice(1).join('->').trim();
  if (/olympiad token|noble/i.test(dest) || !isFinite(t.x)) continue;
  (GKL[from] = GKL[from] || []).push({ from, desc: t.desc.trim(), dest, x: t.x, y: t.y, z: t.z, price: t.price || 0, toTown: toKey(dest) });
}
// links that are on the live menus but not in teleports_h5.json (L2Toggle catacomb / necropolis links: they land in the closed antechamber
// of the outer Gatekeeper Ziggurat). landing 'ziggurat' = next to that dungeon's outer Ziggurat (dungeon_rooms floors[0].enter.npc)
for (const e of EXTRA.gkLinks || []) {
  const from = tkOf(e.from); if (!from) continue;
  let L = Array.isArray(e.landing) ? e.landing : null;
  if (!L) { const d = DROOMS.find(x => gkNorm((x.gatekeeperRoute || {}).destination) === gkNorm(e.dest) || gkNorm(x.name) === gkNorm(e.dest)); const N = d && d.floors && d.floors[0] && d.floors[0].enter && d.floors[0].enter.npc; if (N && isFinite(N.x)) L = [N.x + 60, N.y, N.z]; }
  if (!L || (GKL[from] || []).some(x => gkNorm(x.dest) === gkNorm(e.dest))) continue;
  (GKL[from] = GKL[from] || []).push({ from, desc: `${e.from} -> ${e.dest}`, dest: e.dest, x: L[0], y: L[1], z: L[2], price: e.price || 0, toTown: null, extra: e.read || 'extra' });
}
// villages without a .town command: the cheapest link from a command town (town-to-town by gatekeeper only for these)
const VIA = {};
for (const v of Object.keys(TOWNS).filter(k => !TOWN_CMD[k])) {
  let best = null;
  for (const c of CMD_TOWNS) for (const l of GKL[c] || []) if (l.toTown === v && (!best || l.price < best.price)) best = l;
  if (best) VIA[v] = best;
}
const villageLanding = (v) => VIA[v] ? { x: VIA[v].x, y: VIA[v].y, z: VIA[v].z } : null;
const ALL_TOWN_POS = Object.assign({}, TOWNPOS); Object.keys(VIA).forEach(v => { ALL_TOWN_POS[v] = villageLanding(v); });
/** steps to stand in town k (its landing) */
function stepsToTown(k) {
  if (TOWN_CMD[k]) return [{ do: 'town', town: k, cmd: '.' + TOWN_CMD[k], at: TOWNPOS[k] && [TOWNPOS[k].x, TOWNPOS[k].y, TOWNPOS[k].z] }];
  const v = VIA[k]; if (!v) return null;
  return [{ do: 'town', town: v.from, cmd: '.' + TOWN_CMD[v.from], at: TOWNPOS[v.from] && [TOWNPOS[v.from].x, TOWNPOS[v.from].y, TOWNPOS[v.from].z] }, gkStep(v)];
}
function gkStep(l) {
  const lt = liveText(l.from, l.dest), gk = townGk[l.from];
  return { do: 'gk', from: l.from, npc: gk ? { id: gk.id, name: gk.name, x: gk.x, y: gk.y, z: gk.z } : null, link: l.dest, linkLive: lt || null, live: isLive(l.from, l.dest), desc: l.desc, price: l.price, landing: [l.x, l.y, l.z] };
}
// every landing a trip can start a walk from: the 11 .town landings, villages, and every non-town gatekeeper destination of a town
const LANDINGS = [];
CMD_TOWNS.forEach(k => { const p = TOWNPOS[k]; if (p) LANDINGS.push({ kind: 'town', town: k, x: p.x, y: p.y, z: p.z, cost: P.townSec }); });
Object.keys(VIA).forEach(v => { const p = villageLanding(v); if (p) LANDINGS.push({ kind: 'village', town: v, x: p.x, y: p.y, z: p.z, cost: P.townSec + P.gkSec + VIA[v].price / 2000 }); });
for (const [k, L] of Object.entries(GKL)) for (const l of L) {
  if (l.toTown) continue;
  const base = TOWN_CMD[k] ? P.townSec : (VIA[k] ? P.townSec + P.gkSec : null); if (base === null) continue;
  const gk = townGk[k], tw = TOWN_CMD[k] ? TOWNPOS[k] : villageLanding(k);
  const inTown = gk && tw ? Math.hypot(gk.x - tw.x, gk.y - tw.y) / P.walkSpeed : 5;
  LANDINGS.push({ kind: 'gk', town: k, link: l, x: l.x, y: l.y, z: l.z, cost: base + P.gkSec + inTown + l.price / 2000 + (isLive(k, l.dest) === false ? 600 : 0) });
}
// NPC teleports with a condition (nav_doors conditions[].landing + via in a town): Gracian Survivor -> Keucereus (lvl 75, 150k adena)
for (const c of (DOORS.conditions || []).filter(c => c.key === 'gracia-survivor' && Array.isArray(c.landing))) {
  const spawns = tryJ(path.join(DATA, 'spawns_npc_h5.json'), []).filter(x => x.id === (c.via && c.via.npcId));
  for (const sp of spawns) { const tk = CMD_TOWNS.map(k => [k, TOWNPOS[k] ? Math.hypot(TOWNPOS[k].x - sp.x, TOWNPOS[k].y - sp.y) : 1e9]).sort((a, b) => a[1] - b[1])[0]; if (!tk || tk[1] > 4000) continue;
    LANDINGS.push({ kind: 'npctp', town: tk[0], npc: { id: sp.id, name: sp.name, x: sp.x, y: sp.y, z: sp.z }, cond: c.key, x: c.landing[0], y: c.landing[1], z: c.landing[2], cost: P.townSec + tk[1] / P.walkSpeed + P.npcSec }); break; }
}
function stepsToLanding(L) {
  if (L.kind === 'hub') return hubSteps(L);
  if (L.kind === 'npctp-field') { const s = stepsToLanding(L.base); return s ? s.concat(walkAB(L.base, pt([L.npc.x, L.npc.y, L.npc.z]), L.npc.name).steps, [{ do: 'enter', how: 'npc-teleport', npc: L.npc, landing: [L.x, L.y, L.z], condition: L.cond }]) : null; }
  if (L.kind === 'npctp') { const s = stepsToTown(L.town); return s ? s.concat(walkAB(TOWNPOS[L.town], pt([L.npc.x, L.npc.y, L.npc.z]), L.npc.name).steps, [{ do: 'enter', how: 'npc-teleport', npc: L.npc, landing: [L.x, L.y, L.z], condition: L.cond }]) : null; }
  if (L.kind === 'town') return stepsToTown(L.town);
  if (L.kind === 'village') return stepsToTown(L.town);
  const s = stepsToTown(L.town); if (!s) return null;
  return s.concat([gkStep(L.link)]);
}

// NPC teleports in the FIELD (nav_doors conditions[] with fieldTp: the via NPC stands near a town / gatekeeper landing): Hellbound Warpgate (2026-10-12)
{ const bases = LANDINGS.filter(L => L.kind === 'gk' || L.kind === 'town');
  for (const c of (DOORS.conditions || []).filter(c => c.fieldTp && Array.isArray(c.landing))) for (const v of [].concat(c.via || [])) {
    if (!v || !isFinite(v.x)) continue;
    const b = bases.map(L => [L, Math.hypot(L.x - v.x, L.y - v.y)]).sort((p, q) => p[1] - q[1])[0]; if (!b || b[1] > 6000) continue;
    LANDINGS.push({ kind: 'npctp-field', base: b[0], town: b[0].town, npc: { id: v.npcId, name: v.npc, x: v.x, y: v.y, z: v.z }, cond: c.key, x: c.landing[0], y: c.landing[1], z: c.landing[2], cost: b[0].cost + b[1] / P.walkSpeed + P.npcSec });
  } }
// TRANSPORT HUBS (Scripts/data/nav_atlas_extra.json hubs[], 2026-10-12): a landing reached by a chain of NPC teleports / a vehicle / a walk-in
// zone / a manual step from a town, a gatekeeper landing, another hub or a condition landing (Hellbound). A hub is only offered to targets
// inside its serve box (a closed geodata pocket the open-world landings cannot walk into), and then first.
const HUB = {};
function hubBase(h) {
  const p = h.parent || {};
  if (p.town) { const k = tkOf(p.town); const pos = k && (TOWN_CMD[k] ? TOWNPOS[k] : villageLanding(k)); return pos ? { L: LANDINGS.find(L => L.kind === 'town' && L.town === k) || { kind: 'town', town: k, x: pos.x, y: pos.y, z: pos.z, cost: P.townSec }, town: k } : null; }
  if (p.gk) { const L = LANDINGS.find(L => L.kind === 'gk' && L.link && gkNorm(L.link.desc) === gkNorm(p.gk)); return L ? { L, town: L.town } : null; }
  if (p.hub) { const H = hubLanding(p.hub); return H ? { L: H, town: H.town } : null; }
  if (p.cond) { const L = LANDINGS.filter(L => L.cond === p.cond).sort((a, b) => a.cost - b.cost)[0]; return L ? { L, town: L.town } : null; }
  return null;
}
const p3 = (a) => ({ x: a[0], y: a[1], z: a[2] });   // (pt is declared further down)
function hubLanding(id) {
  if (HUB[id] !== undefined) return HUB[id];
  HUB[id] = null;                                                   // a parent loop stays null
  const h = (EXTRA.hubs || []).find(x => x.id === id); if (!h) return null;
  const b = hubBase(h); if (!b) return null;
  let cur = b.L, cost = b.L.cost;
  for (const v of h.via || []) {
    const n = v.townGk ? townGk[b.town] : v.npc, at = v.at ? p3(v.at) : n ? { x: n.x, y: n.y, z: n.z } : null;
    if (at) cost += Math.hypot(at.x - cur.x, at.y - cur.y) * 1.3 / P.walkSpeed;
    cost += P.npcSec + (v.cost || 0) + (v.price || 0) / 2000;
    if (Array.isArray(v.landing)) cur = p3(v.landing);
  }
  const L = h.via && h.via.length ? h.via[h.via.length - 1].landing : null; if (!Array.isArray(L)) return null;
  return (HUB[id] = { kind: 'hub', hub: h, base: b.L, town: b.town, x: L[0], y: L[1], z: L[2], cost: Math.round(cost), serve: h.serve || null });
}
(EXTRA.hubs || []).forEach(h => { const H = hubLanding(h.id); if (H) LANDINGS.push(H); });
const inServe = (S, T) => S && Math.hypot(T.x - S.x, T.y - S.y) <= S.r && (S.zMin == null || T.z >= S.zMin) && (S.zMax == null || T.z <= S.zMax);
/** the steps of a hub chain from its base landing */
function hubSteps(H) {
  const s = stepsToLanding(H.base); if (!s) return null;
  let cur = H.base; const h = H.hub;
  for (const v of h.via || []) {
    if (v.manual) { s.push({ do: 'need', manual: true, text: v.text, condition: v.condition || null, landing: v.landing || null, hub: h.id }); if (Array.isArray(v.landing)) cur = pt(v.landing); continue; }
    if (v.how === 'zone') {
      const at = pt(v.at); s.push(...walkAB(cur, at, `${h.name}: portal`).steps);
      s.push({ do: 'enter', how: 'zone', at: v.at, landing: v.landing, condition: v.condition || null, hub: h.id });
      cur = pt(v.landing); continue;
    }
    const n = v.townGk ? townGk[H.town] : v.npc; if (!n) return null;
    const N = { id: n.id, name: n.name, x: n.x, y: n.y, z: n.z };
    if (Math.hypot(N.x - cur.x, N.y - cur.y) > 150) {
      const tw = v.townGk && cur.kind === 'town' ? townWalk(H.town, cur, N) : null;
      s.push(...(tw ? walkSteps(tw.pts, 'town-graph', { graph: `town_graph/${TG_KEY[H.town]}.json` }) : walkAB(cur, N, N.name).steps));
    }
    const links = v.links || (v.link ? [v.link] : []);
    s.push(Object.assign({ do: 'enter', how: v.how || 'npc-teleport', npc: N, link: links.length ? links[links.length - 1] : null, landing: v.landing, condition: v.condition || null, hub: h.id },
      links.length > 1 ? { links } : {}, v.landingR ? { landingR: v.landingR } : {}, v.wait ? { wait: v.wait } : {}, v.price ? { price: v.price } : {}));
    cur = pt(v.landing);
  }
  return s;
}
// ---- doors on a walk ----
const DOORL = (DOORS.doors || []).filter(d => d.blocks && d.kind !== 'open');
const DGRID = {}; const GS = 4096;
DOORL.forEach(d => { const xs = d.poly.map(p => p[0]), ys = d.poly.map(p => p[1]); for (let gx = Math.floor(Math.min(...xs) / GS); gx <= Math.floor(Math.max(...xs) / GS); gx++) for (let gy = Math.floor(Math.min(...ys) / GS); gy <= Math.floor(Math.max(...ys) / GS); gy++) (DGRID[gx + ',' + gy] = DGRID[gx + ',' + gy] || []).push(d); });
/** server core DoorData.checkIfDoorsBetween on one leg: the first closed door polygon edge the leg crosses inside the door's height */
function doorOnLeg(a, b, skip) {                 // skip: Set of door ids already handled at the start of this leg
  const cand = new Set();
  for (let gx = Math.floor(Math.min(a.x, b.x) / GS); gx <= Math.floor(Math.max(a.x, b.x) / GS); gx++) for (let gy = Math.floor(Math.min(a.y, b.y) / GS); gy <= Math.floor(Math.max(a.y, b.y) / GS); gy++) (DGRID[gx + ',' + gy] || []).forEach(d => cand.add(d));
  let best = null;
  for (const d of cand) {
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4, p = d.poly[i], q = d.poly[j];
      const den = (b.y - a.y) * (p[0] - q[0]) - (b.x - a.x) * (p[1] - q[1]); if (!den) continue;
      const m1 = ((q[0] - p[0]) * (a.y - p[1]) - (q[1] - p[1]) * (a.x - p[0])) / den;
      const m2 = ((b.x - a.x) * (a.y - p[1]) - (b.y - a.y) * (a.x - p[0])) / den;
      if (m1 < 0 || m1 > 1 || m2 < 0 || m2 > 1) continue;
      if (skip && skip.has(d.id)) continue;        // a door the leg already passed (split point; double doors share a frame)
      const z = (a.z || 0) + m1 * ((b.z || 0) - (a.z || 0));
      if (z < d.zMin - P.doorPad || z > d.zMax + P.doorPad) continue;
      if (!best || m1 < best.t) best = { d, t: m1, x: Math.round(a.x + m1 * (b.x - a.x)), y: Math.round(a.y + m1 * (b.y - a.y)), z: Math.round(z) };
    }
  }
  return best;
}
const ITEMN = DOORS.itemNames || {};
const KEYNOEFF = new Set((DOORS.keySkills || []).filter(k => k.noEffect).map(k => k.skillId));   // key skills without an OpenDoor effect in the datapack
function doorNeed(d) {
  if (d.timed) return { wait: { closedFor: d.timed.closedFor, openFor: d.timed.openFor, maxWait: d.timed.maxWait, expectSec: Math.round(((d.timed.closedFor[0] + d.timed.closedFor[1]) / 2) ** 2 / (2 * ((d.timed.closedFor[0] + d.timed.closedFor[1]) / 2 + (d.timed.openFor[0] + d.timed.openFor[1]) / 2))) } };
  if (d.npcOpen && d.npcOpen.length) return { npc: d.npcOpen.map(n => ({ id: n.npcId, name: n.npc, x: n.x, y: n.y, z: n.z })), anyItem: d.npcItems || undefined, closesAfterSec: d.closesAfterSec || d.autoCloseSec || null, note: d.note, link: d.npcLink || undefined, unlockAlt: d.unlock ? unlockNeed(d) : undefined };
  if (d.hellboundLevel) return { hellboundLevel: d.hellboundLevel, note: d.note };   // server-wide Hellbound level (2026-10-12)
  if (d.keys && d.keys.length) return { items: d.keys.filter(k => k.itemId).map(k => Object.assign({ id: k.itemId, name: k.itemName, skillId: k.skillId }, KEYNOEFF.has(k.skillId) ? { noEffect: true } : {})), unlock: d.unlock ? unlockNeed(d) : undefined };
  if (d.unlock) return { unlock: unlockNeed(d) };
  if (d.clanhallId || d.kind === 'castle' || d.kind === 'fortress' || d.kind === 'clanhall' || d.kind === 'click') return { owner: d.clanhallId ? `clan hall ${d.clanhallId}` : d.kind, blocked: true };
  if (d.scripts) return { script: d.scripts.map(s => `${s.file.split('/').pop()}:${s.op}${s.event ? ' on ' + s.event : ''}${s.npc ? ' by ' + s.npc : ''}`), blocked: true, why: d.noOpenerWhy || undefined };
  if (d.kind === 'instance') return { instance: d.instances, blocked: true };
  if (d.noOpenerWhy) return { blocked: true, why: d.noOpenerWhy + (d.noOpenerSrc ? ' [' + d.noOpenerSrc + ']' : ''), area: d.area };
  return { blocked: true, why: 'closed by default, no opener in the datapack' };
}
const unlockNeed = (d) => ({ skillId: 27, skill: 'Unlock', classIds: d.unlock.classIds, chanceByLevel: d.unlock.chanceByLevel, sureFromSkillLevel: d.unlock.sureFromSkillLevel, consumes: { id: 1661, name: ITEMN[1661] || 'Thief Key' } });
const doorStep = (hit) => { const d = hit.d, need = doorNeed(d); return { do: 'door', doorId: d.id, name: d.name, kind: d.kind, at: [hit.x, hit.y, hit.z], need, fallback: need.blocked ? 'none: route blocked' : (need.wait ? 'wait for the next open phase (walk on when open)' : need.unlock ? 'Unlock (dagger class) or another route' : 'another route'), place: d.place }; };

// ---- danger ----
const dangerAt = (x, y, z, r = 800) => { const { x0, y0, size, w, band, data } = DANGER; if (!size) return 0; let m = 0; for (let cx = Math.floor((x - r - x0) / size); cx <= Math.floor((x + r - x0) / size); cx++) for (let cy = Math.floor((y - r - y0) / size); cy <= Math.floor((y + r - y0) / size); cy++) { const l = data[cy * w + cx]; if (l) l.forEach(([b, lv]) => { if (z == null || Math.abs(b * band + band / 2 - z) <= 700 + band / 2) m = Math.max(m, lv); }); } return m; };

// ---- RAID ROUTE POLICY (2026-10-13): the policy of the target being planned + its danger circles ----
let CUR_POL = null;                                                       // { ref: boss level } while a raid / epic target is planned
const NPCS = tryJ(path.join(DATA, 'npcs_h5.json'), {}), AGGRO = tryJ(path.join(DATA, 'aggro_h5.json'), {});
const AGG = (() => { const out = []; for (const sp of tryJ(path.join(DATA, 'spawns_h5.json'), [])) { const n = NPCS[sp.id]; if (!n || !n.l) continue; const r = AGGRO[sp.name || n.n]; if (!r) continue; out.push({ x: sp.x, y: sp.y, z: sp.z, lv: n.l, r }); } return out; })();
/** aggressive monsters more than RPOL.dangerMargin above the reference level around a leg -> geopath_fast danger circles */
function dangerCircles(a, b, ref) {
  const x1 = Math.min(a.x, b.x) - 4000, x2 = Math.max(a.x, b.x) + 4000, y1 = Math.min(a.y, b.y) - 4000, y2 = Math.max(a.y, b.y) + 4000, z1 = Math.min(a.z || 0, b.z || 0) - 1500, z2 = Math.max(a.z || 0, b.z || 0) + 1500;
  const out = [];
  for (const m of AGG) { if (m.lv <= ref + RPOL.dangerMargin || m.x < x1 || m.x > x2 || m.y < y1 || m.y > y2 || m.z < z1 || m.z > z2) continue; out.push({ x: m.x, y: m.y, r: m.r + RPOL.dangerPad, w: Math.min(4, Math.round(((m.lv - ref - RPOL.dangerMargin) / 5 + 1) * 10) / 10), lv: m.lv }); }
  return out.length > 3000 ? out.sort((p, q) => q.lv - p.lv).slice(0, 3000) : out;
}
// OWNER DOORS AS WALLS (coordinator 2026-10-13 17:50, Sejarr's Servitor: "fortress / castle doors that only the owner clan can open are treated as
// walls, and the planner routes AROUND them"): a policy leg gets every closed door the party can never open (owner / script / instance / never) in
// its box as avoid circles from the start (the geodata has no doors), its cache key a hash of those door ids. FORTS: the fortress siege zones
// (fortresses.json) name the place in the plain-sentence reason ("unreachable: inside Valley Fortress (owner clan only)").
const FORTS = ((tryJ(path.join(DATA, 'fortresses.json'), {}) || {}).forts || []).filter(x => x.siegeZone && Array.isArray(x.siegeZone.polygon)).map(x => ({ name: x.name, poly: x.siegeZone.polygon, zMin: x.siegeZone.minZ, zMax: x.siegeZone.maxZ }));
const inPolyF = (x, y, Pp) => { let c = false; for (let i = 0, j = Pp.length - 1; i < Pp.length; j = i++) { if (((Pp[i][1] > y) !== (Pp[j][1] > y)) && (x < (Pp[j][0] - Pp[i][0]) * (y - Pp[i][1]) / (Pp[j][1] - Pp[i][1]) + Pp[i][0])) c = !c; } return c; };
const fortAt = (x, y, z) => FORTS.find(F => inPolyF(x, y, F.poly) && (z == null || (z >= F.zMin - 300 && z <= F.zMax + 300))) || null;
function wallDoors(a, b) {
  const x1 = Math.min(a.x, b.x) - 1500, x2 = Math.max(a.x, b.x) + 1500, y1 = Math.min(a.y, b.y) - 1500, y2 = Math.max(a.y, b.y) + 1500;
  return (DOORS.doors || []).filter(d => d.blocks && d.kind !== 'open' && d.x >= x1 && d.x <= x2 && d.y >= y1 && d.y <= y2 && doorNeed(d).blocked && Math.hypot(d.x - a.x, d.y - a.y) > 300 && Math.hypot(d.x - b.x, d.y - b.y) > 300);
}
const hash32 = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
const DROPAT = new Map();                                                 // "x,y,z" -> fall (from the policy walks in the cache)
// ---- walk legs: cache / jobs ----
const cache = tryJ(CACHE, { walks: {} }); cache.walks = cache.walks || {};
const JOBSET = new Map();
const plen = (pts) => { let s = 0; for (let i = 3; i < pts.length; i += 3) s += Math.hypot(pts[i] - pts[i - 3], pts[i + 1] - pts[i - 2]); return Math.round(s); };
/** a walk a -> b: from the cache, or queued (pending) */
function leg(a, b, why, noQueue, avoidDoors) {
  const st = Math.hypot(a.x - b.x, a.y - b.y);
  if (st < 150) return { ok: true, pts: [a.x, a.y, a.z, b.x, b.y, b.z], len: Math.round(st), how: 'adjacent' };
  const pol = CUR_POL;                                                     // RAID ROUTE POLICY (2026-10-13): own cache entries
  if (pol && !pol.noWalls && !(avoidDoors && avoidDoors.length)) { const wd = wallDoors(a, b); if (wd.length) { avoidDoors = wd; wd.forEach(d => { const F = fortAt(d.x, d.y, d.z); if (F && pol.walls) pol.walls.add(F.name); }); } }   // OWNER DOORS AS WALLS
  const k = walkKey(a, b) + (avoidDoors && avoidDoors.length ? (pol ? '#w' + hash32(avoidDoors.map(d => d.id).sort().join('.')) : '#av' + avoidDoors.map(d => d.id).sort().join('.')) : '') + (pol ? `#rp${RPOL.v}:${pol.ref}` : ''), c = cache.walks[k];
  if (c) {
    if (c.ok && Array.isArray(c.dropAt)) c.dropAt.forEach(d => DROPAT.set(`${d[0]},${d[1]},${d[2]}`, d[3]));
    return c.ok ? Object.assign({ ok: true, pts: c.pol ? splitWet(splitLegs([a.x, a.y, a.z].concat(c.pts), P.maxLeg)) : splitLegs([a.x, a.y, a.z].concat(c.pts), P.maxLeg), len: c.len || plen([a.x, a.y, a.z].concat(c.pts)), how: 'geodata' }, c.pol ? { pol: c.pol, clr: c.clr || null, flood: c.flood || null } : {})
      : { ok: false, why: c.why, pts: [a.x, a.y, a.z, b.x, b.y, b.z], len: Math.round(st * 1.3), how: 'straight' };
  }
  if (!noQueue && !JOBSET.has(k)) JOBSET.set(k, Object.assign({ k, a: { x: Math.round(a.x), y: Math.round(a.y), z: Math.round(a.z || 0) }, b: { x: Math.round(b.x), y: Math.round(b.y), z: Math.round(b.z || 0) }, st: Math.round(st), why }, avoidDoors && avoidDoors.length ? { avoid: avoidDoors.map(doorCircle) } : {},
    pol ? { pol: { ref: pol.ref, danger: dangerCircles(a, b, pol.ref) } } : {}));
  return { ok: null, pending: true, pts: [a.x, a.y, a.z, b.x, b.y, b.z], len: Math.round(st * 1.3), how: 'straight' };
}
const pt = (a) => Array.isArray(a) ? { x: a[0], y: a[1], z: a[2] } : a;
/** geopath smooths in cells, so a diagonal leg can reach 1000 * sqrt(2): cut every leg longer than max into equal parts (the straight leg is wall-free, so its parts are too) */
function splitLegs(p, max) { const o = [p[0], p[1], p[2]]; for (let i = 3; i < p.length; i += 3) { const L = Math.hypot(p[i] - p[i - 3], p[i + 1] - p[i - 2]), n = Math.ceil(L / max); for (let k = 1; k < n; k++) o.push(Math.round(p[i - 3] + (p[i] - p[i - 3]) * k / n), Math.round(p[i - 2] + (p[i + 1] - p[i - 2]) * k / n), Math.round(p[i - 1] + (p[i + 2] - p[i - 1]) * k / n)); o.push(p[i], p[i + 1], p[i + 2]); } return o; }
/** RAID ROUTES 2026-10-13: a leg with an end inside a water zone is a swim for the server (every move cut at 700): cut it into parts <= 600 (geopath.legOk / the swim walker) */
function splitWet(p) { const o = [p[0], p[1], p[2]]; for (let i = 3; i < p.length; i += 3) { const L = Math.hypot(p[i] - p[i - 3], p[i + 1] - p[i - 2]), wet = WATER.zoneAt(p[i - 3], p[i - 2], p[i - 1]) || WATER.zoneAt(p[i], p[i + 1], p[i + 2]), n = wet ? Math.ceil(L / 600) : 1; for (let k = 1; k < n; k++) o.push(Math.round(p[i - 3] + (p[i] - p[i - 3]) * k / n), Math.round(p[i - 2] + (p[i + 1] - p[i - 2]) * k / n), Math.round(p[i - 1] + (p[i + 2] - p[i - 1]) * k / n)); o.push(p[i], p[i + 1], p[i + 2]); } return o; }
const flat = (arr) => [].concat(...arr.map(p => Array.isArray(p) ? [p[0], p[1], p[2]] : [p.x, p.y, p.z]));
/** walk step from flat points; splits at closed doors (door steps between), adds danger */
function walkSteps(pts, how, extra) {
  const out = []; let cur = [pts[0], pts[1], pts[2]], skip = null;
  for (let i = 3; i < pts.length; i += 3) {
    let a = { x: pts[i - 3], y: pts[i - 2], z: pts[i - 1] }; const b = { x: pts[i], y: pts[i + 1], z: pts[i + 2] };
    let hit = doorOnLeg(a, b, skip); const seen = new Set(skip || []); skip = null; let guard = 0;
    while (hit) {
      cur.push(hit.x, hit.y, hit.z);
      if (cur.length >= 6) out.push(mkWalk(cur, how, extra));
      out.push(doorStep(hit));
      cur = [hit.x, hit.y, hit.z]; a = { x: hit.x, y: hit.y, z: hit.z }; skip = hit.d.id;
      seen.add(hit.d.id); hit = ++guard < 8 ? doorOnLeg(a, b, seen) : null;   // a further door on the same leg
      skip = seen;
    }
    cur.push(b.x, b.y, b.z);
  }
  if (cur.length >= 6) out.push(mkWalk(cur, how, extra));
  return out;
}
function mkWalk(pts, how, extra) {
  let dg = 0; for (let i = 0; i < pts.length; i += 3) dg = Math.max(dg, dangerAt(pts[i], pts[i + 1], pts[i + 2]));
  // RAID ROUTE POLICY (2026-10-13): the points reached by a one-way drop off a ledge -> drops [{ i, fall }] (the walker steps off there)
  const drops = []; if (DROPAT.size && how !== 'straight') for (let i = 3, k = 1; i < pts.length; i += 3, k++) { const f = DROPAT.get(`${Math.round(pts[i])},${Math.round(pts[i + 1])},${Math.round(pts[i + 2])}`); if (f) drops.push({ i: k, fall: f }); }
  return Object.assign({ do: 'walk', points: pts.map(Math.round), len: plen(pts), danger: dg, how }, how === 'straight' ? {} : swimInfo(pts), drops.length ? { drops } : {}, extra || {});   // extra.len (field-areas-gap) overrides
}
/** SWIMMING (2026-10-13): the points of a walk inside a water zone (the server's swim check: zone box + height) -> { swim: [point index],
 *  swimLen (legs between two swim points), maxSwim (longest unbroken run of them) } or {} */
function swimInfo(pts) {
  const idx = []; for (let i = 0, k = 0; i < pts.length; i += 3, k++) if (WATER.zoneAt(pts[i], pts[i + 1], pts[i + 2])) idx.push(k);
  if (!idx.length) return {};
  let len = 0, run = 0, max = 0; const set = new Set(idx);
  for (let k = 1; k * 3 < pts.length; k++) { const d = Math.hypot(pts[k * 3] - pts[k * 3 - 3], pts[k * 3 + 1] - pts[k * 3 - 2], pts[k * 3 + 2] - pts[k * 3 - 1]); if (set.has(k)) { /* 3D (owner 2026-10-13 19:10: deep dives) */ len += d; run += d; if (run > max) max = run; } else run = 0; }   // a leg that ends in the water is swum
  return { swim: idx, swimLen: Math.round(len), maxSwim: Math.round(max) };
}
const swimExtraSec = (s) => s.swimLen ? s.swimLen / SWIM_SPEED - s.swimLen / P.walkSpeed : 0;
/** walk a -> b as steps (geodata when known); returns { steps, ok, pending, why } */
const doorCircle = (d) => ({ x: d.x, y: d.y, r: Math.round(Math.max(...d.poly.map(p => Math.hypot(p[0] - d.x, p[1] - d.y))) + 48) });
/** the doors on a walk the party cannot pass (owner / script / no opener) */
function blockedDoorsOn(pts) { const out = []; for (let i = 3; i < pts.length; i += 3) { const h = doorOnLeg({ x: pts[i - 3], y: pts[i - 2], z: pts[i - 1] }, { x: pts[i], y: pts[i + 1], z: pts[i + 2] }); if (h && doorNeed(h.d).blocked && !out.includes(h.d)) out.push(h.d); } return out; }
function walkAB(a, b, why, extra, noQueue) {
  let l = leg(a, b, why, noQueue);
  if (l.ok === true && l.how === 'geodata') {
    const bd = blockedDoorsOn(l.pts).filter(d => Math.hypot(d.x - a.x, d.y - a.y) > 300 && Math.hypot(d.x - b.x, d.y - b.y) > 300);   // never the door at the very start / end (an NPC behind it)
    if (bd.length && !(CUR_POL && CUR_POL.noWalls)) { const l2 = leg(a, b, why, noQueue, bd); if (l2.ok === true && !(l2.how === 'geodata' && blockedDoorsOn(l2.pts).some(d => bd.includes(d)))) l = Object.assign(l2, { aroundDoors: bd.map(d => d.id) }); }   // RAID ROUTES 2026-10-13: only a way that really goes around
  }
  return { steps: walkSteps(l.pts, l.how, Object.assign({}, extra || {}, l.ok === false ? { why: l.why } : {}, l.aroundDoors ? { aroundDoors: l.aroundDoors } : {}, l.pol ? { pol: l.pol } : {}, l.clr ? { clr: l.clr } : {}, l.flood ? { flood: l.flood } : {})), ok: l.ok, pending: !!l.pending, why: l.why, len: l.len };
}

// ---- conditions ----
const COND = DOORS.conditions || [];
const condFor = (o) => COND.filter(c => (o.bossId && (c.bossIds || []).includes(o.bossId)) || (o.dungeonKey && c.dungeonKey === o.dungeonKey) || (o.dungeonKind && c.dungeonKind === o.dungeonKind) || (o.bossZone && c.area === o.bossZone));
function needsOf(conds, steps, extra) {
  const n = { items: [], level: {}, skills: [], other: [] };
  const addItem = (it, why) => { if (it && it.id && !n.items.some(x => x.id === it.id && x.why === why)) n.items.push(Object.assign({ id: it.id, name: it.name || ITEMN[it.id] || '', consumed: !!it.consumed }, why ? { why } : {})); };
  for (const c of conds) {
    const q = c.need || {};
    (q.items || []).forEach(it => addItem(it, c.key));
    if (q.anyItem) n.other.push({ anyItem: q.anyItem.map(i => i.id), why: c.key, text: q.anyItem.map(i => i.name || i.id).join(' / ') });
    if (q.level) { if (q.level.min) n.level.min = Math.max(n.level.min || 0, q.level.min); if (q.level.max) n.level.max = Math.min(n.level.max || 99, q.level.max); }
    if (q.noble) n.other.push({ noble: true, why: c.key });
    if (q.sevenSigns) n.other.push({ sevenSigns: q.sevenSigns, why: c.key });
    if (q.commandChannel || q.commandChannelLeader) n.other.push({ commandChannel: q.commandChannel || true, why: c.key });
    if (q.party || q.partyLeader) n.other.push({ party: q.partyLeader ? 'leader' : true, why: c.key });
    if (q.bossState) n.other.push({ bossState: q.bossState, why: c.key });
    if (q.questCompleted) n.other.push({ quest: q.questCompleted, why: c.key });
    if (q.window) n.other.push({ window: q.window, why: c.key });
    if (q.unknown) n.other.push({ unknown: true, why: c.key });
    if (q.castleOwner) n.other.push({ castleOwner: q.castleOwner, why: c.key });
    if (q.adena) n.other.push({ adena: q.adena, why: c.key });
    if (q.serverScript) n.other.push({ serverScript: q.serverScript, why: c.key });
    if (q.manual) n.other.push({ manual: q.manual, why: c.key });
  }
  for (const s of steps.filter(s => s.do === 'need' && s.manual)) if (!n.other.some(o => o.manual === s.text)) n.other.push({ manual: s.text, why: s.condition || 'manual step' });
  for (const s of steps.filter(s => s.do === 'door')) {
    if (s.need.items && s.need.items.length) n.other.push({ anyItem: s.need.items.map(i => i.id), orUnlock: !!s.need.unlock, door: s.doorId, why: 'door ' + s.doorId, text: s.need.items.map(i => i.name || i.id).join(' / ') + (s.need.unlock ? ' or Unlock 27' : '') });
    if (s.need.anyItem && !n.other.some(o => o.door === s.doorId) && !conds.some(c => (c.doors || []).includes(s.doorId))) n.other.push({ anyItem: s.need.anyItem, door: s.doorId, why: 'door ' + s.doorId, text: s.need.anyItem.map(id => ITEMN[id] || id).join(' / ') });
    if (s.need.hellboundLevel && !n.other.some(o => o.door === s.doorId)) n.other.push({ hellboundLevel: s.need.hellboundLevel, door: s.doorId, why: 'door ' + s.doorId, text: 'Hellbound level >= ' + s.need.hellboundLevel });
    if (s.need.unlock && !s.need.items) n.skills.push({ id: 27, name: 'Unlock', why: 'door ' + s.doorId, classIds: s.need.unlock.classIds, orWait: false });
  }
  if (extra && extra.level) Object.assign(n.level, extra.level);
  if (!n.items.length) delete n.items; if (!n.skills.length) delete n.skills; if (!n.other.length) delete n.other; if (!Object.keys(n.level).length) delete n.level;
  return n;
}

// ---- route assembly ----
function finish(t, steps, meta) {
  steps = steps.filter(Boolean);
  steps.push({ do: 'arrive', target: t.key, x: t.x, y: t.y, z: t.z });
  let len = 0, sec = 0, legs = { geodata: 0, 'field-areas-gap': 0, saved: 0, 'town-graph': 0, 'dungeon-rooms': 0, 'field-areas': 0, straight: 0, adjacent: 0 }, links = { live: 0, datapack: 0, unknownTown: 0 }, maxDanger = 0, blocked = [];
  for (const s of steps) {
    if (s.do === 'walk') { len += s.len; sec += s.len / P.walkSpeed + swimExtraSec(s); legs[s.how] = (legs[s.how] || 0) + 1; maxDanger = Math.max(maxDanger, s.danger || 0); }
    else if (s.do === 'town') sec += P.townSec;
    else if (s.do === 'gk') { sec += P.gkSec; if (s.live === true) links.live++; else if (s.live === false) links.datapack++; else links.unknownTown++; }
    else if (s.do === 'floor') sec += P.floorSec;
    else if (s.do === 'enter') sec += s.wait && s.wait.sec ? Math.round(s.wait.sec / 2) : P.floorSec;
    else if (s.do === 'door') { sec += s.need.wait ? s.need.wait.expectSec : P.npcSec; if (s.need.blocked) blocked.push(s); }
  }
  const conds = (meta.conds || []).slice();
  steps.forEach(s => { const c = s.condition && COND.find(c => c.key === s.condition); if (c && !conds.includes(c)) conds.push(c); });
  const dIds = steps.filter(s => s.do === 'door').map(s => s.doorId);
  COND.filter(c => (c.doors || []).some(id => dIds.includes(id))).forEach(c => { if (!conds.includes(c)) conds.push(c); });
  const needs = needsOf(conds, steps, meta.extraNeeds);
  const flags = [];
  if (legs.straight) flags.push('unverified-walk');
  if (links.datapack) flags.push('link-not-on-live-menu');
  if (links.unknownTown) flags.push('link-unverified');
  if (steps.some(s => s.do === 'walk' && s.len > P.maxWalkBot) && meta.source !== 'saved') flags.push('long-walk');
  if (steps.some(s => s.do === 'door')) flags.push('doors');
  if (steps.some(s => s.do === 'walk' && s.swim)) flags.push('swim');                                   // SWIMMING (2026-10-13)
  if (steps.some(s => s.do === 'walk' && (s.maxSwim || 0) > 3000)) flags.push('long-swim');           // > ~60 s under water: drowning damage (1 % HP a second)
  if (steps.some(s => s.do === 'door' && s.need.wait)) flags.push('timed-door');
  // RAID ROUTE POLICY (2026-10-13)
  if (steps.some(s => s.do === 'walk' && s.drops && s.drops.length)) flags.push('drop');
  if (steps.some(s => s.do === 'walk' && (s.drops || []).some(d => d.fall > 333))) flags.push('fall-damage');
  if (steps.some(s => s.do === 'walk' && ((s.maxSwim || 0) > RPOL.breath || (s.pol && s.pol.overBreath)))) flags.push('over-breath');   // a door can cut one long swim into two short walk steps (Kenishee 2026-10-15): the policy's own overBreath counts too
  if (steps.some(s => s.do === 'walk' && s.pol && s.pol.mode === 'swim-only')) flags.push('swim-only');
  if (steps.some(s => s.do === 'walk' && s.pol && s.pol.mode === 'swim-shorter')) flags.push('swim-shorter');
  if (steps.some(s => s.do === 'walk' && s.pol)) flags.push('raid-policy');
  if (needs.items || needs.skills || needs.other || needs.level) flags.push('conditions');
  let status = 'ok';
  if (meta.unreachable) status = 'unreachable';
  else if (blocked.length) status = 'blocked';
  else if (needs.other && needs.other.some(o => o.unknown)) status = 'unreachable';
  else if (flags.includes('conditions')) status = 'conditional';
  else if (flags.includes('unverified-walk') || flags.includes('link-not-on-live-menu')) status = 'unverified';
  const why = (meta.why || []).slice(); if (EXTRA.unreachableNotes && EXTRA.unreachableNotes[t.key]) why.push('research: ' + EXTRA.unreachableNotes[t.key]);
  // OWNER DOORS AS WALLS (2026-10-13): ONE plain sentence first (the dashboard shows why[0]); the door list stays in whyDoors
  const whyDoors = blocked.map(b => `door ${b.doorId} ${b.name} (${b.kind}) at ${b.at.join(',')}: ${b.need.why || (b.need.owner ? 'owner only (' + b.need.owner + ')' : b.need.script ? 'opened only by ' + b.need.script.join('; ') : b.need.instance ? 'instance door (' + b.need.instance.join(', ') + ')' : 'blocked')}`);
  if (blocked.length) {
    const tf = isFinite(t.x) ? fortAt(t.x, t.y, t.z) : null, places = [...new Set(blocked.map(b => { const F = fortAt(b.at[0], b.at[1], b.at[2]); return F ? F.name : (b.need.owner ? b.need.owner : b.place && b.place.dungeon ? b.place.dungeon : 'a door'); }))];
    const own = blocked.every(b => b.need.owner);
    if (tf && own) { status = 'unreachable'; why.unshift(`unreachable: inside ${tf.name} (owner clan only)`); }
    else why.unshift(`no way around: the only way goes through ${places.join(', ')} — ${own ? 'only the owner clan opens those gates' : 'doors that never open for us'} (${blocked.length} door${blocked.length > 1 ? 's' : ''})`);
  }
  steps.filter(s => s.do === 'walk' && s.why).forEach(s => why.push(`walk not on the geodata from ${s.points.slice(0, 2).join(',')} (${s.why})`));
  return Object.assign({ key: t.key, type: t.type, name: t.name, target: { x: t.x, y: t.y, z: t.z, id: t.id }, status, flags, why, whyDoors: whyDoors.length ? whyDoors : undefined, source: meta.source || 'computed',
    from: (steps.find(s => s.do === 'town') || {}).cmd || null, length: Math.round(len), sec: Math.round(sec), maxDanger, needs, conditions: conds.map(c => ({ key: c.key, text: c.text, src: c.src, read: c.read })),
    verified: { legs, links }, steps }, meta.extra || {});
}
/** candidate start landings for a point outside dungeons: sorted by an estimate */
function landingCands(T, n) {
  return LANDINGS.filter(L => L.kind !== 'hub' || inServe(L.serve, T)).map(L => ({ L, est: L.cost + Math.hypot(L.x - T.x, L.y - T.y) * 1.25 / P.walkSpeed + (Math.abs((L.z || 0) - (T.z || 0)) > 2500 ? 300 : 0) - (L.kind === 'hub' ? 1e6 : 0) }))
    .filter(c => c.L.kind === 'hub' || Math.hypot(c.L.x - T.x, c.L.y - T.y) < 60000).sort((a, b) => a.est - b.est).slice(0, n || P.cand);
}
/** best open-world route to T: town / gatekeeper landing + walk. -> { steps, alt, ok, why[] } */
function fieldRoute(T, label) {
  const cs = landingCands(T, P.cand);
  const opts = []; let queued = false;
  for (const c of cs) {
    const pre = stepsToLanding(c.L); if (!pre) continue;
    const w = walkAB(c.L, T, label, undefined, queued);          // lazy: one uncomputed candidate per run (the next one only when it fails)
    if (w.pending) queued = true;
    const swimPen = CUR_POL ? w.steps.reduce((a, s) => a + (s.do === 'walk' ? (s.swimLen || 0) * (RPOL.swimCost - 1) : 0), 0) / P.walkSpeed : 0;   // RAID ROUTE POLICY: a swimming landing only when no dry one is near as good
    const cost = c.L.cost + (w.ok === false ? w.len * 3 : w.len) / P.walkSpeed + swimPen + (w.steps.some(s => s.do === 'door' && s.need.blocked) ? 1e6 : 0);
    opts.push({ steps: pre.concat(w.steps), cost, ok: w.ok, pending: w.pending, why: w.why, L: c.L, len: w.len });
  }
  opts.forEach((o, i) => { o.rank = i; });
  opts.sort((a, b) => (a.ok === false) - (b.ok === false) || (a.ok === true && b.ok === true ? a.cost - b.cost : a.rank - b.rank));
  return opts;
}

// ---- town graph walks (Dijkstra arrival -> npc vertex) ----
const TGC = {};
function townGraph(tk) {
  const k = TG_KEY[tk]; if (!k) return null;
  if (TGC[k] !== undefined) return TGC[k];
  const g = tryJ(path.join(DATA, 'town_graph', k + '.json'), null); if (!g) return (TGC[k] = null);
  const adj = g.v.map(() => []);
  g.e.forEach((e, i) => { adj[e[0]].push([e[1], e[2], i, false]); adj[e[1]].push([e[0], e[2], i, true]); });
  const eBlocked = g.e.map(e => { const mids = e[4] || []; const p = [g.v[e[0]][1], g.v[e[0]][2], g.v[e[0]][3]].concat(mids, [g.v[e[1]][1], g.v[e[1]][2], g.v[e[1]][3]]); return blockedDoorsOn(p).length > 0; });
  return (TGC[k] = { g, adj, eBlocked });
}
function townWalk(tk, from, npc, withDoors) {
  const G = townGraph(tk); if (!G) return null;
  const { g, adj, eBlocked } = G;
  if (!withDoors) { const r = townWalk(tk, from, npc, 'skip'); if (r) return r; return townWalk(tk, from, npc, true); }
  const skipBlocked = withDoors === 'skip';
  const ni = Object.entries(g.npcs || {}).filter(([key]) => +key.split('@')[0] === npc.id).map(([key, i]) => { const [x, y] = key.split('@')[1].split(',').map(Number); return { i, d: Math.hypot(x - npc.x, y - npc.y) }; }).sort((a, b) => a.d - b.d)[0];
  if (!ni || ni.d > 600) return null;
  let src = -1, bd = 1e9; g.v.forEach((v, i) => { if (v[5] === 'arrive' || v[5] === 'street') { const d = Math.hypot(v[1] - from.x, v[2] - from.y); if (d < bd) { bd = d; src = i; } } });
  if (src < 0) return null;
  const dist = new Float64Array(g.v.length).fill(Infinity), prev = new Int32Array(g.v.length).fill(-1), pe = new Int32Array(g.v.length).fill(-1), rev = new Uint8Array(g.v.length), done = new Uint8Array(g.v.length);
  dist[src] = 0;
  for (;;) { let u = -1, m = Infinity; for (let i = 0; i < dist.length; i++) if (!done[i] && dist[i] < m) { m = dist[i]; u = i; } if (u < 0 || u === ni.i) break; done[u] = 1; for (const [v, w, ei, r] of adj[u]) if (!(skipBlocked && eBlocked[ei]) && dist[u] + w < dist[v]) { dist[v] = dist[u] + w; prev[v] = u; pe[v] = ei; rev[v] = r ? 1 : 0; } }
  if (!isFinite(dist[ni.i])) return null;
  const chain = []; for (let v = ni.i; v !== src; v = prev[v]) chain.push(v); chain.reverse();
  const pts = [from.x, from.y, from.z, g.v[src][1], g.v[src][2], g.v[src][3]];
  for (const v of chain) { const e = g.e[pe[v]], mids = e[4] || []; const M = []; for (let i = 0; i < mids.length; i += 3) M.push([mids[i], mids[i + 1], mids[i + 2]]); if (rev[v]) M.reverse(); M.forEach(p => pts.push(p[0], p[1], p[2])); pts.push(g.v[v][1], g.v[v][2], g.v[v][3]); }
  return { pts, len: plen(pts) };
}

// ---- dungeons ----
const dKeyOf = (name) => (DROOMS.find(d => d.name === name) || {}).key;
const dungeonOf = (x, y, z, loose) => {
  for (const d of DROOMS) { const b = d.bbox; if (!Array.isArray(b) || x < b[0] - 600 || x > b[1] + 600 || y < b[2] - 600 || y > b[3] + 600) continue; const fi = (d.floors || []).findIndex(F => Array.isArray(F.z) && z >= F.z[0] - 300 && z <= F.z[1] + 300); if (fi >= 0) return { d, fi }; }
  if (loose) for (const d of DROOMS) { const b = d.bbox; if (!Array.isArray(b) || x < b[0] || x > b[1] || y < b[2] || y > b[3]) continue; const F = (d.floors || []).map((F, i) => ({ i, dz: Array.isArray(F.z) ? Math.min(Math.abs(z - F.z[0]), Math.abs(z - F.z[1])) : 1e9 })).sort((p, q) => p.dz - q.dz)[0]; if (F && F.dz < 2600 && d.floors.length > 1) return { d, fi: F.i, beyond: true }; }
  return null;
};
/** steps to any point: inside a dungeon via its floors, else the best town / gatekeeper landing + walk */
function routeToPoint(T2, label) {
  const dg = dungeonOf(T2.x, T2.y, T2.z, true);
  if (dg) {
    const inn = dungeonIn(dg.d, dg.fi);
    // CAVEFALLBACK 2026-10-14: a dungeon with NO known way in (Devil's Isle caves, built from the geodata at 11:55 without an entrance) must not make
    // its bosses unreachable: the outdoor route (landing + walk / swim, as before the cave was mapped) is used, the reason kept as a note
    if (!inn.ok && inn.why.some(w => /^no way in known/.test(w))) { const o = fieldRoute(T2, label); if (o.length) return { ok: true, steps: o[0].steps, conds: [], why: inn.why.map(w => w + ' — using the outdoor route'), alt: o[1] ? summarize(o[1].steps) : null, at: T2 }; }
    if (!inn.ok) return { ok: false, why: inn.why, steps: inn.steps, conds: inn.conds };
    let s = inn.steps; const st = inn.at || floorStart(dg.d.floors[dg.fi]);
    if (st) s = s.concat(walkAB(st, T2, label, { graph: `dungeon_graph/${dg.d.key}.json` }).steps);
    return { ok: true, steps: s, conds: inn.conds, why: inn.why.concat(dg.beyond ? [`${label} lies beyond the mapped floors of ${dg.d.name} (nearest: ${dg.d.floors[dg.fi].name})`] : []), dungeon: dg.d, at: T2 };
  }
  const o = fieldRoute(T2, label); if (!o.length) return { ok: false, why: ['no town / gatekeeper landing within 60k'], steps: [], conds: [] };
  return { ok: true, steps: o[0].steps, conds: [], why: [], alt: o[1] ? summarize(o[1].steps) : null, at: T2 };
}
const dEntryRoute = (d) => { const r = tryJ(path.join(DATA, 'routes', 'dungeons', String(d.key || d.name).replace(/[^A-Za-z0-9_-]+/g, '_') + '.json'), null); return r && Array.isArray(r.points) && r.points.length > 1 ? r : null; };
const floorStart = (F) => F.enter && Array.isArray(F.enter.landing) ? pt(F.enter.landing) : F.entryPoint && Array.isArray(F.entryPoint.at) ? pt(F.entryPoint.at) : ((F.rooms || []).find(r => r.route && r.route.length) ? pt(F.rooms.find(r => r.route && r.route.length).route[0]) : null);
const dungeonKind = (d) => /necropolis/i.test(d.name) ? 'necropolis' : /catacomb/i.test(d.name) ? 'catacomb' : null;
/** steps from a town to the start of floor fi of dungeon d. -> { steps, at, conds, why[], ok } */
function dungeonIn(d, fi) {
  const F0 = d.floors[0] || {}, en = F0.enter || {}, why = [], conds = condFor({ dungeonKey: d.key, dungeonKind: dungeonKind(d) });
  const g = Object.assign({}, d.gatekeeperRoute || {});
  if (!g.destination) { const k = Object.keys(DUNGEON_GK).find(n => String(d.name).toLowerCase().startsWith(n)); if (k) { g.town = g.town || DUNGEON_GK[k][0]; g.destination = DUNGEON_GK[k][1]; } }
  const tk = tkOf(g.town);
  let steps = [], at = null, ok = true, source = 'computed';
  const er = dEntryRoute(d);
  if (en.how === 'ziggurat') {
    const l = tk && (GKL[tk] || []).find(x => gkNorm(x.dest) === gkNorm(g.destination));
    const N0 = en.npc || {};
    if ((!tk || !l) && N0.x) {
      const o = fieldRoute(pt([N0.x, N0.y, N0.z]), `${d.name} ziggurat`)[0];
      if (o) { steps = o.steps; why.push(`no town gatekeeper link to ${d.name}: nearest landing + walk to its Gatekeeper Ziggurat`); steps.push({ do: 'enter', how: 'ziggurat', dungeon: d.name, catacomb: en.catacomb || d.name, npc: { id: N0.id, name: N0.name, x: N0.x, y: N0.y, z: N0.z }, link: N0.link || 'Teleport', landing: en.landing, sevenSigns: dungeonKind(d) }); at = pt(en.landing || [N0.x, N0.y, N0.z]); }
      else { why.push(`no town gatekeeper link to ${d.name} and no landing near its ziggurat`); ok = false; }
    } else if (!tk || !l) { why.push(`no town gatekeeper link to ${d.name} (dungeon_rooms gatekeeperRoute: ${g.town || '-'} -> ${g.destination || '-'})`); ok = false; }
    else {
      steps = stepsToTown(tk).concat([gkStep(l)]);
      const N = en.npc || {};
      const w = N.x ? walkAB(pt([l.x, l.y, l.z]), pt([N.x, N.y, N.z]), `${d.name} ziggurat`) : { steps: [] };
      steps = steps.concat(w.steps);
      steps.push({ do: 'enter', how: 'ziggurat', dungeon: d.name, catacomb: en.catacomb || d.name, npc: N.id ? { id: N.id, name: N.name, x: N.x, y: N.y, z: N.z } : null, link: N.link || 'Teleport', landing: en.landing, sevenSigns: dungeonKind(d) });
      at = pt(en.landing || [N.x, N.y, N.z]);
    }
  } else if (er) {
    const st = er.start || {}; source = 'saved';
    if (st.kind === 'town' && st.town) steps = stepsToTown(tkOf(st.town) || st.town) || [];
    else if (st.kind === 'gk' && st.desc) { const fk = tkOf(String(st.from || st.desc.split('->')[0]).trim()); const l = fk && (GKL[fk] || []).find(x => x.desc === String(st.desc).trim()); if (l) steps = stepsToTown(fk).concat([gkStep(l)]); else why.push(`saved entry route start ${st.desc} not in the datapack links`); }
    steps = steps.concat(walkSteps(flat(er.points), 'saved', { manual: !!er.manual, file: `routes/dungeons/${d.key}.json` }));
    at = pt(er.points[er.points.length - 1]);
  } else if (en.how === 'teleporter' && g.town && !g.destination && TOWN_CMD[tk]) {
    // a teleporter NPC reached from a town (Pagan Temple: .rune + Triol's Mirror)
    steps = stepsToTown(tk); const N = en.npc || {}; const tl = TOWNPOS[tk];
    if (N.x && tl) steps = steps.concat(walkAB(tl, pt([N.x, N.y, N.z]), `${d.name} teleporter`).steps);
    at = null;
  } else if (tk && g.destination) {
    const l = (GKL[tk] || []).find(x => gkNorm(x.dest) === gkNorm(g.destination) || gkNorm(GK_ALIAS[gkNorm(x.dest)] || x.dest) === gkNorm(g.destination)) || (Array.isArray(g.landing) ? { from: tk, desc: `${tk} -> ${g.destination}`, dest: g.destination, x: g.landing[0], y: g.landing[1], z: g.landing[2], price: g.price || 0 } : null);
    if (!l) { why.push(`no link ${tk} -> ${g.destination}`); ok = false; }
    else {
      steps = stepsToTown(tk).concat([gkStep(l)]);
      const door = Array.isArray(en.from) ? pt(en.from) : (d.entrance && isFinite(d.entrance.x) ? { x: d.entrance.x, y: d.entrance.y, z: d.entrance.z } : null);
      if (door) steps = steps.concat(walkAB(pt([l.x, l.y, l.z]), door, `${d.name} door`).steps);
      at = door;
    }
  } else { why.push(`no way in known for ${d.name} (no gatekeeper link, no saved entry route)`); ok = false; }
  if (!ok) return { steps, at, conds, why, ok, source };
  // floors 0..fi
  for (let i = 0; i <= fi && i < d.floors.length; i++) {
    const F = d.floors[i], E = F.enter || {};
    if (i === 0 && en.how === 'ziggurat') { at = floorStart(F) || at; continue; }
    if (E.how === 'teleporter' && E.npc) {
      const N = E.npc;
      if (at && Math.hypot(at.x - N.x, at.y - N.y) > 150) steps = steps.concat(walkAB(at, pt([N.x, N.y, N.z]), `${d.name} ${F.name} teleporter`).steps);
      steps.push({ do: 'floor', dungeon: d.name, dungeonKey: d.key, floor: i, floorName: F.name, npc: { id: N.id, name: N.name, x: N.x, y: N.y, z: N.z }, link: N.link || null, landing: E.landing || null, needs: E.needs || undefined, verified: !!E.verified });
      at = floorStart(F) || at;
    } else if (E.how === 'walk' || E.how === 'stairs') {
      const to = floorStart(F);
      if (i > 0 && E.how === 'stairs' && Array.isArray(E.from)) { if (at) steps = steps.concat(walkAB(at, pt(E.from), `${d.name} to the stairs of ${F.name}`, { graph: `dungeon_graph/${d.key}.json` }).steps); at = pt(E.from); }
      if (to && at && Math.hypot(to.x - at.x, to.y - at.y) > 150 && i > 0) { steps = steps.concat(walkAB(at, to, `${d.name} ${F.name}`, { graph: `dungeon_graph/${d.key}.json` }).steps); }
      if (to && i > 0) at = to; else if (!at) at = to;
    }
  }
  // Pagan Temple: the outer hall -> the temple gate (Temple Gatekeeper 32034) is part of the room routes; the marks are conditions
  return { steps, at, conds, why, ok, source };
}

// =============================================================================================================================== TARGETS
const T = [];
const want = (type) => !ONLY || ONLY.includes(type);
// raid / grand / epic bosses
const routeFile = (id) => tryJ(path.join(DATA, 'routes', 'raid', `${id}.json`), null);
const RSTORE = require(path.join(ROOT, 'Dashboard', 'routestore.js'));   // ROUTESWITCH 2026-10-13: floorCheck / segments of saved routes (same rules as swarm.js)
// --keys raid:25395,npc:...  (ROUTESWITCH 2026-10-13): plan ONLY these targets and merge them into the existing type files + index (every other
// route stays as it is; the per-target files are rewritten by nav_atlas_split.js only where they changed). Without --keys: the whole atlas.
const KEYS = argv('--keys', '') ? argv('--keys', '').split(/,(?=\s*[a-z]+:)/i)   // npc keys hold a comma (npc:31321@38368,-46912): split only before the next '<type>:' (2026-10-13)
    .map(x => x.trim()).filter(Boolean) : null;
if (want('raid')) for (const b of RAIDS) {
  T.push({ key: `raid:${b.id}`, type: (b.type === 'raid' ? 'raid' : 'epic'), id: b.id, name: b.name, x: b.x, y: b.y, z: b.z, level: b.level, boss: b, epic: EPIC[b.id] || null });
}
// NPCs with a role (not plain npc / guard) or a quest
if (want('npc')) for (const n of ATLAS) {
  const roles = (n.roles || []).filter(r => r !== 'npc' && r !== 'guard');
  if (!roles.length && !(n.quests || []).length) continue;
  T.push({ key: `npc:${n.id}@${Math.round(n.x)},${Math.round(n.y)}`, type: 'npc', id: n.id, name: n.name, title: n.title, x: n.x, y: n.y, z: n.z, roles: roles.length ? roles : ['quest'], npc: n });
}
if (want('area')) for (const r of FAREAS.regions || []) for (const a of r.areas || []) T.push({ key: `area:${a.id}`, type: 'area', id: a.id, name: a.name, x: a.center[0], y: a.center[1], z: a.center[2], area: a, region: r });
if (want('room')) for (const d of DROOMS) (d.floors || []).forEach((F, fi) => (F.rooms || []).forEach(r => T.push({ key: `room:${r.id}`, type: 'room', id: r.id, name: `${d.name}: ${r.name}`, x: r.center[0], y: r.center[1], z: r.center[2], room: r, d, fi })));
if (want('dungeon')) for (const d of DROOMS) { const F = d.floors[0] || {}; const s = floorStart(F) || (d.entrance && isFinite(d.entrance.x) ? d.entrance : null); if (s) T.push({ key: `dungeon:${d.key}`, type: 'dungeon', id: d.key, name: d.name, x: s.x, y: s.y, z: s.z, d, fi: 0 }); }

if (KEYS) { const keep = T.filter(t => KEYS.includes(t.key)); T.length = 0; T.push(...keep); console.log(`nav_atlas: --keys: planning ${T.length} of ${KEYS.length} key(s)`); }   // ROUTESWITCH 2026-10-13
// instance bosses: where the entry NPC stands (conditions[].via)
const INST_VIA = {}, INST_COND = {}; COND.forEach(c => (c.bossIds || []).forEach(id => { if (c.via) { INST_VIA[id] = Array.isArray(c.via) ? c.via[0] : c.via; INST_COND[id] = c; } }));
const BZ = (DOORS.bossZones || []);
const inPoly = (x, y, Pp) => { let c = false; for (let i = 0, j = Pp.length - 1; i < Pp.length; j = i++) { if (((Pp[i][1] > y) !== (Pp[j][1] > y)) && (x < (Pp[j][0] - Pp[i][0]) * (y - Pp[i][1]) / (Pp[j][1] - Pp[i][1]) + Pp[i][0])) c = !c; } return c; };
const bossZoneAt = (x, y, z) => BZ.find(zn => zn.enabled && zn.poly.length > 2 && z >= zn.zMin - 200 && z <= zn.zMax + 200 && inPoly(x, y, zn.poly));

function planTarget(t) {
  if ((t.type === 'raid' || t.type === 'epic') && !has('--no-raid-policy')) {
    const ref = Math.max(1, Math.round(Number(t.level) || 50));
    CUR_POL = { ref, walls: new Set() };
    let out; try { out = planTarget0(Object.assign({}, t)); } finally { }
    // FORTRESS GATES (owner 2026-10-13 19:10: unknown whether the gates are open without an owner on L2Toggle -> walls by default; the way through
    // them is kept as fortressAlt for the opt-in party rule "try fortress gates", with one plain note)
    const walls = [...CUR_POL.walls];
    if (walls.length && out && out[0]) {
      CUR_POL = { ref, noWalls: true };
      let alt = null; try { alt = planTarget0(Object.assign({}, t))[0]; } catch (e) { alt = null; }
      const m = out[0];
      if (alt && alt.steps && alt.steps.length && (/unreachable|blocked/.test(m.status) || alt.length < m.length - 2000)) {
        m.fortressAlt = { fort: walls.join(', '), steps: alt.steps, length: alt.length, sec: alt.sec, status: alt.status };
        const km = (u) => (Math.round(u / 100) / 10) + ' km';
        m.why = (m.why || []).concat([/unreachable|blocked/.test(m.status) ? `the way through ${walls.join(', ')} (${km(alt.length)}) needs its gates open — if they are open on your server, set the party rule "Try fortress gates"` : `goes around ${walls.join(', ')}; if its gates are open on your server, set the party rule "Try fortress gates" to use the ${km(m.length - alt.length)} shorter way`]);
        m.flags = (m.flags || []).concat(['fortress-alt']);
      }
    }
    CUR_POL = null;
    return out;
  }
  // TALK SPOTS (2026-10-13 datafix): an NPC that stands on a fenced platform / behind a counter is a closed pocket on the geodata (Rune guild:
  // Innocentin, Kayan ...): the walk ends at its talk spot (nav_atlas_extra.json npcTalkSpots, docs/plan/tools/npc_talk_spots.js: the nearest
  // open cell within talking range); the arrive step keeps the NPC's own position + talkFrom
  const ts = t.type === 'npc' && EXTRA.npcTalkSpots && EXTRA.npcTalkSpots[t.key];
  if (ts && Array.isArray(ts.at)) {
    const out = planTarget0(Object.assign({}, t, { x: ts.at[0], y: ts.at[1], z: ts.at[2] }));
    (out || []).forEach(m => { const a = m && m.steps && m.steps.find(s => s.do === 'arrive'); if (a) Object.assign(a, { x: t.x, y: t.y, z: t.z, talkFrom: ts.at.slice(0, 3) }); if (m && m.target) Object.assign(m.target, { x: t.x, y: t.y, z: t.z }); });
    return out;
  }
  return planTarget0(t);
}
function planTarget0(t) {
  const why = [];
  const wv = EXTRA.walkVia && EXTRA.walkVia[t.key];
  if (wv) {
    const tk = tkOf(wv.town), pre = tk && stepsToTown(tk), from = tk && (TOWN_CMD[tk] ? TOWNPOS[tk] : villageLanding(tk));
    if (pre && from) {
      let s = pre.slice(), cur = from;
      for (const q of wv.points) { const p = { x: q[0], y: q[1], z: q[2] }; if (q[3] === 'drop') s.push(mkWalk([cur.x, cur.y, cur.z, p.x, p.y, p.z], 'straight', { drop: true, note: 'one-way drop from a ledge (geodata step > 48)' })); else s.push(...walkAB(cur, p, t.name).steps); cur = p; }
      s.push(...walkAB(cur, t, t.name).steps);
      return [finish(t, s, { why: [`walkVia (nav_atlas_extra.json, ${wv.read}): ${wv.src}`], source: 'walkVia' })];
    }
  }
  // ---- raid / epic ----
  if (t.type === 'raid' || t.type === 'epic') {
    const b = t.boss, conds = condFor({ bossId: b.id });
    const extra = { extra: { level: b.level, curseLevel: b.curseLevel || null, bossType: b.type } };
    const bz = isFinite(b.x) ? bossZoneAt(b.x, b.y, b.z) : null; if (bz) conds.push(...condFor({ bossZone: bz.name }).filter(c => !conds.includes(c)));
    if (b.id === 29028) { // Valakas: the raid list position is the regeneration spot; the lair is behind Klein + Heart of Volcano
      const v = INST_VIA[29028]; t.x = 212852; t.y = -114842; t.z = -1632; why.push('Valakas: raidbosses_h5.json position (-105200,-253104) is the script\'s regeneration spot; the lair (212852,-114842,-1632) is used');
      const klein = COND.find(c => c.key === 'valakas-hall'), heart = COND.find(c => c.key === 'valakas-lair');
      const r = fieldRoute(pt([klein.via.x, klein.via.y, klein.via.z]), 'Klein');
      if (!r.length) return [finish(t, [], Object.assign({ conds, why: why.concat('no route to Klein 31540'), unreachable: true }, extra))];
      const hv = heart.via;
      const s = r[0].steps.concat([{ do: 'enter', how: 'bosszone', npc: { id: klein.via.npcId, name: klein.via.npc, x: klein.via.x, y: klein.via.y, z: klein.via.z }, landing: klein.landing, items: [7267], why: 'valakas-hall' }],
        walkAB(pt(klein.landing), pt([hv.x, hv.y, hv.z]), 'Heart of Volcano').steps, [{ do: 'enter', how: 'bosszone', npc: { id: hv.npcId, name: hv.npc, x: hv.x, y: hv.y, z: hv.z }, landing: heart.landing, why: 'valakas-lair' }]);
      return [finish(t, s, Object.assign({ conds, why }, extra))];
    }
    const be = COND.find(c => c.bossEntry && (c.bossIds || []).includes(b.id) && c.via && isFinite(c.via.x));
    if (be) {
      const v = be.via, r = routeToPoint(pt([v.x, v.y, v.z]), v.npc);
      if (!r.ok) return [finish(t, r.steps, Object.assign({ conds: conds.concat(r.conds), why: r.why, unreachable: true }, extra))];
      let s = r.steps.concat([{ do: 'enter', how: 'bosszone', npc: { id: v.npcId, name: v.npc, x: v.x, y: v.y, z: v.z }, link: be.link || null, landing: be.landing || null, condition: be.key }]);
      const from = be.landing ? pt(be.landing) : pt([v.x, v.y, v.z]);
      s = s.concat(walkAB(from, t, b.name).steps);
      return [finish(t, s, Object.assign({ conds: conds.concat(r.conds.filter(c => !conds.includes(c))), why: why.concat(r.why, [`${b.name}: entry through ${v.npc} ${v.npcId} (${be.src})`]) }, extra))];
    }
    const ep = t.epic && t.epic.route && (t.epic.route.steps || []).filter(x => x.do === 'link' && x.npc && isFinite(x.npc.x));
    if (ep && ep.length) {
      const f = ep[0].npc, r = routeToPoint(pt([f.x, f.y, f.z]), f.name);
      if (r.ok) {
        let s = r.steps, at = null;
        for (const L of ep) { const N = pt([L.npc.x, L.npc.y, L.npc.z]); if (at) s = s.concat(walkAB(at, N, L.npc.name).steps); s.push({ do: 'floor', dungeon: r.dungeon ? r.dungeon.name : null, dungeonKey: r.dungeon ? r.dungeon.key : null, npc: { id: L.npc.id, name: L.npc.name, x: L.npc.x, y: L.npc.y, z: L.npc.z }, link: L.link, landing: L.land || null, source: 'epic_tactics.json' }); at = L.land ? pt(L.land) : N; }
        s = s.concat(walkAB(at, t, b.name).steps);
        const rooms = (t.epic.route.steps || []).filter(x => x.do === 'room').map(x => x.room);
        return [finish(t, s, Object.assign({ conds: conds.concat(r.conds.filter(c => !conds.includes(c))), why: why.concat(r.why, [`epic_tactics.json route (${ep.map(x => x.npc.name).join(' > ')})${rooms.length ? '; rooms cleared on the way: ' + rooms.join(', ') : ''}`]), source: 'epic_tactics' }, extra))];
      }
    }
    if (!isFinite(b.x) || b.x === null || b.zoneName === 'instance' || b.instance || (b.x === 0 && b.y === 0)) {
      const v = INST_VIA[b.id];
      if (!v || !isFinite(v.x)) return [finish(t, [], Object.assign({ conds, why: [`${b.name}: instance / no position in the datapack spawn list and no entry NPC known`], unreachable: true }, extra))];
      const tt = Object.assign({}, t, { x: v.x, y: v.y, z: v.z });
      const r = fieldRoute(tt, `${b.name} entry NPC`);
      if (!r.length) return [finish(t, [], Object.assign({ conds, why: ['no landing near the entry NPC'], unreachable: true }, extra))];
      const ic = INST_COND[b.id] || {};
      const s = r[0].steps.concat([Object.assign({ do: 'enter', how: 'instance', npc: { id: v.npcId, name: v.npc, x: v.x, y: v.y, z: v.z }, boss: b.name, conditions: conds.map(c => c.key) }, ic.link ? { link: ic.link } : {}, Array.isArray(ic.landing) ? { landing: ic.landing } : {})]);
      return [finish(Object.assign({}, t, { x: v.x, y: v.y, z: v.z }), s, Object.assign({ conds, why: [`instance boss: the route ends at its entry NPC ${v.npc} (${v.npcId})`] }, extra))];
    }
    // saved route (user / recorded) wins
    let sr = routeFile(b.id);
    // ROUTESWITCH 2026-10-13 (DUNGEON STEPS, user: "Archon Suscepter is on floor 1 of Cruma Tower. But our road is showing a path outside"): a saved
    // route that jumps floors (two points > 1500 apart in height with no dungeon / floor step: Archon 25395 surface -3440 -> boss -11900) is not
    // used (the file stays: the user decides); the boss is planned the computed way (inside a dungeon: town > gk > walk > entry NPC > floor > walk)
    const srCheck = sr ? RSTORE.floorCheck(sr) : { ok: true };
    if (sr && !srCheck.ok) { why.push(`saved route routes/raid/${b.id}.json not used: ${srCheck.why} — fix it on the dashboard (add the dungeon step)`); extra.extra.savedInvalid = { file: `routes/raid/${b.id}.json`, manual: !!sr.manual, why: srCheck.why }; sr = null; }
    // RAID ROUTE POLICY (2026-10-13): only a LOCKED own route (or one the dashboard set to 'custom') wins over the computed one; an unlocked saved
    // route (a recording of a run, a computed copy) is kept as the alternative and the computed route follows the raid rules (dry, centre, drops)
    // (the bots' raid travel itself takes a LOCKED own route first — raidRouteUseFloors / rsChoice — so the atlas keeps the COMPUTED route for the
    // route switch's "computed path" and records the saved one here: savedLocked / savedUnlocked)
    if (sr && CUR_POL) { extra.extra[(sr.manual || sr.use === 'custom') ? 'savedLocked' : 'savedUnlocked'] = { file: `routes/raid/${b.id}.json`, manual: !!sr.manual, use: sr.use || 'auto', uses: sr.uses || 0, fails: sr.fails || 0, points: (sr.points || []).length, check: sr.check || null }; sr = null; }
    if (sr && Array.isArray(sr.points) && sr.points.length > 1) {
      const st = sr.start || (sr.landing && sr.landing !== 'walking' ? { kind: 'gk', desc: sr.landing } : null);
      let pre = null;
      if (st && st.kind === 'town') pre = stepsToTown(tkOf(st.town) || st.town);
      else if (st && st.kind === 'gk' && st.desc) { const fk = tkOf(String(st.from || st.desc.split('->')[0]).trim()); const l = fk && (GKL[fk] || []).find(x => gkNorm(x.desc) === gkNorm(st.desc) || gkNorm(x.dest) === gkNorm(st.desc.split('->').pop())); if (l) pre = stepsToTown(fk).concat([gkStep(l)]); }
      if (pre) {
        // DUNGEON STEPS: the saved route in segments: its points (saved walks) and its dungeon / floor steps (the atlas 'floor' step)
        const plainPts = sr.points.filter(p => p && isFinite(p.x) && isFinite(p.y)), last = plainPts[plainPts.length - 1];
        let s = pre.slice();
        RSTORE.segments(sr).forEach(sg => {
          if (sg.pts) { if (sg.pts.length > 1) s = s.concat(walkSteps(flat(sg.pts), 'saved', { manual: !!sr.manual, file: `routes/raid/${b.id}.json` })); return; }
          const e = sg.step, d = DROOMS.find(x => x.key === e.dungeonKey || x.name === e.dungeon), F = d && d.floors[Number(e.floor)], E = (F && F.enter) || {}, N = E.npc || e.npc || null;
          s.push({ do: 'floor', dungeon: d ? d.name : e.dungeon, dungeonKey: d ? d.key : (e.dungeonKey || null), floor: Number(e.floor), floorName: F ? F.name : e.floorName || null, npc: N ? { id: N.id, name: N.name, x: N.x, y: N.y, z: N.z } : null, link: (N && N.link) || e.link || null, landing: E.landing || e.landing || null, needs: E.needs || undefined, verified: !!E.verified, saved: true });
        });
        if (Math.hypot(last.x - b.x, last.y - b.y) > 1500) s = s.concat(walkAB(pt(last), t, b.name).steps);
        const alt = (() => { const o = fieldRoute(t, b.name)[0]; return o ? summarize(o.steps) : null; })();
        return [finish(t, s, Object.assign({ conds, why, source: 'saved', extra: Object.assign(extra.extra, { saved: { file: `routes/raid/${b.id}.json`, manual: !!sr.manual, uses: sr.uses || 0, fails: sr.fails || 0 }, alt }) }))];
      }
      why.push(`saved route routes/raid/${b.id}.json has no usable start (${JSON.stringify(st || null)})`);
    }
    const dg = dungeonOf(b.x, b.y, b.z);
    if (dg) {
      // CAVEFALLBACK 2026-10-14: a dungeon with no known way in (Devil's Isle caves) -> the outdoor route as before the cave was mapped
      const inn0 = dungeonIn(dg.d, dg.fi);
      if (inn0.ok || !inn0.why.some(w => /^no way in known/.test(w))) return [dungeonTarget(t, dg.d, dg.fi, conds, why, extra)];
      why.push(...inn0.why.map(w => w + ' — using the outdoor route'));
    }
    return [fieldFinish(t, fieldRoute(t, b.name), Object.assign({ conds, why }, extra))];
  }
  // ---- npc ----
  if (t.type === 'npc') {
    const n = t.npc, pl = n.place || {};
    if (pl.dungeon) { const d = DROOMS.find(x => x.name === pl.dungeon); if (d) return [dungeonTarget(t, d, Math.max(0, pl.floorIdx || 0), [], why, {})]; }
    const tk = pl.town ? townKeyOfPlace(pl.town) : null;
    if (tk && !pl.dungeon) {
      const pre = stepsToTown(tk), from = TOWN_CMD[tk] ? TOWNPOS[tk] : villageLanding(tk);
      if (pre && from) {
        const tw = townWalk(tk, from, n);
        if (tw) return [finish(t, pre.concat(walkSteps(tw.pts, 'town-graph', { graph: `town_graph/${TG_KEY[tk]}.json` })), { why })];
        return [finish(t, pre.concat(walkAB(from, t, n.name).steps), { why: why.concat(`not in the town graph of ${pl.town}: geodata walk`) })];
      }
    }
    return [fieldFinish(t, fieldRoute(t, n.name), { why })];
  }
  // ---- field area ----
  if (t.type === 'area') {
    const a = t.area, e = a.entry;
    if (!e) return [fieldFinish(t, fieldRoute(t, a.name), { why: [`field_areas.json: ${a.unreachable || 'no entry'} — tried the nearest landings on the geodata`], extra: { levelRange: a.levelRange, region: t.region.name } })];
    let pre = null;
    if (e.kind === 'town') { const tk = tkOf(e.town) || tkOf(e.to) || tkOf(e.from); pre = tk ? stepsToTown(tk) : null; }
    else if (tkOf(e.to)) pre = stepsToTown(tkOf(e.to));
    else { const fk = tkOf(e.from); const l = fk && (GKL[fk] || []).find(x => x.desc === e.desc) || (fk ? { from: fk, desc: e.desc, dest: e.to, x: e.landing[0], y: e.landing[1], z: e.landing[2], price: e.price || 0 } : null); if (l) pre = (stepsToTown(fk) || []).concat([gkStep(l)]); }
    if (!pre) return [finish(t, [], { why: [`entry ${e.desc || e.from} has no town start`], unreachable: true })];
    let s = pre; const land = pt(e.landing), r0 = e.route && e.route.length ? pt(e.route[0]) : null;
    if (r0 && Math.hypot(r0.x - land.x, r0.y - land.y) > 300) {
      // field_areas.js walked landing -> area on its own floor graph (a.reachable, e.walk) but stores only the route's last part: the gap is
      // reachable (read from field_areas.json), its points are not stored -> the bot's own walker (walkTo) covers it; unreachable areas: geopath
      const rl = plen(flat(e.route)), gap = Math.round(Math.hypot(r0.x - land.x, r0.y - land.y));
      if (a.reachable) s.push(mkWalk([land.x, land.y, land.z, r0.x, r0.y, r0.z], 'field-areas-gap', { len: Math.max(gap, (e.walk || 0) - rl), note: 'field_areas.js floor graph: reachable, walk ' + e.walk + ' (points not stored)' }));
      else s = s.concat(walkAB(land, r0, a.name).steps);
    }
    if (e.route && e.route.length > 1) s = s.concat(walkSteps(flat(e.route), 'field-areas'));
    else s = s.concat(walkAB(land, t, a.name).steps);
    return [finish(t, s, { why: a.reachable ? why : why.concat(a.unreachable || `field_areas.js: not reachable within its walk limit (walk ${e.walk})`), source: 'field_areas', extra: { levelRange: a.levelRange, region: t.region.name } })];
  }
  // ---- room / dungeon ----
  if (t.type === 'room' || t.type === 'dungeon') return [dungeonTarget(t, t.d, t.fi, [], why, {})];
  return [];
}
function dungeonTarget(t, d, fi, conds0, why, extra) {
  const inn = dungeonIn(d, fi);
  const conds = conds0.concat(inn.conds.filter(c => !conds0.includes(c)));
  if (!inn.ok) return finish(t, inn.steps, Object.assign({ conds, why: why.concat(inn.why), unreachable: true }, extra));
  let s = inn.steps; const F = d.floors[fi] || {};
  // DUNGEON_NEEDS (swarm.js): the item an area of the dungeon needs (Pagan Temple marks)
  // (the Pagan Temple marks of swarm.js DUNGEON_NEEDS come in through the door steps: the gates on a room route -> conditions with doors[])
  if (t.type === 'room' && t.room.route && t.room.route.length > 1) {
    const r0 = pt(t.room.route[0]);
    if (inn.at && Math.hypot(inn.at.x - r0.x, inn.at.y - r0.y) > 300) s = s.concat(walkAB(inn.at, r0, t.name, { graph: `dungeon_graph/${d.key}.json` }).steps);
    s = s.concat(walkSteps(flat(t.room.route), 'dungeon-rooms', { graph: `dungeon_graph/${d.key}.json`, room: t.room.id }));
  } else if (t.type !== 'dungeon') {
    // raid / npc inside: from the floor start (or the nearest room with a route) to the target
    const st = inn.at || floorStart(F);
    if (st) s = s.concat(walkAB(st, t, t.name, { graph: `dungeon_graph/${d.key}.json` }).steps);
  }
  return finish(t, s, Object.assign({ conds, why: why.concat(inn.why), source: inn.source === 'saved' ? 'saved' : 'dungeon_rooms', extra: Object.assign({}, extra.extra || {}, { dungeon: d.name, dungeonKey: d.key, floor: fi, floorName: F.name }) }));
}
/** field route result -> finish(); every candidate computed and failed on the geodata = unreachable (reason per landing) */
function fieldFinish(t, opts, meta) {
  if (!opts.length) return finish(t, [], Object.assign({}, meta, { why: (meta.why || []).concat('no town / gatekeeper landing within 60k'), unreachable: true }));
  // unreachable only when every landing failed for a DEFINITE reason (no way through the box / a closed pocket / off the geodata); a search that hit
  // its time / cell cap or was too long proves nothing: the route stays (straight, unverified) and the bots fall back to their own walker there
  const definite = (w) => /no way through|closed pocket|not on walkable/.test(String(w || ''));
  if (opts.every(o => o.ok === false && definite(o.why))) return finish(t, opts[0].steps, Object.assign({}, meta, { why: (meta.why || []).concat(opts.map(o => `geodata: no walk from ${o.L.kind === 'gk' ? o.L.link.desc : o.L.town} landing (${o.L.x},${o.L.y},${o.L.z}) to ${Math.round(t.x)},${Math.round(t.y)},${Math.round(t.z)} (${o.why})`)), unreachable: true }));
  const ex = Object.assign({}, meta.extra || {}, { alt: opts[1] ? summarize(opts[1].steps) : null });
  return finish(t, opts[0].steps, Object.assign({}, meta, { extra: ex }));
}
function summarize(steps) { let len = 0, sec = 0; steps.forEach(s => { if (s.do === 'walk') { len += s.len; sec += s.len / P.walkSpeed + swimExtraSec(s); } else if (s.do === 'town') sec += P.townSec; else if (s.do === 'gk') sec += P.gkSec; }); return { via: steps.filter(s => s.do !== 'walk').map(s => s.do === 'town' ? s.cmd : s.do === 'gk' ? s.desc : s.do === 'door' ? `door ${s.doorId}` : s.do).join(' > '), length: Math.round(len), sec: Math.round(sec), walksPending: steps.some(s => s.do === 'walk' && s.how === 'straight') }; }

// =============================================================================================================================== RUN
function planAll() { JOBSET.clear(); const R = []; for (const t of T) { try { R.push(...planTarget(t)); } catch (e) { R.push(finish(t, [], { why: ['planner error: ' + e.message], unreachable: true })); } } return R; }
let routes = planAll();
let jobs = [...JOBSET.values()];
progress({ phase: 'planned', targets: T.length, jobs: jobs.length });
console.log(`nav_atlas: ${T.length} targets, ${jobs.length} walks not in the cache (${Object.keys(cache.walks).length} cached)`);
if (has('--write-jobs')) {
  const max = +argv('--max-jobs', 0); if (max) jobs = jobs.slice(0, max);
  // locality: sort by geodata region of the start so a worker touches few regions
  jobs.sort((a, b) => (Math.floor(a.a.x / 32768) - Math.floor(b.a.x / 32768)) || (Math.floor(a.a.y / 32768) - Math.floor(b.a.y / 32768)) || a.st - b.st);
  atomic(JOBS, JSON.stringify({ at: new Date().toISOString(), jobs }));
}

// ---- write per type (manual routes on disk are kept) ----
const mg = require('./manual_guard');
const byType = {}; routes.forEach(r => { (byType[r.type] = byType[r.type] || {})[r.key] = r; });
const FILES = { raid: 'raid.json', epic: 'raid.json', npc: 'npc.json', area: 'area.json', room: 'room.json', dungeon: 'dungeon.json' };
const fileGroups = {}; Object.entries(byType).forEach(([ty, m]) => { const f = FILES[ty]; fileGroups[f] = Object.assign(fileGroups[f] || {}, m); });
let keptManual = 0;
for (const [f, m] of Object.entries(fileGroups)) {
  const file = path.join(OUTDIR, f);
  mg.withLock(file, () => {
    const disk = tryJ(file, null);
    if (disk && disk.routes) for (const [k, r] of Object.entries(disk.routes)) if (r && r.manual === true) { m[k] = r; keptManual++; }
    if (KEYS && disk && disk.routes) for (const [k, r] of Object.entries(disk.routes)) if (!(k in m)) m[k] = r;   // --keys: every other route stays
    mg.atomicWrite(file, JSON.stringify({ generated: new Date().toISOString(), tool: 'docs/plan/tools/nav_atlas.js', routes: m }));
  }, { who: 'nav_atlas.js' });
}
// ---- index ----
const all = KEYS ? [...new Set(Object.values(FILES))].flatMap(fn => Object.values((tryJ(path.join(OUTDIR, fn), { routes: {} }) || {}).routes || {})) : Object.values(fileGroups).flatMap(m => Object.values(m));   // --keys: the index over every type file
const counts = {}; all.forEach(r => { const c = counts[r.type] = counts[r.type] || { targets: 0, ok: 0, unverified: 0, conditional: 0, blocked: 0, unreachable: 0, saved: 0 }; c.targets++; c[r.status]++; if (r.source === 'saved') c.saved++; });
const index = { generated: new Date().toISOString(), tool: 'docs/plan/tools/nav_atlas.js', version: 1, params: P,
  stepKinds: ['town', 'gk', 'walk', 'door', 'floor', 'enter', 'need', 'arrive'], files: Object.fromEntries(Object.entries(FILES).map(([k, v]) => [k, v])),
  statusMeaning: { ok: 'every walk on the geodata / a saved route / a graph, every link seen on a live menu (or no link needed), no conditions', unverified: 'a walk not confirmed on the geodata (straight line) or a link not on the recorded live menu', conditional: 'needs items / level / skills / Seven Signs / party etc. (needs, conditions)', blocked: 'a closed door on the way that the party cannot open (owner-only, script-only, no opener)', unreachable: 'no route (why)' },
  counts, walks: { cached: Object.keys(cache.walks).length, pending: JOBSET.size },
  cols: ['key', 'type', 'name', 'x', 'y', 'z', 'status', 'length', 'sec', 'file', 'id', 'flags'],
  targets: all.map(r => [r.key, r.type, r.name, Math.round(r.target.x || 0), Math.round(r.target.y || 0), Math.round(r.target.z || 0), r.status, r.length, r.sec, FILES[r.type], r.target.id, r.flags.join(',')]) };
atomic(path.join(OUTDIR, 'index.json'), JSON.stringify(index));
progress({ phase: 'done', targets: all.length, pending: JOBSET.size, keptManual });
console.log(`nav_atlas: wrote ${all.length} routes (${JSON.stringify(counts)}), ${keptManual} manual kept, ${JOBSET.size} walks pending`);
module.exports = { routes: all };
// the report
try { require('./nav_atlas_report').write(all, index); } catch (e) { console.log('report: ' + e.message); }
