// BRAIN (2026-10-12, user: "build what I asked about" = a tiny agent script per character + ONE central brain; the road to 200 accounts).
// Every character that runs Scripts/agent.js keeps one TCP connection to this process (127.0.0.1:8093, one JSON object per line):
//   agent -> brain: hello, st (state every 500 ms, full every 2 s: mobs, party, key items), ack, died, ported, chat, sys, err
//   brain -> agent: { id, a: move|stop|follow|bot|combat|target|attack|cast|item|say|party|town|invite|accept|sit|respawn|bypass|reflex|state|ping, ... }
// The brain decides; the agents only report and obey (their only local logic: potions + accepting their leader's invite).
// Restart the brain any time (node Dashboard/brain.js, or the dashboard restarts it): agents reconnect within ~3 s.
//
// Control: Scripts/data/brain_parties.json (read every 5 s) { "<party leader>": { mode: 'off'|'hunt', x, y, z, r } }
//   hunt = the leader fights inside a circle (L2Swarm combat, radius r around x,y,z), members follow + assist (healers follow, no assist),
//   a member > 2500 from the leader walks to him, a dead character is respawned after 60 s when no living teammate is near.
// Live: Logs/brain_state.json (every 2 s), Logs/brain.log.   Version 0 = hunt-here only; travel / supply / raids come next, one by one.
'use strict';
const net = require('net'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.L2S_BRAIN_PORT || 8093);
const LOGF = process.env.L2S_BRAIN_LOG || path.join(ROOT, 'Logs', 'brain.log');
const STATEF = process.env.L2S_BRAIN_STATE || path.join(ROOT, 'Logs', 'brain_state.json');
const PARTYF = process.env.L2S_BRAIN_PARTIES || path.join(ROOT, 'Scripts', 'data', 'brain_parties.json');
const CFGF = process.env.L2S_BRAIN_CONFIG || path.join(ROOT, 'swarm.config.json');
const log = (m) => { try { fs.appendFileSync(LOGF, `${new Date().toISOString()} ${m}\r\n`); } catch (e) { } };
const readJ = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch (e) { return d; } };
const HEALER = /bishop|healer|shilliensaint|saint|elder|cardinal|eva|shillien/i;

// ---------------------------------------------------------------- agents
const agents = new Map();          // name -> { sock, st, at, hello, pending: Map(id -> {a, at}), sent, acks, lastOrder: {} }
let nextId = 1;
function send(name, order) {
  const A = agents.get(name); if (!A || !A.sock || A.sock.destroyed) return false;
  const id = nextId++; A.sent++; A.pending.set(id, { a: order.a, at: Date.now() });
  A.sock.write(JSON.stringify(Object.assign({ id }, order)) + '\n'); return id;
}
/** send only when the order changed or `everyMs` passed (no spamming the same follow / combat order every tick) */
function order(name, key, o, everyMs) {
  const A = agents.get(name); if (!A) return false;
  const sig = JSON.stringify(o), last = A.lastOrder[key];
  if (last && last.sig === sig && Date.now() - last.at < (everyMs || 30000)) return false;
  A.lastOrder[key] = { sig, at: Date.now() }; return send(name, o);
}
const srv = net.createServer((sock) => {
  sock.setNoDelay(true); sock.setEncoding('utf8');
  let buf = '', name = '';
  sock.on('data', (chunk) => {
    buf += chunk; let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1); if (!line.trim()) continue;
      let m; try { m = JSON.parse(line); } catch (e) { continue; }
      if (m.t === 'hello') {
        name = String(m.name || '');
        const old = agents.get(name); if (old && old.sock !== sock) { try { old.sock.destroy(); } catch (e) { } }
        agents.set(name, { sock, st: null, at: Date.now(), hello: m, pending: new Map(), sent: 0, acks: 0, fails: 0, lastOrder: {}, deadAt: 0 });
        log(`agent ${name} connected (lv ${m.level}, class ${m.cls})`); continue;
      }
      const A = agents.get(name); if (!A) continue;
      A.at = Date.now();
      if (m.t === 'st') { A.st = Object.assign(A.st || {}, m); if (!m.dead) A.deadAt = 0; else if (!A.deadAt) A.deadAt = Date.now(); }
      else if (m.t === 'ack') { const p = A.pending.get(m.id); A.pending.delete(m.id); A.acks++; if (!m.ok) { A.fails++; log(`${name}: ${p ? p.a : m.a} failed: ${m.error || ''}`); } }
      else if (m.t === 'died') { A.deadAt = Date.now(); log(`${name} died`); }
      else if (m.t === 'chat') { A.lastChat = m; }
      else if (m.t === 'err') { A.fails++; log(`${name}: error ${m.error}`); }
    }
  });
  sock.on('close', () => { const A = agents.get(name); if (A && A.sock === sock) { agents.delete(name); log(`agent ${name} disconnected`); } });
  sock.on('error', () => { });
});

// ---------------------------------------------------------------- parties (swarm.config.json) + control file
let CFG = { accounts: [] }, cfgAt = 0, PCTL = {}, pctlAt = 0;
function parties() {
  if (Date.now() - cfgAt > 60000) { CFG = readJ(CFGF, CFG) || CFG; cfgAt = Date.now(); }
  const P = {};
  (CFG.accounts || []).filter(a => a.autoStart !== false && a.character).forEach(a => { const k = a.party || a.character; (P[k] = P[k] || []).push({ name: a.character, role: a.role || '' }); });
  return P;
}
function control() { if (Date.now() - pctlAt > 5000) { PCTL = readJ(PARTYF, {}) || {}; pctlAt = Date.now(); } return PCTL; }
const dist = (a, b) => Math.hypot((a.x || 0) - (b.x || 0), (a.y || 0) - (b.y || 0));

// ---------------------------------------------------------------- the party brain (v0: hunt here)
const partyRt = {};                 // leader -> runtime { phase, since, note }
function tickParty(leader, members, ctl) {
  const rt = partyRt[leader] = partyRt[leader] || { phase: 'idle', since: Date.now(), note: '' };
  const set = (phase, note) => { if (rt.phase !== phase) { rt.phase = phase; rt.since = Date.now(); log(`party ${leader}: ${phase}${note ? ' — ' + note : ''}`); } rt.note = note || ''; };
  const L = agents.get(leader);
  const online = members.filter(m => agents.has(m.name) && agents.get(m.name).st);
  if (!ctl || ctl.mode !== 'hunt') { set('off', 'no brain order for this party'); return; }
  if (!L || !L.st) { set('waiting', 'the leader runs no agent'); return; }
  const spot = { x: Number(ctl.x), y: Number(ctl.y), z: Number(ctl.z) }, r = Math.max(600, Math.min(6000, Number(ctl.r) || 2000));
  // leader: fight inside the circle
  if (L.st.dead) set('leader dead');
  else {
    const away = dist(L.st, spot);
    if (away > r + 1500) { set('to spot', `${Math.round(away)} from the spot`); order(leader, 'combat', { a: 'combat', on: false }, 20000); order(leader, 'move', { a: 'move', x: spot.x, y: spot.y, z: spot.z }, 8000); }
    else { set('hunting', `${(L.st.mobs || []).length} monsters near`); order(leader, 'bot', { a: 'bot', on: true }); order(leader, 'combat', { a: 'combat', on: true, x: spot.x, y: spot.y, z: spot.z, r }, 60000); }
  }
  // members: follow + assist (healers no assist), walk back when far, respawn when dead and alone
  for (const m of members) {
    if (m.name === leader) continue;
    const A = agents.get(m.name); if (!A || !A.st) continue;
    const healer = HEALER.test(m.role);
    if (A.st.dead) {
      const mateNear = online.some(o => o.name !== m.name && !agents.get(o.name).st.dead && dist(agents.get(o.name).st, A.st) < 1500 && HEALER.test(o.role));
      if (A.deadAt && Date.now() - A.deadAt > (mateNear ? 120000 : 60000)) order(m.name, 'respawn', { a: 'respawn', point: 0 }, 30000);
      continue;
    }
    order(m.name, 'bot', { a: 'bot', on: true });
    order(m.name, 'follow', { a: 'follow', name: leader, on: true, assist: !healer, dist: healer ? 200 : 100 }, 60000);
    if (!L.st.dead && dist(A.st, L.st) > 2500 && dist(A.st, L.st) < 20000) order(m.name, 'move', { a: 'move', x: L.st.x, y: L.st.y, z: L.st.z }, 8000);
  }
  if (L.st.dead && L.deadAt && Date.now() - L.deadAt > 60000 && !online.some(o => o.name !== leader && HEALER.test(o.role) && !agents.get(o.name).st.dead)) order(leader, 'respawn', { a: 'respawn', point: 0 }, 30000);
}
function tick() {
  const P = parties(), C = control();
  for (const [leader, members] of Object.entries(P)) { try { tickParty(leader, members, C[leader]); } catch (e) { log(`party ${leader}: ${e.message}`); } }
}
function writeState() {
  const out = { at: new Date().toISOString(), port: PORT, agents: [], parties: {} };
  for (const [n, A] of agents) out.agents.push({ name: n, ageMs: Date.now() - A.at, sent: A.sent, acks: A.acks, fails: A.fails, pending: A.pending.size, st: A.st ? { x: A.st.x, y: A.st.y, z: A.st.z, hp: A.st.hp, mp: A.st.mp, lv: A.st.lv, dead: A.st.dead, combat: A.st.combat, bot: A.st.bot, mobs: (A.st.mobs || []).length } : null });
  for (const [k, rt] of Object.entries(partyRt)) out.parties[k] = rt;
  try { const t = STATEF + '.tmp'; fs.writeFileSync(t, JSON.stringify(out)); fs.renameSync(t, STATEF); } catch (e) { }
}
setInterval(tick, 1000);
setInterval(writeState, 2000);
// stale pending orders (agent never answered) are dropped after 30 s
setInterval(() => { for (const A of agents.values()) for (const [id, p] of A.pending) if (Date.now() - p.at > 30000) { A.pending.delete(id); A.fails++; } }, 10000);
srv.on('error', (e) => { log('server error: ' + e.message); if (e.code === 'EADDRINUSE') process.exit(2); });
srv.listen(PORT, '127.0.0.1', () => log(`brain listening on 127.0.0.1:${PORT} (pid ${process.pid})`));
module.exports = { agents, partyRt, tick };
