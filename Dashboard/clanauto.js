// CLAN AUTOMATION overview (user 2026-10-12: "optimize the /clan section, there are too many manual tasks in there"). The top of the Clan tab:
// "Needs you" (only what really waits for a decision / an OK, each with ONE button) + "Runs by itself" (one switch + one status line per
// automation). The rest of the Clan tab is folded into sections (ClanAuto.sec). Data: Dashboard/clanauto_api.js (GET/POST /api/clanauto);
// switches live in Scripts/data/clan_quests.json clan.auto (swarm.js CLANAUTO reads them live) + Logs/clan_auto.json (levelUp).
// Uses index.html globals: esc, api, ago, GI, UI, patch, CLAN, clanTabsHtml, TAB, confirmOrder, send, loadClan, and uidialog's uiConfirm /
// uiP / uiEm / uiWarn / uiNote / uiCode. No browser alert / confirm / prompt.
(function () {
  'use strict';
  const CA = { data: null, at: 0, busy: false, err: '' };
  const h = (s) => (typeof esc === 'function' ? esc(s) : String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const gi = (k, cls) => (typeof GI === 'function' && typeof UI !== 'undefined' && UI[k] ? GI(UI[k], cls || 'sm') : '');
  const tab = () => document.getElementById('tab-clan');
  const STATE_LABEL = { ok: ['good', 'running'], wait: ['ok', 'waiting'], need: ['hard', 'needs you'], off: ['low', 'off'] };
  // switching these ON sends parties / spends SP or adena -> one confirm; switching anything OFF never asks
  const ASK_ON = {
    levelUp: 'The clan leader raises the clan level by himself (in a town, when SP / adena / items are there). It spends his SP, adena and the level item.',
    levelQuests: 'Every 10 min the next automated step of the clan level quest is sent: hunt steps take the fitting party to the hunting ground, talk / level-up steps take the clan leader away from leveling.',
    questDispatch: 'Every 10 min a fitting party is sent to a live clan quest raid boss and the clan leader goes along (!assist).',
    questActivate: 'Every clan raid quest the clan level allows counts as active (raid hunt and the call-in above use them).',
  };

  function refresh() {
    if (CA.busy || typeof api !== 'function') return;
    CA.busy = true;
    api('/api/clanauto').then(d => { if (d && !d.error) { CA.data = d; CA.err = ''; } else CA.err = (d && d.error) || 'no answer'; CA.at = Date.now(); rerender(); })
      .catch(e => { CA.err = e.message; }).finally(() => { CA.busy = false; });
  }
  function rerender() { try { const box = document.getElementById('clanBox'); if (box && typeof CLAN !== 'undefined' && CLAN && typeof patch === 'function' && typeof clanTabsHtml === 'function') patch(box, clanTabsHtml(CLAN)); } catch (e) { } }

  /** a folded section of the Clan tab (closed by default; patch() keeps what the user opened) */
  function sec(key, title, inner, badge, open) {
    if (!inner) return '';
    return `<details class="casec" data-casec="${h(key)}"${open ? ' open' : ''}><summary><span class="catitle">${h(title)}</span>${badge ? ` <span class="muted">${h(badge)}</span>` : ''}</summary><div class="casecbody">${inner}</div></details>`;
  }
  function sw(key, on, label) {
    return `<button class="catgl${on ? ' on' : ''}" data-caset="${h(key)}|${on ? 0 : 1}" aria-pressed="${on ? 'true' : 'false'}" title="${on ? 'switch off' : 'switch on'}">${on ? 'ON' : 'OFF'}</button>${label ? `<span class="calbl">${h(label)}</span>` : ''}`;
  }
  function needHtml(n, i) {
    const btn = n.kind === 'order' || n.kind === 'handover' ? `<button data-caneed="${i}">${h(n.button || 'Do it')}</button>`
      : n.kind === 'manual' || n.kind === 'name' ? `<button data-caopen="${h(n.anchor || 'leader')}">Show</button>` : '';
    return `<div class="caneed">${gi(n.kind === 'info' ? 'quest' : 'warn')}<span class="catxt">${h(n.text)}${n.cost ? ` <span class="muted">· costs ${h(n.cost)}</span>` : ''}</span>${btn}</div>`;
  }
  function rowHtml(r) {
    const fixed = r.on === null || r.on === undefined;
    const [cls, lab] = fixed && r.state === 'ok' ? ['good', 'ok'] : (STATE_LABEL[r.state] || STATE_LABEL.ok);
    return `<div class="carow">
      <div class="casw">${fixed ? '<span class="catgl fixed" title="always automatic">AUTO</span>' : sw(r.key, !!r.on)}</div>
      <div class="cabody"><div><b>${h(r.title)}</b> <span class="fit ${cls}">${lab}</span></div><div class="catxt muted">${h(r.text)}</div>
        ${r.sub ? `<div class="casub">${sw(r.sub.key, !!r.sub.on, r.sub.label)}</div>` : ''}</div></div>`;
  }
  /** the overview box (top of the Clan tab, configured clan only) */
  function html() {
    const d = CA.data;
    if (!d) { if (!CA.at) setTimeout(refresh, 0); return `<div class="box caov"><div class="muted">${CA.err ? 'Automation status: ' + h(CA.err) : 'Loading the automation status…'}</div></div>`; }
    const needs = d.needs || [], acts = needs.filter(n => n.kind !== 'info'), infos = needs.filter(n => n.kind === 'info');
    const nRun = (d.rows || []).filter(r => r.on !== false && (r.state === 'ok')).length;
    return `<div class="box caov">
      <div class="cahead">${gi('clan')} <b>${h(d.clan || 'no clan yet')}</b> <span class="muted">level ${h(d.level)} · clan leader ${h(d.leader)} ${d.leaderOnline ? '(online)' : '<b>(offline)</b>'} · status ${typeof ago === 'function' ? ago(d.at) : ''}</span></div>
      <h3 class="cah">${gi('warn')} Needs you <span class="muted">(${acts.length}${infos.length ? ' + ' + infos.length + ' notes' : ''})</span></h3>
      ${acts.length || infos.length ? acts.concat(infos).map(n => needHtml(n, needs.indexOf(n))).join('') : '<div class="muted">Nothing — everything below runs by itself.</div>'}
      <h3 class="cah">${gi('yes')} Runs by itself <span class="muted">(${nRun} of ${(d.rows || []).length} active right now)</span></h3>
      ${(d.rows || []).map(rowHtml).join('')}
      <div class="muted cafoot">Switches: Scripts/data/clan_quests.json clan.auto (the bots read them live). Everything costly (registration fees, trades between parties, level quests that move parties) asks once or stays off until you switch it on.</div></div>`;
  }
  function parties() { return ((CA.data && (CA.data.rows || []).find(r => r.key === 'invite')) || {}).parties || null; }

  async function post(body, okText) {
    try { const r = await api('/api/clanauto', { method: 'POST', body: JSON.stringify(body) }); if (!r || r.error) throw new Error((r && r.error) || 'refused');
      const m = document.getElementById('msg'); if (m) m.innerHTML = gi('yes') + ' ' + h(okText);
      refresh(); if (typeof loadClan === 'function') loadClan(); return true;
    } catch (e) { const m = document.getElementById('msg'); if (m) m.innerHTML = gi('warn') + ' ' + h(e.message); return false; }
  }
  async function onClick(e) {
    const b = e.target.closest('button'); if (!b || !tab() || !tab().contains(b)) return;
    const d = b.dataset;
    if (d.caset) {
      e.stopPropagation();
      const [key, on] = d.caset.split('|'), want = on === '1', row = ((CA.data && CA.data.rows) || []).find(r => r.key === key || (r.sub && r.sub.key === key));
      const title = row ? (row.key === key ? row.title : row.sub.label) : key;
      if (want && ASK_ON[key] && !(await uiConfirm({ title: `Switch on: ${title}?`, body: [uiP(ASK_ON[key]), uiNote('You can switch it off here at any time.')], confirmText: 'Switch on' }))) return;
      post({ action: 'set', key, on: want }, `${title}: ${want ? 'ON' : 'OFF'}`); return;
    }
    if (d.cainvp) {
      e.stopPropagation();
      const [L, on] = d.cainvp.split('|'), want = on === '1';
      if (want && !(await uiConfirm({ title: `Invite party ${L}?`, body: [uiP('Every member of party ', uiEm(L), ' — also characters that join the party later — is invited when it stands next to the clan leader and the clan has room.')], confirmText: 'Invite the party' }))) return;
      post({ action: 'inviteParty', leader: L, on: want }, `party ${L}: ${want ? 'invited (also new members)' : 'no longer invited as a party'}`); return;
    }
    if (d.caopen) {
      e.stopPropagation();
      const el = tab().querySelector(`details[data-casec="${d.caopen}"]`); if (el) { el.open = true; el.scrollIntoView({ behavior: 'smooth', block: 'start' }); } return;
    }
    if (d.caneed != null) {
      e.stopPropagation();
      const n = ((CA.data && CA.data.needs) || [])[+d.caneed]; if (!n) return;
      if (n.kind === 'order') {
        if (typeof confirmOrder !== 'function' || typeof send !== 'function') return;
        if (await confirmOrder(n.target, n.cmd, n.label + (n.cost ? ' — costs ' + n.cost : ''))) send(n.target, null, n.cmd);
        return;
      }
      if (n.kind === 'handover') {
        if (!(await uiConfirm({ title: `Hand ${n.item} to ${n.receiver}?`, body: [uiP(uiEm(n.giver), ` walks to `, uiEm(n.receiver), ` and trades ${n.count} × ${n.item} (a trade between parties — this is your OK).`), uiNote('Same hand-over as the Trade page; progress on the Trade page.')], confirmText: 'Hand it over' }))) return;
        try {
          const r = await api('/api/trade/order', { method: 'POST', body: JSON.stringify({ receiver: n.receiver, sel: { [n.giver]: { [n.objId]: n.count } }, adena: {}, confirm: true, note: 'clan level item (Clan tab)' }) });
          const m = document.getElementById('msg'); if (m) m.innerHTML = r && r.ok ? gi('yes') + ` hand-over ${h(r.id)}: ${h(n.giver)} → ${h(n.receiver)} (${h(n.item)})` : gi('warn') + ' ' + h((r && r.error) || 'refused');
        } catch (er) { const m = document.getElementById('msg'); if (m) m.innerHTML = gi('warn') + ' ' + h(er.message); }
      }
    }
  }
  document.addEventListener('click', onClick, true);
  setInterval(() => { if (typeof TAB !== 'undefined' && TAB === 'clan' && !document.hidden) refresh(); }, 15000);
  window.ClanAuto = { html, sec, refresh, parties, _data: () => CA.data };
})();
