// QUEST CIRCUIT page #/qcircuit[/<leader>] (owner 2026-10-25: "make it possible to repeat quest infinite times like circuit page but with
// quests"). Per party: the list of quests (each N runs in a row), party / solo, On / Off, live progress (quest, round, runs, skipped ones).
// Data /api/qcircuit (Dashboard/qcircuit_api.js). Phone-first. Uses index.html globals: api, stopChar, TAB, uiConfirm, uiError.
(function () {
  'use strict';
  const SEC = 'tab-qcircuit';
  const S = { open: false, d: null, party: '', q: '', poll: 0, busy: false };
  const $id = (i) => document.getElementById(i);
  const h = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const TYPE = { repeatable: 'repeatable', daily: 'daily', 'one-time': 'one-time (once per character)' };
  function section() {
    let s = $id(SEC); if (s) return s;
    s = document.createElement('section'); s.id = SEC; s.className = 'win qcp'; s.hidden = true;
    s.innerHTML = `<style>
      .qcp .qc-row{display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:6px 0;border-top:1px solid rgba(255,255,255,.07)}
      .qcp .qc-row:first-child{border-top:0}.qcp .qc-n{flex:1 1 180px;min-width:0}.qcp button,.qcp select,.qcp input{min-height:42px;font-size:16px}
      .qcp .qc-chips{display:flex;flex-wrap:wrap;gap:6px}.qcp .qc-chips button.on{outline:2px solid var(--gold,#c9a54a)}.qcp input[type=number]{width:70px}
      .qcp .qc-live{background:rgba(0,0,0,.25);border-radius:6px;padding:8px;margin:6px 0}.qcp .qc-bad{color:var(--bad,#e66)}.qcp .qc-ok{color:var(--good,#6c6)}
      .qcp .qc-find button{display:block;width:100%;text-align:left;margin:3px 0}</style>
      <div class="whead"><h2>Quest circuit</h2><span class="muted">a party repeats its quest list forever</span></div><div id="qcBody"></div>`;
    (document.querySelector('main') || document.body).appendChild(s);
    s.addEventListener('click', onClick); s.addEventListener('change', onChange); s.addEventListener('input', (e) => { if (e.target.id === 'qcQ') { S.q = e.target.value; renderFind(); } });
    return s;
  }
  function route(kind, arg) { if (kind === 'qcircuit') { open(arg ? decodeURIComponent(arg) : ''); return true; } close(); return false; }
  async function open(p) {
    const s = section(); try { stopChar(); } catch (e) { }
    try { TAB = 'qcircuit'; } catch (e) { }
    document.querySelectorAll('main > section').forEach(x => { if (x.id !== SEC) x.hidden = true; });
    s.hidden = false; S.open = true; if (p) S.party = p; window.scrollTo(0, 0);
    await load(); clearInterval(S.poll); S.poll = setInterval(() => { if (S.open && !document.hidden) load(); }, 15000);
  }
  function close() { if (!S.open) return; S.open = false; clearInterval(S.poll); const s = $id(SEC); if (s) s.hidden = true; }
  async function load() { try { S.d = await api('/api/qcircuit'); } catch (e) { S.d = { error: e.message }; } if (!S.party && S.d && S.d.parties && S.d.parties[0]) S.party = S.d.parties[0].leader; render(); }
  const cur = () => ((S.d && S.d.parties) || []).find(p => p.leader === S.party);
  function liveHtml(P) {
    const st = P.state; if (!st) return `<div class="qc-live muted">${P.on ? 'Starts within 30 s once the party is started (▶ Start on its card).' : 'Off.'}</div>`;
    const name = (id) => (P.quests.find(q => q.id === id) || {}).name || ('quest ' + id);
    const skip = Object.entries(st.skip || {});
    return `<div class="qc-live">${st.cur ? `<b>Now:</b> ${h(name(st.cur.id))} <span class="muted">(${st.cur.times} run${st.cur.times > 1 ? 's' : ''}, ${h(st.cur.mode || '')}, since ${new Date(st.cur.startedAt).toLocaleTimeString()})</span>` : '<span class="muted">between quests</span>'}
      <div class="muted">round ${(st.round || 0) + 1} · ${st.runs || 0} quest run${st.runs === 1 ? '' : 's'} finished${st.last ? ` · last: ${h(name(st.last.id))} — ${h(st.last.status)}` : ''}</div>
      ${skip.length ? `<div class="qc-bad">Skipped: ${skip.map(([id, why]) => h(name(Number(id))) + ' (' + h(why) + ')').join('; ')}</div>` : ''}</div>`;
  }
  function render() {
    const b = $id('qcBody'); if (!b) return; const D = S.d;
    if (!D || D.error) { b.innerHTML = `<div class="box">${h((D && D.error) || 'loading…')}</div>`; return; }
    const P = cur();
    b.innerHTML = `<div class="box"><div class="qc-chips">${D.parties.map(p => `<button class="${p.leader === S.party ? 'on' : ''}" data-qcp="${h(p.leader)}">${h(p.leader)}${p.on ? ' ●' : ''}</button>`).join('')}</div></div>
      ${P ? `<div class="box"><div class="qc-row"><span class="qc-n"><b style="font-size:18px">Party ${h(P.leader)}</b> <span class="muted">${P.names.length} character${P.names.length > 1 ? 's' : ''}</span></span>
          <select data-qcmode><option value="party" ${P.mode === 'party' ? 'selected' : ''}>whole party together</option><option value="solo" ${P.mode === 'solo' ? 'selected' : ''}>leader alone</option></select>
          <button data-qcon="${P.on ? '0' : '1'}" class="${P.on ? 'on' : ''}">${P.on ? '■ Circuit ON — switch off' : '▶ Switch the circuit on'}</button></div>
        ${liveHtml(P)}
        <h3>The list <span class="muted">top to bottom, then again from the top, forever</span></h3>
        ${P.quests.map((q, i) => `<div class="qc-row"><span class="qc-n">${i + 1}. <b>${h(q.name)}</b> <span class="muted">${h(TYPE[q.type] || q.type || '')}${q.lv && q.lv[0] ? ' · lvl ' + q.lv[0] + (q.lv[1] ? '–' + q.lv[1] : '+') : ''}</span>${q.type === 'one-time' ? ' <span class="qc-bad">once only</span>' : ''}</span>
          <label>runs <input type="number" min="1" max="999" value="${q.times}" data-qct="${i}"></label>
          <button data-qcup="${i}" ${i ? '' : 'disabled'} title="up">↑</button><button data-qcdel="${i}" title="remove">✕</button></div>`).join('') || '<div class="muted">No quests yet — add some below.</div>'}
        <h3>Add a quest</h3><input id="qcQ" type="search" placeholder="Quest name or id…" value="${h(S.q)}" style="width:100%"><div class="qc-find" id="qcFind"></div>
        <div class="muted" style="font-size:13px;margin-top:6px">Runs while the party is started (▶ Start on its card) and nothing more important happens (raids, missions, your own orders win). A one-time quest can be done once per character; the circuit skips it after that.</div></div>` : ''}`;
    renderFind();
  }
  function renderFind() {
    const el = $id('qcFind'); if (!el || !S.d) return; const q = S.q.trim().toLowerCase();
    if (q.length < 2) { el.innerHTML = ''; return; }
    const L = S.d.quests.filter(x => String(x.id) === q || String(x.name).toLowerCase().includes(q)).sort((a, b) => (/repeatable|daily/.test(b.type) - /repeatable|daily/.test(a.type)) || a.name.localeCompare(b.name)).slice(0, 25);
    el.innerHTML = L.map(x => `<button data-qcadd="${x.id}">${h(x.name)} <small class="muted">#${x.id} · ${h(TYPE[x.type] || x.type)}${x.lv && x.lv[0] ? ' · lvl ' + x.lv[0] + '+' : ''}</small></button>`).join('') || '<div class="muted">no quest matches</div>';
  }
  async function save(body, okTxt) {
    if (S.busy) return; S.busy = true;
    try { const r = await api('/api/qcircuit', { method: 'POST', body: JSON.stringify(Object.assign({ party: S.party }, body)) }); if (r.error) { if (typeof uiError === 'function') uiError(r.error); else alert(r.error); } else { S.d = r; render(); if (okTxt && window.UIKit) UIKit.toast(okTxt, { kind: 'ok' }); } }
    catch (e) { if (typeof uiError === 'function') uiError(e.message); } finally { S.busy = false; }
  }
  const listOf = (P) => P.quests.map(q => ({ id: q.id, times: q.times }));
  async function onClick(e) {
    const t = e.target.closest('button'); if (!t) return; const d = t.dataset, P = cur();
    if (d.qcp) { S.party = d.qcp; S.q = ''; render(); return; }
    if (!P) return;
    if (d.qcon) { const on = d.qcon === '1'; if (on && typeof uiConfirm === 'function' && !(await uiConfirm({ title: `Quest circuit for party ${P.leader}?`, body: `It repeats ${P.quests.length} quest(s) forever while the party is started: ${P.quests.map(q => q.name).join(', ')}.`, confirmText: 'Switch on' }))) return; save({ on }, on ? 'Quest circuit ON' : 'Quest circuit OFF'); return; }
    if (d.qcadd) { const L = listOf(P); L.push({ id: Number(d.qcadd), times: 1 }); S.q = ''; save({ quests: L }, 'Added'); return; }
    if (d.qcdel) { const L = listOf(P); L.splice(Number(d.qcdel), 1); save({ quests: L, on: L.length ? P.on : false }, 'Removed'); return; }
    if (d.qcup) { const L = listOf(P), i = Number(d.qcup); [L[i - 1], L[i]] = [L[i], L[i - 1]]; save({ quests: L }, ''); return; }
  }
  function onChange(e) {
    const t = e.target, d = t.dataset, P = cur(); if (!P) return;
    if (d.qcmode !== undefined) { save({ mode: t.value }, 'Saved'); return; }
    if (d.qct !== undefined) { const L = listOf(P); L[Number(d.qct)].times = Math.max(1, Math.min(999, Number(t.value) || 1)); save({ quests: L }, 'Saved'); }
  }
  window.QCircuitPage = { route, open, close };
})();
