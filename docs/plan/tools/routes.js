// Builds 2nd-class quest routes (teleports, SoE, kills, effort) from routes_src.js + datapack digests.
const __ROOT = require('path').resolve(__dirname, '..', '..', '..').replace(/\\/g, '/');   // install folder (portable, 2026-10-07)
// node routes.js  -> Scripts/data/routes_second_class_h5.json + docs/plan/routes/*.md
const fs = require('fs');
const D = __ROOT + '/Scripts/data/';
const read = f => JSON.parse(fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, ''));
const SRC = require('./routes_src.js');
const digest = read(D + 'dp/quests_digest.json');
const tps = read(D + 'teleports_h5.json');
const spots = read(D + 'hunting_spots_h5.json');
const npcs = read(D + 'npcs_h5.json');
const cq = read(D + 'class_quests_h5.json');

// ------------------------------------------------------------------ constants
const WALK = 150;         // units/s (run speed with board Wind Walk, conservative)
const HOP_S = 12;         // seconds per gatekeeper hop (dialog + load)
const SOE_S = 25;         // Scroll of Escape cast + load
const SOE_PENALTY = 90;   // planner: prefer walking unless SoE saves real time (scrolls cost money)
const ADENA_S = 1 / 200;  // planner: 1,000 adena of teleports weighs like 5 s
const TALK_S = 15;
const KILL_SOLO = lvl => 30 + Math.max(0, lvl - 36) * 10;   // seconds per kill solo at lvl 37-39
const KILL_PARTY = 8;     // 9-man party
const SPAWN_SEARCH_S = 90; // finding a single-spawn quest mob
const DIAMONDS = { 64: 48, 65: 47, 66: 64, 211: 61, 212: 61, 213: 128, 214: 168, 215: 49, 216: 85, 217: 96, 218: 102, 219: 98, 220: 109, 221: 50, 222: 72, 223: 64, 224: 96, 225: 96, 226: 72, 227: 60, 228: 122, 229: 104, 230: 122, 231: 23, 232: 92, 233: 92 };
const DIAMOND_BY_CLASS = { '212:knight': 45, '222:palusKnight': 104, '223:warrior': 72, '225:scavenger': 82, '226:cleric': 60, '226:knight': 104, '226:oracle': 45, '229:wizard': 122 };

const aggressive = {};
spots.forEach(s => (s.mobs || []).forEach(m => { aggressive[m.id] = !!m.aggressive; }));

// ------------------------------------------------------------------ towns + teleport graph
const TOWNS = {
  'Talking Island': { x: -84141, y: 244623, al: ['TI', 'TI Village', 'Talking Island'] },
  'Gludin': { x: -80684, y: 149770, al: ['Gludin'] },
  'Gludio': { x: -12787, y: 122779, al: ['Gludio', 'Town of Gludio'] },
  'Dion': { x: 15472, y: 142880, al: ['Dion'] },
  'Giran': { x: 83551, y: 147945, al: ['Giran', 'Giran Town', 'Town of Giran'] },
  'Oren': { x: 82956, y: 53162, al: ['Oren'] },
  'Aden': { x: 146783, y: 25808, al: ['Aden', 'Aden Town'] },
  'Hunters Village': { x: 117088, y: 76931, al: ['Hunters', 'Hunters Village', 'Hunter\'s Village'] },
  'Heine': { x: 111455, y: 219400, al: ['Heine'] },
  'Goddard': { x: 148024, y: -55281, al: ['Goddard'] },
  'Rune': { x: 43835, y: -47749, al: ['Rune', 'Rune Township'] },
  'Schuttgart': { x: 87126, y: -143520, al: ['Schuttgart'] },
  'Elven Village': { x: 46951, y: 51550, al: ['Elven Village'] },
  'Dark Elven Village': { x: 9709, y: 15566, al: ['DE Village', 'Dark Elven Village'] },
  'Orc Village': { x: -45158, y: -112583, al: ['Orc Village', 'Orc village'] },
  'Dwarven Village': { x: 115120, y: -178224, al: ['Dwarven Village', 'Dwarven village'] },
  'Kamael Village': { x: -117251, y: 46771, al: ['Kamael Village', 'Kamael Vilage'] },
  'Floran Village': { x: 17838, y: 170274, al: ['Floran', 'Floran Village'] },
};
const alias = {};
for (const [k, t] of Object.entries(TOWNS)) t.al.forEach(a => { alias[a.toLowerCase()] = k; });
// Fix GK positions from the teleport list where possible (landing coordinates when teleporting INTO the town).
const townOf = s => alias[String(s).trim().toLowerCase()] || null;
const nodes = {};                     // name -> {x,y,z,town:bool}
for (const [k, t] of Object.entries(TOWNS)) nodes[k] = { x: t.x, y: t.y, town: true };
const edges = {};                     // from -> [{to, price}]
tps.forEach(e => {
  const m = /^(.+?)\s*->\s*(.+)$/.exec(e.desc || ''); if (!m) return;
  const from = townOf(m[1]); if (!from) return;
  if (/Clan Hall|Castle|Fortress|Olympiad|Token|adena/i.test(e.desc)) return;
  let to = townOf(m[2]);
  if (!to) { to = m[2].trim(); if (!nodes[to]) nodes[to] = { x: e.x, y: e.y, z: e.z, town: false }; }
  (edges[from] = edges[from] || []).push({ to, price: e.price || 0 });
});
// Floran has no gatekeeper list in the datapack's teleport table: reachable via Dion -> walking. Keep as town for naming only.
function dijkstra(start) {
  const best = { [start]: { t: 0, adena: 0, hops: [] } }; const q = [start]; const done = new Set();
  while (q.length) {
    q.sort((a, b) => (best[a].t + best[a].adena * ADENA_S) - (best[b].t + best[b].adena * ADENA_S)); const u = q.shift(); if (done.has(u)) continue; done.add(u);
    if (u !== start && !nodes[u].town) continue;   // can't teleport onward from a field
    for (const e of edges[u] || []) {
      const c = { t: best[u].t + HOP_S, adena: best[u].adena + e.price, hops: best[u].hops.concat([{ from: u, to: e.to, price: e.price }]) };
      const cc = c.t + c.adena * ADENA_S, bc = best[e.to] ? best[e.to].t + best[e.to].adena * ADENA_S : Infinity;
      if (cc < bc - 0.1) { best[e.to] = c; q.push(e.to); }
    }
  }
  return best;
}
// Towns without a gatekeeper (e.g. Floran): walk to the nearest town that has one.
for (const t of Object.keys(TOWNS)) if (!edges[t]) {
  let nt = null, bd = 1e12; for (const u of Object.keys(TOWNS)) if (edges[u] && u !== t) { const d = Math.hypot(TOWNS[t].x - TOWNS[u].x, TOWNS[t].y - TOWNS[u].y); if (d < bd) { bd = d; nt = u; } }
  if (nt) TOWNS[t].walkTo = { town: nt, d: bd };
}
const DIJ = {}; Object.keys(TOWNS).forEach(t => {
  if (edges[t]) { DIJ[t] = dijkstra(t); return; }
  const w = TOWNS[t].walkTo; if (!w) { DIJ[t] = { [t]: { t: 0, adena: 0, hops: [] } }; return; }
  const sub = dijkstra(w.town); const res = { [t]: { t: 0, adena: 0, hops: [] } };
  for (const [n, r] of Object.entries(sub)) res[n] = { t: r.t + w.d / WALK, adena: r.adena, hops: [{ walk: true, from: t, to: w.town, dist: Math.round(w.d) }].concat(r.hops) };
  DIJ[t] = res;
});
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function nearestTown(p, maxD) {
  let best = null, bd = maxD || 1e12;
  for (const [k, t] of Object.entries(TOWNS)) { const d = dist(p, t); if (d < bd) { bd = d; best = k; } }
  return best ? { town: best, d: bd } : null;
}
function placeName(p) {
  const t = nearestTown(p, 6000); if (t) return t.town;
  let bn = null, bd = 12000;
  for (const [k, n] of Object.entries(nodes)) if (!n.town) { const d = dist(p, n); if (d < bd) { bd = d; bn = k; } }
  if (bn) return bd < 3000 ? bn : `${bn} area (${(bd / 1000).toFixed(0)} km)`;
  let bs = null; bd = 4500;
  spots.forEach(s => { const d = dist(p, s.center); if (d < bd) { bd = d; bs = s.name; } });
  if (bs) return bs.replace(/^.*?—\s*/, '').replace(/\s*\(Lv[^)]*\)/, '');
  const nt = nearestTown(p); return `${Math.round(nt.d / 1000)} km from ${nt.town}`;
}// Travel from point A to point B. Returns {t, soe, adena, legs[]}
function travel(A, B) {
  const direct = dist(A, B);
  const walk = { t: direct / WALK, soe: 0, adena: 0, legs: [{ action: 'walk', to: placeName(B), x: B.x, y: B.y, dist: Math.round(direct) }] };
  if (direct < 2500) return { t: direct / WALK, soe: 0, adena: 0, legs: [] };
  let best = walk;
  const inTown = nearestTown(A, 6000);
  const starts = [];
  if (inTown) starts.push({ town: inTown.town, t: 0, soe: 0, legs: [] });
  else {
    const nt = nearestTown(A);
    starts.push({ town: nt.town, t: SOE_S, soe: 1, legs: [{ action: 'soe', to: nt.town }] });
    if (nt.d < 9000) starts.push({ town: nt.town, t: nt.d / WALK, soe: 0, legs: [{ action: 'walk', to: nt.town, dist: Math.round(nt.d) }] });
  }
  for (const s of starts) {
    const dj = DIJ[s.town]; if (!dj) continue;
    for (const [n, r] of Object.entries(dj)) {
      const N = nodes[n]; const last = dist(N, B);
      const t = s.t + r.t + last / WALK;
      const cost = t + r.adena * ADENA_S + s.soe * SOE_PENALTY, bestCost = best.t + best.adena * ADENA_S + best.soe * SOE_PENALTY;
      if (cost < bestCost - 5) {
        best = { t, soe: s.soe, adena: r.adena, legs: s.legs.concat(r.hops.map(h => h.walk ? ({ action: 'walk', to: h.to, dist: h.dist }) : ({ action: 'teleport', from: h.from, to: h.to, price: h.price })),
          last > 300 ? [{ action: 'walk', to: placeName(B), x: B.x, y: B.y, dist: Math.round(last) }] : []) };
      }
    }
  }
  return best;
}

// ------------------------------------------------------------------ per-quest routes
function resolve(q, name) { return (digest[q].constants || {})[name]; }
function mobInfo(q, names) {
  const ms = names.map(n => ({ key: n, c: resolve(q, n) })).filter(m => m.c);
  const located = ms.filter(m => m.c.at).sort((a, b) => (b.c.spawns || 0) - (a.c.spawns || 0));
  return { ms, at: located.length ? { x: located[0].c.at[0], y: located[0].c.at[1], z: located[0].c.at[2] } : null,
    lvlMax: Math.max(0, ...ms.map(m => m.c.level || 0)), spawns: ms.reduce((a, m) => a + (m.c.spawns || 0), 0),
    aggr: ms.some(m => aggressive[m.c.id]) };
}
function buildQuest(qid) {
  const src = SRC[qid]; const steps = []; let pos = null;
  const tot = { soe: 0, adena: 0, kills: 0, travelS: 0, killSoloS: 0, killPartyS: 0, talk: 0, hops: 0, walk: 0, places: new Set(), flags: [], danger: [], rng: 0, unresolved: [] };
  let stepNo = 0;
  for (const s of src.steps) {
    if (s.flag) { const prev = steps[steps.length - 1]; if (prev) (prev.flags = prev.flags || []).push(`${s.flag}: ${s.note}`); tot.flags.push(s.flag); if (s.flag === 'rng') tot.rng++; continue; }
    let at = null, info = {};
    if (s.a === 'talk') {
      const c = resolve(qid, s.n);
      if (!c) tot.unresolved.push(s.n);
      info = { npc: c ? { id: c.id, name: c.name, title: c.title || '' } : { name: s.n } };
      if (c && c.at) at = { x: c.at[0], y: c.at[1], z: c.at[2] };
    } else {
      const mi = mobInfo(qid, s.m);
      if (!mi.ms.length) tot.unresolved.push(s.m.join('/'));
      at = mi.at;
      const item = resolve(qid, s.item || '');
      const kills = s.single ? (src.steps[src.steps.indexOf(s) + 1] && src.steps[src.steps.indexOf(s) + 1].flag === 'spawn' ? 5 : 1)
        : Math.ceil(s.count / (s.perKill || 1) / ((s.chance || 100) / 100));
      info = { mobs: mi.ms.map(m => ({ id: m.c.id, name: m.c.name, level: m.c.level, aggressive: !!aggressive[m.c.id], spawns: m.c.spawns || 0 })),
        item: s.item ? { id: item ? item.id : null, name: s.item, count: s.count, perKill: s.perKill, chance: s.chance } : null, estKills: kills };
      tot.kills += kills;
      tot.killSoloS += kills * KILL_SOLO(mi.lvlMax) + (mi.spawns <= 2 ? SPAWN_SEARCH_S : 0);
      tot.killPartyS += kills * KILL_PARTY + (mi.spawns <= 2 ? SPAWN_SEARCH_S : 0);
      if ((s.chance || 100) <= 20) tot.rng++;
      if (mi.lvlMax >= 42) tot.danger.push(`${mi.ms.map(m => m.c.name).join('/')} lvl ${mi.lvlMax}`);
      if (mi.lvlMax >= 40 && mi.lvlMax < 42) tot.danger.push(`${mi.ms.map(m => m.c.name).join('/')} lvl ${mi.lvlMax} (risky)`);
    }
    // travel
    let legs = [];
    if (at) {
      if (pos) {
        const tr = travel(pos, at);
        legs = tr.legs; tot.soe += tr.soe; tot.adena += tr.adena; tot.travelS += tr.t;
        tr.legs.forEach(l => { if (l.action === 'teleport') tot.hops++; if (l.action === 'walk') tot.walk += l.dist || 0; });
      }
      pos = at; tot.places.add(placeName(at));
    }
    if (s.a === 'talk') { tot.talk++; tot.travelS += TALK_S; }
    steps.push({ step: ++stepNo, action: s.a === 'talk' ? (s.cond === 99 ? 'turnin' : 'talk') : 'kill', cond: s.cond === 99 ? 'finish' : s.cond,
      where: at ? placeName(at) : '(spawned / unknown)', x: at && at.x, y: at && at.y, z: at && at.z, travel: legs, ...info, note: s.note || '' });
  }
  const d = digest[qid];
  tot.flags = [...new Set(tot.flags)];
  return { id: qid, title: d.title, minLevel: d.minLevel, detail: src.detail, diamonds: DIAMONDS[qid],
    partyShared: d.party ? 'yes (getRandomPartyMember)' : 'no: drops/credit go to the killer only',
    steps, totals: { soe: tot.soe, teleportAdena: tot.adena, teleportHops: tot.hops, walkKm: +(tot.walk / 1000).toFixed(1), estKills: tot.kills,
      places: tot.places.size, talks: tot.talk, flags: tot.flags, danger: [...new Set(tot.danger)], rngSteps: tot.rng,
      estMinutesSolo: Math.round((tot.travelS + tot.killSoloS) / 60), estMinutesParty: Math.round((tot.travelS + tot.killPartyS) / 60) },
    unresolved: tot.unresolved };
}
const quests = {};
for (const id of Object.keys(SRC)) quests[id] = buildQuest(+id);

// ------------------------------------------------------------------ effort
function rawEffort(q) {
  const t = q.totals;
  return t.estKills * 0.35 + t.teleportHops * 1.5 + t.walkKm * 0.8 + t.soe * 2 + t.teleportAdena / 8000 + t.places * 1.2 + t.talks * 0.3
    + t.danger.length * 7 + t.rngSteps * 4 + (t.flags.includes('weapon') ? 6 : 0) + (t.flags.includes('skill') ? 8 : 0)
    + (t.flags.includes('spawn') ? 4 : 0) + (t.flags.includes('timed') ? 3 : 0) + (t.flags.includes('boss') ? 3 : 0) + (t.flags.includes('party') ? 6 : 0) + (t.flags.includes('adena') ? 4 : 0);
}
const raws = Object.values(quests).map(rawEffort); const maxRaw = Math.max(...raws);
for (const q of Object.values(quests)) {
  const t = q.totals; q.effortRaw = +rawEffort(q).toFixed(1);
  q.effortScore = Math.round(100 * q.effortRaw / maxRaw);
  const hard = t.danger.filter(d => !/risky/.test(d)).length;
  q.soloFeasible = (hard >= 2 || t.flags.includes('party')) ? 'no' : (hard === 1 || t.danger.length >= 2) ? 'risky' : 'yes';
}

// ------------------------------------------------------------------ classes
const changes = (cq.otherClasses.changes || cq.otherClasses).filter(c => c.level === 40).map(c => ({ from: c.from, to: c.to, toId: c.toId, master: c.master, quests: c.requires.map(r => typeof r === 'number' ? r : (r.quest || r)).filter(x => typeof x === 'number') }));
[{ from: 'trooper', to: 'BERSERKER', toId: 127, master: 'Kamael Grand Master', quests: [64] },
  { from: 'trooper', to: 'SOUL_BREAKER (male)', toId: 128, master: 'Kamael Grand Master', quests: [65] },
  { from: 'warder', to: 'SOUL_BREAKER (female)', toId: 129, master: 'Kamael Grand Master', quests: [65] },
  { from: 'warder', to: 'ARBALESTER', toId: 130, master: 'Kamael Grand Master', quests: [66] }].forEach(k => { if (!changes.some(c => c.toId === k.toId)) changes.push(k); });
const TEAM = { 33: 'Tank1', 16: 'Bishop1', 46: 'Destroyer1, Destroyer2', 127: 'Doombringer1', 128: 'Inspector1', 13: 'Necro1', 52: 'Chanter1', 43: 'Saint1' };
const classes = changes.map(c => {
  const qs = c.quests.filter(id => quests[id]);
  const dia = id => DIAMOND_BY_CLASS[`${id}:${c.from}`] || DIAMONDS[id];
  const first = qs.slice().sort((a, b) => dia(b) - dia(a))[0];
  const sum = k => qs.reduce((a, id) => a + quests[id].totals[k], 0);
  const raw = qs.reduce((a, id) => a + quests[id].effortRaw, 0);
  const feas = qs.map(id => quests[id].soloFeasible);
  // combined place overlap (shared trips)
  const placeSets = qs.map(id => new Set(quests[id].steps.filter(s => s.x != null).map(s => s.where)));
  const shared = [...new Set([].concat(...placeSets.map(s => [...s])))].filter(p => placeSets.filter(s => s.has(p)).length > 1);
  return { cls: c.to, from: c.from, toId: c.toId, master: c.master, team: TEAM[c.toId] || '', quests: qs,
    acceptFirst: first, diamondsFirst: first ? dia(first) : 0,
    order: [first].concat(qs.filter(x => x !== first).sort((a, b) => quests[a].effortRaw - quests[b].effortRaw)),
    totals: { soe: sum('soe'), teleportAdena: sum('teleportAdena'), estKills: sum('estKills'), estMinutesSolo: sum('estMinutesSolo'), estMinutesParty: sum('estMinutesParty') },
    sharedPlaces: shared, effortRaw: +raw.toFixed(1),
    soloFeasible: feas.includes('no') ? 'no' : feas.includes('risky') ? 'risky' : 'yes' };
});
const maxC = Math.max(...classes.map(c => c.effortRaw));
classes.forEach(c => { c.effortScore = Math.round(100 * c.effortRaw / maxC); });
classes.sort((a, b) => a.effortScore - b.effortScore);

// ------------------------------------------------------------------ team route (merged)
const TEAM_PLAN = [
  { char: 'Tank1', id: 33 }, { char: 'Bishop1', id: 16 }, { char: 'Destroyer1', id: 46 }, { char: 'Destroyer2', id: 46 },
  { char: 'Doombringer1', id: 127 }, { char: 'Inspector1', id: 128 }, { char: 'Necro1', id: 13 }, { char: 'Chanter1', id: 52 }, { char: 'Saint1', id: 43 }];
function teamRoute() {
  const members = TEAM_PLAN.map(m => { const c = classes.find(x => x.toId === m.id); return { char: m.char, cls: c.cls, quests: c.order, first: c.acceptFirst, diamonds: c.diamondsFirst }; });
  // Round 0: everyone accepts their diamond quest first (only the first accepted 2nd-class quest pays diamonds).
  const accepts = members.map(m => { const st = quests[m.first].steps[0]; return { char: m.char, quest: m.first, npc: st.npc.name, where: st.where, x: st.x, y: st.y, diamonds: m.diamonds }; });
  const acceptStops = []; let pos = { x: TOWNS.Giran.x, y: TOWNS.Giran.y };
  const left = accepts.slice();
  while (left.length) {
    left.sort((a, b) => travel(pos, a).t - travel(pos, b).t);
    const a = left[0]; const tr = travel(pos, a);
    const here = left.filter(b => dist(b, a) < 3000); here.forEach(b => left.splice(left.indexOf(b), 1));
    acceptStops.push({ where: a.where, travel: tr.legs, soe: tr.soe, adena: tr.adena, accepts: here });
    pos = a;
  }
  // Waves: one quest at a time, nearest start first.
  const need = {}; members.forEach(m => m.quests.forEach(q => { (need[q] = need[q] || []).push(m.char); }));
  const todo = Object.keys(need).map(Number); const waves = [];
  while (todo.length) {
    todo.sort((a, b) => travel(pos, quests[a].steps.find(s => s.x != null)).t - travel(pos, quests[b].steps.find(s => s.x != null)).t);
    const q = todo.shift(); const Q = quests[q]; const first = Q.steps.find(s => s.x != null); const tr = travel(pos, first);
    waves.push({ wave: waves.length + 1, quest: q, title: Q.title, credit: need[q], helpers: members.map(m => m.char).filter(c => !need[q].includes(c)),
      travelToStart: tr.legs, soe: tr.soe + Q.totals.soe, adena: tr.adena + Q.totals.teleportAdena, estKillsPerMember: Q.totals.estKills,
      estKillsTotal: Q.totals.estKills * need[q].length, minutes: Math.round(tr.t / 60) + Math.round(Q.totals.estMinutesParty + (need[q].length - 1) * Q.totals.estKills * KILL_PARTY / 60),
      danger: Q.totals.danger, flags: Q.totals.flags, places: [...new Set(Q.steps.filter(s => s.x != null).map(s => s.where))] });
    const last = [...Q.steps].reverse().find(s => s.x != null); pos = last;
  }
  const totals = { acceptStops: acceptStops.length, waves: waves.length,
    soePerMember: acceptStops.reduce((a, s) => a + s.soe, 0) + waves.reduce((a, w) => a + w.soe, 0),
    teleportAdenaPerMember: acceptStops.reduce((a, s) => a + s.adena, 0) + waves.reduce((a, w) => a + w.adena, 0),
    killsTotal: waves.reduce((a, w) => a + w.estKillsTotal, 0), hours: +(waves.reduce((a, w) => a + w.minutes, 0) / 60).toFixed(1) };
  return { members, accepts: acceptStops, waves, totals };
}const team = teamRoute();

// ------------------------------------------------------------------ write JSON
const out = { meta: { generated: new Date().toISOString().slice(0, 10), source: 'L2J High Five datapack quest Java (Shagooh/l2j-server-datapack main) + spawns_h5/teleports_h5. Manual step order for the team quests (64,65,66,211,212,214,215,217,219,220,223,226,227,229,233); summary order for the rest (213,216,218,221,222,224,225,228,230,231,232).',
  model: { walkUnitsPerSec: WALK, hopSec: HOP_S, soeSec: SOE_S, killSecSolo: 'lvl<=36: 30s, +10s per mob level above 36', killSecParty: KILL_PARTY,
    soloFeasibility: 'With free Community Board buffs (~20-28 incl. Might/Shield/Haste/Acumen/Berserker/Wind Walk) at lvl 35-40. no = quest boss/party flag or 2+ steps with lvl 42+ mobs; risky = one lvl 42+ step or 2+ lvl 40-41 steps.',
    effort: 'raw = kills*0.35 + hops*1.5 + walkKm*0.8 + SoE*2 + adena/8000 + places*1.2 + talks*0.3 + 7 per dangerous step + 4 per low-chance step + weapon 6 / skill 8 / spawn 4 / timed 3 / boss 3 / party 6 / adena-fee 4; scaled 0-100 against the hardest.' } },
  quests, classes, teamRoute: team };
fs.writeFileSync(D + 'routes_second_class_h5.json', JSON.stringify(out, null, 1));

// ------------------------------------------------------------------ markdown
const legTxt = l => l.action === 'soe' ? `SoE → ${l.to}` : l.action === 'teleport' ? `GK ${l.from} → ${l.to} (${l.price.toLocaleString('en')} a)` : `walk ${(l.dist / 1000).toFixed(1)} km → ${l.to}`;
function questMd(q) {
  const t = q.totals; const L = [];
  L.push(`### ${q.id} ${q.title}  (effort ${q.effortScore}/100, solo: ${q.soloFeasible})`);
  L.push(`Min lvl ${q.minLevel || '?'} · ${q.diamonds} Dimensional Diamonds if accepted first · party credit: ${q.partyShared} · detail: ${q.detail}`);
  L.push(`**Totals:** ${t.soe} SoE · ${t.teleportHops} teleports (${t.teleportAdena.toLocaleString('en')} adena) · walk ${t.walkKm} km · ~${t.estKills} kills · ${t.places} places · ~${t.estMinutesSolo} min solo / ~${t.estMinutesParty} min in the 9-man party` +
    (t.danger.length ? ` · danger: ${t.danger.join('; ')}` : '') + (t.flags.length ? ` · flags: ${t.flags.join(', ')}` : ''));
  L.push('', '| # | cond | travel | action | where | details |', '|---|---|---|---|---|---|');
  for (const s of q.steps) {
    const what = s.action === 'kill'
      ? `kill ${s.mobs.map(m => `${m.name} (${m.level}${m.aggressive ? ', aggro' : ''})`).join(', ')}${s.item ? ` → ${s.item.name.replace(/_/g, ' ').toLowerCase()} ×${s.item.count}${s.item.chance < 100 ? ` @${s.item.chance}%` : ''}` : ''} · ~${s.estKills} kills`
      : `${s.action === 'turnin' ? '**turn in** ' : 'talk '}${s.npc.name}${s.npc.title ? ` (${s.npc.title})` : ''}`;
    L.push(`| ${s.step} | ${s.cond} | ${s.travel.map(legTxt).join(' → ') || '–'} | ${what} | ${s.where}${s.x != null ? ` (${s.x}, ${s.y})` : ''} | ${(s.note || '').replace(/\|/g, '/')}${s.flags ? ` **[${s.flags.join('; ')}]**` : ''} |`);
  }
  if (q.unresolved.length) L.push('', `_Unresolved names: ${q.unresolved.join(', ')}_`);
  return L.join('\n');
}
const md = [];
md.push('# 2nd class change (level 40): routes for every class', '',
  `Generated ${out.meta.generated} by \`docs/plan/tools/routes.js\` from the L2J High Five datapack. Data: \`Scripts/data/routes_second_class_h5.json\`.`,
  'Team quests (64, 65, 66, 211, 212, 214, 215, 217, 219, 220, 223, 226, 227, 229, 233) were reconstructed step by step from the Java state machines; the others (213, 216, 218, 221, 222, 224, 225, 228, 230, 231, 232) are summary routes (correct order, fewer dialog details). L2Toggle may differ: verify the first run.', '',
  '**Rules that apply to every class**',
  '- Level: most marks can be started at 35-39, the class change itself needs **level 40**. Turn the marks in at your race\'s class master (Grand Master / High Priest / Kamael Grand Master).',
  '- **Dimensional Diamonds:** only the **first** 2nd-class quest you *accept* pays its one-time diamond bonus. Accept the quest with the biggest number first (column "accept first").',
  '- **Credit is killer-only** in all of these quests (getQuestState(killer)): in a party, the member who needs the item must land the killing blow. The team route below rotates last hits.',
  '- **SoE counts** assume you return to town with a Scroll of Escape whenever that is faster than walking; carry +2 spare. Teleport adena is per character.',
  '- Times assume board buffs (Wind Walk etc.) and lvl 37-39; party time assumes the 9-man team.', '');
md.push('## Easiest 2nd class changes (ranked)', '', '| rank | class | from | team | quests (accept first) | effort | solo | SoE | teleport adena | kills | min solo | min party |', '|---|---|---|---|---|---|---|---|---|---|---|---|');
classes.forEach((c, i) => md.push(`| ${i + 1} | ${c.cls} | ${c.from} | ${c.team} | ${c.order.join(' → ')} (${c.acceptFirst}: ${c.diamondsFirst} diamonds) | ${c.effortScore} | ${c.soloFeasible} | ${c.totals.soe} | ${c.totals.teleportAdena.toLocaleString('en')} | ${c.totals.estKills} | ${c.totals.estMinutesSolo} | ${c.totals.estMinutesParty} |`));
md.push('', '## Quests ranked easiest → hardest', '', '| quest | effort | solo | SoE | teleports | adena | kills | places | min solo | min party | danger |', '|---|---|---|---|---|---|---|---|---|---|---|');
Object.values(quests).sort((a, b) => a.effortScore - b.effortScore).forEach(q => md.push(`| ${q.id} ${q.title} | ${q.effortScore} | ${q.soloFeasible} | ${q.totals.soe} | ${q.totals.teleportHops} | ${q.totals.teleportAdena.toLocaleString('en')} | ${q.totals.estKills} | ${q.totals.places} | ${q.totals.estMinutesSolo} | ${q.totals.estMinutesParty} | ${q.totals.danger.join('; ')} |`));
md.push('', '## Per class: which quests, in which order', '');
for (const c of classes.slice().sort((a, b) => (b.team ? 1 : 0) - (a.team ? 1 : 0))) {
  md.push(`### ${c.cls}${c.team ? ` (team: ${c.team})` : ''}`, `From ${c.from} · master: ${c.master} · effort ${c.effortScore}/100 · solo: ${c.soloFeasible}`,
    `Order: **${c.order.join(' → ')}** (accept ${c.acceptFirst} first: ${c.diamondsFirst} diamonds) · totals: ${c.totals.soe} SoE, ${c.totals.teleportAdena.toLocaleString('en')} adena teleports, ~${c.totals.estKills} kills, ~${c.totals.estMinutesSolo} min solo / ~${c.totals.estMinutesParty} min party.`,
    c.sharedPlaces.length ? `Places shared by its quests (do them in one trip): ${c.sharedPlaces.join(', ')}.` : '', '');
}
md.push('## Quest routes (step by step)', '');
const order = [64, 65, 66, 211, 212, 214, 215, 217, 219, 220, 223, 226, 227, 229, 233, 213, 216, 218, 221, 222, 224, 225, 228, 230, 231, 232];
order.forEach(id => { if (quests[id]) md.push(questMd(quests[id]), ''); });
fs.mkdirSync(__ROOT + '/docs/plan/routes', { recursive: true });
fs.writeFileSync(__ROOT + '/docs/plan/routes/second_class.md', md.join('\n'));

const tm = [];
tm.push('# Team plan: 2nd class for all 9 together', '',
  'The 9 need 14 different mark quests. Travelling as one group through a merged route of all of them gives about 200 stops, so the plan is **waves**: the whole party runs ONE quest at a time. The members who need that mark take the killing blows and talk to the NPCs; the others escort and help kill. Credit in these quests is killer-only, so rotate last hits.', '',
  '| char | class | quests (accept first → rest) | diamonds |', '|---|---|---|---|');
team.members.forEach(m => tm.push(`| ${m.char} | ${m.cls} | ${m.quests.join(' → ')} | ${m.diamonds} |`));
tm.push('', `**Totals per character:** ${team.totals.soePerMember} SoE (carry ${team.totals.soePerMember + 3} incl. spares), ${team.totals.teleportAdenaPerMember.toLocaleString('en')} adena on teleports, ~${team.totals.killsTotal} kills for the whole team, roughly ${team.totals.hours} h of play in the 9-man party.`, '',
  '## Round 0: everyone accepts their diamond quest FIRST', 'Only the first 2nd-class quest a character accepts pays the Dimensional Diamond bonus. Before any wave, visit these start NPCs (others just wait/follow):', '');
team.accepts.forEach((a, i) => tm.push(`${i + 1}. **${a.where}** (travel: ${a.travel.map(legTxt).join(' → ') || 'here'}): ${a.accepts.map(x => `${x.char} accepts ${x.quest} at ${x.npc} (${x.diamonds} diamonds)`).join('; ')}`));
tm.push('', '## Waves (one quest at a time, nearest start next)', '');
team.waves.forEach(w => {
  tm.push(`### Wave ${w.wave}: ${w.quest} ${w.title}`,
    `Credit: **${w.credit.join(', ')}** · helpers: ${w.helpers.join(', ') || 'none'} · ~${w.minutes} min · ${w.soe} SoE · ${w.adena.toLocaleString('en')} adena per char · ~${w.estKillsTotal} kills (team)` + (w.danger.length ? ` · danger: ${w.danger.join('; ')}` : '') + (w.flags.length ? ` · flags: ${w.flags.join(', ')}` : ''),
    `Travel to the start: ${w.travelToStart.map(legTxt).join(' → ') || 'already there'}`,
    `Places: ${w.places.join(' → ')}`, `Step-by-step: see quest ${w.quest} in second_class.md.`, '');
});fs.writeFileSync(__ROOT + '/docs/plan/routes/second_class_team.md', tm.join('\n'));
console.log('quests', Object.keys(quests).length, 'classes', classes.length, 'team', JSON.stringify(team.totals));
console.log(classes.map(c => `${c.cls}:${c.effortScore}/${c.soloFeasible}`).join(' | '));
for (const q of Object.values(quests)) if (q.unresolved.length) console.log('UNRESOLVED', q.id, q.unresolved.join(','));
