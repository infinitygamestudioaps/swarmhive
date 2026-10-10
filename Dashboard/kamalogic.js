// KAMALOKA LOGIC (2026-10-09, user: "/kamaloka still only shows 2 groups"): the ONE place where the dashboard decides, per party and per
// Kamaloka, "fits / too low / too high / too many / too few", "done today / tries left / locked", and the NEXT pick of the daily run.
// It MIRRORS swarm.js exactly (Scripts_dev/swarm.js, 2026-10-09):
//   dailyDay()      day key = local date of (now - 6 h 30 min): the daily lock resets 06:30 local
//   dailyDue()      enabled per leader (Logs/daily_enabled.json) · the WHOLE roster team must be in the party · free = not done today and
//                   tries < 2 · then kamaDailyPick() (KAMAHALL-PURE below): 1) the highest Kamaloka (by levelMin) the whole party fits:
//                   levelMin <= lowest level, levelMax >= highest, partyMin <= size <= partyMax · 2) only when none and the party has more
//                   than 6: the highest free HALL (partyMax <= 6) that THIS party's hall team fits
//   hall team       HALL TEAM PER PARTY (user 2026-10-09 16:05: "so 9-member parties can run Halls"): swarm.config.json
//                   kamaloka.hallTeams[<leader>] (edited on the Kamaloka page), else the old global dailyHallTeam / swarm.js default for its
//                   own party only, else AUTOMATIC per Hall: the leader + 1 tank + up to 2 healers + the strongest dealers inside the level window
//   manualKamaloka() (dashboard Run / Force run, "!mission kamaloka <lvl>"): ignores the daily list; benchForHall() -> kamaBenchPlan() benches
//                   everyone not in the hall team (they wait in the captain's town), then pickKamaloka() with the rest
//   members' level: their own report (swarm_state); unknown -> the leader's level (swarm.js lvlOf falls back to Me.Level)
// The KAMAHALL-PURE block below is a TEXT COPY of the block in Scripts_dev/swarm.js: docs/plan/tools/test_kamalogic.js fails when they differ
// (copy it over after every change there) and runs both on random parties.
// Used by Dashboard/kamapage_api.js (server, /api/kamapage + POST /api/kamahall), Dashboard/kamapage.js (browser: window.KamaLogic) and the
// unit test docs/plan/tools/test_kamalogic.js.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KamaLogic = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const MAX_TRIES = 2, HALL_MAX = 6, RESET_MIN = 6 * 60 + 30;
  const HEALER_ROLES = ['bishop', 'shilliensaint', 'healer'];

// KAMAHALL-PURE-BEGIN (no host calls in here. Dashboard/kamalogic.js carries the SAME block, text for text: docs/plan/tools/test_kamalogic.js
// checks that and runs both on random parties)
// HALL TEAM PER PARTY (user 2026-10-09 16:05: "a Kamaloka hall team per party, so 9-member parties can run Halls"). A Hall takes max 6, a
// Labyrinth 9. A party bigger than the Hall sends its HALL TEAM, the others wait in the captain's town and rejoin after the run.
//   configured: swarm.config.json kamaloka.hallTeams { <leader>: [names] } (the dashboard's Kamaloka page edits it, read live), else the old
//               global dailyHallTeam / CONFIG.daily.hallTeam, but only for ITS party (the party whose leader is in that list)
//   automatic (nothing configured): per Hall, from the members inside its level window: the leader, 1 tank (the leader when he is one), up
//               to 2 healers, then the strongest damage dealers (level first, then role), then anyone left, up to 6
const KAMAHALL = { max: 6, healers: 2, tankRoles: ['sk'], ddRank: { destroyer: 0, doombringer: 1, necromancer: 1, nuker: 1, inspector: 2, dagger: 2, doomcryer: 3, spoiler: 4, crafter: 5 } };
/** the configured hall team of one party (names) or null. cfg = { hallTeams: { <leader>: [names] }, legacy: [names] } */
function kamaHallCfg(cfg, leader) {
  const t = cfg && cfg.hallTeams && cfg.hallTeams[leader];
  if (Array.isArray(t) && t.length) return t.map(String);
  const g = cfg && Array.isArray(cfg.legacy) ? cfg.legacy.map(String) : [];
  return g.length && g.includes(leader) ? g : null;
}
/** the hall team of one party for one Hall k. mates = [{ name, lv, role }] (leader included), cfgNames = kamaHallCfg(...),
 *  roles = { healer: [roles], tank: [roles] } -> { ok, names: [], src: 'config'|'auto', why } */
function kamaHallPick(k, mates, leader, cfgNames, roles) {
  const healerRoles = (roles && roles.healer) || [], tankRoles = (roles && roles.tank) || KAMAHALL.tankRoles;
  const pmin = k.partyMin || 1, max = Math.min(KAMAHALL.max, k.partyMax || KAMAHALL.max);
  const inWin = (m) => m.lv >= k.levelMin && m.lv <= k.levelMax;
  const by = {}; mates.forEach(m => { by[m.name] = m; });
  if (cfgNames) {
    const r = (ok, why) => ({ ok, names: cfgNames.slice(), src: 'config', why });
    if (!cfgNames.includes(leader)) return r(false, 'the hall team must include the leader');
    if (cfgNames.length > max) return r(false, `the hall team has ${cfgNames.length} (max ${max})`);
    const missing = cfgNames.filter(n => !by[n]);
    if (missing.length) return r(false, `not in the party: ${missing.join(', ')}`);
    if (cfgNames.length < pmin) return r(false, `the hall team has ${cfgNames.length} (needs ${pmin})`);
    const out = cfgNames.filter(n => !inWin(by[n]));
    if (out.length) return r(false, `outside lvl ${k.levelMin}-${k.levelMax}: ${out.map(n => n + ' ' + by[n].lv).join(', ')}`);
    return r(true, '');
  }
  const lead = by[leader];
  if (!lead) return { ok: false, names: [], src: 'auto', why: 'the leader is not known' };
  if (!inWin(lead)) return { ok: false, names: [], src: 'auto', why: `the leader (lvl ${lead.lv}) is outside lvl ${k.levelMin}-${k.levelMax}` };
  const isH = (m) => healerRoles.includes(m.role), isT = (m) => tankRoles.includes(m.role);
  const rank = (m) => (KAMAHALL.ddRank[m.role] != null ? KAMAHALL.ddRank[m.role] : 4);
  const order = (a, b) => (b.lv - a.lv) || (rank(a) - rank(b)) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  const pool = mates.filter(m => m.name !== leader && inWin(m)).sort(order);
  const team = [lead];
  const add = (list, n) => { list.forEach(m => { if (n > 0 && team.length < max && !team.includes(m)) { team.push(m); n--; } }); };
  if (!isT(lead)) add(pool.filter(isT), 1);
  add(pool.filter(isH), KAMAHALL.healers);
  add(pool.filter(m => !isH(m) && !isT(m)), max);
  add(pool, max);                                                      // more tanks / healers when the dealers ran out
  const names = team.map(m => m.name);
  if (team.length < pmin) return { ok: false, names, src: 'auto', why: `only ${team.length} inside lvl ${k.levelMin}-${k.levelMax} (needs ${pmin})` };
  return { ok: true, names, src: 'auto', why: '' };
}
/** the daily pick (dailyDue): 1) the highest free Kamaloka the WHOLE party fits; 2) only when none and the party is bigger than 6: the
 *  highest free Hall its hall team fits. free(k) = not done today and tries < 2. -> { k, hall, names } | null
 *  locked = { name: truthy }: characters that cannot enter any Kamaloka today (KAMALOKA CHARS 2026-10-09: on L2Toggle one Hall kill locks
 *  that character's other Halls until 06:30; #2100 "may not re-enter"). With locked members only a Hall of the FREE ones can run: the
 *  leader free and 2+ free (automatic pick among them, the configured hall team does not apply). */
function kamaDailyPick(kamas, mates, leader, free, cfgNames, roles, locked) {
  const lk = locked || {}, freeM = mates.filter(m => !lk[m.name]);
  const lv = mates.map(m => m.lv), size = mates.length, sub = freeM.length < size;
  const byLvl = kamas.slice().sort((a, b) => b.levelMin - a.levelMin);
  if (!sub) {
    const full = byLvl.find(k => k.levelMin <= Math.min(...lv) && k.levelMax >= Math.max(...lv) && size <= k.partyMax && size >= (k.partyMin || 1) && free(k));
    if (full) return { k: full, hall: false, names: mates.map(m => m.name) };
    if (size <= KAMAHALL.max) return null;
  } else if (lk[leader] || freeM.length < 2) return null;
  for (const k of byLvl) {
    if ((k.partyMax || KAMAHALL.max) > KAMAHALL.max || !free(k)) continue;
    const p = kamaHallPick(k, freeM, leader, sub ? null : cfgNames, roles);
    if (p.ok) return { k, hall: true, names: p.names };
  }
  return null;
}
/** who goes in and who waits for one Kamaloka (benchForHall): a party that fits keeps everyone; a bigger one sends the hall team.
 *  -> { ok, team: [names], out: [names], src, why } */
function kamaBenchPlan(k, mates, leader, cfgNames, roles, locked) {
  const all = mates.map(m => m.name), lk = locked || {}, freeM = mates.filter(m => !lk[m.name]);
  if (freeM.length < mates.length) {                                   // KAMALOKA CHARS: locked members wait, the free ones go (leader included)
    if (lk[leader]) return { ok: false, team: [], out: [], src: 'free', why: `the leader ${leader} cannot enter today (done / #2100)` };
    const p = kamaHallPick(k, freeM, leader, null, roles);
    return { ok: p.ok, team: p.names, out: p.ok ? all.filter(n => !p.names.includes(n)) : [], src: 'free', why: p.why };
  }
  if (mates.length <= (k.partyMax || KAMAHALL.max)) return { ok: true, team: all, out: [], src: 'party', why: '' };
  if ((k.partyMax || KAMAHALL.max) > KAMAHALL.max) return { ok: false, team: all, out: [], src: 'party', why: `${mates.length} in the party, ${k.name || k.id} takes ${k.partyMax}` };
  const p = kamaHallPick(k, mates, leader, cfgNames, roles);
  return { ok: p.ok, team: p.names, out: p.ok ? all.filter(n => !p.names.includes(n)) : [], src: p.src, why: p.why };
}
// KAMAHALL-PURE-END

  /** swarm.js dailyDay(): 'YYYY-MM-DD' of (now - 6:30), local time. */
  function dayKey(ms) {
    const d = new Date((ms == null ? Date.now() : ms) - RESET_MIN * 60000);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  /** start of that daily day (06:30 local) and the next reset, in ms */
  function dayBounds(ms) {
    const k = dayKey(ms), [y, m, d] = k.split('-').map(Number);
    const start = new Date(y, m - 1, d, 6, 30, 0, 0).getTime();
    const next = new Date(y, m - 1, d + 1, 6, 30, 0, 0).getTime();
    return { day: k, start, next };
  }
  const lvlNum = (id) => Number((String(id).match(/(\d+)$/) || [])[1] || 0);
  const isHall = (k) => (k.partyMax || 6) <= HALL_MAX;

  /** today's state for one Kamaloka from the leader's daily file (the file of another day = nothing done) */
  function todayOf(k, done, tries) {
    const why = done && done[k.id] ? String(done[k.id]) : '';
    const t = (tries && tries[k.id]) || 0;
    if (why) {
      const kind = /2100|re-enter|may not/i.test(why) ? 'locked' : /clear/i.test(why) ? 'cleared' : /could not enter|entries|daily/i.test(why) ? 'noentry' : 'done';
      return { kind, free: false, tries: t, left: 0, why };
    }
    if (t >= MAX_TRIES) return { kind: 'tries', free: false, tries: t, left: 0, why: `${t} tries used today` };
    return { kind: 'open', free: true, tries: t, left: MAX_TRIES - t, why: '' };
  }
  const TODAY_TXT = { open: 'open', locked: 'locked (#2100)', cleared: 'cleared', noentry: 'no entry today', done: 'done today', tries: 'no tries left' };

  /** levels inside a Kamaloka's window? -> null (fits) or { kind: 'low'|'high'|'spread', txt } */
  function levelMiss(k, list) {
    const low = list.filter(m => m.lv < k.levelMin), high = list.filter(m => m.lv > k.levelMax);
    if (!low.length && !high.length) return null;
    const names = (a) => a.slice(0, 3).map(m => `${m.name} ${m.lv}`).join(', ') + (a.length > 3 ? ` +${a.length - 3}` : '');
    if (low.length && high.length) return { kind: 'spread', txt: `levels too spread: ${names(low)} too low, ${names(high)} too high` };
    if (low.length) return { kind: 'low', txt: low.length === list.length ? `too low (lvl ${Math.max(...low.map(m => m.lv))}, needs ${k.levelMin})` : `too low: ${names(low)} (needs ${k.levelMin})` };
    return { kind: 'high', txt: high.length === list.length ? `too high (lvl ${Math.min(...high.map(m => m.lv))}, max ${k.levelMax})` : `too high: ${names(high)} (max ${k.levelMax})` };
  }

  /** the hall settings argument: an array = the old global list; else { hallTeams: { leader: [names] }, legacy: [names], healerRoles: [roles] } */
  function hallOpts(hall) {
    if (Array.isArray(hall)) return { hallTeams: {}, legacy: hall.map(String), healerRoles: HEALER_ROLES };
    const h = hall || {};
    return { hallTeams: h.hallTeams && typeof h.hallTeams === 'object' ? h.hallTeams : {}, legacy: Array.isArray(h.legacy) ? h.legacy.map(String) : [],
      healerRoles: Array.isArray(h.healerRoles) && h.healerRoles.length ? h.healerRoles.map(String) : HEALER_ROLES };
  }

  /**
   * One party against every Kamaloka.
   *   kamas  [{ id, levelMin, levelMax, partyMin, partyMax, ... }]   (Scripts/data/dungeons_h5.json "kamaloka")
   *   party  { leader, members: [{ name, level, online, role }], done: {}, tries: {}, enabled: bool }   (done / tries of TODAY only)
   *   hall   { hallTeams, legacy, healerRoles } (see hallOpts; an array = the old global hall team)
   * -> { size, levels {min,max}, offline [], unknown [], rows { id: row }, next { id, hall, names } | null, nextTxt, ready, waitFor [],
   *      hallSrc 'party'|'legacy'|'auto', hallCfg [names] | null, hallSuggest [names], hallNames [names of the next pick when it is a Hall] }
   *   row = { fit: 'fits'|'hall'|'low'|'high'|'spread'|'big'|'small'|'unknown', txt, ok (runnable), sitOut, hallNames, today, todayTxt, why, tries, left }
   */
  function evalParty(kamas, party, hall) {
    const H = hallOpts(hall);
    const leader = party.leader, mem = (party.members || []).slice();
    if (!mem.some(m => m.name === leader)) mem.unshift({ name: leader, level: null, online: false });
    const lead = mem.find(m => m.name === leader);
    const leadLv = Number(lead.level) || 0;
    const L = mem.map(m => ({ name: m.name, lv: Number(m.level) || leadLv, known: Number(m.level) > 0, online: !!m.online, role: String(m.role || '') }));
    const size = L.length;
    const known = L.filter(m => m.lv > 0);
    const levels = known.length ? { min: Math.min(...known.map(m => m.lv)), max: Math.max(...known.map(m => m.lv)) } : null;
    const roles = { healer: H.healerRoles, tank: KAMAHALL.tankRoles };
    const cfgNames = kamaHallCfg({ hallTeams: H.hallTeams, legacy: H.legacy }, leader);
    const own = H.hallTeams[leader];
    const hallSrc = !cfgNames ? 'auto' : Array.isArray(own) && own.length ? 'party' : 'legacy';
    const byName = {}; L.forEach(m => { byName[m.name] = m; });
    // KAMALOKA CHARS 2026-10-09: party.locked = { name: { st, id, name, at } } = characters that cannot enter today (Logs/kamaloka_chars.json)
    const lk = party.locked || {}, freeL = L.filter(m => !lk[m.name]), nLocked = size - freeL.length;
    const rows = {};
    (kamas || []).forEach(k => {
      const td = todayOf(k, party.done, party.tries);
      const r = { fit: 'unknown', txt: '', ok: false, sitOut: 0, hallNames: null, today: td.kind, todayTxt: TODAY_TXT[td.kind], why: td.why, tries: td.tries, left: td.left, free: td.free, full: false };
      const pmin = k.partyMin || 1, pmax = k.partyMax || HALL_MAX;
      if (!leadLv) { r.txt = 'leader level unknown'; rows[k.id] = r; return; }
      if (size < pmin) { Object.assign(r, { fit: 'small', txt: `too few (${size} < ${pmin})` }); rows[k.id] = r; return; }
      if (nLocked) {                                                     // KAMALOKA CHARS: only the free characters can go (a Hall, leader included)
        const fn = (a) => a.slice(0, 4).join(', ') + (a.length > 4 ? ` +${a.length - 4}` : '');
        if (!freeL.length) Object.assign(r, { fit: 'locked', txt: 'done today (every character)' });
        else if (lk[leader]) Object.assign(r, { fit: 'locked', txt: `can't: the leader ${leader} is done today (${nLocked}/${size} done)` });
        else if (freeL.length < Math.max(2, pmin)) Object.assign(r, { fit: 'small', txt: `can't: only ${freeL.length} free char${freeL.length === 1 ? '' : 's'} (${nLocked}/${size} done)` });
        else if (pmax > HALL_MAX) Object.assign(r, { fit: 'big', txt: `can't: ${nLocked}/${size} done today — the free ones only go to a Hall` });
        else {
          const p = kamaHallPick(k, freeL, leader, null, roles);
          if (p.ok) Object.assign(r, { fit: 'hall', txt: `fits — ${p.names.length} free chars: ${fn(p.names)}`, ok: true, sitOut: size - p.names.length, hallNames: p.names });
          else { const miss = levelMiss(k, freeL); Object.assign(r, { fit: miss ? miss.kind : 'small', txt: `can't with the ${freeL.length} free: ${p.why}` }); }
        }
        rows[k.id] = r; return;
      }
      if (size <= pmax) {
        const miss = levelMiss(k, L);
        if (!miss) Object.assign(r, { fit: 'fits', txt: `fits (${size}/${pmax})`, ok: true, full: true });
        else Object.assign(r, { fit: miss.kind, txt: miss.txt });
        rows[k.id] = r; return;
      }
      // bigger than a Hall: this party's hall team goes (swarm.js benchForHall -> kamaBenchPlan), everyone else waits in the captain's town
      if (pmax <= HALL_MAX) {
        const p = kamaHallPick(k, L, leader, cfgNames, roles);
        if (p.ok) Object.assign(r, { fit: 'hall', txt: `fits — hall team: ${p.names.join(', ')}`, ok: true, sitOut: size - p.names.length, hallNames: p.names });
        else if (p.src === 'config' && /^outside lvl/.test(p.why)) { const miss = levelMiss(k, cfgNames.map(n => byName[n]).filter(Boolean)) || { kind: 'spread', txt: p.why }; Object.assign(r, { fit: miss.kind, txt: 'hall team ' + miss.txt }); }
        else if (p.src === 'auto' && !p.names.length) { const miss = levelMiss(k, L) || { kind: 'big', txt: p.why }; Object.assign(r, { fit: miss.kind, txt: miss.txt }); }
        else if (p.src === 'auto') Object.assign(r, { fit: 'small', txt: `hall team too small: ${p.why}` });
        else Object.assign(r, { fit: 'big', txt: `too many (${size} > ${pmax}) — hall team: ${p.why}` });
        rows[k.id] = r; return;
      }
      const miss = levelMiss(k, L);
      Object.assign(r, { fit: 'big', txt: `too many (${size} > ${pmax})${miss ? ' · ' + miss.txt : ''}` });
      rows[k.id] = r;
    });
    // dailyDue(): KAMAHALL-PURE kamaDailyPick (the same code swarm.js runs)
    const pick = leadLv ? kamaDailyPick(kamas || [], L, leader, (k) => rows[k.id].free, cfgNames, roles, lk) : null;
    const next = pick ? { id: pick.k.id, hall: pick.hall, names: pick.names } : null;
    // the hall team the editor offers when none is set: the automatic pick for the highest Hall the leader fits
    let hallSuggest = [];
    { const halls = (kamas || []).filter(k => (k.partyMax || HALL_MAX) <= HALL_MAX).slice().sort((a, b) => b.levelMin - a.levelMin);
      for (const k of halls) { const p = kamaHallPick(k, L, leader, null, roles); if (p.ok) { hallSuggest = p.names; break; } }
      if (!hallSuggest.length) hallSuggest = L.slice(0, HALL_MAX).map(m => m.name); }
    const offline = L.filter(m => !m.online).map(m => m.name);
    const unknown = L.filter(m => !m.known).map(m => m.name);
    let nextTxt;
    if (next) nextTxt = next.hall ? `${nLocked ? 'the free ones' : 'the hall team'} (${next.names.join(', ')}) go${nLocked ? '' : 'es'}, ${size - next.names.length} wait in town` : 'the whole party';
    else if (nLocked && (!freeL.length || lk[leader] || freeL.length < 2)) nextTxt = !freeL.length ? 'nothing — every character is done today' : lk[leader] ? `nothing — the leader ${leader} is done today (${nLocked}/${size} done)` : `nothing — only ${freeL.length} free char (${nLocked}/${size} done)`;
    else {
      const fitting = (kamas || []).filter(k => rows[k.id].ok);
      nextTxt = fitting.length ? `every Kamaloka that fits is used up today (${fitting.map(k => lvlNum(k.id)).join(', ')})` : !leadLv ? 'levels unknown' : size < 2 ? 'a Kamaloka needs 2 or more' : `no Kamaloka fits ${size} at lvl ${levels ? levels.min + (levels.max !== levels.min ? '–' + levels.max : '') : '?'}`;
    }
    return { leader, size, levels, offline, unknown, rows, next, nextTxt, hallSrc, hallCfg: cfgNames, hallSuggest,
      hallNames: next && next.hall ? next.names : [], ready: offline.length === 0, waitFor: offline, enabled: !!party.enabled,
      free: freeL.map(m => m.name), locked: lk, nLocked };
  }

  /** dashboard editor check (POST /api/kamahall): names for one party -> { ok, names, why } (leader first, unique, 2-6, all in the party) */
  function checkHallTeam(leader, partyNames, names) {
    if (!Array.isArray(names)) return { ok: false, names: [], why: 'names must be a list' };
    const u = []; names.map(String).forEach(n => { if (n && !u.includes(n)) u.push(n); });
    if (!u.includes(leader)) return { ok: false, names: u, why: `the hall team must include the leader ${leader}` };
    const bad = u.filter(n => !partyNames.includes(n));
    if (bad.length) return { ok: false, names: u, why: `not in party ${leader}: ${bad.join(', ')}` };
    if (u.length < 2 || u.length > HALL_MAX) return { ok: false, names: u, why: `a hall team has 2 to ${HALL_MAX} characters (got ${u.length})` };
    return { ok: true, names: [leader].concat(u.filter(n => n !== leader)), why: '' };
  }

  return { dayKey, dayBounds, todayOf, levelMiss, evalParty, checkHallTeam, hallOpts, lvlNum, isHall, TODAY_TXT, MAX_TRIES, HALL_MAX, HEALER_ROLES,
    KAMAHALL, kamaHallCfg, kamaHallPick, kamaDailyPick, kamaBenchPlan };
});
