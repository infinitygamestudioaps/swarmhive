// MARKET page #/market (owner 2026-10-14: "There are plenty of shops in Giran, can we see everything they are selling?"): every player shop a bot
// scanned ("!market": walks the town streets to each private store, reads its list) — what they SELL, what they want to BUY, what they CRAFT, with
// prices. Search, filter, sort; "Scan now" sends !market to the character you pick (it must stand in a town). Data: /api/market (marketpage_api.js).
// Uses index.html globals: esc, api, iconUrl, TAB, stopChar, STATE; uidialog's uiConfirm / uiError.
(function () {
  'use strict';
  const SEC = 'tab-marketpage';
  const MK = { open: false, d: null, q: '', kind: 'sell', sort: 'name', town: '', timer: 0 };
  const $id = (i) => document.getElementById(i);
  const h = (s) => (typeof esc === 'function' ? esc(s) : String(s == null ? '' : s));
  const ico = (p) => (typeof iconUrl === 'function' ? iconUrl(p) : '/icons/' + p + '.png');
  const nf = (n) => Number(n || 0).toLocaleString();
  const ago = (iso) => { const m = Math.round((Date.now() - Date.parse(iso)) / 60000); return !isFinite(m) ? '?' : m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' d ago'; };
  function section() {
    let s = $id(SEC); if (s) return s;
    s = document.createElement('section'); s.id = SEC; s.className = 'win mkt'; s.hidden = true;
    s.innerHTML = `<div class="mkt-head"><h2><img class="gi" src="${ico('icon/etc_adena_i00')}" alt=""> Market <span class="muted" id="mkSub"></span></h2>
        <div class="mkt-scan"><label class="muted" for="mkWho">Who scans</label><select id="mkWho" aria-label="who scans"></select><button type="button" id="mkScan">Scan now</button></div></div>
      <div class="muted mkt-intro">Player shops in town, as a bot last saw them: it walks the streets to every private store and reads its list. Prices are per piece.</div>
      <div class="mkt-tools"><input type="search" id="mkQ" placeholder="Search an item or a shop…" aria-label="search">
        <div class="mkt-seg" role="tablist">${[['sell', 'Selling'], ['buy', 'Buying'], ['craft', 'Crafting'], ['shots', 'Shots B/A/S']].map(([k, t]) => `<button type="button" data-mkkind="${k}">${t}</button>`).join('')}</div>
        <select id="mkSort" aria-label="sort"><option value="name">Sort: name</option><option value="price">Sort: price (low first)</option><option value="priceDesc">Sort: price (high first)</option><option value="shop">Sort: shop</option></select>
        <select id="mkTown" aria-label="town"></select></div>
      <div id="mkList" class="mkt-list"></div>`;
    (document.querySelector('main') || document.body).appendChild(s);
    s.addEventListener('click', onClick);
    $id('mkQ').addEventListener('input', () => { MK.q = $id('mkQ').value; renderList(); });
    $id('mkSort').addEventListener('change', () => { MK.sort = $id('mkSort').value; renderList(); });
    $id('mkTown').addEventListener('change', () => { MK.town = $id('mkTown').value; renderList(); });
    return s;
  }
  function route(kind) { if (kind === 'market') { open(); return true; } close(); return false; }
  function open() {
    const s = section();
    try { stopChar(); } catch (e) { }
    try { TAB = 'market'; } catch (e) { }
    try { [...$id('tabs').children].forEach(b => b.classList.toggle('on', b.dataset.tab === 'market')); } catch (e) { }
    document.querySelectorAll('main > section').forEach(x => { if (x.id !== SEC) x.hidden = true; });
    s.hidden = false; MK.open = true;
    if (!MK.timer) MK.timer = setInterval(() => { if (MK.open && !document.hidden) load(); }, 30000);
    load();
  }
  function close() { if (!MK.open) return; MK.open = false; clearInterval(MK.timer); MK.timer = 0; const s = $id(SEC); if (s) s.hidden = true; }
  async function load() {
    let d = null; try { d = await api('/api/market'); } catch (e) { $id('mkList').innerHTML = '<div class="muted">The dashboard server has no Market API yet (it needs a restart).</div>'; return; }
    MK.d = d; render();
  }
  function render() {
    const T = (MK.d && MK.d.towns) || [];
    const ts = $id('mkTown'); const want = MK.town || (T[0] && T[0].town) || '';
    ts.innerHTML = T.map(t => `<option value="${h(t.town)}" ${t.town === want ? 'selected' : ''}>${h(t.town)} · ${t.shops.length} shops</option>`).join('') || '<option value="">no scan yet</option>';
    MK.town = want;
    fillWho();
    document.querySelectorAll('[data-mkkind]').forEach(b => b.classList.toggle('on', b.dataset.mkkind === MK.kind));
    renderList();
  }
  /** the "who scans" list: every character (the clan leader first / chosen by default); filled again until the character list has arrived */
  function fillWho() {
    const w = $id('mkWho'); if (!w) return;
    let S = null; try { S = typeof STATE !== 'undefined' ? STATE : null; } catch (e) { }
    const chars = (S && S.chars) || [], CL = (S && S.clanLeader) || '';
    if (!chars.length) { w.innerHTML = '<option value="">loading…</option>'; setTimeout(() => { if (MK.open) fillWho(); }, 1500); return; }
    if (w.options.length > 1 && w.dataset.n === String(chars.length)) return;   // keep the user's choice
    const cur = w.value || CL || chars[0].name;
    w.innerHTML = chars.slice().sort((a, b) => (b.name === CL) - (a.name === CL) || a.name.localeCompare(b.name)).map(c => `<option value="${h(c.name)}" ${c.name === cur ? 'selected' : ''}>${h(c.name)}${c.name === CL ? ' (clan leader)' : ''}${c.ageSec != null && c.ageSec <= 30 ? '' : ' (offline)'}</option>`).join('');
    w.dataset.n = String(chars.length);
  }
  function rows() {
    const t = ((MK.d && MK.d.towns) || []).find(x => x.town === MK.town); if (!t) return { t: null, R: [] };
    const q = MK.q.trim().toLowerCase(), R = [];
    t.shops.forEach(s => {
      const k = s.type === 'package' ? 'sell' : s.type;
      if (k !== MK.kind) return;
      if (k === 'craft') (s.recipes || []).forEach(r => R.push({ s, name: 'Recipe #' + r.recipeId, price: r.cost, count: null, icon: '' }));
      else (s.items || []).forEach(it => R.push({ s, name: it.name, id: it.id, icon: it.icon, price: it.price, count: it.count, enchant: it.enchant, grade: it.grade }));
    });
    const hit = (r) => !q || r.name.toLowerCase().includes(q) || String(r.s.owner).toLowerCase().includes(q) || String(r.s.msg || '').toLowerCase().includes(q);
    const out = R.filter(hit);
    out.sort(MK.sort === 'price' ? (a, b) => a.price - b.price : MK.sort === 'priceDesc' ? (a, b) => b.price - a.price : MK.sort === 'shop' ? (a, b) => String(a.s.owner).localeCompare(String(b.s.owner)) || a.name.localeCompare(b.name) : (a, b) => a.name.localeCompare(b.name) || a.price - b.price);
    return { t, R: out, all: R.length };
  }
  /** PSHOP-2026-10-15 ("Shots step 2"): the cheapest B / A / S shots in the newest Giran scan vs each party's max price (party settings -> Supplies) */
  function renderShots(el) {
    const nf = (n) => Number(n || 0).toLocaleString('en-US');   // 1,500 like the rest of the dashboard (not the browser locale)
    const S = MK.d && MK.d.shots;
    if (!S) { $id('mkSub').textContent = ''; el.innerHTML = '<div class="muted">This view needs a dashboard server restart.</div>'; return; }
    $id('mkSub').textContent = S.at ? `· Giran shots, scanned ${ago(S.at)}` : '· no Giran scan yet';
    const P = S.parties || [];
    const items = (S.items || []).map(it => {
      const best = it.offers[0];
      const chips = P.filter(p => p.max[it.id] > 0).map(p => {
        const okp = best && best.price <= p.max[it.id];
        return `<span class="mkt-chip ${!p.on ? 'off' : !best ? '' : okp ? 'ok' : 'bad'}" title="${h(!p.on ? 'switched off for this party' : !best ? 'none on offer in the last scan' : okp ? 'cheap enough: bought in its next supply run' : 'too expensive: not bought')}">${h(p.leader)}: max ${nf(p.max[it.id])}${!p.on ? ' (off)' : !best ? '' : okp ? ' ✓' : ' ✗'}</span>`;
      }).join('');
      const more = it.offers.slice(1).map(o => `${nf(o.price)} (${h(o.owner)})`).join(', ');
      return `<div class="mkt-shot"><div class="mkt-row"><img class="gi" src="${it.icon ? ico(it.icon) : ico(null)}" alt=""><span class="mkt-nm"><b>${h(it.name)}</b><small>${best ? `cheapest at ${h(best.owner)} (×${nf(best.count)})${more ? ' · next: ' + more : ''} · ${it.shops} offer(s)` : 'not on offer in the last scan'}</small></span><span class="mkt-p">${best ? nf(best.price) + ' <small>adena</small>' : '—'}</span></div>${chips ? `<div class="mkt-chips">${chips}</div>` : ''}</div>`;
    }).join('');
    const last = (S.last || []).map(l => `<div><b>${h(l.leader)}</b> · ${ago(l.at)}: ${h(l.text)}${l.warn.length ? ' — <span class="muted">' + h(l.warn.join('; ')) + '</span>' : ''}</div>`).join('');
    el.innerHTML = `<div class="muted mkt-shots-intro">The cheapest B / A / S shots in Giran's player shops (the newest scan), against the max price each party set (party ⚙ Settings → Supplies → Buy shots from player shops). ✓ = cheap enough, bought in that party's next supply run; ✗ = too expensive, not bought. ${P.length ? '' : 'No party has set max prices yet.'}</div>
      ${items}
      ${last ? `<div class="mkt-last"><b>Last purchases from player shops</b>${last}</div>` : ''}`;
  }
  function renderList() {
    const el = $id('mkList'); if (!el) return;
    if (MK.kind === 'shots') { renderShots(el); return; }   // PSHOP-2026-10-15
    const { t, R, all } = rows();
    $id('mkSub').textContent = t ? `· ${t.town}: ${t.shops.length} shops, scanned ${ago(t.at)} by ${t.by}` : '';
    if (!t) { el.innerHTML = '<div class="muted">No scan yet. Pick a character that stands in a town and press <b>Scan now</b>.</div>'; return; }
    const unread = t.shops.filter(s => !s.read).length;
    el.innerHTML = (R.length ? R.map(r => `<div class="mkt-row"><img class="gi" src="${r.icon ? ico(r.icon) : ico(null)}" alt=""><span class="mkt-nm"><b>${r.enchant ? '+' + r.enchant + ' ' : ''}${h(r.name)}</b><small>${h(r.s.owner)}${r.s.msg ? ' · “' + h(r.s.msg) + '”' : ''}</small></span><span class="mkt-c">${r.count != null ? (MK.kind === 'buy' ? 'wants ' : '×') + nf(r.count) : ''}</span><span class="mkt-p">${nf(r.price)} <small>adena</small></span></div>`).join('')
      : `<div class="muted">${all ? 'Nothing matches.' : 'No shop of this kind.'}</div>`) + (unread ? `<div class="muted mkt-foot">${unread} shop(s) could not be read (the owner left, or it did not answer) — scan again.</div>` : '');
  }
  async function onClick(e) {
    const k = e.target.closest('[data-mkkind]'); if (k) { MK.kind = k.dataset.mkkind; render(); return; }
    if (e.target.closest('#mkScan')) {
      const who = $id('mkWho').value; if (!who) { await uiError('Pick the character that scans (the list next to the button) — it must stand in a town.', 'Nobody picked'); fillWho(); return; }
      if (!(await uiConfirm({ title: `Scan the shops with ${who}?`, body: [`${who} walks the town's streets to every player shop it sees, opens each one and records what it sells, buys or crafts. It must stand in a town (Giran: the market). It stops what it is doing for this and goes back to it afterwards.`], confirmText: 'Scan now', cancelText: 'Cancel' }))) return;
      try { const d = await api('/api/command', { method: 'POST', body: JSON.stringify({ cmd: '!market ' + who, targets: ['char:' + who] }) }); if (!d || d.error) { await uiError((d && d.error) || 'no answer'); return; } } catch (er) { await uiError(er.message); return; }
      $id('mkSub').textContent = `· ${who}: scanning… (the list updates when it is done)`;
    }
  }
  window.MarketPage = { route, open, close, _state: MK };
})();
