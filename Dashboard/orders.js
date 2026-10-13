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
  const STATE_LABEL = { queued: 'waiting', delivered: 'delivered', acknowledged: 'accepted', running: 'running', done: 'done', failed: 'FAILED', superseded: 'replaced', expired: 'expired', cancelled: 'cancelled', unknown: '?' };
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
  .ordrc.s-expired,.ordrc.s-superseded,.ordrc.s-cancelled{background:rgba(140,140,140,.22)}
  .ordwhy{font-size:12px;opacity:.8;margin-left:4px}
  .ordact{float:right} .ordact button{margin-left:4px}
  @media (max-width:600px){.ordact{float:none;display:block;margin-top:4px}}`;
  function ensureCss() { if (document.getElementById('ordCss')) return; const s = document.createElement('style'); s.id = 'ordCss'; s.textContent = css; document.head.appendChild(s); }

  async function poll(force) {
    if (OV.busy || (!force && document.hidden)) return;
    if (!force && Date.now() - OV.at < 3500) return;
    OV.busy = true;
    try { const d = await API('/api/orders?limit=60'); if (d && !d.error) { OV.data = d; OV.at = Date.now(); } } catch (e) { } finally { OV.busy = false; }
    if (OV.open) renderOv();
  }
  setInterval(() => poll(false), 4000); setTimeout(() => poll(true), 500);

  /** one line per order still waiting for someone of this party (index.html renderParties, under the party header) */
  function partyBanner(leader) {
    ensureCss();
    const d = OV.data; if (!d || !d.enabled) return '';
    const rows = (d.pending || {})[leader] || [];
    if (!rows.length) return '';
    return rows.slice(0, 3).map(r => {
      const down = r.waiting.filter(w => w.down), up = r.waiting.filter(w => !w.down);
      const who = (l) => l.map(w => ESC(w.name)).join(', ');
      const txt = down.length
        ? `<b>${ESC(r.cmd)}</b> waiting for ${who(down)} (not connected yet) — will be delivered${r.until ? ' until ' + hm(r.until) : ''}${up.length ? ` · ${who(up)}: on the way` : ''}`
        : `<b>${ESC(r.cmd)}</b> on the way to ${who(up)} (not confirmed yet)`;
      return `<div class="ordban" title="${ESC(r.waiting.map(w => w.name + ': ' + w.why).join('\n'))}">&#9203; ${txt}<button type="button" data-orders="party:${ESC(leader)}">Orders</button></div>`;
    }).join('');
  }
  function button(target) { return `<button type="button" data-orders="${ESC(target)}" title="What happened to the orders sent to them (pending, running, done, failed + why); re-send / cancel">Orders</button>`; }

  function rowHtml(o) {
    const open = o.recipients.some(r => r.pending || r.state === 'running' || r.state === 'acknowledged');
    return `<div class="ordrow"><span class="ordact">
        <button type="button" data-ordresend="${ESC(o.id)}">Re-send</button>${open ? `<button type="button" data-ordcancel="${ESC(o.id)}">Cancel</button>` : ''}</span>
      <code>${ESC(o.cmd)}</code> <span class="muted">→ ${ESC(o.label || '')} · ${hm(o.at)} · ${ESC(o.state)}${o.state === 'pending' && o.until ? ' (expires ' + hm(o.until) + ')' : ''}</span>
      <div>${o.recipients.map(r => `<span class="ordrc s-${ESC(r.state)}" title="${ESC((r.why || '') + (r.how ? ' [' + r.how + ']' : ''))}">${ESC(r.name)}: ${ESC(STATE_LABEL[r.state] || r.state)}</span>${(r.state === 'failed' || r.state === 'expired' || r.waiting || (r.state === 'superseded' && o.recipients.length === 1)) && r.why ? `<span class="ordwhy">${ESC(r.why)}</span>` : ''}`).join('')}</div></div>`;
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
    ov.innerHTML = `<div class="ordwin win"><button type="button" data-ordclose="1" style="float:right">Close</button><h2>Orders — ${ESC(title)}</h2>
      <div class="muted" style="font-size:12px;margin-bottom:6px">waiting = not picked up yet (the character is not connected / not ready; it is delivered when its swarm.js starts) · accepted / running = its window has it · done / FAILED (why) / replaced by a newer order / expired (not picked up in time) / cancelled</div>${body}</div>`;
  }
  function openOv(target) { ensureCss(); OV.open = target || 'all'; OV.view = null; renderOv(); loadView(); if (!OV.iv) OV.iv = setInterval(() => { if (OV.open) loadView(); else { clearInterval(OV.iv); OV.iv = null; } }, 3000); }
  function closeOv() { OV.open = null; const ov = document.getElementById('ordOv'); if (ov) ov.remove(); }
  async function resend(id) {
    const o = ((OV.view && OV.view.orders) || []).find(x => x.id === id); if (!o) return;
    const confirmFn = window.uiConfirm || (window.UIDialog && window.UIDialog.confirm);
    if (!confirmFn) return;
    if (!await confirmFn({ title: `Send ${o.cmd} again?`, body: `To ${o.label || 'the same targets'} — a new order (the old one stays in the list).`, confirmText: 'Send again', cancelText: 'Cancel' })) return;
    let danger = o.safety === 'destructive';
    if (danger && !await confirmFn({ title: `DESTRUCTIVE: ${o.cmd}`, body: 'Type YES to send it again.', typeToConfirm: 'YES', danger: true, confirmText: 'Send again' })) return;
    const r = await API('/api/orders', { method: 'POST', body: JSON.stringify({ action: 'resend', id, confirmDanger: danger }) });
    if (r && r.error && window.uiError) window.uiError(r.error, 'Not sent');
    poll(true); loadView();
  }
  async function cancel(id) {
    const o = ((OV.view && OV.view.orders) || []).find(x => x.id === id); if (!o) return;
    const confirmFn = window.uiConfirm || (window.UIDialog && window.UIDialog.confirm);
    if (!confirmFn) return;
    const open = o.recipients.filter(r => r.pending || r.state === 'running' || r.state === 'acknowledged');
    if (!await confirmFn({ title: `Cancel ${o.cmd}?`, body: `Not picked up yet: it will not run. Already running: its window ends the order's retry loop (what it already did stays done).\n\n• ${open.map(r => r.name + ' (' + (STATE_LABEL[r.state] || r.state) + ')').join('\n• ')}`, confirmText: 'Cancel the order', cancelText: 'Keep it', danger: true })) return;
    const r = await API('/api/orders', { method: 'POST', body: JSON.stringify({ action: 'cancel', id, names: open.map(x => x.name) }) });
    if (r && r.error && window.uiError) window.uiError(r.error, 'Not cancelled');
    poll(true); loadView();
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-orders],[data-ordclose],[data-ordresend],[data-ordcancel]'); if (!b) { if (OV.open && e.target && e.target.id === 'ordOv') closeOv(); return; }
    e.preventDefault(); e.stopPropagation();
    if (b.dataset.orders) openOv(b.dataset.orders);
    else if (b.dataset.ordclose) closeOv();
    else if (b.dataset.ordresend) resend(b.dataset.ordresend);
    else if (b.dataset.ordcancel) cancel(b.dataset.ordcancel);
  }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && OV.open && !(window.UIDialog && UIDialog.isOpen())) closeOv(); });
  /** the command center's result: one line per character with its delivery state */
  function resultLines(r) {
    if (!r || !Array.isArray(r.orders) || !r.orders.length) return '';
    return r.orders.map(o => `<div>${o.recipients.map(x => `<span class="ordrc s-${ESC(x.state)}" title="${ESC(x.why || '')}">${ESC(x.name)}: ${ESC(STATE_LABEL[x.state] || x.state)}</span>`).join('')}${o.recipients.some(x => x.waiting) ? `<div class="muted">${ESC(o.recipients.filter(x => x.waiting).map(x => x.why).join(' · '))}</div>` : ''}</div>`).join('');
  }
  window.OrdersView = { partyBanner, button, open: openOv, close: closeOv, resultLines, poll, state: OV };
})();
