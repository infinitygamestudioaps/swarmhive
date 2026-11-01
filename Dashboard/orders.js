// ORDERS VIEW (2026-10-13, user: "it is annoying that the commands we send keep not working"): what happened to every order sent from the
// dashboard - per party / character: pending (waiting for a window that is not connected yet), acknowledged, running, done, failed with the
// reason, superseded, expired, cancelled; Re-send / Cancel buttons (the shared styled dialog, never alert / confirm / prompt).
// Data: GET/POST /api/orders (Dashboard/orders_api.js) over the durable queue (Dashboard/orderqueue.js + the ORDERQ block of swarm.js).
// Hooks in index.html: renderParties -> OrdersView.partyBanner(leader) (the "still pending" line under the party header) and
// OrdersView.button('party:<leader>'); the command center's result shows the per-character delivery state (cmdcenter.js resultHtml).
(function () {
  'use strict';
  const ESC = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const API = (u, o) => (typeof api === 'function' ? api(u, o) : fetch(u, Object.assign({ headers: { 'Content-Type': 'application/json' } }, o || {})).then(r => r.json()));
  const hm = (ms) => { const d = new Date(ms); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
  const OV = { data: null, at: 0, busy: false, open: null, view: null };
  // UX audit B4 (2026-10-13): calm words (no shouting "FAILED"), identical results grouped, reasons in plain words (Dashboard/plainwords.js)
  const STATE_LABEL = { queued: 'waiting', delivered: 'waiting', acknowledged: 'started', running: 'working on it', done: 'done', skipped: 'skipped (hands off)', failed: 'not done', superseded: 'replaced', expired: 'too old', cancelled: 'cancelled', unknown: '?' };
  const PL = () => window.Plain || null;
  const isAdv = () => !window.UIKit || UIKit.isAdv();
  const cmdTitle = (c) => (PL() ? Plain.cmd(c) : String(c || ''));
  /** a !stop cut by a restart DID its job: the stop file + the switch OFF survive a swarm.js restart (Scripts_dev/swarm.js '!stop'),
   *  so the character stays stopped; the bot's ORDERQ calls every order "failed" when its runId changes (oqRunDecide) */
  function eff(o, r) {
    if (r && r.state === 'failed' && /swarm\.js restarted while it ran/.test(r.why || '') && /^#?!stop\b/i.test(String(o.cmd || '').trim()))
      return Object.assign({}, r, { state: 'done', why: '', note: 'the bot restarted afterwards and it stays stopped' });
    return r;
  }
  const whyOf = (o, r) => r.note ? r.note : !r.why ? '' : PL() ? Plain.order(r.why, r.state, o.cmd) : r.why;
  /** recipients with the same state + reason -> one line ("9 characters: done") */
  function groups(o) {
    const g = [], by = {};
    (o.recipients || []).map(r => eff(o, r)).forEach(r => {
      const showWhy = r.note || r.state === 'failed' || r.state === 'expired' || r.waiting || r.state === 'cancelled' || r.state === 'superseded' || r.state === 'skipped';
      const w = showWhy ? whyOf(o, r) : '', k = r.state + '|' + w;
      if (!by[k]) { by[k] = { state: r.state, why: w, names: [], raw: [] }; g.push(by[k]); }
      by[k].names.push(r.name); by[k].raw.push(`${r.name}: ${r.state}${r.why ? ' — ' + r.why : ''}${r.how ? ' [' + r.how + ']' : ''}`);
    });
    return g;
  }
  function namesTxt(names, all) {
    if (names.length > 1 && names.length === all) return all > 2 ? `all ${all}` : names.join(' and ');
    return names.length <= 4 ? names.join(', ') : `${names.slice(0, 3).join(', ')} +${names.length - 3} more`;
  }
  const css = `
  .ordban{margin:4px 8px;padding:5px 8px;border-left:3px solid #d8a93b;background:rgba(216,169,59,.10);font-size:var(--fs-sm,13px);line-height:1.35}
  .ordban button{margin-left:6px;padding:1px 8px}
  .ordov{position:fixed;inset:0;z-index:9000;background:rgba(0,0,0,.55);display:flex;align-items:flex-start;justify-content:center;padding:24px 8px;overflow:auto}
  .ordwin{max-width:860px;width:100%;background:var(--panel,#1d1a16);border:1px solid #6b5a3a;border-radius:6px;padding:10px 12px}
  .ordwin h2{margin:0 0 6px;font-size:16px}
  .ordrow{border-top:1px solid rgba(255,255,255,.08);padding:6px 0}
  .ordrow code{font-weight:bold}
  .ordrc{display:inline-block;margin:2px 6px 2px 0;padding:1px 6px;border-radius:9px;font-size:12px;background:rgba(255,255,255,.07)}
  .ordrc.s-done{background:rgba(70,160,90,.25)} .ordrc.s-running,.ordrc.s-acknowledged{background:rgba(70,120,200,.28)}
  .ordrc.s-failed{background:rgba(200,60,60,.35)} .ordrc.s-queued,.ordrc.s-delivered{background:rgba(216,169,59,.28)}
  .ordrc.s-expired,.ordrc.s-superseded,.ordrc.s-cancelled,.ordrc.s-skipped{background:rgba(140,140,140,.22)}
  .ordwhy{font-size:12px;opacity:.8;margin-left:4px}
  .ordact{float:right} .ordact button{margin-left:4px}
  .ordttl{font-size:var(--fs-em,14px);color:var(--gold,#e3c27a)} .ordrow code{font-weight:400;opacity:.75;margin-left:4px}
  .ordgrp{margin:3px 0;line-height:1.45} .ordgrp .ordwho{font-weight:600} .ordgrp .ordwhy{font-size:var(--fs-cap,12px);opacity:.85;margin-left:4px}
  .ordintro{font-size:var(--fs-cap,12px);margin-bottom:6px}
  @media (max-width:600px){.ordact{float:none;display:block;margin-top:4px}} .aqbox{margin:6px 0 10px} .aqbox h3{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:0 0 4px} .aqrow .aqwhy{font-size:12px;margin-top:2px} .aqchip{border-left:3px solid #5aa9ff}`;
  function ensureCss() { if (document.getElementById('ordCss')) return; const s = document.createElement('style'); s.id = 'ordCss'; s.textContent = css; document.head.appendChild(s); }

  async function poll(force) {
    if (OV.busy || (!force && document.hidden)) return;
    if (!force && Date.now() - OV.at < 3500) return;
    OV.busy = true;
    try { const d = await API('/api/orders?limit=60'); if (d && !d.error) { OV.data = d; OV.at = Date.now(); } } catch (e) { }
    try { const q = await API('/api/autoqueue'); OV.aq = q && !q.error ? q : null; } catch (e) { OV.aq = null; } finally { OV.busy = false; }   // AUTOQUEUE-2026-10-30
    if (OV.open) renderOv();
  }
  setInterval(() => poll(false), 4000); setTimeout(() => poll(true), 500);

  /** one line per order still waiting for someone of this party (index.html renderParties, under the party header) */
  /** AUTOQUEUE-2026-10-30 (requirement orders.md): the automatic-order queue of this party's lane: "Queue: 2 waiting · running: !gearup Doombringer1" or
   *  "your order — queue paused" */
  function queueChip(leader) {
    const L = OV.aq && (OV.aq.lanes || []).find(l => l.lane === leader); if (!L || (!L.waiting && !L.running && !L.paused)) return '';
    const parts = [];
    if (L.paused) parts.push(`your order <b>${ESC(cmdTitle(L.owner && L.owner.cmd))}</b> runs — queue paused`);
    if (L.running) parts.push(`running: <b>${ESC(cmdTitle(L.running.cmd))}</b>`);
    if (L.waiting) parts.push(`${L.waiting} waiting`);
    return `<div class="ordban aqchip" title="Automatic orders (Claude / automation) wait here, one at a time. Your own orders always go first.">&#128203; Queue: ${parts.join(' · ')}<button type="button" data-orders="party:${ESC(leader)}">Queue</button></div>`;
  }
  function partyBanner(leader) {
    ensureCss();
    const qc = queueChip(leader);
    const d = OV.data; if (!d || !d.enabled) return qc;
    const rows = (d.pending || {})[leader] || [];
    if (!rows.length) return qc;
    return qc + rows.slice(0, 3).map(r => {
      const down = r.waiting.filter(w => w.down), up = r.waiting.filter(w => !w.down);
      const who = (l) => l.map(w => ESC(w.name)).join(', ');
      const c = isAdv() ? ESC(r.cmd) : '“' + ESC(cmdTitle(r.cmd)) + '”';
      const txt = down.length
        ? `<b>${c}</b> is waiting for ${who(down)} — they get it when they come online${r.until ? ' (until ' + hm(r.until) + ')' : ''}${up.length ? ` · ${who(up)}: on the way` : ''}`
        : `<b>${c}</b> is on the way to ${who(up)}`;
      return `<div class="ordban" title="${ESC(r.waiting.map(w => w.name + ': ' + w.why).join('\n'))}">&#9203; ${txt}<button type="button" data-orders="party:${ESC(leader)}">Orders</button></div>`;
    }).join('');
  }
  function button(target) { return `<button type="button" data-orders="${ESC(target)}" title="What happened to the orders sent to them (pending, running, done, failed + why); re-send / cancel">Orders</button>`; }

  function rowHtml(o) {
    const open = o.recipients.some(r => r.pending || r.state === 'running' || r.state === 'acknowledged');
    const gs = groups(o), all = o.recipients.length, adv = isAdv();
    return `<div class="ordrow"><span class="ordact">
        <button type="button" data-ordresend="${ESC(o.id)}">Send again</button>${open ? `<button type="button" data-ordcancel="${ESC(o.id)}">Cancel</button>` : ''}</span>
      <b class="ordttl">${ESC(cmdTitle(o.cmd))}</b>${adv ? `<code>${ESC(o.cmd)}</code>` : ''} <span class="muted">→ ${ESC(o.label || '')} · ${hm(o.at)}${o.state === 'pending' && o.until ? ' · waits until ' + hm(o.until) : ''}</span>
      ${gs.map(x => `<div class="ordgrp"><span class="ordrc s-${ESC(x.state)}">${ESC(STATE_LABEL[x.state] || x.state)}</span> <span class="ordwho" title="${ESC(x.names.join(', '))}">${ESC(namesTxt(x.names, all))}</span>${x.why ? `<span class="ordwhy">— ${ESC(x.why)}</span>` : ''}</div>`).join('')}
      ${adv ? `<details class="uk-details"><summary>Details</summary><div class="uk-raw">${ESC(gs.flatMap(x => x.raw).join('\n'))}</div></details>` : ''}</div>`;
  }
  function filterOf(t) { const m = /^(party|char):(.+)$/.exec(String(t || '')); return m ? (m[1] === 'party' ? 'party=' : 'char=') + encodeURIComponent(m[2]) : ''; }
  async function loadView() {
    try { OV.view = await API('/api/orders?limit=60' + (filterOf(OV.open) ? '&' + filterOf(OV.open) : '')); } catch (e) { OV.view = { error: e.message }; }
    renderOv();
  }
  function renderOv() {
    if (!OV.open) return;
    let ov = document.getElementById('ordOv');
    if (!ov) { ov = document.createElement('div'); ov.id = 'ordOv'; ov.className = 'ordov'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); document.body.appendChild(ov); }
    const v = OV.view, title = OV.open === 'all' ? 'all characters' : OV.open.replace(/^party:/, 'party ').replace(/^char:/, '');
    const body = !v ? '<div class="muted">loading…</div>' : v.error ? `<div>${ESC(v.error)}</div>` : !v.enabled ? '<div class="muted">The order queue is off (dashboard server not restarted with the new code yet).</div>'
      : (v.orders || []).length ? v.orders.map(rowHtml).join('') : '<div class="muted">No orders sent from the dashboard yet.</div>';
    ov.innerHTML = `<div class="ordwin win"><button type="button" data-ordclose="1" style="float:right">Close</button><h2>Orders — ${ESC(title)}</h2>${queueHtml()}
      <div class="muted ordintro">What happened to the orders you sent. <b>Waiting</b> = the character is not online yet; it gets the order when it comes online. <b>Working on it</b> · <b>done</b> · <b>not done</b> (with the reason) · <b>replaced</b> by a newer order · <b>too old</b> (it was not picked up in time) · <b>cancelled</b>.</div>${body}</div>`;
  }
  const AQ_LABEL = { waiting: 'waiting', running: 'running now', done: 'done', failed: 'not done', replaced: 'replaced by your order', cancelled: 'cancelled', timeout: 'timed out' };
  function queueHtml() {
    const q = OV.aq; if (!q) return '';
    const lane = /^party:/.test(OV.open || '') ? OV.open.slice(6) : null;
    const items = (q.items || []).filter(i => !lane || (i.lanes || []).includes(lane));
    const open = items.filter(i => i.state === 'waiting' || i.state === 'running').reverse(), past = items.filter(i => i.state !== 'waiting' && i.state !== 'running').slice(0, 5);
    const L = lane ? (q.lanes || []).find(l => l.lane === lane) : null;
    if (!open.length && !past.length && !(L && L.paused)) return '';
    const row = (i) => `<div class="ordrow aqrow"><span class="ordact">${i.state === 'waiting' ? `<button type="button" data-aqrun="${ESC(i.id)}">Run now</button>` : ''}${i.state === 'waiting' || i.state === 'running' ? `<button type="button" data-aqcancel="${ESC(i.id)}">Cancel</button>` : ''}</span>
      <b class="ordttl">${ESC(cmdTitle(i.cmd))}</b> <span class="ordrc s-${ESC(i.state === 'replaced' ? 'superseded' : i.state === 'timeout' ? 'expired' : i.state)}">${ESC(AQ_LABEL[i.state] || i.state)}</span>
      <span class="muted">→ ${ESC((i.lanes || []).join(', '))} · ${ESC(i.by || '')} · ${hm(i.at)}${i.note ? ' · ' + ESC(i.note) : ''}</span>${i.why ? `<div class="muted aqwhy">${ESC(i.why)}</div>` : ''}</div>`;
    return `<div class="box aqbox"><h3>Queue (automatic orders)${lane && open.some(i => i.state === 'waiting') ? ` <button type="button" data-aqclear="${ESC(lane)}">Clear queue</button>` : ''}</h3>
      <div class="muted ordintro">Orders from Claude / automation wait here and go one at a time per party. <b>Your own orders always go first</b>: they pause the queue until they are done, and an automatic order they replace is never sent again.</div>
      ${L && L.paused ? `<div class="ordban">&#9995; your order <b>${ESC(cmdTitle(L.owner && L.owner.cmd))}</b> runs — the queue waits</div>` : ''}
      ${open.map(row).join('') || '<div class="muted">Nothing waiting.</div>'}${past.length ? `<details class="uk-details"><summary>Last ${past.length}</summary>${past.map(row).join('')}</details>` : ''}</div>`;
  }
  async function aqAct(action, id, lane) {
    const confirmFn = window.uiConfirm || (window.UIDialog && window.UIDialog.confirm); if (!confirmFn) return;
    const i = ((OV.aq && OV.aq.items) || []).find(x => x.id === id);
    const txt = action === 'clear' ? { title: `Clear the queue of ${lane}?`, body: 'Every waiting automatic order of this party is cancelled (a running one goes on).', confirmText: 'Clear queue' }
      : action === 'runnow' ? { title: `Run “${cmdTitle(i && i.cmd)}” next?`, body: 'It moves to the front and goes as soon as the order running now is finished (also while your own order would pause the queue).', confirmText: 'Run now' }
      : { title: `Cancel “${cmdTitle(i && i.cmd)}”?`, body: i && i.state === 'running' ? 'The queue moves on; the order it already sent keeps running (cancel that one in the list below).' : 'It will not be sent.', confirmText: 'Cancel it', cancelText: 'Keep it' };
    if (!await confirmFn(txt)) return;
    const r = await API('/api/autoqueue', { method: 'POST', body: JSON.stringify({ action, id, lane }) });
    if (r && r.error && window.uiError) window.uiError(r.error, 'Not changed');
    await poll(true); renderOv();
  }
  function openOv(target) { ensureCss(); OV.open = target || 'all'; OV.view = null; renderOv(); loadView(); if (!OV.iv) OV.iv = setInterval(() => { if (OV.open) loadView(); else { clearInterval(OV.iv); OV.iv = null; } }, 3000); }
  function closeOv() { OV.open = null; const ov = document.getElementById('ordOv'); if (ov) ov.remove(); }
  async function resend(id) {
    const o = ((OV.view && OV.view.orders) || []).find(x => x.id === id); if (!o) return;
    const confirmFn = window.uiConfirm || (window.UIDialog && window.UIDialog.confirm);
    if (!confirmFn) return;
    if (!await confirmFn({ title: `Send “${cmdTitle(o.cmd)}” again?`, body: `To ${o.label || 'the same characters'} — a new order (the old one stays in the list).`, confirmText: 'Send again', cancelText: 'Cancel' })) return;
    let danger = o.safety === 'destructive';
    if (danger && !await confirmFn({ title: `This cannot be undone: “${cmdTitle(o.cmd)}”`, body: 'Type YES to send it again.', typeToConfirm: 'YES', danger: true, confirmText: 'Send again' })) return;
    const r = await API('/api/orders', { method: 'POST', body: JSON.stringify({ action: 'resend', id, confirmDanger: danger }) });
    if (r && r.error && window.uiError) window.uiError(r.error, 'Not sent');
    poll(true); loadView();
  }
  async function cancel(id) {
    const o = ((OV.view && OV.view.orders) || []).find(x => x.id === id); if (!o) return;
    const confirmFn = window.uiConfirm || (window.UIDialog && window.UIDialog.confirm);
    if (!confirmFn) return;
    const open = o.recipients.filter(r => r.pending || r.state === 'running' || r.state === 'acknowledged');
    if (!await confirmFn({ title: `Cancel “${cmdTitle(o.cmd)}”?`, body: `Not picked up yet: it will not run. Already running: its window ends the order's retry loop (what it already did stays done).\n\n• ${open.map(r => r.name + ' (' + (STATE_LABEL[r.state] || r.state) + ')').join('\n• ')}`, confirmText: 'Cancel the order', cancelText: 'Keep it', danger: true })) return;
    const r = await API('/api/orders', { method: 'POST', body: JSON.stringify({ action: 'cancel', id, names: open.map(x => x.name) }) });
    if (r && r.error && window.uiError) window.uiError(r.error, 'Not cancelled');
    poll(true); loadView();
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-orders],[data-ordclose],[data-ordresend],[data-ordcancel],[data-aqrun],[data-aqcancel],[data-aqclear]'); if (!b) { if (OV.open && e.target && e.target.id === 'ordOv') closeOv(); return; }
    e.preventDefault(); e.stopPropagation();
    if (b.dataset.orders) openOv(b.dataset.orders);
    else if (b.dataset.ordclose) closeOv();
    else if (b.dataset.ordresend) resend(b.dataset.ordresend);
    else if (b.dataset.ordcancel) cancel(b.dataset.ordcancel);
    else if (b.dataset.aqrun) aqAct('runnow', b.dataset.aqrun);
    else if (b.dataset.aqcancel) aqAct('cancel', b.dataset.aqcancel);
    else if (b.dataset.aqclear) aqAct('clear', null, b.dataset.aqclear);
  }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && OV.open && !(window.UIDialog && UIDialog.isOpen())) closeOv(); });
  /** the command center's result: one line per character with its delivery state */
  function resultLines(r) {
    if (!r || !Array.isArray(r.orders) || !r.orders.length) return '';
    return r.orders.map(o => { const all = o.recipients.length; return `<div>${groups(o).map(x => `<span class="ordrc s-${ESC(x.state)}" title="${ESC(x.names.join(', ') + (x.why ? ' — ' + x.why : ''))}">${ESC(namesTxt(x.names, all))}: ${ESC(STATE_LABEL[x.state] || x.state)}</span>`).join('')}${o.recipients.some(x => x.waiting) ? `<div class="muted">${ESC([...new Set(o.recipients.filter(x => x.waiting).map(x => whyOf(o, x)))].join(' · '))}</div>` : ''}</div>`; }).join('');
  }
  window.OrdersView = { partyBanner, button, open: openOv, close: closeOv, resultLines, poll, queueChip, state: OV };
})();
