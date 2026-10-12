// CLAN NOBILITY RANKS — shared logic (user 2026-10-12, forum topic 429 "Clan Nobility Ranks based on clan level").
// UMD: node (Dashboard/clanranks_api.js, docs/plan/tools/clan_ranks.js, docs/plan/tools/test_clannobility.js) + browser (window.ClanRanksLogic).
// No dependencies, no I/O. Data: Scripts/data/clan_ranks.json (built by docs/plan/tools/clan_ranks.js).
//
// pledgeClass (the number the server keeps per character, item conditions compare it): 0 Vagabond, 1 Vassal, 2 Heir, 3 Knight, 4 Elder,
// 5 Baron, 6 Viscount, 7 Count, 8 Marquis, 9 Duke, 10 Grand Duke, 11 King (L2J client name "Distinguished King"); -1 in an item condition =
// clan leader only.
// Roles: leader | member (main clan) | royalCaptain / knightCommander (main member who leads a Royal Guard / Order of Knights) |
//        royalMember (pledge type 100/200) | knightMember (1001/1002/2001/2002) | academy (-1).
(function (root, factory) {
  const M = factory();
  if (typeof module === 'object' && module.exports) module.exports = M;
  else root.ClanRanksLogic = M;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const RANK_NAMES = ['Vagabond', 'Vassal', 'Heir', 'Knight', 'Elder', 'Baron', 'Viscount', 'Count', 'Marquis', 'Duke', 'Grand Duke', 'King'];
  const ROLES = ['leader', 'member', 'royalCaptain', 'knightCommander', 'royalMember', 'knightMember', 'academy'];
  const ROLE_LABEL = { leader: 'Clan leader', member: 'Clan member (main clan)', royalCaptain: 'Royal Guard captain', knightCommander: 'Knight commander',
    royalMember: 'Royal Guard member', knightMember: 'Knight member', academy: 'Academy' };
  // sub-unit creation levels (DATAPACK: L2VillageMasterInstance create_academy 5 / create_royal 6 / create_knight 7)
  const UNIT_MIN_LEVEL = { academy: 5, royalMember: 6, royalCaptain: 6, knightMember: 7, knightCommander: 7 };
  const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

  function rankName(pc) {
    if (pc === -1) return 'Clan leader only';
    if (Array.isArray(pc)) return pc.map(rankName).join(' or ');
    return RANK_NAMES[pc] != null ? RANK_NAMES[pc] : (pc == null ? '–' : '?' + pc);
  }
  /** does this role exist at this clan level? (academy from 5, royal guard from 6, knights from 7) */
  function roleExists(lvl, role) { return !UNIT_MIN_LEVEL[role] || num(lvl) >= UNIT_MIN_LEVEL[role]; }

  /** DATAPACK: L2J H5 L2ClanMember.calculatePledgeClass (Shagooh/l2j-server-game), WITHOUT the Noblesse / Hero overrides.
   *  null = the role cannot exist at that clan level. */
  function l2jBase(lvl, role) {
    lvl = num(lvl);
    if (!ROLES.includes(role) || !roleExists(lvl, role)) return null;
    if (lvl <= 3) return 1;                                         // default branch: everyone Vassal
    if (lvl === 4) return role === 'leader' ? 3 : 0;               // L2J quirk: non-leaders get 0 (Vagabond)
    if (lvl === 5) return role === 'leader' ? 4 : 2;               // pledge type not checked: academy gets Heir too
    if (lvl === 6) return { academy: 1, royalMember: 2, member: 3, royalCaptain: 4, leader: 5 }[role];
    if (lvl === 7) return { academy: 1, knightMember: 2, royalMember: 3, member: 4, knightCommander: 5, royalCaptain: 6, leader: 7 }[role];
    if (lvl >= 8 && lvl <= 11) return { academy: 1, knightMember: lvl - 5, royalMember: lvl - 4, member: lvl - 3, knightCommander: lvl - 2, royalCaptain: lvl - 1, leader: lvl }[role];
    return null;
  }
  /** GUIDE: the forum chart (topic 429 image), WITHOUT the overrides. A cell listed in two rows comes back as [a, b]. */
  function chartBase(lvl, role) {
    lvl = num(lvl);
    if (lvl < 1 || lvl > 11 || !ROLES.includes(role)) return null;
    if (lvl <= 4) {
      if (role === 'leader') return lvl === 3 ? [1, 2] : lvl === 4 ? 3 : 1;   // "Lvl 3 Clan Leader" in the Vassal AND Heir rows; "Lvl 4 Clan Leader" = Knight
      return role === 'member' ? 1 : null;
    }
    if (lvl === 5) return role === 'leader' ? 4 : role === 'member' ? 2 : null;   // chart has no academy before 6
    if (role === 'academy') return 1;
    return l2jBase(lvl, role);                                      // 6-11: every cell equals L2J (checked cell by cell)
  }
  /** Noblesse -> at least Baron (5), Hero -> at least Marquis (8) (chart AND L2J); castle-owning leader -> King (chart only) */
  function applyOverrides(pc, flags, mode) {
    flags = flags || {};
    if (pc == null) return pc;
    const one = (p) => { let r = p; if (flags.noble && r < 5) r = 5; if (flags.hero && r < 8) r = 8; if (mode === 'chart' && flags.castleLeader) r = 11; return r; };
    return Array.isArray(pc) ? pc.map(one) : one(pc);
  }
  function pledgeClass(lvl, role, flags) { return applyOverrides(l2jBase(lvl, role), flags, 'l2j'); }
  function chartRank(lvl, role, flags) { return applyOverrides(chartBase(lvl, role), flags, 'chart'); }
  const lowest = (pc) => Array.isArray(pc) ? Math.min(...pc) : pc;

  /** the role of a clan member from the server's member list (unit = pledge type) */
  function roleOf(m, leaderName, unitLeaders) {
    m = m || {};
    if (m.name && leaderName && m.name === leaderName) return 'leader';
    const u = num(m.unit);
    if (u === -1) return 'academy';
    if (u === 100 || u === 200) return 'royalMember';
    if ([1001, 1002, 2001, 2002].includes(u)) return 'knightMember';
    const lead = unitLeaders && m.name ? unitLeaders[m.name] : null;   // { name: pledgeType it leads }
    if (lead === 100 || lead === 200) return 'royalCaptain';
    if ([1001, 1002, 2001, 2002].includes(num(lead))) return 'knightCommander';
    return 'member';
  }
  /** lowest clan level at which <role> reaches pledgeClass >= minPc (L2J table, no overrides); null = never (up to 11) */
  function firstLevelFor(role, minPc) {
    for (let l = 1; l <= 11; l++) { const pc = l2jBase(l, role); if (pc != null && pc >= minPc) return l; }
    return null;
  }

  /** the rank ladder: one row per clan level, each role -> { l2j, chart, differs } */
  function ladder() {
    const rows = [];
    for (let l = 1; l <= 11; l++) {
      const cells = {};
      ROLES.forEach(r => {
        const a = l2jBase(l, r), b = chartBase(l, r);
        const differs = JSON.stringify(a) !== JSON.stringify(b) && !(a == null && b == null);
        cells[r] = { l2j: a, chart: b, differs };
      });
      rows.push({ level: l, cells });
    }
    return rows;
  }

  /** what changes for each role from clan level a to b (L2J) */
  function rankChanges(a, b) {
    const out = [];
    ROLES.forEach(r => { const x = l2jBase(a, r), y = l2jBase(b, r); if (y == null) return; if (x !== y) out.push({ role: r, label: ROLE_LABEL[r], from: x, to: y, fromName: rankName(x), toName: rankName(y), isNew: x == null }); });
    return out;
  }

  /** requirements of clan level <next> with have/need from the clan leader's report (Logs/clan_state.json) */
  function requirements(data, st, next, opts) {
    const row = ((data && data.levels) || []).find(x => num(x.level) === num(next));
    if (!row) return [];
    const L = Object.assign({}, row.requirements || row, { itemSource: row.itemSource || (row.requirements || {}).itemSource || null });   // clan_ranks.json rows keep the numbers under requirements, clan_data.json rows flat
    st = st || {};
    const nl = st.nextLevel && num(st.nextLevel.next) === num(next) ? st.nextLevel : null;
    const ci = st.clanInfo || {};
    const reqs = [];
    const add = (what, need, have, extra) => reqs.push(Object.assign({ what, need, have, ok: have == null ? null : have >= need }, extra || {}));
    if (num(L.sp)) add('Clan leader SP', num(L.sp), nl && nl.sp ? num(nl.sp.have) : (st.sp != null ? num(st.sp) : null), { unit: 'SP', paidBy: 'clan leader' });
    if (num(L.adena)) add('Adena', num(L.adena), nl && nl.adena ? num(nl.adena.have) : (st.adena != null ? num(st.adena) : null), { unit: 'adena', paidBy: 'clan leader' });
    (L.items || []).forEach(it => {
      const h = nl && Array.isArray(nl.items) ? nl.items.find(x => num(x.id) === num(it.id)) : null;
      const bagHave = Array.isArray(opts && opts.bag) ? opts.bag.filter(x => num(x.id) === num(it.id)).reduce((a, x) => a + num(x.count), 0) : null;
      add(it.name, num(it.count), h ? num(h.have) : bagHave, { unit: 'item', itemId: it.id, source: L.itemSource || null, paidBy: 'clan leader (in his bag)' });
    });
    if (num(L.reputation)) add('Clan reputation', num(L.reputation), ci.rep != null ? num(ci.rep) : null, { unit: 'reputation', paidBy: 'the clan' });
    const mc = Array.isArray(ci.members) && ci.members.length ? ci.members.length : (ci.memberCount != null ? num(ci.memberCount) : null);
    if (num(L.members)) add('Clan members', num(L.members), mc, { unit: 'members', note: L.membersRule || null });
    if (L.extra) reqs.push({ what: L.extra, need: null, have: null, ok: null, unit: 'other' });
    return reqs;
  }

  /** the newest "clan intel" line of Logs/clan.log text: "<iso> [Name] clan intel (every 10 min): MyClan lvl 2, leader Dagger1 (ME), 13 members, 0 reputation" */
  function parseIntel(text) {
    const re = /^(\S+) \[([^\]]+)\] clan intel[^:]*: (\S+) lvl (\d+), leader ([A-Za-z0-9_-]+)(?: \(ME\))?, (\d+) members, (-?\d+) reputation/gm;
    let m, last = null;
    while ((m = re.exec(String(text || '')))) last = { at: m[1], by: m[2], name: m[3], level: num(m[4]), leader: m[5], memberCount: num(m[6]), rep: num(m[7]) };
    return last;
  }
  /** the best clan info: the leader's fresh clanInfo (with members) > a cached good one > the newest intel line. The bot's own Me.Clan
   *  reports level 0 and an empty name (2026-10-09 finding), and right after a script restart clanInfo is empty for a few minutes. */
  function bestClanInfo(st, intel, cache) {
    const ci = (st && st.clanInfo) || {};
    const good = (c) => !!(c && c.seenAt && Array.isArray(c.members) && c.members.length && c.name && !/^\(clan /.test(c.name));
    let best = good(ci) ? Object.assign({ source: 'clan_state' }, ci) : good(cache) ? Object.assign({}, cache, { source: 'cache' }) : null;
    if (intel && (!best || Date.parse(intel.at) > Date.parse(best.seenAt) + 15 * 60000)) {
      const keep = best && best.name === intel.name ? best.members : [];
      best = { id: (best && best.id) || ci.id || null, name: intel.name, level: intel.level, leader: intel.leader, rep: intel.rep, memberCount: intel.memberCount, members: keep || [], seenAt: intel.at, source: 'clan.log intel' };
    }
    if (!best) best = Object.assign({ source: 'clan_state (no clan info yet)' }, ci);
    const lvl = Math.max(num(best.level), num(ci.level), num(st && st.clan && st.clan.level));
    return Object.assign({}, best, { level: lvl });
  }

  /** everything the dashboard module shows. data = clan_ranks.json, st = Logs/clan_state.json,
   *  opts = { now, intel (parseIntel), cache (an earlier good clanInfo), bag ([{ id, count }] of the clan leader), unitLeaders } */
  function summary(data, st, opts) {
    data = data || {}; st = st || {}; opts = opts || {};
    const ci = bestClanInfo(st, opts.intel, opts.cache);
    st = Object.assign({}, st, { clanInfo: ci });
    const level = num(ci.level);
    const leaderName = ci.leader || st.leader || '';
    const seen = ci.seenAt || null, now = opts.now || Date.now();
    const ageMin = seen ? Math.round((now - Date.parse(seen)) / 60000) : null;
    const flagsOf = (name) => ((data.characterFlags || {})[name]) || {};
    const members = (Array.isArray(ci.members) ? ci.members : []).map(m => {
      const role = roleOf(m, leaderName, opts.unitLeaders);
      const f = flagsOf(m.name), pc = pledgeClass(level, role, f);
      return { name: m.name, level: num(m.level), classId: m.classId, online: !!m.online, unit: num(m.unit), role, roleLabel: ROLE_LABEL[role], pc, rank: rankName(pc), noble: !!f.noble, hero: !!f.hero };
    }).sort((a, b) => (b.role === 'leader') - (a.role === 'leader') || (b.pc == null ? -2 : b.pc) - (a.pc == null ? -2 : a.pc) || String(a.name).localeCompare(String(b.name)));
    const next = level >= 11 ? null : level + 1;
    const lvInfo = (l) => ((data.levels || []).find(x => num(x.level) === l)) || null;
    const reqs = next ? requirements(data, st, next, opts) : [];
    const unlocks = next ? (lvInfo(next) || {}).unlocks || null : null;
    // rank goals: the gear each rank opens and the clan level that gives it to the leader / to main members
    const goals = ((data.rankGatedItems || [])).map(g => ({
      pc: g.pledgeClass, rank: g.pledgeClass === -1 ? 'Clan leader only' : rankName(g.pledgeClass), what: g.label,
      leaderAt: g.pledgeClass === -1 ? 0 : firstLevelFor('leader', g.pledgeClass), memberAt: g.pledgeClass === -1 ? null : firstLevelFor('member', g.pledgeClass),
      leaderHas: g.pledgeClass === -1 ? true : (members.find(m => m.role === 'leader') || { pc: pledgeClass(level, 'leader') }).pc >= g.pledgeClass,
      membersHave: g.pledgeClass === -1 ? false : pledgeClass(level, 'member') >= g.pledgeClass,
      noblesseOpens: g.pledgeClass !== -1 && g.pledgeClass <= 5,
    }));
    return {
      clan: { name: ci.name && !/^\(clan /.test(ci.name) ? ci.name : '', id: ci.id || (st.clan && st.clan.id) || null, level, leader: leaderName,
        members: members.length || (ci.memberCount != null ? num(ci.memberCount) : 0), rep: ci.rep != null ? num(ci.rep) : null,
        seenAt: seen, ageMin, stale: ageMin == null || ageMin > 30, known: !!(ci.id || ci.name), source: ci.source || '' },
      ranksNow: { leader: { pc: pledgeClass(level, 'leader'), rank: rankName(pledgeClass(level, 'leader')) }, member: { pc: pledgeClass(level, 'member'), rank: rankName(pledgeClass(level, 'member')) },
        chartLeader: rankName(chartRank(level, 'leader')), chartMember: rankName(chartRank(level, 'member')) },
      members,
      next: next ? { level: next, reqs, ok: reqs.length ? reqs.every(r => r.ok === true) : null, missing: reqs.filter(r => r.ok === false).map(r => r.what), unknown: reqs.filter(r => r.ok == null).map(r => r.what),
        unlocks, rankChanges: rankChanges(level, next), live: (lvInfo(next) || {}).live || null } : null,
      goals,
    };
  }

  return { RANK_NAMES, ROLES, ROLE_LABEL, UNIT_MIN_LEVEL, rankName, roleExists, l2jBase, chartBase, applyOverrides, pledgeClass, chartRank, lowest, roleOf,
    firstLevelFor, ladder, rankChanges, requirements, parseIntel, bestClanInfo, summary };
});
