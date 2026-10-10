// Clan + clan event + raid-team templates for the dashboard (user 2026-10-07). Required by server.js (/api/clan, /api/raidteam).
//  - clansFrom(chars, cq): every clan seen in the bots' swarm_state files (clanInfo, written by swarm.js from the server's clan member list),
//    one entry per clan with its leader (detected), our members, the server's member list; plus the configured clan before it exists.
//  - eventBosses(chars, teams, rb): epic bosses (Queen Ant, Core, Orfen, Zaken, Baium, Antharas, Valakas, Frintezza) + level check per party.
//  - matchTemplate(tpl, chars): proposes a team from ALL our characters (any party) for a raid template (Scripts/data/raid_templates.json).
'use strict';
const weakOf = (w) => Array.isArray(w) ? (w.length === 1 ? w[0] : null) : (w || null);   // a list = a tie = no real weak element
const EPICS = ['Queen Ant', 'Core', 'Orfen', 'Zaken', 'Baium', 'Antharas', 'Valakas', 'Frintezza'];

function clansFrom(chars, cq) {
  const by = {};
  chars.forEach(c => {
    const ci = c.clanInfo || null, name = (ci && ci.name) || c.clan || '';
    if (!name) return;
    const k = name.toLowerCase();
    const e = by[k] = by[k] || { name, id: 0, level: 0, leader: '', leaderSeenAt: '', rep: null, ally: '', ours: [], server: [], serverAt: '' };
    e.ours.push({ name: c.name, level: +c.level || 0, cls: c.cls, role: c.role, party: c.party, online: (c.ageSec || 0) < 600, isLeader: ci ? ci.isLeader : null, ccRight: c.ccRight || '' });
    if (ci) {
      if (ci.id) e.id = ci.id;
      if (ci.level > e.level) e.level = ci.level;
      if (ci.ally) e.ally = ci.ally;
      if (ci.leader && (!e.leaderSeenAt || String(ci.seenAt) > e.leaderSeenAt)) { e.leader = ci.leader; e.leaderSeenAt = String(ci.seenAt || ''); if (ci.rep != null) e.rep = ci.rep; }
      if ((ci.members || []).length && (!e.serverAt || String(ci.seenAt) > e.serverAt)) { e.server = ci.members; e.serverAt = String(ci.seenAt || ''); }
    }
  });
  const list = Object.values(by).map(e => {
    const lc = chars.find(c => c.name === e.leader) || null;
    return Object.assign(e, { leaderOurs: !!lc, leaderParty: lc ? lc.party : null, leaderLevel: lc ? +lc.level || 0 : null, detected: !!e.leader });
  }).sort((a, b) => (b.leaderOurs - a.leaderOurs) || b.ours.length - a.ours.length);
  // the configured clan (clan_quests.json) before it exists: its own tab, so the "found the clan" button stays reachable
  const qc = (cq && cq.clan) || {};
  const confName = qc.name || qc.wantName || '';
  const conf = list.find(e => (confName && e.name.toLowerCase() === String(confName).toLowerCase()) || (qc.leader && e.leader === qc.leader));
  if (conf) conf.configured = true;
  else list.unshift({ name: confName || '(no clan yet)', planned: true, configured: true, leader: qc.leader || '', leaderOurs: !!chars.find(c => c.name === qc.leader), level: 0, ours: [], server: [] });
  return list;
}

/** Party fit for a boss: the raid curse (anyone > boss + 8 is petrified) and a lower bound (boss - 5 for epics, -3 otherwise). */
function partyFit(t, lvl, epic) {
  if (lvl == null) return { ok: false, why: 'boss level unknown' };
  if (t.max > lvl + 8) return { ok: false, why: `raid curse: ${t.max} > ${lvl}+8`, kind: 'curse' };
  const low = epic ? 5 : 3;
  if (t.min < lvl - low) return { ok: false, why: `too low: min ${t.min} < ${lvl}-${low}`, kind: 'low' };
  return { ok: true, why: `${t.min}-${t.max} fits` };
}
function eventBosses(teams, rb, templates) {
  const T = (templates && templates.bosses) || {};
  return EPICS.map(n => {
    const b = rb.find(x => String(x.name).toLowerCase() === n.toLowerCase()) || null;
    const tp = Object.values(T).find(x => String(x.name).toLowerCase() === n.toLowerCase()) || null;
    const lvl = b ? b.level : (tp ? tp.level : null);
    return { name: n, id: b ? b.id : (tp ? tp.id : null), level: lvl, zone: b ? (b.zoneName || '') : (tp ? tp.where || '' : ''), entry: tp ? tp.entry || '' : '',
      weakTo: tp ? weakOf(tp.weakTo) : null, ccNeeded: tp ? !!tp.ccNeeded : false, ccLootMembers: tp ? tp.ccLootMembers || null : null, minPeople: tp ? tp.minPeople || null : null,
      fit: teams.filter(t => t.size >= 1).map(t => Object.assign({ team: t.leader, size: t.size, min: t.min, max: t.max }, partyFit(t, lvl, true))) };
  });
}

// --- template matching ---------------------------------------------------------------------------------------------------------------
const ROLE_OF = { sk: 'tank', tank: 'tank', bishop: 'healer', healer: 'healer', shilliensaint: 'healer', necromancer: 'nuker', nuker: 'nuker',
  doomcryer: 'buffer', destroyer: 'melee', doombringer: 'melee', inspector: 'melee', dagger: 'melee', spoiler: 'spoiler', crafter: 'melee', summoner: 'summoner', archer: 'archer' };
const norm = (s) => String(s || '').toLowerCase().replace(/\s+(male|female)$/, '').trim();
function classFits(cls, list) { const c = norm(cls); return (list || []).some(x => { const n = norm(x); return n === c || (n.length > 4 && c.includes(n)); }); }
function matchTemplate(tpl, chars, opts) {
  opts = opts || {};
  const win = tpl.levelWindow || {}, lo = +win.min || 0, hi = +win.max || 999;
  const pool = chars.filter(c => opts.offline || (c.ageSec || 0) < 900).map(c => ({ c, used: false }));
  const slots = [];
  (tpl.composition || []).forEach(s => {
    const want = +s.count || 1, picked = [];
    const score = (x) => {
      const c = x.c, lvl = +c.level || 0;
      let sc = 0, why = [];
      if (classFits(c.cls, s.classes)) { sc += 4; why.push('class'); }
      if (ROLE_OF[c.role] === s.role) { sc += 2; why.push('role'); }
      if (!sc) return null;
      if (s.role === 'nuker' && weakOf(tpl.weakTo) && opts.elementNukers && classFits(c.cls, opts.elementNukers[weakOf(tpl.weakTo)])) { sc += 3; why.push(weakOf(tpl.weakTo) + ' nukes'); }
      const inWin = lvl >= lo && lvl <= hi; if (inWin) sc += 2; else why.push(lvl > hi ? 'raid curse risk' : 'under-levelled');
      return { sc: sc - Math.abs(lvl - (lo + hi) / 2) / 50, inWin, why: why.join(', ') };
    };
    pool.filter(x => !x.used).map(x => ({ x, s: score(x) })).filter(o => o.s).sort((a, b) => b.s.sc - a.s.sc).slice(0, want)
      .forEach(o => { o.x.used = true; picked.push({ name: o.x.c.name, cls: o.x.c.cls, level: +o.x.c.level || 0, party: o.x.c.party, ok: o.s.inWin, why: o.s.why }); });
    slots.push({ role: s.role, count: want, job: s.job || '', classes: s.classes || [], picked, missing: Math.max(0, want - picked.length) });
  });
  const people = slots.reduce((a, s) => a + s.picked.length, 0), need = slots.reduce((a, s) => a + s.count, 0);
  const parties = [...new Set(slots.flatMap(s => s.picked.map(p => p.party)).filter(Boolean))];
  return { boss: tpl.name, id: tpl.id, level: tpl.level, weakTo: weakOf(tpl.weakTo), levelWindow: { min: lo, max: hi === 999 ? null : hi }, people, need,
    missing: need - people, parties, slots, tactics: tpl.tactics || [], entry: tpl.entry || '', ccNeeded: !!tpl.ccNeeded };
}
module.exports = { weakOf, EPICS, clansFrom, eventBosses, matchTemplate, partyFit };
