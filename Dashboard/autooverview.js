// WHAT RUNS BY ITSELF — page #/auto[/<leader>] (Discord player Roketta 2026-10-15: "one page with everything SwarmHive can do by itself, per
// party: is it on or off right now, why, and where do I switch it"). READ-ONLY: every row has a "Change" button that opens the place where that
// switch lives (party ⚙ Settings section, Storage page, 7 Signs tab, Clan tab, Classes / Buffs page, the party card for Start / Stop).
// Data: GET /api/autooverview (Dashboard/autooverview_api.js); the rows come from Dashboard/autocatalog.js (window.AutoCatalog, the same
// list the API evaluates). Uses index.html globals: esc, api, go, stopChar, TAB; window.PartySettings / PartyPlan for the settings popup.
// Rules: ui-for-non-technical (plain words, no file names in the main view), phone-first, no browser alert / confirm / prompt.
(function () {
  'use strict';
  const SEC = 'tab-auto';
  const AU = { open: false, d: null, party: '', filter: 'all', timer: 0, busy: false, err: '' };
  const $id = (i) => document.getElementById(i);
  const h = (s) => (typeof esc === 'function' ? esc(s) : String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const CAT = () => window.AutoCatalog || { GROUPS: [], ENTRIES: [], byKey: {} };
  // pill per state: [css class (index.html .fit), label]
  const PILL = { on: ['good', 'ON'], off: ['low', 'OFF'], paused: ['next', 'WAITS FOR START'], always: ['ok', 'ALWAYS ON'], order: ['ok', 'YOUR ORDER'], manual: ['low', 'NEVER BY ITSELF'] };
  const FILTERS = [['all', 'Everything'], ['on', 'Running'], ['off', 'Off'], ['paused', 'Waits for Start']];

  async function load() {
    if (AU.busy) return; AU.busy = true;
    try { const d = await api('/api/autooverview'); if (d && !d.error) { AU.d = d; AU.err = ''; } else AU.err = (d && d.error) || 'no answer'; }
    catch (e) { AU.err = 'The dashboard server has no Automations API yet (it needs a restart).'; }
    AU.busy = false; render();
  }
  function section() {
    let s = $id(SEC); if (s) return s;
    s = document.createElement('section'); s.id = SEC; s.className = 'win au'; s.hidden = true;
    s.innerHTML = `<div class="au-head"><h2>What runs by itself</h2>
      <span class="muted au-intro">Everything the bots can do on their own, per party: on or off right now, why, and where to change it. Nothing here changes anything — the buttons take you to the switch.</span></div>
      <div class="au-parties" id="auParties" role="tablist" aria-label="Party"></div>
      <div id="auBody"></div>`;
    (document.querySelector('main') || document.body).appendChild(s);
    s.addEventListener('click', onClick);
    return s;
  }
  function route(kind, arg) {
    if (kind === 'auto') { if (arg) AU.party = decodeURIComponent(arg); open(); return true; }
    close(); return false;
  }
  function open() {
    const s = section();
    try { stopChar(); } catch (e) { }
    try { TAB = 'auto'; } catch (e) { }
    try { [...$id('tabs').children].forEach(b => b.classList.toggle('on', b.dataset.tab === 'auto')); } catch (e) { }
    document.querySelectorAll('main > section').forEach(x => { if (x.id !== SEC) x.hidden = true; });
    const was = AU.open; s.hidden = false; AU.open = true;
    if (!was) window.scrollTo(0, 0);
    if (!AU.timer) AU.timer = setInterval(() => { if (AU.open && !document.hidden) load(); }, 30000);
    render(); load();
  }
  function close() {
    if (!AU.open) return;
    AU.open = false; clearInterval(AU.timer); AU.timer = 0;
    const s = $id(SEC); if (s) s.hidden = true;
  }

  function partyOf(d) { const P = (d && d.parties) || []; return P.find(p => p.leader === AU.party) || P[0] || null; }
  function render() {
    if (!AU.open) return;
    const d = AU.d, pl = $id('auParties'), body = $id('auBody'); if (!pl || !body) return;
    if (!d) { body.innerHTML = `<div class="box muted">${AU.err ? h(AU.err) : 'Loading…'}</div>`; return; }
    const P = partyOf(d); if (P) AU.party = P.leader;
    pl.innerHTML = (d.parties || []).map(p => `<button role="tab" aria-selected="${p.leader === AU.party}" class="au-pbtn${p.leader === AU.party ? ' on' : ''}" data-auparty="${h(p.leader)}"><span class="au-dot ${p.started ? 'go' : 'stop'}" aria-hidden="true"></span>${h(p.leader)}</button>`).join('');
    if (!P) { body.innerHTML = '<div class="box muted">No parties known yet.</div>'; return; }
    const items = {}; (P.items || []).forEach(i => { items[i.key] = i; });
    const C = CAT(), count = (st) => (P.items || []).filter(i => i.state === st).length;
    const head = `<div class="box au-sum">
      <div class="au-sumrow"><b>Party ${h(P.leader)}</b> <span class="fit ${P.started ? 'good' : 'low'}">${P.started ? 'STARTED' : 'STOPPED'}</span>
        <span class="muted">${P.members.length} character${P.members.length === 1 ? '' : 's'}${P.online ? '' : ' · leader offline'}</span></div>
      <div class="au-line">${P.started ? 'Started: the switches below decide what runs.' : 'Stopped: only what says ALWAYS ON (and your orders) runs. Press Start on the party card to let the rest work.'}</div>
      ${P.now ? `<div class="au-line muted">Leader now: ${h(P.now)}</div>` : ''}
      <div class="au-counts muted">${count('on')} running · ${count('paused')} wait for Start · ${count('off')} off · ${count('always')} always on</div>
      <div class="au-filter" role="group" aria-label="Show">${FILTERS.map(([k, l]) => `<button class="au-fbtn${AU.filter === k ? ' on' : ''}" aria-pressed="${AU.filter === k}" data-aufilter="${k}">${h(l)}</button>`).join('')}</div>
      <div class="au-acts"><button data-augo="card">▶ Start / ■ Stop is on the party card</button>${window.PartySettings ? `<button data-ausettings="">⚙ Party settings</button>` : ''}</div></div>`;
    const keep = (i) => AU.filter === 'all' || i.state === AU.filter || (AU.filter === 'on' && i.state === 'always');
    const groups = (C.GROUPS || []).map(g => {
      const rows = (C.ENTRIES || []).filter(e => e.group === g.key && items[e.key] && keep(items[e.key])).map(e => rowHtml(e, items[e.key], P)).join('');
      return rows ? `<div class="box au-grp"><h3>${h(g.title)}</h3>${rows}</div>` : '';
    }).join('');
    body.innerHTML = head + (groups || '<div class="box muted">Nothing in this view.</div>') + `<div class="muted au-foot">Status ${h(typeof ago === 'function' ? ago(d.at) : '')} · refreshes every 30 s.</div>`;
  }
  function rowHtml(e, i, P) {
    const [cls, lab] = PILL[i.state] || PILL.off;
    const w = e.where || null;
    const btn = w ? `<button class="au-go" data-auwhere="${h(e.key)}">${h(w.label || 'Change')} ›</button>` : '';
    return `<div class="au-row" data-aukey="${h(e.key)}">
      <div class="au-top"><span class="fit ${cls} au-pill">${lab}</span> <b class="au-title">${h(e.title)}</b>${e.scope === 'clan' ? ' <span class="muted au-tag">whole clan</span>' : ''}</div>
      <div class="au-what">${h(e.what)}</div>
      <div class="au-why">${h(i.why)}</div>
      ${i.now ? `<div class="au-now">Now: ${h(i.now)}</div>` : ''}${i.last ? `<div class="au-now muted">${h(i.last)}</div>` : ''}
      <div class="au-sw muted">Switch: ${h(e.switch || 'none')}${e.def && e.def !== 'always' ? ` · new installs: ${h(e.def === 'on' ? 'on' : e.def === 'order' ? 'your order' : e.def === 'manual' ? 'never automatic' : 'off')}` : ''} ${btn}</div>
    </div>`;
  }

  function goWhere(e, leader) {
    const w = e.where || {};
    if (w.settings) {
      if (w.settings === 'plan' && window.PartyPlan && PartyPlan.open) { PartyPlan.open(leader); return; }
      if (window.PartySettings && PartySettings.open) { PartySettings.open(leader, w.settings); return; }
    }
    if (w.hash) { const hs = w.hash.replace(':leader', encodeURIComponent(leader)); if (typeof go === 'function') go(hs); else location.hash = hs; return; }
    toCard(leader);
  }
  function toCard(leader) {
    if (typeof go === 'function') go('#/parties'); else location.hash = '#/parties';
    let n = 0; const t = setInterval(() => { n++; const b = document.querySelector(`[data-spotpick="${CSS.escape(leader)}"]`); if (b || n > 30) { clearInterval(t); if (b) { const card = b.closest('.box, .party, section > div') || b; try { card.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch (er) { card.scrollIntoView(); } } } }, 150);
  }
  function onClick(ev) {
    const t = ev.target.closest('button'); if (!t) return;
    if (t.dataset.auparty !== undefined) { AU.party = t.dataset.auparty; try { history.replaceState(null, '', '#/auto/' + encodeURIComponent(AU.party)); } catch (e) { } render(); return; }
    if (t.dataset.aufilter) { AU.filter = t.dataset.aufilter; render(); return; }
    if (t.dataset.augo === 'card') { toCard(AU.party); return; }
    if (t.dataset.ausettings !== undefined) { if (window.PartySettings) PartySettings.open(AU.party); return; }
    if (t.dataset.auwhere) { const e = CAT().byKey[t.dataset.auwhere]; if (e) goWhere(e, AU.party); }
  }
  window.AutoPage = { route, open, close, reload: load, _state: AU };
})();
