// KAMALOKA PAGE v2 (user 2026-10-09 14:15: "/kamaloka still only shows 2 groups, and is not optimized like the rest of the pages").
//
// Pages (index.html route() hook: KamaPage.route(kind, arg)): #/kamaloka = the board, #/kamaloka/<id> = one Kamaloka (facts, every party,
// the instance map), #/kamaloka/live = the live run (index.html kamaLiveHtml(), the same view the old tab had).
// Replaces the old Kamaloka tab while this file is loaded; without it (server not restarted yet) the old tab keeps working.
// Board: pinned LIVE run (link to the live view + the party view) · "Today" = one row per party of swarm.config.json (party = leader name,
// party colour, members + levels, daily ON/OFF, done / locked / tries today, the NEXT daily pick + Run next, running live) · every Kamaloka
// as a compact card (level window, Hall max 6 / Labyrinth max 9, per party: fits / hall team / too low / too high / too many / too few,
// today's state, "next" badges, cleared today, Run / Force run for the chosen party) · collapsible Run history / Daily log / How it decides.
// Fit + next = Dashboard/kamalogic.js, computed by the server (/api/kamapage, Dashboard/kamapage_api.js) = swarm.js dailyDue / manualKamaloka.
// Filters (party, fits / all, Hall / Labyrinth) and which sections are open are remembered per viewer (localStorage, pref()).
// Data: /api/kamapage every 20 s (and after a switch / an order), /api/kamalive every 1 s on the live view (index.html polls it otherwise).
// Orders: the Run button -> confirmOrder + send('party:<leader>', '!mission kamaloka <lvl>') (asks first); daily switch -> POST /api/daily (asks first).
// HALL TEAM PER PARTY (user 2026-10-09 16:05): each party row shows its hall team (set on this page / the old list / automatic) with an editor
// (tick up to 6, the leader always goes) -> POST /api/kamahall (asks first; swarm.config.json kamaloka.hallTeams, swarm.js reads it live).
// The ticks being edited live in K.hallDraft, so the 5 s re-render never wipes them. Hall chips say "fits — hall team: A, B, ...".
// Uses index.html globals: esc, api, patch, pref, setPref, GI, UI, gauge, hhmm, confirmOrder, send, partyColor, stopChar, TAB, KAMA, KLIVE,
// kamaMap, KM_LEGEND, kamaLiveHtml, kamaShort.
(function () {
  'use strict';
  const SEC = 'tab-kamapage';
  const ICON = '/icons/icon/accessary_kamael_circlet_i00.png';
  const K = { open: false, mode: '', id: null, d: null, at: 0, err: '', timers: [], busy: false, built: '', liveBusy: false, hallDraft: {}, hallBusy: false };
  const HALL_SRC = { party: 'set on this page', legacy: 'the old global list', auto: 'automatic' };
  const P = { party: pref('kama.party', ''), fit: pref('kama.fit', 'all'), type: pref('kama.type', 'all'), q: '' };
  const PALETTE = ['#3b82f6', '#f59e0b', '#10b981', '#a855f7', '#ef4444', '#06b6d4', '#ec4899', '#84cc16'];
  const $id = (i) => document.getElementById(i);
  const FIT_TXT = { fits: 'fits', hall: 'hall team', low: 'too low', high: 'too high', spread: 'levels too spread', big: 'too many', small: 'too few', unknown: 'levels unknown' };
  const pcol = (p) => {
    try { if (typeof STATE !== 'undefined' && STATE && STATE.chars && STATE.chars.some(c => c.party === p)) return partyColor(p); } catch (e) { }
    const i = K.d ? K.d.parties.findIndex(x => x.leader === p) : 0; return PALETTE[Math.max(0, i) % PALETTE.length];
  };
  const short = (k) => k ? `${k.kind === 'hall' ? 'Hall' : 'Labyrinth'} ${k.lvl}` : '?';
  const kOf = (id) => K.d && K.d.kamaloka.find(k => k.id === id);
  const when = (iso) => { try { return hhmm(iso); } catch (e) { return String(iso || ''); } };
  const left = (ms) => { if (!(ms > 0)) return 'now'; const m = Math.floor(ms / 60000), h = Math.floor(m / 60); return h ? `${h}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`; };
  const mss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  // LIVE PER PARTY 2026-10-09: every party's run (one card each) and its own live view #/kamaloka/live/<leader>
  const runsAll = () => { try { if (typeof KLIVE !== 'undefined' && KLIVE && Array.isArray(KLIVE.runs) && KLIVE.runs.length) return KLIVE.runs; } catch (e) { } return (K.d && K.d.lives) || []; };
  const runOf = (leader) => runsAll().find(r => r.leader === leader) || null;
  const liveRunOf = (id) => runsAll().find(r => r.running && r.id === id) || null;
  const liveHref = (leader) => '#/kamaloka/live' + (leader ? '/' + encodeURIComponent(leader) : '');
  const setFor = (l) => { try { KLIVE_FOR = l || ''; } catch (e) { } };
  // KAMALOKA CHARS 2026-10-09 (user: "it does not show who has completed and who has not"): m.kama = { st: done|locked|entered, id, at, assumed }
  const charChip = (m) => { const c = m.kama; const st = c && c.st;
    const txt = st === 'done' ? 'done today: ' + short(kOf(c.id)) : st === 'locked' ? 'locked (#2100)' : 'free';
    const tip = c ? `${st} ${short(kOf(c.id))} ${when(c.at)}${c.by ? ' · party ' + c.by : ''}${c.assumed ? ' · assumed from the logs (before per-character records)' : ''}${st === 'entered' ? ' · entered, no boss kill: still free' : ''}` : 'free: can enter a Kamaloka today';
    const cls = st === 'done' || st === 'locked' ? 'used' : 'open';
    return `<span class="kp-tc ${cls}" title="${esc(tip)}">${esc(txt)}</span>`; };
  const clearedBy = (cl) => cl ? `cleared ${esc(when(cl.at))}${cl.by ? ' by party ' + esc(cl.by) + (cl.n ? ` (${cl.n} chars)` : '') : ''}${(cl.runs || []).length > 1 ? ` · ${cl.runs.length} runs today` : ''}` : '';
  const liveObj = () => { try { if (typeof KLIVE !== 'undefined' && KLIVE && (KLIVE.running || KLIVE.finished)) return KLIVE; } catch (e) { } return K.d && K.d.live && (K.d.live.running || K.d.live.finished) ? K.d.live : null; };
  const secOpen = (k, def) => pref('kama.open.' + k, def);
  const det = (k, def, title, body, sum) => `<details class="kp-sec" data-sec="${k}"${secOpen(k, def) ? ' open' : ''}><summary><b>${title}</b><span class="muted" id="kpSum_${k}">${sum || ''}</span></summary><div class="kp-dbody" id="kpSec_${k}">${body || ''}</div></details>`;

  // =========================================================================================== routing / page
  function section() {
    let s = $id(SEC);
    if (s) return s;
    s = document.createElement('section'); s.id = SEC; s.className = 'win kp'; s.hidden = true;
    s.innerHTML = '<div id="kpView"></div>';
    (document.querySelector('main') || document.body).appendChild(s);
    s.addEventListener('click', onClick);
    s.addEventListener('input', onInput);
    s.addEventListener('change', onInput);
    s.addEventListener('toggle', onToggle, true);              // <details> open / close (toggle does not bubble: capture)
    return s;
  }
  function route(kind, arg) {
    if (kind === 'kamaloka') { const a = arg ? decodeURIComponent(arg) : ''; if (a === 'live') { open('live', decodeURIComponent(location.hash.replace(/^#\/?/, '').split('/')[2] || '')); return true; } open(a ? 'detail' : 'board', a); return true; }
    close();
    return false;
  }
  function open(mode, id) {
    const s = section();
    try { stopChar(); } catch (e) { }
    try { TAB = 'kamav2'; } catch (e) { }                      // the old Kamaloka tab's loops (TAB === 'kamaloka') stay quiet
    try { [...$id('tabs').children].forEach(b => b.classList.toggle('on', b.dataset.tab === 'kamaloka')); } catch (e) { }
    document.querySelectorAll('main > section').forEach(x => { if (x.id !== SEC) x.hidden = true; });
    s.hidden = false; document.body.classList.add('kp-on');
    const was = K.mode + ':' + K.id;
    K.mode = mode; K.id = mode === 'detail' ? String(id) : mode === 'live' ? String(id || '') : null;
    setFor(mode === 'live' ? K.id : '');   // index.html pollKama asks for this party's run too (it no longer overwrites KLIVE with another party)
    if (was !== K.mode + ':' + K.id) { window.scrollTo(0, 0); K.built = ''; }
    K.open = true;
    stopTimers();
    K.timers = [setInterval(tick, 1000), setInterval(() => load(false), 5000)];
    build();
    load(true);
  }
  function stopTimers() { K.timers.forEach(clearInterval); K.timers = []; }
  function close() {
    if (!K.open) return;
    K.open = false; stopTimers(); K.built = ''; setFor('');
    document.body.classList.remove('kp-on');
    const s = $id(SEC); if (s) s.hidden = true;
  }
  document.addEventListener('visibilitychange', () => { if (K.open && !document.hidden) load(true); });

  // =========================================================================================== data
  async function load(force) {
    if (!K.open || document.hidden || K.busy) return;
    if (!force && Date.now() - K.at < 20000) return;
    K.busy = true;
    try {
      const d = await api('/api/kamapage');
      if (d && d.parties) { K.d = d; K.err = ''; K.at = Date.now(); try { KAMA = d; } catch (e) { } }   // kamaMap / kamaLiveHtml read KAMA.kamaloka
      else K.err = (d && d.error) || 'no data';
    } catch (e) { K.err = e.message; }
    finally { K.busy = false; }
    build(); render();
  }
  async function loadLive() {
    if (K.liveBusy) return; K.liveBusy = true;
    try { const L = await api('/api/kamalive' + (K.mode === 'live' && K.id ? '?leader=' + encodeURIComponent(K.id) : '')); try { KLIVE = L; } catch (e) { } } catch (e) { } finally { K.liveBusy = false; }
  }
  function selParty() {
    const ps = K.d ? K.d.parties.map(p => p.leader) : [];
    if (P.party && ps.includes(P.party)) return P.party;
    return ps[0] || '';                                          // the main leader's party (the server lists it first)
  }
  const partyOf = (l) => K.d && K.d.parties.find(p => p.leader === l);

  // =========================================================================================== build + render
  function build() {
    const v = $id('kpView'); if (!v) return;
    const key = K.mode + ':' + (K.id || '') + ':' + (K.d ? 1 : 0);
    if (K.built === key) return;
    K.built = key;
    if (!K.d) { v.innerHTML = `<div class="kp-head"><h2><img class="gi" src="${ICON}" alt=""> Kamaloka</h2></div><div class="kp-empty" id="kpLoad">${K.err ? 'Could not load: ' + esc(K.err) : 'loading…'}</div>`; return; }
    if (K.mode === 'board') {
      v.innerHTML = `<div class="kp-head"><h2><img class="gi" src="${ICON}" alt=""> Kamaloka</h2><span class="kp-sum" id="kpSum"></span>
          <div class="act"><select id="kpParty" title="the party the filter and the Run buttons are for" aria-label="party"></select></div></div>
        <div class="kp-pin" id="kpPin"></div>
        <div class="box kp-box kp-can" id="kpCan"></div>
        ${det('today', true, 'Today per party', '', '')}
        <div class="kp-bar"><input type="search" id="kpQ" placeholder="find a Kamaloka, boss or town…" aria-label="find a Kamaloka" value="${esc(P.q)}">
          <div class="kp-seg" id="kpFitSeg"></div><div class="kp-seg" id="kpTypeSeg"></div></div>
        <div class="kp-count" id="kpCount"></div>
        <div class="kp-board" id="kpBoard"></div>
        ${det('hist', false, 'Run history', '', '')}
        ${det('dlog', false, 'Daily log', '', '')}
        ${det('how', false, 'How the daily run decides', '', '')}`;
    } else if (K.mode === 'detail') {
      v.innerHTML = `<div class="kp-crumb"><a href="#/kamaloka">‹ All Kamaloka</a></div><div id="kpDetail"></div>`;
    } else {
      v.innerHTML = `<div class="kp-crumb"><a href="#/kamaloka">‹ All Kamaloka</a></div><div id="kpLive"></div>`;
    }
  }
  function render() {
    if (!K.open || !K.d) { const l = $id('kpLoad'); if (l && K.err) l.textContent = 'Could not load: ' + K.err; return; }
    if (K.mode === 'board') { renderHead(); renderPin(); renderCan(); renderToday(); renderBoard(); renderSecs(); }
    else if (K.mode === 'detail') renderDetail();
    else renderLive();
  }
  function tick() {
    if (!K.open) return;
    if (!/^#\/kamaloka(\/|$)/.test(location.hash)) { close(); return; }
    if (K.mode === 'live') { loadLive().then(renderLive); return; }
    if (K.mode === 'board') { renderPin(); const r = $id('kpReset'); if (r && K.d) r.textContent = left(K.d.nextReset - Date.now()); }
  }

  function renderHead() {
    const d = K.d, p = selParty();
    const sel = $id('kpParty');
    if (sel) {
      const html = d.parties.map(x => `<option value="${esc(x.leader)}"${x.leader === p ? ' selected' : ''}>party ${esc(x.leader)} (${x.eval.size}${x.eval.levels ? ', lvl ' + x.eval.levels.min + (x.eval.levels.max !== x.eval.levels.min ? '–' + x.eval.levels.max : '') : ''})</option>`).join('');
      if (sel.dataset.opts !== html) { sel.innerHTML = html; sel.dataset.opts = html; }
      if (sel.value !== p && document.activeElement !== sel) sel.value = p;
    }
    const on = d.parties.filter(x => x.enabled.kamaloka).length;
    patch($id('kpSum'), `<b>${d.kamaloka.length}</b> instances · <b>${d.parties.length}</b> parties · ${on ? `daily runs on for <b>${on}</b>` : 'daily runs: <b>off</b> — nothing happens until you switch it on'} · day ${esc(d.day)}, resets 06:30 (in <span id="kpReset">${left(d.nextReset - Date.now())}</span>)`);
  }

  // ------------------------------------------------------------------------- pinned live run
  function renderPin() {
    const el = $id('kpPin'); if (!el) return;
    const runs = runsAll();
    if (!runs.length) { const L0 = liveObj(); patch(el, L0 ? pinCard(L0) : ''); return; }
    patch(el, runs.map(pinCard).join(''));
  }
  function pinCard(L) {
    const k = kOf(L.id);
    const party = L.party || [], up = party.length ? party.filter(x => !x.dead).length : (L.alive || 0), n = party.length || L.size || 0;
    const end = L.endedMs || (L.updatedAt ? Date.parse(L.updatedAt) : Date.now());
    const secs = L.startedMs ? Math.max(1, Math.round((end - L.startedMs) / 1000)) : 0;
    const ph = String(L.phase || '');
    const name = k ? short(k) : (typeof kamaShort === 'function' ? kamaShort(L.name) : L.name);
    if (L.running) {
      return (`<a class="kp-live" href="${liveHref(L.leader)}" style="--pc:${pcol(L.leader)}"><span class="dot"></span><div class="t"><b>LIVE · ${esc(name)}</b>
        <div class="m">${L.leader ? 'party ' + esc(L.leader) + ' · ' : ''}${esc(ph)} · ${up}/${n} alive · ${L.kills || 0} killed${secs ? ' · ' + mss(secs) : ''}</div>
        ${L.step ? `<div class="m s">${esc(L.step)}</div>` : ''}</div>
        <div class="b"><button type="button" data-kpgo="${liveHref(L.leader)}">Watch</button>${L.leader ? `<button type="button" data-kpgo="#/live/${encodeURIComponent(L.leader)}">Party view</button>` : ''}</div></a>`);
    } else {
      const ok = /clear/i.test(L.result || '');
      return (`<a class="kp-live over ${ok ? 'ok' : 'bad'}" href="${liveHref(L.leader)}" style="--pc:${pcol(L.leader)}"><div class="t"><b>Run over · ${esc(name)}</b>
        <div class="m">${L.leader ? 'party ' + esc(L.leader) + ' · ' : ''}${esc(L.result || '?')}${secs ? ' · ' + mss(secs) : ''}</div>${(() => { try { return kamaLootHtml(L.loot); } catch (e) { return ''; } })()}</div>
        <div class="b"><button type="button" data-kpgo="${liveHref(L.leader)}">Details</button></div></a>`);
    }
  }

  // ------------------------------------------------------------------------- can run now (user 2026-10-09 18:27: "what team can actually do anything")
  function renderCan() {
    const el = $id('kpCan'); if (!el) return;
    const list = K.d.canRun || [];
    const rows = list.map(c => { const k = kOf(c.id); return `<div class="kp-wait" style="--pc:${pcol(c.leader)}"><b>party ${esc(c.leader)}</b> → <a href="#/kamaloka/${c.id}">${esc(short(k))}</a>${c.next ? ' <span class="kp-b next">daily pick</span>' : ''} <span class="muted">lvl ${k ? k.levelMin + '–' + k.levelMax : '?'} · ${esc(c.txt)}</span> <button type="button" class="kp-run" data-kprun="${esc(c.leader)}|${c.id}">Run now</button></div>`; }).join('');
    patch(el, `<h3>Can run now <span class="muted">(free characters enough, levels fit, not used today)</span></h3>${rows || `<div class="kp-empty">Nothing else possible today — next reset 06:30 (in ${left(K.d.nextReset - Date.now())}).</div>`}`);
  }
  // ------------------------------------------------------------------------- today per party
  function todayChip(k, r) {
    const cls = r.today === 'open' ? (r.tries ? 'tried' : 'open') : r.today === 'cleared' ? 'cleared' : 'used';
    const txt = r.today === 'open' ? `${r.left} ${r.left === 1 ? 'try' : 'tries'} left` : r.todayTxt;
    return `<a class="kp-tc ${cls}" href="#/kamaloka/${k.id}" title="${esc(r.why || txt)}">${esc(short(k))} · ${esc(txt)}</a>`;
  }
  function renderToday() {
    const el = $id('kpSec_today'); if (!el) return;
    const d = K.d, L = liveObj();
    const nxt = d.parties.filter(p => p.eval.next && p.enabled.kamaloka).length;
    patch($id('kpSum_today'), `${nxt} with a run due · ${d.parties.filter(p => p.running).length ? 'one running now' : 'none running'}`);
    patch(el, d.parties.map(p => {
      const e = p.eval, col = pcol(p.leader), on = p.enabled.kamaloka;
      const k = e.next ? kOf(e.next.id) : null;
      const lv = e.levels ? `lvl ${e.levels.min}${e.levels.max !== e.levels.min ? '–' + e.levels.max : ''}` : 'lvl ?';
      const touched = d.kamaloka.filter(x => { const r = e.rows[x.id]; return r && (r.today !== 'open' || r.tries); });
      const clr = d.kamaloka.filter(x => d.cleared[x.id] && d.cleared[x.id].by === p.leader && !(e.rows[x.id] && e.rows[x.id].today === 'cleared'));
      const PL = runOf(p.leader), live = p.running && PL && PL.running;   // LIVE PER PARTY: this party's run
      let nextHtml;
      if (live) nextHtml = `<a class="kp-b live" href="${liveHref(p.leader)}">LIVE · ${esc(short(kOf(PL.id)))}</a> <span class="muted">${esc(PL.phase || '')}</span>`;
      else if (k) {
        const warn = d.cleared[k.id] && d.cleared[k.id].by === p.leader ? ' <span class="kp-warn" title="the server answers #2100 and the run counts as done">cleared today by hand — the server will refuse</span>' : '';
        nextHtml = `<span class="ql">${on ? 'Next' : 'Would pick'}:</span> <a class="kp-nx" href="#/kamaloka/${k.id}">${esc(short(k))}</a> <span class="muted">lvl ${k.levelMin}–${k.levelMax} · ${esc(e.nextTxt)}</span>${warn}`;
      } else nextHtml = `<span class="ql">Next:</span> <span class="muted">${esc(e.nextTxt)}</span>`;
      const wait = !e.ready && e.next && on ? `<div class="kp-wait">waits until the whole party is in: ${esc(e.waitFor.slice(0, 4).join(', '))}${e.waitFor.length > 4 ? ' +' + (e.waitFor.length - 4) : ''} offline</div>` : '';
      const mems = p.members.map(m => `<span class="kp-m${m.online ? '' : ' off'}" title="${esc(m.cls || '')}${m.online ? '' : ' · offline'}"><i></i>${esc(m.name)} <b>${m.level ?? '?'}</b> ${charChip(m)}</span>`).join('');
      const nDone = p.members.filter(m => m.kama && (m.kama.st === 'done' || m.kama.st === 'locked')).length, freeN = p.members.filter(m => !(m.kama && (m.kama.st === 'done' || m.kama.st === 'locked'))).map(m => m.name);
      const charsLine = nDone ? `<div class="kp-wait" title="one Hall kill locks that character's Kamaloka until 06:30">today: <b>${nDone}/${p.members.length} done</b> · ${freeN.length ? 'free: ' + esc(freeN.slice(0, 6).join(', ')) + (freeN.length > 6 ? ' +' + (freeN.length - 6) : '') : 'nobody free'}</div>` : '';
      const memOpen = pref('kama.mem.' + p.leader, false);
      const last = p.lastDaily ? `<div class="kp-lastd">last daily ${when(p.lastDaily.at)}: ${esc(short(kOf(p.lastDaily.id)) || p.lastDaily.id)} <span class="kp-r ${/^ok/.test(p.lastDaily.result) ? 'good' : /^fail/.test(p.lastDaily.result) ? 'bad' : ''}">${esc(p.lastDaily.result)}</span>${p.lastDaily.msg ? ' <span class="muted">' + esc(p.lastDaily.msg) + '</span>' : ''}</div>` : '';
      return `<div class="kp-prow${on ? ' on' : ''}${live ? ' running' : ''}" style="--pc:${col}">
        <div class="h"><span class="pn">${esc(p.leader)}</span><span class="lv">${e.size} ${e.size === 1 ? 'char' : 'chars'} · ${lv}${e.offline.length ? ` · <span class="off">${e.offline.length} offline</span>` : ''}</span>
          <button type="button" class="kp-tog${on ? ' on' : ''}" data-kpdaily="${esc(p.leader)}|${on ? 0 : 1}" title="the leader runs the Kamaloka by itself once per day when the party is free">daily <b>${on ? 'ON' : 'OFF'}</b></button></div>
        ${charsLine}<div class="n">${nextHtml}${k && !live ? ` <button type="button" class="kp-run${e.rows[k.id].today !== 'open' ? ' force' : ''}" data-kprun="${esc(p.leader)}|${k.id}">Run now</button>` : ''}</div>${wait}
        ${touched.length || clr.length ? `<div class="kp-tcs">${touched.map(x => todayChip(x, e.rows[x.id])).join('')}${clr.map(x => `<a class="kp-tc cleared" href="#/kamaloka/${x.id}" title="kamaloka.log ${esc(when(d.cleared[x.id].at))}">${esc(short(x))} · cleared (by hand)</a>`).join('')}</div>` : (p.lastDay ? `<div class="kp-lastd muted">nothing tried today (last daily day ${esc(p.lastDay)})</div>` : '')}
        ${last}
        ${hallHtml(p)}
        <details class="kp-mem" data-mem="${esc(p.leader)}"${memOpen ? ' open' : ''}><summary>members &amp; levels</summary><div class="kp-ms">${mems}</div></details></div>`;
    }).join(''));
    // morphdom keeps a checkbox's checked PROPERTY once the viewer clicked it: follow the ticks (the label's .on) after every patch
    el.querySelectorAll('input[data-kphb]').forEach(i => { const on = i.closest('.kp-hb').classList.contains('on'); if (i.checked !== on) i.checked = on; });
  }

  // ------------------------------------------------------------------------- hall team (per party)
  /** the names shown for a party: what is set (this page / the old list), else the automatic pick for its best Hall */
  const hallNow = (p) => (p.hall && p.hall.names && p.hall.names.length ? p.hall.names : (p.hall && p.hall.suggest) || []);
  function hallHtml(p) {
    const h = p.hall || { src: 'auto', names: [], suggest: [] }, e = p.eval;
    const names = hallNow(p), open = pref('kama.hall.' + p.leader, false);
    const small = e.size <= 6;
    const draft = K.hallDraft[p.leader];
    const ticked = draft || names;
    const roleOf = {}; p.members.forEach(m => { roleOf[m.name] = m; });
    const boxes = p.members.map(m => {
      const on = ticked.includes(m.name), lead = m.name === p.leader;
      return `<label class="kp-hb${on ? ' on' : ''}${lead ? ' lead' : ''}"><input type="checkbox" data-kphb="${esc(p.leader)}|${esc(m.name)}"${on ? ' checked' : ''}${lead ? ' disabled' : ''}>${esc(m.name)} <b>${m.level ?? '?'}</b>${m.role ? ` <span class="r">${esc(m.role)}</span>` : ''}</label>`;
    }).join('');
    const n = ticked.length, dirty = !!draft && draft.join() !== names.join();
    const sum = small ? `Hall team: the whole party (${e.size} ≤ 6)`
      : `Hall team <span class="kp-hs ${h.src}">${esc(HALL_SRC[h.src] || h.src)}</span>: ${names.length ? esc(names.join(', ')) : '<span class="muted">none fits a Hall now</span>'}${h.src === 'auto' ? ' <span class="muted">(per Hall: leader, tank, healers, strongest dealers in its level window)</span>' : ''}`;
    return `<details class="kp-hall" data-hall="${esc(p.leader)}"${open ? ' open' : ''}><summary>${sum}</summary>
      <div class="kp-hbody">${small ? '<div class="muted">A party of 6 or fewer goes into a Hall together; the hall team is used when the party is bigger.</div>' : ''}
        <div class="kp-hbs">${boxes}</div>
        <div class="kp-hact"><span class="kp-hn${n > 6 || n < 2 ? ' bad' : ''}">${n}/6 ticked</span>
          <button type="button" data-kphsave="${esc(p.leader)}"${n > 6 || n < 2 || K.hallBusy ? ' disabled' : ''}>Save hall team</button>
          ${h.set ? `<button type="button" data-kphauto="${esc(p.leader)}"${K.hallBusy ? ' disabled' : ''} title="remove the saved team: the leader picks the best 6 for each Hall">Use automatic</button>` : ''}
          ${dirty ? `<button type="button" data-kphreset="${esc(p.leader)}">Undo ticks</button>` : ''}</div>
        <div class="muted kp-hnote">Saved to swarm.config.json (kamaloka.hallTeams); the leader reads it within 30 s — no deploy. The others wait in the captain's town and rejoin after the run.</div></div></details>`;
  }
  async function saveHall(leader, auto) {
    const p = partyOf(leader); if (!p || K.hallBusy) return;
    const names = auto ? null : (K.hallDraft[leader] || hallNow(p)).slice();
    if (!auto) names.sort((a, b) => (b === leader) - (a === leader));
    const dlg = auto ? { title: `Party ${leader}: remove the saved hall team?`, body: 'The leader then picks the best 6 for each Hall by itself (tank, healers, strongest dealers in its level window).', confirmText: 'Use automatic' }
      : { title: `Party ${leader}: save this hall team for Kamaloka Halls?`, body: [uiList(names), `When the party is bigger than 6, these go into a Hall; the other ${Math.max(0, p.eval.size - names.length)} wait in town and rejoin after.`], confirmText: 'Save hall team' };
    if (K.hallBusy) return;
    K.hallBusy = true;   // no second dialog / save while this one is open
    let okh = false; try { okh = await uiConfirm(dlg); } finally { K.hallBusy = false; }
    if (!okh) return;
    K.hallBusy = true;
    try {
      const r = await api('/api/kamahall', { method: 'POST', body: JSON.stringify({ leader, names, expect: p.hall ? p.hall.set : null }) });
      if (!r || r.error) uiAlert({ title: 'Not saved', kind: 'error', body: [(r && r.error) || 'no answer', r && /Not Found|404/.test(String(r.error)) ? uiNote('(The dashboard server needs a restart for this.)') : ''] });
      else delete K.hallDraft[leader];
    } catch (e) { uiAlert({ title: 'Not saved', kind: 'error', body: [e.message, uiNote('(If this says 404: the dashboard server needs a restart for hall teams.)')] }); }
    finally { K.hallBusy = false; }
    load(true);
  }

  // ------------------------------------------------------------------------- board
  function seg(id, cur, opts, attr) {
    patch($id(id), opts.map(([k, l, n]) => `<button type="button" data-${attr}="${k}" class="${cur === k ? 'on' : ''}">${l}${n != null ? `<span class="n">${n}</span>` : ''}</button>`).join(''));
  }
  function filtered(p) {
    const P0 = partyOf(p), q = P.q.trim().toLowerCase();
    return K.d.kamaloka.filter(k => {
      if (P.type !== 'all' && k.kind !== P.type) return false;
      if (P.fit === 'fits' && !(P0 && P0.eval.rows[k.id] && P0.eval.rows[k.id].ok)) return false;
      if (q && !`${k.name} ${short(k)} ${k.boss && k.boss.name} ${k.entry && k.entry.town} ${k.entry && k.entry.npc} ${k.lvl}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }
  function renderBoard() {
    const d = K.d, p = selParty(), P0 = partyOf(p);
    const fitsN = P0 ? d.kamaloka.filter(k => P0.eval.rows[k.id] && P0.eval.rows[k.id].ok).length : 0;
    seg('kpFitSeg', P.fit, [['all', 'all', d.kamaloka.length], ['fits', `fits ${esc(p)}`, fitsN]], 'kpfit');
    seg('kpTypeSeg', P.type, [['all', 'Hall + Labyrinth', null], ['hall', 'Hall · 6', d.kamaloka.filter(k => k.kind === 'hall').length], ['labyrinth', 'Labyrinth · 9', d.kamaloka.filter(k => k.kind === 'labyrinth').length]], 'kptype');
    const list = filtered(p);
    patch($id('kpCount'), `${list.length} of ${d.kamaloka.length}${list.length < d.kamaloka.length ? ' · <a data-kpall="1">show all</a>' : ''} · Run buttons for party <b style="color:${pcol(p)}">${esc(p)}</b>`);
    patch($id('kpBoard'), list.map((k, i) => card(k, i, p)).join('') || `<div class="kp-empty">No Kamaloka matches. <a data-kpall="1">Show all ${d.kamaloka.length}</a></div>`);
  }
  function runBtn(k, P0, long) {
    const r = P0 && P0.eval.rows[k.id];
    if (!r || !r.ok) return '';
    const force = r.today !== 'open';
    return `<button type="button" class="kp-run${force ? ' force' : ''}" data-kprun="${esc(P0.leader)}|${k.id}" title="${force ? 'used up today (' + esc(r.todayTxt) + '): they go anyway, the server may refuse' : 'send party ' + esc(P0.leader) + ' now'}">${force ? 'Force run' : 'Run'}${long ? ' · ' + esc(P0.leader) : ''}</button>`;
  }
  function card(k, i, p) {
    const d = K.d, L = liveObj(), P0 = partyOf(p);
    const liveRuns = runsAll().filter(r => r.running && r.id === k.id), live = liveRuns.length > 0;
    const nextFor = d.parties.filter(x => x.eval.next && x.eval.next.id === k.id);
    const cl = d.cleared[k.id];
    const badges = [];
    liveRuns.forEach(r => badges.push(`<a class="kp-b live" href="${liveHref(r.leader)}">LIVE${r.leader ? ' · ' + esc(r.leader) : ''}</a>`));
    nextFor.forEach(x => badges.push(`<span class="kp-b next" style="--pc:${pcol(x.leader)}" title="party ${esc(x.leader)}'s daily run picks this${x.eval.next.hall ? ' (hall team)' : ''}${x.enabled.kamaloka ? '' : ' — daily is OFF'}">next · ${esc(x.leader)}</span>`));
    if (cl) badges.push(`<span class="kp-b clr" title="kamaloka.log ${esc(when(cl.at))}">${clearedBy(cl)}</span>`);
    // chips: EVERY party (user: "for each party"): the ones it fits first (with today's state), the others dimmed with why not
    const chips = d.parties.map(x => ({ x, r: x.eval.rows[k.id] })).filter(o => o.r).sort((a, b) => (b.r.ok - a.r.ok)).map(({ x, r }) => {
      const td = !r.ok ? '' : r.today === 'open' ? (r.tries ? ` · ${r.left} left` : '') : ' · ' + r.todayTxt;
      return `<span class="kp-pf ${r.fit}${r.ok ? '' : ' no'}${r.ok && r.today !== 'open' ? ' used' : ''}${x.leader === p ? ' sel' : ''}" style="--pc:${pcol(x.leader)}" title="party ${esc(x.leader)}: ${esc(r.txt)}${r.sitOut ? ' · ' + r.sitOut + ' wait in town' : ''}${r.why ? ' · ' + esc(r.why) : ''}">${esc(x.leader)} · ${esc(r.fit === 'hall' ? r.txt : (FIT_TXT[r.fit] || r.fit))}${esc(td)}</span>`;
    });
    const r0 = P0 && P0.eval.rows[k.id];
    return `<article class="kp-card ${k.kind}${live ? ' livefight' : ''}${nextFor.some(x => x.leader === p) ? ' next' : ''}${r0 && r0.ok ? ' fit' : ''}" data-kpid="${k.id}" style="--i:${Math.min(i, 18)}">
      <div class="kp-ic"><img src="${ICON}" alt="" loading="lazy"><b class="lv">${k.lvl}</b></div>
      <div class="kp-main"><div class="kp-t"><a class="kp-name" href="#/kamaloka/${k.id}">${esc(short(k))}</a><span class="kp-b kind ${k.kind}">${k.kind === 'hall' ? 'max 6' : 'max 9'}</span>${badges.join('')}</div>
        <div class="kp-sub">lvl <b>${k.levelMin}–${k.levelMax}</b> · ${k.durationMin} min · ${esc(k.entry ? k.entry.town : '?')}, ${esc(k.entry ? k.entry.npc : '?')}</div>
        <div class="kp-boss">Boss <b>${esc(k.boss ? k.boss.name : '?')}</b> <span class="muted">lvl ${k.boss ? k.boss.level : '?'}</span>${k.learned ? ` <span class="muted">· our runs: ${k.learned.runs || 0}${k.learned.lastResult ? ' (' + esc(k.learned.lastResult) + ')' : ''}</span>` : ''}</div>
        <div class="kp-fit">${chips.join('')}</div></div>
      <div class="kp-go">${runBtn(k, P0)}<a class="kp-map" href="#/kamaloka/${k.id}" title="facts, every party and the instance map">Map</a></div></article>`;
  }

  // ------------------------------------------------------------------------- history / daily log / how
  function renderSecs() {
    const d = K.d;
    patch($id('kpSum_hist'), `${d.history.length} runs logged`);
    patch($id('kpSum_dlog'), `${d.daily.length} entries`);
    patch($id('kpSum_how'), `hall team: ${d.hallTeam.length ? d.hallTeam.length + ' characters' : 'not set'}`);
    const H = $id('kpSec_hist'), D = $id('kpSec_dlog'), W = $id('kpSec_how');
    if (H && secOpen('hist', false)) patch(H, d.history.length ? d.history.map(h => { const k = kOf(h.id);
      return `<div class="kp-lr"><span class="t">${esc(when(h.at))}</span><a href="#/kamaloka/${h.id}">${esc(k ? short(k) : h.id)}</a>${h.by ? `<span class="kp-pt" style="--pc:${pcol(h.by)}">${esc(h.by)}</span>` : ''}<span class="kp-r ${/clear/i.test(h.result) ? 'good' : /wipe|fail/i.test(h.result) ? 'bad' : ''}">${esc(h.result)}</span></div>`; }).join('') : '<div class="muted">no runs yet</div>');
    if (D && secOpen('dlog', false)) patch(D, d.daily.length ? d.daily.map(h => { const k = kOf(h.id);
      return `<div class="kp-lr"><span class="t">${esc(when(h.at))}</span>${h.leader ? `<span class="kp-pt" style="--pc:${pcol(h.leader)}">${esc(h.leader)}</span>` : '<span class="muted">?</span>'}<a href="#/kamaloka/${h.id}">${esc(k ? short(k) : h.id)}</a><span class="kp-r ${/^ok/.test(h.result) ? 'good' : /^fail/.test(h.result) ? 'bad' : ''}">${esc(h.result)}</span>${h.msg ? `<span class="muted m">${esc(h.msg)}</span>` : ''}</div>`; }).join('') : '<div class="muted">no entries</div>');
    if (W && secOpen('how', false)) patch(W, `<div class="kp-how">
      <p><b>Daily ON</b>: once a minute the party leader checks (only when the party is free) whether a Kamaloka is due. The day starts at <b>06:30</b>.</p>
      <ol><li>The <b>whole party</b> must be logged in and in the party.</li>
        <li>Not done today and fewer than <b>2 tries</b> today (a start counts as a try; a boss kill, "#2100 may not re-enter" or a 2nd "could not enter" marks it done).</li>
        <li>First choice: the <b>highest</b> Kamaloka the whole party fits (every level inside its window, party size up to 6 for a Hall, 9 for a Labyrinth).</li>
        <li>Only if none: the highest free <b>Hall</b> (max 6) for <b>this party's hall team</b> when the party has more than 6; the others wait in the captain's town and rejoin after.</li></ol>
      <p><b>Hall team per party</b>: 1) the team saved on this page (party row → Hall team), 2) else the old global list (${esc(d.hallSource)}: ${d.hallTeam.length ? d.hallTeam.map(n => esc(n)).join(', ') : 'none'}) — only for the party whose leader is in it, 3) else <b>automatic</b> for each Hall: the leader, one tank (the leader when he is one), up to 2 healers, then the strongest damage dealers (level, then role), all inside the Hall's level window.</p>
      <p><b>Run</b> sends <code>!mission kamaloka &lt;lvl&gt;</code> now (asks first) and ignores the daily list; <b>Force run</b> = it is used up today, the server may still refuse. On L2Toggle a Hall kill usually locks the other Kamalokas for the day too (#2100).</p></div>`);
  }

  // ------------------------------------------------------------------------- one Kamaloka
  function renderDetail() {
    const el = $id('kpDetail'); if (!el) return;
    const k = kOf(K.id), d = K.d;
    if (!k) { patch(el, `<div class="kp-empty">No Kamaloka "${esc(K.id)}". <a href="#/kamaloka">All Kamaloka</a></div>`); return; }
    const L = liveObj(), LR1 = liveRunOf(k.id), live = !!LR1, lay = k.layout || {}, l = k.learned, cl = d.cleared[k.id];
    const rows = d.parties.map(p => {
      const r = p.eval.rows[k.id], nx = p.eval.next && p.eval.next.id === k.id;
      return `<div class="kp-dr" style="--pc:${pcol(p.leader)}"><div class="p"><b>${esc(p.leader)}</b> <span class="muted">${p.eval.size} · ${p.eval.levels ? 'lvl ' + p.eval.levels.min + (p.eval.levels.max !== p.eval.levels.min ? '–' + p.eval.levels.max : '') : 'lvl ?'}</span>${nx ? ` <span class="kp-b next" style="--pc:${pcol(p.leader)}">next${p.enabled.kamaloka ? '' : ' (daily off)'}</span>` : ''}</div>
        <div class="f"><span class="kp-pf ${r.fit}">${esc(r.txt)}</span>${r.ok || r.today !== 'open' ? ' ' + `<span class="kp-tc ${r.today === 'open' ? (r.tries ? 'tried' : 'open') : r.today === 'cleared' ? 'cleared' : 'used'}" title="${esc(r.why)}">${esc(r.today === 'open' ? r.left + (r.left === 1 ? ' try' : ' tries') + ' left' : r.todayTxt)}</span>` : ''}</div>
        <div class="g">${runBtn(k, p, false)}</div></div>`;
    }).join('');
    const hist = d.history.filter(h => h.id === k.id).slice(0, 8).map(h => `<div class="kp-lr"><span class="t">${esc(when(h.at))}</span>${h.by ? `<span class="kp-pt" style="--pc:${pcol(h.by)}">${esc(h.by)}</span>` : ''}<span class="kp-r ${/clear/i.test(h.result) ? 'good' : /wipe|fail/i.test(h.result) ? 'bad' : ''}">${esc(h.result)}</span></div>`).join('');
    const rooms = (lay.rooms || []).map(r => `<div><b>${esc(r.label)}:</b> ${esc(r.note || '')}</div>`).join('');
    let map = '';
    try { map = kamaMap(k, null, 'overview'); } catch (e) { map = '<div class="muted">map: ' + esc(e.message) + '</div>'; }
    let legend = ''; try { legend = KM_LEGEND; } catch (e) { }
    patch(el, `<div class="kp-dhead"><div class="kp-ic big"><img src="${ICON}" alt=""><b class="lv">${k.lvl}</b></div>
        <div class="id"><h2>${esc(short(k))} ${live ? `<a class="kp-b live" href="${liveHref(LR1.leader)}">LIVE · ${esc(LR1.leader)}</a>` : ''}${cl ? `<span class="kp-b clr">${clearedBy(cl)}</span>` : ''}</h2>
        <div class="sub">${esc(k.name)}</div></div></div>
      <div class="kp-facts">
        <div><span>Levels</span><b>${k.levelMin}–${k.levelMax}</b></div><div><span>Party</span><b>${k.partyMin || 2}–${k.partyMax}</b> <span class="muted">${k.kind === 'hall' ? 'Hall' : 'Labyrinth'}</span></div>
        <div><span>Time</span><b>${k.durationMin} min</b></div><div><span>Entry</span><b>${esc(k.entry.npc)}</b> <span class="muted">${esc(k.entry.town)}</span></div>
        <div><span>Boss</span><b>${esc(k.boss.name)}</b> <span class="muted">lvl ${k.boss.level}</span></div>
        <div><span>Our runs</span><b>${l ? l.runs || 0 : 0}</b> <span class="muted">${l ? (l.last ? 'last ' + esc(when(l.last)) : '') + (l.lastResult ? ' · ' + esc(l.lastResult) : '') : 'none yet'}</span></div>
        ${k.rewards ? `<div class="w"><span>Rewards</span><span class="muted">${esc(k.rewards)}</span></div>` : ''}</div>
      <div class="box kp-box"><h3>Every party</h3><div class="kp-drs">${rows}</div></div>
      <div class="box kp-box"><h3>Map${live ? ` <a href="${liveHref(LR1.leader)}">· watch the live run ›</a>` : ''}</h3>
        <div class="kp-mapwrap">${map}</div>${legend}
        ${rooms ? `<div class="kp-rooms">${rooms}</div>` : ''}${lay.miniboss ? `<div class="kp-rooms"><b>Mini-boss:</b> ${esc(lay.miniboss.name)} — ${esc(lay.miniboss.note || '')}</div>` : ''}
        ${lay.kind === 'hall' && !l ? '<div class="muted kp-rooms">A Hall is one room; where its monsters stand is not in the datapack — they appear on the map after our first run.</div>' : ''}</div>
      ${hist ? `<div class="box kp-box"><h3>Our results here</h3>${hist}</div>` : ''}`);
  }

  // ------------------------------------------------------------------------- live
  function renderLive() {
    const el = $id('kpLive'); if (!el) return;
    const running = runsAll().filter(r => r.running);
    if (!K.id && running.length > 1) { patch(el, `<div class="kp-empty">${running.length} parties are in a Kamaloka right now — pick one:</div><div class="kp-pin">${running.map(pinCard).join('')}</div>`); return; }
    let html = '';
    try { html = kamaLiveHtml(); } catch (e) { html = ''; }
    const L = liveObj();
    if (!html) html = `<div class="kp-empty">No Kamaloka run right now.${K.d && K.d.history[0] ? ` Last: ${esc(short(kOf(K.d.history[0].id)))} ${esc(when(K.d.history[0].at))} — ${esc(K.d.history[0].result)}.` : ''} <a href="#/kamaloka">All Kamaloka</a></div>`;
    if (K.id && L && L.leader && L.leader !== K.id) html = `<div class="kp-empty">Party ${esc(K.id)} has no Kamaloka run right now. <a href="#/kamaloka">All Kamaloka</a></div>`;
    else if (L && L.leader) html = (running.length > 1 ? `<div class="kp-crumb2">Also live: ${running.filter(r => r.leader !== L.leader).map(r => `<a href="${liveHref(r.leader)}">party ${esc(r.leader)} · ${esc(short(kOf(r.id)))}</a>`).join(' · ')}</div>` : '') + `<div class="kp-crumb2"><a href="#/live/${encodeURIComponent(L.leader)}">Party view of ${esc(L.leader)} ›</a></div>` + html;
    patch(el, html);
  }

  // =========================================================================================== actions
  async function setDaily(leader, on) {
    const p = partyOf(leader); if (!p) return;
    if (!await uiConfirm({ title: `Daily Kamaloka ${on ? 'ON' : 'OFF'}`, body: [uiP('Daily Kamaloka for the ', uiEm(`WHOLE party ${leader}`), ` (${p.eval.size} characters) → `, uiEm(on ? 'ON' : 'OFF')),
      on ? `The leader takes the party into ${p.eval.next ? short(kOf(p.eval.next.id)) : 'the Kamaloka that fits'} by itself (once per day) when it is free.` : 'Stops future runs; a run already started is not aborted.'], confirmText: on ? 'Turn on' : 'Turn off' })) return;
    try {
      const r = await api('/api/daily', { method: 'POST', body: JSON.stringify({ leader, kind: 'kamaloka', on }) });
      if (r && r.error) uiAlert({ title: 'Not saved', kind: 'error', body: [r.error, /leader/.test(r.error) ? uiNote('(The dashboard server needs a restart for parties other than ' + (r.error.match(/\(([^)]*)\)/) || ['', ''])[1] + ')') : ''] });
    } catch (e) { uiError(e.message, 'Not saved'); }
    load(true);
  }
  async function run(leader, id) {
    const p = partyOf(leader), k = kOf(id); if (!p || !k) return;
    const r = p.eval.rows[id] || {};
    const cmd = '!mission kamaloka ' + k.lvl;
    const sit = r.sitOut ? ` Only the hall team (${(r.hallNames || []).join(', ')}) goes in: ${r.sitOut} wait in ${k.entry ? k.entry.town : 'town'} and rejoin after.` : '';
    const off = p.eval.offline.length ? ` Offline now: ${p.eval.offline.join(', ')}.` : '';
    const label = r.today !== 'open'
      ? `FORCE Kamaloka: ${k.name}. Today it shows "${r.todayTxt}"${r.why ? ' (' + r.why + ')' : ''}. They go anyway — the game server may still refuse at the captain.${sit}${off}`
      : `Kamaloka now: ${k.name}. They stop what they do, travel to ${k.entry.npc} (${k.entry.town}), enter and clear it.${sit}${off}`;
    let okd = false;
    // confirmOrder (index.html) is async since UIDIALOG 2026-10-10; without it (old page / error) the same question through the shared dialog
    try { okd = await confirmOrder('party:' + leader, cmd, label); }
    catch (e) { okd = await uiConfirm({ title: `Order for party ${leader}`, body: [uiP('Send to the ', uiEm(`WHOLE party ${leader}`), ':'), uiP(uiEm(label), '  ', uiCode(cmd))], confirmText: 'Send order' }); }
    if (okd) { try { send('party:' + leader, null, cmd); } catch (e) { uiError(e.message, 'Not sent'); } setTimeout(() => load(true), 4000); }
  }
  function onClick(e) {
    const t = e.target;
    const g = t.closest('[data-kpgo]'); if (g) { e.preventDefault(); e.stopPropagation(); location.hash = g.dataset.kpgo; return; }
    const rb = t.closest('[data-kprun]'); if (rb) { e.preventDefault(); e.stopPropagation(); const [l, id] = rb.dataset.kprun.split('|'); run(l, id); return; }
    const hs = t.closest('[data-kphsave]'); if (hs) { e.preventDefault(); saveHall(hs.dataset.kphsave, false); return; }
    const ha = t.closest('[data-kphauto]'); if (ha) { e.preventDefault(); saveHall(ha.dataset.kphauto, true); return; }
    const hr = t.closest('[data-kphreset]'); if (hr) { e.preventDefault(); delete K.hallDraft[hr.dataset.kphreset]; renderToday(); return; }
    const db = t.closest('[data-kpdaily]'); if (db) { e.preventDefault(); e.stopPropagation(); const [l, on] = db.dataset.kpdaily.split('|'); setDaily(l, on === '1'); return; }
    const f = t.closest('[data-kpfit]'); if (f) { P.fit = f.dataset.kpfit; setPref('kama.fit', P.fit); renderBoard(); return; }
    const ty = t.closest('[data-kptype]'); if (ty) { P.type = ty.dataset.kptype; setPref('kama.type', P.type); renderBoard(); return; }
    if (t.closest('[data-kpall]')) { P.fit = 'all'; P.type = 'all'; P.q = ''; setPref('kama.fit', 'all'); setPref('kama.type', 'all'); const q = $id('kpQ'); if (q) q.value = ''; renderBoard(); return; }
    const c = t.closest('.kp-card');
    if (c && !t.closest('a, button, select, input, summary')) { location.hash = '#/kamaloka/' + c.dataset.kpid; }
  }
  function onInput(e) {
    const t = e.target;
    if (t.id === 'kpQ') { P.q = t.value; renderBoard(); }
    if (t.dataset && t.dataset.kphb && e.type === 'change') {
      const [l, nm] = t.dataset.kphb.split('|'), p = partyOf(l); if (!p) return;
      const cur = (K.hallDraft[l] || hallNow(p)).filter(x => x !== nm);
      if (t.checked) cur.push(nm);
      if (!cur.includes(l)) cur.unshift(l);
      K.hallDraft[l] = p.members.map(m => m.name).filter(x => cur.includes(x));
      renderToday();
    }
    if (t.id === 'kpParty' && e.type === 'change') { P.party = t.value; setPref('kama.party', P.party); renderBoard(); }
  }
  function onToggle(e) {
    const d = e.target; if (!d || d.tagName !== 'DETAILS') return;
    if (d.dataset.mem) { setPref('kama.mem.' + d.dataset.mem, d.open); return; }
    if (d.dataset.hall) { setPref('kama.hall.' + d.dataset.hall, d.open); return; }
    if (d.dataset.sec) { setPref('kama.open.' + d.dataset.sec, d.open); if (K.d) { if (d.dataset.sec === 'today') renderToday(); else renderSecs(); } }
  }

  window.KamaPage = { route, open, close, _k: K, _p: P, version: '2026-10-09b' };
})();
