// ACCOUNTS -> CHARACTERS & ITEMS (ALTS-2026-10-25; Mr.P + owner: "check their inventory, and make it possible to see it all somewhere under an
// account" + "transfer all items from other characters on same account to another character ... easy to do with mobile and pc").
// A box at the top of the Accounts tab: every account with every character (the playing one + its other characters = alts), each with its
// bag and private warehouse (search across all), and for an alt: "Read bag + warehouse" (the account switches to it, it goes to Giran, reads
// its warehouse, switches back) and "Give everything to ..." (warehouse out except +10 and up, everything to the chosen character in Giran).
// Data /api/alts, jobs POST /api/alts/run (Dashboard/server.js ALTS). Uses index.html globals: api, uiConfirm, uiChoice, uiError, iconUrl.
(function () {
  'use strict';
  const S = { d: null, open: {}, q: '', busy: false, at: 0 };
  const $id = (i) => document.getElementById(i);
  const h = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ago = (t) => { const m = Math.round((Date.now() - Date.parse(t || 0)) / 60000); return !t ? 'never' : m < 2 ? 'just now' : m < 120 ? m + ' min ago' : Math.round(m / 60) + ' h ago'; };
  const kmb = (n) => { n = Number(n || 0); return n >= 1e9 ? (n / 1e9).toFixed(1) + 'bn' : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e4 ? Math.round(n / 1e3) + 'k' : String(n); };
  function box() {
    let b = $id('accItems'); if (b) return b;
    const sec = $id('tab-accounts'); if (!sec) return null;
    b = document.createElement('div'); b.id = 'accItems'; b.className = 'box'; b.style.marginBottom = '12px';
    const st = document.createElement('style'); st.textContent = `
      #accItems .ai-acc{border-top:1px solid rgba(255,255,255,.08);padding:2px 0}#accItems .ai-acc:first-of-type{border-top:0}
      #accItems .ai-row{display:flex;gap:8px;align-items:baseline;min-height:40px;padding:6px 4px;cursor:pointer;flex-wrap:wrap}#accItems .ai-row:hover{background:rgba(255,255,255,.04)}
      #accItems .ai-tw{width:14px;flex:none;opacity:.7}#accItems .ai-lg{flex:0 0 auto;min-width:90px}#accItems .ai-cs{flex:1 1 160px;min-width:0;opacity:.85}#accItems .ai-cs i{opacity:.7}#accItems .ai-ct{flex:none;font-size:12px}
      #accItems .ai-ch{display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:4px 0}#accItems .ai-n{flex:1 1 160px;min-width:0}
      #accItems button{min-height:42px;font-size:15px}#accItems input[type=search]{width:100%;min-height:42px;font-size:16px}
      #accItems .ai-items{display:flex;flex-wrap:wrap;gap:4px;margin:4px 0 6px}#accItems .ai-it{font-size:13px;padding:1px 6px;border-radius:4px;background:rgba(255,255,255,.07)}
      #accItems .ai-it.eq{outline:1px solid rgba(201,162,58,.5)}#accItems .ai-job{font-size:13px}#accItems .ai-bad{color:var(--bad,#e66)}#accItems .ai-ok{color:var(--good,#6c6)}
      #accItems pre{white-space:pre-wrap;max-height:200px;overflow:auto;font-size:12px}`;
    b.appendChild(st);
    const inner = document.createElement('div'); inner.id = 'accItemsIn'; b.appendChild(inner);
    sec.insertBefore(b, sec.querySelector('.scroll') || sec.firstChild.nextSibling);
    b.addEventListener('click', onClick); b.addEventListener('input', (e) => { if (e.target.id === 'aiQ') { S.q = e.target.value; render(true); } });
    return b;
  }
  async function load() { try { S.d = await api('/api/alts'); S.at = Date.now(); } catch (e) { S.d = { error: e.message }; } render(); }
  function itemsHtml(list, eqMark) {
    const q = S.q.trim().toLowerCase();
    const L = (list || []).filter(i => !q || String(i.name || '').toLowerCase().includes(q)).sort((a, b) => (b.eq - a.eq) || String(a.name).localeCompare(String(b.name)));
    return L.length ? `<div class="ai-items">${L.slice(0, 300).map(i => `<span class="ai-it${eqMark && i.eq ? ' eq' : ''}" title="${i.eq ? 'worn' : ''}">${h(i.name)}${Number(i.enchant) ? ' +' + i.enchant : ''}${Number(i.count) > 1 ? ' ×' + kmb(i.count) : ''}</span>`).join('')}${L.length > 300 ? `<span class="muted">+${L.length - 300} more</span>` : ''}</div>` : '<div class="muted" style="font-size:13px">nothing' + (q ? ' matching' : '') + '</div>';
  }
  function jobHtml(j) {
    if (!j) return '';
    return `<div class="ai-job ${j.state === 'failed' ? 'ai-bad' : j.state === 'done' ? 'ai-ok' : 'muted'}">last job: ${h(j.state || '')} — ${h(j.step || '')} (${ago(j.at)})</div>`;
  }
  function render(keepFocus) {
    const b = box(); if (!b) return; const D = S.d, el = $id('accItemsIn');
    if (!D || D.error) { el.innerHTML = `<h3>Characters & items</h3><div class="muted">${h((D && D.error) || 'loading…')}</div>`; return; }
    const J = D.job, running = J && !J.done;
    const q = S.q.trim().toLowerCase(), hit = (c) => !q || [].concat((c.bag && c.bag.items) || [], (c.wh && c.wh.items) || []).some(i => String(i.name || '').toLowerCase().includes(q)) || c.name.toLowerCase().includes(q);
    const accs = D.accounts.filter(a => a.chars.some(hit));
    el.innerHTML = `<h3>Characters & items <span class="muted">${D.accounts.length} accounts · ${D.accounts.reduce((t, a) => t + a.chars.filter(c => c.alt).length, 0)} other characters (alts)</span></h3>
      <input id="aiQ" type="search" placeholder="Find an item or character in every bag and warehouse…" value="${h(S.q)}">
      ${J ? `<div class="box" style="margin:6px 0"><b>${running ? '⏳ Running' : J.ok ? '✓ Done' : '✗ Failed'}:</b> ${h(J.alt)} — ${J.action === 'give' ? 'give everything to ' + h(J.target) : 'read bag + warehouse'}${J.error ? ` <span class="ai-bad">${h(J.error)}</span>` : ''}<pre>${h((J.log || []).slice(-12).map(l => l.replace(/^\S+\s/, '')).join('\n'))}</pre></div>` : ''}
      ${accs.map(a => { const op = S.open[a.login] !== undefined ? S.open[a.login] : (!!q || a.chars.some(c => c.alt));
        const nb = a.chars.reduce((t, c) => t + ((c.bag && c.bag.items.length) || 0), 0), nw = a.chars.reduce((t, c) => t + ((c.wh && c.wh.items.length) || 0), 0);
        return `<div class="ai-acc"><div class="ai-row" role="button" tabindex="0" data-aiacc="${h(a.login)}"><span class="ai-tw">${op ? '▾' : '▸'}</span><b class="ai-lg">${h(a.login)}</b><span class="ai-cs">${a.chars.map(c => h(c.name) + (c.alt ? ' <i>(alt)</i>' : '')).join(', ')}</span><span class="muted ai-ct">${nb} bag${nw ? ' · ' + nw + ' wh' : ''}</span></div>
        ${op ? a.chars.filter(hit).map(c => `<div class="ai-ch"><span class="ai-n"><b>${h(c.name)}</b> <span class="muted">${c.alt ? 'other character on this account' : (c.level ? 'lvl ' + c.level + ' ' + h(c.cls || '') : '') + (c.online ? ' · online' : ' · offline')}</span></span>
            ${c.alt ? `<button data-aicensus="${h(c.name)}" ${running ? 'disabled' : ''}>Read bag + warehouse</button><button data-aigive="${h(c.name)}" ${running ? 'disabled' : ''}>Give everything to…</button>` : ''}</div>
          <div class="muted" style="font-size:12px">Bag (${c.bag ? ago(c.bag.at) : 'never read'}):</div>${c.bag ? itemsHtml(c.bag.items, true) : ''}
          <div class="muted" style="font-size:12px">Warehouse (${c.wh ? ago(c.wh.at) : 'never read'}):</div>${c.wh ? itemsHtml(c.wh.items) : ''}${jobHtml(c.job)}`).join('') : ''}</div>`; }).join('') || '<div class="muted">nothing matches</div>'}
      <div class="muted" style="font-size:12px;margin-top:6px">An alt job switches its account to the alt for a few minutes (its playing character is offline meanwhile), then back. One at a time.</div>`;
    if (keepFocus) { const i = $id('aiQ'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
  }
  async function run(body, title, txt) {
    if (typeof uiConfirm === 'function' && !(await uiConfirm({ title, body: txt, confirmText: 'Start' }))) return;
    try { const r = await api('/api/alts/run', { method: 'POST', body: JSON.stringify(body) }); if (r.error) { if (typeof uiError === 'function') uiError(r.error); return; } } catch (e) { if (typeof uiError === 'function') uiError(e.message); return; }
    load();
  }
  async function onClick(e) {
    const row = e.target.closest('[data-aiacc]'); if (row && !e.target.closest('button')) { const a = (S.d.accounts || []).find(x => x.login === row.dataset.aiacc), q = S.q.trim(); const was = S.open[row.dataset.aiacc] !== undefined ? S.open[row.dataset.aiacc] : (!!q || (a && a.chars.some(c => c.alt))); S.open[row.dataset.aiacc] = !was; render(); return; }
    const t = e.target.closest('button'); if (!t) return; const d = t.dataset;
    const acc = (n) => (S.d.accounts || []).find(a => a.chars.some(c => c.name === n));
    if (d.aicensus) { const a = acc(d.aicensus), main = a && a.chars.find(c => c.main);
      run({ alt: d.aicensus, action: 'census' }, `Read ${d.aicensus}'s bag + warehouse?`, `Account ${a ? a.login : ''} switches from ${main ? main.name : 'its character'} to ${d.aicensus} for a few minutes: it goes to Giran, reads its warehouse, then the account switches back. Nothing is moved.`); return; }
    if (d.aigive) {
      const a = acc(d.aigive), same = new Set(a ? a.chars.map(c => c.name) : []);
      const targets = [].concat(...S.d.accounts.map(x => x.chars)).filter(c => c.main && c.online && !same.has(c.name)).map(c => c.name).sort();
      if (!targets.length) { if (typeof uiError === 'function') uiError('No online character on another account to receive it.'); return; }
      const to = typeof uiChoice === 'function' ? await uiChoice({ title: `Give everything of ${d.aigive} to…`, body: 'Who receives it? (A character of another account; both meet in Giran.)', buttons: targets.slice(0, 40).map(n => ({ label: n, value: n })) }) : targets[0];
      if (!to) return;
      run({ alt: d.aigive, action: 'give', target: to }, `Give everything of ${d.aigive} to ${to}?`, `${d.aigive} takes everything out of its warehouse (never a piece at +10 or higher) and gives every bag item that is not worn or a quest item, plus all adena, to ${to} in Giran. Its account is switched to ${d.aigive} meanwhile and back at the end.`);
    }
  }
  // the Accounts tab: show + refresh while it is visible
  setInterval(() => { const sec = $id('tab-accounts'); if (!sec || sec.hidden) return; if (!$id('accItems') || Date.now() - S.at > ((S.d && S.d.job && !S.d.job.done) ? 5000 : 30000)) load(); }, 2000);
  window.AltsPage = { load };
})();
