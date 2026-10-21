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
  const S = { open: false, name: '', chars: null, d: null, shops: null, place: 'bag', filter: 'all', q: '', sel: null, want: { to: 0, blessed: false, saId: 0, giveTo: '' }, plan: null, planT: 0, job: null, poll: 0, msgT: 0, cq: '', multi: false, msel: {}, mto: 0, mbl: false, mok: false };
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
  function route(kind, arg) {
    if (kind === 'items') { if (window.EnchantPage) EnchantPage.close(); open(arg ? decodeURIComponent(arg) : ''); return true; }
    close();
    if (window.EnchantPage) { if (kind === 'enchanting') { EnchantPage.open(arg ? decodeURIComponent(arg) : ''); return true; } EnchantPage.close(); }   // ENCHPAGE 2026-10-20 (lives below in this file: no server restart)
    return false;
  }
  function open(name) {
    const s = section();
    try { stopChar(); } catch (e) { }
    try { TAB = 'items'; [...$id('tabs').children].forEach(b => b.classList.toggle('on', b.dataset.tab === 'items')); } catch (e) { }
    document.querySelectorAll('main > section').forEach(x => { if (x.id !== SEC) x.hidden = true; });
    s.hidden = false; S.open = true;
    if (name !== S.name) { S.name = name; S.d = null; S.sel = null; S.plan = null; }
    if (/^#\/items\/[^/]+\/shop/.test(location.hash)) { S.place = 'shop'; S.usable = true; loadShops(); }   // the Gear page link: Giran shops, only what this character can wear
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
  // ENCHMANY-2026-10-18 (owner: "I can select several items to enchant in L2Swarm"): tick bag pieces, one + for all, one job
  // ENCHMANY-WH 2026-10-20 (owner: "Its not under 'Clan Warehouse'"): warehouse + clan warehouse pieces too (the bot takes each one out first);
  // a +10 or higher warehouse piece is never ticked here (owner 2026-10-17: only by its own single pick, after the extra-strong warning)
  const canEnch = (r) => r && (r.src === 'bag' || r.src === 'wh' || r.src === 'clan') && r.kind && gradeKey(r.grade) !== 'NONE' && !r.common && !(r.src !== 'bag' && (r.enchant || 0) >= 10);
  const mkey = (r) => r ? (r.src === 'bag' ? 'o' + r.objId : r._k) : '';
  function multiBar() {
    if (!S.multi) return '';
    const rows = placeRows().filter(r => S.msel[mkey(r)]); const n = rows.length, safe = 4;
    const minCur = n ? Math.min(...rows.map(r => r.enchant || 0)) : 0;
    const whOver = rows.filter(r => r.src !== 'bag' && (r.enchant || 0) > safe);
    const fromWh = S.place === 'wh' ? `${h(S.name)} takes each ticked item out of the warehouse first (in Giran), then enchants it. Scrolls must be in the bag.`
      : S.place === 'clan' ? `${S.d && S.d.isClanLeader ? h(S.name) + ' takes' : 'The clan leader ' + h((S.d && S.d.clanLeader) || '?') + ' takes'} each ticked item out of the clan warehouse first (in Giran)${S.d && S.d.isClanLeader ? '' : ' and hands it to ' + h(S.name)}, then ${h(S.name)} enchants it. Scrolls must be in ${h(S.name)}'s bag. Enchanted items stay in the bag.` : '';
    const danger = S.mto > safe || whOver.length;
    return `<div class="itp-sec itp-multi"><div class="itp-sec-t">${gim('icon/etc_scroll_of_enchant_weapon_i02')} Enchant several — tap the items (${n} ticked)</div>
      ${fromWh ? `<div class="itp-note" style="margin:4px 0 8px">${fromWh}</div>` : ''}
      <div class="itp-plus">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 16].filter(v => v > minCur).map(v => `<button type="button" class="itp-pl${S.mto === v ? ' on' : ''}" data-itmto="${v}">+${v}</button>`).join('')}</div>
      <label class="itp-check"><input type="checkbox" data-itmbl="1"${S.mbl ? ' checked' : ''}> Blessed scrolls (a fail drops it to +0 instead of destroying it)</label>
      ${danger ? `<div class="itp-danger" style="padding:8px;margin:6px 0">${S.mto > safe ? `Above the safe +${safe}: ${S.mbl ? 'a fail drops the item to +0' : 'a fail DESTROYS the item'}.` : ''}${whOver.length ? ` ${whOver.map(r => h(r.name) + ' +' + (r.enchant || 0)).join(', ')} ${whOver.length === 1 ? 'is' : 'are'} above +${safe} and leave${whOver.length === 1 ? 's' : ''} the warehouse only because you pick ${whOver.length === 1 ? 'it' : 'them'} here.` : ''}<label class="itp-check"><input type="checkbox" data-itmok="1"${S.mok ? ' checked' : ''}> I understand the risk and want this anyway</label></div>` : ''}
      <div class="itp-actions"><button type="button" class="itp-go" data-itmgo="1"${!n || !S.mto || (danger && !S.mok) ? ' disabled' : ''}>Enchant ${n} item(s)${S.mto ? ' to +' + S.mto : ''}</button> <button type="button" class="itp-btn2" data-itmulti="0">Cancel</button></div></div>`;
  }
  async function multiGo() {
    const rows = placeRows().filter(r => S.msel[mkey(r)]); if (!rows.length || !S.mto) return;
    const where = S.place === 'wh' ? ' (out of the warehouse first)' : S.place === 'clan' ? ' (out of the clan warehouse first)' : '';
    const ok = await uiConfirm({ title: `${S.name}: enchant ${rows.length} item(s) to +${S.mto}${where}`, body: [uiP(rows.map(r => `+${r.enchant || 0} ${r.name}`).join('\n')), uiNote(S.mto > 4 ? (S.mbl ? 'Above +4 a fail drops an item to +0.' : 'Above +4 a fail DESTROYS that item.') : 'Up to +4 is safe.')], confirmText: 'Enchant now' });
    if (!ok) return;
    const send = async (extra) => { try { return await api('/api/items/enchantmany', { method: 'POST', body: JSON.stringify(Object.assign({ name: S.name, objIds: rows.filter(x => x.src === 'bag').map(x => x.objId), items: rows.map(x => ({ src: x.src, objId: Number(x.objId) || 0, id: x.id, enchant: x.enchant || 0 })), to: S.mto, blessed: S.mbl, overSafeOk: S.mok }, extra || {})) }); } catch (e) { return { error: e.message }; } };
    let r = await send();
    // ENCHSCROLLS 2026-10-20 (owner: "it says there is not enchants in the bags?"): scrolls missing from the bag -> ask once, then take them from the warehouse(s)
    if (r && Array.isArray(r.scrollOptions) && r.scrollOptions.length) {
      const lines = r.scrollOptions.map(o => `${o.name}: needs up to ${o.need} — bag ${o.bag}${o.wh ? ', warehouse ' + o.wh : ''}${o.clan ? ', clan warehouse ' + o.clan : ''}`);
      const yes = await uiConfirm({ title: `Take the scrolls from the ${r.scrollOptions.some(o => o.clan) ? 'clan ' : ''}warehouse?`, body: [uiP(lines.join('\n')), uiNote(`${S.name} takes only what is missing (up to the most it could use) before enchanting. What is left over stays in the bag.`)], confirmText: 'Yes, take them' });
      if (!yes) return;
      r = await send({ scrollsFrom: 'warehouses' });
    }
    if (!r || r.error) { uiError((r && r.error) || 'not started', 'Not started'); return; }
    if (window.UIKit) UIKit.toast(`${S.name}: enchanting ${rows.length} item(s)`, { kind: 'ok' });
    flash(`${S.name} enchants ${rows.length} item(s) to +${S.mto}${(r.skipped || []).length ? ' — skipped: ' + r.skipped.join('; ') : ''}${(r.short || []).length ? ' — scrolls may run out: ' + r.short.join(', ') : ''}`);
    S.multi = false; S.msel = {}; render();
    let k = 0; clearInterval(S.mpoll); S.mpoll = setInterval(() => { if (!S.open || ++k > 40) { clearInterval(S.mpoll); return; } loadChar(true); }, 3000);
  }
  function placeRows() {
    const d = S.d; if (!d) return [];
    // SORT (owner 2026-10-17: "under /items/ items should be sorted by grade and type"): worn first (bag), then the type (weapons, armor,
    // jewels, scrolls, materials, other), then the grade (highest first), then the name — every place, the Giran shops too
    const src = S.place === 'shop' ? (S.shops ? [].concat(...S.shops.shops.map(s => s.rows)) : []) : (d[S.place] || []);
    const out = src.slice().sort((a, b) => (b.eq ? 1 : 0) - (a.eq ? 1 : 0) || TYPE_ORD.indexOf(cat(a)) - TYPE_ORD.indexOf(cat(b)) || gradeNum(b.grade) - gradeNum(a.grade) || String(a.name).localeCompare(String(b.name)) || (a.enchant || 0) - (b.enchant || 0));
    // ENCHMANY-WH: warehouse rows have no objId -> a key of place + item + enchant + the n-th such row (stable across refreshes)
    const seen = {}; return out.map(r => { if (r.src === 'bag' || r.src === 'shop') return r; const b = `${r.src}:${r.id}:${r.enchant || 0}`; seen[b] = (seen[b] || 0) + 1; return Object.assign({}, r, { _k: b + ':' + seen[b] }); });
  }
  const TYPE_ORD = ['weapon', 'armor', 'jewel', 'scroll', 'mat', 'other'];
  const TYPE_NAME = { weapon: 'Weapons', armor: 'Armor', jewel: 'Jewels', scroll: 'Scrolls', mat: 'Materials', other: 'Other' };
  const GRADE_ORD = ['NONE', 'D', 'C', 'B', 'A', 'S'];
  const gradeKey = (g) => /^S\d*$/.test(String(g || '')) ? 'S' : String(g || 'NONE');
  const gradeNum = (g) => GRADE_ORD.indexOf(gradeKey(g));
  const LVL = { NONE: 1, D: 20, C: 40, B: 52, A: 61, S: 76 };
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
    const lvl = Number(d.level) || 0;
    const rows = placeRows().map((r, i) => Object.assign({ _i: i }, r)).filter(r => (S.filter === 'all' || cat(r) === S.filter) && (!S.grade || S.grade === 'all' || gradeKey(r.grade) === S.grade)
      && (!S.usable || !r.kind || (LVL[gradeKey(r.grade)] || 1) <= lvl) && (!S.q || r.name.toLowerCase().includes(S.q.toLowerCase())));
    // type headings inside the grid (Weapons · Armor · ...) so a long list reads in blocks
    let lastT = ''; const tilesHtml = rows.slice(0, 400).map(r => { const t = r.eq ? 'worn' : cat(r); const head = t !== lastT ? `<div class="itp-grp">${t === 'worn' ? 'Worn now' : TYPE_NAME[t] || t}</div>` : ''; lastT = t; return head + (S.multi ? (canEnch(r) ? tile(r, r._i).replace('class="itp-tile', `class="itp-tile${S.msel[mkey(r)] ? ' itp-ticked' : ''}`) : tile(r, r._i).replace('class="itp-tile', 'class="itp-tile itp-dim')) : tile(r, r._i)); }).join('');
    let note = '';
    if (S.place === 'wh') note = d.whSeen ? `Seen ${h(new Date(d.whSeen).toLocaleString())}.` : `Nobody has looked into ${h(S.name)}'s warehouse yet.`;
    if (S.place === 'wh') note += ` <button type="button" class="itp-btn2" data-itlook="1">${gim('icon/etc_equip_item_box_i01')} Look now (${h(S.name)} walks to the warehouse)</button> <button type="button" class="itp-btn2${S.multi ? ' on' : ''}" data-itmulti="${S.multi ? 0 : 1}">${gim('icon/etc_scroll_of_enchant_weapon_i02')} Enchant several</button>`;
    if (S.place === 'clan') note = `${d.clanSeen ? `Seen ${h(new Date(d.clanSeen).toLocaleString())} by ${h(d.clanSeenBy)}.` : 'Not looked at yet.'} ${d.isClanLeader ? '' : `Only the clan leader (${h(d.clanLeader || '?')}) can take things out — he hands them to ${h(S.name)}.`} <button type="button" class="itp-btn2${S.multi ? ' on' : ''}" data-itmulti="${S.multi ? 0 : 1}">${gim('icon/etc_scroll_of_enchant_weapon_i02')} Enchant several</button>`;
    if (S.place === 'bag') note = `${h(kmb(d.adena))} adena · ${d.bagSrc === 'live' ? 'live' : 'last report'}${d.bagErr ? ' · ' + h(d.bagErr) : ''} <button type="button" class="itp-btn2" data-itfresh="1">Refresh</button> <button type="button" class="itp-btn2${S.multi ? ' on' : ''}" data-itmulti="${S.multi ? 0 : 1}">${gim('icon/etc_scroll_of_enchant_weapon_i02')} Enchant several</button>`;
    if (S.place === 'shop') note = 'What Giran\'s merchants sell (prices before the castle tax, about +20 %). "Common Item" = cheap, no set bonus, cannot be enchanted.';
    $id('itpBody').innerHTML = `<div class="itp-step"><span class="itp-num">2</span> Where?</div>
      <div class="itp-places">${PLACES.map(([k, e, t]) => `<button type="button" class="itp-place${S.place === k ? ' on' : ''}" data-itplace="${k}"><span class="itp-e">${gim(e, 'big')}</span><b>${t}</b><span>${counts[k]}</span></button>`).join('')}</div>
      <div class="itp-note">${note}</div>
      <div class="itp-step"><span class="itp-num">3</span> Tap an item</div>
      <div class="itp-filters">${FILTERS.map(([k, t]) => `<button type="button" class="itp-chip${S.filter === k ? ' on' : ''}" data-itfilter="${k}">${t}</button>`).join('')}</div>
      <div class="itp-filters">${['all', 'NONE', 'D', 'C', 'B', 'A', 'S'].map(g => `<button type="button" class="itp-chip${(S.grade || 'all') === g ? ' on' : ''}" data-itgrade="${g}">${g === 'all' ? 'Every grade' : g === 'NONE' ? 'No grade' : g + '-grade'}</button>`).join('')}
        <label class="itp-check" style="margin:0"><input type="checkbox" data-itusable="1"${S.usable ? ' checked' : ''}> only what ${h(S.name)} can wear (lvl ${h(lvl || '?')})</label></div>
      <input type="search" class="itp-search" id="itpQ" placeholder="Search…" value="${h(S.q)}">
      ${S.place === 'bag' || S.place === 'wh' || S.place === 'clan' ? multiBar() : ''}<div class="itp-grid">${tilesHtml || '<div class="muted">Nothing here.</div>'}</div>${rows.length > 400 ? `<div class="muted">${rows.length - 400} more — narrow it with the buttons or the search.</div>` : ''}
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
      ${P && P.overSafe && P.overSafe.length ? `<div class="itp-sec itp-danger"><div class="itp-sec-t">Please read first</div>${P.overSafe.map(t => `<div>${h(t)}</div>`).join('')}<label class="itp-check"><input type="checkbox" data-itoversafe="1"${S.want.overSafeOk ? ' checked' : ''}> I understand the risk and want this anyway</label></div>` : ''}
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
    if ((b = g('[data-itplace]'))) { S.place = b.dataset.itplace; S.msel = {}; if (S.place === 'shop') { S.multi = false; loadShops(); } render(); return; }   // ENCHMANY-WH: ticks belong to one place
    if ((b = g('[data-itgrade]'))) { S.grade = b.dataset.itgrade; render(); return; }
    if ((b = g('[data-itfilter]'))) { S.filter = b.dataset.itfilter; render(); return; }
    if (g('[data-itfresh]')) { loadChar(true); return; }
    if (g('[data-itlook]')) { api('/api/items/look', { method: 'POST', body: JSON.stringify({ name: S.name }) }).then(r => flash(r && r.error ? r.error : `${S.name} walks to the warehouse and looks — the list shows here in a few minutes.`, !!(r && r.error))).catch(er => flash(er.message, true)); return; }
    if ((b = g('[data-itmulti]'))) { S.multi = b.dataset.itmulti === '1'; S.msel = {}; S.mto = 0; S.mok = false; if (S.multi && !['bag', 'wh', 'clan'].includes(S.place)) S.place = 'bag'; render(); return; }
    if ((b = g('[data-itmto]'))) { S.mto = Number(b.dataset.itmto); render(); return; }
    if (g('[data-itmgo]')) { multiGo(); return; }
    if (S.multi && (b = g('[data-itsel]'))) { const r = placeRows()[Number(b.dataset.itsel)]; if (canEnch(r)) { const mk = mkey(r); if (S.msel[mk]) delete S.msel[mk]; else S.msel[mk] = true; render(); } else flash(`${r ? r.name : 'This'} cannot be enchanted here (Common / no grade${r && r.src !== 'bag' && (r.enchant || 0) >= 10 ? ' / +10 and higher only by its own pick' : ''})`, true); return; }
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
    if (t.dataset.itusable) { S.usable = t.checked; render(); return; }
    if (t.dataset.itlogall) { S.logAll = t.checked; loadLog(); return; }
    if (t.dataset.itmbl) { S.mbl = t.checked; render(); return; }
    if (t.dataset.itmok) { S.mok = t.checked; render(); return; }
    if (t.dataset.itblessed) { S.want.blessed = t.checked; replan(); return; }
    if (t.dataset.itoversafe) { S.want.overSafeOk = t.checked; replan(); return; }
    if (t.dataset.itcount) { S.want.count = Math.max(1, Math.min(100000, Number(t.value) || 1)); replan(); return; }
    if (t.dataset.itgive && e.type === 'change') { S.want.giveTo = t.value; replan(); return; }
  }
  window.ItemsPage = { route, open, close, _state: S };
})();

// ============================================================================================================================================
// ENCHANTING page #/enchanting[/<Name>] (ENCHPAGE 2026-10-20; owner: "would just be nice to see a nice progress and easy to understand overview of
// the enchanting that i can follow, like /itemenchanting"). Every enchant job (Enchant several + single enchants): per item waiting / taking out /
// +1 ... +N / reached / broke, the totals, the scrolls, time left; earlier jobs below. Read only. Data: /api/items/log (which jobs) +
// /api/items/job?id= (the job + its step-by-step status, written by swarm.js ITEMJOB); icons from /gamedata/items.json. Lives in this file so it is
// served without a dashboard restart (itemspage_api STATIC); the menu button is added here too.
(function () {
  'use strict';
  const SEC = 'tab-enchanting';
  const E = { open: false, who: '', jobs: [], idsAt: 0, ids: [], db: null, timer: 0, busy: false, err: '', openOld: {},
    // NEW ENCHANT builder (owner 2026-10-20: "SUPER easy to select multiple items and then select what ++ you want them to ... extremely easy"):
    // who -> tap items (bag + warehouse + clan warehouse in ONE grid) -> +N -> one button
    chars: null, pick: '', d: null, sel: {}, to: 0, bl: false, ok: false, kind: 'all', grade: 'all', q: '', sending: false };
  const $id = (i) => document.getElementById(i);
  const h = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ico = (p) => typeof iconUrl === 'function' ? iconUrl(p) : '/icons/' + p + '.png';
  const gim = (p, c) => `<img class="gim${c ? ' ' + c : ''}" src="${ico(p)}" alt="">`;
  const SAFE = 4;
  const clock = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }); };
  const day = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString([], { day: 'numeric', month: 'short' }); };
  const mins = (ms) => { const m = Math.max(1, Math.round(ms / 60000)); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`; };

  // ---------------------------------------------------------------------------------------------------------------- the menu button
  function addTab() {
    try {
      const tabs = $id('tabs'); if (!tabs || tabs.querySelector('[data-tab="enchanting"]')) return;
      const b = document.createElement('button'); b.dataset.tab = 'enchanting'; b.title = 'Follow every enchant job live: each item, its + level, what broke';
      b.innerHTML = `<img class="gi" src="${ico('icon/etc_scroll_of_enchant_armor_i02')}" alt=""> Enchanting`;
      const after = tabs.querySelector('[data-tab="items"]'); if (after && after.nextSibling) tabs.insertBefore(b, after.nextSibling); else tabs.appendChild(b);
    } catch (e) { }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addTab); else addTab();

  // ---------------------------------------------------------------------------------------------------------------- data
  async function itemDb() { if (E.db) return E.db; try { E.db = await (await fetch('/gamedata/items.json')).json(); } catch (e) { E.db = {}; } return E.db; }
  const iconOf = (id) => { const r = E.db && E.db[String(id)]; return r && r[1] ? r[1] : 'icon/etc_question_mark_i00'; };
  async function load() {
    if (E.busy) return; E.busy = true;
    try {
      await itemDb();
      // which jobs + their FULL history: the item-job log (the job's status file keeps only its latest steps: 2026-10-20 the first boots were cut off)
      const L = await api('/api/items/log?n=1000' + (E.who ? '&name=' + encodeURIComponent(E.who) : ''));
      const ids = [], hist = {};
      ((L && L.lines) || []).forEach(l => { const m = /\b(ij_[a-z0-9_-]+):\s*(.*)$/i.exec(l.text || ''); if (!m) return; if (!ids.includes(m[1]) && /enchant/i.test(l.text)) ids.push(m[1]);
        (hist[m[1]] = hist[m[1]] || []).push({ t: l.t, who: l.who, msg: m[2].replace(/\s+\|\s+adena\s.*$/, '') }); });
      E.ids = ids.slice(0, 10); E.idsAt = Date.now(); E.hist = hist;
      const out = [];
      for (const id of E.ids) {
        const old = E.jobs.find(j => j.id === id);
        if (old && old.final && Date.now() - old.at < 600000) { out.push(old); continue; }   // a finished job does not change
        let r = null; try { r = await api('/api/items/job?id=' + encodeURIComponent(id)); } catch (e) { }
        if (!r || r.error || !r.job || !(r.job.enchantMany || r.job.enchant)) continue;
        const v = model(r.job, r.status || {}, (E.hist || {})[id]); v.at = Date.now(); out.push(v);
      }
      E.jobs = out; E.err = '';
    } catch (e) { E.err = String(e && e.message || e); }
    E.busy = false; renderJobs(); schedule();
  }
  function schedule() {
    clearTimeout(E.timer); if (!E.open) return;
    const live = E.jobs.some(j => !j.final);
    E.timer = setTimeout(() => {
      if (!E.open || !/^#\/enchanting/.test(location.hash)) { E.open = false; return; }       // another page took over (its route did not close us)
      if (document.hidden) { schedule(); return; }
      load();
    }, live ? 3000 : 20000);
  }

  // ---------------------------------------------------------------------------------------------------------------- the job -> per item progress
  /** the job file + its step list -> { id, doer, to, items: [{ name, id, src, from, to, st, lvl, brokeAt, why }], scrolls, counts, ... } */
  function model(J, ST, logSteps) {
    const many = Array.isArray(J.enchantMany) && J.enchantMany.length;
    const items = (many ? J.enchantMany : [{ name: J.item.name, id: J.item.id, src: J.item.src, from: J.item.enchant || 0, to: J.enchant ? J.enchant.to : 0 }])
      .map(x => ({ name: x.name, id: x.id, src: x.src || 'bag', from: Number(x.from) || 0, to: Number(x.to) || 0, st: 'waiting', lvl: Number(x.from) || 0, brokeAt: 0, why: '', t0: '', t1: '' }));
    const names = new Set(items.map(x => x.name));
    const steps = [], seen = [];
    ((logSteps || []).concat((ST && ST.steps) || [])).forEach(x => { const tt = Date.parse(x.t) || 0; if (seen.some(y => y.msg === x.msg && Math.abs(y.tt - tt) < 2000)) return; seen.push({ msg: x.msg, tt }); steps.push(x); });
    steps.sort((a, b) => String(a.t).localeCompare(String(b.t)));
    const scrolls = []; let cur = -1, tries = 0, firstTry = '', lastTry = '';
    const pend = (n) => items.findIndex(x => x.name === n && x.st === 'waiting');
    for (const s of steps) {
      const m0 = String(s.msg || ''); let m;
      if ((m = /^taking (\d+)× (.+?) out of (?:my|the clan) warehouse/.exec(m0))) {
        if (names.has(m[2]) && m[1] === '1') { if (cur >= 0 && items[cur].st === 'taking') { items[cur].st = 'skipped'; items[cur].why = 'could not take it out'; } const i = pend(m[2]); if (i >= 0) { items[i].st = 'taking'; items[i].t0 = s.t; cur = i; } }
        else scrolls.push({ name: m[2], n: Number(m[1]), from: /clan/.test(m0) ? 'clan warehouse' : 'warehouse' });
        continue;
      }
      if ((m = /^asking the clan leader (\S+) for (\d+)× (.+?) from the clan warehouse/.exec(m0))) { if (!names.has(m[3])) scrolls.push({ name: m[3], n: Number(m[2]), from: 'clan warehouse (' + m[1] + ')' }); else { const i = pend(m[3]); if (i >= 0) { items[i].st = 'taking'; items[i].t0 = s.t; cur = i; } } continue; }
      if ((m = /^enchanting (.+?) from \+(\d+) to \+(\d+)/.exec(m0))) {
        let i = items.findIndex(x => x.name === m[1] && x.st === 'enchanting' && x.lvl === Number(m[2]));   // a Resume goes on with the piece the restart cut off
        if (i < 0) i = cur >= 0 && items[cur].name === m[1] && items[cur].st === 'taking' ? cur : pend(m[1]);
        if (i < 0) i = items.findIndex(x => x.name === m[1] && x.st === 'taking');
        if (i >= 0) { Object.assign(items[i], { st: 'enchanting', lvl: Number(m[2]), from: Number(m[2]), t0: items[i].t0 || s.t }); cur = i; }
        continue;
      }
      const nm = (m = /^enchant (?:\u2713 (.+?) is now|\+\d+ (?:FAILED|failed) \u2014 (.+?) is )/.exec(m0)) ? (m[1] || m[2]) : '';
      if (nm && !(cur >= 0 && items[cur].name === nm && items[cur].st === 'enchanting')) { const i = pend(nm) >= 0 ? pend(nm) : items.findIndex(x => x.name === nm && x.st === 'taking'); if (i >= 0) { Object.assign(items[i], { st: 'enchanting', t0: items[i].t0 || s.t }); cur = i; } }
      const it = cur >= 0 ? items[cur] : null;
      if ((m = /^enchant ✓ (.+?) is now \+(\d+)/.exec(m0)) && it && it.name === m[1]) { tries++; firstTry = firstTry || s.t; lastTry = s.t; it.lvl = Number(m[2]); it.t1 = s.t; if (it.lvl >= it.to) it.st = 'done'; continue; }
      if ((m = /^enchant \+(\d+) FAILED — (.+?) is gone/.exec(m0)) && it && it.name === m[2]) { tries++; firstTry = firstTry || s.t; lastTry = s.t; Object.assign(it, { st: 'broke', brokeAt: Number(m[1]), t1: s.t }); continue; }
      if ((m = /^enchant \+(\d+) failed — (.+?) is now \+(\d+)/.exec(m0)) && it && it.name === m[2]) { tries++; firstTry = firstTry || s.t; lastTry = s.t; Object.assign(it, { st: 'dropped', lvl: Number(m[3]), brokeAt: Number(m[1]), t1: s.t }); continue; }
      if ((m = /^(.+?): (\d+) of (\d+) in my bag now/.exec(m0)) && !names.has(m[1])) { const sc = scrolls.filter(x => x.name === m[1]).pop(); if (sc) sc.got = Number(m[2]); }
    }
    const state = String((ST && ST.state) || 'running'), final = state === 'done' || state === 'failed', interrupted = final && !!(ST && ST.interrupted);
    if (final) {                                                                                    // what never got its turn: the reason from the result
      const res = String((ST && ST.result) || '').split('; ');
      items.forEach(x => {
        if (x.st === 'done' || x.st === 'broke' || x.st === 'dropped') return;
        const r = res.find(p => p.startsWith(x.name + ':') || p.startsWith(x.name + ' ')); const why = r ? r.slice(x.name.length).replace(/^[:\s]+/, '') : '';
        if (interrupted) { x.why = x.st === 'enchanting' ? `cut off at +${x.lvl}` : 'not started yet'; x.st = x.st === 'enchanting' ? 'stopped' : 'waiting'; return; }
        if (x.st === 'enchanting') { x.st = 'stopped'; x.why = why || `stopped at +${x.lvl}`; } else { x.st = 'skipped'; x.why = why || x.why || 'not done'; }
      });
    }
    const c = { done: 0, broke: 0, dropped: 0, work: 0, wait: 0, skip: 0 };
    items.forEach(x => { if (x.st === 'done') c.done++; else if (x.st === 'broke') c.broke++; else if (x.st === 'dropped') c.dropped++; else if (x.st === 'enchanting' || x.st === 'taking') c.work++; else if (x.st === 'waiting') c.wait++; else c.skip++; });
    const perTry = tries > 1 ? (Date.parse(lastTry) - Date.parse(firstTry)) / (tries - 1) : 0;
    const left = items.reduce((n, x) => n + (x.st === 'waiting' ? x.to - x.from : x.st === 'enchanting' ? x.to - x.lvl : 0), 0);
    const blessed = /Blessed Scroll/i.test(JSON.stringify(J.needs || [])) || !!(J.enchant && J.enchant.blessed);
    return { id: J.id, doer: J.doer, created: J.created, items, scrolls, c, tries, perTry, left, final, state, result: (ST && ST.result) || '', last: steps.length ? steps[steps.length - 1] : null, blessed, to: items.reduce((m, x) => Math.max(m, x.to), 0), overSafe: !!J.overSafeOk, interrupted };
  }

  // ---------------------------------------------------------------------------------------------------------------- NEW ENCHANT builder
  const GRADES = ['NONE', 'D', 'C', 'B', 'A', 'S'];
  const gKey = (g) => /^S\d*$/.test(String(g || '')) ? 'S' : String(g || 'NONE');
  const GCOL = { D: '#5aa0ff', C: '#55c271', B: '#d6b64a', A: '#e2873c', S: '#e24c4c' };
  const canE = (r) => r && r.kind && gKey(r.grade) !== 'NONE' && !r.common && !(r.src !== 'bag' && (Number(r.enchant) || 0) >= 10);
  async function loadChars() { try { const d = await api('/api/items/chars'); if (d && !d.error) { E.chars = d; if (!E.pick) { const cl = (d.chars || []).find(c => c.clanLeader); E.pick = E.who || (cl && cl.name) || ''; if (E.pick) loadPick(); } } } catch (e) { } render(); }
  async function loadPick() {
    if (!E.pick) return; const nm = E.pick;
    let d = null; try { d = await api('/api/items/char?name=' + encodeURIComponent(nm)); } catch (e) { d = { error: e.message }; }
    if (nm !== E.pick) return; E.d = d && !d.error ? d : null; if (d && d.error) E.err = d.error; render();
  }
  /** every enchantable piece of the picked character, identical pieces stacked: [{ key, src, id, objId, name, enchant, grade, kind, max, eq }] */
  function stock() {
    const d = E.d; if (!d) return [];
    const out = [], by = {};
    (d.bag || []).filter(r => canE(Object.assign({ src: 'bag' }, r))).forEach(r => out.push({ key: 'o' + r.objId, src: 'bag', id: r.id, objId: r.objId, name: r.name, enchant: Number(r.enchant) || 0, grade: gKey(r.grade), kind: r.kind, max: 1, eq: !!r.eq }));
    ['wh', 'clan'].forEach(src => (d[src] || []).forEach(r => { const x = Object.assign({ src }, r); if (!canE(x)) return; const k = `${src}:${r.id}:${Number(r.enchant) || 0}`;
      if (by[k]) by[k].max += Number(r.count) || 1; else out.push(by[k] = { key: k, src, id: r.id, objId: 0, name: r.name, enchant: Number(r.enchant) || 0, grade: gKey(r.grade), kind: r.kind, max: Number(r.count) || 1 }); }));
    const KO = { weapon: 0, armor: 1, jewel: 2 };
    return out.sort((a, b) => (KO[a.kind] ?? 3) - (KO[b.kind] ?? 3) || GRADES.indexOf(b.grade) - GRADES.indexOf(a.grade) || a.name.localeCompare(b.name) || a.enchant - b.enchant || a.src.localeCompare(b.src));
  }
  const shown = () => stock().filter(r => (E.kind === 'all' || r.kind === E.kind) && (E.grade === 'all' || r.grade === E.grade) && (!E.q || r.name.toLowerCase().includes(E.q.toLowerCase())));
  const selRows = () => stock().filter(r => E.sel[r.key] > 0);
  const selCount = () => selRows().reduce((n, r) => n + Math.min(E.sel[r.key], r.max), 0);
  function builder() {
    const C = (E.chars && E.chars.chars) || [];
    const who = `<div class="itp-step"><span class="itp-num">1</span> Who enchants?</div><div class="enp-who">${C.filter(c => c.online || c.name === E.pick || c.clanLeader).map(c => `<button type="button" class="itp-chip${c.name === E.pick ? ' on' : ''}" data-enpwho="${h(c.name)}">${h(c.name)}${c.clanLeader ? ' ' + gim('icon/accessory_pledge_cap1_i00') : ''}</button>`).join('') || '<span class="muted">Loading…</span>'}</div>`;
    if (!E.pick) return who;
    if (!E.d) return who + '<div class="muted">Loading the items…</div>';
    const rows = shown(), n = selCount(), sel = selRows();
    const minCur = sel.length ? Math.min(...sel.map(r => r.enchant)) : 0;
    const whOver = sel.filter(r => r.src !== 'bag' && r.enchant > SAFE);
    const danger = E.to > SAFE || whOver.length > 0;
    const tile = (r) => { const k = E.sel[r.key] || 0;
      return `<button type="button" class="enp-tile${k ? ' on' : ''}" data-enpsel="${h(r.key)}" title="${h(r.name)}"><span class="itp-ic"><img src="${ico(iconOf(r.id))}" alt="" loading="lazy">${r.enchant ? `<b class="itp-en">+${r.enchant}</b>` : ''}${r.max > 1 ? `<b class="itp-n">×${r.max}</b>` : ''}</span>
        <span class="itp-nm">${h(r.name)}</span><span class="itp-sub"><span class="itp-g" style="background:${GCOL[r.grade] || '#777'}">${h(r.grade)}</span><span class="enp-src">${r.src === 'bag' ? (r.eq ? 'worn' : 'bag') : r.src === 'clan' ? 'clan wh' : 'warehouse'}</span></span>
        ${k ? `<span class="enp-ck">✓${r.max > 1 ? ' ' + k + '/' + r.max : ''}</span>` : ''}</button>${k && r.max > 1 ? `<span class="enp-step"><button type="button" data-enpless="${h(r.key)}">−</button><button type="button" data-enpmore="${h(r.key)}">+</button></span>` : ''}`; };
    return who + `
      <div class="itp-step"><span class="itp-num">2</span> Tap the items <span class="enp-cnt">${n} picked</span></div>
      <div class="itp-filters">${[['all', 'All'], ['armor', 'Armor'], ['weapon', 'Weapons'], ['jewel', 'Jewels']].map(([k, t]) => `<button type="button" class="itp-chip${E.kind === k ? ' on' : ''}" data-enpkind="${k}">${t}</button>`).join('')}
        ${['all', 'D', 'C', 'B', 'A', 'S'].map(g => `<button type="button" class="itp-chip${E.grade === g ? ' on' : ''}" data-enpgrade="${g}">${g === 'all' ? 'Every grade' : g}</button>`).join('')}</div>
      <div class="itp-filters"><input type="search" class="itp-search" id="enpQ" placeholder="Search, e.g. Karmian…" value="${h(E.q)}">
        <button type="button" class="itp-btn2" data-enpall="1">Select all shown (${rows.length})</button><button type="button" class="itp-btn2" data-enpclear="1"${n ? '' : ' disabled'}>Clear</button></div>
      <div class="enp-grid">${rows.map(r => `<div class="enp-cell">${tile(r)}</div>`).join('') || '<div class="muted">Nothing to enchant here (Common / no-grade items cannot be enchanted).</div>'}</div>
      <div class="itp-step"><span class="itp-num">3</span> To what +?</div>
      <div class="itp-plus">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 16].filter(v => v > minCur).map(v => `<button type="button" class="itp-pl${E.to === v ? ' on' : ''}${v > SAFE ? ' risky' : ''}" data-enpto="${v}">+${v}</button>`).join('')}</div>
      <label class="itp-check"><input type="checkbox" data-enpbl="1"${E.bl ? ' checked' : ''}> Blessed scrolls (a fail drops it to +0 instead of destroying it)</label>
      ${danger ? `<div class="itp-danger" style="padding:8px;margin:6px 0">${E.to > SAFE ? `Above the safe +${SAFE}: ${E.bl ? 'every fail drops the item to +0' : 'every fail DESTROYS the item'}.` : ''}${whOver.length ? ` ${whOver.map(r => h(r.name) + ' +' + r.enchant).join(', ')} ${whOver.length === 1 ? 'is' : 'are'} above +${SAFE} and leave${whOver.length === 1 ? 's' : ''} the warehouse only because you pick ${whOver.length === 1 ? 'it' : 'them'}.` : ''}<label class="itp-check"><input type="checkbox" data-enpok="1"${E.ok ? ' checked' : ''}> I understand the risk and want this anyway</label></div>` : ''}
      <button type="button" class="itp-go enp-go" data-enpgo="1"${!n || !E.to || (danger && !E.ok) || E.sending ? ' disabled' : ''}>${E.sending ? 'Starting…' : n && E.to ? `Enchant ${n} item${n === 1 ? '' : 's'} to +${E.to}` : !n ? 'Tap the items first' : 'Pick the + level'}</button>
      <div class="itp-note">Items in a warehouse are taken out first (in Giran); missing scrolls can come from the warehouses too — you are asked before anything is taken. Up to +${SAFE} is safe.</div>`;
  }
  async function go() {
    const rows = selRows(); const n = selCount(); if (!n || !E.to) return;
    const items = []; rows.forEach(r => { for (let k = 0; k < Math.min(E.sel[r.key], r.max); k++) items.push({ src: r.src, objId: Number(r.objId) || 0, id: r.id, enchant: r.enchant }); });
    const list = rows.map(r => `${Math.min(E.sel[r.key], r.max) > 1 ? Math.min(E.sel[r.key], r.max) + '× ' : ''}+${r.enchant} ${r.name}${r.src === 'clan' ? ' (clan warehouse)' : r.src === 'wh' ? ' (warehouse)' : ''}`).join('\n');
    const yes = await uiConfirm({ title: `${E.pick}: enchant ${n} item${n === 1 ? '' : 's'} to +${E.to}`, body: [uiP(list), uiNote(E.to > SAFE ? (E.bl ? `Above +${SAFE} a fail drops an item to +0.` : `Above +${SAFE} a fail DESTROYS that item.`) : `Up to +${SAFE} is safe.`)], confirmText: 'Enchant now' });
    if (!yes) return;
    E.sending = true; render();
    const send = async (extra) => { try { return await api('/api/items/enchantmany', { method: 'POST', body: JSON.stringify(Object.assign({ name: E.pick, items, to: E.to, blessed: E.bl, overSafeOk: E.ok }, extra || {})) }); } catch (e) { return { error: e.message }; } };
    let r = await send();
    if (r && Array.isArray(r.scrollOptions) && r.scrollOptions.length) {
      const lines = r.scrollOptions.map(o => `${o.name}: needs up to ${o.need} — bag ${o.bag}${o.wh ? ', warehouse ' + o.wh : ''}${o.clan ? ', clan warehouse ' + o.clan : ''}`);
      const ok2 = await uiConfirm({ title: `Take the scrolls from the ${r.scrollOptions.some(o => o.clan) ? 'clan ' : ''}warehouse?`, body: [uiP(lines.join('\n')), uiNote(`${E.pick} takes only what is missing (up to the most it could use) before enchanting. What is left over stays in the bag.`)], confirmText: 'Yes, take them' });
      r = ok2 ? await send({ scrollsFrom: 'warehouses' }) : null;
    }
    E.sending = false;
    if (!r) { render(); return; }
    if (r.error) { uiError(r.error, 'Not started'); render(); return; }
    if (window.UIKit) UIKit.toast(`${E.pick}: enchanting ${n} item${n === 1 ? '' : 's'} to +${E.to}`, { kind: 'ok' });
    E.sel = {}; E.ok = false; E.ids = []; E.jobs = []; render(); load(); setTimeout(loadPick, 5000);
    setTimeout(() => { try { document.querySelector('.enp-live') && document.querySelector('.enp-live').scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch (e) { } }, 1500);
  }
  function onClick(e) {
    const t = e.target; let b;
    if ((b = t.closest('[data-enpresume]'))) { resume(b.dataset.enpresume, b.dataset.enpdoer); return; }
    if ((b = t.closest('[data-enpold]'))) { const id = b.dataset.enpold; E.openOld[id] = !E.openOld[id]; render(); return; }
    if ((b = t.closest('[data-enpwho]'))) { if (E.pick !== b.dataset.enpwho) { E.pick = b.dataset.enpwho; E.d = null; E.sel = {}; E.to = 0; E.ok = false; render(); loadPick(); } return; }
    if ((b = t.closest('[data-enpless]'))) { const k = b.dataset.enpless; E.sel[k] = Math.max(0, (E.sel[k] || 0) - 1); if (!E.sel[k]) delete E.sel[k]; render(); return; }
    if ((b = t.closest('[data-enpmore]'))) { const k = b.dataset.enpmore, r = stock().find(x => x.key === k); if (r) E.sel[k] = Math.min(r.max, (E.sel[k] || 0) + 1); render(); return; }
    if ((b = t.closest('[data-enpsel]'))) { const k = b.dataset.enpsel, r = stock().find(x => x.key === k); if (!r) return; if (E.sel[k]) delete E.sel[k]; else E.sel[k] = r.max; render(); return; }   // tap = all copies of it; − / + fine-tune
    if ((b = t.closest('[data-enpall]'))) { shown().forEach(r => { E.sel[r.key] = r.max; }); render(); return; }
    if (t.closest('[data-enpclear]')) { E.sel = {}; render(); return; }
    if ((b = t.closest('[data-enpkind]'))) { E.kind = b.dataset.enpkind; render(); return; }
    if ((b = t.closest('[data-enpgrade]'))) { E.grade = b.dataset.enpgrade; render(); return; }
    if ((b = t.closest('[data-enpto]'))) { E.to = Number(b.dataset.enpto); render(); return; }
    if (t.closest('[data-enpgo]')) { go(); return; }
  }
  async function resume(id, doer) {
    const j = E.jobs.find(x => x.id === id); const left = j ? j.items.filter(x => x.st === 'waiting' || x.st === 'stopped').length : 0;
    const yes = await uiConfirm({ title: `Resume: ${doer} goes on with ${left} item${left === 1 ? '' : 's'}`, body: [uiP('Finished pieces are skipped. A piece that was cut off goes on from its + level; pieces still in the warehouse are taken out again, and only the scrolls still needed.'), uiNote(j && j.to > SAFE ? (j.blessed ? `Above +${SAFE} a fail drops an item to +0.` : `Above +${SAFE} a fail DESTROYS that item.`) : `Up to +${SAFE} is safe.`)], confirmText: 'Resume' });
    if (!yes) return;
    let r = null; try { r = await api('/api/command', { method: 'POST', body: JSON.stringify({ cmd: '!itemjob ' + id, target: 'char:' + doer, confirm: true }) }); } catch (e) { r = { error: e.message }; }
    if (!r || r.error || r.ok === false) { uiError((r && r.error) || 'not sent', 'Not resumed'); return; }
    if (window.UIKit) UIKit.toast(`${doer}: resuming`, { kind: 'ok' });
    E.ids = []; setTimeout(load, 2500);
  }
  function onInput(e) {
    const t = e.target;
    if (t.id === 'enpQ') { E.q = t.value; const pos = t.selectionStart; render(); const q = $id('enpQ'); if (q) { q.focus(); try { q.setSelectionRange(pos, pos); } catch (er) { } } return; }
    if (t.dataset.enpbl) { E.bl = t.checked; render(); return; }
    if (t.dataset.enpok) { E.ok = t.checked; render(); return; }
  }

  // ---------------------------------------------------------------------------------------------------------------- render
  const ST_TXT = { waiting: 'waiting', taking: 'taking it out…', enchanting: 'enchanting…', done: 'reached', broke: 'broke', dropped: 'dropped to', stopped: 'stopped', skipped: 'not done' };
  function pips(x) {
    let s = '';
    for (let k = 1; k <= x.to; k++) {
      const cls = k <= x.from ? 'had' : x.brokeAt === k ? 'fail' : k <= x.lvl && x.st !== 'dropped' ? 'ok' : x.st === 'enchanting' && k === x.lvl + 1 ? 'now' : '';
      s += `${k === SAFE + 1 ? '<i class="enp-safe" title="above +4 a fail destroys the item"></i>' : ''}<span class="enp-pip ${cls}">${x.brokeAt === k ? '✗' : '+' + k}</span>`;
    }
    return `<div class="enp-pips">${s}</div>`;
  }
  function itemRow(x) {
    const label = x.st === 'done' ? `+${x.lvl} ✓` : x.st === 'broke' ? `broke at +${x.brokeAt}` : x.st === 'dropped' ? `failed +${x.brokeAt} → now +${x.lvl}` : x.st === 'enchanting' ? `now +${x.lvl} → +${x.to}` : x.st === 'stopped' ? `stopped at +${x.lvl}` : ST_TXT[x.st];
    return `<div class="enp-item enp-${x.st}"><span class="itp-ic"><img src="${ico(iconOf(x.id))}" alt="" loading="lazy">${x.lvl && x.st !== 'broke' ? `<b class="itp-en">+${x.lvl}</b>` : ''}</span>
      <div class="enp-mid"><div class="enp-nm">${h(x.name)}${x.src !== 'bag' ? ` <span class="enp-src">${x.src === 'clan' ? 'clan warehouse' : 'warehouse'}</span>` : ''}</div>${pips(x)}${x.why ? `<div class="enp-why">${h(x.why)}</div>` : ''}</div>
      <div class="enp-state">${h(label)}</div></div>`;
  }
  function jobCard(j, big) {
    const n = j.items.length, finished = j.c.done + j.c.broke + j.c.dropped + j.c.skip, pct = n ? Math.round(finished / n * 100) : 0;
    const now = j.items.find(x => x.st === 'enchanting' || x.st === 'taking');
    const eta = !j.final && j.perTry && j.left ? `about ${mins(j.perTry * j.left)} left at most` : '';
    const head = `${h(j.doer)} · ${n} item${n === 1 ? '' : 's'} → +${j.to}${j.blessed ? ' (blessed)' : ''}`;
    const sum = [`<span class="enp-k ok">${gim('icon/etc_scroll_of_enchant_armor_i02')} ${j.c.done} reached +${j.to}</span>`, j.c.broke ? `<span class="enp-k bad">✗ ${j.c.broke} broke</span>` : '', j.c.dropped ? `<span class="enp-k warn">${j.c.dropped} dropped</span>` : '', j.c.work ? `<span class="enp-k now">${j.c.work} working</span>` : '', j.c.wait ? `<span class="enp-k">${j.c.wait} waiting</span>` : '', j.c.skip ? `<span class="enp-k">${j.c.skip} not done</span>` : ''].filter(Boolean).join('');
    const state = j.interrupted ? 'cut off' : j.final ? (j.state === 'done' ? 'finished' : 'stopped') : 'running';
    const left = j.items.filter(x => x.st === 'waiting' || x.st === 'stopped').length;
    const cut = j.interrupted ? `<div class="itp-danger enp-cut">${h(j.doer)}'s script was restarted in the middle of this job, so it stopped. ${left} item${left === 1 ? '' : 's'} not finished — nothing else happens until you press Resume.<button type="button" class="itp-go" data-enpresume="${h(j.id)}" data-enpdoer="${h(j.doer)}">Resume (${left} left)</button></div>` : '';
    const body = `${cut}<div class="enp-bar"><span style="width:${pct}%"></span></div>
      <div class="enp-sum">${sum}</div>
      <div class="enp-meta">${h(state)} · started ${h(day(j.created))} ${h(clock(j.created))}${j.tries ? ` · ${j.tries} scroll${j.tries === 1 ? '' : 's'} used` : ''}${eta ? ' · ' + h(eta) : ''}${j.overSafe && j.to > SAFE ? ` · <b class="enp-risk">above +${SAFE}: every fail ${j.blessed ? 'drops the item to +0' : 'destroys the item'}</b>` : ''}</div>
      ${j.scrolls.length ? `<div class="enp-meta">${j.scrolls.map(s => `${gim('icon/etc_scroll_of_enchant_armor_i01')} ${s.got != null ? s.got : s.n}× ${h(s.name)} from the ${h(s.from)}`).join(' · ')}</div>` : ''}
      ${now && !j.final ? `<div class="enp-now"><div class="enp-now-t">Now</div>${itemRow(now)}</div>` : ''}
      <div class="enp-list">${j.items.map(itemRow).join('')}</div>
      ${j.last ? `<div class="enp-last">Last: ${h(clock(j.last.t))} ${h(j.last.msg)}</div>` : ''}`;
    if (big) return `<div class="itp-sec enp-job enp-live"><div class="enp-title">${gim('icon/etc_scroll_of_enchant_armor_i02', 'big')} ${head}</div>${body}</div>`;
    const op = !!E.openOld[j.id];
    return `<div class="itp-sec enp-job"><button type="button" class="enp-oldhead" data-enpold="${h(j.id)}"><span>${h(day(j.created))} ${h(clock(j.created))} · ${head}</span><span class="enp-oldsum">${j.c.done} ✓${j.c.broke ? ' · ' + j.c.broke + ' ✗' : ''}${j.c.skip ? ' · ' + j.c.skip + ' not done' : ''} ${op ? '▲' : '▼'}</span></button>${op ? body : ''}</div>`;
  }
  function render() { if (!E.open) return; section(); $id('enpNew').innerHTML = `<div class="itp-sec enp-new"><div class="enp-title">${gim('icon/etc_scroll_of_enchant_weapon_i02', 'big')} New enchant</div>${builder()}</div>`; renderJobs(); }
  function renderJobs() {
    if (!E.open) return; const s = section();
    const live = E.jobs.filter(j => !j.final || j.interrupted), old = E.jobs.filter(j => j.final && !j.interrupted);
    $id('enpBody').innerHTML = (E.err ? `<div class="itp-bad">${h(E.err)}</div>` : '')
      + (live.length ? live.map(j => jobCard(j, true)).join('') : `<div class="itp-note">No enchanting running${E.who ? ' for ' + h(E.who) : ''} right now. Start one on the <a href="#/items${E.who ? '/' + encodeURIComponent(E.who) : ''}">Items</a> page (Enchant several, or tap an item).</div>`)
      + (old.length ? `<div class="itp-step">Earlier</div>${old.map(j => jobCard(j, false)).join('')}` : (E.ids.length || !E.jobs.length ? '' : ''))
      + (!E.jobs.length && !E.busy && !E.err ? '<div class="muted">No enchant jobs in the log yet.</div>' : '');
    void s;
  }

  // ---------------------------------------------------------------------------------------------------------------- frame + routing
  function section() {
    let s = $id(SEC); if (s) return s;
    s = document.createElement('section'); s.id = SEC; s.className = 'win itp enp'; s.hidden = true;
    s.innerHTML = `<div class="itp-head"><h2><img class="gi" src="${ico('icon/etc_scroll_of_enchant_armor_i02')}" alt=""> Enchanting</h2><a href="#/items" class="itp-link"><img class="gim" src="${ico('icon/etc_equip_item_box_i00')}" alt=""> Items →</a></div>
      <div id="enpNew"></div>
      <div class="itp-step">${gim('L2UI_CT1/crop/Icon_DF_MenuWnd_Quest')} Progress</div>
      <div class="itp-note">Each item, the + level it reached, what broke. Gold = reached, red ✗ = broke there, the line after +4 = from there a fail can cost the item.</div>
      <div id="enpBody"><div class="muted">Loading…</div></div>`;
    (document.querySelector('main') || document.body).appendChild(s);
    s.addEventListener('click', onClick); s.addEventListener('input', onInput); s.addEventListener('change', onInput);
    return s;
  }
  function open(who) {
    const s = section();
    try { stopChar(); } catch (e) { }
    try { TAB = 'enchanting'; [...$id('tabs').children].forEach(b => b.classList.toggle('on', b.dataset.tab === 'enchanting')); } catch (e) { }
    document.querySelectorAll('main > section').forEach(x => { if (x.id !== SEC) x.hidden = true; });
    s.hidden = false;
    if (who !== E.who) { E.who = who || ''; E.ids = []; E.jobs = []; if (who && who !== E.pick) { E.pick = who; E.d = null; E.sel = {}; } }
    E.open = true; render(); load(); if (!E.chars) loadChars(); else if (E.pick && !E.d) loadPick();
    setTimeout(() => { try { if (s.getBoundingClientRect().top > 40) s.scrollIntoView({ block: 'start' }); } catch (e) { } }, 300);
  }
  function close() { if (!E.open) return; E.open = false; clearTimeout(E.timer); const s = $id(SEC); if (s) s.hidden = true; }
  window.EnchantPage = { open, close, model, _state: E };
})();
