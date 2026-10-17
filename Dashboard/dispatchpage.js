// DISPATCH page #/dispatch (DISPATCH-2026-10-17; owner: "dispatch a party or a solo person to a point in game ... Baium, Valakas teleport,
// Antharas, Core, Sailren ... go to X, go to Y, go to Z, so we can verify that all the routes are working ... auto learn the path").
// 1) Who: a party (its leader takes it) or one character (optional: sneak = Silent Move near monsters, no fighting)  2) Where: epic quick
// buttons, search over every nav atlas place (raid bosses, epics, NPCs, hunting areas, rooms, dungeons) or a map point; each shows the computed
// route's status and our last dispatch there  3) the tour (several stops, in order)  4) Go -> live, stop by stop (swarm.js DISPATCH: computed
// route, else another way that is recorded and saved as the learned route). Data: /api/dispatch/* (Dashboard/dispatch_api.js).
// Uses index.html globals: api, classIcon, stopChar, TAB; uidialog: uiConfirm, uiP, uiNote, uiError; UIKit.toast.
(function () {
  'use strict';
  const SEC = 'tab-dispatch';
  const S = { open: false, who: null, mode: 'party', sneak: false, enter: false, goOn: false, q: '', type: 'all', res: null, quick: null, stops: [], job: null, poll: 0, recent: null, msgT: 0, px: '', py: '', pz: '' };
  const $id = (i) => document.getElementById(i);
  const h = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ico = (p) => typeof iconUrl === 'function' ? iconUrl(p) : '/icons/' + p + '.png';
  const gim = (p, c) => `<img class="gim${c ? ' ' + c : ''}" src="${ico(p)}" alt="">`;   // in-game icons only (owner 2026-10-17)
  const TI = { raid: 'icon/accessory_raid_master_i00', epic: 'icon/accessory_ring_of_baium_i00', npc: 'L2UI_CT1/crop/Icon_DF_MenuWnd_Character', area: 'L2UI_CT1/crop/Icon_DF_MenuWnd_Map', room: 'L2UI_CT1/crop/Icon_DF_MenuWnd_Quest', dungeon: 'L2UI_CT1/ICON_DF_SIEGE_SHIELD', point: 'icon/etc_map_yellow_i00' };
  const EPIC_ICON = [[/Baium/, 'icon/accessory_ring_of_baium_i00'], [/Valakas|Klein/, 'icon/accessory_necklace_of_valakas_i00'], [/Core/, 'icon/accessory_ring_of_core_i00'], [/Queen Ant/, 'icon/accessory_ring_of_queen_ant_i00'], [/Orfen/, 'icon/accessory_earring_of_orfen_i00'], [/Zaken/, 'icon/accessory_earring_of_zaken_i00'], [/Frintezza/, 'icon/accessory_necklace_of_frintessa_i00']];
  const iconOf = (t) => { const e = EPIC_ICON.find(([re]) => re.test(String(t.label || t.name))); return gim(e ? e[1] : (TI[t.type] || TI.point), 'big'); };   // each epic its own jewel
  const TYPES = [['all', 'Everything'], ['raid', 'Raid bosses'], ['epic', 'Epics'], ['npc', 'NPCs'], ['area', 'Hunting areas'], ['room', 'Rooms'], ['dungeon', 'Dungeons']];
  const TICON = new Proxy({}, { get: (o, k) => gim(TI[k] || TI.point, 'big') });
  const ST = { ok: ['✓', 'route ok', '#3fa35a'], conditional: ['!', 'route with a condition', '#c9a23a'], unverified: ['?', 'route not checked yet', '#8a8a8a'], blocked: ['✗', 'route blocked', '#c0503f'], unreachable: ['✗', 'no route', '#c0503f'] };
  const km = (n) => !(n > 0) ? '' : n >= 1000 ? (n / 1000).toFixed(1) + ' k' : Math.round(n) + '';
  const mins = (s) => !(s > 0) ? '' : s >= 60 ? Math.round(s / 60) + ' min' : s + ' s';

  async function loadWho() { try { const d = await api('/api/dispatch/who'); if (d && !d.error) S.whoData = d; } catch (e) { } render(); }
  async function loadQuick() { try { const d = await api('/api/dispatch/targets?quick=1'); if (d && !d.error) S.quick = d.targets; } catch (e) { } render(); }
  async function loadRecent() { try { const d = await api('/api/dispatch/recent'); if (d && !d.error) S.recent = d.jobs; } catch (e) { } render(); }
  let searchT = 0;
  let searchSeq = 0;
  function search() { clearTimeout(searchT); const my = ++searchSeq; searchT = setTimeout(async () => { try { const d = await api(`/api/dispatch/targets?q=${encodeURIComponent(S.q)}&type=${S.type}&n=80`); if (my !== searchSeq) return; if (d && !d.error) S.res = d; } catch (e) { } renderList(); }, 250); }   // a late answer to an older search never replaces the newer one

  function section() {
    let s = $id(SEC); if (s) return s;
    s = document.createElement('section'); s.id = SEC; s.className = 'win itp'; s.hidden = true;
    s.innerHTML = `<div class="itp-head"><h2><img class="gi" src="${ico('L2UI_CT1/crop/Icon_DF_MenuWnd_Map')}" alt=""> Dispatch</h2></div><div class="itp-msg" id="dspMsg" role="status" hidden></div>
      <div id="dspWho"></div><div id="dspWhere"></div><div id="dspList"></div><div id="dspTour"></div><div id="dspJob"></div><div id="dspRecent"></div>`;
    (document.querySelector('main') || document.body).appendChild(s);
    s.addEventListener('click', onClick); s.addEventListener('input', onInput); s.addEventListener('change', onInput);
    return s;
  }
  function route(kind) { if (kind === 'dispatch') { open(); return true; } close(); return false; }
  function open() {
    const s = section();
    try { stopChar(); } catch (e) { }
    try { TAB = 'dispatch'; [...$id('tabs').children].forEach(b => b.classList.toggle('on', b.dataset.tab === 'dispatch')); } catch (e) { }
    document.querySelectorAll('main > section').forEach(x => { if (x.id !== SEC) x.hidden = true; });
    s.hidden = false; S.open = true;
    render(); loadWho(); loadQuick(); loadRecent(); search();
    setTimeout(() => { try { if (s.getBoundingClientRect().top > 40) s.scrollIntoView({ block: 'start' }); } catch (e) { } }, 300);
  }
  function close() { if (!S.open) return; S.open = false; clearInterval(S.poll); const s = $id(SEC); if (s) s.hidden = true; }
  function flash(t, bad) { const m = $id('dspMsg'); if (!m) return; m.hidden = !t; m.className = 'itp-msg' + (bad ? ' bad' : ''); m.textContent = t || ''; clearTimeout(S.msgT); S.msgT = setTimeout(() => { const x = $id('dspMsg'); if (x) x.hidden = true; }, bad ? 15000 : 7000); }
  const stChip = (t) => { const s = ST[t.status] || ['', t.status || '', '#777']; return `<span class="dsp-st" style="background:${s[2]}" title="${h(s[1])}">${s[0]} ${h(s[1])}</span>`; };
  const lastChip = (t) => t.last ? `<span class="dsp-last ${t.last.ok ? 'ok' : 'bad'}" title="${h(t.last.how || t.last.why || '')}">${t.last.ok ? '✓ we got there' : '✗ we did not get there'} ${h(new Date(t.last.at).toLocaleDateString())}${t.last.learned ? ' · learned' : ''}</span>` : '';

  function render() {
    if (!S.open) return; section();
    const W = S.whoData;
    // 1. who
    let who = `<div class="itp-step"><span class="itp-num">1</span> Who goes? ${S.who ? `<b>${h(S.who.char ? S.who.char : 'party ' + S.who.party)}</b>` : ''}</div>
      <div class="itp-filters"><button type="button" class="itp-chip${S.mode === 'party' ? ' on' : ''}" data-dspmode="party">${gim('L2UI_CT1/crop/Icon_DF_MenuWnd_Clan')} A party</button><button type="button" class="itp-chip${S.mode === 'char' ? ' on' : ''}" data-dspmode="char">${gim('L2UI_CT1/crop/Icon_DF_MenuWnd_Character')} One character</button></div>`;
    if (!W) who += '<div class="muted">Loading…</div>';
    else if (S.mode === 'party') who += `<div class="itp-chars">${W.parties.filter(p => p.members.length > 1).map(p => `<button type="button" class="itp-char${S.who && S.who.party === p.leader ? ' on' : ''}" data-dspparty="${h(p.leader)}"><span class="dsp-icons">${p.members.slice(0, 9).map(m => typeof classIcon === 'function' ? classIcon({ name: m.name, classId: m.classId, cls: m.cls }) : '').join('')}</span><b>party ${h(p.leader)}</b><span>${p.members.length} characters${p.members[0] && p.members[0].level ? ' · lvl ' + h(p.members[0].level) : ''}</span></button>`).join('')}</div>`;
    else who += `<input type="search" class="itp-search" id="dspCq" placeholder="Search a character…" value="${h(S.cq || '')}"><div class="itp-chars">${W.chars.filter(c => !S.cq || c.name.toLowerCase().includes(S.cq.toLowerCase())).map(c => `<button type="button" class="itp-char${S.who && S.who.char === c.name ? ' on' : ''}" data-dspchar="${h(c.name)}">${typeof classIcon === 'function' ? classIcon({ name: c.name, classId: c.classId, cls: c.cls }) : ''}<b>${h(c.name)}</b><span>${c.level ? 'lvl ' + h(c.level) : ''}${c.party && c.party !== c.name ? ' · party ' + h(c.party) : ''}${c.online ? '' : ' · offline'}</span></button>`).join('')}</div>
      <label class="itp-check"><input type="checkbox" data-dspsneak="1"${S.sneak ? ' checked' : ''}> ${gim('icon/skill0221')} Sneak: Silent Move near monsters, no fighting, back to town below 40 % HP</label>`;
    $id('dspWho').innerHTML = who;
    // 2. where
    $id('dspWhere').innerHTML = `<div class="itp-step"><span class="itp-num">2</span> Where to? <span class="muted" style="font-weight:400">tap a place to add it as a stop</span></div>
      ${S.quick ? `<div class="dsp-quick">${S.quick.map(t => `<button type="button" class="dsp-q" data-dspadd="${h(t.key)}"><span class="dsp-qi">${iconOf(t)}</span><b>${h(t.label)}</b>${stChip(t)}${lastChip(t)}</button>`).join('')}</div>` : ''}
      <div class="itp-filters">${TYPES.map(([k, t]) => `<button type="button" class="itp-chip${S.type === k ? ' on' : ''}" data-dsptype="${k}">${TI[k] ? gim(TI[k]) + ' ' : ''}${t}</button>`).join('')}</div>
      <input type="search" class="itp-search" id="dspQ" placeholder="Search a place, boss or NPC…" value="${h(S.q)}">
      <details class="dsp-point"><summary>${gim('icon/etc_map_yellow_i00')} A point on the map (x, y)</summary><div class="itp-filters"><input id="dspPx" type="number" placeholder="x" value="${h(S.px)}" style="width:110px"><input id="dspPy" type="number" placeholder="y" value="${h(S.py)}" style="width:110px"><input id="dspPz" type="number" placeholder="z (optional)" value="${h(S.pz)}" style="width:110px"><button type="button" class="itp-btn2" data-dsppoint="1">Add</button></div></details>`;
    renderList(); renderTour(); renderJob();
    $id('dspRecent').innerHTML = S.recent && S.recent.length ? `<div class="itp-step">Recent tours</div>${S.recent.map(j => { const st = j.status || {}; return `<div class="itp-job ${st.state || ''}"><b>${h(j.who.char || 'party ' + j.who.party)}</b> <span class="muted">${h(new Date(j.created).toLocaleString())}</span><div>${h(j.stops.join(' → '))}</div><div>${h(st.state === 'done' ? '✓ ' + (st.result || '') : st.state === 'failed' ? '✗ ' + (st.result || '') : st.step ? '… ' + st.step : 'waiting to start')}</div></div>`; }).join('')}` : '';
  }
  function renderList() {
    const el = $id('dspList'); if (!el) return;
    const R = S.res; if (!R) { el.innerHTML = '<div class="muted">Loading…</div>'; return; }
    el.innerHTML = `<div class="muted">${R.total} place(s)${R.total > R.targets.length ? ', showing ' + R.targets.length + ' — search to narrow' : ''} ${R.targets.length > 1 ? `<button type="button" class="itp-btn2" data-dspaddall="1">Add all shown (max 40) — to check the routes</button>` : ''}</div>
      <div class="dsp-list">${R.targets.map(t => `<div class="dsp-row"><span class="dsp-qi">${iconOf(t)}</span><div class="dsp-main"><b>${h(t.name)}</b><div>${stChip(t)} ${lastChip(t)} <span class="muted">${km(t.length)}${t.sec ? ' · about ' + mins(t.sec) : ''}</span></div></div><button type="button" class="dsp-add" data-dspadd="${h(t.key)}" aria-label="Add ${h(t.name)}">Add</button></div>`).join('') || '<div class="muted">Nothing found.</div>'}</div>`;
  }
  function renderTour() {
    const el = $id('dspTour'); if (!el) return;
    el.innerHTML = `<div class="itp-step"><span class="itp-num">3</span> The tour ${S.stops.length ? `(${S.stops.length} stop${S.stops.length > 1 ? 's' : ''})` : ''}</div>
      ${S.stops.length ? `<ol class="dsp-tour">${S.stops.map((t, i) => `<li><span class="dsp-qi">${iconOf(t)}</span><b>${h(t.label || t.name)}</b>${t.status ? stChip(t) : ''}<span class="cpf-mv"><button type="button" data-dspmv="${i}|-1" ${i ? '' : 'disabled'} aria-label="Up">▲</button><button type="button" data-dspmv="${i}|1" aria-label="Down">▼</button><button type="button" data-dspdel="${i}" aria-label="Remove">✕</button></span></li>`).join('')}</ol>
        <label class="itp-check"><input type="checkbox" data-dspgoon="1"${S.goOn ? ' checked' : ''}> Keep going to the next stop when one fails</label>
        <label class="itp-check"><input type="checkbox" data-dspenter="1"${S.enter ? ' checked' : ''}> Go into an epic boss zone when the entry item is in the bag (else it stops at the door)</label>` : '<div class="muted">No stops yet — add one above.</div>'}
      <div class="itp-actions"><button type="button" class="itp-go" data-dspgo="1" ${S.who && S.stops.length && !(S.job && !(S.job.status && /done|failed/.test(S.job.status.state))) ? '' : 'disabled'}>${gim('icon/etc_scroll_of_return_i00')} Go</button></div>`;
  }
  function renderJob() {
    const el = $id('dspJob'); if (!el) return; const J = S.job;
    if (!J) { el.innerHTML = ''; return; }
    const st = J.status || {};
    el.innerHTML = `<div class="itp-jobbox ${st.state || ''}"><b>${st.state === 'done' ? '✓ Arrived' : st.state === 'failed' ? '✗ Stopped' : 'On the way…'}</b>${st.result ? ' — ' + h(st.result) : ''}
      ${(st.stops || []).length ? `<div class="dsp-res">${st.stops.map(s => `<div class="${s.ok ? 'itp-need ok' : 'itp-need miss'}">${s.ok ? '✓' : '✗'} <b>${h(s.name)}</b> ${h(s.ok ? s.how : s.why)}${s.learned ? ` <span class="dsp-learn">${gim('L2UI_CT1/crop/Icon_DF_MenuWnd_Map')} ${h(s.learned)}</span>` : ''} <span class="muted">${mins(s.sec)}</span></div>`).join('')}</div>` : ''}
      <ol>${(st.steps || []).slice(-12).map(s => `<li>${h(new Date(s.t).toLocaleTimeString())} ${h(s.msg)}</li>`).join('') || '<li>waiting to start…</li>'}</ol></div>`;
  }
  async function go() {
    const W = S.who; if (!W || !S.stops.length) return;
    const wname = W.char ? W.char : 'party ' + W.party;
    const ok = await uiConfirm({ title: `Dispatch ${wname}?`, body: [uiP(S.stops.map((t, i) => `${i + 1}. ${t.label || t.name}`).join('\n')),
      uiNote(`${W.char ? 'It' : 'The party'} stops what it does, travels stop by stop and waits at the last one. A route that fails is solved another way and the way that worked is saved.${W.char && S.whoData && (S.whoData.chars.find(c => c.name === W.char) || {}).party !== W.char ? ' A party member sent alone is benched (its party carries on without it; switch it on again on its character page).' : ''}`)], confirmText: 'Go' });
    if (!ok) return;
    let r = null; try { r = await api('/api/dispatch', { method: 'POST', body: JSON.stringify({ who: W, stops: S.stops.map(t => t.key), sneak: S.sneak, enter: S.enter, goOn: S.goOn }) }); } catch (e) { r = { error: e.message }; }
    if (!r || r.error) { uiError((r && r.error) || 'not sent', 'Not sent'); return; }
    S.job = { id: r.id, status: null }; renderJob(); renderTour();
    if (window.UIKit) UIKit.toast(`${wname}: on the way${r.benched ? ' (benched from its party)' : ''}`, { kind: 'ok' });
    clearInterval(S.poll);
    S.poll = setInterval(async () => {
      if (!S.open || !S.job) { clearInterval(S.poll); return; }
      try { const d = await api('/api/dispatch/job?id=' + encodeURIComponent(S.job.id)); if (d && !d.error) { S.job.status = d.status; renderJob(); if (d.status && /done|failed/.test(d.status.state)) { clearInterval(S.poll); renderTour(); loadRecent(); search(); loadQuick(); } } } catch (e) { }
    }, 3000);
  }
  function addKey(key) {
    if (S.stops.length >= 40) { flash('At most 40 stops in one tour.', true); return; }
    const t = (S.res && S.res.targets.find(x => x.key === key)) || (S.quick || []).find(x => x.key === key);
    if (!t) return; S.stops.push(Object.assign({}, t)); renderTour(); flash(`Added: ${t.label || t.name}`);
  }
  function onClick(e) {
    const t = e.target, g = (s) => t.closest(s); let b;
    if ((b = g('[data-dspmode]'))) { S.mode = b.dataset.dspmode; S.who = null; render(); return; }
    if ((b = g('[data-dspparty]'))) { S.who = { party: b.dataset.dspparty }; render(); return; }
    if ((b = g('[data-dspchar]'))) { S.who = { char: b.dataset.dspchar }; render(); return; }
    if ((b = g('[data-dsptype]'))) { S.type = b.dataset.dsptype; render(); search(); return; }
    if ((b = g('[data-dspadd]'))) { addKey(b.dataset.dspadd); return; }
    if (g('[data-dspaddall]')) { (S.res ? S.res.targets : []).slice(0, 40 - S.stops.length).forEach(x => S.stops.push(Object.assign({}, x))); renderTour(); return; }
    if (g('[data-dsppoint]')) { const x = Math.round(Number(S.px)), y = Math.round(Number(S.py)), z = S.pz === '' ? null : Math.round(Number(S.pz)); if (!isFinite(x) || !isFinite(y) || (!x && !y)) { flash('Type x and y.', true); return; } S.stops.push({ key: `xy:${x},${y}${z != null && isFinite(z) ? ',' + z : ''}`, type: 'point', name: `point ${x}, ${y}` }); renderTour(); return; }
    if ((b = g('[data-dspmv]'))) { const [i, d] = b.dataset.dspmv.split('|').map(Number), j = i + d; if (j < 0 || j >= S.stops.length) return; [S.stops[i], S.stops[j]] = [S.stops[j], S.stops[i]]; renderTour(); return; }
    if ((b = g('[data-dspdel]'))) { S.stops.splice(Number(b.dataset.dspdel), 1); renderTour(); return; }
    if (g('[data-dspgo]')) { go(); return; }
  }
  function onInput(e) {
    const t = e.target;
    if (t.id === 'dspQ') { S.q = t.value; search(); return; }
    if (t.id === 'dspCq') { S.cq = t.value; const pos = t.selectionStart; render(); const x = $id('dspCq'); if (x) { x.focus(); try { x.setSelectionRange(pos, pos); } catch (er) { } } return; }
    if (t.id === 'dspPx') S.px = t.value; if (t.id === 'dspPy') S.py = t.value; if (t.id === 'dspPz') S.pz = t.value;
    if (t.dataset.dspsneak) S.sneak = t.checked; if (t.dataset.dspgoon) S.goOn = t.checked; if (t.dataset.dspenter) S.enter = t.checked;
  }
  window.DispatchPage = { route, open, close, _state: S };
})();
