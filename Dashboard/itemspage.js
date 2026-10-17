// ITEMS page #/items[/<Name>] (ITEMS-2026-10-17; owner: "a general page where I can select any character, see the inventory or the clan
// warehouse, whatever they have available ... select any item ... see what is for sale in Giran ... buy a Homunkulus's Sword enchanted to X ...
// put an SA on it (Acumen) ... give it to this character (its party returns to town, it swaps its current piece) ... success rates and what is
// gained ... icons big and understandable, very very user friendly").
// 1) pick a character (big class icons)  2) pick a place: Bag / Warehouse / Clan warehouse / Giran shops  3) tap an item (big icons)
// 4) the sheet: Enchant to +N (chance per level, gain), Special Ability (cost, what is missing), Give to (wears it) -> the plan in plain words ->
//    "Do it" -> the job runs in the game (swarm.js ITEMJOB), its steps show live here.
// Data: /api/items/* (Dashboard/itemspage_api.js). Rules: /itemslogic.js. Uses index.html globals: api, iconUrl, classIcon, stopChar, TAB;
// uidialog: uiConfirm, uiP, uiNote, uiError; UIKit.toast. No browser alert / confirm / prompt.
(function () {
  'use strict';
  const SEC = 'tab-items';
  const S = { open: false, name: '', chars: null, d: null, shops: null, place: 'bag', filter: 'all', q: '', sel: null, want: { to: 0, blessed: false, saId: 0, giveTo: '' }, plan: null, planT: 0, job: null, poll: 0, msgT: 0, cq: '' };
  const $id = (i) => document.getElementById(i);
  const h = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ico = (p) => typeof iconUrl === 'function' ? iconUrl(p) : '/icons/' + p + '.png';
  const L = () => window.ItemsLogic;
  const gim = (p, c) => `<img class="gim${c ? ' ' + c : ''}" src="${ico(p)}" alt="">`;   // in-game icons only (owner 2026-10-17)
  const kmb = (n) => L() ? L().kmb(n) : String(n);
  const PLACES = [['bag', 'L2UI_CT1/crop/Icon_DF_MenuWnd_Inventory', 'Bag'], ['wh', 'icon/etc_equip_item_box_i01', 'Warehouse'], ['clan', 'icon/accessory_pledge_cap1_i00', 'Clan warehouse'], ['shop', 'icon/etc_adena_i00', 'Giran shops']];
  const FILTERS = [['all', 'All'], ['weapon', 'Weapons'], ['armor', 'Armor'], ['jewel', 'Jewels'], ['scroll', 'Scrolls'], ['mat', 'Materials'], ['other', 'Other']];
  const GRADE_COLOR = { NONE: '#9a9a9a', D: '#5aa0ff', C: '#55c271', B: '#d6b64a', A: '#e2873c', S: '#e24c4c', S80: '#e24c4c', S84: '#e24c4c' };

  // ============================================================================================ data
  async function loadChars() { try { const d = await api('/api/items/chars'); if (d && !d.error) S.chars = d; } catch (e) { } render(); }
  async function loadChar(fresh) {
    if (!S.name) return;
    let d = null; try { d = await api('/api/items/char?name=' + encodeURIComponent(S.name) + (fresh ? '&fresh=1' : '')); } catch (e) { d = { error: e.message }; }
    if (!d || d.error) { flash((d && d.error) || 'The dashboard server has no items API yet (it needs a restart).', true); S.d = null; render(); return; }
    S.d = d; render(); loadLog();
  }
  async function loadShops() { if (S.shops) return; try { const d = await api('/api/items/shops'); if (d && !d.error) S.shops = d; } catch (e) { } render(); }

  // ============================================================================================ frame + routing
  function section() {
    let s = $id(SEC); if (s) return s;
    s = document.createElement('section'); s.id = SEC; s.className = 'win itp'; s.hidden = true;
    s.innerHTML = `<div class="itp-head"><h2><img class="gi" src="${ico('icon/etc_equip_item_box_i00')}" alt=""> Items</h2><a href="#/crafting" class="itp-link"><img class="gim" src="${ico('icon/skill0172')}" alt=""> Crafting →</a></div>
      <div class="itp-msg" id="itpMsg" role="status" hidden></div>
      <div id="itpChars"></div><div id="itpBody"></div><div id="itpSheet"></div>`;
    (document.querySelector('main') || document.body).appendChild(s);
    s.addEventListener('click', onClick); s.addEventListener('input', onInput); s.addEventListener('change', onInput);
    return s;
  }
  function route(kind, arg) { if (kind === 'items') { open(arg ? decodeURIComponent(arg) : ''); return true; } close(); return false; }
  function open(name) {
    const s = section();
    try { stopChar(); } catch (e) { }
    try { TAB = 'items'; [...$id('tabs').children].forEach(b => b.classList.toggle('on', b.dataset.tab === 'items')); } catch (e) { }
    document.querySelectorAll('main > section').forEach(x => { if (x.id !== SEC) x.hidden = true; });
    s.hidden = false; S.open = true;
    if (name !== S.name) { S.name = name; S.d = null; S.sel = null; S.plan = null; }
    render(); if (!S.chars) loadChars(); if (name) loadChar(false);
    setTimeout(() => { try { if (s.getBoundingClientRect().top > 40) s.scrollIntoView({ block: 'start' }); } catch (e) { } }, 300);
  }
  function close() { if (!S.open) return; S.open = false; clearInterval(S.poll); const s = $id(SEC); if (s) s.hidden = true; }
  function flash(t, bad) { const m = $id('itpMsg'); if (!m) return; m.hidden = !t; m.className = 'itp-msg' + (bad ? ' bad' : ''); m.textContent = t || ''; clearTimeout(S.msgT); S.msgT = setTimeout(() => { const x = $id('itpMsg'); if (x) x.hidden = true; }, bad ? 15000 : 7000); }

  // ============================================================================================ render
  const cat = (r) => r.kind === 'weapon' ? 'weapon' : r.kind === 'jewel' ? 'jewel' : r.kind === 'armor' ? 'armor' : /^(Blessed )?Scroll: Enchant/.test(r.name) ? 'scroll' : /Gemstone|Crystal|Soul Crystal|Stem|Thread|Leather|Iron Ore|Coal|Charcoal|Varnish|Suede|Steel|Mithril|Oriharukon|Animal|Braided|Cokes|Compound|Enria|Asofe|Thons|Synthetic|Mold|Artisan|Blade|Head|Gemstone|Frame|Part|Fragment|Design|Recipe/i.test(r.name) ? 'mat' : 'other';
  function tile(r, i) {
    const g = r.grade && r.grade !== 'NONE' ? `<span class="itp-g" style="background:${GRADE_COLOR[r.grade] || '#777'}">${h(r.grade)}</span>` : '';
    return `<button type="button" class="itp-tile${r.eq ? ' worn' : ''}" data-itsel="${i}" title="${h(r.name)}"><span class="itp-ic"><img src="${ico(r.icon)}" alt="" loading="lazy">${r.enchant ? `<b class="itp-en">+${r.enchant}</b>` : ''}${r.count > 1 ? `<b class="itp-n">${kmb(r.count)}</b>` : ''}</span>
      <span class="itp-nm">${h(r.name)}</span><span class="itp-sub">${g}${r.eq ? '<span class="itp-worn">worn</span>' : ''}${r.src === 'shop' ? (r.cost ? '<span class="itp-exch">exchange</span>' : `<span class="itp-price">${kmb(r.price)}</span>`) : ''}${r.sa ? `<span class="itp-sa">SA</span>` : ''}${(r.src === 'wh' || r.src === 'clan') && (r.enchant || 0) > 4 ? `<span class="itp-lock">${(r.enchant || 0) >= 10 ? 'rare: only by your pick' : 'above +4: asks first'}</span>` : ''}</span></button>`;
  }
  function placeRows() {
    const d = S.d; if (!d) return [];
    if (S.place === 'shop') return S.shops ? [].concat(...S.shops.shops.map(s => s.rows)) : [];
    const ord = { weapon: 0, armor: 1, jewel: 2 };
    return (d[S.place] || []).slice().sort((a, b) => (b.eq ? 1 : 0) - (a.eq ? 1 : 0) || (ord[a.kind] != null ? ord[a.kind] : 9) - (ord[b.kind] != null ? ord[b.kind] : 9) || String(a.name).localeCompare(String(b.name)));
  }
  function render() {
    if (!S.open) return; section();
    // characters
    const C = (S.chars && S.chars.chars) || [], q = S.cq.toLowerCase();
    const list = C.filter(c => !q || c.name.toLowerCase().includes(q) || String(c.party).toLowerCase().includes(q));
    $id('itpChars').innerHTML = `<div class="itp-step"><span class="itp-num">1</span> Who? ${S.name ? `<b>${h(S.name)}</b> <button type="button" class="itp-link" data-itchange="1">change</button>` : ''}</div>` +
      (!S.name || S.pickChar ? `<input type="search" class="itp-search" id="itpCq" placeholder="Search a character or party…" value="${h(S.cq)}"><div class="itp-chars">${list.map(c => `<button type="button" class="itp-char${c.name === S.name ? ' on' : ''}" data-itchar="${h(c.name)}">${typeof classIcon === 'function' ? classIcon({ name: c.name, classId: c.classId, cls: c.cls }) : ''}<b>${h(c.name)}</b><span>${c.level ? 'lvl ' + h(c.level) : ''}${c.clanLeader ? ' · ' + gim('icon/accessory_pledge_cap1_i00') + ' clan leader' : ''}${c.crafter ? ' · ' + gim('icon/skill0172') + ' crafter' : ''}${c.online ? '' : ' · offline'}</span></button>`).join('') || '<div class="muted">Loading…</div>'}</div>` : '');
    if (!S.name || S.pickChar) { $id('itpBody').innerHTML = ''; $id('itpSheet').innerHTML = ''; return; }
    const d = S.d;
    if (!d) { $id('itpBody').innerHTML = '<div class="muted">Loading…</div>'; return; }
    const counts = { bag: d.bag.length, wh: d.wh.length, clan: d.clan.length, shop: S.shops ? S.shops.shops.reduce((n, s) => n + s.rows.length, 0) : '…' };
    const rows = placeRows().map((r, i) => Object.assign({ _i: i }, r)).filter(r => (S.filter === 'all' || cat(r) === S.filter) && (!S.q || r.name.toLowerCase().includes(S.q.toLowerCase())));
    let note = '';
    if (S.place === 'wh') note = d.whSeen ? `Seen ${h(new Date(d.whSeen).toLocaleString())}.` : `Nobody has looked into ${h(S.name)}'s warehouse yet.`;
    if (S.place === 'wh') note += ` <button type="button" class="itp-btn2" data-itlook="1">${gim('icon/etc_equip_item_box_i01')} Look now (${h(S.name)} walks to the warehouse)</button>`;
    if (S.place === 'clan') note = `${d.clanSeen ? `Seen ${h(new Date(d.clanSeen).toLocaleString())} by ${h(d.clanSeenBy)}.` : 'Not looked at yet.'} ${d.isClanLeader ? '' : `Only the clan leader (${h(d.clanLeader || '?')}) can take things out — he hands them to ${h(S.name)}.`}`;
    if (S.place === 'bag') note = `${h(kmb(d.adena))} adena · ${d.bagSrc === 'live' ? 'live' : 'last report'}${d.bagErr ? ' · ' + h(d.bagErr) : ''} <button type="button" class="itp-btn2" data-itfresh="1">Refresh</button>`;
    if (S.place === 'shop') note = 'What Giran\'s merchants sell (prices before the castle tax, about +20 %). "Common Item" = cheap, no set bonus, cannot be enchanted.';
    $id('itpBody').innerHTML = `<div class="itp-step"><span class="itp-num">2</span> Where?</div>
      <div class="itp-places">${PLACES.map(([k, e, t]) => `<button type="button" class="itp-place${S.place === k ? ' on' : ''}" data-itplace="${k}"><span class="itp-e">${gim(e, 'big')}</span><b>${t}</b><span>${counts[k]}</span></button>`).join('')}</div>
      <div class="itp-note">${note}</div>
      <div class="itp-step"><span class="itp-num">3</span> Tap an item</div>
      <div class="itp-filters">${FILTERS.map(([k, t]) => `<button type="button" class="itp-chip${S.filter === k ? ' on' : ''}" data-itfilter="${k}">${t}</button>`).join('')}<input type="search" class="itp-search" id="itpQ" placeholder="Search…" value="${h(S.q)}"></div>
      <div class="itp-grid">${rows.slice(0, 300).map(r => tile(r, r._i)).join('') || '<div class="muted">Nothing here.</div>'}</div>
      ${(d.jobs || []).length ? `<div class="itp-step">Recent jobs</div>${d.jobs.map(j => jobLine(j)).join('')}` : ''}
      <div class="itp-step">${gim('L2UI_CT1/crop/Icon_DF_MenuWnd_Quest')} What happened <label class="itp-check" style="margin:0 0 0 auto;font-weight:400"><input type="checkbox" data-itlogall="1"${S.logAll ? ' checked' : ''}> every character</label></div><div id="itpLog" class="itp-log">${logHtml()}</div>`;
    renderSheet();
  }
  function logHtml() { const L2 = S.log; if (!L2) return '<div class="muted">Loading…</div>'; if (!L2.length) return '<div class="muted">Nothing yet.</div>'; return L2.map(l => `<div class="itp-logl"><span class="muted">${h(new Date(l.t).toLocaleString())}</span> <b>${h(l.who)}</b> <span class="itp-logk">${h(l.kind)}</span> ${h(l.text)}</div>`).join(''); }
  async function loadLog() { if (!S.open || !S.name) return; try { const d = await api('/api/items/log?n=150' + (S.logAll ? '' : '&name=' + encodeURIComponent(S.name))); if (d && !d.error) { S.log = d.lines; const el = $id('itpLog'); if (el) el.innerHTML = logHtml(); } } catch (e) { } }
  setInterval(() => { if (S.open && !document.hidden) loadLog(); }, 8000);
  function jobLine(j) { const st = j.status || {}; return `<div class="itp-job ${st.state || ''}"><b>${h(j.name)}</b> <span class="muted">by ${h(j.doer)} · ${h(new Date(j.created).toLocaleString())}</span><div>${h(st.state === 'done' ? '✓ ' + (st.result || 'done') : st.state === 'failed' ? '✗ ' + (st.result || 'failed') : st.step ? '… ' + st.step : 'waiting for ' + j.doer)}</div></div>`; }

  // ============================================================================================ the item sheet
  function renderSheet() {
    const el = $id('itpSheet'); if (!el) return;
    if (!S.sel) { el.innerHTML = ''; return; }
    const r = S.sel, P = S.plan, W = S.want, LG = L();
    const canEnch = r.kind && r.grade !== 'NONE' && !r.common;
    const cur = r.src === 'shop' ? 0 : (r.enchant || 0);
    const lad = canEnch && LG ? LG.ladder(cur, Math.max(cur, W.to || cur), r.kind, r.full, P && P.rates) : [];
    const sas = P && P.saOptions && P.saOptions.length ? P.saOptions : null;
    const C = (S.chars && S.chars.chars) || [];
    el.innerHTML = `<div class="itp-ov" data-itclose="1"></div><div class="itp-sheet" role="dialog" aria-label="${h(r.name)}">
      <div class="itp-sh-head"><span class="itp-ic big"><img src="${ico(r.icon)}" alt="">${cur ? `<b class="itp-en">+${cur}</b>` : ''}</span>
        <div><h3>${h(r.name)}</h3><div class="muted">${h(r.grade && r.grade !== 'NONE' ? r.grade + '-grade ' : '')}${h(r.kind || r.type || '')}${r.src === 'shop' ? ' · ' + h(r.npc) + (r.cost ? '' : ' · ' + kmb(r.price) + ' adena') : r.src === 'bag' ? (r.eq ? ' · worn' : ' · in the bag') : r.src === 'wh' ? ' · warehouse' : ' · clan warehouse'}${r.sa ? ' · SA: ' + h(r.sa) : ''}</div></div>
        <button type="button" class="itp-x" data-itclose="1" aria-label="Close">×</button></div>
      ${r.cost ? `<div class="itp-sec"><div class="itp-sec-t">${gim('icon/etc_exchange_box_i00')} ${h(r.npc)} exchanges it for</div><div class="itp-costs">${r.cost.map(c => `<span class="itp-cost">${c.icon ? `<img src="${ico(c.icon)}" alt="">` : ''}${(c.count * (S.want.count || 1)).toLocaleString('en-US')}× ${h(c.name)}${c.enchant ? ' +' + c.enchant : ''}</span>`).join('')}</div></div>` : ''}
      ${!r.kind && r.src === 'shop' ? `<div class="itp-sec"><label class="itp-check">How many <input type="number" min="1" max="100000" value="${S.want.count || 1}" data-itcount="1" style="width:110px;font-size:1.1em;padding:8px"></label></div>` : ''}
      ${canEnch ? `<div class="itp-sec"><div class="itp-sec-t">${gim('icon/etc_scroll_of_enchant_weapon_i02')} Enchant to</div>
        <div class="itp-plus">${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 16].filter(n => n === 0 || n > cur).map(n => `<button type="button" class="itp-pl${(W.to || 0) === n ? ' on' : ''}" data-itto="${n}">${n === 0 ? 'no' : '+' + n}</button>`).join('')}</div>
        ${W.to > cur ? `<label class="itp-check"><input type="checkbox" data-itblessed="1"${W.blessed ? ' checked' : ''}> Blessed scroll (a fail drops it to +0 instead of destroying it)</label>
          <div class="itp-ladder">${lad.map(s => `<div class="itp-lv"><span>+${s.to}</span><span class="itp-bar"><i style="width:${Math.round(s.total * 100)}%;background:${s.safe ? '#3fa35a' : s.total > 0.5 ? '#c9a23a' : '#c0503f'}"></i></span><span>${s.safe ? 'safe' : LG.pct(s.chance) + ' → ' + LG.pct(s.total)}</span></div>`).join('')}</div>
          <div class="itp-big">Chance to reach +${W.to}: <b>${LG.pct(lad.length ? lad[lad.length - 1].total : 1)}</b>${P && P.gain ? ` · gain ${h(P.gain.text)}` : ''}</div>
          <div class="muted">${P && P.rates && P.rates.estimate ? `Rates are an estimate (${P.rates.weapon} % per try above the safe +${P.rates.safe}); set the real ones in Scripts/data/enchant_rates.json.` : ''}</div>` : ''}</div>` : r.common ? '<div class="itp-sec muted">Common items cannot be enchanted or get a Special Ability.</div>' : ''}
      ${sas ? `<div class="itp-sec"><div class="itp-sec-t">${gim('icon/etc_soul_stone_i00')} Special Ability</div><div class="itp-sas"><button type="button" class="itp-saopt${!W.saId ? ' on' : ''}" data-itsa="0"><b>none</b></button>${sas.map(o => `<button type="button" class="itp-saopt${W.saId === o.saId ? ' on' : ''}" data-itsa="${o.saId}"><span class="itp-dot" style="background:${o.color === 'red' ? '#d9534f' : o.color === 'green' ? '#4caf50' : '#4a90e2'}"></span><b>${h(o.sa)}</b><span>${h(o.color)} crystal stage ${o.stage} · ${o.gem ? o.gem.count + ' ' + h(o.gem.name) : ''} · ${kmb(o.adena)} adena</span></button>`).join('')}</div></div>` : ''}
      <div class="itp-sec"><div class="itp-sec-t">${gim('L2UI_CT1/crop/Icon_DF_MenuWnd_Clan')} Give to (and wear it)</div><select data-itgive="1" class="itp-sel"><option value="">— keep it with ${h(S.name)} —</option>${C.map(c => `<option value="${h(c.name)}"${W.giveTo === c.name ? ' selected' : ''}>${h(c.name)}${c.level ? ' (lvl ' + c.level + ')' : ''}${c.name === S.name ? ' — wear it myself' : ''}</option>`).join('')}</select></div>
      ${P && P.alsoHave && P.alsoHave.length ? `<div class="itp-sec"><div class="itp-sec-t">${gim('icon/etc_equip_item_box_i01')} You already have it</div><div class="itp-sas">${P.alsoHave.map((x, i) => `<button type="button" class="itp-saopt" data-itusehave="${i}"><b>+${x.enchant} ${h(r.name)}</b>${x.overSafe ? ` <span class="itp-lock">${x.rare ? 'rare: only by your pick' : 'above +4: asks first'}</span>` : ''}<span>${{ bag: 'in ' + h(S.name) + "'s bag" + (x.eq ? ' (worn)' : ''), wh: 'in ' + h(S.name) + "'s warehouse", clan: 'in the clan warehouse' }[x.src]} — use this one</span></button>`).join('')}</div></div>` : ''}
      ${P && P.overSafe && P.overSafe.length ? `<div class="itp-sec itp-danger"><div class="itp-sec-t">Above the safe limit</div>${P.overSafe.map(t => `<div>${h(t)}</div>`).join('')}<label class="itp-check"><input type="checkbox" data-itoversafe="1"${S.want.overSafeOk ? ' checked' : ''}> I understand the risk and want this anyway</label></div>` : ''}
      <div class="itp-sec" id="itpPlan">${planHtml()}</div>
      <div class="itp-actions">${P && !P.error && !P.ok ? `<div class="itp-why">Can't start yet: ${(P.missing || []).length ? 'missing ' + P.missing.map(m => `${m.missing}× ${h(m.what)}`).join(', ') : P.adena > P.haveAdena ? `needs about ${kmb(P.adena)} adena (${h(S.name)} has ${kmb(P.haveAdena)})` : 'choose what to do'}.</div>` : ''}<button type="button" class="itp-go" data-itgo="1" ${P && P.ok && !S.job ? '' : 'disabled'}>${S.job ? 'Running…' : 'Do it'}</button></div>
      <div id="itpJob">${S.job ? jobHtml() : ''}</div></div>`;
  }
  function planHtml() {
    const P = S.plan; if (!P) return '<div class="muted">Working out the plan…</div>';
    if (P.error) return `<div class="itp-bad">${h(P.error)}</div>`;
    const SRC = { bag: 'the bag', wh: 'my warehouse', clan: 'the clan warehouse', buy: 'buying it' };
    const need = (P.needs || []).map(n => { const o = n.options || {}, ch = (S.want.sources || {})[n.id] || n.choice || '';
      const opts = n.ask ? [o.wh > 0 ? ['wh', `My warehouse (${kmb(o.wh)})`] : null, o.clan > 0 ? ['clan', `Clan warehouse (${kmb(o.clan)})`] : null, o.buy ? ['buy', o.buy.kind === 'shop' ? `Buy at ${o.buy.npc} (${kmb(o.buy.price)} each)` : `Exchange at ${o.buy.npc} (${(o.buy.cost || []).map(c => kmb(c.count) + '× ' + c.name).join(' + ')})`] : null].filter(Boolean) : [];
      return `<div class="itp-need ${n.missing ? 'miss' : 'ok'}">${n.missing ? '✗' : '✓'} <b>${h(n.need)}× ${h(n.what)}</b> <span class="muted">${['bag', 'wh', 'clan', 'buy'].filter(k => n.from[k]).map(k => kmb(n.from[k]) + (k === 'buy' ? ' bought' : ' from ' + SRC[k])).join(', ')}${n.missing ? ` — <b>${kmb(n.missing)} still needed</b>` : ''}</span>${opts.length ? `<div class="itp-srcs">${opts.map(([k, t]) => `<button type="button" class="itp-src${ch === k ? ' on' : ''}" data-itsrc="${n.id}|${k}">${h(t)}</button>`).join('')}${ch ? `<button type="button" class="itp-src" data-itsrc="${n.id}|">none</button>` : ''}</div>` : n.ask ? '<div class="muted">Nobody has it and no Giran NPC sells it.</div>' : ''}</div>`; }).join('');
    return `<div class="itp-sec-t">${gim('L2UI_CT1/crop/Icon_DF_MenuWnd_Quest')} What happens</div><ol class="itp-steps">${(P.steps || []).map(s => `<li>${h(s.text)}</li>`).join('') || '<li class="muted">Choose what to do above.</li>'}</ol>${need}
      ${P.adena ? `<div class="itp-need ${P.adena > P.haveAdena ? 'miss' : 'ok'}">${P.adena > P.haveAdena ? '✗' : '✓'} about <b>${kmb(P.adena)} adena</b> <span class="muted">(${h(S.name)} has ${kmb(P.haveAdena)})</span></div>` : ''}
      ${(P.warn || []).map(w => `<div class="itp-warn">${h(w)}</div>`).join('')}`;
  }
  function jobHtml() { const J = S.job, st = J.status || {}; return `<div class="itp-jobbox ${st.state || ''}"><b>${st.state === 'done' ? '✓ Done' : st.state === 'failed' ? '✗ Stopped' : 'In the game…'}</b>${st.result ? ' — ' + h(st.result) : ''}<ol>${(st.steps || []).map(s => `<li>${h(s.t ? new Date(s.t).toLocaleTimeString() + ' ' : '')}${s.who ? '<b>' + h(s.who) + '</b> ' : ''}${h(s.msg)}${s.adena != null ? ` <span class="muted">· ${kmb(s.adena)} adena${s.town ? ' · ' + h(s.town) : ''}</span>` : ''}</li>`).join('') || `<li>waiting for ${h(J.doer || S.name)} to start…</li>`}</ol></div>`; }
  async function replan() {
    clearTimeout(S.planT);
    S.planT = setTimeout(async () => {
      const r = S.sel; if (!r) return;
      let P = null; try { P = await api('/api/items/plan', { method: 'POST', body: JSON.stringify(body()) }); } catch (e) { P = { error: e.message }; }
      S.plan = P; renderSheet();
    }, 250);
  }
  const body = () => { const r = S.sel; return { name: S.name, count: S.want.count || 1, sources: S.want.sources || {}, overSafeOk: !!S.want.overSafeOk, item: { src: r.src, id: r.id, objId: r.objId || 0, enchant: r.src === 'shop' ? 0 : (r.enchant || 0), offer: r.offer || null }, enchantTo: S.want.to || 0, blessed: !!S.want.blessed, saId: S.want.saId || 0, giveTo: S.want.giveTo || '' }; };
  async function go() {
    const P = S.plan; if (!P || !P.ok) return;
    const ok = await uiConfirm({ title: `${S.name}: ${S.sel.name}`, body: [uiP((P.steps || []).map((s, i) => `${i + 1}. ${s.text}`).join('\n')), (P.warn || []).length ? uiNote(P.warn.join(' ')) : uiNote('It runs in the game now; you can watch every step here.')], confirmText: 'Do it', danger: (P.warn || []).some(w => /destroy/i.test(w)) });
    if (!ok) return;
    let r = null; try { r = await api('/api/items/job', { method: 'POST', body: JSON.stringify(body()) }); } catch (e) { r = { error: e.message }; }
    if (!r || r.error) { uiError((r && r.error) || 'not started', 'Not started'); return; }
    S.job = { id: r.id, doer: S.name, status: null }; renderSheet();
    if (window.UIKit) UIKit.toast(`${S.name}: job started`, { kind: 'ok' });
    clearInterval(S.poll);
    S.poll = setInterval(async () => {
      if (!S.open || !S.job) { clearInterval(S.poll); return; }
      try { const d = await api('/api/items/job?id=' + encodeURIComponent(S.job.id)); if (d && !d.error) { S.job.status = d.status; const el = $id('itpJob'); if (el) el.innerHTML = jobHtml(); if (d.status && /done|failed/.test(d.status.state)) { clearInterval(S.poll); loadChar(true); } } } catch (e) { }
    }, 2500);
  }

  // ============================================================================================ events
  function onClick(e) {
    const t = e.target, g = (s) => t.closest(s); let b;
    if ((b = g('[data-itchar]'))) { S.pickChar = false; location.hash = '#/items/' + encodeURIComponent(b.dataset.itchar); return; }
    if (g('[data-itchange]')) { S.pickChar = true; render(); return; }
    if ((b = g('[data-itplace]'))) { S.place = b.dataset.itplace; if (S.place === 'shop') loadShops(); render(); return; }
    if ((b = g('[data-itfilter]'))) { S.filter = b.dataset.itfilter; render(); return; }
    if (g('[data-itfresh]')) { loadChar(true); return; }
    if (g('[data-itlook]')) { api('/api/items/look', { method: 'POST', body: JSON.stringify({ name: S.name }) }).then(r => flash(r && r.error ? r.error : `${S.name} walks to the warehouse and looks — the list shows here in a few minutes.`, !!(r && r.error))).catch(er => flash(er.message, true)); return; }
    if ((b = g('[data-itsel]'))) { const r = placeRows()[Number(b.dataset.itsel)]; if (!r) return; S.sel = r; S.want = { to: 0, blessed: false, saId: 0, giveTo: '', count: 1, sources: {}, overSafeOk: false }; S.plan = null; S.job = null; renderSheet(); replan(); return; }
    if (g('[data-itclose]')) { S.sel = null; S.job = null; clearInterval(S.poll); renderSheet(); return; }
    if ((b = g('[data-itsrc]'))) { const [nid, k] = b.dataset.itsrc.split('|'); S.want.sources = Object.assign({}, S.want.sources); if (k) S.want.sources[nid] = k; else delete S.want.sources[nid]; replan(); return; }
    if ((b = g('[data-itusehave]'))) { const x = (S.plan.alsoHave || [])[Number(b.dataset.itusehave)]; if (!x) return; const list = (S.d && S.d[x.src]) || []; const row = list.find(y => y.id === S.sel.id && (y.enchant || 0) === (x.enchant || 0) && (x.src !== 'bag' || y.objId === x.objId)); if (!row) return; const keep = Object.assign({}, S.want, { to: Math.max(S.want.to || 0, 0) }); S.sel = row; S.want = keep; if (keep.to && keep.to <= (row.enchant || 0)) S.want.to = 0; S.plan = null; renderSheet(); replan(); return; }
    if ((b = g('[data-itto]'))) { S.want.to = Number(b.dataset.itto); renderSheet(); replan(); return; }
    if ((b = g('[data-itsa]'))) { S.want.saId = Number(b.dataset.itsa); renderSheet(); replan(); return; }
    if (g('[data-itgo]')) { go(); return; }
  }
  function onInput(e) {
    const t = e.target;
    if (t.id === 'itpCq') { S.cq = t.value; const pos = t.selectionStart; render(); const x = $id('itpCq'); if (x) { x.focus(); try { x.setSelectionRange(pos, pos); } catch (er) { } } return; }
    if (t.id === 'itpQ') { S.q = t.value; const pos = t.selectionStart; render(); const x = $id('itpQ'); if (x) { x.focus(); try { x.setSelectionRange(pos, pos); } catch (er) { } } return; }
    if (t.dataset.itlogall) { S.logAll = t.checked; loadLog(); return; }
    if (t.dataset.itblessed) { S.want.blessed = t.checked; replan(); return; }
    if (t.dataset.itoversafe) { S.want.overSafeOk = t.checked; replan(); return; }
    if (t.dataset.itcount) { S.want.count = Math.max(1, Math.min(100000, Number(t.value) || 1)); replan(); return; }
    if (t.dataset.itgive && e.type === 'change') { S.want.giveTo = t.value; replan(); return; }
  }
  window.ItemsPage = { route, open, close, _state: S };
})();
