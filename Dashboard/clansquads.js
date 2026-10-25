// CLAN SQUADS (CLANSQUADS-2026-10-25, owner: "impossible to see academy characters and clan permissions and who is in what squad ... those in
// academy are still in clan even though they are past lvl 40 and completed second class change ... academy looks like (clan 270098570)").
// UMD: node (Dashboard/server.js /api/clan -> d.squads, docs/plan/tools/test_clansquads.js) + browser (window.ClanSquads). No I/O.
//   build(chars, levels, opt) -> { clans: [{ id, name, level, leader, rep, unknown, serverAt, ranksAt, total, squads[], ranks[], left[] }] }
//     chars  = swarm_state rows ({ name, level, cls, party, clanInfo }); clanInfo.members / units / grades come from the clan leader's server
//              list (swarm.js CLAN INTEL + CLANSQUADS); the freshest list with members is the truth
//     levels = Scripts/data/clan_data.json levels (memberLimitAfter per clan level)
//     opt.academyGraduated = names with Logs/academy_<Name>.json status 'graduated'
//   html(view, opts) -> the "Members & squads" section (browser)
// A character whose own L2Swarm still carries the clan id (Me.Clan is not cleared when an academy member graduates) but that the server list
// does not hold is NOT a member: it goes to left[] and never makes a second "(clan 123)" clan.
(function (root, factory) {
  const M = factory();
  if (typeof module === 'object' && module.exports) module.exports = M;
  if (typeof window !== 'undefined') window.ClanSquads = M;
})(this, function () {
  'use strict';
  // L2J H5 sub-units (L2Clan SUBUNIT_*), the clan_data.json limit key and the clan level that opens them (VillageMaster create_*)
  const UNITS = [
    { type: 0, label: 'Main clan', key: 'main', unlock: 0 },
    { type: -1, label: 'Academy', key: 'academy', unlock: 5 },
    { type: 100, label: 'Royal Guard 1', key: 'royalGuardsEach', unlock: 6 },
    { type: 200, label: 'Royal Guard 2', key: 'royalGuardsEach', unlock: 6 },
    { type: 1001, label: 'Order of Knights 1', key: 'knightsEach', unlock: 7 },
    { type: 1002, label: 'Order of Knights 2', key: 'knightsEach', unlock: 7 },
    { type: 2001, label: 'Order of Knights 3', key: 'knightsEach', unlock: 7 },
    { type: 2002, label: 'Order of Knights 4', key: 'knightsEach', unlock: 7 },
  ];
  // L2J L2Clan CP_* privilege bits
  const PRIVS = [[2, 'Invite members'], [4, 'Give titles'], [8, 'View the clan warehouse'], [16, 'Manage ranks'], [32, 'Clan wars'], [64, 'Dismiss members'],
    [128, 'Register the crest'], [256, 'Academy masters (sponsors)'], [512, 'Manage troops / fame'], [1024, 'Summon the airship'],
    [2048, 'Clan hall: open doors'], [4096, 'Clan hall: other rights'], [8192, 'Clan hall: auction'], [16384, 'Clan hall: dismiss'], [32768, 'Clan hall: set functions'],
    [65536, 'Castle: open doors'], [131072, 'Castle: manor'], [262144, 'Castle: siege'], [524288, 'Castle: use functions'], [1048576, 'Castle: dismiss'],
    [2097152, 'Castle: taxes'], [4194304, 'Castle: mercenaries'], [8388608, 'Castle: set functions']];
  const privNames = (p) => { const v = Number(p) || 0; return PRIVS.filter(([b]) => (v & b) === b).map(([, n]) => n); };
  const placeholder = (n) => !n || /^\(clan \d+\)$/.test(String(n));
  const ACADEMY_GRAD = 40;

  function limitOf(levels, lvl, key) {
    const L = (levels || []).find(l => +l.level === +lvl) || null;
    if (L && L.memberLimitAfter && L.memberLimitAfter[key] != null) return +L.memberLimitAfter[key];
    return key === 'main' ? ([10, 15, 20, 30][lvl] != null ? [10, 15, 20, 30][lvl] : 40) : 0;
  }
  function unlockOf(levels, key, dflt) {
    const L = (levels || []).slice().sort((a, b) => a.level - b.level).find(l => l.memberLimitAfter && +l.memberLimitAfter[key] > 0);
    return L ? +L.level : dflt;
  }

  function build(chars, levels, opt) {
    opt = opt || {};
    const grad = new Set((opt.academyGraduated || []).map(String));
    const by = {};
    for (const c of chars || []) {
      const ci = c && c.clanInfo; if (!ci || (!ci.id && placeholder(ci.name))) continue;
      const key = ci.id ? 'id:' + ci.id : 'n:' + String(ci.name).toLowerCase();
      const e = by[key] = by[key] || { id: +ci.id || 0, name: '', level: 0, leader: '', rep: null, serverAt: '', ranksAt: '', server: null, units: [], grades: [], carriers: [] };
      if (!placeholder(ci.name) && !e.name) e.name = ci.name;
      if (+ci.level > e.level) e.level = +ci.level;
      e.carriers.push(c);
      if ((ci.members || []).length && String(ci.seenAt || '') >= e.serverAt) {
        e.server = ci.members; e.serverAt = String(ci.seenAt || ''); e.leader = ci.leader || e.leader; if (ci.rep != null) e.rep = ci.rep;
        if (!placeholder(ci.name)) e.name = ci.name;
        if ((ci.units || []).length) e.units = ci.units;
      }
      if ((ci.grades || []).length && String(ci.ranksAt || '') >= e.ranksAt) { e.grades = ci.grades; e.ranksAt = String(ci.ranksAt || ''); }
    }
    // the last good server list per clan id (Dashboard/server.js keeps it in Logs/clan_intel_last.json): a script reload empties every
    // character's list for 4-14 min; until a fresh one arrives the page uses the last one (marked with its time)
    const last = opt.lastServer || {};
    Object.values(by).forEach(e => { const L = e.id && last[e.id]; if (!e.server && L && (L.members || []).length) { e.server = L.members; e.serverAt = String(L.seenAt || ''); e.leader = L.leader || e.leader; if (L.rep != null) e.rep = L.rep; if (!e.name && !placeholder(L.name)) e.name = L.name; e.units = L.units || []; if ((L.grades || []).length) { e.grades = L.grades; e.ranksAt = String(L.ranksAt || ''); } e.fromLast = true; } });
    const clans = Object.values(by).map(e => {
      const unknown = !e.server;
      const name = e.name || ('clan ' + (e.id || '?'));
      const byName = {}; (chars || []).forEach(c => { byName[c.name] = c; });
      const server = e.server || [];
      const inServer = new Set(server.map(m => m.name));
      const unitsSeen = {}; (e.units || []).forEach(u => { unitsSeen[u.type] = u; });
      server.forEach(m => { if (!unitsSeen[m.unit]) unitsSeen[m.unit] = { type: m.unit, name: '', leader: '' }; });
      const row = (m) => { const c = byName[m.name] || null; return { name: m.name, level: +m.level || (c && +c.level) || 0, classId: m.classId, cls: c ? c.cls : '', online: m.online !== false, grade: m.grade != null ? m.grade : null,
        title: m.title || '', sponsor: m.sponsor || '', ours: !!c, party: c ? c.party : null, leader: m.name === e.leader }; };
      const squads = UNITS.map(u => {
        const s = unitsSeen[u.type] || null, mem = server.filter(m => +m.unit === u.type).map(row).sort((a, b) => (b.leader - a.leader) || (b.level - a.level) || a.name.localeCompare(b.name));
        const unlockLevel = u.type === 0 ? 0 : unlockOf(levels, u.key, u.unlock);
        const out = { type: u.type, label: u.label, name: (s && s.name && !(u.type === 0)) ? s.name : (u.type === 0 ? name : ''), leader: (s && s.leader) || (u.type === 0 ? e.leader : ''),
          limit: e.level >= unlockLevel ? limitOf(levels, e.level, u.key) : 0, unlockLevel, locked: e.level < unlockLevel, created: u.type === 0 || !!s, members: mem };
        if (u.type === -1) out.members.forEach(m => { m.graduateAt = ACADEMY_GRAD; m.toGo = Math.max(0, ACADEMY_GRAD - m.level); });
        return out;
      });
      const total = { members: server.length, limit: squads.filter(s => s.created && !s.locked).reduce((a, s) => a + s.limit, 0) };
      // ranks: the rank list (FE:3C) + privileges from any member of that rank (FE:3D)
      const rk = {}; (e.grades || []).forEach(g => { rk[g.rank] = { rank: g.rank, members: g.members, privs: [], privBits: null }; });
      server.forEach(m => { if (m.grade == null) return; const r = rk[m.grade] = rk[m.grade] || { rank: m.grade, members: 0, privs: [], privBits: null };
        if (!(e.grades || []).length) r.members++; if (m.privs != null && r.privBits == null) { r.privBits = m.privs; r.privs = privNames(m.privs); } });
      const ranks = Object.values(rk).sort((a, b) => a.rank - b.rank).map(r => Object.assign(r, { who: server.filter(m => m.grade === r.rank).map(m => m.name) }));
      // our characters that still carry the clan id but are not on the server list
      const left = unknown ? [] : e.carriers.filter(c => !inServer.has(c.name)).map(c => {
        const g = grad.has(c.name) || (+c.level >= ACADEMY_GRAD);
        return { name: c.name, level: +c.level || 0, cls: c.cls || '', party: c.party || null,
          why: g ? 'graduated from the academy (2nd class change) and left the clan' : 'left the clan (the server no longer lists it)' };
      });
      return { id: e.id, name, level: e.level, leader: e.leader, rep: e.rep, unknown, fromLast: !!e.fromLast, serverAt: e.serverAt, ranksAt: e.ranksAt, total, squads, ranks, left,
        carriers: unknown ? e.carriers.map(c => ({ name: c.name, level: +c.level || 0, cls: c.cls || '', party: c.party || null })) : [] };
    }).sort((a, b) => (a.unknown - b.unknown) || (b.total.members - a.total.members));
    return { clans };
  }

  // ---- browser view ----------------------------------------------------------------------------------------------------------
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  function agoTxt(iso) { if (!iso) return ''; const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : Math.round(m / 60) + ' h ago'; }
  function bar(n, lim) { const p = lim ? Math.min(100, Math.round(n * 100 / lim)) : 0; return `<span class="csq-bar"><i style="width:${p}%;${p >= 100 ? 'background:var(--bad,#c55)' : ''}"></i></span>`; }
  function member(m, academy) {
    const link = m.ours ? `<a href="#/char/${encodeURIComponent(m.name)}"><b>${esc(m.name)}</b></a>` : `<b>${esc(m.name)}</b>`;
    const extra = [m.leader ? '<span class="fit next">leader</span>' : '', m.grade != null ? `<span class="chip">rank ${esc(m.grade)}</span>` : '',
      m.title ? `<span class="muted">“${esc(m.title)}”</span>` : '', !m.online ? '<span class="muted">offline</span>' : '', !m.ours ? '<span class="muted">not ours</span>' : ''].filter(Boolean).join(' ');
    const ac = academy ? `<div class="csq-acad">${bar(m.level, m.graduateAt)}<span class="muted">lvl ${m.level} / ${m.graduateAt}${m.toGo ? ` · ${m.toGo} to go` : ' · graduates at the 2nd class change'}${m.sponsor ? ' · sponsor ' + esc(m.sponsor) : ''}</span></div>` : '';
    return `<div class="csq-m"><div>${link} <span class="muted">lvl ${m.level}${m.cls ? ' ' + esc(m.cls) : ''}${m.party ? ' · party ' + esc(m.party) : ''}</span> ${extra}</div>${ac}</div>`;
  }
  function html(view) {
    const C = (view && view.clans) || [];
    if (!C.length) return '<div class="muted">No clan seen yet.</div>';
    const css = `<style>.csq-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,320px),1fr));gap:8px}.csq-h{display:flex;justify-content:space-between;gap:6px;align-items:baseline;flex-wrap:wrap}
      .csq-bar{display:inline-block;width:80px;height:6px;border-radius:3px;background:rgba(255,255,255,.12);vertical-align:middle;margin-right:6px;overflow:hidden}.csq-bar i{display:block;height:100%;background:var(--gold,#c9a54a)}
      .csq-m{padding:4px 0;border-top:1px solid rgba(255,255,255,.06)}.csq-m:first-child{border-top:0}.csq-acad{margin-top:2px}.csq-lock{opacity:.55}.csq-priv{display:flex;flex-wrap:wrap;gap:4px;margin-top:4px}</style>`;
    return css + C.map(c => {
      if (c.unknown) return `<div class="box"><h3>Clan id ${esc(c.id)}</h3><div class="muted">No member list from the server for this clan yet (the clan leader asks every 10 min). Characters that still carry it: ${c.carriers.map(x => esc(x.name)).join(', ')}.</div></div>`;
      const head = `<div class="box"><div class="csq-h"><h3 style="margin:0">${esc(c.name)} <span class="muted">level ${c.level}</span></h3><span>${bar(c.total.members, c.total.limit)}<b>${c.total.members}</b> / ${c.total.limit} members</span></div>
        <div class="muted">Leader <b>${esc(c.leader || '?')}</b>${c.rep != null ? ' · ' + Number(c.rep).toLocaleString() + ' reputation' : ''} · server list ${esc(agoTxt(c.serverAt))}${c.fromLast ? ' (the last one — a fresh one comes within 15 min)' : ''}${c.ranksAt ? ' · ranks ' + esc(agoTxt(c.ranksAt)) : ' · ranks not read yet (the clan leader reads them every 30 min)'}</div></div>`;
      const squads = `<div class="csq-grid" style="margin-top:8px">${c.squads.map(s => {
        if (s.locked) return `<div class="box csq-lock"><div class="csq-h"><b>${esc(s.label)}</b><span class="muted">opens at clan level ${s.unlockLevel}</span></div></div>`;
        if (!s.created) return `<div class="box csq-lock"><div class="csq-h"><b>${esc(s.label)}</b><span class="muted">0 / ${s.limit} · not created yet</span></div><div class="muted">The clan leader creates it at a village master (Clan → ${s.type === -1 ? 'Clan Academy' : s.type < 1000 ? 'Royal Guard' : 'Order of Knights'}).</div></div>`;
        return `<div class="box"><div class="csq-h"><b>${esc(s.label)}${s.name && s.type !== 0 ? ' · ' + esc(s.name) : ''}</b><span>${bar(s.members.length, s.limit)}${s.members.length} / ${s.limit}</span></div>
          ${s.leader && s.type !== 0 ? `<div class="muted">Captain: ${esc(s.leader)}</div>` : ''}${s.type === -1 ? '<div class="muted">Graduation: at the 2nd class change (level 40) the member leaves the academy and the clan; the clan gets 190–650 reputation.</div>' : ''}
          ${s.members.map(m => member(m, s.type === -1)).join('') || '<div class="muted">nobody</div>'}</div>`; }).join('')}</div>`;
      const ranks = c.ranks.length ? `<div class="box" style="margin-top:8px"><h3>Ranks & permissions</h3>${c.ranks.map(r => `<div class="csq-m"><div><b>Rank ${esc(r.rank)}</b> <span class="muted">${r.who.length || r.members} member${(r.who.length || r.members) === 1 ? '' : 's'}${r.who.length ? ': ' + r.who.map(esc).join(', ') : ''}</span></div>
          <div class="csq-priv">${r.privBits == null ? '<span class="muted">privileges not read yet</span>' : r.privs.length ? r.privs.map(p => `<span class="chip">${esc(p)}</span>`).join('') : '<span class="muted">no privileges</span>'}</div></div>`).join('')}</div>`
        : `<div class="box muted" style="margin-top:8px">Ranks & permissions: not read yet. The clan leader reads every member's rank and privileges every 30 min (after the next swarm.js update).</div>`;
      const left = c.left.length ? `<div class="box" style="margin-top:8px"><h3>Left the clan</h3><div class="muted" style="margin-bottom:4px">These characters still carry the clan in their own data, but the server's member list no longer has them.</div>${c.left.map(x => `<div class="csq-m"><a href="#/char/${encodeURIComponent(x.name)}"><b>${esc(x.name)}</b></a> <span class="muted">lvl ${x.level} ${esc(x.cls)}${x.party ? ' · party ' + esc(x.party) : ''} · ${esc(x.why)}</span></div>`).join('')}</div>` : '';
      return head + squads + ranks + left;
    }).join('');
  }
  return { build, html, privNames, UNITS };
});
