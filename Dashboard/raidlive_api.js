// RAIDLIVE HUD (user 2026-10-09 09:30: "whenever we go into raid LIVE watch I want to see the skills and debuffs just as on mobile and iPad.
// On PC it should be even better ... way more detailed"). Adds to /api/raidlive (Logs/raid_live.json) and /api/kamalive (Logs/kamaloka_live.json)
// everything the live views draw that the leader's file does not carry itself. Required by server.js (lines marked RAIDLIVE HUD):
//   enrich(d, kind, ctx)  kind 'raid' | 'kama', ctx { LOGS, DATA, readJson }
// Adds:
//   bossTarget      fallback = the boss's last attack target (OnTargetSelected never fires for the boss, so 'Target: —' was shown all fight)
//   hpHist          [[s since start, hp %]] - the writer's (swarm.js raidHudExtras, after the next deploy) or sampled here on every poll
//   heals           Logs/raid_heals.log lines since the fight started: { t, at, healer, skill, skillId, target, hp }
//   party[].st      the member's own Logs/swarm_state_<name>.json: class, level, cp, debuffs, buffs (count / list), long cast, last skill
//   debuffs         + debuffs derived from the members' cast history (party[].skills, written by swarm.js after the next deploy) when the
//                   caster's own report (swarm.bossdebuff) is missing
//   skillMeta       { id: { n, hit, scope, ar, dur, abn, deb } } for every skill id in the payload (cast bars, AoE circles, debuff timers)
//   abnIcon         { ABNORMAL_TYPE: skill id } - an icon for the member debuff types (swarm.pos deb)
//   totals          { deaths, res, heals, ud, potions, dealt, taken }
'use strict';
const fs = require('fs');
const path = require('path');

let SK = null, SKN = null, ABNI = null, NAMEID = null, RB = null;
function first(v, tables) {
  if (v == null) return null;
  v = String(v).trim();
  if (v.startsWith('#')) { const t = tables[v]; if (!t) return null; v = t.trim().split(/\s+/)[0]; }
  const n = Number(v); return isNaN(n) ? v : n;
}
/** Datapack skills (Scripts/data/dp/skills/*.xml): hitTime, affectScope, affectRange, abnormalTime, abnormalType, operateType, targetType. */
function skillDb(DATA) {
  if (SK) return SK;
  SK = {};
  try {
    const dir = path.join(DATA, 'dp', 'skills');
    for (const f of fs.readdirSync(dir).filter(n => /\.xml$/i.test(n))) {
      const x = fs.readFileSync(path.join(dir, f), 'utf8');
      for (const chunk of x.split(/<skill id="/).slice(1)) {
        const id = parseInt(chunk, 10); if (!id || SK[id]) continue;
        const end = chunk.indexOf('</skill>'), body = end > 0 ? chunk.slice(0, end) : chunk;
        const head = /^\d+"[^>]*name="([^"]*)"/.exec(body);
        const tables = {}; body.replace(/<table name="(#[^"]+)">([^<]*)<\/table>/g, (_, k, v) => { tables[k] = v; return ''; });
        const set = {}; body.replace(/<set name="(\w+)" val="([^"]*)"\s*\/>/g, (_, k, v) => { if (set[k] === undefined) set[k] = v; return ''; });
        SK[id] = { n: head ? head[1] : '', hit: first(set.hitTime, tables) || 0, scope: set.affectScope || '', ar: first(set.affectRange, tables) || 0,
          dur: first(set.abnormalTime, tables) || 0, abn: set.abnormalType || '', op: set.operateType || '', tt: set.targetType || '', reuse: first(set.reuseDelay, tables) || 0 };
      }
    }
  } catch (e) { }
  return SK;
}
/** Dashboard/data/skills.json: id -> [name, icon, debuff, operate type]. */
function skillNames(ctx) {
  if (SKN) return SKN;
  SKN = ctx.readJson(path.join(__dirname, 'data', 'skills.json'), {}) || {};
  NAMEID = {}; Object.keys(SKN).forEach(id => { const n = String((SKN[id] || [])[0] || '').toLowerCase(); if (n && !NAMEID[n]) NAMEID[n] = +id; });
  return SKN;
}
/** ABNORMAL_TYPE -> a skill id with that type and an icon (the debuff icon on a member). Debuff skills first. */
function abnIcons(ctx) {
  if (ABNI) return ABNI;
  const db = skillDb(ctx.DATA), nm = skillNames(ctx);
  ABNI = {};
  [true, false].forEach(debFirst => Object.keys(db).forEach(id => {
    const s = db[id]; if (!s.abn || ABNI[s.abn] || !nm[id] || !nm[id][1]) return;
    if (debFirst && !(nm[id][2] === 1)) return;
    ABNI[s.abn] = +id;
  }));
  return ABNI;
}
function tailLines(file, bytes) {
  let fd = null;
  try {
    fd = fs.openSync(file, 'r');
    const size = fs.fstatSync(fd).size, n = Math.min(size, bytes), buf = Buffer.alloc(n);
    fs.readSync(fd, buf, 0, n, size - n);
    const lines = buf.toString('utf8').split(/\r?\n/).filter(Boolean);
    if (size > n) lines.shift();
    return lines;
  } catch (e) { return []; } finally { if (fd !== null) try { fs.closeSync(fd); } catch (e) { } }
}
const HP = {};                          // startedMs -> [[s, hp]] sampled on every poll (until the writer's hpHist is deployed)
const hhmmss = (ms) => { const d = new Date(ms); return [d.getHours(), d.getMinutes(), d.getSeconds()].map(x => String(x).padStart(2, '0')).join(':'); };

function enrich(d, kind, ctx) {
  try {
    if (!d || !(d.running || d.finished) || !Array.isArray(d.party)) return d;
    const db = skillDb(ctx.DATA), nm = skillNames(ctx);
    const start = +d.startedMs || Date.parse(d.startedAt || 0) || 0;
    const boss = kind === 'raid' ? (d.boss || {}) : ((d.mobs || []).find(m => m.boss && !m.dead) || null);
    // 0. the boss's datapack id (drop list: /api/raid/<id>) and level
    if (kind === 'raid' && boss && boss.name) {
      if (!RB) { const db = ctx.readJson(path.join(ctx.DATA, 'raidbosses_h5.json'), { bosses: [] }); RB = {}; (db.bosses || []).forEach(x => { if (!RB[x.name]) RB[x.name] = { id: x.id, level: x.level }; }); }
      const r = RB[boss.name]; if (r) { d.bossId = r.id; d.bossLevel = r.level; }
    }
    // 0b. RAID FIGHT AREA (2026-10-09): the boss's fight / clear area + stage from Scripts/data/raid_areas.json (dashboard shape editor) for the
    //     live map; the leader's own d.area (swarm.js RAIDAREA: what the bots use, + monsters left to clear) is drawn first when present
    if (kind === 'raid' && (boss && boss.name || d.bossName)) {
      if (!RB) { const db = ctx.readJson(path.join(ctx.DATA, 'raidbosses_h5.json'), { bosses: [] }); RB = {}; (db.bosses || []).forEach(x => { if (!RB[x.name]) RB[x.name] = { id: x.id, level: x.level }; }); }
      const r = RB[(boss && boss.name) || d.bossName];
      if (r && !d.bossId) { d.bossId = r.id; d.bossLevel = r.level; }
      const A = r ? ctx.readJson(path.join(ctx.DATA, 'raid_areas.json'), null) : null, a = A && A.areas && A.areas[String(r.id)];
      if (a && a.enabled !== false) d.raidArea = { fight: a.fight || null, clear: a.clear || null, clearMargin: a.clearMargin || 0, stage: a.stage || null, updated: a.updated || null };
    }
    // 1. who the boss is on
    if (kind === 'raid' && !d.bossTarget && boss && boss.act && boss.act.target) { d.bossTarget = boss.act.target; d.bossTargetSrc = 'attack'; }
    // 2. boss HP over time
    if (kind === 'raid' && !(Array.isArray(d.hpHist) && d.hpHist.length) && start) {
      const h = HP[start] || (HP[start] = []);
      Object.keys(HP).forEach(k => { if (+k !== start && Date.now() - +k > 3 * 3600e3) delete HP[k]; });
      const s = Math.round((Date.parse(d.updatedAt || 0) - start) / 1000);
      if (boss && boss.hp != null && s >= 0 && (!h.length || s - h[h.length - 1][0] >= 2)) { h.push([s, boss.hp]); if (h.length > 900) h.splice(0, h.length - 900); }
      d.hpHist = h;
    }
    // 3. heals since the start (Logs/raid_heals.log: iso, healer, skill name, target, target hp %)
    const names = new Set(d.party.map(p => p.name));
    skillNames(ctx);
    d.heals = tailLines(path.join(ctx.LOGS, 'raid_heals.log'), 64000).map(l => l.split('\t')).map(([at, healer, skill, target, hp]) => ({ ms: Date.parse(at), healer, skill, target, hp: hp === '' || hp == null ? null : +hp }))
      .filter(h => h.ms && start && h.ms >= start - 2000 && names.has(h.healer))
      .slice(-80).map(h => ({ t: hhmmss(h.ms), at: new Date(h.ms).toISOString(), healer: h.healer, skill: h.skill, skillId: NAMEID[String(h.skill || '').toLowerCase()] || 0, target: h.target, hp: h.hp }));
    // 4. each member's own state file
    d.party.forEach(p => {
      const s = ctx.readJson(path.join(ctx.LOGS, 'swarm_state_' + p.name + '.json'), null);
      if (!s) return;
      const age = Math.round((Date.now() - Date.parse(s.updated || 0)) / 1000);
      p.st = { cls: s.cls || '', classId: s.classId ?? null, level: s.level ?? null, cp: s.cp ?? null, deb: s.deb || null, buffs: s.buffs ?? null, buffLeft: s.buffLeft ?? null,
        buffList: Array.isArray(s.buffList) ? s.buffList : null, cast: s.cast || null, lastSkill: s.lastSkill || null, soe: s.soe ?? null, res: s.res ?? null, ageSec: age, ov: s.ov || null };
      const ov = ctx.readJson(path.join(ctx.LOGS, 'override_' + p.name + '.json'), null);   // the last user override's result (swarm.js raidOverride) -> toast
      if (ov && Date.now() - Date.parse(ov.at || 0) < 180000) p.ovRes = ov;
      if (p.cp == null && s.cp != null) p.cp = s.cp;
      if (!p.deb && Array.isArray(s.deb)) p.deb = s.deb;
    });
    // 5. debuffs on the boss from the casters' history (only when their own report is missing)
    if (kind === 'raid' && boss && boss.name) {
      d.debuffs = Array.isArray(d.debuffs) ? d.debuffs : [];
      const have = new Set(d.debuffs.map(x => x.skill + '|' + x.by));
      d.party.forEach(p => (p.skills || []).forEach(c => {
        const s = db[c.skill], n = nm[c.skill];
        if (!s || !n || n[2] !== 1 || c.target !== boss.name || !(s.dur > 0) || /Aggression|Hate|Provoke|Challenge/i.test(n[0])) return;
        const left = Math.round(s.dur - (c.ago || 0));
        if (left <= 0 || have.has(c.skill + '|' + p.name)) return;
        have.add(c.skill + '|' + p.name);
        d.debuffs.push({ skill: c.skill, name: n[0], by: p.name, lvl: 0, desc: '', type: s.abn, dur: s.dur, left, ago: c.ago || 0, resisted: false, interrupted: false, src: 'cast' });
      }));
    }
    // 6. skill facts for every id in the payload
    const ids = new Set();
    const add = (id) => { if (id) ids.add(+id); };
    d.party.forEach(p => { if (p.act) add(p.act.skill); (p.skills || []).forEach(c => add(c.skill)); Object.keys(p.casts || {}).forEach(add); if (p.st) { if (p.st.cast) add(p.st.cast.skill); if (p.st.lastSkill) add(p.st.lastSkill.id); (p.st.buffList || []).forEach(b => add(b.id)); ((p.st.ov && p.st.ov.skills) || []).forEach(s => add(s.id)); } });
    (d.bossCasts || []).forEach(c => add(c.skill)); (d.debuffs || []).forEach(x => add(x.skill)); (d.heals || []).forEach(h => add(h.skillId));
    if (boss) { add(boss.cast); if (boss.act) add(boss.act.skill); }
    (d.minions || d.mobs || []).forEach(m => { add(m.cast); if (m.act) add(m.act.skill); });
    d.skillMeta = {};
    ids.forEach(id => { const s = db[id], n = nm[id]; if (!s && !n) return; d.skillMeta[id] = { n: (n && n[0]) || (s && s.n) || '', hit: s ? s.hit : 0, scope: s ? s.scope : '', ar: s ? s.ar : 0, dur: s ? s.dur : 0, abn: s ? s.abn : '', deb: !!(n && n[2] === 1), op: (n && n[3]) || (s && s.op) || '', reuse: s ? s.reuse : 0 }; });
    const ai = abnIcons(ctx), types = new Set();
    d.party.forEach(p => (p.deb || []).forEach(t => types.add(t)));
    d.abnIcon = {}; types.forEach(t => { if (ai[t]) d.abnIcon[t] = ai[t]; });
    // 7. party totals
    const ev = d.events || [];
    const POT = /potion|elixir|nectar|healing drug/i;     // party[].casts { skillId: count } (swarm.js raidHudSkill, after the next deploy)
    const hasCasts = d.party.some(p => p.casts && Object.keys(p.casts).length);
    const potions = hasCasts ? d.party.reduce((a, p) => a + Object.entries(p.casts || {}).filter(([id]) => POT.test(((nm[id] || [])[0]) || '')).reduce((x, [, n]) => x + n, 0), 0) : null;
    d.totals = { deaths: ev.filter(e => /^DIED:/.test(e.msg || '')).length, res: ev.filter(e => /^back up:/.test(e.msg || '')).length, heals: d.heals.length,
      ud: ev.filter(e => /Ultimate Defense/i.test(e.msg || '')).length, potions,
      dealt: d.party.reduce((a, p) => a + ((p.dmg && p.dmg.dealt) || 0), 0), taken: d.party.reduce((a, p) => a + ((p.dmg && p.dmg.taken) || 0), 0) };
  } catch (e) { d.hudError = String(e && e.message || e); }
  return d;
}

/** /api/override?name=<char>: what the override menu (Dashboard/override.js) needs for one character - its swarm_state (hp/mp/cp, role, ov =
 *  skills with ready/cooldown + potions/scrolls + droppable bag, written by swarm.js ovPublic) + its party + the last override result. */
function overrideInfo(name, ctx) {
  if (!/^[A-Za-z0-9_-]{2,32}$/.test(name)) return { error: 'bad name' };
  const s = ctx.readJson(path.join(ctx.LOGS, 'swarm_state_' + name + '.json'), null);
  const result = ctx.readJson(path.join(ctx.LOGS, 'override_' + name + '.json'), null);
  if (!s) return { name, error: 'no state for ' + name, result };
  let party = [];
  try { const all = ctx.readStates(), me = all.find(c => c.name === name); if (me) party = all.filter(c => ctx.partyOf(c) === ctx.partyOf(me)).map(c => ({ name: c.name, dead: !!c.dead, role: c.role || '' })); } catch (e) { }
  return { name, hp: s.hp ?? null, mp: s.mp ?? null, cp: s.cp ?? null, role: s.role || '', dead: !!s.dead, ov: s.ov || null, ageSec: Math.round((Date.now() - Date.parse(s.updated || 0)) / 1000), party, result };
}

module.exports = { enrich, skillDb, overrideInfo };
