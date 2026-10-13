// TRADE page #/trade (HANDOVER, user 2026-10-10: "I need some buttons so I can tell teams and characters to go to the clan leader OR a
// character of own choice and trade everything we want to. I need to be able to select what should be traded easily.").
//   1 who gives (characters, whole parties, everyone)   2 who receives (default: the clan leader)   3 what (the givers' LIVE bags, by category,
//   quick buttons, search, per-item tick + count, adena only with its own amount, presets)   -> Preview (dry run, exact list per giver)
//   -> styled confirm (Dashboard/uidialog.js) -> the order (POST /api/trade/order: Logs/handover/<id>.json + "!handover <id>") -> live status.
// Routes: #/trade, #/trade/party:<leader>, #/trade/char:<name> (pre-selects the givers; the party header + character page link here).
// Data: Dashboard/tradepage_api.js (/api/trade/*), logic Dashboard/tradelogic.js (window.TradeLogic). Uses index.html globals: esc, api,
// itemIcon, iconUrl, classIcon, stopChar, TAB, and uidialog's uiConfirm / uiAlert / uiPrompt / uiP / uiH / uiList / uiWarn / uiNote.
// No browser alert / confirm / prompt.
(function () {
  'use strict';
  const SEC = 'tab-tradepage';
  const TP = { open: false, info: null, bags: {}, givers: [], receiver: '@clanleader', sel: {}, adena: {}, q: '', quick: {}, busy: false, watch: null, timer: 0, bagT: 0, pre: '' };
  const $id = (i) => document.getElementById(i);
  const L = () => window.TradeLogic;
  const h = (s) => (typeof esc === 'function' ? esc(s) : String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const ico = (p) => (typeof iconUrl === 'function' ? iconUrl(p) : '/icons/' + p + '.png');
  const iIco = (id) => { try { return itemIcon(id); } catch (e) { return ico('icon/etc_question_mark_i00'); } };
  const store = (k, v) => { try { if (v === undefined) return JSON.parse(localStorage.getItem('swarm.trade.' + k)); localStorage.setItem('swarm.trade.' + k, JSON.stringify(v)); } catch (e) { return null; } return null; };
  const fmt = (n) => Number(n || 0).toLocaleString('en-US');

  // ======================================================================== data
  async function loadInfo() {
    try { const d = await api('/api/trade/info'); if (d && !d.error) TP.info = d; else if (d) flash(d.error, true); }
    catch (e) { const m = String((e && e.message) || e || ''); flash(/404|not found/i.test(m) ? 'The dashboard server has no Trade API yet (it needs a restart).' : 'Trade info failed: ' + m.slice(0, 200), true); }   // TRADEERR-2026-10-13: a tester saw the restart text after restarting - show the real error
    render();
  }
  async function loadBags(fresh) {
    const names = TP.givers.slice();
    if (!names.length) { TP.bags = {}; renderItems(); return; }
    TP.loadingBags = true; renderItems();
    try {
      const d = await api('/api/trade/bags?names=' + encodeURIComponent(names.join(',')) + (fresh ? '&fresh=1' : ''));
      if (d && d.bags) { TP.bags = d.bags; Object.keys(TP.sel).forEach(n => { if (!names.includes(n)) delete TP.sel[n]; }); }
      else if (d && d.error) flash(d.error, true);
    } catch (e) { flash('Could not load the bags: ' + e.message, true); }
    TP.loadingBags = false; renderItems(); renderBar();
  }
  const bagsSoon = () => { clearTimeout(TP.bagT); TP.bagT = setTimeout(() => loadBags(false), 500); };
  const allChars = () => { const out = []; ((TP.info && TP.info.parties) || []).forEach(p => p.members.forEach(m => { if (!out.some(x => x.name === m.name)) out.push(Object.assign({ party: p.leader }, m)); })); return out; };
  const receiverName = () => L().trReceiver(TP.receiver, TP.info && TP.info.clanLeader);

  // ======================================================================== page frame
  function section() {
    let s = $id(SEC); if (s) return s;
    s = document.createElement('section'); s.id = SEC; s.className = 'win cpl trd'; s.hidden = true;
    s.innerHTML = `<div class="cpl-headrow"><h2><img class="gi" src="${ico('icon/etc_adena_i00')}" alt=""> Trade / hand-over</h2>
        <span class="muted cpl-intro">Send characters or whole parties to the clan leader (or anyone) and hand over exactly what you tick. Worn gear, quest items and items the server does not let you trade are never offered; adena only with its own amount.</span></div>
      <div class="cpl-msg" id="trdMsg" role="status" hidden></div>
      <div class="box"><h3><span class="trd-n">1</span> Who gives</h3><div class="trd-hint">Tap a party name for the whole party, or single characters. The receiver never gives.</div><div id="trdGivers"></div></div>
      <div class="box"><h3><span class="trd-n">2</span> Who receives</h3><div id="trdRecv"></div></div>
      <div class="box"><h3><span class="trd-n">3</span> What</h3>
        <div id="trdPresets"></div>
        <div class="trd-quick" id="trdQuick" role="group" aria-label="quick select"></div>
        <div class="trd-search"><input id="trdQ" type="search" placeholder="Search items (name, category or item id)" aria-label="search items"><button data-trd="reload" title="Read the bags again from the game">↻ Bags</button><button data-trd="none" title="Untick everything">Clear</button></div>
        <div id="trdItems"></div>
        <div class="trd-adena" id="trdAdena"></div>
      </div>
      <div class="box"><h3>Hand-overs</h3><div class="trd-ord" id="trdOrders"></div></div>
      <details class="box cpl-help"><summary><h3>How it works</h3></summary><div class="cpl-helpbody">
        <p><b>Preview</b> reads the bags again and lists exactly what each giver hands over. <b>Start</b> saves the order (Logs/handover/&lt;id&gt;.json) and tells every giver and the receiver.</p>
        <p>Each giver stops what it does (never during a raid, Kamaloka or a mission — then it says so), goes to the receiver — same town: walks; another town: <code>.townname</code>; in the field: the same route planner as the return trip — asks him to stand still and trades its list in windows of ${TP.info ? TP.info.batch : 8} kinds. A window the server refuses is tried again item by item, so one forbidden item never blocks the rest. Each window is reported in party chat and in "What they do".</p>
        <p>A party leader who gives takes his party along on <code>.townname</code> (server follow). Members go alone and rejoin their party afterwards (return trip). The receiver accepts trades only from our own characters.</p>
        <p><b>Presets</b> store the receiver + categories / items / adena (Scripts/data/trade_presets.json). Applying one ticks the matching items in the loaded bags.</p>
      </div></details>
      <div class="trd-bar" id="trdBar"></div>`;
    (document.querySelector('main') || document.body).appendChild(s);
    s.addEventListener('click', onClick);
    s.addEventListener('change', onChange);
    s.addEventListener('input', onInput);
    return s;
  }
  function route(kind, arg) {
    if (kind === 'trade') { open(arg ? decodeURIComponent(arg) : ''); return true; }
    close(); return false;
  }
  function open(pre) {
    const s = section();
    try { stopChar(); } catch (e) { }
    try { TAB = 'trade'; } catch (e) { }
    try { [...$id('tabs').children].forEach(b => b.classList.toggle('on', b.dataset.tab === 'trade')); } catch (e) { }
    document.querySelectorAll('main > section').forEach(x => { if (x.id !== SEC) x.hidden = true; });
    const was = TP.open; s.hidden = false; TP.open = true;
    if (!was) { const g = store('givers'), r = store('receiver'); if (Array.isArray(g)) TP.givers = g; if (r) TP.receiver = r; window.scrollTo(0, 0); }
    TP.pre = pre || '';
    if (!TP.timer) TP.timer = setInterval(() => { if (TP.open && !document.hidden) pollOrders(); }, 5000);
    render();
    loadInfo().then(() => { if (TP.pre) applyPre(TP.pre); TP.pre = ''; if (TP.givers.length) loadBags(false); });
  }
  function close() {
    if (!TP.open) return;
    TP.open = false; clearInterval(TP.timer); TP.timer = 0;
    const s = $id(SEC); if (s) s.hidden = true;
  }
  function applyPre(pre) {
    const m = String(pre).match(/^(party|char|chars):(.+)$/); if (!m || !TP.info) return;
    if (m[1] === 'party') { const p = TP.info.parties.find(x => x.leader === m[2]); if (p) TP.givers = p.members.map(x => x.name).filter(n => n !== receiverName()); }
    else TP.givers = m[2].split(',').filter(n => allChars().some(c => c.name === n) && n !== receiverName());
    TP.sel = {}; TP.adena = {}; TP.quick = {};
    store('givers', TP.givers); render();
    try { history.replaceState(null, '', '#/trade'); } catch (e) { }
  }
  function flash(t, bad) {
    const m = $id('trdMsg'); if (!m) return;
    m.hidden = !t; m.className = 'cpl-msg' + (bad ? ' bad' : ''); m.textContent = t || '';
    clearTimeout(TP.msgT); TP.msgT = setTimeout(() => { const x = $id('trdMsg'); if (x) x.hidden = true; }, bad ? 14000 : 7000);
  }

  // ======================================================================== render
  function render() {
    if (!TP.open) return;
    renderGivers(); renderRecv(); renderPresets(); renderQuick(); renderItems(); renderBar(); renderOrders();
  }
  function renderGivers() {
    const el = $id('trdGivers'); if (!el) return;
    if (!TP.info) { el.innerHTML = '<div class="muted">Loading…</div>'; return; }
    const R = receiverName(), G = new Set(TP.givers);
    el.innerHTML = `<div class="trd-row" style="margin-bottom:6px"><button class="trd-chip" data-trd="everyone">Everyone</button><button class="trd-chip" data-trd="nobody">Nobody</button><span class="muted">${G.size} giver${G.size === 1 ? '' : 's'}</span></div>` +
      TP.info.parties.map(p => {
        const ms = p.members.filter(m => m.name !== R), all = ms.length && ms.every(m => G.has(m.name));
        return `<div class="trd-party"><div class="trd-ph"><button class="trd-chip ${all ? 'on' : ''}" data-trdparty="${h(p.leader)}" aria-pressed="${all}">Party ${h(p.leader)}</button><span class="muted">${ms.length} character${ms.length === 1 ? '' : 's'}</span></div>
          <div class="trd-row">${p.members.map(m => {
            const me = m.name === R;
            return `<button class="trd-chip ${G.has(m.name) ? 'on' : ''} ${me ? 'off' : ''}" ${me ? 'disabled title="the receiver"' : ''} data-trdchar="${h(m.name)}" aria-pressed="${G.has(m.name)}"><span class="dot ${m.online ? 'on' : ''}" title="${m.online ? 'online' : 'offline'}"></span>${h(m.name)}${m.level ? `<span class="lv">${m.level}</span>` : ''}${m.town ? `<span class="lv">· ${h(m.town)}</span>` : ''}${me ? '<span class="lv">(receiver)</span>' : ''}</button>`;
          }).join('')}</div></div>`;
      }).join('');
  }
  function renderRecv() {
    const el = $id('trdRecv'); if (!el || !TP.info) return;
    const CL = TP.info.clanLeader || '', R = receiverName(), c = allChars().find(x => x.name === R);
    const opts = `<option value="@clanleader" ${TP.receiver === '@clanleader' ? 'selected' : ''}>Clan leader${CL ? ' — ' + h(CL) : ' (unknown)'}</option>` +
      TP.info.parties.map(p => `<optgroup label="Party ${h(p.leader)}">${p.members.map(m => `<option value="${h(m.name)}" ${TP.receiver === m.name ? 'selected' : ''}>${h(m.name)}${m.level ? ' (' + m.level + ')' : ''}</option>`).join('')}</optgroup>`).join('');
    el.innerHTML = `<div class="trd-recv"><select id="trdRecvSel" aria-label="receiver">${opts}</select>
      <span class="muted">${c ? `${c.online ? 'online' : 'offline'}${c.town ? ' · in ' + h(c.town) : ' · in the field'}${c.task ? ' · ' + h(c.task) : ''}` : ''}</span></div>`;
  }
  function renderPresets() {
    const el = $id('trdPresets'); if (!el || !TP.info) return;
    const ps = TP.info.presets || [];
    el.innerHTML = `<div class="trd-pre"><select id="trdPreSel" aria-label="presets"><option value="">Presets…</option>${ps.map((p, i) => `<option value="${i}">${h(p.name)}${p.builtIn ? '' : ' ★'}</option>`).join('')}</select>
      <button data-trd="preapply">Apply</button><button data-trd="presave" title="Save the receiver + the ticked categories / items as a preset">Save as preset</button><button data-trd="predel" title="Delete the chosen saved preset">Delete</button></div>`;
  }
  function renderQuick() {
    const el = $id('trdQuick'); if (!el) return;
    const counts = L().trCatCounts(TP.bags);
    el.innerHTML = Object.keys(L().QUICK).map(k => {
      const q = L().QUICK[k], n = q.cats.reduce((a, c) => a + ((counts[c] && counts[c].kinds) || 0), 0);
      return `<button data-trdquick="${k}" class="${TP.quick[k] ? 'on' : ''}" aria-pressed="${!!TP.quick[k]}" title="${h(q.note || q.label)}" ${n ? '' : 'disabled'}>${h(q.label)} <span class="muted">${n}</span></button>`;
    }).join('');
  }
  function renderItems() {
    const el = $id('trdItems'); if (!el) return;
    if (!TP.givers.length) { el.innerHTML = '<div class="muted">Pick at least one giver above.</div>'; $id('trdAdena').innerHTML = ''; return; }
    if (TP.loadingBags && !Object.keys(TP.bags).length) { el.innerHTML = '<div class="muted">Reading the bags from the game…</div>'; return; }
    const src = TP.givers.map(n => { const b = TP.bags[n]; if (!b) return `${h(n)}: …`; if (!b.ok) return `<span class="bad">${h(n)}: ${h(b.err)}</span>`; return `${h(n)}: ${b.src === 'live' ? 'live' : 'report ' + Math.round((b.ageSec || 0) / 60) + ' min old'}`; });
    const many = TP.givers.length > 1, cats = L().TRADE_CATS, rows = [];
    TP.givers.forEach(n => ((TP.bags[n] && TP.bags[n].rows) || []).forEach(r => { if (L().trMatch(r, TP.q)) rows.push(Object.assign({ giver: n }, r)); }));
    const ok = rows.filter(r => r.ok), no = rows.filter(r => !r.ok);
    const itemRow = (r) => {
      const v = ((TP.sel[r.giver] || {})[r.objId]) || 0, on = v > 0;
      return `<div class="trd-it ${on ? 'on' : ''} ${r.ok ? '' : 'no'}"><input type="checkbox" ${on ? 'checked' : ''} ${r.ok ? '' : 'disabled'} data-trdtick="${h(r.giver)}|${r.objId}" aria-label="${h(r.name)}">
        <img src="${iIco(r.id)}" alt="" loading="lazy"><div class="nm">${r.enchant ? '+' + r.enchant + ' ' : ''}${h(r.name)}${many ? `<em>${h(r.giver)}</em>` : ''}${r.ok ? '' : `<span class="why">${h(r.why)}</span>`}</div>
        ${r.ok ? `<label class="ct">${r.count > 1 ? `<input type="number" inputmode="numeric" min="0" max="${r.count}" value="${on ? v : ''}" placeholder="${fmt(r.count)}" data-trdcount="${h(r.giver)}|${r.objId}" aria-label="how many ${h(r.name)}"> / ${fmt(r.count)}` : '1'}</label>` : `<span class="ct">${fmt(r.count)}</span>`}</div>`;
    };
    const opened = store('openCats') || {};
    let html = `<div class="trd-bagsrc">${src.join(' · ')}${TP.loadingBags ? ' · reading…' : ''}</div>`;
    cats.forEach(([k, label, icon]) => {
      const rs = ok.filter(r => r.cat === k); if (!rs.length) return;
      const nOn = rs.filter(r => ((TP.sel[r.giver] || {})[r.objId] || 0) > 0).length;
      html += `<details class="trd-cat" data-trdcat="${k}" ${opened[k] || TP.q ? 'open' : ''}><summary><img class="gi" src="${ico(icon)}" alt=""><span class="t">${h(label)}</span><span class="c">${nOn}/${rs.length}</span>
        <label onclick="event.stopPropagation()"><input type="checkbox" data-trdcatall="${k}" ${nOn === rs.length ? 'checked' : ''}> all</label></summary><div class="trd-items">${rs.map(itemRow).join('')}</div></details>`;
    });
    if (!ok.length) html += `<div class="muted">${TP.q ? 'Nothing matches the search.' : 'Nothing tradeable in these bags.'}</div>`;
    if (no.length) html += `<details class="trd-cat"><summary><img class="gi" src="${ico('icon/etc_question_mark_i00')}" alt=""><span class="t">Not tradeable here</span><span class="c">${no.length}</span></summary><div class="trd-items">${no.map(itemRow).join('')}</div></details>`;
    el.innerHTML = html;
    $id('trdAdena').innerHTML = TP.givers.map(n => { const b = TP.bags[n]; if (!b || !b.ok) return ''; return `<label><img class="gi" src="${ico('icon/etc_adena_i00')}" alt="" width="18" height="18"> Adena from ${h(n)} <input type="number" inputmode="numeric" min="0" max="${b.adena}" value="${TP.adena[n] || ''}" placeholder="0" data-trdadena="${h(n)}"> <span class="muted">of ${fmt(b.adena)}</span></label>`; }).join('');
    renderQuick();
  }
  function selCounts() {
    let kinds = 0, givers = 0, adena = 0;
    TP.givers.forEach(n => { const k = Object.values(TP.sel[n] || {}).filter(v => v > 0).length, a = Number(TP.adena[n] || 0); kinds += k; adena += a; if (k || a) givers++; });
    return { kinds, givers, adena };
  }
  function renderBar() {
    const el = $id('trdBar'); if (!el) return;
    const c = selCounts(), R = receiverName();
    el.innerHTML = `<div class="sum"><b>${c.kinds}</b> kind${c.kinds === 1 ? '' : 's'}${c.adena ? ` + <b>${fmt(c.adena)}</b> adena` : ''} from <b>${c.givers}</b> giver${c.givers === 1 ? '' : 's'} → <b>${h(R || '?')}</b></div>
      <div class="btns"><button data-trd="preview" ${c.kinds || c.adena ? '' : 'disabled'}>Preview + start…</button></div>`;
  }
  function renderOrders() {
    const el = $id('trdOrders'); if (!el) return;
    const os = (TP.info && TP.info.orders) || [];
    if (!os.length) { el.innerHTML = '<div class="muted">No hand-overs yet.</div>'; return; }
    el.innerHTML = os.map(o => {
      const st = TP.status && TP.status[o.id];
      const lines = st ? Object.keys(st.order.givers || {}).map(n => { const r = st.results[n] || {}, l = r.line || {}; const f = (r.failed || []).slice(0, 4).map(x => `${h(x.name)}: ${h(x.why)}`).join('; ');
        return `<div class="${/done/.test(l.state) ? 'done' : /failed/.test(l.state) ? 'failed' : 'working'}"><b>${h(n)}</b> — ${h(l.label || '')}${f ? `<div class="fl">failed: ${f}</div>` : ''}</div>`; }).join('') : '';
      return `<div class="trd-o"><div class="hd"><span><b>${h(o.givers.join(', '))}</b> → <b>${h(o.receiver)}</b> · ${o.kinds} kinds${o.preset ? ' · ' + h(o.preset) : ''} · <span class="muted">${h(String(o.at).slice(5, 16).replace('T', ' '))}</span></span>
        <span>${o.over ? `<span class="muted">${o.done}/${o.total} done${o.failed ? ', ' + o.failed + ' failed' : ''}</span>` : `<span class="muted">${o.done}/${o.total} done</span> <button data-trdstop="${h(o.id)}">Stop</button>`} <button data-trdshow="${h(o.id)}">${st ? 'Refresh' : 'Details'}</button></span></div>
        ${lines ? `<div class="st">${lines}</div>` : ''}</div>`;
    }).join('');
  }
  async function pollOrders() {
    if (!TP.info) return;
    const live = (TP.info.orders || []).filter(o => !o.over).map(o => o.id);
    if (TP.watch && !live.includes(TP.watch)) live.push(TP.watch);
    if (!live.length) return;
    TP.status = TP.status || {};
    for (const id of live.slice(0, 4)) { try { const s = await api('/api/trade/status?id=' + encodeURIComponent(id)); if (s && !s.error) TP.status[id] = s; } catch (e) { } }
    try { const d = await api('/api/trade/info'); if (d && !d.error) { TP.info.orders = d.orders; } } catch (e) { }
    renderOrders();
  }

  // ======================================================================== actions
  function setGivers(list) { const R = receiverName(); TP.givers = [...new Set(list)].filter(n => n && n !== R); store('givers', TP.givers); renderGivers(); renderBar(); bagsSoon(); }
  async function onClick(e) {
    const t = e.target.closest('button, [data-trdtick]'); if (!t) return;
    const d = t.dataset;
    if (d.trdchar) { const n = d.trdchar; setGivers(TP.givers.includes(n) ? TP.givers.filter(x => x !== n) : TP.givers.concat(n)); return; }
    if (d.trdparty) { const p = TP.info.parties.find(x => x.leader === d.trdparty); if (!p) return; const R = receiverName(), ms = p.members.map(m => m.name).filter(n => n !== R); const all = ms.every(n => TP.givers.includes(n)); setGivers(all ? TP.givers.filter(n => !ms.includes(n)) : TP.givers.concat(ms)); return; }
    if (d.trdquick) { const k = d.trdquick, on = !TP.quick[k]; TP.quick[k] = on; TP.sel = L().trQuick(TP.sel, TP.bags, k, on); renderItems(); renderBar(); return; }
    if (d.trdstop) { stopOrder(d.trdstop, t); return; }
    if (d.trdshow) { TP.watch = d.trdshow; pollOrders(); return; }
    switch (d.trd) {
      case 'everyone': setGivers(allChars().map(c => c.name)); return;
      case 'nobody': TP.sel = {}; TP.adena = {}; setGivers([]); return;
      case 'reload': loadBags(true); return;
      case 'none': TP.sel = {}; TP.adena = {}; TP.quick = {}; renderItems(); renderBar(); return;
      case 'preview': preview(t); return;
      case 'preapply': applyPreset(); return;
      case 'presave': savePreset(t); return;
      case 'predel': deletePreset(t); return;
    }
  }
  function onChange(e) {
    const t = e.target, d = t.dataset;
    if (t.id === 'trdRecvSel') { TP.receiver = t.value; store('receiver', TP.receiver); const R = receiverName(); if (TP.givers.includes(R)) setGivers(TP.givers); renderGivers(); renderRecv(); renderBar(); return; }
    if (d.trdtick) {
      const [n, o] = d.trdtick.split('|'), r = rowOf(n, o); if (!r) return;
      TP.sel[n] = TP.sel[n] || {}; if (t.checked) TP.sel[n][o] = r.count; else delete TP.sel[n][o];
      renderItems(); renderBar(); return;
    }
    if (d.trdcatall) {
      const k = d.trdcatall, C = new Set([k]); TP.sel = L().trSelectCats(TP.sel, TP.bags, [...C], t.checked); renderItems(); renderBar(); return;
    }
    if (d.trdcount || d.trdadena) { onInput(e); renderItems(); }
  }
  function onInput(e) {
    const t = e.target, d = t.dataset;
    if (t.id === 'trdQ') { TP.q = t.value; clearTimeout(TP.qT); TP.qT = setTimeout(renderItems, 200); return; }
    if (d.trdcount) {
      const [n, o] = d.trdcount.split('|'), r = rowOf(n, o); if (!r) return;
      let v = Math.floor(Number(t.value) || 0); v = Math.max(0, Math.min(r.count, v));
      TP.sel[n] = TP.sel[n] || {}; if (v > 0) TP.sel[n][o] = v; else delete TP.sel[n][o];
      const box = t.closest('.trd-it'); if (box) { box.classList.toggle('on', v > 0); const cb = box.querySelector('input[type=checkbox]'); if (cb) cb.checked = v > 0; }
      renderBar(); return;
    }
    if (d.trdadena) { const n = d.trdadena, b = TP.bags[n]; let v = Math.floor(Number(t.value) || 0); v = Math.max(0, Math.min(b ? b.adena : 0, v)); if (v) TP.adena[n] = v; else delete TP.adena[n]; renderBar(); }
  }
  document.addEventListener('toggle', (e) => { const det = e.target; if (!det || !det.dataset || !det.dataset.trdcat) return; const o = store('openCats') || {}; o[det.dataset.trdcat] = det.open; store('openCats', o); }, true);
  const rowOf = (n, o) => ((TP.bags[n] && TP.bags[n].rows) || []).find(r => String(r.objId) === String(o));

  async function preview(btn) {
    if (TP.busy) return; TP.busy = true; btn.disabled = true;
    try {
      const pv = await api('/api/trade/plan', { method: 'POST', body: JSON.stringify({ receiver: TP.receiver, sel: TP.sel, adena: TP.adena }) });
      if (!pv || pv.error) { await uiAlert({ title: 'Cannot plan this hand-over', body: (pv && pv.error) || 'no answer', kind: 'error' }); return; }
      if (!pv.givers.length) { await uiAlert({ title: 'Nothing to hand over', body: [uiP('None of the ticked items can be traded right now.')].concat(pv.problems.length ? [uiList(pv.problems)] : []), kind: 'info' }); return; }
      const R = pv.receiver, rc = allChars().find(c => c.name === R);
      const body = [uiP(uiEm(`${pv.total.givers} giver${pv.total.givers === 1 ? '' : 's'}`), ' → ', uiEm(R), rc ? ` (${rc.online ? 'online' : 'OFFLINE'}${rc.town ? ', in ' + rc.town : ', in the field'})` : '', ` — ${pv.total.kinds} kinds${pv.total.adena ? ' + ' + fmt(pv.total.adena) + ' adena' : ''}.`)];
      pv.givers.forEach(g => {
        body.push(uiH(`${g.name}: ${g.kinds} kind${g.kinds === 1 ? '' : 's'}${g.adena ? ' + ' + fmt(g.adena) + ' adena' : ''} · ${pv.batches[g.name] || 1} trade window${(pv.batches[g.name] || 1) === 1 ? '' : 's'}`));
        body.push(uiList(g.rows.map(r => `${r.enchant ? '+' + r.enchant + ' ' : ''}${r.name}${r.count > 1 ? ' x' + fmt(r.count) : ''}`).concat(g.adena ? [fmt(g.adena) + ' adena'] : [])));
        if (g.problems.length) body.push(uiWarn(g.problems.join('; ')));
      });
      if (pv.problems.length) body.push(uiWarn(pv.problems.join('; ')));
      if (rc && !rc.online) body.push(uiWarn(`${R} looks offline: the givers wait for him (up to 30 min) and then report failed.`));
      body.push(uiNote('Each giver stops what it is doing, travels to the receiver and trades. Never during a raid / Kamaloka / mission. You can stop it below.'));
      const ok = await uiConfirm({ title: 'Start this hand-over?', body, confirmText: 'Start hand-over', cancelText: 'Back' });
      if (!ok) return;
      const r = await api('/api/trade/order', { method: 'POST', body: JSON.stringify({ receiver: TP.receiver, sel: TP.sel, adena: TP.adena, confirm: true, preset: TP.presetName || '' }) });
      if (!r || r.error) { await uiAlert({ title: 'The hand-over did not start', body: (r && r.error) || 'no answer', kind: 'error' }); return; }
      const bad = ((r.sent && r.sent.sends) || []).filter(s => !s.ok);
      flash(`Hand-over ${r.id} started: ${Object.keys(r.order.givers).length} giver(s) → ${r.order.receiver}${bad.length ? ` — NOT reached: ${bad.map(s => s.to + ' (' + (s.error || '?') + ')').join(', ')}` : ''}`, bad.length > 0);
      TP.watch = r.id; TP.sel = {}; TP.adena = {}; TP.quick = {}; TP.presetName = '';
      await loadInfo(); pollOrders();
    } catch (e) { await uiAlert({ title: 'Error', body: String(e.message || e), kind: 'error' }); }
    finally { TP.busy = false; btn.disabled = false; renderBar(); }
  }
  async function stopOrder(id, btn) {
    const ok = await uiConfirm({ title: 'Stop this hand-over?', body: 'The givers stop after the trade window they are in and go back to what they did; what was traded stays traded.', confirmText: 'Stop it', cancelText: 'Keep going' });
    if (!ok) return;
    btn.disabled = true;
    const r = await api('/api/trade/stop', { method: 'POST', body: JSON.stringify({ id }) }).catch(e => ({ error: e.message }));
    flash(r && r.ok ? `Stop sent for ${id}` : `Stop failed: ${(r && r.error) || '?'}`, !(r && r.ok));
    TP.watch = id; pollOrders();
  }
  function curPreset() { const s = $id('trdPreSel'); const i = s && s.value !== '' ? Number(s.value) : -1; return i >= 0 ? (TP.info.presets || [])[i] : null; }
  async function applyPreset() {
    const p = curPreset(); if (!p) { flash('Choose a preset first.', true); return; }
    TP.receiver = p.receiver || '@clanleader'; store('receiver', TP.receiver);
    const R = receiverName(); if (TP.givers.includes(R)) TP.givers = TP.givers.filter(n => n !== R);
    if (!TP.givers.length) { flash(`Preset "${p.name}": now pick the givers — it ticks their matching items once the bags are loaded.`); TP.pendingPreset = p; render(); return; }
    if (TP.loadingBags) await new Promise(r => setTimeout(r, 1500));
    const a = L().trApplyPreset(p, TP.bags); TP.sel = a.sel; TP.adena = a.adena; TP.presetName = p.name; TP.quick = {};
    const n = Object.values(a.sel).reduce((s, m) => s + Object.keys(m).length, 0);
    flash(`Preset "${p.name}": ${n} kinds ticked${Object.keys(a.adena).length ? ' + adena' : ''} → ${R}`);
    render();
  }
  async function savePreset(btn) {
    const cats = Object.keys(TP.quick).filter(k => TP.quick[k]).reduce((a, k) => a.concat(L().QUICK[k].cats), []);
    const ids = []; TP.givers.forEach(n => Object.keys(TP.sel[n] || {}).forEach(o => { const r = rowOf(n, o); if (r && !cats.includes(r.cat) && !ids.includes(r.id)) ids.push(r.id); }));
    const adena = Math.max(0, ...Object.values(TP.adena).map(Number), 0);
    if (!cats.length && !ids.length && !adena) { flash('Tick a quick button, some items or adena first — the preset stores those.', true); return; }
    const name = await uiPrompt({ title: 'Save as preset', body: [uiP(`Receiver: ${TP.receiver === '@clanleader' ? 'the clan leader' : TP.receiver}`), uiP(`Categories: ${cats.length ? [...new Set(cats)].join(', ') : '—'} · single items: ${ids.length}${adena ? ' · adena ' + fmt(adena) + ' per giver' : ''}`)],
      label: 'Preset name', value: TP.presetName || '', placeholder: 'Raid loot to clan leader', validate: (v) => String(v || '').trim() ? '' : 'a name', confirmText: 'Save' });
    if (!name) return;
    const r = await api('/api/trade/presets', { method: 'POST', body: JSON.stringify({ action: 'save', preset: { name: name.trim(), receiver: TP.receiver, cats: [...new Set(cats)], ids, adena } }) });
    if (!r || r.error) { await uiAlert({ title: 'Not saved', body: (r && r.error) || '?', kind: 'error' }); return; }
    TP.info.presets = r.presets; TP.presetName = name.trim(); renderPresets(); flash(`Preset "${name.trim()}" saved.`);
  }
  async function deletePreset() {
    const p = curPreset(); if (!p) { flash('Choose a preset first.', true); return; }
    if (p.builtIn) { flash('Built-in presets cannot be deleted (save one with the same name to change it).', true); return; }
    const ok = await uiConfirm({ title: 'Delete preset?', body: `"${p.name}" is removed from Scripts/data/trade_presets.json.`, confirmText: 'Delete', danger: true });
    if (!ok) return;
    const r = await api('/api/trade/presets', { method: 'POST', body: JSON.stringify({ action: 'delete', name: p.name }) });
    if (r && r.presets) { TP.info.presets = r.presets; renderPresets(); flash(`Preset "${p.name}" deleted.`); } else flash((r && r.error) || 'not deleted', true);
  }
  // a preset chosen before the givers: tick once their bags are in
  const origLoad = loadBags;
  async function loadBagsWithPreset(fresh) { await origLoad(fresh); if (TP.pendingPreset && Object.keys(TP.bags).length) { const p = TP.pendingPreset; TP.pendingPreset = null; const a = L().trApplyPreset(p, TP.bags); TP.sel = a.sel; TP.adena = a.adena; TP.presetName = p.name; renderItems(); renderBar(); } }

  /** "Trade…" link for the party header / character page: target 'party:<leader>' | 'char:<name>' */
  function button(target, label) { return `<a class="ccsheetbtn trdbtn" href="#/trade/${encodeURIComponent(target)}" title="Hand items over (to the clan leader or anyone)"><img class="gi sm" src="${ico('icon/etc_adena_i00')}" alt="">${h(label || 'Trade…')}</a>`; }
  window.TradePage = { route, open, close, button, _tp: TP, _load: loadBagsWithPreset };
  // route the bag loads through the preset hook
  loadBags = loadBagsWithPreset; // eslint-disable-line no-func-assign
})();
