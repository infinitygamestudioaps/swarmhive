// DEATHSTOP BANNER (owner 2026-11-22: "announce it with a banner that can be resolved manually"): one red line per party that waits in town because it
// died 3 times within an hour at the spot you chose. Shown on every page under the header until "Resolve". Data: STATE.deathStops (/api/state) ->
// Dashboard/deathstop_api.js. Uses index.html globals: esc, api, uiError.
(function () {
  'use strict';
  const D = { busy: {}, sig: '' };
  const hm = (ms) => { const d = new Date(ms); return isNaN(d) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); };
  function html(rows) {
    return rows.map(r => {
      const link = `<a href="#/party/${encodeURIComponent(r.leader)}">${esc(r.leader)}</a>`, when = r.deaths.length ? ` (${esc(r.deaths.map(hm).join(', '))})` : '';
      const now = r.waiting ? `The party waits in town until ${esc(hm(r.until))}. Resolve = it hunts there again now. Another spot or an order also ends the wait.`
        : `It is hunting again${r.ended && r.ended.why ? ` (${esc(r.ended.why)}${r.ended.at ? ', ' + esc(hm(r.ended.at)) : ''})` : ''}. Resolve = hide this.`;
      return `<div class="ds-row"><div class="ds-txt"><div class="bk-t">⚠ ${link}'s party died 3 times in an hour at <span class="bk-n">${esc(r.spot)}</span>${when}</div><div class="bk-w">${now}</div></div>
        <button type="button" data-dsresolve="${esc(r.leader)}"${D.busy[r.leader] ? ' disabled' : ''}>${r.waiting ? 'Resolve: hunt again' : 'Resolve'}</button></div>`;
    }).join('');
  }
  function paint(rows) {
    const el = document.getElementById('deathStopBar'); if (!el) return;
    rows = Array.isArray(rows) ? rows : [];
    const h = rows.length ? html(rows) : '';
    if (h === D.sig && el.hidden === !h) return;
    D.sig = h; el.innerHTML = h; el.hidden = !h;
  }
  document.addEventListener('click', async (e) => {
    const b = e.target.closest && e.target.closest('[data-dsresolve]'); if (!b) return;
    e.preventDefault();
    const party = b.dataset.dsresolve; if (D.busy[party]) return;
    D.busy[party] = true; b.disabled = true;
    try { const r = await api('/api/deathstop', { method: 'POST', body: JSON.stringify({ party }) }); if (r && r.error) uiError(r.error, 'Not resolved'); else if (r && r.rows) paint(r.rows); }
    catch (er) { try { uiError(String(er.message || er), 'Not resolved'); } catch (e2) { } }
    finally { delete D.busy[party]; }
  });
  window.DeathStop = { paint, html };
})();
