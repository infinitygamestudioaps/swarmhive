// RAID ROUTES (owner 2026-10-13 15:15, translated): "Finish the last routes. You must be able to find ALL raid bosses ... Precompute all routes to all
// raid bosses using all the geodata we have, and whether there are doors that must be opened or waited for, or whether a dagger (Unlock skill) is
// needed to open a door, or a key from the grocery store. ... lay the route so it goes around obstacles and navigates the centre ... Start with all
// the raid bosses we use in the Circuit, then do the rest from lowest to highest level. Do not choose positions where we must swim if it can be
// avoided ... Find a way to solve it all, make states etc."
//
// This tool drives docs/plan/tools/nav_atlas.js (RAID ROUTE POLICY: dry first, swim x12, breath, clearance, drops, danger) boss by boss in that
// ORDER, keeps a resumable progress file, verifies every route on the geodata and writes the readable table:
//   order     1) every boss of Scripts/data/raid_circuits.json (all parties, list order)  2) every other raid / grand / epic boss by level
//   progress  docs/plan/raid_routes_progress.json (batches todo / done / partial (walks still pending) + per boss result)
//   table     docs/plan/raid_routes.md (boss, level, place, start, walk km, swim (longest), doors / keys / skills, floors, danger, status + why)
//   routes    Scripts/data/nav_atlas/raid.json (+ per-target files) via nav_atlas.js --keys; Scripts/data/routes/raid/<id>.json: a COMPUTED, unlocked
//             own-route copy only where none exists or the existing one is an unlocked computed copy (never a recording, never a locked route);
//             a LOCKED route is checked (floor jumps + every leg on the geodata) and flagged:  check: { ok, why, badLegs, at }  (rsChoice: a locked
//             route with check.ok === false is not walked: the computed path instead, said in party chat)
// Run (background, low priority, waits for free RAM):
//   node docs/plan/tools/raid_routes.js --run [--batch 20] [--mem 1100] [--max-batches N]   compute the next batches (resumes)
//   node docs/plan/tools/raid_routes.js --report [--write-routes]                            verify + table (+ computed copies in routes/raid only with --write-routes: policy routes whose every leg passes geopath.legOk)
//   node docs/plan/tools/raid_routes.js --order                                             print the order
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
try { os.setPriority(process.pid, os.constants.priority.PRIORITY_LOW); } catch (e) { }
const ROOT = path.resolve(__dirname, '..', '..', '..'), DATA = path.join(ROOT, 'Scripts', 'data'), PLAN = path.join(ROOT, 'docs', 'plan');
const PROG = path.join(PLAN, 'raid_routes_progress.json'), MD = path.join(PLAN, 'raid_routes.md'), ATLAS = path.join(DATA, 'nav_atlas', 'raid.json');
const ARG = process.argv.slice(2), has = (f) => ARG.includes(f), argv = (f, d) => { const i = ARG.indexOf(f); return i >= 0 && ARG[i + 1] ? ARG[i + 1] : d; };
const J = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch (e) { return d; } };
const atomic = (f, s) => { const t = f + '.tmp' + process.pid; fs.writeFileSync(t, s); fs.renameSync(t, f); };
const BREATH = 2800, SAFE_FALL = 333, CLEAR_MIN = 48;

// ---------------------------------------------------------------------------------------------------------------- order
function buildOrder() {
  const RB = (J(path.join(DATA, 'raidbosses_h5.json'), { bosses: [] }).bosses) || [];
  const byId = {}; RB.forEach(b => { byId[b.id] = b; });
  const C = J(path.join(DATA, 'raid_circuits.json'), { parties: {} });
  const out = [], seen = new Set();
  Object.entries(C.parties || {}).forEach(([party, p]) => (p.bosses || []).forEach(e => {
    const id = Number(e.id); const b = byId[id]; if (!b) return;
    if (seen.has(id)) { out.find(o => o.id === id).circuit.push(party); return; }
    seen.add(id); out.push({ id, name: b.name, level: b.level, type: b.type, circuit: [party], off: !!e.off });
  }));
  RB.filter(b => !seen.has(b.id)).sort((a, b) => (a.level - b.level) || (a.id - b.id)).forEach(b => out.push({ id: b.id, name: b.name, level: b.level, type: b.type, circuit: [] }));
  return out;
}
function loadProg(order, batch) {
  const p = J(PROG, null);
  if (p && Array.isArray(p.order) && p.order.length === order.length && p.order.every((o, i) => o.id === order[i].id)) return p;
  const batches = []; const circ = order.filter(o => o.circuit.length), rest = order.filter(o => !o.circuit.length);
  for (let i = 0; i < circ.length; i += batch) batches.push({ n: batches.length + 1, part: 'circuit', ids: circ.slice(i, i + batch).map(o => o.id), status: 'todo' });
  for (let i = 0; i < rest.length; i += batch) batches.push({ n: batches.length + 1, part: 'by level', ids: rest.slice(i, i + batch).map(o => o.id), status: 'todo' });
  return { about: 'RAID ROUTES progress (docs/plan/tools/raid_routes.js): batches of raid bosses planned with nav_atlas.js --keys under the raid route policy; resume with --run', generated: new Date().toISOString(), order, batches, bosses: {} };
}
const saveProg = (p) => { p.updated = new Date().toISOString(); atomic(PROG, JSON.stringify(p, null, 1)); };

// ---------------------------------------------------------------------------------------------------------------- verification
let GF = null;
function geo() { if (!GF) GF = require('./geopath_fast'); return GF; }
/** a walk leg on the geodata (same rules as the path finder's straight legs): every cell steps / diagonals ok */
function legWalkable(a, b) {
  const G = geo().internals, s = G.snap(a.x, a.y, a.z, 2), e = G.snap(b.x, b.y, b.z, 2); if (!s || !e) return false;
  let x = s.gx, y = s.gy, li = s.li; const x2 = e.gx, y2 = e.gy;
  const dx = Math.abs(x2 - x), dy = Math.abs(y2 - y), sx = x < x2 ? 1 : -1, sy = y < y2 ? 1 : -1; let err = dx - dy;
  while (x !== x2 || y !== y2) { const e2 = 2 * err; let mx = 0, my = 0; if (e2 > -dy) { err -= dy; mx = sx; } if (e2 < dx) { err += dx; my = sy; }
    const nl = mx && my ? G.diag(x, y, li, mx, my) : G.step(x, y, li, mx, my); if (nl < 0) return false; x += mx; y += my; li = nl; }
  return true;
}
function verifyRoute(r) {
  const W = require('./water_zones');
  const v = { legs: 0, ok: 0, bad: [], swimLegs: 0, drops: 0, maxFall: 0, clrLegs: 0, clrMin: null, clrBelow: 0 };
  (r.steps || []).forEach((s, si) => {
    if (s.do !== 'walk' || !Array.isArray(s.points) || s.how === 'straight' || s.how === 'field-areas-gap') return;
    const dr = {}; (s.drops || []).forEach(d => { dr[d.i] = d.fall; });
    for (let k = 3, i = 1; k < s.points.length; k += 3, i++) {
      const a = { x: s.points[k - 3], y: s.points[k - 2], z: s.points[k - 1] }, b = { x: s.points[k], y: s.points[k + 1], z: s.points[k + 2] };
      v.legs++;
      if (dr[i]) { v.drops++; v.maxFall = Math.max(v.maxFall, dr[i]); v.ok++; continue; }
      if (W.zoneAt(b.x, b.y, b.z) || W.zoneAt(a.x, a.y, a.z)) { v.swimLegs++; v.ok++; continue; }            // a swim: the server skips the geodata
      if (Math.hypot(a.x - b.x, a.y - b.y) < 8) { v.ok++; continue; }
      if (legWalkable(a, b)) v.ok++; else v.bad.push({ step: si, i, a: [a.x, a.y, a.z], b: [b.x, b.y, b.z] });
      if (s.pol) { const c = geo().legClearance(a, b, 4); if (c >= 0) { v.clrLegs++; v.clrMin = v.clrMin == null ? c : Math.min(v.clrMin, c); if (c < CLEAR_MIN) v.clrBelow++; } }
    }
  });
  try { geo().dropRegions(); } catch (e) { }
  return v;
}
// ---------------------------------------------------------------------------------------------------------------- the table row
const DOORS = (J(path.join(DATA, 'doors_h5.json'), { doors: [] }).doors || []).reduce((m, d) => { m[d.id] = d; return m; }, {});
function summarize(o, r) {
  const steps = (r && r.steps) || [];
  const walks = steps.filter(s => s.do === 'walk'), doors = steps.filter(s => s.do === 'door'), floors = steps.filter(s => s.do === 'floor' || s.do === 'enter');
  const swimLen = walks.reduce((a, s) => a + (s.swimLen || 0), 0), maxSwim = walks.reduce((a, s) => Math.max(a, s.maxSwim || 0), 0);
  const drops = [].concat(...walks.map(s => s.drops || [])), maxFall = drops.reduce((a, d) => Math.max(a, d.fall || 0), 0);
  const gk = steps.find(s => s.do === 'gk'), town = steps.find(s => s.do === 'town');
  const n = (r && r.needs) || {};
  const needItem = (n.items || []).length || (n.other || []).some(x => x.anyItem && !x.orUnlock), needSkill = (n.skills || []).some(x => x.id === 27) || (n.other || []).some(x => x.orUnlock);
  const otherNeeds = (n.other || []).filter(x => !x.anyItem && !x.hellboundLevel).map(x => x.sevenSigns ? 'Seven Signs' : x.quest ? 'quest ' + x.quest : x.noble ? 'Noblesse' : x.commandChannel ? 'command channel' : x.manual ? 'by hand: ' + x.manual : x.bossState ? 'boss state' : x.window ? 'time window' : x.party ? 'party' : x.unknown ? 'unknown rule' : x.adena ? 'adena' : x.castleOwner ? 'castle owner' : 'condition');
  const pend = walks.filter(s => s.how === 'straight');
  const flags = (r && r.flags) || [];
  let status = 'ok', why = [];
  if (!r) { status = 'unreachable'; why.push('no atlas route'); }
  else if (r.status === 'unreachable' || r.status === 'blocked') { status = 'unreachable'; why = (r.why || []).slice(0, 3); }
  else if (pend.length) { status = 'pending'; why.push(`${pend.length} walk(s) not computed on the geodata yet (${pend.map(s => s.why || 'queued').join('; ').slice(0, 160)})`); }
  else if (needItem) { status = 'needs-item'; why.push(((n.items || []).map(i => i.name).concat((n.other || []).filter(x => x.anyItem && !x.orUnlock).map(x => x.text))).join(', ')); }
  else if (needSkill) { status = 'needs-skill'; why.push('Unlock (dagger class) for ' + [...new Set(doors.filter(d => d.need && d.need.unlock && !(d.need.npc && d.need.npc.length)).map(d => d.name || d.doorId))].join(', ')); }
  else if (otherNeeds.length) { status = 'conditional'; why.push(otherNeeds.join(', ')); }
  if (r && r.extra && r.extra.savedInvalid) why.push('saved route not used: ' + r.extra.savedInvalid.why);
  const swimOnly = flags.includes('swim-only') || (swimLen > 0 && walks.some(s => s.pol && s.pol.mode === 'swim-only'));
  return { id: o.id, name: o.name, level: o.level, type: o.type, circuit: o.circuit, status, swimOnly, why: why.filter(Boolean),
    place: r ? (r.dungeon ? `${r.dungeon}${r.floorName ? ' / ' + r.floorName : ''}` : '') || placeOf(r) : '',
    start: [town ? town.cmd : '', gk ? (gk.desc || gk.link) : ''].filter(Boolean).join(' > ') || (r && r.from) || '',
    walk: r ? r.length || 0 : 0, swim: Math.round(swimLen), maxSwim: Math.round(maxSwim), overBreath: maxSwim > BREATH,
    drops: drops.length, maxFall, fallDamage: maxFall > SAFE_FALL,
    doors: doors.map(d => ({ id: d.doorId, name: d.name, how: (DOORS[d.doorId] || {}).how || d.kind, wait: !!(d.need && d.need.wait), unlock: !!(d.need && d.need.unlock), npc: !!(d.need && d.need.npc), items: ((d.need && d.need.items) || []).map(i => i.name || i.id) })),
    floors: floors.map(f => f.do === 'floor' ? `${(f.npc && f.npc.name) || 'teleporter'} > ${f.floorName || f.floor}` : `enter ${f.how}${f.npc ? ' via ' + f.npc.name : ''}`),
    danger: r ? r.maxDanger || 0 : 0, flags, source: r ? r.source : '', saved: r && r.extra ? (r.extra.savedLocked ? 'locked' : r.extra.savedUnlocked ? 'unlocked' : '') : '' };
}
function placeOf(r) { try { const RB = placeOf.RB || (placeOf.RB = (J(path.join(DATA, 'raidbosses_h5.json'), { bosses: [] }).bosses || [])); const b = RB.find(x => 'raid:' + x.id === r.key); return b ? (b.near || b.zoneName || '') : ''; } catch (e) { return ''; } }

// ---------------------------------------------------------------------------------------------------------------- routes/raid files
const RDIR = path.join(DATA, 'routes', 'raid');
function writeComputed(o, r, ver) {
  const f = path.join(RDIR, `${o.id}.json`), cur = J(f, null);
  if (!r || r.status === 'unreachable' || r.status === 'blocked') return 'skip: no route';
  const steps = r.steps || [];
  if (steps.some(s => ['door', 'floor', 'enter', 'need', 'buy'].includes(s.do))) return 'skip: doors / floors (the atlas route is the computed path)';
  if (steps.some(s => s.do === 'walk' && s.how === 'straight')) return 'skip: walk pending';
  if (cur && cur.manual) return 'skip: locked';
  if (cur && !cur.computed) return 'skip: a recorded route (kept)';
  // 2026-10-13 18:20 (release check: test_swim_routes): only a RAID-POLICY route whose every leg passes geopath.legOk (the bots' own check) is copied
  if (!(r.flags || []).includes('raid-policy')) return 'skip: not planned under the raid policy yet';
  { const geoL = require('./geopath'); let bad = 0; steps.filter(s => s.do === 'walk').forEach(s => { for (let k = 3; k < s.points.length; k += 3) { if ((s.drops || []).some(d => d.i === k / 3)) continue; if (!geoL.legOk({ x: s.points[k - 3], y: s.points[k - 2], z: s.points[k - 1] }, { x: s.points[k], y: s.points[k + 1], z: s.points[k + 2] })) bad++; } }); if (bad) return `skip: ${bad} leg(s) fail geopath.legOk (the atlas route stays the computed path)`; }
  const town = steps.find(s => s.do === 'town'), gk = steps.find(s => s.do === 'gk');
  const pts = []; steps.filter(s => s.do === 'walk').forEach(s => { const sw = new Set(s.swim || []), dr = {}; (s.drops || []).forEach(d => { dr[d.i] = d.fall; });
    for (let k = 0, i = 0; k < s.points.length; k += 3, i++) { const p = { x: s.points[k], y: s.points[k + 1], z: s.points[k + 2] }; if (sw.has(i)) p.swim = true; if (dr[i]) p.drop = true; const L = pts[pts.length - 1]; if (L && L.x === p.x && L.y === p.y && L.z === p.z) continue; pts.push(p); } });
  if (pts.length < 2) return 'skip: no points';
  const out = { boss: o.name, id: o.id, landing: gk ? gk.desc : 'walking', start: gk ? { kind: 'gk', desc: gk.desc, from: gk.from } : town ? { kind: 'town', town: town.town } : null,
    length: r.length, points: pts, savedAt: (cur && cur.savedAt) || new Date().toISOString(), editedAt: new Date().toISOString(), uses: (cur && cur.uses) || 0, lastOk: (cur && cur.lastOk) || null, fails: (cur && cur.fails) || 0, manual: false,
    computed: { by: 'docs/plan/tools/raid_routes.js (nav_atlas.js raid route policy: dry first, swim x12, clearance, drops, danger)', at: new Date().toISOString(), swimUnits: steps.reduce((a, s) => a + (s.swimLen || 0), 0) || undefined,
      maxSwimRun: steps.reduce((a, s) => Math.max(a, s.maxSwim || 0), 0) || undefined, drops: pts.filter(p => p.drop).length || undefined, verify: ver ? { legs: ver.legs, bad: ver.bad.length, clrMin: ver.clrMin } : undefined,
      note: 'computed, NOT locked: the atlas raid route as an own route (route switch "auto" keeps using the computed atlas path; lock it after a live run)' } };
  if (cur && cur.use) out.use = cur.use;
  atomic(f, JSON.stringify(out)); return cur ? 'updated computed copy' : 'written (computed, unlocked)';
}
/** a LOCKED own route: floor jumps + every leg on the geodata (a leg that fails and has no short way around = bad). Flags check { ok, ... } */
function checkLocked(o) {
  const f = path.join(RDIR, `${o.id}.json`), cur = J(f, null); if (!cur || !cur.manual) return null;
  const RS = require(path.join(ROOT, 'Dashboard', 'routestore.js'));
  const fc = RS.floorCheck(cur), bad = [];
  let prev = null, n = 0;
  for (const e of cur.points || []) {
    if (e && (e.do === 'floor' || e.do === 'dungeon')) { prev = null; continue; }
    if (!e || !isFinite(e.x)) continue; n++;
    // hand-drawn points often carry one flat z (Queen Ant -5734): check on the GROUND under each point (the bots walk to x/y, the server sets z)
    const G0 = geo().internals, gz = (p) => { const q = G0.snap(p.x, p.y, p.z, 4, true); return q ? Object.assign({}, p, { z: G0.hAt(q.gx, q.gy, q.li) }) : p; };
    if (prev && !e.drop && !e.swim && !prev.swim && Math.abs(e.z - prev.z) <= 1500 && Math.hypot(e.x - prev.x, e.y - prev.y) > 8 && !legWalkable(gz(prev), gz(e))) {
      const L = Math.hypot(e.x - prev.x, e.y - prev.y), q = geo().findPath(gz(prev), gz(e), { maxNodes: 300000, maxMs: 8000, pad: 1500, maxLeg: 1000, drops: true });
      if (!(q.ok && q.lengthUnits < L * 3 + 600)) bad.push({ after: n - 1, from: [prev.x, prev.y, prev.z], to: [e.x, e.y, e.z], why: q.ok ? `only a ${q.lengthUnits} detour for ${Math.round(L)}` : q.reason });
    }
    prev = e;
  }
  try { geo().dropRegions(); } catch (e) { }
  const ok = fc.ok && !bad.length;
  const check = { ok, at: new Date().toISOString(), by: 'docs/plan/tools/raid_routes.js', points: n, floor: fc.ok ? 'ok' : fc.why, badLegs: bad.slice(0, 10), why: ok ? '' : (!fc.ok ? fc.why : `${bad.length} leg(s) not walkable on the geodata (no way around within 3x): first after point ${bad[0].after}`) };
  const prevCheck = cur.check ? JSON.stringify(Object.assign({}, cur.check, { at: 0 })) : '';
  // a locked user file is touched ONLY to flag a failing check (or to clear / update an earlier flag of this tool) — a passing route stays byte-identical
  if ((!ok || cur.check) && prevCheck !== JSON.stringify(Object.assign({}, check, { at: 0 }))) { if (ok) delete cur.check; else cur.check = check; atomic(f, JSON.stringify(cur)); }
  return check;
}

// ---------------------------------------------------------------------------------------------------------------- report
function report(prog, opts) {
  const R = (J(ATLAS, { routes: {} }).routes) || {};
  const rows = [];
  for (const o of prog.order) {
    const r = R['raid:' + o.id] || null;
    const row = summarize(o, r);
    if (r && !opts.noVerify) { const v = verifyRoute(r); row.verify = { legs: v.legs, bad: v.bad.length, swimLegs: v.swimLegs, clrLegs: v.clrLegs, clrMin: v.clrMin, clrBelow: v.clrBelow }; if (v.bad.length) row.why.push(`${v.bad.length} leg(s) fail the geodata wall check (first: ${v.bad[0].a.join(',')} -> ${v.bad[0].b.join(',')})`); }
    const ck = opts.noVerify ? null : checkLocked(o); if (ck) row.locked = ck;
    if (!opts.noWrite && has('--write-routes')) row.file = writeComputed(o, r, row.verify ? { legs: row.verify.legs, bad: row.verify.bad ? [1] : [], clrMin: row.verify.clrMin } : null);
    rows.push(row);
    prog.bosses[o.id] = { status: row.status, swimOnly: row.swimOnly, at: new Date().toISOString(), why: row.why.slice(0, 2), file: row.file, locked: ck ? ck.ok : undefined };
  }
  writeMd(rows, prog);
  return rows;
}
const km = (u) => u ? (u / 1000).toFixed(1) : '0';
function writeMd(rows, prog) {
  const cnt = {}; rows.forEach(r => { cnt[r.status] = (cnt[r.status] || 0) + 1; });
  const swimOnly = rows.filter(r => r.swimOnly).length, overB = rows.filter(r => r.overBreath).length, falls = rows.filter(r => r.fallDamage).length;
  const L = [];
  L.push('# Raid routes — every raid boss, precomputed (generated, do not edit by hand)');
  L.push('');
  L.push(`Generated ${new Date().toISOString()} by \`node docs/plan/tools/raid_routes.js --report\` from \`Scripts/data/nav_atlas/raid.json\` (nav_atlas.js RAID ROUTE POLICY). Progress: \`docs/plan/raid_routes_progress.json\`.`);
  L.push('');
  L.push(`**${rows.length} bosses:** ${Object.entries(cnt).map(([k, v]) => `${v} ${k}`).join(' · ')} · ${swimOnly} swim-only · ${overB} with a swim longer than one breath · ${falls} with fall damage.`);
  L.push('');
  L.push('Rules: dry first (a route only swims when no dry way exists, or the dry way is more than 4x and 15 km longer); swim cost x12; one breath ≈ 2,800 units (60 s at swim speed 50 — longer swims are marked); walks keep ≥ 48 units from walls / cliffs where the ground allows (clearance); one-way drops off ledges are allowed (fall > 333 = fall damage, never below 1 HP per L2J L2PcInstance.isFalling); aggressive monsters more than 6 levels above the boss are avoided as a cost. Doors: `doors_h5.json` (wait = timed door, npc = a gatekeeper opens it, Unlock = dagger class skill 27 + Thief Keys from any grocer, key = a key item). Heine: walking out of the town is allowed (owner 2026-10-13).');
  L.push('');
  L.push('Status: **ok** · **needs-item** (a key item nobody can buy) · **needs-skill** (Unlock: a dagger class must be in the party) · **conditional** (Seven Signs / quest / level / ...) · **pending** (a walk not computed yet: run `raid_routes.js --run`) · **unreachable** (why).');
  L.push('');
  const sect = (title, list) => {
    L.push(`## ${title}`); L.push('');
    L.push('| # | Boss | Lv | Place | Start | Walk km | Swim m (longest) | Doors / keys / skills | Floors / entries | Danger (max mob lv) | Status | Why / notes |');
    L.push('|---|---|---|---|---|---|---|---|---|---|---|---|');
    list.forEach((r, i) => {
      const doors = r.doors.map(d => `${d.name} (${d.wait ? 'wait' : d.npc ? 'npc' : d.unlock && d.items.length ? 'key/Unlock' : d.unlock ? 'Unlock' : d.items.length ? 'key: ' + d.items.join('/') : d.how})`).join('; ');
      const swim = r.swim ? `${r.swim} (${r.maxSwim}${r.overBreath ? ' ⚠ > breath' : ''})` : '—';
      const notes = [].concat(r.why, r.drops ? [`${r.drops} drop(s), highest ${r.maxFall}${r.fallDamage ? ' (fall damage)' : ''}`] : [], r.swimOnly ? ['swim-only'] : [], r.saved ? [`own route: ${r.saved}${r.locked ? (r.locked.ok ? ' (checked ok)' : ' — INVALID: ' + r.locked.why) : ''}`] : [], r.verify && r.verify.clrLegs ? [`clearance min ${r.verify.clrMin} (${r.verify.clrBelow}/${r.verify.clrLegs} legs < 48)`] : [], r.circuit.length ? ['circuit: ' + r.circuit.join(', ')] : []).join('; ');
      L.push(`| ${i + 1} | ${r.name} (${r.id}) | ${r.level} | ${r.place || ''} | ${r.start} | ${km(r.walk)} | ${swim} | ${doors || '—'} | ${r.floors.join('; ') || '—'} | ${r.danger || ''} | **${r.status}** | ${notes.replace(/\|/g, '/')} |`);
    });
    L.push('');
  };
  sect('1. Circuit bosses (raid_circuits.json, all parties)', rows.filter(r => r.circuit.length));
  sect('2. Every other raid / grand / epic boss, by level', rows.filter(r => !r.circuit.length));
  atomic(MD, L.join('\n'));
  prog.summary = { counts: cnt, swimOnly, overBreath: overB, fallDamage: falls, at: new Date().toISOString() };
  saveProg(prog);
  console.log(`raid_routes.md: ${rows.length} bosses ${JSON.stringify(cnt)}, swim-only ${swimOnly}, over breath ${overB}, fall damage ${falls}`);
}

// ---------------------------------------------------------------------------------------------------------------- run
module.exports = { buildOrder, summarize, verifyRoute, legWalkable, writeComputed, checkLocked, BREATH, SAFE_FALL, CLEAR_MIN };
if (require.main === module) {
const order = buildOrder();
if (has('--order')) { order.forEach((o, i) => console.log(`${i + 1}. ${o.name} (${o.id}) L${o.level}${o.circuit.length ? ' circuit ' + o.circuit.join(',') : ''}`)); process.exit(0); }
const prog = loadProg(order, +argv('--batch', 20));
saveProg(prog);
if (has('--run')) {
  const mem = argv('--mem', '1100'), maxB = +argv('--max-batches', 999); let doneB = 0;
  for (const b of prog.batches) {
    if (doneB >= maxB) break;
    if (b.status === 'done' && !has('--redo')) continue;
    const keys = b.ids.map(id => 'raid:' + id).join(',');
    b.status = 'running'; b.startedAt = new Date().toISOString(); saveProg(prog);
    console.log(`raid_routes: batch ${b.n}/${prog.batches.length} (${b.part}): ${b.ids.length} bosses`);
    const r = cp.spawnSync(process.execPath, [path.join(__dirname, 'nav_atlas.js'), '--only', 'raid', '--keys', keys, '--mem', mem, '--free-min', argv('--free-min', '300')].concat(has('--retry-failed') ? ['--retry-failed'] : []), { stdio: 'inherit', windowsHide: true });
    const R = (J(ATLAS, { routes: {} }).routes) || {};
    const pend = b.ids.filter(id => { const x = R['raid:' + id]; return !x || (x.steps || []).some(s => s.do === 'walk' && s.how === 'straight' && !s.why); });
    b.exit = r.status; b.endedAt = new Date().toISOString(); b.pending = pend; b.status = r.status === 0 && !pend.length ? 'done' : 'partial';
    saveProg(prog); doneB++;
    report(prog, { noVerify: !has('--verify-each') });
  }
}
if (has('--report') || has('--run')) report(prog, {});
}
