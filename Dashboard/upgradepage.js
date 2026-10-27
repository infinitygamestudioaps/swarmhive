// UPGRADE page #/upgrade (UPGRADE-2026-10-25; owner: "select a character then ask it to go get upgrades in town ... MORE than just a weapon ...
// armor pieces and equip them, then give your other spare items to the collector ... an entire raid waiting ... easily from my phone").
//   1. Who: tap characters (or a whole party)           2. What: search an item -> where it comes from (Giran shop / clan warehouse /
//   another character / own warehouse / own bag) -> added to every ticked character (one physical piece: to one character only)
//   3. Per line: + enchant level, Special Ability       4. Materials may come from: warehouse / clan warehouse / buy (ticked once)
//   5. Check -> the plan per character (steps, missing, adena, warnings) -> Start -> live progress per character
// The bot side runs ONE Giran trip per character (swarm.js UPGRADE-2026-10-25): get everything, enchant, SA, put it all on, the replaced
// pieces to the collector. API: Dashboard/upgrade_api.js. Uses index.html globals when present (api, stopChar, TAB).
(function () {
  'use strict';
  const SEC = 'tab-upgrade';
  const S = { open: false, chars: [], sel: new Set(), lines: {}, use: { wh: true, clan: true, buy: false }, overSafeOk: false, q: '', found: null, shops: null, pick: null,
    plan: null, busy: false, jobs: [], poll: 0, msg: '' };
  try { const v = JSON.parse(localStorage.getItem('upgDraft') || '{}'); if (v.lines) S.lines = v.lines; if (Array.isArray(v.sel)) S.sel = new Set(v.sel); if (v.use) S.use = v.use; if (Array.isArray(v.jobs)) S.jobs = v.jobs; if (v.cur) S.cur = v.cur; } catch (e) { }
  const save = () => { try { localStorage.setItem('upgDraft', JSON.stringify({ lines: S.lines, sel: [...S.sel], use: S.use, jobs: S.jobs, cur: S.cur || '' })); } catch (e) { } };
  const $id = (i) => document.getElementById(i);
  const h = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const kmb = (n) => { n = Number(n || 0); return n >= 1e9 ? (n / 1e9).toFixed(1) + 'bn' : n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'k' : String(n); };
  const call = async (u, body) => { if (typeof api === 'function') return api(u, body ? { method: 'POST', body: JSON.stringify(body) } : undefined);
    const k = new URLSearchParams(location.search).get('key'), q = k ? (u.includes('?') ? '&' : '?') + 'key=' + encodeURIComponent(k) : '';
    const r = await fetch(u + q, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined); return r.json(); };
  const icon = (p) => p ? `<img class="ic sm" src="/icons/${h(p)}.png" alt="" onerror="this.style.visibility='hidden'">` : '';
  const SRC = { shop: 'buy in Giran', clan: 'clan warehouse', wh: 'own warehouse', bag: 'own bag', char: 'from' };

  function section() {
    let s = $id(SEC); if (s) return s;
    s = document.createElement('section'); s.id = SEC; s.className = 'win upg'; s.hidden = true;
    s.innerHTML = `<style>
      .upg .u-chips{display:flex;flex-wrap:wrap;gap:6px}.upg .u-chips button{min-height:40px}.upg button.on{outline:2px solid var(--gold,#c9a54a)}
      .upg .u-row{display:flex;gap:6px;align-items:center;flex-wrap:wrap;padding:6px 0;border-top:1px solid rgba(255,255,255,.06)}.upg .u-row:first-child{border-top:0}
      .upg .u-row .u-n{flex:1 1 160px;min-width:0}.upg select,.upg input{font-size:16px;min-height:40px}.upg .u-res{padding:6px 0;border-top:1px solid rgba(255,255,255,.06)}
      .upg .u-src{display:flex;flex-direction:column;gap:6px}.upg .u-src button{text-align:left;min-height:44px}.upg .u-bad{color:var(--bad,#e66)}.upg .u-ok{color:var(--good,#6c6)}
      .upg .u-sticky{position:sticky;bottom:0;background:var(--bg,#16130f);padding:8px 0;display:flex;gap:6px;flex-wrap:wrap;z-index:2}
      .upg .u-sticky button{flex:1 1 140px;min-height:48px;font-size:16px}
      .upg .u-prow{display:flex;flex-wrap:wrap;gap:4px;padding:5px 0;border-top:1px solid rgba(255,255,255,.06);align-items:center}
      .upg .u-prow button{min-height:36px;padding:3px 9px;font-size:14px}.upg .u-pb{font-weight:bold}.upg .u-cb small{opacity:.7}
      .upg .u-doll{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,150px),1fr));gap:6px}
      .upg .u-tile{display:flex;flex-direction:column;align-items:flex-start;gap:2px;text-align:left;min-height:84px;padding:6px 8px;white-space:normal}
      .upg .u-tile.planned{outline:2px solid var(--good,#6c6)}.upg .u-tile.on{outline:2px solid var(--gold,#c9a54a)}
      .upg .u-tl{font-size:12px;opacity:.7}.upg .u-tn{font-size:14px;line-height:1.2}.upg .u-tg{font-size:12px;opacity:.7}.upg .u-tp{font-size:12px;color:var(--good,#6c6)}
      .upg .u-cand{padding:8px 0;border-top:1px solid rgba(255,255,255,.08)}.upg .u-srcs{display:flex;flex-wrap:wrap;gap:4px;margin-top:4px}
      .upg .u-srcs button{min-height:38px;font-size:13px;padding:3px 8px}.upg .u-s-shop{opacity:.9}.upg .u-s-craft{font-style:italic}
      .upg details.box>summary{cursor:pointer;min-height:40px;display:flex;align-items:center}
    </style><div class="whead"><h2>Upgrade gear</h2><span class="muted">several characters · several items · one trip to Giran each</span></div><div id="upBody"></div>`;
    (document.querySelector('main') || document.body).appendChild(s);
    s.addEventListener('click', onClick); s.addEventListener('change', onChange); s.addEventListener('input', onInput);
    return s;
  }
  // RECOMMEND-2026-10-25: #/upgrade/<name> (the character page's "Upgrade" button) opens that character's paperdoll + recommendations
  function route(kind, arg) { if (kind === 'upgrade') { open(arg ? decodeURIComponent(arg) : ''); return true; } close(); return false; }
  async function open(who) {
    if (who && who !== S.cur) { S.cur = who; S.sel = new Set([who]); S.pickOpen = false; S.slot = null; S.cand = null; S.presetNote = ''; S.doll = null; save(); }
    const s = section();
    try { stopChar(); } catch (e) { }
    try { TAB = 'upgrade'; [...$id('tabs').children].forEach(b => b.classList.toggle('on', b.dataset.tab === 'upgrade')); } catch (e) { }
    document.querySelectorAll('main > section').forEach(x => { if (x.id !== SEC) x.hidden = true; });
    s.hidden = false; S.open = true; window.scrollTo(0, 0);
    try { const r = await call('/api/items/chars'); S.chars = (r && r.chars) || []; } catch (e) { S.msg = e.message; }
    render(); loadJobs(); if (S.cur && (!S.doll || S.doll.name !== S.cur)) loadDoll(); if (S.cur && (!S.rec || S.rec.name !== S.cur)) loadRec();
    clearInterval(S.poll); S.poll = setInterval(() => { if (S.open && !document.hidden && S.jobs.length) pollJobs(); }, 6000);
  }
  function close() { if (!S.open) return; S.open = false; clearInterval(S.poll); const s = $id(SEC); if (s) s.hidden = true; }

  // ---- 1. who ----
  // the picker folds away once characters are chosen (79 characters do not fit a phone screen); one compact row per party
  function whoHtml() {
    const sel = [...S.sel];
    if (!S.pickOpen && sel.length) return `<div class="box"><h3>1. Who <span class="muted">${sel.length} chosen</span></h3>
      <div class="u-chips">${sel.map(n => `<span class="chip">${h(n)}</span>`).join('')}<button data-upick="1">Change</button></div>
      <div class="u-row"><span class="u-n">Fill in the gear plan's pieces they do not wear yet:</span><select id="upGrade">${['D', 'C', 'B', 'A', 'S'].map(g => `<option ${(S.grade || 'C') === g ? 'selected' : ''}>${g}</option>`).join('')}</select><button data-upreset="1">Top ${h(S.grade || 'C')}-grade for their class</button></div>
      ${S.presetNote ? `<div class="muted" style="font-size:13px">${S.presetNote}</div>` : ''}</div>`;
    const parties = {}; S.chars.forEach(c => { (parties[c.party || c.name] = parties[c.party || c.name] || []).push(c); });
    return `<div class="box"><h3>1. Who gets upgrades <span class="muted">${sel.length} chosen</span></h3>
      <div class="muted" style="margin-bottom:4px">Tap names, or a party name for the whole party.</div>
      ${Object.keys(parties).sort().map(p => { const L = parties[p], all = L.every(c => S.sel.has(c.name));
        return `<div class="u-prow"><button class="u-pb${all ? ' on' : ''}" data-uparty="${h(p)}">${h(p)} ·${L.length}</button>${L.filter(c => c.name !== p || L.length > 1).map(c => `<button class="u-cb${S.sel.has(c.name) ? ' on' : ''}" data-uchar="${h(c.name)}">${h(c.name)} <small>${c.level || '?'}</small></button>`).join('')}</div>`; }).join('') || '<div class="muted">loading characters…</div>'}
      ${sel.length ? `<div class="u-row"><button data-upick="0" style="flex:1 1 auto;min-height:44px">Done — ${sel.length} chosen</button></div>` : ''}</div>`;
  }
  // ---- PAPERDOLL-2026-10-25 (owner: "select a character and then see their equipped items and click on each slot and select what I want based on what
  // we have and what we can create from Giran town ... I don't want to search around and remember all the different things we have") ----
  function charPickHtml() {
    const parties = {}; S.chars.forEach(c => { (parties[c.party || c.name] = parties[c.party || c.name] || []).push(c); });
    if (S.cur && !S.pickOpen) {
      const c = S.chars.find(x => x.name === S.cur) || {}, others = Object.keys(S.lines).filter(n => n !== S.cur && (S.lines[n] || []).length);
      return `<div class="box"><div class="u-row" style="border:0"><span class="u-n"><b style="font-size:18px">${h(S.cur)}</b> <span class="muted">lvl ${c.level || '?'} ${h(c.cls || '')} · party ${h(c.party || '')} · ${kmb(c.adena)} adena</span></span><button data-upick="1">Other character</button></div>
        ${others.length ? `<div class="u-chips">${others.map(n => `<button data-ucur="${h(n)}">${h(n)} <span class="chip">${S.lines[n].length}</span></button>`).join('')}</div>` : ''}</div>`;
    }
    return `<div class="box"><h3>Choose a character</h3>${Object.keys(parties).sort().map(p => `<div class="u-prow"><span class="u-pb" style="min-width:90px">${h(p)}</span>${parties[p].map(c => {
      const n = (S.lines[c.name] || []).length; return `<button class="u-cb${S.cur === c.name ? ' on' : ''}" data-ucur="${h(c.name)}">${h(c.name)} <small>${c.level || '?'}</small>${n ? ` <span class="chip">${n}</span>` : ''}</button>`; }).join('')}</div>`).join('') || '<div class="muted">loading characters…</div>'}</div>`;
  }
  function dollHtml() {
    const D = S.doll; if (!S.cur) return '';
    if (!D || D.name !== S.cur) return '<div class="box muted">loading what it wears…</div>';
    if (D.error) return `<div class="box">${h(D.error)}</div>`;
    const L = S.lines[S.cur] || [];
    const tile = (s) => { const planned = L.find(l => l.slot === s.slot && (l.idx || 0) === s.idx), it = s.item, on = S.slot && S.slot.slot === s.slot && S.slot.idx === s.idx;
      return `<button class="u-tile${on ? ' on' : ''}${planned ? ' planned' : ''}" data-uslot="${s.slot}|${s.idx}" ${s.blocked ? 'disabled' : ''}>
        <span class="u-tl">${h(s.label)}</span>${it ? `${icon(it.icon)}<span class="u-tn">${h(it.name.replace(/^Common Item - /, 'Common '))}${it.enchant ? ' <b>+' + it.enchant + '</b>' : ''}</span><span class="u-tg">${h(it.grade)}${it.sa ? ' · ' + h(it.sa) : ''}</span>` : `<span class="u-tn muted">${s.blocked ? h(s.blocked) : 'empty'}</span>`}
        ${planned ? `<span class="u-tp">→ ${h(planned.name)}${planned.enchantTo ? ' +' + planned.enchantTo : ''}</span>` : ''}</button>`; };
    return `<div class="box"><h3>What ${h(S.cur)} wears <span class="muted">tap a slot</span></h3><div class="u-doll">${D.slots.map(tile).join('')}</div>
      <div class="u-row"><span class="u-n muted">Or fill every slot from the gear plan:</span><select id="upGrade">${['D', 'C', 'B', 'A', 'S'].map(g => `<option ${(S.grade || 'C') === g ? 'selected' : ''}>${g}</option>`).join('')}</select><button data-upreset="me">Top ${h(S.grade || 'C')} for ${h(S.cur)}</button><button data-upreset="party">… for the whole party</button></div>
      ${S.presetNote ? `<div class="muted" style="font-size:13px">${S.presetNote}</div>` : ''}</div>`;
  }
  const SRCORDER = { bag: 0, wh: 1, clan: 2, char: 3, shop: 4, craft: 5 };
  function candHtml() {
    const C = S.cand; if (!S.slot || !S.cur) return '';
    if (!C || C.loading) return '<div class="box muted" id="upCand">loading what we have for this slot…</div>';
    if (C.error) return `<div class="box" id="upCand">${h(C.error)}</div>`;
    const F = S.cf = S.cf || { grade: '', have: false, other: false };
    const GR = ['NONE', 'D', 'C', 'B', 'A', 'S', 'S80', 'S84'], grades = [...new Set(C.items.map(i => i.grade))].sort((a, b) => GR.indexOf(a) - GR.indexOf(b));
    const list = C.items.filter(i => (!F.grade || i.grade === F.grade) && (F.other || i.typeOk) && (!F.have || i.sources.some(x => /^(bag|wh|clan|char)$/.test(x.src))));
    const w = C.worn[0];
    const row = (i) => { const diff = w ? i.stat - w.stat : i.stat;
      return `<div class="u-cand"><div>${icon(i.icon)} <b>${h(i.name)}</b> <span class="muted">${h(i.grade)}${i.wtype ? ' · ' + h(i.wtype.toLowerCase()) : ''}</span>
        ${i.stat ? ` <span class="${diff > 0 ? 'u-ok' : diff < 0 ? 'u-bad' : 'muted'}">${i.pa != null || i.ma != null ? `P.Atk ${i.pa || 0} / M.Atk ${i.ma || 0}` : i.pd ? `P.Def ${i.pd}` : `M.Def ${i.md}`} (${diff > 0 ? '+' : ''}${diff})</span>` : ''}
        ${i.recommended ? '<span class="chip ok">gear plan</span>' : ''}${i.wornNow ? '<span class="chip">wears it</span>' : ''}${!i.levelOk ? '<span class="chip bad">level too low</span>' : ''}${!i.typeOk ? '<span class="chip">other type</span>' : ''}${i.common ? '<span class="chip">Common (no set bonus, no enchant)</span>' : ''}</div>
        <div class="u-srcs">${i.sources.slice().sort((a, b) => SRCORDER[a.src] - SRCORDER[b.src]).map((s, k) => `<button data-ucand="${i.id}|${k}" class="u-s-${s.src}">${h(s.label)}</button>`).join('')}</div></div>`; };
    return `<div class="box" id="upCand"><h3>${h(S.slot.label)} for ${h(S.cur)}${w ? ` <span class="muted">now: ${h(w.name)}${w.enchant ? ' +' + w.enchant : ''}</span>` : ''}</h3>
      <div class="u-chips"><button class="${!F.grade ? 'on' : ''}" data-ucf="grade|">All grades</button>${grades.map(g => `<button class="${F.grade === g ? 'on' : ''}" data-ucf="grade|${g}">${g}</button>`).join('')}
        <button class="${F.have ? 'on' : ''}" data-ucf="have|">Only what we have</button><button class="${F.other ? 'on' : ''}" data-ucf="other|">Other weapon / armor types</button>
        <button data-ucclose="1">Close</button></div>
      <div class="muted" style="margin:4px 0">${list.length} of ${C.items.length}${C.more ? ' (+' + C.more + ' more, use the filters)' : ''} — tap where it should come from.</div>
      ${list.slice(0, 40).map(row).join('') || '<div class="muted">nothing with these filters</div>'}</div>`;
  }
  // ---- RECOMMEND-2026-10-25 (owner: "it should show recommended items to upgrade or replace ... every warehouse, clan warehouse or inventory ...
  // also what is possible via Giran or trades, but should warn about cost for buying"): per slot the best piece we have / can buy / can craft ----
  async function loadRec() { const n = S.cur; S.rec = { name: n, loading: true }; render();
    try { const r = await call('/api/upgrade/recommend?name=' + encodeURIComponent(n)); if (S.cur === n) { S.rec = Object.assign({ name: n }, r); render(); } } catch (e) { S.rec = { name: n, error: e.message }; render(); } }
  function recHtml() {
    const R = S.rec; if (!S.cur || !R || R.name !== S.cur) return '';
    if (R.loading) return '<div class="box muted">Looking through every bag, warehouse, the clan warehouse, Giran and our crafters…</div>';
    if (R.error) return `<div class="box">${h(R.error)}</div>`;
    if (!R.slots.length) return `<div class="box"><h3>Recommended upgrades</h3><div class="muted">Nothing we have, can buy in Giran or can craft beats what ${h(S.cur)} wears for level ${R.level || '?'}. Tap a slot below to see everything anyway.</div></div>`;
    const planned = (sl) => (S.lines[S.cur] || []).find(l => l.slot === sl && (l.idx || 0) === 0);
    const buyAll = R.slots.reduce((t, x) => t + (!x.have && x.buy ? x.buy.cost : 0), 0);
    const opt = (x, k, kind) => x ? `<div class="u-row" style="border:0;padding:2px 0"><span class="u-n">${icon(x.icon)} ${h(x.name)} <span class="muted">${h(x.grade)}</span> <span class="u-ok">+${x.gain}</span>
        ${x.recommended ? '<span class="chip ok">gear plan</span>' : ''}<br><span class="muted" style="font-size:13px">${kind === 'buy' ? '<span class="u-bad">costs ' + kmb(x.cost) + ' adena</span> · ' + h(x.src.label) : kind === 'craft' ? h(x.src.label) : x.trade ? 'trade from ' + h(x.trade) + "'s bag (free)" : h(x.src.label)}</span></span>
        <button data-urec="${k}|${kind}">Add</button></div>` : '';
    return `<div class="box"><h3>Recommended upgrades <span class="muted">${R.slots.length} slot(s)</span></h3>
      <div class="muted" style="font-size:13px;margin-bottom:4px">Better than what ${h(S.cur)} wears and fit for level ${R.level || '?'} — from every bag, warehouse and the clan warehouse first, then Giran and our crafters. ${buyAll ? '<span class="u-bad">Buying everything not owned: about ' + kmb(buyAll) + ' adena (' + h(S.cur) + ' has ' + kmb(R.adena) + ').</span>' : ''}</div>
      ${R.slots.map((x, k) => { const p = planned(x.slot); return `<div class="u-res"><b>${h(x.label)}</b> <span class="muted">now: ${x.worn ? h(x.worn.name) + (x.worn.enchant ? ' +' + x.worn.enchant : '') : 'nothing'}</span>${p ? ` <span class="u-ok">→ planned: ${h(p.name)}</span>` : ''}
        ${opt(x.have, k, 'have')}${opt(x.buy, k, 'buy')}${opt(x.craft, k, 'craft')}</div>`; }).join('')}</div>`;
  }
  function addPick(i, s, slot, idx, label) {
    if (s.src === 'craft') {   // a crafted piece: the crafter makes it and hands it over (Make several, prefilled)
      S.mk = { doer: s.crafter, q: '', item: { id: i.id, name: i.name, icon: i.icon, src: 'craft', recipe: s.recipe }, count: 1, to: 0, give: true, giveTo: [S.cur], plan: null, found: null };
      S.msg = `${i.name}: ${s.crafter} crafts it and hands it to ${S.cur} — check it in "Make several" below.`; render(); const el = $id('upMake'); if (el) el.scrollIntoView({ behavior: 'smooth' }); return;
    }
    const line = { id: i.id, name: i.name, icon: i.icon, grade: i.grade, slot, idx, src: s.src, enchant: s.enchant || 0, objId: s.objId || 0, char: s.char || '', offer: s.offer || null, enchantTo: 0, saId: 0 };
    const L = S.lines[S.cur] = (S.lines[S.cur] || []).filter(l => !(l.slot === line.slot && (l.idx || 0) === line.idx));
    L.push(line); S.plan = null; S.slot = null; S.cand = null; S.msg = label ? label + ' added to the order (3).' : ''; save(); render();
  }
  async function loadDoll() { const n = S.cur; S.doll = null; render(); try { const d = await call('/api/upgrade/doll?name=' + encodeURIComponent(n)); if (S.cur === n) { S.doll = Object.assign({ name: n }, d); render(); } } catch (e) { S.doll = { name: n, error: e.message }; render(); } }
  async function loadCand() { const n = S.cur, s = S.slot; S.cand = { loading: true }; render(); const el = $id('upCand'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    try { const c = await call(`/api/upgrade/slot?name=${encodeURIComponent(n)}&slot=${s.slot}`); if (S.cur === n && S.slot === s) { S.cand = c; render(); } } catch (e) { S.cand = { error: e.message }; render(); } }
  function pickCand(id, k) {
    const i = (S.cand.items || []).find(x => x.id === id), s = i && i.sources.slice().sort((a, b) => SRCORDER[a.src] - SRCORDER[b.src])[k]; if (!s) return;
    return addPick(i, s, S.slot.slot, S.slot.idx, '');
    if (s.src === 'craft') {   // a crafted piece: the crafter makes it and hands it over (Make several, prefilled)
      S.mk = { doer: s.crafter, q: '', item: { id: i.id, name: i.name, icon: i.icon, src: 'craft', recipe: s.recipe }, count: 1, to: 0, give: true, giveTo: [S.cur], plan: null, found: null };
      S.msg = `${i.name}: ${s.crafter} crafts it and hands it to ${S.cur} — check it in "Make several" below.`; render(); const el = $id('upMake'); if (el) el.scrollIntoView({ behavior: 'smooth' }); return;
    }
    const line = { id: i.id, name: i.name, icon: i.icon, grade: i.grade, slot: S.slot.slot, idx: S.slot.idx, src: s.src, enchant: s.enchant || 0, objId: s.objId || 0, char: s.char || '', offer: s.offer || null, enchantTo: 0, saId: 0 };
    const L = S.lines[S.cur] = (S.lines[S.cur] || []).filter(l => !(l.slot === line.slot && (l.idx || 0) === line.idx));
    L.push(line); S.plan = null; S.slot = null; S.cand = null; save(); render();
  }
  // ---- 2. what (fallback: any item by name) ----
  function findHtml() {
    const r = S.found;
    let res = '';
    if (r && r.error) res = `<div class="muted">${h(r.error)}</div>`;
    else if (r) {
      const shopRows = (S.shops || []).filter(x => x.name.toLowerCase().includes(S.q.toLowerCase())).slice(0, 12);
      const items = {}; (r.items || []).forEach(g => { items[g.id] = g; }); shopRows.forEach(x => { items[x.id] = items[x.id] || { id: x.id, name: x.name, icon: x.icon, grade: x.grade, holders: [] }; items[x.id].shop = items[x.id].shop || x; });
      const list = Object.values(items).slice(0, 20);
      res = list.map(g => `<div class="u-row"><span class="u-n">${icon(g.icon)} <b>${h(g.name)}</b> <span class="muted">${h(g.grade || '')}</span></span><button data-uitem="${g.id}">Choose</button></div>`).join('') || '<div class="muted">nothing found</div>';
      S._list = items;
    }
    const pk = S.pick ? pickHtml() : '';
    return `<div><h3>Any item</h3><div class="u-row"><input id="upQ" placeholder="Search: Karmian, Homunkulus, Demon's, Earring…" value="${h(S.q)}" style="flex:1 1 200px"><button data-ufind="1">Search</button></div>${pk || res}</div>`;
  }
  function pickHtml() {
    const g = S.pick, sel = [...S.sel], opts = [];
    if (g.shop) opts.push({ k: 'shop', label: `Buy in Giran at ${g.shop.npc} — ${kmb(Math.ceil(g.shop.price * 1.2))} each`, many: true });
    (g.holders || []).forEach(H => (H.rows || []).forEach(r => {
      if (H.kind === 'clan') opts.push({ k: 'clan', ench: r.enchant, label: `Clan warehouse: +${r.enchant} (${r.count})`, count: r.count });
      else if (r.where === 'bag') opts.push({ k: 'char', char: H.name, ench: r.enchant, objId: r.objId || 0, label: `${H.name}'s bag: +${r.enchant}${r.count > 1 ? ' (' + r.count + ')' : ''}`, count: r.count, owner: H.name });
      else if (r.where === 'wh') opts.push({ k: 'wh', owner: H.name, ench: r.enchant, label: `${H.name}'s own warehouse: +${r.enchant} (only for ${H.name})`, count: r.count });
    }));
    S._opts = opts;
    return `<div class="u-src"><div><b>${icon(g.icon)} ${h(g.name)}</b> → for <b>${sel.length ? sel.map(h).join(', ') : 'nobody chosen yet'}</b></div>
      ${opts.map((o, i) => `<button data-uopt="${i}">${h(o.label)}${!o.many && sel.length > 1 ? ` <span class="muted">— to ${h(o.k === 'wh' ? o.owner : (o.count > 1 ? 'the first ' + Math.min(o.count, sel.length) : sel[0]))}</span>` : ''}</button>`).join('') || '<div class="muted">We have none and no Giran shop sells it.</div>'}
      <button data-ucancel="1">Cancel</button></div>`;
  }
  function addLine(name, L) { (S.lines[name] = S.lines[name] || []).push(L); }
  function choose(i) {
    const o = S._opts[i], g = S.pick, sel = [...S.sel]; if (!o) return;
    const base = { id: g.id, name: g.name, icon: g.icon, grade: g.grade, enchantTo: 0, saId: 0 };
    if (o.k === 'shop') sel.forEach(n => addLine(n, Object.assign({}, base, { src: 'shop', offer: g.shop.offer, enchant: 0 })));
    else if (o.k === 'wh') addLine(o.owner, Object.assign({}, base, { src: 'wh', enchant: o.ench }));
    else { const n = Math.min(o.count || 1, sel.length) || 1; sel.slice(0, n).filter(x => !(o.k === 'char' && x === o.char)).forEach(x => addLine(x, Object.assign({}, base, { src: o.k === 'clan' ? 'clan' : 'char', char: o.char || '', objId: n === 1 ? o.objId : 0, enchant: o.ench }))); }
    S.pick = null; S.plan = null; save(); render();
  }
  // ---- 3. the order ----
  function orderHtml() {
    const names = Object.keys(S.lines).filter(n => (S.lines[n] || []).length);
    if (!names.length) return '<div class="box muted">3. Nothing added yet: choose characters (1) and add items (2).</div>';
    const pl = S.plan && S.plan.orders ? Object.fromEntries(S.plan.orders.map(o => [o.name, o])) : {};
    return `<div class="box"><h3>3. The order</h3>${names.map(n => { const P = pl[n];
      return `<div class="u-res"><div><b>${h(n)}</b>${P ? ` — ${P.ok ? '<span class="u-ok">ready</span>' : '<span class="u-bad">' + h(P.why || 'not ready') + '</span>'}${/adena/.test(P.why || '') ? '' : ` · about ${kmb(P.adena)} adena of ${kmb(P.haveAdena)}`}` : ''}</div>
        ${S.lines[n].map((L, i) => { const R = P && P.lines[i]; const sa = (R && R.saOptions && R.saOptions.length ? R.saOptions : L.saOpts) || [];
          return `<div class="u-row"><span class="u-n">${icon(L.icon)} ${h(L.name)} <span class="muted">${L.enchant ? '+' + L.enchant + ' · ' : ''}${h(SRC[L.src] || L.src)}${L.char ? ' ' + h(L.char) : ''}</span></span>
            <select data-uench="${h(n)}|${i}" title="enchant to">${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(v => `<option value="${v}" ${(L.enchantTo || 0) === v ? 'selected' : ''}>${v ? '+' + v : 'no enchant'}${v > 4 ? ' ⚠' : ''}</option>`).join('')}</select>
            ${sa.length || L.saId ? `<select data-usa="${h(n)}|${i}"><option value="0">no SA</option>${sa.map(s => `<option value="${s.saId}" ${Number(L.saId) === s.saId ? 'selected' : ''}>SA ${h(s.sa)}</option>`).join('')}</select>` : ''}
            <button data-uaug="${h(n)}|${i}">${L.augment ? 'Augment ✓' : 'Augment…'}</button>
            <button data-udel="${h(n)}|${i}" title="remove">✕</button></div>
            ${L.augment ? `<div class="muted" style="font-size:13px">Augment: ${h(L.augment.stoneName)} · up to ${L.augment.max} stone(s) · aiming for ${L.augment.wanted.length}: ${L.augment.wanted.slice(0, 4).map(id => h((L.augment.names || {})[id] || id)).join(' / ')}${L.augment.wanted.length > 4 ? ' …' : ''}</div>` : ''}
            ${S.aug && S.aug.n === n && S.aug.i === i ? augHtml(n, L) : ''}
            ${R ? `<div class="muted" style="font-size:13px">${R.error ? '<span class="u-bad">' + h(R.error) + '</span>' : (R.steps || []).map(h).join(' → ')}${R.missing && R.missing.length ? '<div class="u-bad">missing: ' + R.missing.map(h).join(', ') + '</div>' : ''}${(R.warn || []).length ? '<div>' + R.warn.map(h).join('<br>') + '</div>' : ''}</div>` : ''}`; }).join('')}</div>`; }).join('')}
      <div class="u-row"><span class="u-n">Scrolls, soul crystals, gemstones may come from:</span>
        ${['wh', 'clan', 'buy'].map(k => `<button class="${S.use[k] ? 'on' : ''}" data-uuse="${k}">${{ wh: 'own warehouse', clan: 'clan warehouse', buy: 'buy in Giran' }[k]}</button>`).join('')}</div>
      ${S.plan && S.plan.orders && S.plan.orders.some(o => o.lines.some(l => (l.overSafe || []).length)) ? `<label style="display:flex;gap:8px;align-items:flex-start;padding:6px 0"><input type="checkbox" id="upSafe" ${S.overSafeOk ? 'checked' : ''} style="min-height:auto;width:22px;height:22px;flex:0 0 auto"> <span class="u-bad">I accept the warnings above (above +4 a failed scroll destroys the item; big costs)</span></label>` : ''}
      <div class="muted">After putting everything on, the replaced pieces stay in this character's bag (never sold, never handed away).</div></div>`;
  }
  // ---- augment picker (AUGMENT-2026-10-25: "let me select the life stone augmentation I want to aim for") ----
  const JEWEL = /earring|ring|necklace|neck/i;
  function augHtml(n, L) {
    const A = S.aug; if (!A.stones) return '<div class="box muted">loading life stones…</div>';
    const jewel = JEWEL.test(L.name), list = A.stones.filter(s => (s.kind === 'accessory') === jewel);
    const q = (A.q || '').toLowerCase(), opts = (A.opts || []).filter(o => !q || o.text.toLowerCase().includes(q)).slice(0, 80);
    return `<div class="box" style="margin:6px 0"><b>Augment ${h(L.name)}</b>
      <div class="u-row"><select data-uastone="1" style="flex:1 1 200px"><option value="">— choose a life stone —</option>${list.map(s => `<option value="${s.id}" ${A.stone === s.id ? 'selected' : ''}>${h(s.name)} · have ${s.have.total}</option>`).join('')}</select>
        ${!jewel ? ['warrior', 'mage'].map(t => `<button class="${A.type === t ? 'on' : ''}" data-uatype="${t}">${t === 'warrior' ? 'fighter table' : 'mage table'}</button>`).join('') : ''}</div>
      ${A.stone ? `<div class="u-row"><input id="upAQ" placeholder="Search a bonus: Empower, Acumen, MEN +1, P. Atk…" value="${h(A.q || '')}" style="flex:1 1 200px"></div>
        <div style="max-height:320px;overflow:auto">${opts.map(o => `<label class="u-row" style="font-size:14px"><input type="checkbox" data-uaopt="${o.id}" ${A.sel.has(o.id) ? 'checked' : ''} style="width:22px;height:22px;min-height:auto"> <span class="u-n">${h(o.text)}</span><span class="muted">${o.pct >= 0.1 ? o.pct.toFixed(2) : o.pct.toFixed(4)}%</span></label>`).join('') || '<div class="muted">nothing matches</div>'}</div>
        <div class="u-row"><span class="u-n">${A.sel.size} wanted · chance per try about <b>${(A.opts || []).filter(o => A.sel.has(o.id)).reduce((t, o) => t + o.pct, 0).toFixed(3)}%</b></span>
          Max stones <input id="upAMax" type="number" min="1" max="200" value="${A.max || 10}" style="width:80px"></div>` : ''}
      <div class="u-row"><button data-uasave="1" ${A.stone && A.sel.size ? '' : 'disabled'}>Save augment</button>${L.augment ? '<button data-uaclear="1">No augment</button>' : ''}<button data-uacancel="1">Close</button></div></div>`;
  }
  async function augOpen(n, i) {
    const L = S.lines[n][i]; const cur = L.augment || null;
    S.aug = { n, i, stones: null, stone: cur ? cur.stone : 0, type: (cur && cur.type) || 'warrior', q: '', sel: new Set(cur ? cur.wanted : []), max: cur ? cur.max : 10, opts: null, names: Object.assign({}, cur && cur.names) };
    render();
    try { const r = await call('/api/augments'); S.aug.stones = (r && r.stones) || []; } catch (e) { S.aug.stones = []; }
    if (S.aug.stone) await augLoad(); render();
  }
  async function augLoad() {
    const A = S.aug; if (!A || !A.stone) return;
    try { const r = await call(`/api/augments/stone?id=${A.stone}&type=${A.type}`); A.type = r.type; A.opts = [].concat(...(r.lines || []).map(Ln => [].concat(...Ln.cats.map(c => c.opts)))).sort((a, b) => b.pct - a.pct); } catch (e) { A.opts = []; }
    (A.opts || []).forEach(o => { A.names[o.id] = o.text; });
  }
  // ---- MAKEX-2026-10-25: "buy x homunkulus swords in Giran OR craft them, then enchant them to +x" ----
  function makeHtml() {
    const M = S.mk = S.mk || { doer: '', q: '', item: null, count: 5, to: 0, give: false, plan: null, found: null };
    const doers = S.chars.map(c => c.name);
    const res = M.found ? `<div>${M.found.map((r, i) => `<div class="u-row"><span class="u-n">${icon(r.icon)} ${h(r.name)} <span class="muted">${r.src === 'craft' ? 'craft (' + h(M.doer) + ')' : 'Giran ' + h(r.npc) + ' · ' + kmb(Math.ceil(r.price * 1.2))}</span></span><button data-umkpick="${i}">Choose</button></div>`).join('') || '<div class="muted">nothing found</div>'}</div>` : '';
    const P = M.plan;
    return `<div class="box" id="upMake"><h3>Make several (buy or craft, then enchant)</h3>
      <div class="u-row"><span class="u-n">Who makes them</span><select data-umkdoer="1" style="flex:1 1 160px"><option value="">— choose —</option>${doers.map(n => `<option ${M.doer === n ? 'selected' : ''}>${h(n)}</option>`).join('')}</select></div>
      ${M.item ? `<div class="u-row"><span class="u-n">${icon(M.item.icon)} <b>${h(M.item.name)}</b> <span class="muted">${M.item.src === 'craft' ? 'crafted' : 'bought in Giran'}</span></span><button data-umkclear="1">Change</button></div>`
        : mkPickHtml()}
      ${M.item ? `<div class="u-row">How many <input id="upMN" type="number" min="1" max="50" value="${M.count}" style="width:80px"> Enchant each to <select data-umkto="1">${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(v => `<option value="${v}" ${M.to === v ? 'selected' : ''}>${v ? '+' + v : 'no enchant'}${v > 4 ? ' ⚠' : ''}</option>`).join('')}</select></div>
        <label class="u-row"><input type="checkbox" id="upMGive" ${M.give ? 'checked' : ''} style="width:22px;height:22px;min-height:auto"> give one each to: ${h((M.giveTo && M.giveTo.length ? M.giveTo : (S.cur ? [S.cur] : [])).join(', ') || 'nobody chosen')}</label>
        ${P ? `<div class="u-res">${P.error ? '<span class="u-bad">' + h(P.error) + '</span>' : `${(P.steps || []).map(h).join(' → ')}${(P.warn || []).map(w => '<div class="muted">' + h(w) + '</div>').join('')}${(P.overSafe || []).length ? `<label class="u-row"><input type="checkbox" id="upMSafe" ${M.safe ? 'checked' : ''} style="width:22px;height:22px;min-height:auto"> <span class="u-bad">${P.overSafe.map(h).join(' ')} — I accept</span></label>` : ''}`}</div>` : ''}
        <div class="u-row"><button data-umkcheck="1">Check</button><button data-umkstart="1" ${P && !P.error ? '' : 'disabled'}>Start making</button></div>` : ''}</div>`;
  }
  // ---- MAKEPICK-2026-10-25 (owner: "it's annoying that I have to search for items ... and it does not work either, I want to select them by
  // seeing their icon and grade and type JUST as before"): every gear piece we can buy in Giran (luxury shop included) or craft, as tiles
  // (icon, name, grade, price / crafter); chips for kind, grade, type and buy / craft; an optional name filter (live, no Search button) ----
  const GR_ORDER = ['NONE', 'D', 'C', 'B', 'A', 'S', 'S80', 'S84'];
  const TYPE_NAME = { SWORD: 'sword', BIGSWORD: '2h sword', BLUNT: 'blunt', BIGBLUNT: '2h blunt', DAGGER: 'dagger', DUAL: 'dual swords', DUALFIST: 'fists', FIST: 'fists', BOW: 'bow', POLE: 'polearm', ETC: 'other',
    RAPIER: 'rapier', ANCIENTSWORD: 'ancient sword', CROSSBOW: 'crossbow', DUALDAGGER: 'dual daggers', HEAVY: 'heavy', LIGHT: 'light', MAGIC: 'robe', SIGIL: 'sigil',
    chest: 'top / full body', fullarmor: 'full body', legs: 'legs', head: 'helmet', gloves: 'gloves', feet: 'boots', lhand: 'shield', earring: 'earrings', ring: 'rings', neck: 'necklaces' };
  async function mkCatalog() { if (S.cat || S.catLoading) return; S.catLoading = true; try { S.cat = await call('/api/upgrade/catalog'); } catch (e) { S.cat = { error: e.message }; } S.catLoading = false; render(); }
  function mkTypeOf(i) { return i.kind === 'weapon' ? (i.wtype || 'ETC') : i.kind === 'jewel' ? i.slot : (i.slot === 'chest' || i.slot === 'legs' || i.slot === 'fullarmor' ? (i.wtype || i.slot) + '' : i.slot); }
  function mkPickHtml() {
    const M = S.mk, C = S.cat;
    if (!C) { mkCatalog(); return '<div class="muted">loading everything we can buy or craft…</div>'; }
    if (C.error) return `<div class="u-bad">${h(C.error)}</div>`;
    const P = M.pk = M.pk || { kind: 'weapon', grade: '', type: '', src: '' };
    const inKind = C.items.filter(i => i.kind === P.kind);
    const grades = [...new Set(inKind.map(i => i.grade))].sort((a, b) => GR_ORDER.indexOf(a) - GR_ORDER.indexOf(b));
    const types = [...new Set(inKind.filter(i => !P.grade || i.grade === P.grade).map(mkTypeOf))].sort();
    const chip = (attr, v, cur, label) => `<button class="${cur === v ? 'on' : ''}" data-${attr}="${h(v)}">${h(label)}</button>`;
    return `<div class="u-chips" style="margin:4px 0">${[['weapon', 'Weapons'], ['armor', 'Armor'], ['jewel', 'Jewelry']].map(([v, t]) => chip('umkk', v, P.kind, t)).join('')}</div>
      <div class="u-chips" style="margin:4px 0">${chip('umkg', '', P.grade, 'All grades')}${grades.map(g => chip('umkg', g, P.grade, g === 'NONE' ? 'no grade' : g)).join('')}</div>
      <div class="u-chips" style="margin:4px 0">${chip('umkt', '', P.type, 'Every type')}${types.map(t => chip('umkt', t, P.type, TYPE_NAME[t] || t.toLowerCase())).join('')}</div>
      <div class="u-chips" style="margin:4px 0">${chip('umks', '', P.src, 'Buy or craft')}${chip('umks', 'buy', P.src, 'Buy in Giran')}${chip('umks', 'craft', P.src, 'Our crafters')}
        <input id="upMQ" type="search" placeholder="filter by name (optional)" value="${h(M.q)}" style="flex:1 1 160px"></div>
      <div id="upMkGrid">${mkGridHtml()}</div>`;
  }
  function mkGridHtml() {
    const M = S.mk, C = S.cat, P = M.pk; if (!C || !C.items || !P) return '';
    const q = String(M.q || '').trim().toLowerCase().replace(/c/g, '[ck]');
    let re = null; try { re = q ? new RegExp(q) : null; } catch (e) { re = null; }   // "homunculus" also finds "Homunkulus"
    const L = C.items.filter(i => i.kind === P.kind && (!P.grade || i.grade === P.grade) && (!P.type || mkTypeOf(i) === P.type) && (P.src !== 'buy' || i.buy) && (P.src !== 'craft' || i.craft.length)
      && (!re || re.test(i.name.toLowerCase())))
      .sort((a, b) => (GR_ORDER.indexOf(b.grade) - GR_ORDER.indexOf(a.grade)) || ((a.buy ? a.buy.price : 9e15) - (b.buy ? b.buy.price : 9e15)) || a.name.localeCompare(b.name));
    S.mkList = L;
    return `<div class="muted" style="font-size:13px;margin:4px 0">${L.length} item${L.length === 1 ? '' : 's'} — tap where it should come from</div><div class="u-doll">${L.slice(0, 150).map((i, k) => `<div class="u-tile" style="cursor:default">
        <span class="u-tl">${h(i.grade === 'NONE' ? 'no grade' : i.grade)} · ${h(TYPE_NAME[mkTypeOf(i)] || String(mkTypeOf(i)).toLowerCase())}${i.common ? ' · Common' : ''}</span>${icon(i.icon)}<span class="u-tn">${h(i.name)}</span>
        <span class="u-srcs">${i.buy && P.src !== 'craft' ? `<button data-umkbuy="${k}">Buy · ${kmb(Math.ceil(i.buy.price * 1.2))} <small>(${h(i.buy.npc)})</small></button>` : ''}${P.src !== 'buy' ? i.craft.slice(0, 3).map((c, j) => `<button data-umkcraft="${k}|${j}" class="u-s-craft">Craft · ${h(c.crafter)}${c.can ? '' : ' (materials missing)'}</button>`).join('') : ''}</span></div>`).join('')}</div>${L.length > 150 ? '<div class="muted">+' + (L.length - 150) + ' more: pick a grade / type or filter by name</div>' : ''}`;
  }
  function mkChoose(i, how, j) {
    const M = S.mk;
    if (how === 'buy') { if (!M.doer) M.doer = S.cur || ''; M.item = { id: i.id, name: i.name, icon: i.icon, src: 'shop', npc: i.buy.npc, price: i.buy.price, offer: i.buy.offer }; }
    else { const c = i.craft[j]; const was = M.doer && M.doer !== c.crafter ? M.doer : (S.cur || ''); M.doer = c.crafter; M.item = { id: i.id, name: i.name, icon: i.icon, src: 'craft', recipe: c.recipe }; if (was && was !== c.crafter) { M.give = true; M.giveTo = [was]; } }
    M.plan = null; render();
  }
  async function mkFind() {
    const M = S.mk, q = M.q.trim().toLowerCase(); if (q.length < 2 || !M.doer) return;
    if (!S.shops) { try { const sh = await call('/api/items/shops'); S.shops = [].concat(...((sh && sh.shops) || []).map(x => x.rows)).filter(r => !r.cost && r.kind); } catch (e) { S.shops = []; } }
    const out = S.shops.filter(r => r.name.toLowerCase().includes(q)).slice(0, 10).map(r => ({ id: r.id, name: r.name, icon: r.icon, src: 'shop', npc: r.npc, price: r.price, offer: r.offer }));
    try { const c = await call('/api/items/craft?name=' + encodeURIComponent(M.doer)); if (c && c.crafter) (c.recipes || []).filter(r => String(r.name || '').toLowerCase().includes(q)).slice(0, 10).forEach(r => out.push({ id: r.product, name: r.name, icon: r.icon, src: 'craft', recipe: r.list })); } catch (e) { }
    M.found = out; render();
  }
  function mkBody() { const M = S.mk; return { name: M.doer, item: { id: M.item.id, src: M.item.src, offer: M.item.offer || null, recipe: M.item.recipe || 0 }, count: M.count, enchantTo: M.to, give: M.give ? (M.giveTo && M.giveTo.length ? M.giveTo : (S.cur ? [S.cur] : [])) : [], use: S.use, overSafeOk: !!M.safe }; }
  async function loadJobs() {   // UPGQUEUE: this character's queued / running orders (also ones made earlier or on another device)
    if (S.cur) { try { const r = await call('/api/upgrade/jobs?names=' + encodeURIComponent(S.cur)); (r.jobs || []).forEach(x => { if (!S.jobs.some(j => j.id === x.id)) S.jobs.push(x); }); save(); } catch (e) { } }
    pollJobs();
  }
  async function sendJob(id, mode) {
    const j = S.jobs.find(x => x.id === id) || {};
    const txt = mode === 'cancel' ? `Cancel ${j.name || ''}'s upgrade order? Nothing has been done yet.` : mode === 'solo' ? `${j.name} goes to Giran ALONE now, upgrades, then travels back to the party.` : `${j.name}'s WHOLE party goes to Giran now, waits there while ${j.name} upgrades, then goes back to what it did.`;
    const ok = typeof uiConfirm === 'function' ? await uiConfirm({ title: mode === 'cancel' ? 'Cancel the order?' : 'Send it now?', body: txt, confirmText: mode === 'cancel' ? 'Cancel order' : 'Send now' }) : true; if (!ok) return;
    const r = await call('/api/upgrade/send', mode === 'cancel' ? { id, cancel: true } : { id, mode });
    S.msg = r.error ? r.error : r.leaderTakesParty ? `${j.name} leads the party, so the whole party goes along.` : ''; pollJobs();
  }
  function jobsHtml() {
    if (!S.jobs.length) return '';
    return `<div class="box"><h3>Upgrade orders <span class="muted">waiting for the next Giran visit · running · finished</span></h3>${S.jobs.map(j => `<div class="u-res"><b>${h(j.name)}</b> <span class="${j.state === 'done' ? 'u-ok' : j.state === 'failed' ? 'u-bad' : 'muted'}">${h(j.state || 'sent')}</span>
      <div class="muted" style="font-size:13px">${h(j.step || '')}</div>${j.state === 'queued' ? `<div class="u-chips" style="margin:4px 0"><button data-usend="${h(j.id)}|solo">Send now: just ${h(j.name)}</button><button data-usend="${h(j.id)}|party">Send now: whole party</button><button data-usend="${h(j.id)}|cancel">Cancel</button></div>` : ''}${(j.lines || []).map(l => `<div style="font-size:13px">${l.result === 'done' ? '✓' : l.result === 'failed' ? '✗' : '·'} ${h(l.name)}${l.why ? ' — ' + h(l.why) : ''}${l.result === 'done' ? (l.worn ? ' (worn)' : ' (in the bag)') : ''}</div>`).join('')}</div>`).join('')}
      <button data-uclear="1">Clear finished</button></div>`;
  }
  function render() {
    const b = $id('upBody'); if (!b) return;
    const has = Object.values(S.lines).some(L => L && L.length);
    const sy = window.scrollY;
    b.innerHTML = (S.msg ? `<div class="box">${h(S.msg)}</div>` : '') + jobsHtml() + charPickHtml() + recHtml() + dollHtml() + candHtml() + orderHtml() + (S.cur ? `<details class="box"><summary>Other item (search any item by name)</summary>${findHtml()}</details>` : '') + makeHtml()
      + (has ? `<div class="u-sticky"><button data-ucheck="1" ${S.busy ? 'disabled' : ''}>${S.busy ? 'Working…' : 'Check the plan'}</button><button data-ustart="1" ${S.busy || !S.plan ? 'disabled' : ''}>Order it${S.plan ? ' (' + S.plan.orders.filter(o => o.ok).length + ' ready)' : ''}…</button></div>` : '');
    window.scrollTo(0, sy);
    if (S.focusQ) { const i = $id('upQ'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } S.focusQ = false; }
  }
  function body() { return { orders: Object.keys(S.lines).filter(n => (S.lines[n] || []).length).map(n => ({ name: n, lines: S.lines[n].map(L => ({ item: { src: L.src, id: L.id, objId: L.objId || 0, enchant: L.enchant || 0, char: L.char || '', offer: L.offer || null }, enchantTo: Number(L.enchantTo) || 0, saId: Number(L.saId) || 0, augment: L.augment ? { stone: L.augment.stone, wanted: L.augment.wanted, max: L.augment.max } : null })) })), use: S.use, overSafeOk: S.overSafeOk }; }
  async function check() {
    S.busy = true; render();
    try { S.plan = await call('/api/upgrade/plan', body()); if (S.plan && S.plan.error) { S.msg = S.plan.error; S.plan = null; } else { S.msg = '';
      (S.plan.orders || []).forEach(o => (o.lines || []).forEach((R, i) => { const L = (S.lines[o.name] || [])[i]; if (L && R.saOptions && R.saOptions.length) L.saOpts = R.saOptions; })); save(); } } catch (e) { S.msg = e.message; }
    S.busy = false; render();
  }
  // UPGQUEUE-2026-10-25 (owner: "it should NOT go back and do it right away, it should wait until next time they reach town OR ... send 1 person OR
  // the entire team to town"): the order waits for the next Giran visit unless you pick one of the two "now" choices
  async function startAll() {
    if (!S.plan) return;
    const ready = S.plan.orders.filter(o => o.ok).map(o => o.name);
    let when = 'town';
    if (typeof uiChoice === 'function') {
      when = await uiChoice({ title: `When should ${ready.join(', ')} upgrade?`, body: 'They get, enchant and put on the items in Giran; the replaced pieces go to the collector.',
        buttons: [{ value: 'town', label: 'Next time they are in Giran (recommended)', primary: true }, { value: 'solo', label: 'Now — only ' + (ready.length === 1 ? ready[0] : 'these characters') + ' go (alone, then back to the party)' }, { value: 'party', label: 'Now — the whole party goes to Giran' }] });
      if (!when) return;
    } else if (typeof uiConfirm === 'function') { if (!(await uiConfirm({ title: `Queue ${ready.length} upgrade order(s)?`, body: `${ready.join(', ')} upgrade the next time they are in Giran (Send now is in the order list).`, confirmText: 'Queue' }))) return; }
    S.busy = true; render();
    try { const r = await call('/api/upgrade/start', Object.assign(body(), { when })); if (r.error) S.msg = r.error; else { S.msg = ((r.skipped || []).length ? 'Not started: ' + r.skipped.map(x => x.name + ' (' + x.why + ')').join(', ') + '. ' : '') + (when === 'town' ? 'Queued: it happens the next time they are in Giran.' : '') + ((r.started || []).some(x => x.leaderTakesParty) ? ' A party leader always takes his party along.' : '');
      (r.started || []).forEach(x => { S.jobs.unshift({ id: x.id, name: x.name, state: x.error ? 'failed' : x.queued ? 'queued' : 'sent', step: x.error || (x.queued ? 'waits for the next Giran visit' : '') }); delete S.lines[x.name]; }); S.plan = null; save(); } } catch (e) { S.msg = e.message; }
    S.busy = false; render(); pollJobs();
  }
  async function pollJobs() {
    if (!S.jobs.length) return;
    try { const r = await call('/api/upgrade/status?ids=' + S.jobs.map(j => j.id).join(',')); (r.jobs || []).forEach(x => { const j = S.jobs.find(y => y.id === x.id); if (j) Object.assign(j, x); }); save(); if (S.open) render(); } catch (e) { }
  }
  async function find() {
    const q = S.q.trim(); if (q.length < 2) return;
    try { if (!S.shops) { const sh = await call('/api/items/shops'); S.shops = [].concat(...((sh && sh.shops) || []).map(x => x.rows)).filter(r => !r.cost && r.kind); }
      S.found = await call('/api/items/find?q=' + encodeURIComponent(q)); } catch (e) { S.found = { error: e.message }; }
    S.pick = null; render();
  }
  function onClick(e) {
    const t = e.target.closest('button'); if (!t) return; const d = t.dataset;
    if (d.upreset) { (async () => {
      const g = ($id('upGrade') || {}).value || 'C'; S.grade = g;
      const me = S.chars.find(c => c.name === S.cur) || {}, who = d.upreset === 'party' ? S.chars.filter(c => (c.party || c.name) === (me.party || S.cur)).map(c => c.name) : [S.cur];
      const r = await call(`/api/upgrade/preset?grade=${g}&names=${encodeURIComponent(who.join(','))}`);
      if (r.error) { S.msg = r.error; render(); return; }
      const notes = [];
      (r.chars || []).forEach(c => {
        if (c.error) { notes.push(`<b>${h(c.name)}</b>: ${h(c.error)}`); return; }
        const cur = S.lines[c.name] = S.lines[c.name] || [];
        // PAPERDOLL: every preset piece takes its slot (earrings / rings: the first free of two); a piece already planned for that slot is replaced
        const taken = {}; c.lines.forEach(l => { const k = l.slot; l.idx = taken[k] || 0; taken[k] = l.idx + 1;
          const i = cur.findIndex(x => x.slot === l.slot && (x.idx || 0) === l.idx); if (i >= 0) cur.splice(i, 1, l); else cur.push(l); });
        notes.push(`<b>${h(c.name)}</b>: ${c.lines.length} piece(s) added${(c.have || []).length ? ' · keeps ' + c.have.length : ''}${(c.missing || []).length ? ' · <span class="u-bad">not available: ' + c.missing.map(h).join('; ') + '</span>' : ''}`);
      });
      S.presetNote = notes.join('<br>'); S.plan = null; save(); render(); })(); return; }
    if (d.umkk) { S.mk.pk.kind = d.umkk; S.mk.pk.grade = ''; S.mk.pk.type = ''; render(); return; }   // MAKEPICK
    if (d.umkg !== undefined && t.hasAttribute('data-umkg')) { S.mk.pk.grade = d.umkg; S.mk.pk.type = ''; render(); return; }
    if (d.umkt !== undefined && t.hasAttribute('data-umkt')) { S.mk.pk.type = d.umkt; render(); return; }
    if (d.umks !== undefined && t.hasAttribute('data-umks')) { S.mk.pk.src = d.umks; render(); return; }
    if (d.umkbuy) { const i = S.mkList[Number(d.umkbuy)]; if (i) mkChoose(i, 'buy'); return; }
    if (d.umkcraft) { const [k, j] = d.umkcraft.split('|').map(Number), i = S.mkList[k]; if (i) mkChoose(i, 'craft', j); return; }
    if (d.umkfind) { mkFind(); return; }
    if (d.umkpick) { S.mk.item = S.mk.found[Number(d.umkpick)]; S.mk.found = null; S.mk.plan = null; render(); return; }
    if (d.umkclear) { S.mk.item = null; S.mk.plan = null; render(); return; }
    if (d.umkcheck) { const n = $id('upMN'); if (n) S.mk.count = Math.max(1, Math.min(50, Number(n.value) || 1)); call('/api/upgrade/make/plan', mkBody()).then(p => { S.mk.plan = p; render(); }); return; }
    if (d.umkstart) { (async () => { const M = S.mk, ok = typeof uiConfirm === 'function' ? await uiConfirm({ title: `${M.doer}: make ${M.count}× ${M.item.name}?`, body: (M.plan.steps || []).join(' → '), confirmText: 'Start' }) : true; if (!ok) return;
      const r = await call('/api/upgrade/make/start', mkBody()); if (r.error) { S.msg = r.error; } else { S.jobs.unshift({ id: r.id, name: r.name, state: 'sent', step: `make ${M.count}× ${M.item.name}` }); S.mk = null; save(); } render(); pollJobs(); })(); return; }
    if (d.uaug) { const [n, i] = d.uaug.split('|'); augOpen(n, Number(i)); return; }
    if (d.uatype) { S.aug.type = d.uatype; augLoad().then(render); return; }
    if (d.uacancel) { S.aug = null; render(); return; }
    if (d.uaclear) { const L = S.lines[S.aug.n][S.aug.i]; delete L.augment; S.aug = null; S.plan = null; save(); render(); return; }
    if (d.uasave) { const A = S.aug, L = S.lines[A.n][A.i], st = (A.stones || []).find(s => s.id === A.stone); const mx = Number(($id('upAMax') || {}).value) || A.max || 10;
      L.augment = { stone: A.stone, stoneName: st ? st.name : 'life stone', type: A.type, wanted: [...A.sel], max: Math.max(1, Math.min(200, mx)), names: Object.fromEntries([...A.sel].map(id => [id, A.names[id] || String(id)])) };
      S.aug = null; S.plan = null; save(); render(); return; }
    if (t.hasAttribute('data-upick')) { S.pickOpen = d.upick === '1'; render(); return; }
    if (d.ucur) { S.cur = d.ucur; S.sel = new Set([d.ucur]); S.pickOpen = false; S.slot = null; S.cand = null; S.presetNote = ''; save(); loadDoll(); loadRec(); loadJobs(); return; }
    if (d.uslot) { const [sl, ix] = d.uslot.split('|'), D = S.doll, s = D && D.slots.find(x => x.slot === sl && x.idx === Number(ix)); if (!s) return; S.slot = s; S.cf = { grade: '', have: false, other: false }; loadCand(); return; }
    if (d.ucand) { const [id, k] = d.ucand.split('|').map(Number); pickCand(id, k); return; }
    if (d.ucf) { const [k, v] = d.ucf.split('|'); if (k === 'grade') S.cf.grade = v; else S.cf[k] = !S.cf[k]; render(); return; }
    if (d.ucclose) { S.slot = null; S.cand = null; render(); return; }
    if (d.uchar) { S.sel.has(d.uchar) ? S.sel.delete(d.uchar) : S.sel.add(d.uchar); save(); render(); return; }
    if (d.uparty) { const L = S.chars.filter(c => (c.party || c.name) === d.uparty), all = L.every(c => S.sel.has(c.name)); L.forEach(c => all ? S.sel.delete(c.name) : S.sel.add(c.name)); save(); render(); return; }
    if (d.ufind) { find(); return; }
    if (d.uitem) { S.pick = S._list[Number(d.uitem)]; render(); return; }
    if (d.uopt != null && d.uopt !== undefined && t.hasAttribute('data-uopt')) { if (!S.sel.size) { S.msg = 'Choose who gets it first (1).'; render(); return; } choose(Number(d.uopt)); return; }
    if (d.ucancel) { S.pick = null; render(); return; }
    if (d.udel) { const [n, i] = d.udel.split('|'); S.lines[n].splice(Number(i), 1); S.plan = null; save(); render(); return; }
    if (d.uuse) { S.use[d.uuse] = !S.use[d.uuse]; S.plan = null; save(); render(); return; }
    if (d.ucheck) { check(); return; }
    if (d.ustart) { startAll(); return; }
    if (d.usend) { const [id, mode] = d.usend.split('|'); sendJob(id, mode); return; }   // UPGQUEUE
    if (d.urec) { const [k, kind] = d.urec.split('|'), x = S.rec && S.rec.slots[Number(k)], o = x && x[kind]; if (o) addPick({ id: o.id, name: o.name, icon: o.icon, grade: o.grade }, o.src, x.slot, 0, o.name); return; }   // RECOMMEND
    if (d.uclear) { S.jobs = S.jobs.filter(j => !/^(done|failed)$/.test(j.state)); save(); render(); }
  }
  function onChange(e) {
    const t = e.target, d = t.dataset;
    if (d.uench) { const [n, i] = d.uench.split('|'); S.lines[n][Number(i)].enchantTo = Number(t.value); S.plan = null; save(); render(); return; }
    if (d.usa) { const [n, i] = d.usa.split('|'); S.lines[n][Number(i)].saId = Number(t.value); S.plan = null; save(); render(); return; }
    if (t.id === 'upSafe') { S.overSafeOk = t.checked; }
    if (d.umkdoer) { S.mk.doer = t.value; S.mk.found = null; S.mk.item = null; S.mk.plan = null; render(); return; }
    if (d.umkto) { S.mk.to = Number(t.value) || 0; S.mk.plan = null; render(); return; }
    if (t.id === 'upMGive') { S.mk.give = t.checked; S.mk.plan = null; render(); return; }
    if (t.id === 'upMSafe') { S.mk.safe = t.checked; return; }
    if (t.id === 'upMN') { S.mk.count = Math.max(1, Math.min(50, Number(t.value) || 1)); S.mk.plan = null; return; }
    if (d.uastone) { S.aug.stone = Number(t.value) || 0; S.aug.sel = new Set(); augLoad().then(render); return; }
    if (d.uaopt) { const id = Number(d.uaopt); t.checked ? S.aug.sel.add(id) : S.aug.sel.delete(id); render(); return; }
    if (t.id === 'upAMax') { S.aug.max = Number(t.value) || 10; }
  }
  function onInput(e) {
    if (e.target.id === 'upQ') { S.q = e.target.value; }
    if (e.target.id === 'upMQ' && S.mk) { S.mk.q = e.target.value; const g = document.getElementById('upMkGrid'); if (g) g.innerHTML = mkGridHtml(); }   // MAKEPICK: live filter
    if (e.target.id === 'upAQ' && S.aug) { S.aug.q = e.target.value; render(); const i = $id('upAQ'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
  }
  document.addEventListener('keydown', (e) => { if (S.open && e.key === 'Enter' && e.target && e.target.id === 'upQ') find(); });
  window.UpgradePage = { route, open, close };
})();
