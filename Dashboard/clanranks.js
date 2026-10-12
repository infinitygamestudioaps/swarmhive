// CLAN NOBILITY RANKS module (user 2026-10-12, forum topic 429 "Clan Nobility Ranks based on clan level"). READ-ONLY.
// Shows the clan's level, the rank (Vassal ... King) of the leader and every member now, what the next clan level needs (have / need) and
// opens, which clan level gives which rank (and the gear that rank unlocks), the full rank ladder and where the forum chart differs from L2J.
// Data: GET /api/clanranks (Dashboard/clanranks_api.js <- Scripts/data/clan_ranks.json + Logs/clan_state.json + member states + clan.log).
//
// Use in the Clan tab (index.html clanTabsHtml, next to the ClanAuto sections):
//     + (window.ClanRanks ? S('ranks', 'Nobility ranks', ClanRanks.html(), ClanRanks.badge()) : '')
// html() starts the first load by itself and re-renders the Clan tab through clanTabsHtml(CLAN) when the data arrives (like clanauto.js).
// Standalone: ClanRanks.mount(element) renders into any element and refreshes every 60 s while the page is visible.
// Uses index.html globals when present (api, esc, ago, KEY); falls back to fetch + ?key= from the URL. No alert / confirm / prompt.
(function () {
  'use strict';
  const CR = { data: null, at: 0, busy: false, err: '', mounts: [] };
  const h = (s) => (typeof esc === 'function' ? esc(s) : String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const n = (v) => (v == null ? '?' : Number(v).toLocaleString('en-US'));
  const SHORT = { leader: 'Leader', member: 'Member', royalCaptain: 'Guard capt.', knightCommander: 'Knight cmdr.', royalMember: 'Guard', knightMember: 'Knight', academy: 'Academy' };
  const agoTxt = (t) => { if (!t) return 'never'; if (typeof ago === 'function') { try { return ago(t); } catch (e) { } } const m = Math.round((Date.now() - Date.parse(t)) / 60000); return m < 1 ? 'just now' : m + ' min ago'; };

  function get() {
    if (typeof api === 'function') return api('/api/clanranks');
    const k = (typeof KEY !== 'undefined' && KEY) || new URLSearchParams(location.search).get('key') || '';
    return fetch('/api/clanranks', { headers: { 'x-key': k } }).then(r => r.json());
  }
  function refresh() {
    if (CR.busy) return;
    CR.busy = true;
    get().then(d => { if (d && d.ok) { CR.data = d; CR.err = ''; } else CR.err = (d && d.error) || 'no answer'; })
      .catch(e => { CR.err = e.message; })
      .finally(() => { CR.busy = false; CR.at = Date.now(); rerender(); });
  }
  function rerender() {
    CR.mounts = CR.mounts.filter(el => el && el.isConnected);
    CR.mounts.forEach(el => { el.innerHTML = html(); });
    try {
      const box = document.getElementById('clanBox');
      if (box && box.isConnected && typeof CLAN !== 'undefined' && CLAN && typeof patch === 'function' && typeof clanTabsHtml === 'function') patch(box, clanTabsHtml(CLAN));
    } catch (e) { }
  }

  function chip(ok) { return ok === true ? '<span class="crk-chip ok">ok</span>' : ok === false ? '<span class="crk-chip bad">missing</span>' : '<span class="crk-chip unk">unknown</span>'; }
  function reqRow(r) {
    const val = r.need == null ? '' : `<span class="crk-num">${r.have == null ? '?' : n(r.have)} / ${n(r.need)}</span>`;
    return `<div class="crk-req">${chip(r.ok)}<div class="crk-reqtxt"><b>${h(r.what)}</b> ${val}${r.paidBy ? ` <span class="muted">(${h(r.paidBy)})</span>` : ''}${r.source ? `<div class="muted">${h(r.source)}</div>` : ''}${r.note ? `<div class="muted">${h(r.note)}</div>` : ''}</div></div>`;
  }

  /** short text for the folded section header */
  function badge() {
    const s = CR.data && CR.data.summary;
    if (!s) return CR.err ? 'not loaded' : 'loading…';
    if (!s.clan.known || !s.clan.level) return 'no clan level yet';
    return `leader ${s.ranksNow.leader.rank} · members ${s.ranksNow.member.rank}${s.next ? ` · level ${s.next.level}: ${s.next.missing.length ? s.next.missing.length + ' missing' : s.next.unknown.length ? 'check ' + s.next.unknown.length : 'ready'}` : ''}`;
  }

  function html() {
    const d = CR.data;
    if (!d) { if (!CR.at && !CR.busy) setTimeout(refresh, 0); return `<div class="crk"><div class="muted">${CR.err ? 'Nobility ranks: ' + h(CR.err) : 'Loading the nobility ranks…'}</div></div>`; }
    if (Date.now() - CR.at > 60000 && !CR.busy) setTimeout(refresh, 0);
    const s = d.summary, c = s.clan, lvl = c.level;

    // 1) where we are
    const head = `<div class="crk-head"><b>${h(c.name || 'Clan')}</b> <span class="muted">clan level <b>${h(lvl)}</b> · leader ${h(c.leader || '?')} · ${h(c.members)} members · ${c.rep == null ? '?' : n(c.rep)} reputation · seen ${h(agoTxt(c.seenAt))}${c.stale ? ' <b>(old)</b>' : ''}</span></div>`;
    const now = `<div class="crk-now">
      <div class="crk-card"><div class="muted">Clan leader</div><div class="crk-rank">${h(s.ranksNow.leader.rank)}</div></div>
      <div class="crk-card"><div class="muted">Members</div><div class="crk-rank">${h(s.ranksNow.member.rank)}</div></div>
      <div class="crk-card crk-wide muted">Noblesse = at least Baron, Hero = at least Marquis (any clan level). Ranks come from L2J; the forum chart agrees from clan level 5 up.${s.ranksNow.chartLeader !== s.ranksNow.leader.rank || s.ranksNow.chartMember !== s.ranksNow.member.rank ? ` Chart at this level: leader ${h(s.ranksNow.chartLeader)}, members ${h(s.ranksNow.chartMember)}.` : ''}</div></div>`;

    // 2) the next clan level
    let next = '';
    if (s.next) {
      const u = s.next.unlocks || {}, ml = u.memberLimit || {};
      const opens = [];
      if (ml.main != null) opens.push(`Main clan up to ${ml.main} members${ml.academy ? `, academy ${ml.academy}` : ''}${ml.royalGuardsEach ? `, Royal Guard 2 × ${ml.royalGuardsEach}` : ''}${ml.knightsEach ? `, Knights 4 × ${ml.knightsEach}` : ''}`);
      (u.features || []).forEach(f => opens.push(h(f.what)));
      if ((u.clanSkills || []).length) opens.push(`${u.clanSkills.length} clan skills: ${h(u.clanSkills.join(', '))}`);
      if ((u.squadSkills || []).length) opens.push(`${u.squadSkills.length} squad skills`);
      const rc = (s.next.rankChanges || []).map(r => `${h(SHORT[r.role] || r.role)}: ${r.isNew ? '' : h(r.fromName) + ' → '}<b>${h(r.toName)}</b>`);
      next = `<h4 class="crk-h">Clan level ${h(s.next.level)} needs ${s.next.ok === true ? '<span class="crk-chip ok">all there</span>' : ''}</h4>
        ${(s.next.reqs || []).map(reqRow).join('') || '<div class="muted">nothing listed</div>'}
        ${s.next.live ? `<div class="muted crk-src">Village master page (LIVE): ${h(s.next.live.text)}${s.next.live.matchesDatapack === false ? ' — <b>differs from L2J</b>' : ''}</div>` : ''}
        <h4 class="crk-h">It opens</h4><ul class="crk-list">${opens.map(o => `<li>${o}</li>`).join('') || '<li class="muted">nothing new</li>'}</ul>
        <h4 class="crk-h">Ranks after it</h4><div>${rc.length ? rc.join(' · ') : '<span class="muted">no rank changes (L2J)</span>'}</div>`;
    } else if (lvl >= 11) next = '<div class="muted">Clan level 11 = the highest.</div>';

    // 3) what a rank opens and when we get it
    const goals = `<h4 class="crk-h">What a rank opens</h4><div class="crk-scroll"><table class="l2 crk-tbl"><thead><tr><th>Rank</th><th>Opens</th><th>Leader at clan lvl</th><th>Members at clan lvl</th></tr></thead><tbody>
      ${(d.goals || []).map(g => `<tr><td><b>${h(g.rank)}</b></td><td>${h(g.what)}</td><td>${g.pc === -1 ? 'always' : h(g.leaderAt)}${g.leaderHas ? ' <span class="crk-chip ok">now</span>' : ''}</td><td>${g.memberAt == null ? '–' : h(g.memberAt)}${g.membersHave ? ' <span class="crk-chip ok">now</span>' : ''}${g.noblesseOpens ? ' <span class="muted">or Noblesse</span>' : ''}</td></tr>`).join('')}
      </tbody></table></div>`;

    // 4) the ladder (folded)
    const roles = (d.roles || []).map(r => r.key);
    const ladder = `<details class="crk-fold"><summary>Rank ladder: clan level × member type</summary><div class="crk-scroll"><table class="l2 crk-tbl crk-ladder"><thead><tr><th>Lvl</th>${roles.map(r => `<th>${h(SHORT[r] || r)}</th>`).join('')}</tr></thead><tbody>
      ${(d.ladder || []).map(row => `<tr class="${row.level === lvl ? 'crk-cur' : ''}"><td><b>${row.level}</b></td>${roles.map(r => { const cell = row.cells[r] || {};
        if (cell.l2j == null && cell.chart == null) return '<td class="muted">–</td>';
        const name = cell.l2j == null ? '–' : (d.rankNames || [])[cell.l2j] || cell.l2j;
        const chart = Array.isArray(cell.chart) ? cell.chart.map(x => (d.rankNames || [])[x]).join(' or ') : cell.chart == null ? 'not on the chart' : (d.rankNames || [])[cell.chart];
        return `<td${cell.differs ? ` class="crk-diff" title="forum chart: ${h(chart)}"` : ''}>${h(name)}${cell.differs ? '*' : ''}</td>`; }).join('')}</tr>`).join('')}
      </tbody></table></div><div class="muted crk-src">* the forum chart says something else (tap / hover the cell). Guard capt. / Knight cmdr. = a main member who leads a Royal Guard / an Order of Knights. Academy from clan level 5, Royal Guard from 6, Knights from 7.</div></details>`;

    // 5) members (folded)
    const mem = (s.members || []).length ? `<details class="crk-fold"><summary>Members' ranks (${s.members.length})</summary><div class="crk-mem">${s.members.map(m => `<div class="crk-mrow"><b>${h(m.name)}</b> <span class="muted">lvl ${h(m.level)} · ${h(SHORT[m.role] || m.role)}</span><span class="crk-mrank">${h(m.rank)}${m.noble ? ' (Noblesse)' : ''}${m.hero ? ' (Hero)' : ''}</span></div>`).join('')}</div></details>`
      : `<div class="muted crk-src">Member list not reported yet (clan.log intel only: ${h(c.members)} members).</div>`;

    // 6) sources + differences (folded)
    const src = `<details class="crk-fold"><summary>Sources and differences</summary>
      <ul class="crk-list">${(d.conflicts || []).map(x => `<li><b>${h(x.where)}</b>: chart ${h(x.chart)}; L2J ${h(x.l2j)} → uses ${h(x.use)}</li>`).join('')}</ul>
      <ul class="crk-list">${(d.l2toggleNotes || []).map(x => `<li><b>${h(x.what)}</b> <span class="muted">[${h(x.tag)}]</span>: ${h(x.text)}</li>`).join('')}</ul>
      <div class="muted crk-src">Clan skill ranks (Clan Might = Heir, Clan Guidance = Elder, ...) are retail behaviour: L2J gives every member every clan skill. Data built ${h(agoTxt(d.generated))} by docs/plan/tools/clan_ranks.js; clan info from ${h(c.source || '?')}.</div></details>`;

    return `<div class="crk">${head}${now}${next}${goals}${ladder}${mem}${src}</div>`;
  }

  function mount(el) {
    if (!el) return;
    if (!CR.mounts.includes(el)) CR.mounts.push(el);
    el.innerHTML = html();
  }
  setInterval(() => { if (!document.hidden && (CR.mounts.some(el => el.isConnected) || (typeof TAB !== 'undefined' && TAB === 'clan'))) refresh(); }, 60000);

  window.ClanRanks = { html, badge, refresh, mount, _state: CR };
})();
