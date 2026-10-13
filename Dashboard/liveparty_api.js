// LIVE PARTY VIEW (user 2026-10-09 09:15: "click 'live' map on any party and see what each party member is doing: aggro, casting,
// fighting, stuck, walking to a location, selling ..."). Required by server.js (block marked LIVEPARTY):
//   GET /api/live?party=<leader>  -> { now, party, leader, parties[], members[] (trimmed swarm_state + intent tail), mobs[], mobsSrc, mobsAge, target }
// ONE batched call per refresh of Dashboard/liveparty.js (every ~1.5 s while the page is open):
//   - members: Logs/swarm_state_<name>.json (readStates; written by swarm.js every 2 s), trimmed to what the view draws
//   - intents: the last few events of Logs/intent_<name>.log (only the last 24 KB are read: the logs are several MB)
//   - mobs: MCP get_account_data mobs around the party leader (range 12000), cached 3 s per leader, at most 2.5 s wait, the old list
//     is kept when MCP is slow/down; plus every member's own aggro list (swarm_state.aggro) so aggro shows even without MCP.
'use strict';
const fs = require('fs');
const path = require('path');
const MapFloors = require('./mapfloors.js');   // MAP FLOORS 2026-10-13: the leader's dungeon floor decides which monsters are sent

const MOBC = {};                    // leader -> { at, list, target, src, pending }

function tailBytes(file, bytes) {
  let fd = null;
  try {
    fd = fs.openSync(file, 'r');
    const size = fs.fstatSync(fd).size, n = Math.min(size, bytes), buf = Buffer.alloc(n);
    fs.readSync(fd, buf, 0, n, size - n);
    const lines = buf.toString('utf8').split(/\r?\n/).filter(Boolean);
    if (size > n) lines.shift();     // the first line is cut
    return lines;
  } catch (e) { return []; } finally { if (fd !== null) try { fs.closeSync(fd); } catch (e) { } }
}

const KEEP = ['name', 'role', 'cls', 'classId', 'level', 'exp', 'hp', 'mp', 'cp', 'dead', 'x', 'y', 'z', 'bot', 'combat', 'mode', 'task', 'leader',
  'regroup', 'soe', 'res', 'shots', 'buffs', 'buffLeft', 'deb', 'notes', 'updated', 'ageSec', 'party', 'intent', 'escape', 'cast', 'rescue',
  'manualSpot', 'combatRange', 'doing', 'tactics', 'route', 'aggro', 'tpos', 'lastSkill', 'expDelta', 'expLog', 'expHour', 'adena', 'spotWatch',
  'trade', 'teamStep', 'buffList', 'oid'];   // v2 2026-10-09 13:00: trade / team step (activity.js), buff icons with time left
function trim(s) {
  const o = {};
  KEEP.forEach(k => { if (s[k] !== undefined) o[k] = s[k]; });
  if (o.notes) o.notes = o.notes.slice(-4);
  // the leader's hunting zone: polygon + name only (the rotation list stays on the Parties tab)
  if (s.zone) o.zone = { x: s.zone.x, y: s.zone.y, r: s.zone.r, name: s.zone.name, poly: s.zone.poly, room: s.zone.room, area: s.zone.area, region: s.zone.region, local: s.zone.local };
  // skills on cooldown + ready (swarm_state.ov, for the key-skill sweeps on the cards); the bag lists stay on the character page
  if (s.ov && Array.isArray(s.ov.skills)) o.ovSkills = s.ov.skills.filter(k => !k.tog).slice(0, 48).map(k => ({ id: k.id, ready: !!k.ready, cd: +k.cd || 0 }));
  if (o.escape && o.escape.steps) o.escape = Object.assign({}, o.escape, { steps: o.escape.steps.slice(-3) });
  return o;
}

async function mobsFor(leader, at, ctx) {
  const c = MOBC[leader] || (MOBC[leader] = { at: 0, list: [], target: null, src: 'none', pending: null });
  if (Date.now() - c.at > 3000 && !c.pending) {
    c.pending = (async () => {
      try {
        const t = await ctx.mcpCallChar('get_account_data', leader, { type: 'mobs', range: 12000 });
        let j = null; try { j = JSON.parse(t); } catch (e) { }
        const arr = Array.isArray(j) ? j : (j && j.mobs) || null;
        if (arr) {
          const lvlOf = (m) => +m.level || +((String(m.title || '').match(/LvL:\s*(\d+)/i) || [])[1]) || 0;
          c.list = arr.filter(m => !m.is_dead).map(m => ({ id: m.obj_id || m.object_id || m.id || null, x: Math.round(m.x), y: Math.round(m.y), z: m.z !== null && m.z !== undefined && isFinite(+m.z) ? Math.round(m.z) : null, lvl: lvlOf(m), n: m.name,
            hp: m.hp_percent != null ? Math.round(m.hp_percent) : null, fight: !!m.is_in_combat, ag: /\bA\b/.test(String(m.title || '')),
            tgt: m.target_id || m.target_obj_id || m.target_object_id || null }));
          c.src = 'mcp';
        }
      } catch (e) { c.src = c.list.length ? 'mcp (old: ' + String(e.message || e).slice(0, 60) + ')' : 'none'; }
      c.at = Date.now(); c.pending = null;
    })();
  }
  if (c.pending) await Promise.race([c.pending, new Promise(r => setTimeout(r, 2500))]);
  // only the leader's floor (Cruma Tower lesson, 2026-10-07; MAP FLOORS 2026-10-13: by the dungeon_rooms.json floor bands, |dz| < 600 outside dungeons)
  const FM = ctx.DATA ? MapFloors.load(path.join(ctx.DATA, 'dungeon_rooms.json')) : null;
  const list = c.list.filter(m => !at || at.z == null || MapFloors.sameLevel(FM, at, m, 600));
  return { list, src: c.src, age: c.at ? Math.round((Date.now() - c.at) / 1000) : null };
}

async function live(party, ctx) {
  const all = ctx.readStates();
  const parties = [...new Set(all.map(ctx.partyOf))].sort();
  const P = party && parties.includes(party) ? party : null;
  if (!P) return { error: party ? 'unknown party ' + party : 'no party given', parties, now: new Date().toISOString() };
  const mem = all.filter(c => ctx.partyOf(c) === P);
  const lead = mem.find(c => c.name === P) || mem.find(c => c.leader) || mem[0];
  const members = mem.map(s => {
    const o = trim(s);
    o.intents = ctx.parseIntents(tailBytes(path.join(ctx.LOGS, 'intent_' + s.name + '.log'), 24000).slice(-60)).slice(0, 6);
    return o;
  });
  const mobs = lead && isFinite(lead.x) && lead.ageSec < 300 ? await mobsFor(lead.name, { x: +lead.x, y: +lead.y, z: lead.z != null && isFinite(+lead.z) ? +lead.z : null }, ctx) : { list: [], src: 'none', age: null };
  // the raid target (if this party hunts one), like /api/partymobs
  let target = null;
  try {
    // 2026-10-10: this party's own hunt file (Logs/raidhunt_party_<leader>.json), the old shared one as a fallback
    const own = ctx.readJson(path.join(ctx.LOGS, 'raidhunt_party_' + P + '.json'), null), shared = ctx.readJson(path.join(ctx.LOGS, 'raidhunt.json'), {});
    const rh = own && own.leader ? own : shared;
    if (rh.active && rh.current && rh.current.name && (!rh.leader || rh.leader === P)) {
      const db = ctx.readJson(path.join(ctx.DATA, 'raidbosses_h5.json'), { bosses: [] });
      const b = (db.bosses || db || []).find(x => x.name === rh.current.name);
      if (b) target = { n: b.name, lvl: b.level, x: b.x, y: b.y };
    }
  } catch (e) { }
  return { now: new Date().toISOString(), party: P, leader: lead ? lead.name : P, parties, members, mobs: mobs.list, mobsSrc: mobs.src, mobsAge: mobs.age, target };
}

module.exports = { live, tailBytes, trim };
