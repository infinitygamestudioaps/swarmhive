// RUNNER PAGE #/runner (RUNNERPAGE-2026-11-03, owner: "I want a page dedicated to the runner, where you can see the parties that are calling for
// him, what they have of loot for him, what is next in the line and make sure the state is kept EVEN after restart or redeployment").
// Shows: the runner (on / off, live state, where it is), the trip now (party, step, what it carries), the CALL queue (party, why, waiting since,
// Skip / Move up), the ROTATION line (next parties in order with the last visit, skipped + why), per party what it has FOR the runner (per member:
// kinds the take rules would take, bag %), the last trips + what the bank did with each delivery. Buttons: Call to <party> (the existing
// '!callrunner <leader>' order, confirmOrder), Skip / Move up (POST /api/runner), Runner on / off + rotation (POST /api/crafterpage settings).
// Data: GET /api/runner (Dashboard/runner_api.js) - all state comes from Logs/runner_*.json, so a restart / deploy shows the same queue and trips.
(function () {
  'use strict';
  const SEC = 'tab-runner';
  const S = { open: false, d: null, timer: 0, msgT: 0, err: '' };
  const $id = (i) => document.getElementById(i);
  const h = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n) => Number(n || 0).toLocaleString('en-US');
  const hm = (iso) => { if (!iso) return ''; const d = new Date(iso); return isNaN(d) ? '' : d.toTimeString().slice(0, 5); };
  const ago = (iso) => { if (!iso) return ''; const m = Math.round((Date.now() - Date.parse(iso)) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.floor(m / 60)} h ${m % 60} min ago`; };
  const CSS = `#tab-runner .rnp-top{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center;margin:4px 0 10px}
#tab-runner .rnp-pill{padding:2px 8px;border-radius:10px;background:rgba(255,255,255,.07)}
#tab-runner .rnp-pill.ok{color:#9fd59a}#tab-runner .rnp-pill.bad{color:#f0a37a}
#tab-runner h3{margin:14px 0 6px}
#tab-runner .rnp-box{border:1px solid rgba(255,255,255,.12);border-radius:6px;padding:8px;background:rgba(0,0,0,.18);margin-bottom:8px;min-width:0}
#tab-runner .rnp-row{display:flex;flex-wrap:wrap;gap:4px 12px;align-items:center;font-size:13px;margin:3px 0}
#tab-runner .rnp-row button{min-height:32px}
#tab-runner .rnp-steps{display:flex;flex-wrap:wrap;gap:4px;margin:6px 0}
#tab-runner .rnp-step{padding:2px 8px;border-radius:10px;background:rgba(255,255,255,.06);font-size:12px}
#tab-runner .rnp-step.on{background:#5b4a1e;color:#ffe9a8}
#tab-runner .rnp-scroll{overflow-x:auto;max-width:100%}
#tab-runner table{border-collapse:collapse;font-size:13px;width:100%}
#tab-runner td,#tab-runner th{padding:4px 6px;border-bottom:1px solid rgba(255,255,255,.08);text-align:left;vertical-align:top}
#tab-runner .muted{opacity:.7}
#tab-runner .rnp-bar{display:inline-block;width:60px;height:6px;background:rgba(255,255,255,.1);border-radius:3px;vertical-align:middle;overflow:hidden}
#tab-runner .rnp-bar i{display:block;height:100%;background:#c9a45a}
#tab-runner .rnp-msg{margin:6px 0;padding:6px;border-radius:4px;background:rgba(120,200,120,.15)}#tab-runner .rnp-msg.bad{background:rgba(230,120,90,.2)}
@media (max-width:600px){#tab-runner td,#tab-runner th{padding:3px 4px;font-size:12px}}`;
  function section() {
    let s = $id(SEC); if (s) return s;
    if (!$id('rnp-css')) { const st = document.createElement('style'); st.id = 'rnp-css'; st.textContent = CSS; document.head.appendChild(st); }
    s = document.createElement('section'); s.id = SEC; s.hidden = true;
    (document.querySelector('main') || document.body).appendChild(s);
    s.addEventListener('click', onClick);
    return s;
  }
  function route(kind) { if (kind === 'runner') { open(); return true; } close(); return false; }
  function open() {
    const s = section();
    try { stopChar(); } catch (e) { }
    try { TAB = 'runner'; [...$id('tabs').children].forEach(b => b.classList.toggle('on', b.dataset.tab === 'runner')); } catch (e) { }
    document.querySelectorAll('main > section').forEach(x => { if (x.id !== SEC) x.hidden = true; });
    s.hidden = false; S.open = true; render(); load();
    clearInterval(S.timer); S.timer = setInterval(() => { if (S.open && !document.hidden) load(); }, 10000);
  }
  function close() { if (!S.open) return; S.open = false; clearInterval(S.timer); const s = $id(SEC); if (s) s.hidden = true; }
  async function load() { try { const d = await api('/api/runner'); if (d && !d.error) { S.d = d; S.err = ''; } else S.err = (d && d.error) || 'no answer'; } catch (e) { S.err = e.message; } if (S.open) render(); }
  function flash(t, bad) { const m = $id('rnpMsg'); if (!m) return; m.hidden = !t; m.className = 'rnp-msg' + (bad ? ' bad' : ''); m.textContent = t || ''; clearTimeout(S.msgT); S.msgT = setTimeout(() => { m.hidden = true; }, 6000); }
  const bar = (p) => `<span class="rnp-bar" title="bag ${Number(p) || 0} %"><i style="width:${Math.max(0, Math.min(100, Number(p) || 0))}%"></i></span> ${Number(p) || 0} %`;
  const STEPS = ['stocking up', 'out', 'handing over', 'back', 'done'];
  function render() {
    const s = section(), d = S.d;
    if (!d) { s.innerHTML = `<h2>Runner</h2><div class="muted">${S.err ? 'Could not load: ' + h(S.err) : 'Loading…'}</div>`; return; }
    const R = d.runner, T = d.trip, Q = d.queue || [], L = d.rotation || { next: [], skipped: [] };
    const top = `<div class="rnp-top"><b>${h(R.name || 'no runner set')}</b>
      <span class="rnp-pill ${R.on && R.name ? 'ok' : 'bad'}">${R.on && R.name ? 'ON' : 'OFF'}</span>
      <span class="rnp-pill ${R.fresh ? 'ok' : 'bad'}">${R.fresh ? 'online' : 'not seen ' + h(ago(R.seen))}</span>
      <span>${R.town ? 'in ' + h(R.town) : 'in the field'}${R.x != null ? ' <span class="muted">(' + fmt(R.x) + ', ' + fmt(R.y) + ')</span>' : ''}</span>
      <span class="muted">bank: ${h(R.bank || '?')}</span>
      ${R.name ? `<button type="button" data-rnpon="${R.on ? '0' : '1'}">${R.on ? 'Switch the runner OFF' : 'Switch the runner ON'}</button>
      <button type="button" data-rnprot="${R.rotateOn ? '0' : '1'}">${R.rotateOn ? 'Rotation OFF' : 'Rotation ON'}</button>
      <button type="button" data-rnpst="${R.stealth !== false ? '0' : '1'}" title="ON: walks in everywhere with Silent Move, no level limit">${R.stealth !== false ? 'Stealth: ON' : 'Stealth: OFF'}</button>` : ''}</div>
      <div class="rnp-row"><span>Now: <b>${h(R.state || '-')}</b></span></div>
      <div class="rnp-msg" id="rnpMsg" hidden></div>`;
    const trip = `<h3>The trip now</h3><div class="rnp-box">${T ? `<div class="rnp-row"><b>${h(T.party)}</b>${T.rotate ? '<span class="rnp-pill">rotation</span>' : '<span class="rnp-pill">call</span>'}<span class="muted">since ${h(hm(T.startedAt))}</span></div>
      <div class="rnp-steps">${STEPS.map(x => `<span class="rnp-step${x === T.step ? ' on' : ''}">${h(x)}</span>`).join('')}</div>
      <div class="muted">${h(T.text || '')}</div>` : '<div class="muted">No trip right now.</div>'}</div>`;
    const qh = `<h3>Calls waiting (${Q.length})</h3><div class="rnp-box">${Q.length ? `<div class="rnp-scroll"><table><tr><th>#</th><th>Party</th><th>Why</th><th>Waiting since</th><th></th></tr>
      ${Q.map((c, i) => `<tr><td>${i + 1}</td><td>${h(c.party)}</td><td>${h(c.why || (c.out ? 'out of shots' : 'bag / low supplies'))}</td><td>${h(hm(c.at))} <span class="muted">(${h(ago(c.at))})</span></td>
        <td>${i ? `<button type="button" data-rnpup="${h(c.party)}">Move up</button> ` : ''}<button type="button" data-rnpskip="${h(c.party)}">Skip</button></td></tr>`).join('')}</table></div>` : '<div class="muted">No party is calling the runner. With rotation ON it visits the farming parties by itself.</div>'}</div>`;
    const rot = `<h3>Rotation ${R.rotateOn ? `<span class="muted" style="font-weight:normal">(no call waiting: each party at most every ${h(R.rotateMin)} min)</span>` : '<span class="muted" style="font-weight:normal">(OFF)</span>'}</h3><div class="rnp-box">
      ${L.next.length ? `<div class="rnp-scroll"><table><tr><th>Next</th><th>Party</th><th>For the runner</th><th>Last visit</th></tr>${L.next.map((r, i) => `<tr><td>${i + 1}</td><td>${h(r.party)}${r.raid ? `<div class="rnp-raid" style="font-size:11px;opacity:.75">${h(r.raid)}</div>` : ''}</td><td>${fmt(r.kinds)} kinds · ${bar(r.bagPct)}</td><td>${r.lastMin == null ? 'never' : h(r.lastMin) + ' min ago'}${r.dueInMin ? ' <span class="muted">· due in ' + h(r.dueInMin) + ' min</span>' : ' <b>· due</b>'}</td></tr>`).join('')}</table></div>` : '<div class="muted">No party is due for a visit.</div>'}
      ${L.skipped.length ? `<details><summary class="muted">Skipped (${L.skipped.length})</summary>${L.skipped.map(x => `<div class="rnp-row"><b>${h(x.party)}</b><span class="muted">${h(x.why)}</span></div>`).join('')}</details>` : ''}</div>`;
    const P = d.parties || [];
    const par = `<h3>What the parties have for the runner</h3><div class="rnp-box"><div class="rnp-scroll"><table><tr><th>Party</th><th>Members (kinds to take · bag)</th><th></th></tr>
      ${P.map(p => `<tr><td><b>${h(p.party)}</b><div class="muted">${p.on ? (p.hunting ? 'hunting' : 'not hunting') : 'switched off'}${p.lastVisit ? ' · visited ' + h(ago(p.lastVisit)) : ''}</div></td>
        <td>${p.members.map(m => `<div>${h(m.name)}${m.online ? '' : ' <span class="muted">(offline)</span>'}: ${fmt(m.kinds)} kinds · ${bar(m.bagPct)}</div>`).join('')}</td>
        <td>${R.name && R.on ? `<button type="button" data-rnpcall="${h(p.party)}">Call to ${h(p.party)}</button>` : ''}</td></tr>`).join('')}</table></div></div>`;
    const B = d.bank || [];
    const bankOf = (t) => B.filter(b => b.party === t.party && Date.parse(b.at) >= Date.parse(t.at) - 60000 && Date.parse(b.at) <= Date.parse(t.at) + 30 * 60000);
    const tr = `<h3>Last trips</h3><div class="rnp-box">${(d.trips || []).length ? `<div class="rnp-scroll"><table><tr><th>When</th><th>Party</th><th>To the bank</th><th>The bank</th></tr>${d.trips.map(t => `<tr><td>${h(hm(t.at))}<div class="muted">${t.rotate ? 'rotation' : 'call'}</div></td><td>${h(t.party)}</td>
      <td>${fmt(t.kinds)} kinds${t.adena ? ' + ' + fmt(t.adena) + ' a' : ''}${t.shots ? ' · ' + fmt(t.shots) + ' shot hand-overs' : ''}${(t.items || []).length ? `<div class="muted">${t.items.slice(0, 8).map(x => h(x.name) + ' x' + fmt(x.n)).join(', ')}${t.items.length > 8 ? ' …' : ''}</div>` : ''}</td>
      <td>${bankOf(t).map(b => b.kind === 'sold' ? `sold ${fmt(b.kinds)} kinds for ${fmt(b.adena)} a` : b.kind === 'stored' ? `stored ${fmt(b.kinds)} of ${fmt(b.of)} kinds` : 'crystallized the marks').join('<br>') || '<span class="muted">-</span>'}</td></tr>`).join('')}</table></div>` : '<div class="muted">No trip recorded yet.</div>'}</div>`;
    s.innerHTML = `<h2>Runner</h2>${top}${trip}${qh}${rot}${par}${tr}<div class="muted">Updated ${h(hm(d.at))} · the state lives in Logs/runner_*.json (kept over restarts and deploys)</div>`;
  }
  async function edit(op, party) {
    let r = null; try { r = await api('/api/runner', { method: 'POST', body: JSON.stringify({ op, party }) }); } catch (e) { r = { error: e.message }; }
    if (!r || r.error) { flash('Not sent: ' + ((r && r.error) || '?'), true); return; }
    flash(op === 'skip' ? `${party}'s call is skipped (the runner applies it within 10 s)` : `${party} moves to the top (within 10 s)`); setTimeout(load, 11000);
  }
  async function setting(body, msg) {
    let r = null; try { r = await api('/api/crafterpage', { method: 'POST', body: JSON.stringify(Object.assign({ action: 'settings' }, body)) }); } catch (e) { r = { error: e.message }; }
    if (!r || r.error) { flash('Not saved: ' + ((r && r.error) || '?'), true); return; }
    flash(msg); load();
  }
  async function onClick(e) {
    const t = e.target, g = (q) => t.closest(q); let b;
    if ((b = g('[data-rnpskip]'))) { edit('skip', b.dataset.rnpskip); return; }
    if ((b = g('[data-rnpup]'))) { edit('up', b.dataset.rnpup); return; }
    if ((b = g('[data-rnpcall]'))) {
      const leader = b.dataset.rnpcall, cmd = '!callrunner ' + leader, target = 'party:' + leader;
      const ok = typeof confirmOrder === 'function' ? await confirmOrder(target, cmd, 'Call the runner to party ' + leader) : true; if (!ok) return;
      if (typeof send === 'function') await send(target, null, cmd); flash(`The runner was called to ${leader}`); setTimeout(load, 4000); return;
    }
    if ((b = g('[data-rnpon]'))) { const on = b.dataset.rnpon === '1'; const ok = typeof uiConfirm === 'function' ? await uiConfirm({ title: on ? 'Switch the runner ON?' : 'Switch the runner OFF?', confirmText: on ? 'Switch ON' : 'Switch OFF' }) : true; if (ok) setting({ runnerOn: on }, on ? 'Runner ON' : 'Runner OFF'); return; }
    if ((b = g('[data-rnpst]'))) { const on = b.dataset.rnpst === '1'; setting({ runnerStealth: on }, on ? 'Stealth ON: the runner walks in everywhere (Silent Move)' : 'Stealth OFF: the old level limit'); return; }   // RUNNERSTEALTH-2026-11-03
    if ((b = g('[data-rnprot]'))) { const on = b.dataset.rnprot === '1'; setting({ rotateOn: on }, on ? 'Rotation ON' : 'Rotation OFF: the runner only answers calls'); return; }
  }
  window.RunnerPage = { route, open, close, load, _state: S };
})();
